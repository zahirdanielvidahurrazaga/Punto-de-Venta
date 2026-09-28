import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';
import { fmt } from './formato';

// Piezas visuales compartidas por las pestañas del Dashboard.

export function KpiCard({ label, value, icon: Icon, delta, nota }) {
  const deltaColor =
    delta?.tipo === 'positive' ? 'text-emerald-600 bg-emerald-50' :
    delta?.tipo === 'negative' ? 'text-rose-600 bg-rose-50' :
    'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';

  const DeltaIcon =
    delta?.tipo === 'positive' ? TrendingUp :
    delta?.tipo === 'negative' ? TrendingDown :
    delta ? Minus : null;

  return (
    <div className="neb-card p-5 flex flex-col relative">
      <div className="flex items-start justify-between mb-4">
        <div className="text-slate-400 dark:text-slate-500">
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${deltaColor}`}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" strokeWidth={2.5} />}
            {delta.txt}
          </span>
        )}
      </div>
      <div className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</div>
      <div className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
        {value}
      </div>
      {nota && (
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">{nota}</div>
      )}
    </div>
  );
}

export function DashboardHero({ userName }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Buenos días'   :
    hour < 19 ? 'Buenas tardes' :
                'Buenas noches';

  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div className="pt-6 pb-8 border-b border-slate-200 dark:border-slate-800">
      <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{dateStr}</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {greeting}, {userName.split(' ')[0]}.
      </h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">
        Aquí está el panorama de tu operación.
      </p>
    </div>
  );
}

export function RankingList({ items, valueKey, valueLabel }) {
  if (!items.length)
    return <p className="text-slate-400 dark:text-slate-500 text-sm py-6 text-center">Sin ventas en el periodo.</p>;

  const maxVal = Math.max(...items.map(p => p[valueKey]), 1);

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[11px] font-medium shrink-0 neb-tabular">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{p.nombre}</p>
              <p className="font-semibold text-slate-900 dark:text-white text-sm ml-2 shrink-0 neb-tabular">{valueLabel(p)}</p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-800 dark:bg-slate-300 transition-all duration-700"
                style={{ width: `${(p[valueKey] / maxVal) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono">{p.sku} · {p.categoria}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CategoryBreakdown({ categorias, etiqueta }) {
  if (!categorias.length) return null;
  const cats = categorias;
  const paleta = ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#c2dffe', '#e0efff'];

  return (
    <div className="neb-card p-5 lg:p-6">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Ingresos por Categoría</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Cobro de mostrador · {etiqueta}</p>
      </div>
      <div className="space-y-4">
        {cats.map((c, i) => (
          <div key={c.cat} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: paleta[i % paleta.length] }} />
            <div className="flex-1">
              <div className="flex justify-between mb-1.5">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{c.cat}</span>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.ingresos)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.ingresos / (cats[0]?.ingresos || 1)) * 100}%`, background: paleta[i % paleta.length] }}
                />
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 inline-block neb-tabular">{c.unidades} unidades</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// Aviso de pantalla: algo que el resumen NO puede ver, dicho en voz alta.
export function Aviso({ icon: Icon, titulo, children, tono = 'ambar' }) {
  const tonos = {
    ambar:   'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200',
    rosa:    'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  };
  return (
    <div className={`rounded-2xl border p-4 flex gap-3 ${tonos[tono]}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-[13px] leading-relaxed">
        <p className="font-semibold mb-0.5">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

export function Cargando() {
  return <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>;
}
