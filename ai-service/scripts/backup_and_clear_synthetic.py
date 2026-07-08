"""Backup the DB then remove synthetic data, keeping only real POS data."""
import duckdb
import shutil
from pathlib import Path

db_path = Path("./data/analytics.duckdb")
backup_path = Path("./data/analytics_backup_with_synthetic.duckdb")

# Backup
shutil.copy2(db_path, backup_path)
print(f"✅ Backup created: {backup_path}")

# Remove synthetic data
conn = duckdb.connect(str(db_path))
before = conn.execute("SELECT COUNT(*) FROM sales_transactions").fetchone()[0]
conn.execute("DELETE FROM sales_transactions WHERE transaction_id LIKE 'SYN-%'")
after = conn.execute("SELECT COUNT(*) FROM sales_transactions").fetchone()[0]
conn.close()

print(f"   Before: {before} rows")
print(f"   Removed: {before - after} synthetic rows")
print(f"   Remaining: {after} real POS rows")
print(f"\n   To restore synthetic data later, copy the backup file back.")
