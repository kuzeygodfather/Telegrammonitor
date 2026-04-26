from database import get_db
db = get_db()

r1 = db.table("alerts").select("user_id", count="exact", head=True).eq("user_id", 1).execute()
r2 = db.table("alerts").select("user_id", count="exact", head=True).is_("user_id", "null").execute()
print(f"alerts user_id=1: {r1.count}")
print(f"alerts user_id=NULL: {r2.count}")

r3 = db.table("alerts").select("id,user_id,title,created_at,urgency").order("created_at", desc=True).limit(5).execute()
print("Son 5 alert:")
for a in r3.data:
    print(f"  uid={a['user_id']} | {a['created_at']} | U:{a['urgency']} | {a['title'][:60]}")

r4 = db.table("messages").select("id,created_at,sender_name").eq("user_id", 1).order("created_at", desc=True).limit(3).execute()
print("Son mesajlar:")
for m in r4.data:
    print(f"  {m['created_at']} | {m['sender_name']}")

r5 = db.table("topics").select("id,user_id,title,last_message_at").order("last_message_at", desc=True).limit(5).execute()
print("Son topics:")
for t in r5.data:
    print(f"  uid={t['user_id']} | {t['last_message_at']} | {t['title'][:50]}")
