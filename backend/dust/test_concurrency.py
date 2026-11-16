"""동시 요청 테스트: 여러 요청이 같은 순간에 같은 값을 건드려도 결과가 맞는지 본다.

SQLite는 쓰기를 한 줄로 세워서 겹침이 재현되지 않으므로 MySQL에서만 돈다.
    TEST_DB=mysql venv/Scripts/python.exe manage.py test dust.test_concurrency
"""
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from types import SimpleNamespace
from unittest import skipUnless
from unittest.mock import patch

from django.db import connection
from django.test import RequestFactory, TransactionTestCase
from django.utils import timezone


def race(fn, n):
    """쓰레드 n개를 출발선(Barrier)에 세웠다가 동시에 fn(i)를 부른다. [('ok', 값) | ('err', 예외)]"""
    barrier = threading.Barrier(n)

    def run(i):
        barrier.wait()
        try:
            return ("ok", fn(i))
        except Exception as exc:
            return ("err", exc)
        finally:
            connection.close()  # 쓰레드마다 열린 DB 연결을 닫아야 테스트 DB를 지울 수 있다.

    with ThreadPoolExecutor(max_workers=n) as pool:
        return list(pool.map(run, range(n)))


@skipUnless(connection.vendor == "mysql", "동시 요청 테스트는 TEST_DB=mysql 일 때만")
class ConcurrencyTests(TransactionTestCase):

    def test_ai_daily_quota_lets_exactly_the_limit_through(self):
        """같은 기기에서 AI 일정 등록 30번이 동시에 와도 기기 한도(20번)만큼만 통과한다."""
        from dust.services.memo_events import DAILY_DEVICE_LIMIT, MemoQuotaExceeded, _take_quota
        results = race(lambda i: _take_quota("race-device", "10.0.0.1"), 30)
        passed = [r for r in results if r[0] == "ok"]
        blocked = [r for r in results if r[0] == "err" and isinstance(r[1], MemoQuotaExceeded)]
        self.assertEqual(len(passed), DAILY_DEVICE_LIMIT, results)
        self.assertEqual(len(passed) + len(blocked), 30, results)

    def test_api_usage_counter_loses_no_calls(self):
        """수집 쓰레드 8개가 같은 API를 1,000번 불러도 호출 수가 정확히 1,000이다(그날 첫 줄을 동시에 만들 때 포함)."""
        from dust.api_usage import record_api_call
        from dust.models import ExternalApiUsage
        url = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
        race(lambda i: [record_api_call(url, SimpleNamespace(status_code=200, content=b"{}")) for _ in range(125)], 8)
        self.assertEqual(ExternalApiUsage.objects.get().calls, 1000)

    def test_same_push_token_registered_at_once_makes_one_device(self):
        """앱이 같은 알림 토큰으로 등록을 10번 동시에 보내도 기기는 1대, 오류는 없다."""
        from dust.models import NotificationDevice
        from dust.notification_registry import upsert_notification_device
        payload = {"expoPushToken": "ExponentPushToken[race]", "city": "부산", "region": "대신동", "weatherWarningAlerts": True}
        results = race(lambda i: upsert_notification_device(payload), 10)
        self.assertEqual([r for r in results if r[0] == "err"], [])
        self.assertEqual(NotificationDevice.objects.count(), 1)

    def test_soon_alert_sent_once_when_two_runs_overlap(self):
        """'곧 비' 알림 작업이 두 번 겹쳐 돌아도(손으로 한 번 더 돌린 경우) 같은 알림은 한 번만 간다."""
        from dust import weather_morning_notifications as module
        from dust.models import NotificationDevice, WeatherHourlyMeasurement
        NotificationDevice.objects.create(expo_push_token="ExponentPushToken[soon]", city="부산", region="대신동", enabled=True, weather_warning_alerts=True)
        tz = timezone.get_current_timezone()
        rain = {16, 17}
        points = [
            WeatherHourlyMeasurement(measured_at=timezone.make_aware(datetime(2026, 11, 9, h), tz), label="비" if h in rain else "맑음",
                                     precipitation_type="1" if h in rain else "0", rain_mm=2 if h in rain else 0, wind_speed=2)
            for h in range(24)
        ]
        sent = []

        def slow_push(token, title, body, data):
            threading.Event().wait(0.2)  # 실제 푸시처럼 네트워크를 기다리는 동안 다른 작업이 끼어들 수 있다.
            sent.append(body)

        with patch.object(module, "weather_points_for_region", side_effect=lambda city, region, day: points if day.day == 9 else []), \
                patch.object(module, "send_expo_push", side_effect=slow_push):
            race(lambda i: module.send_weather_soon_notifications(now=timezone.make_aware(datetime(2026, 11, 9, 14, 45), tz)), 2)
        self.assertEqual(len(sent), 1, sent)

    def test_place_search_ip_limit_holds_under_parallel_requests(self):
        """한 IP에서 장소 검색 200번이 동시에 와도 네이버로 가는 건 120번(IP 한도)까지다."""
        from dust.views import PLACE_SEARCH_IP_LIMIT, _place_search_allowed
        request = RequestFactory().get("/dust/places/search/", REMOTE_ADDR="10.0.0.2")
        results = race(lambda i: _place_search_allowed(request), 200)
        self.assertEqual(sum(1 for r in results if r == ("ok", True)), PLACE_SEARCH_IP_LIMIT)
