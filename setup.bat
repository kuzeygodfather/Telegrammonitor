@echo off
echo ============================================
echo   Telegram Monitor Panel - Kurulum
echo ============================================
echo.

echo [1/3] Python bagimliliklar yukleniyor...
cd /d %~dp0backend
pip install -r requirements.txt
echo.

echo [2/3] Node.js bagimliliklar yukleniyor...
cd /d %~dp0frontend
call npm install
echo.

echo [3/3] .env dosyasi kontrol ediliyor...
cd /d %~dp0
if not exist .env (
    copy .env.example .env
    echo .env dosyasi olusturuldu! Lutfen icini doldurun.
    echo Gerekli bilgiler:
    echo   - TELEGRAM_API_ID ve TELEGRAM_API_HASH: https://my.telegram.org
    echo   - TELEGRAM_BOT_TOKEN: @BotFather'dan alinir
    echo   - TELEGRAM_ADMIN_CHAT_ID: Kendi Telegram ID'niz
    echo   - ANTHROPIC_API_KEY: https://console.anthropic.com
) else (
    echo .env dosyasi zaten mevcut.
)
echo.

echo ============================================
echo   Kurulum tamamlandi!
echo   .env dosyasini doldurun ve start.bat ile baslatın.
echo ============================================
pause
