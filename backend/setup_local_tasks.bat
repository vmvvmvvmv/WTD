@echo off
setlocal
cd /d "%~dp0"

set "HOURLY_TASK=WeatherToDo Hourly Collection"
set "MORNING_TASK=WeatherToDo Morning Notifications"
set "HOURLY_SCRIPT=%~dp0collect_hourly.bat"
set "MORNING_SCRIPT=%~dp0send_weather_morning_notifications.bat"

schtasks /Create /TN "%HOURLY_TASK%" /TR "\"%HOURLY_SCRIPT%\"" /SC HOURLY /MO 1 /ST 00:05 /F
if errorlevel 1 goto :failed

schtasks /Create /TN "%MORNING_TASK%" /TR "\"%MORNING_SCRIPT%\"" /SC DAILY /ST 07:00 /F
if errorlevel 1 goto :failed

echo Scheduled tasks were created.
echo - %HOURLY_TASK%: every hour
echo - %MORNING_TASK%: every day at 07:00
echo Run collect_hourly.bat once now to populate the local database.
exit /b 0

:failed
echo Failed to create scheduled tasks. Try running this file as Administrator.
exit /b 1
