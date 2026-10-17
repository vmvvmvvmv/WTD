"""오류 응답 규칙.

상태 코드는 상황별로 정해 두고, 본문은 항상 {"error": 사용자에게 보여 줄 문구, "code": 프로그램이 구분할 코드}로 맞춘다.
내부 예외 문구나 바깥 API 원문 응답은 본문에 넣지 않고 서버 로그에만 남긴다.
"""
import logging

from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

# 400 잘못된 요청 값 · 403 접근 토큰 없음 · 404 대상 없음 · 500 서버 내부 오류 · 502 바깥 API 실패 · 503 지금 쓸 수 없는 기능
DEFAULT_CODES = {
    400: "invalid_parameter",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    415: "unsupported_media_type",
    500: "internal_error",
    502: "upstream_failed",
    503: "service_unavailable",
}


def error_body(status, message, code=None, **extra):
    return {"error": message, "code": code or DEFAULT_CODES.get(status, "error"), **extra}


def error_response(status, message, code=None, **extra):
    return Response(error_body(status, message, code, **extra), status=status)


def api_exception_handler(exc, context):
    """DRF 기본 오류(잘못된 JSON, 허용 안 된 메서드 등)와 처리 안 된 예외도 같은 모양으로 돌려준다."""
    response = exception_handler(exc, context)
    if response is None:
        logger.error("Unhandled API error", exc_info=exc)
        return error_response(500, "서버 오류가 발생했습니다.")
    detail = response.data.get("detail") if isinstance(response.data, dict) else None
    response.data = error_body(response.status_code, str(detail) if detail else "요청을 처리하지 못했습니다.")
    return response
