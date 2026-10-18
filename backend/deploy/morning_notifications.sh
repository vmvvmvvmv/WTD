#!/usr/bin/env bash
# 매일 07:00 아침 날씨 알림. 보내기 직전에 날씨를 한 번 더 모은다(send_weather_morning_notifications.bat과 같음).
# 하루 한 번 도는 김에 보유 기간(30일)이 지난 기록도 지운다(개인정보 처리방침 3번).
cd "$(dirname "$0")/.." || exit 1
PY=venv/bin/python
"$PY" manage.py collect_realtime_weather --workers 8 --forecast-hours 72 || echo "weather collect failed, sending with stored data"
"$PY" manage.py purge_old_records || echo "purge failed"
exec "$PY" manage.py send_dust_notifications
