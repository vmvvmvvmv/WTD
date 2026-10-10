from __future__ import annotations

from typing import Any

from dust.models import NotificationDevice


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
    token = str(payload.get("expoPushToken") or payload.get("token") or "").strip()
    city = str(payload.get("city") or "").strip()
    region = str(payload.get("region") or "").strip()
    if not token:
        raise ValueError("expoPushToken is required.")
    if not city or not region:
        raise ValueError("city and region are required.")

    pm10_threshold = max(1, min(float_from_payload(payload.get("pm10Threshold"), 80), 300))
    regions = clean_notification_regions(payload.get("regions"), city, region)
    weather_morning_alerts = bool_from_payload(payload.get("weatherMorningAlerts"), False)
    # 일정 제목은 아침 날씨 알림에만 필요하다. 알림이 꺼져 있으면 저장하지 않고 기존 값도 비운다.
    calendar_events = clean_notification_calendar_events(payload.get("calendarEvents")) if weather_morning_alerts else []

    device, _created = NotificationDevice.objects.update_or_create(
        expo_push_token=token,
        defaults={
            "city": city,
            "region": region,
            "enabled": bool_from_payload(payload.get("enabled"), True),
            "notify_bad_only": bool_from_payload(payload.get("notifyBadOnly"), True),
            "pm10_threshold": pm10_threshold,
            "morning_summary": bool_from_payload(payload.get("morningSummary"), False),
            "weather_morning_alerts": weather_morning_alerts,
            "dust_spike_alerts": bool_from_payload(payload.get("dustSpikeAlerts"), False),
            "include_favorites": bool_from_payload(payload.get("includeFavorites"), True),
            "regions": regions,
            "calendar_events": calendar_events,
        },
    )
    return device


def notification_device_response(device: NotificationDevice) -> dict[str, Any]:
    return {
        "ok": True,
        "deviceId": device.id,
        "enabled": device.enabled,
        "pm10Threshold": device.pm10_threshold,
        "weatherMorningAlerts": device.weather_morning_alerts,
        "dustSpikeAlerts": device.dust_spike_alerts,
        "regions": device.regions,
        "calendarEvents": device.calendar_events,
    }
