@echo off
setlocal

cd /d C:\Users\goodd\Documents\GitHub\Dust-health-AI\backend

echo ================================================== >> collect_hourly.log
echo [%date% %time%] hourly collection start >> collect_hourly.log

echo [%date% %time%] collect_realtime_dust start >> collect_hourly.log
python manage.py collect_realtime_dust >> collect_hourly.log 2>&1

echo [%date% %time%] collect_realtime_weather start >> collect_hourly.log
python manage.py collect_realtime_weather --workers 8 --forecast-hours 72 >> collect_hourly.log 2>&1

echo [%date% %time%] generate_hourly_dust_predictions start >> collect_hourly.log
python manage.py generate_hourly_dust_predictions >> collect_hourly.log 2>&1

echo [%date% %time%] hourly collection done >> collect_hourly.log
echo. >> collect_hourly.log

echo [%date% %time%] collect_midterm_weather start >> collect_hourly.log
venv\Scripts\python.exe manage.py collect_midterm_weather >> collect_hourly.log 2>&1

endlocal
