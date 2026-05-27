-- ==============================================================================
-- RUN THIS SCRIPT IN YOUR SUPABASE SQL EDITOR
-- This allows a logged-in user to permanently delete their own account.
-- It deletes from auth.users, which cascades to usuarios_perfiles and other tables.
-- ==============================================================================

CREATE OR REPLACE FUNCTION eliminar_mi_cuenta()
RETURNS void SECURITY DEFINER AS $$
BEGIN
    -- Verificar que el usuario está autenticado
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'No autorizado. Debes iniciar sesión para eliminar tu cuenta.';
    END IF;

    -- Eliminar al usuario de auth.users.
    -- Al estar definida como SECURITY DEFINER, esta función se ejecuta con 
    -- privilegios de administrador de base de datos (rol postgres),
    -- lo que permite saltarse las restricciones de RLS y eliminar el registro de auth.users.
    -- NOTA: Como la tabla usuarios_perfiles tiene ON DELETE CASCADE,
    -- el perfil y credenciales se borrarán automáticamente.
    DELETE FROM auth.users WHERE id = auth.uid();
END;
$$ LANGUAGE plpgsql;
