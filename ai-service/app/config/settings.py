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
    # "require" for hosted Postgres (Neon/Supabase); "prefer"/"disable" for local.
    postgres_sslmode: str = "prefer"

    # Redis
    # For hosted Redis (Upstash) set redis_url to the full rediss:// connection
    # string — it takes precedence over host/port/password/ssl below.
    redis_url: str = ""
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_ssl: bool = False
    redis_ttl_hours: int = 6

    # DuckDB
    duckdb_path: str = "./data/analytics.duckdb"

    # Sync
    sync_interval_minutes: int = 10

    # ML
    contamination_rate: float = 0.05
    forecast_cache_ttl: int = 21600  # 6 hours in seconds

    probe_training_key: str = ""

    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    probe_gateway_token: str = ""
    probe_environment: str = "production"
    auth_enabled: bool = True

    def validate_auth(self) -> None:
        if not self.auth_enabled:
            if self.probe_environment != "development":
                raise ValueError("Authentication bypass requires PROBE_ENVIRONMENT=development")
            return
        if self.jwt_algorithm != "HS256" or len(self.jwt_secret_key.strip()) < 32:
            raise ValueError("Configure HS256 and a random JWT_SECRET_KEY of at least 32 characters")
        if len(self.probe_gateway_token.strip()) < 32 or self.probe_gateway_token == self.jwt_secret_key:
            raise ValueError("Configure a separate random PROBE_GATEWAY_TOKEN of at least 32 characters")

    # Sync rate limit in seconds (0 = disabled)
    sync_rate_limit_seconds: int = 300

    @property
    def postgres_dsn(self) -> str:
        return (
            f"host={self.postgres_host} "
            f"port={self.postgres_port} "
            f"dbname={self.postgres_db} "
            f"user={self.postgres_user} "
            f"password={self.postgres_password} "
            f"sslmode={self.postgres_sslmode}"
        )

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
