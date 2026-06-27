-- =============================================
-- Migration: Thêm tính năng Nhóm Học Sinh
-- Chạy migration này SAU khi đã có schema gốc
-- =============================================

-- 1. Tạo bảng student_groups
CREATE TABLE IF NOT EXISTS student_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  group_name TEXT NOT NULL,
  subject TEXT,
  class TEXT,
  notes TEXT,
  tuition_type TEXT NOT NULL CHECK (tuition_type IN ('per_session', 'monthly')) DEFAULT 'per_session',
  tuition_amount INTEGER NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account_holder TEXT,
  bank_account_number TEXT,
  qr_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tạo bảng group_schedules (lịch học nhóm)
CREATE TABLE IF NOT EXISTS group_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  group_id UUID REFERENCES student_groups(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Thêm cột group_id vào students
ALTER TABLE students ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES student_groups(id) ON DELETE SET NULL;

-- =============================================
-- Bật RLS cho bảng mới
-- =============================================
ALTER TABLE student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_schedules ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Policies
-- =============================================
CREATE POLICY "Users can manage their own groups"
ON student_groups FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own group schedules"
ON group_schedules FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- Indexes
-- =============================================
CREATE INDEX IF NOT EXISTS idx_student_groups_user_id ON student_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_student_groups_is_active ON student_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_group_schedules_user_id ON group_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_group_schedules_group_id ON group_schedules(group_id);
CREATE INDEX IF NOT EXISTS idx_students_group_id ON students(group_id);

-- =============================================
-- Updated_at trigger cho student_groups
-- =============================================
DROP TRIGGER IF EXISTS update_student_groups_updated_at ON student_groups;
CREATE TRIGGER update_student_groups_updated_at
  BEFORE UPDATE ON student_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Reload schema
NOTIFY pgrst, 'reload schema';
