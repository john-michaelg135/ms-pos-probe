"""
US-PROBE-007: Batch data pipeline — PostgreSQL → DuckDB.
Reads new sales transactions from the legacy POS database and writes them
into the DuckDB OLAP database every 10 minutes.

Key behaviors:
- READ-ONLY connection to legacy PostgreSQL (pos_db)
- Pagination: fetches 5,000 rows per batch to prevent OOM
- Watermark-based incremental sync using last_sync_timestamp stored in Redis
- Upsert logic to handle duplicates gracefully
- Denormalizes Order + OrderItem + Product + Variation + Location into flat rows
"""

import uuid
import structlog
import psycopg2
import psycopg2.extras
import pandas as pd
from datetime import datetime, timezone
from time import perf_counter

from app.config.settings import get_settings
from app.services.database import get_duckdb, get_redis

logger = structlog.get_logger()

BATCH_SIZE = 5000
WATERMARK_KEY = "pos_probe:last_sync_timestamp"


def _get_watermark() -> str:
    """Get the last sync timestamp from Redis. Returns epoch if no prior sync."""
    try:
        redis_client = get_redis()
        watermark = redis_client.get(WATERMARK_KEY)
        if watermark:
            return watermark
    except Exception as e:
        logger.warning("redis_watermark_read_failed", error=str(e))

    # Default: sync everything from the beginning of time
    return "2000-01-01T00:00:00+00:00"


def _set_watermark(timestamp: str) -> None:
    """Save the last sync timestamp to Redis after successful insertion."""
    try:
        redis_client = get_redis()
        redis_client.set(WATERMARK_KEY, timestamp)
    except Exception as e:
        logger.warning("redis_watermark_write_failed", error=str(e))


def _fetch_batch(cursor, watermark: str, offset: int) -> list[dict]:
    """
    Fetch a batch of denormalized sales data from the legacy PostgreSQL.
    Joins Orders + OrderItems + ProductVariations + Products + Locations.
    """
    query = """
        SELECT
            CONCAT(oi."ItemId", '-', o."OrderId")   AS transaction_id,
            o."OrderId"::TEXT                       AS order_id,
            o."OrderSource"                         AS order_source,
            o."LocationId"                          AS location_id,
            l."LocationName"                        AS location_name,
            p."ProductId"                           AS product_id,
            p."ProductName"                         AS product_name,
            pv."VariationId"                        AS variation_id,
            pv."VariationName"                      AS variation_name,
            oi."Quantity"                           AS quantity,
            oi."UnitPrice"                          AS unit_price,
            oi."Subtotal"                           AS total_amount,
            CASE
                WHEN o."SeniorPwdId" IS NOT NULL AND o."SeniorPwdId" != '' THEN 'Senior/PWD'
                ELSE NULL
            END                                     AS discount_type,
            CASE
                WHEN o."SeniorPwdId" IS NOT NULL AND o."SeniorPwdId" != ''
                THEN ROUND(oi."Subtotal" * 0.20, 2)
                ELSE 0
            END                                     AS discount_amount,
            FALSE                                   AS is_refund,
            NULL                                    AS refund_reason,
            o."SubmittedBy"::TEXT                   AS cashier_id,
            NULL                                    AS cashier_name,
            o."CustomerId"::TEXT                    AS customer_id,
            o."CreatedAt"                           AS transaction_date
        FROM "Orders" o
        INNER JOIN "OrderItems" oi ON oi."OrderId" = o."OrderId"
        INNER JOIN "ProductVariations" pv ON pv."VariationId" = oi."VariationId"
        INNER JOIN "Products" p ON p."ProductId" = pv."ProductId"
        LEFT JOIN "Locations" l ON l."LocationId" = o."LocationId"
        WHERE o."UpdatedAt" > %(watermark)s
          AND o."OrderStatus" NOT IN ('Cancelled', 'Rejected')
        ORDER BY o."UpdatedAt" ASC
        LIMIT %(limit)s OFFSET %(offset)s
    """

    cursor.execute(query, {
        "watermark": watermark,
        "limit": BATCH_SIZE,
        "offset": offset,
    })

    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    return [dict(zip(columns, row)) for row in rows]


def _fetch_refund_batch(cursor, watermark: str, offset: int) -> list[dict]:
    """
    Fetch approved refunds as negative transactions for the analytics DB.
    """
    query = """
        SELECT
            CONCAT('REF-', rr."RefundRequestId")    AS transaction_id,
            rr."OrderId"::TEXT                      AS order_id,
            'POS'                                   AS order_source,
            rr."LocationId"                         AS location_id,
            l."LocationName"                        AS location_name,
            p."ProductId"                           AS product_id,
            p."ProductName"                         AS product_name,
            pv."VariationId"                        AS variation_id,
            pv."VariationName"                      AS variation_name,
            rr."QuantityToReturn"                   AS quantity,
            pp."Price"                              AS unit_price,
            ROUND(rr."QuantityToReturn" * pp."Price", 2) AS total_amount,
            NULL                                    AS discount_type,
            0                                       AS discount_amount,
            TRUE                                    AS is_refund,
            rr."Reason"                             AS refund_reason,
            rr."RequestedBy"::TEXT                  AS cashier_id,
            NULL                                    AS cashier_name,
            NULL                                    AS customer_id,
            rr."ApprovedAt"                         AS transaction_date
        FROM "RefundRequests" rr
        INNER JOIN "ProductVariations" pv ON pv."VariationId" = rr."VariationId"
        INNER JOIN "Products" p ON p."ProductId" = pv."ProductId"
        LEFT JOIN "Locations" l ON l."LocationId" = rr."LocationId"
        LEFT JOIN LATERAL (
            SELECT "Price" FROM "ProductPrices"
            WHERE "VariationId" = rr."VariationId" AND "IsActive" = TRUE
            LIMIT 1
        ) pp ON TRUE
        WHERE rr."Status" = 'Approved'
          AND rr."ApprovedAt" > %(watermark)s
        ORDER BY rr."ApprovedAt" ASC
        LIMIT %(limit)s OFFSET %(offset)s
    """

    cursor.execute(query, {
        "watermark": watermark,
        "limit": BATCH_SIZE,
        "offset": offset,
    })

    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    return [dict(zip(columns, row)) for row in rows]


def _upsert_to_duckdb(df: pd.DataFrame) -> int:
    """
    Upsert rows into DuckDB sales_transactions.
    Uses INSERT OR REPLACE to handle duplicate transaction_ids.
    """
    if df.empty:
        return 0

    conn = get_duckdb()

    # Register the DataFrame as a temporary view
    conn.register("_sync_batch", df)

    conn.execute("""
        INSERT OR REPLACE INTO sales_transactions
        SELECT * FROM _sync_batch
    """)

    conn.unregister("_sync_batch")
    return len(df)


async def run_sync_pipeline() -> dict:
    """
    Execute the full sync pipeline.
    Returns sync statistics for logging and the manual force-sync endpoint.
    """
    settings = get_settings()
    start_time = perf_counter()
    total_rows = 0
    batch_count = 0

    watermark = _get_watermark()
    new_watermark = datetime.now(timezone.utc).isoformat()

    logger.info("sync_pipeline_started", watermark=watermark)

    try:
        # Connect to legacy PostgreSQL (READ-ONLY)
        pg_conn = psycopg2.connect(settings.postgres_dsn)
        pg_conn.set_session(readonly=True)
        cursor = pg_conn.cursor()

        # ── Sync Orders + OrderItems ──
        offset = 0
        while True:
            batch = _fetch_batch(cursor, watermark, offset)
            if not batch:
                break

            df = pd.DataFrame(batch)
            rows_inserted = _upsert_to_duckdb(df)
            total_rows += rows_inserted
            batch_count += 1
            offset += BATCH_SIZE

            logger.debug("sync_batch_processed", batch=batch_count, rows=rows_inserted, type="orders")

        # ── Sync Approved Refunds ──
        offset = 0
        while True:
            batch = _fetch_refund_batch(cursor, watermark, offset)
            if not batch:
                break

            df = pd.DataFrame(batch)
            rows_inserted = _upsert_to_duckdb(df)
            total_rows += rows_inserted
            batch_count += 1
            offset += BATCH_SIZE

            logger.debug("sync_batch_processed", batch=batch_count, rows=rows_inserted, type="refunds")

        cursor.close()
        pg_conn.close()

        # Only update watermark AFTER successful insertion (exactly-once semantics)
        _set_watermark(new_watermark)

        duration = perf_counter() - start_time

        logger.info(
            "sync_pipeline_completed",
            total_rows=total_rows,
            batch_count=batch_count,
            duration_seconds=round(duration, 2),
        )

        return {
            "total_rows_synced": total_rows,
            "batch_count": batch_count,
            "sync_duration_seconds": round(duration, 2),
            "last_sync_timestamp": new_watermark,
        }

    except psycopg2.OperationalError as e:
        duration = perf_counter() - start_time
        logger.error("sync_pipeline_pg_connection_failed", error=str(e), duration=round(duration, 2))
        return {
            "total_rows_synced": 0,
            "batch_count": 0,
            "sync_duration_seconds": round(duration, 2),
            "last_sync_timestamp": watermark,
            "error": f"PostgreSQL connection failed: {str(e)}",
        }
    except Exception as e:
        duration = perf_counter() - start_time
        logger.error("sync_pipeline_failed", error=str(e), duration=round(duration, 2))
        return {
            "total_rows_synced": total_rows,
            "batch_count": batch_count,
            "sync_duration_seconds": round(duration, 2),
            "last_sync_timestamp": watermark,
            "error": str(e),
        }
