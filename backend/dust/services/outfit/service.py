from datetime import timedelta

from django.utils import timezone

from .context_builder import build_outfit_request
from .data_provider import load_schedule_snapshot
from .occasion import classify_occasion
from .rule_engine import build_rule_result


CACHE_TTL = timedelta(hours=3)


class OutfitDataUnavailable(RuntimeError):
    pass


def _base_response(rule_result: dict, generated_at, valid_until) -> dict:
    return {"source": "rule", "generated_at": generated_at.isoformat(), "valid_until": valid_until.isoformat(), **rule_result}


def recommend_outfit(payload: dict) -> dict:
    request = build_outfit_request(payload)
    snapshot = load_schedule_snapshot(request)
    if snapshot.get("feels_avg") is None:
        raise OutfitDataUnavailable("날씨 데이터가 부족해 옷차림을 추천하기 어려워요.")
    occasion = classify_occasion(request.title)
    rule_result = build_rule_result(snapshot, activity_type=request.activity_type, sensitivity=request.sensitivity, occasion=occasion)
    generated_at = timezone.now()
    return _base_response(rule_result, generated_at, generated_at + CACHE_TTL)
