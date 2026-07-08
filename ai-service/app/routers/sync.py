"""
US-PROBE-007/028: Sync pipeline endpoints.
Provides manual sync trigger and last sync status.
"""

import structlog
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status

from app.services.auth import verify_token
from app.services.database import get_redis
from app.jobs.sync_pipeline import run_sync_pipeline, WATERMARK_KEY

logger = structlog.get_logger()

router = APIRouter(prefix="/sync", tags=["Sync"])

# Rate limiting: track last manual sync time
_last_manual_sync: datetime | None = None
_sync_in_progress: bool = False
RATE_LIMIT_SECONDS = 300  # 5 minutes


@router.get("/status")
async def get_sync_status(token: dict = Depends(verify_token)):
    """
    Get the last sync timestamp for the dashboard System Status section.
    """
    try:
        redis_client = get_redis()
        last_sync = redis_client.get(WATERMARK_KEY)
    except Exception:
        last_sync = None

    return {
        "last_sync_timestamp": last_sync,
        "sync_interval_minutes": 10,
    }


@router.post("/force")
async def force_sync(token: dict = Depends(verify_token)):
    """
    US-PROBE-028: Manually trigger an immediate full data sync.
    Rate limited to once every 5 minutes.
    Returns HTTP 429 if rate limited or sync already in progress.
    """
    global _last_manual_sync, _sync_in_progress

    # Check if sync is already running
    if _sync_in_progress:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Sync already in progress. Please wait for it to complete.",
        )

    # Rate limiting
    if _last_manual_sync:
        elapsed = (datetime.now(timezone.utc) - _last_manual_sync).total_seconds()
        if elapsed < RATE_LIMIT_SECONDS:
            remaining = int(RATE_LIMIT_SECONDS - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limited. Next manual sync allowed in {remaining} seconds.",
            )

    _sync_in_progress = True
    try:
        result = await run_sync_pipeline()
        # Only rate-limit after a SUCCESSFUL sync (no error key)
        if "error" not in result:
            _last_manual_sync = datetime.now(timezone.utc)
        return result
    finally:
        _sync_in_progress = False
