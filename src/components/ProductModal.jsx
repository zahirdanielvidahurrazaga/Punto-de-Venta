import { useState, useEffect } from 'react';
import { X, Save, Package, Tag, Hash, DollarSign, Box, ScanLine, RefreshCw, Layers, AlertCircle } from 'lucide-react';
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
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden">

        <div className="px-6 py-5 flex justify-between items-center border-b border-slate-100/80">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Catálogo</p>
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 tracking-tight mt-0.5">
              <Package className="w-5 h-5 text-accent-600" />
              {product ? 'Editar producto' : existingProduct ? 'Agregar stock' : 'Nuevo producto'}
            </h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {existingProduct && !product && (
          <div className="bg-amber-50 border-b border-amber-100 px-6 py-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="text-amber-700 text-[12px] font-bold">SKU existente.</span>
              <span className="text-amber-700 text-[11px] block">
                El stock ingresado se <strong>sumará</strong> al actual ({existingProduct.stock} un.)
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Nombre del producto</label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                required name="nombre" value={formData.nombre} onChange={handleChange}
                disabled={!!existingProduct}
                className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 !text-slate-400' : ''}`}
                placeholder="Ej. Bolsa 1kg"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">SKU / Código de barras</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required name="sku" value={formData.sku} onChange={handleChange}
                  className="neb-input pl-10"
                  placeholder="Código de barras o SKU"
                />
              </div>
              <button type="button" onClick={generateSKU} title="Generar SKU"
                className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 rounded-2xl flex items-center transition-colors border border-slate-200">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setIsScannerOpen(true)} title="Escanear"
                className="bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 rounded-2xl flex items-center transition-colors border border-slate-200">
                <ScanLine className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Categoría</label>
            <div className="relative">
              <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
              <input
                list="categorias-list"
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                disabled={!!existingProduct}
                className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 !text-slate-400' : ''}`}
                placeholder="Ej. Bolsas, Cubetas, Limpieza…"
              />
              <datalist id="categorias-list">
                {categorias.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">Precio</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required type="number" step="0.01" min="0" name="precio"
                  value={formData.precio} onChange={handleChange}
                  disabled={!!existingProduct}
                  className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 !text-slate-400' : ''}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">
                {existingProduct ? 'Cantidad a agregar' : 'Stock inicial'}
              </label>
              <div className="relative">
                <Box className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  required type="number" min="0" name="stock"
                  value={formData.stock} onChange={handleChange}
                  className="neb-input pl-10"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {existingProduct && (
            <div className="bg-slate-50 rounded-2xl px-4 py-3 text-[12px] text-slate-600 font-bold border border-slate-100">
              Stock actual: <strong>{existingProduct.stock}</strong> →
              Nuevo: <strong className="text-emerald-600">{existingProduct.stock + (parseInt(formData.stock) || 0)}</strong>
            </div>
          )}

          <div className="pt-2 flex gap-2.5">
            <button type="button" onClick={onClose} className="flex-1 neb-btn neb-btn-ghost py-3">
              Cancelar
            </button>
            <button type="submit" className="flex-1 neb-btn neb-btn-primary py-3">
              <Save className="w-4 h-4" />
              {existingProduct ? 'Agregar stock' : product ? 'Guardar cambios' : 'Crear producto'}
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
