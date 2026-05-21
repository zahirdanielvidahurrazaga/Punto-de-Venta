import React, { useState, useEffect } from 'react';
import { Users, Loader2, QrCode, Printer } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import QRCodeLib from 'react-qr-code';

const QRCode = QRCodeLib.default || QRCodeLib.QRCode || QRCodeLib;

export default function Equipo() {
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

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

  const handleGenerateCode = async (empleadoId) => {
    try {
      const newCode = `GAF-${Math.floor(100000 + Math.random() * 900000)}`;
      const { error } = await supabase
        .from('usuarios_perfiles')
        .update({ codigo_gafete: newCode })
        .eq('id', empleadoId);
      
      if (error) throw error;
      
      setEmpleados(prev => prev.map(emp => 
        emp.id === empleadoId ? { ...emp, codigo_gafete: newCode } : emp
      ));
    } catch (error) {
      alert("Error al generar código: " + error.message);
    }
  };

  const handlePrint = (empleadoId) => {
    const printContent = document.getElementById(`gafete-${empleadoId}`);
    if (!printContent) return;

    // Crear un iframe temporal e invisible
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    // Escribir contenido y llamar a impresión
    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(`
      <html>
        <head>
          <title>Imprimir Gafete</title>
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: white; }
            .gafete-print { width: 300px; padding: 20px; border: 2px solid #e2e8f0; border-radius: 20px; text-align: center; font-family: sans-serif; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
            .gafete-print h2 { margin: 0 0 5px 0; font-size: 22px; font-weight: 800; color: #0f172a; }
            .gafete-print p { margin: 0 0 20px 0; font-size: 13px; font-weight: 550; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
            .qr-container { display: flex; justify-content: center; margin-bottom: 15px; }
            @media print {
              @page { margin: 0; size: auto; }
            }
          </style>
        </head>
        <body>
          <div class="gafete-print">
            ${printContent.innerHTML}
          </div>
          <script>
            window.onload = function() {
              window.focus();
              window.print();
              setTimeout(function() {
                window.parent.document.body.removeChild(window.frameElement);
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printDoc.close();
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
          <div className="flex-1">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Equipo</h2>
            <p className="text-slate-500 text-sm font-medium">Gestión de Empleados y Gafetes QR</p>
          </div>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="bg-primary-900 hover:bg-primary-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-primary-900/20 transition-all"
          >
            + Añadir Empleado
          </button>
        </div>

        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-8 relative">
              <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                ✕
              </button>
              <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
                <Users className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Añadir Nuevo Empleado</h3>
              <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                Por seguridad, los accesos se gestionan directamente desde el servidor (Supabase). Sigue estos pasos:
              </p>
              <ol className="space-y-4 text-sm font-medium text-slate-700 mb-8">
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">1</span>
                  <span>Ingresa al portal de <strong>Supabase</strong> de tu proyecto.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">2</span>
                  <span>Ve a la sección <strong>Authentication &gt; Users</strong>.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">3</span>
                  <span>Haz clic en <strong>Add User</strong> y crea la cuenta con su correo y contraseña.</span>
                </li>
                <li className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">4</span>
                  <span>El perfil aparecerá automáticamente en esta pantalla para asignarle su gafete.</span>
                </li>
              </ol>
              <button onClick={() => setIsAddModalOpen(false)} className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors">
                Entendido
              </button>
            </div>
          </div>
        )}

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
                    <button 
                      onClick={() => handleGenerateCode(empleado.id)}
                      className="w-full py-3 bg-primary-50 text-primary-900 hover:bg-primary-100 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm border border-primary-200"
                    >
                      <QrCode className="w-4 h-4" /> Generar Código
                    </button>
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
