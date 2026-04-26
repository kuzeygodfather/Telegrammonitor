"""
Sifre hashleme (bcrypt) + alan sifrelemesi (Fernet) yardimcilari.
- Sifreler: bcrypt; SHA-256 (eski) backward-compat icin tespit/migrate edilir.
- API key, TOTP secret: Fernet ile at-rest sifrelenir.
"""
import os
import hashlib
import logging
import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from config import config

logger = logging.getLogger(__name__)

# ----- Fernet (alan sifrelemesi) -----

_FERNET = None


def _get_fernet() -> Fernet:
    global _FERNET
    if _FERNET is not None:
        return _FERNET
    key = config.ENCRYPTION_KEY or os.getenv("ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("ENCRYPTION_KEY missing from .env")
    _FERNET = Fernet(key.encode() if isinstance(key, str) else key)
    return _FERNET


_ENC_PREFIX = "enc::"


def encrypt_secret(plaintext: str) -> str:
    """Plaintext -> 'enc::<base64>'. Bos string -> bos string."""
    if not plaintext:
        return ""
    if plaintext.startswith(_ENC_PREFIX):
        return plaintext  # zaten sifreli
    f = _get_fernet()
    token = f.encrypt(plaintext.encode("utf-8")).decode("utf-8")
    return _ENC_PREFIX + token


def decrypt_secret(stored: str) -> str:
    """Sifreli -> plaintext. Sifreli degilse oldugu gibi doner (legacy)."""
    if not stored:
        return ""
    if not stored.startswith(_ENC_PREFIX):
        return stored  # legacy plaintext
    f = _get_fernet()
    try:
        return f.decrypt(stored[len(_ENC_PREFIX):].encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("decrypt_secret: invalid token")
        return ""


def is_encrypted(stored: str) -> bool:
    return bool(stored) and stored.startswith(_ENC_PREFIX)


# ----- Sifre hashleme -----

_BCRYPT_PREFIX = ("$2a$", "$2b$", "$2y$")


def is_bcrypt_hash(s: str) -> bool:
    return bool(s) and s.startswith(_BCRYPT_PREFIX)


def hash_password(plaintext: str) -> str:
    return bcrypt.hashpw(plaintext.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plaintext: str, stored: str) -> bool:
    """Sifre dogrula. bcrypt veya legacy SHA-256 kabul eder."""
    if not stored or not plaintext:
        return False
    if is_bcrypt_hash(stored):
        try:
            return bcrypt.checkpw(plaintext.encode("utf-8"), stored.encode("utf-8"))
        except Exception:
            return False
    # Legacy: client SHA-256 hash gonderiyor olabilir, ya da plaintext
    sha = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    return stored == sha or stored == plaintext


def needs_rehash(stored: str) -> bool:
    return not is_bcrypt_hash(stored)
