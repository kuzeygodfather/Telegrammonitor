import os
from pathlib import Path
from dotenv import load_dotenv

# .env dosyasini yukle (proje kokunden)
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


def _int(key: str, default: int = 0) -> int:
    """Bos string'de patlamayan int donusturucu."""
    val = os.getenv(key, "")
    if not val or not val.strip():
        return default
    return int(val)


class Config:
    # Telegram User Client
    TELEGRAM_API_ID = _int("TELEGRAM_API_ID")
    TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
    TELEGRAM_SESSION_PATH = os.getenv("TELEGRAM_SESSION_PATH", "../session.session")

    # Telegram Bot
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_ADMIN_CHAT_ID = _int("TELEGRAM_ADMIN_CHAT_ID")

    # Claude API
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Analysis
    ANALYSIS_BATCH_SIZE = _int("ANALYSIS_BATCH_SIZE", 20)
    ANALYSIS_BATCH_TIMEOUT = _int("ANALYSIS_BATCH_TIMEOUT", 60)

    # Scheduler
    DAILY_SUMMARY_HOUR = _int("DAILY_SUMMARY_HOUR", 9)

    # Alerts
    ALERT_URGENCY_THRESHOLD = _int("ALERT_URGENCY_THRESHOLD", 3)

    # Timezone
    TIMEZONE = "Europe/Istanbul"


config = Config()
