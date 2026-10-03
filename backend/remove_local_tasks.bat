@echo off
setlocal

schtasks /Delete /TN "WeatherToDo Hourly Collection" /F
schtasks /Delete /TN "WeatherToDo Morning Notifications" /F

echo WeatherToDo scheduled tasks were removed.
