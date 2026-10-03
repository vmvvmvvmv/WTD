import hashlib

from rest_framework.decorators import api_view
from rest_framework.response import Response

from .services.outfit import recommend_outfit
from .services.outfit.context_builder import OutfitContextError
from .services.outfit.service import OutfitDataUnavailable


def _client_key(request) -> str:
    supplied = request.headers.get('X-Device-Id', '').strip()
    if supplied:
        return supplied[:160]
    # IP 원문은 저장하거나 로그로 남기지 않고 호출 상한 키를 만드는 데만 사용한다.
    remote = request.META.get('REMOTE_ADDR', 'anonymous')
    return hashlib.sha256(remote.encode('utf-8')).hexdigest()


@api_view(['POST'])
def recommend(request):
    try:
        payload = request.data if isinstance(request.data, dict) else {}
        return Response(recommend_outfit(payload, client_key=_client_key(request)))
    except OutfitContextError as exc:
        return Response({'error': str(exc)}, status=400)
    except OutfitDataUnavailable as exc:
        return Response({'error': str(exc)}, status=503)
