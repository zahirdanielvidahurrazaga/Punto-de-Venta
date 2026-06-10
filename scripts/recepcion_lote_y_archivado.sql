-- ============================================================================
-- RECEPCIÓN POR LOTE (atómica) + ARCHIVAR/ELIMINAR PRODUCTO
-- ----------------------------------------------------------------------------
-- Pegar y ejecutar en el SQL Editor de Supabase. Idempotente.
--   1) ajustar_stock_lote(): aplica varias entradas de stock en UNA transacción.
--      Si una falla, se revierten TODAS (no quedan entradas a medias).
--   2) productos.activo + eliminar_producto(): quita un producto del catálogo;
--      si tiene historial (ventas/pedidos/rutas) lo ARCHIVA en vez de borrarlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recepción por lote (atómica)
--    p_items: jsonb array de { "producto_id": uuid, "cantidad": int }
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ajustar_stock_lote(
    p_items    jsonb,
    p_sucursal uuid,
    p_tipo     text DEFAULT 'entrada',
    p_notas    text DEFAULT NULL
) RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
    v_es_admin    boolean;
    v_mi_sucursal uuid;
    v_item        jsonb;
    v_producto    uuid;
    v_cant        integer;
    v_anterior    integer;
    v_nuevo       integer;
    v_nombre      varchar;
    v_aplicados   integer := 0;
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

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_producto := (v_item->>'producto_id')::uuid;
        v_cant     := (v_item->>'cantidad')::int;

        SELECT nombre INTO v_nombre FROM productos WHERE id = v_producto;
        IF v_nombre IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado en el lote.');
        END IF;

        -- Asegurar fila y leer stock actual
        INSERT INTO producto_stock (producto_id, sucursal_id, stock)
        VALUES (v_producto, p_sucursal, 0)
        ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

        SELECT stock INTO v_anterior FROM producto_stock
        WHERE producto_id = v_producto AND sucursal_id = p_sucursal;

        v_nuevo := v_anterior + v_cant;
        IF v_nuevo < 0 THEN
            RETURN jsonb_build_object('ok', false, 'error',
                'El stock de "' || v_nombre || '" no puede quedar negativo.');
        END IF;

        UPDATE producto_stock SET stock = v_nuevo, updated_at = now()
        WHERE producto_id = v_producto AND sucursal_id = p_sucursal;

        INSERT INTO movimientos_inventario
            (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
        VALUES
            (v_producto, v_nombre, p_tipo, v_cant, v_anterior, v_nuevo, p_notas, auth.uid(), p_sucursal);

        PERFORM sincronizar_stock_legacy(v_producto);
        v_aplicados := v_aplicados + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'aplicados', v_aplicados);
EXCEPTION WHEN OTHERS THEN
    -- Cualquier error revierte TODO el lote (transacción de la función)
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION ajustar_stock_lote(jsonb, uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Archivar / eliminar producto
-- ----------------------------------------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- El catálogo por sucursal ahora solo devuelve productos activos.
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
    WHERE p.activo
    ORDER BY p.nombre;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION productos_de_sucursal(uuid) TO authenticated;

-- Quita un producto del catálogo. Si nunca se vendió/pidió/cargó en ruta, se
-- BORRA de verdad; si tiene historial, se ARCHIVA (activo=false) para no romper
-- las referencias de ventas/pedidos pasados.
CREATE OR REPLACE FUNCTION eliminar_producto(p_id uuid)
RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
    v_nombre varchar;
BEGIN
    IF NOT public.es_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Solo el administrador puede eliminar productos.');
    END IF;

    SELECT nombre INTO v_nombre FROM productos WHERE id = p_id;
    IF v_nombre IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado.');
    END IF;

    IF EXISTS (SELECT 1 FROM venta_detalles WHERE producto_id = p_id)
       OR EXISTS (SELECT 1 FROM pedido_items WHERE producto_id = p_id)
       OR EXISTS (SELECT 1 FROM ruta_carga   WHERE producto_id = p_id) THEN
        UPDATE productos SET activo = false WHERE id = p_id;
        RETURN jsonb_build_object('ok', true, 'accion', 'archivado', 'nombre', v_nombre);
    END IF;

    DELETE FROM productos WHERE id = p_id; -- ON DELETE CASCADE limpia producto_stock
    RETURN jsonb_build_object('ok', true, 'accion', 'eliminado', 'nombre', v_nombre);
EXCEPTION WHEN OTHERS THEN
    -- Si una FK inesperada impide el borrado, archivar como fallback seguro.
    UPDATE productos SET activo = false WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'accion', 'archivado', 'nombre', v_nombre);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION eliminar_producto(uuid) TO authenticated;
