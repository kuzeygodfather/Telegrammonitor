# 📡 TG Monitor

> **Çoklu kullanıcılı, AI destekli Telegram grup izleme ve uyarı sistemi.**
> Telethon + FastAPI + Next.js 16 + Supabase. Multi-tenant, end-to-end encrypted, production-ready.

[![Python](https://img.shields.io/badge/python-3.12-blue)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-async-green)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres+RLS-3ECF8E)](https://supabase.com/)

---

## 🎯 Sistem Ne Yapar?

Birden fazla yöneticinin Telegram gruplarını **kendi hesaplarıyla** dinleyip, mesajları AI ile (Claude / OpenAI / Gemini) analiz eden, anahtar kelime eşleşmelerinde **anlık alert** üreten yönetim paneli.

- 🔐 **Multi-tenant izolasyon** — Her kullanıcı sadece kendi verisini görür (3 katmanlı blok)
- 🤖 **3 AI Provider** — Anthropic Claude, OpenAI, Google Gemini (kullanıcı bazlı, encrypted at-rest)
- 🚨 **Keyword Alert (AI'sız)** — API key olmadan da çalışır
- 🛡️ **Hardened** — bcrypt + Fernet + RLS + CAPTCHA + Rate-Limit + Audit Log
- 🔄 **Self-healing** — Listener crash'lerinde otomatik recovery (exponential backoff)

---

## 📐 Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│              Next.js 16 Frontend (Static Export)                 │
│  /register  /audit  /alerts  /settings  /reports  /personnel    │
│        ↕ fetch + x-session-token (auto-injected)                 │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS / Apache + Cloudflare
        ┌────────────┴───────────────┐
        ↓                            ↓
┌───────────────────┐      ┌──────────────────────┐
│  FastAPI Backend  │      │   Supabase Postgres  │
│  (multi_setup)    │ ←──→ │   + RLS Policies     │
│  Port :8001       │      │   + CASCADE FK       │
│                   │      │   + audit_logs       │
│  - Auth Middleware│      └──────────────────────┘
│  - Rate Limit     │              ↑
│  - Turnstile      │              │ x-session-token header
│  - Audit Logger   │              │ → get_current_user_id() RPC
│  - AI Provider    │              │
└───────────────────┘              │
        ↕                          │
┌───────────────────┐              │
│  Telethon Backend │              │
│  (multi_backend)  │              │
│                   │              │
│  - Per-user listener (supervised)│
│  - Keyword alert (AI-independent)│
│  - AI batch (Gemini/Anthropic/  │
│    OpenAI per-user)              │
│  - Auto-restart on crash         │
└───────────────────┘
```

---

## ✨ Özellikler

### 👥 Kullanıcı Yönetimi
- ✅ Self-register (admin onaylı)
- ✅ bcrypt şifre + auto re-hash (legacy SHA-256 desteği)
- ✅ TOTP 2FA (Google Authenticator)
- ✅ Cloudflare Turnstile CAPTCHA
- ✅ Rate limit (login 10/dk, register 5/dk)
- ✅ Cihaz/oturum yönetimi
- ✅ Self-delete (şifre doğrulamalı)
- ✅ Admin: kullanıcı onayla / sil / şifre sıfırla / yetki ver

### 🤖 AI Analiz
- ✅ **3 Provider:** Anthropic, OpenAI, Gemini (kullanıcı bazlı)
- ✅ Provider auto-detect (key prefix: `sk-ant-` / `sk-` / `AIza`)
- ✅ Batch analiz (Haiku-class filter + Sonnet-class deep)
- ✅ Vision desteği (vardiya tablosu resmi parse)
- ✅ Stil öğrenme + akıllı cevap önerisi
- ✅ AI vardiya planı

### 🔔 Alert Sistemi
- ✅ **Keyword alert (AI'sız)** — kredi olmasa bile çalışır
- ✅ AI alert (analyzer batch ile, kategori + urgency)
- ✅ Push notification (Web Push / VAPID)
- ✅ Telegram bot bildirimleri (admin'e yeni kayıt vb.)
- ✅ Audit log (admin paneli)

### 🛡️ Güvenlik
- ✅ **Multi-tenant izolasyon** (3 katman):
  - Frontend: `.eq("user_id", uid)`
  - Backend middleware: query+body `user_id` mismatch → 403
  - DB: RLS policy (`get_current_user_id()` SQL fn)
- ✅ Encryption-at-rest (Fernet) — `api_key`, `totp_secret`
- ✅ HTTPS (Let's Encrypt) + HSTS + CSP + X-Frame headers
- ✅ Server-side login (frontend hash sızıntısı yok)
- ✅ Session revocation + auto-logout
- ✅ CASCADE FK (silme bütünlüğü)
- ✅ Audit log (login/logout/admin/key işlemleri)
- ✅ systemd hardening (sandbox, ProtectSystem=strict)

### ⚙️ Operasyonel
- ✅ Health check + Telegram alert (cron, dakikalık)
- ✅ Günlük DB backup (cron, 14 gün retention)
- ✅ Log rotation + journald cap
- ✅ Self-healing listeners (5–60s exponential backoff)
- ✅ systemd auto-restart

---

## 🚀 Kurulum

### 1) Sunucu Hazırlığı

```bash
sudo apt update
sudo apt install -y python3.12-venv nodejs npm apache2 certbot logrotate
sudo a2enmod ssl rewrite proxy proxy_http headers
```

### 2) Repo Klonla

```bash
sudo mkdir -p /opt/telegram-monitor
sudo chown -R $USER /opt/telegram-monitor
cd /opt/telegram-monitor
git clone https://github.com/kuzeygodfather/Telegrammonitor.git .
```

### 3) Python Backend

```bash
python3.12 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn telethon "supabase>=2.29" anthropic openai google-generativeai \
            bcrypt cryptography slowapi pyotp qrcode pywebpush python-dotenv httpx
```

### 4) Environment

```bash
cp .env.example .env
nano .env   # değerleri doldur (Telegram API, Supabase, Turnstile, vb.)

cp frontend/.env.local.example frontend/.env.local
nano frontend/.env.local
```

**Encryption key üret (.env'e otomatik ekler):**
```bash
python3 -c "from cryptography.fernet import Fernet; print('ENCRYPTION_KEY=' + Fernet.generate_key().decode())" >> .env
```

### 5) Supabase Schema

Supabase SQL Editor'da kritik fonksiyon:

```sql
CREATE OR REPLACE FUNCTION public.get_current_user_id()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v_token TEXT; v_user_id INTEGER;
BEGIN
  v_token := current_setting('request.headers', true)::json->>'x-session-token';
  IF v_token IS NULL OR v_token = '' THEN RETURN NULL; END IF;
  SELECT user_id INTO v_user_id
  FROM public.user_sessions
  WHERE session_token = v_token AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW())
  LIMIT 1;
  RETURN v_user_id;
END $$;
```

Tüm tablolarda RLS aktif edip her CRUD policy'si `user_id = get_current_user_id()` ile yazılır.
20 user-scoped tabloda **ON DELETE CASCADE** FK kurulur.

### 6) Frontend Build

```bash
cd frontend
npm install
npm run build   # static export → out/
```

### 7) systemd Servisleri

`/etc/systemd/system/tg-setup.service`:
```ini
[Unit]
Description=TG Monitor Setup API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/telegram-monitor/backend
ExecStart=/opt/telegram-monitor/venv/bin/python3 multi_setup.py
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/opt/telegram-monitor /var/log/tg-monitor /tmp
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=true
LockPersonality=true
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

`tg-backend.service` benzer (sadece `ExecStart=multi_backend.py` ve `TasksMax=2048`).

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tg-setup tg-backend
```

### 8) Apache Virtual Host

`/etc/apache2/sites-available/telegram-monitor-le-ssl.conf`:
- DocumentRoot: `/opt/telegram-monitor/frontend/out`
- Auth basic (opsiyonel)
- `/api/` proxy → `http://127.0.0.1:8001/api/`
- Security headers: HSTS + CSP + X-Frame-Options:DENY + X-Content-Type-Options + Referrer-Policy + Permissions-Policy

```bash
sudo certbot --apache -d monitor.example.com
```

### 9) İlk Admin Kullanıcı

```python
# python3 yardımıyla bcrypt hash
python3 -c "import sys; sys.path.insert(0,'backend'); from security import hash_password; print(hash_password('YourStrongPassword!'))"
```

Sonra Supabase SQL:
```sql
INSERT INTO users (username, password_hash, is_active, is_admin)
VALUES ('admin', '$2b$12$...your_bcrypt_hash...', true, true);
```

### 10) Health Monitoring + Backup

```bash
sudo cp scripts/health_check.sh /opt/telegram-monitor/scripts/
sudo cp scripts/backup_db.sh /opt/telegram-monitor/scripts/
sudo chmod +x /opt/telegram-monitor/scripts/*.sh

sudo crontab -e
# Ekle:
* * * * * /opt/telegram-monitor/scripts/health_check.sh >/dev/null 2>&1
30 3 * * * /opt/telegram-monitor/scripts/backup_db.sh >> /var/log/tg-monitor/backup.log 2>&1
```

---

## 🗂️ Klasör Yapısı

```
telegram-monitor/
├── backend/
│   ├── multi_setup.py          # FastAPI: auth + admin + AI proxy (port 8001)
│   ├── multi_backend.py        # Telethon listener supervisor (per-user)
│   ├── analyzer.py             # AI batch analyzer
│   ├── ai_provider.py          # Anthropic / OpenAI / Gemini abstraction
│   ├── security.py             # bcrypt + Fernet helpers
│   ├── totp_setup.py           # 2FA (Google Authenticator)
│   ├── notifier.py             # Telegram bot bildirimleri
│   ├── reply_sender.py         # Manuel cevap gönderme
│   ├── prefilter.py            # Bot mesajı tespit
│   ├── config.py
│   └── database.py
│
├── frontend/                    # Next.js 16 (App Router, static export)
│   ├── src/app/
│   │   ├── register/           # Login + Register + 2FA + CAPTCHA
│   │   ├── alerts/             # Topic dashboard (pagination)
│   │   ├── audit/              # Admin audit log paneli
│   │   ├── personnel/          # Personel takip + AI rapor
│   │   ├── reports/            # AI rapor üretici
│   │   ├── settings/           # Admin/user yönetimi + provider seçimi + self-delete
│   │   ├── smart-reply/        # Stil bazlı akıllı cevap
│   │   ├── shifts/             # Vardiya planlama (image vision + AI)
│   │   └── layout.tsx          # Global fetch interceptor (auto x-session-token)
│   └── src/components/
│       ├── Turnstile.tsx       # Cloudflare Turnstile widget
│       ├── ApiKeySetup.tsx     # 3-provider seçici
│       ├── SessionManager.tsx  # Cihaz/oturum yönetimi
│       └── Sidebar.tsx
│
├── scripts/
│   ├── health_check.sh         # Cron - 1 dk (servis düştüyse Telegram alert)
│   ├── backup_db.sh            # Cron - günlük SQL dump
│   └── start_all.sh            # Manuel başlat
│
├── .env.example
├── frontend/.env.local.example
└── README.md
```

---

## 🔌 API Endpoints

Tümü auth gerektirir (whitelist hariç). `x-session-token` header zorunludur.

### Public (auth-less)
| Endpoint | Limit |
|---|---|
| `POST /api/auth/register` | 5/dk + CAPTCHA |
| `POST /api/auth/login` | 10/dk + CAPTCHA |
| `POST /api/auth/login-2fa` | 10/dk |
| `POST /api/auth/logout` | — |
| `GET /api/auth/has-2fa` | — |
| `GET /api/auth/turnstile-config` | — |
| `POST /api/validate-api-key` | 20/dk |
| `GET /api/admin/check-username` | — |

### User
- `GET /api/users/me` — Kendi profil
- `POST /api/users/save-api-key` — AI key kaydet (encrypted)
- `POST /api/users/me/delete` — Hesabı sil (şifre + SIL onayı)
- `GET /api/stats/hourly`
- `GET /api/personnel/list?days=N`
- `POST /api/ai/generate` — Genel AI proxy (multi-provider)
- `POST /api/style/analyze`, `/api/style/generate-reply`
- `POST /api/parse-shift-image` — Vision (3-provider destekli)
- `POST /api/generate-ai-shifts`
- `GET/POST /api/auto-reply/...`
- `GET/POST /api/notification-prefs`
- `POST /api/push-subscribe`, `/api/push-unsubscribe`
- `POST /api/session/revoke`, `/api/session/heartbeat`

### Admin
- `GET /api/admin/users`
- `POST /api/admin/toggle-user`
- `POST /api/admin/activate-user`
- `POST /api/admin/delete-user` (CASCADE)
- `POST /api/admin/reset-password`
- `POST /api/admin/set-phone`
- `POST /api/admin/fetch-groups`
- `GET /api/admin/audit-log?action=&limit=`

### Internal (sadece localhost)
- `POST /api/send-push`

---

## 🔐 Güvenlik Mimarisi

### Auth Flow
```
Login (CAPTCHA + bcrypt verify) → 2FA opsiyonel
   → secrets.token_urlsafe(32) → user_sessions tablosu
   → localStorage('tg_session_token')
   → Her request'te x-session-token header (frontend interceptor)
   → Backend middleware validate → request.state.user_id
   → Supabase RLS get_current_user_id() ← aynı token
```

### Multi-Tenant İzolasyon (3 Katman)

| # | Katman | Mekanizma |
|---|---|---|
| 1 | Frontend | `.eq("user_id", getUserId())` filter |
| 2 | Backend Middleware | Query+Body `user_id` token'la eşleşmek zorunda (admin hariç) → 403 |
| 3 | DB RLS | `user_id = get_current_user_id()` her CRUD policy |

**Sonuç:** Bir kullanıcı `localStorage`'ı manipüle etse bile RLS engeller. Token'ı çalsa bile diğer kullanıcının verisini göremez.

### Encryption-at-Rest
- `users.api_key` ve `users.totp_secret` Fernet (AES-128-CBC + HMAC) ile şifreli
- Format: `enc::<base64-token>`
- ENCRYPTION_KEY .env'de — **asla rotate etme**

### Audit Log
Her kritik olay `audit_logs` tablosuna düşer:
- `login_success` / `login_failed` / `login_blocked` / `login_2fa_*`
- `register` / `logout`
- `api_key_updated`
- `admin_activate_user` / `admin_delete_user` / `admin_reset_password` / `admin_toggle_*`
- `user_self_delete`

---

## 📊 Operasyonel İzleme

### Sağlık Kontrolü
`scripts/health_check.sh` her dakika 5 kontrol yapar:
1. `tg-setup` servisi aktif mi?
2. `tg-backend` servisi aktif mi?
3. Backend HTTP yanıt veriyor mu?
4. Public site Apache → backend yanıtlıyor mu?
5. Disk kullanımı %95 üstünde mi?

Hata durumunda **Telegram bot'a alert** gönderir (anti-spam: aynı hata 30dk içinde tek). Düzeldiğinde otomatik clear.

### Backup
`scripts/backup_db.sh` 22 tablonun JSON dump'ını alır, gzip + tar, `/var/backups/tg-monitor/` içinde 14 gün saklar.

### Log Rotation
- `journald`: max 500MB, en az 2GB free
- `/tmp/multi_*.log`: haftalık, 4 kopya, gzip

---

## 🧪 Test Edilmiş Akışlar

✅ Yeni kullanıcı kaydı → CAPTCHA → admin onay → login + 2FA → AI key girme
✅ Multi-tenant blok (non-admin başkasının verisini göremez — query/body/RLS hepsi blok)
✅ Admin paneli RBAC (non-admin → 403)
✅ Per-user AI key (kullanıcılar farklı Gemini/Claude/OpenAI key'leri kullanır)
✅ Cascade delete (1.5s, 13 tablo + disk session dosyası temizlenir)
✅ Self-healing listener (crash → exponential backoff)
✅ Encryption migration (mevcut plaintext → Fernet)
✅ JWT keys rotate (legacy disable, yeni format aktif)
✅ Audit log endpoint + admin paneli
✅ Health check → Telegram alert
✅ Günlük backup tarball (4MB)

---

## 🛠️ Sık Karşılaşılan Sorunlar

### "Legacy API keys are disabled"
Supabase eski JWT keys disable edilmiş. `.env`'i yeni format `sb_secret_*` ile güncelle.

### "Invalid API key" (Python SDK)
```bash
pip install --upgrade "supabase>=2.29.0"   # yeni format key desteği
```

### Gemini "rate limit / 429"
Free tier'da `gemini-2.5-pro` çok sıkı (2 RPM). `ai_provider.py` default'u `gemini-2.5-flash` (15 RPM).

### RLS boş veriler dönüyor
Frontend `x-session-token` header gönderiyor mu? `localStorage.getItem('tg_session_token')` dolu mu?
- Hard refresh (Ctrl+Shift+R)
- ClientLayout.tsx token yoksa otomatik /register'a yönlendirir

### Servis düştü, otomatik gelmedi
- `systemctl status tg-backend`
- `journalctl -u tg-backend -n 100`
- `Restart=always` zaten var; segfault değilse 10sn'de gelir
- Cron health_check 1dk içinde Telegram'a alert atar

---

## 🔄 Güncellemeler

```bash
cd /opt/telegram-monitor
git pull
cd frontend && npm install && npm run build
sudo systemctl restart tg-setup tg-backend
```

---

## 📜 Lisans

Bu proje kişisel/iç kullanım içindir. Üçüncü tarafa dağıtım için sahibinden izin alın.

---

## 🙏 Teknolojiler

- [Telethon](https://docs.telethon.dev/) — Telegram User Client
- [FastAPI](https://fastapi.tiangolo.com/) — Backend framework
- [Next.js 16](https://nextjs.org/) — Frontend (App Router, Static Export)
- [Supabase](https://supabase.com/) — Postgres + RLS altyapısı
- [Anthropic Claude](https://www.anthropic.com/) / [OpenAI](https://openai.com/) / [Gemini](https://ai.google.dev/) — AI analiz
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) — CAPTCHA
- [bcrypt](https://github.com/pyca/bcrypt) + [cryptography](https://cryptography.io/) — Hashing & Encryption

---

**Made with ☕ and obsessive security paranoia.**
