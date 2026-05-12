import React, { useState, useEffect } from 'react';
import { TrendingUp, DollarSign, Package, AlertTriangle, CreditCard, Banknote, Building, CalendarDays, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function Dashboard({ ventas = [] }) {
  const [cajasAbiertas, setCajasAbiertas] = useState([]);

  useEffect(() => {
    fetchCajasAbiertas();
  }, []);

  const fetchCajasAbiertas = async () => {
    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select(`*, usuarios_perfiles(nombre_completo)`)
        .eq('estado', 'abierta');
      if (!error && data) {
        setCajasAbiertas(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Cálculos dinámicos
  const totalSales = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const totalOrders = ventas.length;
  const avgTicket = totalOrders > 0 ? totalSales / totalOrders : 0;
  
  // Métodos de pago
  const ef = ventas.reduce((acc, v) => acc + Number(v.pagos?.efectivo || 0), 0);
  const tar = ventas.reduce((acc, v) => acc + Number(v.pagos?.tarjeta || 0), 0);
  const trans = ventas.reduce((acc, v) => acc + Number(v.pagos?.transferencia || 0), 0);

  // Helper para obtener fecha local como string YYYY-MM-DD
  const toLocalDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  // Agrupar ventas por día (últimos 7 días)
  const last7Days = Array.from({length: 7}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return toLocalDate(d);
  }).reverse();

  const salesByDay = last7Days.map(dateStr => {
    const daySales = ventas.filter(v => v.fecha && toLocalDate(v.fecha) === dateStr);
    const sum = daySales.reduce((acc, v) => acc + Number(v.total), 0);
    const dateObj = new Date(dateStr + 'T12:00:00');
    const dayName = dateObj.toLocaleDateString('es-MX', { weekday: 'short' });
    return { date: dateStr, dayName, sum };
  });

  const maxDailySale = Math.max(...salesByDay.map(s => s.sum), 1); // Evitar dividir por 0

  const stats = [
    { label: 'Ventas Totales', value: `$${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-primary-600', bg: 'bg-primary-100', trend: 'Actualizado' },
    { label: 'Órdenes Totales', value: totalOrders.toString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-100', trend: 'Hoy' },
    { label: 'Ticket Promedio', value: `$${avgTicket.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-100', trend: 'Promedio' },
    { label: 'Efectivo Acumulado', value: `$${ef.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, icon: Banknote, color: 'text-slate-700', bg: 'bg-slate-100', trend: 'Caja' },
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

        {/* Gráfica de Ventas y Cajas Activas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary-900" />
              Ventas Últimos 7 Días
            </h2>
            <div className="flex items-end justify-between gap-2 mt-4 px-2" style={{height: '200px'}}>
              {salesByDay.map((day, idx) => {
                const barHeight = maxDailySale > 0 ? Math.round((day.sum / maxDailySale) * 160) : 0;
                const finalHeight = day.sum > 0 ? Math.max(barHeight, 8) : 0;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1 group cursor-pointer" style={{height: '100%', justifyContent: 'flex-end'}}>
                    <div className="text-xs font-bold mb-2 transition-opacity" style={{color: '#475569', opacity: day.sum > 0 ? 1 : 0}}>
                      ${day.sum.toFixed(0)}
                    </div>
                    <div 
                      style={{ 
                        width: '100%',
                        maxWidth: '40px',
                        height: `${finalHeight}px`,
                        backgroundColor: finalHeight > 0 ? '#4f46e5' : '#e2e8f0',
                        borderRadius: '8px 8px 0 0',
                        transition: 'height 0.5s ease'
                      }}
                    ></div>
                    <div className="mt-3 text-xs lg:text-sm font-bold text-slate-400 capitalize">
                      {day.dayName}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Cajas Abiertas Widget */}
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary-900" />
              Cajas Activas
            </h2>
            <div className="flex-1 overflow-y-auto space-y-3">
              {cajasAbiertas.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm p-4 text-center">
                  <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                  No hay cajas abiertas en este momento.
                </div>
              ) : (
                cajasAbiertas.map(caja => (
                  <div key={caja.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <p className="font-bold text-slate-800 text-sm">{caja.usuarios_perfiles?.nombre_completo || 'Empleado'}</p>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded-md border border-slate-100">
                        {new Date(caja.fecha_apertura).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      <span className="text-sm font-black text-primary-600">
                        Fondo: ${Number(caja.fondo_inicial).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Sección Inferior: Métodos de Pago y Sync */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Métricas de Métodos de Pago */}
          <div className="lg:col-span-2 bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-6">Distribución por Método de Pago</h2>
            <div className="space-y-6">
               <div className="flex items-center gap-4">
                  <div className="bg-slate-100 p-3 rounded-xl"><Banknote className="text-slate-700" /></div>
                  <div className="flex-1">
                     <div className="flex justify-between mb-1"><span className="font-bold">Efectivo</span><span className="text-slate-500">${ef.toFixed(2)}</span></div>
                     <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-slate-700 h-full transition-all" style={{ width: `${(ef / totalSales) * 100 || 0}%` }}></div>
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

