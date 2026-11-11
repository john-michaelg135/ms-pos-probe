"""
Business-aware anomaly detection for POS transactions.

Runs after each PostgreSQL → DuckDB sync (every 10 minutes) on orders and refunds that are
already saved in the POS database, so it sees real totals, order types and payments.

Why it works this way
---------------------
The POS has very different kinds of sales. A walk-in jar sale is a few hundred pesos; an
institutional order must weigh at least 20 kg (40–100 jars) and is often tens of thousands.
Judging them against one "normal" flags every institutional order. So each order is compared
only with recent orders from the same channel (and the same branch when there is enough history):

    Store (walk-in) · Bazaar · Institutional · Online

Three kinds of check produce alerts, and every alert says in plain words why it was raised:

1. Process rules that mirror how the POS is meant to work (institutional minimum weight,
   the 50% GCash downpayment, payments recorded vs. "Paid" status, self-approved refunds,
   bursts of refunds or voids, unusually frequent Senior/PWD discounts).
2. Robust statistics: amounts and units far outside the channel's usual range
   (median and MAD on a log scale, so a few big orders don't distort the baseline).
3. A per-channel Isolation Forest (trained by scripts/train_iforest.py) for unusual
   combinations of amount, units, unit price, discount and time of day.

All times are Philippine time (Asia/Manila).
"""

from __future__ import annotations

import json
import math
import pickle
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import structlog

logger = structlog.get_logger()

# ── Business constants (keep in step with api-pos OrderEntryService) ──
INSTITUTIONAL_MIN_KG = 20.0
DOWNPAYMENT_SHARE = 0.5
PESO_TOLERANCE = 1.0  # rounding slack when comparing payments with totals

# ── Detection settings ──
HISTORY_DAYS = 90            # baseline window
FIRST_SCAN_DAYS = 7          # how far back the very first scan looks
MIN_SEGMENT_BASELINE = 20    # orders needed before a channel baseline is trusted
MIN_LOCATION_BASELINE = 30   # orders needed before a branch-specific baseline is used
MIN_HOUR_HISTORY = 100       # branch sales needed before judging the hour of a sale
RARE_HOUR_SHARE = 0.005      # an hour with under 0.5% of a branch's sales is "unusual"
Z_MEDIUM = 3.5               # robust z-score that counts as far outside the usual range
Z_HIGH = 6.0
MAD_FLOOR = 0.05             # minimum spread on the log scale (about ±5%)
BURST_COUNT = 3              # refunds or voids by one person in one day
DISCOUNT_WINDOW_DAYS = 30
DISCOUNT_MIN_COUNT = 8
DISCOUNT_MIN_SHARE = 0.30
DISCOUNT_BRANCH_MULTIPLE = 3.0

WATERMARK_KEY = "pos_probe:anomaly_scan_watermark"
MANILA = timezone(timedelta(hours=8))
MODELS_DIR = Path(__file__).parent.parent.parent / "models" / "artifacts"

SEGMENTS = ("Store", "Bazaar", "Institutional", "Online")
SEGMENT_LABEL = {
    "Store": "walk-in store",
    "Bazaar": "bazaar",
    "Institutional": "institutional",
    "Online": "online",
}
# Walk-in and bazaar sales happen at a counter during a shift, so their hour is meaningful.
HOUR_CHECK_SEGMENTS = {"Store", "Bazaar"}
DISCOUNT_SEGMENTS = {"Store", "Bazaar"}

RISK_RANK = {"Low": 1, "Medium": 2, "High": 3}
MODEL_FEATURES = ["log_total", "log_units", "log_unit_price", "has_discount", "hour_sin", "hour_cos"]

_WEIGHT_RE = re.compile(r"(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>kg|g)\b", re.IGNORECASE)


# ── Small helpers ──

def segment_of(order_type: str | None, order_source: str | None) -> str:
    """The sales channel an order is judged against."""
    if (order_source or "").lower() == "ecommerce" or (order_type or "").lower() == "online":
        return "Online"
    if (order_type or "").lower() == "institutional":
        return "Institutional"
    if (order_type or "").lower() == "bazaar":
        return "Bazaar"
    return "Store"


def parse_weight_kg(variation_name: str | None) -> float | None:
    """Package weight from a variation name such as 'UJM-SM-300|Jar|300g' (same rule as the POS)."""
    match = _WEIGHT_RE.search(variation_name or "")
    if not match:
        return None
    value = float(match.group("value").replace(",", "."))
    if value <= 0:
        return None
    return value if match.group("unit").lower() == "kg" else value / 1000.0


def order_weight_kg(items) -> float | None:
    """Total weight of an order, or None when any line has no readable package size."""
    if not items:
        return None
    total = 0.0
    for item in items:
        kg = parse_weight_kg(item.get("name"))
        if kg is None:
            return None
        total += kg * float(item.get("qty") or 0)
    return total


def peso(value: float) -> str:
    return f"₱{value:,.2f}"


def hour_label(hour: int) -> str:
    suffix = "AM" if hour < 12 else "PM"
    return f"{(hour % 12) or 12} {suffix}"


def _robust_stats(values: pd.Series) -> dict:
    median = float(values.median())
    mad = float((values - median).abs().median())
    return {"median": median, "mad": max(mad, MAD_FLOOR), "n": int(len(values))}


def robust_z(value: float, stats: dict) -> float:
    """How far a value sits from the baseline, in robust standard deviations."""
    return 0.6745 * (value - stats["median"]) / stats["mad"]


def add_model_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Feature columns shared by training and scoring."""
    out = df.copy()
    total = out["total_amount"].astype(float).clip(lower=0)
    units = out["units"].astype(float).clip(lower=0)
    out["log_total"] = np.log1p(total)
    out["log_units"] = np.log1p(units)
    out["log_unit_price"] = np.log1p(np.where(units > 0, total / units.where(units > 0, 1), 0.0))
    out["has_discount"] = out["has_discount"].astype(float)
    hour = out["hour"].astype(float)
    out["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    out["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    return out


def prepare_orders(df: pd.DataFrame) -> pd.DataFrame:
    """Normalise rows read from PostgreSQL: channel, local hour/date, weight, numeric types."""
    if df.empty:
        return df.assign(segment=[], hour=[], local_date=[], weight_kg=[])
    out = df.copy()
    out["segment"] = [segment_of(t, s) for t, s in zip(out["order_type"], out["order_source"])]
    local = pd.to_datetime(out["created_local"])
    out["hour"] = local.dt.hour
    out["local_date"] = local.dt.date
    out["total_amount"] = out["total_amount"].astype(float)
    out["paid_amount"] = out["paid_amount"].astype(float)
    out["units"] = out["units"].astype(float)
    out["has_discount"] = out["has_discount"].astype(bool)
    out["weight_kg"] = [order_weight_kg(items) for items in out["items"]]
    return add_model_columns(out)


# ── Baselines ──

@dataclass
class Baselines:
    segment: dict = field(default_factory=dict)        # segment -> {"total": stats, "units": stats}
    location: dict = field(default_factory=dict)       # (segment, location_id) -> same
    hours: dict = field(default_factory=dict)          # location_id -> {"counts": {hour: n}, "n": total}
    discount: dict = field(default_factory=dict)       # cashier_id -> {"orders", "discounted", "location_id"}
    branch_discount_rate: dict = field(default_factory=dict)  # location_id -> share of discounted sales


def build_baselines(history: pd.DataFrame, now_local: datetime) -> Baselines:
    b = Baselines()
    if history.empty:
        return b

    for seg, group in history.groupby("segment"):
        if len(group) >= MIN_SEGMENT_BASELINE:
            b.segment[seg] = {"total": _robust_stats(group["log_total"]), "units": _robust_stats(group["log_units"])}
    for (seg, loc), group in history.groupby(["segment", "location_id"], dropna=True):
        if len(group) >= MIN_LOCATION_BASELINE:
            b.location[(seg, int(loc))] = {"total": _robust_stats(group["log_total"]), "units": _robust_stats(group["log_units"])}

    counter = history[history["segment"].isin(HOUR_CHECK_SEGMENTS) & history["location_id"].notna()]
    for loc, group in counter.groupby("location_id"):
        b.hours[int(loc)] = {"counts": group["hour"].value_counts().to_dict(), "n": int(len(group))}

    since = (now_local - timedelta(days=DISCOUNT_WINDOW_DAYS)).date()
    recent = counter[pd.to_datetime(counter["local_date"]).dt.date >= since]
    for loc, group in recent.groupby("location_id"):
        b.branch_discount_rate[int(loc)] = float(group["has_discount"].mean()) if len(group) else 0.0
    for cashier, group in recent[recent["cashier_id"].notna()].groupby("cashier_id"):
        b.discount[str(cashier)] = {
            "orders": int(len(group)),
            "discounted": int(group["has_discount"].sum()),
            "location_id": int(group["location_id"].mode().iloc[0]) if group["location_id"].notna().any() else None,
        }
    return b


def _baseline_for(b: Baselines, segment: str, location_id) -> tuple[dict | None, str]:
    if location_id is not None and not pd.isna(location_id) and (segment, int(location_id)) in b.location:
        return b.location[(segment, int(location_id))], "branch"
    return b.segment.get(segment), "channel"


# ── Findings and alerts ──

@dataclass
class Finding:
    code: str
    risk: str
    text: str


@dataclass
class Alert:
    kind: str                 # sale | refund | refund-burst | void-burst | discount-share
    dedup_key: str
    order_id: str
    amount: float
    score: float
    findings: list[Finding]
    segment: str | None
    cashier_id: str | None
    location_id: int | None
    location_name: str | None
    context: dict = field(default_factory=dict)

    @property
    def risk(self) -> str:
        return max((f.risk for f in self.findings), key=lambda r: RISK_RANK[r])

    @property
    def reason(self) -> str:
        return "; ".join(f.text for f in self.findings)


def _none_if_nan(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def evaluate_orders(new_orders: pd.DataFrame, b: Baselines, models: dict | None) -> list[Alert]:
    """Check newly saved or updated orders against their channel's normal pattern and the POS rules."""
    alerts: list[Alert] = []
    if new_orders.empty:
        return alerts

    scores = score_with_models(new_orders, models)

    for idx, row in new_orders.iterrows():
        seg = row["segment"]
        label = SEGMENT_LABEL[seg]
        status = row["order_status"] or ""
        if status in ("Cancelled", "Rejected"):
            continue
        findings: list[Finding] = []
        total = float(row["total_amount"])
        paid = float(row["paid_amount"])

        # 1. Process rules
        weight = _none_if_nan(row["weight_kg"])
        if seg == "Institutional" and weight is not None and weight < INSTITUTIONAL_MIN_KG:
            findings.append(Finding(
                "institutional-under-minimum", "High",
                f"Institutional order weighs {weight:.2f} kg, under the {INSTITUTIONAL_MIN_KG:.0f} kg minimum the POS enforces",
            ))
        if row["payment_status"] == "Paid" and status not in ("Voided",) and paid + PESO_TOLERANCE < total:
            findings.append(Finding(
                "paid-without-payment", "High" if paid <= 0 else "Medium",
                f"Marked Paid, but recorded payments cover only {peso(paid)} of the {peso(total)} total",
            ))
        if row["payment_status"] == "Partial" and paid + PESO_TOLERANCE < total * DOWNPAYMENT_SHARE:
            findings.append(Finding(
                "downpayment-short", "Medium",
                f"Downpayment of {peso(paid)} is below the required {DOWNPAYMENT_SHARE:.0%} ({peso(total * DOWNPAYMENT_SHARE)})",
            ))

        # 2. Amount and units against this channel's usual range
        baseline, scope = _baseline_for(b, seg, row["location_id"])
        context = {"segment": seg}
        if baseline:
            typical_total = math.expm1(baseline["total"]["median"])
            typical_units = math.expm1(baseline["units"]["median"])
            z_total = robust_z(row["log_total"], baseline["total"])
            z_units = robust_z(row["log_units"], baseline["units"])
            where = f"at {row['location_name']}" if scope == "branch" and row["location_name"] else "across all branches"
            context.update({
                "typical_amount": round(typical_total, 2),
                "typical_units": round(typical_units, 1),
                "baseline_orders": baseline["total"]["n"],
                "baseline_scope": where,
                "z_amount": round(z_total, 2),
                "z_units": round(z_units, 2),
            })
            if z_total >= Z_MEDIUM:
                findings.append(Finding(
                    "amount-high", "High" if z_total >= Z_HIGH else "Medium",
                    f"{peso(total)} is {total / max(typical_total, 1):.1f}× a typical {label} order {where} ({peso(typical_total)})",
                ))
            if z_units >= Z_MEDIUM:
                findings.append(Finding(
                    "units-high", "High" if z_units >= Z_HIGH else "Medium",
                    f"{row['units']:.0f} units, against a typical {typical_units:.0f} for a {label} order {where}",
                ))

        # 3. Hour of a counter sale, against this branch's own trading hours
        loc = _none_if_nan(row["location_id"])
        if seg in HOUR_CHECK_SEGMENTS and loc is not None and int(loc) in b.hours:
            hours = b.hours[int(loc)]
            at_hour = hours["counts"].get(int(row["hour"]), 0)
            if hours["n"] >= MIN_HOUR_HISTORY and at_hour / hours["n"] < RARE_HOUR_SHARE:
                findings.append(Finding(
                    "unusual-hour", "Medium",
                    f"Rung up at {hour_label(int(row['hour']))}, when {row['location_name'] or 'this branch'} rarely sells ({at_hour} of its last {hours['n']} sales)",
                ))

        # 4. Isolation Forest: an unusual combination for this channel
        score, flag = scores.get(idx, (0.0, None))
        if flag and not any(f.code in ("amount-high", "units-high") for f in findings):
            findings.append(Finding(
                "model-outlier", flag,
                f"Unusual combination of amount, units, price per unit, discount and time for a {label} order",
            ))

        if findings:
            codes = "+".join(sorted(f.code for f in findings))
            alerts.append(Alert(
                kind="sale",
                dedup_key=f"sale:{row['order_id']}:{codes}",
                order_id=str(row["order_number"] or row["order_id"]),
                amount=total,
                score=float(score),
                findings=findings,
                segment=seg,
                cashier_id=_none_if_nan(row["cashier_id"]),
                location_id=int(loc) if loc is not None else None,
                location_name=_none_if_nan(row["location_name"]),
                context=context,
            ))
    return alerts


def evaluate_discount_share(new_orders: pd.DataFrame, b: Baselines, today_local) -> list[Alert]:
    """Cashiers granting Senior/PWD discounts far more often than their branch does."""
    alerts: list[Alert] = []
    if new_orders.empty:
        return alerts
    active = new_orders[new_orders["segment"].isin(DISCOUNT_SEGMENTS) & new_orders["has_discount"] & new_orders["cashier_id"].notna()]
    week = today_local.isocalendar()
    for cashier in sorted(set(active["cashier_id"].astype(str))):
        stats = b.discount.get(cashier)
        if not stats or stats["discounted"] < DISCOUNT_MIN_COUNT:
            continue
        share = stats["discounted"] / max(stats["orders"], 1)
        branch_rate = b.branch_discount_rate.get(stats["location_id"], 0.0)
        if share >= max(DISCOUNT_MIN_SHARE, DISCOUNT_BRANCH_MULTIPLE * branch_rate):
            last = active[active["cashier_id"].astype(str) == cashier].iloc[-1]
            alerts.append(Alert(
                kind="discount-share",
                dedup_key=f"discount-share:{cashier}:{week[0]}-W{week[1]}",
                order_id=str(last["order_number"] or last["order_id"]),
                amount=float(last["total_amount"]),
                score=0.0,
                findings=[Finding(
                    "discount-share", "Medium",
                    f"Senior/PWD discount on {stats['discounted']} of this cashier's {stats['orders']} sales in the last {DISCOUNT_WINDOW_DAYS} days "
                    f"({share:.0%}), against {branch_rate:.0%} for the branch",
                )],
                segment=last["segment"],
                cashier_id=cashier,
                location_id=_none_if_nan(last["location_id"]),
                location_name=_none_if_nan(last["location_name"]),
            ))
    return alerts


def evaluate_refunds(refunds: pd.DataFrame, b: Baselines) -> list[Alert]:
    """Refund requests: self-approval and refunds far larger than the channel's usual sale."""
    alerts: list[Alert] = []
    for _, row in refunds.iterrows():
        findings: list[Finding] = []
        seg = segment_of(row["order_type"], row["order_source"])
        amount = float(row["refund_amount"] or 0)
        if row["status"] == "Approved" and row["approved_by"] is not None and str(row["approved_by"]) == str(row["requested_by"]):
            findings.append(Finding("refund-self-approved", "High", "Refund approved by the same person who requested it"))
        baseline, scope = _baseline_for(b, seg, row["location_id"])
        if baseline and amount > 0:
            z = robust_z(math.log1p(amount), baseline["total"])
            typical = math.expm1(baseline["total"]["median"])
            if z >= Z_MEDIUM:
                findings.append(Finding(
                    "refund-large", "High" if z >= Z_HIGH else "Medium",
                    f"Refund of {peso(amount)} is {amount / max(typical, 1):.1f}× a typical {SEGMENT_LABEL[seg]} sale ({peso(typical)})",
                ))
        if findings:
            alerts.append(Alert(
                kind="refund",
                dedup_key=f"refund:{row['refund_id']}:{'+'.join(sorted(f.code for f in findings))}",
                order_id=str(row["order_number"] or row["order_id"]),
                amount=amount,
                score=0.0,
                findings=findings,
                segment=seg,
                cashier_id=_none_if_nan(str(row["requested_by"]) if row["requested_by"] is not None else None),
                location_id=_none_if_nan(row["location_id"]),
                location_name=_none_if_nan(row["location_name"]),
            ))
    return alerts


def evaluate_bursts(events: pd.DataFrame, kind: str, noun: str) -> list[Alert]:
    """Several refunds (or voids) by one person on one day."""
    alerts: list[Alert] = []
    if events.empty:
        return alerts
    for (person, day), group in events.dropna(subset=["person_id"]).groupby(["person_id", "local_date"]):
        if len(group) < BURST_COUNT:
            continue
        last = group.iloc[-1]
        alerts.append(Alert(
            kind=kind,
            dedup_key=f"{kind}:{person}:{day}:{len(group) // BURST_COUNT}",
            order_id=str(last["order_number"] or last["order_id"]),
            amount=float(group["amount"].sum()),
            score=0.0,
            findings=[Finding(kind, "Medium", f"{len(group)} {noun} by the same person on {day:%b %d}, totalling {peso(float(group['amount'].sum()))}")],
            segment=None,
            cashier_id=str(person),
            location_id=_none_if_nan(last["location_id"]),
            location_name=_none_if_nan(last["location_name"]),
        ))
    return alerts


# ── Isolation Forest models ──

def load_models() -> dict | None:
    """Latest per-channel model artifact, or None (rules and statistics still run without it)."""
    files = sorted(MODELS_DIR.glob("iforest_*.pkl"), reverse=True)
    if not files:
        return None
    try:
        with open(files[0], "rb") as f:
            artifacts = pickle.load(f)
    except Exception as e:  # a corrupt artifact must not stop detection
        logger.warning("anomaly_model_load_failed", error=str(e))
        return None
    # Older artifacts were one model for every channel; they are ignored.
    return artifacts if isinstance(artifacts, dict) and "segments" in artifacts else None


def score_with_models(df: pd.DataFrame, models: dict | None) -> dict:
    """{row index: (decision score, risk or None)} using the order's own channel model."""
    results: dict = {}
    if not models or df.empty:
        return results
    for seg, group in df.groupby("segment"):
        entry = models["segments"].get(seg)
        if not entry:
            continue
        X = entry["scaler"].transform(group[MODEL_FEATURES].values)
        scores = entry["model"].decision_function(X)
        for idx, score in zip(group.index, scores):
            flag = None
            if score < entry["threshold_high"]:
                flag = "High"
            elif score < 0:  # below the model's own cut-off (its contamination rate)
                flag = "Medium"
            results[idx] = (float(score), flag)
    return results


# ── PostgreSQL reads (read-only connection from the sync pipeline) ──

_ORDERS_SQL = """
    SELECT
        o."OrderId"                             AS order_id,
        o."OrderNumber"                         AS order_number,
        o."OrderType"                           AS order_type,
        o."OrderSource"                         AS order_source,
        o."LocationId"                          AS location_id,
        l."LocationName"                        AS location_name,
        o."SubmittedBy"::TEXT                   AS cashier_id,
        (o."CreatedAt" AT TIME ZONE 'Asia/Manila') AS created_local,
        o."TotalAmount"::FLOAT                  AS total_amount,
        o."PaymentMethod"                       AS payment_method,
        o."PaymentStatus"                       AS payment_status,
        o."OrderStatus"                         AS order_status,
        (o."SeniorPwdId" IS NOT NULL AND o."SeniorPwdId" <> '') AS has_discount,
        COALESCE(i.units, 0)                    AS units,
        COALESCE(i.items, '[]'::json)           AS items,
        COALESCE(p.paid, 0)::FLOAT              AS paid_amount
    FROM "Orders" o
    LEFT JOIN "Locations" l ON l."LocationId" = o."LocationId"
    LEFT JOIN LATERAL (
        SELECT SUM(oi."Quantity") AS units,
               json_agg(json_build_object('name', pv."VariationName", 'qty', oi."Quantity")) AS items
        FROM "OrderItems" oi
        JOIN "ProductVariations" pv ON pv."VariationId" = oi."VariationId"
        WHERE oi."OrderId" = o."OrderId"
    ) i ON TRUE
    LEFT JOIN LATERAL (
        SELECT SUM(pay."AmountPaid") AS paid
        FROM "Payments" pay
        WHERE pay."OrderId" = o."OrderId" AND pay."PaymentStatus" IN ('Success', 'Paid')
    ) p ON TRUE
    WHERE {where}
    ORDER BY o."CreatedAt"
"""

_REFUNDS_SQL = """
    SELECT
        rr."RefundRequestId"                    AS refund_id,
        rr."OrderId"                            AS order_id,
        o."OrderNumber"                         AS order_number,
        o."OrderType"                           AS order_type,
        o."OrderSource"                         AS order_source,
        rr."LocationId"                         AS location_id,
        l."LocationName"                        AS location_name,
        rr."Status"                             AS status,
        rr."RequestedBy"::TEXT                  AS requested_by,
        rr."ApprovedBy"::TEXT                   AS approved_by,
        (rr."CreatedAt" AT TIME ZONE 'Asia/Manila') AS created_local,
        COALESCE((
            SELECT oi."UnitPrice" * rr."QuantityToReturn"
            FROM "OrderItems" oi
            WHERE oi."OrderId" = rr."OrderId" AND oi."VariationId" = rr."VariationId"
            LIMIT 1
        ), 0)::FLOAT                            AS refund_amount
    FROM "RefundRequests" rr
    JOIN "Orders" o ON o."OrderId" = rr."OrderId"
    LEFT JOIN "Locations" l ON l."LocationId" = rr."LocationId"
    WHERE {where}
    ORDER BY rr."CreatedAt"
"""

_VOIDS_SQL = """
    SELECT
        o."OrderId"                             AS order_id,
        o."OrderNumber"                         AS order_number,
        o."SubmittedBy"::TEXT                   AS person_id,
        o."LocationId"                          AS location_id,
        l."LocationName"                        AS location_name,
        o."TotalAmount"::FLOAT                  AS amount,
        (o."UpdatedAt" AT TIME ZONE 'Asia/Manila')::DATE AS local_date
    FROM "Orders" o
    LEFT JOIN "Locations" l ON l."LocationId" = o."LocationId"
    WHERE o."OrderStatus" = 'Voided' AND o."UpdatedAt" >= %(since)s
    ORDER BY o."UpdatedAt"
"""


def _query(cursor, sql: str, params: dict) -> pd.DataFrame:
    cursor.execute(sql, params)
    columns = [d[0] for d in cursor.description]
    return pd.DataFrame(cursor.fetchall(), columns=columns)


def fetch_order_history(cursor, since: datetime) -> pd.DataFrame:
    where = """o."CreatedAt" >= %(since)s AND o."OrderStatus" NOT IN ('Cancelled', 'Rejected', 'Voided')"""
    return prepare_orders(_query(cursor, _ORDERS_SQL.format(where=where), {"since": since}))


def fetch_changed_orders(cursor, since: datetime) -> pd.DataFrame:
    return prepare_orders(_query(cursor, _ORDERS_SQL.format(where='o."UpdatedAt" > %(since)s'), {"since": since}))


def fetch_changed_refunds(cursor, since: datetime) -> pd.DataFrame:
    return _query(cursor, _REFUNDS_SQL.format(where='rr."UpdatedAt" > %(since)s'), {"since": since})


def fetch_recent_refunds(cursor, since: datetime) -> pd.DataFrame:
    df = _query(cursor, _REFUNDS_SQL.format(where='rr."CreatedAt" >= %(since)s'), {"since": since})
    if df.empty:
        return df
    return df.assign(
        person_id=df["requested_by"],
        local_date=pd.to_datetime(df["created_local"]).dt.date,
        amount=df["refund_amount"].astype(float),
    )


def fetch_recent_voids(cursor, since: datetime) -> pd.DataFrame:
    return _query(cursor, _VOIDS_SQL, {"since": since})


# ── DuckDB writes ──

def ensure_alert_columns(conn) -> None:
    """Extra columns for business-aware alerts (older rows keep NULLs)."""
    for column, kind in (("order_type", "VARCHAR"), ("alert_kind", "VARCHAR"), ("dedup_key", "VARCHAR"), ("details", "VARCHAR")):
        conn.execute(f"ALTER TABLE anomaly_alerts ADD COLUMN IF NOT EXISTS {column} {kind}")


def explanation_for(alert: Alert) -> dict:
    """Plain-language explanation stored with the alert and shown by /alerts/{id}/explain."""
    ctx = alert.context
    parts = []
    if alert.segment:
        parts.append(f"This is a {SEGMENT_LABEL[alert.segment]} transaction, so it was compared only with other {SEGMENT_LABEL[alert.segment]} orders.")
    if "typical_amount" in ctx:
        parts.append(
            f"A typical {SEGMENT_LABEL[alert.segment]} order {ctx['baseline_scope']} is {peso(ctx['typical_amount'])} "
            f"and {ctx['typical_units']:.0f} units, based on {ctx['baseline_orders']} orders from the last {HISTORY_DAYS} days."
        )
    parts.append("Why it was flagged: " + "; ".join(f.text for f in alert.findings) + ".")
    parts.append("A flag means the transaction needs a second look; it is not proof of wrongdoing.")
    return {
        "explanation": parts,
        "typical_amount": ctx.get("typical_amount"),
        "typical_units": ctx.get("typical_units"),
        "baseline_orders": ctx.get("baseline_orders"),
        "codes": [f.code for f in alert.findings],
    }


def save_alerts(conn, alerts: list[Alert], now_utc: datetime) -> list[dict]:
    """Insert alerts that haven't been raised before; returns the saved rows for broadcasting."""
    saved = []
    for alert in alerts:
        exists = conn.execute("SELECT 1 FROM anomaly_alerts WHERE dedup_key = ? LIMIT 1", [alert.dedup_key]).fetchone()
        if exists:
            continue
        alert_id = f"ALT-{uuid.uuid4().hex[:12]}"
        conn.execute(
            """
            INSERT INTO anomaly_alerts (alert_id, order_id, transaction_amount, anomaly_score, risk_level, reason,
                                        cashier_id, cashier_name, location_id, location_name, detected_at, status,
                                        order_type, alert_kind, dedup_key, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'New', ?, ?, ?, ?)
            """,
            [
                alert_id, alert.order_id, round(alert.amount, 2), round(alert.score, 4), alert.risk, alert.reason,
                alert.cashier_id, alert.location_id, alert.location_name, now_utc.replace(tzinfo=None),
                alert.segment, alert.kind, alert.dedup_key, json.dumps(explanation_for(alert)),
            ],
        )
        saved.append({
            "alert_id": alert_id,
            "order_id": alert.order_id,
            "transaction_amount": round(alert.amount, 2),
            "anomaly_score": round(alert.score, 4),
            "risk_level": alert.risk,
            "reason": alert.reason,
            "cashier_id": alert.cashier_id,
            "cashier_name": None,
            "location_id": alert.location_id,
            "location_name": alert.location_name,
            "detected_at": now_utc.isoformat(),
            "status": "New",
        })
    return saved


# ── Entry point ──

def _get_watermark(redis_client, now_utc: datetime) -> datetime:
    try:
        value = redis_client.get(WATERMARK_KEY)
        if value:
            return datetime.fromisoformat(value)
    except Exception as e:
        logger.warning("anomaly_watermark_read_failed", error=str(e))
    return now_utc - timedelta(days=FIRST_SCAN_DAYS)


def scan_for_anomalies(pg_conn, duck_conn, redis_client) -> list[dict]:
    """Check orders and refunds changed since the last scan. Returns the alerts saved this run."""
    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(MANILA)
    since = _get_watermark(redis_client, now_utc)
    cursor = pg_conn.cursor()
    try:
        history = fetch_order_history(cursor, now_utc - timedelta(days=HISTORY_DAYS))
        changed = fetch_changed_orders(cursor, since)
        refunds = fetch_changed_refunds(cursor, since)
        recent_refunds = fetch_recent_refunds(cursor, now_utc - timedelta(days=2))
        recent_voids = fetch_recent_voids(cursor, now_utc - timedelta(days=2))
    finally:
        cursor.close()

    baselines = build_baselines(history, now_local)
    models = load_models()

    alerts = (
        evaluate_orders(changed, baselines, models)
        + evaluate_discount_share(changed, baselines, now_local.date())
        + evaluate_refunds(refunds, baselines)
        + evaluate_bursts(recent_refunds, "refund-burst", "refund requests")
        + evaluate_bursts(recent_voids, "void-burst", "voided sales")
    )

    ensure_alert_columns(duck_conn)
    saved = save_alerts(duck_conn, alerts, now_utc)

    try:
        redis_client.set(WATERMARK_KEY, now_utc.isoformat())
    except Exception as e:
        logger.warning("anomaly_watermark_write_failed", error=str(e))

    logger.info(
        "anomaly_scan_completed",
        orders_checked=len(changed),
        refunds_checked=len(refunds),
        alerts_found=len(alerts),
        alerts_saved=len(saved),
        model_channels=sorted(models["segments"]) if models else [],
    )
    return saved
