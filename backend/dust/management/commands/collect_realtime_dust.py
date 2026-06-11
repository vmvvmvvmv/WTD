from concurrent.futures import ThreadPoolExecutor, as_completed

from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import BaseCommand

from dust.views import (
    AIRKOREA_REQUEST_WORKERS,
    SIDO_NAMES,
    _fetch_realtime_station_values_for_sido,
    _load_station_locations,
    _store_realtime_values_to_db,
)


class Command(BaseCommand):
    help = "Collect AirKorea station locations and realtime dust values into the local DB."

    def add_arguments(self, parser):
        parser.add_argument(
            "--stations-only",
            action="store_true",
            help="Only refresh station location metadata.",
        )
        parser.add_argument(
            "--realtime-only",
            action="store_true",
            help="Only collect realtime measurements.",
        )

    def handle(self, *args, **options):
        stations_only = options["stations_only"]
        realtime_only = options["realtime_only"]

        if stations_only and realtime_only:
            self.stderr.write(self.style.ERROR("Use only one of --stations-only or --realtime-only."))
            return

        if not realtime_only:
            stations, station_debug = _load_station_locations(allow_api=True)
            self.stdout.write(self.style.SUCCESS(f"Stations ready: {len(stations)}"))
            if station_debug:
                self.stdout.write(f"Station source: {station_debug[0]}")

        if stations_only:
            return

        values = {}
        debug_rows = []
        with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
            futures = [executor.submit(_fetch_realtime_station_values_for_sido, sido) for sido in SIDO_NAMES]
            for future in as_completed(futures):
                sido_values, sido_debug = future.result()
                values.update(sido_values)
                debug_rows.extend(sido_debug)

        saved = _store_realtime_values_to_db(values)
        cache.delete("airkorea_realtime_station_values_v2")
        cache.delete("airkorea_realtime_station_values_v3")
        cache.delete("airkorea_realtime_station_values_v4")
        cache.delete("latest_daily_station_values_v1")
        cache.delete("korea_station_dust_response_v1")

        self.stdout.write(self.style.SUCCESS(f"Realtime API rows: {len(values)}"))
        self.stdout.write(self.style.SUCCESS(f"Realtime DB rows created: {saved}"))
        if debug_rows:
            self.stdout.write(f"First API debug row: {debug_rows[0]}")

        call_command("evaluate_hourly_dust_predictions", days=3, limit=2000)
