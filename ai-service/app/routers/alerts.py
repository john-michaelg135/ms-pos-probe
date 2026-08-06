"""
US-PROBE-025/026: WebSocket alerts + Alert history endpoints.
- WebSocket for real-time anomaly push notifications
- GET /alerts for paginated alert history with filters
- PUT /alerts/{alert_id}/status to update review status
"""

import json
import asyncio
import structlog
from datetime import datetime, timezone
from typing import Set

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel

from app.services.auth import verify_token
from app.services.database import get_duckdb

logger = structlog.get_logger()

router = APIRouter(prefix="/alerts", tags=["Alerts"])

# ── WebSocket connection manager ──
_connected_clients: Set[WebSocket] = set()


async def broadcast_alert(alert_data: dict):
    """Broadcast an anomaly alert to all connected WebSocket clients."""
    if not _connected_clients:
        return

    message = json.dumps(alert_data)
    disconnected = set()

    for ws in _connected_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)

    # Clean up dead connections
    _connected_clients.difference_update(disconnected)


@router.websocket("/ws")
async def websocket_alerts(websocket: WebSocket):
    """
    US-PROBE-025: WebSocket endpoint for real-time anomaly alerts.
    Clients connect to ws://localhost:5020/api/probe/alerts/ws
    (proxied through YARP gateway).
    Implements ping/pong keep-alive.
    """
    await websocket.accept()
    _connected_clients.add(websocket)
    logger.info("ws_client_connected", total_clients=len(_connected_clients))

    try:
        while True:
            # Keep-alive: wait for client pings or messages
            data = await websocket.receive_text()
            # Client can send "ping" to keep connection alive
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.debug("ws_client_error", error=str(e))
    finally:
        _connected_clients.discard(websocket)
        logger.info("ws_client_disconnected", total_clients=len(_connected_clients))


# ── REST Endpoints ──

@router.get("")
async def get_alerts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    cashier_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
    location_name: str | None = Query(default=None),
    token: dict = Depends(verify_token),
):
    """
    US-PROBE-026: Paginated list of all anomaly alerts with optional filters.
    Sorted by detected_at descending (newest first).
    """
    conn = get_duckdb()

    # Build WHERE clauses
    conditions = []
    params = []

    if date_from:
        conditions.append("detected_at >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("detected_at <= ?")
        params.append(date_to + " 23:59:59")
    if risk_level and risk_level != "All":
        conditions.append("risk_level = ?")
        params.append(risk_level)
    if cashier_id:
        conditions.append("cashier_id = ?")
        params.append(cashier_id)
    if status and status != "All":
        conditions.append("status = ?")
        params.append(status)
    if location_name and location_name != "All":
        conditions.append("location_name = ?")
        params.append(location_name)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    # Count total
    count_query = f"SELECT COUNT(*) FROM anomaly_alerts {where_clause}"
    total = conn.execute(count_query, params).fetchone()[0]

    # Fetch page
    offset = (page - 1) * page_size
    data_query = f"""
        SELECT alert_id, order_id, transaction_amount, anomaly_score,
               risk_level, reason, cashier_id, cashier_name,
               location_id, location_name, detected_at, status
        FROM anomaly_alerts
        {where_clause}
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
    """
    rows = conn.execute(data_query, params + [page_size, offset]).fetchall()

    columns = [
        "alert_id", "order_id", "transaction_amount", "anomaly_score",
        "risk_level", "reason", "cashier_id", "cashier_name",
        "location_id", "location_name", "detected_at", "status"
    ]

    alerts = []
    for row in rows:
        alert = dict(zip(columns, row))
        # Convert datetime to ISO string
        if alert["detected_at"]:
            alert["detected_at"] = str(alert["detected_at"])
        alerts.append(alert)

    return {
        "alerts": alerts,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


class StatusUpdate(BaseModel):
    status: str  # "Reviewed" or "Dismissed"


@router.put("/{alert_id}/status")
async def update_alert_status(
    alert_id: str,
    body: StatusUpdate,
    token: dict = Depends(verify_token),
):
    """
    US-PROBE-026: Update the review status of an anomaly alert.
    Valid statuses: "New", "Reviewed", "Dismissed"
    """
    if body.status not in ("New", "Reviewed", "Dismissed"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be New, Reviewed, or Dismissed.")

    conn = get_duckdb()

    # Check if alert exists
    existing = conn.execute("SELECT alert_id FROM anomaly_alerts WHERE alert_id = ?", [alert_id]).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found.")

    conn.execute(
        "UPDATE anomaly_alerts SET status = ? WHERE alert_id = ?",
        [body.status, alert_id]
    )

    return {"alert_id": alert_id, "status": body.status, "updated": True}


@router.get("/{alert_id}/explain")
async def explain_alert(
    alert_id: str,
    token: dict = Depends(verify_token),
):
    """
    AI-generated explanation of why a transaction was flagged as anomalous.
    Compares against historical transaction patterns from DuckDB.
    """
    conn = get_duckdb()

    # Fetch the alert
    alert_row = conn.execute("""
        SELECT alert_id, order_id, transaction_amount, anomaly_score,
               risk_level, reason, cashier_id, cashier_name,
               location_id, location_name, detected_at
        FROM anomaly_alerts WHERE alert_id = ?
    """, [alert_id]).fetchone()

    if not alert_row:
        raise HTTPException(status_code=404, detail="Alert not found.")

    columns = ["alert_id", "order_id", "transaction_amount", "anomaly_score",
               "risk_level", "reason", "cashier_id", "cashier_name",
               "location_id", "location_name", "detected_at"]
    alert = dict(zip(columns, alert_row))

    # Gather historical statistics for context
    try:
        stats = conn.execute("""
            SELECT
                ROUND(AVG(total_amount), 2) AS avg_amount,
                ROUND(STDDEV(total_amount), 2) AS std_amount,
                MAX(total_amount) AS max_amount,
                ROUND(AVG(quantity), 1) AS avg_quantity,
                MAX(quantity) AS max_quantity,
                COUNT(*) AS total_transactions,
                ROUND(AVG(discount_amount), 2) AS avg_discount
            FROM sales_transactions
            WHERE is_refund = FALSE
        """).fetchone()
    except Exception:
        stats = None

    # Gather hourly distribution
    try:
        hour_stats = conn.execute("""
            SELECT
                EXTRACT(HOUR FROM transaction_date) AS hour,
                COUNT(*) AS count
            FROM sales_transactions
            WHERE is_refund = FALSE
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 3
        """).fetchall()
    except Exception:
        hour_stats = []

    # Gather cashier stats if applicable
    cashier_context = ""
    if alert["cashier_id"]:
        try:
            cashier_stats = conn.execute("""
                SELECT COUNT(*) as total_alerts, AVG(transaction_amount) as avg_amount
                FROM anomaly_alerts WHERE cashier_id = ?
            """, [alert["cashier_id"]]).fetchone()
            if cashier_stats and cashier_stats[0] and cashier_stats[0] > 1:
                cashier_context = (
                    f"This cashier ({alert['cashier_name'] or alert['cashier_id']}) has "
                    f"{int(cashier_stats[0])} total flagged transactions with an average flagged amount of "
                    f"₱{float(cashier_stats[1]):,.2f}. This pattern may warrant further investigation."
                )
        except Exception:
            pass

    # Build explanation
    amount = float(alert["transaction_amount"])
    score = float(alert["anomaly_score"])
    reasons = alert["reason"].split("; ") if alert["reason"] else []

    explanation_parts = []

    # Amount analysis
    if stats and stats[0] is not None:
        avg_amt = float(stats[0])
        std_amt = float(stats[1]) if stats[1] else 1.0
        max_amt = float(stats[2]) if stats[2] else avg_amt
        avg_qty = float(stats[3]) if stats[3] else 0.0
        total_txn = int(stats[5]) if stats[5] else 0
        deviation = (amount - avg_amt) / std_amt if std_amt > 0 else 0

        explanation_parts.append(
            f"This transaction of ₱{amount:,.2f} is {abs(deviation):.1f} standard deviations "
            f"{'above' if deviation > 0 else 'below'} the average transaction amount of ₱{avg_amt:,.2f}. "
            f"Normal transactions in the system range from ₱0 to ₱{max_amt:,.2f}, "
            f"with most falling within ₱{max(0, avg_amt - std_amt):,.2f} to ₱{avg_amt + std_amt:,.2f}."
        )
    else:
        avg_amt = 0.0
        std_amt = 1.0
        avg_qty = 0.0
        total_txn = 0

    # Timing analysis
    if hour_stats:
        peak_hours = [f"{int(h[0])}:00" for h in hour_stats[:3]]
        explanation_parts.append(
            f"The most common transaction hours are {', '.join(peak_hours)}. "
            f"Transactions outside these peak hours are statistically unusual and "
            f"may indicate after-hours activity that warrants review."
        )

    # Anomaly score context
    if score < -0.3:
        explanation_parts.append(
            f"The anomaly score of {score:.4f} indicates a highly unusual pattern. "
            f"The Isolation Forest model places this transaction in the extreme tail of "
            f"the distribution, meaning it differs significantly from the learned normal behavior."
        )
    elif score < -0.1:
        explanation_parts.append(
            f"The anomaly score of {score:.4f} indicates a moderately unusual pattern. "
            f"The transaction deviates from typical behavior but is not in the extreme tail."
        )
    else:
        explanation_parts.append(
            f"The anomaly score of {score:.4f} is near the decision boundary. "
            f"While flagged, this transaction is only marginally outside normal parameters."
        )

    # Cashier context
    if cashier_context:
        explanation_parts.append(cashier_context)

    # Pattern summary
    if stats and stats[0] is not None:
        pattern_summary = (
            f"The Isolation Forest model was trained on {total_txn} historical transactions "
            f"and learned the normal purchasing patterns including typical amounts (avg ₱{avg_amt:,.2f}), "
            f"quantities (avg {avg_qty:.1f} units), and time-of-day distributions. "
            f"This transaction was flagged because it deviates from these learned patterns in the following ways: "
            f"{'; '.join(reasons)}."
        )
    else:
        pattern_summary = "Insufficient historical data for detailed pattern comparison."

    return {
        "alert_id": alert_id,
        "explanation": "\n\n".join(explanation_parts),
        "pattern_summary": pattern_summary,
        "historical_context": {
            "avg_transaction_amount": float(stats[0]) if stats and stats[0] is not None else None,
            "std_transaction_amount": float(stats[1]) if stats and stats[1] is not None else None,
            "avg_quantity": float(stats[3]) if stats and stats[3] is not None else None,
            "total_transactions_analyzed": int(stats[5]) if stats and stats[5] is not None else None,
            "peak_hours": [int(h[0]) for h in hour_stats] if hour_stats else [],
        },
        "risk_factors": reasons,
        "cashier_context": cashier_context or None,
    }
