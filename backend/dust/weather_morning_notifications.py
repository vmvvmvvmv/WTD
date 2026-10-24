from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Callable

import requests
from django.utils import timezone

from dust.models import AirQualityStation, DustNotificationLog, NotificationDevice, WeatherHourlyMeasurement
from dust.services.common import _dfs_grid_from_lat_lng
from dust.services.stations import _current_station_location, _find_air_quality_station, _resolve_station_name


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
RAIN_PROBABILITY_THRESHOLD = 60
LOW_TEMPERATURE_THRESHOLD = 0
HIGH_TEMPERATURE_THRESHOLD = 30
STRONG_WIND_THRESHOLD = 8
NOTIFICATION_TYPE = "weather_morning"


@dataclass(frozen=True)
class WeatherMorningResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0


def parse_target_date(value: str | None) -> date:
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return timezone.localdate()


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
        or pty in {"1", "2", "4", "5", "6"}
        or (point.rain_mm is not None and point.rain_mm > 0)
        or (point.rain_probability is not None and point.rain_probability >= RAIN_PROBABILITY_THRESHOLD)
    )


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


def _is_snow(point: WeatherHourlyMeasurement) -> bool:
    label = point.label or ""
    pty = str(point.precipitation_type or "").strip()
    return "눈" in label or pty in {"2", "3", "6", "7"}


def weather_points_for_region(city: str, region: str, target_date: date, from_time: datetime | None = None) -> list[WeatherHourlyMeasurement] | None:
    """그날 시간별 예보. from_time을 주면 그 시각(정시) 이후만 — 아침에 보낼 때 지난 새벽 시간은 빼려고."""
    grid = _grid_for_region(city, region)
    if not grid:
        return None
    start = timezone.make_aware(datetime.combine(target_date, time.min))
    if from_time is not None:
        start = max(start, timezone.localtime(from_time).replace(minute=0, second=0, microsecond=0))
    end = timezone.make_aware(datetime.combine(target_date, time.min)) + timedelta(days=1)
    points = list(
        WeatherHourlyMeasurement.objects
        .filter(nx=grid["nx"], ny=grid["ny"], measured_at__gte=start, measured_at__lt=end)
        .order_by("measured_at")
    )
    return points or None


def _hour(point: WeatherHourlyMeasurement) -> int:
    return timezone.localtime(point.measured_at).hour


def hour_blocks_text(hours: list[int], limit: int = 2) -> str:
    """[6, 7, 15, 16, 17] → '6~8시, 15~18시'. 떨어진 시간대를 하나로 부풀리지 않는다."""
    blocks: list[list[int]] = []
    for hour in sorted(set(hours)):
        if blocks and hour == blocks[-1][-1] + 1:
            blocks[-1].append(hour)
        else:
            blocks.append([hour])
    texts = [f"{block[0]}~{block[-1] + 1}시" for block in blocks[:limit]]
    return ", ".join(texts) + (" 등" if len(blocks) > limit else "")


MAX_EVENT_LINES = 3


def build_weather_morning_message(region: str, points: list[WeatherHourlyMeasurement], events: list[dict]) -> tuple[str, str]:
    """(제목, 본문). 핵심만 짧게: 남은 시간의 비·눈·천둥·강풍과 시간대, 기온, 날씨가 겹치는 일정, 챙길 것."""
    rain = [_hour(point) for point in points if _is_rain(point)]
    snow = [_hour(point) for point in points if _is_snow(point)]
    thunder = [_hour(point) for point in points if _is_thunder(point)]
    wind = [_hour(point) for point in points if _is_windy(point)]
    temperatures = [point.temperature for point in points if point.temperature is not None]
    low = round(min(temperatures)) if temperatures else None
    high = round(max(temperatures)) if temperatures else None

    hazards = [f"{name} {hour_blocks_text(hours)}" for name, hours in (("비", rain), ("눈", snow), ("천둥·번개", thunder), ("강한 바람", wind)) if hours]
    lines = [" · ".join(hazards) if hazards else "비·눈 예보 없음"]
    if low is not None and high is not None:
        lines.append(f"기온 {low}°" if low == high else f"기온 {low}~{high}°")

    # 날씨가 겹치는 일정은 같은 시각을 한 줄로 합치고, 알림이 길어지지 않게 앞의 3줄만 보여 준다.
    event_lines = []
    for time_text in dict.fromkeys(_event_label(event) for event in events):
        hour = int(time_text[:2]) if time_text[:2].isdigit() else None
        kinds = [name for name, hours in (("비", rain), ("눈", snow), ("천둥·번개", thunder), ("강한 바람", wind)) if hour in hours]
        if kinds:
            event_lines.append(f"{time_text} 일정 때 {'·'.join(kinds)}")
    lines.extend(event_lines[:MAX_EVENT_LINES])

    bring = [item for item, needed in (
        ("우산", bool(rain)),
        ("두꺼운 겉옷", low is not None and low <= LOW_TEMPERATURE_THRESHOLD),
        ("겉옷", low is not None and high is not None and low > LOW_TEMPERATURE_THRESHOLD and high - low >= 10),
        ("바람막이", bool(wind)),
        ("물·양산", high is not None and high >= HIGH_TEMPERATURE_THRESHOLD),
    ) if needed]
    if bring:
        lines.append(f"{'·'.join(bring)} 챙기세요")
    if thunder:
        lines.append("천둥·번개 때는 실내에 머무세요")
    if snow:
        lines.append("길이 미끄러울 수 있어요")
    return f"오늘 {region} 날씨", "\n".join(lines)


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
        # 오늘 보내는 알림은 지금 시각 이후만 본다(이미 지난 새벽 비는 알리지 않는다).
        from_time = timezone.now() if target_date == timezone.localdate() else None
        points = weather_points_for_region(city, region, target_date, from_time=from_time)
        if not points:
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
        title, body = build_weather_morning_message(region, points, events)
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
