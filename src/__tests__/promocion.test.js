import { describe, it, expect } from 'vitest';
import { precioUnitario, desglosePartida, descuentoTotal, ahorroTotal, conDescuento, faltanParaMayoreo } from '../lib/precios';
import { promocionVigente } from '../lib/promocion';
import { construirTicketHTML } from '../lib/ticketImpreso';

// Buen Fin 2026: 15% a todo menos las 4 bolsas negras.
const BOLSA = 'e7c4ccaf-9fce-4a76-99fa-6b1ec2d8d38c';
const promo = { id: 'bf', nombre: 'Buen Fin', porcentaje: 15, excluidos: [BOLSA] };
const cubeta = { id: 'c', nombre: 'CUBETA', precio: 50, precio_mayoreo: 45, cantidad_mayoreo: 3 };
const bolsa = { id: BOLSA, nombre: 'BOLSA NEGRA 60X90', precio: 4, precio_mayoreo: 3.3, cantidad_mayoreo: 3 };

describe('promoción Buen Fin (misma regla que registrar_venta)', () => {
  it('redondea por pieza a centavos como la base (sin errores de flotante)', () => {
    expect(conDescuento(6.7, 15)).toBe(5.7);   // 5.695 → 5.70
    expect(conDescuento(7, 15)).toBe(5.95);
    expect(conDescuento(27, 15)).toBe(22.95);
    expect(conDescuento(3.3, 15)).toBe(2.81);  // 2.805 → 2.81
  });
  it('15% sobre menudeo; si llega a mayoreo se cobra mayoreo SIN el 15% (no se acumulan)', () => {
    expect(precioUnitario({ ...cubeta, quantity: 2 }, 2, promo)).toBe(42.5);
    expect(precioUnitario({ ...cubeta, quantity: 3 }, 3, promo)).toBe(45);
    const d = desglosePartida({ ...cubeta, quantity: 3 }, promo);
    expect(d).toMatchObject({ unitario: 45, mayoreo: true, descuento: null, noAcumula: true, sinPromo: false });
  });
  it('no ofrece "una más y baja" cuando con la promoción el mayoreo sale más caro', () => {
    expect(faltanParaMayoreo({ ...cubeta, quantity: 2 }, 2, promo)).toBeNull();   // 45 > 42.50
    expect(faltanParaMayoreo({ ...cubeta, quantity: 2 }, 2, null)).toBe(1);
    const barato = { ...cubeta, precio_mayoreo: 40 };                             // 40 < 42.50
    expect(faltanParaMayoreo({ ...barato, quantity: 2 }, 2, promo)).toBe(1);
  });
  it('las bolsas excluidas cobran normal y se marcan "no aplica"', () => {
    expect(precioUnitario({ ...bolsa, quantity: 2 }, 2, promo)).toBe(4);
    expect(precioUnitario({ ...bolsa, quantity: 3 }, 3, promo)).toBe(3.3);
    const d = desglosePartida({ ...bolsa, quantity: 2 }, promo);
    expect(d).toMatchObject({ unitario: 4, descuento: null, sinPromo: true });
  });
  it('sin promoción todo queda como antes', () => {
    const d = desglosePartida({ ...cubeta, quantity: 3 });
    expect(d).toMatchObject({ unitario: 45, descuento: null, sinPromo: false, ahorro: 15 });
  });
  it('ticket mixto: renglones suman el total y cada ahorro va por su lado', () => {
    const cart = [{ ...cubeta, quantity: 2 }, { ...cubeta, id: 'c2', quantity: 3 }, { ...bolsa, quantity: 2 }];
    const total = cart.reduce((a, i) => a + desglosePartida(i, promo).importe, 0);
    expect(total).toBeCloseTo(85 + 135 + 8, 6);
    expect(ahorroTotal(cart, promo)).toBe(15);           // la cubeta de 3 a mayoreo
    expect(descuentoTotal(cart, promo)).toBeCloseTo(15, 6); // 2 × $7.50 de Buen Fin
  });
  it('reimpresión: usa lo guardado (no la promoción de hoy)', () => {
    const d = desglosePartida({ ...cubeta, quantity: 2, precio_unitario: 42.5, precio_lista: 50,
      promocion_id: 'bf', promocion_nombre: 'Buen Fin', descuento_pct: 15, precio_antes_descuento: 50 });
    expect(d).toMatchObject({ unitario: 42.5, mayoreo: false, ahorro: 0 });
    expect(d.descuento).toMatchObject({ nombre: 'Buen Fin', porcentaje: 15, antes: 50, ahorro: 15 });
    const m = desglosePartida({ ...cubeta, quantity: 3, precio_unitario: 45, precio_lista: 50,
      promocion_id: 'bf', promocion_nombre: 'Buen Fin', descuento_pct: 0 });
    expect(m).toMatchObject({ mayoreo: true, normal: 50, ahorro: 15, descuento: null, noAcumula: true, sinPromo: false });
    const b = desglosePartida({ ...bolsa, quantity: 2, precio_unitario: 4, precio_lista: 4,
      promocion_id: 'bf', promocion_nombre: 'Buen Fin', descuento_pct: 0 });
    expect(b).toMatchObject({ descuento: null, sinPromo: true, noAcumula: false });
  });
  it('el ticket impreso dice la promoción, el ahorro y qué no aplica', () => {
    const cart = [{ ...cubeta, quantity: 1 }, { ...bolsa, quantity: 1 }];
    const partidas = cart.map(item => ({ item, ...desglosePartida(item, promo) }));
    const html = construirTicketHTML({
      tienda: { negocio: 'TITO' }, partidas, total: 46.5, totalArticulos: 2, ahorro: 0,
      descuento: 7.5, promo: { nombre: 'Buen Fin', porcentaje: 15 },
      fecha: '14/11/2026', hora: '10:00', folio: '1',
    });
    expect(html).toContain('BUEN FIN · 15% DE DESCUENTO');
    expect(html).toContain('BUEN FIN -15%');
    expect(html).toContain('No aplica Buen Fin');
    expect(html).toContain('-$7.50');
  });
});

describe('cuál promoción vale según el reloj', () => {
  const bf = { id: 'bf', inicio: '2026-11-14T06:00:00Z', fin: '2026-11-16T06:00:00Z' };
  it('sábado 00:00 a domingo 23:59 hora de México', () => {
    expect(promocionVigente([bf], new Date('2026-11-14T05:59:59Z'))).toBeNull(); // vie 23:59:59
    expect(promocionVigente([bf], new Date('2026-11-14T06:00:00Z'))).toBe(bf);   // sáb 00:00
    expect(promocionVigente([bf], new Date('2026-11-16T05:59:00Z'))).toBe(bf);   // dom 23:59
    expect(promocionVigente([bf], new Date('2026-11-16T06:00:00Z'))).toBeNull(); // lun 00:00
  });
});
