from django.core.management.base import BaseCommand

from dust.weather_morning_notifications import send_weather_soon_notifications


class Command(BaseCommand):
    help = "Push when rain, snow or strong wind is forecast to start within about 2 hours in a device's region."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print targets without sending push notifications.")
        parser.add_argument("--force", action="store_true", help="Ignore quiet hours and duplicate notification logs.")

    def handle(self, *args, **options):
        result = send_weather_soon_notifications(
            dry_run=options["dry_run"],
            force=options["force"],
            write=lambda message: self.stdout.write(message),
        )
        self.stdout.write(self.style.SUCCESS(f"Weather soon notifications sent: {result.sent}, failed: {result.failed}, skipped: {result.skipped}"))
