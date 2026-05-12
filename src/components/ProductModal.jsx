import React, { useState, useEffect } from 'react';
import { X, Save, Package, Tag, Hash, DollarSign, Box, ScanLine } from 'lucide-react';
import QRScannerModal from './QRScannerModal';
import { supabase } from '../lib/supabaseClient';

export default function ProductModal({ onClose, onSave, product = null }) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [formData, setFormData] = useState(product || {
    nombre: '',
    sku: '',
    categoria: '',
    precio: '',
    stock: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      precio: parseFloat(formData.precio),
      stock: parseInt(formData.stock)
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Efecto para autocompletar si se detecta un SKU que ya existe
  useEffect(() => {
    const checkSku = async () => {
      if (formData.sku && formData.sku.length > 3 && !product) {
        try {
          const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('sku', formData.sku)
            .maybeSingle();

          if (data && !error) {
            setFormData(prev => ({
              ...prev,
              nombre: data.nombre,
              categoria: data.categoria || 'General',
              precio: data.precio.toString()
              // No sobreescribimos el stock para que el usuario pueda ingresar el nuevo ingreso
            }));
          }
        } catch (error) {
          console.error("Error buscando SKU:", error);
        }
      }
    };
    
    // Pequeño debounce manual
    const timeoutId = setTimeout(() => {
      checkSku();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [formData.sku, product]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-primary-600 p-5 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            {product ? 'Editar Producto' : 'Añadir Producto / Stock'}
          </h2>
          <button onClick={onClose} className="text-primary-200 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Nombre del Producto</label>
            <div className="relative">
              <Tag className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                required
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none"
                placeholder="Ej. Bolsa 1kg"
              />
            </div>
          </div>

          {/* SKU */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">SKU / Código</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  required
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none"
                  placeholder="Código de barras"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 rounded-xl flex items-center justify-center transition-colors"
                title="Escanear con cámara"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Categoría Oculta */}
          <input type="hidden" name="categoria" value="General" />

          <div className="grid grid-cols-2 gap-4">
            {/* Precio */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Precio</label>
              <div className="relative">
                <DollarSign className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  required
                  type="number"
                  step="0.01"
                  name="precio"
                  value={formData.precio}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Stock */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Stock Inicial</label>
              <div className="relative">
                <Box className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  required
                  type="number"
                  name="stock"
                  value={formData.stock}
                  onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-3 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary-600/30">
              <Save className="w-5 h-5" />
              Guardar
            </button>
          </div>
        </form>
      </div>

      <QRScannerModal 
        isOpen={isScannerOpen} 
        onClose={() => setIsScannerOpen(false)} 
        onScan={(decodedText) => {
          setFormData(prev => ({ ...prev, sku: decodedText }));
          setIsScannerOpen(false);
        }} 
      />
    </div>
  );
}
