"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MONTHS, PAYMENT_METHODS } from "@/lib/constants";
import { toast } from "sonner";
import type { Student, Session, Payment, StudentGroup } from "@/lib/types";

type GroupWithStudents = StudentGroup & { students: Student[] };

export default function PaymentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<GroupWithStudents[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [maxCycle, setMaxCycle] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [payForm, setPayForm] = useState({
    student_id: "", amount: "", payment_date: new Date().toISOString().split("T")[0],
    payment_method: "transfer", notes: "",
  });

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const [studentsRes, sessionsRes, paymentsRes, groupsRes] = await Promise.all([
      supabase.from("students").select("*").eq("is_active", true).order("full_name"),
      supabase.from("sessions").select("*").eq("status", "completed"),
      supabase.from("payments").select("*").order("payment_date", { ascending: false }),
      supabase.from("student_groups").select("*, students(*)").eq("is_active", true).order("group_name"),
    ]);

    const loadedStudents = (studentsRes.data || []) as Student[];
    const allSessions = (sessionsRes.data || []) as Session[];
    const allPayments = (paymentsRes.data || []) as Payment[];

    setStudents(loadedStudents);
    setSessions(allSessions.filter(s => (s.cycle_number || 1) === selectedCycle));
    setPayments(allPayments.filter(p => (p.month || (p as any).cycle_number || 1) === selectedCycle));
    setGroups((groupsRes.data || []) as GroupWithStudents[]);
    
    // Find the max cycle to populate the dropdown
    if (loadedStudents.length > 0) {
      const highestCycle = Math.max(...loadedStudents.map(s => (s as any).current_cycle || 1));
      setMaxCycle(Math.max(highestCycle, selectedCycle));
    }
    
    setLoading(false);
  }, [selectedCycle]);

  useEffect(() => { loadData(); }, [loadData]);

  const getStudentSummary = (student: Student) => {
    const studentCycle = (student as any).current_cycle || 1;
    if (studentCycle < selectedCycle) {
      return { sessions: 0, expected: 0, paid: 0, debt: 0 };
    }
    
    const completedSessions = sessions.filter(s => s.student_id === student.id && s.status === "completed");
    const completedCount = completedSessions.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
    
    const expected = student.tuition_type === "per_session" 
      ? completedCount * student.tuition_amount 
      : student.tuition_amount;
      
    const paid = payments.filter((p) => p.student_id === student.id).reduce((sum, p) => sum + p.amount, 0);
    return { sessions: student.package_size || 12, expected, paid, debt: Math.max(0, expected - paid) };
  };

  // Individual students (not in any group)
  const individualStudents = students.filter(s => !s.group_id);
  // All students for the payment dialog
  const allStudents = students;

  const totalExpected = students.reduce((sum, s) => sum + getStudentSummary(s).expected, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalDebt = Math.max(0, totalExpected - totalPaid);

  const handleAddPayment = async () => {
    if (!payForm.student_id || !payForm.amount) { toast.error("Vui lòng điền đầy đủ"); return; }
    const supabase = createClient();
    const currentYear = new Date().getFullYear();
    const { error } = await supabase.from("payments").insert({
      student_id: payForm.student_id, amount: parseInt(payForm.amount),
      payment_date: payForm.payment_date, payment_method: payForm.payment_method,
      month: selectedCycle, year: currentYear, notes: payForm.notes || null,
    });
    if (error) { toast.error("Lỗi: " + error.message); return; }
    toast.success("Đã thêm thanh toán");
    setDialogOpen(false);
    setPayForm({ student_id: "", amount: "", payment_date: new Date().toISOString().split("T")[0], payment_method: "transfer", notes: "" });
    loadData();
  };

  const quickPay = async (studentId: string, amount: number) => {
    toast.loading("Đang ghi nhận...", { id: "quickPay" });
    const supabase = createClient();
    const currentYear = new Date().getFullYear();
    const { error } = await supabase.from("payments").insert({
      student_id: studentId,
      amount: amount,
      payment_date: new Date().toISOString().split("T")[0],
      month: selectedCycle, // Use month as cycle_number fallback
      year: currentYear,
      payment_method: "Chuyển khoản"
    });
    
    if (error) {
      toast.error("Lỗi: " + error.message, { id: "quickPay" });
      return;
    }
    
    toast.success("Đã ghi nhận thanh toán", { id: "quickPay" });
    loadData();
  };

  const undoQuickPay = async (studentId: string) => {
    if (!confirm("Bạn có chắc muốn hoàn tác (xóa) thanh toán gần nhất của học sinh này trong kỳ này?")) return;
    
    toast.loading("Đang hoàn tác...", { id: "undoPay" });
    const supabase = createClient();
    
    const studentPayments = payments.filter(p => p.student_id === studentId);
    if (studentPayments.length === 0) {
      toast.error("Không tìm thấy giao dịch để hoàn tác", { id: "undoPay" });
      return;
    }
    
    const latestPayment = studentPayments[0];
    
    const { error } = await supabase.from("payments").delete().eq("id", latestPayment.id);
    
    if (error) {
      toast.error("Lỗi: " + error.message, { id: "undoPay" });
      return;
    }
    
    toast.success("Đã hoàn tác thanh toán", { id: "undoPay" });
    loadData();
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thanh toán</h1>
          <p className="text-muted-foreground text-sm">Quản lý công nợ và lịch sử thanh toán</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(selectedCycle)} onValueChange={(v) => { if (v) setSelectedCycle(parseInt(v)); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2].map((c) => (
                <SelectItem key={c} value={String(c)}>Chu kỳ {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)} className="shadow-md shadow-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
            Thêm
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 stagger-children">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Tổng học phí</p>
            <p className="text-xl font-bold text-primary">{formatCurrency(totalExpected)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Đã thanh toán</p>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Còn nợ</p>
            <p className={`text-xl font-bold ${totalDebt > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {formatCurrency(totalDebt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Individual students */}
      {individualStudents.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Học sinh cá nhân</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div className="animate-pulse-soft space-y-3">
                {[...Array(3)].map((_, i) => <div key={i} className="h-12 bg-muted rounded" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {individualStudents.map((student) => {
                  const summary = getStudentSummary(student);
                  return (
                    <div key={student.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                          {student.full_name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{student.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {summary.sessions} buổi • {student.tuition_type === "per_session" ? "Theo buổi" : "Theo tháng"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">{formatCurrency(summary.expected)}</p>
                        {summary.debt > 0 ? (
                          <button onClick={() => quickPay(student.id, summary.debt)} className="hover:opacity-90 transition-opacity active:scale-95 px-3 py-1.5 bg-blue-500 text-white rounded-lg shadow-sm text-xs font-medium" title="Nhấn để thanh toán nhanh">
                            Chưa thanh toán
                          </button>
                        ) : (
                          <button onClick={() => undoQuickPay(student.id)} className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 transition-colors text-white rounded-lg shadow-sm text-xs font-medium flex items-center justify-center gap-1" title="Nhấn để hoàn tác">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Đã thanh toán
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Groups */}
      {groups.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3"><CardTitle className="text-base">Nhóm học sinh</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {groups.map((group) => {
              const activeMembers = group.students.filter(s => s.is_active);
              const perStudentAmount = activeMembers.length > 0 ? Math.round(group.tuition_amount / activeMembers.length) : 0;

              return (
                <div key={group.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-sm">{group.group_name}</p>
                        <p className="text-xs text-muted-foreground">{group.subject} • Học phí nhóm: {formatCurrency(group.tuition_amount)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-11">
                    {activeMembers.map((student) => {
                      const summary = getStudentSummary(student);
                      return (
                        <div key={student.id} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-muted-foreground">{student.full_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs">{formatCurrency(summary.expected)}</span>
                            {summary.debt > 0 ? (
                              <button onClick={() => quickPay(student.id, summary.debt)} className="hover:opacity-90 transition-opacity active:scale-95 px-2.5 py-1 bg-blue-500 text-white rounded-md shadow-sm text-[11px] font-medium" title="Nhấn để thanh toán nhanh">
                                Chưa thanh toán
                              </button>
                            ) : (
                              <button onClick={() => undoQuickPay(student.id)} className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-600 transition-colors text-white rounded-md shadow-sm text-[11px] font-medium flex items-center justify-center gap-1" title="Nhấn để hoàn tác">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                Đã thanh toán
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Payment history */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-base">Lịch sử thanh toán</CardTitle></CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">Chưa có giao dịch trong tháng này</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const student = students.find((s) => s.id === p.student_id);
                const group = student?.group_id ? groups.find(g => g.id === student.group_id) : null;
                return (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">
                        {student?.full_name || "—"}
                        {group && <span className="text-xs text-violet-600 dark:text-violet-400 ml-1">({group.group_name})</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.payment_date)} • {PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label || p.payment_method}
                        {p.notes && ` • ${p.notes}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      +{formatCurrency(p.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add payment dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Thêm thanh toán</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Học sinh *</Label>
              <Select value={payForm.student_id} onValueChange={(v) => { if (v) setPayForm({...payForm, student_id: v}); }}>
                <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                <SelectContent>
                  {/* Individual students */}
                  {individualStudents.length > 0 && (
                    <>
                      {individualStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                    </>
                  )}
                  {/* Group students */}
                  {groups.map((g) => (
                    g.students.filter(s => s.is_active).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name} ({g.group_name})
                      </SelectItem>
                    ))
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Số tiền (VNĐ) *</Label>
              <Input type="number" value={payForm.amount} onChange={(e) => setPayForm({...payForm, amount: e.target.value})} placeholder="1500000" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Ngày</Label>
                <Input type="date" value={payForm.payment_date} onChange={(e) => setPayForm({...payForm, payment_date: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Phương thức</Label>
                <Select value={payForm.payment_method} onValueChange={(v) => { if (v) setPayForm({...payForm, payment_method: v}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ghi chú</Label>
              <Textarea value={payForm.notes} onChange={(e) => setPayForm({...payForm, notes: e.target.value})} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleAddPayment}>Thêm thanh toán</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
