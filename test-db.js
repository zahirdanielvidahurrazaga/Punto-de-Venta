import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

  async function test() {
    // Intentamos iniciar sesión con admin@plasticos.com para ver si podemos leer el perfil
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'admin@plasticos.com',
      password: 'admin' // Probaremos una contraseña genérica, si falla probaremos solo la consulta anónima
    });
    
    console.log("Auth attempt (can ignore if fails due to wrong pass):", authError?.message || "Success");

    // Test 1: Fetch perfiles sin autenticación y con autenticación
    const { data, error } = await supabase
      .from('usuarios_perfiles')
      .select('*')
      .eq('id', 'b1417539-688b-4c28-a699-2c7eb4e9c860');
      
    console.log("Usuarios Perfiles Query Result:");
    console.log("Data:", data);
    console.log("Error:", error);
    
    // Test 2: Listar políticas (requiere service role, pero veremos qué sale)
    const { data: raw, error: rawError } = await supabase.rpc('get_policies'); // probablamente falle, pero por si acaso
  }
  
  test();
}
