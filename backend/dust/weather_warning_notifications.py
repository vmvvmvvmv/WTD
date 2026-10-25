"""기상특보 알림: 내 알림 지역에 기상청 기상특보(호우·대설·강풍·한파·폭염·태풍 등)가 발효되면 푸시한다.

기상청 '기상특보 조회서비스'의 특보 현황(getPwnStatus)을 정해진 간격으로 확인한다. 현황은 시·도 단위 문장으로 온다.
  예) "o 강풍주의보 : 전라남도(거문도.초도, 완도여서도), 제주도(제주시서부, 제주시북부 제외)"
사용자 지역(측정소 주소의 시·도, 시·군·구)과 맞춰 본다. 같은 특보(종류·단계)는 24시간에 한 번만 보내고,
주의보가 경보로 올라가면 다시 보낸다. 밤(22~7시)에는 경보만 보내고 주의보는 아침에 아직 발효 중이면 보낸다.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from django.utils import timezone

from dust.current_dust_service import canonical_sido_name
from dust.models import DustNotificationLog, NotificationDevice
from dust.weather_morning_notifications import ExpoDeviceNotRegistered, _station_for_region, send_expo_push

logger = logging.getLogger(__name__)

NOTIFICATION_TYPE = "weather_warning"
REPEAT_AFTER = timedelta(hours=24)
QUIET_START_HOUR = 22
QUIET_END_HOUR = 7

# 서울 특보구역은 권역으로 나뉜다(자치구 → 권역).
SEOUL_ZONES = {
    "동남권": ("강남구", "서초구", "송파구", "강동구"),
    "동북권": ("성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구"),
    "서남권": ("양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구"),
    "서북권": ("종로구", "중구", "용산구", "은평구", "서대문구", "마포구"),
}

ADVICE = {
    "강풍": "바람이 아주 강해요. 외출과 운전에 주의하세요.",
    "호우": "많은 비가 와요. 저지대·하천 근처는 피하세요.",
    "대설": "눈이 많이 와요. 미끄럼과 교통에 주의하세요.",
    "한파": "매우 추워요. 따뜻하게 입고 외출을 줄이세요.",
    "폭염": "매우 더워요. 한낮 외출을 줄이고 물을 자주 드세요.",
    "태풍": "태풍이 와요. 외출을 삼가고 안전에 유의하세요.",
    "건조": "매우 건조해요. 불씨 관리에 주의하세요.",
    "황사": "황사가 심해요. 마스크를 챙기세요.",
    "폭풍해일": "해안가에 큰 물결이 와요. 바닷가 접근을 피하세요.",
}


@dataclass(frozen=True)
class Warning:
    kind: str  # 강풍, 호우, …
    level: str  # 주의보, 경보
    sido: str  # 정규화한 시·도(예: 부산, 전남)
    subs: tuple[str, ...]  # 괄호 안 세부 구역
    excluded: bool  # 괄호가 "… 제외"인지


@dataclass(frozen=True)
class WeatherWarningResult:
    sent: int = 0
    failed: int = 0
    skipped: int = 0


def _split_top_level(text: str) -> list[str]:
    parts, depth, current = [], 0, ""
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        if char == "," and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += char
    if current.strip():
        parts.append(current.strip())
    return parts


def parse_warning_status(t6: str) -> list[Warning]:
    """특보 현황 문장(t6)을 시·도별 특보 목록으로 바꾼다. 바다 구역(…바다)은 뺀다."""
    warnings = []
    for line in (t6 or "").splitlines():
        match = re.match(r"^\s*o\s*(?P<name>[가-힣]+?)(?P<level>주의보|경보)\s*:\s*(?P<areas>.+)$", line.strip())
        if not match:
            continue
        for area in _split_top_level(match.group("areas")):
            area_match = re.match(r"^(?P<sido>[^()]+?)\s*(?:\((?P<subs>.*)\))?$", area.strip())
            if not area_match or "바다" in area_match.group("sido"):
                continue
            raw_subs = (area_match.group("subs") or "").strip()
            excluded = raw_subs.endswith("제외")
            raw_subs = re.sub(r"\s*제외$", "", raw_subs)
            subs = tuple(sub.strip() for sub in re.split(r"[,，]", raw_subs) if sub.strip())
            warnings.append(Warning(
                kind=match.group("name"), level=match.group("level"),
                sido=canonical_sido_name(area_match.group("sido").strip()), subs=subs, excluded=excluded,
            ))
    return warnings


def _sigungu_from_address(address: str) -> str:
    # "부산 서구 대신로…" → "서구", "경기 수원시 팔달구…" → "수원시"
    parts = (address or "").split()
    return parts[1] if len(parts) > 1 else ""


def _stem(name: str) -> str:
    return re.sub(r"(특별자치시|특별자치도|광역시|특별시|시|군|구)$", "", name)


def warning_applies(warning: Warning, sido: str, sigungu: str) -> bool:
    if warning.sido != canonical_sido_name(sido):
        return False
    if not warning.subs:
        return True
    stem = _stem(sigungu)

    def sub_matches(sub: str) -> bool:
        if warning.sido == "서울":
            return any(zone in sub and sigungu in gus for zone, gus in SEOUL_ZONES.items())
        return bool(sigungu) and (sigungu in sub or (len(stem) >= 2 and stem in sub))

    matched = any(sub_matches(sub) for sub in warning.subs)
    if warning.excluded:
        # "제주시서부 제외"처럼 시의 일부만 빠지면 나머지 지역엔 특보가 있으므로 알린다. 시 전체가 빠질 때만 뺀다.
        return not any(sub in (sigungu, stem) for sub in warning.subs)
    # 광역시가 '부산동부'처럼 시 이름 + 권역으로 나뉘면 주소로 어느 권역인지 알 수 없다. 놓치는 것보다 알리는 쪽을 택한다.
    unresolvable = warning.sido != "서울" and all(warning.sido in sub for sub in warning.subs)
    return matched or unresolvable


def build_warning_message(region_label: str, warning: Warning) -> tuple[str, str]:
    return f"{region_label} {warning.kind}{warning.level}", f"기상청 {warning.kind}{warning.level}가 발효 중이에요. {ADVICE.get(warning.kind, '안전에 유의하세요.')}"


def fetch_warning_status() -> str:
    from dust.config import KMA_API_KEY, KMA_WEATHER_WARNING_STATUS_URL
    from dust.external_api import public_api_get

    response = public_api_get(
        KMA_WEATHER_WARNING_STATUS_URL,
        params={"serviceKey": KMA_API_KEY, "pageNo": 1, "numOfRows": 10, "dataType": "JSON"},
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    items = (((data.get("response") or {}).get("body") or {}).get("items") or {}).get("item") or []
    if isinstance(items, dict):
        items = [items]
    return "\n".join(str(item.get("t6") or "") for item in items if isinstance(item, dict))


def send_weather_warning_notifications(
    now: datetime | None = None,
    dry_run: bool = False,
    force: bool = False,
    write: Callable[[str], None] | None = None,
    status_text: str | None = None,
) -> WeatherWarningResult:
    write = write or (lambda _message: None)
    now = timezone.localtime(now or timezone.now())
    is_quiet = now.hour >= QUIET_START_HOUR or now.hour < QUIET_END_HOUR
    try:
        warnings = parse_warning_status(status_text if status_text is not None else fetch_warning_status())
    except Exception:
        logger.warning("Weather warning status request failed.", exc_info=True)
        return WeatherWarningResult()
    if not warnings:
        return WeatherWarningResult()

    sent = failed = skipped = 0
    place_cache: dict[tuple[str, str], tuple[str, str]] = {}
    for device in NotificationDevice.objects.filter(enabled=True, weather_warning_alerts=True):
        city, region = device.city, device.region
        if not city or not region:
            skipped += 1
            continue
        key = (city, region)
        if key not in place_cache:
            station = _station_for_region(city, region)
            place_cache[key] = (station.sido if station else city, _sigungu_from_address(station.addr) if station else "")
        sido, sigungu = place_cache[key]
        # 한 지역에 여러 특보가 겹치면 경보를 먼저, 한 번에 한 개씩 보낸다(다음 확인 때 나머지).
        applicable = sorted({(w.kind, w.level): w for w in warnings if warning_applies(w, sido, sigungu)}.values(), key=lambda w: w.level != "경보")
        for warning in applicable:
            if is_quiet and warning.level != "경보" and not force:
                continue
            prefix = f"{warning.kind}:{warning.level}:"
            if not force and DustNotificationLog.objects.filter(
                device=device, notification_type=NOTIFICATION_TYPE, basis_key__startswith=prefix, created_at__gte=now - REPEAT_AFTER,
            ).exists():
                continue
            title, body = build_warning_message(region, warning)
            if dry_run:
                write(f"[dry-run] {title} - {body}")
                sent += 1
                break
            try:
                send_expo_push(device.expo_push_token, title, body, {"type": NOTIFICATION_TYPE, "city": city, "region": region})
            except ExpoDeviceNotRegistered:
                failed += 1
                device.enabled = False
                device.calendar_events = []
                device.save(update_fields=["enabled", "calendar_events", "updated_at"])
                break
            except Exception as exc:
                failed += 1
                write(f"Expo push request failed for {city} {region}: {exc}")
                break
            DustNotificationLog.objects.get_or_create(
                device=device, notification_type=NOTIFICATION_TYPE, city=city, region=region,
                basis_key=f"{prefix}{now:%Y%m%d%H%M}",
            )
            device.last_sent_at = timezone.now()
            device.save(update_fields=["last_sent_at", "updated_at"])
            sent += 1
            break
        else:
            skipped += 1
    return WeatherWarningResult(sent=sent, failed=failed, skipped=skipped)
