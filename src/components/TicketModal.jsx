import React from 'react';
import { Printer, X, CheckCircle, Store, Mail, Phone, Tag } from 'lucide-react';
import { datosTienda } from '../config/tienda';
import { desglosePartida, ahorroTotal } from '../lib/precios';
import { construirTicketHTML } from '../lib/ticketImpreso';

export default function TicketModal({ cart, total, paymentData, sucursal, onClose }) {
  const tienda = datosTienda(sucursal);

  // El precio de cada renglón sale de src/lib/precios.js, igual que el que
  // cobra la Terminal y el que guarda `registrar_venta`. Antes aquí se usaba
  // `item.precio` a secas: en una venta de 3 cubetas el papel imprimía el
  // renglón a precio de MENUDEO ($150) y abajo el TOTAL ya con mayoreo ($135),
  // así que los renglones no sumaban el total y el cliente veía un descuadre
  // sin explicación.
  const partidas = cart.map((item) => ({ item, ...desglosePartida(item) }));
  const ahorro = ahorroTotal(cart);

  const ticketNumber = (Math.floor(Math.random() * 10000)).toString().padStart(4, '0');
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const totalArticulos = cart.reduce((acc, i) => acc + i.quantity, 0);

  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  // La plantilla del papel vive en src/lib/ticketImpreso.js (sin JSX), para
  // poder generarla y revisarla sin levantar la app.
  const buildTicketHTML = () => construirTicketHTML({
    tienda,
    partidas,
    total,
    totalArticulos,
    ahorro,
    paymentData,
    fecha: date,
    hora: time,
    folio: ticketNumber,
  });

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(buildTicketHTML());
    printDoc.write(`<script>
      window.addEventListener('load', function() {
        setTimeout(function() { window.focus(); window.print(); }, 150);
      });
      window.addEventListener('afterprint', function() {
        try { window.parent.document.body.removeChild(window.frameElement); } catch(e) {}
      });
    <\/script>`);
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
              <h3 className="font-extrabold text-xl uppercase tracking-[0.12em] text-slate-900 dark:text-white mb-1">{tienda.negocio}</h3>
              {tienda.rfc && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">RFC: {tienda.rfc}</p>}
              {tienda.sucursalNombre && <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">{tienda.sucursalNombre}</p>}
              {tienda.direccion && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">{tienda.direccion}</p>}

              {tienda.telefono && (
                <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {tienda.telefono}</span>
                </div>
              )}
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
              {partidas.map(({ item, cantidad, unitario, importe, mayoreo, normal, ahorro: ahorroItem }) => (
                <div key={item.id} className="flex flex-col">
                  <div className="flex justify-between items-start">
                    <span className="w-3/5 text-left font-bold text-slate-800 dark:text-slate-200 pr-2">{item.nombre}</span>
                    <span className="w-1/5 text-center text-slate-600 dark:text-slate-400">{cantidad}</span>
                    <span className="w-1/5 text-right font-extrabold text-slate-900 dark:text-white">{money(importe)}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {money(unitario)} c/u
                    {mayoreo && (
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">MAYOREO</span>
                    )}
                    {mayoreo && normal ? (
                      <span>Normal {money(normal)} c/u · ahorra {money(ahorroItem)}</span>
                    ) : null}
                  </span>
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
                <span>{totalArticulos}</span>
              </div>
              {ahorro > 0 && (
                <div className="flex justify-between text-[12px] font-extrabold text-emerald-700 dark:text-emerald-400 uppercase mt-1">
                  <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Ahorro por mayoreo:</span>
                  <span>−{money(ahorro)}</span>
                </div>
              )}
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

            <div className="text-center mt-6 space-y-1">
              {(tienda.pie || []).map((l, i) => (
                <p key={i} className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase">{l}</p>
              ))}
            </div>

          </div>
        </div>

        <div className="p-4 md:p-5 border-t border-slate-100/80 flex flex-col gap-2.5 shrink-0 z-10">
          <button onClick={handlePrint} className="w-full neb-btn neb-btn-ghost py-3">
            <Printer className="w-4 h-4" /> Imprimir ticket
          </button>
          <button onClick={onClose} className="w-full neb-btn neb-btn-primary py-3.5 text-base">
            Nueva venta
          </button>
        </div>

      </div>
    </div>
  );
}
