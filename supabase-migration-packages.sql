-- =============================================
-- Migration: Chuyển đổi sang mô hình Gói Buổi Học
-- =============================================

-- 1. Thêm cột cho bảng students
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS package_size INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS current_cycle INTEGER DEFAULT 1;

-- 2. Thêm cột cho bảng student_groups
ALTER TABLE student_groups 
ADD COLUMN IF NOT EXISTS package_size INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS current_cycle INTEGER DEFAULT 1;

-- 3. Thêm cột cycle_number cho các bảng liên quan
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1;
ALTER TABLE monthly_comments ADD COLUMN IF NOT EXISTS cycle_number INTEGER DEFAULT 1;

-- Cập nhật dữ liệu cũ: Mặc định tất cả dữ liệu cũ thuộc chu kỳ 1
UPDATE sessions SET cycle_number = 1 WHERE cycle_number IS NULL;
UPDATE payments SET cycle_number = month WHERE cycle_number IS NULL; -- Có thể tái sử dụng cột month cũ làm cycle
UPDATE monthly_comments SET cycle_number = month WHERE cycle_number IS NULL;

-- 4. Xóa các buổi học (sessions) ở tương lai theo yêu cầu của user để sinh lại theo chuẩn Gói
-- Chỉ giữ lại các buổi học đã diễn ra (trước ngày hôm nay) hoặc có status khác 'scheduled'
DELETE FROM sessions 
WHERE session_date > CURRENT_DATE 
  AND status = 'scheduled';

-- Reload schema
NOTIFY pgrst, 'reload schema';
