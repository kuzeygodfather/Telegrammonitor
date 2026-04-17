@echo off
echo ============================================
echo   Telegram Monitor Panel - Baslatiliyor
echo ============================================
echo.

REM Session dosyasi var mi kontrol et
if not exist "%~dp0session.session" (
    echo [!] Session dosyasi bulunamadi - Kurulum modu baslatiliyor...
    echo [!] Panelden kurulumu tamamlayin: http://localhost:3000/setup
    echo.
    echo [1/2] Kurulum sunucusu baslatiliyor (port 8000)...
    start "TG Monitor - Setup" cmd /k "cd /d %~dp0backend && py setup_server.py"
) else (
    echo [1/2] Backend baslatiliyor (port 8000)...
    start "TG Monitor - Backend" cmd /k "cd /d %~dp0backend && py main.py"
)

echo [2/2] Frontend baslatiliyor (port 3000)...
start "TG Monitor - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   Panel:   http://localhost:3000
echo   Kurulum: http://localhost:3000/setup
echo   API:     http://localhost:8000
echo ============================================
echo.
pause
