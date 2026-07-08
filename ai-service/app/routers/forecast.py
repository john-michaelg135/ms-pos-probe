"""
US-PROBE-015: Demand Forecast Endpoint.
Returns predicted daily demand for each product variation.
Uses Redis caching with 6-hour TTL.
"""

import json
import pickle
from pathlib import Path
from datetime import date, timedelta

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, Query

from app.config.settings import get_settings
from app.services.auth import verify_token
from app.services.database import get_redis, get_duckdb

router = APIRouter(prefix="/forecast", tags=["Forecast"])

MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "artifacts"

# ── Variation metadata (loaded once) ──
VARIATION_MAP = {
    1: ("Ube Halaya", "Smooth 200g"),
    2: ("Ube Halaya", "Smooth 250g"),
    3: ("Ube Halaya", "Smooth 500g"),
    4: ("Ube Halaya", "Tidbits 200g"),
    5: ("Ube Halaya", "Tidbits 250g"),
    6: ("Ube Halaya", "Tidbits 500g"),
    7: ("Ube Jam", "Smooth 200g"),
    8: ("Ube Jam", "Smooth 250g"),
    9: ("Ube Jam", "Smooth 500g"),
    10: ("Ube Jam", "Tidbits 200g"),
    11: ("Ube Jam", "Tidbits 250g"),
    12: ("Ube Jam", "Tidbits 500g"),
}


def _load_model(variation_id: int):
    """Load the latest trained model for a variation."""
    pattern = f"forecast_v{variation_id}_*.pkl"
    model_files = sorted(MODELS_DIR.glob(pattern), reverse=True)
    if not model_files:
        return None
    with open(model_files[0], "rb") as f:
        return pickle.load(f)


def _generate_forecast(model, days: int) -> list[dict]:
    """Generate forecast using either Prophet or statsmodels wrapper."""

    # Prophet model (has make_future_dataframe method)
    if hasattr(model, "make_future_dataframe"):
        future = model.make_future_dataframe(periods=days)
        forecast = model.predict(future)
        result = forecast.tail(days)
        return [
            {
                "date": row["ds"].strftime("%Y-%m-%d"),
                "predicted_quantity": max(0, round(row["yhat"])),
                "lower_bound": max(0, round(row["yhat_lower"])),
                "upper_bound": max(0, round(row["yhat_upper"])),
            }
            for _, row in result.iterrows()
        ]

    # Statsmodels wrapper (dict with "model" key)
    if isinstance(model, dict) and "model" in model:
        inner = model["model"]
        std_y = model.get("std_y", 1.0)

        forecast_values = inner.forecast(days)
        if hasattr(forecast_values, "values"):
            forecast_values = forecast_values.values

        start_date = date.today() + timedelta(days=1)
        results = []
        for i, val in enumerate(forecast_values):
            pred = max(0, round(float(val)))
            # Confidence interval: ±1.5 std
            margin = max(1, round(std_y * 1.5))
            results.append({
                "date": (start_date + timedelta(days=i)).strftime("%Y-%m-%d"),
                "predicted_quantity": pred,
                "lower_bound": max(0, pred - margin),
                "upper_bound": pred + margin,
            })
        return results

    return []


@router.get("")
async def get_forecast(
    variation_id: int | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    token: dict = Depends(verify_token),
):
    """
    Returns predicted daily demand for product variations.
    Cached in Redis with 6-hour TTL.
    """
    settings = get_settings()
    redis = get_redis()

    # Determine which variations to forecast
    variation_ids = [variation_id] if variation_id else list(VARIATION_MAP.keys())

    all_forecasts = []

    for var_id in variation_ids:
        if var_id not in VARIATION_MAP:
            continue

        product_name, variation_name = VARIATION_MAP[var_id]

        # Check Redis cache
        cache_key = f"forecast:{var_id}:{days}"
        try:
            cached = redis.get(cache_key)
            if cached:
                forecast_data = json.loads(cached)
                for item in forecast_data:
                    item["variation_id"] = var_id
                    item["product_name"] = product_name
                    item["variation_name"] = variation_name
                all_forecasts.extend(forecast_data)
                continue
        except Exception:
            pass

        # Cache miss — load model and generate forecast
        model = _load_model(var_id)
        if model is None:
            continue

        forecast_data = _generate_forecast(model, days)

        # Cache the result
        try:
            redis.setex(cache_key, settings.forecast_cache_ttl, json.dumps(forecast_data))
        except Exception:
            pass

        # Add metadata
        for item in forecast_data:
            item["variation_id"] = var_id
            item["product_name"] = product_name
            item["variation_name"] = variation_name

        all_forecasts.extend(forecast_data)

    return all_forecasts
