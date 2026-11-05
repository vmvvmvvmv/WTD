from django.core.management.base import BaseCommand

from dust.api_usage import send_api_usage_alerts


class Command(BaseCommand):
    help = "Alert the admin when an external API hits its limit or is used much more than usual today."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print alerts without sending or marking them.")

    def handle(self, *args, **options):
        count = send_api_usage_alerts(dry_run=options["dry_run"], write=lambda message: self.stdout.write(message))
        self.stdout.write(self.style.SUCCESS(f"API usage alerts: {count}"))
