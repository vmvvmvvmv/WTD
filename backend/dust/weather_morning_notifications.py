from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Callable

import requests
from django.utils import timezone

from dust.models import AirQualityStation, DustNotificationLog, ExpoPushTicket, NotificationDevice, WeatherHourlyMeasurement
from dust.services.common import _dfs_grid_from_lat_lng
from dust.services.stations import _current_station_location, _find_air_quality_station, _resolve_station_name


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def expo_request_headers() -> dict:
    """Expo 대시보드에서 'Enhanced Security for Push Notifications'를 켜면, 이 접근 토큰이 있어야만 푸시를 보낼 수 있다.
    토큰이 없으면 머리글을 붙이지 않는다(보안 설정을 켜기 전과 같은 동작)."""
    token = os.getenv("EXPO_ACCESS_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}
LATE_MORNING_HOUR = 10
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


def _clock(value) -> tuple[int, int] | None:
    text = str(value or "").strip()[:5]
    if len(text) != 5 or text[2] != ":" or not (text[:2].isdigit() and text[3:].isdigit()):
        return None
    return int(text[:2]), int(text[3:])


def _event_hours(event: dict) -> list[int]:
    """일정이 걸친 시(時). 10:30~12:00이면 10·11시. 끝 시각이 없거나 이상하면 시작한 시만."""
    start = _clock(event.get("time"))
    if not start:
        return []
    end = _clock(event.get("endTime"))
    if not end or end <= start:
        return [start[0]]
    last_hour = end[0] if end[1] else end[0] - 1
    return list(range(start[0], max(start[0], last_hour) + 1))


def _event_time_range(event: dict) -> str:
    start = _event_label(event)
    end = _clock(event.get("endTime"))
    if not start or not end or end <= (_clock(start) or (0, 0)):
        return start
    return f"{start}~{end[0]:02d}:{end[1]:02d}"


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
    """(제목, 본문). 핵심만 짧게: 남은 시간의 비·눈·천둥·강풍과 시간대, 기온, 일정 시간대 날씨, 챙길 것."""
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

    # 일정마다 시작~끝 시간대 날씨를 한 줄씩 보여 준다(날씨가 괜찮아도). 같은 시간대는 한 줄로, 알림이 길어지지 않게 앞의 3줄만.
    # 이미 지난 일정처럼 그 시간대 예보가 없으면 넣지 않는다.
    event_lines = []
    for time_text, event_hours in dict.fromkeys((_event_time_range(event), tuple(_event_hours(event))) for event in events):
        event_points = [point for point in points if _hour(point) in event_hours]
        if not time_text or not event_points:
            continue
        kinds = [name for name, hours in (("비", rain), ("눈", snow), ("천둥·번개", thunder), ("강한 바람", wind)) if set(hours) & set(event_hours)]
        sky = Counter(point.label for point in event_points if point.label).most_common(1)
        weather_text = f"{'·'.join(kinds)} 예보" if kinds else (sky[0][0] if sky else "날씨 정보 없음")
        event_temperatures = [round(point.temperature) for point in event_points if point.temperature is not None]
        temperature_text = ""
        if event_temperatures:
            event_low, event_high = min(event_temperatures), max(event_temperatures)
            temperature_text = f" · {event_low}°" if event_low == event_high else f" · {event_low}~{event_high}°"
        event_lines.append(f"{time_text} 일정 {weather_text}{temperature_text}")
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
    response = requests.post(EXPO_PUSH_URL, json=payload, headers=expo_request_headers(), timeout=10)
    response.raise_for_status()
    response_data = response.json()
    ticket = response_data.get("data") if isinstance(response_data, dict) else None
    if not isinstance(ticket, dict) or ticket.get("status") != "ok":
        details = ticket.get("details") if isinstance(ticket, dict) else None
        if isinstance(details, dict) and details.get("error") == "DeviceNotRegistered":
            raise ExpoDeviceNotRegistered(f"Expo push failed: {response_data}")
        raise RuntimeError(f"Expo push failed: {response_data}")
    # 접수됐다는 뜻일 뿐이다. 실제 전달 여부는 check_push_receipts가 영수증으로 확인한다.
    if ticket.get("id"):
        ExpoPushTicket.objects.get_or_create(ticket_id=ticket["id"], defaults={"expo_push_token": token})


def send_weather_morning_notifications(target_date: date, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> WeatherMorningResult:
    write = write or (lambda _message: None)
    # 서버가 꺼져 있다가 늦게 켜지면 타이머가 놓친 실행을 따라잡는다. 오후에 "아침 날씨"가 가지 않게 막는다.
    if not force and target_date == timezone.localdate() and timezone.localtime().hour >= LATE_MORNING_HOUR:
        write(f"Past {LATE_MORNING_HOUR}:00; morning notifications skipped.")
        return WeatherMorningResult()
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


EARLY_EVENT_NOTIFICATION_TYPE = "weather_early_event"
EARLY_EVENT_BEFORE_HOUR = 7  # 아침 7시 알림보다 먼저 시작하는 일정만 따로 알린다.
# 날씨 수집(매시 45분)과 함께 돈다. 지금부터 45분~1시간 45분 뒤 시작하는 일정을 고르면, 매시간 한 번씩 돌 때 일정마다 약 1시간 전에 한 번 걸린다.
EARLY_EVENT_WINDOW = (timedelta(minutes=45), timedelta(minutes=105))


def _event_start(event: dict) -> datetime | None:
    try:
        start = datetime.strptime(f"{str(event.get('date') or '')[:10]} {str(event.get('time') or '')[:5]}", "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return timezone.make_aware(start, timezone.get_current_timezone())


def send_early_event_weather_notifications(now: datetime | None = None, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> WeatherMorningResult:
    """7시 전에 시작하는 일정마다, 시작 약 1시간 전에 그 시간 날씨를 한 번 보낸다."""
    write = write or (lambda _message: None)
    now = now or timezone.now()
    sent = skipped = failed = 0
    for device in NotificationDevice.objects.filter(enabled=True, weather_morning_alerts=True):
        if not device.city or not device.region:
            continue
        for event in device.calendar_events or []:
            start = _event_start(event) if isinstance(event, dict) else None
            if not start or timezone.localtime(start).hour >= EARLY_EVENT_BEFORE_HOUR:
                continue
            if not (now + EARLY_EVENT_WINDOW[0] <= start < now + EARLY_EVENT_WINDOW[1]):
                continue
            local_start = timezone.localtime(start)
            basis_key = local_start.strftime("%Y%m%d%H%M")
            if not force and DustNotificationLog.objects.filter(
                device=device, notification_type=EARLY_EVENT_NOTIFICATION_TYPE, city=device.city, region=device.region, basis_key=basis_key,
            ).exists():
                skipped += 1
                continue
            points = [
                point for point in (weather_points_for_region(device.city, device.region, local_start.date()) or [])
                if _hour(point) == local_start.hour
            ]
            if not points:
                skipped += 1
                continue
            _title, body = build_weather_morning_message(device.region, points, [event])
            title = f"{local_start:%H:%M} 일정 날씨"
            if dry_run:
                write(f"[dry-run] {title} - {body}")
                sent += 1
                continue
            try:
                send_expo_push(device.expo_push_token, title, body, {
                    "type": EARLY_EVENT_NOTIFICATION_TYPE, "city": device.city, "region": device.region, "date": local_start.date().isoformat(),
                })
            except ExpoDeviceNotRegistered:
                failed += 1
                device.enabled = False
                device.calendar_events = []
                device.save(update_fields=["enabled", "calendar_events", "updated_at"])
                write(f"Expo device is no longer registered; disabled device for {device.city} {device.region}.")
                break
            except Exception as exc:
                failed += 1
                write(f"Expo push request failed for {device.city} {device.region}: {exc}")
                continue
            DustNotificationLog.objects.update_or_create(
                device=device, notification_type=EARLY_EVENT_NOTIFICATION_TYPE, city=device.city, region=device.region, basis_key=basis_key,
                defaults={"pm10_value": None},
            )
            sent += 1
    return WeatherMorningResult(sent=sent, failed=failed, skipped=skipped)
