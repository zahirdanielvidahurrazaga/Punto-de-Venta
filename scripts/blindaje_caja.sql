-- ============================================================================
-- BLINDAJE DE LA CAJA (3 huecos del flujo del turno). Sesión 2026-10-06.
-- Idempotente. Requiere flujo_turno.sql (hoy_tienda, tipo_salida).
--
-- Los encontró la revisión de ChatGPT/Codex del commit 94a48db y se
-- comprobaron contra la base real:
--   1. El corte y la salida eran dos escrituras separadas desde la app: si la
--      segunda fallaba, la checada seguía "trabajando" hoy y se podía abrir
--      OTRA caja el mismo día (lo del 10-sep). Ahora la base cierra la checada
--      en la misma transacción del corte.
--   2. registrar_venta tomaba cualquier caja abierta sin mirar la fecha: una
--      app vieja podía vender hoy en la caja de ayer. Ahora la rechaza.
--   3. Dos aperturas simultáneas (misma cuenta en dos aparatos — el negocio usa
--      una cuenta "EMPLEADO" compartida) podían pasar ambas el EXISTS del
--      trigger. Ahora un índice único lo impide.
-- ============================================================================

BEGIN;

-- ─── 3. Una sola caja abierta por cuenta ────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesiones_caja_una_abierta
  ON sesiones_caja (usuario_id) WHERE estado = 'abierta';

-- ─── 1. El corte cierra la checada en la misma transacción ──────────────────
CREATE OR REPLACE FUNCTION cerrar_checada_con_corte()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE registro_asistencia
  SET estado = 'completado',
      fecha_salida = COALESCE(NEW.fecha_cierre, now()),
      tipo_salida = 'corte'
  WHERE usuario_id = NEW.usuario_id AND estado = 'trabajando';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_cerrar_checada_con_corte ON sesiones_caja;
CREATE TRIGGER trg_cerrar_checada_con_corte AFTER UPDATE OF estado ON sesiones_caja
  FOR EACH ROW
  WHEN (OLD.estado = 'abierta' AND NEW.estado = 'cerrada')
  EXECUTE FUNCTION cerrar_checada_con_corte();

-- ─── 2. registrar_venta: no vender en una caja de otro día ──────────────────
-- Igual a la versión viva (fix_registrar_venta_mayoreo.sql) + el candado de fecha.
CREATE OR REPLACE FUNCTION public.registrar_venta(pago_efectivo numeric, pago_tarjeta numeric, pago_transferencia numeric, productos_json jsonb)
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

    -- La venta se crea en 0 y se actualiza al final con el total ya calculado,
    -- para recorrer las partidas una sola vez.
    INSERT INTO ventas (total, pago_efectivo, pago_tarjeta, pago_transferencia,
                        user_id, sesion_caja_id, sucursal_id)
    VALUES (0, pago_efectivo, pago_tarjeta, pago_transferencia,
            auth.uid(), v_sesion_caja_id, v_sucursal)
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
        v_precio_real := CASE
            WHEN v_producto.precio_mayoreo   IS NOT NULL
             AND v_producto.precio_mayoreo   > 0
             AND v_producto.cantidad_mayoreo IS NOT NULL
             AND v_producto.cantidad_mayoreo > 0
             AND v_cantidad >= v_producto.cantidad_mayoreo
            THEN v_producto.precio_mayoreo
            ELSE v_producto.precio
        END;

        v_total := v_total + (v_precio_real * v_cantidad);

        -- El trigger descontar_stock descuenta del stock de la sucursal.
        INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario)
        VALUES (v_venta_id, v_producto.id, v_cantidad, v_precio_real);
    END LOOP;

    UPDATE ventas SET total = v_total WHERE id = v_venta_id;

    RETURN jsonb_build_object('ok', true, 'venta_id', v_venta_id, 'total', v_total);
EXCEPTION WHEN OTHERS THEN
    -- El bloque EXCEPTION deshace la venta y sus detalles: no quedan a medias.
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;

COMMIT;
