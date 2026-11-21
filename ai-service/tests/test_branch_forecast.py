"""A branch's forecast lists only what that branch carries, never another branch's products at zero."""

import time
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from app.config.settings import Settings, get_settings
from app.routers import forecast as forecast_router
from app.services.forecast_engine import MANILA, branch_variations, build_bundle, forecast

ANTIPOLO, FAIRVIEW = "Antipolo Store Branch", "SM City Fairview Bazaar"
SMOOTH, HAVANERO, EXTREME = 3, 15, 30


def make_bundle():
    """Antipolo sells Smooth and stocks Extreme (sold out, never sold); only Fairview sells Havanero."""
    today = datetime.now(MANILA).date()
    rows = []
    for back in range(1, 31):
        day = today - timedelta(days=back)
        rows.append((day, SMOOTH, "Ube Halaya Smooth", "UBH-SM-250|Pouch|250g", 1, ANTIPOLO, 4.0))
        rows.append((day, HAVANERO, "Ube Jam Havanero", "UJH-CON-500G|Container|500 G", 5, FAIRVIEW, 2.0))
    rows.append((today - timedelta(days=200), EXTREME, "Ube Jam Extreme", "UHJ-250G-CONTAINER|Container|250 G",
                 5, FAIRVIEW, 1.0))
    daily = pd.DataFrame(rows, columns=["day", "variation_id", "product_name", "variation_name",
                                        "location_id", "location_name", "units"])
    locations = [{"location_id": 1, "location_name": ANTIPOLO}, {"location_id": 5, "location_name": FAIRVIEW}]
    stocked = [(ANTIPOLO, SMOOTH), (ANTIPOLO, EXTREME), (FAIRVIEW, HAVANERO), (ANTIPOLO, 999)]
    return build_bundle(daily, locations, today, stocked)


class BranchForecastTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bundle = make_bundle()

    def test_branch_carries_stocked_or_sold_variations(self):
        self.assertEqual(branch_variations(self.bundle, ANTIPOLO), {SMOOTH, EXTREME})
        self.assertEqual(branch_variations(self.bundle, FAIRVIEW), {HAVANERO})

    def test_branch_forecast_omits_other_branches_products(self):
        antipolo = {i["variation_id"] for i in forecast(self.bundle, 3, location_name=ANTIPOLO)}
        self.assertEqual(antipolo, {SMOOTH, EXTREME})
        extreme = [i for i in forecast(self.bundle, 3, location_name=ANTIPOLO) if i["variation_id"] == EXTREME]
        self.assertTrue(all(i["recommended_quantity"] == 0 for i in extreme))
        # The all-branch view still has everything.
        self.assertEqual({i["variation_id"] for i in forecast(self.bundle, 3)}, {SMOOTH, HAVANERO, EXTREME})

    def test_older_bundles_fall_back_to_recent_sales(self):
        old = {k: v for k, v in self.bundle.items() if k != "branch_variations"}
        self.assertEqual(branch_variations(old, ANTIPOLO), {SMOOTH})


class BranchInsightsTests(unittest.TestCase):
    def setUp(self):
        self.settings = Settings(_env_file=None, auth_enabled=True, jwt_secret_key="d" * 32,
                                 probe_gateway_token="g" * 32, probe_environment="production")
        app = FastAPI()
        app.include_router(forecast_router.router)
        app.dependency_overrides[get_settings] = lambda: self.settings
        self.client = TestClient(app)
        patcher = patch.object(forecast_router, "load_bundle", return_value=make_bundle())
        patcher.start()
        self.addCleanup(patcher.stop)

    def get(self, path, location, **params):
        claims = {"iss": "probe-dashboard", "aud": "probe-api", "sub": "m", "role": "manager",
                  "location": location, "exp": int(time.time()) + 60}
        token = jwt.encode(claims, self.settings.jwt_secret_key, algorithm="HS256")
        return self.client.get(path, params=params, headers={"Authorization": "Bearer " + token})

    def test_manager_forecast_lists_only_their_products(self):
        rows = self.get("/forecast", {"id": 1, "name": ANTIPOLO}).json()
        self.assertEqual({r["variation_id"] for r in rows}, {SMOOTH, EXTREME})

    def test_insights_ignore_products_the_branch_does_not_carry(self):
        antipolo = {"id": 1, "name": ANTIPOLO}
        overall = self.get("/forecast/insights", antipolo).json()
        self.assertIn("All variations at " + ANTIPOLO, overall["variation_name"])
        # Havanero isn't Antipolo's, so asking for it gives the branch's overall picture, not Havanero's.
        self.assertEqual(self.get("/forecast/insights", antipolo, variation_id=HAVANERO).json()["variation_name"],
                         overall["variation_name"])
        # Smooth is all of Antipolo's recent units; Fairview's Havanero doesn't dilute the share.
        smooth = self.get("/forecast/insights", antipolo, variation_id=SMOOTH).json()
        self.assertIn("accounted for 100%", smooth["stockout_risk"])

    def test_branch_with_nothing_carried(self):
        body = self.get("/forecast/insights", {"id": 9, "name": "New Branch"}).json()
        self.assertEqual(body["engine"], "No data")


if __name__ == "__main__":
    unittest.main()
