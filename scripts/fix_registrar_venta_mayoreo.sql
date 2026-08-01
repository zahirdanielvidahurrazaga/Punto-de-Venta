-- ============================================================================
-- FIX CRÍTICO: registrar_venta ignoraba el precio de MAYOREO
-- Pegar y ejecutar en el SQL Editor de Supabase.
-- ============================================================================
--
-- EL PROBLEMA
-- El front manda solo { id, cantidad } y la función recalcula el total con los
-- precios de la BD (bien: así el cliente no puede manipular el importe). Pero
-- lo hacía SIEMPRE con `productos.precio`, sin mirar nunca `precio_mayoreo` /
-- `cantidad_mayoreo`. La Terminal sí aplica el mayoreo, así que:
--
--   * el cajero cobra y el ticket impreso dicen el precio de MAYOREO,
--   * la venta guardada en la BD queda con el precio de MENUDEO.
--
-- Resultado: `ventas.total` queda inflado y no cuadra con `pago_efectivo +
-- pago_tarjeta + pago_transferencia` (que sí vienen del front), y
-- `venta_detalles.precio_unitario` guarda un precio que nadie pagó. El
-- Dashboard suma ingresos de más y el corte de caja no cuadra contra el cajón.
--
-- Ejemplo real de las pruebas del 16-jun (TIT-0202: $50 menudeo, $40 mayoreo
-- desde 3 piezas): venta de 4 piezas → total guardado $200, cobrado $160.
--
-- Hoy 213 de los 215 productos del catálogo tienen mayoreo desde 3 piezas, así
-- que casi cualquier venta de 3+ del mismo artículo caía en esto.
--
-- EL ARREGLO
-- Aplicar la misma regla que la Terminal (`Terminal.getItemPrice`):
--   cantidad >= cantidad_mayoreo  →  precio_mayoreo
-- Además se calcula el precio UNA sola vez por partida y se usa tanto para el
-- total como para el detalle, para que no puedan volver a divergir.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_venta(
    pago_efectivo DECIMAL,
    pago_tarjeta DECIMAL,
    pago_transferencia DECIMAL,
    productos_json JSONB
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_total          DECIMAL := 0;
    v_venta_id       UUID;
    v_sesion_caja_id UUID;
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
    SELECT id INTO v_sesion_caja_id
    FROM sesiones_caja
    WHERE usuario_id = auth.uid() AND estado = 'abierta'
    LIMIT 1;

    IF v_sesion_caja_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM usuarios_perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'No tienes una caja abierta.');
        END IF;
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
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION registrar_venta(DECIMAL, DECIMAL, DECIMAL, JSONB) TO authenticated;

-- ----------------------------------------------------------------------------
-- Comprobación (no cobra nada: simula el cálculo sobre el catálogo real).
-- Debe verse el precio de mayoreo en la columna de 3 piezas y el de menudeo
-- en la de 2.
-- ----------------------------------------------------------------------------
SELECT sku, nombre, precio, precio_mayoreo, cantidad_mayoreo,
       precio * 2 AS cobro_2_piezas,
       CASE WHEN 3 >= cantidad_mayoreo THEN precio_mayoreo ELSE precio END * 3
         AS cobro_3_piezas
  FROM productos
 WHERE precio_mayoreo > 0
 ORDER BY sku
 LIMIT 5;
