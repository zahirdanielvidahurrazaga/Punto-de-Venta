import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { supabase } from './supabaseClient';

// Evita registrar los listeners más de una vez por sesión de app.
let yaInicializado = false;

// Guarda el token FCM del dispositivo para el usuario autenticado.
async function guardarToken(token) {
  if (!token) return;
  try {
    await supabase.rpc('guardar_push_token', {
      p_token: token,
      p_plataforma: Capacitor.getPlatform(),
    });
  } catch (e) {
    console.error('Error guardando push token:', e);
  }
}

/**
 * Inicializa el push nativo vía Firebase Cloud Messaging y guarda el token FCM
 * del dispositivo (iOS y Android) con la RPC guardar_push_token.
 * En web no hace nada (solo corre en iOS/Android).
 */
export async function initPush() {
  if (!Capacitor.isNativePlatform()) return;
  if (yaInicializado) return;
  yaInicializado = true;

  try {
    let permiso = await FirebaseMessaging.checkPermissions();
    if (permiso.receive === 'prompt' || permiso.receive === 'prompt-with-rationale') {
      permiso = await FirebaseMessaging.requestPermissions();
    }
    if (permiso.receive !== 'granted') {
      console.warn('Permiso de notificaciones no concedido');
      return;
    }

    // El token puede rotar; este listener lo mantiene actualizado.
    await FirebaseMessaging.addListener('tokenReceived', (event) => {
      guardarToken(event?.token);
    });

    // Limpia el badge/notificaciones al abrir una notificación.
    await FirebaseMessaging.addListener('notificationActionPerformed', async () => {
      try { await FirebaseMessaging.removeAllDeliveredNotifications(); } catch { /* noop */ }
    });

    // Pide el token actual de inmediato (en iOS dispara el registro con APNs).
    const { token } = await FirebaseMessaging.getToken();
    await guardarToken(token);
  } catch (e) {
    yaInicializado = false;
    console.error('Error inicializando push:', e);
  }
}
