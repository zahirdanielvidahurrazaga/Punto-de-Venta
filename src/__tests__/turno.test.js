import { describe, it, expect } from 'vitest';
import { diaTienda, esDeHoy, revisarFondo } from '../lib/turno';

describe('día de la tienda (México, UTC−6)', () => {
  it('el corte de las 19:10 sigue siendo el mismo día aunque en UTC ya sea mañana', () => {
    expect(diaTienda('2026-10-02T01:10:00Z')).toBe('2026-10-01');
  });

  it('una checada de ayer no es de hoy', () => {
    const ahora = new Date('2026-09-25T13:02:00Z'); // 07:02 del 25
    expect(esDeHoy('2026-09-24T12:55:00Z', ahora)).toBe(false);
    expect(esDeHoy('2026-09-25T12:58:00Z', ahora)).toBe(true);
  });

  it('una caja abierta a las 19:09 no vale para la mañana siguiente', () => {
    const ahora = new Date('2026-09-11T14:00:00Z'); // 08:00 del 11
    expect(esDeHoy('2026-09-11T01:09:00Z', ahora)).toBe(false); // 19:09 del 10
  });

  it('sin fecha no es de hoy', () => {
    expect(esDeHoy(null)).toBe(false);
  });
});

describe('revisarFondo', () => {
  it('vacío o cero no se acepta', () => {
    expect(revisarFondo('', 1000)).toMatchObject({ ok: false, vacio: true });
    expect(revisarFondo(0, 1000)).toMatchObject({ ok: false, vacio: true });
  });

  it('el fondo exacto pasa sin motivo', () => {
    expect(revisarFondo(1000, 1000)).toEqual({ ok: true, vacio: false, diferencia: 0, requiereMotivo: false });
  });

  it('$100 en vez de $1,000 pide motivo', () => {
    expect(revisarFondo(100, 1000)).toMatchObject({ ok: false, requiereMotivo: true, diferencia: -900 });
  });

  it('un peso de más también pide motivo', () => {
    expect(revisarFondo(1001, 1000)).toMatchObject({ requiereMotivo: true, diferencia: 1 });
  });
});
