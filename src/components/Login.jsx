import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Lock, Mail, Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { TIENDA } from '../config/tienda';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/50">
      <div className="w-full max-w-sm">

        {/* Brand mark — logo del negocio */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 dark:border-slate-700 flex items-center justify-center mb-4 overflow-hidden shadow-sm">
            <img src="/tito-logo-mask.png" alt={TIENDA.nombre} className="w-12 h-12 object-contain" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white text-center leading-tight">
            {TIENDA.nombre}
          </h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            Inicia sesión en tu cuenta
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-3 rounded-xl text-[13px] font-medium border border-rose-100 flex items-center justify-center gap-2 animate-neb-shake">
              <ShieldCheck className="w-4 h-4" />
              {error === 'Invalid login credentials' ? 'Credenciales incorrectas' : error}
            </div>
          )}

          <div>
            <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neb-input pl-10"
                placeholder="usuario@plasticos.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neb-input pl-10"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full neb-btn neb-btn-primary py-3 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Ingresar</span>
              </>
            )}
          </button>
        </form>

        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-10">
          Zahir Daniel · Gestión Comercial
        </p>
      </div>
    </div>
  );
}
