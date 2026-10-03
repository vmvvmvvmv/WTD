import hashlib
import json
import logging
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from .constants import SYSTEM_PROMPT
from .context_builder import OutfitRequest, build_outfit_request
from .data_provider import load_schedule_snapshot
from .llm_client import build_llm_client, llm_input_for
from .occasion import classify_occasion
from .repository import get_cached_recommendation, save_cached_recommendation
from .response_parser import validate_llm_output
from .rule_engine import build_rule_result


logger = logging.getLogger(__name__)
CACHE_TTL = timedelta(hours=3)
DAILY_LLM_LIMIT = 30


class OutfitDataUnavailable(RuntimeError):
    pass


def _cache_key(request: OutfitRequest, rule_result: dict) -> str:
    value = {
        "city": request.city,
        "region": request.region,
        "start": request.start.strftime("%Y-%m-%dT%H"),
        "end": request.end.strftime("%Y-%m-%dT%H"),
        "activity_type": rule_result["activity_type"],
        "occasion": rule_result["occasion"],
        "band": rule_result["outfit"]["band"],
        "must_have": sorted((item["type"], item["level"]) for item in rule_result["must_have"]),
        "sensitivity": request.sensitivity,
    }
    digest = hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return f"outfit:v2:{digest}"


def _base_response(rule_result: dict, generated_at, valid_until) -> dict:
    return {"source": "rule", "generated_at": generated_at.isoformat(), "valid_until": valid_until.isoformat(), **rule_result}


def _llm_allowed(client_key: str) -> bool:
    # TODO(확인 필요): 호출 상한 초과 시 429 대신 규칙 응답을 유지하는 정책을 제품 결정 후 확정한다.
    digest = hashlib.sha256((client_key or "anonymous").encode("utf-8")).hexdigest()[:24]
    key = f"outfit-llm-daily:{timezone.localdate().isoformat()}:{digest}"
    try:
        count = cache.incr(key)
    except ValueError:
        cache.set(key, 1, 60 * 60 * 25)
        count = 1
    return count <= DAILY_LLM_LIMIT


def recommend_outfit(payload: dict, *, client_key: str = "") -> dict:
    request = build_outfit_request(payload)
    snapshot = load_schedule_snapshot(request)
    if snapshot.get("feels_avg") is None:
        raise OutfitDataUnavailable("날씨 데이터가 부족해 옷차림을 추천하기 어려워요.")
    occasion = classify_occasion(request.title)
    rule_result = build_rule_result(snapshot, activity_type=request.activity_type, sensitivity=request.sensitivity, occasion=occasion)
    generated_at = timezone.now()
    valid_until = generated_at + CACHE_TTL
    rule_response = _base_response(rule_result, generated_at, valid_until)
    if request.mode == "rule":
        return rule_response

    key = _cache_key(request, rule_result)
    cached = get_cached_recommendation(key)
    if cached:
        return {**cached, "cached": True}
    client = build_llm_client()
    if client is None or not _llm_allowed(client_key):
        return rule_response
    llm_input = llm_input_for(rule_result, request)
    try:
        generated = client.generate(SYSTEM_PROMPT, llm_input)
        validated = validate_llm_output(generated, llm_input=llm_input, must_have=rule_result["must_have"], temp_range=snapshot.get("temp_range"))
        result = {**rule_response, "source": "llm", "summary": validated["summary"], "outfit_note": validated["outfit_note"], "layering_tip": validated["layering_tip"]}
        result["must_have"] = [{**item, "reason": validated["reasons"][item["type"]]} for item in rule_result["must_have"]]
    except Exception:
        logger.warning("Outfit LLM failed validation; returning rule result.", exc_info=True)
        result = rule_response
    save_cached_recommendation(key, result, result["source"], valid_until)
    return result
