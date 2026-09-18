import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle, Banknote, Wallet,
  BarChart3, ShoppingBag, ArrowUpRight, Truck, PackageX,
  Loader2, Sparkles, Store, ChevronDown, Minus, ScanLine
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useRealtime } from '../lib/useRealtime';
import { PERIODOS, rangoDe, variacion, cubetasDe } from '../lib/periodos';

// ─────────────────────────────────────────────────────────────────────────────
// El Dashboard pide SUS PROPIOS datos por rango de fechas.
//
// Antes recibía por props la ventana fija que carga App (45 días) y encima cada
// bloque hablaba de un periodo distinto: los KPIs sumaban esos 45 días, la
// gráfica tenía su propio selector (y en "6 meses" pintaba 4 meses vacíos
// porque esos datos nunca llegaban), el flujo de caja iba a 30 días y el
// comparativo de sucursales a otros 30. Nada de eso se decía en pantalla.
//
// Ahora manda UN solo selector de periodo: KPIs, gráfica, métodos de pago,
// rankings, categorías, flujo y sucursales miran exactamente el mismo rango, y
// cada bloque lo dice.
// ─────────────────────────────────────────────────────────────────────────────

const SUB_TABS = [
  { key: 'resumen',    label: 'Resumen'       },
  { key: 'analisis',   label: 'Análisis'      },
  { key: 'flujo',      label: 'Flujo de Caja' },
  { key: 'sucursales', label: 'Sucursales'    },
];

// PostgREST devuelve como máximo 1000 filas por llamada. Sin paginar, el
// comparativo de sucursales y el análisis se cortaban en silencio al pasar de
// ese número (736 renglones de producto_stock hoy, 1104 al abrir una tercera
// sucursal).
const PAGINA   = 1000;
const MAX_FILAS = 20000;

// OJO con el contexto antes de sacar conclusiones de estos números: el catálogo
// (408 productos) SE SIGUE CAPTURANDO A MANO, día a día, desde el almacén. Con
// una carga así, bajar existencias a mano es parte del trabajo: se teclea 12 y
// eran 10, se cuenta una caja de 24 que traía 20. Por eso el bloque NO acusa.
//
// Y el ajuste no guarda motivo (`Inventario.jsx` escribe siempre
// `notas: 'Ajuste manual'`), así que lo único que el sistema sabe de verdad es
// el TAMAÑO: sueltas (1 a 5 piezas) o de volumen (más de 5, que solo pueden ser
// corrección de carga o de conteo — el 10-sep bajaron −1,430 termos de un golpe,
// 1504 → 74).
const PZ_SALIDA_SUELTA = 5;

const pesos = (n) => Math.abs(Number(n) || 0)
  .toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// El signo va antes del símbolo: −$100.00, no $-100.00.
const fmt = (n) => `${(Number(n) || 0) < 0 ? '−' : ''}$${pesos(n)}`;

// Con signo explícito, para diferencias de arqueo (+$80.00 sobrante / −$50.00 faltante).
const fmtFirmado = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) < 0.005) return `$${pesos(0)}`;
  return `${v > 0 ? '+' : '−'}$${pesos(v)}`;
};

const mapVenta = (v) => ({
  id: v.id,
  fecha: v.fecha,
  ts: new Date(v.fecha).getTime(),
  total: Number(v.total) || 0,
  efectivo:      Number(v.pago_efectivo)      || 0,
  tarjeta:       Number(v.pago_tarjeta)       || 0,
  transferencia: Number(v.pago_transferencia) || 0,
  sucursal_id: v.sucursal_id,
  sesion_caja_id: v.sesion_caja_id,
});

const mapAjuste = (m) => ({
  id: m.id,
  nombre: m.nombre_producto,
  motivo: m.notas || null,
  piezas: Math.abs(Number(m.cantidad) || 0),
  producto_id: m.producto_id,
  usuario_id: m.usuario_id,
  sucursal_id: m.sucursal_id,
  cuando: m.created_at,
  ts: new Date(m.created_at).getTime(),
});

// Mezcla lo que ya se tenía con lo que acaba de llegar, sin duplicar por id
// (el refresco pide desde la última fecha INCLUSIVE, para no perder una venta
// que comparta el segundo con la anterior).
const fusionar = (viejas, nuevas) => {
  const porId = new Map(viejas.map(x => [x.id, x]));
  for (const x of nuevas) porId.set(x.id, x);
  return [...porId.values()].sort((a, b) => b.ts - a.ts);
};

// Trae TODAS las filas de una consulta, de mil en mil.
async function traerTodo(construir) {
  const filas = [];
  let inicio = 0, truncado = false;
  for (;;) {
    const { data, error } = await construir().range(inicio, inicio + PAGINA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
    if (filas.length >= MAX_FILAS) { truncado = true; break; }
    inicio += PAGINA;
  }
  return { filas, truncado };
}

// ─── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, delta, nota }) {
  const deltaColor =
    delta?.tipo === 'positive' ? 'text-emerald-600 bg-emerald-50' :
    delta?.tipo === 'negative' ? 'text-rose-600 bg-rose-50' :
    'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';

  const DeltaIcon =
    delta?.tipo === 'positive' ? TrendingUp :
    delta?.tipo === 'negative' ? TrendingDown :
    delta ? Minus : null;

  return (
    <div className="neb-card p-5 flex flex-col relative">
      <div className="flex items-start justify-between mb-4">
        <div className="text-slate-400 dark:text-slate-500">
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {delta && (
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${deltaColor}`}>
            {DeltaIcon && <DeltaIcon className="w-3 h-3" strokeWidth={2.5} />}
            {delta.txt}
          </span>
        )}
      </div>
      <div className="text-[12px] text-slate-500 dark:text-slate-400 font-medium mb-1">{label}</div>
      <div className="text-[28px] font-semibold tracking-tight text-slate-900 dark:text-white leading-none">
        {value}
      </div>
      {nota && (
        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">{nota}</div>
      )}
    </div>
  );
}

function DashboardHero({ userName }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Buenos días'   :
    hour < 19 ? 'Buenas tardes' :
                'Buenas noches';

  const dateStr = now.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  return (
    <div className="pt-6 pb-8 border-b border-slate-200 dark:border-slate-800">
      <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{dateStr}</p>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {greeting}, {userName.split(' ')[0]}.
      </h1>
      <p className="text-lg text-slate-500 dark:text-slate-400 mt-3 font-medium">
        Aquí está el panorama de tu operación.
      </p>
    </div>
  );
}

function RankingList({ items, valueKey, valueLabel }) {
  if (!items.length)
    return <p className="text-slate-400 dark:text-slate-500 text-sm py-6 text-center">Sin ventas en el periodo.</p>;

  const maxVal = Math.max(...items.map(p => p[valueKey]), 1);

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {items.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center text-[11px] font-medium shrink-0 neb-tabular">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5">
              <p className="font-medium text-slate-900 dark:text-white text-sm truncate">{p.nombre}</p>
              <p className="font-semibold text-slate-900 dark:text-white text-sm ml-2 shrink-0 neb-tabular">{valueLabel(p)}</p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-800 dark:bg-slate-300 transition-all duration-700"
                style={{ width: `${(p[valueKey] / maxVal) * 100}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 font-mono">{p.sku} · {p.categoria}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryBreakdown({ ventas, etiqueta }) {
  const cats = useMemo(() => {
    const map = {};
    ventas.forEach(v => {
      v.items.forEach(item => {
        const c = item.categoria || 'Sin categoría';
        if (!map[c]) map[c] = { cat: c, ingresos: 0, unidades: 0 };
        map[c].ingresos += item.cantidad * item.precio;
        map[c].unidades += item.cantidad;
      });
    });
    return Object.values(map).sort((a, b) => b.ingresos - a.ingresos);
  }, [ventas]);

  if (!cats.length) return null;

  const paleta = ['#1d4ed8', '#3b82f6', '#60a5fa', '#93c5fd', '#c2dffe', '#e0efff'];

  return (
    <div className="neb-card p-5 lg:p-6">
      <div className="mb-5">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Ingresos por Categoría</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Cobro de mostrador · {etiqueta}</p>
      </div>
      <div className="space-y-4">
        {cats.map((c, i) => (
          <div key={c.cat} className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: paleta[i % paleta.length] }} />
            <div className="flex-1">
              <div className="flex justify-between mb-1.5">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{c.cat}</span>
                <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.ingresos)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(c.ingresos / (cats[0]?.ingresos || 1)) * 100}%`, background: paleta[i % paleta.length] }}
                />
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 inline-block neb-tabular">{c.unidades} unidades</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Aviso de pantalla: algo que el resumen NO puede ver, dicho en voz alta.
function Aviso({ icon: Icon, titulo, children, tono = 'ambar' }) {
  const tonos = {
    ambar:   'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200',
    rosa:    'border-rose-200 bg-rose-50/70 text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  };
  return (
    <div className={`rounded-2xl border p-4 flex gap-3 ${tonos[tono]}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="text-[13px] leading-relaxed">
        <p className="font-semibold mb-0.5">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

export default function Dashboard({ userName = 'Admin' }) {
  const [subTab, setSubTab]   = useState('resumen');
  const [periodo, setPeriodo] = useState('7d');
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');

  // Catálogos que no dependen del periodo: se piden una vez.
  const [sucursales, setSucursales] = useState([]);
  const [catalogo, setCatalogo]     = useState(new Map());   // producto_id → producto
  const [personas, setPersonas]     = useState(new Map());   // usuario_id  → nombre
  const [cajasAbiertas, setCajasAbiertas] = useState([]);

  // ── Un solo juego de datos para los cuatro periodos ─────────────────────
  // Los cuatro rangos (y sus comparativos) son subconjuntos del más ancho, así
  // que cambiar de periodo NO tiene por qué volver a pedir nada: se carga una
  // ventana y se corta en memoria. La ventana solo se ENSANCHA (nunca se
  // vuelve a pedir lo que ya se tiene), y al abrir "6 meses" se paga una vez.
  const [maestro, setMaestro] = useState(null);
  const [detalles, setDetalles] = useState(null);  // venta_id → partidas (solo Análisis/Sucursales)
  const [conteos, setConteos]   = useState(new Map()); // venta_id → nº de partidas (últimas 30)
  const [stock, setStock]       = useState([]);

  const [cargando, setCargando]             = useState(true);
  const [refrescando, setRefrescando]       = useState(false);
  const [cargandoDetalles, setCargandoDetalles] = useState(false);
  const [cargandoStock, setCargandoStock]   = useState(false);
  const [errorCarga, setErrorCarga]         = useState(null);

  // El tope del rango es "ahora", y ese "ahora" NO puede quedarse congelado en
  // el momento en que se abrió la pantalla: si se congela, cada venta que entra
  // en vivo cae "en el futuro" y el filtro del periodo la tira. Se refresca por
  // reloj (cada minuto, que además hace que "Hoy" cambie al pasar medianoche) y
  // a mano después de cada refresco de datos.
  const [tic, setTic] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTic(n => n + 1), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rango = useMemo(() => rangoDe(periodo), [periodo, tic]);

  // Lo más atrás que necesita este periodo (su rango y su comparativo).
  const necesitaDesde = Math.min(rango.desde.getTime(), rango.desdePrev.getTime());

  // ── Carga de la ventana maestra (solo si hace falta ensancharla) ─────────
  const cargarMaestro = useCallback(async (desdeTs, { refresco = false } = {}) => {
    const desdeISO = new Date(desdeTs).toISOString();
    refresco ? setRefrescando(true) : setCargando(true);
    setErrorCarga(null);
    try {
      const [vts, ajs, ent, ses, mov, rLiq, rVivas, cnt] = await Promise.all([
        // Ventas SIN partidas: es la consulta que más pesa y las partidas solo
        // hacen falta en Análisis y Sucursales (se piden aparte, al abrirlas).
        traerTodo(() => supabase
          .from('ventas')
          .select('id, fecha, total, pago_efectivo, pago_tarjeta, pago_transferencia, sucursal_id, sesion_caja_id')
          .gte('fecha', desdeISO)
          .order('fecha', { ascending: false })),

        // Ajustes a la baja, sin joins: el precio y el nombre salen del catálogo.
        traerTodo(() => supabase
          .from('movimientos_inventario')
          .select('id, nombre_producto, cantidad, notas, created_at, sucursal_id, producto_id, usuario_id')
          .eq('tipo', 'ajuste').lt('cantidad', 0)
          .gte('created_at', desdeISO)
          .order('created_at', { ascending: false })),

        // Entradas de mercancía: sirven para medir cuánto avanzó la captura
        // del catálogo, que es el trabajo que hoy trae ocupado al dueño.
        traerTodo(() => supabase
          .from('movimientos_inventario')
          .select('id, producto_id, sucursal_id, cantidad, tipo, created_at')
          .gt('cantidad', 0)
          .gte('created_at', desdeISO)
          .order('created_at', { ascending: false })),

        traerTodo(() => supabase
          .from('sesiones_caja').select('*')
          .gte('fecha_apertura', desdeISO)
          .order('fecha_apertura', { ascending: false })),

        traerTodo(() => supabase
          .from('movimientos_caja').select('sesion_caja_id, tipo, monto')
          .gte('created_at', desdeISO)
          .order('created_at', { ascending: false })),

        traerTodo(() => supabase
          .from('rutas')
          .select('id, nombre, estado, sucursal_id, fecha_liquidacion, total_lista, dinero_real, descuento_campo, usuario_id')
          .eq('estado', 'liquidado')
          .gte('fecha_liquidacion', desdeISO)
          .order('fecha_liquidacion', { ascending: false })),

        // Las rutas abiertas son un pendiente vivo, no dependen del rango.
        traerTodo(() => supabase
          .from('rutas').select('id, nombre, estado, sucursal_id, fecha_salida, usuario_id')
          .neq('estado', 'liquidado')
          .order('fecha_salida', { ascending: false })),

        // Solo para la columna "Items" de las últimas transacciones.
        supabase.from('ventas')
          .select('id, venta_detalles(cantidad)')
          .order('fecha', { ascending: false }).limit(30),
      ]);

      setMaestro({
        desdeTs,
        truncado: vts.truncado || ajs.truncado,
        ventas:  (vts.filas || []).map(mapVenta),
        ajustes: (ajs.filas || []).map(mapAjuste),
        entradas: (ent.filas || []).map(e => ({
          id: e.id, producto_id: e.producto_id, sucursal_id: e.sucursal_id,
          piezas: Number(e.cantidad) || 0, tipo: e.tipo,
          ts: new Date(e.created_at).getTime(), cuando: e.created_at,
        })),
        sesiones: (ses.filas || []).map(x => ({ ...x, ts: new Date(x.fecha_apertura).getTime() })),
        movsCaja: mov.filas || [],
        rutasLiq: (rLiq.filas || []).map(r => ({ ...r, ts: new Date(r.fecha_liquidacion).getTime() })),
        rutasVivas: rVivas.filas || [],
      });

      setConteos(new Map((cnt.data || []).map(v => [v.id, (v.venta_detalles || []).length])));
      // Las partidas se vuelven a pedir cuando se abra la pestaña que las usa.
      setDetalles(null);
    } catch (e) {
      console.error('Dashboard: error cargando datos', e);
      setErrorCarga(e.message || 'No se pudieron cargar los datos.');
    } finally {
      setCargando(false); setRefrescando(false);
    }
  }, []);

  // Solo pide datos si el periodo elegido necesita ir más atrás de lo cargado.
  useEffect(() => {
    if (!maestro || necesitaDesde < maestro.desdeTs) cargarMaestro(necesitaDesde);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [necesitaDesde]);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre'),
      traerTodo(() => supabase.from('productos')
        .select('id, nombre, sku, categoria, precio, activo').order('sku')),
      supabase.from('usuarios_perfiles').select('id, nombre_completo'),
    ]).then(([sucs, prods, users]) => {
      if (!vivo) return;
      setSucursales(sucs.data || []);
      setCatalogo(new Map((prods.filas || []).map(p => [p.id, p])));
      setPersonas(new Map((users.data || []).map(u => [u.id, u.nombre_completo])));
    });
    return () => { vivo = false; };
  }, []);

  const fetchCajasAbiertas = useCallback(async () => {
    const { data, error } = await supabase
      .from('sesiones_caja').select('*').eq('estado', 'abierta');
    if (!error) setCajasAbiertas(data || []);
  }, []);

  useEffect(() => { fetchCajasAbiertas(); }, [fetchCajasAbiertas]);

  // ── Partidas de las ventas: solo para Análisis y Sucursales ─────────────
  const necesitaDetalles = subTab === 'analisis' || subTab === 'sucursales';

  const cargarDetalles = useCallback(async (desdeTs) => {
    setCargandoDetalles(true);
    try {
      const { filas } = await traerTodo(() => supabase
        .from('ventas')
        .select('id, venta_detalles(producto_id, cantidad, precio_unitario)')
        .gte('fecha', new Date(desdeTs).toISOString())
        .order('fecha', { ascending: false }));
      setDetalles(new Map((filas || []).map(v => [v.id, v.venta_detalles || []])));
    } catch (e) {
      console.error('Dashboard: error cargando partidas', e);
    } finally { setCargandoDetalles(false); }
  }, []);

  useEffect(() => {
    if (necesitaDetalles && maestro && !detalles && !cargandoDetalles) cargarDetalles(maestro.desdeTs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [necesitaDetalles, maestro, detalles]);

  const fetchStock = useCallback(async () => {
    setCargandoStock(true);
    try {
      // El stock real vive en producto_stock (una fila por sucursal);
      // productos.stock es una columna legacy que solo sigue a la principal.
      const { filas } = await traerTodo(() => supabase
        .from('producto_stock').select('producto_id, sucursal_id, stock')
        .order('producto_id', { ascending: true }));
      setStock(filas);
    } catch (e) {
      console.error('Dashboard: error cargando existencias', e);
    } finally { setCargandoStock(false); }
  }, []);

  // El stock ya no es perezoso: el avance de la captura vive en el Resumen.
  // Son ~800 filas de 3 columnas, se pide una vez por sesión.
  useEffect(() => { fetchStock(); }, [fetchStock]);

  // ── En vivo ─────────────────────────────────────────────────────────────
  // Se releen solo los datos que cambiaron, sobre la ventana ya cargada.
  // OJO: `rutas` no está en la publicación supabase_realtime (ver
  // scripts/realtime_y_sucursal_caja.sql), así que una liquidación de ruta
  // entra al recargar, no sola.
  const refrescar = useCallback(async () => {
    if (!maestro) return;
    setRefrescando(true);
    try {
      const respaldo   = new Date(maestro.desdeTs).toISOString();
      // Las filas vienen ordenadas de la más nueva a la más vieja.
      const ultimaVenta   = maestro.ventas[0]?.fecha    || respaldo;
      const ultimoAjuste  = maestro.ajustes[0]?.cuando  || respaldo;
      const ultimaEntrada = maestro.entradas[0]?.cuando || respaldo;

      const [vNue, aNue, eNue, ses, mov, cnt] = await Promise.all([
        traerTodo(() => supabase.from('ventas')
          .select('id, fecha, total, pago_efectivo, pago_tarjeta, pago_transferencia, sucursal_id, sesion_caja_id')
          .gte('fecha', ultimaVenta).order('fecha', { ascending: false })),
        traerTodo(() => supabase.from('movimientos_inventario')
          .select('id, nombre_producto, cantidad, notas, created_at, sucursal_id, producto_id, usuario_id')
          .eq('tipo', 'ajuste').lt('cantidad', 0)
          .gte('created_at', ultimoAjuste).order('created_at', { ascending: false })),
        traerTodo(() => supabase.from('movimientos_inventario')
          .select('id, producto_id, sucursal_id, cantidad, tipo, created_at')
          .gt('cantidad', 0)
          .gte('created_at', ultimaEntrada).order('created_at', { ascending: false })),
        // Estas dos son chicas (un puñado de filas por mes): van completas.
        traerTodo(() => supabase.from('sesiones_caja').select('*')
          .gte('fecha_apertura', respaldo).order('fecha_apertura', { ascending: false })),
        traerTodo(() => supabase.from('movimientos_caja').select('sesion_caja_id, tipo, monto')
          .gte('created_at', respaldo).order('created_at', { ascending: false })),
        supabase.from('ventas').select('id, venta_detalles(cantidad)')
          .order('fecha', { ascending: false }).limit(30),
      ]);

      const ventasNuevas  = (vNue.filas || []).map(mapVenta);
      const ajustesNuevos = (aNue.filas || []).map(mapAjuste);

      const entradasNuevas = (eNue.filas || []).map(e => ({
        id: e.id, producto_id: e.producto_id, sucursal_id: e.sucursal_id,
        piezas: Number(e.cantidad) || 0, tipo: e.tipo,
        ts: new Date(e.created_at).getTime(), cuando: e.created_at,
      }));

      setMaestro(m => m && ({
        ...m,
        ventas:   fusionar(m.ventas,   ventasNuevas),
        ajustes:  fusionar(m.ajustes,  ajustesNuevos),
        entradas: fusionar(m.entradas, entradasNuevas),
        sesiones: (ses.filas || []).map(x => ({ ...x, ts: new Date(x.fecha_apertura).getTime() })),
        movsCaja: mov.filas || [],
      }));
      setConteos(new Map((cnt.data || []).map(v => [v.id, (v.venta_detalles || []).length])));
      // Mueve el tope del rango a "ahora" para que la venta recién llegada entre.
      setTic(n => n + 1);

      // Si entraron ventas nuevas, las partidas que tenía Análisis ya no están
      // completas: se vuelven a pedir cuando se abra esa pestaña.
      const algoNuevo = ventasNuevas.some(v => !maestro.ventas.find(x => x.id === v.id));
      if (algoNuevo) setDetalles(null);
    } catch (e) {
      console.error('Dashboard: error refrescando', e);
    } finally { setRefrescando(false); }
  }, [maestro]);

  useRealtime(['ventas', 'movimientos_inventario', 'movimientos_caja'], refrescar, { espera: 3000 });
  useRealtime('sesiones_caja', () => { fetchCajasAbiertas(); refrescar(); }, { espera: 3000 });
  useRealtime('producto_stock', fetchStock, { activo: necesitaDetalles });

  // ── Corte del periodo, en memoria ───────────────────────────────────────
  const d1 = rango.desde.getTime(),     d2 = rango.hasta.getTime();
  const p1 = rango.desdePrev.getTime(), p2 = rango.hastaPrev.getTime();

  const enPeriodo = useCallback((arr) => (
    (arr || []).filter(x => x.ts >= d1 && x.ts <= d2)
  ), [d1, d2]);

  const porSucursal = useCallback((arr) => (
    sucursalFiltro === 'todas' ? arr : arr.filter(x => x.sucursal_id === sucursalFiltro)
  ), [sucursalFiltro]);

  const ventas     = useMemo(() => maestro?.ventas || [], [maestro]);
  const ventasF    = useMemo(() => porSucursal(enPeriodo(ventas)), [ventas, enPeriodo, porSucursal]);
  const ventasPrevF = useMemo(() => porSucursal(
    ventas.filter(v => v.ts >= p1 && v.ts < p2)
  ), [ventas, p1, p2, porSucursal]);

  const cajasF      = useMemo(() => porSucursal(cajasAbiertas), [cajasAbiertas, porSucursal]);
  const sesionesF   = useMemo(() => porSucursal(enPeriodo(maestro?.sesiones)), [maestro, enPeriodo, porSucursal]);
  const rutasLiq    = useMemo(() => enPeriodo(maestro?.rutasLiq), [maestro, enPeriodo]);
  const rutasLiqF   = useMemo(() => porSucursal(rutasLiq), [rutasLiq, porSucursal]);
  const rutasVivasF = useMemo(() => porSucursal(maestro?.rutasVivas || []), [maestro, porSucursal]);
  const movsCaja    = useMemo(() => maestro?.movsCaja || [], [maestro]);
  const truncado    = maestro?.truncado || false;

  // A los ajustes se les pega el precio del catálogo y el nombre de quien los hizo.
  const salidasSinTicket = useMemo(() => enPeriodo(maestro?.ajustes).map(m => ({
    ...m,
    precio: Number(catalogo.get(m.producto_id)?.precio || 0),
    quien: personas.get(m.usuario_id) || 'Sin usuario',
  })), [maestro, enPeriodo, catalogo, personas]);

  const salidasF = useMemo(() => porSucursal(salidasSinTicket), [salidasSinTicket, porSucursal]);

  // Ventas con sus partidas resueltas (solo cuando ya llegaron).
  const itemsDe = useCallback((venta) => (
    (detalles?.get(venta.id) || []).map(d => {
      const p = catalogo.get(d.producto_id);
      return {
        id: d.producto_id,
        nombre:    p?.nombre    || 'Producto dado de baja',
        sku:       p?.sku       || '—',
        categoria: p?.categoria || 'Sin categoría',
        cantidad:  Number(d.cantidad) || 0,
        precio:    Number(d.precio_unitario) || 0,
      };
    })
  ), [detalles, catalogo]);

  const ventasConItems = useMemo(() => (
    detalles ? ventasF.map(v => ({ ...v, items: itemsDe(v) })) : []
  ), [detalles, ventasF, itemsDe]);

  // Ventas que se guardaron sin sucursal: al filtrar desaparecen, así que se
  // avisa en vez de dejar que los totales no cuadren.
  const ventasSinSucursal = useMemo(
    () => ventas.filter(v => !v.sucursal_id).length, [ventas]);

  // ── KPIs del periodo, con comparativo real ────────────────────────────────
  const kpi = useMemo(() => {
    const total   = ventasF.reduce((a, v) => a + v.total, 0);
    const ordenes = ventasF.length;
    const ef      = ventasF.reduce((a, v) => a + v.efectivo, 0);
    const tar     = ventasF.reduce((a, v) => a + v.tarjeta, 0);
    const trans   = ventasF.reduce((a, v) => a + v.transferencia, 0);

    const totalPrev   = ventasPrevF.reduce((a, v) => a + v.total, 0);
    const ordenesPrev = ventasPrevF.length;
    const efPrev      = ventasPrevF.reduce((a, v) => a + v.efectivo, 0);

    return {
      total, ordenes, ef, tar, trans,
      ticket: ordenes > 0 ? total / ordenes : 0,
      dTotal:   variacion(total, totalPrev),
      dOrdenes: variacion(ordenes, ordenesPrev),
      dTicket:  variacion(ordenes > 0 ? total / ordenes : 0,
                          ordenesPrev > 0 ? totalPrev / ordenesPrev : 0),
      dEf:      variacion(ef, efPrev),
    };
  }, [ventasF, ventasPrevF]);

  // ── Ventas en ruta (no pasan por la tabla `ventas`) ───────────────────────
  const ruta = useMemo(() => ({
    liquidaciones: rutasLiqF.length,
    dinero:    rutasLiqF.reduce((a, r) => a + Number(r.dinero_real      || 0), 0),
    lista:     rutasLiqF.reduce((a, r) => a + Number(r.total_lista      || 0), 0),
    descuento: rutasLiqF.reduce((a, r) => a + Number(r.descuento_campo  || 0), 0),
    vivas:     rutasVivasF.length,
  }), [rutasLiqF, rutasVivasF]);

  // ── Mercancía que salió sin ticket (ajustes a la baja) ────────────────────
  const salidas = useMemo(() => {
    const pz    = (m) => m.piezas;
    const valor = (m) => m.piezas * m.precio;

    const resumen = (filas) => ({
      movimientos: filas.length,
      piezas: filas.reduce((a, m) => a + pz(m), 0),
      valor:  filas.reduce((a, m) => a + valor(m), 0),
    });

    const chicos   = salidasF.filter(m => pz(m) <= PZ_SALIDA_SUELTA);
    const grandes  = salidasF.filter(m => pz(m) >  PZ_SALIDA_SUELTA);

    const porPersona = {};
    chicos.forEach(m => {
      const n = m.quien;
      if (!porPersona[n]) porPersona[n] = { nombre: n, movimientos: 0, piezas: 0, valor: 0 };
      porPersona[n].movimientos++;
      porPersona[n].piezas += pz(m);
      porPersona[n].valor  += valor(m);
    });

    // Desde el 18-sep el ajuste guarda el motivo en `notas`; lo de antes decía
    // siempre "Ajuste manual", que es lo mismo que no decir nada.
    const porMotivo = {};
    salidasF.forEach(m => {
      const clave = !m.motivo || m.motivo === 'Ajuste manual' ? 'Sin motivo registrado' : m.motivo;
      if (!porMotivo[clave]) porMotivo[clave] = { motivo: clave, movimientos: 0, piezas: 0, valor: 0 };
      porMotivo[clave].movimientos++;
      porMotivo[clave].piezas += pz(m);
      porMotivo[clave].valor  += valor(m);
    });

    return {
      porMotivo: Object.values(porMotivo).sort((a, b) => b.valor - a.valor),
      conMotivo: salidasF.some(m => m.motivo && m.motivo !== 'Ajuste manual'),
      mostrador: {
        ...resumen(chicos),
        porPersona: Object.values(porPersona).sort((a, b) => b.valor - a.valor),
      },
      correcciones: {
        ...resumen(grandes),
        mayores: [...grandes].sort((a, b) => valor(b) - valor(a)).slice(0, 3).map(m => ({
          id: m.id,
          nombre: m.nombre,
          piezas: m.piezas,
          valor: valor(m),
          cuando: m.cuando,
          quien: m.quien,
        })),
      },
    };
  }, [salidasF]);

  // ── Avance de la captura del catálogo ────────────────────────────────────
  // El dueño está cargando el almacén A MANO, producto por producto. Mientras
  // eso dure, "cuánto me falta" le sirve más que cualquier gráfica de ventas.
  // El bloque desaparece solo cuando ya no falta nada.
  const entradasF = useMemo(() => enPeriodo(maestro?.entradas), [maestro, enPeriodo]);

  const cargaCatalogo = useMemo(() => {
    if (!stock.length || !sucursales.length || !catalogo.size) return null;

    const porSucursal = sucursales.map(s => {
      const filas = stock.filter(x => x.sucursal_id === s.id
                                   && catalogo.get(x.producto_id)?.activo !== false);
      const con   = filas.filter(x => (x.stock || 0) > 0).length;
      const total = filas.length;
      const surtidos = new Set(
        entradasF.filter(e => e.sucursal_id === s.id).map(e => e.producto_id)
      ).size;
      return {
        ...s, con, total, faltan: total - con,
        pct: total ? Math.round((con / total) * 100) : 0,
        surtidos,
      };
    });

    const total = porSucursal.reduce((a, x) => a + x.total, 0);
    const con   = porSucursal.reduce((a, x) => a + x.con,   0);
    return { porSucursal, total, con, faltan: total - con,
             pct: total ? Math.round((con / total) * 100) : 0 };
  }, [stock, sucursales, catalogo, entradasF]);

  // ── Serie de la gráfica (ver src/lib/periodos.js) ────────────────────────
  const serie = useMemo(() => cubetasDe(ventasF, rango), [ventasF, rango]);

  const maxSerie   = Math.max(...serie.map(d => d.sum), 1);
  const totalSerie = serie.reduce((a, d) => a + d.sum, 0);
  const conVenta   = serie.filter(d => d.sum > 0).length;

  // ── Productos del periodo ─────────────────────────────────────────────────
  const productosDelPeriodo = useMemo(() => {
    // Existencias por producto, ya filtradas por sucursal.
    const conStock = new Map();
    for (const fila of stock) {
      const p = catalogo.get(fila.producto_id);
      if (!p || p.activo === false) continue;
      if (sucursalFiltro !== 'todas' && fila.sucursal_id !== sucursalFiltro) continue;
      const acc = conStock.get(p.id);
      if (acc) acc.stock += fila.stock || 0;
      else conStock.set(p.id, { ...p, stock: fila.stock || 0 });
    }

    const map = {};
    ventasConItems.forEach(v => {
      v.items.forEach(item => {
        if (!item.id) return;
        if (!map[item.id]) map[item.id] = {
          id: item.id, nombre: item.nombre, sku: item.sku,
          categoria: item.categoria, unidades: 0, ingresos: 0,
        };
        map[item.id].unidades += item.cantidad;
        map[item.id].ingresos += item.cantidad * item.precio;
      });
    });

    const arr = Object.values(map);
    const porUnidades = [...arr].sort((a, b) => b.unidades - a.unidades);
    const vendidos = new Set(arr.map(p => p.id));
    const sinMovimiento = [...conStock.values()]
      .filter(p => !vendidos.has(p.id))
      .sort((a, b) => b.stock - a.stock);

    return {
      top5Units:   porUnidades.slice(0, 5),
      top5Revenue: [...arr].sort((a, b) => b.ingresos - a.ingresos).slice(0, 5),
      bottom5:     porUnidades.filter(p => p.unidades > 0).slice(-5).reverse(),
      sinMovimiento,
      conExistencia: conStock.size,
    };
  }, [ventasConItems, stock, catalogo, sucursalFiltro]);

  // ── Flujo de caja: esperado vs contado, turno por turno ───────────────────
  // El efectivo declarado es el dinero FÍSICO del cajón: incluye el fondo
  // inicial y lo afectan retiros y depósitos. Comparar ese número contra el
  // efectivo de las ventas (como se hacía) siempre da un descuadre falso.
  const flujo = useMemo(() => {
    const porSesion = {};
    ventasF.forEach(v => {
      if (!v.sesion_caja_id) return;
      const s = porSesion[v.sesion_caja_id] ||= { ef: 0, tar: 0, trans: 0, n: 0 };
      s.ef += v.efectivo; s.tar += v.tarjeta; s.trans += v.transferencia; s.n++;
    });

    const detalle = sesionesF.map(s => {
      const v = porSesion[s.id] || { ef: 0, tar: 0, trans: 0, n: 0 };
      const movs = movsCaja.filter(m => m.sesion_caja_id === s.id);
      const retiros   = movs.filter(m => m.tipo === 'retiro'  ).reduce((a, m) => a + Number(m.monto || 0), 0);
      const depositos = movs.filter(m => m.tipo === 'deposito').reduce((a, m) => a + Number(m.monto || 0), 0);
      const fondo     = Number(s.fondo_inicial) || 0;
      const esperado  = fondo + v.ef + depositos - retiros;
      const cerrada   = s.estado === 'cerrada';
      const declarado = cerrada ? Number(s.efectivo_declarado) || 0 : null;
      return {
        id: s.id,
        nombre: personas.get(s.usuario_id) || 'Cuenta dada de baja',
        apertura: s.fecha_apertura,
        cerrada, fondo, retiros, depositos,
        ventas: v,
        esperado, declarado,
        diferencia: cerrada ? declarado - esperado : null,
        tarjetaDeclarada: cerrada ? Number(s.tarjeta_declarado) || 0 : 0,
        transfDeclarada:  cerrada ? Number(s.transferencia_declarado) || 0 : 0,
      };
    });

    const cerradas = detalle.filter(d => d.cerrada);
    const porEmpleado = {};
    cerradas.forEach(d => {
      const e = porEmpleado[d.nombre] ||= {
        nombre: d.nombre, turnos: 0, fondos: 0, ventasEf: 0, ventasTar: 0, ventasTrans: 0,
        retiros: 0, depositos: 0, esperado: 0, declarado: 0,
      };
      e.turnos++;
      e.fondos      += d.fondo;
      e.ventasEf    += d.ventas.ef;
      e.ventasTar   += d.ventas.tar;
      e.ventasTrans += d.ventas.trans;
      e.retiros     += d.retiros;
      e.depositos   += d.depositos;
      e.esperado    += d.esperado;
      e.declarado   += d.declarado;
    });

    const fueraDeCorte = ventasF.filter(v => !v.sesion_caja_id);

    return {
      detalle, cerradas: cerradas.length,
      abiertas: detalle.filter(d => !d.cerrada).length,
      totalFondos:   cerradas.reduce((a, d) => a + d.fondo, 0),
      esperado:      cerradas.reduce((a, d) => a + d.esperado, 0),
      declarado:     cerradas.reduce((a, d) => a + d.declarado, 0),
      diferencia:    cerradas.reduce((a, d) => a + (d.diferencia || 0), 0),
      retiros:       cerradas.reduce((a, d) => a + d.retiros, 0),
      depositos:     cerradas.reduce((a, d) => a + d.depositos, 0),
      conDescuadre:  cerradas.filter(d => Math.abs(d.diferencia) >= 1).length,
      porEmpleado:   Object.values(porEmpleado).sort((a, b) => b.esperado - a.esperado),
      fueraDeCorte: {
        tickets: fueraDeCorte.length,
        total:   fueraDeCorte.reduce((a, v) => a + v.total, 0),
        efectivo: fueraDeCorte.reduce((a, v) => a + v.efectivo, 0),
      },
    };
  }, [ventasF, sesionesF, movsCaja, personas]);

  // ── Comparativo por sucursal (mismo periodo que todo lo demás) ────────────
  const comparativo = useMemo(() => {
    const enRango = enPeriodo(ventas);
    const filas = sucursales.map(s => {
      const vts    = enRango.filter(v => v.sucursal_id === s.id);
      const stk    = stock.filter(x => x.sucursal_id === s.id
                                    && catalogo.get(x.producto_id)?.activo !== false);
      const rutaS  = rutasLiq.filter(r => r.sucursal_id === s.id);
      const salS   = salidasSinTicket.filter(m => m.sucursal_id === s.id);
      const total  = vts.reduce((a, v) => a + v.total, 0);
      return {
        ...s,
        total, tickets: vts.length,
        ticketPromedio: vts.length ? total / vts.length : 0,
        unidadesVendidas: detalles
          ? vts.reduce((a, v) => a + itemsDe(v).reduce((b, i) => b + i.cantidad, 0), 0)
          : null,
        rutaDinero: rutaS.reduce((a, r) => a + Number(r.dinero_real || 0), 0),
        rutaLiquidaciones: rutaS.length,
        salidasValor: salS.filter(m => m.piezas <= PZ_SALIDA_SUELTA)
                          .reduce((a, m) => a + m.piezas * m.precio, 0),
        salidasMovs:  salS.filter(m => m.piezas <= PZ_SALIDA_SUELTA).length,
        correccionesValor: salS.filter(m => m.piezas > PZ_SALIDA_SUELTA)
                               .reduce((a, m) => a + m.piezas * m.precio, 0),
        correccionesMovs:  salS.filter(m => m.piezas > PZ_SALIDA_SUELTA).length,
        productos: stk.length,
        unidades: stk.reduce((a, x) => a + (x.stock || 0), 0),
        conExistencia: stk.filter(x => (x.stock || 0) > 0).length,
        bajos: stk.filter(x => (x.stock || 0) > 0 && x.stock <= 5).length,
        enCero: stk.filter(x => (x.stock || 0) === 0).length,
        valorInventario: stk.reduce(
          (a, x) => a + (x.stock || 0) * Number(catalogo.get(x.producto_id)?.precio || 0), 0),
      };
    });
    return filas;
  }, [sucursales, ventas, enPeriodo, stock, catalogo, rutasLiq, salidasSinTicket, detalles, itemsDe]);

  const totalNegocio = kpi.total + ruta.dinero;
  const etq = rango.etiqueta;

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-4 lg:p-7 max-w-7xl mx-auto space-y-6">

        <DashboardHero userName={userName} />

        {/* Sub-tabs + periodo + sucursal */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
              {SUB_TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSubTab(t.key)}
                  className={`px-5 py-1.5 text-[13px] font-medium rounded-full transition-all ${
                    subTab === t.key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {sucursales.length > 1 && (
              <div className="relative">
                <Store className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <select value={sucursalFiltro} onChange={e => setSucursalFiltro(e.target.value)}
                  className="neb-input w-auto !py-1.5 pl-9 pr-9 text-[12px] font-semibold appearance-none">
                  <option value="todas">Todas las sucursales</option>
                  {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
              </div>
            )}
          </div>

          {/* Un solo periodo para TODO el dashboard */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
              {PERIODOS.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-4 py-1 text-[12px] font-semibold rounded-full transition-all ${
                    periodo === p.key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-slate-500 dark:text-slate-400">
              {rango.desde.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
              {' → '}
              {rango.hasta.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
              {' · todo lo de esta pantalla mira este rango'}
            </p>
            {(cargando || refrescando) && (
              <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {cargando ? 'cargando…' : 'actualizando…'}
              </span>
            )}
          </div>
        </div>

        {errorCarga && (
          <Aviso icon={AlertTriangle} titulo="No se pudieron cargar los datos" tono="rosa">
            {errorCarga}
          </Aviso>
        )}
        {truncado && (
          <Aviso icon={AlertTriangle} titulo="El periodo trae demasiados registros">
            Se cargaron los primeros {MAX_FILAS.toLocaleString('es-MX')} y los números
            de abajo están incompletos. Elige un periodo más corto.
          </Aviso>
        )}
        {ventasSinSucursal > 0 && sucursalFiltro !== 'todas' && (
          <Aviso icon={AlertTriangle} titulo={`${ventasSinSucursal} venta(s) sin sucursal asignada`}>
            No aparecen en ningún filtro de sucursal, solo en “Todas”. Por eso la suma
            de las sucursales puede quedar por debajo del total.
          </Aviso>
        )}

        {/* ══════════════════ RESUMEN ══════════════════ */}
        {subTab === 'resumen' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard label={`Ventas de mostrador · ${etq}`} value={fmt(kpi.total)}
                       icon={DollarSign} delta={kpi.dTotal} nota={rango.comparativa} />
              <KpiCard label={`Tickets · ${etq}`} value={kpi.ordenes}
                       icon={ShoppingBag} delta={kpi.dOrdenes} nota={rango.comparativa} />
              <KpiCard label="Ticket promedio" value={fmt(kpi.ticket)}
                       icon={TrendingUp} delta={kpi.dTicket} nota={rango.comparativa} />
              <KpiCard label="Efectivo cobrado" value={fmt(kpi.ef)}
                       icon={Banknote} delta={kpi.dEf} nota={rango.comparativa} />
            </div>

            {/* Avance de la captura del catálogo. Se va solo cuando termine. */}
            {cargaCatalogo && cargaCatalogo.faltan > 0 && (
              <div className="neb-card p-5 lg:p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                      Avance de la carga de inventario
                    </h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Productos del catálogo que ya tienen existencia capturada
                    </p>
                  </div>
                  <p className="text-[13px] text-slate-500 dark:text-slate-400 neb-tabular">
                    <strong className="text-slate-900 dark:text-white text-[18px]">{cargaCatalogo.con}</strong>
                    {' '}de {cargaCatalogo.total} · faltan{' '}
                    <strong className="text-amber-600">{cargaCatalogo.faltan}</strong>
                  </p>
                </div>

                <div className="space-y-4">
                  {cargaCatalogo.porSucursal.map(s => (
                    <div key={s.id}>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                          <Store className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> {s.nombre}
                        </span>
                        <span className="text-[12px] text-slate-500 dark:text-slate-400 neb-tabular">
                          {s.con}/{s.total} · <strong className="text-slate-900 dark:text-white">{s.pct}%</strong>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            s.pct >= 90 ? 'bg-emerald-500' : s.pct > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 neb-tabular">
                        {s.faltan === 0
                          ? 'Completa'
                          : `Falta${s.faltan === 1 ? '' : 'n'} ${s.faltan} producto${s.faltan === 1 ? '' : 's'} por capturar`}
                        {s.surtidos > 0 &&
                          ` · ${s.surtidos} recibi${s.surtidos === 1 ? 'ó' : 'eron'} mercancía en ${etq}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Total del negocio: mostrador + ruta, y lo que no se ve */}
            <div className="neb-card p-5 lg:p-6">
              <div className="mb-5">
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Total del negocio · {etq}</h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Las ventas en ruta no pasan por la caja: se liquidan aparte y hasta ahora no entraban a ningún total.
                </p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2.5">
                    <ScanLine className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <span className="text-[13px] text-slate-700 dark:text-slate-300">
                      Mostrador <span className="text-slate-400 dark:text-slate-500">· {kpi.ordenes} ticket(s)</span>
                    </span>
                  </div>
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(kpi.total)}</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <span className="text-[13px] text-slate-700 dark:text-slate-300">
                      Ventas en ruta <span className="text-slate-400 dark:text-slate-500">· {ruta.liquidaciones} liquidación(es)</span>
                    </span>
                  </div>
                  <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(ruta.dinero)}</span>
                </div>
                {ruta.liquidaciones > 0 && (
                  <div className="flex items-center justify-between py-3">
                    <span className="text-[12px] text-slate-500 dark:text-slate-400 pl-7">
                      Descuento de campo (lista {fmt(ruta.lista)} → cobrado {fmt(ruta.dinero)})
                    </span>
                    <span className="text-[13px] font-medium text-amber-600 neb-tabular">{fmtFirmado(-ruta.descuento)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-4 mt-1">
                  <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</span>
                  <span className="text-[20px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(totalNegocio)}</span>
                </div>
              </div>

              {ruta.vivas > 0 && (
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-4 flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5" />
                  {ruta.vivas} ruta(s) sin liquidar: su dinero todavía no cuenta en ningún total.
                </p>
              )}
            </div>

            {/* Inventario bajado a mano: los hechos, sin conclusiones */}
            {(salidas.mostrador.movimientos > 0 || salidas.correcciones.movimientos > 0) && (
              <Aviso
                icon={PackageX}
                tono="neutral"
                titulo={`${fmt(salidas.mostrador.valor + salidas.correcciones.valor)} de inventario bajado a mano · ${etq}`}
              >
                <p>
                  Valuado a precio de venta. <strong>No es una venta ni entra a los totales de
                  arriba.</strong> Mientras se siga capturando el catálogo, buena parte de esto son
                  correcciones de la propia captura. Los ajustes hechos desde el 18-sep traen
                  motivo; los anteriores salen como “sin motivo registrado”.
                </p>

                <div className="mt-3 space-y-1">
                  {salidas.mostrador.movimientos > 0 && (
                    <p className="neb-tabular">
                      <strong>Bajas sueltas</strong> (1 a {PZ_SALIDA_SUELTA} pz):
                      {' '}{fmt(salidas.mostrador.valor)} · {salidas.mostrador.movimientos} mov ·
                      {' '}{salidas.mostrador.piezas} pz
                      {salidas.mostrador.porPersona.length > 0 && (
                        <span className="opacity-80">
                          {' '}— {salidas.mostrador.porPersona.slice(0, 3)
                                  .map(p => `${p.nombre} ${fmt(p.valor)}`).join(' · ')}
                        </span>
                      )}
                    </p>
                  )}
                  {salidas.correcciones.movimientos > 0 && (
                    <p className="neb-tabular">
                      <strong>Bajas de volumen</strong> (más de {PZ_SALIDA_SUELTA} pz):
                      {' '}{fmt(salidas.correcciones.valor)} · {salidas.correcciones.movimientos} mov ·
                      {' '}{salidas.correcciones.piezas} pz — por el tamaño solo pueden ser
                      corrección de carga o de conteo.
                    </p>
                  )}
                </div>

                {salidas.conMotivo && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <p className="font-semibold mb-1">Por motivo</p>
                    <ul className="space-y-0.5">
                      {salidas.porMotivo.map(m => (
                        <li key={m.motivo} className="neb-tabular">
                          · {m.motivo}: {fmt(m.valor)} ({m.movimientos} mov, {m.piezas} pz)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {salidas.correcciones.mayores.length > 0 && (
                  <ul className="mt-2 space-y-0.5 opacity-90">
                    {salidas.correcciones.mayores.map(m => (
                      <li key={m.id} className="neb-tabular">
                        · {m.nombre}: −{m.piezas} pz ({fmt(m.valor)}) ·{' '}
                        {new Date(m.cuando).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} · {m.quien}
                      </li>
                    ))}
                  </ul>
                )}
              </Aviso>
            )}

            {/* Gráfica + cajas activas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="neb-card p-5 lg:p-6 lg:col-span-2 relative overflow-hidden">
                <div className="mb-5">
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                    Ventas de mostrador · {etq}
                  </h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 neb-tabular">
                    {fmt(totalSerie)}
                    <span className="text-slate-300 mx-1.5">·</span>
                    promedio {fmt(totalSerie / Math.max(1, conVenta))} por {
                      rango.grano === 'hora' ? 'hora con venta' :
                      rango.grano === 'dia'  ? 'día con venta'  : 'mes con venta'
                    }
                  </p>
                </div>

                <div className="flex items-end justify-between gap-1 mt-6 h-48 border-b border-slate-100 dark:border-slate-800 pb-2">
                  {serie.map((d, i) => {
                    const pct = Math.round((d.sum / maxSerie) * 100);
                    const alto = d.sum > 0 ? Math.max(pct, 4) : 0;
                    const mostrarLabel = serie.length <= 16 || i % 5 === 0 || i === serie.length - 1;
                    return (
                      <div key={d.clave} className="flex flex-col items-center flex-1 group min-w-0"
                           style={{ height: '100%', justifyContent: 'flex-end' }}
                           title={`${d.label}: ${fmt(d.sum)} · ${d.count} ticket(s)`}>
                        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          {d.sum >= 1000 ? `${(d.sum/1000).toFixed(1)}k` : d.sum.toFixed(0)}
                        </div>
                        <div
                          className={`w-full max-w-[32px] rounded-t-md transition-all ${d.sum > 0 ? 'bg-slate-800 dark:bg-slate-300' : 'bg-slate-100 dark:bg-slate-800'}`}
                          style={{ height: `${alto}%` }}
                        />
                        <div className="mt-2 text-[10px] font-medium text-slate-400 dark:text-slate-500 capitalize truncate w-full text-center">
                          {mostrarLabel ? d.label : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="neb-card p-5 lg:p-6 flex flex-col">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Cajas Activas</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Ahora mismo, no del periodo</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">
                    {cajasF.length}
                  </span>
                </div>
                <div className="flex-1 divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto neb-scroll">
                  {cajasF.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-slate-500 text-sm text-center">
                      <AlertTriangle className="w-7 h-7 mb-2 opacity-30" />
                      Sin cajas abiertas
                    </div>
                  ) : cajasF.map(c => (
                    <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center font-medium text-sm shrink-0">
                        {(c.usuarios_perfiles?.nombre_completo || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-white text-[13px] truncate">{c.usuarios_perfiles?.nombre_completo}</p>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 neb-tabular">
                          desde {new Date(c.fecha_apertura).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(c.fondo_inicial)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Métodos de pago */}
            <div className="neb-card p-5 lg:p-6">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">Distribución por Método de Pago</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-6">Cobro de mostrador · {etq}</p>
              <div className="space-y-5">
                {[
                  { label: 'Efectivo',      val: kpi.ef,    cls: 'bg-slate-900 dark:bg-slate-200' },
                  { label: 'Tarjeta',       val: kpi.tar,   cls: 'bg-blue-500' },
                  { label: 'Transferencia', val: kpi.trans, cls: 'bg-violet-400' },
                ].map(m => {
                  const pct = kpi.total > 0 ? (m.val / kpi.total) * 100 : 0;
                  return (
                    <div key={m.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 items-center">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${m.cls}`} />
                        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{m.label}</span>
                      </div>
                      <div className="text-right neb-tabular">
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white">{fmt(m.val)}</span>
                        <span className="text-[12px] text-slate-400 dark:text-slate-500 ml-2">{pct.toFixed(1)}%</span>
                      </div>
                      <div className="col-span-2 w-full bg-slate-100 dark:bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${m.cls}`}
                             style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transacciones recientes */}
            <div className="neb-card p-5 lg:p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Transacciones Recientes</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Últimas 8 de {kpi.ordenes} en {etq}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto neb-scroll">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="pb-3 pt-1 font-medium text-left px-3">Folio</th>
                      <th className="pb-3 pt-1 font-medium text-left px-3">Fecha</th>
                      <th className="pb-3 pt-1 font-medium text-left px-3">Corte</th>
                      <th className="pb-3 pt-1 font-medium text-right px-3">Items</th>
                      <th className="pb-3 pt-1 font-medium text-right px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {ventasF.slice(0, 8).map((v) => {
                      const folio = String(v.id).slice(0, 8);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 font-medium text-[11px] shrink-0">
                                {folio.slice(-2)}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white whitespace-nowrap">#{folio}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {v.fecha ? new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {v.sesion_caja_id ? (
                              <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-medium">En corte</span>
                            ) : (
                              <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium">Sin caja</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right text-[13px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {conteos.has(v.id) ? conteos.get(v.id) : '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-900 dark:text-white text-[14px] whitespace-nowrap">
                            {fmt(v.total)}
                          </td>
                        </tr>
                      );
                    })}
                    {ventasF.length === 0 && (
                      <tr><td colSpan={5} className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        {cargando ? 'Cargando…' : `Sin ventas registradas en ${etq}.`}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════ ANÁLISIS ══════════════════ */}
        {subTab === 'analisis' && (
          (cargando || cargandoStock || cargandoDetalles || !detalles) ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 Más Vendidos</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Por unidades · {etq}</p>
                  </div>
                  <RankingList items={productosDelPeriodo.top5Units} valueKey="unidades" valueLabel={(p) => `${p.unidades} uds`} />
                </div>
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Top 5 por Ingresos</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Mayor cobro · {etq}</p>
                  </div>
                  <RankingList items={productosDelPeriodo.top5Revenue} valueKey="ingresos" valueLabel={(p) => fmt(p.ingresos)} />
                </div>
              </div>

              <div className="neb-card p-5 lg:p-6">
                <div className="mb-5">
                  <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Menor Movimiento</h2>
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Lo que menos se vendió (pero se vendió) · {etq}</p>
                </div>
                {productosDelPeriodo.bottom5.length === 0 ? (
                  <p className="text-slate-400 dark:text-slate-500 text-sm py-4 text-center">Sin suficientes datos.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {productosDelPeriodo.bottom5.map((p) => (
                      <div key={p.id} className="rounded-xl p-4 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-sm line-clamp-2 leading-tight mb-2">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-2">{p.sku}</p>
                        <p className="font-semibold text-slate-900 dark:text-white neb-tabular">{p.unidades} uds</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 neb-tabular">{fmt(p.ingresos)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {productosDelPeriodo.sinMovimiento.length > 0 && (
                <div className="neb-card p-5 lg:p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Con Existencia y Sin Vender</h2>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {productosDelPeriodo.sinMovimiento.length} de {productosDelPeriodo.conExistencia} productos del catálogo · {etq}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {productosDelPeriodo.sinMovimiento.slice(0, 48).map(p => (
                      <div key={p.id} className="rounded-xl p-3 text-center border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40">
                        <p className="font-medium text-slate-800 dark:text-slate-200 text-xs line-clamp-2 leading-tight mb-1">{p.nombre}</p>
                        <p className="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-1">{p.sku}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 neb-tabular">{p.stock} en stock</p>
                      </div>
                    ))}
                  </div>
                  {productosDelPeriodo.sinMovimiento.length > 48 && (
                    <p className="text-[12px] text-slate-400 dark:text-slate-500 mt-3">
                      …y {productosDelPeriodo.sinMovimiento.length - 48} más.
                    </p>
                  )}
                </div>
              )}

              <CategoryBreakdown ventas={ventasConItems} etiqueta={etq} />
            </>
          )
        )}

        {/* ══════════════════ FLUJO DE CAJA ══════════════════ */}
        {subTab === 'flujo' && (
          cargando ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label={`Efectivo esperado · ${etq}`} value={fmt(flujo.esperado)} icon={Wallet}
                         nota="fondo + ventas en efectivo + depósitos − retiros" />
                <KpiCard label="Efectivo contado" value={fmt(flujo.declarado)} icon={Banknote}
                         nota={`${flujo.cerradas} turno(s) cerrado(s)`} />
                <KpiCard label="Diferencia" value={fmtFirmado(flujo.diferencia)} icon={ArrowUpRight}
                         delta={flujo.conDescuadre > 0
                           ? { txt: `${flujo.conDescuadre} turno(s)`, tipo: 'negative' }
                           : { txt: 'cuadrado', tipo: 'positive' }}
                         nota="contado − esperado" />
                <KpiCard label="Turnos abiertos" value={flujo.abiertas} icon={BarChart3}
                         nota={`${cajasF.length} caja(s) abierta(s) ahora`} />
              </div>

              {flujo.fueraDeCorte.tickets > 0 && (
                <Aviso icon={AlertTriangle} titulo={`${flujo.fueraDeCorte.tickets} venta(s) fuera de corte · ${fmt(flujo.fueraDeCorte.total)}`}>
                  Se cobraron sin una caja abierta (el admin puede vender sin caja), así que
                  su efectivo —{fmt(flujo.fueraDeCorte.efectivo)}— no lo respalda ningún arqueo.
                </Aviso>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Cobro de mostrador</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Lo que registró la Terminal · {etq}</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[
                      { label: 'Efectivo',      val: kpi.ef,    cls: 'bg-slate-900 dark:bg-slate-200' },
                      { label: 'Tarjeta',       val: kpi.tar,   cls: 'bg-blue-500' },
                      { label: 'Transferencia', val: kpi.trans, cls: 'bg-violet-400' },
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full ${m.cls}`} />
                          <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                        </div>
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-4 mt-1">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total cobrado</span>
                      <span className="text-[18px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(kpi.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Arqueo de los turnos cerrados</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                      El dinero del cajón incluye el fondo y las sangrías; por eso se compara contra el esperado, no contra las ventas.
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[
                      { label: 'Fondos iniciales',        val: flujo.totalFondos },
                      { label: 'Efectivo de ventas',      val: flujo.porEmpleado.reduce((a, e) => a + e.ventasEf, 0) },
                      { label: 'Depósitos a caja',        val: flujo.depositos },
                      { label: 'Retiros / sangrías',      val: -flujo.retiros },
                    ].map(m => (
                      <div key={m.label} className="flex items-center justify-between py-3">
                        <span className="text-[13px] text-slate-700 dark:text-slate-300">{m.label}</span>
                        <span className="text-[14px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(m.val)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Esperado en cajón</span>
                      <span className="text-[16px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(flujo.esperado)}</span>
                    </div>
                    <div className="flex items-center justify-between py-3">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Contado por el cajero</span>
                      <span className="text-[16px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(flujo.declarado)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-4 mt-1">
                      <span className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Diferencia</span>
                      <span className={`text-[18px] font-semibold neb-tabular ${
                        Math.abs(flujo.diferencia) < 1 ? 'text-emerald-600'
                          : flujo.diferencia < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                        {fmtFirmado(flujo.diferencia)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {flujo.porEmpleado.length > 0 ? (
                <div className="neb-card p-5 lg:p-6">
                  <div className="mb-5">
                    <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">Desglose por Empleado</h2>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">Turnos cerrados · {etq}</p>
                  </div>
                  <div className="overflow-x-auto neb-scroll">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <th className="pb-3 font-medium text-left pl-2">Empleado</th>
                          <th className="pb-3 font-medium text-center">Turnos</th>
                          <th className="pb-3 font-medium text-right">Fondos</th>
                          <th className="pb-3 font-medium text-right">Ventas ef.</th>
                          <th className="pb-3 font-medium text-right">Sangrías</th>
                          <th className="pb-3 font-medium text-right">Esperado</th>
                          <th className="pb-3 font-medium text-right">Contado</th>
                          <th className="pb-3 font-medium text-right pr-2">Dif.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {flujo.porEmpleado.map(emp => {
                          const dif = emp.declarado - emp.esperado;
                          return (
                            <tr key={emp.nombre} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 font-medium text-slate-900 dark:text-white pl-2">{emp.nombre}</td>
                              <td className="py-3 text-center">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[11px] font-medium">{emp.turnos}</span>
                              </td>
                              <td className="py-3 text-right text-slate-500 dark:text-slate-400 neb-tabular">{fmt(emp.fondos)}</td>
                              <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.ventasEf)}</td>
                              <td className="py-3 text-right text-slate-500 dark:text-slate-400 neb-tabular">
                                {emp.retiros || emp.depositos
                                  ? [emp.retiros   ? `−${fmt(emp.retiros)}`   : null,
                                     emp.depositos ? `+${fmt(emp.depositos)}` : null].filter(Boolean).join(' · ')
                                  : '—'}
                              </td>
                              <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.esperado)}</td>
                              <td className="py-3 text-right text-slate-700 dark:text-slate-300 neb-tabular">{fmt(emp.declarado)}</td>
                              <td className={`py-3 text-right font-semibold pr-2 neb-tabular ${
                                Math.abs(dif) < 1 ? 'text-emerald-600' : dif < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                                {fmtFirmado(dif)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
                    Esperado = fondo inicial + ventas en efectivo del turno + depósitos − retiros.
                    Entran los turnos que <strong>abrieron</strong> dentro del periodo (un turno que
                    se queda abierto de un día para otro se cuenta en el día que abrió).
                    El detalle turno por turno vive en Reportes → Cortes de caja.
                  </p>
                </div>
              ) : (
                <div className="neb-card p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
                  No hay cortes de caja cerrados en {etq}.
                </div>
              )}
            </>
          )
        )}

        {/* ══════════════════ SUCURSALES ══════════════════ */}
        {subTab === 'sucursales' && (
          (cargando || cargandoStock) ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-slate-400 dark:text-slate-500" /></div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-[15px] font-extrabold text-slate-900 dark:text-white">Comparativo de sucursales</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
                  Ventas de {etq} y existencias actuales. El filtro de sucursal de arriba no
                  aplica aquí: esta pestaña siempre compara todas. Asignación de empleados en Equipo.
                </p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {comparativo.map(s => (
                  <div key={s.id} className="neb-card p-5 space-y-5">
                    <p className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                      <Store className="w-4 h-4 text-accent-600" /> {s.nombre}
                    </p>

                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Mostrador · {etq}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{fmt(s.total)}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ventas</p>
                        </div>
                        <div>
                          <p className="text-2xl font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.tickets}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Tickets</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{fmt(s.ticketPromedio)}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Ticket prom.</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-slate-700 dark:text-slate-300 neb-tabular leading-none">{s.unidadesVendidas ?? '—'}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unid. vendidas</p>
                        </div>
                      </div>
                    </div>

                    {(s.rutaLiquidaciones > 0 || s.salidasMovs > 0 || s.correccionesMovs > 0) && (
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                        {s.rutaLiquidaciones > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-slate-600 dark:text-slate-400 flex items-center gap-2">
                              <Truck className="w-3.5 h-3.5" /> Ruta liquidada ({s.rutaLiquidaciones})
                            </span>
                            <span className="text-[13px] font-semibold text-slate-900 dark:text-white neb-tabular">{fmt(s.rutaDinero)}</span>
                          </div>
                        )}
                        {s.salidasMovs > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
                              <PackageX className="w-3.5 h-3.5" /> Bajas sueltas ({s.salidasMovs} mov.)
                            </span>
                            <span className="text-[13px] font-semibold text-amber-700 dark:text-amber-300 neb-tabular">{fmt(s.salidasValor)}</span>
                          </div>
                        )}
                        {s.correccionesMovs > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              <PackageX className="w-3.5 h-3.5" /> Correcciones de inventario ({s.correccionesMovs} mov.)
                            </span>
                            <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300 neb-tabular">{fmt(s.correccionesValor)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Inventario actual</p>
                      <div className="flex items-end justify-between mb-3">
                        <div>
                          <p className="text-2xl font-semibold text-emerald-600 neb-tabular leading-none">{fmt(s.valorInventario)}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Valor (a precio de venta)</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div>
                          <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.unidades}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Unidades</p>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-slate-900 dark:text-white neb-tabular leading-none">{s.conExistencia}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Con stock</p>
                        </div>
                        <div>
                          <p className={`text-base font-semibold neb-tabular leading-none ${s.bajos > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>{s.bajos}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">Stock bajo</p>
                        </div>
                        <div>
                          <p className={`text-base font-semibold neb-tabular leading-none ${s.enCero > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>{s.enCero}</p>
                          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1.5">En cero</p>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
                        {s.productos} {s.productos === 1 ? 'renglón' : 'renglones'} de catálogo en esta sucursal.
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {ventasSinSucursal > 0 && (
                <Aviso icon={AlertTriangle} titulo={`${ventasSinSucursal} venta(s) sin sucursal`}>
                  No las cuenta ninguna tarjeta de arriba. Se registraron sin sucursal asignada
                  (perfil sin sucursal y ninguna marcada como principal).
                </Aviso>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}
