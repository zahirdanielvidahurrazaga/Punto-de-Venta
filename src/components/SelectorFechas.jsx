import { toLocal } from '../lib/periodos';

// Dos fechas inclusivas. El "hasta" no puede pasar de hoy (no hay ventas futuras).
export default function SelectorFechas({ fechas, onChange }) {
  const hoy = toLocal(new Date());
  const cls = 'neb-input w-auto !py-1 text-[12px] font-semibold';
  return (
    <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
      <label className="flex items-center gap-1.5">Del
        <input type="date" className={cls} value={fechas.desde} max={fechas.hasta || hoy}
          onChange={e => onChange({ ...fechas, desde: e.target.value })} />
      </label>
      <label className="flex items-center gap-1.5">al
        <input type="date" className={cls} value={fechas.hasta} min={fechas.desde} max={hoy}
          onChange={e => onChange({ ...fechas, hasta: e.target.value })} />
      </label>
    </div>
  );
}
