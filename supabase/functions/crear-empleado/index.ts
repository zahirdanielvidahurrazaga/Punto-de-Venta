// Edge Function: crear-empleado
// Permite que un ADMIN dé de alta un empleado (usuario de Auth) desde la app.
// Crear usuarios requiere el service_role, que nunca debe vivir en el cliente.
//
// El trigger `handle_new_user` (database.sql) crea automáticamente el perfil
// (rol='empleado', codigo_gafete => QR), las credenciales (PIN '1234', debe
// cambiarse) al insertarse el usuario. Aquí, además, asignamos la sucursal.
//
// Disponibles por defecto en Edge Functions:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Validar el token y confirmar que quien llama es admin.
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'Sesión inválida' }, 401);

    const { data: perfil } = await admin
      .from('usuarios_perfiles')
      .select('rol')
      .eq('id', userData.user.id)
      .single();
    if (perfil?.rol !== 'admin') {
      return json({ error: 'Solo un administrador puede crear empleados.' }, 403);
    }

    // Datos del nuevo empleado.
    const body = await req.json().catch(() => ({}));
    const nombre_completo = String(body.nombre_completo ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const sucursal_id = body.sucursal_id || null;

    if (!nombre_completo) return json({ error: 'El nombre es obligatorio.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Correo inválido.' }, 400);
    if (password.length < 6) return json({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);

    // Crear el usuario. El trigger handle_new_user genera perfil + PIN + gafete.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre_completo },
    });
    if (createErr) {
      const msg = /already been registered|already exists/i.test(createErr.message)
        ? 'Ya existe un usuario con ese correo.'
        : createErr.message;
      return json({ error: msg }, 400);
    }

    const nuevoId = created.user!.id;

    // Asignar la sucursal elegida (el trigger no la conoce).
    if (sucursal_id) {
      await admin.from('usuarios_perfiles').update({ sucursal_id }).eq('id', nuevoId);
    }

    return json({ ok: true, user_id: nuevoId });
  } catch (e) {
    console.error('crear-empleado error:', e);
    return json({ error: String(e) }, 500);
  }
});
