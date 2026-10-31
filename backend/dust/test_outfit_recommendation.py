import os
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from dust.services.outfit.aggregation import WeatherPoint, aggregate_schedule_window, wind_chill
from dust.services.outfit.daily_service import merge_daily_snapshots, recommend_daily_outfit
from dust.services.outfit.occasion import classify_occasion
from dust.services.outfit.rule_engine import _with_josa, build_rule_result
from dust.services.outfit.service import recommend_outfit


def snapshot(**overrides):
    value = {"feels_min": 3, "feels_max": 3, "feels_avg": 3, "temp_range": 0, "rain_prob_max": 0, "rain_mm_max": 0, "wind_max": 2, "pm10_max": 20, "pm25_max": 10, "data_gaps": []}
    value.update(overrides)
    return value


def request_payload():
    return {"schedule_id": "event-1", "title": "친구와 카페", "start": "2026-10-04T14:00:00+09:00", "end": "2026-10-04T18:00:00+09:00", "activity_type": "outdoor", "lat": 35.1, "lng": 129.0, "city": "부산광역시", "region": "중구", "sensitivity": "normal"}


class OutfitAggregationTests(SimpleTestCase):
    def test_wind_chill_uses_kmh_conversion(self):
        self.assertLess(wind_chill(3, 3), 3)

    def test_missing_values_are_reported_individually(self):
        result = aggregate_schedule_window([WeatherPoint(temperature=18)], [])
        self.assertEqual(result["feels_avg"], 18)
        self.assertIn("rain", result["data_gaps"])
        self.assertIn("pm10", result["data_gaps"])

    def test_mixed_snow_precipitation_has_priority_over_rain_and_wind(self):
        result = aggregate_schedule_window(
            [WeatherPoint(temperature=1, wind_speed=10, rain_mm=2, precipitation_type="2", label="비/눈")],
            [],
        )
        self.assertTrue(result["has_snow"])
        self.assertTrue(result["has_rain"])
        self.assertEqual(result["weather_condition"], "snow")


class OutfitRuleEngineTests(SimpleTestCase):
    def test_running_uses_sportswear_instead_of_cardigan(self):
        result = build_rule_result(snapshot(feels_min=20, feels_max=23, feels_avg=21.5), activity_type="outdoor", sensitivity="normal", occasion="running")
        self.assertEqual(result["outfit"]["outer"], ["얇은 바람막이"])
        self.assertIn("기능성", result["outfit"]["top"][0])
        self.assertNotIn("가디건", result["summary"])

    def test_common_running_and_fitness_typos_are_normalized(self):
        self.assertEqual(classify_occasion("저녁 런닝"), "running")
        self.assertEqual(classify_occasion("헬쓰 운동"), "sport")

    def test_cold_rain_dust_uses_b8_and_required_items(self):
        result = build_rule_result(snapshot(rain_prob_max=70, pm10_max=100), activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertEqual(result["outfit"]["band"], "B8")
        self.assertEqual({(item["type"], item["level"]) for item in result["must_have"]}, {("umbrella", "required"), ("mask", "required"), ("scarf_gloves", "recommended")})

    def test_outfit_note_picks_josa_by_final_consonant(self):
        result = build_rule_result(snapshot(feels_min=10, feels_max=19, feels_avg=15, temp_range=9, rain_prob_max=70), activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertTrue(result["outfit_note"].startswith("니트와 청바지"), result["outfit_note"])
        self.assertIn("재킷을 추천해요", result["outfit_note"])
        self.assertEqual(_with_josa("바람막이", "을", "를"), "바람막이를")
        self.assertEqual(_with_josa("패딩", "과", "와"), "패딩과")

    def test_warm_clear_weather_uses_b2_without_must_have(self):
        result = build_rule_result(snapshot(feels_min=25, feels_max=25, feels_avg=25), activity_type="outdoor", sensitivity="normal", occasion="unknown")
        self.assertEqual(result["outfit"]["band"], "B2")
        self.assertEqual(result["must_have"], [])

    def test_very_hot_outdoor_weather_recommends_sun_parasol(self):
        result = build_rule_result(snapshot(feels_min=29, feels_max=33, feels_avg=31), activity_type="outdoor", sensitivity="normal", occasion="unknown")
        self.assertIn("sun_parasol", [item["type"] for item in result["must_have"]])
        self.assertIn("양산", result["outfit"]["accessories"])

    def test_very_hot_indoor_schedule_does_not_recommend_sun_parasol(self):
        result = build_rule_result(snapshot(feels_min=29, feels_max=33, feels_avg=31), activity_type="indoor", sensitivity="normal", occasion="unknown")
        self.assertNotIn("sun_parasol", [item["type"] for item in result["must_have"]])

    def test_large_temperature_range_adds_layering_tip(self):
        result = build_rule_result(snapshot(feels_min=10, feels_max=19, feels_avg=15, temp_range=9), activity_type="outdoor", sensitivity="normal", occasion="unknown")
        self.assertTrue(result["layering_tip"])

    def test_strong_wind_adds_windbreaker(self):
        result = build_rule_result(snapshot(feels_min=12, feels_max=12, feels_avg=12, wind_max=10), activity_type="outdoor", sensitivity="normal", occasion="unknown")
        self.assertIn("windbreaker", [item["type"] for item in result["must_have"]])
        self.assertIn("방풍", result["outfit"]["outer"][0])
        self.assertEqual(result["weather_condition"], "strong_wind")

    def test_rain_replaces_outer_with_water_resistant_option(self):
        result = build_rule_result(snapshot(feels_min=18, feels_max=18, feels_avg=18, rain_prob_max=70), activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertIn("방수", result["outfit"]["outer"][0])
        self.assertIn("umbrella", [item["type"] for item in result["must_have"]])
        self.assertEqual(result["weather_condition"], "rain")

    def test_snow_uses_weatherproof_outer_and_footwear(self):
        result = build_rule_result(snapshot(feels_min=-1, feels_max=2, feels_avg=1, has_snow=True, has_rain=True, wind_max=10), activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertIn("방수·방풍", result["outfit"]["outer"][0])
        self.assertIn("waterproof_shoes", [item["type"] for item in result["must_have"]])
        self.assertNotIn("umbrella", [item["type"] for item in result["must_have"]])
        self.assertEqual(result["weather_condition"], "snow")

    def test_indoor_always_has_portable_outer(self):
        result = build_rule_result(snapshot(feels_avg=30), activity_type="indoor", sensitivity="normal", occasion="unknown")
        self.assertIn("가벼운 겉옷", result["outfit"]["outer"][0])

    def test_cold_sensitivity_selects_warmer_band(self):
        normal = build_rule_result(snapshot(feels_min=13, feels_max=13, feels_avg=13), activity_type="outdoor", sensitivity="normal", occasion="unknown")
        cold = build_rule_result(snapshot(feels_min=13, feels_max=13, feels_avg=13), activity_type="outdoor", sensitivity="cold", occasion="unknown")
        self.assertEqual(normal["outfit"]["band"], "B5")
        self.assertEqual(cold["outfit"]["band"], "B6")


class DailyOutfitServiceTests(SimpleTestCase):
    def test_daily_snapshot_uses_full_temperature_range_and_weather_priority(self):
        result = merge_daily_snapshots([
            snapshot(feels_min=18, feels_max=24, feels_avg=21, weather_condition="normal"),
            snapshot(feels_min=2, feels_max=7, feels_avg=4, has_snow=True, has_rain=True, weather_condition="snow"),
        ])
        self.assertEqual(result["feels_min"], 2)
        self.assertEqual(result["feels_avg"], 4)
        self.assertEqual(result["feels_max"], 24)
        self.assertEqual(result["temp_range"], 22)
        self.assertEqual(result["weather_condition"], "snow")

    @patch("dust.services.outfit.daily_service.load_schedule_snapshot")
    def test_multiple_schedules_return_one_base_outfit_with_prioritized_tips(self, load_snapshot):
        load_snapshot.side_effect = [
            snapshot(feels_min=18, feels_max=22, feels_avg=20, weather_condition="normal"),
            snapshot(feels_min=12, feels_max=15, feels_avg=13, rain_prob_max=80, has_rain=True, weather_condition="rain"),
        ]
        first = request_payload()
        second = {**request_payload(), "schedule_id": "event-2", "title": "저녁 운동", "start": "2026-10-04T19:00:00+09:00", "end": "2026-10-04T20:00:00+09:00"}
        payload = {"schedules": [first, second], "sensitivity": "normal"}

        result = recommend_daily_outfit(payload)

        self.assertEqual(result["total_schedules"], 2)
        self.assertEqual(result["weather_condition"], "rain")
        self.assertEqual(result["schedule_tips"][0]["schedule_id"], "event-2")
        self.assertIn("우산", result["schedule_tips"][0]["items"])
        self.assertEqual(result["source"], "rule")


class OutfitServiceTests(SimpleTestCase):
    @patch("dust.services.outfit.service.load_schedule_snapshot", return_value=snapshot(feels_min=10, feels_max=19, feels_avg=15, temp_range=9, rain_prob_max=70))
    def test_returns_rule_result_even_if_old_app_asks_for_full(self, _snapshot):
        result = recommend_outfit({**request_payload(), "mode": "full"})
        self.assertEqual(result["source"], "rule")
        self.assertEqual(result["outfit"]["band"], "B5")


class OutfitEndpointTests(SimpleTestCase):
    @patch("dust.services.outfit.service.load_schedule_snapshot", return_value=snapshot(feels_avg=None, feels_min=None, feels_max=None))
    def test_missing_weather_returns_503(self, _mock_snapshot):
        response = self.client.post("/outfit/recommend/", data=request_payload(), content_type="application/json", HTTP_X_APP_TEST_TOKEN=os.getenv("APP_TEST_TOKEN", ""))
        self.assertEqual(response.status_code, 503)


class ShowerVsRainTests(SimpleTestCase):
    """잠깐 오는 비는 겉옷을 바꾸지 않되, 우산은 필수로 두고 시간대를 알린다."""

    def _window(self, hours, rainy_hours, rain_mm=0.5, probability=None):
        from datetime import datetime, timedelta, timezone as dt_timezone

        start = datetime(2026, 10, 10, 12, tzinfo=dt_timezone(timedelta(hours=9)))
        points = [
            WeatherPoint(
                temperature=18,
                wind_speed=1,
                rain_mm=rain_mm if hour in rainy_hours else 0,
                rain_probability=probability if hour in rainy_hours else 10,
                measured_at=start + timedelta(hours=hour),
            )
            for hour in range(hours)
        ]
        return aggregate_schedule_window(points, [], window=(start, start + timedelta(hours=hours)))

    def test_two_hours_of_rain_in_a_long_day_is_showers_with_required_umbrella(self):
        snap = self._window(10, {3, 4})
        self.assertEqual(snap["weather_condition"], "showers")
        self.assertEqual((snap["rain_start"], snap["rain_end"]), ("15:00", "17:00"))
        result = build_rule_result(snap, activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertNotIn("방수", " ".join(result["outfit"]["outer"]))
        umbrella = next(item for item in result["must_have"] if item["type"] == "umbrella")
        self.assertEqual(umbrella["level"], "required")
        self.assertIn("15~17시", umbrella["reason"])
        self.assertIn("15~17시", result["summary"])

    def test_rain_for_most_of_the_window_changes_the_outer(self):
        snap = self._window(10, {1, 2, 3, 4, 5, 6})
        self.assertEqual(snap["weather_condition"], "rain")
        result = build_rule_result(snap, activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertIn("방수", result["outfit"]["outer"][0])

    def test_short_schedule_with_any_rain_is_rain(self):
        self.assertEqual(self._window(2, {1})["weather_condition"], "rain")

    def test_brief_heavy_rain_is_rain(self):
        self.assertEqual(self._window(10, {5}, rain_mm=5)["weather_condition"], "rain")

    def test_brief_rain_probability_only_is_still_showers(self):
        snap = self._window(10, {3}, rain_mm=0, probability=70)
        self.assertEqual(snap["weather_condition"], "showers")
        self.assertEqual(snap["rain_hours"], 1)

    def test_daily_merge_keeps_normal_outer_when_one_short_schedule_hits_a_shower(self):
        rainy = self._window(2, {1})  # 짧은 일정은 rain
        dry = [self._window(3, set()) for _ in range(3)]
        merged = merge_daily_snapshots([rainy, *dry])
        self.assertEqual(rainy["weather_condition"], "rain")
        self.assertEqual(merged["weather_condition"], "showers")
        result = build_rule_result(merged, activity_type="outdoor", sensitivity="normal", occasion="casual")
        self.assertNotIn("방수", " ".join(result["outfit"]["outer"]))
        self.assertEqual(next(item for item in result["must_have"] if item["type"] == "umbrella")["level"], "required")


class OutfitNearestCollectedGridTests(TestCase):
    """고른 곳 격자에 날씨가 없으면(예: 울주군 삼남읍) 가장 가까운 모으는 격자의 날씨로 옷차림을 추천한다."""

    def test_snapshot_uses_nearest_collected_grid(self):
        from datetime import timedelta
        from django.utils import timezone
        from dust.models import WeatherHourlyMeasurement
        from dust.services.outfit.context_builder import OutfitRequest
        from dust.services.outfit.data_provider import _dfs_grid, load_schedule_snapshot

        lat, lng = 35.5583, 129.1139
        nx, ny = _dfs_grid(lat, lng)
        now = timezone.now()
        for hours in (-1, 1, 2):
            WeatherHourlyMeasurement.objects.create(nx=nx + 3, ny=ny - 2, measured_at=now + timedelta(hours=hours), temperature=15, wind_speed=1)
        request = OutfitRequest(schedule_id="1", title="외출", start=now, end=now + timedelta(hours=2), activity_type="outdoor", lat=lat, lng=lng, city="울산", region="삼남읍", sensitivity="normal")
        snapshot = load_schedule_snapshot(request)
        self.assertIsNotNone(snapshot.get("feels_avg"))
