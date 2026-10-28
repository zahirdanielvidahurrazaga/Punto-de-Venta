-- ============================================================================
-- CONTROL DE CAJAS A DISTANCIA — permisos del canal privado 'pos-control'
-- (28-oct-2026, src/lib/controlCajas.js)
--
-- El canal anuncia qué cajas están conectadas (presence) y lleva la orden
-- "recargar" (broadcast). Sin estas políticas, con el canal público, bastaba
-- la llave anon del frontend para mandar recargas o ver quién está conectado
-- (hallazgo de la revisión de Codex). Con canal PRIVADO + estas políticas:
--   · leer (recibir la orden y ver la presencia): cualquier usuario con sesión
--   · anunciarse (presence): cualquier usuario con sesión
--   · mandar "recargar" (broadcast): SOLO admin
--
-- Idempotente. Correr con:  pos-sql scripts/control_cajas_realtime.sql
-- Ensayar antes cambiando el COMMIT final por ROLLBACK.
-- Revertir: DROP POLICY de las tres de abajo.
-- ============================================================================
BEGIN;

DROP POLICY IF EXISTS "pos-control: leer" ON realtime.messages;
DROP POLICY IF EXISTS "pos-control: anunciarse" ON realtime.messages;
DROP POLICY IF EXISTS "pos-control: recargar solo admin" ON realtime.messages;

CREATE POLICY "pos-control: leer" ON realtime.messages
  FOR SELECT TO authenticated
  USING (realtime.topic() = 'pos-control');

CREATE POLICY "pos-control: anunciarse" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() = 'pos-control' AND extension = 'presence');

CREATE POLICY "pos-control: recargar solo admin" ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (realtime.topic() = 'pos-control' AND extension = 'broadcast' AND public.es_admin());

-- comprobación: deben salir las tres
SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'realtime' AND tablename = 'messages' AND policyname LIKE 'pos-control%' ORDER BY 1;

COMMIT;
