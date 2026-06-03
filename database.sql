-- Script de Base de Datos para Punto de Venta (Plásticos) en Supabase (PostgreSQL)

-- Habilitar extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Habilitar pgcrypto para hashing bcrypt de PINs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- TABLA: productos
-- ==========================================
CREATE TABLE IF NOT EXISTS productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255) NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL, 
    categoria VARCHAR(100) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL CHECK (precio >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLA: usuarios_perfiles (Roles y Gafete)
-- ==========================================
CREATE TABLE IF NOT EXISTS usuarios_perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN ('admin', 'empleado')),
    codigo_gafete VARCHAR(100) UNIQUE, -- Código de barras del gafete físico
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLA PRIVADA: usuarios_credenciales (PINs de Seguridad)
-- ==========================================
CREATE TABLE IF NOT EXISTS usuarios_credenciales (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios_perfiles(id) ON DELETE CASCADE,
    pin_seguridad TEXT NOT NULL,             -- bcrypt hash (60 chars), nunca texto plano
    pin_debe_cambiar BOOLEAN NOT NULL DEFAULT true, -- true = forzar cambio en primer uso
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLA: sesiones_caja (Apertura y Corte)
-- ==========================================
CREATE TABLE IF NOT EXISTS sesiones_caja (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios_perfiles(id),
    fecha_apertura TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre TIMESTAMP WITH TIME ZONE,
    fondo_inicial DECIMAL(10, 2) NOT NULL DEFAULT 0,
    efectivo_declarado DECIMAL(10, 2),
    tarjeta_declarado DECIMAL(10, 2),
    transferencia_declarado DECIMAL(10, 2),
    observaciones TEXT, -- Notas sobre caja chica
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada'))
);

-- ==========================================
-- TABLA: registro_asistencia (Reloj Checador)
-- ==========================================
CREATE TABLE IF NOT EXISTS registro_asistencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios_perfiles(id),
    fecha_entrada TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    fecha_salida TIMESTAMP WITH TIME ZONE,
    estado VARCHAR(20) NOT NULL DEFAULT 'trabajando' CHECK (estado IN ('trabajando', 'completado'))
);

-- ==========================================
-- TABLA: ventas
-- ==========================================
CREATE TABLE IF NOT EXISTS ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    pago_efectivo DECIMAL(10, 2) DEFAULT 0 CHECK (pago_efectivo >= 0),
    pago_tarjeta DECIMAL(10, 2) DEFAULT 0 CHECK (pago_tarjeta >= 0),
    pago_transferencia DECIMAL(10, 2) DEFAULT 0 CHECK (pago_transferencia >= 0),
    user_id UUID REFERENCES auth.users(id),
    sesion_caja_id UUID REFERENCES sesiones_caja(id),
    fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLA: venta_detalles
-- ==========================================
CREATE TABLE IF NOT EXISTS venta_detalles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL CHECK (precio_unitario >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- SEGURIDAD (RLS - Row Level Security)
-- ==========================================

-- Habilitar RLS en todas las tablas públicas
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_asistencia ENABLE ROW LEVEL SECURITY;

-- La tabla de credenciales NO habilita RLS, pero al no tener políticas, nadie desde la API cliente puede leerla
ALTER TABLE usuarios_credenciales ENABLE ROW LEVEL SECURITY;
-- No definimos políticas para usuarios_credenciales, por ende, el acceso externo está bloqueado por defecto.

-- ==========================================
-- SEGURIDAD: Función Helper para evitar Recursión Infinita
-- ==========================================
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.usuarios_perfiles 
    WHERE id = auth.uid() AND rol = 'admin'
  );
END;
$$ LANGUAGE plpgsql;

-- 1. Políticas para Productos
DROP POLICY IF EXISTS "Lectura de productos para autenticados" ON productos;
CREATE POLICY "Lectura de productos para autenticados" 
    ON productos FOR SELECT 
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Gestión de productos solo para administradores" ON productos;
CREATE POLICY "Gestión de productos solo para administradores" 
    ON productos FOR ALL 
    USING (public.es_admin());

-- 2. Políticas para Perfiles
DROP POLICY IF EXISTS "Lectura de perfiles para autenticados" ON usuarios_perfiles;
CREATE POLICY "Lectura de perfiles para autenticados" 
    ON usuarios_perfiles FOR SELECT 
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Gestión de perfiles solo para administradores" ON usuarios_perfiles;
CREATE POLICY "Gestión de perfiles solo para administradores" 
    ON usuarios_perfiles FOR ALL 
    USING (public.es_admin());

-- 3. Políticas para Ventas y Detalles
DROP POLICY IF EXISTS "Ventas para autenticados" ON ventas;
CREATE POLICY "Ventas para autenticados" 
    ON ventas FOR ALL 
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Detalles de venta para autenticados" ON venta_detalles;
CREATE POLICY "Detalles de venta para autenticados" 
    ON venta_detalles FOR ALL 
    USING (auth.role() = 'authenticated');

-- 4. Políticas para Caja (Los empleados operan lo suyo, admins operan todo)
DROP POLICY IF EXISTS "Sesiones de caja individuales y admin" ON sesiones_caja;
CREATE POLICY "Sesiones de caja individuales y admin" 
    ON sesiones_caja FOR ALL 
    USING (usuario_id = auth.uid() OR public.es_admin());

-- 5. Políticas para Asistencia (Los empleados operan lo suyo, admins operan todo)
DROP POLICY IF EXISTS "Registros de asistencia individuales y admin" ON registro_asistencia;
CREATE POLICY "Registros de asistencia individuales y admin" 
    ON registro_asistencia FOR ALL 
    USING (usuario_id = auth.uid() OR public.es_admin());

-- ==========================================
-- TRIGGERS Y FUNCIONES
-- ==========================================

-- Función para actualizar el `updated_at` automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_productos_updated_at
    BEFORE UPDATE ON productos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==========================================
-- TABLA: movimientos_inventario (Historial de cambios de stock)
-- ==========================================
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    nombre_producto VARCHAR(255) NOT NULL,   -- snapshot del nombre al momento del movimiento
    tipo VARCHAR(30) NOT NULL
        CHECK (tipo IN ('entrada', 'salida_venta', 'ajuste', 'inicial')),
    cantidad INTEGER NOT NULL,               -- delta: positivo = ganancia, negativo = salida
    stock_anterior INTEGER NOT NULL,
    stock_nuevo INTEGER NOT NULL,
    notas TEXT,
    usuario_id UUID REFERENCES usuarios_perfiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura de movimientos para autenticados"
    ON movimientos_inventario FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Inserción de movimientos para autenticados"
    ON movimientos_inventario FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Función para descontar el stock al realizar una venta y registrar el movimiento
CREATE OR REPLACE FUNCTION descontar_stock()
RETURNS TRIGGER AS $$
DECLARE
    stock_actual INTEGER;
    nombre_prod VARCHAR;
BEGIN
    SELECT stock, nombre INTO stock_actual, nombre_prod FROM productos WHERE id = NEW.producto_id;

    IF stock_actual < NEW.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para el producto % (Disponible: %, Requerido: %)',
            nombre_prod, stock_actual, NEW.cantidad;
    END IF;

    UPDATE productos SET stock = stock - NEW.cantidad WHERE id = NEW.producto_id;

    -- Registrar movimiento de salida por venta automáticamente
    INSERT INTO movimientos_inventario
        (producto_id, nombre_producto, tipo, cantidad, stock_anterior, stock_nuevo, notas, usuario_id)
    VALUES
        (NEW.producto_id, nombre_prod, 'salida_venta', -NEW.cantidad,
         stock_actual, stock_actual - NEW.cantidad, 'Salida por venta', auth.uid());

    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER trigger_descontar_stock
    BEFORE INSERT ON venta_detalles
    FOR EACH ROW
    EXECUTE FUNCTION descontar_stock();

-- RPC: Validación segura de PIN de Administrador usando comparación bcrypt y fallback a texto plano
CREATE OR REPLACE FUNCTION verificar_pin_admin(pin_ingresado VARCHAR)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM usuarios_perfiles p
        JOIN usuarios_credenciales c ON p.id = c.usuario_id
        WHERE p.rol = 'admin'
          AND (c.pin_seguridad = pin_ingresado OR crypt(pin_ingresado, c.pin_seguridad) = c.pin_seguridad)
    );
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- CÓDIGO DE AUTORIZACIÓN ADMIN ROTATIVO (TOTP, cambia cada 30 s)
-- ------------------------------------------------------------------
-- Reemplaza al PIN fijo para autorizar acciones sensibles (p.ej. quitar un
-- producto de la venta en curso). El admin ve el código en su perfil y se lo
-- dicta al empleado; cambia cada 30 s, así que aunque alguien lo vea, caduca.
-- Ver scripts/totp_admin.sql para aplicarlo de forma independiente en Supabase.
-- ==========================================

-- Tabla con el secreto TOTP (una sola fila). Sin políticas RLS => nadie lee
-- directamente; solo las funciones SECURITY DEFINER lo usan.
CREATE TABLE IF NOT EXISTS configuracion_seguridad (
    id          smallint PRIMARY KEY DEFAULT 1,
    totp_secret bytea NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solo_una_fila CHECK (id = 1)
);
ALTER TABLE configuracion_seguridad ENABLE ROW LEVEL SECURITY;

INSERT INTO configuracion_seguridad (id, totp_secret)
VALUES (1, gen_random_bytes(20))
ON CONFLICT (id) DO NOTHING;

-- Genera el código TOTP de 6 dígitos para un "paso" de tiempo dado (RFC 6238).
CREATE OR REPLACE FUNCTION _totp_codigo(secreto bytea, paso bigint)
RETURNS text AS $$
DECLARE
    hash        bytea;
    offset_byte int;
    bin_code    bigint;
BEGIN
    hash := hmac(int8send(paso), secreto, 'sha1');
    offset_byte := get_byte(hash, 19) & 15;
    bin_code := ((get_byte(hash, offset_byte)     & 127)::bigint << 24)
              | ((get_byte(hash, offset_byte + 1) & 255)::bigint << 16)
              | ((get_byte(hash, offset_byte + 2) & 255)::bigint << 8)
              |  (get_byte(hash, offset_byte + 3) & 255)::bigint;
    RETURN lpad((bin_code % 1000000)::text, 6, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Devuelve el código actual + segundos restantes. SOLO administradores.
CREATE OR REPLACE FUNCTION obtener_codigo_admin_actual()
RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
    secreto      bytea;
    epoch_actual bigint;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuarios_perfiles WHERE id = auth.uid() AND rol = 'admin'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No autorizado');
    END IF;

    SELECT totp_secret INTO secreto FROM configuracion_seguridad WHERE id = 1;
    IF secreto IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'No configurado');
    END IF;

    epoch_actual := floor(extract(epoch FROM now()))::bigint;
    RETURN jsonb_build_object(
        'ok', true,
        'codigo', _totp_codigo(secreto, epoch_actual / 30),
        'segundos_restantes', 30 - (epoch_actual % 30)
    );
END;
$$ LANGUAGE plpgsql;

-- Verifica el código ingresado por un empleado (tolerancia ±30 s). Solo boolean.
CREATE OR REPLACE FUNCTION verificar_codigo_admin(codigo_ingresado text)
RETURNS boolean SECURITY DEFINER AS $$
DECLARE
    secreto bytea;
    paso    bigint;
BEGIN
    SELECT totp_secret INTO secreto FROM configuracion_seguridad WHERE id = 1;
    IF secreto IS NULL OR codigo_ingresado IS NULL THEN
        RETURN false;
    END IF;

    paso := floor(extract(epoch FROM now()))::bigint / 30;
    RETURN codigo_ingresado IN (
        _totp_codigo(secreto, paso - 1),
        _totp_codigo(secreto, paso),
        _totp_codigo(secreto, paso + 1)
    );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION obtener_codigo_admin_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION verificar_codigo_admin(text)  TO authenticated;

-- Trigger para automatizar la creación de perfiles cuando se crea un usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    nombre_inicial VARCHAR;
BEGIN
    nombre_inicial := COALESCE(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1));

    -- El rol SIEMPRE es 'empleado' al crearse; nunca se lee de los metadatos del cliente.
    -- Solo un admin puede promover a otro admin mediante UPDATE en usuarios_perfiles (protegido por RLS).
    INSERT INTO public.usuarios_perfiles (id, nombre_completo, rol, codigo_gafete)
    VALUES (
        new.id,
        nombre_inicial,
        'empleado',
        'GAF-' || substring(new.id::text, 1, 8)
    );

    -- PIN por defecto '1234' almacenado como hash bcrypt.
    -- pin_debe_cambiar = true obliga al usuario a cambiarlo antes de poder operar.
    INSERT INTO public.usuarios_credenciales (usuario_id, pin_seguridad, pin_debe_cambiar)
    VALUES (new.id, crypt('1234', gen_salt('bf', 10)), true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- RPC: GESTIÓN SEGURA DE PIN
-- ==========================================

-- Consulta si el PIN del usuario autenticado debe ser cambiado.
-- La app llama esto tras el login para decidir si mostrar el flujo de cambio de PIN.
CREATE OR REPLACE FUNCTION pin_necesita_cambio()
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN (
        SELECT pin_debe_cambiar
        FROM usuarios_credenciales
        WHERE usuario_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql;

-- Cambia el PIN del usuario autenticado.
-- Valida el PIN actual, rechaza PINs triviales y almacena el nuevo como hash bcrypt.
CREATE OR REPLACE FUNCTION cambiar_pin(pin_actual VARCHAR, pin_nuevo VARCHAR)
RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    hash_actual TEXT;
    pines_triviales TEXT[] := ARRAY[
        '1234','0000','1111','2222','3333','4444',
        '5555','6666','7777','8888','9999',
        '123456','000000','111111','123123'
    ];
BEGIN
    -- Validar longitud mínima
    IF length(pin_nuevo) < 4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El PIN debe tener al menos 4 dígitos.');
    END IF;

    -- Rechazar PINs triviales
    IF pin_nuevo = ANY(pines_triviales) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El PIN es demasiado simple. Elige uno diferente.');
    END IF;

    -- Recuperar el hash actual del usuario autenticado
    SELECT pin_seguridad INTO hash_actual
    FROM usuarios_credenciales
    WHERE usuario_id = auth.uid();

    IF hash_actual IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Credenciales no encontradas.');
    END IF;

    -- Verificar PIN actual con bcrypt
    IF crypt(pin_actual, hash_actual) <> hash_actual THEN
        RETURN jsonb_build_object('ok', false, 'error', 'PIN actual incorrecto.');
    END IF;

    -- Guardar nuevo hash y marcar como cambiado
    UPDATE usuarios_credenciales
    SET pin_seguridad    = crypt(pin_nuevo, gen_salt('bf', 10)),
        pin_debe_cambiar = false,
        updated_at       = CURRENT_TIMESTAMP
    WHERE usuario_id = auth.uid();

    RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- RPC: REGISTRAR VENTA SEGURA
-- ==========================================
CREATE OR REPLACE FUNCTION registrar_venta(
    pago_efectivo DECIMAL,
    pago_tarjeta DECIMAL,
    pago_transferencia DECIMAL,
    productos_json JSONB
) RETURNS JSONB SECURITY DEFINER AS $$
DECLARE
    v_total DECIMAL := 0;
    v_venta_id UUID;
    v_sesion_caja_id UUID;
    v_item JSONB;
    v_producto RECORD;
    v_precio_real DECIMAL;
BEGIN
    -- 1. Obtener la sesión de caja abierta del usuario
    SELECT id INTO v_sesion_caja_id
    FROM sesiones_caja
    WHERE usuario_id = auth.uid() AND estado = 'abierta'
    LIMIT 1;

    -- Si no hay caja y es empleado, fallar
    IF v_sesion_caja_id IS NULL THEN
        IF NOT EXISTS (SELECT 1 FROM usuarios_perfiles WHERE id = auth.uid() AND rol = 'admin') THEN
            RETURN jsonb_build_object('ok', false, 'error', 'No tienes una caja abierta.');
        END IF;
    END IF;

    -- 2. Calcular el total real basado en los precios de la BD
    FOR v_item IN SELECT * FROM jsonb_array_elements(productos_json)
    LOOP
        SELECT * INTO v_producto FROM productos WHERE id = (v_item->>'id')::uuid;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado: ' || (v_item->>'id'));
        END IF;

        v_precio_real := v_producto.precio;
        v_total := v_total + (v_precio_real * (v_item->>'cantidad')::int);
    END LOOP;

    -- 3. Crear la venta
    INSERT INTO ventas (total, pago_efectivo, pago_tarjeta, pago_transferencia, user_id, sesion_caja_id)
    VALUES (v_total, pago_efectivo, pago_tarjeta, pago_transferencia, auth.uid(), v_sesion_caja_id)
    RETURNING id INTO v_venta_id;

    -- 4. Insertar detalles (el trigger descontar_stock se encargará del inventario)
    FOR v_item IN SELECT * FROM jsonb_array_elements(productos_json)
    LOOP
        SELECT precio INTO v_precio_real FROM productos WHERE id = (v_item->>'id')::uuid;
        
        BEGIN
            INSERT INTO venta_detalles (venta_id, producto_id, cantidad, precio_unitario)
            VALUES (v_venta_id, (v_item->>'id')::uuid, (v_item->>'cantidad')::int, v_precio_real);
        EXCEPTION WHEN OTHERS THEN
            -- Si falla el trigger de stock, revertimos todo lanzando excepción o devolviendo error amigable.
            -- Devolver error amigable requiere ROLLBACK, pero PostgreSQL no permite ROLLBACK dentro de un bloque BEGIN normal 
            -- sin abortar la transacción externa, a menos que capturemos y retornemos.
            -- En realidad, como hay inserts previos, es mejor lanzar RAISE EXCEPTION para que toda la llamada a RPC haga rollback.
            RAISE EXCEPTION '%', SQLERRM;
        END;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'venta_id', v_venta_id);
EXCEPTION WHEN OTHERS THEN
    -- Atrapar la excepción elevada en el bloque interior o cualquier otra
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- TABLA: pedidos_programados
-- ==========================================
CREATE TABLE IF NOT EXISTS pedidos_programados (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios_perfiles(id),
    cliente_nombre VARCHAR(255),
    cliente_contacto VARCHAR(100),
    fecha_entrega DATE NOT NULL,
    hora_entrega TIME,
    notas TEXT,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'listo', 'entregado', 'cancelado')),
    total DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    -- Pago del pedido (puede registrarse en el momento o después)
    pago_efectivo      DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (pago_efectivo >= 0),
    pago_tarjeta       DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (pago_tarjeta >= 0),
    pago_transferencia DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (pago_transferencia >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================
-- TABLA: pedido_items
-- ==========================================
CREATE TABLE IF NOT EXISTS pedido_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pedido_id UUID NOT NULL REFERENCES pedidos_programados(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id) ON DELETE SET NULL,
    nombre_producto VARCHAR(255) NOT NULL,
    cantidad INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL CHECK (precio_unitario >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS para pedidos programados
ALTER TABLE pedidos_programados ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

-- Empleados ven/gestionan los suyos; admin ve todos
DROP POLICY IF EXISTS "Pedidos propios y admin" ON pedidos_programados;
CREATE POLICY "Pedidos propios y admin"
    ON pedidos_programados FOR ALL
    USING (
        usuario_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM usuarios_perfiles
            WHERE id = auth.uid() AND rol = 'admin'
        )
    );

-- Items heredan el acceso del pedido padre
DROP POLICY IF EXISTS "Items de pedidos autorizados" ON pedido_items;
CREATE POLICY "Items de pedidos autorizados"
    ON pedido_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM pedidos_programados p
            WHERE p.id = pedido_id AND (
                p.usuario_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM usuarios_perfiles
                    WHERE id = auth.uid() AND rol = 'admin'
                )
            )
        )
    );
