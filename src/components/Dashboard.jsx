import { useState } from 'react';
import { AlertTriangle, Loader2, Store, ChevronDown } from 'lucide-react';
import { PERIODOS } from '../lib/periodos';
import { MAX_FILAS } from '../lib/paginado';
import { DashboardHero, Aviso, Cargando } from './dashboard/ui';
import { useDashboardDatos } from './dashboard/useDashboardDatos';
import TabResumen from './dashboard/TabResumen';
import TabAnalisis from './dashboard/TabAnalisis';
import TabFlujo from './dashboard/TabFlujo';
import TabSucursales from './dashboard/TabSucursales';

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard: UN periodo y UNA sucursal mandan sobre todo lo que se ve.
//
// Reorganizado el 27-sep-2026 (era un solo archivo de 1,700 líneas):
//   dashboard/useDashboardDatos.js  → qué se pide y cuándo (incluye realtime)
//   dashboard/calculos.js           → cuentas puras, con pruebas (npm test)
//   dashboard/Tab*.jsx              → una pestaña por archivo
//   lib/ventas.js + resumen_ventas  → los números de ventas los calcula la BASE,
//                                     así que Dashboard y Pedidos coinciden por
//                                     construcción.
// ─────────────────────────────────────────────────────────────────────────────

const SUB_TABS = [
  { key: 'resumen',    label: 'Resumen'       },
  { key: 'analisis',   label: 'Análisis'      },
  { key: 'flujo',      label: 'Flujo de Caja' },
  { key: 'sucursales', label: 'Sucursales'    },
];

export default function Dashboard({ userName = 'Admin' }) {
  const [subTab, setSubTab]   = useState('resumen');
  const [periodo, setPeriodo] = useState('7d');
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');

  const datos = useDashboardDatos({ periodo, sucursalFiltro, subTab });
  const { rango, sucursales, cargando, refrescando, errorCarga, truncado, resumen } = datos;

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
        {resumen.sinSucursal > 0 && sucursalFiltro !== 'todas' && (
          <Aviso icon={AlertTriangle} titulo={`${resumen.sinSucursal} venta(s) sin sucursal asignada`}>
            No aparecen en ningún filtro de sucursal, solo en “Todas”. Por eso la suma
            de las sucursales puede quedar por debajo del total.
          </Aviso>
        )}

        {cargando ? <Cargando /> : (
          <>
            {subTab === 'resumen'    && <TabResumen    datos={datos} />}
            {subTab === 'analisis'   && <TabAnalisis   datos={datos} />}
            {subTab === 'flujo'      && <TabFlujo      datos={datos} />}
            {subTab === 'sucursales' && <TabSucursales datos={datos} />}
          </>
        )}
      </div>
    </div>
  );
}
