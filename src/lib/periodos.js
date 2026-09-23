// ────────────────────────────────────────────────────────────────────────────
// Matemática de periodos del Dashboard: rangos, comparativo con el periodo
// previo y las cubetas de la gráfica.
//
// Vive aparte del componente porque es la parte que se puede equivocar en
// silencio (y se equivocaba): la gráfica de "4 semanas" armaba cubetas por
// rangos [fin−6d, fin] y dejaba fuera un día entero entre semana y semana,
// así que el total de la gráfica no cuadraba con el total de las ventas.
// Ahora las cubetas se llenan por CLAVE (hora / día / mes) y toda venta del
// rango cae en exactamente una.
// ────────────────────────────────────────────────────────────────────────────

export const PERIODOS = [
  { key: 'hoy', label: 'Hoy'      },
  { key: '7d',  label: '7 días'   },
  { key: '30d', label: '30 días'  },
  { key: '6m',  label: '6 meses'  },
];

export const toLocal = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};

export const inicioDelDia = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
export const masDias      = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/**
 * Rango del periodo elegido + el periodo previo del mismo largo, para comparar
 * de verdad (la pantalla traía porcentajes fijos escritos a mano).
 *
 * @param periodo 'hoy' | '7d' | '30d' | '6m'
 * @param ahora   inyectable para poder probarlo
 */
export function rangoDe(periodo, ahora = new Date()) {
  if (periodo === 'hoy') {
    const desde = inicioDelDia(ahora);
    return {
      desde, hasta: new Date(ahora),
      // Ayer a la misma hora: comparar el día completo de ayer contra medio día
      // de hoy haría ver una caída que no existe.
      desdePrev: masDias(desde, -1), hastaPrev: masDias(ahora, -1),
      comparativa: 'vs ayer a esta hora',
      etiqueta: 'hoy', grano: 'hora',
    };
  }
  if (periodo === '7d') {
    const desde = inicioDelDia(masDias(ahora, -6));
    return {
      desde, hasta: new Date(ahora),
      desdePrev: masDias(desde, -7), hastaPrev: desde,
      comparativa: 'vs los 7 días previos',
      etiqueta: 'últimos 7 días', grano: 'dia',
    };
  }
  if (periodo === '30d') {
    const desde = inicioDelDia(masDias(ahora, -29));
    return {
      desde, hasta: new Date(ahora),
      desdePrev: masDias(desde, -30), hastaPrev: desde,
      comparativa: 'vs los 30 días previos',
      etiqueta: 'últimos 30 días', grano: 'dia',
    };
  }
  // 6 meses naturales: del día 1 del mes de hace 5 meses hasta hoy.
  const desde     = new Date(ahora.getFullYear(), ahora.getMonth() - 5,  1, 0,0,0,0);
  const desdePrev = new Date(ahora.getFullYear(), ahora.getMonth() - 11, 1, 0,0,0,0);
  return {
    desde, hasta: new Date(ahora),
    desdePrev, hastaPrev: desde,
    comparativa: 'vs los 6 meses previos',
    etiqueta: 'últimos 6 meses', grano: 'mes',
  };
}

/**
 * Variación porcentual contra el periodo previo.
 *
 * Cuando el periodo previo es una miseria al lado del actual, el porcentaje
 * es cierto pero no informa nada: en 30 días salía **+145,919.2%** porque los
 * 30 días previos tuvieron $138 contra $201,506 (el negocio arrancó dentro de
 * la ventana). Un número así solo ocupa lugar, así que se dice lo que de
 * verdad pasa.
 */
const SIN_BASE = 100; // el actual es más de 100× el previo

export function variacion(actual, previo) {
  if (!previo) return actual > 0 ? { txt: 'sin base previa', tipo: 'neutral' } : null;
  if (actual / previo > SIN_BASE) return { txt: 'sin base comparable', tipo: 'neutral' };
  const pct = ((actual - previo) / previo) * 100;
  return {
    txt: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`,
    tipo: pct > 0.05 ? 'positive' : pct < -0.05 ? 'negative' : 'neutral',
  };
}

const claveDe = (fecha, grano) => {
  const d = new Date(fecha);
  if (grano === 'hora') return String(d.getHours());
  if (grano === 'dia')  return toLocal(d);
  return `${d.getFullYear()}-${d.getMonth()}`;
};

/**
 * Cubetas de la gráfica para el rango dado. Devuelve SIEMPRE la rejilla
 * completa (días sin venta incluidos, en cero) y reparte cada venta por clave.
 *
 * @param ventas [{ fecha, total }]
 * @param rango  lo que devuelve rangoDe()
 */
export function cubetasDe(ventas, rango) {
  const { desde, hasta, grano } = rango;
  const cubetas = [];
  const indice = new Map();
  const nueva = (clave, label) => {
    const b = { clave, label, sum: 0, count: 0 };
    cubetas.push(b); indice.set(clave, b);
  };

  if (grano === 'hora') {
    // La rejilla cubre el horario de tienda (8–20) y se estira si hubo ventas
    // más temprano o más tarde, para que ninguna se quede fuera.
    const horas = ventas.map(v => new Date(v.fecha).getHours());
    const ini = Math.min(8,  ...(horas.length ? horas : [8]));
    const fin = Math.max(20, ...(horas.length ? horas : [20]));
    for (let h = ini; h <= fin; h++) nueva(String(h), `${h}h`);
  } else if (grano === 'dia') {
    for (let d = new Date(desde); d <= hasta; d = masDias(d, 1)) {
      nueva(toLocal(d), d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }));
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const d = new Date(desde.getFullYear(), desde.getMonth() + i, 1);
      nueva(`${d.getFullYear()}-${d.getMonth()}`,
            d.toLocaleDateString('es-MX', { month: 'short' }));
    }
  }

  for (const v of ventas) {
    const b = indice.get(claveDe(v.fecha, grano));
    if (b) { b.sum += Number(v.total) || 0; b.count++; }
  }
  return cubetas;
}

// ────────────────────────────────────────────────────────────────────────────
// Pedidos usa sus propias etiquetas (Hoy · Ayer · 7 · 30 · Todas + una fecha
// suelta), pero la matemática vive aquí por la misma razón que la del
// Dashboard: es la que se equivoca sin que nadie se entere.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Rango [desde, hasta) del periodo elegido.
 *
 * `hasta` se deja ABIERTO en los periodos que llegan hasta hoy. Es a propósito:
 * si se fija un tope "ahora", ese tope se congela en el momento de la consulta
 * y toda venta que entre después por realtime cae "en el futuro" y se descarta
 * (ese bug ya nos pasó en el Dashboard el 17-sep). No hay ventas futuras, así
 * que no acotar por arriba es correcto y además es a prueba de relojes.
 */
export function rangoPedidos(periodo, customDate, ahora = new Date()) {
  const hoy = inicioDelDia(ahora);
  switch (periodo) {
    case 'hoy':    return { desde: hoy, hasta: null };
    case 'ayer':   return { desde: masDias(hoy, -1), hasta: hoy };
    case '7dias':  return { desde: masDias(hoy, -6),  hasta: null };
    case '30dias': return { desde: masDias(hoy, -29), hasta: null };
    case 'custom': {
      if (!customDate) return { desde: null, hasta: null };
      // El input date da 'YYYY-MM-DD'; se arma local para no correrse un día
      // por zona horaria (new Date('2026-09-22') se interpreta como UTC).
      const [a, m, d] = customDate.split('-').map(Number);
      const dia = new Date(a, m - 1, d, 0, 0, 0, 0);
      return { desde: dia, hasta: masDias(dia, 1) };
    }
    case 'todas':
    default:       return { desde: null, hasta: null };
  }
}

