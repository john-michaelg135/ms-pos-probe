"""
US-PROBE-017: On-demand anomaly check for a single transaction.

Production checks run automatically after every data sync (app/services/anomaly_engine.py),
on orders and refunds already saved in the POS database. This endpoint scores one payload
with the same per-channel Isolation Forest, for manual checks and the dev script
scripts/insert_test_alerts.py. hour_of_day is Philippine time.
"""

import json
import uuid
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.services.auth import verify_token
from app.services.database import get_duckdb
from app.services.anomaly_engine import (
    SEGMENT_LABEL, add_model_columns, ensure_alert_columns, load_models, score_with_models, segment_of,
)

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])


class TransactionPayload(BaseModel):
    """A transaction to evaluate."""
    order_id: str
    total_amount: float
    quantity: int
    discount_amount: float = 0.0
    discount_type: str | None = None
    hour_of_day: int
    day_of_week: int
    is_refund: bool = False
    # Store, Bazaar, Institutional or Online; each is judged against its own channel.
    order_type: str | None = None
    order_source: str | None = None
    cashier_id: str | None = None
    cashier_name: str | None = None
    location_id: int | None = None
    location_name: str | None = None


class AnomalyResponse(BaseModel):
    is_anomaly: bool
    anomaly_score: float
    risk_level: str  # Low, Medium, High
    reason: str
    alert_id: str | None = None


def load_iforest_model():
    """Latest per-channel model artifact (None if only the old single model exists)."""
    return load_models()


@router.post("/detect", response_model=AnomalyResponse)
async def detect_anomaly(
    payload: TransactionPayload,
    request: Request,
    token: dict = Depends(verify_token),
):
    models = load_models()
    request.app.state.iforest_artifacts = models
    segment = segment_of(payload.order_type, payload.order_source)

    if models is None or segment not in models["segments"]:
        return AnomalyResponse(
            is_anomaly=False,
            anomaly_score=0.0,
            risk_level="Low",
            reason=f"No trained model for {SEGMENT_LABEL[segment]} orders yet",
        )

    row = add_model_columns(pd.DataFrame([{
        "segment": segment,
        "total_amount": payload.total_amount,
        "units": payload.quantity,
        "has_discount": bool(payload.discount_type) or payload.discount_amount > 0,
        "hour": payload.hour_of_day,
    }]))
    score, flag = score_with_models(row, models).get(0, (0.0, None))

    if not flag:
        return AnomalyResponse(
            is_anomaly=False,
            anomaly_score=round(score, 4),
            risk_level="Low",
            reason=f"Within the normal pattern for {SEGMENT_LABEL[segment]} orders",
        )

    reason = f"Unusual combination of amount, units, price per unit, discount and time for a {SEGMENT_LABEL[segment]} order"
    if payload.is_refund:
        reason = f"Refund: {reason}"
    alert_id = f"ALT-{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    alert_data = {
        "alert_id": alert_id,
        "order_id": payload.order_id,
        "transaction_amount": payload.total_amount,
        "anomaly_score": round(score, 4),
        "risk_level": flag,
        "reason": reason,
        "cashier_id": payload.cashier_id,
        "cashier_name": payload.cashier_name,
        "location_id": payload.location_id,
        "location_name": payload.location_name,
        "detected_at": now.isoformat(),
        "status": "New",
    }

    try:
        conn = get_duckdb()
        ensure_alert_columns(conn)
        conn.execute(
            """
            INSERT INTO anomaly_alerts (alert_id, order_id, transaction_amount, anomaly_score, risk_level, reason,
                                        cashier_id, cashier_name, location_id, location_name, detected_at, status,
                                        order_type, alert_kind, dedup_key, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, 'manual', ?, ?)
            """,
            [
                alert_id, payload.order_id, payload.total_amount, score, flag, reason,
                payload.cashier_id, payload.cashier_name, payload.location_id, payload.location_name,
                now.replace(tzinfo=None), segment, f"manual:{alert_id}",
                json.dumps({"explanation": [
                    f"This is a {SEGMENT_LABEL[segment]} transaction, so it was compared only with other {SEGMENT_LABEL[segment]} orders.",
                    f"Why it was flagged: {reason}.",
                    "A flag means the transaction needs a second look; it is not proof of wrongdoing.",
                ], "codes": ["model-outlier"]}),
            ],
        )
    except Exception:
        pass  # Don't fail the response if the DuckDB write fails

    try:
        import asyncio
        from app.routers.alerts import broadcast_alert
        asyncio.create_task(broadcast_alert(alert_data))
    except Exception:
        pass

    return AnomalyResponse(
        is_anomaly=True,
        anomaly_score=round(score, 4),
        risk_level=flag,
        reason=reason,
        alert_id=alert_id,
    )
