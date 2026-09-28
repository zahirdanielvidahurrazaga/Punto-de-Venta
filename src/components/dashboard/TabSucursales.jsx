import { Store, Truck, PackageX, AlertTriangle } from 'lucide-react';
import { Cargando, Aviso } from './ui';
import { fmt } from './formato';

export default function TabSucursales({ datos }) {
  const { comparativo, rango } = datos;
  const sinSucursal = datos.resumen.sinSucursal;
  const etq = rango.etiqueta;
  if (!comparativo) return <Cargando />;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-extrabold text-slate-900 dark:text-white">Comparativo de sucursales</h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
          Ventas de {etq} y existencias actuales. El filtro de sucursal de arriba no
          aplica aquí: esta pestaña siempre compara todas. Asignación de empleados en Equipo.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {comparativo.map(s => (
          <div key={s.id} className="neb-card p-5 space-y-5">
            <p className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Store className="w-4 h-4 text-accent-600" /> {s.nombre}
            </p>

            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Mostrador · {etq}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{fmt(s.total)}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ventas</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.tickets}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Tickets</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{fmt(s.ticketPromedio)}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ticket prom.</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{s.unidadesVendidas ?? '—'}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unid. vendidas</p>
                </div>
              </div>
            </div>

            {(s.rutaLiquidaciones > 0 || s.salidasMovs > 0 || s.correccionesMovs > 0) && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                {s.rutaLiquidaciones > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5" /> Ruta liquidada ({s.rutaLiquidaciones})
                    </span>
                    <span className="text-[13px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(s.rutaDinero)}</span>
                  </div>
                )}
                {s.salidasMovs > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <PackageX className="w-3.5 h-3.5" /> Bajas sueltas ({s.salidasMovs} mov.)
                    </span>
                    <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-300 neb-tabular">{fmt(s.salidasValor)}</span>
                  </div>
                )}
                {s.correccionesMovs > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                      <PackageX className="w-3.5 h-3.5" /> Correcciones de inventario ({s.correccionesMovs} mov.)
                    </span>
                    <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 neb-tabular">{fmt(s.correccionesValor)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Inventario actual</p>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <p className="text-2xl font-semibold text-emerald-600 neb-tabular leading-none">{fmt(s.valorInventario)}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Valor (a precio de venta)</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.unidades}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unidades</p>
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.conExistencia}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Con stock</p>
                </div>
                <div>
                  <p className={`text-base font-semibold neb-tabular leading-none ${s.bajos > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{s.bajos}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Stock bajo</p>
                </div>
                <div>
                  <p className={`text-base font-semibold neb-tabular leading-none ${s.enCero > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{s.enCero}</p>
                  <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">En cero</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                {s.productos} {s.productos === 1 ? 'renglón' : 'renglones'} de catálogo en esta sucursal.
              </p>
            </div>
          </div>
        ))}
      </div>

      {sinSucursal > 0 && (
        <Aviso icon={AlertTriangle} titulo={`${sinSucursal} venta(s) sin sucursal`}>
          No las cuenta ninguna tarjeta de arriba. Se registraron sin sucursal asignada
          (perfil sin sucursal y ninguna marcada como principal).
        </Aviso>
      )}
    </div>
  );
}
