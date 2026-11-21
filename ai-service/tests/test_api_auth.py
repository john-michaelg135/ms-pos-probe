import time
import unittest
from unittest.mock import patch

import duckdb
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.config.settings import Settings, get_settings
from app.routers import alerts, analytics, anomaly


class ApiAuthTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, auth_enabled=True, jwt_secret_key="d" * 32,
                                 probe_gateway_token="g" * 32, probe_environment="production")
        app = FastAPI()
        for router in (analytics.router, alerts.router, anomaly.router):
            app.include_router(router)
        app.dependency_overrides[get_settings] = lambda: self.settings
        self.client = TestClient(app)

    def revenue(self, credential):
        return self.client.get("/analytics/revenue", headers={"Authorization": "Bearer " + credential})

    def dashboard_token(self, **overrides):
        claims = {"iss": "probe-dashboard", "aud": "probe-api", "sub": "manager",
                  "role": "manager", "exp": int(time.time()) + 60, **overrides}
        return jwt.encode(claims, self.settings.jwt_secret_key, algorithm="HS256")

    def test_dashboard_revenue(self):
        with duckdb.connect() as conn, patch.object(analytics, "get_duckdb", return_value=conn):
            conn.execute("""CREATE TABLE sales_transactions AS SELECT current_timestamp AS transaction_date,
                         123 AS total_amount, 1 AS order_id, 1 AS quantity, false AS is_refund""")
            response = self.revenue(self.dashboard_token())
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()[0]["total_revenue"], 123)

    def test_denied_credentials(self):
        self.assertEqual(self.client.get("/analytics/revenue").status_code, 401)
        for token in ("invalid", self.dashboard_token(exp=1), self.dashboard_token(aud="other"),
                      self.settings.probe_gateway_token):
            self.assertEqual(self.revenue(token).status_code, 401)
        response = self.client.put("/alerts/test/status", json={"status": "Reviewed"},
                                   headers={"Authorization": "Bearer " + self.settings.probe_gateway_token})
        self.assertEqual(response.status_code, 401)

    def test_gateway_scoring(self):
        payload = {"order_id": "test", "total_amount": 5, "quantity": 1, "hour_of_day": 1, "day_of_week": 1}
        with patch.object(anomaly, "load_models", return_value=None) as scoring:
            for token, status in [(self.dashboard_token(), 401), (self.settings.probe_gateway_token, 200)]:
                response = self.client.post("/anomaly/detect", json=payload, headers={"Authorization": "Bearer " + token})
                self.assertEqual(response.status_code, status)
            scoring.assert_called_once()

    def test_startup_validation(self):
        self.settings.validate_auth()
        for updates in ({"auth_enabled": False}, {"jwt_secret_key": ""}, {"probe_gateway_token": ""},
                        {"probe_gateway_token": self.settings.jwt_secret_key}):
            with self.assertRaises(ValueError):
                self.settings.model_copy(update=updates).validate_auth()
        self.settings.model_copy(update={"auth_enabled": False, "probe_environment": "development"}).validate_auth()
