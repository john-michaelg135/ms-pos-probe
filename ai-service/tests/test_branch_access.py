"""Branch access: a manager reads and changes only their branch; the owner sees every branch."""

import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import duckdb
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from starlette.websockets import WebSocketDisconnect

from app.config.settings import Settings, get_settings
from app.routers import alerts, analytics, forecast
from app.schemas.database import init_schema

BRANCH_A = {"id": 1, "name": "Branch A"}
BRANCH_B = {"id": 2, "name": "Branch B"}


class BranchAccessTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, auth_enabled=True, jwt_secret_key="d" * 32,
                                 probe_gateway_token="g" * 32, probe_environment="production")
        app = FastAPI()
        for router in (analytics.router, alerts.router, forecast.router):
            app.include_router(router)
        app.dependency_overrides[get_settings] = lambda: self.settings
        self.client = TestClient(app)

        # Two branches, each with one sale and one alert by its own cashier.
        self.conn = duckdb.connect()
        init_schema(self.conn)
        sold_at = datetime.now() - timedelta(hours=1)
        for branch, amount in ((BRANCH_A, 100), (BRANCH_B, 900)):
            n = branch["id"]
            self.conn.execute(
                """INSERT INTO sales_transactions (transaction_id, order_id, order_source, location_id, location_name,
                   product_id, product_name, variation_id, variation_name, quantity, unit_price, total_amount,
                   cashier_id, cashier_name, transaction_date)
                   VALUES (?, ?, 'POS', ?, ?, 1, 'Bread', 1, 'Loaf', 1, ?, ?, ?, ?, ?)""",
                [f"T{n}", f"O{n}", n, branch["name"], amount, amount, f"C{n}", f"Cashier {n}", sold_at])
            self.conn.execute(
                """INSERT INTO anomaly_alerts (alert_id, order_id, transaction_amount, anomaly_score, risk_level,
                   reason, cashier_id, cashier_name, location_id, location_name, detected_at, status)
                   VALUES (?, ?, ?, -0.5, 'High', 'Unusual amount', ?, ?, ?, ?, ?, 'New')""",
                [f"ALT-{n}", f"O{n}", amount, f"C{n}", f"Cashier {n}", n, branch["name"], sold_at])
        for module in (analytics, alerts):
            patcher = patch.object(module, "get_duckdb", return_value=self.conn)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.addCleanup(self.conn.close)
        alerts._connected_clients.clear()

    def token(self, role="manager", location=BRANCH_A, aud="probe-api"):
        claims = {"iss": "probe-dashboard", "aud": aud, "sub": role, "role": role,
                  "location": location if role == "manager" else None, "exp": int(time.time()) + 60}
        return jwt.encode(claims, self.settings.jwt_secret_key, algorithm="HS256")

    def get(self, path, token=None, **params):
        return self.client.get(path, params=params, headers={"Authorization": "Bearer " + (token or self.token())})

    def status_of(self, alert_id):
        return self.conn.execute("SELECT status FROM anomaly_alerts WHERE alert_id = ?", [alert_id]).fetchone()[0]

    # ── Reports ──

    def test_manager_reports_cover_only_their_branch(self):
        for path in ("/analytics/revenue", "/analytics/sales-by-product", "/analytics/sales-by-channel"):
            response = self.get(path)
            self.assertEqual(response.status_code, 200, path)
            self.assertEqual(sum(row["total_revenue"] for row in response.json()), 100, path)
        self.assertEqual(self.get("/analytics/sales-by-location").json(),
                         [{"location_name": "Branch A", "total_revenue": 100, "total_quantity": 1}])

    def test_manager_cannot_filter_on_another_branch(self):
        for path, params in (("/analytics/revenue", {"location_id": 2}),
                             ("/analytics/revenue", {"location_name": "Branch B"}),
                             ("/analytics/sales-by-product", {"location_name": "Branch B"}),
                             ("/alerts", {"location_name": "Branch B"}),
                             ("/forecast", {"location_name": "Branch B"}),
                             ("/forecast/insights", {"location_name": "Branch B"})):
            self.assertEqual(self.get(path, **params).status_code, 403, (path, params))
        self.assertEqual(self.get("/analytics/revenue", location_name="Branch A").status_code, 200)

    def test_owner_sees_every_branch(self):
        owner = self.token("owner")
        self.assertEqual(sum(r["total_revenue"] for r in self.get("/analytics/revenue", owner).json()), 1000)
        self.assertEqual(len(self.get("/analytics/sales-by-location", owner).json()), 2)
        self.assertEqual(sum(r["total_revenue"] for r in self.get("/analytics/revenue", owner, location_id=2).json()), 900)
        self.assertEqual(self.get("/alerts", owner).json()["total"], 2)

    def test_manager_without_branch_is_refused(self):
        for location in (None, {"id": 0, "name": "Branch A"}, {"id": "1", "name": "Branch A"}, {"id": 1, "name": ""}):
            self.assertEqual(self.get("/analytics/revenue", self.token(location=location)).status_code, 403)

    # ── Forecasts ──

    def test_manager_forecasts_use_their_branch(self):
        bundle = {"locations": ["Branch A", "Branch B"], "location_shares": {"Branch A": {1: 0.5}},
                  "trained_at": "now", "variations": {1: {
                      "product_name": "Bread", "variation_name": "Loaf", "weekday_avg": {d: 1.0 for d in range(7)},
                      "units_share_window": 10, "method": "weekday",
                      "metrics": {"mae": None, "coverage": None, "backtest_days": 0}}}}
        with patch.object(forecast, "load_bundle", return_value=bundle), \
                patch.object(forecast, "forecast", return_value=[]) as run:
            self.assertEqual(self.get("/forecast").status_code, 200)
            self.assertEqual(run.call_args.args[3], "Branch A")
            insights = self.get("/forecast/insights").json()
            self.assertEqual(run.call_args.kwargs["location_name"], "Branch A")
            self.assertIn("at Branch A", insights["variation_name"])
            self.assertEqual([l["location_name"] for l in self.get("/forecast/locations").json()], ["Branch A"])

            owner = self.token("owner")
            self.get("/forecast", owner)
            self.assertIsNone(run.call_args.args[3])
            self.get("/forecast", owner, location_name="Branch B")
            self.assertEqual(run.call_args.args[3], "Branch B")
            self.assertEqual(len(self.get("/forecast/locations", owner).json()), 2)

    # ── Alert history, explanations and reviews ──

    def test_manager_alert_history_and_explanations(self):
        body = self.get("/alerts").json()
        self.assertEqual(body["total"], 1)
        self.assertEqual([a["alert_id"] for a in body["alerts"]], ["ALT-1"])

        self.assertEqual(self.get("/alerts/ALT-2/explain").status_code, 404)
        explanation = self.get("/alerts/ALT-1/explain").json()
        # Its comparison draws on this branch's own sales, not Branch B's.
        self.assertEqual(explanation["historical_context"]["avg_transaction_amount"], 100)
        self.assertEqual(explanation["historical_context"]["total_transactions_analyzed"], 1)
        owner_explanation = self.get("/alerts/ALT-2/explain", self.token("owner")).json()
        self.assertEqual(owner_explanation["historical_context"]["total_transactions_analyzed"], 2)

    def test_manager_cannot_change_another_branchs_alert(self):
        put = lambda alert_id, token: self.client.put(  # noqa: E731
            f"/alerts/{alert_id}/status", json={"status": "Dismissed"}, headers={"Authorization": "Bearer " + token})
        self.assertEqual(put("ALT-2", self.token()).status_code, 404)
        self.assertEqual(self.status_of("ALT-2"), "New")

        self.assertEqual(put("ALT-1", self.token()).status_code, 200)
        self.assertEqual(self.status_of("ALT-1"), "Dismissed")
        self.assertEqual(put("ALT-2", self.token("manager", BRANCH_B)).status_code, 200)
        self.assertEqual(self.status_of("ALT-2"), "Dismissed")
        self.assertEqual(put("ALT-1", self.token("owner")).status_code, 200)

    # ── Live alerts ──

    def assert_rejected(self, first_message=None):
        with self.client.websocket_connect("/alerts/ws") as ws:
            if first_message is not None:
                ws.send_text(first_message)
            with self.assertRaises(WebSocketDisconnect) as closed:
                ws.receive_text()
            self.assertEqual(closed.exception.code, 1008)
        self.assertEqual(alerts._connected_clients, {})

    def test_anonymous_live_subscriptions_are_rejected(self):
        with patch.object(alerts, "WS_AUTH_TIMEOUT_SECONDS", 0.2):
            self.assert_rejected()
        self.assert_rejected("ping")
        self.assert_rejected('{"type": "auth", "token": "invalid"}')
        # An API bearer or the gateway credential is not a socket ticket.
        self.assert_rejected('{"type": "auth", "token": "%s"}' % self.token())
        self.assert_rejected('{"type": "auth", "token": "%s"}' % self.settings.probe_gateway_token)
        # And a socket ticket is not an API bearer.
        self.assertEqual(self.get("/alerts", self.token(aud="probe-alerts-ws")).status_code, 401)

    def subscribe(self, stack, token):
        ws = stack.enter_context(self.client.websocket_connect("/alerts/ws"))
        ws.send_text('{"type": "auth", "token": "%s"}' % token)
        self.assertEqual(ws.receive_json(), {"type": "ready"})
        return ws

    def test_live_alerts_reach_only_their_branch(self):
        from contextlib import ExitStack

        with self.client, ExitStack() as stack:
            a = self.subscribe(stack, self.token(location=BRANCH_A, aud="probe-alerts-ws"))
            b = self.subscribe(stack, self.token(location=BRANCH_B, aud="probe-alerts-ws"))
            owner = self.subscribe(stack, self.token("owner", aud="probe-alerts-ws"))

            for n in (1, 2):
                self.client.portal.call(alerts.broadcast_alert, {"alert_id": f"LIVE-{n}", "location_id": n})
            # An alert with no branch is only for the owner.
            self.client.portal.call(alerts.broadcast_alert, {"alert_id": "LIVE-none", "location_id": None})

            # Each socket answers "ping" after any alerts it was sent, so this shows nothing else arrived.
            def received(ws):
                ws.send_text("ping")
                messages = []
                while (message := ws.receive_text()) != "pong":
                    messages.append(message)
                return messages

            self.assertEqual(received(a), ['{"alert_id": "LIVE-1", "location_id": 1}'])
            self.assertEqual(received(b), ['{"alert_id": "LIVE-2", "location_id": 2}'])
            self.assertEqual(len(received(owner)), 3)


if __name__ == "__main__":
    unittest.main()
