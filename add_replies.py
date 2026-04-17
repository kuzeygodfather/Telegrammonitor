import psycopg2

conn = psycopg2.connect("postgresql://postgres:bbb333444!!**@db.baeinghtjwxrubrenzxx.supabase.co:5432/postgres")
conn.autocommit = True
cur = conn.cursor()

sqls = [
    """CREATE TABLE IF NOT EXISTS replies (
        id BIGSERIAL PRIMARY KEY,
        group_id BIGINT NOT NULL,
        reply_to_msg_id BIGINT,
        text TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT now(),
        sent_at TIMESTAMPTZ
    )""",
    "ALTER TABLE replies ENABLE ROW LEVEL SECURITY",
    "CREATE POLICY \"anon_insert_replies\" ON replies FOR INSERT WITH CHECK (true)",
    "CREATE POLICY \"anon_read_replies\" ON replies FOR SELECT USING (true)",
    "CREATE POLICY \"service_all_replies\" ON replies FOR ALL USING (auth.role() = 'service_role')",
]

for sql in sqls:
    try:
        cur.execute(sql)
        print(f"OK: {sql[:60]}...")
    except Exception as e:
        print(f"SKIP: {str(e)[:60]}")

cur.close()
conn.close()
print("\nreplies tablosu hazir!")
