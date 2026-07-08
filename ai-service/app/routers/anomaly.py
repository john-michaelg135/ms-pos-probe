"""
US-PROBE-017: Anomaly Detection Endpoint.
Accepts a transaction payload and returns whether it's normal or anomalous.
Model loaded ONCE at startup into app.state (Singleton pattern).
"""

import uuid
import pickle
import numpy as np
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.services.auth import verify_token
from app.services.database import get_duckdb

router = APIRouter(prefix="/anomaly", tags=["Anomaly Detection"])

MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "artifacts"


class TransactionPayload(BaseModel):
    """Pydantic schema for incoming transaction to evaluate."""
    order_id: str
    total_amount: float
    quantity: int
    discount_amount: float = 0.0
    discount_type: str | None = None
    hour_of_day: int
    day_of_week: int
    is_refund: bool = False
    cashier_id: str | None = None
    cashier_name: str | None = None
    location_id: int | None = None
    location_name: str | None = None


class AnomalyResponse(BaseModel):
    """Response schema for anomaly detection."""
    is_anomaly: bool
    anomaly_score: float
    risk_level: str  # Low, Medium, High
    reason: str
    alert_id: str | None = None


def load_iforest_model():
    """Load the latest Isolation Forest model artifacts."""
    pattern = "iforest_*.pkl"
    model_files = sorted(MODELS_DIR.glob(pattern), reverse=True)
    if not model_files:
        return None
    with open(model_files[0], "rb") as f:
        return pickle.load(f)


def _determine_risk_level(score: float) -> str:
    """Map anomaly score to risk level."""
    if score < -0.3:
        return "High"
    elif score < -0.1:
        return "Medium"
    else:
        return "Low"


def _determine_reason(payload: TransactionPayload, score: float) -> str:
    """Generate a human-readable reason for the anomaly flag."""
    reasons = []

    if payload.total_amount > 500:
        reasons.append(f"High transaction amount (₱{payload.total_amount:.2f})")
    if payload.is_refund:
        reasons.append("Refund transaction")
    if payload.hour_of_day < 9 or payload.hour_of_day > 20:
        reasons.append(f"Unusual transaction hour ({payload.hour_of_day}:00)")
    if payload.quantity > 5:
        reasons.append(f"High quantity ({payload.quantity} units)")
    if payload.discount_amount > 0 and payload.total_amount > 300:
        reasons.append("Discount on high-value order")

    if not reasons:
        reasons.append("Statistical outlier detected by Isolation Forest")

    return "; ".join(reasons)


@router.post("/detect", response_model=AnomalyResponse)
async def detect_anomaly(
    payload: TransactionPayload,
    request: Request,
    token: dict = Depends(verify_token),
):
    """
    Evaluate a transaction for anomalies using the Isolation Forest model.
    Model is loaded at startup and stored in app.state for <100ms inference.
    """
    # Load model from app.state (set during startup)
    artifacts = getattr(request.app.state, "iforest_artifacts", None)

    if artifacts is None:
        # Lazy load if not yet in app.state
        artifacts = load_iforest_model()
        if artifacts is None:
            return AnomalyResponse(
                is_anomaly=False,
                anomaly_score=0.0,
                risk_level="Low",
                reason="Model not available",
            )
        request.app.state.iforest_artifacts = artifacts

    model = artifacts["model"]
    scaler = artifacts["scaler"]

    # Engineer features (same as training)
    hour = float(payload.hour_of_day)
    dow = float(payload.day_of_week)

    features = np.array([[
        float(payload.total_amount),
        float(payload.quantity),
        float(payload.discount_amount),
        np.sin(2 * np.pi * hour / 24),  # hour_sin
        np.cos(2 * np.pi * hour / 24),  # hour_cos
        np.sin(2 * np.pi * dow / 7),    # dow_sin
        np.cos(2 * np.pi * dow / 7),    # dow_cos
        1.0 if payload.discount_type else 0.0,  # has_discount
        1.0 if payload.is_refund else 0.0,      # is_refund
    ]])

    # Scale and predict
    X = scaler.transform(features)
    prediction = model.predict(X)[0]  # 1 = normal, -1 = anomaly
    score = model.decision_function(X)[0]

    is_anomaly = prediction == -1
    risk_level = _determine_risk_level(score) if is_anomaly else "Low"
    reason = _determine_reason(payload, score) if is_anomaly else "Transaction within normal parameters"

    alert_id = None

    # Save anomaly to DuckDB
    if is_anomaly:
        alert_id = f"ALT-{uuid.uuid4().hex[:12]}"
        try:
            conn = get_duckdb()
            conn.execute("""
                INSERT INTO anomaly_alerts (alert_id, order_id, transaction_amount, anomaly_score, risk_level, reason, cashier_id, cashier_name, location_id, location_name, detected_at, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New')
            """, [
                alert_id,
                payload.order_id,
                payload.total_amount,
                float(score),
                risk_level,
                reason,
                payload.cashier_id,
                payload.cashier_name,
                payload.location_id,
                payload.location_name,
                datetime.now(timezone.utc),
            ])
        except Exception:
            pass  # Don't fail the response if DuckDB write fails

    return AnomalyResponse(
        is_anomaly=is_anomaly,
        anomaly_score=round(float(score), 4),
        risk_level=risk_level,
        reason=reason,
        alert_id=alert_id,
    )
