import React, { useState, useEffect, useRef } from 'react';
import { Clock, Loader2, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react';
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
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
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

      if (data) setAsistenciaActual(data);
      else setAsistenciaActual(null);
    } catch (error) {
      if (error.code !== 'PGRST116') console.error('Error fetching asistencia:', error.message);
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
        setTimeout(() => {
          if (onStatusChange) onStatusChange('caja');
        }, 1500);
      } catch (error) {
        setScanError("Error al registrar entrada: " + error.message);
        setLoading(false);
      }
    } else {
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
        setSuccessMessage('¡Salida registrada con éxito. Cerrando sesión...');

        setTimeout(async () => {
          await supabase.auth.signOut();
        }, 4000);

        if (onStatusChange) onStatusChange();
      } catch (error) {
        setScanError("Error al registrar salida: " + error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  if (loading && !asistenciaActual && !successMessage && !scanError) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-7 h-7 text-accent-500" /></div>;
  }

  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  if (successMessage) {
    return (
      <div className="h-full flex justify-center items-center p-5">
        <div className="w-full max-w-md">
          <div className="neb-glass-strong p-10 rounded-3xl flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-5 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-2">¡Todo listo!</h2>
            <p className="text-slate-500 font-bold text-[13px]">{successMessage}</p>
            <Loader2 className="w-5 h-5 text-slate-300 animate-spin mt-5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex justify-center items-center p-5">
      <div className="w-full max-w-lg">
        <div className="neb-card p-7 md:p-10 text-center relative overflow-hidden">

          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 neb-grad-primary rounded-2xl flex items-center justify-center neb-shadow-lg">
              <Clock className="w-8 h-8 text-white" />
            </div>
          </div>

          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.22em]">Reloj checador</p>
          <h2 className="text-2xl font-extrabold text-slate-900 mt-1 tracking-tight">Asistencia</h2>
          <p className="text-slate-400 text-[13px] mt-1 mb-7 font-bold">Escanea tu gafete para registrar tu horario</p>

          <div className="text-5xl font-mono font-extrabold text-slate-900 tracking-wider mb-2">
            {currentTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <p className="text-slate-400 font-bold capitalize text-[13px] mb-8">
            {currentTime.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <div className={`p-5 rounded-2xl border mb-6 ${
            asistenciaActual ? 'bg-emerald-50/50 border-emerald-100' : 'bg-slate-50 border-slate-100'
          }`}>
            {asistenciaActual ? (
              <div className="flex flex-col items-center">
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-[0.2em] mb-2">Estado actual</p>
                <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-base">
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                  Turno activo · Entrada {formatTime(asistenciaActual.fecha_entrada)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mb-2">Estado actual</p>
                <div className="flex items-center gap-2 text-slate-500 font-extrabold text-base">
                  <div className="w-2.5 h-2.5 bg-slate-300 rounded-full" />
                  Fuera de turno
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleScanSubmit} className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <ScanLine className="h-5 w-5 text-slate-400" />
            </div>
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              className="block w-full pl-12 pr-4 py-4 text-center text-lg tracking-[0.18em] font-mono font-extrabold text-slate-900 bg-white border-2 border-slate-200 rounded-2xl focus:outline-none focus:border-accent-400 focus:ring-4 focus:ring-accent-100 transition-all placeholder:text-slate-300"
              placeholder="ESCANEA GAFETE..."
              autoComplete="off"
              autoFocus
            />
          </form>

          {scanError && (
            <div className="mt-4 p-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl text-[13px] font-bold animate-in fade-in slide-in-from-bottom-2 flex items-center justify-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {scanError}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
