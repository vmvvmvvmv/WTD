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
    def test_every_hazard_is_listed_with_its_own_time(self):
        points = [point(7), point(8, label='비', rain_probability=80), point(9, label='비', rain_probability=70),
                  point(13, wind_speed=9.4), point(14, wind_speed=8.2), point(20, label='비', rain_probability=60)]
        title, body = build_weather_morning_message('강남구', points, [])
        self.assertEqual(title, '오늘 강남구 날씨')
        first = body.split('\n')[0]
        self.assertEqual(first, '비 8~10시, 20~21시(최대 80%) · 강한 바람 13~15시(최대 9m/s)')
        self.assertIn('챙길 것: 우산 · 바람막이', body)

    def test_snow_and_freezing_are_reported_separately(self):
        points = [point(7, temperature=-3.0), point(8, label='눈', pty='3', temperature=-1.0), point(14, temperature=4.0)]
        _, body = build_weather_morning_message('강남구', points, [])
        self.assertTrue(body.startswith('눈 8~9시'))
        self.assertIn('기온 -3~4° (기상청 예보)', body)
        self.assertIn('미끄럽지 않은 신발 · 두꺼운 겉옷', body)

    def test_event_times_say_which_hazard_hits_them(self):
        points = [point(9), point(15, label='비', rain_probability=80), point(16)]
        title, body = build_weather_morning_message('강남구', points, [{'date': '2026-10-11', 'time': '09:00'}, {'date': '2026-10-11', 'time': '15:30', 'title': '병원'}])
        self.assertEqual(title, '오늘 강남구 날씨 · 일정 2개')
        self.assertIn('일정 09:00, 15:30 · 15:30 일정 때 비', body)
        self.assertNotIn('병원', body)  # 일정 제목은 서버에 두지 않으므로 문구에도 쓰지 않는다.

    def test_big_temperature_range_and_heat(self):
        points = [point(7, temperature=19.0), point(14, temperature=31.0)]
        _, body = build_weather_morning_message('강남구', points, [])
        self.assertIn('기온 19~31° · 일교차 12° (기상청 예보)', body)
        self.assertIn('챙길 것: 얇은 겉옷 · 물·양산', body)

    def test_thunder_tells_to_stay_inside(self):
        _, body = build_weather_morning_message('강남구', [point(15, label='천둥번개')], [])
        self.assertIn('천둥·번개 15~16시', body)
        self.assertIn('천둥·번개 때는 실내에 머무세요', body)

    def test_calm_day_is_short(self):
        _, body = build_weather_morning_message('강남구', [point(9, temperature=20.0), point(15, temperature=23.0)], [])
        self.assertEqual(body, '비·눈 예보 없음\n기온 20~23° (기상청 예보)')
