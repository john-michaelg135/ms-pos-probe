"""
US-PROBE-003/004/005: Health check endpoint.
Reports service status including DuckDB and Redis connectivity.
"""

from fastapi import APIRouter
from datetime import datetime, timezone

from app.services.database import check_duckdb_health, check_redis_health

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Returns the health status of the AI service and its dependencies.
    Used by the dashboard System Status section (US-PROBE-011).
    """
    duckdb_ok = check_duckdb_health()
    redis_ok = check_redis_health()

    all_healthy = duckdb_ok and redis_ok
    status = "healthy" if all_healthy else "degraded"

    return {
        "service": "pos-probe-ai",
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "dependencies": {
            "duckdb": "connected" if duckdb_ok else "disconnected",
            "redis": "connected" if redis_ok else "disconnected",
        },
    }
