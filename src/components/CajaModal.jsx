import React, { useState, useEffect } from 'react';
import { Wallet, CheckCircle2, AlertCircle, Loader2, TrendingUp, CreditCard, Building2, Banknote } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CajaModal({ userProfile, onStatusChange }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  const [resumenVentas, setResumenVentas] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);

  const [billetes, setBilletes] = useState('');
  const [monedas, setMonedas] = useState('');
  const [observacionesApertura, setObservacionesApertura] = useState('');

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
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2">¡Todo listo!</h2>
            <p className="text-slate-500 font-bold text-[13px]">{successMsg}</p>
            <Loader2 className="w-5 h-5 text-slate-300 animate-spin mt-5" />
          </div>
        </div>
      </div>
    );
  }

  const totalFondoApertura = (parseFloat(billetes) || 0) + (parseFloat(monedas) || 0);
  const fondoInicial = parseFloat(sessionCaja?.fondo_inicial) || 0;
  const efectivoVentas = resumenVentas?.efectivo || 0;
  const efectivoEsperado = fondoInicial + efectivoVentas;
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

            <div className="flex items-center gap-4 mb-7 pb-5 border-b border-slate-100">
              <div className="w-12 h-12 neb-grad-primary text-white rounded-2xl flex items-center justify-center shrink-0">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">{!sessionCaja ? 'Inicio' : 'Cierre'}</p>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {!sessionCaja ? 'Apertura de caja' : 'Corte de turno'}
                </h2>
                <p className="text-slate-400 text-[12px] font-bold mt-0.5">
                  {!sessionCaja ? 'Ingresa el fondo inicial para comenzar' : 'Cierre de operaciones y declaración'}
                </p>
              </div>
            </div>

            {!sessionCaja ? (
              <form onSubmit={handleAbrirCaja} className="space-y-5">
                <div className="bg-accent-50/60 p-4 rounded-2xl border border-accent-100 flex gap-3">
                  <AlertCircle className="w-4 h-4 text-accent-600 shrink-0 mt-0.5" />
                  <p className="text-[13px] text-accent-800 font-bold">
                    Aún no tienes una caja abierta. Registra tu fondo inicial.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Billetes', value: billetes, setter: setBilletes },
                    { label: 'Monedas',  value: monedas,  setter: setMonedas  },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{f.label}</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={f.value} onChange={(e) => f.setter(e.target.value)}
                          className="neb-input pl-8 !text-lg !font-extrabold"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center neb-grad-primary text-white p-4 rounded-2xl">
                  <span className="font-bold text-[12px] text-slate-300 uppercase tracking-[0.16em]">Fondo inicial total</span>
                  <span className="font-extrabold text-xl">${totalFondoApertura.toFixed(2)}</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones de apertura</label>
                  <textarea
                    value={observacionesApertura} onChange={(e) => setObservacionesApertura(e.target.value)}
                    className="neb-input resize-none"
                    placeholder="Ej: Billete rayado, faltan monedas de $1..."
                    rows={2}
                  />
                </div>

                <button type="submit" disabled={loading}
                  className="w-full neb-btn neb-btn-primary py-4 text-base">
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Abrir caja'}
                </button>
              </form>

            ) : (

              <form onSubmit={handleCerrarCaja} className="space-y-5">
                <div className="neb-card-soft p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.18em] mb-1">Caja activa</p>
                    <p className="text-slate-900 font-extrabold text-lg">
                      Fondo inicial: <span className="font-mono">${fondoInicial.toFixed(2)}</span>
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Resumen del turno</p>
                  </div>

                  {loadingResumen ? (
                    <div className="flex items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 mr-2" />
                      <span className="text-sm text-slate-400 font-bold">Calculando ventas…</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
                        <Banknote className="w-4 h-4 text-amber-600 mx-auto mb-1.5" />
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Efectivo</p>
                        <p className="font-extrabold text-base text-amber-800">${efectivoVentas.toFixed(2)}</p>
                      </div>
                      <div className="bg-accent-50 border border-accent-100 rounded-2xl p-3 text-center">
                        <CreditCard className="w-4 h-4 text-accent-600 mx-auto mb-1.5" />
                        <p className="text-[10px] font-bold text-accent-700 uppercase tracking-wider">Tarjeta</p>
                        <p className="font-extrabold text-base text-accent-800">${(resumenVentas?.tarjeta || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 text-center">
                        <Building2 className="w-4 h-4 text-violet-600 mx-auto mb-1.5" />
                        <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">Transf.</p>
                        <p className="font-extrabold text-base text-violet-800">${(resumenVentas?.transferencia || 0).toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="neb-grad-primary text-white p-4 rounded-2xl flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.16em] mb-0.5">Efectivo esperado</p>
                    <p className="text-[10px] text-slate-500">fondo + ventas en efectivo</p>
                  </div>
                  <span className="font-extrabold text-xl">${efectivoEsperado.toFixed(2)}</span>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Banknote className="w-3.5 h-3.5 text-slate-400" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Cuenta el efectivo físico</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Billetes', value: billetesToCierre, setter: setBilletesToCierre },
                      { label: 'Monedas',  value: monedasCierre,    setter: setMonedasCierre    },
                    ].map(f => (
                      <div key={f.label}>
                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">{f.label}</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold">$</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={f.value} onChange={(e) => f.setter(e.target.value)}
                            className="neb-input pl-8 !text-lg !font-extrabold"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {cierreConfirmado && (
                    <div className={`mt-3 p-4 rounded-2xl border flex justify-between items-center ${diferenciaColor}`}>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">Total declarado</p>
                        <p className="text-lg font-extrabold">${efectivoDeclarado.toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-0.5">Diferencia</p>
                        <p className="text-base font-extrabold">
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
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Observaciones / caja chica</label>
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
