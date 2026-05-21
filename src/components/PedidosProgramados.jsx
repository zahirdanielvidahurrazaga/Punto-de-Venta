import { useState, useEffect, useRef } from 'react';
import {
  CalendarDays, Plus, Search, X, Trash2, CheckCircle2,
  Clock, User, Phone, Package, Loader2, ShoppingBag,
  ClipboardList, AlertCircle, Tag, Banknote, CreditCard,
  Building2, Wallet, DollarSign, Printer, Store
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

// ─── constantes ────────────────────────────────────────────────────────────
const ESTADOS = [
  { key: 'todos',     label: 'Todos'      },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'listo',     label: 'Listos'     },
  { key: 'entregado', label: 'Entregados' },
  { key: 'cancelado', label: 'Cancelados' },
];

const ESTADO_STYLE = {
  pendiente: 'bg-amber-100 text-amber-700',
  listo:     'bg-blue-100 text-blue-700',
  entregado: 'bg-emerald-100 text-emerald-700',
  cancelado: 'bg-red-100 text-red-600',
};

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  listo:     'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => `$${Number(n).toFixed(2)}`;

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function urgencia(fechaEntrega) {
  const h = hoy();
  if (fechaEntrega < h) return 'vencido';
  if (fechaEntrega === h) return 'hoy';
  const m = new Date(); m.setDate(m.getDate() + 1);
  const ms = `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}-${String(m.getDate()).padStart(2,'0')}`;
  if (fechaEntrega === ms) return 'mañana';
  return 'normal';
}

function estadoPago(pedido) {
  const pagado = Number(pedido.pago_efectivo||0) + Number(pedido.pago_tarjeta||0) + Number(pedido.pago_transferencia||0);
  if (pagado <= 0)                         return { key: 'sin_pagar', label: 'Sin pagar',  cls: 'bg-red-100 text-red-600'         };
  if (pagado >= Number(pedido.total) - 0.01) return { key: 'pagado',    label: 'Pagado',     cls: 'bg-emerald-100 text-emerald-700'  };
  return                                          { key: 'anticipo',  label: 'Anticipo',   cls: 'bg-amber-100 text-amber-700'      };
}

const URG_BORDER = {
  vencido: 'border-red-300 bg-red-50',
  hoy:     'border-amber-300 bg-amber-50',
  mañana:  'border-blue-200 bg-blue-50',
  normal:  'border-slate-200 bg-white',
};

const URG_BADGE = {
  vencido: 'bg-red-100 text-red-700',
  hoy:     'bg-amber-100 text-amber-700',
  mañana:  'bg-blue-100 text-blue-700',
  normal:  '',
};

// ─── Sección de pago reutilizable ──────────────────────────────────────────
function SeccionPago({ efectivo, tarjeta, transferencia, onChange, total, label = 'Pago del Pedido' }) {
  const totalPagado = (parseFloat(efectivo)||0) + (parseFloat(tarjeta)||0) + (parseFloat(transferencia)||0);
  const pendiente   = Math.max(0, (parseFloat(total)||0) - totalPagado);
  const pagado      = totalPagado >= (parseFloat(total)||0) - 0.01 && totalPagado > 0;

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
        <Wallet className="w-3.5 h-3.5" /> {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'efectivo',      icon: Banknote,   label: 'Efectivo',     val: efectivo,      color: 'border-amber-200 focus:border-amber-400'  },
          { key: 'tarjeta',       icon: CreditCard, label: 'Tarjeta',      val: tarjeta,       color: 'border-blue-200 focus:border-blue-400'    },
          { key: 'transferencia', icon: Building2,  label: 'Transf.',      val: transferencia, color: 'border-purple-200 focus:border-purple-400' },
        ].map(m => (
          <div key={m.key}>
            <label className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1.5">
              <m.icon className="w-3 h-3" />{m.label}
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">$</span>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={m.val}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) onChange(m.key, v);
                }}
                className={`w-full pl-6 pr-2 py-2.5 bg-slate-50 border rounded-xl text-sm font-bold focus:outline-none focus:bg-white transition-all ${m.color}`}
              />
            </div>
          </div>
        ))}
      </div>

      {totalPagado > 0 && (
        <div className={`flex justify-between items-center px-4 py-2.5 rounded-xl border text-sm font-bold ${
          pagado ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          <span>{pagado ? '✓ Pedido pagado completo' : `Anticipo: ${fmt(totalPagado)}`}</span>
          {!pagado && <span>Pendiente: {fmt(pendiente)}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Modal de pago para pedidos existentes ─────────────────────────────────
function PagoModal({ pedido, onClose, onSaved }) {
  const [step,              setStep]             = useState('cobro'); // 'cobro' | 'ticket'
  const [efectivo,          setEfectivo]         = useState(Number(pedido.pago_efectivo)      > 0 ? String(pedido.pago_efectivo)      : '');
  const [tarjeta,           setTarjeta]          = useState(Number(pedido.pago_tarjeta)       > 0 ? String(pedido.pago_tarjeta)       : '');
  const [transferencia,     setTransferencia]    = useState(Number(pedido.pago_transferencia) > 0 ? String(pedido.pago_transferencia) : '');
  const [efectivoRecibido,  setEfectivoRecibido] = useState('');
  const [saving,            setSaving]           = useState(false);
  const [pagoGuardado,      setPagoGuardado]     = useState(null);

  const ef  = parseFloat(efectivo)         || 0;
  const tar = parseFloat(tarjeta)          || 0;
  const trf = parseFloat(transferencia)    || 0;
  const rec = parseFloat(efectivoRecibido) || 0;

  const totalPagado  = ef + tar + trf;
  const cambio       = ef > 0 && rec >= ef ? rec - ef : 0;
  const recFaltante  = ef > 0 && rec > 0 && rec < ef;
  const canSave      = totalPagado > 0 && !recFaltante && !saving;

  const handleChange = (key, val) => {
    if (key === 'efectivo')      { setEfectivo(val); setEfectivoRecibido(''); }
    if (key === 'tarjeta')       setTarjeta(val);
    if (key === 'transferencia') setTransferencia(val);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('pedidos_programados')
        .update({ pago_efectivo: ef, pago_tarjeta: tar, pago_transferencia: trf })
        .eq('id', pedido.id);
      if (error) throw error;
      onSaved();
      setPagoGuardado({ efectivo: ef, tarjeta: tar, transferencia: trf, totalPagado, efectivoRecibido: rec, cambio });
      setStep('ticket');
    } catch (err) {
      alert('Error al guardar el pago: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    const content = document.getElementById('ticket-pedido-programado');
    if (!content) return;
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>Ticket Pedido</title><style>
      body{margin:0;padding:10px;font-family:'Courier New',monospace}
      *{font-size:11px;line-height:1.4}
      .text-center{text-align:center}.text-right{text-align:right}
      .font-bold{font-weight:700}.font-black{font-weight:900}
      .flex{display:flex}.justify-between{justify-content:space-between}
      .border-t{border-top:1px dashed #000}.border-b{border-bottom:1px dashed #000}
      .border-t2{border-top:2px solid #000}
      .py2{padding:6px 0}.mb2{margin-bottom:6px}.mb4{margin-bottom:14px}
      @media print{@page{margin:0;size:auto}}
    </style></head><body>
    <div style="max-width:80mm;margin:0 auto">${content.innerHTML}</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.parent.document.body.removeChild(window.frameElement)},500)}<\/script>
    </body></html>`);
    doc.close();
  };

  const cartItems = (pedido.pedido_items || []).map(i => ({
    id: i.id, nombre: i.nombre_producto,
    precio: Number(i.precio_unitario), quantity: i.cantidad,
  }));

  // ── PASO 2: Ticket ──────────────────────────────────────────────────────
  if (step === 'ticket' && pagoGuardado) {
    const date = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit' });
    const time = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const pendiente = Number(pedido.total) - pagoGuardado.totalPagado;

    return (
      <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

          {/* Header ticket */}
          <div className="bg-slate-900 px-6 py-5 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-full">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold leading-tight">¡Pago Registrado!</h2>
                <p className="text-slate-300 text-xs font-medium">
                  {pedido.cliente_nombre || 'Pedido programado'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Zona del ticket */}
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <div
              id="ticket-pedido-programado"
              className="w-full max-w-sm bg-white shadow-lg px-6 pt-6 pb-8 font-mono text-slate-800 relative"
              style={{ filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.05))' }}
            >
              {/* Corte superior */}
              <div className="absolute top-0 left-0 right-0 h-3 flex overflow-hidden">
                {[...Array(30)].map((_,i) => <div key={i} className="w-3 h-3 bg-slate-100 rotate-45 transform origin-bottom-left -mt-2" />)}
              </div>

              {/* Cabecera */}
              <div className="text-center mb-4 mt-2">
                <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-black text-lg uppercase tracking-widest text-slate-900">Plásticos POS</h3>
                <p className="text-[10px] text-slate-500 uppercase mt-0.5">Pedido Programado</p>
                {pedido.cliente_nombre && (
                  <p className="text-xs font-bold text-slate-700 mt-1">Cliente: {pedido.cliente_nombre}</p>
                )}
                {pedido.cliente_contacto && (
                  <p className="text-[10px] text-slate-500">{pedido.cliente_contacto}</p>
                )}
              </div>

              {/* Meta */}
              <div className="border-y border-dashed border-slate-300 py-2 mb-3 text-[10px] font-medium text-slate-600 flex justify-between">
                <div>
                  <p>FECHA PAGO: {date} {time}</p>
                  {pedido.fecha_entrega && <p>ENTREGA: {pedido.fecha_entrega}</p>}
                </div>
              </div>

              {/* Encabezado tabla */}
              <div className="flex justify-between text-[10px] font-bold text-slate-900 border-b border-slate-300 pb-1 mb-2">
                <span className="w-3/5 text-left">DESCRIPCIÓN</span>
                <span className="w-1/5 text-center">CANT</span>
                <span className="w-1/5 text-right">IMPORTE</span>
              </div>

              {/* Items */}
              <div className="space-y-2 mb-4 text-xs">
                {cartItems.map((item, i) => (
                  <div key={i} className="flex flex-col">
                    <div className="flex justify-between">
                      <span className="w-3/5 font-semibold pr-1">{item.nombre}</span>
                      <span className="w-1/5 text-center text-slate-600">{item.quantity}</span>
                      <span className="w-1/5 text-right font-bold">${(item.precio * item.quantity).toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">${item.precio.toFixed(2)} c/u</span>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="border-t-2 border-slate-800 pt-2 mb-4">
                <div className="flex justify-between font-black text-base text-slate-900">
                  <span>TOTAL</span>
                  <span>${Number(pedido.total).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase mt-0.5">
                  <span>Total artículos:</span>
                  <span>{cartItems.reduce((a,i) => a + i.quantity, 0)}</span>
                </div>
              </div>

              {/* Desglose de pago */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[10px] space-y-1.5 mb-4">
                {pagoGuardado.efectivo > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">EFECTIVO:</span>
                    <span className="font-bold">${pagoGuardado.efectivo.toFixed(2)}</span>
                  </div>
                )}
                {pagoGuardado.tarjeta > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">TARJETA:</span>
                    <span className="font-bold">${pagoGuardado.tarjeta.toFixed(2)}</span>
                  </div>
                )}
                {pagoGuardado.transferencia > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">TRANSFERENCIA:</span>
                    <span className="font-bold">${pagoGuardado.transferencia.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-slate-300 my-1" />
                {pagoGuardado.efectivoRecibido > 0 && (
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>RECIBIDO EN EFECTIVO:</span>
                    <span>${pagoGuardado.efectivoRecibido.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-xs">
                  <span>SU CAMBIO:</span>
                  <span>${pagoGuardado.cambio.toFixed(2)}</span>
                </div>
                {pendiente > 0.01 && (
                  <div className="flex justify-between font-black text-xs text-amber-700 border-t border-amber-200 pt-1 mt-1">
                    <span>SALDO PENDIENTE:</span>
                    <span>${pendiente.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {pedido.notas && (
                <p className="text-[10px] text-slate-500 border-t border-dashed border-slate-200 pt-2 mb-2">
                  NOTA: {pedido.notas}
                </p>
              )}

              <p className="text-center text-[10px] font-bold text-slate-800 uppercase mt-2">¡Gracias!</p>

              {/* Corte inferior */}
              <div className="absolute bottom-0 left-0 right-0 h-3 flex overflow-hidden rotate-180">
                {[...Array(30)].map((_,i) => <div key={i} className="w-3 h-3 bg-slate-100 rotate-45 transform origin-bottom-left -mt-2" />)}
              </div>
            </div>
          </div>

          {/* Acciones del ticket */}
          <div className="p-4 bg-white border-t border-slate-200 flex gap-3 shrink-0">
            <button
              onClick={handlePrint}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-slate-300 transition-colors"
            >
              <Printer className="w-5 h-5" /> Imprimir
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-bold transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PASO 1: Cobro ───────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-black text-slate-800 text-lg">Registrar Pago</h3>
            {pedido.cliente_nombre && (
              <p className="text-sm text-slate-500 font-medium">{pedido.cliente_nombre}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Total */}
          <div className="flex justify-between items-center bg-slate-800 text-white px-4 py-3 rounded-2xl">
            <span className="font-bold text-sm">Total del pedido</span>
            <span className="font-black text-xl">{fmt(pedido.total)}</span>
          </div>

          {/* Métodos de pago */}
          <SeccionPago
            efectivo={efectivo} tarjeta={tarjeta} transferencia={transferencia}
            onChange={handleChange}
            total={pedido.total}
            label="Ingresa los montos cobrados"
          />

          {/* Efectivo recibido + cambio */}
          {ef > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                  ¿Con cuánto paga en efectivo?
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 font-black text-xl">$</span>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={efectivoRecibido}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setEfectivoRecibido(v); }}
                    className="w-full pl-8 pr-4 py-3 bg-white border border-amber-300 rounded-xl text-2xl font-black focus:outline-none focus:border-amber-500 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              {rec > 0 && (
                <div className={`flex justify-between items-center px-4 py-3 rounded-xl border font-black text-xl ${
                  recFaltante
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : 'bg-white border-amber-200 text-emerald-600'
                }`}>
                  <span className="text-sm font-bold">{recFaltante ? 'Faltan:' : 'Cambio:'}</span>
                  <span>{recFaltante ? fmt(ef - rec) : fmt(cambio)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={!canSave}
            className="flex-[2] py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              : <><DollarSign className="w-4 h-4" /> Guardar y Ver Ticket</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal de nuevo pedido ─────────────────────────────────────────────────
function NuevoPedidoModal({ userProfile, onClose, onSaved }) {
  const [productos,    setProductos]    = useState([]);
  const [searchTerm,   setSearchTerm]   = useState('');
  const [cartItems,    setCartItems]    = useState([]);
  const [saving,       setSaving]       = useState(false);
  const [clienteNombre,setClienteNombre]= useState('');
  const [clienteCtc,   setClienteCtc]   = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [horaEntrega,  setHoraEntrega]  = useState('');
  const [notas,        setNotas]        = useState('');
  const [pagoEfectivo,      setPagoEfectivo]      = useState('');
  const [pagoTarjeta,       setPagoTarjeta]        = useState('');
  const [pagoTransferencia, setPagoTransferencia]  = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    fetchProductos();
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const fetchProductos = async () => {
    const { data } = await supabase
      .from('productos')
      .select('id, nombre, sku, precio, stock, categoria')
      .order('nombre');
    setProductos(data || []);
  };

  const filtered = searchTerm.trim()
    ? productos.filter(p =>
        p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  const addToCart = (producto) => {
    setCartItems(prev => {
      const ex = prev.find(i => i.id === producto.id);
      if (ex) return prev.map(i => i.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i);
      return [...prev, { ...producto, cantidad: 1 }];
    });
    setSearchTerm('');
    searchRef.current?.focus();
  };

  const updateCantidad = (id, delta) => {
    setCartItems(prev =>
      prev.map(i => i.id === id ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i)
          .filter(i => i.cantidad > 0)
    );
  };

  const handlePagoChange = (key, val) => {
    if (key === 'efectivo')      setPagoEfectivo(val);
    if (key === 'tarjeta')       setPagoTarjeta(val);
    if (key === 'transferencia') setPagoTransferencia(val);
  };

  const total = cartItems.reduce((a, i) => a + Number(i.precio) * i.cantidad, 0);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!fechaEntrega || cartItems.length === 0) return;
    setSaving(true);
    try {
      const { data: pedido, error: pErr } = await supabase
        .from('pedidos_programados')
        .insert([{
          usuario_id:         userProfile.id,
          cliente_nombre:     clienteNombre     || null,
          cliente_contacto:   clienteCtc        || null,
          fecha_entrega:      fechaEntrega,
          hora_entrega:       horaEntrega        || null,
          notas:              notas              || null,
          total,
          pago_efectivo:      parseFloat(pagoEfectivo)      || 0,
          pago_tarjeta:       parseFloat(pagoTarjeta)       || 0,
          pago_transferencia: parseFloat(pagoTransferencia) || 0,
          estado:             'pendiente',
        }])
        .select()
        .single();

      if (pErr) throw pErr;

      const { error: iErr } = await supabase
        .from('pedido_items')
        .insert(cartItems.map(i => ({
          pedido_id:       pedido.id,
          producto_id:     i.id,
          nombre_producto: i.nombre,
          cantidad:        i.cantidad,
          precio_unitario: Number(i.precio),
        })));

      if (iErr) throw iErr;
      onSaved();
      onClose();
    } catch (err) {
      alert('Error al guardar el pedido: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-primary-900" />
            Nuevo Pedido Programado
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">

            {/* Cliente */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" /> Datos del Cliente (opcional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Nombre del cliente"
                    value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all" />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Teléfono / contacto"
                    value={clienteCtc} onChange={e => setClienteCtc(e.target.value)}
                    className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all" />
                </div>
              </div>
            </div>

            {/* Fecha / hora */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Entrega
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Fecha *</label>
                  <input type="date" required min={hoy()}
                    value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Hora (opcional)</label>
                  <input type="time"
                    value={horaEntrega} onChange={e => setHoraEntrega(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all" />
                </div>
              </div>
            </div>

            {/* Productos */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Productos *
              </p>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input ref={searchRef} type="text" placeholder="Buscar por nombre o SKU..." autoComplete="off"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all" />
              </div>

              {filtered.length > 0 && (
                <div className="border border-slate-200 rounded-2xl overflow-hidden mb-3 shadow-lg">
                  {filtered.slice(0, 6).map(p => (
                    <button key={p.id} type="button" onClick={() => addToCart(p)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors text-left">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{p.nombre}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.sku} · stock: {p.stock}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="font-black text-slate-800">{fmt(p.precio)}</p>
                        <Plus className="w-4 h-4 text-slate-400 ml-auto" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {cartItems.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-2xl py-8 text-center text-slate-400">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">Busca y agrega productos al pedido</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{item.nombre}</p>
                        <p className="text-xs text-slate-400 font-mono">{item.sku} · {fmt(item.precio)} c/u</p>
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 rounded-lg overflow-hidden shrink-0">
                        <button type="button" onClick={() => updateCantidad(item.id, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold">-</button>
                        <span className="w-8 text-center text-sm font-bold text-slate-800">{item.cantidad}</span>
                        <button type="button" onClick={() => updateCantidad(item.id, +1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 text-slate-600 font-bold">+</button>
                      </div>
                      <span className="font-black text-slate-800 text-sm w-16 text-right shrink-0">{fmt(Number(item.precio)*item.cantidad)}</span>
                      <button type="button" onClick={() => setCartItems(prev => prev.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 bg-slate-800 rounded-xl text-white">
                    <span className="font-bold text-sm">Total del Pedido</span>
                    <span className="font-black text-xl">{fmt(total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Pago */}
            {cartItems.length > 0 && (
              <SeccionPago
                efectivo={pagoEfectivo} tarjeta={pagoTarjeta} transferencia={pagoTransferencia}
                onChange={handlePagoChange}
                total={total}
                label="¿El cliente paga ahora? (opcional)"
              />
            )}

            {/* Notas */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                Notas / Instrucciones
              </label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Ej: Sin picante, entregar en empaque especial, llamar antes..."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 focus:bg-white text-sm font-medium transition-all resize-none" />
            </div>
          </div>
        </form>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/60 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave}
            disabled={saving || !fechaEntrega || cartItems.length === 0}
            className="flex-[2] py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
              : <><CheckCircle2 className="w-4 h-4" /> Guardar Pedido</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function PedidosProgramados({ userProfile, isAdmin }) {
  const [pedidos,      setPedidos]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [updatingId,   setUpdatingId]   = useState(null);
  const [pagoModal,    setPagoModal]    = useState(null); // pedido a pagar

  useEffect(() => { fetchPedidos(); }, []);

  const fetchPedidos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_programados')
        .select('*, usuarios_perfiles (nombre_completo), pedido_items (*)')
        .order('fecha_entrega', { ascending: true })
        .order('created_at',    { ascending: false });
      if (error) throw error;
      setPedidos(data || []);
    } catch (err) {
      console.error('Error cargando pedidos:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateEstado = async (id, nuevoEstado) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('pedidos_programados').update({ estado: nuevoEstado }).eq('id', id);
      if (error) throw error;
      setPedidos(prev => prev.map(p => p.id === id ? { ...p, estado: nuevoEstado } : p));
    } catch (err) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const fmtFecha = (f) => {
    if (!f) return '—';
    const [y, m, d] = f.split('-');
    return new Date(`${y}-${m}-${d}T12:00:00`).toLocaleDateString('es-MX', {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const filtrados    = pedidos.filter(p => statusFilter === 'todos' || p.estado === statusFilter);
  const urgentCount  = pedidos.filter(p => p.estado === 'pendiente' && ['hoy','vencido'].includes(urgencia(p.fecha_entrega))).length;

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg shrink-0">
              <ClipboardList className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                Pedidos Programados
                {urgentCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {urgentCount}
                  </span>
                )}
              </h1>
              <p className="text-slate-500 text-sm font-medium">
                {isAdmin ? 'Todos los pedidos del equipo' : 'Pedidos programados de tu turno'}
              </p>
            </div>
          </div>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-md">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Pedido</span>
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-2 flex-wrap mb-6">
          {ESTADOS.map(e => (
            <button key={e.key} onClick={() => setStatusFilter(e.key)}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                statusFilter === e.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
              }`}>
              {e.label}
              {e.key !== 'todos' && (
                <span className="ml-1.5 opacity-60">{pedidos.filter(p => p.estado === e.key).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin w-8 h-8 text-primary-900" /></div>
        ) : filtrados.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-16 text-center text-slate-400">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium text-lg mb-1">
              {statusFilter === 'todos' ? 'Sin pedidos programados' : `Sin pedidos ${ESTADO_LABEL[statusFilter]?.toLowerCase()}`}
            </p>
            <p className="text-sm">Presiona "+ Nuevo Pedido" para registrar el primero.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtrados.map(pedido => {
              const urg     = urgencia(pedido.fecha_entrega);
              const items   = pedido.pedido_items || [];
              const pagInfo = estadoPago(pedido);
              const totalPagado = Number(pedido.pago_efectivo||0) + Number(pedido.pago_tarjeta||0) + Number(pedido.pago_transferencia||0);
              const isUpdating  = updatingId === pedido.id;

              return (
                <div key={pedido.id} className={`rounded-3xl border-2 shadow-sm overflow-hidden ${URG_BORDER[urg]}`}>

                  {/* Cabecera */}
                  <div className="flex items-start justify-between px-5 pt-5 pb-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${ESTADO_STYLE[pedido.estado]}`}>
                          {ESTADO_LABEL[pedido.estado]}
                        </span>
                        {/* Badge de urgencia */}
                        {urg !== 'normal' && pedido.estado === 'pendiente' && (
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${URG_BADGE[urg]}`}>
                            {urg === 'vencido' ? '⚠ Vencido' : urg === 'hoy' ? '🔔 Hoy' : '📅 Mañana'}
                          </span>
                        )}
                        {/* Badge de pago */}
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold ${pagInfo.cls}`}>
                          {pagInfo.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 font-medium text-sm">
                        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                        {fmtFecha(pedido.fecha_entrega)}
                        {pedido.hora_entrega && (
                          <><span className="text-slate-300">·</span>
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {pedido.hora_entrega.slice(0,5)}</>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-xl text-slate-800">{fmt(pedido.total)}</p>
                      <p className="text-xs text-slate-400 font-medium">
                        {(items).reduce((a,i) => a + i.cantidad, 0)} producto{items.reduce((a,i)=>a+i.cantidad,0)!==1?'s':''}
                      </p>
                    </div>
                  </div>

                  {/* Cliente + empleado (admin) */}
                  {(pedido.cliente_nombre || pedido.cliente_contacto || isAdmin) && (
                    <div className="px-5 pb-3 flex flex-wrap gap-3 text-sm">
                      {pedido.cliente_nombre && (
                        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <User className="w-3.5 h-3.5 text-slate-400" />{pedido.cliente_nombre}
                        </span>
                      )}
                      {pedido.cliente_contacto && (
                        <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />{pedido.cliente_contacto}
                        </span>
                      )}
                      {isAdmin && (
                        <span className="flex items-center gap-1.5 text-slate-500 text-xs font-medium ml-auto">
                          <Tag className="w-3 h-3" />{pedido.usuarios_perfiles?.nombre_completo}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Productos */}
                  <div className="px-5 pb-3">
                    <div className="bg-white/70 rounded-2xl divide-y divide-slate-100 overflow-hidden border border-slate-100">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="font-bold text-slate-700 text-sm">{item.nombre_producto}</span>
                            <span className="text-xs text-slate-400 ml-2 font-medium">×{item.cantidad}</span>
                          </div>
                          <span className="font-black text-slate-700 text-sm">
                            {fmt(item.precio_unitario * item.cantidad)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Desglose de pago */}
                  {totalPagado > 0 && (
                    <div className="px-5 pb-3">
                      <div className="bg-white/70 rounded-2xl border border-slate-100 px-4 py-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pago registrado</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
                          {Number(pedido.pago_efectivo) > 0 && (
                            <span className="flex items-center gap-1 text-amber-700">
                              <Banknote className="w-3 h-3" /> Efectivo {fmt(pedido.pago_efectivo)}
                            </span>
                          )}
                          {Number(pedido.pago_tarjeta) > 0 && (
                            <span className="flex items-center gap-1 text-blue-700">
                              <CreditCard className="w-3 h-3" /> Tarjeta {fmt(pedido.pago_tarjeta)}
                            </span>
                          )}
                          {Number(pedido.pago_transferencia) > 0 && (
                            <span className="flex items-center gap-1 text-purple-700">
                              <Building2 className="w-3 h-3" /> Transf. {fmt(pedido.pago_transferencia)}
                            </span>
                          )}
                          {pagInfo.key === 'anticipo' && (
                            <span className="text-slate-500 ml-auto">
                              Pendiente: {fmt(Number(pedido.total) - totalPagado)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notas */}
                  {pedido.notas && (
                    <div className="px-5 pb-3">
                      <div className="flex gap-2 bg-white/60 rounded-xl px-3 py-2 border border-slate-100">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">{pedido.notas}</p>
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  {pedido.estado !== 'entregado' && pedido.estado !== 'cancelado' && (
                    <div className="px-5 pb-5 flex gap-2 flex-wrap">
                      {pedido.estado === 'pendiente' && (
                        <button onClick={() => updateEstado(pedido.id, 'listo')} disabled={isUpdating}
                          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                          {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Marcar Listo
                        </button>
                      )}
                      {pedido.estado === 'listo' && (
                        <button onClick={() => updateEstado(pedido.id, 'entregado')} disabled={isUpdating}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50">
                          {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          Marcar Entregado
                        </button>
                      )}
                      {/* Botón de cobro */}
                      {pagInfo.key !== 'pagado' && (
                        <button onClick={() => setPagoModal(pedido)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-xl transition-colors">
                          <DollarSign className="w-3.5 h-3.5" />
                          {pagInfo.key === 'anticipo' ? 'Completar Pago' : 'Registrar Pago'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('¿Cancelar este pedido?')) updateEstado(pedido.id, 'cancelado'); }}
                        disabled={isUpdating}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 ml-auto">
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <NuevoPedidoModal userProfile={userProfile} onClose={() => setShowForm(false)} onSaved={fetchPedidos} />
      )}
      {pagoModal && (
        <PagoModal pedido={pagoModal} onClose={() => setPagoModal(null)} onSaved={fetchPedidos} />
      )}
    </div>
  );
}
