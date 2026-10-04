import json
import logging
import os
from typing import Protocol

import requests

from .constants import SYSTEM_PROMPT


logger = logging.getLogger(__name__)
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "outfit_note": {"type": "string"},
        "layering_tip": {"type": "string"},
        "reasons": {
            "type": "object",
            "properties": {
                "umbrella": {"type": "string"},
                "mask": {"type": "string"},
                "windbreaker": {"type": "string"},
                "scarf_gloves": {"type": "string"},
            },
        },
    },
    "required": ["summary", "outfit_note", "layering_tip", "reasons"],
}


class LLMClient(Protocol):
    def generate(self, system: str, user_json: dict) -> dict:
        ...


class GeminiLLMClient:
    def __init__(self, *, api_key: str, model: str, timeout: int):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    def generate(self, system: str, user_json: dict) -> dict:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"parts": [{"text": json.dumps(user_json, ensure_ascii=False, sort_keys=True)}]}],
            "generationConfig": {
                "temperature": 0.25,
                "maxOutputTokens": 400,
                "responseMimeType": "application/json",
                "responseSchema": OUTPUT_SCHEMA,
            },
        }
        last_error = None
        for _attempt in range(2):
            try:
                response = requests.post(
                    GEMINI_URL.format(model=self.model),
                    headers={"Content-Type": "application/json", "x-goog-api-key": self.api_key},
                    json=body,
                    timeout=self.timeout,
                )
                response.raise_for_status()
                text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
                return json.loads(text)
            except (KeyError, IndexError, TypeError, ValueError, requests.RequestException) as exc:
                last_error = exc
        raise RuntimeError("LLM generation failed") from last_error


def build_llm_client() -> LLMClient | None:
    if os.getenv("LLM_ENABLED", "true").strip().lower() not in {"1", "true", "yes", "on"}:
        return None
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    if not provider or not api_key:
        return None
    if provider != "gemini":
        # TODO(확인 필요): 사용할 LLM Provider가 확정되면 해당 구현체를 추가한다.
        logger.warning("Unsupported outfit LLM provider: %s", provider)
        return None
    try:
        timeout = max(1, min(int(os.getenv("LLM_TIMEOUT_SEC", "8")), 30))
    except ValueError:
        timeout = 8
    return GeminiLLMClient(api_key=api_key, model=os.getenv("LLM_MODEL", "gemini-2.5-flash"), timeout=timeout)


def llm_input_for(rule_result: dict, request) -> dict:
    snapshot = rule_result["weather_snapshot"]
    return {
        "locale": "ko-KR",
        "occasion": rule_result["occasion"],
        "activity_type": rule_result["activity_type"],
        "time_window": {"start_hour": request.start.hour, "end_hour": request.end.hour},
        "weather": {key: snapshot.get(key) for key in ("feels_min", "feels_max", "feels_avg", "temp_range", "rain_prob_max", "wind_max")},
        "air": {"pm10_max": snapshot.get("pm10_max"), "pm25_max": snapshot.get("pm25_max")},
        "sensitivity": request.sensitivity,
        "base_outfit": {key: rule_result["outfit"][key] for key in ("band", "top", "bottom", "outer")},
        "must_have": [{"type": item["type"], "level": item["level"], "label": item["label"]} for item in rule_result["must_have"]],
    }
