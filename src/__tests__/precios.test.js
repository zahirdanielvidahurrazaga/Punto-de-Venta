import { describe, it, expect } from 'vitest';
import { precioUnitario, desglosePartida, ahorroTotal, faltanParaMayoreo } from '../lib/precios';

const cubeta = { id: 'c', nombre: 'CUBETA', precio: 50, precio_mayoreo: 45, cantidad_mayoreo: 3 };

describe('regla de mayoreo (la misma que registrar_venta)', () => {
  it('menudeo abajo del mínimo, mayoreo desde el mínimo', () => {
    expect(precioUnitario({ ...cubeta, quantity: 2 })).toBe(50);
    expect(precioUnitario({ ...cubeta, quantity: 3 })).toBe(45);
  });
  it('el carrito explica el ahorro y los renglones suman el total', () => {
    const d = desglosePartida({ ...cubeta, quantity: 3 });
    expect(d).toMatchObject({ unitario: 45, importe: 135, mayoreo: true, normal: 50, ahorro: 15 });
    expect(ahorroTotal([{ ...cubeta, quantity: 3 }, { id: 'e', precio: 35, quantity: 1 }])).toBe(15);
  });
  it('mayoreo capturado igual al menudeo no se anuncia (TIT-0178)', () => {
    const d = desglosePartida({ ...cubeta, precio_mayoreo: 50, quantity: 5 });
    expect(d.mayoreo).toBe(false);
    expect(d.ahorro).toBe(0);
  });
  it('reimpresión: usa lo que se cobró, no el precio de hoy, y no inventa ahorro', () => {
    const d = desglosePartida({ ...cubeta, precio: 60, quantity: 3, precio_unitario: 45 });
    expect(d).toMatchObject({ unitario: 45, importe: 135, normal: null, ahorro: 0 });
  });
  it('reimpresión con precio normal guardado: dice el ahorro exacto de aquel día', () => {
    // Hoy la cubeta vale $60, pero el día de la venta valía $50: el ahorro es contra $50.
    const d = desglosePartida({ ...cubeta, precio: 60, quantity: 12, precio_unitario: 45, precio_lista: 50 });
    expect(d).toMatchObject({ unitario: 45, importe: 540, mayoreo: true, normal: 50, ahorro: 60 });
    expect(ahorroTotal([{ ...cubeta, quantity: 12, precio_unitario: 45, precio_lista: 50 }])).toBe(60);
  });
  it('reimpresión a precio normal (sin mayoreo): no marca nada', () => {
    const d = desglosePartida({ ...cubeta, quantity: 2, precio_unitario: 50, precio_lista: 50 });
    expect(d).toMatchObject({ mayoreo: false, normal: null, ahorro: 0 });
  });
  it('empujón: cuántas faltan para el mayoreo', () => {
    expect(faltanParaMayoreo({ ...cubeta, quantity: 2 })).toBe(1);
    expect(faltanParaMayoreo({ ...cubeta, quantity: 3 })).toBeNull();
  });
});
