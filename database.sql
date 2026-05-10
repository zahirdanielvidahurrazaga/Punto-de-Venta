-- Script de Base de Datos para Punto de Venta (Plásticos) en Supabase (PostgreSQL)

-- Habilitar extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
-- TABLA: usuarios_perfiles (Roles y PIN)
-- ==========================================
CREATE TABLE IF NOT EXISTS usuarios_perfiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(255) NOT NULL,
    rol VARCHAR(50) NOT NULL CHECK (rol IN ('admin', 'empleado')),
    pin_seguridad VARCHAR(6), -- PIN para autorizaciones (solo admins)
    codigo_gafete VARCHAR(100) UNIQUE, -- Código de barras del gafete físico
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- Habilitar RLS en todas las tablas
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE venta_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_caja ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro_asistencia ENABLE ROW LEVEL SECURITY;

-- Políticas para Productos (Lectura a todos los autenticados, Escritura solo admin)
CREATE POLICY "Permitir lectura de productos a todos" ON productos FOR SELECT USING (auth.role() = 'authenticated');
-- OJO: Idealmente usaríamos una función para checar si es admin, por simplicidad permitimos a todos modificar por ahora, o crear RPC.
CREATE POLICY "Permitir gestión de productos a autenticados" ON productos FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para Perfiles (Cada usuario lee el suyo, admins leen todos)
CREATE POLICY "Leer perfil propio" ON usuarios_perfiles FOR SELECT USING (auth.uid() = id);

-- Políticas para Ventas (Autenticados pueden insertar y leer)
CREATE POLICY "Permitir ventas a autenticados" ON ventas FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para Detalles de Venta 
CREATE POLICY "Permitir detalles de venta a autenticados" ON venta_detalles FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para Caja y Asistencia
CREATE POLICY "Caja y asistencia a autenticados" ON sesiones_caja FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Asistencia a autenticados" ON registro_asistencia FOR ALL USING (auth.role() = 'authenticated');


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

-- Función para descontar el stock al realizar una venta
CREATE OR REPLACE FUNCTION descontar_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE productos
    SET stock = stock - NEW.cantidad
    WHERE id = NEW.producto_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER trigger_descontar_stock
    AFTER INSERT ON venta_detalles
    FOR EACH ROW
    EXECUTE FUNCTION descontar_stock();
