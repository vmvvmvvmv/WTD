"""네이버 지역 검색과 결과를 화면용으로 다듬는 보조 함수."""
import logging
import re

from dust.config import (NAVER_API_HUB_CLIENT_ID, NAVER_API_HUB_CLIENT_SECRET,
                         NAVER_API_HUB_LOCAL_SEARCH_URL, NAVER_LOCAL_SEARCH_URL,
                         NAVER_SEARCH_CLIENT_ID, NAVER_SEARCH_CLIENT_SECRET)
from dust.external_api import public_api_get
from dust.services.common import _to_float

logger = logging.getLogger(__name__)


class PlaceSearchUnavailable(RuntimeError):
    pass


class PlaceSearchFailed(RuntimeError):
    pass


def _strip_html(value):
    return re.sub(r"<[^>]+>", "", value or "").strip()


def _naver_coord(value):
    number = _to_float(value)
    if number is None:
        return None
    return number / 10000000 if abs(number) > 1000 else number


def search_naver_places(query, display=5, timeout=6):
    display = max(1, min(int(display), 5))
    if NAVER_API_HUB_CLIENT_ID and NAVER_API_HUB_CLIENT_SECRET:
        url = NAVER_API_HUB_LOCAL_SEARCH_URL
        headers = {
            "X-NCP-APIGW-API-KEY-ID": NAVER_API_HUB_CLIENT_ID,
            "X-NCP-APIGW-API-KEY": NAVER_API_HUB_CLIENT_SECRET,
        }
    elif NAVER_SEARCH_CLIENT_ID and NAVER_SEARCH_CLIENT_SECRET:
        url = NAVER_LOCAL_SEARCH_URL
        headers = {
            "X-Naver-Client-Id": NAVER_SEARCH_CLIENT_ID,
            "X-Naver-Client-Secret": NAVER_SEARCH_CLIENT_SECRET,
        }
    else:
        logger.warning("Naver search credentials are not configured.")
        raise PlaceSearchUnavailable()
    try:
        response = public_api_get(url, params={"query": query, "display": display}, headers=headers, timeout=timeout)
        data = response.json()
    except Exception as exc:
        logger.exception("Naver place search request failed")
        raise PlaceSearchFailed() from exc
    if response.status_code >= 400:
        logger.warning("Naver place search returned %s", response.status_code)
        raise PlaceSearchFailed()

    # 바깥 API가 모양이 다른 응답(목록, 문자열, null 항목)을 줘도 예외로 터지지 않게 걸러 낸다.
    raw_items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(raw_items, list):
        raw_items = []
    items = []
    for index, item in enumerate(raw_items):
        if not isinstance(item, dict):
            continue
        lat = _naver_coord(item.get("mapy"))
        lng = _naver_coord(item.get("mapx"))
        if lat is None or lng is None:
            continue
        label = _strip_html(item.get("title")) or item.get("address") or query
        items.append({
            "id": f"naver:{item.get('mapx')}:{item.get('mapy')}:{index}",
            "label": label,
            "address": item.get("roadAddress") or item.get("address") or "",
            "category": item.get("category") or "",
            "link": item.get("link") or "",
            "lat": lat,
            "lng": lng,
            "source": "naver_local",
        })
    return items
