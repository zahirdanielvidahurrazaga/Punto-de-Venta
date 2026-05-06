import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList } from 'lucide-react';
import Terminal from './components/Terminal';
import Inventario from './components/Inventario';
import Dashboard from './components/Dashboard';
import Pedidos from './components/Pedidos';
import { supabase } from './lib/supabaseClient';

function App() {
  const [activeTab, setActiveTab] = useState('terminal');
  const [ventas, setVentas] = useState([]);
  const [cart, setCart] = useState([]);

  const fetchVentas = async () => {
    try {
      const { data, error } = await supabase
        .from('ventas')
        .select(`
          *,
          venta_detalles (
            *,
            productos (*)
          )
        `)
        .order('fecha', { ascending: false });

      if (error) throw error;
      
      // Mapear datos para que coincidan con lo que esperan los componentes
      const mappedVentas = (data || []).map(v => ({
        ...v,
        items: v.venta_detalles.map(d => ({
          ...d.productos,
          quantity: d.cantidad,
          precio_unitario: d.precio_unitario
        })),
        pagos: {
          efectivo: v.pago_efectivo,
          tarjeta: v.pago_tarjeta,
          transferencia: v.pago_transferencia
        }
      }));

      setVentas(mappedVentas);
    } catch (error) {
      console.error('Error fetching sales:', error.message);
    }
  };

  useEffect(() => {
    fetchVentas();
  }, []);

  const handleRegisterSale = async (saleData) => {
    try {
      // 1. Insertar la venta principal
      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert([{ 
          total: saleData.total,
          pago_efectivo: saleData.pagos.efectivo,
          pago_tarjeta: saleData.pagos.tarjeta,
          pago_transferencia: saleData.pagos.transferencia
        }])
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Insertar los detalles de la venta
      const detalles = saleData.items.map(item => ({
        venta_id: venta.id,
        producto_id: item.id,
        cantidad: item.quantity,
        precio_unitario: item.precio
      }));

      const { error: detallesError } = await supabase
        .from('venta_detalles')
        .insert(detalles);

      if (detallesError) throw detallesError;

      // 3. Refrescar lista de ventas
      fetchVentas();
      return true;
    } catch (error) {
      console.error('Error registering sale:', error.message);
      return false;
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 flex flex-col font-sans">
      
      {/* Navbar principal (Responsive) */}
      <nav className="bg-white border-b border-slate-200 px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between sticky top-0 z-20 py-3 gap-3 sm:gap-0">
        
        {/* Logo / Título */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 lg:w-10 lg:h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30 shrink-0">
              <span className="text-white font-black text-lg lg:text-xl">P</span>
            </div>
            <span className="font-black text-lg lg:text-xl text-slate-800 tracking-tight">Plásticos POS</span>
          </div>
          
          {/* Branding Usuario Móvil */}
          <div className="text-xs font-medium text-slate-400 flex items-center gap-1 sm:hidden">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
            Cloud Sync
          </div>
        </div>

        {/* Navegación por pestañas (Scrollable en móvil) */}
        <div className="w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
          <div className="flex bg-slate-100 p-1 rounded-xl w-max sm:w-auto mx-auto sm:mx-0">
            <button 
              onClick={() => setActiveTab('terminal')}
              className={`px-4 lg:px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'terminal' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ShoppingCart className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Terminal</span>
            </button>
            <button 
              onClick={() => setActiveTab('pedidos')}
              className={`px-4 lg:px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'pedidos' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Pedidos</span>
            </button>
            <button 
              onClick={() => setActiveTab('inventario')}
              className={`px-4 lg:px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'inventario' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Package className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Inventario</span>
            </button>
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 lg:px-6 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-2 ${
                activeTab === 'dashboard' 
                  ? 'bg-white text-primary-600 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">Dashboard</span>
            </button>
          </div>
        </div>

        {/* Branding Usuario Desktop */}
        <div className="hidden sm:flex text-sm font-medium text-slate-400 items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          Conectado a Supabase
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'terminal' && <Terminal onRegisterSale={handleRegisterSale} cart={cart} setCart={setCart} />}
        {activeTab === 'pedidos' && <Pedidos ventas={ventas} />}
        {activeTab === 'inventario' && <Inventario />}
        {activeTab === 'dashboard' && <Dashboard ventas={ventas} />}
      </main>

      {/* Footer Branding Obligatorio */}
      <footer className="fixed bottom-4 right-4 bg-white/80 backdrop-blur px-4 py-2 rounded-full border border-slate-200 shadow-sm z-[100] pointer-events-none hidden sm:block">
        <p className="text-xs font-semibold text-slate-500">
          Desarrollado por <span className="text-primary-600 font-bold">Zahir Daniel</span>
        </p>
      </footer>
    </div>
  );
}

export default App;

