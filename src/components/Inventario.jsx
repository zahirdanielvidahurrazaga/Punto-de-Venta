import React, { useState, useEffect } from 'react';
import { Search, Package, Plus, Filter, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function Inventario() {
  const [searchTerm, setSearchTerm] = useState('');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProductos(data || []);
    } catch (error) {
      console.error('Error fetching products:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductos();
  }, []);

  const filteredProducts = productos.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.sku.includes(searchTerm)
  );

  return (
    <div className="p-4 lg:p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Inventario */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white p-4 lg:p-6 rounded-2xl shadow-sm border border-slate-100 gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800 flex items-center gap-2 lg:gap-3">
              <Package className="w-6 h-6 lg:w-8 lg:h-8 text-primary-600" />
              Inventario de Productos
            </h1>
            <p className="text-sm lg:text-base text-slate-500 mt-1">Gestiona tu catálogo y existencias</p>
          </div>
          <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 lg:px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors w-full sm:w-auto">
            <Plus className="w-5 h-5" /> Nuevo Producto
          </button>
        </div>

        {/* Buscador y Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all text-sm lg:text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchProductos}
            className="bg-white border border-slate-200 px-4 py-3 rounded-xl text-slate-600 font-medium flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors w-full sm:w-auto"
          >
            <Filter className="w-5 h-5" /> Refrescar
          </button>
        </div>

        {/* Tabla Responsiva */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p>Cargando productos...</p>
            </div>
          ) : (
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-slate-500 text-xs lg:text-sm">
                  <th className="p-3 lg:p-4 font-semibold">SKU / Código</th>
                  <th className="p-3 lg:p-4 font-semibold">Producto</th>
                  <th className="p-3 lg:p-4 font-semibold">Categoría</th>
                  <th className="p-3 lg:p-4 font-semibold text-right">Precio</th>
                  <th className="p-3 lg:p-4 font-semibold text-right">Stock</th>
                </tr>
              </thead>
              <tbody className="text-sm lg:text-base">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                    <td className="p-3 lg:p-4 text-slate-500 font-mono">{product.sku}</td>
                    <td className="p-3 lg:p-4 font-medium text-slate-800">{product.nombre}</td>
                    <td className="p-3 lg:p-4">
                      <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-medium">
                        {product.categoria}
                      </span>
                    </td>
                    <td className="p-3 lg:p-4 text-right font-semibold text-primary-600">
                      ${Number(product.precio).toFixed(2)}
                    </td>
                    <td className="p-3 lg:p-4 text-right">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                        product.stock > 100 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {product.stock} un.
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-slate-400">
                      No se encontraron productos con "{searchTerm}"
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}

