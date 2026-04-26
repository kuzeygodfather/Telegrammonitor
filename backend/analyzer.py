import asyncio
import json
import logging
import uuid

# Push notification helper
import requests as _push_requests

def send_push_to_user(user_id, title, body, durum="BILGI", url="/alerts"):
    """Send push notification via setup API."""
    try:
        _push_requests.post("http://localhost:8001/api/send-push", json={
            "user_id": user_id, "title": title, "body": body,
            "durum": durum, "url": url, "tag": f"topic-{durum}",
        }, timeout=5)
    except Exception as _e:
        pass
from datetime import datetime, timedelta, timezone
from ai_provider import AIProvider, get_provider_for_user
from config import config
from database import get_db

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Sen Beyazit Bey'in kisisel is asistanisin. BIA, Benjabet, Dilbet, Dopamin markalarinin GENEL YONETICISI icin calisiyorsun.

GOREV: Gelen mesajlari analiz et ve SORUNUN HIKAYESINI anlat.

TEMEL KURALLAR:
1. BIRLESTIR. Ayni kullanici/ayni islem/ayni sorun = TEK KONU.
   - Ayni UID/PID/kullanici adi gecen mesajlar = ayni konu
   - Ayni cekim/yatirma islemi hakkinda farkli kisilerden mesajlar = ayni konu
   - Ayni teknik sorun (ornek: site erisim) hakkinda mesajlar = ayni konu
   - Benzer alarm/metrik mesajlari = ayni konu

2. FALSE POSITIVE ENGELLE:
   - Normal is akisi = RUTIN (konu olusturma). Ornek: "geri arama talebi", "mesai basladi", "shift degisimi"
   - Bot mesajlari = RUTIN
   - Bilgilendirme = BILGI (dusuk oncelik)
   - Basarili tamamlanan islemler = RUTIN

3. HER KONU ICIN HIKAYE ANLAT:
   Sorunun basindan sonuna ne oldu, kim ne yapti, simdi ne durumda.

4. PROAKTIF OL. Ne yapilmasi gerektigini net soyle. KIM yapmali belirt.

ONCELIK REHBERI:
1 = Rutin bilgi, aksyon yok
2 = Takip et, acil degil
3 = Ilgilen, bugun icinde
4 = Acil, 30dk icinde
5 = Kriz, HEMEN

CIKTI FORMATI:
JSON array don. Her eleman:
{
  "i": mesaj_no,
  "tid": mevcut_topic_id veya null,
  "t": "Konu basligi (KISA. ornek: UID 27837 - 2K Cekim Gecikmesi)",
  "d": "SORUN"|"ONAY_BEKLIYOR"|"AKSIYON_GEREKLI"|"BILGI"|"RUTIN",
  "p": oncelik 1-5,
  "m": true/false (mevcut konuyla birlestir),
  "sorun": "1 cumlede sorun ne (ornek: 2.000 TL cekim 40 dakikadir odeme kurulusunda bekliyor)",
  "kronoloji": [
    {"saat": "15:29", "olay": "Cekim olusturuldu (2.000 TL, ParaHavale)"},
    {"saat": "15:32", "olay": "esrefbenja islemi onayladi"},
    {"saat": "16:09", "olay": "Kara bildirdi: odeme kurulusunda hala bekliyor, 40dk gecti"}
  ],
  "son_durum": "COZULMEDI - Odeme kurulusunda bekliyor, musteri sikayetci",
  "aksiyon": "Finans: Odeme kurulusuyla iletisime gecin, musteriye bilgi verin"
}

KRONOLOJI KURALLARI:
- Mesajlardaki saat bilgilerini kullan
- Her onemli adimi yaz: islem olusturma, onay, red, bekleme, sikayet
- Kim ne yapti belirt
- Eger mevcut konuya ekleme yapiyorsan, ONCEKI kronolojinin USTUNE yeni olaylari ekle
- Saat bilgisi yoksa "~HH:MM" ile tahmin et

BIRLESTIRME KURALLARI:
- Eger mesajda gecen UID, PID, kullanici adi veya islem ACIK KONULAR'da varsa: tid=o_konunun_id, m=true
- Eger ayni gruptaki benzer sorun ACIK KONULAR'da varsa: tid=o_konunun_id, m=true
- Yeni konu SADECE gercekten yeni bir sorun/islem oldugunda olustur
- RUTIN mesajlar icin konu OLUSTURMA, sadece JSON'da d="RUTIN" olarak isle"""


class MessageAnalyzer:
    def __init__(self, message_queue: asyncio.Queue, on_alert=None):
        self.message_queue = message_queue
        self.on_alert = on_alert
        self.client = None  # user bazinda atanir: set_provider()
        self.db = get_db()
        self._running = False
        self.HAIKU_BATCH_SIZE = 800
        self.HAIKU_BATCH_TIMEOUT = 120
        self.SONNET_BATCH_SIZE = 20
        self._sonnet_queue: asyncio.Queue = asyncio.Queue()

    def _get_group_context(self, group_ids: list[int]) -> dict[int, dict]:
        """Gruplarin AI tanimlama bilgilerini getir."""
        contexts = {}
        for gid in set(group_ids):
            result = self.db.table("groups").select("id,title,description,important_topics,ignore_topics,my_interests").eq("id", gid).execute()
            if result.data:
                g = result.data[0]
                if g.get("description") or g.get("important_topics"):
                    contexts[gid] = g
        return contexts

    def _get_recent_topics(self, group_ids: list[int]) -> list[dict]:
        """Son 12 saatteki acik konulari getir - daha genis pencere ile daha iyi birlestirme."""
        since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
        all_topics = []
        for gid in set(group_ids):
            result = self.db.table("topics").select(
                "id,title,summary,durum,urgency,message_count,group_id"
            ).eq("group_id", gid).eq("status", "open").gte(
                "last_message_at", since
            ).order("last_message_at", desc=True).limit(20).execute()
            all_topics.extend(result.data or [])
        return all_topics

    def _get_topic_messages(self, topic_id: int) -> list[dict]:
        """Bir konunun tum mesajlarini getir - hikaye olusturmak icin."""
        result = self.db.table("messages").select(
            "sender_name,text,date"
        ).eq("topic_id", topic_id).order("date", ascending=True).limit(30).execute()
        return result.data or []

    def _update_topic(self, topic_id: int, summary: str, durum: str, urgency: int, aksiyon: str):
        current = self.db.table("topics").select("message_count,urgency").eq("id", topic_id).execute()
        if current.data:
            new_count = current.data[0]["message_count"] + 1
            new_urgency = max(current.data[0]["urgency"], urgency)
            self.db.table("topics").update({
                "summary": summary, "durum": durum, "urgency": new_urgency,
                "last_aksiyon": aksiyon, "last_message_at": datetime.now(timezone.utc).isoformat(),
                "message_count": new_count,
            }).eq("id", topic_id).execute()
            # Push if urgency escalated to critical
            if new_urgency >= 4 and current.data[0]["urgency"] < 4:
                # Get user_id from topic
                topic_data = self.db.table("topics").select("user_id,title").eq("id", topic_id).execute()
                if topic_data.data:
                    send_push_to_user(topic_data.data[0].get("user_id", 0), f"[YUKSELEN] {topic_data.data[0].get('title', '')[:50]}", aksiyon[:100] if aksiyon else "", durum, "/alerts")

    def _create_topic(self, group_id: int, title: str, summary: str, durum: str, urgency: int, aksiyon: str, user_id: int = None) -> int:
        result = self.db.table("topics").insert({
            "group_id": group_id, "title": title, "summary": summary,
            "durum": durum, "urgency": urgency, "status": "open",
            "last_aksiyon": aksiyon, "message_count": 1,
            "user_id": user_id,
        }).execute()
        topic_id_new = result.data[0]["id"]
        # Send push notification for new topics with urgency >= 3
        if urgency >= 3 and user_id:
            send_push_to_user(user_id, f"[{durum}] {title[:50]}", aksiyon[:100] if aksiyon else summary[:100], durum, "/alerts")
        return topic_id_new

    def _find_similar_topic(self, group_id: int, title: str, existing_topics: list[dict]) -> int | None:
        """Ayni gruptaki benzer baslikli acik konuyu bul - gelismis eslestirme."""
        title_lower = title.lower()

        # UID, PID gibi tanimlayicilari cikar
        import re
        uid_match = re.findall(r'uid\s*(\d+)', title_lower)
        pid_match = re.findall(r'pid\s*(\d+)', title_lower)

        for t in existing_topics:
            if t["group_id"] != group_id:
                continue
            existing_lower = t["title"].lower()

            # UID eslesmesi - kesin birlestir
            if uid_match:
                for uid in uid_match:
                    if uid in existing_lower:
                        return t["id"]

            # PID eslesmesi - kesin birlestir
            if pid_match:
                for pid in pid_match:
                    if pid in existing_lower:
                        return t["id"]

            # Kelime benzerlik kontrolu
            words = set(title_lower.split()) - {"bir", "ve", "ile", "icin", "tl", "-", "bia", "benjabet", "dilbet", "dopamin"}
            existing_words = set(existing_lower.split()) - {"bir", "ve", "ile", "icin", "tl", "-", "bia", "benjabet", "dilbet", "dopamin"}
            common = words & existing_words
            # 3+ anlamli ortak kelime varsa birlestir
            if len(common) >= 3:
                return t["id"]
            # Kullanici adi eslesmesi (2+ kelime)
            if len(common) >= 2 and any(len(w) > 4 for w in common):
                return t["id"]
        return None

    def set_provider(self, provider):
        """User provider/model'a gore AI client ata."""
        self.client = provider

    async def consume_queue(self):
        self._running = True
        logger.info("Analyzer v4 baslatildi - hikaye odakli analiz")
        sonnet_task = asyncio.create_task(self._sonnet_worker())
        while self._running:
            batch = []
            try:
                msg = await asyncio.wait_for(self.message_queue.get(), timeout=60)
                batch.append(msg)
                if msg.get("has_keyword"):
                    await self._sonnet_queue.put(msg)
                    batch.pop()
                deadline = asyncio.get_event_loop().time() + self.HAIKU_BATCH_TIMEOUT
                while len(batch) < self.HAIKU_BATCH_SIZE:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0: break
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
        batch_id = str(uuid.uuid4())[:8]
        group_ids = list(set(m["group_id"] for m in batch))
        contexts = self._get_group_context(group_ids)

        ctx_text = ""
        if contexts:
            ctx_text = "\nGRUP TANIMLARI:\n"
            for gid, g in contexts.items():
                ctx_text += f"[{g['title']}]: {g.get('description','')}"
                if g.get('important_topics'): ctx_text += f" ONEMLI: {g['important_topics']}"
                if g.get('my_interests'): ctx_text += f" YONETICIYI ILGILENDIREN: {g['my_interests']}"
                if g.get('ignore_topics'): ctx_text += f" ONEMSIZ: {g['ignore_topics']}"
                ctx_text += "\n"

        lines = [f"{i+1}|{m['group_title']}|{m['sender_name']}|{m['text'][:250]}" for i, m in enumerate(batch)]
        prompt = f"""Mesajlari tara. SADECE onemli olanlarin numaralarini don.
ONEMLI = sorun, hata, sikayet, fraud, onay bekleyen, cekim sorunu, teknik ariza.
ONEMSIZ = selamlasma, bot logu, bilgilendirme, rutin islem, shift baslangic, normal talep.
{ctx_text}
{chr(10).join(lines)}

JSON: [1,5,12] veya []"""
        try:
            text = await self.client.haiku_filter(prompt)
            if text.startswith("```"): text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            # Robust JSON parsing - extract array even from messy response
            try:
                indices = json.loads(text) if text.strip() else []
            except json.JSONDecodeError:
                # Try to extract array from text
                import re
                match = re.search(r"\[([\d,\s]*)\]", text)
                if match:
                    try:
                        indices = json.loads("[" + match.group(1) + "]")
                    except Exception:
                        indices = []
                else:
                    indices = []
            if not isinstance(indices, list): indices = []
            count = 0
            for idx in indices:
                if isinstance(idx, int) and 1 <= idx <= len(batch):
                    await self._sonnet_queue.put(batch[idx - 1])
                    count += 1
            important_set = {i - 1 for i in indices if isinstance(i, int) and 1 <= i <= len(batch)}
            # Skip inserting analysis for unimportant messages (saves DB calls + cost)
            # Only log count
            skipped = len(batch) - len(important_set)
            if skipped > 0:
                logger.debug(f"Haiku: {skipped} mesaj onemsiz - analiz kaydi atlanacak")
            logger.info(f"Haiku: {len(batch)} -> {count} onemli")
        except Exception as e:
            logger.error(f"Haiku hatasi: {e}", exc_info=True)
            # DON'T send all to Sonnet on error - only keyword-matched ones
            for msg in batch:
                if msg.get("has_keyword"):
                    await self._sonnet_queue.put(msg)

    async def _sonnet_worker(self):
        logger.info("Sonnet worker baslatildi")
        while self._running:
            batch = []
            try:
                msg = await asyncio.wait_for(self._sonnet_queue.get(), timeout=60)
                batch.append(msg)
                deadline = asyncio.get_event_loop().time() + 30
                while len(batch) < self.SONNET_BATCH_SIZE:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0: break
                    try:
                        msg = await asyncio.wait_for(self._sonnet_queue.get(), timeout=remaining)
                        batch.append(msg)
                    except asyncio.TimeoutError:
                        break
                if batch: await self._sonnet_analyze(batch)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Sonnet hatasi: {e}", exc_info=True)
                await asyncio.sleep(5)

    async def _sonnet_analyze(self, batch: list[dict]):
        batch_id = str(uuid.uuid4())[:8]
        batch_user_id = batch[0].get("user_id") if batch else None
        logger.info(f"Sonnet: {len(batch)} mesaj (user:{batch_user_id})")
        group_ids = list(set(m["group_id"] for m in batch))
        existing_topics = self._get_recent_topics(group_ids)
        contexts = self._get_group_context(group_ids)

        # Grup tanimlama bilgileri
        ctx_text = ""
        if contexts:
            ctx_text = "\nGRUP TANIMLARI (bu bilgilere gore analiz et):\n"
            for gid, g in contexts.items():
                ctx_text += f"[{g['title']}]: {g.get('description','')}"
                if g.get('important_topics'): ctx_text += f"\n  ONEMLI KONULAR: {g['important_topics']}"
                if g.get('ignore_topics'): ctx_text += f"\n  ONEMSIZ KONULAR: {g['ignore_topics']}"
                ctx_text += "\n"

        # Acik konulari daha detayli goster - birlestirme icin
        topics_info = ""
        if existing_topics:
            topics_info = "\nACIK KONULAR (BIRLESTIRME ICIN - ayni sorun/kullanici/islem varsa tid kullan!):\n"
            for t in existing_topics[:15]:
                summary_preview = (t.get('summary') or '')[:200]
                topics_info += f"  TID:{t['id']} | {t['title']} | {t['durum']}\n"

        msgs = ""
        for i, m in enumerate(batch, 1):
            kw = f" [KW:{','.join(m['matched_keywords'])}]" if m.get("has_keyword") else ""
            msgs += f"{i}|{m['group_title']}|{m['sender_name']}|{m['text'][:300]}{kw}\n"

        prompt = f"""{ctx_text}{topics_info}
MESAJLAR:
{msgs}

ONEMLI:
- Ayni kullanici/UID/islem hakkindaki mesajlari MUTLAKA mevcut konuyla birlestir (tid kullan).
- Her mesaj icin sorunun HIKAYESINI anlat: ne oldu, kim bildirdi, ne yapilmali.
- RUTIN mesajlar icin konu OLUSTURMA.
- Kronolojide mesajdaki saat bilgilerini kullan.

JSON array don:"""

        try:
            text = await self.client.sonnet_analyze(prompt, system=SYSTEM_PROMPT)
            if text.startswith("```"): text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            try:
                results = json.loads(text)
            except json.JSONDecodeError:
                # Try to extract JSON array from response
                import re
                match = re.search(r"\[.*\]", text, re.DOTALL)
                if match:
                    try:
                        results = json.loads(match.group(0))
                    except Exception:
                        logger.error(f"Sonnet JSON parse failed, skipping batch")
                        return
                else:
                    logger.error(f"No JSON array found in Sonnet response")
                    return

            smap = {"SORUN": "negative", "ONAY_BEKLIYOR": "urgent", "AKSIYON_GEREKLI": "urgent", "BILGI": "neutral", "RUTIN": "neutral"}
            cmap = {"SORUN": "issue", "ONAY_BEKLIYOR": "decision", "AKSIYON_GEREKLI": "issue", "BILGI": "info", "RUTIN": "info"}

            for r in results:
                idx = r.get("i", 1) - 1
                if idx < 0 or idx >= len(batch): continue
                msg = batch[idx]
                urgency = r.get("p", 3)
                if msg.get("has_keyword") and urgency < 3: urgency = 3
                durum = r.get("d", "BILGI")

                # Yeni yapilandirilmis alanlar
                sorun = r.get("sorun", "")
                kronoloji = r.get("kronoloji", [])
                son_durum = r.get("son_durum", "")
                aksiyon = r.get("aksiyon", "")
                konu_basligi = r.get("t", "")
                topic_id = r.get("tid")
                should_merge = r.get("m", False)

                # Yapilandirilmis ozet olustur
                structured_summary = self._build_structured_summary(sorun, kronoloji, son_durum, aksiyon)

                # Topic eslestirme
                if topic_id:
                    try:
                        # Mevcut konunun kronolojisini al ve yeni olaylari ekle
                        merged_summary = self._merge_topic_summary(topic_id, sorun, kronoloji, son_durum, aksiyon)
                        self._update_topic(topic_id, merged_summary, durum, urgency, aksiyon)
                    except Exception as e:
                        logger.warning(f"Topic update hatasi tid={topic_id}: {e}")
                        topic_id = None

                if not topic_id and konu_basligi and durum != "RUTIN":
                    # Benzer konu var mi kontrol et
                    similar = self._find_similar_topic(msg["group_id"], konu_basligi, existing_topics)
                    if similar:
                        topic_id = similar
                        merged_summary = self._merge_topic_summary(topic_id, sorun, kronoloji, son_durum, aksiyon)
                        self._update_topic(topic_id, merged_summary, durum, urgency, aksiyon)
                    else:
                        topic_id = self._create_topic(msg["group_id"], konu_basligi, structured_summary, durum, urgency, aksiyon, user_id=batch_user_id)
                        existing_topics.append({"id": topic_id, "title": konu_basligi, "summary": structured_summary, "durum": durum, "urgency": urgency, "message_count": 1, "group_id": msg["group_id"]})

                if topic_id:
                    self.db.table("messages").update({"topic_id": topic_id}).eq("id", msg["message_id"]).execute()

                analysis = self.db.table("analyses").insert({
                    "message_id": msg["message_id"], "batch_id": batch_id,
                    "summary": sorun or structured_summary[:200], "sentiment": smap.get(durum, "neutral"),
                    "category": cmap.get(durum, "info"), "urgency": urgency,
                    "details": {
                        "durum": durum, "topic": konu_basligi, "topic_id": topic_id,
                        "sorun": sorun,
                        "kronoloji": kronoloji,
                        "son_durum": son_durum,
                        "relevant_to_manager": durum != "RUTIN",
                        "action_needed": durum in ("SORUN", "ONAY_BEKLIYOR", "AKSIYON_GEREKLI"),
                        "action_description": aksiyon,
                    },
                }).execute()
                analysis_id = analysis.data[0]["id"]

                # Alert - sadece gercek sorunlar
                should_alert = (durum in ("SORUN", "AKSIYON_GEREKLI") and urgency >= 4) or (durum == "ONAY_BEKLIYOR" and urgency >= 3)

                if should_alert:
                    emoji = {"SORUN": "\U0001f534", "ONAY_BEKLIYOR": "\U0001f7e1", "AKSIYON_GEREKLI": "\U0001f7e0"}.get(durum, "\u26aa")
                    alert_title = f"{emoji} {sorun or konu_basligi}"
                    self.db.table("alerts").insert({"analysis_id": analysis_id, "group_id": msg["group_id"], "title": alert_title, "description": aksiyon, "urgency": urgency, "user_id": batch_user_id}).execute()

                    if self.on_alert:
                        await self.on_alert({"id": 0, "group_id": msg["group_id"], "group_title": msg["group_title"], "title": alert_title, "description": aksiyon, "urgency": urgency, "sender_name": msg["sender_name"], "text": msg["text"][:200], "created_at": datetime.now(timezone.utc).isoformat()})

                    logger.warning(f"{emoji} {durum} [{urgency}/5]: {sorun[:80] if sorun else konu_basligi[:80]}")

            logger.info(f"Sonnet: {len(results)} mesaj analiz edildi")
        except json.JSONDecodeError as e:
            logger.error(f"JSON hatasi: {e}")
        except Exception as e:
            logger.error(f"Sonnet hatasi: {e}", exc_info=True)

    def _build_structured_summary(self, sorun: str, kronoloji: list, son_durum: str, aksiyon: str) -> str:
        """Yapilandirilmis ozet metni olustur."""
        parts = []
        if sorun:
            parts.append(f"SORUN: {sorun}")
        if kronoloji:
            parts.append("KRONOLOJI:")
            for k in kronoloji:
                if isinstance(k, dict):
                    parts.append(f"  {k.get('saat', '?')} - {k.get('olay', '')}")
                elif isinstance(k, str):
                    parts.append(f"  {k}")
        if son_durum:
            parts.append(f"SON DURUM: {son_durum}")
        if aksiyon:
            parts.append(f"AKSIYON: {aksiyon}")
        return "\n".join(parts) if parts else sorun or ""

    def _merge_topic_summary(self, topic_id: int, new_sorun: str, new_kronoloji: list, new_son_durum: str, new_aksiyon: str) -> str:
        """Mevcut konunun ozetine yeni bilgileri ekle."""
        current = self.db.table("topics").select("summary").eq("id", topic_id).execute()
        old_summary = current.data[0]["summary"] if current.data else ""

        # Eski ozeti parse et
        old_lines = old_summary.split("\n") if old_summary else []
        old_kronoloji_lines = []
        old_sorun = ""
        in_kronoloji = False

        for line in old_lines:
            if line.startswith("SORUN:"):
                old_sorun = line[6:].strip()
            elif line.startswith("KRONOLOJI:"):
                in_kronoloji = True
            elif line.startswith("SON DURUM:") or line.startswith("AKSIYON:"):
                in_kronoloji = False
            elif in_kronoloji and line.strip():
                old_kronoloji_lines.append(line.strip())

        # Birlestir
        sorun = new_sorun or old_sorun

        # Kronoloji birlestir - yeni olaylari ekle
        merged_kronoloji = list(old_kronoloji_lines)
        for k in new_kronoloji:
            if isinstance(k, dict):
                new_line = f"{k.get('saat', '?')} - {k.get('olay', '')}"
            elif isinstance(k, str):
                new_line = k
            else:
                continue
            # Duplicate kontrolu
            if not any(new_line.strip() in existing for existing in merged_kronoloji):
                merged_kronoloji.append(new_line)

        son_durum = new_son_durum
        aksiyon = new_aksiyon

        # Yeni yapilandirilmis ozet
        parts = []
        if sorun:
            parts.append(f"SORUN: {sorun}")
        if merged_kronoloji:
            parts.append("KRONOLOJI:")
            for line in merged_kronoloji:
                if not line.startswith("  "):
                    parts.append(f"  {line}")
                else:
                    parts.append(line)
        if son_durum:
            parts.append(f"SON DURUM: {son_durum}")
        if aksiyon:
            parts.append(f"AKSIYON: {aksiyon}")

        return "\n".join(parts)

    def stop(self):
        self._running = False
