@echo off
setlocal
cd /d "%~dp0"

set "OLD_HOURLY_TASK=WeatherToDo Hourly Collection"
set "DUST_TASK=WeatherToDo Dust Collection"
set "WEATHER_TASK=WeatherToDo Weather Collection"
set "MORNING_TASK=WeatherToDo Morning Notifications"
set "HOURLY_SCRIPT=%~dp0collect_hourly.bat"
set "MORNING_SCRIPT=%~dp0send_weather_morning_notifications.bat"

REM Dust at :25 (AirKorea fills the hour between :15 and :30), weather at :45 (KMA ultra-short forecast after :45).
schtasks /Delete /TN "%OLD_HOURLY_TASK%" /F >nul 2>&1
schtasks /Create /TN "%DUST_TASK%" /TR "\"%HOURLY_SCRIPT%\" dust" /SC HOURLY /MO 1 /ST 00:25 /F
if errorlevel 1 goto :failed
schtasks /Create /TN "%WEATHER_TASK%" /TR "\"%HOURLY_SCRIPT%\" weather" /SC HOURLY /MO 1 /ST 00:45 /F
if errorlevel 1 goto :failed

schtasks /Create /TN "%MORNING_TASK%" /TR "\"%MORNING_SCRIPT%\"" /SC DAILY /ST 07:00 /F
if errorlevel 1 goto :failed

REM Keep local data collection running on laptops and catch up after sleep.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew; Set-ScheduledTask -TaskName '%DUST_TASK%' -Settings $settings | Out-Null; Set-ScheduledTask -TaskName '%WEATHER_TASK%' -Settings $settings | Out-Null; Set-ScheduledTask -TaskName '%MORNING_TASK%' -Settings $settings | Out-Null"
if errorlevel 1 goto :failed

echo Scheduled tasks were created.
echo - %DUST_TASK%: every hour at :25
echo - %WEATHER_TASK%: every hour at :45
echo - %MORNING_TASK%: every day at 07:00
echo Run collect_hourly.bat once now to populate the local database.
exit /b 0

:failed
echo Failed to create scheduled tasks. Try running this file as Administrator.
exit /b 1
