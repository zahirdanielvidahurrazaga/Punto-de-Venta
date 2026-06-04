-- ============================================================================
-- Quitar el PIN de empleados (no se usa; la autorización sensible es por el
-- código rotativo TOTP del admin: configuracion_seguridad + verificar_codigo_admin).
--
-- Idempotente. Pegar y ejecutar en el SQL Editor de Supabase.
-- IMPORTANTE: el orden importa — primero se actualiza el trigger para que deje
-- de escribir en usuarios_credenciales, y solo después se elimina la tabla.
-- ============================================================================

-- 1. Redefinir handle_new_user SIN crear credenciales de PIN.
--    (Mantiene el alta de perfil + gafete + sucursal principal.)
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

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Eliminar las RPCs del PIN de empleado (ya no se llaman desde la app).
DROP FUNCTION IF EXISTS public.pin_necesita_cambio();
DROP FUNCTION IF EXISTS public.cambiar_pin(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.verificar_pin_admin(VARCHAR);

-- 3. Eliminar la tabla de credenciales de PIN.
DROP TABLE IF EXISTS public.usuarios_credenciales;
