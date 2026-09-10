// ────────────────────────────────────────────────────────────────────────────
// TICKET TÉRMICO (80 mm) — plantilla de impresión.
//
// Vive aparte del componente a propósito: es lo único que ve el cliente y lo
// único que no se puede "revisar en pantalla" sin gastar papel, así que
// conviene poder generarlo y mirarlo sin levantar la app. No usa React.
//
// Se construye desde los DATOS, no copiando el DOM decorado, para que salga
// limpio en blanco y negro.
// ────────────────────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

/**
 * @param {object}   datos
 * @param {object}   datos.tienda          negocio, rfc, sucursalNombre, direccion, telefono, pie
 * @param {object[]} datos.partidas        salida de `desglosePartida` + { item }
 * @param {number}   datos.total
 * @param {number}   datos.totalArticulos
 * @param {number}   datos.ahorro          ahorro por mayoreo (0 = no se imprime el renglón)
 * @param {object}   datos.paymentData     efectivo/tarjeta/transferencia/totalPagado/cambio
 * @param {string}   datos.fecha
 * @param {string}   datos.hora
 * @param {string}   datos.folio
 */
export function construirTicketHTML({
  tienda, partidas, total, totalArticulos, ahorro = 0, paymentData, fecha, hora, folio,
}) {
  const headerLines = [
    `<div class="big center bold">${esc(tienda.negocio)}</div>`,
    tienda.rfc ? `<div class="center">RFC: ${esc(tienda.rfc)}</div>` : '',
    tienda.sucursalNombre ? `<div class="center bold">${esc(tienda.sucursalNombre)}</div>` : '',
    tienda.direccion ? `<div class="center small">${esc(tienda.direccion)}</div>` : '',
    tienda.telefono ? `<div class="center small">Tel: ${esc(tienda.telefono)}</div>` : '',
  ].filter(Boolean).join('');

  // El renglón dice el precio que DE VERDAD se cobró. Cuando la partida cayó en
  // mayoreo lo marca y explica de cuánto venía, que era justo lo que faltaba:
  // antes el papel mostraba el precio de menudeo y un total más bajo, sin decir
  // por qué.
  const itemsRows = partidas.map(
    ({ item, cantidad, unitario, importe, mayoreo, normal, ahorro: ahorroItem }) => `
      <div class="item">
        <div class="name">${esc(item.nombre)}</div>
        <div class="row small">
          <span>${cantidad} x ${money(unitario)}${mayoreo ? ' <b>MAYOREO</b>' : ''}</span>
          <span>${money(importe)}</span>
        </div>
        ${mayoreo && normal ? `<div class="small nota">Normal ${money(normal)} c/u · ahorra ${money(ahorroItem)}</div>` : ''}
      </div>`
  ).join('');

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
            .nota { padding-left: 4mm; }
            .item { margin-bottom: 6px; page-break-inside: avoid; }
            .sep { border-top: 1px dashed #000; margin: 6px 0; }
            .total { font-size: 16px; font-weight: 800; }
            .head { margin-bottom: 4px; }
          </style>
        </head>
        <body>
          <div class="head">${headerLines}</div>
          <div class="sep"></div>
          <div class="row small"><span>FECHA: ${fecha}</span><span>CAJA: 01</span></div>
          <div class="row small"><span>HORA: ${hora}</span><span>TICKET: ${folio}</span></div>
          <div class="sep"></div>
          ${itemsRows}
          <div class="sep"></div>
          <div class="row total"><span>TOTAL</span><span>${money(total)}</span></div>
          <div class="row small"><span>Artículos</span><span>${totalArticulos}</span></div>
          ${ahorro > 0 ? `<div class="row bold"><span>AHORRO POR MAYOREO</span><span>-${money(ahorro)}</span></div>` : ''}
          ${pagos ? `<div class="sep"></div>${pagos}` : ''}
          <div class="sep"></div>
          ${pie}
          <div style="height:6mm"></div>
        </body>
      </html>`;
}
