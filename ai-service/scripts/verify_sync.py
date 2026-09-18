"""Verify synced data in DuckDB."""
import duckdb

conn = duckdb.connect("./data/analytics.duckdb", read_only=True)

total = conn.execute("SELECT COUNT(*) FROM sales_transactions").fetchone()[0]
synthetic = conn.execute("SELECT COUNT(*) FROM sales_transactions WHERE transaction_id LIKE 'SYN-%'").fetchone()[0]
real = total - synthetic

print(f"Total rows in DuckDB: {total}")
print(f"  Synthetic: {synthetic}")
print(f"  Real (from legacy POS): {real}")
print()

print("Real POS data samples:")
rows = conn.execute("""
    SELECT order_id, product_name, variation_name, quantity, total_amount, location_name, transaction_date
    FROM sales_transactions 
    WHERE transaction_id NOT LIKE 'SYN-%'
    ORDER BY transaction_date DESC
    LIMIT 10
""").fetchall()

for r in rows:
    print(f"  Order {r[0]}: {r[1]} {r[2]} x{r[3]} = P{r[4]} @ {r[5]} ({r[6]})")

conn.close()
