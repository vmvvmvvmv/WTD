from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from django.utils import timezone

from dust.models import DustNotificationLog, HourlyDustPrediction, NotificationDevice, RealtimeDustMeasurement
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


def _hour_text(value: datetime) -> str:
    hour = timezone.localtime(value).hour
    if hour == 0:
        return "자정"
    if hour < 12:
        return f"오전 {hour}시"
    if hour == 12:
        return "낮 12시"
    return f"오후 {hour - 12}시"


def build_dust_spike_body(current_pm10: float | None, upcoming: list[tuple[datetime, float]], end_of_day: datetime) -> str | None:
    """지금 측정값이 나쁨 이상이면 지금, 아니면 오늘 남은 예측 중 처음 나쁨이 되는 시간을 알린다."""
    if current_pm10 is not None and current_pm10 > BAD_PM10:
        return f"지금 미세먼지 {_grade(current_pm10)}(PM10 {round(current_pm10)}㎍/㎥)이에요. 마스크 챙기세요."
    for target_at, pm10 in sorted(upcoming):
        if target_at < end_of_day and pm10 > BAD_PM10:
            return f"{_hour_text(target_at)}부터 미세먼지 {_grade(pm10)}이 예상돼요. 마스크 챙기세요."
    return None


def _latest_pm10(station, now: datetime) -> float | None:
    measurement = (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=now - MEASUREMENT_MAX_AGE, pm10_value__isnull=False)
        .order_by("-measured_at")
        .first()
    )
    return measurement.pm10_value if measurement else None


def _upcoming_predictions(station, now: datetime, end_of_day: datetime) -> list[tuple[datetime, float]]:
    # 같은 시각의 예측이 여러 번 있으면 가장 최근 예측을 쓴다.
    latest: dict[datetime, tuple[datetime, float]] = {}
    for prediction in (
        HourlyDustPrediction.objects
        .filter(station=station, target_at__gt=now, target_at__lt=end_of_day)
        .order_by("target_at", "-predicted_at")
    ):
        latest.setdefault(prediction.target_at, (prediction.target_at, prediction.pm10_predicted))
    return list(latest.values())


def send_dust_spike_notifications(now: datetime | None = None, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> DustSpikeResult:
    write = write or (lambda _message: None)
    now = timezone.localtime(now or timezone.now())
    if not force and (now.hour >= QUIET_START_HOUR or now.hour < QUIET_END_HOUR):
        write("Quiet hours; dust spike notifications skipped.")
        return DustSpikeResult()

    end_of_day = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
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
                _latest_pm10(station, now),
                _upcoming_predictions(station, now, end_of_day),
                end_of_day,
            ) if station else None
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
