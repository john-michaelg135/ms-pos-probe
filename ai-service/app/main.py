"""
POS-PROBE AI Service — FastAPI Application Entry Point.

US-PROBE-003: Main application setup with structured logging,
dependency injection, and Swagger documentation.
"""

import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import get_settings
from app.routers import health
from app.routers import sync
from app.services.database import get_duckdb
from app.schemas.database import init_schema
from app.jobs.scheduler import start_scheduler, stop_scheduler


# ── Structured JSON Logging ──
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()  # Switch to JSONRenderer() in production
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown events."""
    settings = get_settings()
    logger.info(
        "pos_probe_ai_starting",
        host=settings.fastapi_host,
        port=settings.fastapi_port,
    )

    # US-PROBE-004: Initialize DuckDB schema on startup
    conn = get_duckdb()
    init_schema(conn)
    logger.info("duckdb_schema_initialized", path=settings.duckdb_path)

    # US-PROBE-006: Start background scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    logger.info("pos_probe_ai_shutting_down")


# ── FastAPI App ──
app = FastAPI(
    title="POS-PROBE AI Service",
    description="Predictive Restocking & Outlier Behavior Engine — AI Microservice",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS (allow gateway and dashboard) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5020",  # POS-PROBE Gateway
        "http://localhost:3006",  # Dashboard (direct access for dev)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(health.router)
app.include_router(sync.router)
