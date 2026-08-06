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

# ── Variation metadata ──
# Hardcoded canonical mapping (12 variations for the full catalog).
# If a variation_id is not in this map, the system will attempt to
# resolve it from model metrics or DuckDB at runtime.
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


def _get_variation_name(variation_id: int) -> tuple[str, str] | None:
    """Resolve variation name — first from DuckDB, then from hardcoded map."""
    # Try DuckDB for the actual product/variation names
    try:
        conn = get_duckdb()
        row = conn.execute("""
            SELECT product_name, variation_name
            FROM sales_transactions
            WHERE variation_id = ?
            LIMIT 1
        """, [variation_id]).fetchone()
        if row:
            product_name = str(row[0]).strip()
            variation_name = _clean_variation_name(str(row[1]).strip())
            return (product_name, variation_name)
    except Exception:
        pass

    # Fallback to hardcoded map
    if variation_id in VARIATION_MAP:
        return VARIATION_MAP[variation_id]
    return None


def _clean_variation_name(raw_name: str) -> str:
    """
    Clean raw variation names from the legacy DB into human-readable format.
    Examples:
        'UBH-SM-250|Pouch|250g' → '250g'
        'UJM-TB-500|Jar|500g'   → '500g'
        'Smooth 200g'            → 'Smooth 200g' (already clean)
    
    The product_name already contains 'Ube Halaya Smooth' or 'Ube Jam Tidbits',
    so the variation_name just needs the size/weight.
    """
    # If it contains pipe characters, it's the raw SKU format
    if "|" in raw_name:
        parts = raw_name.split("|")
        # Last part is usually the weight (e.g., '250g', '500g')
        weight = parts[-1].strip() if parts else raw_name
        return weight
    
    return raw_name


def _get_all_trained_variation_ids() -> list[int]:
    """Get all variation IDs that have trained model files."""
    ids = set()
    for f in MODELS_DIR.glob("forecast_v*_*.pkl"):
        name = f.stem  # e.g. "forecast_v3_20260724"
        parts = name.split("_")
        if len(parts) >= 2:
            var_part = parts[1]  # "v3"
            try:
                var_id = int(var_part[1:])
                ids.add(var_id)
            except ValueError:
                pass
    return sorted(ids)


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
    location_id: int | None = Query(default=None),
    location_name: str | None = Query(default=None),
    token: dict = Depends(verify_token),
):
    """
    Returns predicted daily demand for product variations.
    Optionally filtered by location_name (uses proportional split from historical data).
    Cached in Redis with 6-hour TTL.
    """
    settings = get_settings()
    redis = get_redis()

    # Determine which variations to forecast
    if variation_id:
        variation_ids = [variation_id]
    else:
        # Get all variation IDs that have trained models
        variation_ids = _get_all_trained_variation_ids()
        # Fallback: if no models found by file scan, try the hardcoded map
        if not variation_ids:
            variation_ids = list(VARIATION_MAP.keys())

    all_forecasts = []

    for var_id in variation_ids:
        var_info = _get_variation_name(var_id)
        if not var_info:
            continue

        product_name, variation_name = var_info

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

    # Apply location-based proportional split if location is specified
    if location_name and all_forecasts:
        all_forecasts = _apply_location_split(all_forecasts, location_name)
    elif location_id and all_forecasts:
        # Legacy support: resolve location_id to name first
        conn = get_duckdb()
        try:
            loc_row = conn.execute(
                "SELECT location_name FROM sales_transactions WHERE location_id = ? LIMIT 1",
                [location_id]
            ).fetchone()
            if loc_row:
                all_forecasts = _apply_location_split(all_forecasts, loc_row[0])
        except Exception:
            pass

    return all_forecasts


def _apply_location_split(forecasts: list[dict], loc_name: str) -> list[dict]:
    """
    Apply proportional location split to forecast data.
    Uses historical sales ratios per variation per location to distribute the forecast.
    """
    conn = get_duckdb()

    # Get proportional share per variation for this location
    try:
        ratios = conn.execute("""
            SELECT
                variation_id,
                SUM(quantity) AS loc_qty
            FROM sales_transactions
            WHERE location_name = ? AND is_refund = FALSE
            GROUP BY variation_id
        """, [loc_name]).fetchall()
        loc_qty_map = {int(r[0]): float(r[1]) for r in ratios}
    except Exception:
        loc_qty_map = {}

    # Get total quantity per variation (all locations)
    try:
        totals = conn.execute("""
            SELECT variation_id, SUM(quantity) AS total_qty
            FROM sales_transactions
            WHERE is_refund = FALSE
            GROUP BY variation_id
        """).fetchall()
        total_qty_map = {int(r[0]): float(r[1]) for r in totals}
    except Exception:
        total_qty_map = {}

    # Apply ratio to each forecast item
    result = []
    for item in forecasts:
        var_id = item.get("variation_id")
        loc_qty = loc_qty_map.get(var_id, 0)
        total_qty = total_qty_map.get(var_id, 1)

        # Calculate location's share (default to equal split if no data)
        ratio = loc_qty / total_qty if total_qty > 0 else 0.5

        adjusted = {
            **item,
            "predicted_quantity": max(0, round(item["predicted_quantity"] * ratio)),
            "lower_bound": max(0, round(item["lower_bound"] * ratio)),
            "upper_bound": max(0, round(item["upper_bound"] * ratio)),
            "location_name": loc_name,
            "location_ratio": round(ratio, 3),
        }
        result.append(adjusted)

    return result


@router.get("/locations")
async def get_forecast_locations(token: dict = Depends(verify_token)):
    """Returns available locations for location-based forecast filtering."""
    conn = get_duckdb()
    try:
        rows = conn.execute("""
            SELECT location_name, COUNT(*) as txn_count
            FROM sales_transactions
            WHERE location_name IS NOT NULL AND location_name != ''
            GROUP BY location_name
            ORDER BY location_name
        """).fetchall()
        return [{"location_name": r[0], "transaction_count": int(r[1])} for r in rows]
    except Exception:
        return []


@router.get("/insights")
async def get_forecast_insights(
    variation_id: int | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    token: dict = Depends(verify_token),
):
    """
    Returns AI-generated explanations and key drivers for the demand forecast.
    Provides context on model confidence, demand patterns, stockout risk, and safety stock.
    """
    conn = get_duckdb()

    # Determine scope
    if variation_id:
        var_info = _get_variation_name(variation_id)
        if var_info:
            variation_ids = [variation_id]
            product_name, variation_name = var_info
            scope_name = f"{product_name} {variation_name}"
        else:
            variation_ids = _get_all_trained_variation_ids()
            scope_name = "All Variations (System Total)"
    else:
        variation_ids = _get_all_trained_variation_ids()
        if not variation_ids:
            variation_ids = list(VARIATION_MAP.keys())
        scope_name = "All Variations (System Total)"

    # Gather historical stats from DuckDB
    var_id_list = ", ".join(str(v) for v in variation_ids)
    try:
        stats = conn.execute(f"""
            SELECT
                COUNT(*) as total_txn,
                SUM(quantity) as total_qty,
                ROUND(AVG(quantity), 1) as avg_daily_qty,
                MAX(quantity) as max_qty,
                COUNT(DISTINCT CAST(transaction_date AS DATE)) as distinct_days,
                MODE(EXTRACT(DOW FROM transaction_date)) as peak_dow,
                MODE(CAST(transaction_date AS DATE)) as peak_date
            FROM sales_transactions
            WHERE variation_id IN ({var_id_list})
              AND is_refund = FALSE
        """).fetchone()
    except Exception:
        stats = None

    # Gather total store demand for share calculation
    try:
        total_store = conn.execute("""
            SELECT SUM(quantity) as total FROM sales_transactions WHERE is_refund = FALSE
        """).fetchone()
        total_store_qty = total_store[0] if total_store and total_store[0] else 1
    except Exception:
        total_store_qty = 1

    # Calculate forecast totals from loaded models
    forecast_total = 0
    forecast_upper = 0
    forecast_lower = 0
    model_count = 0

    for var_id in variation_ids:
        model = _load_model(var_id)
        if model is None:
            continue
        model_count += 1
        forecast_data = _generate_forecast(model, days)
        for item in forecast_data:
            forecast_total += item["predicted_quantity"]
            forecast_upper += item["upper_bound"]
            forecast_lower += item["lower_bound"]

    # Determine engine
    engine = "Statsmodels"
    sample_model = _load_model(variation_ids[0]) if variation_ids else None
    if sample_model and hasattr(sample_model, "make_future_dataframe"):
        engine = "Prophet"

    # Build insights
    dow_names = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]

    if stats and stats[0] and stats[0] > 0:
        total_txn = stats[0]
        total_qty = stats[1] or 0
        avg_daily = stats[2] or 0
        max_qty = stats[3] or 0
        distinct_days = stats[4] or 1
        peak_dow = int(stats[5]) if stats[5] is not None else 0
        peak_date_raw = stats[6]

        peak_day_name = dow_names[peak_dow] if 0 <= peak_dow < 7 else "Weekdays"
        demand_share = round((total_qty / total_store_qty) * 100) if total_store_qty > 0 else 0
        avg_per_day = round(total_qty / distinct_days, 1) if distinct_days > 0 else 0

        # Peak date formatting
        peak_date_str = ""
        if peak_date_raw:
            try:
                peak_date_str = pd.Timestamp(peak_date_raw).strftime("%b %d")
            except Exception:
                peak_date_str = str(peak_date_raw)

        # Forecast peak
        forecast_peak_qty = 0
        forecast_peak_date = ""
        for var_id in variation_ids:
            model = _load_model(var_id)
            if model is None:
                continue
            forecast_data = _generate_forecast(model, days)
            for item in forecast_data:
                if item["predicted_quantity"] > forecast_peak_qty:
                    forecast_peak_qty = item["predicted_quantity"]
                    forecast_peak_date = item["date"]

        # Format peak date
        if forecast_peak_date:
            try:
                forecast_peak_date_formatted = pd.Timestamp(forecast_peak_date).strftime("%b %d")
            except Exception:
                forecast_peak_date_formatted = forecast_peak_date
        else:
            forecast_peak_date_formatted = "N/A"

        # Volume surge calculation
        volume_surge = round(((forecast_peak_qty - avg_per_day) / avg_per_day) * 100) if avg_per_day > 0 else 0

        # Velocity classification
        if demand_share >= 15:
            velocity_class = "Class A Fast-Mover"
        elif demand_share >= 5:
            velocity_class = "Class B Moderate-Mover"
        else:
            velocity_class = "Class C Slow-Mover"

        # Confidence interval width
        confidence_pct = 80 if engine == "Statsmodels" else 80

        model_baseline = (
            f"Calculated using {engine} time-series machine learning at an "
            f"{confidence_pct}% Confidence Interval (±1.5σ). The AI model analyzes past daily "
            f"sales patterns specifically for {scope_name} to project restocking bounds."
        )

        demand_drivers = (
            f"Demand for {scope_name} peaks on {peak_day_name}. "
            f"First peak on {forecast_peak_date_formatted}; reaching {forecast_peak_qty} units/day, "
            f"representing a +{volume_surge}% volume surge over its daily average of {round(avg_per_day)} units."
        )

        stockout_risk = (
            f"{scope_name} generates {demand_share}% of total store demand "
            f"({total_qty} units total, {round(avg_per_day)} units/day). "
            f"Prioritize restocking this item before {peak_day_name[:-1]} peak to prevent stockouts."
        )

        safety_stock = (
            f"To protect against unexpected sales spikes, the AI recommends maintaining "
            f"a minimum safety stock floor of {forecast_lower} units up to a maximum buffer "
            f"limit of {forecast_upper} units across the {days}-day window."
        )
    else:
        velocity_class = "Insufficient Data"
        model_baseline = "Insufficient historical data to compute model confidence. Sync more transactions to enable analysis."
        demand_drivers = "Not enough transaction history to identify demand drivers. At least 2 days of sales data are needed."
        stockout_risk = "Cannot assess stockout risk without historical demand data."
        safety_stock = "Safety stock recommendations require trained forecast models."

    return {
        "engine": engine,
        "variation_name": scope_name,
        "model_baseline": model_baseline,
        "demand_drivers": demand_drivers,
        "stockout_risk": stockout_risk,
        "safety_stock": safety_stock,
        "velocity_class": velocity_class,
    }
