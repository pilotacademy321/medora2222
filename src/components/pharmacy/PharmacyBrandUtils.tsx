import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Pill } from 'lucide-react';

export function formatIqd(val: number, isAr: boolean): string {
  return `${Math.round(val || 0).toLocaleString()} ${isAr ? 'د.ع' : 'IQD'}`;
}

export function buildPublicStorefrontUrl(slugOrUid: string): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('pharmacyStore', slugOrUid);
  return url.toString();
}

export async function preparePharmacyImageUpload(
  file: File,
  maxDimension = 1200,
): Promise<{ dataBase64: string; mimeType: string; fileName: string }> {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const mime = allowedTypes.has(file.type) ? file.type : 'image/jpeg';

  // Read original data URL
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('IMAGE_READ_FAILED'));
    reader.readAsDataURL(file);
  });

  // Resize/compress smoothly when > 380KB or exceeding maxDimension so Firestore & Storage both accept fast
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('INVALID_IMAGE_FILE'));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const rawB64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return { dataBase64: rawB64, mimeType: mime, fileName: file.name || 'pharmacy-image.jpg' };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const outMime = file.type === 'image/png' && file.size <= 350 * 1024 ? 'image/png' : 'image/jpeg';
  let encoded = canvas.toDataURL(outMime, 0.86);
  if (encoded.length > 620 * 1024) {
    encoded = canvas.toDataURL('image/jpeg', 0.72);
  }
  const base64Body = encoded.includes(',') ? encoded.split(',')[1] : encoded;
  return {
    dataBase64: base64Body,
    mimeType: encoded.startsWith('data:image/png') ? 'image/png' : 'image/jpeg',
    fileName: file.name || 'pharmacy-media.jpg',
  };
}

export function PharmacyQrCodeCanvas({
  value,
  size = 136,
}: {
  value: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !value) return;
    void QRCode.toCanvas(canvas, value, {
      width: size,
      margin: 1,
      color: {
        dark: '#0c3585',
        light: '#FFFFFF',
      },
    });
  }, [value, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700"
    />
  );
}

export function PharmacyLogoAvatar({
  logoUrl,
  name,
  sizeClass = 'h-12 w-12',
}: {
  logoUrl?: string;
  name: string;
  sizeClass?: string;
}) {
  const initials = (name || 'PH')
    .replace(/^صيدلية\s+/i, '')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${sizeClass} shrink-0 rounded-2xl border border-[#d9a43b]/40 bg-white object-cover shadow-xs`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-2xl border border-[#d9a43b]/40 bg-gradient-to-br from-[#0c3585] to-[#1346ad] font-bold text-[#f4d378] shadow-xs`}
    >
      <span className="text-sm">{initials || <Pill className="h-5 w-5" />}</span>
    </div>
  );
}
