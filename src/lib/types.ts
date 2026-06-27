// ===== Database Types =====

export interface UserSettings {
  user_id: string;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  qr_image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  user_id: string;
  full_name: string;
  class: string | null;
  subject: string | null;
  parent_phone: string | null;
  notes: string | null;
  tuition_type: 'per_session' | 'monthly';
  tuition_amount: number;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  qr_image_url: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  group_id: string | null;
  package_size: number;
  current_cycle: number;
  created_at: string;
  updated_at: string;
}

export interface StudentGroup {
  id: string;
  user_id: string;
  group_name: string;
  subject: string | null;
  class: string | null;
  notes: string | null;
  tuition_type: 'per_session' | 'monthly';
  tuition_amount: number;
  bank_name: string | null;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  qr_image_url: string | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  package_size: number;
  current_cycle: number;
  created_at: string;
  updated_at: string;
}

export interface GroupSchedule {
  id: string;
  user_id: string;
  group_id: string;
  day_of_week: number; // 0=CN, 1=T2, ..., 6=T7
  start_time: string;
  end_time: string | null;
  created_at: string;
}

export interface Schedule {
  id: string;
  user_id: string;
  student_id: string;
  day_of_week: number; // 0=CN, 1=T2, ..., 6=T7
  start_time: string;  // "18:00"
  end_time: string | null;
  created_at: string;
}

export type SessionStatus = "scheduled" | 'completed' | 'absent_notified' | 'absent_no_notice' | 'rescheduled';

export interface Session {
  id: string;
  user_id: string;
  student_id: string;
  session_date: string;
  subject?: string | null;
  status: SessionStatus;
  notes: string | null;
  session_count: number; // Số buổi tính cho 1 record (mặc định = 1, dồn buổi = 2, 3...)
  cycle_number: number;
  created_at: string;
  student?: Student;
}

export interface Payment {
  id: string;
  user_id: string;
  student_id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  month: number | null;
  year: number | null;
  cycle_number: number;
  notes: string | null;
  created_at: string;
}

export interface MonthlyComment {
  id: string;
  user_id: string;
  student_id: string;
  month: number;
  year: number;
  cycle_number: number;
  comment: string;
  created_at: string;
}

export interface CommentTemplate {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
}

// ===== Extended types with relations =====

export interface StudentWithSchedules extends Student {
  schedules: Schedule[];
}

export interface StudentWithAll extends Student {
  schedules: Schedule[];
  sessions: Session[];
  payments: Payment[];
  monthly_comments: MonthlyComment[];
}

export interface StudentGroupWithMembers extends StudentGroup {
  students: Student[];
  group_schedules: GroupSchedule[];
}

export interface StudentGroupWithAll extends StudentGroup {
  students: Student[];
  group_schedules: GroupSchedule[];
}

// ===== Form types =====

export interface StudentFormData {
  full_name: string;
  class: string;
  subject: string;
  parent_phone: string;
  notes: string;
  tuition_type: 'per_session' | 'monthly';
  tuition_amount: number;
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  schedules: ScheduleFormData[];
}

export interface ScheduleFormData {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface PaymentFormData {
  amount: number;
  payment_date: string;
  payment_method: string;
  month: number;
  year: number;
  notes: string;
}

// ===== Dashboard types =====

export interface DashboardStats {
  totalStudents: number;
  sessionsThisMonth: number;
  revenueThisMonth: number;
  totalDebt: number;
}

export interface UpcomingSession {
  student: Student;
  schedule: Schedule;
  date: Date;
}

// ===== Report types =====

export interface MonthlyReportData {
  student: Student;
  month: number;
  year: number;
  sessions: Session[];
  totalCompleted: number;
  totalAmount: number;
  totalPaid: number;
  totalDebt: number;
  comment: string;
}
