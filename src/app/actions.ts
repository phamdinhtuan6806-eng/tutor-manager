"use server";

import { createClient } from "@/lib/supabase/server";
import { checkAndAutoRenewCycles, renewStudentCycle, restorePastCycle, determineCycleStatus } from "@/lib/autoRenew";

export async function triggerAutoRenew() {
  const supabase = await createClient();
  await checkAndAutoRenewCycles(supabase);
  return { success: true };
}

export async function forceRenewStudentCycle(studentId: string) {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*, schedules(*)").eq("id", studentId).single();
  if (!student) return { success: false, error: "Không tìm thấy học sinh" };
  const res = await renewStudentCycle(supabase, student);
  if (res?.error) {
    return { success: false, error: res.error };
  }
  return { success: true };
}

export async function forceRestorePastCycle(studentId: string, endDateStr: string, overwrite: boolean = false) {
  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("*, schedules(*)").eq("id", studentId).single();
  if (!student) return { success: false, error: "Không tìm thấy học sinh" };
  const res = await restorePastCycle(supabase, student, endDateStr, overwrite);
  if (res?.error) {
    // Special case: cycle 1 already has data, need user confirmation
    if (res.error === "CYCLE_1_EXISTS") {
      return { success: false, error: "CYCLE_1_EXISTS", message: (res as any).message };
    }
    return { success: false, error: res.error };
  }
  return { success: true };
}

export async function getCycleStatus(studentId: string, cycleNumber: number) {
  const supabase = await createClient();
  return await determineCycleStatus(supabase, studentId, cycleNumber);
}
