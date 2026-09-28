import { describe, it, expect } from 'vitest';
import { rangoDe, rangoPedidos, variacion, claveDe, rejillaDe, toLocal } from '../lib/periodos';

const AHORA = new Date(2026, 8, 27, 15, 30); // 27-sep-2026 15:30 local

describe('rangoDe', () => {
  it.each(['hoy', '7d', '30d', '6m'])('%s: el periodo previo termina justo donde empieza el actual (sin hueco ni traslape)', (p) => {
    const r = rangoDe(p, AHORA);
    if (p === 'hoy') {
      // "Hoy" compara contra ayer A ESTA HORA, no contra ayer completo.
      expect(r.hastaPrev.getTime()).toBe(new Date(2026, 8, 26, 15, 30).getTime());
    } else {
      expect(r.hastaPrev.getTime()).toBe(r.desde.getTime());
    }
    expect(r.desdePrev < r.desde).toBe(true);
  });

  it('7 días = hoy y los 6 anteriores, desde medianoche', () => {
    const r = rangoDe('7d', AHORA);
    expect(toLocal(r.desde)).toBe('2026-09-21');
    expect(r.desde.getHours()).toBe(0);
  });

  it('6 meses arranca el día 1 del mes de hace 5 meses', () => {
    expect(toLocal(rangoDe('6m', AHORA).desde)).toBe('2026-04-01');
  });
});

describe('rangoPedidos', () => {
  it('Hoy y 7/30 días dejan el tope ABIERTO (no se congela el "ahora")', () => {
    for (const p of ['hoy', '7dias', '30dias', 'todas']) expect(rangoPedidos(p, '', AHORA).hasta).toBeNull();
  });
  it('Pedidos y Dashboard arrancan en el mismo instante', () => {
    expect(rangoPedidos('7dias', '', AHORA).desde.getTime()).toBe(rangoDe('7d', AHORA).desde.getTime());
    expect(rangoPedidos('30dias', '', AHORA).desde.getTime()).toBe(rangoDe('30d', AHORA).desde.getTime());
  });
  it('la fecha suelta no se corre un día por zona horaria', () => {
    const r = rangoPedidos('custom', '2026-09-10', AHORA);
    expect(toLocal(r.desde)).toBe('2026-09-10');
    expect(toLocal(r.hasta)).toBe('2026-09-11');
  });
});

describe('variacion', () => {
  it('porcentaje normal', () => expect(variacion(120, 100)).toEqual({ txt: '+20.0%', tipo: 'positive' }));
  it('sin base previa', () => expect(variacion(50, 0).txt).toBe('sin base previa'));
  it('×100 todavía se muestra, ×101 ya no', () => {
    expect(variacion(10000, 100).txt).toBe('+9900.0%');
    expect(variacion(10100, 100).txt).toBe('sin base comparable');
  });
});

describe('claveDe / rejillaDe (mismas claves que resumen_ventas)', () => {
  it('claves por hora, día y mes con el formato de la base', () => {
    const d = new Date(2026, 8, 5, 9, 15);
    expect(claveDe(d, 'hora')).toBe('9');
    expect(claveDe(d, 'dia')).toBe('2026-09-05');
    expect(claveDe(d, 'mes')).toBe('2026-09'); // mes 1-based, como to_char(..., 'YYYY-MM')
  });

  it('la rejilla de 7 días tiene 7 barras y pone cada total en su día', () => {
    const r = rangoDe('7d', AHORA);
    const por = new Map([['2026-09-21', { total: 100, tickets: 2 }], ['2026-09-27', { total: 50, tickets: 1 }]]);
    const rej = rejillaDe(r, por);
    expect(rej).toHaveLength(7);
    expect(rej[0]).toMatchObject({ clave: '2026-09-21', sum: 100, count: 2 });
    expect(rej[6]).toMatchObject({ clave: '2026-09-27', sum: 50 });
    expect(rej.reduce((a, c) => a + c.sum, 0)).toBe(150);
  });

  it('por hora: la rejilla se estira si hubo ventas fuera de 8–20 (no se pierde ninguna)', () => {
    const r = rangoDe('hoy', AHORA);
    const rej = rejillaDe(r, new Map([['7', { total: 30, tickets: 1 }], ['21', { total: 20, tickets: 1 }]]));
    expect(rej[0].clave).toBe('7');
    expect(rej.at(-1).clave).toBe('21');
    expect(rej.reduce((a, c) => a + c.sum, 0)).toBe(50);
  });

  it('6 meses: 6 barras con claves YYYY-MM', () => {
    const rej = rejillaDe(rangoDe('6m', AHORA), new Map([['2026-09', { total: 9, tickets: 1 }]]));
    expect(rej.map(c => c.clave)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(rej.at(-1).sum).toBe(9);
  });
});
