import { useState, useEffect, useMemo } from 'react';
import {
  Truck, Plus, Minus, Search, ArrowRight,
  CheckCircle2, Loader2, X, AlertCircle,
  RotateCcw, Clock, ChevronRight,
  Receipt, Percent, Box, ArrowLeft, Printer,
  Store, Mail, Phone, Banknote
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const fmt = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

function fmtFecha(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

const ESTADO_META = {
  en_ruta:   { label: 'En Ruta',    cls: 'neb-chip neb-chip-warning'  },
  regresado: { label: 'Regresado',  cls: 'neb-chip neb-chip-info'     },
  liquidado: { label: 'Liquidado',  cls: 'neb-chip neb-chip-positive' },
};

// ── Ticket Global de Ruta ────────────────────────────────────────────────
function TicketRuta({ ruta, carga, onClose }) {
  const vendidos = carga.filter(c => (c.cantidad_vendida ?? 0) > 0);
  const ticketNumber = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const fechaLiq = ruta.fecha_liquidacion ? new Date(ruta.fecha_liquidacion) : new Date();
  const date = fechaLiq.toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = fechaLiq.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const totalPiezas = vendidos.reduce((s, c) => s + c.cantidad_vendida, 0);

  const handlePrint = () => {
    const ticketContent = document.getElementById('ticket-ruta-termico');
    if (!ticketContent) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const printDoc = iframe.contentWindow.document;
    printDoc.open();
    printDoc.write(`
      <html>
        <head>
          <title>Ticket Ruta</title>
          <style>
            body { margin: 0; padding: 10px; background: white; font-family: 'Courier New', Courier, monospace; }
            .ticket-print { width: 100%; max-width: 80mm; margin: 0 auto; color: #000; }
            .ticket-print * { font-size: 11px; line-height: 1.4; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-black { font-weight: 950; }
            .font-bold { font-weight: 700; }
            .text-2xl { font-size: 18px; font-weight: 900; }
            .border-y { border-top: 1px dashed #000; border-bottom: 1px dashed #000; }
            .border-b { border-bottom: 1px solid #000; }
            .border-t-2 { border-top: 2px solid #000; }
            .py-3 { padding-top: 8px; padding-bottom: 8px; }
            .pb-2 { padding-bottom: 4px; }
            .mb-1 { margin-bottom: 4px; }
            .mb-3 { margin-bottom: 10px; }
            .mb-4 { margin-bottom: 14px; }
            .mb-6 { margin-bottom: 20px; }
            .mt-2 { margin-top: 6px; }
            .mt-3 { margin-top: 10px; }
            .mt-6 { margin-top: 20px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .w-3\\/5 { width: 60%; }
            .w-1\\/5 { width: 20%; }
            .bg-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 4px; }
            @media print { @page { margin: 0; size: auto; } }
          </style>
        </head>
        <body>
          <div class="ticket-print">${ticketContent.innerHTML}</div>
          <script>
            window.onload = function() {
              window.focus(); window.print();
              setTimeout(function() { window.parent.document.body.removeChild(window.frameElement); }, 500);
            };
          <\/script>
        </body>
      </html>
    `);
    printDoc.close();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[95vh]">

        {/* Header del modal */}
        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100 dark:border-slate-800 z-10">
          <div className="flex items-center gap-3">
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/30 w-9 h-9 rounded-full flex items-center justify-center">
              <Truck className="w-4 h-4 text-amber-500 dark:text-amber-400" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-tight tracking-tight">¡Ruta liquidada!</h2>
              <p className="text-slate-500 dark:text-slate-400 text-[12px] mt-0.5 neb-tabular">Ticket Ruta #{ticketNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cuerpo con ticket térmico */}
        <div className="p-5 md:p-6 relative overflow-y-auto neb-scroll flex-1 flex flex-col items-center">
          <div id="ticket-ruta-termico" className="w-full max-w-sm bg-white dark:bg-slate-900 relative pb-8 pt-6 px-6 sm:px-8 font-mono text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-slate-800 neb-shadow">

            {/* Encabezado de tienda */}
            <div className="text-center mb-6 mt-2 flex flex-col items-center">
              <div className="w-12 h-12 neb-grad-primary text-white rounded-xl flex items-center justify-center mb-3">
                <Store className="w-5 h-5" />
              </div>
              <h3 className="font-extrabold text-xl uppercase tracking-[0.18em] text-slate-900 dark:text-white mb-1">Plásticos POS</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Sucursal Centro</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase font-bold">Av. Principal #123, Ciudad</p>
              <div className="flex items-center justify-center gap-3 mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> 555-0192</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> hola@pos.com</span>
              </div>
            </div>

            {/* Fecha / Ticket / Ruta */}
            <div className="border-y border-dashed border-slate-300 dark:border-slate-700 py-3 mb-4 text-[11px] font-bold text-slate-600 dark:text-slate-400 flex justify-between">
              <div>
                <p>FECHA: {date}</p>
                <p>HORA: {time}</p>
                <p className="mt-1 text-[10px] truncate max-w-[120px]">RUTA: {ruta.nombre || '—'}</p>
              </div>
              <div className="text-right">
                <p>TIPO: RUTA</p>
                <p>TICKET: {ticketNumber}</p>
              </div>
            </div>

            {/* Tabla de productos */}
            <div className="flex justify-between text-[11px] font-extrabold text-slate-900 dark:text-white border-b border-slate-300 dark:border-slate-700 pb-2 mb-3">
              <span className="w-3/5 text-left">DESCRIPCIÓN</span>
              <span className="w-1/5 text-center">CANT</span>
              <span className="w-1/5 text-right">IMPORTE</span>
            </div>

            <div className="space-y-3 mb-6 text-[12px]">
              {vendidos.length === 0 && (
                <p className="text-[11px] text-slate-400 italic">Sin productos vendidos</p>
              )}
              {vendidos.map(c => (
                <div key={c.id} className="flex flex-col">
                  <div className="flex justify-between items-start">
                    <span className="w-3/5 text-left font-bold text-slate-800 dark:text-slate-200 pr-2">{c.nombre_producto}</span>
                    <span className="w-1/5 text-center text-slate-600 dark:text-slate-400">{c.cantidad_vendida}</span>
                    <span className="w-1/5 text-right font-extrabold text-slate-900 dark:text-white">${(c.cantidad_vendida * c.precio_lista).toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${Number(c.precio_lista).toFixed(2)} c/u</span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="border-t-2 border-slate-800 pt-3 mb-4">
              <div className="flex justify-between font-extrabold text-xl text-slate-900 dark:text-white mb-1">
                <span>SUBTOTAL</span>
                <span>${Number(ruta.total_lista ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                <span>Total de piezas:</span>
                <span>{totalPiezas}</span>
              </div>
            </div>

            {/* Cuadre de caja */}
            <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">PRECIO DE LISTA:</span>
                <span className="font-bold">${Number(ruta.total_lista ?? 0).toFixed(2)}</span>
              </div>
              {Number(ruta.descuento_campo) > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>DESCUENTO EN CAMPO:</span>
                  <span className="font-bold">-${Number(ruta.descuento_campo).toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-slate-300 dark:border-slate-700 my-1" />
              <div className="flex justify-between font-extrabold text-[12px] pt-1 text-slate-900 dark:text-white">
                <span>TOTAL COBRADO:</span>
                <span>${Number(ruta.dinero_real ?? 0).toFixed(2)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-6">
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase mb-4">¡Gracias por su compra!</p>
              <div className="flex justify-center items-center h-12 w-full opacity-80 gap-0.5">
                {[...Array(40)].map((_, i) => (
                  <div key={i} className="bg-slate-900 h-full" style={{ width: `${Math.max(1, Math.random() * 4)}px` }} />
                ))}
              </div>
              <p className="text-[10px] tracking-[0.2em] text-slate-500 dark:text-slate-400 mt-1">{ticketNumber}RUTA{date.replace(/\//g, '')}</p>
            </div>

          </div>
        </div>

        {/* Footer del modal */}
        <div className="p-4 md:p-5 border-t border-slate-100/80 flex flex-col gap-2.5 shrink-0 z-10">
          <div className="flex gap-2.5">
            <button onClick={handlePrint} className="flex-1 neb-btn neb-btn-ghost py-3">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button
              onClick={() => alert('La impresión por Bluetooth está en preparación para la App Nativa.')}
              className="flex-1 neb-btn neb-btn-accent py-3"
            >
              <Printer className="w-4 h-4" /> Bluetooth
            </button>
          </div>
          <button onClick={onClose} className="w-full neb-btn neb-btn-primary py-3.5 text-base">
            Cerrar
          </button>
        </div>

      </div>
    </div>
  );
}

// ── Componente Principal ─────────────────────────────────────────────────
export default function VentasEnRuta({ userProfile }) {
  const [vista, setVista] = useState('lista');
  const [rutas, setRutas] = useState([]);
  const [rutaActiva, setRutaActiva] = useState(null);
  const [cargaActiva, setCargaActiva] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingRutas, setLoadingRutas] = useState(true);
  const [loadingProductos, setLoadingProductos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sucursales (la carga de ruta sale del stock de la sucursal elegida)
  const [sucursales, setSucursales] = useState([]);

  // Paso 1 — Carga
  const [nombreRuta, setNombreRuta] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [cargaItems, setCargaItems] = useState([]); // [{...producto, qty}]
  const [sucursalRuta, setSucursalRuta] = useState(userProfile?.sucursal_id || null);

  // Paso 2 — Descarga
  const [sobrantes, setSobrantes] = useState({}); // {carga_id: cantidad_sobrante}

  // Paso 3 — Liquidación
  const [dineroReal, setDineroReal] = useState('');

  // Ticket modal
  const [ticketData, setTicketData] = useState(null);

  // ── Data fetching ───────────────────────────────────────────────────
  const fetchRutas = async () => {
    setLoadingRutas(true);
    try {
      const { data, error } = await supabase
        .from('rutas')
        .select(`*, ruta_carga(*)`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const lista = data || [];
      setRutas(lista);

      const activa = lista.find(r => r.estado === 'en_ruta' || r.estado === 'regresado');
      setRutaActiva(activa || null);
      if (activa) setCargaActiva(activa.ruta_carga || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRutas(false);
    }
  };

  // Los productos de la ruta se cargan del stock REAL de la sucursal elegida
  // (producto_stock vía RPC), no de la columna legacy productos.stock que ya
  // no refleja el inventario por sucursal.
  const fetchProductos = async (sucursalId) => {
    if (!sucursalId) { setProductos([]); return; }
    setLoadingProductos(true);
    try {
      const { data, error } = await supabase
        .rpc('productos_de_sucursal', { p_sucursal: sucursalId });
      if (error) throw error;
      setProductos((data || []).filter(p => p.stock > 0));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProductos(false);
    }
  };

  useEffect(() => {
    fetchRutas();
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  // ── Navegación ──────────────────────────────────────────────────────
  const irANuevaRuta = () => {
    const suc = userProfile?.sucursal_id || sucursales[0]?.id || null;
    setCargaItems([]);
    setNombreRuta('');
    setSearchTerm('');
    setError('');
    setSucursalRuta(suc);
    fetchProductos(suc);
    setVista('carga');
  };

  // Cambiar la sucursal de origen: el stock difiere, así que se reinicia la carga
  const cambiarSucursalRuta = (sucId) => {
    if (sucId === sucursalRuta) return;
    setSucursalRuta(sucId);
    setCargaItems([]);
    setSearchTerm('');
    setError('');
    fetchProductos(sucId);
  };

  const irADescarga = () => {
    const init = {};
    cargaActiva.forEach(c => { init[c.id] = ''; });
    setSobrantes(init);
    setError('');
    setVista('descarga');
  };

  const irALiquidacion = () => {
    setDineroReal('');
    setError('');
    setVista('liquidacion');
  };

  // ── Handlers Paso 1 ─────────────────────────────────────────────────
  const addProducto = (prod) => {
    setCargaItems(prev => {
      const exists = prev.find(i => i.id === prod.id);
      if (exists) return prev.map(i => i.id === prod.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { ...prod, qty: 1 }];
    });
    setSearchTerm('');
  };

  const setQty = (id, val) => {
    const n = parseInt(val) || 0;
    if (n <= 0) {
      setCargaItems(prev => prev.filter(i => i.id !== id));
    } else {
      const prod = productos.find(p => p.id === id) || cargaItems.find(i => i.id === id);
      const max = prod?.stock ?? 9999;
      setCargaItems(prev => prev.map(i => i.id === id ? { ...i, qty: Math.min(n, max) } : i));
    }
  };

  const handleIniciarRuta = async () => {
    if (cargaItems.length === 0) { setError('Agrega al menos un producto.'); return; }
    if (!sucursalRuta) { setError('Selecciona la sucursal de origen.'); return; }
    setSaving(true); setError('');
    try {
      const productosJson = cargaItems.map(i => ({ id: i.id, cantidad: i.qty }));
      const { data, error } = await supabase.rpc('iniciar_ruta', {
        p_nombre: nombreRuta.trim(),
        p_productos: productosJson,
        p_sucursal: sucursalRuta,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      await fetchRutas();
      setVista('lista');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Handlers Paso 2 ─────────────────────────────────────────────────
  const handleRegresarRuta = async () => {
    setSaving(true); setError('');
    try {
      const sobranesJson = cargaActiva.map(c => ({
        carga_id: c.id,
        cantidad_sobrante: Math.max(0, parseInt(sobrantes[c.id] ?? c.cantidad_cargada) || 0),
      }));
      const { data, error } = await supabase.rpc('registrar_regreso_ruta', {
        p_ruta_id: rutaActiva.id,
        p_sobrantes: sobranesJson,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      await fetchRutas();
      setVista('lista');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Handlers Paso 3 ─────────────────────────────────────────────────
  const handleLiquidar = async () => {
    const dinero = parseFloat(dineroReal);
    if (isNaN(dinero) || dinero < 0) { setError('Ingresa un monto válido.'); return; }
    setSaving(true); setError('');
    try {
      const { data, error } = await supabase.rpc('liquidar_ruta', {
        p_ruta_id: rutaActiva.id,
        p_dinero_real: dinero,
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error);
      await fetchRutas();
      // Mostrar ticket
      const rutaFinal = { ...rutaActiva, ...data, estado: 'liquidado', fecha_liquidacion: new Date().toISOString() };
      setTicketData({ ruta: rutaFinal, carga: cargaActiva });
      setVista('lista');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Memos ────────────────────────────────────────────────────────────
  const productosFiltrados = useMemo(() => {
    if (!searchTerm.trim()) return productos.slice(0, 30);
    const q = searchTerm.toLowerCase();
    return productos.filter(p =>
      p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [productos, searchTerm]);

  const totalCarga = useMemo(() =>
    cargaItems.reduce((s, i) => s + i.precio * i.qty, 0), [cargaItems]);

  const resumenDescarga = useMemo(() => {
    return cargaActiva.map(c => {
      const sobrante = Math.max(0, parseInt(sobrantes[c.id] ?? c.cantidad_cargada) || 0);
      const vendida = Math.max(0, c.cantidad_cargada - sobrante);
      return { ...c, sobrante, vendida, subtotal: vendida * c.precio_lista };
    });
  }, [cargaActiva, sobrantes]);

  const totalLista = useMemo(() =>
    resumenDescarga.reduce((s, c) => s + c.subtotal, 0), [resumenDescarga]);

  const descuentoCampo = useMemo(() => {
    const dinero = parseFloat(dineroReal);
    return isNaN(dinero) ? 0 : Math.max(0, totalLista - dinero);
  }, [totalLista, dineroReal]);

  // ── Render helpers ───────────────────────────────────────────────────
  const renderEstadoBadge = (estado) => {
    const m = ESTADO_META[estado];
    return <span className={m.cls}>{m.label}</span>;
  };

  // ─────────────────────────────────────────────────────────────────────
  // VISTA: Lista / Historial
  // ─────────────────────────────────────────────────────────────────────
  if (vista === 'lista') {
    const historial = rutas.filter(r => r.estado === 'liquidado');

    return (
      <div className="h-full overflow-y-auto neb-scroll px-4 py-6 sm:px-6 max-w-3xl mx-auto">
        {ticketData && (
          <TicketRuta
            ruta={ticketData.ruta}
            carga={ticketData.carga}
            onClose={() => setTicketData(null)}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-semibold text-slate-900 dark:text-white text-[15px]">Ventas en Ruta</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Solo disponible para administradores</p>
            </div>
          </div>
          {!rutaActiva && (
            <button onClick={irANuevaRuta} className="neb-btn neb-btn-primary flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Nueva Ruta
            </button>
          )}
        </div>

        {loadingRutas ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Ruta activa */}
            {rutaActiva && (
              <div className="mb-6">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  Ruta activa
                </p>
                <div className="neb-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white text-[15px]">
                        {rutaActiva.nombre || 'Sin nombre'}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3" />
                        Salida: {fmtFecha(rutaActiva.fecha_salida)}
                      </div>
                    </div>
                    {renderEstadoBadge(rutaActiva.estado)}
                  </div>

                  {/* Resumen de carga */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Productos</p>
                      <p className="font-semibold text-slate-900 dark:text-white text-lg">{cargaActiva.length}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Piezas totales</p>
                      <p className="font-semibold text-slate-900 dark:text-white text-lg">
                        {cargaActiva.reduce((s, c) => s + c.cantidad_cargada, 0)}
                      </p>
                    </div>
                  </div>

                  {/* CTA según estado */}
                  {rutaActiva.estado === 'en_ruta' && (
                    <button onClick={irADescarga} className="neb-btn neb-btn-primary w-full flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" />
                      Registrar Regreso
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                  {rutaActiva.estado === 'regresado' && (
                    <button onClick={irALiquidacion} className="neb-btn neb-btn-accent w-full flex items-center justify-center gap-2">
                      <Banknote className="w-4 h-4" />
                      Liquidar Caja
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Sin rutas y sin activa */}
            {!rutaActiva && rutas.length === 0 && (
              <div className="text-center py-16">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <Truck className="w-7 h-7 text-slate-400" />
                </div>
                <p className="text-slate-600 dark:text-slate-300 font-medium">Sin rutas registradas</p>
                <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">Crea una nueva ruta para comenzar</p>
              </div>
            )}

            {/* Historial */}
            {historial.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
                  Historial
                </p>
                <div className="space-y-2">
                  {historial.map(r => (
                    <div key={r.id} className="neb-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200 text-[13px] truncate">
                            {r.nombre || 'Sin nombre'}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                            {fmtFecha(r.fecha_liquidacion)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-slate-900 dark:text-white text-[13px]">{fmt(r.dinero_real ?? 0)}</p>
                          {Number(r.descuento_campo) > 0 && (
                            <p className="text-[10px] text-amber-500">-{fmt(r.descuento_campo)} dto.</p>
                          )}
                        </div>
                        <button
                          onClick={() => setTicketData({ ruta: r, carga: r.ruta_carga || [] })}
                          className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // VISTA: Paso 1 — Carga
  // ─────────────────────────────────────────────────────────────────────
  if (vista === 'carga') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {/* Header fijo */}
        <div className="px-4 py-4 sm:px-6 border-b border-slate-200/60 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl flex items-center gap-3">
          <button onClick={() => setVista('lista')} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-white text-[14px]">Paso 1 — Carga a Camioneta</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Selecciona los productos que salen</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1,2,3].map(i => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i === 1 ? 'bg-slate-800 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto neb-scroll px-4 py-5 sm:px-6 max-w-3xl w-full mx-auto space-y-5">
          {/* Nombre de la ruta */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1.5">
              Nombre de la ruta (opcional)
            </label>
            <input
              className="neb-input"
              placeholder="Ej: Ruta Norte — Lunes"
              value={nombreRuta}
              onChange={e => setNombreRuta(e.target.value)}
            />
          </div>

          {/* Sucursal de origen (de dónde sale la mercancía) */}
          {sucursales.length > 1 && (
            <div>
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1.5">
                Sucursal de origen
              </label>
              <div className="inline-flex bg-slate-100 dark:bg-slate-800 rounded-full p-1 w-fit">
                {sucursales.map(s => (
                  <button key={s.id} type="button" onClick={() => cambiarSucursalRuta(s.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold rounded-full transition-all ${
                      sucursalRuta === s.id ? 'bg-white dark:bg-slate-900 text-accent-600 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}>
                    <Store className="w-3.5 h-3.5" />
                    {s.nombre}{s.id === userProfile?.sucursal_id ? ' (tú)' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
                La carga descuenta del inventario de esta sucursal; los sobrantes regresan a ella.
              </p>
            </div>
          )}

          {/* Buscador de productos */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1.5">
              Buscar producto
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                className="neb-input !pl-9"
                placeholder="Nombre o SKU..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            {loadingProductos ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm mt-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando productos...
              </div>
            ) : (
              searchTerm.trim() && (
                <div className="mt-2 border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden shadow-sm">
                  {productosFiltrados.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-400">Sin resultados</p>
                  ) : (
                    productosFiltrados.map(p => {
                      const yaEnCarga = cargaItems.find(i => i.id === p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => addProducto(p)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left border-b last:border-0 border-slate-100 dark:border-white/5 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{p.nombre}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{p.sku} · Stock: {p.stock}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{fmt(p.precio)}</span>
                            {yaEnCarga
                              ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                              : <Plus className="w-5 h-5 text-slate-400" />
                            }
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )
            )}
          </div>

          {/* Lista de carga seleccionada */}
          {cargaItems.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
                Manifiesto de carga ({cargaItems.length})
              </p>
              <div className="space-y-2">
                {cargaItems.map(item => (
                  <div key={item.id} className="neb-card p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Box className="w-4 h-4 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{item.nombre}</p>
                      <p className="text-[10px] text-slate-400">{fmt(item.precio)} × {item.qty} = {fmt(item.precio * item.qty)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setQty(item.id, item.qty - 1)}
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={item.stock}
                        value={item.qty}
                        onChange={e => setQty(item.id, e.target.value)}
                        className="w-12 text-center text-sm font-semibold text-slate-800 dark:text-slate-200 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg py-1 focus:outline-none focus:border-slate-400"
                      />
                      <button
                        onClick={() => setQty(item.id, item.qty + 1)}
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setCargaItems(prev => prev.filter(i => i.id !== item.id))}
                        className="w-7 h-7 rounded-full hover:bg-rose-50 dark:hover:bg-rose-900/30 flex items-center justify-center text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer fijo con total y CTA */}
        <div className="border-t border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-4 py-4 sm:px-6 max-w-3xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm mb-3 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">{cargaItems.length} productos · {cargaItems.reduce((s,i) => s+i.qty, 0)} piezas</span>
            <span className="font-semibold text-slate-900 dark:text-white">{fmt(totalCarga)}</span>
          </div>
          <button
            onClick={handleIniciarRuta}
            disabled={saving || cargaItems.length === 0}
            className="neb-btn neb-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Confirmar y Salir a Ruta
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // VISTA: Paso 2 — Descarga / Sobrantes
  // ─────────────────────────────────────────────────────────────────────
  if (vista === 'descarga') {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-4 py-4 sm:px-6 border-b border-slate-200/60 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl flex items-center gap-3">
          <button onClick={() => setVista('lista')} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-white text-[14px]">Paso 2 — Descarga / Sobrantes</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Anota cuánto regresó de cada producto</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1,2,3].map(i => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-colors ${i <= 2 ? 'bg-slate-800 dark:bg-white' : 'bg-slate-200 dark:bg-slate-700'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto neb-scroll px-4 py-5 sm:px-6 max-w-3xl w-full mx-auto">
          {/* Info de la ruta */}
          <div className="neb-card-soft p-4 mb-5 flex items-center gap-3">
            <Truck className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0" strokeWidth={2} />
            <div className="min-w-0">
              <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">{rutaActiva?.nombre || 'Ruta sin nombre'}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Salida: {fmtFecha(rutaActiva?.fecha_salida)}</p>
            </div>
          </div>

          <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
            Ingresa las cantidades que sobran
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Si un producto se vendió todo, deja el sobrante en 0.
          </p>

          <div className="space-y-2">
            {resumenDescarga.map(c => (
              <div key={c.id} className="neb-card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    <Box className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-200 text-[13px] truncate">{c.nombre_producto}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Cargado</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{c.cantidad_cargada}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Sobrante</p>
                        <input
                          type="number"
                          min="0"
                          max={c.cantidad_cargada}
                          placeholder={c.cantidad_cargada}
                          value={sobrantes[c.id] ?? ''}
                          onChange={e => setSobrantes(prev => ({ ...prev, [c.id]: e.target.value }))}
                          className="w-16 text-center text-sm font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                        />
                      </div>
                      <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                      <div className="text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider">Vendido</p>
                        <p className={`font-bold text-sm ${c.vendida > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          {c.vendida}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-4 py-4 sm:px-6 max-w-3xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm mb-3 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Total vendido (lista): <span className="font-semibold text-slate-700 dark:text-slate-300">{fmt(totalLista)}</span>
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {resumenDescarga.reduce((s,c) => s + c.vendida, 0)} piezas vendidas
            </span>
          </div>
          <button
            onClick={handleRegresarRuta}
            disabled={saving}
            className="neb-btn neb-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            Registrar Regreso
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // VISTA: Paso 3 — Liquidación de Caja
  // ─────────────────────────────────────────────────────────────────────
  if (vista === 'liquidacion') {
    const vendidos = cargaActiva.filter(c => (c.cantidad_vendida ?? 0) > 0);
    const dineroNum = parseFloat(dineroReal);
    const dineroValido = !isNaN(dineroNum) && dineroNum >= 0;

    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="px-4 py-4 sm:px-6 border-b border-slate-200/60 dark:border-white/5 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl flex items-center gap-3">
          <button onClick={() => setVista('lista')} className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-slate-900 dark:text-white text-[14px]">Paso 3 — Liquidación de Caja</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Cuadra el dinero cobrado en campo</p>
          </div>
          <div className="flex items-center gap-1.5">
            {[1,2,3].map(i => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-colors bg-slate-800 dark:bg-white`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto neb-scroll px-4 py-5 sm:px-6 max-w-3xl w-full mx-auto space-y-5">
          {/* Resumen de vendido */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">
              Resumen de ventas
            </p>
            <div className="neb-card overflow-hidden">
              {/* Header tabla */}
              <div className="grid grid-cols-4 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                <span className="col-span-2">Producto</span>
                <span className="text-center">Vendido</span>
                <span className="text-right">Subtotal</span>
              </div>
              {vendidos.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-400 text-center">Sin ventas para liquidar</p>
              ) : (
                vendidos.map(c => (
                  <div key={c.id} className="grid grid-cols-4 px-4 py-3 border-t border-slate-100 dark:border-white/5 items-center">
                    <div className="col-span-2 min-w-0">
                      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{c.nombre_producto}</p>
                      <p className="text-[10px] text-slate-400">{fmt(c.precio_lista)} c/u</p>
                    </div>
                    <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">{c.cantidad_vendida}</p>
                    <p className="text-right text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {fmt(c.cantidad_vendida * c.precio_lista)}
                    </p>
                  </div>
                ))
              )}
              <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
                <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total a precio de lista</span>
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">{fmt(totalLista)}</span>
              </div>
            </div>
          </div>

          {/* Input de dinero real */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest block mb-1.5">
              Dinero real cobrado en campo
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={dineroReal}
                onChange={e => setDineroReal(e.target.value)}
                className="neb-input !pl-8 text-lg font-semibold"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
              El descuento de campo se calcula automáticamente para cuadrar la diferencia.
            </p>
          </div>

          {/* Cuadre preview */}
          {dineroValido && (
            <div className="neb-card p-4 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vista previa del ticket</p>
              <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                <span>Total a precio de lista</span>
                <span className="font-medium tabular-nums">{fmt(totalLista)}</span>
              </div>
              {descuentoCampo > 0 && (
                <div className="flex justify-between text-sm text-amber-600 dark:text-amber-400">
                  <span className="flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5" />
                    Descuento por venta en campo
                  </span>
                  <span className="font-medium tabular-nums">-{fmt(descuentoCampo)}</span>
                </div>
              )}
              {dineroNum > totalLista && (
                <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
                  <span>Excedente cobrado</span>
                  <span className="font-medium tabular-nums">+{fmt(dineroNum - totalLista)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-slate-900 dark:text-white text-base pt-2 border-t border-slate-200 dark:border-white/10">
                <span>Total cobrado</span>
                <span className="tabular-nums">{fmt(dineroNum)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200/60 dark:border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl px-4 py-4 sm:px-6 max-w-3xl w-full mx-auto">
          {error && (
            <div className="flex items-center gap-2 text-rose-600 text-sm mb-3 bg-rose-50 dark:bg-rose-900/20 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <button
            onClick={handleLiquidar}
            disabled={saving || !dineroValido}
            className="neb-btn neb-btn-accent w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
            Liquidar y Generar Ticket
          </button>
        </div>
      </div>
    );
  }

  return null;
}
