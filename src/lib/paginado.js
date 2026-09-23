// ────────────────────────────────────────────────────────────────────────────
// Paginado de PostgREST — fuente única de verdad.
//
// Supabase corta TODA respuesta en 1000 filas. Pedir `.limit(3000)` no sirve
// de nada: el servidor devuelve 1000, con estado 200 y sin avisar, así que la
// pantalla enseña un subconjunto como si fuera el total.
//
// Ya mordió dos veces en este proyecto:
//   · el comparativo de sucursales del Dashboard dejaba fuera 161 tickets
//     (≈$20,000) — corregido el 17-sep-2026;
//   · el historial de Pedidos se quedaba en las ~1000 ventas más recientes de
//     una ventana de 45 días que hoy trae más del doble.
//
// Cualquier consulta que PUEDA pasar de 1000 filas tiene que pasar por aquí.
// ────────────────────────────────────────────────────────────────────────────

export const PAGINA    = 1000;
export const MAX_FILAS = 20000;

/**
 * Trae TODAS las filas de una consulta, de mil en mil.
 *
 * @param construir () => query de Supabase SIN `.range()` (se aplica aquí).
 *                  Es una función y no la query ya armada porque cada página
 *                  necesita su propia instancia.
 * @param opts      { max } tope de seguridad; al alcanzarlo corta y avisa.
 * @returns { filas, truncado } — `truncado` es true SOLO si se llegó al tope,
 *          nunca por el corte de 1000 (ese ya lo resuelve el bucle).
 */
export async function traerTodo(construir, { max = MAX_FILAS } = {}) {
  const filas = [];
  let inicio = 0, truncado = false;
  for (;;) {
    const { data, error } = await construir().range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
    if (filas.length >= max) { truncado = true; break; }
    inicio += PAGINA;
  }
  return { filas, truncado };
}
