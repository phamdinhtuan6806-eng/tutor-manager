"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, getDayOfWeekVN, formatTime } from "@/lib/utils";
import type { Student, Schedule, Session, Payment, StudentGroup, GroupSchedule } from "@/lib/types";
import { useLanguage } from "@/components/providers/LanguageProvider";

interface Stats {
  totalStudents: number;
  totalGroups: number;
  sessionsThisMonth: number;
  revenueThisMonth: number;
  totalDebt: number;
}

type GroupWithRelations = StudentGroup & { students: Student[]; group_schedules: GroupSchedule[] };

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ totalStudents: 0, totalGroups: 0, sessionsThisMonth: 0, revenueThisMonth: 0, totalDebt: 0 });
  const [students, setStudents] = useState<(Student & { schedules: Schedule[] })[]>([]);
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    const supabase = createClient();
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const firstDay = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(currentYear, currentMonth, 0).toISOString().split("T")[0];

    const [studentsData, sessionsData, paymentsData, groupsData] = await Promise.all([
      supabase.from("students").select("*, schedules(*)").eq("is_active", true).order("full_name"),
      supabase.from("sessions").select("*").gte("session_date", firstDay).lte("session_date", lastDay).eq("status", "completed"),
      supabase.from("payments").select("*").eq("month", currentMonth).eq("year", currentYear),
      supabase.from("student_groups").select("*, students(*), group_schedules(*)").eq("is_active", true).order("group_name"),
    ]);

    const studentsList = (studentsData.data || []) as (Student & { schedules: Schedule[] })[];
    const sessionsList = (sessionsData.data || []) as Session[];
    const paymentsList = (paymentsData.data || []) as Payment[];
    const groupsList = (groupsData.data || []) as GroupWithRelations[];

    let totalExpected = 0;
    let totalPaid = paymentsList.reduce((sum, p) => sum + p.amount, 0);

    studentsList.forEach((s) => {
      if (s.tuition_type === "monthly") {
        totalExpected += s.tuition_amount;
      } else {
        const completedSessions = sessionsList.filter((ss) => ss.student_id === s.id);
        const count = completedSessions.reduce((sum, ss) => sum + ((ss as any).session_count || 1), 0);
        totalExpected += count * s.tuition_amount;
      }
    });

    setStats({
      totalStudents: studentsList.length,
      totalGroups: groupsList.length,
      sessionsThisMonth: sessionsList.length,
      revenueThisMonth: totalPaid,
      totalDebt: Math.max(0, totalExpected - totalPaid),
    });

    setStudents(studentsList);
    setGroups(groupsList);
    setLoading(false);
  };

  // Get upcoming sessions (next 7 days) - individual students
  const getUpcomingSessions = () => {
    const upcoming: { student: Student; schedule: Schedule; date: Date; isGroup?: boolean; groupName?: string }[] = [];
    const today = new Date();
    const individualStudents = students.filter(s => !s.group_id);

    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayOfWeek = date.getDay();

      // Individual students
      individualStudents.forEach((student) => {
        student.schedules?.forEach((schedule) => {
          if (schedule.day_of_week === dayOfWeek) {
            upcoming.push({ student, schedule, date: new Date(date) });
          }
        });
      });

      // Group schedules
      groups.forEach((group) => {
        group.group_schedules?.forEach((schedule) => {
          if (schedule.day_of_week === dayOfWeek) {
            // Create a fake student/schedule entry for the group
            upcoming.push({
              student: { full_name: group.group_name, subject: group.subject, id: group.id } as Student,
              schedule: { ...schedule, student_id: group.id } as Schedule,
              date: new Date(date),
              isGroup: true,
              groupName: group.group_name,
            });
          }
        });
      });
    }

    return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 8);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse-soft">
              <CardContent className="p-5">
                <div className="h-4 bg-muted rounded w-20 mb-3" />
                <div className="h-8 bg-muted rounded w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const upcomingSessions = getUpcomingSessions();

  const statsCards = [
    {
      title: t("dashboard", "totalStudents"),
      value: stats.totalStudents,
      subtitle: stats.totalGroups > 0 ? `${stats.totalGroups} ${t("sidebar", "groups").toLowerCase()}` : undefined,
      format: "number",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      color: "from-blue-500 to-blue-600",
      bg: "bg-blue-50 dark:bg-blue-950/30",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    {
      title: t("dashboard", "sessionsThisMonth"),
      value: stats.sessionsThisMonth,
      format: "number",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" />
        </svg>
      ),
      color: "from-emerald-500 to-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      textColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      title: t("dashboard", "revenueThisMonth"),
      value: stats.revenueThisMonth,
      format: "currency",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" x2="12" y1="2" y2="22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      color: "from-violet-500 to-violet-600",
      bg: "bg-violet-50 dark:bg-violet-950/30",
      textColor: "text-violet-600 dark:text-violet-400",
    },
    {
      title: t("dashboard", "totalDebt"),
      value: stats.totalDebt,
      format: "currency",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
      ),
      color: "from-amber-500 to-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      textColor: "text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {statsCards.map((card) => (
          <Card key={card.title} className="border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">{card.title}</span>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <span className={card.textColor}>{card.icon}</span>
                </div>
              </div>
              <div className={`text-2xl lg:text-3xl font-bold ${card.textColor} animate-count-up`}>
                {card.format === "currency" ? formatCurrency(card.value) : card.value}
              </div>
              {card.subtitle && (
                <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Upcoming sessions */}
        <Card className="lg:col-span-3 border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">{t("dashboard", "upcomingSessions")}</CardTitle>
            <Link href="/dashboard/attendance">
              <Button variant="ghost" size="sm" className="text-primary">
                {t("dashboard", "viewAll")}
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {upcomingSessions.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                {t("dashboard", "noUpcomingSessions")}
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingSessions.map((item, idx) => {
                  const isToday = item.date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        isToday ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : item.isGroup
                            ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {item.date.getDate()}/{item.date.getMonth() + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {item.student.full_name}
                          {item.isGroup && (
                            <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                              {t("sidebar", "groups")}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getDayOfWeekVN(item.schedule.day_of_week)} • {formatTime(item.schedule.start_time)}
                          {item.student.subject && ` • ${item.student.subject}`}
                        </p>
                      </div>
                      {isToday && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-xs shrink-0">
                          {t("dashboard", "today")}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Student list + Groups */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">{t("dashboard", "studentsAndGroups")}</CardTitle>
            <div className="flex gap-1">
              <Link href="/dashboard/students/new">
                <Button size="sm" variant="ghost" className="text-primary text-xs">{t("dashboard", "addStudent")}</Button>
              </Link>
              <Link href="/dashboard/groups/new">
                <Button size="sm" variant="ghost" className="text-violet-600 dark:text-violet-400 text-xs">{t("dashboard", "addGroup")}</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {/* Groups */}
            {groups.length > 0 && (
              <div className="space-y-2 mb-4">
                {groups.slice(0, 3).map((group) => (
                  <Link
                    key={group.id}
                    href={`/dashboard/groups/${group.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group/item"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover/item:text-primary transition-colors">
                        {group.group_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {group.students.filter(s => s.is_active).length} HS • {group.subject || ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(group.tuition_amount)}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {groups.length > 0 && students.filter(s => !s.group_id).length > 0 && (
              <Separator className="my-2" />
            )}

            {/* Individual students */}
            {students.filter(s => !s.group_id).length === 0 && groups.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm mb-4">{t("dashboard", "noStudents")}</p>
                <Link href="/dashboard/students/new">
                  <Button variant="outline" size="sm">{t("dashboard", "addFirstStudent")}</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {students.filter(s => !s.group_id).slice(0, 6).map((student) => (
                  <Link
                    key={student.id}
                    href={`/dashboard/students/${student.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group/item"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                      {student.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate group-hover/item:text-primary transition-colors">
                        {student.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[student.subject, student.class].filter(Boolean).join(" • ") || t("dashboard", "noInfo")}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatCurrency(student.tuition_amount)}
                      {student.tuition_type === "per_session" ? t("dashboard", "perSession") : t("dashboard", "perMonth")}
                    </span>
                  </Link>
                ))}
                {students.filter(s => !s.group_id).length > 6 && (
                  <Link href="/dashboard/students">
                    <Button variant="ghost" size="sm" className="w-full text-muted-foreground">
                      {t("dashboard", "viewMoreStudents").replace("{count}", String(students.filter(s => !s.group_id).length - 6))}
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
