"""
US-PROBE-016: Isolation Forest training, one model per sales channel.

Walk-in, bazaar, institutional and online orders have very different sizes (an institutional
order must weigh at least 20 kg), so each channel gets its own model trained on whole orders
from the POS database. The detection engine (app/services/anomaly_engine.py) scores each new
order with its own channel's model, using the same features:

    log(total), log(units), log(price per unit), Senior/PWD discount, hour of day (cyclical)

Evaluation: there are no confirmed fraud labels, so each model is checked against proxy labels
(an order far outside its channel's usual amount, units or price per unit, by robust z-score).
Precision, recall and F1 show how well the model agrees with those proxies; they are a sanity
check, not a measured fraud-detection rate.

Usage: python scripts/train_iforest.py [contamination]   (default 0.01 = 1% of orders)
"""

import sys
import pickle
from pathlib import Path
from datetime import datetime, timedelta, timezone

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import psycopg2  # noqa: E402
from sklearn.ensemble import IsolationForest  # noqa: E402
from sklearn.preprocessing import StandardScaler  # noqa: E402
from sklearn.metrics import classification_report, confusion_matrix  # noqa: E402

from app.config.settings import get_settings  # noqa: E402
from app.services.anomaly_engine import (  # noqa: E402
    MODEL_FEATURES, SEGMENTS, SEGMENT_LABEL, Z_MEDIUM, _robust_stats, fetch_order_history, robust_z,
)

MODELS_DIR = BASE_DIR / "models" / "artifacts"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

TRAINING_DAYS = 180
MIN_TRAINING_ORDERS = 40


def proxy_labels(group: pd.DataFrame) -> np.ndarray:
    """1 where an order is far outside its channel's usual amount, units or price per unit."""
    labels = np.zeros(len(group), dtype=int)
    for column in ("log_total", "log_units", "log_unit_price"):
        stats = _robust_stats(group[column])
        z = group[column].apply(lambda v: abs(robust_z(v, stats)))
        labels |= (z >= Z_MEDIUM).to_numpy().astype(int)
    return labels


def main():
    contamination = float(sys.argv[1]) if len(sys.argv) > 1 else 0.01
    print("=" * 60)
    print("US-PROBE-016: Isolation Forest training (per channel)")
    print("=" * 60)
    print(f"Contamination: {contamination}")

    settings = get_settings()
    conn = psycopg2.connect(settings.postgres_dsn)
    conn.set_session(readonly=True)
    try:
        cursor = conn.cursor()
        orders = fetch_order_history(cursor, datetime.now(timezone.utc) - timedelta(days=TRAINING_DAYS))
        cursor.close()
    finally:
        conn.close()
    print(f"Loaded {len(orders):,} orders from the last {TRAINING_DAYS} days")

    segments = {}
    all_true, all_pred = [], []
    for seg in SEGMENTS:
        group = orders[orders["segment"] == seg].reset_index(drop=True)
        print(f"\n── {SEGMENT_LABEL[seg]} ({len(group):,} orders) ──")
        if len(group) < MIN_TRAINING_ORDERS:
            print(f"  Skipped: needs at least {MIN_TRAINING_ORDERS} orders. Rules and statistics still cover this channel.")
            continue

        scaler = StandardScaler()
        X = scaler.fit_transform(group[MODEL_FEATURES].values)
        model = IsolationForest(n_estimators=200, contamination=contamination, random_state=42, n_jobs=-1)
        model.fit(X)
        scores = model.decision_function(X)
        predicted = (scores < 0).astype(int)

        segments[seg] = {
            "model": model,
            "scaler": scaler,
            "n": int(len(group)),
            # The most extreme fifth of flagged orders are High risk.
            "threshold_high": float(np.quantile(scores, contamination / 5)),
        }
        labels = proxy_labels(group)
        all_true.extend(labels.tolist())
        all_pred.extend(predicted.tolist())
        print(f"  Flagged {predicted.sum():,} orders; {labels.sum():,} are outside the usual range")

    if not segments:
        print("\nNo channel had enough orders to train a model. Nothing saved.")
        return

    cm = confusion_matrix(all_true, all_pred, labels=[0, 1])
    report = classification_report(all_true, all_pred, labels=[0, 1], target_names=["Normal", "Anomaly"], output_dict=True, zero_division=0)
    print("\n── Agreement with proxy labels (all channels) ──")
    print(f"  TN={cm[0][0]:,}  FP={cm[0][1]:,}")
    print(f"  FN={cm[1][0]:,}  TP={cm[1][1]:,}")
    print(f"  Precision: {report['Anomaly']['precision']:.4f}")
    print(f"  Recall:    {report['Anomaly']['recall']:.4f}")
    print(f"  F1-Score:  {report['Anomaly']['f1-score']:.4f}")

    artifacts = {
        "version": 2,
        "segments": segments,
        "feature_names": MODEL_FEATURES,
        "contamination": contamination,
        "training_days": TRAINING_DAYS,
        "metrics": {
            "precision": report["Anomaly"]["precision"],
            "recall": report["Anomaly"]["recall"],
            "f1_score": report["Anomaly"]["f1-score"],
            "confusion_matrix": cm.tolist(),
            "label_source": "proxy: robust z-score >= 3.5 on amount, units or price per unit within the channel",
        },
        "trained_at": datetime.now().isoformat(),
    }
    model_path = MODELS_DIR / f"iforest_{datetime.now().strftime('%Y%m%d')}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(artifacts, f)
    print(f"\nModel saved to: {model_path}")


if __name__ == "__main__":
    main()
