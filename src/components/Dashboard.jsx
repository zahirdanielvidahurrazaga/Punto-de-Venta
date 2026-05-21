import { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, DollarSign, Package, AlertTriangle, CreditCard, Banknote,
  Building2, CalendarDays, Wallet, BarChart3, ShoppingBag, ArrowUpRight,
  Star, AlertCircle, CheckCircle, Loader2
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

// ─── helpers ───────────────────────────────────────────────────────────────
const toLocal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};
const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

// ─── sub-components ────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, color, bg }) {
  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className={`${bg} p-3 rounded-2xl w-fit mb-3`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function RankingList({ items, valueKey, valueLabel }) {
  if (!items.length)
    return <p className="text-slate-400 text-sm font-medium py-6 text-center">Sin datos de ventas.</p>;

  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const maxVal  = Math.max(...items.map(p => p[valueKey]), 1);

  return (
    <div className="space-y-4">
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3">
          <span className="text-lg w-7 text-center shrink-0">{medals[i]}</span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1">
              <p className="font-bold text-slate-700 text-sm truncate">{p.nombre}</p>
              <p className="font-black text-slate-800 text-sm ml-2 shrink-0">{valueLabel(p)}</p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(p[valueKey] / maxVal) * 100}%`, background: i === 0 ? '#0f172a' : '#94a3b8' }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{p.sku} · {p.categoria}</p>
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

  const paleta = ['#0f172a','#3b82f6','#a855f7','#f59e0b','#10b981','#ef4444'];

  return (
    <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
      <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
        <Package className="w-5 h-5 text-primary-900" />
        Ingresos por Categoría
      </h2>
      <div className="space-y-4">
        {cats.map((c, i) => (
          <div key={c.cat} className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: paleta[i % paleta.length] }} />
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-700 text-sm">{c.cat}</span>
                <span className="font-black text-slate-800 text-sm">{fmt(c.ingresos)}</span>
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

// ─── main component ────────────────────────────────────────────────────────
export default function Dashboard({ ventas = [] }) {
  const [subTab,        setSubTab]        = useState('resumen');
  const [chartPeriod,   setChartPeriod]   = useState('7d');
  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const [sesiones30d,   setSesiones30d]   = useState([]);
  const [todosProductos,setTodosProductos]= useState([]);
  const [loadingFlujo,  setLoadingFlujo]  = useState(false);
  const [loadingAnalisis,setLoadingAnalisis]= useState(false);

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

  // ── KPIs globales ──────────────────────────────────────────────────────
  const totalSales  = ventas.reduce((a, v) => a + Number(v.total), 0);
  const totalOrders = ventas.length;
  const avgTicket   = totalOrders > 0 ? totalSales / totalOrders : 0;
  const ef    = ventas.reduce((a, v) => a + Number(v.pagos?.efectivo       || 0), 0);
  const tar   = ventas.reduce((a, v) => a + Number(v.pagos?.tarjeta        || 0), 0);
  const trans = ventas.reduce((a, v) => a + Number(v.pagos?.transferencia  || 0), 0);

  // ── Chart data ─────────────────────────────────────────────────────────
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
        const wEnd   = new Date(); wEnd.setDate(wEnd.getDate() - i * 7);
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

  // ── Product rankings ───────────────────────────────────────────────────
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

  // ── Flujo de caja ──────────────────────────────────────────────────────
  const flujo = useMemo(() => {
    const cerradas = sesiones30d.filter(s => s.estado === 'cerrada');
    const porEmp   = {};
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

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-800">Dashboard Financiero</h1>
          <p className="text-slate-500 text-sm mt-1">
            Análisis en tiempo real · {ventas.length} ventas cargadas
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex bg-white rounded-2xl shadow-sm border border-slate-200 p-1 w-fit">
          {SUB_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
                subTab === t.key
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
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
              <KpiCard label="Ventas Totales"  value={fmt(totalSales)}  icon={DollarSign}  color="text-emerald-600" bg="bg-emerald-50"  />
              <KpiCard label="Órdenes"         value={totalOrders}      icon={ShoppingBag} color="text-indigo-600"  bg="bg-indigo-50"   />
              <KpiCard label="Ticket Promedio" value={fmt(avgTicket)}   icon={TrendingUp}  color="text-amber-600"  bg="bg-amber-50"    />
              <KpiCard label="Efectivo"        value={fmt(ef)}          icon={Banknote}    color="text-slate-700"  bg="bg-slate-100"   />
            </div>

            {/* Gráfico comparativo */}
            <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <h2 className="text-base lg:text-lg font-bold text-slate-800 flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-primary-900" />
                  Ventas Comparativas
                </h2>
                <div className="flex gap-1.5">
                  {PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => setChartPeriod(p.key)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${
                        chartPeriod === p.key
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'text-slate-500 border-slate-200 hover:border-slate-400 bg-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-end justify-between gap-2 px-2" style={{ height: 200 }}>
                {chartData.map((d, i) => {
                  const h      = maxChart > 0 ? Math.round((d.sum / maxChart) * 160) : 0;
                  const finalH = d.sum > 0 ? Math.max(h, 8) : 4;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 group" style={{ height: '100%', justifyContent: 'flex-end' }}>
                      {d.sum > 0 && (
                        <div className="text-[10px] font-bold text-slate-300 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {d.count}v
                        </div>
                      )}
                      <div className="text-xs font-bold mb-2 text-slate-600" style={{ opacity: d.sum > 0 ? 1 : 0 }}>
                        {d.sum >= 1000 ? `${(d.sum/1000).toFixed(1)}k` : d.sum.toFixed(0)}
                      </div>
                      <div
                        className="w-full max-w-[44px] rounded-t-xl transition-all duration-500"
                        style={{
                          height: `${finalH}px`,
                          background: d.sum > 0 ? 'linear-gradient(180deg,#1e293b,#475569)' : '#f1f5f9',
                        }}
                      />
                      <div className="mt-2.5 text-xs font-bold text-slate-400 capitalize">{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cajas activas + Métodos de pago */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Cajas */}
              <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary-900" />
                  Cajas Activas
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
                    cajasAbiertas.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {cajasAbiertas.length}
                  </span>
                </h2>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {cajasAbiertas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-sm text-center">
                      <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
                      No hay cajas abiertas
                    </div>
                  ) : cajasAbiertas.map(c => (
                    <div key={c.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <p className="font-bold text-slate-800 text-sm">{c.usuarios_perfiles?.nombre_completo}</p>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(c.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-sm font-black text-emerald-600">{fmt(c.fondo_inicial)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Métodos de pago */}
              <div className="lg:col-span-2 bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-base font-bold text-slate-800 mb-5">Distribución por Método de Pago</h2>
                <div className="space-y-5">
                  {[
                    { label: 'Efectivo',       val: ef,    barColor: 'bg-slate-800', icon: Banknote,  iconColor: 'text-slate-700', iconBg: 'bg-slate-100'  },
                    { label: 'Tarjeta',        val: tar,   barColor: 'bg-blue-500',  icon: CreditCard,iconColor: 'text-blue-600',  iconBg: 'bg-blue-100'   },
                    { label: 'Transferencia',  val: trans, barColor: 'bg-purple-500',icon: Building2, iconColor: 'text-purple-600',iconBg: 'bg-purple-100' },
                  ].map(m => (
                    <div key={m.label} className="flex items-center gap-4">
                      <div className={`${m.iconBg} p-2.5 rounded-xl shrink-0`}>
                        <m.icon className={`w-5 h-5 ${m.iconColor}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1.5">
                          <span className="font-bold text-slate-700 text-sm">{m.label}</span>
                          <span className="font-black text-slate-800 text-sm">{fmt(m.val)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`${m.barColor} h-full rounded-full transition-all duration-700`}
                            style={{ width: `${totalSales > 0 ? (m.val / totalSales) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-slate-400 font-bold mt-0.5 text-right">
                          {totalSales > 0 ? ((m.val / totalSales) * 100).toFixed(1) : 0}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════ ANÁLISIS ══════════════════ */}
        {subTab === 'analisis' && (
          loadingAnalisis ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>
          ) : (
            <>
              {/* Top 5 por unidades y por ingresos */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Top 5 Más Vendidos
                    <span className="text-xs font-normal text-slate-400 ml-1">por unidades</span>
                  </h2>
                  <RankingList
                    items={top5Units}
                    valueKey="unidades"
                    valueLabel={(p) => `${p.unidades} uds`}
                  />
                </div>
                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-500" />
                    Top 5 por Ingresos
                    <span className="text-xs font-normal text-slate-400 ml-1">mayor facturación</span>
                  </h2>
                  <RankingList
                    items={top5Revenue}
                    valueKey="ingresos"
                    valueLabel={(p) => fmt(p.ingresos)}
                  />
                </div>
              </div>

              {/* Menos vendidos */}
              <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  Menor Movimiento
                  <span className="text-xs font-normal text-slate-400 ml-1">productos que menos se venden</span>
                </h2>
                {bottom5.length === 0 ? (
                  <p className="text-slate-400 text-sm font-medium py-4 text-center">Sin suficientes datos de ventas.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {bottom5.map((p) => (
                      <div key={p.id} className="bg-orange-50 border border-orange-100 rounded-2xl p-4 text-center">
                        <p className="font-bold text-slate-700 text-sm line-clamp-2 leading-tight mb-2">{p.nombre}</p>
                        <p className="font-mono text-xs text-orange-400 mb-2">{p.sku}</p>
                        <p className="font-black text-orange-600">{p.unidades} uds</p>
                        <p className="text-xs text-orange-400 mt-0.5">{fmt(p.ingresos)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sin movimiento */}
              {sinMovimiento.length > 0 && (
                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Package className="w-5 h-5 text-red-400" />
                    Sin Ventas Registradas
                    <span className="ml-2 bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {sinMovimiento.length}
                    </span>
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {sinMovimiento.map(p => (
                      <div key={p.id} className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                        <p className="font-bold text-slate-700 text-xs line-clamp-2 leading-tight mb-1">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-red-400 mb-1">{p.sku}</p>
                        <p className="text-[10px] text-slate-400">{p.stock} en stock</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Categorías */}
              <CategoryBreakdown ventas={ventas} />
            </>
          )
        )}

        {/* ══════════════════ FLUJO DE CAJA ══════════════════ */}
        {subTab === 'flujo' && (
          loadingFlujo ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>
          ) : (
            <>
              {/* KPIs de flujo */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="Total Ingresos"   value={fmt(totalSales)}         icon={ArrowUpRight} color="text-emerald-600" bg="bg-emerald-50" />
                <KpiCard label="Fondos Iniciales"  value={fmt(flujo.totalFondos)}  icon={Wallet}       color="text-slate-700"  bg="bg-slate-100"  />
                <KpiCard label="Turnos Cerrados"   value={flujo.cerradas}          icon={CheckCircle}  color="text-blue-600"   bg="bg-blue-50"    />
                <KpiCard label="Cajas Abiertas"    value={flujo.abiertas}          icon={BarChart3}    color="text-emerald-600"bg="bg-emerald-50" />
              </div>

              {/* Diferencia real: lo que vendimos vs lo que se declaró */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                    Ventas Totales del Sistema
                  </h2>
                  <div className="space-y-3">
                    {[
                      { label: 'Efectivo en ventas',         val: ef,    icon: Banknote,   cls: 'bg-amber-50 border-amber-100 text-amber-700'   },
                      { label: 'Tarjeta en ventas',          val: tar,   icon: CreditCard, cls: 'bg-blue-50 border-blue-100 text-blue-700'     },
                      { label: 'Transferencia en ventas',    val: trans, icon: Building2,  cls: 'bg-purple-50 border-purple-100 text-purple-700' },
                    ].map(m => (
                      <div key={m.label} className={`flex items-center justify-between p-4 rounded-2xl border ${m.cls}`}>
                        <div className="flex items-center gap-2">
                          <m.icon className="w-4 h-4" />
                          <span className="font-bold text-sm">{m.label}</span>
                        </div>
                        <span className="font-black text-lg">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800 text-white">
                      <span className="font-bold text-sm">Total registrado</span>
                      <span className="font-black text-xl">{fmt(totalSales)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-blue-500" />
                    Declarado en Cortes (30 días)
                  </h2>
                  <div className="space-y-3">
                    {[
                      { label: 'Efectivo contado',      val: flujo.totalEfectivo, cls: 'bg-amber-50 border-amber-100 text-amber-700'   },
                      { label: 'Tarjeta declarada',     val: flujo.totalTarjeta,  cls: 'bg-blue-50 border-blue-100 text-blue-700'     },
                      { label: 'Transferencia declar.', val: flujo.totalTransf,   cls: 'bg-purple-50 border-purple-100 text-purple-700' },
                    ].map(m => (
                      <div key={m.label} className={`flex items-center justify-between p-4 rounded-2xl border ${m.cls}`}>
                        <span className="font-bold text-sm">{m.label}</span>
                        <span className="font-black text-lg">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-800 text-white">
                      <span className="font-bold text-sm">Total declarado</span>
                      <span className="font-black text-xl">
                        {fmt(flujo.totalEfectivo + flujo.totalTarjeta + flujo.totalTransf)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Desglose por empleado */}
              {flujo.porEmpleado.length > 0 ? (
                <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary-900" />
                    Desglose por Empleado <span className="text-xs font-normal text-slate-400 ml-1">últimos 30 días</span>
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                          <th className="pb-3 font-bold text-left">Empleado</th>
                          <th className="pb-3 font-bold text-center">Turnos</th>
                          <th className="pb-3 font-bold text-right">Fondos Iniciales</th>
                          <th className="pb-3 font-bold text-right">Efectivo Contado</th>
                          <th className="pb-3 font-bold text-right">Tarjeta</th>
                          <th className="pb-3 font-bold text-right">Transf.</th>
                          <th className="pb-3 font-bold text-right">Total Declarado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {flujo.porEmpleado.map(emp => (
                          <tr key={emp.nombre} className="hover:bg-slate-50">
                            <td className="py-3 font-bold text-slate-800">{emp.nombre}</td>
                            <td className="py-3 text-center">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-lg font-bold text-slate-600">{emp.sesiones}</span>
                            </td>
                            <td className="py-3 text-right font-mono text-slate-500">{fmt(emp.fondos)}</td>
                            <td className="py-3 text-right font-black text-amber-700">{fmt(emp.efectivo)}</td>
                            <td className="py-3 text-right font-black text-blue-700">{fmt(emp.tarjeta)}</td>
                            <td className="py-3 text-right font-black text-purple-700">{fmt(emp.transf)}</td>
                            <td className="py-3 text-right font-black text-slate-800">
                              {fmt(emp.efectivo + emp.tarjeta + emp.transf)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 text-center text-slate-400">
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
