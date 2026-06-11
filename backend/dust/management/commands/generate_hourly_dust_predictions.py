from django.core.management.base import BaseCommand

from dust.models import AirQualityStation, NotificationDevice
from dust.views import (
    _build_hourly_dust_forecast,
    _current_station_location,
    _dfs_grid_from_lat_lng,
    _fetch_kma_hourly_weather_forecast_by_grid,
    _find_air_quality_station,
    _load_recent_realtime_hourly_dust,
    _resolve_station_name,
    _store_hourly_dust_predictions,
)


class Command(BaseCommand):
    help = "Generate and store hourly PM10 predictions without waiting for app API calls."

    def add_arguments(self, parser):
        parser.add_argument("--city", default="", help="Generate predictions for one city.")
        parser.add_argument("--region", default="", help="Generate predictions for one region/station.")
        parser.add_argument("--all-active", action="store_true", help="Generate predictions for all active stations.")
        parser.add_argument("--limit", type=int, default=0, help="Limit number of regions/stations.")

    def _regions_from_notifications(self):
        regions = []
        seen = set()
        for device in NotificationDevice.objects.filter(enabled=True).only("city", "region", "regions", "include_favorites"):
            candidates = device.regions if device.include_favorites and device.regions else [{"city": device.city, "region": device.region}]
            for region in candidates:
                city = region.get("city")
                district = region.get("region")
                if not city or not district:
                    continue
                key = (city, district)
                if key not in seen:
                    seen.add(key)
                    regions.append(key)
        return regions

    def _all_active_regions(self):
        return list(
            AirQualityStation.objects
            .filter(is_active=True)
            .order_by("sido", "name")
            .values_list("sido", "name")
        )

    def handle(self, *args, **options):
        city = options["city"].strip()
        region = options["region"].strip()
        limit = max(0, options["limit"])

        if city and region:
            regions = [(city, region)]
        elif options["all_active"]:
            regions = self._all_active_regions()
        else:
            regions = self._regions_from_notifications() or [("서울", "강남구")]

        if limit:
            regions = regions[:limit]

        weather_cache = {}
        generated_regions = 0
        saved_predictions = 0
        skipped = 0

        for city, district in regions:
            station_name = _resolve_station_name(city, district)
            station = _find_air_quality_station(city, station_name)
            if not station:
                skipped += 1
                continue

            items = _load_recent_realtime_hourly_dust(city, district, station_name, station=station)
            if not items:
                skipped += 1
                continue

            weather_forecasts = []
            location = _current_station_location(city, station_name)
            if location:
                grid = _dfs_grid_from_lat_lng(location["lat"], location["lng"])
                grid_key = (grid["nx"], grid["ny"])
                if grid_key not in weather_cache:
                    weather_cache[grid_key] = _fetch_kma_hourly_weather_forecast_by_grid(grid, limit=12)
                weather_forecasts = weather_cache[grid_key]

            forecast_items = _build_hourly_dust_forecast(
                items,
                weather_forecasts,
                station=station,
                city=city,
                district=district,
            )
            saved = _store_hourly_dust_predictions(station, city, district, forecast_items)
            if saved:
                generated_regions += 1
                saved_predictions += saved
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(f"Hourly prediction regions generated: {generated_regions}"))
        self.stdout.write(self.style.SUCCESS(f"Hourly prediction rows stored/updated: {saved_predictions}"))
        if skipped:
            self.stdout.write(f"Hourly prediction regions skipped: {skipped}")
