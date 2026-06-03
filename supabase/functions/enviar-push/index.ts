// Edge Function: enviar-push
// Se dispara con un Database Webhook en INSERT sobre `notificaciones`.
// Lee los push_tokens de los admins y manda la notificación vía FCM HTTP v1.
//
// Secrets requeridos (supabase secrets set):
//   FCM_SERVICE_ACCOUNT  -> JSON de la cuenta de servicio de Firebase (punto-venta-tito)
// Disponibles por defecto en Edge Functions:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const FCM_PROJECT_ID = 'punto-venta-tito';
const FCM_ENDPOINT = `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`;

// --- Mint de access token OAuth2 a partir de la service account ---
async function obtenerAccessToken(sa: Record<string, string>): Promise<string> {
  // La private key viene en PEM PKCS#8; la importamos para firmar RS256.
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const jwt = await create(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    key,
  );

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!data.access_token) throw new Error('No se obtuvo access_token: ' + JSON.stringify(data));
  return data.access_token;
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const notif = payload.record ?? payload; // soporta webhook o llamada directa
    if (!notif?.titulo) return new Response('sin notificación', { status: 200 });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Tokens de todos los admins.
    const { data: admins } = await supabase
      .from('usuarios_perfiles')
      .select('id')
      .eq('rol', 'admin');
    const adminIds = (admins ?? []).map((a) => a.id);
    if (!adminIds.length) return new Response('sin admins', { status: 200 });

    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('token')
      .in('usuario_id', adminIds);
    const lista = (tokens ?? []).map((t) => t.token);
    if (!lista.length) return new Response('sin tokens', { status: 200 });

    const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!);
    const accessToken = await obtenerAccessToken(sa);

    const resultados = await Promise.allSettled(
      lista.map((token) =>
        fetch(FCM_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: notif.titulo, body: notif.cuerpo },
              data: {
                tipo: String(notif.tipo ?? ''),
                notif_id: String(notif.id ?? ''),
              },
              android: { priority: 'high' },
              apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            },
          }),
        }),
      ),
    );

    const ok = resultados.filter((r) => r.status === 'fulfilled').length;
    return new Response(JSON.stringify({ enviados: ok, total: lista.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('enviar-push error:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
