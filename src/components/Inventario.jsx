import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Package, Plus, Loader2, Edit2, FileSpreadsheet,
  History, Truck, RotateCcw,
  AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight,
  Settings2, X, ScanLine, ChevronRight, Layers
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import ProductModal from './ProductModal';
import QRScannerModal from './QRScannerModal';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toFixed(2)}`;

function stockInfo(stock) {
  if (stock === 0)  return { cls: 'bg-red-100 text-red-700 border-red-200',         dot: 'bg-red-500',     label: 'Agotado',   barColor: '#ef4444' };
  if (stock <= 5)   return { cls: 'bg-red-50 text-red-600 border-red-100',           dot: 'bg-red-400',     label: 'Crítico',   barColor: '#f87171' };
  if (stock <= 20)  return { cls: 'bg-amber-50 text-amber-700 border-amber-200',     dot: 'bg-amber-400',   label: 'Bajo',      barColor: '#fbbf24' };
  return               { cls: 'bg-emerald-50 text-emerald-700 border-emerald-100', dot: 'bg-emerald-400', label: 'OK',        barColor: '#34d399' };
}

const TIPO_META = {
  entrada:      { label: 'Entrada',   icon: ArrowUpRight,   cls: 'bg-blue-100 text-blue-700',    sign: '+' },
  salida_venta: { label: 'Venta',     icon: ArrowDownRight, cls: 'bg-amber-100 text-amber-700',  sign: '-' },
  ajuste:       { label: 'Ajuste',    icon: Settings2,      cls: 'bg-purple-100 text-purple-700',sign: '±' },
  inicial:      { label: 'Inicial',   icon: CheckCircle,    cls: 'bg-emerald-100 text-emerald-700',sign:'+' },
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

// ─── Sub-tab: Catálogo ─────────────────────────────────────────────────────
function CatalogoTab({ productos, isAdmin, categorias, loading, onEdit, onNew, onCSV, uploadingCSV, fileInputRef }) {
  const [search,      setSearch]      = useState('');
  const [catFiltro,   setCatFiltro]   = useState('todas');
  const [orden,       setOrden]       = useState('nombre'); // nombre | stock_asc | stock_desc | precio

  const maxStock = useMemo(() => Math.max(...productos.map(p => p.stock), 1), [productos]);

  const filtered = useMemo(() => {
    let list = productos.filter(p => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search);
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
      {/* Alert de stock bajo */}
      {stockBajos > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm font-bold text-red-700">
            {stockBajos} producto{stockBajos > 1 ? 's' : ''} con stock crítico o agotado.
            <button onClick={() => setOrden('stock_asc')} className="underline ml-1 hover:no-underline">Ver primero</button>
          </p>
        </div>
      )}

      {/* Barra de herramientas */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar por nombre o SKU…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 focus:outline-none text-sm transition-all" />
        </div>
        <select value={orden} onChange={e => setOrden(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none text-slate-600">
          <option value="nombre">A–Z</option>
          <option value="stock_asc">Stock: menor primero</option>
          <option value="stock_desc">Stock: mayor primero</option>
          <option value="precio">Precio: mayor primero</option>
        </select>
        {isAdmin && (
          <>
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={onCSV} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm font-bold transition-colors">
              {uploadingCSV ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              CSV
            </button>
            <button onClick={onNew}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold transition-colors shadow-md">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </>
        )}
      </div>

      {/* Chips de categoría */}
      <div className="flex gap-2 flex-wrap">
        {['todas', ...categorias].map(c => (
          <button key={c} onClick={() => setCatFiltro(c)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              catFiltro === c ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
            }`}>
            {c === 'todas' ? 'Todas' : c}
            {c !== 'todas' && <span className="ml-1 opacity-60">{productos.filter(p => p.categoria === c).length}</span>}
          </button>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm font-medium">Cargando productos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Sin productos{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          <>
            {/* Mobile */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filtered.map(p => {
                const si = stockInfo(p.stock);
                return (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${si.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 text-sm truncate">{p.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku} · {p.categoria}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-slate-800 text-sm">{fmt(p.precio)}</p>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md border ${si.cls}`}>{p.stock} un.</span>
                    </div>
                    {isAdmin && (
                      <button onClick={() => onEdit(p)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-200">
                    <th className="px-5 py-3 font-bold">Producto</th>
                    <th className="px-5 py-3 font-bold">Categoría</th>
                    <th className="px-5 py-3 font-bold text-right">Precio</th>
                    <th className="px-5 py-3 font-bold text-right w-48">Stock</th>
                    {isAdmin && <th className="px-5 py-3 font-bold text-center">Acción</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(p => {
                    const si = stockInfo(p.stock);
                    const barPct = Math.min(100, (p.stock / maxStock) * 100);
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">{p.sku}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            <Layers className="w-3 h-3" />{p.categoria || 'General'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right font-black text-slate-800">{fmt(p.precio)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-3">
                            <div className="flex-1 max-w-[80px]">
                              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, background: si.barColor }} />
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border shrink-0 ${si.cls}`}>
                              {p.stock === 0 ? 'Agotado' : `${p.stock} un.`}
                            </span>
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-5 py-3.5 text-center">
                            <button onClick={() => onEdit(p)}
                              className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
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
    </div>
  );
}

// ─── Sub-tab: Recepción de Mercancía ─────────────────────────────────────
function RecepcionTab({ productos, onRefresh, onRegistrarMovimiento }) {
  const [search,      setSearch]      = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [cantidad,    setCantidad]    = useState('');
  const [batch,       setBatch]       = useState([]);
  const [notas,       setNotas]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
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
      for (const item of batch) {
        const { error } = await supabase
          .from('productos')
          .update({ stock: item.stockNuevo })
          .eq('id', item.productoId);
        if (error) throw error;

        await onRegistrarMovimiento({
          productoId:    item.productoId,
          nombreProducto: item.nombre,
          tipo:          'entrada',
          cantidad:      item.cantidad,
          stockAnterior: item.stockAnterior,
          stockNuevo:    item.stockNuevo,
          notas:         notas || null,
        });
      }
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

      {/* Buscador */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
          <Search className="w-5 h-5 text-slate-400" /> Buscar Producto
        </h3>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              type="text" placeholder="Nombre o SKU…"
              value={search} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-slate-400 focus:outline-none text-sm transition-all"
              autoComplete="off"
            />
            {/* Dropdown de resultados */}
            {searchOpen && resultados.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                {resultados.map(p => (
                  <button key={p.id} type="button" onClick={() => selectProduct(p)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-left transition-colors">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                      <p className="text-xs text-slate-400 font-mono">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="font-bold text-slate-600 text-sm">{fmt(p.precio)}</p>
                      <p className={`text-xs font-bold ${p.stock === 0 ? 'text-red-500' : p.stock <= 5 ? 'text-red-400' : 'text-slate-400'}`}>
                        stock: {p.stock}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setScannerOpen(true)}
            className="px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200 transition-colors flex items-center gap-2 text-sm font-bold">
            <ScanLine className="w-4 h-4" /> Escanear
          </button>
        </div>

        {/* Producto seleccionado + cantidad */}
        {selected && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-black text-slate-800">{selected.nombre}</p>
                <p className="text-xs text-slate-400 font-mono">{selected.sku} · Stock actual: <strong>{selected.stock}</strong></p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <input
                  type="number" min="1" placeholder="¿Cuántas unidades llegaron?"
                  value={cantidad} onChange={e => setCantidad(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addToBatch()}
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:border-slate-400 focus:outline-none text-lg font-bold transition-all"
                />
              </div>
              <button onClick={addToBatch} disabled={!cantidad || parseInt(cantidad) <= 0}
                className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors disabled:bg-slate-300 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Agregar
              </button>
            </div>
            {cantidad && parseInt(cantidad) > 0 && (
              <p className="text-xs text-emerald-600 font-bold">
                Stock después de recibir: {selected.stock} + {cantidad} = <strong>{selected.stock + parseInt(cantidad)}</strong> unidades
              </p>
            )}
          </div>
        )}

        {/* Sugeridos: stock bajo */}
        {!selected && sugeridos.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Stock bajo — sugeridos para reponer
            </p>
            <div className="flex flex-wrap gap-2">
              {sugeridos.map(p => (
                <button key={p.id} onClick={() => selectProduct(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all hover:shadow-sm ${
                    p.stock === 0 ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  }`}>
                  <span>{p.nombre}</span>
                  <span className="opacity-70">{p.stock === 0 ? 'Agotado' : `${p.stock} un.`}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lote acumulado */}
      {batch.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/60">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <Truck className="w-5 h-5 text-slate-400" />
              Lote de Entrada
              <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-0.5 rounded-full ml-1">{batch.length}</span>
            </h3>
            <button onClick={() => setBatch([])} className="text-xs text-slate-400 hover:text-red-500 font-bold transition-colors flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Limpiar
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {batch.map(item => (
              <div key={item.productoId} className="flex items-center gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{item.nombre}</p>
                  <p className="text-xs text-slate-400 font-mono">{item.sku}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-sm">
                  <span className="text-slate-500">{item.stockAnterior}</span>
                  <ChevronRight className="w-3 h-3 text-slate-300" />
                  <span className="font-black text-emerald-600">{item.stockNuevo}</span>
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">+{item.cantidad}</span>
                </div>
                <button onClick={() => removeFromBatch(item.productoId)} className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Notas + confirmar */}
          <div className="px-5 py-4 border-t border-slate-100 space-y-3">
            <textarea
              value={notas} onChange={e => setNotas(e.target.value)} rows={2}
              placeholder="Notas de la entrada: proveedor, número de factura, lote…"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-slate-400 focus:bg-white transition-all resize-none"
            />
            <button
              onClick={confirmarEntrada} disabled={saving}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md text-sm"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                : <><CheckCircle className="w-4 h-4" /> Confirmar Entrada de Mercancía ({batch.length} productos)</>
              }
            </button>
          </div>
        </div>
      )}

      {scannerOpen && (
        <QRScannerModal
          isOpen={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={(code) => {
            const found = productos.find(p => p.sku === code);
            if (found) { selectProduct(found); setScannerOpen(false); }
            else { setSearch(code); setScannerOpen(false); setSearchOpen(true); }
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-tab: Historial de Cambios ────────────────────────────────────────
function HistorialTab() {
  const [movimientos,  setMovimientos]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tipoFiltro,   setTipoFiltro]   = useState('todos');
  const [diasFiltro,   setDiasFiltro]   = useState(7);
  const [searchProd,   setSearchProd]   = useState('');

  useEffect(() => { fetchMovimientos(); }, [diasFiltro]);

  const fetchMovimientos = async () => {
    setLoading(true);
    try {
      const desde = new Date();
      desde.setDate(desde.getDate() - diasFiltro);
      desde.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('*, usuarios_perfiles (nombre_completo)')
        .gte('created_at', desde.toISOString())
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setMovimientos(data || []);
    } catch (err) {
      console.error('Error cargando historial:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtrados = useMemo(() => movimientos.filter(m => {
    const matchTipo   = tipoFiltro === 'todos' || m.tipo === tipoFiltro;
    const matchSearch = !searchProd || m.nombre_producto.toLowerCase().includes(searchProd.toLowerCase());
    return matchTipo && matchSearch;
  }), [movimientos, tipoFiltro, searchProd]);

  const resumen = useMemo(() => ({
    entradas:    movimientos.filter(m => m.tipo === 'entrada').reduce((a, m) => a + m.cantidad, 0),
    salidas:     movimientos.filter(m => m.tipo === 'salida_venta').reduce((a, m) => a + Math.abs(m.cantidad), 0),
    ajustes:     movimientos.filter(m => m.tipo === 'ajuste').length,
  }), [movimientos]);

  return (
    <div className="space-y-4">
      {/* Resumen rápido */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
          <ArrowUpRight className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-0.5">Entradas</p>
          <p className="font-black text-xl text-blue-800">+{resumen.entradas} un.</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
          <ArrowDownRight className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-0.5">Salidas</p>
          <p className="font-black text-xl text-amber-800">-{resumen.salidas} un.</p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 text-center">
          <Settings2 className="w-5 h-5 text-purple-500 mx-auto mb-1" />
          <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-0.5">Ajustes</p>
          <p className="font-black text-xl text-purple-800">{resumen.ajustes}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Buscar producto…" value={searchProd} onChange={e => setSearchProd(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-slate-400 focus:outline-none text-sm transition-all" />
        </div>
        <div className="flex gap-2">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'entrada', label: 'Entradas' },
            { key: 'salida_venta', label: 'Ventas' },
            { key: 'ajuste', label: 'Ajustes' },
          ].map(f => (
            <button key={f.key} onClick={() => setTipoFiltro(f.key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                tipoFiltro === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>{f.label}</button>
          ))}
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDiasFiltro(d)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                diasFiltro === d ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Lista de movimientos */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin w-7 h-7 text-primary-900" /></div>
        ) : filtrados.length === 0 ? (
          <div className="py-14 text-center text-slate-400">
            <History className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">Sin movimientos en este período</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtrados.map(m => {
              const meta  = TIPO_META[m.tipo] || TIPO_META.ajuste;
              const Icon  = meta.icon;
              const delta = m.cantidad > 0 ? `+${m.cantidad}` : `${m.cantidad}`;
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className={`p-2 rounded-xl shrink-0 ${meta.cls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-sm truncate">{m.nombre_producto}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${meta.cls}`}>{meta.label}</span>
                      {m.notas && <span className="text-[10px] text-slate-400 truncate">{m.notas}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className={`font-black text-base ${m.cantidad > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{delta} un.</p>
                    <p className="text-[10px] text-slate-400 font-mono">{m.stock_anterior} → {m.stock_nuevo}</p>
                  </div>
                  <div className="text-right text-xs text-slate-400 shrink-0 w-20 leading-tight">
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
  const [subTab,        setSubTab]        = useState('catalogo');
  const [productos,     setProductos]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [isModalOpen,   setIsModalOpen]   = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [uploadingCSV,  setUploadingCSV]  = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchProductos(); }, []);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos').select('*').order('nombre');
      if (error) throw error;
      setProductos(data || []);
    } catch (err) {
      console.error('Error fetching products:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const categorias = useMemo(() =>
    [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort(),
    [productos]
  );

  const registrarMovimiento = async ({ productoId, nombreProducto, tipo, cantidad, stockAnterior, stockNuevo, notas }) => {
    try {
      await supabase.from('movimientos_inventario').insert([{
        producto_id:    productoId,
        nombre_producto: nombreProducto,
        tipo,
        cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo:    stockNuevo,
        notas:          notas || null,
        usuario_id:     userProfile?.id || null,
      }]);
    } catch (err) {
      console.error('Error registrando movimiento:', err.message);
    }
  };

  const handleSaveProduct = async (productData) => {
    try {
      if (productData._addStock && productData._existingId) {
        const { _existingId, _addStock, ...clean } = productData;
        const { data: existing } = await supabase
          .from('productos').select('stock, nombre').eq('id', _existingId).single();
        const nuevoStock = (existing?.stock || 0) + clean.stock;
        const { error } = await supabase.from('productos').update({ stock: nuevoStock }).eq('id', _existingId);
        if (error) throw error;
        await registrarMovimiento({
          productoId:    _existingId,
          nombreProducto: existing?.nombre || clean.nombre,
          tipo:          'entrada',
          cantidad:      clean.stock,
          stockAnterior: existing?.stock || 0,
          stockNuevo:    nuevoStock,
          notas:         'Entrada manual desde inventario',
        });

      } else if (selectedProduct) {
        const { error } = await supabase
          .from('productos').update(productData).eq('id', selectedProduct.id);
        if (error) throw error;
        if (productData.stock !== selectedProduct.stock) {
          await registrarMovimiento({
            productoId:    selectedProduct.id,
            nombreProducto: productData.nombre,
            tipo:          'ajuste',
            cantidad:      productData.stock - selectedProduct.stock,
            stockAnterior: selectedProduct.stock,
            stockNuevo:    productData.stock,
            notas:         'Ajuste manual',
          });
        }

      } else {
        const { data: newProd, error } = await supabase
          .from('productos').insert([productData]).select().single();
        if (error) throw error;
        if (newProd && productData.stock > 0) {
          await registrarMovimiento({
            productoId:    newProd.id,
            nombreProducto: productData.nombre,
            tipo:          'inicial',
            cantidad:      productData.stock,
            stockAnterior: 0,
            stockNuevo:    productData.stock,
            notas:         'Stock inicial al crear producto',
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
        const { error } = await supabase.from('productos').insert(newProducts);
        if (error) alert('Error al subir CSV: ' + error.message);
        else { alert(`${newProducts.length} productos importados.`); fetchProductos(); }
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

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Inventario</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {productos.length} productos · {productos.reduce((a, p) => a + p.stock, 0)} unidades en total
            </p>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex bg-white rounded-2xl border border-slate-200 shadow-sm p-1 w-fit">
          {SUB_TABS.map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
                subTab === t.key ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {subTab === 'catalogo' && (
          <CatalogoTab
            productos={productos} isAdmin={isAdmin} categorias={categorias}
            loading={loading}
            onEdit={p => { if (!isAdmin) return; setSelectedProduct(p); setIsModalOpen(true); }}
            onNew={() => { if (!isAdmin) return; setSelectedProduct(null); setIsModalOpen(true); }}
            onRefresh={fetchProductos}
            onCSV={handleCSVUpload}
            uploadingCSV={uploadingCSV}
            fileInputRef={fileInputRef}
          />
        )}

        {subTab === 'recepcion' && (
          <RecepcionTab
            productos={productos}
            userProfile={userProfile}
            onRefresh={fetchProductos}
            onRegistrarMovimiento={registrarMovimiento}
          />
        )}

        {subTab === 'historial' && <HistorialTab />}

      </div>

      {isModalOpen && (
        <ProductModal
          product={selectedProduct}
          categorias={categorias}
          onClose={() => { setIsModalOpen(false); setSelectedProduct(null); }}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
}
