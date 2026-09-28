import { Printer, X, CheckCircle, Store, Phone, Tag, Loader2, Receipt, Ban, PencilLine } from 'lucide-react';
import { datosTienda } from '../config/tienda';
import { desglosePartida, ahorroTotal } from '../lib/precios';
import { construirTicketHTML } from '../lib/ticketImpreso';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// Folio para mostrar: el consecutivo real de la venta. Antes era un número AL
// AZAR que cambiaba cada vez que se abría el ticket y no correspondía a nada.
const folioTxt = (folio) => (folio != null ? `#${folio}` : '…');

/**
 * Ticket en pantalla + impresión.
 *
 * modo 'cobro'     → recién cobrado en la Terminal ("¡Cobro exitoso!" + Nueva venta).
 * modo 'historial' → abierto desde Pedidos: fecha/hora REALES de la venta, sin
 *                    felicitación ni "Nueva venta", con `acciones` (reimprimir,
 *                    corregir, cancelar) y `extra` (historial de cambios).
 *
 * @param venta  { folio, fecha, cajero, estado, ediciones } — en 'cobro' el
 *               folio llega un instante después del cobro (se muestra "…").
 */
export default function TicketModal({
  cart, total, paymentData, sucursal, onClose,
  modo = 'cobro', venta = null, acciones = null, extra = null,
}) {
  const tienda = datosTienda(sucursal);
  const historial = modo === 'historial';
  const cancelada = venta?.estado === 'cancelada';
  const corregida = !cancelada && (venta?.ediciones || 0) > 0;

  // El precio de cada renglón sale de src/lib/precios.js, igual que el que
  // cobra la Terminal y el que guarda `registrar_venta`.
  const partidas = cart.map((item) => ({ item, ...desglosePartida(item) }));
  const ahorro = ahorroTotal(cart);
  const totalArticulos = cart.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
  // En una cancelada la venta quedó en $0; lo que se había cobrado sale de
  // las partidas, que se conservan.
  const totalPartidas = partidas.reduce((a, p) => a + p.importe, 0);

  const cuando = venta?.fecha ? new Date(venta.fecha) : new Date();
  const date = cuando.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = cuando.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fechaLarga = cuando.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Una venta del historial no guarda cuánto entregó el cliente: "recibido"
  // es la suma de los pagos y no hay cambio. Antes esto hacía
  // `undefined.toFixed()` y tumbaba la app entera al abrir un ticket desde
  // Pedidos (pantalla en blanco, 22→27-sep-2026).
  const pagos = paymentData ? {
    efectivo:      Number(paymentData.efectivo)      || 0,
    tarjeta:       Number(paymentData.tarjeta)       || 0,
    transferencia: Number(paymentData.transferencia) || 0,
  } : null;
  const recibido = pagos
    ? (paymentData.totalPagado ?? (pagos.efectivo + pagos.tarjeta + pagos.transferencia))
    : 0;
  const cambio = Number(paymentData?.cambio) || 0;

  const avisos = [
    historial ? 'REIMPRESIÓN' : '',
    cancelada ? '*** VENTA CANCELADA ***' : '',
    corregida ? 'TICKET CORREGIDO' : '',
  ].filter(Boolean);

  const listoParaImprimir = venta?.folio != null;

  const handlePrint = () => {
    if (!listoParaImprimir) return;
    const html = construirTicketHTML({
      tienda,
      partidas,
      total: cancelada ? 0 : total,
      totalArticulos,
      ahorro,
      paymentData: pagos && { ...pagos, totalPagado: recibido, cambio },
      fecha: date,
      hora: time,
      folio: String(venta.folio),
      cajero: venta?.cajero || '',
      avisos,
    });

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);

    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(html);
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
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-end sm:items-center justify-center z-[70] sm:p-4">
      <div className="neb-glass-strong rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[95vh] pb-[env(safe-area-inset-bottom)]">

        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100 dark:border-slate-800 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {historial ? (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                cancelada ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {cancelada ? <Ban className="w-4 h-4" /> : <Receipt className="w-4 h-4" />}
              </div>
            ) : (
              <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 w-9 h-9 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-tight tracking-tight neb-tabular">
                {historial ? `Ticket ${folioTxt(venta?.folio)}` : '¡Cobro exitoso!'}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-[12px] mt-0.5 neb-tabular truncate first-letter:uppercase">
                {historial ? `${fechaLarga} · ${time}` : `Ticket ${folioTxt(venta?.folio)}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 md:p-6 relative overflow-y-auto neb-scroll flex-1 flex flex-col items-center gap-4">

          {cancelada && (
            <div className="w-full max-w-sm rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 px-4 py-3 text-[12px] text-rose-700 dark:text-rose-300">
              <p className="font-bold flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" /> Venta cancelada</p>
              <p className="mt-0.5">Se había cobrado {money(totalPartidas)}. Ya no suma en ventas ni en el corte, y la mercancía regresó al inventario.</p>
            </div>
          )}
          {corregida && (
            <div className="w-full max-w-sm rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-4 py-3 text-[12px] text-amber-800 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5"><PencilLine className="w-3.5 h-3.5" /> Ticket corregido {venta.ediciones > 1 ? `${venta.ediciones} veces` : ''}</p>
              <p className="mt-0.5">Lo que ves es como quedó. Abajo está qué se cambió y por qué.</p>
            </div>
          )}

          <div id="ticket-termico" className={`w-full max-w-sm bg-white dark:bg-slate-900 relative pb-8 pt-6 px-5 sm:px-8 font-mono text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-slate-800 neb-shadow ${cancelada ? 'opacity-70' : ''}`}>

            <div className="text-center mb-6 mt-2 flex flex-col items-center">
              <div className="w-12 h-12 neb-grad-primary text-white rounded-xl flex items-center justify-center mb-3">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-lg uppercase tracking-[0.1em] text-slate-900 dark:text-white mb-1">{tienda.negocio}</h3>
              {tienda.rfc && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">RFC: {tienda.rfc}</p>}
              {tienda.sucursalNombre && <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">{tienda.sucursalNombre}</p>}
              {tienda.direccion && <p className="text-[11px] text-slate-500 dark:text-slate-400 font-bold">{tienda.direccion}</p>}
              {tienda.telefono && (
                <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {tienda.telefono}</span>
                </div>
              )}
            </div>

            <div className="border-y border-dashed border-slate-300 dark:border-slate-700 py-3 mb-4 text-[11px] font-bold text-slate-600 dark:text-slate-400">
              <div className="flex justify-between gap-2">
                <p>FECHA: {date}</p>
                <p className="neb-tabular">TICKET: {venta?.folio ?? <Loader2 className="w-3 h-3 animate-spin inline" />}</p>
              </div>
              <p>HORA: {time}</p>
              {venta?.cajero && <p className="truncate">ATENDIÓ: {venta.cajero}</p>}
              {avisos.map(a => <p key={a} className="text-center text-slate-900 dark:text-white mt-1">{a}</p>)}
            </div>

            <div className="flex justify-between text-[11px] font-extrabold text-slate-900 dark:text-white border-b border-slate-300 dark:border-slate-700 pb-2 mb-3">
              <span className="w-3/5 text-left">DESCRIPCIÓN</span>
              <span className="w-1/5 text-center">CANT</span>
              <span className="w-1/5 text-right">IMPORTE</span>
            </div>

            <div className="space-y-3 mb-6 text-[12px]">
              {partidas.map(({ item, cantidad, unitario, importe, mayoreo, normal, ahorro: ahorroItem }, i) => (
                <div key={item.id || i} className="flex flex-col">
                  <div className="flex justify-between items-start">
                    <span className="w-3/5 text-left font-bold text-slate-800 dark:text-slate-200 pr-2 break-words">{item.nombre || 'Producto eliminado del catálogo'}</span>
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

            <div className="border-t-2 border-slate-800 dark:border-slate-600 pt-3 mb-6">
              <div className="flex justify-between font-extrabold text-xl text-slate-900 dark:text-white mb-1">
                <span>TOTAL</span>
                <span className="neb-tabular">{money(cancelada ? 0 : total)}</span>
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

            {pagos && !cancelada && (
              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 mb-6">
                {pagos.efectivo > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO EN EFECTIVO:</span><span className="font-bold">{money(pagos.efectivo)}</span></div>}
                {pagos.tarjeta > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO CON TARJETA:</span><span className="font-bold">{money(pagos.tarjeta)}</span></div>}
                {pagos.transferencia > 0 && <div className="flex justify-between"><span className="text-slate-600 dark:text-slate-400">PAGO EN TRANSFER.:</span><span className="font-bold">{money(pagos.transferencia)}</span></div>}
                <div className="border-t border-slate-300 dark:border-slate-700 my-1" />
                <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200 pt-1">
                  <span>RECIBIDO:</span>
                  <span>{money(recibido)}</span>
                </div>
                {!historial && (
                  <div className="flex justify-between font-extrabold text-[12px] pt-1">
                    <span>SU CAMBIO:</span>
                    <span>{money(cambio)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="text-center mt-6 space-y-1">
              {(tienda.pie || []).map((l, i) => (
                <p key={i} className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase">{l}</p>
              ))}
            </div>
          </div>

          {extra}
        </div>

        <div className="p-4 md:p-5 border-t border-slate-100/80 dark:border-slate-800 flex flex-col gap-2.5 shrink-0 z-10">
          {acciones}
          <button onClick={handlePrint} disabled={!listoParaImprimir}
            className="w-full neb-btn neb-btn-ghost py-3 disabled:opacity-50">
            {listoParaImprimir
              ? <><Printer className="w-4 h-4" /> {historial ? 'Reimprimir ticket' : 'Imprimir ticket'}</>
              : <><Loader2 className="w-4 h-4 animate-spin" /> Asignando folio…</>}
          </button>
          <button onClick={onClose} className="w-full neb-btn neb-btn-primary py-3.5 text-base">
            {historial ? 'Cerrar' : 'Nueva venta'}
          </button>
        </div>

      </div>
    </div>
  );
}
