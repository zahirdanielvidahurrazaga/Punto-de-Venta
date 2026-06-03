import { useState } from 'react';
import { X, ArrowRight, ArrowLeftRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function TransferenciaModal({ producto, sucursales, origenDefault, onClose, onDone }) {
  const otras = sucursales.filter(s => s.id !== origenDefault);
  const [origen, setOrigen] = useState(origenDefault || sucursales[0]?.id || '');
  const [destino, setDestino] = useState(otras[0]?.id || '');
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stockOrigen = producto?.sucursal_id === origen ? producto?.stock : null;

  const transferir = async () => {
    const cant = parseInt(cantidad);
    if (!cant || cant <= 0) { setError('Ingresa una cantidad válida.'); return; }
    if (origen === destino) { setError('Origen y destino deben ser distintos.'); return; }
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase.rpc('transferir_stock', {
        p_producto: producto.id,
        p_origen:   origen,
        p_destino:  destino,
        p_cantidad: cant,
        p_notas:    notas || null,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo transferir.');
      onDone?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden">

        <div className="px-6 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-accent-600" /> Transferir stock
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl px-4 py-3 border border-slate-100 dark:border-slate-800">
            <p className="font-semibold text-slate-900 dark:text-white text-[15px]">{producto?.nombre}</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{producto?.sku}</p>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Desde</label>
              <select value={origen} onChange={e => setOrigen(e.target.value)} className="neb-input w-full !py-2.5 text-sm">
                {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 mb-3" />
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Hacia</label>
              <select value={destino} onChange={e => setDestino(e.target.value)} className="neb-input w-full !py-2.5 text-sm">
                {sucursales.filter(s => s.id !== origen).map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          {stockOrigen != null && (
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              Disponible en origen: <span className="font-semibold text-slate-700 dark:text-slate-300">{stockOrigen}</span> un.
            </p>
          )}

          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Cantidad a transferir</label>
            <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)}
              className="neb-input w-full" placeholder="0" />
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Notas (opcional)</label>
            <input type="text" value={notas} onChange={e => setNotas(e.target.value)}
              className="neb-input w-full" placeholder="Ej. reabastecimiento" />
          </div>

          {error && (
            <p className="text-[12px] font-medium text-rose-600 bg-rose-50 border border-rose-100 py-2 px-3 rounded-xl">{error}</p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button type="button" onClick={onClose} className="flex-1 neb-btn neb-btn-ghost py-3">Cancelar</button>
            <button type="button" onClick={transferir} disabled={saving}
              className="flex-1 neb-btn neb-btn-primary py-3 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ArrowLeftRight className="w-4 h-4" /> Transferir</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
