"""
Seed Script: Generate 5000 OrderItems for the Legacy POS Database
=================================================================
Produces realistic INSERT statements for the "Orders" and "OrderItems" tables
in the legacy PostgreSQL database. Includes ~5-8% anomalous transactions that
should trigger the Isolation Forest anomaly detector.

Anomaly types injected:
1. Unusually high quantities (10-50 units in a single line item)
2. Suspicious discount abuse (Senior/PWD discount on bulk orders)
3. Late-night transactions (11pm-4am — outside normal business hours)
4. Price manipulation (unit price significantly below catalog price)
5. Rapid-fire orders (same cashier, many orders within minutes)
6. Unusually large order totals (> ₱5,000 single item)

Usage:
    python scripts/seed_legacy_orderitems.py > seed_data.sql
    -- or pipe directly into psql:
    python scripts/seed_legacy_orderitems.py | psql -U postgres -d pos_db
"""

import random
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# ── Seed for reproducibility ──
np.random.seed(2026)
random.seed(2026)

# ── Configuration ──
TARGET_ORDER_ITEMS = 5000
START_DATE = datetime(2026, 6, 1)
END_DATE = datetime(2026, 8, 7)
ORDER_ID_START = 50000  # High offset to avoid collision with existing orders
ITEM_ID_START = 100000  # High offset to avoid collision with existing items

# ── Product catalog (must match existing ProductVariations in legacy DB) ──
# Actual data from pos_db:
#   VariationId 3 = UBH-SM-250|Pouch|250g (ProductId 3, Ube Halaya Smooth) @ ₱199
#   VariationId 4 = UBH-TB-250|Pouch|250g (ProductId 4, Ube Halaya Tidbits) @ ₱199
#   VariationId 5 = UJM-SM-300|Jar|300g   (ProductId 5, Ube Jam Smooth) @ ₱299
#   VariationId 6 = UJM-TB-500|Jar|500g   (ProductId 6, Ube Jam Tidbits) @ ₱449
VARIATIONS = [
    {"variation_id": 3, "product_id": 3, "name": "Ube Halaya Smooth 250g Pouch", "base_price": 199.00},
    {"variation_id": 4, "product_id": 4, "name": "Ube Halaya Tidbits 250g Pouch", "base_price": 199.00},
    {"variation_id": 5, "product_id": 5, "name": "Ube Jam Smooth 300g Jar", "base_price": 299.00},
    {"variation_id": 6, "product_id": 6, "name": "Ube Jam Tidbits 500g Jar", "base_price": 449.00},
]

VARIATION_WEIGHTS = [1.2, 1.0, 0.9, 0.7]

# ── Locations (actual from pos_db) ──
LOCATIONS = [
    {"location_id": 1, "name": "Antipolo Store Branch", "weight": 1.5},
    {"location_id": 2, "name": "Taytay Store Branch", "weight": 1.2},
    {"location_id": 3, "name": "SM City Taytay Bazaar", "weight": 0.8},
    {"location_id": 4, "name": "SM Center Angono Bazaar", "weight": 0.6},
    {"location_id": 5, "name": "SM City Fairview Bazaar", "weight": 0.5},
    {"location_id": 6, "name": "Ayala Malls Arca South Bazaar", "weight": 0.4},
    {"location_id": 7, "name": "Estancia Capitol Commons Bazaar", "weight": 0.3},
    {"location_id": 8, "name": "TriNoma Bazaar", "weight": 0.4},
]

# ── Cashiers (SubmittedBy user IDs) ──
CASHIER_IDS = [1, 2, 3, 4, 5]

# ── Anomaly configuration ──
ANOMALY_RATE = 0.06  # ~6% of orders will be anomalous


def random_timestamp(start: datetime, end: datetime, normal_hours=True) -> datetime:
    """Generate a random timestamp, optionally constrained to business hours."""
    delta = end - start
    random_seconds = random.randint(0, int(delta.total_seconds()))
    dt = start + timedelta(seconds=random_seconds)

    if normal_hours:
        # Business hours: 8am-9pm
        hour = random.choices(
            list(range(8, 21)),
            weights=[2, 3, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2]
        )[0]
        dt = dt.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59))

    return dt


def generate_anomaly_timestamp(start: datetime, end: datetime) -> datetime:
    """Generate a late-night timestamp (11pm-4am) — anomalous hours."""
    delta = end - start
    random_seconds = random.randint(0, int(delta.total_seconds()))
    dt = start + timedelta(seconds=random_seconds)
    hour = random.choice([23, 0, 1, 2, 3, 4])
    dt = dt.replace(hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59))
    return dt


def pick_variation():
    """Weighted random variation selection."""
    return random.choices(VARIATIONS, weights=VARIATION_WEIGHTS, k=1)[0]


def pick_location():
    """Weighted random location selection."""
    weights = [loc["weight"] for loc in LOCATIONS]
    return random.choices(LOCATIONS, weights=weights, k=1)[0]


def generate_normal_order(order_id: int, item_id_counter: int, timestamp: datetime):
    """Generate a normal, realistic order with 1-4 items."""
    location = pick_location()
    cashier_id = random.choice(CASHIER_IDS)
    num_items = random.choices([1, 2, 3, 4], weights=[0.4, 0.35, 0.15, 0.1])[0]

    order_source = random.choices(["POS", "Ecommerce"], weights=[0.75, 0.25])[0]
    has_discount = random.random() < 0.08
    senior_pwd_id = f"PWD-{random.randint(1000, 9999)}" if has_discount else None

    items = []
    total_amount = 0

    for i in range(num_items):
        var = pick_variation()
        quantity = random.choices([1, 2, 3], weights=[0.6, 0.3, 0.1])[0]
        unit_price = round(var["base_price"] * np.random.uniform(0.98, 1.02), 2)
        subtotal = round(unit_price * quantity, 2)

        if has_discount:
            subtotal = round(subtotal * 0.80, 2)  # 20% discount

        total_amount += subtotal

        items.append({
            "item_id": item_id_counter + i,
            "order_id": order_id,
            "variation_id": var["variation_id"],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "created_at": timestamp,
        })

    order = {
        "order_id": order_id,
        "order_number": f"ORD-{order_id}",
        "location_id": location["location_id"],
        "order_type": "Store",
        "order_source": order_source,
        "senior_pwd_id": senior_pwd_id,
        "payment_method": random.choices(["Cash", "GCash"], weights=[0.7, 0.3])[0],
        "payment_status": "Paid",
        "order_status": "Completed",
        "total_amount": round(total_amount, 2),
        "submitted_by": cashier_id,
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    return order, items


def generate_anomaly_order(order_id: int, item_id_counter: int, anomaly_type: str):
    """Generate an anomalous order based on the specified type."""
    location = pick_location()
    cashier_id = random.choice(CASHIER_IDS)

    if anomaly_type == "high_quantity":
        # Anomaly: Unusually high quantity (10-50 units)
        timestamp = random_timestamp(START_DATE, END_DATE)
        var = pick_variation()
        quantity = random.randint(10, 50)
        unit_price = var["base_price"]
        subtotal = round(unit_price * quantity, 2)

        items = [{
            "item_id": item_id_counter,
            "order_id": order_id,
            "variation_id": var["variation_id"],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "created_at": timestamp,
        }]

    elif anomaly_type == "discount_abuse":
        # Anomaly: Senior/PWD discount on suspiciously large orders
        timestamp = random_timestamp(START_DATE, END_DATE)
        num_items = random.randint(4, 8)
        items = []
        subtotal_sum = 0

        for i in range(num_items):
            var = pick_variation()
            quantity = random.randint(3, 10)
            unit_price = var["base_price"]
            subtotal = round(unit_price * quantity * 0.80, 2)  # 20% discount
            subtotal_sum += subtotal
            items.append({
                "item_id": item_id_counter + i,
                "order_id": order_id,
                "variation_id": var["variation_id"],
                "quantity": quantity,
                "unit_price": unit_price,
                "subtotal": subtotal,
                "created_at": timestamp,
            })

        order = {
            "order_id": order_id,
            "order_number": f"ORD-{order_id}",
            "location_id": location["location_id"],
            "order_type": "Store",
            "order_source": "POS",
            "senior_pwd_id": f"PWD-{random.randint(1000, 9999)}",
            "payment_method": "Cash",
            "payment_status": "Paid",
            "order_status": "Completed",
            "total_amount": round(subtotal_sum, 2),
            "submitted_by": cashier_id,
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        return order, items

    elif anomaly_type == "late_night":
        # Anomaly: Transaction at unusual hours (11pm-4am)
        timestamp = generate_anomaly_timestamp(START_DATE, END_DATE)
        var = pick_variation()
        quantity = random.randint(1, 5)
        unit_price = var["base_price"]
        subtotal = round(unit_price * quantity, 2)

        items = [{
            "item_id": item_id_counter,
            "order_id": order_id,
            "variation_id": var["variation_id"],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "created_at": timestamp,
        }]

    elif anomaly_type == "price_manipulation":
        # Anomaly: Unit price significantly below catalog (possible employee theft)
        timestamp = random_timestamp(START_DATE, END_DATE)
        var = pick_variation()
        quantity = random.randint(2, 6)
        # 40-70% below normal price
        unit_price = round(var["base_price"] * np.random.uniform(0.30, 0.60), 2)
        subtotal = round(unit_price * quantity, 2)

        items = [{
            "item_id": item_id_counter,
            "order_id": order_id,
            "variation_id": var["variation_id"],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "created_at": timestamp,
        }]

    elif anomaly_type == "large_total":
        # Anomaly: Unreasonably large single-item transaction (> ₱5000)
        timestamp = random_timestamp(START_DATE, END_DATE)
        var = random.choice([v for v in VARIATIONS if v["base_price"] >= 240])
        quantity = random.randint(20, 40)
        unit_price = var["base_price"]
        subtotal = round(unit_price * quantity, 2)

        items = [{
            "item_id": item_id_counter,
            "order_id": order_id,
            "variation_id": var["variation_id"],
            "quantity": quantity,
            "unit_price": unit_price,
            "subtotal": subtotal,
            "created_at": timestamp,
        }]

    else:
        # Fallback: normal
        return generate_normal_order(order_id, item_id_counter, random_timestamp(START_DATE, END_DATE))

    total_amount = sum(it["subtotal"] for it in items)

    order = {
        "order_id": order_id,
        "order_number": f"ORD-{order_id}",
        "location_id": location["location_id"],
        "order_type": "Store",
        "order_source": "POS",
        "senior_pwd_id": None,
        "payment_method": random.choices(["Cash", "GCash"], weights=[0.6, 0.4])[0],
        "payment_status": "Paid",
        "order_status": "Completed",
        "total_amount": round(total_amount, 2),
        "submitted_by": cashier_id,
        "created_at": items[0]["created_at"],
        "updated_at": items[0]["created_at"],
    }

    return order, items


def format_timestamp(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S+08")


def sql_str(val) -> str:
    """Format a value for SQL insertion."""
    if val is None:
        return "NULL"
    if isinstance(val, str):
        return f"'{val.replace(chr(39), chr(39)+chr(39))}'"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, datetime):
        return f"'{format_timestamp(val)}'"
    return str(val)


def generate_all():
    """Main generation loop."""
    orders = []
    all_items = []

    order_id = ORDER_ID_START
    item_id = ITEM_ID_START
    anomaly_types = ["high_quantity", "discount_abuse", "late_night", "price_manipulation", "large_total"]

    while len(all_items) < TARGET_ORDER_ITEMS:
        is_anomaly = random.random() < ANOMALY_RATE

        if is_anomaly:
            anomaly_type = random.choice(anomaly_types)
            order, items = generate_anomaly_order(order_id, item_id, anomaly_type)
        else:
            timestamp = random_timestamp(START_DATE, END_DATE)
            order, items = generate_normal_order(order_id, item_id, timestamp)

        orders.append(order)
        all_items.extend(items)
        order_id += 1
        item_id += len(items)

    # Trim to exactly 5000 items
    all_items = all_items[:TARGET_ORDER_ITEMS]

    # Collect only orders that have items in the final set
    used_order_ids = set(it["order_id"] for it in all_items)
    orders = [o for o in orders if o["order_id"] in used_order_ids]

    return orders, all_items


def emit_sql(orders, items):
    """Output SQL INSERT statements."""
    lines = []
    lines.append("-- ============================================================")
    lines.append("-- Seed Data: 5000 OrderItems for Legacy POS Database Testing")
    lines.append("-- Generated for POS-Probe sync pipeline validation")
    lines.append(f"-- Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"-- Orders: {len(orders)}")
    lines.append(f"-- OrderItems: {len(items)}")
    lines.append("-- Anomaly rate: ~6% of orders")
    lines.append("-- ============================================================")
    lines.append("")
    lines.append("BEGIN;")
    lines.append("")

    # ── INSERT Orders ──
    lines.append("-- Orders")
    lines.append('INSERT INTO "Orders" (')
    lines.append('    "OrderId", "OrderNumber", "LocationId", "OrderType", "OrderSource",')
    lines.append('    "SeniorPwdId", "PaymentMethod", "PaymentStatus", "OrderStatus",')
    lines.append('    "TotalAmount", "SubmittedBy", "CreatedAt", "UpdatedAt"')
    lines.append(") VALUES")

    order_values = []
    for o in orders:
        vals = (
            f"({o['order_id']}, {sql_str(o['order_number'])}, {o['location_id']}, "
            f"{sql_str(o['order_type'])}, {sql_str(o['order_source'])}, "
            f"{sql_str(o['senior_pwd_id'])}, {sql_str(o['payment_method'])}, "
            f"{sql_str(o['payment_status'])}, {sql_str(o['order_status'])}, "
            f"{o['total_amount']}, {o['submitted_by']}, "
            f"{sql_str(o['created_at'])}, {sql_str(o['updated_at'])})"
        )
        order_values.append(vals)

    # Batch into chunks of 100 for readability
    for i in range(0, len(order_values), 100):
        chunk = order_values[i:i+100]
        if i > 0:
            lines.append(";")
            lines.append('INSERT INTO "Orders" (')
            lines.append('    "OrderId", "OrderNumber", "LocationId", "OrderType", "OrderSource",')
            lines.append('    "SeniorPwdId", "PaymentMethod", "PaymentStatus", "OrderStatus",')
            lines.append('    "TotalAmount", "SubmittedBy", "CreatedAt", "UpdatedAt"')
            lines.append(") VALUES")
        lines.append(",\n".join(chunk))

    lines.append(";")
    lines.append("")

    # ── INSERT OrderItems ──
    lines.append("-- OrderItems")
    lines.append('INSERT INTO "OrderItems" (')
    lines.append('    "ItemId", "OrderId", "VariationId", "Quantity", "UnitPrice", "Subtotal", "CreatedAt"')
    lines.append(") VALUES")

    item_values = []
    for it in items:
        vals = (
            f"({it['item_id']}, {it['order_id']}, {it['variation_id']}, "
            f"{it['quantity']}, {it['unit_price']}, {it['subtotal']}, "
            f"{sql_str(it['created_at'])})"
        )
        item_values.append(vals)

    for i in range(0, len(item_values), 100):
        chunk = item_values[i:i+100]
        if i > 0:
            lines.append(";")
            lines.append('INSERT INTO "OrderItems" (')
            lines.append('    "ItemId", "OrderId", "VariationId", "Quantity", "UnitPrice", "Subtotal", "CreatedAt"')
            lines.append(") VALUES")
        lines.append(",\n".join(chunk))

    lines.append(";")
    lines.append("")
    lines.append("COMMIT;")

    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    import io

    # Force UTF-8 output to handle peso sign and other unicode
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

    print("Generating 5000 OrderItems with anomalies...", file=sys.stderr)

    orders, items = generate_all()

    # Stats
    anomaly_items = [it for it in items if it["quantity"] >= 10 or it["unit_price"] < 120]
    print(f"  Orders generated: {len(orders)}", file=sys.stderr)
    print(f"  OrderItems generated: {len(items)}", file=sys.stderr)
    print(f"  Likely anomalous items: ~{len(anomaly_items)}", file=sys.stderr)
    print(f"  Date range: {START_DATE.date()} to {END_DATE.date()}", file=sys.stderr)
    print(f"  Order ID range: {ORDER_ID_START} to {orders[-1]['order_id']}", file=sys.stderr)
    print(f"  Item ID range: {ITEM_ID_START} to {items[-1]['item_id']}", file=sys.stderr)
    print("", file=sys.stderr)

    # Output SQL to stdout
    sql = emit_sql(orders, items)
    print(sql)

    print("Done! Pipe output to psql or save as .sql file.", file=sys.stderr)
