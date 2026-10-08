@echo off
setlocal
cd /d "%~dp0"

set "PYTHON_EXE=%WTD_PYTHON%"
if not defined PYTHON_EXE if exist "%~dp0venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not defined PYTHON_EXE set "PYTHON_EXE=python"

"%PYTHON_EXE%" --version >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Set WTD_PYTHON to your backend venv python.exe.
  exit /b 1
)

echo Checking local weather and dust data...
"%PYTHON_EXE%" manage.py check_data_freshness --max-dust-age-hours 3 --max-weather-age-hours 6
if errorlevel 1 (
  echo.
  echo WARNING: Local data is stale or incomplete.
  echo Run collect_hourly.bat in another window before testing live data.
  echo.
)

set "ADB_EXE=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if not exist "%ADB_EXE%" set "ADB_EXE=adb"
"%ADB_EXE%" reverse tcp:8001 tcp:8001 >nul 2>&1
if not errorlevel 1 echo Android USB port forwarding is ready.

echo Backend: http://localhost:8001
echo Keep this window open while using the app.
"%PYTHON_EXE%" manage.py runserver 127.0.0.1:8001
