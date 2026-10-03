import json
import re
from typing import Any


OUTPUT_FIELDS = ("summary", "outfit_note", "layering_tip", "reasons")


def _numbers_in(value: Any) -> set[str]:
    return set(re.findall(r"\d+(?:\.\d+)?", json.dumps(value, ensure_ascii=False)))


def validate_llm_output(value: Any, *, llm_input: dict, must_have: list[dict], temp_range: float | None) -> dict:
    if not isinstance(value, dict) or any(field not in value for field in OUTPUT_FIELDS):
        raise ValueError("LLM output schema mismatch")
    summary = value.get("summary")
    outfit_note = value.get("outfit_note")
    layering_tip = value.get("layering_tip")
    reasons = value.get("reasons")
    if not isinstance(summary, str) or not isinstance(outfit_note, str) or not isinstance(layering_tip, str) or not isinstance(reasons, dict):
        raise ValueError("LLM output field type mismatch")
    if len(summary) > 40 or len(outfit_note) > 80:
        raise ValueError("LLM output text is too long")
    if (temp_range is None or temp_range < 8) and layering_tip:
        raise ValueError("Unexpected layering tip")
    required_types = {item["type"] for item in must_have}
    if not required_types.issubset(reasons.keys()):
        raise ValueError("Missing must-have reason")
    if any(not isinstance(reasons[key], str) or len(reasons[key]) > 20 for key in required_types):
        raise ValueError("Invalid must-have reason")
    output_numbers = _numbers_in({"summary": summary, "outfit_note": outfit_note, "layering_tip": layering_tip, "reasons": reasons})
    if not output_numbers.issubset(_numbers_in(llm_input)):
        raise ValueError("LLM output introduced a number")
    return {"summary": summary, "outfit_note": outfit_note, "layering_tip": layering_tip, "reasons": reasons}
