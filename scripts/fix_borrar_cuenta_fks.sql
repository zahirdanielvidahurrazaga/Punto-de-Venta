-- ==============================================================================
-- FIX: no se podía eliminar la cuenta de un empleado
-- ==============================================================================
-- Síntoma (reportado por el dueño el 2026-08-19, Ajustes -> Zona Peligrosa):
--   update or delete on table "usuarios_perfiles" violates foreign key
--   constraint "sesiones_caja_usuario_id_fkey" on table "sesiones_caja"
--
-- Causa: seis FKs apuntan al usuario SIN cláusula ON DELETE, así que Postgres
-- bloquea el borrado en cuanto la persona tiene cualquier historial. Arreglar
-- sólo sesiones_caja no sirve: el siguiente intento falla con registro_asistencia,
-- luego con pedidos_programados, etc.
--
-- Criterio de este script:
--   * HISTORIAL DE DINERO Y OPERACIÓN (ventas, sesiones_caja, movimientos_caja,
--     movimientos_inventario, pedidos_programados, rutas) -> ON DELETE SET NULL.
--     El registro se conserva; sólo se suelta la referencia. Un corte de caja o
--     una venta NO deben desaparecer porque se dé de baja a un empleado.
--   * Para no perder la trazabilidad, se guarda el NOMBRE del empleado en la
--     propia fila (columna usuario_nombre) mediante un trigger que dispara
--     ANTES del borrado. Después de eliminar la cuenta, el reporte sigue
--     diciendo "Corte de Brenda", aunque Brenda ya no exista como usuario.
--   * DATOS PERSONALES DEL EMPLEADO (registro_asistencia, push_tokens,
--     usuarios_credenciales) -> ON DELETE CASCADE. Se van con la cuenta.
--
-- Idempotente: se puede correr varias veces sin daño.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Repuntar las FKs. Se localiza la constraint por su columna (no por nombre)
--    para no depender de cómo la haya bautizado Postgres en producción.
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    objetivo   RECORD;
    fk         RECORD;
    destino    TEXT;
BEGIN
    FOR objetivo IN
        SELECT * FROM (VALUES
            -- tabla,                  columna,      referencia,           accion
            -- OJO: ventas.user_id NO lleva FK a propósito. En producción nunca
            -- tuvo una, así que no bloquea el borrado; crearla ahora sólo
            -- añadiría un modo de falla nuevo al cobro si algún user_id no
            -- cuadrara. El historial de ventas se protege con el snapshot de
            -- nombre del punto 2, no con la FK.
            ('sesiones_caja',          'usuario_id', 'usuarios_perfiles',  'SET NULL'),
            ('movimientos_caja',       'usuario_id', 'usuarios_perfiles',  'SET NULL'),
            ('movimientos_inventario', 'usuario_id', 'usuarios_perfiles',  'SET NULL'),
            ('pedidos_programados',    'usuario_id', 'usuarios_perfiles',  'SET NULL'),
            ('rutas',                  'usuario_id', 'usuarios_perfiles',  'SET NULL'),
            ('registro_asistencia',    'usuario_id', 'usuarios_perfiles',  'CASCADE'),
            ('push_tokens',            'usuario_id', 'usuarios_perfiles',  'CASCADE'),
            ('usuarios_credenciales',  'usuario_id', 'usuarios_perfiles',  'CASCADE')
        ) AS t(tabla, columna, referencia, accion)
    LOOP
        -- La tabla puede no existir en producción (p. ej. usuarios_credenciales,
        -- que quedó muerta al reemplazar el PIN por el TOTP).
        IF to_regclass('public.' || objetivo.tabla) IS NULL THEN
            RAISE NOTICE 'omitida: la tabla % no existe', objetivo.tabla;
            CONTINUE;
        END IF;

        -- SET NULL exige que la columna acepte NULL.
        IF objetivo.accion = 'SET NULL' THEN
            EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL',
                           objetivo.tabla, objetivo.columna);
        END IF;

        -- Tirar la FK que hoy exista sobre esa columna.
        FOR fk IN
            SELECT con.conname
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
            WHERE con.contype = 'f'
              AND nsp.nspname = 'public'
              AND rel.relname = objetivo.tabla
              AND (
                SELECT array_agg(att.attname::text ORDER BY att.attnum)
                FROM unnest(con.conkey) AS k(attnum)
                JOIN pg_attribute att
                  ON att.attrelid = con.conrelid AND att.attnum = k.attnum
              ) = ARRAY[objetivo.columna]
        LOOP
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                           objetivo.tabla, fk.conname);
        END LOOP;

        destino := CASE WHEN objetivo.referencia = 'auth.users'
                        THEN 'auth.users' ELSE 'public.usuarios_perfiles' END;

        EXECUTE format(
            'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) '
            || 'REFERENCES %s(id) ON DELETE %s',
            objetivo.tabla,
            objetivo.tabla || '_' || objetivo.columna || '_fkey',
            objetivo.columna, destino, objetivo.accion);

        RAISE NOTICE 'ok: %.% -> % ON DELETE %',
            objetivo.tabla, objetivo.columna, destino, objetivo.accion;
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 2. Snapshot del nombre, para que el historial siga siendo legible
--    después de borrar al empleado.
-- ------------------------------------------------------------------------------
ALTER TABLE ventas            ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
ALTER TABLE sesiones_caja     ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;

DO $$
BEGIN
    IF to_regclass('public.movimientos_caja') IS NOT NULL THEN
        ALTER TABLE movimientos_caja ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
    END IF;
    IF to_regclass('public.movimientos_inventario') IS NOT NULL THEN
        ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS usuario_nombre TEXT;
    END IF;
END $$;

-- Rellenar lo que ya existe (una sola vez; después lo mantiene el trigger).
UPDATE ventas v
   SET usuario_nombre = p.nombre_completo
  FROM usuarios_perfiles p
 WHERE p.id = v.user_id AND v.usuario_nombre IS NULL;

UPDATE sesiones_caja s
   SET usuario_nombre = p.nombre_completo
  FROM usuarios_perfiles p
 WHERE p.id = s.usuario_id AND s.usuario_nombre IS NULL;

DO $$
BEGIN
    IF to_regclass('public.movimientos_caja') IS NOT NULL THEN
        UPDATE movimientos_caja m
           SET usuario_nombre = p.nombre_completo
          FROM usuarios_perfiles p
         WHERE p.id = m.usuario_id AND m.usuario_nombre IS NULL;
    END IF;
    IF to_regclass('public.movimientos_inventario') IS NOT NULL THEN
        UPDATE movimientos_inventario m
           SET usuario_nombre = p.nombre_completo
          FROM usuarios_perfiles p
         WHERE p.id = m.usuario_id AND m.usuario_nombre IS NULL;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. Trigger: estampa el nombre justo antes de que la cuenta desaparezca.
--    Corre BEFORE DELETE, así que alcanza a leer nombre_completo antes de que
--    las FKs pongan las referencias en NULL. También se dispara cuando el
--    borrado llega en cascada desde auth.users.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.congelar_nombre_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE ventas SET usuario_nombre = OLD.nombre_completo
     WHERE user_id = OLD.id AND usuario_nombre IS NULL;

    UPDATE sesiones_caja SET usuario_nombre = OLD.nombre_completo
     WHERE usuario_id = OLD.id AND usuario_nombre IS NULL;

    IF to_regclass('public.movimientos_caja') IS NOT NULL THEN
        UPDATE movimientos_caja SET usuario_nombre = OLD.nombre_completo
         WHERE usuario_id = OLD.id AND usuario_nombre IS NULL;
    END IF;

    IF to_regclass('public.movimientos_inventario') IS NOT NULL THEN
        UPDATE movimientos_inventario SET usuario_nombre = OLD.nombre_completo
         WHERE usuario_id = OLD.id AND usuario_nombre IS NULL;
    END IF;

    RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_congelar_nombre_usuario ON usuarios_perfiles;
CREATE TRIGGER trg_congelar_nombre_usuario
    BEFORE DELETE ON usuarios_perfiles
    FOR EACH ROW EXECUTE FUNCTION public.congelar_nombre_usuario();

-- ------------------------------------------------------------------------------
-- 4. RPC para que el ADMIN dé de baja a un empleado desde la app (pantalla
--    Equipo), sin tener que entrar con la cuenta ajena.
--    Reglas: sólo admin; no puede borrarse a sí mismo por esta vía (para eso
--    está Ajustes) y no puede borrar a otro admin.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.eliminar_empleado(p_usuario UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_rol_objetivo TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuarios_perfiles
         WHERE id = auth.uid() AND rol = 'admin'
    ) THEN
        RAISE EXCEPTION 'Solo un administrador puede eliminar cuentas.';
    END IF;

    IF p_usuario = auth.uid() THEN
        RAISE EXCEPTION 'No puedes eliminar tu propia cuenta desde aquí. Usa Ajustes.';
    END IF;

    SELECT rol INTO v_rol_objetivo FROM usuarios_perfiles WHERE id = p_usuario;

    IF v_rol_objetivo IS NULL THEN
        RAISE EXCEPTION 'La cuenta no existe.';
    END IF;

    IF v_rol_objetivo = 'admin' THEN
        RAISE EXCEPTION 'No se puede eliminar a otro administrador.';
    END IF;

    -- Cascadea a usuarios_perfiles y de ahí al resto, ya con las reglas de arriba.
    DELETE FROM auth.users WHERE id = p_usuario;
END $$;

REVOKE ALL ON FUNCTION public.eliminar_empleado(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eliminar_empleado(UUID) TO authenticated;

COMMIT;

-- ==============================================================================
-- VERIFICACIÓN (correr aparte, después del COMMIT)
-- ==============================================================================
-- Debe listar las 9 FKs con su regla; ninguna en 'a' (NO ACTION).
--
-- SELECT rel.relname   AS tabla,
--        att.attname   AS columna,
--        CASE con.confdeltype WHEN 'n' THEN 'SET NULL'
--                             WHEN 'c' THEN 'CASCADE'
--                             WHEN 'a' THEN '** NO ACTION (bloquea) **'
--                             ELSE con.confdeltype::text END AS al_borrar
--   FROM pg_constraint con
--   JOIN pg_class rel      ON rel.oid = con.conrelid
--   JOIN pg_class ref      ON ref.oid = con.confrelid
--   JOIN pg_attribute att  ON att.attrelid = con.conrelid
--                         AND att.attnum = con.conkey[1]
--  WHERE con.contype = 'f'
--    AND ref.relname IN ('usuarios_perfiles', 'users')
--    AND att.attname IN ('usuario_id', 'user_id')
--  ORDER BY 1;
