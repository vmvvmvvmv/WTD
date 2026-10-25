"""빈 미세먼지 기록 채우기: 서버가 멈췄던 시간의 매시 기록을 에어코리아 측정소별 API로 다시 받는다.

- 최근 24시간 중, 기록이 있는 측정소가 전체의 90%에 못 미치는 시각을 '수집이 빠진 시각'으로 본다.
  (평소 고장 난 측정소 몇 곳 때문에 매번 호출하지 않도록, 여러 측정소가 함께 빈 시각만 채운다.)
- 그 시각이 비어 있는 측정소를 알림 받는 지역 측정소부터 회차마다 limit곳씩 채운다. 나머지는 다음 수집 때 이어 간다.
- 이미 있는 기록은 덮어쓰지 않고 빈칸만 만든다. 빈 시각이 없으면 API를 한 번도 부르지 않는다.
"""
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from dust.config import STATION_HOURLY_DUST_URL
from dust.models import AirQualityStation, NotificationDevice, RealtimeDustMeasurement
from dust.services.airkorea_client import _airkorea_service_keys, _parse_airkorea_datetime, _request_items
from dust.services.common import _first_valid_value, _to_float
from dust.services.stations import _find_air_quality_station, _resolve_station_name

BACKFILL_HOURS = 24
GAP_RATIO = 0.9


def find_gap_hours(now=None):
    """최근 24시간 중 수집이 빠진 정시 목록(오래된 것부터)."""
    now = now or timezone.now()
    active = AirQualityStation.objects.filter(is_active=True).count()
    if not active:
        return []
    start = (now - timedelta(hours=BACKFILL_HOURS)).replace(minute=0, second=0, microsecond=0)
    counts = dict(
        RealtimeDustMeasurement.objects.filter(measured_at__gte=start, station__is_active=True)
        .values('measured_at').annotate(n=Count('id')).values_list('measured_at', 'n')
    )
    if not counts:
        return []
    # 가장 최근에 모은 시각까지만 본다(지금 시각은 에어코리아가 아직 채우는 중일 수 있음).
    hours = []
    hour = start
    while hour <= max(counts):
        if counts.get(hour, 0) < active * GAP_RATIO:
            hours.append(hour)
        hour += timedelta(hours=1)
    return hours


def _priority_station_ids():
    """알림을 받는 기기의 지역 측정소(먼저 채운다)."""
    ids = set()
    for city, region in NotificationDevice.objects.filter(enabled=True).values_list('city', 'region').distinct():
        station = _find_air_quality_station(city, _resolve_station_name(city, region))
        if station:
            ids.add(station.id)
    return ids


def _hourly_rows_for_station(station):
    params = [
        ("serviceKey/json/ver1.3", {"serviceKey": key, "returnType": "json", "numOfRows": "100", "pageNo": "1", "stationName": station.name, "dataTerm": "DAILY", "ver": "1.3"})
        for key in _airkorea_service_keys()
    ]
    items, _debug = _request_items(STATION_HOURLY_DUST_URL, params, {"station": station.name})
    return items


def backfill_missing_dust(limit=100, now=None):
    """빈 기록을 채우고 (채운 측정소 수, 만든 기록 수, 남은 측정소 수)를 돌려준다."""
    gaps = find_gap_hours(now)
    if not gaps:
        return 0, 0, 0
    gap_set = set(gaps)
    existing = set(
        RealtimeDustMeasurement.objects.filter(measured_at__in=gaps).values_list('station_id', 'measured_at')
    )
    stations = [
        station for station in AirQualityStation.objects.filter(is_active=True)
        if any((station.id, hour) not in existing for hour in gaps)
    ]
    priority = _priority_station_ids()
    stations.sort(key=lambda station: station.id not in priority)
    filled_stations = created = 0
    # ponytail: 채운 값에는 '주변 측정소보다 혼자 튄 값' 걸러내기를 적용하지 않는다(시각마다 주변 값이 아직 다 없음). 문제가 되면 채운 뒤 시각별로 다시 거른다.
    for station in stations[:limit]:
        made = 0
        for item in _hourly_rows_for_station(station):
            measured_at = _parse_airkorea_datetime(item.get('dataTime'))
            if measured_at not in gap_set or (station.id, measured_at) in existing:
                continue
            pm10 = None if item.get('pm10Flag') else item.get('pm10Value')
            pm25 = None if item.get('pm25Flag') else item.get('pm25Value')
            _, was_created = RealtimeDustMeasurement.objects.get_or_create(
                station=station,
                measured_at=measured_at,
                defaults={
                    "pm10_value": _to_float(pm10),
                    "pm25_value": _to_float(pm25),
                    "o3_value": _to_float(item.get('o3Value')),
                    "no2_value": _to_float(item.get('no2Value')),
                    "aqi_value": _to_float(_first_valid_value(item.get('khaiValue'), item.get('pm10Value'), item.get('pm25Value'))),
                    "raw_data": {**item, "source": "backfill"},
                },
            )
            made += int(was_created)
        filled_stations += 1
        created += made
    return filled_stations, created, max(0, len(stations) - limit)
