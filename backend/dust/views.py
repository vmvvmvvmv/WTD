"""화면용 API: 요청 값을 읽고 서비스 결과를 응답으로 바꾼다. 업무 로직은 dust.services, 설정은 dust.config에 있다."""
import hashlib
import json
import logging
import math
import re
from datetime import datetime, time, timedelta
from django.conf import settings
from django.core.cache import cache
from django.shortcuts import render
from django.utils import timezone
from dust.api_errors import error_response
from dust.airkorea_forecast import build_forecast_prediction, build_hourly_forecast_items
from dust.config import AIRKOREA_SERVICE_KEY, KMA_API_KEY, KMA_ASOS_DAILY_URL, NAVER_MAP_CLIENT_ID
from dust.current_dust_service import canonical_sido_name, select_current_dust
from dust.external_api import public_api_get
from dust.map_presentation import build_map_css_variables, build_map_ui_config
from dust.midterm_weather import midterm_region_from_lat_lng
from dust.models import WeatherHourlyMeasurement, WeatherMidTermForecast
from dust.notification_registry import notification_device_response, upsert_notification_device
from dust.services.common import _dfs_grid_from_lat_lng, _parse_measure_date, _to_float
from dust.services.weather import collected_weather_grid
from dust.services.dust_history import _fetch_past_dust_items_by_station, _latest_past_item_date, _load_recent_realtime_hourly_dust, _load_stored_past_dust, _load_stored_realtime_daily_dust, _load_stored_realtime_hourly_dust, _merge_past_items, _store_past_dust_items
from dust.services.holidays import holidays_for_year
from dust.services.places import PlaceSearchFailed, PlaceSearchUnavailable, geocode_address, search_naver_places
from dust.services.stations import dust_cache_version, _find_air_quality_station, _find_current_realtime_value, _load_latest_daily_station_values, _load_realtime_station_values, _load_station_locations, _resolve_station_name, _station_lookup_name
from dust.services.weather import _latest_weather_by_grid_for_locations, _nearest_asos_station, _serialize_asos_daily_item, _serialize_midterm_forecast, _weather_measurement_to_response
from rest_framework.decorators import api_view
from rest_framework.response import Response

logger = logging.getLogger(__name__)


_SCRIPT_JSON_ESCAPES = str.maketrans({'<': '\\u003C', '>': '\\u003E', '&': '\\u0026'})


def _script_json(value):
    """Serialize a value for inline <script> so request input cannot close the tag."""
    return json.dumps(value, ensure_ascii=False).translate(_SCRIPT_JSON_ESCAPES)


def mobile_map(request):
    initial_mode = "dust" if request.GET.get("mode") == "dust" else "weather"
    picker_mode = request.GET.get("picker") == "1"
    view_mode = request.GET.get("view") or ("picker" if picker_mode else "unknown")
    basic_mode = request.GET.get("basic") == "1"
    initial_lat = _coordinate(request.GET.get("lat"), 90)
    initial_lng = _coordinate(request.GET.get("lng"), 180)
    try:
        initial_zoom = int(request.GET.get("zoom") or 7)
    except (TypeError, ValueError):
        initial_zoom = 7
    initial_zoom = max(6, min(initial_zoom, 18))
    return render(request, 'dust/mobile_map.html', {
        'client_id_js': _script_json(NAVER_MAP_CLIENT_ID),
        'initial_mode': initial_mode,
        'picker_mode_js': _script_json(picker_mode),
        'view_mode_js': _script_json(view_mode),
        'basic_mode_js': _script_json(basic_mode),
        'initial_lat_js': _script_json(initial_lat),
        'initial_lng_js': _script_json(initial_lng),
        'initial_zoom': initial_zoom,
        'app_test_token_js': _script_json(request.GET.get("app_test_token", "")),
        'map_ui_js': _script_json(build_map_ui_config()),
        'map_css_variables': build_map_css_variables(),
    })



def _coordinate(value, limit):
    """요청으로 받은 위도·경도. 숫자가 아니거나(NaN·무한대 포함) 범위를 벗어나면 없는 값으로 본다(격자 계산이 수학 오류로 터지지 않게)."""
    number = _to_float(value)
    return number if number is not None and math.isfinite(number) and abs(number) <= limit else None

@api_view(['POST'])
def register_notification_device(request):
    try:
        device = upsert_notification_device(request.data)
    except ValueError as exc:
        return error_response(400, str(exc))
    return Response(notification_device_response(device))


@api_view(['POST'])
def mobile_map_client_log(request):
    """Print WebView map diagnostics without storing API keys or token values."""
    if not getattr(settings, "ENABLE_MOBILE_MAP_LOG", settings.DEBUG):
        return error_response(404, "지도 로그 수집이 꺼져 있습니다.", "feature_disabled")

    body = request.data if isinstance(request.data, dict) else {}
    event = str(body.get("event") or "unknown")[:80].replace("\r", " ").replace("\n", " ")
    details = body.get("details") if isinstance(body.get("details"), dict) else {}
    safe_details = {
        str(key)[:50]: str(value)[:200]
        for key, value in details.items()
        if "token" not in str(key).lower() and "key" not in str(key).lower()
    }
    href = re.sub(r"app_test_token=[^&]+", "app_test_token=[hidden]", str(body.get("href") or ""))[:300].replace("\r", " ").replace("\n", " ")
    user_agent = str(body.get("userAgent") or "")[:200].replace("\r", " ").replace("\n", " ")
    print(f"[mobile-map] event={event} details={safe_details} href={href} userAgent={user_agent}", flush=True)
    return Response({"ok": True})


@api_view(['GET'])
def current_dust(request):
    city = request.GET.get('city') or '서울'
    region = request.GET.get('region') or '송파구'
    lookup_city = canonical_sido_name(city)
    station_name = _resolve_station_name(lookup_city, region)

    try:
        realtime_values, _ = _load_realtime_station_values(with_debug=True)
        latest_daily_values = _load_latest_daily_station_values()
        current = _find_current_realtime_value(lookup_city, region, station_name, realtime_values)
        latest_daily = latest_daily_values.get(f'{lookup_city}:{_station_lookup_name(station_name)}')
        payload, status_code = select_current_dust(city, region, station_name, current, latest_daily)
        return Response(payload, status=status_code)
    except Exception:
        logger.exception('Failed to load current dust for %s %s', city, region)
        return error_response(500, "현재 미세먼지 데이터를 불러오지 못했습니다.")


@api_view(['GET'])
def korea_station_dust(request):
    def station_response(data, status=None):
        response = Response(data, status=status)
        response["Cache-Control"] = "public, max-age=30"
        return response

    try:
        cache_key = f'korea_station_dust_response_v3:{dust_cache_version()}'
        cached_response = cache.get(cache_key)
        if cached_response is not None:
            return station_response(cached_response)

        station_locations, location_debug = _load_station_locations()
        realtime_values, realtime_debug = _load_realtime_station_values(with_debug=True)
        latest_daily_values = _load_latest_daily_station_values()
        latest_weather_by_grid = _latest_weather_by_grid_for_locations(station_locations)
        location_by_sido = {}
        realtime_by_sido = {}
        station_by_sido = {}

        for location in station_locations.values():
            location_by_sido[location["sido"]] = location_by_sido.get(location["sido"], 0) + 1

        for value in realtime_values.values():
            realtime_by_sido[value["sido"]] = realtime_by_sido.get(value["sido"], 0) + 1

        realtime_values_by_name = {}
        for value in realtime_values.values():
            lookup_name = _station_lookup_name(value.get("name") or value.get("stationName"))
            if lookup_name and lookup_name not in realtime_values_by_name:
                realtime_values_by_name[lookup_name] = value

        stations = []
        matched_by_key = 0
        matched_by_name = 0
        for key, location in station_locations.items():
            grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
            weather_values = latest_weather_by_grid.get((grid["nx"], grid["ny"]), {})
            values = realtime_values.get(key)
            if values:
                matched_by_key += 1
            else:
                values = realtime_values_by_name.get(_station_lookup_name(location["name"]))
                if values:
                    matched_by_name += 1
            if not values:
                values = latest_daily_values.get(f'{location["sido"]}:{_station_lookup_name(location["name"])}')
            if not values:
                values = {
                    "name": location["name"],
                    "sido": location["sido"],
                    "aqi": None,
                    "pm10": "-",
                    "pm25": "-",
                    "no2": "-",
                    "o3": "-",
                    "temp": "-",
                    "humidity": "-",
                    "time": "",
                }
            stations.append({
                **location,
                **values,
                **weather_values,
                "city": location["name"],
            })
            station_by_sido[location["sido"]] = station_by_sido.get(location["sido"], 0) + 1

        response_data = {
            "count": len(stations),
            "items": stations,
            "basis": "nearest_airkorea_station",
            "debug": {
                "station_locations": len(station_locations),
                "realtime_values": len(realtime_values),
                "matched_by_key": matched_by_key,
                "matched_by_name": matched_by_name,
                "location_by_sido": location_by_sido,
                "realtime_by_sido": realtime_by_sido,
                "station_by_sido": station_by_sido,
                "station_location_requests": location_debug[:12],
                "realtime_requests": realtime_debug[:12],
                "airkorea_key_configured": bool(AIRKOREA_SERVICE_KEY),
                "latest_daily_values": len(latest_daily_values),
                "latest_weather_grids": len(latest_weather_by_grid),
            },
        }
        cache.set(cache_key, response_data, 30)
        return station_response(response_data)
    except Exception:
        logger.exception("Failed to load korea station dust")
        return error_response(500, "전국 측정소 데이터를 불러오지 못했습니다.")


@api_view(['GET'])
def midterm_weather(request):
    # This endpoint reads stored forecasts only. KMA traffic stays in the scheduled collection command.
    lat = _coordinate(request.GET.get("lat"), 90)
    lng = _coordinate(request.GET.get("lng"), 180)
    start_date = _parse_measure_date(request.GET.get("startDate")) if request.GET.get("startDate") else timezone.localdate()
    end_date = _parse_measure_date(request.GET.get("endDate")) if request.GET.get("endDate") else timezone.localdate() + timedelta(days=14)
    if lat is None or lng is None:
        return error_response(400, "lat과 lng 파라미터가 필요합니다.")
    if not start_date or not end_date:
        return error_response(400, "startDate와 endDate는 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")
    today = timezone.localdate()
    if start_date < today:
        start_date = today
    if end_date < start_date:
        return Response({"region": midterm_region_from_lat_lng(lat, lng), "startDate": start_date.isoformat(), "endDate": end_date.isoformat(), "items": []})

    region = midterm_region_from_lat_lng(lat, lng)
    latest_announced = (
        WeatherMidTermForecast.objects
        .filter(land_reg_id=region["land_reg_id"], temp_reg_id=region["temp_reg_id"])
        .order_by("-announced_at")
        .values_list("announced_at", flat=True)
        .first()
    )
    queryset = WeatherMidTermForecast.objects.filter(
        land_reg_id=region["land_reg_id"],
        temp_reg_id=region["temp_reg_id"],
        forecast_date__gte=start_date,
        forecast_date__lte=end_date,
    )
    if latest_announced:
        queryset = queryset.filter(announced_at=latest_announced)
    items = queryset.order_by("forecast_date")
    return Response({
        "region": region,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "items": [_serialize_midterm_forecast(item) for item in items],
    })


# 장소·주소 검색은 네이버 호출 한도를 쓴다. 같은 검색어는 10분 동안 캐시 결과를 쓰고,
# 캐시에 없어 네이버까지 가는 검색은 IP마다 10분에 PLACE_SEARCH_IP_LIMIT번까지만 허용한다(남이 반복 호출해 한도를 다 쓰지 않게).
PLACE_SEARCH_CACHE_SECONDS = 600
PLACE_SEARCH_IP_LIMIT = 120
PLACE_SEARCH_QUERY_MAX = 60


def _place_search_allowed(request):
    from dust.memo_views import _client_ip

    # IP 원문은 캐시 키에도 남기지 않는다(해시만).
    ip_key = hashlib.sha256(_client_ip(request).encode("utf-8")).hexdigest()[:24]
    key = f"place_search_ip_{ip_key}_{int(timezone.now().timestamp() // PLACE_SEARCH_CACHE_SECONDS)}"
    cache.add(key, 0, PLACE_SEARCH_CACHE_SECONDS)
    try:
        return cache.incr(key) <= PLACE_SEARCH_IP_LIMIT
    except ValueError:
        return True


@api_view(['GET'])
def naver_place_search(request):
    query = " ".join((request.GET.get("query") or "").split())[:PLACE_SEARCH_QUERY_MAX]
    if len(query) < 1:
        return Response({"items": []})
    try:
        display = max(1, min(int(request.GET.get("size") or 5), 5))
    except (TypeError, ValueError):
        display = 5
    # 캐시 키는 검색어 해시라 검색어 원문은 저장하지 않는다. 값은 공개된 장소 정보뿐이다.
    cache_key = f"place_search_v1_{display}_{hashlib.sha256(query.lower().encode('utf-8')).hexdigest()}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    if not _place_search_allowed(request):
        return error_response(429, "검색이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.")
    # 주소처럼 보이면 주소 검색 결과(최대 2개)를 장소 결과 앞에 둔다. 한쪽이 실패해도 다른 쪽 결과는 보여 준다.
    address_items = geocode_address(query)
    place_failed = False
    try:
        place_items = search_naver_places(query, display)
    except PlaceSearchUnavailable:
        if not address_items:
            return error_response(503, "장소 검색을 지금 사용할 수 없습니다.")
        place_items, place_failed = [], True
    except PlaceSearchFailed:
        if not address_items:
            return error_response(502, "장소 검색에 실패했습니다.")
        place_items, place_failed = [], True
    result = {"items": address_items + place_items}
    # 장소 검색이 일시 실패한 결과는 캐시하지 않는다(10분 동안 반쪽 결과를 돌려주지 않게).
    if not place_failed:
        cache.set(cache_key, result, PLACE_SEARCH_CACHE_SECONDS)
    return Response(result)


@api_view(['GET'])
def past_weather(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    start_date = _parse_measure_date(request.GET.get('startDate'))
    end_date = _parse_measure_date(request.GET.get('endDate'))
    if not city or not district:
        return error_response(400, "city와 region 파라미터가 필요합니다.")
    if not start_date or not end_date:
        return error_response(400, "startDate와 endDate는 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")
    if not KMA_API_KEY:
        logger.error("KMA_API_KEY is not configured.")
        return error_response(500, "지난 날씨를 지금 불러올 수 없습니다.")

    latest_available_date = timezone.localdate() - timedelta(days=1)
    end_date = min(end_date, latest_available_date)
    if start_date > end_date:
        return Response({"items": [], "notice": "ASOS daily weather data is available through yesterday."})

    station_name = _resolve_station_name(city, district)
    station = _find_air_quality_station(city, station_name)
    if not station:
        return error_response(404, "가까운 측정소를 찾지 못했습니다.")

    asos_station = _nearest_asos_station(station.lat, station.lng)
    cache_key = f"kma_asos_daily_v1_{asos_station['id']}_{start_date:%Y%m%d}_{end_date:%Y%m%d}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    params = {
        "serviceKey": KMA_API_KEY,
        "pageNo": "1",
        "numOfRows": "300",
        "dataType": "JSON",
        "dataCd": "ASOS",
        "dateCd": "DAY",
        "startDt": start_date.strftime("%Y%m%d"),
        "endDt": end_date.strftime("%Y%m%d"),
        "stnIds": asos_station["id"],
    }
    try:
        response = public_api_get(KMA_ASOS_DAILY_URL, params=params, timeout=20)
        if response.status_code >= 400:
            logger.warning("KMA ASOS daily API returned %s", response.status_code)
            return error_response(502, "지난 날씨를 불러오지 못했습니다.")
        data = response.json()
    except Exception:
        logger.exception("KMA ASOS daily API request failed")
        return error_response(502, "지난 날씨를 불러오지 못했습니다.")

    header = data.get("response", {}).get("header", {})
    if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
        logger.warning("KMA ASOS daily API result %s: %s", header.get("resultCode"), header.get("resultMsg"))
        return error_response(502, "지난 날씨를 불러오지 못했습니다.")

    items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    result = {
        "city": city,
        "region": district,
        "stationName": station.name,
        "asosStation": asos_station,
        "startDate": start_date.isoformat(),
        "endDate": end_date.isoformat(),
        "items": [_serialize_asos_daily_item(item) for item in items],
    }
    cache.set(cache_key, result, 60 * 60 * 6)
    return Response(result)


@api_view(['GET'])
def current_weather(request):
    lat = _coordinate(request.GET.get("lat"), 90)
    lng = _coordinate(request.GET.get("lng"), 180)
    if lat is None or lng is None:
        return error_response(400, "lat과 lng 파라미터가 필요합니다.")

    grid = _dfs_grid_from_lat_lng(lat, lng)
    cache_key = f"weather_current_v1_{grid['nx']}_{grid['ny']}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    now = timezone.now()
    grid = collected_weather_grid(grid, now)
    measurement = (
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__lte=now)
        .order_by('-measured_at')
        .first()
    )
    if not measurement:
        measurement = (
            WeatherHourlyMeasurement.objects
            .filter(nx=grid["nx"], ny=grid["ny"])
            .order_by('measured_at')
            .first()
        )
    if not measurement:
        return error_response(404, "이 위치의 저장된 날씨 데이터가 없습니다.", grid=grid)
    result = _weather_measurement_to_response(measurement)
    cache.set(cache_key, result, 60)
    return Response(result)



@api_view(['GET'])
def hourly_weather(request):
    lat = _coordinate(request.GET.get("lat"), 90)
    lng = _coordinate(request.GET.get("lng"), 180)
    date_param = request.GET.get("date")
    stored_only = str(request.GET.get("stored_only") or "").lower() in ("1", "true", "yes", "y")
    try:
        forecast_hours = int(request.GET.get("forecast_hours") or 12)
    except (TypeError, ValueError):
        forecast_hours = 12
    # 단기예보 끝(글피 자정)까지 줄 수 있게 96시간까지 받는다(수집기와 같은 상한).
    forecast_hours = max(1, min(forecast_hours, 96))
    if lat is None or lng is None:
        return error_response(400, "lat과 lng 파라미터가 필요합니다.")

    measured_date = _parse_measure_date(date_param) if date_param else timezone.localdate()
    if not measured_date:
        return error_response(400, "date는 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")

    grid = _dfs_grid_from_lat_lng(lat, lng)
    cache_key = f"weather_hourly_v2_{grid['nx']}_{grid['ny']}_{measured_date:%Y%m%d}_{forecast_hours}_{int(stored_only)}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)
    local_tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(measured_date, time.min), local_tz)
    day_end = day_start + timedelta(days=1)
    now = timezone.now()

    def load(grid):
        measurements = (
            WeatherHourlyMeasurement.objects
            .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gte=day_start, measured_at__lt=day_end, measured_at__lte=now)
            .order_by('measured_at')
        )
        stored_measurements = list(measurements)
        items = []
        for measurement in stored_measurements:
            measured_at = timezone.localtime(measurement.measured_at)
            items.append({
                "measuredAt": measured_at.isoformat(),
                "date": measured_at.date().isoformat(),
                "hour": measured_at.strftime("%H:00"),
                "temperature": measurement.temperature,
                "humidity": measurement.humidity,
                "wind_speed": measurement.wind_speed,
                "wind_direction": measurement.wind_direction,
                "rain_mm": measurement.rain_mm,
                "rain_probability": measurement.rain_probability,
                "label": measurement.label,
                "sky": measurement.sky,
                "precipitation_type": measurement.precipitation_type,
                "source": "stored_weather_hourly",
                "phase": "stored",
            })
        current_measurement = stored_measurements[-1] if stored_measurements else None
        forecast_start = current_measurement.measured_at if current_measurement else now
        forecast_measurements = (
            WeatherHourlyMeasurement.objects
            .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gt=forecast_start)
            .order_by('measured_at')[:forecast_hours]
        )
        forecast_items = []
        if not stored_only:
            for measurement in forecast_measurements:
                measured_at = timezone.localtime(measurement.measured_at)
                forecast_items.append({
                    "measuredAt": measured_at.isoformat(),
                    "date": measured_at.date().isoformat(),
                    "hour": measured_at.strftime("%H:00"),
                    "temperature": measurement.temperature,
                    "humidity": measurement.humidity,
                    "wind_speed": measurement.wind_speed,
                    "wind_direction": measurement.wind_direction,
                    "rain_mm": measurement.rain_mm,
                    "rain_probability": measurement.rain_probability,
                    "label": measurement.label,
                    "sky": measurement.sky,
                    "precipitation_type": measurement.precipitation_type,
                    "source": "stored_weather_forecast",
                    "phase": "forecast",
                })
        return items, forecast_items

    requested_grid = grid
    # 고른 곳의 격자를 모으지 않으면(시·군·구 대표 격자만 모음) 가장 가까운 모으는 격자로 보여 준다.
    grid = collected_weather_grid(grid, now)
    items, forecast_items = load(grid)
    result = {
        "date": measured_date.isoformat(),
        "grid": grid,
        "requestedGrid": requested_grid,
        "items": items,
        "forecastItems": forecast_items,
    }
    cache.set(cache_key, result, 300)
    return Response(result)


@api_view(['GET'])
def predict_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')

    if not city or not district:
        return error_response(400, "city와 region 파라미터가 필요합니다.")

    try:
        # 서버 메모리를 아끼기 위해 Prophet 학습 대신 에어코리아 내일·모레 예보 등급을 쓴다.
        # Prophet 기반 _build_prediction_for_region은 챗봇 등 선택 기능용으로 남겨 둔다.
        result = build_forecast_prediction(AIRKOREA_SERVICE_KEY, city)
    except Exception:
        logger.exception('Failed to build dust prediction for %s %s', city, district)
        return error_response(500, "미세먼지 예측을 불러오지 못했습니다.")
    return Response({city: {district: result}})


@api_view(['GET'])
def hourly_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    date_param = request.GET.get('date')

    if not city or not district:
        return error_response(400, "city와 region 파라미터가 필요합니다.")

    measured_date = _parse_measure_date(date_param) if date_param else timezone.localdate()
    if not measured_date:
        return error_response(400, "date는 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")

    cache_key = f"dust_hourly_v2_{city}_{district}_{measured_date:%Y%m%d}"
    cached = cache.get(cache_key)
    if cached is not None:
        return Response(cached)

    station_name = _resolve_station_name(city, district)
    station = _find_air_quality_station(city, station_name)
    items = _load_stored_realtime_hourly_dust(city, district, station_name, measured_date, station=station)
    source = "date"
    if not items and measured_date >= timezone.localdate() - timedelta(days=1):
        items = _load_recent_realtime_hourly_dust(city, district, station_name, station=station)
        source = "recent_24h"
    # 앞으로 12시간 미세먼지는 에어코리아 공식 예보(하루 단위 등급)를 쓴다.
    # 직접 만든 시간별 예측 모델은 generate_hourly_dust_predictions 명령으로 따로 돌려 비교용으로만 남긴다.
    forecast_items = build_hourly_forecast_items(AIRKOREA_SERVICE_KEY, city)
    result = {
        "city": city,
        "region": district,
        "stationName": station_name,
        "date": measured_date.isoformat(),
        "source": source,
        "items": items,
        "forecastItems": forecast_items,
        "predictionModel": {
            "name": "airkorea_forecast_grade",
            "source": "airkorea",
            "note": "에어코리아 미세먼지 예보 등급(오늘·내일)을 등급별 대표 PM10 값으로 바꾼 값입니다.",
        },
    }
    cache.set(cache_key, result, 300)
    return Response(result)


@api_view(['GET'])
def past_dust(request):
    city = request.GET.get('city')
    district = request.GET.get('region')
    start_date = request.GET.get('startDate')
    end_date = request.GET.get('endDate')

    if not city or not district:
        return error_response(400, "city와 region 파라미터가 필요합니다.")

    station_name = _resolve_station_name(city, district)

    parsed_start = _parse_measure_date(start_date)
    parsed_end = _parse_measure_date(end_date)
    yesterday = timezone.localdate() - timedelta(days=1)
    if parsed_end and parsed_end > yesterday:
        parsed_end = yesterday
    effective_start_date = parsed_start.strftime('%Y%m%d') if parsed_start else start_date
    effective_end_date = parsed_end.strftime('%Y%m%d') if parsed_end else end_date

    stored_items = _load_stored_past_dust(city, district, station_name, effective_start_date, effective_end_date)
    realtime_daily_items = _load_stored_realtime_daily_dust(city, district, station_name, effective_start_date, effective_end_date)
    merged_items = _merge_past_items(stored_items, realtime_daily_items)
    api_items = []
    saved_count = 0

    latest_merged_date = _latest_past_item_date(merged_items)
    should_fetch_api = (
        parsed_start
        and parsed_end
        and (
            not merged_items
            or latest_merged_date is None
            or latest_merged_date < parsed_end
        )
    )
    if should_fetch_api:
        api_items, _ = _fetch_past_dust_items_by_station(station_name, parsed_start, parsed_end, allow_api=True)
        if api_items:
            saved_count = _store_past_dust_items(city, district, station_name, api_items)
            stored_items = _load_stored_past_dust(city, district, station_name, effective_start_date, effective_end_date)
            realtime_daily_items = _load_stored_realtime_daily_dust(city, district, station_name, effective_start_date, effective_end_date)
            merged_items = _merge_past_items(stored_items, realtime_daily_items, api_items)

    return Response({
        "items": merged_items,
        "api_count": len(api_items),
        "stored_count": len(stored_items),
        "realtime_daily_count": len(realtime_daily_items),
        "saved_count": saved_count,
        "source": "stored_first",
    })


@api_view(['GET'])
def holidays(request):
    # 저장된 공휴일만 읽는다. 천문연구원 API 호출은 collect_holidays(매일 아침)가 맡는다.
    try:
        year = int(request.GET.get("year") or timezone.localdate().year)
    except ValueError:
        year = 0
    if not 2000 <= year <= 2100:
        return error_response(400, "year는 2000~2100 사이 숫자여야 합니다.")
    response = Response({"year": year, "items": holidays_for_year(year)})
    response["Cache-Control"] = "public, max-age=3600"
    return response
