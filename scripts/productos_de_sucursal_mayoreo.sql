-- ============================================================================
-- FIX: productos_de_sucursal debe devolver precio_mayoreo y cantidad_mayoreo
-- ----------------------------------------------------------------------------
-- Sin esto, el Terminal/Inventario cargan los productos SIN datos de mayoreo,
-- así que el precio de mayoreo no se muestra ni se aplica en el cobro.
-- Pegar y ejecutar en el SQL Editor de Supabase. Idempotente.
-- (Se hace DROP porque cambia la firma de columnas de retorno de la función.)
-- ============================================================================

DROP FUNCTION IF EXISTS productos_de_sucursal(uuid);

CREATE FUNCTION productos_de_sucursal(p_sucursal uuid)
RETURNS TABLE (
    id uuid, nombre varchar, sku varchar, categoria varchar,
    precio decimal, precio_mayoreo decimal, cantidad_mayoreo integer,
    stock integer, sucursal_id uuid,
    created_at timestamptz, updated_at timestamptz
) AS $$
    SELECT p.id, p.nombre, p.sku, p.categoria, p.precio,
           p.precio_mayoreo, p.cantidad_mayoreo,
           COALESCE(ps.stock, 0) AS stock, p_sucursal AS sucursal_id,
           p.created_at, p.updated_at
    FROM productos p
    LEFT JOIN producto_stock ps
        ON ps.producto_id = p.id AND ps.sucursal_id = p_sucursal
    WHERE p.activo
    ORDER BY p.nombre;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION productos_de_sucursal(uuid) TO authenticated;
