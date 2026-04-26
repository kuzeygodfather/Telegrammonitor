-- Vardiya Yönetimi - Supabase Migration
-- =======================================

-- 1. STAFF tablosu (personeller)
CREATE TABLE IF NOT EXISTS staff (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SHIFTS tablosu (vardiyalar)
CREATE TABLE IF NOT EXISTS shifts (
    id BIGSERIAL PRIMARY KEY,
    staff_id BIGINT REFERENCES staff(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Pazartesi, 6=Pazar
    shift_start TIME,        -- NULL ise izin
    shift_end TIME,          -- NULL ise izin
    is_off BOOLEAN DEFAULT false,  -- İzin günü
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, day_of_week)
);

-- Indexler
CREATE INDEX IF NOT EXISTS idx_shifts_staff_id ON shifts(staff_id);
CREATE INDEX IF NOT EXISTS idx_shifts_day ON shifts(day_of_week);
CREATE INDEX IF NOT EXISTS idx_staff_active ON staff(is_active);

-- updated_at trigger
DROP TRIGGER IF EXISTS shifts_updated_at ON shifts;
CREATE TRIGGER shifts_updated_at
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Anon key icin tam CRUD izni (frontend)
CREATE POLICY "Allow anon read staff" ON staff FOR SELECT USING (true);
CREATE POLICY "Allow anon insert staff" ON staff FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update staff" ON staff FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete staff" ON staff FOR DELETE USING (true);

CREATE POLICY "Allow anon read shifts" ON shifts FOR SELECT USING (true);
CREATE POLICY "Allow anon insert shifts" ON shifts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update shifts" ON shifts FOR UPDATE USING (true);
CREATE POLICY "Allow anon delete shifts" ON shifts FOR DELETE USING (true);

-- Service role icin tam yetki
CREATE POLICY "Allow service_role all staff" ON staff FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Allow service_role all shifts" ON shifts FOR ALL USING (auth.role() = 'service_role');
