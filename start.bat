@echo off
REM ── CIRCUIT AI server launcher ───────────────────────────────
REM Double-click this file to start the OpenAI opponent server.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Get the LTS installer from https://nodejs.org
  echo  install it, then double-click this file again.
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo Installing dependencies the first time, please wait...
  call npm install
)

echo.
echo  Starting CIRCUIT AI server...
echo  When you see "CIRCUIT AI server on http://localhost:8787",
echo  open that address in your browser and pick "OpenAI AI" for Player 2.
echo.
node server.js
pause
