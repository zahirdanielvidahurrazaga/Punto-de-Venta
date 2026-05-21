import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Box, Lock, Mail, Loader2, KeyRound } from 'lucide-react';

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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      
      {/* Círculos de Fondo Ambientales (Glows) */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[6000ms]"></div>
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse duration-[8000ms]"></div>

      {/* Grid de Fondo Estético */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35"></div>

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl rounded-[2.5rem] p-8 lg:p-10 shadow-2xl border border-slate-800/80 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* Header de Login */}
        <div className="flex flex-col items-center justify-center mb-8">
          <div className="w-20 h-20 bg-grad-accent rounded-3xl flex items-center justify-center shadow-glow shadow-accent-500/10 mb-5 relative group">
            <div className="absolute inset-0 bg-white/10 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <Box className="w-10 h-10 text-white animate-bounce duration-[3000ms]" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            Plásticos POS
          </h1>
          <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mt-2">
            Panel de Operación
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-950/40 text-red-400 p-4 rounded-2xl text-xs font-bold border border-red-900/30 text-center animate-shake">
              {error === 'Invalid login credentials' ? 'Credenciales de acceso incorrectas' : error}
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Correo Electrónico
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors duration-200">
                <Mail className="h-5 w-5 text-slate-500 group-focus-within:text-accent-400" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full pl-11 pr-4 py-4 rounded-2xl border border-slate-800 bg-slate-950/40 focus:bg-slate-950/80 text-white placeholder-slate-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all text-sm"
                placeholder="usuario@plasticos.com"
                required
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Contraseña
              </label>
            </div>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-slate-500 group-focus-within:text-accent-400" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-11 pr-4 py-4 rounded-2xl border border-slate-800 bg-slate-950/40 focus:bg-slate-950/80 text-white placeholder-slate-600 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/10 outline-none transition-all text-sm"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          {/* Botón de Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-grad-accent hover:opacity-95 text-white font-bold py-4 rounded-2xl transition-all shadow-glow shadow-accent-500/10 active:scale-[0.98] flex justify-center items-center gap-2 btn-premium text-sm uppercase tracking-wider"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Ingresar al Sistema</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800/40 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
            Zahir Daniel • Software de Gestión Comercial
          </p>
        </div>
      </div>
    </div>
  );
}
