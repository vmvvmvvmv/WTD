"""측정소 찾기와 AirKorea 실시간 미세먼지 수집·저장·조회."""
import xml.etree.ElementTree as ET
from concurrent.futures import as_completed, ThreadPoolExecutor
from datetime import datetime, timedelta
from django.core.cache import cache
from django.utils import timezone
from dust.config import AIRKOREA_REQUEST_WORKERS, AIRKOREA_SERVICE_KEY, API_KEY, REALTIME_DUST_URL, SIDO_NAMES, SIDO_STATION_ADDR_ALIASES, STATION_INFO_URL, STATION_MAPPING
from dust.current_dust_service import canonical_sido_name, has_usable_realtime_values as _has_usable_realtime_values
from dust.external_api import public_api_get
from dust.models import AirQualityStation, DustMeasurement, RealtimeDustMeasurement
from dust.services.common import _first_valid_value, _haversine_km, _median, _to_float


def _clean_station_name(value):
    return (value or '').strip()


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
    return list(unique.values())


def _resolve_station_name(city, region):
    city = canonical_sido_name(city)
    mapped = STATION_MAPPING.get(city, {}).get(region)
    if mapped:
        return mapped
    candidates = _candidate_stations_for_region(city, region)
    return candidates[0].name if candidates else region


def _normalize_wgs84_coordinates(dm_x, dm_y):
    x = _to_float(dm_x)
    y = _to_float(dm_y)
    if x is None or y is None:
        return None, None

    if abs(x) > 90 and abs(y) <= 90:
        return y, x
    return x, y


def _extract_airkorea_items(data):
    items = data.get("response", {}).get("body", {}).get("items", [])
    if isinstance(items, dict):
        items = items.get("item", [])
    return items if isinstance(items, list) else []


def _airkorea_result(data):
    header = data.get("response", {}).get("header", {})
    return {
        "resultCode": header.get("resultCode"),
        "resultMsg": header.get("resultMsg"),
    }


def _parse_airkorea_response(response):
    try:
        data = response.json()
        return _extract_airkorea_items(data), _airkorea_result(data), None
    except ValueError:
        pass

    text = response.text.strip()
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return [], {}, text[:120]

    result = {
        "resultCode": root.findtext(".//resultCode"),
        "resultMsg": root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg"),
    }
    items = []
    for item in root.findall(".//item"):
        items.append({child.tag: child.text for child in item})

    return items, result, None


def _station_request_variants(addr):
    key_variants = []
    for key in (AIRKOREA_SERVICE_KEY, API_KEY):
        if key and key not in key_variants:
            key_variants.append(key)

    base_params = {
        "returnType": "json",
        "numOfRows": "1000",
        "pageNo": "1",
        "addr": addr,
    }
    variants = []
    for key in key_variants:
        variants.append({
            "label": "serviceKey/json/ver1.1",
            "params": {**base_params, "serviceKey": key, "stationName": "", "ver": "1.1"},
        })
    return variants


def _fetch_station_locations_for_sido(sido):
    stations = {}
    debug = []
    found_for_sido = False
    for addr in SIDO_STATION_ADDR_ALIASES.get(sido, [sido]):
        items = []
        for variant in _station_request_variants(addr):
            raw_error = None
            try:
                response = public_api_get(STATION_INFO_URL, params=variant["params"])
                items, result, raw_error = _parse_airkorea_response(response)
                debug.append({
                    "sido": sido,
                    "addr": addr,
                    "variant": variant["label"],
                    "status": response.status_code,
                    "items": len(items),
                    **({"raw_error": raw_error} if raw_error else {}),
                    **result,
                })
            except Exception as exc:
                items = []
                debug.append({
                    "sido": sido,
                    "addr": addr,
                    "variant": variant["label"],
                    "status": "request_failed",
                    "items": 0,
                    "error": str(exc)[:120],
                })

            if items:
                break
            if raw_error and "quota exceeded" in raw_error.lower():
                break

        for item in items:
            name = _clean_station_name(item.get('stationName'))
            lat, lng = _normalize_wgs84_coordinates(item.get('dmX'), item.get('dmY'))
            if not name or lat is None or lng is None:
                continue
            stations[f'{sido}:{name}'] = {
                "name": name,
                "sido": sido,
                "addr": item.get('addr') or '',
                "lat": lat,
                "lng": lng,
            }

        if items:
            found_for_sido = True
            break

    if not found_for_sido:
        debug.append({"sido": sido, "items": 0, "message": "No station location rows returned for this sido."})
    return stations, debug


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


def _fetch_realtime_station_values_for_sido(sido):
    key_variants = []
    for key in (AIRKOREA_SERVICE_KEY, API_KEY):
        if key and key not in key_variants:
            key_variants.append(key)

    request_variants = []
    for key in key_variants:
        request_variants.append(("serviceKey/json/ver1.0", {
            "serviceKey": key,
            "returnType": "json",
            "numOfRows": "1000",
            "pageNo": "1",
            "sidoName": sido,
            "ver": "1.0",
        }))

    active_stations = list(AirQualityStation.objects.filter(is_active=True))
    items = []
    debug = []
    if not request_variants:
        debug.append({"sido": sido, "items": 0, "error": "AirKorea service key is not configured."})
    for label, params in request_variants:
        raw_error = None
        try:
            response = public_api_get(REALTIME_DUST_URL, params=params)
            items, result, raw_error = _parse_airkorea_response(response)
            debug.append({
                "sido": sido,
                "variant": label,
                "status": response.status_code,
                "items": len(items),
                **({"raw_error": raw_error} if raw_error else {}),
                **result,
            })
        except Exception as exc:
            items = []
            debug.append({
                "sido": sido,
                "variant": label,
                "status": "request_failed",
                "items": 0,
                "error": str(exc)[:120],
            })
        if items:
            break
        if raw_error and "quota exceeded" in raw_error.lower():
            break

    values = {}
    for item in items:
        name = _clean_station_name(item.get('stationName'))
        if not name:
            continue
        aqi = _first_valid_value(item.get('khaiValue'), item.get('pm10Value'), item.get('pm25Value'))
        values[f'{sido}:{name}'] = {
            "name": name,
            "sido": sido,
            "aqi": aqi,
            "pm10": item.get('pm10Value'),
            "pm25": item.get('pm25Value'),
            "no2": item.get('no2Value'),
            "o3": item.get('o3Value'),
            "temp": '-',
            "humidity": '-',
            "time": item.get('dataTime') or '',
        }
    return values, debug


def _load_realtime_station_values(with_debug=False, allow_api=False):
    cache_key = 'airkorea_realtime_station_values_v5'
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


def _parse_airkorea_datetime(value):
    if not value:
        return None
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text)
        if timezone.is_naive(parsed):
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        return parsed
    except ValueError:
        pass
    for fmt in ('%Y-%m-%d %H:%M', '%Y-%m-%d %H:%M:%S', '%Y%m%d%H%M'):
        try:
            parsed = datetime.strptime(text, fmt)
            if timezone.is_naive(parsed):
                return timezone.make_aware(parsed, timezone.get_current_timezone())
            return parsed
        except ValueError:
            continue
    return None


def _apply_realtime_spike_guard(values, history_by_key):
    rules = {
        "pm10": {"min_value": 120, "min_delta": 70, "ratio": 2.5},
        "pm25": {"min_value": 70, "min_delta": 35, "ratio": 2.5},
    }
    for key, item in values.items():
        history = history_by_key.get(key) or []
        if len(history) < 3:
            continue
        for field, rule in rules.items():
            latest = _to_float(item.get(field))
            previous = [_to_float(row.get(field)) for row in history[1:5]]
            baseline = _median(previous)
            if latest is None or baseline is None or baseline <= 0:
                continue
            if latest >= rule["min_value"] and latest - baseline >= rule["min_delta"] and latest / baseline >= rule["ratio"]:
                item[f"raw{field.upper()}"] = latest
                item[field] = round(baseline, 1)
                item[f"{field}SpikeAdjusted"] = True
                item["qualityNote"] = "single_sample_spike_adjusted"
    return values


def _is_single_sample_spike(latest, previous_values, rule):
    baseline = _median(previous_values)
    if latest is None or baseline is None or baseline <= 0:
        return False
    return latest >= rule["min_value"] and latest - baseline >= rule["min_delta"] and latest / baseline >= rule["ratio"]


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
    history_by_key = {}
    for measurement in measurements:
        station = measurement.station
        key = f'{station.sido}:{station.name}'
        history_by_key.setdefault(key, []).append({
            "pm10": measurement.pm10_value,
            "pm25": measurement.pm25_value,
            "measured_at": measurement.measured_at,
        })
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
        if existing["pm10"] is None and measurement.pm10_value is not None:
            existing["pm10"] = measurement.pm10_value
            existing["pm10_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["pm25"] is None and measurement.pm25_value is not None:
            existing["pm25"] = measurement.pm25_value
            existing["pm25_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["no2"] is None and measurement.no2_value is not None:
            existing["no2"] = measurement.no2_value
            existing["no2_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
        if existing["o3"] is None and measurement.o3_value is not None:
            existing["o3"] = measurement.o3_value
            existing["o3_time"] = timezone.localtime(measurement.measured_at).strftime('%Y-%m-%d %H:%M')
    return _apply_realtime_spike_guard(values, history_by_key)


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
    for key, value in values.items():
        station = _find_station_for_realtime_value(value)
        if not station:
            continue
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
    cache_key = 'latest_daily_station_values_v1'
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
