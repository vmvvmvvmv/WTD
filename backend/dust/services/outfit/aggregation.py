import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from django.utils import timezone

from .constants import DATA_GAP_LABELS, HEAVY_RAIN_MM, SHORT_SCHEDULE_HOURS, SUSTAINED_RAIN_RATIO


@dataclass(frozen=True)
class WeatherPoint:
    temperature: float | None = None
    wind_speed: float | None = None
    rain_mm: float | None = None
    rain_probability: float | None = None
    precipitation_type: str = ""
    label: str = ""
    measured_at: datetime | None = None


@dataclass(frozen=True)
class AirPoint:
    pm10: float | None = None
    pm25: float | None = None


def wind_chill(temperature: float, wind_speed_ms: float | None) -> float:
    if temperature > 10 or wind_speed_ms is None or wind_speed_ms < 1.3:
        # TODO(확인 필요): 여름철 체감온도 공식을 정하기 전까지 실제 기온을 사용한다.
        return temperature
    wind_kmh = wind_speed_ms * 3.6
    return 13.12 + 0.6215 * temperature - 11.37 * (wind_kmh ** 0.16) + 0.3965 * temperature * (wind_kmh ** 0.16)


def _numbers(values: Iterable[float | None]) -> list[float]:
    return [float(value) for value in values if value is not None and math.isfinite(float(value))]


def _precipitation_flags(point: WeatherPoint) -> tuple[bool, bool]:
    precipitation_type = str(point.precipitation_type or "").strip()
    label = str(point.label or "")
    has_snow = "눈" in label or precipitation_type in {"2", "3", "6", "7"}
    has_rain = (
        "비" in label
        or precipitation_type in {"1", "2", "4", "5", "6"}
        or (point.rain_mm is not None and point.rain_mm > 0)
    )
    return has_snow, has_rain


def _is_rainy(point: WeatherPoint, has_rain: bool) -> bool:
    return has_rain or (point.rain_probability is not None and point.rain_probability >= 60)


def _hour_label(value: datetime) -> str:
    return timezone.localtime(value).strftime("%H:00") if timezone.is_aware(value) else value.strftime("%H:00")


def rain_condition(rain_hours: int, total_hours: int, rain_mm_max: float | None, window_hours: float | None) -> str | None:
    """비가 있으면 옷까지 바꿀 비(rain)인지, 우산만 챙길 잠깐 비(showers)인지 고른다."""
    if rain_hours <= 0:
        return None
    short_schedule = window_hours is not None and window_hours <= SHORT_SCHEDULE_HOURS
    heavy = rain_mm_max is not None and rain_mm_max >= HEAVY_RAIN_MM
    sustained = total_hours > 0 and rain_hours / total_hours >= SUSTAINED_RAIN_RATIO
    return "rain" if short_schedule or heavy or sustained else "showers"


def aggregate_schedule_window(
    weather_points: list[WeatherPoint],
    air_points: list[AirPoint],
    window: tuple[datetime, datetime] | None = None,
) -> dict:
    feels = _numbers(wind_chill(point.temperature, point.wind_speed) if point.temperature is not None else None for point in weather_points)
    rain_probabilities = _numbers(point.rain_probability for point in weather_points)
    rain_amounts = _numbers(point.rain_mm for point in weather_points)
    winds = _numbers(point.wind_speed for point in weather_points)
    pm10_values = _numbers(point.pm10 for point in air_points)
    pm25_values = _numbers(point.pm25 for point in air_points)
    precipitation_flags = [_precipitation_flags(point) for point in weather_points]
    has_snow = any(snow for snow, _rain in precipitation_flags)
    has_rain = any(rain for _snow, rain in precipitation_flags)
    # 비 시간 비율은 일정 시간대에 걸친 시각만 센다(앞뒤 1시간 여유분은 기온 집계에만 쓴다).
    in_window = [
        (point, rain)
        for point, (_snow, rain) in zip(weather_points, precipitation_flags)
        if window is None or point.measured_at is None or window[0] - timedelta(hours=1) < point.measured_at < window[1]
    ] or list(zip(weather_points, (rain for _snow, rain in precipitation_flags)))
    rainy_times = sorted(point.measured_at for point, rain in in_window if _is_rainy(point, rain) and point.measured_at is not None)
    rain_hours = sum(1 for point, rain in in_window if _is_rainy(point, rain))
    window_hours = (window[1] - window[0]).total_seconds() / 3600 if window else None
    gaps = []
    if not feels:
        gaps.append(DATA_GAP_LABELS["temperature"])
    if not rain_probabilities and not rain_amounts:
        gaps.append(DATA_GAP_LABELS["rain"])
    if not winds:
        gaps.append(DATA_GAP_LABELS["wind"])
    if not pm10_values:
        gaps.append(DATA_GAP_LABELS["pm10"])
    if not pm25_values:
        gaps.append(DATA_GAP_LABELS["pm25"])
    feels_min = min(feels) if feels else None
    feels_max = max(feels) if feels else None
    wind_max = max(winds) if winds else None
    rain_prob_max = max(rain_probabilities) if rain_probabilities else None
    rain_mm_max = max(rain_amounts) if rain_amounts else None
    rain_kind = rain_condition(rain_hours, len(in_window), rain_mm_max, window_hours)
    if has_snow:
        weather_condition = "snow"
    elif rain_kind == "rain":
        weather_condition = "rain"
    elif rain_kind == "showers" and not (wind_max is not None and wind_max >= 9):
        weather_condition = "showers"
    elif wind_max is not None and wind_max >= 9:
        weather_condition = "strong_wind"
    else:
        weather_condition = "normal"
    return {
        "feels_min": round(feels_min, 1) if feels_min is not None else None,
        "feels_max": round(feels_max, 1) if feels_max is not None else None,
        "feels_avg": round(sum(feels) / len(feels), 1) if feels else None,
        "temp_range": round(feels_max - feels_min, 1) if feels_min is not None and feels_max is not None else None,
        "rain_prob_max": round(rain_prob_max, 1) if rain_prob_max is not None else None,
        "rain_mm_max": round(rain_mm_max, 1) if rain_mm_max is not None else None,
        "wind_max": round(wind_max, 1) if wind_max is not None else None,
        "has_snow": has_snow,
        "has_rain": has_rain,
        "rain_hours": rain_hours,
        "total_hours": len(in_window),
        "rain_start": _hour_label(rainy_times[0]) if rainy_times else None,
        "rain_end": _hour_label(rainy_times[-1] + timedelta(hours=1)) if rainy_times else None,
        "weather_condition": weather_condition,
        "pm10_max": round(max(pm10_values), 1) if pm10_values else None,
        "pm25_max": round(max(pm25_values), 1) if pm25_values else None,
        "data_gaps": gaps,
    }
