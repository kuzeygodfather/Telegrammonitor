import asyncio
import json
import logging
import uuid
from anthropic import AsyncAnthropic
from config import config
from database import get_db

logger = logging.getLogger(__name__)


class MessageAnalyzer:
    """
    2 katmanli analiz sistemi:
    1. Haiku: Buyuk batch (500 mesaj) - hizli tarama, onemli/onemsiz ayirimi
    2. Sonnet: Kucuk batch (100 mesaj) - sadece onemli mesajlarin detayli analizi
    """

    def __init__(self, message_queue: asyncio.Queue, on_alert=None):
        self.message_queue = message_queue
        self.on_alert = on_alert
        self.client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
        self.db = get_db()
        self._running = False

        # Batch ayarlari
        self.HAIKU_BATCH_SIZE = 500       # Haiku icin buyuk batch
        self.HAIKU_BATCH_TIMEOUT = 120    # 2 dakika bekle
        self.SONNET_BATCH_SIZE = 100      # Sonnet icin orta batch
        self._sonnet_queue: asyncio.Queue = asyncio.Queue()

    async def consume_queue(self):
        """Ana queue'dan mesajlari al, Haiku ile tara."""
        self._running = True
        logger.info("Analyzer baslatildi - 2 katmanli: Haiku tarama + Sonnet analiz")

        # Sonnet worker'i baslat
        sonnet_task = asyncio.create_task(self._sonnet_worker())

        while self._running:
            batch = []
            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=60)
                batch.append(msg)

                # Keyword eslesen mesajlar direkt Sonnet'e
                if msg.get("has_keyword"):
                    await self._sonnet_queue.put(msg)
                    batch.pop()  # Haiku batch'inden cikar

                deadline = asyncio.get_event_loop().time() + self.HAIKU_BATCH_TIMEOUT
                while len(batch) < self.HAIKU_BATCH_SIZE:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        msg = await asyncio.wait_for(self.message_queue.get(), timeout=remaining)
                        if msg.get("has_keyword"):
                            await self._sonnet_queue.put(msg)
                        else:
                            batch.append(msg)
                    except asyncio.TimeoutError:
                        break

                if batch:
                    await self._haiku_screen(batch)

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Analyzer hatasi: {e}", exc_info=True)
                await asyncio.sleep(5)

        sonnet_task.cancel()

    async def _haiku_screen(self, batch: list[dict]):
        """Haiku ile hizli tarama - sadece onemli mesajlarin indekslerini dondur."""
        batch_id = str(uuid.uuid4())[:8]
        logger.info(f"Haiku tarama: {len(batch)} mesaj (batch_id: {batch_id})")

        # Mesajlari formatla - sadece numara, grup, mesaj (minimum token)
        lines = []
        for i, msg in enumerate(batch, 1):
            lines.append(f"{i}|{msg['group_title']}|{msg['sender_name']}|{msg['text'][:300]}")
        messages_block = "\n".join(lines)

        prompt = f"""Bir sirket genel muduru icin Telegram mesajlarini tara.
Her mesaj: numara|grup|gonderen|mesaj

SADECE yoneticinin bilmesi gereken onemli mesajlarin numaralarini don:
- Sorunlar, sikayetler, krizler
- Odeme/finans konulari
- Musteri sorunlari
- Personel meseleleri
- Teknik arizalar
- Onemli kararlar

Gunluk sohbet, selamlasma, emoji, kisa yanit = ONEMLI DEGIL, dahil etme.

Mesajlar:
{messages_block}

SADECE onemli mesaj numaralarini JSON array olarak don, baska hicbir sey yazma:
[1, 5, 12, 34]
Eger hicbiri onemli degilse bos array don: []"""

        try:
            response = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = response.content[0].text.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            important_indices = json.loads(response_text)

            if not isinstance(important_indices, list):
                important_indices = []

            important_count = 0
            for idx in important_indices:
                if isinstance(idx, int) and 1 <= idx <= len(batch):
                    msg = batch[idx - 1]
                    await self._sonnet_queue.put(msg)
                    important_count += 1

            # Onemsiz mesajlar icin basit analiz kaydet (API cagirmadan)
            unimportant_indices = set(range(len(batch))) - {i - 1 for i in important_indices if isinstance(i, int) and 1 <= i <= len(batch)}
            for idx in unimportant_indices:
                msg = batch[idx]
                self.db.table("analyses").insert({
                    "message_id": msg["message_id"],
                    "batch_id": batch_id,
                    "summary": "",
                    "sentiment": "neutral",
                    "category": "info",
                    "urgency": 1,
                    "details": {"screened_by": "haiku", "important": False},
                }).execute()

            logger.info(f"Haiku tarama tamamlandi: {len(batch)} mesajdan {important_count} tanesi onemli")

        except Exception as e:
            logger.error(f"Haiku tarama hatasi: {e}", exc_info=True)
            # Hata durumunda hepsini Sonnet'e gonder
            for msg in batch[:50]:
                await self._sonnet_queue.put(msg)

    async def _sonnet_worker(self):
        """Sonnet ile detayli analiz - sadece onemli mesajlar."""
        logger.info("Sonnet worker baslatildi")

        while self._running:
            batch = []
            try:
                msg = await asyncio.wait_for(self._sonnet_queue.get(), timeout=60)
                batch.append(msg)

                deadline = asyncio.get_event_loop().time() + 30
                while len(batch) < self.SONNET_BATCH_SIZE:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        msg = await asyncio.wait_for(self._sonnet_queue.get(), timeout=remaining)
                        batch.append(msg)
                    except asyncio.TimeoutError:
                        break

                if batch:
                    await self._sonnet_analyze(batch)

            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Sonnet worker hatasi: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def _sonnet_analyze(self, batch: list[dict]):
        """Sonnet ile detayli analiz."""
        batch_id = str(uuid.uuid4())[:8]
        logger.info(f"Sonnet analiz: {len(batch)} onemli mesaj (batch_id: {batch_id})")

        messages_text = ""
        for i, msg in enumerate(batch, 1):
            kw_info = f" [KEYWORD: {', '.join(msg['matched_keywords'])}]" if msg.get("has_keyword") else ""
            messages_text += f"\n{i}|{msg['group_title']}|{msg['sender_name']}|{msg['date']}{kw_info}|{msg['text'][:500]}\n"

        prompt = f"""Sirket genel muduru icin Telegram mesajlarini analiz et.
Format: numara|grup|gonderen|tarih|mesaj

Her mesaj icin JSON:
- i: mesaj numarasi
- s: ozet (Turkce, 1 cumle)
- t: konu ("Odeme Sorunu","Musteri Sikayeti","Personel","Teknik Ariza","Karar","Bilgi" vs)
- se: sentiment (positive/negative/neutral/urgent)
- c: category (complaint/issue/financial/staff/customer/technical/info/decision/praise)
- u: urgency 1-5
- r: yoneticiyi ilgilendiriyor mu (true/false)
- a: aksiyon gerekli mi (true/false)
- ad: aksiyon aciklamasi (Turkce, bossa "")

KEYWORD isaretli mesajlarin urgency'si EN AZ 3 olmali.

Mesajlar:
{messages_text}

SADECE JSON array don:
[{{"i":1,"s":"...","t":"...","se":"...","c":"...","u":3,"r":true,"a":false,"ad":""}}]"""

        try:
            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4000,
                messages=[{"role": "user", "content": prompt}],
            )

            response_text = response.content[0].text.strip()
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

            results = json.loads(response_text)

            for result in results:
                idx = result.get("i", 1) - 1
                if idx < 0 or idx >= len(batch):
                    continue

                msg = batch[idx]
                urgency = result.get("u", 3)
                if msg.get("has_keyword") and urgency < 3:
                    urgency = 3

                analysis_data = {
                    "message_id": msg["message_id"],
                    "batch_id": batch_id,
                    "summary": result.get("s", ""),
                    "sentiment": result.get("se", "neutral"),
                    "category": result.get("c", "info"),
                    "urgency": urgency,
                    "details": {
                        "topic": result.get("t", ""),
                        "relevant_to_manager": result.get("r", True),
                        "action_needed": result.get("a", False),
                        "action_description": result.get("ad", ""),
                    },
                }
                analysis_result = self.db.table("analyses").insert(analysis_data).execute()
                analysis_id = analysis_result.data[0]["id"]

                should_alert = (
                    urgency >= config.ALERT_URGENCY_THRESHOLD
                    or (result.get("r") and urgency >= 3)
                    or result.get("a")
                )

                if should_alert:
                    topic = result.get("t", "Bildirim")
                    alert_data = {
                        "analysis_id": analysis_id,
                        "group_id": msg["group_id"],
                        "title": f"[{topic}] {result.get('s', 'Yeni uyari')}",
                        "description": result.get("ad", ""),
                        "urgency": urgency,
                    }
                    alert_result = self.db.table("alerts").insert(alert_data).execute()
                    alert = alert_result.data[0]

                    if self.on_alert:
                        await self.on_alert({
                            "id": alert["id"],
                            "group_id": msg["group_id"],
                            "group_title": msg["group_title"],
                            "title": alert["title"],
                            "description": alert["description"],
                            "urgency": alert["urgency"],
                            "sender_name": msg["sender_name"],
                            "text": msg["text"][:200],
                            "created_at": alert["created_at"],
                        })

                    logger.warning(f"ALERT [{topic}]: [{msg['group_title']}] {result.get('s', '')[:80]}")

            logger.info(f"Sonnet analiz tamamlandi: {len(results)} mesaj")

        except json.JSONDecodeError as e:
            logger.error(f"Sonnet JSON parse hatasi: {e}")
        except Exception as e:
            logger.error(f"Sonnet analiz hatasi: {e}", exc_info=True)

    def stop(self):
        self._running = False
