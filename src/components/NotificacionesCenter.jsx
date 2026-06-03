import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Package, Clock, Wallet, CalendarDays, Check, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ICONOS = {
  stock_bajo: Package,
  asistencia: Clock,
  corte_caja: Wallet,
  pedido: CalendarDays,
};

const COLORES = {
  stock_bajo: 'text-amber-500 bg-amber-500/10',
  asistencia: 'text-sky-500 bg-sky-500/10',
  corte_caja: 'text-emerald-500 bg-emerald-500/10',
  pedido: 'text-violet-500 bg-violet-500/10',
};

function tiempoRelativo(fecha) {
  const seg = Math.floor((Date.now() - new Date(fecha).getTime()) / 1000);
  if (seg < 60) return 'ahora';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  return `hace ${Math.floor(seg / 86400)} d`;
}

export default function NotificacionesCenter() {
  const [abierto, setAbierto] = useState(false);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const panelRef = useRef(null);
  // Nombre de canal único por instancia: este componente se monta dos veces
  // (sidebar desktop + barra móvil) y compartir el mismo topic rompe el realtime.
  const canalId = useRef(`notificaciones-center-${Math.random().toString(36).slice(2)}`);

  const noLeidas = items.filter((n) => !n.leida).length;

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setItems(data || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    // Realtime: cada nuevo aviso se agrega arriba.
    const canal = supabase
      .channel(canalId.current)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones' },
        (payload) => setItems((prev) => [payload.new, ...prev].slice(0, 50))
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [cargar]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!abierto) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [abierto]);

  const marcarTodas = async () => {
    const ids = items.filter((n) => !n.leida).map((n) => n.id);
    if (!ids.length) return;
    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    await supabase.from('notificaciones').update({ leida: true }).in('id', ids);
  };

  const marcarUna = async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setAbierto((v) => !v)}
        className="relative w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-4 h-4" strokeWidth={1.8} />
        {noLeidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/70 dark:border-white/10 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
            <span className="text-sm font-semibold text-slate-900 dark:text-white">Avisos</span>
            {noLeidas > 0 && (
              <button
                onClick={marcarTodas}
                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto neb-scroll">
            {cargando ? (
              <div className="flex justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 dark:text-slate-500 text-sm">
                <Bell className="w-7 h-7 mx-auto mb-2 opacity-40" strokeWidth={1.5} />
                Sin avisos por ahora
              </div>
            ) : (
              items.map((n) => {
                const Icono = ICONOS[n.tipo] || Bell;
                const color = COLORES[n.tipo] || 'text-slate-500 bg-slate-500/10';
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.leida && marcarUna(n.id)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors ${!n.leida ? 'bg-sky-50/50 dark:bg-sky-500/5' : ''}`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color}`}>
                      <Icono className="w-4 h-4" strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{n.titulo}</p>
                        {!n.leida && <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />}
                      </div>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5 line-clamp-2">{n.cuerpo}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{tiempoRelativo(n.created_at)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
