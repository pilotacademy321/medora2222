export const IMAGING_PORTAL_ENABLED =
  process.env.IMAGING_PORTAL_ENABLED === 'true';

export const IMAGING_PORTAL_DISABLED_CODE = 'IMAGING_PORTAL_DISABLED';

export const IMAGING_PORTAL_DISABLED_MESSAGE_AR =
  'بوابة الأشعة متوقفة مؤقتاً، وسيتم الإعلان عن عودتها لاحقاً.';

export const IMAGING_PORTAL_DISABLED_MESSAGE_EN =
  'The Imaging Portal is temporarily suspended and will return in a future announcement.';

const IMAGING_ROLE_IDENTIFIERS = new Set([
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
  if (IMAGING_ROLE_IDENTIFIERS.has(normalized)) return true;
  return (
    normalized.startsWith('imaging_') ||
    normalized.startsWith('radiology_') ||
    normalized.startsWith('imaging-') ||
    normalized.startsWith('radiology-')
  );
}

export function isImagingApiPath(pathname: string): boolean {
  const normalized = pathname.trim().toLowerCase();
  return (
    normalized === '/api/imaging' ||
    normalized.startsWith('/api/imaging/') ||
    normalized.startsWith('/api/imaging-') ||
    normalized === '/api/admin/imaging' ||
    normalized.startsWith('/api/admin/imaging/') ||
    normalized.startsWith('/api/admin/imaging-') ||
    normalized === '/api/patient/imaging' ||
    normalized.startsWith('/api/patient/imaging/') ||
    normalized.startsWith('/api/patient/imaging-') ||
    normalized === '/api/radiology' ||
    normalized.startsWith('/api/radiology/') ||
    normalized.startsWith('/api/radiology-') ||
    normalized === '/api/pacs' ||
    normalized.startsWith('/api/pacs/') ||
    normalized === '/api/dicom' ||
    normalized.startsWith('/api/dicom/')
  );
}

const ROLE_PAYLOAD_KEYS = [
  'portal',
  'portalType',
  'selectedPortal',
  'role',
  'accountType',
  'institutionType',
  'entityType',
  'folder',
] as const;

export function hasImagingRolePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const obj = payload as Record<string, unknown>;
  for (const key of ROLE_PAYLOAD_KEYS) {
    if (isImagingPortalIdentifier(obj[key])) {
      return true;
    }
  }
  return false;
}

export function buildImagingDisabledResponseBody() {
  return {
    ok: false,
    error: IMAGING_PORTAL_DISABLED_CODE,
    code: IMAGING_PORTAL_DISABLED_CODE,
    imagingPortalEnabled: IMAGING_PORTAL_ENABLED,
    message: IMAGING_PORTAL_DISABLED_MESSAGE_AR,
    messageEn: IMAGING_PORTAL_DISABLED_MESSAGE_EN,
  };
}
