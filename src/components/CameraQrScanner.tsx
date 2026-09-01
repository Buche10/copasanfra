'use client';

import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { X, QrCode, CameraOff } from 'lucide-react';

interface CameraQrScannerProps {
  // Called with the decoded QR text. The parent decides what to do with it.
  onDetected: (text: string) => void;
  onClose: () => void;
  title?: string;
  hint?: string;
}

export const CameraQrScanner: React.FC<CameraQrScannerProps> = ({
  onDetected,
  onClose,
  title = 'Escanear carnet',
  hint = 'Apunta la cámara al código QR del carnet.',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<{ text: string; t: number }>({ text: '', t: 0 });
  const cbRef = useRef(onDetected);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest callback without restarting the camera on every render.
  useEffect(() => {
    cbRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && video.videoWidth > 0) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);
          const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
          if (code && code.data) {
            const now = Date.now();
            // Ignore repeated reads of the same code within 1.5s.
            if (code.data !== lastRef.current.text || now - lastRef.current.t > 1500) {
              lastRef.current = { text: code.data, t: now };
              cbRef.current(code.data);
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no permite usar la cámara (requiere HTTPS).');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.setAttribute('playsinline', 'true');
          await video.play();
        }
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Actívalo en el candado del navegador y reintenta.'
            : name === 'NotFoundError'
            ? 'No se encontró ninguna cámara en este dispositivo.'
            : 'No se pudo acceder a la cámara.'
        );
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-black">
            <QrCode className="w-5 h-5 text-[#00A859]" />
            <span>{title}</span>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {error ? (
            <div className="py-10 text-center space-y-3">
              <CameraOff className="w-12 h-12 text-rose-500 mx-auto" />
              <p className="text-sm font-bold text-rose-600 px-4">{error}</p>
              <p className="text-xs text-slate-500 px-4">
                También puedes escribir la cédula o el código del jugador manualmente en el campo de la planilla.
              </p>
            </div>
          ) : (
            <>
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {/* Scanning frame overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-2/3 h-2/3 border-4 border-[#00A859]/80 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">{hint}</p>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
};
