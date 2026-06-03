import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, CreditCard, Banknote,
  Building2, Wallet, BarChart3, ShoppingBag, ArrowUpRight,
  CheckCircle, Loader2, Filter, Sparkles, Store, ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SUB_TABS = [
  { key: 'resumen',    label: 'Resumen'       },
  { key: 'analisis',   label: 'Análisis'      },
  { key: 'flujo',      label: 'Flujo de Caja' },
  { key: 'sucursales', label: 'Sucursales'    },
];

const PERIODS = [
  { key: '7d', label: '7 días'   },
  { key: '4w', label: '4 semanas' },
  { key: '6m', label: '6 meses'  },
];

const toLocal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};
const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;



// ─── KPI Card — minimalist Apple style ─────────────
function KpiCard({ label, value, icon: Icon, delta, deltaType }) {
  const deltaColor =
    deltaType === 'positive' ? 'text-emerald-600 bg-emerald-50' :
    deltaType === 'negative' ? 'text-rose-600 bg-rose-50' :
    deltaType === 'warning'  ? 'text-amber-600 bg-amber-50' :
    'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50';

  const DeltaIcon =
    deltaType === 'positive' ? TrendingUp :
    deltaType === 'negative' ? TrendingDown :
    null;

  return (
    <div className="neb-card p-5 flex flex-col relative">
      <div className="flex items-start justify-between mb-4">
        <div className="text-slate-400 dark:text-slate-500">
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${deltaColor}`}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" strokeWidth={2.5} />}
            {delta}
          </span>
        )}
      </div>
      <div className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</div>
      <div className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
        {value}
      </div>
    </div>
  );
}

// ─── Hero del Dashboard — Apple style ───────────────────────────
function DashboardHero({ userName }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Buenos días'   :
    hour < 19 ? 'Buenas tardes' :
                'Buenas noches';

  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div className="pt-6 pb-8 border-b border-slate-200 dark:border-slate-800">
      <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{dateStr}</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {greeting}, {userName.split(' ')[0]}.
      </h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">
        Aquí está el panorama de tu operación.
      </p>
    </div>
  );
}

function RankingList({ items, valueKey, valueLabel }) {
  if (!items.length)
    return <p className="text-slate-400 dark:text-slate-500 text-sm py-6 text-center">Sin datos de ventas.</p>;

  const maxVal = Math.max(...items.map(p => p[valueKey]), 1);

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[11px] font-medium shrink-0 neb-tabular">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{p.nombre}</p>
              <p className="font-semibold text-slate-900 dark:text-white text-sm ml-2 shrink-0 neb-tabular">{valueLabel(p)}</p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-800 transition-all duration-700"
                style={{ width: `${(p[valueKey] / maxVal) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono">{p.sku} · {p.categoria}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryBreakdown({ ventas }) {
  const cats = useMemo(() => {
    const map = {};
    ventas.forEach(v => {
      (v.items || []).forEach(item => {
        const c = item?.categoria || 'Sin categoría';
        if (!map[c]) map[c] = { cat: c, ingresos: 0, unidades: 0 };
        map[c].ingresos  += (item.quantity || 0) * Number(item.precio || 0);
        map[c].unidades  += item.quantity || 0;
      });
    });
    return Object.values(map).sort((a, b) => b.ingresos - a.ingresos);
  }, [ventas]);

  if (!cats.length) return null;

  const paleta = ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#c2dffe', '#e0efff'];

  return (
    <div className="neb-card p-5 lg:p-6">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Ingresos por Categoría</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Distribución del cobro</p>
      </div>
      <div className="space-y-4">
        {cats.map((c, i) => (
          <div key={c.cat} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: paleta[i % paleta.length] }} />
            <div className="flex-1">
              <div className="flex justify-between mb-1.5">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{c.cat}</span>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.ingresos)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.ingresos / (cats[0]?.ingresos || 1)) * 100}%`, background: paleta[i % paleta.length] }}
                />
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 inline-block neb-tabular">{c.unidades} unidades</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ ventas: ventasProp = [], userName = 'Admin' }) {
  const [subTab, setSubTab] = useState('resumen');
  const [chartPeriod, setChartPeriod] = useState('7d');
  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const [sesiones30d, setSesiones30d] = useState([]);
  const [todosProductos, setTodosProductos] = useState([]);
  const [loadingFlujo, setLoadingFlujo] = useState(false);
  const [loadingAnalisis, setLoadingAnalisis] = useState(false);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');
  const [resumenSucursales, setResumenSucursales] = useState([]);

  // Ventas filtradas por sucursal (alimenta KPIs, gráficas, rankings, pagos, categorías)
  const ventas = useMemo(() => (
    sucursalFiltro === 'todas'
      ? ventasProp
      : ventasProp.filter(v => v.sucursal_id === sucursalFiltro)
  ), [ventasProp, sucursalFiltro]);

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => { fetchCajasAbiertas(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sucursalFiltro]);

  useEffect(() => {
    fetchSesiones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, sucursalFiltro]);

  useEffect(() => {
    if (subTab === 'analisis' && todosProductos.length === 0) fetchTodosProductos();
    if (subTab === 'sucursales') fetchResumenSucursales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab]);

  const fetchResumenSucursales = async () => {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const [sucsRes, stockRes, ventasRes] = await Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('producto_stock').select('sucursal_id, stock, productos(precio)'),
      supabase.from('ventas').select('sucursal_id, total, venta_detalles(cantidad)').gte('fecha', hace30.toISOString()),
    ]);
    const sucs = sucsRes.data || [];
    const stocks = stockRes.data || [];
    const ventas = ventasRes.data || [];

    const resumen = sucs.map(s => {
      const filas = stocks.filter(x => x.sucursal_id === s.id);
      const ventasS = ventas.filter(v => v.sucursal_id === s.id);
      const ventaTotal = ventasS.reduce((a, v) => a + Number(v.total || 0), 0);
      const tickets = ventasS.length;
      const unidadesVendidas = ventasS.reduce(
        (a, v) => a + (v.venta_detalles || []).reduce((b, d) => b + Number(d.cantidad || 0), 0), 0);
      return {
        ...s,
        productos: filas.length,
        unidades: filas.reduce((a, x) => a + (x.stock || 0), 0),
        bajos: filas.filter(x => x.stock <= 5).length,
        valorInventario: filas.reduce((a, x) => a + (x.stock || 0) * Number(x.productos?.precio || 0), 0),
        ventaTotal,
        tickets,
        ticketPromedio: tickets > 0 ? ventaTotal / tickets : 0,
        unidadesVendidas,
      };
    });
    setResumenSucursales(resumen);
  };

  const fetchCajasAbiertas = async () => {
    try {
      let q = supabase
        .from('sesiones_caja')
        .select('*, usuarios_perfiles(nombre_completo)')
        .eq('estado', 'abierta');
      if (sucursalFiltro !== 'todas') q = q.eq('sucursal_id', sucursalFiltro);
      const { data } = await q;
      setCajasAbiertas(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchSesiones = async () => {
    if (subTab !== 'flujo') return;
    setLoadingFlujo(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      let q = supabase
        .from('sesiones_caja')
        .select('*, usuarios_perfiles(nombre_completo)')
        .gte('fecha_apertura', since.toISOString());
      if (sucursalFiltro !== 'todas') q = q.eq('sucursal_id', sucursalFiltro);
      const { data } = await q.order('fecha_apertura', { ascending: false });
      setSesiones30d(data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingFlujo(false); }
  };

  const fetchTodosProductos = async () => {
    setLoadingAnalisis(true);
    try {
      const { data } = await supabase
        .from('productos')
        .select('id, nombre, sku, categoria, stock')
        .order('nombre');
      setTodosProductos(data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingAnalisis(false); }
  };

  // KPIs
  const totalSales  = ventas.reduce((a, v) => a + Number(v.total), 0);
  const totalOrders = ventas.length;
  const avgTicket   = totalOrders > 0 ? totalSales / totalOrders : 0;
  const ef    = ventas.reduce((a, v) => a + Number(v.pagos?.efectivo       || 0), 0);
  const tar   = ventas.reduce((a, v) => a + Number(v.pagos?.tarjeta        || 0), 0);
  const trans = ventas.reduce((a, v) => a + Number(v.pagos?.transferencia  || 0), 0);

  // Chart data
  const chartData = useMemo(() => {
    if (chartPeriod === '7d') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const date = toLocal(d);
        const rows = ventas.filter(v => v.fecha && toLocal(v.fecha) === date);
        return {
          label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
          sum: rows.reduce((a, v) => a + Number(v.total), 0),
          count: rows.length,
        };
      });
    }
    if (chartPeriod === '4w') {
      return Array.from({ length: 4 }, (_, i) => {
        const wEnd = new Date(); wEnd.setDate(wEnd.getDate() - i * 7);
        const wStart = new Date(wEnd); wStart.setDate(wEnd.getDate() - 6);
        const rows = ventas.filter(v => {
          if (!v.fecha) return false;
          const d = new Date(v.fecha);
          return d >= wStart && d <= wEnd;
        });
        return {
          label: `${wStart.getDate()}/${wStart.getMonth()+1}`,
          sum: rows.reduce((a, v) => a + Number(v.total), 0),
          count: rows.length,
        };
      }).reverse();
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const y = d.getFullYear(), m = d.getMonth();
      const rows = ventas.filter(v => {
        if (!v.fecha) return false;
        const vd = new Date(v.fecha);
        return vd.getFullYear() === y && vd.getMonth() === m;
      });
      return {
        label: d.toLocaleDateString('es-MX', { month: 'short' }),
        sum: rows.reduce((a, v) => a + Number(v.total), 0),
        count: rows.length,
      };
    });
  }, [ventas, chartPeriod]);

  const maxChart = Math.max(...chartData.map(d => d.sum), 1);

  // Rankings
  const { top5Units, top5Revenue, bottom5, sinMovimiento } = useMemo(() => {
    const map = {};
    ventas.forEach(v => {
      (v.items || []).forEach(item => {
        if (!item?.id) return;
        if (!map[item.id]) map[item.id] = {
          id: item.id, nombre: item.nombre, sku: item.sku,
          categoria: item.categoria, unidades: 0, ingresos: 0,
        };
        map[item.id].unidades += item.quantity || 0;
        map[item.id].ingresos += (item.quantity || 0) * Number(item.precio || 0);
      });
    });
    const arr = Object.values(map);
    const byU = [...arr].sort((a, b) => b.unidades - a.unidades);
    const soldIds = new Set(arr.map(p => p.id));
    const sinMov  = todosProductos.filter(p => !soldIds.has(p.id));
    return {
      top5Units:    byU.slice(0, 5),
      top5Revenue:  [...arr].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5),
      bottom5:      byU.filter(p => p.unidades > 0).slice(-5).reverse(),
      sinMovimiento: sinMov,
    };
  }, [ventas, todosProductos]);

  // Flujo
  const flujo = useMemo(() => {
    const cerradas = sesiones30d.filter(s => s.estado === 'cerrada');
    const porEmp = {};
    cerradas.forEach(s => {
      const nombre = s.usuarios_perfiles?.nombre_completo || 'Desconocido';
      if (!porEmp[nombre]) porEmp[nombre] = { nombre, sesiones: 0, fondos: 0, efectivo: 0, tarjeta: 0, transf: 0 };
      porEmp[nombre].sesiones++;
      porEmp[nombre].fondos   += Number(s.fondo_inicial        || 0);
      porEmp[nombre].efectivo += Number(s.efectivo_declarado   || 0);
      porEmp[nombre].tarjeta  += Number(s.tarjeta_declarado    || 0);
      porEmp[nombre].transf   += Number(s.transferencia_declarado || 0);
    });
    return {
      cerradas:       cerradas.length,
      abiertas:       sesiones30d.filter(s => s.estado === 'abierta').length,
      totalFondos:    cerradas.reduce((a, s) => a + Number(s.fondo_inicial || 0), 0),
      totalEfectivo:  cerradas.reduce((a, s) => a + Number(s.efectivo_declarado || 0), 0),
      totalTarjeta:   cerradas.reduce((a, s) => a + Number(s.tarjeta_declarado || 0), 0),
      totalTransf:    cerradas.reduce((a, s) => a + Number(s.transferencia_declarado || 0), 0),
      porEmpleado:    Object.values(porEmp),
    };
  }, [sesiones30d]);

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-4 lg:p-7 max-w-7xl mx-auto space-y-6">

        {/* Hero Apple style */}
        <DashboardHero userName={userName} />

        {/* Sub-tabs + filtro de sucursal */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
            {SUB_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setSubTab(t.key)}
                className={`px-5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                  subTab === t.key
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {sucursales.length > 1 && (
            <div className="relative">
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

        {/* ══════════════════ RESUMEN ══════════════════ */}
        {subTab === 'resumen' && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard index={0} label="Ventas Totales"  value={fmt(totalSales)}  icon={DollarSign}  delta="+12.5%" deltaType="positive" />
              <KpiCard index={1} label="Órdenes"         value={totalOrders}      icon={ShoppingBag} delta="+4.2%"  deltaType="positive" />
              <KpiCard index={2} label="Ticket Promedio" value={fmt(avgTicket)}   icon={TrendingUp}  delta="-1.8%"  deltaType="negative" />
              <KpiCard index={3} label="Efectivo"        value={fmt(ef)}          icon={Banknote}    delta="+0.5%"  deltaType="warning" />
            </div>

            {/* Gráfico + Cajas activas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Bar chart — Apple style */}
              <div className="neb-card p-5 lg:p-6 lg:col-span-2 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Ventas Comparativas</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 neb-tabular">
                      {fmt(chartData.reduce((a,d) => a + d.sum, 0))}
                      <span className="text-slate-300 mx-1.5">·</span>
                      promedio {fmt(chartData.reduce((a,d) => a + d.sum, 0) / Math.max(1, chartData.filter(d=>d.sum>0).length))}
                    </p>
                  </div>
                  <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
                    {PERIODS.map(p => (
                      <button
                        key={p.key}
                        onClick={() => setChartPeriod(p.key)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-full transition-all ${
                          chartPeriod === p.key
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart container Apple style */}
                <div className="flex items-end justify-between gap-2 mt-6 h-48 border-b border-slate-100 dark:border-slate-800 pb-2">
                  {chartData.map((d, i) => {
                    const pct = maxChart > 0 ? Math.round((d.sum / maxChart) * 100) : 0;
                    const finalH = d.sum > 0 ? Math.max(pct, 4) : 0;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group" style={{ height: '100%', justifyContent: 'flex-end' }}>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {d.sum >= 1000 ? `${(d.sum/1000).toFixed(1)}k` : d.sum.toFixed(0)}
                        </div>
                        <div
                          className={`w-full max-w-[32px] rounded-t-md transition-all ${d.sum > 0 ? 'bg-slate-800' : 'bg-slate-100 dark:bg-slate-800'}`}
                          style={{ height: `${finalH}%` }}
                        />
                        <div className="mt-2 text-[11px] font-medium text-slate-400 dark:text-slate-500 capitalize">{d.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cajas activas — Apple style */}
              <div className="neb-card p-5 lg:p-6 flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Cajas Activas</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Operadores en turno</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">
                    {cajasAbiertas.length}
                  </span>
                </div>
                <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto neb-scroll">
                  {cajasAbiertas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-sm text-center">
                      <AlertTriangle className="w-7 h-7 mb-2 opacity-30" />
                      Sin cajas abiertas
                    </div>
                  ) : cajasAbiertas.map(c => (
                    <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center font-medium text-sm shrink-0">
                        {(c.usuarios_perfiles?.nombre_completo || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white text-[13px] truncate">{c.usuarios_perfiles?.nombre_completo}</p>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 neb-tabular">
                          {new Date(c.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.fondo_inicial)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Métodos de pago — líneas limpias Apple */}
            <div className="neb-card p-5 lg:p-6">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">Distribución por Método de Pago</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-6">Composición del cobro en el periodo cargado</p>
              <div className="space-y-5">
                {[
                  { label: 'Efectivo',      val: ef,    color: '#0f172a' },
                  { label: 'Tarjeta',       val: tar,   color: '#3b82f6' },
                  { label: 'Transferencia', val: trans, color: '#a78bfa' },
                ].map(m => {
                  const pct = totalSales > 0 ? (m.val / totalSales) * 100 : 0;
                  return (
                    <div key={m.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                      </div>
                      <div className="text-right neb-tabular">
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{fmt(m.val)}</span>
                        <span className="text-[12px] text-slate-400 dark:text-slate-500 ml-2">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="col-span-2 w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${pct}%`, background: m.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Transactions — Apple style */}
            <div className="neb-card p-5 lg:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Transacciones Recientes</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Últimas operaciones del periodo</p>
                </div>
                <button className="text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white transition-colors inline-flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5" /> Filtrar
                </button>
              </div>
              <div className="overflow-x-auto neb-scroll">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-3 pt-1 font-medium text-left px-3">Folio</th>
                      <th className="pb-3 pt-1 font-medium text-left px-3">Fecha</th>
                      <th className="pb-3 pt-1 font-medium text-left px-3">Estado</th>
                      <th className="pb-3 pt-1 font-medium text-right px-3">Items</th>
                      <th className="pb-3 pt-1 font-medium text-right px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ventas.slice(0, 6).map((v) => {
                      const folio = String(v.id).padStart(4,'0').slice(0,8);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 transition-colors group">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-medium text-[11px] shrink-0">
                                {folio.slice(-2)}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">#{folio}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {v.fecha ? new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-medium">
                              Completada
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{(v.items || []).length}</td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-900 dark:text-white text-[14px] whitespace-nowrap">
                            {fmt(v.total)}
                          </td>
                        </tr>
                      );
                    })}
                    {ventas.length === 0 && (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        Aún no hay transacciones cargadas.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════ ANÁLISIS ══════════════════ */}
        {subTab === 'analisis' && (
          loadingAnalisis ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 Más Vendidos</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Por unidades</p>
                  </div>
                  <RankingList items={top5Units} valueKey="unidades" valueLabel={(p) => `${p.unidades} uds`} />
                </div>
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 por Ingresos</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Mayor facturación</p>
                  </div>
                  <RankingList items={top5Revenue} valueKey="ingresos" valueLabel={(p) => fmt(p.ingresos)} />
                </div>
              </div>

              <div className="neb-card p-5 lg:p-6">
                <div className="mb-5">
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Menor Movimiento</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Productos con bajas ventas</p>
                </div>
                {bottom5.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">Sin suficientes datos.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {bottom5.map((p) => (
                      <div key={p.id} className="rounded-xl p-4 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm line-clamp-2 leading-tight mb-2">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-2">{p.sku}</p>
                        <p className="font-semibold text-slate-900 dark:text-white neb-tabular">{p.unidades} uds</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 neb-tabular">{fmt(p.ingresos)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {sinMovimiento.length > 0 && (
                <div className="neb-card p-5 lg:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Sin Ventas Registradas</h2>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Productos sin movimiento</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">{sinMovimiento.length}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {sinMovimiento.map(p => (
                      <div key={p.id} className="rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-xs line-clamp-2 leading-tight mb-1">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-1">{p.sku}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 neb-tabular">{p.stock} en stock</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <CategoryBreakdown ventas={ventas} />
            </>
          )
        )}

        {/* ══════════════════ FLUJO ══════════════════ */}
        {subTab === 'flujo' && (
          loadingFlujo ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Ingresos"   value={fmt(totalSales)}        icon={ArrowUpRight} />
                <KpiCard label="Fondos Iniciales" value={fmt(flujo.totalFondos)} icon={Wallet}       />
                <KpiCard label="Turnos Cerrados"  value={flujo.cerradas}         icon={CheckCircle}  />
                <KpiCard label="Cajas Abiertas"   value={flujo.abiertas}         icon={BarChart3}    />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Ventas Totales del Sistema</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Composición de los ingresos</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[
                      { label: 'Efectivo en ventas',      val: ef,    icon: Banknote,   dot: '#0f172a' },
                      { label: 'Tarjeta en ventas',       val: tar,   icon: CreditCard, dot: '#3b82f6' },
                      { label: 'Transferencia en ventas', val: trans, icon: Building2,  dot: '#a78bfa' },
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: m.dot }} />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                        </div>
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-4 mt-1">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total registrado</span>
                      <span className="text-[18px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(totalSales)}</span>
                    </div>
                  </div>
                </div>

                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Declarado en Cortes</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Últimos 30 días</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[
                      { label: 'Efectivo contado',       val: flujo.totalEfectivo, dot: '#0f172a' },
                      { label: 'Tarjeta declarada',      val: flujo.totalTarjeta,  dot: '#3b82f6' },
                      { label: 'Transferencia declar.',  val: flujo.totalTransf,   dot: '#a78bfa' },
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: m.dot }} />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                        </div>
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-4 mt-1">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total declarado</span>
                      <span className="text-[18px] font-semibold text-slate-900 dark:text-white neb-tabular">
                        {fmt(flujo.totalEfectivo + flujo.totalTarjeta + flujo.totalTransf)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {flujo.porEmpleado.length > 0 ? (
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Desglose por Empleado</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Últimos 30 días</p>
                  </div>
                  <div className="overflow-x-auto neb-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <th className="pb-3 font-medium text-left pl-2">Empleado</th>
                          <th className="pb-3 font-medium text-center">Turnos</th>
                          <th className="pb-3 font-medium text-right">Fondos</th>
                          <th className="pb-3 font-medium text-right">Efectivo</th>
                          <th className="pb-3 font-medium text-right">Tarjeta</th>
                          <th className="pb-3 font-medium text-right">Transf.</th>
                          <th className="pb-3 font-medium text-right pr-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {flujo.porEmpleado.map(emp => (
                          <tr key={emp.nombre} className="hover:bg-slate-50/60 transition-colors">
                            <td className="py-3 font-medium text-slate-900 dark:text-white pl-2">{emp.nombre}</td>
                            <td className="py-3 text-center">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">{emp.sesiones}</span>
                            </td>
                            <td className="py-3 text-right text-slate-500 dark:text-slate-400 neb-tabular">{fmt(emp.fondos)}</td>
                            <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.efectivo)}</td>
                            <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.tarjeta)}</td>
                            <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.transf)}</td>
                            <td className="py-3 text-right font-semibold text-slate-900 dark:text-white pr-2 neb-tabular">
                              {fmt(emp.efectivo + emp.tarjeta + emp.transf)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="neb-card p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                  No hay cortes de caja registrados en los últimos 30 días.
                </div>
              )}
            </>
          )
        )}

        {/* ══════════════════ SUCURSALES (comparativo) ══════════════════ */}
        {subTab === 'sucursales' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-extrabold text-slate-900 dark:text-white">Comparativo de sucursales</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                Ventas de los últimos 30 días y existencias actuales. Asignación de empleados en la sección Equipo.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {resumenSucursales.map(s => (
                <div key={s.id} className="neb-card p-5 space-y-5">
                  <p className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                    <Store className="w-4 h-4 text-accent-600" /> {s.nombre}
                  </p>

                  {/* Ventas (30 días) */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Ventas · últimos 30 días</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{fmt(s.ventaTotal)}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ventas</p>
                      </div>
                      <div>
                        <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.tickets}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Tickets</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{fmt(s.ticketPromedio)}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ticket prom.</p>
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{s.unidadesVendidas}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unid. vendidas</p>
                      </div>
                    </div>
                  </div>

                  {/* Inventario */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Inventario actual</p>
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <p className="text-2xl font-semibold text-emerald-600 neb-tabular leading-none">{fmt(s.valorInventario)}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Valor (a precio de venta)</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.unidades}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unidades</p>
                      </div>
                      <div>
                        <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.productos}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Productos</p>
                      </div>
                      <div>
                        <p className={`text-base font-semibold neb-tabular leading-none ${s.bajos > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{s.bajos}</p>
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Stock bajo</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
