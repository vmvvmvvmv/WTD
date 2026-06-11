import os
import urllib.request
import urllib.error
import json
from django.http import JsonResponse
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

_cache = {}

def call_gemini(prompt, cache_key):
    if cache_key in _cache:
        return _cache[cache_key]
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}]
        }).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode("utf-8"))
            result = data["candidates"][0]["content"]["parts"][0]["text"]
            _cache[cache_key] = result
            return result
    except Exception as e:
        print(f"Gemini API 오류: {e}")
        return None

def compact(req, pm, dis):
    cache_key = f"compact_{pm}_{dis}"
    response = call_gemini(
        f"미세먼지 농도가 {pm} µg/m³일 때 대기질 수준(좋음/보통/나쁨/매우나쁨)을 판단하고, {dis} 환자를 위한 답변을 아래 형식으로 작성해줘:\n오늘은 미세먼지가 OO 수준입니다. {dis} 환자는 다음에 유의해주세요:\n1. (주의사항1)\n2. (주의사항2)\n3. (주의사항3)\n3줄 이내로 간결하게.",
        cache_key
    )
    if response is None:
        return JsonResponse({'response': '현재 AI 응답을 가져올 수 없습니다.'})
    return JsonResponse({'response': response})

def complex(req, pm, dis):
    cache_key = f"complex_{pm}_{dis}"
    response = call_gemini(
        f"미세먼지 농도가 {pm} µg/m³일 때 대기질 수준(좋음/보통/나쁨/매우나쁨)을 판단하고, {dis} 환자를 위한 답변을 아래 형식으로 작성해줘:\n오늘은 미세먼지가 OO 수준입니다. {dis} 환자는 다음에 유의해주세요:\n1. 외출 가능 여부\n2. {dis} 환자가 특히 주의해야 할 점\n3. 마스크 착용 여부\n4. 증상 악화 시 대처법",
        cache_key
    )
    if response is None:
        return JsonResponse({'response': '현재 AI 응답을 가져올 수 없습니다.'})
    return JsonResponse({'response': response})