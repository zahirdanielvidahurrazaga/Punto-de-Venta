import { describe, it, expect } from 'vitest';
import { traerTodo } from '../lib/paginado';

// PostgREST falso que, como el real, NUNCA devuelve más de 1000 filas.
const tabla = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));
const consulta = (filas, error = null) => () => ({
  range: (a, b) => Promise.resolve(error ? { data: null, error }
    : { data: filas.slice(a, Math.min(b + 1, a + 1000)), error: null }),
});

describe('traerTodo', () => {
  it.each([0, 999, 1000, 1001, 2000, 3500])('trae las %i filas completas', async (n) => {
    const { filas, truncado } = await traerTodo(consulta(tabla(n)));
    expect(filas).toHaveLength(n);
    expect(truncado).toBe(false);
  });
  it('avisa (truncado) al llegar al tope de seguridad', async () => {
    const { filas, truncado } = await traerTodo(consulta(tabla(5000)), { max: 2000 });
    expect(filas).toHaveLength(2000);
    expect(truncado).toBe(true);
  });
  it('un error de la base se lanza, no se traga como lista vacía', async () => {
    await expect(traerTodo(consulta([], { message: 'permiso denegado' }))).rejects.toMatchObject({ message: 'permiso denegado' });
  });
});
