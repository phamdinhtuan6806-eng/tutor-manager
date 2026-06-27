export const DAY_NAMES: Record<number, string> = {
  0: 'Chủ nhật',
  1: 'Thứ 2',
  2: 'Thứ 3',
  3: 'Thứ 4',
  4: 'Thứ 5',
  5: 'Thứ 6',
  6: 'Thứ 7',
};

export const DAY_SHORT: Record<number, string> = {
  0: 'CN',
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Chưa học',
  completed: 'Đã học',
  absent_notified: 'Nghỉ có báo',
  absent_no_notice: 'Nghỉ không báo',
  rescheduled: 'Dời lịch',
};

export const SESSION_STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  absent_notified: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  absent_no_notice: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  rescheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

export const SESSION_STATUS_ICONS: Record<string, string> = {
  scheduled: '🕒',
  completed: '✅',
  absent_notified: '⚠️',
  absent_no_notice: '❌',
  rescheduled: '🔄',
};

export const PAYMENT_METHODS = [
  { value: 'transfer', label: 'Chuyển khoản' },
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'other', label: 'Khác' },
];

export const TUITION_TYPES = [
  { value: 'per_session', label: 'Theo buổi' },
  { value: 'monthly', label: 'Theo tháng' },
];

export const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `Tháng ${i + 1}`,
}));
