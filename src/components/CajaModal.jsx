import React, { useState, useEffect } from 'react';
import { Wallet, CheckCircle2, AlertCircle, Loader2, TrendingUp, CreditCard, Building2, Banknote } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CajaModal({ userProfile, onStatusChange }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [resumenVentas, setResumenVentas] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);

  // Apertura
  const [billetes, setBilletes] = useState('');
  const [monedas, setMonedas] = useState('');
  const [observacionesApertura, setObservacionesApertura] = useState('');

  // Cierre — confirmación de efectivo físico
  const [billetesToCierre, setBilletesToCierre] = useState('');
  const [monedasCierre, setMonedasCierre] = useState('');
  const [observacionesCierre, setObservacionesCierre] = useState('');

  useEffect(() => {
    fetchSessionCaja();
  }, []);

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
      const { data, error } = await supabase
        .from('ventas')
        .select('pago_efectivo, pago_tarjeta, pago_transferencia')
        .eq('user_id', userProfile.id)
        .gte('fecha', session.fecha_apertura);

      if (error) throw error;

      const totales = (data || []).reduce(
        (acc, v) => ({
          efectivo: acc.efectivo + (Number(v.pago_efectivo) || 0),
          tarjeta: acc.tarjeta + (Number(v.pago_tarjeta) || 0),
          transferencia: acc.transferencia + (Number(v.pago_transferencia) || 0),
        }),
        { efectivo: 0, tarjeta: 0, transferencia: 0 }
      );

      setResumenVentas(totales);
    } catch (err) {
      console.error('Error calculando resumen de ventas:', err.message);
    } finally {
      setLoadingResumen(false);
    }
  };

  const handleAbrirCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const totalFondo = (parseFloat(billetes) || 0) + (parseFloat(monedas) || 0);

      const { error } = await supabase
        .from('sesiones_caja')
        .insert([{
          usuario_id: userProfile.id,
          fondo_inicial: totalFondo,
          estado: 'abierta',
          observaciones: observacionesApertura,
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

      setSuccessMsg('¡Corte de caja realizado con éxito!');
      setTimeout(() => { if (onStatusChange) onStatusChange('asistencia'); }, 1500);
    } catch (error) {
      alert('Error al cerrar caja: ' + error.message);
      setLoading(false);
    }
  };

  if (loading && !sessionCaja && !successMsg) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="animate-spin w-8 h-8 text-primary-900" />
      </div>
    );
  }

  if (successMsg) {
    return (
      <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center items-center">
        <div className="w-full max-w-lg">
          <div className="bg-white p-10 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-6 shadow-sm border border-green-100">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">¡Todo Listo!</h2>
            <p className="text-slate-500 font-medium">{successMsg}</p>
            <Loader2 className="w-5 h-5 text-slate-300 animate-spin mt-6" />
          </div>
        </div>
      </div>
    );
  }

  // ── Cálculos de apertura ──
  const totalFondoApertura = (parseFloat(billetes) || 0) + (parseFloat(monedas) || 0);

  // ── Cálculos de cierre ──
  const fondoInicial       = parseFloat(sessionCaja?.fondo_inicial) || 0;
  const efectivoVentas     = resumenVentas?.efectivo || 0;
  const efectivoEsperado   = fondoInicial + efectivoVentas;
  const billetesVal        = parseFloat(billetesToCierre) || 0;
  const monedasVal         = parseFloat(monedasCierre) || 0;
  const efectivoDeclarado  = billetesVal + monedasVal;
  const diferencia         = efectivoDeclarado - efectivoEsperado;
  const cierreConfirmado   = billetesToCierre !== '' || monedasCierre !== '';

  const diferenciaColor = !cierreConfirmado
    ? ''
    : Math.abs(diferencia) < 0.01
      ? 'bg-green-50 border-green-200 text-green-700'
      : diferencia > 0
        ? 'bg-blue-50 border-blue-200 text-blue-700'
        : 'bg-red-50 border-red-200 text-red-700';

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center overflow-y-auto">
      <div className="w-full max-w-lg pb-8">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">

          {/* Header */}
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0">
              <Wallet className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {!sessionCaja ? 'Apertura de Caja' : 'Corte de Turno'}
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                {!sessionCaja
                  ? 'Ingresa el fondo inicial para comenzar a operar'
                  : 'Cierre de operaciones y declaración de efectivo'}
              </p>
            </div>
          </div>

          {/* ══════════════ APERTURA ══════════════ */}
          {!sessionCaja ? (
            <form onSubmit={handleAbrirCaja} className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex gap-3">
                <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 font-medium">
                  Actualmente no tienes una caja abierta. Registra tu fondo inicial.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">Billetes</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={billetes} onChange={(e) => setBilletes(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-800 mb-2">Monedas</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={monedas} onChange={(e) => setMonedas(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-800 text-white p-4 rounded-xl shadow-inner">
                <span className="font-bold text-sm text-slate-300 uppercase tracking-wider">Fondo Inicial Total:</span>
                <span className="font-black text-2xl">${totalFondoApertura.toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Observaciones de Apertura</label>
                <textarea
                  value={observacionesApertura} onChange={(e) => setObservacionesApertura(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm transition-all resize-none font-medium placeholder:text-slate-400"
                  placeholder="Ej: Billete de $500 rayado, faltan monedas de $1…"
                  rows={2}
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-colors text-lg flex justify-center items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Abrir Caja'}
              </button>
            </form>

          ) : (

            /* ══════════════ CIERRE ══════════════ */
            <form onSubmit={handleCerrarCaja} className="space-y-6">

              {/* Fondo inicial */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Caja Activa</p>
                  <p className="text-slate-900 font-black text-xl">
                    Fondo Inicial: <span className="font-mono">${fondoInicial.toFixed(2)}</span>
                  </p>
                </div>
                <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-6 h-6 text-slate-800" />
                </div>
              </div>

              {/* ── Resumen del turno desde la BD ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Resumen del Turno</p>
                </div>

                {loadingResumen ? (
                  <div className="flex items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400 mr-2" />
                    <span className="text-sm text-slate-400 font-medium">Calculando ventas…</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
                      <Banknote className="w-5 h-5 text-amber-600 mx-auto mb-2" />
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Efectivo</p>
                      <p className="font-black text-base text-amber-800">${efectivoVentas.toFixed(2)}</p>
                      <p className="text-[10px] text-amber-400 mt-0.5">en ventas</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-center">
                      <CreditCard className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Tarjeta</p>
                      <p className="font-black text-base text-blue-800">${(resumenVentas?.tarjeta || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-blue-400 mt-0.5">en ventas</p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-2xl p-3 text-center">
                      <Building2 className="w-5 h-5 text-purple-600 mx-auto mb-2" />
                      <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">Transf.</p>
                      <p className="font-black text-base text-purple-800">${(resumenVentas?.transferencia || 0).toFixed(2)}</p>
                      <p className="text-[10px] text-purple-400 mt-0.5">en ventas</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Efectivo esperado */}
              <div className="bg-slate-800 text-white p-4 rounded-2xl flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Efectivo Esperado en Caja</p>
                  <p className="text-xs text-slate-500">Fondo inicial + ventas en efectivo</p>
                </div>
                <span className="font-black text-2xl">${efectivoEsperado.toFixed(2)}</span>
              </div>

              {/* ── Confirmación de efectivo físico ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Banknote className="w-4 h-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cuenta el Efectivo Físico</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">Billetes</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={billetesToCierre} onChange={(e) => setBilletesToCierre(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-2">Monedas</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={monedasCierre} onChange={(e) => setMonedasCierre(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                {/* Diferencia en tiempo real */}
                {cierreConfirmado && (
                  <div className={`mt-4 p-4 rounded-xl border flex justify-between items-center ${diferenciaColor}`}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-0.5">Total declarado</p>
                      <p className="text-xl font-black">${efectivoDeclarado.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-0.5">Diferencia</p>
                      <p className="text-xl font-black">
                        {Math.abs(diferencia) < 0.01
                          ? '✓ Cuadra exacto'
                          : diferencia > 0
                            ? `+$${diferencia.toFixed(2)} sobrante`
                            : `-$${Math.abs(diferencia).toFixed(2)} faltante`}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Observaciones / Caja Chica</label>
                <textarea
                  value={observacionesCierre} onChange={(e) => setObservacionesCierre(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm transition-all resize-none font-medium placeholder:text-slate-400"
                  placeholder="Ej: Se tomaron $50 para agua, faltó ticket #4…"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !cierreConfirmado}
                className="w-full py-4 bg-primary-900 hover:bg-primary-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg transition-colors text-lg flex justify-center items-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Realizar Corte de Caja'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
