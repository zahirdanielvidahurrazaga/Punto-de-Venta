import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { KeyRound, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';

export default function CambiarPinModal({ onPinChanged }) {
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (pinNuevo !== pinConfirm) return setError('Los PINs nuevos no coinciden.');
    if (pinNuevo.length < 4) return setError('El nuevo PIN debe tener al menos 4 dígitos.');

    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('cambiar_pin', {
        pin_actual: pinActual,
        pin_nuevo: pinNuevo
      });

      if (rpcError) throw rpcError;
      if (!data.ok) throw new Error(data.error || 'Error al cambiar el PIN');

      onPinChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden">
        <div className="p-6 bg-amber-50/70 border-b border-amber-100 flex items-center gap-3">
          <div className="w-12 h-12 bg-white border border-amber-100 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.18em]">Seguridad</p>
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Cambio de PIN requerido</h2>
            <p className="text-[12px] text-slate-600 mt-1 font-bold">Por tu seguridad, debes cambiar tu PIN antes de continuar.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 text-[13px] font-bold rounded-2xl border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          {[
            { label: 'PIN actual', value: pinActual, set: setPinActual },
            { label: 'Nuevo PIN', value: pinNuevo, set: setPinNuevo },
            { label: 'Confirmar nuevo PIN', value: pinConfirm, set: setPinConfirm },
          ].map(f => (
            <div key={f.label}>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{f.label}</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="neb-input text-center font-mono text-2xl tracking-[0.5em]"
                placeholder="••••"
                required
              />
            </div>
          ))}

          <div className="pt-2">
            <button type="submit" disabled={loading} className="w-full neb-btn neb-btn-primary py-3.5">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {loading ? 'Guardando…' : 'Guardar nuevo PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
