import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Banknote, Building2, X, ArrowRight, Wallet, SplitSquareHorizontal, CheckCircle } from 'lucide-react';

export default function CheckoutModal({ total, onClose, onComplete }) {
  const [payments, setPayments] = useState({ efectivo: '', tarjeta: '', transferencia: '' });
  const [mode, setMode] = useState('quick');
  const [cashReceived, setCashReceived] = useState('');
  const cashInputRef = useRef(null);

  useEffect(() => {
    if (mode === 'cash' && cashInputRef.current) cashInputRef.current.focus();
  }, [mode]);

  const handleQuickPay = (method) => {
    if (method === 'efectivo') { setMode('cash'); return; }
    onComplete({
      efectivo: 0,
      tarjeta: method === 'tarjeta' ? total : 0,
      transferencia: method === 'transferencia' ? total : 0,
      totalPagado: total,
      cambio: 0
    });
  };

  const handleCashConfirm = () => {
    const received = parseFloat(cashReceived) || 0;
    if (received < total) return;
    onComplete({ efectivo: total, tarjeta: 0, transferencia: 0, totalPagado: received, cambio: received - total });
  };

  const handleCashExact = () => {
    onComplete({ efectivo: total, tarjeta: 0, transferencia: 0, totalPagado: total, cambio: 0 });
  };

  const handleInputChange = (method, value) => {
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setPayments(prev => ({ ...prev, [method]: value }));
    }
  };

  const ef = parseFloat(payments.efectivo) || 0;
  const tar = parseFloat(payments.tarjeta) || 0;
  const trans = parseFloat(payments.transferencia) || 0;

  const totalPagado = ef + tar + trans;
  const restante = Math.max(0, total - totalPagado);
  const cambio = Math.max(0, totalPagado - total);

  const isComplete = mode === 'split' ? totalPagado >= total : false;

  const handleConfirm = () => {
    if (isComplete) {
      onComplete({ efectivo: ef, tarjeta: tar, transferencia: trans, totalPagado, cambio });
    }
  };

  const cashReceivedNum = parseFloat(cashReceived) || 0;
  const cashChange = Math.max(0, cashReceivedNum - total);
  const cashIsValid = cashReceivedNum >= total;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]">

        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100/80">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Cobro</p>
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 tracking-tight mt-0.5">
              <Wallet className="w-5 h-5 text-accent-600" />
              {mode === 'cash' ? 'Pago en efectivo' : 'Método de pago'}
            </h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 md:p-7 flex-1 overflow-y-auto neb-scroll">
          <div className="text-center mb-7">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">Total a pagar</p>
            <p className="text-5xl font-extrabold text-slate-900 tracking-tight mt-1">${total.toFixed(2)}</p>
          </div>

          {mode === 'quick' && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-2.5">
                <button onClick={() => handleQuickPay('efectivo')} className="flex flex-col items-center p-4 bg-white hover:bg-amber-50 rounded-2xl border border-slate-200 hover:border-amber-200 transition-all neb-shadow-sm hover:-translate-y-0.5 group">
                  <div className="bg-amber-50 p-2 rounded-xl mb-2 group-hover:scale-105 transition-transform">
                    <Banknote className="w-6 h-6 text-amber-600" />
                  </div>
                  <span className="text-[11px] font-extrabold text-slate-700 text-center leading-tight">Efectivo</span>
                </button>
                <button onClick={() => handleQuickPay('tarjeta')} className="flex flex-col items-center p-4 bg-white hover:bg-accent-50 rounded-2xl border border-slate-200 hover:border-accent-200 transition-all neb-shadow-sm hover:-translate-y-0.5 group">
                  <div className="bg-accent-50 p-2 rounded-xl mb-2 group-hover:scale-105 transition-transform">
                    <CreditCard className="w-6 h-6 text-accent-600" />
                  </div>
                  <span className="text-[11px] font-extrabold text-slate-700 text-center leading-tight">Tarjeta</span>
                </button>
                <button onClick={() => handleQuickPay('transferencia')} className="flex flex-col items-center p-4 bg-white hover:bg-violet-50 rounded-2xl border border-slate-200 hover:border-violet-200 transition-all neb-shadow-sm hover:-translate-y-0.5 group">
                  <div className="bg-violet-50 p-2 rounded-xl mb-2 group-hover:scale-105 transition-transform">
                    <Building2 className="w-6 h-6 text-violet-600" />
                  </div>
                  <span className="text-[11px] font-extrabold text-slate-700 text-center leading-tight">Transferencia</span>
                </button>
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200" />
                <span className="flex-shrink-0 mx-3 text-slate-400 text-[10px] font-bold uppercase tracking-[0.18em]">Opciones avanzadas</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <button onClick={() => setMode('split')} className="w-full py-3.5 bg-accent-50 text-accent-700 hover:bg-accent-100 rounded-2xl font-extrabold text-[14px] transition-all flex items-center justify-center gap-2.5 border border-accent-100">
                <SplitSquareHorizontal className="w-4 h-4" />
                Dividir cuenta
              </button>
            </div>
          )}

          {mode === 'cash' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100">
                <label className="text-[10px] font-bold text-amber-700 uppercase tracking-[0.18em] block mb-2">
                  ¿Con cuánto paga el cliente?
                </label>
                <div className="relative flex items-center">
                  <span className="text-amber-500 font-extrabold text-3xl mr-2">$</span>
                  <input
                    ref={cashInputRef}
                    type="text" inputMode="decimal" placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setCashReceived(val);
                    }}
                    className="w-full bg-transparent outline-none text-4xl font-extrabold text-slate-900 placeholder:text-slate-300"
                  />
                </div>
              </div>

              <div className="neb-grad-primary p-5 rounded-2xl space-y-3">
                <div className="flex justify-between text-slate-300 font-bold text-sm">
                  <span>Total:</span>
                  <span className="text-white font-extrabold">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-300 font-bold text-sm">
                  <span>Recibido:</span>
                  <span className={cashReceivedNum > 0 ? "text-white font-extrabold" : "text-slate-500"}>${cashReceivedNum.toFixed(2)}</span>
                </div>
                {cashIsValid && (
                  <div className="flex justify-between text-amber-300 font-extrabold text-2xl pt-3 border-t border-slate-700">
                    <span>Cambio:</span>
                    <span>${cashChange.toFixed(2)}</span>
                  </div>
                )}
                {!cashIsValid && cashReceivedNum > 0 && (
                  <div className="flex justify-between text-rose-300 font-extrabold text-base pt-3 border-t border-slate-700">
                    <span>Faltan:</span>
                    <span>${(total - cashReceivedNum).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <button onClick={handleCashExact} className="w-full neb-btn neb-btn-ghost py-3">
                Pago exacto (sin cambio)
              </button>
            </div>
          )}

          {mode === 'split' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-1">
                <h3 className="font-extrabold text-slate-900 text-sm">Ingresa los montos parciales</h3>
                <button onClick={() => setMode('quick')} className="text-[11px] text-accent-600 font-bold hover:underline">
                  Volver
                </button>
              </div>

              {[
                { key: 'efectivo',      label: 'Efectivo',      icon: Banknote,   iconColor: 'text-amber-600',  iconBg: 'bg-amber-50',  focusBorder: 'focus-within:border-amber-300'  },
                { key: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard, iconColor: 'text-accent-600', iconBg: 'bg-accent-50', focusBorder: 'focus-within:border-accent-300' },
                { key: 'transferencia', label: 'Transferencia', icon: Building2,  iconColor: 'text-violet-600', iconBg: 'bg-violet-50', focusBorder: 'focus-within:border-violet-300' },
              ].map(m => (
                <div key={m.key} className={`flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 ${m.focusBorder} transition-colors`}>
                  <div className={`w-11 h-11 rounded-xl ${m.iconBg} flex items-center justify-center shrink-0`}>
                    <m.icon className={`w-5 h-5 ${m.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{m.label}</label>
                    <div className="relative flex items-center">
                      <span className="text-slate-400 font-extrabold text-lg mr-1">$</span>
                      <input type="text" inputMode="decimal" placeholder="0.00"
                        value={payments[m.key]} onChange={(e) => handleInputChange(m.key, e.target.value)}
                        className="w-full bg-transparent outline-none text-xl font-extrabold text-slate-900 placeholder:text-slate-300" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-4 neb-grad-primary p-5 rounded-2xl space-y-3">
                <div className="flex justify-between text-slate-300 font-bold text-sm">
                  <span>Falta por pagar:</span>
                  <span className={restante > 0 ? "text-amber-300 font-extrabold" : "text-slate-400"}>${restante.toFixed(2)}</span>
                </div>
                {cambio > 0 && (
                  <div className="flex justify-between text-amber-300 font-extrabold text-lg pt-3 border-t border-slate-700">
                    <span>Cambio:</span>
                    <span>${cambio.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 md:p-5 border-t border-slate-100/80 flex gap-2.5 shrink-0">
          <button onClick={() => mode === 'quick' ? onClose() : setMode('quick')} className="flex-1 neb-btn neb-btn-ghost py-3">
            {mode === 'quick' ? 'Cancelar' : 'Volver'}
          </button>

          {mode === 'cash' && (
            <button onClick={handleCashConfirm} disabled={!cashIsValid}
              className="flex-[2] neb-btn neb-btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed">
              <CheckCircle className="w-4 h-4" /> Confirmar cobro
            </button>
          )}

          {mode === 'split' && (
            <button onClick={handleConfirm} disabled={!isComplete}
              className="flex-[2] neb-btn neb-btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed">
              Confirmar división <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
