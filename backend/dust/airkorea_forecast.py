"""에어코리아 미세먼지 예보(내일·모레 등급)를 앱의 예측 응답 형식으로 변환한다."""
import logging
from datetime import timedelta

import requests
from django.core.cache import cache
from django.utils import timezone

from .current_dust_service import canonical_sido_name


logger = logging.getLogger(__name__)
FORECAST_URL = "http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMinuDustFrcstDspth"
CACHE_TTL = 60 * 60
FAILURE_CACHE_TTL = 5 * 60
REQUEST_TIMEOUT = 10

# 예보는 등급만 주므로, 앱의 PM10 기준(30/80/150 초과)에서 같은 등급으로 판정되는 대표값을 쓴다.
GRADE_PM10 = {"좋음": 15, "보통": 55, "나쁨": 115, "매우나쁨": 180}
# 예보 권역이 나뉜 시도는 더 나쁜 권역 등급을 따른다.
SPLIT_REGIONS = {"경기": ("경기남부", "경기북부"), "강원": ("영서", "영동")}


def parse_grades(inform_grade):
    grades = {}
    for part in (inform_grade or "").split(","):
        name, _, grade = part.partition(":")
        if name.strip() and grade.strip() in GRADE_PM10:
            grades[name.strip()] = grade.strip()
    return grades


def latest_pm10_grades_by_date(items):
    """발표 시각이 가장 늦은 PM10 예보만 날짜별로 남긴다."""
    latest = {}
    for item in items:
        if item.get("informCode") != "PM10" or not item.get("informData"):
            continue
        date, announced = item["informData"], item.get("dataTime") or ""
        if date not in latest or announced > latest[date][0]:
            latest[date] = (announced, parse_grades(item.get("informGrade")))
    return latest


def grade_for_city(grades, city):
    sido = canonical_sido_name(city)
    names = SPLIT_REGIONS.get(sido, (sido,))
    found = [grades[name] for name in names if name in grades]
    return max(found, key=GRADE_PM10.get) if found else None


def _fetch_items(service_key, search_date):
    response = requests.get(
        FORECAST_URL,
        params={
            "serviceKey": service_key,
            "returnType": "json",
            "numOfRows": 100,
            "pageNo": 1,
            "searchDate": search_date,
            "InformCode": "PM10",
        },
        timeout=REQUEST_TIMEOUT,
    )
    response.raise_for_status()
    return ((response.json().get("response") or {}).get("body") or {}).get("items") or []


def load_national_forecast(service_key):
    """오늘 발표분(없으면 어제 발표분)을 날짜별 등급으로 캐시한다. 실패 시 None."""
    today = timezone.localdate()
    cache_key = f"airkorea_pm10_forecast_v1_{today.isoformat()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None
    forecast = {}
    try:
        for search_date in (today, today - timedelta(days=1)):
            forecast = latest_pm10_grades_by_date(_fetch_items(service_key, search_date.isoformat()))
            if forecast:
                break
    except (requests.RequestException, ValueError):
        # 예외 문자열에는 serviceKey가 들어간 URL이 포함될 수 있어 남기지 않는다.
        logger.warning("AirKorea forecast request failed for %s", today)
    # 실패도 잠깐 캐시해 API 장애 때 모든 요청이 타임아웃까지 기다리지 않게 한다.
    cache.set(cache_key, forecast, CACHE_TTL if forecast else FAILURE_CACHE_TTL)
    return forecast or None


def build_forecast_prediction(service_key, city, days=2):
    """predict_dust 응답의 지역 단위 본문을 만든다."""
    today = timezone.localdate()
    dates = [(today + timedelta(days=offset)).isoformat() for offset in range(1, days + 1)]
    forecast = load_national_forecast(service_key) if service_key else None
    future_dates, predictions, grades = [], [], []
    announced_at = None
    for date in dates:
        announced, date_grades = (forecast or {}).get(date, (None, {}))
        grade = grade_for_city(date_grades, city)
        if grade is None:
            continue
        future_dates.append(date)
        predictions.append(GRADE_PM10[grade])
        grades.append(grade)
        announced_at = announced_at or announced
    return {
        "future_dates": future_dates,
        "predictions": predictions,
        "grades": grades,
        "model": {
            "method": "airkorea_forecast_grade",
            "available": bool(predictions),
            "announced_at": announced_at,
            "note": "에어코리아 예보 등급을 등급별 대표 PM10 값으로 변환했습니다.",
        },
    }
