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

# 비가 일정 시간대의 이 비율 이상이거나, 시간당 이 강수량 이상이거나, 일정이 이 시간 이하로 짧으면
# 옷까지 비 대비로 바꾼다(rain). 그 밖의 잠깐 비는 showers로 두고 우산만 챙기게 한다.
SUSTAINED_RAIN_RATIO = 0.5
HEAVY_RAIN_MM = 3.0
SHORT_SCHEDULE_HOURS = 3.0

DATA_GAP_LABELS = {
    "temperature": "temperature",
    "rain": "rain",
    "wind": "wind",
    "pm10": "pm10",
    "pm25": "pm25",
}
