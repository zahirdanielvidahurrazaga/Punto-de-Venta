import React, { useEffect, useRef, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, ScanLine } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

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
      if (!Capacitor.isNativePlatform()) cleanupScanner();
      return;
    }

    // ──────── Flujo Nativo (Capacitor / Android / iOS) ────────
    if (Capacitor.isNativePlatform()) {
      const startNativeScan = async () => {
        try {
          // Solicitar permiso de cámara al S.O.
          const { camera } = await BarcodeScanner.requestPermissions();
          if (camera === 'granted' || camera === 'limited') {
            // Abrir el lector nativo de ML Kit
            const { barcodes } = await BarcodeScanner.scan();
            if (barcodes.length > 0) {
              onScan(barcodes[0].rawValue);
            }
          }
        } catch (error) {
          console.error("Error en lector nativo:", error);
        } finally {
          // Asegurarse de cerrar el modal en React cuando se termine de escanear o se cancele
          onClose();
        }
      };
      
      startNativeScan();
      return;
    }

    // ──────── Flujo Web (Fallback: html5-qrcode) ────────

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
    if (Capacitor.isNativePlatform()) return null;
    return (
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div id="qr-reader" />
      </div>
    );
  }

  // Si está abierto y es nativo, ML Kit toma toda la pantalla, no renderizamos DOM superpuesto
  if (Capacitor.isNativePlatform()) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/30 dark:bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] shadow-xl">

        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">Escanear código</h3>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-center text-slate-500 dark:text-slate-400 mb-3 text-[12px] flex items-center justify-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" /> Apunta al código de barras o QR
          </p>
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
            <div id="qr-reader" style={{ width: '100%' }} />
          </div>
        </div>

      </div>
    </div>
  );
}
