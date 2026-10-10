from datetime import datetime, timedelta
from types import SimpleNamespace

from django.test import SimpleTestCase
from django.utils import timezone

from dust.weather_morning_notifications import build_weather_morning_message, hour_blocks_text


def point(hour, *, label='맑음', pty='0', rain_mm=None, rain_probability=10, temperature=18.0, wind_speed=2.0):
    measured_at = timezone.make_aware(datetime(2026, 10, 11, 0, 0)) + timedelta(hours=hour)
    return SimpleNamespace(
        label=label,
        measured_at=measured_at,
        precipitation_type=pty,
        rain_mm=rain_mm,
        rain_probability=rain_probability,
        temperature=temperature,
        wind_speed=wind_speed,
    )


class HourBlocksTests(SimpleTestCase):
    def test_separate_blocks_are_not_merged(self):
        self.assertEqual(hour_blocks_text([6, 7, 15, 16, 17]), '6~8시, 15~18시')
        self.assertEqual(hour_blocks_text([6, 9, 12]), '6~7시, 9~10시 등')


class WeatherMorningMessageTests(SimpleTestCase):
    def test_hazards_with_times_temperature_and_what_to_bring(self):
        points = [point(7, temperature=12.0), point(8, label='비', rain_probability=80), point(9, label='비'),
                  point(13, wind_speed=9.4), point(14, temperature=19.0, wind_speed=8.2)]
        title, body = build_weather_morning_message('강남구', points, [])
        self.assertEqual(title, '오늘 강남구 날씨')
        self.assertEqual(body, '비 8~10시 · 강한 바람 13~15시\n기온 12~19°\n우산·바람막이 챙기세요')

    def test_snow_and_freezing_are_reported_separately(self):
        points = [point(7, temperature=-3.0), point(8, label='눈', pty='3', temperature=-1.0), point(14, temperature=4.0)]
        _, body = build_weather_morning_message('강남구', points, [])
        self.assertEqual(body, '눈 8~9시\n기온 -3~4°\n두꺼운 겉옷 챙기세요\n길이 미끄러울 수 있어요')

    def test_only_events_hit_by_weather_are_mentioned(self):
        points = [point(9), point(15, label='비', rain_probability=80), point(16)]
        _, body = build_weather_morning_message('강남구', points, [{'time': '09:00'}, {'time': '15:30', 'title': '병원'}])
        self.assertIn('15:30 일정 때 비', body)
        self.assertNotIn('09:00', body)
        self.assertNotIn('병원', body)  # 일정 제목은 서버에 두지 않으므로 문구에도 쓰지 않는다.

    def test_big_range_and_heat(self):
        _, body = build_weather_morning_message('강남구', [point(7, temperature=19.0), point(14, temperature=31.0)], [])
        self.assertEqual(body, '비·눈 예보 없음\n기온 19~31°\n겉옷·물·양산 챙기세요')

    def test_thunder_tells_to_stay_inside(self):
        _, body = build_weather_morning_message('강남구', [point(15, label='천둥번개')], [])
        self.assertIn('천둥·번개 15~16시', body)
        self.assertIn('천둥·번개 때는 실내에 머무세요', body)

    def test_calm_day_is_short(self):
        _, body = build_weather_morning_message('강남구', [point(9, temperature=20.0), point(15, temperature=23.0)], [])
        self.assertEqual(body, '비·눈 예보 없음\n기온 20~23°')
