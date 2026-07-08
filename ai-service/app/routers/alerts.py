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
