"""
US-PROBE-004 & US-PROBE-005: Database connection management.
Provides DuckDB and Redis connection dependencies for FastAPI.
"""

import duckdb
import redis
from pathlib import Path
from contextlib import contextmanager

from app.config.settings import get_settings

# ── DuckDB ──

_duckdb_connection: duckdb.DuckDBPyConnection | None = None


def get_duckdb() -> duckdb.DuckDBPyConnection:
    """
    Returns a DuckDB connection (singleton).
    Creates the data directory and database file if they don't exist.
    """
    global _duckdb_connection

    if _duckdb_connection is None:
        settings = get_settings()
        db_path = Path(settings.duckdb_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        _duckdb_connection = duckdb.connect(str(db_path))

    return _duckdb_connection


# ── Redis ──

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """
    Returns a Redis client (singleton).
    Connects to Memurai/Redis on the configured host and port.
    """
    global _redis_client

    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            decode_responses=True,
        )

    return _redis_client


def check_duckdb_health() -> bool:
    """Check if DuckDB is accessible."""
    try:
        conn = get_duckdb()
        conn.execute("SELECT 1")
        return True
    except Exception:
        return False


def check_redis_health() -> bool:
    """Check if Redis/Memurai is accessible."""
    try:
        client = get_redis()
        return client.ping()
    except Exception:
        return False
