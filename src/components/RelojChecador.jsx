import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function RelojChecador({ userProfile }) {
  const [asistenciaActual, setAsistenciaActual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchAsistenciaActual();
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const fetchAsistenciaActual = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('registro_asistencia')
        .select('*')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'trabajando')
        .order('fecha_entrada', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        setAsistenciaActual(data);
      } else {
        setAsistenciaActual(null);
      }
    } catch (error) {
      if (error.code !== 'PGRST116') {
        console.error('Error fetching asistencia:', error.message);
      }
      setAsistenciaActual(null);
    } finally {
      setLoading(false);
    }
  };

  const handleEntrada = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registro_asistencia')
        .insert([{
          usuario_id: userProfile.id,
          estado: 'trabajando'
        }]);

      if (error) throw error;
      await fetchAsistenciaActual();
    } catch (error) {
      alert("Error al registrar entrada: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSalida = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('registro_asistencia')
        .update({
          estado: 'completado',
          fecha_salida: new Date().toISOString(),
        })
        .eq('id', asistenciaActual.id);

      if (error) throw error;
      setAsistenciaActual(null);
      alert("Salida registrada con éxito. ¡Buen descanso!");
    } catch (error) {
      alert("Error al registrar salida: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !asistenciaActual) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center">
      <div className="w-full max-w-lg">
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
          
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center">
              <Clock className="w-8 h-8 text-primary-900" />
            </div>
          </div>
          
          <h2 className="text-2xl font-black text-slate-800 mb-1">Reloj Checador</h2>
          <p className="text-slate-500 text-sm mb-8">Registro de Asistencia de Empleados</p>

          <div className="text-5xl font-mono font-black text-slate-800 tracking-wider mb-2">
            {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p className="text-slate-400 font-medium mb-10 capitalize">
            {currentTime.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {!asistenciaActual ? (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
                <p className="text-sm text-slate-500 font-medium">No has registrado tu entrada el día de hoy o ya finalizaste tu turno anterior.</p>
              </div>
              <button 
                onClick={handleEntrada}
                disabled={loading}
                className="w-full py-4 bg-primary-900 hover:bg-primary-800 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                Registrar Entrada
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col items-center justify-center py-6">
                <CheckCircle2 className="w-10 h-10 text-green-500 mb-2" />
                <p className="text-sm text-green-700 font-bold uppercase tracking-wider mb-1">Turno Activo</p>
                <p className="text-green-900 font-medium">
                  Entraste a las <strong>{formatTime(asistenciaActual.fecha_entrada)}</strong>
                </p>
              </div>
              
              <button 
                onClick={handleSalida}
                disabled={loading}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Registrar Salida
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
