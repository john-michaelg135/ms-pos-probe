# POS-PROBE AI Service (FastAPI + scikit-learn + statsmodels/Prophet)
FROM python:3.11-slim

# System deps: gcc/g++ for building numpy/pandas/scikit wheels if needed,
# libgomp1 for scikit-learn OpenMP runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first for layer caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App source
COPY . ./

# DuckDB data dir (ephemeral unless a persistent disk is mounted here).
# The scheduler re-syncs from Postgres, so a fresh file is fine on restart.
RUN mkdir -p /app/data /app/models/artifacts

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# IMPORTANT: single worker only.
# The APScheduler + DuckDB writer must be a single process (DuckDB allows one writer).
# Cloud hosts inject PORT; default to 8000 locally.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
