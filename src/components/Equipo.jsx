import React, { useState, useEffect } from 'react';
import { Users, Loader2, QrCode, Printer } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import QRCode from 'react-qr-code';

export default function Equipo() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEmpleados();
  }, []);

  const fetchEmpleados = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('usuarios_perfiles')
        .select('*')
        .eq('rol', 'empleado')
        .order('nombre_completo', { ascending: true });
      
      if (error) throw error;
      setEmpleados(data || []);
    } catch (error) {
      console.error('Error fetching empleados:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (empleadoId) => {
    const printContent = document.getElementById(`gafete-${empleadoId}`);
    const originalContent = document.body.innerHTML;

    // Crea un estilo especial para impresión
    const printStyle = `
      <style>
        body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: white; }
        .gafete-print { width: 300px; padding: 20px; border: 2px solid black; border-radius: 10px; text-align: center; font-family: sans-serif; }
        .gafete-print h2 { margin: 0 0 10px 0; font-size: 24px; }
        .gafete-print p { margin: 0 0 20px 0; font-size: 14px; color: #555; }
        .qr-container { display: flex; justify-content: center; margin-bottom: 15px; }
        @media print {
          @page { margin: 0; size: auto; }
        }
      </style>
    `;

    document.body.innerHTML = printStyle + `<div class="gafete-print">${printContent.innerHTML}</div>`;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Recargar para restaurar los listeners de React
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>;
  }

  return (
    <div className="p-4 lg:p-8 h-full bg-slate-50 overflow-y-auto">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipo</h2>
            <p className="text-slate-500 text-sm font-medium">Gestión de Empleados y Gafetes QR</p>
          </div>
        </div>

        {empleados.length === 0 ? (
          <div className="text-center p-10 bg-white rounded-3xl border border-slate-200">
            <p className="text-slate-500 font-medium">No hay empleados registrados en el sistema.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {empleados.map(empleado => (
              <div key={empleado.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
                
                <div id={`gafete-${empleado.id}`} className="w-full flex flex-col items-center">
                  <h3 className="font-bold text-xl text-slate-900 mb-1">{empleado.nombre_completo}</h3>
                  <p className="text-sm text-slate-500 font-medium mb-6 uppercase tracking-widest">Empleado</p>
                  
                  {empleado.codigo_gafete ? (
                    <div className="qr-container bg-white p-4 border-2 border-slate-100 rounded-2xl mb-4">
                      <QRCode value={empleado.codigo_gafete} size={150} />
                    </div>
                  ) : (
                    <div className="w-[150px] h-[150px] bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl mb-4 flex items-center justify-center text-slate-400">
                      <QrCode className="w-10 h-10" />
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-400 font-mono mt-2">
                    ID: {empleado.codigo_gafete || 'Sin código asignado'}
                  </p>
                </div>

                <div className="w-full border-t border-slate-100 pt-4 mt-4">
                  {empleado.codigo_gafete ? (
                    <button 
                      onClick={() => handlePrint(empleado.id)}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm shadow-md"
                    >
                      <Printer className="w-4 h-4" /> Imprimir Gafete
                    </button>
                  ) : (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg font-bold">
                      Asígnele un código en Supabase para generar el gafete.
                    </p>
                  )}
                </div>
                
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
