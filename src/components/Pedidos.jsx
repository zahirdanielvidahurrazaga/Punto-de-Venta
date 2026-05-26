import React, { useState, useMemo } from 'react';
import { ClipboardList, Search, FileText, Calendar, DollarSign, TrendingUp, Banknote, CreditCard, Building2 } from 'lucide-react';
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

  const Metric = ({ label, value, icon: Icon, iconBg, iconColor }) => (
    <div className="neb-card p-4 lg:p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <div className={`${iconBg} p-2 rounded-xl`}>
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} strokeWidth={2.5} />
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">{label}</span>
      </div>
      <p className="text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight">{value}</p>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">Histórico</p>
            <h1 className="text-2xl lg:text-[26px] font-extrabold text-slate-900 tracking-tight mt-1 flex items-center gap-2.5">
              <ClipboardList className="w-6 h-6 text-accent-600" />
              Pedidos realizados
            </h1>
            <p className="text-slate-400 text-[12px] font-bold mt-1">
              {isAdmin ? 'Historial completo y métricas financieras' : 'Historial de ventas de tu sesión'}
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="neb-card p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-[12px] font-bold text-slate-500">
              <Calendar className="w-3.5 h-3.5" /> Periodo
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['hoy', 'ayer', '7dias', '30dias', 'todas'].map(f => (
                <button key={f} onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                    dateFilter === f
                      ? 'neb-grad-primary text-white'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                  }`}>
                  {filterLabels[f]}
                </button>
              ))}
              <input type="date" value={customDate}
                onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                  dateFilter === 'custom'
                    ? 'neb-grad-primary text-white'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`} />
            </div>
          </div>
        </div>

        {/* Métricas */}
        {isAdmin && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Metric label="Ventas" value={`$${totalVentas.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={DollarSign} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
            <Metric label="Pedidos" value={totalPedidos} icon={TrendingUp} iconBg="bg-accent-50" iconColor="text-accent-600" />
            <Metric label="Ticket prom." value={`$${ticketPromedio.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={Banknote} iconBg="bg-amber-50" iconColor="text-amber-600" />
            <Metric label="Tarjeta" value={`$${totalTarjeta.toLocaleString('en-US', { minimumFractionDigits: 2 })}`} icon={CreditCard} iconBg="bg-violet-50" iconColor="text-violet-600" />
          </div>
        )}

        {/* Desglose métodos */}
        {isAdmin && (
          <div className="neb-card p-4 flex flex-wrap gap-5 lg:gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800" />
              <span className="text-slate-600 text-[13px]">Efectivo: <strong className="text-slate-900">${totalEfectivo.toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-accent-500" />
              <span className="text-slate-600 text-[13px]">Tarjeta: <strong className="text-slate-900">${totalTarjeta.toFixed(2)}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />
              <span className="text-slate-600 text-[13px]">Transferencia: <strong className="text-slate-900">${totalTransferencia.toFixed(2)}</strong></span>
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
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
          <div className="block lg:hidden divide-y divide-slate-50">
            {filteredVentas.map((venta) => (
              <div key={venta.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-extrabold text-slate-900 text-base">#{String(venta.id).padStart(4,'0').slice(0,8)}</span>
                    <div className="flex items-center gap-1 text-[11px] text-slate-500 mt-0.5 font-mono">
                      <Calendar className="w-3 h-3" />
                      {formatDate(venta.fecha)} · {formatTime(venta.fecha)}
                    </div>
                  </div>
                  <span className="font-extrabold text-accent-700 text-lg">${Number(venta.total).toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5 text-[10px]">
                    {venta.pagos?.efectivo > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
                    {venta.pagos?.tarjeta > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
                    {venta.pagos?.transferencia > 0 && <span className="neb-chip" style={{ background: '#f3f0ff', color: '#6d28d9' }}>Transf.</span>}
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">{venta.items?.length || 0} arts.</span>
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
                <tr className="bg-slate-50/60 border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-[0.15em]">
                  <th className="p-4 font-bold">Ticket</th>
                  <th className="p-4 font-bold">Fecha</th>
                  <th className="p-4 font-bold">Hora</th>
                  <th className="p-4 font-bold text-center">Artículos</th>
                  <th className="p-4 font-bold">Método</th>
                  <th className="p-4 font-bold text-right">Total</th>
                  <th className="p-4 font-bold text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredVentas.map((venta) => (
                  <tr key={venta.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-4 font-mono font-extrabold text-slate-900 text-sm">#{String(venta.id).padStart(4,'0').slice(0,8)}</td>
                    <td className="p-4 text-slate-600 text-sm font-bold">{formatDate(venta.fecha)}</td>
                    <td className="p-4 text-slate-500 text-sm font-mono">{formatTime(venta.fecha)}</td>
                    <td className="p-4 text-center">
                      <span className="neb-chip neb-chip-neutral">
                        {venta.items?.reduce((acc, i) => acc + i.quantity, 0) || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1.5 text-[10px]">
                        {venta.pagos?.efectivo > 0 && <span className="neb-chip neb-chip-warning">Efectivo</span>}
                        {venta.pagos?.tarjeta > 0 && <span className="neb-chip neb-chip-info">Tarjeta</span>}
                        {venta.pagos?.transferencia > 0 && <span className="neb-chip" style={{ background: '#f3f0ff', color: '#6d28d9' }}>Transf.</span>}
                      </div>
                    </td>
                    <td className="p-4 text-right font-extrabold text-accent-700 text-base">
                      ${Number(venta.total).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button onClick={() => setSelectedVenta(venta)}
                        className="px-3 py-1.5 text-[12px] font-bold text-accent-700 bg-accent-50 hover:bg-accent-100 border border-accent-100 rounded-xl transition-colors inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVentas.length === 0 && (
            <div className="p-8 lg:p-16 text-center text-slate-400 flex flex-col items-center">
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
