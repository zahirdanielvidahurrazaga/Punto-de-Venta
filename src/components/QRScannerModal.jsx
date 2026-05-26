import React, { useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera, ScanLine } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScan }) {
  const scannerRef = useRef(null);
  const isCleaningUp = useRef(false);

  const cleanupScanner = useCallback(async () => {
    if (isCleaningUp.current || !scannerRef.current) return;
    isCleaningUp.current = true;
    try {
      await scannerRef.current.clear();
    } catch (err) {
      // ignorar
    }
    scannerRef.current = null;
    isCleaningUp.current = false;
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      return;
    }

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
          cleanupScanner().then(() => onScan(decodedText));
        },
        () => {}
      );
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      cleanupScanner();
    };
  }, [isOpen, onScan, cleanupScanner]);

  if (!isOpen) {
    return (
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div id="qr-reader" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/30 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="neb-glass-strong rounded-3xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">

        <div className="flex justify-between items-center p-5 border-b border-slate-100/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-50 border border-accent-100 rounded-2xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-accent-600" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">Lector</p>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">Escanear código</h3>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-center text-slate-500 mb-3 text-[11px] font-bold uppercase tracking-[0.16em] flex items-center justify-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" /> Apunta al código de barras o QR
          </p>
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
            <div id="qr-reader" style={{ width: '100%' }} />
          </div>
        </div>

      </div>
    </div>
  );
}
