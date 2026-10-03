from datetime import timedelta

from django.test import SimpleTestCase
from django.utils import timezone

from dust.data_freshness import evaluate_data_freshness


class DataFreshnessTests(SimpleTestCase):
    def setUp(self):
        self.now = timezone.now()

    def evaluate(self, **overrides):
        values = {
            "now": self.now,
            "active_station_count": 1,
            "dust_latest_at": None,
            "dust_row_count": 0,
            "weather_latest_at": None,
            "usable_weather_count": 0,
        }
        values.update(overrides)
        return evaluate_data_freshness(**values)

    def test_reports_missing_datasets(self):
        result = self.evaluate()

        self.assertFalse(result["ok"])
        self.assertIn("realtime_dust_missing", result["problems"])
        self.assertIn("hourly_weather_missing", result["problems"])

    def test_reports_stale_datasets(self):
        stale_at = self.now - timedelta(hours=12)
        result = self.evaluate(
            dust_latest_at=stale_at,
            dust_row_count=10,
            weather_latest_at=stale_at,
            usable_weather_count=10,
        )

        self.assertFalse(result["ok"])
        self.assertIn("realtime_dust_stale", result["problems"])
        self.assertIn("hourly_weather_stale", result["problems"])

    def test_reports_weather_unavailable_when_collection_is_recent_but_has_no_usable_rows(self):
        result = self.evaluate(
            dust_latest_at=self.now,
            dust_row_count=10,
            weather_latest_at=self.now,
            usable_weather_count=0,
        )

        self.assertFalse(result["ok"])
        self.assertIn("hourly_weather_unavailable", result["problems"])

    def test_reports_fresh_datasets(self):
        result = self.evaluate(
            dust_latest_at=self.now,
            dust_row_count=10,
            weather_latest_at=self.now,
            usable_weather_count=10,
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["problems"], [])
