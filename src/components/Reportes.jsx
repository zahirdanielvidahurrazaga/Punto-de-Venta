import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Loader2, FileText, Clock, Wallet,
  AlertTriangle, CheckCircle, Timer, ShoppingBag, ChevronDown
} from 'lucide-react';

const FILTROS = [
  { label: 'Hoy',     days: 0 },
  { label: '7 días',  days: 7 },
  { label: '30 días', days: 30 },
];

function getFechaInicio(days) {
  const d = new Date();
  if (days === 0) d.setHours(0, 0, 0, 0);
  else { d.setDate(d.getDate() - days); d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}

function duracion(apertura, cierre) {
  const ms = (cierre ? new Date(cierre) : new Date()) - new Date(apertura);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function fmt(dateStr, time = true) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function Avatar({ name, size = 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div className={`${dim} rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-medium text-slate-600 dark:text-slate-400 shrink-0`}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function StatChip({ label, value, accent = false, warn = false, prefix = '' }) {
  return (
    <div className="neb-card p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2">{label}</p>
      <p className={`text-2xl font-semibold tracking-tight neb-tabular leading-none ${
        warn && value > 0 ? 'text-rose-600' : accent ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
      }`}>{prefix}{value}</p>
    </div>
  );
}

export default function Reportes() {
  const [activeTab, setActiveTab] = useState('asistencias');
  const [asistencias, setAsistencias] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState(0);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeTab, filtro, sucursalFiltro]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const desde = getFechaInicio(FILTROS[filtro].days);
      if (activeTab === 'asistencias') await fetchAsistencias(desde);
      else await fetchCajas(desde);
    } catch (err) {
      console.error('Error fetching reportes:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAsistencias = async (desde) => {
    const { data, error } = await supabase
      .from('registro_asistencia')
      .select('*, usuarios_perfiles (nombre_completo, sucursal_id)')
      .gte('fecha_entrada', desde)
      .order('fecha_entrada', { ascending: false })
      .limit(100);
    if (error) throw error;
    const filtrada = sucursalFiltro === 'todas'
      ? (data || [])
      : (data || []).filter(a => a.usuarios_perfiles?.sucursal_id === sucursalFiltro);
    setAsistencias(filtrada);
  };

  const fetchCajas = async (desde) => {
    let query = supabase
      .from('sesiones_caja')
      .select('*, usuarios_perfiles (id, nombre_completo)')
      .gte('fecha_apertura', desde);
    if (sucursalFiltro !== 'todas') query = query.eq('sucursal_id', sucursalFiltro);
    const { data: cajasData, error } = await query
      .order('fecha_apertura', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!cajasData?.length) { setCajas([]); return; }

    const minFecha = cajasData[cajasData.length - 1].fecha_apertura;
    const { data: ventasRaw } = await supabase
      .from('ventas')
      .select('user_id, pago_efectivo, pago_tarjeta, pago_transferencia, fecha')
      .gte('fecha', minFecha);

    // Sangrías (retiros/depósitos) de las sesiones listadas
    const { data: movsRaw } = await supabase
      .from('movimientos_caja')
      .select('sesion_caja_id, tipo, monto')
      .in('sesion_caja_id', cajasData.map(c => c.id));

    const result = cajasData.map(caja => {
      const apertura = new Date(caja.fecha_apertura);
      const cierre = caja.fecha_cierre ? new Date(caja.fecha_cierre) : new Date();

      const ventasSesion = (ventasRaw || []).filter(v =>
        v.user_id === caja.usuario_id &&
        new Date(v.fecha) >= apertura &&
        new Date(v.fecha) <= cierre
      );

      const ventas = ventasSesion.reduce(
        (acc, v) => ({
          efectivo:      acc.efectivo      + (Number(v.pago_efectivo)      || 0),
          tarjeta:       acc.tarjeta       + (Number(v.pago_tarjeta)       || 0),
          transferencia: acc.transferencia + (Number(v.pago_transferencia) || 0),
          count:         acc.count + 1,
        }),
        { efectivo: 0, tarjeta: 0, transferencia: 0, count: 0 }
      );
      ventas.total = ventas.efectivo + ventas.tarjeta + ventas.transferencia;

      const movsCaja = (movsRaw || []).filter(m => m.sesion_caja_id === caja.id);
      const retiros = movsCaja.filter(m => m.tipo === 'retiro').reduce((a, m) => a + Number(m.monto), 0);
      const depositos = movsCaja.filter(m => m.tipo === 'deposito').reduce((a, m) => a + Number(m.monto), 0);

      const efectivoEsperado = (Number(caja.fondo_inicial) || 0) + ventas.efectivo + depositos - retiros;
      const diferencia = caja.estado === 'cerrada'
        ? (Number(caja.efectivo_declarado) || 0) - efectivoEsperado
        : null;

      return { ...caja, ventas, retiros, depositos, efectivoEsperado, diferencia };
    });

    setCajas(result);
  };

  const stats = cajas.reduce(
    (acc, c) => {
      if (c.estado === 'cerrada') {
        acc.cerradas++;
        acc.totalVentas += c.ventas?.total || 0;
        if (c.diferencia !== null && Math.abs(c.diferencia) >= 1) acc.conDiferencia++;
      } else {
        acc.abiertas++;
      }
      return acc;
    },
    { cerradas: 0, abiertas: 0, totalVentas: 0, conDiferencia: 0 }
  );

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-6xl mx-auto">

        {/* Header — Apple */}
        <div className="pt-2 pb-2 mb-7">
          <h2 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">Reportes generales</h2>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2">Historial de asistencia y cortes de caja</p>
        </div>

        {/* Tabs + Filtros — segmented controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
            {['asistencias', 'cajas'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                  activeTab === tab ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'
                }`}>
                {tab === 'asistencias' ? 'Asistencias' : 'Cortes de caja'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {sucursales.length > 1 && (
              <div className="relative">
                <select value={sucursalFiltro} onChange={e => setSucursalFiltro(e.target.value)}
                  className="neb-input w-auto !py-1.5 pr-9 text-[12px] font-semibold appearance-none">
                  <option value="todas">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              </div>
            )}
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
              {FILTROS.map((f, i) => (
                <button key={i} onClick={() => setFiltro(i)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                    filtro === i ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin w-7 h-7 text-accent-500" />
          </div>

        ) : activeTab === 'asistencias' ? (

          <div className="neb-card overflow-hidden">
            <div className="overflow-x-auto neb-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-[0.12em] border-b border-slate-100 dark:border-slate-800">
                    <th className="p-4 font-medium">Empleado</th>
                    <th className="p-4 font-medium">Estado</th>
                    <th className="p-4 font-medium">Entrada</th>
                    <th className="p-4 font-medium">Salida</th>
                    <th className="p-4 font-medium">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {asistencias.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.usuarios_perfiles?.nombre_completo} size="sm" />
                          {r.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`neb-chip ${
                          r.estado === 'trabajando' ? 'neb-chip-positive' : 'neb-chip-neutral'
                        }`}>
                          <span className={`neb-status-dot ${r.estado === 'trabajando' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          {r.estado === 'trabajando' ? 'Activo' : 'Completado'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] neb-tabular">{fmt(r.fecha_entrada)}</td>
                      <td className="p-4 font-mono text-[11px] neb-tabular">
                        {r.fecha_salida
                          ? <span className="text-slate-500 dark:text-slate-400">{fmt(r.fecha_salida)}</span>
                          : <span className="text-emerald-600 font-medium">En turno</span>}
                      </td>
                      <td className="p-4 text-slate-500 dark:text-slate-400 text-[12px] neb-tabular">
                        <div className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          {duracion(r.fecha_entrada, r.fecha_salida)}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {asistencias.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                        No hay registros de asistencia en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        ) : (

          <div className="space-y-4">

            {cajas.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                <StatChip label="Turnos cerrados" value={stats.cerradas} />
                <StatChip label="Turnos abiertos" value={stats.abiertas} accent />
                <div className="neb-card p-4 col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Total vendido</p>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight neb-tabular leading-none">
                    ${stats.totalVentas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <StatChip label="Con diferencias" value={stats.conDiferencia} warn />
              </div>
            )}

            {cajas.length === 0 ? (
              <div className="neb-card p-12 text-center text-slate-400 dark:text-slate-500">
                <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-bold text-sm">No hay cortes de caja en este período.</p>
              </div>
            ) : cajas.map((caja) => {
              const cerrada = caja.estado === 'cerrada';
              const dif = caja.diferencia;
              const difExacta = dif !== null && Math.abs(dif) < 0.01;
              const difSobra = dif !== null && dif > 0;
              const difFalta = dif !== null && dif < -0.01;

              const difTextColor = difExacta ? 'text-emerald-600'
                : difSobra ? 'text-accent-600'
                : difFalta ? 'text-rose-600'
                : 'text-slate-400 dark:text-slate-500';

              const difBg = difExacta ? 'bg-emerald-50 border-emerald-100'
                : difSobra ? 'bg-accent-50 border-accent-100'
                : difFalta ? 'bg-rose-50 border-rose-100'
                : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800';

              return (
                <div key={caja.id} className="neb-card overflow-hidden">

                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={caja.usuarios_perfiles?.nombre_completo} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {caja.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1 neb-tabular">
                            <Clock className="w-3 h-3" />
                            {fmt(caja.fecha_apertura)}
                          </span>
                          {caja.fecha_cierre && (
                            <>
                              <span className="text-slate-300">→</span>
                              <span className="neb-tabular">{fmt(caja.fecha_cierre)}</span>
                            </>
                          )}
                          <span className="text-slate-300 hidden sm:inline">·</span>
                          <span className="flex items-center gap-1 neb-tabular">
                            <Timer className="w-3 h-3" />
                            {duracion(caja.fecha_apertura, caja.fecha_cierre)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`ml-3 shrink-0 neb-chip ${
                      cerrada ? 'neb-chip-neutral' : 'neb-chip-positive'
                    }`}>
                      <span className={`neb-status-dot ${cerrada ? 'bg-slate-400' : 'bg-emerald-500'}`} />
                      {cerrada ? 'Cerrada' : 'Abierta'}
                    </span>
                  </div>

                  <div className="p-5 lg:p-6 space-y-6">

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          Ventas del turno
                        </p>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                          <ShoppingBag className="w-3 h-3" />
                          {caja.ventas.count} {caja.ventas.count === 1 ? 'venta' : 'ventas'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { label: 'Efectivo', value: caja.ventas.efectivo, dot: '#0f172a' },
                          { label: 'Tarjeta',  value: caja.ventas.tarjeta,  dot: '#3b82f6' },
                          { label: 'Transf.',  value: caja.ventas.transferencia, dot: '#a78bfa' },
                          { label: 'Total',    value: caja.ventas.total,    dot: null, total: true },
                        ].map(b => (
                          <div key={b.label} className={`rounded-xl p-3 border ${b.total ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800'}`}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                              {b.dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: b.dot }} />}
                              <p className={`text-[10px] font-medium uppercase tracking-wider ${b.total ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{b.label}</p>
                            </div>
                            <p className={`font-semibold text-[15px] neb-tabular ${b.total ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                              ${b.value.toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {cerrada && (
                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-3">Corte de efectivo</p>

                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {[
                            { label: 'Fondo inicial', value: caja.fondo_inicial, hint: '' },
                            { label: 'Esperado',      value: caja.efectivoEsperado, hint: 'fondo + ventas' },
                            { label: 'Declarado',     value: caja.efectivo_declarado, hint: 'billetes + monedas' },
                          ].map(b => (
                            <div key={b.label} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{b.label}</p>
                              <p className="font-semibold text-base text-slate-900 dark:text-white neb-tabular">
                                ${Number(b.value || 0).toFixed(2)}
                              </p>
                              {b.hint && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{b.hint}</p>}
                            </div>
                          ))}
                        </div>

                        <div className={`px-4 py-3 rounded-xl border flex items-center justify-between ${difBg}`}>
                          <div className="flex items-center gap-2">
                            {difExacta ? <CheckCircle className={`w-4 h-4 ${difTextColor}`} /> : <AlertTriangle className={`w-4 h-4 ${difTextColor}`} />}
                            <span className={`text-sm font-medium ${difTextColor}`}>Diferencia de efectivo</span>
                          </div>
                          <span className={`font-semibold text-base neb-tabular ${difTextColor}`}>
                            {dif === null ? '—'
                              : difExacta ? 'Cuadra exacto'
                              : dif > 0    ? `+$${dif.toFixed(2)} sobrante`
                              :              `-$${Math.abs(dif).toFixed(2)} faltante`}
                          </span>
                        </div>
                      </div>
                    )}

                    {caja.observaciones && (
                      <div className="flex gap-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl px-4 py-3">
                        <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          {caja.observaciones}
                        </p>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
