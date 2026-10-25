"""측정소 찾기, 측정소 목록·실시간 미세먼지의 DB 저장과 조회(캐시 포함).

에어코리아 API 호출·해석은 airkorea_client, 튄 값 걸러내기 규칙은 dust_quality에 있다."""
from concurrent.futures import as_completed, ThreadPoolExecutor
from datetime import timedelta
from django.core.cache import cache
from django.utils import timezone
from dust.config import AIRKOREA_REQUEST_WORKERS, SIDO_NAMES, STATION_MAPPING
from dust.current_dust_service import canonical_sido_name, has_usable_realtime_values as _has_usable_realtime_values
from dust.models import AirQualityStation, DustMeasurement, RealtimeDustMeasurement
from dust.services.airkorea_client import _clean_station_name, _fetch_realtime_station_values_for_sido, _fetch_station_locations_for_sido, _parse_airkorea_datetime
from dust.services.common import _haversine_km, _to_float
from dust.services.dust_quality import (
    NEIGHBOR_SPIKE_RULES,
    _is_single_sample_spike,
    _neighbor_spike_fields,
    _previous_measurement,
    _restore_cleared_previous,
    _sustained_high_fields,
)


def _station_lookup_name(value):
    return _clean_station_name(value).replace(' ', '')


def _region_lookup_tokens(region):
    compact = _station_lookup_name(region)
    tokens = [compact]
    for suffix in ('특별시', '광역시', '특별자치시', '특별자치도', '자치도', '시', '군', '구', '읍', '면', '동'):
        if compact.endswith(suffix) and len(compact) > len(suffix):
            tokens.append(compact[:-len(suffix)])
    return [token for index, token in enumerate(tokens) if token and token not in tokens[:index]]


def _candidate_stations_for_region(city, region):
    city = canonical_sido_name(city)
    mapping_name = STATION_MAPPING.get(city, {}).get(region)
    candidates = []
    if mapping_name:
        candidates.extend(AirQualityStation.objects.filter(sido=city, name=mapping_name, is_active=True))

    tokens = _region_lookup_tokens(region)
    stations = AirQualityStation.objects.filter(sido=city, is_active=True)
    for station in stations:
        lookup_name = _station_lookup_name(station.name)
        lookup_addr = _station_lookup_name(station.addr)
        compact_region = _station_lookup_name(region)
        station_name_in_region = len(lookup_name) >= 2 and lookup_name in compact_region
        if lookup_name == compact_region or station_name_in_region or any(token in lookup_name or token in lookup_addr for token in tokens):
            candidates.append(station)

    unique = {}
    for station in candidates:
        unique[station.id] = station
    # 지역 이름 안에 이름이 들어 있는 측정소 중 가장 긴(구체적인) 것을 앞에 둔다.
    # 예: '공주시 탄천면' → '공주'보다 '탄천면'. 지정 매핑은 그대로 맨 앞에 둔다.
    compact_region = _station_lookup_name(region)

    def specificity(station):
        if mapping_name and station.name == mapping_name:
            return (2, 0)
        lookup_name = _station_lookup_name(station.name)
        return (1, len(lookup_name)) if lookup_name and lookup_name in compact_region else (0, 0)

    return sorted(unique.values(), key=specificity, reverse=True)


def _resolve_station_name(city, region):
    city = canonical_sido_name(city)
    mapped = STATION_MAPPING.get(city, {}).get(region)
    if mapped:
        return mapped
    candidates = _candidate_stations_for_region(city, region)
    return candidates[0].name if candidates else region



def _load_station_locations(allow_api=False):
    cache_key = 'airkorea_station_locations_v6'
    cached = cache.get(cache_key)
    if cached:
        return cached, [{"cached": True, "count": len(cached)}]

    db_stations = _load_station_locations_from_db()
    if db_stations:
        cache.set(cache_key, db_stations, 60 * 60)
        return db_stations, [{"source": "db", "count": len(db_stations)}]

    if not allow_api:
        return {}, [{"source": "db", "count": 0, "message": "No station rows in DB."}]

    stations = {}
    debug = []
    with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
        futures = [executor.submit(_fetch_station_locations_for_sido, sido) for sido in SIDO_NAMES]
        for future in as_completed(futures):
            sido_stations, sido_debug = future.result()
            stations.update(sido_stations)
            debug.extend(sido_debug)

    if stations:
        _store_station_locations_to_db(stations)
        cache.set(cache_key, stations, 60 * 60 * 24)
    return stations, debug


def _load_station_locations_from_db():
    stations = {}
    for station in AirQualityStation.objects.filter(is_active=True):
        stations[f'{station.sido}:{station.name}'] = {
            "name": station.name,
            "sido": station.sido,
            "addr": station.addr,
            "lat": station.lat,
            "lng": station.lng,
        }
    return stations


def _store_station_locations_to_db(stations):
    for location in stations.values():
        AirQualityStation.objects.update_or_create(
            sido=location["sido"],
            name=location["name"],
            defaults={
                "addr": location.get("addr") or "",
                "lat": location["lat"],
                "lng": location["lng"],
                "is_active": True,
                "raw_data": location,
            },
        )



DUST_CACHE_VERSION_KEY = 'dust_data_version'


def dust_cache_version():
    """측정값 캐시 버전. 함수 처음에 한 번 읽어 키에 넣으면, 읽는 사이 수집이 끝나 버전이 올라도
    늦게 넣은 옛 결과는 옛 버전 키에 들어가 아무도 읽지 않는다(지운 뒤 다시 채워지는 경쟁을 막는다)."""
    return cache.get_or_set(DUST_CACHE_VERSION_KEY, 1, None)


def bump_dust_cache_version():
    try:
        cache.incr(DUST_CACHE_VERSION_KEY)
    except ValueError:
        cache.set(DUST_CACHE_VERSION_KEY, 2, None)


def _load_realtime_station_values(with_debug=False, allow_api=False):
    cache_key = f'airkorea_realtime_station_values_v5:{dust_cache_version()}'
    cached = cache.get(cache_key)
    if cached:
        if with_debug:
            return cached, [{"cached": True, "count": len(cached)}]
        return cached

    db_values = _load_latest_realtime_values_from_db()
    if db_values:
        cache.set(cache_key, db_values, 60 * 10)
        if with_debug:
            return db_values, [{"source": "db", "count": len(db_values)}]
        return db_values

    if not allow_api:
        if with_debug:
            return {}, [{"source": "db", "count": 0, "message": "No recent realtime rows in DB."}]
        return {}

    values = {}
    debug = []
    with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
        futures = [executor.submit(_fetch_realtime_station_values_for_sido, sido) for sido in SIDO_NAMES]
        for future in as_completed(futures):
            sido_values, sido_debug = future.result()
            values.update(sido_values)
            debug.extend(sido_debug)

    if values:
        cache.set(cache_key, values, 60 * 10)
    if with_debug:
        return values, debug
    return values


def _sidos_with_realtime_spikes(values):
    rules = {
        "pm10": {"min_value": 120, "min_delta": 70, "ratio": 2.5},
        "pm25": {"min_value": 70, "min_delta": 35, "ratio": 2.5},
    }
    spike_sidos = set()
    for value in values.values():
        station = _find_station_for_realtime_value(value)
        if not station:
            continue
        history = list(
            RealtimeDustMeasurement.objects
            .filter(station=station)
            .order_by('-measured_at')
            .values('pm10_value', 'pm25_value')[:4]
        )
        if len(history) < 3:
            continue
        checks = {
            "pm10": [_to_float(row.get('pm10_value')) for row in history],
            "pm25": [_to_float(row.get('pm25_value')) for row in history],
        }
        if any(_is_single_sample_spike(_to_float(value.get(field)), checks[field], rule) for field, rule in rules.items()):
            spike_sidos.add(station.sido)
    return sorted(spike_sidos)


def _load_latest_realtime_values_from_db(max_age_hours=24):
    cutoff = timezone.now() - timedelta(hours=max_age_hours)
    measurements = (
        RealtimeDustMeasurement.objects
        .select_related('station')
        .filter(measured_at__gte=cutoff, station__is_active=True)
        .order_by('station_id', '-measured_at')
    )
    values = {}
    for measurement in measurements:
        station = measurement.station
        key = f'{station.sido}:{station.name}'
        existing = values.get(key)
        if not existing:
            existing = {
                "name": station.name,
                "sido": station.sido,
                "aqi": None,
                "pm10": None,
                "pm25": None,
                "no2": None,
                "o3": None,
                "temp": "-",
                "humidity": "-",
                "time": timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M'),
                "pm10_time": None,
                "pm25_time": None,
                "no2_time": None,
                "o3_time": None,
                "source": "stored_realtime",
            }
            values[key] = existing

        if existing["aqi"] is None and measurement.aqi_value is not None:
            existing["aqi"] = measurement.aqi_value
        # 최근 행부터 보면서, 항목마다 비어 있지 않은 가장 최근 값과 그 시각을 쓴다.
        for field in ("pm10", "pm25", "no2", "o3"):
            value = getattr(measurement, f"{field}_value")
            if existing[field] is None and value is not None:
                existing[field] = value
                existing[f"{field}_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
    # 튄 값은 저장할 때 걸러진다(_neighbor_spike_fields). 여기서 측정된 적 없는 값으로 바꾸지 않는다.
    return values


def _find_station_for_realtime_value(value):
    sido = value.get("sido")
    name = _clean_station_name(value.get("name"))
    if not sido or not name:
        return None

    station = _find_air_quality_station(sido, name)
    if station:
        return station
    return None


def _find_air_quality_station(sido, station_name):
    if not sido or not station_name:
        return None

    station = AirQualityStation.objects.filter(sido=sido, name=station_name, is_active=True).first()
    if station:
        return station

    lookup_name = _station_lookup_name(station_name)
    for station in AirQualityStation.objects.filter(sido=sido, is_active=True):
        if _station_lookup_name(station.name) == lookup_name:
            return station
    return None


def _store_realtime_values_to_db(values):
    saved = 0
    resolved = [(value, station) for value in values.values() for station in [_find_station_for_realtime_value(value)] if station]
    # 같은 수집 회차의 주변 측정소보다 혼자 튄 값은 비워서 저장한다. 원래 값은 raw_data에 남는다.
    for (value, station), fields in zip(resolved, _neighbor_spike_fields([(station.lat, station.lng, value) for value, station in resolved])):
        is_high = any((_to_float(value.get(field)) or 0) >= rule["min_value"] for field, rule in NEIGHBOR_SPIKE_RULES.items())
        previous = _previous_measurement(station, value) if is_high else None
        if fields:
            fields = fields - _sustained_high_fields(previous)
        for field in fields:
            value[f"raw{field.upper()}"] = value.get(field)
            value[field] = None
            value["qualityNote"] = "neighbor_spike_removed"
        if fields:
            # 통합대기지수도 튄 값으로 계산돼 있어 비우고, 복원할 수 있게 원래 값은 남긴다.
            value["rawAQI"] = value.get("aqi")
            value["aqi"] = None
        _restore_cleared_previous(previous, value)
    for value, station in resolved:
        measured_at = _parse_airkorea_datetime(value.get("time")) or timezone.now().replace(minute=0, second=0, microsecond=0)
        _, created = RealtimeDustMeasurement.objects.update_or_create(
            station=station,
            measured_at=measured_at,
            defaults={
                "pm10_value": _to_float(value.get("pm10")),
                "pm25_value": _to_float(value.get("pm25")),
                "o3_value": _to_float(value.get("o3")),
                "no2_value": _to_float(value.get("no2")),
                "aqi_value": _to_float(value.get("aqi")),
                "raw_data": value,
            },
        )
        if created:
            saved += 1
    return saved


def _load_latest_daily_station_values():
    cache_key = f'latest_daily_station_values_v1:{dust_cache_version()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    values = {}
    rows = (
        DustMeasurement.objects
        .exclude(station_name__isnull=True)
        .exclude(station_name='')
        .order_by('-measured_date', '-updated_at')
        .values(
            'city',
            'region',
            'station_name',
            'measured_date',
            'pm10_value',
            'pm25_value',
            'o3_value',
            'no2_value',
        )
    )
    for row in rows:
        city = row.get('city') or ''
        names = [
            row.get('station_name') or '',
            row.get('region') or '',
        ]
        for name in names:
            lookup_name = _station_lookup_name(name)
            if not city or not lookup_name:
                continue
            key = f'{city}:{lookup_name}'
            if key in values:
                continue
            measured_date = row.get('measured_date')
            measured_label = measured_date.isoformat() if measured_date else ''
            values[key] = {
                "name": name,
                "sido": city,
                "aqi": row.get('pm10_value'),
                "pm10": row.get('pm10_value'),
                "pm25": row.get('pm25_value'),
                "no2": row.get('no2_value'),
                "o3": row.get('o3_value'),
                "temp": "-",
                "humidity": "-",
                "time": f"{measured_label} 일평균" if measured_label else "최신 일평균",
                "source": "stored_daily_latest",
            }

    cache.set(cache_key, values, 60 * 10)
    return values


def _find_current_realtime_value(city, region, station_name, realtime_values):
    lookup_station = _station_lookup_name(station_name)
    current = realtime_values.get(f'{city}:{station_name}')
    if current and _has_usable_realtime_values(current):
        return current

    for value in realtime_values.values():
        if value.get("sido") == city and _station_lookup_name(value.get("name")) == lookup_station and _has_usable_realtime_values(value):
            return value

    candidate_names = {_station_lookup_name(station.name) for station in _candidate_stations_for_region(city, region)}
    for value in realtime_values.values():
        if value.get("sido") == city and _station_lookup_name(value.get("name")) in candidate_names and _has_usable_realtime_values(value):
            return value
    return None


def _current_station_location(sido, station_name):
    try:
        station_locations, _ = _load_station_locations()
    except Exception:
        return None

    current = station_locations.get(f'{sido}:{station_name}')
    if current:
        return current

    lookup_station = _station_lookup_name(station_name)
    return next((
        location for location in station_locations.values()
        if location.get("sido") == sido and _station_lookup_name(location.get("name")) == lookup_station
    ), None)


def _nearest_station_locations(sido, station_name, limit=3):
    current = _current_station_location(sido, station_name)
    if not current:
        return []

    try:
        station_locations, _ = _load_station_locations()
    except Exception:
        return []

    nearby = []
    for location in station_locations.values():
        if location.get("name") == current.get("name") and location.get("sido") == current.get("sido"):
            continue
        distance = _haversine_km(current["lat"], current["lng"], location["lat"], location["lng"])
        nearby.append({**location, "distance_km": round(distance, 1)})

    nearby.sort(key=lambda item: item["distance_km"])
    return nearby[:limit]
