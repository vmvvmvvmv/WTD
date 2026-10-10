from __future__ import annotations

from dataclasses import dataclass
import re
from datetime import datetime, timedelta
from typing import Callable

from django.utils import timezone

from dust.airkorea_forecast import forecast_for
from dust.current_dust_service import canonical_sido_name
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


# 에어코리아(환경부) 등급 기준. 미세먼지(PM10) 나쁨 81~150·매우나쁨 151~, 초미세먼지(PM2.5) 나쁨 36~75·매우나쁨 76~.
BAD_PM25 = 35
VERY_BAD_PM25 = 75


def _pm_grade(value: float, bad: float, very_bad: float) -> str | None:
    if value > very_bad:
        return "매우 나쁨"
    if value > bad:
        return "나쁨"
    return None


def _announced_text(announced: str | None) -> str:
    """'2026-10-10 17시 발표' → '10월 10일 17시 발표'. 모양이 다르면 그대로."""
    match = re.match(r"\d{4}-(\d{2})-(\d{2})\s*(\d{1,2})시", announced or "")
    if not match:
        return announced or ""
    return f"{int(match.group(1))}월 {int(match.group(2))}일 {int(match.group(3))}시 발표"


def build_dust_spike_message(region: str, sido: str, station_name: str | None, measurement, forecast: tuple[str | None, str | None]) -> tuple[str, str] | None:
    """(제목, 본문). 지금 측정값이 나쁨 이상이면 어느 측정소의 몇 시 값인지와 함께, 아니면 에어코리아 오늘 예보(시도 단위)를 발표 시각과 함께 알린다."""
    if measurement is not None:
        parts = []
        pm10, pm25 = measurement.pm10_value, measurement.pm25_value
        if pm10 is not None and (grade := _pm_grade(pm10, BAD_PM10, VERY_BAD_PM10)):
            parts.append(("미세먼지", f"미세먼지(PM10) {round(pm10)}㎍/㎥ '{grade}'"))
        if pm25 is not None and (grade := _pm_grade(pm25, BAD_PM25, VERY_BAD_PM25)):
            parts.append(("초미세먼지", f"초미세먼지(PM2.5) {round(pm25)}㎍/㎥ '{grade}'"))
        if parts:
            measured_hour = timezone.localtime(measurement.measured_at).hour
            where = f"{station_name} 측정소, {measured_hour}시 측정" if station_name else f"{measured_hour}시 측정"
            title = f"{region} {'·'.join(name for name, _ in parts)} 나쁨"
            body = f"지금 {' · '.join(text for _, text in parts)}이에요({where}).\n마스크를 쓰고 바깥 활동을 줄이세요."
            return title, body
    grade, announced = forecast
    if grade in ("나쁨", "매우나쁨"):
        grade_text = "매우 나쁨" if grade == "매우나쁨" else "나쁨"
        when = _announced_text(announced)
        title = f"{sido} 미세먼지 예보 '{grade_text}'"
        body = f"에어코리아 예보로 오늘 {sido} 미세먼지(PM10)가 '{grade_text}'이에요" + (f"({when})" if when else "") + ".\n마스크를 챙기세요."
        return title, body
    return None


def _latest_measurement(station, now: datetime):
    return (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__gte=now - MEASUREMENT_MAX_AGE)
        .exclude(pm10_value__isnull=True, pm25_value__isnull=True)
        .order_by("-measured_at")
        .first()
    )


def _today_forecast(city: str, now: datetime) -> tuple[str | None, str | None]:
    from dust.views import AIRKOREA_SERVICE_KEY  # views가 이 모듈보다 늦게 준비될 수 있어 여기서 가져온다.

    return forecast_for(AIRKOREA_SERVICE_KEY, city, now.date())


def send_dust_spike_notifications(now: datetime | None = None, dry_run: bool = False, force: bool = False, write: Callable[[str], None] | None = None) -> DustSpikeResult:
    write = write or (lambda _message: None)
    now = timezone.localtime(now or timezone.now())
    if not force and (now.hour >= QUIET_START_HOUR or now.hour < QUIET_END_HOUR):
        write("Quiet hours; dust spike notifications skipped.")
        return DustSpikeResult()

    basis_key = now.strftime("%Y%m%d")
    sent = failed = skipped = 0
    message_by_region: dict[tuple[str, str], tuple[str, str] | None] = {}

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
        if key not in message_by_region:
            station = _station_for_region(city, region)
            message_by_region[key] = build_dust_spike_message(
                region,
                canonical_sido_name(city),
                station.name if station else None,
                _latest_measurement(station, now) if station else None,
                _today_forecast(city, now),
            )
        message = message_by_region[key]
        if not message:
            skipped += 1
            continue

        title, body = message
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
