"""과거(일평균)·시간별 미세먼지 저장·조회와 시간별 예측 저장."""
from datetime import datetime, time, timedelta
from django.core.cache import cache
from django.utils import timezone
from dust.config import AIRKOREA_SERVICE_KEY, API_URL
from dust.external_api import public_api_get, REQUEST_TIMEOUT
from dust.ml.hourly_pm10 import build_ml_hourly_pm10_forecast
from dust.models import DustMeasurement, HourlyDustPrediction, RealtimeDustMeasurement
from dust.services.common import _parse_measure_date, _to_float
from dust.services.stations import _find_air_quality_station, _parse_airkorea_datetime, _parse_airkorea_response


PAST_API_FAILURE_TTL_SECONDS = 10 * 60


def _fetch_past_dust_items_by_station(station_name, start_date, end_date, allow_api=False):
    if not allow_api:
        return [], "External API calls are disabled for request-time reads."

    cache_key = f'airkorea_past_station_v1_{station_name}_{start_date:%Y%m%d}_{end_date:%Y%m%d}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached, None
    # 바로 전에 실패한 측정소는 잠깐 다시 부르지 않고 저장된 값으로만 응답한다(사용자가 매번 기다리지 않게).
    failure_key = f'airkorea_past_station_failed_v1_{station_name}'
    if cache.get(failure_key):
        return [], "AirKorea past request failed recently; skipped."

    params = {
        "serviceKey": AIRKOREA_SERVICE_KEY,
        "returnType": "json",
        "numOfRows": "1000",
        "pageNo": "1",
        "inqBginDt": start_date.strftime('%Y%m%d'),
        "inqEndDt": end_date.strftime('%Y%m%d'),
        "msrstnName": station_name,
    }
    try:
        response = public_api_get(API_URL, params=params, timeout=REQUEST_TIMEOUT)
        items, result, raw_error = _parse_airkorea_response(response)
        api_error = None
        if response.status_code >= 400 or raw_error:
            api_error = raw_error or result.get("resultMsg") or f"AirKorea status {response.status_code}"
        cache.set(cache_key, items, 60 * 60)
        return items, api_error
    except Exception as exc:
        cache.set(failure_key, True, PAST_API_FAILURE_TTL_SECONDS)
        return [], str(exc)


def _serialize_stored_measurement(measurement):
    date_text = measurement.measured_date.strftime('%Y%m%d')
    raw = measurement.raw_data or {}
    return {
        **raw,
        "msurDt": raw.get("msurDt") or date_text,
        "pm10Value": raw.get("pm10Value") if raw.get("pm10Value") not in (None, '') else measurement.pm10_value,
        "pm25Value": raw.get("pm25Value") if raw.get("pm25Value") not in (None, '') else measurement.pm25_value,
        "o3Value": raw.get("o3Value") if raw.get("o3Value") not in (None, '') else measurement.o3_value,
        "no2Value": raw.get("no2Value") if raw.get("no2Value") not in (None, '') else measurement.no2_value,
        "stationName": raw.get("stationName") or measurement.station_name,
        "source": "stored",
    }


def _store_past_dust_items(city, district, station_name, items):
    saved = 0
    for item in items:
        measured_date = _parse_measure_date(item.get('msurDt'))
        if not measured_date:
            continue
        DustMeasurement.objects.update_or_create(
            city=city,
            region=district,
            station_name=station_name,
            measured_date=measured_date,
            defaults={
                "pm10_value": _to_float(item.get('pm10Value')),
                "pm25_value": _to_float(item.get('pm25Value')),
                "o3_value": _to_float(item.get('o3Value')),
                "no2_value": _to_float(item.get('no2Value')),
                "raw_data": item,
            },
        )
        saved += 1
    return saved


def _load_stored_past_dust(city, district, station_name, start_date, end_date):
    start = _parse_measure_date(start_date)
    end = _parse_measure_date(end_date)
    if not start or not end:
        return []
    measurements = DustMeasurement.objects.filter(
        city=city,
        region=district,
        station_name=station_name,
        measured_date__gte=start,
        measured_date__lte=end,
    ).order_by('measured_date')
    return [_serialize_stored_measurement(measurement) for measurement in measurements]


def _average_measurement_values(measurements):
    totals = {"pm10Value": 0, "pm25Value": 0, "o3Value": 0, "no2Value": 0}
    counts = {"pm10Value": 0, "pm25Value": 0, "o3Value": 0, "no2Value": 0}
    field_map = {
        "pm10Value": "pm10_value",
        "pm25Value": "pm25_value",
        "o3Value": "o3_value",
        "no2Value": "no2_value",
    }

    for measurement in measurements:
        for output_key, field_name in field_map.items():
            value = getattr(measurement, field_name)
            if value is None:
                continue
            totals[output_key] += value
            counts[output_key] += 1

    return {
        key: round(totals[key] / counts[key], 3 if key in {"o3Value", "no2Value"} else 1)
        for key in totals
        if counts[key]
    }


def _load_stored_realtime_daily_dust(city, district, station_name, start_date, end_date):
    start = _parse_measure_date(start_date)
    end = _parse_measure_date(end_date)
    if not start or not end:
        return []

    station = _find_air_quality_station(city, station_name)
    if not station:
        return []

    local_tz = timezone.get_current_timezone()
    range_start = timezone.make_aware(datetime.combine(start, time.min), local_tz)
    range_end = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), local_tz)
    measurements = (
        RealtimeDustMeasurement.objects
        .filter(
            station=station,
            measured_at__gte=range_start,
            measured_at__lt=range_end,
        )
        .order_by('measured_at')
    )
    grouped = {}
    for measurement in measurements:
        measured_date = timezone.localtime(measurement.measured_at).date()
        grouped.setdefault(measured_date, []).append(measurement)

    items = []
    for measured_date in sorted(grouped):
        averages = _average_measurement_values(grouped[measured_date])
        if averages.get("pm10Value") is None:
            continue
        items.append({
            "msurDt": measured_date.isoformat(),
            "pm10Value": averages.get("pm10Value"),
            "pm25Value": averages.get("pm25Value"),
            "o3Value": averages.get("o3Value"),
            "no2Value": averages.get("no2Value"),
            "msrstnName": station.name,
            "stationName": station.name,
            "city": city,
            "region": district,
            "source": "stored_realtime_daily",
            "sampleCount": len(grouped[measured_date]),
        })
    return items


def _serialize_realtime_hourly_measurement(measurement, city, district, station):
    measured_at = timezone.localtime(measurement.measured_at)
    return {
        "measuredAt": measured_at.isoformat(),
        "date": measured_at.date().isoformat(),
        "hour": measured_at.strftime('%H:00'),
        "pm10Value": measurement.pm10_value,
        "pm25Value": measurement.pm25_value,
        "o3Value": measurement.o3_value,
        "no2Value": measurement.no2_value,
        "msrstnName": station.name,
        "stationName": station.name,
        "city": city,
        "region": district,
        "source": "stored_realtime_hourly",
    }


def _load_stored_realtime_hourly_dust(city, district, station_name, measured_date, station=None):
    station = station or _find_air_quality_station(city, station_name)
    if not station:
        return []

    local_tz = timezone.get_current_timezone()
    range_start = timezone.make_aware(datetime.combine(measured_date, time.min), local_tz)
    range_end = range_start + timedelta(days=1)
    measurements = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=range_start, measured_at__lt=range_end)
        .order_by('measured_at')
    )
    return [_serialize_realtime_hourly_measurement(measurement, city, district, station) for measurement in measurements]


def _load_recent_realtime_hourly_dust(city, district, station_name, hours=24, station=None):
    station = station or _find_air_quality_station(city, station_name)
    if not station:
        return []
    cutoff = timezone.now() - timedelta(hours=hours)
    measurements = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=cutoff)
        .order_by('measured_at')
    )
    return [_serialize_realtime_hourly_measurement(measurement, city, district, station) for measurement in measurements]


def _weather_factor_for_pm10(weather):
    if not weather:
        return 0

    rain_mm = _to_float(weather.get("rain_mm")) or 0
    rain_probability = _to_float(weather.get("rain_probability")) or 0
    wind_speed = _to_float(weather.get("wind_speed"))
    humidity = _to_float(weather.get("humidity"))
    precipitation_type = str(weather.get("precipitation_type") or "")

    factor = 0
    if rain_mm >= 5 or rain_probability >= 70 or precipitation_type not in ("", "0"):
        factor -= 8
    elif rain_mm > 0 or rain_probability >= 40:
        factor -= 4

    if wind_speed is not None:
        if wind_speed >= 5:
            factor -= 5
        elif wind_speed <= 1.2:
            factor += 4

    if humidity is not None:
        if humidity >= 85:
            factor += 3
        elif humidity <= 35:
            factor -= 2

    return max(-12, min(8, factor))


def _build_hourly_dust_forecast(items, weather_forecasts=None, hours=12, station=None, city="", district=""):
    usable = [item for item in items if _to_float(item.get("pm10Value")) is not None]
    if not usable:
        return []

    ml_forecast_items = build_ml_hourly_pm10_forecast(station, city, district, usable, weather_forecasts, hours=hours)
    if ml_forecast_items:
        return ml_forecast_items

    latest = usable[-1]
    latest_pm10 = _to_float(latest.get("pm10Value"))
    latest_pm25 = _to_float(latest.get("pm25Value"))
    latest_o3 = _to_float(latest.get("o3Value"))
    latest_no2 = _to_float(latest.get("no2Value"))
    latest_time = _parse_airkorea_datetime(latest.get("measuredAt")) or timezone.now()
    recent_pm10_values = [_to_float(item.get("pm10Value")) for item in usable[-6:]]
    recent_pm10_values = [value for value in recent_pm10_values if value is not None]
    short_values = recent_pm10_values[-3:] or recent_pm10_values
    short_avg = sum(short_values) / len(short_values) if short_values else latest_pm10 or 0
    long_avg = sum(recent_pm10_values) / len(recent_pm10_values) if recent_pm10_values else short_avg
    previous_pm10 = recent_pm10_values[-2] if len(recent_pm10_values) >= 2 else latest_pm10
    last_step_trend = 0 if previous_pm10 is None or latest_pm10 is None else latest_pm10 - previous_pm10
    window_trend = 0
    if len(recent_pm10_values) >= 4:
        earlier = recent_pm10_values[:len(recent_pm10_values) // 2]
        later = recent_pm10_values[len(recent_pm10_values) // 2:]
        window_trend = (sum(later) / len(later)) - (sum(earlier) / len(earlier))
    trend = max(-6, min(6, (last_step_trend * 0.55) + (window_trend * 0.45)))
    baseline = ((latest_pm10 or short_avg) * 0.62) + (short_avg * 0.25) + (long_avg * 0.13)

    forecast_items = []
    weather_forecasts = weather_forecasts or []
    weather_by_time = {f"{forecast.get('date')} {forecast.get('hour')}": forecast for forecast in weather_forecasts}
    for step in range(1, hours + 1):
        measured_at = timezone.localtime(latest_time + timedelta(hours=step))
        damping = max(0.15, 1 - (step * 0.07))
        weather_key = f"{measured_at.date().isoformat()} {measured_at.strftime('%H:00')}"
        weather_factor = _weather_factor_for_pm10(weather_by_time.get(weather_key))
        mean_reversion = (long_avg - baseline) * min(0.35, step * 0.035)
        pm10_value = max(0, baseline + trend * damping + weather_factor + mean_reversion)
        forecast_items.append({
            "measuredAt": measured_at.isoformat(),
            "date": measured_at.date().isoformat(),
            "hour": measured_at.strftime('%H:00'),
            "pm10Value": round(pm10_value, 1),
            "pm25Value": round(latest_pm25, 1) if latest_pm25 is not None else None,
            "o3Value": round(latest_o3, 3) if latest_o3 is not None else None,
            "no2Value": round(latest_no2, 3) if latest_no2 is not None else None,
            "source": "hourly_trend_forecast",
            "phase": "forecast",
            "weatherFactor": round(weather_factor, 1),
            "trend": round(trend, 1),
            "horizonHours": step,
            "baseline": round(baseline, 1),
            "modelName": "hourly_trend_weather_v1",
        })
    return forecast_items


def _store_hourly_dust_predictions(station, city, district, forecast_items):
    if not station or not forecast_items:
        return 0

    predicted_at = timezone.now().replace(minute=0, second=0, microsecond=0)
    saved = 0
    for item in forecast_items:
        pm10_predicted = _to_float(item.get("pm10Value"))
        target_at = _parse_airkorea_datetime(item.get("measuredAt"))
        if pm10_predicted is None or not target_at:
            continue

        HourlyDustPrediction.objects.update_or_create(
            station=station,
            target_at=target_at,
            predicted_at=predicted_at,
            model_name=item.get("modelName") or "hourly_trend_weather_v1",
            defaults={
                "city": city,
                "region": district,
                "horizon_hours": int(item.get("horizonHours") or 0),
                "pm10_predicted": pm10_predicted,
                "weather_factor": _to_float(item.get("weatherFactor")) or 0,
                "trend": _to_float(item.get("trend")) or 0,
                "raw_data": item,
            },
        )
        saved += 1
    return saved


def _merge_past_items(*item_groups):
    merged_by_date = {}
    for items in item_groups:
        for item in items:
            key = str(item.get('msurDt', '')).split()[0]
            if key and key not in merged_by_date:
                merged_by_date[key] = item
    return sorted(merged_by_date.values(), key=lambda item: str(item.get('msurDt', '')))


def _latest_past_item_date(items):
    latest = None
    for item in items:
        measured_date = _parse_measure_date(str(item.get('msurDt', '')).split()[0])
        if measured_date and (latest is None or measured_date > latest):
            latest = measured_date
    return latest
