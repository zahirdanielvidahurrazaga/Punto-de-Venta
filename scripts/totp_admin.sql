-- ============================================================================
-- CÓDIGO DE AUTORIZACIÓN ADMIN ROTATIVO (TOTP, cambia cada 30 segundos)
-- ----------------------------------------------------------------------------
-- Reemplaza el PIN fijo de administrador por un código dinámico de 6 dígitos
-- (estilo Google Authenticator / token bancario) que cambia cada 30 segundos.
-- El admin lo ve en su perfil (Ajustes) y se lo dicta al empleado en el momento.
--
-- Cómo aplicar: pega y ejecuta este archivo completo en el SQL Editor de Supabase.
-- Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================================

-- pgcrypto provee hmac() y gen_random_bytes(); ya debería estar habilitado.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tabla con el secreto TOTP. Una sola fila. Sin políticas RLS => nadie puede
-- leerlo directamente; solo las funciones SECURITY DEFINER de abajo lo usan.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion_seguridad (
    id          smallint PRIMARY KEY DEFAULT 1,
    totp_secret bytea NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT solo_una_fila CHECK (id = 1)
);

ALTER TABLE configuracion_seguridad ENABLE ROW LEVEL SECURITY;

-- Genera un secreto aleatorio de 20 bytes la primera vez. No lo sobreescribe
-- en ejecuciones posteriores para no invalidar códigos en uso.
INSERT INTO configuracion_seguridad (id, totp_secret)
VALUES (1, gen_random_bytes(20))
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Genera el código TOTP de 6 dígitos para un "paso" de tiempo dado (RFC 6238).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _totp_codigo(secreto bytea, paso bigint)
RETURNS text AS $$
DECLARE
    hash        bytea;
    offset_byte int;
    bin_code    bigint;
BEGIN
    -- HMAC-SHA1 del contador (8 bytes, big-endian) con el secreto
    hash := hmac(int8send(paso), secreto, 'sha1');
    -- Truncamiento dinámico: los últimos 4 bits del byte 19 dan el offset
    offset_byte := get_byte(hash, 19) & 15;
    bin_code := ((get_byte(hash, offset_byte)     & 127)::bigint << 24)
              | ((get_byte(hash, offset_byte + 1) & 255)::bigint << 16)
              | ((get_byte(hash, offset_byte + 2) & 255)::bigint << 8)
              |  (get_byte(hash, offset_byte + 3) & 255)::bigint;
    RETURN lpad((bin_code % 1000000)::text, 6, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ----------------------------------------------------------------------------
-- Devuelve el código actual y los segundos restantes. SOLO administradores.
-- La app lo llama desde el perfil del admin para mostrar el código que rota.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_codigo_admin_actual()
RETURNS jsonb SECURITY DEFINER AS $$
DECLARE
    secreto      bytea;
    epoch_actual bigint;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM usuarios_perfiles
        WHERE id = auth.uid() AND rol = 'admin'
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

-- ----------------------------------------------------------------------------
-- Verifica un código ingresado por un empleado. Acepta el paso actual y los
-- adyacentes (±30s) para tolerar pequeños desfases de reloj. Solo boolean,
-- nunca expone el código en sí.
-- ----------------------------------------------------------------------------
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

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION obtener_codigo_admin_actual()        TO authenticated;
GRANT EXECUTE ON FUNCTION verificar_codigo_admin(text)         TO authenticated;
