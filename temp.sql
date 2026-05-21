CREATE OR REPLACE FUNCTION get_test_creds()
RETURNS JSONB SECURITY DEFINER AS $$
BEGIN
    RETURN (SELECT jsonb_agg(row_to_json(t)) FROM usuarios_credenciales t);
END;
$$ LANGUAGE plpgsql;
