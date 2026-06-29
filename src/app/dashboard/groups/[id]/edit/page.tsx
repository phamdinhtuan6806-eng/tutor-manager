"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DAY_NAMES } from "@/lib/constants";
import { formatCurrency } from "@/lib/utils";
import type { StudentGroup, Student, GroupSchedule } from "@/lib/types";

interface MemberForm {
  id?: string;
  full_name: string;
  parent_phone: string;
  class: string;
  isExisting?: boolean; // already in group
  tuition_amount: string;
}

export default function EditGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [availableStudents, setAvailableStudents] = useState<Student[]>([]);
  const [showExistingPicker, setShowExistingPicker] = useState(false);

  const [form, setForm] = useState({
    group_name: "", class: "", subject: "", notes: "",
    tuition_type: "monthly" as "per_session" | "monthly",
    tuition_amount: "",
    bank_name: "", bank_account_holder: "", bank_account_number: "",
    start_date: "", package_size: "12",
  });

  const [members, setMembers] = useState<MemberForm[]>([]);
  const [removedMemberIds, setRemovedMemberIds] = useState<string[]>([]);
  const [newMember, setNewMember] = useState<MemberForm>({ full_name: "", parent_phone: "", class: "", tuition_amount: "" });
  const [schedulePatterns, setSchedulePatterns] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([]);
  const [template, setTemplate] = useState({ day_of_week: "1", start_time: "18:00", end_time: "19:30" });

  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string>("");
  const [existingQrUrl, setExistingQrUrl] = useState<string>("");

  useEffect(() => { loadGroup(); }, [id]);

  const loadGroup = async () => {
    const supabase = createClient();
    const { data: groupData } = await supabase.from("student_groups").select("*").eq("id", id).single();
    const { data: membersData } = await supabase.from("students").select("*").eq("group_id", id).eq("is_active", true).order("full_name");
    const { data: schedData } = await supabase.from("group_schedules").select("*").eq("group_id", id).order("day_of_week");
    const { data: available } = await supabase.from("students").select("*").eq("is_active", true).is("group_id", null).order("full_name");

    if (groupData) {
      const g = groupData as StudentGroup;
      setForm({
        group_name: g.group_name, class: g.class || "", subject: g.subject || "",
        notes: g.notes || "", tuition_type: g.tuition_type, tuition_amount: String(g.tuition_amount),
        bank_name: g.bank_name || "", bank_account_holder: g.bank_account_holder || "",
        bank_account_number: g.bank_account_number || "",
        start_date: g.start_date || "", package_size: String(g.package_size || 12),
      });
      if (g.qr_image_url) { setExistingQrUrl(g.qr_image_url); setQrPreview(g.qr_image_url); }

      setMembers((membersData || []).map((s: Student) => ({
        id: s.id, full_name: s.full_name, parent_phone: s.parent_phone || "",
        class: s.class || "", isExisting: true, tuition_amount: String(s.tuition_amount || 0)
      })));

      setSchedulePatterns((schedData || []).map((sc: GroupSchedule) => ({
        day_of_week: sc.day_of_week, start_time: sc.start_time, end_time: sc.end_time || "",
      })));
    }
    setAvailableStudents((available || []) as Student[]);
    setPageLoading(false);
  };

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setQrFile(file); setQrPreview(URL.createObjectURL(file)); }
  };

  const addNewMember = () => {
    if (!newMember.full_name.trim()) { toast.error("Vui lòng nhập tên"); return; }
    if (members.some(m => m.full_name.toLowerCase() === newMember.full_name.toLowerCase())) {
      toast.error("Đã có trong nhóm"); return;
    }
    if (!newMember.tuition_amount || parseInt(newMember.tuition_amount) <= 0) {
      toast.error("Vui lòng nhập học phí hợp lệ"); return;
    }
    setMembers([...members, { ...newMember, full_name: newMember.full_name.trim() }]);
    setNewMember({ full_name: "", parent_phone: "", class: "", tuition_amount: "" });
  };

  const addExistingMember = (student: Student) => {
    if (members.some(m => m.id === student.id)) { toast.error("Đã có trong nhóm"); return; }
    setMembers([...members, { id: student.id, full_name: student.full_name, parent_phone: student.parent_phone || "", class: student.class || "", isExisting: true, tuition_amount: String(student.tuition_amount || 0) }]);
    setShowExistingPicker(false);
  };

  const removeMember = (index: number) => {
    const member = members[index];
    if (member.id && member.isExisting) {
      setRemovedMemberIds([...removedMemberIds, member.id]);
    }
    setMembers(members.filter((_, i) => i !== index));
  };

  const addSchedulePattern = () => {
    const newPattern = { day_of_week: parseInt(template.day_of_week), start_time: template.start_time, end_time: template.end_time };
    const exists = schedulePatterns.some(p => p.day_of_week === newPattern.day_of_week && p.start_time === newPattern.start_time);
    if (exists) { toast.info("Lịch này đã tồn tại"); return; }
    setSchedulePatterns([...schedulePatterns, newPattern]);
    toast.success("Đã thêm lịch");
  };

  const activeMembers = members.filter((_, i) => true); // all current members

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.group_name.trim()) { toast.error("Vui lòng nhập tên nhóm"); return; }
    if (activeMembers.length === 0) { toast.error("Nhóm phải có ít nhất 1 học sinh"); return; }
    if (activeMembers.some(m => !m.tuition_amount || parseInt(m.tuition_amount) <= 0)) { toast.error("Vui lòng nhập học phí hợp lệ cho tất cả học sinh"); return; }
    setLoading(true);

    try {
      const supabase = createClient();

      let qr_image_url = existingQrUrl || null;
      if (qrFile) {
        const fileExt = qrFile.name.split(".").pop();
        const fileName = `public_qr/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("qr-images").upload(fileName, qrFile);
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("qr-images").getPublicUrl(fileName);
          qr_image_url = urlData.publicUrl;
        }
      }

      // Update group
      const { error } = await supabase.from("student_groups").update({
        group_name: form.group_name.trim(), subject: form.subject.trim() || null,
        class: form.class.trim() || null, notes: form.notes.trim() || null,
        tuition_type: form.tuition_type, tuition_amount: 0,
        bank_name: form.bank_name.trim() || null, bank_account_holder: form.bank_account_holder.trim() || null,
        bank_account_number: form.bank_account_number.trim() || null,
        start_date: form.start_date || null, package_size: parseInt(form.package_size),
        qr_image_url,
      }).eq("id", id);

      if (error) throw error;

      // Save as default settings if the user doesn't have any yet
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: existingSettings } = await supabase.from("user_settings").select("user_id").eq("user_id", user.id).maybeSingle();
        if (!existingSettings && (form.bank_name || form.bank_account_holder || form.bank_account_number || qr_image_url)) {
          await supabase.from("user_settings").insert({
            user_id: user.id,
            bank_name: form.bank_name.trim() || null,
            bank_account_holder: form.bank_account_holder.trim() || null,
            bank_account_number: form.bank_account_number.trim() || null,
            qr_image_url: qr_image_url || null,
          });
        }
      }

      // Remove members
      if (removedMemberIds.length > 0) {
        await supabase.from("students").update({ group_id: null }).in("id", removedMemberIds);
      }

      // Handle existing members (update tuition) and new members (create)
      // Track IDs of newly added students so we can create sessions for them
      const newlyAddedStudentIds: string[] = [];
      
      // Get group's current_cycle from existing members
      const existingMemberIds = activeMembers.filter(m => m.id && m.isExisting).map(m => m.id!);
      let groupCurrentCycle = 1;
      if (existingMemberIds.length > 0) {
        const { data: existingStudent } = await supabase
          .from("students")
          .select("current_cycle")
          .eq("id", existingMemberIds[0])
          .single();
        if (existingStudent) {
          groupCurrentCycle = existingStudent.current_cycle || 1;
        }
      }
      
      for (const member of activeMembers) {
        if (member.id && member.isExisting) {
          // Update tuition for existing members
          await supabase.from("students").update({
            tuition_type: form.tuition_type,
            tuition_amount: parseInt(member.tuition_amount),
          }).eq("id", member.id);
        } else if (member.id && !member.isExisting) {
          // Assign existing student to this group
          await supabase.from("students").update({
            group_id: id,
            tuition_type: form.tuition_type,
            tuition_amount: parseInt(member.tuition_amount),
            package_size: parseInt(form.package_size),
            current_cycle: groupCurrentCycle,
          }).eq("id", member.id);
          newlyAddedStudentIds.push(member.id);
        } else {
          // Create new student
          const { data: newStudent } = await supabase.from("students").insert({
            full_name: member.full_name,
            parent_phone: member.parent_phone || null,
            class: member.class || form.class.trim() || null,
            subject: form.subject.trim() || null,
            group_id: id,
            tuition_type: form.tuition_type,
            tuition_amount: parseInt(member.tuition_amount),
            package_size: parseInt(form.package_size),
            start_date: form.start_date || null,
            current_cycle: groupCurrentCycle,
          }).select("id").single();
          if (newStudent) {
            newlyAddedStudentIds.push(newStudent.id);
          }
        }
      }

      // Generate sessions for newly added students
      // Copy remaining sessions (from today onwards) from existing group members
      if (newlyAddedStudentIds.length > 0 && existingMemberIds.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        
        // Get sessions from ONE existing member as a template (all members share the same dates)
        const { data: templateSessions } = await supabase
          .from("sessions")
          .select("*")
          .eq("student_id", existingMemberIds[0])
          .eq("cycle_number", groupCurrentCycle)
          .gte("session_date", today)
          .order("session_date");
        
        if (templateSessions && templateSessions.length > 0) {
          const sessionInserts = [];
          for (const newStudentId of newlyAddedStudentIds) {
            for (const tmpl of templateSessions) {
              sessionInserts.push({
                student_id: newStudentId,
                session_date: tmpl.session_date,
                subject: tmpl.subject || form.subject.trim() || null,
                status: "scheduled",
                notes: tmpl.notes || null,
                cycle_number: groupCurrentCycle,
                session_count: 1,
              });
            }
          }
          if (sessionInserts.length > 0) {
            await supabase.from("sessions").insert(sessionInserts);
            toast.success(`Đã tạo ${templateSessions.length} buổi học cho ${newlyAddedStudentIds.length} học sinh mới`);
          }
        }
      }

      // Update group schedules
      await supabase.from("group_schedules").delete().eq("group_id", id);
      if (schedulePatterns.length > 0) {
        await supabase.from("group_schedules").insert(
          schedulePatterns.map(p => ({ group_id: id, day_of_week: p.day_of_week, start_time: p.start_time, end_time: p.end_time || null }))
        );
      }

      toast.success("Đã cập nhật nhóm!");
      router.refresh();
      router.push(`/dashboard/groups/${id}`);
    } catch (err: any) {
      console.error(err);
      toast.error("Có lỗi xảy ra: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  if (pageLoading) return <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Chỉnh sửa nhóm</h1>
          <p className="text-muted-foreground text-sm">{form.group_name}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4"><CardTitle className="text-base">Thông tin nhóm</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Tên nhóm *</Label>
                <Input value={form.group_name} onChange={e => setForm({ ...form, group_name: e.target.value })} required className="h-11" />
              </div>
              <div className="space-y-2"><Label>Lớp</Label><Input value={form.class} onChange={e => setForm({ ...form, class: e.target.value })} className="h-11" /></div>
              <div className="space-y-2">
                <Label htmlFor="subject">Môn học</Label>
                <Select value={form.subject} onValueChange={(v) => setForm({ ...form, subject: v || "" })}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Chọn môn học" />
                  </SelectTrigger>
                  <SelectContent>
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
            <div className="space-y-2"><Label>Ghi chú</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          </CardContent>
        </Card>

        {/* Members */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-violet-500/5 px-6 py-4 border-b">
            <CardTitle className="text-base text-violet-700 dark:text-violet-400">Thành viên nhóm</CardTitle>
          </div>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Thêm học sinh mới</Label>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5 flex-1 min-w-[150px]">
                  <Input placeholder="Họ tên *" value={newMember.full_name}
                    onChange={(e) => setNewMember({ ...newMember, full_name: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Input placeholder="SĐT phụ huynh" value={newMember.parent_phone}
                    onChange={(e) => setNewMember({ ...newMember, parent_phone: e.target.value })} className="h-10 w-[140px]" />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[120px]">
                  <Input placeholder="Lớp" value={newMember.class}
                    onChange={(e) => setNewMember({ ...newMember, class: e.target.value })} className="h-10" />
                </div>
                <div className="space-y-1.5 flex-1 min-w-[140px]">
                  <Input placeholder="Học phí/người" type="number" value={newMember.tuition_amount}
                    onChange={(e) => setNewMember({ ...newMember, tuition_amount: e.target.value })} className="h-10" />
                </div>
                <Button type="button" variant="secondary" onClick={addNewMember} className="h-10">Thêm</Button>
              </div>
            </div>

            {availableStudents.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Chọn học sinh có sẵn</Label>
                {!showExistingPicker ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowExistingPicker(true)}>Chọn từ danh sách</Button>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                    {availableStudents.filter(s => !members.some(m => m.id === s.id)).map((s) => (
                      <button key={s.id} type="button" onClick={() => addExistingMember(s)}
                        className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors text-left">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold shrink-0">
                          {s.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div><p className="text-sm font-medium">{s.full_name}</p><p className="text-xs text-muted-foreground">{[s.subject, s.class].filter(Boolean).join(" • ")}</p></div>
                      </button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setShowExistingPicker(false)}>Đóng</Button>
                  </div>
                )}
              </div>
            )}

            {activeMembers.length > 0 && (
              <div className="bg-muted/30 p-4 rounded-xl border">
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-medium text-violet-700 dark:text-violet-400">Thành viên ({activeMembers.length})</Label>
                </div>
                <div className="space-y-2">
                  {activeMembers.map((member, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-background border flex-wrap gap-2">
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {member.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{member.full_name}</p>
                          <p className="text-xs text-muted-foreground">{member.isExisting ? "Thành viên hiện tại" : member.id ? "Chuyển vào nhóm" : "Tạo mới"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-1 justify-end min-w-[200px]">
                        <Input
                          type="number"
                          placeholder="Học phí riêng"
                          value={member.tuition_amount}
                          onChange={(e) => {
                            const newMembers = [...members];
                            newMembers[i].tuition_amount = e.target.value;
                            setMembers(newMembers);
                          }}
                          className="h-8 text-xs max-w-[120px]"
                        />
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeMember(i)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tuition */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Học phí nhóm</CardTitle>
            <CardDescription>Loại học phí áp dụng chung cho tất cả thành viên trong nhóm</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Loại</Label>
                <Select value={form.tuition_type} onValueChange={v => { if (v) setForm({ ...form, tuition_type: v as "per_session" | "monthly" }); }}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="per_session">Theo buổi</SelectItem><SelectItem value="monthly">Theo tháng</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-primary/5 px-6 py-4 border-b">
            <CardTitle className="text-base text-primary">Thời gian học</CardTitle>
            <CardDescription className="text-primary/70">Thiết lập ngày học và gói buổi học cho nhóm</CardDescription>
          </div>
          <CardContent className="space-y-6 pt-6">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Ngày bắt đầu *</Label>
                <Input id="start_date" type="date" value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="package_size">Số buổi của khóa học/tháng *</Label>
                <Input id="package_size" type="number" placeholder="12" value={form.package_size}
                  onChange={(e) => setForm({ ...form, package_size: e.target.value })} required className="h-11" />
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-sm font-semibold">Lịch học nhóm cố định</Label>
              <div className="flex flex-wrap gap-2 items-end">
                <Select value={template.day_of_week} onValueChange={(v) => { if (v) setTemplate({ ...template, day_of_week: v }); }}>
                  <SelectTrigger className="w-[130px] h-10"><SelectValue>{DAY_NAMES[parseInt(template.day_of_week)]}</SelectValue></SelectTrigger>
                  <SelectContent>{Object.entries(DAY_NAMES).map(([val, label]) => (<SelectItem key={val} value={val}>{label}</SelectItem>))}</SelectContent>
                </Select>
                <Input type="time" value={template.start_time} onChange={(e) => setTemplate({ ...template, start_time: e.target.value })} className="w-[120px] h-10" />
                <span className="flex items-center text-muted-foreground pb-2">→</span>
                <Input type="time" value={template.end_time} onChange={(e) => setTemplate({ ...template, end_time: e.target.value })} className="w-[120px] h-10" />
                <Button type="button" variant="secondary" onClick={addSchedulePattern} className="h-10">Thêm lịch</Button>
              </div>

              {schedulePatterns.length > 0 && (
                <div className="bg-muted/30 p-4 rounded-xl border">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="font-medium text-primary">Lịch đã thêm</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setSchedulePatterns([])}>Xóa hết</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {schedulePatterns.map((p, i) => (
                      <Badge key={i} variant="outline" className="pl-3 pr-1 py-1.5 text-sm gap-2 bg-background border-primary/20">
                        {DAY_NAMES[p.day_of_week]} • {p.start_time}{p.end_time && ` - ${p.end_time}`}
                        <button type="button" onClick={() => setSchedulePatterns(schedulePatterns.filter((_, idx) => idx !== i))} className="ml-1 p-1 rounded-full hover:bg-destructive/20 hover:text-destructive">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Bank info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4"><CardTitle className="text-base">Thông tin chuyển khoản</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Ngân hàng</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} className="h-11" /></div>
              <div className="space-y-2"><Label>Chủ TK</Label><Input value={form.bank_account_holder} onChange={e => setForm({ ...form, bank_account_holder: e.target.value })} className="h-11" /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Số TK</Label><Input value={form.bank_account_number} onChange={e => setForm({ ...form, bank_account_number: e.target.value })} className="h-11" /></div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Ảnh QR</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  {qrPreview ? <img src={qrPreview} alt="QR" className="w-full h-full object-contain rounded-xl" /> : (
                    <><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-1"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg><span className="text-xs text-muted-foreground">Upload QR</span></>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
                </label>
                {qrPreview && <Button type="button" variant="ghost" size="sm" onClick={() => { setQrFile(null); setQrPreview(""); setExistingQrUrl(""); }} className="text-destructive">Xóa ảnh</Button>}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
          <Button type="submit" disabled={loading} className="min-w-[140px] shadow-md shadow-primary/20">
            {loading ? <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Đang lưu...</span> : "Lưu thay đổi"}
          </Button>
        </div>
      </form>
    </div>
  );
}
