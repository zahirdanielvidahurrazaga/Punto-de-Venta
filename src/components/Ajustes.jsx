import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, Moon, Sun, Shield, Trash2, CheckCircle, AlertTriangle, Loader2, FileText, KeyRound } from 'lucide-react';

export default function Ajustes({ userProfile, onProfileUpdate }) {
  const [nombre, setNombre] = useState(userProfile?.nombre_completo || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const [isDark, setIsDark] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Código de autorización rotativo (solo admin)
  const isAdmin = userProfile?.rol === 'admin';
  const [authCode, setAuthCode] = useState(null);
  const [authSeconds, setAuthSeconds] = useState(0);
  const [authError, setAuthError] = useState('');

  // Sincronizar estado del dark mode inicial
  useEffect(() => {
    if (userProfile?.id) {
      const savedTheme = localStorage.getItem(`theme_user_${userProfile.id}`);
      if (savedTheme === 'dark') setIsDark(true);
      else if (savedTheme === 'light') setIsDark(false);
      else setIsDark(document.documentElement.classList.contains('dark'));
    } else {
      setIsDark(document.documentElement.classList.contains('dark'));
    }
  }, [userProfile?.id]);

  // Código de autorización rotativo: se obtiene del servidor y se va contando
  // localmente; al llegar a 0 se vuelve a pedir el siguiente.
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    const fetchCode = async () => {
      const { data, error } = await supabase.rpc('obtener_codigo_admin_actual');
      if (!active) return;
      if (error || !data?.ok) {
        setAuthError('No se pudo obtener el código');
        setAuthCode(null);
        return;
      }
      setAuthError('');
      setAuthCode(data.codigo);
      setAuthSeconds(data.segundos_restantes);
    };

    fetchCode();
    const interval = setInterval(() => {
      setAuthSeconds((s) => {
        if (s <= 1) {
          fetchCode();
          return 30;
        }
        return s - 1;
      });
    }, 1000);

    return () => { active = false; clearInterval(interval); };
  }, [isAdmin]);

  const toggleDarkMode = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    
    if (newDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Guardar preferencia vinculada al ID del usuario
    if (userProfile?.id) {
      localStorage.setItem(`theme_user_${userProfile.id}`, newDark ? 'dark' : 'light');
    }
    // Último tema del dispositivo (anti-parpadeo en el próximo arranque)
    localStorage.setItem('theme_last', newDark ? 'dark' : 'light');
  };

  const handleSaveProfile = async () => {
    if (!nombre.trim()) return;
    setSavingProfile(true);
    setSuccessMsg('');
    try {
      const { error } = await supabase
        .from('usuarios_perfiles')
        .update({ nombre_completo: nombre })
        .eq('id', userProfile.id);
        
      if (error) throw error;
      
      setSuccessMsg('Perfil actualizado correctamente');
      setTimeout(() => setSuccessMsg(''), 3000);
      
      if (onProfileUpdate) {
        onProfileUpdate({ ...userProfile, nombre_completo: nombre });
      }
    } catch (e) {
      alert("Error al guardar perfil: " + e.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteInput !== 'ELIMINAR') {
      setDeleteError('Debes escribir la palabra ELIMINAR exactamente.');
      return;
    }
    
    setDeleting(true);
    setDeleteError('');
    
    try {
      // Llamar al RPC para eliminar la cuenta (debe estar creado en la BD)
      const { error } = await supabase.rpc('eliminar_mi_cuenta');
      if (error) throw error;
      
      // Cerrar sesión forzosamente (el RPC puede haber invalidado la sesión de todos modos)
      await supabase.auth.signOut();
      
    } catch (e) {
      setDeleteError(e.message || 'Error al eliminar la cuenta. Verifica que el script SQL se haya ejecutado en Supabase.');
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto neb-scroll p-4 lg:p-7 max-w-4xl mx-auto space-y-6">
      
      <div className="pt-2 pb-6 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Ajustes</h1>
        <p className="text-[15px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-2">
          Gestiona tu perfil, preferencias y la configuración de tu cuenta.
        </p>
      </div>

      {/* SECCIÓN PERFIL */}
      <section className="neb-card dark:bg-slate-900 dark:border-slate-800 p-5 lg:p-7">
        <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-5">
          <User className="w-4 h-4 text-accent-600" />
          Información del Perfil
        </h2>
        
        <div className="max-w-md space-y-4">
          <div>
            <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Nombre Completo
            </label>
            <input 
              type="text" 
              className="neb-input dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>
          
          <div>
            <label className="block text-[12px] font-bold text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase tracking-wide mb-1.5">
              Rol de la cuenta
            </label>
            <input 
              type="text" 
              className="neb-input bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-500 dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-500 dark:text-slate-400"
              value={userProfile?.rol?.toUpperCase() || ''}
              disabled
            />
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button 
              onClick={handleSaveProfile}
              disabled={savingProfile || !nombre.trim() || nombre === userProfile?.nombre_completo}
              className="neb-btn neb-btn-primary disabled:opacity-50"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar Cambios'}
            </button>
            {successMsg && (
              <span className="text-[13px] font-medium text-emerald-600 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> {successMsg}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* SECCIÓN CÓDIGO DE AUTORIZACIÓN (solo admin) */}
      {isAdmin && (
        <section className="neb-card dark:bg-slate-900 dark:border-slate-800 p-5 lg:p-7">
          <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
            <KeyRound className="w-4 h-4 text-accent-600" />
            Código de Autorización
          </h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-5">
            Dicta este código a tu empleado cuando necesite autorizar una acción
            restringida (como quitar un producto de la venta). Cambia cada 30 segundos.
          </p>

          {authError ? (
            <p className="text-[13px] font-medium text-rose-600 bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 py-3 px-4 rounded-2xl">
              {authError}
            </p>
          ) : authCode ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="font-mono text-4xl lg:text-5xl font-extrabold tracking-[0.25em] text-slate-900 dark:text-white tabular-nums select-all">
                {authCode.slice(0, 3)} {authCode.slice(3)}
              </div>
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3"
                      className="stroke-slate-200 dark:stroke-slate-700" />
                    <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" strokeLinecap="round"
                      className="stroke-accent-600 transition-all duration-1000 ease-linear"
                      strokeDasharray={2 * Math.PI * 16}
                      strokeDashoffset={2 * Math.PI * 16 * (1 - authSeconds / 30)} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    {authSeconds}
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-slate-400 dark:text-slate-500">
                  segundos
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-[13px] font-medium">Generando código…</span>
            </div>
          )}
        </section>
      )}

      {/* SECCIÓN APARIENCIA */}
      <section className="neb-card dark:bg-slate-900 dark:border-slate-800 p-5 lg:p-7">
        <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-5">
          <Moon className="w-4 h-4 text-accent-600" />
          Apariencia
        </h2>
        
        <div className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-800 dark:border-slate-700 rounded-2xl">
          <div>
            <p className="font-bold text-slate-900 dark:text-white text-[15px]">Modo Oscuro</p>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mt-0.5">
              Cambia entre el tema claro y oscuro de la interfaz.
            </p>
          </div>
          <button 
            onClick={toggleDarkMode}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              isDark ? 'bg-accent-600' : 'bg-slate-200 dark:bg-slate-700'
            }`}
          >
            <span 
              className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-slate-900 transition-transform ${
                isDark ? 'translate-x-6' : 'translate-x-1'
              }`} 
            />
          </button>
        </div>
      </section>

      {/* SECCIÓN LEGAL */}
      <section className="neb-card dark:bg-slate-900 dark:border-slate-800 p-5 lg:p-7">
        <h2 className="text-[15px] font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-accent-600" />
          Legal y Privacidad
        </h2>
        
        <p className="text-[13px] text-slate-500 dark:text-slate-400 dark:text-slate-400 mb-4">
          Revisa cómo manejamos tus datos y las políticas de la plataforma.
        </p>
        
        <button 
          onClick={() => setShowPrivacy(true)}
          className="neb-btn neb-btn-ghost dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <FileText className="w-4 h-4" />
          Ver Política de Privacidad
        </button>
      </section>

      {/* SECCIÓN ZONA PELIGROSA */}
      <section className="border border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl p-5 lg:p-7">
        <h2 className="text-[15px] font-extrabold text-rose-700 dark:text-rose-500 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4" />
          Zona Peligrosa
        </h2>
        
        <p className="text-[13px] text-rose-600/80 dark:text-rose-400/80 font-medium mb-5">
          Al eliminar tu cuenta se borrarán permanentemente tus datos de perfil, configuración y el acceso al sistema. 
          Esta acción no se puede deshacer.
        </p>
        
        {!showDeleteConfirm ? (
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="neb-btn bg-rose-100 text-rose-700 hover:bg-rose-200 border-none dark:bg-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-900"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar Cuenta
          </button>
        ) : (
          <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-rose-200 dark:border-rose-800 shadow-sm">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white mb-3">
              ¿Estás seguro? Escribe <span className="text-rose-600 select-all">ELIMINAR</span> para confirmar.
            </p>
            <input 
              type="text" 
              className="neb-input border-rose-200 focus:border-rose-500 mb-3 dark:bg-slate-800 dark:border-rose-900 dark:text-white"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="ELIMINAR"
            />
            {deleteError && (
              <p className="text-[12px] font-medium text-rose-600 mb-3">{deleteError}</p>
            )}
            <div className="flex items-center gap-2">
              <button 
                onClick={handleDeleteAccount}
                disabled={deleting || deleteInput !== 'ELIMINAR'}
                className="neb-btn bg-rose-600 text-white hover:bg-rose-700 border-none disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar Eliminación'}
              </button>
              <button 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteInput('');
                  setDeleteError('');
                }}
                disabled={deleting}
                className="neb-btn neb-btn-ghost dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* MODAL PRIVACIDAD */}
      {showPrivacy && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col neb-shadow-lg border border-slate-100 dark:border-slate-800">
            <div className="p-5 lg:p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Política de Privacidad</h2>
              <button 
                onClick={() => setShowPrivacy(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="p-5 lg:p-6 overflow-y-auto text-[14px] text-slate-600 dark:text-slate-400 dark:text-slate-400 space-y-4">
              <p><strong>1. Recopilación de Información:</strong> Recopilamos el nombre y el correo electrónico asociados a tu cuenta para identificarte dentro del sistema Punto de Venta.</p>
              <p><strong>2. Uso de la Información:</strong> Tu información es utilizada exclusivamente para registrar tus operaciones (ventas, entradas, salidas) dentro del entorno de trabajo y calcular indicadores de desempeño o caja.</p>
              <p><strong>3. Protección de Datos:</strong> Los datos se almacenan de manera segura y no son compartidos con terceros con fines publicitarios o comerciales fuera del servicio prestado.</p>
              <p><strong>4. Eliminación de Datos:</strong> Tienes el derecho de eliminar tu cuenta en cualquier momento desde los Ajustes. Al hacerlo, se eliminará tu perfil de usuario, aunque los registros históricos de ventas pueden retenerse para propósitos de auditoría del negocio, desvinculados de tu información personal identificable según corresponda.</p>
            </div>
            <div className="p-5 border-t border-slate-100 dark:border-slate-800 dark:border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowPrivacy(false)}
                className="neb-btn neb-btn-primary"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
