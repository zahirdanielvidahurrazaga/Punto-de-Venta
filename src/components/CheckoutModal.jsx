import React, { useState } from 'react';
import { CreditCard, Banknote, Building, X, ArrowRight, Wallet, SplitSquareHorizontal } from 'lucide-react';

export default function CheckoutModal({ total, onClose, onComplete }) {
  const [payments, setPayments] = useState({
    efectivo: '',
    tarjeta: '',
    transferencia: ''
  });
  
  const [showSplit, setShowSplit] = useState(false);

  const handleQuickPay = (method) => {
    onComplete({
      efectivo: method === 'efectivo' ? total : 0,
      tarjeta: method === 'tarjeta' ? total : 0,
      transferencia: method === 'transferencia' ? total : 0,
      totalPagado: total,
      cambio: 0
    });
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
  
  // En modo rápido siempre es válido. En modo dividido, validamos la suma.
  const isComplete = showSplit ? totalPagado >= total : false;

  const handleConfirm = () => {
    if (isComplete) {
      onComplete({
        efectivo: ef,
        tarjeta: tar,
        transferencia: trans,
        totalPagado,
        cambio
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="bg-primary-600 p-5 md:p-6 flex justify-between items-center text-white shrink-0">
          <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" />
            Método de Pago
          </h2>
          <button onClick={onClose} className="text-primary-200 hover:text-white transition-colors p-1">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 md:p-8 flex-1 overflow-y-auto">
          {/* Total a Pagar */}
          <div className="text-center mb-8">
            <p className="text-slate-500 font-medium text-lg">Total a Pagar</p>
            <p className="text-5xl font-black text-slate-800">${total.toFixed(2)}</p>
          </div>

          {!showSplit ? (
            <div className="space-y-6">
              {/* Pagos Rápidos Exactos */}
              <div className="grid grid-cols-3 gap-3">
                <button onClick={() => handleQuickPay('efectivo')} className="flex flex-col items-center p-4 bg-slate-50 hover:bg-green-50 text-slate-700 hover:text-green-700 rounded-2xl border border-slate-200 hover:border-green-300 transition-all shadow-sm hover:shadow-md group">
                  <div className="bg-white p-2 rounded-xl mb-2 group-hover:scale-110 transition-transform">
                    <Banknote className="w-7 h-7 text-green-600" />
                  </div>
                  <span className="text-xs lg:text-sm font-bold text-center leading-tight">Efectivo<br/>Exacto</span>
                </button>
                <button onClick={() => handleQuickPay('tarjeta')} className="flex flex-col items-center p-4 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md group">
                  <div className="bg-white p-2 rounded-xl mb-2 group-hover:scale-110 transition-transform">
                    <CreditCard className="w-7 h-7 text-blue-600" />
                  </div>
                  <span className="text-xs lg:text-sm font-bold text-center leading-tight">Todo a<br/>Tarjeta</span>
                </button>
                <button onClick={() => handleQuickPay('transferencia')} className="flex flex-col items-center p-4 bg-slate-50 hover:bg-purple-50 text-slate-700 hover:text-purple-700 rounded-2xl border border-slate-200 hover:border-purple-300 transition-all shadow-sm hover:shadow-md group">
                  <div className="bg-white p-2 rounded-xl mb-2 group-hover:scale-110 transition-transform">
                    <Building className="w-7 h-7 text-purple-600" />
                  </div>
                  <span className="text-xs lg:text-sm font-bold text-center leading-tight">Todo a<br/>Transf.</span>
                </button>
              </div>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink-0 mx-4 text-slate-400 text-sm font-semibold uppercase">Opciones Avanzadas</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <button 
                onClick={() => setShowSplit(true)} 
                className="w-full py-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-3 border border-indigo-200 hover:border-indigo-600 shadow-sm"
              >
                <SplitSquareHorizontal className="w-6 h-6" />
                Dividir Cuenta
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-slate-700 text-lg">Ingresa los montos parciales</h3>
                <button onClick={() => setShowSplit(false)} className="text-sm text-primary-600 font-bold hover:underline">
                  Volver a Pago Rápido
                </button>
              </div>

              {/* Inputs de Pago Dividido */}
              <div className="space-y-4">
                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 focus-within:border-green-300 focus-within:bg-white transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
                    <Banknote className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Efectivo</label>
                    <div className="relative flex items-center">
                      <span className="text-slate-400 font-bold text-xl mr-1">$</span>
                      <input type="text" inputMode="decimal" placeholder="0.00" value={payments.efectivo} onChange={(e) => handleInputChange('efectivo', e.target.value)} className="w-full bg-transparent outline-none text-2xl font-bold text-slate-800 placeholder:text-slate-300" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 focus-within:border-blue-300 focus-within:bg-white transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <CreditCard className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Tarjeta</label>
                    <div className="relative flex items-center">
                      <span className="text-slate-400 font-bold text-xl mr-1">$</span>
                      <input type="text" inputMode="decimal" placeholder="0.00" value={payments.tarjeta} onChange={(e) => handleInputChange('tarjeta', e.target.value)} className="w-full bg-transparent outline-none text-2xl font-bold text-slate-800 placeholder:text-slate-300" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 focus-within:border-purple-300 focus-within:bg-white transition-colors">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                    <Building className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Transferencia</label>
                    <div className="relative flex items-center">
                      <span className="text-slate-400 font-bold text-xl mr-1">$</span>
                      <input type="text" inputMode="decimal" placeholder="0.00" value={payments.transferencia} onChange={(e) => handleInputChange('transferencia', e.target.value)} className="w-full bg-transparent outline-none text-2xl font-bold text-slate-800 placeholder:text-slate-300" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumen */}
              <div className="mt-6 bg-slate-800 p-5 rounded-2xl shadow-inner space-y-3">
                <div className="flex justify-between text-slate-300 font-medium text-lg">
                  <span>Falta por pagar:</span>
                  <span className={restante > 0 ? "text-orange-400 font-bold" : "text-slate-400"}>${restante.toFixed(2)}</span>
                </div>
                {cambio > 0 && (
                  <div className="flex justify-between text-green-400 font-bold text-xl pt-3 border-t border-slate-700">
                    <span>Cambio a devolver:</span>
                    <span>${cambio.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="p-4 md:p-6 bg-slate-50 border-t border-slate-100 flex gap-3 md:gap-4 shrink-0">
          <button onClick={onClose} className="flex-1 py-3 md:py-4 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
          
          {/* Si estamos en modo Split, mostramos el botón de confirmar. Si no, los botones rápidos ya hicieron el trabajo */}
          {showSplit && (
            <button 
              onClick={handleConfirm}
              disabled={!isComplete}
              className="flex-[2] bg-primary-600 hover:bg-primary-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 md:py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-primary-600/50"
            >
              Confirmar División <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
