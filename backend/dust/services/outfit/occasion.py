import re
import unicodedata

from .constants import OCCASION_ALIASES, OCCASION_KEYWORDS


def normalize_occasion_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower()
    normalized = re.sub(r"[^0-9a-z가-힣]+", "", normalized)
    for typo, canonical in OCCASION_ALIASES.items():
        normalized = normalized.replace(typo, canonical)
    return normalized


def classify_occasion(title: str) -> str:
    normalized = normalize_occasion_text(title)
    for occasion, keywords in OCCASION_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return occasion
    return "unknown"
