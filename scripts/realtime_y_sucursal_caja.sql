-- ============================================================================
-- Realtime + fix de sucursal en caja
-- Pegar y ejecutar en el SQL Editor de Supabase. Es idempotente: se puede
-- correr varias veces sin romper nada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FIX: sesiones_caja.sucursal_id se quedaba en NULL
-- ----------------------------------------------------------------------------
-- La app inserta la apertura de caja sin sucursal_id, así que TODAS las
-- sesiones quedaban en NULL. Consecuencia: en Reportes → "Cortes de caja" y en
-- Dashboard → "Cajas abiertas"/"Flujo", al filtrar por sucursal no aparecía
-- NADA (el filtro es `sucursal_id = ...` y NULL nunca empata). Los retiros y
-- depósitos heredaban el mismo NULL desde registrar_movimiento_caja.
--
-- Se arregla en la app, pero además se pone esta red de seguridad en la BD para
-- que también quede bien si alguien usa una versión vieja de iOS/Android.
CREATE OR REPLACE FUNCTION completar_sucursal_caja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sucursal_id IS NULL THEN
    SELECT sucursal_id INTO NEW.sucursal_id
    FROM usuarios_perfiles
    WHERE id = NEW.usuario_id;
  END IF;

  -- Si el perfil tampoco la tiene, caer a la sucursal principal.
  IF NEW.sucursal_id IS NULL THEN
    SELECT id INTO NEW.sucursal_id
    FROM sucursales
    WHERE es_principal = true AND activa = true
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_completar_sucursal_caja ON sesiones_caja;
CREATE TRIGGER trg_completar_sucursal_caja
  BEFORE INSERT ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION completar_sucursal_caja();

-- Mismo criterio para los movimientos de caja (sangrías).
DROP TRIGGER IF EXISTS trg_completar_sucursal_mov_caja ON movimientos_caja;
CREATE TRIGGER trg_completar_sucursal_mov_caja
  BEFORE INSERT ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION completar_sucursal_caja();

-- Rellenar lo que ya existiera con NULL (por si quedan filas viejas).
UPDATE sesiones_caja s
   SET sucursal_id = u.sucursal_id
  FROM usuarios_perfiles u
 WHERE s.usuario_id = u.id
   AND s.sucursal_id IS NULL
   AND u.sucursal_id IS NOT NULL;

UPDATE movimientos_caja m
   SET sucursal_id = s.sucursal_id
  FROM sesiones_caja s
 WHERE m.sesion_caja_id = s.id
   AND m.sucursal_id IS NULL
   AND s.sucursal_id IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 2. REALTIME: publicar las tablas que la app necesita ver en vivo
-- ----------------------------------------------------------------------------
-- Sin esto, `postgres_changes` en el cliente se suscribe pero nunca recibe
-- eventos. `notificaciones` ya estaba publicada (script notificaciones_push).
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'ventas',              -- Dashboard y Pedidos en vivo
    'producto_stock',      -- stock por sucursal (Terminal e Inventario)
    'productos',           -- alta/edición/archivado de catálogo
    'sesiones_caja',          -- quién tiene caja abierta
    'movimientos_caja',       -- retiros y depósitos del turno
    'movimientos_inventario', -- historial de entradas/salidas
    'registro_asistencia',    -- entradas y salidas
    'pedidos_programados',    -- agenda de pedidos
    'pedido_items',           -- partidas de esos pedidos
    'usuarios_perfiles'       -- altas de empleados y cambios de sucursal
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- Para que los filtros del cliente (p. ej. sucursal_id=eq.X) funcionen también
-- en UPDATE y DELETE, el registro viejo debe viajar completo.
ALTER TABLE producto_stock          REPLICA IDENTITY FULL;
ALTER TABLE ventas                  REPLICA IDENTITY FULL;
ALTER TABLE sesiones_caja           REPLICA IDENTITY FULL;
ALTER TABLE movimientos_caja        REPLICA IDENTITY FULL;
ALTER TABLE movimientos_inventario  REPLICA IDENTITY FULL;
ALTER TABLE pedidos_programados     REPLICA IDENTITY FULL;

-- Comprobación: debe listar las 9 tablas de arriba + notificaciones.
SELECT tablename
  FROM pg_publication_tables
 WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
 ORDER BY tablename;
