"""
US-PROBE-006: APScheduler background job scheduler.
Runs the data sync pipeline on a configurable interval (default: 10 minutes).
Runs model re-training weekly (every Sunday at 2am).
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


async def train_models_job() -> None:
    """
    Auto-training job: re-trains forecast and anomaly models weekly.
    Uses data already in DuckDB (synced from legacy system).
    Only trains if there's enough data (30+ days).
    """
    import subprocess
    import sys
    from pathlib import Path

    scripts_dir = Path(__file__).parent.parent.parent / "scripts"
    python = sys.executable

    logger.info("auto_training_started")

    # Train forecast model
    try:
        result = subprocess.run(
            [python, str(scripts_dir / "train_prophet.py")],
            capture_output=True, text=True, timeout=300,
            cwd=str(scripts_dir.parent),
        )
        if result.returncode == 0:
            logger.info("auto_training_forecast_complete")
        else:
            logger.warning("auto_training_forecast_failed", stderr=result.stderr[-200:] if result.stderr else "")
    except Exception as e:
        logger.error("auto_training_forecast_error", error=str(e))

    # Train anomaly model
    try:
        result = subprocess.run(
            [python, str(scripts_dir / "train_iforest.py")],
            capture_output=True, text=True, timeout=120,
            cwd=str(scripts_dir.parent),
        )
        if result.returncode == 0:
            logger.info("auto_training_iforest_complete")
        else:
            logger.warning("auto_training_iforest_failed", stderr=result.stderr[-200:] if result.stderr else "")
    except Exception as e:
        logger.error("auto_training_iforest_error", error=str(e))


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

    # Model re-training every Sunday at 2:00 AM
    scheduler.add_job(
        train_models_job,
        trigger=CronTrigger(day_of_week="sun", hour=2, minute=0),
        id="weekly_model_training",
        name="Weekly Model Re-Training",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "scheduler_started",
        sync_interval_minutes=settings.sync_interval_minutes,
        training_schedule="Every Sunday at 2:00 AM",
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
