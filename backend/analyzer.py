import asyncio
import json
import logging
import uuid
from anthropic import AsyncAnthropic
from config import config
from database import get_db

logger = logging.getLogger(__name__)


class MessageAnalyzer:
    def __init__(self, message_queue: asyncio.Queue, on_alert=None):
        self.message_queue = message_queue
        self.on_alert = on_alert  # callback: async def on_alert(alert_data)
        self.client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
        self.db = get_db()
        self._running = False

    async def consume_queue(self):
        """Queue'dan mesajlari al, batch'le ve analiz et."""
        self._running = True
        logger.info("Analyzer baslatildi")

        while self._running:
            batch = []
            try:
                msg = await asyncio.wait_for(
                    self.message_queue.get(), timeout=60
                )
                batch.append(msg)

                deadline = asyncio.get_event_loop().time() + config.ANALYSIS_BATCH_TIMEOUT
                while len(batch) < config.ANALYSIS_BATCH_SIZE:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        msg = await asyncio.wait_for(
                            self.message_queue.get(), timeout=remaining
                        )
                        batch.append(msg)
                    except asyncio.TimeoutError:
                        break

                if batch:
                    await self._analyze_batch(batch)

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Analyzer hatasi: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def _analyze_batch(self, batch: list[dict]):
        """Mesaj batch'ini Claude API ile analiz et."""
        batch_id = str(uuid.uuid4())[:8]
        logger.info(f"Batch analiz basliyor: {len(batch)} mesaj (batch_id: {batch_id})")

        messages_text = ""
        for i, msg in enumerate(batch, 1):
            messages_text += (
                f"\n--- Mesaj {i} ---\n"
                f"Grup: {msg['group_title']}\n"
                f"Gonderen: {msg['sender_name']}\n"
                f"Tarih: {msg['date']}\n"
                f"Eslesen Anahtar Kelimeler: {', '.join(msg['matched_keywords'])}\n"
                f"Mesaj: {msg['text']}\n"
            )

        prompt = f"""Sen bir is yoneticisinin Telegram grup mesajlarini analiz eden bir asistansin.
Asagidaki mesajlari analiz et ve her biri icin JSON formatinda sonuc don.

Her mesaj icin su bilgileri ver:
- message_index: Mesaj numarasi (1'den baslar)
- summary: Tek cumlede ozet (Turkce)
- sentiment: "positive", "negative", "neutral" veya "urgent"
- category: "complaint" (sikayet), "mention" (bahsetme), "issue" (sorun), "info" (bilgi), "praise" (ovgu), "request" (talep)
- urgency: 1-5 arasi (1=dusuk, 5=acil mudahale gerekli)
- action_needed: true/false
- action_description: Eger aksiyon gerekiyorsa ne yapilmali (Turkce)

Mesajlar:
{messages_text}

SADECE JSON array olarak yanit ver, baska bir sey yazma:
[{{"message_index": 1, "summary": "...", "sentiment": "...", "category": "...", "urgency": 1, "action_needed": false, "action_description": ""}}]"""

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = response.content[0].text.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            results = json.loads(response_text)

            for result in results:
                idx = result.get("message_index", 1) - 1
                if idx < 0 or idx >= len(batch):
                    continue

                msg = batch[idx]

                # Analiz kaydet
                analysis_data = {
                    "message_id": msg["message_id"],
                    "batch_id": batch_id,
                    "summary": result.get("summary", ""),
                    "sentiment": result.get("sentiment", "neutral"),
                    "category": result.get("category", "info"),
                    "urgency": result.get("urgency", 1),
                    "details": result,
                }
                analysis_result = self.db.table("analyses").insert(analysis_data).execute()
                analysis_id = analysis_result.data[0]["id"]

                # Yuksek oncelikli ise alert olustur
                if result.get("urgency", 1) >= config.ALERT_URGENCY_THRESHOLD:
                    alert_data = {
                        "analysis_id": analysis_id,
                        "group_id": msg["group_id"],
                        "title": result.get("summary", "Acil Uyari"),
                        "description": result.get("action_description", ""),
                        "urgency": result.get("urgency", 4),
                    }
                    alert_result = self.db.table("alerts").insert(alert_data).execute()
                    alert = alert_result.data[0]

                    notification_data = {
                        "id": alert["id"],
                        "group_id": msg["group_id"],
                        "group_title": msg["group_title"],
                        "title": alert["title"],
                        "description": alert["description"],
                        "urgency": alert["urgency"],
                        "sender_name": msg["sender_name"],
                        "text": msg["text"][:200],
                        "created_at": alert["created_at"],
                    }

                    if self.on_alert:
                        await self.on_alert(notification_data)

                    logger.warning(
                        f"ALERT: [{msg['group_title']}] {alert['title']} (urgency: {alert['urgency']})"
                    )

            logger.info(f"Batch analiz tamamlandi: {len(results)} sonuc")

        except json.JSONDecodeError as e:
            logger.error(f"Claude yaniti JSON parse hatasi: {e}")
        except Exception as e:
            logger.error(f"Batch analiz hatasi: {e}", exc_info=True)

    def stop(self):
        self._running = False
