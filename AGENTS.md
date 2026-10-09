# WeatherToDo 작업 규칙 (Codex·Claude 공통)

## 작업 시작 전
1. `WEATHERTODO_HANDOFF.md`의 마지막 섹션들을 읽고 최근 변경을 파악한다. 다른 에이전트(Codex 또는 Claude)가 고친 내용도 이곳에 기록된다.
2. `git status`와 `git log -5`로 미커밋 변경과 최근 커밋을 확인한다. 미커밋 변경은 다른 에이전트의 작업일 수 있으므로 되돌리거나 덮어쓰지 않는다.

## 유지해야 하는 결정 (이유 없이 되돌리지 말 것)
- **개인정보**: 일정 제목은 서버로 보내거나 서버에 저장하지 않는다.
  - 아침 알림용 일정은 `{date, time}`만 보낸다(`notification_registry.clean_notification_calendar_events`, 앱 `registerNotificationDevice`).
  - 옷차림 추천은 제목을 상황(occasion) 분류에만 쓰고, LLM 입력·캐시·로그에 넣지 않는다. 하루 단위 캐시에는 `schedule_tips`를 저장하지 않는다.
- **LLM 호출 상한**: 클라이언트가 바꿀 수 있는 헤더(`X-Device-Id`, `X-Forwarded-For` 첫 항목)로 키를 만들지 않는다. IP 기준이며, 프록시 뒤에서는 `TRUSTED_PROXY_COUNT`를 설정한다.
- **미세먼지 3일 예측**: `/dust/predict/`는 에어코리아 예보 등급(`dust/airkorea_forecast.py`)을 쓴다. Prophet은 선택 기능용으로만 남아 있고 `requirements-optional.txt`에 있다. 서버 코드에서 `prophet`을 모듈 최상단에서 import하지 않는다.
- **선택 기능**: 챗봇(`/dust/chat/`), `/analyze/`, 기상 상세(`/dust/weather/past/`)는 `ENABLE_OPTIONAL_FEATURES`가 켜졌을 때만 라우팅된다(기본값 = `DEBUG`).
- **보안**: `/dust/mobile-map/`의 인라인 `<script>`에 요청 값을 넣을 때는 `_script_json()`을 쓴다. 로그인 비밀번호 비교는 `Users.matches_client_password()`만 쓴다.

## 검증 명령
- 백엔드: `backend`에서 `venv\Scripts\python.exe manage.py test dust app` (가상환경 `backend\venv`, Python 3.11. 시스템 `python`은 3.14·Django 6이라 쓰지 않는다)
- 모바일: `mobile`에서 `npm run typecheck`, `npm run lint`, `node --test src/**/*.test.mjs`

## 자동 검사 (훅)
- 커밋 전 검사 `.githooks/pre-commit`이 비밀 파일(.env, google-services.json, 키 파일), 키·토큰 모양 문자열, 로컬 .env의 실제 비밀 값이 커밋에 섞였는지 확인하고, 모바일 TS 파일이 바뀌었으면 `tsc`를 실행한다. 막히면 원인을 고친다. `--no-verify`로 우회하지 않는다.
- 새 PC에서 클론했다면 한 번 실행한다: `git config core.hooksPath .githooks`
- Claude Code에서는 `.claude/settings.json`의 훅이 `.env` 읽기를 막는다.

## 작업 기록
- 작업을 마치면 두 곳에 남긴다.
  1. `WEATHERTODO_HANDOFF.md` 맨 아래에 번호를 이어 섹션을 추가한다(날짜·작성자·변경 요약·검증 결과).
  2. Notion "WeatherToDo 개발 > 릴리즈 노트" 데이터베이스에 작업 1건당 페이지 1개를 추가한다. 형식은 그 페이지의 "작성 규칙"을 따른다.
- 커밋 메시지에는 무엇을 왜 바꿨는지 적는다. 다른 에이전트는 `git log`로 변경을 파악한다.
