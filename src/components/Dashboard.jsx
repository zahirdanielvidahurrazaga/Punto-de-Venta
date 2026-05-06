import React from 'react';
import { TrendingUp, Users, DollarSign, Package, AlertTriangle, ArrowUpRight } from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Ventas del Día', value: '$4,250.00', icon: DollarSign, color: 'text-green-600', bg: 'bg-green-100', trend: '+12.5%' },
    { label: 'Órdenes', value: '48', icon: Package, color: 'text-blue-600', bg: 'bg-blue-100', trend: '+5.2%' },
    { label: 'Clientes Nuevos', value: '12', icon: Users, color: 'text-purple-600', bg: 'bg-purple-100', trend: '+2.1%' },
    { label: 'Ingresos Semanales', value: '$28,450.00', icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-100', trend: '+15.3%' },
  ];

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
        
        {/* Header Dashboard */}
        <div>
          <h1 className="text-2xl lg:text-3xl font-black text-slate-800">Dashboard Financiero</h1>
          <p className="text-sm lg:text-base text-slate-500 mt-1">Resumen general de tu negocio de plásticos.</p>
        </div>

        {/* Tarjetas de Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div className={`${stat.bg} p-3 rounded-2xl`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <div className="flex items-center gap-1 text-xs lg:text-sm font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  <ArrowUpRight className="w-3 h-3 lg:w-4 lg:h-4" />
                  {stat.trend}
                </div>
              </div>
              <div className="text-sm lg:text-base text-slate-500 font-medium mb-1">{stat.label}</div>
              <div className="text-2xl lg:text-3xl font-black text-slate-800">{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Sección Inferior: Gráficos y Alertas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Simulación de Gráfico de Barras */}
          <div className="lg:col-span-2 bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-6">Ventas de la Semana</h2>
            <div className="h-48 lg:h-64 flex items-end justify-between gap-2 lg:gap-4">
              {/* Barras Mock */}
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((day, i) => {
                const height = Math.floor(Math.random() * 60) + 20;
                return (
                  <div key={day} className="flex flex-col items-center flex-1 group">
                    <div 
                      className="w-full bg-primary-100 rounded-t-lg group-hover:bg-primary-500 transition-colors relative"
                      style={{ height: `${height}%` }}
                    >
                      <div className="opacity-0 lg:group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs py-1 px-2 rounded transition-opacity hidden md:block">
                        ${(height * 100).toFixed(0)}
                      </div>
                    </div>
                    <span className="text-xs lg:text-sm text-slate-500 mt-2 lg:mt-3 font-medium">{day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Alertas de Inventario */}
          <div className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col">
            <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-4 lg:mb-6 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Alertas de Stock
            </h2>
            <div className="space-y-3 lg:space-y-4 flex-1">
              <div className="bg-orange-50 border border-orange-100 p-3 lg:p-4 rounded-2xl flex justify-between items-center">
                <div>
                  <div className="font-bold text-orange-800 text-sm lg:text-base">Rollo Fleje Plástico</div>
                  <div className="text-orange-600 text-xs lg:text-sm mt-1">Stock Crítico</div>
                </div>
                <div className="bg-white text-orange-700 font-black px-2 py-1 lg:px-3 rounded-lg border border-orange-200 text-sm lg:text-base">
                  20 un.
                </div>
              </div>
              
              <div className="bg-orange-50 border border-orange-100 p-3 lg:p-4 rounded-2xl flex justify-between items-center">
                <div>
                  <div className="font-bold text-orange-800 text-sm lg:text-base">Contenedor Un Litro</div>
                  <div className="text-orange-600 text-xs lg:text-sm mt-1">Reponer pronto</div>
                </div>
                <div className="bg-white text-orange-700 font-black px-2 py-1 lg:px-3 rounded-lg border border-orange-200 text-sm lg:text-base">
                  150 un.
                </div>
              </div>
            </div>
            <button className="w-full mt-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm lg:text-base">
              Ver todo el inventario
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
