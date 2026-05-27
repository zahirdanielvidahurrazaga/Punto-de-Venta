-- =====================================================================
-- SCRIPT DE ACTUALIZACIÓN DE BASE DE DATOS
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================================

-- 1. Añadir columnas de costo de mayoreo a la tabla productos
ALTER TABLE public.productos
ADD COLUMN IF NOT EXISTS precio_mayoreo numeric(10,2),
ADD COLUMN IF NOT EXISTS cantidad_mayoreo integer;

-- 2. Función segura para eliminar cuenta (RPC)
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Eliminar el perfil del usuario de la tabla pública
  DELETE FROM public.usuarios_perfiles
  WHERE id = auth.uid();
  
  -- Eliminar el usuario de la tabla de autenticación de Supabase
  DELETE FROM auth.users
  WHERE id = auth.uid();
END;
$$;

-- 3. Otorgar permisos para usar la función RPC
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;
