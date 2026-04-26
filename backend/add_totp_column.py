from database import get_db
db = get_db()

# Check if column exists
r = db.table("users").select("*").limit(1).execute()
cols = list(r.data[0].keys()) if r.data else []
print("Current columns:", cols)

if "totp_secret" not in cols:
    # Add column via Supabase RPC or direct
    # Since we can't ALTER TABLE via REST, try setting it
    print("totp_secret column missing - need to add via Supabase dashboard")
    print("SQL: ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL;")
else:
    print("totp_secret column exists")
