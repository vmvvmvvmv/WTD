@echo off
setlocal

cd /d C:\Users\goodd\Documents\GitHub\Dust-health-AI\backend

REM Use the project virtualenv when it exists. Fall back to python on PATH.
set PYTHON_CMD=python
if exist "venv\Scripts\python.exe" set PYTHON_CMD=venv\Scripts\python.exe

echo ================================================== >> weather_morning_notifications.log
echo [%date% %time%] weather morning notification job start >> weather_morning_notifications.log

REM Refresh short-term weather first so the push uses the latest available forecast.
echo [%date% %time%] collect_realtime_weather start >> weather_morning_notifications.log
%PYTHON_CMD% manage.py collect_realtime_weather --workers 8 --forecast-hours 72 >> weather_morning_notifications.log 2>&1

REM Send server-side morning weather notifications. Add --dry-run when testing manually.
echo [%date% %time%] send_dust_notifications start >> weather_morning_notifications.log
%PYTHON_CMD% manage.py send_dust_notifications %* >> weather_morning_notifications.log 2>&1

echo [%date% %time%] weather morning notification job done >> weather_morning_notifications.log
echo. >> weather_morning_notifications.log

endlocal
