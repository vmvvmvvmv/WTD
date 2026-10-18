from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from dust.models import DustChatLog, DustNotificationLog, LlmDailyUsage, NotificationDevice, OutfitRecommendationCache

# 개인정보 처리방침(/privacy/)에 적은 보유 기간. 바꾸면 처리방침 문구도 같이 바꾼다.
RETENTION_DAYS = 30


class Command(BaseCommand):
    help = "보유 기간이 지난 기록을 지운다: AI 사용 횟수, 알림을 끈 기기, 알림 발송 기록, 챗봇 기록, 만료된 옷차림 저장값."

    def handle(self, *args, **options):
        now = timezone.now()
        cutoff = now - timedelta(days=RETENTION_DAYS)
        deleted = {
            "llm_daily_usage": LlmDailyUsage.objects.filter(day__lt=cutoff.date()).delete()[0],
            # 알림을 끄거나 앱을 지워 푸시가 실패하면 enabled=False가 된다. 그 뒤 30일이 지나면 기기 정보(와 그 기기의 발송 기록)를 지운다.
            "notification_device": NotificationDevice.objects.filter(enabled=False, updated_at__lt=cutoff).delete()[0],
            "dust_notification_log": DustNotificationLog.objects.filter(created_at__lt=cutoff).delete()[0],
            "dust_chat_log": DustChatLog.objects.filter(created_at__lt=cutoff).delete()[0],
            "outfit_recommendation_cache": OutfitRecommendationCache.objects.filter(valid_until__lt=now).delete()[0],
        }
        self.stdout.write(" ".join(f"{name}={count}" for name, count in deleted.items()))
