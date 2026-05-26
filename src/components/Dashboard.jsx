import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Package, AlertTriangle, CreditCard, Banknote,
  Building2, CalendarDays, Wallet, BarChart3, ShoppingBag, ArrowUpRight,
  Star, AlertCircle, CheckCircle, Loader2, Filter, Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const SUB_TABS = [
  { key: 'resumen',  label: 'Resumen'       },
  { key: 'analisis', label: 'Análisis'      },
  { key: 'flujo',    label: 'Flujo de Caja' },
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
    'text-slate-600 bg-slate-50';

  const DeltaIcon =
    deltaType === 'positive' ? TrendingUp :
    deltaType === 'negative' ? TrendingDown :
    null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col relative">
      <div className="flex items-start justify-between mb-4">
        <div className="text-slate-400">
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${deltaColor}`}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" strokeWidth={2.5} />}
            {delta}
          </span>
        )}
      </div>
      <div className="text-[12px] text-slate-500 font-medium mb-1">{label}</div>
      <div className="text-[28px] font-semibold tracking-tight text-slate-900 leading-none">
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
    <div className="pt-6 pb-8 border-b border-slate-200">
      <p className="text-[13px] font-medium text-slate-500 uppercase tracking-wide mb-2">{dateStr}</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900">
        {greeting}, {userName.split(' ')[0]}.
      </h1>
      <p className="text-lg text-slate-500 mt-3 font-medium">
        Aquí está el panorama de tu operación.
      </p>
    </div>
  );
}

function RankingList({ items, valueKey, valueLabel }) {
  if (!items.length)
    return <p className="text-slate-400 text-sm font-medium py-6 text-center">Sin datos de ventas.</p>;

  const medals = ['1','2','3','4','5'];
  const maxVal = Math.max(...items.map(p => p[valueKey]), 1);

  return (
    <div className="space-y-3.5">
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
            i === 0 ? 'bg-accent-100 text-accent-700' :
            i === 1 ? 'neb-grad-pastel text-slate-700' :
            'bg-slate-50 text-slate-500 border border-slate-100'
          }`}>{medals[i]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <p className="font-bold text-slate-800 text-sm truncate">{p.nombre}</p>
              <p className="font-extrabold text-slate-900 text-sm ml-2 shrink-0">{valueLabel(p)}</p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(p[valueKey] / maxVal) * 100}%`,
                  background: i === 0 ? 'linear-gradient(90deg, #1d4ed8, #60a5fa)' : 'linear-gradient(90deg, #94a3b8, #cbd5e1)'
                }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">{p.sku} · {p.categoria}</p>
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
      <h2 className="text-[15px] font-extrabold text-slate-900 mb-5 flex items-center gap-2">
        <Package className="w-4 h-4 text-accent-600" />
        Ingresos por Categoría
      </h2>
      <div className="space-y-4">
        {cats.map((c, i) => (
          <div key={c.cat} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: paleta[i % paleta.length] }} />
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-700 text-sm">{c.cat}</span>
                <span className="font-extrabold text-slate-900 text-sm">{fmt(c.ingresos)}</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.ingresos / (cats[0]?.ingresos || 1)) * 100}%`, background: paleta[i % paleta.length] }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-bold">{c.unidades} unidades</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ ventas = [], userName = 'Admin' }) {
  const [subTab, setSubTab] = useState('resumen');
  const [chartPeriod, setChartPeriod] = useState('7d');
  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const [sesiones30d, setSesiones30d] = useState([]);
  const [todosProductos, setTodosProductos] = useState([]);
  const [loadingFlujo, setLoadingFlujo] = useState(false);
  const [loadingAnalisis, setLoadingAnalisis] = useState(false);

  useEffect(() => { fetchCajasAbiertas(); }, []);

  useEffect(() => {
    if (subTab === 'flujo'    && sesiones30d.length    === 0) fetchSesiones();
    if (subTab === 'analisis' && todosProductos.length === 0) fetchTodosProductos();
  }, [subTab]);

  const fetchCajasAbiertas = async () => {
    try {
      const { data } = await supabase
        .from('sesiones_caja')
        .select('*, usuarios_perfiles(nombre_completo)')
        .eq('estado', 'abierta');
      setCajasAbiertas(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchSesiones = async () => {
    setLoadingFlujo(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from('sesiones_caja')
        .select('*, usuarios_perfiles(nombre_completo)')
        .gte('fecha_apertura', since.toISOString())
        .order('fecha_apertura', { ascending: false });
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

  // Sparklines (último 7 días) por KPI
  const sparkSeries = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const key = toLocal(d);
      const rows = ventas.filter(v => v.fecha && toLocal(v.fecha) === key);
      const total = rows.reduce((a, v) => a + Number(v.total), 0);
      const ordenes = rows.length;
      const efectivo = rows.reduce((a, v) => a + Number(v.pagos?.efectivo || 0), 0);
      const ticketAvg = ordenes > 0 ? total / ordenes : 0;
      return { total, ordenes, efectivo, ticketAvg };
    });
    return {
      ventas:   days.map(d => d.total),
      ordenes:  days.map(d => d.ordenes),
      ticket:   days.map(d => d.ticketAvg),
      efectivo: days.map(d => d.efectivo),
    };
  }, [ventas]);

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-4 lg:p-7 max-w-7xl mx-auto space-y-6">

        {/* Hero Apple style */}
        <DashboardHero userName={userName} />

        {/* Sub-tabs */}
        <div className="flex bg-white rounded-2xl p-1 w-fit border border-slate-200 neb-shadow-sm">
          {SUB_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-2 text-[13px] font-bold rounded-xl transition-all ${
                subTab === t.key
                  ? 'neb-grad-primary text-white neb-shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
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
              {/* Bar chart premium */}
              <div className="neb-card p-5 lg:p-6 lg:col-span-2 relative overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
                  <div>
                    <h2 className="text-[15px] font-extrabold text-slate-900 flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl neb-grad-accent flex items-center justify-center text-white">
                        <CalendarDays className="w-3.5 h-3.5" />
                      </span>
                      Ventas Comparativas
                    </h2>
                    <p className="text-[11px] font-bold text-slate-400 mt-1.5 flex items-center gap-2">
                      <span className="neb-tabular">{fmt(chartData.reduce((a,d) => a + d.sum, 0))}</span>
                      <span className="text-slate-300">·</span>
                      <span>promedio {fmt(chartData.reduce((a,d) => a + d.sum, 0) / Math.max(1, chartData.filter(d=>d.sum>0).length))}</span>
                    </p>
                  </div>
                  <div className="flex gap-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
                    {PERIODS.map(p => (
                      <button
                        key={p.key}
                        onClick={() => setChartPeriod(p.key)}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                          chartPeriod === p.key
                            ? 'bg-white text-slate-900 neb-shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart container Apple style */}
                <div className="flex items-end justify-between gap-2 mt-6 h-48 border-b border-slate-100 pb-2">
                  {chartData.map((d, i) => {
                    const pct = maxChart > 0 ? Math.round((d.sum / maxChart) * 100) : 0;
                    const finalH = d.sum > 0 ? Math.max(pct, 4) : 0;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group" style={{ height: '100%', justifyContent: 'flex-end' }}>
                        <div className="text-[11px] font-medium text-slate-500 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {d.sum >= 1000 ? `${(d.sum/1000).toFixed(1)}k` : d.sum.toFixed(0)}
                        </div>
                        <div
                          className={`w-full max-w-[32px] rounded-t-md transition-all ${d.sum > 0 ? 'bg-slate-800' : 'bg-slate-100'}`}
                          style={{ height: `${finalH}%` }}
                        />
                        <div className="mt-2 text-[11px] font-medium text-slate-400 capitalize">{d.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cajas activas */}
              <div className="neb-card p-5 lg:p-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[15px] font-extrabold text-slate-900 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-accent-600" />
                    Cajas Activas
                  </h2>
                  <span className={`neb-chip ${cajasAbiertas.length > 0 ? 'neb-chip-positive' : 'neb-chip-neutral'}`}>
                    {cajasAbiertas.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto neb-scroll">
                  {cajasAbiertas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm text-center">
                      <AlertTriangle className="w-8 h-8 mb-2 opacity-40" />
                      Sin cajas abiertas
                    </div>
                  ) : cajasAbiertas.map(c => (
                    <div key={c.id} className="neb-card-soft p-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-accent-100 text-accent-700 flex items-center justify-center font-extrabold text-sm">
                        {(c.usuarios_perfiles?.nombre_completo || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-[13px] truncate">{c.usuarios_perfiles?.nombre_completo}</p>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(c.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-sm font-extrabold text-emerald-600">{fmt(c.fondo_inicial)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Métodos de pago */}
            <div className="neb-card p-5 lg:p-6">
              <h2 className="text-[15px] font-extrabold text-slate-900 mb-1">Distribución por Método de Pago</h2>
              <p className="text-[11px] font-bold text-slate-400 mb-5">Composición del cobro en el periodo cargado</p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {[
                  { label: 'Efectivo',      val: ef,    grad: 'linear-gradient(90deg, #0f172a, #475569)', icon: Banknote,   iconColor: 'text-slate-700', iconBg: 'bg-slate-100' },
                  { label: 'Tarjeta',       val: tar,   grad: 'linear-gradient(90deg, #1d4ed8, #60a5fa)', icon: CreditCard, iconColor: 'text-accent-700', iconBg: 'bg-accent-50' },
                  { label: 'Transferencia', val: trans, grad: 'linear-gradient(90deg, #7c3aed, #c4b5fd)', icon: Building2,  iconColor: 'text-violet-600', iconBg: 'bg-violet-50' },
                ].map(m => (
                  <div key={m.label} className="neb-card-soft p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`${m.iconBg} p-2 rounded-xl`}>
                        <m.icon className={`w-4 h-4 ${m.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</p>
                        <p className="text-lg font-extrabold text-slate-900">{fmt(m.val)}</p>
                      </div>
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${totalSales > 0 ? (m.val/totalSales)*100 : 0}%`, background: m.grad }} />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-1 text-right">
                      {totalSales > 0 ? ((m.val/totalSales)*100).toFixed(1) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="neb-card p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[15px] font-extrabold text-slate-900">Transacciones Recientes</h2>
                  <p className="text-[11px] font-bold text-slate-400 mt-0.5">Últimas operaciones del periodo</p>
                </div>
                <button className="neb-btn neb-btn-ghost text-[12px]">
                  <Filter className="w-3.5 h-3.5" /> Filtrar
                </button>
              </div>
              <div className="overflow-x-auto neb-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.15em] text-slate-400 border-b border-slate-100">
                      <th className="pb-3 pt-1 font-bold text-left pl-2">Folio</th>
                      <th className="pb-3 pt-1 font-bold text-left">Fecha</th>
                      <th className="pb-3 pt-1 font-bold text-left">Estado</th>
                      <th className="pb-3 pt-1 font-bold text-right">Items</th>
                      <th className="pb-3 pt-1 font-bold text-right pr-2">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ventas.slice(0, 6).map((v, i) => {
                      const folio = String(v.id).padStart(4,'0').slice(0,8);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="py-3 pl-2">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium text-[11px]">
                                {folio.slice(-2)}
                              </span>
                              <span className="font-semibold text-slate-900">#{folio}</span>
                            </div>
                          </td>
                          <td className="py-3 text-[12px] text-slate-500">
                            {v.fecha ? new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-medium">
                              Completada
                            </span>
                          </td>
                          <td className="py-3 text-right text-[13px] text-slate-500">{(v.items || []).length}</td>
                          <td className="py-3 pr-2 text-right font-semibold text-slate-900 text-[14px]">
                            {fmt(v.total)}
                          </td>
                        </tr>
                      );
                    })}
                    {ventas.length === 0 && (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-400 text-sm">
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
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-accent-600" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-5 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Top 5 Más Vendidos
                    <span className="text-[11px] font-bold text-slate-400 ml-1">por unidades</span>
                  </h2>
                  <RankingList items={top5Units} valueKey="unidades" valueLabel={(p) => `${p.unidades} uds`} />
                </div>
                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-5 flex items-center gap-2">
                    <Star className="w-4 h-4 text-amber-500" />
                    Top 5 por Ingresos
                    <span className="text-[11px] font-bold text-slate-400 ml-1">mayor facturación</span>
                  </h2>
                  <RankingList items={top5Revenue} valueKey="ingresos" valueLabel={(p) => fmt(p.ingresos)} />
                </div>
              </div>

              <div className="neb-card p-5 lg:p-6">
                <h2 className="text-[15px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-500" />
                  Menor Movimiento
                  <span className="text-[11px] font-bold text-slate-400 ml-1">productos con bajas ventas</span>
                </h2>
                {bottom5.length === 0 ? (
                  <p className="text-slate-400 text-sm font-medium py-4 text-center">Sin suficientes datos.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {bottom5.map((p) => (
                      <div key={p.id} className="rounded-2xl p-4 text-center border border-orange-100 bg-orange-50/40">
                        <p className="font-bold text-slate-800 text-sm line-clamp-2 leading-tight mb-2">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-orange-400 mb-2">{p.sku}</p>
                        <p className="font-extrabold text-orange-600">{p.unidades} uds</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{fmt(p.ingresos)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {sinMovimiento.length > 0 && (
                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-rose-500" />
                    Sin Ventas Registradas
                    <span className="neb-chip neb-chip-negative ml-2">{sinMovimiento.length}</span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {sinMovimiento.map(p => (
                      <div key={p.id} className="rounded-xl p-3 text-center border border-rose-100 bg-rose-50/40">
                        <p className="font-bold text-slate-800 text-xs line-clamp-2 leading-tight mb-1">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-rose-400 mb-1">{p.sku}</p>
                        <p className="text-[10px] text-slate-400">{p.stock} en stock</p>
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
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-accent-600" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Ingresos"   value={fmt(totalSales)}        icon={ArrowUpRight} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
                <KpiCard label="Fondos Iniciales" value={fmt(flujo.totalFondos)} icon={Wallet}       iconColor="text-slate-700"   iconBg="bg-slate-100"  />
                <KpiCard label="Turnos Cerrados"  value={flujo.cerradas}         icon={CheckCircle}  iconColor="text-accent-600"  iconBg="bg-accent-50"  />
                <KpiCard label="Cajas Abiertas"   value={flujo.abiertas}         icon={BarChart3}    iconColor="text-emerald-600" iconBg="bg-emerald-50" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    Ventas Totales del Sistema
                  </h2>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Efectivo en ventas',      val: ef,    icon: Banknote,   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-100'  },
                      { label: 'Tarjeta en ventas',       val: tar,   icon: CreditCard, color: 'text-accent-700',  bg: 'bg-accent-50',  border: 'border-accent-100' },
                      { label: 'Transferencia en ventas', val: trans, icon: Building2,  color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-100' },
                    ].map(m => (
                      <div key={m.label} className={`flex items-center justify-between p-3.5 rounded-2xl border ${m.bg} ${m.border}`}>
                        <div className={`flex items-center gap-2 ${m.color}`}>
                          <m.icon className="w-4 h-4" />
                          <span className="font-bold text-sm">{m.label}</span>
                        </div>
                        <span className="font-extrabold text-base text-slate-900">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3.5 rounded-2xl neb-grad-primary text-white">
                      <span className="font-bold text-sm">Total registrado</span>
                      <span className="font-extrabold text-lg">{fmt(totalSales)}</span>
                    </div>
                  </div>
                </div>

                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-accent-600" />
                    Declarado en Cortes
                    <span className="text-[11px] font-bold text-slate-400 ml-1">últimos 30 días</span>
                  </h2>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Efectivo contado',       val: flujo.totalEfectivo, color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100'  },
                      { label: 'Tarjeta declarada',      val: flujo.totalTarjeta,  color: 'text-accent-700', bg: 'bg-accent-50', border: 'border-accent-100' },
                      { label: 'Transferencia declar.',  val: flujo.totalTransf,   color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
                    ].map(m => (
                      <div key={m.label} className={`flex items-center justify-between p-3.5 rounded-2xl border ${m.bg} ${m.border}`}>
                        <span className={`font-bold text-sm ${m.color}`}>{m.label}</span>
                        <span className="font-extrabold text-base text-slate-900">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-3.5 rounded-2xl neb-grad-primary text-white">
                      <span className="font-bold text-sm">Total declarado</span>
                      <span className="font-extrabold text-lg">
                        {fmt(flujo.totalEfectivo + flujo.totalTarjeta + flujo.totalTransf)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {flujo.porEmpleado.length > 0 ? (
                <div className="neb-card p-5 lg:p-6">
                  <h2 className="text-[15px] font-extrabold text-slate-900 mb-5 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-accent-600" />
                    Desglose por Empleado <span className="text-[11px] font-bold text-slate-400 ml-1">últimos 30 días</span>
                  </h2>
                  <div className="overflow-x-auto neb-scroll">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.15em] text-slate-400 border-b border-slate-100">
                          <th className="pb-3 font-bold text-left pl-2">Empleado</th>
                          <th className="pb-3 font-bold text-center">Turnos</th>
                          <th className="pb-3 font-bold text-right">Fondos</th>
                          <th className="pb-3 font-bold text-right">Efectivo</th>
                          <th className="pb-3 font-bold text-right">Tarjeta</th>
                          <th className="pb-3 font-bold text-right">Transf.</th>
                          <th className="pb-3 font-bold text-right pr-2">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {flujo.porEmpleado.map(emp => (
                          <tr key={emp.nombre} className="hover:bg-slate-50/60">
                            <td className="py-3 font-extrabold text-slate-900 pl-2">{emp.nombre}</td>
                            <td className="py-3 text-center">
                              <span className="neb-chip neb-chip-neutral">{emp.sesiones}</span>
                            </td>
                            <td className="py-3 text-right font-mono text-slate-500">{fmt(emp.fondos)}</td>
                            <td className="py-3 text-right font-extrabold text-amber-700">{fmt(emp.efectivo)}</td>
                            <td className="py-3 text-right font-extrabold text-accent-700">{fmt(emp.tarjeta)}</td>
                            <td className="py-3 text-right font-extrabold text-violet-700">{fmt(emp.transf)}</td>
                            <td className="py-3 text-right font-extrabold text-slate-900 pr-2">
                              {fmt(emp.efectivo + emp.tarjeta + emp.transf)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="neb-card p-12 text-center text-slate-400">
                  No hay cortes de caja registrados en los últimos 30 días.
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
