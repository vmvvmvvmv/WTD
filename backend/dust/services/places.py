"""네이버 지역 검색 결과를 화면용으로 다듬는 보조 함수."""
import re
from dust.services.common import _to_float


def _strip_html(value):
    return re.sub(r"<[^>]+>", "", value or "").strip()


def _naver_coord(value):
    number = _to_float(value)
    if number is None:
        return None
    return number / 10000000 if abs(number) > 1000 else number
