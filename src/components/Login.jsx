import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Box, Lock, Mail, Loader2, KeyRound, Sparkles, ShieldCheck } from 'lucide-react';

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
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">

      {/* Halos ambientales */}
      <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-accent-300/40 blur-[120px] pointer-events-none animate-neb-glow" />
      <div className="absolute -bottom-40 -right-40 w-[520px] h-[520px] rounded-full bg-indigo-200/50 blur-[140px] pointer-events-none animate-neb-glow" style={{ animationDelay: '1.5s' }} />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[380px] h-[380px] rounded-full bg-sky-100/60 blur-[100px] pointer-events-none animate-neb-glow" style={{ animationDelay: '2.5s' }} />

      {/* Sutil grid */}
      <div className="absolute inset-0 neb-grid-bg opacity-60 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_60%,transparent_100%)] pointer-events-none" />

      <div className="w-full max-w-md neb-glass-strong rounded-[2.25rem] p-8 lg:p-10 relative z-10">

        {/* Header */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-16 h-16 rounded-3xl neb-grad-primary flex items-center justify-center neb-shadow-lg mb-4 relative">
            <Box className="w-8 h-8 text-white" />
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white border border-slate-100 flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-accent-500" />
            </span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Plásticos POS
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em] mt-1.5">
            Panel de Operación
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="bg-rose-50 text-rose-600 p-3.5 rounded-2xl text-xs font-bold border border-rose-100 text-center animate-neb-shake flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              {error === 'Invalid login credentials' ? 'Credenciales incorrectas' : error}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">
              Correo electrónico
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-slate-400 group-focus-within:text-accent-500 transition-colors" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neb-input pl-11"
                placeholder="usuario@plasticos.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">
              Contraseña
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-slate-400 group-focus-within:text-accent-500 transition-colors" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neb-input pl-11"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Botón */}
          <button
            type="submit"
            disabled={loading}
            className="w-full neb-btn neb-btn-primary py-3.5 mt-2 text-[13px] uppercase tracking-[0.18em] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Ingresar al sistema</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-200/60 text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.22em]">
            Zahir Daniel · Gestión Comercial
          </p>
        </div>
      </div>
    </div>
  );
}
