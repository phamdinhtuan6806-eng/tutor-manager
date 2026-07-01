"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, getDayOfWeekVN, formatTime } from "@/lib/utils";
import { SESSION_STATUS_LABELS, SESSION_STATUS_COLORS, SESSION_STATUS_ICONS, MONTHS } from "@/lib/constants";
import { toast } from "sonner";
import { forceRenewStudentCycle, forceRestorePastCycle } from "@/app/actions";
import type { Student, Schedule, Session, SessionStatus, StudentGroup, GroupSchedule } from "@/lib/types";
import { useLanguage } from "@/components/providers/LanguageProvider";

type GroupWithRelations = StudentGroup & { students: Student[]; group_schedules: GroupSchedule[] };

export default function AttendancePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSession, setEditSession] = useState<{
    studentId: string; date: string; startTime: string; endTime: string; status: SessionStatus; notes: string; sessionCount: number; existingId?: string; subject?: string | null;
  } | null>(null);

  const [shiftDialog, setShiftDialog] = useState<{
    isOpen: boolean;
    studentId?: string;
    groupId?: string;
    fromDate: string;
    daysOption: string;
    customDays: string;
  }>({ isOpen: false, fromDate: "", daysOption: "7", customDays: "7" });

  // Group attendance dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupAttendance, setGroupAttendance] = useState<{
    groupId: string;
    date: string;
    members: { studentId: string; name: string; startTime: string; endTime: string; status: SessionStatus; notes: string; sessionCount: number; existingId?: string }[];
  } | null>(null);

  const [viewMode, setViewMode] = useState<"individual" | "group">("individual");
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedCycle, setSelectedCycle] = useState<number>(1);
  const [maxCycle, setMaxCycle] = useState<number>(1);
  const [pastCycleDialog, setPastCycleDialog] = useState<{ isOpen: boolean; studentId: string; endDate: string }>({ isOpen: false, studentId: "", endDate: new Date().toISOString().split("T")[0] });
  
  // Multi-select for bulk edit
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [bulkEditDialog, setBulkEditDialog] = useState<{
    isOpen: boolean;
    updateStatus: boolean; status: SessionStatus;
    updateTime: boolean; startTime: string; endTime: string;
    updateNotes: boolean; notes: string;
    updateSubject: boolean; subject: string;
    updateSessionCount: boolean; sessionCount: number;
    updateDate: boolean; daysToShift: number;
  }>({
    isOpen: false, updateStatus: false, status: "completed", updateTime: false, startTime: "", endTime: "", updateNotes: false, notes: "", updateSubject: false, subject: "", updateSessionCount: false, sessionCount: 2, updateDate: false, daysToShift: 7
  });

  const { t } = useLanguage();

  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const [studentsRes, sessionsRes, groupsRes] = await Promise.all([
      supabase.from("students").select("*").eq("is_active", true).order("full_name"),
      supabase.from("sessions").select("*").order("session_date"),
      supabase.from("student_groups").select("*, students(*), group_schedules(*)").eq("is_active", true).order("group_name"),
    ]);

    const loadedStudents = (studentsRes.data || []) as Student[];
    const loadedGroups = (groupsRes.data || []) as GroupWithRelations[];
    
    setStudents(loadedStudents);
    setSessions((sessionsRes.data || []) as Session[]);
    setGroups(loadedGroups);
    
    // Auto-select first student/group if not selected
    if (loadedStudents.length > 0 && !selectedStudentId) {
      setSelectedStudentId(loadedStudents[0].id);
      setSelectedCycle((loadedStudents[0] as any).current_cycle || 1);
    }
    if (loadedGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(loadedGroups[0].id);
    }
    
    // Find max cycle
    let highestCycle = 1;
    if (viewMode === "individual") {
      if (loadedStudents.length > 0) {
        highestCycle = Math.max(...loadedStudents.map(s => (s as any).current_cycle || 1));
      }
    } else {
      if (loadedGroups.length > 0) {
        highestCycle = Math.max(...loadedGroups.map(g => (g as any).current_cycle || 1));
      }
    }
    setMaxCycle(Math.max(highestCycle, 1));
    
    setLoading(false);
  }, [viewMode, selectedStudentId, selectedGroupId]);

  useEffect(() => { loadData(); }, [loadData]);

  const openDialog = (studentId: string, date: string, existingId?: string, existingNotes?: string, existingStatus?: SessionStatus) => {
    let startTime = "";
    let endTime = "";
    let cleanNotes = existingNotes || "";
    
    // Parse "HH:mm - HH:mm" from the beginning of notes
    const timeMatch = cleanNotes.match(/^(\d{2}:\d{2}(?::\d{2})?)\s*-\s*(\d{2}:\d{2}(?::\d{2})?)(?:\s*-\s*(.*))?$/);
    if (timeMatch) {
      startTime = timeMatch[1].substring(0, 5);
      endTime = timeMatch[2].substring(0, 5);
      cleanNotes = timeMatch[3] || "";
    }

    // Find existing session to get session_count
    const existingSession = sessions.find(s => s.id === existingId);
    const student = students.find(s => s.id === studentId);
    setEditSession({
      studentId, date,
      startTime, endTime,
      status: existingStatus || "completed",
      notes: cleanNotes,
      sessionCount: (existingSession as any)?.session_count || 1,
      subject: (existingSession as any)?.subject || student?.subject || "",
      existingId,
    });
    setDialogOpen(true);
  };

  const saveSession = async () => {
    if (!editSession) return;
    const supabase = createClient();

    const finalNotes = (editSession.startTime && editSession.endTime)
      ? `${editSession.startTime} - ${editSession.endTime}${editSession.notes ? ` - ${editSession.notes}` : ""}`
      : editSession.notes || null;

    if (editSession.existingId) {
      await supabase.from("sessions").update({
        status: editSession.status, notes: finalNotes, session_date: editSession.date,
        session_count: editSession.sessionCount || 1,
        subject: editSession.subject || null,
      }).eq("id", editSession.existingId);
    } else {
      await supabase.from("sessions").insert({
        student_id: editSession.studentId,
        session_date: editSession.date,
        status: editSession.status,
        notes: finalNotes,
        session_count: editSession.sessionCount || 1,
        subject: editSession.subject || null,
      });
    }

    toast.success("Đã lưu chấm công");
    setDialogOpen(false);
    setEditSession(null);
    loadData();
  };

  const deleteSession = async () => {
    if (!editSession?.existingId) return;
    const supabase = createClient();
    await supabase.from("sessions").delete().eq("id", editSession.existingId);
    toast.success("Đã xóa");
    setDialogOpen(false);
    setEditSession(null);
    loadData();
  };

  const handleShiftSchedule = async () => {
    const days = shiftDialog.daysOption === "custom" ? parseInt(shiftDialog.customDays) : parseInt(shiftDialog.daysOption);
    if (isNaN(days) || days === 0) {
      toast.error("Số ngày dời không hợp lệ");
      return;
    }

    toast.loading("Đang dời lịch...", { id: "shift-schedule" });
    const supabase = createClient();
    
    let targetStudentIds: string[] = [];
    let cycleToMatch = parseInt(String(selectedCycle)) || 1;

    if (shiftDialog.groupId) {
      const group = groups.find(g => g.id === shiftDialog.groupId);
      if (group) {
        targetStudentIds = group.students.filter(s => s.is_active).map(s => s.id);
      }
    } else if (shiftDialog.studentId) {
      targetStudentIds = [shiftDialog.studentId];
    }

    if (targetStudentIds.length === 0) return;

    const targetSessions = sessions.filter(s => 
      targetStudentIds.includes(s.student_id) && 
      (s.cycle_number || 1) === cycleToMatch &&
      s.session_date >= shiftDialog.fromDate
    );

    if (targetSessions.length === 0) {
      toast.error("Không tìm thấy buổi học nào để dời", { id: "shift-schedule" });
      setShiftDialog(prev => ({ ...prev, isOpen: false }));
      return;
    }

    let hasError = false;
    for (const session of targetSessions) {
      const d = new Date(session.session_date);
      d.setDate(d.getDate() + days);
      const newDateStr = d.toISOString().split("T")[0];
      
      const { error } = await supabase.from("sessions").update({ session_date: newDateStr }).eq("id", session.id);
      if (error) hasError = true;
    }

    if (hasError) {
      toast.error("Có lỗi xảy ra khi dời lịch một số buổi", { id: "shift-schedule" });
    } else {
      toast.success(`Đã dời lịch ${targetSessions.length} buổi (thêm ${days} ngày)!`, { id: "shift-schedule" });
    }

    setShiftDialog(prev => ({ ...prev, isOpen: false }));
    setDialogOpen(false);
    setGroupDialogOpen(false);
    loadData();
  };

  const handleRestorePastCycle = async () => {
    toast.loading("Đang khôi phục kỳ cũ...", { id: "restore" });
    const isGroup = viewMode === "group";
    
    let hasError = false;
    if (isGroup) {
      const group = groups.find(g => g.id === pastCycleDialog.studentId);
      if (group) {
        const activeMembers = group.students.filter(s => s.is_active);
        for (const member of activeMembers) {
          const res = await forceRestorePastCycle(member.id, pastCycleDialog.endDate);
          if (!res.success) {
            hasError = true;
            toast.error(`Lỗi tạo lịch cho ${member.full_name}: ${res.error}`, { id: "restore" });
            break;
          }
        }
      }
    } else {
      const res = await forceRestorePastCycle(pastCycleDialog.studentId, pastCycleDialog.endDate);
      if (!res.success) {
        hasError = true;
        toast.error("Lỗi: " + res.error, { id: "restore" });
      }
    }
    
    if (!hasError) {
      toast.success("Đã khôi phục kỳ cũ thành công!", { id: "restore" });
      setPastCycleDialog(prev => ({ ...prev, isOpen: false }));
      setSelectedCycle(2);
      loadData();
    }
  };

  const quickTick = async (studentId: string, date: string, existingId?: string, existingStatus?: SessionStatus) => {
    const supabase = createClient();

    if (existingId) {
      if (existingStatus === "scheduled") {
        await supabase.from("sessions").update({ status: "completed" }).eq("id", existingId);
        toast.success("✅ Đã điểm danh");
        loadData();
      } else {
        openDialog(studentId, date, existingId, "", existingStatus);
      }
      return;
    }

    await supabase.from("sessions").insert({
      student_id: studentId, session_date: date, status: "completed",
    });
    toast.success("✅ Đã điểm danh");
    loadData();
  };

  // Group attendance
  const openGroupAttendance = (group: GroupWithRelations, date: string) => {
    const activeMembers = group.students.filter(s => s.is_active);
    const memberStates = activeMembers.map(student => {
      const existing = sessions.find(s => s.student_id === student.id && s.session_date === date);
      
      let startTime = "";
      let endTime = "";
      let cleanNotes = existing?.notes || "";
      
      const timeMatch = cleanNotes.match(/^(\d{2}:\d{2}(?::\d{2})?)\s*-\s*(\d{2}:\d{2}(?::\d{2})?)(?:\s*-\s*(.*))?$/);
      if (timeMatch) {
        startTime = timeMatch[1].substring(0, 5);
        endTime = timeMatch[2].substring(0, 5);
        cleanNotes = timeMatch[3] || "";
      }

      return {
        studentId: student.id,
        name: student.full_name,
        startTime, endTime,
        status: existing?.status || "completed" as SessionStatus,
        notes: cleanNotes,
        sessionCount: (existing as any)?.session_count || 1,
        existingId: existing?.id,
      };
    });
    setGroupAttendance({ groupId: group.id, date, members: memberStates });
    setGroupDialogOpen(true);
  };

  const saveGroupAttendance = async () => {
    if (!groupAttendance) return;
    const supabase = createClient();

    for (const member of groupAttendance.members) {
      const finalNotes = (member.startTime && member.endTime)
        ? `${member.startTime} - ${member.endTime}${member.notes ? ` - ${member.notes}` : ""}`
        : member.notes || null;

      if (member.existingId) {
        await supabase.from("sessions").update({
          status: member.status, notes: finalNotes, session_date: groupAttendance.date,
          session_count: member.sessionCount || 1,
        }).eq("id", member.existingId);
      } else {
        await supabase.from("sessions").insert({
          student_id: member.studentId, session_date: groupAttendance.date,
          status: member.status, notes: finalNotes,
          session_count: member.sessionCount || 1,
        });
      }
    }
    toast.success("✅ Đã lưu chấm công nhóm");
    setGroupDialogOpen(false);
    loadData();
  };

  const saveBulkEdit = async () => {
    if (selectedSessionIds.length === 0) return;
    toast.loading("Đang lưu thay đổi...", { id: "bulk-edit" });
    const supabase = createClient();
    
    let hasError = false;
    for (const sessionId of selectedSessionIds) {
      const originalSession = sessions.find(s => s.id === sessionId);
      if (!originalSession) continue;
      
      let finalStatus = bulkEditDialog.updateStatus ? bulkEditDialog.status : originalSession.status;
      let finalNotes = originalSession.notes || "";
      
      if (bulkEditDialog.updateNotes) {
        finalNotes = bulkEditDialog.notes;
      }
      
      if (bulkEditDialog.updateTime && bulkEditDialog.startTime && bulkEditDialog.endTime) {
        // Strip out old time from notes if it exists, then prepend new time
        const cleanNotes = finalNotes.replace(/^\d{2}:\d{2}(?::\d{2})?\s*-\s*\d{2}:\d{2}(?::\d{2})?(?:\s*-\s*)?/, "");
        finalNotes = `${bulkEditDialog.startTime} - ${bulkEditDialog.endTime}${cleanNotes ? ` - ${cleanNotes}` : ""}`;
      }
      
      const updateData: any = {
        status: finalStatus,
        notes: finalNotes || null
      };
      
      if (bulkEditDialog.updateSubject) {
        updateData.subject = bulkEditDialog.subject || null;
      }
      
      if (bulkEditDialog.updateSessionCount) {
        updateData.session_count = bulkEditDialog.sessionCount || 1;
      }
      
      if (bulkEditDialog.updateDate && bulkEditDialog.daysToShift) {
        const d = new Date(originalSession.session_date);
        d.setDate(d.getDate() + bulkEditDialog.daysToShift);
        updateData.session_date = d.toISOString().split("T")[0];
      }
      
      const { error } = await supabase.from("sessions").update(updateData).eq("id", sessionId);
      
      if (error) {
        hasError = true;
        console.error("Lỗi sửa hàng loạt:", error);
      }
    }
    
    if (hasError) {
      toast.error("Có lỗi xảy ra khi lưu một số buổi học", { id: "bulk-edit" });
    } else {
      toast.success(`Đã cập nhật ${selectedSessionIds.length} buổi học!`, { id: "bulk-edit" });
    }
    
    setBulkEditDialog(prev => ({ ...prev, isOpen: false }));
    setSelectedSessionIds([]);
    setIsMultiSelectMode(false);
    loadData();
  };

  const deleteBulkSessions = async () => {
    if (selectedSessionIds.length === 0) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedSessionIds.length} buổi học đã chọn?`)) return;
    
    toast.loading("Đang xóa...", { id: "bulk-delete" });
    const supabase = createClient();
    
    const { error } = await supabase.from("sessions").delete().in("id", selectedSessionIds);
    
    if (error) {
      toast.error("Có lỗi xảy ra khi xóa", { id: "bulk-delete" });
      console.error("Lỗi xóa hàng loạt:", error);
    } else {
      toast.success(`Đã xóa ${selectedSessionIds.length} buổi học!`, { id: "bulk-delete" });
      setSelectedSessionIds([]);
      setIsMultiSelectMode(false);
      loadData();
    }
  };

  const quickTickGroup = async (group: GroupWithRelations, date: string) => {
    const supabase = createClient();
    const activeMembers = group.students.filter(s => s.is_active);
    let anyUpdated = false;

    for (const student of activeMembers) {
      const existing = sessions.find(s => s.student_id === student.id && s.session_date === date);
      if (existing) {
        if (existing.status === "scheduled") {
          await supabase.from("sessions").update({ status: "completed" }).eq("id", existing.id);
          anyUpdated = true;
        }
      } else {
        await supabase.from("sessions").insert({
          student_id: student.id, session_date: date, status: "completed",
        });
        anyUpdated = true;
      }
    }

    if (anyUpdated) {
      toast.success("✅ Đã điểm danh cả nhóm");
      loadData();
    } else {
      // All already have status, open detailed dialog
      openGroupAttendance(group, date);
    }
  };

  const individualStudents = students.filter(s => !s.group_id || !groups.find(g => g.id === s.group_id));

  return (
    <div className="space-y-6">
      {/* Real-time Clock Banner */}
      {currentTime && (
        <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/10 via-primary/5 to-transparent no-print">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {getDayOfWeekVN(currentTime.getDay())}, Ngày {currentTime.getDate()} tháng {currentTime.getMonth() + 1} năm {currentTime.getFullYear()}
                </p>
                <h2 className="text-2xl font-bold text-primary tracking-tight">
                  {currentTime.toLocaleTimeString('vi-VN')}
                </h2>
              </div>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline" className="bg-background/50 border-primary/20 text-primary">
                Thời gian thực
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("attendance", "title")}</h1>
          <p className="text-muted-foreground text-sm">{t("attendance", "subtitle")}</p>
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
              <Button variant={viewMode === "individual" ? "default" : "ghost"} size="sm" onClick={() => { setViewMode("individual"); setSelectedGroupId(""); }} className="text-xs">
                Cá nhân
              </Button>
              <Button variant={viewMode === "group" ? "default" : "ghost"} size="sm" onClick={() => { setViewMode("group"); setSelectedStudentId(""); }} className="text-xs">
                Nhóm
              </Button>
            </div>
          )}

          {viewMode === "individual" ? (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[200px] flex-1">
                <Label className="text-xs">Học sinh</Label>
                <Select value={selectedStudentId} onValueChange={(v) => { 
                  if (v) {
                    setSelectedStudentId(v);
                    const st = students.find(s => s.id === v);
                    if (st) setSelectedCycle((st as any).current_cycle || 1);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Chọn học sinh" /></SelectTrigger>
                  <SelectContent>
                    {individualStudents.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 min-w-[200px] flex-1">
                <Label className="text-xs">Nhóm</Label>
                <Select value={selectedGroupId} onValueChange={(v) => { 
                  if (v) { 
                    setSelectedGroupId(v);
                    const gr = groups.find(g => g.id === v);
                    if (gr) setSelectedCycle((gr as any).current_cycle || 1);
                  } 
                }}>
                  <SelectTrigger><SelectValue placeholder="Chọn nhóm" /></SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.group_name} ({g.students.filter(s => s.is_active).length} HS)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <Card className="animate-pulse-soft border-0 shadow-sm">
            <CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Individual student view */}
          {viewMode === "individual" && selectedStudentId && (
            (() => {
              const student = students.find(s => s.id === selectedStudentId);
              if (!student) return null;
              
              const studentCycle = parseInt(String(selectedCycle)) || 1;
              const studentSessions = sessions
                .filter(s => s.student_id === student.id && (s.cycle_number || 1) === studentCycle)
                .sort((a, b) => a.session_date.localeCompare(b.session_date));

              const completedCount = studentSessions.filter((s) => s.status === "completed").reduce((sum, s) => sum + ((s as any).session_count || 1), 0);
              const tuitionDue = student.tuition_type === "per_session"
                ? completedCount * student.tuition_amount
                : student.tuition_amount;
                
              const canRenew = studentSessions.length > 0 && studentSessions.filter(s => s.status === "completed").length >= studentSessions.length;
              
              const handleRenew = async () => {
                toast.loading("Đang tạo chu kỳ mới...", { id: "renew" });
                const res = await forceRenewStudentCycle(student.id);
                if (res.success) {
                  toast.success("Đã bắt đầu chu kỳ mới!", { id: "renew" });
                  setSelectedCycle(studentCycle + 1);
                  loadData();
                } else {
                  toast.error("Lỗi: " + res.error, { id: "renew" });
                }
              };

              return (
                <Card key={student.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                            {student.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <CardTitle className="text-base">{student.full_name}</CardTitle>
                            <p className="text-xs text-muted-foreground">
                              {student.subject} • {completedCount}/{studentSessions.length} buổi (Chu kỳ {studentCycle}) • {formatCurrency(tuitionDue)}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Button 
                            onClick={() => {
                              setIsMultiSelectMode(!isMultiSelectMode);
                              if (isMultiSelectMode) setSelectedSessionIds([]); // clear selection when turning off
                            }} 
                            size="sm" 
                            variant={isMultiSelectMode ? "default" : "outline"} 
                            className="shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"/><path d="m9 11 3 3L22 4"/></svg>
                            {isMultiSelectMode ? "Tắt chọn nhiều" : "Chọn nhiều"}
                          </Button>
                          {studentCycle === 1 && (
                            <Button onClick={() => setPastCycleDialog({ isOpen: true, studentId: student.id, endDate: new Date().toISOString().split("T")[0] })} size="sm" variant="outline" className="shadow-sm">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                              Thêm kỳ quá khứ
                            </Button>
                          )}
                          {canRenew && (
                          <Button onClick={handleRenew} size="sm" variant="outline" className="shadow-sm border-primary/30 hover:bg-primary/5">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                            Qua chu kỳ mới
                          </Button>
                        )}
                        </div>
                      </div>
                    </CardHeader>
                  <CardContent>
                    {studentSessions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Không có lịch học</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {studentSessions.map((session) => {
                          const date = session.session_date;
                          const d = new Date(date);
                          const isPast = d <= new Date();
                          const isToday = d.toDateString() === new Date().toDateString();

                          const isSelected = selectedSessionIds.includes(session.id);
                          
                          const handleSessionClick = () => {
                            if (isMultiSelectMode) {
                              setSelectedSessionIds(prev => 
                                prev.includes(session.id) ? prev.filter(id => id !== session.id) : [...prev, session.id]
                              );
                            } else {
                              if (isPast) quickTick(student.id, date, session.id, session.status);
                              else openDialog(student.id, date, session.id, session.notes || "", session.status);
                            }
                          };

                          return (
                            <button
                              key={session.id}
                              onClick={handleSessionClick}
                              onContextMenu={(e) => { e.preventDefault(); openDialog(student.id, date, session.id, session.notes || "", session.status); }}
                              className={`p-2.5 rounded-lg text-left transition-all duration-200 border relative ${
                                isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/10 dark:bg-primary/20 scale-[0.98]" :
                                isToday ? "border-primary/50 ring-2 ring-primary/20" : "border-transparent"
                              } ${
                                !isSelected && (
                                  session.status === "scheduled" ? "bg-slate-50 dark:bg-slate-900 border-dashed border-border" :
                                  session.status === "completed" ? "bg-emerald-50 dark:bg-emerald-950/30" :
                                  session.status === "absent_notified" ? "bg-amber-50 dark:bg-amber-950/30" :
                                  session.status === "absent_no_notice" ? "bg-red-50 dark:bg-red-950/30" :
                                  session.status === "rescheduled" ? "bg-blue-50 dark:bg-blue-950/30" :
                                  "hover:bg-muted/50"
                                )
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full p-0.5 shadow-sm">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium">{d.getDate()}/{d.getMonth() + 1}</span>
                                <div className="flex items-center gap-1">
                                  {((session as any).session_count || 1) > 1 && (
                                    <span className="text-[9px] font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded-full">x{(session as any).session_count}</span>
                                  )}
                                  <span className="text-sm">{SESSION_STATUS_ICONS[session.status]}</span>
                                </div>
                              </div>
                              <p className="text-[10px] text-muted-foreground line-clamp-1">
                                {session.subject ? `[${session.subject}] ` : ""}
                                {session.notes || "Chưa có ghi chú"}
                              </p>
                              {session.status === "scheduled" && isPast && (
                                <p className="text-[10px] text-primary mt-1">Nhấn để điểm danh</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()
          )}

          {/* Group attendance */}
          {viewMode === "group" && selectedGroupId && (
            groups.length === 0 ? (
              <Card className="border-0 shadow-sm">
                <CardContent className="p-12 text-center text-muted-foreground">
                  Chưa có nhóm nào. Hãy tạo nhóm trước.
                </CardContent>
              </Card>
            ) : (() => {
              const group = groups.find(g => g.id === selectedGroupId);
              if (!group) return null;
              
              const groupMembers = group.students.filter(s => s.is_active);
              const groupCycle = parseInt(String(selectedCycle)) || 1;
              const memberIds = groupMembers.map(s => s.id);
              const groupSessions = sessions
                .filter(s => memberIds.includes(s.student_id) && (s.cycle_number || 1) === groupCycle)
                .sort((a, b) => a.session_date.localeCompare(b.session_date));

              // Get unique dates
              const uniqueDates = [...new Set(groupSessions.map(s => s.session_date))].sort();
              const dateStatusMap = new Map();
              uniqueDates.forEach(d => {
                const s = groupSessions.find(gs => gs.session_date === d);
                dateStatusMap.set(d, s?.status);
              });

              return (
                <Card key={group.id} className="border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {group.group_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <CardTitle className="text-base">{group.group_name}</CardTitle>
                          <p className="text-xs text-muted-foreground">
                            {groupMembers.length} học sinh • {uniqueDates.length}/{group.package_size || 12} buổi (Chu kỳ {groupCycle})
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* Member names */}
                        <div className="flex -space-x-1.5">
                          {groupMembers.slice(0, 4).map(s => (
                            <div key={s.id} className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/70 to-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold border-2 border-background" title={s.full_name}>
                              {s.full_name.charAt(0)}
                            </div>
                          ))}
                        </div>
                        
                        {groupCycle === 1 && (
                          <Button 
                            onClick={() => setPastCycleDialog({ isOpen: true, studentId: group.id, endDate: new Date().toISOString().split("T")[0] })} 
                            size="sm" 
                            variant="outline" 
                            className="shadow-sm"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                            Thêm kỳ quá khứ
                          </Button>
                        )}
                        
                        {uniqueDates.length > 0 && Array.from(dateStatusMap.values()).every(s => s === "completed") && uniqueDates.length >= (group.package_size || 12) && (
                          <Button 
                            onClick={async () => {
                              toast.loading("Đang tạo chu kỳ mới cho nhóm...", { id: "renew-group" });
                              let hasError = false;
                              for (const member of groupMembers) {
                                const res = await forceRenewStudentCycle(member.id);
                                if (!res.success) {
                                  hasError = true;
                                  toast.error(`Lỗi tạo lịch cho ${member.full_name}: ${res.error}`, { id: "renew-group" });
                                  break;
                                }
                              }
                              if (!hasError) {
                                toast.success("Đã bắt đầu chu kỳ mới!", { id: "renew-group" });
                                setSelectedCycle(groupCycle + 1);
                                loadData();
                              }
                            }} 
                            size="sm" 
                            variant="outline" 
                            className="shadow-sm border-primary/30 hover:bg-primary/5"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg>
                            Qua chu kỳ mới
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {uniqueDates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Không có buổi học</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {uniqueDates.map((date) => {
                          const dateSessions = groupSessions.filter(s => s.session_date === date);
                          const allCompleted = dateSessions.length === groupMembers.length && dateSessions.every(s => s.status === "completed");
                          const allScheduled = dateSessions.every(s => s.status === "scheduled");
                          const someAbsent = dateSessions.some(s => s.status.startsWith("absent"));
                          const d = new Date(date);
                          const isPast = d <= new Date();
                          const isToday = d.toDateString() === new Date().toDateString();

                          return (
                            <button
                              key={date}
                              onClick={() => isPast && allScheduled ? quickTickGroup(group, date) : openGroupAttendance(group, date)}
                              onContextMenu={(e) => { e.preventDefault(); openGroupAttendance(group, date); }}
                              className={`p-2.5 rounded-lg text-left transition-all duration-200 border ${
                                isToday ? "border-primary/50 ring-2 ring-primary/20" : "border-transparent"
                              } ${
                                allCompleted ? "bg-emerald-50 dark:bg-emerald-950/30" :
                                someAbsent ? "bg-amber-50 dark:bg-amber-950/30" :
                                allScheduled ? "bg-slate-50 dark:bg-slate-900 border-dashed border-border" :
                                "bg-blue-50 dark:bg-blue-950/30"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium">{d.getDate()}/{d.getMonth() + 1}</span>
                                <span className="text-sm">
                                  {allCompleted ? "✅" : someAbsent ? "⚠️" : allScheduled ? "🕒" : "📝"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-0.5">
                                {dateSessions.map(s => {
                                  const member = groupMembers.find(m => m.id === s.student_id);
                                  return (
                                    <span key={s.id} className="text-[9px]" title={`${member?.full_name}: ${SESSION_STATUS_LABELS[s.status]}`}>
                                      {SESSION_STATUS_ICONS[s.status]}
                                    </span>
                                  );
                                })}
                              </div>
                              {allScheduled && isPast && (
                                <p className="text-[10px] text-primary mt-1">Nhấn để điểm danh</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()
          )}
        </>
      )}

      {/* Individual edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Chấm công buổi {editSession && formatDate(editSession.date)}</DialogTitle>
          </DialogHeader>
          {editSession && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ngày học</Label>
                  <Input type="date" value={editSession.date} onChange={(e) => setEditSession({ ...editSession, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Môn học</Label>
                  <Select value={editSession.subject || "empty"} onValueChange={(v) => setEditSession({ ...editSession, subject: v === "empty" ? "" : v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Theo học sinh" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empty">Theo học sinh</SelectItem>
                      <SelectItem value="Toán">Toán</SelectItem>
                      <SelectItem value="Tiếng Anh">Tiếng Anh</SelectItem>
                      <SelectItem value="Vật lý">Vật lý</SelectItem>
                      <SelectItem value="Hóa học">Hóa học</SelectItem>
                      <SelectItem value="Ngữ văn">Ngữ văn</SelectItem>
                      <SelectItem value="Khác">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Giờ bắt đầu</Label>
                  <Input type="time" value={editSession.startTime} onChange={(e) => setEditSession({ ...editSession, startTime: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Giờ kết thúc</Label>
                  <Input type="time" value={editSession.endTime} onChange={(e) => setEditSession({ ...editSession, endTime: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Trạng thái</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(SESSION_STATUS_LABELS) as [SessionStatus, string][]).map(([value, label]) => (
                    <button key={value} type="button"
                      onClick={() => setEditSession({ ...editSession, status: value })}
                      className={`p-2.5 rounded-lg text-sm font-medium transition-all border ${
                        editSession.status === value
                          ? SESSION_STATUS_COLORS[value] + " border-current"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {SESSION_STATUS_ICONS[value]} {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={editSession.notes}
                  onChange={(e) => setEditSession({ ...editSession, notes: e.target.value })}
                  placeholder="Ghi chú buổi học..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Số buổi tính</Label>
                <Select value={String(editSession.sessionCount || 1)} onValueChange={(v) => setEditSession({ ...editSession, sessionCount: parseInt(v || "1") })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 buổi (bình thường)</SelectItem>
                    <SelectItem value="2">2 buổi (dồn buổi)</SelectItem>
                    <SelectItem value="3">3 buổi</SelectItem>
                  </SelectContent>
                </Select>
                {(editSession.sessionCount || 1) > 1 && (
                  <p className="text-xs text-violet-600 dark:text-violet-400">⚡ Buổi này sẽ được tính học phí x{editSession.sessionCount}</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2">
            {editSession?.existingId && (
              <Button variant="outline" size="sm" onClick={deleteSession} className="text-destructive mr-auto">
                Xóa
              </Button>
            )}
            {editSession?.existingId && (
              <Button variant="outline" size="sm" onClick={() => {
                setShiftDialog({ isOpen: true, studentId: editSession.studentId, fromDate: editSession.date, daysOption: "7", customDays: "7" });
              }} className="mr-auto text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m9 18 6-6-6-6"/></svg>
                Dời lịch
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={saveSession}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group attendance dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Chấm công nhóm — {groupAttendance && formatDate(groupAttendance.date)}
            </DialogTitle>
          </DialogHeader>
          {groupAttendance && (
            <div className="space-y-4">
              <div className="space-y-2 px-1">
                <Label>Ngày học (áp dụng cho cả nhóm)</Label>
                <Input type="date" value={groupAttendance.date} onChange={(e) => setGroupAttendance({ ...groupAttendance, date: e.target.value })} />
              </div>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto px-1">
                {groupAttendance.members.map((member, idx) => (
                  <div key={member.studentId} className="p-3 rounded-lg border space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="font-medium text-sm">{member.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="time" value={member.startTime} onChange={(e) => {
                      const updated = [...groupAttendance.members];
                      updated[idx] = { ...updated[idx], startTime: e.target.value };
                      setGroupAttendance({ ...groupAttendance, members: updated });
                    }} className="h-8 text-xs" title="Giờ bắt đầu" />
                    <Input type="time" value={member.endTime} onChange={(e) => {
                      const updated = [...groupAttendance.members];
                      updated[idx] = { ...updated[idx], endTime: e.target.value };
                      setGroupAttendance({ ...groupAttendance, members: updated });
                    }} className="h-8 text-xs" title="Giờ kết thúc" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(SESSION_STATUS_LABELS) as [SessionStatus, string][]).map(([value, label]) => (
                      <button key={value} type="button"
                        onClick={() => {
                          const updated = [...groupAttendance.members];
                          updated[idx] = { ...updated[idx], status: value };
                          setGroupAttendance({ ...groupAttendance, members: updated });
                        }}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all border ${
                          member.status === value
                            ? SESSION_STATUS_COLORS[value] + " border-current"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        {SESSION_STATUS_ICONS[value]} {label}
                      </button>
                    ))}
                  </div>
                  <Input
                    placeholder="Ghi chú riêng..."
                    value={member.notes}
                    onChange={(e) => {
                      const updated = [...groupAttendance.members];
                      updated[idx] = { ...updated[idx], notes: e.target.value };
                      setGroupAttendance({ ...groupAttendance, members: updated });
                    }}
                    className="h-8 text-xs"
                  />
                   <div className="flex items-center gap-2">
                     <Label className="text-xs whitespace-nowrap">Số buổi:</Label>
                     <Select value={String(member.sessionCount || 1)} onValueChange={(v) => {
                       const updated = [...groupAttendance.members];
                       updated[idx] = { ...updated[idx], sessionCount: parseInt(v || "1") };
                       setGroupAttendance({ ...groupAttendance, members: updated });
                     }}>
                       <SelectTrigger className="h-8 text-xs w-[120px]">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="1">1 buổi</SelectItem>
                         <SelectItem value="2">2 buổi (dồn)</SelectItem>
                         <SelectItem value="3">3 buổi</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                </div>
              ))}
            </div>
            </div>
          )}
          <DialogFooter className="flex-row sm:justify-between items-center w-full">
            <Button variant="ghost" size="sm" onClick={() => {
              if (groupAttendance) {
                setGroupAttendance({
                  ...groupAttendance,
                  members: groupAttendance.members.map(m => ({ ...m, status: "completed" as SessionStatus }))
                });
              }
            }} className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 mr-auto">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Tất cả có mặt
            </Button>
            {groupAttendance && groupAttendance.members.some(m => m.existingId) && (
              <Button variant="outline" size="sm" onClick={() => {
                setShiftDialog({ isOpen: true, groupId: groupAttendance.groupId, fromDate: groupAttendance.date, daysOption: "7", customDays: "7" });
              }} className="text-orange-600 border-orange-200 hover:bg-orange-50 dark:hover:bg-orange-950 mr-auto">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="m9 18 6-6-6-6"/></svg>
                Dời lịch
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Hủy</Button>
              <Button onClick={saveGroupAttendance}>Lưu tất cả</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Past Cycle Dialog */}
      <Dialog open={pastCycleDialog.isOpen} onOpenChange={(open) => setPastCycleDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Thêm kỳ học quá khứ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Ngày kết thúc kỳ học cũ</Label>
              <Input type="date" value={pastCycleDialog.endDate} onChange={(e) => setPastCycleDialog(prev => ({ ...prev, endDate: e.target.value }))} />
              <p className="text-xs text-muted-foreground mt-2">
                Hệ thống sẽ tự động tính lùi lại dựa trên Lịch học cố định để tạo đủ số buổi của 1 gói học. Dữ liệu này sẽ được đặt là Kỳ 1, và kỳ hiện tại sẽ đổi thành Kỳ 2.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPastCycleDialog(prev => ({ ...prev, isOpen: false }))}>Hủy</Button>
            <Button onClick={handleRestorePastCycle}>Khôi phục</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkEditDialog.isOpen} onOpenChange={(open) => setBulkEditDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sửa hàng loạt ({selectedSessionIds.length} buổi)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Chọn các thông tin bạn muốn áp dụng cho tất cả các buổi học đã chọn:</p>
            
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateStatus} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateStatus: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật trạng thái
              </label>
              {bulkEditDialog.updateStatus && (
                <div className="pl-6 grid grid-cols-2 gap-2">
                  {(Object.entries(SESSION_STATUS_LABELS) as [SessionStatus, string][]).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setBulkEditDialog(prev => ({ ...prev, status: value }))}
                      className={`text-xs px-2 py-1.5 rounded-md flex items-center gap-1.5 justify-start transition-all ${bulkEditDialog.status === value ? "ring-2 ring-primary bg-primary/5 font-medium" : "bg-muted/50 hover:bg-muted"}`}
                    >
                      {SESSION_STATUS_ICONS[value]} {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateTime} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateTime: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật giờ học
              </label>
              {bulkEditDialog.updateTime && (
                <div className="pl-6 flex items-center gap-2">
                  <Input type="time" value={bulkEditDialog.startTime} onChange={(e) => setBulkEditDialog(prev => ({ ...prev, startTime: e.target.value }))} className="w-full text-sm" />
                  <span>-</span>
                  <Input type="time" value={bulkEditDialog.endTime} onChange={(e) => setBulkEditDialog(prev => ({ ...prev, endTime: e.target.value }))} className="w-full text-sm" />
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateNotes} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateNotes: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật ghi chú
              </label>
              {bulkEditDialog.updateNotes && (
                <div className="pl-6">
                  <Textarea
                    placeholder="Nhập ghi chú chung..."
                    value={bulkEditDialog.notes}
                    onChange={(e) => setBulkEditDialog(prev => ({ ...prev, notes: e.target.value }))}
                    className="min-h-[80px] text-sm resize-none"
                  />
                </div>
              )}
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateSubject} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateSubject: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật môn học
              </label>
              {bulkEditDialog.updateSubject && (
                <div className="pl-6">
                  <Select
                    value={bulkEditDialog.subject}
                    onValueChange={(value) => setBulkEditDialog(prev => ({ ...prev, subject: value || "" }))}
                  >
                    <SelectTrigger className="w-full text-sm h-9">
                      <SelectValue placeholder="Chọn môn học" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Toán">Toán</SelectItem>
                      <SelectItem value="Tiếng Việt">Tiếng Việt</SelectItem>
                      <SelectItem value="Ngữ Văn">Ngữ Văn</SelectItem>
                      <SelectItem value="Tiếng Anh">Tiếng Anh</SelectItem>
                      <SelectItem value="Vật Lý">Vật Lý</SelectItem>
                      <SelectItem value="Hóa Học">Hóa Học</SelectItem>
                      <SelectItem value="Sinh Học">Sinh Học</SelectItem>
                      <SelectItem value="Lịch Sử">Lịch Sử</SelectItem>
                      <SelectItem value="Địa Lý">Địa Lý</SelectItem>
                      <SelectItem value="Tin Học">Tin Học</SelectItem>
                      <SelectItem value="Khác">Khác</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateSessionCount} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateSessionCount: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật số buổi tính
              </label>
              {bulkEditDialog.updateSessionCount && (
                <div className="pl-6">
                  <Select
                    value={String(bulkEditDialog.sessionCount)}
                    onValueChange={(value) => setBulkEditDialog(prev => ({ ...prev, sessionCount: parseInt(value || "1") }))}
                  >
                    <SelectTrigger className="w-full text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 buổi (bình thường)</SelectItem>
                      <SelectItem value="2">2 buổi (dồn buổi)</SelectItem>
                      <SelectItem value="3">3 buổi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input 
                  type="checkbox" 
                  checked={bulkEditDialog.updateDate} 
                  onChange={(e) => setBulkEditDialog(prev => ({ ...prev, updateDate: e.target.checked }))}
                  className="rounded border-gray-300 w-4 h-4 text-primary focus:ring-primary"
                />
                Cập nhật ngày học (Dời lịch)
              </label>
              {bulkEditDialog.updateDate && (
                <div className="pl-6 space-y-2">
                  <p className="text-xs text-muted-foreground">Tất cả các buổi đã chọn sẽ được cộng thêm số ngày này.</p>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      min="1" 
                      value={bulkEditDialog.daysToShift} 
                      onChange={(e) => setBulkEditDialog(prev => ({ ...prev, daysToShift: parseInt(e.target.value) || 0 }))} 
                      className="w-[100px] text-sm" 
                    />
                    <span className="text-sm">ngày</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditDialog(prev => ({ ...prev, isOpen: false }))}>Hủy</Button>
            <Button onClick={saveBulkEdit} disabled={!bulkEditDialog.updateStatus && !bulkEditDialog.updateTime && !bulkEditDialog.updateNotes && !bulkEditDialog.updateSubject && !bulkEditDialog.updateSessionCount && !bulkEditDialog.updateDate}>
              Lưu {selectedSessionIds.length} buổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating Action Bar for Multi-Select */}
      {selectedSessionIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t shadow-lg z-50 flex items-center justify-between sm:justify-center sm:gap-6 pb-safe animate-in slide-in-from-bottom-full duration-300">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">{selectedSessionIds.length}</span>
              Đã chọn
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedSessionIds([])} className="text-muted-foreground hidden sm:flex">
              Bỏ chọn tất cả
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedSessionIds([])} className="sm:hidden">
              Hủy
            </Button>
            <Button variant="destructive" size="sm" onClick={deleteBulkSessions} className="shadow-md shadow-destructive/20">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 sm:mr-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              <span className="hidden sm:inline">Xóa</span>
            </Button>
            <Button size="sm" className="shadow-md shadow-primary/20" onClick={() => setBulkEditDialog(prev => ({ ...prev, isOpen: true }))}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1 sm:mr-2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 Z"/></svg>
              <span className="hidden sm:inline">Sửa hàng loạt</span>
              <span className="sm:hidden">Sửa</span>
            </Button>
          </div>
        </div>
      )}
      {/* Shift Schedule Dialog */}
      <Dialog open={shiftDialog.isOpen} onOpenChange={(open) => setShiftDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dời lịch học tự động</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200 text-sm rounded-lg border border-orange-200 dark:border-orange-800">
              Bạn đang dời buổi học ngày <strong>{shiftDialog.fromDate ? formatDate(shiftDialog.fromDate) : ""}</strong>.
              <br/>
              Tất cả các buổi học <strong>từ ngày này trở về sau</strong> (trong cùng chu kỳ) sẽ được dời thêm số ngày tương ứng để bảo toàn chuỗi lịch học.
            </div>
            
            <div className="space-y-2">
              <Label>Dời đi bao nhiêu ngày?</Label>
              <Select value={shiftDialog.daysOption} onValueChange={(v) => setShiftDialog(prev => ({ ...prev, daysOption: v || "7" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 ngày (Dời đúng 1 tuần)</SelectItem>
                  <SelectItem value="14">14 ngày (Dời 2 tuần)</SelectItem>
                  <SelectItem value="2">2 ngày</SelectItem>
                  <SelectItem value="3">3 ngày</SelectItem>
                  <SelectItem value="custom">Tùy chỉnh...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {shiftDialog.daysOption === "custom" && (
              <div className="space-y-2">
                <Label>Nhập số ngày muốn dời</Label>
                <Input 
                  type="number" 
                  min="1" 
                  value={shiftDialog.customDays} 
                  onChange={(e) => setShiftDialog(prev => ({ ...prev, customDays: e.target.value }))}
                  placeholder="Ví dụ: 5"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShiftDialog(prev => ({ ...prev, isOpen: false }))}>Hủy</Button>
            <Button onClick={handleShiftSchedule}>Xác nhận dời lịch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
