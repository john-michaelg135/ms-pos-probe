"""Quick test: connect to legacy PostgreSQL and check data."""
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    dbname="pos_db",
    user="postgres",
    password="admin54321",
)
conn.set_session(readonly=True)
cur = conn.cursor()

tables = [
    ("Orders", 'SELECT COUNT(*) FROM "Orders"'),
    ("OrderItems", 'SELECT COUNT(*) FROM "OrderItems"'),
    ("Products", 'SELECT COUNT(*) FROM "Products"'),
    ("ProductVariations", 'SELECT COUNT(*) FROM "ProductVariations"'),
    ("Locations", 'SELECT COUNT(*) FROM "Locations"'),
    ("RefundRequests", 'SELECT COUNT(*) FROM "RefundRequests"'),
]

print("=" * 40)
print("Legacy PostgreSQL (pos_db) Connection Test")
print("=" * 40)

for name, query in tables:
    try:
        cur.execute(query)
        count = cur.fetchone()[0]
        print(f"  {name}: {count} rows")
    except Exception as e:
        print(f"  {name}: ERROR - {e}")
        conn.rollback()

# Sample a recent order
cur.execute("""
    SELECT "OrderId", "OrderNumber", "OrderSource", "OrderStatus", "TotalAmount", "CreatedAt"
    FROM "Orders"
    ORDER BY "CreatedAt" DESC
    LIMIT 3
""")
print("\nMost recent orders:")
for row in cur.fetchall():
    print(f"  #{row[1]} | {row[2]} | {row[3]} | ₱{row[4]} | {row[5]}")

cur.close()
conn.close()
print("\n✅ Connection successful!")
