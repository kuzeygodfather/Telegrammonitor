import asyncio
import logging
import sys
from pathlib import Path

# Backend dizinini path'e ekle
sys.path.insert(0, str(Path(__file__).parent))

from config import config
from listener import TelegramListener
from analyzer import MessageAnalyzer
from notifier import TelegramNotifier
from scheduler import setup_scheduler

# Logging
log_dir = Path(__file__).parent.parent / "data"
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(log_dir / "monitor.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


async def main():
    logger.info("=" * 50)
    logger.info("  Telegram Monitor Panel - Baslatiliyor")
    logger.info("  Saat dilimi: Europe/Istanbul")
    logger.info("  Veritabani: Supabase")
    logger.info("=" * 50)

    # Shared queue
    message_queue = asyncio.Queue()

    # Components
    notifier = TelegramNotifier()

    async def on_new_alert(alert_data: dict):
        """Yeni alert geldiginde Telegram DM gonder."""
        await notifier.send_alert(alert_data)

    analyzer = MessageAnalyzer(message_queue, on_alert=on_new_alert)
    listener = TelegramListener(message_queue)

    # Scheduler (Istanbul saati)
    scheduler = setup_scheduler(notifier)

    # Background tasks
    analyzer_task = asyncio.create_task(analyzer.consume_queue())

    logger.info("Tum bilesenler baslatildi! Telegram dinleniyor...")

    try:
        await listener.start()
    except KeyboardInterrupt:
        logger.info("Kapatiliyor...")
    finally:
        listener.stop()
        analyzer.stop()
        scheduler.shutdown()
        analyzer_task.cancel()


if __name__ == "__main__":
    asyncio.run(main())
