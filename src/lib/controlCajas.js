import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabaseClient';

// ────────────────────────────────────────────────────────────────────────────
// CONTROL DE CAJAS A DISTANCIA (28-oct-2026)
//
// Reporte de Carlos: se fue el internet en la tienda, la Terminal se quedó sin
// catálogo (todo en "Sólo hay 0") y no hubo forma de saber desde fuera si los
// empleados recargaron. Con esto:
//
//   · Cada sesión abierta (caja o admin) se anuncia en un canal de Realtime
//     (presence) con su nombre, sucursal, VERSIÓN cargada y el estado de su
//     catálogo. Equipo → "Cajas conectadas ahora" lo enseña en vivo.
//   · El admin puede mandar "Recargar cajas" (broadcast): las cajas se recargan
//     solas. Si están cobrando, esperan a que se cierre el cobro. El carrito
//     vive en localStorage, así que recargar no pierde el ticket.
//
// Un solo canal por pestaña (el admin también se une; así su vista lee la
// misma presencia sin abrir un segundo canal con el mismo nombre).
// ────────────────────────────────────────────────────────────────────────────

export const VERSION = import.meta.env.VITE_BUILD || 'dev';
const CANAL = 'pos-control';

let canal = null;
let suscrito = false;
let datos = {};
let cajas = [];
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

// La Terminal reporta aquí cómo va su catálogo y si está cobrando.
export function reportarCaja(extra) {
  const cambio = Object.keys(extra).some((k) => datos[k] !== extra[k]);
  datos = { ...datos, ...extra };
  if (cambio && suscrito) canal?.track(datos).catch(() => {});
}

function leerPresencia() {
  const estado = canal?.presenceState() || {};
  cajas = Object.values(estado).flat()
    .map((m) => { const copia = { ...m }; delete copia.presence_ref; return copia; })
    .sort((a, b) => (a.rol === b.rol ? String(a.nombre).localeCompare(String(b.nombre)) : a.rol === 'empleado' ? -1 : 1));
  avisar();
}

// Se usa UNA vez, en App, para cualquier usuario con sesión.
export function useControlCajas(userProfile, alRecargar) {
  const recargarRef = useRef(alRecargar);
  useEffect(() => { recargarRef.current = alRecargar; });

  // Nombre, rol o sucursal cambian sin rearmar el canal (rearmarlo con el
  // mismo nombre mientras el anterior se cierra lo dejaba muerto).
  useEffect(() => {
    if (!userProfile?.id) return;
    reportarCaja({
      nombre: userProfile.nombre_completo || 'Sin nombre',
      rol: userProfile.rol,
      sucursal: userProfile.sucursales?.nombre || 'Sin sucursal',
    });
  }, [userProfile?.id, userProfile?.nombre_completo, userProfile?.rol, userProfile?.sucursales?.nombre]);

  useEffect(() => {
    if (!userProfile?.id) return undefined;
    datos = { ...datos, id: userProfile.id, version: VERSION, desde: Date.now() };
    const llave = `${userProfile.id}-${Math.random().toString(36).slice(2, 7)}`;
    // PRIVADO: solo sesiones válidas lo escuchan y solo el admin puede mandar
    // "recargar" (políticas en scripts/control_cajas_realtime.sql).
    canal = supabase.channel(CANAL, { config: { private: true, presence: { key: llave } } });
    canal
      .on('presence', { event: 'sync' }, leerPresencia)
      .on('broadcast', { event: 'recargar' }, () => recargarRef.current?.())
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') { suscrito = true; canal.track(datos).catch(() => {}); }
        else if (estado === 'CLOSED' || estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') suscrito = false;
      });
    return () => {
      suscrito = false;
      const c = canal;
      canal = null;
      cajas = [];
      if (c) supabase.removeChannel(c);
    };
  }, [userProfile?.id]);
}

// Para la vista del admin: quién está conectado ahora mismo.
export function useCajasConectadas() {
  return useSyncExternalStore((f) => { oyentes.add(f); return () => oyentes.delete(f); }, () => cajas);
}

// Manda la orden. Quien la envía no la recibe (broadcast sin `self`).
export async function pedirRecarga() {
  if (!canal || !suscrito) return false;
  const r = await canal.send({ type: 'broadcast', event: 'recargar', payload: { por: datos.nombre, t: Date.now() } });
  return r === 'ok';
}

// Recargar sin interrumpir una venta: mientras la caja esté ocupada (cobrando,
// guardando o con el ticket del cliente en pantalla) se espera, y el aviso
// sale hasta que ya se va a recargar (si sale antes, tapa el cobro y la caja
// nunca termina de cobrar).
let recargaPendiente = false;
export function recargarCuandoSePueda(alAvisar) {
  if (recargaPendiente) return;
  recargaPendiente = true;
  const intentar = () => {
    if (datos.ocupada) { setTimeout(intentar, 2000); return; }
    alAvisar?.();
    setTimeout(() => window.location.reload(), 2500);
  };
  intentar();
}

export function useAhoraCada(ms) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setT(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return t;
}
