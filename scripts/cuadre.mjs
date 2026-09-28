#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────
// CUADRE — ¿los números de ventas dicen lo mismo por todos los caminos?
//
//   npm run cuadre
//
// Solo LEE. Para cada periodo (hoy, 7 días, 30 días, todo) compara:
//   A) `resumen_ventas` (lo que pintan Dashboard, Pedidos, Reportes y Caja)
//   B) las ventas crudas, paginadas y sumadas aquí a mano
// y además revisa cada venta por dentro:
//   · pagos (efectivo + tarjeta + transferencia) = total
//   · partidas (cantidad × precio) = total
//   · lo de cada turno (por_sesion) y la gráfica (por_cubeta) = el total
//   · folios únicos
// Si algo no cuadra al centavo, lo dice y sale con código 1.
//
// Nació el 27-sep-2026: los resúmenes tardaron 3–4 vueltas en quedar bien
// porque cada pantalla sumaba por su cuenta y nadie comparaba contra la base.
// Usa la llave service_role del .env local (nunca va al navegador).
// ────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import { rangoDe } from '../src/lib/periodos.js';

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const URL_BASE = env.VITE_SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !LLAVE) { console.error('Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(2); }

const H = { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json' };
const c = (n) => Math.round(Number(n || 0) * 100);   // centavos: se compara en enteros
const $ = (cent) => `$${(cent / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

async function rpc(nombre, args) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${nombre}: ${r.status} ${await r.text()}`);
  return r.json();
}
async function todas(ruta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { headers: { ...H, Range: `${desde}-${desde + 999}` } });
    if (!r.ok) throw new Error(`${ruta}: ${r.status} ${await r.text()}`);
    const pag = await r.json();
    filas.push(...pag);
    if (pag.length < 1000) return filas;
  }
}

let fallas = 0;
const ok  = (msg) => console.log(`  ✓ ${msg}`);
const mal = (msg) => { fallas++; console.log(`  ✗ ${msg}`); };
const igual = (etq, a, b, fmt = String) => (a === b ? ok(`${etq}: ${fmt(a)}`) : mal(`${etq}: resumen ${fmt(a)} ≠ crudo ${fmt(b)} (dif ${fmt(a - b)})`));

const ahora = new Date();
const periodos = [
  ['Hoy', rangoDe('hoy', ahora).desde],
  ['7 días', rangoDe('7d', ahora).desde],
  ['30 días', rangoDe('30d', ahora).desde],
  ['Todo', null],
];

console.log(`Cuadre de ventas · ${ahora.toLocaleString('es-MX')}\n`);

for (const [nombre, desde] of periodos) {
  console.log(`▸ ${nombre}${desde ? ` (desde ${desde.toLocaleDateString('es-MX')})` : ''}`);
  const A = await rpc('resumen_ventas', { p_desde: desde?.toISOString() ?? null, p_hasta: null, p_sucursal: null, p_grano: 'dia' });
  const filtro = desde ? `&fecha=gte.${encodeURIComponent(desde.toISOString())}` : '';
  const crudas = await todas(`ventas?select=id,folio,total,pago_efectivo,pago_tarjeta,pago_transferencia,estado,sesion_caja_id,venta_detalles(cantidad,precio_unitario)&order=fecha.desc${filtro}`);
  const vig = crudas.filter(v => v.estado !== 'cancelada');

  igual('tickets', A.tickets, vig.length);
  igual('total', c(A.total), vig.reduce((s, v) => s + c(v.total), 0), $);
  igual('efectivo', c(A.efectivo), vig.reduce((s, v) => s + c(v.pago_efectivo), 0), $);
  igual('tarjeta', c(A.tarjeta), vig.reduce((s, v) => s + c(v.pago_tarjeta), 0), $);
  igual('transferencia', c(A.transferencia), vig.reduce((s, v) => s + c(v.pago_transferencia), 0), $);
  igual('canceladas', A.canceladas, crudas.length - vig.length);
  igual('piezas', Number(A.piezas), vig.reduce((s, v) => s + v.venta_detalles.reduce((t, d) => t + d.cantidad, 0), 0));

  const sumaCub = (A.por_cubeta || []).reduce((s, x) => s + c(x.total), 0);
  sumaCub === c(A.total) ? ok('la gráfica suma el total') : mal(`la gráfica suma ${$(sumaCub)} y el total es ${$(c(A.total))}`);

  const sesA = new Map((A.por_sesion || []).map(s => [s.sesion_caja_id, c(s.efectivo)]));
  const sesB = new Map();
  for (const v of vig) if (v.sesion_caja_id) sesB.set(v.sesion_caja_id, (sesB.get(v.sesion_caja_id) || 0) + c(v.pago_efectivo));
  const sesMal = [...new Set([...sesA.keys(), ...sesB.keys()])].filter(k => sesA.get(k) !== sesB.get(k));
  sesMal.length ? mal(`${sesMal.length} turno(s) con efectivo distinto`) : ok(`efectivo por turno cuadra (${sesA.size} turnos)`);

  const pagosMal = vig.filter(v => c(v.pago_efectivo) + c(v.pago_tarjeta) + c(v.pago_transferencia) !== c(v.total));
  pagosMal.length ? mal(`${pagosMal.length} venta(s) donde los pagos no suman el total: ${pagosMal.slice(0, 5).map(v => '#' + v.folio).join(', ')}`)
                  : ok('en cada venta los pagos suman el total');
  const partMal = vig.filter(v => v.venta_detalles.reduce((s, d) => s + Math.round(d.cantidad * d.precio_unitario * 100), 0) !== c(v.total));
  partMal.length ? mal(`${partMal.length} venta(s) donde las partidas no suman el total: ${partMal.slice(0, 5).map(v => '#' + v.folio).join(', ')}`)
                 : ok('en cada venta las partidas suman el total');

  if (!desde) {
    const folios = crudas.map(v => v.folio);
    new Set(folios).size === folios.length ? ok(`folios únicos (${folios.length})`) : mal('hay folios repetidos');
    const max = Math.max(...folios);
    const huecos = max - folios.length;
    console.log(`  · folios 1…${max}: ${huecos} hueco(s) (normal si alguna venta falló a medio cobro)`);
  }
  console.log('');
}

console.log(fallas ? `✗ ${fallas} diferencia(s). Revisar antes de publicar.` : '✓ Todo cuadra al centavo.');
process.exit(fallas ? 1 : 0);
