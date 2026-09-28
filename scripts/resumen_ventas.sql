-- ============================================================================
-- resumen_ventas: LA fuente de verdad de los números de ventas.
-- Sesión 2026-09-27. Idempotente.
-- ============================================================================
--
-- POR QUÉ
-- Dashboard, Pedidos, Reportes y Caja calculaban cada uno sus totales en el
-- navegador, con su propia consulta y su propia suma. Cuando algo fallaba se
-- arreglaba en una pantalla y seguía vivo en otra: el corte de 1000 filas de
-- PostgREST mordió al Dashboard (17-sep), a Pedidos (22-sep) y seguía en
-- Reportes (27-sep). Tres iteraciones por la misma falla.
--
-- Ahora la base suma y las pantallas solo pintan. Dos pantallas que piden el
-- mismo periodo reciben el MISMO número por construcción, y no hay tope de
-- filas porque lo que viaja son totales, no ventas.
--
-- REGLAS (las mismas en todas partes)
--   * Periodo semiabierto [p_desde, p_hasta). p_hasta NULL = hasta ahora (los
--     periodos que llegan a hoy no deben congelar un "ahora").
--   * Las ventas CANCELADAS no suman ni cuentan como ticket; se reportan
--     aparte en `canceladas`.
--   * Las cubetas se arman en hora de México (America/Mexico_City), que es la
--     de las dos sucursales y la de los dispositivos.
--   * `por_sucursal` ignora p_sucursal a propósito: es el comparativo.
--   * SECURITY INVOKER: respeta la RLS de quien consulta.
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS ventas_fecha_idx            ON ventas(fecha);
CREATE INDEX IF NOT EXISTS venta_detalles_venta_id_idx ON venta_detalles(venta_id);

CREATE OR REPLACE FUNCTION resumen_ventas(
  p_desde    timestamptz,
  p_hasta    timestamptz DEFAULT NULL,
  p_sucursal uuid        DEFAULT NULL,
  p_grano    text        DEFAULT 'dia'      -- 'hora' | 'dia' | 'mes'
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH
todas AS (
  SELECT v.*
    FROM ventas v
   WHERE (p_desde IS NULL OR v.fecha >= p_desde)
     AND (p_hasta IS NULL OR v.fecha <  p_hasta)
),
v AS (SELECT * FROM todas WHERE estado <> 'cancelada'),
vf AS (SELECT * FROM v WHERE p_sucursal IS NULL OR sucursal_id = p_sucursal),
det AS (
  SELECT d.venta_id, d.producto_id, d.cantidad, d.precio_unitario, v.sucursal_id,
         (p_sucursal IS NULL OR v.sucursal_id = p_sucursal) AS en_filtro
    FROM venta_detalles d JOIN v ON v.id = d.venta_id
),
cub AS (
  SELECT CASE p_grano
           WHEN 'hora' THEN extract(hour FROM fecha AT TIME ZONE 'America/Mexico_City')::int::text
           WHEN 'mes'  THEN to_char(fecha AT TIME ZONE 'America/Mexico_City', 'YYYY-MM')
           ELSE             to_char(fecha AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD')
         END AS clave,
         total
    FROM vf
)
SELECT jsonb_build_object(
  'total',          COALESCE((SELECT sum(total)              FROM vf), 0),
  'tickets',        (SELECT count(*)                          FROM vf),
  'efectivo',       COALESCE((SELECT sum(pago_efectivo)      FROM vf), 0),
  'tarjeta',        COALESCE((SELECT sum(pago_tarjeta)       FROM vf), 0),
  'transferencia',  COALESCE((SELECT sum(pago_transferencia) FROM vf), 0),
  'piezas',         COALESCE((SELECT sum(cantidad) FROM det WHERE en_filtro), 0),
  'canceladas',     (SELECT count(*) FROM todas
                      WHERE estado = 'cancelada'
                        AND (p_sucursal IS NULL OR sucursal_id = p_sucursal)),
  'sin_sucursal',   (SELECT count(*) FROM v WHERE sucursal_id IS NULL),
  'fuera_de_corte', (SELECT jsonb_build_object(
                        'tickets',  count(*),
                        'total',    COALESCE(sum(total), 0),
                        'efectivo', COALESCE(sum(pago_efectivo), 0))
                       FROM vf WHERE sesion_caja_id IS NULL),
  'por_cubeta',     COALESCE((SELECT jsonb_agg(jsonb_build_object('clave', clave, 'total', t, 'tickets', n) ORDER BY clave)
                       FROM (SELECT clave, sum(total) t, count(*) n FROM cub GROUP BY clave) x), '[]'::jsonb),
  'por_sucursal',   COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'sucursal_id', s.sucursal_id, 'total', s.t, 'tickets', s.n,
                         'piezas', COALESCE((SELECT sum(cantidad) FROM det WHERE det.sucursal_id IS NOT DISTINCT FROM s.sucursal_id), 0)))
                       FROM (SELECT sucursal_id, sum(total) t, count(*) n FROM v GROUP BY sucursal_id) s), '[]'::jsonb),
  'por_sesion',     COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'sesion_caja_id', sesion_caja_id, 'tickets', n,
                         'efectivo', ef, 'tarjeta', tar, 'transferencia', tra))
                       FROM (SELECT sesion_caja_id, count(*) n, sum(pago_efectivo) ef,
                                    sum(pago_tarjeta) tar, sum(pago_transferencia) tra
                               FROM vf WHERE sesion_caja_id IS NOT NULL GROUP BY sesion_caja_id) s), '[]'::jsonb),
  'por_producto',   COALESCE((SELECT jsonb_agg(jsonb_build_object(
                         'producto_id', producto_id, 'unidades', u, 'ingresos', i))
                       FROM (SELECT producto_id, sum(cantidad) u, sum(cantidad * precio_unitario) i
                               FROM det WHERE en_filtro GROUP BY producto_id) p), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION resumen_ventas(timestamptz, timestamptz, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION resumen_ventas(timestamptz, timestamptz, uuid, text) TO authenticated, service_role;
