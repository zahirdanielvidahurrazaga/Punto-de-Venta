import React, { useState, useEffect, useRef } from 'react';
import { Clock, Loader2, ScanLine, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function RelojChecador({ userProfile, onStatusChange }) {
  const [asistenciaActual, setAsistenciaActual] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [scanInput, setScanInput] = useState('');
  const [scanError, setScanError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    fetchAsistenciaActual();
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Mantener el foco en el input para el escáner si no está cargando
    if (!loading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [loading, asistenciaActual]);

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

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    setScanError('');
    setSuccessMessage('');
    const code = scanInput.trim();
    setScanInput('');

    if (!code) return;

    if (code !== userProfile.codigo_gafete) {
      setScanError('El gafete escaneado no coincide con tu perfil actual.');
      return;
    }

    setLoading(true);
    
    if (!asistenciaActual) {
      // Registrar Entrada
      try {
        const { error } = await supabase
          .from('registro_asistencia')
          .insert([{
            usuario_id: userProfile.id,
            estado: 'trabajando'
          }]);

        if (error) throw error;
        setSuccessMessage('¡Entrada registrada con éxito!');
        await fetchAsistenciaActual();
        if (onStatusChange) onStatusChange('caja');
      } catch (error) {
        setScanError("Error al registrar entrada: " + error.message);
        setLoading(false);
      }
    } else {
      // Registrar Salida (Validar Caja Primero)
      try {
        const { data: cajaAbierta } = await supabase
          .from('sesiones_caja')
          .select('id')
          .eq('usuario_id', userProfile.id)
          .eq('estado', 'abierta')
          .limit(1)
          .maybeSingle();

        if (cajaAbierta) {
          setScanError('Debes realizar el corte de caja antes de registrar tu salida.');
          setLoading(false);
          return;
        }

        const { error } = await supabase
          .from('registro_asistencia')
          .update({
            estado: 'completado',
            fecha_salida: new Date().toISOString(),
          })
          .eq('id', asistenciaActual.id);

        if (error) throw error;
        setAsistenciaActual(null);
        setSuccessMessage('¡Salida registrada con éxito. Buen descanso!');
        if (onStatusChange) onStatusChange();
      } catch (error) {
        setScanError("Error al registrar salida: " + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading && !asistenciaActual && !successMessage && !scanError) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 flex justify-center items-center">
      <div className="w-full max-w-lg">
        <div className="bg-white p-6 md:p-10 rounded-3xl shadow-lg border border-slate-200 text-center relative overflow-hidden">
          
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-slate-900 rounded-2xl flex items-center justify-center shadow-xl">
              <Clock className="w-10 h-10 text-white" />
            </div>
          </div>
          
          <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">Asistencia</h2>
          <p className="text-slate-500 text-sm mb-8 font-medium">Escanea tu gafete para registrar tu horario</p>

          <div className="text-5xl font-mono font-black text-slate-800 tracking-wider mb-2">
            {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p className="text-slate-400 font-medium mb-10 capitalize">
            {currentTime.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-8">
            {asistenciaActual ? (
              <div className="flex flex-col items-center">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2">Estado Actual</p>
                <div className="flex items-center gap-2 text-slate-800 font-black text-lg">
                  <div className="w-3 h-3 bg-primary-600 rounded-full animate-pulse"></div>
                  Turno Activo (Entrada: {formatTime(asistenciaActual.fecha_entrada)})
                </div>
              </div>
            ) : (
               <div className="flex flex-col items-center">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-2">Estado Actual</p>
                <div className="flex items-center gap-2 text-slate-400 font-bold text-lg">
                  <div className="w-3 h-3 bg-slate-300 rounded-full"></div>
                  Fuera de Turno
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleScanSubmit} className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <ScanLine className="h-6 w-6 text-slate-400" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="block w-full pl-12 pr-4 py-5 text-center text-xl tracking-widest font-mono font-bold text-slate-900 bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-primary-900 focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-300"
              placeholder="ESCANEA GAFETE AQUÍ..."
              autoComplete="off"
              autoFocus
            />
          </form>

          {scanError && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-bold animate-in fade-in slide-in-from-bottom-2">
              {scanError}
            </div>
          )}

          {successMessage && (
            <div className="mt-4 p-3 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 animate-in fade-in slide-in-from-bottom-2 shadow-lg">
              <CheckCircle className="w-5 h-5" /> {successMessage}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
