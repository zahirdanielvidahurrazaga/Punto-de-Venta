// ────────────────────────────────────────────────────────────────────────────
// Historial de ventas (Pedidos): textos derivados, sin React ni red, para
// poder probarlos con `npm test`.
// ────────────────────────────────────────────────────────────────────────────
import { toLocal, inicioDelDia, masDias } from './periodos';

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Cubeta 19 L ×2, Escoba ×1 y 3 más"
export function resumenProductos(detalles, nombres) {
  const partes = (detalles || [])
    .map(d => ({ n: nombres.get(d.producto_id) || 'Producto', q: Number(d.cantidad) || 0 }))
    .sort((a, b) => b.q - a.q);
  const primeros = partes.slice(0, 2).map(p => `${p.n} ×${p.q}`).join(', ');
  return partes.length > 2 ? `${primeros} y ${partes.length - 2} más` : primeros;
}

export function etiquetaDia(clave, ahora) {
  const hoy = toLocal(ahora);
  const ayer = toLocal(masDias(inicioDelDia(ahora), -1));
  const [a, m, d] = clave.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  const txt = fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  if (clave === hoy)  return { titulo: 'Hoy', sub: txt };
  if (clave === ayer) return { titulo: 'Ayer', sub: txt };
  return { titulo: txt.charAt(0).toUpperCase() + txt.slice(1), sub: fecha.getFullYear() !== ahora.getFullYear() ? String(fecha.getFullYear()) : '' };
}

// Qué cambió entre dos fotos de la venta (bitácora).
export function difVenta(antes, despues) {
  const mapa = (f) => new Map((f?.items || []).map(i => [i.producto_id, i]));
  const A = mapa(antes), D = mapa(despues);
  const lineas = [];
  for (const [id, a] of A) {
    const d = D.get(id);
    if (!d) lineas.push(`Quitó ${a.nombre} (${a.cantidad} pz)`);
    else if (d.cantidad !== a.cantidad) lineas.push(`${a.nombre}: ${a.cantidad} → ${d.cantidad} pz`);
  }
  for (const [id, d] of D) if (!A.has(id)) lineas.push(`Agregó ${d.nombre} (${d.cantidad} pz)`);
  const pago = (f) => ['efectivo', 'tarjeta', 'transferencia']
    .filter(k => Number(f?.[`pago_${k}`]) > 0).map(k => `${k} ${money(f[`pago_${k}`])}`).join(' + ') || '—';
  if (pago(antes) !== pago(despues) && despues?.estado !== 'cancelada') lineas.push(`Pago: ${pago(antes)} → ${pago(despues)}`);
  return lineas;
}
