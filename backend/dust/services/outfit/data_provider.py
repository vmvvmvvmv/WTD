import math
from datetime import timedelta

from dust.current_dust_service import canonical_sido_name
from dust.models import AirQualityStation, HourlyDustPrediction, RealtimeDustMeasurement, WeatherHourlyMeasurement

from .aggregation import AirPoint, WeatherPoint, aggregate_schedule_window
from .context_builder import OutfitRequest


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


def load_schedule_snapshot(request: OutfitRequest) -> dict:
    weather_points: list[WeatherPoint] = []
    if request.lat is not None and request.lng is not None:
        nx, ny = _dfs_grid(request.lat, request.lng)
        rows = WeatherHourlyMeasurement.objects.filter(
            nx=nx,
            ny=ny,
            measured_at__gte=request.start - timedelta(hours=1),
            measured_at__lte=request.end + timedelta(hours=1),
        ).order_by("measured_at")
        weather_points = [WeatherPoint(row.temperature, row.wind_speed, row.rain_mm, row.rain_probability) for row in rows]

    air_points: list[AirPoint] = []
    station = _station_for_request(request)
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
    return aggregate_schedule_window(weather_points, air_points)
