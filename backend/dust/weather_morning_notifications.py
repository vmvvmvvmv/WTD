from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Callable

import requests
from django.utils import timezone

from dust.models import AirQualityStation, DustNotificationLog, NotificationDevice, WeatherHourlyMeasurement
from dust.views import _current_station_location, _dfs_grid_from_lat_lng, _resolve_station_name


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
RAIN_PROBABILITY_THRESHOLD = 60
LOW_TEMPERATURE_THRESHOLD = 0
HIGH_TEMPERATURE_THRESHOLD = 30
VERY_HIGH_TEMPERATURE_THRESHOLD = 33
STRONG_WIND_THRESHOLD = 8
NOTIFICATION_TYPE = "weather_morning"


@dataclass(frozen=True)
class WeatherMorningResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0


@dataclass(frozen=True)
class WeatherRisk:
    points: list[WeatherHourlyMeasurement]
    rain_points: list[WeatherHourlyMeasurement]
    snow_cold_points: list[WeatherHourlyMeasurement]
    wind_points: list[WeatherHourlyMeasurement]
    thunder_points: list[WeatherHourlyMeasurement]
    heat_points: list[WeatherHourlyMeasurement]

    @property
    def has_rain(self) -> bool:
        return bool(self.rain_points)

    @property
    def has_snow_cold(self) -> bool:
        return bool(self.snow_cold_points)

    @property
    def has_wind(self) -> bool:
        return bool(self.wind_points)

    @property
    def has_thunder(self) -> bool:
        return bool(self.thunder_points)

    @property
    def has_heat(self) -> bool:
        return bool(self.heat_points)


def parse_target_date(value: str | None) -> date:
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return timezone.localdate()


def _date_label(value: date) -> str:
    return f"{value.month}\uc6d4 {value.day}\uc77c"


def _event_label(event: dict) -> str:
    title = str(event.get("title") or "").strip()
    time_text = str(event.get("time") or "").strip()
    if not title:
        return ""
    return f"[{title}]" if not time_text else f"[{title} {time_text}]"


def events_for_date(device: NotificationDevice, target_date: date) -> list[dict]:
    target = target_date.isoformat()
    events = []
    for event in device.calendar_events or []:
        if isinstance(event, dict) and str(event.get("date") or "")[:10] == target:
            events.append(event)
    return events[:3]


def _station_for_region(city: str, region: str) -> AirQualityStation | None:
    station_name = _resolve_station_name(city, region)
    if not station_name:
        return None
    return AirQualityStation.objects.filter(sido=city, station_name=station_name).first()


def _grid_for_region(city: str, region: str) -> dict | None:
    station = _station_for_region(city, region)
    if not station:
        return None
    location = _current_station_location(station.sido, station.station_name)
    if not location:
        return None
    return _dfs_grid_from_lat_lng(location["lat"], location["lng"])


def _is_rain(point: WeatherHourlyMeasurement) -> bool:
    label = point.label or ""
    pty = str(point.precipitation_type or "").strip()
    return (
        "\ube44" in label
        or pty in {"1", "4", "5", "6"}
        or (point.rain_mm is not None and point.rain_mm > 0)
        or (point.rain_probability is not None and point.rain_probability >= RAIN_PROBABILITY_THRESHOLD)
    )


def _is_snow_or_cold(point: WeatherHourlyMeasurement) -> bool:
    label = point.label or ""
    pty = str(point.precipitation_type or "").strip()
    return "\ub208" in label or pty in {"2", "3", "6", "7"} or (point.temperature is not None and point.temperature <= LOW_TEMPERATURE_THRESHOLD)


def _is_windy(point: WeatherHourlyMeasurement) -> bool:
    return point.wind_speed is not None and point.wind_speed >= STRONG_WIND_THRESHOLD


def _is_thunder(point: WeatherHourlyMeasurement) -> bool:
    label = point.label or ""
    lower_label = label.lower()
    return (
        "\ucc9c\ub465" in label
        or "\ubc88\uac1c" in label
        or "\ub099\ub8b0" in label
        or "\ub1cc\uc6b0" in label
        or "thunder" in lower_label
        or "lightning" in lower_label
        or "storm" in lower_label
    )


def _is_heat(point: WeatherHourlyMeasurement) -> bool:
    return point.temperature is not None and point.temperature >= HIGH_TEMPERATURE_THRESHOLD


def weather_risk_for_region(city: str, region: str, target_date: date) -> WeatherRisk | None:
    grid = _grid_for_region(city, region)
    if not grid:
        return None
    start = timezone.make_aware(datetime.combine(target_date, time.min))
    end = start + timedelta(days=1)
    points = list(
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gte=start, measured_at__lt=end)
        .order_by("measured_at")
    )
    if not points:
        return None
    return WeatherRisk(
        points=points,
        rain_points=[point for point in points if _is_rain(point)],
        snow_cold_points=[point for point in points if _is_snow_or_cold(point)],
        wind_points=[point for point in points if _is_windy(point)],
        thunder_points=[point for point in points if _is_thunder(point)],
        heat_points=[point for point in points if _is_heat(point)],
    )


def _time_range(points: list[WeatherHourlyMeasurement]) -> str:
    if not points:
        return ""
    first = timezone.localtime(points[0].measured_at)
    end = timezone.localtime(points[-1].measured_at) + timedelta(hours=1)
    return f"{first:%H}:00~{end:%H}:00"


def _temperature_text(points: list[WeatherHourlyMeasurement]) -> str:
    values = [point.temperature for point in points if point.temperature is not None]
    if not values:
        return "\uace0\uc628 \uc608\ubcf4"
    return f"\uc608\uc0c1 \uae30\uc628 {round(max(values))}\u00b0C"


def _rain_text(points: list[WeatherHourlyMeasurement]) -> str:
    if not points:
        return "\ube44 \uc608\ubcf4"
    probabilities = [point.rain_probability for point in points if point.rain_probability is not None]
    probability = max(probabilities) if probabilities else None
    range_text = _time_range(points)
    if probability is not None and range_text:
        return f"{range_text} \uac15\uc218 \ud655\ub960 {round(probability)}%"
    if range_text:
        return f"{range_text} \ube44 \uc608\uc0c1"
    if probability is not None:
        return f"\uac15\uc218 \ud655\ub960 {round(probability)}%"
    return "\ube44 \uc608\ubcf4"


def build_weather_morning_body(target_date: date, risk: WeatherRisk, events: list[dict]) -> str:
    date_text = _date_label(target_date)
    event_text = ", ".join(filter(None, (_event_label(event) for event in events)))
    prefix = f"{event_text} \uc77c\uc815\uc774 \uc788\ub294 \ub0a0\uc778\ub370 " if event_text else ""
    suffix = " \uc77c\uc815 \ud655\uc778\ud574\uc8fc\uc138\uc694." if not event_text else " \uc900\ube44\ubb3c\uc744 \ud655\uc778\ud574\uc8fc\uc138\uc694."
    rain_text = _rain_text(risk.rain_points)
    heat_text = _temperature_text(risk.heat_points)

    if risk.has_thunder:
        return f"{prefix}{date_text} \ucc9c\ub465\u00b7\ubc88\uac1c \uac00\ub2a5\uc131\uc774 \uc788\uc5b4\uc694. \uc57c\uc678 \ud65c\ub3d9\uc740 \ud53c\ud558\uace0 \uc2e4\ub0b4\ub85c \uc774\ub3d9\ud558\ub294 \uac8c \uc88b\uc544\uc694."
    if risk.has_snow_cold and risk.has_rain:
        return f"{prefix}{date_text} \ucd94\uc704\uc640 \ube44 \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. {rain_text}. \uc6b0\uc0b0\uacfc \ub530\ub73b\ud55c \uc637\uc744 \ucc59\uae30\uace0{suffix}"
    if risk.has_rain and risk.has_wind:
        return f"{prefix}{date_text} \ube44\uc640 \uac15\ud48d \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. {rain_text}. \uc678\ucd9c \uc804{suffix}"
    if risk.has_snow_cold and risk.has_wind:
        return f"{prefix}{date_text} \ub208\u00b7\uc800\uc628\uacfc \uac15\ud48d \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. \ub530\ub73b\ud558\uac8c \uc785\uace0 \uc57c\uc678 \uc77c\uc815\uc740 \uc870\uc2ec\ud574\uc8fc\uc138\uc694."
    if risk.has_snow_cold:
        return f"{prefix}{date_text} \ub208\u00b7\uc800\uc628 \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. \ub530\ub73b\ud558\uac8c \uc785\uace0{suffix}"
    if risk.has_heat:
        return f"{prefix}{date_text} \ub9ce\uc774 \ub354\uc6cc\uc694. {heat_text}. \ubb3c\uc744 \ucc59\uae30\uace0 \ud55c\ub0ae \uc57c\uc678\ud65c\ub3d9\uc740 \uc904\uc774\ub294 \uac8c \uc88b\uc544\uc694."
    if risk.has_rain:
        return f"{prefix}{date_text} \ube44 \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. {rain_text}.{suffix}"
    if risk.has_wind:
        return f"{prefix}{date_text} \uac15\ud48d \uc608\ubcf4\uac00 \uc788\uc5b4\uc694. \uc57c\uc678 \uc77c\uc815\uc774 \uc788\uc73c\uba74 \ubbf8\ub9ac \ud655\uc778\ud574\uc8fc\uc138\uc694."
    if event_text:
        return f"{prefix}{date_text} \ub0a0\uc528\uac00 \ub300\uccb4\ub85c \uad1c\ucc2e\uc544\uc694. \uadf8\ub798\ub3c4 \ub098\uac00\uae30 \uc804 \uc77c\uc815\uacfc \uc900\ube44\ubb3c\uc744 \ud655\uc778\ud574\uc8fc\uc138\uc694."
    return f"{date_text} \ub0a0\uc528\uac00 \ub300\uccb4\ub85c \uad1c\ucc2e\uc544\uc694. \uc624\ub298 \uc77c\uc815\uc774 \uc788\ub2e4\uba74 \uac00\ubccd\uac8c \ud655\uc778\ud574\uc8fc\uc138\uc694."


def send_expo_push(token: str, title: str, body: str, data: dict) -> None:
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "channelId": "dust-alerts",
        "sound": "default",
        "priority": "high",
        "data": data,
    }
    response = requests.post(EXPO_PUSH_URL, json=payload, timeout=10)
    response.raise_for_status()
    response_data = response.json()
    ticket = response_data.get("data") if isinstance(response_data, dict) else None
    if not isinstance(ticket, dict) or ticket.get("status") != "ok":
        raise RuntimeError(f"Expo push failed: {response_data}")


def send_weather_morning_notifications(target_date: date, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> WeatherMorningResult:
    write = write or (lambda _message: None)
    sent = 0
    skipped = 0
    failed = 0
    devices = NotificationDevice.objects.filter(enabled=True, weather_morning_alerts=True)

    for device in devices:
        city = device.city
        region = device.region
        if not city or not region:
            skipped += 1
            continue
        risk = weather_risk_for_region(city, region, target_date)
        if not risk:
            skipped += 1
            continue
        basis_key = target_date.strftime("%Y%m%d")
        if not force and DustNotificationLog.objects.filter(
            device=device,
            notification_type=NOTIFICATION_TYPE,
            city=city,
            region=region,
            basis_key=basis_key,
        ).exists():
            skipped += 1
            continue

        events = events_for_date(device, target_date)
        title = f"{region} \uc544\uce68 \ub0a0\uc528 \uc54c\ub9bc"
        body = build_weather_morning_body(target_date, risk, events)
        if dry_run:
            write(f"[dry-run] {title} - {body}")
            sent += 1
            continue

        try:
            send_expo_push(device.expo_push_token, title, body, {
                "type": NOTIFICATION_TYPE,
                "city": city,
                "region": region,
                "date": target_date.isoformat(),
                "hasEvents": bool(events),
            })
        except Exception as exc:
            failed += 1
            write(f"Expo push request failed for {city} {region}: {exc}")
            continue

        DustNotificationLog.objects.update_or_create(
            device=device,
            notification_type=NOTIFICATION_TYPE,
            city=city,
            region=region,
            basis_key=basis_key,
            defaults={"pm10_value": None},
        )
        device.last_sent_at = timezone.now()
        device.save(update_fields=["last_sent_at", "updated_at"])
        sent += 1

    return WeatherMorningResult(sent=sent, failed=failed, skipped=skipped)
