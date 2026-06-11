from django.core.management.base import BaseCommand

from dust.weather_morning_notifications import parse_target_date, send_weather_morning_notifications


class Command(BaseCommand):
    help = "Send server-side morning weather push notifications."

    def add_arguments(self, parser):
        parser.add_argument("--date", help="Target date in YYYY-MM-DD. Defaults to today.")
        parser.add_argument("--dry-run", action="store_true", help="Print targets without sending push notifications.")
        parser.add_argument("--force", action="store_true", help="Ignore duplicate notification logs.")

    def handle(self, *args, **options):
        target_date = parse_target_date(options.get("date"))
        result = send_weather_morning_notifications(
            target_date=target_date,
            dry_run=options["dry_run"],
            force=options["force"],
            write=lambda message: self.stdout.write(message),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Weather morning notifications sent: {result.sent}, failed: {result.failed}, skipped: {result.skipped}"
            )
        )
