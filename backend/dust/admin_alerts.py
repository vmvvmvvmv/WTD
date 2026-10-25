"""관리자 알림: 데이터 수집이 멈추는 등 운영 문제를 관리자 폰으로 푸시한다.

받을 기기는 .env의 ADMIN_PUSH_TOKENS(쉼표로 구분한 Expo 푸시 토큰)로 정한다. 비어 있으면 보내지 않는다.
같은 문제는 3시간에 한 번만 보낸다(매시간 실패해도 알림이 쌓이지 않게).
"""
import logging
import os

from django.core.cache import cache

from dust.weather_morning_notifications import send_expo_push

logger = logging.getLogger(__name__)

REPEAT_SECONDS = 3 * 60 * 60


def alert_admins(key: str, title: str, body: str) -> int:
    tokens = [token.strip() for token in os.getenv("ADMIN_PUSH_TOKENS", "").split(",") if token.strip()]
    # cache.add는 키가 없을 때만 넣으므로, 이미 보낸 문제면 False가 돌아온다.
    if not tokens or not cache.add(f"admin_alert:{key}", True, REPEAT_SECONDS):
        return 0
    sent = 0
    for token in tokens:
        try:
            send_expo_push(token, title, body, {"type": "admin_alert"})
            sent += 1
        except Exception:
            logger.warning("Admin alert push failed.", exc_info=True)
    return sent
