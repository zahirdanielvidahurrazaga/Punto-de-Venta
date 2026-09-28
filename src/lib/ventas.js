// ────────────────────────────────────────────────────────────────────────────
// VENTAS — único punto de acceso a los números de ventas.
//
// Hasta el 27-sep-2026 Dashboard, Pedidos, Reportes y Caja tenían cada uno su
// consulta y su suma. Una falla se arreglaba en una pantalla y seguía viva en
// otra (el corte de 1000 filas mordió tres veces, en tres pantallas). Ahora:
//
//   * Los TOTALES los calcula la base (`resumen_ventas`, ver
//     scripts/resumen_ventas.sql). Dos pantallas que piden el mismo periodo
//     reciben el mismo número por construcción.
//   * Las LISTAS de ventas (Pedidos) salen de aquí con la misma selección y la
//     misma forma de datos.
//
// Regla de la casa: ninguna pantalla vuelve a sumar `ventas.total` por su
// cuenta. Si necesita un total, lo pide aquí.
// ────────────────────────────────────────────────────────────────────────────
import { supabase } from './supabaseClient';

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const aISO = (d) => (d == null ? null : new Date(d).toISOString());

/**
 * Deja la respuesta de `resumen_ventas` lista para pintar: números de verdad
 * (la base manda numeric como texto o número) y los desgloses en Map.
 * Pura, para poder probarla sin red.
 */
export function normalizarResumen(r = {}) {
  const fc = r.fuera_de_corte || {};
  return {
    total:         n(r.total),
    tickets:       n(r.tickets),
    efectivo:      n(r.efectivo),
    tarjeta:       n(r.tarjeta),
    transferencia: n(r.transferencia),
    piezas:        n(r.piezas),
    canceladas:    n(r.canceladas),
    sinSucursal:   n(r.sin_sucursal),
    ticketPromedio: n(r.tickets) ? n(r.total) / n(r.tickets) : 0,
    fueraDeCorte: { tickets: n(fc.tickets), total: n(fc.total), efectivo: n(fc.efectivo) },
    porCubeta: new Map((r.por_cubeta || []).map(c => [String(c.clave), { total: n(c.total), tickets: n(c.tickets) }])),
    porSucursal: new Map((r.por_sucursal || []).map(s => [s.sucursal_id, {
      total: n(s.total), tickets: n(s.tickets), piezas: n(s.piezas),
    }])),
    porSesion: new Map((r.por_sesion || []).map(s => [s.sesion_caja_id, {
      tickets: n(s.tickets), efectivo: n(s.efectivo), tarjeta: n(s.tarjeta), transferencia: n(s.transferencia),
    }])),
    porProducto: new Map((r.por_producto || []).map(p => [p.producto_id, {
      unidades: n(p.unidades), ingresos: n(p.ingresos),
    }])),
  };
}

export const RESUMEN_VACIO = normalizarResumen({});

/**
 * Totales de ventas de un periodo, calculados por la base.
 *
 * @param desde    Date | null      (null = desde el principio)
 * @param hasta    Date | null      (null = hasta ahora; no congela el "ahora")
 * @param sucursal uuid | null      (null = todas)
 * @param grano    'hora'|'dia'|'mes' para `porCubeta`
 */
export async function resumenVentas({ desde = null, hasta = null, sucursal = null, grano = 'dia' } = {}) {
  const { data, error } = await supabase.rpc('resumen_ventas', {
    p_desde: aISO(desde),
    p_hasta: aISO(hasta),
    p_sucursal: sucursal,
    p_grano: grano,
  });
  if (error) throw error;
  return normalizarResumen(data || {});
}

/** Cobrado en un turno (para el corte): lo mismo que el Dashboard usa en el arqueo. */
export async function totalesDeSesion(sesion) {
  const r = await resumenVentas({ desde: sesion.fecha_apertura });
  const s = r.porSesion.get(sesion.id);
  return {
    efectivo:      s?.efectivo      || 0,
    tarjeta:       s?.tarjeta       || 0,
    transferencia: s?.transferencia || 0,
    tickets:       s?.tickets       || 0,
  };
}

// ── Listas (Pedidos) ────────────────────────────────────────────────────────

export const SELECT_LISTA =
  'id, folio, fecha, total, pago_efectivo, pago_tarjeta, pago_transferencia, sucursal_id, ' +
  'user_id, usuario_nombre, estado, ediciones, modificada_at, ' +
  'venta_detalles(cantidad, producto_id, precio_unitario)';

export const esCancelada = (v) => v?.estado === 'cancelada';

/** Forma única de una venta de lista. El ticket y el editor dependen de ella. */
export function mapVentaLista(v) {
  const detalles = v.venta_detalles || [];
  return {
    ...v,
    ts: new Date(v.fecha).getTime(),
    total: n(v.total),
    ediciones: n(v.ediciones),
    articulos: detalles.reduce((acc, d) => acc + n(d.cantidad), 0),
    // En una cancelada `total` quedó en $0; lo que se había cobrado sale de
    // las partidas, que se conservan. Solo para mostrarlo tachado.
    totalOriginal: esCancelada(v)
      ? detalles.reduce((a, d) => a + n(d.cantidad) * n(d.precio_unitario), 0)
      : n(v.total),
    pagos: {
      efectivo:      n(v.pago_efectivo),
      tarjeta:       n(v.pago_tarjeta),
      transferencia: n(v.pago_transferencia),
    },
  };
}

/** Fusiona filas nuevas/actualizadas en una lista ordenada de la más nueva a la más vieja. */
export function fusionarVentas(prev, filas) {
  const porId = new Map(prev.map(v => [v.id, v]));
  for (const f of filas) porId.set(f.id, mapVentaLista(f));
  return [...porId.values()].sort((a, b) => b.ts - a.ts);
}

/**
 * Partidas de UNA venta, listas para el ticket y el editor.
 * `precio_unitario` es lo que se cobró; `precio`/mayoreo son los del catálogo
 * de hoy (el editor los usa para las partidas que cambian).
 */
export async function partidasDeVenta(ventaId) {
  const { data, error } = await supabase
    .from('venta_detalles')
    .select('producto_id, cantidad, precio_unitario, precio_lista, productos (*)')
    .eq('venta_id', ventaId);
  if (error) throw error;
  return (data || []).map(d => ({
    ...(d.productos || {}),
    producto_id: d.producto_id,
    quantity: d.cantidad,
    precio_unitario: d.precio_unitario,
    // Precio normal de AQUEL día (desde 27-sep-2026); null en ventas anteriores.
    precio_lista: d.precio_lista,
    precio: n(d.productos?.precio ?? d.precio_unitario),
  }));
}

export async function historialDeVenta(ventaId) {
  const { data, error } = await supabase
    .from('ventas_ediciones').select('*')
    .eq('venta_id', ventaId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
