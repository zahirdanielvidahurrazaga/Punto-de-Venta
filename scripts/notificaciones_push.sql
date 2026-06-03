-- ============================================================================
-- NOTIFICACIONES PUSH (dirigidas al admin)
-- Tokens de dispositivo + centro de avisos + triggers de los 4 eventos.
-- Idempotente. Ejecutar en el SQL Editor de Supabase (en bloques si es grande).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tokens de dispositivo (uno por dispositivo/usuario)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id uuid NOT NULL REFERENCES usuarios_perfiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  plataforma varchar(10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Token propio" ON push_tokens;
CREATE POLICY "Token propio" ON push_tokens FOR ALL USING (usuario_id = auth.uid());

-- La app guarda/actualiza el token del usuario autenticado.
CREATE OR REPLACE FUNCTION guardar_push_token(p_token text, p_plataforma text DEFAULT NULL)
RETURNS void SECURITY DEFINER AS $$
BEGIN
  INSERT INTO push_tokens (usuario_id, token, plataforma)
  VALUES (auth.uid(), p_token, p_plataforma)
  ON CONFLICT (token) DO UPDATE
    SET usuario_id = auth.uid(), plataforma = EXCLUDED.plataforma, updated_at = now();
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION guardar_push_token(text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Centro de avisos (cada fila = una notificación; también dispara el push)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notificaciones (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo varchar(30) NOT NULL,          -- stock_bajo | asistencia | corte_caja | pedido
  titulo text NOT NULL,
  cuerpo text NOT NULL,
  sucursal_id uuid REFERENCES sucursales(id),
  data jsonb,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Solo el admin lee/gestiona el centro de avisos. Los triggers (SECURITY DEFINER)
-- insertan sin pasar por RLS.
DROP POLICY IF EXISTS "Notificaciones solo admin" ON notificaciones;
CREATE POLICY "Notificaciones solo admin" ON notificaciones FOR ALL USING (public.es_admin());

-- Realtime: el centro de avisos in-app se suscribe a los INSERT de esta tabla.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Triggers de eventos
-- ----------------------------------------------------------------------------

-- 3a. Stock bajo / agotado (al bajar a <= 5)
CREATE OR REPLACE FUNCTION notif_stock_bajo()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_nombre varchar; v_suc varchar;
BEGIN
  IF NEW.stock <= 5 AND NEW.stock < OLD.stock THEN
    SELECT nombre INTO v_nombre FROM productos WHERE id = NEW.producto_id;
    SELECT nombre INTO v_suc FROM sucursales WHERE id = NEW.sucursal_id;
    INSERT INTO notificaciones (tipo, titulo, cuerpo, sucursal_id, data)
    VALUES ('stock_bajo',
            CASE WHEN NEW.stock = 0 THEN 'Producto agotado' ELSE 'Stock bajo' END,
            COALESCE(v_nombre, 'Producto') || ' en ' || COALESCE(v_suc, 'sucursal') ||
              ': ' || NEW.stock || ' unidades',
            NEW.sucursal_id,
            jsonb_build_object('producto_id', NEW.producto_id, 'stock', NEW.stock));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notif_stock_bajo ON producto_stock;
CREATE TRIGGER trigger_notif_stock_bajo
  AFTER UPDATE OF stock ON producto_stock
  FOR EACH ROW EXECUTE FUNCTION notif_stock_bajo();

-- 3b. Asistencia (entrada al insertar, salida al completar)
CREATE OR REPLACE FUNCTION notif_asistencia()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_nombre varchar;
BEGIN
  SELECT nombre_completo INTO v_nombre FROM usuarios_perfiles WHERE id = NEW.usuario_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
    VALUES ('asistencia', 'Entrada registrada',
            COALESCE(v_nombre, 'Empleado') || ' registró su entrada',
            jsonb_build_object('usuario_id', NEW.usuario_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'completado' AND OLD.estado <> 'completado' THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
    VALUES ('asistencia', 'Salida registrada',
            COALESCE(v_nombre, 'Empleado') || ' registró su salida',
            jsonb_build_object('usuario_id', NEW.usuario_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notif_asistencia ON registro_asistencia;
CREATE TRIGGER trigger_notif_asistencia
  AFTER INSERT OR UPDATE ON registro_asistencia
  FOR EACH ROW EXECUTE FUNCTION notif_asistencia();

-- 3c. Corte de caja (al cerrar una sesión)
CREATE OR REPLACE FUNCTION notif_corte_caja()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_nombre varchar; v_suc varchar;
BEGIN
  IF NEW.estado = 'cerrada' AND OLD.estado <> 'cerrada' THEN
    SELECT nombre_completo INTO v_nombre FROM usuarios_perfiles WHERE id = NEW.usuario_id;
    SELECT nombre INTO v_suc FROM sucursales WHERE id = NEW.sucursal_id;
    INSERT INTO notificaciones (tipo, titulo, cuerpo, sucursal_id, data)
    VALUES ('corte_caja', 'Corte de caja',
            COALESCE(v_nombre, 'Empleado') || ' cerró caja en ' || COALESCE(v_suc, 'sucursal') ||
              '. Efectivo declarado: $' || COALESCE(NEW.efectivo_declarado, 0),
            NEW.sucursal_id, jsonb_build_object('sesion_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_notif_corte_caja ON sesiones_caja;
CREATE TRIGGER trigger_notif_corte_caja
  AFTER UPDATE ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION notif_corte_caja();

-- 3d. Pedidos próximos: recordatorio diario de pedidos pendientes para hoy
CREATE OR REPLACE FUNCTION notif_pedidos_hoy()
RETURNS void SECURITY DEFINER AS $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM pedidos_programados
  WHERE estado = 'pendiente' AND fecha_entrega = CURRENT_DATE;
  IF v_count > 0 THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
    VALUES ('pedido', 'Pedidos para hoy',
            'Tienes ' || v_count || ' pedido(s) programado(s) para entregar hoy',
            jsonb_build_object('fecha', CURRENT_DATE));
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Programar el recordatorio diario (requiere la extensión pg_cron habilitada:
-- Dashboard -> Database -> Extensions -> pg_cron). 14:00 UTC ≈ 8:00 a.m. en CDMX.
-- Descomenta y ejecuta una sola vez:
-- SELECT cron.schedule('pedidos-hoy', '0 14 * * *', $$ SELECT notif_pedidos_hoy(); $$);
