@echo off
setlocal

cd /d "%~dp0"

for /f "usebackq tokens=*" %%I in (`powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.InterfaceAlias -match 'Wi-Fi|Wireless|Ethernet' } | Select-Object -First 1 -ExpandProperty IPAddress"`) do set PC_IP=%%I

if "%PC_IP%"=="" (
  echo PC IPv4 address was not found.
  echo Check that this PC is connected to the same Wi-Fi as your phone.
  pause
  exit /b 1
)

set DJANGO_DEBUG=True
set ALLOWED_HOSTS=localhost,127.0.0.1,%PC_IP%
set CORS_EXTRA_ORIGIN=http://%PC_IP%:8001
set CSRF_EXTRA_ORIGIN=http://%PC_IP%:8001

echo.
echo WeatherToDo backend is starting for mobile testing.
echo Phone API URL: http://%PC_IP%:8001
echo.
echo Keep this window open while using the app.
echo If the phone cannot connect, allow Python/Django through Windows Firewall.
echo.

python manage.py runserver 0.0.0.0:8001

pause
