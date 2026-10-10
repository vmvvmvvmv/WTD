# WeatherToDo 작업 인수인계

작성일: 2026-09-19 · 최종 갱신: 2026-10-09

이 문서는 새 Codex 채팅에서 WeatherToDo 프로젝트 작업을 이어가기 위한 인수인계 문서다.
작업 규칙과 유지해야 할 결정은 최상위 `AGENTS.md`에 있다. 최근 변경은 이 문서의 마지막 섹션들과 `git log`로 확인한다.

## 0. 빠른 실행 순서 (2026-10-09 기준)

운영 서버가 없으므로 PC에서 백엔드를 켜고, 휴대폰은 USB로 연결해 PC 백엔드를 쓴다.

1. **백엔드 켜기**: `backend\start_local_backend.bat`을 더블클릭하거나 명령창에서 실행한다. 창은 켜 둔다.
   - `backend\venv`(Python 3.11)를 자동으로 쓰고, 데이터 최신성 검사 → `adb reverse tcp:8001 tcp:8001` → `http://127.0.0.1:8001` 서버 실행 순서로 동작한다.
   - "Local data is stale"이 나오면 다른 창에서 `backend\collect_hourly.bat`을 한 번 실행한다. 평소에는 Windows 예약 작업(`WeatherToDo Hourly Collection` 매시 5분, `WeatherToDo Morning Notifications` 매일 07:00)이 자동으로 수집한다.
2. **휴대폰 연결**: USB 디버깅을 켜고 `adb devices`가 `device`인지 확인한다.
3. **Metro 켜기**: 새 창에서 아래를 실행한다.
   ```powershell
   cd C:\Users\goodd\Documents\GitHub\WTD\mobile
   adb reverse tcp:8081 tcp:8081
   npx expo start --dev-client --localhost --clear --port 8081
   ```
4. 휴대폰의 WeatherToDo 개발 빌드를 연다. 개발 빌드가 없거나 네이티브 설정을 바꿨다면 `npm run android`로 새로 설치한다.

`mobile/.env`의 `EXPO_PUBLIC_API_URL`은 `http://127.0.0.1:8001`(USB + adb reverse) 이어야 한다. 예전 운영 주소 `https://wtd-api.vmv-lab.com`은 서버 종료로 응답하지 않는다.

## 1. 프로젝트 위치

- 저장소: `C:\Users\goodd\Documents\GitHub\WTD`
- 모바일 앱: `C:\Users\goodd\Documents\GitHub\WTD\mobile`
- 백엔드: `C:\Users\goodd\Documents\GitHub\WTD\backend`
- 모바일 기술: React Native + Expo SDK 54 + TypeScript
- 백엔드 기술: Django
- 운영 서버: 현재 없음. AWS Lightsail(`https://wtd-api.vmv-lab.com`)은 2026-06-12 ~ 2026-10 운영 후 종료했다. 지금은 로컬 백엔드(`127.0.0.1:8001`)로 개발한다.
- 작업 규칙: 저장소 최상위 `AGENTS.md`(Codex·Claude 공통)

## 2. 모바일 앱 실행 방법

### 의존성 설치

PowerShell에서 실행한다.

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\mobile
npm ci
```

`mobile/.env`가 필요하다. 최소한 다음 환경변수를 준비한다.

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001
EXPO_PUBLIC_APP_TEST_TOKEN=개발용_앱_토큰
EXPO_PUBLIC_NAVER_MAP_CLIENT_ID=네이버_지도_클라이언트_ID
```

- `127.0.0.1:8001`은 USB 연결 후 `adb reverse tcp:8001 tcp:8001`(백엔드 배치 파일이 자동 실행)이 있어야 휴대폰에서 PC로 연결된다. Android 에뮬레이터라면 `http://10.0.2.2:8001`을 쓴다.
- `EXPO_PUBLIC_APP_TEST_TOKEN`은 `backend/.env`의 `APP_TEST_TOKEN`과 같은 값이어야 한다. 다르면 `/dust/`, `/outfit/` 요청이 403이 된다.
- `.env`를 바꾼 뒤에는 Metro를 `--clear`로 다시 시작한다.

Android 개발 빌드 또는 `expo prebuild`를 실행하려면 `mobile/google-services.json`도 필요하다. 이 파일은 Git에 올리지 않으며 Firebase 콘솔에서 내려받는다.

### 코드 검사

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\mobile
npm run typecheck
npm run doctor
```

현재 TypeScript 검사는 통과한다. `expo-doctor`의 남은 경고는 `android/ios` 네이티브 폴더와 `app.config.js` 설정을 함께 사용하는 Prebuild 관련 경고다. 의존성 중복 문제는 해결된 상태다.

### Metro 실행

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\mobile
npx expo start --dev-client --localhost --clear --port 8081
```

휴대폰 USB 연결을 사용할 때는 별도 PowerShell에서 다음을 먼저 실행한다.

```powershell
adb devices
adb reverse --remove-all
adb reverse tcp:8081 tcp:8081
```

`adb devices` 결과가 `device`여야 한다. `unauthorized`이면 휴대폰에서 USB 디버깅 RSA 인증을 허용한다.

### Android 실행

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\mobile
npm run android
```

이미 설치된 개발 빌드에 Metro만 연결하려면 `npx expo start --dev-client ...`를 사용한다. 처음 네이티브 빌드를 하는 PC에서는 Android Studio, Android SDK, JDK, ADB가 설치되어 있어야 한다.

Metro 연결이 계속 실패하면 임시로 터널을 사용할 수 있다.

```powershell
npx expo start --dev-client --tunnel --clear
```

### Android 로그 확인

```powershell
adb logcat -c
adb logcat -v time "*:S" ReactNativeJS:V Expo:V ExpoModulesCore:V AndroidRuntime:E
```

`This developer build encountered an error`가 나타날 때는 먼저 Metro 터미널의 최초 오류를 확인한다. 백엔드가 꺼진 경우에는 보통 Dev Launcher 자체가 죽기보다 API Network Error 또는 데이터 로딩 실패로 나타난다.

## 3. 백엔드 로컬 실행

운영 서버가 없으므로(2026-10 Lightsail 종료) 앱을 확인하려면 로컬 백엔드를 실행한다.

**평소에는 `backend\start_local_backend.bat`만 실행하면 된다**(0장 참고). 아래는 가상환경을 처음 만들거나 직접 명령을 실행할 때의 방법이다.

가상환경은 `backend\venv`(Python 3.11)를 쓴다. Django 4.2가 지원하는 Python은 3.8~3.12라서 `py -3`(이 PC에서는 3.14)으로 만들지 않는다. `start_local_backend.bat`은 `backend\venv`를 가장 먼저 찾는다.

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\backend
py -3.11 -m venv venv          # 처음 한 번만
.\venv\Scripts\Activate.ps1    # cmd에서는 venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8001
```

- 백엔드 테스트: `venv\Scripts\python.exe manage.py test dust app`
- 데이터 상태 확인: `venv\Scripts\python.exe manage.py check_data_freshness`
- 챗봇 등 선택 기능의 Prophet까지 쓰려면 `pip install -r requirements-optional.txt`를 추가로 실행한다.
- 가상환경을 켜지 않고 `python`을 실행하면 시스템 Python(3.14, Django 6)이 쓰이므로 주의한다.

로컬 백엔드 사용 시에는 `backend/.env`, MySQL, 공공데이터·기상청·네이버·Gemini API 키가 필요하다.

## 4. 최근 작업 내역

### 2026-09-11: 모바일 구조 정리

- `App.tsx`를 Provider와 앱 본문을 조립하는 진입점으로 축소
- `src/app/AppProviders.tsx`로 Safe Area Provider 분리
- `src/app/AppContent.tsx`에서 탭 상태·API 상태·화면 조건부 렌더링 관리
- `src/navigation/routes.ts`에서 탭 key·label·icon 통합
- `src/navigation/AppTabBar.tsx`로 하단 탭 UI 분리
- 사용하지 않는 React Navigation 패키지 제거
- Expo 관련 버전 정리

현재는 기능 안정성을 위해 React Navigation으로 완전히 전환하지 않고 `activeTab` 상태 기반으로 탭을 전환한다. API 호출과 지역·지도·캘린더·알림 상태는 아직 `AppContent.tsx`에 많이 남아 있다.

### 2026-09-13: 홈 UI 재구성

- 외출지수·기온·습도·풍속·강수량·PM10·PM2.5·O3를 각각 독립 배너로 분리
- 배너 왼쪽 원형 게이지, 오른쪽 수치·상태·설명 구조 적용
- 복제 슬라이드와 위치 보정으로 무한 스와이프 구현
- 홈 상단 빈 공간과 영역 간격 조정
- 오늘 활동 가이드와 전국 날씨 지도 미리보기 배치 조정
- 날씨 상태에 따라 맑음·흐림·비·눈 배경 이미지 적용

### 2026-09-14: 단기예보 UI

- 홈 예보 영역에서 중기예보를 제외하고 `weatherHourlyItems`만 사용
- 예보 카드를 가로 스크롤로 표시
- 카드에 날짜·시간, 날씨 아이콘, 기온, 강수확률 표시
- 당일 포함 모든 카드를 `MM/DD HH:mm` 형식으로 표시

## 5. 주요 수정 파일

- `mobile/src/app/AppContent.tsx`: 날씨 배경, 탭 상태, 화면 조립
- `mobile/src/app/AppProviders.tsx`: 전역 Provider
- `mobile/src/navigation/routes.ts`: 탭 라우트 메타데이터
- `mobile/src/navigation/AppTabBar.tsx`: 하단 탭 UI
- `mobile/src/components/home/HomePanel.tsx`: 홈 배너·게이지·단기예보
- `mobile/src/components/MetricGauge.tsx`: SVG 원형 게이지
- `mobile/src/components/calendar/CalendarMonthGrid.tsx`: 파란 월 이동 화살표
- `mobile/src/components/calendar/CalendarPanel.tsx`: 2D 일정 추가 버튼
- `mobile/src/components/map/FullMapScreen.tsx`: 2D 현재 위치 버튼
- `mobile/src/components/settings/RegionPanel.tsx`: 설정 화면 UI
- `mobile/src/components/calendar/calendarRiskEvaluator.ts`: 캘린더 위험도 색상
- `mobile/src/components/data/WeatherDataPanel.tsx`: 날씨 차트 색상
- `mobile/src/components/map/StationBottomSheet.tsx`: 지도 상세 수치 색상
- `mobile/src/styles/appStyles.ts`: 화면 레이아웃·간격·배경 스타일
- `mobile/src/theme/bauhaus.ts`, `mobile/src/theme/colors.ts`: 공통 색상·그림자·모서리 토큰
- `mobile/app.json`: 스플래시·아이콘 배경색

## 6. 검증 결과

다음 명령은 통과했다.

```powershell
cd C:\Users\goodd\Documents\GitHub\WTD\mobile
npm run typecheck
git diff --check
npx expo export --platform android --output-dir .expo-export-check
```

임시 export 폴더는 검증 후 삭제한다.

## 7. 다음 채팅에서 먼저 할 일

1. 최상위 `AGENTS.md`, 이 문서의 0장과 마지막 섹션들을 먼저 읽는다.
2. `git status`, `git log -10 --oneline`으로 미커밋 변경과 최근 커밋을 확인한다. 미커밋 변경은 다른 에이전트의 작업일 수 있으니 되돌리지 않는다.
3. 백엔드 테스트(`backend\venv\Scripts\python.exe manage.py test dust app`)와 모바일 검사(`npm run typecheck`, `npm run lint`)로 시작 상태를 확인한다.
4. 0장 순서대로 백엔드와 Metro를 켜고 실제 기기에서 홈·캘린더·지도·설정 화면을 확인한다.
5. UI 수정 전에는 기존 API 데이터·외출지수·알림 로직을 유지하는지 확인한다.
6. 새 작업을 마치면 이 문서 맨 아래에 섹션을 추가하고, Notion 릴리즈 노트 데이터베이스에 페이지를 추가한다. 작업 단위로 커밋한다.

## 8. Notion 작업 기록

[WeatherToDo 개발](https://app.notion.com/p/3f3f7b32dbea812baa3ecc9deb267401) — 릴리즈 노트 데이터베이스(작업 1건 = 페이지 1개), 개발 환경 가이드, 남은 작업 모음.
2026-10-09에 기존 [WeatherToDo 모바일 개발 작업 기록](https://app.notion.com/p/3d7f7b32dbea81d1bc2ecd79b32798ac?pvs=204)을 이곳으로 옮겼다. 기존 페이지는 보관용이며 더 이상 갱신하지 않는다.

새 채팅 첫 메시지에 다음 문장을 붙여 넣으면 된다.

> `C:\Users\goodd\Documents\GitHub\WTD`의 `AGENTS.md`와 `WEATHERTODO_HANDOFF.md`(0장, 마지막 섹션)를 먼저 읽고, `git status`와 `git log`로 최근 변경을 파악한 뒤 이어서 진행해줘. 기존 로직과 AGENTS.md의 결정은 유지하고, 변경 전 관련 파일과 테스트 상태를 먼저 확인해줘. 작업이 끝나면 인수인계 문서와 Notion 릴리즈 노트를 갱신하고 작업 단위로 커밋해줘.


## 9. 2026-09-19 구조 정리

- 실제 저장소는 `Documents/GitHub/WTD`이다. `Documents/AI-Dust_Moblie6`는 앱 소스가 없는 별도 폴더다.
- `mobile/App.tsx` → `src/app/AppProviders.tsx` / `AppContent.tsx` → `components`의 탭별 화면 순서로 조립된다.
- `navigation`: 탭 메타데이터와 하단 UI, `api`: HTTP 호출, `features`: 기능별 데이터 처리와 캐시, `storage`: 로컬 저장, `notifications`: 기기 알림, `theme/styles`: 시각적 스타일, `types/utils`: 공통 타입과 계산을 담당한다.
- `backend/config`는 Django 설정·라우팅, `backend/dust`는 대기·날씨·예측·알림·지도 기능, `dust/management/commands`는 수집·예측·알림 배치, `dust/ml`는 예측 모델 코드를 포함한다. `app/api/analyze`는 별도 Django 앱이다.
- `src/features/calendar/useCalendarLocationForecasts.ts`로 일정 장소별 API 조회와 상태·effect를 분리했다. 장소 중복 제거, 개별 장소 실패 처리, 이전 요청 결과 무시, 저장 상태 로드 이후 조회 조건을 유지한다.
- `src/features/weather/weatherData.ts`로 시간별/측정소 날씨 변환과 공통 예보 조회를 분리했다. 기존 요청 순서·기간과 반환 데이터를 유지한다.
- 기존 미커밋 UI·백엔드 변경은 보존한다. 이번 변경은 API 주소, 외출지수, 위험도 기준, 알림 설정을 변경하지 않는다.

### 후속 정리 후보

1. `AppContent.tsx`의 대시보드·상세 데이터 조회를 순차적으로 훅으로 분리하고, 빠른 지역 전환 시 이전 응답이 새 지역 상태를 덮어쓰지 않는지 검증한다.
2. 지도 검색 3곳의 필터링 중복과 검색/키보드 상태를 별도 기능 모듈로 정리한다.
3. `HomePanel.tsx`의 배너 자동 순환은 실제 기기에서 자동 넘김·수동 스와이프·화면 크기 변경을 함께 검증한 뒤 분리한다.
4. `screens`의 기존 화면과 현재 `components` 화면 간 참조 관계를 확인한 뒤 사용하지 않는 코드를 정리한다. 이름만 보고 삭제하지 않는다.

### 이번 구조 정리 검증

- 변경 전/후 TypeScript 검사 통과.
- git diff --check 통과.
- Android Expo export 성공 (974 modules).
- 실제 기기 UI·GPS·푸시 알림 동작과 백엔드 실행은 이번 작업에서 검증하지 않았다.
- Notion 작업 기록은 이번 작업에서 갱신하지 않았다.

## 10. 2026-09-19 UI 색상·테두리 정리

- 홈·상세 데이터·브리핑·캘린더·지도 화면에 남아 있던 2px 검정 테두리를 1px 회청색 구분선으로 통일했다.
- 장식용 형광 초록·노랑을 파란 포인트와 연한 파란 배경으로 정리했다.
- GPS·오류 UI는 채도가 낮은 붉은 배경과 얇은 경계선을 사용한다.
- 미세먼지 등급, 외출 위험도, 경고처럼 상태를 전달하는 색상은 유지했다.
- `bauhausColors`에 `border`, `surface`, `blueSoft`, `redSoft` 토큰을 추가하고 공통 테마 경계색을 연결했다.
- TypeScript 검사, `git diff --check`, Android Expo export(974 modules)가 통과했다.
- 실제 기기에서는 홈·상세 데이터·브리핑·캘린더·지도·설정 화면의 대비와 눌림 상태를 확인한다.

## 11. 2026-09-19 내부 동작 2D PNG 아이콘

- 하단 홈·캘린더·설정 탭은 작은 크기에서 가장 잘 읽히는 기본 Ionicons로 복원했다.
- 앱 내부의 지역 검색, 현재 위치, 일정 추가, 지도, 알림, 즐겨찾기에 동작별 2D PNG 그래픽을 적용했다.
- 공통 렌더러 `mobile/src/components/shared/AppActionIcon.tsx`에서 아이콘 자산과 크기를 관리한다.
- ImageGen 원본을 256×256 투명 PNG로 최적화해 `mobile/assets/icons/action-*.png`에 저장했다.
- 방향 화살표, 닫기, 삭제, 저장 확인, 날씨 상태처럼 작은 크기에서 단순 도형이 더 명확한 표시는 Ionicons를 유지한다.
- TypeScript 검사, `git diff --check`, Android Expo export(981 modules)가 통과했다.

## 12. 2026-09-19 설명 문구 정리와 어제 대비

- 제목 아래 소개 문장, 카드의 반복 안내, 빈 상태의 긴 사용법처럼 행동에 필요하지 않은 설명을 제거했다.
- 오류·로딩·권한·데이터 없음·일정 위험도처럼 사용자가 판단하거나 다음 행동을 정하는 데 필요한 문구는 유지했다.
- 홈 게이지의 일반 설명은 `어제보다 3° 높아요`, `어제와 같아요`, `어제 비교 데이터 없음` 형식의 비교 문구로 교체했다.
- 기온·습도·풍속·강수량은 어제 같은 시간대의 저장 기상 관측값과 비교한다.
- PM10·PM2.5·O3는 어제 일평균 관측값과 비교하며, 외출지수는 이 어제 값들로 다시 계산해 비교한다.
- TypeScript 검사, `git diff --check`, Android Expo export(981 modules)가 통과했다.

## 13. 2026-09-20 화면 전환 애니메이션

- 공통 `ScreenTransition`을 추가해 홈·설정·캘린더·지도·상세 화면 내용이 나타날 때 페이드와 아래쪽 10px 이동 복귀 효과를 적용했다.
- 페이드는 180ms, 위치 이동은 220ms이며 `useNativeDriver`를 사용한다.
- 하단 탭 바와 날씨 배경은 고정해 화면 이동 때 흔들리지 않도록 했다.
- 상세 데이터의 미세먼지·날씨 모드 전환에도 같은 효과를 적용했다.
- 전환값은 `useLayoutEffect`에서 초기화해 모드 전환 때 한 프레임 깜빡임을 줄였다.
- TypeScript 검사, `git diff --check`, Android Expo export(981 modules)가 통과했다.



## 14. 2026-09-20 모던 UI 정리

- 홈·설정 카드를 흰색으로 통일하고 카드 간격 및 내부 여백을 늘렸다.
- 제목·수치·보조 문구의 글자 굵기를 800/600/500 중심으로 나눴다.
- 공통 그림자와 경계색을 연하게 조정하고 입력·빈 상태의 배경색을 통일했다.
- 캘린더 날짜 셀의 세로 경계선을 제거하고 월 제목을 확대했다.
- 하단 기본 아이콘을 21로 키우고 활성 탭은 고정 파란색으로 표시한다.
- 홈 게이지의 활성 페이지 표시를 긴 점으로 바꿨다. 기존 게이지 폭과 스와이프 계산은 유지한다.
- 수정 파일: mobile/src/styles/appStyles.ts, mobile/src/theme/bauhaus.ts, mobile/src/navigation/AppTabBar.tsx, mobile/src/components/home/HomePanel.tsx.
- TypeScript 검사, git diff --check, Android Expo export(981 modules) 통과.
- 실제 기기 시각 검증은 미실시. 홈·캘린더·설정의 여백과 글자 확대 상태를 확인해야 한다.
- 수정 직전 파일 백업: C:/Users/goodd/Documents/AI-Dust_Moblie6/ui-before-20260920.


## 15. 2026-09-20 박스 중첩 줄이기

- 사용자 디자인 선호: 박스 안에 박스를 반복하는 구성을 피한다.
- 홈의 주요 날씨 패널은 유지하고 시간별 예보의 개별 배경 박스를 제거했다.
- 활동 가이드와 지도는 외곽 카드·그림자를 제거하고 여백으로 구분한다. 지도 자체의 둥근 마스킹은 유지한다.
- 일정 추가와 현재 위치는 배경 없는 아이콘·텍스트 동작으로 변경했다.
- 설정 섹션과 즐겨찾기는 카드 대신 구분선·리스트로 표시한다. 선택된 지역의 기존 점·텍스트 표시는 유지한다.
- 실제 기기 시각 검증은 미실시.

## 16. 스크린샷 기반 홈 UI 정리

- 풍경 위에 본문이 겹치던 문제를 개선: 지역 헤더에는 배경을 남기고, 게이지·예보·일정·지도를 하나의 흰 콘텐츠 면으로 연결.
- 내부 카드 중첩 없이 여백과 구분선으로 구분. 하단 활성 탭의 큰 배경 박스 제거.
- 일정 섹션의 중복 버튼 제거, 동작 문구 단축, 제목 크기 통일.
- 게이지 페이지 폭을 실제 onLayout 너비로 측정하고 페이지 점을 고정 높이 뷰포트 밖으로 이동. 예보 날짜·시간은 두 줄로 표시.
- 실기기 시각 검증은 별도 필요.

## 17. 2026-09-20 모던 UI 실험 원복

- 사용자 요청으로 섹션 평면화, 흰 콘텐츠 면, 글꼴 굵기 재조정, 하단 탭 단순화 등 모던 UI 실험을 시작 전 상태로 되돌렸다.
- 2D 내부 아이콘, 불필요한 설명 제거, 어제 대비 문구, 화면 전환 애니메이션은 유지한다.
- 복원 기준: C:/Users/goodd/Documents/AI-Dust_Moblie6/ui-before-20260920.

## 18. 2026-09-20 날씨 앱 레퍼런스 기반 홈 개선

- 홈 대표 게이지 자동 순환을 중단해 외출지수가 처음 상태로 유지되며, 사용자가 직접 넘길 때만 지표가 바뀐다.
- 시간별 예보의 첫 항목은 `지금`, 같은 날짜는 시간만, 날짜가 바뀌는 지점은 날짜와 시간을 두 줄로 표시한다.
- 일정이 없을 때 안내와 일정 추가를 한 행으로 합치고 중복 캘린더 동작을 제거했다.
- 일정·지도는 개별 외곽 카드 대신 하나의 연한 콘텐츠 면과 구분선으로 묶었다. 지도 미리보기 높이는 148로 축소했다.
- 하단 활성 탭의 큰 배경을 제거하고 상단의 짧은 파란 표시선으로 교체했다.

## 19. 2026-09-20 날씨 앱 레퍼런스 UI 변경 원복

- 일정·지도 통합 면과 하단 탭 표시선이 기존 UI와 어울리지 않고 캘린더 동작의 가시성을 낮춰 사용자 요청으로 원복했다.
- 캘린더 헤더 아이콘과 `일정 추가하러 가기` 버튼, 기존 활동 가이드 카드, 기존 지도 미리보기, 기존 하단 탭 스타일을 복원했다.
- 복원 기준: C:/Users/goodd/Documents/AI-Dust_Moblie6/ui-before-20260920.

## 20. 2026-09-20 기능 유지형 홈 스타일 정리

- HomePanel, AppContent, AppTabBar의 동작·이벤트 코드는 변경하지 않고 appStyles.ts의 홈 관련 스타일만 조정했다.
- 게이지, 캘린더 아이콘, 일정 추가, 지도 이동, 하단 탭 동작을 모두 유지한다.
- 세 주요 영역의 표면·모서리·경계선·그림자를 통일하고 내부 예보·빈 일정 박스의 배경과 테두리를 제거했다.
- 지도 높이와 하단 탭 선택 배경을 줄여 시각적 무게를 낮췄다.

## 21. 2026-09-20 단기 예보 제목 복원

- 시간별 예보 카드와 데이터 로직은 유지한 상태에서 홈 날씨 카드에 `단기 예보` 제목을 다시 표시했다.
- 날짜·현재 시간 헤더와 로딩 안내 문구는 복원하지 않았다.
- 캘린더·일정·지도·게이지 동작에는 변경이 없다.

## 22. 2026-09-21 홈 연파란색·활동 PNG 아이콘

- 홈 게이지의 `좋음`, `주의` 등 상태 글자를 27px로 확대했다.
- 홈 지역명은 즐겨찾기가 있으면 기존 즐겨찾기 선택을 열고, 즐겨찾기가 없으면 지역 검색을 연다.
- 홈 날씨·활동 가이드·지도 카드에 매우 연한 파란 표면색과 파란 경계선을 적용했다.
- 오늘 활동 가이드의 시간 배지와 아이콘 배경을 파란 계열로 통일했다.
- 실내·실외·이동 활동용 2D PNG 아이콘을 생성해 `mobile/assets/icons/activity-*.png`에 추가하고 홈 일정에 연결했다.

## 23. 2026-09-21 게이지 비교 문구·활동 아이콘 정리

- `어제보다 OO 높아요/낮아요` 비교 문구를 게이지 오른쪽 정보 영역의 아래쪽에 고정해 제목·상태와 시각적으로 분리했다.
- 실내·실외·이동 활동 PNG 3종을 기존 일정·지도 아이콘과 어울리는 둥근 파란색 2D 스타일로 다시 제작했다.
- 기존 활동 분류, 캘린더 이동, 지역 선택 등 동작 로직은 변경하지 않았다.

## 24. 2026-09-21 예보 제목·게이지 비교 위치·아이콘 현대화

- 시간별 단기 예보 목록은 유지하고 `단기 예보` 제목 텍스트만 제거했다.
- `어제보다 OO 높아요/낮아요` 문구를 원형 게이지가 있는 왼쪽 칸 하단으로 이동했다.
- 앱 내부 PNG 아이콘 9종을 파랑·남색 중심의 현대적인 듀오톤 스타일로 통일했다.
- 활동 아이콘은 어린이형 캐릭터 대신 성인 보행자, 현대식 건물, 시내버스 이미지로 교체했다.
- 하단 내비게이션 아이콘과 기존 화면 이동·일정·지역 기능은 유지했다.

## 25. 2026-09-21 앱 내부 PNG 아이콘 확대

- `AppActionIcon`이 표시하는 앱 내부 PNG 아이콘 9종의 시각 크기를 약 18% 확대했다.
- 버튼과 행의 배치는 유지하고 이미지에만 확대 변환을 적용해 기존 터치 영역과 정렬이 달라지지 않도록 했다.
- 하단 내비게이션 기본 아이콘에는 적용하지 않았다.

## 26. 2026-09-21 시간별 예보 목록 표시 복구

- 시간별 날씨 데이터가 로딩 중이거나 일시적으로 비어 있어도 예보 영역이 사라지지 않도록 최소 높이를 지정했다.
- 데이터가 없을 때는 5개의 빈 예보 항목을 표시하고, 데이터가 들어오면 실제 시간·날씨·기온·강수 정보로 자동 교체한다.
- `단기 예보` 제목은 제거된 상태를 유지한다.

## 27. 2026-09-21 어제 비교 문구·상세 데이터 진입 복구

- `어제보다 OO 높아요/낮아요` 문구를 `좋음·주의` 상태가 있는 오른쪽 칸의 하단에 다시 배치했다.
- 상태 글자와 비교 문구 사이를 넓게 띄워 비교 정보가 카드 아래쪽에 보이도록 했다.
- 홈 지도 카드 아래에 `상세 데이터 보기` 버튼을 복원했다.
- 버튼은 현재 선택 지역의 미세먼지 상세 데이터 화면을 열며 기존 기간·차트 초기화 동작을 사용한다.

## 28. 2026-09-22 데이터 로딩·예외 처리 구조 정리

- 대시보드 캐시는 미세먼지 현재값뿐 아니라 실제 시간별 날씨 예보가 있을 때만 완성된 캐시로 간주한다. 예보가 비어 있으면 재진입 시 다시 조회한다.
- 미세먼지 중간 저장과 날씨 완료 후 저장이 서로 덮어쓰던 흐름을 정리해 조회 결과별로 한 번만 캐시를 저장한다.
- 모바일 API의 선택적 조회는 404만 데이터 없음으로 처리하고, 서버 오류는 예외로 전달한다. 날씨·중기 예보 실패는 로그로 남기며, 중기 예보 실패가 시간별 예보를 막지 않게 했다.
- `AppContent.tsx`의 대시보드 데이터 요청과 날씨 측정소 선택을 `features/dashboard/dashboardService.ts`로 추출했다.
- 백엔드 `/dust/current/`의 응답 선택을 `dust/current_dust_service.py`로 옮기고 실행 불가능한 과거 fallback 분기를 제거했다. 서버 내부 오류 메시지는 응답에 노출하지 않고 로그에 남긴다.
- 모바일 캐시 회귀 테스트 2개와 백엔드 서비스 단위 테스트 4개 통과(0 측정값 포함). Django 런타임이 설치되지 않은 현재 환경에서는 Django 엔드포인트 테스트 실행이 필요하다.

## 29. 2026-10-04 로컬 데이터 수집 안정화

- `dust/data_freshness.py`와 `check_data_freshness` management command를 추가해 측정소, 실시간 미세먼지, 시간별 날씨의 누락·지연 상태를 검사한다.
- `collect_hourly.bat`는 각 단계의 종료 코드를 확인하며, 중간 실패 시 성공으로 기록하지 않고 실패 단계와 종료 코드를 로그에 남긴다.
- `start_local_backend.bat`는 서버 시작 전에 데이터 최신성을 검사하고, 오래됐으면 `collect_hourly.bat` 실행을 안내한다.
- `setup_local_tasks.bat`와 `remove_local_tasks.bat`를 추가했다. 현재 Windows PC에는 `WeatherToDo Hourly Collection`과 `WeatherToDo Morning Notifications` 작업이 등록되어 있다.
- 수집 작업은 매시간 5분, 아침 알림은 매일 07:00에 실행된다. 절전 복귀 실행, 배터리 실행, 중복 실행 방지 설정을 적용했다.
- 전체 시·도 이름(`부산광역시`)과 AirKorea DB 이름(`부산`)을 정규화하고 `동대신동3가`가 `대신동` 측정소를 찾도록 보완했다.
- 2026-10-04 수동 실행 결과: 실시간 미세먼지 362행 신규 저장, 시간별 날씨 11,232행 갱신, 예측 12행, 중기예보 80행 갱신. 최신성 검사 통과.
- 부산광역시 동대신동3가 기준 현재 미세먼지, 현재 날씨, 시간별 예보 46개, 전국 측정소 681개, 지도 HTML 응답을 확인했다.
- Backend 단위 테스트 12건, Mobile TypeScript 검사, Dashboard 캐시 테스트 2건, Android Expo export가 통과했다.
- 로컬 Django 서버는 `127.0.0.1:8001`에서 실행한다. PC 재시작 후에는 `backend/start_local_backend.bat`를 다시 실행해야 한다.

## 30. 2026-10-04 일정 기반 의상 추천 MVP

- `POST /outfit/recommend/`가 일정 시작·종료 시각과 좌표를 받아 저장된 시간별 날씨·대기질을 직접 집계한다. 제목은 상황 분류에만 사용하며 저장하거나 LLM에 보내지 않는다.
- 기상청 윈드칠 체감온도, B1~B9 옷차림 band, 체감 성향, 일교차 레이어링, 우산·마스크·바람막이·목도리/장갑 규칙을 각각 분리했다. 누락된 수치는 `data_gaps`에 표시한다.
- `mode=rule`은 규칙 결과를 즉시 반환하고, `mode=full`은 같은 확정 결과를 유지한 채 LLM이 요약과 코디 문구만 다듬는다. 실패·타임아웃·형식 오류·Key 미설정은 `source=rule`로 처리한다.
- LLM 연동은 `LLMClient` 인터페이스와 환경변수 `LLM_ENABLED`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY`, `LLM_TIMEOUT_SEC`로 분리했다. 현재 Provider와 Key가 정해지지 않아 규칙 모드로 동작한다.
- LLM 출력은 글자 수, 필수 준비물 이유, 입력에 없던 숫자 생성 여부를 검증한다. 한 번 재시도하며 같은 조건의 full 결과는 DB에 3시간 캐시한다.
- `OutfitRecommendationCache` 모델과 `0012` migration을 추가해 로컬 DB에 적용했다. 캐시에는 제목·좌표·사용자 식별 정보를 저장하지 않는다.
- 홈 `오늘 활동 가이드`에서 일정을 펼치거나 캘린더 Bottom Sheet에서 일정을 선택하면 공통 `OutfitCard`가 표시된다. 설정에서 추천 on/off와 `추위 많이 탐 / 보통 / 더위 많이 탐`을 저장한다.
- 앱은 rule 응답을 먼저 보여주고 full 응답이 도착하면 문구만 교체한다. 화면 이탈 시 요청을 취소하고 `valid_until`까지 메모리 캐시를 사용한다.
- Reanimated와 Haptics를 추가했다. 카드 Fade-in, Skeleton pulse, 기온 범위 bar, Chip 순차 등장, 우산 흔들림, 마스크 pulse, 코디 항목 slide, 문구 cross-fade/typewriter와 Reduce Motion 대응을 적용했다.
- Backend 관련 회귀 테스트 26건, Mobile TypeScript 검사가 통과했다. 실제 DB 기준 rule API는 HTTP 200, B3, 우산 추천으로 응답했다.
- `TODO(확인 필요)`: 최종 LLM Provider/모델/비용 한도, 여름철 체감온도 공식, 일일 상한 초과 응답 정책, `auto` 활동 판정기, 최종 의상/Lottie 디자인 에셋.

## 31. 2026-10-08 ~ 10-09 코드 검수·보안·경량화 (Claude)

다른 에이전트(Claude)가 작업한 내용이다. 지켜야 할 결정은 최상위 `AGENTS.md`에 정리했다.

- 커밋: `b9541e2`(보안) → `684e2ad`(개인정보) → `9c3fedd`(지역 전환·반복 일정) → `a92c0a6`(에어코리아 예보·선택 기능) → 그다음 커밋(ESLint·문서). `git show <해시>`로 확인한다.
- 이 커밋들에는 Claude 수정분만 담았다. 작업 폴더에 남아 있던 Codex의 미커밋 변경은 그대로 두었다.
- 예외: Codex의 미커밋 코드 위에서 고친 부분은 커밋하지 않고 작업 폴더에 남겨 두었다. Codex 작업을 커밋할 때 함께 들어간다.
  - `dust/services/outfit/daily_service.py`(미추적 파일): 하루 단위 캐시에서 `schedule_tips` 제외, 키는 occasion 사용(v3)
  - `mobile/src/features/outfit/outfitCache.ts`의 `outfitCacheKeyForEvents`에 `event.title` 추가, `outfitCache.test.mjs`
  - `dust/test_weather_notifications.py`(미추적 파일): 일정 문구 테스트를 시간만 쓰는 동작에 맞춤
  - `dust/tests.py`의 `DailyOutfitCacheTests`

- 보안
  - 인증 없이 전체 사용자 질환·지역을 조회·수정·삭제할 수 있던 `/app/app/Info/`(`InfoViewSet`)를 제거했다.
  - `/dust/mobile-map/`의 `view`, `app_test_token` 반사형 XSS를 `_script_json()`으로 막았다.
  - 비밀번호가 빈 Google 계정이 `pw=""`로 로그인되던 문제를 `Users.matches_client_password()`로 막았다(`/api/login/`, `/app/login/`).
  - 옷차림 LLM 호출 상한을 `X-Device-Id` 대신 IP로 계산한다. 프록시 뒤에서는 `TRUSTED_PROXY_COUNT`를 설정한다.
- 개인정보
  - 일정 제목을 서버에 저장하지 않는다. 아침 알림용 일정은 `{date, time}`만 보내고 저장하며, 문구도 "09:00 일정이 있어요"처럼 시간만 쓴다. 기존 저장분은 `0013_strip_calendar_event_titles` 마이그레이션으로 지운다(로컬 DB에 아직 미적용).
  - 하루 단위 옷차림 캐시에서 `schedule_tips`(제목 포함)를 빼고, 캐시 키는 제목 대신 occasion을 쓴다(v3).
  - Expo가 `DeviceNotRegistered`를 반환하면 기기를 비활성화하고 일정 요약을 지운다.
- 버그
  - 지역을 빠르게 바꿀 때 이전 지역 응답이 홈 화면을 덮어쓰던 문제(`loadDashboard`, `loadWeather`).
  - 매주 반복 일정이 종료일과 관계없이 약 160일 뒤 끊기던 문제(`calendarRepeat.ts`).
  - 챗봇 경로의 "예측 불가" 결과가 공유 캐시에 1시간 남던 문제. `predict_dust` 중복 로직도 하나로 합쳤다.
  - 앱 옷차림 메모리 캐시 키에 제목을 넣어 제목 변경 시 다시 요청한다.
- 서버 경량화
  - `/dust/predict/`는 Prophet 학습 대신 에어코리아 내일·모레 예보 등급(`dust/airkorea_forecast.py`)을 대표 PM10 값(좋음 15/보통 55/나쁨 115/매우나쁨 180)으로 바꿔 반환한다. 원본 등급은 `grades`. 앱 수정 없음.
  - Prophet은 지연 import로 바꾸고 `requirements-optional.txt`로 옮겼다. 서버 프로세스 메모리: 기동 129MB → 103MB.
  - 챗봇·`/analyze/`·기상 상세는 `ENABLE_OPTIONAL_FEATURES`(기본값 `DEBUG`)일 때만 라우팅한다. 코드는 삭제하지 않았다.
- 개발 환경
  - 모바일 ESLint(Expo 설정) 추가: `npm run lint`. 현재 오류 0, 경고 57.
  - 실패하던 `CurrentDustEndpointTests` 2건을 고쳤다(로컬 `APP_TEST_TOKEN` 영향, 누락된 mock).
  - `test_weather_notifications.py`의 일정 문구 테스트를 시간만 쓰는 동작에 맞게 바꿨다.
- 검증: 백엔드 `dust`+`app` 테스트 74건 통과, 모바일 `tsc`·`node --test` 통과.
- 남은 일: 로컬 DB `python manage.py migrate dust`, 홈 화면의 대체 데이터 안내(`currentNotice`)·로딩 표시 연결, 일정 알림 재예약 과다, `calendarRiskEvaluator` 테스트, 커밋 정리. 상세는 Notion "남은 작업 모음".

## 32. 2026-10-09 백엔드 실행 환경 정리 (Claude)

- 백엔드 가상환경을 저장소 안 `backend\venv`(Python 3.11.9)로 옮겼다. 예전 `Documents\AI-Dust_Moblie6\backend-venv`는 Codex 내장 Python 기반이라 삭제했고, 배치 파일의 해당 경로도 지웠다. `AI-Dust_Moblie6`의 다른 폴더(DB 백업 등)는 그대로 있다.
- `requirements.txt`에 Pillow를 직접 추가했다(프로필 `ImageField`에 필요, 예전에는 prophet→matplotlib로 간접 설치됨).
- Django를 4.2.12(PyPI에서 철회된 버전) → 4.2.30으로 올렸다. 시스템 점검, 마이그레이션, 백엔드 테스트 74건, 로컬 DB 기준 `/dust/current`·`predict`·`hourly`·`korea-stations`·`mobile-map` 응답을 확인했다.
- 참고: Django 4.2 LTS의 지원은 2026-04에 끝났다. 4.2.30이 4.2의 마지막 패치이므로 이후 보안 수정을 받으려면 5.2 LTS(지원 2028-04까지)로 올려야 한다. 별도 작업으로 남긴다.
- 실행 가이드를 0장(빠른 실행 순서), 2장(`.env`를 로컬 주소로), 3장, 7장, 8장(Codex 시작 문구)에 반영했다.
- 커밋: `927cbde`(Pillow), `a1a5574`(venv 문서), `c1cee65`(Django 4.2.30), `ecead6f`(배치 파일 정리), `e52647d`(실행 가이드 갱신).

## 33. 2026-10-09 의상 추천·일정 위험도 작업 마무리 (Codex)

- 기존 미커밋 작업 묶음을 유지한 채 의상 추천, 일정 알림, 홈·지도 UI, 아이콘·에셋 변경을 작업 단위로 정리했다.
- `calendarRiskEvaluator`의 일정 시간대 최악 기상 선택과 강수 시간 요약을 회귀 테스트로 고정했다. 테스트는 기존 Node 직접 실행 방식에 맞춰 확장자 보정 훅을 사용한다.
- 개인정보·선택 기능·AirKorea 예보·프록시 신뢰 개수·인라인 스크립트 JSON 직렬화 등 `AGENTS.md`의 결정을 변경하지 않았다.
- 검증: 백엔드 `dust`+`app` 74건 통과(기존 `backend\build\static` 디렉터리 경고 1건), 모바일 `npm run typecheck` 통과, `npm run lint` 오류 0·경고 57건, `node --test src/**/*.test.mjs` 7건 통과.
- 커밋: `feat: finish outfit and schedule weather work`.

## 34. 2026-10-09 ~ 10-10 실기기 테스트와 홈 화면 개선 (Claude)

USB 실기기(로컬 백엔드 + `adb reverse`)로 앱을 돌려 보며 사용자 피드백을 바로 반영했다.

### 실기기 테스트에서 확인한 것
- "다른 지역 데이터가 안 뜸"의 원인은 앱 코드가 아니라 `adb reverse` 연결이 끊긴 것이었다. 서버는 전 지역에 정상 응답했다. 처음 지역은 앱에 저장된 캐시로 떠서 정상처럼 보였다. USB 재연결·PC 재시작 후에는 `adb reverse tcp:8001 tcp:8001`, `adb reverse tcp:8081 tcp:8081`을 다시 실행한다.
- `/dust/*`는 `APP_TEST_TOKEN`이 있으면 토큰 없는 요청에 403(`Forbidden`)을 준다. 브라우저 확인은 `?app_test_token=` 쿼리를 붙인다.
- Metro는 반드시 `mobile` 폴더에서 실행한다. 저장소 최상위에서 `npx expo`를 실행하면 최신 Expo를 내려받으려다 `package.json`이 없다는 오류가 난다.

### 데이터 신뢰성
- 홈 로딩이 캐시 없이 실패하면 헤더에 "서버에 연결할 수 없어요"(응답 없음) 또는 "데이터를 불러오지 못했어요"(HTTP 오류)와 "다시 시도"를 보여 준다. 같은 상태에서 배너의 빈 지표는 "연결 안 됨", 시간별 예보는 연결 실패 문구를 보여 준다(`HomePanel`의 `loadFailed` prop).
- 서버가 하루 평균으로 대체한 값(`source: stored_daily_latest`)은 "M월 D일 하루 평균 · 실시간 측정값 없음"으로 표시하고 주황색으로 강조한다. 예전에는 "00:00 기준"이 붙어 실시간 값처럼 보였다(`formatCurrentBasis`, 테스트 `mobile/src/utils/currentBasis.test.mjs`).
- 헤더 날씨 칩은 기온을 알 때만 보인다("--° 날씨" 제거).

### 기능
- 오늘 남은 일정이 없어도 옷차림을 보여 준다. 앱이 "지금 정각부터 22:00(21시 이후는 23:59)까지 외출" 가상 일정을 만들어 기존 추천 API에 보낸다. 서버 변경은 없고, 서버로는 고정 단어 "외출"만 간다.

### 디자인
- 즐겨찾기 선택창: 박스 안의 박스 구조를 없애고 구분선만 있는 목록으로 바꿨다. 선택된 지역은 강조색 글자와 체크로 표시한다. 사용자 요청: 박스 투 박스 디자인 쓰지 않기.
- 배너 모션: 맑음(해 빛 펄스, 햇살 회전, 반짝임, 구름), 흐림(구름 흐름)을 추가했다. 날씨가 바뀔 때 서서히 나타나고, OS의 애니메이션 줄이기가 켜져 있으면 끈다. 배경 이미지를 네 변에 고정해 배너 아래 단색 띠를 없앴다. 새 의존성 없이 `react-native-svg`를 썼다.
- 오늘 활동 가이드는 일정이 없으면 한 줄과 "＋ 일정 추가" 버튼으로 줄인다.
- 홈 버튼·아이콘의 배경 박스와 테두리를 없앴다(누르는 영역 크기는 유지).
- 홈 글자 굵기를 3단계로 정리했다: 제목·핵심 숫자 900, 항목 이름·버튼 700, 설명·보조 600.
- 배너 게이지에는 숫자와 단위만 남기고 지표 이름은 오른쪽 제목에서 한 번만 보여 준다(기온은 "기온 · 맑음"). 섹션 제목 크기를 19로 통일했다.
- 사용자가 시도해 보고 되돌린 것: 시간별 예보를 배너 안으로 합치기, 배너 그라데이션 오버레이(사진별 적용은 보류), 넘김 점을 "3 / 8" 숫자로 바꾸기.

### 검증
- 모바일 `npm run typecheck` 통과, `npm run lint` 오류 0·경고 57건(기존과 같음), `node --test` 9건 통과.
- 서버에 "외출" 가상 일정 옷차림 요청을 보내 200 응답을 확인했다. 화면 변경은 사용자가 실기기에서 보며 확인했다.

### 남은 디자인 피드백
- 회색 글자색 정리(스타일 전체에 서로 다른 글자색 116가지), 모서리 둥글기 통일(8·9·10·12·13·14·16·999), 글자 기호(☆, ⌖)를 Ionicons로 통일.

- 커밋: `2602a16`(하루 평균 표시), `f8c0922`(홈 화면 개선).

## 35. 2026-10-10 PNG 아이콘 크기와 중심 보정 (Codex)

- AppActionIcon의 PNG 12종에서 알파 32 초과 그림 경계를 측정해 투명 여백을 보정했다. 긴 변을 지정 크기의 94%로 맞추고 경계 중심을 중앙에 둔다. PNG 교체 시 artworkBounds도 다시 측정한다.
- CalendarPanel의 일정 추가 아이콘 marginLeft 4를 제거했다. 기존 PNG, 터치 영역, 다른 미커밋 UI 변경은 유지했다.
- 검증: typecheck 통과, lint 오류 0/기존 경고 57건, Node 테스트 9건 통과. 12종 x 4크기 계산 검증 통과. 실기기 시각 확인은 남아 있다.
- 후속 순서: 운동/양산 이미지 수정, 인물 규격 통일, 배너 장식 정리.
- Notion: https://app.notion.com/p/3f4f7b32dbea810eb784d3e469b80f25
- 커밋/배포하지 않음.

## 36. 2026-10-10 남녀 운동복과 양산 PNG 개선 (Codex)

- 내장 imagegen으로 기존 PNG를 참조해 4종 편집. 파란색 2D 성인 인물 그림체, 방향과 기존 여름 복장을 유지했다.
- 운동복은 남성 기능성 반팔+운동 반바지, 여성 기능성 반팔+레깅스로 변경. 양산은 연파랑 불투명 겉감+남색 안감으로 변경했다.
- mobile/assets/outfit의 outfit-running.png, outfit-female-running.png, outfit-heatwave.png, outfit-female-heatwave.png 교체. 1254x1254 RGBA. OutfitVisual 참조 및 선택 로직은 변경하지 않았다.
- 검증: PNG 무결성/알파/복사 해시 일치, typecheck 통과, Node 9건 통과, ESLint 직접 실행 오류 0/기존 경고 57건. .env 읽기/출력 없음. 커밋 및 배포 없음.
- 실기기 홈/캘린더 크기 확인은 남아 있다. 다음 단계는 인물 규격 통일.
- 제작 프롬프트 기준: 기존 인물/파란 2D 그림체 유지, 명확한 기능성 운동복, 불투명 UV 양산, 실제 투명 배경, 글자/로고/바닥 제외.
- Notion: https://app.notion.com/p/3f4f7b32dbea81c182eddb14bedb03e0

## 37. 2026-10-10 잠깐 오는 비(소나기)와 옷차림 분리 (Claude)

Codex가 시작하려던 작업을 이어서 했다(백엔드 옷차림 파일은 손대지 않은 상태였다).

- 문제: 일정 시간대 중 한 시간만 비가 와도(`has_rain = any(...)`, `rain_prob_max = max(...)`) 하루 전체가 방수 재킷·우산 필수로 바뀌었다. 앱의 "일정 없는 날 = 지금~22시 외출" 창에서 특히 심했다.
- 원칙: 겉옷은 오래 가는 날씨로 정하고, 우산은 확실한 비면 짧아도 필수로 둔다. 비가 오는 시간대를 알린다.
- `aggregation.py`: 일정 시간대 안의 비 시간 수(`rain_hours`/`total_hours`)와 `rain_start`·`rain_end`를 낸다. 비 시간이 창의 절반 이상, 시간당 3mm 이상, 또는 일정이 3시간 이하이면 `rain`, 그 밖의 비는 새 상태 `showers`. 기준값은 `constants.py`의 `SUSTAINED_RAIN_RATIO`, `HEAVY_RAIN_MM`, `SHORT_SCHEDULE_HOURS`.
- `rule_engine.py`: 집계에서 정한 상태를 그대로 쓴다(없으면 예전 계산). `showers`는 겉옷을 바꾸지 않고, 우산은 required(라벨 "접이식 우산"), 요약과 우산 이유에 시간대를 넣는다(예: "15~17시 소나기 예보, 우산 챙기세요.").
- `daily_service.py`: 여러 일정을 합칠 때도 전체 비 시간 비율로 다시 판단해, 짧은 일정 하나의 비로 하루 복장이 바뀌지 않게 했다. 우선순위 snow > rain > strong_wind > showers > normal. 하루 캐시 키 v3 → v4.
- 응답의 `weather_snapshot`에 `rain_hours`, `total_hours`, `rain_start`, `rain_end`가 추가됐다. 앱에서 일정 시간과 비 시간대가 겹치는지 표시할 때 쓸 수 있다(다음 작업 후보: 활동 가이드 일정별 비 표시, 시간별 예보의 비 시간 강조).
- 검증: 새 테스트 6건(10시간 중 2시간 비 → showers·평소 겉옷·우산 필수·시간대 표시 / 6시간 비 → rain / 2시간 일정 중 1시간 비 → rain / 1시간 5mm → rain / 확률만 70% 1시간 → showers / 하루 합산), 백엔드 `dust`+`app` 80건 통과. 로컬 실제 데이터(대구, 12~17시 최대 4mm)에서 rain과 "12~17시에 비 예보가 있어요" 확인.
- 커밋: `897d3b8`. 이 섹션은 Codex의 미커밋 섹션 35·36과 같은 파일이라 함께 미커밋 상태로 두었다.
- 이어서 앱 옷차림 카드 맨 위에 날씨 주의 줄을 추가했다(`mobile/src/features/outfit/outfitWeatherAlert.ts`, `OutfitCard`의 `WeatherAlertRow`). 비·소나기·눈·강풍일 때 "소나기 주의 · 15~17시 잠깐 비 예보가 있어요. 우산을 챙기세요."처럼 시간대를 보여 준다. 박스 없이 왼쪽 강조선 한 줄. Node 테스트 3건 추가(모바일 12건 통과). 커밋 `e8b6a93`.
- 옷차림 주의 줄은 사용자 요청으로 홈 남녀 그림 아래로 옮겼다(`f15eba7`).
- 오늘 활동 가이드: 일정마다 그 시간대 예보를 색 글자 한 줄로 보여 준다("15:00~17:00 비 예보 · 강수 70%", "13:00~14:00 강풍 · 최대 9m/s", "맑음 · 18°"). 일정 아이콘은 활동 종류(실내·야외·이동) 그림 대신 날씨 아이콘(맑음·흐림·비·눈·강풍, 예보 없으면 시계)으로 바꿨다. 로직은 `homeActivityGuidePresenter.ts`의 `activityWeatherKind`·`activityForecastLabel`, Node 테스트 3건(모바일 15건 통과). 커밋 `bc8ea02`. 날씨 PNG는 비·눈·바람만 있어(지도용) 다섯 종류 모두 Ionicons를 썼다.
- 오늘 옷차림 카드 아래 일정별 팁 목록을 뺐다(`9907513`). 이어서 홈 오늘 옷차림을 일정과 관계없이 "지금~22시(21시 이후 자정)" 하루 날씨로만 추천하게 바꿨다(`dc9fef9`). 활동 가이드 줄을 누르면 옷차림 기준 일정을 고르는 대신 캘린더로 이동한다. 캘린더의 일정별 옷차림은 그대로다. 홈에서는 하루 단위 API(`/outfit/daily/`)를 더 이상 부르지 않는다.
- 활동 가이드에서 18시 비 예보 일정이 한동안 "맑음"으로 보이다가 늦게 바뀌던 문제를 고쳤다(`eb9f280`). 원인: ±1시간 안에 예보가 없으면 같은 날 가장 가까운 값을 거리 제한 없이 썼고(예: 14시 관측 "맑음"), 그다음엔 현재 날씨로 대신했다. 이제 가장 가까운 값은 3시간 이내만, 현재 날씨 대체는 진행 중이거나 3시간 안에 시작하는 일정만 쓴다. 예보가 없으면 "이 시간대 날씨 예보를 아직 받지 못했어요"로 표시한다. 장소별 예보는 받는 대로 바로 반영하고 10분마다 다시 받는다. 회귀 테스트 추가(모바일 19건 통과).
- 홈 디자인 3~5번(회색 `textColors`, 지역 검색 둥글기·목록, 글자 기호 → Ionicons)을 커밋했다(`0a6768c`). `appStyles.ts`의 Codex 변경(`calendarFloatingAddIcon` 삭제)은 Codex의 `CalendarPanel.tsx` 수정과 함께 커밋되도록 남겨 두었다.
- 장소 없는 일정이 쓰는 홈 예보도 홈 탭에 있는 동안 10분마다, 앱으로 돌아올 때마다 다시 받는다(`eb976b9`).

## 38. 2026-10-10 시간별 예보 비 강조, 캘린더 디자인 기준 적용 (Claude)

- 홈 시간별 예보: 비·눈 예보이거나 강수확률 60% 이상, 또는 강수량이 있는 시간은 날씨 아이콘과 "강수 n%"를 앱 파란색(`bauhausColors.blue`)으로 굵게 표시한다(`320918b`). 박스 추가 없음.
- 캘린더 화면에 홈과 같은 디자인 기준을 적용했다(`62852e0`, `calendar*` 스타일만 변경).
  - 굵기: 900은 제목·선택된 휠 값만(31 → 7곳), 항목 이름·버튼·배지·날짜 숫자 700, 힌트·보조 정보·입력 글자 600. 8~9px 라벨과 요일 머리글은 가독성 때문에 700 유지.
  - 글자색: 비슷한 회색·남색 10가지를 `textColors`로(12 → 5가지).
  - 둥글기: 10·12 → 14, 작은 요소 8, 알약 999.
- 검증: 타입 검사·커밋 전 검사 통과, ESLint 에러 0. 실기기 화면 확인은 남음.
- 남은 디자인 기준 적용: 설정·지도 화면, 옷차림 카드(`outfitStyles.ts`), 비슷한 파란 강조색 3개 통일.

## 39. 2026-10-10 일정 시작·종료 시간 선택과 캘린더 모션 (Claude)

- 일정 편집: 시간 휠 위에 "시작 09:00 | 종료 10:30" 탭을 두어 어느 시간을 고를지 바꾼다. 탭을 바꾸면 강조색 밑줄이 스프링으로 미끄러지고 가벼운 진동이 온다. 예전에는 종료가 항상 시작+1시간으로 고정이었다(`311450f`).
  - 시작을 옮기면 현재 일정 길이를 유지한다. 종료가 시작과 같거나 이르면 다음 날로 본다(23:00 → 01:00).
  - 날짜 줄 아래 안내가 실제 길이를 보여 준다: "09:00~11:30 · 2시간 30분 일정".
  - 시작↔종료 전환 시 휠이 새 값까지 부드럽게 굴러간다(처음 열 때는 바로 맞춤).
  - `calendarUtils.ts`의 `durationMinutes`·`endForTime`·`formatDuration`, 테스트 `calendarTimeRange.test.mjs` 3건.
- 캘린더 모션(`cf87d42`), 모두 OS 애니메이션 줄이기 설정을 따른다.
  - 일정 추가 버튼이 날짜 시트와 같은 애니메이션 값으로 함께 오르내린다(예전: 시트가 열릴 때 순간이동).
  - 날짜를 고르면 시트의 일정 줄이 50ms 간격으로 차례로 올라오며 나타난다.
  - 고른 날짜 숫자가 한 번 톡 커졌다 돌아온다.
- 이미 있던 모션: 월 이동 시 좌우 슬라이드·페이드, 날짜 시트 열림·확장, 날짜 휠 펼침 페이드.
- 검증: 타입 검사·커밋 전 검사 통과, 바뀐 캘린더 파일 ESLint 경고 0, 모바일 테스트 22건 통과. 실기기 확인은 남음.
- 이어서(`1447381`): 일정 날짜는 연·월·일 위아래 버튼 대신 작은 달력(`CalendarDatePickerGrid.tsx`)에서 고른다. 월 이동 화살표, 일요일 빨강, 오늘 연한 강조, 고른 날 강조색 원, 월 바꿀 때 페이드, 고르면 진동 후 달력이 닫힌다. 시간과 일정 길이는 유지된다.
- 시작·종료 탭 아래 길이 칩(30분·1시간·2시간·3시간·4시간): 누르면 종료 = 시작 + 길이. 현재 길이와 같은 칩이 강조되고, 휠로 임의 종료를 고르면 아무 칩도 강조되지 않는다. 쓰지 않게 된 날짜 버튼 코드는 지웠다.

## 40. 2026-10-10 일정 삭제 확인과 반복 일정 삭제 범위 (Claude)

- 캘린더 날짜 시트의 삭제 버튼이 확인 없이 바로 지우던 문제를 고쳤다. 홈 활동 가이드와 같은 확인 함수(`confirmCalendarEventRemoval.ts`)를 쓴다.
- 일반 일정: "'제목' 일정을 삭제할까요?" 취소/삭제. 반복 일정: 취소 / 이 일정만 / 이후 일정 모두. 예전에는 반복 일정을 그날 하나씩만 지울 수 있었다(편집에는 범위 선택이 있었지만 삭제에는 없었다).
- "이후 일정 모두"는 같은 `repeatGroupId`에서 그 날짜 이후만 지우고 앞선 일정은 남긴다(`calendarRepeat.ts`의 `withoutFollowingOccurrences`, 테스트 1건).
- 되돌리기(삭제 후 몇 초간 취소)는 넣지 않았다. 확인창으로 실수 삭제를 막는 것을 우선했다.
- 검증: 타입 검사·커밋 전 검사 통과, 모바일 테스트 23건 통과. 커밋 `5285120`.

## 41. 2026-10-10 캘린더 "오늘" 버튼과 달력 칸 글자 크기 (Claude)

- 월 제목 옆 "오늘" 버튼: 이번 달이 아닐 때만 보인다. 누르면 이번 달로 방향에 맞게 넘어가고(`moveMonth` 재사용) 오늘 날짜를 고른다.
- 달력 칸 안 일정 이름 8px → 10px(줄 높이 13 → 15, 칸 일정 영역 최소 높이 42 → 49), "+n" 8px → 10px. 칸이 약 6px 높아진다.
- 검증: 타입 검사·커밋 전 검사 통과, 모바일 테스트 23건 통과. 커밋 `735a834`. 실기기에서 작은 화면 달력 높이 확인 필요.

## 42. 2026-10-10 캘린더 날짜 시트 날씨 아이콘·예보 줄 (Claude)

- 캘린더 날짜 시트의 일정 아이콘을 활동 종류 그림 대신 그 일정 시간대 날씨(맑음·흐림·비·눈·강풍, 예보 없으면 시계)로 바꿨다. 홈 활동 가이드와 같은 기준이다.
- 일정마다 예보 한 줄("15:00~17:00 비 예보 · 강수 70%")을 날씨 색으로 보여 준다.
- 바로 위 설명 줄("· 실외")과 겹치던 활동 종류 배지를 뺐다.
- 아이콘 표와 예보 글자색을 `features/dashboard/activityWeatherIcons.ts`로 옮겨 홈·캘린더가 함께 쓴다.
- 검증: 타입 검사·커밋 전 검사 통과, 모바일 테스트 23건 통과. 커밋 `8434702`.

### 캘린더 개선 현황 (2026-10-10)
- 완료: 시작·종료 시간 선택(311450f), 달력 날짜 선택·길이 칩(1447381), 모션(cf87d42), 디자인 기준(62852e0), 삭제 확인·반복 범위(5285120), 오늘 버튼·칸 글자 10px(735a834), 날씨 아이콘·예보 줄(8434702).
- 남음: 일정마다 붙는 옷차림 카드 접기, 빈 날짜 안내에 일정 추가 버튼·날씨 한 줄, 요일 머리글 일·토 색, 저장·삭제 모션, 삭제 되돌리기(선택).

## 43. 2026-10-10 캘린더 날짜 시트 다듬기 (Claude)

- 옷차림 카드 접기: 날짜 시트에서 일정마다 붙던 옷차림 카드를 기본으로 접고 "옷차림 보기 ▾"로 펼친다. 펼친 일정만 카드를 그려서 일정 수만큼 추천 요청이 가지 않는다.
- 빈 날짜: "이 날은 일정이 없어요" + "＋ 일정 추가" 버튼(그 날짜로 편집 화면 열기). 그날 날씨는 시트 머리의 미세먼지·기온·날씨 칩에 이미 있어 따로 넣지 않았다.
- 달력 요일 머리글: 일요일 빨강, 토요일 파랑(일정 편집 달력과 통일).
- 모션: 새로 저장한 일정 선이 달력 칸에 서서히 나타나고, 지운 일정은 시트에서 흐려지며 사라지고 아래 일정이 부드럽게 올라온다(reanimated `exiting`·`LinearTransition`). OS 애니메이션 줄이기 설정을 따른다.
- 검증: 타입 검사·커밋 전 검사 통과, 바뀐 캘린더 파일을 Metro와 같은 `babel-preset-expo`로 변환 확인, 모바일 테스트 23건 통과. 커밋 `80315fe`.
- 캘린더 개선 목록 중 남은 것: (선택) 삭제 되돌리기, 실기기 확인.

## 44. 2026-10-10 캘린더 박스 줄이기 (Claude)

- 일정 편집의 활동 가이드 안내: 테두리 박스 안에 흰 아이콘 박스가 있던 구조(박스 안의 박스)를 왼쪽 강조선 한 줄 + 아이콘 + 글로 바꿨다.
- 날짜 시트 편집·삭제 버튼: 배경·테두리를 없애고 아이콘만 남겼다(누르는 영역 40px).
- 날짜 시트 머리 날씨 칩 3개: 테두리 알약 박스를 없애고 "미세먼지 32 · 기온 18° · 날씨 맑음"처럼 한 줄 글자로 바꿨다. 화면 읽기에서는 항목마다 한 문장으로 읽힌다.
- 검증: 타입 검사·커밋 전 검사·babel 변환 통과. 커밋 `1b24bc5`.
- 남은 디자인 정리(캘린더): 선택 칩 모양 4가지 통일, 날씨 아이콘 선/채움 통일(시트 안 중복 함수 정리), 날짜 시트 위 모서리 둥글게, 직접 쓴 색을 토큰으로.

## 45. 2026-10-10 캘린더 디자인 정리 마무리 (Claude)

- 선택 칩 통일: 반복·활동·알림·요일·일정 길이 칩과 "오늘" 버튼을 한 모양으로(배경 없음, 테두리 `#DCE5F0`). 고르면 모두 강조색으로 채우고 흰 글자(`calendarChipTextSelected`). 예전에는 반복·활동·알림만 연한 채움이었다.
- 날짜 패널 머리의 날씨 아이콘을 일정 줄과 같은 채운 아이콘 세트(`ACTIVITY_WEATHER_ICONS`)로 바꾸고, 패널 안에 따로 있던 선 아이콘 함수를 지웠다. 미세먼지·기온 아이콘도 채운 아이콘으로 맞췄다.
- 날짜 패널 위 모서리 둥글게(24) + 위로 드리우는 그림자.
- 직접 쓴 색을 토큰으로: `textColors.primary`·`disabled`, `bauhausColors.blue`·`blueSoft`, 새 토큰 `bauhausColors.amber`(민감 일정·기온, `#C58A19`).
- 검증: 타입 검사·커밋 전 검사·babel 변환 통과, 모바일 테스트 23건. 커밋 `1110e53`.
- 캘린더 디자인 제안 7개(박스 3개 + 정리 4개) 모두 완료.

## 46. 2026-10-10 앱 날씨 아이콘 PNG 통일 (Codex)

- 인물 옷차림 PNG와 맞춘 남색 외곽선·파랑·노랑 계열의 투명 PNG 날씨 아이콘 7종을 추가했다: 맑음, 구름 조금, 흐림, 비, 눈, 강풍, 뇌우.
- 공용 `WeatherIcon`으로 홈 현재 날씨·시간별 예보·활동 가이드, 캘린더 날짜·일정 날씨와 위험 배지, 상세 날씨 페이지, 지도 관측소, 옷차림 주의 안내 아이콘을 통일했다. 미세먼지·기온·화살표 같은 비날씨 아이콘은 기존대로 둔다.
- 예보가 없는 상태는 구름 아이콘 대신 대기 시계로 표시한다.
- 검증: 적용 파일을 저장소와 대조했다. 타입 검사·린트·앱 실기기 확인은 아직 하지 않았다.
- 추가 확인(2026-10-10): Android에서 새 날씨 PNG가 비어 보인 원인은 기기의 Metro 8081 포트 연결 누락이었다. adb reverse tcp:8081 tcp:8081 후 앱을 다시 열어 홈 헤더와 활동 가이드의 맑음 아이콘 표시를 확인했다(헤더 노란색 픽셀 0→405). 직접 Expo를 실행할 때 연결이 빠질 수 있으며, mobile 폴더의 npm run dev:android는 8081·8001을 모두 연결한다.

## 47. 2026-10-10 날씨 PNG 보이는 크기 통일 (Codex)

- 날씨 PNG 7종의 투명 여백을 측정했다. 그림의 최댓변이 135~190px로 달라 같은 size 값에도 맑음이 작게 보였다.
- 공용 WeatherIcon에서 각 PNG의 실제 그림 경계를 기준으로 중심과 배율을 보정했다. 기존 AppActionIcon과 같은 94% 기준을 사용하고 레이아웃 너비는 유지한다.
- 검증: 모바일 타입 검사 통과. Android 실기기에서 홈 헤더·시간별 예보·활동 가이드의 맑음과 구름 아이콘 크기 변화를 확인했다. 다른 날씨 상태도 동일한 경계 기준을 적용한다.

## 48. 2026-10-10 동작 아이콘 PNG를 날씨 아이콘 스타일로 통일 (Codex)

- 공용 동작 아이콘 9종(삭제, 일정 추가, 검색, 지도, 위치, 즐겨찾기, 알림, 옷차림, 수정)을 기존 날씨 PNG와 같은 남색 외곽선·파랑 면·노란 포인트의 평면 2D 스타일로 새로 제작했다. 모두 256×256 투명 PNG이며 기존 파일명을 유지해 호출 코드는 바꾸지 않았다.
- 별은 노란색 별 하나, GPS는 위치 핀 하나로 유지했다. 하단 탭의 기본 아이콘과 인물 일러스트는 이번 범위에서 변경하지 않았다.
- `AppActionIcon`의 실제 그림 경계(`artworkBounds`)를 새 파일에 맞게 다시 측정해 작은 버튼에서도 가운데 정렬과 표시 크기를 유지했다.
- 검증: 모바일 TypeScript typecheck 통과, 변경 파일 ESLint(`--no-cache`) 통과. Android 실기기 홈·캘린더·일정 시트에서 검색·일정·삭제·수정 아이콘 표시를 확인했다. 전체 `expo lint`는 저장소 `.expo` 캐시 파일 쓰기 권한(EPERM) 때문에 완료되지 못했다.
- 주요 파일: `mobile/assets/icons/action-*.png`, `mobile/src/components/shared/AppActionIcon.tsx`.
- (45장 보충) 사용자 요청으로 날짜 패널 위 모서리 둥글게는 되돌렸다(각진 모서리 유지, 위로 드리우는 그림자만 남김). 커밋 `c5453a3`. 디자인 선호: 아래에서 올라오는 패널의 모서리는 둥글게 하지 않는다.

## 49. 2026-10-10 작은 크기 날씨 아이콘 가독성 보정 (Codex)

- 비 아이콘의 물방울을 약 1.8배 길고 비스듬하게, 눈송이를 약 1.7배 크게 그렸다. 두 표식 모두 기존보다 진한 파랑(`#2C6FAE`)을 사용해 13px 캘린더 배지에서도 흐린 구름과 구분되게 했다.
- 구름 조금과 강풍의 구름을 흐림·비·눈과 같은 연한 하늘색(`#A9D5F2`)으로 맞췄다. 강풍의 바람 줄은 8px에서 11px로 굵게 하고 같은 진한 파랑을 사용했다.
- 변경된 PNG 4종의 실제 alpha 경계를 다시 측정해 `WEATHER_ICON_BOUNDS`를 갱신했다. `weatherIconKind`는 `구름조금`, `구름 조금`, `구름많음` 등 띄어쓰기가 달라도 같은 종류로 판단한다. `HomePanel.tsx`의 사용하지 않는 `bauhausColors` import를 제거했다.
- 검증: 13px·24px 미리보기에서 구름과 비·눈·강풍 표식 구분 확인, 실제 `weatherIconKind` 함수의 표기 변형 검사 통과, 모바일 typecheck 통과, 변경 파일 ESLint 오류 0(기존 HomePanel 경고 3개). 생성 PNG와 앱 PNG의 SHA-256 일치 확인.
- 주요 파일: `mobile/assets/icons/weather-partly-cloudy.png`, `weather-rain.png`, `weather-snow.png`, `weather-wind.png`, `mobile/src/components/shared/WeatherIcon.tsx`, `mobile/src/components/home/HomePanel.tsx`.

## 46. 2026-10-10 설정 화면 정리 (Claude)

- 화면 머리의 "설정"과 겹치던 두 번째 "설정" 제목·아이콘 박스를 빼고 "현재 기준 지역 + 지역 이름"과 현재 위치 버튼만 남겼다.
- 옷차림 스위치 "일정별 옷차림 추천" → "옷차림 추천 보기", 설명 "홈은 오늘 하루 날씨, 캘린더는 일정 시간 날씨로 추천해요". 옷차림 섹션 아이콘을 걷는 사람 → 옷차림 아이콘으로.
- `NotificationToggleRow`에 선택 설명 줄(`description`)을 추가하고 알림 스위치마다 설명을 넣었다. 아침 날씨 알림에는 "매일 아침 7시 … 일정 제목은 보내지 않고 날짜와 시간만 서버로 보내요" 개인정보 안내 포함(미뤄 두었던 "설정 화면 개인정보 안내" 결정 해결).
- 새 "앱 정보" 섹션: 데이터 출처(한국환경공단 에어코리아, 기상청 단기·중기예보, 공공데이터포털), 개인정보 요약, 앱 버전(`expo-constants`로 app.json 버전).
- 즐겨찾기 넘김 버튼: 글자 기호 ‹ › + 동그라미 박스 → Ionicons 화살표, 박스 없음.
- 글자: 900은 제목만, 나머지 700/600, 회색은 `textColors`. 코디 이미지·체감 성향 선택 11px → 13px.
- 검증: 타입 검사·커밋 전 검사·babel 변환 통과, 모바일 테스트 23건. 커밋 `3aa3928`.

## 50. 2026-10-10 오늘 산책하기 좋은 시간 (Claude)

- 홈 시간별 예보 아래에 박스 없이 한 줄(위 구분선)로 "산책하기 좋은 시간 **15~17시** 맑음 · 미세먼지 좋음 · 19°"를 보여준다. 좋은 시간이 없으면 "오늘은 밖에 오래 있기 좋은 시간이 없어요", 22시 이후·예보 없음일 때는 숨긴다.
- 순수 함수 `features/dashboard/bestOutingWindow.ts`의 `findBestOutingWindow`: 오늘 남은 시간(지금~21시, 06시 이후)마다 시간별 예보 + 시간별 미세먼지(없으면 현재 PM10)로 외출 지수를 계산한다. 비·천둥·강수 60% 이상 시간은 제외(외출 지수는 비에 16점만 깎아 '좋음'에 남을 수 있음), 62점 이상·PM10 80 이하(민감군 30 이하)만 좋은 시간으로 보고 연속 2시간 → 1시간 순으로 고른다.
- 같이 고친 것: `calendarRiskEvaluator`의 `isPastEvent`가 실제 시계를 읽어 테스트 하나가 날짜(오늘 오후)에 따라 실패했다. `context.now`를 쓰도록 수정(`d8a8b2f`).
- 검증: 타입 검사·babel·테스트(`bestOutingWindow.test.mjs` 3건 추가). 커밋 `7cd5b65`.

## 51. 2026-10-10 비를 피하는 일정 시간 제안 (Claude)

- 일정 시간대 안 예보에 비가 있으면 −1, +1, −2, +2, −3, +3시간 순으로 옮겨 보고, 옮긴 시간대에 예보가 있고 비가 없으면 "1시간 앞당기면 비를 피할 수 있어요 (13:00~14:00)"를 제안한다. 서버 변경 없음.
- 제외: 여러 날 일정, 다른 날로 넘어가는 시간, 06시 이전, 이미 지난 시작 시각.
- `CalendarRiskResult.rainFreeSuggestion` + `rainFreeSuggestionText`. 캘린더 일정 설명(desc)에 한 줄 추가, 홈 활동 가이드 조언은 우산 문구 대신 제안 문구를 보여준다.
- 검증: 평가기 테스트 2건 추가(앞당김·지난 시간 건너뛰고 미룸·모두 비면 제안 없음). 커밋 `d04cd94`.

## 52. 2026-10-10 민감군 모드 (Claude)

- 설정 > 건강 > "민감군 모드" 스위치(설명: 천식·호흡기 질환, 어린이·노약자). `OutfitSettings.sensitiveMode`로 같은 개인 설정 저장소에 저장(기본 꺼짐, 예전 저장값은 false).
- 켜면 `buildCalendarRiskByEvent`가 저장된 일정은 그대로 두고 판단할 때만 `{ ...event, sensitive: true }`로 평가한다 → 캘린더·홈 활동 가이드·일정 알림 모두 미세먼지 기준 30/80 적용. 활동 가이드 마스크 조언과 산책하기 좋은 시간도 같은 기준.
- 검증: 타입 검사·babel·린트 오류 0, 모바일 테스트 29건 통과. 커밋 `04b03d7`.
- 실기기 확인 필요: 산책 시간 줄 위치·글자 잘림(작은 화면), 설정 건강 섹션.

## 53. 2026-10-10 캘린더 열 때 덜컹거림·배경 비침 수정 (Claude)

- 증상: 캘린더 탭을 열면 화면이 드드득 떨리며 뒤의 날씨 배경 사진이 보였다.
- 원인: 화면 전환(투명→불투명+아래→위) 동안 뒤의 WeatherBackdrop이 비쳤다. 같은 순간에 달 슬라이드, 모든 일정 선 FadeIn, 오늘 날짜 숫자 튐이 함께 시작됐고, 첫 화면에서 달 전체 날씨 배지를 동기로 계산했다(PC node에서 일정 40개 기준 약 20ms라 휴대폰에서는 더 김).
- 수정: 캘린더에서 WeatherBackdrop 제거(바탕은 safeArea 단색 #F7F9FC). 처음 열 때는 달 슬라이드와 숫자 튐을 건너뛰고, 일정 선은 `LayoutAnimationConfig skipEntering`으로 처음 그릴 때만 FadeIn을 생략한다(새로 저장한 일정은 그대로 등장 모션). 달 날씨 배지는 `InteractionManager.runAfterInteractions` 뒤에 계산해 전환 직후 살짝 늦게 나타난다.
- 검증: 타입 검사·babel·린트 오류 0, 테스트 29건. 실기기에서 덜컹거림이 사라졌는지 확인 필요. 커밋 `f887f1f`.

## 54. 2026-10-10 일정 알림 재예약 실패 시 기존 알림 보존 (Codex)

- 원인: 일정·예보 변경 시 기존 예약을 먼저 전부 취소했고, 개별 예약 실패는 빈 ID 목록으로 넘겼다. Expo 예약 함수도 같은 ID의 기존 알림을 먼저 취소했다.
- 수정: Expo가 생성한 고유 ID로 새 알림을 예약한다. 전부 예약하고 새 ID 목록을 저장한 뒤에만 이전 ID를 취소한다. 예약·저장 실패 시 새로 생성한 알림만 정리하고 기존 알림을 유지한다. 빠른 변경으로 여러 동기화가 겹치지 않도록 순서대로 실행한다.
- 검증: 실패 재현 테스트는 수정 전 실패, 수정 후 통과. 부분 예약 실패·저장 실패·정상 교체를 포함한 알림 테스트 4건, 모바일 전체 테스트 33건, TypeScript typecheck 통과. 변경 파일 ESLint 오류 0(기존 경고 26개). 실기기에서 일정 알림 예약·변경·삭제 확인 필요.

## 54. 2026-10-10 미세먼지 나쁨 알림 + 아침 알림 FieldError 수정 (Claude)

- 먼저 고친 버그(`c2a9000`): `weather_morning_notifications._station_for_region`이 `AirQualityStation`을 없는 필드 `station_name`으로 조회해 `send_dust_notifications`(아침 날씨 알림)가 매번 FieldError로 멈췄다(weather_morning_notifications.log에 기록). `_find_air_quality_station` + `station.name`으로 수정, 로컬 dry-run에서 2건 생성 확인.
- 새 명령 `send_dust_spike_notifications`(`dust/dust_spike_notifications.py`, `3155a7c`): 측정값(최근 2시간 안)이 PM10 80 초과면 "지금 미세먼지 나쁨(PM10 95㎍/㎥)이에요. 마스크 챙기세요.", 아니면 오늘 남은 HourlyDustPrediction 중 처음 80을 넘는 시각으로 "오후 3시부터 미세먼지 나쁨이 예상돼요." 150 초과는 "매우 나쁨". 기기·날짜별 하루 한 번(DustNotificationLog type `dust_spike`), 22~07시는 보내지 않음(`--force`로 무시), 같은 지역은 한 번만 계산. `--dry-run` 지원.
- `NotificationDevice.dust_spike_alerts`(기본 False, 마이그레이션 0014, 로컬 DB 적용함), 등록 API `dustSpikeAlerts`.
- `collect_hourly.bat` 마지막 단계로 추가. **운영(Lightsail systemd timer)에도 같은 단계 추가와 `migrate` 필요.**
- 앱: `NotificationSettings.dustSpikeAlerts`(기본 켜짐), 설정 > 알림에 "미세먼지 나쁨 알림" 스위치, `registerNotificationDevice`에 `dustSpikeAlerts` 인자.
- **남은 연결(Codex 작업과 겹쳐 보류)**: Codex가 진행 중인 `mobile/src/notifications/useNotificationSettings.ts`에서 ① 켜짐 상태 `registerNotificationDevice({...})`에 `dustSpikeAlerts: settings.dustSpikeAlerts,` ② effect 의존성에 `settings.dustSpikeAlerts` ③ 토글 메시지 분기 `dustSpikeAlerts` → '미세먼지 나쁨 알림을 켰어요/껐어요'. 연결 전까지는 서버에 false로 전달되어 알림이 가지 않는다.
- 참고: 로컬 DB의 서울 강남구 시간별 예측은 오늘 08시까지만 있어(예측 생성이 일부 측정소만 갱신) 지금은 주로 측정값 기준으로 동작한다.
- 검증: 백엔드 테스트 28건(새 5건: 지금 나쁨, 첫 나쁨 예측 시각, 오늘 안 넘으면 없음, 조용한 시간, 한 번 보내고 기록), 모바일 tsc·테스트 34건·babel 통과.

## 55. 2026-10-10 AppContent 기능별 분리 (Codex)

- `AppContent`에서 일정 목록 편집·저장을 `useCalendarEvents`, 일정 로컬 알림 재예약을 `useCalendarReminderSync`, 알림 설정·서버 기기 등록을 `useNotificationSettings`, 지도 검색·선택·최근 검색·WebView 제어를 `useMapSearch`로 옮겼다. 화면 연결은 기존대로 유지했다.
- 일정 알림을 끄면 저장된 예약 ID만 비우던 문제를 수정했다. 기존 예약을 실제로 취소한 뒤 빈 목록을 저장하며, 해당 경로의 회귀 테스트를 추가했다.
- 병행 작업에서 추가된 미세먼지 나쁨 알림 스위치를 서버 기기 등록에 연결했다. 설정을 바꾸면 `dustSpikeAlerts` 값이 전송된다. 일정 제목은 서버로 보내지 않고 날짜·시간만 보낸다.
- 검증: 모바일 TypeScript typecheck 통과, Node 테스트 34건 통과, 전체 ESLint 캐시 없이 실행해 오류 0(기존 경고 60개). `npm run lint`는 `.expo` 캐시 쓰기 권한 오류로 종료되어 같은 ESLint를 `--no-cache`로 실행했다. 실기기에서 일정 알림 켜기·끄기, 지도 검색·최근 검색, 미세먼지 나쁨 알림 설정을 확인해야 한다.

## 56. 2026-10-10 지도 템플릿 분리와 오래된 경로 정리 (Codex)

- `dust.views.mobile_map`에 들어 있던 지도 HTML·CSS·JavaScript 약 1,110줄을 `dust/templates/dust/mobile_map.html`로 옮겼다. 뷰는 좌표·모드·지도 UI 설정을 검증하고 템플릿에 전달한다. 앱이 사용하는 `/dust/mobile-map/` URL과 WebView 호출 방식은 유지했다.
- 템플릿의 인라인 JavaScript 값은 `_script_json`으로 `<`, `>`, `&`를 이스케이프한다. Naver Maps 클라이언트 ID도 JavaScript 문자열로 안전하게 넣고 SDK URL에는 URL 인코딩해 붙인다.
- 존재하지 않는 `build/index.html`을 가리키던 Django React SPA catch-all과 `build` 템플릿·정적 파일 설정을 제거했다. 기존 `/app/` 페이지와 `/api/`, `/dust/`, `/outfit/` 라우팅은 유지했다. 모바일에서 참조되지 않는 임시 `screens/MapScreen.tsx`도 제거했다.
- 검증: 지도 렌더링·비/눈/바람 아이콘·모드 전환·스크립트 입력 이스케이프·오래된 경로 404·기존 `/app/` 템플릿 테스트 포함 백엔드 88건 통과, 모바일 TypeScript typecheck 통과. 실기기 WebView에서 실제 지도 SDK 로드·마커·검색은 추가 확인 필요.

## 55. 2026-10-10 산책 시간 아이콘 PNG + 미세먼지 알림 앱 연결 확인 (Claude)

- 홈 "산책하기 좋은 시간" 줄 아이콘: Ionicons walk-outline → 앱 그림체의 걷는 사람 PNG(`AppActionIcon name="activityOutdoor" size={26}`), 좋은 시간이 없으면 흐리게(opacity 0.45). 쓰지 않게 된 bauhaus import 제거. 커밋 `72e7d49`.
- 54장의 "남은 연결"은 Codex 리팩터(`bd91009`)의 `useNotificationSettings.ts`에 이미 들어갔다(등록 요청 `dustSpikeAlerts`, effect 의존성, 토글 메시지). 남은 것은 운영 서버 migrate와 timer 추가.
- 검증: pre-commit tsc 통과, 모바일 테스트 34건.

## 56. 2026-10-10 AppContent 훅 분리 + 안 쓰는 기능 제거 (Claude)

- 백엔드(`dd60bdb`): 앱에 화면이 없는 챗봇 API `/dust/chat/`과 전용 도우미 함수 26개 제거(views.py 3830 → 3221줄). 다른 기능과 함께 쓰는 함수는 AST 도달 분석으로 남겼다. 채팅 기록 테이블 `DustChatLog`는 데이터 보존을 위해 모델·테이블을 그대로 둔다(지우려면 마이그레이션 필요). 상세 데이터용 API(`/dust/past/`, `/dust/weather/past/` 등)는 웹사이트에서 쓸 예정이라 남긴다. 백엔드 테스트 88건 통과.
- 모바일(`8d50d2f`):
  - 새 훅: `features/dashboard/useDashboardData.ts`(현재값·과거·예측·날씨 불러오기, 캐시 먼저 표시, 지역이 바뀌면 늦은 응답 무시, 홈에서 10분마다·앱 복귀 시 갱신), `features/region/useRegions.ts`(선택 지역·GPS·즐겨찾기, 저장, 가까운 측정소 찾기), `features/stations/useStations.ts`(측정소 목록·캐시, `ensureMapStations`).
  - AppContent 1777 → 1008줄, useState 46 → 12, useEffect 20 → 12. 남은 역할: 탭 이동, 지역 전환 애니메이션, 홈 검색·즐겨찾기 패널, 토스트, 저장값 복원, 화면 조립.
  - 제거: 숨겨 둔 상세 데이터 화면 전체(`DETAIL_DATA_ENABLED`, DataPanel, WeatherDataPanel, 홈·지도 진입 버튼), 화면 없는 챗봇 상태·API 호출, 어디서도 import하지 않는 파일 21개(옛 로그인·회원가입·마이페이지·비밀번호·프로필 화면, AppCard·ChatPanel·MetricGauge·ThemeToggle·ThemeProvider, api/auth·user, utils/airQuality·csv·date), 쓰지 않는 export 25개, 쓰지 않는 스타일 386개(appStyles 906 → 496줄).
  - 작은 동작 정리: 즐겨찾기 저장을 setState 안의 부수효과 대신 effect 한 곳에서, 읽지 않던 `isLoading`·`currentNotice` 상태 제거. 지도 WebView가 보내는 `station-detail` 메시지는 이제 무시한다.
  - 검증: tsc·eslint(오류·unused 0)·테스트 34건·babel 통과. **실기기 확인 필요**: 첫 실행 위치 잡기, 지역 바꾸기·즐겨찾기 추가/삭제(앱 재시작 후 유지), 당겨서 새로고침, 지도 마커·검색·뒤로가기, 캘린더·설정 화면.
- 웹 로그인·회원 기능(백엔드)은 사용자 결정 대기로 그대로 둔다.

## 57. 2026-10-10 웹 로그인·회원 API 끄기 + 노션 '지운 코드 보관소' (Claude)

- `1f147cb`: `/api/`(로그인·salt·회원가입·구글 로그인·회원정보·비밀번호·접속 기록·getAddressInfo)와 `/app/`(옛 로그인·회원가입·마이페이지 HTML) 경로를 끄고 뷰·URL·템플릿·static js/css·도우미 18개 파일(1,675줄)을 지웠다. colorama 의존성 제거.
- **남긴 것**: `AUTH_USER_MODEL = 'app.Users'`라 관리자 페이지 로그인에 필요하므로 app/api 앱의 모델·admin·마이그레이션과 users·info·access_history 테이블·데이터는 그대로 둔다.
- 테스트: `config/test_urls.py`에 로그인·회원 경로 6개 404, `/admin/login/` 200 확인 추가. 백엔드 테스트 88건 통과, 마이그레이션 변경 없음.
- 노션에 `지운 코드 보관소` 데이터베이스(WeatherToDo 개발 아래)를 만들었다. 1건 = 1페이지: 지운 이유·구조·지운 커밋·되살리기 명령(`git checkout <커밋>^ -- <경로>`)·남긴 데이터, 전체 코드는 .md 첨부. 오늘 4건 기록: 웹 로그인·회원 API(1f147cb), 챗봇 API(dd60bdb), 앱 상세 데이터 화면(8d50d2f), 옛 화면·부품·유틸(8d50d2f). 노션 작성 규칙 9번으로 추가(Codex도 지울 때 기록).
- 운영 반영 필요: 배포 후 `/api/login/`이 404인지 확인.

## 58. 2026-10-10 디자인 마무리: 지도 화면 기준 맞추기, 파랑 2가지 (Claude)

- `b6d6c58`. 파랑 5가지(#3D7FEA, #2F6FD7, #2568C6, #246FD6, #2563eb) → 토큰 2가지:
  - `bauhausColors.blue` #3D7FEA: 아이콘·막대·배경 강조·큰 글자.
  - `bauhausColors.blueText` #2F6FD7: 작은 파란 글자. #3D7FEA는 흰 배경 명암비 3.87:1이라 작은 글자 기준(4.5:1)에 못 미침, #2F6FD7은 4.8:1.
  - blueText로 바꾼 곳: 홈 지역 검색 글자, 시간별 예보 "지금"·강수 강조, 산책 시간, 활동 가이드 시각, 캘린더 "오늘" 버튼·토요일, 설정 현재 위치 버튼, 측정소 시도 이름.
- 지도 화면·측정소 시트·지도 검색: 글자색을 textColors(heading/primary/secondary/muted/disabled)로, 초록빛이 섞여 있던 테두리(#d9eee2, #eef3ef)를 bauhausColors.border·구분선 #E7EDF5로, 굵기 900은 제목·큰 숫자만(라벨·버튼 700, 보조 600), 모드 선택 카드 모서리 12 → 14.
- 남긴 직접 색: 오류 빨강(#9d332a 등), 기온 배경(추움 파랑·더움 빨강 등 의미 있는 색), 풍속 초록, 모드 아이콘 주황(#E18B2D = semanticColors caution).
- 검증: tsc·eslint 오류 0·테스트 34건·babel 통과. 실기기 확인 필요: 지도 검색창·검색 결과·측정소 시트의 글자 대비와 굵기.

## 59. 2026-10-10 테스트 안내 문서, npm test, 옷차림 카드 글자 정리 (Claude)

- 노션 "WeatherToDo 개발" 아래 `테스트 안내` 페이지: 검사 네 가지(커밋 전 자동 검사, 타입 검사·린트, 모바일 34건, 백엔드 88건)가 무엇을 막고 언제·어떻게 돌리는지, 영역별 테스트가 확인하는 내용을 쉬운 말로 표에 정리. 테스트를 추가하면 표에도 한 줄 추가.
- `fe27ebd`: mobile `npm test` 스크립트(`node --test "src/**/*.test.mjs"`, Node 24 glob). 이제 모바일 테스트는 `npm test`.
- `b93164f` 옷차림 카드(`components/outfit/outfitStyles.ts`): 홈 활동 가이드 기준에 맞춤. 직접 쓴 회색 5가지 → textColors, 9~10px → 10~11px(배지급 최소 10, 본문 11), 900은 카드 제목만(강조 700, 설명 600), 카드 모서리 20/16 → 14, 작은 요소 10 → 8, 칩 아이콘 색을 `semanticColors.outfit.accent`(= blueText 값)로.
- 실기기 확인 필요: 홈 두 인물 아래 설명이 11px로 커져 줄바꿈이 늘지 않는지, 캘린더 날짜 시트의 옷차림 카드.

## 60. 2026-10-10 외출지수 표시 제거, 홈 아래 섹션을 탭으로 (Claude)

- `9a2c959` 외출지수 점수 표시 제거: 홈 배너 "외출지수 N점" 슬라이드(배너 점 8 → 7개), 캘린더 일정 설명의 "예상 외출 지수 : N점" 줄. 이유: 임의 가중치(미세먼지 나쁨 −36, 비 −16 …) 점수라 뜻이 바로 와닿지 않고 근거 설명이 어려움, 같은 판단을 배지·예보 한 줄·비 회피 제안이 쉬운 말로 보여 줌.
  - 계산 `calculateOutingIndex`는 남김: 앱 강조색(`theme/appTheme.ts`)과 산책하기 좋은 시간 순위(`bestOutingWindow`)에서 내부로만 씀.
  - 지움: `getOutingGrade/getOutingTone/getOutingSemanticTone`, `CalendarRiskResult.outingIndex`, `eventDayCount`, `components/calendar/outingIndex.ts`(다시 내보내기). 노션 지운 코드 보관소에 기록.
- `d703c20` 홈 아래 세 섹션(오늘 활동 가이드, 오늘 옷차림, 전국 날씨 지도)을 섹션 하나 + 탭 [활동 가이드 | 추천 옷차림 | 날씨 지도]로(탭 이름 변경 `1b53248`).
  - 탭: 박스 없이 아이콘(위) + 글자 + 강조색 밑줄. 선택 탭만 움직이는 아이콘(HomeMotionActionIcon), 나머지 흐린 PNG.
  - 내용은 `display: 'none'`으로 숨기기만 해서 탭을 바꿔도 옷차림 추천(LLM)·지도 WebView를 다시 불러오지 않음. 옷차림 꺼짐이면 탭 2개. 기본 탭은 활동 가이드(앱을 다시 열면 처음으로).
  - 지도 미리보기는 섹션 안에서 `marginHorizontal: -20`으로 화면 끝까지. 각 섹션의 19px 제목·머리 아이콘은 탭이 대신해서 지웠고 쓰지 않게 된 스타일 17개 정리.
- 검증: tsc·eslint 오류 0·테스트 34건·babel 통과. 실기기 확인 필요: 작은 화면에서 탭 글자 줄바꿈, 탭 전환 시 높이 변화, 지도 탭 눌러 전체 지도 열기.

## 61. 2026-10-10 추천 옷차림 AI 표시, 지도 탭 높이, 일정 없을 때 기본 활동 가이드 (Claude)

- `fed3543`.
- **추천 옷차림 AI 표시**: `OutfitSourceRow`(OutfitCard.tsx)를 카드 맨 위(홈 두 인물·캘린더 한 인물 공통)에 둔다.
  - `source === 'llm'`: 반짝이(Ionicons sparkles) + "AI 추천 · 오늘 날씨를 보고 골랐어요", 설명이 타이핑되듯 나타남(useTypewriter, 동작 줄이기 설정이면 바로 표시).
  - 규칙 결과 + AI 대기 중: 반짝이가 깜빡이며 "AI가 오늘 날씨로 옷차림을 고르는 중…". 이를 위해 `useOutfitRecommendation`에 `isEnhancing`(full 요청 중 true) 추가.
  - 규칙 결과(AI 실패·미설정): "기본 추천 · 날씨 기준으로 골랐어요"(반짝이 없음, 사실대로).
  - 홈 탭 "추천 옷차림" 옆 작은 반짝이. 기존 10px 출처 알약(sourcePill)은 지움.
- **날씨 지도 탭**: 지도 칸이 화면에서 시작하는 y를 `measureInWindow`로 재서 높이 = 창 높이 − y − (링크 줄 44 + 섹션 여백 20 + 스크롤 여백 30 + 하단 탭 바 69), 최소 156. 지도 탭이 보일 때 onLayout에서 잼.
- **기본 활동 가이드**: 오늘 일정이 없으면 `features/dashboard/defaultActivityGuides.ts`가 남은 오늘 날씨로 3줄을 만든다.
  - 실외: 산책하기 좋은 시간이 있으면 "15~17시가 가장 좋아요 · 맑음 · 미세먼지 좋음 · 19°", 없으면 첫 비 시간대·미세먼지·좋은 시간 없음 순으로 주의.
  - 실내: 비·미세먼지면 실내 활동 추천, 공기 맑으면 환기하기 좋은 날, 아니면 짧은 환기.
  - 나갈 때: 우산(첫 연속 비 시간대) → 일교차 10° 이상 겉옷 → 30° 이상 물 → 0° 이하 따뜻하게 → 무난.
  - 민감군이면 미세먼지 30 초과부터 주의. 주의 줄은 주황 배경, 나머지 파란 배경 아이콘(activity-outdoor/indoor/transit PNG). 누르면 캘린더. 테스트 3건(모바일 37건).
- 실기기 확인 필요: AI 응답이 바뀌는 순간(기본 → AI) 카드 깜빡임, 지도 탭 높이(스크롤 위치에 따라 다름), 기본 가이드 문구.
- `4c756a0` 활동 가이드 일정 추가 UI 통일: 일정이 없을 때도 '+ 일정 추가' 칩 대신 목록 아래 '일정 추가하러 가기' 버튼(일정 있을 때와 같음). 위에는 안내 문구만.
- `ede208e` 기본 가이드: 위에 '기본 가이드 · 일정이 없어 오늘 날씨로 만들었어요' 줄 + 줄마다 회색 '기본' 배지(일정 배지 자리). '나갈 때' 줄을 빼고 실외·실내 2줄만.
- 참고(2026-10-10 21:50): 홈 오른쪽 위 날씨 칩이 안 보인 원인은 코드가 아니라 기기의 adb reverse에서 8001(백엔드)이 빠져 "서버에 연결할 수 없어요" 상태였던 것. `adb reverse tcp:8001 tcp:8001`로 복구, 실기기 화면에서 칩·기본 가이드 확인. Metro만 따로 켜면 8001이 빠질 수 있어 `npm run dev:android` 사용 권장.

## 62. 2026-10-10 즐겨찾기 패널 sticky + 지역 바꾸기 UI (Claude)

- `4b87ac6`. 즐겨찾기 지역 선택 패널을 AppContent 홈 머리(`homeHeader`, ScrollView stickyHeaderIndices [0]) 안, 기준 시각 줄 아래로 옮겼다 → 화면을 내려도 머리와 함께 붙어 있음(실기기에서 스크롤해 확인). 지역 검색 패널은 그대로(머리 밖).
- 새 모양: 머리 줄 '지역 바꾸기'(secondary 12/700) + '즐겨찾기 N곳'(muted 11). 행은 한 줄(min 46): 아이콘(현재 위치 빨간 navigate / 즐겨찾기 노란 별) · 이름 15/700 · 시도 12 muted, 오른쪽 상태('✓ 보는 중' 강조색 / '현재 위치' muted), 즐겨찾기 행만 삭제 ✕. 현재 위치 행은 보는 지역이어도 표시(누를 수 없음). 안쪽 ScrollView maxHeight 280(nestedScrollEnabled).
- 기본 가이드 머리 문구: '오늘 등록된 일정이 없어 기본 가이드로 안내드립니다'(flex:1, 줄바꿈 허용).
- 검증: tsc·eslint 오류 0·babel, 실기기 스크린샷으로 패널 모양과 sticky 확인.
- `42d1a04` 지역 바꾸기의 GPS 행: '현재 위치' → '현재 지역', 아이콘 Ionicons navigate(빨강) → 앱 그림체 위치 핀 PNG(AppActionIcon location).
- `701e4ed` 기본 가이드 줄마다 붙던 회색 '기본' 배지 제거(위 '기본 가이드' 안내 줄만 남김).
- `fb77608` 배너 게이지 숫자 크기 자동 축소(`gaugeValueFontSize`, HomePanel.tsx): 원 안쪽 폭 70% 기준, 0.050은 28~31px, 1013은 30~35px, 43은 38px 그대로. numberOfLines 1, maxFontSizeMultiplier 1.2.
- `f28dc00` 일정 편집기 활동 선택에서 '이동' 제거(실내·실외만). 저장된 transit 일정은 타입·평가·아이콘 그대로 지원, 편집기를 열면 실외로 표시(저장 시에만 변경).

## 63. 2026-10-10 저장소: SecureStore 2KB 제한 → 파일 저장 (Claude)

- `7cafab5`. 실기기 로그에서 저장할 때마다 "Value being stored in SecureStore is larger than 2048 bytes and it may not be stored successfully. In a future SDK version, this call may throw an error." 경고 확인. 일정(반복 최대 420개)·알림 ID·최근 검색 등 모든 앱 값을 SecureStore에 넣고 있었고, 실패는 `.catch(() => {})`로 조용히 무시돼 일정 유실 위험.
- `storage/appStorage.ts`: 푸시 토큰(`dust.notification-token`)만 SecureStore, 나머지는 `documentDirectory/app-storage/<key>.json`.
  - 읽기: 파일 → (없으면) `.tmp` 복구 → (없으면) 예전 SecureStore 값을 파일로 옮기고 성공 후 SecureStore에서 삭제.
  - 쓰기: `.tmp`에 쓰고 원본 삭제 후 이동(원자적 교체), 키별 순서 보장 큐, 실패는 console.warn.
  - 테스트 `storage/appStorage.test.mjs` 4건(expo 모듈을 메모리 가짜로 바꿔 끼움). 모바일 테스트 41건.
- 실기기 확인: 다시 불러오기 후 `run-as com.xkvk11.DusthealthAIMobile ls files/app-storage`에 8개 파일, 일정 4,090바이트(예전 한도의 두 배), 경고 사라짐. 일정 개수는 확인 직전 USB가 끊겨 못 셈.
- 실기기 연결 주의: 이날 USB가 여러 번 끊겨 adb reverse(8081·8001)가 사라졌다 → "서버에 연결할 수 없어요"·"Unable to load script". `adb reverse tcp:8081 tcp:8081`, `adb reverse tcp:8001 tcp:8001` 후 Reload. 케이블·포트 점검 권장.

## 64. 2026-10-10 시간별 미세먼지 예측 → 에어코리아 예보 (Claude)

- `551b8c4`. 사용자 결정: 앱·알림·옷차림은 에어코리아 공식 예보를 쓰고, 직접 만든 예측 모델은 비교용으로 남긴다(매시간 자동 생성만 끔).
- `/dust/hourly/` forecastItems: `airkorea_forecast.build_hourly_forecast_items` — 앞으로 12시간을 그날 PM10 예보 등급 대표값(좋음 15·보통 55·나쁨 115·매우나쁨 180, 앱 기준 30/80/150과 같은 등급)으로 채운다. 항목에 `grade`, `source: airkorea_forecast`, `announcedAt`. predictionModel.name = `airkorea_forecast_grade`. 같은 날은 같은 값(예보가 하루 단위). 로컬 실데이터 호출로 확인(10/11 좋음 → 15).
- 미세먼지 나쁨 푸시(`dust_spike_notifications`): 지금 측정값 나쁨 → "지금 미세먼지 나쁨(PM10 N)", 아니면 오늘 에어코리아 예보 나쁨 이상 → "오늘 미세먼지 예보가 나쁨이에요". "오후 N시부터"는 없어짐.
- 옷차림 서버(`services/outfit/data_provider.py`): 측정값 없는 미래 일정은 그날 예보 등급 대표값.
- 남김: HourlyDustPrediction, `_build_hourly_dust_forecast`, `_store_hourly_dust_predictions`, 생성·학습·평가·데이터셋 명령. 지움: API로 저장 예측을 내보내던 도우미 4개(노션 지운 코드 보관소). `collect_hourly.bat`에서 생성 단계 제거(주석으로 수동 실행 안내). 운영 systemd timer에도 같은 단계가 있으면 빼야 함.
- 테스트: 백엔드 90건(나쁨 푸시 3건 갱신, 에어코리아 시간별 2건 추가).

## 65. 2026-10-11 서버 안내문(푸시) 정확도 개선 (Claude)

- `a13c0eb`.
- **아침 날씨 알림** (`weather_morning_notifications.build_weather_morning_message(region, points, events) -> (title, body)`)
  - 예전 문제: 처음~마지막 비 시간을 한 범위로 부풀림, 눈과 영하를 "기온이 낮거나 눈이 올 수 있어요"로 섞음, 우선순위로 위험 하나만 표시, 강풍·천둥·더위에 시간·값 없음, 지난 시간 포함, 일정은 시간만 나열, 오늘인데 "10월 11일에는".
  - 지금: 1줄 위험(비 `hour_blocks_text`로 떨어진 시간대 분리 + 최대 강수확률 / 눈 / 천둥·번개 / 강한 바람 + 최대 m/s, 없으면 "비·눈 예보 없음"), 2줄 "기온 L~H° (· 일교차 N°) (기상청 예보)", 3줄 "일정 09:00, 15:30 · 15:30 일정 때 비", 4줄 "챙길 것: 우산 · 바람막이 …"(천둥이면 실내 안내). 제목 "오늘 {지역} 날씨"(+ " · 일정 N개").
  - 오늘 보낼 때 `weather_points_for_region(..., from_time=now)`로 지금 이후 시간만. 비 판정에 PTY 2(비/눈) 포함, 눈은 `_is_snow`(영하는 기온으로 따로).
- **미세먼지 나쁨 알림** (`dust_spike_notifications.build_dust_spike_message(region, sido, station_name, measurement, forecast)`)
  - PM2.5도 확인(나쁨 >35, 매우나쁨 >75). 측정값이면 제목 "{지역} 미세먼지/초미세먼지/미세먼지·초미세먼지 나쁨", 본문 "지금 미세먼지(PM10) 95㎍/㎥ '나쁨'이에요(강남구 측정소, 10시 측정).".
  - 예보면 제목 "{시도} 미세먼지 예보 '나쁨'", 본문 "에어코리아 예보로 오늘 서울 미세먼지(PM10)가 '나쁨'이에요(10월 10일 5시 발표)." — `airkorea_forecast.forecast_for`가 (등급, 발표 시각) 반환.
  - 앱 설정 설명도 새 기준으로.
- 검증: 백엔드 91건(아침 알림 테스트 7건 새로, 미세먼지 4건 갱신). 로컬 dry-run: "오늘 대신동 날씨 / 비·눈 예보 없음 / 기온 20~26° (기상청 예보)".
- 남은 것: 민감군 모드 기준(30)이 서버 푸시에 아직 반영 안 됨, 초미세먼지 예보(PM25 informCode)는 아직 안 봄.
- `fecfd42` 사용자 요청('TMI 하지 마')으로 푸시 문구를 핵심만: 아침 = 위험+시간대 / 기온 / 날씨 겹치는 일정만 / 챙길 것. 미세먼지 = 지금 또는 오늘 예보 등급 + 마스크(수치·측정소·발표 시각 제외, PM2.5 확인 유지).

## 66. 2026-10-11 캘린더 주·월·년 보기 (Claude)
- `bd305db` 캘린더 위에 `주 · 월 · 년` 탭 추가(밑줄 탭, 기본 월).
- 주: 고른 날짜가 있는 주(일~토)를 한 줄로, 칸이 길어 일정 줄 최대 12개. 화살표·스와이프로 7일씩 이동, 제목 "2026년 10월 11~17일"(달이 걸치면 "9월 27일 ~ 10월 3일").
- 년: 12달 미니 달력(3×4), 일정 있는 날 점, 오늘·이번 달 강조. 달을 누르면 그 달 월 보기로.
- 파일: `CalendarYearGrid.tsx`(새), `CalendarPanel.tsx`(viewMode), `calendarUtils.ts`(addDays/startOfWeek/buildWeekCells/weekLabel), 테스트 `calendarWeek.test.mjs` 2건. 보기 모드는 저장 안 함(앱 다시 열면 월).
- `9dc81c0` 년 보기를 주·월과 같은 디자인으로: 같은 흰 칸·가는 선(3×4), 이번 달 칸은 고른 날처럼 연한 강조색, 토요일 파란 숫자. 넘김 애니메이션·스와이프는 `useCalendarSlide`(CalendarMonthGrid.tsx)로 주·월·년이 같이 씀.
- `cf380e5` 삼성 캘린더처럼 탭을 `목록 · 일 · 주 · 월 · 년`으로. 목록 = 모든 일정을 날짜별로(오늘 위치에서 열림, 위로 올리면 지난 일정). 일·주 = 0~23시 시간표(24시간 표기), 일정은 시간 길이만큼 블록·겹치면 나란히, 여러 날 일정은 위 막대, 오늘은 빨간 현재 시각 선, 처음엔 지금(또는 그 기간 첫 일정) 1시간 전부터. 일정·날짜를 누르면 기존 날짜 시트가 열림. 파일: `CalendarTimeline.tsx`, `calendarTimelineLayout.ts`(+테스트 2건), `CalendarAgendaList.tsx`, 공통 머리 `CalendarPeriodHeader.tsx`. 한계: 겹치는 묶음은 같은 칸 수로 나눔, 시간표 빈 곳을 길게 눌러 그 시각으로 추가는 아직 없음.
- `b4e5c31` 보기 전환 애니메이션: 목록·일·주·월·년을 바꾸면 페이드+줌(큰 단위로 가면 1.05→1, 작은 단위로 가면 0.95→1, 240ms). 탭 밑줄은 스프링으로 미끄러짐(`CalendarViewTabs.tsx`). 목록 카드는 오늘 근처부터 차례로 살짝 올라오며 나타남. 모두 '동작 줄이기' 설정이면 생략.
- `446f22a` 탭 끌어서 바꾸기: 상단 탭을 누른 채 좌우로 밀면 손가락 아래 탭으로 바로 바뀜(가벼운 진동, 보기 줌·밑줄 애니메이션 그대로). 끄는 동안 밑줄이 굵어지고 선택 글자가 살짝 커짐.
- `1221f4d` 일정 수정 화면을 입력 화면과 같게: 수정할 때도 반복 줄 보임. 한 번짜리 일정에 반복을 걸면 이 일정이 첫 회차가 되고 나머지를 새로 만듦. 이미 반복인 일정은 지금 규칙을 흐리게 잠가서 보여 줌(규칙 변경은 아직 없음). 일 보기 일정 블록 오른쪽 28 띄움(주 보기 2).
- `339d945` '오늘' 자정 갱신: 오늘은 폰 시간 0시 기준인데, 렌더할 때만 계산해서 앱을 켜 둔 채 자정을 넘기면 어제가 오늘로 남았음. `useTodayLabel`(자정 타이머 + 앱 복귀 시)로 바꾸고, 캘린더가 예전 오늘을 보고 있었으면 새 오늘로 옮김.

## 67. 2026-10-11 캘린더 구조 정리 (Claude, 동작 변화 없음)
- `228051e`
  - `CalendarEventEditor.tsx` 1114 → 488줄. 선택기들은 `calendar/editor/`로 분리: `DateTimePicker`, `TimeWheelPicker`, `RepeatSelector`, `ActivityTypeSelector`(+`CalendarActivityInput` 타입), `NotificationLeadSelector`, `pickerShared`.
  - `CalendarPanel.tsx` 503 → 353줄. 보기·기간·오늘로·자정 갱신·보기 줌은 `useCalendarNavigation.ts`, 날짜 시트 열기/닫기/크게는 `useCalendarDaySheet.ts`.
  - 넘김 애니메이션 `useCalendarSlide.ts` 별도 파일(일·주·월·년 공용).
  - `calendarLayout.ts`의 중복 날짜 함수 3개 삭제 → `calendarUtils` 재사용. `CalendarMonthCell` 타입은 `calendarUtils`로(유틸이 컴포넌트를 import하던 역방향 제거).
  - 캘린더 스타일 218개 → `styles/calendarStyles.ts`. `appStyles.ts`가 합쳐서 `styles`로 내보내므로 컴포넌트 import는 그대로.
- 확인: tsc, eslint(경고 12 → 9), `npm test` 45건, 기기에서 주·월·날짜 시트·일정 입력 화면 그대로.
- 남은 구조 과제: `AppContent.tsx` 1026줄.

## 68. 2026-10-11 AppContent 정리 + 전체 구조 점검 (Claude, 동작 변화 없음)
- `c756afa` `AppContent.tsx` 1026 → 592줄. 분리: `home/HomeHeader`(지역명·날씨 칩·기준시각·즐겨찾기 바꾸기), `home/HomeRegionSearchPanel`, `home/RegionLoadingOverlay`(+`useRegionTransition`), `shared/BottomToast`(키보드 높이 추적 포함), `shared/LocationGate`, `shared/ScreenChrome`(ScreenTransition·WeatherBackdrop), `map/useMapTabLifecycle`(지도 탭 나갈 때·5분 초기화·뒤로가기·마커 메시지), `utils/mobileMapUrl`.
- 기기 확인: 홈 머리·즐겨찾기·지역 검색(뒤로가기로 닫힘)·지도 탭 진입/뒤로가기 → 홈.
- 전체 점검에서 남은 구조 과제(우선순위):
  1. 백엔드 `dust/views.py` 3111줄·함수 110개 — HTTP 뷰와 에어코리아/기상청 API 호출·측정소 찾기·예측 보정·저장이 한 파일. `services/`로 나누고 뷰는 얇게.
  2. `components/home/HomePanel.tsx` 1073줄 — 날씨 모션(비·눈·바람·맑음 오버레이) ~400줄, 원형 게이지, 탭 3개가 한 파일.
  3. 계층 섞임: 캘린더 계산 로직(`calendarRiskEvaluator`·`calendarUtils`·`calendarRepeat`…)이 `components/calendar`에, 다른 기능 로직은 `features/`에. 규칙: features=데이터·계산·훅, components=화면.
  4. `theme/appTheme.buildOutingAccentTheme`가 외출지수를 계산하지만 결과(score)를 안 쓰고 항상 같은 파랑을 돌려줌 → 상수로 바꾸고, accentTone/softTone/borderTone을 모든 화면에 props로 내려보내는 것도 정리 가능.
  5. `types/dust.ts` 한 파일에 모든 타입, `utils/dust.ts`에 성격 다른 함수 섞임.
  6. 백엔드 `app/`·`api/` 앱은 로그인·회원 기능을 끈 뒤 모델(데이터)만 남은 상태.
- `ff04bde` (구조 과제 4) 강조색을 상수로: `buildOutingAccentTheme`가 외출지수를 매번 계산하고도 버리고 항상 같은 파랑을 돌려주던 것을 `theme/appTheme.ts` 상수(accentTone/accentSoftTone/accentBorderTone)로. 23개 파일에서 강조색 props 제거(-197/+35줄), `theme/colors.ts` 삭제. tsc·eslint·테스트 통과. 기기 확인은 USB가 끊겨 못 함(색 값은 같음).
