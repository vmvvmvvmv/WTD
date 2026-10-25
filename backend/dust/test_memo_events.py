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
        search.assert_called_once_with("강남역", 1, timeout=4)

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
        self.assertEqual(self._post("내일 오전쯤 약속").status_code, 503)

    @patch("dust.services.memo_events._ask_gemini", return_value={"events": []})
    def test_quota_returns_429(self, _ask):
        for _ in range(DAILY_DEVICE_LIMIT):
            self.assertEqual(self._post("내일 약속", HTTP_X_DEVICE_ID="d").status_code, 200)
        response = self._post("내일 약속", HTTP_X_DEVICE_ID="d")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()["code"], "quota_exceeded")


class PlaceLookupRobustnessTests(TestCase):
    @patch("dust.services.places.NAVER_SEARCH_CLIENT_SECRET", "s")
    @patch("dust.services.places.NAVER_SEARCH_CLIENT_ID", "id")
    def test_odd_naver_bodies_do_not_raise(self):
        from unittest.mock import Mock

        from dust.services import places
        for body in ([], "str", None, {"items": "x"}, {"items": [None, 1, {"mapx": "1270000000", "mapy": "375000000", "title": "<b>강남</b>"}]}):
            with patch.object(places, "public_api_get", return_value=Mock(status_code=200, json=Mock(return_value=body))):
                items = places.search_naver_places("강남", 1)
            self.assertTrue(all(item["label"] == "강남" for item in items))

    def test_place_lookups_run_together_within_deadline(self):
        import time

        from dust.services import memo_events

        def slow(query, display=8, timeout=6):
            time.sleep(timeout)
            return []

        events = [{"place_text": f"장소{i}"} for i in range(10)]
        with patch.object(memo_events, "search_naver_places", side_effect=slow), patch.object(memo_events, "PLACE_LOOKUP_SECONDS", 0.3):
            started = time.monotonic()
            memo_events._attach_places(events)
        self.assertLess(time.monotonic() - started, 1.5)
        self.assertTrue(all(event["place"] is None for event in events))


@patch.dict(os.environ, {"APP_TEST_TOKEN": "", "LLM_PROVIDER": "gemini", "LLM_API_KEY": "test", "LLM_ENABLED": "true"})
class MemoSharedLimitTests(TestCase):
    URL = "/dust/calendar/memo-events/"

    def _post(self, device="d1"):
        return self.client.post(self.URL, data={"text": "내일 오전쯤 약속"}, content_type="application/json", HTTP_X_DEVICE_ID=device)

    def _device_count(self, device="d1"):
        from django.utils import timezone

        from dust.models import LlmDailyUsage
        from dust.services.memo_events import _digest
        row = LlmDailyUsage.objects.filter(day=timezone.localdate(), client_digest=_digest("device", device)).first()
        return row.count if row else 0

    @patch("dust.services.memo_events.requests.post")
    def test_google_rate_limit_is_busy_and_not_charged(self, post):
        from unittest.mock import Mock
        post.return_value = Mock(status_code=429)
        response = self._post()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "ai_busy")
        self.assertEqual(self._device_count(), 0)

    @patch("dust.services.memo_events._ask_gemini", side_effect=__import__("dust.services.memo_events", fromlist=["MemoFailed"]).MemoFailed("x"))
    def test_ai_failure_is_not_charged(self, _ask):
        self.assertEqual(self._post().status_code, 502)
        self.assertEqual(self._device_count(), 0)

    @patch.dict(os.environ, {"MEMO_GLOBAL_DAILY_LIMIT": "2"})
    @patch("dust.services.memo_events._ask_gemini", return_value={"events": []})
    def test_shared_daily_cap_stops_everyone(self, _ask):
        self.assertEqual(self._post("a").status_code, 200)
        self.assertEqual(self._post("b").status_code, 200)
        response = self._post("c")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["code"], "ai_busy")
        # 막힌 요청은 그 기기 횟수에 세지 않는다.
        self.assertEqual(self._device_count("c"), 0)


class MemoPrivacyTests(TestCase):
    def test_personal_info_is_removed_and_dates_times_survive(self):
        from dust.services.memo_privacy import mask_memo
        text = ("내일 3시 김민수 010-1234-5678 연락, 메일 a.b@test.co.kr, 주민 900101-1234567, 카드 1234 5678 9012 3456, "
                "계좌 110-123-456789, 101동 1203호, 여권 M12345678, 2026-10-25 15:00 2호선")
        masked, tokens = mask_memo(text)
        for leaked in ("010-1234-5678", "a.b@test.co.kr", "900101-1234567", "1234 5678 9012 3456", "110-123-456789", "1203호", "M12345678"):
            self.assertNotIn(leaked, masked)
        for kept in ("내일 3시", "2026-10-25 15:00", "2호선"):
            self.assertIn(kept, masked)
        self.assertEqual(tokens, {})

    def test_sensitive_words_round_trip(self):
        from dust.services.memo_privacy import mask_memo, unmask
        masked, tokens = mask_memo("내일 3시 강남 산부인과 진료, 금요일 정신건강의학과 상담센터")
        self.assertNotIn("산부인과", masked)
        self.assertNotIn("정신건강의학과", masked)
        self.assertEqual(unmask("⟦1⟧ 진료", tokens), "산부인과 진료")
        self.assertEqual(unmask("⟦9⟧ 진료", tokens), "진료")

    @patch.dict(os.environ, {"APP_TEST_TOKEN": "", "LLM_PROVIDER": "gemini", "LLM_API_KEY": "test", "LLM_ENABLED": "true"})
    @patch("dust.services.memo_events.search_naver_places", return_value=[])
    @patch("dust.services.memo_events._ask_gemini")
    def test_endpoint_sends_masked_text_and_restores_title(self, ask, _search):
        ask.return_value = {"events": [{"title": "⟦1⟧ 진료", "date": "2099-01-01", "time": "15:00", "end_date": "", "end_time": "", "place": "강남 ⟦1⟧", "activity_type": "indoor"}]}
        with patch("dust.services.memo_events.timezone.localtime", return_value=datetime(2098, 12, 31, 10, 0)):
            response = self.client.post("/dust/calendar/memo-events/", data={"text": "내일 오후쯤 강남 산부인과 진료 010-1234-5678"}, content_type="application/json")
        sent = ask.call_args.args[2]
        self.assertNotIn("산부인과", sent)
        self.assertNotIn("010-1234-5678", sent)
        event = response.json()["events"][0]
        self.assertEqual(event["title"], "산부인과 진료")
        self.assertEqual(event["place_text"], "강남 산부인과")


class MemoUnmaskLabelTests(TestCase):
    def test_copied_labels_are_dropped(self):
        from dust.services.memo_privacy import unmask
        self.assertEqual(unmask("상세주소 앞", {}), "")
        self.assertEqual(unmask("[전화번호]로 연락", {}), "로 연락")
        self.assertEqual(unmask("번호표 받기", {}), "번호표 받기")


class MemoQuickParseTests(TestCase):
    NOW = datetime(2026, 10, 25, 13, 0)  # 일요일 오후 1시

    def _parse(self, text):
        from dust.services.memo_quick import quick_parse
        result = quick_parse(text, self.NOW)
        return None if result is None else [(e["date"], e["time"], e["end_time"], e["title"], e["place"], e["activity_type"]) for e in result["events"]]

    def test_clear_memos_are_parsed_without_ai(self):
        self.assertEqual(self._parse("내일 3시에 강남역 친구 약속"), [("2026-10-26", "15:00", "", "친구 약속", "강남역", "indoor")])
        self.assertEqual(self._parse("토요일 오전 7시 한강공원 러닝"), [("2026-10-31", "07:00", "", "러닝", "한강공원", "outdoor")])
        self.assertEqual(self._parse("다음 주 월요일 2시~4시 회의"), [("2026-10-26", "14:00", "16:00", "회의", "", "indoor")])
        self.assertEqual(self._parse("28일 저녁 8시 회식"), [("2026-10-28", "20:00", "", "회식", "", "indoor")])
        self.assertEqual(self._parse("10/30 오후 2시 출장"), [("2026-10-30", "14:00", "", "출장", "", "transit")])
        self.assertEqual(self._parse("모레 12시 점심, 2시 카페 공부"), [("2026-10-27", "12:00", "", "점심", "", "indoor"), ("2026-10-27", "14:00", "", "공부", "카페", "indoor")])
        # 오늘(일요일) 이미 지난 시각의 '일요일'은 다음 주
        self.assertEqual(self._parse("일요일 오전 10시 교회")[0][0], "2026-11-01")

    def test_ambiguous_memos_go_to_ai(self):
        for text in ("토요일 7시 러닝", "내일 회의", "강남역에서 친구 만나기", "2월 30일 3시 회의", "내일 3시", "내일 오후쯤 약속"):
            self.assertIsNone(self._parse(text), text)

    @patch.dict(os.environ, {"APP_TEST_TOKEN": "", "LLM_PROVIDER": "", "LLM_API_KEY": ""})
    @patch("dust.services.memo_events.search_naver_places", return_value=[])
    @patch("dust.services.memo_events._ask_gemini")
    def test_quick_path_needs_no_ai_and_no_quota(self, ask, _search):
        from dust.models import LlmDailyUsage
        with patch("dust.services.memo_events.timezone.localtime", return_value=self.NOW):
            response = self.client.post("/dust/calendar/memo-events/", data={"text": "내일 3시 친구 약속"}, content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["events"][0]["title"], "친구 약속")
        ask.assert_not_called()
        self.assertFalse(LlmDailyUsage.objects.exists())


class MemoRepeatGuardTests(TestCase):
    def test_repeat_memo_is_rejected_before_ai(self):
        from dust.services.memo_events import MemoInputError, events_from_memo
        for text in ("매주 월요일 9시 회의", "월요일마다 요가", "주 3회 헬스"):
            with self.assertRaises(MemoInputError):
                events_from_memo(text)


class MemoRound2RegressionTests(TestCase):
    def test_time_before_phone_is_kept(self):
        from dust.services.memo_privacy import mask_memo
        masked, _ = mask_memo("2026-10-25 15:00 010-1234-5678 연락, 계좌 3333-01-1234567")
        self.assertIn("15:00", masked)
        self.assertNotIn("1234-5678", masked)
        self.assertNotIn("1234567", masked)

    def test_event_at_2359_ends_after_it_starts(self):
        events = __import__("dust.services.memo_events", fromlist=["clean_events"]).clean_events(
            {"events": [{"title": "야식", "date": "2026-10-26", "time": "23:59", "end_date": "", "end_time": "", "place": "", "activity_type": "indoor"}]},
            date(2026, 10, 25),
        )
        self.assertEqual((events[0]["end_date"], events[0]["end_time"]), ("2026-10-27", "00:59"))

    def test_quick_parse_leaves_ambiguous_past_times_to_ai(self):
        from dust.services.memo_quick import quick_parse
        now = datetime(2026, 10, 25, 13, 0)
        self.assertIsNone(quick_parse("25일 오전 7시 회의", now))
        self.assertIsNone(quick_parse("오늘 오후 3시 회의, 오전 7시 약속", now))
        self.assertIsNotNone(quick_parse("오늘 오전 7시 회의", now))  # '오늘'이라고 분명히 쓴 경우는 그대로
