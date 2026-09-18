"""
DEV ONLY: Insert 5 synthetic anomaly alerts with varying risk levels
for testing the Anomaly Alerts page on the dashboard.

Sends transactions through the running AI service's /anomaly/detect endpoint
so they get properly evaluated and stored. Requires the ai-service to be running.

Usage:
    python scripts/insert_test_alerts.py
"""

import sys
import requests
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent

# Get auth token from the running system
API_URL = "http://localhost:8000"


def get_token():
    """Get a valid JWT token. Tries localStorage approach or uses a test token."""
    # For dev, we'll try to hit the endpoint directly without auth first,
    # or use a known test token. Adjust as needed for your setup.
    try:
        # Try to get token from the legacy auth system
        resp = requests.post(
            "http://localhost:5001/api/auth/login",
            json={"email": "admin@brenraphael.com", "password": "admin123"},
            timeout=5,
        )
        if resp.status_code == 200:
            return resp.json().get("token") or resp.json().get("access_token")
    except Exception:
        pass

    # Fallback: try without token (if auth is disabled in dev)
    return None


def send_suspicious_transaction(payload: dict, token: str | None) -> dict:
    """Send a transaction to the anomaly detection endpoint."""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    resp = requests.post(
        f"{API_URL}/anomaly/detect",
        json=payload,
        headers=headers,
        timeout=10,
    )
    return resp.json() if resp.status_code == 200 else {"error": resp.status_code, "detail": resp.text}


def main():
    print("=" * 60)
    print("Inserting 5 suspicious transactions via /anomaly/detect")
    print("=" * 60)

    token = get_token()
    if token:
        print(f"Auth token obtained ✅")
    else:
        print("No auth token — trying without authentication")

    # These transactions are designed to trigger the Isolation Forest:
    # - Very high amounts (>3 std from the mean of ~100-200 per normal txn)
    # - Refunds at unusual hours
    # - High quantities (>5)
    # - Discounts on high-value orders
    transactions = [
        {
            "order_id": "ORD-20260806-FAKE001",
            "total_amount": 2850.00,
            "quantity": 12,
            "discount_amount": 0.0,
            "discount_type": None,
            "hour_of_day": 23,
            "day_of_week": 3,
            "is_refund": True,
            "cashier_id": "CSH-003",
            "cashier_name": "Maria Santos",
            "location_id": 1,
            "location_name": "Main Branch - Quezon City",
        },
        {
            "order_id": "ORD-20260806-FAKE002",
            "total_amount": 1500.00,
            "quantity": 8,
            "discount_amount": 200.0,
            "discount_type": "employee_discount",
            "hour_of_day": 14,
            "day_of_week": 2,
            "is_refund": False,
            "cashier_id": "CSH-001",
            "cashier_name": "Juan Dela Cruz",
            "location_id": 1,
            "location_name": "Main Branch - Quezon City",
        },
        {
            "order_id": "ORD-20260805-FAKE003",
            "total_amount": 750.00,
            "quantity": 3,
            "discount_amount": 0.0,
            "discount_type": None,
            "hour_of_day": 5,
            "day_of_week": 0,
            "is_refund": True,
            "cashier_id": "CSH-002",
            "cashier_name": "Ana Reyes",
            "location_id": 2,
            "location_name": "SM City Fairview Kiosk",
        },
        {
            "order_id": "ORD-20260805-FAKE004",
            "total_amount": 980.00,
            "quantity": 10,
            "discount_amount": 150.0,
            "discount_type": "promo",
            "hour_of_day": 21,
            "day_of_week": 5,
            "is_refund": False,
            "cashier_id": "CSH-001",
            "cashier_name": "Juan Dela Cruz",
            "location_id": 1,
            "location_name": "Main Branch - Quezon City",
        },
        {
            "order_id": "ORD-20260804-FAKE005",
            "total_amount": 3200.00,
            "quantity": 15,
            "discount_amount": 500.0,
            "discount_type": "manager_override",
            "hour_of_day": 22,
            "day_of_week": 6,
            "is_refund": True,
            "cashier_id": "CSH-003",
            "cashier_name": "Maria Santos",
            "location_id": 2,
            "location_name": "SM City Fairview Kiosk",
        },
    ]

    print()
    results = []
    for i, txn in enumerate(transactions, 1):
        print(f"[{i}/5] Sending: {txn['order_id']} (₱{txn['total_amount']:.2f})...", end=" ")
        result = send_suspicious_transaction(txn, token)

        if "error" in result:
            print(f"❌ HTTP {result['error']}")
            print(f"     {result.get('detail', '')[:100]}")
        else:
            is_anomaly = result.get("is_anomaly", False)
            risk = result.get("risk_level", "?")
            score = result.get("anomaly_score", 0)
            if is_anomaly:
                print(f"🚨 ANOMALY | Risk: {risk} | Score: {score}")
            else:
                print(f"✅ Normal | Score: {score}")
        results.append(result)

    print()
    anomalies = [r for r in results if r.get("is_anomaly")]
    print(f"{'=' * 60}")
    print(f"Results: {len(anomalies)}/{len(transactions)} flagged as anomalies")
    print(f"{'=' * 60}")

    if not anomalies:
        print()
        print("⚠️  None were flagged. This can happen if:")
        print("   1. The Isolation Forest model isn't trained yet (run train_dev.py)")
        print("   2. The model's contamination is too low for the current data distribution")
        print("   3. The service isn't running on port 8000")


if __name__ == "__main__":
    main()
