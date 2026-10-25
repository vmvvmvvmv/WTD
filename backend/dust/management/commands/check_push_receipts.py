from django.core.management.base import BaseCommand, CommandError

from dust.push_receipts import check_push_receipts


class Command(BaseCommand):
    help = "Check Expo push receipts: disable uninstalled devices and fail loudly when pushes are not delivered."

    def handle(self, *args, **options):
        result = check_push_receipts(write=lambda message: self.stdout.write(message))
        self.stdout.write(f"Push receipts ok: {result.ok}, failed: {result.failed}, unregistered: {result.unregistered}")
        # 실패가 있으면 0이 아닌 값으로 끝내 수집 스크립트가 실패로 기록하게 한다.
        if result.failed:
            raise CommandError(f"{result.failed} push notifications were not delivered: {', '.join(sorted(result.errors))}")
