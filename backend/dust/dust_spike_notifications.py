from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from django.utils import timezone

from dust.airkorea_forecast import forecast_grade_for
from dust.models import DustNotificationLog, NotificationDevice, RealtimeDustMeasurement
from dust.weather_morning_notifications import ExpoDeviceNotRegistered, _station_for_region, send_expo_push


NOTIFICATION_TYPE = "dust_spike"
BAD_PM10 = 80  # 에어코리아 PM10 '나쁨' 시작(81 이상)
VERY_BAD_PM10 = 150
MEASUREMENT_MAX_AGE = timedelta(hours=2)
# 밤에는 깨우지 않는다. 밤사이 나빠졌으면 아침 첫 수집 때 한 번 알린다.
QUIET_START_HOUR = 22
QUIET_END_HOUR = 7


@dataclass(frozen=True)
class DustSpikeResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0


def _grade(pm10: float) -> str:
    return "매우 나쁨" if pm10 > VERY_BAD_PM10 else "나쁨"



def build_dust_spike_body(current_pm10: float | None, today_forecast_grade: str | None) -> str | None:
    """지금 측정값이 나쁨 이상이면 지금 값을, 아니면 에어코리아 오늘 예보가 나쁨 이상일 때 예보를 알린다."""
    if current_pm10 is not None and current_pm10 > BAD_PM10:
        return f"지금 미세먼지 {_grade(current_pm10)}(PM10 {round(current_pm10)}㎍/㎥)이에요. 마스크 챙기세요."
    if today_forecast_grade in ("나쁨", "매우나쁨"):
        grade_text = "매우 나쁨" if today_forecast_grade == "매우나쁨" else "나쁨"
        return f"오늘 미세먼지 예보가 {grade_text}이에요. 마스크 챙기세요."
    return None


def _latest_pm10(station, now: datetime) -> float | None:
    measurement = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=now - MEASUREMENT_MAX_AGE, pm10_value__isnull=False)
        .order_by("-measured_at")
        .first()
    )
    return measurement.pm10_value if measurement else None


def _today_forecast_grade(city: str, now: datetime) -> str | None:
    from dust.views import AIRKOREA_SERVICE_KEY  # views가 이 모듈보다 늦게 준비될 수 있어 여기서 가져온다.

    return forecast_grade_for(AIRKOREA_SERVICE_KEY, city, now.date())


def send_dust_spike_notifications(now: datetime | None = None, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> DustSpikeResult:
    write = write or (lambda _message: None)
    now = timezone.localtime(now or timezone.now())
    if not force and (now.hour >= QUIET_START_HOUR or now.hour < QUIET_END_HOUR):
        write("Quiet hours; dust spike notifications skipped.")
        return DustSpikeResult()

    basis_key = now.strftime("%Y%m%d")
    sent = failed = skipped = 0
    body_by_region: dict[tuple[str, str], str | None] = {}

    for device in NotificationDevice.objects.filter(enabled=True, dust_spike_alerts=True):
        city, region = device.city, device.region
        if not city or not region:
            skipped += 1
            continue
        # 하루 한 번만: 나쁨으로 바뀐 첫 알림 뒤에는 오르내려도 다시 보내지 않는다.
        if not force and DustNotificationLog.objects.filter(
            device=device, notification_type=NOTIFICATION_TYPE, city=city, region=region, basis_key=basis_key,
        ).exists():
            skipped += 1
            continue

        key = (city, region)
        if key not in body_by_region:
            station = _station_for_region(city, region)
            body_by_region[key] = build_dust_spike_body(
                _latest_pm10(station, now) if station else None,
                _today_forecast_grade(city, now),
            )
        body = body_by_region[key]
        if not body:
            skipped += 1
            continue

        title = f"{region} 미세먼지 알림"
        if dry_run:
            write(f"[dry-run] {title} - {body}")
            sent += 1
            continue

        try:
            send_expo_push(device.expo_push_token, title, body, {"type": NOTIFICATION_TYPE, "city": city, "region": region})
        except ExpoDeviceNotRegistered:
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
            device=device, notification_type=NOTIFICATION_TYPE, city=city, region=region, basis_key=basis_key,
            defaults={"pm10_value": None},
        )
        device.last_sent_at = timezone.now()
        device.save(update_fields=["last_sent_at", "updated_at"])
        sent += 1

    return DustSpikeResult(sent=sent, failed=failed, skipped=skipped)
