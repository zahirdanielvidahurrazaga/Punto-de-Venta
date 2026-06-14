import { useState, useEffect, useRef } from 'react';
import {
  CalendarDays, Plus, Search, X, Trash2, CheckCircle2,
  Clock, User, Phone, Package, Loader2, ShoppingBag,
  ClipboardList, AlertCircle, Tag, Banknote, CreditCard,
  Building2, Wallet, DollarSign, Printer, Store, ChevronDown
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const ESTADOS = [
  { key: 'todos',     label: 'Todos'      },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'listo',     label: 'Listos'     },
  { key: 'entregado', label: 'Entregados' },
  { key: 'cancelado', label: 'Cancelados' },
];

const ESTADO_STYLE = {
  pendiente: 'neb-chip neb-chip-warning',
  listo:     'neb-chip neb-chip-info',
  entregado: 'neb-chip neb-chip-positive',
  cancelado: 'neb-chip neb-chip-negative',
};

const ESTADO_LABEL = {
  pendiente: 'Pendiente',
  listo:     'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

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
  if (pagado <= 0)                            return { key: 'sin_pagar', label: 'Sin pagar', cls: 'neb-chip neb-chip-negative' };
  if (pagado >= Number(pedido.total) - 0.01)  return { key: 'pagado',    label: 'Pagado',    cls: 'neb-chip neb-chip-positive' };
  return                                             { key: 'anticipo',  label: 'Anticipo',  cls: 'neb-chip neb-chip-warning'  };
}

const URG_BORDER = {
  vencido: 'border-slate-200 dark:border-white/5 bg-rose-50/30',
  hoy:     'border-slate-200 dark:border-white/5 bg-amber-50/30',
  mañana:  'border-slate-200 dark:border-white/5 bg-blue-50/30',
  normal:  'border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900',
};

const URG_BADGE = {
  vencido: 'neb-chip neb-chip-negative',
  hoy:     'neb-chip neb-chip-warning',
  mañana:  'neb-chip neb-chip-info',
  normal:  '',
};

function SeccionPago({ efectivo, tarjeta, transferencia, onChange, total, label = 'Pago del pedido' }) {
  const totalPagado = (parseFloat(efectivo)||0) + (parseFloat(tarjeta)||0) + (parseFloat(transferencia)||0);
  const pendiente   = Math.max(0, (parseFloat(total)||0) - totalPagado);
  const pagado      = totalPagado >= (parseFloat(total)||0) - 0.01 && totalPagado > 0;

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em] flex items-center gap-1.5">
        <Wallet className="w-3 h-3" /> {label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'efectivo',      icon: Banknote,   label: 'Efectivo' },
          { key: 'tarjeta',       icon: CreditCard, label: 'Tarjeta'  },
          { key: 'transferencia', icon: Building2,  label: 'Transf.'  },
        ].map(m => (
          <div key={m.key}>
            <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
              <m.icon className="w-3 h-3" />{m.label}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-sm font-bold">$</span>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={efectivo !== undefined && m.key === 'efectivo' ? efectivo : m.key === 'tarjeta' ? tarjeta : transferencia}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) onChange(m.key, v);
                }}
                className="neb-input !pl-7 !py-2.5 !text-sm !font-bold"
              />
            </div>
          </div>
        ))}
      </div>

      {totalPagado > 0 && (
        <div className={`flex justify-between items-center px-4 py-2.5 rounded-xl border text-sm font-bold ${
          pagado ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
        }`}>
          <span>{pagado ? '✓ Pedido pagado completo' : `Anticipo: ${fmt(totalPagado)}`}</span>
          {!pagado && <span>Pendiente: {fmt(pendiente)}</span>}
        </div>
      )}
    </div>
  );
}

function PagoModal({ pedido, onClose, onSaved }) {
  const [step, setStep] = useState('cobro');
  const [efectivo, setEfectivo] = useState(Number(pedido.pago_efectivo) > 0 ? String(pedido.pago_efectivo) : '');
  const [tarjeta, setTarjeta] = useState(Number(pedido.pago_tarjeta) > 0 ? String(pedido.pago_tarjeta) : '');
  const [transferencia, setTransferencia] = useState(Number(pedido.pago_transferencia) > 0 ? String(pedido.pago_transferencia) : '');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [saving, setSaving] = useState(false);
  const [pagoGuardado, setPagoGuardado] = useState(null);

  const ef  = parseFloat(efectivo)         || 0;
  const tar = parseFloat(tarjeta)          || 0;
  const trf = parseFloat(transferencia)    || 0;
  const rec = parseFloat(efectivoRecibido) || 0;

  const totalPagado = ef + tar + trf;
  const cambio      = ef > 0 && rec >= ef ? rec - ef : 0;
  const recFaltante = ef > 0 && rec > 0 && rec < ef;
  const canSave     = totalPagado > 0 && !recFaltante && !saving;

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

  if (step === 'ticket' && pagoGuardado) {
    const date = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'2-digit', day:'2-digit' });
    const time = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit' });
    const pendiente = Number(pedido.total) - pagoGuardado.totalPagado;

    return (
      <div className="fixed inset-0 z-[70] bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
        <div className="neb-glass-strong rounded-3xl w-full max-w-md max-h-[95vh] flex flex-col overflow-hidden">

          <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100/80">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-50 text-emerald-600 border border-emerald-100 p-2.5 rounded-2xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold leading-tight text-slate-900 dark:text-white">¡Pago registrado!</h2>
                <p className="text-slate-500 dark:text-slate-400 text-xs font-bold">
                  {pedido.cliente_nombre || 'Pedido programado'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center neb-scroll">
            <div id="ticket-pedido-programado" className="w-full max-w-sm bg-white dark:bg-slate-900 px-6 pt-6 pb-8 font-mono text-slate-800 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 neb-shadow">
              <div className="text-center mb-4">
                <div className="w-10 h-10 neb-grad-primary text-white rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Store className="w-5 h-5" />
                </div>
                <h3 className="font-extrabold text-base uppercase tracking-widest text-slate-900 dark:text-white">Plásticos POS</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mt-0.5">Pedido programado</p>
                {pedido.cliente_nombre && (
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-1">Cliente: {pedido.cliente_nombre}</p>
                )}
                {pedido.cliente_contacto && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">{pedido.cliente_contacto}</p>
                )}
              </div>

              <div className="border-y border-dashed border-slate-300 dark:border-slate-700 py-2 mb-3 text-[10px] font-bold text-slate-600 dark:text-slate-400 flex justify-between">
                <div>
                  <p>PAGO: {date} {time}</p>
                  {pedido.fecha_entrega && <p>ENTREGA: {pedido.fecha_entrega}</p>}
                </div>
              </div>

              <div className="flex justify-between text-[10px] font-bold text-slate-900 dark:text-white border-b border-slate-300 dark:border-slate-700 pb-1 mb-2">
                <span className="w-3/5 text-left">DESCRIPCIÓN</span>
                <span className="w-1/5 text-center">CANT</span>
                <span className="w-1/5 text-right">IMPORTE</span>
              </div>

              <div className="space-y-2 mb-4 text-xs">
                {cartItems.map((item, i) => (
                  <div key={i} className="flex flex-col">
                    <div className="flex justify-between">
                      <span className="w-3/5 font-bold pr-1">{item.nombre}</span>
                      <span className="w-1/5 text-center text-slate-600 dark:text-slate-400">{item.quantity}</span>
                      <span className="w-1/5 text-right font-bold">${(item.precio * item.quantity).toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">${item.precio.toFixed(2)} c/u</span>
                  </div>
                ))}
              </div>

              <div className="border-t-2 border-slate-800 pt-2 mb-4">
                <div className="flex justify-between font-extrabold text-base text-slate-900 dark:text-white">
                  <span>TOTAL</span>
                  <span>${Number(pedido.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200 dark:border-white/5 text-[10px] space-y-1.5 mb-4">
                {pagoGuardado.efectivo > 0 && <div className="flex justify-between"><span>EFECTIVO:</span><span className="font-bold">${pagoGuardado.efectivo.toFixed(2)}</span></div>}
                {pagoGuardado.tarjeta > 0 && <div className="flex justify-between"><span>TARJETA:</span><span className="font-bold">${pagoGuardado.tarjeta.toFixed(2)}</span></div>}
                {pagoGuardado.transferencia > 0 && <div className="flex justify-between"><span>TRANSFERENCIA:</span><span className="font-bold">${pagoGuardado.transferencia.toFixed(2)}</span></div>}
                {pagoGuardado.efectivoRecibido > 0 && <div className="flex justify-between font-bold pt-1 border-t border-slate-200 dark:border-white/5"><span>RECIBIDO:</span><span>${pagoGuardado.efectivoRecibido.toFixed(2)}</span></div>}
                <div className="flex justify-between font-extrabold"><span>CAMBIO:</span><span>${pagoGuardado.cambio.toFixed(2)}</span></div>
                {pendiente > 0.01 && (
                  <div className="flex justify-between font-extrabold text-amber-700 border-t border-amber-200 pt-1 mt-1">
                    <span>SALDO PENDIENTE:</span><span>${pendiente.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {pedido.notas && <p className="text-[10px] text-slate-500 dark:text-slate-400 border-t border-dashed border-slate-200 dark:border-white/5 pt-2 mb-2">NOTA: {pedido.notas}</p>}
              <p className="text-center text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase mt-2">¡Gracias!</p>
            </div>
          </div>

          <div className="p-4 border-t border-slate-100/80 flex gap-2.5 shrink-0">
            <button onClick={handlePrint} className="flex-1 neb-btn neb-btn-ghost py-3">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            <button onClick={onClose} className="flex-1 neb-btn neb-btn-primary py-3">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100/80">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-lg">Registrar pago</h3>
            {pedido.cliente_nombre && <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">{pedido.cliente_nombre}</p>}
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex justify-between items-center neb-grad-primary text-white px-4 py-3 rounded-2xl">
            <span className="font-bold text-sm">Total del pedido</span>
            <span className="font-extrabold text-xl">{fmt(pedido.total)}</span>
          </div>

          <SeccionPago
            efectivo={efectivo} tarjeta={tarjeta} transferencia={transferencia}
            onChange={handleChange}
            total={pedido.total}
            label="Ingresa los montos cobrados"
          />

          {ef > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-amber-700 uppercase tracking-[0.18em] mb-2">
                  ¿Con cuánto paga en efectivo?
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500 font-extrabold text-xl">$</span>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={efectivoRecibido}
                    onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setEfectivoRecibido(v); }}
                    className="w-full pl-8 pr-4 py-3 bg-white dark:bg-slate-900 border border-amber-200 rounded-xl text-2xl font-extrabold focus:outline-none focus:border-amber-400 transition-all"
                    autoFocus
                  />
                </div>
              </div>
              {rec > 0 && (
                <div className={`flex justify-between items-center px-4 py-3 rounded-xl border font-extrabold text-lg ${
                  recFaltante
                    ? 'bg-rose-50 border-rose-100 text-rose-600'
                    : 'bg-white dark:bg-slate-900 border-emerald-100 text-emerald-600'
                }`}>
                  <span className="text-sm font-bold">{recFaltante ? 'Faltan:' : 'Cambio:'}</span>
                  <span>{recFaltante ? fmt(ef - rec) : fmt(cambio)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 px-6 pb-6">
          <button onClick={onClose} className="flex-1 neb-btn neb-btn-ghost py-3">Cancelar</button>
          <button onClick={handleSave} disabled={!canSave} className="flex-[2] neb-btn neb-btn-primary py-3 disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><DollarSign className="w-4 h-4" /> Guardar y ver ticket</>}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [pagoTarjeta,       setPagoTarjeta]       = useState('');
  const [pagoTransferencia, setPagoTransferencia] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    fetchProductos();
    setTimeout(() => searchRef.current?.focus(), 100);
  }, []);

  const fetchProductos = async () => {
    // Stock por sucursal (producto_stock) vía RPC, igual que Terminal/Inventario;
    // la columna legacy productos.stock ya no refleja el inventario real.
    const { data } = await supabase
      .rpc('productos_de_sucursal', { p_sucursal: userProfile?.sucursal_id });
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
    if (e?.preventDefault) e.preventDefault();
    if (!fechaEntrega || cartItems.length === 0) return;
    setSaving(true);
    try {
      const { data: pedido, error: pErr } = await supabase
        .from('pedidos_programados')
        .insert([{
          usuario_id:         userProfile.id,
          sucursal_id:        userProfile.sucursal_id || null,
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
        .select().single();
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
    <div className="fixed inset-0 z-50 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100/80 shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em]">Programado</p>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
              <CalendarDays className="w-5 h-5 text-accent-600" />
              Nuevo pedido
            </h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto neb-scroll">
          <div className="p-6 space-y-6">

            {/* Cliente */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em] mb-3 flex items-center gap-1.5">
                <User className="w-3 h-3" /> Datos del cliente (opcional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input type="text" placeholder="Nombre del cliente"
                    value={clienteNombre} onChange={e => setClienteNombre(e.target.value)}
                    className="neb-input pl-9" />
                </div>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                  <input type="text" placeholder="Teléfono / contacto"
                    value={clienteCtc} onChange={e => setClienteCtc(e.target.value)}
                    className="neb-input pl-9" />
                </div>
              </div>
            </div>

            {/* Entrega */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em] mb-3 flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" /> Entrega
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">Fecha *</label>
                  <input type="date" required min={hoy()}
                    value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                    className="neb-input" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">Hora (opcional)</label>
                  <input type="time"
                    value={horaEntrega} onChange={e => setHoraEntrega(e.target.value)}
                    className="neb-input" />
                </div>
              </div>
            </div>

            {/* Productos */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em] mb-3 flex items-center gap-1.5">
                <Package className="w-3 h-3" /> Productos *
              </p>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input ref={searchRef} type="text" placeholder="Buscar por nombre o SKU..." autoComplete="off"
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="neb-input pl-9" />
              </div>

              {filtered.length > 0 && (
                <div className="border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden mb-3 bg-white dark:bg-slate-900 neb-shadow-sm">
                  {filtered.slice(0, 6).map(p => (
                    <button key={p.id} type="button" onClick={() => addToCart(p)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 border-b border-slate-50 last:border-0 transition-colors text-left">
                      <div>
                        <p className="font-extrabold text-slate-900 dark:text-white text-sm">{p.nombre}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{p.sku} · stock: {p.stock}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="font-extrabold text-slate-900 dark:text-white">{fmt(p.precio)}</p>
                        <Plus className="w-4 h-4 text-slate-400 dark:text-slate-500 ml-auto" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {cartItems.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl py-8 text-center text-slate-400 dark:text-slate-500">
                  <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-bold">Busca y agrega productos al pedido</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cartItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 neb-card-soft px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-900 dark:text-white text-sm truncate">{item.nombre}</p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{item.sku} · {fmt(item.precio)} c/u</p>
                      </div>
                      <div className="flex items-center neb-card rounded-xl overflow-hidden shrink-0">
                        <button type="button" onClick={() => updateCantidad(item.id, -1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-bold">-</button>
                        <span className="w-8 text-center text-sm font-extrabold text-slate-900 dark:text-white">{item.cantidad}</span>
                        <button type="button" onClick={() => updateCantidad(item.id, +1)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-bold">+</button>
                      </div>
                      <span className="font-extrabold text-slate-900 dark:text-white text-sm w-16 text-right shrink-0">{fmt(Number(item.precio)*item.cantidad)}</span>
                      <button type="button" onClick={() => setCartItems(prev => prev.filter(i => i.id !== item.id))} className="text-slate-300 hover:text-rose-500 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-3 neb-grad-primary rounded-2xl text-white">
                    <span className="font-bold text-sm">Total del pedido</span>
                    <span className="font-extrabold text-xl">{fmt(total)}</span>
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
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.18em] mb-2">
                Notas / instrucciones
              </label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                placeholder="Ej: Sin picante, empaque especial, llamar antes..."
                className="neb-input resize-none" />
            </div>
          </div>
        </form>

        <div className="flex gap-2.5 px-6 py-4 border-t border-slate-100/80 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 neb-btn neb-btn-ghost py-3">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !fechaEntrega || cartItems.length === 0}
            className="flex-[2] neb-btn neb-btn-primary py-3 disabled:opacity-50">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><CheckCircle2 className="w-4 h-4" /> Guardar pedido</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PedidosProgramados({ userProfile, isAdmin }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [updatingId, setUpdatingId] = useState(null);
  const [pagoModal, setPagoModal] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalFiltro, setSucursalFiltro] = useState('todas');

  useEffect(() => { fetchPedidos(); }, []);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('sucursales').select('id, nombre').eq('activa', true).order('nombre')
      .then(({ data }) => setSucursales(data || []));
  }, [isAdmin]);

  const fetchPedidos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_programados')
        .select('*, usuarios_perfiles (nombre_completo), pedido_items (*)')
        .order('fecha_entrega', { ascending: true })
        .order('created_at', { ascending: false });
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

  const pedidosScope = (isAdmin && sucursalFiltro !== 'todas')
    ? pedidos.filter(p => p.sucursal_id === sucursalFiltro)
    : pedidos;
  const filtrados   = pedidosScope.filter(p => statusFilter === 'todos' || p.estado === statusFilter);
  const urgentCount = pedidosScope.filter(p => p.estado === 'pendiente' && ['hoy','vencido'].includes(urgencia(p.fecha_entrega))).length;

  return (
    <div className="h-full overflow-y-auto neb-scroll">
      <div className="p-5 lg:p-7 max-w-4xl mx-auto">

        {/* Header — Apple */}
        <div className="flex items-start justify-between gap-3 pt-2 mb-7">
          <div>
            <h1 className="text-3xl lg:text-4xl font-semibold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              Pedidos programados
              {urgentCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[12px] font-medium animate-pulse">{urgentCount}</span>
              )}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-[14px] mt-2">
              {isAdmin ? 'Todos los pedidos del equipo' : 'Pedidos programados de tu turno'}
            </p>
          </div>
          <button onClick={() => setShowForm(true)} className="neb-btn neb-btn-primary">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo pedido</span>
          </button>
        </div>

        {/* Filtros — Apple */}
        <div className="flex gap-2 flex-wrap mb-6">
          {ESTADOS.map(e => (
            <button key={e.key} onClick={() => setStatusFilter(e.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                statusFilter === e.key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}>
              {e.label}
              {e.key !== 'todos' && <span className="ml-1 opacity-60">· {pedidosScope.filter(p => p.estado === e.key).length}</span>}
            </button>
          ))}

          {isAdmin && sucursales.length > 1 && (
            <div className="relative ml-auto">
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

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin w-7 h-7 text-accent-500" /></div>
        ) : filtrados.length === 0 ? (
          <div className="neb-card p-16 text-center text-slate-400 dark:text-slate-500">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold text-base mb-1">
              {statusFilter === 'todos' ? 'Sin pedidos programados' : `Sin pedidos ${ESTADO_LABEL[statusFilter]?.toLowerCase()}`}
            </p>
            <p className="text-[12px]">Presiona "+ Nuevo pedido" para registrar el primero.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtrados.map(pedido => {
              const urg = urgencia(pedido.fecha_entrega);
              const items = pedido.pedido_items || [];
              const pagInfo = estadoPago(pedido);
              const totalPagado = Number(pedido.pago_efectivo||0) + Number(pedido.pago_tarjeta||0) + Number(pedido.pago_transferencia||0);
              const isUpdating = updatingId === pedido.id;

              return (
                <div key={pedido.id} className={`rounded-2xl border overflow-hidden ${URG_BORDER[urg]}`}>

                  <div className="flex items-start justify-between px-5 pt-5 pb-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={ESTADO_STYLE[pedido.estado]}>{ESTADO_LABEL[pedido.estado]}</span>
                        {urg !== 'normal' && pedido.estado === 'pendiente' && (
                          <span className={URG_BADGE[urg]}>
                            {urg === 'vencido' ? 'Vencido' : urg === 'hoy' ? 'Hoy' : 'Mañana'}
                          </span>
                        )}
                        <span className={pagInfo.cls}>{pagInfo.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[13px]">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                        {fmtFecha(pedido.fecha_entrega)}
                        {pedido.hora_entrega && (
                          <><span className="text-slate-300">·</span>
                          <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          {pedido.hora_entrega.slice(0,5)}</>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-xl text-slate-900 dark:text-white neb-tabular">{fmt(pedido.total)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 neb-tabular">
                        {items.reduce((a,i) => a + i.cantidad, 0)} producto{items.reduce((a,i)=>a+i.cantidad,0)!==1?'s':''}
                      </p>
                    </div>
                  </div>

                  {(pedido.cliente_nombre || pedido.cliente_contacto || isAdmin) && (
                    <div className="px-5 pb-3 flex flex-wrap gap-3 text-sm">
                      {pedido.cliente_nombre && (
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[12px]">
                          <User className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />{pedido.cliente_nombre}
                        </span>
                      )}
                      {pedido.cliente_contacto && (
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[12px]">
                          <Phone className="w-3 h-3 text-slate-400 dark:text-slate-500" />{pedido.cliente_contacto}
                        </span>
                      )}
                      {isAdmin && (
                        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] ml-auto">
                          <Tag className="w-3 h-3" />{pedido.usuarios_perfiles?.nombre_completo}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="px-5 pb-3">
                    <div className="bg-white/70 dark:bg-white/5 rounded-xl divide-y divide-slate-100 dark:divide-white/5 overflow-hidden border border-slate-100 dark:border-white/5">
                      {items.map(item => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="text-slate-700 dark:text-slate-300 text-[13px]">{item.nombre_producto}</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-2 neb-tabular">×{item.cantidad}</span>
                          </div>
                          <span className="font-semibold text-slate-900 dark:text-white text-[13px] neb-tabular">
                            {fmt(item.precio_unitario * item.cantidad)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {totalPagado > 0 && (
                    <div className="px-5 pb-3">
                      <div className="bg-white/70 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5 px-4 py-3">
                        <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">Pago registrado</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                          {Number(pedido.pago_efectivo) > 0 && (
                            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <Banknote className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Efectivo <span className="font-semibold neb-tabular">{fmt(pedido.pago_efectivo)}</span>
                            </span>
                          )}
                          {Number(pedido.pago_tarjeta) > 0 && (
                            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <CreditCard className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Tarjeta <span className="font-semibold neb-tabular">{fmt(pedido.pago_tarjeta)}</span>
                            </span>
                          )}
                          {Number(pedido.pago_transferencia) > 0 && (
                            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                              <Building2 className="w-3 h-3 text-slate-400 dark:text-slate-500" /> Transf. <span className="font-semibold neb-tabular">{fmt(pedido.pago_transferencia)}</span>
                            </span>
                          )}
                          {pagInfo.key === 'anticipo' && (
                            <span className="text-slate-500 dark:text-slate-400 ml-auto neb-tabular">
                              Pendiente: {fmt(Number(pedido.total) - totalPagado)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {pedido.notas && (
                    <div className="px-5 pb-3">
                      <div className="flex gap-2 bg-white/60 dark:bg-white/5 rounded-xl px-3 py-2 border border-slate-100 dark:border-white/5">
                        <AlertCircle className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                        <p className="text-[12px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">{pedido.notas}</p>
                      </div>
                    </div>
                  )}

                  {pedido.estado !== 'entregado' && pedido.estado !== 'cancelado' && (
                    <div className="px-5 pb-5 flex gap-2 flex-wrap">
                      {pedido.estado === 'pendiente' && (
                        <button onClick={() => updateEstado(pedido.id, 'listo')} disabled={isUpdating}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5">
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Marcar listo
                        </button>
                      )}
                      {pedido.estado === 'listo' && (
                        <button onClick={() => updateEstado(pedido.id, 'entregado')} disabled={isUpdating}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium rounded-lg transition-colors disabled:opacity-50 inline-flex items-center gap-1.5">
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Marcar entregado
                        </button>
                      )}
                      {pagInfo.key !== 'pagado' && (
                        <button onClick={() => setPagoModal(pedido)}
                          className="px-3 py-1.5 neb-card text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 text-[12px] font-medium rounded-lg transition-colors inline-flex items-center gap-1.5">
                          <DollarSign className="w-3 h-3" />
                          {pagInfo.key === 'anticipo' ? 'Completar pago' : 'Registrar pago'}
                        </button>
                      )}
                      <button
                        onClick={() => { if (confirm('¿Cancelar este pedido?')) updateEstado(pedido.id, 'cancelado'); }}
                        disabled={isUpdating}
                        className="px-3 py-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 text-[12px] font-medium rounded-lg transition-colors disabled:opacity-50 ml-auto inline-flex items-center gap-1.5">
                        <X className="w-3 h-3" /> Cancelar
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
