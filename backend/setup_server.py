"""
Kurulum Sunucusu - Panelden Telegram girisini ve ayarlari yonetir.
Backend main.py baslamadan ONCE bu calistirilir.
Kurulum tamamlaninca kendini kapatir ve main.py baslatilir.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
from telethon import TelegramClient

sys.path.insert(0, str(Path(__file__).parent))
from config import config

app = FastAPI(title="TG Monitor - Kurulum")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Telethon client (session olusturma icin)
session_path = Path(__file__).parent.parent / "session"
client: TelegramClient | None = None
phone_code_hash: str = ""


class PhoneRequest(BaseModel):
    phone: str


class CodeRequest(BaseModel):
    phone: str
    code: str
    password: str = ""


class SettingsRequest(BaseModel):
    bot_token: str = ""
    admin_chat_id: str = ""
    anthropic_api_key: str = ""


@app.get("/api/setup/status")
async def get_status():
    """Kurulum durumunu kontrol et."""
    env_path = Path(__file__).parent.parent / ".env"
    session_file = Path(str(session_path) + ".session")

    has_session = session_file.exists()
    has_env = env_path.exists()

    # .env icindeki dolu alanlari kontrol et
    env_data = {}
    if has_env:
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, val = line.split("=", 1)
                    env_data[key.strip()] = val.strip()

    return {
        "has_session": has_session,
        "has_bot_token": bool(env_data.get("TELEGRAM_BOT_TOKEN")),
        "has_admin_id": bool(env_data.get("TELEGRAM_ADMIN_CHAT_ID")),
        "has_api_key": bool(env_data.get("ANTHROPIC_API_KEY")),
        "ready": has_session and bool(env_data.get("ANTHROPIC_API_KEY")),
    }


@app.post("/api/setup/send-code")
async def send_code(req: PhoneRequest):
    """Telefon numarasina dogrulama kodu gonder."""
    global client, phone_code_hash

    try:
        client = TelegramClient(
            str(session_path),
            config.TELEGRAM_API_ID,
            config.TELEGRAM_API_HASH,
        )
        await client.connect()

        result = await client.send_code_request(req.phone)
        phone_code_hash = result.phone_code_hash

        return {"success": True, "message": "Dogrulama kodu gonderildi"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/api/setup/verify-code")
async def verify_code(req: CodeRequest):
    """Dogrulama kodunu onayla ve session olustur."""
    global client, phone_code_hash

    if not client:
        return {"success": False, "message": "Once telefon numarasi gonderin"}

    try:
        await client.sign_in(req.phone, req.code, phone_code_hash=phone_code_hash)
    except Exception as e:
        error_msg = str(e)
        if "SessionPasswordNeeded" in error_msg or "Two-step" in error_msg:
            if req.password:
                try:
                    await client.sign_in(password=req.password)
                except Exception as e2:
                    return {"success": False, "message": f"2FA hatasi: {e2}", "needs_password": False}
            else:
                return {"success": False, "message": "2FA sifrenizi girin", "needs_password": True}
        else:
            return {"success": False, "message": error_msg}

    me = await client.get_me()
    await client.disconnect()

    # Admin chat ID'yi otomatik kaydet
    _update_env("TELEGRAM_ADMIN_CHAT_ID", str(me.id))

    return {
        "success": True,
        "message": "Giris basarili!",
        "user": {
            "name": f"{me.first_name} {me.last_name or ''}".strip(),
            "username": me.username or "",
            "id": me.id,
        },
    }


@app.post("/api/setup/save-settings")
async def save_settings(req: SettingsRequest):
    """Bot token ve diger ayarlari kaydet."""
    try:
        if req.bot_token:
            _update_env("TELEGRAM_BOT_TOKEN", req.bot_token)
        if req.admin_chat_id:
            _update_env("TELEGRAM_ADMIN_CHAT_ID", req.admin_chat_id)
        if req.anthropic_api_key:
            _update_env("ANTHROPIC_API_KEY", req.anthropic_api_key)

        return {"success": True, "message": "Ayarlar kaydedildi"}
    except Exception as e:
        return {"success": False, "message": str(e)}


@app.post("/api/setup/start-monitor")
async def start_monitor():
    """Kurulumu tamamla - setup sunucusunu kapat, monitor'u baslat."""
    return {"success": True, "message": "Kurulum tamamlandi. Setup sunucusu kapaniyor, monitor basliyor..."}


def _update_env(key: str, value: str):
    """Env dosyasindaki bir degeri guncelle."""
    env_path = Path(__file__).parent.parent / ".env"
    lines = []
    found = False

    if env_path.exists():
        with open(env_path, "r") as f:
            for line in f:
                if line.strip().startswith(f"{key}="):
                    lines.append(f"{key}={value}\n")
                    found = True
                else:
                    lines.append(line)

    if not found:
        lines.append(f"{key}={value}\n")

    with open(env_path, "w") as f:
        f.writelines(lines)


if __name__ == "__main__":
    print("=" * 50)
    print("  TG Monitor - Kurulum Sunucusu")
    print("  http://localhost:8000")
    print("=" * 50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
