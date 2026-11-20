import type { User } from 'firebase/auth';
import type { Language } from '../types/medora';

const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i;
const STRICT_AD_IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|webp)$/i;
const STRICT_STORAGE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_AD_ORIGINAL_BYTES = 5 * 1024 * 1024;
export const AD_TARGET_WIDTH = 1200;
export const AD_TARGET_HEIGHT = 600;
export const AD_DEFAULT_COMPRESSED_MAX_BYTES = 320 * 1024;

export function isProbablyImageFile(file: File): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  if (mime.startsWith('image/')) return true;
  return IMAGE_EXTENSION_REGEX.test(file.name || '');
}

export function normalizeStrictAdMime(file: File): string | null {
  const rawMime = (file.type || '').trim().toLowerCase();
  const normalized =
    rawMime === 'image/jpg' || rawMime === 'image/pjpeg' ? 'image/jpeg' : rawMime;

  if (STRICT_STORAGE_IMAGE_MIMES.has(normalized)) {
    return normalized;
  }
  if (!normalized && STRICT_AD_IMAGE_EXTENSION_REGEX.test(file.name || '')) {
    const nameLower = file.name.toLowerCase();
    if (nameLower.endsWith('.png')) return 'image/png';
    if (nameLower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  return null;
}

export interface PrepareImageOptions {
  maxBytes?: number;
  maxWidth?: number;
  defaultBaseName?: string;
}

export interface PreparedAdImageResult {
  file: File;
  width: number;
  height: number;
  originalSize: number;
  originalMimeType: string;
  wasUpscaled: boolean;
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => {
      if (el.naturalWidth <= 0 || el.naturalHeight <= 0) {
        reject(new Error('IMAGE_DECODE_FAILED'));
      } else {
        resolve(el);
      }
    };
    el.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
    el.src = objectUrl;
  });
}

function encodeCanvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mimeType, quality),
  );
}

/**
 * Prepares a MEDORA Ad image according to platform specifications:
 * - Strictly JPG, PNG, or WebP
 * - Original file size <= 5 MB
 * - Target dimensions up to 1200 x 600 px (2:1 ratio)
 * - NEVER upscales small source images (preserves crispness without distortion)
 * - Compresses output cleanly below maxBytes (default 320 KB for fast delivery & Firestore Asset compatibility)
 */
export async function prepareAdImageFile(
  file: File,
  options: { maxBytes?: number; defaultBaseName?: string } = {},
): Promise<PreparedAdImageResult> {
  const originalMimeType = normalizeStrictAdMime(file);
  if (!originalMimeType) {
    throw new Error('INVALID_AD_IMAGE_FORMAT');
  }
  if (file.size === 0) {
    throw new Error('IMAGE_DECODE_FAILED');
  }
  if (file.size > MAX_AD_ORIGINAL_BYTES) {
    throw new Error('AD_FILE_TOO_LARGE_5MB');
  }

  const maxBytes = options.maxBytes ?? AD_DEFAULT_COMPRESSED_MAX_BYTES;
  const defaultBaseName = options.defaultBaseName ?? 'medora_ad';
  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (srcW <= 0 || srcH <= 0) {
      throw new Error('IMAGE_DECODE_FAILED');
    }

    const srcRatio = srcW / srcH;

    // Determine exact 2:1 canvas dimensions WITHOUT upscaling the source pixels.
    let canvasW: number;
    let canvasH: number;
    let drawMode: 'cover' | 'contain_centered';
    let drawW = srcW;
    let drawH = srcH;

    if (srcW >= AD_TARGET_WIDTH && srcH >= AD_TARGET_HEIGHT && srcRatio >= 1.3 && srcRatio <= 3.0) {
      // Large landscape/wide image -> crisp 1200x600 2:1 center-crop (downscaled only)
      canvasW = AD_TARGET_WIDTH;
      canvasH = AD_TARGET_HEIGHT;
      drawMode = 'cover';
    } else if (Math.abs(srcRatio - 2) <= 0.15) {
      // Already ~2:1 (possibly smaller than 1200x600): never upscale small images
      canvasW = Math.min(AD_TARGET_WIDTH, srcW);
      canvasH = Math.max(1, Math.min(AD_TARGET_HEIGHT, Math.round(canvasW / 2)));
      drawMode = 'cover';
    } else {
      // Small or non-2:1 aspect image (e.g., 400x400 or portrait photo):
      // Keep source drawn at most 1:1 (fitScale <= 1) centered inside a balanced 2:1 canvas.
      const fitScale = Math.min(1, AD_TARGET_WIDTH / srcW, AD_TARGET_HEIGHT / srcH);
      drawW = Math.max(1, Math.round(srcW * fitScale));
      drawH = Math.max(1, Math.round(srcH * fitScale));
      canvasH = Math.min(AD_TARGET_HEIGHT, Math.max(drawH, Math.ceil(drawW / 2)));
      canvasW = Math.min(AD_TARGET_WIDTH, canvasH * 2);
      // Re-clamp draw sizes if canvasH/canvasW got constrained
      const innerScale = Math.min(1, canvasW / drawW, canvasH / drawH);
      drawW = Math.max(1, Math.round(drawW * innerScale));
      drawH = Math.max(1, Math.round(drawH * innerScale));
      drawMode = 'contain_centered';
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('IMAGE_DECODE_FAILED');
    }

    const renderFrame = (w: number, h: number) => {
      canvas.width = Math.max(2, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (drawMode === 'cover') {
        const scale = Math.max(canvas.width / srcW, canvas.height / srcH);
        const sW = canvas.width / scale;
        const sH = canvas.height / scale;
        const sx = Math.max(0, (srcW - sW) / 2);
        const sy = Math.max(0, (srcH - sH) / 2);
        ctx.fillStyle = '#040a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, sx, sy, sW, sH, 0, 0, canvas.width, canvas.height);
      } else {
        // Rich dark navy MEDORA backdrop + soft ambient blur of source + crisp unscaled centered subject
        const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        grad.addColorStop(0, '#040917');
        grad.addColorStop(0.5, '#071433');
        grad.addColorStop(1, '#040917');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.filter = 'blur(20px)';
        const bgScale = Math.max(canvas.width / srcW, canvas.height / srcH);
        const bgW = srcW * bgScale;
        const bgH = srcH * bgScale;
        ctx.drawImage(img, (canvas.width - bgW) / 2, (canvas.height - bgH) / 2, bgW, bgH);
        ctx.restore();

        const ratioScale = canvas.width / canvasW;
        const targetDrawW = Math.min(drawW, Math.round(drawW * ratioScale));
        const targetDrawH = Math.min(drawH, Math.round(drawH * ratioScale));
        const dx = Math.round((canvas.width - targetDrawW) / 2);
        const dy = Math.round((canvas.height - targetDrawH) / 2);
        ctx.drawImage(img, dx, dy, targetDrawW, targetDrawH);
      }
    };

    renderFrame(canvasW, canvasH);

    // Use WebP when original was WebP (or PNG transparency benefit) and fall back to JPEG
    const outputMime =
      originalMimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';

    let quality = 0.86;
    let blob = await encodeCanvasBlob(canvas, outputMime, quality);

    while (blob && blob.size > maxBytes && quality > 0.5) {
      quality = Number((quality - 0.08).toFixed(2));
      blob = await encodeCanvasBlob(canvas, outputMime, quality);
    }

    // If still above maxBytes on dense photos, step down dimensions proportionally preserving exact 2:1
    let currentW = canvas.width;
    let currentH = canvas.height;
    while (blob && blob.size > maxBytes && currentW > 600) {
      currentW = Math.max(600, Math.round(currentW * 0.82));
      currentH = Math.max(300, Math.round(currentW / 2));
      renderFrame(currentW, currentH);
      blob = await encodeCanvasBlob(canvas, outputMime, 0.74);
    }

    if (!blob || blob.size === 0) {
      throw new Error('IMAGE_DECODE_FAILED');
    }
    if (blob.size > maxBytes && outputMime !== 'image/jpeg') {
      // Fallback to JPEG if WebP encoding exceeded cap
      quality = 0.76;
      blob = await encodeCanvasBlob(canvas, 'image/jpeg', quality);
    }
    if (!blob || blob.size > 4.5 * 1024 * 1024) {
      throw new Error('AD_IMAGE_TOO_LARGE_AFTER_COMPRESSION');
    }

    const finalMime = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const ext = finalMime === 'image/webp' ? 'webp' : 'jpg';
    const rawBase = file.name.replace(/\.[^/.]+$/, '').trim() || defaultBaseName;
    const preparedFile = new File([blob], `${rawBase}.${ext}`, { type: finalMime });

    return {
      file: preparedFile,
      width: canvas.width,
      height: canvas.height,
      originalSize: file.size,
      originalMimeType,
      wasUpscaled: false,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Normalizes any phone/desktop image (including HEIC/AVIF/PNG/screenshots/empty MIME)
 * into a crisp, web-ready JPEG/WebP file sized well under server & Firebase Storage limits.
 */
export async function prepareNormalizedImageFile(
  file: File,
  options: PrepareImageOptions = {},
): Promise<File> {
  if (!isProbablyImageFile(file)) {
    throw new Error('INVALID_IMAGE_TYPE');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('FILE_TOO_LARGE');
  }

  const maxBytes = options.maxBytes ?? 900 * 1024;
  const maxWidth = options.maxWidth ?? 1600;
  const defaultBaseName = options.defaultBaseName ?? 'medora_image';
  const normalizedMime =
    file.type.trim().toLowerCase() === 'image/jpg'
      ? 'image/jpeg'
      : file.type.trim().toLowerCase();

  if (
    STRICT_STORAGE_IMAGE_MIMES.has(normalizedMime) &&
    file.size <= maxBytes &&
    normalizedMime !== 'image/png'
  ) {
    if (file.type === normalizedMime) return file;
    return new File([file], file.name || `${defaultBaseName}.jpg`, {
      type: normalizedMime,
    });
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);

    let targetWidth = img.width > maxWidth ? maxWidth : img.width;
    let targetHeight = Math.max(
      1,
      Math.round((img.height * targetWidth) / Math.max(1, img.width)),
    );

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (STRICT_STORAGE_IMAGE_MIMES.has(normalizedMime) && file.size <= 4.5 * 1024 * 1024) {
        return file;
      }
      throw new Error('FILE_TOO_LARGE');
    }

    const drawScaled = (w: number, h: number) => {
      canvas.width = Math.max(1, Math.round(w));
      canvas.height = Math.max(1, Math.round(h));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };

    drawScaled(targetWidth, targetHeight);

    const targetMime =
      normalizedMime === 'image/webp' ? 'image/webp' : 'image/jpeg';

    let quality = 0.86;
    let blob = await encodeCanvasBlob(canvas, targetMime, quality);

    while (blob && blob.size > maxBytes && quality > 0.5) {
      quality -= 0.1;
      blob = await encodeCanvasBlob(canvas, targetMime, quality);
    }

    while (blob && blob.size > maxBytes && targetWidth > 800) {
      targetWidth = Math.round(targetWidth * 0.78);
      targetHeight = Math.max(
        1,
        Math.round((img.height * targetWidth) / Math.max(1, img.width)),
      );
      drawScaled(targetWidth, targetHeight);
      blob = await encodeCanvasBlob(canvas, targetMime, 0.75);
    }

    if (!blob || blob.size > 4.5 * 1024 * 1024) {
      throw new Error('FILE_TOO_LARGE');
    }

    const ext = targetMime === 'image/webp' ? 'webp' : 'jpg';
    const rawBase = file.name.replace(/\.[^/.]+$/, '').trim() || defaultBaseName;
    return new File([blob], `${rawBase}.${ext}`, { type: targetMime });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = typeof reader.result === 'string' ? reader.result : '';
      if (!res) reject(new Error('FILE_READ_FAILED'));
      else resolve(res);
    };
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

export function isValidStorageImageUrl(
  url: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  const cleanUrl = (url || '').trim();
  const cleanPath = (storagePath || '').trim();
  if (!cleanUrl.startsWith('https://') || cleanUrl.startsWith('data:')) {
    return false;
  }
  return (
    cleanPath.startsWith('medora_uploads/') ||
    cleanUrl.includes('firebasestorage.googleapis.com') ||
    cleanUrl.includes('firebasestorage.app') ||
    cleanUrl.includes('storage.googleapis.com')
  );
}

/**
 * Validates either a Firebase Storage HTTPS image URL OR a MEDORA compressed asset URL (/api/ads/assets/:assetId).
 */
export function isValidAdImageUrlClient(
  url: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  const cleanUrl = (url || '').trim();
  const cleanPath = (storagePath || '').trim();
  if (!cleanUrl || cleanUrl.startsWith('data:')) {
    return false;
  }

  const assetMatch = cleanUrl.match(/^\/api\/ads\/assets\/([a-zA-Z0-9_-]{4,120})$/);
  if (assetMatch) {
    const assetId = assetMatch[1];
    if (cleanPath) {
      return cleanPath === `firestore_assets/${assetId}`;
    }
    return true;
  }

  return isValidStorageImageUrl(cleanUrl, cleanPath);
}

export function isValidUploadedAssetUrlClient(
  url: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  const cleanUrl = (url || '').trim();
  const cleanPath = (storagePath || '').trim();
  if (!cleanUrl || cleanUrl.startsWith('data:')) {
    return false;
  }

  const mediaMatch = cleanUrl.match(
    /^\/api\/media\/(public|private)\/([a-zA-Z0-9_-]{4,120})$/,
  );
  if (mediaMatch) {
    const assetId = mediaMatch[2];
    if (cleanPath) {
      return cleanPath === `medora_media_assets/${assetId}`;
    }
    return true;
  }

  return isValidAdImageUrlClient(cleanUrl, cleanPath);
}

export async function prepareUploadPayloadFromFile(
  file: File,
  options: {
    kind: 'avatar' | 'image' | 'clinical_doc';
    defaultBaseName?: string;
  },
): Promise<{
  preparedFile: File;
  dataBase64: string;
  mimeType: string;
  fileName: string;
}> {
  if (options.kind === 'clinical_doc' && file.type === 'application/pdf') {
    if (file.size === 0) throw new Error('EMPTY_FILE_DATA');
    if (file.size > 10 * 1024 * 1024) throw new Error('FILE_TOO_LARGE');
    const dataBase64 = await fileToDataUrl(file);
    return {
      preparedFile: file,
      dataBase64,
      mimeType: 'application/pdf',
      fileName: file.name || `${options.defaultBaseName || 'document'}.pdf`,
    };
  }

  if (options.kind === 'clinical_doc' && !isProbablyImageFile(file)) {
    throw new Error('INVALID_DOC_TYPE');
  }

  const preparedFile = await prepareNormalizedImageFile(file, {
    maxBytes: options.kind === 'avatar' ? 420 * 1024 : 580 * 1024,
    maxWidth: options.kind === 'avatar' ? 720 : 1400,
    defaultBaseName: options.defaultBaseName || options.kind,
  });

  const dataBase64 = await fileToDataUrl(preparedFile);
  return {
    preparedFile,
    dataBase64,
    mimeType: preparedFile.type || 'image/jpeg',
    fileName: preparedFile.name,
  };
}

export function isPrivateMediaUrl(url: string | undefined | null): boolean {
  return typeof url === 'string' && url.trim().startsWith('/api/media/private/');
}

export async function fetchProtectedMediaObjectUrl(
  firebaseUser: User | null,
  url: string,
): Promise<{ objectUrl: string; revoke: boolean }> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    throw new Error('EMPTY_FILE_URL');
  }
  if (!isPrivateMediaUrl(cleanUrl)) {
    return { objectUrl: cleanUrl, revoke: false };
  }
  if (!firebaseUser) {
    throw new Error('UNAUTHENTICATED');
  }
  const token = await firebaseUser.getIdToken();
  const res = await fetch(cleanUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'MEDIA_FETCH_FAILED');
  }
  const blob = await res.blob();
  return {
    objectUrl: URL.createObjectURL(blob),
    revoke: true,
  };
}

export async function openProtectedMediaFile(
  firebaseUser: User | null,
  url: string,
  fileName?: string,
): Promise<void> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) return;

  if (!isPrivateMediaUrl(cleanUrl)) {
    const a = document.createElement('a');
    a.href = cleanUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  const { objectUrl, revoke } = await fetchProtectedMediaObjectUrl(
    firebaseUser,
    cleanUrl,
  );
  const a = document.createElement('a');
  a.href = objectUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (fileName) {
    a.download = fileName;
  }
  document.body.appendChild(a);
  a.click();
  a.remove();

  if (revoke) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Ignore cleanup failures
      }
    }, 60_000);
  }
}

export function mapUploadErrorMessage(err: unknown, language: Language): string {
  const code = err instanceof Error ? err.message : String(err || '');

  if (
    code === 'INVALID_IMAGE_TYPE' ||
    code === 'INVALID_IMAGE_BYTES' ||
    code === 'INVALID_AD_IMAGE_FORMAT'
  ) {
    return language === 'ar'
      ? 'صيغة الصورة غير مدعومة. الصيغ المقبولة هي JPG أو PNG أو WebP.'
      : 'Unsupported image format. Accepted formats are JPG, PNG, and WebP.';
  }
  if (code === 'INVALID_DOC_TYPE') {
    return language === 'ar'
      ? 'نوع الملف غير مدعوم. يُقبل فقط PDF أو صور JPG / PNG / WebP.'
      : 'Unsupported file type. Only PDF or JPG / PNG / WebP images are accepted.';
  }
  if (code === 'IMAGE_DECODE_FAILED' || code === 'EMPTY_IMAGE_DATA' || code === 'EMPTY_FILE_DATA') {
    return language === 'ar'
      ? 'تعذر قراءة الملف أو الملف فارغ/تالف. يرجى اختيار ملف صالح.'
      : 'Could not read this file or the file is empty/corrupted.';
  }
  if (code === 'PDF_TOO_LARGE_WITHOUT_STORAGE_BUCKET') {
    return language === 'ar'
      ? 'حجم ملف PDF يتجاوز حد التخزين الاحتياطي الحالي (680 KB) قبل تفعيل Firebase Storage. يمكنك ضغط ملف PDF أو رفع صورة للتقرير.'
      : 'PDF exceeds the 680 KB fallback limit while Firebase Storage bucket is inactive. Please compress the PDF or upload an image.';
  }
  if (code === 'AD_FILE_TOO_LARGE_5MB') {
    return language === 'ar'
      ? 'حجم الصورة الأصلية يتجاوز الحد الأقصى المسموح به (5 MB). يرجى اختيار صورة أصغر.'
      : 'Original image exceeds the maximum allowed size of 5 MB. Please choose a smaller file.';
  }
  if (
    code === 'FILE_TOO_LARGE' ||
    code === 'DOC_TOO_LARGE' ||
    code === 'AVATAR_TOO_LARGE' ||
    code === 'AD_IMAGE_TOO_LARGE_AFTER_COMPRESSION'
  ) {
    return language === 'ar'
      ? 'حجم الملف كبير جداً حتى بعد الضغط. يرجى اختيار ملف أصغر.'
      : 'File is too large even after compression. Please pick a smaller file.';
  }
  if (code === 'AD_DIMENSIONS_EXCEED_1200X600') {
    return language === 'ar'
      ? 'أبعاد الصورة تتجاوز الحد المستهدف (1200 × 600 بكسل).'
      : 'Image dimensions exceed 1200 × 600 px.';
  }
  if (code === 'AD_ASPECT_RATIO_MUST_BE_2_TO_1') {
    return language === 'ar'
      ? 'يجب أن تكون نسبة أبعاد صورة الإعلان 2:1 (مثل 1200 × 600 بكسل).'
      : 'Ad image aspect ratio must be 2:1 (e.g., 1200 × 600 px).';
  }
  if (code === 'STORAGE_BUCKET_NOT_INITIALIZED') {
    return language === 'ar'
      ? 'حاوية Firebase Storage غير مفعّلة بعد في مشروع Firebase.'
      : 'Firebase Storage bucket is not initialized yet in this Firebase project.';
  }
  if (code === 'STORAGE_UNAVAILABLE') {
    return language === 'ar'
      ? 'خدمة التخزين غير متاحة حالياً من الخادم. يرجى المحاولة بعد قليل.'
      : 'Storage service is currently unavailable. Please try again shortly.';
  }
  if (code === 'AD_STORAGE_IMAGE_REQUIRED' || code === 'INVALID_BANNER_STORAGE_URL') {
    return language === 'ar'
      ? 'يرجى رفع صورة صالحة للإعلان قبل الحفظ.'
      : 'Please upload a valid ad image before saving.';
  }
  if (
    code === 'PROMO_BANNER_STORAGE_UPLOAD_FAILED' ||
    code === 'AD_STORAGE_UPLOAD_FAILED' ||
    code === 'FILE_UPLOAD_FAILED' ||
    code === 'MEDIA_UPLOAD_FAILED' ||
    code === 'AVATAR_UPLOAD_FAILED'
  ) {
    return language === 'ar'
      ? 'تعذر رفع الملف عبر الخادم. تأكد من اتصالك وأعد المحاولة.'
      : 'Failed to upload file via server. Check your connection and retry.';
  }
  if (code === 'UNAUTHENTICATED') {
    return language === 'ar'
      ? 'انتهت جلسة تسجيل الدخول. يرجى تحديث الصفحة أو إعادة الدخول.'
      : 'Your session expired. Please refresh or sign in again.';
  }
  if (code === 'FORBIDDEN') {
    return language === 'ar'
      ? 'ليس لديك صلاحية للوصول إلى هذا الملف.'
      : 'You do not have permission to access this file.';
  }
  if (code === 'PATIENT_OR_COMPLAINT_REQUIRED') {
    return language === 'ar'
      ? 'يرجى اختيار المريض وإدخال الشكوى الرئيسية أو سبب الزيارة.'
      : 'Please select a patient and enter the chief complaint or visit reason.';
  }
  if (code === 'AD_DATE_RANGE_INVALID') {
    return language === 'ar'
      ? 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له.'
      : 'End date must be on or after the start date.';
  }
  if (code === 'AD_EXPIRED_EXTEND_DATE_FIRST') {
    return language === 'ar'
      ? 'لا يمكن نشر إعلان تاريخ نهايته في الماضي. يرجى تحديث تاريخ الانتهاء أو حفظه كمسودة/منتهي.'
      : 'Cannot publish an ad whose end date is in the past. Update the end date or save as draft/expired.';
  }
  if (code === 'APPROVED_ENTITY_NOT_FOUND') {
    return language === 'ar'
      ? 'الجهة المختارة غير موجودة أو غير معتمدة حالياً في النظام.'
      : 'Selected entity is not found or not currently approved.';
  }
  if (code === 'MISSING_REQUIRED_AD_FIELDS' || code === 'INVALID_AD_PAYLOAD') {
    return language === 'ar'
      ? 'يرجى اختيار القسم والجهة المعتمدة ورفع صورة الإعلان أولاً.'
      : 'Please select a category, an approved provider, and upload an ad image first.';
  }
  if (code === 'SUPER_ADMIN_ONLY' || code === 'ADMIN_ACCESS_DENIED') {
    return language === 'ar'
      ? 'هذه العملية محصورة بحساب المشرف العام (Super Admin) فقط.'
      : 'This action is restricted to Super Admin only.';
  }
  return language === 'ar'
    ? 'حدث خطأ أثناء رفع أو حفظ الملف؛ لم يتم فقدان بياناتك.'
    : 'An error occurred while uploading or saving the file; your data was preserved.';
}
