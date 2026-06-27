-- =============================================
-- Supabase SQL Migration
-- Web App Quản Lý Gia Sư Dạy Tại Nhà (Multi-tenant / Auth Version)
-- CẢNH BÁO: Script này sẽ XÓA SẠCH dữ liệu cũ để tạo cấu trúc phân lập người dùng.
-- =============================================

-- 1. Xóa các bảng cũ (để reset dữ liệu, vì cấu trúc mới bắt buộc có user_id)
DROP TABLE IF EXISTS comment_templates CASCADE;
DROP TABLE IF EXISTS monthly_comments CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS schedules CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- 2. Students table
CREATE TABLE students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  full_name TEXT NOT NULL,
  class TEXT,
  subject TEXT,
  parent_phone TEXT,
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

-- 3. Schedules table
CREATE TABLE schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Sessions (attendance) table
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  session_date DATE NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'absent_notified', 'absent_no_notice', 'rescheduled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Payments table
CREATE TABLE payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  amount INTEGER NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT,
  month INTEGER,
  year INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Monthly comments table
CREATE TABLE monthly_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  student_id UUID REFERENCES students(id) ON DELETE CASCADE NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, month, year)
);

-- 7. Comment templates table
CREATE TABLE comment_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid() NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Bật Row Level Security (RLS)
-- =============================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_templates ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Tạo Policies để người dùng chỉ thấy/sửa dữ liệu của họ
-- =============================================

-- Học sinh
CREATE POLICY "Users can manage their own students" 
ON students FOR ALL USING (auth.uid() = user_id);

-- Lịch học
CREATE POLICY "Users can manage their own schedules" 
ON schedules FOR ALL USING (auth.uid() = user_id);

-- Buổi học
CREATE POLICY "Users can manage their own sessions" 
ON sessions FOR ALL USING (auth.uid() = user_id);

-- Thanh toán
CREATE POLICY "Users can manage their own payments" 
ON payments FOR ALL USING (auth.uid() = user_id);

-- Nhận xét tháng
CREATE POLICY "Users can manage their own monthly comments" 
ON monthly_comments FOR ALL USING (auth.uid() = user_id);

-- Mẫu nhận xét
CREATE POLICY "Users can manage their own comment templates" 
ON comment_templates FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- Storage bucket cho QR images
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('qr-images', 'qr-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies: Cho phép user tải lên thư mục của họ hoặc bất kỳ đâu nếu có auth
DROP POLICY IF EXISTS "Anyone can upload QR images" ON storage.objects;
CREATE POLICY "Users can upload QR images" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'qr-images' AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "Anyone can view QR images" ON storage.objects;
CREATE POLICY "Anyone can view QR images" ON storage.objects FOR SELECT USING (
  bucket_id = 'qr-images'
);

DROP POLICY IF EXISTS "Anyone can delete QR images" ON storage.objects;
CREATE POLICY "Users can delete QR images" ON storage.objects FOR DELETE USING (
  bucket_id = 'qr-images' AND auth.role() = 'authenticated'
);

-- =============================================
-- Indexes for performance
-- =============================================
CREATE INDEX idx_students_user_id ON students(user_id);
CREATE INDEX idx_students_is_active ON students(is_active);

CREATE INDEX idx_schedules_user_id ON schedules(user_id);
CREATE INDEX idx_schedules_student_id ON schedules(student_id);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_student_id ON sessions(student_id);
CREATE INDEX idx_sessions_date ON sessions(session_date);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_student_id ON payments(student_id);

CREATE INDEX idx_monthly_comments_user_id ON monthly_comments(user_id);
CREATE INDEX idx_monthly_comments_student ON monthly_comments(student_id, month, year);

CREATE INDEX idx_comment_templates_user_id ON comment_templates(user_id);

-- =============================================
-- Updated_at trigger
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Ép Supabase API tải lại cấu trúc bảng ngay lập tức
NOTIFY pgrst, 'reload schema';
