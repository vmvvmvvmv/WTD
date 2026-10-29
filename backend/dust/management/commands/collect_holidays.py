from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from dust.config import HOLIDAY_SERVICE_KEY
from dust.services.holidays import refresh_holidays


class Command(BaseCommand):
    help = "Collect Korean public holidays (this year and next by default) into DB."

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, action="append", help="Collect only these years (repeatable).")

    def handle(self, *args, **options):
        if not HOLIDAY_SERVICE_KEY:
            raise CommandError("PUBLIC_DATA_API_KEY is not configured.")
        this_year = timezone.localdate().year
        failed = []
        for year in options.get("year") or [this_year, this_year + 1]:
            try:
                count = refresh_holidays(year)
            except Exception as error:  # 한 해가 실패해도 다른 해는 받는다.
                failed.append(year)
                # 오류 문장에 요청 URL(인증키 포함)이 들어갈 수 있어 종류만 남긴다.
                self.stderr.write(self.style.ERROR(f"{year} holidays failed: {type(error).__name__}"))
                continue
            self.stdout.write(f"{year} holidays stored: {count}" if count else f"{year} holidays not published yet, kept stored rows")
        if failed:
            raise CommandError(f"holiday collection failed: {failed}")
