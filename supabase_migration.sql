-- Telegram Monitor Panel - Supabase Migration
-- =============================================

-- 1. GROUPS tablosu
CREATE TABLE IF NOT EXISTS groups (
    id BIGINT PRIMARY KEY,  -- Telegram chat_id
    title TEXT NOT NULL,
    is_monitored BOOLEAN DEFAULT true,
    member_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MESSAGES tablosu
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    telegram_msg_id BIGINT,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    sender_name TEXT,
    sender_id BIGINT,
    text TEXT,
    date TIMESTAMPTZ,
    matched_keywords JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ANALYSES tablosu
CREATE TABLE IF NOT EXISTS analyses (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT REFERENCES messages(id) ON DELETE CASCADE,
    batch_id TEXT,
    summary TEXT,
    sentiment TEXT,       -- positive/negative/neutral/urgent
    category TEXT,        -- complaint/mention/issue/info/praise/request
    urgency INTEGER,      -- 1-5
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ALERTS tablosu
CREATE TABLE IF NOT EXISTS alerts (
    id BIGSERIAL PRIMARY KEY,
    analysis_id BIGINT REFERENCES analyses(id) ON DELETE SET NULL,
    group_id BIGINT REFERENCES groups(id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    urgency INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. KEYWORDS tablosu
CREATE TABLE IF NOT EXISTS keywords (
    id BIGSERIAL PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    category TEXT DEFAULT 'custom',  -- brand/issue/person/custom
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_message_id ON analyses(message_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_urgency ON alerts(urgency DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_keywords_is_active ON keywords(is_active);

-- updated_at otomatik guncelleme
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS groups_updated_at ON groups;
CREATE TRIGGER groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Realtime aktif et
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Row Level Security (anon key ile frontend erisimi)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;

-- Anon key icin okuma izni (frontend)
CREATE POLICY "Allow anon read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Allow anon read messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Allow anon read analyses" ON analyses FOR SELECT USING (true);
CREATE POLICY "Allow anon read alerts" ON alerts FOR SELECT USING (true);
CREATE POLICY "Allow anon update alerts" ON alerts FOR UPDATE USING (true);
CREATE POLICY "Allow anon read keywords" ON keywords FOR SELECT USING (true);
CREATE POLICY "Allow anon insert keywords" ON keywords FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update keywords" ON keywords FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete keywords" ON keywords FOR DELETE USING (true);

-- Service role icin tam yetki (backend)
CREATE POLICY "Allow service_role all groups" ON groups FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role all messages" ON messages FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role all analyses" ON analyses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role all alerts" ON alerts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role all keywords" ON keywords FOR ALL USING (auth.role() = 'service_role');

-- Varsayilan anahtar kelimeler
INSERT INTO keywords (keyword, category) VALUES
    ('sorun', 'issue'),
    ('problem', 'issue'),
    ('sikayet', 'issue'),
    ('şikayet', 'issue'),
    ('acil', 'issue'),
    ('hata', 'issue'),
    ('gecikme', 'issue'),
    ('iptal', 'issue'),
    ('ariza', 'issue'),
    ('arıza', 'issue'),
    ('düşük', 'issue'),
    ('ödeme', 'issue'),
    ('müşteri', 'issue'),
    ('patron', 'person'),
    ('yönetici', 'person')
ON CONFLICT (keyword) DO NOTHING;

-- Dashboard icin view
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
    (SELECT count(*) FROM messages WHERE created_at >= now() - interval '24 hours') AS total_messages_today,
    (SELECT count(*) FROM alerts WHERE created_at >= now() - interval '24 hours') AS total_alerts,
    (SELECT count(*) FROM alerts WHERE is_read = false) AS unread_alerts,
    (SELECT count(*) FROM groups WHERE is_monitored = true) AS active_groups;

-- Saatlik mesaj dagilimi fonksiyonu
CREATE OR REPLACE FUNCTION get_messages_by_hour()
RETURNS TABLE(hour INTEGER, count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        EXTRACT(HOUR FROM m.created_at)::INTEGER AS hour,
        count(*)::BIGINT AS count
    FROM messages m
    WHERE m.created_at >= now() - interval '24 hours'
    GROUP BY EXTRACT(HOUR FROM m.created_at)
    ORDER BY hour;
END;
$$ LANGUAGE plpgsql;

-- Grup istatistikleri fonksiyonu
CREATE OR REPLACE FUNCTION get_group_stats()
RETURNS TABLE(
    id BIGINT,
    title TEXT,
    is_monitored BOOLEAN,
    member_count INTEGER,
    message_count BIGINT,
    last_activity TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        g.id,
        g.title,
        g.is_monitored,
        g.member_count,
        count(m.id)::BIGINT AS message_count,
        max(m.created_at) AS last_activity
    FROM groups g
    LEFT JOIN messages m ON g.id = m.group_id
    GROUP BY g.id, g.title, g.is_monitored, g.member_count
    ORDER BY count(m.id) DESC;
END;
$$ LANGUAGE plpgsql;
