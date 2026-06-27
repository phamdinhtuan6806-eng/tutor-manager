"use client";

import { useState, useEffect } from "react";
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
import { eachDayOfInterval, format, getDay, parseISO, isSameDay } from "date-fns";

export default function NewStudentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    class: "",
    subject: "",
    parent_phone: "",
    notes: "",
    tuition_type: "monthly" as "per_session" | "monthly",
    tuition_amount: "",
    bank_name: "",
    bank_account_holder: "",
    bank_account_number: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
    package_size: "12",
  });
  
  // Custom specific sessions
  const [sessions, setSessions] = useState<{ date: string; start_time: string; end_time: string; subject?: string }[]>([]);
  
  // Template for auto-generation
  const [template, setTemplate] = useState({ day_of_week: "1", start_time: "18:00", end_time: "19:30", subject: "" });
  
  // Ad-hoc session
  const [customSession, setCustomSession] = useState({ date: "", start_time: "18:00", end_time: "19:30", subject: "" });
  const [schedulePatterns, setSchedulePatterns] = useState<{ day_of_week: number; start_time: string; end_time: string; subject?: string }[]>([]);

  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState<string>("");

  useEffect(() => {
    loadDefaultSettings();
  }, []);

  const loadDefaultSettings = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();
      if (data) {
        setForm(prev => ({
          ...prev,
          bank_name: data.bank_name || "",
          bank_account_holder: data.bank_account_holder || "",
          bank_account_number: data.bank_account_number || "",
        }));
        if (data.qr_image_url) setQrPreview(data.qr_image_url);
      }
    }
  };

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setQrFile(file);
      setQrPreview(URL.createObjectURL(file));
    }
  };

  const addSchedulePattern = () => {
    const targetDayIndex = parseInt(template.day_of_week);
    const newPattern = {
      day_of_week: targetDayIndex,
      start_time: template.start_time,
      end_time: template.end_time,
      subject: template.subject.trim() || undefined,
    };

    setSchedulePatterns((prev) => {
      const exists = prev.some(
        (p) =>
          p.day_of_week === newPattern.day_of_week &&
          p.start_time === newPattern.start_time &&
          p.end_time === newPattern.end_time
      );
      if (exists) {
        toast.error("Lịch này đã tồn tại");
        return prev;
      }
      return [...prev, newPattern];
    });
    toast.success("Đã thêm lịch cố định");
  };

  const generateSessions = () => {
    if (!form.start_date || !form.package_size) {
      toast.error("Vui lòng chọn Ngày bắt đầu và Số buổi học");
      return;
    }
    if (schedulePatterns.length === 0) {
      toast.error("Vui lòng thêm ít nhất 1 lịch cố định trước khi tạo tự động");
      return;
    }

    const start = parseISO(form.start_date);
    const targetSize = parseInt(form.package_size);
    if (isNaN(targetSize) || targetSize <= 0) {
      toast.error("Số buổi học không hợp lệ");
      return;
    }

    const newSessions: typeof sessions = [];
    let currentDate = start;
    let generatedCount = 0;
    let iterations = 0;
    const MAX_ITERATIONS = 365;

    while (generatedCount < targetSize && iterations < MAX_ITERATIONS) {
      const currentDayIndex = getDay(currentDate); // 0=Sun, 1=Mon
      const matchingPatterns = schedulePatterns.filter(p => p.day_of_week === currentDayIndex);

      for (const pattern of matchingPatterns) {
        if (generatedCount < targetSize) {
          const dateStr = format(currentDate, "yyyy-MM-dd");
          // check if exists
          const exists = sessions.some(s => s.date === dateStr && s.start_time === pattern.start_time) ||
                         newSessions.some(s => s.date === dateStr && s.start_time === pattern.start_time);
          
          if (!exists) {
            newSessions.push({
              date: dateStr,
              start_time: pattern.start_time,
              end_time: pattern.end_time,
              subject: pattern.subject,
            });
            generatedCount++;
          }
        }
      }
      currentDate = new Date(currentDate.setDate(currentDate.getDate() + 1));
      iterations++;
    }

    if (newSessions.length === 0) {
      toast.info("Không tạo được thêm buổi học nào");
    } else {
      setSessions([...sessions, ...newSessions].sort((a, b) => a.date.localeCompare(b.date)));
      toast.success(`Đã tự động tạo ${newSessions.length} buổi học`);
    }
  };

  const addCustomSession = () => {
    if (!customSession.date) {
      toast.error("Vui lòng chọn ngày cho buổi học thêm");
      return;
    }
    const exists = sessions.some(s => s.date === customSession.date && s.start_time === customSession.start_time);
    if (exists) {
      toast.error("Buổi học này đã tồn tại trong danh sách");
      return;
    }
    
    const newSessionList = [...sessions, { 
      ...customSession, 
      subject: customSession.subject.trim() || undefined 
    }].sort((a, b) => a.date.localeCompare(b.date));
    setSessions(newSessionList);
  };

  const removeSession = (index: number) => {
    setSessions(sessions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      toast.error("Vui lòng nhập họ tên học sinh");
      return;
    }
    if (!form.tuition_amount || parseInt(form.tuition_amount) <= 0) {
      toast.error("Vui lòng nhập học phí");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      // Upload QR image if exists
      let qr_image_url = null;
      if (qrFile) {
        const fileExt = qrFile.name.split(".").pop();
        const fileName = `public_qr/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("qr-images")
          .upload(fileName, qrFile);

        if (uploadError) {
          toast.error("Lỗi upload ảnh QR: " + uploadError.message);
        } else {
          const { data: urlData } = supabase.storage.from("qr-images").getPublicUrl(fileName);
          qr_image_url = urlData.publicUrl;
        }
      }

      // Insert student
      const { data: student, error } = await supabase
        .from("students")
        .insert({
          full_name: form.full_name.trim(),
          class: form.class.trim() || null,
          subject: form.subject.trim() || null,
          parent_phone: form.parent_phone.trim() || null,
          notes: form.notes.trim() || null,
          tuition_type: form.tuition_type,
          tuition_amount: parseInt(form.tuition_amount),
          bank_name: form.bank_name.trim() || null,
          bank_account_holder: form.bank_account_holder.trim() || null,
          bank_account_number: form.bank_account_number.trim() || null,
          start_date: form.start_date || null,
          package_size: parseInt(form.package_size),
          current_cycle: 1,
          qr_image_url,
        })
        .select()
        .single();

      if (error) throw error;

      // Save as default settings if the user doesn't have any yet
      if (student) {
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
      }

      // Insert fixed weekly schedules if present
      if (schedulePatterns.length > 0 && student) {
        const { error: scheduleError } = await supabase.from("schedules").insert(
          schedulePatterns.map((pattern) => ({
            student_id: student.id,
            day_of_week: pattern.day_of_week,
            start_time: pattern.start_time,
            end_time: pattern.end_time || null,
          }))
        );
        if (scheduleError) console.error("Schedule insert error:", scheduleError);
      }

      // Insert specific sessions
      if (sessions.length > 0 && student) {
        const { error: schedError } = await supabase.from("sessions").insert(
          sessions.map((s) => {
            const isPast = s.date < new Date().toISOString().split("T")[0];
            return {
              student_id: student.id,
              session_date: s.date,
              subject: s.subject || null,
              status: isPast ? "completed" : "scheduled",
              notes: `${s.start_time} - ${s.end_time}`,
              cycle_number: 1,
            };
          })
        );
        if (schedError) console.error("Session insert error:", schedError);
      }

      toast.success("Đã thêm học sinh mới!", { description: form.full_name });
      router.refresh();
      router.push("/dashboard/students");
    } catch (err: any) {
      console.error(err);
      toast.error("Có lỗi xảy ra: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
          </svg>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thêm học sinh mới</h1>
          <p className="text-muted-foreground text-sm">Điền thông tin và lên lịch học chi tiết</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Thông tin cơ bản</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="full_name">Họ và tên *</Label>
                <Input id="full_name" placeholder="Nguyễn Văn A" value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class">Lớp</Label>
                <Input id="class" placeholder="Lớp 10A1" value={form.class}
                  onChange={(e) => setForm({ ...form, class: e.target.value })} className="h-11" />
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="parent_phone">SĐT phụ huynh</Label>
                <Input id="parent_phone" placeholder="0912345678" value={form.parent_phone}
                  onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} className="h-11" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Ghi chú</Label>
              <Textarea id="notes" placeholder="Ghi chú thêm..." value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Tuition */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Học phí</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Loại học phí *</Label>
                <Select value={form.tuition_type} onValueChange={(v) => { if (v) setForm({ ...form, tuition_type: v as "per_session" | "monthly" }); }}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="per_session">Theo buổi</SelectItem>
                    <SelectItem value="monthly">Theo tháng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tuition_amount">
                  Mức học phí (VNĐ) *
                </Label>
                <Input id="tuition_amount" type="number" placeholder={form.tuition_type === "per_session" ? "150000" : "1500000"}
                  value={form.tuition_amount}
                  onChange={(e) => setForm({ ...form, tuition_amount: e.target.value })}
                  required className="h-11" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="bg-primary/5 px-6 py-4 border-b">
            <CardTitle className="text-base text-primary">Thời gian học</CardTitle>
            <CardDescription className="text-primary/70">Thiết lập ngày học và gói buổi học</CardDescription>
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
              <Label className="text-sm font-semibold">1. Lịch cố định trong tuần</Label>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Select value={template.day_of_week} onValueChange={(v) => { if (v) setTemplate({ ...template, day_of_week: v }); }}>
                    <SelectTrigger className="w-[130px] h-10">
                      <SelectValue>{DAY_NAMES[parseInt(template.day_of_week)]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DAY_NAMES).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Input type="time" value={template.start_time}
                    onChange={(e) => setTemplate({ ...template, start_time: e.target.value })}
                    className="w-[120px] h-10" />
                </div>
                <span className="flex items-center text-muted-foreground pb-2">→</span>
                <div className="space-y-1.5">
                  <Input type="time" value={template.end_time}
                    onChange={(e) => setTemplate({ ...template, end_time: e.target.value })}
                    className="w-[120px] h-10" />
                </div>
                <div className="space-y-1.5">
                  <Select value={template.subject} onValueChange={(v) => setTemplate({ ...template, subject: v || "" })}>
                    <SelectTrigger className="w-[180px] h-10">
                      <SelectValue placeholder="Chọn môn học" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Toán">Toán</SelectItem>
                      <SelectItem value="Tiếng Anh">Tiếng Anh</SelectItem>
                      <SelectItem value="Vật lý">Vật lý</SelectItem>
                      <SelectItem value="Hóa học">Hóa học</SelectItem>
                      <SelectItem value="Ngữ văn">Ngữ văn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="secondary" onClick={addSchedulePattern} className="h-10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                  Thêm lịch
                </Button>
              </div>
            </div>

            {schedulePatterns.length > 0 && (
              <div className="bg-muted/30 p-4 rounded-xl border mt-6">
                <div className="flex items-center justify-between mb-4">
                  <Label className="font-medium text-primary">Lịch cố định</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setSchedulePatterns([])}>Xóa lịch cố định</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedulePatterns.map((pattern, i) => (
                    <Badge key={i} variant="outline" className="pl-3 pr-1 py-1.5 text-sm gap-2 bg-background hover:bg-muted/50 border-primary/20">
                      {DAY_NAMES[pattern.day_of_week]} • {pattern.start_time}
                      {pattern.end_time && ` - ${pattern.end_time}`}
                      {pattern.subject && <span className="ml-1 text-primary">[{pattern.subject}]</span>}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="button" onClick={generateSessions} className="w-full sm:w-auto shadow-md">
                    2. Tạo tự động {form.package_size} buổi học
                  </Button>
                </div>
              </div>
            )}

            <Separator />
            
            <div className="space-y-4">
              <Label className="text-sm font-semibold">Thêm buổi học lẻ (Học bù, học tăng cường...)</Label>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="space-y-1.5">
                  <Input type="date" value={customSession.date}
                    onChange={(e) => setCustomSession({ ...customSession, date: e.target.value })} className="h-10 w-[140px]" />
                </div>
                <div className="space-y-1.5">
                  <Input type="time" value={customSession.start_time}
                    onChange={(e) => setCustomSession({ ...customSession, start_time: e.target.value })}
                    className="w-[120px] h-10" />
                </div>
                <span className="flex items-center text-muted-foreground pb-2">→</span>
                <div className="space-y-1.5">
                  <Input type="time" value={customSession.end_time}
                    onChange={(e) => setCustomSession({ ...customSession, end_time: e.target.value })}
                    className="w-[120px] h-10" />
                </div>
                <div className="space-y-1.5">
                  <Select value={customSession.subject} onValueChange={(v) => setCustomSession({ ...customSession, subject: v || "" })}>
                    <SelectTrigger className="w-[180px] h-10">
                      <SelectValue placeholder="Chọn môn học" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Toán">Toán</SelectItem>
                      <SelectItem value="Tiếng Anh">Tiếng Anh</SelectItem>
                      <SelectItem value="Vật lý">Vật lý</SelectItem>
                      <SelectItem value="Hóa học">Hóa học</SelectItem>
                      <SelectItem value="Ngữ văn">Ngữ văn</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={addCustomSession} className="h-10">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M5 12h14" /><path d="M12 5v14" />
                  </svg>
                  Thêm buổi lẻ
                </Button>
              </div>
            </div>



            {sessions.length > 0 && (
              <div className="bg-muted/30 p-4 rounded-xl border mt-6">
                <div className="flex items-center justify-between mb-4">
                  <Label className="font-medium text-primary">Danh sách các buổi học ({sessions.length})</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setSessions([])}>Xóa tất cả</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sessions.map((s, i) => (
                    <Badge key={i} variant="outline" className="pl-3 pr-1 py-1.5 text-sm gap-2 bg-background hover:bg-muted/50 border-primary/20">
                      {format(parseISO(s.date), "dd/MM")} • {s.start_time}
                      {s.end_time && ` - ${s.end_time}`}
                      {s.subject && <span className="ml-1 text-primary">[{s.subject}]</span>}
                      <button
                        type="button"
                        onClick={() => removeSession(i)}
                        className="ml-1 p-1 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors focus:outline-none"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bank info */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Thông tin chuyển khoản</CardTitle>
            <CardDescription>Hiển thị trên phiếu báo cáo tháng</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bank_name">Ngân hàng</Label>
                <Input id="bank_name" placeholder="Vietcombank" value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_holder">Chủ tài khoản</Label>
                <Input id="bank_account_holder" placeholder="NGUYEN VAN A" value={form.bank_account_holder}
                  onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })} className="h-11" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="bank_account_number">Số tài khoản</Label>
                <Input id="bank_account_number" placeholder="0123456789" value={form.bank_account_number}
                  onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })} className="h-11" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Ảnh QR thanh toán</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                  {qrPreview ? (
                    <img src={qrPreview} alt="QR" className="w-full h-full object-contain rounded-xl" />
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mb-1">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" />
                      </svg>
                      <span className="text-xs text-muted-foreground">Upload QR</span>
                    </>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={handleQrChange} />
                </label>
                {qrPreview && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setQrFile(null); setQrPreview(""); }}
                    className="text-destructive">
                    Xóa ảnh
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Hủy
          </Button>
          <Button type="submit" disabled={loading} className="min-w-[140px] shadow-md shadow-primary/20">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Đang lưu...
              </span>
            ) : "Thêm học sinh"}
          </Button>
        </div>
      </form>
    </div>
  );
}
