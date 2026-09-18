"""
US-PROBE-004: DuckDB schema definitions.
Creates the denormalized sales_transactions table and anomaly_alerts table.
"""

import duckdb


def init_schema(conn: duckdb.DuckDBPyConnection) -> None:
    """
    Initialize the DuckDB OLAP schema.
    Safe to call multiple times (uses CREATE TABLE IF NOT EXISTS).
    """

    # Denormalized sales transactions table for analytics & ML training
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sales_transactions (
            transaction_id      VARCHAR PRIMARY KEY,
            order_id            VARCHAR NOT NULL,
            order_source        VARCHAR NOT NULL,          -- 'POS' or 'Ecommerce'
            location_id         INTEGER,
            location_name       VARCHAR,
            product_id          INTEGER NOT NULL,
            product_name        VARCHAR NOT NULL,
            variation_id        INTEGER,
            variation_name      VARCHAR,
            quantity            INTEGER NOT NULL,
            unit_price          DECIMAL(12, 2) NOT NULL,
            total_amount        DECIMAL(12, 2) NOT NULL,
            discount_type       VARCHAR,                   -- 'Senior', 'PWD', 'Manual', NULL
            discount_amount     DECIMAL(12, 2) DEFAULT 0,
            is_refund           BOOLEAN DEFAULT FALSE,
            refund_reason       VARCHAR,
            cashier_id          VARCHAR,
            cashier_name        VARCHAR,
            customer_id         VARCHAR,
            transaction_date    TIMESTAMP NOT NULL,
            synced_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Anomaly detection results table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS anomaly_alerts (
            alert_id            VARCHAR PRIMARY KEY,
            order_id            VARCHAR NOT NULL,
            transaction_amount  DECIMAL(12, 2) NOT NULL,
            anomaly_score       DOUBLE NOT NULL,
            risk_level          VARCHAR NOT NULL,          -- 'Low', 'Medium', 'High'
            reason              VARCHAR NOT NULL,
            cashier_id          VARCHAR,
            cashier_name        VARCHAR,
            location_id         INTEGER,
            location_name       VARCHAR,
            detected_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status              VARCHAR DEFAULT 'New'      -- 'New', 'Reviewed', 'Dismissed'
        )
    """)

    # Index for common query patterns
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_sales_date
        ON sales_transactions (transaction_date)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_sales_location
        ON sales_transactions (location_id)
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_alerts_status
        ON anomaly_alerts (status, detected_at)
    """)
