-- =====================================================================
-- FIX: "Database error creating new user" al dar de alta un empleado
-- ---------------------------------------------------------------------
-- Causa REAL (confirmada en producción): el trigger handle_new_user
-- insertaba en `public.usuarios_credenciales` (PIN bcrypt), pero esa tabla
-- NO existe en la base. El INSERT fallaba y GoTrue lo reportaba como
-- "Database error creating new user", bloqueando TODA alta de usuario.
--
-- El subsistema de PIN/credenciales está muerto: no existe la tabla ni
-- ninguna función que la use. El código admin rotativo (TOTP,
-- verificar_codigo_admin / configuracion_seguridad) reemplazó al PIN para
-- autorizar acciones sensibles. Por eso se ELIMINA ese INSERT del trigger.
--
-- De paso se endurece la función (recomendación estándar de Supabase para
-- triggers de Auth SECURITY DEFINER): se califica `public.sucursales` y se
-- fija un search_path explícito, porque el rol supabase_auth_admin que
-- dispara el trigger no tiene `public` en su search_path.
--
-- Idempotente. Pegar y ejecutar en el SQL Editor de Supabase.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    nombre_inicial VARCHAR;
    v_sucursal     uuid;
BEGIN
    nombre_inicial := COALESCE(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1));

    -- Sucursal principal por defecto (el admin puede reasignar luego).
    SELECT id INTO v_sucursal FROM public.sucursales WHERE es_principal LIMIT 1;

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
$$;

-- El trigger on_auth_user_created ya apunta a esta función; CREATE OR REPLACE
-- conserva el binding, no hace falta recrearlo.
