import os
from pathlib import Path
from dotenv import load_dotenv

# .env dosyasini yukle (proje kokunden)
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


class Config:
    # Telegram User Client
    TELEGRAM_API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
    TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
    TELEGRAM_SESSION_PATH = os.getenv("TELEGRAM_SESSION_PATH", "../session.session")

    # Telegram Bot
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_ADMIN_CHAT_ID = int(os.getenv("TELEGRAM_ADMIN_CHAT_ID", "0"))

    # Claude API
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # Supabase
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

    # Analysis
    ANALYSIS_BATCH_SIZE = int(os.getenv("ANALYSIS_BATCH_SIZE", "10"))
    ANALYSIS_BATCH_TIMEOUT = int(os.getenv("ANALYSIS_BATCH_TIMEOUT", "30"))

    # Scheduler
    DAILY_SUMMARY_HOUR = int(os.getenv("DAILY_SUMMARY_HOUR", "9"))

    # Alerts
    ALERT_URGENCY_THRESHOLD = int(os.getenv("ALERT_URGENCY_THRESHOLD", "4"))

    # Timezone
    TIMEZONE = "Europe/Istanbul"


config = Config()
