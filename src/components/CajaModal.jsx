import React, { useState, useEffect } from 'react';
import { Wallet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function CajaModal({ userProfile }) {
  const [sessionCaja, setSessionCaja] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fondoInicial, setFondoInicial] = useState('');
  const [efectivoDeclarado, setEfectivoDeclarado] = useState('');
  const [tarjetaDeclarado, setTarjetaDeclarado] = useState('');

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
      if (error.code !== 'PGRST116') { // No se encontró fila
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
          transferencia_declarado: 0 // Simplificado para este ejemplo
        })
        .eq('id', sessionCaja.id);

      if (error) throw error;
      setSessionCaja(null);
      setEfectivoDeclarado('');
      setTarjetaDeclarado('');
      alert("Corte de caja realizado con éxito.");
    } catch (error) {
      alert("Error al cerrar caja: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center">
      <div className="w-full max-w-lg">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-primary-900 text-white rounded-xl flex items-center justify-center shadow-lg">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-800">Módulo de Caja</h2>
              <p className="text-slate-500 text-sm">Apertura y Corte de Turno</p>
            </div>
          </div>

          {!sessionCaja ? (
            <form onSubmit={handleAbrirCaja} className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 mb-6">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800 font-medium">Actualmente no tienes una caja abierta. Ingresa el fondo con el que iniciarás tu turno.</p>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Fondo Inicial (Efectivo en Caja)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={fondoInicial}
                    onChange={(e) => setFondoInicial(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 font-bold text-lg"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-primary-900 hover:bg-primary-800 text-white font-bold rounded-xl shadow-lg transition-colors mt-4">
                Abrir Caja
              </button>
            </form>
          ) : (
            <form onSubmit={handleCerrarCaja} className="space-y-4">
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex justify-between items-center mb-6">
                <div>
                  <p className="text-xs text-green-600 font-bold uppercase tracking-wider">Caja Activa</p>
                  <p className="text-green-800 font-black text-lg">Fondo Inicial: ${parseFloat(sessionCaja.fondo_inicial).toFixed(2)}</p>
                </div>
                <div className="w-10 h-10 bg-green-200 rounded-full flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-700" />
                </div>
              </div>

              <p className="text-sm text-slate-500 mb-4 font-medium">Al terminar tu turno, cuenta el dinero físico y decláralo aquí para calcular diferencias.</p>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Efectivo Total en Caja (Fondo + Ventas)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={efectivoDeclarado}
                    onChange={(e) => setEfectivoDeclarado(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 font-bold text-lg"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Vouchers de Tarjeta Totales</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={tarjetaDeclarado}
                    onChange={(e) => setTarjetaDeclarado(e.target.value)}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 font-bold text-lg"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-colors mt-6">
                Realizar Corte y Cerrar Caja
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
