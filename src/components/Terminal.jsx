import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Box, Tag, X, Loader2, Plus, Minus, Sparkles, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from '../lib/useRealtime';
import CheckoutModal from './CheckoutModal';
import TicketModal from './TicketModal';

export default function Terminal({ onRegisterSale, cart, setCart, userProfile }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [paymentData, setPaymentData] = useState(null);

  // Aviso flotante. `tipo` distingue una confirmación de un bloqueo de venta.
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  // Comprobación de existencias contra la BD justo antes de abrir el cobro.
  const [verificando, setVerificando] = useState(false);

  const [isCartMobileOpen, setIsCartMobileOpen] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    fetchProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.sucursal_id]);

  const fetchProductos = async ({ silencioso = false } = {}) => {
    if (!silencioso) setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('productos_de_sucursal', { p_sucursal: userProfile?.sucursal_id });
      if (error) throw error;
      setProductos(data || []);
      return data || [];
    } catch (error) {
      console.error('Error fetching products:', error.message);
      return null;
    } finally {
      if (!silencioso) setLoading(false);
    }
  };

  // Stock en vivo: recepción de mercancía, transferencias entre sucursales o
  // una venta de la otra caja se reflejan aquí sin recargar. Se refresca en
  // silencio para no parpadear la rejilla mientras el cajero está cobrando.
  useRealtime(
    [
      { tabla: 'producto_stock', filtro: `sucursal_id=eq.${userProfile?.sucursal_id}` },
      { tabla: 'productos' },
    ],
    () => fetchProductos({ silencioso: true }),
    { activo: !!userProfile?.sucursal_id }
  );

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (texto, tipo = 'ok') => {
    setToast({ texto, tipo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tipo === 'error' ? 4000 : 2000);
  };

  // Existencia VIVA en la sucursal. El carrito guarda una copia del producto al
  // momento de escanearlo, así que su `stock` envejece: si la otra caja vende o
  // el ticket lleva rato abierto, ese número ya no sirve para decidir.
  const stockDe = (id) => {
    const p = productos.find((x) => x.id === id);
    return p ? Number(p.stock ?? 0) : 0;
  };

  useEffect(() => {
    if (!isCheckoutOpen && !isTicketOpen && !isCartMobileOpen) {
      inputRef.current?.focus();
    }
  }, [isCheckoutOpen, isTicketOpen, isCartMobileOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleStartCheckout();
      } else if (e.key === 'F2') {
        e.preventDefault();
        setCart([]);
      } else if (e.key === 'F4') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  // Filtrado en vivo: sin búsqueda muestra los "frecuentes"; al escribir filtra
  // por nombre o SKU, priorizando los que INICIAN con el término.
  const buscando = searchTerm.trim().length > 0;
  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return productos.slice(0, 16);
    const empieza = (p) =>
      p.nombre.toLowerCase().startsWith(t) || (p.sku || '').toLowerCase().startsWith(t);
    return productos
      .filter(p => p.nombre.toLowerCase().includes(t) || (p.sku || '').toLowerCase().includes(t))
      .sort((a, b) => {
        const ai = empieza(a), bi = empieza(b);
        if (ai !== bi) return ai ? -1 : 1;
        return a.nombre.localeCompare(b.nombre);
      })
      .slice(0, 24);
  }, [productos, searchTerm]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const termino = searchTerm.trim().toLowerCase();
      if (!termino) return;

      // 1) Coincidencia exacta de SKU (escáner). 2) Si la búsqueda deja un solo
      //    resultado, ese. Si hay varios, dejamos que el cajero toque la tarjeta.
      let product = productos.find(p => p.sku?.toLowerCase() === termino);
      if (!product && filtered.length === 1) product = filtered[0];

      if (product) {
        addToCart(product);
        setSearchTerm('');
      }
      inputRef.current?.focus();
    }
  };

  // No se puede vender lo que no hay. La BD ya rechaza la venta (el trigger
  // descontar_stock lanza 'Stock insuficiente'), pero lo hacía hasta el final:
  // el cliente ya había pagado y se perdía el ticket completo. El corte va aquí,
  // al escanear, que es cuando todavía se puede resolver con el cliente enfrente.
  const addToCart = (product) => {
    const disponible = stockDe(product.id);
    if (disponible <= 0) {
      showToast(`${product.nombre} no tiene existencia en esta sucursal`, 'error');
      return;
    }

    const enCarrito = cart.find(item => item.id === product.id)?.quantity || 0;
    if (enCarrito + 1 > disponible) {
      showToast(`Sólo quedan ${disponible} pz de ${product.nombre}`, 'error');
      return;
    }

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    showToast(`Se agregó ${product.nombre}`);
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id, delta) => {
    if (delta > 0) {
      const item = cart.find(i => i.id === id);
      const disponible = stockDe(id);
      if (item && item.quantity + delta > disponible) {
        showToast(`Sólo quedan ${disponible} pz de ${item.nombre}`, 'error');
        return;
      }
    }
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const getItemPrice = (item) => {
    if (item.cantidad_mayoreo && item.precio_mayoreo && item.quantity >= item.cantidad_mayoreo) {
      return Number(item.precio_mayoreo);
    }
    return Number(item.precio);
  };

  const total = cart.reduce((acc, item) => acc + (getItemPrice(item) * item.quantity), 0);
  const itemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Partidas que ya no alcanzan: el stock pudo bajar (otra caja, una
  // transferencia) con el ticket abierto.
  const sinExistencia = cart.filter(item => item.quantity > stockDe(item.id));

  // Antes de cobrar se relee el stock de la BD, no el que está en pantalla: el
  // ticket puede llevar minutos abierto y la otra caja pudo vender lo mismo.
  const handleStartCheckout = async () => {
    if (cart.length === 0 || verificando) return;

    setVerificando(true);
    const frescos = await fetchProductos({ silencioso: true });
    setVerificando(false);

    const lista = frescos || productos;
    const faltantes = cart
      .map(item => {
        const p = lista.find(x => x.id === item.id);
        const hay = p ? Number(p.stock ?? 0) : 0;
        return hay < item.quantity ? `${item.nombre} (pide ${item.quantity}, hay ${hay})` : null;
      })
      .filter(Boolean);

    if (faltantes.length > 0) {
      showToast(`Sin existencia: ${faltantes.join(' · ')}`, 'error');
      return;
    }

    setIsCheckoutOpen(true);
    setIsCartMobileOpen(false);
  };

  const handleCheckoutComplete = async (data) => {
    setPaymentData(data);
    setIsCheckoutOpen(false);

    if (onRegisterSale) {
      const success = await onRegisterSale({
        total,
        items: cart,
        pagos: data
      });

      if (success) {
        setIsTicketOpen(true);
      }
    }
  };

  const handleNewSale = () => {
    setPaymentData(null);
    setIsTicketOpen(false);
    setCart([]);
    inputRef.current?.focus();
    fetchProductos();
  };

  const CartContent = () => (
    <div className="grid grid-rows-[auto_1fr_auto] h-full w-full overflow-hidden">
      {/* Header del carrito */}
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Ticket actual</p>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mt-0.5">
            <ShoppingCart className="w-4 h-4 text-accent-600" />
            Carrito
          </h2>
        </div>
        <div className="flex gap-2 items-center">
          <span className="neb-chip neb-chip-info">
            {itemsCount} items
          </span>
          <button
            onClick={() => setCart([])}
            className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-[11px] font-bold hover:bg-rose-100 transition-colors"
            title="Limpiar (F2)"
          >
            F2 · Limpiar
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="overflow-y-auto neb-scroll px-4 pb-2 space-y-2.5">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-3 py-12">
            <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <ShoppingCart className="w-7 h-7 opacity-50" />
            </div>
            <p className="text-sm font-bold">El ticket está vacío</p>
            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">Escanea o busca productos para empezar</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="neb-card-soft p-3.5 group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-sm truncate leading-tight">{item.nombre}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{item.sku}</span>
                    <span className="text-[10px] font-bold text-accent-700 bg-accent-50 px-1.5 py-0.5 rounded">
                      ${getItemPrice(item).toFixed(2)} c/u
                    </span>
                    {item.cantidad_mayoreo && item.quantity >= item.cantidad_mayoreo && (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Tag className="w-3 h-3" /> Mayoreo aplicado
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {item.quantity > stockDe(item.id) && (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Sólo hay {stockDe(item.id)} en existencia
                </div>
              )}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
                  <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white active:scale-90 transition-transform">
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-7 text-center font-extrabold text-slate-900 dark:text-white text-sm">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white active:scale-90 transition-transform">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                  ${(item.quantity * getItemPrice(item)).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer con total */}
      <div className="p-5 border-t border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Total</span>
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{itemsCount} items</span>
        </div>
        <div className="flex items-end justify-between mb-4">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            ${total.toFixed(2)}
          </span>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">MXN</span>
        </div>
        <button
          onClick={handleStartCheckout}
          disabled={cart.length === 0 || sinExistencia.length > 0 || verificando}
          className="w-full neb-btn neb-btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {verificando ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Revisando existencias...</>
          ) : sinExistencia.length > 0 ? (
            <><AlertTriangle className="w-5 h-5" /> Revisa el ticket</>
          ) : (
            <><CreditCard className="w-5 h-5" /> COBRAR · F1</>
          )}
        </button>
        {sinExistencia.length > 0 && (
          <p className="mt-2.5 text-center text-[11px] font-bold leading-snug text-rose-600 dark:text-rose-400">
            No hay existencia para {sinExistencia.map(i => i.nombre).join(', ')}. Bájale la cantidad o quítalo del ticket.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full relative overflow-hidden">

      {/* Columna izquierda: buscador + grid de productos */}
      <div className="w-full lg:w-2/3 flex flex-col p-5 lg:p-6 gap-5 h-[calc(100vh-140px)] lg:h-full overflow-hidden">
        {/* Header de Terminal */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Terminal de venta</p>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">Punto de cobro</h1>
          </div>
          <span className="neb-chip neb-chip-positive hidden sm:inline-flex">
            <span className="neb-status-dot bg-emerald-500" /> En línea
          </span>
        </div>

        {/* Buscador */}
        <div className="relative neb-card overflow-hidden shrink-0">
          <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400 dark:text-slate-500" />
          </div>
          <input
            ref={inputRef}
            type="text"
            className="block w-full pl-14 pr-4 py-4 lg:py-5 text-lg text-slate-900 dark:text-white bg-transparent focus:outline-none focus:ring-4 focus:ring-accent-200/40 transition-all placeholder:text-slate-400 dark:text-slate-500 font-bold rounded-3xl"
            placeholder="Escanea o busca producto · F4"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearch}
            autoComplete="off"
          />
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <kbd className="hidden sm:inline-flex px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800">F4</kbd>
          </div>
        </div>

        {/* Productos frecuentes */}
        <div className="flex-1 overflow-y-auto neb-scroll pr-1 pb-20 lg:pb-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Box className="w-4 h-4 text-accent-600" />
              {buscando ? `Resultados (${filtered.length})` : 'Productos frecuentes'}
            </h2>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Tap para agregar</span>
          </div>
          {loading ? (
             <div className="flex flex-col items-center justify-center p-10 text-slate-400 dark:text-slate-500">
               <Loader2 className="w-7 h-7 animate-spin mb-3 text-accent-500" />
               <p className="text-sm font-bold">Cargando productos...</p>
             </div>
          ) : buscando && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-slate-400 dark:text-slate-500">
              <Search className="w-7 h-7 mb-3 opacity-50" />
              <p className="text-sm font-bold">Sin resultados para “{searchTerm.trim()}”</p>
              <p className="text-[12px]">Revisa el nombre o el SKU.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((product) => {
                const disponible = Number(product.stock ?? 0);
                const agotado = disponible <= 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={agotado}
                    title={agotado ? `${product.nombre} — sin existencia` : product.nombre}
                    className={`neb-card p-4 flex flex-col items-start gap-2 group text-left h-full min-w-0 transition-all ${
                      agotado
                        ? 'opacity-60 cursor-not-allowed'
                        : 'hover:-translate-y-0.5 hover:border-accent-200 active:scale-[0.97]'
                    }`}
                  >
                    <div className={`p-2 rounded-xl transition-colors ${agotado ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-accent-50 group-hover:bg-accent-100'}`}>
                      {agotado
                        ? <AlertTriangle className="w-4 h-4 text-rose-600" />
                        : <Tag className="w-4 h-4 text-accent-700" />}
                    </div>
                    <div className="w-full font-extrabold text-slate-900 dark:text-white text-sm line-clamp-2 break-words leading-tight min-h-[2.4em]">
                      {product.nombre}
                    </div>
                    <div className="w-full truncate text-slate-400 dark:text-slate-500 font-mono text-[10px]">{product.sku}</div>
                    <div className="w-full flex items-end justify-between gap-2 mt-auto">
                      <span className="text-slate-900 dark:text-white font-extrabold text-base">
                        ${Number(product.precio).toFixed(2)}
                      </span>
                      {/* Mismos umbrales que Inventario: <=5 crítico, <=20 bajo. */}
                      <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        disponible <= 5
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : disponible <= 20
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {agotado ? 'Sin existencia' : `${disponible} pz`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Carrito desktop */}
      <div className="hidden lg:flex w-1/3 border-l border-white/60 flex-col bg-white/60 dark:bg-slate-900/60 h-full overflow-hidden">
        <CartContent />
      </div>

      {/* Mobile floating cart bar */}
      <div className="lg:hidden fixed bottom-[88px] left-3 right-3 z-30">
        <button
          onClick={() => setIsCartMobileOpen(true)}
          className="w-full neb-btn neb-btn-primary py-4 flex items-center justify-between !rounded-2xl"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              {itemsCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-accent-500 text-white text-[10px] w-4.5 h-4.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full font-extrabold">
                  {itemsCount}
                </span>
              )}
            </div>
            <span>Ver ticket</span>
          </div>
          <span className="text-lg font-extrabold">${total.toFixed(2)}</span>
        </button>
      </div>

      {isCartMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex flex-col justify-end animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 w-full h-[85vh] rounded-t-3xl flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
            <div className="px-5 py-4 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-white">Carrito de compra</h2>
              <button onClick={() => setIsCartMobileOpen(false)} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CartContent />
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-20 lg:top-8 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md animate-in fade-in slide-in-from-top-4 duration-300">
          <div className={`neb-glass-strong px-5 py-3 rounded-2xl font-bold flex items-start gap-2 text-sm ${
            toast.tipo === 'error'
              ? 'text-rose-700 dark:text-rose-300 ring-2 ring-rose-300/60 dark:ring-rose-800/60'
              : 'text-slate-800 dark:text-slate-200'
          }`}>
            {toast.tipo === 'error'
              ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              : <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-accent-500" />}
            <span className="leading-snug">{toast.texto}</span>
          </div>
        </div>
      )}

      {isCheckoutOpen && (
        <CheckoutModal
          total={total}
          onClose={() => setIsCheckoutOpen(false)}
          onComplete={handleCheckoutComplete}
        />
      )}

      {isTicketOpen && (
        <TicketModal
          cart={cart}
          total={total}
          paymentData={paymentData}
          sucursal={userProfile?.sucursales}
          onClose={handleNewSale}
        />
      )}
    </div>
  );
}
