import hashlib

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from dust.api_errors import error_response

from .services.memo_events import MemoBusy, MemoFailed, MemoInputError, MemoQuotaExceeded, MemoUnavailable, events_from_memo


def _client_ip(request) -> str:
    # 클라이언트가 바꿀 수 있는 헤더(X-Device-Id, X-Forwarded-For 첫 항목)는 IP 상한 키로 믿지 않는다.
    # 프록시 뒤에서는 우리 프록시가 오른쪽 끝에 덧붙인 주소만 신뢰한다.
    proxy_count = settings.TRUSTED_PROXY_COUNT
    if proxy_count > 0:
        forwarded = [ip.strip() for ip in request.META.get('HTTP_X_FORWARDED_FOR', '').split(',') if ip.strip()]
        if len(forwarded) >= proxy_count:
            return forwarded[-proxy_count]
    return request.META.get('REMOTE_ADDR', 'anonymous')


def _client_key(request) -> str:
    # IP 원문은 저장하거나 로그로 남기지 않고 호출 상한 키를 만드는 데만 사용한다.
    return hashlib.sha256(_client_ip(request).encode('utf-8')).hexdigest()


@api_view(['POST'])
def memo_events(request):
    payload = request.data if isinstance(request.data, dict) else {}
    try:
        events = events_from_memo(payload.get('text'), device_id=request.META.get('HTTP_X_DEVICE_ID', '').strip(), ip_key=_client_key(request))
    except MemoInputError as exc:
        return error_response(400, str(exc))
    except MemoQuotaExceeded:
        return error_response(429, '오늘은 메모로 추가를 다 썼어요. 내일 다시 써 주세요.', 'quota_exceeded')
    except MemoBusy:
        return error_response(503, '지금 AI 사용량이 많아요. 잠시 뒤 다시 하거나 직접 입력을 써 주세요.', 'ai_busy')
    except MemoUnavailable:
        return error_response(503, '메모로 추가를 지금 쓸 수 없어요.')
    except MemoFailed:
        return error_response(502, '메모를 일정으로 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.')
    return Response({'events': events})
