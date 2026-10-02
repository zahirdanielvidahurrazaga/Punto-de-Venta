import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Wallet, Plus, Minus } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { totalesDeSesion } from '../lib/ventas';
import { useRealtime } from '../lib/useRealtime';
import { revisarFondo } from '../lib/turno';

const fmtFondo = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function CajaModal({ userProfile, onStatusChange, cajaVencida = false }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [resumenVentas, setResumenVentas] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);

  // Sangrías (retiros / depósitos)
  const [movimientos, setMovimientos] = useState([]);
  const [movMonto, setMovMonto] = useState('');
  const [movMotivo, setMovMotivo] = useState('');
  const [savingMov, setSavingMov] = useState(false);

  const [billetes, setBilletes] = useState('');
  const [monedas, setMonedas] = useState('');
  const [observacionesApertura, setObservacionesApertura] = useState('');
  // Lo que el dueño deja en la caja de esta sucursal (sucursales.fondo_caja).
  const [fondoEsperado, setFondoEsperado] = useState(null);

  const [billetesToCierre, setBilletesToCierre] = useState('');
  const [monedasCierre, setMonedasCierre] = useState('');
  const [observacionesCierre, setObservacionesCierre] = useState('');

  useEffect(() => {
    fetchSessionCaja();
    fetchFondoEsperado();
  }, []);

  const fetchFondoEsperado = async () => {
    const { data } = await supabase
      .from('sucursales')
      .select('fondo_caja')
      .eq('id', userProfile.sucursal_id)
      .maybeSingle();
    setFondoEsperado(Number(data?.fondo_caja) || 1000);
  };

  const fetchSessionCaja = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('sesiones_caja')
        .select('*')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        setSessionCaja(data);
        fetchResumenVentas(data);
        fetchMovimientos(data.id);
      } else {
        setSessionCaja(null);
      }
    } catch (error) {
      if (error.code !== 'PGRST116') console.error('Error fetching caja:', error.message);
      setSessionCaja(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchResumenVentas = async (session) => {
    setLoadingResumen(true);
    try {
      // Por sesión (la relación exacta que guarda registrar_venta), calculado
      // por la base: es la MISMA cuenta del arqueo del Dashboard y de
      // Reportes → Cortes, y no se corta en 1000 filas si un turno se quedó
      // abierto varios días.
      const totales = await totalesDeSesion(session);

      setResumenVentas(totales);
    } catch (err) {
      console.error('Error calculando resumen de ventas:', err.message);
    } finally {
      setLoadingResumen(false);
    }
  };

  // Si se cobra o se hace un retiro desde otro dispositivo con esta misma
  // caja abierta, el resumen y el efectivo esperado se recalculan solos.
  useRealtime(
    [
      { tabla: 'ventas', filtro: `sesion_caja_id=eq.${sessionCaja?.id}` },
      { tabla: 'movimientos_caja', filtro: `sesion_caja_id=eq.${sessionCaja?.id}` },
    ],
    () => {
      if (!sessionCaja) return;
      fetchResumenVentas(sessionCaja);
      fetchMovimientos(sessionCaja.id);
    },
    { activo: !!sessionCaja?.id }
  );

  const fetchMovimientos = async (sesionId) => {
    try {
      const { data } = await supabase
        .from('movimientos_caja')
        .select('*')
        .eq('sesion_caja_id', sesionId)
        .order('created_at', { ascending: false });
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error cargando movimientos de caja:', err.message);
    }
  };

  const registrarMovimiento = async (tipo) => {
    const monto = parseFloat(movMonto);
    if (!monto || monto <= 0) { alert('Ingresa un monto mayor a cero.'); return; }
    setSavingMov(true);
    try {
      const { data, error } = await supabase.rpc('registrar_movimiento_caja', {
        p_tipo: tipo,
        p_monto: monto,
        p_motivo: movMotivo || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo registrar.');
      setMovMonto('');
      setMovMotivo('');
      if (sessionCaja) fetchMovimientos(sessionCaja.id);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSavingMov(false);
    }
  };

  const handleAbrirCaja = async (e) => {
    e.preventDefault();
    const totalFondo = (parseFloat(billetes) || 0) + (parseFloat(monedas) || 0);
    // El fondo es obligatorio: se abrían cajas en $0 y el corte salía con
    // "sobrantes" de mil pesos que en realidad eran el fondo sin anotar. La
    // base aplica la misma regla (trigger validar_apertura_caja).
    const revision = revisarFondo(totalFondo, fondoEsperado);
    if (revision.vacio) { alert('Cuenta el dinero que recibes en la caja y escríbelo en billetes y monedas.'); return; }
    if (revision.requiereMotivo && !observacionesApertura.trim()) {
      alert(`El fondo debe ser de ${fmtFondo(fondoEsperado)}. Escribe en observaciones por qué contaste ${fmtFondo(totalFondo)}.`);
      return;
    }
    setLoading(true);
    try {

      const { error } = await supabase
        .from('sesiones_caja')
        .insert([{
          usuario_id: userProfile.id,
          // Sin esto la sesión quedaba con sucursal_id NULL y los cortes
          // desaparecían al filtrar por sucursal en Reportes y Dashboard.
          sucursal_id: userProfile.sucursal_id || null,
          fondo_inicial: totalFondo,
          estado: 'abierta',
          observaciones: observacionesApertura.trim(),
        }]);

      if (error) throw error;

      setSuccessMsg('¡Apertura de caja exitosa!');
      setTimeout(() => { if (onStatusChange) onStatusChange('terminal'); }, 1000);
    } catch (error) {
      alert('Error al abrir caja: ' + error.message);
      setLoading(false);
    }
  };

  const handleCerrarCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const efectivoFisico = (parseFloat(billetesToCierre) || 0) + (parseFloat(monedasCierre) || 0);

      const { error } = await supabase
        .from('sesiones_caja')
        .update({
          estado: 'cerrada',
          fecha_cierre: new Date().toISOString(),
          efectivo_declarado: efectivoFisico,
          tarjeta_declarado: resumenVentas?.tarjeta || 0,
          transferencia_declarado: resumenVentas?.transferencia || 0,
          observaciones: observacionesCierre,
        })
        .eq('id', sessionCaja.id);

      if (error) throw error;

      // El corte cierra el turno: registra la salida aquí mismo. Antes la
      // salida era otro escaneo que se olvidaba, y con la checada abierta al
      // día siguiente la app se saltaba la entrada. Si esto fallara, el corte
      // ya quedó y la checada la cierra la base esa madrugada.
      const { error: errSalida } = await supabase
        .from('registro_asistencia')
        .update({ estado: 'completado', fecha_salida: new Date().toISOString(), tipo_salida: 'corte' })
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'trabajando');
      if (errSalida) console.error('Error registrando la salida con el corte:', errSalida.message);

      setSuccessMsg('Corte de caja realizado y salida registrada.');
      setTimeout(() => { if (onStatusChange) onStatusChange('turno_cerrado'); }, 1500);
    } catch (error) {
      alert('Error al cerrar caja: ' + error.message);
      setLoading(false);
    }
  };

  if (loading && !sessionCaja && !successMsg) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-7 h-7 text-accent-500" />
      </div>
    );
  }

  if (successMsg) {
    return (
      <div className="p-5 lg:p-8 h-full flex justify-center items-center">
        <div className="w-full max-w-md">
          <div className="neb-glass-strong p-10 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-5 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">¡Todo listo!</h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-[13px]">{successMsg}</p>
            <Loader2 className="w-5 h-5 text-slate-300 animate-spin mt-5" />
          </div>
        </div>
      </div>
    );
  }

  const totalFondoApertura = (parseFloat(billetes) || 0) + (parseFloat(monedas) || 0);
  const revisionFondo = revisarFondo(totalFondoApertura, fondoEsperado);
  const fondoCapturado = billetes !== '' || monedas !== '';
  const puedeAbrir = fondoEsperado !== null && !revisionFondo.vacio
    && (!revisionFondo.requiereMotivo || observacionesApertura.trim() !== '');
  const fondoInicial = parseFloat(sessionCaja?.fondo_inicial) || 0;
  const efectivoVentas = resumenVentas?.efectivo || 0;
  const totalRetiros = movimientos.filter(m => m.tipo === 'retiro').reduce((a, m) => a + Number(m.monto), 0);
  const totalDepositos = movimientos.filter(m => m.tipo === 'deposito').reduce((a, m) => a + Number(m.monto), 0);
  const efectivoEsperado = fondoInicial + efectivoVentas + totalDepositos - totalRetiros;
  const billetesVal = parseFloat(billetesToCierre) || 0;
  const monedasVal = parseFloat(monedasCierre) || 0;
  const efectivoDeclarado = billetesVal + monedasVal;
  const diferencia = efectivoDeclarado - efectivoEsperado;
  const cierreConfirmado = billetesToCierre !== '' || monedasCierre !== '';

  const diferenciaColor = !cierreConfirmado
    ? ''
    : Math.abs(diferencia) < 0.01
      ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
      : diferencia > 0
        ? 'bg-accent-50 border-accent-100 text-accent-700'
        : 'bg-rose-50 border-rose-100 text-rose-700';

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-8 flex justify-center">
        <div className="w-full max-w-lg pb-8">
          <div className="neb-card p-6 md:p-8">

            <div className="pb-5 mb-6 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                {!sessionCaja ? 'Apertura de caja' : 'Corte de turno'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-[13px] mt-1">
                {!sessionCaja
                  ? 'Cuenta el dinero que recibes para empezar a vender'
                  : 'Cierre de operaciones y declaración. Al terminar se registra tu salida.'}
              </p>
            </div>

            {!sessionCaja ? (
              <form onSubmit={handleAbrirCaja} className="space-y-5">
                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-slate-700 dark:text-slate-300">
                    El fondo de esta caja es de{' '}
                    <strong className="neb-tabular">{fondoEsperado !== null ? fmtFondo(fondoEsperado) : '…'}</strong>.
                    Cuéntalo y escribe cuánto recibes. No podrás vender hasta abrir la caja.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Billetes', value: billetes, setter: setBilletes },
                    { label: 'Monedas',  value: monedas,  setter: setMonedas  },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{f.label}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-medium">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={f.value} onChange={(e) => f.setter(e.target.value)}
                          className="neb-input pl-8 !text-base !font-semibold neb-tabular"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center bg-slate-900 text-white p-4 rounded-xl">
                  <span className="font-medium text-[12px] text-slate-300 uppercase tracking-wider">Fondo inicial total</span>
                  <span className="font-semibold text-xl neb-tabular">${totalFondoApertura.toFixed(2)}</span>
                </div>

                {fondoCapturado && fondoEsperado !== null && (
                  revisionFondo.ok ? (
                    <div className="p-3 rounded-xl border bg-emerald-50 border-emerald-100 text-emerald-700 text-[13px] font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" /> Cuadra con el fondo de {fmtFondo(fondoEsperado)}.
                    </div>
                  ) : revisionFondo.requiereMotivo ? (
                    <div className="p-3 rounded-xl border bg-amber-50 border-amber-100 text-amber-800 text-[13px] font-medium flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>
                        {revisionFondo.diferencia < 0
                          ? `Faltan ${fmtFondo(-revisionFondo.diferencia)}`
                          : `Sobran ${fmtFondo(revisionFondo.diferencia)}`} contra el fondo de {fmtFondo(fondoEsperado)}.
                        Vuelve a contar; si está bien, escribe abajo por qué. Se le avisará al administrador.
                      </span>
                    </div>
                  ) : null
                )}

                <div>
                  <label className={`block text-[11px] font-medium mb-1.5 ${revisionFondo.requiereMotivo ? 'text-amber-700' : 'text-slate-500 dark:text-slate-400'}`}>
                    {revisionFondo.requiereMotivo ? `¿Por qué no es ${fmtFondo(fondoEsperado)}? (obligatorio)` : 'Observaciones de apertura'}
                  </label>
                  <textarea
                    value={observacionesApertura} onChange={(e) => setObservacionesApertura(e.target.value)}
                    className="neb-input resize-none"
                    placeholder="Ej: Billete rayado, faltan monedas de $1..."
                    rows={2}
                  />
                </div>

                <button type="submit" disabled={loading || !puedeAbrir}
                  className="w-full neb-btn neb-btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Abrir caja'}
                </button>
              </form>

            ) : (

              <form onSubmit={handleCerrarCaja} className="space-y-5">
                {cajaVencida && (
                  <div className="p-4 rounded-xl border bg-amber-50 border-amber-100 text-amber-800 text-[13px] flex gap-3">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Esta caja se abrió el{' '}
                      <strong>{new Date(sessionCaja.fecha_apertura).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</strong>{' '}
                      y no se le hizo corte. Haz el corte para poder abrir la caja de hoy.
                    </p>
                  </div>
                )}
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider mb-1">Caja activa</p>
                    <p className="text-slate-900 dark:text-white font-semibold text-lg neb-tabular">
                      Fondo inicial: ${fondoInicial.toFixed(2)}
                    </p>
                  </div>
                  <div className="w-9 h-9 bg-emerald-50 border border-emerald-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-3">Resumen del turno</p>

                  {loadingResumen ? (
                    <div className="flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 dark:text-slate-500 mr-2" />
                      <span className="text-sm text-slate-400 dark:text-slate-500">Calculando ventas…</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Efectivo</p>
                        </div>
                        <p className="font-semibold text-base text-slate-900 dark:text-white neb-tabular">${efectivoVentas.toFixed(2)}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tarjeta</p>
                        </div>
                        <p className="font-semibold text-base text-slate-900 dark:text-white neb-tabular">${(resumenVentas?.tarjeta || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                          <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Transf.</p>
                        </div>
                        <p className="font-semibold text-base text-slate-900 dark:text-white neb-tabular">${(resumenVentas?.transferencia || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sangrías: retiros y depósitos */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" /> Retiros y depósitos
                    </p>
                    {(totalRetiros > 0 || totalDepositos > 0) && (
                      <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 neb-tabular">
                        −${totalRetiros.toFixed(2)} · +${totalDepositos.toFixed(2)}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-medium">$</span>
                      <input type="number" step="0.01" min="0" value={movMonto}
                        onChange={(e) => setMovMonto(e.target.value)}
                        className="neb-input pl-8 !text-base !font-semibold neb-tabular" placeholder="Monto" />
                    </div>
                    <input type="text" value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)}
                      className="neb-input flex-1" placeholder="Motivo (ej. pago a proveedor)" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <button type="button" disabled={savingMov} onClick={() => registrarMovimiento('retiro')}
                      className="neb-btn neb-btn-ghost py-2.5 text-rose-600 disabled:opacity-50">
                      <Minus className="w-4 h-4" /> Retiro
                    </button>
                    <button type="button" disabled={savingMov} onClick={() => registrarMovimiento('deposito')}
                      className="neb-btn neb-btn-ghost py-2.5 text-emerald-600 disabled:opacity-50">
                      <Plus className="w-4 h-4" /> Depósito
                    </button>
                  </div>

                  {movimientos.length > 0 && (
                    <div className="mt-3 space-y-1.5 max-h-36 overflow-y-auto neb-scroll">
                      {movimientos.map(m => (
                        <div key={m.id} className="flex items-center justify-between text-[12px] bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">
                          <span className="text-slate-600 dark:text-slate-300 truncate pr-2">
                            <span className={`font-semibold ${m.tipo === 'retiro' ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {m.tipo === 'retiro' ? 'Retiro' : 'Depósito'}
                            </span>
                            {m.motivo ? ` · ${m.motivo}` : ''}
                          </span>
                          <span className={`font-semibold neb-tabular shrink-0 ${m.tipo === 'retiro' ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {m.tipo === 'retiro' ? '−' : '+'}${Number(m.monto).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Efectivo esperado</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">fondo + ventas efectivo + depósitos − retiros</p>
                  </div>
                  <span className="font-semibold text-xl neb-tabular">${efectivoEsperado.toFixed(2)}</span>
                </div>

                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-3">Cuenta el efectivo físico</p>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Billetes', value: billetesToCierre, setter: setBilletesToCierre },
                      { label: 'Monedas',  value: monedasCierre,    setter: setMonedasCierre    },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">{f.label}</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-medium">$</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={f.value} onChange={(e) => f.setter(e.target.value)}
                            className="neb-input pl-8 !text-base !font-semibold neb-tabular"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {cierreConfirmado && (
                    <div className={`mt-3 p-4 rounded-xl border flex justify-between items-center ${diferenciaColor}`}>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-70 mb-0.5">Total declarado</p>
                        <p className="text-lg font-semibold neb-tabular">${efectivoDeclarado.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-70 mb-0.5">Diferencia</p>
                        <p className="text-base font-semibold neb-tabular">
                          {Math.abs(diferencia) < 0.01
                            ? 'Cuadra exacto'
                            : diferencia > 0
                              ? `+$${diferencia.toFixed(2)} sobrante`
                              : `-$${Math.abs(diferencia).toFixed(2)} faltante`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Observaciones / caja chica</label>
                  <textarea
                    value={observacionesCierre} onChange={(e) => setObservacionesCierre(e.target.value)}
                    className="neb-input resize-none"
                    placeholder="Ej: Se tomaron $50 para agua, faltó ticket #4..."
                    rows={3}
                  />
                </div>

                <button type="submit" disabled={loading || !cierreConfirmado}
                  className="w-full neb-btn neb-btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Realizar corte de caja'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
