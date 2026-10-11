# 포트폴리오 그림 만들기

Notion 포트폴리오(WeatherToDo)에 들어간 그림의 원본과 만드는 스크립트.

| 폴더 | 내용 |
|---|---|
| `shots/` | 실기기 캡처 원본 (720×1560 축소본 포함). 영상은 Notion에만 있음 |
| `scripts/` | 그림 만드는 스크립트 (Python + Pillow, 글꼴은 Windows Noto Sans KR) |
| `images/` | 포트폴리오에 올라간 결과 그림 |

## 다시 만들기 (이 폴더에서)

```bash
python scripts/band.py images                # 맨 위 파란 띠
python scripts/overview.py shots images      # 01 한눈에 보기
python scripts/arch2.py shots images         # 02 구조 (결과 파일 arch2.png → Notion엔 arch_simple.png)
python scripts/annotate.py shots images      # 04·05 설명 그림 (옷차림·홈·지도)
```

숫자가 바뀌면 `annotate.py`의 글자를 고치고 다시 만든 뒤 Notion 그림을 바꿔야 함.
측정 숫자의 원본은 `backend/tools/results/` (만드는 스크립트는 `backend/tools/measure_latency.py`).

## Notion에 올리기

`scripts/notion_upload.sh <file_upload_id> <토큰> <파일> <mime>`
id와 토큰은 Notion MCP의 `notion-create-file-upload`가 돌려주는 값. 토큰은 파일에 적지 않음.

## 주의

- 캡처에 개인 일정 주소가 보이면 흐리게 처리한 뒤 넣기 (`calendar_list_clean.png`는 처리된 것).
- 지도 캡처(`map_full_s.png`)는 기온 모드라 기온 값 없는 측정소가 회색으로 보임. 미세먼지 모드로 다시 찍을 예정.
