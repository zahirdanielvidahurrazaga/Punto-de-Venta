import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  Loader2, FileText, Clock, Wallet, Banknote, CreditCard,
  Building2, TrendingUp, AlertTriangle, CheckCircle, Timer, ShoppingBag
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
    <div className={`${dim} rounded-full bg-slate-200 flex items-center justify-center font-black text-slate-600 shrink-0`}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

function StatChip({ label, value, accent = false, warn = false }) {
  return (
    <div className={`rounded-2xl border p-4 text-center shadow-sm ${
      warn && value > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'
    }`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
        warn && value > 0 ? 'text-red-500' : 'text-slate-400'
      }`}>{label}</p>
      <p className={`text-2xl font-black ${
        warn && value > 0 ? 'text-red-600' : accent ? 'text-emerald-600' : 'text-slate-800'
      }`}>{value}</p>
    </div>
  );
}

export default function Reportes() {
  const [activeTab, setActiveTab]   = useState('asistencias');
  const [asistencias, setAsistencias] = useState([]);
  const [cajas, setCajas]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState(0);

  useEffect(() => { fetchData(); }, [activeTab, filtro]);

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
      .select('*, usuarios_perfiles (nombre_completo)')
      .gte('fecha_entrada', desde)
      .order('fecha_entrada', { ascending: false })
      .limit(100);
    if (error) throw error;
    setAsistencias(data || []);
  };

  const fetchCajas = async (desde) => {
    const { data: cajasData, error } = await supabase
      .from('sesiones_caja')
      .select('*, usuarios_perfiles (id, nombre_completo)')
      .gte('fecha_apertura', desde)
      .order('fecha_apertura', { ascending: false })
      .limit(50);
    if (error) throw error;
    if (!cajasData?.length) { setCajas([]); return; }

    // Un solo query adicional: ventas desde la sesión más antigua cargada
    const minFecha = cajasData[cajasData.length - 1].fecha_apertura;
    const { data: ventasRaw } = await supabase
      .from('ventas')
      .select('user_id, pago_efectivo, pago_tarjeta, pago_transferencia, fecha')
      .gte('fecha', minFecha);

    // Mapear ventas a cada sesión por empleado + rango de fechas
    const result = cajasData.map(caja => {
      const apertura = new Date(caja.fecha_apertura);
      const cierre   = caja.fecha_cierre ? new Date(caja.fecha_cierre) : new Date();

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

      const efectivoEsperado = (Number(caja.fondo_inicial) || 0) + ventas.efectivo;
      const diferencia = caja.estado === 'cerrada'
        ? (Number(caja.efectivo_declarado) || 0) - efectivoEsperado
        : null;

      return { ...caja, ventas, efectivoEsperado, diferencia };
    });

    setCajas(result);
  };

  // Estadísticas globales del período
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
    <div className="p-4 lg:p-8 h-full bg-slate-50 overflow-y-auto">
      <div className="max-w-5xl mx-auto">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Reportes Generales</h2>
            <p className="text-slate-500 text-sm font-medium">Historial de asistencia y cortes de caja</p>
          </div>
        </div>

        {/* ── Tabs + Filtro de período ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex bg-white rounded-2xl shadow-sm border border-slate-200 p-1 w-fit">
            {['asistencias', 'cajas'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 text-sm font-bold rounded-xl transition-all ${
                  activeTab === tab
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab === 'asistencias' ? 'Asistencias' : 'Cortes de Caja'}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {FILTROS.map((f, i) => (
              <button
                key={i}
                onClick={() => setFiltro(i)}
                className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  filtro === i
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contenido ── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin w-8 h-8 text-primary-900" />
          </div>

        ) : activeTab === 'asistencias' ? (

          /* ════════════════ ASISTENCIAS ════════════════ */
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-bold">Empleado</th>
                    <th className="p-4 font-bold">Estado</th>
                    <th className="p-4 font-bold">Entrada</th>
                    <th className="p-4 font-bold">Salida</th>
                    <th className="p-4 font-bold">Duración</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {asistencias.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 font-bold text-slate-800">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.usuarios_perfiles?.nombre_completo} size="sm" />
                          {r.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          r.estado === 'trabajando'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {r.estado === 'trabajando' ? '● Activo' : '✓ Completado'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-xs">{fmt(r.fecha_entrada)}</td>
                      <td className="p-4 font-mono text-xs">
                        {r.fecha_salida
                          ? <span className="text-slate-500">{fmt(r.fecha_salida)}</span>
                          : <span className="text-emerald-500 font-bold">En turno</span>}
                      </td>
                      <td className="p-4 text-slate-500 text-xs">
                        <div className="flex items-center gap-1">
                          <Timer className="w-3 h-3" />
                          {duracion(r.fecha_entrada, r.fecha_salida)}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {asistencias.length === 0 && (
                    <tr>
                      <td colSpan="5" className="p-12 text-center text-slate-400 font-medium">
                        No hay registros de asistencia en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        ) : (

          /* ════════════════ CORTES DE CAJA ════════════════ */
          <div className="space-y-4">

            {/* Resumen global del período */}
            {cajas.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
                <StatChip label="Turnos cerrados"  value={stats.cerradas} />
                <StatChip label="Turnos abiertos"  value={stats.abiertas}  accent />
                <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total vendido</p>
                  <p className="text-2xl font-black text-slate-800">
                    ${stats.totalVentas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <StatChip label="Con diferencias"  value={stats.conDiferencia} warn />
              </div>
            )}

            {/* Tarjetas por sesión */}
            {cajas.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center text-slate-400 font-medium">
                No hay cortes de caja en este período.
              </div>
            ) : cajas.map((caja) => {
              const cerrada    = caja.estado === 'cerrada';
              const dif        = caja.diferencia;
              const difExacta  = dif !== null && Math.abs(dif) < 0.01;
              const difSobra   = dif !== null && dif > 0;
              const difFalta   = dif !== null && dif < -0.01;

              const difTextColor = difExacta ? 'text-emerald-600'
                : difSobra ? 'text-blue-600'
                : difFalta ? 'text-red-600'
                : 'text-slate-400';

              const difBg = difExacta ? 'bg-emerald-50 border-emerald-200'
                : difSobra ? 'bg-blue-50 border-blue-200'
                : difFalta ? 'bg-red-50 border-red-200'
                : 'bg-slate-50 border-slate-200';

              return (
                <div key={caja.id} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">

                  {/* Cabecera de la tarjeta */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={caja.usuarios_perfiles?.nombre_completo} />
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">
                          {caja.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400 font-medium mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmt(caja.fecha_apertura)}
                          </span>
                          {caja.fecha_cierre && (
                            <>
                              <span className="text-slate-300">→</span>
                              <span>{fmt(caja.fecha_cierre)}</span>
                            </>
                          )}
                          <span className="text-slate-300 hidden sm:inline">·</span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {duracion(caja.fecha_apertura, caja.fecha_cierre)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className={`ml-3 shrink-0 px-3 py-1 rounded-xl text-xs font-bold ${
                      cerrada ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {cerrada ? '✓ Cerrada' : '● Abierta'}
                    </span>
                  </div>

                  <div className="p-5 lg:p-6 space-y-5">

                    {/* ── Ventas del turno (calculadas desde BD) ── */}
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        Ventas del Turno
                        <span className="flex items-center gap-1 ml-1 font-normal text-slate-300">
                          <ShoppingBag className="w-3 h-3" />
                          {caja.ventas.count} {caja.ventas.count === 1 ? 'venta' : 'ventas'}
                        </span>
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Banknote className="w-3.5 h-3.5 text-amber-500" />
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Efectivo</p>
                          </div>
                          <p className="font-black text-lg text-amber-800">
                            ${caja.ventas.efectivo.toFixed(2)}
                          </p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Tarjeta</p>
                          </div>
                          <p className="font-black text-lg text-blue-800">
                            ${caja.ventas.tarjeta.toFixed(2)}
                          </p>
                        </div>
                        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Building2 className="w-3.5 h-3.5 text-purple-500" />
                            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Transf.</p>
                          </div>
                          <p className="font-black text-lg text-purple-800">
                            ${caja.ventas.transferencia.toFixed(2)}
                          </p>
                        </div>
                        <div className="bg-slate-800 rounded-xl p-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Total</p>
                          <p className="font-black text-lg text-white">
                            ${caja.ventas.total.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* ── Corte de efectivo (solo sesiones cerradas) ── */}
                    {cerrada && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5" />
                          Corte de Efectivo
                        </p>

                        <div className="grid grid-cols-3 gap-2 mb-2">
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Fondo inicial
                            </p>
                            <p className="font-black text-base text-slate-700">
                              ${Number(caja.fondo_inicial || 0).toFixed(2)}
                            </p>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Esperado
                            </p>
                            <p className="font-black text-base text-slate-700">
                              ${(caja.efectivoEsperado || 0).toFixed(2)}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">fondo + ventas</p>
                          </div>
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                              Declarado
                            </p>
                            <p className="font-black text-base text-slate-700">
                              ${Number(caja.efectivo_declarado || 0).toFixed(2)}
                            </p>
                            <p className="text-[9px] text-slate-400 mt-0.5">billetes + monedas</p>
                          </div>
                        </div>

                        {/* Diferencia */}
                        <div className={`px-4 py-3 rounded-xl border flex items-center justify-between ${difBg}`}>
                          <div className="flex items-center gap-2">
                            {difExacta
                              ? <CheckCircle className={`w-4 h-4 ${difTextColor}`} />
                              : <AlertTriangle className={`w-4 h-4 ${difTextColor}`} />}
                            <span className={`text-sm font-bold ${difTextColor}`}>Diferencia de efectivo</span>
                          </div>
                          <span className={`font-black text-lg ${difTextColor}`}>
                            {dif === null ? '—'
                              : difExacta ? 'Cuadra exacto'
                              : dif > 0    ? `+$${dif.toFixed(2)} sobrante`
                              :              `-$${Math.abs(dif).toFixed(2)} faltante`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* ── Notas del empleado ── */}
                    {caja.observaciones && (
                      <div className="flex gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">
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
