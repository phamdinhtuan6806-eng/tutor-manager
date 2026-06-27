"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, getDayOfWeekVN, formatTime } from "@/lib/utils";
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS, TUITION_TYPES } from "@/lib/constants";
import type { Student, Schedule, Session, Payment } from "@/lib/types";

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudent();
  }, [id]);

  const loadStudent = async () => {
    const supabase = createClient();
    const { data: studentData } = await supabase.from("students").select("*").eq("id", id).single();
    const { data: schedData } = await supabase.from("schedules").select("*").eq("student_id", id).order("day_of_week");
    const { data: sessData } = await supabase.from("sessions").select("*").eq("student_id", id).order("session_date", { ascending: false }).limit(20);
    const { data: payData } = await supabase.from("payments").select("*").eq("student_id", id).order("payment_date", { ascending: false });

    setStudent(studentData as Student);
    setSchedules((schedData || []) as Schedule[]);
    setSessions((sessData || []) as Session[]);
    setPayments((payData || []) as Payment[]);
    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!student) {
    return <div className="text-center py-20 text-muted-foreground">Không tìm thấy học sinh</div>;
  }

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const completedCount = completedSessions.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalExpected = student.tuition_type === "monthly"
    ? student.tuition_amount
    : completedCount * student.tuition_amount;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-lg font-bold">
              {student.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold">{student.full_name}</h1>
              <p className="text-sm text-muted-foreground">
                {[student.subject, student.class].filter(Boolean).join(" • ")}
              </p>
            </div>
          </div>
        </div>
        <Link href={`/dashboard/students/${id}/edit`}>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
            Sửa
          </Button>
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Buổi đã học</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedCount}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Học phí</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(totalExpected)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Còn nợ</p>
            <p className={`text-2xl font-bold ${totalExpected - totalPaid > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(Math.max(0, totalExpected - totalPaid))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Thông tin chi tiết</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {student.parent_phone && (
            <div className="flex justify-between"><span className="text-muted-foreground">SĐT phụ huynh</span><span className="font-medium">{student.parent_phone}</span></div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Học phí</span>
            <span className="font-medium">
              {formatCurrency(student.tuition_amount)}/{TUITION_TYPES.find(t => t.value === student.tuition_type)?.label}
            </span>
          </div>
          {student.notes && (
            <div><span className="text-muted-foreground">Ghi chú:</span><p className="mt-1">{student.notes}</p></div>
          )}
          <Separator />
          <div>
            <span className="text-muted-foreground">Lịch học</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {schedules.length > 0 ? schedules.map((s) => (
                <Badge key={s.id} variant="secondary" className="py-1 px-3">
                  {getDayOfWeekVN(s.day_of_week)} {formatTime(s.start_time)}
                  {s.end_time && ` - ${formatTime(s.end_time)}`}
                </Badge>
              )) : <span className="text-muted-foreground text-xs">Chưa thiết lập</span>}
            </div>
          </div>
          {(student.bank_name || student.bank_account_number) && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Thông tin chuyển khoản</span>
                <div className="mt-2 space-y-1">
                  {student.bank_name && <p>Ngân hàng: <strong>{student.bank_name}</strong></p>}
                  {student.bank_account_holder && <p>Chủ TK: <strong>{student.bank_account_holder}</strong></p>}
                  {student.bank_account_number && <p>Số TK: <strong>{student.bank_account_number}</strong></p>}
                </div>
                {student.qr_image_url && (
                  <img src={student.qr_image_url} alt="QR" className="w-32 h-32 mt-3 rounded-lg object-contain border" />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent sessions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lịch sử buổi học</CardTitle>
          <Link href="/dashboard/attendance"><Button variant="ghost" size="sm" className="text-primary">Chấm công →</Button></Link>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Chưa có buổi học nào</p>
          ) : (
            <div className="space-y-2">
              {sessions.slice(0, 10).map((session) => (
                <div key={session.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{formatDate(session.session_date)}</p>
                    {session.notes && <p className="text-xs text-muted-foreground">{session.notes}</p>}
                  </div>
                  <Badge className={SESSION_STATUS_COLORS[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Lịch sử thanh toán</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Chưa có thanh toán</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{formatDate(p.payment_date)}</p>
                    <p className="text-xs text-muted-foreground">{p.payment_method || "—"} {p.notes && `• ${p.notes}`}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
