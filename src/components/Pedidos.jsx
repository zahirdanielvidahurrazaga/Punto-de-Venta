import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ClipboardList, Search, Calendar, DollarSign, TrendingUp, Package,
  Banknote, Store, ChevronDown, ChevronRight, Loader2, AlertTriangle, X,
  Ban, PencilLine, History,
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime, pideResync, idsActualizados } from '../lib/useRealtime';
import { traerTodo, MAX_FILAS } from '../lib/paginado';
import { rangoPedidos, toLocal } from '../lib/periodos';
import { normaliza } from '../lib/buscar';
import {
  SELECT_LISTA, mapVentaLista, fusionarVentas, esCancelada,
  partidasDeVenta, historialDeVenta, resumenVentas,
} from '../lib/ventas';
import { resumenProductos, etiquetaDia, difVenta } from '../lib/historial';
import TicketModal from './TicketModal';
import EditarVentaModal from './EditarVentaModal';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de ventas.
//
// Rehecho el 27-sep-2026 porque "no era claro ni intuitivo":
//   · Las ventas van AGRUPADAS POR DÍA, con el total y los tickets de cada día.
//   · Cada renglón dice QUÉ se vendió (nombres de productos), quién cobró, el
//     folio real y si la venta se corrigió o se canceló.
//   · Se busca por folio, producto o monto (antes solo por el id interno).
//   · Al abrir un ticket se ve con su fecha/hora REALES (antes salía la de hoy
//     y un número al azar) y, para el admin, se puede corregir o cancelar.
//
// Carga (sin cambios desde el 22-sep): ventana MAESTRA que solo se ensancha,
// paginada de mil en mil (PostgREST corta en 1000), y los periodos se cortan
// en memoria. Refresco en vivo incremental + ponerse al día al volver del
// segundo plano (en el iPhone la app se queda dormida días).
// ─────────────────────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy'     },
  { key: 'ayer',   label: 'Ayer'    },
  { key: '7dias',  label: '7 días'  },
  { key: '30dias', label: '30 días' },
  { key: 'todas',  label: 'Todas'   },
];

const ESTADOS = [
  { key: 'todas',      label: 'Cualquier estado' },
  { key: 'corregidas', label: 'Corregidas' },
  { key: 'canceladas', label: 'Canceladas' },
];

const POR_PAGINA = 60;

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hora  = (d) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });


// Fuera del componente a propósito: declarados dentro del render, React los
// ve como componentes nuevos en cada render y remonta el subárbol (el bug
// del scroll del carrito, 9-sep-2026).
const Metric = ({ label, value, icon: Icon, nota }) => (
  <div className="neb-card p-4 lg:p-5 flex flex-col">
    <div className="text-slate-400 dark:text-slate-500 mb-2"><Icon className="w-5 h-5" strokeWidth={2} /></div>
    <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</span>
    <p className="text-[22px] lg:text-[24px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none neb-tabular">{value}</p>
    {nota && <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">{nota}</span>}
  </div>
);

const Chips = ({ pagos }) => (
  <span className="inline-flex flex-wrap gap-1">
    {pagos.efectivo      > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
    {pagos.tarjeta       > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
    {pagos.transferencia > 0 && <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300 text-[11px] font-medium">Transf.</span>}
  </span>
);

const EstadoBadge = ({ venta }) => {
  if (venta.estado === 'cancelada') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide"><Ban className="w-3 h-3" /> Cancelada</span>;
  }
  if (venta.ediciones > 0) {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide"><PencilLine className="w-3 h-3" /> Corregida</span>;
  }
  return null;
};

const FilaVenta = ({ venta, onAbrir, abriendo, mostrarSucursal }) => {
  const cancelada = venta.estado === 'cancelada';
  return (
    <button onClick={() => onAbrir(venta)} disabled={abriendo}
      className="w-full text-left px-4 lg:px-5 py-3.5 flex items-center gap-3 lg:gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors disabled:opacity-60">
      <div className="w-14 lg:w-16 shrink-0">
        <p className="font-semibold text-[14px] text-slate-900 dark:text-white neb-tabular">#{venta.folio ?? '—'}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 neb-tabular">{hora(venta.fecha)}</p>
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[13px] text-slate-800 dark:text-slate-200 truncate ${cancelada ? 'line-through opacity-60' : ''}`}>
          {venta.resumen || <span className="text-slate-400">Sin productos</span>}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
          <span className="neb-tabular">{venta.articulos} pz</span>
          {venta.cajero && <><span className="opacity-40">·</span><span className="truncate max-w-[9rem]">{venta.cajero}</span></>}
          {mostrarSucursal && venta.sucursal && <><span className="opacity-40">·</span><span>{venta.sucursal}</span></>}
          <span className="hidden sm:inline"><Chips pagos={venta.pagos} /></span>
          <EstadoBadge venta={venta} />
        </div>
      </div>

      <div className="text-right shrink-0 flex items-center gap-2">
        <div>
          <p className={`font-semibold text-[15px] neb-tabular ${cancelada ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-white'}`}>
            {money(cancelada ? venta.totalOriginal : venta.total)}
          </p>
          <span className="sm:hidden"><Chips pagos={venta.pagos} /></span>
        </div>
        {abriendo
          ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          : <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />}
      </div>
    </button>
  );
};

const HistorialCambios = ({ cambios }) => {
  if (!cambios?.length) return null;
  return (
    <div className="w-full max-w-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5" /> Historial de cambios
      </p>
      <div className="space-y-2">
        {cambios.map(c => (
          <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-[12px]">
            <div className="flex justify-between gap-2">
              <span className={`font-semibold ${c.tipo === 'cancelacion' ? 'text-rose-600' : 'text-amber-700 dark:text-amber-300'}`}>
                {c.tipo === 'cancelacion' ? 'Cancelada' : 'Corregida'}
              </span>
              <span className="text-slate-400 neb-tabular">
                {new Date(c.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-1">“{c.motivo}”</p>
            <p className="text-slate-400 mt-0.5">por {c.usuario_nombre || 'administrador'}</p>
            <ul className="mt-1.5 space-y-0.5 text-slate-600 dark:text-slate-400">
              {difVenta(c.antes, c.despues).map((l, i) => <li key={i}>· {l}</li>)}
              <li className="font-medium text-slate-700 dark:text-slate-300 neb-tabular">
                · Total {money(c.antes?.total)} → {money(c.despues?.total)}
              </li>
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};


export default function Pedidos({ isAdmin, userProfile }) {
  const sucursalPropia = userProfile?.sucursal_id ?? null;
  const [searchTerm, setSearchTerm]         = useState('');
  const [dateFilter, setDateFilter]         = useState('hoy');
  const [customDate, setCustomDate]         = useState('');
  const [sucursales, setSucursales]         = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');
  const [estadoFiltro, setEstadoFiltro]     = useState('todas');
  // Cuántas ventas se pintan. Vuelve a POR_PAGINA al cambiar cualquier
  // filtro (se guarda junto con la firma del filtro al que corresponde).
  const [pagina, setPagina]                 = useState({ firma: '', n: POR_PAGINA });

  // Detalle abierto + edición
  const [abriendo, setAbriendo]   = useState(null);
  const [detalle, setDetalle]     = useState(null);   // { venta, items, cambios }
  const [editando, setEditando]   = useState(null);   // 'editar' | 'cancelar'
  const [avisoOk, setAvisoOk]     = useState(null);

  // Nombres de productos y de quién cobró: se piden una vez, no en cada venta.
  const [nombresProd, setNombresProd] = useState(new Map());
  const [personas, setPersonas]       = useState(new Map());

  useEffect(() => {
    let vivo = true;
    traerTodo(() => supabase.from('productos').select('id, nombre').order('id'))
      .then(({ filas }) => vivo && setNombresProd(new Map(filas.map(p => [p.id, p.nombre]))))
      .catch(() => {});
    supabase.from('usuarios_perfiles').select('id, nombre_completo')
      .then(({ data }) => vivo && setPersonas(new Map((data || []).map(u => [u.id, u.nombre_completo]))));
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => vivo && setSucursales(data || []));
    return () => { vivo = false; };
  }, []);

  const [maestro, setMaestro]   = useState({ desdeTs: null, ventas: [] });
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError]       = useState(null);
  const [truncado, setTruncado] = useState(false);

  // El reloj avanza para que "Hoy" cambie solo al pasar medianoche.
  const [ahoraTs, setAhoraTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhoraTs(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const rango = useMemo(
    () => rangoPedidos(dateFilter, customDate, new Date(ahoraTs)),
    [dateFilter, customDate, ahoraTs]
  );

  // 0 = "desde el principio" (Todas). La ventana nunca se encoge.
  const necesitaTs = rango.desde ? rango.desde.getTime() : 0;

  const alcance = useCallback((q) => {
    // El empleado solo ve su sucursal; el admin ve todo y filtra en la UI.
    if (!isAdmin && sucursalPropia) q = q.eq('sucursal_id', sucursalPropia);
    return q;
  }, [isAdmin, sucursalPropia]);

  const construir = useCallback((desdeISO) => {
    let q = supabase.from('ventas').select(SELECT_LISTA).order('fecha', { ascending: false });
    if (desdeISO) q = q.gte('fecha', desdeISO);
    return alcance(q);
  }, [alcance]);

  const cargarMaestro = useCallback(async (desdeTs) => {
    setCargando(true);
    setError(null);
    try {
      const desdeISO = desdeTs > 0 ? new Date(desdeTs).toISOString() : null;
      const { filas, truncado: tr } = await traerTodo(() => construir(desdeISO));
      setMaestro({ desdeTs, ventas: filas.map(mapVentaLista) });
      setTruncado(tr);
    } catch (e) {
      // Un fallo de permisos o de red NO se ve igual que un día sin ventas.
      console.error('Error cargando pedidos:', e);
      setError(e.message || 'No se pudieron cargar los pedidos.');
      setMaestro({ desdeTs, ventas: [] });
    } finally {
      setCargando(false);
    }
  }, [construir]);

  // Solo se dispara cuando el periodo pide MÁS historia de la que ya hay.
  useEffect(() => {
    if (maestro.desdeTs !== null && necesitaTs >= maestro.desdeTs) return;
    cargarMaestro(necesitaTs);
  }, [necesitaTs, maestro.desdeTs, cargarMaestro]);

  // Refresco en vivo:
  //  · ventas nuevas → solo lo posterior a la más nueva que ya se tiene;
  //  · ventas corregidas/canceladas → esas filas (vienen como UPDATE);
  //  · al volver del segundo plano → lo nuevo + todo lo corregido en la ventana.
  const refrescar = useCallback(async (lote) => {
    if (maestro.desdeTs === null) return;
    setRefrescando(true);
    try {
      const desdeTs = maestro.ventas.length ? maestro.ventas[0].ts : maestro.desdeTs;
      const tareas = [traerTodo(() => construir(new Date(desdeTs).toISOString()))];

      const tocadas = idsActualizados(lote, 'ventas');
      if (tocadas.length) {
        tareas.push(alcance(supabase.from('ventas').select(SELECT_LISTA).in('id', tocadas))
          .then(({ data, error: e }) => { if (e) throw e; return { filas: data || [] }; }));
      } else if (pideResync(lote)) {
        let q = supabase.from('ventas').select(SELECT_LISTA).not('modificada_at', 'is', null);
        if (maestro.desdeTs > 0) q = q.gte('fecha', new Date(maestro.desdeTs).toISOString());
        tareas.push(traerTodo(() => alcance(q.order('fecha', { ascending: false }))));
      }

      const resultados = await Promise.all(tareas);
      const filas = resultados.flatMap(r => r.filas || []);
      if (!filas.length) return;
      setMaestro(prev => ({ ...prev, ventas: fusionarVentas(prev.ventas, filas) }));
    } catch (e) {
      console.error('Error refrescando pedidos:', e);
    } finally {
      setRefrescando(false);
    }
  }, [construir, alcance, maestro.desdeTs, maestro.ventas]);


  const sucursalNombre = useMemo(() => new Map(sucursales.map(s => [s.id, s.nombre])), [sucursales]);

  // Cada venta con sus datos de lectura (resumen de productos, cajero…).
  const ventasPeriodo = useMemo(() => {
    const desde = rango.desde ? rango.desde.getTime() : -Infinity;
    const hasta = rango.hasta ? rango.hasta.getTime() :  Infinity;
    return maestro.ventas
      .filter(v => v.ts >= desde && v.ts < hasta)
      .map(v => ({
        ...v,
        resumen: resumenProductos(v.venta_detalles, nombresProd),
        cajero: personas.get(v.user_id) || v.usuario_nombre || '',
        sucursal: sucursalNombre.get(v.sucursal_id) || '',
      }));
  }, [maestro.ventas, rango.desde, rango.hasta, nombresProd, personas, sucursalNombre]);

  const ventasScope = useMemo(
    () => (sucursalFiltro === 'todas' ? ventasPeriodo : ventasPeriodo.filter(v => v.sucursal_id === sucursalFiltro)),
    [ventasPeriodo, sucursalFiltro]
  );

  const hayCorregidas = ventasScope.some(v => v.ediciones > 0 || v.estado === 'cancelada');

  // Búsqueda: folio (#123 o 123), producto, cajero o monto.
  const filteredVentas = useMemo(() => {
    let lista = ventasScope;
    if (estadoFiltro === 'canceladas') lista = lista.filter(v => v.estado === 'cancelada');
    if (estadoFiltro === 'corregidas') lista = lista.filter(v => v.estado !== 'cancelada' && v.ediciones > 0);

    const term = searchTerm.trim();
    if (!term) return lista;
    const soloNum = term.replace(/^#/, '');
    const esNumero = /^\d+(\.\d{1,2})?$/.test(soloNum);
    const n = normaliza(term);
    return lista.filter(v => {
      if (esNumero) {
        if (String(v.folio) === soloNum) return true;
        if (Math.abs(v.total - Number(soloNum)) < 0.005) return true;
      }
      if (normaliza(v.cajero).includes(n)) return true;
      return (v.venta_detalles || []).some(d => normaliza(nombresProd.get(d.producto_id) || '').includes(n));
    });
  }, [ventasScope, searchTerm, estadoFiltro, nombresProd]);

  const firmaFiltro = [dateFilter, customDate, sucursalFiltro, estadoFiltro, searchTerm].join('|');
  const visibles = pagina.firma === firmaFiltro ? pagina.n : POR_PAGINA;

  // Los TOTALES los calcula la base (`resumen_ventas`), igual que en el
  // Dashboard: el mismo periodo da el mismo número en las dos pantallas por
  // construcción. Con una búsqueda o filtro activo se dice cuántas ventas
  // coinciden, pero el dinero sigue siendo el del periodo.
  const sucursalResumen = !isAdmin ? sucursalPropia : (sucursalFiltro === 'todas' ? null : sucursalFiltro);
  const desdeTs = rango.desde ? rango.desde.getTime() : null;
  const hastaTs = rango.hasta ? rango.hasta.getTime() : null;
  const [resumenBD, setResumenBD] = useState(null);

  const cargarResumen = useCallback(async () => {
    try {
      const r = await resumenVentas({
        desde: desdeTs != null ? new Date(desdeTs) : null,
        hasta: hastaTs != null ? new Date(hastaTs) : null,
        sucursal: sucursalResumen,
        grano: 'dia',
      });
      setResumenBD({ clave: `${desdeTs}|${hastaTs}|${sucursalResumen}`, ...r });
    } catch (e) {
      console.error('Error cargando el resumen:', e);
      setError(e.message || 'No se pudo cargar el resumen.');
    }
  }, [desdeTs, hastaTs, sucursalResumen]);

  useEffect(() => { cargarResumen(); }, [cargarResumen]);
  const resumen = resumenBD?.clave === `${desdeTs}|${hastaTs}|${sucursalResumen}` ? resumenBD : null;

  // En vivo: la lista (incremental) y el resumen (lo recalcula la base).
  useRealtime('ventas', (lote) => { refrescar(lote); cargarResumen(); }, { espera: 1500 });

  // Grupos por día, solo de lo que se va a pintar (con "Ver más").
  const grupos = useMemo(() => {
    const porDia = new Map();
    for (const v of filteredVentas) {
      const k = toLocal(v.fecha);
      if (!porDia.has(k)) porDia.set(k, { clave: k, ventas: [] });
      porDia.get(k).ventas.push(v);
    }
    let quedan = visibles;
    const out = [];
    for (const g of porDia.values()) {
      if (quedan <= 0) break;
      out.push({ ...g, mostrar: g.ventas.slice(0, quedan) });
      quedan -= g.ventas.length;
    }
    return out;
  }, [filteredVentas, visibles]);

  // ── Detalle: partidas + bitácora, se piden solo al abrir ────────────────
  const abrirTicket = async (venta) => {
    setAbriendo(venta.id);
    try {
      const [items, cambios] = await Promise.all([
        partidasDeVenta(venta.id),
        venta.ediciones > 0 || esCancelada(venta) ? historialDeVenta(venta.id) : Promise.resolve([]),
      ]);
      setDetalle({ venta, items, cambios });
    } catch (e) {
      console.error('Error cargando el ticket:', e);
      setError(`No se pudo abrir el ticket #${venta.folio ?? ''}: ${e.message}`);
    } finally {
      setAbriendo(null);
    }
  };

  const alGuardar = async (res) => {
    const venta = detalle?.venta;
    setEditando(null);
    setDetalle(null);
    setAvisoOk(editando === 'cancelar'
      ? `Ticket #${res.folio} cancelado. Devuelve ${money(res.devuelto)} al cliente.`
      : `Ticket #${res.folio} corregido. Total nuevo ${money(res.total)}${res.diferencia ? ` (${res.diferencia > 0 ? '+' : '−'}${money(Math.abs(res.diferencia))})` : ''}.`);
    setTimeout(() => setAvisoOk(null), 6000);
    // No esperar al realtime: la fila se refresca ya.
    if (venta) await refrescar([{ eventType: 'UPDATE', table: 'ventas', new: { id: venta.id } }]);
    cargarResumen();
  };

  // Búsqueda o filtro de estado: la lista muestra un subconjunto (el dinero de
  // las tarjetas sigue siendo el del periodo, que es lo que dice la base).
  const hayFiltro = Boolean(searchTerm) || estadoFiltro !== 'todas';
  const ahora = new Date(ahoraTs);
  const mostrados = grupos.reduce((a, g) => a + g.mostrar.length, 0);

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-4 lg:p-7 max-w-5xl mx-auto space-y-4 lg:space-y-5">

        {/* Header */}
        <div className="pt-2">
          <h1 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">Ventas</h1>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-1.5">
            {isAdmin ? 'Todo lo cobrado, por día. Toca una venta para ver su ticket.' : 'Lo cobrado en tu sucursal. Toca una venta para ver o reimprimir su ticket.'}
          </p>
        </div>

        {avisoOk && (
          <div className="neb-card p-3.5 border-l-4 border-emerald-500 text-[13px] text-emerald-700 dark:text-emerald-300 font-medium">{avisoOk}</div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 overflow-x-auto max-w-full">
            {PERIODOS.map(({ key, label }) => (
              <button key={key} onClick={() => setDateFilter(key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all whitespace-nowrap ${
                  dateFilter === key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <label className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border cursor-pointer ${
            dateFilter === 'custom'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
          }`}>
            <Calendar className="w-3.5 h-3.5" />
            {dateFilter === 'custom' && customDate
              ? new Date(customDate + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
              : 'Otro día'}
            <input type="date" value={customDate}
              onChange={(e) => { setCustomDate(e.target.value); setDateFilter(e.target.value ? 'custom' : 'hoy'); }}
              className="absolute inset-0 opacity-0 cursor-pointer" />
          </label>

          {(cargando || refrescando) && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}

          {isAdmin && sucursales.length > 1 && (
            <div className="relative ml-auto">
              <Store className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              <select value={sucursalFiltro} onChange={e => setSucursalFiltro(e.target.value)}
                className="neb-input w-auto !py-1.5 pl-9 pr-9 text-[12px] font-semibold appearance-none">
                <option value="todas">Todas las sucursales</option>
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Error — ya no se confunde con "no hay ventas" */}
        {error && (
          <div className="neb-card p-4 border-l-4 border-red-500 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-red-600 dark:text-red-400">Algo falló</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{error}</p>
              <button onClick={() => { setError(null); cargarMaestro(necesitaTs); }} className="neb-btn neb-btn-ghost mt-2">Reintentar</button>
            </div>
          </div>
        )}

        {truncado && (
          <div className="neb-card p-4 border-l-4 border-amber-500 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-600 dark:text-slate-400">
              Se cargaron las primeras {MAX_FILAS.toLocaleString('es-MX')} ventas del periodo. Acota el rango para ver el resto.
            </p>
          </div>
        )}

        {/* Métricas (admin) */}
        {isAdmin && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
              <Metric label="Vendido"      value={resumen ? money(resumen.total) : '…'} icon={DollarSign} />
              <Metric label="Tickets"      value={resumen ? resumen.tickets : '…'}     icon={TrendingUp}
                      nota={resumen?.canceladas ? `+ ${resumen.canceladas} cancelada${resumen.canceladas > 1 ? 's' : ''} (no suman)` : null} />
              <Metric label="Ticket prom." value={resumen ? money(resumen.ticketPromedio) : '…'} icon={Banknote} />
              <Metric label="Piezas"       value={resumen ? resumen.piezas.toLocaleString('es-MX') : '…'} icon={Package} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-slate-500 dark:text-slate-400 px-1">
              <span>Efectivo <b className="text-slate-800 dark:text-slate-200 neb-tabular">{money(resumen?.efectivo)}</b></span>
              <span>Tarjeta <b className="text-slate-800 dark:text-slate-200 neb-tabular">{money(resumen?.tarjeta)}</b></span>
              <span>Transferencia <b className="text-slate-800 dark:text-slate-200 neb-tabular">{money(resumen?.transferencia)}</b></span>
            </div>
          </>
        )}

        {isAdmin && hayFiltro && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 px-1 -mt-2">
            Las tarjetas son del periodo completo. {filteredVentas.length} venta{filteredVentas.length === 1 ? '' : 's'} coincide{filteredVentas.length === 1 ? '' : 'n'} con el filtro.
          </p>
        )}

        {/* Buscador + estado */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Buscar folio (#123), producto, cajero o monto…"
              className="neb-input pl-11 pr-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} aria-label="Borrar búsqueda"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {(hayCorregidas || estadoFiltro !== 'todas') && (
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 self-start sm:self-center">
              {ESTADOS.map(({ key, label }) => (
                <button key={key} onClick={() => setEstadoFiltro(key)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap ${
                    estadoFiltro === key ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
                  }`}>{label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Lista por día */}
        <div className="space-y-4">
          {grupos.map(g => {
            const { titulo, sub } = etiquetaDia(g.clave, ahora);
            return (
              <section key={g.clave} className="neb-card overflow-hidden">
                <header className="px-4 lg:px-5 py-3 flex items-baseline justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800">
                  <div className="min-w-0">
                    <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{titulo}</span>
                    {sub && <span className="text-[12px] text-slate-500 dark:text-slate-400 ml-2 first-letter:uppercase">{sub}</span>}
                  </div>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 shrink-0 neb-tabular">
                    {hayFiltro
                      ? `${g.ventas.length} coinciden`
                      : (() => {
                          const dia = resumen?.porCubeta.get(g.clave);
                          const n = dia?.tickets ?? g.ventas.filter(v => !esCancelada(v)).length;
                          return <>{n} venta{n === 1 ? '' : 's'}{isAdmin && dia && <> · <b className="text-slate-800 dark:text-slate-200">{money(dia.total)}</b></>}</>;
                        })()}
                  </span>
                </header>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {g.mostrar.map(v => (
                    <FilaVenta key={v.id} venta={v} onAbrir={abrirTicket}
                      abriendo={abriendo === v.id} mostrarSucursal={isAdmin && sucursalFiltro === 'todas' && sucursales.length > 1} />
                  ))}
                </div>
              </section>
            );
          })}

          {mostrados < filteredVentas.length && (
            <button onClick={() => setPagina({ firma: firmaFiltro, n: visibles + POR_PAGINA * 2 })} className="w-full neb-btn neb-btn-ghost py-3">
              Ver más ventas ({(filteredVentas.length - mostrados).toLocaleString('es-MX')} restantes)
            </button>
          )}

          {/* Vacío — solo cuando de verdad no hay nada y no hubo error */}
          {!cargando && !error && filteredVentas.length === 0 && (
            <div className="neb-card p-10 lg:p-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
              <ClipboardList className="w-12 h-12 opacity-30 mb-3" />
              <p className="font-bold text-base mb-1">
                {hayFiltro ? 'Ninguna venta coincide con el filtro' : 'No se cobró nada en este periodo'}
              </p>
              <p className="text-[12px]">
                {hayFiltro ? 'Quita la búsqueda o cambia el filtro para ver el resto.' : 'Prueba con otro periodo.'}
              </p>
            </div>
          )}

          {cargando && filteredVentas.length === 0 && (
            <div className="neb-card p-10 lg:p-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-[13px]">Cargando ventas…</p>
            </div>
          )}
        </div>

        {/* Cuántas se están viendo: sirve para cacharlo si algo se vuelve a cortar */}
        {!cargando && !error && ventasPeriodo.length > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center pb-4 neb-tabular">
            {filteredVentas.length === ventasPeriodo.length
              ? `${ventasPeriodo.length} ventas en el periodo`
              : `${filteredVentas.length} de ${ventasPeriodo.length} ventas del periodo`}
            {(() => {
              const c = ventasPeriodo.filter(esCancelada).length;
              return c ? ` (incluye ${c} cancelada${c > 1 ? 's' : ''})` : '';
            })()}
          </p>
        )}
      </div>

      {detalle && !editando && (
        <TicketModal
          modo="historial"
          cart={detalle.items}
          total={detalle.venta.total}
          paymentData={detalle.venta.pagos}
          sucursal={{ nombre: detalle.venta.sucursal || sucursalNombre.get(detalle.venta.sucursal_id) || userProfile?.sucursales?.nombre }}
          venta={{
            folio: detalle.venta.folio,
            fecha: detalle.venta.fecha,
            cajero: detalle.venta.cajero,
            estado: detalle.venta.estado,
            ediciones: detalle.venta.ediciones,
          }}
          onClose={() => setDetalle(null)}
          extra={<HistorialCambios cambios={detalle.cambios} />}
          acciones={isAdmin && detalle.venta.estado !== 'cancelada' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setEditando('editar')} className="neb-btn neb-btn-ghost py-3">
                <PencilLine className="w-4 h-4" /> Corregir
              </button>
              <button onClick={() => setEditando('cancelar')} className="neb-btn neb-btn-ghost py-3 !text-rose-600">
                <Ban className="w-4 h-4" /> Cancelar venta
              </button>
            </div>
          )}
        />
      )}

      {detalle && editando && (
        <EditarVentaModal
          modo={editando}
          venta={detalle.venta}
          items={detalle.items}
          onClose={() => setEditando(null)}
          onGuardado={alGuardar}
        />
      )}
    </div>
  );
}
