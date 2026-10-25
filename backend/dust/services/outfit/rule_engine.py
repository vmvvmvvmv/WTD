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


def _with_josa(word: str, with_final: str, without_final: str) -> str:
    """마지막 글자 받침에 맞춰 조사를 붙인다. 예: 니트+와, 재킷+과, 바람막이+를."""
    last = word[-1] if word else ""
    if "가" <= last <= "힣" and (ord(last) - 0xAC00) % 28 == 0:
        return word + without_final
    return word + with_final


def _band_index(feels_avg: float, sensitivity: str) -> int:
    adjusted = feels_avg - 2 if sensitivity == "cold" else feels_avg + 2 if sensitivity == "hot" else feels_avg
    return next(index for index, band in enumerate(BANDS) if adjusted >= band["minimum"])


WEATHER_CONDITIONS = {"snow", "rain", "strong_wind", "showers", "normal"}


def rain_window_label(snapshot: dict) -> str:
    """"15:00"~"17:00" -> "15~17시", 한 시간뿐이면 "15시"."""
    start, end = snapshot.get("rain_start"), snapshot.get("rain_end")
    if not start or not end:
        return ""
    start_hour, end_hour = int(start[:2]), int(end[:2])
    return f"{start_hour}시" if (end_hour - start_hour) % 24 == 1 else f"{start_hour}~{end_hour}시"


def _weather_condition(snapshot: dict) -> str:
    # 집계 단계에서 비의 길이까지 보고 정한 값(rain/showers)을 그대로 쓴다.
    if snapshot.get("weather_condition") in WEATHER_CONDITIONS:
        return snapshot["weather_condition"]
    if snapshot.get("has_snow"):
        return "snow"
    rain_probability, rain_mm = snapshot.get("rain_prob_max"), snapshot.get("rain_mm_max")
    if snapshot.get("has_rain") or (rain_probability is not None and rain_probability >= 60) or (rain_mm is not None and rain_mm >= 1):
        return "rain"
    if snapshot.get("wind_max") is not None and snapshot["wind_max"] >= 9:
        return "strong_wind"
    return "normal"


def _must_have(snapshot: dict, weather_condition: str, activity_type: str) -> list[dict]:
    result = []
    rain_probability, rain_mm = snapshot.get("rain_prob_max"), snapshot.get("rain_mm_max")
    pm10, pm25 = snapshot.get("pm10_max"), snapshot.get("pm25_max")
    wind, feels_min = snapshot.get("wind_max"), snapshot.get("feels_min")
    if weather_condition == "snow":
        result.append({"type": "waterproof_shoes", "label": "미끄럼 방지 방수 신발", "level": "required", "reason": "젖거나 미끄러운 눈길에 대비해요"})
        # 비와 눈이 섞여 오면 우산도 챙긴다. 눈만 오면 넣지 않는다(강수량·확률은 눈에도 높게 나와 강수형태로만 본다).
        if snapshot.get("has_mixed_precipitation"):
            window = rain_window_label(snapshot)
            result.append({"type": "umbrella", "label": "우산", "level": "required", "reason": f"{window}에 비와 눈이 섞여 와요" if window else "비와 눈이 섞여 와요"})
    elif (rain_probability is not None and rain_probability >= 60) or (rain_mm is not None and rain_mm >= 1) or weather_condition in {"rain", "showers"} or snapshot.get("has_rain"):
        # 잠깐 오는 비라도 확실하면 우산은 필수다. 비의 길이는 겉옷에만 반영한다.
        window = rain_window_label(snapshot)
        label = "접이식 우산" if weather_condition == "showers" else "우산"
        reason = f"{window}에 비 예보가 있어요" if window else "비에 대비해 챙겨요"
        result.append({"type": "umbrella", "label": label, "level": "required", "reason": reason})
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
    feels_max = snapshot.get("feels_max")
    if activity_type != "indoor" and weather_condition == "normal" and feels_max is not None and feels_max >= 30:
        result.append({"type": "sun_parasol", "label": "양산", "level": "recommended", "reason": "강한 햇빛과 더위에 대비해요"})
    return result


def _apply_weather_outer(band: dict, weather_condition: str, occasion: str) -> None:
    if weather_condition in {"normal", "showers"}:
        return
    cold_band = band["band"] in {"B6", "B7", "B8", "B9"}
    is_sport = occasion in {"running", "sport"}
    if weather_condition == "snow":
        outer = "방수·방풍 보온 운동 재킷" if is_sport and cold_band else "방수·방풍 운동 재킷" if is_sport else "방수·방풍 보온 겉옷" if cold_band else "방수·방풍 재킷"
    elif weather_condition == "rain":
        outer = "경량 방수 바람막이" if is_sport else "방수 기능 겉옷" if cold_band else "생활 방수 재킷"
    else:
        outer = "방풍 보온 운동 재킷" if is_sport and cold_band else "방풍 운동 재킷" if is_sport else "방풍 보온 겉옷" if cold_band else "방풍 재킷"
    band["outer"] = [outer]


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
    weather_condition = _weather_condition(snapshot)
    if resolved_activity != "indoor":
        _apply_weather_outer(band, weather_condition, occasion)

    must_have = _must_have(snapshot, weather_condition, resolved_activity)
    temp_range = snapshot.get("temp_range")
    layering_tip = "겉옷은 벗고 입기 쉬운 걸로 챙기세요." if temp_range is not None and temp_range >= 8 else ""
    if resolved_activity == "transit":
        layering_tip = "대중교통 안에서는 벗기 쉬운 겉옷이 편해요."
    main_outer = band["outer"][0] if band["outer"] else band["top"][0]
    required_labels = [item["label"] for item in must_have if item["level"] == "required"]
    summary = f"{main_outer} 차림이 좋아요."
    if weather_condition == "snow":
        summary = f"눈길 조심하세요. {_with_josa(main_outer, '과', '와')} 방수 신발이 좋아요."
    elif weather_condition == "rain":
        summary = f"우산 챙기셨나요? {main_outer}도 잘 맞아요."
    elif weather_condition == "showers":
        window = rain_window_label(snapshot)
        summary = f"{window} 소나기 예보, 우산 챙기세요." if window else "잠깐 비 예보가 있어요. 우산 챙기세요."
    elif weather_condition == "strong_wind":
        summary = f"강한 바람에는 {main_outer} 차림이 좋아요."
    elif occasion in {"running", "sport"} and band["outer"]:
        summary = f"운동할 때는 {band['top'][0]}, 전후에는 {band['outer'][0]}도 챙기세요."
    if required_labels and weather_condition == "normal":
        summary = f"{main_outer}에 {'·'.join(required_labels)}도 챙기세요."
    outfit_note = f"{_with_josa(band['top'][0], '과', '와')} {band['bottom'][0]}"
    outfit_note += f", {_with_josa(band['outer'][0], '을', '를')} 추천해요." if band["outer"] else " 조합을 추천해요."
    return {
        "summary": summary[:40],
        "outfit": {"band": band["band"], "top": band["top"], "bottom": band["bottom"], "outer": band["outer"], "accessories": [item["label"] for item in must_have]},
        "outfit_note": outfit_note[:80],
        "layering_tip": layering_tip,
        "must_have": must_have,
        "weather_snapshot": {key: snapshot.get(key) for key in ("feels_min", "feels_max", "feels_avg", "temp_range", "rain_prob_max", "rain_mm_max", "wind_max", "pm10_max", "pm25_max", "has_snow", "has_rain", "rain_hours", "total_hours", "rain_start", "rain_end", "weather_condition")},
        "data_gaps": list(dict.fromkeys(data_gaps)),
        "occasion": occasion,
        "activity_type": resolved_activity,
        "sensitivity": sensitivity,
        "weather_condition": weather_condition,
    }
