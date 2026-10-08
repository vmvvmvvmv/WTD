import hashlib

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services.outfit import recommend_outfit
from .services.outfit.context_builder import OutfitContextError
from .services.outfit.service import OutfitDataUnavailable


def _client_ip(request) -> str:
    # 클라이언트가 바꿀 수 있는 헤더(X-Device-Id, X-Forwarded-For 첫 항목)는 호출 상한 키로 믿지 않는다.
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
def recommend(request):
    try:
        payload = request.data if isinstance(request.data, dict) else {}
        return Response(recommend_outfit(payload, client_key=_client_key(request)))
    except OutfitContextError as exc:
        return Response({'error': str(exc)}, status=400)
    except OutfitDataUnavailable as exc:
        return Response({'error': str(exc)}, status=503)
