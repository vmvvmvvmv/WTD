"""디스크 감시: 매시간 수집 전에 돌린다(collect_hourly.sh).

경고선을 넘으면 관리자 폰으로 알리고, 정리선을 넘으면 지워도 안전한 것(앱 캐시, MySQL binlog)을 먼저 지운다.
2026-11-20 binlog가 30일치 쌓여 디스크가 100%가 되어 API가 500을 낸 장애를 다시 겪지 않으려고 만들었다.
"""
import logging
import shutil

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from dust.admin_alerts import alert_admins

logger = logging.getLogger(__name__)


def used_percent() -> int:
    usage = shutil.disk_usage(settings.BASE_DIR)
    return round(usage.used / usage.total * 100)


def clean_disk() -> list[str]:
    cleaned = []
    try:
        cache.clear()
        cleaned.append("앱 캐시")
    except Exception:
        logger.warning("Disk cleanup: cache clear failed.", exc_info=True)
    if connection.vendor == "mysql":
        try:
            with connection.cursor() as cursor:
                cursor.execute("PURGE BINARY LOGS BEFORE NOW() - INTERVAL 1 DAY")
            cleaned.append("MySQL binlog")
        except Exception:
            # DB 계정에 BINLOG_ADMIN 권한이 없으면 여기로 온다(deploy/README.md 참고).
            logger.warning("Disk cleanup: binlog purge failed.", exc_info=True)
    return cleaned


class Command(BaseCommand):
    help = "Alert admins when the disk is nearly full, and clean safe-to-delete files past the cleanup line."

    def add_arguments(self, parser):
        parser.add_argument("--warn-percent", type=int, default=80)
        parser.add_argument("--clean-percent", type=int, default=90)

    def handle(self, *args, **options):
        warn, clean = options["warn_percent"], options["clean_percent"]
        before = used_percent()
        if before < warn:
            self.stdout.write(f"Disk usage {before}%: ok")
            return
        cleaned = clean_disk() if before >= clean else []
        after = used_percent() if cleaned else before
        body = f"사용 {before}%"
        if cleaned:
            body += f" → 자동 정리 후 {after}% ({', '.join(cleaned)})"
        if after >= clean:
            body += ". 직접 확인이 필요해요: df -h /"
        alert_admins(f"disk:{'clean' if before >= clean else 'warn'}", "[WTD] 서버 디스크가 거의 찼어요", body)
        self.stdout.write(self.style.WARNING(body))
        if after >= clean:
            raise CommandError(f"Disk usage still {after}% after cleanup")
