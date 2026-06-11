from django.core.management.base import BaseCommand

from dust.midterm_weather import MIDTERM_REGIONS
from dust.views import KMA_API_KEY, collect_midterm_weather_forecasts


class Command(BaseCommand):
    help = "Collect KMA mid-term weather forecasts and store daily forecast rows in DB."

    def add_arguments(self, parser):
        parser.add_argument("--region-key", default="", help="Collect only one configured mid-term region key.")

    def handle(self, *args, **options):
        if not KMA_API_KEY:
            self.stderr.write(self.style.ERROR("KMA_API_KEY is not configured."))
            return

        region_key = (options.get("region_key") or "").strip()
        regions = MIDTERM_REGIONS
        if region_key:
            regions = [region for region in MIDTERM_REGIONS if region["key"] == region_key]
            if not regions:
                self.stderr.write(self.style.ERROR(f"Unknown region key: {region_key}"))
                return

        self.stdout.write(f"Mid-term weather regions ready: {len(regions)}")
        saved = collect_midterm_weather_forecasts(regions)
        self.stdout.write(self.style.SUCCESS(f"Mid-term weather DB rows stored/updated: {saved}"))
