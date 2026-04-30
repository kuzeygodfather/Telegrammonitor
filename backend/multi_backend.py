"""
Coklu kullanici backend - her aktif kullanici icin ayri Telethon listener calistirir.
v3: 
- Tum anlamli mesajlar kaydedilir (should_skip sadece bos/bot icin)
- Keyword eslesmesi Anthropic'ten BAGIMSIZ alert uretir
- Reply loop optimize edildi (3sn -> 5sn, sadece pending varsa)
"""
import asyncio
import logging
import sys
import os
import glob
from pathlib import Path
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).parent))

from config import config
from database import get_db
from analyzer import MessageAnalyzer
from notifier import TelegramNotifier
from reply_sender import ReplySender
from prefilter import is_bot_message
from telethon import TelegramClient, events
from telethon.tl.types import Channel, Chat, User

log_dir = Path(__file__).parent.parent / "data"
log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(log_dir / "monitor.log", encoding="utf-8")],
)
logger = logging.getLogger(__name__)


def clean_session_locks():
    """Baslangicta eski session lock dosyalarini temizle."""
    base = Path("/opt/telegram-monitor")
    patterns = ["*.session-journal", "*.session-wal", "*.session-shm"]
    for pattern in patterns:
        for f in base.glob(pattern):
            try:
                f.unlink()
                logger.info(f"Temizlendi: {f}")
            except Exception as _e:
                pass
        for f in (base / "sessions").glob(pattern):
            try:
                f.unlink()
                logger.info(f"Temizlendi: {f}")
            except Exception as _e:
                pass


# Global session lock: ayni session dosyasini birden fazla listener acmasin
_session_locks: set = set()
_session_locks_lock = asyncio.Lock() if hasattr(asyncio, 'Lock') else None

def is_empty_or_trivial(text: str) -> bool:
    """
    Sadece tamamen bos veya anlamsiz mesajlari atla.
    Eski should_skip'in aksine, anlamli kisa mesajlari KAYDET.
    """
    if not text or not text.strip():
        return True
    stripped = text.strip()
    # Sadece tek karakter veya bos
    if len(stripped) <= 1:
        return True
    # Sadece noktalama
    if stripped in {".", "..", "...", "?", "!", "+", "-"}:
        return True
    return False


def create_keyword_alert(db, user_id: int, msg_id: int, group_id: int,
                          group_title: str, sender_name: str,
                          text: str, matched: list):
    """
    Anthropic'ten BAGIMSIZ keyword alert olustur.
    API key olmasa bile calisir.
    """
    try:
        # Keyword kategorilerine gore urgency belirle
        kw_lower = [k.lower() for k in matched]

        # DB'den keyword kategorilerini al — dinamik urgency
        kw_cats = {}
        try:
            r = db.table("keywords").select("keyword,category").eq("user_id", user_id).execute()
            for row in (r.data or []):
                kw_cats[row["keyword"].lower()] = row.get("category", "issue")
        except Exception:
            pass

        urgency = 3
        durum = "ONAY_BEKLIYOR"
        for kw in kw_lower:
            cat = kw_cats.get(kw, "issue")
            if cat == "critical":
                urgency = max(urgency, 5)
                durum = "AKSIYON_GEREKLI"
            elif cat == "issue":
                urgency = max(urgency, 4)
                if durum != "AKSIYON_GEREKLI":
                    durum = "SORUN"
            elif cat == "finance":
                urgency = max(urgency, 3)
                if durum not in ("AKSIYON_GEREKLI", "SORUN"):
                    durum = "ONAY_BEKLIYOR"
            elif cat in ("brand", "person", "ops"):
                urgency = max(urgency, 3)

        kw_str = ", ".join(matched)
        title  = f"🔑 [{group_title[:30]}] {sender_name}: {kw_str}"
        desc   = f"Mesaj: {text[:200]}"

        db.table("alerts").insert({
            "analysis_id": None,
            "group_id": group_id,
            "title": title,
            "description": desc,
            "urgency": urgency,
            "is_read": False,
            "is_notified": False,
            "user_id": user_id,
        }).execute()

        logger.info(f"[KW-ALERT] user={user_id} grp={group_title[:20]} kw={matched} urgency={urgency}")
        # Topic olustur - Anthropicten bagimsiz
        try:
            from datetime import datetime, timezone as _tz
            _kw = ", ".join(matched)
            _summary = "Keyword: " + _kw + " | " + text[:200]
            db.table("topics").insert({
                "title": (sender_name[:30] + ": " + _kw)[:100],
                "summary": _summary,
                "durum": durum,
                "urgency": urgency,
                "status": "open",
                "group_id": group_id,
                "user_id": user_id,
                "last_message_at": datetime.now(_tz.utc).isoformat(),
                "message_count": 1,
                "last_aksiyon": "Keyword: " + _kw,
            }).execute()
        except Exception as _te:
            pass

        return urgency

    except Exception as e:
        logger.error(f"Keyword alert hatasi: {e}")
        return 0


class UserListener:
    def __init__(self, user_id: int, username: str, session_path: str, api_key: str,
                 ai_provider: str = None, ai_model: str = None):
        self.user_id = user_id
        self.username = username
        self.api_key = api_key
        self.ai_provider = ai_provider
        self.ai_model = ai_model
        self.db = get_db()
        self._keywords: set[str] = set()
        self._monitored_groups: set[int] = set()
        self.message_queue: asyncio.Queue = asyncio.Queue()
        self.client = TelegramClient(session_path, config.TELEGRAM_API_ID, config.TELEGRAM_API_HASH)
        self._my_names: set = set()
        self._auto_reply_settings: dict = {"enabled": False}
        self._watched_personnel: set = set()
        self._my_telegram_id: int = 0

    def _load_keywords(self):
        result = self.db.table("keywords").select("keyword,category").eq("is_active", True).eq("user_id", self.user_id).execute()
        self._keywords = set()
        self._watched_personnel: set[str] = set()
        for r in (result.data or []):
            kw = r["keyword"].strip().lower()
            cat = r.get("category", "custom")
            if cat in ("personnel", "person"):
                self._watched_personnel.add(kw)
            elif cat != "totp":
                self._keywords.add(kw)

    def _load_groups(self):
        result = self.db.table("groups").select("id").eq("is_monitored", True).eq("user_id", self.user_id).execute()
        self._monitored_groups = {r["id"] for r in result.data} if result.data else set()

    def _check_keywords(self, text: str) -> list[str]:
        if not self._keywords:
            return []
        text_lower = text.lower()
        return [kw for kw in self._keywords if kw.strip() in text_lower]

    def _load_auto_reply_settings(self):
        try:
            if not hasattr(self, "_my_names"):
                self._my_names = set()
            user = self.db.table("users").select("username,phone").eq("id", self.user_id).execute()
            if user.data:
                self._my_names.add(user.data[0]["username"].lower())
            for name in ["Beyazit Karacelebi", "naibbeyy", "beyazit", "Beyazit"]:
                self._my_names.add(name.lower())
            self._my_names.add(self.username.lower())
            ar = self.db.table("auto_reply_settings").select("*").eq("user_id", self.user_id).execute()
            if ar.data:
                self._auto_reply_settings = ar.data[0]
            else:
                self._auto_reply_settings = {"enabled": False}
        except Exception as e:
            logger.error(f"[{self.username}] Auto-reply settings load error: {e}")
            self._auto_reply_settings = {"enabled": False}

    def _is_mention(self, event_msg, text: str, sender_name: str) -> bool:
        text_lower = text.lower()
        for name in self._my_names:
            if f"@{name}" in text_lower:
                return True
        for name in self._my_names:
            if len(name) >= 5 and name in text_lower:
                return True
        return False

    async def sync_groups(self):
        existing = {r["id"] for r in self.db.table("groups").select("id").eq("user_id", self.user_id).execute().data}
        count = 0
        async for dialog in self.client.iter_dialogs():
            entity = dialog.entity
            if isinstance(entity, (Channel, Chat)):
                cid = dialog.id
                data = {"id": cid, "title": dialog.title or "?",
                        "member_count": getattr(entity, "participants_count", None), "user_id": self.user_id}
                if cid in existing:
                    self.db.table("groups").update({"title": data["title"], "member_count": data["member_count"]}).eq("id", cid).eq("user_id", self.user_id).execute()
                else:
                    try:
                        self.db.table("groups").insert(data).execute()
                    except Exception:
                        try:
                            self.db.table("groups").update({"title": data["title"], "member_count": data["member_count"]}).eq("id", cid).execute()
                        except Exception:
                            pass
                count += 1
        self._load_groups()
        logger.info(f"[{self.username}] {count} grup senkronize, {len(self._monitored_groups)} izleniyor")

    async def start(self):
        try:
            await self.client.connect()
        except Exception as e:
            logger.error(f"[{self.username}] Baglanti hatasi: {e}")
            return

        if not await self.client.is_user_authorized():
            logger.error(f"[{self.username}] Session yetkisiz!")
            return

        try:
            me = await self.client.get_me()
            self._my_telegram_id = me.id
            self._my_names.add((me.first_name or "").lower())
            if me.last_name:
                self._my_names.add(f"{me.first_name} {me.last_name}".lower())
            if me.username:
                self._my_names.add(me.username.lower())
            logger.info(f"[{self.username}] My TG ID: {self._my_telegram_id}")
        except Exception as _e:
            pass

        logger.info(f"[{self.username}] Telegram baglandi")
        await self.sync_groups()
        self._load_keywords()
        self._load_auto_reply_settings()

        notifier = TelegramNotifier()

        # Analyzer - sadece API key varsa, YOKSA mesajlar yine de kaydedilir
        if self.api_key:
            from ai_provider import get_provider_for_user
            _user_data = {"api_key": self.api_key,
                          "ai_provider": getattr(self, "ai_provider", None),
                          "ai_model":    getattr(self, "ai_model",    None)}
            provider = get_provider_for_user(_user_data)
            if provider:
                analyzer = MessageAnalyzer(self.message_queue, on_alert=notifier.send_alert if notifier.bot else None)
                analyzer.set_provider(provider)
                asyncio.create_task(analyzer.consume_queue())
                logger.info(f"[{self.username}] AI analiz AKTIF ({_user_data.get('ai_provider','anthropic')})")
            else:
                logger.warning(f"[{self.username}] Provider olusturulamadi")
        else:
            logger.info(f"[{self.username}] AI analiz DEVRE DISI - keyword alert'leri aktif")

        reply_task = asyncio.create_task(self._reply_loop())
        auto_reply_task = asyncio.create_task(self._auto_reply_loop())

        async def refresh():
            while True:
                await asyncio.sleep(60)
                try:
                    self._load_groups()
                    self._load_keywords()
                    self._load_auto_reply_settings()
                except Exception as _e:
                    pass
        asyncio.create_task(refresh())

        async def cleanup():
            while True:
                await asyncio.sleep(1800)
                try:
                    cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()
                    self.db.table("topics").update({"status": "resolved"}).eq("status", "open").eq("user_id", self.user_id).lt("last_message_at", cutoff).execute()
                    self.db.table("topics").update({"status": "resolved"}).eq("status", "open").eq("user_id", self.user_id).eq("durum", "RUTIN").execute()
                    self.db.table("topics").update({"status": "resolved"}).eq("status", "open").eq("user_id", self.user_id).eq("durum", "BILGI").lte("urgency", 2).execute()
                except Exception as _e:
                    pass
        asyncio.create_task(cleanup())

        # Grup title cache - DB sorgusu azalt
        _group_title_cache: dict = {}

        async def get_group_title(cid):
            if cid in _group_title_cache:
                return _group_title_cache[cid]
            gr = self.db.table("groups").select("title").eq("id", cid).eq("user_id", self.user_id).limit(1).execute()
            title = gr.data[0]["title"] if gr.data else "?"
            _group_title_cache[cid] = title
            return title

        @self.client.on(events.NewMessage)
        async def handler(event):
            try:
                chat = await event.get_chat()
                if not isinstance(chat, (Channel, Chat)):
                    return
                cid = event.chat_id
                if cid not in self._monitored_groups:
                    return
                text = event.message.text or ""

                # SADECE tamamen bos ve tek karakterli mesajlari atla
                if is_empty_or_trivial(text):
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

                # Bot mesajlarini atla
                if is_bot_message(sender_name):
                    return

                # Watched personnel - anlik bildirim
                sender_lower = sender_name.lower()
                is_watched = any(p in sender_lower for p in self._watched_personnel) if self._watched_personnel else False
                if is_watched and notifier.bot:
                    gtitle = await get_group_title(cid)
                    try:
                        await notifier.bot.send_message(
                            chat_id=notifier.admin_chat_id,
                            text=f"👁 <b>Personel Takip</b>\n\n<b>{sender_name}</b> yazdi:\n<b>Grup:</b> {gtitle}\n\n<i>{text[:500]}</i>",
                            parse_mode="HTML",
                        )
                    except Exception as e:
                        logger.error(f"Watched personnel bildirim hatasi: {e}")

                # Keyword kontrolü
                matched = self._check_keywords(text)

                # Mesaji DB'ye kaydet — API key olsun olmasin HER ZAMAN
                gtitle = await get_group_title(cid)
                result = self.db.table("messages").insert({
                    "telegram_msg_id": event.message.id, "group_id": cid,
                    "sender_name": sender_name, "sender_id": sender_id,
                    "text": text, "date": str(event.message.date),
                    "matched_keywords": matched, "user_id": self.user_id,
                }).execute()
                msg_id = result.data[0]["id"]

                # ── KEYWORD ALERT — Anthropic'ten BAGIMSIZ ──────────────
                if matched:
                    urgency = create_keyword_alert(
                        self.db, self.user_id, msg_id, cid,
                        gtitle, sender_name, text, matched
                    )
                    # Push bildirim gonder
                    try:
                        import requests as _req
                        kw_str = ", ".join(matched)
                        _req.post("http://localhost:8001/api/send-push", json={
                            "user_id": self.user_id,
                            "title": f"🔑 Keyword: {kw_str}",
                            "body": f"{sender_name} [{gtitle[:25]}]: {text[:80]}",
                            "durum": "SORUN" if urgency >= 4 else "ONAY_BEKLIYOR",
                            "url": "/alerts",
                        }, timeout=3)
                    except Exception:
                        pass
                    logger.info(f"[{self.username}] KW ALERT: {matched} | {sender_name}: {text[:50]}")

                # ── AI ANALIZE GONDER — sadece API key varsa ────────────
                if self.api_key:
                    should_analyze = len(text) > 15 or len(matched) > 0
                    if should_analyze:
                        await self.message_queue.put({
                            "message_id": msg_id, "group_id": cid, "group_title": gtitle,
                            "sender_name": sender_name, "text": text,
                            "matched_keywords": matched, "has_keyword": len(matched) > 0,
                            "date": str(event.message.date), "user_id": self.user_id,
                        })

                # === USER'S OWN MESSAGE DETECTION ===
                is_my_message = (sender_id == self._my_telegram_id and self._my_telegram_id > 0)
                if is_my_message:
                    logger.info(f"[{self.username}] MY MESSAGE in {cid}: '{text[:50]}'")
                    try:
                        now_str = datetime.now(timezone(timedelta(hours=3))).strftime("%H:%M")
                        if event.message.reply_to:
                            topic_id = None
                            replied_msg = self.db.table("messages").select("topic_id").eq("telegram_msg_id", event.message.reply_to.reply_to_msg_id).eq("group_id", cid).eq("user_id", self.user_id).limit(1).execute()
                            if replied_msg.data and replied_msg.data[0].get("topic_id"):
                                topic_id = replied_msg.data[0]["topic_id"]
                            else:
                                fallback = self.db.table("topics").select("id").eq("group_id", cid).eq("user_id", self.user_id).eq("status", "open").order("last_message_at", desc=True).limit(1).execute()
                                if fallback.data:
                                    topic_id = fallback.data[0]["id"]
                            if topic_id:
                                current = self.db.table("topics").select("summary,title,status").eq("id", topic_id).execute()
                                if current.data and current.data[0].get("status") == "open":
                                    old_summary = current.data[0].get("summary", "")
                                    new_summary = old_summary + "\n\nCOZUM:\n~" + now_str + " - " + sender_name + ": " + text[:300]
                                    self.db.table("topics").update({
                                        "status": "resolved", "durum": "BILGI",
                                        "summary": new_summary,
                                        "last_aksiyon": "COZULDU - " + sender_name + ": " + text[:150],
                                        "last_message_at": datetime.now(timezone.utc).isoformat(),
                                    }).eq("id", topic_id).execute()
                                    logger.info(f"[{self.username}] Topic #{topic_id} resolved")
                            self.db.table("pending_mentions").update({"replied": True}).eq("user_id", self.user_id).eq("group_id", cid).eq("replied", False).execute()
                        else:
                            one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
                            open_topics = self.db.table("topics").select("id,title,urgency").eq("group_id", cid).eq("user_id", self.user_id).eq("status", "open").gte("last_message_at", one_hour_ago).order("last_message_at", desc=True).limit(3).execute()
                            for topic in (open_topics.data or []):
                                if topic["urgency"] >= 3:
                                    self.db.table("topics").update({
                                        "last_aksiyon": f"Kullanici grupta aktif ({now_str})",
                                    }).eq("id", topic["id"]).execute()
                            self.db.table("pending_mentions").update({"replied": True}).eq("user_id", self.user_id).eq("group_id", cid).eq("replied", False).execute()
                    except Exception as ar_err:
                        logger.error(f"[{self.username}] Auto-resolve error: {ar_err}")

                # Mention detection for auto-reply
                if self._auto_reply_settings.get("enabled") and sender_id != self._my_telegram_id:
                    is_mention = self._is_mention(event.message, text, sender_name)
                    if event.message.reply_to and not is_mention and self._my_telegram_id:
                        try:
                            reply_msg = await self.client.get_messages(cid, ids=event.message.reply_to.reply_to_msg_id)
                            if reply_msg and getattr(reply_msg, "sender_id", 0) == self._my_telegram_id:
                                is_mention = True
                        except Exception as _e:
                            pass
                    if is_mention:
                        try:
                            ctx_msgs = self.db.table("messages").select("sender_name,text,date").eq("group_id", cid).eq("user_id", self.user_id).order("created_at", desc=True).limit(10).execute()
                            context = [{"sender": m["sender_name"], "text": (m.get("text") or "")[:200], "time": str(m.get("date",""))} for m in reversed(ctx_msgs.data or [])]
                            self.db.table("pending_mentions").insert({
                                "user_id": self.user_id, "group_id": cid,
                                "message_id": event.message.id, "sender_name": sender_name,
                                "message_text": text[:500], "conversation_context": context,
                            }).execute()
                        except Exception as me:
                            logger.error(f"[{self.username}] Mention save error: {me}")

            except Exception as e:
                logger.error(f"[{self.username}] Handler hatasi: {e}")

        logger.info(f"[{self.username}] Dinleme aktif! (Tum mesajlar kaydedilecek, keyword alert Anthropic'ten bagimsiz)")
        await self.client.run_until_disconnected()

    async def _auto_reply_loop(self):
        while True:
            try:
                await asyncio.sleep(60)
                self._load_auto_reply_settings()
                if not self._auto_reply_settings.get("enabled"):
                    continue
                timeout = self._auto_reply_settings.get("timeout_minutes", 20)
                message = self._auto_reply_settings.get("message", "Su an musait degilim, en kisa surede donecegim.")
                only_work = self._auto_reply_settings.get("only_work_hours", False)
                if only_work:
                    now = datetime.now(timezone(timedelta(hours=3)))
                    current = now.strftime("%H:%M")
                    ws = self._auto_reply_settings.get("work_start", "09:00")
                    we = self._auto_reply_settings.get("work_end", "18:00")
                    if ws <= we:
                        if ws <= current <= we:
                            continue
                    else:
                        if current >= ws or current <= we:
                            continue
                cutoff = (datetime.now(timezone.utc) - timedelta(minutes=timeout)).isoformat()
                pending = self.db.table("pending_mentions").select("*").eq("user_id", self.user_id).eq("replied", False).eq("auto_replied", False).lt("mentioned_at", cutoff).execute()
                for mention in (pending.data or []):
                    try:
                        replied_manually = False
                        for name in self._my_names:
                            check = self.db.table("messages").select("id").eq("group_id", mention["group_id"]).ilike("sender_name", f"%{name}%").gt("date", mention["mentioned_at"]).limit(1).execute()
                            if check.data:
                                replied_manually = True
                                break
                        if replied_manually:
                            self.db.table("pending_mentions").update({"replied": True}).eq("id", mention["id"]).execute()
                            continue
                        suggested_reply = message
                        if self.api_key:
                            try:
                                import requests as _req
                                res = _req.post("http://localhost:8001/api/style/generate-reply", json={
                                    "user_id": self.user_id, "sender_name": mention.get("sender_name", ""),
                                    "original_message": mention.get("message_text", ""), "group_id": mention.get("group_id", 0),
                                }, timeout=30)
                                data = res.json()
                                if data.get("suggestion"):
                                    suggested_reply = data["suggestion"]
                            except Exception as _e:
                                pass
                        gr = self.db.table("groups").select("title").eq("id", mention["group_id"]).limit(1).execute()
                        gtitle = gr.data[0]["title"] if gr.data else "?"
                        self.db.table("reply_suggestions").insert({
                            "user_id": self.user_id, "group_id": mention["group_id"],
                            "group_title": gtitle, "sender_name": mention.get("sender_name", ""),
                            "original_message": mention.get("message_text", ""),
                            "suggested_reply": suggested_reply,
                            "telegram_msg_id": mention.get("message_id", 0), "status": "pending",
                            "conversation_context": mention.get("conversation_context", []),
                        }).execute()
                        self.db.table("pending_mentions").update({"auto_replied": True}).eq("id", mention["id"]).execute()
                        try:
                            import requests as _req
                            _req.post("http://localhost:8001/api/send-push", json={
                                "user_id": self.user_id,
                                "title": f"Yanit Bekliyor: {mention.get('sender_name', '?')}",
                                "body": f"'{mention.get('message_text', '')[:80]}' - Onayiniz bekleniyor",
                                "durum": "AKSIYON_GEREKLI", "url": "/smart-reply",
                            }, timeout=5)
                        except Exception as _e:
                            pass
                    except Exception as pe:
                        logger.error(f"[{self.username}] Pending mention error: {pe}")
            except Exception as e:
                logger.error(f"[{self.username}] Auto-reply loop error: {e}")

    async def _reply_loop(self):
        """Pending reply'lari gonder."""
        while True:
            try:
                result = self.db.table("replies").select("*").eq("status", "pending").eq("user_id", self.user_id).execute()
                if result.data:
                    for r in result.data:
                        try:
                            from datetime import datetime, timezone as _tz
                            group_id = r["group_id"]
                            text     = r["text"]
                            reply_to = r.get("reply_to_msg_id")
                            await self.client.send_message(
                                group_id, text,
                                reply_to=reply_to if reply_to else None
                            )
                            self.db.table("replies").update({
                                "status": "sent",
                                "sent_at": datetime.now(_tz.utc).isoformat()
                            }).eq("id", r["id"]).execute()
                            logger.info(f"[{self.username}] Mesaj gonderildi: grp={group_id} txt={text[:50]}")
                        except Exception as e:
                            err_str = str(e)
                            if "write in this chat" in err_str or "broadcast" in err_str.lower():
                                status = "error:kanal-yazilmaz"
                                logger.warning(f"[{self.username}] Kanal mesaj yasakli: grp={r['group_id']}")
                            elif "flood" in err_str.lower():
                                status = "pending"
                                logger.warning(f"[{self.username}] FloodWait - retry")
                            else:
                                status = "failed"
                                logger.error(f"[{self.username}] Reply hatasi: {e}")
                            if status != "pending":
                                self.db.table("replies").update({"status": status}).eq("id", r["id"]).execute()
            except Exception as _e:
                pass
            await asyncio.sleep(5)


async def _supervised_listener(user_data: dict, session_path: str):
    """Listener'i supervised calistir: crash olursa otomatik yeniden baslat.
    Session lock ile ayni dosyanin 2 kez acilmasini engeller."""
    from security import decrypt_secret as _decrypt
    global _session_locks
    username = user_data["username"]
    
    # Session lock kontrolu
    if session_path in _session_locks:
        logger.warning(f"[{username}] Session zaten aktif: {session_path} - SKIP")
        return
    _session_locks.add(session_path)
    logger.info(f"[{username}] Session lock alindi: {session_path}")
    
    backoff = 5
    listener = None
    try:
        while True:
            try:
                # Onceki client varsa temiz kapat
                if listener and listener.client:
                    try:
                        if listener.client.is_connected():
                            await listener.client.disconnect()
                            logger.info(f"[{username}] Eski client disconnect edildi")
                    except Exception as dc_err:
                        logger.warning(f"[{username}] Disconnect hatasi (onemsiz): {dc_err}")
                    listener = None
                    # SQLite WAL flush icin kisa bekle
                    await asyncio.sleep(1)
                
                listener = UserListener(
                    user_id=user_data["id"],
                    username=username,
                    session_path=session_path,
                    api_key=_decrypt(user_data.get("api_key") or ""),
                    ai_provider=user_data.get("ai_provider"),
                    ai_model=user_data.get("ai_model"),
                )
                backoff = 5  # Basarili baglantida backoff sifirla
                await listener.start()
                logger.warning(f"[{username}] listener.start() bitti - yeniden baslatiliyor")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"[{username}] listener crash: {e}", exc_info=True)
            # Backoff: 5s -> 10s -> 30s -> 60s (max)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
    finally:
        # Her durumda lock'u birak
        _session_locks.discard(session_path)
        logger.info(f"[{username}] Session lock birakildi: {session_path}")
        if listener and listener.client:
            try:
                if listener.client.is_connected():
                    await listener.client.disconnect()
            except Exception:
                pass


async def main():
    logger.info("=" * 50)
    logger.info("  TG Monitor - Coklu Kullanici Backend v4")
    logger.info("  Self-healing: listener crash -> auto-restart")
    logger.info("  Keyword alert: AI'dan BAGIMSIZ")
    logger.info("=" * 50)

    clean_session_locks()
    db = get_db()
    sessions_dir = Path("/opt/telegram-monitor/sessions")
    sessions_dir.mkdir(exist_ok=True)

    from security import decrypt_secret as _decrypt
    users = db.table("users").select(
        "id,username,session_name,api_key,ai_provider,ai_model,is_active"
    ).eq("is_active", True).execute().data or []

    if not users:
        logger.warning("Aktif kullanici yok!")
        # Yine de check_new_users calismaya devam etmeli
        users = []

    tasks = []
    active_tasks: dict = {}  # user_id -> asyncio.Task

    def _resolve_session(user):
        user_session = sessions_dir / (user["username"] + ".session")
        legacy = Path("/opt/telegram-monitor") / ((user.get("session_name") or "") + ".session")
        if user_session.exists():
            return str(sessions_dir / user["username"])
        if user.get("session_name") and legacy.exists():
            return str(Path("/opt/telegram-monitor") / user["session_name"])
        return None

    for user in users:
        session_path = _resolve_session(user)
        if not session_path:
            logger.warning(f"[{user['username']}] Session dosyasi bulunamadi! Atlandi.")
            continue
        if not _decrypt(user.get("api_key") or ""):
            logger.warning(f"[{user['username']}] API key yok - AI analiz devre disi, keyword alert aktif")
        task = asyncio.create_task(_supervised_listener(user, session_path))
        tasks.append(task)
        active_tasks[user["id"]] = task
        logger.info(f"Kullanici baslatildi: {user['username']} (ID:{user['id']}) [supervised]")

    logger.info(f"Toplam {len(tasks)} kullanici dinleniyor")

    async def check_new_users():
        while True:
            await asyncio.sleep(30)
            try:
                current = db.table("users").select(
                    "id,username,session_name,api_key,ai_provider,ai_model"
                ).eq("is_active", True).execute().data or []
                live_ids = {u["id"] for u in current}
                
                # Deaktif edilen kullanicilarin task'larini cancel et
                for uid in list(active_tasks.keys()):
                    if uid not in live_ids:
                        old_task = active_tasks.pop(uid, None)
                        if old_task and not old_task.done():
                            old_task.cancel()
                            logger.info(f"Deaktif kullanici task cancel edildi: uid={uid}")
                
                # Yeni kullanicilari baslat
                for user in current:
                    uid = user["id"]
                    # Zaten calisan ve bitmemis task varsa skip
                    existing_task = active_tasks.get(uid)
                    if existing_task and not existing_task.done():
                        continue
                    session_path = _resolve_session(user)
                    if not session_path:
                        continue
                    task = asyncio.create_task(_supervised_listener(user, session_path))
                    tasks.append(task)
                    active_tasks[uid] = task
                    logger.info(f"Yeni kullanici eklendi (supervised): {user['username']}")
            except Exception as e:
                logger.error(f"check_new_users hatasi: {e}")

    tasks.append(asyncio.create_task(check_new_users()))
    # return_exceptions=True: bir task crash etse digerleri etkilenmez
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            logger.error(f"Task #{i} fatal: {r}")


if __name__ == "__main__":
    asyncio.run(main())
