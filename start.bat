@echo off
echo ============================================
echo   Telegram Monitor Panel - Baslatiliyor
echo ============================================
echo.

REM Backend'i baslat
echo [1/2] Backend baslatiliyor (port 8000)...
start "TG Monitor - Backend" cmd /k "cd /d %~dp0backend && python main.py"

REM Frontend'i baslat
echo [2/2] Frontend baslatiliyor (port 3000)...
start "TG Monitor - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo   API Docs: http://localhost:8000/docs
echo ============================================
echo.
echo Her iki pencereyi de kapatarak durdurun.
pause
