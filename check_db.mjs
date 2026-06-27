import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: students } = await supabase.from("students").select("id, full_name, group_id, is_active");
  console.log("Students:", students);
  const { data: groups } = await supabase.from("student_groups").select("id, group_name, is_active");
  console.log("Groups:", groups);
  const { data: sessions } = await supabase.from("sessions").select("id, student_id, cycle_number, session_date");
  console.log("Sessions count:", sessions?.length);
}
check();
