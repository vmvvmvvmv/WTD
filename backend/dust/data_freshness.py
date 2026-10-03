from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

from django.db.models import Max
from django.utils import timezone

from .models import AirQualityStation, RealtimeDustMeasurement, WeatherHourlyMeasurement


@dataclass(frozen=True)
class FreshnessItem:
    name: str
    status: str
    latest_at: datetime | None
    age_hours: float | None
    max_age_hours: int
    row_count: int

    def to_dict(self) -> dict:
        value = asdict(self)
        value["latest_at"] = self.latest_at.isoformat() if self.latest_at else None
        return value


def _age_hours(now: datetime, value: datetime | None) -> float | None:
    if value is None:
        return None
    return max(0.0, (now - value).total_seconds() / 3600)


def _freshness_item(
    *,
    name: str,
    latest_at: datetime | None,
    row_count: int,
    max_age_hours: int,
    now: datetime,
) -> FreshnessItem:
    age_hours = _age_hours(now, latest_at)
    if latest_at is None:
        status = "missing"
    elif age_hours is not None and age_hours > max_age_hours:
        status = "stale"
    elif row_count == 0:
        status = "unavailable"
    else:
        status = "fresh"
    return FreshnessItem(
        name=name,
        status=status,
        latest_at=latest_at,
        age_hours=round(age_hours, 2) if age_hours is not None else None,
        max_age_hours=max_age_hours,
        row_count=row_count,
    )


def evaluate_data_freshness(
    *,
    now: datetime,
    active_station_count: int,
    dust_latest_at: datetime | None,
    dust_row_count: int,
    weather_latest_at: datetime | None,
    usable_weather_count: int,
    max_dust_age_hours: int = 3,
    max_weather_age_hours: int = 6,
) -> dict:
    dust = _freshness_item(
        name="realtime_dust",
        latest_at=dust_latest_at,
        row_count=dust_row_count,
        max_age_hours=max_dust_age_hours,
        now=now,
    )
    weather = _freshness_item(
        name="hourly_weather",
        latest_at=weather_latest_at,
        row_count=usable_weather_count,
        max_age_hours=max_weather_age_hours,
        now=now,
    )

    problems = []
    if active_station_count == 0:
        problems.append("active_stations_missing")
    for item in (dust, weather):
        if item.status != "fresh":
            problems.append(f"{item.name}_{item.status}")

    return {
        "ok": not problems,
        "checked_at": now.isoformat(),
        "active_station_count": active_station_count,
        "datasets": [dust.to_dict(), weather.to_dict()],
        "problems": problems,
    }


def inspect_data_freshness(
    *,
    now: datetime | None = None,
    max_dust_age_hours: int = 3,
    max_weather_age_hours: int = 6,
) -> dict:
    checked_at = now or timezone.now()
    active_station_count = AirQualityStation.objects.filter(is_active=True).count()

    dust_rows = RealtimeDustMeasurement.objects.all()
    dust_latest_at = dust_rows.aggregate(value=Max("created_at"))["value"]

    weather_rows = WeatherHourlyMeasurement.objects.all()
    weather_latest_at = weather_rows.aggregate(value=Max("updated_at"))["value"]
    usable_weather_count = weather_rows.filter(
        measured_at__gte=checked_at - timedelta(hours=1)
    ).count()

    return evaluate_data_freshness(
        now=checked_at,
        active_station_count=active_station_count,
        dust_latest_at=dust_latest_at,
        dust_row_count=dust_rows.count(),
        weather_latest_at=weather_latest_at,
        usable_weather_count=usable_weather_count,
        max_dust_age_hours=max_dust_age_hours,
        max_weather_age_hours=max_weather_age_hours,
    )
