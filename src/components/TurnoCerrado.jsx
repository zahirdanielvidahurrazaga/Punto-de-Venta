import { useState } from 'react';
import { CheckCircle2, LogOut } from 'lucide-react';

// Lo que ve el empleado después del corte. Antes lo mandaba al checador con
// el menú ofreciendo "Apertura de Caja" otra vez, y el 10-sep se reabrió una
// caja a las 19:09 en la que cayeron las ventas de la mañana siguiente.
// Empezar otro turno sigue siendo posible, pero exige escanear el gafete de
// nuevo (y la base avisa al dueño de una segunda caja en el día).
export default function TurnoCerrado({ onLogout, onNuevoTurno }) {
  const [hora] = useState(() => new Date());
  return (
    <div className="h-full flex justify-center items-center p-5">
      <div className="w-full max-w-md">
        <div className="neb-card p-10 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center mb-5 border border-emerald-100">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight mb-2">Turno cerrado</h2>
          <p className="text-slate-500 dark:text-slate-400 text-[13px] mb-8">
            El corte quedó guardado y tu salida se registró a las{' '}
            {hora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.
          </p>
          <button onClick={onLogout} className="w-full neb-btn neb-btn-primary py-4 text-base">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
          <button onClick={onNuevoTurno} className="mt-3 text-[12px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
            Empezar otro turno (escanear gafete)
          </button>
        </div>
      </div>
    </div>
  );
}
