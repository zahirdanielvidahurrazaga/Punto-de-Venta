import { RankingList, CategoryBreakdown } from './ui';
import { fmt } from './formato';

export default function TabAnalisis({ datos }) {
  const { productos, rango } = datos;
  const etq = rango.etiqueta;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="neb-card p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 Más Vendidos</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Por unidades · {etq}</p>
          </div>
          <RankingList items={productos.top5Units} valueKey="unidades" valueLabel={(p) => `${p.unidades} uds`} />
        </div>
        <div className="neb-card p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 por Ingresos</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Mayor cobro · {etq}</p>
          </div>
          <RankingList items={productos.top5Revenue} valueKey="ingresos" valueLabel={(p) => fmt(p.ingresos)} />
        </div>
      </div>

      <div className="neb-card p-5 lg:p-6">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Menor Movimiento</h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Lo que menos se vendió (pero se vendió) · {etq}</p>
        </div>
        {productos.bottom5.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">Sin suficientes datos.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {productos.bottom5.map((p) => (
              <div key={p.id} className="rounded-xl p-4 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                <p className="font-medium text-slate-800 dark:text-slate-200 text-sm line-clamp-2 leading-tight mb-2">{p.nombre}</p>
                <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-2">{p.sku}</p>
                <p className="font-semibold text-slate-900 dark:text-white neb-tabular">{p.unidades} uds</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 neb-tabular">{fmt(p.ingresos)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {productos.sinMovimiento.length > 0 && (
        <div className="neb-card p-5 lg:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Con Existencia y Sin Vender</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                {productos.sinMovimiento.length} de {productos.conExistencia} productos del catálogo · {etq}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {productos.sinMovimiento.slice(0, 48).map(p => (
              <div key={p.id} className="rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                <p className="font-medium text-slate-800 dark:text-slate-200 text-xs line-clamp-2 leading-tight mb-1">{p.nombre}</p>
                <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-1">{p.sku}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 neb-tabular">{p.stock} en stock</p>
              </div>
            ))}
          </div>
          {productos.sinMovimiento.length > 48 && (
            <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-3">
              …y {productos.sinMovimiento.length - 48} más.
            </p>
          )}
        </div>
      )}

      <CategoryBreakdown categorias={productos.categorias} etiqueta={etq} />
    </>
  );
}
