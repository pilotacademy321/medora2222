import crypto from 'node:crypto';
import type { App as AdminApp } from 'firebase-admin/app';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;
export type MedoraUploadFolder =
  | 'avatars'
  | 'doctor_docs'
  | 'lab_docs'
  | 'lab_results'
  | 'lab_files'
  | 'pharmacy_docs'
  | 'pharmacy_media'
  | 'pharmacy_imports'
  | 'wholesaler_docs'
  | 'wholesaler_media'
  | 'wholesaler_imports'
  | 'doctor_banners'
  | 'clinic_photos'
  | 'patient_records'
  | 'diagnostic_results'
  | 'message_files'
  | 'admin_ads';

export type MediaAssetVisibility = 'public' | 'private';

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const ALLOWED_ASSET_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const PUBLIC_FOLDERS = new Set<MedoraUploadFolder>([
  'avatars',
  'clinic_photos',
  'admin_ads',
  'doctor_banners',
  'pharmacy_media',
]);

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_DOC_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_AD_IMAGE_INPUT_BYTES = MAX_IMAGE_BYTES;
export const MAX_FIRESTORE_AD_ASSET_BYTES = 350 * 1024;
export const MAX_FIRESTORE_MEDIA_ASSET_BYTES = 680 * 1024;

export interface ResolvedBucketInfo {
  bucket: StorageBucket | null;
  bucketName: string;
  bucketExists: boolean;
  candidatesChecked: string[];
}

const bucketProbeCache = new Map<
  string,
  { bucketName: string; bucketExists: boolean; candidatesChecked: string[]; checkedAt: number }
>();

const POSITIVE_PROBE_TTL_MS = 10 * 60 * 1000;
const NEGATIVE_PROBE_TTL_MS = 15 * 1000;

export function isPublicMediaFolder(folder: MedoraUploadFolder): boolean {
  return PUBLIC_FOLDERS.has(folder);
}

function normalizeAssetMime(rawMime: string): string {
  const lower = rawMime.trim().toLowerCase();
  if (lower === 'image/jpg' || lower === 'image/pjpeg') return 'image/jpeg';
  if (lower === 'application/x-pdf') return 'application/pdf';
  return lower;
}

function hasValidImageMagicBytes(buf: Buffer, mimeType: string): boolean {
  if (buf.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function hasValidPdfMagicBytes(buf: Buffer): boolean {
  if (buf.length < 5) return false;
  return buf.subarray(0, 5).toString('ascii') === '%PDF-';
}

function detectAssetMimeFromMagicBytes(buf: Buffer, allowPdf: boolean): string | null {
  if (hasValidImageMagicBytes(buf, 'image/jpeg')) return 'image/jpeg';
  if (hasValidImageMagicBytes(buf, 'image/png')) return 'image/png';
  if (hasValidImageMagicBytes(buf, 'image/webp')) return 'image/webp';
  if (allowPdf && hasValidPdfMagicBytes(buf)) return 'application/pdf';
  return null;
}

export function resolveStorageBucket(
  adminApp: AdminApp,
  configuredBucketName?: string,
): StorageBucket {
  const storage = getStorage(adminApp);
  if (configuredBucketName && configuredBucketName.trim()) {
    return storage.bucket(configuredBucketName.trim());
  }
  return storage.bucket();
}

export async function probeAndResolveStorageBucket(
  adminApp: AdminApp,
  configuredBucketName: string | undefined,
  projectId: string,
  forceRefresh = false,
): Promise<ResolvedBucketInfo> {
  const candidates = Array.from(
    new Set(
      [
        configuredBucketName?.trim() || '',
        projectId ? `${projectId}.firebasestorage.app` : '',
        projectId ? `${projectId}.appspot.com` : '',
      ].filter(Boolean),
    ),
  );

  const cacheKey = candidates.join('|') || 'default';
  const cached = bucketProbeCache.get(cacheKey);
  const now = Date.now();
  if (cached && !forceRefresh) {
    const ttl = cached.bucketExists ? POSITIVE_PROBE_TTL_MS : NEGATIVE_PROBE_TTL_MS;
    if (now - cached.checkedAt < ttl) {
      const storage = getStorage(adminApp);
      return {
        bucket: cached.bucketName ? storage.bucket(cached.bucketName) : null,
        bucketName: cached.bucketName,
        bucketExists: cached.bucketExists,
        candidatesChecked: cached.candidatesChecked,
      };
    }
  }

  const storage = getStorage(adminApp);
  for (const name of candidates) {
    try {
      const bucket = storage.bucket(name);
      const [exists] = await bucket.exists();
      if (exists) {
        bucketProbeCache.set(cacheKey, {
          bucketName: name,
          bucketExists: true,
          candidatesChecked: candidates,
          checkedAt: now,
        });
        return {
          bucket,
          bucketName: name,
          bucketExists: true,
          candidatesChecked: candidates,
        };
      }
    } catch (err) {
      console.warn(`[MEDORA][StorageProbe] Error probing bucket "${name}":`, err);
    }
  }

  const fallbackName = candidates[0] || '';
  bucketProbeCache.set(cacheKey, {
    bucketName: fallbackName,
    bucketExists: false,
    candidatesChecked: candidates,
    checkedAt: now,
  });
  return {
    bucket: fallbackName ? storage.bucket(fallbackName) : null,
    bucketName: fallbackName,
    bucketExists: false,
    candidatesChecked: candidates,
  };
}

export function decodeAndValidateBase64Asset(params: {
  dataBase64: unknown;
  mimeType: unknown;
  fileName: unknown;
  allowPdf?: boolean;
  maxBytes?: number;
}):
  | {
      ok: true;
      buffer: Buffer;
      mimeType: string;
      safeName: string;
    }
  | { ok: false; error: string } {
  const allowPdf = Boolean(params.allowPdf);
  const maxBytes = params.maxBytes ?? (allowPdf ? MAX_DOC_INPUT_BYTES : MAX_IMAGE_BYTES);
  const rawData = typeof params.dataBase64 === 'string' ? params.dataBase64.trim() : '';
  if (!rawData) {
    return { ok: false, error: allowPdf ? 'EMPTY_FILE_DATA' : 'EMPTY_IMAGE_DATA' };
  }

  const dataUriMatch = rawData.match(
    /^data:((?:image|application)\/[a-z0-9+.-]+);base64,/i,
  );
  const rawMime = normalizeAssetMime(
    typeof params.mimeType === 'string' && params.mimeType.trim()
      ? params.mimeType
      : dataUriMatch?.[1] || '',
  );

  const base64Body = rawData.replace(
    /^data:(?:image|application)\/[a-z0-9+.-]+;base64,/i,
    '',
  );
  const buffer = Buffer.from(base64Body, 'base64');

  if (buffer.length === 0) {
    return { ok: false, error: allowPdf ? 'EMPTY_FILE_DATA' : 'EMPTY_IMAGE_DATA' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: 'FILE_TOO_LARGE' };
  }

  const allowedSet = allowPdf ? ALLOWED_ASSET_MIME : ALLOWED_IMAGE_MIME;
  const detectedMime = detectAssetMimeFromMagicBytes(buffer, allowPdf);
  const matchesExplicitMime =
    allowedSet.has(rawMime) &&
    (rawMime === 'application/pdf'
      ? allowPdf && hasValidPdfMagicBytes(buffer)
      : hasValidImageMagicBytes(buffer, rawMime));

  const resolvedMime = matchesExplicitMime ? rawMime : detectedMime;

  if (!resolvedMime || !allowedSet.has(resolvedMime)) {
    return {
      ok: false,
      error: allowPdf ? 'INVALID_DOC_TYPE' : 'INVALID_IMAGE_BYTES',
    };
  }

  const ext =
    resolvedMime === 'application/pdf'
      ? 'pdf'
      : resolvedMime === 'image/png'
        ? 'png'
        : resolvedMime === 'image/webp'
          ? 'webp'
          : 'jpg';
  const rawName =
    typeof params.fileName === 'string' && params.fileName.trim()
      ? params.fileName.trim()
      : `asset.${ext}`;
  const safeName =
    rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || `asset.${ext}`;

  return {
    ok: true,
    buffer,
    mimeType: resolvedMime,
    safeName,
  };
}

export function decodeAndValidateBase64Image(params: {
  dataBase64: unknown;
  mimeType: unknown;
  fileName: unknown;
}) {
  return decodeAndValidateBase64Asset({
    ...params,
    allowPdf: false,
    maxBytes: MAX_IMAGE_BYTES,
  });
}

export function decodeAndValidateBase64BulkImportFile(params: {
  dataBase64: unknown;
  mimeType: unknown;
  fileName: unknown;
  maxBytes?: number;
}):
  | {
      ok: true;
      buffer: Buffer;
      mimeType: string;
      safeName: string;
    }
  | { ok: false; error: string } {
  const maxBytes = params.maxBytes ?? MAX_DOC_INPUT_BYTES;
  const rawData = typeof params.dataBase64 === 'string' ? params.dataBase64.trim() : '';
  if (!rawData) {
    return { ok: false, error: 'EMPTY_IMPORT_FILE' };
  }

  const dataUriMatch = rawData.match(
    /^data:([a-z0-9.+/-]+);base64,/i,
  );
  const rawMime = normalizeAssetMime(
    typeof params.mimeType === 'string' && params.mimeType.trim()
      ? params.mimeType
      : dataUriMatch?.[1] || '',
  );
  const base64Body = rawData.replace(
    /^data:[a-z0-9.+/-]+;base64,/i,
    '',
  );
  const buffer = Buffer.from(base64Body, 'base64');
  if (buffer.length === 0) {
    return { ok: false, error: 'EMPTY_IMPORT_FILE' };
  }
  if (buffer.length > maxBytes) {
    return { ok: false, error: 'FILE_TOO_LARGE' };
  }

  const rawName =
    typeof params.fileName === 'string' && params.fileName.trim()
      ? params.fileName.trim()
      : 'import_catalog.xlsx';
  const lowerName = rawName.toLowerCase();

  let resolvedMime = rawMime;
  if (lowerName.endsWith('.xlsx')) {
    const isZip =
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04;
    if (!isZip) return { ok: false, error: 'INVALID_XLSX_BYTES' };
    resolvedMime =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else if (lowerName.endsWith('.xls')) {
    const isCfbf =
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0;
    if (!isCfbf) return { ok: false, error: 'INVALID_XLS_BYTES' };
    resolvedMime = 'application/vnd.ms-excel';
  } else if (lowerName.endsWith('.pdf') || rawMime === 'application/pdf') {
    if (!hasValidPdfMagicBytes(buffer)) {
      return { ok: false, error: 'INVALID_PDF_BYTES' };
    }
    resolvedMime = 'application/pdf';
  } else if (lowerName.endsWith('.json') || rawMime === 'application/json') {
    if (buffer.includes(0)) return { ok: false, error: 'INVALID_JSON_BYTES' };
    const trimmed = buffer.toString('utf8').replace(/^\uFEFF/, '').trim();
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      return { ok: false, error: 'INVALID_JSON_BYTES' };
    }
    resolvedMime = 'application/json';
  } else if (
    lowerName.endsWith('.csv') ||
    rawMime === 'text/csv' ||
    rawMime === 'text/plain' ||
    rawMime === 'application/csv'
  ) {
    if (buffer.includes(0)) return { ok: false, error: 'INVALID_CSV_BYTES' };
    resolvedMime = 'text/csv';
  } else {
    return { ok: false, error: 'UNSUPPORTED_IMPORT_FILE_TYPE' };
  }

  const safeName =
    rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'import_catalog';
  return {
    ok: true,
    buffer,
    mimeType: resolvedMime,
    safeName,
  };
}

export function isValidAdAssetId(assetId: unknown): assetId is string {
  return typeof assetId === 'string' && /^[a-zA-Z0-9_-]{4,120}$/.test(assetId);
}

export const isValidMediaAssetId = isValidAdAssetId;

export function generateSafeAdAssetId(): string {
  const rand = crypto.randomBytes(6).toString('hex');
  return `adimg_${Date.now()}_${rand}`;
}

export function generateSafeMediaAssetId(folder: MedoraUploadFolder): string {
  const prefix = folder.replace(/[^a-z]/gi, '').slice(0, 6) || 'med';
  const rand = crypto.randomBytes(6).toString('hex');
  return `med_${prefix}_${Date.now()}_${rand}`;
}

export async function uploadImageBufferToStorage(params: {
  bucket: StorageBucket;
  ownerUid: string;
  folder: MedoraUploadFolder;
  buffer: Buffer;
  mimeType: string;
  safeName: string;
}): Promise<{ url: string; storagePath: string; size: number; mimeType: string }> {
  const safeUid = params.ownerUid.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUid) {
    throw new Error('INVALID_STORAGE_OWNER');
  }

  const storagePath = `medora_uploads/${safeUid}/${params.folder}/${Date.now()}_${params.safeName}`;
  const downloadToken = crypto.randomUUID();
  const file = params.bucket.file(storagePath);

  await file.save(params.buffer, {
    resumable: false,
    validation: false,
    metadata: {
      contentType: params.mimeType,
      cacheControl: isPublicMediaFolder(params.folder)
        ? 'public, max-age=31536000'
        : 'private, max-age=3600',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        uploadedByUid: safeUid,
      },
    },
  });

  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    params.bucket.name,
  )}/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(
    downloadToken,
  )}`;

  return {
    url,
    storagePath,
    size: params.buffer.length,
    mimeType: params.mimeType,
  };
}

export async function storeUploadedMediaAsset(params: {
  adminDb: Firestore | null;
  bucketInfo: ResolvedBucketInfo | null;
  hasServiceCredentials: boolean;
  ownerUid: string;
  folder: MedoraUploadFolder;
  buffer: Buffer;
  mimeType: string;
  safeName: string;
  meta?: {
    doctorUid?: string;
    labUid?: string;
    patientRecordId?: string;
    labPatientUid?: string;
    conversationId?: string;
  };
}): Promise<{
  url: string;
  storagePath: string;
  storageMode: 'firebase_storage' | 'firestore_asset';
  size: number;
  mimeType: string;
  visibility: MediaAssetVisibility;
}> {
  const visibility: MediaAssetVisibility = isPublicMediaFolder(params.folder)
    ? 'public'
    : 'private';

  if (
    params.bucketInfo?.bucket &&
    params.bucketInfo.bucketExists &&
    params.hasServiceCredentials
  ) {
    const uploaded = await uploadImageBufferToStorage({
      bucket: params.bucketInfo.bucket,
      ownerUid: params.ownerUid,
      folder: params.folder,
      buffer: params.buffer,
      mimeType: params.mimeType,
      safeName: params.safeName,
    });
    return {
      ...uploaded,
      storageMode: 'firebase_storage',
      visibility,
    };
  }

  if (!params.adminDb) {
    throw new Error('STORAGE_UNAVAILABLE');
  }

  if (params.buffer.length > MAX_FIRESTORE_MEDIA_ASSET_BYTES) {
    if (params.mimeType === 'application/pdf') {
      throw new Error('PDF_TOO_LARGE_WITHOUT_STORAGE_BUCKET');
    }
    throw new Error('FILE_TOO_LARGE');
  }

  const assetId = generateSafeMediaAssetId(params.folder);
  const storagePath = `medora_media_assets/${assetId}`;
  const url =
    visibility === 'public'
      ? `/api/media/public/${assetId}`
      : `/api/media/private/${assetId}`;

  await params.adminDb.doc(storagePath).set({
    assetId,
    visibility,
    ownerUid: params.ownerUid,
    folder: params.folder,
    contentType: params.mimeType,
    size: params.buffer.length,
    fileName: params.safeName,
    dataBase64: params.buffer.toString('base64'),
    doctorUid: (params.meta?.doctorUid || '').slice(0, 128),
    labUid: (params.meta?.labUid || '').slice(0, 128),
    patientRecordId: (params.meta?.patientRecordId || '').slice(0, 128),
    labPatientUid: (params.meta?.labPatientUid || '').slice(0, 128),
    conversationId: (params.meta?.conversationId || '').slice(0, 128),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    url,
    storagePath,
    storageMode: 'firestore_asset',
    size: params.buffer.length,
    mimeType: params.mimeType,
    visibility,
  };
}

export async function deleteStorageObjectSafe(
  bucket: StorageBucket | null,
  storagePath: string | undefined | null,
): Promise<void> {
  if (!bucket || !storagePath || typeof storagePath !== 'string') return;
  const trimmed = storagePath.trim();
  if (!trimmed.startsWith('medora_uploads/') || trimmed.includes('..')) {
    return;
  }
  try {
    await bucket.file(trimmed).delete({ ignoreNotFound: true });
  } catch (err) {
    console.warn('[MEDORA][StorageDelete] Non-fatal cleanup warning:', err);
  }
}

export async function deleteStoredMediaAssetSafe(params: {
  adminDb: Firestore | null;
  bucket: StorageBucket | null;
  storagePath: string | undefined | null;
  expectedFolderPrefix?: MedoraUploadFolder;
}): Promise<void> {
  const raw = typeof params.storagePath === 'string' ? params.storagePath.trim() : '';
  if (!raw || raw.includes('..')) return;

  if (raw.startsWith('medora_media_assets/')) {
    const assetId = raw.slice('medora_media_assets/'.length).trim();
    if (!isValidMediaAssetId(assetId) || !params.adminDb) return;
    try {
      const ref = params.adminDb.doc(`medora_media_assets/${assetId}`);
      if (params.expectedFolderPrefix) {
        const snap = await ref.get();
        if (!snap.exists) return;
        if (snap.data()?.folder !== params.expectedFolderPrefix) return;
      }
      await ref.delete();
    } catch (err) {
      console.warn('[MEDORA][MediaAssetDelete] Non-fatal cleanup warning:', err);
    }
    return;
  }

  if (raw.startsWith('medora_uploads/')) {
    if (
      params.expectedFolderPrefix &&
      !raw.includes(`/${params.expectedFolderPrefix}/`)
    ) {
      return;
    }
    await deleteStorageObjectSafe(params.bucket, raw);
  }
}

export function isValidFirebaseStorageImageUrl(
  imageUrl: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  if (typeof imageUrl !== 'string') return false;
  const trimmed = imageUrl.trim();
  if (!trimmed || !trimmed.startsWith('https://')) return false;
  if (trimmed.startsWith('data:')) return false;

  const isFirebaseHost =
    trimmed.includes('firebasestorage.googleapis.com') ||
    trimmed.includes('firebasestorage.app') ||
    trimmed.includes('storage.googleapis.com');
  const hasValidStoragePath =
    typeof storagePath === 'string' &&
    storagePath.trim().startsWith('medora_uploads/') &&
    !storagePath.includes('..');

  return isFirebaseHost || hasValidStoragePath;
}

export function isValidAdImageUrl(
  imageUrl: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  if (typeof imageUrl !== 'string') return false;
  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return false;

  const assetMatch = trimmed.match(/^\/api\/ads\/assets\/([a-zA-Z0-9_-]{4,120})$/);
  if (assetMatch) {
    const assetId = assetMatch[1];
    if (typeof storagePath === 'string' && storagePath.trim()) {
      return storagePath.trim() === `firestore_assets/${assetId}`;
    }
    return true;
  }

  const publicMediaMatch = trimmed.match(
    /^\/api\/media\/public\/([a-zA-Z0-9_-]{4,120})$/,
  );
  if (publicMediaMatch) {
    const assetId = publicMediaMatch[1];
    if (typeof storagePath === 'string' && storagePath.trim()) {
      return storagePath.trim() === `medora_media_assets/${assetId}`;
    }
    return true;
  }

  return isValidFirebaseStorageImageUrl(trimmed, storagePath);
}

export function isValidUploadedAssetUrl(
  assetUrl: string | undefined | null,
  storagePath?: string | undefined | null,
): boolean {
  if (typeof assetUrl !== 'string') return false;
  const trimmed = assetUrl.trim();
  if (!trimmed || trimmed.startsWith('data:')) return false;

  const mediaMatch = trimmed.match(
    /^\/api\/media\/(public|private)\/([a-zA-Z0-9_-]{4,120})$/,
  );
  if (mediaMatch) {
    const assetId = mediaMatch[2];
    if (typeof storagePath === 'string' && storagePath.trim()) {
      return storagePath.trim() === `medora_media_assets/${assetId}`;
    }
    return true;
  }

  return isValidAdImageUrl(trimmed, storagePath);
}

export async function syncDoctorAvatarAcrossCollections(params: {
  db: Firestore;
  doctorUid: string;
  avatarUrl: string;
  avatarPath: string;
}): Promise<void> {
  const { db, doctorUid, avatarUrl, avatarPath } = params;
  const batch = db.batch();

  const userRef = db.doc(`users/${doctorUid}`);
  const userSnap = await userRef.get().catch(() => null);
  if (userSnap?.exists) {
    batch.update(userRef, {
      avatarUrl,
      avatarPath,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const cardRef = db.doc(`doctor_public_cards/${doctorUid}`);
  const cardSnap = await cardRef.get().catch(() => null);
  if (cardSnap?.exists) {
    batch.update(cardRef, {
      avatarUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Sync any super-admin ads referencing this doctor if needed
  const adsSnap = await db
    .collection('medora_ads')
    .where('doctorUid', '==', doctorUid)
    .limit(20)
    .get()
    .catch(() => null);
  if (adsSnap && !adsSnap.empty) {
    for (const adDoc of adsSnap.docs) {
      batch.update(adDoc.ref, {
        doctorAvatarUrl: avatarUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  await batch.commit();
}
