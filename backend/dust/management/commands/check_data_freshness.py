import json

from django.core.management.base import BaseCommand, CommandError

from dust.admin_alerts import alert_admins
from dust.data_freshness import inspect_data_freshness


class Command(BaseCommand):
    help = "Check whether local dust and hourly weather data were collected recently."

    def add_arguments(self, parser):
        parser.add_argument("--max-dust-age-hours", type=int, default=3)
        parser.add_argument("--max-weather-age-hours", type=int, default=6)
        parser.add_argument("--json", action="store_true", dest="as_json")
        parser.add_argument(
            "--allow-stale",
            action="store_true",
            help="Print the result without returning a non-zero exit code.",
        )

    def handle(self, *args, **options):
        result = inspect_data_freshness(
            max_dust_age_hours=max(1, options["max_dust_age_hours"]),
            max_weather_age_hours=max(1, options["max_weather_age_hours"]),
        )

        if options["as_json"]:
            self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            self.stdout.write(f"Active stations: {result['active_station_count']}")
            for item in result["datasets"]:
                latest = item["latest_at"] or "none"
                age = f"{item['age_hours']}h" if item["age_hours"] is not None else "unknown"
                self.stdout.write(
                    f"{item['name']}: {item['status']} "
                    f"(latest={latest}, age={age}, rows={item['row_count']})"
                )

        if not result["ok"]:
            # 수집이 멈추면 관리자 폰으로 알린다(ADMIN_PUSH_TOKENS가 있을 때, 같은 문제는 3시간에 한 번).
            problems = ", ".join(result["problems"])
            alert_admins(f"freshness:{problems}", "[WTD] 데이터 수집이 멈췄어요", f"오래된 데이터: {problems}")
        if not result["ok"] and not options["allow_stale"]:
            raise CommandError("Data freshness check failed: " + ", ".join(result["problems"]))

        if result["ok"]:
            self.stdout.write(self.style.SUCCESS("Local data is fresh."))
        else:
            self.stdout.write(self.style.WARNING("Local data is stale or incomplete."))
