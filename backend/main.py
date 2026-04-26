
import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from config import config
from listener import TelegramListener
from analyzer import MessageAnalyzer
from notifier import TelegramNotifier
from scheduler import setup_scheduler
from reply_sender import ReplySender
from prefilter import should_skip, is_bot_message
from telethon import events
from telethon.tl.types import Channel, Chat, User

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

    message_queue = asyncio.Queue()
    notifier = TelegramNotifier()

    async def on_new_alert(alert_data):
        await notifier.send_alert(alert_data)

    analyzer = MessageAnalyzer(message_queue, on_alert=on_new_alert)
    listener = TelegramListener(message_queue)

    scheduler = setup_scheduler(notifier)
    analyzer_task = asyncio.create_task(analyzer.consume_queue())

    await listener.start()

    reply_sender = ReplySender(listener.client)
    reply_task = asyncio.create_task(reply_sender.start())

    @listener.client.on(events.NewMessage)
    async def handler(event):
        try:
            chat = await event.get_chat()
            if not isinstance(chat, (Channel, Chat)):
                return
            chat_id = event.chat_id
            if chat_id not in listener._monitored_groups:
                return
            text = event.message.text or ""
            if not text.strip():
                return
            matched = listener._check_keywords(text)
            if is_bot_message(sender_name) or (not matched and should_skip(text)):
                return
            sender = await event.get_sender()
            sender_name = "Bilinmeyen"
            sender_id = 0
            if sender:
                if isinstance(sender, User):
                    parts = [sender.first_name or "", sender.last_name or ""]
                    sender_name = " ".join(p for p in parts if p) or sender.username or "Bilinmeyen"
                else:
                    sender_name = getattr(sender, "title", "Bilinmeyen")
                sender_id = sender.id
            group_result = listener.db.table("groups").select("title").eq("id", chat_id).limit(1).execute()
            group_title = group_result.data[0]["title"] if group_result.data else "Bilinmeyen"
            msg_data = {
                "telegram_msg_id": event.message.id,
                "group_id": chat_id,
                "sender_name": sender_name,
                "sender_id": sender_id,
                "text": text,
                "date": str(event.message.date),
                "matched_keywords": matched,
            }
            result = listener.db.table("messages").insert(msg_data).execute()
            msg_id = result.data[0]["id"]
            await message_queue.put({
                "message_id": msg_id,
                "group_id": chat_id,
                "group_title": group_title,
                "sender_name": sender_name,
                "text": text,
                "matched_keywords": matched,
                "has_keyword": len(matched) > 0,
                "date": str(event.message.date),
            })
            if matched:
                logger.info(f"KEYWORD [{', '.join(matched)}] [{group_title}] {sender_name}: {text[:60]}...")
        except Exception as e:
            logger.error(f"Mesaj isleme hatasi: {e}", exc_info=True)


    # Periyodik grup ve keyword yenileme (60 saniyede bir)
    async def refresh_caches():
        while True:
            await asyncio.sleep(60)
            try:
                listener._load_monitored_groups()
                listener._load_keywords()
                logger.debug("Cache yenilendi")
            except Exception as e:
                logger.error(f"Cache yenileme hatasi: {e}")

    refresh_task = asyncio.create_task(refresh_caches())

    # Otomatik temizlik (her 30dk)
    async def auto_cleanup():
        while True:
            await asyncio.sleep(1800)
            try:
                from database import get_db
                db = get_db()
                from datetime import datetime, timedelta, timezone
                cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
                # 6 saatten eski acik konulari kapat
                db.table("topics").update({"status": "resolved"}).eq("status", "open").lt("last_message_at", cutoff).execute()
                # RUTIN konulari kapat
                db.table("topics").update({"status": "resolved"}).eq("status", "open").eq("durum", "RUTIN").execute()
                # Dusuk oncelikli BILGI kapat
                db.table("topics").update({"status": "resolved"}).eq("status", "open").eq("durum", "BILGI").lte("urgency", 2).execute()
                logger.info("Otomatik temizlik tamamlandi")
            except Exception as e:
                logger.error(f"Temizlik hatasi: {e}")

    cleanup_task = asyncio.create_task(auto_cleanup())
    logger.info("Dinleme + Cevap gonderme + Temizlik aktif!")
    await listener.client.run_until_disconnected()

if __name__ == "__main__":
    asyncio.run(main())

