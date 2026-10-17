#!/usr/bin/env bash
# 매시 5분에 도는 수집 작업. Windows의 collect_hourly.bat과 같은 순서로 실행한다.
# 한 단계가 실패해도 다음 단계는 계속 돌리고, 마지막에 실패가 있었으면 0이 아닌 값으로 끝낸다(journalctl에 남음).
cd "$(dirname "$0")/.." || exit 1
PY=venv/bin/python
status=0
run() { "$PY" manage.py "$@" || { echo "failed: $*"; status=1; }; }
run collect_realtime_dust --spike-retry-delay 60
run collect_realtime_weather --workers 8 --forecast-hours 72
run collect_midterm_weather
run check_data_freshness --max-dust-age-hours 3 --max-weather-age-hours 6
run send_dust_spike_notifications
exit $status
