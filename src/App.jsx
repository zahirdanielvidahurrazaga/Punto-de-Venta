import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList, LogOut, Loader2, Box, Clock, Wallet } from 'lucide-react';
import Terminal from './components/Terminal';
import Inventario from './components/Inventario';
import Dashboard from './components/Dashboard';
import Pedidos from './components/Pedidos';
import Login from './components/Login';
import CajaModal from './components/CajaModal';
import RelojChecador from './components/RelojChecador';
import { supabase } from './lib/supabaseClient';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState('terminal');
  const [ventas, setVentas] = useState([]);
  const [cart, setCart] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchUserProfile(session.user.id);
      else setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setLoadingAuth(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('usuarios_perfiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      setUserProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error.message);
    } finally {
      setLoadingAuth(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const fetchVentas = async () => {
    if (!session) return;
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
    if (session) {
      fetchVentas();
    }
  }, [session]);

  const handleRegisterSale = async (saleData) => {
    try {
      const { data: venta, error: ventaError } = await supabase
        .from('ventas')
        .insert([{ 
          total: saleData.total,
          pago_efectivo: saleData.pagos.efectivo,
          pago_tarjeta: saleData.pagos.tarjeta,
          pago_transferencia: saleData.pagos.transferencia,
          user_id: session.user.id
        }])
        .select()
        .single();

      if (ventaError) throw ventaError;

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

      fetchVentas();
      return true;
    } catch (error) {
      console.error('Error registering sale:', error.message);
      return false;
    }
  };

  if (loadingAuth) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-primary-900 mb-4" />
        <p className="font-medium animate-pulse">Cargando sistema...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  const role = userProfile?.rol || 'empleado';
  const userName = userProfile?.nombre_completo || session.user.email.split('@')[0];
  const isAdmin = role === 'admin';

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-100 flex font-sans">
      
      {/* Sidebar Lateral (Desktop) */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col z-20">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-900 rounded-xl flex items-center justify-center shadow-lg shadow-primary-900/20 shrink-0">
            <Box className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="font-black text-xl text-slate-800 tracking-tight block leading-none">Plásticos</span>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mt-1">POS System</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Principal</p>
          <button 
            onClick={() => setActiveTab('terminal')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'terminal' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <ShoppingCart className="w-5 h-5 shrink-0" /> Terminal
          </button>
          <button 
            onClick={() => setActiveTab('pedidos')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'pedidos' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <ClipboardList className="w-5 h-5 shrink-0" /> Pedidos
          </button>
          <button 
            onClick={() => setActiveTab('inventario')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'inventario' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Package className="w-5 h-5 shrink-0" /> Inventario
          </button>

          {isAdmin && (
            <>
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">Administración</p>
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'dashboard' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <BarChart3 className="w-5 h-5 shrink-0" /> Dashboard
              </button>
            </>
          )}

          <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">Operativa</p>
          <button 
            onClick={() => setActiveTab('caja')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'caja' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Wallet className="w-5 h-5 shrink-0" /> Caja
          </button>
          <button 
            onClick={() => setActiveTab('asistencia')}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'asistencia' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            <Clock className="w-5 h-5 shrink-0" /> Asistencia
          </button>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-slate-800 truncate">{userName}</p>
              <p className="text-xs font-medium text-slate-500 capitalize">{role}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors text-sm font-semibold shadow-sm"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Navegación Móvil */}
      <div className="lg:hidden fixed top-0 w-full bg-white border-b border-slate-200 p-4 z-20 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Box className="w-6 h-6 text-primary-900" />
          <span className="font-black text-lg text-slate-800">Plásticos POS</span>
        </div>
        <button onClick={handleLogout} className="text-slate-400 hover:text-red-500">
          <LogOut className="w-6 h-6" />
        </button>
      </div>

      <div className="lg:hidden fixed bottom-0 w-full bg-white border-t border-slate-200 z-20 flex justify-around p-2 pb-safe">
          <button onClick={() => setActiveTab('terminal')} className={`p-2 ${activeTab === 'terminal' ? 'text-primary-900' : 'text-slate-400'}`}><ShoppingCart className="w-6 h-6" /></button>
          <button onClick={() => setActiveTab('inventario')} className={`p-2 ${activeTab === 'inventario' ? 'text-primary-900' : 'text-slate-400'}`}><Package className="w-6 h-6" /></button>
          <button onClick={() => setActiveTab('caja')} className={`p-2 ${activeTab === 'caja' ? 'text-primary-900' : 'text-slate-400'}`}><Wallet className="w-6 h-6" /></button>
          {isAdmin && <button onClick={() => setActiveTab('dashboard')} className={`p-2 ${activeTab === 'dashboard' ? 'text-primary-900' : 'text-slate-400'}`}><BarChart3 className="w-6 h-6" /></button>}
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-hidden relative pt-[60px] lg:pt-0 pb-[60px] lg:pb-0 flex flex-col bg-slate-50">
        {activeTab === 'terminal' && <Terminal onRegisterSale={handleRegisterSale} cart={cart} setCart={setCart} userProfile={userProfile} />}
        {activeTab === 'pedidos' && <Pedidos ventas={ventas} isAdmin={isAdmin} />}
        {activeTab === 'inventario' && <Inventario isAdmin={isAdmin} />}
        {activeTab === 'dashboard' && isAdmin && <Dashboard ventas={ventas} />}
        {activeTab === 'caja' && <CajaModal userProfile={userProfile} />}
        {activeTab === 'asistencia' && <RelojChecador userProfile={userProfile} />}
      </main>

    </div>
  );
}

export default App;
