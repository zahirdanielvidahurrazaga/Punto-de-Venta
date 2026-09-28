import { useEffect, useMemo, useState } from 'react';
import { X, Minus, Plus, Trash2, Search, Loader2, AlertTriangle, Ban, PencilLine, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { traerTodo } from '../lib/paginado';
import { precioUnitario } from '../lib/precios';
import { indexarProductos, buscarEnIndice } from '../lib/buscar';

// ─────────────────────────────────────────────────────────────────────────────
// Corregir o cancelar una venta ya cobrada (solo admin).
//
// La base hace el trabajo de verdad (`editar_venta` / `cancelar_venta`, ver
// scripts/folio_y_edicion_ventas.sql): valida que sea admin, mueve el stock
// por diferencia, reescribe las partidas y deja la bitácora. Esta pantalla
// solo arma la propuesta y enseña ANTES de guardar qué va a pasar: el total
// nuevo, cuánto hay que devolver o cobrar y cómo cambia el corte de caja.
//
// El precio que se enseña sigue la MISMA regla que la función:
//   * partida que no cambió → el precio al que se cobró;
//   * partida nueva o con otra cantidad → mayoreo/menudeo con el catálogo de hoy.
// ─────────────────────────────────────────────────────────────────────────────

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const MOTIVOS_EDICION = [
  'Se cobró un producto equivocado',
  'Cantidad mal capturada',
  'Devolución del cliente',
  'Forma de pago equivocada',
  'Otro',
];
const MOTIVOS_CANCELACION = [
  'Venta cobrada dos veces',
  'El cliente devolvió todo',
  'Venta de prueba',
  'Otro',
];

function lineaPrecio(linea) {
  const o = linea.original;
  if (o && o.cantidad === linea.cantidad) return Number(o.precio_unitario) || 0;
  return precioUnitario(linea.producto, linea.cantidad);
}

// Reparte el total nuevo respetando cómo se pagó: si fue un solo método, todo
// va ahí; si fue mixto, tarjeta y transferencia se quedan (hasta donde
// alcance) y el efectivo absorbe la diferencia.
function pagosSugeridos(pagosAntes, total) {
  const { efectivo = 0, tarjeta = 0, transferencia = 0 } = pagosAntes || {};
  const usados = [efectivo > 0, tarjeta > 0, transferencia > 0].filter(Boolean).length;
  if (usados <= 1) {
    if (tarjeta > 0)       return { efectivo: 0, tarjeta: r2(total), transferencia: 0 };
    if (transferencia > 0) return { efectivo: 0, tarjeta: 0, transferencia: r2(total) };
    return { efectivo: r2(total), tarjeta: 0, transferencia: 0 };
  }
  let tar = Math.min(tarjeta, total);
  let tra = Math.min(transferencia, total - tar);
  return { efectivo: r2(total - tar - tra), tarjeta: r2(tar), transferencia: r2(tra) };
}

export default function EditarVentaModal({ venta, items, modo = 'editar', onClose, onGuardado }) {
  const cancelar = modo === 'cancelar';

  // Una línea por producto (la base agrupa igual al guardar).
  const [lineas, setLineas] = useState(() => {
    const porProducto = new Map();
    for (const it of items) {
      const q = Number(it.quantity) || 0;
      const prev = porProducto.get(it.producto_id);
      if (prev) {
        prev.cantidad += q;
        prev.original.cantidad += q;
        prev.original.precio_unitario = Math.max(prev.original.precio_unitario, Number(it.precio_unitario) || 0);
      } else {
        porProducto.set(it.producto_id, {
          producto_id: it.producto_id,
          producto: it,                  // trae precio, precio_mayoreo, cantidad_mayoreo
          cantidad: q,
          original: { cantidad: q, precio_unitario: Number(it.precio_unitario) || 0 },
        });
      }
    }
    return [...porProducto.values()];
  });

  const [catalogo, setCatalogo] = useState([]);
  const [stock, setStock] = useState(new Map());
  const [busqueda, setBusqueda] = useState('');
  const [turno, setTurno] = useState(null);

  const [motivo, setMotivo] = useState('');
  const [detalle, setDetalle] = useState('');
  const [pagos, setPagos] = useState(null);         // null = siguen al total
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  // Catálogo + existencias de la sucursal de la VENTA (el stock regresa o sale de ahí).
  useEffect(() => {
    if (cancelar) return;
    let vivo = true;
    Promise.all([
      traerTodo(() => supabase.from('productos')
        .select('id, nombre, sku, categoria, precio, precio_mayoreo, cantidad_mayoreo, activo').order('sku')),
      venta.sucursal_id
        ? traerTodo(() => supabase.from('producto_stock').select('producto_id, stock')
            .eq('sucursal_id', venta.sucursal_id).order('producto_id'))
        : Promise.resolve({ filas: [] }),
    ]).then(([prods, st]) => {
      if (!vivo) return;
      setCatalogo((prods.filas || []).filter(p => p.activo !== false));
      setStock(new Map((st.filas || []).map(s => [s.producto_id, Number(s.stock) || 0])));
    }).catch(e => vivo && setError(`No se pudo cargar el catálogo: ${e.message}`));
    return () => { vivo = false; };
  }, [cancelar, venta.sucursal_id]);

  // ¿El turno de esta venta ya se cortó? Cambia lo que hay que advertir.
  useEffect(() => {
    if (!venta.sesion_caja_id) return;
    supabase.from('sesiones_caja')
      .select('estado, fecha_apertura, fecha_cierre, usuario_nombre, usuarios_perfiles(nombre_completo)')
      .eq('id', venta.sesion_caja_id).maybeSingle()
      .then(({ data }) => setTurno(data || null));
  }, [venta.sesion_caja_id]);

  const indice = useMemo(() => indexarProductos(catalogo), [catalogo]);
  const resultados = useMemo(
    () => (busqueda.trim() ? buscarEnIndice(indice, busqueda, 8) : []),
    [indice, busqueda]
  );

  const totalAntes = Number(venta.total) || 0;
  const totalNuevo = r2(lineas.reduce((a, l) => a + lineaPrecio(l) * l.cantidad, 0));
  const pagosFinal = pagos || pagosSugeridos(venta.pagos, totalNuevo);
  const sumaPagos  = r2(pagosFinal.efectivo + pagosFinal.tarjeta + pagosFinal.transferencia);
  const pagosCuadran = cancelar || sumaPagos === totalNuevo;
  const difTotal   = r2(totalNuevo - totalAntes);
  const difEfectivo = r2((cancelar ? 0 : pagosFinal.efectivo) - (venta.pagos?.efectivo || 0));

  // Piezas que se pueden usar: lo que hay en la sucursal + lo que esta misma
  // venta ya tenía apartado (regresa al corregir).
  const disponible = (productoId) => {
    const orig = lineas.find(l => l.producto_id === productoId)?.original?.cantidad || 0;
    return (stock.get(productoId) || 0) + orig;
  };
  const faltantes = lineas.filter(l => !cancelar && catalogo.length && l.cantidad > disponible(l.producto_id));

  const cambio = (id, nueva) => {
    setPagos(null);
    setLineas(ls => ls.map(l => l.producto_id === id ? { ...l, cantidad: Math.max(1, nueva) } : l));
  };
  const quitar = (id) => { setPagos(null); setLineas(ls => ls.filter(l => l.producto_id !== id)); };
  const agregar = (p) => {
    setPagos(null);
    setBusqueda('');
    setLineas(ls => ls.some(l => l.producto_id === p.id)
      ? ls.map(l => l.producto_id === p.id ? { ...l, cantidad: l.cantidad + 1 } : l)
      : [...ls, { producto_id: p.id, producto: p, cantidad: 1, original: null }]);
  };

  const productosOriginales = new Set(items.map(i => i.producto_id)).size;
  const huboCambio = cancelar
    || lineas.some(l => !l.original || l.original.cantidad !== l.cantidad)
    || lineas.filter(l => l.original).length !== productosOriginales
    || (pagos && (
      pagos.efectivo !== (venta.pagos?.efectivo || 0) ||
      pagos.tarjeta !== (venta.pagos?.tarjeta || 0) ||
      pagos.transferencia !== (venta.pagos?.transferencia || 0)));

  const motivoFinal = motivo === 'Otro'
    ? detalle.trim()
    : [motivo, detalle.trim()].filter(Boolean).join(' — ');

  const puedeGuardar = !guardando && huboCambio && motivoFinal.length >= 3
    && (cancelar || (lineas.length > 0 && pagosCuadran && faltantes.length === 0));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const { data, error: e } = cancelar
        ? await supabase.rpc('cancelar_venta', { p_venta: venta.id, p_motivo: motivoFinal })
        : await supabase.rpc('editar_venta', {
            p_venta: venta.id,
            p_items: lineas.map(l => ({ producto_id: l.producto_id, cantidad: l.cantidad })),
            p_pagos: pagosFinal,
            p_motivo: motivoFinal,
          });
      if (e) throw e;
      if (!data?.ok) throw new Error(data?.error || 'La base no aceptó el cambio.');
      onGuardado?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const turnoCerrado = turno && turno.estado !== 'abierta';
  const nombreTurno = turno?.usuarios_perfiles?.nombre_completo || turno?.usuario_nombre || 'la caja';

  return (
    <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-md flex items-end sm:items-center justify-center z-[80] sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[94vh] pb-[env(safe-area-inset-bottom)] border border-slate-200 dark:border-slate-800">

        <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${cancelar ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'}`}>
              {cancelar ? <Ban className="w-4 h-4" /> : <PencilLine className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {cancelar ? 'Cancelar' : 'Corregir'} ticket #{venta.folio}
              </h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                Cobrado {money(totalAntes)} · {new Date(venta.fecha).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto neb-scroll p-5 space-y-5">

          {cancelar ? (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-4 text-[13px] text-rose-800 dark:text-rose-200 space-y-1.5">
              <p className="font-semibold">La venta completa se anula:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                <li>Deja de sumar en ventas, en el Dashboard y en el corte ({money(totalAntes)}).</li>
                <li>Las {items.reduce((a, i) => a + Number(i.quantity), 0)} piezas regresan al inventario.</li>
                <li>El ticket se conserva marcado como <b>CANCELADO</b>, con el motivo. No se puede deshacer.</li>
              </ul>
            </div>
          ) : (
            <>
              {/* Partidas */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Productos</p>
                <div className="space-y-2">
                  {lineas.map(l => {
                    const unit = lineaPrecio(l);
                    const cambiada = !l.original || l.original.cantidad !== l.cantidad;
                    const falta = faltantes.includes(l);
                    return (
                      <div key={l.producto_id} className={`rounded-xl border p-3 ${falta ? 'border-rose-300 bg-rose-50/60 dark:bg-rose-500/10' : 'border-slate-200 dark:border-slate-800'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-900 dark:text-white break-words">{l.producto.nombre || 'Producto'}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 neb-tabular">
                              {money(unit)} c/u
                              {!l.original && <span className="ml-1.5 text-emerald-600 font-semibold">nuevo</span>}
                              {l.original && cambiada && <span className="ml-1.5 text-amber-600 font-semibold">antes {l.original.cantidad} pz</span>}
                            </p>
                            {falta && (
                              <p className="text-[11px] text-rose-600 font-semibold mt-0.5">
                                Solo alcanzan {disponible(l.producto_id)} pz
                                {l.original ? ` (${stock.get(l.producto_id) || 0} en la sucursal + ${l.original.cantidad} de esta venta)` : ' en la sucursal'}
                              </p>
                            )}
                          </div>
                          <p className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular shrink-0">{money(unit * l.cantidad)}</p>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1">
                            <button onClick={() => cambio(l.producto_id, l.cantidad - 1)} disabled={l.cantidad <= 1}
                              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center disabled:opacity-40"><Minus className="w-3.5 h-3.5" /></button>
                            <input type="number" inputMode="numeric" min="1" value={l.cantidad}
                              onChange={e => cambio(l.producto_id, parseInt(e.target.value, 10) || 1)}
                              className="w-14 h-8 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-[14px] font-semibold neb-tabular" />
                            <button onClick={() => cambio(l.producto_id, l.cantidad + 1)}
                              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
                          </div>
                          <button onClick={() => quitar(l.producto_id)} className="text-[12px] text-rose-600 font-medium inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-500/10">
                            <Trash2 className="w-3.5 h-3.5" /> Quitar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {lineas.length === 0 && (
                    <p className="text-[13px] text-rose-600 bg-rose-50 dark:bg-rose-500/10 rounded-xl p-3">
                      La venta se quedó sin productos. Si se regresó todo, usa <b>Cancelar venta</b>.
                    </p>
                  )}
                </div>

                {/* Agregar producto */}
                <div className="relative mt-3">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    placeholder={catalogo.length ? 'Agregar producto (nombre o SKU)…' : 'Cargando catálogo…'}
                    disabled={!catalogo.length}
                    className="neb-input pl-10 !py-2.5 text-[13px]" />
                  {resultados.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                      {resultados.map(p => {
                        const hay = disponible(p.id);
                        return (
                          <button key={p.id} onClick={() => agregar(p)} disabled={hay <= 0}
                            className="w-full text-left px-3 py-2.5 flex justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 border-b last:border-0 border-slate-100 dark:border-slate-800">
                            <span className="text-[13px] text-slate-800 dark:text-slate-200 truncate">{p.nombre}</span>
                            <span className="text-[11px] text-slate-500 shrink-0 neb-tabular">{money(p.precio)} · {hay > 0 ? `${hay} pz` : 'sin existencia'}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Pagos */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Forma de pago</p>
                  {pagos && !pagosCuadran && (
                    <button onClick={() => setPagos(null)} className="text-[12px] text-blue-600 font-medium">Ajustar al total</button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transf.']].map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{label}</span>
                      <input type="number" inputMode="decimal" min="0" step="0.5"
                        value={pagosFinal[k]}
                        onChange={e => setPagos({ ...pagosFinal, [k]: r2(Math.max(0, parseFloat(e.target.value) || 0)) })}
                        className="neb-input !py-2 text-[14px] font-semibold neb-tabular" />
                    </label>
                  ))}
                </div>
                {!pagosCuadran && (
                  <p className="text-[12px] text-rose-600 mt-1.5 font-medium">
                    Los pagos suman {money(sumaPagos)} y el total nuevo es {money(totalNuevo)}. Tienen que coincidir.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Qué va a pasar con el dinero */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <div className="flex justify-between text-[13px]">
              <span className="text-slate-500 dark:text-slate-400">Total cobrado</span>
              <span className="neb-tabular text-slate-700 dark:text-slate-300">{money(totalAntes)}</span>
            </div>
            <div className="flex justify-between text-[15px] font-semibold">
              <span className="text-slate-900 dark:text-white">Total {cancelar ? 'después de cancelar' : 'nuevo'}</span>
              <span className="neb-tabular text-slate-900 dark:text-white">{money(cancelar ? 0 : totalNuevo)}</span>
            </div>
            {(cancelar ? totalAntes > 0 : difTotal !== 0) && (
              <p className={`text-[13px] font-semibold ${(cancelar || difTotal < 0) ? 'text-rose-600' : 'text-emerald-600'}`}>
                {(cancelar || difTotal < 0)
                  ? `Hay que devolverle ${money(cancelar ? totalAntes : -difTotal)} al cliente.`
                  : `El cliente tiene que pagar ${money(difTotal)} más.`}
              </p>
            )}
            {difEfectivo !== 0 && (
              <p className="text-[12px] text-slate-600 dark:text-slate-400 flex gap-1.5">
                <Wallet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {turnoCerrado
                    ? <>El turno de <b>{nombreTurno}</b> ya se cortó. Su corte se recalcula: el efectivo esperado {difEfectivo < 0 ? 'baja' : 'sube'} {money(Math.abs(difEfectivo))} y su diferencia cambia en esa cantidad.</>
                    : <>El efectivo esperado en la caja abierta de <b>{nombreTurno}</b> {difEfectivo < 0 ? 'baja' : 'sube'} {money(Math.abs(difEfectivo))}: {difEfectivo < 0 ? 'saca de esa caja el dinero que devuelves' : 'mete en esa caja lo que cobres'}.</>}
                </span>
              </p>
            )}
          </div>

          {/* Motivo */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Motivo (obligatorio)</p>
            <select value={motivo} onChange={e => setMotivo(e.target.value)} className="neb-input !py-2.5 text-[14px]">
              <option value="">Elige el motivo…</option>
              {(cancelar ? MOTIVOS_CANCELACION : MOTIVOS_EDICION).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {motivo && (
              <input value={detalle} onChange={e => setDetalle(e.target.value)}
                placeholder={motivo === 'Otro' ? 'Escribe el motivo' : 'Detalle (opcional)'}
                className="neb-input !py-2.5 text-[14px] mt-2" />
            )}
          </div>

          {error && (
            <div className="rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 p-3 text-[13px] text-rose-700 dark:text-rose-300 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex gap-2 shrink-0">
          <button onClick={onClose} className="neb-btn neb-btn-ghost flex-1 py-3">No, volver</button>
          <button onClick={guardar} disabled={!puedeGuardar}
            className={`neb-btn flex-[2] py-3 text-white disabled:opacity-40 ${cancelar ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 dark:bg-white dark:text-slate-900'}`}>
            {guardando
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
              : cancelar ? 'Cancelar venta' : 'Guardar corrección'}
          </button>
        </div>
      </div>
    </div>
  );
}
