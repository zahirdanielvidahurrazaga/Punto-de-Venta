import React from 'react';
import { TrendingUp, DollarSign, Package, AlertTriangle, ArrowUpRight, CreditCard, Banknote, Building } from 'lucide-react';

export default function Dashboard({ ventas = [] }) {
  // Cálculos dinámicos
  const totalSales = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const totalOrders = ventas.length;
  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Métodos de pago
  const ef = ventas.reduce((acc, v) => acc + Number(v.pagos?.efectivo || 0), 0);
  const tar = ventas.reduce((acc, v) => acc + Number(v.pagos?.tarjeta || 0), 0);
  const trans = ventas.reduce((acc, v) => acc + Number(v.pagos?.transferencia || 0), 0);

  const stats = [
    { label: 'Ventas Totales', value: `$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100', trend: 'Actualizado' },
    { label: 'Órdenes Totales', value: totalOrders.toString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-100', trend: 'Hoy' },
    { label: 'Ticket Promedio', value: `$${avgTicket.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-100', trend: 'Promedio' },
    { label: 'Efectivo Acumulado', value: `$${ef.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-100', trend: 'Caja' },
  ];

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
        
        {/* Header Dashboard */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-800">Dashboard Financiero</h1>
          <p className="text-sm lg:text-base text-slate-500 mt-1">Análisis en tiempo real con datos de Supabase.</p>
        </div>

        {/* Tarjetas de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className={`${stat.bg} p-3 rounded-2xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="flex items-center gap-1 text-xs lg:text-sm font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full">
                  {stat.trend}
                </div>
              </div>
              <div className="text-sm lg:text-base text-slate-500 font-medium mb-1">{stat.label}</div>
              <div className="text-2xl lg:text-3xl font-black text-slate-800">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Sección Inferior: Gráficos y Métodos de Pago */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Métricas de Métodos de Pago */}
          <div className="lg:col-span-2 bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-6">Distribución por Método de Pago</h2>
            <div className="space-y-6">
               <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-xl"><Banknote className="text-green-600" /></div>
                  <div className="flex-1">
                     <div className="flex justify-between mb-1"><span className="font-bold">Efectivo</span><span className="text-slate-500">${ef.toFixed(2)}</span></div>
                     <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-green-500 h-full transition-all" style={{ width: `${(ef / totalSales) * 100 || 0}%` }}></div>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  <div className="bg-blue-100 p-3 rounded-xl"><CreditCard className="text-blue-600" /></div>
                  <div className="flex-1">
                     <div className="flex justify-between mb-1"><span className="font-bold">Tarjeta</span><span className="text-slate-500">${tar.toFixed(2)}</span></div>
                     <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-blue-500 h-full transition-all" style={{ width: `${(tar / totalSales) * 100 || 0}%` }}></div>
                     </div>
                  </div>
               </div>
               <div className="flex items-center gap-4">
                  <div className="bg-purple-100 p-3 rounded-xl"><Building className="text-purple-600" /></div>
                  <div className="flex-1">
                     <div className="flex justify-between mb-1"><span className="font-bold">Transferencia</span><span className="text-slate-500">${trans.toFixed(2)}</span></div>
                     <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-purple-500 h-full transition-all" style={{ width: `${(trans / totalSales) * 100 || 0}%` }}></div>
                     </div>
                  </div>
               </div>
            </div>
          </div>

          {/* Estado de conexión */}
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center items-center text-center">
            <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-4">
               <TrendingUp className="w-10 h-10 text-primary-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Cloud Sync Activo</h2>
            <p className="text-slate-500 text-sm">Tus datos están protegidos y sincronizados en tiempo real con Supabase.</p>
            <div className="mt-6 w-full pt-6 border-t border-slate-50">
               <div className="flex justify-between text-sm text-slate-400 mb-2">
                  <span>Última venta</span>
                  <span>{ventas[0] ? new Date(ventas[0].fecha).toLocaleTimeString() : 'N/A'}</span>
               </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

