import csv
import math
import os
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from dust.models import AirQualityStation, RealtimeDustMeasurement, WeatherHourlyMeasurement
from dust.views import _dfs_grid_from_lat_lng


def _hour_key(value):
    return timezone.localtime(value).replace(minute=0, second=0, microsecond=0)


def _avg(values):
    usable = [value for value in values if value is not None]
    if not usable:
        return ""
    return round(sum(usable) / len(usable), 3)


def _num(value, digits=3):
    if value is None:
        return ""
    return round(float(value), digits)


def _sin_cos(value, period):
    radians = 2 * math.pi * float(value) / float(period)
    return round(math.sin(radians), 6), round(math.cos(radians), 6)


def _wind_features(direction):
    if direction is None:
        return "", ""
    return _sin_cos(direction, 360)


def _weather_columns(prefix):
    return [
        f"{prefix}_temperature",
        f"{prefix}_humidity",
        f"{prefix}_wind_speed",
        f"{prefix}_wind_direction",
        f"{prefix}_wind_direction_sin",
        f"{prefix}_wind_direction_cos",
        f"{prefix}_rain_mm",
        f"{prefix}_rain_probability",
        f"{prefix}_sky",
        f"{prefix}_precipitation_type",
    ]


def _weather_values(weather):
    if not weather:
        return [""] * len(_weather_columns("x"))
    wind_sin, wind_cos = _wind_features(weather.wind_direction)
    return [
        _num(weather.temperature),
        _num(weather.humidity),
        _num(weather.wind_speed),
        _num(weather.wind_direction),
        wind_sin,
        wind_cos,
        _num(weather.rain_mm),
        _num(weather.rain_probability),
        weather.sky,
        weather.precipitation_type,
    ]


class Command(BaseCommand):
    help = "Build a CSV dataset for training hourly PM10 prediction models."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=30, help="How many recent days to export.")
        parser.add_argument("--max-horizon", type=int, default=12, help="Largest target horizon in hours.")
        parser.add_argument("--station-limit", type=int, default=0, help="Limit active stations for test exports.")
        parser.add_argument(
            "--output",
            default=os.path.join("exports", "hourly_dust_training_dataset.csv"),
            help="CSV output path. Relative paths are resolved from the backend directory.",
        )

    def handle(self, *args, **options):
        days = max(1, options["days"])
        max_horizon = min(max(1, options["max_horizon"]), 24)
        station_limit = max(0, options["station_limit"])
        output_path = options["output"]

        if not os.path.isabs(output_path):
            output_path = os.path.abspath(output_path)

        now = timezone.now()
        export_cutoff = now - timedelta(days=days)
        history_cutoff = export_cutoff - timedelta(days=30)
        weather_until = now + timedelta(hours=max_horizon)

        stations = list(
            AirQualityStation.objects
            .filter(is_active=True)
            .order_by("sido", "name")
        )
        if station_limit:
            stations = stations[:station_limit]

        if not stations:
            self.stdout.write(self.style.WARNING("No active stations found."))
            return

        station_ids = [station.id for station in stations]
        station_grid = {}
        grid_pairs = set()
        for station in stations:
            grid = _dfs_grid_from_lat_lng(station.lat, station.lng)
            grid_key = (grid["nx"], grid["ny"])
            station_grid[station.id] = grid_key
            grid_pairs.add(grid_key)

        measurements_by_station = defaultdict(dict)
        measurements = (
            RealtimeDustMeasurement.objects
            .filter(
                station_id__in=station_ids,
                measured_at__gte=history_cutoff,
                pm10_value__isnull=False,
            )
            .select_related("station")
            .order_by("station_id", "measured_at")
        )
        for measurement in measurements:
            measurements_by_station[measurement.station_id][_hour_key(measurement.measured_at)] = measurement

        weather_by_grid_time = {}
        if grid_pairs:
            nx_values = {nx for nx, _ny in grid_pairs}
            ny_values = {ny for _nx, ny in grid_pairs}
            weather_rows = WeatherHourlyMeasurement.objects.filter(
                nx__in=nx_values,
                ny__in=ny_values,
                measured_at__gte=history_cutoff,
                measured_at__lte=weather_until,
            )
            for weather in weather_rows:
                key = (weather.nx, weather.ny, _hour_key(weather.measured_at))
                weather_by_grid_time[key] = weather

        columns = [
            "station_id",
            "city",
            "region",
            "measured_at",
            "target_at",
            "horizon_hours",
            "current_pm10",
            "pm10_lag_1h",
            "pm10_lag_2h",
            "pm10_lag_3h",
            "pm10_avg_3h",
            "pm10_avg_6h",
            "pm10_avg_24h",
            "pm10_delta_1h",
            "pm10_delta_3h",
            "station_avg_7d",
            "station_avg_30d",
            "target_hour",
            "target_hour_sin",
            "target_hour_cos",
            "target_day_of_week",
            "target_day_of_week_sin",
            "target_day_of_week_cos",
            "target_is_weekend",
            "target_day_of_year",
            "target_day_of_year_sin",
            "target_day_of_year_cos",
            "target_month",
            *_weather_columns("current_weather"),
            *_weather_columns("target_weather"),
            "target_pm10",
        ]

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        row_count = 0
        with open(output_path, "w", encoding="utf-8-sig", newline="") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(columns)

            for station in stations:
                by_time = measurements_by_station.get(station.id, {})
                if not by_time:
                    continue

                grid_key = station_grid[station.id]
                times = sorted(by_time.keys())
                for measured_at in times:
                    if measured_at < _hour_key(export_cutoff):
                        continue

                    current = by_time[measured_at]
                    current_pm10 = current.pm10_value
                    lag_1h = by_time.get(measured_at - timedelta(hours=1))
                    lag_2h = by_time.get(measured_at - timedelta(hours=2))
                    lag_3h = by_time.get(measured_at - timedelta(hours=3))
                    history_3h = [
                        by_time.get(measured_at - timedelta(hours=offset))
                        for offset in range(1, 4)
                    ]
                    history_6h = [
                        by_time.get(measured_at - timedelta(hours=offset))
                        for offset in range(1, 7)
                    ]
                    history_24h = [
                        by_time.get(measured_at - timedelta(hours=offset))
                        for offset in range(1, 25)
                    ]
                    history_7d = [
                        measurement.pm10_value
                        for time_key, measurement in by_time.items()
                        if measured_at - timedelta(days=7) <= time_key < measured_at
                    ]
                    history_30d = [
                        measurement.pm10_value
                        for time_key, measurement in by_time.items()
                        if measured_at - timedelta(days=30) <= time_key < measured_at
                    ]

                    lag_1h_value = lag_1h.pm10_value if lag_1h else None
                    lag_3h_value = lag_3h.pm10_value if lag_3h else None
                    current_weather = weather_by_grid_time.get((*grid_key, measured_at))

                    for horizon in range(1, max_horizon + 1):
                        target_at = measured_at + timedelta(hours=horizon)
                        target = by_time.get(target_at)
                        if not target:
                            continue

                        target_hour_sin, target_hour_cos = _sin_cos(target_at.hour, 24)
                        target_dow = target_at.weekday()
                        target_dow_sin, target_dow_cos = _sin_cos(target_dow, 7)
                        target_doy = target_at.timetuple().tm_yday
                        target_doy_sin, target_doy_cos = _sin_cos(target_doy, 366)
                        target_weather = weather_by_grid_time.get((*grid_key, target_at))

                        writer.writerow([
                            station.id,
                            station.sido,
                            station.name,
                            measured_at.isoformat(),
                            target_at.isoformat(),
                            horizon,
                            _num(current_pm10),
                            _num(lag_1h_value),
                            _num(lag_2h.pm10_value if lag_2h else None),
                            _num(lag_3h_value),
                            _avg([item.pm10_value for item in history_3h if item]),
                            _avg([item.pm10_value for item in history_6h if item]),
                            _avg([item.pm10_value for item in history_24h if item]),
                            _num(current_pm10 - lag_1h_value) if lag_1h_value is not None else "",
                            _num(current_pm10 - lag_3h_value) if lag_3h_value is not None else "",
                            _avg(history_7d),
                            _avg(history_30d),
                            target_at.hour,
                            target_hour_sin,
                            target_hour_cos,
                            target_dow,
                            target_dow_sin,
                            target_dow_cos,
                            1 if target_dow >= 5 else 0,
                            target_doy,
                            target_doy_sin,
                            target_doy_cos,
                            target_at.month,
                            *_weather_values(current_weather),
                            *_weather_values(target_weather),
                            _num(target.pm10_value),
                        ])
                        row_count += 1

        self.stdout.write(self.style.SUCCESS(f"Training rows exported: {row_count}"))
        self.stdout.write(self.style.SUCCESS(f"Output: {output_path}"))
