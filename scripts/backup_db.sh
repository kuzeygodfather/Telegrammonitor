#!/bin/bash
# Supabase Management API ile DB SQL dump al ve gunluk arsivle.
# Cron'dan gunde bir cagrilir. 14 gun saklanir.

set -uo pipefail

BACKUP_DIR="/var/backups/tg-monitor"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

ENV_FILE="/opt/telegram-monitor/.env"
PAT=$(grep "^SUPABASE_PAT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
if [ -z "$PAT" ]; then
    PAT="${SUPABASE_PAT:-}"
fi
PROJECT_REF="baeinghtjwxrubrenzxx"

DATE=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/tgmon_${DATE}.sql.gz"

# Plan A: Supabase Management API uzerinden tablo bazli JSON dump
# (Yedekleme icin yeterli; tam SQL pg_dump yerine kullanilabilir)
SERVICE_KEY=$(grep "^SUPABASE_SERVICE_KEY=" "$ENV_FILE" | cut -d= -f2-)
SUPABASE_URL=$(grep "^SUPABASE_URL=" "$ENV_FILE" | cut -d= -f2-)

if [ -z "$SERVICE_KEY" ] || [ -z "$SUPABASE_URL" ]; then
    echo "[$(date)] ERROR: Supabase credentials missing in .env"
    exit 1
fi

TABLES=(users user_sessions audit_logs messages topics alerts keywords groups
        analyses replies notification_prefs auto_reply_settings pending_mentions
        personnel_reports push_subscriptions reply_suggestions shift_periods
        shifts staff style_profiles style_samples ai_usage)

DUMP_DIR=$(mktemp -d)
trap "rm -rf $DUMP_DIR" EXIT

for t in "${TABLES[@]}"; do
    OFFSET=0
    PAGE=1000
    > "$DUMP_DIR/$t.json"
    while true; do
        RESP=$(curl -sS "${SUPABASE_URL}/rest/v1/${t}?select=*&offset=${OFFSET}&limit=${PAGE}" \
            -H "apikey: $SERVICE_KEY" \
            -H "Authorization: Bearer $SERVICE_KEY" \
            --max-time 60)
        if [ -z "$RESP" ] || [ "$RESP" = "[]" ]; then
            break
        fi
        echo "$RESP" >> "$DUMP_DIR/$t.json"
        # Eger 1000'den az kayit donduyse bitir
        COUNT=$(echo "$RESP" | python3 -c "import sys,json
try: print(len(json.loads(sys.stdin.read())))
except: print(0)" 2>/dev/null || echo 0)
        if [ "$COUNT" -lt "$PAGE" ]; then
            break
        fi
        OFFSET=$((OFFSET + PAGE))
    done
    SIZE=$(wc -c < "$DUMP_DIR/$t.json")
    if [ "$SIZE" -lt 5 ]; then
        rm -f "$DUMP_DIR/$t.json"
    fi
done

# Tek tarball + gzip
tar -czf "$OUT" -C "$DUMP_DIR" .

if [ -f "$OUT" ]; then
    SIZE=$(du -h "$OUT" | cut -f1)
    echo "[$(date)] Backup created: $OUT ($SIZE)"

    # 14 gunden eski yedekleri sil
    find "$BACKUP_DIR" -name "tgmon_*.sql.gz" -mtime +14 -delete
else
    echo "[$(date)] ERROR: Backup file not created"
    exit 1
fi
