"""대한민국 공휴일: 천문연구원 특일 정보 API에서 한 해치를 받아 DB에 저장한다.

화면 API는 DB만 읽는다. 임시공휴일은 발표가 늦게 나므로 매일 아침 올해·내년을 다시 받는다.
"""
from datetime import date

from django.db import transaction

from dust.config import HOLIDAY_API_URL, HOLIDAY_SERVICE_KEY
from dust.external_api import public_api_get
from dust.models import PublicHoliday


class HolidayFetchFailed(Exception):
    pass


def parse_holiday_items(payload):
    """API 응답 → {날짜: 이름}. 한 건이면 item이 dict로 오고, 같은 날 공휴일이 겹치면 이름을 잇는다."""
    items = ((payload or {}).get("response", {}).get("body", {}) or {}).get("items") or {}
    rows = items.get("item") if isinstance(items, dict) else None
    if isinstance(rows, dict):
        rows = [rows]
    holidays = {}
    for row in rows or []:
        if row.get("isHoliday") != "Y":
            continue
        raw = str(row.get("locdate") or "")
        name = str(row.get("dateName") or "").strip()
        if len(raw) != 8 or not name:
            continue
        day = date(int(raw[:4]), int(raw[4:6]), int(raw[6:]))
        holidays[day] = f"{holidays[day]}·{name}" if day in holidays and name not in holidays[day] else name
    return holidays


def refresh_holidays(year):
    """그해 공휴일을 새로 받아 바꿔 넣는다. 아직 발표 전이라 비어 있으면 저장된 값을 지우지 않는다."""
    response = public_api_get(HOLIDAY_API_URL, params={
        "ServiceKey": HOLIDAY_SERVICE_KEY,
        "solYear": str(year),
        "numOfRows": "100",
        "_type": "json",
    })
    response.raise_for_status()
    payload = response.json()
    code = (payload.get("response", {}).get("header", {}) or {}).get("resultCode")
    if code != "00":
        raise HolidayFetchFailed(f"{year} 공휴일 응답 코드 {code}")
    holidays = parse_holiday_items(payload)
    if not holidays:
        return 0
    with transaction.atomic():
        PublicHoliday.objects.filter(date__year=year).delete()
        PublicHoliday.objects.bulk_create(PublicHoliday(date=day, name=name) for day, name in sorted(holidays.items()))
    return len(holidays)


def holidays_for_year(year):
    return [
        {"date": day.isoformat(), "name": name}
        for day, name in PublicHoliday.objects.filter(date__year=year).order_by("date").values_list("date", "name")
    ]
