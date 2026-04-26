"""
Google Authenticator (TOTP) 2FA endpoints.
TOTP secret users tablosunda saklanir: users.totp_secret kolonu
(keywords tablosundan tasindi - guvenlik fix: 2026-04-26)
Secret artik Fernet ile encrypted at-rest (security.py).
"""
import pyotp
import qrcode
import qrcode.image.svg
import io
import base64
from security import encrypt_secret, decrypt_secret


def get_totp_secret(db, user_id: int) -> str | None:
    """Kullanicinin TOTP secret'ini getir (decrypt edilmis)."""
    r = db.table("users").select("totp_secret, totp_enabled").eq("id", user_id).limit(1).execute()
    if r.data and r.data[0].get("totp_secret") and r.data[0].get("totp_enabled"):
        return decrypt_secret(r.data[0]["totp_secret"])
    # Fallback: keywords tablosu (eski kayitlar icin)
    r2 = db.table("keywords").select("keyword").eq("user_id", user_id).eq("category", "totp").limit(1).execute()
    if r2.data:
        secret_plain = r2.data[0]["keyword"]
        try:
            db.table("users").update({
                "totp_secret": encrypt_secret(secret_plain),
                "totp_enabled": True
            }).eq("id", user_id).execute()
            db.table("keywords").delete().eq("user_id", user_id).eq("category", "totp").execute()
        except Exception:
            pass
        return secret_plain
    return None


def setup_totp(db, user_id: int, username: str) -> dict:
    """Yeni TOTP secret olustur ve QR code dondur."""
    secret = pyotp.random_base32()

    # encrypted at-rest
    db.table("users").update({
        "totp_secret": encrypt_secret(secret),
        "totp_enabled": True,
    }).eq("id", user_id).execute()

    # Eski keywords kaydı varsa temizle
    try:
        db.table("keywords").delete().eq("user_id", user_id).eq("category", "totp").execute()
    except Exception:
        pass

    # QR code
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=username, issuer_name="TG Monitor")

    # QR to base64 PNG
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_base64 = base64.b64encode(buf.getvalue()).decode()

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}",
        "uri": uri,
    }


def verify_totp(db, user_id: int, code: str) -> bool:
    """TOTP kodunu dogrula."""
    secret = get_totp_secret(db, user_id)
    if not secret:
        return False  # 2FA kurulmamissa REDDET (güvenlik fix - eski: return True)
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def remove_totp(db, user_id: int):
    """2FA'yi kapat."""
    # users tablosundan temizle
    db.table("users").update({
        "totp_secret": None,
        "totp_enabled": False,
    }).eq("id", user_id).execute()
    # keywords fallback temizle
    try:
        db.table("keywords").delete().eq("user_id", user_id).eq("category", "totp").execute()
    except Exception:
        pass


def has_totp(db, user_id: int) -> bool:
    """Kullanicida 2FA var mi?"""
    # Önce users tablosuna bak
    r = db.table("users").select("totp_secret, totp_enabled").eq("id", user_id).limit(1).execute()
    if r.data and r.data[0].get("totp_secret") and r.data[0].get("totp_enabled"):
        return True
    # Fallback keywords
    r2 = db.table("keywords").select("id").eq("user_id", user_id).eq("category", "totp").limit(1).execute()
    return len(r2.data or []) > 0
