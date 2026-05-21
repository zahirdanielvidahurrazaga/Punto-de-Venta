import React, { useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScan }) {
  const scannerRef = useRef(null);
  const isCleaningUp = useRef(false);

  // Cleanup seguro que espera a que el escáner se detenga completamente
  const cleanupScanner = useCallback(async () => {
    if (isCleaningUp.current || !scannerRef.current) return;
    isCleaningUp.current = true;
    try {
      await scannerRef.current.clear();
    } catch (err) {
      // El escáner ya se limpió o el elemento no existe, ignorar
    }
    scannerRef.current = null;
    isCleaningUp.current = false;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      // Cuando se cierra, limpiar el escáner de forma segura
      cleanupScanner();
      return;
    }

    // Pequeño delay para asegurar que el DOM esté visible antes de iniciar la cámara
    const timeoutId = setTimeout(() => {
      const readerEl = document.getElementById('qr-reader');
      if (!readerEl || scannerRef.current) return;

      const scanner = new Html5QrcodeScanner(
        'qr-reader',
        { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
        false
      );

      scannerRef.current = scanner;

      scanner.render(
        (decodedText) => {
          cleanupScanner().then(() => {
            onScan(decodedText);
          });
        },
        () => {
          // Errores de frame al no detectar QR, se ignoran
        }
      );
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      cleanupScanner();
    };
  }, [isOpen, onScan, cleanupScanner]);

  // Siempre renderizamos el contenedor #qr-reader en el DOM,
  // pero lo ocultamos visualmente cuando no está abierto.
  // Esto garantiza que scanner.clear() encuentre el nodo y libere la cámara.
  if (!isOpen) {
    return (
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div id="qr-reader"></div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-[2rem] w-full max-w-md shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh] text-white">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-800/50">
          <h3 className="text-xl font-extrabold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-500/10 border border-accent-500/20 rounded-xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-accent-400" />
            </div>
            Escanear Código
          </h3>
          <button 
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="p-6 overflow-y-auto">
          <p className="text-center text-slate-400 mb-4 text-xs font-semibold uppercase tracking-wider">
            Apunta la cámara hacia el código de barras o QR
          </p>
          <div className="rounded-2xl overflow-hidden border-2 border-accent-500/20 bg-black">
            <div id="qr-reader" style={{ width: '100%' }}></div>
          </div>
        </div>

      </div>
    </div>
  );
}
