import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList, LogOut, Loader2, Box, Clock, Wallet, Users, FileText } from 'lucide-react';
import Terminal from './components/Terminal';
import Inventario from './components/Inventario';
import Dashboard from './components/Dashboard';
import Pedidos from './components/Pedidos';
import Login from './components/Login';
import CajaModal from './components/CajaModal';
import RelojChecador from './components/RelojChecador';
import Equipo from './components/Equipo';
import Reportes from './components/Reportes';
import { supabase } from './lib/supabaseClient';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Estados de validación del flujo
  const [isClockedIn, setIsClockedIn] = useState(null);
  const [isCajaOpen, setIsCajaOpen] = useState(null);

  const [activeTab, setActiveTab] = useState('asistencia');
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
      if (!data) {
        setLoadingAuth(false);
      }
    } catch (error) {
      console.error('Error fetching profile:', error.message);
      setLoadingAuth(false);
    }
  };

  const checkWorkStatus = async (targetTab = null) => {
    if (!userProfile) return;
    
    try {
      // 1. Revisar Asistencia
      const { data: asistencia } = await supabase
        .from('registro_asistencia')
        .select('id')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'trabajando')
        .limit(1)
        .maybeSingle();
      
      const currentlyClockedIn = !!asistencia;
      setIsClockedIn(currentlyClockedIn);

      // 2. Revisar Caja
      const { data: caja } = await supabase
        .from('sesiones_caja')
        .select('id')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'abierta')
        .limit(1)
        .maybeSingle();
      
      const currentlyCajaOpen = !!caja;
      setIsCajaOpen(currentlyCajaOpen);

      // Enrutamiento Forzado para Empleados
      if (userProfile.rol === 'empleado') {
        if (targetTab) {
          setActiveTab(targetTab);
        } else if (isClockedIn === null) {
          // Solo forzar routing en la carga inicial
          if (!currentlyClockedIn) {
            setActiveTab('asistencia');
          } else if (currentlyClockedIn && !currentlyCajaOpen) {
            setActiveTab('caja');
          } else if (currentlyClockedIn && currentlyCajaOpen) {
            setActiveTab('terminal');
          }
        }
      } else {
         // Si es admin y acaba de entrar, enviarlo a dashboard por defecto si estaba en estado inicial
         if (isClockedIn === null) setActiveTab('dashboard');
      }

    } catch (error) {
      console.error("Error validando estatus de trabajo:", error);
    } finally {
      setLoadingAuth(false);
    }
  };

  // Se ejecuta cada vez que el perfil de usuario cambie o cargue
  useEffect(() => {
    if (userProfile) {
      checkWorkStatus();
    }
  }, [userProfile]);

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
          precio_unitario: d.precio_unitario,
          precio: Number(d.precio_unitario)
        })),
        pagos: {
          efectivo: Number(v.pago_efectivo) || 0,
          tarjeta: Number(v.pago_tarjeta) || 0,
          transferencia: Number(v.pago_transferencia) || 0,
          totalPagado: Number(v.pago_efectivo || 0) + Number(v.pago_tarjeta || 0) + Number(v.pago_transferencia || 0),
          cambio: 0
        }
      }));

      setVentas(mappedVentas);
    } catch (error) {
      console.error('Error fetching sales:', error.message);
    }
  };

  useEffect(() => {
    if (session && userProfile) {
      // Solo cargar ventas si el usuario tiene acceso (para ahorrar requests)
      if (userProfile.rol === 'admin' || (isClockedIn && isCajaOpen)) {
        fetchVentas();
      }
    }
  }, [session, isClockedIn, isCajaOpen, userProfile]);

  const handleRegisterSale = async (saleData) => {
    try {
      // Validar primero si la caja sigue abierta para mayor seguridad
      const { data: cajaVerificacion } = await supabase
        .from('sesiones_caja')
        .select('id')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'abierta')
        .limit(1)
        .maybeSingle();
        
      if (!cajaVerificacion && userProfile.rol !== 'admin') {
        alert("Tu caja ha sido cerrada. No puedes realizar cobros.");
        checkWorkStatus();
        return false;
      }

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

      if (detallesError) {
        // Si falla al insertar detalles (ej: stock insuficiente), eliminar la venta huérfana
        await supabase.from('ventas').delete().eq('id', venta.id);
        throw detallesError;
      }

      fetchVentas();
      return true;
    } catch (error) {
      console.error('Error registering sale:', error.message, error);
      
      // Verificar si es un error de stock
      if (error.message && error.message.includes('stock')) {
        alert("Stock insuficiente para uno o más productos. Verifica el inventario.");
      }
      
      return false;
    }
  };

  if (loadingAuth || (session && userProfile && isClockedIn === null)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-primary-900 mb-4" />
        <p className="font-medium animate-pulse">Validando credenciales...</p>
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  const role = userProfile?.rol || 'empleado';
  const userName = userProfile?.nombre_completo || session.user.email.split('@')[0];
  const isAdmin = role === 'admin';
  const isEmpleado = role === 'empleado';

  // Lógica de visualización del Sidebar (Guardián)
  const canOperateTerminal = isEmpleado && isClockedIn && isCajaOpen;
  const canOperate = isAdmin || canOperateTerminal;
  const canSeeCaja = isEmpleado && isClockedIn;

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
          {canOperateTerminal && (
            <>
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Operación</p>
              <button 
                onClick={() => setActiveTab('terminal')}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'terminal' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <ShoppingCart className="w-5 h-5 shrink-0" /> Terminal
              </button>
            </>
          )}

          {canOperate && (
            <>
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">General</p>
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
            </>
          )}

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
              <button 
                onClick={() => setActiveTab('equipo')}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'equipo' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <Users className="w-5 h-5 shrink-0" /> Equipo
              </button>
              <button 
                onClick={() => setActiveTab('reportes')}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                  activeTab === 'reportes' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <FileText className="w-5 h-5 shrink-0" /> Reportes
              </button>
            </>
          )}

          {isEmpleado && (
            <>
              <p className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-6">Flujo de Turno</p>
              
              {/* Mostrar Caja solo si ya checó entrada */}
              {isClockedIn && (
                <button 
                  onClick={() => setActiveTab('caja')}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'caja' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Wallet className="w-5 h-5 shrink-0" /> {isCajaOpen ? 'Corte de Caja' : 'Apertura de Caja'}
                </button>
              )}
              
              {/* Mostrar Asistencia si NO ha checado entrada, o si ya cerró la caja y está en la pantalla de salida */}
              {(!isClockedIn || (isClockedIn && !isCajaOpen && activeTab === 'asistencia')) && (
                <button 
                  onClick={() => setActiveTab('asistencia')}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'asistencia' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <Clock className="w-5 h-5 shrink-0" /> {isClockedIn ? 'Registrar Salida' : 'Checar Entrada'}
                </button>
              )}
            </>
          )}
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
          {canOperateTerminal && <button onClick={() => setActiveTab('terminal')} className={`p-2 flex flex-col items-center ${activeTab === 'terminal' ? 'text-primary-900' : 'text-slate-400'}`}><ShoppingCart className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Terminal</span></button>}
          {canOperate && <button onClick={() => setActiveTab('pedidos')} className={`p-2 flex flex-col items-center ${activeTab === 'pedidos' ? 'text-primary-900' : 'text-slate-400'}`}><ClipboardList className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Pedidos</span></button>}
          {canOperate && <button onClick={() => setActiveTab('inventario')} className={`p-2 flex flex-col items-center ${activeTab === 'inventario' ? 'text-primary-900' : 'text-slate-400'}`}><Package className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Inventario</span></button>}
          {isAdmin && <button onClick={() => setActiveTab('dashboard')} className={`p-2 flex flex-col items-center ${activeTab === 'dashboard' ? 'text-primary-900' : 'text-slate-400'}`}><BarChart3 className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Dashboard</span></button>}
          {isAdmin && <button onClick={() => setActiveTab('equipo')} className={`p-2 flex flex-col items-center ${activeTab === 'equipo' ? 'text-primary-900' : 'text-slate-400'}`}><Users className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Equipo</span></button>}
          {isAdmin && <button onClick={() => setActiveTab('reportes')} className={`p-2 flex flex-col items-center ${activeTab === 'reportes' ? 'text-primary-900' : 'text-slate-400'}`}><FileText className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Reportes</span></button>}
          {isEmpleado && isClockedIn && <button onClick={() => setActiveTab('caja')} className={`p-2 flex flex-col items-center ${activeTab === 'caja' ? 'text-primary-900' : 'text-slate-400'}`}><Wallet className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Caja</span></button>}
          {isEmpleado && (!isClockedIn || (isClockedIn && !isCajaOpen && activeTab === 'asistencia')) && <button onClick={() => setActiveTab('asistencia')} className={`p-2 flex flex-col items-center ${activeTab === 'asistencia' ? 'text-primary-900' : 'text-slate-400'}`}><Clock className="w-5 h-5" /><span className="text-[10px] font-bold mt-0.5">Entrada</span></button>}
      </div>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-hidden relative pt-[60px] lg:pt-0 pb-[60px] lg:pb-0 flex flex-col bg-slate-50">
        {activeTab === 'terminal' && canOperate && <Terminal onRegisterSale={handleRegisterSale} cart={cart} setCart={setCart} userProfile={userProfile} />}
        {activeTab === 'pedidos' && canOperate && <Pedidos ventas={ventas} isAdmin={isAdmin} />}
        {activeTab === 'inventario' && canOperate && <Inventario isAdmin={isAdmin} />}
        {activeTab === 'dashboard' && isAdmin && <Dashboard ventas={ventas} />}
        {activeTab === 'equipo' && isAdmin && <Equipo />}
        {activeTab === 'reportes' && isAdmin && <Reportes />}
        {activeTab === 'caja' && canSeeCaja && <CajaModal userProfile={userProfile} onStatusChange={checkWorkStatus} />}
        {activeTab === 'asistencia' && <RelojChecador userProfile={userProfile} onStatusChange={checkWorkStatus} />}
      </main>

    </div>
  );
}

export default App;
