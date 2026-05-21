import { useState, useEffect } from 'react';
import { X, Save, Package, Tag, Hash, DollarSign, Box, ScanLine, RefreshCw, Layers } from 'lucide-react';
import QRScannerModal from './QRScannerModal';
import { supabase } from '../lib/supabaseClient';

export default function ProductModal({ onClose, onSave, product = null, categorias = [] }) {
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [existingProduct, setExistingProduct] = useState(null);
  const [formData, setFormData] = useState(product || {
    nombre: '', sku: '', categoria: '', precio: '', stock: ''
  });

  const generateSKU = () => {
    const ts  = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
    setFormData(prev => ({ ...prev, sku: `SKU-${ts}-${rnd}` }));
    setExistingProduct(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (existingProduct) {
      onSave({
        ...formData,
        precio: parseFloat(formData.precio),
        stock: parseInt(formData.stock),
        _existingId: existingProduct.id,
        _addStock: true,
      });
    } else {
      onSave({
        ...formData,
        categoria: formData.categoria || 'General',
        precio: parseFloat(formData.precio),
        stock: parseInt(formData.stock),
      });
    }
  };

  useEffect(() => {
    if (product) return;
    const checkSku = async () => {
      if (!formData.sku || formData.sku.length <= 3) { setExistingProduct(null); return; }
      try {
        const { data } = await supabase
          .from('productos').select('*').eq('sku', formData.sku).maybeSingle();
        if (data) {
          setExistingProduct(data);
          setFormData(prev => ({
            ...prev,
            nombre: data.nombre,
            categoria: data.categoria || 'General',
            precio: data.precio.toString(),
          }));
        } else {
          setExistingProduct(null);
        }
      } catch (err) {
        console.error('Error buscando SKU:', err);
      }
    };
    const t = setTimeout(checkSku, 400);
    return () => clearTimeout(t);
  }, [formData.sku, product]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

        <div className="bg-slate-900 p-5 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6" />
            {product ? 'Editar Producto' : existingProduct ? 'Agregar Stock' : 'Nuevo Producto'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {existingProduct && !product && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-2">
            <span className="text-amber-600 text-sm font-bold shrink-0">⚠ SKU existente.</span>
            <span className="text-amber-700 text-xs">
              El stock ingresado se <strong>sumará</strong> al actual ({existingProduct.stock} un.)
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Nombre del Producto</label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                required name="nombre" value={formData.nombre} onChange={handleChange}
                disabled={!!existingProduct}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-all ${existingProduct ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
                placeholder="Ej. Bolsa 1kg"
              />
            </div>
          </div>

          {/* SKU */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">SKU / Código de Barras</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required name="sku" value={formData.sku} onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-all bg-white"
                  placeholder="Código de barras o SKU"
                />
              </div>
              <button type="button" onClick={generateSKU} title="Generar SKU"
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-xl flex items-center transition-colors border border-slate-200">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setIsScannerOpen(true)} title="Escanear"
                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 rounded-xl flex items-center transition-colors border border-slate-200">
                <ScanLine className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Categoría</label>
            <div className="relative">
              <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <input
                list="categorias-list"
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                disabled={!!existingProduct}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-all ${existingProduct ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
                placeholder="Ej. Bolsas, Cubetas, Limpieza…"
              />
              <datalist id="categorias-list">
                {categorias.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Precio */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">Precio</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required type="number" step="0.01" min="0" name="precio"
                  value={formData.precio} onChange={handleChange}
                  disabled={!!existingProduct}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-all ${existingProduct ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Stock */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1.5 block">
                {existingProduct ? 'Cantidad a Agregar' : 'Stock Inicial'}
              </label>
              <div className="relative">
                <Box className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required type="number" min="0" name="stock"
                  value={formData.stock} onChange={handleChange}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-all bg-white"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {existingProduct && (
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-600 font-medium border border-slate-200">
              Stock actual: <strong>{existingProduct.stock}</strong> →
              Nuevo: <strong className="text-emerald-600">{existingProduct.stock + (parseInt(formData.stock) || 0)}</strong>
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-colors border border-slate-200">
              Cancelar
            </button>
            <button type="submit"
              className="flex-1 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg">
              <Save className="w-5 h-5" />
              {existingProduct ? 'Agregar Stock' : product ? 'Guardar Cambios' : 'Crear Producto'}
            </button>
          </div>
        </form>
      </div>

      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(code) => { setFormData(prev => ({ ...prev, sku: code })); setIsScannerOpen(false); }}
      />
    </div>
  );
}
