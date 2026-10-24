"""기상청 단기·초단기·중기 예보와 ASOS 일자료 수집·저장·조회."""
import logging
from datetime import datetime, timedelta
from django.core.cache import cache
from django.utils import timezone
from dust.config import ASOS_STATIONS, KMA_API_KEY, KMA_MID_TERM_LAND_URL, KMA_MID_TERM_TEMPERATURE_URL, KMA_VILAGE_FORECAST_URL
from dust.external_api import public_api_get
from dust.midterm_weather import current_midterm_announce_candidates, MIDTERM_REGIONS
from dust.models import WeatherHourlyMeasurement, WeatherMidTermForecast
from dust.services.common import _dfs_grid_from_lat_lng, _haversine_km, _to_float
from dust.services.stations import _current_station_location

logger = logging.getLogger(__name__)


def _latest_weather_by_grid_for_locations(station_locations, max_age_hours=24):
    # 지도용 기온. 이 표에는 72시간 뒤 예보도 들어 있어서, 지금 시각 이전 값 중 가장 최근 것을 쓴다.
    # 날씨는 주소 지역마다 대표 격자만 모으므로, 값이 없는 격자는 가장 가까운 수집 격자 값을 빌려 쓴다.
    now = timezone.now()
    wanted = set()
    for location in station_locations.values():
        grid = _dfs_grid_from_lat_lng(location.get("lat"), location.get("lng"))
        wanted.add((grid["nx"], grid["ny"]))

    if not wanted:
        return {}

    rows = (
        WeatherHourlyMeasurement.objects
        .filter(measured_at__gte=now - timedelta(hours=max_age_hours), measured_at__lte=now)
        .order_by('nx', 'ny', '-measured_at')
    )
    collected = {}
    for row in rows:
        key = (row.nx, row.ny)
        if key in collected:
            continue
        measured_at = timezone.localtime(row.measured_at)
        collected[key] = {
            "weatherTemperature": row.temperature,
            "weatherHumidity": row.humidity,
            "weatherWindSpeed": row.wind_speed,
            "weatherWindDirection": row.wind_direction,
            "weatherRainMm": row.rain_mm,
            "weatherLabel": row.label,
            "weatherTime": measured_at.strftime('%Y-%m-%d %H:%M'),
        }
    if not collected:
        return {}

    # ponytail: 격자 수(수백 개)끼리 전부 비교한다. 수천 개로 늘면 KD-tree로 바꾼다.
    latest = {}
    for key in wanted:
        nearest = key if key in collected else min(collected, key=lambda other: (other[0] - key[0]) ** 2 + (other[1] - key[1]) ** 2)
        latest[key] = collected[nearest]
    return latest


def _kma_ultra_short_base_datetime(now=None):
    current = now or datetime.now()
    if current.minute < 45:
        current = current - timedelta(hours=1)
    return current.strftime("%Y%m%d"), current.strftime("%H30"), current.strftime("%H00")


def _kma_ultra_short_base_datetime_candidates(limit=4):
    current = datetime.now()
    candidates = []
    for _ in range(limit):
        base_date, base_time, current_time = _kma_ultra_short_base_datetime(current)
        candidate = (base_date, base_time, current_time)
        if candidate not in candidates:
            candidates.append(candidate)
        current = current - timedelta(hours=1)
    return candidates


def _kma_current_weather_label(pty, sky, lgt=None):
    # 낙뢰(LGT, 초단기예보에만 있음)가 있으면 천둥번개를 붙인다. 비·눈과 같이 오면 둘 다 남겨 비 판정도 유지한다.
    if (_to_float(lgt) or 0) > 0:
        base = _kma_current_weather_label(pty, sky)
        return f"{base}·천둥번개" if base in ("비", "눈") else "천둥번개"
    pty_text = str(pty or "0")
    sky_text = str(sky or "")
    if pty_text != "0":
        if pty_text in ("3", "7"):
            return "눈"
        return "비"
    if sky_text == "1":
        return "맑음"
    if sky_text in ("3", "4"):
        return "흐림"
    return "흐림"


def _weather_measured_at_from_key(forecast_key):
    try:
        parsed = datetime.strptime(str(forecast_key), "%Y%m%d%H%M")
    except (TypeError, ValueError):
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _weather_measurement_to_response(measurement, source="stored_weather_hourly"):
    measured_at = timezone.localtime(measurement.measured_at)
    return {
        "label": measurement.label,
        "temperature": measurement.temperature,
        "humidity": measurement.humidity,
        "wind_speed": measurement.wind_speed,
        "wind_direction": measurement.wind_direction,
        "rain_mm": measurement.rain_mm,
        "rain_probability": measurement.rain_probability,
        "sky": measurement.sky,
        "precipitation_type": measurement.precipitation_type,
        "forecast_time": measured_at.strftime("%Y%m%d%H%M"),
        "measured_at": measured_at.isoformat(),
        "grid": {"nx": measurement.nx, "ny": measurement.ny},
        "source": source,
    }


def _store_weather_hourly_measurement(grid, selected_key, selected):
    measured_at = _weather_measured_at_from_key(selected_key)
    if not measured_at:
        return None
    measurement, _ = WeatherHourlyMeasurement.objects.update_or_create(
        nx=grid["nx"],
        ny=grid["ny"],
        measured_at=measured_at,
        defaults={
            "temperature": _to_float(selected.get("T1H")),
            "humidity": _to_float(selected.get("REH")),
            "wind_speed": _to_float(selected.get("WSD")),
            "wind_direction": _to_float(selected.get("VEC")),
            "rain_mm": _to_float(selected.get("RN1")) or _parse_kma_precipitation(selected.get("PCP")),
            "rain_probability": _to_float(selected.get("POP")),
            "sky": str(selected.get("SKY") or ""),
            "precipitation_type": str(selected.get("PTY") or ""),
            "label": _kma_current_weather_label(selected.get("PTY"), selected.get("SKY"), selected.get("LGT")),
            "raw_data": selected,
        },
    )
    return measurement


def _forecast_item_time_key(item):
    date_text = str(item.get("date") or "").replace("-", "")
    hour_text = str(item.get("hour") or "").replace(":", "")
    if len(hour_text) == 2:
        hour_text = f"{hour_text}00"
    return f"{date_text}{hour_text[:4]}"


def _future_weather_forecast_items(items, limit=12):
    now_key = timezone.localtime(timezone.now()).strftime("%Y%m%d%H%M")
    return [
        item for item in sorted(items or [], key=_forecast_item_time_key)
        if _forecast_item_time_key(item) > now_key
    ][:limit]


def _fetch_kma_hourly_weather_forecast_by_grid(grid, limit=12):
    if not KMA_API_KEY:
        return []

    cache_key = f"kma_hourly_weather_forecast_v1:{grid['nx']}:{grid['ny']}"
    cached = cache.get(cache_key)
    cached_items = _future_weather_forecast_items(cached, limit)
    if len(cached_items) >= limit:
        return cached_items

    cache_limit = max(limit + 6, 18)
    for base_date, base_time in _kma_base_datetime_candidates():
        params = {
            "serviceKey": KMA_API_KEY,
            "pageNo": "1",
            "numOfRows": "1000",
            "dataType": "JSON",
            "base_date": base_date,
            "base_time": base_time,
            "nx": grid["nx"],
            "ny": grid["ny"],
        }
        try:
            response = public_api_get(KMA_VILAGE_FORECAST_URL, params=params)
            data = response.json()
        except Exception:
            continue

        header = data.get("response", {}).get("header", {})
        if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
            continue

        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
        if isinstance(items, dict):
            items = [items]

        grouped = {}
        for item in items:
            fcst_date = str(item.get("fcstDate") or "")
            fcst_time = str(item.get("fcstTime") or "")
            category = str(item.get("category") or "")
            value = item.get("fcstValue")
            if not fcst_date or not fcst_time or not category:
                continue
            grouped.setdefault(f"{fcst_date}{fcst_time}", {})[category] = value

        now_key = timezone.localtime(timezone.now()).strftime("%Y%m%d%H%M")
        forecasts = []
        for forecast_key in sorted(grouped):
            if forecast_key <= now_key:
                continue
            bucket = grouped[forecast_key]
            temperature = _to_float(bucket.get("TMP"))
            if temperature is None:
                continue
            measured_at = _weather_measured_at_from_key(forecast_key)
            if not measured_at:
                continue
            local_time = timezone.localtime(measured_at)
            forecasts.append({
                "measuredAt": local_time.isoformat(),
                "date": local_time.date().isoformat(),
                "hour": local_time.strftime("%H:00"),
                "temperature": temperature,
                "humidity": _to_float(bucket.get("REH")),
                "wind_speed": _to_float(bucket.get("WSD")),
                "wind_direction": _to_float(bucket.get("VEC")),
                "rain_mm": _parse_kma_precipitation(bucket.get("PCP")),
                "rain_probability": _to_float(bucket.get("POP")),
                "label": _kma_current_weather_label(bucket.get("PTY"), bucket.get("SKY"), bucket.get("LGT")),
                "sky": str(bucket.get("SKY") or ""),
                "precipitation_type": str(bucket.get("PTY") or ""),
                "source": "kma_vilage_forecast",
                "phase": "forecast",
            })
            if len(forecasts) >= cache_limit:
                break
        if forecasts:
            cache.set(cache_key, forecasts, 60 * 45)
            return _future_weather_forecast_items(forecasts, limit)
    return []


def _nearest_asos_station(lat, lng):
    return min(
        ASOS_STATIONS,
        key=lambda station: _haversine_km(lat, lng, station["lat"], station["lng"]),
    )


def _serialize_asos_daily_item(item):
    return {
        "date": str(item.get("tm") or ""),
        "stationId": str(item.get("stnId") or ""),
        "stationName": str(item.get("stnNm") or ""),
        "avgTemperature": _to_float(item.get("avgTa")),
        "minTemperature": _to_float(item.get("minTa")),
        "maxTemperature": _to_float(item.get("maxTa")),
        "avgHumidity": _to_float(item.get("avgRhm")),
        "avgWindSpeed": _to_float(item.get("avgWs")),
        "maxWindSpeed": _to_float(item.get("maxWs")),
        "rainMm": _to_float(item.get("sumRn")),
        "source": "kma_asos_daily",
    }


def _parse_midterm_announced_at(tm_fc):
    try:
        parsed = datetime.strptime(str(tm_fc), "%Y%m%d%H%M")
    except (TypeError, ValueError):
        return None
    return timezone.make_aware(parsed, timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed


def _normalize_kma_items(data):
    items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return items
    return []


def _fetch_midterm_api_item(url, reg_id, tm_fc):
    params = {
        "serviceKey": KMA_API_KEY,
        "pageNo": "1",
        "numOfRows": "10",
        "dataType": "JSON",
        "regId": reg_id,
        "tmFc": tm_fc,
    }
    response = public_api_get(url, params=params)
    if response.status_code >= 400:
        return None
    data = response.json()
    header = data.get("response", {}).get("header", {})
    if header.get("resultCode") not in (None, "00"):
        return None
    items = _normalize_kma_items(data)
    return items[0] if items else None


def _midterm_weather_value(item, day, suffix):
    return item.get(f"wf{day}{suffix}") or item.get(f"wf{day}") or ""


def _midterm_rain_value(item, day, suffix):
    return _to_float(item.get(f"rnSt{day}{suffix}") or item.get(f"rnSt{day}"))


def _store_midterm_forecast_for_region(region, tm_fc):
    if not KMA_API_KEY:
        return 0
    announced_at = _parse_midterm_announced_at(tm_fc)
    if not announced_at:
        return 0

    land_item = _fetch_midterm_api_item(KMA_MID_TERM_LAND_URL, region["land_reg_id"], tm_fc)
    temp_item = _fetch_midterm_api_item(KMA_MID_TERM_TEMPERATURE_URL, region["temp_reg_id"], tm_fc)
    if not land_item and not temp_item:
        return 0

    announced_date = timezone.localtime(announced_at).date()
    saved = 0
    for day in range(3, 11):
        forecast_date = announced_date + timedelta(days=day)
        weather_am = _midterm_weather_value(land_item or {}, day, "Am")
        weather_pm = _midterm_weather_value(land_item or {}, day, "Pm")
        rain_am = _midterm_rain_value(land_item or {}, day, "Am")
        rain_pm = _midterm_rain_value(land_item or {}, day, "Pm")
        WeatherMidTermForecast.objects.update_or_create(
            land_reg_id=region["land_reg_id"],
            temp_reg_id=region["temp_reg_id"],
            announced_at=announced_at,
            forecast_date=forecast_date,
            defaults={
                "region_key": region["key"],
                "region_label": region["label"],
                "min_temperature": _to_float((temp_item or {}).get(f"taMin{day}")),
                "max_temperature": _to_float((temp_item or {}).get(f"taMax{day}")),
                "weather_am": str(weather_am or ""),
                "weather_pm": str(weather_pm or ""),
                "rain_probability_am": rain_am,
                "rain_probability_pm": rain_pm,
                "raw_data": {
                    "tmFc": tm_fc,
                    "land": land_item or {},
                    "temperature": temp_item or {},
                },
            },
        )
        saved += 1
    return saved


def collect_midterm_weather_forecasts(regions=None):
    saved = 0
    for region in regions or MIDTERM_REGIONS:
        for tm_fc in current_midterm_announce_candidates():
            # data.go.kr은 할당량 초과·키 오류 때 JSON 대신 XML을 준다. 한 지역이 실패해도 나머지는 계속 모은다.
            try:
                region_saved = _store_midterm_forecast_for_region(region, tm_fc)
            except Exception:
                logger.exception("Mid-term forecast collection failed for %s %s", region.get("key"), tm_fc)
                continue
            if region_saved:
                saved += region_saved
                break
    return saved


def _serialize_midterm_forecast(item):
    return {
        "date": item.forecast_date.isoformat(),
        "announcedAt": timezone.localtime(item.announced_at).isoformat(),
        "regionKey": item.region_key,
        "regionLabel": item.region_label,
        "landRegId": item.land_reg_id,
        "tempRegId": item.temp_reg_id,
        "minTemperature": item.min_temperature,
        "maxTemperature": item.max_temperature,
        "weatherAm": item.weather_am,
        "weatherPm": item.weather_pm,
        "rainProbabilityAm": item.rain_probability_am,
        "rainProbabilityPm": item.rain_probability_pm,
        "source": "kma_mid_term_forecast",
    }


def _kma_base_datetime_candidates(now=None, limit=4):
    now = now or datetime.now()
    base_times = [2, 5, 8, 11, 14, 17, 20, 23]
    candidates = []
    cursor = now - timedelta(minutes=75)
    while len(candidates) < limit:
        base_hour = next((hour for hour in reversed(base_times) if hour <= cursor.hour), None)
        base_date = cursor.date()
        if base_hour is None:
            base_date = base_date - timedelta(days=1)
            base_hour = 23

        candidate = (base_date.strftime('%Y%m%d'), f'{base_hour:02d}00')
        if candidate not in candidates:
            candidates.append(candidate)
        cursor = datetime.combine(base_date, datetime.min.time()) + timedelta(hours=base_hour) - timedelta(minutes=1)
    return candidates


def _parse_kma_precipitation(value):
    if value in (None, '', '강수없음'):
        return 0.0
    text = str(value).strip()
    if '없음' in text:
        return 0.0
    if '1mm 미만' in text:
        return 0.5
    if '30.0~50.0mm' in text:
        return 40.0
    if '50.0mm 이상' in text:
        return 50.0
    number = ''.join(ch for ch in text if ch.isdigit() or ch == '.')
    return _to_float(number) or 0.0


def _fetch_kma_weather_by_station(sido, station_name):
    return [], "Weather API calls are disabled for request-time reads."

    if not KMA_API_KEY:
        return [], "KMA_API_KEY is not configured."

    location = _current_station_location(sido, station_name)
    if not location:
        return [], "Station location was not found."

    grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
    last_error = None
    for base_date, base_time in _kma_base_datetime_candidates():
        cache_key = f'kma_vilage_v2_{grid["nx"]}_{grid["ny"]}_{base_date}_{base_time}'
        cached = cache.get(cache_key)
        if cached is not None:
            if cached:
                return cached, None
            continue

        params = {
            "serviceKey": KMA_API_KEY,
            "pageNo": "1",
            "numOfRows": "1000",
            "dataType": "JSON",
            "base_date": base_date,
            "base_time": base_time,
            "nx": grid["nx"],
            "ny": grid["ny"],
        }
        try:
            response = public_api_get(KMA_VILAGE_FORECAST_URL, params=params)
            try:
                data = response.json()
            except ValueError:
                preview = response.text.strip()[:240]
                last_error = (
                    f"KMA non-JSON response for base_date={base_date}, base_time={base_time}, "
                    f"nx={grid['nx']}, ny={grid['ny']}, status={response.status_code}: {preview or 'empty body'}"
                )
                cache.set(cache_key, [], 60 * 5)
                continue
            header = data.get("response", {}).get("header", {})
            if response.status_code >= 400 or header.get("resultCode") not in (None, "00"):
                last_error = (
                    f"KMA error for base_date={base_date}, base_time={base_time}, "
                    f"nx={grid['nx']}, ny={grid['ny']}: "
                    f"{header.get('resultCode') or response.status_code} {header.get('resultMsg') or ''}".strip()
                )
                cache.set(cache_key, [], 60 * 5)
                continue
            items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
            if isinstance(items, dict):
                items = [items]
            cache.set(cache_key, items, 60 * 30 if items else 60 * 5)
            if items:
                return items, None
            last_error = f"KMA returned no items for {base_date} {base_time}."
        except Exception as exc:
            last_error = str(exc)

    return [], last_error


def _summarize_kma_weather(items, periods=3):
    daily = {}
    for item in items:
        date = item.get("fcstDate")
        category = item.get("category")
        value = item.get("fcstValue")
        if not date or not category:
            continue

        bucket = daily.setdefault(date, {
            "date": datetime.strptime(date, "%Y%m%d").strftime("%Y-%m-%d"),
            "rain_mm": 0.0,
            "rain_probability": None,
            "wind_speed": None,
            "humidity": None,
            "temperature": None,
            "precipitation_type": 0,
        })
        if category == "PCP":
            bucket["rain_mm"] = max(bucket["rain_mm"], _parse_kma_precipitation(value))
        elif category == "POP":
            pop = _to_float(value)
            bucket["rain_probability"] = max(bucket["rain_probability"] or 0, pop or 0)
        elif category == "WSD":
            wind = _to_float(value)
            bucket["wind_speed"] = max(bucket["wind_speed"] or 0, wind or 0)
        elif category == "REH":
            humidity = _to_float(value)
            bucket["humidity"] = max(bucket["humidity"] or 0, humidity or 0)
        elif category == "TMP":
            temps = bucket.setdefault("_temperatures", [])
            temp = _to_float(value)
            if temp is not None:
                temps.append(temp)
        elif category == "PTY":
            pty = _to_float(value)
            bucket["precipitation_type"] = max(bucket["precipitation_type"], int(pty or 0))

    today = datetime.now().date()
    summaries = []
    for summary in daily.values():
        summary_date = datetime.strptime(summary["date"], "%Y-%m-%d").date()
        if summary_date <= today:
            continue
        temperatures = summary.pop("_temperatures", [])
        if temperatures:
            summary["temperature"] = round(sum(temperatures) / len(temperatures), 1)
        summaries.append(summary)

    summaries.sort(key=lambda item: item["date"])
    return summaries[:periods]
