-- ============================================================================
-- FLUJO DEL TURNO BLINDADO: checada del día → apertura con fondo → corte.
-- Sesión 2026-10-01. Idempotente. Requiere notificaciones_push.sql.
--
-- Reporte del dueño: "a veces no siguen el flujo y no ponen cuánto reciben de
-- la caja" (deja $1,000 diarios). En la base real (2-sep → 1-oct):
--   · 7 de 30 turnos abrieron con fondo $0 o $100 → sobrantes falsos de ~$1,000.
--   · Si no marcaban salida, la checada de AYER seguía "trabajando" y al día
--     siguiente la app los mandaba directo a abrir caja sin escanear (13 y 25-sep).
--   · Tras el corte se podía volver a abrir caja (10-sep 19:09 → las ventas del
--     11 en la mañana cayeron en una caja abierta la noche anterior).
-- La app nueva ya lo impide; esto pone el MISMO candado en la base para que
-- ninguna app vieja (iOS/Android sin actualizar) se lo salte.
-- ============================================================================

BEGIN;

-- ─── 1. Fondo de caja por sucursal ──────────────────────────────────────────
ALTER TABLE sucursales ADD COLUMN IF NOT EXISTS fondo_caja numeric(10,2) NOT NULL DEFAULT 1000;
-- Lo que se esperaba al abrir (snapshot: si el dueño cambia el fondo después,
-- los turnos viejos no cambian).
ALTER TABLE sesiones_caja ADD COLUMN IF NOT EXISTS fondo_esperado numeric(10,2);
-- Cómo terminó la checada: 'escaneo' (QR), 'corte' (la registró el corte de
-- caja) u 'olvidada' (la cerró el sistema porque nunca se marcó salida).
ALTER TABLE registro_asistencia ADD COLUMN IF NOT EXISTS tipo_salida varchar(10);

-- Día de hoy en la tienda (México = UTC−6 sin horario de verano).
CREATE OR REPLACE FUNCTION hoy_tienda()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Mexico_City')::date
$$;

-- ─── 2. Candado al ABRIR caja ───────────────────────────────────────────────
-- Solo aplica a empleados (el admin no abre caja desde la app).
CREATE OR REPLACE FUNCTION validar_apertura_caja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rol      varchar;
  v_esperado numeric;
BEGIN
  SELECT rol INTO v_rol FROM usuarios_perfiles WHERE id = NEW.usuario_id;
  IF v_rol IS DISTINCT FROM 'empleado' THEN RETURN NEW; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM registro_asistencia
    WHERE usuario_id = NEW.usuario_id
      AND estado = 'trabajando'
      AND (fecha_entrada AT TIME ZONE 'America/Mexico_City')::date = hoy_tienda()
  ) THEN
    RAISE EXCEPTION 'Primero escanea tu gafete para checar la entrada de hoy.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sesiones_caja
    WHERE usuario_id = NEW.usuario_id AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'Ya tienes una caja abierta. Haz su corte antes de abrir otra.';
  END IF;

  IF COALESCE(NEW.fondo_inicial, 0) <= 0 THEN
    RAISE EXCEPTION 'Escribe cuánto dinero recibes en la caja (billetes y monedas).';
  END IF;

  SELECT fondo_caja INTO v_esperado FROM sucursales WHERE id = NEW.sucursal_id;
  NEW.fondo_esperado := COALESCE(v_esperado, 1000);

  IF abs(NEW.fondo_inicial - NEW.fondo_esperado) >= 0.01
     AND NULLIF(btrim(COALESCE(NEW.observaciones, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El fondo debe ser de $% y contaste $%. Escribe en observaciones por qué.',
      NEW.fondo_esperado, NEW.fondo_inicial;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validar_apertura_caja ON sesiones_caja;
CREATE TRIGGER trg_validar_apertura_caja BEFORE INSERT ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION validar_apertura_caja();

-- ─── 3. Aviso al dueño cuando una apertura sale de lo normal ────────────────
-- No avisa de las aperturas normales (ya llegan entrada y corte); solo de las
-- que hay que revisar: fondo distinto o segunda caja del día en la sucursal.
CREATE OR REPLACE FUNCTION notif_apertura_caja()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nombre varchar;
  v_suc    varchar;
  v_otras  int;
  v_motivos text[] := '{}';
BEGIN
  IF NEW.fondo_esperado IS NULL THEN RETURN NEW; END IF;  -- admin u otra vía

  SELECT nombre_completo INTO v_nombre FROM usuarios_perfiles WHERE id = NEW.usuario_id;
  SELECT nombre INTO v_suc FROM sucursales WHERE id = NEW.sucursal_id;

  IF abs(NEW.fondo_inicial - NEW.fondo_esperado) >= 0.01 THEN
    v_motivos := v_motivos || format('abrió con $%s (el fondo es $%s): %s',
      NEW.fondo_inicial, NEW.fondo_esperado, btrim(NEW.observaciones));
  END IF;

  SELECT count(*) INTO v_otras FROM sesiones_caja
  WHERE sucursal_id IS NOT DISTINCT FROM NEW.sucursal_id
    AND id <> NEW.id
    AND (fecha_apertura AT TIME ZONE 'America/Mexico_City')::date = hoy_tienda();
  IF v_otras > 0 THEN
    v_motivos := v_motivos || format('es la caja #%s de hoy en esta sucursal', v_otras + 1);
  END IF;

  IF array_length(v_motivos, 1) > 0 THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, sucursal_id, data)
    VALUES ('alerta_caja', 'Revisar apertura de caja',
            COALESCE(v_nombre, 'Empleado') || ' en ' || COALESCE(v_suc, 'sucursal') || ' ' ||
              array_to_string(v_motivos, '; ') || '.',
            NEW.sucursal_id, jsonb_build_object('sesion_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notif_apertura_caja ON sesiones_caja;
CREATE TRIGGER trg_notif_apertura_caja AFTER INSERT ON sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION notif_apertura_caja();

-- ─── 4. Checadas olvidadas ──────────────────────────────────────────────────
-- Una checada de un día anterior ya no vale como entrada de hoy. Se cierra
-- como 'olvidada' con la hora del último corte de esa persona (si lo hubo; es
-- cuando realmente se fue). Si todavía tiene una caja abierta se deja: el
-- corte la cerrará, para no dejar una caja viva sin nadie "trabajando".
-- La llama la app al entrar (solo la propia) y pg_cron cada madrugada (todas),
-- para que las apps viejas también pidan escanear al día siguiente.
CREATE OR REPLACE FUNCTION cerrar_checadas_vencidas(p_todas boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF p_todas AND auth.uid() IS NOT NULL AND NOT public.es_admin() THEN
    RAISE EXCEPTION 'Solo el administrador puede cerrar checadas de otros.';
  END IF;

  UPDATE registro_asistencia r
  SET estado = 'completado',
      tipo_salida = 'olvidada',
      fecha_salida = (
        SELECT max(s.fecha_cierre) FROM sesiones_caja s
        WHERE s.usuario_id = r.usuario_id AND s.fecha_cierre > r.fecha_entrada
      )
  WHERE r.estado = 'trabajando'
    AND (r.fecha_entrada AT TIME ZONE 'America/Mexico_City')::date < hoy_tienda()
    AND (p_todas OR r.usuario_id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM sesiones_caja s
      WHERE s.usuario_id = r.usuario_id AND s.estado = 'abierta'
    );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION cerrar_checadas_vencidas(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cerrar_checadas_vencidas(boolean) TO authenticated;

-- El aviso de "Salida registrada" no aplica a las olvidadas (las cierra el
-- cron de madrugada: sería un push a las 3 am por algo que nadie hizo).
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
  ELSIF TG_OP = 'UPDATE' AND NEW.estado = 'completado' AND OLD.estado <> 'completado'
        AND NEW.tipo_salida IS DISTINCT FROM 'olvidada' THEN
    INSERT INTO notificaciones (tipo, titulo, cuerpo, data)
    VALUES ('asistencia', 'Salida registrada',
            COALESCE(v_nombre, 'Empleado') || ' registró su salida',
            jsonb_build_object('usuario_id', NEW.usuario_id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. Programación: 03:00 hora de México (09:00 UTC) ──────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'checadas_vencidas';
  PERFORM cron.schedule('checadas_vencidas', '0 9 * * *', 'SELECT cerrar_checadas_vencidas(true)');
END $$;

COMMIT;
