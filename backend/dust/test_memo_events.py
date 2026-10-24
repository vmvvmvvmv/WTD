import os
from datetime import date, datetime
from unittest.mock import patch

from django.test import TestCase

from dust.services.memo_events import DAILY_DEVICE_LIMIT, DAILY_IP_LIMIT, MemoQuotaExceeded, _take_quota, clean_events


TODAY = date(2026, 10, 24)  # 토요일


class CleanEventsTests(TestCase):
    def test_keeps_valid_events_and_fills_defaults(self):
        events = clean_events({"events": [
            {"title": "친구 만남", "date": "2026-10-25", "time": "15:00", "end_date": "", "end_time": "", "place": "강남역", "activity_type": "indoor"},
            {"title": "한강 러닝", "date": "2026-10-31", "time": "", "end_date": "", "end_time": "", "place": "", "activity_type": "running"},
            {"title": "야식", "date": "2026-10-24", "time": "23:30", "end_date": "", "end_time": "", "place": "", "activity_type": "indoor"},
        ]}, TODAY)
        self.assertEqual(events[0], {"title": "친구 만남", "date": "2026-10-25", "time": "15:00", "end_date": "2026-10-25", "end_time": "16:00", "activity_type": "indoor", "place_text": "강남역"})
        # 시각이 없으면 09:00, 모르는 활동 종류는 outdoor
        self.assertEqual((events[1]["time"], events[1]["end_time"], events[1]["activity_type"]), ("09:00", "10:00", "outdoor"))
        # 한 시간 뒤가 자정을 넘으면 그날 23:59에 끝난다
        self.assertEqual((events[2]["end_date"], events[2]["end_time"]), ("2026-10-24", "23:59"))

    def test_drops_bad_dates_titles_and_extra_events(self):
        raw = {"events": [
            {"title": "", "date": "2026-10-25", "time": "10:00"},
            {"title": "지난 일", "date": "2026-10-23", "time": "10:00"},
            {"title": "너무 먼 일", "date": "2028-01-01", "time": "10:00"},
            {"title": "이상한 날짜", "date": "2026-13-40", "time": "10:00"},
            "문자열",
            *[{"title": f"일정{i}", "date": "2026-10-26", "time": "25:99"} for i in range(20)],
        ]}
        events = clean_events(raw, TODAY)
        self.assertEqual(len(events), 5)  # 앞 10개 중 유효한 것만
        self.assertTrue(all(event["time"] == "09:00" for event in events))

    def test_multi_day_and_reversed_end(self):
        events = clean_events({"events": [
            {"title": "제주 여행", "date": "2026-10-30", "time": "08:00", "end_date": "2026-11-01", "end_time": "", "place": "제주", "activity_type": "transit"},
            {"title": "회의", "date": "2026-10-27", "time": "14:00", "end_date": "", "end_time": "13:00", "place": "", "activity_type": "indoor"},
        ]}, TODAY)
        self.assertEqual((events[0]["end_date"], events[0]["end_time"]), ("2026-11-01", "23:59"))
        self.assertEqual((events[1]["end_date"], events[1]["end_time"]), ("2026-10-27", "15:00"))

    def test_output_without_events_list_fails(self):
        from dust.services.memo_events import MemoFailed
        with self.assertRaises(MemoFailed):
            clean_events({"items": []}, TODAY)


class MemoQuotaTests(TestCase):
    def test_device_limit_and_ip_limit(self):
        for _ in range(DAILY_DEVICE_LIMIT):
            _take_quota("device-a", "ip-1")
        with self.assertRaises(MemoQuotaExceeded):
            _take_quota("device-a", "ip-1")
        # 기기 ID를 바꿔도 같은 IP는 IP 상한에서 막힌다.
        with self.assertRaises(MemoQuotaExceeded):
            for index in range(DAILY_IP_LIMIT):
                _take_quota(f"device-{index}", "ip-1")
        _take_quota("device-a2", "ip-2")


@patch.dict(os.environ, {"APP_TEST_TOKEN": "", "LLM_PROVIDER": "gemini", "LLM_API_KEY": "test", "LLM_ENABLED": "true"})
class MemoEndpointTests(TestCase):
    URL = "/dust/calendar/memo-events/"

    def _post(self, text, **headers):
        return self.client.post(self.URL, data={"text": text}, content_type="application/json", **headers)

    @patch("dust.services.memo_events.search_naver_places", return_value=[{"label": "강남역 2호선", "address": "서울 강남구", "lat": 37.49, "lng": 127.02, "source": "naver_local"}])
    @patch("dust.services.memo_events._ask_gemini")
    def test_returns_events_with_place(self, ask, search):
        ask.return_value = {"events": [{"title": "친구 만남", "date": "2099-01-01", "time": "15:00", "end_date": "", "end_time": "", "place": "강남역", "activity_type": "indoor"}]}
        with patch("dust.services.memo_events.timezone.localtime", return_value=datetime(2098, 12, 31, 10, 0)):
            response = self._post("내일 3시 강남역 친구", HTTP_X_DEVICE_ID="device-1")
        self.assertEqual(response.status_code, 200)
        event = response.json()["events"][0]
        self.assertEqual(event["place"]["lat"], 37.49)
        search.assert_called_once_with("강남역", 1)

    @patch("dust.services.memo_events.search_naver_places", return_value=[{"label": "올림픽공원", "address": "서울 송파구", "lat": 37.52, "lng": 127.12, "source": "naver_local"}])
    @patch("dust.services.memo_events._ask_gemini")
    def test_unrelated_first_place_result_is_ignored(self, ask, _search):
        ask.return_value = {"events": [{"title": "러닝", "date": "2099-01-01", "time": "07:00", "end_date": "", "end_time": "", "place": "한강공원", "activity_type": "outdoor"}]}
        with patch("dust.services.memo_events.timezone.localtime", return_value=datetime(2098, 12, 31, 10, 0)):
            event = self._post("내일 7시 한강공원 러닝").json()["events"][0]
        self.assertIsNone(event["place"])
        self.assertEqual(event["place_text"], "한강공원")

    def test_empty_and_too_long_text(self):
        self.assertEqual(self._post("  ").status_code, 400)
        self.assertEqual(self._post("가" * 501).status_code, 400)

    @patch.dict(os.environ, {"LLM_API_KEY": ""})
    def test_unconfigured_ai_returns_503(self):
        self.assertEqual(self._post("내일 3시 약속").status_code, 503)

    @patch("dust.services.memo_events._ask_gemini", return_value={"events": []})
    def test_quota_returns_429(self, _ask):
        for _ in range(DAILY_DEVICE_LIMIT):
            self.assertEqual(self._post("내일 약속", HTTP_X_DEVICE_ID="d").status_code, 200)
        response = self._post("내일 약속", HTTP_X_DEVICE_ID="d")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "quota_exceeded")
