// ────────────────────────────────────────────────────────────────────────────
// Cálculos del Dashboard — funciones PURAS (sin React, sin red).
//
// Salieron del componente el 27-sep-2026 para poder probarlas con `npm test`:
// es la parte que se equivocaba en silencio. Los totales de ventas ya vienen
// hechos por la base (`resumen_ventas`); aquí solo se combinan con lo que no
// es venta (turnos, sangrías, ajustes de inventario, rutas, existencias).
// ────────────────────────────────────────────────────────────────────────────
import { variacion } from '../../lib/periodos';

// Ajustes de inventario de 1 a 5 piezas = "bajas sueltas"; más de 5 solo
// pueden ser corrección de carga o de conteo (el 10-sep bajaron −1,430 termos
// de un golpe). Ver el contexto del 18-sep en CLAUDE.md: el catálogo se sigue
// capturando a mano y el bloque NO acusa.
export const PZ_SALIDA_SUELTA = 5;

const num = (v) => Number(v) || 0;
const suma = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

/** KPIs del periodo contra el periodo previo del mismo largo. */
export function calcKpi(actual, previo) {
  return {
    total:   actual.total,
    ordenes: actual.tickets,
    ef:      actual.efectivo,
    tar:     actual.tarjeta,
    trans:   actual.transferencia,
    ticket:  actual.ticketPromedio,
    dTotal:   variacion(actual.total,   previo.total),
    dOrdenes: variacion(actual.tickets, previo.tickets),
    dTicket:  variacion(actual.ticketPromedio, previo.ticketPromedio),
    dEf:      variacion(actual.efectivo, previo.efectivo),
  };
}

/** Ventas en ruta: no pasan por `ventas`, se liquidan aparte. */
export function calcRuta(rutasLiq, rutasVivas) {
  return {
    liquidaciones: rutasLiq.length,
    dinero:    suma(rutasLiq, r => num(r.dinero_real)),
    lista:     suma(rutasLiq, r => num(r.total_lista)),
    descuento: suma(rutasLiq, r => num(r.descuento_campo)),
    vivas:     rutasVivas.length,
  };
}

/** Inventario bajado a mano (ajustes a la baja), valuado a precio de venta. */
export function calcSalidas(salidas) {
  const valor = (m) => m.piezas * m.precio;
  const resumen = (filas) => ({
    movimientos: filas.length,
    piezas: suma(filas, m => m.piezas),
    valor:  suma(filas, valor),
  });

  const chicos  = salidas.filter(m => m.piezas <= PZ_SALIDA_SUELTA);
  const grandes = salidas.filter(m => m.piezas >  PZ_SALIDA_SUELTA);

  const agrupar = (filas, clave, nombre) => {
    const g = {};
    for (const m of filas) {
      const k = clave(m);
      g[k] ||= { [nombre]: k, movimientos: 0, piezas: 0, valor: 0 };
      g[k].movimientos++;
      g[k].piezas += m.piezas;
      g[k].valor  += valor(m);
    }
    return Object.values(g).sort((a, b) => b.valor - a.valor);
  };

  // Desde el 18-sep el ajuste guarda el motivo; lo de antes decía siempre
  // "Ajuste manual", que es lo mismo que no decir nada.
  const sinMotivo = (m) => !m.motivo || m.motivo === 'Ajuste manual';

  return {
    porMotivo: agrupar(salidas, m => (sinMotivo(m) ? 'Sin motivo registrado' : m.motivo), 'motivo'),
    conMotivo: salidas.some(m => !sinMotivo(m)),
    mostrador: { ...resumen(chicos), porPersona: agrupar(chicos, m => m.quien, 'nombre') },
    correcciones: {
      ...resumen(grandes),
      mayores: [...grandes].sort((a, b) => valor(b) - valor(a)).slice(0, 3)
        .map(m => ({ id: m.id, nombre: m.nombre, piezas: m.piezas, valor: valor(m), cuando: m.cuando, quien: m.quien })),
    },
  };
}

/** Avance de la captura del catálogo: productos con existencia por sucursal. */
export function calcCargaCatalogo({ stock, sucursales, catalogo, entradas }) {
  if (!stock.length || !sucursales.length || !catalogo.size) return null;
  const porSucursal = sucursales.map(s => {
    const filas = stock.filter(x => x.sucursal_id === s.id && catalogo.get(x.producto_id)?.activo !== false);
    const con   = filas.filter(x => num(x.stock) > 0).length;
    const total = filas.length;
    const surtidos = new Set(entradas.filter(e => e.sucursal_id === s.id).map(e => e.producto_id)).size;
    return { ...s, con, total, faltan: total - con, pct: total ? Math.round((con / total) * 100) : 0, surtidos };
  });
  const total = suma(porSucursal, x => x.total);
  const con   = suma(porSucursal, x => x.con);
  return { porSucursal, total, con, faltan: total - con, pct: total ? Math.round((con / total) * 100) : 0 };
}

/**
 * Rankings de productos y categorías. Las unidades e ingresos por producto
 * vienen de la base (`porProducto`); antes se bajaban TODAS las partidas del
 * periodo al navegador para sumarlas (Análisis tardaba ~10 s en 30 días).
 */
export function calcProductos({ porProducto, stock, catalogo, sucursalFiltro }) {
  const conStock = new Map();
  for (const fila of stock) {
    const p = catalogo.get(fila.producto_id);
    if (!p || p.activo === false) continue;
    if (sucursalFiltro !== 'todas' && fila.sucursal_id !== sucursalFiltro) continue;
    const acc = conStock.get(p.id);
    if (acc) acc.stock += num(fila.stock);
    else conStock.set(p.id, { ...p, stock: num(fila.stock) });
  }

  const arr = [...porProducto.entries()].map(([id, v]) => {
    const p = catalogo.get(id);
    return {
      id,
      nombre:    p?.nombre    || 'Producto dado de baja',
      sku:       p?.sku       || '—',
      categoria: p?.categoria || 'Sin categoría',
      unidades:  v.unidades,
      ingresos:  v.ingresos,
    };
  });

  const porUnidades = [...arr].sort((a, b) => b.unidades - a.unidades);
  const vendidos = new Set(arr.map(p => p.id));

  const cats = {};
  for (const p of arr) {
    cats[p.categoria] ||= { cat: p.categoria, ingresos: 0, unidades: 0 };
    cats[p.categoria].ingresos += p.ingresos;
    cats[p.categoria].unidades += p.unidades;
  }

  return {
    top5Units:   porUnidades.slice(0, 5),
    top5Revenue: [...arr].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5),
    bottom5:     porUnidades.filter(p => p.unidades > 0).slice(-5).reverse(),
    sinMovimiento: [...conStock.values()].filter(p => !vendidos.has(p.id)).sort((a, b) => b.stock - a.stock),
    conExistencia: conStock.size,
    categorias: Object.values(cats).sort((a, b) => b.ingresos - a.ingresos),
  };
}

/**
 * Arqueo turno por turno: esperado = fondo + ventas en efectivo del turno +
 * depósitos − retiros. El efectivo declarado es el dinero FÍSICO del cajón,
 * así que se compara contra el esperado, nunca contra las ventas.
 * Las ventas por turno vienen de la base (`porSesion`).
 */
export function calcFlujo({ sesiones, porSesion, movsCaja, personas, fueraDeCorte }) {
  const detalle = sesiones.map(s => {
    const v = porSesion.get(s.id) || { efectivo: 0, tarjeta: 0, transferencia: 0, tickets: 0 };
    const movs = movsCaja.filter(m => m.sesion_caja_id === s.id);
    const retiros   = suma(movs.filter(m => m.tipo === 'retiro'),   m => num(m.monto));
    const depositos = suma(movs.filter(m => m.tipo === 'deposito'), m => num(m.monto));
    const fondo     = num(s.fondo_inicial);
    const esperado  = fondo + v.efectivo + depositos - retiros;
    const cerrada   = s.estado === 'cerrada';
    const declarado = cerrada ? num(s.efectivo_declarado) : null;
    return {
      id: s.id,
      nombre: personas.get(s.usuario_id) || s.usuario_nombre || 'Cuenta dada de baja',
      apertura: s.fecha_apertura,
      cerrada, fondo, retiros, depositos,
      ventas: { ef: v.efectivo, tar: v.tarjeta, trans: v.transferencia, n: v.tickets },
      esperado, declarado,
      diferencia: cerrada ? declarado - esperado : null,
    };
  });

  const cerradas = detalle.filter(d => d.cerrada);
  const porEmpleado = {};
  for (const d of cerradas) {
    const e = porEmpleado[d.nombre] ||= {
      nombre: d.nombre, turnos: 0, fondos: 0, ventasEf: 0, ventasTar: 0, ventasTrans: 0,
      retiros: 0, depositos: 0, esperado: 0, declarado: 0,
    };
    e.turnos++;
    e.fondos      += d.fondo;
    e.ventasEf    += d.ventas.ef;
    e.ventasTar   += d.ventas.tar;
    e.ventasTrans += d.ventas.trans;
    e.retiros     += d.retiros;
    e.depositos   += d.depositos;
    e.esperado    += d.esperado;
    e.declarado   += d.declarado;
  }

  return {
    detalle,
    cerradas:     cerradas.length,
    abiertas:     detalle.length - cerradas.length,
    totalFondos:  suma(cerradas, d => d.fondo),
    ventasEf:     suma(cerradas, d => d.ventas.ef),
    esperado:     suma(cerradas, d => d.esperado),
    declarado:    suma(cerradas, d => d.declarado),
    diferencia:   suma(cerradas, d => d.diferencia || 0),
    retiros:      suma(cerradas, d => d.retiros),
    depositos:    suma(cerradas, d => d.depositos),
    conDescuadre: cerradas.filter(d => Math.abs(d.diferencia) >= 1).length,
    porEmpleado:  Object.values(porEmpleado).sort((a, b) => b.esperado - a.esperado),
    fueraDeCorte,
  };
}

/** Comparativo de sucursales (siempre todas, ignora el filtro de arriba). */
export function calcComparativo({ sucursales, porSucursal, stock, catalogo, rutasLiq, salidas }) {
  return sucursales.map(s => {
    const v     = porSucursal.get(s.id) || { total: 0, tickets: 0, piezas: 0 };
    const stk   = stock.filter(x => x.sucursal_id === s.id && catalogo.get(x.producto_id)?.activo !== false);
    const rutaS = rutasLiq.filter(r => r.sucursal_id === s.id);
    const salS  = salidas.filter(m => m.sucursal_id === s.id);
    const sueltas = salS.filter(m => m.piezas <= PZ_SALIDA_SUELTA);
    const grandes = salS.filter(m => m.piezas >  PZ_SALIDA_SUELTA);
    return {
      ...s,
      total: v.total,
      tickets: v.tickets,
      ticketPromedio: v.tickets ? v.total / v.tickets : 0,
      unidadesVendidas: v.piezas,
      rutaDinero: suma(rutaS, r => num(r.dinero_real)),
      rutaLiquidaciones: rutaS.length,
      salidasValor: suma(sueltas, m => m.piezas * m.precio),
      salidasMovs:  sueltas.length,
      correccionesValor: suma(grandes, m => m.piezas * m.precio),
      correccionesMovs:  grandes.length,
      productos:     stk.length,
      unidades:      suma(stk, x => num(x.stock)),
      conExistencia: stk.filter(x => num(x.stock) > 0).length,
      bajos:         stk.filter(x => num(x.stock) > 0 && x.stock <= 5).length,
      enCero:        stk.filter(x => num(x.stock) === 0).length,
      valorInventario: suma(stk, x => num(x.stock) * num(catalogo.get(x.producto_id)?.precio)),
    };
  });
}
