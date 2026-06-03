import { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { X, Printer, Tag, LayoutGrid } from 'lucide-react';

const NOMBRE_NEGOCIO = 'Plásticos y Jarciería Tito';

// Genera el código de barras (Code 128) como string SVG, listo para imprimir.
function generarSvgCodigoBarras(valor) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, valor, {
    format: 'CODE128',
    width: 1.7,
    height: 50,
    fontSize: 14,
    textMargin: 2,
    margin: 6,
    displayValue: true,
  });
  return svg.outerHTML;
}

function escaparHtml(texto) {
  return String(texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default function EtiquetaModal({ producto, onClose }) {
  const sku = (producto?.sku || '').trim();
  const nombre = producto?.nombre || '';

  const [modo, setModo] = useState('individual'); // 'individual' | 'hoja'
  const [cantidad, setCantidad] = useState(24);
  const [error, setError] = useState('');
  const previewRef = useRef(null);

  // Vista previa del código de barras dentro del modal. Si el código no fuera
  // válido, la vista previa queda vacía; el botón Imprimir muestra el error.
  useEffect(() => {
    if (!sku || !previewRef.current) return;
    try {
      JsBarcode(previewRef.current, sku, {
        format: 'CODE128',
        width: 1.7,
        height: 50,
        fontSize: 14,
        textMargin: 2,
        margin: 6,
        displayValue: true,
      });
    } catch {
      /* código no representable como barras; se avisa al intentar imprimir */
    }
  }, [sku]);

  const imprimir = () => {
    if (!sku) { setError('El producto no tiene SKU.'); return; }

    let svg;
    try {
      svg = generarSvgCodigoBarras(sku);
    } catch {
      setError('Este código no se puede convertir en código de barras.');
      return;
    }

    const copias = modo === 'hoja' ? Math.max(1, Math.min(100, Number(cantidad) || 1)) : 1;
    const etiqueta = `
      <div class="etiqueta">
        <div class="negocio">${escaparHtml(NOMBRE_NEGOCIO)}</div>
        <div class="nombre">${escaparHtml(nombre)}</div>
        ${svg}
      </div>`;
    const etiquetas = Array.from({ length: copias }, () => etiqueta).join('');

    const estilos = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 6mm; }
      .hoja { display: flex; flex-wrap: wrap; gap: 4mm; justify-content: flex-start; }
      .individual { display: flex; justify-content: center; padding-top: 10mm; }
      .etiqueta {
        width: 50mm; border: 1px dashed #cbd5e1; border-radius: 2mm;
        padding: 2mm; text-align: center; page-break-inside: avoid;
      }
      .individual .etiqueta { border-style: solid; }
      .negocio { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
      .nombre  { font-size: 9pt; font-weight: 600; margin: 1mm 0; line-height: 1.1;
                 white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .etiqueta svg { max-width: 100%; height: auto; }
      @media print { .etiqueta { border-color: transparent; } }
    `;

    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) { setError('Permite las ventanas emergentes para imprimir.'); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Etiqueta ${escaparHtml(sku)}</title><style>${estilos}</style></head>
      <body>
        <div class="${modo === 'hoja' ? 'hoja' : 'individual'}">${etiquetas}</div>
        <script>
          window.onload = function () { window.focus(); window.print(); setTimeout(function(){ window.close(); }, 300); };
        </script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center z-[70] p-4">
      <div className="neb-glass-strong rounded-3xl w-full max-w-sm overflow-hidden">

        <div className="px-6 py-5 flex justify-between items-center border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">Imprimir etiqueta</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Vista previa */}
          <div className="bg-white rounded-2xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-700">{NOMBRE_NEGOCIO}</p>
            <p className="text-[11px] font-semibold text-slate-800 truncate mb-1">{nombre || 'Producto'}</p>
            {sku
              ? <svg ref={previewRef} className="mx-auto max-w-full" />
              : <p className="text-[12px] text-rose-600 font-medium py-4">El producto no tiene SKU.</p>}
          </div>

          {error && (
            <p className="text-[12px] font-medium text-rose-600 bg-rose-50 border border-rose-100 py-2 px-3 rounded-xl">{error}</p>
          )}

          {/* Selector de formato */}
          <div>
            <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setModo('individual')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[13px] font-semibold border transition-colors ${
                  modo === 'individual'
                    ? 'bg-accent-600 text-white border-accent-600'
                    : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                <Tag className="w-4 h-4" /> Individual
              </button>
              <button type="button" onClick={() => setModo('hoja')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-[13px] font-semibold border transition-colors ${
                  modo === 'hoja'
                    ? 'bg-accent-600 text-white border-accent-600'
                    : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                <LayoutGrid className="w-4 h-4" /> Hoja (varias)
              </button>
            </div>
          </div>

          {/* Cantidad para hoja */}
          {modo === 'hoja' && (
            <div>
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Cantidad de etiquetas</label>
              <div className="flex items-center gap-2">
                {[12, 24, 30].map(n => (
                  <button key={n} type="button" onClick={() => setCantidad(n)}
                    className={`px-3 py-2 rounded-xl text-[13px] font-semibold border transition-colors ${
                      Number(cantidad) === n
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                        : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                    {n}
                  </button>
                ))}
                <input type="number" min={1} max={100} value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="neb-input flex-1 text-center" />
              </div>
            </div>
          )}

          <button type="button" onClick={imprimir} disabled={!sku}
            className="neb-btn neb-btn-primary w-full py-3 disabled:opacity-50">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
