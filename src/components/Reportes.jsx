import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Loader2, Calendar, FileText, DollarSign, Clock, User } from 'lucide-react';

export default function Reportes() {
  const [activeTab, setActiveTab] = useState('asistencias');
  const [asistencias, setAsistencias] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'asistencias') {
        const { data, error } = await supabase
          .from('registro_asistencia')
          .select(`
            *,
            usuarios_perfiles (nombre_completo)
          `)
          .order('fecha_entrada', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        setAsistencias(data || []);
      } else {
        const { data, error } = await supabase
          .from('sesiones_caja')
          .select(`
            *,
            usuarios_perfiles (nombre_completo)
          `)
          .order('fecha_apertura', { ascending: false })
          .limit(50);

        if (error) throw error;
        setCajas(data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'En progreso';
    return new Date(dateString).toLocaleString('es-MX', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 overflow-y-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Reportes Generales</h2>
            <p className="text-slate-500 text-sm font-medium">Historial de asistencia y aperturas de caja</p>
          </div>
        </div>

        <div className="flex bg-white rounded-2xl shadow-sm border border-slate-200 p-1 mb-6 max-w-sm">
          <button
            onClick={() => setActiveTab('asistencias')}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'asistencias' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Asistencias
          </button>
          <button
            onClick={() => setActiveTab('cajas')}
            className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all ${activeTab === 'cajas' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
          >
            Cortes de Caja
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>
          ) : activeTab === 'asistencias' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-bold">Empleado</th>
                    <th className="p-4 font-bold">Estado</th>
                    <th className="p-4 font-bold">Entrada</th>
                    <th className="p-4 font-bold">Salida</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {asistencias.map((record) => (
                    <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        {record.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${record.estado === 'trabajando' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                          {record.estado === 'trabajando' ? 'Activo' : 'Completado'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600 font-mono">{formatDate(record.fecha_entrada)}</td>
                      <td className="p-4 text-slate-600 font-mono">{formatDate(record.fecha_salida)}</td>
                    </tr>
                  ))}
                  {asistencias.length === 0 && (
                    <tr><td colSpan="4" className="p-8 text-center text-slate-400">No hay registros de asistencia recientes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-bold">Empleado</th>
                    <th className="p-4 font-bold">Estado</th>
                    <th className="p-4 font-bold text-right">Fondo Inicial</th>
                    <th className="p-4 font-bold text-right">Efectivo Dec.</th>
                    <th className="p-4 font-bold">Apertura / Cierre</th>
                    <th className="p-4 font-bold">Observaciones</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {cajas.map((caja) => (
                    <tr key={caja.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="p-4 font-bold text-slate-800">
                        {caja.usuarios_perfiles?.nombre_completo || 'Desconocido'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${caja.estado === 'abierta' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {caja.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black text-slate-700">
                        ${Number(caja.fondo_inicial).toFixed(2)}
                      </td>
                      <td className="p-4 text-right font-black text-slate-700">
                        {caja.estado === 'cerrada' ? `$${Number(caja.efectivo_declarado || 0).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-4 text-slate-500 font-mono text-xs">
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(caja.fecha_apertura)}</div>
                        {caja.fecha_cierre && <div className="flex items-center gap-1 mt-1 text-slate-400"><Clock className="w-3 h-3" /> {formatDate(caja.fecha_cierre)}</div>}
                      </td>
                      <td className="p-4 text-slate-500 max-w-xs truncate" title={caja.observaciones || ''}>
                        {caja.observaciones || <span className="text-slate-300 italic">Sin observaciones</span>}
                      </td>
                    </tr>
                  ))}
                  {cajas.length === 0 && (
                    <tr><td colSpan="6" className="p-8 text-center text-slate-400">No hay registros de cajas recientes.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
