import {
  DollarSign, ShoppingBag, TrendingUp, Banknote, Store, ScanLine, Truck, PackageX,
  AlertTriangle, Sparkles,
} from 'lucide-react';
import { KpiCard, Aviso } from './ui';
import { fmt, fmtFirmado } from './formato';
import { PZ_SALIDA_SUELTA } from './calculos';

export default function TabResumen({ datos }) {
  const { kpi, rango, cargaCatalogo, ruta, salidas, serie, cajasAbiertas, recientes, cargando } = datos;
  const etq = rango.etiqueta;
  const totalNegocio = kpi.total + ruta.dinero;
  const maxSerie   = Math.max(...serie.map(d => d.sum), 1);
  const totalSerie = serie.reduce((a, d) => a + d.sum, 0);
  const conVenta   = serie.filter(d => d.sum > 0).length;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={`Ventas de mostrador · ${etq}`} value={fmt(kpi.total)}
                 icon={DollarSign} delta={kpi.dTotal} nota={rango.comparativa} />
        <KpiCard label={`Tickets · ${etq}`} value={kpi.ordenes}
                 icon={ShoppingBag} delta={kpi.dOrdenes} nota={rango.comparativa} />
        <KpiCard label="Ticket promedio" value={fmt(kpi.ticket)}
                 icon={TrendingUp} delta={kpi.dTicket} nota={rango.comparativa} />
        <KpiCard label="Efectivo cobrado" value={fmt(kpi.ef)}
                 icon={Banknote} delta={kpi.dEf} nota={rango.comparativa} />
      </div>

      {/* Avance de la captura del catálogo. Se va solo cuando termine. */}
      {cargaCatalogo && cargaCatalogo.faltan > 0 && (
        <div className="neb-card p-5 lg:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                Avance de la carga de inventario
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                Productos del catálogo que ya tienen existencia capturada
              </p>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 neb-tabular">
              <strong className="text-slate-900 dark:text-white text-[18px]">{cargaCatalogo.con}</strong>
              {' '}de {cargaCatalogo.total} · faltan{' '}
              <strong className="text-amber-600">{cargaCatalogo.faltan}</strong>
            </p>
          </div>

          <div className="space-y-4">
            {cargaCatalogo.porSucursal.map(s => (
              <div key={s.id}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Store className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {s.nombre}
                  </span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 neb-tabular">
                    {s.con}/{s.total} · <strong className="text-slate-900 dark:text-white">{s.pct}%</strong>
                  </span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      s.pct >= 90 ? 'bg-emerald-500' : s.pct > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                    style={{ width: `${s.pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 neb-tabular">
                  {s.faltan === 0
                    ? 'Completa'
                    : `Falta${s.faltan === 1 ? '' : 'n'} ${s.faltan} producto${s.faltan === 1 ? '' : 's'} por capturar`}
                  {s.surtidos > 0 &&
                    ` · ${s.surtidos} recibi${s.surtidos === 1 ? 'ó' : 'eron'} mercancía en ${etq}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total del negocio: mostrador + ruta, y lo que no se ve */}
      <div className="neb-card p-5 lg:p-6">
        <div className="mb-5">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Total del negocio · {etq}</h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            Las ventas en ruta no pasan por la caja: se liquidan aparte y hasta ahora no entraban a ningún total.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <ScanLine className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span className="text-[13px] text-slate-700 dark:text-slate-300">
                Mostrador <span className="text-slate-400 dark:text-slate-500">· {kpi.ordenes} ticket(s)</span>
              </span>
            </div>
            <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(kpi.total)}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-2.5">
              <Truck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <span className="text-[13px] text-slate-700 dark:text-slate-300">
                Ventas en ruta <span className="text-slate-400 dark:text-slate-500">· {ruta.liquidaciones} liquidación(es)</span>
              </span>
            </div>
            <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(ruta.dinero)}</span>
          </div>
          {ruta.liquidaciones > 0 && (
            <div className="flex items-center justify-between py-3">
              <span className="text-[12px] text-slate-500 dark:text-slate-400 pl-7">
                Descuento de campo (lista {fmt(ruta.lista)} → cobrado {fmt(ruta.dinero)})
              </span>
              <span className="text-[13px] font-medium text-amber-600 neb-tabular">{fmtFirmado(-ruta.descuento)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-4 mt-1">
            <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</span>
            <span className="text-[20px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(totalNegocio)}</span>
          </div>
        </div>

        {ruta.vivas > 0 && (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-4 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" />
            {ruta.vivas} ruta(s) sin liquidar: su dinero todavía no cuenta en ningún total.
          </p>
        )}
      </div>

      {/* Inventario bajado a mano: los hechos, sin conclusiones */}
      {(salidas.mostrador.movimientos > 0 || salidas.correcciones.movimientos > 0) && (
        <Aviso
          icon={PackageX}
          tono="neutral"
          titulo={`${fmt(salidas.mostrador.valor + salidas.correcciones.valor)} de inventario bajado a mano · ${etq}`}
        >
          <p>
            Valuado a precio de venta. <strong>No es una venta ni entra a los totales de
            arriba.</strong> Mientras se siga capturando el catálogo, buena parte de esto son
            correcciones de la propia captura. Los ajustes hechos desde el 18-sep traen
            motivo; los anteriores salen como “sin motivo registrado”.
          </p>

          <div className="mt-3 space-y-1">
            {salidas.mostrador.movimientos > 0 && (
              <p className="neb-tabular">
                <strong>Bajas sueltas</strong> (1 a {PZ_SALIDA_SUELTA} pz):
                {' '}{fmt(salidas.mostrador.valor)} · {salidas.mostrador.movimientos} mov ·
                {' '}{salidas.mostrador.piezas} pz
                {salidas.mostrador.porPersona.length > 0 && (
                  <span className="opacity-80">
                    {' '}— {salidas.mostrador.porPersona.slice(0, 3)
                            .map(p => `${p.nombre} ${fmt(p.valor)}`).join(' · ')}
                  </span>
                )}
              </p>
            )}
            {salidas.correcciones.movimientos > 0 && (
              <p className="neb-tabular">
                <strong>Bajas de volumen</strong> (más de {PZ_SALIDA_SUELTA} pz):
                {' '}{fmt(salidas.correcciones.valor)} · {salidas.correcciones.movimientos} mov ·
                {' '}{salidas.correcciones.piezas} pz — por el tamaño solo pueden ser
                corrección de carga o de conteo.
              </p>
            )}
          </div>

          {salidas.conMotivo && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <p className="font-semibold mb-1">Por motivo</p>
              <ul className="space-y-0.5">
                {salidas.porMotivo.map(m => (
                  <li key={m.motivo} className="neb-tabular">
                    · {m.motivo}: {fmt(m.valor)} ({m.movimientos} mov, {m.piezas} pz)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {salidas.correcciones.mayores.length > 0 && (
            <ul className="mt-2 space-y-0.5 opacity-90">
              {salidas.correcciones.mayores.map(m => (
                <li key={m.id} className="neb-tabular">
                  · {m.nombre}: −{m.piezas} pz ({fmt(m.valor)}) ·{' '}
                  {new Date(m.cuando).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {m.quien}
                </li>
              ))}
            </ul>
          )}
        </Aviso>
      )}

      {/* Gráfica + cajas activas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="neb-card p-5 lg:p-6 lg:col-span-2 relative overflow-hidden">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
              Ventas de mostrador · {etq}
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 neb-tabular">
              {fmt(totalSerie)}
              <span className="text-slate-300 mx-1.5">·</span>
              promedio {fmt(totalSerie / Math.max(1, conVenta))} por {
                rango.grano === 'hora' ? 'hora con venta' :
                rango.grano === 'dia'  ? 'día con venta'  : 'mes con venta'
              }
            </p>
          </div>

          <div className="flex items-end justify-between gap-1 mt-6 h-48 border-b border-slate-100 dark:border-slate-800 pb-2">
            {serie.map((d, i) => {
              const pct = Math.round((d.sum / maxSerie) * 100);
              const alto = d.sum > 0 ? Math.max(pct, 4) : 0;
              const mostrarLabel = serie.length <= 16 || i % 5 === 0 || i === serie.length - 1;
              return (
                <div key={d.clave} className="flex flex-col items-center flex-1 group min-w-0"
                     style={{ height: '100%', justifyContent: 'flex-end' }}
                     title={`${d.label}: ${fmt(d.sum)} · ${d.count} ticket(s)`}>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {d.sum >= 1000 ? `${(d.sum/1000).toFixed(1)}k` : d.sum.toFixed(0)}
                  </div>
                  <div
                    className={`w-full max-w-[32px] rounded-t-md transition-all ${d.sum > 0 ? 'bg-slate-800 dark:bg-slate-300' : 'bg-slate-100 dark:bg-slate-800'}`}
                    style={{ height: `${alto}%` }}
                  />
                  <div className="mt-2 text-[10px] font-medium text-slate-400 dark:text-slate-500 capitalize truncate w-full text-center">
                    {mostrarLabel ? d.label : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="neb-card p-5 lg:p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Cajas Activas</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Ahora mismo, no del periodo</p>
            </div>
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">
              {cajasAbiertas.length}
            </span>
          </div>
          <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto neb-scroll">
            {cajasAbiertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-sm text-center">
                <AlertTriangle className="w-7 h-7 mb-2 opacity-30" />
                Sin cajas abiertas
              </div>
            ) : cajasAbiertas.map(c => (
              <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center font-medium text-sm shrink-0">
                  {(c.usuarios_perfiles?.nombre_completo || '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-[13px] truncate">{c.usuarios_perfiles?.nombre_completo}</p>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 neb-tabular">
                    desde {new Date(c.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.fondo_inicial)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Métodos de pago */}
      <div className="neb-card p-5 lg:p-6">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">Distribución por Método de Pago</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-6">Cobro de mostrador · {etq}</p>
        <div className="space-y-5">
          {[
            { label: 'Efectivo',      val: kpi.ef,    cls: 'bg-slate-900 dark:bg-slate-200' },
            { label: 'Tarjeta',       val: kpi.tar,   cls: 'bg-blue-500' },
            { label: 'Transferencia', val: kpi.trans, cls: 'bg-violet-400' },
          ].map(m => {
            const pct = kpi.total > 0 ? (m.val / kpi.total) * 100 : 0;
            return (
              <div key={m.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.cls}`} />
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                </div>
                <div className="text-right neb-tabular">
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{fmt(m.val)}</span>
                  <span className="text-[12px] text-slate-400 dark:text-slate-500 ml-2">{pct.toFixed(1)}%</span>
                </div>
                <div className="col-span-2 w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${m.cls}`}
                       style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transacciones recientes */}
      <div className="neb-card p-5 lg:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Transacciones Recientes</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              Últimas 8 de {kpi.ordenes} en {etq}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto neb-scroll">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="pb-3 pt-1 font-medium text-left px-3">Folio</th>
                <th className="pb-3 pt-1 font-medium text-left px-3">Fecha</th>
                <th className="pb-3 pt-1 font-medium text-left px-3">Corte</th>
                <th className="pb-3 pt-1 font-medium text-right px-3">Piezas</th>
                <th className="pb-3 pt-1 font-medium text-right px-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {recientes.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white whitespace-nowrap neb-tabular">#{v.folio}</td>
                  <td className="py-3 px-3 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    {v.sesion_caja_id ? (
                      <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 text-[11px] font-medium">En corte</span>
                    ) : (
                      <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-500/10 text-[11px] font-medium">Sin caja</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right text-[13px] text-slate-500 dark:text-slate-400 whitespace-nowrap neb-tabular">
                    {(v.venta_detalles || []).reduce((a, d) => a + (Number(d.cantidad) || 0), 0)}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-slate-900 dark:text-white text-[14px] whitespace-nowrap neb-tabular">
                    {fmt(v.total)}
                  </td>
                </tr>
              ))}
              {recientes.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  {cargando ? 'Cargando…' : `Sin ventas registradas en ${etq}.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
