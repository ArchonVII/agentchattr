@echo off
REM agentchattr desktop launcher
REM Runs `npm start` in /electron, which triggers `prestart` (esbuild bundle)
REM and then launches the Electron app. The app spawns run.py on port 8300.

cd /d "%~dp0electron"
echo [launcher] building bundles and starting agentchattr desktop...
call npm start
if errorlevel 1 (
    echo.
    echo [launcher] npm start exited with errors. Press any key to close.
    pause >nul
)
