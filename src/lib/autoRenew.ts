import { addDays, subDays, format, getDay, parseISO } from "date-fns";
import type { Student, StudentGroup } from "./types";

// ===== Helper: Determine cycle status based on real-time =====

export interface CycleStatus {
  currentCycle: number;
  isCurrentCycleExpired: boolean;  // All session dates in current cycle are in the past
  lastSessionDate: string | null;
  totalSessions: number;
  pastSessions: number;            // Sessions with date < today
}

/**
 * Determine the status of a student's current cycle based on real-time dates.
 * This is the single source of truth for "is this cycle old or new?"
 */
export async function determineCycleStatus(
  supabase: any,
  studentId: string,
  cycleNumber: number
): Promise<CycleStatus> {
  const today = new Date().toISOString().split("T")[0];

  const { data: cycleSessions } = await supabase
    .from("sessions")
    .select("session_date, status")
    .eq("student_id", studentId)
    .eq("cycle_number", cycleNumber)
    .order("session_date", { ascending: false });

  if (!cycleSessions || cycleSessions.length === 0) {
    return {
      currentCycle: cycleNumber,
      isCurrentCycleExpired: false,
      lastSessionDate: null,
      totalSessions: 0,
      pastSessions: 0,
    };
  }

  const lastSessionDate = cycleSessions[0].session_date;
  const pastSessions = cycleSessions.filter(
    (s: any) => s.session_date < today
  ).length;

  return {
    currentCycle: cycleNumber,
    isCurrentCycleExpired: pastSessions === cycleSessions.length, // ALL dates are in the past
    lastSessionDate,
    totalSessions: cycleSessions.length,
    pastSessions,
  };
}

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

// ===== Auto-renew check =====

export async function checkAndAutoRenewCycles(supabase: any) {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Fetch all active students with their schedules
    const { data: students } = await supabase
      .from("students")
      .select("*, group_id, schedules(*)")
      .eq("is_active", true);

    if (!students) return;

    for (const student of students) {
      const currentCycle = student.current_cycle || 1;

      // Get status of the current cycle
      const status = await determineCycleStatus(
        supabase,
        student.id,
        currentCycle
      );

      // Only renew if:
      // 1. There are sessions in the current cycle
      // 2. ALL session dates are in the past (cycle is fully expired)
      if (status.totalSessions > 0 && status.isCurrentCycleExpired) {
        await renewStudentCycle(supabase, student);
      }
    }
  } catch (error) {
    console.error("Error in checkAndAutoRenewCycles:", error);
  }
}

// ===== Renew student cycle =====

export async function renewStudentCycle(supabase: any, student: any) {
  const currentCycle = student.current_cycle || 1;
  const packageSize = student.package_size || 12;

  // VALIDATION: Don't renew if current cycle still has future sessions
  const today = new Date().toISOString().split("T")[0];
  const { data: futureSessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("student_id", student.id)
    .eq("cycle_number", currentCycle)
    .gte("session_date", today);

  if (futureSessions && futureSessions.length > 0) {
    return {
      error:
        "Kỳ hiện tại vẫn còn buổi học trong tương lai. Không thể tạo kỳ mới.",
    };
  }

  // Determine sliding window behavior
  // If currentCycle >= 2, we need to slide: delete cycle 1, move cycle 2 → 1, insert new as cycle 2
  const isSlidingWindow = currentCycle >= 2;
  const nextCycle = isSlidingWindow ? 2 : currentCycle + 1;

  // Combine fixed schedules and deduced patterns
  let schedulePatterns = student.schedules || [];

  if (student.group_id) {
    const { data: groupScheds } = await supabase
      .from("group_schedules")
      .select("*")
      .eq("group_id", student.group_id);
    if (groupScheds && groupScheds.length > 0) {
      schedulePatterns = groupScheds;
    }
  }

  // If no explicit schedules, deduce from past sessions
  if (schedulePatterns.length === 0) {
    schedulePatterns = await deduceSchedulePatterns(supabase, student.id);
  }

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

    currentDate = groupLastDate
      ? addDays(parseISO(groupLastDate), 1)
      : new Date();
  } else {
    currentDate = new Date();
  }

  const newSessions = [];
  let generatedCount = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 365;

  while (generatedCount < packageSize && iterations < MAX_ITERATIONS) {
    const currentDayIndex = getDay(currentDate);
    const matchingPatterns = schedulePatterns.filter(
      (p: any) => p.day_of_week === currentDayIndex
    );

    for (const pattern of matchingPatterns) {
      if (generatedCount < packageSize) {
        const sessionDate = format(currentDate, "yyyy-MM-dd");

        // CONFLICT CHECK: Make sure no session exists on this date for this student
        const { data: existingSession } = await supabase
          .from("sessions")
          .select("id")
          .eq("student_id", student.id)
          .eq("session_date", sessionDate)
          .limit(1);

        if (!existingSession || existingSession.length === 0) {
          newSessions.push({
            student_id: student.id,
            session_date: sessionDate,
            subject: student.subject || null,
            status:
              sessionDate < new Date().toISOString().split("T")[0]
                ? "completed"
                : "scheduled",
            notes: `${pattern.start_time} - ${pattern.end_time || ""}`,
            cycle_number: nextCycle,
          });
          generatedCount++;
        }
      }
    }
    currentDate = addDays(currentDate, 1);
    iterations++;
  }

  if (newSessions.length > 0) {
    if (isSlidingWindow) {
      // Sliding window: delete cycle 1, shift cycle 2 → 1, new sessions are cycle 2

      // 1. Delete cycle 1 data
      await supabase
        .from("sessions")
        .delete()
        .eq("student_id", student.id)
        .eq("cycle_number", 1);
      await supabase
        .from("payments")
        .delete()
        .eq("student_id", student.id)
        .eq("cycle_number", 1);
      await supabase
        .from("monthly_comments")
        .delete()
        .eq("student_id", student.id)
        .eq("cycle_number", 1);

      // 2. Shift cycle 2 to cycle 1
      await supabase
        .from("sessions")
        .update({ cycle_number: 1 })
        .eq("student_id", student.id)
        .eq("cycle_number", 2);
      await supabase
        .from("payments")
        .update({ cycle_number: 1 })
        .eq("student_id", student.id)
        .eq("cycle_number", 2);
      await supabase
        .from("monthly_comments")
        .update({ cycle_number: 1 })
        .eq("student_id", student.id)
        .eq("cycle_number", 2);
    }

    // Insert new sessions
    const { error: insertError } = await supabase
      .from("sessions")
      .insert(newSessions);
    if (insertError) {
      console.error("Failed to insert renewed sessions:", insertError);
      return {
        error: "Lỗi lưu dữ liệu buổi học mới: " + insertError.message,
      };
    }

    // Update student current_cycle
    await supabase
      .from("students")
      .update({ current_cycle: nextCycle })
      .eq("id", student.id);

    // Update group current_cycle if applicable
    if (student.group_id) {
      await supabase
        .from("student_groups")
        .update({ current_cycle: nextCycle })
        .eq("id", student.group_id);
    }

    return { success: true };
  }

  return {
    error: "Không thể tạo buổi học mới (kiểm tra lại Lịch học cố định)",
  };
}

// ===== Restore past cycle =====

/**
 * Restore/create a past cycle for a student.
 * 
 * NEW LOGIC:
 * - If student only has cycle 1 data → shift cycle 1 → 2, create past sessions as cycle 1
 * - If student already has cycle 1 AND cycle 2 → overwrite cycle 1 if allowed
 * - Does NOT blindly shift all data anymore
 */
export async function restorePastCycle(
  supabase: any,
  student: any,
  endDateStr: string,
  overwrite: boolean = false
) {
  const packageSize = student.package_size || 12;
  const currentCycle = student.current_cycle || 1;

  let schedulePatterns = student.schedules || [];

  if (student.group_id) {
    const { data: groupScheds } = await supabase
      .from("group_schedules")
      .select("*")
      .eq("group_id", student.group_id);
    if (groupScheds && groupScheds.length > 0) {
      schedulePatterns = groupScheds;
    }
  }

  // If no explicit schedules, deduce from past sessions
  if (schedulePatterns.length === 0) {
    schedulePatterns = await deduceSchedulePatterns(supabase, student.id);
  }

  if (schedulePatterns.length === 0) {
    return { error: "Không tìm thấy dữ liệu buổi học cũ để khôi phục lịch. Vui lòng tự thêm ít nhất 1 buổi học thủ công trước." };
  }

  // Check if cycle 1 already has data
  const { data: cycle1Sessions } = await supabase
    .from("sessions")
    .select("id")
    .eq("student_id", student.id)
    .eq("cycle_number", 1)
    .limit(1);

  const cycle1HasData = cycle1Sessions && cycle1Sessions.length > 0;

  // CASE 1: Student only has cycle 1 (hasn't renewed yet)
  // → Shift cycle 1 → 2, create past as cycle 1
  if (currentCycle === 1 && cycle1HasData) {
    // Shift current cycle 1 → cycle 2
    await supabase
      .from("sessions")
      .update({ cycle_number: 2 })
      .eq("student_id", student.id)
      .eq("cycle_number", 1);
    await supabase
      .from("payments")
      .update({ cycle_number: 2 })
      .eq("student_id", student.id)
      .eq("cycle_number", 1);
    await supabase
      .from("monthly_comments")
      .update({ cycle_number: 2 })
      .eq("student_id", student.id)
      .eq("cycle_number", 1);

    // Update student to cycle 2
    await supabase
      .from("students")
      .update({ current_cycle: 2 })
      .eq("id", student.id);
    if (student.group_id) {
      await supabase
        .from("student_groups")
        .update({ current_cycle: 2 })
        .eq("id", student.group_id);
    }
  }
  // CASE 2: Student already has cycle 2, and cycle 1 has data
  // → Need to overwrite cycle 1
  else if (currentCycle >= 2 && cycle1HasData) {
    if (!overwrite) {
      return {
        error: "CYCLE_1_EXISTS",
        message:
          "Kỳ cũ (Chu kỳ 1) đã có dữ liệu. Bạn có muốn ghi đè không?",
      };
    }
    // Delete existing cycle 1 data
    await supabase
      .from("sessions")
      .delete()
      .eq("student_id", student.id)
      .eq("cycle_number", 1);
    await supabase
      .from("payments")
      .delete()
      .eq("student_id", student.id)
      .eq("cycle_number", 1);
    await supabase
      .from("monthly_comments")
      .delete()
      .eq("student_id", student.id)
      .eq("cycle_number", 1);
  }
  // CASE 3: Student has cycle 2 but cycle 1 is empty → just create cycle 1

  // Generate past sessions going backwards from endDate
  let currentDate = parseISO(endDateStr);

  const newSessions = [];
  let generatedCount = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 365;

  while (generatedCount < packageSize && iterations < MAX_ITERATIONS) {
    const currentDayIndex = getDay(currentDate);
    const matchingPatterns = schedulePatterns.filter(
      (p: any) => p.day_of_week === currentDayIndex
    );

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
    const { error: insertError } = await supabase
      .from("sessions")
      .insert(newSessions);
    if (insertError) {
      console.error("Failed to insert past sessions:", insertError);
      return {
        error: "Lỗi lưu dữ liệu buổi học quá khứ: " + insertError.message,
      };
    }

    return { success: true };
  }

  return {
    error: "Không thể tạo buổi học (kiểm tra lại Lịch học cố định)",
  };
}
