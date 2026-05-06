import React, { useState } from 'react';
import { ClipboardList, Search, FileText, Calendar } from 'lucide-react';
import TicketModal from './TicketModal';

export default function Pedidos({ ventas }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVenta, setSelectedVenta] = useState(null);

  // Filtro simple por ID de venta
  const filteredVentas = ventas.filter(v => 
    v.id.includes(searchTerm) || 
    new Date(v.fecha).toLocaleDateString().includes(searchTerm)
  );

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2 lg:gap-3">
              <ClipboardList className="w-6 h-6 lg:w-8 lg:h-8 text-primary-600" />
              Pedidos Realizados
            </h1>
            <p className="text-sm lg:text-base text-slate-500 mt-1">Historial de ventas de la sesión actual</p>
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar #Ticket o Fecha..."
              className="w-full pl-10 pr-4 py-2 lg:py-3 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all text-sm lg:text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Lista de Pedidos (Responsive Card Layout para móvil, Tabla para Desktop) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          
          {/* Vista Móvil (Tarjetas) */}
          <div className="block lg:hidden divide-y divide-slate-100">
            {filteredVentas.map((venta) => (
              <div key={venta.id} className="p-4 flex flex-col gap-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-bold text-slate-800 text-lg">#{venta.id}</span>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(venta.fecha).toLocaleString()}
                    </div>
                  </div>
                  <span className="font-black text-primary-600 text-lg">${venta.total.toFixed(2)}</span>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs">
                  {venta.pagos?.efectivo > 0 && <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Efectivo</span>}
                  {venta.pagos?.tarjeta > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Tarjeta</span>}
                  {venta.pagos?.transferencia > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Transferencia</span>}
                </div>
                
                <button 
                  onClick={() => setSelectedVenta(venta)}
                  className="w-full mt-2 py-2 bg-slate-50 text-slate-600 font-bold rounded-lg border border-slate-200 flex items-center justify-center gap-2 hover:bg-slate-100"
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
                <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-sm">
                  <th className="p-4 font-semibold w-24">Ticket</th>
                  <th className="p-4 font-semibold">Fecha y Hora</th>
                  <th className="p-4 font-semibold">Artículos</th>
                  <th className="p-4 font-semibold">Método de Pago</th>
                  <th className="p-4 font-semibold text-right">Total</th>
                  <th className="p-4 font-semibold text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredVentas.map((venta) => (
                  <tr key={venta.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-mono font-bold text-slate-700">#{venta.id}</td>
                    <td className="p-4 text-slate-500 text-sm">{new Date(venta.fecha).toLocaleString()}</td>
                    <td className="p-4 text-slate-600">
                      {venta.items.reduce((acc, i) => acc + i.quantity, 0)} arts.
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1 text-xs font-semibold">
                        {venta.pagos?.efectivo > 0 && <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Efectivo</span>}
                        {venta.pagos?.tarjeta > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Tarjeta</span>}
                        {venta.pagos?.transferencia > 0 && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Transf.</span>}
                      </div>
                    </td>
                    <td className="p-4 text-right font-black text-primary-600 text-lg">
                      ${venta.total.toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setSelectedVenta(venta)}
                        className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors inline-block"
                        title="Ver Ticket"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredVentas.length === 0 && (
            <div className="p-8 lg:p-12 text-center text-slate-400 flex flex-col items-center">
              <ClipboardList className="w-16 h-16 opacity-20 mb-4" />
              <p>No hay pedidos realizados que coincidan con la búsqueda.</p>
            </div>
          )}
        </div>

      </div>

      {/* Modal Visor de Ticket */}
      {selectedVenta && (
        <TicketModal 
          cart={selectedVenta.items}
          total={selectedVenta.total}
          paymentData={selectedVenta.pagos}
          onClose={() => setSelectedVenta(null)}
        />
      )}
    </div>
  );
}
