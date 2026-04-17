import asyncio
import logging
from pathlib import Path
from telethon import TelegramClient, events
from telethon.tl.types import Channel, Chat, User
from config import config
from database import get_db

logger = logging.getLogger(__name__)


class TelegramListener:
    def __init__(self, message_queue: asyncio.Queue):
        self.message_queue = message_queue
        self._keywords: set[str] = set()
        self._monitored_groups: set[int] = set()
        self._running = False
        self.db = get_db()

        session_path = Path(__file__).parent.parent / config.TELEGRAM_SESSION_PATH
        self.client = TelegramClient(
            str(session_path.resolve()),
            config.TELEGRAM_API_ID,
            config.TELEGRAM_API_HASH,
        )

    def _load_keywords(self):
        """DB'den aktif anahtar kelimeleri yukle."""
        result = self.db.table("keywords").select("keyword").eq("is_active", True).execute()
        self._keywords = {row["keyword"].lower() for row in result.data}
        logger.info(f"Yuklenen anahtar kelime sayisi: {len(self._keywords)}")

    def refresh_keywords(self):
        """Disaridan keyword cache'i yenilemek icin."""
        self._load_keywords()

    def _load_monitored_groups(self):
        """DB'den izlenen gruplari yukle."""
        result = self.db.table("groups").select("id").eq("is_monitored", True).execute()
        self._monitored_groups = {row["id"] for row in result.data}

    def refresh_groups(self):
        """Disaridan group cache'i yenilemek icin."""
        self._load_monitored_groups()

    def _check_keywords(self, text: str) -> list[str]:
        """Mesajda anahtar kelime ara."""
        if not text:
            return []
        text_lower = text.lower()
        return [kw for kw in self._keywords if kw in text_lower]

    async def _sync_groups(self):
        """Telegram'daki tum gruplari DB'ye senkronize et."""
        existing_ids = set()
        result = self.db.table("groups").select("id").execute()
        existing_ids = {row["id"] for row in result.data}

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

        self._load_monitored_groups()
        logger.info(f"Senkronize edilen grup sayisi: {len(self._monitored_groups)}")

    async def start(self):
        """Telethon client'i baslat ve mesajlari dinle."""
        self._running = True
        await self.client.start()
        logger.info("Telegram client basladi")

        # Gruplari senkronize et
        await self._sync_groups()
        self._load_keywords()

        @self.client.on(events.NewMessage)
        async def handler(event):
            try:
                chat = await event.get_chat()
                if not isinstance(chat, (Channel, Chat)):
                    return

                chat_id = event.chat_id
                if chat_id not in self._monitored_groups:
                    return

                text = event.message.text or ""
                if not text.strip():
                    return

                matched = self._check_keywords(text)
                if not matched:
                    return

                # Sender bilgisi
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

                # Supabase'e kaydet
                msg_data = {
                    "telegram_msg_id": event.message.id,
                    "group_id": chat_id,
                    "sender_name": sender_name,
                    "sender_id": sender_id,
                    "text": text,
                    "date": str(event.message.date),
                    "matched_keywords": matched,
                }
                result = self.db.table("messages").insert(msg_data).execute()
                msg_id = result.data[0]["id"]

                # Grup basligini al
                group_result = self.db.table("groups").select("title").eq("id", chat_id).single().execute()
                group_title = group_result.data["title"] if group_result.data else "Bilinmeyen"

                # Queue'ya at (analyzer icin)
                await self.message_queue.put({
                    "message_id": msg_id,
                    "group_id": chat_id,
                    "group_title": group_title,
                    "sender_name": sender_name,
                    "text": text,
                    "matched_keywords": matched,
                    "date": str(event.message.date),
                })
                logger.info(
                    f"Mesaj yakalandi: [{group_title}] {sender_name}: {text[:50]}..."
                )

            except Exception as e:
                logger.error(f"Mesaj isleme hatasi: {e}", exc_info=True)

        logger.info("Mesaj dinleme baslatildi")
        await self.client.run_until_disconnected()

    def stop(self):
        """Client'i durdur."""
        self._running = False
        self.client.disconnect()
