import React, { useState, useEffect } from 'react';
import { Users, Loader2, QrCode, Printer, X, UserPlus } from 'lucide-react';
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

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);

    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(`
      <html>
        <head>
          <title>Imprimir Gafete</title>
          <style>
            body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100vh; background: white; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
            .gafete-print { width: 320px; padding: 24px; border: 1px solid #e2e8f0; border-radius: 24px; text-align: center; box-shadow: 0 20px 40px -20px rgba(31,55,99,0.18); }
            .gafete-print h2 { margin: 0 0 5px 0; font-size: 22px; font-weight: 800; color: #0a0f1c; letter-spacing: -0.01em; }
            .gafete-print p { margin: 0 0 20px 0; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.18em; }
            .qr-container { display: flex; justify-content: center; margin-bottom: 15px; }
            @media print { @page { margin: 0; size: auto; } }
          </style>
        </head>
        <body>
          <div class="gafete-print">${printContent.innerHTML}</div>
          <script>
            window.onload = function() {
              window.focus(); window.print();
              setTimeout(function() { window.parent.document.body.removeChild(window.frameElement); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printDoc.close();
  };

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-7 h-7 text-accent-500" /></div>;
  }

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-6xl mx-auto">

        {/* Header — Apple */}
        <div className="flex items-start justify-between gap-4 pt-2 pb-2 mb-7">
          <div>
            <h2 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">Equipo</h2>
            <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2 neb-tabular">
              Gestión de empleados y gafetes QR · {empleados.length} miembros
            </p>
          </div>
          <button onClick={() => setIsAddModalOpen(true)} className="neb-btn neb-btn-primary">
            <UserPlus className="w-4 h-4" /> Añadir empleado
          </button>
        </div>

        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
            <div className="neb-glass-strong rounded-3xl w-full max-w-md p-8 relative">
              <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 w-9 h-9 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-800 flex items-center justify-center transition-colors">
                <X className="w-4 h-4" />
              </button>
              <div className="w-14 h-14 bg-accent-50 border border-accent-100 rounded-2xl flex items-center justify-center mb-5">
                <Users className="w-7 h-7 text-accent-700" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-2 tracking-tight">Añadir nuevo empleado</h3>
              <p className="text-slate-500 dark:text-slate-400 text-[13px] mb-5 leading-relaxed">
                Por seguridad, los accesos se gestionan directamente desde el servidor (Supabase). Sigue estos pasos:
              </p>
              <ol className="space-y-3 text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-7">
                {[
                  ['Ingresa al portal de', 'Supabase', 'de tu proyecto.'],
                  ['Ve a la sección', 'Authentication > Users', '.'],
                  ['Haz clic en', 'Add User', 'y crea la cuenta con su correo y contraseña.'],
                  ['El perfil aparecerá automáticamente en esta pantalla para asignarle su gafete.', '', ''],
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="w-6 h-6 rounded-lg bg-accent-50 border border-accent-100 flex items-center justify-center text-accent-700 text-xs font-extrabold shrink-0">{i+1}</span>
                    <span>{step[0]} {step[1] && <strong>{step[1]}</strong>} {step[2]}</span>
                  </li>
                ))}
              </ol>
              <button onClick={() => setIsAddModalOpen(false)} className="w-full neb-btn neb-btn-primary py-3">
                Entendido
              </button>
            </div>
          </div>
        )}

        {empleados.length === 0 ? (
          <div className="neb-card p-12 text-center text-slate-400 dark:text-slate-500">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">No hay empleados registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {empleados.map(empleado => (
              <div key={empleado.id} className="neb-card p-6 flex flex-col items-center text-center">

                {/* Avatar inicial */}
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-medium text-slate-600 dark:text-slate-400 text-xl mb-3">
                  {empleado.nombre_completo.charAt(0).toUpperCase()}
                </div>

                <div id={`gafete-${empleado.id}`} className="w-full flex flex-col items-center">
                  <h3 className="font-semibold text-lg text-slate-900 dark:text-white tracking-tight">{empleado.nombre_completo}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5 mt-1">Empleado</p>

                  {empleado.codigo_gafete ? (
                    <div className="qr-container bg-white dark:bg-slate-900 p-4 border border-slate-200 dark:border-slate-800 rounded-xl mb-3">
                      <QRCode value={empleado.codigo_gafete} size={150} />
                    </div>
                  ) : (
                    <div className="w-[160px] h-[160px] bg-slate-50 dark:bg-slate-900/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl mb-3 flex items-center justify-center text-slate-300">
                      <QrCode className="w-9 h-9" />
                    </div>
                  )}

                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1 neb-tabular">
                    ID: {empleado.codigo_gafete || 'Sin código asignado'}
                  </p>
                </div>

                <div className="w-full border-t border-slate-100 dark:border-slate-800 pt-4 mt-4">
                  {empleado.codigo_gafete ? (
                    <button onClick={() => handlePrint(empleado.id)} className="w-full neb-btn neb-btn-primary">
                      <Printer className="w-4 h-4" /> Imprimir gafete
                    </button>
                  ) : (
                    <button onClick={() => handleGenerateCode(empleado.id)} className="w-full neb-btn neb-btn-ghost">
                      <QrCode className="w-4 h-4" /> Generar código
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
