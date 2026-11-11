"""
US-PROBE-014: Train the demand forecast (see app/services/forecast_engine.py for the method).

Reads sales straight from the POS PostgreSQL database (read-only), so it works while the AI
service is running; the older trainer read the analytics DuckDB file, which the running
service keeps locked, so scheduled retraining always failed.

Usage: python scripts/train_forecast.py
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

import psycopg2  # noqa: E402

from app.config.settings import get_settings  # noqa: E402
from app.services.forecast_engine import backtest_report, load_bundle, train_and_save  # noqa: E402


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 60)
    print("US-PROBE-014: Demand forecast training")
    print("=" * 60)

    conn = psycopg2.connect(get_settings().postgres_dsn)
    conn.set_session(readonly=True)
    try:
        path = train_and_save(conn)
    finally:
        conn.close()

    report = backtest_report(load_bundle())
    print(f"Saved: {path}")
    print(f"{'Variation':<34}{'Method':<18}{'MAE':>6}{'WAPE':>8}{'Range hit':>11}{'Baseline':>10}")
    for r in report["metrics"]:
        wape = f"{r['wape']}%" if r["wape"] is not None else "—"
        cov = f"{r['coverage']}%" if r["coverage"] is not None else "—"
        print(f"{r['variation_name'][:33]:<34}{r['engine']:<18}{r['mae'] if r['mae'] is not None else '—':>6}"
              f"{wape:>8}{cov:>11}{r['baseline_mae'] if r['baseline_mae'] is not None else '—':>10}")
    o = report["overall"]
    print(f"\nBeat the 'same weekday last week' baseline: {o['passed']}/{o['total']}"
          f" | avg WAPE {o['avg_wape']}% | range hit {o['avg_coverage']}% (target {o['target_coverage']}%)")


if __name__ == "__main__":
    main()
