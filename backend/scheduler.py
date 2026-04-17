import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from config import config
from database import get_db

logger = logging.getLogger(__name__)

IST = ZoneInfo("Europe/Istanbul")


def generate_daily_summary() -> str:
    """Son 24 saatin ozetini olustur."""
    db = get_db()
    since = (datetime.now(IST) - timedelta(hours=24)).isoformat()

    # Toplam mesaj
    msg_result = db.table("messages").select("id", count="exact").gte("created_at", since).execute()
    msg_count = msg_result.count or 0

    # Toplam alert
    alert_result = db.table("alerts").select("id", count="exact").gte("created_at", since).execute()
    alert_count = alert_result.count or 0

    # Grup bazinda mesaj sayilari
    # Supabase'den grup bazli istatistik
    group_stats_result = db.rpc("get_group_stats").execute()
    group_stats = group_stats_result.data[:5] if group_stats_result.data else []

    # Okunmamis alertler
    unread_result = (
        db.table("alerts")
        .select("title, urgency, group_id, groups(title)")
        .eq("is_read", False)
        .order("urgency", desc=True)
        .limit(5)
        .execute()
    )
    unread_alerts = unread_result.data or []

    # Ozet metni olustur
    now_ist = datetime.now(IST).strftime("%d.%m.%Y %H:%M")
    lines = []
    lines.append(f"📌 <b>Gunluk Ozet - {now_ist} (Istanbul)</b>\n")
    lines.append(f"Toplam Yakalanan Mesaj: <b>{msg_count}</b>")
    lines.append(f"Olusturulan Uyari: <b>{alert_count}</b>\n")

    if group_stats:
        lines.append("<b>En Aktif Gruplar:</b>")
        for gs in group_stats:
            lines.append(f"  • {gs['title']}: {gs['message_count']} mesaj")
        lines.append("")

    if unread_alerts:
        lines.append("<b>Okunmamis Uyarilar:</b>")
        for alert in unread_alerts:
            emoji = "🔴" if alert["urgency"] >= 4 else "🟡"
            group_title = alert.get("groups", {}).get("title", "?") if alert.get("groups") else "?"
            lines.append(f"  {emoji} [{group_title}] {alert['title']}")
        lines.append("")

    return "\n".join(lines)


def setup_scheduler(notifier) -> AsyncIOScheduler:
    """APScheduler'i Istanbul saatine gore ayarla."""
    scheduler = AsyncIOScheduler(timezone=IST)

    async def daily_job():
        logger.info("Gunluk ozet hazirlaniyor...")
        summary = generate_daily_summary()
        await notifier.send_daily_summary(summary)

    scheduler.add_job(
        daily_job,
        "cron",
        hour=config.DAILY_SUMMARY_HOUR,
        minute=0,
        timezone=IST,
        id="daily_summary",
    )

    scheduler.start()
    logger.info(f"Scheduler baslatildi (Istanbul saati) - gunluk ozet: {config.DAILY_SUMMARY_HOUR}:00")
    return scheduler
