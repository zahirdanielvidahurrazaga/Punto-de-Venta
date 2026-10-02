// ────────────────────────────────────────────────────────────────────────────
// Reglas del flujo del turno del empleado: checar entrada → abrir caja con su
// fondo → vender → corte (que registra la salida).
//
// "De hoy" se decide en la hora de la tienda, igual que la base
// (`hoy_tienda()` en scripts/flujo_turno.sql), no en la del dispositivo: una
// checada o una caja de AYER ya no cuentan para el turno de hoy. Antes una
// checada sin salida valía para siempre y al día siguiente la app se saltaba
// el escaneo.
// ────────────────────────────────────────────────────────────────────────────

const ZONA_TIENDA = 'America/Mexico_City';

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_TIENDA, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** 'YYYY-MM-DD' del instante dado, en la hora de la tienda. */
export const diaTienda = (fecha) => fmtDia.format(new Date(fecha));

export const esDeHoy = (fecha, ahora = new Date()) =>
  !!fecha && diaTienda(fecha) === diaTienda(ahora);

/**
 * Revisión del fondo que el empleado contó al abrir.
 * @returns {{ ok: boolean, vacio: boolean, diferencia: number, requiereMotivo: boolean }}
 */
export function revisarFondo(contado, esperado) {
  const c = Number(contado) || 0;
  const e = Number(esperado) || 0;
  const diferencia = Math.round((c - e) * 100) / 100;
  const vacio = c <= 0;
  const requiereMotivo = !vacio && Math.abs(diferencia) >= 0.01;
  return { ok: !vacio && !requiereMotivo, vacio, diferencia, requiereMotivo };
}
