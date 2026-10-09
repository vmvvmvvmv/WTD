import math
from datetime import timedelta

from dust.current_dust_service import canonical_sido_name

from dust.models import AirQualityStation, HourlyDustPrediction, RealtimeDustMeasurement, WeatherHourlyMeasurement

from .aggregation import AirPoint, WeatherPoint, aggregate_schedule_window
from .context_builder import OutfitRequest


WEATHER_FALLBACK_HOURS = 36


def _dfs_grid(lat: float, lng: float) -> tuple[int, int]:
    re, grid, slat1, slat2, olon, olat, xo, yo = 6371.00877, 5.0, 30.0, 60.0, 126.0, 38.0, 43, 136
    degrad = math.pi / 180.0
    re_grid = re / grid
    slat1_rad, slat2_rad, olon_rad, olat_rad = (value * degrad for value in (slat1, slat2, olon, olat))
    sn = math.log(math.cos(slat1_rad) / math.cos(slat2_rad)) / math.log(math.tan(math.pi * 0.25 + slat2_rad * 0.5) / math.tan(math.pi * 0.25 + slat1_rad * 0.5))
    sf = (math.tan(math.pi * 0.25 + slat1_rad * 0.5) ** sn) * math.cos(slat1_rad) / sn
    ro = re_grid * sf / (math.tan(math.pi * 0.25 + olat_rad * 0.5) ** sn)
    ra = re_grid * sf / (math.tan(math.pi * 0.25 + lat * degrad * 0.5) ** sn)
    theta = lng * degrad - olon_rad
    if theta > math.pi:
        theta -= 2 * math.pi
    if theta < -math.pi:
        theta += 2 * math.pi
    theta *= sn
    return int(ra * math.sin(theta) + xo + 0.5), int(ro - ra * math.cos(theta) + yo + 0.5)


def _distance_squared(station: AirQualityStation, lat: float, lng: float) -> float:
    return (station.lat - lat) ** 2 + (station.lng - lng) ** 2


def _station_for_request(request: OutfitRequest):
    stations = AirQualityStation.objects.filter(is_active=True)
    if request.lat is not None and request.lng is not None:
        return min(stations, key=lambda station: _distance_squared(station, request.lat, request.lng), default=None)
    city_stations = stations.filter(sido=canonical_sido_name(request.city))
    exact = city_stations.filter(name=request.region).first()
    if exact:
        return exact
    return next((station for station in city_stations if station.name and station.name in request.region), None)


def _weather_point(row: WeatherHourlyMeasurement) -> WeatherPoint:
    return WeatherPoint(
        temperature=row.temperature,
        wind_speed=row.wind_speed,
        rain_mm=row.rain_mm,
        rain_probability=row.rain_probability,
        precipitation_type=row.precipitation_type,
        label=row.label,
        measured_at=row.measured_at,
    )


def _weather_grid_candidates(request: OutfitRequest, station: AirQualityStation | None) -> list[tuple[int, int]]:
    candidates = []
    if request.lat is not None and request.lng is not None:
        candidates.append(_dfs_grid(request.lat, request.lng))
    if station is not None:
        station_grid = _dfs_grid(station.lat, station.lng)
        if station_grid not in candidates:
            candidates.append(station_grid)
    return candidates


def _weather_rows_in_schedule_window(nx: int, ny: int, request: OutfitRequest) -> list[WeatherHourlyMeasurement]:
    return list(
        WeatherHourlyMeasurement.objects.filter(
            nx=nx,
            ny=ny,
            measured_at__gte=request.start - timedelta(hours=1),
            measured_at__lte=request.end + timedelta(hours=1),
            temperature__isnull=False,
        ).order_by("measured_at")
    )


def _nearest_weather_row(nx: int, ny: int, request: OutfitRequest) -> WeatherHourlyMeasurement | None:
    rows = WeatherHourlyMeasurement.objects.filter(
        nx=nx,
        ny=ny,
        measured_at__gte=request.start - timedelta(hours=WEATHER_FALLBACK_HOURS),
        measured_at__lte=request.end + timedelta(hours=WEATHER_FALLBACK_HOURS),
        temperature__isnull=False,
    )
    return min(rows, key=lambda row: abs(row.measured_at - request.start), default=None)


def load_schedule_snapshot(request: OutfitRequest) -> dict:
    station = _station_for_request(request)
    weather_points: list[WeatherPoint] = []
    weather_grids = _weather_grid_candidates(request, station)
    for nx, ny in weather_grids:
        rows = _weather_rows_in_schedule_window(nx, ny, request)
        if rows:
            weather_points = [_weather_point(row) for row in rows]
            break

    # An arbitrary place coordinate can belong to a grid that the local collector
    # has not stored yet. Fall back to the selected region's station grid and then
    # to its nearest recent/forecast row instead of rejecting the recommendation.
    if not weather_points:
        nearest_rows = [
            row
            for nx, ny in weather_grids
            if (row := _nearest_weather_row(nx, ny, request)) is not None
        ]
        nearest = min(nearest_rows, key=lambda row: abs(row.measured_at - request.start), default=None)
        if nearest is not None:
            weather_points = [_weather_point(nearest)]

    air_points: list[AirPoint] = []
    if station:
        dust_rows = RealtimeDustMeasurement.objects.filter(
            station=station,
            measured_at__gte=request.start - timedelta(hours=1),
            measured_at__lte=request.end + timedelta(hours=1),
        ).order_by("measured_at")
        air_points = [AirPoint(row.pm10_value, row.pm25_value) for row in dust_rows]
        if not air_points:
            predictions = HourlyDustPrediction.objects.filter(
                station=station,
                target_at__gte=request.start,
                target_at__lte=request.end,
            ).order_by("target_at")
            air_points = [AirPoint(row.pm10_predicted, None) for row in predictions]
    return aggregate_schedule_window(weather_points, air_points, window=(request.start, request.end))
