-- =====================================================================
-- MÓDULO: VENTAS EN RUTA
-- Ejecutar en el SQL Editor de Supabase antes de usar este módulo
-- =====================================================================

-- 1. Extender tipos de movimientos de inventario para rutas
ALTER TABLE movimientos_inventario
  DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_check
  CHECK (tipo IN ('entrada', 'salida_venta', 'ajuste', 'inicial', 'salida_ruta', 'entrada_ruta'));

-- 2. Tabla principal de rutas
CREATE TABLE IF NOT EXISTS rutas (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id        UUID NOT NULL REFERENCES usuarios_perfiles(id),
    nombre            VARCHAR(255),
    fecha_salida      TIMESTAMP WITH TIME ZONE,
    fecha_regreso     TIMESTAMP WITH TIME ZONE,
    fecha_liquidacion TIMESTAMP WITH TIME ZONE,
    estado            VARCHAR(20) NOT NULL DEFAULT 'en_ruta'
                      CHECK (estado IN ('en_ruta', 'regresado', 'liquidado')),
    total_lista       DECIMAL(10,2),
    dinero_real       DECIMAL(10,2),
    descuento_campo   DECIMAL(10,2),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de carga (productos subidos a la camioneta)
CREATE TABLE IF NOT EXISTS ruta_carga (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ruta_id           UUID NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
    producto_id       UUID NOT NULL REFERENCES productos(id),
    nombre_producto   VARCHAR(255) NOT NULL,
    sku               VARCHAR(100),
    cantidad_cargada  INTEGER NOT NULL CHECK (cantidad_cargada > 0),
    precio_lista      DECIMAL(10,2) NOT NULL,
    cantidad_sobrante INTEGER,
    cantidad_vendida  INTEGER,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. RLS
ALTER TABLE rutas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ruta_carga ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Rutas solo admin" ON rutas;
CREATE POLICY "Rutas solo admin"
    ON rutas FOR ALL
    USING (public.es_admin());

DROP POLICY IF EXISTS "Carga de rutas solo admin" ON ruta_carga;
CREATE POLICY "Carga de rutas solo admin"
    ON ruta_carga FOR ALL
    USING (public.es_admin());

-- 5. RPC: Iniciar Ruta (Paso 1 — Carga)
-- Descuenta inventario y crea la ruta con el manifiesto de carga
CREATE OR REPLACE FUNCTION iniciar_ruta(
    p_nombre     VARCHAR,
    p_productos  JSONB   -- [{id: uuid, cantidad: int}]
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_ruta_id UUID;
    v_item    JSONB;
    v_prod    RECORD;
    v_qty     INTEGER;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado.');
    END IF;

    IF jsonb_array_length(p_productos) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Debes seleccionar al menos un producto.');
    END IF;

    -- Verificar stock suficiente para todos los productos antes de proceder
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos)
    LOOP
        v_qty := (v_item->>'cantidad')::INTEGER;
        SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'id')::UUID;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado: ' || (v_item->>'id'));
        END IF;
        IF v_prod.stock < v_qty THEN
            RETURN jsonb_build_object('ok', false, 'error',
                'Stock insuficiente para "' || v_prod.nombre ||
                '" (disponible: ' || v_prod.stock || ', requerido: ' || v_qty || ').');
        END IF;
    END LOOP;

    -- Crear la ruta
    INSERT INTO rutas (usuario_id, nombre, fecha_salida, estado)
    VALUES (auth.uid(), NULLIF(TRIM(COALESCE(p_nombre,'')), ''), CURRENT_TIMESTAMP, 'en_ruta')
    RETURNING id INTO v_ruta_id;

    -- Descontar stock y registrar cada item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_productos)
    LOOP
        v_qty := (v_item->>'cantidad')::INTEGER;
        SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'id')::UUID;

        UPDATE productos SET stock = stock - v_qty WHERE id = v_prod.id;

        INSERT INTO movimientos_inventario
            (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id)
        VALUES
            (v_prod.id, v_prod.nombre, 'salida_ruta', -v_qty,
             v_prod.stock, v_prod.stock - v_qty,
             'Salida a ruta: ' || COALESCE(NULLIF(TRIM(COALESCE(p_nombre,'')), ''), v_ruta_id::TEXT),
             auth.uid());

        INSERT INTO ruta_carga (ruta_id, producto_id, nombre_producto, sku, cantidad_cargada, precio_lista)
        VALUES (v_ruta_id, v_prod.id, v_prod.nombre, v_prod.sku, v_qty, v_prod.precio);
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'ruta_id', v_ruta_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: Registrar Regreso (Paso 2 — Descarga)
-- Devuelve sobrantes al inventario y marca la ruta como 'regresado'
CREATE OR REPLACE FUNCTION registrar_regreso_ruta(
    p_ruta_id   UUID,
    p_sobrantes JSONB  -- [{carga_id: uuid, cantidad_sobrante: int}]
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_item     JSONB;
    v_carga    RECORD;
    v_sobrante INTEGER;
    v_vendida  INTEGER;
    v_stock_act INTEGER;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM rutas WHERE id = p_ruta_id AND estado = 'en_ruta') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Ruta no encontrada o ya procesada.');
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
            SELECT stock INTO v_stock_act FROM productos WHERE id = v_carga.producto_id;
            UPDATE productos SET stock = stock + v_sobrante WHERE id = v_carga.producto_id;

            INSERT INTO movimientos_inventario
                (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id)
            VALUES
                (v_carga.producto_id, v_carga.nombre_producto, 'entrada_ruta', v_sobrante,
                 v_stock_act, v_stock_act + v_sobrante,
                 'Regreso de ruta: ' || COALESCE((SELECT nombre FROM rutas WHERE id = p_ruta_id), p_ruta_id::TEXT),
                 auth.uid());
        END IF;
    END LOOP;

    UPDATE rutas SET estado = 'regresado', fecha_regreso = CURRENT_TIMESTAMP WHERE id = p_ruta_id;

    RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- 7. RPC: Liquidar Ruta (Paso 3 — Caja)
-- Calcula descuento de campo y cierra la ruta
CREATE OR REPLACE FUNCTION liquidar_ruta(
    p_ruta_id     UUID,
    p_dinero_real DECIMAL
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_total_lista DECIMAL;
    v_descuento   DECIMAL;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Acceso denegado.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM rutas WHERE id = p_ruta_id AND estado = 'regresado') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La ruta no está en estado de liquidación.');
    END IF;

    SELECT COALESCE(SUM(COALESCE(cantidad_vendida,0) * precio_lista), 0)
    INTO v_total_lista
    FROM ruta_carga
    WHERE ruta_id = p_ruta_id;

    v_descuento := v_total_lista - p_dinero_real;

    UPDATE rutas
    SET estado            = 'liquidado',
        fecha_liquidacion = CURRENT_TIMESTAMP,
        total_lista       = v_total_lista,
        dinero_real       = p_dinero_real,
        descuento_campo   = v_descuento
    WHERE id = p_ruta_id;

    RETURN jsonb_build_object(
        'ok',             true,
        'total_lista',    v_total_lista,
        'dinero_real',    p_dinero_real,
        'descuento_campo', v_descuento
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
