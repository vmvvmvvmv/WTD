import io
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import SimpleTestCase, TestCase

from dust.config import SIDO_NAMES
from dust.models import AirQualityStation

DUST_CMD = "dust.management.commands.collect_realtime_dust"
WEATHER_CMD = "dust.management.commands.collect_realtime_weather"


def fake_sido_fetch(failing):
    def fetch(sido):
        if sido in failing:
            return {}, [{"sido": sido, "status": "request_failed", "items": 0}]
        return {f"{sido}:측정소": {"name": "측정소", "sido": sido}}, []
    return fetch


@patch(f"{DUST_CMD}.call_command")
@patch(f"{DUST_CMD}._store_realtime_values_to_db", return_value=0)
class CollectRealtimeDustFailureTests(SimpleTestCase):
    def run_command(self):
        call_command("collect_realtime_dust", "--realtime-only", "--skip-spike-retry", stdout=io.StringIO(), stderr=io.StringIO())

    def test_some_sidos_failing_saves_the_rest_and_fails_the_command(self, store, _evaluate):
        with patch(f"{DUST_CMD}._fetch_realtime_station_values_for_sido", side_effect=fake_sido_fetch({"부산", "제주"})):
            with self.assertRaisesRegex(CommandError, r"2/17 sidos: .*부산"):
                self.run_command()
        # 성공한 15개 시도는 실패와 상관없이 저장된다.
        self.assertEqual(len(store.call_args.args[0]), len(SIDO_NAMES) - 2)

    def test_every_sido_failing_fails_the_command(self, _store, _evaluate):
        with patch(f"{DUST_CMD}._fetch_realtime_station_values_for_sido", side_effect=fake_sido_fetch(set(SIDO_NAMES))):
            with self.assertRaisesRegex(CommandError, r"17/17 sidos"):
                self.run_command()

    def test_all_sidos_collected_succeeds(self, _store, _evaluate):
        with patch(f"{DUST_CMD}._fetch_realtime_station_values_for_sido", side_effect=fake_sido_fetch(set())):
            self.run_command()


class CollectRealtimeWeatherFailureTests(TestCase):
    def setUp(self):
        AirQualityStation.objects.create(sido="서울", name="종로구", addr="서울 종로구 종로35가길 19", lat=37.572, lng=127.005)

    def run_command(self):
        call_command("collect_realtime_weather", "--workers", "1", stdout=io.StringIO(), stderr=io.StringIO())

    @patch(f"{WEATHER_CMD}.KMA_API_KEY", "")
    def test_missing_key_fails_the_command(self):
        with self.assertRaisesRegex(CommandError, "KMA_API_KEY"):
            self.run_command()

    @patch(f"{WEATHER_CMD}.KMA_API_KEY", "test-key")
    @patch(f"{WEATHER_CMD}._collect_grid_weather", return_value=(0, "ConnectionError"))
    def test_grid_with_nothing_stored_fails_the_command(self, _collect):
        with self.assertRaisesRegex(CommandError, "1/1 grids"):
            self.run_command()

    @patch(f"{WEATHER_CMD}.KMA_API_KEY", "test-key")
    @patch(f"{WEATHER_CMD}._collect_grid_weather", return_value=(72, ""))
    def test_all_grids_stored_succeeds(self, _collect):
        self.run_command()
