import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabaseClient', () => ({ supabase: {} }));
import { normalizarResumen, mapVentaLista, fusionarVentas } from '../lib/ventas';
import { resumenProductos, difVenta, etiquetaDia } from '../lib/historial';

describe('normalizarResumen', () => {
  it('convierte los numeric de la base (texto) en números y arma los Map', () => {
    const r = normalizarResumen({
      total: '150.50', tickets: 3, efectivo: '150.50', tarjeta: 0, transferencia: null,
      piezas: '7', canceladas: 1,
      fuera_de_corte: { tickets: 0, total: 0, efectivo: 0 },
      por_cubeta: [{ clave: '2026-09-27', total: '150.50', tickets: 3 }],
      por_sesion: [{ sesion_caja_id: 's1', tickets: 3, efectivo: '150.50', tarjeta: 0, transferencia: 0 }],
      por_producto: [{ producto_id: 'p1', unidades: '7', ingresos: '150.5' }],
      por_sucursal: [{ sucursal_id: 'c', total: '150.50', tickets: 3, piezas: 7 }],
    });
    expect(r.total).toBe(150.5);
    expect(r.transferencia).toBe(0);
    expect(r.ticketPromedio).toBeCloseTo(50.1667, 3);
    expect(r.porCubeta.get('2026-09-27')).toEqual({ total: 150.5, tickets: 3 });
    expect(r.porSesion.get('s1').efectivo).toBe(150.5);
    expect(r.porProducto.get('p1').unidades).toBe(7);
  });
  it('respuesta vacía = todo en cero, nunca undefined', () => {
    const r = normalizarResumen(undefined);
    expect(r.total).toBe(0);
    expect(r.ticketPromedio).toBe(0);
    expect(r.porCubeta.size).toBe(0);
  });
});

describe('mapVentaLista / fusionarVentas', () => {
  const base = { id: 'a', folio: 10, fecha: '2026-09-27T18:00:00.123456+00:00', total: '100', pago_efectivo: '100',
    venta_detalles: [{ cantidad: 2, producto_id: 'p', precio_unitario: 50 }] };

  it('forma estable: pagos, piezas y ts', () => {
    const v = mapVentaLista(base);
    expect(v.pagos).toEqual({ efectivo: 100, tarjeta: 0, transferencia: 0 });
    expect(v.articulos).toBe(2);
    expect(Number.isFinite(v.ts)).toBe(true);
  });
  it('una cancelada (total $0) conserva lo que se había cobrado para mostrarlo', () => {
    const v = mapVentaLista({ ...base, estado: 'cancelada', total: 0, pago_efectivo: 0 });
    expect(v.total).toBe(0);
    expect(v.totalOriginal).toBe(100);
  });
  it('fusionar no duplica y reemplaza la versión corregida', () => {
    const lista = [mapVentaLista(base)];
    const out = fusionarVentas(lista, [{ ...base, total: 60, ediciones: 1 }, { ...base, id: 'b', fecha: '2026-09-27T19:00:00+00:00' }]);
    expect(out.map(v => v.id)).toEqual(['b', 'a']);
    expect(out[1].total).toBe(60);
  });
});

describe('historial (textos)', () => {
  const nombres = new Map([['p1', 'Cubeta'], ['p2', 'Escoba'], ['p3', 'Jabón']]);
  it('resumen de productos: los 2 con más piezas y "y N más"', () => {
    expect(resumenProductos([{ producto_id: 'p1', cantidad: 1 }, { producto_id: 'p2', cantidad: 3 }, { producto_id: 'p3', cantidad: 2 }], nombres))
      .toBe('Escoba ×3, Jabón ×2 y 1 más');
  });
  it('difVenta describe qué cambió', () => {
    const antes   = { total: 60, pago_efectivo: 60, items: [{ producto_id: 'p1', nombre: 'Cubeta', cantidad: 3 }, { producto_id: 'p2', nombre: 'Escoba', cantidad: 1 }] };
    const despues = { total: 45, pago_efectivo: 45, items: [{ producto_id: 'p1', nombre: 'Cubeta', cantidad: 2 }, { producto_id: 'p3', nombre: 'Jabón', cantidad: 1 }] };
    expect(difVenta(antes, despues)).toEqual([
      'Cubeta: 3 → 2 pz', 'Quitó Escoba (1 pz)', 'Agregó Jabón (1 pz)', 'Pago: efectivo $60.00 → efectivo $45.00',
    ]);
  });
  it('etiqueta de día: Hoy / Ayer / fecha', () => {
    const ahora = new Date(2026, 8, 27, 12);
    expect(etiquetaDia('2026-09-27', ahora).titulo).toBe('Hoy');
    expect(etiquetaDia('2026-09-26', ahora).titulo).toBe('Ayer');
    expect(etiquetaDia('2026-09-20', ahora).titulo).toMatch(/^Domingo/);
  });
});
