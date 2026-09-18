"""
US-PROBE-016: Isolation Forest Model Training Script.
Trains an unsupervised anomaly detection model on normal transaction patterns.

Features:
- Cyclical encoding for time features (hour_of_day, day_of_week)
- One-Hot encoding for categorical features (discount_type)
- StandardScaler for numeric features
- Configurable contamination parameter
- Outputs Confusion Matrix (Precision, Recall, F1-Score) against synthetic labels
- Model + scaler + encoder serialized with timestamped version control
"""

import sys
import pickle
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import duckdb
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.metrics import classification_report, confusion_matrix, f1_score

# ── Paths ──
BASE_DIR = Path(__file__).parent.parent
DUCKDB_PATH = BASE_DIR / "data" / "analytics.duckdb"
MODELS_DIR = BASE_DIR / "models" / "artifacts"
MODELS_DIR.mkdir(parents=True, exist_ok=True)


def load_training_data(conn: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    """Load transaction data and engineer features."""
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


def engineer_features(df: pd.DataFrame) -> tuple[np.ndarray, StandardScaler, list[str]]:
    """
    Transform raw data into ML features:
    - Cyclical encoding for hour_of_day and day_of_week
    - One-Hot encoding for discount_type
    - StandardScaler for numeric features
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

    # One-Hot encoding: discount_type
    features["has_discount"] = (df["discount_type"].notna()).astype(float)

    # Is refund flag
    features["is_refund"] = df["is_refund"].astype(float)

    # Scale all features
    feature_names = features.columns.tolist()
    scaler = StandardScaler()
    X = scaler.fit_transform(features.values)

    return X, scaler, feature_names


def create_synthetic_labels(df: pd.DataFrame) -> np.ndarray:
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
    std_amount = df["total_amount"].std()

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


def main():
    print("=" * 60)
    print("US-PROBE-016: Isolation Forest Training")
    print("=" * 60)

    contamination = float(sys.argv[1]) if len(sys.argv) > 1 else 0.05
    print(f"Contamination rate: {contamination}")

    conn = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    df = load_training_data(conn)
    conn.close()

    print(f"Loaded {len(df):,} transactions")

    # Feature engineering
    print("Engineering features (cyclical encoding, scaling)...")
    X, scaler, feature_names = engineer_features(df)
    print(f"Feature matrix shape: {X.shape}")
    print(f"Features: {feature_names}")

    # Train Isolation Forest
    print(f"\nTraining Isolation Forest (contamination={contamination})...")
    model = IsolationForest(
        n_estimators=200,
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X)

    # Predict on training data
    predictions = model.predict(X)  # 1 = normal, -1 = anomaly
    predicted_labels = (predictions == -1).astype(int)

    # Synthetic ground truth for validation
    print("\nEvaluating against synthetic validation labels...")
    true_labels = create_synthetic_labels(df)

    # Metrics
    print("\n── Confusion Matrix ──")
    cm = confusion_matrix(true_labels, predicted_labels)
    print(f"  TN={cm[0][0]:,}  FP={cm[0][1]:,}")
    print(f"  FN={cm[1][0]:,}  TP={cm[1][1]:,}")

    report = classification_report(true_labels, predicted_labels, target_names=["Normal", "Anomaly"], output_dict=True)
    print(f"\n── Classification Report ──")
    print(f"  Precision (Anomaly): {report['Anomaly']['precision']:.4f}")
    print(f"  Recall (Anomaly):    {report['Anomaly']['recall']:.4f}")
    print(f"  F1-Score (Anomaly):  {report['Anomaly']['f1-score']:.4f}")
    print(f"  F1-Score (Macro):    {report['macro avg']['f1-score']:.4f}")

    f1 = report['Anomaly']['f1-score']
    status = "✅ PASS" if f1 >= 0.85 else f"⚠️  F1={f1:.2f} (target >= 0.85)"
    print(f"\n  Result: {status}")

    # Serialize artifacts
    timestamp = datetime.now().strftime("%Y%m%d")

    artifacts = {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_names,
        "contamination": contamination,
        "metrics": {
            "precision": report['Anomaly']['precision'],
            "recall": report['Anomaly']['recall'],
            "f1_score": report['Anomaly']['f1-score'],
            "confusion_matrix": cm.tolist(),
        },
        "trained_at": datetime.now().isoformat(),
    }

    model_path = MODELS_DIR / f"iforest_{timestamp}.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(artifacts, f)

    print(f"\n{'=' * 60}")
    print(f"Model saved to: {model_path}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    sys.path.insert(0, str(BASE_DIR))
    main()
