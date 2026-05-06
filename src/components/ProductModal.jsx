import React, { useState } from 'react';
import { X, Save, Package, Tag, Hash, DollarSign, Box } from 'lucide-react';

export default function ProductModal({ onClose, onSave, product = null }) {
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

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="bg-primary-600 p-5 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            {product ? 'Editar Producto' : 'Nuevo Producto'}
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
            <div className="relative">
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
          </div>

          {/* Categoría */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Categoría</label>
            <div className="relative">
              <Box className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                required
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 outline-none"
                placeholder="Ej. Bolsas, Vasos..."
              />
            </div>
          </div>

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
    </div>
  );
}
