from .constants import OCCASION_KEYWORDS


def classify_occasion(title: str) -> str:
    normalized = title.lower().strip()
    for occasion, keywords in OCCASION_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return occasion
    return "unknown"
