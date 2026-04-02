@echo off
REM Windows: Double-click this file to start Claude Journal
REM It will open in your browser automatically

cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js is required. Please install from https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --omit=dev
)

echo.
echo   Starting Claude Journal...
echo.
node bin\cli.js --open
