// ────────────────────────────────────────────────────────────────────────────
// Reporte de errores de la app a la tabla `errores_app`.
//
// En el iPhone una pantalla en blanco no deja rastro: no hay consola a la
// vista y el usuario solo puede decir "se puso en blanco". Con esto el error
// real (mensaje, pila, pantalla y versión) queda en la base y se puede leer
// sin tener el teléfono enfrente. Ver scripts/folio_y_edicion_ventas.sql.
//
// Nunca lanza: si reportar falla (sin red, tabla aún no creada) se calla,
// porque un error al reportar un error no debe empeorar las cosas.
// ────────────────────────────────────────────────────────────────────────────
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseClient';

// El nombre del bundle (index-XXXX.js) identifica exactamente qué código corre
// en ese dispositivo: el mismo hash que la web desplegada = mismo código.
const version = () => {
  const s = document.querySelector('script[src*="/assets/index-"]');
  return s ? s.getAttribute('src').split('/').pop() : 'dev';
};

let enviados = 0;
const vistos = new Set();

export function reportarError(error, pantalla = null) {
  try {
    const mensaje = String(error?.message || error || 'Error desconocido').slice(0, 1000);
    const pila = String(error?.stack || '').slice(0, 4000);
    // Sin avalanchas: el mismo error una sola vez y a lo más 20 por sesión.
    const clave = `${pantalla}|${mensaje}`;
    if (vistos.has(clave) || enviados >= 20) return;
    vistos.add(clave);
    enviados++;

    supabase.from('errores_app').insert({
      pantalla,
      mensaje,
      pila,
      plataforma: Capacitor.getPlatform(),
      version: version(),
      agente: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  } catch { /* nunca propagar */ }
}

let instalado = false;
/** Atrapa también lo que truena fuera de React (promesas sin catch, etc.). */
export function instalarReporteGlobal() {
  if (instalado) return;
  instalado = true;
  window.addEventListener('error', (e) => reportarError(e.error || e.message, 'global'));
  window.addEventListener('unhandledrejection', (e) => reportarError(e.reason, 'promesa'));
}
