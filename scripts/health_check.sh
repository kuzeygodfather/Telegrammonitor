#!/bin/bash
# TG Monitor health check
# Cron'dan dakikada bir cagrilir. Servis duser/endpoint cevap vermezse Telegram bot'a alert atar.
# Spam onlemek icin: ayni hata 30 dk icinde tekrar bildirilmez.

set -uo pipefail

ALERT_DIR="/var/lib/tg-monitor"
mkdir -p "$ALERT_DIR"

# .env'den BOT TOKEN ve CHAT ID
ENV_FILE="/opt/telegram-monitor/.env"
BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d ' ')
CHAT_ID=$(grep "^TELEGRAM_ADMIN_CHAT_ID=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d ' ')

# Kayit dosyasi: son alert zamanlari (anti-spam)
STATE="$ALERT_DIR/last_alert"
touch "$STATE"

# Bir hata anahtari icin: 30 dakika icinde tekrar gonderme
should_alert() {
    local key="$1"
    local now=$(date +%s)
    local last=$(grep "^$key=" "$STATE" 2>/dev/null | cut -d= -f2)
    if [ -z "$last" ]; then
        return 0
    fi
    local diff=$(( now - last ))
    if [ "$diff" -ge 1800 ]; then
        return 0
    fi
    return 1
}

mark_alerted() {
    local key="$1"
    local now=$(date +%s)
    grep -v "^$key=" "$STATE" > "$STATE.tmp" 2>/dev/null || true
    echo "$key=$now" >> "$STATE.tmp"
    mv "$STATE.tmp" "$STATE"
}

clear_alert() {
    local key="$1"
    grep -v "^$key=" "$STATE" > "$STATE.tmp" 2>/dev/null || true
    mv "$STATE.tmp" "$STATE" 2>/dev/null || true
}

send_telegram() {
    local msg="$1"
    if [ -z "$BOT_TOKEN" ] || [ -z "$CHAT_ID" ]; then
        echo "[$(date)] WARN: Telegram bot config yok"
        return
    fi
    curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        --data-urlencode "chat_id=${CHAT_ID}" \
        --data-urlencode "text=${msg}" \
        --data-urlencode "parse_mode=Markdown" \
        --max-time 10 -o /dev/null
}

CHECKS_FAILED=()

# 1) tg-setup service
if ! systemctl is-active --quiet tg-setup; then
    CHECKS_FAILED+=("tg-setup down")
    if should_alert "tg-setup"; then
        send_telegram "🚨 *TG Monitor* — *tg-setup* servisi DUSTU. (\`systemctl status tg-setup\`)"
        mark_alerted "tg-setup"
    fi
else
    clear_alert "tg-setup"
fi

# 2) tg-backend service
if ! systemctl is-active --quiet tg-backend; then
    CHECKS_FAILED+=("tg-backend down")
    if should_alert "tg-backend"; then
        send_telegram "🚨 *TG Monitor* — *tg-backend* servisi DUSTU. Telegram dinleme calismiyor."
        mark_alerted "tg-backend"
    fi
else
    clear_alert "tg-backend"
fi

# 3) Backend HTTP endpoint
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    "http://localhost:8001/api/auth/turnstile-config" \
    --max-time 8 2>/dev/null)
if [ "$HTTP_CODE" != "200" ]; then
    CHECKS_FAILED+=("backend http $HTTP_CODE")
    if should_alert "backend-http"; then
        send_telegram "🚨 *TG Monitor* — Backend HTTP endpoint cevap vermiyor (status: \`${HTTP_CODE}\`)."
        mark_alerted "backend-http"
    fi
else
    clear_alert "backend-http"
fi

# 4) Public site (Apache + Cloudflare)
PUBLIC_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    "https://monitor.systemtest.store/api/auth/turnstile-config" \
    --max-time 12 2>/dev/null)
if [ "$PUBLIC_CODE" != "200" ]; then
    CHECKS_FAILED+=("public http $PUBLIC_CODE")
    if should_alert "public-http"; then
        send_telegram "🚨 *TG Monitor* — Public site cevap vermiyor (status: \`${PUBLIC_CODE}\`). Apache/SSL/Cloudflare problem olabilir."
        mark_alerted "public-http"
    fi
else
    clear_alert "public-http"
fi

# 5) Disk doluluk (95% uzeri kritik)
DISK_PCT=$(df / | awk 'NR==2 {gsub("%","",$5); print $5}')
if [ "${DISK_PCT:-0}" -ge 95 ]; then
    CHECKS_FAILED+=("disk %${DISK_PCT}")
    if should_alert "disk-full"; then
        send_telegram "⚠️ *TG Monitor* — Sunucu diski *%${DISK_PCT}* dolu. Hemen mudahale gerek."
        mark_alerted "disk-full"
    fi
elif [ "${DISK_PCT:-0}" -ge 85 ]; then
    if should_alert "disk-warn"; then
        send_telegram "ℹ️ *TG Monitor* — Disk %${DISK_PCT} dolu. Yakin gozlem."
        mark_alerted "disk-warn"
    fi
else
    clear_alert "disk-full"
    clear_alert "disk-warn"
fi

# 6) Log: dakikada bir
TS=$(date '+%Y-%m-%d %H:%M:%S')
if [ ${#CHECKS_FAILED[@]} -eq 0 ]; then
    echo "[$TS] OK — all checks passed" >> /var/log/tg-monitor/healthcheck.log 2>/dev/null
else
    echo "[$TS] FAIL — ${CHECKS_FAILED[*]}" >> /var/log/tg-monitor/healthcheck.log 2>/dev/null
fi

exit 0
