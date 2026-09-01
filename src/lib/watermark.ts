/**
 * Utility to apply an anti-forgery watermark to uploaded player photos using HTML5 Canvas.
 */
export function applyWatermarkToPhoto(
  fileOrBase64: File | string,
  watermarkText: string = 'COPA ABOGADOS 2026 • REGISTRO OFICIAL'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const processImage = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(typeof fileOrBase64 === 'string' ? fileOrBase64 : '');
          return;
        }

        // Standard high-res target dimensions
        const width = 600;
        const height = 600;
        canvas.width = width;
        canvas.height = height;

        // Draw image scaled & centered (cover object-fit)
        const scale = Math.max(width / img.width, height / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // --- WATERMARK OVERLAY ---

        // 1. Semi-transparent diagonal repeated text watermark
        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.rotate((-35 * Math.PI) / 180);

        ctx.font = '900 22px Inter, system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';

        const lines = [-180, -100, -20, 60, 140, 220];
        lines.forEach((lineY) => {
          ctx.fillText(watermarkText, 0, lineY);
        });
        ctx.restore();

        // 2. Official Badge Stamp in bottom corner
        ctx.save();
        const badgeX = width - 110;
        const badgeY = height - 110;

        // Circular background
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, 45, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#00A859';
        ctx.stroke();

        // Stamp Text
        ctx.font = 'bold 10px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#00A859';
        ctx.textAlign = 'center';
        ctx.fillText('OFICIAL', badgeX, badgeY - 12);

        ctx.font = '900 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('VALIDADO', badgeX, badgeY + 4);

        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#DC2626';
        ctx.fillText('2026', badgeX, badgeY + 18);

        ctx.restore();

        // Return Data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        resolve(dataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => reject(err);

    if (typeof fileOrBase64 === 'string') {
      img.src = fileOrBase64;
      if (img.complete) processImage();
      else img.onload = processImage;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
        img.onload = processImage;
      };
      reader.readAsDataURL(fileOrBase64);
    }
  });
}
