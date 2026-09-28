import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import TicketModal from '../components/TicketModal';
import { construirTicketHTML } from '../lib/ticketImpreso';
import { desglosePartida } from '../lib/precios';

// renderToString separa texto con <!-- -->; se quita para comparar.
const render = (el) => renderToString(el).replace(/<!-- -->/g, '');

const cart = [
  { id: 'p1', nombre: 'CUBETA 19 LTS', precio: 50, precio_mayoreo: 45, cantidad_mayoreo: 3, quantity: 3 },
  { id: 'p2', nombre: 'ESCOBA', precio: 35, quantity: 1 },
];

describe('TicketModal', () => {
  // El crash del 22→27-sep: Pedidos le pasa pagos SIN totalPagado/cambio y
  // el ticket hacía undefined.toFixed(), tumbando la app entera.
  it('abre desde el historial con pagos sin totalPagado (no truena)', () => {
    const html = render(
      <TicketModal modo="historial" cart={cart.map(i => ({ ...i, precio_unitario: desglosePartida(i).unitario }))}
        total={170} paymentData={{ efectivo: 170, tarjeta: 0, transferencia: 0 }}
        venta={{ folio: 2072, fecha: '2026-09-27T18:00:00Z', cajero: 'Equipo Centro' }} onClose={() => {}} />
    );
    expect(html).toContain('Ticket #2072');
    expect(html).toContain('REIMPRESIÓN');
    expect(html).toContain('Equipo Centro');
    expect(html).not.toContain('Nueva venta');
  });
  it('cancelada: total $0 y dice lo que se había cobrado', () => {
    const html = render(
      <TicketModal modo="historial" cart={[{ ...cart[1], precio_unitario: 35 }]} total={0}
        paymentData={{ efectivo: 0, tarjeta: 0, transferencia: 0 }}
        venta={{ folio: 5, fecha: '2026-09-27T18:00:00Z', estado: 'cancelada', ediciones: 1 }} onClose={() => {}} />
    );
    expect(html).toContain('VENTA CANCELADA');
    expect(html).toContain('Se había cobrado $35.00');
  });
  it('recién cobrado sin folio todavía: no truena y no deja imprimir', () => {
    const html = render(
      <TicketModal cart={cart} total={170} paymentData={{ efectivo: 170, tarjeta: 0, transferencia: 0, totalPagado: 200, cambio: 30 }}
        venta={{ folio: null }} onClose={() => {}} />
    );
    expect(html).toContain('Asignando folio');
    expect(html).toContain('$30.00');
  });
});

describe('ticket impreso', () => {
  it('los renglones suman el TOTAL (mayoreo incluido)', () => {
    const partidas = cart.map(item => ({ item, ...desglosePartida(item) }));
    const html = construirTicketHTML({ tienda: { negocio: 'X', pie: [] }, partidas, total: 170, totalArticulos: 4,
      ahorro: 15, paymentData: { efectivo: 170 }, fecha: '27/09/2026', hora: '12:00', folio: '1', avisos: ['REIMPRESIÓN'] });
    expect(partidas.reduce((a, p) => a + p.importe, 0)).toBe(170);
    expect(html).toContain('MAYOREO');
    expect(html).toContain('Recibido</span><span>$170.00');
    expect(html).toContain('REIMPRESIÓN');
  });
});
