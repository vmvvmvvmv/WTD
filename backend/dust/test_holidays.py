import os
from datetime import date
from unittest.mock import Mock, patch

from django.test import TestCase

from dust.models import PublicHoliday
from dust.services.holidays import parse_holiday_items, refresh_holidays


def _payload(items, code="00"):
    return {"response": {"header": {"resultCode": code}, "body": {"items": {"item": items} if items is not None else ""}}}


class HolidayTests(TestCase):
    def test_parse_handles_single_item_non_holidays_and_same_day(self):
        self.assertEqual(parse_holiday_items(_payload({"dateName": "한글날", "isHoliday": "Y", "locdate": 20261009})), {date(2026, 10, 9): "한글날"})
        parsed = parse_holiday_items(_payload([
            {"dateName": "추석", "isHoliday": "Y", "locdate": 20281003},
            {"dateName": "개천절", "isHoliday": "Y", "locdate": 20281003},
            {"dateName": "기념일", "isHoliday": "N", "locdate": 20281004},
        ]))
        self.assertEqual(parsed, {date(2028, 10, 3): "추석·개천절"})
        self.assertEqual(parse_holiday_items(_payload(None)), {})

    @patch("dust.services.holidays.public_api_get")
    def test_refresh_replaces_year_but_keeps_rows_when_not_published(self, api_get):
        PublicHoliday.objects.create(date=date(2026, 1, 1), name="옛 이름")
        api_get.return_value = Mock(json=Mock(return_value=_payload([{"dateName": "1월1일", "isHoliday": "Y", "locdate": 20260101}])))
        self.assertEqual(refresh_holidays(2026), 1)
        self.assertEqual(PublicHoliday.objects.get(date=date(2026, 1, 1)).name, "1월1일")
        api_get.return_value = Mock(json=Mock(return_value=_payload(None)))
        self.assertEqual(refresh_holidays(2026), 0)
        self.assertEqual(PublicHoliday.objects.count(), 1)

    @patch.dict(os.environ, {"APP_TEST_TOKEN": ""})
    def test_endpoint_returns_stored_year_and_rejects_bad_year(self):
        PublicHoliday.objects.create(date=date(2026, 10, 9), name="한글날")
        PublicHoliday.objects.create(date=date(2027, 1, 1), name="1월1일")
        response = self.client.get("/dust/calendar/holidays/", {"year": 2026})
        self.assertEqual(response.json(), {"year": 2026, "items": [{"date": "2026-10-09", "name": "한글날"}]})
        self.assertEqual(self.client.get("/dust/calendar/holidays/", {"year": "abc"}).status_code, 400)
