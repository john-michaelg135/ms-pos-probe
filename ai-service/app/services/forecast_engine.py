"""
Demand forecasting for the POS-PROBE (US-PROBE-014/015/027).

What it forecasts
-----------------
Units sold per product variation per day, across all branches, for walk-in store, bazaar and
online orders. Institutional orders are left out: they are large pre-arranged orders (20 kg and up)
that are booked ahead and take their stock when placed, so mixing them in would turn one booking
into a false demand spike. Only real sales count (paid, part-paid or completed; never voided,
cancelled or rejected). Days are Philippine dates.

How it forecasts
----------------
Daily sales per variation are small and often zero, so each variation gets whichever of three
methods made the smallest errors when replayed on its own recent history (rolling-origin backtest):

    Weekday average   recent same-weekday sales, newest weeks weighted most
    Recent average    the average of the last 28 days
    Holt-Winters      exponential smoothing with a weekly pattern (statsmodels)

The forecast always starts tomorrow (the model is refit on all data up to yesterday).

The range and the quota
-----------------------
The likely range is the 10th–90th percentile of the method's own backtest errors added to the
forecast (Poisson percentiles when there are too few errors to use). So it is narrow when the
method has been reliable and wide when it hasn't, and its low end is not stuck at zero.
Recommended production is the 90th percentile: enough to cover demand on about 9 days in 10.

Accuracy is reported as average miss (MAE), total error as a share of total sales (WAPE), how
often actual sales fell inside the likely range, and whether the chosen method beats a simple
"same weekday last week" baseline. MAPE is kept for reference only: it skips zero-sale days and
explodes on 1–2 unit days, so it is not a fair pass/fail measure for this data.
"""

from __future__ import annotations

import math
import pickle
import re
import warnings
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import structlog

logger = structlog.get_logger()

MANILA = timezone(timedelta(hours=8))
MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "artifacts"
BUNDLE_GLOB = "forecast_bundle_*.pkl"

HISTORY_DAYS = 365
SHARE_DAYS = 90            # window for branch shares and demand share
BACKTEST_DAYS = 28         # replay the last four weeks
BACKTEST_STEP = 2          # forecast origin every 2 days
MAX_HORIZON = 7
WEEKDAY_WEEKS = 8
WEEKDAY_DECAY = 0.8
RECENT_DAYS = 28
MIN_RESIDUALS = 20         # errors needed before using empirical percentiles
LOW_Q, HIGH_Q = 0.10, 0.90
SERVICE_LEVEL = 0.90       # recommended production covers demand on ~9 days in 10

METHOD_LABEL = {
    "weekday": "Weekday average",
    "recent": "Recent average",
    "holt_winters": "Holt-Winters",
}

# A sale, as the POS counts one (see api-pos DashboardService).
SALE_FILTER = """
    o."OrderStatus" NOT IN ('Cancelled', 'Rejected', 'Voided')
    AND (o."PaymentStatus" IN ('Paid', 'Partial') OR o."OrderStatus" = 'Completed')
"""

_DAILY_SQL = f"""
    SELECT
        (o."CreatedAt" AT TIME ZONE 'Asia/Manila')::DATE AS day,
        oi."VariationId"                              AS variation_id,
        p."ProductName"                               AS product_name,
        pv."VariationName"                            AS variation_name,
        o."LocationId"                                AS location_id,
        l."LocationName"                              AS location_name,
        SUM(oi."Quantity")::FLOAT                     AS units
    FROM "Orders" o
    JOIN "OrderItems" oi ON oi."OrderId" = o."OrderId"
    JOIN "ProductVariations" pv ON pv."VariationId" = oi."VariationId"
    JOIN "Products" p ON p."ProductId" = pv."ProductId"
    LEFT JOIN "Locations" l ON l."LocationId" = o."LocationId"
    WHERE {SALE_FILTER}
      AND o."OrderType" <> 'Institutional'
      AND o."CreatedAt" >= %(since)s
    GROUP BY 1, 2, 3, 4, 5, 6
"""

_LOCATIONS_SQL = """
    SELECT "LocationId", "LocationName"
    FROM "Locations"
    WHERE "IsActive" = TRUE AND COALESCE("LocationType", '') <> 'Commissary'
    ORDER BY "LocationName"
"""

_WEIGHT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b", re.IGNORECASE)


# ── Names ──

def display_names(product_name: str, variation_name: str) -> tuple[str, str]:
    """('Ube Jam Smooth', 'UJM-SM-300|Jar|300g') -> ('Ube Jam', 'Smooth 300g Jar')."""
    product = (product_name or "").strip()
    raw = (variation_name or "").strip()
    family = "Ube Halaya" if "halaya" in product.lower() else "Ube Jam" if "jam" in product.lower() else product
    texture = product[len(family):].strip() if product.lower().startswith(family.lower()) else ""
    parts = [p.strip() for p in raw.split("|")] if "|" in raw else []
    if not texture and parts:
        code = parts[0].upper()
        texture = "Smooth" if "-SM-" in code else "Tidbits" if "-TB-" in code else ""
    if not texture:
        texture = next((t for t in ("Smooth", "Tidbits") if t.lower() in raw.lower()), "")
    weight = _WEIGHT_RE.search(raw)
    size = weight.group(0).replace(" ", "") if weight else (parts[-1] if parts else raw)
    packaging = parts[1] if len(parts) >= 3 else ""
    label = " ".join(x for x in (texture, size, packaging) if x) or raw
    return family, label


# ── Methods ──

def _weekday_forecast(series: pd.Series, dates: list[date]) -> np.ndarray:
    """Recent same-weekday sales, newest weeks weighted most."""
    out = []
    for d in dates:
        values, weights = [], []
        for k in range(1, WEEKDAY_WEEKS + 1):
            past = d - timedelta(days=7 * k)
            if past in series.index:
                values.append(series[past])
                weights.append(WEEKDAY_DECAY ** (k - 1))
        out.append(float(np.average(values, weights=weights)) if values else float(series.tail(RECENT_DAYS).mean()))
    return np.array(out)


def _recent_forecast(series: pd.Series, dates: list[date]) -> np.ndarray:
    return np.full(len(dates), float(series.tail(RECENT_DAYS).mean()))


def _fit_holt_winters(series: pd.Series):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        values = pd.Series(series.values, index=pd.DatetimeIndex(series.index), dtype=float).asfreq("D", fill_value=0.0)
        return ExponentialSmoothing(values, trend=None, seasonal="add", seasonal_periods=7).fit(optimized=True)


def _holt_winters_forecast(series: pd.Series, dates: list[date], fitted=None) -> np.ndarray:
    fitted = fitted or _fit_holt_winters(series)
    last = series.index[-1]
    steps = max((d - last).days for d in dates)
    path = np.asarray(fitted.forecast(steps))
    return np.array([path[(d - last).days - 1] for d in dates])


def _can_use_holt_winters(series: pd.Series) -> bool:
    return len(series) >= 35 and int((series > 0).sum()) >= 14


def forecast_with(method: str, series: pd.Series, dates: list[date], fitted=None) -> np.ndarray:
    if method == "weekday":
        values = _weekday_forecast(series, dates)
    elif method == "holt_winters":
        values = _holt_winters_forecast(series, dates, fitted)
    else:
        values = _recent_forecast(series, dates)
    return np.clip(values, 0, None)


def _seasonal_naive(series: pd.Series, dates: list[date]) -> np.ndarray:
    """Baseline: same weekday last week (or the last day if a week isn't available)."""
    return np.array([series.get(d - timedelta(days=7), series.iloc[-1]) for d in dates], dtype=float)


# ── Backtest ──

def backtest(series: pd.Series) -> dict:
    """Replay each method on the last few weeks; returns errors per method and the baseline's."""
    methods = ["weekday", "recent"] + (["holt_winters"] if _can_use_holt_winters(series) else [])
    results = {m: {"actual": [], "predicted": [], "order": []} for m in methods + ["baseline"]}
    n = len(series)
    first_origin = max(14, n - BACKTEST_DAYS - MAX_HORIZON)
    origins = list(range(first_origin, n - 1, BACKTEST_STEP))
    for i, origin in enumerate(origins):
        train = series.iloc[: origin + 1]
        target = series.iloc[origin + 1: origin + 1 + MAX_HORIZON]
        if target.empty:
            continue
        dates = list(target.index)
        actual = target.values.astype(float)
        for m in methods:
            try:
                pred = forecast_with(m, train, dates)
            except Exception:
                pred = _recent_forecast(train, dates)
            results[m]["actual"].extend(actual)
            results[m]["predicted"].extend(pred)
            results[m]["order"].extend([i] * len(actual))
        results["baseline"]["actual"].extend(actual)
        results["baseline"]["predicted"].extend(_seasonal_naive(train, dates))
        results["baseline"]["order"].extend([i] * len(actual))
    return {k: {kk: np.array(vv) for kk, vv in v.items()} for k, v in results.items() if len(v["actual"])}


def interval_offsets(errors: np.ndarray) -> tuple[float, float, float] | None:
    """10th, 90th and service-level percentiles of (actual − forecast), or None if too few."""
    if len(errors) < MIN_RESIDUALS:
        return None
    return (float(np.quantile(errors, LOW_Q)), float(np.quantile(errors, HIGH_Q)), float(np.quantile(errors, SERVICE_LEVEL)))


def bounds_for(mean: float, offsets: tuple | None) -> tuple[float, float, float]:
    """
    (low, high, recommended) for one day's forecast: the wider of the range built from the
    method's past errors and the Poisson range for that many units. Sales counts vary by chance
    even when the forecast is right, so the range is never narrower than that natural noise
    (this matters when history is mostly zero-sale days and past errors are all near zero).
    """
    from scipy.stats import poisson
    mu = max(mean, 1e-9)
    p_low, p_high, p_service = (float(poisson.ppf(q, mu)) for q in (LOW_Q, HIGH_Q, SERVICE_LEVEL))
    if offsets is None:
        return p_low, p_high, p_service
    low, high, service = offsets
    return (
        min(p_low, max(0.0, mean + low)),
        max(p_high, mean + high),
        max(p_service, mean + service),
    )


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict:
    err = actual - predicted
    total = float(actual.sum())
    nonzero = actual > 0
    ss_tot = float(((actual - actual.mean()) ** 2).sum())
    return {
        "mae": float(np.abs(err).mean()),
        "wape": float(np.abs(err).sum() / total * 100) if total > 0 else None,
        "mape": float((np.abs(err[nonzero]) / actual[nonzero]).mean() * 100) if nonzero.any() else None,
        "r_squared": float(1 - (err ** 2).sum() / ss_tot) if ss_tot > 0 else 0.0,
    }


def _coverage(bt: dict) -> float | None:
    """Share of later backtest days inside a range built only from earlier days' errors."""
    order = bt["order"]
    if len(order) < 2 * MIN_RESIDUALS:
        return None
    cut = np.quantile(order, 0.6)
    early, late = order <= cut, order > cut
    offsets = interval_offsets(bt["actual"][early] - bt["predicted"][early])
    if offsets is None or not late.any():
        return None
    inside = [
        bounds_for(p, offsets)[0] <= a <= bounds_for(p, offsets)[1]
        for a, p in zip(bt["actual"][late], bt["predicted"][late])
    ]
    return float(np.mean(inside))


# ── Training ──

def load_daily(pg_conn, today: date) -> tuple[pd.DataFrame, list[dict]]:
    cursor = pg_conn.cursor()
    try:
        since = datetime.combine(today - timedelta(days=HISTORY_DAYS), datetime.min.time(), tzinfo=MANILA)
        cursor.execute(_DAILY_SQL, {"since": since})
        cols = [d[0] for d in cursor.description]
        daily = pd.DataFrame(cursor.fetchall(), columns=cols)
        cursor.execute(_LOCATIONS_SQL)
        locations = [{"location_id": r[0], "location_name": r[1]} for r in cursor.fetchall()]
    finally:
        cursor.close()
    return daily, locations


def build_bundle(daily: pd.DataFrame, active_locations: list[dict], today: date) -> dict:
    """Train every variation and package what the API needs."""
    yesterday = today - timedelta(days=1)
    variations = {}
    if not daily.empty:
        daily = daily[daily["day"] <= yesterday]

    for var_id, rows in daily.groupby("variation_id"):
        first = rows["day"].min()
        if first > yesterday:
            continue
        idx = pd.date_range(first, yesterday, freq="D").date
        series = rows.groupby("day")["units"].sum().reindex(idx, fill_value=0.0)
        series.index = list(idx)
        product, label = display_names(rows["product_name"].iloc[0], rows["variation_name"].iloc[0])

        bt = backtest(series) if len(series) >= 21 else {}
        candidates = {m: _metrics(v["actual"], v["predicted"]) for m, v in bt.items() if m != "baseline"}
        method = min(candidates, key=lambda m: candidates[m]["mae"]) if candidates else "recent"
        chosen = candidates.get(method)
        baseline = _metrics(bt["baseline"]["actual"], bt["baseline"]["predicted"]) if "baseline" in bt else None
        errors = bt[method]["actual"] - bt[method]["predicted"] if method in bt else np.array([])

        fitted = None
        if method == "holt_winters":
            try:
                fitted = _fit_holt_winters(series)
            except Exception:
                method = "weekday"

        recent = series.tail(WEEKDAY_WEEKS * 7)
        weekday_avg = {
            wd: float(np.nan_to_num(recent[[d.weekday() == wd for d in recent.index]].mean()))
            for wd in range(7)
        }

        variations[int(var_id)] = {
            "product_name": product,
            "variation_name": label,
            "method": method,
            "series": series,          # up to yesterday; needed by the weekday and recent methods
            "fitted": fitted,
            "offsets": interval_offsets(errors),
            "metrics": {
                **(chosen or {"mae": None, "wape": None, "mape": None, "r_squared": None}),
                "coverage": _coverage(bt[method]) if method in bt else None,
                "baseline_mae": baseline["mae"] if baseline else None,
                "backtest_days": int(len(set(bt[method]["order"]))) if method in bt else 0,
                "history_days": int(len(series)),
                "selling_days": int((series > 0).sum()),
            },
            "weekday_avg": weekday_avg,
            "units_share_window": float(series.tail(SHARE_DAYS).sum()),
        }

    # Branch shares of each variation's units over the share window.
    share_since = today - timedelta(days=SHARE_DAYS)
    recent_rows = daily[daily["day"] >= share_since] if not daily.empty else daily
    shares: dict[str, dict[int, float]] = {}
    if not recent_rows.empty:
        totals = recent_rows.groupby("variation_id")["units"].sum()
        for (loc_name, var_id), units in recent_rows.groupby(["location_name", "variation_id"])["units"].sum().items():
            if loc_name and totals.get(var_id, 0) > 0:
                shares.setdefault(loc_name, {})[int(var_id)] = float(units / totals[var_id])

    names = sorted({loc["location_name"] for loc in active_locations} | set(shares))
    return {
        "version": 2,
        "trained_at": datetime.now(MANILA).isoformat(),
        "train_end": yesterday,
        "variations": variations,
        "location_shares": shares,
        "locations": names,
        "active_branch_count": max(1, len(active_locations)),
        "service_level": SERVICE_LEVEL,
    }


def train_and_save(pg_conn) -> Path:
    today = datetime.now(MANILA).date()
    daily, locations = load_daily(pg_conn, today)
    bundle = build_bundle(daily, locations, today)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / f"forecast_bundle_{datetime.now(MANILA).strftime('%Y%m%d_%H%M')}.pkl"
    with open(path, "wb") as f:
        pickle.dump(bundle, f)
    # Keep the three newest bundles.
    for old in sorted(MODELS_DIR.glob(BUNDLE_GLOB), reverse=True)[3:]:
        old.unlink(missing_ok=True)
    return path


# ── Serving ──

_cache: dict = {"path": None, "mtime": None, "bundle": None}


def load_bundle() -> dict | None:
    files = sorted(MODELS_DIR.glob(BUNDLE_GLOB), reverse=True)
    if not files:
        return None
    path = files[0]
    mtime = path.stat().st_mtime
    if _cache["path"] != path or _cache["mtime"] != mtime:
        with open(path, "rb") as f:
            _cache.update(path=path, mtime=mtime, bundle=pickle.load(f))
    return _cache["bundle"]


def _location_ratio(bundle: dict, var_id: int, location_name: str) -> tuple[float, str]:
    shares = bundle["location_shares"]
    if location_name in shares:
        return shares[location_name].get(var_id, 0.0), "recent sales share"
    # No walk-in, bazaar or online sales here in the share window: forecast nothing rather than
    # inventing a share, so the branch forecasts always add up to the all-branch forecast.
    return 0.0, f"no sales at this branch in the last {SHARE_DAYS} days"


def forecast(bundle: dict, days: int, variation_id: int | None = None, location_name: str | None = None) -> list[dict]:
    """Daily forecasts from tomorrow, with the likely range and recommended production."""
    tomorrow = datetime.now(MANILA).date() + timedelta(days=1)
    dates = [tomorrow + timedelta(days=i) for i in range(days)]
    out = []
    for var_id, v in sorted(bundle["variations"].items()):
        if variation_id is not None and var_id != variation_id:
            continue
        try:
            means = forecast_with(v["method"], v["series"], dates, v["fitted"])
        except Exception:
            means = forecast_with("recent", v["series"], dates)
        ratio, basis = (1.0, None) if not location_name else _location_ratio(bundle, var_id, location_name)
        for d, mean in zip(dates, means):
            low, high, rec = bounds_for(float(mean), v["offsets"])
            item = {
                "date": d.isoformat(),
                "variation_id": var_id,
                "product_name": v["product_name"],
                "variation_name": v["variation_name"],
                "predicted_quantity": int(round(mean * ratio)),
                # Unrounded average, for charts: 0.3 means about one sale every three days.
                "expected_quantity": round(float(mean * ratio), 2),
                "lower_bound": int(math.floor(low * ratio)),
                "upper_bound": int(math.ceil(high * ratio)),
                "recommended_quantity": int(math.ceil(rec * ratio)),
                "method": METHOD_LABEL[v["method"]],
            }
            if location_name:
                item.update(location_name=location_name, location_ratio=round(ratio, 3), location_basis=basis)
            out.append(item)
    return out


def backtest_report(bundle: dict) -> dict:
    """Accuracy summary for the Model Accuracy page."""
    rows = []
    for var_id, v in sorted(bundle["variations"].items()):
        m = v["metrics"]
        beats = m["mae"] is not None and m["baseline_mae"] is not None and m["mae"] <= m["baseline_mae"]
        rows.append({
            "variation_id": var_id,
            "variation_name": f"{v['product_name']} {v['variation_name']}",
            "engine": METHOD_LABEL[v["method"]],
            "mae": round(m["mae"], 2) if m["mae"] is not None else None,
            "wape": round(m["wape"], 1) if m["wape"] is not None else None,
            "mape": round(m["mape"], 1) if m["mape"] is not None else None,
            "r_squared": round(m["r_squared"], 3) if m["r_squared"] is not None else None,
            "coverage": round(m["coverage"] * 100, 1) if m["coverage"] is not None else None,
            "baseline_mae": round(m["baseline_mae"], 2) if m["baseline_mae"] is not None else None,
            "beats_baseline": bool(beats),
            "backtest_days": m["backtest_days"],
            "selling_days": m["selling_days"],
            "history_days": m["history_days"],
        })

    def avg(key):
        vals = [r[key] for r in rows if r[key] is not None]
        return round(float(np.mean(vals)), 2) if vals else None

    passed = sum(1 for r in rows if r["beats_baseline"])
    return {
        "status": "completed" if rows else "no_model",
        "engine": "Per-variation method selection",
        "trained_at": bundle["trained_at"],
        "metrics": rows,
        "overall": {
            "avg_mae": avg("mae"),
            "avg_wape": avg("wape"),
            "avg_mape": avg("mape"),
            "avg_r_squared": avg("r_squared"),
            "avg_coverage": avg("coverage"),
            "target_coverage": round((HIGH_Q - LOW_Q) * 100),
            "passed": passed,
            "total": len(rows),
            # Pass when most variations forecast better than "same weekday last week".
            "overall_pass": bool(rows) and passed >= math.ceil(len(rows) * 0.75),
            "pass_rule": "Forecast beats the 'same weekday last week' baseline (lower average miss)",
        },
    }
