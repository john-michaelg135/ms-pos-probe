"""
Application settings loaded from environment variables.
Uses pydantic-settings for type-safe configuration.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """POS-PROBE AI Service configuration."""

    # FastAPI
    fastapi_host: str = "0.0.0.0"
    fastapi_port: int = 8000

    # Legacy PostgreSQL (READ-ONLY)
    postgres_host: str = "localhost"
    postgres_port: int = 5433
    postgres_db: str = "pos_db"
    postgres_user: str = "postgres"
    postgres_password: str = "password"

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_ttl_hours: int = 6

    # DuckDB
    duckdb_path: str = "./data/analytics.duckdb"

    # Sync
    sync_interval_minutes: int = 10

    # ML
    contamination_rate: float = 0.05
    forecast_cache_ttl: int = 21600  # 6 hours in seconds

    # JWT
    jwt_secret_key: str = "your_jwt_secret_here"
    jwt_algorithm: str = "HS256"

    # Auth toggle (false = bypass JWT for dev)
    auth_enabled: bool = False

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} "
            f"port={self.postgres_port} "
            f"dbname={self.postgres_db} "
            f"user={self.postgres_user} "
            f"password={self.postgres_password}"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
