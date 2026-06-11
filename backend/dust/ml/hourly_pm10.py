import math
import os
from datetime import datetime
from datetime import timedelta

import joblib
import pandas as pd
from django.conf import settings
from django.utils import timezone

from dust.models import RealtimeDustMeasurement, WeatherHourlyMeasurement


MODEL_NAME = "hist_gradient_boosting_pm10_v1"
DEFAULT_MODEL_PATH = os.path.join(settings.BASE_DIR, "models", "hourly_dust_pm10_model.joblib")

_MODEL_BUNDLE = None
_MODEL_BUNDLE_MTIME = None


def _hour_key(value):
    return timezone.localtime(value).replace(minute=0, second=0, microsecond=0)


def _to_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_datetime(value):
    if not value:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _dfs_grid_from_lat_lng(lat, lng):
    re = 6371.00877
    grid = 5.0
    slat1 = 30.0
    slat2 = 60.0
    olon = 126.0
    olat = 38.0
    xo = 43
    yo = 136
    degrad = math.pi / 180.0

    re_grid = re / grid
    slat1_rad = slat1 * degrad
    slat2_rad = slat2 * degrad
    olon_rad = olon * degrad
    olat_rad = olat * degrad

    sn = math.tan(math.pi * 0.25 + slat2_rad * 0.5) / math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sn = math.log(math.cos(slat1_rad) / math.cos(slat2_rad)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1_rad * 0.5)
    sf = (sf ** sn) * math.cos(slat1_rad) / sn
    ro = math.tan(math.pi * 0.25 + olat_rad * 0.5)
    ro = re_grid * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * degrad * 0.5)
    ra = re_grid * sf / (ra ** sn)
    theta = lng * degrad - olon_rad
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    return {"nx": int(ra * math.sin(theta) + xo + 0.5), "ny": int(ro - ra * math.cos(theta) + yo + 0.5)}


def _avg(values):
    usable = [value for value in values if value is not None]
    if not usable:
        return None
    return sum(usable) / len(usable)


def _num(value, digits=3):
    if value is None:
        return None
    return round(float(value), digits)


def _sin_cos(value, period):
    radians = 2 * math.pi * float(value) / float(period)
    return round(math.sin(radians), 6), round(math.cos(radians), 6)


def _wind_features(direction):
    if direction is None:
        return None, None
    return _sin_cos(direction, 360)


def _model_path():
    return os.getenv("HOURLY_DUST_MODEL_PATH") or DEFAULT_MODEL_PATH


def load_hourly_pm10_model():
    global _MODEL_BUNDLE
    global _MODEL_BUNDLE_MTIME

    path = _model_path()
    if not os.path.exists(path):
        return None

    mtime = os.path.getmtime(path)
    if _MODEL_BUNDLE is None or _MODEL_BUNDLE_MTIME != mtime:
        _MODEL_BUNDLE = joblib.load(path)
        _MODEL_BUNDLE_MTIME = mtime
    return _MODEL_BUNDLE


def _weather_values(weather):
    if not weather:
        return {
            "temperature": None,
            "humidity": None,
            "wind_speed": None,
            "wind_direction": None,
            "wind_direction_sin": None,
            "wind_direction_cos": None,
            "rain_mm": None,
            "rain_probability": None,
            "sky": "",
            "precipitation_type": "",
        }

    if isinstance(weather, dict):
        wind_direction = _to_float(weather.get("wind_direction"))
        wind_sin, wind_cos = _wind_features(wind_direction)
        return {
            "temperature": _to_float(weather.get("temperature")),
            "humidity": _to_float(weather.get("humidity")),
            "wind_speed": _to_float(weather.get("wind_speed")),
            "wind_direction": wind_direction,
            "wind_direction_sin": wind_sin,
            "wind_direction_cos": wind_cos,
            "rain_mm": _to_float(weather.get("rain_mm")),
            "rain_probability": _to_float(weather.get("rain_probability")),
            "sky": weather.get("sky") or "",
            "precipitation_type": weather.get("precipitation_type") or "",
        }

    wind_sin, wind_cos = _wind_features(weather.wind_direction)
    return {
        "temperature": _num(weather.temperature),
        "humidity": _num(weather.humidity),
        "wind_speed": _num(weather.wind_speed),
        "wind_direction": _num(weather.wind_direction),
        "wind_direction_sin": wind_sin,
        "wind_direction_cos": wind_cos,
        "rain_mm": _num(weather.rain_mm),
        "rain_probability": _num(weather.rain_probability),
        "sky": weather.sky,
        "precipitation_type": weather.precipitation_type,
    }


def _prefixed_weather(prefix, weather):
    values = _weather_values(weather)
    return {f"{prefix}_{key}": value for key, value in values.items()}


def _weather_forecast_map(weather_forecasts):
    mapped = {}
    for weather in weather_forecasts or []:
        date_value = weather.get("date")
        hour_value = weather.get("hour")
        if not date_value or not hour_value:
            continue
        mapped[f"{date_value} {hour_value}"] = weather
    return mapped


def _stored_weather_map(station, start_at, end_at):
    if not station:
        return {}
    grid = _dfs_grid_from_lat_lng(station.lat, station.lng)
    rows = WeatherHourlyMeasurement.objects.filter(
        nx=grid["nx"],
        ny=grid["ny"],
        measured_at__gte=start_at,
        measured_at__lte=end_at,
    )
    return {_hour_key(row.measured_at): row for row in rows}


def _measurement_map(station, latest_time):
    cutoff = latest_time - timedelta(days=30)
    rows = RealtimeDustMeasurement.objects.filter(
        station=station,
        measured_at__gte=cutoff,
        measured_at__lte=latest_time,
        pm10_value__isnull=False,
    ).order_by("measured_at")
    return {_hour_key(row.measured_at): row.pm10_value for row in rows}


def build_ml_hourly_pm10_forecast(station, city, region, items, weather_forecasts=None, hours=12):
    bundle = load_hourly_pm10_model()
    if not bundle or not station:
        return []

    model = bundle.get("model")
    feature_columns = bundle.get("feature_columns") or []
    if not model or not feature_columns:
        return []

    usable = [item for item in items if _to_float(item.get("pm10Value")) is not None]
    if not usable:
        return []

    latest = usable[-1]
    latest_time = _parse_datetime(latest.get("measuredAt")) or timezone.now()
    latest_time = _hour_key(latest_time)
    latest_pm10 = _to_float(latest.get("pm10Value"))
    latest_pm25 = _to_float(latest.get("pm25Value"))
    latest_o3 = _to_float(latest.get("o3Value"))
    latest_no2 = _to_float(latest.get("no2Value"))

    pm10_by_time = _measurement_map(station, latest_time)
    for item in usable:
        measured_at = _parse_datetime(item.get("measuredAt"))
        pm10_value = _to_float(item.get("pm10Value"))
        if measured_at and pm10_value is not None:
            pm10_by_time[_hour_key(measured_at)] = pm10_value

    stored_weather = _stored_weather_map(station, latest_time - timedelta(hours=1), latest_time + timedelta(hours=hours))
    forecast_weather = _weather_forecast_map(weather_forecasts)

    current_weather = stored_weather.get(latest_time) or forecast_weather.get(
        f"{latest_time.date().isoformat()} {latest_time.strftime('%H:00')}"
    )
    rows = []
    forecast_meta = []
    for horizon in range(1, hours + 1):
        target_at = latest_time + timedelta(hours=horizon)
        target_weather = stored_weather.get(target_at) or forecast_weather.get(
            f"{target_at.date().isoformat()} {target_at.strftime('%H:00')}"
        )

        lag_1h = pm10_by_time.get(latest_time - timedelta(hours=1))
        lag_2h = pm10_by_time.get(latest_time - timedelta(hours=2))
        lag_3h = pm10_by_time.get(latest_time - timedelta(hours=3))
        history_3h = [pm10_by_time.get(latest_time - timedelta(hours=offset)) for offset in range(1, 4)]
        history_6h = [pm10_by_time.get(latest_time - timedelta(hours=offset)) for offset in range(1, 7)]
        history_24h = [pm10_by_time.get(latest_time - timedelta(hours=offset)) for offset in range(1, 25)]
        history_7d = [
            value for measured_at, value in pm10_by_time.items()
            if latest_time - timedelta(days=7) <= measured_at < latest_time
        ]
        history_30d = [
            value for measured_at, value in pm10_by_time.items()
            if latest_time - timedelta(days=30) <= measured_at < latest_time
        ]

        target_hour_sin, target_hour_cos = _sin_cos(target_at.hour, 24)
        target_dow = target_at.weekday()
        target_dow_sin, target_dow_cos = _sin_cos(target_dow, 7)
        target_doy = target_at.timetuple().tm_yday
        target_doy_sin, target_doy_cos = _sin_cos(target_doy, 366)

        row = {
            "station_id": station.id,
            "city": city,
            "region": region,
            "horizon_hours": horizon,
            "current_pm10": latest_pm10,
            "pm10_lag_1h": lag_1h,
            "pm10_lag_2h": lag_2h,
            "pm10_lag_3h": lag_3h,
            "pm10_avg_3h": _avg(history_3h),
            "pm10_avg_6h": _avg(history_6h),
            "pm10_avg_24h": _avg(history_24h),
            "pm10_delta_1h": latest_pm10 - lag_1h if lag_1h is not None else None,
            "pm10_delta_3h": latest_pm10 - lag_3h if lag_3h is not None else None,
            "station_avg_7d": _avg(history_7d),
            "station_avg_30d": _avg(history_30d),
            "target_hour": target_at.hour,
            "target_hour_sin": target_hour_sin,
            "target_hour_cos": target_hour_cos,
            "target_day_of_week": target_dow,
            "target_day_of_week_sin": target_dow_sin,
            "target_day_of_week_cos": target_dow_cos,
            "target_is_weekend": 1 if target_dow >= 5 else 0,
            "target_day_of_year": target_doy,
            "target_day_of_year_sin": target_doy_sin,
            "target_day_of_year_cos": target_doy_cos,
            "target_month": target_at.month,
            **_prefixed_weather("current_weather", current_weather),
            **_prefixed_weather("target_weather", target_weather),
        }
        rows.append({column: row.get(column) for column in feature_columns})
        forecast_meta.append(target_at)

    if not rows:
        return []

    predictions = model.predict(pd.DataFrame(rows, columns=feature_columns))
    forecast_items = []
    for horizon, (target_at, prediction) in enumerate(zip(forecast_meta, predictions), start=1):
        pm10_value = max(0, float(prediction))
        forecast_items.append({
            "measuredAt": target_at.isoformat(),
            "date": target_at.date().isoformat(),
            "hour": target_at.strftime("%H:00"),
            "pm10Value": round(pm10_value, 1),
            "pm25Value": round(latest_pm25, 1) if latest_pm25 is not None else None,
            "o3Value": round(latest_o3, 3) if latest_o3 is not None else None,
            "no2Value": round(latest_no2, 3) if latest_no2 is not None else None,
            "source": "hourly_ml_forecast",
            "phase": "forecast",
            "weatherFactor": 0,
            "trend": 0,
            "horizonHours": horizon,
            "baseline": None,
            "modelName": bundle.get("report", {}).get("model_name") or MODEL_NAME,
        })
    return forecast_items
