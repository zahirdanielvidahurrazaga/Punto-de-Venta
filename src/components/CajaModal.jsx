import React, { useState, useEffect } from 'react';
import { Wallet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CajaModal({ userProfile, onStatusChange }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [fondoInicial, setFondoInicial] = useState('');
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');
  const [tarjetaDeclarado, setTarjetaDeclarado] = useState('');
  const [observaciones, setObservaciones] = useState('');

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
      const { error } = await supabase
        .from('sesiones_caja')
        .insert([{
          usuario_id: userProfile.id,
          fondo_inicial: parseFloat(fondoInicial) || 0,
          estado: 'abierta'
        }]);

      if (error) throw error;
      await fetchSessionCaja();
      if (onStatusChange) onStatusChange();
    } catch (error) {
      alert("Error al abrir caja: " + error.message);
    } finally {
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
          observaciones: observaciones
        })
        .eq('id', sessionCaja.id);

      if (error) throw error;
      setSessionCaja(null);
      setEfectivoDeclarado('');
      setTarjetaDeclarado('');
      setObservaciones('');
      alert("Corte de caja realizado con éxito.");
      if (onStatusChange) onStatusChange();
    } catch (error) {
      alert("Error al cerrar caja: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !sessionCaja) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center">
      <div className="w-full max-w-lg">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Wallet className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">Caja Operativa</h2>
              <p className="text-slate-500 text-sm font-medium">Apertura y Corte de Turno</p>
            </div>
          </div>

          {!sessionCaja ? (
            <form onSubmit={handleAbrirCaja} className="space-y-6">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex gap-3">
                <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600 font-medium">
                  Actualmente no tienes una caja abierta. Ingresa el fondo con el que iniciarás tu turno.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-800 mb-2">Fondo Inicial (Efectivo en Caja)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={fondoInicial}
                    onChange={(e) => setFondoInicial(e.target.value)}
                    className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white font-bold text-xl transition-all placeholder:text-slate-300"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-colors mt-2 text-lg">
                Abrir Caja
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
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
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
