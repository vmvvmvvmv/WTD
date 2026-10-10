from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Callable

import requests
from django.utils import timezone

from dust.models import AirQualityStation, DustNotificationLog, NotificationDevice, WeatherHourlyMeasurement
from dust.views import _current_station_location, _dfs_grid_from_lat_lng, _find_air_quality_station, _resolve_station_name


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
    # 일정 제목은 서버에 두지 않으므로 시간만 안내한다(예전 데이터에 title이 남아 있어도 쓰지 않는다).
    return str(event.get("time") or "").strip()[:5]


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
    return _find_air_quality_station(city, station_name)


def _grid_for_region(city: str, region: str) -> dict | None:
    station = _station_for_region(city, region)
    if not station:
        return None
    location = _current_station_location(station.sido, station.name)
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
        return ""
    low = round(min(values))
    high = round(max(values))
    if low == high:
        return f"\uc608\uc0c1 \uae30\uc628 {low}\u00b0C"
    return f"\uc608\uc0c1 \uae30\uc628 {low}~{high}\u00b0C"


def _rain_text(points: list[WeatherHourlyMeasurement]) -> str:
    if not points:
        return "비가 올 수 있어요"
    probabilities = [point.rain_probability for point in points if point.rain_probability is not None]
    probability = max(probabilities) if probabilities else None
    range_text = _time_range(points)
    if probability is not None and range_text:
        return f"{range_text} 강수 확률 {round(probability)}%예요"
    if range_text:
        return f"{range_text} 비가 올 수 있어요"
    if probability is not None:
        return f"강수 확률 {round(probability)}%예요"
    return "비가 올 수 있어요"


def build_weather_morning_body(target_date: date, risk: WeatherRisk, events: list[dict]) -> str:
    date_text = _date_label(target_date)
    event_text = ", ".join(filter(None, (_event_label(event) for event in events)))
    prefix = f"{event_text} 일정이 있어요. " if event_text else ""
    rain_text = _rain_text(risk.rain_points)
    temperature_text = _temperature_text(risk.points)

    def with_temperature(body: str) -> str:
        return f"{body}\n{temperature_text}" if temperature_text else body

    if risk.has_snow_cold and risk.has_rain:
        return with_temperature(f"{prefix}{date_text}에는 기온이 낮고 비 예보도 있어요. {rain_text}. 우산과 따뜻한 겉옷을 챙기세요.")
    if risk.has_snow_cold and risk.has_wind:
        return with_temperature(f"{prefix}{date_text}에는 기온이 낮거나 눈이 올 수 있고 바람도 강해요. 따뜻한 방풍 겉옷을 챙기세요.")
    if risk.has_snow_cold:
        return with_temperature(f"{prefix}{date_text}에는 기온이 낮거나 눈이 올 수 있어요. 따뜻한 겉옷을 챙기세요.")
    if risk.has_thunder:
        return with_temperature(f"{prefix}{date_text}에는 천둥·번개가 예상돼요. 야외 활동은 잠시 미루세요.")
    if risk.has_rain and risk.has_wind:
        return with_temperature(f"{prefix}{date_text}에는 비와 강한 바람이 예상돼요. {rain_text}. 우산과 바람막이를 챙기세요.")
    if risk.has_rain:
        return with_temperature(f"{prefix}{date_text} {rain_text}. 우산을 챙기세요.")
    if risk.has_wind:
        return with_temperature(f"{prefix}{date_text}에는 바람이 강해요. 바람막이를 챙기세요.")
    if risk.has_heat:
        return with_temperature(f"{prefix}{date_text}에는 기온이 높아요. 물과 양산을 챙기고 한낮에는 쉬어 가세요.")
    if event_text:
        return with_temperature(f"{prefix}{date_text} 날씨는 무난해요. 출발 전에 필요한 물건만 확인하세요.")
    return with_temperature(f"{date_text}에는 큰 날씨 변화가 없어요.")


class ExpoDeviceNotRegistered(RuntimeError):
    """앱 삭제·토큰 만료로 다시 보내도 성공할 수 없는 기기."""


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
        details = ticket.get("details") if isinstance(ticket, dict) else None
        if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
            raise ExpoDeviceNotRegistered(f"Expo push failed: {response_data}")
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
        title = "오늘 날씨와 일정"
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
        except ExpoDeviceNotRegistered:
            # 매일 실패를 반복하지 않도록 끄고, 더 쓰지 않을 일정 요약도 비운다.
            failed += 1
            device.enabled = False
            device.calendar_events = []
            device.save(update_fields=["enabled", "calendar_events", "updated_at"])
            write(f"Expo device is no longer registered; disabled device for {city} {region}.")
            continue
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
