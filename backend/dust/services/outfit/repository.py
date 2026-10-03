import logging

from django.utils import timezone

from dust.models import OutfitRecommendationCache


logger = logging.getLogger(__name__)


def get_cached_recommendation(cache_key: str) -> dict | None:
    try:
        row = OutfitRecommendationCache.objects.filter(cache_key=cache_key, valid_until__gt=timezone.now()).first()
        return row.response_json if row and isinstance(row.response_json, dict) else None
    except Exception:
        logger.warning("Outfit recommendation cache lookup failed.", exc_info=True)
        return None


def save_cached_recommendation(cache_key: str, response: dict, source: str, valid_until) -> None:
    try:
        OutfitRecommendationCache.objects.update_or_create(
            cache_key=cache_key,
            defaults={"response_json": response, "source": source, "valid_until": valid_until},
        )
    except Exception:
        logger.warning("Outfit recommendation cache save failed.", exc_info=True)
