import React from 'react';
import { Printer, X, CheckCircle, Store, Mail, Phone } from 'lucide-react';

export default function TicketModal({ cart, total, paymentData, onClose }) {
  // Número de ticket generado (en un entorno real vendría del backend)
  const ticketNumber = (Math.floor(Math.random() * 10000)).toString().padStart(4, '0');
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute:'2-digit' });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
      <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300 flex flex-col max-h-[95vh]">
        
        {/* Header Modal - Éxito */}
        <div className="bg-primary-600 px-6 py-5 flex justify-between items-center text-white shrink-0 shadow-md z-10">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-tight">¡Cobro Exitoso!</h2>
              <p className="text-primary-100 text-xs font-medium">Ticket #{ticketNumber}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Zona del Ticket (Fondo gris claro para resaltar el ticket blanco) */}
        <div className="p-6 md:p-8 relative overflow-y-auto flex-1 flex flex-col items-center">
          
          {/* ----- EL TICKET TÉRMICO ----- */}
          <div className="w-full max-w-sm bg-white shadow-lg relative pb-8 pt-6 px-6 sm:px-8 font-mono text-slate-800" style={{ filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.05))' }}>
            
            {/* Efecto de corte dentado superior */}
            <div className="absolute top-0 left-0 right-0 h-3 flex overflow-hidden">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="w-3 h-3 bg-slate-100 rotate-45 transform origin-bottom-left -mt-2"></div>
              ))}
            </div>

            {/* Cabecera del Comercio */}
            <div className="text-center mb-6 mt-2 flex flex-col items-center">
              <div className="w-12 h-12 bg-slate-900 text-white rounded-xl flex items-center justify-center mb-3">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="font-black text-2xl uppercase tracking-widest text-slate-900 mb-1">Plásticos POS</h3>
              <p className="text-xs text-slate-500 uppercase font-medium">Sucursal Centro</p>
              <p className="text-xs text-slate-500 uppercase font-medium">Av. Principal #123, Ciudad</p>
              
              <div className="flex items-center justify-center gap-3 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> 555-0192</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> hola@pos.com</span>
              </div>
            </div>

            {/* Metadatos del Ticket */}
            <div className="border-y border-dashed border-slate-300 py-3 mb-4 text-xs font-medium text-slate-600 flex justify-between">
              <div>
                <p>FECHA: {date}</p>
                <p>HORA: {time}</p>
              </div>
              <div className="text-right">
                <p>CAJA: 01</p>
                <p>TICKET: {ticketNumber}</p>
              </div>
            </div>

            {/* Encabezado Tabla */}
            <div className="flex justify-between text-xs font-bold text-slate-900 border-b border-slate-300 pb-2 mb-3">
              <span className="w-3/5 text-left">DESCRIPCIÓN</span>
              <span className="w-1/5 text-center">CANT</span>
              <span className="w-1/5 text-right">IMPORTE</span>
            </div>

            {/* Lista de Productos */}
            <div className="space-y-3 mb-6 text-xs sm:text-sm">
              {cart.map(item => (
                <div key={item.id} className="flex flex-col">
                  <div className="flex justify-between items-start">
                    <span className="w-3/5 text-left font-semibold text-slate-800 pr-2">{item.nombre}</span>
                    <span className="w-1/5 text-center text-slate-600">{item.quantity}</span>
                    <span className="w-1/5 text-right font-bold text-slate-900">${(item.precio * item.quantity).toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5">${item.precio.toFixed(2)} c/u</span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="border-t-2 border-slate-800 pt-3 mb-6">
              <div className="flex justify-between font-black text-xl text-slate-900 mb-1">
                <span>TOTAL</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-slate-500 uppercase">
                <span>Total de artículos:</span>
                <span>{cart.reduce((acc, i) => acc + i.quantity, 0)}</span>
              </div>
            </div>
            
            {/* Desglose de Pagos */}
            {paymentData && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5 mb-6">
                {paymentData.efectivo > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">SU PAGO EN EFECTIVO:</span>
                    <span className="font-bold">${paymentData.efectivo.toFixed(2)}</span>
                  </div>
                )}
                {paymentData.tarjeta > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">SU PAGO CON TARJETA:</span>
                    <span className="font-bold">${paymentData.tarjeta.toFixed(2)}</span>
                  </div>
                )}
                {paymentData.transferencia > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">SU PAGO EN TRANSF.:</span>
                    <span className="font-bold">${paymentData.transferencia.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="border-t border-slate-300 my-1"></div>
                
                <div className="flex justify-between font-bold text-slate-800 pt-1">
                  <span>EFECTIVO RECIBIDO:</span>
                  <span>${paymentData.totalPagado.toFixed(2)}</span>
                </div>
                
                {paymentData.cambio > 0 ? (
                  <div className="flex justify-between font-black text-sm pt-1">
                    <span>SU CAMBIO:</span>
                    <span>${paymentData.cambio.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between font-black text-sm pt-1">
                    <span>SU CAMBIO:</span>
                    <span>$0.00</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Mensaje Final & Código de Barras Simulado */}
            <div className="text-center mt-6">
              <p className="text-xs font-bold text-slate-800 uppercase mb-4">¡Gracias por su compra!</p>
              
              {/* Código de barras falso estético */}
              <div className="flex justify-center items-center h-12 w-full opacity-80 gap-0.5">
                {[...Array(40)].map((_, i) => (
                  <div key={i} className="bg-slate-900 h-full" style={{ width: `${Math.max(1, Math.random() * 4)}px` }}></div>
                ))}
              </div>
              <p className="text-[10px] tracking-[0.2em] text-slate-500 mt-1">{ticketNumber}202605{Math.floor(Math.random() * 99)}</p>
            </div>

            {/* Efecto de corte dentado inferior */}
            <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden rotate-180">
              {[...Array(30)].map((_, i) => (
                <div key={i} className="w-3 h-3 bg-slate-100 rotate-45 transform origin-bottom-left -mt-2"></div>
              ))}
            </div>

          </div>
        </div>

        {/* Acciones */}
        <div className="p-4 md:p-6 bg-white border-t border-slate-200 flex flex-col gap-3 shrink-0 z-10">
          <div className="flex gap-3">
            <button
              onClick={() => { window.print(); onClose(); }}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 border border-slate-300"
            >
              <Printer className="w-5 h-5" /> Web Print
            </button>
            <button
              onClick={async () => {
                // Abstracción para futura implementación de Bluetooth con Capacitor
                console.log("Intentando conectar a impresora Bluetooth (Capacitor/WebBluetooth)...");
                alert("La impresión por Bluetooth está en preparación para la App Nativa (Capacitor).");
                onClose();
              }}
              className="flex-1 bg-primary-900 hover:bg-primary-800 text-white py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
            >
              <Printer className="w-5 h-5" /> Bluetooth
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-slate-800 text-white hover:bg-slate-700 py-4 rounded-xl font-bold text-lg transition-colors flex items-center justify-center gap-2 shadow-lg mt-2"
          >
            NUEVA VENTA
          </button>
        </div>

      </div>
    </div>
  );
}
