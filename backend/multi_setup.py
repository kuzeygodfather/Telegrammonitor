"""
Coklu kullanici session yonetimi + log API.
"""
import asyncio
import logging
import subprocess
import os
from pathlib import Path
from datetime import datetime, timezone
from config import config
from fastapi import FastAPI, Query, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

logger = logging.getLogger(__name__)

app = FastAPI()

# Rate limiting (slowapi)
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded


def _client_key(request: Request) -> str:
    """X-Forwarded-For varsa onu kullan (Cloudflare/Nginx proxy arkasinda)."""
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[0].strip()
    return get_remote_address(request)


limiter = Limiter(key_func=_client_key)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: yalnizca prod domain ve local dev
_ALLOWED_ORIGINS = [
    "https://monitor.systemtest.store",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "x-session-token"],
)


# =============== Auth Middleware ===============
# Token gerektirmeyen public endpoint'ler:
_PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/login-2fa",
    "/api/auth/logout",
    "/api/auth/has-2fa",
    "/api/auth/register",
    "/api/auth/register-api-key",
    "/api/auth/turnstile-config",
    "/api/admin/check-username",
    "/api/setup/send-code",
    "/api/setup/verify-code",
    "/api/vapid-public-key",
    "/api/validate-api-key",
    "/docs", "/openapi.json", "/redoc",
}
# Sadece localhost icin (backend kendi kendine cagiriyor):
_INTERNAL_PATHS = {"/api/send-push"}


def _validate_token(token: str):
    """user_sessions'tan validate. (user_id, is_admin) doner; gecersizse None."""
    if not token:
        return None
    try:
        from supabase import create_client as __sc
        sb = __sc(_sb_url, _sb_key)
        r = sb.table("user_sessions").select(
            "user_id,is_active,expires_at"
        ).eq("session_token", token).limit(1).execute()
        if not r.data:
            return None
        sess = r.data[0]
        if not sess.get("is_active"):
            return None
        exp = sess.get("expires_at")
        if exp:
            try:
                e = datetime.fromisoformat(exp.replace("Z", "+00:00"))
                if e < datetime.now(timezone.utc):
                    return None
            except Exception:
                pass
        u = sb.table("users").select("id,is_admin,is_active").eq(
            "id", sess["user_id"]
        ).limit(1).execute()
        if not u.data:
            return None
        user = u.data[0]
        if not user.get("is_active"):
            return None
        return {
            "user_id": int(user["id"]),
            "is_admin": bool(user.get("is_admin")),
        }
    except Exception as e:
        logger.error(f"_validate_token error: {e}")
        return None


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    # OPTIONS preflight'i pass et
    if method == "OPTIONS":
        return await call_next(request)

    # Sadece /api/* path'lerini denetle
    if not path.startswith("/api/"):
        return await call_next(request)

    # Internal endpoint: sadece localhost
    if path in _INTERNAL_PATHS:
        client_ip = ""
        try:
            client_ip = request.client.host if request.client else ""
        except Exception:
            pass
        if client_ip not in ("127.0.0.1", "::1", "localhost", ""):
            return JSONResponse({"detail": "Internal only"}, status_code=403)
        return await call_next(request)

    # Public endpoint: auth gerekmiyor
    if path in _PUBLIC_PATHS:
        return await call_next(request)

    # Auth required
    token = request.headers.get("x-session-token", "")
    auth = _validate_token(token)
    if not auth:
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    # /api/admin/* sadece admin
    if path.startswith("/api/admin/") and not auth["is_admin"]:
        return JSONResponse({"detail": "Admin only"}, status_code=403)

    # Cross-user korumasi: query string'deki user_id token'a uymak zorunda (admin haric)
    qs_uid = request.query_params.get("user_id")
    if qs_uid is not None and not auth["is_admin"]:
        try:
            if int(qs_uid) != auth["user_id"]:
                return JSONResponse(
                    {"detail": "User ID mismatch (query)"}, status_code=403
                )
        except ValueError:
            return JSONResponse({"detail": "Bad user_id"}, status_code=400)

    # Body user_id koruma: JSON body'de user_id varsa token ile esit olmali (admin haric)
    ctype = request.headers.get("content-type", "").lower()
    if (method in ("POST", "PUT", "PATCH", "DELETE")
            and "application/json" in ctype
            and not auth["is_admin"]):
        try:
            body_bytes = await request.body()
            if body_bytes:
                import json as _json
                try:
                    parsed = _json.loads(body_bytes)
                except Exception:
                    parsed = None
                if isinstance(parsed, dict) and "user_id" in parsed:
                    try:
                        body_uid = int(parsed["user_id"])
                        if body_uid != auth["user_id"]:
                            return JSONResponse(
                                {"detail": "User ID mismatch (body)"},
                                status_code=403,
                            )
                    except (TypeError, ValueError):
                        return JSONResponse(
                            {"detail": "Bad user_id in body"}, status_code=400
                        )

                # Body'i sonraki handler'in tekrar okuyabilmesi icin re-buffer
                async def _receive():
                    return {"type": "http.request", "body": body_bytes,
                            "more_body": False}

                request._receive = _receive  # type: ignore
        except Exception as _e:
            logger.warning(f"body user_id check skipped: {_e}")

    # Handler'a aktar
    request.state.user_id = auth["user_id"]
    request.state.is_admin = auth["is_admin"]
    return await call_next(request)


# Body'de user_id alan endpoint'ler icin yardimci dependency
def require_user(request: Request) -> dict:
    """Handler icinde request.state'e auth yerlestirildi."""
    return {
        "user_id": getattr(request.state, "user_id", 0),
        "is_admin": getattr(request.state, "is_admin", False),
    }


def require_admin(request: Request) -> dict:
    auth = require_user(request)
    if not auth["is_admin"]:
        raise HTTPException(403, "Admin only")
    return auth


# =============== Turnstile (CAPTCHA) ===============

async def verify_turnstile(token: str, request: Request) -> bool:
    """Cloudflare Turnstile token'i dogrula. Secret bos ise dogrulamayi atla (dev)."""
    secret = config.TURNSTILE_SECRET_KEY
    if not secret:
        return True  # CAPTCHA disabled
    if not token:
        return False
    try:
        import httpx
        ip = ""
        try:
            xff = request.headers.get("x-forwarded-for", "")
            ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "")
        except Exception:
            pass
        async with httpx.AsyncClient(timeout=8.0) as hc:
            r = await hc.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={"secret": secret, "response": token, "remoteip": ip},
            )
            j = r.json()
            return bool(j.get("success"))
    except Exception as e:
        logger.warning(f"turnstile verify error: {e}")
        return False


@app.get("/api/auth/turnstile-config")
async def turnstile_config():
    """Frontend'in Turnstile widget'ini hazirlamasi icin site_key ve aktif/pasif durumu."""
    return {
        "site_key": config.TURNSTILE_SITE_KEY,
        "enabled": bool(config.TURNSTILE_SECRET_KEY),
    }


# =============== AI Provider Helper (kullanici key'i + Gemini/OpenAI/Anthropic) ===============

def get_user_ai_provider(user_id: int):
    """Kullanicinin api_key'i + provider/model'ini al, AIProvider olustur.
    Hata durumunda None doner."""
    try:
        from security import decrypt_secret
        from ai_provider import get_provider_for_user
        sb = _sc(_sb_url, _sb_key)
        r = sb.table("users").select("api_key,ai_provider,ai_model").eq(
            "id", user_id
        ).limit(1).execute()
        if not r.data:
            return None
        u = r.data[0]
        if not u.get("api_key"):
            return None
        return get_provider_for_user({
            "id": user_id,
            "api_key": decrypt_secret(u["api_key"]),
            "ai_provider": u.get("ai_provider"),
            "ai_model": u.get("ai_model"),
        })
    except Exception as e:
        logger.error(f"get_user_ai_provider error: {e}")
        return None


async def ai_complete(user_id: int, prompt: str, system: str = None,
                     max_tokens: int = 1000, prefer: str = "fast") -> str:
    """Kullanicinin provider'i ile AI cagrisi yap. prefer='fast' (haiku-class) veya 'strong' (sonnet-class)."""
    p = get_user_ai_provider(user_id)
    if not p:
        return ""
    if prefer == "strong":
        return await p.sonnet_analyze(prompt, system=system)
    if prefer == "fast":
        return await p.haiku_filter(prompt)
    return await p.complete(prompt, system=system, max_tokens=max_tokens)


# =============== Audit Log ===============

def _client_ip(request: Request) -> str:
    try:
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            return xff.split(",")[0].strip()
        return request.client.host if request.client else ""
    except Exception:
        return ""


def audit_log(action: str, user_id: int = 0, username: str = "",
              details: dict = None, request: Request = None):
    """audit_logs tablosuna kayit. Sessizce hata yutar - audit basarisiz olsa
    bile asil islem etkilenmemelidir."""
    try:
        from supabase import create_client as __sc
        sb = __sc(_sb_url, _sb_key)
        ip = _client_ip(request) if request else ""
        ua = (request.headers.get("user-agent", "")[:300]
              if request else "")
        sb.table("audit_logs").insert({
            "user_id": user_id or None,
            "username": (username or "")[:80],
            "action": action[:80],
            "details": details or {},
            "ip_address": ip,
            "user_agent": ua,
        }).execute()
    except Exception as e:
        logger.warning(f"audit_log failed action={action}: {e}")

SESSIONS_DIR = Path("/opt/telegram-monitor/sessions")
SESSIONS_DIR.mkdir(exist_ok=True)

API_ID = 34340998
API_HASH = "7c02612127f4fb371f94edc581140895"

clients: dict[str, TelegramClient] = {}
code_hashes: dict[str, str] = {}


class PhoneReq(BaseModel):
    phone: str
    username: str


class CodeReq(BaseModel):
    phone: str
    code: str
    password: str = ""
    username: str


@app.post("/api/setup/send-code")
async def send_code(req: PhoneReq):
    try:
        session_path = str(SESSIONS_DIR / req.username)
        client = TelegramClient(session_path, API_ID, API_HASH)
        await client.connect()

        if await client.is_user_authorized():
            me = await client.get_me()
            await client.disconnect()
            return {"success": True, "message": f"Zaten yetkili: {me.first_name}"}

        phone_clean = req.phone.replace(" ", "").replace("-", "")
        result = await client.send_code_request(phone_clean)
        clients[req.username] = client
        code_hashes[req.username] = result.phone_code_hash
        return {"success": True, "message": "Kod gonderildi"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/api/setup/verify-code")
async def verify_code(req: CodeReq):
    client = clients.get(req.username)
    if not client:
        return {"success": False, "message": "Once telefon numarasi gonderin"}

    try:
        phone_clean2 = req.phone.replace(" ", "").replace("-", "")
        await client.sign_in(phone_clean2, req.code, phone_code_hash=code_hashes.get(req.username, ""))
    except SessionPasswordNeededError:
        if req.password:
            try:
                await client.sign_in(password=req.password)
            except Exception as e:
                return {"success": False, "message": f"2FA hatasi: {e}"}
        else:
            return {"success": False, "message": "2FA gerekli", "needs_password": True}
    except Exception as e:
        return {"success": False, "message": str(e)}

    me = await client.get_me()
    # Session dosyasinin diske yazildiginden emin ol
    await client.disconnect()
    # Session dosyasi kontrolu
    import os, time as _time
    _session_file = str(SESSIONS_DIR / (req.username + ".session"))
    _session_path_no_ext = str(SESSIONS_DIR / req.username)
    # Telethon bazen sadece path yazar (.session uzantisi ekler)
    for _try in range(3):
        if os.path.exists(_session_file):
            logger.info(f"Session dosyasi olusturuldu: {_session_file}")
            break
        _time.sleep(0.5)
    else:
        logger.warning(f"Session dosyasi olusturulamadi: {_session_file}")
    del clients[req.username]
    if req.username in code_hashes:
        del code_hashes[req.username]

    # Save phone to DB now that verification is complete
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("users").update({"phone": req.phone}).eq("username", req.username).execute()
    except Exception as e:
        logger.error(f"Phone save error for {req.username}: {e}")

    # Restart backend in case it was stopped by admin_set_phone
    try:
        import subprocess
        pass  # systemctl start kaldirildi
    except Exception as _e:
        pass

    return {"success": True, "user": {"name": f"{me.first_name} {me.last_name or ''}".strip(), "id": me.id}}


# ==================== LOG API ====================

@app.get("/api/logs/backend")
async def get_backend_logs(lines: int = Query(default=100, le=500)):
    """Backend (tg-backend) servis loglarini getir."""
    try:
        # Supabase polling loglari cok fazla, 5x daha fazla satir cekip filtrele
        fetch_lines = min(lines * 5, 2500)
        result = subprocess.run(
            ["journalctl", "-u", "tg-backend", "--no-pager", "-n", str(fetch_lines), "--output=short-iso"],
            capture_output=True, text=True, timeout=10
        )
        raw = result.stdout.strip().split("\n") if result.stdout.strip() else []
        entries = []
        for line in raw:
            if "supabase.co" in line and ("/replies?" in line or "/keywords?" in line or "/groups?" in line or "/users?" in line):
                continue
            level = "info"
            if "ERROR" in line or "error" in line.lower() or "Traceback" in line:
                level = "error"
            elif "WARNING" in line:
                level = "warning"
            elif "Dinleme aktif" in line or "baglandi" in line or "baslatildi" in line:
                level = "success"
            entries.append({"text": line, "level": level})
        return {"logs": entries[-lines:]}
    except Exception as e:
        return {"logs": [{"text": f"Log okunamadi: {e}", "level": "error"}]}


@app.get("/api/logs/analyzer")
async def get_analyzer_logs(lines: int = Query(default=100, le=500)):
    """Analyzer loglarini getir (monitor.log)."""
    log_path = Path("/opt/telegram-monitor/data/monitor.log")
    try:
        if not log_path.exists():
            return {"logs": [{"text": "monitor.log bulunamadi", "level": "warning"}]}
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        fetch = min(lines * 5, 2500)
        recent = all_lines[-fetch:]
        entries = []
        for line in recent:
            line = line.strip()
            if not line:
                continue
            if "supabase.co" in line and ("/replies?" in line or "/keywords?" in line or "/groups?" in line or "/users?" in line):
                continue
            level = "info"
            if "ERROR" in line or "error" in line:
                level = "error"
            elif "WARNING" in line:
                level = "warning"
            elif "Haiku:" in line or "Sonnet:" in line:
                level = "success"
            entries.append({"text": line, "level": level})
        return {"logs": entries[-lines:]}
    except Exception as e:
        return {"logs": [{"text": f"Log okunamadi: {e}", "level": "error"}]}


@app.get("/api/personnel/list")
async def get_personnel_list(user_id: int = Query(default=1), days: int = Query(default=30, ge=1, le=365)):
    """Personeli getir. days parametresi ile pencere sinirla (default 30 gun)."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from database import get_db
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz
    db = get_db()

    cutoff = (_dt.now(_tz.utc) - _td(days=days)).isoformat()

    all_msgs = []
    offset = 0
    batch_size = 1000
    while True:
        r = (db.table("messages")
             .select("sender_name,sender_id,date,group_id")
             .eq("user_id", user_id)
             .neq("sender_name", "Bilinmeyen")
             .gte("date", cutoff)
             .order("date", desc=True)
             .range(offset, offset + batch_size - 1)
             .execute())
        all_msgs.extend(r.data or [])
        if len(r.data or []) < batch_size:
            break
        offset += batch_size
        if len(all_msgs) > 100000:  # ust sinir
            break

    # Group bilgilerini al
    groups_r = db.table("groups").select("id,title").eq("user_id", user_id).execute()
    group_map = {g["id"]: g["title"] for g in (groups_r.data or [])}

    # Personel map - sender_id bazli gruplama (ayni kisi = ayni Telegram ID)
    pmap: dict = {}
    for m in all_msgs:
        sid = m.get("sender_id", 0)
        name = m["sender_name"]
        # sender_id 0 ise isim bazli fallback
        key = str(sid) if sid else name
        if key not in pmap:
            pmap[key] = {"sender_name": name, "sender_id": sid, "msg_count": 0, "groups": [], "last_active": m["date"]}
        else:
            # Ayni sender_id, farkli isim olabilir - en cok mesaj olan ismi kullan
            # Ilk kaydedilen isim kalir (en son tarihli = en guncel)
            pass
        pmap[key]["msg_count"] += 1
        gtitle = group_map.get(m.get("group_id"), "")
        if gtitle and gtitle not in pmap[key]["groups"]:
            pmap[key]["groups"].append(gtitle)

    # Disambiguate same-name personnel by adding group info
    result_list = sorted(pmap.values(), key=lambda x: x["msg_count"], reverse=True)
    name_count: dict = {}
    for p in result_list:
        n = p["sender_name"].strip().lower()
        name_count[n] = name_count.get(n, 0) + 1
    for p in result_list:
        n = p["sender_name"].strip().lower()
        if name_count[n] > 1 and p["groups"]:
            p["sender_name"] = p["sender_name"] + " (" + p["groups"][0][:20] + ")"
    result = result_list
    return {"personnel": result, "total": len(result)}


@app.get("/api/stats/hourly")
async def get_hourly_stats(user_id: int = Query(default=1), since: str = Query(default=""), until: str = Query(default="")):
    """Saatlik mesaj dagilimini getir."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from database import get_db
    from datetime import datetime, timezone
    db = get_db()

    if not since:
        now = datetime.now(timezone.utc)
        since = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()

    # Sayfalayarak tum mesajlari cek
    hours = {h: 0 for h in range(24)}
    total = 0
    offset = 0
    while True:
        q = db.table("messages").select("created_at").eq("user_id", user_id).gte("created_at", since)
        if until:
            q = q.lte("created_at", until)
        r = q.order("created_at", desc=False).range(offset, offset + 999).execute()
        for m in (r.data or []):
            try:
                h = datetime.fromisoformat(m["created_at"]).hour
                hours[h] = hours.get(h, 0) + 1
                total += 1
            except Exception as _e:
                pass
        if len(r.data or []) < 1000:
            break
        offset += 1000

    return {"hours": [{"hour": h, "count": c} for h, c in sorted(hours.items())], "total": total}


@app.get("/api/logs/status")
async def get_system_status():
    """Sistem durumunu getir."""
    status = {}

    # Backend service
    try:
        r = subprocess.run(["systemctl", "is-active", "tg-backend"], capture_output=True, text=True, timeout=3)
        status["backend"] = r.stdout.strip()
    except Exception as _e:
        status["backend"] = "unknown"

    # Setup service
    try:
        r = subprocess.run(["systemctl", "is-active", "tg-setup"], capture_output=True, text=True, timeout=3)
        status["setup"] = r.stdout.strip()
    except Exception as _e:
        status["setup"] = "unknown"

    # Backend restart count
    try:
        r = subprocess.run(["systemctl", "show", "tg-backend", "-p", "NRestarts"], capture_output=True, text=True, timeout=3)
        status["backend_restarts"] = int(r.stdout.strip().split("=")[1])
    except Exception as _e:
        status["backend_restarts"] = 0

    # Backend uptime
    try:
        r = subprocess.run(["systemctl", "show", "tg-backend", "-p", "ActiveEnterTimestamp"], capture_output=True, text=True, timeout=3)
        status["backend_since"] = r.stdout.strip().split("=")[1].strip()
    except Exception as _e:
        status["backend_since"] = ""

    # Disk usage
    try:
        r = subprocess.run(["df", "-h", "/"], capture_output=True, text=True, timeout=3)
        lines = r.stdout.strip().split("\n")
        if len(lines) > 1:
            parts = lines[1].split()
            status["disk_used"] = parts[2]
            status["disk_total"] = parts[1]
            status["disk_percent"] = parts[4]
    except Exception as _e:
        pass

    # Memory
    try:
        r = subprocess.run(["free", "-h"], capture_output=True, text=True, timeout=3)
        lines = r.stdout.strip().split("\n")
        if len(lines) > 1:
            parts = lines[1].split()
            status["mem_total"] = parts[1]
            status["mem_used"] = parts[2]
    except Exception as _e:
        pass

    # Session files
    sessions = list(Path("/opt/telegram-monitor/sessions").glob("*.session"))
    status["session_count"] = len(sessions)
    status["sessions"] = [s.stem for s in sessions]

    return status


# ==================== 2FA API ====================

import sys
sys.path.insert(0, str(Path(__file__).parent))
from totp_setup import setup_totp, verify_totp, remove_totp, has_totp
from database import get_db as _get_db


class TotpVerify(BaseModel):
    user_id: int
    code: str


@app.post("/api/auth/setup-2fa")
async def api_setup_2fa(user_id: int = Query(...), username: str = Query(...)):
    db = _get_db()
    result = setup_totp(db, user_id, username)
    return {"success": True, **result}


@app.post("/api/auth/verify-2fa")
async def api_verify_2fa(req: TotpVerify):
    db = _get_db()
    ok = verify_totp(db, req.user_id, req.code)
    return {"success": ok, "message": "Dogrulandi" if ok else "Kod hatali"}


@app.post("/api/auth/remove-2fa")
async def api_remove_2fa(user_id: int = Query(...)):
    db = _get_db()
    remove_totp(db, user_id)
    return {"success": True}


@app.get("/api/auth/has-2fa")
async def api_has_2fa(user_id: int = Query(...)):
    db = _get_db()
    return {"has_2fa": has_totp(db, user_id)}


# ==================== Login / Logout (server-side) ====================

import secrets as _secrets_auth


class LoginReq(BaseModel):
    username: str
    # Geriye doniik uyum: hem 'password' (yeni, plaintext)
    # hem 'password_hash' (eski SHA-256) kabul edilir.
    password: str = ""
    password_hash: str = ""
    turnstile_token: str = ""


class Login2FAReq(BaseModel):
    user_id: int
    code: str


class LogoutReq(BaseModel):
    token: str


class RegisterReq(BaseModel):
    username: str
    password: str
    api_key: str = ""
    ai_provider: str = ""
    ai_model: str = ""
    phone: str = ""
    turnstile_token: str = ""


class SaveApiKeyReq(BaseModel):
    api_key: str
    ai_provider: str = ""
    ai_model: str = ""


def _create_session_record(db, user_id: int, request: Request) -> str:
    """Yeni session_token uretir ve user_sessions tablosuna yazar."""
    token = _secrets_auth.token_urlsafe(32)
    ip = ""
    try:
        if request.client:
            ip = request.client.host
        # Cloudflare arkasindaysa gercek IP X-Forwarded-For'da
        xff = request.headers.get("x-forwarded-for", "")
        if xff:
            ip = xff.split(",")[0].strip()
    except Exception:
        pass
    ua = request.headers.get("user-agent", "")[:500]
    db.table("user_sessions").insert({
        "user_id": user_id,
        "session_token": token,
        "user_agent": ua,
        "ip_address": ip,
        "device_info": ua,
        "is_active": True,
    }).execute()
    return token


@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def api_login(req: LoginReq, request: Request):
    """username + sifre dogrulama. 2FA varsa needs_2fa:true doner.

    - Yeni: req.password (plaintext) + bcrypt verify
    - Backward-compat: req.password_hash (SHA-256) kabul; ilk girişte bcrypt'e re-hash
    """
    # CAPTCHA kontrolu (Turnstile aktif ise)
    if config.TURNSTILE_SECRET_KEY:
        if not await verify_turnstile(req.turnstile_token, request):
            audit_log("login_captcha_failed", username=req.username, request=request)
            return {"success": False, "message": "CAPTCHA dogrulamasi basarisiz"}

    from security import verify_password, hash_password, is_bcrypt_hash, needs_rehash
    db = _get_db()
    try:
        r = db.table("users").select(
            "id,username,password_hash,is_active,is_admin"
        ).eq("username", req.username.strip().lower()).limit(1).execute()
    except Exception as e:
        logger.error(f"login DB error: {e}")
        return {"success": False, "message": "Sunucu hatasi"}

    if not r.data:
        audit_log("login_failed", username=req.username, details={"reason": "user_not_found"}, request=request)
        return {"success": False, "message": "Kullanici adi veya sifre hatali"}
    user = r.data[0]

    stored = user.get("password_hash") or ""
    plaintext = req.password or ""
    legacy_hash = req.password_hash or ""

    ok = False
    if plaintext:
        ok = verify_password(plaintext, stored)
    elif legacy_hash and not is_bcrypt_hash(stored):
        # Eski client SHA-256 hash gonderdi; DB'deki de SHA-256 ise direkt karsilastir
        ok = (legacy_hash == stored)

    if not ok:
        audit_log("login_failed", user_id=user["id"], username=user.get("username"),
                  details={"reason": "wrong_password"}, request=request)
        return {"success": False, "message": "Kullanici adi veya sifre hatali"}

    if not user.get("is_active"):
        audit_log("login_blocked", user_id=user["id"], username=user.get("username"),
                  details={"reason": "inactive"}, request=request)
        return {"success": False, "message": "Hesabiniz henuz aktif degil. Admin onayini bekleyin."}

    # Auto re-hash to bcrypt
    if plaintext and needs_rehash(stored):
        try:
            new_hash = hash_password(plaintext)
            db.table("users").update({"password_hash": new_hash}).eq("id", user["id"]).execute()
        except Exception as _e:
            logger.error(f"password rehash failed: {_e}")

    if has_totp(db, user["id"]):
        audit_log("login_2fa_required", user_id=user["id"], username=user["username"], request=request)
        return {
            "success": True,
            "needs_2fa": True,
            "user_id": user["id"],
            "username": user["username"],
            "is_admin": bool(user.get("is_admin")),
        }

    try:
        token = _create_session_record(db, user["id"], request)
    except Exception as e:
        logger.error(f"login session insert error: {e}")
        return {"success": False, "message": "Oturum olusturulamadi"}

    audit_log("login_success", user_id=user["id"], username=user["username"], request=request)
    return {
        "success": True,
        "needs_2fa": False,
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "is_admin": bool(user.get("is_admin")),
        },
    }


@app.post("/api/auth/register")
@limiter.limit("5/minute")
async def api_register(req: RegisterReq, request: Request):
    """Yeni kullanici kaydi: bcrypt hash, is_active=false (admin onay bekler)."""
    # CAPTCHA kontrolu
    if config.TURNSTILE_SECRET_KEY:
        if not await verify_turnstile(req.turnstile_token, request):
            audit_log("register_captcha_failed", username=req.username, request=request)
            return {"success": False, "message": "CAPTCHA dogrulamasi basarisiz"}

    from security import hash_password
    uname = (req.username or "").strip().lower()
    if len(uname) < 3 or len(uname) > 30 or not all(c.isalnum() or c in "._-" for c in uname):
        return {"success": False, "message": "Gecersiz kullanici adi"}
    if len(req.password or "") < 8:
        return {"success": False, "message": "Sifre en az 8 karakter olmali"}
    db = _get_db()
    try:
        r = db.table("users").select("id").eq("username", uname).limit(1).execute()
        if r.data:
            return {"success": False, "message": "Kullanici adi alinmis"}
    except Exception as e:
        logger.error(f"register check error: {e}")
        return {"success": False, "message": "Sunucu hatasi"}
    try:
        from security import encrypt_secret as _enc
        pwd_hash = hash_password(req.password)
        payload = {
            "username": uname,
            "password_hash": pwd_hash,
            "is_active": False,
            "is_admin": False,
        }
        if req.phone:
            payload["phone"] = req.phone.strip()
        if req.api_key:
            prov = (req.ai_provider or "").strip().lower()
            if prov not in {"anthropic", "openai", "gemini"}:
                k = req.api_key
                if k.startswith("sk-ant-"):
                    prov = "anthropic"
                elif k.startswith("sk-"):
                    prov = "openai"
                elif k.startswith("AIza"):
                    prov = "gemini"
                else:
                    prov = "anthropic"
            model = (req.ai_model or "").strip() or {
                "anthropic": "claude-haiku-4-5-20251001",
                "openai": "gpt-4o-mini",
                "gemini": "gemini-2.5-flash",
            }[prov]
            payload["api_key"] = _enc(req.api_key.strip())
            payload["ai_provider"] = prov
            payload["ai_model"] = model

        ins = db.table("users").insert(payload).execute()
        if not ins.data:
            return {"success": False, "message": "Kayit hatasi"}
        new_id = ins.data[0]["id"]
        audit_log("register", user_id=new_id, username=uname, request=request)

        # Telegram bot ile admin'lere bildirim
        try:
            import asyncio as _asyncio
            from telegram import Bot as _Bot
            bot_token = config.TELEGRAM_BOT_TOKEN
            admin_chat_id = config.TELEGRAM_ADMIN_CHAT_ID
            if bot_token and admin_chat_id:
                ip = _client_ip(request)
                msg = (
                    f"🆕 *Yeni Kayit*\n\n"
                    f"👤 Kullanici: `{uname}`\n"
                    f"🆔 ID: `{new_id}`\n"
                    f"📱 Telefon: `{req.phone or '-'}`\n"
                    f"🤖 Provider: `{payload.get('ai_provider','-')}`\n"
                    f"🌐 IP: `{ip or '-'}`\n\n"
                    f"_Onaylamak icin: Settings sayfasi_"
                )
                bot = _Bot(token=bot_token)
                async def _send():
                    try:
                        await bot.send_message(chat_id=admin_chat_id, text=msg, parse_mode="Markdown")
                    except Exception as e:
                        logger.warning(f"admin notify failed: {e}")
                _asyncio.create_task(_send())
        except Exception as e:
            logger.warning(f"register admin notify init failed: {e}")

        return {"success": True, "user_id": new_id, "message": "Kayit basarili. Admin onayi bekleyin."}
    except Exception as e:
        logger.error(f"register insert error: {e}")
        return {"success": False, "message": "Kayit hatasi"}


@app.post("/api/auth/register-api-key")
@limiter.limit("5/minute")
async def api_register_save_key(request: Request, body: dict):
    """Register sonrasi (admin onayi oncesi) opsiyonel API key kaydetmek icin
    sifre dogrulamasi gerektiren ozel endpoint."""
    from security import verify_password, encrypt_secret
    uname = (body.get("username") or "").strip().lower()
    pwd = body.get("password") or ""
    api_key = (body.get("api_key") or "").strip()
    if not uname or not pwd or not api_key:
        return {"success": False, "message": "Eksik alan"}
    db = _get_db()
    r = db.table("users").select("id,password_hash").eq("username", uname).limit(1).execute()
    if not r.data:
        return {"success": False, "message": "Kullanici bulunamadi"}
    user = r.data[0]
    if not verify_password(pwd, user.get("password_hash") or ""):
        return {"success": False, "message": "Sifre hatali"}

    prov = (body.get("ai_provider") or "").strip().lower()
    if prov not in {"anthropic", "openai", "gemini"}:
        if api_key.startswith("sk-ant-"):
            prov = "anthropic"
        elif api_key.startswith("sk-"):
            prov = "openai"
        elif api_key.startswith("AIza"):
            prov = "gemini"
        else:
            prov = "anthropic"
    model = (body.get("ai_model") or "").strip() or {
        "anthropic": "claude-haiku-4-5-20251001",
        "openai": "gpt-4o-mini",
        "gemini": "gemini-2.5-flash",
    }[prov]
    try:
        db.table("users").update({
            "api_key": encrypt_secret(api_key),
            "ai_provider": prov,
            "ai_model": model,
        }).eq("id", user["id"]).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"register-api-key save error: {e}")
        return {"success": False, "message": "Kaydetme hatasi"}


@app.post("/api/auth/login-2fa")
@limiter.limit("10/minute")
async def api_login_2fa(req: Login2FAReq, request: Request):
    """2FA kod dogrula + session_token uret."""
    db = _get_db()
    if not verify_totp(db, req.user_id, req.code):
        audit_log("login_2fa_failed", user_id=req.user_id, request=request)
        return {"success": False, "message": "Kod hatali"}
    try:
        r = db.table("users").select(
            "id,username,is_admin,is_active"
        ).eq("id", req.user_id).limit(1).execute()
    except Exception as e:
        logger.error(f"login-2fa DB error: {e}")
        return {"success": False, "message": "Sunucu hatasi"}
    if not r.data:
        return {"success": False, "message": "Kullanici bulunamadi"}
    user = r.data[0]
    if not user.get("is_active"):
        return {"success": False, "message": "Hesap aktif degil"}

    try:
        token = _create_session_record(db, user["id"], request)
    except Exception as e:
        logger.error(f"login-2fa session insert error: {e}")
        return {"success": False, "message": "Oturum olusturulamadi"}

    audit_log("login_2fa_success", user_id=user["id"], username=user["username"], request=request)
    return {
        "success": True,
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "is_admin": bool(user.get("is_admin")),
        },
    }


@app.post("/api/auth/logout")
async def api_logout(req: LogoutReq, request: Request):
    """Session token revoke."""
    if not req.token:
        return {"success": True}
    db = _get_db()
    try:
        # Revoke etmeden once user_id'yi bul (audit icin)
        s = db.table("user_sessions").select("user_id").eq(
            "session_token", req.token
        ).limit(1).execute()
        uid = s.data[0]["user_id"] if s.data else 0
        db.table("user_sessions").update({"is_active": False}).eq(
            "session_token", req.token
        ).execute()
        if uid:
            audit_log("logout", user_id=uid, request=request)
    except Exception as e:
        logger.error(f"logout error: {e}")
    return {"success": True}


@app.post("/api/users/save-api-key")
async def save_api_key(req: SaveApiKeyReq, request: Request):
    """Kullaniciya AI API key kaydet (Fernet ile encrypted at rest)."""
    from security import encrypt_secret
    user_id = getattr(request.state, "user_id", 0)
    if not user_id:
        raise HTTPException(401, "Auth required")

    key = (req.api_key or "").strip()
    if not key:
        return {"success": False, "message": "Bos key"}

    # Provider/model fallback
    prov = (req.ai_provider or "").strip().lower()
    if prov not in {"anthropic", "openai", "gemini"}:
        if key.startswith("sk-ant-"):
            prov = "anthropic"
        elif key.startswith("sk-"):
            prov = "openai"
        elif key.startswith("AIza"):
            prov = "gemini"
        else:
            prov = "anthropic"
    model = (req.ai_model or "").strip()
    if not model:
        model = {"anthropic": "claude-haiku-4-5-20251001",
                 "openai": "gpt-4o-mini",
                 "gemini": "gemini-2.5-flash"}.get(prov, "claude-haiku-4-5-20251001")

    db = _get_db()
    try:
        encrypted = encrypt_secret(key)
        db.table("users").update({
            "api_key": encrypted,
            "ai_provider": prov,
            "ai_model": model,
        }).eq("id", user_id).execute()
        audit_log("api_key_updated", user_id=user_id,
                  details={"provider": prov, "model": model}, request=request)
        return {"success": True, "ai_provider": prov, "ai_model": model}
    except Exception as e:
        logger.error(f"save_api_key error: {e}")
        return {"success": False, "message": "Kaydetme hatasi"}


@app.get("/api/admin/audit-log")
async def admin_audit_log(request: Request, limit: int = 100, action: str = ""):
    """Admin: audit log oku."""
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(403, "Admin only")
    sb = _sc(_sb_url, _sb_key)
    q = sb.table("audit_logs").select("*").order("created_at", desc=True).limit(min(limit, 500))
    if action:
        q = q.eq("action", action)
    r = q.execute()
    return {"logs": r.data or []}


@app.get("/api/users/me")
async def get_me(request: Request):
    """Kullanicinin kendi bilgilerini doner. api_key sadece masked."""
    user_id = getattr(request.state, "user_id", 0)
    if not user_id:
        raise HTTPException(401, "Auth required")
    db = _get_db()
    r = db.table("users").select(
        "id,username,is_admin,is_active,phone,ai_provider,ai_model,api_key"
    ).eq("id", user_id).limit(1).execute()
    if not r.data:
        raise HTTPException(404, "User not found")
    u = r.data[0]
    raw = u.get("api_key") or ""
    # Plaintext or encrypted - mask
    if raw:
        try:
            from security import decrypt_secret
            plain = decrypt_secret(raw)
            if len(plain) > 18:
                u["api_key_masked"] = plain[:12] + "..." + plain[-6:]
            else:
                u["api_key_masked"] = "***"
        except Exception:
            u["api_key_masked"] = "***"
    else:
        u["api_key_masked"] = ""
    u.pop("api_key", None)
    return {"user": u}


# ========== Shift Image Parser ==========
import anthropic
import json as json_module

class ImageReq(BaseModel):
    image: str  # base64
    mime_type: str = "image/jpeg"
    user_id: int = 0  # opsiyonel - kullanicinin AI provider'ini kullanmak icin

@app.post("/api/parse-shift-image")
async def parse_shift_image(req: ImageReq, request: Request):
    """Vardiya tablosu resmi parse et. Multi-provider (kullanici key'i)."""
    user_id = getattr(request.state, "user_id", 0) or req.user_id
    if not user_id:
        return {"error": "Auth required"}
    p = get_user_ai_provider(user_id)
    if not p:
        return {"error": "AI key bulunamadi - Settings'ten ekleyin"}
    prompt = """Bu resimde bir personel vardiya tablosu var. Tabloyu analiz et ve JSON formatinda cikti ver.

Kurallar:
- Gunler: 0=Pazartesi, 1=Sali, 2=Carsamba, 3=Persembe, 4=Cuma, 5=Cumartesi, 6=Pazar
- Saat formati: "HH:MM" (ornegin "08:00", "16:00", "00:00")
- Izin olan gunler icin is_off: true, shift_start: null, shift_end: null
- Sadece JSON array dondur, baska bir sey yazma

Ornek cikti:
[
  {"staff_name": "Hizir", "day_of_week": 0, "shift_start": "00:00", "shift_end": "08:00", "is_off": false},
  {"staff_name": "Hakan", "day_of_week": 0, "shift_start": null, "shift_end": null, "is_off": true}
]

Tablodaki TUM personel ve TUM gunleri dahil et."""
    try:
        response_text = (await p.image_complete(prompt, req.image, req.mime_type, max_tokens=4096)).strip()
        if response_text.startswith("["):
            shifts = json_module.loads(response_text)
        else:
            start = response_text.find("[")
            end = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                shifts = json_module.loads(response_text[start:end])
            else:
                return {"error": "AI ciktisi parse edilemedi", "raw": response_text[:300]}
        return {"shifts": shifts, "count": len(shifts)}
    except Exception as e:
        logger.error(f"Image parse error: {e}")
        return {"error": str(e)[:200]}



# ========== AI Shift Generator ==========

class AIShiftReq(BaseModel):
    staff: list  # [{name, role}]
    weeks: int = 1
    rules: str = ""  # optional custom rules
    history: list = []  # previous week shifts for context

@app.post("/api/generate-ai-shifts")
async def generate_ai_shifts(req: AIShiftReq, request: Request):
    """Generate optimized shifts. Multi-provider (kullanici key'i)."""
    user_id = getattr(request.state, "user_id", 0)
    if not user_id:
        return {"error": "Auth required"}

    staff_text = "\n".join([f"- {s['name']} ({s['role']})" for s in req.staff])
    history_text = ""
    if req.history:
        history_text = "\nGecen hafta vardiyalari:\n" + "\n".join([
            f"- {h['name']}: " + ", ".join([f"Gun{h['shifts'][i]['day']}={h['shifts'][i]['val']}" for i in range(len(h['shifts']))])
            for h in req.history[:10]
        ])
    prompt = f"""Personel vardiya cizelgesi olustur. {req.weeks} haftalik.

Personel:
{staff_text}

Roller ve vardiya tipleri:
- agent (Canli Destek): 3 vardiya donusumlu (00:00-08:00, 08:00-16:00, 16:00-00:00), haftada 2 izin
- admin (CD Admin): 2 vardiya (08:00-16:00, 12:00-20:00), haftada 2 izin
- finans: 09:00-18:00 sabit, haftada 2 izin (Ct-Pz)
- marketing: 09:00-18:00 sabit, haftada 2 izin
- it (IT Ekibi): 2 vardiya (08:00-16:00, 16:00-00:00), haftada 1 izin

Kurallar:
1. Adil dagilim - gece vardiyasi esit paylasim
2. Ardisik 2den fazla gece vardiyasi olmasin
3. Izin gunleri farkli gunlere dagilsin (ayni anda herkes izinli olmasin)
4. Her vardiya diliminde en az 1 kisi olsun
5. Hafta degisiminde vardiya tipi degissin (rotasyon)
{f"6. Ek kurallar: {req.rules}" if req.rules else ""}
{history_text}

SADECE JSON dondur, baska bir sey yazma. Format:
[{{"week":0,"staff_name":"Isim","day":0,"shift_start":"08:00","shift_end":"16:00","is_off":false}}]
day: 0=Pazartesi, 6=Pazar. is_off=true ise shift_start/end null."""

    try:
        text = (await ai_complete(user_id, prompt, max_tokens=4096, prefer="strong")).strip()
        if not text:
            return {"error": "AI yaniti alinamadi"}
        start = text.find("["); end = text.rfind("]") + 1
        if start >= 0 and end > start:
            shifts = json_module.loads(text[start:end])
            return {"shifts": shifts, "count": len(shifts)}
        return {"error": "JSON parse edilemedi", "raw": text[:500]}
    except Exception as e:
        logger.error(f"AI shift gen error: {e}")
        return {"error": str(e)[:200]}



# ========== API Key Validator ==========

class ApiKeyReq(BaseModel):
    api_key: str

@app.post("/api/validate-api-key")
@limiter.limit("20/minute")
async def validate_api_key(req: ApiKeyReq, request: Request):
    """Multi-provider API key dogrulama: Anthropic, OpenAI, Gemini.

    Async client + 15sn timeout. Sync SDK cagrisi event loop'u bloklamamasi icin
    run_in_executor ile thread pool'a tasinir.
    """
    import sys, asyncio
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        from ai_provider import AIProvider
        key = req.api_key.strip()
        provider = AIProvider.detect_provider(key)
        loop = asyncio.get_event_loop()

        if provider == "anthropic":
            from anthropic import AsyncAnthropic
            client = AsyncAnthropic(api_key=key, timeout=15.0)
            msg = await asyncio.wait_for(
                client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=10,
                    messages=[{"role": "user", "content": "hi"}],
                ),
                timeout=15.0,
            )
            return {"valid": True, "provider": "anthropic", "model": msg.model}

        elif provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=key, timeout=15.0)
            resp = await asyncio.wait_for(
                client.chat.completions.create(
                    model="gpt-4o-mini",
                    max_tokens=5,
                    messages=[{"role": "user", "content": "hi"}],
                ),
                timeout=15.0,
            )
            return {"valid": True, "provider": "openai", "model": resp.model}

        elif provider == "gemini":
            # REST API ile dogrudan kontrol — SDK timeout sorunu yok
            import httpx
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
            async with httpx.AsyncClient(timeout=10.0) as hc:
                r = await hc.get(url)
            if r.status_code == 200:
                return {"valid": True, "provider": "gemini", "model": "gemini-2.5-flash"}
            return {"valid": False, "error": "Gecersiz Gemini API key"}

        return {"valid": False, "error": "Bilinmeyen API key formati"}

    except asyncio.TimeoutError:
        return {"valid": False, "error": "Dogrulama zaman asimi (15sn)"}
    except Exception as e:
        err = str(e).lower()
        if "auth" in err or "invalid" in err or "key" in err or "incorrect" in err:
            return {"valid": False, "error": "Gecersiz API key"}
        return {"valid": False, "error": str(e)[:200]}



# ========== AI Usage Tracking ==========
from supabase import create_client as _sc

_sb_url = config.SUPABASE_URL
_sb_key = config.SUPABASE_SERVICE_KEY

HAIKU_INPUT = 0.80 / 1_000_000   # $0.80 per 1M input tokens
HAIKU_OUTPUT = 4.00 / 1_000_000  # $4.00 per 1M output tokens
SONNET_INPUT = 3.00 / 1_000_000
SONNET_OUTPUT = 15.00 / 1_000_000

def log_ai_usage(user_id: int, operation: str, model: str, input_tokens: int, output_tokens: int):
    """Log AI usage to database."""
    try:
        if "haiku" in model.lower():
            cost = input_tokens * HAIKU_INPUT + output_tokens * HAIKU_OUTPUT
        else:
            cost = input_tokens * SONNET_INPUT + output_tokens * SONNET_OUTPUT
        sb = _sc(_sb_url, _sb_key)
        sb.table("ai_usage").insert({
            "user_id": user_id,
            "operation": operation,
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost": round(cost, 6),
        }).execute()
    except Exception as e:
        logger.error(f"Usage log error: {e}")

class UsageQuery(BaseModel):
    user_id: int
    days: int = 30

@app.post("/api/ai-usage")
async def get_ai_usage(req: UsageQuery):
    """Get AI usage stats for a user."""
    try:
        from datetime import datetime, timedelta
        sb = _sc(_sb_url, _sb_key)
        since = (datetime.utcnow() - timedelta(days=req.days)).isoformat()

        # Total usage
        result = sb.table("ai_usage").select("*").eq("user_id", req.user_id).gte("created_at", since).order("created_at", desc=True).execute()
        rows = result.data or []

        total_input = sum(r.get("input_tokens", 0) for r in rows)
        total_output = sum(r.get("output_tokens", 0) for r in rows)
        total_cost = sum(float(r.get("estimated_cost", 0)) for r in rows)

        # By operation
        ops = {}
        for r in rows:
            op = r.get("operation", "unknown")
            if op not in ops:
                ops[op] = {"count": 0, "input_tokens": 0, "output_tokens": 0, "cost": 0}
            ops[op]["count"] += 1
            ops[op]["input_tokens"] += r.get("input_tokens", 0)
            ops[op]["output_tokens"] += r.get("output_tokens", 0)
            ops[op]["cost"] += float(r.get("estimated_cost", 0))

        # By day (last 7)
        daily = {}
        for r in rows:
            day = r.get("created_at", "")[:10]
            if day not in daily:
                daily[day] = {"cost": 0, "calls": 0}
            daily[day]["cost"] += float(r.get("estimated_cost", 0))
            daily[day]["calls"] += 1

        return {
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "total_cost": round(total_cost, 4),
            "total_calls": len(rows),
            "by_operation": ops,
            "by_day": daily,
            "recent": rows[:10],
        }
    except Exception as e:
        return {"error": str(e)}



# ========== Push Notifications ==========
from pywebpush import webpush, WebPushException

VAPID_PUBLIC_KEY = "BFC1xpHgyCLK3_R9zNnbeCD9iOQroG_n4TaYzLVQmxgRJqojzDwMgb7vnQdiY01WjzfjbuiEiiGkjcwJnSNpOo0"
VAPID_PRIVATE_KEY = "/opt/telegram-monitor/vapid_private.pem"
VAPID_CLAIMS = {"sub": "mailto:kuzeygodfather@gmail.com"}

class PushSubReq(BaseModel):
    user_id: int
    endpoint: str
    p256dh: str
    auth: str

@app.post("/api/push-subscribe")
async def push_subscribe(req: PushSubReq):
    """Subscribe to push notifications."""
    try:
        sb = _sc(_sb_url, _sb_key)
        # Upsert subscription
        sb.table("push_subscriptions").upsert({
            "user_id": req.user_id,
            "endpoint": req.endpoint,
            "p256dh": req.p256dh,
            "auth": req.auth,
        }, on_conflict="endpoint").execute()
        # Create default prefs if not exists
        existing = sb.table("notification_prefs").select("id").eq("user_id", req.user_id).execute()
        if not existing.data:
            sb.table("notification_prefs").insert({"user_id": req.user_id}).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/push-unsubscribe")
async def push_unsubscribe(req: PushSubReq):
    """Unsubscribe from push notifications."""
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("push_subscriptions").delete().eq("endpoint", req.endpoint).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

class NotifPrefsReq(BaseModel):
    user_id: int
    enabled: bool = True
    sound: bool = True
    vibrate: bool = True
    sorun: bool = True
    onay: bool = True
    aksiyon: bool = True
    bilgi: bool = False
    quiet_start: str = None
    quiet_end: str = None

@app.post("/api/notification-prefs")
async def save_notif_prefs(req: NotifPrefsReq):
    """Save notification preferences."""
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("notification_prefs").upsert({
            "user_id": req.user_id,
            "enabled": req.enabled,
            "sound": req.sound,
            "vibrate": req.vibrate,
            "sorun": req.sorun,
            "onay": req.onay,
            "aksiyon": req.aksiyon,
            "bilgi": req.bilgi,
            "quiet_start": req.quiet_start,
            "quiet_end": req.quiet_end,
        }, on_conflict="user_id").execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/notification-prefs")
async def get_notif_prefs(user_id: int):
    """Get notification preferences."""
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("notification_prefs").select("*").eq("user_id", user_id).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return {"enabled": True, "sound": True, "vibrate": True, "sorun": True, "onay": True, "aksiyon": True, "bilgi": False}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/vapid-public-key")
async def get_vapid_key():
    return {"key": VAPID_PUBLIC_KEY}

class SendPushReq(BaseModel):
    user_id: int
    title: str
    body: str
    url: str = "/"
    tag: str = "tg-monitor"
    durum: str = "BILGI"

@app.post("/api/send-push")
async def send_push(req: SendPushReq):
    """Send push notification to a user."""
    try:
        sb = _sc(_sb_url, _sb_key)
        # Check prefs
        prefs = sb.table("notification_prefs").select("*").eq("user_id", req.user_id).limit(1).execute()
        p = prefs.data[0] if prefs.data else {}
        if not p.get("enabled", True):
            return {"skipped": "notifications disabled"}

        # Check durum filter
        durum_map = {"SORUN": "sorun", "ONAY_BEKLIYOR": "onay", "AKSIYON_GEREKLI": "aksiyon", "BILGI": "bilgi"}
        pref_key = durum_map.get(req.durum, "bilgi")
        if not p.get(pref_key, True):
            return {"skipped": f"{req.durum} notifications disabled"}

        # Check quiet hours
        if p.get("quiet_start") and p.get("quiet_end"):
            from datetime import datetime, timezone, timedelta
            now = datetime.now(timezone(timedelta(hours=3)))
            current = now.strftime("%H:%M")
            qs, qe = p["quiet_start"], p["quiet_end"]
            if qs <= qe:
                if qs <= current <= qe:
                    return {"skipped": "quiet hours"}
            else:
                if current >= qs or current <= qe:
                    return {"skipped": "quiet hours"}

        # Get subscriptions
        subs = sb.table("push_subscriptions").select("*").eq("user_id", req.user_id).execute()
        sent = 0
        for sub in (subs.data or []):
            try:
                payload = json_module.dumps({
                    "title": req.title,
                    "body": req.body,
                    "url": req.url,
                    "tag": req.tag,
                    "vibrate": p.get("vibrate", True),
                    "sound": p.get("sound", True),
                })
                webpush(
                    subscription_info={
                        "endpoint": sub["endpoint"],
                        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}
                    },
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims=VAPID_CLAIMS,
                )
                sent += 1
            except WebPushException as e:
                if "410" in str(e) or "404" in str(e):
                    sb.table("push_subscriptions").delete().eq("id", sub["id"]).execute()
            except Exception as e:
                logger.error(f"Push error: {e}")
        return {"sent": sent}
    except Exception as e:
        return {"error": str(e)}



# ========== Auto Reply ==========

class AutoReplySettingsReq(BaseModel):
    user_id: int
    enabled: bool = False
    message: str = "Su an musait degilim, en kisa surede donecegim."
    timeout_minutes: int = 20
    only_mentions: bool = True
    only_work_hours: bool = False
    work_start: str = "09:00"
    work_end: str = "18:00"

@app.post("/api/auto-reply/settings")
async def save_auto_reply_settings(req: AutoReplySettingsReq):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("auto_reply_settings").upsert({
            "user_id": req.user_id,
            "enabled": req.enabled,
            "message": req.message,
            "timeout_minutes": req.timeout_minutes,
            "only_mentions": req.only_mentions,
            "only_work_hours": req.only_work_hours,
            "work_start": req.work_start,
            "work_end": req.work_end,
        }, on_conflict="user_id").execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/auto-reply/settings")
async def get_auto_reply_settings(user_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("auto_reply_settings").select("*").eq("user_id", user_id).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return {"enabled": False, "message": "Su an musait degilim, en kisa surede donecegim.", "timeout_minutes": 20, "only_mentions": True, "only_work_hours": False, "work_start": "09:00", "work_end": "18:00"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/auto-reply/pending")
async def get_pending_mentions(user_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("pending_mentions").select("*").eq("user_id", user_id).order("mentioned_at", desc=True).limit(100).execute()
        return {"mentions": result.data or []}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/auto-reply/test")
async def test_auto_reply(user_id: int = 0):
    """Test auto-reply by sending a notification."""
    try:
        sb = _sc(_sb_url, _sb_key)
        settings = sb.table("auto_reply_settings").select("*").eq("user_id", user_id).limit(1).execute()
        s = settings.data
        if not s or not s.get("enabled"):
            return {"status": "disabled", "message": "Otomatik yanit kapali"}
        return {"status": "active", "message": s.get("message"), "timeout": s.get("timeout_minutes")}
    except Exception as e:
        return {"error": str(e)}



class MarkRepliedReq(BaseModel):
    id: int
    user_id: int

@app.post("/api/auto-reply/mark-replied")
async def mark_mention_replied(req: MarkRepliedReq):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("pending_mentions").update({"replied": True}).eq("id", req.id).eq("user_id", req.user_id).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/auto-reply/history")
async def get_mention_history(user_id: int, limit: int = 50):
    """Get all mentions including replied ones."""
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("pending_mentions").select("*").eq("user_id", user_id).order("mentioned_at", desc=True).limit(limit).execute()
        return {"mentions": result.data or []}
    except Exception as e:
        return {"error": str(e)}



@app.get("/api/auto-reply/report")
async def auto_reply_report(user_id: int, days: int = 30):
    """Detailed auto-reply report with stats."""
    try:
        from datetime import datetime, timedelta
        sb = _sc(_sb_url, _sb_key)
        since = (datetime.utcnow() - timedelta(days=days)).isoformat()

        result = sb.table("pending_mentions").select("*").eq("user_id", user_id).gte("mentioned_at", since).order("mentioned_at", desc=True).execute()
        rows = result.data or []

        total = len(rows)
        pending = sum(1 for r in rows if not r.get("replied") and not r.get("auto_replied"))
        auto_replied = sum(1 for r in rows if r.get("auto_replied"))
        manual_replied = sum(1 for r in rows if r.get("replied") and not r.get("auto_replied"))

        # By sender
        by_sender = {}
        for r in rows:
            name = r.get("sender_name") or "Bilinmeyen"
            if name not in by_sender:
                by_sender[name] = {"total": 0, "pending": 0, "auto": 0, "replied": 0}
            by_sender[name]["total"] += 1
            if not r.get("replied") and not r.get("auto_replied"):
                by_sender[name]["pending"] += 1
            elif r.get("auto_replied"):
                by_sender[name]["auto"] += 1
            else:
                by_sender[name]["replied"] += 1

        # By day
        by_day = {}
        for r in rows:
            day = (r.get("mentioned_at") or "")[:10]
            if not day: continue
            if day not in by_day:
                by_day[day] = {"total": 0, "auto": 0, "replied": 0, "pending": 0}
            by_day[day]["total"] += 1
            if r.get("auto_replied"):
                by_day[day]["auto"] += 1
            elif r.get("replied"):
                by_day[day]["replied"] += 1
            else:
                by_day[day]["pending"] += 1

        # By hour (which hours get most mentions)
        by_hour = {}
        for r in rows:
            h = (r.get("mentioned_at") or "")[11:13]
            if not h: continue
            by_hour[h] = by_hour.get(h, 0) + 1

        # Average response time (for auto-replied ones, it's timeout_minutes)
        settings = sb.table("auto_reply_settings").select("timeout_minutes").eq("user_id", user_id).limit(1).execute()
        timeout = (settings.data[0] if settings.data else {}).get("timeout_minutes", 20)

        return {
            "total": total,
            "pending": pending,
            "auto_replied": auto_replied,
            "manual_replied": manual_replied,
            "by_sender": dict(sorted(by_sender.items(), key=lambda x: x[1]["total"], reverse=True)),
            "by_day": by_day,
            "by_hour": by_hour,
            "timeout_minutes": timeout,
            "mentions": rows,
        }
    except Exception as e:
        return {"error": str(e)}



# ========== RAG Style Learning & Reply Suggestions ==========

@app.post("/api/style/analyze")
async def analyze_style(user_id: int = 0):
    """Analyze user's message style from their sent messages."""
    try:
        sb = _sc(_sb_url, _sb_key)
        # Get user info for sender_name matching
        user_info = sb.table("users").select("username").eq("id", user_id).limit(1).execute()
        uname = (user_info.data[0] if user_info.data else {}).get("username", "")

        # Get user's sent replies
        replies = sb.table("replies").select("text").eq("user_id", user_id).order("created_at", desc=True).limit(100).execute()
        reply_texts = [r["text"] for r in (replies.data or []) if r.get("text")]

        # Get messages sent by this user in groups (match by known sender names)
        sender_names = ["Beyazıt Karaçelebi", "naibbeyy"]  # Will be configurable per user later
        msg_texts = []
        for sname in sender_names:
            msgs = sb.table("messages").select("text").eq("user_id", user_id).like("sender_name", f"*{sname}*").order("created_at", desc=True).limit(100).execute()
            msg_texts.extend([m["text"] for m in (msgs.data or []) if m.get("text") and len(m["text"]) > 5])

        # Also check style_samples
        samples = sb.table("style_samples").select("message,context,category").eq("user_id", user_id).execute()
        sample_texts = [s["message"] for s in (samples.data or []) if s.get("message")]

        all_texts = msg_texts + reply_texts + sample_texts
        if len(all_texts) < 3:
            return {"error": "Yeterli mesaj yok. En az 3 ornek mesaj gerekli. Stil Ornekleri bolumunden manuel ekleyebilirsiniz."}

        # Multi-provider AI ile stil analizi (Anthropic / OpenAI / Gemini)
        examples = "\n---\n".join(all_texts[:50])
        prompt = f"""Bu kisininin mesaj orneklerini analiz et ve yazim stilini ozetle.

MESAJ ORNEKLERI:
{examples}

Sadece JSON dondur:
{{
  "style_summary": "Bu kisinin genel yazim tarzinin 2-3 cumlelik ozeti",
  "tone": "resmi/samimi/kisa/detayli/emir/ricaci/vs",
  "common_phrases": ["sik kullandigi ifadeler listesi"],
  "rules": ["her zaman buyuk harf kullanir", "emoji kullanmaz", "kisa mesajlar yazar" gibi kurallar]
}}"""
        response_text = (await ai_complete(user_id, prompt, prefer="fast")).strip()
        if not response_text:
            return {"error": "AI yaniti alinamadi"}
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            profile = json_module.loads(response_text[start:end])
            # Save profile
            sb.table("style_profiles").upsert({
                "user_id": user_id,
                "style_summary": profile.get("style_summary", ""),
                "tone": profile.get("tone", ""),
                "common_phrases": profile.get("common_phrases", []),
                "rules": profile.get("rules", []),
                "updated_at": "now()",
            }, on_conflict="user_id").execute()
            return {"success": True, "profile": profile, "sample_count": len(all_texts)}
        return {"error": "Stil analizi yapilamadi"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/style/profile")
async def get_style_profile(user_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("style_profiles").select("*").eq("user_id", user_id).limit(1).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return {}
    except Exception as e:
        return {"error": str(e)}

class SampleReq(BaseModel):
    user_id: int
    context: str = ""
    message: str
    category: str = "general"

@app.post("/api/style/add-sample")
async def add_style_sample(req: SampleReq):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("style_samples").insert({
            "user_id": req.user_id, "context": req.context,
            "message": req.message, "category": req.category,
        }).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.delete("/api/style/sample/{sample_id}")
async def delete_style_sample(sample_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("style_samples").delete().eq("id", sample_id).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/style/samples")
async def get_style_samples(user_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("style_samples").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return {"samples": result.data or []}
    except Exception as e:
        return {"error": str(e)}

class GenerateReplyReq(BaseModel):
    user_id: int
    sender_name: str
    original_message: str
    group_title: str = ""
    group_id: int = 0
    telegram_msg_id: int = 0
    extra_context: str = ""

@app.post("/api/style/generate-reply")
async def generate_reply(req: GenerateReplyReq):
    """Generate a reply suggestion in the user's style."""
    try:
        sb = _sc(_sb_url, _sb_key)

        # Get style profile
        profile = sb.table("style_profiles").select("*").eq("user_id", req.user_id).limit(1).execute()
        p = profile.data[0] if profile.data else {}

        # Get recent samples
        samples = sb.table("style_samples").select("context,message").eq("user_id", req.user_id).order("created_at", desc=True).limit(20).execute()
        sample_texts = "\n".join([f"Baglam: {s.get('context','')} -> Cevap: {s['message']}" for s in (samples.data or []) if s.get("message")])

        # Get API key
        user_data = sb.table("users").select("api_key").eq("id", req.user_id).limit(1).execute()
        style_info = ""
        if p:
            style_info = f"""
YAZIM STILI:
- Ozet: {p.get('style_summary', '')}
- Ton: {p.get('tone', '')}
- Sik kullanilan ifadeler: {', '.join(p.get('common_phrases', []))}
- Kurallar: {', '.join(p.get('rules', []))}
"""

        prompt = f"""Sen bir mesaj asistanisin. Asagidaki kisinin yazim stilini taklit ederek, gelen mesaja bir cevap onerisi olustur.

{style_info}

ORNEK MESAJLAR:
{sample_texts or '(ornek yok - genel tarza uy)'}

---
GELEN MESAJ:
Grup: {req.group_title}
Gonderen: {req.sender_name}
Mesaj: {req.original_message}
{f'Ek baglam: {req.extra_context}' if req.extra_context else ''}

---
Bu kisinin uslubunda SADECE cevap metnini yaz. Baska bir sey ekleme."""

        suggested = (await ai_complete(req.user_id, prompt, prefer="fast")).strip()
        if not suggested:
            return {"error": "AI yaniti alinamadi"}

        # Save suggestion
        result = sb.table("reply_suggestions").insert({
            "user_id": req.user_id,
            "group_id": req.group_id,
            "group_title": req.group_title,
            "sender_name": req.sender_name,
            "original_message": req.original_message,
            "suggested_reply": suggested,
            "telegram_msg_id": req.telegram_msg_id,
            "status": "pending",
        }).execute()

        suggestion_id = result.data[0]["id"] if result.data else 0

        return {"suggestion": suggested, "id": suggestion_id}
    except Exception as e:
        return {"error": str(e)}

class ApproveSuggestionReq(BaseModel):
    id: int
    user_id: int
    edited_reply: str = ""
    action: str = "approve"  # approve, reject, edit

@app.post("/api/style/suggestion-action")
async def suggestion_action(req: ApproveSuggestionReq):
    """Approve, reject, or edit a reply suggestion."""
    try:
        sb = _sc(_sb_url, _sb_key)

        if req.action == "reject":
            sb.table("reply_suggestions").update({"status": "rejected"}).eq("id", req.id).execute()
            return {"success": True, "action": "rejected"}

        if req.action == "approve" or req.action == "edit":
            # Get the suggestion
            sug = sb.table("reply_suggestions").select("*").eq("id", req.id).limit(1).execute()
            s = sug.data[0] if sug.data else None
            if not s:
                return {"error": "Oneri bulunamadi"}

            reply_text = req.edited_reply if req.edited_reply else s["suggested_reply"]

            # Send via Telegram (insert into replies table)
            sb.table("replies").insert({
                "group_id": s["group_id"],
                "reply_to_msg_id": s.get("telegram_msg_id"),
                "text": reply_text,
                "user_id": req.user_id,
            }).execute()

            # Update suggestion status
            sb.table("reply_suggestions").update({
                "status": "approved",
                "edited_reply": reply_text if req.edited_reply else None,
            }).eq("id", req.id).execute()

            # Save as style sample for future learning
            sb.table("style_samples").insert({
                "user_id": req.user_id,
                "context": f"{s.get('sender_name','')}: {s.get('original_message','')}",
                "message": reply_text,
                "category": "approved_reply",
            }).execute()

            return {"success": True, "action": "sent", "text": reply_text}

        return {"error": "Gecersiz aksiyon"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/style/suggestions")
async def get_suggestions(user_id: int, status: str = "all"):
    try:
        sb = _sc(_sb_url, _sb_key)
        q = sb.table("reply_suggestions").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(50)
        if status != "all":
            q = q.eq("status", status)
        result = q.execute()
        return {"suggestions": result.data or []}
    except Exception as e:
        return {"error": str(e)}



class StyleProfileUpdateReq(BaseModel):
    user_id: int
    style_summary: str = ""
    tone: str = ""
    common_phrases: list = []
    rules: list = []

@app.post("/api/style/update-profile")
async def update_style_profile(req: StyleProfileUpdateReq):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("style_profiles").upsert({"user_id": req.user_id, "style_summary": req.style_summary, "tone": req.tone, "common_phrases": req.common_phrases, "rules": req.rules}, on_conflict="user_id").execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}



# ========== Admin User Management ==========

class AdminActivateReq(BaseModel):
    user_id: int
    phone: str = ""

@app.post("/api/admin/activate-user")
async def admin_activate_user(req: AdminActivateReq, request: Request):
    """Admin: activate user and optionally set phone + connect telegram."""
    try:
        sb = _sc(_sb_url, _sb_key)
        user = sb.table("users").select("username").eq("id", req.user_id).execute()
        target_uname = ""
        if user.data:
            target_uname = user.data[0]["username"]
            session_file = SESSIONS_DIR / (target_uname + ".session")
            if not session_file.exists():
                pass
        update = {"is_active": True}
        if req.phone:
            update["phone"] = req.phone
        sb.table("users").update(update).eq("id", req.user_id).execute()
        audit_log("admin_activate_user",
                  user_id=getattr(request.state, "user_id", 0),
                  details={"target_user_id": req.user_id, "target_username": target_uname,
                           "phone_set": bool(req.phone)},
                  request=request)
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

class AdminSetPhoneReq(BaseModel):
    user_id: int
    username: str
    phone: str

@app.post("/api/admin/set-phone")
async def admin_set_phone(req: AdminSetPhoneReq):
    """Admin: set phone and send telegram code for a user."""
    import subprocess, time as _time

    try:
        sb = _sc(_sb_url, _sb_key)
        session_path = str(SESSIONS_DIR / req.username)

        # Stop backend to avoid session lock
        pass  # systemctl stop kaldirildi
        pass  # sleep kaldirildi

        try:
            client = TelegramClient(session_path, API_ID, API_HASH)
            await client.connect()
            if await client.is_user_authorized():
                me = await client.get_me()
                await client.disconnect()
                pass  # systemctl start kaldirildi
                return {"success": True, "already_connected": True, "name": f"{me.first_name} {me.last_name or ''}".strip()}
            sent = await client.send_code_request(req.phone)
            code_hashes[req.username] = sent.phone_code_hash
            clients[req.username] = client
            # Restart backend - client is in THIS process (tg-setup), not tg-backend
            pass  # systemctl start kaldirildi
            return {"success": True, "code_sent": True}
        except Exception as e:
            pass  # systemctl start kaldirildi
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

class AdminFetchGroupsReq(BaseModel):
    user_id: int
    username: str

@app.post("/api/admin/fetch-groups")
async def admin_fetch_groups(req: AdminFetchGroupsReq):
    """Admin: fetch telegram groups for a user. Backend'i durdurmadan calisir."""
    import time as _time

    try:
        session_path = str(SESSIONS_DIR / req.username)

        # Backend'i DURDURMA - sadece okuma yaparken lock riski dusuk
        # Eger lock hatasi olursa kisa bekle ve tekrar dene
        try:
            client = TelegramClient(session_path, API_ID, API_HASH)
            await client.connect()
            if not await client.is_user_authorized():
                await client.disconnect()
                return {"error": "Telegram baglantisi yok. Once telefon dogrulamasi yapin."}

            from telethon.tl.types import Channel, Chat
            sb = _sc(_sb_url, _sb_key)
            dialogs = await client.get_dialogs(limit=500)
            groups = []
            for d in dialogs:
                if isinstance(d.entity, (Channel, Chat)):
                    if hasattr(d.entity, 'megagroup') and not d.entity.megagroup and isinstance(d.entity, Channel):
                        continue
                    gid = d.id  # Always use dialog.id (marked format: -100xxx for channels, -xxx for chats)
                    groups.append({
                        "id": gid,
                        "title": d.entity.title,
                        "member_count": getattr(d.entity, 'participants_count', None),
                    })

            for g in groups:
                try:
                    # Check if group exists for this user
                    existing = sb.table("groups").select("id").eq("id", g["id"]).eq("user_id", req.user_id).execute()
                    if existing.data:
                        sb.table("groups").update({
                            "title": g["title"], "member_count": g["member_count"],
                        }).eq("id", g["id"]).eq("user_id", req.user_id).execute()
                    else:
                        # Insert for this user (upsert approach)
                        try:
                            sb.table("groups").insert({
                                "id": g["id"], "title": g["title"],
                                "member_count": g["member_count"],
                                "user_id": req.user_id, "is_monitored": True,
                            }).execute()
                        except Exception:
                            # Might fail on unique constraint - update instead
                            try:
                                sb.table("groups").update({
                                    "title": g["title"], "member_count": g["member_count"],
                                }).eq("id", g["id"]).eq("user_id", req.user_id).execute()
                            except Exception:
                                pass
                except Exception as eg:
                    logger.warning(f"Group save skip {g.get('title','')}: {eg}")

            await client.disconnect()

        finally:
            pass  # Backend durdurmadik, restart gerekmez

        return {"success": True, "count": len(groups), "groups": [g["title"] for g in groups[:10]]}
    except Exception as e:
        return {"error": str(e)}



class AdminDeleteUserReq(BaseModel):
    user_id: int
    username: str

@app.post("/api/admin/delete-user")
async def admin_delete_user(req: AdminDeleteUserReq, request: Request):
    """Admin: fully delete a user. CASCADE FK'ler tum bagli tablolari otomatik siler."""
    try:
        sb = _sc(_sb_url, _sb_key)
        uid = req.user_id
        audit_log("admin_delete_user",
                  user_id=getattr(request.state, "user_id", 0),
                  details={"target_user_id": uid, "target_username": req.username},
                  request=request)
        # Tek DELETE — CASCADE her bagli kaydi siler
        sb.table("users").delete().eq("id", uid).execute()
        import os, glob
        for f in glob.glob(f"/opt/telegram-monitor/sessions/{req.username}*"):
            try: os.remove(f)
            except Exception: pass
        return {"success": True}
    except Exception as e:
        logger.error(f"delete-user error: {e}")
        return {"error": str(e)}


@app.get("/api/admin/users")
async def admin_list_users(request: Request):
    """Admin: Tum kullanicilarin listesi (frontend RLS bypass)."""
    if not getattr(request.state, "is_admin", False):
        raise HTTPException(403, "Admin only")
    sb = _sc(_sb_url, _sb_key)
    r = sb.table("users").select(
        "id,username,phone,is_active,is_admin,created_at,ai_provider,ai_model"
    ).order("created_at").execute()
    return {"users": r.data or []}


class AdminToggleReq(BaseModel):
    user_id: int
    field: str   # 'is_active' | 'is_admin'
    value: bool


@app.post("/api/admin/toggle-user")
async def admin_toggle_user(req: AdminToggleReq, request: Request):
    """Admin: kullanici flag'lerini ac/kapat."""
    if req.field not in ("is_active", "is_admin"):
        return {"success": False, "message": "Invalid field"}
    sb = _sc(_sb_url, _sb_key)
    sb.table("users").update({req.field: req.value}).eq("id", req.user_id).execute()
    if req.field == "is_active" and not req.value:
        # Pasiflestirme -> tum oturumlari kapat
        sb.table("user_sessions").update({"is_active": False}).eq(
            "user_id", req.user_id
        ).execute()
    audit_log(f"admin_toggle_{req.field}",
              user_id=getattr(request.state, "user_id", 0),
              details={"target_user_id": req.user_id, "value": req.value},
              request=request)
    return {"success": True}


class AdminResetPasswordReq(BaseModel):
    user_id: int
    new_password: str


@app.post("/api/admin/reset-password")
async def admin_reset_password(req: AdminResetPasswordReq, request: Request):
    """Admin: target kullanicinin sifresini sifirla + tum oturumlari kapat."""
    if len(req.new_password or "") < 8:
        return {"success": False, "message": "Sifre en az 8 karakter olmali"}
    from security import hash_password
    sb = _sc(_sb_url, _sb_key)
    try:
        target = sb.table("users").select("username").eq("id", req.user_id).limit(1).execute()
        if not target.data:
            return {"success": False, "message": "Kullanici bulunamadi"}
        sb.table("users").update({
            "password_hash": hash_password(req.new_password),
        }).eq("id", req.user_id).execute()
        sb.table("user_sessions").update({"is_active": False}).eq("user_id", req.user_id).execute()
        audit_log("admin_reset_password",
                  user_id=getattr(request.state, "user_id", 0),
                  details={"target_user_id": req.user_id,
                           "target_username": target.data[0]["username"]},
                  request=request)
        return {"success": True}
    except Exception as e:
        logger.error(f"reset-password error: {e}")
        return {"success": False, "message": "Hata"}


class SelfDeleteReq(BaseModel):
    password: str


@app.post("/api/users/me/delete")
async def user_self_delete(req: SelfDeleteReq, request: Request):
    """Kullanici kendi hesabini siler (sifre dogrulamasi)."""
    user_id = getattr(request.state, "user_id", 0)
    if not user_id:
        raise HTTPException(401, "Auth required")
    from security import verify_password
    sb = _sc(_sb_url, _sb_key)
    r = sb.table("users").select("id,username,password_hash,is_admin").eq(
        "id", user_id
    ).limit(1).execute()
    if not r.data:
        raise HTTPException(404, "Not found")
    user = r.data[0]
    if user.get("is_admin"):
        return {"success": False, "message": "Admin hesabi panel uzerinden silinemez"}
    if not verify_password(req.password, user.get("password_hash") or ""):
        return {"success": False, "message": "Sifre hatali"}
    audit_log("user_self_delete", user_id=user_id, username=user["username"], request=request)
    sb.table("users").delete().eq("id", user_id).execute()
    import os, glob
    for f in glob.glob(f"/opt/telegram-monitor/sessions/{user['username']}*"):
        try: os.remove(f)
        except Exception: pass
    return {"success": True}



# ========== Session/Device Management ==========
import hashlib as _hashlib
import secrets as _secrets

@app.post("/api/session/create")
async def create_session(user_id: int = 0, device_info: str = "", user_agent: str = "", ip_address: str = ""):
    try:
        sb = _sc(_sb_url, _sb_key)
        token = _secrets.token_urlsafe(32)
        sb.table("user_sessions").insert({
            "user_id": user_id, "session_token": token,
            "device_info": device_info, "user_agent": user_agent,
            "ip_address": ip_address, "is_active": True,
        }).execute()
        return {"token": token}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/session/list")
async def list_sessions(user_id: int):
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("user_sessions").select("*").eq("user_id", user_id).eq("is_active", True).order("last_active", desc=True).execute()
        return {"sessions": result.data or []}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/session/revoke")
async def revoke_session(session_id: int = 0, user_id: int = 0):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("user_sessions").update({"is_active": False}).eq("id", session_id).eq("user_id", user_id).execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/session/revoke-all")
async def revoke_all_sessions(user_id: int = 0, except_token: str = ""):
    try:
        sb = _sc(_sb_url, _sb_key)
        q = sb.table("user_sessions").update({"is_active": False}).eq("user_id", user_id).eq("is_active", True)
        if except_token:
            q = q.neq("session_token", except_token)
        q.execute()
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/session/heartbeat")
async def session_heartbeat(token: str = ""):
    try:
        sb = _sc(_sb_url, _sb_key)
        sb.table("user_sessions").update({"last_active": "now()"}).eq("session_token", token).eq("is_active", True).execute()
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}



# ========== Validation Endpoints ==========

@app.get("/api/admin/check-session")
async def check_user_session(username: str):
    """Check if a user's Telegram session is actually authorized."""
    try:
        import subprocess, time as _time
        session_path = str(SESSIONS_DIR / username)
        import os
        if not os.path.exists(session_path + ".session"):
            return {"exists": False, "authorized": False, "message": "Session dosyasi yok"}

        # Stop backend temporarily
        pass  # systemctl stop kaldirildi
        pass  # sleep kaldirildi
        try:
            client = TelegramClient(session_path, API_ID, API_HASH)
            await client.connect()
            auth = await client.is_user_authorized()
            name = ""
            if auth:
                me = await client.get_me()
                name = f"{me.first_name} {me.last_name or ''}".strip()
            await client.disconnect()
            return {"exists": True, "authorized": auth, "name": name}
        finally:
            pass  # systemctl start kaldirildi
    except Exception as e:
        pass  # systemctl start kaldirildi
        return {"exists": False, "authorized": False, "error": str(e)}

@app.get("/api/admin/check-username")
async def check_username(username: str):
    """Check if username is available."""
    try:
        sb = _sc(_sb_url, _sb_key)
        result = sb.table("users").select("id").eq("username", username.lower()).execute()
        return {"available": len(result.data or []) == 0}
    except Exception as e:
        return {"error": str(e)}



# ========== AI Proxy ==========
class AIGenerateReq(BaseModel):
    user_id: int
    prompt: str
    max_tokens: int = 4000

@app.post("/api/ai/generate")
async def ai_generate(req: AIGenerateReq, request: Request):
    """Proxy AI calls. Multi-provider (Anthropic/OpenAI/Gemini)."""
    # Body user_id middleware tarafından dogrulandi (admin haric)
    try:
        text = await ai_complete(req.user_id, req.prompt, max_tokens=req.max_tokens, prefer="strong")
        if not text:
            return {"error": "AI yaniti alinamadi (key veya provider sorunu olabilir)"}
        return {"content": text}
    except Exception as e:
        logger.error(f"AI proxy error: {e}")
        return {"error": str(e)[:200]}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
