"""에어코리아(AirKorea) 공공 API 호출과 응답 해석. DB와 캐시는 건드리지 않는다."""
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

from django.utils import timezone

from dust.config import AIRKOREA_SERVICE_KEY, API_KEY, REALTIME_DUST_URL, SIDO_STATION_ADDR_ALIASES, STATION_INFO_URL
from dust.external_api import public_api_get
from dust.services.common import _first_valid_value, _to_float


def _clean_station_name(value):
    return (value or '').strip()


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


def _airkorea_service_keys():
    keys = []
    for key in (AIRKOREA_SERVICE_KEY, API_KEY):
        if key and key not in keys:
            keys.append(key)
    return keys


def _station_request_variants(addr):
    base_params = {
        "returnType": "json",
        "numOfRows": "1000",
        "pageNo": "1",
        "addr": addr,
    }
    return [
        {"label": "serviceKey/json/ver1.1", "params": {**base_params, "serviceKey": key, "stationName": "", "ver": "1.1"}}
        for key in _airkorea_service_keys()
    ]


def _request_items(url, variants, context):
    """variants [(이름, 요청값)]를 차례로 보내 행이 온 첫 응답을 쓴다. 할당량 초과면 더 보내지 않는다."""
    items = []
    debug = []
    for label, params in variants:
        raw_error = None
        try:
            response = public_api_get(url, params=params)
            items, result, raw_error = _parse_airkorea_response(response)
            debug.append({
                **context,
                "variant": label,
                "status": response.status_code,
                "items": len(items),
                **({"raw_error": raw_error} if raw_error else {}),
                **result,
            })
        except Exception as exc:
            items = []
            debug.append({**context, "variant": label, "status": "request_failed", "items": 0, "error": str(exc)[:120]})
        if items:
            break
        if raw_error and "quota exceeded" in raw_error.lower():
            break
    return items, debug


def _fetch_station_locations_for_sido(sido):
    stations = {}
    debug = []
    found_for_sido = False
    for addr in SIDO_STATION_ADDR_ALIASES.get(sido, [sido]):
        variants = [(variant["label"], variant["params"]) for variant in _station_request_variants(addr)]
        items, addr_debug = _request_items(STATION_INFO_URL, variants, {"sido": sido, "addr": addr})
        debug.extend(addr_debug)
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


def _fetch_realtime_station_values_for_sido(sido):
    variants = [
        ("serviceKey/json/ver1.0", {"serviceKey": key, "returnType": "json", "numOfRows": "1000", "pageNo": "1", "sidoName": sido, "ver": "1.0"})
        for key in _airkorea_service_keys()
    ]
    debug = []
    if not variants:
        debug.append({"sido": sido, "items": 0, "error": "AirKorea service key is not configured."})
    items, request_debug = _request_items(REALTIME_DUST_URL, variants, {"sido": sido})
    debug.extend(request_debug)

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
            # 에어코리아가 통신장애·자료이상 등 표시를 붙인 값은 쓰지 않는다.
            "pm10": None if item.get('pm10Flag') else item.get('pm10Value'),
            "pm25": None if item.get('pm25Flag') else item.get('pm25Value'),
            "pm10Flag": item.get('pm10Flag'),
            "pm25Flag": item.get('pm25Flag'),
            "no2": item.get('no2Value'),
            "o3": item.get('o3Value'),
            "temp": '-',
            "humidity": '-',
            "time": item.get('dataTime') or '',
        }
    return values, debug


def _parse_airkorea_datetime(value):
    if not value:
        return None
    text = str(value).strip()
    # 에어코리아는 자정을 전날 '24:00'으로 표기한다. 파이썬은 24시를 못 읽어서 다음 날 0시로 바꾼다.
    if text.endswith(' 24:00'):
        midnight = _parse_airkorea_datetime(f"{text[:-6]} 00:00")
        return midnight + timedelta(days=1) if midnight else None
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
