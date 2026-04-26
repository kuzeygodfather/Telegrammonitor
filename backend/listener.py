
import asyncio
import logging
from pathlib import Path
from telethon import TelegramClient, events
from telethon.tl.types import Channel, Chat, User
from config import config
from database import get_db
from prefilter import should_skip

logger = logging.getLogger(__name__)

class TelegramListener:
    def __init__(self, message_queue):
        self.message_queue = message_queue
        self._keywords = set()
        self._monitored_groups = set()
        self._running = False
        self.db = get_db()
        session_path = Path(__file__).parent.parent / config.TELEGRAM_SESSION_PATH
        self.client = TelegramClient(
            str(session_path.resolve()),
            config.TELEGRAM_API_ID,
            config.TELEGRAM_API_HASH,
        )

    def _load_keywords(self):
        result = self.db.table("keywords").select("keyword").eq("is_active", True).execute()
        self._keywords = {row["keyword"].lower() for row in result.data}
        logger.info(f"Yuklenen anahtar kelime sayisi: {len(self._keywords)}")

    def refresh_keywords(self):
        self._load_keywords()

    def _load_monitored_groups(self):
        result = self.db.table("groups").select("id").eq("is_monitored", True).execute()
        self._monitored_groups = {row["id"] for row in result.data}

    def refresh_groups(self):
        self._load_monitored_groups()

    def _check_keywords(self, text):
        if not text: return []
        text_lower = text.lower()
        return [kw for kw in self._keywords if kw in text_lower]

    async def _sync_groups(self):
        existing_ids = set()
        result = self.db.table("groups").select("id").execute()
        existing_ids = {row["id"] for row in result.data}
        count = 0
        async for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            if isinstance(entity, (Channel, Chat)):
                chat_id = dialog.id
                group_data = {
                    "id": chat_id,
                    "title": dialog.title or "Bilinmeyen Grup",
                    "is_monitored": True,
                    "member_count": getattr(entity, "participants_count", None),
                }
                if chat_id in existing_ids:
                    self.db.table("groups").update({
                        "title": group_data["title"],
                        "member_count": group_data["member_count"],
                    }).eq("id", chat_id).execute()
                else:
                    self.db.table("groups").insert(group_data).execute()
                count += 1
        self._load_monitored_groups()
        logger.info(f"Toplam {count} grup senkronize edildi, {len(self._monitored_groups)} izleniyor")

    async def start(self):
        self._running = True
        # Session varsa direkt connect et, yoksa hata ver
        await self.client.connect()
        if not await self.client.is_user_authorized():
            logger.error("Session yetkisiz! Lutfen once PC'de create_session.py calistirin ve session.session dosyasini sunucuya kopyalayin.")
            return
        logger.info("Telegram client basladi (session ile)")
        await self._sync_groups()
        self._load_keywords()

    def stop(self):
        self._running = False
        self.client.disconnect()

