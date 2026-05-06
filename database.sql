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
-- TABLA: ventas
-- ==========================================
CREATE TABLE IF NOT EXISTS ventas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    user_id UUID DEFAULT auth.uid(), -- Referencia al usuario de Supabase
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

-- Políticas para Productos (Lectura pública, Escritura autenticada)
CREATE POLICY "Permitir lectura de productos a todos" ON productos FOR SELECT USING (true);
CREATE POLICY "Permitir gestión de productos a autenticados" ON productos FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para Ventas (Solo lectura y creación por usuario autenticado)
CREATE POLICY "Permitir ventas a autenticados" ON ventas FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para Detalles de Venta (Solo lectura y creación por usuario autenticado)
CREATE POLICY "Permitir detalles de venta a autenticados" ON venta_detalles FOR ALL USING (auth.role() = 'authenticated');

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

CREATE TRIGGER update_productos_updated_at
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

CREATE TRIGGER trigger_descontar_stock
    AFTER INSERT ON venta_detalles
    FOR EACH ROW
    EXECUTE FUNCTION descontar_stock();

-- ==========================================
-- DATOS MOCK INICIALES (Opcional)
-- ==========================================
-- INSERT INTO productos (nombre, sku, categoria, precio, stock) VALUES
-- ('Bolsa Plástico 1kg', '7501234560011', 'Bolsas', 2.50, 500),
-- ('Vaso Plástico 12oz', '7501234560035', 'Vasos', 1.20, 1200),
-- ('Contenedor Medio Litro', '7501234560066', 'Contenedores', 5.00, 200),
-- ('Rollo Fleje Plástico', '7501234560080', 'Empaque', 150.00, 20)
-- ON CONFLICT (sku) DO NOTHING;

