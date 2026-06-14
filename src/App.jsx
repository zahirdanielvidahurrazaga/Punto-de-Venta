import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList, LogOut, Loader2, Box, Clock, Wallet, Users, FileText, CalendarDays, Settings, Menu, X, Truck } from 'lucide-react';
import Terminal from './components/Terminal';
import Inventario from './components/Inventario';
import Dashboard from './components/Dashboard';
import Pedidos from './components/Pedidos';
import Login from './components/Login';
import CajaModal from './components/CajaModal';
import RelojChecador from './components/RelojChecador';
import Equipo from './components/Equipo';
import Reportes from './components/Reportes';
import PedidosProgramados from './components/PedidosProgramados';
import { supabase } from './lib/supabaseClient';
import Ajustes from './components/Ajustes';
import VentasEnRuta from './components/VentasEnRuta';
import NotificacionesCenter from './components/NotificacionesCenter';
import { initPush } from './lib/push';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Estados de validación del flujo
  const [isClockedIn, setIsClockedIn] = useState(null);
  const [isCajaOpen, setIsCajaOpen] = useState(null);

  const [activeTab, setActiveTab] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [ventas, setVentas] = useState([]);
  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pos_cart', JSON.stringify(cart));
    } catch (err) {
      console.error("Error persistiendo carrito:", err);
    }
  }, [cart]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchUserProfile(session.user.id);
      } else {
        setLoadingAuth(false);
      }
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
        .select('*, sucursales(nombre, direccion)')
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
      const { data: asistencia } = await supabase
        .from('registro_asistencia')
        .select('id')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'trabajando')
        .limit(1)
        .maybeSingle();

      const currentlyClockedIn = !!asistencia;
      setIsClockedIn(currentlyClockedIn);

      const { data: caja } = await supabase
        .from('sesiones_caja')
        .select('id')
        .eq('usuario_id', userProfile.id)
        .eq('estado', 'abierta')
        .limit(1)
        .maybeSingle();

      const currentlyCajaOpen = !!caja;
      setIsCajaOpen(currentlyCajaOpen);

      if (userProfile.rol === 'empleado') {
        if (targetTab) {
          setActiveTab(targetTab);
        } else if (isClockedIn === null) {
          if (!currentlyClockedIn) {
            setActiveTab('asistencia');
          } else if (currentlyClockedIn && !currentlyCajaOpen) {
            setActiveTab('caja');
          } else if (currentlyClockedIn && currentlyCajaOpen) {
            setActiveTab('terminal');
          }
        }
      } else {
         if (isClockedIn === null || activeTab === null) setActiveTab('dashboard');
      }

    } catch (error) {
      console.error("Error validando estatus de trabajo:", error);
    } finally {
      setLoadingAuth(false);
    }
  };

  useEffect(() => {
    if (userProfile) {
      checkWorkStatus();

      // Solo el admin recibe avisos (centro de avisos + push nativo).
      if (userProfile.rol === 'admin') initPush();

      const isDark = localStorage.getItem(`theme_user_${userProfile.id}`) === 'dark';
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      // Recordar el último tema de este dispositivo para aplicarlo antes del
      // primer render en el próximo arranque (anti-parpadeo, ver index.html).
      localStorage.setItem('theme_last', isDark ? 'dark' : 'light');
    } else {
      // Sin sesión (login): respetar el último tema del dispositivo para que no
      // haya parpadeo respecto a lo que aplicó index.html antes del render.
      const last = localStorage.getItem('theme_last');
      document.documentElement.classList.toggle('dark', last === 'dark');
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
        .order('fecha', { ascending: false })
        .limit(50);

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
      if (userProfile.rol === 'admin' || (isClockedIn && isCajaOpen)) {
        fetchVentas();
      }
    }
  }, [session, isClockedIn, isCajaOpen, userProfile]);

  const handleRegisterSale = async (saleData) => {
    try {
      const productos_json = saleData.items.map(item => ({
        id: item.id,
        cantidad: item.quantity
      }));

      const { data, error } = await supabase.rpc('registrar_venta', {
        pago_efectivo: saleData.pagos.efectivo,
        pago_tarjeta: saleData.pagos.tarjeta,
        pago_transferencia: saleData.pagos.transferencia,
        productos_json: productos_json
      });

      if (error) throw error;

      if (!data.ok) {
        throw new Error(data.error);
      }

      fetchVentas();
      return true;
    } catch (error) {
      console.error('Error registering sale:', error.message, error);

      if (error.message && error.message.toLowerCase().includes('stock')) {
        alert("Stock insuficiente para uno o más productos. Verifica el inventario.");
      } else if (error.message && error.message.includes('No tienes una caja abierta')) {
        alert("Tu caja ha sido cerrada. No puedes realizar cobros.");
        checkWorkStatus();
      } else {
        alert(`Error al registrar la venta: ${error.message}`);
      }

      return false;
    }
  };

  if (loadingAuth || (session && userProfile && isClockedIn === null)) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400 dark:text-slate-500 mb-3" />
        <p className="text-[14px] text-slate-600 dark:text-slate-400">Validando credenciales</p>
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

  const canOperateTerminal = isEmpleado && isClockedIn && isCajaOpen;
  const canOperate = isAdmin || canOperateTerminal;
  const canSeeCaja = isEmpleado && isClockedIn;

  // Helper para items de sidebar
  const SideItem = ({ id, icon: Icon, label, iconCls }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsMobileMenuOpen(false);
      }}
      className={`neb-side-item ${activeTab === id ? 'active' : ''}`}
    >
      {iconCls
        ? <span className={`w-[22px] h-[22px] rounded-md flex items-center justify-center shrink-0 ${iconCls}`}><Icon className="w-[13px] h-[13px]" strokeWidth={2} /></span>
        : <Icon className="w-[16px] h-[16px] shrink-0" strokeWidth={1.8} />
      }
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex font-sans">
      {/* Scrim Overlay for Mobile */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-sm z-30 lg:hidden" 
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* ──────── Sidebar Desktop / Drawer Mobile ──────── */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[240px] flex-col bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl border-r border-slate-200/50 dark:border-white/10 overflow-hidden transition-all duration-300 transform lg:transform-none lg:static lg:flex ${isMobileMenuOpen ? 'translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.15)] flex' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Header con marca y avatar */}
        <div className="px-5 pb-5 pt-[calc(1.25rem+env(safe-area-inset-top))]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <img src="/tito-logo-mask.png" alt="Logo" className="w-5 h-5 invert brightness-0" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[13px] tracking-tight text-slate-900 dark:text-white leading-[1.15] break-words">Plasticos y Jarcieria Tito</p>
                <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">POS System</p>
              </div>
            </div>
            {/* Botón de cerrar solo en móvil */}
            <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Navegación */}
        <div className="flex-1 overflow-y-auto neb-scroll px-3 py-2 space-y-4">

          {canOperateTerminal && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Operación</p>
              <SideItem id="terminal" icon={ShoppingCart} label="Terminal" />
            </div>
          )}

          {canOperate && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">General</p>
              <div className="space-y-0.5">
                <SideItem id="pedidos" icon={ClipboardList} label="Pedidos" />
                <SideItem id="inventario" icon={Package} label="Inventario" />
                <SideItem id="pedidos_programados" icon={CalendarDays} label="Pedidos Programados" />
              </div>
            </div>
          )}

          {isAdmin && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Administración</p>
              <div className="space-y-0.5">
                <SideItem id="dashboard" icon={BarChart3} label="Dashboard" />
                <SideItem id="ventas_en_ruta" icon={Truck} label="Ventas en Ruta" />
                <SideItem id="equipo" icon={Users} label="Equipo" />
                <SideItem id="reportes" icon={FileText} label="Reportes" />
              </div>
            </div>
          )}

          {isEmpleado && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Flujo de Turno</p>
              <div className="space-y-0.5">
                {isClockedIn && (
                  <SideItem id="caja" icon={Wallet} label={isCajaOpen ? 'Corte de Caja' : 'Apertura de Caja'} />
                )}
                {(!isClockedIn || (isClockedIn && !isCajaOpen && activeTab === 'asistencia')) && (
                  <SideItem id="asistencia" icon={Clock} label={isClockedIn ? 'Registrar Salida' : 'Checar Entrada'} />
                )}
              </div>
            </div>
          )}

          <div>
            <p className="px-3 mb-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cuenta</p>
            <div className="space-y-0.5">
              <SideItem id="ajustes" icon={Settings} label="Ajustes" />
            </div>
          </div>
        </div>

        {/* Footer del sidebar */}
        <div className="px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-slate-100 dark:border-white/5 transition-colors">
          {/* Tarjeta de usuario — minimal */}
          <div className="flex items-center gap-3 mb-1">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-medium text-slate-600 dark:text-slate-400 dark:text-slate-300 text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate leading-none">{userName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{isAdmin ? 'Administrador' : 'Empleado'}</p>
            </div>
            {isAdmin && <NotificacionesCenter />}
          </div>

          {isAdmin && (
            <button
              onClick={handleLogout}
              className="w-full neb-side-item text-slate-500 dark:text-slate-400 hover:!text-rose-600 mt-3"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.8} /> Cerrar Sesión
            </button>
          )}
        </div>
      </aside>

      {/* ──────── Mobile Top Bar ──────── */}
      <div className="lg:hidden fixed top-0 w-full bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-white/5 px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] z-20 flex justify-between items-center transition-colors">
        <div className="flex items-center gap-2.5">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors mr-1"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 flex items-center justify-center hidden sm:flex shrink-0">
            <img src="/tito-logo-mask.png" alt="Logo" className="w-5 h-5 invert brightness-0" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-[13px] text-slate-900 dark:text-white leading-tight block truncate pr-2">Plasticos y Jarcieria Tito</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider block truncate">POS · {role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <NotificacionesCenter />}
          <button onClick={handleLogout} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ──────── Contenido principal — Apple ──────── */}
      <main className="flex-1 overflow-hidden relative pt-[calc(60px+env(safe-area-inset-top))] lg:pt-0 pb-0 flex flex-col bg-slate-50/40 dark:bg-slate-950 transition-colors">
        <div className="h-full overflow-hidden">
          {activeTab === 'terminal' && canOperate && <Terminal onRegisterSale={handleRegisterSale} cart={cart} setCart={setCart} userProfile={userProfile} />}
          {activeTab === 'pedidos' && canOperate && <Pedidos ventas={ventas} isAdmin={isAdmin} />}
          {activeTab === 'inventario' && canOperate && <Inventario isAdmin={isAdmin} userProfile={userProfile} />}
          {activeTab === 'dashboard' && isAdmin && <Dashboard ventas={ventas} userName={userName} />}
          {activeTab === 'ventas_en_ruta' && isAdmin && <VentasEnRuta userProfile={userProfile} />}
          {activeTab === 'equipo' && isAdmin && <Equipo />}
          {activeTab === 'reportes' && isAdmin && <Reportes />}
          {activeTab === 'pedidos_programados' && canOperate && <PedidosProgramados userProfile={userProfile} isAdmin={isAdmin} />}
          {activeTab === 'caja' && canSeeCaja && <CajaModal userProfile={userProfile} onStatusChange={checkWorkStatus} />}
          {activeTab === 'asistencia' && <RelojChecador userProfile={userProfile} onStatusChange={checkWorkStatus} />}
          {activeTab === 'ajustes' && <Ajustes userProfile={userProfile} onProfileUpdate={setUserProfile} />}
        </div>
      </main>

    </div>
  );
}

export default App;
