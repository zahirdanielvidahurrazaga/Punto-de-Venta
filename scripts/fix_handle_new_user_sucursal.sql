-- =====================================================================
-- FIX: "Database error creating new user" al dar de alta un empleado
-- ---------------------------------------------------------------------
-- La versión multi-sucursal de handle_new_user agregó
--     SELECT id INTO v_sucursal FROM sucursales WHERE es_principal ...
-- con la tabla SIN calificar el esquema. El trigger de Auth corre como el
-- rol `supabase_auth_admin`, cuyo search_path NO incluye `public`, así que
-- `sucursales` no se resuelve y Postgres lanza un error que GoTrue reporta
-- como "Database error creating new user" (bloquea TODA alta de usuario).
--
-- Solución: calificar los objetos con `public.` / `extensions.` y fijar un
-- search_path explícito en la función (recomendación estándar de Supabase
-- para funciones SECURITY DEFINER que disparan triggers de Auth).
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

    -- crypt/gen_salt (pgcrypto) sin calificar: el search_path de arriba cubre
    -- tanto `extensions` como `public`, donde puede vivir la extensión.
    INSERT INTO public.usuarios_credenciales (usuario_id, pin_seguridad, pin_debe_cambiar)
    VALUES (new.id, crypt('1234', gen_salt('bf', 10)), true);

    RETURN NEW;
END;
$$;

-- El trigger on_auth_user_created ya apunta a esta función; CREATE OR REPLACE
-- conserva el binding, no hace falta recrearlo.
