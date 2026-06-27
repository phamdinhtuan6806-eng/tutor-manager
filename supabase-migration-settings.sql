-- =============================================
-- Migration: Bảng Cài Đặt Người Dùng (Thông tin Ngân hàng mặc định)
-- =============================================

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  bank_name TEXT,
  bank_account_holder TEXT,
  bank_account_number TEXT,
  qr_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- Bật RLS
-- =============================================
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- =============================================
-- Policies
-- =============================================
CREATE POLICY "Users can view their own settings"
ON user_settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
ON user_settings FOR UPDATE USING (auth.uid() = user_id);

-- =============================================
-- Updated_at trigger
-- =============================================
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON user_settings;
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Reload schema
NOTIFY pgrst, 'reload schema';
