import hashlib
import json
import logging
from datetime import timedelta

from django.utils import timezone

from .aggregation import rain_condition
from .constants import SYSTEM_PROMPT
from .context_builder import OutfitContextError, OutfitRequest, build_outfit_request
from .data_provider import load_schedule_snapshot
from .llm_client import build_llm_client, llm_input_for
from .occasion import classify_occasion
from .repository import get_cached_recommendation, save_cached_recommendation
from .response_parser import validate_llm_output
from .rule_engine import build_rule_result, rain_window_label
from .service import CACHE_TTL, OutfitDataUnavailable, _base_response, _llm_allowed


logger = logging.getLogger(__name__)
MAX_DAILY_SCHEDULES = 12
CONDITION_PRIORITY = {"snow": 5, "rain": 4, "strong_wind": 3, "showers": 2, "normal": 1}


def _requests(payload: dict) -> list[OutfitRequest]:
    schedules = payload.get("schedules")
    if not isinstance(schedules, list) or not schedules:
        raise OutfitContextError("schedules에는 하나 이상의 일정이 필요합니다.")
    if len(schedules) > MAX_DAILY_SCHEDULES:
        raise OutfitContextError(f"하루 일정은 최대 {MAX_DAILY_SCHEDULES}개까지 추천할 수 있습니다.")
    shared = {"sensitivity": payload.get("sensitivity"), "mode": payload.get("mode")}
    result = []
    for schedule in schedules:
        if not isinstance(schedule, dict):
            raise OutfitContextError("일정 형식이 올바르지 않습니다.")
        result.append(build_outfit_request({**schedule, **shared}))
    return result


def _values(snapshots: list[dict], key: str) -> list[float]:
    return [float(snapshot[key]) for snapshot in snapshots if snapshot.get(key) is not None]


def merge_daily_snapshots(snapshots: list[dict]) -> dict:
    feels_min = _values(snapshots, "feels_min")
    feels_max = _values(snapshots, "feels_max")
    feels_avg = _values(snapshots, "feels_avg")
    result = {
        "feels_min": min(feels_min) if feels_min else None,
        "feels_max": max(feels_max) if feels_max else None,
        # 하루 종일 유지할 기본 복장은 가장 추운 일정에도 대응해야 한다.
        # 높은 기온 구간은 temp_range에 따른 레이어링 안내로 보완한다.
        "feels_avg": min(feels_avg) if feels_avg else None,
        "rain_prob_max": max(_values(snapshots, "rain_prob_max"), default=None),
        "rain_mm_max": max(_values(snapshots, "rain_mm_max"), default=None),
        "wind_max": max(_values(snapshots, "wind_max"), default=None),
        "pm10_max": max(_values(snapshots, "pm10_max"), default=None),
        "pm25_max": max(_values(snapshots, "pm25_max"), default=None),
        "has_snow": any(snapshot.get("has_snow") for snapshot in snapshots),
        "has_rain": any(snapshot.get("has_rain") for snapshot in snapshots),
        "has_mixed_precipitation": any(snapshot.get("has_mixed_precipitation") for snapshot in snapshots),
        "rain_hours": sum(int(snapshot.get("rain_hours") or 0) for snapshot in snapshots),
        "total_hours": sum(int(snapshot.get("total_hours") or 0) for snapshot in snapshots),
        "rain_start": min((snapshot["rain_start"] for snapshot in snapshots if snapshot.get("rain_start")), default=None),
        "rain_end": max((snapshot["rain_end"] for snapshot in snapshots if snapshot.get("rain_end")), default=None),
        "data_gaps": list(dict.fromkeys(gap for snapshot in snapshots for gap in snapshot.get("data_gaps", []))),
    }
    result["temp_range"] = round(result["feels_max"] - result["feels_min"], 1) if result["feels_min"] is not None and result["feels_max"] is not None else None
    condition = max((snapshot.get("weather_condition", "normal") for snapshot in snapshots), key=lambda value: CONDITION_PRIORITY.get(value, 0), default="normal")
    # 하루 기본 복장은 짧은 일정 하나의 비 때문에 바꾸지 않는다. 일정 전체에서 비가 차지하는 비율로 다시 판단한다.
    if result["total_hours"]:
        rain_kind = rain_condition(result["rain_hours"], result["total_hours"], result["rain_mm_max"], None)
    else:  # 비 시간 정보가 없는 스냅숏은 예전 기준(비가 있거나 강수확률 60% 이상이면 rain)을 따른다.
        rain_kind = "rain" if result["has_rain"] or (result["rain_prob_max"] is not None and result["rain_prob_max"] >= 60) else None
    if result["has_snow"]:
        condition = "snow"
    elif rain_kind == "rain":
        condition = "rain"
    elif result["wind_max"] is not None and result["wind_max"] >= 9:
        condition = "strong_wind"
    elif rain_kind == "showers" or condition == "rain":
        condition = "showers"
    result["weather_condition"] = condition
    return {key: round(value, 1) if isinstance(value, float) else value for key, value in result.items()}


def _severity(rule_result: dict) -> int:
    condition = rule_result["weather_condition"]
    feels_min = rule_result["weather_snapshot"].get("feels_min")
    if condition == "snow" or (feels_min is not None and feels_min <= 4):
        return 4
    if condition == "rain":
        return 3
    if condition == "showers":
        return 2
    if condition == "strong_wind":
        return 2
    if rule_result["must_have"]:
        return 1
    return 0


def _schedule_tip(request: OutfitRequest, rule_result: dict) -> dict | None:
    condition = rule_result["weather_condition"]
    items = [item["label"] for item in rule_result["must_have"]]
    feels_min = rule_result["weather_snapshot"].get("feels_min")
    is_cold = feels_min is not None and feels_min <= 4
    if condition == "snow":
        message = "눈길이 미끄러울 수 있어요. 따뜻하게 입고 조심히 이동하세요."
    elif is_cold and condition == "rain":
        message = "춥고 비도 올 수 있어요. 따뜻한 방수 겉옷이 좋겠어요."
    elif is_cold:
        message = "나갈 때 생각보다 추울 수 있어요. 보온용품을 챙기세요."
    elif condition == "rain":
        message = "우산 챙기셨나요? 방수 겉옷도 있으면 좋아요."
    elif condition == "showers":
        window = rain_window_label(rule_result["weather_snapshot"])
        message = f"{window}에 비 예보가 있어요. 우산을 챙기세요." if window else "잠깐 비 예보가 있어요. 우산을 챙기세요."
    elif condition == "strong_wind":
        message = "바람이 강해요. 바람막이가 있으면 좋겠어요."
    elif rule_result["occasion"] in {"running", "sport"}:
        message = "운동할 때는 가볍게, 전후에는 겉옷을 챙기세요."
        if rule_result["outfit"]["outer"]:
            items.append(rule_result["outfit"]["outer"][0])
    elif items:
        message = "나가기 전에 챙길 물건을 확인해 보세요."
    else:
        return None
    return {
        "schedule_id": request.schedule_id,
        "time": request.start.strftime("%H:%M"),
        "title": request.title,
        "message": message,
        "items": list(dict.fromkeys(items)),
        "weather_condition": condition,
        "severity": _severity(rule_result),
    }


def _cache_key(entries: list[tuple[OutfitRequest, dict]], rule_result: dict) -> str:
    requests = [request for request, _result in entries]
    value = {
        # 제목 원문 대신 제목에서 판정한 occasion만 키에 넣는다(제목은 캐시에 저장하지 않는다).
        "schedules": [(request.schedule_id, result["occasion"], request.start.strftime("%Y-%m-%dT%H"), request.activity_type, request.city, request.region) for request, result in entries],
        "band": rule_result["outfit"]["band"],
        "weather_condition": rule_result["weather_condition"],
        "must_have": sorted((item["type"], item["level"]) for item in rule_result["must_have"]),
        "sensitivity": requests[0].sensitivity,
    }
    digest = hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return f"outfit:daily:v4:{digest}"


def recommend_daily_outfit(payload: dict, *, client_key: str = "") -> dict:
    requests = _requests(payload)
    entries = []
    for request in requests:
        snapshot = load_schedule_snapshot(request)
        if snapshot.get("feels_avg") is None and request.activity_type != "indoor":
            continue
        occasion = classify_occasion(request.title)
        result = build_rule_result(snapshot, activity_type=request.activity_type, sensitivity=request.sensitivity, occasion=occasion)
        entries.append((request, snapshot, result))
    if not entries:
        raise OutfitDataUnavailable("날씨 데이터가 부족해 옷차림을 추천하기 어려워요.")

    merged = merge_daily_snapshots([snapshot for _request, snapshot, _result in entries])
    has_outdoor = any(request.activity_type != "indoor" for request, _snapshot, _result in entries)
    occasions = {result["occasion"] for _request, _snapshot, result in entries}
    base_occasion = "sport" if occasions and occasions.issubset({"running", "sport"}) else "casual"
    rule_result = build_rule_result(merged, activity_type="outdoor" if has_outdoor else "indoor", sensitivity=requests[0].sensitivity, occasion=base_occasion)
    schedule_tips = [tip for request, _snapshot, result in entries if (tip := _schedule_tip(request, result)) is not None]
    schedule_tips.sort(key=lambda tip: (-tip["severity"], tip["time"]))
    generated_at = timezone.now()
    valid_until = generated_at + CACHE_TTL
    rule_response = {
        **_base_response(rule_result, generated_at, valid_until),
        "schedule_tips": schedule_tips,
        "total_schedules": len(entries),
    }
    if requests[0].mode == "rule":
        return rule_response

    key = _cache_key([(request, result) for request, _snapshot, result in entries], rule_result)
    cached = get_cached_recommendation(key)
    if cached:
        # 일정 제목이 담긴 schedule_tips는 캐시에 두지 않고, 이번 요청에서 계산한 값을 붙인다.
        return {**cached, "schedule_tips": schedule_tips, "cached": True}
    client = build_llm_client()
    if client is None or not _llm_allowed(client_key):
        return rule_response
    activities = [
        {
            "time": request.start.strftime("%H:%M"),
            "activity_type": result["activity_type"],
            "occasion": result["occasion"],
            "weather_condition": result["weather_condition"],
            "must_have": [item["label"] for item in result["must_have"]],
        }
        for request, _snapshot, result in entries
    ]
    llm_input = llm_input_for(rule_result, entries[0][0], activities=activities)
    try:
        generated = client.generate(SYSTEM_PROMPT, llm_input)
        validated = validate_llm_output(generated, llm_input=llm_input, must_have=rule_result["must_have"], temp_range=merged.get("temp_range"))
        response = {**rule_response, "source": "llm", "summary": validated["summary"], "outfit_note": validated["outfit_note"], "layering_tip": validated["layering_tip"]}
        response["must_have"] = [{**item, "reason": validated["reasons"][item["type"]]} for item in rule_result["must_have"]]
    except Exception:
        logger.warning("Daily outfit LLM failed validation; returning rule result.", exc_info=True)
        response = rule_response
    if response["source"] == "llm":
        cacheable = {k: v for k, v in response.items() if k != "schedule_tips"}
        save_cached_recommendation(key, cacheable, response["source"], valid_until)
    return response
