-- ════════════════════════════════════════════════════════════════════════════
-- PROMOCIONES — Buen Fin 2026 (sábado 14 y domingo 15 de noviembre)
--
-- Pedido de Carlos (13-nov-2026): 15% de descuento en TODO, menos las 4 bolsas
-- negras de basura que dio de alta ese día. Arranca sola el sábado 00:00 y
-- termina sola el domingo 23:59 (hora de la tienda). Sale en el ticket.
--
-- REGLA (decidida con Carlos): NO SE ACUMULA CON EL MAYOREO. Si la partida
-- llega a la cantidad de mayoreo se cobra el mayoreo tal cual (aunque el
-- menudeo con 15% saliera más barato); si no, menudeo con 15%. Redondeo por
-- pieza a centavos: round(precio * (100 - pct) / 100, 2). Es la MISMA regla
-- que src/lib/precios.js (con pruebas en src/__tests__/promocion.test.js).
--
-- QUIÉN DECIDE: la base. `registrar_venta` solo descuenta si la app le manda
-- `p_promocion_id` y esa promoción sigue vigente. Una app vieja (sin recargar,
-- iOS sin actualizar) no lo manda: cobra precio normal en pantalla Y en la
-- base, así lo cobrado, lo guardado y el corte de caja siempre coinciden.
-- Si la app manda una promoción que ya terminó, la venta se rechaza con un
-- mensaje claro (no se guarda nada).
--
-- Cada partida guarda: promocion_id, descuento_pct (0 = la promoción estaba
-- pero no entró: excluido o mayoreo) y precio_antes_descuento. La venta guarda
-- promocion_id. `editar_venta` respeta la promoción con la que se cobró.
--
-- Revertir:
--   UPDATE promociones SET activa = false;   -- apaga sin borrar nada
--   (las funciones nuevas siguen funcionando igual sin promociones activas)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── 1. Tablas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promociones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  porcentaje  numeric(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje < 100),
  inicio      timestamptz NOT NULL,
  fin         timestamptz NOT NULL,
  activa      boolean NOT NULL DEFAULT true,
  creado_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (fin > inicio)
);

CREATE TABLE IF NOT EXISTS promocion_exclusiones (
  promocion_id uuid NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
  producto_id  uuid NOT NULL REFERENCES productos(id)   ON DELETE CASCADE,
  PRIMARY KEY (promocion_id, producto_id)
);

ALTER TABLE promociones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE promocion_exclusiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promociones: leer"                 ON promociones;
DROP POLICY IF EXISTS "promociones: solo admin"           ON promociones;
DROP POLICY IF EXISTS "promocion_exclusiones: leer"       ON promocion_exclusiones;
DROP POLICY IF EXISTS "promocion_exclusiones: solo admin" ON promocion_exclusiones;
CREATE POLICY "promociones: leer"       ON promociones FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promociones: solo admin" ON promociones FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "promocion_exclusiones: leer"       ON promocion_exclusiones FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "promocion_exclusiones: solo admin" ON promocion_exclusiones FOR ALL USING (public.es_admin()) WITH CHECK (public.es_admin());

ALTER TABLE ventas         ADD COLUMN IF NOT EXISTS promocion_id uuid REFERENCES promociones(id) ON DELETE SET NULL;
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS promocion_id uuid REFERENCES promociones(id) ON DELETE SET NULL;
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS descuento_pct numeric(5,2);
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS precio_antes_descuento numeric(10,2);

-- ─── 2. registrar_venta con promoción ───────────────────────────────────────
-- Igual a la versión viva (blindaje_caja.sql, 6-oct) + el parámetro nuevo con
-- DEFAULT NULL: las apps viejas que llaman con 4 argumentos siguen entrando.
-- Se borra la de 4 argumentos para que PostgREST no tenga dos candidatas.
DROP FUNCTION IF EXISTS public.registrar_venta(numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.registrar_venta(
  pago_efectivo numeric, pago_tarjeta numeric, pago_transferencia numeric,
  productos_json jsonb, p_promocion_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_total          DECIMAL := 0;
    v_venta_id       UUID;
    v_sesion_caja_id UUID;
    v_apertura       TIMESTAMPTZ;
    v_sucursal       UUID;
    v_item           JSONB;
    v_producto       RECORD;
    v_cantidad       INTEGER;
    v_precio_real    DECIMAL;
    v_promo          RECORD;
    v_pct            NUMERIC;
    v_antes          NUMERIC;
    v_mayoreo        BOOLEAN;
BEGIN
    -- Sucursal del vendedor
    SELECT sucursal_id INTO v_sucursal FROM usuarios_perfiles WHERE id = auth.uid();
    IF v_sucursal IS NULL THEN
        SELECT id INTO v_sucursal FROM sucursales WHERE es_principal LIMIT 1;
    END IF;

    -- Caja abierta del usuario (el admin puede vender sin caja)
    SELECT id, fecha_apertura INTO v_sesion_caja_id, v_apertura
    FROM sesiones_caja
    WHERE usuario_id = auth.uid() AND estado = 'abierta'
    LIMIT 1;

    IF v_sesion_caja_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM usuarios_perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'No tienes una caja abierta.');
        END IF;
    END IF;

    -- Una caja de otro día ya no recibe ventas: hay que hacerle su corte.
    -- La app nueva ya lo bloquea; esto cubre a las apps sin actualizar.
    IF v_sesion_caja_id IS NOT NULL
       AND (v_apertura AT TIME ZONE 'America/Mexico_City')::date < hoy_tienda() THEN
        RETURN jsonb_build_object('ok', false, 'error',
            'Tu caja es de otro día. Haz su corte antes de vender.');
    END IF;

    -- Promoción: solo si la app dice cuál vio Y sigue vigente ahora.
    IF p_promocion_id IS NOT NULL THEN
        SELECT * INTO v_promo FROM promociones
         WHERE id = p_promocion_id AND activa AND inicio <= now() AND now() < fin;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error',
                'La promoción ya terminó o todavía no empieza. Recarga la página (Ctrl+Shift+R) y vuelve a cobrar.');
        END IF;
    END IF;

    -- La venta se crea en 0 y se actualiza al final con el total ya calculado,
    -- para recorrer las partidas una sola vez.
    INSERT INTO ventas (total, pago_efectivo, pago_tarjeta, pago_transferencia,
                        user_id, sesion_caja_id, sucursal_id, promocion_id)
    VALUES (0, pago_efectivo, pago_tarjeta, pago_transferencia,
            auth.uid(), v_sesion_caja_id, v_sucursal, p_promocion_id)
    RETURNING id INTO v_venta_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(productos_json)
    LOOP
        SELECT * INTO v_producto FROM productos WHERE id = (v_item->>'id')::uuid;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado: %', (v_item->>'id');
        END IF;

        v_cantidad := (v_item->>'cantidad')::int;
        IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
            RAISE EXCEPTION 'Cantidad inválida en %', v_producto.nombre;
        END IF;

        -- Misma regla que la Terminal: a partir de cantidad_mayoreo, mayoreo.
        v_mayoreo := v_producto.precio_mayoreo   IS NOT NULL
                 AND v_producto.precio_mayoreo   > 0
                 AND v_producto.cantidad_mayoreo IS NOT NULL
                 AND v_producto.cantidad_mayoreo > 0
                 AND v_cantidad >= v_producto.cantidad_mayoreo;
        v_precio_real := CASE WHEN v_mayoreo THEN v_producto.precio_mayoreo ELSE v_producto.precio END;

        -- Promoción sobre el menudeo; no se acumula con el mayoreo.
        v_pct := NULL; v_antes := NULL;
        IF p_promocion_id IS NOT NULL THEN
            IF NOT v_mayoreo AND NOT EXISTS (
                SELECT 1 FROM promocion_exclusiones
                 WHERE promocion_id = p_promocion_id AND producto_id = v_producto.id) THEN
                v_pct   := v_promo.porcentaje;
                v_antes := v_precio_real;
                v_precio_real := round(v_precio_real * (100 - v_pct) / 100, 2);
            ELSE
                v_pct := 0;   -- la promoción estaba, pero esta partida no entra
            END IF;
        END IF;

        v_total := v_total + (v_precio_real * v_cantidad);

        -- El trigger descontar_stock descuenta del stock de la sucursal.
        INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario,
                                    promocion_id, descuento_pct, precio_antes_descuento)
        VALUES (v_venta_id, v_producto.id, v_cantidad, v_precio_real,
                p_promocion_id, v_pct, v_antes);
    END LOOP;

    UPDATE ventas SET total = v_total WHERE id = v_venta_id;

    RETURN jsonb_build_object('ok', true, 'venta_id', v_venta_id, 'total', v_total);
EXCEPTION WHEN OTHERS THEN
    -- El bloque EXCEPTION deshace la venta y sus detalles: no quedan a medias.
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_venta(numeric, numeric, numeric, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta(numeric, numeric, numeric, jsonb, uuid) TO authenticated;

-- ─── 3. editar_venta respeta la promoción con la que se cobró ──────────────
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
  DROP TABLE IF EXISTS _nuevas, _final, _calc;
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
  -- se cobró; si no, la regla de registrar_venta con el catálogo: mayoreo, o
  -- menudeo con la promoción CON LA QUE SE COBRÓ la venta (Buen Fin), que no
  -- se acumula con el mayoreo ni aplica a los productos excluidos.
  DROP TABLE IF EXISTS _calc;
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT n.producto_id, n.cantidad,
         viejo.cantidad AS cant_vieja, viejo.precio_unitario AS pu_viejo,
         viejo.precio_lista, viejo.descuento_pct AS pct_viejo, viejo.precio_antes AS antes_viejo,
         -- COALESCE: un producto sin mayoreo (NULL) daba NULL y no "falso", y
         -- el `NOT mayoreo` de abajo guardaba 0% en una partida con descuento.
         COALESCE(p.precio_mayoreo > 0 AND p.cantidad_mayoreo > 0 AND n.cantidad >= p.cantidad_mayoreo, false) AS mayoreo,
         p.precio, p.precio_mayoreo,
         (pr.id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM promocion_exclusiones e
             WHERE e.promocion_id = pr.id AND e.producto_id = n.producto_id)) AS entra,
         pr.porcentaje
    FROM _nuevas n
    JOIN productos p ON p.id = n.producto_id
    LEFT JOIN promociones pr ON pr.id = v_venta.promocion_id
    LEFT JOIN LATERAL (
      SELECT sum(d.cantidad)::int AS cantidad, max(d.precio_unitario) AS precio_unitario,
             max(d.precio_lista) AS precio_lista, max(d.descuento_pct) AS descuento_pct,
             max(d.precio_antes_descuento) AS precio_antes
        FROM venta_detalles d
       WHERE d.venta_id = p_venta AND d.producto_id = n.producto_id
    ) viejo ON true;

  CREATE TEMP TABLE _final ON COMMIT DROP AS
  SELECT producto_id, cantidad,
         -- El precio normal de un producto que ya estaba en la venta es el de
         -- AQUEL día; uno nuevo toma el de hoy (lo pone el trigger).
         precio_lista,
         CASE
           WHEN cant_vieja = cantidad THEN pu_viejo
           WHEN mayoreo THEN precio_mayoreo
           WHEN entra THEN round(precio * (100 - porcentaje) / 100, 2)
           ELSE precio
         END AS precio_unitario,
         v_venta.promocion_id AS promocion_id,
         CASE
           WHEN cant_vieja = cantidad THEN pct_viejo
           WHEN v_venta.promocion_id IS NULL THEN NULL
           WHEN entra AND NOT mayoreo THEN porcentaje
           ELSE 0
         END AS descuento_pct,
         CASE
           WHEN cant_vieja = cantidad THEN antes_viejo
           WHEN entra AND NOT mayoreo THEN precio
           ELSE NULL
         END AS precio_antes_descuento
    FROM _calc;

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
  INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario, precio_lista,
                              promocion_id, descuento_pct, precio_antes_descuento)
  SELECT p_venta, producto_id, cantidad, precio_unitario, precio_lista,
         promocion_id, descuento_pct, precio_antes_descuento FROM _final;
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

-- ─── 4. La promoción del Buen Fin ───────────────────────────────────────────
-- Sábado 14-nov 00:00 → lunes 16-nov 00:00 (hora de la tienda) = hasta el
-- domingo 23:59:59. Excluidas: TIT-0450, TIT-0451, TIT-0458, TIT-0459.
WITH bf AS (
  INSERT INTO promociones (nombre, porcentaje, inicio, fin)
  VALUES ('Buen Fin', 15,
          timestamp '2026-11-14 00:00' AT TIME ZONE 'America/Mexico_City',
          timestamp '2026-11-16 00:00' AT TIME ZONE 'America/Mexico_City')
  RETURNING id
)
INSERT INTO promocion_exclusiones (promocion_id, producto_id)
SELECT bf.id, p.id FROM bf, productos p
 WHERE p.sku IN ('TIT-0450', 'TIT-0451', 'TIT-0458', 'TIT-0459');

DO $$
BEGIN
  IF (SELECT count(*) FROM promocion_exclusiones e JOIN promociones p ON p.id = e.promocion_id
       WHERE p.nombre = 'Buen Fin') <> 4 THEN
    RAISE EXCEPTION 'No se encontraron las 4 bolsas a excluir';
  END IF;
END $$;

COMMIT;
