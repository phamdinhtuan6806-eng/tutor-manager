"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, getDayOfWeekVN, formatTime } from "@/lib/utils";
import { SESSION_STATUS_LABELS, MONTHS } from "@/lib/constants";
import { toast } from "sonner";
import type { Student, Schedule, Session, Payment, CommentTemplate, StudentGroup } from "@/lib/types";

type GroupWithStudents = StudentGroup & { students: Student[] };

export default function ReportsPage() {
  const [students, setStudents] = useState<(Student & { schedules: Schedule[] })[]>([]);
  const [groups, setGroups] = useState<GroupWithStudents[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedGroupMemberId, setSelectedGroupMemberId] = useState<string>("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [comment, setComment] = useState("");
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);
  const [templateDialog, setTemplateDialog] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [maxCycle, setMaxCycle] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadStudents();
    loadTemplates();
  }, []);

  const loadStudents = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("students").select("*, schedules(*)").eq("is_active", true).order("full_name");
    const { data: groupsData } = await supabase.from("student_groups").select("*, students(*)").eq("is_active", true).order("group_name");
    const loadedStudents = (data || []) as (Student & { schedules: Schedule[] })[];
    setStudents(loadedStudents);
    setGroups((groupsData || []) as GroupWithStudents[]);
    
    // Find the max cycle to populate the dropdown
    if (loadedStudents.length > 0) {
      const highestCycle = Math.max(...loadedStudents.map(s => (s as any).current_cycle || 1));
      setMaxCycle(Math.max(highestCycle, 1));
    }
    
    setLoading(false);
  };

  const loadTemplates = async () => {
    const supabase = createClient();
    const { data } = await supabase.from("comment_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data || []) as CommentTemplate[]);
  };

  // The student we are generating a report for
  const getReportStudentId = () => {
    if (mode === "individual") return selectedStudentId;
    return selectedGroupMemberId;
  };

  const reportStudentId = getReportStudentId();

  const loadReportData = useCallback(async () => {
    if (!reportStudentId) return;
    const supabase = createClient();

    const student = mode === "individual"
      ? students.find(s => s.id === reportStudentId)
      : groups.find(g => g.id === selectedGroupId)?.students.find(s => s.id === reportStudentId);

    const studentCycle = (student as any)?.current_cycle || 1;
    // Update selected cycle if this is the first time we load for this student
    // or just use whatever selected cycle we have
    
    const [sessRes, payRes, commentRes] = await Promise.all([
      supabase.from("sessions").select("*").eq("student_id", reportStudentId).order("session_date"),
      supabase.from("payments").select("*").eq("student_id", reportStudentId),
      supabase
        .from("monthly_comments")
        .select("id, comment, month")
        .eq("student_id", reportStudentId),
    ]);

    const allSessions = (sessRes.data || []) as Session[];
    const allPayments = (payRes.data || []) as Payment[];
    const allComments = commentRes.data || [];

    setSessions(allSessions.filter(s => (s.cycle_number || 1) === selectedCycle));
    setPayments(allPayments.filter(p => (p.cycle_number || 1) === selectedCycle));
    
    // Fallback to month if cycle_number doesn't exist in db
    const cycleComment = allComments.find(c => c.month === selectedCycle || (c as any).cycle_number === selectedCycle);
    setComment(cycleComment?.comment ?? student?.notes ?? "");
  }, [reportStudentId, students, groups, selectedGroupId, selectedCycle, mode]);

  useEffect(() => { loadReportData(); }, [loadReportData]);

  // Find current student/group for display
  const selectedStudent = mode === "individual"
    ? students.find(s => s.id === selectedStudentId)
    : groups.find(g => g.id === selectedGroupId)?.students.find(s => s.id === selectedGroupMemberId);

  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const groupMembers = selectedGroup?.students.filter(s => s.is_active) || [];

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const completedCount = completedSessions.reduce((sum, s) => sum + ((s as any).session_count || 1), 0);

  // For group mode, use group-level tuition divided by members
  const getStudentTuition = () => {
    if (!selectedStudent) return { amount: 0, type: "per_session" as const };
    return { amount: selectedStudent.tuition_amount, type: selectedStudent.tuition_type };
  };

  const tuition = getStudentTuition();
  const totalAmount = tuition.type === "per_session"
    ? completedCount * tuition.amount
    : tuition.amount;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  // Bank info: use group's bank info if group mode
  const bankInfo = mode === "group" && selectedGroup
    ? { bank_name: selectedGroup.bank_name, bank_account_holder: selectedGroup.bank_account_holder, bank_account_number: selectedGroup.bank_account_number, qr_image_url: selectedGroup.qr_image_url }
    : selectedStudent
      ? { bank_name: selectedStudent.bank_name, bank_account_holder: selectedStudent.bank_account_holder, bank_account_number: selectedStudent.bank_account_number, qr_image_url: selectedStudent.qr_image_url }
      : null;

  const saveComment = async () => {
    if (!reportStudentId || !comment.trim()) return;
    const supabase = createClient();
    
    const { data: existing } = await supabase
      .from("monthly_comments")
      .select("id")
      .eq("student_id", reportStudentId)
      .eq("month", selectedCycle) // Use month as cycle
      .maybeSingle();
      
    let error;
    if (existing) {
      const res = await supabase.from("monthly_comments").update({ comment: comment.trim() }).eq("id", existing.id);
      error = res.error;
    } else {
      const currentYear = new Date().getFullYear();
      const res = await supabase.from("monthly_comments").insert({ 
        student_id: reportStudentId, 
        month: selectedCycle, // Use month as cycle 
        year: currentYear,
        comment: comment.trim() 
      });
      error = res.error;
    }

    if (error) {
      console.error("Lỗi lưu nhận xét:", error);
      toast.error("Lỗi lưu nhận xét: " + error.message);
    } else {
      toast.success("Đã lưu nhận xét");
    }
  };

  const saveTemplate = async () => {
    if (!newTemplateName.trim() || !comment.trim()) return;
    const supabase = createClient();
    await supabase.from("comment_templates").insert({ title: newTemplateName.trim(), content: comment.trim() });
    setTemplateDialog(false);
    setNewTemplateName("");
    toast.success("Đã lưu mẫu nhận xét mới");
    loadTemplates();
  };

  const exportPDF = async () => {
    if (!reportRef.current) return;
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;
      toast.loading("Đang tạo PDF...", { id: "pdf-toast" });
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      if (pdfHeight > pdf.internal.pageSize.getHeight()) {
        const totalPages = Math.ceil(pdfHeight / pdf.internal.pageSize.getHeight());
        for (let i = 0; i < totalPages; i++) {
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, -(i * pdf.internal.pageSize.getHeight()), pdfWidth, pdfHeight);
        }
      } else {
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }
      pdf.save(`BaoCao_${selectedStudent?.full_name}.pdf`);
      toast.success("Đã xuất PDF!", { id: "pdf-toast" });
    } catch (err) {
      console.error("PDF Export error:", err);
      toast.error("Lỗi tạo PDF. Vui lòng dùng nút In -> Lưu thành PDF.", { id: "pdf-toast" });
    }
  };

  const exportPNG = async () => {
    if (!reportRef.current) return;
    try {
      const htmlToImage = await import("html-to-image");
      toast.loading("Đang tạo ảnh chất lượng cao...", { id: "png-toast" });
      
      const createWithScale = async (scale: number): Promise<boolean> => {
        try {
          // First call to force browser to cache external images
          await htmlToImage.toBlob(reportRef.current!, { backgroundColor: "#ffffff", pixelRatio: scale, skipFonts: true });
          // Wait a tiny bit for images to be ready
          await new Promise(r => setTimeout(r, 200));
          // Second call actually generates the full image with QR codes
          const blob = await htmlToImage.toBlob(reportRef.current!, { backgroundColor: "#ffffff", pixelRatio: scale });
          if (blob) {
            const url = URL.createObjectURL(blob);
            setPreviewImage(url);
            return true;
          }
          return false;
        } catch (e) {
          console.error("Scale error", e);
          return false;
        }
      };

      const success3 = await createWithScale(3);
      if (success3) {
        toast.success("Đã tạo ảnh!", { id: "png-toast" });
        return;
      }
      
      toast.loading("Đang thử lại với chất lượng tiêu chuẩn...", { id: "png-toast" });
      const success2 = await createWithScale(2);
      if (success2) {
        toast.success("Đã tạo ảnh!", { id: "png-toast" });
        return;
      }
      
      toast.loading("Đang thử lại với độ phân giải gốc...", { id: "png-toast" });
      const success1 = await createWithScale(1);
      if (success1) {
        toast.success("Đã tạo ảnh!", { id: "png-toast" });
        return;
      }

      toast.error("Lỗi tạo ảnh. Điện thoại không hỗ trợ tính năng này.", { id: "png-toast" });
    } catch (err) {
      console.error("PNG Export error:", err);
      toast.error("Lỗi tạo ảnh hệ thống.", { id: "png-toast" });
    }
  };

  const handlePrint = () => { window.print(); };

  // Standalone students (not in any group or group is inactive)
  const individualStudents = students.filter(s => !s.group_id || !groups.find(g => g.id === s.group_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phiếu báo cáo học tập</h1>
          <p className="text-muted-foreground text-sm">Tạo phiếu gửi phụ huynh</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Select value={String(selectedCycle)} onValueChange={(v) => { if (v) setSelectedCycle(parseInt(v)); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: maxCycle }, (_, i) => i + 1).map((c) => (
                <SelectItem key={c} value={String(c)}>Chu kỳ {c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Controls */}
      <Card className="border-0 shadow-sm no-print">
        <CardContent className="p-4 space-y-4">
          {/* Mode toggle */}
          {groups.length > 0 && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
              <Button variant={mode === "individual" ? "default" : "ghost"} size="sm" onClick={() => { setMode("individual"); setSelectedGroupId(""); setSelectedGroupMemberId(""); }} className="text-xs">
                Cá nhân
              </Button>
              <Button variant={mode === "group" ? "default" : "ghost"} size="sm" onClick={() => { setMode("group"); setSelectedStudentId(""); }} className="text-xs">
                Nhóm
              </Button>
            </div>
          )}

          {mode === "individual" ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[200px] flex-1">
                <Label className="text-xs">Học sinh</Label>
                <Select value={selectedStudentId} onValueChange={(v) => { if (v) setSelectedStudentId(v); }}>
                  <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                  <SelectContent>
                    {individualStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[180px]">
                <Label className="text-xs">Nhóm</Label>
                <Select value={selectedGroupId} onValueChange={(v) => { if (v) { setSelectedGroupId(v); setSelectedGroupMemberId(""); } }}>
                  <SelectTrigger><SelectValue placeholder="Chọn nhóm" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.group_name} ({g.students.filter(s => s.is_active).length} HS)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedGroupId && (
                <div className="space-y-1 min-w-[180px] flex-1">
                  <Label className="text-xs">Chọn học sinh trong nhóm</Label>
                  <Select value={selectedGroupMemberId} onValueChange={(v) => { if (v) setSelectedGroupMemberId(v); }}>
                    <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                    <SelectContent>
                      {groupMembers.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedStudent && (
        <>
          {/* Comment editor */}
          <Card className="border-0 shadow-sm no-print">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Nhận xét gửi phụ huynh</CardTitle>
                <div className="flex gap-2">
                  {templates.length > 0 && (
                    <Select onValueChange={(v) => { if (v) setComment(v as string); }}>
                      <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Chọn mẫu..." /></SelectTrigger>
                      <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.content}>{t.title}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setTemplateDialog(true)} disabled={!comment.trim()}>
                    Lưu mẫu
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Nhập nhận xét học tập của học sinh trong tháng này..." rows={4} />
              <Button size="sm" onClick={saveComment} disabled={!comment.trim()}>Lưu nhận xét</Button>
            </CardContent>
          </Card>

          {/* Export buttons */}
          <div className="flex gap-2 flex-wrap no-print">
            <Button onClick={exportPDF} className="shadow-md shadow-primary/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>
              Xuất PDF
            </Button>
            <Button variant="outline" onClick={exportPNG}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
              Xuất PNG
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect width="12" height="8" x="6" y="14" /></svg>
              In
            </Button>
            {mode === "group" && groupMembers.length > 1 && (
              <Badge variant="secondary" className="px-3 py-2 text-xs bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                Phiếu riêng cho: {selectedStudent.full_name}
              </Badge>
            )}
          </div>

          {/* Report preview */}
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div ref={reportRef} className="p-6 sm:p-8" style={{ fontFamily: "'Times New Roman', serif", fontSize: "14px", color: "#000000", backgroundColor: "#ffffff" }}>
              {/* Header */}
              <div className="text-center mb-6">
                <h2 className="text-xl font-bold uppercase tracking-wide" style={{ color: "#1a1a5e" }}>
                  PHIẾU BÁO CÁO HỌC TẬP
                </h2>
                <div className="w-24 h-1 mx-auto mt-2 rounded-full" style={{ background: "linear-gradient(to right, #3b82f6, #a855f7)" }} />
              </div>

              {/* Student info */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6 text-sm">
                <p><strong>Học sinh:</strong> {selectedStudent.full_name}</p>
                <p><strong>Lớp:</strong> {selectedStudent.class || (mode === "group" && selectedGroup?.class) || "—"}</p>
                <p><strong>Môn học:</strong> {selectedStudent.subject || (mode === "group" && selectedGroup?.subject) || "—"}</p>
                <p><strong>SĐT phụ huynh:</strong> {selectedStudent.parent_phone || "—"}</p>
                {mode === "group" && selectedGroup && (
                  <p><strong>Nhóm:</strong> {selectedGroup.group_name}</p>
                )}
              </div>

              {/* Sessions table */}
              <table className="w-full mb-6" style={{ fontSize: "13px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#1a1a5e", color: "white" }}>
                    <th className="p-2 text-center w-10" style={{ border: "1px solid #e5e7eb" }}>STT</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Ngày</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Thứ</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Môn học</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Số buổi</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Trạng thái</th>
                    <th className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? (
                    <tr><td colSpan={7} className="border p-4 text-center" style={{ color: "#6b7280" }}>Chưa có buổi học nào</td></tr>
                  ) : (
                    sessions.map((session, idx) => {
                      const d = new Date(session.session_date);
                      return (
                        <tr key={session.id} style={{ backgroundColor: idx % 2 === 0 ? "#f8f9ff" : "white" }}>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>{idx + 1}</td>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>{formatDate(session.session_date)}</td>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>{getDayOfWeekVN(d.getDay())}</td>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>
                            {session.subject ? `[${session.subject}]` : "—"}
                          </td>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb", fontWeight: ((session as any).session_count || 1) > 1 ? "bold" : "normal", color: ((session as any).session_count || 1) > 1 ? "#7c3aed" : undefined }}>
                            {((session as any).session_count || 1) > 1 ? `x${(session as any).session_count}` : "1"}
                          </td>
                          <td className="p-2 text-center" style={{ border: "1px solid #e5e7eb" }}>
                            <span style={{
                              padding: "2px 8px", borderRadius: "4px", fontSize: "12px",
                              backgroundColor: session.status === "completed" ? "#dcfce7" : session.status === "absent_notified" ? "#fef9c3" : session.status === "absent_no_notice" ? "#fee2e2" : "#dbeafe",
                              color: session.status === "completed" ? "#166534" : session.status === "absent_notified" ? "#854d0e" : session.status === "absent_no_notice" ? "#991b1b" : "#1e40af",
                            }}>
                              {SESSION_STATUS_LABELS[session.status]}
                            </span>
                          </td>
                          <td className="p-2" style={{ border: "1px solid #e5e7eb" }}>{session.notes || ""}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1 text-sm">
                  <p><strong>Tổng số buổi đã học:</strong> <span style={{ color: "#166534", fontWeight: "bold" }}>{completedCount} buổi</span>{completedCount !== completedSessions.length && <span style={{ color: "#7c3aed", fontSize: "12px" }}> ({completedSessions.length} ngày, có dồn buổi)</span>}</p>
                  <p><strong>Tổng học phí:</strong> <span style={{ color: "#1a1a5e", fontWeight: "bold", fontSize: "16px" }}>{formatCurrency(totalAmount)}</span></p>
                  <p><strong>Đã thanh toán:</strong> <span style={{ color: "#166534" }}>{formatCurrency(totalPaid)}</span></p>
                  {totalAmount - totalPaid > 0 && (
                    <p><strong>Còn lại:</strong> <span style={{ color: "#dc2626", fontWeight: "bold" }}>{formatCurrency(totalAmount - totalPaid)}</span></p>
                  )}
                </div>

                {bankInfo && (bankInfo.bank_name || bankInfo.qr_image_url) && (
                  <div className="text-right text-sm" style={{ maxWidth: "200px" }}>
                    <p className="font-bold mb-2" style={{ color: "#1a1a5e" }}>Thông tin chuyển khoản</p>
                    {bankInfo.bank_name && <p>{bankInfo.bank_name}</p>}
                    {bankInfo.bank_account_holder && <p><strong>{bankInfo.bank_account_holder}</strong></p>}
                    {bankInfo.bank_account_number && <p>STK: {bankInfo.bank_account_number}</p>}
                    {bankInfo.qr_image_url && (
                      <img src={bankInfo.qr_image_url} alt="QR thanh toán" crossOrigin="anonymous" className="w-32 h-32 mt-2 ml-auto rounded" style={{ objectFit: "contain", border: "1px solid #e5e7eb" }} />
                    )}
                  </div>
                )}
              </div>

              {/* Comment */}
              {comment && (
                <div className="mb-6">
                  <div style={{ height: "1px", backgroundColor: "#e2e8f0", margin: "12px 0" }} />
                  <p className="font-bold mb-2" style={{ color: "#1a1a5e" }}>📝 Nhận xét của gia sư:</p>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: "#f8f9ff", border: "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>
                    {comment}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-center text-xs mt-8 pt-4" style={{ color: "#9ca3af", borderTop: "1px dashed #e2e8f0" }}>
                Phiếu được tạo bởi TutorPro — {new Date().toLocaleDateString("vi-VN")}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Save template dialog */}
      <Dialog open={templateDialog} onOpenChange={setTemplateDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Lưu mẫu nhận xét</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tên mẫu</Label>
              <Input value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="VD: Nhận xét tốt, Nhận xét cần cải thiện..." />
            </div>
            <div className="p-3 bg-muted rounded-lg text-sm">{comment}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialog(false)}>Hủy</Button>
            <Button onClick={saveTemplate}>Lưu mẫu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Image Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Ảnh Phiếu Báo Cáo</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground bg-primary/10 p-3 rounded-lg text-primary font-medium">
              📱 <strong>MẸO:</strong> Bấm nút "Lưu ảnh / Chia sẻ" bên dưới, hoặc nhấn giữ vào ảnh để lưu về điện thoại.
            </p>
            {previewImage && <img src={previewImage} alt="Phiếu báo cáo" className="w-full border rounded-lg shadow-sm" />}
          </div>
          <DialogFooter className="flex-row sm:justify-end justify-center gap-2 mt-4">
            <Button variant="outline" onClick={() => setPreviewImage(null)}>Đóng</Button>
            <Button onClick={async () => {
              if (!previewImage) return;
              try {
                const response = await fetch(previewImage);
                const blob = await response.blob();
                const file = new File([blob], `BaoCao_${selectedStudent?.full_name || 'HocSinh'}.png`, { type: "image/png" });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({
                    files: [file],
                    title: 'Phiếu báo cáo học tập',
                  });
                } else {
                  const link = document.createElement("a");
                  link.download = file.name;
                  link.href = previewImage;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }
              } catch (err) {
                console.error(err);
                const link = document.createElement("a");
                link.download = `BaoCao_${selectedStudent?.full_name || 'HocSinh'}.png`;
                link.href = previewImage;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            }}>
              Lưu ảnh / Chia sẻ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
