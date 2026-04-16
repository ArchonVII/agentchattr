@echo off
setlocal

cd /d "%~dp0..\electron" || exit /b 1

call npm run build
if errorlevel 1 (
  echo.
  echo AgentChattr desktop build failed.
  echo Press any key to close this window.
  pause >nul
  exit /b %errorlevel%
)

for /f "usebackq delims=" %%P in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = 'C:\\AI\\JAgentchattr\\electron\\node_modules\\electron\\dist\\electron.exe'; $arg = 'C:\\AI\\JAgentchattr\\electron'; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq $target -and $_.CommandLine -like ('*' + $arg + '*') } | Select-Object -ExpandProperty ProcessId"`) do (
  taskkill /PID %%P /T /F >nul 2>nul
)

timeout /t 1 /nobreak >nul
start "" ".\node_modules\electron\dist\electron.exe" .
exit /b 0
