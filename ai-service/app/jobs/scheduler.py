"""
US-PROBE-006: APScheduler background job scheduler.
Runs the data sync pipeline on a configurable interval (default: 10 minutes).
Re-trains the demand forecast daily (2am) and the anomaly models weekly (Sunday 2:30am).
Does not block the FastAPI async event loop.
"""

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger

from app.config.settings import get_settings
from app.jobs.sync_pipeline import run_sync_pipeline

logger = structlog.get_logger()

scheduler = AsyncIOScheduler()


async def sync_job() -> None:
    """
    US-PROBE-007: Scheduled job that runs the PostgreSQL → DuckDB sync pipeline.
    Executes every SYNC_INTERVAL_MINUTES (default: 10).
    """
    await run_sync_pipeline()


async def _run_script(name: str, timeout: int) -> bool:
    """Run a training script in a worker thread so the API keeps answering while it trains."""
    import asyncio
    import subprocess
    import sys
    from pathlib import Path

    scripts_dir = Path(__file__).parent.parent.parent / "scripts"
    try:
        result = await asyncio.to_thread(
            subprocess.run,
            [sys.executable, str(scripts_dir / name)],
            capture_output=True, text=True, timeout=timeout, cwd=str(scripts_dir.parent),
        )
    except Exception as e:
        logger.error("auto_training_error", script=name, error=str(e))
        return False
    if result.returncode != 0:
        logger.warning("auto_training_failed", script=name, stderr=result.stderr[-300:] if result.stderr else "")
        return False
    logger.info("auto_training_complete", script=name)
    return True


async def train_forecast_job() -> None:
    """Re-train the demand forecast from the POS database (daily)."""
    await _run_script("train_forecast.py", timeout=600)


async def train_anomaly_model_job() -> None:
    """Re-train the per-channel Isolation Forest models (weekly)."""
    await _run_script("train_iforest.py", timeout=300)


def start_scheduler() -> None:
    """Start the background scheduler with sync and training jobs."""
    settings = get_settings()

    # Data sync every 10 minutes
    scheduler.add_job(
        sync_job,
        trigger=IntervalTrigger(minutes=settings.sync_interval_minutes),
        id="postgres_to_duckdb_sync",
        name="PostgreSQL → DuckDB Sync Pipeline",
        replace_existing=True,
    )

    # Forecast re-training every day at 2:00 AM, so it always ends yesterday
    scheduler.add_job(
        train_forecast_job,
        trigger=CronTrigger(hour=2, minute=0),
        id="daily_forecast_training",
        name="Daily Forecast Re-Training",
        replace_existing=True,
    )

    # Anomaly model re-training every Sunday at 2:30 AM
    scheduler.add_job(
        train_anomaly_model_job,
        trigger=CronTrigger(day_of_week="sun", hour=2, minute=30),
        id="weekly_model_training",
        name="Weekly Anomaly Model Re-Training",
        replace_existing=True,
    )

    # Missing or old-style models (first run, or before this update): train shortly after startup.
    from datetime import datetime, timedelta
    from apscheduler.triggers.date import DateTrigger
    from app.services.anomaly_engine import load_models
    from app.services.forecast_engine import load_bundle

    if load_bundle() is None:
        scheduler.add_job(
            train_forecast_job,
            trigger=DateTrigger(run_date=datetime.now() + timedelta(minutes=1)),
            id="initial_forecast_training",
            name="Initial forecast training",
            replace_existing=True,
        )
    if load_models() is None:
        scheduler.add_job(
            train_anomaly_model_job,
            trigger=DateTrigger(run_date=datetime.now() + timedelta(minutes=3)),
            id="initial_anomaly_model_training",
            name="Initial per-channel anomaly model training",
            replace_existing=True,
        )

    scheduler.start()
    logger.info(
        "scheduler_started",
        sync_interval_minutes=settings.sync_interval_minutes,
        training_schedule="Forecast daily 2:00 AM; anomaly model Sundays 2:30 AM",
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
