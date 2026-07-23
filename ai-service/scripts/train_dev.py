"""
DEV ONLY: Force-train ALL models (forecast + anomaly detection) with whatever data is available.
Bypasses the 30-day minimum threshold so you can test the full pipeline
even with just a few days of transactions.

Usage:
    python scripts/train_dev.py
"""

import sys
import pickle
import warnings
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import duckdb
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix

warnings.filterwarnings("ignore")

# ── Paths ──
BASE_DIR = Path(__file__).parent.parent
DUCKDB_PATH = BASE_DIR / "data" / "analytics.duckdb"
MODELS_DIR = BASE_DIR / "models" / "artifacts"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Minimum days required to even attempt training (dev override: 2 days)
MIN_DAYS = 2

# ── Check if Prophet is functional ──
PROPHET_AVAILABLE = False
try:
    from prophet import Prophet

    _test = Prophet()
    _test.fit(pd.DataFrame({"ds": pd.date_range("2025-01-01", periods=30), "y": range(30)}))
    PROPHET_AVAILABLE = True
    del _test
except Exception:
    pass

# ── Philippine Holidays ──
PH_HOLIDAY_DATES = [
    "2025-08-21", "2025-08-25", "2025-11-01", "2025-11-30",
    "2025-12-24", "2025-12-25", "2025-12-30", "2025-12-31",
    "2026-01-01", "2026-02-14", "2026-04-09", "2026-05-01",
    "2026-05-11", "2026-06-12",
]


def load_variation_data(conn: duckdb.DuckDBPyConnection, variation_id: int) -> pd.DataFrame:
    """Load daily aggregated sales for a specific variation."""
    query = """
        SELECT
            CAST(transaction_date AS DATE) AS ds,
            SUM(quantity) AS y
        FROM sales_transactions
        WHERE variation_id = ?
          AND is_refund = FALSE
        GROUP BY ds
        ORDER BY ds
    """
    df = conn.execute(query, [variation_id]).fetchdf()
    df["ds"] = pd.to_datetime(df["ds"])

    if len(df) > 0:
        full_range = pd.date_range(start=df["ds"].min(), end=df["ds"].max(), freq="D")
        df = df.set_index("ds").reindex(full_range, fill_value=0).reset_index()
        df.columns = ["ds", "y"]

    return df


def train_with_prophet(df: pd.DataFrame, variation_name: str) -> tuple[object, dict]:
    """Train using Facebook Prophet."""
    from prophet import Prophet

    holidays_df = pd.DataFrame({
        "holiday": "ph_holiday",
        "ds": pd.to_datetime(PH_HOLIDAY_DATES),
        "lower_window": 0,
        "upper_window": 1,
    })

    split_idx = max(int(len(df) * 0.8), 2)
    train_df = df[:split_idx]
    test_df = df[split_idx:] if split_idx < len(df) else df[-1:]

    best_model = None
    best_mape = float("inf")
    best_params = {}

    for cps in [0.01, 0.05, 0.1, 0.5]:
        try:
            model = Prophet(
                changepoint_prior_scale=cps,
                seasonality_prior_scale=10,
                yearly_seasonality=False if len(df) < 365 else True,
                weekly_seasonality=True if len(df) >= 14 else False,
                daily_seasonality=False,
                holidays=holidays_df,
            )
            model.fit(train_df)

            future = model.make_future_dataframe(periods=len(test_df))
            forecast = model.predict(future)
            test_forecast = forecast.tail(len(test_df))

            actual = test_df["y"].values
            predicted = test_forecast["yhat"].values

            mask = actual > 0
            mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100 if mask.sum() > 0 else 0

            if mape < best_mape:
                best_mape = mape
                best_model = model
                best_params = {"changepoint_prior_scale": cps}
        except Exception:
            continue

    if best_model is None:
        # fallback: just fit with defaults
        model = Prophet(yearly_seasonality=False, weekly_seasonality=False, daily_seasonality=False)
        model.fit(train_df)
        best_model = model
        best_mape = 0
        best_params = {"fallback": True}

    future = best_model.make_future_dataframe(periods=len(test_df))
    forecast = best_model.predict(future)
    test_forecast = forecast.tail(len(test_df))
    actual = test_df["y"].values
    predicted = test_forecast["yhat"].values

    mae = np.mean(np.abs(actual - predicted))
    ss_res = np.sum((actual - predicted) ** 2)
    ss_tot = np.sum((actual - np.mean(actual)) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    metrics = {
        "variation_name": variation_name,
        "mape": round(best_mape, 2),
        "mae": round(mae, 2),
        "r_squared": round(r_squared, 4),
        "best_params": best_params,
        "train_size": len(train_df),
        "test_size": len(test_df),
        "engine": "prophet",
        "dev_mode": True,
    }

    return best_model, metrics


def train_with_statsmodels(df: pd.DataFrame, variation_name: str) -> tuple[object, dict]:
    """
    Fallback: Train using statsmodels Exponential Smoothing.
    Relaxed for dev — handles very short series gracefully.
    """
    from statsmodels.tsa.holtwinters import ExponentialSmoothing

    split_idx = max(int(len(df) * 0.8), 2)
    train_df = df[:split_idx].copy()
    test_df = df[split_idx:] if split_idx < len(df) else df[-1:].copy()

    train_series = train_df.set_index("ds")["y"].asfreq("D", fill_value=0)
    train_series = train_series.clip(lower=0) + 0.1

    best_model = None
    best_mape = float("inf")
    best_params = {}

    # Adapt configs based on data length
    configs = []
    if len(train_series) >= 30:
        configs.append({"trend": "add", "seasonal": "add", "seasonal_periods": 30})
    if len(train_series) >= 14:
        configs.append({"trend": "add", "seasonal": "add", "seasonal_periods": 7})
        configs.append({"trend": "add", "seasonal": "mul", "seasonal_periods": 7})
    # Always try simple trend-only
    configs.append({"trend": "add", "seasonal": None, "seasonal_periods": None})

    for cfg in configs:
        try:
            kwargs = {"endog": train_series, "trend": cfg["trend"]}
            if cfg["seasonal"]:
                kwargs["seasonal"] = cfg["seasonal"]
                kwargs["seasonal_periods"] = cfg["seasonal_periods"]

            model = ExponentialSmoothing(**kwargs).fit(optimized=True)

            predicted = model.forecast(len(test_df)).values
            actual = test_df["y"].values

            mask = actual > 0
            mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100 if mask.sum() > 0 else 0

            if mape < best_mape:
                best_mape = mape
                best_model = model
                best_params = cfg
        except Exception:
            continue

    if best_model is None:
        mean_val = train_df["y"].mean()
        best_params = {"method": "mean_fallback"}

        class MeanModel:
            def __init__(self, mean):
                self._mean = mean

            def forecast(self, steps):
                return pd.Series([self._mean] * steps)

        best_model = MeanModel(mean_val)
        actual = test_df["y"].values
        predicted = np.full(len(test_df), mean_val)
        mask = actual > 0
        best_mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100 if mask.sum() > 0 else 0

    # Final metrics
    predicted = best_model.forecast(len(test_df))
    if hasattr(predicted, "values"):
        predicted = predicted.values
    actual = test_df["y"].values

    mae = np.mean(np.abs(actual - predicted))
    ss_res = np.sum((actual - predicted) ** 2)
    ss_tot = np.sum((actual - np.mean(actual)) ** 2)
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

    model_wrapper = {
        "model": best_model,
        "train_end": train_df["ds"].max(),
        "mean_y": float(train_df["y"].mean()),
        "std_y": float(train_df["y"].std()) if train_df["y"].std() > 0 else 1.0,
    }

    metrics = {
        "variation_name": variation_name,
        "mape": round(best_mape, 2),
        "mae": round(mae, 2),
        "r_squared": round(r_squared, 4),
        "best_params": best_params,
        "train_size": len(train_df),
        "test_size": len(test_df),
        "engine": "statsmodels",
        "dev_mode": True,
    }

    return model_wrapper, metrics


def load_transaction_data(conn: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Load all transaction data for anomaly detection training."""
    query = """
        SELECT
            transaction_id,
            total_amount,
            quantity,
            discount_amount,
            discount_type,
            EXTRACT(HOUR FROM transaction_date) AS hour_of_day,
            EXTRACT(DOW FROM transaction_date) AS day_of_week,
            is_refund
        FROM sales_transactions
        ORDER BY transaction_date
    """
    return conn.execute(query).fetchdf()


def engineer_anomaly_features(df: pd.DataFrame) -> tuple[np.ndarray, StandardScaler, list[str]]:
    """
    Transform raw transaction data into ML features for anomaly detection:
    - Cyclical encoding for hour_of_day and day_of_week
    - Numeric features scaled with StandardScaler
    """
    features = pd.DataFrame()

    # Numeric features
    features["total_amount"] = df["total_amount"].astype(float)
    features["quantity"] = df["quantity"].astype(float)
    features["discount_amount"] = df["discount_amount"].astype(float)

    # Cyclical encoding: hour_of_day (0-23)
    hour = df["hour_of_day"].astype(float)
    features["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    features["hour_cos"] = np.cos(2 * np.pi * hour / 24)

    # Cyclical encoding: day_of_week (0-6)
    dow = df["day_of_week"].astype(float)
    features["dow_sin"] = np.sin(2 * np.pi * dow / 7)
    features["dow_cos"] = np.cos(2 * np.pi * dow / 7)

    # One-Hot: has discount
    features["has_discount"] = (df["discount_type"].notna()).astype(float)

    # Is refund flag
    features["is_refund"] = df["is_refund"].astype(float)

    # Scale
    feature_names = features.columns.tolist()
    scaler = StandardScaler()
    X = scaler.fit_transform(features.values)

    return X, scaler, feature_names


def create_synthetic_anomaly_labels(df: pd.DataFrame) -> np.ndarray:
    """
    Create synthetic ground-truth labels for validation.
    Marks transactions as anomalous based on known suspicious patterns:
    - Very high amounts (>3 std from mean)
    - Refunds at unusual hours (before 9am or after 8pm)
    - Extremely high quantities (>5)
    - High discount on high-value orders
    """
    labels = np.zeros(len(df))

    mean_amount = df["total_amount"].mean()
    std_amount = df["total_amount"].std() if df["total_amount"].std() > 0 else 1.0

    for i, row in df.iterrows():
        # Pattern 1: Unusually high amount
        if row["total_amount"] > mean_amount + 3 * std_amount:
            labels[i] = 1

        # Pattern 2: Refund at unusual hours
        if row["is_refund"] and (row["hour_of_day"] < 9 or row["hour_of_day"] > 20):
            labels[i] = 1

        # Pattern 3: Extremely high quantity
        if row["quantity"] > 5:
            labels[i] = 1

        # Pattern 4: Large discount on already discounted item
        if row["discount_amount"] > 0 and row["total_amount"] > mean_amount + 2 * std_amount:
            labels[i] = 1

    return labels


def train_isolation_forest(conn: duckdb.DuckDBPyConnection, timestamp: str) -> dict | None:
    """
    Train Isolation Forest on whatever transaction data exists.
    No minimum data threshold — works even with a handful of transactions.
    """
    df = load_transaction_data(conn)

    if len(df) < 2:
        print("  ❌ Not enough transactions (need at least 2)")
        return None

    print(f"  Loaded {len(df):,} transactions")

    # Feature engineering
    print("  Engineering features (cyclical encoding, scaling)...")
    X, scaler, feature_names = engineer_anomaly_features(df)
    print(f"  Feature matrix shape: {X.shape}")

    # Adjust contamination based on data size
    # With very few records, use a lower contamination to avoid marking everything as anomaly
    if len(df) < 20:
        contamination = 0.1
    elif len(df) < 100:
        contamination = 0.08
    else:
        contamination = 0.05

    print(f"  Contamination rate: {contamination} (auto-adjusted for {len(df)} records)")

    # Train Isolation Forest
    print(f"  Training Isolation Forest...")
    model = IsolationForest(
        n_estimators=min(200, max(50, len(df))),  # Adapt estimators to data size
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X)

    # Predict on training data
    predictions = model.predict(X)  # 1 = normal, -1 = anomaly
    predicted_labels = (predictions == -1).astype(int)
    anomalies_detected = int(predicted_labels.sum())

    print(f"  Anomalies detected: {anomalies_detected}/{len(df)}")

    # Synthetic ground truth for validation
    true_labels = create_synthetic_anomaly_labels(df)

    # Metrics (handle case where there might be no true anomalies in small data)
    try:
        report = classification_report(
            true_labels, predicted_labels,
            target_names=["Normal", "Anomaly"],
            output_dict=True,
            zero_division=0,
        )
        cm = confusion_matrix(true_labels, predicted_labels)

        print(f"\n  ── Confusion Matrix ──")
        print(f"    TN={cm[0][0]:,}  FP={cm[0][1]:,}")
        print(f"    FN={cm[1][0]:,}  TP={cm[1][1]:,}")
        print(f"  Precision (Anomaly): {report['Anomaly']['precision']:.4f}")
        print(f"  Recall (Anomaly):    {report['Anomaly']['recall']:.4f}")
        print(f"  F1-Score (Anomaly):  {report['Anomaly']['f1-score']:.4f}")

        f1 = report['Anomaly']['f1-score']
        precision = report['Anomaly']['precision']
        recall = report['Anomaly']['recall']
    except Exception:
        f1 = 0.0
        precision = 0.0
        recall = 0.0
        cm = np.array([[len(df) - anomalies_detected, anomalies_detected], [0, 0]])

    # Serialize artifacts
    artifacts = {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_names,
        "contamination": contamination,
        "metrics": {
            "precision": precision,
            "recall": recall,
            "f1_score": f1,
            "confusion_matrix": cm.tolist(),
        },
        "trained_at": datetime.now().isoformat(),
        "dev_mode": True,
    }

    model_path = MODELS_DIR / f"iforest_{timestamp}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(artifacts, f)

    print(f"  ✅ Isolation Forest saved to: {model_path}")

    return {
        "total_transactions": len(df),
        "anomalies_detected": anomalies_detected,
        "f1_score": f1,
        "precision": precision,
        "recall": recall,
    }


def main():
    print("=" * 60)
    print("🛠️  DEV MODE: Force-Train ALL Models (Forecast + Anomaly)")
    print("   (No minimum data threshold — trains with whatever exists)")
    print("=" * 60)

    if PROPHET_AVAILABLE:
        print(f"Engine: Facebook Prophet ✅")
    else:
        print("Engine: statsmodels (Prophet unavailable)")

    if not DUCKDB_PATH.exists():
        print(f"\n❌ DuckDB not found at: {DUCKDB_PATH}")
        print("   Run the sync pipeline first: python -m app.jobs.sync_pipeline")
        sys.exit(1)

    # DuckDB uses exclusive file locks — if the ai-service is running,
    # we copy the file and train from the snapshot.
    # On Windows, if the file is locked we try alternative access modes.
    import shutil
    db_copy_path = DUCKDB_PATH.parent / "analytics_train_copy.duckdb"
    try:
        conn = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    except duckdb.IOException:
        print("⚠️  DuckDB locked by another process.")
        # Try copying the file (works on Linux/Mac, may fail on Windows)
        try:
            shutil.copy2(str(DUCKDB_PATH), str(db_copy_path))
            conn = duckdb.connect(str(db_copy_path), read_only=True)
        except (PermissionError, OSError):
            print("   Cannot copy locked file on Windows.")
            print("   ➡️  Please stop the AI service first (Ctrl+C in its terminal),")
            print("      then re-run this script.")
            print()
            print("   Alternatively, run from a separate terminal:")
            print("      taskkill /PID <pid> /F")
            print("      python scripts/train_dev.py")
            print("      uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload")
            sys.exit(1)

    # No 30-day filter — just require MIN_DAYS (2) distinct days
    variations = conn.execute(f"""
        SELECT DISTINCT variation_id, product_name, variation_name,
               COUNT(DISTINCT CAST(transaction_date AS DATE)) as day_count
        FROM sales_transactions
        WHERE is_refund = FALSE
        GROUP BY variation_id, product_name, variation_name
        HAVING COUNT(DISTINCT CAST(transaction_date AS DATE)) >= {MIN_DAYS}
        ORDER BY variation_id
    """).fetchall()

    print(f"\nFound {len(variations)} variations with ≥{MIN_DAYS} days of data\n")

    if len(variations) == 0:
        print("❌ No variations found. Make sure:")
        print("   1. Data has been synced (run sync pipeline)")
        print("   2. There are at least 2 days of sales in the system")
        conn.close()
        sys.exit(1)

    all_metrics = []
    timestamp = datetime.now().strftime("%Y%m%d")

    for var_id, product_name, variation_name, day_count in variations:
        full_name = f"{product_name} {variation_name}"
        print(f"Training: {full_name} (id={var_id}, {day_count} days)...", end=" ")

        df = load_variation_data(conn, var_id)
        if len(df) < MIN_DAYS:
            print("SKIPPED (less than 2 data points)")
            continue

        try:
            if PROPHET_AVAILABLE and len(df) >= 10:
                model, metrics = train_with_prophet(df, full_name)
            else:
                model, metrics = train_with_statsmodels(df, full_name)

            all_metrics.append(metrics)

            model_path = MODELS_DIR / f"forecast_v{var_id}_{timestamp}.pkl"
            with open(model_path, "wb") as f:
                pickle.dump(model, f)

            status = "✅" if metrics["mape"] <= 20 else "⚠️ "
            print(f"{status} MAPE: {metrics['mape']}% | MAE: {metrics['mae']} | R²: {metrics['r_squared']}")
        except Exception as e:
            print(f"❌ ERROR: {e}")
            continue

    # ══════════════════════════════════════════════════════════════
    # PART 2: ISOLATION FOREST (Anomaly Detection)
    # ══════════════════════════════════════════════════════════════
    print(f"\n{'=' * 60}")
    print("🛠️  DEV MODE: Training Isolation Forest (Anomaly Detection)")
    print(f"{'=' * 60}")

    iforest_metrics = train_isolation_forest(conn, timestamp)

    conn.close()

    # Clean up snapshot copy if used
    db_copy_path = DUCKDB_PATH.parent / "analytics_train_copy.duckdb"
    if db_copy_path.exists():
        try:
            db_copy_path.unlink()
        except Exception:
            pass

    if all_metrics:
        metrics_path = MODELS_DIR / f"forecast_metrics_{timestamp}.pkl"
        with open(metrics_path, "wb") as f:
            pickle.dump(all_metrics, f)

    # Summary
    print(f"\n{'=' * 60}")
    print("DEV Training Complete! (Forecast + Anomaly)")
    print(f"{'=' * 60}")
    print(f"Models saved to: {MODELS_DIR}")

    # Forecast summary
    print(f"\n── Forecast Models ──")
    print(f"Total variations trained: {len(all_metrics)}")

    if all_metrics:
        mapes = [m["mape"] for m in all_metrics]
        passed = sum(1 for m in mapes if m <= 20)
        print(f"Passed (MAPE ≤ 20%): {passed}/{len(all_metrics)}")
        print(f"Average MAPE: {np.mean(mapes):.2f}%")
        print(f"Best MAPE: {min(mapes):.2f}%")
        print(f"Worst MAPE: {max(mapes):.2f}%")
    else:
        print("No forecast models were trained.")

    # Anomaly summary
    print(f"\n── Anomaly Detection (Isolation Forest) ──")
    if iforest_metrics:
        print(f"Transactions used: {iforest_metrics['total_transactions']:,}")
        print(f"Anomalies detected: {iforest_metrics['anomalies_detected']:,}")
        print(f"F1-Score (Anomaly): {iforest_metrics['f1_score']:.4f}")
        print(f"Precision: {iforest_metrics['precision']:.4f}")
        print(f"Recall: {iforest_metrics['recall']:.4f}")
    else:
        print("Isolation Forest was not trained (no transaction data).")

    print()
    print("⚠️  NOTE: Models trained with limited data will have lower accuracy.")
    print("   This is expected for dev/testing purposes.")


if __name__ == "__main__":
    sys.path.insert(0, str(BASE_DIR))
    main()
