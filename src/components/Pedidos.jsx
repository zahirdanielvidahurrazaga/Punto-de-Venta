import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ClipboardList, Search, FileText, Calendar, DollarSign, TrendingUp,
  Banknote, CreditCard, Store, ChevronDown, Loader2, AlertTriangle
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from '../lib/useRealtime';
import { traerTodo, MAX_FILAS } from '../lib/paginado';
import { rangoPedidos, toLocal } from '../lib/periodos';
import TicketModal from './TicketModal';

// ─────────────────────────────────────────────────────────────────────────────
// Pedidos pide SUS PROPIOS datos, por rango de fechas y paginados.
//
// Antes recibía por prop la lista que cargaba App.jsx de una sola llamada con
// `.limit(3000)`. Dos problemas, los dos silenciosos:
//
//   1. PostgREST corta en 1000 filas. Con ~40–125 tickets al día, la ventana de
//      45 días trae bastante más que eso, así que llegaban solo las ~1000 más
//      recientes: "30 días" y "Todas" enseñaban un pedazo como si fuera el
//      total, y los cuatro indicadores de arriba se calculaban sobre ese pedazo.
//   2. Esa consulta se traía además `venta_detalles(*, productos(*))` de las
//      1000 ventas, y se repetía ENTERA cada vez que el cajero cobraba (iba
//      colgada a realtime). Las partidas ahora se piden solo al abrir un ticket.
//
// Los periodos se cuentan por DÍA COMPLETO, igual que en el Dashboard, para que
// las dos pantallas digan lo mismo. Antes "7 días" era 7×24 horas hacia atrás
// desde este instante, así que se comía un pedazo del séptimo día.
// ─────────────────────────────────────────────────────────────────────────────

const PERIODOS = [
  { key: 'hoy',    label: 'Hoy'     },
  { key: 'ayer',   label: 'Ayer'    },
  { key: '7dias',  label: '7 días'  },
  { key: '30dias', label: '30 días' },
  { key: 'todas',  label: 'Todas'   },
];

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Fuera del componente a propósito: declarados dentro del render, React los
// ve como componentes nuevos en cada render y remonta el subárbol (el bug
// del scroll del carrito, 9-sep-2026).
const Metric = ({ label, value, icon: Icon }) => (
  <div className="neb-card p-5 flex flex-col">
    <div className="flex items-start justify-between mb-3">
      <div className="text-slate-400 dark:text-slate-500">
        <Icon className="w-5 h-5" strokeWidth={2} />
      </div>
    </div>
    <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</span>
    <p className="text-[24px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none neb-tabular">{value}</p>
  </div>
);

const Metodo = ({ color, label, value }) => (
  <div className="flex items-center gap-2.5">
    <div className={`w-2 h-2 rounded-full ${color}`} />
    <span className="text-slate-500 dark:text-slate-400 text-[13px]">{label}</span>
    <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{money(value)}</span>
  </div>
);

const Chips = ({ pagos }) => (
  <div className="flex flex-wrap gap-1.5">
    {pagos.efectivo      > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
    {pagos.tarjeta       > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
    {pagos.transferencia > 0 && <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[11px] font-medium">Transf.</span>}
  </div>
);


export default function Pedidos({ isAdmin, userProfile }) {
  const sucursalPropia = userProfile?.sucursal_id ?? null;
  const [searchTerm, setSearchTerm]         = useState('');
  const [selectedVenta, setSelectedVenta]   = useState(null);
  const [cargandoTicket, setCargandoTicket] = useState(null);
  const [dateFilter, setDateFilter]         = useState('hoy');
  const [customDate, setCustomDate]         = useState('');
  const [sucursales, setSucursales]         = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, [isAdmin]);

  // Ventana MAESTRA: una sola carga que solo se ensancha. Los cinco periodos
  // son subconjuntos de la misma consulta, así que cambiar de periodo corta en
  // memoria y no pide nada. Antes cada clic relanzaba la consulta paginada
  // completa (1,665 ventas = 2 viajes al servidor) y por eso "tardaba al
  // cambiar de día". Misma solución que el Dashboard el 17-sep.
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

  const construir = useCallback((desdeISO) => {
    // Sin `productos(*)`: para la lista solo hace falta contar piezas.
    let q = supabase
      .from('ventas')
      .select('id, fecha, total, pago_efectivo, pago_tarjeta, pago_transferencia, sucursal_id, venta_detalles(cantidad)')
      .order('fecha', { ascending: false });
    if (desdeISO) q = q.gte('fecha', desdeISO);
    // El empleado solo ve su sucursal; el admin ve todo y filtra en la UI.
    if (!isAdmin && sucursalPropia) q = q.eq('sucursal_id', sucursalPropia);
    return q;
  }, [isAdmin, sucursalPropia]);

  const mapear = (v) => ({
    ...v,
    ts: new Date(v.fecha).getTime(),
    articulos: (v.venta_detalles || []).reduce((acc, d) => acc + (Number(d.cantidad) || 0), 0),
    pagos: {
      efectivo:      Number(v.pago_efectivo)      || 0,
      tarjeta:       Number(v.pago_tarjeta)       || 0,
      transferencia: Number(v.pago_transferencia) || 0,
    },
  });

  const cargarMaestro = useCallback(async (desdeTs) => {
    setCargando(true);
    setError(null);
    try {
      const desdeISO = desdeTs > 0 ? new Date(desdeTs).toISOString() : null;
      const { filas, truncado: tr } = await traerTodo(() => construir(desdeISO));
      setMaestro({ desdeTs, ventas: filas.map(mapear) });
      setTruncado(tr);
    } catch (e) {
      // Antes esto solo iba a la consola y la pantalla decía "Sin pedidos en
      // este periodo": un fallo de permisos o de red se veía idéntico a un día
      // sin ventas. Mismo hueco que tenía Reportes.
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

  // Refresco en vivo INCREMENTAL: solo lo posterior a la venta más nueva que ya
  // se tiene, fusionado por id. Recargar las 1,665 en cada cobro no tenía
  // sentido (la lista viene ordenada desc, así que la más nueva es la [0]).
  const refrescar = useCallback(async () => {
    if (maestro.desdeTs === null) return;
    setRefrescando(true);
    try {
      const desdeTs = maestro.ventas.length ? maestro.ventas[0].ts : maestro.desdeTs;
      const { filas } = await traerTodo(() => construir(new Date(desdeTs).toISOString()));
      if (!filas.length) return;
      setMaestro(prev => {
        const porId = new Map(prev.ventas.map(v => [v.id, v]));
        for (const f of filas) porId.set(f.id, mapear(f));
        return { ...prev, ventas: [...porId.values()].sort((a, b) => b.ts - a.ts) };
      });
    } catch (e) {
      console.error('Error refrescando pedidos:', e);
    } finally {
      setRefrescando(false);
    }
  }, [construir, maestro.desdeTs, maestro.ventas]);

  useRealtime('ventas', refrescar, { espera: 3000 });

  // El corte del periodo se hace EN MEMORIA: 0 consultas al cambiar de botón.
  const ventas = useMemo(() => {
    const desde = rango.desde ? rango.desde.getTime() : -Infinity;
    const hasta = rango.hasta ? rango.hasta.getTime() :  Infinity;
    return maestro.ventas.filter(v => v.ts >= desde && v.ts < hasta);
  }, [maestro.ventas, rango.desde, rango.hasta]);

  // ── Ticket: las partidas se piden solo al abrirlo ────────────────────────
  const abrirTicket = async (venta) => {
    setCargandoTicket(venta.id);
    try {
      const { data, error: e } = await supabase
        .from('venta_detalles')
        .select('cantidad, precio_unitario, productos (*)')
        .eq('venta_id', venta.id);
      if (e) throw e;

      const items = (data || []).map(d => ({
        ...d.productos,
        quantity: d.cantidad,
        precio_unitario: d.precio_unitario,
        precio: Number(d.precio_unitario),
      }));
      setSelectedVenta({ ...venta, items });
    } catch (e) {
      console.error('Error cargando el ticket:', e);
      setError(`No se pudo abrir el ticket #${String(venta.id).padStart(4, '0').slice(0, 8)}: ${e.message}`);
    } finally {
      setCargandoTicket(null);
    }
  };

  // ── Filtros en memoria ───────────────────────────────────────────────────
  const ventasScope = useMemo(
    () => (sucursalFiltro === 'todas' ? ventas : ventas.filter(v => v.sucursal_id === sucursalFiltro)),
    [ventas, sucursalFiltro]
  );

  const filteredVentas = useMemo(() => {
    if (!searchTerm) return ventasScope;
    const term = searchTerm.toLowerCase();
    return ventasScope.filter(v =>
      v.id?.toString().toLowerCase().includes(term) ||
      new Date(v.fecha).toLocaleDateString().includes(term) ||
      toLocal(v.fecha).includes(term)
    );
  }, [ventasScope, searchTerm]);

  // Los indicadores se calculan sobre LO QUE SE VE. Antes ignoraban el
  // buscador, así que al buscar un ticket las tarjetas seguían mostrando el
  // total del periodo y no cuadraban con la lista de abajo.
  const resumen = useMemo(() => {
    const total = filteredVentas.reduce((a, v) => a + Number(v.total), 0);
    return {
      total,
      pedidos:       filteredVentas.length,
      promedio:      filteredVentas.length ? total / filteredVentas.length : 0,
      efectivo:      filteredVentas.reduce((a, v) => a + v.pagos.efectivo, 0),
      tarjeta:       filteredVentas.reduce((a, v) => a + v.pagos.tarjeta, 0),
      transferencia: filteredVentas.reduce((a, v) => a + v.pagos.transferencia, 0),
    };
  }, [filteredVentas]);

  const formatDate = (d) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (d) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="pt-2 pb-2">
          <h1 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Pedidos realizados
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2">
            {isAdmin ? 'Historial completo y métricas financieras' : 'Historial de ventas de tu sesión'}
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Periodo
          </span>
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
            {PERIODOS.map(({ key, label }) => (
              <button key={key} onClick={() => setDateFilter(key)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  dateFilter === key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <input type="date" value={customDate}
            onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
              dateFilter === 'custom'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
            }`} />

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

        {/* Error — ya no se confunde con "no hay pedidos" */}
        {error && (
          <div className="neb-card p-4 border-l-4 border-red-500 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-semibold text-red-600 dark:text-red-400">No se pudieron cargar los pedidos</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{error}</p>
              <button onClick={() => cargarMaestro(necesitaTs)} className="neb-btn neb-btn-ghost mt-2">Reintentar</button>
            </div>
          </div>
        )}

        {truncado && (
          <div className="neb-card p-4 border-l-4 border-amber-500 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-slate-600 dark:text-slate-400">
              Se cargaron los primeros {MAX_FILAS.toLocaleString('es-MX')} pedidos del periodo.
              Acota el rango para ver el resto.
            </p>
          </div>
        )}

        {/* Métricas */}
        {isAdmin && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Metric label="Ventas"       value={money(resumen.total)}    icon={DollarSign} />
              <Metric label="Pedidos"      value={resumen.pedidos}         icon={TrendingUp} />
              <Metric label="Ticket prom." value={money(resumen.promedio)} icon={Banknote} />
              <Metric label="Tarjeta"      value={money(resumen.tarjeta)}  icon={CreditCard} />
            </div>

            <div className="neb-card p-4 flex flex-wrap gap-x-8 gap-y-3">
              <Metodo color="bg-slate-800"  label="Efectivo"      value={resumen.efectivo} />
              <Metodo color="bg-blue-500"   label="Tarjeta"       value={resumen.tarjeta} />
              <Metodo color="bg-violet-400" label="Transferencia" value={resumen.transferencia} />
              {searchTerm && (
                <span className="text-[12px] text-slate-400 dark:text-slate-500 self-center">
                  (solo los {filteredVentas.length} pedidos que coinciden con la búsqueda)
                </span>
              )}
            </div>
          </>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por #Ticket o Fecha..."
            className="neb-input pl-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Lista */}
        <div className="neb-card overflow-hidden">

          {/* Mobile */}
          <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredVentas.map((venta) => (
              <div key={venta.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white text-base neb-tabular">#{String(venta.id).padStart(4,'0').slice(0,8)}</span>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 neb-tabular">
                      <Calendar className="w-3 h-3" />
                      {formatDate(venta.fecha)} · {formatTime(venta.fecha)}
                    </div>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-base neb-tabular">{money(Number(venta.total))}</span>
                </div>

                <div className="flex items-center justify-between">
                  <Chips pagos={venta.pagos} />
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 neb-tabular">{venta.articulos} pzas</span>
                </div>

                <button onClick={() => abrirTicket(venta)} disabled={cargandoTicket === venta.id}
                  className="w-full neb-btn neb-btn-ghost mt-1 disabled:opacity-50">
                  {cargandoTicket === venta.id
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Abriendo…</>
                    : <><FileText className="w-3.5 h-3.5" /> Ver ticket</>}
                </button>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto neb-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-[0.12em]">
                  <th className="p-4 font-medium">Ticket</th>
                  <th className="p-4 font-medium">Fecha</th>
                  <th className="p-4 font-medium">Hora</th>
                  <th className="p-4 font-medium text-center">Artículos</th>
                  <th className="p-4 font-medium">Método</th>
                  <th className="p-4 font-medium text-right">Total</th>
                  <th className="p-4 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredVentas.map((venta) => (
                  <tr key={venta.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-mono font-semibold text-slate-900 dark:text-white text-sm neb-tabular">#{String(venta.id).padStart(4,'0').slice(0,8)}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-[13px]">{formatDate(venta.fecha)}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[12px] font-mono neb-tabular">{formatTime(venta.fecha)}</td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium neb-tabular">
                        {venta.articulos}
                      </span>
                    </td>
                    <td className="p-4"><Chips pagos={venta.pagos} /></td>
                    <td className="p-4 text-right font-semibold text-slate-900 dark:text-white text-[14px] neb-tabular">
                      {money(Number(venta.total))}
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => abrirTicket(venta)} disabled={cargandoTicket === venta.id}
                        className="px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50">
                        {cargandoTicket === venta.id
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Abriendo…</>
                          : <><FileText className="w-3.5 h-3.5" /> Ticket</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vacío — solo cuando de verdad no hay nada y no hubo error */}
          {!cargando && !error && filteredVentas.length === 0 && (
            <div className="p-8 lg:p-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
              <ClipboardList className="w-12 h-12 opacity-30 mb-3" />
              <p className="font-bold text-base mb-1">
                {searchTerm || (isAdmin && sucursalFiltro !== 'todas')
                  ? 'Ningún pedido coincide con el filtro'
                  : 'No se cobró nada en este periodo'}
              </p>
              <p className="text-[12px]">
                {searchTerm || (isAdmin && sucursalFiltro !== 'todas')
                  ? 'Quita la búsqueda o cambia de sucursal para ver el resto.'
                  : 'Prueba con otro periodo.'}
              </p>
            </div>
          )}

          {cargando && filteredVentas.length === 0 && (
            <div className="p-8 lg:p-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-[13px]">Cargando pedidos…</p>
            </div>
          )}
        </div>

        {/* Cuántos se están viendo: sirve para cacharlo si algo se vuelve a cortar */}
        {!cargando && !error && ventas.length > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center pb-2 neb-tabular">
            {filteredVentas.length === ventas.length
              ? `${ventas.length} pedidos en el periodo`
              : `${filteredVentas.length} de ${ventas.length} pedidos del periodo`}
          </p>
        )}

      </div>

      {selectedVenta && (
        <TicketModal
          cart={selectedVenta.items}
          total={Number(selectedVenta.total)}
          paymentData={selectedVenta.pagos}
          onClose={() => setSelectedVenta(null)}
        />
      )}
    </div>
  );
}
