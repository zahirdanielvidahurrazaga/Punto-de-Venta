import React, { useState, useEffect } from 'react';
import { ShoppingCart, Package, BarChart3, ClipboardList, LogOut, Loader2, Box, Clock, Wallet, Users, FileText, CalendarDays, Sparkles } from 'lucide-react';
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
import CambiarPinModal from './components/CambiarPinModal';

function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [pinNeedsChange, setPinNeedsChange] = useState(false);

  // Estados de validación del flujo
  const [isClockedIn, setIsClockedIn] = useState(null);
  const [isCajaOpen, setIsCajaOpen] = useState(null);

  const [activeTab, setActiveTab] = useState(null);
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

  const checkPinRequirements = async () => {
    try {
      const { data, error } = await supabase.rpc('pin_necesita_cambio');
      if (!error && data === true) {
        setPinNeedsChange(true);
      } else {
        setPinNeedsChange(false);
      }
    } catch (e) {
      console.error("Error comprobando estado de PIN:", e);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        checkPinRequirements();
        fetchUserProfile(session.user.id);
      } else {
        setLoadingAuth(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkPinRequirements();
        fetchUserProfile(session.user.id);
      } else {
        setUserProfile(null);
        setPinNeedsChange(false);
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
      <div className="h-screen w-screen flex flex-col items-center justify-center text-slate-500">
        <div className="neb-glass-strong rounded-3xl px-10 py-8 flex flex-col items-center">
          <Loader2 className="w-9 h-9 animate-spin text-accent-600 mb-3" />
          <p className="font-bold text-slate-700">Validando credenciales</p>
          <p className="text-[11px] font-semibold text-slate-400 tracking-widest uppercase mt-1">Por favor espera</p>
        </div>
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
  const SideItem = ({ id, icon: Icon, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`neb-side-item ${activeTab === id ? 'active' : ''}`}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={2.2} />
      <span className="truncate">{label}</span>
      {activeTab === id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent-500" />}
    </button>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex font-sans">
      {pinNeedsChange && (
        <CambiarPinModal onPinChanged={() => setPinNeedsChange(false)} />
      )}

      {/* ──────── Sidebar Desktop (Glass) ──────── */}
      <aside className="w-[260px] hidden lg:flex flex-col z-20 m-3 mr-0 rounded-3xl neb-glass-strong overflow-hidden">
        {/* Header con marca y avatar */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl neb-grad-primary flex items-center justify-center neb-shadow-sm">
              <Box className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-[15px] tracking-tight text-slate-900 leading-none">Plásticos</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] mt-1">POS System</p>
            </div>
          </div>

          {/* Tarjeta de usuario tipo "Pro Plan" */}
          <div className="mt-5 p-3 rounded-2xl neb-grad-pastel border border-white/70 flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-xl bg-white neb-ring flex items-center justify-center font-bold text-slate-700 text-sm">
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold text-slate-900 truncate leading-none">{userName}</p>
              <p className="text-[10px] font-bold text-accent-700 uppercase tracking-wider mt-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> {isAdmin ? 'Administrador' : 'Empleado'}
              </p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <div className="flex-1 overflow-y-auto neb-scroll px-3 py-2 space-y-4">

          {canOperateTerminal && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Operación</p>
              <SideItem id="terminal" icon={ShoppingCart} label="Terminal" />
            </div>
          )}

          {canOperate && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">General</p>
              <div className="space-y-1">
                <SideItem id="pedidos" icon={ClipboardList} label="Pedidos" />
                <SideItem id="inventario" icon={Package} label="Inventario" />
                <SideItem id="pedidos_programados" icon={CalendarDays} label="Pedidos Programados" />
              </div>
            </div>
          )}

          {isAdmin && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Administración</p>
              <div className="space-y-1">
                <SideItem id="dashboard" icon={BarChart3} label="Dashboard" />
                <SideItem id="equipo" icon={Users} label="Equipo" />
                <SideItem id="reportes" icon={FileText} label="Reportes" />
              </div>
            </div>
          )}

          {isEmpleado && (
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Flujo de Turno</p>
              <div className="space-y-1">
                {isClockedIn && (
                  <SideItem id="caja" icon={Wallet} label={isCajaOpen ? 'Corte de Caja' : 'Apertura de Caja'} />
                )}
                {(!isClockedIn || (isClockedIn && !isCajaOpen && activeTab === 'asistencia')) && (
                  <SideItem id="asistencia" icon={Clock} label={isClockedIn ? 'Registrar Salida' : 'Checar Entrada'} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer del sidebar */}
        <div className="p-3 border-t border-white/60">
          <button
            onClick={handleLogout}
            className="w-full neb-btn neb-btn-ghost text-[13px] hover:!text-rose-600 hover:!border-rose-200"
          >
            <LogOut className="w-4 h-4" /> Cerrar Sesión
          </button>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] text-center mt-3">
            © Plásticos POS
          </p>
        </div>
      </aside>

      {/* ──────── Mobile Top Bar ──────── */}
      <div className="lg:hidden fixed top-0 w-full neb-glass-strong p-3 z-20 flex justify-between items-center rounded-b-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl neb-grad-primary flex items-center justify-center">
            <Box className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-[14px] text-slate-900 leading-none block">Plásticos</span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">POS · {role}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="w-9 h-9 rounded-xl bg-white/70 border border-white/60 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:bg-rose-50 transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* ──────── Mobile Bottom Nav ──────── */}
      <div className="lg:hidden fixed bottom-3 left-3 right-3 neb-glass-strong z-20 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-1 p-1.5 overflow-x-auto scrollbar-hide">
        {canOperateTerminal && (
          <button onClick={() => setActiveTab('terminal')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'terminal' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <ShoppingCart className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Terminal</span>
          </button>
        )}
        {canOperate && (
          <button onClick={() => setActiveTab('pedidos')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'pedidos' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <ClipboardList className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Pedidos</span>
          </button>
        )}
        {canOperate && (
          <button onClick={() => setActiveTab('inventario')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'inventario' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <Package className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Inv.</span>
          </button>
        )}
        {canOperate && (
          <button onClick={() => setActiveTab('pedidos_programados')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'pedidos_programados' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <CalendarDays className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Prog.</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('dashboard')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'dashboard' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <BarChart3 className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Dash</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('equipo')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'equipo' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <Users className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Equipo</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setActiveTab('reportes')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'reportes' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <FileText className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Rep.</span>
          </button>
        )}
        {isEmpleado && isClockedIn && (
          <button onClick={() => setActiveTab('caja')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'caja' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <Wallet className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Caja</span>
          </button>
        )}
        {isEmpleado && (!isClockedIn || (isClockedIn && !isCajaOpen && activeTab === 'asistencia')) && (
          <button onClick={() => setActiveTab('asistencia')} className={`shrink-0 px-3 py-1.5 flex flex-col items-center gap-0.5 rounded-xl min-w-[56px] ${activeTab === 'asistencia' ? 'text-slate-900 bg-white/90 neb-shadow-sm' : 'text-slate-400'}`}>
            <Clock className="w-4 h-4" /><span className="text-[9px] font-bold leading-none">Asis.</span>
          </button>
        )}
        </div>
      </div>

      {/* ──────── Contenido principal ──────── */}
      <main className="flex-1 overflow-hidden relative pt-[60px] lg:pt-3 pb-[80px] lg:pb-3 lg:pr-3 flex flex-col">
        <div className="flex-1 overflow-hidden lg:ml-3 rounded-3xl neb-glass-strong">
          <div className="h-full overflow-hidden">
            {activeTab === 'terminal' && canOperate && <Terminal onRegisterSale={handleRegisterSale} cart={cart} setCart={setCart} userProfile={userProfile} />}
            {activeTab === 'pedidos' && canOperate && <Pedidos ventas={ventas} isAdmin={isAdmin} />}
            {activeTab === 'inventario' && canOperate && <Inventario isAdmin={isAdmin} userProfile={userProfile} />}
            {activeTab === 'dashboard' && isAdmin && <Dashboard ventas={ventas} userName={userName} />}
            {activeTab === 'equipo' && isAdmin && <Equipo />}
            {activeTab === 'reportes' && isAdmin && <Reportes />}
            {activeTab === 'pedidos_programados' && canOperate && <PedidosProgramados userProfile={userProfile} isAdmin={isAdmin} />}
            {activeTab === 'caja' && canSeeCaja && <CajaModal userProfile={userProfile} onStatusChange={checkWorkStatus} />}
            {activeTab === 'asistencia' && <RelojChecador userProfile={userProfile} onStatusChange={checkWorkStatus} />}
          </div>
        </div>
      </main>

    </div>
  );
}

export default App;
