import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Package, Plus, Loader2, Edit2, FileSpreadsheet,
  History, Truck, RotateCcw,
  AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight,
  Settings2, X, ChevronRight, Layers, Printer, Store, ArrowLeftRight, Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import ProductModal from './ProductModal';
import EtiquetaModal from './EtiquetaModal';
import TransferenciaModal from './TransferenciaModal';

const fmt = (n) => `$${Number(n).toFixed(2)}`;

function stockInfo(stock) {
  if (stock === 0)  return { cls: 'bg-rose-50 text-rose-700 border-rose-200',     dot: 'bg-rose-500',    label: 'Agotado',  barColor: '#f43f5e' };
  if (stock <= 5)   return { cls: 'bg-rose-50 text-rose-600 border-rose-100',     dot: 'bg-rose-400',    label: 'Crítico',  barColor: '#fb7185' };
  if (stock <= 20)  return { cls: 'bg-amber-50 text-amber-700 border-amber-100',  dot: 'bg-amber-400',   label: 'Bajo',     barColor: '#fbbf24' };
  return               { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100',dot: 'bg-emerald-400', label: 'OK',       barColor: '#34d399' };
}

const TIPO_META = {
  entrada:      { label: 'Entrada',       icon: ArrowUpRight,   cls: 'bg-accent-50 text-accent-700',    sign: '+' },
  salida_venta: { label: 'Venta',         icon: ArrowDownRight, cls: 'bg-amber-50 text-amber-700',      sign: '-' },
  ajuste:       { label: 'Ajuste',        icon: Settings2,      cls: 'bg-violet-50 text-violet-700',    sign: '±' },
  inicial:      { label: 'Inicial',       icon: CheckCircle,    cls: 'bg-emerald-50 text-emerald-700',  sign: '+' },
  salida_ruta:  { label: 'Salida Ruta',   icon: Truck,          cls: 'bg-orange-50 text-orange-600',    sign: '-' },
  entrada_ruta: { label: 'Regreso Ruta',  icon: RotateCcw,      cls: 'bg-sky-50 text-sky-600',          sign: '+' },
  transferencia_salida:  { label: 'Transf. salida',  icon: ArrowLeftRight, cls: 'bg-indigo-50 text-indigo-600', sign: '-' },
  transferencia_entrada: { label: 'Transf. entrada', icon: ArrowLeftRight, cls: 'bg-indigo-50 text-indigo-600', sign: '+' },
};

function fmtRelative(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'ahora';
  if (diffMin < 60) return `hace ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1)  return 'ayer';
  if (diffD < 7)    return `hace ${diffD} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ─── Catálogo ───────────────────────────────────────────────────────────────
function CatalogoTab({ productos, isAdmin, categorias, loading, onEdit, onNew, onCSV, uploadingCSV, fileInputRef, onRefresh, puedeTransferir, sucursales, vistaSucursal, onDelete }) {
  const [search, setSearch] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [orden, setOrden] = useState('nombre');
  const [etiquetaProducto, setEtiquetaProducto] = useState(null);
  const [transferProducto, setTransferProducto] = useState(null);
  const [delTarget, setDelTarget] = useState(null);   // producto a eliminar
  const [delBusy, setDelBusy]     = useState(false);
  const [delResult, setDelResult] = useState(null);   // { accion, nombre } al terminar

  const confirmarEliminar = async () => {
    if (!delTarget || delBusy) return;
    setDelBusy(true);
    try {
      const res = await onDelete(delTarget);
      if (res?.ok || res?.accion) {
        setDelResult({ accion: res.accion, nombre: delTarget.nombre });
        setDelTarget(null);
      }
    } finally {
      setDelBusy(false);
    }
  };

  const maxStock = useMemo(() => Math.max(...productos.map(p => p.stock), 1), [productos]);

  const filtered = useMemo(() => {
    let list = productos.filter(p => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase());
      const matchCat    = catFiltro === 'todas' || p.categoria === catFiltro;
      return matchSearch && matchCat;
    });
    if (orden === 'stock_asc')  return list.sort((a, b) => a.stock - b.stock);
    if (orden === 'stock_desc') return list.sort((a, b) => b.stock - a.stock);
    if (orden === 'precio')     return list.sort((a, b) => b.precio - a.precio);
    return list.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [productos, search, catFiltro, orden]);

  const stockBajos = productos.filter(p => p.stock <= 5).length;

  return (
    <div className="space-y-4">
      {stockBajos > 0 && (
        <div className="flex items-center gap-3 bg-rose-50/70 border border-rose-100 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-sm font-bold text-rose-700">
            {stockBajos} producto{stockBajos > 1 ? 's' : ''} con stock crítico o agotado.
            <button onClick={() => setOrden('stock_asc')} className="underline ml-1 hover:no-underline">Ver primero</button>
          </p>
        </div>
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text" placeholder="Buscar por nombre o SKU…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="neb-input pl-10"
          />
        </div>
        <select value={orden} onChange={e => setOrden(e.target.value)} className="neb-input w-auto !pr-3">
          <option value="nombre">A–Z</option>
          <option value="stock_asc">Stock: menor primero</option>
          <option value="stock_desc">Stock: mayor primero</option>
          <option value="precio">Precio: mayor primero</option>
        </select>
        {isAdmin && (
          <>
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={onCSV} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingCSV} className="neb-btn neb-btn-ghost">
              {uploadingCSV ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              CSV
            </button>
            <button onClick={onNew} className="neb-btn neb-btn-primary">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </>
        )}
      </div>

      {/* Chips de categoría — Apple style */}
      <div className="flex gap-2 flex-wrap">
        {['todas', ...categorias].map(c => (
          <button key={c} onClick={() => setCatFiltro(c)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              catFiltro === c
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}>
            {c === 'todas' ? 'Todas' : c}
            {c !== 'todas' && <span className="ml-1 opacity-60">· {productos.filter(p => p.categoria === c).length}</span>}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="neb-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
            <Loader2 className="w-7 h-7 animate-spin mb-3 text-accent-500" />
            <p className="text-sm font-bold">Cargando productos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">Sin productos{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map(p => {
                const si = stockInfo(p.stock);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${si.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{p.nombre}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{p.sku} · {p.categoria}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-slate-900 dark:text-white text-sm neb-tabular">{fmt(p.precio)}</p>
                      {p.cantidad_mayoreo && p.precio_mayoreo && (
                        <p className="text-[9px] text-emerald-600 font-bold mb-0.5">Mayoreo: {fmt(p.precio_mayoreo)}</p>
                      )}
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${si.cls}`}>{p.stock} un.</span>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center shrink-0">
                        {puedeTransferir && (
                          <button onClick={() => setTransferProducto(p)} title="Transferir a otra sucursal" className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                            <ArrowLeftRight className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setEtiquetaProducto(p)} title="Imprimir etiqueta" className="p-2 text-slate-400 dark:text-slate-500 hover:text-accent-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => onEdit(p)} className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDelTarget(p)} title="Eliminar / archivar"
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto neb-scroll">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-[0.12em] border-b border-slate-100 dark:border-slate-800">
                    <th className="px-5 py-3 font-medium">Producto</th>
                    <th className="px-5 py-3 font-medium">Categoría</th>
                    <th className="px-5 py-3 font-medium text-right">Precio</th>
                    <th className="px-5 py-3 font-medium text-right w-48">Stock</th>
                    {isAdmin && <th className="px-5 py-3 font-medium text-center">Acción</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(p => {
                    const si = stockInfo(p.stock);
                    const barPct = Math.min(100, (p.stock / maxStock) * 100);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-medium text-slate-900 dark:text-white text-sm">{p.nombre}</p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{p.sku}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">
                            <Layers className="w-3 h-3" />{p.categoria || 'General'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-900 dark:text-white neb-tabular">
                          {fmt(p.precio)}
                          {p.cantidad_mayoreo && p.precio_mayoreo && (
                            <div className="text-[10px] text-emerald-600 font-bold mt-0.5">Mayoreo: {fmt(p.precio_mayoreo)} a partir de {p.cantidad_mayoreo}</div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex-1 max-w-[80px]">
                              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, background: si.barColor }} />
                              </div>
                            </div>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${si.cls} neb-tabular`}>
                              {p.stock === 0 ? 'Agotado' : `${p.stock} un.`}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-3.5 text-center">
                            <div className="inline-flex items-center gap-1">
                              {puedeTransferir && (
                                <button onClick={() => setTransferProducto(p)} title="Transferir a otra sucursal"
                                  className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                  <ArrowLeftRight className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => setEtiquetaProducto(p)} title="Imprimir etiqueta"
                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-accent-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <Printer className="w-4 h-4" />
                              </button>
                              <button onClick={() => onEdit(p)}
                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => setDelTarget(p)} title="Eliminar / archivar"
                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {etiquetaProducto && (
        <EtiquetaModal producto={etiquetaProducto} onClose={() => setEtiquetaProducto(null)} />
      )}

      {transferProducto && (
        <TransferenciaModal
          producto={transferProducto}
          sucursales={sucursales || []}
          origenDefault={vistaSucursal}
          onClose={() => setTransferProducto(null)}
          onDone={onRefresh}
        />
      )}

      {/* Confirmación de borrado */}
      {delTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-md p-4"
          onClick={() => !delBusy && setDelTarget(null)}>
          <div className="neb-glass-strong rounded-3xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-500/15 flex items-center justify-center mb-4">
                <Trash2 className="w-7 h-7 text-rose-600 dark:text-rose-400" />
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">¿Eliminar producto?</h2>
              <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200 break-words">{delTarget.nombre}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                Si nunca se ha vendido, se elimina por completo. Si ya tiene ventas o pedidos,
                se <strong className="text-slate-700 dark:text-slate-200">archiva</strong>: deja de aparecer
                pero su historial se conserva.
              </p>
            </div>
            <div className="p-4 pt-0 flex gap-2.5">
              <button type="button" onClick={() => setDelTarget(null)} disabled={delBusy}
                className="flex-1 neb-btn neb-btn-ghost py-3 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={confirmarEliminar} disabled={delBusy}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-[0.625rem] font-semibold text-[0.8125rem] text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-60">
                {delBusy ? <><Loader2 className="w-4 h-4 animate-spin" /> Eliminando…</> : <><Trash2 className="w-4 h-4" /> Eliminar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado del borrado */}
      {delResult && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/70 backdrop-blur-md p-4"
          onClick={() => setDelResult(null)}>
          <div className="neb-glass-strong rounded-3xl w-full max-w-sm overflow-hidden text-center" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${delResult.accion === 'archivado' ? 'bg-amber-100 dark:bg-amber-500/15' : 'bg-emerald-100 dark:bg-emerald-500/15'}`}>
                {delResult.accion === 'archivado'
                  ? <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400" />
                  : <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                {delResult.accion === 'archivado' ? 'Producto archivado' : 'Producto eliminado'}
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                {delResult.accion === 'archivado'
                  ? <><strong className="text-slate-700 dark:text-slate-200">{delResult.nombre}</strong> ya tenía historial de ventas o pedidos, así que se archivó. Dejó de aparecer en el catálogo, pero su historial se conserva.</>
                  : <><strong className="text-slate-700 dark:text-slate-200">{delResult.nombre}</strong> se eliminó del catálogo.</>}
              </p>
            </div>
            <div className="p-4 pt-0">
              <button type="button" onClick={() => setDelResult(null)} className="w-full neb-btn neb-btn-primary py-3">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recepción ─────────────────────────────────────────────────────────────
function RecepcionTab({ productos, onRefresh, onAjustarLote }) {
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [cantidad, setCantidad] = useState('');
  const [batch, setBatch] = useState([]);
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);

  const sugeridos = useMemo(() =>
    [...productos].sort((a, b) => a.stock - b.stock).slice(0, 8).filter(p => p.stock <= 20),
    [productos]
  );

  const resultados = useMemo(() => {
    if (!search.trim()) return [];
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 8);
  }, [productos, search]);

  const selectProduct = (p) => {
    setSelected(p);
    setSearch('');
    setSearchOpen(false);
    setCantidad('');
  };

  const addToBatch = () => {
    const cant = parseInt(cantidad);
    if (!selected || cant <= 0 || isNaN(cant)) return;
    const already = batch.find(i => i.productoId === selected.id);
    if (already) {
      setBatch(prev => prev.map(i => i.productoId === selected.id
        ? { ...i, cantidad: i.cantidad + cant, stockNuevo: i.stockAnterior + i.cantidad + cant }
        : i
      ));
    } else {
      setBatch(prev => [...prev, {
        productoId:    selected.id,
        nombre:        selected.nombre,
        sku:           selected.sku,
        stockAnterior: selected.stock,
        cantidad:      cant,
        stockNuevo:    selected.stock + cant,
      }]);
    }
    setSelected(null);
    setCantidad('');
    searchRef.current?.focus();
  };

  const removeFromBatch = (id) => setBatch(prev => prev.filter(i => i.productoId !== id));

  const confirmarEntrada = async () => {
    if (batch.length === 0) return;
    setSaving(true);
    try {
      // Todo el lote entra en una sola transacción: si algo falla, no queda
      // ninguna entrada aplicada a medias.
      await onAjustarLote(batch, 'entrada', notas || null);
      onRefresh();
      setBatch([]);
      setNotas('');
    } catch (err) {
      alert('Error al confirmar entrada: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      <div className="neb-card p-5 space-y-4">
        <h3 className="font-semibold text-slate-900 dark:text-white text-[15px]">Buscar producto</h3>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              ref={searchRef}
              type="text" placeholder="Nombre o SKU…"
              value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              className="neb-input pl-10"
              autoComplete="off"
            />
            {searchOpen && resultados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                {resultados.map(p => (
                  <button key={p.id} type="button" onClick={() => selectProduct(p)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 last:border-0 text-left transition-colors">
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white text-sm">{p.nombre}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm neb-tabular">{fmt(p.precio)}</p>
                      <p className={`text-[11px] font-medium neb-tabular ${p.stock === 0 ? 'text-rose-500' : p.stock <= 5 ? 'text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                        stock: {p.stock}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selected && (
          <div className="neb-card-soft p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{selected.nombre}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{selected.sku} · Stock actual: <span className="font-semibold neb-tabular">{selected.stock}</span></p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number" min="1" placeholder="¿Cuántas unidades llegaron?"
                value={cantidad} onChange={e => setCantidad(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addToBatch()}
                autoFocus
                className="neb-input !text-base !font-semibold neb-tabular"
              />
              <button onClick={addToBatch} disabled={!cantidad || parseInt(cantidad) <= 0} className="neb-btn neb-btn-primary disabled:opacity-50">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>
            {cantidad && parseInt(cantidad) > 0 && (
              <p className="text-[12px] text-emerald-600 font-medium neb-tabular">
                Stock después de recibir: {selected.stock} + {cantidad} = <span className="font-semibold">{selected.stock + parseInt(cantidad)}</span> unidades
              </p>
            )}
          </div>
        )}

        {!selected && sugeridos.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Stock bajo — sugeridos
            </p>
            <div className="flex flex-wrap gap-2">
              {sugeridos.map(p => (
                <button key={p.id} onClick={() => selectProduct(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all hover:-translate-y-0.5 ${
                    p.stock === 0 ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-amber-50 border-amber-100 text-amber-700'
                  }`}>
                  <span>{p.nombre}</span>
                  <span className="opacity-70">{p.stock === 0 ? 'Agotado' : `${p.stock} un.`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {batch.length > 0 && (
        <div className="neb-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white text-[15px]">Lote de entrada</h3>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">{batch.length}</span>
            </div>
            <button onClick={() => setBatch([])} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-rose-500 font-medium transition-colors inline-flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {batch.map(item => (
              <div key={item.productoId} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{item.nombre}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{item.sku}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-sm">
                  <span className="text-slate-500 dark:text-slate-400 neb-tabular">{item.stockAnterior}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                  <span className="font-semibold text-emerald-600 neb-tabular">{item.stockNuevo}</span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-medium neb-tabular">+{item.cantidad}</span>
                </div>
                <button onClick={() => removeFromBatch(item.productoId)} className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <textarea
              value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Notas: proveedor, número de factura, lote…"
              className="neb-input resize-none"
            />
            <button onClick={confirmarEntrada} disabled={saving}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                : <><CheckCircle className="w-4 h-4" /> Confirmar entrada ({batch.length} productos)</>
              }
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Historial ─────────────────────────────────────────────────────────────
function HistorialTab({ sucursal }) {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState('todos');
  const [diasFiltro, setDiasFiltro] = useState(7);
  const [searchProd, setSearchProd] = useState('');

  useEffect(() => { fetchMovimientos(); }, [diasFiltro, sucursal]);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - diasFiltro);
      desde.setHours(0, 0, 0, 0);

      let query = supabase
        .from('movimientos_inventario')
        .select('*, usuarios_perfiles (nombre_completo)')
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false })
        .limit(300);

      // Mostrar solo los movimientos de la sucursal que se está viendo.
      if (sucursal) query = query.eq('sucursal_id', sucursal);

      const { data, error } = await query;

      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error cargando historial:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtrados = useMemo(() => movimientos.filter(m => {
    const matchTipo = tipoFiltro === 'todos' || m.tipo === tipoFiltro;
    const matchSearch = !searchProd || m.nombre_producto.toLowerCase().includes(searchProd.toLowerCase());
    return matchTipo && matchSearch;
  }), [movimientos, tipoFiltro, searchProd]);

  const resumen = useMemo(() => ({
    entradas: movimientos.filter(m => m.tipo === 'entrada').reduce((a, m) => a + m.cantidad, 0),
    salidas:  movimientos.filter(m => m.tipo === 'salida_venta').reduce((a, m) => a + Math.abs(m.cantidad), 0),
    ajustes:  movimientos.filter(m => m.tipo === 'ajuste').length,
  }), [movimientos]);

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <div className="neb-card p-4">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Entradas</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">+{resumen.entradas}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">unidades</p>
        </div>
        <div className="neb-card p-4">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Salidas</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">-{resumen.salidas}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">unidades</p>
        </div>
        <div className="neb-card p-4">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Ajustes</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{resumen.ajustes}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">movimientos</p>
        </div>
      </div>

      {/* Filtros — segmented controls Apple */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input type="text" placeholder="Buscar producto…" value={searchProd} onChange={e => setSearchProd(e.target.value)}
            className="neb-input pl-10" />
        </div>
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'entrada', label: 'Entradas' },
            { key: 'salida_venta', label: 'Ventas' },
            { key: 'ajuste', label: 'Ajustes' },
          ].map(f => (
            <button key={f.key} onClick={() => setTipoFiltro(f.key)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                tipoFiltro === f.key ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>{f.label}</button>
          ))}
        </div>
        <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDiasFiltro(d)}
              className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all ${
                diasFiltro === d ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="neb-card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin w-6 h-6 text-accent-500" /></div>
        ) : filtrados.length === 0 ? (
          <div className="py-14 text-center text-slate-400 dark:text-slate-500">
            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">Sin movimientos en este período</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtrados.map(m => {
              const meta  = TIPO_META[m.tipo] || TIPO_META.ajuste;
              const Icon  = meta.icon;
              const delta = m.cantidad > 0 ? `+${m.cantidad}` : `${m.cantidad}`;
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className={`p-2 rounded-lg shrink-0 ${meta.cls}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{m.nombre_producto}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${meta.cls}`}>{meta.label}</span>
                      {m.notas && <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{m.notas}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-semibold text-sm neb-tabular ${m.cantidad > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{delta} un.</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono neb-tabular">{m.stock_anterior} → {m.stock_nuevo}</p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 dark:text-slate-500 shrink-0 w-20 leading-tight">
                    <p className="font-medium">{fmtRelative(m.created_at)}</p>
                    {m.usuarios_perfiles && (
                      <p className="text-[10px] truncate max-w-[80px]">{m.usuarios_perfiles.nombre_completo.split(' ')[0]}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function Inventario({ isAdmin, userProfile }) {
  const [subTab, setSubTab] = useState('catalogo');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const fileInputRef = useRef(null);

  const sucursalId = userProfile?.sucursal_id;
  const [sucursales, setSucursales] = useState([]);
  const [vistaSucursal, setVistaSucursal] = useState(sucursalId);

  // Estoy viendo una sucursal distinta a la mía
  const viendoOtra = !!vistaSucursal && !!sucursalId && vistaSucursal !== sucursalId;
  // El admin gestiona cualquier sucursal; el empleado solo lee las ajenas
  const soloLectura = viendoOtra && !isAdmin;

  useEffect(() => { setVistaSucursal(sucursalId); }, [sucursalId]);

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  // Un empleado que mira otra sucursal solo puede ver el catálogo
  useEffect(() => { if (soloLectura) setSubTab('catalogo'); }, [soloLectura]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProductos(); }, [vistaSucursal]);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('productos_de_sucursal', { p_sucursal: vistaSucursal || sucursalId });
      if (error) throw error;
      setProductos(data || []);
    } catch (err) {
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Único punto de cambio de stock: opera sobre la sucursal que se está viendo
  // (el admin puede gestionar cualquiera; el empleado, solo la suya).
  const ajustarStock = async ({ productoId, delta, tipo, notas }) => {
    const { data, error } = await supabase.rpc('ajustar_stock', {
      p_producto: productoId,
      p_sucursal: vistaSucursal || sucursalId,
      p_delta:    delta,
      p_tipo:     tipo,
      p_notas:    notas || null,
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'No se pudo ajustar el stock.');
    return data;
  };

  // Recepción por lote: una sola transacción en la BD (todo o nada). Si el RPC
  // aún no está desplegado, cae al método anterior (uno por uno).
  const ajustarStockLote = async (items, tipo, notas) => {
    const payload = items.map(i => ({ producto_id: i.productoId, cantidad: i.cantidad }));
    const { data, error } = await supabase.rpc('ajustar_stock_lote', {
      p_items:    payload,
      p_sucursal: vistaSucursal || sucursalId,
      p_tipo:     tipo,
      p_notas:    notas || null,
    });
    if (error) {
      if (error.code === '42883' || /does not exist|function/i.test(error.message || '')) {
        for (const i of items) {
          await ajustarStock({ productoId: i.productoId, delta: i.cantidad, tipo, notas });
        }
        return { ok: true, aplicados: items.length, fallback: true };
      }
      throw error;
    }
    if (!data?.ok) throw new Error(data?.error || 'No se pudo registrar la entrada.');
    return data;
  };

  // Quitar un producto del catálogo (borra si no tiene historial; si no, archiva).
  const handleDeleteProduct = async (producto) => {
    const { data, error } = await supabase.rpc('eliminar_producto', { p_id: producto.id });
    if (error) { alert('No se pudo eliminar: ' + error.message); return; }
    if (!data?.ok) { alert(data?.error || 'No se pudo eliminar el producto.'); return; }
    await fetchProductos();
    return data;
  };

  const categorias = useMemo(() =>
    [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort(),
    [productos]
  );


  const handleSaveProduct = async (productData) => {
    try {
      // El stock se maneja por sucursal vía ajustar_stock; el catálogo (nombre,
      // sku, categoría, precio) se guarda en productos sin la columna stock.
      // Se arma un payload con SOLO las columnas reales de `productos`: el
      // producto que llega al editar trae campos extra de la RPC
      // productos_de_sucursal (id, sucursal_id, created_at, updated_at) que NO
      // existen en la tabla y rompían el .update() con "Could not find the
      // 'sucursal_id' column".
      const { stock, _existingId, _addStock } = productData;
      const catalogo = {
        nombre:           productData.nombre,
        sku:              productData.sku,
        categoria:        productData.categoria,
        precio:           productData.precio,
        precio_mayoreo:   productData.precio_mayoreo,
        cantidad_mayoreo: productData.cantidad_mayoreo,
      };

      if (_addStock && _existingId) {
        // Sumar stock a un producto existente, en mi sucursal
        await ajustarStock({
          productoId: _existingId,
          delta:      stock,
          tipo:       'entrada',
          notas:      'Entrada manual desde inventario',
        });
      } else if (selectedProduct) {
        // Editar catálogo
        const { error } = await supabase
          .from('productos').update(catalogo).eq('id', selectedProduct.id);
        if (error) throw error;
        // Si cambió el stock mostrado (el de mi sucursal), registrar el ajuste
        if (stock !== selectedProduct.stock) {
          await ajustarStock({
            productoId: selectedProduct.id,
            delta:      stock - selectedProduct.stock,
            tipo:       'ajuste',
            notas:      'Ajuste manual',
          });
        }
      } else {
        // Crear producto nuevo + stock inicial en mi sucursal
        const { data: newProd, error } = await supabase
          .from('productos').insert([catalogo]).select().single();
        if (error) throw error;
        if (newProd && stock > 0) {
          await ajustarStock({
            productoId: newProd.id,
            delta:      stock,
            tipo:       'inicial',
            notas:      'Stock inicial al crear producto',
          });
        }
      }

      setIsModalOpen(false);
      setSelectedProduct(null);
      fetchProductos();
    } catch (err) {
      alert('Error al guardar el producto: ' + err.message);
    }
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingCSV(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const rows = event.target.result.split('\n').filter(r => r.trim());
      let start = rows[0].toLowerCase().includes('nombre') ? 1 : 0;
      const newProducts = [];
      for (let i = start; i < rows.length; i++) {
        const cols = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || rows[i].split(',');
        if (cols.length >= 4) {
          const nombre    = cols[0]?.replace(/"/g,'').trim() || 'Sin Nombre';
          let   sku       = cols[1]?.replace(/"/g,'').trim();
          const categoria = cols[2]?.replace(/"/g,'').trim() || 'General';
          const precio    = parseFloat(cols[3]?.replace(/"/g,'').trim()) || 0;
          const stock     = parseInt(cols[4]?.replace(/"/g,'').trim())   || 0;
          if (!sku) sku = `INT-${Math.floor(100000 + Math.random() * 900000)}`;
          newProducts.push({ nombre, sku, categoria, precio, stock });
        }
      }
      if (newProducts.length > 0) {
        // Insertar catálogo (sin stock) y devolver ids para asignar stock por sucursal
        const catalogo = newProducts.map(({ stock, ...c }) => c); // eslint-disable-line no-unused-vars
        const { data: inserted, error } = await supabase
          .from('productos').insert(catalogo).select();
        if (error) {
          alert('Error al subir CSV: ' + error.message);
        } else {
          // Stock inicial en mi sucursal para cada producto importado
          const porSku = Object.fromEntries(newProducts.map(p => [p.sku, p.stock]));
          for (const prod of inserted || []) {
            const cant = porSku[prod.sku] || 0;
            if (cant > 0) {
              try {
                await ajustarStock({ productoId: prod.id, delta: cant, tipo: 'inicial', notas: 'Importación CSV' });
              } catch (e) { console.error('Stock CSV:', e.message); }
            }
          }
          alert(`${(inserted || []).length} productos importados.`);
          fetchProductos();
        }
      } else {
        alert('No se encontraron productos válidos. Formato: Nombre,SKU,Categoria,Precio,Stock');
      }
      setUploadingCSV(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => { alert('Error leyendo el archivo.'); setUploadingCSV(false); };
    reader.readAsText(file);
  };

  const SUB_TABS = [
    { key: 'catalogo',  label: 'Catálogo',   icon: Package },
    { key: 'recepcion', label: 'Recepción',  icon: Truck   },
    { key: 'historial', label: 'Historial',  icon: History },
  ];
  // Al ver otra sucursal solo se permite el catálogo (lectura)
  const subTabsVisibles = soloLectura ? SUB_TABS.filter(t => t.key === 'catalogo') : SUB_TABS;
  const nombreVista = sucursales.find(s => s.id === vistaSucursal)?.nombre || '';

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-6xl mx-auto space-y-5">

        {/* Header — Apple */}
        <div className="pt-2 pb-2">
          <h1 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Inventario
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2 neb-tabular">
            {productos.length} productos · {productos.reduce((a, p) => a + p.stock, 0)} unidades totales
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sub-tabs — segmented control */}
          <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
            {subTabsVisibles.map(t => (
              <button key={t.key} onClick={() => setSubTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                  subTab === t.key ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                }`}>
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Selector de sucursal (ver el inventario de otra bodega) */}
          {sucursales.length > 1 && (
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
              {sucursales.map(s => (
                <button key={s.id} onClick={() => setVistaSucursal(s.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-all ${
                    vistaSucursal === s.id ? 'bg-white dark:bg-slate-900 text-accent-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}>
                  <Store className="w-3.5 h-3.5" />
                  {s.nombre}{s.id === sucursalId ? ' (tú)' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {viendoOtra && (
          <div className="flex items-center gap-2 bg-accent-50 dark:bg-accent-950/30 border border-accent-100 dark:border-accent-900/40 rounded-2xl px-4 py-2.5">
            <Store className="w-4 h-4 text-accent-600 shrink-0" />
            <p className="text-[13px] font-semibold text-accent-700 dark:text-accent-300">
              {soloLectura
                ? <>Viendo el inventario de <strong>{nombreVista}</strong> · solo lectura</>
                : <>Gestionando el inventario de <strong>{nombreVista}</strong></>}
            </p>
          </div>
        )}

        {subTab === 'catalogo' && (
          <CatalogoTab
            productos={productos} isAdmin={isAdmin && !soloLectura} categorias={categorias}
            loading={loading} soloLectura={soloLectura}
            onEdit={p => { if (!isAdmin || soloLectura) return; setSelectedProduct(p); setIsModalOpen(true); }}
            onNew={() => { if (!isAdmin || soloLectura) return; setSelectedProduct(null); setIsModalOpen(true); }}
            onRefresh={fetchProductos}
            onCSV={handleCSVUpload}
            uploadingCSV={uploadingCSV}
            fileInputRef={fileInputRef}
            puedeTransferir={isAdmin && !soloLectura && sucursales.length > 1}
            sucursales={sucursales}
            vistaSucursal={vistaSucursal}
            onDelete={handleDeleteProduct}
          />
        )}

        {subTab === 'recepcion' && (
          <RecepcionTab
            productos={productos}
            userProfile={userProfile}
            onRefresh={fetchProductos}
            onAjustarLote={ajustarStockLote}
          />
        )}

        {subTab === 'historial' && <HistorialTab sucursal={vistaSucursal || sucursalId} />}

      </div>

      {isModalOpen && (
        <ProductModal
          product={selectedProduct}
          categorias={categorias}
          sucursalProductos={productos}
          onClose={() => { setIsModalOpen(false); setSelectedProduct(null); }}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
}
