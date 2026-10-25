from concurrent.futures import ThreadPoolExecutor, as_completed
import os
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from dust.external_api import public_api_get
from dust.models import AirQualityStation
from dust.config import AIRKOREA_HEADERS, KMA_API_KEY, KMA_ULTRA_SHORT_FORECAST_URL
from dust.services.common import _dfs_grid_from_lat_lng
from dust.services.weather import _fetch_kma_hourly_weather_forecast_by_grid, _kma_ultra_short_base_datetime_candidates, _store_current_observation, _store_weather_hourly_measurement


def env_int(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# 앱은 72시간을 요청한다(홈·캘린더). 단기예보가 대략 3일 뒤까지라 그보다 길게 잡을 이유는 없다.
# 단기예보는 글피 자정까지(발표 시각에 따라 최대 약 80시간) 온다. 72시간에서 자르면 사흘 뒤 하루가 비고,
# 중기예보는 그다음 날부터라 그날 일정이 '확인 중'이 된다. 그래서 96시간 아래로는 줄이지 않는다.
DEFAULT_FORECAST_HOURS = max(env_int("KMA_FORECAST_HOURS", 96), 96)
DEFAULT_WORKERS = env_int("KMA_REQUEST_WORKERS", 2)
DEFAULT_USE_STATION_ADDRESS_REGIONS = os.getenv("KMA_USE_STATION_ADDRESS_REGIONS", "true").strip().lower() not in ("0", "false", "no", "off")
DEFAULT_ULTRA_SHORT_CANDIDATES = env_int("KMA_ULTRA_SHORT_CANDIDATES", 1)
DISTRICT_SUFFIXES = ("\uad6c", "\uad70")
CITY_SUFFIX = "\uc2dc"
TOWN_SUFFIXES = ("\uc74d", "\uba74", "\ub3d9")


def _station_address_region_key(station):
    parts = str(station.addr or "").split()
    if not parts:
        return f"{station.sido}:{station.name}"

    sido = station.sido or parts[0]
    district = next((part for part in parts if re.search(r"(구|군)$", part)), "")
    if not district:
        district = next((part for part in parts[1:] if re.search(r"시$", part)), "")
    town = next((part for part in parts if re.search(r"(읍|면|동)$", part)), "")
    if district:
        return f"{sido}:{district}"
    if town:
        return f"{sido}:{town}"
    return f"{sido}:{station.name}"


def _representative_stations_by_address_region(stations):
    representatives = {}
    for station in stations:
        key = _station_address_region_key(station)
        current = representatives.get(key)
        if current is None or len(station.addr or "") > len(current.addr or ""):
            representatives[key] = station
    return representatives


def _station_address_region_key(station):
    parts = str(station.addr or "").split()
    if not parts:
        return f"{station.sido}:{station.name}"

    sido = station.sido or parts[0]
    district = next((part for part in parts if part.endswith(DISTRICT_SUFFIXES)), "")
    if not district:
        district = next((part for part in parts[1:] if part.endswith(CITY_SUFFIX)), "")
    town = next((part for part in parts if part.endswith(TOWN_SUFFIXES)), "")
    if district:
        return f"{sido}:{district}"
    if town:
        return f"{sido}:{town}"
    return f"{sido}:{station.name}"


def _normalize_items(items):
    if isinstance(items, dict):
        return [items]
    if isinstance(items, list):
        return items
    return []


def _collect_grid_weather(
    grid,
    forecast_hours=DEFAULT_FORECAST_HOURS,
    ultra_short_candidate_limit=DEFAULT_ULTRA_SHORT_CANDIDATES,
    use_ultra_short=True,
    use_village_fallback=True,
):
    attempts = []
    saved_keys = set()
    saved = 0
    if use_ultra_short:
        for base_date, base_time, current_time in _kma_ultra_short_base_datetime_candidates(limit=ultra_short_candidate_limit):
            params = {
                "serviceKey": KMA_API_KEY,
                "pageNo": "1",
                "numOfRows": "60",
                "dataType": "JSON",
                "base_date": base_date,
                "base_time": base_time,
                "nx": grid["nx"],
                "ny": grid["ny"],
            }
            try:
                response = public_api_get(KMA_ULTRA_SHORT_FORECAST_URL, params=params, timeout=10)
                data = response.json()
            except Exception as exc:
                attempts.append(f"{base_date}{base_time}: {exc.__class__.__name__}")
                continue

            header = data.get("response", {}).get("header", {})
            result_code = header.get("resultCode")
            if response.status_code >= 400 or result_code not in (None, "00"):
                attempts.append(f"{base_date}{base_time}: status={response.status_code}, resultCode={result_code}")
                continue

            items = _normalize_items(data.get("response", {}).get("body", {}).get("items", {}).get("item", []))
            grouped = {}
            for item in items:
                fcst_date = str(item.get("fcstDate") or "")
                fcst_time = str(item.get("fcstTime") or "")
                category = str(item.get("category") or "")
                value = str(item.get("fcstValue") or "")
                if not fcst_date or not fcst_time or not category:
                    continue
                grouped.setdefault(f"{fcst_date}{fcst_time}", {})[category] = value

            forecast_keys = [
                key for key in sorted(grouped)
                if key >= f"{base_date}{current_time}" and grouped.get(key, {}).get("T1H") not in (None, "")
            ][:forecast_hours]
            if not forecast_keys:
                attempts.append(f"{base_date}{base_time}: no usable forecast item")
                continue

            for selected_key in forecast_keys:
                selected = grouped.get(selected_key) or {}
                if _store_weather_hourly_measurement(grid, selected_key, selected):
                    saved_keys.add(selected_key)
                    saved += 1

            if saved:
                break

            attempts.append(f"{base_date}{base_time}: store skipped")

    if use_village_fallback and saved < forecast_hours:
        for item in _fetch_kma_hourly_weather_forecast_by_grid(grid, limit=forecast_hours):
            date_text = str(item.get("date") or "").replace("-", "")
            hour_text = str(item.get("hour") or "").replace(":", "")
            selected_key = f"{date_text}{hour_text[:4]}"
            if not selected_key or selected_key in saved_keys:
                continue
            selected = {
                "T1H": item.get("temperature"),
                "REH": item.get("humidity"),
                "WSD": item.get("wind_speed"),
                "VEC": item.get("wind_direction"),
                "RN1": item.get("rain_mm"),
                "POP": item.get("rain_probability"),
                "SKY": item.get("sky"),
                "PTY": item.get("precipitation_type"),
            }
            if _store_weather_hourly_measurement(grid, selected_key, selected):
                saved_keys.add(selected_key)
                saved += 1
            if saved >= forecast_hours:
                break

    # 예보를 다 저장한 뒤 지금 시각 한 행만 실측으로 덮는다(먼저 덮으면 예보가 다시 덮어쓴다).
    if use_ultra_short:
        _store_current_observation(grid)

    if saved:
        return saved, None

    return 0, "; ".join(attempts[:3])


class Command(BaseCommand):
    help = "Collect current KMA weather values by forecast grid and store them in DB."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=0, help="Limit the number of weather grids to collect.")
        parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS, help="Number of concurrent KMA requests.")
        parser.add_argument("--forecast-hours", type=int, default=DEFAULT_FORECAST_HOURS, help="Maximum future hourly weather rows to store per grid.")
        parser.add_argument(
            "--ultra-short-candidates",
            type=int,
            default=DEFAULT_ULTRA_SHORT_CANDIDATES,
            help="Number of ultra-short KMA base times to try per grid.",
        )
        parser.add_argument(
            "--no-village-fallback",
            action="store_true",
            help="Do not call the heavier village forecast API when ultra-short rows are insufficient.",
        )
        parser.add_argument(
            "--skip-ultra-short",
            action="store_true",
            help="Skip the ultra-short forecast API and collect only via the village forecast fallback.",
        )
        parser.add_argument(
            "--all-station-grids",
            action="store_true",
            help="Collect every active station grid instead of one representative grid per station address region.",
        )

    def handle(self, *args, **options):
        if not KMA_API_KEY:
            raise CommandError("KMA_API_KEY is not configured.")

        stations = list(AirQualityStation.objects.filter(is_active=True).only("sido", "name", "addr", "lat", "lng"))
        if DEFAULT_USE_STATION_ADDRESS_REGIONS and not options["all_station_grids"]:
            stations = list(_representative_stations_by_address_region(stations).values())

        grids = {}
        for station in stations:
            grid = _dfs_grid_from_lat_lng(station.lat, station.lng)
            grids[(grid["nx"], grid["ny"])] = grid

        limit = options.get("limit") or 0
        grid_values = list(grids.values())
        if limit > 0:
            grid_values = grid_values[:limit]

        saved = 0
        skipped = 0
        skipped_reasons = []
        worker_count = max(1, min(options.get("workers") or DEFAULT_WORKERS, len(grid_values) or 1))
        forecast_hours = max(1, min(options.get("forecast_hours") or DEFAULT_FORECAST_HOURS, DEFAULT_FORECAST_HOURS))
        ultra_short_candidate_limit = max(1, min(options.get("ultra_short_candidates") or DEFAULT_ULTRA_SHORT_CANDIDATES, 4))
        use_ultra_short = not options["skip_ultra_short"]
        use_village_fallback = not options["no_village_fallback"]
        self.stdout.write(f"Weather source stations: {len(stations)}")
        self.stdout.write(f"Weather grids ready: {len(grid_values)}")
        self.stdout.write(f"KMA request workers: {worker_count}")
        self.stdout.write(f"Forecast rows per grid: up to {forecast_hours}")
        self.stdout.write(f"Ultra-short forecast: {'on' if use_ultra_short else 'off'}")
        self.stdout.write(f"Ultra-short base candidates: {ultra_short_candidate_limit}")
        self.stdout.write(f"Village forecast fallback: {'on' if use_village_fallback else 'off'}")

        def collect_grid(grid):
            close_old_connections()
            try:
                return _collect_grid_weather(
                    grid,
                    forecast_hours=forecast_hours,
                    ultra_short_candidate_limit=ultra_short_candidate_limit,
                    use_ultra_short=use_ultra_short,
                    use_village_fallback=use_village_fallback,
                )
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            futures = {executor.submit(collect_grid, grid): grid for grid in grid_values}
            for index, future in enumerate(as_completed(futures), start=1):
                grid = futures[future]
                try:
                    stored_count, reason = future.result()
                except Exception as exc:
                    stored_count = 0
                    reason = exc.__class__.__name__

                if stored_count:
                    saved += stored_count
                else:
                    skipped += 1
                    if reason and len(skipped_reasons) < 5:
                        skipped_reasons.append(f"{grid['nx']},{grid['ny']}: {reason}")

                if index % 50 == 0 or index == len(grid_values):
                    self.stdout.write(f"Weather progress: {index}/{len(grid_values)}")

        self.stdout.write(self.style.SUCCESS(f"Weather DB rows stored/updated: {saved}"))
        if skipped:
            self.stdout.write(f"Weather grids skipped: {skipped}")
        for reason in skipped_reasons:
            self.stdout.write(f"Weather skipped sample: {reason}")

        # 아무 값도 저장하지 못한 격자는 실패로 본다. 저장한 격자는 그대로 두고,
        # 실패가 있으면 0이 아닌 종료 코드로 끝내서 수집 스크립트와 systemd 기록에 남긴다.
        if not grid_values:
            raise CommandError("No active station grids to collect weather for.")
        if skipped:
            raise CommandError(f"KMA weather collection failed for {skipped}/{len(grid_values)} grids.")
