import React, { useState, useEffect } from 'react';
import { Wallet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CajaModal({ userProfile, onStatusChange }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Campos de Apertura
  const [billetes, setBilletes] = useState('');
  const [monedas, setMonedas] = useState('');
  const [observacionesApertura, setObservacionesApertura] = useState('');
  
  // Campos de Cierre
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');
  const [tarjetaDeclarado, setTarjetaDeclarado] = useState('');
  const [observacionesCierre, setObservacionesCierre] = useState('');

  useEffect(() => {
    fetchSessionCaja();
  }, []);

  const fetchSessionCaja = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select('*')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        setSessionCaja(data);
      } else {
        setSessionCaja(null);
      }
    } catch (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error fetching caja:', error.message);
      }
      setSessionCaja(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const b = parseFloat(billetes) || 0;
      const m = parseFloat(monedas) || 0;
      const totalFondo = b + m;

      const { error } = await supabase
        .from('sesiones_caja')
        .insert([{
          usuario_id: userProfile.id,
          fondo_inicial: totalFondo,
          estado: 'abierta',
          observaciones: observacionesApertura
        }]);

      if (error) throw error;
      
      setSuccessMsg('¡Apertura de caja exitosa!');
      // NO llamamos fetchSessionCaja aquí para evitar el "flash" del formulario de cierre
      // Simplemente saltamos a terminal tras 1 segundo para mostrar el msj de éxito
      setTimeout(() => {
        if (onStatusChange) onStatusChange('terminal');
      }, 1000);
      
    } catch (error) {
      alert("Error al abrir caja: " + error.message);
      setLoading(false);
    }
  };

  const handleCerrarCaja = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sesiones_caja')
        .update({
          estado: 'cerrada',
          fecha_cierre: new Date().toISOString(),
          efectivo_declarado: parseFloat(efectivoDeclarado) || 0,
          tarjeta_declarado: parseFloat(tarjetaDeclarado) || 0,
          transferencia_declarado: 0,
          observaciones: observacionesCierre
        })
        .eq('id', sessionCaja.id);

      if (error) throw error;
      
      setSuccessMsg('¡Corte de caja realizado con éxito!');
      // Saltamos a asistencia tras 1.5 segundos
      setTimeout(() => {
        if (onStatusChange) onStatusChange('asistencia');
      }, 1500);

    } catch (error) {
      alert("Error al cerrar caja: " + error.message);
      setLoading(false);
    }
  };

  if (loading && !sessionCaja && !successMsg) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  // Vista de Éxito Inline (reemplaza el formulario completo)
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

  const bVal = parseFloat(billetes) || 0;
  const mVal = parseFloat(monedas) || 0;
  const totalFondo = bVal + mVal;

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center">
      <div className="w-full max-w-lg">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Wallet className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {!sessionCaja ? 'Apertura de Caja' : 'Corte de Turno'}
              </h2>
              <p className="text-slate-500 text-sm font-medium">
                {!sessionCaja ? 'Ingresa el fondo inicial para comenzar a operar' : 'Cierre de operaciones y declaración de efectivo'}
              </p>
            </div>
          </div>

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
                      type="number"
                      step="0.01"
                      min="0"
                      value={billetes}
                      onChange={(e) => setBilletes(e.target.value)}
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
                      type="number"
                      step="0.01"
                      min="0"
                      value={monedas}
                      onChange={(e) => setMonedas(e.target.value)}
                      className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-slate-800 text-white p-4 rounded-xl shadow-inner">
                <span className="font-bold text-sm text-slate-300 uppercase tracking-wider">Fondo Inicial Total:</span>
                <span className="font-black text-2xl">${totalFondo.toFixed(2)}</span>
              </div>

              <div className="pt-2">
                <label className="block text-sm font-bold text-slate-800 mb-2">Observaciones de Apertura</label>
                <textarea
                  value={observacionesApertura}
                  onChange={(e) => setObservacionesApertura(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm transition-all resize-none font-medium placeholder:text-slate-400"
                  placeholder="Ej: Billete de $500 rayado, faltan monedas de $1..."
                  rows={2}
                ></textarea>
              </div>

              <button type="submit" disabled={loading} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-colors mt-2 text-lg flex justify-center items-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Abrir Caja'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCerrarCaja} className="space-y-5">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex justify-between items-center">
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Caja Activa</p>
                  <p className="text-slate-900 font-black text-xl">Fondo Inicial: <span className="font-mono">${parseFloat(sessionCaja.fondo_inicial).toFixed(2)}</span></p>
                </div>
                <div className="w-12 h-12 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm">
                  <CheckCircle2 className="w-6 h-6 text-slate-800" />
                </div>
              </div>

              <p className="text-sm text-slate-500 font-medium pb-2 border-b border-slate-100">
                Al terminar tu turno, cuenta el dinero físico y decláralo aquí para calcular diferencias.
              </p>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Efectivo Total en Caja</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={efectivoDeclarado}
                    onChange={(e) => setEfectivoDeclarado(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Vouchers de Tarjeta Totales</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={tarjetaDeclarado}
                    onChange={(e) => setTarjetaDeclarado(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-lg transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-sm font-bold text-slate-800 mb-2">Observaciones / Caja Chica</label>
                <textarea
                  value={observacionesCierre}
                  onChange={(e) => setObservacionesCierre(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm transition-all resize-none font-medium placeholder:text-slate-400"
                  placeholder="Ej: Se tomaron $50 para agua, faltó ticket #4..."
                  rows={3}
                ></textarea>
              </div>

              <button type="submit" disabled={loading} className="w-full py-4 bg-primary-900 hover:bg-primary-800 text-white font-bold rounded-xl shadow-lg transition-colors mt-4 text-lg flex justify-center items-center gap-2">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Cerrar Caja'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
