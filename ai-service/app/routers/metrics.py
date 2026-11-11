"""
US-PROBE-027: Model accuracy metrics endpoints.
- GET /forecast/backtest — rolling backtest of the demand forecast (MAE, WAPE, range coverage)
- GET /anomaly/metrics — Isolation Forest confusion matrix (Precision, Recall, F1)
"""

import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import duckdb
from fastapi import APIRouter, Depends

from app.services.auth import verify_token
from app.config.settings import get_settings

router = APIRouter(tags=["Model Metrics"])

MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "artifacts"
DUCKDB_PATH = Path(__file__).parent.parent.parent / "data" / "analytics.duckdb"


@router.get("/forecast/backtest")
async def forecast_backtest(token: dict = Depends(verify_token)):
    """
    US-PROBE-027: Forecast accuracy from a rolling backtest on each variation's recent sales:
    average miss (MAE), total error as a share of sales (WAPE), how often actual sales fell inside
    the likely range, and whether the forecast beats "same weekday last week".
    """
    from app.services.forecast_engine import backtest_report, load_bundle

    bundle = load_bundle()
    if bundle is None:
        return {"status": "no_model", "engine": "unknown", "metrics": [], "overall": {}}
    return backtest_report(bundle)


@router.get("/anomaly/metrics")
async def anomaly_metrics(token: dict = Depends(verify_token)):
    """
    US-PROBE-027: Evaluate Isolation Forest accuracy against synthetic validation labels.
    Returns Confusion Matrix, Precision, Recall, F1-Score.
    """
    # Only the per-channel models the detector actually uses; the old single model (trained on
    # synthetic data) is ignored, so its scores are never shown as if they were current.
    from app.services.anomaly_engine import load_models

    artifacts = load_models()
    if artifacts is None:
        return {
            "status": "no_model",
            "message": (
                "No per-channel model yet: each sales channel needs at least 40 orders in the last "
                "180 days. Until then, alerts come from the POS process rules and the usual-range checks."
            ),
        }

    saved_metrics = artifacts.get("metrics", {})

    # Format the confusion matrix
    cm = saved_metrics.get("confusion_matrix", [[0, 0], [0, 0]])

    return {
        "status": "completed",
        "trained_at": artifacts.get("trained_at", "unknown"),
        "contamination": artifacts.get("contamination", 0.05),
        "metrics": {
            "precision": round(saved_metrics.get("precision", 0), 4),
            "recall": round(saved_metrics.get("recall", 0), 4),
            "f1_score": round(saved_metrics.get("f1_score", 0), 4),
            "confusion_matrix": {
                "true_negative": cm[0][0] if len(cm) > 0 else 0,
                "false_positive": cm[0][1] if len(cm) > 0 else 0,
                "false_negative": cm[1][0] if len(cm) > 1 else 0,
                "true_positive": cm[1][1] if len(cm) > 1 else 0,
            },
        },
        "pass_threshold": 0.85,
        "overall_pass": saved_metrics.get("f1_score", 0) >= 0.85,
    }
