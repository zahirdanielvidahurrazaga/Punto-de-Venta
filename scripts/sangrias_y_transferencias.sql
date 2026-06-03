-- ============================================================================
-- SANGRÍAS DE CAJA (retiros/depósitos) + TRANSFERENCIAS DE STOCK ENTRE SUCURSALES
-- Idempotente. Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Movimientos de caja: retiros y depósitos parciales durante el turno
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_caja (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sesion_caja_id uuid NOT NULL REFERENCES sesiones_caja(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES usuarios_perfiles(id),
  sucursal_id uuid REFERENCES sucursales(id),
  tipo varchar(20) NOT NULL CHECK (tipo IN ('retiro', 'deposito')),
  monto numeric(10,2) NOT NULL CHECK (monto > 0),
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE movimientos_caja ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Movimientos de caja propios y admin" ON movimientos_caja;
CREATE POLICY "Movimientos de caja propios y admin"
  ON movimientos_caja FOR ALL
  USING (usuario_id = auth.uid() OR public.es_admin());

-- Registra un retiro o depósito sobre la caja abierta del usuario.
CREATE OR REPLACE FUNCTION registrar_movimiento_caja(
  p_tipo text,
  p_monto numeric,
  p_motivo text DEFAULT NULL
) RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
  v_sesion uuid;
  v_sucursal uuid;
BEGIN
  IF p_tipo NOT IN ('retiro', 'deposito') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo inválido.');
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El monto debe ser mayor a cero.');
  END IF;

  SELECT id, sucursal_id INTO v_sesion, v_sucursal
  FROM sesiones_caja
  WHERE usuario_id = auth.uid() AND estado = 'abierta'
  ORDER BY fecha_apertura DESC LIMIT 1;

  IF v_sesion IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No tienes una caja abierta.');
  END IF;

  INSERT INTO movimientos_caja (sesion_caja_id, usuario_id, sucursal_id, tipo, monto, motivo)
  VALUES (v_sesion, auth.uid(), v_sucursal, p_tipo, p_monto, p_motivo);

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION registrar_movimiento_caja(text, numeric, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Transferencias de stock entre sucursales
-- ----------------------------------------------------------------------------
-- Ampliar los tipos válidos de movimiento de inventario
ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;
ALTER TABLE movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_tipo_check
  CHECK (tipo IN ('entrada', 'salida_venta', 'ajuste', 'inicial',
                  'salida_ruta', 'entrada_ruta',
                  'transferencia_entrada', 'transferencia_salida'));

-- Mueve stock de una sucursal a otra (solo admin). Registra dos movimientos.
CREATE OR REPLACE FUNCTION transferir_stock(
  p_producto uuid,
  p_origen uuid,
  p_destino uuid,
  p_cantidad integer,
  p_notas text DEFAULT NULL
) RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
  v_es_admin boolean;
  v_nombre varchar;
  v_origen_nom varchar;
  v_destino_nom varchar;
  v_so_ant int; v_so_new int;
  v_sd_ant int; v_sd_new int;
  v_nota text;
BEGIN
  SELECT rol = 'admin' INTO v_es_admin FROM usuarios_perfiles WHERE id = auth.uid();
  IF NOT COALESCE(v_es_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Solo un administrador puede transferir.');
  END IF;
  IF p_origen = p_destino THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Origen y destino deben ser distintos.');
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cantidad inválida.');
  END IF;

  SELECT nombre INTO v_nombre FROM productos WHERE id = p_producto;
  IF v_nombre IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado.');
  END IF;
  SELECT nombre INTO v_origen_nom FROM sucursales WHERE id = p_origen;
  SELECT nombre INTO v_destino_nom FROM sucursales WHERE id = p_destino;

  SELECT stock INTO v_so_ant FROM producto_stock
  WHERE producto_id = p_producto AND sucursal_id = p_origen;
  IF v_so_ant IS NULL THEN v_so_ant := 0; END IF;
  IF v_so_ant < p_cantidad THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Stock insuficiente en la sucursal de origen.');
  END IF;

  INSERT INTO producto_stock (producto_id, sucursal_id, stock)
  VALUES (p_producto, p_destino, 0) ON CONFLICT (producto_id, sucursal_id) DO NOTHING;
  SELECT stock INTO v_sd_ant FROM producto_stock
  WHERE producto_id = p_producto AND sucursal_id = p_destino;

  v_so_new := v_so_ant - p_cantidad;
  v_sd_new := v_sd_ant + p_cantidad;

  UPDATE producto_stock SET stock = v_so_new, updated_at = now()
  WHERE producto_id = p_producto AND sucursal_id = p_origen;
  UPDATE producto_stock SET stock = v_sd_new, updated_at = now()
  WHERE producto_id = p_producto AND sucursal_id = p_destino;

  v_nota := COALESCE(p_notas || ' · ', '') || 'Transferencia ' || v_origen_nom || ' -> ' || v_destino_nom;

  INSERT INTO movimientos_inventario
    (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id, sucursal_id)
  VALUES
    (p_producto, v_nombre, 'transferencia_salida', -p_cantidad, v_so_ant, v_so_new, v_nota, auth.uid(), p_origen),
    (p_producto, v_nombre, 'transferencia_entrada',  p_cantidad, v_sd_ant, v_sd_new, v_nota, auth.uid(), p_destino);

  PERFORM sincronizar_stock_legacy(p_producto);

  RETURN jsonb_build_object('ok', true, 'origen_nuevo', v_so_new, 'destino_nuevo', v_sd_new);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION transferir_stock(uuid, uuid, uuid, integer, text) TO authenticated;
