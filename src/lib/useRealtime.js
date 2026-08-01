import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

let canalSeq = 0;

/**
 * Suscribe la vista a cambios en una o varias tablas de Supabase y vuelve a
 * pedir los datos cuando algo cambia.
 *
 *   useRealtime('ventas', fetchVentas);
 *   useRealtime([{ tabla: 'producto_stock', filtro: `sucursal_id=eq.${id}` }], recargar);
 *
 * Las llamadas se agrupan: una venta dispara varios cambios de fila (ventas,
 * venta_detalles, producto_stock, movimientos_inventario) y no tiene sentido
 * releer el catálogo cuatro veces seguidas.
 *
 * OJO: la tabla debe estar en la publicación `supabase_realtime`, si no el
 * canal se conecta pero nunca llegan eventos.
 * Ver scripts/realtime_y_sucursal_caja.sql
 *
 * @param tablas   nombre de tabla, o { tabla, filtro?, evento? }, o un arreglo.
 * @param onChange qué hacer cuando cambia algo (normalmente el fetch de la vista).
 * @param opts     { activo = true, espera = 400 }
 */
export function useRealtime(tablas, onChange, opts = {}) {
  const { activo = true, espera = 400 } = opts;

  // Guardamos el callback en un ref para que cambiarlo en cada render no
  // vuelva a montar el canal.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; });

  // Firma estable de la suscripción: así el efecto solo se re-ejecuta cuando
  // de verdad cambian las tablas o los filtros.
  const specs = (Array.isArray(tablas) ? tablas : [tablas]).map(t =>
    typeof t === 'string' ? { tabla: t } : t
  );
  const firma = JSON.stringify(specs);

  useEffect(() => {
    if (!activo) return;

    const lista = JSON.parse(firma).filter(s => s.tabla);
    if (lista.length === 0) return;

    const canal = supabase.channel(`pos-rt-${++canalSeq}`);
    let timer = null;

    const disparar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current?.(), espera);
    };

    for (const { tabla, filtro, evento } of lista) {
      canal.on(
        'postgres_changes',
        { event: evento || '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        disparar
      );
    }

    canal.subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(canal);
    };
  }, [firma, activo, espera]);
}

export default useRealtime;
