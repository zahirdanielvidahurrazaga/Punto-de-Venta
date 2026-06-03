import { useState, useEffect } from 'react';
import { X, Save, Tag, Hash, DollarSign, Box, RefreshCw, Layers, AlertCircle, Printer } from 'lucide-react';
import EtiquetaModal from './EtiquetaModal';

export default function ProductModal({ onClose, onSave, product = null, categorias = [], sucursalProductos = [] }) {
  const [existingProduct, setExistingProduct] = useState(null);
  const [showEtiqueta, setShowEtiqueta] = useState(false);
  const [formData, setFormData] = useState(product || {
    nombre: '', sku: '', categoria: '', precio: '', stock: '', precio_mayoreo: '', cantidad_mayoreo: ''
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
    const payload = {
      ...formData,
      precio: parseFloat(formData.precio),
      stock: parseInt(formData.stock),
      precio_mayoreo: formData.precio_mayoreo ? parseFloat(formData.precio_mayoreo) : null,
      cantidad_mayoreo: formData.cantidad_mayoreo ? parseInt(formData.cantidad_mayoreo) : null,
    };

    if (existingProduct) {
      onSave({
        ...payload,
        _existingId: existingProduct.id,
        _addStock: true,
      });
    } else {
      onSave({
        ...payload,
        categoria: formData.categoria || 'General',
      });
    }
  };

  useEffect(() => {
    if (product) return;
    const checkSku = () => {
      const sku = (formData.sku || '').trim();
      if (!sku || sku.length <= 3) { setExistingProduct(null); return; }
      // El stock mostrado es el de la sucursal del usuario (lista ya cargada).
      const data = sucursalProductos.find(p => p.sku?.toLowerCase() === sku.toLowerCase());
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
    };
    const t = setTimeout(checkSku, 400);
    return () => clearTimeout(t);
  }, [formData.sku, product, sucursalProductos]);

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[60] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden">

        <div className="px-6 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">
            {product ? 'Editar producto' : existingProduct ? 'Agregar stock' : 'Nuevo producto'}
          </h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
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
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Nombre del producto</label>
            <div className="relative">
              <Tag className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                required name="nombre" value={formData.nombre} onChange={handleChange}
                disabled={!!existingProduct}
                className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 dark:bg-slate-900/50 !text-slate-400 dark:text-slate-500' : ''}`}
                placeholder="Ej. Bolsa 1kg"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">SKU / Código de barras</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  required name="sku" value={formData.sku} onChange={handleChange}
                  className="neb-input pl-10"
                  placeholder="Código de barras o SKU"
                />
              </div>
              <button type="button" onClick={generateSKU} title="Generar SKU"
                className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-700 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 rounded-2xl flex items-center transition-colors border border-slate-200 dark:border-slate-800">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {formData.sku && (
              <button type="button" onClick={() => setShowEtiqueta(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-600 hover:text-accent-700 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Imprimir etiqueta con código de barras
              </button>
            )}
          </div>

          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Categoría</label>
            <div className="relative">
              <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 z-10" />
              <input
                list="categorias-list"
                name="categoria"
                value={formData.categoria}
                onChange={handleChange}
                disabled={!!existingProduct}
                className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 dark:bg-slate-900/50 !text-slate-400 dark:text-slate-500' : ''}`}
                placeholder="Ej. Bolsas, Cubetas, Limpieza…"
              />
              <datalist id="categorias-list">
                {categorias.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Precio</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  required type="number" step="0.01" min="0" name="precio"
                  value={formData.precio} onChange={handleChange}
                  disabled={!!existingProduct}
                  className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 dark:bg-slate-900/50 !text-slate-400 dark:text-slate-500' : ''}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                {existingProduct ? 'Cantidad a agregar' : 'Stock inicial'}
              </label>
              <div className="relative">
                <Box className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  required type="number" min="0" name="stock"
                  value={formData.stock} onChange={handleChange}
                  className="neb-input pl-10"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Precio Mayoreo (Opcional)</label>
              <div className="relative">
                <DollarSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="number" step="0.01" min="0" name="precio_mayoreo"
                  value={formData.precio_mayoreo || ''} onChange={handleChange}
                  disabled={!!existingProduct}
                  className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 dark:bg-slate-900/50 !text-slate-400 dark:text-slate-500' : ''}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                A partir de (piezas)
              </label>
              <div className="relative">
                <Box className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                <input
                  type="number" min="0" name="cantidad_mayoreo"
                  value={formData.cantidad_mayoreo || ''} onChange={handleChange}
                  disabled={!!existingProduct}
                  className={`neb-input pl-10 ${existingProduct ? '!bg-slate-50 dark:bg-slate-900/50 !text-slate-400 dark:text-slate-500' : ''}`}
                  placeholder="Ej: 10"
                />
              </div>
            </div>
          </div>

          {existingProduct && (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl px-4 py-3 text-[12px] text-slate-600 dark:text-slate-400 font-bold border border-slate-100 dark:border-slate-800">
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

      {showEtiqueta && (
        <EtiquetaModal
          producto={{ nombre: formData.nombre, sku: formData.sku }}
          onClose={() => setShowEtiqueta(false)}
        />
      )}
    </div>
  );
}
