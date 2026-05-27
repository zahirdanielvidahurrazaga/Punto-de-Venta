import React, { useState, useRef, useEffect } from 'react';
import { CreditCard, Banknote, Building2, X, ArrowRight, SplitSquareHorizontal, CheckCircle } from 'lucide-react';

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
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]">

        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            {mode === 'cash' ? 'Pago en efectivo' : 'Método de pago'}
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 md:p-7 flex-1 overflow-y-auto neb-scroll">
          <div className="text-center mb-7">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total a pagar</p>
            <p className="text-5xl font-semibold text-slate-900 dark:text-white tracking-tight mt-1 neb-tabular">${total.toFixed(2)}</p>
          </div>

          {mode === 'quick' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => handleQuickPay('efectivo')} className="flex flex-col items-center p-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 transition-all group">
                  <Banknote className="w-7 h-7 text-slate-700 dark:text-slate-300 mb-2 group-hover:scale-110 transition-transform" strokeWidth={1.8} />
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 text-center">Efectivo</span>
                </button>
                <button onClick={() => handleQuickPay('tarjeta')} className="flex flex-col items-center p-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 transition-all group">
                  <CreditCard className="w-7 h-7 text-slate-700 dark:text-slate-300 mb-2 group-hover:scale-110 transition-transform" strokeWidth={1.8} />
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 text-center">Tarjeta</span>
                </button>
                <button onClick={() => handleQuickPay('transferencia')} className="flex flex-col items-center p-5 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 transition-all group">
                  <Building2 className="w-7 h-7 text-slate-700 dark:text-slate-300 mb-2 group-hover:scale-110 transition-transform" strokeWidth={1.8} />
                  <span className="text-[12px] font-medium text-slate-700 dark:text-slate-300 text-center">Transferencia</span>
                </button>
              </div>

              <button onClick={() => setMode('split')} className="w-full py-3 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 dark:bg-slate-900/50 rounded-xl text-[13px] font-medium transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800">
                <SplitSquareHorizontal className="w-4 h-4" />
                Dividir cuenta
              </button>
            </div>
          )}

          {mode === 'cash' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block mb-2">
                  ¿Con cuánto paga el cliente?
                </label>
                <div className="relative flex items-center">
                  <span className="text-slate-400 dark:text-slate-500 font-semibold text-3xl mr-2">$</span>
                  <input
                    ref={cashInputRef}
                    type="text" inputMode="decimal" placeholder="0.00"
                    value={cashReceived}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) setCashReceived(val);
                    }}
                    className="w-full bg-transparent outline-none text-4xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-300 neb-tabular"
                  />
                </div>
              </div>

              <div className="bg-slate-900 p-5 rounded-xl space-y-3">
                <div className="flex justify-between text-slate-400 dark:text-slate-500 text-sm">
                  <span>Total</span>
                  <span className="text-white font-semibold neb-tabular">${total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400 dark:text-slate-500 text-sm">
                  <span>Recibido</span>
                  <span className={`neb-tabular ${cashReceivedNum > 0 ? "text-white font-semibold" : "text-slate-500 dark:text-slate-400"}`}>${cashReceivedNum.toFixed(2)}</span>
                </div>
                {cashIsValid && (
                  <div className="flex justify-between text-white font-semibold text-2xl pt-3 border-t border-slate-800 neb-tabular">
                    <span>Cambio</span>
                    <span>${cashChange.toFixed(2)}</span>
                  </div>
                )}
                {!cashIsValid && cashReceivedNum > 0 && (
                  <div className="flex justify-between text-rose-300 font-semibold text-base pt-3 border-t border-slate-800 neb-tabular">
                    <span>Faltan</span>
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
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm">Ingresa los montos parciales</h3>
                <button onClick={() => setMode('quick')} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-white font-medium transition-colors">
                  Volver
                </button>
              </div>

              {[
                { key: 'efectivo',      label: 'Efectivo',      icon: Banknote   },
                { key: 'tarjeta',       label: 'Tarjeta',       icon: CreditCard },
                { key: 'transferencia', label: 'Transferencia', icon: Building2  },
              ].map(m => (
                <div key={m.key} className="flex items-center gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 focus-within:border-slate-400 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center shrink-0">
                    <m.icon className="w-4 h-4 text-slate-600 dark:text-slate-400" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">{m.label}</label>
                    <div className="relative flex items-center">
                      <span className="text-slate-400 dark:text-slate-500 font-medium text-lg mr-1">$</span>
                      <input type="text" inputMode="decimal" placeholder="0.00"
                        value={payments[m.key]} onChange={(e) => handleInputChange(m.key, e.target.value)}
                        className="w-full bg-transparent outline-none text-xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-300 neb-tabular" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-4 bg-slate-900 p-5 rounded-xl space-y-3">
                <div className="flex justify-between text-slate-400 dark:text-slate-500 text-sm">
                  <span>Falta por pagar</span>
                  <span className={`neb-tabular ${restante > 0 ? "text-white font-semibold" : "text-slate-500 dark:text-slate-400"}`}>${restante.toFixed(2)}</span>
                </div>
                {cambio > 0 && (
                  <div className="flex justify-between text-white font-semibold text-lg pt-3 border-t border-slate-800 neb-tabular">
                    <span>Cambio</span>
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
