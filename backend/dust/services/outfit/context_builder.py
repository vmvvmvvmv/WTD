from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from django.utils import timezone
from django.utils.dateparse import parse_datetime


ACTIVITY_TYPES = {"indoor", "outdoor", "transit", "auto"}
SENSITIVITIES = {"cold", "normal", "hot"}


class OutfitContextError(ValueError):
    pass


@dataclass(frozen=True)
class OutfitRequest:
    schedule_id: str
    title: str
    start: Any
    end: Any
    activity_type: str
    lat: float | None
    lng: float | None
    city: str
    region: str
    sensitivity: str


def _coordinate(value: Any, minimum: float, maximum: float) -> float | None:
    if value in (None, ""):
        return None
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise OutfitContextError("위치 좌표 형식이 올바르지 않습니다.") from exc
    if result < minimum or result > maximum:
        raise OutfitContextError("위치 좌표가 허용 범위를 벗어났습니다.")
    return result


def _date_time(value: Any, field: str):
    try:
        parsed = parse_datetime(str(value or "").strip())
    except ValueError:  # 형식은 맞지만 없는 시각(예: 25:00, 2월 30일)
        parsed = None
    if parsed is None:
        raise OutfitContextError(f"{field}는 ISO8601 형식이어야 합니다.")
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def build_outfit_request(payload: dict[str, Any]) -> OutfitRequest:
    start = _date_time(payload.get("start"), "start")
    end = _date_time(payload["end"], "end") if payload.get("end") else start + timedelta(hours=2)
    if end <= start or end - start > timedelta(hours=24):
        raise OutfitContextError("일정 종료 시각은 시작 이후 24시간 이내여야 합니다.")
    activity_type = str(payload.get("activity_type") or "outdoor").strip().lower()
    sensitivity = str(payload.get("sensitivity") or "normal").strip().lower()
    if activity_type not in ACTIVITY_TYPES:
        raise OutfitContextError("지원하지 않는 활동 유형입니다.")
    if sensitivity not in SENSITIVITIES:
        raise OutfitContextError("지원하지 않는 체감 성향입니다.")
    return OutfitRequest(
        schedule_id=str(payload.get("schedule_id") or "")[:120],
        title=str(payload.get("title") or "")[:120],
        start=start,
        end=end,
        activity_type=activity_type,
        lat=_coordinate(payload.get("lat"), -90, 90),
        lng=_coordinate(payload.get("lng"), -180, 180),
        city=str(payload.get("city") or "")[:40],
        region=str(payload.get("region") or "")[:80],
        sensitivity=sensitivity,
    )
