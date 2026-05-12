import React, { useState, useEffect, useRef } from 'react';
import { Search, Package, Plus, Filter, Loader2, Edit2, Upload, FileSpreadsheet } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import ProductModal from './ProductModal';

export default function Inventario({ isAdmin }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleSaveProduct = async (productData) => {
    try {
      if (selectedProduct) {
        const { error } = await supabase
          .from('productos')
          .update(productData)
          .eq('id', selectedProduct.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('productos')
          .insert([productData]);
        if (error) throw error;
      }
      
      setIsModalOpen(false);
      setSelectedProduct(null);
      fetchProductos();
    } catch (error) {
      alert('Error al guardar el producto: ' + error.message);
    }
  };

  const handleEdit = (product) => {
    if (!isAdmin) return;
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleNew = () => {
    if (!isAdmin) return;
    setSelectedProduct(null);
    setIsModalOpen(true);
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingCSV(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const rows = text.split('\n').filter(row => row.trim() !== '');
      
      // Asumimos formato: Nombre, SKU, Categoria, Precio, Stock
      // La primera fila suele ser encabezado, la saltamos si contiene 'nombre'
      let startIndex = 0;
      if (rows[0].toLowerCase().includes('nombre')) startIndex = 1;

      const newProducts = [];
      for (let i = startIndex; i < rows.length; i++) {
        // Regex para manejar comas dentro de comillas (CSV estándar)
        const cols = rows[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || rows[i].split(',');
        
        if (cols.length >= 4) {
          let nombre = cols[0]?.replace(/"/g, '').trim() || 'Sin Nombre';
          let sku = cols[1]?.replace(/"/g, '').trim();
          let categoria = cols[2]?.replace(/"/g, '').trim() || 'General';
          let precio = parseFloat(cols[3]?.replace(/"/g, '').trim()) || 0;
          let stock = parseInt(cols[4]?.replace(/"/g, '').trim()) || 0;

          // Si no hay SKU (ej. escobas sin código), generamos uno interno
          if (!sku || sku === '') {
            sku = `INT-${Math.floor(100000 + Math.random() * 900000)}`;
          }

          newProducts.push({ nombre, sku, categoria, precio, stock });
        }
      }

      if (newProducts.length > 0) {
        try {
          const { error } = await supabase.from('productos').insert(newProducts);
          if (error) {
            // Manejar error de SKU duplicado u otros
            alert('Error al subir CSV. Algunos SKU ya podrían existir.\nDetalle: ' + error.message);
          } else {
            alert(`Se importaron ${newProducts.length} productos correctamente.`);
            fetchProductos();
          }
        } catch (err) {
          alert('Error de conexión al importar: ' + err.message);
        }
      } else {
        alert('No se encontraron productos válidos en el CSV. El formato debe ser: Nombre,SKU,Categoria,Precio,Stock');
      }
      setUploadingCSV(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.onerror = () => {
      alert('Error leyendo el archivo CSV');
      setUploadingCSV(false);
    };
    reader.readAsText(file);
  };

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
              <Package className="w-6 h-6 lg:w-8 lg:h-8 text-primary-900" />
              Inventario de Productos
            </h1>
            <p className="text-sm lg:text-base text-slate-500 mt-1">Gestiona tu catálogo y existencias</p>
          </div>
          
          {isAdmin && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="file" 
                accept=".csv" 
                ref={fileInputRef}
                style={{ display: 'none' }} 
                onChange={handleCSVUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingCSV}
                className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors w-full sm:w-auto shadow-sm"
              >
                {uploadingCSV ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-green-600" />}
                Importar CSV
              </button>
              <button 
                onClick={handleNew}
                className="bg-primary-900 hover:bg-primary-700 text-white px-4 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors w-full sm:w-auto shadow-lg shadow-primary-900/20"
              >
                <Plus className="w-5 h-5" /> Nuevo
              </button>
            </div>
          )}
        </div>

        {/* Buscador y Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 lg:gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text"
              placeholder="Buscar por nombre o SKU..."
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition-all text-sm lg:text-base bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button 
            onClick={fetchProductos}
            className="bg-white border border-slate-200 px-4 py-3 rounded-xl text-slate-600 font-medium flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors w-full sm:w-auto shadow-sm"
          >
            <Filter className="w-5 h-5" /> Refrescar
          </button>
        </div>

        {/* Tabla Responsiva */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary-900" />
              <p>Cargando productos...</p>
            </div>
          ) : (
            <>
              {/* Vista Mobile (Tarjetas) */}
              <div className="md:hidden flex flex-col gap-3 p-4 bg-slate-50">
                {filteredProducts.map((product) => (
                  <div key={product.id} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-800 leading-tight">{product.nombre}</h3>
                        <p className="text-xs text-slate-400 font-mono mt-1">{product.sku}</p>
                      </div>
                      {isAdmin && (
                        <button 
                          onClick={() => handleEdit(product)}
                          className="p-2 text-slate-400 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors shrink-0"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-end border-t border-slate-50 pt-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                          product.stock > 20 
                            ? 'bg-green-50 text-green-700 border-green-200' 
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                          Stock: {product.stock}
                        </span>
                        <span className="font-black text-slate-800 text-sm">
                          ${Number(product.precio).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="p-8 text-center text-slate-400 font-medium bg-white rounded-2xl border border-slate-100">
                    No se encontraron productos con "{searchTerm}"
                  </div>
                )}
              </div>

              {/* Vista Desktop (Tabla) */}
              <div className="hidden md:block overflow-x-auto min-h-[400px]">
                <table className="w-full min-w-[800px] text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs lg:text-sm uppercase tracking-wider">
                      <th className="p-4 font-bold">SKU / Código</th>
                      <th className="p-4 font-bold">Producto</th>
                      <th className="p-4 font-bold text-right">Precio</th>
                      <th className="p-4 font-bold text-right">Stock</th>
                      {isAdmin && <th className="p-4 font-bold text-center">Acción</th>}
                    </tr>
                  </thead>
                  <tbody className="text-sm lg:text-base">
                    {filteredProducts.map((product) => (
                      <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors group">
                        <td className="p-4 text-slate-500 font-mono text-sm">{product.sku}</td>
                        <td className="p-4 font-bold text-slate-800">{product.nombre}</td>
                        <td className="p-4 text-right font-black text-slate-800">
                          ${Number(product.precio).toFixed(2)}
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            product.stock > 20 
                              ? 'bg-green-50 text-green-700 border-green-200' 
                              : 'bg-red-50 text-red-700 border-red-200'
                          }`}>
                            {product.stock} un.
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => handleEdit(product)}
                              className="p-2 text-slate-400 hover:text-primary-900 hover:bg-primary-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={isAdmin ? "5" : "4"} className="p-12 text-center text-slate-400 font-medium">
                          No se encontraron productos con "{searchTerm}"
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </div>

      {isModalOpen && (
        <ProductModal 
          product={selectedProduct}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
}
