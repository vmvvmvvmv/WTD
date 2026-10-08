@echo off
setlocal

cd /d "%~dp0"
set "PYTHON_EXE=%WTD_PYTHON%"
if not defined PYTHON_EXE if exist "%~dp0venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

set "LOG_FILE=%~dp0collect_hourly.log"
set "CURRENT_STEP=python_check"

echo ================================================== >> "%LOG_FILE%"
echo [%date% %time%] hourly collection start >> "%LOG_FILE%"

"%PYTHON_EXE%" --version >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

set "CURRENT_STEP=collect_realtime_dust"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_realtime_dust --spike-retry-delay 60 >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

set "CURRENT_STEP=collect_realtime_weather"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_realtime_weather --workers 8 --forecast-hours 72 >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

set "CURRENT_STEP=generate_hourly_dust_predictions"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py generate_hourly_dust_predictions >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

set "CURRENT_STEP=collect_midterm_weather"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py collect_midterm_weather >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

set "CURRENT_STEP=check_data_freshness"
echo [%date% %time%] %CURRENT_STEP% start >> "%LOG_FILE%"
"%PYTHON_EXE%" manage.py check_data_freshness --max-dust-age-hours 3 --max-weather-age-hours 6 >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :failed

echo [%date% %time%] hourly collection success >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
exit /b 0

:failed
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] hourly collection FAILED at %CURRENT_STEP% with exit code %EXIT_CODE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Collection failed at %CURRENT_STEP%. Check "%LOG_FILE%".
exit /b %EXIT_CODE%
