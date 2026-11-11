"""
Replaced by scripts/train_forecast.py.

The old trainer read the analytics DuckDB file (locked while the AI service runs, so scheduled
retraining always failed), forecast from the end of an 80% training split instead of from
tomorrow, and used a fixed ±1.5σ band. This entry point is kept so existing commands still work.
"""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("train_forecast.py")), run_name="__main__")
