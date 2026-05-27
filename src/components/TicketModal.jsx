import React from 'react';
import { Printer, X, CheckCircle, Store, Mail, Phone } from 'lucide-react';

export default function TicketModal({ cart, total, paymentData, onClose }) {
  const ticketNumber = (Math.floor(Math.random() * 10000)).toString().padStart(4, '0');
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute:'2-digit' });

  const handlePrint = () => {
    const ticketContent = document.getElementById('ticket-termico');
    if (!ticketContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);

    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(`
      <html>
        <head>
          <title>Imprimir Ticket</title>
          <style>
            body { margin: 0; padding: 10px; background: white; font-family: 'Courier New', Courier, monospace; }
            .ticket-print { width: 100%; max-width: 80mm; margin: 0 auto; color: #000; }
            .ticket-print * { font-size: 11px; line-height: 1.4; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-black { font-weight: 950; }
            .font-bold { font-weight: 700; }
            .text-2xl { font-size: 18px; font-weight: 900; }
            .border-y { border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t-2 { border-top: 2px solid #000; }
            .py-3 { padding-top: 8px; padding-bottom: 8px; }
            .pb-2 { padding-bottom: 4px; }
            .mb-1 { margin-bottom: 4px; }
            .mb-3 { margin-bottom: 10px; }
            .mb-4 { margin-bottom: 14px; }
            .mb-6 { margin-bottom: 20px; }
            .mt-2 { margin-top: 6px; }
            .mt-3 { margin-top: 10px; }
            .mt-6 { margin-top: 20px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .flex-col { flex-direction: column; }
            .items-center { align-items: center; }
            .w-3\\/5 { width: 60%; }
            .w-1\\/5 { width: 20%; }
            .bg-slate-50 dark:bg-slate-900/50 { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; }
            @media print { @page { margin: 0; size: auto; } }
          </style>
        </head>
        <body>
          <div class="ticket-print">${ticketContent.innerHTML}</div>
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

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[95vh]">

        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100 dark:border-slate-800 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 w-9 h-9 rounded-full flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-tight tracking-tight">¡Cobro exitoso!</h2>
              <p className="text-slate-500 dark:text-slate-400 text-[12px] mt-0.5 neb-tabular">Ticket #{ticketNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 md:p-6 relative overflow-y-auto neb-scroll flex-1 flex flex-col items-center">

          <div id="ticket-termico" className="w-full max-w-sm bg-white dark:bg-slate-900 relative pb-8 pt-6 px-6 sm:px-8 font-mono text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-slate-800 neb-shadow">

            <div className="text-center mb-6 mt-2 flex flex-col items-center">
              <div className="w-12 h-12 neb-grad-primary text-white rounded-xl flex items-center justify-center mb-3">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-xl uppercase tracking-[0.18em] text-slate-900 dark:text-white mb-1">Plásticos POS</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Sucursal Centro</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Av. Principal #123, Ciudad</p>

              <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> 555-0192</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> hola@pos.com</span>
              </div>
            </div>

            <div className="border-y border-dashed border-slate-300 dark:border-slate-700 py-3 mb-4 text-[11px] font-bold text-slate-600 dark:text-slate-400 flex justify-between">
              <div>
                <p>FECHA: {date}</p>
                <p>HORA: {time}</p>
              </div>
              <div className="text-right">
                <p>CAJA: 01</p>
                <p>TICKET: {ticketNumber}</p>
              </div>
            </div>

            <div className="flex justify-between text-[11px] font-extrabold text-slate-900 dark:text-white border-b border-slate-300 dark:border-slate-700 pb-2 mb-3">
              <span className="w-3/5 text-left">DESCRIPCIÓN</span>
              <span className="w-1/5 text-center">CANT</span>
              <span className="w-1/5 text-right">IMPORTE</span>
            </div>

            <div className="space-y-3 mb-6 text-[12px]">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col">
                  <div className="flex justify-between items-start">
                    <span className="w-3/5 text-left font-bold text-slate-800 dark:text-slate-200 pr-2">{item.nombre}</span>
                    <span className="w-1/5 text-center text-slate-600 dark:text-slate-400">{item.quantity}</span>
                    <span className="w-1/5 text-right font-extrabold text-slate-900 dark:text-white">${(item.precio * item.quantity).toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${item.precio.toFixed(2)} c/u</span>
                </div>
              ))}
            </div>

            <div className="border-t-2 border-slate-800 pt-3 mb-6">
              <div className="flex justify-between font-extrabold text-xl text-slate-900 dark:text-white mb-1">
                <span>TOTAL</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                <span>Total de artículos:</span>
                <span>{cart.reduce((acc, i) => acc + i.quantity, 0)}</span>
              </div>
            </div>

            {paymentData && (
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 mb-6">
                {paymentData.efectivo > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO EN EFECTIVO:</span><span className="font-bold">${paymentData.efectivo.toFixed(2)}</span></div>}
                {paymentData.tarjeta > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO CON TARJETA:</span><span className="font-bold">${paymentData.tarjeta.toFixed(2)}</span></div>}
                {paymentData.transferencia > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO EN TRANSFER.:</span><span className="font-bold">${paymentData.transferencia.toFixed(2)}</span></div>}
                <div className="border-t border-slate-300 dark:border-slate-700 my-1" />
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 pt-1">
                  <span>RECIBIDO:</span>
                  <span>${paymentData.totalPagado.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-extrabold text-[12px] pt-1">
                  <span>SU CAMBIO:</span>
                  <span>${(paymentData.cambio || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="text-center mt-6">
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase mb-4">¡Gracias por su compra!</p>
              <div className="flex justify-center items-center h-12 w-full opacity-80 gap-0.5">
                {[...Array(40)].map((_, i) => (
                  <div key={i} className="bg-slate-900 h-full" style={{ width: `${Math.max(1, Math.random() * 4)}px` }} />
                ))}
              </div>
              <p className="text-[10px] tracking-[0.2em] text-slate-500 dark:text-slate-400 mt-1">{ticketNumber}202605{Math.floor(Math.random() * 99)}</p>
            </div>

          </div>
        </div>

        <div className="p-4 md:p-5 border-t border-slate-100/80 flex flex-col gap-2.5 shrink-0 z-10">
          <div className="flex gap-2.5">
            <button onClick={handlePrint} className="flex-1 neb-btn neb-btn-ghost py-3">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={async () => {
                console.log("Intentando conectar a impresora Bluetooth (Capacitor/WebBluetooth)...");
                alert("La impresión por Bluetooth está en preparación para la App Nativa.");
                onClose();
              }}
              className="flex-1 neb-btn neb-btn-accent py-3"
            >
              <Printer className="w-4 h-4" /> Bluetooth
            </button>
          </div>
          <button onClick={onClose} className="w-full neb-btn neb-btn-primary py-3.5 text-base">
            Nueva venta
          </button>
        </div>

      </div>
    </div>
  );
}
