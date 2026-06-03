-- ============================================================================
-- MULTI-SUCURSAL · FASE 1 (Base de datos)
-- ----------------------------------------------------------------------------
-- Modelo elegido: catálogo compartido + stock por sucursal.
--   * Un solo producto (mismo SKU y precio en todas las sucursales).
--   * El stock se guarda por sucursal en la tabla producto_stock.
--   * Empleado con sucursal fija: vende/recibe en la suya, lee ambas.
--   * Ventas, caja y movimientos quedan ligados a su sucursal.
--
-- Sucursales: "Tito Centro" (la actual, principal) y "Tito Aviación" (nueva).
--
-- Idempotente: se puede ejecutar varias veces sin duplicar nada.
-- IMPORTANTE: aplicar junto con el despliegue del frontend nuevo (cutover).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla de sucursales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sucursales (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre       varchar(120) NOT NULL UNIQUE,
    direccion    text,
    es_principal boolean NOT NULL DEFAULT false,
    activa       boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sucursales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de sucursales para autenticados" ON sucursales;
CREATE POLICY "Lectura de sucursales para autenticados"
    ON sucursales FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Gestión de sucursales solo admin" ON sucursales;
CREATE POLICY "Gestión de sucursales solo admin"
    ON sucursales FOR ALL USING (public.es_admin());

-- ----------------------------------------------------------------------------
-- 2. Stock por sucursal
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_stock (
    producto_id uuid NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id uuid NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    stock       integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (producto_id, sucursal_id)
);

ALTER TABLE producto_stock ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden LEER el stock de cualquier sucursal
-- (así un empleado consulta la existencia en la otra bodega).
DROP POLICY IF EXISTS "Lectura de stock para autenticados" ON producto_stock;
CREATE POLICY "Lectura de stock para autenticados"
    ON producto_stock FOR SELECT USING (auth.role() = 'authenticated');

-- Escritura directa solo admin; los empleados modifican vía RPC ajustar_stock
-- (SECURITY DEFINER, que valida que sea su propia sucursal).
DROP POLICY IF EXISTS "Escritura de stock solo admin" ON producto_stock;
CREATE POLICY "Escritura de stock solo admin"
    ON producto_stock FOR ALL USING (public.es_admin());

-- ----------------------------------------------------------------------------
-- 3. Columna sucursal_id en las tablas operativas
-- ----------------------------------------------------------------------------
ALTER TABLE usuarios_perfiles     ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);
ALTER TABLE ventas                ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);
ALTER TABLE sesiones_caja         ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);
ALTER TABLE pedidos_programados   ADD COLUMN IF NOT EXISTS sucursal_id uuid REFERENCES sucursales(id);

-- ----------------------------------------------------------------------------
-- 4. Semilla de sucursales + migración de datos existentes a "Tito Centro"
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_centro   uuid;
    v_aviacion uuid;
BEGIN
    -- Tito Centro (principal). Si ya existía alguna sucursal principal, no se duplica.
    SELECT id INTO v_centro FROM sucursales WHERE nombre = 'Tito Centro';
    IF v_centro IS NULL THEN
        INSERT INTO sucursales (nombre, es_principal) VALUES ('Tito Centro', true)
        RETURNING id INTO v_centro;
    END IF;

    -- Tito Aviación (nueva)
    SELECT id INTO v_aviacion FROM sucursales WHERE nombre = 'Tito Aviación';
    IF v_aviacion IS NULL THEN
        INSERT INTO sucursales (nombre, es_principal) VALUES ('Tito Aviación', false)
        RETURNING id INTO v_aviacion;
    END IF;

    -- Migrar el stock actual de cada producto a Tito Centro
    INSERT INTO producto_stock (producto_id, sucursal_id, stock)
    SELECT p.id, v_centro, p.stock FROM productos p
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

    -- Crear filas en 0 para Tito Aviación
    INSERT INTO producto_stock (producto_id, sucursal_id, stock)
    SELECT p.id, v_aviacion, 0 FROM productos p
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

    -- Asignar registros existentes a Tito Centro
    UPDATE usuarios_perfiles      SET sucursal_id = v_centro WHERE sucursal_id IS NULL;
    UPDATE ventas                 SET sucursal_id = v_centro WHERE sucursal_id IS NULL;
    UPDATE sesiones_caja          SET sucursal_id = v_centro WHERE sucursal_id IS NULL;
    UPDATE movimientos_inventario SET sucursal_id = v_centro WHERE sucursal_id IS NULL;

    -- Pedidos programados existentes: a la sucursal de quien los creó (o principal)
    UPDATE pedidos_programados pp
    SET sucursal_id = COALESCE(
        (SELECT up.sucursal_id FROM usuarios_perfiles up WHERE up.id = pp.usuario_id),
        v_centro)
    WHERE pp.sucursal_id IS NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Invariante: todo producto tiene una fila de stock en cada sucursal
-- ----------------------------------------------------------------------------
-- Al crear un producto, generar su fila de stock (0) en cada sucursal.
CREATE OR REPLACE FUNCTION crear_stock_para_producto()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO producto_stock (producto_id, sucursal_id, stock)
    SELECT NEW.id, s.id, 0 FROM sucursales s
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crear_stock_producto ON productos;
CREATE TRIGGER trigger_crear_stock_producto
    AFTER INSERT ON productos
    FOR EACH ROW EXECUTE FUNCTION crear_stock_para_producto();

-- Al crear una sucursal nueva, generar filas de stock (0) para todos los productos.
CREATE OR REPLACE FUNCTION crear_stock_para_sucursal()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO producto_stock (producto_id, sucursal_id, stock)
    SELECT p.id, NEW.id, 0 FROM productos p
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_crear_stock_sucursal ON sucursales;
CREATE TRIGGER trigger_crear_stock_sucursal
    AFTER INSERT ON sucursales
    FOR EACH ROW EXECUTE FUNCTION crear_stock_para_sucursal();

-- ----------------------------------------------------------------------------
-- 6. Helper: mantener sincronizada la columna legacy productos.stock con la
--    sucursal principal (red de seguridad / compatibilidad durante transición).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sincronizar_stock_legacy(p_producto uuid)
RETURNS void AS $$
BEGIN
    UPDATE productos SET stock = COALESCE((
        SELECT ps.stock FROM producto_stock ps
        JOIN sucursales s ON s.id = ps.sucursal_id
        WHERE ps.producto_id = p_producto AND s.es_principal
        LIMIT 1
    ), 0)
    WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 7. Descontar stock al vender, ahora por sucursal de la venta
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION descontar_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_sucursal uuid;
    v_stock    integer;
    v_nombre   varchar;
BEGIN
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

-- El trigger trigger_descontar_stock ya existe sobre venta_detalles y seguirá
-- llamando a esta función (la reemplazamos con CREATE OR REPLACE arriba).

-- ----------------------------------------------------------------------------
-- 8. Registrar venta: ahora etiqueta la venta con la sucursal del vendedor
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
    v_precio_real    DECIMAL;
BEGIN
    -- Sucursal del vendedor
    SELECT sucursal_id INTO v_sucursal FROM usuarios_perfiles WHERE id = auth.uid();
    IF v_sucursal IS NULL THEN
        SELECT id INTO v_sucursal FROM sucursales WHERE es_principal LIMIT 1;
    END IF;

    -- Caja abierta del usuario
    SELECT id INTO v_sesion_caja_id
    FROM sesiones_caja
    WHERE usuario_id = auth.uid() AND estado = 'abierta'
    LIMIT 1;

    IF v_sesion_caja_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM usuarios_perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'No tienes una caja abierta.');
        END IF;
    END IF;

    -- Total real con precios de la BD
    FOR v_item IN SELECT * FROM jsonb_array_elements(productos_json)
    LOOP
        SELECT * INTO v_producto FROM productos WHERE id = (v_item->>'id')::uuid;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado: ' || (v_item->>'id'));
        END IF;
        v_total := v_total + (v_producto.precio * (v_item->>'cantidad')::int);
    END LOOP;

    -- Crear la venta (con sucursal)
    INSERT INTO ventas (total, pago_efectivo, pago_tarjeta, pago_transferencia, user_id, sesion_caja_id, sucursal_id)
    VALUES (v_total, pago_efectivo, pago_tarjeta, pago_transferencia, auth.uid(), v_sesion_caja_id, v_sucursal)
    RETURNING id INTO v_venta_id;

    -- Detalles (el trigger descontar_stock descuenta del stock de la sucursal)
    FOR v_item IN SELECT * FROM jsonb_array_elements(productos_json)
    LOOP
        SELECT precio INTO v_precio_real FROM productos WHERE id = (v_item->>'id')::uuid;
        INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario)
        VALUES (v_venta_id, (v_item->>'id')::uuid, (v_item->>'cantidad')::int, v_precio_real);
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'venta_id', v_venta_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 9. RPC: lista de productos con el stock de UNA sucursal
--    (forma {…producto, stock}, para que el frontend lea .stock como antes)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION productos_de_sucursal(p_sucursal uuid)
RETURNS TABLE (
    id uuid, nombre varchar, sku varchar, categoria varchar,
    precio decimal, stock integer, sucursal_id uuid,
    created_at timestamptz, updated_at timestamptz
) AS $$
    SELECT p.id, p.nombre, p.sku, p.categoria, p.precio,
           COALESCE(ps.stock, 0) AS stock, p_sucursal AS sucursal_id,
           p.created_at, p.updated_at
    FROM productos p
    LEFT JOIN producto_stock ps
        ON ps.producto_id = p.id AND ps.sucursal_id = p_sucursal
    ORDER BY p.nombre;
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- 10. RPC: ajustar stock de una sucursal (recepción / ajuste / inicial)
--     Centraliza todos los cambios manuales de stock + registra el movimiento.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ajustar_stock(
    p_producto uuid,
    p_sucursal uuid,
    p_delta    integer,
    p_tipo     text DEFAULT 'ajuste',
    p_notas    text DEFAULT NULL
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_es_admin    boolean;
    v_mi_sucursal uuid;
    v_anterior    integer;
    v_nuevo       integer;
    v_nombre      varchar;
BEGIN
    SELECT rol = 'admin', sucursal_id INTO v_es_admin, v_mi_sucursal
    FROM usuarios_perfiles WHERE id = auth.uid();

    -- Un empleado solo puede tocar el stock de su propia sucursal
    IF NOT COALESCE(v_es_admin, false) AND p_sucursal IS DISTINCT FROM v_mi_sucursal THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Solo puedes ajustar el stock de tu sucursal.');
    END IF;

    IF p_tipo NOT IN ('entrada', 'ajuste', 'inicial') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Tipo de movimiento inválido.');
    END IF;

    SELECT nombre INTO v_nombre FROM productos WHERE id = p_producto;
    IF v_nombre IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado.');
    END IF;

    -- Asegurar fila y leer stock actual
    INSERT INTO producto_stock (producto_id, sucursal_id, stock)
    VALUES (p_producto, p_sucursal, 0)
    ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

    SELECT stock INTO v_anterior FROM producto_stock
    WHERE producto_id = p_producto AND sucursal_id = p_sucursal;

    v_nuevo := v_anterior + p_delta;
    IF v_nuevo < 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El stock no puede quedar negativo.');
    END IF;

    UPDATE producto_stock SET stock = v_nuevo, updated_at = now()
    WHERE producto_id = p_producto AND sucursal_id = p_sucursal;

    INSERT INTO movimientos_inventario
        (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
    VALUES
        (p_producto, v_nombre, p_tipo, p_delta, v_anterior, v_nuevo, p_notas, auth.uid(), p_sucursal);

    PERFORM sincronizar_stock_legacy(p_producto);

    RETURN jsonb_build_object('ok', true, 'stock_anterior', v_anterior, 'stock_nuevo', v_nuevo);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION productos_de_sucursal(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION ajustar_stock(uuid, uuid, integer, text, text)    TO authenticated;

-- ----------------------------------------------------------------------------
-- 11. Nuevos usuarios: asignarlos a la sucursal principal por defecto
--     (el admin puede reasignarlos luego desde la app).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    nombre_inicial VARCHAR;
    v_sucursal     uuid;
BEGIN
    nombre_inicial := COALESCE(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1));
    SELECT id INTO v_sucursal FROM sucursales WHERE es_principal LIMIT 1;

    INSERT INTO public.usuarios_perfiles (id, nombre_completo, rol, codigo_gafete, sucursal_id)
    VALUES (
        new.id,
        nombre_inicial,
        'empleado',
        'GAF-' || substring(new.id::text, 1, 8),
        v_sucursal
    );

    INSERT INTO public.usuarios_credenciales (usuario_id, pin_seguridad, pin_debe_cambiar)
    VALUES (new.id, crypt('1234', gen_salt('bf', 10)), true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
