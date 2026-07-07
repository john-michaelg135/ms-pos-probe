"""
US-PROBE-006: APScheduler background job scheduler.
Runs the data sync pipeline on a configurable interval (default: 10 minutes).
Does not block the FastAPI async event loop.
"""

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

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


def start_scheduler() -> None:
    """Start the background scheduler with the sync job."""
    settings = get_settings()

    scheduler.add_job(
        sync_job,
        trigger=IntervalTrigger(minutes=settings.sync_interval_minutes),
        id="postgres_to_duckdb_sync",
        name="PostgreSQL → DuckDB Sync Pipeline",
        replace_existing=True,
    )

    scheduler.start()
    logger.info(
        "scheduler_started",
        interval_minutes=settings.sync_interval_minutes,
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("scheduler_stopped")
