# POS-PROBE

**Point-of-Sale Predictive Restocking & Outlier Behavior Engine**

An AI-powered sidecar system that extends the existing Capstone 1 POS & Ecommerce platform — delivering demand forecasting and real-time fraud detection **without modifying a single line of the legacy codebase**.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Environment Setup](#environment-setup)
- [Running the System](#running-the-system)
- [API Endpoints](#api-endpoints)
- [Development Workflow](#development-workflow)
- [Team](#team)

---

## Overview

POS-PROBE addresses two critical business vulnerabilities for Bren Raphael's Ube Halaya & Jam Company:

1. **Predictive Restocking** — Facebook Prophet time-series forecasting generates precise daily manufacturing quotas, minimizing spoilage from overproduction and stockouts from underproduction.

2. **Outlier Behavior Detection** — Scikit-Learn Isolation Forest flags fraudulent or suspicious POS transactions (fake refunds, abused discounts, sweethearting) in real time via unsupervised anomaly detection.

### The "No Touch" Constraint

All enhancements are implemented as a **completely separate system**. Zero modifications to:
- Legacy C# POS/Ecommerce source code
- PostgreSQL database schema
- Existing API Gateway configuration
- Frontend environment variables (until final cutover)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐ │
│  │  Web POS     │  │ Web Ecommerce│  │  POS-PROBE Dashboard      │ │
│  │  (port 3003) │  │ (port 3004)  │  │  (port 3006)              │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬─────────────┘ │
└─────────┼──────────────────┼────────────────────────┼───────────────┘
          │                  │                        │
          ▼                  ▼                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER (NEW)                           │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              POS-PROBE YARP Gateway (port 5020)              │    │
│  │  • Catch-all proxy → Legacy Gateway (port 5001)             │    │
│  │  • /api/probe/* → FastAPI AI Service (port 8000)            │    │
│  │  • Fire-and-forget cloning of high-risk transactions        │    │
│  │  • X-Correlation-ID injection                               │    │
│  └──────────────┬──────────────────────────────┬───────────────┘    │
└─────────────────┼──────────────────────────────┼────────────────────┘
                  │                              │
         ┌────────┘                              └────────┐
         ▼                                                ▼
┌─────────────────────────┐              ┌────────────────────────────┐
│   LEGACY (UNTOUCHED)    │              │      AI SERVICE (NEW)      │
│                         │              │                            │
│  Capstone 1 API Gateway │              │  Python FastAPI (port 8000)│
│  (port 5001)            │              │  • Prophet Forecasting     │
│         │               │              │  • Isolation Forest        │
│         ▼               │              │  • APScheduler Cron Jobs   │
│  Capstone 1 POS API     │              │  • WebSocket Alerts        │
│         │               │              │           │                │
│         ▼               │              └───────────┼────────────────┘
│    PostgreSQL           │                          │
│    (pos_db)             │              ┌───────────┼────────────────┐
│                         │              │      DATA LAYER (NEW)      │
└─────────────────────────┘              │  ┌───────┴──────┐         │
         ▲                               │  │   DuckDB     │         │
         │ READ-ONLY (10-min sync)       │  │  (OLAP file) │         │
         └───────────────────────────────│──┤              │         │
                                         │  └──────────────┘         │
                                         │  ┌──────────────┐         │
                                         │  │    Redis     │         │
                                         │  │  (cache/TTL) │         │
                                         │  └──────────────┘         │
                                         └───────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Gateway | C# .NET + YARP | .NET 10 | Reverse proxy, traffic routing, payload cloning |
| AI Service | Python + FastAPI | Python 3.13 | ML inference, analytics, batch sync |
| Forecasting | Facebook Prophet | Latest | Time-series demand prediction |
| Anomaly Detection | Scikit-Learn (Isolation Forest) | Latest | Unsupervised fraud detection |
| Analytics DB | DuckDB | Latest | Columnar OLAP for fast aggregations |
| Cache | Redis (Memurai on Windows) | Latest | In-memory forecast caching (6hr TTL) |
| Dashboard | Next.js + React | Latest (App Router) | Manager analytics UI |
| State Management | Zustand | Latest | Lightweight frontend global state |
| Data Fetching | React Query (TanStack) | Latest | API caching & background refetch |
| Charting | Recharts | Latest | Data visualization |
| Containerization | Docker | 29.x | Infrastructure services |

---

## Prerequisites

### Required Software

| Tool | Minimum Version | Installation | Verified |
|------|----------------|--------------|----------|
| **.NET SDK** | 10.0 | [dotnet.microsoft.com](https://dotnet.microsoft.com/download) | ✅ 10.0.101 |
| **Python** | 3.11+ | [python.org](https://www.python.org/downloads/) | ✅ 3.13.7 |
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) | ✅ 24.11.1 |
| **npm** | 10+ | Bundled with Node.js | ✅ 11.6.2 |
| **Git** | 2.40+ | [git-scm.com](https://git-scm.com/) | ✅ 2.51.2 |
| **Docker** | 24+ | [docker.com](https://www.docker.com/products/docker-desktop/) | ✅ 29.4.1 |

### Required Services (to be installed)

| Service | Purpose | Installation Method |
|---------|---------|-------------------|
| **Redis** (Memurai for Windows) | In-memory cache for ML predictions | [Memurai Download](https://www.memurai.com/get-memurai) |

> **Note:** DuckDB is embedded (file-based) and installed as a Python package — no separate server needed.

### Legacy System (must be running)

The following Capstone 1 services must be accessible for POS-PROBE to function:

| Service | Port | Description |
|---------|------|-------------|
| Capstone 1 API Gateway | 5001 | Existing YARP gateway routing to microservices |
| PostgreSQL (pos_db) | 5433 | Legacy operational database (READ-ONLY access) |
| Web POS | 3003 | POS frontend (traffic will be rerouted through POS-PROBE gateway) |
| Web Ecommerce | 3004 | Ecommerce frontend |

---

## Project Structure

```
ms-pos-probe/
├── gateway/                    # C# .NET YARP Reverse Proxy (port 5020)
│   ├── Middlewares/            # POS traffic tagging, correlation ID, payload cloning
│   ├── Services/               # BackgroundService for Channel<T> consumer
│   ├── Program.cs
│   ├── appsettings.json
│   └── gateway.csproj
│
├── ai-service/                 # Python FastAPI Microservice (port 8000)
│   ├── app/
│   │   ├── main.py             # FastAPI app entry point
│   │   ├── config/             # Settings, env loading
│   │   ├── routers/            # API route handlers
│   │   ├── services/           # Business logic, auth
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── models/             # ML model loading & inference
│   │   └── jobs/               # APScheduler cron tasks
│   ├── data/                   # DuckDB file storage (gitignored)
│   ├── models/
│   │   └── artifacts/          # Serialized .pkl model files (gitignored)
│   ├── scripts/                # Data generation, training scripts
│   ├── requirements.txt        # Pinned Python dependencies
│   └── .env.example
│
├── dashboard/                  # Next.js Analytics Dashboard (port 3006)
│   ├── src/
│   │   ├── app/                # App Router pages
│   │   ├── components/         # Reusable UI components
│   │   ├── lib/                # API client, utilities
│   │   └── stores/             # Zustand state stores
│   ├── package.json
│   └── .env.example
│
├── docs/                       # Project documentation
│   ├── POS-PROBE_Project_Charter_and_Risk_Register_Final.md
│   ├── POS-PROBE_Project_Deliverable.md
│   └── pos-probe-backlogs
│
├── .gitignore
└── README.md
```

---

## Environment Setup

### 1. Clone the Repository

```bash
git clone https://github.com/john-michaelg135/ms-pos-probe.git
cd ms-pos-probe
```

### 2. Install Redis (Memurai for Windows)

1. Download Memurai from [memurai.com/get-memurai](https://www.memurai.com/get-memurai)
2. Install with default settings (runs as Windows service on port 6379)
3. Verify: `memurai-cli ping` → should return `PONG`

### 3. Gateway Setup (C# .NET)

```bash
cd gateway
dotnet restore
dotnet build
```

Create `gateway/.env` from the example:
```env
# POS-PROBE Gateway Configuration
LEGACY_GATEWAY_URL=http://localhost:5001
AI_SERVICE_URL=http://localhost:8000
GATEWAY_PORT=5020
```

### 4. AI Service Setup (Python)

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create `ai-service/.env` from the example:
```env
# AI Service Configuration
FASTAPI_PORT=8000
FASTAPI_HOST=0.0.0.0

# Legacy PostgreSQL (READ-ONLY)
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=pos_db
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_TTL_HOURS=6

# DuckDB
DUCKDB_PATH=./data/analytics.duckdb

# Sync Configuration
SYNC_INTERVAL_MINUTES=10

# ML Configuration
CONTAMINATION_RATE=0.05
FORECAST_CACHE_TTL=21600
```

### 5. Dashboard Setup (Next.js)

```bash
cd dashboard
npm install
```

Create `dashboard/.env.local` from the example:
```env
# Dashboard Configuration
NEXT_PUBLIC_API_URL=http://localhost:5020
NEXT_PUBLIC_WS_URL=ws://localhost:5020
```

---

## Running the System

### Start Order (dependencies first)

```bash
# 1. Ensure legacy system is running (Capstone 1 API Gateway on :5001, PostgreSQL on :5433)

# 2. Ensure Redis/Memurai is running (Windows service, auto-starts)

# 3. Start POS-PROBE Gateway
cd gateway
dotnet run

# 4. Start AI Service
cd ai-service
venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 5. Start Dashboard
cd dashboard
npm run dev
```

### Service Health Checks

| Service | Health Endpoint | Expected |
|---------|----------------|----------|
| Gateway | `GET http://localhost:5020/health` | `{ "service": "pos-probe-gateway", "status": "healthy" }` |
| AI Service | `GET http://localhost:8000/health` | `{ "service": "pos-probe-ai", "status": "healthy" }` |
| Dashboard | `http://localhost:3006` | Dashboard UI loads |

---

## API Endpoints

### Gateway Routes (port 5020)

| Method | Path | Destination |
|--------|------|-------------|
| `*` | `/**` (catch-all) | Legacy Gateway (port 5001) |
| `*` | `/api/probe/**` | AI Service (port 8000) |
| `WS` | `/api/probe/ws/alerts` | AI Service WebSocket |

### AI Service Routes (port 8000, accessed via gateway)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service health + DuckDB + Redis status |
| `GET` | `/api/probe/forecast` | Demand predictions (Prophet) |
| `GET` | `/api/probe/forecast/backtest` | Model accuracy metrics |
| `POST` | `/api/probe/detect-anomaly` | Real-time fraud evaluation |
| `GET` | `/api/probe/alerts` | Historical anomaly alerts |
| `PUT` | `/api/probe/alerts/{id}/status` | Update alert review status |
| `GET` | `/api/probe/analytics/revenue` | Revenue by period |
| `GET` | `/api/probe/analytics/sales-by-location` | Sales grouped by branch |
| `GET` | `/api/probe/analytics/sales-by-product` | Sales grouped by product |
| `GET` | `/api/probe/analytics/sales-by-channel` | POS vs Ecommerce split |
| `GET` | `/api/probe/anomaly/metrics` | Isolation Forest accuracy |
| `POST` | `/api/probe/sync/force` | Manual data sync trigger |

---

## Development Workflow

### Branch Strategy

```
main                    # Stable, defense-ready
├── dev                 # Integration branch
│   ├── feat/gateway-*  # Gateway features
│   ├── feat/ai-*       # AI Service features
│   └── feat/dash-*     # Dashboard features
```

### Sprint Schedule

| Sprint | Duration | Focus |
|--------|----------|-------|
| Sprint 1 | Jul 1 – Jul 10 | Infrastructure & Data Pipeline |
| Sprint 2 | Jul 13 – Jul 24 | ML Models & Core Analytics |
| Sprint 3 | Jul 27 – Aug 7 | Real-Time Alerting & Final Integration |

### Key Commands

```bash
# Gateway
cd gateway && dotnet build               # Build
cd gateway && dotnet run                  # Run

# AI Service
cd ai-service && pip install -r requirements.txt   # Install deps
cd ai-service && uvicorn app.main:app --reload     # Run with hot reload
cd ai-service && python scripts/generate_data.py   # Generate synthetic data
cd ai-service && python scripts/train_prophet.py   # Train forecast model
cd ai-service && python scripts/train_iforest.py   # Train anomaly model

# Dashboard
cd dashboard && npm install               # Install deps
cd dashboard && npm run dev               # Run dev server
cd dashboard && npm run build             # Production build
```

---

## Team

| Member | Role |
|--------|------|
| Kyle Christian Casipit | Project Manager & QA |
| John Michael Garcia | Lead Backend Developer (Gateway + AI Service) |
| Erwin Airon Sia | Lead Frontend Developer (Dashboard) |
| Jaezelle Diaz | Business Analyst & Frontend |

---

## License

Academic project — Capstone Enhancement, Summer Semester 2026.
