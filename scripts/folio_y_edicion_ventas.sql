-- ============================================================================
-- FOLIO CONSECUTIVO + EDICIÓN / CANCELACIÓN DE VENTAS (solo admin) + ERRORES
-- Sesión 2026-09-27. Pegar y ejecutar en el SQL Editor de Supabase (o por la
-- API de management). Es idempotente: se puede correr dos veces.
-- ============================================================================
--
-- 1. FOLIO. El ticket traía un número AL AZAR (Math.random) que no correspondía
--    a nada: dos tickets podían tener el mismo número y no había forma de
--    buscar una venta por el papel que trae el cliente. Ahora cada venta tiene
--    `ventas.folio`, consecutivo, el mismo en pantalla, en el papel y al
--    reimprimir. Las ventas que ya existen se numeran por fecha (la primera
--    venta del negocio es la #1).
--
-- 2. EDITAR / CANCELAR. Lo pidió el dueño: corregir una venta ya hecha
--    (cantidades, quitar/agregar productos, forma de pago) o cancelarla.
--    Reglas:
--      * Solo admin (se valida aquí, no en la pantalla).
--      * Motivo OBLIGATORIO.
--      * La venta guarda sus valores VIGENTES (total, pagos, partidas): así
--        todo lo que ya suma ventas —Dashboard, cortes de caja, Reportes y
--        las apps viejas que no se han actualizado— cuadra sin cambiar nada.
--        Una venta cancelada queda en $0 y con estado 'cancelada'.
--      * Lo que había ANTES queda en la bitácora `ventas_ediciones` (quién,
--        cuándo, por qué, antes y después), así que nada se pierde.
--      * El stock se regresa o se descuenta solo, en la sucursal de la venta,
--        con su movimiento de inventario ('devolucion_venta' / 'salida_venta')
--        que dice qué folio lo causó.
--      * Precio: una partida que no cambia conserva el precio al que se cobró;
--        una partida nueva o con otra cantidad se cobra con la MISMA regla de
--        mayoreo que `registrar_venta`, con el catálogo de hoy.
--      * Los pagos tienen que sumar el total nuevo (no se guarda cambio).
--
-- 3. ERRORES DE LA APP. En el iPhone una pantalla en blanco no deja rastro.
--    `errores_app` recibe el error que atrapa la app (mensaje, pila, pantalla,
--    versión) para poder diagnosticarlo sin tener el teléfono enfrente.
-- ----------------------------------------------------------------------------

BEGIN;

-- ─── 1. Folio ───────────────────────────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS folio bigint;

-- Numerar las que ya existen, de la más vieja a la más nueva.
WITH orden AS (
  SELECT id, row_number() OVER (ORDER BY fecha, id) AS n
    FROM ventas
   WHERE folio IS NULL
)
UPDATE ventas v
   SET folio = o.n + COALESCE((SELECT max(folio) FROM ventas), 0)
  FROM orden o
 WHERE v.id = o.id;

CREATE SEQUENCE IF NOT EXISTS ventas_folio_seq OWNED BY ventas.folio;
SELECT setval('ventas_folio_seq', GREATEST(COALESCE((SELECT max(folio) FROM ventas), 0), 1),
              (SELECT max(folio) FROM ventas) IS NOT NULL);
ALTER TABLE ventas ALTER COLUMN folio SET DEFAULT nextval('ventas_folio_seq');
ALTER TABLE ventas ALTER COLUMN folio SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ventas_folio_key ON ventas(folio);

-- ─── 2. Estado de la venta ──────────────────────────────────────────────────
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado        text NOT NULL DEFAULT 'activa';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS modificada_at timestamptz;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ediciones     integer NOT NULL DEFAULT 0;

ALTER TABLE ventas DROP CONSTRAINT IF EXISTS ventas_estado_check;
ALTER TABLE ventas ADD  CONSTRAINT ventas_estado_check CHECK (estado IN ('activa', 'cancelada'));

-- Para que la app se ponga al día con lo editado mientras estuvo dormida.
CREATE INDEX IF NOT EXISTS ventas_modificada_at_idx ON ventas(modificada_at) WHERE modificada_at IS NOT NULL;

-- ─── 3. Bitácora ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ventas_ediciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id       uuid NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  folio          bigint,
  tipo           text NOT NULL CHECK (tipo IN ('edicion', 'cancelacion')),
  motivo         text NOT NULL CHECK (length(btrim(motivo)) > 0),
  antes          jsonb NOT NULL,
  despues        jsonb NOT NULL,
  usuario_id     uuid REFERENCES usuarios_perfiles(id) ON DELETE SET NULL,
  usuario_nombre text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ventas_ediciones_venta_idx ON ventas_ediciones(venta_id, created_at);

ALTER TABLE ventas_ediciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ventas_ediciones lectura" ON ventas_ediciones;
-- Lectura para cualquier cuenta: el empleado también ve que un ticket se
-- corrigió y por qué (si no, el papel que trae el cliente no cuadra con la
-- pantalla y no hay cómo explicarlo). Escribir, solo por las funciones.
CREATE POLICY "ventas_ediciones lectura" ON ventas_ediciones
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── 4. Tipos de movimiento de inventario ───────────────────────────────────
-- Se agrega 'devolucion_venta' SIN perder los que ya estén en producción:
-- se leen de la restricción viva en vez de reescribir la lista a mano.
DO $$
DECLARE
  v_tipos text[];
BEGIN
  SELECT array_agg(DISTINCT t) INTO v_tipos FROM (
    SELECT (regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''', 'g'))[1] AS t
      FROM pg_constraint c
     WHERE c.conname = 'movimientos_inventario_tipo_check'
    UNION SELECT DISTINCT tipo FROM movimientos_inventario
    UNION SELECT 'devolucion_venta'
  ) x;

  ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;
  EXECUTE format(
    'ALTER TABLE movimientos_inventario ADD CONSTRAINT movimientos_inventario_tipo_check CHECK (tipo = ANY (%L::text[]))',
    v_tipos);
END $$;

-- ─── 5. descontar_stock respeta la edición ──────────────────────────────────
-- La edición mueve el stock ella misma (por DIFERENCIA, en un solo
-- movimiento por producto). Sin este interruptor, reescribir las partidas
-- dispararía el trigger y descontaría la venta completa otra vez.
-- El resto de la función es la versión multisucursal que está viva.
CREATE OR REPLACE FUNCTION descontar_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_sucursal uuid;
    v_stock    integer;
    v_nombre   varchar;
BEGIN
    IF current_setting('pos.edicion_venta', true) = 'on' THEN
        RETURN NEW;
    END IF;

    SELECT sucursal_id INTO v_sucursal FROM ventas WHERE id = NEW.venta_id;
    SELECT nombre INTO v_nombre FROM productos WHERE id = NEW.producto_id;

    SELECT stock INTO v_stock FROM producto_stock
    WHERE producto_id = NEW.producto_id AND sucursal_id = v_sucursal;
    IF v_stock IS NULL THEN v_stock := 0; END IF;

    IF v_stock < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto % (Disponible: %, Requerido: %)',
            v_nombre, v_stock, NEW.cantidad;
    END IF;

    UPDATE producto_stock SET stock = stock - NEW.cantidad, updated_at = now()
    WHERE producto_id = NEW.producto_id AND sucursal_id = v_sucursal;

    INSERT INTO movimientos_inventario
        (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
    VALUES
        (NEW.producto_id, v_nombre, 'salida_venta', -NEW.cantidad,
         v_stock, v_stock - NEW.cantidad, 'Salida por venta', auth.uid(), v_sucursal);

    PERFORM sincronizar_stock_legacy(NEW.producto_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 6. Foto de una venta (para la bitácora) ────────────────────────────────
CREATE OR REPLACE FUNCTION foto_venta(p_venta uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total',              v.total,
    'pago_efectivo',      v.pago_efectivo,
    'pago_tarjeta',       v.pago_tarjeta,
    'pago_transferencia', v.pago_transferencia,
    'estado',             v.estado,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'producto_id',     d.producto_id,
               'nombre',          p.nombre,
               'sku',             p.sku,
               'cantidad',        d.cantidad,
               'precio_unitario', d.precio_unitario
             ) ORDER BY p.nombre)
        FROM venta_detalles d JOIN productos p ON p.id = d.producto_id
       WHERE d.venta_id = v.id), '[]'::jsonb)
  )
  FROM ventas v WHERE v.id = p_venta;
$$;
REVOKE ALL ON FUNCTION foto_venta(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION foto_venta(uuid) TO authenticated;

-- ─── 7. Mover stock por diferencia (uso interno) ────────────────────────────
-- p_delta > 0 regresa piezas al stock; < 0 las saca (valida existencia).
CREATE OR REPLACE FUNCTION _stock_por_edicion(
  p_producto uuid, p_sucursal uuid, p_delta integer, p_folio bigint, p_motivo text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_stock  integer;
  v_nombre varchar;
BEGIN
  IF p_delta = 0 THEN RETURN; END IF;
  SELECT nombre INTO v_nombre FROM productos WHERE id = p_producto;

  INSERT INTO producto_stock (producto_id, sucursal_id, stock)
  VALUES (p_producto, p_sucursal, 0)
  ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

  SELECT stock INTO v_stock FROM producto_stock
   WHERE producto_id = p_producto AND sucursal_id = p_sucursal
   FOR UPDATE;

  IF v_stock + p_delta < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto % (Disponible: %, Requerido: %)',
      v_nombre, v_stock, -p_delta;
  END IF;

  UPDATE producto_stock SET stock = stock + p_delta, updated_at = now()
   WHERE producto_id = p_producto AND sucursal_id = p_sucursal;

  INSERT INTO movimientos_inventario
    (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
  VALUES
    (p_producto, v_nombre,
     CASE WHEN p_delta > 0 THEN 'devolucion_venta' ELSE 'salida_venta' END,
     p_delta, v_stock, v_stock + p_delta,
     CASE WHEN p_delta > 0 THEN 'Devolución' ELSE 'Salida' END
       || ' por corrección del ticket #' || p_folio || ' — ' || p_motivo,
     auth.uid(), p_sucursal);

  PERFORM sincronizar_stock_legacy(p_producto);
END;
$$;
REVOKE ALL ON FUNCTION _stock_por_edicion(uuid, uuid, integer, bigint, text) FROM PUBLIC, anon, authenticated;

-- ─── 8. editar_venta ────────────────────────────────────────────────────────
-- p_items: [{ "producto_id": uuid, "cantidad": int }, ...]  (la venta completa
--          como debe quedar; un producto que no viene se quita)
-- p_pagos: { "efectivo": n, "tarjeta": n, "transferencia": n }
CREATE OR REPLACE FUNCTION editar_venta(
  p_venta uuid, p_items jsonb, p_pagos jsonb, p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_venta   ventas%ROWTYPE;
  v_antes   jsonb;
  v_despues jsonb;
  v_total   numeric := 0;
  v_ef      numeric := round(COALESCE((p_pagos->>'efectivo')::numeric, 0), 2);
  v_tar     numeric := round(COALESCE((p_pagos->>'tarjeta')::numeric, 0), 2);
  v_tra     numeric := round(COALESCE((p_pagos->>'transferencia')::numeric, 0), 2);
  r         record;
  v_nombre  text;
BEGIN
  IF NOT public.es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un administrador puede corregir ventas.');
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la corrección.');
  END IF;
  IF v_ef < 0 OR v_tar < 0 OR v_tra < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Los pagos no pueden ser negativos.');
  END IF;

  SELECT * INTO v_venta FROM ventas WHERE id = p_venta FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta no existe.');
  END IF;
  IF v_venta.estado = 'cancelada' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta está cancelada; ya no se puede corregir.');
  END IF;

  -- Partidas nuevas, agrupadas por producto.
  DROP TABLE IF EXISTS _nuevas, _final;
  CREATE TEMP TABLE _nuevas ON COMMIT DROP AS
  SELECT (e->>'producto_id')::uuid AS producto_id, sum((e->>'cantidad')::int)::int AS cantidad
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e
   GROUP BY 1;

  IF NOT EXISTS (SELECT 1 FROM _nuevas) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta se quedó sin productos. Para eso usa "Cancelar venta".');
  END IF;
  IF EXISTS (SELECT 1 FROM _nuevas WHERE cantidad IS NULL OR cantidad <= 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hay una cantidad inválida.');
  END IF;
  IF EXISTS (SELECT 1 FROM _nuevas n LEFT JOIN productos p ON p.id = n.producto_id WHERE p.id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Uno de los productos ya no existe en el catálogo.');
  END IF;

  v_antes := foto_venta(p_venta);

  -- Precio de cada partida: si el producto y la cantidad no cambiaron, el que
  -- se cobró; si no, la regla de mayoreo de registrar_venta con el catálogo.
  CREATE TEMP TABLE _final ON COMMIT DROP AS
  SELECT n.producto_id, n.cantidad,
         CASE
           WHEN viejo.cantidad = n.cantidad THEN viejo.precio_unitario
           WHEN p.precio_mayoreo > 0 AND p.cantidad_mayoreo > 0 AND n.cantidad >= p.cantidad_mayoreo
             THEN p.precio_mayoreo
           ELSE p.precio
         END AS precio_unitario
    FROM _nuevas n
    JOIN productos p ON p.id = n.producto_id
    LEFT JOIN LATERAL (
      SELECT sum(d.cantidad)::int AS cantidad, max(d.precio_unitario) AS precio_unitario
        FROM venta_detalles d
       WHERE d.venta_id = p_venta AND d.producto_id = n.producto_id
    ) viejo ON true;

  SELECT COALESCE(sum(precio_unitario * cantidad), 0) INTO v_total FROM _final;
  v_total := round(v_total, 2);

  IF round(v_ef + v_tar + v_tra, 2) <> v_total THEN
    RETURN jsonb_build_object('ok', false, 'error',
      format('Los pagos suman $%s y el total nuevo es $%s. Tienen que coincidir.',
             to_char(v_ef + v_tar + v_tra, 'FM999,999,990.00'), to_char(v_total, 'FM999,999,990.00')));
  END IF;

  -- Stock por DIFERENCIA por producto (+ regresa, − sale).
  FOR r IN
    SELECT COALESCE(a.producto_id, b.producto_id) AS producto_id,
           (COALESCE(a.cantidad, 0) - COALESCE(b.cantidad, 0))::int AS delta
      FROM (SELECT producto_id, sum(cantidad)::int AS cantidad FROM venta_detalles
             WHERE venta_id = p_venta GROUP BY 1) a
      FULL JOIN _final b ON b.producto_id = a.producto_id
  LOOP
    PERFORM _stock_por_edicion(r.producto_id, v_venta.sucursal_id, r.delta, v_venta.folio, btrim(p_motivo));
  END LOOP;

  -- Reescribir las partidas sin que el trigger vuelva a descontar.
  PERFORM set_config('pos.edicion_venta', 'on', true);
  DELETE FROM venta_detalles WHERE venta_id = p_venta;
  INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario)
  SELECT p_venta, producto_id, cantidad, precio_unitario FROM _final;
  PERFORM set_config('pos.edicion_venta', 'off', true);

  UPDATE ventas
     SET total = v_total, pago_efectivo = v_ef, pago_tarjeta = v_tar, pago_transferencia = v_tra,
         modificada_at = now(), ediciones = ediciones + 1
   WHERE id = p_venta;

  v_despues := foto_venta(p_venta);
  SELECT nombre_completo INTO v_nombre FROM usuarios_perfiles WHERE id = auth.uid();

  INSERT INTO ventas_ediciones (venta_id, folio, tipo, motivo, antes, despues, usuario_id, usuario_nombre)
  VALUES (p_venta, v_venta.folio, 'edicion', btrim(p_motivo), v_antes, v_despues, auth.uid(), v_nombre);

  RETURN jsonb_build_object('ok', true, 'folio', v_venta.folio, 'total', v_total,
                            'diferencia', v_total - v_venta.total);
EXCEPTION WHEN OTHERS THEN
  -- Deshace todo: stock, partidas y bitácora. Nada queda a medias.
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION editar_venta(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION editar_venta(uuid, jsonb, jsonb, text) TO authenticated;

-- ─── 9. cancelar_venta ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancelar_venta(p_venta uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_venta  ventas%ROWTYPE;
  v_antes  jsonb;
  r        record;
  v_nombre text;
BEGIN
  IF NOT public.es_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un administrador puede cancelar ventas.');
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Escribe el motivo de la cancelación.');
  END IF;

  SELECT * INTO v_venta FROM ventas WHERE id = p_venta FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta no existe.');
  END IF;
  IF v_venta.estado = 'cancelada' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La venta ya estaba cancelada.');
  END IF;

  v_antes := foto_venta(p_venta);

  -- Todo regresa al stock de la sucursal de la venta.
  FOR r IN SELECT producto_id, sum(cantidad)::int AS cantidad
             FROM venta_detalles WHERE venta_id = p_venta GROUP BY 1
  LOOP
    PERFORM _stock_por_edicion(r.producto_id, v_venta.sucursal_id, r.cantidad, v_venta.folio,
                               'CANCELADA: ' || btrim(p_motivo));
  END LOOP;

  -- Las partidas se quedan (para poder ver qué se había vendido), pero la
  -- venta pasa a $0: así ningún total ni corte la vuelve a contar.
  UPDATE ventas
     SET estado = 'cancelada', total = 0, pago_efectivo = 0, pago_tarjeta = 0, pago_transferencia = 0,
         modificada_at = now(), ediciones = ediciones + 1
   WHERE id = p_venta;

  SELECT nombre_completo INTO v_nombre FROM usuarios_perfiles WHERE id = auth.uid();
  INSERT INTO ventas_ediciones (venta_id, folio, tipo, motivo, antes, despues, usuario_id, usuario_nombre)
  VALUES (p_venta, v_venta.folio, 'cancelacion', btrim(p_motivo), v_antes, foto_venta(p_venta), auth.uid(), v_nombre);

  RETURN jsonb_build_object('ok', true, 'folio', v_venta.folio, 'devuelto', v_venta.total);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION cancelar_venta(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cancelar_venta(uuid, text) TO authenticated;

-- ─── 10. Errores de la app ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errores_app (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid DEFAULT auth.uid(),
  pantalla   text,
  mensaje    text,
  pila       text,
  plataforma text,
  version    text,
  agente     text
);
ALTER TABLE errores_app ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "errores_app insertar" ON errores_app;
DROP POLICY IF EXISTS "errores_app leer admin" ON errores_app;
CREATE POLICY "errores_app insertar" ON errores_app
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "errores_app leer admin" ON errores_app
  FOR SELECT USING (public.es_admin());

-- ─── 11. Realtime ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND tablename = 'ventas_ediciones') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ventas_ediciones;
  END IF;
END $$;

COMMIT;

-- Comprobación rápida:
-- SELECT min(folio), max(folio), count(*), count(DISTINCT folio) FROM ventas;
-- SELECT last_value FROM ventas_folio_seq;
