"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, getDayOfWeekVN, formatTime } from "@/lib/utils";
import { TUITION_TYPES } from "@/lib/constants";
import type { Student, Schedule } from "@/lib/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function StudentsPage() {
  const [students, setStudents] = useState<(Student & { schedules: Schedule[] })[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    loadStudents();
    
    setCurrentTime(new Date());
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadStudents = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("students")
      .select("*, schedules(*)")
      .eq("is_active", true)
      .order("full_name");
    setStudents((data || []) as (Student & { schedules: Schedule[] })[]);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const supabase = createClient();
    await supabase.from("students").update({ is_active: false }).eq("id", deleteId);
    setStudents((prev) => prev.filter((s) => s.id !== deleteId));
    setDeleteId(null);
    toast.success("Đã xóa học sinh");
  };

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q) ||
      s.class?.toLowerCase().includes(q)
    );
  });

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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Học sinh</h1>
          <p className="text-muted-foreground text-sm">
            {students.length} học sinh đang dạy
          </p>
        </div>
        <Link href="/dashboard/students/new">
          <Button className="shadow-md shadow-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" />
            </svg>
            Thêm học sinh
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          placeholder="Tìm theo tên, môn, lớp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Student list */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse-soft border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="h-4 bg-muted rounded w-32 mb-2" />
                <div className="h-3 bg-muted rounded w-24 mb-4" />
                <div className="h-3 bg-muted rounded w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-muted-foreground mb-4">
              {search ? "Không tìm thấy học sinh phù hợp" : "Chưa có học sinh nào"}
            </p>
            {!search && (
              <Link href="/dashboard/students/new">
                <Button>Thêm học sinh đầu tiên</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((student) => (
            <Card key={student.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <Link href={`/dashboard/students/${student.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0 group-hover:scale-110 transition-transform">
                      {student.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                        {student.full_name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {[student.subject, student.class].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setDeleteId(student.id)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </Button>
                </div>

                <div className="space-y-2 text-xs">
                  {student.parent_phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      {student.parent_phone}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    {formatCurrency(student.tuition_amount)}/{TUITION_TYPES.find(t => t.value === student.tuition_type)?.label}
                  </div>
                  {student.schedules?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {student.schedules
                        .sort((a, b) => a.day_of_week - b.day_of_week)
                        .map((s) => (
                          <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {getDayOfWeekVN(s.day_of_week)} {formatTime(s.start_time)}
                          </Badge>
                        ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa học sinh?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ ẩn học sinh khỏi danh sách. Dữ liệu vẫn được lưu trữ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
