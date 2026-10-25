#!/usr/bin/env bash
# 시간마다 도는 수집 작업. Windows의 collect_hourly.bat과 같은 순서로 실행한다.
#   collect_hourly.sh dust     매시 25분: 미세먼지(에어코리아가 정시 값을 15~30분 사이에 채운다), 급등 알림, 기상특보 알림
#   collect_hourly.sh weather  매시 45분: 날씨(기상청 초단기예보는 매시 45분 이후 발표), 중기예보, 7시 전 일정 날씨 알림, 기상특보 알림
# 기상특보 알림은 두 번 다 돌려 30분마다 확인한다(같은 특보는 24시간에 한 번만 보냄).
#   collect_hourly.sh          둘 다(처음 DB를 채울 때)
# 한 단계가 실패해도 다음 단계는 계속 돌리고, 마지막에 실패가 있었으면 0이 아닌 값으로 끝낸다(journalctl에 남음).
cd "$(dirname "$0")/.." || exit 1
# dust·weather 수집이 겹치면(서버가 다시 켜져 놓친 실행을 한꺼번에 따라잡을 때 등) 특보·급등 알림이 두 번 갈 수 있다.
# 잠금을 잡아 한쪽이 끝날 때까지 다른 쪽은 기다리게 한다.
exec 9>/tmp/weathertodo-collect.lock
flock 9
PY=venv/bin/python
part="${1:-all}"
status=0
run() { "$PY" manage.py "$@" || { echo "failed: $*"; status=1; }; }
if [ "$part" = dust ] || [ "$part" = all ]; then
  run collect_realtime_dust --spike-retry-delay 60
  run send_dust_spike_notifications
  run send_weather_warning_notifications
fi
if [ "$part" = weather ] || [ "$part" = all ]; then
  run collect_realtime_weather --workers 8 --forecast-hours 96
  run collect_midterm_weather
  run check_data_freshness --max-dust-age-hours 3 --max-weather-age-hours 6
  run send_early_event_weather_notifications
  run send_weather_warning_notifications
fi
# 15분 넘게 지난 푸시의 전달 영수증 확인. 앱이 지워진 기기는 끄고, 전달 실패가 있으면 실패로 끝낸다.
run check_push_receipts
exit $status
