import React, { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Box, Tag, X, Loader2, Lock, Plus, Minus, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import CheckoutModal from './CheckoutModal';
import TicketModal from './TicketModal';

export default function Terminal({ onRegisterSale, cart, setCart, userProfile }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isTicketOpen, setIsTicketOpen] = useState(false);
  const [paymentData, setPaymentData] = useState(null);

  // Pin Modal State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLockoutTime, setPinLockoutTime] = useState(null);

  // Toast State
  const [toastMessage, setToastMessage] = useState(null);

  const [isCartMobileOpen, setIsCartMobileOpen] = useState(false);
  const inputRef = useRef(null);
  const pinInputRef = useRef(null);

  const isAdmin = userProfile?.rol === 'admin';

  useEffect(() => {
    fetchProductos();
  }, []);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true });
      if (error) throw error;
      setProductos(data || []);
    } catch (error) {
      console.error('Error fetching products:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isCheckoutOpen && !isTicketOpen && !isCartMobileOpen && !isPinModalOpen) {
      inputRef.current?.focus();
    } else if (isPinModalOpen) {
      pinInputRef.current?.focus();
    }
  }, [isCheckoutOpen, isTicketOpen, isCartMobileOpen, isPinModalOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleStartCheckout();
      } else if (e.key === 'F2') {
        e.preventDefault();
        requireAdminAction(() => setCart([]));
      } else if (e.key === 'F4') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const skuOrName = searchTerm.trim().toLowerCase();

      const product = productos.find(
        p => p.sku === skuOrName || p.nombre.toLowerCase().includes(skuOrName)
      );

      if (product) {
        addToCart(product);
      }
      setSearchTerm('');
      inputRef.current?.focus();
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });

    setToastMessage(`Se agregó ${product.nombre}`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const checkPinLockout = () => {
    const lockout = localStorage.getItem('pin_lockout_time');
    if (lockout && Date.now() < parseInt(lockout)) {
      setPinLockoutTime(parseInt(lockout));
      return true;
    }
    if (lockout && Date.now() >= parseInt(lockout)) {
      localStorage.removeItem('pin_lockout_time');
      localStorage.setItem('pin_attempts', '0');
      setPinLockoutTime(null);
    }
    return false;
  };

  const requireAdminAction = (action) => {
    if (isAdmin) {
      action();
    } else {
      if (checkPinLockout()) {
        setPinError('');
      } else {
        setPinError('');
      }
      setPinAction(() => action);
      setPinInput('');
      setIsPinModalOpen(true);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (checkPinLockout()) return;

    try {
      const { data: isValid, error } = await supabase
        .rpc('verificar_pin_admin', { pin_ingresado: pinInput });

      if (isValid && !error) {
        localStorage.setItem('pin_attempts', '0');
        setIsPinModalOpen(false);
        if (pinAction) pinAction();
      } else {
        let attempts = parseInt(localStorage.getItem('pin_attempts') || '0') + 1;
        localStorage.setItem('pin_attempts', attempts.toString());

        if (attempts >= 3) {
          const lockoutTime = Date.now() + 3 * 60 * 1000;
          localStorage.setItem('pin_lockout_time', lockoutTime.toString());
          setPinLockoutTime(lockoutTime);
          setPinError('Demasiados intentos. Bloqueado por 3 minutos.');
        } else {
          setPinError(`PIN incorrecto. Intentos restantes: ${3 - attempts}`);
        }
      }
    } catch (err) {
      setPinError('Error verificando PIN');
    }
  };

  useEffect(() => {
    let interval;
    if (pinLockoutTime) {
      interval = setInterval(() => {
        if (Date.now() >= pinLockoutTime) {
          localStorage.removeItem('pin_lockout_time');
          localStorage.setItem('pin_attempts', '0');
          setPinLockoutTime(null);
        } else {
          setPinLockoutTime(parseInt(localStorage.getItem('pin_lockout_time')));
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pinLockoutTime]);

  const removeFromCart = (id) => {
    requireAdminAction(() => {
      setCart(prev => prev.filter(item => item.id !== id));
    });
  };

  const updateQuantity = (id, delta) => {
    if (delta < 0) {
      requireAdminAction(() => updateQuantityLogic(id, delta));
    } else {
      updateQuantityLogic(id, delta);
    }
  };

  const updateQuantityLogic = (id, delta) => {
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

  const handleStartCheckout = () => {
    if (cart.length > 0) {
      setIsCheckoutOpen(true);
      setIsCartMobileOpen(false);
    }
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
            onClick={() => requireAdminAction(() => setCart([]))}
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
          disabled={cart.length === 0}
          className="w-full neb-btn neb-btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CreditCard className="w-5 h-5" />
          COBRAR · F1
        </button>
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
              <Box className="w-4 h-4 text-accent-600" /> Productos frecuentes
            </h2>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Tap para agregar</span>
          </div>
          {loading ? (
             <div className="flex flex-col items-center justify-center p-10 text-slate-400 dark:text-slate-500">
               <Loader2 className="w-7 h-7 animate-spin mb-3 text-accent-500" />
               <p className="text-sm font-bold">Cargando productos...</p>
             </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {productos.slice(0, 16).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="neb-card p-4 flex flex-col items-start gap-2 group text-left h-full hover:-translate-y-0.5 hover:border-accent-200 transition-all active:scale-[0.97]"
                >
                  <div className="bg-accent-50 p-2 rounded-xl group-hover:bg-accent-100 transition-colors">
                    <Tag className="w-4 h-4 text-accent-700" />
                  </div>
                  <div className="font-extrabold text-slate-900 dark:text-white text-sm line-clamp-2 leading-tight">
                    {product.nombre}
                  </div>
                  <div className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">{product.sku}</div>
                  <div className="text-slate-900 dark:text-white font-extrabold mt-auto text-base">
                    ${Number(product.precio).toFixed(2)}
                  </div>
                </button>
              ))}
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
      {toastMessage && (
        <div className="fixed top-20 lg:top-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="neb-glass-strong px-5 py-3 rounded-2xl font-bold flex items-center gap-2 text-sm text-slate-800 dark:text-slate-200">
            <Sparkles className="w-4 h-4 text-accent-500" />
            {toastMessage}
          </div>
        </div>
      )}

      {/* PIN Modal */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="neb-glass-strong rounded-3xl w-full max-w-sm p-7">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-3">
                <Lock className="w-6 h-6 text-rose-500" />
              </div>
              <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Acción restringida</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-semibold mt-1.5">
                {pinLockoutTime
                  ? 'Demasiados intentos fallidos'
                  : 'Ingresa el PIN de administrador para continuar'}
              </p>
            </div>
            <form onSubmit={handlePinSubmit} className="space-y-3.5">
              {pinLockoutTime ? (
                <div className="text-center p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                  <p className="text-rose-600 font-extrabold text-sm">Bloqueado temporalmente</p>
                  <p className="text-rose-500 text-sm mt-1 font-mono">
                     {Math.max(0, Math.ceil((pinLockoutTime - Date.now()) / 1000))}s restantes
                  </p>
                </div>
              ) : (
                <input
                  ref={pinInputRef}
                  type="password"
                  className="neb-input text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="••••"
                  maxLength={6}
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  autoComplete="off"
                />
              )}
              {pinError && <p className="text-rose-600 text-xs text-center font-bold bg-rose-50 border border-rose-100 py-2 rounded-xl">{pinError}</p>}
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 neb-btn neb-btn-ghost py-3"
                >
                  Cancelar
                </button>
                {!pinLockoutTime && (
                  <button
                    type="submit"
                    className="flex-1 neb-btn neb-btn-primary py-3"
                  >
                    Autorizar
                  </button>
                )}
              </div>
            </form>
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
          onClose={handleNewSale}
        />
      )}
    </div>
  );
}
