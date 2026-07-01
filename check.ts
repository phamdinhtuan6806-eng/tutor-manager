import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string);
async function run() {
  const { data } = await supabase.from('students').select('*, schedules(*)').eq('full_name', 'Tiểu bối');
  console.log(JSON.stringify(data, null, 2));
}
run();
