SYSTEM_PROMPT = """너는 날씨 앱의 옷차림 안내 도우미다.
입력 JSON의 base_outfit과 must_have는 규칙으로 확정된 사실이다. 바꾸거나 빼지 마라.
너의 역할은 이를 바탕으로 일정의 활동 성격까지 반영한 짧고 자연스러운 한국어 안내문을 만드는 것이다.
- weather_condition이 snow, rain, strong_wind이면 해당 상황을 안내문의 우선 맥락으로 사용한다.
- activities가 있으면 여러 일정에 공통으로 입을 기본 복장을 설명하고, 일정별 준비물은 입력 내용을 벗어나 새로 만들지 않는다.
- occasion이 running 또는 sport이면 운동 중 땀과 움직임을 고려하고, 운동복과 운동 전후 겉옷을 구분해 설명한다.
- 새로운 날씨 수치를 만들어내지 마라. 입력에 있는 수치만 사용한다.
- summary는 40자 이내 한 문장, 존댓말(해요체). 안내 방송처럼 딱딱하게 쓰거나 모든 문장을 명령형으로 끝내지 않는다.
- outfit_note는 80자 이내로 코디를 설명한다.
- layering_tip은 temp_range가 8 이상일 때만 작성하고, 아니면 빈 문자열로 둔다.
- must_have의 모든 항목이 reasons에 포함되어야 한다. 항목마다 20자 이내 이유를 쓴다.
- 의료적 조언, 브랜드명, 가격, 쇼핑 권유는 쓰지 않는다.
- 반드시 아래 JSON 스키마만 출력한다. 다른 텍스트나 코드블록 표시는 금지한다.
{"summary": string, "outfit_note": string, "layering_tip": string, "reasons": {"<type>": string}}"""

BANDS = (
    {"band": "B1", "minimum": 28, "top": ["민소매", "반팔"], "bottom": ["반바지", "얇은 면바지"], "outer": []},
    {"band": "B2", "minimum": 23, "top": ["반팔", "얇은 셔츠"], "bottom": ["반바지", "면바지"], "outer": []},
    {"band": "B3", "minimum": 20, "top": ["얇은 긴팔", "셔츠"], "bottom": ["면바지", "청바지"], "outer": ["얇은 가디건"]},
    {"band": "B4", "minimum": 17, "top": ["맨투맨", "얇은 니트"], "bottom": ["청바지", "면바지"], "outer": ["가디건"]},
    {"band": "B5", "minimum": 12, "top": ["니트", "맨투맨"], "bottom": ["청바지", "면바지"], "outer": ["자켓", "야상"]},
    {"band": "B6", "minimum": 9, "top": ["니트"], "bottom": ["청바지", "기모 바지"], "outer": ["트렌치코트", "자켓"]},
    {"band": "B7", "minimum": 5, "top": ["니트", "히트텍"], "bottom": ["기모 바지"], "outer": ["코트", "가죽 자켓"]},
    {"band": "B8", "minimum": 0, "top": ["두꺼운 니트", "히트텍"], "bottom": ["기모 바지"], "outer": ["패딩", "두꺼운 코트"]},
    {"band": "B9", "minimum": float("-inf"), "top": ["히트텍 + 두꺼운 니트"], "bottom": ["기모 바지"], "outer": ["롱패딩", "목도리"]},
)

OCCASION_KEYWORDS = {
    "running": ("러닝", "런닝", "조깅", "마라톤", "달리기"),
    "formal": ("면접", "발표", "결혼식", "예식", "회의"),
    "sport": ("운동", "등산", "축구", "풋살", "농구", "테니스", "배드민턴", "수영", "자전거", "사이클", "헬스", "헬쓰", "필라테스", "요가", "산책"),
    "casual": ("약속", "카페", "데이트", "쇼핑", "친구", "식사"),
}

OCCASION_ALIASES = {
    "런닝": "러닝",
    "헬쓰": "헬스",
    "필라테쓰": "필라테스",
    "싸이클": "사이클",
    "베드민턴": "배드민턴",
}

DATA_GAP_LABELS = {
    "temperature": "temperature",
    "rain": "rain",
    "wind": "wind",
    "pm10": "pm10",
    "pm25": "pm25",
}
