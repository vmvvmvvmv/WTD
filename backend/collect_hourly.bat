@echo off
setlocal

cd /d "%~dp0"
set "PYTHON_EXE=%WTD_PYTHON%"
if not defined PYTHON_EXE if exist "%~dp0venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

set "LOG_FILE=%~dp0collect_hourly.log"
set "CURRENT_STEP=python_check"
set "FAILED_STEPS="

echo ================================================== >> "%LOG_FILE%"
echo [%date% %time%] hourly collection start >> "%LOG_FILE%"

"%PYTHON_EXE%" --version >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :python_missing

REM One failed step (e.g. some sidos failed) must not skip the rest. Same as deploy/collect_hourly.sh.
set "CURRENT_STEP=collect_realtime_dust"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_realtime_dust --spike-retry-delay 60 >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :mark_failed

set "CURRENT_STEP=collect_realtime_weather"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_realtime_weather --workers 8 --forecast-hours 72 >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :mark_failed

REM App hourly PM10 forecast now comes from the AirKorea forecast (2026-10-10).
REM The in-house prediction model is kept for comparison only; run manage.py generate_hourly_dust_predictions manually when needed.

set "CURRENT_STEP=collect_midterm_weather"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_midterm_weather >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :mark_failed

set "CURRENT_STEP=check_data_freshness"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py check_data_freshness --max-dust-age-hours 3 --max-weather-age-hours 6 >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :mark_failed

REM Push once a day when today's PM10 turns bad. Uses the data collected above.
set "CURRENT_STEP=send_dust_spike_notifications"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py send_dust_spike_notifications >> "%LOG_FILE%" 2>&1
if errorlevel 1 call :mark_failed

if defined FAILED_STEPS goto :failed
echo [%date% %time%] hourly collection success >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
exit /b 0

:mark_failed
set "FAILED_STEPS=%FAILED_STEPS% %CURRENT_STEP%"
echo [%date% %time%] %CURRENT_STEP% FAILED >> "%LOG_FILE%"
exit /b 0

:python_missing
set "FAILED_STEPS=%CURRENT_STEP%"

:failed
echo [%date% %time%] hourly collection FAILED at:%FAILED_STEPS% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Collection failed at:%FAILED_STEPS%. Check "%LOG_FILE%".
exit /b 1
