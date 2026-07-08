"""Reset DuckDB to empty and clear Redis forecast cache."""
import duckdb
import redis
import os
from pathlib import Path

DB_PATH = Path("./data/analytics.duckdb")

# Clear DuckDB
print("Clearing DuckDB...")
conn = duckdb.connect(str(DB_PATH))
conn.execute("DELETE FROM sales_transactions")
conn.execute("DELETE FROM anomaly_alerts")
sales = conn.execute("SELECT COUNT(*) FROM sales_transactions").fetchone()[0]
alerts = conn.execute("SELECT COUNT(*) FROM anomaly_alerts").fetchone()[0]
conn.close()
print(f"  sales_transactions: {sales} rows")
print(f"  anomaly_alerts: {alerts} rows")

# Clear Redis cache
print("\nClearing Redis forecast cache...")
try:
    r = redis.Redis(host="localhost", port=6379)
    keys = r.keys("forecast:*")
    if keys:
        r.delete(*keys)
        print(f"  Deleted {len(keys)} cached forecast keys")
    else:
        print("  No forecast cache keys found")
    
    # Clear sync watermark so next sync pulls everything fresh
    r.delete("pos_probe:last_sync_timestamp")
    print("  Cleared sync watermark")
except Exception as e:
    print(f"  Redis error: {e}")

print("\n✅ Clean slate. Restart the AI service and click Sync Now to pull fresh data.")
