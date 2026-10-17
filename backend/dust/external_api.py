"""바깥 공공 API(AirKorea·기상청·네이버) 호출과 타임아웃을 한곳에서 관리한다.

화면이 기다리는 요청은 짧게(REQUEST_TIMEOUT), 매시간 도는 수집 배치는 넉넉하게(BATCH_TIMEOUT) 기다린다.
requests의 timeout은 (연결, 읽기) 초이고, 읽기 시간은 응답 전체가 아니라 바이트 사이 간격 기준이다.
"""
import os

import requests

PUBLIC_API_HEADERS = {
    "Accept": "application/json, text/xml, */*",
    "User-Agent": "Mozilla/5.0",
}


def _env_seconds(name, default):
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return float(default)


# 사용자가 화면에서 기다리는 요청: 실패하면 저장된 값으로 바로 응답한다.
REQUEST_TIMEOUT = (3, _env_seconds("PUBLIC_API_REQUEST_READ_TIMEOUT_SEC", 4))
# 수집 배치: 기다려도 사용자에게 영향이 없어 예전처럼 15초까지 기다린다.
BATCH_TIMEOUT = 15


def public_api_get(url, params=None, *, timeout=BATCH_TIMEOUT, headers=None):
    return requests.get(url, params=params, headers=headers or PUBLIC_API_HEADERS, timeout=timeout)
