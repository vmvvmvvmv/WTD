from __future__ import annotations

from typing import Any

from django.db import OperationalError

from dust.models import NotificationDevice

MYSQL_DEADLOCK = 1213


def clean_notification_regions(regions: Any, fallback_city: str, fallback_region: str) -> list[dict[str, str]]:
    """Normalize user notification regions before saving them in JSONField.

    Keeping this in one place prevents the API view and future background jobs from
    accepting slightly different region shapes.
    """
    cleaned: list[dict[str, str]] = []
    if isinstance(regions, list):
        for region in regions:
            if not isinstance(region, dict):
                continue
            city = str(region.get("city") or "").strip()
            district = str(region.get("region") or "").strip()
            label = str(region.get("label") or "").strip()
            if not city or not district:
                continue
            item = {"city": city, "region": district}
            if label:
                item["label"] = label
            if item not in cleaned:
                cleaned.append(item)
    if not cleaned and fallback_city and fallback_region:
        cleaned.append({"city": fallback_city, "region": fallback_region})
    return cleaned[:10]


def clean_notification_calendar_events(events: Any) -> list[dict[str, str]]:
    """Store only the date/time needed for morning push copy.

    일정 제목은 건강·인간관계 등 민감한 내용이 담기기 쉬워 저장하지 않는다.
    예전 앱 버전이 title을 보내더라도 여기서 버린다.
    """
    cleaned: list[dict[str, str]] = []
    if not isinstance(events, list):
        return cleaned
    for event in events:
        if not isinstance(event, dict):
            continue
        date = str(event.get("date") or "").strip()
        time = str(event.get("time") or "").strip()
        if not date:
            continue
        item = {"date": date[:10]}
        if time:
            item["time"] = time[:5]
        cleaned.append(item)
    return cleaned[:30]


def bool_from_payload(value: Any, default: bool = False) -> bool:
    """Handle booleans sent as JSON booleans or common string values."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def float_from_payload(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def upsert_notification_device(payload: Any) -> NotificationDevice:
    """Create or update one Expo push device from API payload data."""
    if not isinstance(payload, dict):
        raise ValueError("요청 본문은 JSON 객체여야 합니다.")
    token = str(payload.get("expoPushToken") or payload.get("token") or "").strip()
    city = str(payload.get("city") or "").strip()
    region = str(payload.get("region") or "").strip()
    if not token:
        raise ValueError("expoPushToken이 필요합니다.")
    if not city or not region:
        raise ValueError("city와 region이 필요합니다.")
    # DB 칸 길이를 넘으면 저장할 때 500이 나므로 먼저 막는다.
    for field, value in (("expo_push_token", token), ("city", city), ("region", region)):
        if len(value) > NotificationDevice._meta.get_field(field).max_length:
            raise ValueError(f"{field} 값이 너무 깁니다.")

    pm10_threshold = max(1, min(float_from_payload(payload.get("pm10Threshold"), 80), 300))
    regions = clean_notification_regions(payload.get("regions"), city, region)
    weather_morning_alerts = bool_from_payload(payload.get("weatherMorningAlerts"), False)
    # 일정 제목은 아침 날씨 알림에만 필요하다. 알림이 꺼져 있으면 저장하지 않고 기존 값도 비운다.
    calendar_events = clean_notification_calendar_events(payload.get("calendarEvents")) if weather_morning_alerts else []

    defaults = {
        "city": city,
        "region": region,
        "enabled": bool_from_payload(payload.get("enabled"), True),
        "notify_bad_only": bool_from_payload(payload.get("notifyBadOnly"), True),
        "pm10_threshold": pm10_threshold,
        "morning_summary": bool_from_payload(payload.get("morningSummary"), False),
        "weather_morning_alerts": weather_morning_alerts,
        "dust_spike_alerts": bool_from_payload(payload.get("dustSpikeAlerts"), False),
        "weather_warning_alerts": bool_from_payload(payload.get("weatherWarningAlerts"), False),
        "include_favorites": bool_from_payload(payload.get("includeFavorites"), True),
        "regions": regions,
        "calendar_events": calendar_events,
    }
    # 같은 기기가 처음 등록할 때 요청이 겹치면 MySQL이 교착(deadlock)으로 한쪽을 끊는다. 다시 하면 이미 생긴 행을 고친다.
    for _ in range(2):
        try:
            return NotificationDevice.objects.update_or_create(expo_push_token=token, defaults=defaults)[0]
        except OperationalError as error:
            if not error.args or error.args[0] != MYSQL_DEADLOCK:
                raise
    return NotificationDevice.objects.update_or_create(expo_push_token=token, defaults=defaults)[0]


def notification_device_response(device: NotificationDevice) -> dict[str, Any]:
    return {
        "ok": True,
        "deviceId": device.id,
        "enabled": device.enabled,
        "pm10Threshold": device.pm10_threshold,
        "weatherMorningAlerts": device.weather_morning_alerts,
        "dustSpikeAlerts": device.dust_spike_alerts,
        "weatherWarningAlerts": device.weather_warning_alerts,
        "regions": device.regions,
        "calendarEvents": device.calendar_events,
    }
