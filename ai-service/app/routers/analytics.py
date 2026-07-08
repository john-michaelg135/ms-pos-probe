"""
US-PROBE-019: Analytics query endpoints.
Provides aggregated sales data from DuckDB for the dashboard charts.
"""

from fastapi import APIRouter, Depends, Query
from datetime import date, timedelta

from app.services.auth import verify_token
from app.services.database import get_duckdb

router = APIRouter(prefix="/analytics", tags=["Analytics"])


@router.get("/revenue")
async def get_revenue(
    group_by: str = Query("day", regex="^(day|week|month)$"),
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    location_id: int | None = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Revenue over time grouped by day, week, or month."""
    conn = get_duckdb()

    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    # Build period expression based on group_by
    period_expr = {
        "day": "CAST(transaction_date AS DATE)",
        "week": "DATE_TRUNC('week', transaction_date)::DATE",
        "month": "DATE_TRUNC('month', transaction_date)::DATE",
    }[group_by]

    location_filter = "AND location_id = ?" if location_id else ""
    params = [str(date_from), str(date_to)]
    if location_id:
        params.append(location_id)

    query = f"""
        SELECT
            {period_expr} AS period,
            ROUND(SUM(total_amount - discount_amount), 2) AS total_revenue,
            COUNT(DISTINCT order_id) AS total_orders,
            SUM(quantity) AS total_quantity
        FROM sales_transactions
        WHERE transaction_date >= ?
          AND transaction_date <= ?
          AND is_refund = FALSE
          {location_filter}
        GROUP BY period
        ORDER BY period ASC
    """

    result = conn.execute(query, params).fetchall()
    columns = ["period", "total_revenue", "total_orders", "total_quantity"]

    return [dict(zip(columns, row)) for row in result]


@router.get("/sales-by-location")
async def get_sales_by_location(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Total revenue and quantity grouped by location."""
    conn = get_duckdb()

    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    query = """
        SELECT
            location_name,
            ROUND(SUM(total_amount - discount_amount), 2) AS total_revenue,
            SUM(quantity) AS total_quantity
        FROM sales_transactions
        WHERE transaction_date >= ?
          AND transaction_date <= ?
          AND is_refund = FALSE
          AND location_name IS NOT NULL
        GROUP BY location_name
        ORDER BY total_revenue DESC
    """

    result = conn.execute(query, [str(date_from), str(date_to)]).fetchall()
    columns = ["location_name", "total_revenue", "total_quantity"]

    return [dict(zip(columns, row)) for row in result]


@router.get("/sales-by-product")
async def get_sales_by_product(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Total revenue and quantity grouped by product and variation."""
    conn = get_duckdb()

    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    query = """
        SELECT
            product_name,
            variation_name,
            ROUND(SUM(total_amount - discount_amount), 2) AS total_revenue,
            SUM(quantity) AS total_quantity
        FROM sales_transactions
        WHERE transaction_date >= ?
          AND transaction_date <= ?
          AND is_refund = FALSE
        GROUP BY product_name, variation_name
        ORDER BY total_quantity DESC
    """

    result = conn.execute(query, [str(date_from), str(date_to)]).fetchall()
    columns = ["product_name", "variation_name", "total_revenue", "total_quantity"]

    return [dict(zip(columns, row)) for row in result]


@router.get("/sales-by-channel")
async def get_sales_by_channel(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Revenue split between POS and Ecommerce channels."""
    conn = get_duckdb()

    if not date_from:
        date_from = date.today() - timedelta(days=30)
    if not date_to:
        date_to = date.today()

    query = """
        SELECT
            order_source,
            ROUND(SUM(total_amount - discount_amount), 2) AS total_revenue,
            SUM(quantity) AS total_quantity
        FROM sales_transactions
        WHERE transaction_date >= ?
          AND transaction_date <= ?
          AND is_refund = FALSE
        GROUP BY order_source
        ORDER BY total_revenue DESC
    """

    result = conn.execute(query, [str(date_from), str(date_to)]).fetchall()
    columns = ["order_source", "total_revenue", "total_quantity"]

    return [dict(zip(columns, row)) for row in result]
