import { describe, it, expect } from 'vitest';
import { calcFlujo, calcSalidas, calcComparativo, calcProductos, calcKpi } from '../components/dashboard/calculos';
import { normalizarResumen } from '../lib/ventas';

describe('calcFlujo (arqueo)', () => {
  it('esperado = fondo + ventas en efectivo del turno + depósitos − retiros', () => {
    const f = calcFlujo({
      sesiones: [
        { id: 's1', usuario_id: 'u', estado: 'cerrada', fondo_inicial: 500, efectivo_declarado: 1280 },
        { id: 's2', usuario_id: 'u', estado: 'abierta', fondo_inicial: 300 },
      ],
      porSesion: new Map([['s1', { efectivo: 900, tarjeta: 0, transferencia: 0, tickets: 4 }]]),
      movsCaja: [{ sesion_caja_id: 's1', tipo: 'retiro', monto: 200 }, { sesion_caja_id: 's1', tipo: 'deposito', monto: 50 }],
      personas: new Map([['u', 'Equipo Centro']]),
      fueraDeCorte: { tickets: 0, total: 0, efectivo: 0 },
    });
    expect(f.detalle[0].esperado).toBe(1250);
    expect(f.diferencia).toBe(30);
    expect(f.cerradas).toBe(1);
    expect(f.abiertas).toBe(1);
    expect(f.conDescuadre).toBe(1);
    expect(f.porEmpleado[0]).toMatchObject({ nombre: 'Equipo Centro', turnos: 1, ventasEf: 900 });
  });
  it('una cuenta dada de baja usa el nombre congelado del turno', () => {
    const f = calcFlujo({ sesiones: [{ id: 's', estado: 'cerrada', usuario_id: null, usuario_nombre: 'Encargado Jony' }],
      porSesion: new Map(), movsCaja: [], personas: new Map(), fueraDeCorte: {} });
    expect(f.detalle[0].nombre).toBe('Encargado Jony');
  });
});

describe('calcSalidas', () => {
  it('parte por tamaño y agrupa por motivo', () => {
    const s = calcSalidas([
      { id: 1, piezas: 2, precio: 10, quien: 'Carlos', motivo: 'Ajuste manual' },
      { id: 2, piezas: 30, precio: 5, quien: 'Carlos', motivo: 'Conteo físico' },
    ]);
    expect(s.mostrador).toMatchObject({ movimientos: 1, piezas: 2, valor: 20 });
    expect(s.correcciones).toMatchObject({ movimientos: 1, valor: 150 });
    expect(s.porMotivo.map(m => m.motivo)).toEqual(['Conteo físico', 'Sin motivo registrado']);
    expect(s.conMotivo).toBe(true);
  });
});

describe('calcComparativo / calcProductos / calcKpi', () => {
  const catalogo = new Map([['p1', { id: 'p1', nombre: 'Cubeta', sku: 'T1', categoria: 'Plásticos', precio: 50 }],
                            ['p2', { id: 'p2', nombre: 'Escoba', sku: 'T2', categoria: 'Limpieza', precio: 35 }]]);
  const stock = [{ producto_id: 'p1', sucursal_id: 'c', stock: 4 }, { producto_id: 'p2', sucursal_id: 'c', stock: 0 }];

  it('comparativo toma los totales de la base por sucursal', () => {
    const [c] = calcComparativo({ sucursales: [{ id: 'c', nombre: 'Centro' }],
      porSucursal: new Map([['c', { total: 300, tickets: 3, piezas: 7 }]]), stock, catalogo, rutasLiq: [], salidas: [] });
    expect(c).toMatchObject({ total: 300, tickets: 3, ticketPromedio: 100, unidadesVendidas: 7, valorInventario: 200, enCero: 1 });
  });
  it('productos: rankings y categorías desde porProducto', () => {
    const p = calcProductos({ porProducto: new Map([['p1', { unidades: 5, ingresos: 225 }], ['p2', { unidades: 1, ingresos: 35 }]]),
      stock, catalogo, sucursalFiltro: 'todas' });
    expect(p.top5Units.map(x => x.nombre)).toEqual(['Cubeta', 'Escoba']);
    expect(p.categorias[0]).toEqual({ cat: 'Plásticos', ingresos: 225, unidades: 5 });
  });
  it('kpi compara contra el periodo previo', () => {
    const k = calcKpi(normalizarResumen({ total: 200, tickets: 2, efectivo: 200 }), normalizarResumen({ total: 100, tickets: 2, efectivo: 100 }));
    expect(k.dTotal.txt).toBe('+100.0%');
    expect(k.ticket).toBe(100);
  });
});
