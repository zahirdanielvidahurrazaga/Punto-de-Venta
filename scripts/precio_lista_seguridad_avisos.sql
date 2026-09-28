-- ============================================================================
-- PRECIO NORMAL EN EL TICKET + CANDADO A VENTAS + RESUMEN DIARIO + REVISIÓN
-- NOCTURNA. Sesión 2026-09-27. Idempotente. Requiere folio_y_edicion_ventas.sql
-- y resumen_ventas.sql.
-- ============================================================================

BEGIN;

-- ─── 1. Precio normal guardado en cada partida ──────────────────────────────
-- Para que el ticket REIMPRESO diga cuánto ahorró el cliente por mayoreo.
-- Hasta hoy solo se guardaba el precio cobrado; el normal de ese día se
-- perdía y la reimpresión no podía decir "Normal $6.00 · ahorra $18.00" sin
-- arriesgarse a usar un precio que el dueño cambió después.
-- Lo llena la BASE al insertar (trigger), así funciona también con las apps
-- viejas que no se han actualizado. Las ventas anteriores quedan en NULL.
ALTER TABLE venta_detalles ADD COLUMN IF NOT EXISTS precio_lista numeric(10,2);

CREATE OR REPLACE FUNCTION fijar_precio_lista()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.precio_lista IS NULL THEN
    SELECT precio INTO NEW.precio_lista FROM productos WHERE id = NEW.producto_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_fijar_precio_lista ON venta_detalles;
CREATE TRIGGER trg_fijar_precio_lista BEFORE INSERT ON venta_detalles
  FOR EACH ROW EXECUTE FUNCTION fijar_precio_lista();

-- (editar_venta, versión que conserva el precio normal de las partidas)
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
         -- El precio normal de un producto que ya estaba en la venta es el de
         -- AQUEL día; uno nuevo toma el de hoy (lo pone el trigger).
         viejo.precio_lista,
         CASE
           WHEN viejo.cantidad = n.cantidad THEN viejo.precio_unitario
           WHEN p.precio_mayoreo > 0 AND p.cantidad_mayoreo > 0 AND n.cantidad >= p.cantidad_mayoreo
             THEN p.precio_mayoreo
           ELSE p.precio
         END AS precio_unitario
    FROM _nuevas n
    JOIN productos p ON p.id = n.producto_id
    LEFT JOIN LATERAL (
      SELECT sum(d.cantidad)::int AS cantidad, max(d.precio_unitario) AS precio_unitario,
             max(d.precio_lista) AS precio_lista
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
  INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario, precio_lista)
  SELECT p_venta, producto_id, cantidad, precio_unitario, precio_lista FROM _final;
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


-- ─── 2. Candado a ventas y partidas ─────────────────────────────────────────
-- La política vieja era `FOR ALL USING (authenticated)`: cualquier cuenta de
-- empleado podía modificar o borrar ventas directo por la API. El cobro y las
-- correcciones pasan por funciones SECURITY DEFINER (registrar_venta,
-- editar_venta, cancelar_venta), que no dependen de estas políticas, así que
-- se cierra sin romper nada: todos leen, solo el admin escribe directo.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('ventas', 'venta_detalles')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE ventas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_detalles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ventas: leer"             ON ventas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "ventas: solo admin"       ON ventas FOR ALL    USING (public.es_admin()) WITH CHECK (public.es_admin());
CREATE POLICY "venta_detalles: leer"       ON venta_detalles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "venta_detalles: solo admin" ON venta_detalles FOR ALL    USING (public.es_admin()) WITH CHECK (public.es_admin());

-- ─── 3. Resumen del día al celular del dueño ────────────────────────────────
-- Usa resumen_ventas (la misma cuenta que el Dashboard) y la tabla
-- notificaciones, que ya dispara el push a los admins.
CREATE OR REPLACE FUNCTION notif_resumen_dia()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tz      constant text := 'America/Mexico_City';
  v_hoy   timestamptz := (date_trunc('day', now() AT TIME ZONE tz)) AT TIME ZONE tz;
  dias    constant text[] := ARRAY['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  r jsonb; p jsonb;
  v_total numeric; v_prev numeric; v_tickets int;
  v_var text := ''; v_top text := ''; v_sucs text := '';
  v_titulo text; v_cuerpo text;
BEGIN
  r := resumen_ventas(v_hoy, NULL, NULL, 'dia');
  -- Contra el MISMO día de la semana pasada (el sábado se parece al sábado).
  p := resumen_ventas(v_hoy - interval '7 days', v_hoy - interval '6 days', NULL, 'dia');

  v_total   := (r->>'total')::numeric;
  v_tickets := (r->>'tickets')::int;
  v_prev    := (p->>'total')::numeric;

  IF v_prev > 0 THEN
    v_var := format(' · %s%s%% vs el %s pasado',
                    CASE WHEN v_total >= v_prev THEN '+' ELSE '' END,
                    to_char(round((v_total - v_prev) / v_prev * 100, 1), 'FM999990.0'),
                    dias[extract(dow FROM now() AT TIME ZONE tz)::int + 1]);
  END IF;

  SELECT format(' Lo más vendido: %s (%s pz).', pr.nombre, (x->>'unidades')::numeric::int)
    INTO v_top
    FROM jsonb_array_elements(r->'por_producto') x
    JOIN productos pr ON pr.id = (x->>'producto_id')::uuid
   ORDER BY (x->>'unidades')::numeric DESC LIMIT 1;

  -- Desglose por sucursal solo si vendió más de una.
  IF jsonb_array_length(r->'por_sucursal') > 1 THEN
    SELECT ' ' || string_agg(format('%s $%s', s.nombre, to_char((x->>'total')::numeric, 'FM999,999,990')), ' · ' ORDER BY s.nombre) || '.'
      INTO v_sucs
      FROM jsonb_array_elements(r->'por_sucursal') x
      JOIN sucursales s ON s.id = (x->>'sucursal_id')::uuid;
  END IF;

  IF v_tickets = 0 THEN
    v_titulo := 'Resumen de hoy: sin ventas';
    v_cuerpo := 'Hoy no se registró ninguna venta en la Terminal.';
  ELSE
    v_titulo := format('Resumen de hoy: $%s', to_char(v_total, 'FM999,999,990.00'));
    v_cuerpo := format('%s ticket%s · promedio $%s%s.%s%s',
                       v_tickets, CASE WHEN v_tickets = 1 THEN '' ELSE 's' END,
                       to_char(v_total / v_tickets, 'FM999,990.00'), v_var,
                       COALESCE(v_top, ''), COALESCE(v_sucs, ''));
  END IF;

  INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
  VALUES ('resumen_dia', v_titulo, v_cuerpo,
          jsonb_build_object('total', v_total, 'tickets', v_tickets, 'previo', v_prev));

  RETURN jsonb_build_object('titulo', v_titulo, 'cuerpo', v_cuerpo);
END;
$$;
REVOKE ALL ON FUNCTION notif_resumen_dia() FROM PUBLIC, anon, authenticated;

-- ─── 4. Revisión nocturna de los datos ──────────────────────────────────────
-- Lo mismo que `npm run cuadre`, pero sola, en la base, cada noche. Guarda
-- cada corrida en `salud_ventas` y SOLO avisa al admin si algo no cuadra.
CREATE TABLE IF NOT EXISTS salud_ventas (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  desde      timestamptz,
  ok         boolean NOT NULL,
  detalle    jsonb NOT NULL
);
ALTER TABLE salud_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "salud_ventas: admin lee" ON salud_ventas;
CREATE POLICY "salud_ventas: admin lee" ON salud_ventas FOR SELECT USING (public.es_admin());

CREATE OR REPLACE FUNCTION revisar_salud_ventas(p_desde timestamptz DEFAULT now() - interval '2 days', p_avisar boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb;
  r jsonb;
  v_ok boolean;
  v_lineas text[] := '{}';
BEGIN
  r := resumen_ventas(p_desde, NULL, NULL, 'dia');

  WITH v AS (SELECT * FROM ventas WHERE fecha >= p_desde AND estado <> 'cancelada'),
       part AS (SELECT v.id, v.folio, v.total, COALESCE(sum(d.cantidad * d.precio_unitario), 0) AS suma, count(d.*) AS n
                  FROM v LEFT JOIN venta_detalles d ON d.venta_id = v.id GROUP BY v.id, v.folio, v.total)
  SELECT jsonb_build_object(
    'ventas',            (SELECT count(*) FROM v),
    'pagos_no_cuadran',  (SELECT COALESCE(jsonb_agg(folio), '[]') FROM v
                           WHERE round(pago_efectivo + pago_tarjeta + pago_transferencia, 2) <> round(total, 2)),
    'partidas_no_cuadran', (SELECT COALESCE(jsonb_agg(folio), '[]') FROM part WHERE round(suma, 2) <> round(total, 2)),
    'sin_partidas',      (SELECT COALESCE(jsonb_agg(folio), '[]') FROM part WHERE n = 0),
    'sin_sucursal',      (SELECT count(*) FROM v WHERE sucursal_id IS NULL),
    'resumen_vs_crudo',  round((r->>'total')::numeric - (SELECT COALESCE(sum(total), 0) FROM v), 2),
    'turnos_abiertos_24h', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                               'quien', COALESCE(u.nombre_completo, s.usuario_nombre, '¿?'),
                               'desde', s.fecha_apertura)), '[]')
                             FROM sesiones_caja s LEFT JOIN usuarios_perfiles u ON u.id = s.usuario_id
                            WHERE s.estado = 'abierta' AND s.fecha_apertura < now() - interval '24 hours')
  ) INTO d
  FROM (SELECT 1) uno;

  IF jsonb_array_length(d->'pagos_no_cuadran') > 0 THEN
    v_lineas := v_lineas || format('%s venta(s) con pagos que no suman el total', jsonb_array_length(d->'pagos_no_cuadran')); END IF;
  IF jsonb_array_length(d->'partidas_no_cuadran') > 0 THEN
    v_lineas := v_lineas || format('%s venta(s) cuyas partidas no suman el total', jsonb_array_length(d->'partidas_no_cuadran')); END IF;
  IF jsonb_array_length(d->'sin_partidas') > 0 THEN
    v_lineas := v_lineas || format('%s venta(s) sin productos', jsonb_array_length(d->'sin_partidas')); END IF;
  IF (d->>'sin_sucursal')::int > 0 THEN
    v_lineas := v_lineas || format('%s venta(s) sin sucursal', d->>'sin_sucursal'); END IF;
  IF (d->>'resumen_vs_crudo')::numeric <> 0 THEN
    v_lineas := v_lineas || format('el resumen difiere $%s de las ventas', d->>'resumen_vs_crudo'); END IF;
  IF jsonb_array_length(d->'turnos_abiertos_24h') > 0 THEN
    v_lineas := v_lineas || format('%s caja(s) abiertas hace más de 24 h (su corte mezclará días)', jsonb_array_length(d->'turnos_abiertos_24h')); END IF;

  v_ok := cardinality(v_lineas) = 0;
  INSERT INTO salud_ventas (desde, ok, detalle) VALUES (p_desde, v_ok, d);

  IF NOT v_ok AND p_avisar THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
    VALUES ('alerta_datos', 'Revisión nocturna: algo no cuadra',
            array_to_string(v_lineas, ' · ') || '.', d);
  END IF;

  RETURN jsonb_build_object('ok', v_ok, 'problemas', to_jsonb(v_lineas), 'detalle', d);
END;
$$;
REVOKE ALL ON FUNCTION revisar_salud_ventas(timestamptz, boolean) FROM PUBLIC, anon, authenticated;

-- ─── 5. Programación (pg_cron corre en UTC; México = UTC−6 sin horario de verano)
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('resumen_dia', 'salud_ventas');
  -- 21:00 hora de México: la tienda ya cerró (los cortes caen ~19:00).
  PERFORM cron.schedule('resumen_dia',  '0 3 * * *',  'SELECT notif_resumen_dia()');
  -- 21:10: revisa las últimas 48 h.
  PERFORM cron.schedule('salud_ventas', '10 3 * * *', 'SELECT revisar_salud_ventas()');
END $$;

COMMIT;
