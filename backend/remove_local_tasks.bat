@echo off
setlocal

REM Same task names as setup_local_tasks.bat. A missing task only prints an error and is skipped.
schtasks /Delete /TN "WeatherToDo Dust Collection" /F
schtasks /Delete /TN "WeatherToDo Weather Collection" /F
schtasks /Delete /TN "WeatherToDo Morning Notifications" /F
schtasks /Delete /TN "WeatherToDo Hourly Collection" /F

echo WeatherToDo scheduled tasks were removed.
