"""바깥 API 호출 수 세기와 관리자 알림.

한도 숫자는 두지 않는다. 대신 ① 한도 초과 오류가 그날 처음 나면, ② 오늘 쓰는 속도가 지난 7일 평균의 1.5배를 넘으면
ADMIN_EXPO_PUSH_TOKENS(쉼표로 여러 개)로 푸시를 보낸다. 토큰이 없으면 기록(journalctl)에만 남긴다.
우리 서버가 부른 횟수만 센다. 같은 키를 다른 곳에서도 쓰면 실제 사용량보다 적게 보인다.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Callable
from urllib.parse import urlparse

from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from dust.models import ExternalApiUsage

SPIKE_RATIO = 1.5
SPIKE_MIN_CALLS = 50
SPIKE_MIN_DAY_FRACTION = 0.25  # 아침 6시 전에는 하루 중 일부만 보고 판단하기엔 흔들려서 보지 않는다.
SPIKE_MIN_HISTORY_DAYS = 3
LIMIT_MARKERS = ("limited_number_of_service_requests", "quota exceeded", "<resultcode>22<", '"resultcode":"22"', "rate limit")
API_NAMES = (
    ("B552584", "에어코리아"),
    ("VilageFcst", "기상청 단기예보"),
    ("MidFcst", "기상청 중기예보"),
    ("WthrWrn", "기상특보"),
    ("AsosDaly", "기상청 과거 관측"),
    ("SpcdeInfo", "공휴일"),
    ("openapi.naver.com", "네이버 장소 검색"),
    ("geocode", "네이버 주소 검색"),
    ("generativelanguage", "Gemini"),
)


def api_label(url: str) -> str:
    parsed = urlparse(url)
    parts = [part for part in parsed.path.split("/") if part][:3]
    return "/".join([parsed.netloc, *parts])[:120]


def api_display_name(label: str) -> str:
    name = next((name for marker, name in API_NAMES if marker in label), label.split("/")[0])
    return f"{name}({label.rsplit('/', 1)[-1]})" if "/" in label else name


def is_limit_response(response) -> bool:
    if response is None:
        return False
    if response.status_code == 429:
        return True
    content = getattr(response, "content", b"") or b""
    if len(content) > 4096:
        return False
    text = content.decode("utf-8", "ignore").lower().replace(" ", "")
    return any(marker.replace(" ", "") in text for marker in LIMIT_MARKERS)


def record_api_call(url: str, response=None) -> None:
    """호출 한 번을 센다. 세다가 실패해도 API 호출 결과에는 영향을 주지 않는다."""
    try:
        day, api = timezone.localdate(), api_label(url)
        changes = {"calls": F("calls") + 1}
        if is_limit_response(response):
            changes["limit_errors"] = F("limit_errors") + 1
        if not ExternalApiUsage.objects.filter(day=day, api=api).update(**changes):
            try:
                with transaction.atomic():
                    ExternalApiUsage.objects.create(day=day, api=api, calls=1, limit_errors=1 if "limit_errors" in changes else 0)
            except IntegrityError:
                ExternalApiUsage.objects.filter(day=day, api=api).update(**changes)
    except Exception:
        pass


def usage_alerts(now: datetime | None = None) -> list[tuple[ExternalApiUsage, str, str]]:
    """[(오늘 행, 'limit'|'spike', 알림 문장)] — 아직 알리지 않은 것만."""
    now = timezone.localtime(now or timezone.now())
    today = now.date()
    day_fraction = (now.hour * 60 + now.minute) / 1440
    alerts = []
    for row in ExternalApiUsage.objects.filter(day=today):
        name = api_display_name(row.api)
        if row.limit_errors and not row.limit_alerted:
            alerts.append((row, "limit", f"{name} 한도 초과 오류가 났어요(오늘 {row.calls}번 호출, 오류 {row.limit_errors}번)."))
            continue
        if row.spike_alerted or row.calls < SPIKE_MIN_CALLS or day_fraction < SPIKE_MIN_DAY_FRACTION:
            continue
        history = list(
            ExternalApiUsage.objects.filter(api=row.api, day__gte=today - timedelta(days=7), day__lt=today, calls__gt=0)
            .values_list("calls", flat=True)
        )
        if len(history) < SPIKE_MIN_HISTORY_DAYS:
            continue
        average = sum(history) / len(history)
        projected = row.calls / day_fraction
        if projected > average * SPIKE_RATIO:
            alerts.append((row, "spike", f"{name} 사용량이 평소보다 많아요(지금 {row.calls}번, 이대로면 하루 약 {round(projected)}번 · 평소 {round(average)}번)."))
    return alerts


def send_api_usage_alerts(now: datetime | None = None, dry_run: bool = False, write: Callable[[str], None] | None = None) -> int:
    from dust.weather_morning_notifications import send_expo_push

    write = write or (lambda _message: None)
    tokens = [token.strip() for token in os.getenv("ADMIN_EXPO_PUSH_TOKENS", "").split(",") if token.strip()]
    sent = 0
    for row, kind, body in usage_alerts(now):
        write(f"API usage alert: {body}")
        if dry_run:
            continue
        for token in tokens:
            try:
                send_expo_push(token, "API 사용량 알림", body, {"type": "api_usage", "api": row.api})
            except Exception as exc:
                write(f"Admin push failed: {exc}")
        ExternalApiUsage.objects.filter(pk=row.pk).update(**{f"{kind}_alerted": True})
        sent += 1
    return sent
