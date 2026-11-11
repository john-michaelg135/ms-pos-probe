"""
US-PROBE-015: Demand forecast endpoints.

Forecasts come from the bundle trained daily by scripts/train_forecast.py
(method: app/services/forecast_engine.py). Each item carries the predicted units, the likely
range (10th–90th percentile) and the recommended production (90th percentile, so it covers
demand on about 9 days in 10).
"""

from datetime import datetime

import numpy as np
from fastapi import APIRouter, Depends, Query

from app.services.auth import verify_token
from app.services.forecast_engine import (
    METHOD_LABEL, SERVICE_LEVEL, SHARE_DAYS, WEEKDAY_WEEKS, forecast, load_bundle,
)

router = APIRouter(prefix="/forecast", tags=["Forecast"])

WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"]


@router.get("")
async def get_forecast(
    variation_id: int | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    location_name: str | None = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Daily forecast from tomorrow for every variation (or one), optionally for one branch."""
    bundle = load_bundle()
    if bundle is None:
        return []
    return forecast(bundle, days, variation_id, location_name or None)


@router.get("/locations")
async def get_forecast_locations(token: dict = Depends(verify_token)):
    """Active branches, plus any branch with sales in the last 90 days."""
    bundle = load_bundle()
    if bundle is None:
        return []
    shares = bundle["location_shares"]
    return [
        {"location_name": name, "has_recent_sales": name in shares}
        for name in bundle["locations"]
    ]


@router.get("/insights")
async def get_forecast_insights(
    variation_id: int | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=30),
    location_name: str | None = Query(default=None),
    token: dict = Depends(verify_token),
):
    """Plain-language summary of the forecast for one variation or all of them, optionally for one branch."""
    bundle = load_bundle()
    if bundle is None or not bundle["variations"]:
        return {
            "engine": "Not trained",
            "variation_name": "All variations",
            "model_baseline": "The forecast has not been trained yet. It trains automatically from POS sales shortly after the service starts, then every night.",
            "demand_drivers": "Not enough sales history yet.",
            "stockout_risk": "Not enough sales history yet.",
            "safety_stock": "Not enough sales history yet.",
            "velocity_class": "Insufficient Data",
        }

    variations = bundle["variations"]
    scope_ids = [variation_id] if variation_id in variations else sorted(variations)
    single = len(scope_ids) == 1 and variation_id is not None
    scope = f"{variations[scope_ids[0]]['product_name']} {variations[scope_ids[0]]['variation_name']}" if single else "All variations"
    branch = location_name or None
    if branch:
        scope = f"{scope} at {branch}"

    # A branch's figures are its recent share of each variation's all-branch demand.
    all_items = forecast(bundle, days, location_name=branch)
    ratio = {i["variation_id"]: (i.get("location_ratio", 1.0) if branch else 1.0) for i in all_items}
    items = [i for i in all_items if i["variation_id"] in scope_ids]
    # Unrounded expected units, so thin demand (0.3 a day) doesn't read as zero.
    by_date: dict[str, float] = {}
    for i in items:
        by_date[i["date"]] = by_date.get(i["date"], 0.0) + i["expected_quantity"]
    predicted = round(sum(i["expected_quantity"] for i in items), 1)
    recommended = sum(i["recommended_quantity"] for i in items)
    peak_date, peak_units = max(by_date.items(), key=lambda kv: kv[1]) if by_date else ("", 0)

    weekday = np.zeros(7)
    for vid in scope_ids:
        weekday += np.array([variations[vid]["weekday_avg"][d] for d in range(7)]) * ratio.get(vid, 1.0)
    window_units = sum(variations[v]["units_share_window"] * ratio.get(v, 1.0) for v in scope_ids)
    all_units = sum(v["units_share_window"] * ratio.get(k, 1.0) for k, v in variations.items()) or 1.0
    share = window_units / all_units * 100

    methods = [variations[v]["method"] for v in scope_ids]
    metrics = [variations[v]["metrics"] for v in scope_ids]
    maes = [m["mae"] for m in metrics if m["mae"] is not None]
    covs = [m["coverage"] for m in metrics if m["coverage"] is not None]

    if single:
        m = metrics[0]
        engine = METHOD_LABEL[methods[0]]
        detail = (
            f" In a backtest over its last {m['backtest_days']} forecast days it missed by "
            f"{m['mae']:.1f} units a day on average" if m["mae"] is not None else ""
        )
        if detail and m["coverage"] is not None:
            detail += f", and actual sales fell inside the likely range on {m['coverage']:.0%} of days"
        model_baseline = (
            f"{scope} is forecast with the {engine.lower()} method, chosen because it made the smallest "
            f"errors on this variation's own recent sales.{detail + '.' if detail else ''} "
            f"The likely range is the 10th–90th percentile of past forecast errors."
        )
    else:
        counts = {METHOD_LABEL[k]: methods.count(k) for k in set(methods)}
        engine = "Mixed methods" if len(counts) > 1 else next(iter(counts))
        mix = ", ".join(f"{label} for {n}" for label, n in sorted(counts.items(), key=lambda kv: -kv[1]))
        model_baseline = (
            f"Each of the {len(scope_ids)} variations uses whichever method made the smallest errors on its own "
            f"recent sales ({mix})."
            + (f" Average miss: {np.mean(maes):.1f} units a day per variation." if maes else "")
            + (f" Actual sales fell inside the likely range on {np.mean(covs):.0%} of backtest days (target 80%)." if covs else "")
        )

    if weekday.sum() > 0:
        best, worst = int(weekday.argmax()), int(weekday.argmin())
        peak_label = datetime.fromisoformat(peak_date).strftime("%b %d") if peak_date else "—"
        outlook = (
            f"Busiest forecast day in the next {days} days: {peak_label}, about {peak_units:.0f} units."
            if peak_units >= 1 else
            f"Sales are infrequent: about {predicted:g} units are expected over the next {days} days in total, "
            f"so no single day is forecast at a full unit. The recommended production below still covers an occasional sale."
        )
        demand_drivers = (
            f"Over the last {WEEKDAY_WEEKS} weeks, {scope} sold most on {WEEKDAYS[best]} "
            f"({weekday[best]:.1f} units on average) and least on {WEEKDAYS[worst]} ({weekday[worst]:.1f}). "
            + outlook
        )
    else:
        demand_drivers = f"{scope} had no walk-in, bazaar or online sales in the last {WEEKDAY_WEEKS} weeks."

    per_day = window_units / SHARE_DAYS
    stockout_risk = (
        f"{scope} accounted for {share:.0f}% of {'the branch' if branch else 'all'} units sold in the last {SHARE_DAYS} days "
        f"({window_units:.0f} units, about {per_day:.1f} a day; institutional orders not included)."
        if single else
        f"In the last {SHARE_DAYS} days {'this branch' if branch else 'all branches'} sold {window_units:.0f} units "
        f"through walk-in, bazaar and online orders, about {per_day:.1f} a day. "
        f"Institutional orders are booked ahead and not included."
    )
    if branch and not bundle["location_shares"].get(branch):
        stockout_risk += (
            " With no walk-in, bazaar or online sales here in that period, nothing is forecast for this branch "
            "until it has its own sales history."
        )
    safety_stock = (
        f"Producing the recommended {recommended} units over the next {days} days "
        f"({max(recommended - predicted, 0):g} above the expected {predicted:g}) should cover demand on "
        f"about {SERVICE_LEVEL:.0%} of days."
    )

    if single:
        velocity = "Class A Fast-Mover" if share >= 15 else "Class B Moderate-Mover" if share >= 5 else "Class C Slow-Mover"
    else:
        velocity = "All products"

    return {
        "engine": engine,
        "variation_name": scope,
        "model_baseline": model_baseline,
        "demand_drivers": demand_drivers,
        "stockout_risk": stockout_risk,
        "safety_stock": safety_stock,
        "velocity_class": velocity,
        "trained_at": bundle["trained_at"],
    }
