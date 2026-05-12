import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScan }) {
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    // Se instancia el escáner
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 }, rememberLastUsedCamera: true },
      /* verbose= */ false
    );

    scanner.render(
      (decodedText) => {
        scanner.clear(); // Detenemos después de leer 1 vez
        onScan(decodedText);
      },
      (errorMessage) => {
        // Errores de frame (muy comunes al no detectar QR en ese frame), los ignoramos
      }
    );

    return () => {
      scanner.clear().catch(error => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, [isOpen, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Camera className="w-6 h-6 text-primary-900" />
            Escanear Código
          </h3>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scanner Body */}
        <div className="p-6 overflow-y-auto">
          <p className="text-center text-slate-500 mb-4 text-sm">
            Apunta la cámara de tu dispositivo hacia el código de barras o código QR.
          </p>
          <div className="rounded-2xl overflow-hidden border-2 border-primary-100">
            <div id="reader" width="100%"></div>
          </div>
          {error && <p className="text-red-500 text-sm mt-4 text-center font-bold">{error}</p>}
        </div>

      </div>
    </div>
  );
}
