"""
US-PROBE-013: Synthetic Dataset Generator
Produces 12 months of realistic daily sales transaction data for ML training.

Features:
- Poisson distribution for order frequencies (not rigid patterns)
- Gaussian noise for amounts
- Weekday/weekend demand differences
- Philippine holiday spikes
- Random bazaar event surges
- Missing days (zero sales) to replicate real-world inconsistencies
- All real product variations in realistic proportions
"""

import uuid
import random
import numpy as np
import pandas as pd
import duckdb
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Seed for reproducibility ──
np.random.seed(42)
random.seed(42)

# ── Configuration ──
START_DATE = datetime(2025, 7, 1)
END_DATE = datetime(2026, 7, 7)
DUCKDB_PATH = Path(__file__).parent.parent / "data" / "analytics.duckdb"

# ── Product catalog (matching Bren Raphael's Ube Halaya & Jam Company) ──
PRODUCTS = [
    {"product_id": 1, "product_name": "Ube Halaya", "variations": [
        {"variation_id": 1, "variation_name": "Smooth 200g", "base_price": 120.00, "demand_weight": 0.8},
        {"variation_id": 2, "variation_name": "Smooth 250g", "base_price": 150.00, "demand_weight": 1.2},
        {"variation_id": 3, "variation_name": "Smooth 500g", "base_price": 280.00, "demand_weight": 0.6},
        {"variation_id": 4, "variation_name": "Tidbits 200g", "base_price": 130.00, "demand_weight": 0.7},
        {"variation_id": 5, "variation_name": "Tidbits 250g", "base_price": 160.00, "demand_weight": 1.0},
        {"variation_id": 6, "variation_name": "Tidbits 500g", "base_price": 290.00, "demand_weight": 0.5},
    ]},
    {"product_id": 2, "product_name": "Ube Jam", "variations": [
        {"variation_id": 7, "variation_name": "Smooth 200g", "base_price": 100.00, "demand_weight": 0.9},
        {"variation_id": 8, "variation_name": "Smooth 250g", "base_price": 130.00, "demand_weight": 1.1},
        {"variation_id": 9, "variation_name": "Smooth 500g", "base_price": 240.00, "demand_weight": 0.5},
        {"variation_id": 10, "variation_name": "Tidbits 200g", "base_price": 110.00, "demand_weight": 0.8},
        {"variation_id": 11, "variation_name": "Tidbits 250g", "base_price": 140.00, "demand_weight": 1.0},
        {"variation_id": 12, "variation_name": "Tidbits 500g", "base_price": 250.00, "demand_weight": 0.4},
    ]},
]

# ── Locations ──
LOCATIONS = [
    {"location_id": 1, "location_name": "Main Store - Quezon City", "type": "Store", "traffic_weight": 1.5},
    {"location_id": 2, "location_name": "Branch - Marikina", "type": "Store", "traffic_weight": 1.0},
    {"location_id": 3, "location_name": "Branch - Antipolo", "type": "Store", "traffic_weight": 0.8},
    {"location_id": 4, "location_name": "Weekend Bazaar - Eastwood", "type": "Bazaar", "traffic_weight": 0.0},  # only weekends
    {"location_id": 5, "location_name": "Pop-up Bazaar - BGC", "type": "Bazaar", "traffic_weight": 0.0},  # random events
]

# ── Philippine holidays that spike demand ──
PH_HOLIDAYS = [
    datetime(2025, 8, 21),   # Ninoy Aquino Day
    datetime(2025, 8, 25),   # National Heroes Day
    datetime(2025, 11, 1),   # All Saints' Day
    datetime(2025, 11, 30),  # Bonifacio Day
    datetime(2025, 12, 24),  # Christmas Eve
    datetime(2025, 12, 25),  # Christmas Day
    datetime(2025, 12, 30),  # Rizal Day
    datetime(2025, 12, 31),  # New Year's Eve
    datetime(2026, 1, 1),    # New Year's Day
    datetime(2026, 2, 14),   # Valentine's Day (not official but high demand)
    datetime(2026, 4, 9),    # Araw ng Kagitingan
    datetime(2026, 5, 1),    # Labor Day
    datetime(2026, 5, 11),   # Mother's Day
    datetime(2026, 6, 12),   # Independence Day
]

# ── Cashier pool ──
CASHIERS = [
    {"id": "1", "name": "Maria Santos"},
    {"id": "2", "name": "Juan Dela Cruz"},
    {"id": "3", "name": "Ana Reyes"},
    {"id": "4", "name": "Pedro Garcia"},
    {"id": "5", "name": "Rosa Mendoza"},
]


def is_holiday(date: datetime) -> bool:
    return any(h.date() == date.date() for h in PH_HOLIDAYS)


def is_near_holiday(date: datetime, days_before: int = 3) -> bool:
    for h in PH_HOLIDAYS:
        diff = (h.date() - date.date()).days
        if 0 < diff <= days_before:
            return True
    return False


def is_weekend(date: datetime) -> bool:
    return date.weekday() >= 5  # Saturday=5, Sunday=6


def generate_bazaar_events(start: datetime, end: datetime) -> set:
    """Generate random bazaar event dates (about 2-3 per month on weekends)."""
    events = set()
    current = start
    while current <= end:
        if current.weekday() >= 5:  # weekends only
            if random.random() < 0.25:  # ~25% of weekends have a bazaar
                events.add(current.date())
        current += timedelta(days=1)
    return events


def get_daily_demand_multiplier(date: datetime, bazaar_events: set) -> float:
    """Calculate a demand multiplier based on day characteristics."""
    multiplier = 1.0

    # Weekend boost (30-60% more)
    if is_weekend(date):
        multiplier *= np.random.uniform(1.3, 1.6)

    # Holiday spike (2-3x)
    if is_holiday(date):
        multiplier *= np.random.uniform(2.0, 3.0)
    elif is_near_holiday(date):
        multiplier *= np.random.uniform(1.3, 1.8)

    # Bazaar day spike
    if date.date() in bazaar_events:
        multiplier *= np.random.uniform(1.5, 2.5)

    # Monthly patterns: slight peak at month-end (payday)
    if date.day >= 28 or date.day <= 2:
        multiplier *= np.random.uniform(1.1, 1.3)

    # Seasonal: December has highest demand
    if date.month == 12:
        multiplier *= 1.5
    elif date.month in [11, 1, 2]:  # Nov, Jan, Feb slightly elevated
        multiplier *= 1.2

    # Random daily noise
    multiplier *= np.random.uniform(0.85, 1.15)

    return multiplier


def generate_transactions() -> list[dict]:
    """Generate the full synthetic dataset."""
    transactions = []
    bazaar_events = generate_bazaar_events(START_DATE, END_DATE)

    # Track missing days (~5% of days have zero sales for some locations)
    missing_days_per_location = {
        loc["location_id"]: set() for loc in LOCATIONS
    }
    current = START_DATE
    while current <= END_DATE:
        for loc in LOCATIONS:
            if random.random() < 0.05:  # 5% chance of no sales
                missing_days_per_location[loc["location_id"]].add(current.date())
        current += timedelta(days=1)

    current = START_DATE
    order_counter = 1000

    while current <= END_DATE:
        demand_mult = get_daily_demand_multiplier(current, bazaar_events)

        for loc in LOCATIONS:
            # Skip missing days
            if current.date() in missing_days_per_location[loc["location_id"]]:
                continue

            # Bazaar locations only operate on bazaar event days
            if loc["type"] == "Bazaar":
                if current.date() not in bazaar_events:
                    continue
                loc_mult = np.random.uniform(1.2, 2.0)
            else:
                loc_mult = loc["traffic_weight"]

            # Base orders per day per location (Poisson distribution)
            base_orders = max(1, int(np.random.poisson(lam=5 * loc_mult * demand_mult)))

            for _ in range(base_orders):
                order_counter += 1
                order_id = str(order_counter)

                # Determine order source
                if loc["type"] == "Bazaar":
                    order_source = "POS"
                else:
                    order_source = random.choices(["POS", "Ecommerce"], weights=[0.75, 0.25])[0]

                # Pick cashier
                cashier = random.choice(CASHIERS)

                # Pick items (1-4 items per order)
                num_items = random.choices([1, 2, 3, 4], weights=[0.4, 0.35, 0.15, 0.1])[0]

                # Weighted random selection of variations
                all_variations = []
                for p in PRODUCTS:
                    for v in p["variations"]:
                        all_variations.append({**v, "product_id": p["product_id"], "product_name": p["product_name"]})

                weights = [v["demand_weight"] for v in all_variations]
                selected_variations = random.choices(all_variations, weights=weights, k=num_items)

                # Determine discount
                has_discount = random.random() < 0.08  # 8% of orders have Senior/PWD discount
                discount_type = "Senior/PWD" if has_discount else None

                for var in selected_variations:
                    quantity = random.choices([1, 2, 3, 4, 5], weights=[0.5, 0.3, 0.1, 0.07, 0.03])[0]
                    unit_price = var["base_price"] * np.random.uniform(0.95, 1.05)  # slight price variation
                    total_amount = round(unit_price * quantity, 2)
                    discount_amount = round(total_amount * 0.20, 2) if has_discount else 0

                    # Random transaction time during business hours (8am-9pm)
                    hour = random.choices(
                        list(range(8, 21)),
                        weights=[2, 3, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2]
                    )[0]
                    minute = random.randint(0, 59)
                    tx_time = current.replace(hour=hour, minute=minute, second=random.randint(0, 59))

                    transactions.append({
                        "transaction_id": f"SYN-{uuid.uuid4().hex[:12]}",
                        "order_id": order_id,
                        "order_source": order_source,
                        "location_id": loc["location_id"],
                        "location_name": loc["location_name"],
                        "product_id": var["product_id"],
                        "product_name": var["product_name"],
                        "variation_id": var["variation_id"],
                        "variation_name": var["variation_name"],
                        "quantity": quantity,
                        "unit_price": round(unit_price, 2),
                        "total_amount": total_amount,
                        "discount_type": discount_type,
                        "discount_amount": discount_amount,
                        "is_refund": False,
                        "refund_reason": None,
                        "cashier_id": cashier["id"],
                        "cashier_name": cashier["name"],
                        "customer_id": None,
                        "transaction_date": tx_time,
                        "synced_at": datetime.now(timezone.utc),
                    })

        current += timedelta(days=1)

    return transactions


def insert_into_duckdb(transactions: list[dict]) -> int:
    """Bulk-insert transactions into DuckDB."""
    DUCKDB_PATH.parent.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame(transactions)
    conn = duckdb.connect(str(DUCKDB_PATH))

    # Ensure schema exists
    from app.schemas.database import init_schema
    init_schema(conn)

    # Clear existing synthetic data and insert fresh
    conn.execute("DELETE FROM sales_transactions WHERE transaction_id LIKE 'SYN-%'")

    conn.register("_synthetic_data", df)
    conn.execute("INSERT INTO sales_transactions SELECT * FROM _synthetic_data")
    conn.unregister("_synthetic_data")

    count = conn.execute("SELECT COUNT(*) FROM sales_transactions").fetchone()[0]
    conn.close()

    return count


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))

    print("=" * 60)
    print("US-PROBE-013: Synthetic Data Generator")
    print("=" * 60)
    print(f"Generating data from {START_DATE.date()} to {END_DATE.date()}...")
    print(f"Products: {sum(len(p['variations']) for p in PRODUCTS)} variations")
    print(f"Locations: {len(LOCATIONS)}")
    print()

    transactions = generate_transactions()
    print(f"Generated {len(transactions):,} transaction records")

    # Stats
    df = pd.DataFrame(transactions)
    print(f"\n── Dataset Statistics ──")
    print(f"Date range: {df['transaction_date'].min().date()} to {df['transaction_date'].max().date()}")
    print(f"Total days: {(END_DATE - START_DATE).days}")
    print(f"Unique orders: {df['order_id'].nunique():,}")
    print(f"POS transactions: {len(df[df['order_source'] == 'POS']):,}")
    print(f"Ecommerce transactions: {len(df[df['order_source'] == 'Ecommerce']):,}")
    print(f"Discounted transactions: {len(df[df['discount_type'].notna()]):,}")
    print(f"\nRevenue by location:")
    for _, row in df.groupby("location_name")["total_amount"].sum().sort_values(ascending=False).items():
        print(f"  {_}: ₱{row:,.2f}")
    print(f"\nQuantity by product variation:")
    for _, row in df.groupby(["product_name", "variation_name"])["quantity"].sum().sort_values(ascending=False).head(6).items():
        print(f"  {_[0]} {_[1]}: {row:,} units")

    print(f"\nInserting into DuckDB at {DUCKDB_PATH}...")
    total = insert_into_duckdb(transactions)
    print(f"✅ Done! Total records in DuckDB: {total:,}")
