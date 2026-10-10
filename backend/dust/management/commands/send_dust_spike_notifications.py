from django.core.management.base import BaseCommand

from dust.dust_spike_notifications import send_dust_spike_notifications


class Command(BaseCommand):
    help = "Push once a day when today's PM10 becomes bad (measured now or predicted later today)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print targets without sending push notifications.")
        parser.add_argument("--force", action="store_true", help="Ignore quiet hours and duplicate notification logs.")

    def handle(self, *args, **options):
        result = send_dust_spike_notifications(
            dry_run=options["dry_run"],
            force=options["force"],
            write=lambda message: self.stdout.write(message),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Dust spike notifications sent: {result.sent}, failed: {result.failed}, skipped: {result.skipped}"
            )
        )
