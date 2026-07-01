import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);

async function run() {
  const { data: st } = await supabase.from('students').select('*').eq('full_name', 'Tiểu bối').single();
  if (st) {
    console.log("Found student, current cycle:", st.current_cycle);
    await supabase.from('students').update({ current_cycle: 1 }).eq('id', st.id);
    
    // Also clean up any lingering sessions just in case
    await supabase.from('sessions').delete().eq('student_id', st.id);
    
    console.log("Reset to cycle 1 and cleaned sessions.");
  }
}
run();
