from copy import deepcopy

from .constants import BANDS


SPORT_OUTFITS = {
    "B1": {"top": ["기능성 민소매", "기능성 반팔"], "bottom": ["러닝 쇼츠", "얇은 운동복 바지"], "outer": []},
    "B2": {"top": ["기능성 반팔"], "bottom": ["러닝 쇼츠", "얇은 운동복 바지"], "outer": []},
    "B3": {"top": ["기능성 긴팔", "기능성 반팔"], "bottom": ["얇은 운동복 바지"], "outer": ["얇은 바람막이"]},
    "B4": {"top": ["흡습속건 긴팔"], "bottom": ["긴 운동복 바지"], "outer": ["경량 바람막이"]},
    "B5": {"top": ["기능성 긴팔"], "bottom": ["긴 운동복 바지"], "outer": ["보온 러닝 자켓"]},
    "B6": {"top": ["기능성 긴팔", "얇은 기능성 이너"], "bottom": ["기모 러닝 타이츠"], "outer": ["보온 러닝 자켓"]},
    "B7": {"top": ["보온 기능성 이너"], "bottom": ["기모 러닝 타이츠"], "outer": ["방풍 러닝 자켓"]},
    "B8": {"top": ["보온 기능성 이너"], "bottom": ["기모 러닝 타이츠"], "outer": ["두꺼운 방풍 자켓"]},
    "B9": {"top": ["보온 기능성 이너"], "bottom": ["기모 러닝 타이츠"], "outer": ["겨울용 방풍 자켓"]},
}


def _band_index(feels_avg: float, sensitivity: str) -> int:
    adjusted = feels_avg - 2 if sensitivity == "cold" else feels_avg + 2 if sensitivity == "hot" else feels_avg
    return next(index for index, band in enumerate(BANDS) if adjusted >= band["minimum"])


def _must_have(snapshot: dict) -> list[dict]:
    result = []
    rain_probability, rain_mm = snapshot.get("rain_prob_max"), snapshot.get("rain_mm_max")
    pm10, pm25 = snapshot.get("pm10_max"), snapshot.get("pm25_max")
    wind, feels_min = snapshot.get("wind_max"), snapshot.get("feels_min")
    if (rain_probability is not None and rain_probability >= 60) or (rain_mm is not None and rain_mm >= 1):
        result.append({"type": "umbrella", "label": "우산", "level": "required", "reason": "비에 대비해 챙겨요"})
    elif rain_probability is not None and rain_probability >= 30:
        result.append({"type": "umbrella", "label": "접이식 우산", "level": "recommended", "reason": "비 가능성에 대비해요"})
    if (pm10 is not None and pm10 >= 151) or (pm25 is not None and pm25 >= 76):
        result.append({"type": "mask", "label": "KF94 이상 마스크", "level": "required", "reason": "대기질이 매우 나빠요"})
    elif (pm10 is not None and pm10 >= 81) or (pm25 is not None and pm25 >= 36):
        result.append({"type": "mask", "label": "마스크", "level": "required", "reason": "미세먼지에 대비해요"})
    if wind is not None and wind >= 9:
        result.append({"type": "windbreaker", "label": "바람막이", "level": "recommended", "reason": "강한 바람을 막아줘요"})
    if feels_min is not None and feels_min <= 4:
        result.append({"type": "scarf_gloves", "label": "목도리·장갑", "level": "recommended", "reason": "낮은 체감온도에 대비해요"})
    return result


def build_rule_result(snapshot: dict, *, activity_type: str, sensitivity: str, occasion: str) -> dict:
    data_gaps = list(snapshot.get("data_gaps") or [])
    resolved_activity = activity_type
    if resolved_activity == "auto":
        # TODO(확인 필요): 서버에 활동 유형 자동 판정기가 생기면 그 결과를 사용한다.
        resolved_activity = "outdoor"
        data_gaps.append("activity_type_auto")
    feels_avg = 22.0 if resolved_activity == "indoor" else snapshot.get("feels_avg")
    if feels_avg is None:
        raise ValueError("weather_unavailable")
    index = _band_index(feels_avg, sensitivity)
    band = deepcopy(BANDS[index])
    feels_min = snapshot.get("feels_min")
    if resolved_activity != "indoor" and feels_min is not None and index < len(BANDS) - 1 and feels_min <= band["minimum"] - 3:
        band = deepcopy(BANDS[index + 1])
    if occasion in {"running", "sport"}:
        band.update(deepcopy(SPORT_OUTFITS[band["band"]]))
    if resolved_activity == "indoor":
        band["outer"] = ["들고 다닐 수 있는 가벼운 겉옷"]

    must_have = _must_have(snapshot)
    temp_range = snapshot.get("temp_range")
    layering_tip = "겉옷을 벗고 입기 쉬운 구성으로 준비하세요." if temp_range is not None and temp_range >= 8 else ""
    if resolved_activity == "transit":
        layering_tip = "대중교통에서 쉽게 벗고 입을 수 있도록 겹쳐 입으세요."
    main_outer = band["outer"][0] if band["outer"] else band["top"][0]
    required_labels = [item["label"] for item in must_have if item["level"] == "required"]
    summary = f"{main_outer} 차림이 좋아요."
    if occasion in {"running", "sport"} and band["outer"]:
        summary = f"운동할 땐 {band['top'][0]}, 전후엔 {band['outer'][0]}를 챙겨요."
    if required_labels:
        summary = f"{main_outer}에 {'·'.join(required_labels)}도 챙기세요."
    outfit_note = f"{band['top'][0]}과 {band['bottom'][0]}"
    outfit_note += f", {band['outer'][0]}을 추천해요." if band["outer"] else " 조합을 추천해요."
    return {
        "summary": summary[:40],
        "outfit": {"band": band["band"], "top": band["top"], "bottom": band["bottom"], "outer": band["outer"], "accessories": [item["label"] for item in must_have]},
        "outfit_note": outfit_note[:80],
        "layering_tip": layering_tip,
        "must_have": must_have,
        "weather_snapshot": {key: snapshot.get(key) for key in ("feels_min", "feels_max", "feels_avg", "temp_range", "rain_prob_max", "rain_mm_max", "wind_max", "pm10_max", "pm25_max")},
        "data_gaps": list(dict.fromkeys(data_gaps)),
        "occasion": occasion,
        "activity_type": resolved_activity,
        "sensitivity": sensitivity,
    }
