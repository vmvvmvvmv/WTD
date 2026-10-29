#!/usr/bin/env bash
# 매일 07:00 아침 날씨 알림. 보내기 직전에 날씨를 한 번 더 모은다(send_weather_morning_notifications.bat과 같음).
# 하루 한 번 도는 김에 보유 기간(30일)이 지난 기록도 지운다(개인정보 처리방침 3번).
cd "$(dirname "$0")/.." || exit 1
# 매시 수집(collect_hourly.sh)과 날씨 수집이 겹치지 않게 같은 잠금을 쓴다(서버가 다시 켜져 타이머가 한꺼번에 돌 때 등).
exec 9>/tmp/weathertodo-collect.lock
flock 9
PY=venv/bin/python
"$PY" manage.py collect_realtime_weather --workers 8 --forecast-hours 96 || echo "weather collect failed, sending with stored data"
# 공휴일(올해·내년). 임시공휴일은 발표가 늦어 매일 다시 받는다.
"$PY" manage.py collect_holidays || echo "holiday collect failed"
"$PY" manage.py purge_old_records || echo "purge failed"
exec "$PY" manage.py send_dust_notifications
