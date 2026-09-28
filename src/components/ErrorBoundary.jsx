import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { reportarError } from '../lib/errores';

// ─────────────────────────────────────────────────────────────────────────────
// Si una pantalla truena, React desmonta la app ENTERA y queda en blanco —
// sin menú, sin forma de salir más que cerrar la app. Fue lo que pasó el
// 27-sep-2026 al abrir un ticket desde Pedidos. Con esto el error se queda
// dentro de la pantalla que falló, se ve qué pasó, se reporta a la base y se
// puede reintentar o ir a otra sección.
// ─────────────────────────────────────────────────────────────────────────────
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Después de publicar una versión nueva, una pestaña abierta con la
    // versión vieja pide pantallas que ya no existen en el servidor. No es un
    // error de verdad: se recarga UNA vez para traer la versión nueva.
    if (/dynamically imported module|Importing a module script failed|error loading dynamically/i.test(error?.message || '')) {
      let ya = false;
      try { ya = sessionStorage.getItem('pos_recarga_version') === '1'; sessionStorage.setItem('pos_recarga_version', '1'); } catch { /* sin storage */ }
      if (!ya) { window.location.reload(); return; }
    }

    const conComponentes = new Error(error?.message || String(error));
    conComponentes.stack = `${error?.stack || ''}\n--- componentes ---${info?.componentStack || ''}`;
    reportarError(conComponentes, this.props.pantalla || null);
    console.error('Pantalla con error:', error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-full overflow-y-auto p-6 flex items-start justify-center">
        <div className="neb-card p-6 max-w-md w-full mt-8">
          <div className="w-11 h-11 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Esta pantalla tuvo un problema</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            No se perdió ninguna venta. El error ya quedó registrado para revisarlo.
            Puedes reintentar o ir a otra sección desde el menú.
          </p>
          <pre className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
            {String(error?.message || error)}
          </pre>
          <button onClick={() => this.setState({ error: null })} className="neb-btn neb-btn-primary w-full mt-4 py-3">
            <RotateCcw className="w-4 h-4" /> Reintentar
          </button>
        </div>
      </div>
    );
  }
}
