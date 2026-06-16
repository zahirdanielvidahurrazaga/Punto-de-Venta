import React from 'react';
import { Printer, X, CheckCircle, Store, Mail, Phone } from 'lucide-react';
import { datosTienda } from '../config/tienda';

export default function TicketModal({ cart, total, paymentData, sucursal, onClose }) {
  const tienda = datosTienda(sucursal);

  const ticketNumber = (Math.floor(Math.random() * 10000)).toString().padStart(4, '0');
  const date = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const totalArticulos = cart.reduce((acc, i) => acc + i.quantity, 0);

  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const money = (n) => `$${Number(n || 0).toFixed(2)}`;

  // Genera el HTML del ticket térmico desde los DATOS (no copia el DOM decorado),
  // para que salga limpio en blanco y negro a 80mm.
  const buildTicketHTML = () => {
    const headerLines = [
      `<div class="big center bold">${esc(tienda.negocio)}</div>`,
      tienda.rfc ? `<div class="center">RFC: ${esc(tienda.rfc)}</div>` : '',
      tienda.sucursalNombre ? `<div class="center bold">${esc(tienda.sucursalNombre)}</div>` : '',
      tienda.direccion ? `<div class="center small">${esc(tienda.direccion)}</div>` : '',
      tienda.telefono ? `<div class="center small">Tel: ${esc(tienda.telefono)}</div>` : '',
    ].filter(Boolean).join('');

    const itemsRows = cart.map((item) => `
      <div class="item">
        <div class="name">${esc(item.nombre)}</div>
        <div class="row small">
          <span>${item.quantity} x ${money(item.precio)}</span>
          <span>${money(item.precio * item.quantity)}</span>
        </div>
      </div>`).join('');

    const pagos = paymentData ? [
      paymentData.efectivo > 0 ? `<div class="row"><span>Efectivo</span><span>${money(paymentData.efectivo)}</span></div>` : '',
      paymentData.tarjeta > 0 ? `<div class="row"><span>Tarjeta</span><span>${money(paymentData.tarjeta)}</span></div>` : '',
      paymentData.transferencia > 0 ? `<div class="row"><span>Transferencia</span><span>${money(paymentData.transferencia)}</span></div>` : '',
      `<div class="row"><span>Recibido</span><span>${money(paymentData.totalPagado)}</span></div>`,
      `<div class="row bold"><span>Cambio</span><span>${money(paymentData.cambio || 0)}</span></div>`,
    ].filter(Boolean).join('') : '';

    const pie = (tienda.pie || []).map((l) => `<div class="center">${esc(l)}</div>`).join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Ticket</title>
          <style>
            @page { margin: 0; size: 80mm auto; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff; }
            body {
              width: 70mm;
              padding: 3mm 4mm 8mm;
              color: #000;
              font-family: 'Lucida Console', Consolas, monospace;
              font-size: 12px;
              font-weight: 400;
              line-height: 1.4;
              -webkit-font-smoothing: none;
              word-break: break-word;
            }
            .center { text-align: center; }
            .bold { font-weight: 700; }
            .big { font-size: 15px; font-weight: 700; letter-spacing: 0.5px; }
            .small { font-size: 12px; }
            .row { display: flex; justify-content: space-between; gap: 6px; }
            .name { font-weight: 700; word-break: break-word; }
            .item { margin-bottom: 6px; page-break-inside: avoid; }
            .sep { border-top: 1px dashed #000; margin: 6px 0; }
            .total { font-size: 16px; font-weight: 800; }
            .head { margin-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="head">${headerLines}</div>
          <div class="sep"></div>
          <div class="row small"><span>FECHA: ${date}</span><span>CAJA: 01</span></div>
          <div class="row small"><span>HORA: ${time}</span><span>TICKET: ${ticketNumber}</span></div>
          <div class="sep"></div>
          ${itemsRows}
          <div class="sep"></div>
          <div class="row total"><span>TOTAL</span><span>${money(total)}</span></div>
          <div class="row small"><span>Artículos</span><span>${totalArticulos}</span></div>
          ${pagos ? `<div class="sep"></div>${pagos}` : ''}
          <div class="sep"></div>
          ${pie}
          <div style="height:6mm"></div>
        </body>
      </html>`;
  };

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
                <span>{totalArticulos}</span>
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
