from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import time

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from dust.config import AIRKOREA_REQUEST_WORKERS, SIDO_NAMES
from dust.services.airkorea_client import _fetch_realtime_station_values_for_sido
from dust.services.dust_backfill import backfill_missing_dust
from dust.services.stations import bump_dust_cache_version, _load_station_locations, _sidos_with_realtime_spikes, _store_realtime_values_to_db


def env_int(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


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
        parser.add_argument(
            "--skip-spike-retry",
            action="store_true",
            help="Do not retry a sido after detecting a short-lived realtime spike.",
        )
        parser.add_argument(
            "--spike-retry-delay",
            type=int,
            default=env_int("REALTIME_SPIKE_RETRY_DELAY_SECONDS", 600),
            help="Seconds to wait before retrying sidos with suspected one-sample spikes.",
        )
        parser.add_argument(
            "--backfill-limit",
            type=int,
            # 한 번에 너무 많이 부르면 하루 호출 한도를 넘긴다(측정소 1곳 = 호출 1번).
            default=env_int("DUST_BACKFILL_LIMIT", 20),
            help="Max stations to backfill per run when recent hours are missing (0 disables).",
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

        def collect_sidos(sidos):
            collected_values = {}
            collected_debug_rows = []
            with ThreadPoolExecutor(max_workers=AIRKOREA_REQUEST_WORKERS) as executor:
                futures = [executor.submit(_fetch_realtime_station_values_for_sido, sido) for sido in sidos]
                for future in as_completed(futures):
                    sido_values, sido_debug = future.result()
                    collected_values.update(sido_values)
                    collected_debug_rows.extend(sido_debug)
            return collected_values, collected_debug_rows

        values, debug_rows = collect_sidos(SIDO_NAMES)
        spike_sidos = [] if options["skip_spike_retry"] else _sidos_with_realtime_spikes(values)
        if spike_sidos:
            delay = max(0, options["spike_retry_delay"])
            self.stdout.write(self.style.WARNING(f"Suspected realtime spike in {', '.join(spike_sidos)}; retrying those sidos after {delay}s."))
            if delay:
                time.sleep(delay)
            retry_values, retry_debug_rows = collect_sidos(spike_sidos)
            values.update(retry_values)
            debug_rows.extend(retry_debug_rows)

        saved = _store_realtime_values_to_db(values)
        # 서버가 멈췄던 시간 등으로 비어 있는 최근 24시간 기록을 채운다. 실패해도 이번 수집은 그대로 둔다.
        # 이번 실시간 수집이 통째로 실패했으면(한도 초과·장애) 채우기도 같은 이유로 실패하니 부르지 않는다.
        if options["backfill_limit"] > 0 and values:
            try:
                filled, created, remaining = backfill_missing_dust(limit=options["backfill_limit"])
                if filled:
                    self.stdout.write(f"Backfill: stations {filled}, rows {created}, stations left {remaining}")
            except Exception as exc:
                self.stderr.write(f"Backfill failed: {exc}")
        bump_dust_cache_version()  # 측정값 캐시를 한 번에 무효화한다.

        self.stdout.write(self.style.SUCCESS(f"Realtime API rows: {len(values)}"))
        self.stdout.write(self.style.SUCCESS(f"Realtime DB rows created: {saved}"))
        if spike_sidos:
            self.stdout.write(self.style.SUCCESS(f"Realtime spike retry sidos: {', '.join(spike_sidos)}"))
        if debug_rows:
            self.stdout.write(f"First API debug row: {debug_rows[0]}")

        call_command("evaluate_hourly_dust_predictions", days=3, limit=2000)

        # 받아 온 값이 하나도 없는 시도는 실패로 본다. 받은 시도는 위에서 이미 저장했고,
        # 실패가 있으면 0이 아닌 종료 코드로 끝내서 수집 스크립트와 systemd 기록에 남긴다.
        failed_sidos = [sido for sido in SIDO_NAMES if not any(key.startswith(f"{sido}:") for key in values)]
        if failed_sidos:
            for row in debug_rows:
                if row.get("sido") in failed_sidos:
                    self.stderr.write(f"Failed sido: {row}")
            raise CommandError(
                f"AirKorea realtime collection failed for {len(failed_sidos)}/{len(SIDO_NAMES)} sidos: {', '.join(failed_sidos)}"
            )
