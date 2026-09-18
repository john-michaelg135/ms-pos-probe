"""
US-PROBE-027: Model accuracy metrics endpoints.
- GET /forecast/backtest — Prophet/statsmodels backtesting results (MAPE, MAE, R²)
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
    US-PROBE-027: Evaluate Prophet/forecast model accuracy via backtesting.
    Returns MAPE, MAE, R² for each variation, plus overall metrics.
    """
    # Load saved metrics from training
    metrics_files = sorted(MODELS_DIR.glob("forecast_metrics_*.pkl"), reverse=True)

    if not metrics_files:
        return {
            "status": "no_model",
            "engine": "unknown",
            "metrics": [],
            "overall": {},
        }

    with open(metrics_files[0], "rb") as f:
        all_metrics = pickle.load(f)

    # Convert numpy types to native Python types
    clean_metrics = []
    for m in all_metrics:
        clean_metrics.append({
            "variation_name": str(m.get("variation_name", "")),
            "mape": float(m.get("mape", 0)),
            "mae": float(m.get("mae", 0)),
            "r_squared": float(m.get("r_squared", 0)),
            "engine": str(m.get("engine", "unknown")),
        })

    # Calculate overall averages
    mapes = [m["mape"] for m in clean_metrics]
    maes = [m["mae"] for m in clean_metrics]
    r2s = [m["r_squared"] for m in clean_metrics]

    overall = {
        "avg_mape": round(float(np.mean(mapes)), 2),
        "avg_mae": round(float(np.mean(maes)), 2),
        "avg_r_squared": round(float(np.mean(r2s)), 4),
        "best_mape": round(float(min(mapes)), 2),
        "worst_mape": round(float(max(mapes)), 2),
        "passed": sum(1 for m in mapes if m <= 20),
        "total": len(mapes),
        "pass_threshold": 20.0,
        "overall_pass": float(np.mean(mapes)) <= 20,
    }

    return {
        "status": "completed",
        "engine": clean_metrics[0]["engine"] if clean_metrics else "unknown",
        "metrics": clean_metrics,
        "overall": overall,
    }


@router.get("/anomaly/metrics")
async def anomaly_metrics(token: dict = Depends(verify_token)):
    """
    US-PROBE-027: Evaluate Isolation Forest accuracy against synthetic validation labels.
    Returns Confusion Matrix, Precision, Recall, F1-Score.
    """
    # Load saved model artifacts (contains metrics from training)
    model_files = sorted(MODELS_DIR.glob("iforest_*.pkl"), reverse=True)

    if not model_files:
        return {
            "status": "no_model",
            "message": "No trained Isolation Forest model found. Run train_iforest.py first.",
            "metrics": {},
        }

    with open(model_files[0], "rb") as f:
        artifacts = pickle.load(f)

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
