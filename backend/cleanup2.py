from database import get_db
db = get_db()

# Find disabled groups and close their topics
r = db.table("groups").select("id,title,is_monitored").eq("is_monitored", False).execute()
print(f"Disabled groups: {len(r.data)}")
for g in r.data:
    gid = g["id"]
    gtitle = g["title"]
    print(f"  {gtitle} (ID:{gid})")
    topics = db.table("topics").select("id,title").eq("group_id", gid).eq("status", "open").execute()
    for t in topics.data:
        tid = t["id"]
        ttitle = t["title"]
        db.table("topics").update({"status": "resolved"}).eq("id", tid).execute()
        print(f"    Closed: {ttitle}")

# Fix RUTIN urgency
db.table("topics").update({"urgency": 1}).eq("durum", "RUTIN").gt("urgency", 1).execute()
print("Fixed RUTIN urgency")

# Close OpenVPN topics
r2 = db.table("topics").select("id,title").ilike("title", "%openvpn%").eq("status", "open").execute()
for t in r2.data:
    tid = t["id"]
    ttitle = t["title"]
    db.table("topics").update({"status": "resolved"}).eq("id", tid).execute()
    print(f"Closed OpenVPN: {ttitle}")

print("Done")
