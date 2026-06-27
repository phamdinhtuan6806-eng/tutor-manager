"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { Student, Session, Payment } from "@/lib/types";
import dynamic from "next/dynamic";

const RechartsCharts = dynamic(() => import("@/components/statistics/RechartsCharts"), {
  ssr: false,
  loading: () => <div className="h-64 bg-muted rounded-lg animate-pulse-soft" />,
});

export default function StatisticsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedYear]);

  const loadData = async () => {
    setLoading(true);
    const supabase = createClient();
    const firstDay = `${selectedYear}-01-01`;
    const lastDay = `${selectedYear}-12-31`;

    const [studentsRes, sessionsRes, paymentsRes] = await Promise.all([
      supabase.from("students").select("*").eq("is_active", true),
      supabase.from("sessions").select("*").gte("session_date", firstDay).lte("session_date", lastDay),
      supabase.from("payments").select("*").eq("year", selectedYear),
    ]);

    setStudents((studentsRes.data || []) as Student[]);
    setSessions((sessionsRes.data || []) as Session[]);
    setPayments((paymentsRes.data || []) as Payment[]);
    setLoading(false);
  };

  // Aggregate monthly data
  const monthlyData = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthSessions = sessions.filter((s) => {
      const d = new Date(s.session_date);
      return d.getMonth() + 1 === month && s.status === "completed";
    });
    const monthPayments = payments.filter((p) => p.month === month);
    const revenue = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    return {
      month: `T${month}`,
      sessions: monthSessions.length,
      revenue,
    };
  });

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalSessions = sessions.filter((s) => s.status === "completed").length;
  const currentMonth = new Date().getMonth() + 1;

  // Calculate debt per student for current month
  const debtData = students.map((student) => {
    const studentSessions = sessions.filter(
      (s) => s.student_id === student.id && s.status === "completed" &&
        new Date(s.session_date).getMonth() + 1 === currentMonth
    );
    const sessionCount = studentSessions.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
    const expected = student.tuition_type === "per_session"
      ? sessionCount * student.tuition_amount
      : student.tuition_amount;
    const paid = payments
      .filter((p) => p.student_id === student.id && p.month === currentMonth)
      .reduce((sum, p) => sum + p.amount, 0);
    const debt = Math.max(0, expected - paid);
    return { student, expected, paid, debt, sessions: sessionCount };
  }).filter((d) => d.expected > 0).sort((a, b) => b.debt - a.debt);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thống kê</h1>
          <p className="text-muted-foreground text-sm">Tổng quan doanh thu và hoạt động</p>
        </div>
        <Select value={String(selectedYear)} onValueChange={(v) => { if (v) setSelectedYear(parseInt(v)); }}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[2024, 2025, 2026, 2027].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Tổng doanh thu năm</p>
            <p className="text-2xl font-bold text-primary animate-count-up">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Tổng buổi dạy</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 animate-count-up">{totalSessions}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">Học sinh đang dạy</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 animate-count-up">{students.length}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-1">TB buổi/tháng</p>
            <p className="text-2xl font-bold text-violet-600 dark:text-violet-400 animate-count-up">
              {currentMonth > 0 ? Math.round(totalSessions / currentMonth) : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {!loading && <RechartsCharts monthlyData={monthlyData} />}

      {/* Debt table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Công nợ phụ huynh — Tháng {currentMonth}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded animate-pulse-soft" />)}
            </div>
          ) : debtData.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Không có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {debtData.map(({ student, expected, paid, debt, sessions: sessCount }) => (
                <div key={student.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                      {student.full_name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{student.full_name}</p>
                      <p className="text-xs text-muted-foreground">{sessCount} buổi • {formatCurrency(expected)}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium">Đã TT: {formatCurrency(paid)}</p>
                    {debt > 0 ? (
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">
                        Nợ {formatCurrency(debt)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                        ✓ Đủ
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
