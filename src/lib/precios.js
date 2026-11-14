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

// ─── Promociones (Buen Fin, nov-2026) ───────────────────────────────────────
// `promo` = { id, nombre, porcentaje, excluidos: [producto_id…] } o null.
// NO SE ACUMULA CON EL MAYOREO (decisión de Carlos, 13-nov-2026): si la
// partida llega a la cantidad de mayoreo se cobra el mayoreo tal cual, aunque
// el menudeo con descuento salga más barato. El descuento solo va sobre el
// menudeo, y se redondea por pieza a centavos, igual que `registrar_venta`:
//   round(precio * (100 - porcentaje) / 100, 2)
// Se calcula en centavos enteros para no arrastrar errores de punto flotante
// (6.70 × 0.85 = 5.6949999… en JS; en la base da 5.70).

const idDe = (item) => item?.producto_id ?? item?.id;

/** ¿La promoción vale para este producto? (false si no hay promo o está excluido). */
export function promoAplica(promo, item) {
  if (!promo || !(num(promo.porcentaje) > 0)) return false;
  const excluidos = promo.excluidos || [];
  return !excluidos.includes(idDe(item));
}

/** Precio con el descuento aplicado, redondeado a centavos como la base. */
export function conDescuento(precio, porcentaje) {
  const centavos = Math.round(num(precio) * 100);
  return Math.round((centavos * (100 - num(porcentaje))) / 100) / 100;
}

/** Precio antes de cualquier promoción: mayoreo o menudeo según la cantidad. */
export function precioBase(item, cantidad = cantidadDe(item)) {
  return aplicaMayoreo(item, cantidad) ? num(item.precio_mayoreo) : num(item?.precio);
}

/** Precio unitario que se le cobra al cliente por esta partida. */
export function precioUnitario(item, cantidad = cantidadDe(item), promo = null) {
  if (aplicaMayoreo(item, cantidad)) return num(item.precio_mayoreo);
  return promoAplica(promo, item) ? conDescuento(item.precio, promo.porcentaje) : num(item?.precio);
}

/** Importe de la partida (unitario × cantidad). */
export function importePartida(item, cantidad = cantidadDe(item), promo = null) {
  return precioUnitario(item, cantidad, promo) * cantidad;
}

/**
 * Desglose listo para pintar o imprimir un renglón del ticket.
 *
 * Distingue dos orígenes, porque no traen la misma información:
 *
 *  - CARRITO (venta en curso): el item es el producto del catálogo, así que
 *    `precio` es el de menudeo y podemos decir cuánto se ahorró.
 *
 *  - REIMPRESIÓN (historial de ventas): `precio_unitario` es lo que de verdad
 *    se cobró. Desde el 27-sep-2026 cada partida guarda también
 *    `precio_lista` (el precio normal de ESE día, lo pone la base), así que la
 *    reimpresión dice el ahorro exacto. Las ventas anteriores no lo tienen:
 *    ahí se marca MAYOREO pero NO se inventa un ahorro con el precio de hoy,
 *    que puede no ser el de aquel día.
 */
export function desglosePartida(item, promo = null) {
  const cantidad = cantidadDe(item);

  // Reimpresión de una venta que cayó en una promoción: la base guardó el
  // porcentaje y el precio de antes del descuento (que pudo ser mayoreo).
  if (item?.precio_unitario != null && item?.promocion_id != null) {
    const unitario = num(item.precio_unitario);
    const pct = num(item.descuento_pct);
    const antes = pct > 0 && item.precio_antes_descuento != null ? num(item.precio_antes_descuento) : unitario;
    const lista = item.precio_lista != null ? num(item.precio_lista) : null;
    const mayoreo = lista != null && lista > antes;
    return {
      cantidad,
      unitario,
      importe: unitario * cantidad,
      mayoreo,
      normal: mayoreo ? lista : null,
      ahorro: mayoreo ? (lista - antes) * cantidad : 0,
      descuento: pct > 0
        ? { nombre: item.promocion_nombre || 'Promoción', porcentaje: pct, antes, ahorro: (antes - unitario) * cantidad }
        : null,
      // La promoción estaba activa pero no entró: por mayoreo (no se acumula)
      // o porque el producto estaba excluido.
      noAcumula: pct === 0 && mayoreo,
      sinPromo: pct === 0 && !mayoreo,
      promoNombre: item.promocion_nombre || 'Promoción',
    };
  }

  if (item?.precio_unitario != null) {
    const unitario = num(item.precio_unitario);
    const lista = item.precio_lista != null ? num(item.precio_lista) : null;

    if (lista != null) {
      // Se cobró por debajo del precio normal de ese día = mayoreo.
      const mayoreo = lista > unitario;
      return {
        cantidad,
        unitario,
        importe: unitario * cantidad,
        mayoreo,
        normal: mayoreo ? lista : null,
        ahorro: mayoreo ? (lista - unitario) * cantidad : 0,
        descuento: null,
        sinPromo: false,
        noAcumula: false,
      };
    }

    return {
      cantidad,
      unitario,
      importe: unitario * cantidad,
      // Venta vieja (sin precio_lista): se marca si cuadra con el mayoreo de hoy.
      mayoreo:
        num(item.precio_mayoreo) > 0 &&
        num(item.cantidad_mayoreo) > 0 &&
        cantidad >= num(item.cantidad_mayoreo) &&
        unitario === num(item.precio_mayoreo),
      normal: null,
      ahorro: 0,
      descuento: null,
      sinPromo: false,
      noAcumula: false,
    };
  }

  const mayoreo = aplicaMayoreo(item, cantidad);
  const base = mayoreo ? num(item.precio_mayoreo) : num(item?.precio);
  const entra = promoAplica(promo, item);
  const conPromo = entra && !mayoreo;   // no se acumula con el mayoreo
  const unitario = conPromo ? conDescuento(base, promo.porcentaje) : base;
  // `normal` solo tiene sentido si el mayoreo de verdad bajó el precio. Hay
  // productos capturados con el mismo precio en ambas columnas (TIT-0178
  // BASTON CON ROSCA): ahí anunciar "MAYOREO, ahorra $0.00" solo confunde al
  // cliente. Ojo: el precio COBRADO no se toca, porque debe seguir siendo el
  // mismo que calcula `registrar_venta` aunque la captura esté al revés.
  const normal = mayoreo && num(item.precio) > base ? num(item.precio) : null;

  return {
    cantidad,
    unitario,
    importe: unitario * cantidad,
    mayoreo: mayoreo && normal !== null,
    normal,
    // Ahorro SOLO por mayoreo; el de la promoción va en `descuento`.
    ahorro: normal !== null ? (normal - base) * cantidad : 0,
    descuento: conPromo
      ? { nombre: promo.nombre, porcentaje: num(promo.porcentaje), antes: base, ahorro: (base - unitario) * cantidad }
      : null,
    // Excluido (las bolsas) vs. ya va a mayoreo: se dicen distinto.
    sinPromo: !!promo && num(promo.porcentaje) > 0 && !entra,
    noAcumula: entra && mayoreo,
    promoNombre: promo?.nombre || null,
  };
}

/** Ahorro total del ticket por mayoreo (0 si ninguna partida lo alcanzó). */
export function ahorroTotal(items = [], promo = null) {
  return items.reduce((acc, item) => acc + desglosePartida(item, promo).ahorro, 0);
}

/** Ahorro total del ticket por la promoción (0 si no hay o nada entró). */
export function descuentoTotal(items = [], promo = null) {
  return items.reduce((acc, item) => acc + (desglosePartida(item, promo).descuento?.ahorro || 0), 0);
}

/**
 * Cuántas piezas le faltan a la partida para alcanzar el mayoreo.
 * Devuelve null si el producto no maneja mayoreo o si ya lo alcanzó.
 * Sirve para avisarle al cajero "una más y le sale más barato".
 */
export function faltanParaMayoreo(item, cantidad = cantidadDe(item), promo = null) {
  const minimo = num(item?.cantidad_mayoreo);
  if (minimo <= 0 || num(item?.precio_mayoreo) <= 0) return null;
  if (num(item.precio_mayoreo) >= num(item?.precio)) return null; // no es descuento
  // Con promoción el menudeo puede quedar por debajo del mayoreo: entonces
  // llegar al mayoreo SUBE el precio y no hay que ofrecerlo.
  if (num(item.precio_mayoreo) >= precioUnitario(item, 1, promo)) return null;
  if (cantidad >= minimo) return null;
  return minimo - cantidad;
}
