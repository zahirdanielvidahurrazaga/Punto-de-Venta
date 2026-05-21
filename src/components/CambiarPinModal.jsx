import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { KeyRound, ShieldCheck, Loader2 } from 'lucide-react';

export default function CambiarPinModal({ onPinChanged }) {
  const [pinActual, setPinActual] = useState('');
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (pinNuevo !== pinConfirm) {
      return setError('Los PINs nuevos no coinciden.');
    }

    if (pinNuevo.length < 4) {
      return setError('El nuevo PIN debe tener al menos 4 dígitos.');
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('cambiar_pin', {
        pin_actual: pinActual,
        pin_nuevo: pinNuevo
      });

      if (rpcError) throw rpcError;

      if (!data.ok) {
        throw new Error(data.error || 'Error al cambiar el PIN');
      }

      onPinChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 bg-amber-50 border-b border-amber-100 flex items-center gap-3">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 shrink-0">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Cambio de PIN Requerido</h2>
            <p className="text-sm text-slate-600 mt-1">Por tu seguridad, debes cambiar tu PIN antes de continuar.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">PIN Actual</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinActual}
              onChange={(e) => setPinActual(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-2xl tracking-[0.5em] text-center"
              placeholder="••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Nuevo PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinNuevo}
              onChange={(e) => setPinNuevo(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-2xl tracking-[0.5em] text-center"
              placeholder="••••"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Confirmar Nuevo PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pinConfirm}
              onChange={(e) => setPinConfirm(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-mono text-2xl tracking-[0.5em] text-center"
              placeholder="••••"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-amber-500/30 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
              {loading ? 'Guardando...' : 'Guardar Nuevo PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
