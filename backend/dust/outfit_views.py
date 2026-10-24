from rest_framework.decorators import api_view
from rest_framework.response import Response

from dust.api_errors import error_response

from .services.outfit import recommend_outfit
from .services.outfit.daily_service import recommend_daily_outfit
from .services.outfit.context_builder import OutfitContextError
from .services.outfit.service import OutfitDataUnavailable


@api_view(['POST'])
def recommend(request):
    try:
        payload = request.data if isinstance(request.data, dict) else {}
        return Response(recommend_outfit(payload))
    except OutfitContextError as exc:
        return error_response(400, str(exc))
    except OutfitDataUnavailable as exc:
        return error_response(503, str(exc), 'data_unavailable')


@api_view(['POST'])
def recommend_daily(request):
    try:
        payload = request.data if isinstance(request.data, dict) else {}
        return Response(recommend_daily_outfit(payload))
    except OutfitContextError as exc:
        return error_response(400, str(exc))
    except OutfitDataUnavailable as exc:
        return error_response(503, str(exc), 'data_unavailable')
