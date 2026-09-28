import { useEffect, useRef, useState } from 'react';
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

  // Cada vez que la app vuelve del segundo plano se tira el canal y se arma
  // uno nuevo (sube la generación), y se avisa a la vista con `resync` para
  // que se ponga al día con lo que pasó mientras dormía.
  //
  // Por qué: en el iPhone la app NO se recarga, se queda en memoria días
  // enteros. Mientras está en segundo plano iOS congela el WebView y el
  // websocket de realtime muere; al volver, los eventos de ese hueco no se
  // reenvían NUNCA. Dashboard y Pedidos solo se enteraban de lo nuevo por
  // realtime, así que en la app enseñaban números viejos (en la web no se
  // notaba porque la pestaña se recarga seguido). 27-sep-2026.
  const [generacion, setGeneracion] = useState(0);
  useEffect(() => {
    if (!activo) return;
    let ocultaDesde = document.visibilityState === 'hidden' ? Date.now() : null;
    const despertar = async () => {
      // Tras horas dormida el token de sesión ya venció: getSession() lo
      // renueva antes de pedir datos, si no la primera consulta sale en 401.
      try { await supabase.auth.getSession(); } catch { /* sin red: lo intentará el canal */ }
      setGeneracion(g => g + 1);
      onChangeRef.current?.([{ resync: true }]);
    };
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') { ocultaDesde = Date.now(); return; }
      // Un parpadeo (abrir el centro de control) no amerita recargar.
      if (ocultaDesde && Date.now() - ocultaDesde > 5000) despertar();
      ocultaDesde = null;
    };
    document.addEventListener('visibilitychange', alCambiar);
    window.addEventListener('online', despertar);
    return () => {
      document.removeEventListener('visibilitychange', alCambiar);
      window.removeEventListener('online', despertar);
    };
  }, [activo]);

  useEffect(() => {
    if (!activo) return;

    const lista = JSON.parse(firma).filter(s => s.tabla);
    if (lista.length === 0) return;

    const canal = supabase.channel(`pos-rt-${++canalSeq}`);
    let timer = null;
    let reintento = null;
    let cayo = false;
    let pendientes = [];

    // La vista recibe los cambios agrupados (con `eventType`, `new` y `old`)
    // por si quiere refrescar solo las filas tocadas.
    const disparar = (payload) => {
      pendientes.push(payload);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const lote = pendientes;
        pendientes = [];
        onChangeRef.current?.(lote);
      }, espera);
    };

    for (const { tabla, filtro, evento } of lista) {
      canal.on(
        'postgres_changes',
        { event: evento || '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        disparar
      );
    }

    // Si el canal se cae (token vencido, red), se rearma solo; al volver a
    // conectar se pide un `resync` porque los eventos del hueco se perdieron.
    canal.subscribe((estado) => {
      if (estado === 'SUBSCRIBED') {
        if (cayo) onChangeRef.current?.([{ resync: true }]);
        cayo = false;
      } else if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
        cayo = true;
        clearTimeout(reintento);
        reintento = setTimeout(() => setGeneracion(g => g + 1), 5000);
      }
    });

    return () => {
      clearTimeout(timer);
      clearTimeout(reintento);
      supabase.removeChannel(canal);
    };
  }, [firma, activo, espera, generacion]);
}

/** ¿El lote de cambios pide ponerse al día completo (volvió del segundo plano)? */
export const pideResync = (lote) => Array.isArray(lote) && lote.some(p => p?.resync);

/** Ids de las filas de `tabla` que llegaron ACTUALIZADAS (no insertadas) en el lote. */
export const idsActualizados = (lote, tabla) =>
  Array.isArray(lote)
    ? [...new Set(lote
        .filter(p => p?.eventType === 'UPDATE' && p.new?.id && (!tabla || p.table === tabla))
        .map(p => p.new.id))]
    : [];

export default useRealtime;
