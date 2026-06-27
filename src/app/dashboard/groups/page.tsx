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
import type { StudentGroup, Student, GroupSchedule } from "@/lib/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type GroupWithRelations = StudentGroup & { students: Student[]; group_schedules: GroupSchedule[] };

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadGroups();
  }, []);

  const loadGroups = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("student_groups")
      .select("*, students(*), group_schedules(*)")
      .eq("is_active", true)
      .order("group_name");
    setGroups((data || []) as GroupWithRelations[]);
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const supabase = createClient();
    // Soft delete the group
    await supabase.from("student_groups").update({ is_active: false }).eq("id", deleteId);
    // Soft delete all students in this group
    await supabase.from("students").update({ is_active: false }).eq("group_id", deleteId);
    setGroups((prev) => prev.filter((g) => g.id !== deleteId));
    setDeleteId(null);
    toast.success("Đã xóa nhóm");
  };

  const filtered = groups.filter((g) => {
    const q = search.toLowerCase();
    return (
      g.group_name.toLowerCase().includes(q) ||
      g.subject?.toLowerCase().includes(q) ||
      g.class?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nhóm học sinh</h1>
          <p className="text-muted-foreground text-sm">
            {groups.length} nhóm đang hoạt động
          </p>
        </div>
        <Link href="/dashboard/groups/new">
          <Button className="shadow-md shadow-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path d="M12 8v8" />
            </svg>
            Tạo nhóm mới
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          placeholder="Tìm theo tên nhóm, môn, lớp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Group list */}
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
                <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
              </svg>
            </div>
            <p className="text-muted-foreground mb-4">
              {search ? "Không tìm thấy nhóm phù hợp" : "Chưa có nhóm nào"}
            </p>
            {!search && (
              <Link href="/dashboard/groups/new">
                <Button>Tạo nhóm đầu tiên</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((group) => (
            <Card key={group.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-300 group/card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <Link href={`/dashboard/groups/${group.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 group-hover/card:scale-110 transition-transform">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate group-hover/card:text-primary transition-colors">
                        {group.group_name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {[group.subject, group.class].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => setDeleteId(group.id)}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </Button>
                </div>

                <div className="space-y-2 text-xs">
                  {/* Member count */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                    </svg>
                    {group.students?.filter(s => s.is_active).length || 0} học sinh
                  </div>
                  {/* Tuition */}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    {group.tuition_amount > 0 ? (
                      <>
                        {formatCurrency(group.tuition_amount)}/{TUITION_TYPES.find(t => t.value === group.tuition_type)?.label}
                        <span className="text-primary/70 ml-1">(cả nhóm)</span>
                      </>
                    ) : (
                      "Theo học phí cá nhân"
                    )}
                  </div>
                  {/* Schedules */}
                  {group.group_schedules?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {group.group_schedules
                        .sort((a, b) => a.day_of_week - b.day_of_week)
                        .map((s) => (
                          <Badge key={s.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {getDayOfWeekVN(s.day_of_week)} {formatTime(s.start_time)}
                          </Badge>
                        ))}
                    </div>
                  )}
                  {/* Member avatars */}
                  {group.students?.filter(s => s.is_active).length > 0 && (
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t">
                      <div className="flex -space-x-2">
                        {group.students.filter(s => s.is_active).slice(0, 5).map((student) => (
                          <div
                            key={student.id}
                            className="w-6 h-6 rounded-full bg-gradient-to-br from-primary/70 to-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold border-2 border-background"
                            title={student.full_name}
                          >
                            {student.full_name.charAt(0).toUpperCase()}
                          </div>
                        ))}
                        {group.students.filter(s => s.is_active).length > 5 && (
                          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-medium border-2 border-background">
                            +{group.students.filter(s => s.is_active).length - 5}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground ml-1">
                        {group.students.filter(s => s.is_active).map(s => s.full_name).join(", ")}
                      </span>
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
            <AlertDialogTitle>Xóa nhóm?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa nhóm và XÓA LUÔN toàn bộ học sinh trong nhóm. Bạn có chắc chắn không?
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
