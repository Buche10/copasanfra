/**
 * Aplica una marca de agua anti-falsificación a la foto del jugador.
 * Usa createImageBitmap (decodificación fiable y con orientación EXIF), evitando
 * el "cuadro negro" que a veces produce <img>+canvas en móviles (fotos HEIC/HDR).
 */
export async function applyWatermarkToPhoto(
  fileOrBase64: File | string,
  watermarkText: string = 'COPA ABOGADOS 2026 • REGISTRO OFICIAL'
): Promise<string> {
  // 1) Obtener un Blob de la foto (desde File o desde data URL/URL).
  let blob: Blob;
  try {
    blob = typeof fileOrBase64 === 'string' ? await (await fetch(fileOrBase64)).blob() : fileOrBase64;
  } catch {
    throw new Error('No se pudo leer la imagen.');
  }

  // 2) Decodificar a bitmap (respeta la orientación de la cámara).
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(
      'No se pudo procesar la foto. Usa una imagen JPG o PNG (evita el formato HEIC del iPhone: en Ajustes → Cámara → Formatos, elige "Más compatible").'
    );
  }

  const W = 600;
  const H = 600;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('El navegador no permite procesar imágenes.');
  }

  // Fondo blanco (evita píxeles negros/transparentes al exportar a JPEG).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Dibujar la foto centrada tipo "cover".
  const scale = Math.max(W / bitmap.width, H / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (W - dw) / 2, (H - dh) / 2, dw, dh);
  bitmap.close?.();

  // --- Marca de agua ---
  // 1. Texto diagonal repetido
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate((-35 * Math.PI) / 180);
  ctx.font = '900 20px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 4;
  ctx.textAlign = 'center';
  [-180, -100, -20, 60, 140, 220].forEach((lineY) => ctx.fillText(watermarkText, 0, lineY));
  ctx.restore();

  // 2. Sello oficial en la esquina
  ctx.save();
  const bx = W - 110;
  const by = H - 110;
  ctx.beginPath();
  ctx.arc(bx, by, 45, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#00A859';
  ctx.stroke();
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.fillStyle = '#00A859';
  ctx.textAlign = 'center';
  ctx.fillText('OFICIAL', bx, by - 12);
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('VALIDADO', bx, by + 4);
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.fillStyle = '#DC2626';
  ctx.fillText('2026', bx, by + 18);
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.9);
}
