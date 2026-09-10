// ────────────────────────────────────────────────────────────────────────────
// PRECIO DE UNA PARTIDA — fuente única de verdad.
//
// La regla del mayoreo vivía copiada en tres lados (Terminal para cobrar,
// TicketModal para imprimir, y `registrar_venta` en la base) y se desincronizó:
// el ticket impreso salía con el precio de MENUDEO en cada renglón mientras el
// TOTAL ya traía el mayoreo aplicado, así que los renglones no sumaban el
// total y el cliente veía un descuadre sin explicación.
//
// Todo lo que muestre o imprima un precio debe pasar por aquí. La regla es
// LA MISMA que la de la base de datos (scripts/fix_registrar_venta_mayoreo.sql):
//   precio_mayoreo > 0  AND  cantidad_mayoreo > 0  AND  cantidad >= cantidad_mayoreo
// ────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Cantidad de la partida, venga del carrito (`quantity`) o de la venta (`cantidad`). */
export const cantidadDe = (item) => num(item?.quantity ?? item?.cantidad);

/** ¿Esta partida cae en mayoreo? Misma condición que la BD. */
export function aplicaMayoreo(item, cantidad = cantidadDe(item)) {
  return (
    num(item?.precio_mayoreo) > 0 &&
    num(item?.cantidad_mayoreo) > 0 &&
    cantidad >= num(item.cantidad_mayoreo)
  );
}

/** Precio unitario que se le cobra al cliente por esta partida. */
export function precioUnitario(item, cantidad = cantidadDe(item)) {
  return aplicaMayoreo(item, cantidad) ? num(item.precio_mayoreo) : num(item?.precio);
}

/** Importe de la partida (unitario × cantidad). */
export function importePartida(item, cantidad = cantidadDe(item)) {
  return precioUnitario(item, cantidad) * cantidad;
}

/**
 * Desglose listo para pintar o imprimir un renglón del ticket.
 *
 * Distingue dos orígenes, porque no traen la misma información:
 *
 *  - CARRITO (venta en curso): el item es el producto del catálogo, así que
 *    `precio` es el de menudeo y podemos decir cuánto se ahorró.
 *
 *  - REIMPRESIÓN (historial de ventas): App.jsx pisa `precio` con el
 *    `precio_unitario` que quedó guardado en `venta_detalles`, que es el que
 *    de verdad se cobró. Ahí `normal` va en null a propósito: el precio de
 *    lista de hoy puede no ser el de aquel día, y no vamos a imprimirle al
 *    cliente un "ahorro" que quizá no fue el suyo.
 */
export function desglosePartida(item) {
  const cantidad = cantidadDe(item);

  if (item?.precio_unitario != null) {
    const unitario = num(item.precio_unitario);
    return {
      cantidad,
      unitario,
      importe: unitario * cantidad,
      // Se cobró al precio de mayoreo y la cantidad daba para ello.
      mayoreo:
        num(item.precio_mayoreo) > 0 &&
        num(item.cantidad_mayoreo) > 0 &&
        cantidad >= num(item.cantidad_mayoreo) &&
        unitario === num(item.precio_mayoreo),
      normal: null,
      ahorro: 0,
    };
  }

  const mayoreo = aplicaMayoreo(item, cantidad);
  const unitario = mayoreo ? num(item.precio_mayoreo) : num(item?.precio);
  // `normal` solo tiene sentido si el mayoreo de verdad bajó el precio. Hay
  // productos capturados con el mismo precio en ambas columnas (TIT-0178
  // BASTON CON ROSCA): ahí anunciar "MAYOREO, ahorra $0.00" solo confunde al
  // cliente. Ojo: el precio COBRADO no se toca, porque debe seguir siendo el
  // mismo que calcula `registrar_venta` aunque la captura esté al revés.
  const normal = mayoreo && num(item.precio) > unitario ? num(item.precio) : null;

  return {
    cantidad,
    unitario,
    importe: unitario * cantidad,
    mayoreo: mayoreo && normal !== null,
    normal,
    ahorro: normal !== null ? (normal - unitario) * cantidad : 0,
  };
}

/** Ahorro total del ticket por mayoreo (0 si ninguna partida lo alcanzó). */
export function ahorroTotal(items = []) {
  return items.reduce((acc, item) => acc + desglosePartida(item).ahorro, 0);
}

/**
 * Cuántas piezas le faltan a la partida para alcanzar el mayoreo.
 * Devuelve null si el producto no maneja mayoreo o si ya lo alcanzó.
 * Sirve para avisarle al cajero "una más y le sale más barato".
 */
export function faltanParaMayoreo(item, cantidad = cantidadDe(item)) {
  const minimo = num(item?.cantidad_mayoreo);
  if (minimo <= 0 || num(item?.precio_mayoreo) <= 0) return null;
  if (num(item.precio_mayoreo) >= num(item?.precio)) return null; // no es descuento
  if (cantidad >= minimo) return null;
  return minimo - cantidad;
}
