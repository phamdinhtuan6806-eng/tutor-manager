import { createClient } from "@supabase/supabase-js";
import { addDays, subDays, format, getDay, parseISO } from "date-fns";
import type { Student, StudentGroup } from "./types";

async function deduceSchedulePatterns(supabase: any, studentId: string) {
  const { data: latestSession } = await supabase
    .from("sessions")
    .select("cycle_number")
    .eq("student_id", studentId)
    .order("session_date", { ascending: false })
    .limit(1)
    .single();

  if (!latestSession) return [];

  const targetCycle = latestSession.cycle_number;

  const { data: pastSessions } = await supabase
    .from("sessions")
    .select("session_date, notes")
    .eq("student_id", studentId)
    .eq("cycle_number", targetCycle)
    .order("session_date", { ascending: false });

  if (!pastSessions || pastSessions.length === 0) return [];

  const deducedPatterns: any[] = [];
  const seenDays = new Set();
  
  for (const s of pastSessions) {
    const d = parseISO(s.session_date);
    const dayIndex = getDay(d);
    
    if (!seenDays.has(dayIndex)) {
      seenDays.add(dayIndex);
      
      let start_time = "19:00";
      let end_time = "21:00";
      
      if (s.notes) {
        const timeMatch = s.notes.match(/^(\d{2}:\d{2}(?::\d{2})?)\s*-\s*(\d{2}:\d{2}(?::\d{2})?)/);
        if (timeMatch) {
          start_time = timeMatch[1].substring(0, 5);
          end_time = timeMatch[2].substring(0, 5);
        }
      }
      
      deducedPatterns.push({
        day_of_week: dayIndex,
        start_time,
        end_time
      });
    }
  }
  return deducedPatterns;
}

// This file needs a service role key to bypass RLS if running via cron, 
// but since we are running on user request, we can use the regular client.
// However, server actions usually use createServerClient.
// We'll pass the supabase client to the function.

export async function checkAndAutoRenewCycles(supabase: any) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // 1. Get all students that have package_size > 0 and are active.
    // We only renew if ALL of their sessions for the CURRENT cycle are in the past or completed.
    // Wait, the easier way is to check the MAXIMUM session_date for each student's current cycle.
    
    // Fetch all active students and groups
    const { data: students } = await supabase
      .from("students")
      .select("*, group_id, schedules(*)")
      .eq("is_active", true);

    if (!students) return;

    for (const student of students) {
      // Find the latest session for this student in their current cycle
      const { data: latestSessions } = await supabase
        .from("sessions")
        .select("session_date, status")
        .eq("student_id", student.id)
        .eq("cycle_number", student.current_cycle)
        .order("session_date", { ascending: false })
        .limit(1);

      if (latestSessions && latestSessions.length > 0) {
        const lastSessionDate = latestSessions[0].session_date;
        
        // If the last session's date is strictly in the past, or if it's today and marked completed
        // For simplicity, let's say if `lastSessionDate < today`
        if (lastSessionDate < today) {
          // Time to renew!
          await renewStudentCycle(supabase, student);
        }
      }
    }
  } catch (error) {
    console.error("Error in checkAndAutoRenewCycles:", error);
  }
}

export async function renewStudentCycle(supabase: any, student: any) {
  const currentCycle = student.current_cycle || 1;
  const isSlidingWindow = currentCycle >= 2;
  const nextCycle = isSlidingWindow ? 2 : currentCycle + 1;
  const packageSize = student.package_size || 12;

  // Remove Fixed Schedule logic. Always deduce from past sessions.
  let schedulePatterns = await deduceSchedulePatterns(supabase, student.id);

  if (schedulePatterns.length === 0) {
    return { error: "Không tìm thấy dữ liệu buổi học cũ để tự động tạo lịch. Vui lòng tự thêm ít nhất 1 buổi học thủ công trước khi tự động qua chu kỳ mới." };
  }

  // Find the exact date of the last session to know where to start generating
  const { data: lastSession } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("student_id", student.id)
    .order("session_date", { ascending: false })
    .limit(1)
    .single();

  let currentDate: Date;
  
  if (lastSession) {
    currentDate = addDays(parseISO(lastSession.session_date), 1);
  } else if (student.group_id) {
    // New student in group — find the last session from any group member
    const { data: groupMembers } = await supabase
      .from("students")
      .select("id")
      .eq("group_id", student.group_id)
      .eq("is_active", true)
      .neq("id", student.id);
    
    let groupLastDate: string | null = null;
    if (groupMembers && groupMembers.length > 0) {
      const memberIds = groupMembers.map((m: any) => m.id);
      const { data: groupLastSession } = await supabase
        .from("sessions")
        .select("session_date")
        .in("student_id", memberIds)
        .order("session_date", { ascending: false })
        .limit(1)
        .single();
      if (groupLastSession) {
        groupLastDate = groupLastSession.session_date;
      }
    }
    
    currentDate = groupLastDate ? addDays(parseISO(groupLastDate), 1) : new Date();
  } else {
    currentDate = new Date();
  }

  const newSessions = [];
  let generatedCount = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 365;

  while (generatedCount < packageSize && iterations < MAX_ITERATIONS) {
    const currentDayIndex = getDay(currentDate);
    const matchingPatterns = schedulePatterns.filter((p: any) => p.day_of_week === currentDayIndex);

    for (const pattern of matchingPatterns) {
      if (generatedCount < packageSize) {
        newSessions.push({
          student_id: student.id,
          session_date: format(currentDate, "yyyy-MM-dd"),
          subject: student.subject || null, // Assuming group subject if group
          status: format(currentDate, "yyyy-MM-dd") < new Date().toISOString().split("T")[0] ? "completed" : "scheduled",
          notes: `${pattern.start_time} - ${pattern.end_time || ""}`,
          cycle_number: nextCycle,
        });
        generatedCount++;
      }
    }
    currentDate = addDays(currentDate, 1);
    iterations++;
  }

  if (newSessions.length > 0) {
    if (isSlidingWindow) {
      // 1. Delete cycle 1 data
      await supabase.from("sessions").delete().eq("student_id", student.id).eq("cycle_number", 1);
      await supabase.from("payments").delete().eq("student_id", student.id).eq("cycle_number", 1);
      await supabase.from("monthly_comments").delete().eq("student_id", student.id).eq("cycle_number", 1);
      
      // 2. Shift cycle 2 to cycle 1
      await supabase.from("sessions").update({ cycle_number: 1 }).eq("student_id", student.id).eq("cycle_number", 2);
      await supabase.from("payments").update({ cycle_number: 1 }).eq("student_id", student.id).eq("cycle_number", 2);
      await supabase.from("monthly_comments").update({ cycle_number: 1 }).eq("student_id", student.id).eq("cycle_number", 2);
    }

    // Insert new sessions
    const { error: insertError } = await supabase.from("sessions").insert(newSessions);
    if (insertError) {
      console.error("Failed to insert renewed sessions:", insertError);
      return { error: "Lỗi lưu dữ liệu buổi học mới: " + insertError.message };
    }

    // Update student current_cycle
    await supabase.from("students").update({ current_cycle: nextCycle }).eq("id", student.id);
    
    // Update group current_cycle if applicable (prevent duplicate updates if multiple students in group)
    if (student.group_id) {
      await supabase.from("student_groups").update({ current_cycle: nextCycle }).eq("id", student.group_id);
    }
    
    return { success: true };
  }
  
  return { error: "Không thể tạo buổi học mới (kiểm tra lại Lịch học cố định)" };
}

export async function restorePastCycle(supabase: any, student: any, endDateStr: string) {
  const packageSize = student.package_size || 12;

  // Always deduce from past sessions
  let schedulePatterns = await deduceSchedulePatterns(supabase, student.id);

  if (schedulePatterns.length === 0) {
    return { error: "Không tìm thấy dữ liệu buổi học cũ để khôi phục lịch. Vui lòng tự thêm ít nhất 1 buổi học thủ công trước." };
  }

  let currentDate = parseISO(endDateStr);

  const newSessions = [];
  let generatedCount = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 365;

  while (generatedCount < packageSize && iterations < MAX_ITERATIONS) {
    const currentDayIndex = getDay(currentDate);
    const matchingPatterns = schedulePatterns.filter((p: any) => p.day_of_week === currentDayIndex);

    for (const pattern of matchingPatterns) {
      if (generatedCount < packageSize) {
        newSessions.push({
          student_id: student.id,
          session_date: format(currentDate, "yyyy-MM-dd"),
          subject: student.subject || null, 
          status: "completed", 
          notes: `${pattern.start_time} - ${pattern.end_time || ""} (Khôi phục)`,
          cycle_number: 1, 
        });
        generatedCount++;
      }
    }
    currentDate = subDays(currentDate, 1);
    iterations++;
  }

  if (newSessions.length > 0) {
    await supabase.from("sessions").delete().eq("student_id", student.id).eq("cycle_number", 2);
    await supabase.from("payments").delete().eq("student_id", student.id).eq("cycle_number", 2);
    await supabase.from("monthly_comments").delete().eq("student_id", student.id).eq("cycle_number", 2);
    
    await supabase.from("sessions").update({ cycle_number: 2 }).eq("student_id", student.id).eq("cycle_number", 1);
    await supabase.from("payments").update({ cycle_number: 2 }).eq("student_id", student.id).eq("cycle_number", 1);
    await supabase.from("monthly_comments").update({ cycle_number: 2 }).eq("student_id", student.id).eq("cycle_number", 1);

    const { error: insertError } = await supabase.from("sessions").insert(newSessions);
    if (insertError) {
      console.error("Failed to insert past sessions:", insertError);
      return { error: "Lỗi lưu dữ liệu buổi học quá khứ: " + insertError.message };
    }

    await supabase.from("students").update({ current_cycle: 2 }).eq("id", student.id);
    
    if (student.group_id) {
      await supabase.from("student_groups").update({ current_cycle: 2 }).eq("id", student.group_id);
    }
    
    return { success: true };
  }
  
  return { error: "Không thể tạo buổi học (kiểm tra lại Lịch học cố định)" };
}
