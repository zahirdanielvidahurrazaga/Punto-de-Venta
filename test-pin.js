import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

  async function test() {
    const { data, error } = await supabase.rpc('verificar_pin_admin', { pin_ingresado: '1234' });
    console.log("RPC Result:", data);
    console.log("RPC Error:", error);
  }
  
  test();
}
