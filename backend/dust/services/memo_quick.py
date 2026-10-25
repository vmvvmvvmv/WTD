"""AI로 입력의 빠른 길: 날짜·시각·제목이 분명한 메모는 AI 없이 규칙으로 바로 일정으로 바꾼다.

"내일 3시 친구 약속", "토요일 오전 7시 한강공원 러닝", "다음 주 월요일 2시~4시 회의"처럼 쓴 메모가 대상이다.
한 조각이라도 규칙으로 확실히 못 읽으면 None을 돌려 AI에게 맡긴다(애매하게 추측하지 않는다).
결과는 AI 결과와 같은 모양(clean_events가 받는 dict)이다.
"""
import re
from datetime import date, datetime, timedelta

WEEKDAYS = "월화수목금토일"
RELATIVE_DAYS = {"오늘": 0, "내일": 1, "모레": 2, "글피": 3}
AM_WORDS = ("오전", "아침", "새벽")
PM_WORDS = ("오후", "저녁", "밤", "낮", "점심")

DATE_PATTERN = re.compile(
    r"^(?:(?P<rel>오늘|내일|모레|글피)"
    r"|(?:(?P<week>이번\s?주|다음\s?주|담주)\s?)?(?P<wd>[월화수목금토일])요일?"
    r"|(?:(?P<month>\d{1,2})\s?월\s?)?(?P<day>\d{1,2})\s?일"
    r"|(?P<m2>\d{1,2})/(?P<d2>\d{1,2}))\s*"
)
PERIOD = r"(?P<{name}>오전|오후|아침|저녁|밤|낮|점심|새벽)?\s?"
TIME = r"(?P<{h}>\d{{1,2}})\s?(?:시\s?(?:(?P<{m}>\d{{1,2}})\s?분|(?P<{half}>반))?|:(?P<{mc}>\d{{2}}))"
TIME_PATTERN = re.compile(
    "^" + PERIOD.format(name="p1") + TIME.format(h="h1", m="m1", half="half1", mc="mc1")
    + r"(?:\s?(?:~|-|부터)\s?" + PERIOD.format(name="p2") + TIME.format(h="h2", m="m2", half="half2", mc="mc2") + r"(?:\s?까지)?)?\s*"
)
# 장소로 볼 만한 끝말. 첫 번째로 맞는 낱말을 장소로 떼어 낸다.
PLACE_SUFFIXES = ("역", "공원", "카페", "센터", "학교", "대학교", "도서관", "병원", "의원", "치과", "마트", "백화점", "점", "터미널", "공항", "시장", "체육관", "운동장", "헬스장")
OUTDOOR_WORDS = ("러닝", "런닝", "조깅", "산책", "등산", "축구", "풋살", "야구", "테니스", "자전거", "캠핑", "피크닉", "소풍", "낚시", "골프", "한강", "공원", "산 ")
TRANSIT_WORDS = ("출장", "이동", "여행", "출근", "퇴근", "공항", "KTX", "ktx", "기차", "비행기", "고속버스")
SEPARATORS = re.compile(r"[\n,，]|그리고")


def _resolve_date(match: re.Match, today: date) -> date | None:
    if match.group("rel"):
        return today + timedelta(days=RELATIVE_DAYS[match.group("rel")])
    if match.group("wd"):
        target = WEEKDAYS.index(match.group("wd"))
        week = (match.group("week") or "").replace(" ", "")
        if week in ("다음주", "담주"):
            # 다음 주 X요일: 다음 주 월요일부터 세어 그 요일.
            next_monday = today + timedelta(days=7 - today.weekday())
            return next_monday + timedelta(days=target)
        if week == "이번주":
            return today + timedelta(days=target - today.weekday())
        return today + timedelta(days=(target - today.weekday()) % 7)
    month = int(match.group("month") or match.group("m2") or 0) or None
    day = int(match.group("day") or match.group("d2"))
    try:
        if month is None:
            candidate = today.replace(day=day)
            if candidate < today:  # 지난 날짜면 다음 달 그날
                candidate = (today.replace(day=1) + timedelta(days=32)).replace(day=day)
            return candidate
        candidate = date(today.year, month, day)
        return candidate if candidate >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def _hour(raw_hour: str, period: str | None, rest: str) -> int | None:
    hour = int(raw_hour)
    if not 0 <= hour <= 24:
        return None
    if hour > 12:
        return hour if hour < 24 else None
    period = period or next((word for word in AM_WORDS + PM_WORDS if word in rest), None)
    if period in AM_WORDS:
        return 0 if hour == 12 else hour
    if period in PM_WORDS:
        return 12 if hour == 12 else hour + 12
    # 오전·오후가 없을 때: 1~6시는 오후, 12시는 낮 12시로 본다. 7~11시는 아침·저녁 둘 다 흔해 AI에게 맡긴다.
    if 1 <= hour <= 6:
        return hour + 12
    if hour == 12:
        return 12
    return None


def _minute(match: re.Match, index: int) -> int:
    if match.group(f"half{index}"):
        return 30
    value = match.group(f"m{index}") or match.group(f"mc{index}")
    return int(value) if value else 0


def _split_place(rest: str) -> tuple[str, str]:
    words = rest.split()
    for index, word in enumerate(words):
        if len(word) >= 2 and word.endswith(PLACE_SUFFIXES):
            title = " ".join(words[:index] + words[index + 1:]).strip()
            return title or word, word
    return rest, ""


def _activity(text: str) -> str:
    if any(word in text for word in TRANSIT_WORDS):
        return "transit"
    if any(word in f"{text} " for word in OUTDOOR_WORDS):
        return "outdoor"
    return "indoor"


def _parse_piece(piece: str, now: datetime, previous_date: date | None) -> dict | None:
    piece = re.sub(r"\s+", " ", piece).strip()
    date_match = DATE_PATTERN.match(piece)
    if date_match:
        day = _resolve_date(date_match, now.date())
        piece = piece[date_match.end():]
    else:
        # "내일 3시 회의, 5시 저녁"처럼 날짜를 앞 조각에서 이어 쓰는 경우만 받는다.
        day = previous_date
    if day is None:
        return None
    time_match = TIME_PATTERN.match(piece)
    if not time_match:
        return None
    # 시각 뒤에 붙는 조사(예: "3시에 회의")만 앞에서 뗀다. 끝을 자르면 "회의" 같은 제목이 망가진다.
    rest = re.sub(r"^(?:에서|에)\s*", "", piece[time_match.end():].strip(" -~"))
    start_hour = _hour(time_match.group("h1"), time_match.group("p1"), rest)
    if start_hour is None:
        return None
    end_time = ""
    if time_match.group("h2"):
        # 끝 시각에 오전·오후가 없으면 시작과 같은 쪽으로 본다(예: 오후 2시~4시).
        end_period = time_match.group("p2") or time_match.group("p1") or ("오후" if start_hour >= 12 else "오전")
        end_hour = _hour(time_match.group("h2"), end_period, "")
        if end_hour is None:
            return None
        end_time = f"{end_hour:02d}:{_minute(time_match, 2):02d}"
    if not re.search(r"[가-힣A-Za-z]", rest):
        return None
    title, place = _split_place(rest)
    start = datetime.combine(day, datetime.min.time()).replace(hour=start_hour, minute=_minute(time_match, 1))
    # 요일만 썼는데 오늘이고 이미 지난 시각이면 다음 주 그 요일(AI 규칙과 같게).
    is_past = start <= now.replace(tzinfo=None)
    if date_match and date_match.group("wd") and not date_match.group("week") and is_past:
        day += timedelta(days=7)
    # "25일 오전 7시"처럼 날짜를 숫자로 적었는데 오늘의 지난 시각이면, 오늘을 잘못 쓴 건지 다음 달인지 애매해 AI에게 맡긴다.
    # ('오늘'·'내일'처럼 분명히 쓴 경우와 앞 조각의 날짜를 이어 쓴 경우는 그대로 둔다.)
    elif date_match and (date_match.group("day") or date_match.group("d2")) and is_past:
        return None
    # 앞 조각의 날짜를 이어 쓴 일정("오늘 9시 회의, 7시 약속")이 이미 지난 시각이면 뜻이 애매해 AI에게 맡긴다.
    elif not date_match and is_past:
        return None
    return {
        "title": title,
        "date": day.isoformat(),
        "time": f"{start_hour:02d}:{_minute(time_match, 1):02d}",
        "end_date": "",
        "end_time": end_time,
        "place": place,
        "activity_type": _activity(rest),
    }


def quick_parse(text: str, now: datetime) -> dict | None:
    pieces = [piece for piece in SEPARATORS.split(text) if piece.strip()]
    if not pieces or len(pieces) > 10:
        return None
    events = []
    previous_date = None
    for piece in pieces:
        event = _parse_piece(piece, now, previous_date)
        if event is None:
            return None
        previous_date = date.fromisoformat(event["date"])
        events.append(event)
    return {"events": events}
