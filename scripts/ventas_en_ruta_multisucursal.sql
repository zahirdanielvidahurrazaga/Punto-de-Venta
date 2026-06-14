-- =====================================================================
-- MÓDULO VENTAS EN RUTA — adaptación a MULTI-SUCURSAL
-- ---------------------------------------------------------------------
-- El módulo original operaba sobre la columna legacy `productos.stock`,
-- que dejó de reflejar el inventario una vez que el stock se movió a
-- `producto_stock (producto_id, sucursal_id, stock)`. Por eso, al armar
-- una ruta, ya no aparecían productos (la columna legacy quedó en 0).
--
-- Esta migración hace que las rutas trabajen contra el stock REAL de una
-- sucursal elegida: descuenta/regresa en `producto_stock`, registra los
-- movimientos con `sucursal_id` y mantiene sincronizada la columna legacy.
--
-- Idempotente. Pegar y ejecutar en el SQL Editor de Supabase.
-- =====================================================================

-- 1. La ruta recuerda de qué sucursal salió (para el regreso de sobrantes)
ALTER TABLE rutas ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);

-- Rutas existentes: asignar a la sucursal principal (como operaba antes)
UPDATE rutas
SET sucursal_id = (SELECT id FROM sucursales WHERE es_principal LIMIT 1)
WHERE sucursal_id IS NULL;

-- 2. RPC: Iniciar Ruta (Paso 1 — Carga) ahora por sucursal
-- Se elimina la versión anterior (2 argumentos) para no dejar una sobrecarga
-- que siga descontando de la columna legacy.
DROP FUNCTION IF EXISTS iniciar_ruta(varchar, jsonb);

CREATE OR REPLACE FUNCTION iniciar_ruta(
    p_nombre     VARCHAR,
    p_productos  JSONB,   -- [{id: uuid, cantidad: int}]
    p_sucursal   UUID
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_ruta_id   UUID;
    v_item      JSONB;
    v_prod      RECORD;
    v_qty       INTEGER;
    v_stock_act INTEGER;
    v_nombre    VARCHAR;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado.');
    END IF;

    IF p_sucursal IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Falta la sucursal de origen.');
    END IF;

    IF jsonb_array_length(p_productos) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes seleccionar al menos un producto.');
    END IF;

    -- Verificar stock suficiente (de la sucursal) para todos antes de proceder
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos)
    LOOP
        v_qty := (v_item->>'cantidad')::INTEGER;
        SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'id')::UUID;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado: ' || (v_item->>'id'));
        END IF;

        SELECT COALESCE(stock, 0) INTO v_stock_act
        FROM producto_stock
        WHERE producto_id = v_prod.id AND sucursal_id = p_sucursal;
        v_stock_act := COALESCE(v_stock_act, 0);

        IF v_stock_act < v_qty THEN
            RETURN jsonb_build_object('ok', false, 'error',
                'Stock insuficiente para "' || v_prod.nombre ||
                '" (disponible: ' || v_stock_act || ', requerido: ' || v_qty || ').');
        END IF;
    END LOOP;

    -- Crear la ruta
    INSERT INTO rutas (usuario_id, nombre, fecha_salida, estado, sucursal_id)
    VALUES (auth.uid(), NULLIF(TRIM(COALESCE(p_nombre,'')), ''), CURRENT_TIMESTAMP, 'en_ruta', p_sucursal)
    RETURNING id INTO v_ruta_id;

    -- Descontar stock de la sucursal y registrar cada item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos)
    LOOP
        v_qty := (v_item->>'cantidad')::INTEGER;
        SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'id')::UUID;

        SELECT COALESCE(stock, 0) INTO v_stock_act
        FROM producto_stock
        WHERE producto_id = v_prod.id AND sucursal_id = p_sucursal;
        v_stock_act := COALESCE(v_stock_act, 0);

        UPDATE producto_stock SET stock = stock - v_qty, updated_at = now()
        WHERE producto_id = v_prod.id AND sucursal_id = p_sucursal;

        PERFORM sincronizar_stock_legacy(v_prod.id);

        INSERT INTO movimientos_inventario
            (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
        VALUES
            (v_prod.id, v_prod.nombre, 'salida_ruta', -v_qty,
             v_stock_act, v_stock_act - v_qty,
             'Salida a ruta: ' || COALESCE(NULLIF(TRIM(COALESCE(p_nombre,'')), ''), v_ruta_id::TEXT),
             auth.uid(), p_sucursal);

        INSERT INTO ruta_carga (ruta_id, producto_id, nombre_producto, sku, cantidad_cargada, precio_lista)
        VALUES (v_ruta_id, v_prod.id, v_prod.nombre, v_prod.sku, v_qty, v_prod.precio);
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'ruta_id', v_ruta_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION iniciar_ruta(varchar, jsonb, uuid) TO authenticated;

-- 3. RPC: Registrar Regreso (Paso 2 — Descarga) regresa a la MISMA sucursal
CREATE OR REPLACE FUNCTION registrar_regreso_ruta(
    p_ruta_id   UUID,
    p_sobrantes JSONB  -- [{carga_id: uuid, cantidad_sobrante: int}]
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_item      JSONB;
    v_carga     RECORD;
    v_sobrante  INTEGER;
    v_vendida   INTEGER;
    v_stock_act INTEGER;
    v_sucursal  UUID;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado.');
    END IF;

    SELECT sucursal_id INTO v_sucursal FROM rutas
    WHERE id = p_ruta_id AND estado = 'en_ruta';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ruta no encontrada o ya procesada.');
    END IF;

    -- Compatibilidad: rutas viejas sin sucursal → principal
    IF v_sucursal IS NULL THEN
        SELECT id INTO v_sucursal FROM sucursales WHERE es_principal LIMIT 1;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sobrantes)
    LOOP
        SELECT * INTO v_carga FROM ruta_carga
        WHERE id = (v_item->>'carga_id')::UUID AND ruta_id = p_ruta_id;

        IF NOT FOUND THEN CONTINUE; END IF;

        v_sobrante := GREATEST(0, LEAST((v_item->>'cantidad_sobrante')::INTEGER, v_carga.cantidad_cargada));
        v_vendida  := v_carga.cantidad_cargada - v_sobrante;

        UPDATE ruta_carga
        SET cantidad_sobrante = v_sobrante, cantidad_vendida = v_vendida
        WHERE id = v_carga.id;

        IF v_sobrante > 0 THEN
            SELECT COALESCE(stock, 0) INTO v_stock_act
            FROM producto_stock
            WHERE producto_id = v_carga.producto_id AND sucursal_id = v_sucursal;
            v_stock_act := COALESCE(v_stock_act, 0);

            -- Si por algún motivo no existía la fila de stock, crearla
            INSERT INTO producto_stock (producto_id, sucursal_id, stock)
            VALUES (v_carga.producto_id, v_sucursal, v_sobrante)
            ON CONFLICT (producto_id, sucursal_id)
            DO UPDATE SET stock = producto_stock.stock + v_sobrante, updated_at = now();

            PERFORM sincronizar_stock_legacy(v_carga.producto_id);

            INSERT INTO movimientos_inventario
                (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
            VALUES
                (v_carga.producto_id, v_carga.nombre_producto, 'entrada_ruta', v_sobrante,
                 v_stock_act, v_stock_act + v_sobrante,
                 'Regreso de ruta: ' || COALESCE((SELECT nombre FROM rutas WHERE id = p_ruta_id), p_ruta_id::TEXT),
                 auth.uid(), v_sucursal);
        END IF;
    END LOOP;

    UPDATE rutas SET estado = 'regresado', fecha_regreso = CURRENT_TIMESTAMP WHERE id = p_ruta_id;

    RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION registrar_regreso_ruta(uuid, jsonb) TO authenticated;
