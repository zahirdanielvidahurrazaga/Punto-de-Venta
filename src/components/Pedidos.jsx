import React, { useState, useMemo } from 'react';
import { ClipboardList, Search, FileText, Calendar, DollarSign, TrendingUp, Banknote, CreditCard, Building, ChevronDown } from 'lucide-react';
import TicketModal from './TicketModal';

export default function Pedidos({ ventas }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenta, setSelectedVenta] = useState(null);
  const [dateFilter, setDateFilter] = useState('hoy');
  const [customDate, setCustomDate] = useState('');

  // Helper para obtener fecha local YYYY-MM-DD
  const toLocalDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const todayStr = toLocalDate(new Date());

  // Filtrar ventas por fecha
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

  // Filtrar por búsqueda
  const filteredVentas = filteredByDate.filter(v => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.id?.toLowerCase().includes(term) ||
      new Date(v.fecha).toLocaleDateString().includes(term)
    );
  });

  // Métricas del periodo seleccionado
  const totalVentas = filteredByDate.reduce((acc, v) => acc + Number(v.total), 0);
  const totalPedidos = filteredByDate.length;
  const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
  const totalEfectivo = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.efectivo || 0), 0);
  const totalTarjeta = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.tarjeta || 0), 0);
  const totalTransferencia = filteredByDate.reduce((acc, v) => acc + Number(v.pagos?.transferencia || 0), 0);

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit'
    });
  };

  const filterLabels = {
    hoy: 'Hoy',
    ayer: 'Ayer',
    '7dias': 'Últimos 7 días',
    '30dias': 'Últimos 30 días',
    custom: 'Fecha específica',
    todas: 'Todas'
  };

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-800 flex items-center gap-3">
            <ClipboardList className="w-7 h-7 lg:w-8 lg:h-8 text-primary-600" />
            Pedidos Realizados
          </h1>
          <p className="text-sm lg:text-base text-slate-500 mt-1">Historial completo de ventas y métricas financieras</p>
        </div>

        {/* Filtros de Fecha */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
              <Calendar className="w-4 h-4" /> Periodo:
            </div>
            <div className="flex flex-wrap gap-2">
              {['hoy', 'ayer', '7dias', '30dias', 'todas'].map(f => (
                <button
                  key={f}
                  onClick={() => setDateFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    dateFilter === f 
                      ? 'bg-slate-900 text-white shadow-md' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filterLabels[f]}
                </button>
              ))}
              <div className="relative">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => { setCustomDate(e.target.value); setDateFilter('custom'); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-all cursor-pointer ${
                    dateFilter === 'custom' 
                      ? 'bg-slate-900 text-white border-slate-900' 
                      : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Métricas del Periodo */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-primary-100 p-2 rounded-xl"><DollarSign className="w-4 h-4 text-primary-600" /></div>
              <span className="text-xs font-bold text-slate-500 uppercase">Ventas</span>
            </div>
            <p className="text-xl lg:text-2xl font-black text-slate-800">${totalVentas.toLocaleString('en-US', {minimumFractionDigits:2})}</p>
          </div>
          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-blue-100 p-2 rounded-xl"><TrendingUp className="w-4 h-4 text-blue-600" /></div>
              <span className="text-xs font-bold text-slate-500 uppercase">Pedidos</span>
            </div>
            <p className="text-xl lg:text-2xl font-black text-slate-800">{totalPedidos}</p>
          </div>
          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-amber-100 p-2 rounded-xl"><Banknote className="w-4 h-4 text-amber-600" /></div>
              <span className="text-xs font-bold text-slate-500 uppercase">Ticket Prom.</span>
            </div>
            <p className="text-xl lg:text-2xl font-black text-slate-800">${ticketPromedio.toLocaleString('en-US', {minimumFractionDigits:2})}</p>
          </div>
          <div className="bg-white p-4 lg:p-5 rounded-2xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-slate-100 p-2 rounded-xl"><CreditCard className="w-4 h-4 text-slate-600" /></div>
              <span className="text-xs font-bold text-slate-500 uppercase">Tarjeta</span>
            </div>
            <p className="text-xl lg:text-2xl font-black text-slate-800">${totalTarjeta.toLocaleString('en-US', {minimumFractionDigits:2})}</p>
          </div>
        </div>

        {/* Desglose rápido de métodos de pago */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 lg:gap-8 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-slate-700"></div>
            <span className="text-slate-600">Efectivo: <strong className="text-slate-800">${totalEfectivo.toFixed(2)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-slate-600">Tarjeta: <strong className="text-slate-800">${totalTarjeta.toFixed(2)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span className="text-slate-600">Transf.: <strong className="text-slate-800">${totalTransferencia.toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Buscar por #Ticket o Fecha..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 bg-white focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all text-sm shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Lista de Pedidos */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          
          {/* Vista Móvil (Tarjetas) */}
          <div className="block lg:hidden divide-y divide-slate-100">
            {filteredVentas.map((venta) => (
              <div key={venta.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-slate-800 text-lg">#{venta.id?.slice(0,8)}</span>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(venta.fecha)} • {formatTime(venta.fecha)}
                    </div>
                  </div>
                  <span className="font-black text-primary-600 text-lg">${Number(venta.total).toFixed(2)}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {venta.pagos?.efectivo > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">Efectivo</span>}
                    {venta.pagos?.tarjeta > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">Tarjeta</span>}
                    {venta.pagos?.transferencia > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">Transf.</span>}
                  </div>
                  <span className="text-xs text-slate-400 font-bold">{venta.items?.length || 0} arts.</span>
                </div>
                
                <button 
                  onClick={() => setSelectedVenta(venta)}
                  className="w-full mt-1 py-2.5 bg-primary-50 text-primary-700 font-bold rounded-lg border border-primary-200 flex items-center justify-center gap-2 hover:bg-primary-100 transition-colors"
                >
                  <FileText className="w-4 h-4" /> Ver Ticket
                </button>
              </div>
            ))}
          </div>

          {/* Vista Desktop (Tabla) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-bold">Ticket</th>
                  <th className="p-4 font-bold">Fecha</th>
                  <th className="p-4 font-bold">Hora</th>
                  <th className="p-4 font-bold text-center">Artículos</th>
                  <th className="p-4 font-bold">Método de Pago</th>
                  <th className="p-4 font-bold text-right">Total</th>
                  <th className="p-4 font-bold text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredVentas.map((venta) => (
                  <tr key={venta.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-700 text-sm">#{venta.id?.slice(0,8)}</td>
                    <td className="p-4 text-slate-600 text-sm font-medium">{formatDate(venta.fecha)}</td>
                    <td className="p-4 text-slate-500 text-sm font-mono">{formatTime(venta.fecha)}</td>
                    <td className="p-4 text-center">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-bold">
                        {venta.items?.reduce((acc, i) => acc + i.quantity, 0) || 0}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1.5 text-xs font-bold">
                        {venta.pagos?.efectivo > 0 && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded">Efectivo</span>}
                        {venta.pagos?.tarjeta > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Tarjeta</span>}
                        {venta.pagos?.transferencia > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Transf.</span>}
                      </div>
                    </td>
                    <td className="p-4 text-right font-black text-primary-700 text-lg">
                      ${Number(venta.total).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setSelectedVenta(venta)}
                        className="px-3 py-2 text-sm font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-lg transition-colors inline-flex items-center gap-1.5"
                      >
                        <FileText className="w-4 h-4" /> Ticket
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVentas.length === 0 && (
            <div className="p-8 lg:p-16 text-center text-slate-400 flex flex-col items-center">
              <ClipboardList className="w-16 h-16 opacity-20 mb-4" />
              <p className="font-medium text-lg mb-1">Sin pedidos en este periodo</p>
              <p className="text-sm">Prueba cambiando el filtro de fechas o el término de búsqueda.</p>
            </div>
          )}
        </div>

      </div>

      {/* Modal Visor de Ticket */}
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
