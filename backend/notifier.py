import logging
from telegram import Bot
from config import config

logger = logging.getLogger(__name__)

URGENCY_EMOJI = {1: "🟢", 2: "🔵", 3: "🟡", 4: "🟠", 5: "🔴"}


class TelegramNotifier:
    def __init__(self):
        self.bot = Bot(token=config.TELEGRAM_BOT_TOKEN) if config.TELEGRAM_BOT_TOKEN else None
        self.admin_chat_id = config.TELEGRAM_ADMIN_CHAT_ID

    async def send_alert(self, alert_data: dict):
        """Acil uyariyi Telegram DM olarak gonder."""
        if not self.bot or not self.admin_chat_id:
            logger.warning("Bot token veya admin chat ID ayarlanmamis, bildirim gonderilemedi")
            return

        emoji = URGENCY_EMOJI.get(alert_data.get("urgency", 3), "🟡")
        text = (
            f"{emoji} <b>Yeni Uyari</b> (Oncelik: {alert_data.get('urgency', '?')}/5)\n\n"
            f"<b>Grup:</b> {alert_data.get('group_title', 'Bilinmeyen')}\n"
            f"<b>Gonderen:</b> {alert_data.get('sender_name', 'Bilinmeyen')}\n"
            f"<b>Ozet:</b> {alert_data.get('title', '')}\n\n"
            f"<b>Mesaj:</b>\n<i>{alert_data.get('text', '')[:300]}</i>\n\n"
        )
        if alert_data.get("description"):
            text += f"<b>Onerilen Aksiyon:</b> {alert_data['description']}\n"

        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=text,
                parse_mode="HTML",
            )
            logger.info(f"Alert bildirimi gonderildi: {alert_data.get('title', '')[:50]}")
        except Exception as e:
            logger.error(f"Bildirim gonderme hatasi: {e}", exc_info=True)

    async def send_daily_summary(self, summary: str):
        """Gunluk ozet raporu gonder."""
        if not self.bot or not self.admin_chat_id:
            return

        text = f"📊 <b>Gunluk Telegram Ozet Raporu</b>\n\n{summary}"

        try:
            await self.bot.send_message(
                chat_id=self.admin_chat_id,
                text=text[:4096],
                parse_mode="HTML",
            )
            logger.info("Gunluk ozet gonderildi")
        except Exception as e:
            logger.error(f"Gunluk ozet gonderme hatasi: {e}", exc_info=True)
