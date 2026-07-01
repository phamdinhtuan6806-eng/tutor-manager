"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAndAutoRenewCycles, renewStudentCycle, restorePastCycle } from "@/lib/autoRenew";

export async function triggerAutoRenew() {
  const supabase = await createClient();
  await checkAndAutoRenewCycles(supabase);
  return { success: true };
}

export async function forceRenewStudentCycle(studentId: string) {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();
  if (!student) return { success: false, error: "Không tìm thấy học sinh" };
  
  // Explicitly fetch schedules
  const { data: schedules } = await supabase.from("schedules").select("*").eq("student_id", studentId);
  student.schedules = schedules || [];
  
  const res = await renewStudentCycle(supabase, student);
  if (res?.error) {
    return { success: false, error: res.error };
  }
  return { success: true, warning: res.warning };
}
export async function forceRestorePastCycle(studentId: string, endDateStr: string) {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*").eq("id", studentId).single();
  if (!student) return { success: false, error: "Không tìm thấy học sinh" };
  
  // Explicitly fetch schedules
  const { data: schedules } = await supabase.from("schedules").select("*").eq("student_id", studentId);
  student.schedules = schedules || [];
  
  const res = await restorePastCycle(supabase, student, endDateStr);
  if (res?.error) {
    return { success: false, error: res.error };
  }
  return { success: true };
}
