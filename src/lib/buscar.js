// ────────────────────────────────────────────────────────────────────────────
// BÚSQUEDA DE PRODUCTOS EN LA TERMINAL
//
// El buscador anterior pedía que el cajero escribiera el nombre TAL CUAL está
// capturado y en el MISMO ORDEN: era un `includes` sobre el texto crudo. Con un
// catálogo escrito a mano ("CUBETA DE PLASTICO 19 LTS") eso falla todo el
// tiempo — buscar "cubeta 19" o "19 lts cubeta" no devolvía nada, y cualquier
// acento o falta de él dejaba fuera el producto.
//
// Aquí se busca como habla la gente:
//   · sin acentos y sin importar mayúsculas ("jabon" = "JABÓN")
//   · por palabras sueltas y EN CUALQUIER ORDEN ("grande cubeta" = "CUBETA GRANDE")
//   · pegando número y unidad ("19lts" = "19 LTS", "1/2" = "1 2")
//   · aguantando errores de dedo ("cubta", "escova") como último recurso
//   · también por SKU y por categoría
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deja el texto comparable: sin acentos, en minúsculas y con cualquier signo
 * convertido en espacio. La `ñ` se vuelve `n` a propósito — en el teclado del
 * mostrador se escribe de las dos formas ("pinata" / "piñata").
 */
export function normaliza(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Distancia de edición con corte: en cuanto pasa de `max` deja de calcular. */
function distancia(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + costo);
      if (actual[j] < mejor) mejor = actual[j];
    }
    if (mejor > max) return max + 1; // ninguna ruta viable en este renglón
    previa = actual;
  }
  return previa[b.length];
}

/** Errores de dedo tolerados según el largo de lo escrito. */
function tolerancia(token) {
  if (token.length >= 7) return 2;
  if (token.length >= 4) return 1;
  return 0; // con 3 letras o menos, cualquier cambio es otra palabra
}

/** ¿Alguna palabra del producto se parece a `token` salvo un par de teclazos? */
function pareceA(token, palabras) {
  const max = tolerancia(token);
  if (max === 0) return false;
  return palabras.some((palabra) => distancia(token, palabra, max) <= max);
}

/**
 * Prepara el catálogo una sola vez para no re-normalizar 368 productos en cada
 * tecla. Se re-hace solo cuando cambia la lista de productos.
 */
export function indexarProductos(productos = []) {
  return productos.map((p) => {
    const texto = normaliza(`${p.nombre ?? ''} ${p.sku ?? ''} ${p.categoria ?? ''}`);
    return {
      p,
      nombre: normaliza(p.nombre),
      sku: normaliza(p.sku),
      texto,
      // Sin espacios: hace que "19lts" encuentre "19 LTS" y "1/2" encuentre "1 2".
      compacto: texto.replace(/ /g, ''),
      palabras: texto.split(' ').filter(Boolean),
    };
  });
}

// Rangos de calidad: entre menor el número, más arriba sale el producto.
const RANGO_SKU_EXACTO = 0;
const RANGO_EMPIEZA = 1;
const RANGO_FRASE = 2;
const RANGO_PALABRAS = 3;
const RANGO_SUELTO = 4;
const RANGO_PARECIDO = 5;

/**
 * Busca en el índice y devuelve los productos ya ordenados por qué tan bien
 * corresponden a lo escrito.
 *
 * El difuso es DELIBERADAMENTE el último recurso: solo entra si la búsqueda
 * literal no encontró nada. Si el cajero escribió bien, no queremos meterle
 * productos parecidos entre los buenos.
 */
export function buscarEnIndice(indice, termino, limite = 24) {
  const frase = normaliza(termino);
  if (!frase) return [];

  const tokens = frase.split(' ').filter(Boolean);
  const resultados = [];

  for (const item of indice) {
    let rango = null;

    if (item.sku && item.sku === frase) {
      rango = RANGO_SKU_EXACTO;
    } else if (item.nombre.startsWith(frase) || item.sku.startsWith(frase)) {
      rango = RANGO_EMPIEZA;
    } else if (item.texto.includes(frase)) {
      rango = RANGO_FRASE;
    } else if (tokens.every((t) => item.palabras.some((w) => w.startsWith(t)))) {
      // Todas las palabras escritas empiezan alguna palabra del producto,
      // sin importar el orden: "grande cubeta" → "CUBETA GRANDE".
      rango = RANGO_PALABRAS;
    } else if (tokens.every((t) => item.texto.includes(t) || item.compacto.includes(t))) {
      rango = RANGO_SUELTO;
    }

    if (rango !== null) resultados.push({ item, rango });
  }

  if (resultados.length === 0) {
    for (const item of indice) {
      const ok = tokens.every(
        (t) => item.texto.includes(t) || item.compacto.includes(t) || pareceA(t, item.palabras)
      );
      if (ok) resultados.push({ item, rango: RANGO_PARECIDO });
    }
  }

  resultados.sort((a, b) => {
    if (a.rango !== b.rango) return a.rango - b.rango;
    return a.item.p.nombre.localeCompare(b.item.p.nombre, 'es');
  });

  return resultados.slice(0, limite).map((r) => r.item.p);
}

/** ¿El resultado salió del rescate por errores de dedo? Para avisarlo en pantalla. */
export function esCoincidenciaAproximada(indice, termino) {
  const frase = normaliza(termino);
  if (!frase) return false;
  const tokens = frase.split(' ').filter(Boolean);
  return !indice.some(
    (item) =>
      item.texto.includes(frase) ||
      tokens.every((t) => item.texto.includes(t) || item.compacto.includes(t))
  );
}
