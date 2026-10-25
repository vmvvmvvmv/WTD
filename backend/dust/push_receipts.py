"""푸시 전달 확인: Expo가 접수한 푸시(티켓)의 영수증을 보고 실제로 기기에 갔는지 확인한다.

접수 응답이 "ok"여도 FCM 쪽에서 실패할 수 있다(예: 서비스 계정 권한 오류, 앱 삭제).
영수증은 접수 후 몇 분 뒤에 나오고 Expo가 약 하루 보관한다. 그래서 15분 지난 티켓만 묻고, 하루 지난 티켓은 버린다.
- DeviceNotRegistered: 앱이 지워진 기기라 알림을 끈다(다시 보내도 실패한다).
- 그 밖의 오류: 개수와 종류를 남겨 수집 로그(journalctl)에서 보이게 한다.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable

import requests
from django.utils import timezone

from dust.models import ExpoPushTicket, NotificationDevice
from dust.weather_morning_notifications import expo_request_headers

logger = logging.getLogger(__name__)

EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts"
RECEIPT_DELAY = timedelta(minutes=15)
RECEIPT_KEEP = timedelta(hours=24)
BATCH_SIZE = 300  # Expo는 한 번에 1000개까지 받는다.


@dataclass
class PushReceiptResult:
    ok: int = 0
    failed: int = 0
    unregistered: int = 0
    errors: set[str] = field(default_factory=set)


def check_push_receipts(now: datetime | None = None, write: Callable[[str], None] | None = None) -> PushReceiptResult:
    write = write or (lambda _message: None)
    now = now or timezone.now()
    result = PushReceiptResult()
    ExpoPushTicket.objects.filter(created_at__lt=now - RECEIPT_KEEP).delete()
    tickets = list(ExpoPushTicket.objects.filter(created_at__lte=now - RECEIPT_DELAY).values_list("ticket_id", "expo_push_token")[:1000])
    for start in range(0, len(tickets), BATCH_SIZE):
        batch = dict(tickets[start:start + BATCH_SIZE])
        response = requests.post(EXPO_RECEIPTS_URL, json={"ids": list(batch)}, headers=expo_request_headers(), timeout=15)
        response.raise_for_status()
        receipts = (response.json() or {}).get("data") or {}
        checked = []
        for ticket_id, token in batch.items():
            receipt = receipts.get(ticket_id)
            if not isinstance(receipt, dict):
                continue  # 아직 결과가 없다. 다음 실행 때 다시 묻는다(하루 지나면 버린다).
            checked.append(ticket_id)
            if receipt.get("status") == "ok":
                result.ok += 1
                continue
            error = (receipt.get("details") or {}).get("error") or receipt.get("message") or "unknown"
            if error == "DeviceNotRegistered":
                result.unregistered += 1
                NotificationDevice.objects.filter(expo_push_token=token).update(enabled=False, calendar_events=[])
            else:
                result.failed += 1
                result.errors.add(str(error)[:120])
        ExpoPushTicket.objects.filter(ticket_id__in=checked).delete()
    if result.failed:
        logger.warning("Expo push receipts failed: %s (%s)", result.failed, ", ".join(sorted(result.errors)))
        write(f"Push delivery failed: {result.failed} ({', '.join(sorted(result.errors))})")
    return result
