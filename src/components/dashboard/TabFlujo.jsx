import { Wallet, Banknote, ArrowUpRight, BarChart3, AlertTriangle } from 'lucide-react';
import { KpiCard, Aviso } from './ui';
import { fmt, fmtFirmado } from './formato';

export default function TabFlujo({ datos }) {
  const { flujo, kpi, rango, cajasAbiertas } = datos;
  const etq = rango.etiqueta;

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={`Efectivo esperado · ${etq}`} value={fmt(flujo.esperado)} icon={Wallet}
                 nota="fondo + ventas en efectivo + depósitos − retiros" />
        <KpiCard label="Efectivo contado" value={fmt(flujo.declarado)} icon={Banknote}
                 nota={`${flujo.cerradas} turno(s) cerrado(s)`} />
        <KpiCard label="Diferencia" value={fmtFirmado(flujo.diferencia)} icon={ArrowUpRight}
                 delta={flujo.conDescuadre > 0
                   ? { txt: `${flujo.conDescuadre} turno(s)`, tipo: 'negative' }
                   : { txt: 'cuadrado', tipo: 'positive' }}
                 nota="contado − esperado" />
        <KpiCard label="Turnos abiertos" value={flujo.abiertas} icon={BarChart3}
                 nota={`${cajasAbiertas.length} caja(s) abierta(s) ahora`} />
      </div>

      {flujo.fueraDeCorte.tickets > 0 && (
        <Aviso icon={AlertTriangle} titulo={`${flujo.fueraDeCorte.tickets} venta(s) fuera de corte · ${fmt(flujo.fueraDeCorte.total)}`}>
          Se cobraron sin una caja abierta (el admin puede vender sin caja), así que
          su efectivo —{fmt(flujo.fueraDeCorte.efectivo)}— no lo respalda ningún arqueo.
        </Aviso>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="neb-card p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Cobro de mostrador</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Lo que registró la Terminal · {etq}</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              { label: 'Efectivo',      val: kpi.ef,    cls: 'bg-slate-900 dark:bg-slate-200' },
              { label: 'Tarjeta',       val: kpi.tar,   cls: 'bg-blue-500' },
              { label: 'Transferencia', val: kpi.trans, cls: 'bg-violet-400' },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${m.cls}`} />
                  <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                </div>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4 mt-1">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</span>
              <span className="text-[18px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(kpi.total)}</span>
            </div>
          </div>
        </div>

        <div className="neb-card p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Arqueo de los turnos cerrados</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              El dinero del cajón incluye el fondo y las sangrías; por eso se compara contra el esperado, no contra las ventas.
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              { label: 'Fondos iniciales',        val: flujo.totalFondos },
              { label: 'Efectivo de ventas',      val: flujo.ventasEf },
              { label: 'Depósitos a caja',        val: flujo.depositos },
              { label: 'Retiros / sangrías',      val: -flujo.retiros },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between py-3">
                <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Esperado en cajón</span>
              <span className="text-[16px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(flujo.esperado)}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contado por el cajero</span>
              <span className="text-[16px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(flujo.declarado)}</span>
            </div>
            <div className="flex items-center justify-between pt-4 mt-1">
              <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Diferencia</span>
              <span className={`text-[18px] font-semibold neb-tabular ${
                Math.abs(flujo.diferencia) < 1 ? 'text-emerald-600'
                  : flujo.diferencia < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                {fmtFirmado(flujo.diferencia)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {flujo.porEmpleado.length > 0 ? (
        <div className="neb-card p-5 lg:p-6">
          <div className="mb-5">
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Desglose por Empleado</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Turnos cerrados · {etq}</p>
          </div>
          <div className="overflow-x-auto neb-scroll">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="pb-3 font-medium text-left pl-2">Empleado</th>
                  <th className="pb-3 font-medium text-center">Turnos</th>
                  <th className="pb-3 font-medium text-right">Fondos</th>
                  <th className="pb-3 font-medium text-right">Ventas ef.</th>
                  <th className="pb-3 font-medium text-right">Sangrías</th>
                  <th className="pb-3 font-medium text-right">Esperado</th>
                  <th className="pb-3 font-medium text-right">Contado</th>
                  <th className="pb-3 font-medium text-right pr-2">Dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {flujo.porEmpleado.map(emp => {
                  const dif = emp.declarado - emp.esperado;
                  return (
                    <tr key={emp.nombre} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 font-medium text-slate-900 dark:text-white pl-2">{emp.nombre}</td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">{emp.turnos}</span>
                      </td>
                      <td className="py-3 text-right text-slate-500 dark:text-slate-400 neb-tabular">{fmt(emp.fondos)}</td>
                      <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.ventasEf)}</td>
                      <td className="py-3 text-right text-slate-500 dark:text-slate-400 neb-tabular">
                        {emp.retiros || emp.depositos
                          ? [emp.retiros   ? `−${fmt(emp.retiros)}`   : null,
                             emp.depositos ? `+${fmt(emp.depositos)}` : null].filter(Boolean).join(' · ')
                          : '—'}
                      </td>
                      <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.esperado)}</td>
                      <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.declarado)}</td>
                      <td className={`py-3 text-right font-semibold pr-2 neb-tabular ${
                        Math.abs(dif) < 1 ? 'text-emerald-600' : dif < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                        {fmtFirmado(dif)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
            Esperado = fondo inicial + ventas en efectivo del turno + depósitos − retiros.
            Entran los turnos que <strong>abrieron</strong> dentro del periodo (un turno que
            se queda abierto de un día para otro se cuenta en el día que abrió).
            El detalle turno por turno vive en Reportes → Cortes de caja.
          </p>
        </div>
      ) : (
        <div className="neb-card p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          No hay cortes de caja cerrados en {etq}.
        </div>
      )}
    </>
  );
}
