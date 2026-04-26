"""
Supabase'deki 'replies' tablosunu izler ve Telethon ile mesaj gonderir.
Frontend panelden yazilan cevaplar buradan gonderilir.
"""
import asyncio
import logging
from datetime import datetime, timezone
from database import get_db

logger = logging.getLogger(__name__)


class ReplySender:
    def __init__(self, telethon_client):
        self.client = telethon_client
        self.db = get_db()
        self._running = False

    async def start(self):
        """Pending cevaplari izle ve gonder."""
        self._running = True
        logger.info("Reply sender baslatildi - bekleyen cevaplar izleniyor")

        while self._running:
            try:
                # Pending cevaplari al
                result = self.db.table("replies").select("*").eq("status", "pending").execute()
                pending = result.data or []

                for reply in pending:
                    try:
                        group_id = reply["group_id"]
                        text = reply["text"]
                        reply_to = reply.get("reply_to_msg_id")

                        # Telethon ile mesaj gonder
                        await self.client.send_message(
                            group_id,
                            text,
                            reply_to=reply_to if reply_to else None,
                        )

                        # Durumu guncelle
                        self.db.table("replies").update({
                            "status": "sent",
                            "sent_at": datetime.now(timezone.utc).isoformat(),
                        }).eq("id", reply["id"]).execute()

                        logger.info(f"Cevap gonderildi: grup={group_id}, mesaj={text[:50]}...")

                    except Exception as e:
                        logger.error(f"Cevap gonderme hatasi (id={reply['id']}): {e}")
                        self.db.table("replies").update({
                            "status": f"error: {str(e)[:100]}",
                        }).eq("id", reply["id"]).execute()

            except Exception as e:
                logger.error(f"Reply sender hatasi: {e}")

            await asyncio.sleep(3)  # 3 saniyede bir kontrol et

    def stop(self):
        self._running = False
