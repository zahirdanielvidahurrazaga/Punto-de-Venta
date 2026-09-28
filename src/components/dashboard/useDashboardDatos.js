import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRealtime } from '../../lib/useRealtime';
import { rangoDe, rejillaDe } from '../../lib/periodos';
import { traerTodo } from '../../lib/paginado';
import { resumenVentas, RESUMEN_VACIO } from '../../lib/ventas';
import {
  calcKpi, calcRuta, calcSalidas, calcCargaCatalogo, calcProductos, calcFlujo, calcComparativo,
} from './calculos';

// ─────────────────────────────────────────────────────────────────────────────
// Datos del Dashboard.
//
// Desde el 27-sep-2026 los NÚMEROS DE VENTAS los calcula la base
// (`resumen_ventas`): totales, serie de la gráfica, por turno, por sucursal y
// por producto. El Dashboard ya no baja miles de ventas ni de partidas para
// sumarlas en el teléfono, y dice lo mismo que Pedidos por construcción.
//
// Lo que NO es venta (turnos, sangrías, ajustes, entradas, rutas) sigue
// viniendo como filas: son pocas. Se cargan en una ventana que solo se
// ensancha y los periodos se cortan en memoria.
// ─────────────────────────────────────────────────────────────────────────────

const clave = (desde, hasta, sucursal, grano) =>
  `${desde ? desde.getTime() : ''}|${hasta ? hasta.getTime() : ''}|${sucursal || ''}|${grano}`;

export function useDashboardDatos({ periodo, sucursalFiltro, subTab }) {
  const sucursal = sucursalFiltro === 'todas' ? null : sucursalFiltro;

  // El "ahora" avanza cada minuto: "Hoy" cambia solo a medianoche y el tope
  // del rango no se congela (bug del 17-sep).
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic(n => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rango = useMemo(() => rangoDe(periodo), [periodo, tic]);

  // ── Catálogos (una vez) ──────────────────────────────────────────────────
  const [sucursales, setSucursales] = useState([]);
  const [catalogo, setCatalogo]     = useState(new Map());
  const [personas, setPersonas]     = useState(new Map());

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      traerTodo(() => supabase.from('productos').select('id, nombre, sku, categoria, precio, activo').order('sku')),
      supabase.from('usuarios_perfiles').select('id, nombre_completo'),
    ]).then(([sucs, prods, users]) => {
      if (!vivo) return;
      setSucursales(sucs.data || []);
      setCatalogo(new Map((prods.filas || []).map(p => [p.id, p])));
      setPersonas(new Map((users.data || []).map(u => [u.id, u.nombre_completo])));
    }).catch(e => console.error('Dashboard: catálogos', e));
    return () => { vivo = false; };
  }, []);

  // ── Resumen de ventas (la base) ──────────────────────────────────────────
  // Se guarda por clave: volver a un periodo ya visto es instantáneo. Cuando
  // entra o se corrige una venta se tira la caché y se pide lo que se ve.
  const cache = useRef(new Map());
  const [resumen, setResumen] = useState({ actual: null, previo: null });
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);

  const pedir = useCallback(async (desde, hasta, suc, grano) => {
    const k = clave(desde, hasta, suc, grano);
    if (!cache.current.has(k)) {
      const p = resumenVentas({ desde, hasta, sucursal: suc, grano });
      cache.current.set(k, p);
      p.catch(() => cache.current.delete(k));
    }
    return cache.current.get(k);
  }, []);

  const d1 = rango.desde.getTime(), p1 = rango.desdePrev.getTime(), p2 = rango.hastaPrev.getTime();

  const cargarResumen = useCallback(async () => {
    setErrorCarga(null);
    try {
      // `hasta` en null para el periodo actual: llega hasta ahora sin congelarlo.
      const [actual, previo] = await Promise.all([
        pedir(new Date(d1), null, sucursal, rango.grano),
        pedir(new Date(p1), new Date(p2), sucursal, rango.grano),
      ]);
      setResumen({ actual, previo });
    } catch (e) {
      console.error('Dashboard: resumen', e);
      setErrorCarga(e.message || 'No se pudieron cargar las ventas.');
    } finally {
      setCargando(false);
    }
  }, [pedir, d1, p1, p2, sucursal, rango.grano]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);

  // Comparativo de sucursales: siempre todas, así que se pide sin filtro.
  const [resumenTodas, setResumenTodas] = useState(null);
  useEffect(() => {
    if (subTab !== 'sucursales') return;
    let vivo = true;
    pedir(new Date(d1), null, null, rango.grano).then(r => vivo && setResumenTodas(r)).catch(() => {});
    return () => { vivo = false; };
  }, [subTab, pedir, d1, rango.grano, resumen]);

  // Últimas ventas del periodo (tabla "Transacciones recientes").
  const [recientes, setRecientes] = useState([]);
  const cargarRecientes = useCallback(async () => {
    let q = supabase.from('ventas')
      .select('id, folio, fecha, total, sesion_caja_id, venta_detalles(cantidad)')
      .neq('estado', 'cancelada')
      .gte('fecha', new Date(d1).toISOString())
      .order('fecha', { ascending: false }).limit(8);
    if (sucursal) q = q.eq('sucursal_id', sucursal);
    const { data } = await q;
    setRecientes(data || []);
  }, [d1, sucursal]);
  useEffect(() => { cargarRecientes(); }, [cargarRecientes]);

  // ── Filas que no son ventas (ventana que solo se ensancha) ───────────────
  const necesitaDesde = Math.min(d1, p1);
  const [filas, setFilas] = useState(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargarFilas = useCallback(async (desdeTs) => {
    setRefrescando(true);
    const desdeISO = new Date(desdeTs).toISOString();
    try {
      const [ajs, ent, ses, mov, rLiq, rVivas] = await Promise.all([
        // Ajustes a la baja, sin joins: precio y nombre salen del catálogo.
        traerTodo(() => supabase.from('movimientos_inventario')
          .select('id, nombre_producto, cantidad, notas, created_at, sucursal_id, producto_id, usuario_id')
          .eq('tipo', 'ajuste').lt('cantidad', 0)
          .gte('created_at', desdeISO).order('created_at', { ascending: false })),
        // Entradas de mercancía (avance de la captura). Lo que regresa por
        // corregir/cancelar un ticket no es captura.
        traerTodo(() => supabase.from('movimientos_inventario')
          .select('id, producto_id, sucursal_id, cantidad, tipo, created_at')
          .gt('cantidad', 0).neq('tipo', 'devolucion_venta')
          .gte('created_at', desdeISO).order('created_at', { ascending: false })),
        traerTodo(() => supabase.from('sesiones_caja').select('*')
          .gte('fecha_apertura', desdeISO).order('fecha_apertura', { ascending: false })),
        traerTodo(() => supabase.from('movimientos_caja').select('sesion_caja_id, tipo, monto')
          .gte('created_at', desdeISO).order('created_at', { ascending: false })),
        traerTodo(() => supabase.from('rutas')
          .select('id, nombre, estado, sucursal_id, fecha_liquidacion, total_lista, dinero_real, descuento_campo, usuario_id')
          .eq('estado', 'liquidado').gte('fecha_liquidacion', desdeISO)
          .order('fecha_liquidacion', { ascending: false })),
        // Las rutas abiertas son un pendiente vivo, no dependen del rango.
        traerTodo(() => supabase.from('rutas').select('id, nombre, estado, sucursal_id, fecha_salida, usuario_id')
          .neq('estado', 'liquidado').order('fecha_salida', { ascending: false })),
      ]);
      const ts = (f) => new Date(f).getTime();
      setFilas({
        desdeTs,
        truncado: ajs.truncado || ent.truncado,
        ajustes: ajs.filas.map(m => ({
          id: m.id, nombre: m.nombre_producto, motivo: m.notas || null,
          piezas: Math.abs(Number(m.cantidad) || 0), producto_id: m.producto_id,
          usuario_id: m.usuario_id, sucursal_id: m.sucursal_id, cuando: m.created_at, ts: ts(m.created_at),
        })),
        entradas: ent.filas.map(e => ({ ...e, ts: ts(e.created_at) })),
        sesiones: ses.filas.map(x => ({ ...x, ts: ts(x.fecha_apertura) })),
        movsCaja: mov.filas,
        rutasLiq: rLiq.filas.map(r => ({ ...r, ts: ts(r.fecha_liquidacion) })),
        rutasVivas: rVivas.filas,
      });
    } catch (e) {
      console.error('Dashboard: filas', e);
      setErrorCarga(e.message || 'No se pudieron cargar los datos.');
    } finally {
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    if (!filas || necesitaDesde < filas.desdeTs) cargarFilas(necesitaDesde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [necesitaDesde]);

  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const cargarCajas = useCallback(async () => {
    // Con el nombre del cajero: antes era select('*') y la tarjeta
    // "Cajas Activas" pintaba un nombre que nunca llegaba.
    const { data, error } = await supabase.from('sesiones_caja')
      .select('*, usuarios_perfiles(nombre_completo)').eq('estado', 'abierta');
    if (!error) setCajasAbiertas(data || []);
  }, []);
  useEffect(() => { cargarCajas(); }, [cargarCajas]);

  const [stock, setStock] = useState([]);
  const cargarStock = useCallback(async () => {
    try {
      const { filas: f } = await traerTodo(() => supabase.from('producto_stock')
        .select('producto_id, sucursal_id, stock').order('producto_id', { ascending: true }));
      setStock(f);
    } catch (e) { console.error('Dashboard: existencias', e); }
  }, []);
  useEffect(() => { cargarStock(); }, [cargarStock]);

  // ── En vivo ──────────────────────────────────────────────────────────────
  const refrescarVentas = useCallback(() => {
    cache.current.clear();
    cargarResumen();
    cargarRecientes();
  }, [cargarResumen, cargarRecientes]);

  const refrescarFilas = useCallback(() => {
    if (filas) cargarFilas(filas.desdeTs);
  }, [filas, cargarFilas]);

  useRealtime('ventas', refrescarVentas, { espera: 2000 });
  // Solo los movimientos que el Dashboard usa: cada venta mete una
  // 'salida_venta' y no tiene caso recargar los ajustes por eso.
  useRealtime([
    { tabla: 'movimientos_inventario', filtro: 'tipo=eq.ajuste' },
    { tabla: 'movimientos_inventario', filtro: 'tipo=eq.entrada' },
    { tabla: 'movimientos_inventario', filtro: 'tipo=eq.inicial' },
    { tabla: 'movimientos_caja' },
  ], refrescarFilas, { espera: 3000 });
  useRealtime('sesiones_caja', () => { cargarCajas(); refrescarFilas(); }, { espera: 3000 });
  useRealtime('producto_stock', cargarStock, { activo: subTab === 'analisis' || subTab === 'sucursales' });

  // ── Modelos para las pestañas ────────────────────────────────────────────
  const actual = resumen.actual || RESUMEN_VACIO;
  const previo = resumen.previo || RESUMEN_VACIO;
  // El periodo actual llega hasta AHORA y no hay filas en el futuro, así que
  // no se acota por arriba (un tope "ahora" se congela y deja fuera lo que
  // entra en vivo; bug del 17-sep).
  const enPeriodo = useCallback((arr) => (arr || []).filter(x => x.ts >= d1), [d1]);
  const porSucursal = useCallback((arr) => (
    sucursal ? arr.filter(x => x.sucursal_id === sucursal) : arr
  ), [sucursal]);

  return useMemo(() => {
    const salidasTodas = enPeriodo(filas?.ajustes).map(m => ({
      ...m,
      precio: Number(catalogo.get(m.producto_id)?.precio || 0),
      quien: personas.get(m.usuario_id) || 'Sin usuario',
    }));
    const rutasLiq = enPeriodo(filas?.rutasLiq);

    return {
      rango, sucursales, catalogo, cajasAbiertas: porSucursal(cajasAbiertas),
      cargando: cargando || !resumen.actual,
      refrescando,
      errorCarga,
      truncado: filas?.truncado || false,
      resumen: actual,
      recientes,
      kpi: calcKpi(actual, previo),
      serie: rejillaDe(rango, actual.porCubeta),
      ruta: calcRuta(porSucursal(rutasLiq), porSucursal(filas?.rutasVivas || [])),
      salidas: calcSalidas(porSucursal(salidasTodas)),
      cargaCatalogo: calcCargaCatalogo({ stock, sucursales, catalogo, entradas: enPeriodo(filas?.entradas) }),
      productos: calcProductos({ porProducto: actual.porProducto, stock, catalogo, sucursalFiltro }),
      flujo: calcFlujo({
        sesiones: porSucursal(enPeriodo(filas?.sesiones)),
        porSesion: actual.porSesion,
        movsCaja: filas?.movsCaja || [],
        personas,
        fueraDeCorte: actual.fueraDeCorte,
      }),
      comparativo: resumenTodas
        ? calcComparativo({ sucursales, porSucursal: resumenTodas.porSucursal, stock, catalogo, rutasLiq, salidas: salidasTodas })
        : null,
    };
  }, [rango, sucursales, catalogo, personas, cajasAbiertas, cargando, refrescando, errorCarga, filas,
      resumen, actual, previo, recientes, stock, sucursalFiltro, resumenTodas, enPeriodo, porSucursal]);
}
