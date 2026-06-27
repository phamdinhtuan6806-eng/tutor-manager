import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testInsert() {
  console.log("Testing insert student...");
  const { data: student, error: studentError } = await supabase.from('students').insert({
    full_name: 'Test Student',
    tuition_type: 'per_session',
    tuition_amount: 100000,
    start_date: '2026-06-01',
    end_date: '2026-06-30'
  }).select().single();
  
  if (studentError) {
    console.error("Student Insert failed:", studentError);
    return;
  }
  
  console.log("Testing insert session...");
  const { error: sessionError } = await supabase.from('sessions').insert([
    {
      student_id: student.id,
      session_date: '2026-06-01',
      subject: 'Toan',
      status: 'scheduled'
    }
  ]);
  
  if (sessionError) {
    console.error("Session Insert failed:", sessionError);
  } else {
    console.log("All successful!");
  }
}

testInsert();
