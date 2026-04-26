from database import get_db
import json
db = get_db()

# 1. Close junk Sunucu-A Apex DNS topic
db.table("topics").update({"status": "resolved", "durum": "RUTIN", "urgency": 1}).eq("id", 3).execute()
print("Closed junk topic ID:3")

# 2. Move messages from topic 3 to 211
msgs = db.table("messages").select("id").eq("topic_id", 3).execute()
if msgs.data:
    for m in msgs.data:
        db.table("messages").update({"topic_id": 211}).eq("id", m["id"]).execute()
    print(f"Moved {len(msgs.data)} messages from topic 3 to 211")

# 3. Update topic 211
summary_lines = [
    "SORUN: Kostas art arda 750K ve 500K TL toplam 1.25M TL tether alim talebinde bulundu",
    "KRONOLOJI:",
    "  ~15:00 - Kostas 750K TL tether alim talebi",
    "  ~15:30 - Kostas 500K TL ek tether talebi",
    "SON DURUM: ONAY BEKLIYOR - Toplam 1.25M TL buyuk islem",
    "AKSIYON: Finans: ACIL buyuk islem onayi, risk kontrolu",
]
db.table("topics").update({
    "title": "Kostas - 1.25M TL Tether Alim Talebi",
    "summary": "\n".join(summary_lines),
    "urgency": 5,
    "durum": "ONAY_BEKLIYOR",
    "last_aksiyon": "Finans: ACIL buyuk islem onayi, risk kontrolu yapin"
}).eq("id", 211).execute()
print("Updated topic 211")

# 4. Close OpenVPN topics
r = db.table("topics").select("id,title,status,group_id").ilike("title", "%openvpn%").execute()
for t in r.data:
    print(f"OpenVPN: ID:{t['id']} Status:{t['status']} Group:{t['group_id']}")
    db.table("topics").update({"status": "resolved", "urgency": 1}).eq("id", t["id"]).execute()
    print(f"  Closed")

# Also close Apex DNS topics
r2 = db.table("topics").select("id,title,status").ilike("title", "%Apex DNS%").execute()
for t in r2.data:
    print(f"Apex DNS: ID:{t['id']} Status:{t['status']}")
    db.table("topics").update({"status": "resolved", "urgency": 1}).eq("id", t["id"]).execute()
    print(f"  Closed")

# 5. Find topics from disabled groups and close them
disabled = db.table("groups").select("id,title").eq("is_active", False).execute()
print(f"\nDisabled groups: {len(disabled.data)}")
for g in disabled.data:
    print(f"  {g['title']} (ID:{g['id']})")
    topics = db.table("topics").select("id,title").eq("group_id", g["id"]).eq("status", "open").execute()
    for t in topics.data:
        db.table("topics").update({"status": "resolved"}).eq("id", t["id"]).execute()
        print(f"    Closed topic: {t['title']}")

# 6. Fix urgency inconsistencies - RUTIN should not have high urgency
db.table("topics").update({"urgency": 1}).eq("durum", "RUTIN").gt("urgency", 1).execute()
print("\nFixed RUTIN topics with high urgency")

print("\nDone!")
