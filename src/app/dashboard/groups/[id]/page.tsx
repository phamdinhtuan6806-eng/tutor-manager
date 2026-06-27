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
import type { StudentGroup, Student, GroupSchedule, Session, Payment } from "@/lib/types";

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [group, setGroup] = useState<StudentGroup | null>(null);
  const [members, setMembers] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<GroupSchedule[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroup();
  }, [id]);

  const loadGroup = async () => {
    const supabase = createClient();
    const { data: groupData } = await supabase.from("student_groups").select("*").eq("id", id).single();
    const { data: membersData } = await supabase.from("students").select("*").eq("group_id", id).eq("is_active", true).order("full_name");
    const { data: schedData } = await supabase.from("group_schedules").select("*").eq("group_id", id).order("day_of_week");

    // Get sessions for all members
    const memberIds = (membersData || []).map((m: Student) => m.id);
    let sessData: Session[] = [];
    let payData: Payment[] = [];
    if (memberIds.length > 0) {
      const activeMembers = (membersData || []).filter(m => m.is_active);
      const currentCycle = activeMembers.length > 0 ? (activeMembers[0].current_cycle || 1) : 1;
      
      const { data: sd } = await supabase.from("sessions").select("*").in("student_id", memberIds).eq("cycle_number", currentCycle).order("session_date", { ascending: false });
      const { data: pd } = await supabase.from("payments").select("*").in("student_id", memberIds).eq("cycle_number", currentCycle).order("payment_date", { ascending: false });
      sessData = (sd || []) as Session[];
      payData = (pd || []) as Payment[];
    }

    setGroup(groupData as StudentGroup);
    setMembers((membersData || []) as Student[]);
    setSchedules((schedData || []) as GroupSchedule[]);
    setSessions(sessData);
    setPayments(payData);
    setLoading(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;
  }

  if (!group) {
    return <div className="text-center py-20 text-muted-foreground">Không tìm thấy nhóm</div>;
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const uniqueDates = [...new Set(sessions.map(s => s.session_date))];
  const completedSessions = sessions.filter(s => s.status === "completed");
  const completedDates = [...new Set(completedSessions.map(s => s.session_date))];
  let totalExpected = 0;
  if (group.tuition_amount > 0) {
    // If group has a specific tuition set, use it
    if (group.tuition_type === "monthly") {
      totalExpected = group.tuition_amount;
    } else {
      // For per-session group: sum session_count across all completed sessions for any one member (they share dates)
      // Use first member's sessions as representative
      const firstMember = members[0];
      if (firstMember) {
        const memberCompleted = completedSessions.filter(s => s.student_id === firstMember.id);
        const totalSessionCount = memberCompleted.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
        totalExpected = totalSessionCount * group.tuition_amount;
      }
    }
  } else {
    // Otherwise, sum up the expected tuition of all active members
    for (const member of members) {
      if (member.tuition_type === "monthly") {
        totalExpected += member.tuition_amount;
      } else {
        const memberCompleted = completedSessions.filter(s => s.student_id === member.id);
        const memberSessionCount = memberCompleted.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
        totalExpected += memberSessionCount * member.tuition_amount;
      }
    }
  }

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
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold">{group.group_name}</h1>
              <p className="text-sm text-muted-foreground">
                {[group.subject, group.class].filter(Boolean).join(" • ")} • {members.length} học sinh
              </p>
            </div>
          </div>
        </div>
        <Link href={`/dashboard/groups/${id}/edit`}>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
            Sửa
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Buổi đã học</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedDates.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Học phí nhóm</p>
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

      {/* Group Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Thông tin nhóm</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Học phí cả nhóm</span>
            <span className="font-medium">
              {group.tuition_amount > 0 
                ? `${formatCurrency(group.tuition_amount)}/${TUITION_TYPES.find(t => t.value === group.tuition_type)?.label}`
                : "Theo học phí cá nhân"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Học phí/học sinh</span>
            <span className="font-medium">
              {group.tuition_amount > 0 
                ? (members.length > 0 ? formatCurrency(Math.round(group.tuition_amount / members.length)) : "—")
                : "Tùy theo từng học sinh"}
            </span>
          </div>
          {group.notes && (
            <div><span className="text-muted-foreground">Ghi chú:</span><p className="mt-1">{group.notes}</p></div>
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
          {(group.bank_name || group.bank_account_number) && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Thông tin chuyển khoản</span>
                <div className="mt-2 space-y-1">
                  {group.bank_name && <p>Ngân hàng: <strong>{group.bank_name}</strong></p>}
                  {group.bank_account_holder && <p>Chủ TK: <strong>{group.bank_account_holder}</strong></p>}
                  {group.bank_account_number && <p>Số TK: <strong>{group.bank_account_number}</strong></p>}
                </div>
                {group.qr_image_url && (
                  <img src={group.qr_image_url} alt="QR" className="w-32 h-32 mt-3 rounded-lg object-contain border" />
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Thành viên ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Chưa có thành viên</p>
          ) : (
            <div className="space-y-2">
              {members.map((student) => {
                const studentSessions = sessions.filter(s => s.student_id === student.id);
                const completedMember = studentSessions.filter(s => s.status === "completed");
                const completedMemberCount = completedMember.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
                const studentPaid = payments.filter(p => p.student_id === student.id).reduce((sum, p) => sum + p.amount, 0);
                let studentExpected = 0;
                if (group.tuition_amount > 0) {
                  const perStudentAmount = Math.round(group.tuition_amount / members.length);
                  studentExpected = group.tuition_type === "per_session" ? completedMemberCount * perStudentAmount : perStudentAmount;
                } else {
                  studentExpected = student.tuition_type === "per_session" ? completedMemberCount * student.tuition_amount : student.tuition_amount;
                }

                return (
                  <Link
                    key={student.id}
                    href={`/dashboard/students/${student.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors group/item"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                        {student.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm group-hover/item:text-primary transition-colors">{student.full_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {student.parent_phone || "Chưa có SĐT"} • {completedMemberCount} buổi
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(studentExpected)}</p>
                      {studentExpected - studentPaid > 0 ? (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                          Nợ {formatCurrency(studentExpected - studentPaid)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                          Đã TT
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent sessions - grouped by date */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Lịch sử buổi học nhóm</CardTitle>
          <Link href="/dashboard/attendance"><Button variant="ghost" size="sm" className="text-primary">Chấm công →</Button></Link>
        </CardHeader>
        <CardContent>
          {uniqueDates.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-6">Chưa có buổi học nào</p>
          ) : (
            <div className="space-y-3">
              {uniqueDates.slice(0, 10).map((date) => {
                const dateSessions = sessions.filter(s => s.session_date === date);
                const allCompleted = dateSessions.every(s => s.status === "completed");
                const someAbsent = dateSessions.some(s => s.status.startsWith("absent"));

                return (
                  <div key={date} className="p-3 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium">{formatDate(date)}</p>
                      {allCompleted ? (
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">Tất cả đã học</Badge>
                      ) : someAbsent ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Có nghỉ</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400">Chưa học</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {dateSessions.map((session) => {
                        const member = members.find(m => m.id === session.student_id);
                        return (
                          <Badge key={session.id} variant="outline" className={`text-xs ${SESSION_STATUS_COLORS[session.status]}`}>
                            {member?.full_name.split(" ").pop() || "?"}: {SESSION_STATUS_LABELS[session.status]}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
