import React, { useState, useMemo } from 'react';
import { ClipboardList, Search, FileText, Calendar, DollarSign, TrendingUp, Banknote, CreditCard } from 'lucide-react';
import TicketModal from './TicketModal';

export default function Pedidos({ ventas, isAdmin }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [dateFilter, setDateFilter] = useState('hoy');
  const [customDate, setCustomDate] = useState('');

  const toLocalDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const todayStr = toLocalDate(new Date());

  const filteredByDate = useMemo(() => {
    if (!ventas) return [];

    return ventas.filter(v => {
      if (!v.fecha) return false;
      const ventaDate = toLocalDate(v.fecha);

      switch(dateFilter) {
        case 'hoy':
          return ventaDate === todayStr;
        case 'ayer': {
          const ayer = new Date();
          ayer.setDate(ayer.getDate() - 1);
          return ventaDate === toLocalDate(ayer);
        }
        case '7dias': {
          const hace7 = new Date();
          hace7.setDate(hace7.getDate() - 7);
          return new Date(v.fecha) >= hace7;
        }
        case '30dias': {
          const hace30 = new Date();
          hace30.setDate(hace30.getDate() - 30);
          return new Date(v.fecha) >= hace30;
        }
        case 'custom':
          return customDate ? ventaDate === customDate : true;
        case 'todas':
        default:
          return true;
      }
    });
  }, [ventas, dateFilter, customDate, todayStr]);

  const filteredVentas = filteredByDate.filter(v => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.id?.toString().toLowerCase().includes(term) ||
      new Date(v.fecha).toLocaleDateString().includes(term)
    );
  });

  const totalVentas = filteredByDate.reduce((acc, v) => acc + Number(v.total), 0);
  const totalPedidos = filteredByDate.length;
  const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
  const totalEfectivo = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.efectivo || 0), 0);
  const totalTarjeta = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.tarjeta || 0), 0);
  const totalTransferencia = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.transferencia || 0), 0);

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  const formatTime = (dateStr) => new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  const filterLabels = {
    hoy: 'Hoy',
    ayer: 'Ayer',
    '7dias': '7 días',
    '30dias': '30 días',
    custom: 'Fecha',
    todas: 'Todas'
  };

  const Metric = ({ label, value, icon: Icon }) => (
    <div className="neb-card p-5 flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="text-slate-400 dark:text-slate-500">
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
      </div>
      <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</span>
      <p className="text-[24px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none neb-tabular">{value}</p>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-7xl mx-auto space-y-5">

        {/* Header — Apple */}
        <div className="pt-2 pb-2">
          <h1 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Pedidos realizados
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2">
            {isAdmin ? 'Historial completo y métricas financieras' : 'Historial de ventas de tu sesión'}
          </p>
        </div>

        {/* Filtros — segmented control */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Periodo
          </span>
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
            {['hoy', 'ayer', '7dias', '30dias', 'todas'].map(f => (
              <button key={f} onClick={() => setDateFilter(f)}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                  dateFilter === f
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300'
                }`}>
                {filterLabels[f]}
              </button>
            ))}
          </div>
          <input type="date" value={customDate}
            onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all cursor-pointer ${
              dateFilter === 'custom'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800'
            }`} />
        </div>

        {/* Métricas */}
        {isAdmin && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Ventas" value={`$${totalVentas.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={DollarSign} />
            <Metric label="Pedidos" value={totalPedidos} icon={TrendingUp} />
            <Metric label="Ticket prom." value={`$${ticketPromedio.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={Banknote} />
            <Metric label="Tarjeta" value={`$${totalTarjeta.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={CreditCard} />
          </div>
        )}

        {/* Desglose métodos — Apple */}
        {isAdmin && (
          <div className="neb-card p-4 flex flex-wrap gap-x-8 gap-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-slate-800" />
              <span className="text-slate-500 dark:text-slate-400 text-[13px]">Efectivo</span>
              <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">${totalEfectivo.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-slate-500 dark:text-slate-400 text-[13px]">Tarjeta</span>
              <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">${totalTarjeta.toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-violet-400" />
              <span className="text-slate-500 dark:text-slate-400 text-[13px]">Transferencia</span>
              <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">${totalTransferencia.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por #Ticket o Fecha..."
            className="neb-input pl-11"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Lista */}
        <div className="neb-card overflow-hidden">

          {/* Mobile */}
          <div className="block lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredVentas.map((venta) => (
              <div key={venta.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-white text-base neb-tabular">#{String(venta.id).padStart(4,'0').slice(0,8)}</span>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 neb-tabular">
                      <Calendar className="w-3 h-3" />
                      {formatDate(venta.fecha)} · {formatTime(venta.fecha)}
                    </div>
                  </div>
                  <span className="font-semibold text-slate-900 dark:text-white text-base neb-tabular">${Number(venta.total).toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5">
                    {venta.pagos?.efectivo > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
                    {venta.pagos?.tarjeta > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
                    {venta.pagos?.transferencia > 0 && <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[11px] font-medium">Transf.</span>}
                  </div>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 neb-tabular">{venta.items?.length || 0} arts.</span>
                </div>

                <button onClick={() => setSelectedVenta(venta)} className="w-full neb-btn neb-btn-ghost mt-1">
                  <FileText className="w-3.5 h-3.5" /> Ver ticket
                </button>
              </div>
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden lg:block overflow-x-auto neb-scroll">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-[0.12em]">
                  <th className="p-4 font-medium">Ticket</th>
                  <th className="p-4 font-medium">Fecha</th>
                  <th className="p-4 font-medium">Hora</th>
                  <th className="p-4 font-medium text-center">Artículos</th>
                  <th className="p-4 font-medium">Método</th>
                  <th className="p-4 font-medium text-right">Total</th>
                  <th className="p-4 font-medium text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredVentas.map((venta) => (
                  <tr key={venta.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-mono font-semibold text-slate-900 dark:text-white text-sm neb-tabular">#{String(venta.id).padStart(4,'0').slice(0,8)}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-[13px]">{formatDate(venta.fecha)}</td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-[12px] font-mono neb-tabular">{formatTime(venta.fecha)}</td>
                    <td className="p-4 text-center">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium neb-tabular">
                        {venta.items?.reduce((acc, i) => acc + i.quantity, 0) || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1.5">
                        {venta.pagos?.efectivo > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
                        {venta.pagos?.tarjeta > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
                        {venta.pagos?.transferencia > 0 && <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 text-[11px] font-medium">Transf.</span>}
                      </div>
                    </td>
                    <td className="p-4 text-right font-semibold text-slate-900 dark:text-white text-[14px] neb-tabular">
                      ${Number(venta.total).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => setSelectedVenta(venta)}
                        className="px-3 py-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVentas.length === 0 && (
            <div className="p-8 lg:p-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center">
              <ClipboardList className="w-12 h-12 opacity-30 mb-3" />
              <p className="font-bold text-base mb-1">Sin pedidos en este periodo</p>
              <p className="text-[12px]">Prueba cambiando el filtro de fechas o el término de búsqueda.</p>
            </div>
          )}
        </div>

      </div>

      {selectedVenta && (
        <TicketModal
          cart={selectedVenta.items}
          total={Number(selectedVenta.total)}
          paymentData={selectedVenta.pagos}
          onClose={() => setSelectedVenta(null)}
        />
      )}
    </div>
  );
}
