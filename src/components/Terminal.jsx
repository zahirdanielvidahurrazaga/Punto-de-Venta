import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Box, Tag, X, Loader2, Plus, Minus, Sparkles, AlertTriangle, TrendingDown } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from '../lib/useRealtime';
import { precioUnitario, aplicaMayoreo, faltanParaMayoreo, ahorroTotal, desglosePartida } from '../lib/precios';
import { indexarProductos, buscarEnIndice, esCoincidenciaAproximada, normaliza } from '../lib/buscar';
import CheckoutModal from './CheckoutModal';
import TicketModal from './TicketModal';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

// ────────────────────────────────────────────────────────────────────────────
// El carrito vive FUERA de Terminal a propósito.
//
// Antes se declaraba dentro del render (`const CartContent = () => …`): en cada
// render nacía una función nueva, así que para React era un componente DISTINTO
// y desmontaba y volvía a montar todo el carrito. Eso es lo que reportó el
// dueño ("cuando llevas muchos productos se sube de golpe a los primeros"): al
// montarse de nuevo, la lista es un `<div>` nuevo y el scroll arranca en cero.
// Pasaba al agregar un producto, al teclear en el buscador y hasta cuando se
// iba solo el aviso flotante.
// ────────────────────────────────────────────────────────────────────────────
function CartPanel({
  cart, itemsCount, total, ahorro, verificando, sinExistencia, stockDe, resaltado,
  onLimpiar, onQuitar, onCantidad, onCobrar,
}) {
  const filas = useRef(new Map());

  // Llevar al cajero hasta la partida que acaba de tocar: con el ticket largo,
  // lo que agrega cae fuera de la pantalla y no alcanza a ver si entró.
  useEffect(() => {
    if (!resaltado) return;
    filas.current.get(resaltado)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [resaltado, cart]);

  return (
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
            onClick={onLimpiar}
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
          cart.map((item) => {
            // Mismo desglose que el ticket impreso: un solo cálculo para lo que
            // ve el cajero, lo que ve el cliente y lo que cobra la base.
            const { unitario, importe, mayoreo: enMayoreo, normal } = desglosePartida(item);
            const disponible = stockDe(item.id);
            // Aviso de "una más y le sale más barato". Solo si de verdad se
            // puede surtir: no tiene caso ofrecer lo que no hay en piso.
            const faltan = faltanParaMayoreo(item);
            const ofrecerMayoreo = faltan !== null && disponible >= Number(item.cantidad_mayoreo);

            return (
              <div
                key={item.id}
                ref={(el) => { if (el) filas.current.set(item.id, el); else filas.current.delete(item.id); }}
                className={`neb-card-soft p-3.5 group transition-all duration-300 ${
                  resaltado === item.id ? 'ring-2 ring-accent-400 bg-accent-50/60 dark:bg-accent-950/30' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-sm truncate leading-tight">{item.nombre}</h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{item.sku}</span>
                      <span className="text-[10px] font-bold text-accent-700 bg-accent-50 px-1.5 py-0.5 rounded">
                        {money(unitario)} c/u
                      </span>
                      {enMayoreo && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Mayoreo · antes {money(normal)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onQuitar(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {ofrecerMayoreo && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                    {faltan === 1 ? 'Con 1 pieza más' : `Con ${faltan} piezas más`} baja a {money(item.precio_mayoreo)} c/u
                  </div>
                )}

                {item.quantity > disponible && (
                  <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-2 py-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Sólo hay {disponible} en existencia
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
                    <button onClick={() => onCantidad(item.id, -1)} className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white active:scale-90 transition-transform">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-7 text-center font-extrabold text-slate-900 dark:text-white text-sm">{item.quantity}</span>
                    <button onClick={() => onCantidad(item.id, 1)} className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 shadow-sm flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white active:scale-90 transition-transform">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="font-extrabold text-slate-900 dark:text-white text-sm">
                    {money(importe)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer con total */}
      <div className="p-5 border-t border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Total</span>
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">{itemsCount} items</span>
        </div>
        {ahorro > 0 && (
          <div className="flex justify-between items-center mb-2 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
            <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Ahorro por mayoreo</span>
            <span>−{money(ahorro)}</span>
          </div>
        )}
        <div className="flex items-end justify-between mb-4">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {money(total)}
          </span>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">MXN</span>
        </div>
        <button
          onClick={onCobrar}
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
}

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

  // Partida recién tocada: se resalta y se trae a la vista un momento.
  const [resaltado, setResaltado] = useState(null);
  const resaltadoTimer = useRef(null);

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

  useEffect(() => () => {
    clearTimeout(toastTimer.current);
    clearTimeout(resaltadoTimer.current);
  }, []);

  const showToast = (texto, tipo = 'ok') => {
    setToast({ texto, tipo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tipo === 'error' ? 4000 : 2000);
  };

  const resaltar = (id) => {
    setResaltado(id);
    clearTimeout(resaltadoTimer.current);
    resaltadoTimer.current = setTimeout(() => setResaltado(null), 1500);
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

  // El catálogo se normaliza una sola vez (sin acentos, en palabras) y se
  // reusa en cada tecla; con ~370 productos rehacerlo por pulsación es tirar
  // trabajo. Ver src/lib/buscar.js para las reglas de coincidencia.
  const indice = useMemo(() => indexarProductos(productos), [productos]);

  const buscando = searchTerm.trim().length > 0;
  const filtered = useMemo(() => {
    if (!buscando) return productos.slice(0, 16);
    return buscarEnIndice(indice, searchTerm, 24);
  }, [productos, indice, searchTerm, buscando]);

  // Cuando lo escrito no aparece tal cual en ningún producto, los resultados
  // vienen del rescate por errores de dedo: hay que decirlo, para que el cajero
  // confirme que es el producto que quería y no cobre otro.
  const aproximado = useMemo(
    () => (buscando && filtered.length > 0 ? esCoincidenciaAproximada(indice, searchTerm) : false),
    [indice, searchTerm, buscando, filtered.length]
  );

  const handleSearch = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const termino = normaliza(searchTerm);
    if (!termino) return;

    // 1) Coincidencia exacta de SKU (escáner). 2) Si la búsqueda deja un solo
    //    resultado, ese. Si hay varios, dejamos que el cajero toque la tarjeta.
    let product = productos.find(p => normaliza(p.sku) === termino);
    if (!product && filtered.length === 1) product = filtered[0];

    if (product) {
      addToCart(product);
      setSearchTerm('');
    } else if (filtered.length === 0) {
      // El escáner leyendo un código que no está en el catálogo antes no
      // decía nada: el cajero volvía a escanear creyendo que no leyó.
      showToast(`No se encontró “${searchTerm.trim()}”. Revisa el nombre o dalo de alta.`, 'error');
    }
    inputRef.current?.focus();
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

    resaltar(product.id);

    // Al llegar al mayoreo con el cliente enfrente, decirlo en voz alta: es la
    // diferencia entre que se lleve 2 y que se lleve 3.
    const baja = Number(product.precio_mayoreo) > 0 && Number(product.precio_mayoreo) < Number(product.precio);
    const enMayoreo = baja && aplicaMayoreo(product, enCarrito + 1);
    const antes = baja && aplicaMayoreo(product, enCarrito);
    if (enMayoreo && !antes) {
      showToast(`${product.nombre} · ya es MAYOREO a ${money(product.precio_mayoreo)} c/u`);
    } else {
      showToast(`Se agregó ${product.nombre}`);
    }
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
    resaltar(id);
  };

  // El precio (con o sin mayoreo) sale de src/lib/precios.js, que aplica la
  // MISMA regla que `registrar_venta` en la base y que el ticket impreso.
  const total = cart.reduce((acc, item) => acc + (precioUnitario(item) * item.quantity), 0);
  const itemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const ahorro = ahorroTotal(cart);

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

  const propsCarrito = {
    cart, itemsCount, total, ahorro, verificando, sinExistencia, stockDe, resaltado,
    onLimpiar: () => setCart([]),
    onQuitar: removeFromCart,
    onCantidad: updateQuantity,
    onCobrar: handleStartCheckout,
  };

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
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center gap-2">
            {buscando && (
              <button
                onClick={() => { setSearchTerm(''); inputRef.current?.focus(); }}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 transition-colors"
                title="Borrar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
          {aproximado && (
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-[12px] font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              No hay nada escrito así. Esto es lo más parecido — confirma que sea el producto.
            </div>
          )}
          {loading ? (
             <div className="flex flex-col items-center justify-center p-10 text-slate-400 dark:text-slate-500">
               <Loader2 className="w-7 h-7 animate-spin mb-3 text-accent-500" />
               <p className="text-sm font-bold">Cargando productos...</p>
             </div>
          ) : buscando && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-slate-400 dark:text-slate-500">
              <Search className="w-7 h-7 mb-3 opacity-50" />
              <p className="text-sm font-bold">Sin resultados para “{searchTerm.trim()}”</p>
              <p className="text-[12px]">Prueba con una sola palabra del nombre, o con el SKU.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((product) => {
                const disponible = Number(product.stock ?? 0);
                const agotado = disponible <= 0;
                const tieneMayoreo =
                  Number(product.precio_mayoreo) > 0 &&
                  Number(product.cantidad_mayoreo) > 0 &&
                  Number(product.precio_mayoreo) < Number(product.precio);
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
                        {money(product.precio)}
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
                    {/* El mayoreo a la vista: el cajero puede ofrecerlo sin
                        tener que acordarse de cuáles bajan de precio. */}
                    {tieneMayoreo && (
                      <div className="w-full text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                        {product.cantidad_mayoreo}+ pz a {money(product.precio_mayoreo)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Carrito desktop */}
      <div className="hidden lg:flex w-1/3 border-l border-white/60 flex-col bg-white/60 dark:bg-slate-900/60 h-full overflow-hidden">
        <CartPanel {...propsCarrito} />
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
          <span className="text-lg font-extrabold">{money(total)}</span>
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
              <CartPanel {...propsCarrito} />
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
