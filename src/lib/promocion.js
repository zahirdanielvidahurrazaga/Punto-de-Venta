// ────────────────────────────────────────────────────────────────────────────
// PROMOCIÓN VIGENTE (Buen Fin, nov-2026).
//
// Las promociones viven en la tabla `promociones` (+ `promocion_exclusiones`),
// ver scripts/promocion_buen_fin.sql. La caja de la tienda se queda abierta
// días sin recargar, así que no basta con preguntar una vez: se baja la lista
// de promociones que aún no terminan y se decide cuál vale CON EL RELOJ, cada
// pocos segundos. Así arranca sola el sábado a las 00:00 y se apaga sola el
// domingo a las 23:59, sin que nadie toque la caja.
//
// La base tiene la última palabra: `registrar_venta` solo descuenta si la app
// le manda el id de la promoción que aplicó y esa promoción sigue vigente. Si
// esta app no la ve (sin red, versión vieja), cobra precio normal y la base
// también: lo que ve el cajero y lo que queda guardado siempre coinciden.
// ────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const CADA_TICK = 15 * 1000;        // decidir cuál vale
const CADA_RECARGA = 5 * 60 * 1000; // volver a pedir la lista

/** La promoción que vale en `ahora` (la que empezó más recientemente), o null. */
export function promocionVigente(lista = [], ahora = new Date()) {
  const t = ahora.getTime();
  const vigentes = lista.filter(p => new Date(p.inicio).getTime() <= t && t < new Date(p.fin).getTime());
  if (!vigentes.length) return null;
  return vigentes.sort((a, b) => new Date(b.inicio) - new Date(a.inicio))[0];
}

export async function cargarPromociones() {
  const { data, error } = await supabase
    .from('promociones')
    .select('id, nombre, porcentaje, inicio, fin, promocion_exclusiones (producto_id)')
    .eq('activa', true)
    .gt('fin', new Date().toISOString());
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id,
    nombre: p.nombre,
    porcentaje: Number(p.porcentaje),
    inicio: p.inicio,
    fin: p.fin,
    excluidos: (p.promocion_exclusiones || []).map(e => e.producto_id),
  }));
}

/** Hook: la promoción vigente ahora mismo (o null). Se actualiza sola. */
export function usePromocion() {
  const [lista, setLista] = useState([]);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let vivo = true;
    const recargar = () => cargarPromociones()
      .then(l => { if (vivo) setLista(l); })
      // Sin red se queda con la última lista que tenía (el reloj sigue
      // decidiendo); si nunca cargó, no hay promoción y se cobra normal.
      .catch(e => console.error('No se pudieron cargar las promociones:', e.message));
    recargar();
    const r = setInterval(recargar, CADA_RECARGA);
    const t = setInterval(() => setAhora(new Date()), CADA_TICK);
    window.addEventListener('online', recargar);
    return () => { vivo = false; clearInterval(r); clearInterval(t); window.removeEventListener('online', recargar); };
  }, []);

  return promocionVigente(lista, ahora);
}

/** "domingo 15 de nov, 23:59" — para el letrero de la Terminal. */
export function finLegible(fin) {
  // `fin` es el primer instante SIN promoción (lunes 00:00); se muestra el
  // último minuto con promoción.
  const d = new Date(new Date(fin).getTime() - 60 * 1000);
  return d.toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
