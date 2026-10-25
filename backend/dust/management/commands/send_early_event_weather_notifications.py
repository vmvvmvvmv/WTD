from django.core.management.base import BaseCommand

from dust.weather_morning_notifications import send_early_event_weather_notifications


class Command(BaseCommand):
    help = "Send a weather push about an hour before events that start before the 7 a.m. morning push."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print targets without sending push notifications.")
        parser.add_argument("--force", action="store_true", help="Ignore duplicate notification logs.")

    def handle(self, *args, **options):
        result = send_early_event_weather_notifications(dry_run=options["dry_run"], force=options["force"], write=lambda message: self.stdout.write(message))
        self.stdout.write(self.style.SUCCESS(f"Early event weather notifications sent: {result.sent}, failed: {result.failed}, skipped: {result.skipped}"))
