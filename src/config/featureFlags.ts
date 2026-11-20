import type { Language } from '../types/medora';

export const CLIENT_IMAGING_PORTAL_ENABLED =
  import.meta.env.VITE_IMAGING_PORTAL_ENABLED === 'true';

export const IMAGING_PORTAL_DISABLED_CODE = 'IMAGING_PORTAL_DISABLED';

export const IMAGING_PORTAL_DISABLED_MESSAGE_AR =
  'بوابة الأشعة متوقفة مؤقتاً، وسيتم الإعلان عن عودتها لاحقاً.';

export const IMAGING_PORTAL_DISABLED_MESSAGE_EN =
  'The Imaging Portal is temporarily suspended and will return in a future announcement.';

export function getImagingPortalDisabledMessage(language: Language): string {
  return language === 'ar'
    ? IMAGING_PORTAL_DISABLED_MESSAGE_AR
    : IMAGING_PORTAL_DISABLED_MESSAGE_EN;
}

export function resolveImagingPortalEnabled(serverFlag?: boolean): boolean {
  return Boolean(CLIENT_IMAGING_PORTAL_ENABLED && serverFlag === true);
}

const IMAGING_IDENTIFIERS = new Set([
  'imaging',
  'imaging_center',
  'imaging_staff',
  'imaging_admin',
  'imaging_portal',
  'imaging_operator',
  'radiology',
  'radiology_center',
  'radiology_staff',
  'radiology_admin',
  'pacs',
  'dicom',
]);

export function isImagingPortalIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (IMAGING_IDENTIFIERS.has(normalized)) return true;
  return (
    normalized.startsWith('imaging_') ||
    normalized.startsWith('radiology_') ||
    normalized.startsWith('imaging-') ||
    normalized.startsWith('radiology-')
  );
}

export function isImagingRouteLocation(
  pathname: string,
  search = '',
  hash = '',
): boolean {
  const normPath = pathname.trim().toLowerCase();
  if (
    normPath === '/imaging' ||
    normPath.startsWith('/imaging/') ||
    normPath === '/imaging-portal' ||
    normPath.startsWith('/imaging-portal/') ||
    normPath === '/imaging-center' ||
    normPath.startsWith('/imaging-center/') ||
    normPath === '/radiology' ||
    normPath.startsWith('/radiology/') ||
    normPath === '/pacs' ||
    normPath.startsWith('/pacs/')
  ) {
    return true;
  }

  try {
    const params = new URLSearchParams(search);
    const portalParam =
      params.get('portal') ||
      params.get('portalType') ||
      params.get('role') ||
      params.get('accountType');
    if (isImagingPortalIdentifier(portalParam)) {
      return true;
    }
  } catch {
    // Ignore malformed query string
  }

  const normHash = hash.trim().toLowerCase();
  if (
    normHash.startsWith('#/imaging') ||
    normHash.startsWith('#imaging') ||
    normHash.startsWith('#/radiology') ||
    normHash.startsWith('#radiology')
  ) {
    return true;
  }

  return false;
}
