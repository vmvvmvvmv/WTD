"""측정값 품질 규칙: 한 측정소만 혼자 튄 값(장비 이상)을 찾고, 높은 상태가 이어지면 비웠던 값을 되살린다."""
from datetime import timedelta

from dust.models import RealtimeDustMeasurement
from dust.services.airkorea_client import _parse_airkorea_datetime
from dust.services.common import _haversine_km, _median, _to_float


def _is_single_sample_spike(latest, previous_values, rule):
    baseline = _median(previous_values)
    if latest is None or baseline is None or baseline <= 0:
        return False
    return latest >= rule["min_value"] and latest - baseline >= rule["min_delta"] and latest / baseline >= rule["ratio"]


# min_value는 '나쁨' 등급 시작값. 그보다 낮으면 조금 튀어도 사용자에게 문제 되지 않아 그대로 둔다.
NEIGHBOR_SPIKE_RULES = {
    "pm10": {"min_value": 81, "ratio": 2.5, "min_delta": 50},
    "pm25": {"min_value": 36, "ratio": 2.5, "min_delta": 25},
}


def _neighbor_spike_fields(points, neighbor_count=5):
    """points: [(lat, lng, {"pm10": .., "pm25": ..}), ...] -> 점마다 버릴 항목 집합.

    나쁨 등급 이상이면서 가까운 측정소 5곳의 중앙값보다 2.5배 이상, 기준만큼 더 높으면 장비 이상으로 보고 버린다.
    넓은 지역이 함께 높으면(황사 등) 주변도 높아서 걸리지 않는다.
    """
    # ponytail: 측정소 수백 곳끼리 전부 거리를 잰다(한 번에 1초 안쪽). 수천 곳이 되면 격자 색인으로 바꾼다.
    drops = []
    for index, (lat, lng, readings) in enumerate(points):
        fields = set()
        for field, rule in NEIGHBOR_SPIKE_RULES.items():
            value = _to_float(readings.get(field))
            if value is None or value < rule["min_value"] or lat is None or lng is None:
                continue
            others = sorted(
                (_haversine_km(lat, lng, other_lat, other_lng), other_value)
                for other_index, (other_lat, other_lng, other_readings) in enumerate(points)
                if other_index != index and other_lat is not None and other_lng is not None
                for other_value in [_to_float(other_readings.get(field))]
                if other_value is not None
            )[:neighbor_count]
            baseline = _median([other_value for _, other_value in others])
            if len(others) >= 3 and baseline is not None and value >= rule["ratio"] * max(baseline, 1) and value - baseline >= rule["min_delta"]:
                fields.add(field)
        drops.append(fields)
    return drops


def _previous_measurement(station, value):
    """같은 측정소의 직전 기록(3시간 안)."""
    measured_at = _parse_airkorea_datetime(value.get("time"))
    if not measured_at:
        return None
    return (
        RealtimeDustMeasurement.objects
        .filter(station=station, measured_at__lt=measured_at, measured_at__gte=measured_at - timedelta(hours=3))
        .order_by('-measured_at')
        .first()
    )


def _previous_reading(previous, field):
    # 직전 값이 이 필터로 비워졌다면 원래 값으로 판단한다(그러지 않으면 높은 상태가 이어져도 매시간 지워진다).
    raw = previous.raw_data or {}
    return _to_float(getattr(previous, f"{field}_value")) or _to_float(raw.get(f"raw{field.upper()}"))


def _sustained_high_fields(previous):
    """직전 시각에도 나쁨 이상이었던 항목. 한 시간만 튄 게 아니라 그 자리의 실제 오염으로 보고 건드리지 않는다."""
    if not previous:
        return set()
    return {field for field, rule in NEIGHBOR_SPIKE_RULES.items() if (_previous_reading(previous, field) or 0) >= rule["min_value"]}


def _restore_cleared_previous(previous, value):
    """높은 상태가 이어지면, 첫 시간에 장비 이상으로 보고 비웠던 직전 값을 원래대로 되살린다."""
    if not previous or (previous.raw_data or {}).get("qualityNote") != "neighbor_spike_removed":
        return
    raw = dict(previous.raw_data)
    restored = []
    for field, rule in NEIGHBOR_SPIKE_RULES.items():
        current = _to_float(value.get(field))
        original = _to_float(raw.get(f"raw{field.upper()}"))
        if getattr(previous, f"{field}_value") is None and original is not None and current is not None and current >= rule["min_value"]:
            setattr(previous, f"{field}_value", original)
            raw[field] = raw.pop(f"raw{field.upper()}")
            restored.append(f"{field}_value")
    if restored:
        if not any(key.startswith("raw") and key[3:].lower() in NEIGHBOR_SPIKE_RULES for key in raw):
            # 비웠던 항목이 모두 돌아왔으면 통합대기지수도 되살린다.
            raw.pop("qualityNote", None)
            if previous.aqi_value is None and "rawAQI" in raw:
                raw["aqi"] = raw.pop("rawAQI")
                previous.aqi_value = _to_float(raw["aqi"])
                restored.append("aqi_value")
        previous.raw_data = raw
        previous.save(update_fields=[*restored, "raw_data"])
