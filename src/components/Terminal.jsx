import React, { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, CreditCard, Box, Tag, X, Loader2, Lock } from 'lucide-react';
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
  const [pinAction, setPinAction] = useState(null); // Function to execute if PIN is correct
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

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

  // Atajos de teclado F1, F2, F4
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
  };

  const requireAdminAction = (action) => {
    if (isAdmin) {
      action();
    } else {
      setPinAction(() => action);
      setPinInput('');
      setPinError('');
      setIsPinModalOpen(true);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    try {
      // Verificar el PIN contra la base de datos para admins
      const { data, error } = await supabase
        .from('usuarios_perfiles')
        .select('*')
        .eq('rol', 'admin')
        .eq('pin_seguridad', pinInput)
        .single();

      if (data && !error) {
        setIsPinModalOpen(false);
        if (pinAction) pinAction();
      } else {
        setPinError('PIN incorrecto o no autorizado');
      }
    } catch (err) {
      setPinError('Error verificando PIN');
    }
  };

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

  const total = cart.reduce((acc, item) => acc + (Number(item.precio) * item.quantity), 0);
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
      } else {
        alert("Hubo un error al registrar la venta en la base de datos.");
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
    <div className="grid grid-rows-[auto_1fr_auto] h-full bg-white overflow-hidden w-full">
      <div className="p-4 lg:p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary-900" />
          Ticket Actual
        </h2>
        <div className="flex gap-2">
          <button onClick={() => requireAdminAction(() => setCart([]))} className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors" title="Limpiar Ticket (F2)">
            F2 Limpiar
          </button>
          <span className="bg-primary-100 text-primary-900 py-1 px-3 rounded-lg text-sm font-bold">
            {itemsCount} items
          </span>
        </div>
      </div>

      <div className="overflow-y-auto p-4 space-y-3 bg-slate-50/30">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
            <ShoppingCart className="w-16 h-16 opacity-20" />
            <p>El ticket está vacío</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="bg-white p-3 lg:p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-800 truncate leading-tight">{item.nombre}</h3>
                <div className="text-xs lg:text-sm text-slate-500 font-mono mt-1">{item.sku}</div>
                <div className="text-primary-900 font-bold mt-1">${Number(item.precio).toFixed(2)} c/u</div>
              </div>
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto mt-2 sm:mt-0">
                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                  <button onClick={() => updateQuantity(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm hover:bg-slate-50 text-slate-600 font-bold">-</button>
                  <span className="w-8 text-center font-semibold">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-white rounded shadow-sm hover:bg-slate-50 text-slate-600 font-bold">+</button>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 lg:p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] pb-[80px] lg:pb-6">
        <div className="space-y-2 lg:space-y-3 mb-4 lg:mb-6">
          <div className="flex justify-between items-center text-2xl lg:text-3xl font-black text-slate-800">
            <span>Total</span>
            <span className="text-primary-900">${total.toFixed(2)}</span>
          </div>
        </div>
        <button
          onClick={handleStartCheckout}
          disabled={cart.length === 0}
          className="w-full bg-primary-900 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-4 lg:py-5 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-primary-900/20 hover:shadow-primary-900/40 active:scale-[0.98]"
        >
          <CreditCard className="w-6 h-6" />
          COBRAR (F1)
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-full bg-slate-100 relative overflow-hidden">
      
      <div className="w-full lg:w-2/3 flex flex-col p-4 lg:p-6 space-y-4 lg:space-y-6 h-[calc(100vh-140px)] lg:h-full overflow-hidden">
        <div className="relative bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-6 w-6 text-slate-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            className="block w-full pl-12 pr-4 py-4 lg:py-5 text-xl text-slate-900 bg-transparent focus:outline-none focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-400 font-medium"
            placeholder="Escanea o busca producto (F4)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearch}
            autoComplete="off"
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-20 lg:pb-0">
          <h2 className="text-base lg:text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Box className="w-5 h-5 text-primary-900" /> Productos Frecuentes
          </h2>
          {loading ? (
             <div className="flex flex-col items-center justify-center p-10 text-slate-400">
               <Loader2 className="w-8 h-8 animate-spin mb-4" />
               <p>Cargando productos...</p>
             </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
              {productos.slice(0, 16).map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-white p-3 lg:p-4 rounded-2xl shadow-sm border border-slate-100 hover:border-primary-300 hover:shadow-md transition-all flex flex-col items-start gap-2 group text-left h-full active:scale-95"
                >
                  <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-primary-50 transition-colors">
                    <Tag className="w-5 h-5 lg:w-6 lg:h-6 text-primary-900" />
                  </div>
                  <div className="font-bold text-slate-800 text-sm lg:text-base line-clamp-2 leading-tight">
                    {product.nombre}
                  </div>
                  <div className="text-slate-500 font-mono text-xs">{product.sku}</div>
                  <div className="text-primary-900 font-black mt-auto text-base lg:text-lg">
                    ${Number(product.precio).toFixed(2)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:flex w-1/3 border-l border-slate-200 flex-col shadow-2xl z-10 bg-white h-full overflow-hidden">
        <CartContent />
      </div>

      <div className="lg:hidden fixed bottom-[64px] left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 z-30">
        <button 
          onClick={() => setIsCartMobileOpen(true)}
          className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold flex items-center justify-between shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-6 h-6" />
              {itemsCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary-600 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                  {itemsCount}
                </span>
              )}
            </div>
            <span>Ver Ticket</span>
          </div>
          <span className="text-xl">${total.toFixed(2)}</span>
        </button>
      </div>

      {isCartMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm flex flex-col justify-end animate-in fade-in">
          <div className="bg-white w-full h-[85vh] rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-full duration-300 overflow-hidden">
            <div className="p-4 flex justify-between items-center border-b border-slate-100 shrink-0">
              <h2 className="font-bold text-lg text-slate-800">Carrito de Compra</h2>
              <button onClick={() => setIsCartMobileOpen(false)} className="bg-slate-100 p-2 rounded-full text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CartContent />
            </div>
          </div>
        </div>
      )}

      {/* Modal de PIN */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <Lock className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-slate-800">Acción Restringida</h3>
              <p className="text-slate-500 text-sm mt-1">Ingresa el PIN de administrador para continuar.</p>
            </div>
            <form onSubmit={handlePinSubmit} className="space-y-4">
              <input
                ref={pinInputRef}
                type="password"
                className="w-full text-center text-2xl tracking-widest font-mono p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all"
                placeholder="****"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoComplete="off"
              />
              {pinError && <p className="text-red-500 text-sm text-center font-bold">{pinError}</p>}
              <div className="flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsPinModalOpen(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-4 py-3 bg-primary-900 text-white rounded-xl font-bold hover:bg-primary-800"
                >
                  Autorizar
                </button>
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
