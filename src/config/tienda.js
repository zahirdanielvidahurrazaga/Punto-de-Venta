// ────────────────────────────────────────────────────────────────────────────
// Datos de la tienda que salen IMPRESOS en el ticket térmico.
// Edita aquí con los datos reales. Es el único lugar que necesitas tocar.
// ────────────────────────────────────────────────────────────────────────────

export const TIENDA = {
  // Nombre del negocio tal cual debe salir en el encabezado del ticket.
  nombre: 'Plásticos y Jarciería Tito',

  // Teléfono general (se usa si la sucursal no tiene uno propio abajo).
  telefono: '+52 221 429 1621',

  // RFC / datos fiscales. Déjalo vacío ('') si no aplica; si tiene valor,
  // se imprime debajo del nombre.
  rfc: '',

  // Datos por sucursal. La CLAVE debe ser el nombre EXACTO de la sucursal
  // como está en la tabla `sucursales` de Supabase.
  // Si una dirección ya está cargada en la base de datos, esa tiene prioridad;
  // estas son el respaldo / complemento (teléfono por sucursal).
  sucursales: {
    'Tito Centro': {
      direccion: '',
      telefono: '',
    },
    'Tito Aviación': {
      direccion: '',
      telefono: '',
    },
  },

  // Líneas del pie del ticket (cada elemento del arreglo es un renglón).
  pie: [
    '¡Gracias por su compra!',
  ],
};

// Devuelve los datos de impresión ya resueltos para una sucursal concreta.
// `sucursal` es el objeto { nombre, direccion } que viene de la base de datos
// (puede ser undefined si por alguna razón no se cargó).
export function datosTienda(sucursal) {
  const nombreSuc = sucursal?.nombre || '';
  const cfg = TIENDA.sucursales[nombreSuc] || {};
  return {
    negocio: TIENDA.nombre,
    rfc: TIENDA.rfc,
    sucursalNombre: nombreSuc,
    // La dirección de la BD manda; si no hay, usa la del config.
    direccion: sucursal?.direccion || cfg.direccion || '',
    telefono: cfg.telefono || TIENDA.telefono || '',
    pie: TIENDA.pie,
  };
}
