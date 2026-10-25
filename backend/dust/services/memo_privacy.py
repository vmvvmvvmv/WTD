"""AI로 입력: 메모를 Gemini로 보내기 전에 개인정보와 민감한 단어를 가린다.

- 개인 식별 정보(전화번호·이메일·주민번호·카드·계좌·상세 주소)는 일정에 필요 없어 [전화번호]처럼 지운 채 보낸다(되돌리지 않음).
- 건강·법률·종교 같은 민감한 단어는 ⟦1⟧ 같은 표시로 바꿔 보내고, AI가 돌려준 제목·장소에서 원래 단어로 되돌린다.
목록에 없는 민감한 내용은 그대로 가므로 완벽한 차단은 아니다. 앱 화면에서도 개인정보를 적지 말라고 안내한다.
"""
import re

# 순서가 중요하다: 긴 번호(주민·카드)를 먼저 찾아야 전화번호·일반 번호 규칙에 잘게 잘리지 않는다.
PERSONAL_PATTERNS = (
    ("[이메일]", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("[주민번호]", re.compile(r"(?<!\d)\d{6}\s?-?\s?[1-8]\d{6}(?!\d)")),
    ("[카드번호]", re.compile(r"(?<!\d)\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}(?!\d)")),
    # 국번은 휴대폰(010 등)·지역번호(02, 031 등)만. 앞에 숫자·콜론·하이픈이 붙으면 시각("15:00 010-…")이나 계좌번호의 일부라 보지 않는다.
    ("[전화번호]", re.compile(r"(?<![\d:.\-])(?:\+82[- ]?0?|0)(?:1[016789]|[2-6]\d?)[- .]?\d{3,4}[- .]?\d{4}(?!\d)")),
    ("[여권번호]", re.compile(r"(?<![A-Za-z0-9])[A-Za-z]\d{8}(?![A-Za-z0-9])")),
    # 계좌번호처럼 숫자가 10자리 이상 이어진(하이픈 포함) 번호. 띄어쓰기는 이어 보지 않아 "2026-10-25 15:00"(날짜+시각)은 걸리지 않는다.
    ("[번호]", re.compile(r"(?<!\d)\d(?:-?\d){9,}(?!\d)")),
    ("[상세주소]", re.compile(r"\d{1,4}\s?동\s?\d{1,4}\s?호|\d{1,5}\s?호(?!\s?선)")),
)

# 개인정보 보호법의 민감정보(건강·성생활·사상·신념·정치·범죄 등)에 가까운 단어. 긴 단어가 먼저 잡히도록 길이순으로 쓴다.
SENSITIVE_WORDS = sorted({
    "산부인과", "여성의원", "비뇨기과", "비뇨의학과", "정신건강의학과", "신경정신과", "정신과", "심리상담", "상담센터", "심리치료",
    "항암", "암센터", "방사선치료", "투석", "난임", "시험관", "인공수정", "임신", "출산", "낙태", "임신중절",
    "성병", "에이즈", "HIV", "탈모", "성형", "지방흡입", "보톡스", "시술", "재활", "약물치료", "우울증", "공황",
    "알코올", "중독", "치매", "건강검진", "내시경", "조직검사",
    "법원", "재판", "변호사", "경찰서", "검찰", "이혼", "채무", "파산", "회생", "압류",
    "교회", "성당", "예배", "미사", "법회", "기도회", "집회", "시위", "당원", "선거운동",
}, key=len, reverse=True)
SENSITIVE_PATTERN = re.compile("|".join(re.escape(word) for word in SENSITIVE_WORDS), re.IGNORECASE)
TOKEN_PATTERN = re.compile(r"⟦(\d+)⟧")


def mask_memo(text: str) -> tuple[str, dict[str, str]]:
    for label, pattern in PERSONAL_PATTERNS:
        text = pattern.sub(label, text)
    tokens: dict[str, str] = {}

    def replace(match: re.Match) -> str:
        word = match.group(0)
        for token, original in tokens.items():
            if original == word:
                return token
        token = f"⟦{len(tokens) + 1}⟧"
        tokens[token] = word
        return token

    return SENSITIVE_PATTERN.sub(replace, text), tokens


# AI가 지운 개인정보 표시를 제목·장소에 그대로 옮겨 쓰는 경우가 있어(예: "상세주소 앞") 돌려받을 때 지운다.
# "번호"는 흔한 단어라 대괄호가 붙은 경우만 지운다.
LABEL_PATTERN = re.compile(r"\[(?:이메일|주민번호|카드번호|전화번호|여권번호|번호|상세주소)\]|이메일|주민번호|카드번호|전화번호|여권번호|상세주소")


def unmask(value: str, tokens: dict[str, str]) -> str:
    # AI가 모르는 번호를 지어내면 그 표시는 지운다.
    value = TOKEN_PATTERN.sub(lambda match: tokens.get(match.group(0), ""), value)
    value = re.sub(r"\s+", " ", LABEL_PATTERN.sub("", value)).strip(" ,·-")
    # 표시를 지우고 "앞"처럼 한 글자만 남으면 의미가 없어 비운다.
    return value if len(value) >= 2 else ""
