from datetime import date, datetime, timezone
from types import SimpleNamespace

from django.test import SimpleTestCase

from dust.weather_morning_notifications import WeatherRisk, build_weather_morning_body


def risk_with(*, cold=False, heat=False, rain=False, thunder=False, wind=False, temperatures=()):
    points = [SimpleNamespace(
        measured_at=datetime(2026, 10, 5, 9 + index, tzinfo=timezone.utc),
        rain_probability=None,
        temperature=temperature,
    ) for index, temperature in enumerate(temperatures)]
    marker = points[0] if points else SimpleNamespace(
        measured_at=datetime(2026, 10, 5, 9, tzinfo=timezone.utc),
        rain_probability=None,
        temperature=None,
    )
    return WeatherRisk(
        points=points,
        rain_points=[marker] if rain else [],
        snow_cold_points=[marker] if cold else [],
        wind_points=[marker] if wind else [],
        thunder_points=[marker] if thunder else [],
        heat_points=[marker] if heat else [],
    )


class WeatherNotificationPriorityTests(SimpleTestCase):
    def test_snow_or_cold_leads_over_thunder_and_heat(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(cold=True, heat=True, thunder=True),
            [],
        )

        self.assertIn("기온이 낮거나 눈이 올 수 있어요", body)
        self.assertNotIn("천둥·번개", body)
        self.assertNotIn("물을 꼭 챙기세요", body)

    def test_rain_and_wind_are_combined_before_heat(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(heat=True, rain=True, wind=True),
            [],
        )

        self.assertIn("비와 강한 바람이 예상돼요", body)
        self.assertNotIn("물을 꼭 챙기세요", body)

    def test_temperature_range_is_included_for_rain_notification(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(rain=True, temperatures=(18.2, 22.4, 20.1)),
            [],
        )

        self.assertIn("예상 기온 18~22°C", body)
        self.assertIn("비가 올 수 있어요. 우산을 챙기세요", body)
        self.assertNotIn("예상예요", body)

    def test_single_temperature_is_included_for_normal_notification(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(temperatures=(21.6,)),
            [],
        )

        self.assertIn("예상 기온 22°C", body)

    def test_event_summary_uses_readable_time_first_format(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(temperatures=(21.6,)),
            [{"title": "업무 회의", "time": "09:00"}],
        )

        self.assertIn("09:00 일정이 있어요", body)
        self.assertNotIn("업무 회의", body)  # 일정 제목은 서버에 두지 않으므로 문구에도 쓰지 않는다.
        self.assertNotIn("[", body)

    def test_hot_weather_mentions_water_and_parasol(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(heat=True, temperatures=(31.0, 33.0)),
            [],
        )

        self.assertIn("물과 양산을 챙기고", body)

    def test_normal_weather_copy_is_short(self):
        body = build_weather_morning_body(
            date(2026, 10, 5),
            risk_with(temperatures=(20.0, 23.0)),
            [],
        )

        self.assertIn("큰 날씨 변화가 없어요", body)
