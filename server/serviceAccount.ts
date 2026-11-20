export type ServiceAccountStatus =
  | 'ready'
  | 'missing'
  | 'invalid_json'
  | 'project_mismatch';

export interface ValidatedServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

export interface ParsedServiceAccountResult {
  ok: boolean;
  status: ServiceAccountStatus;
  projectId?: string;
  credential?: ValidatedServiceAccount;
  safeReason?: string;
}

function tryJsonParseObject(candidate: string): Record<string, unknown> | null {
  try {
    const first: unknown = JSON.parse(candidate);
    if (typeof first === 'string') {
      const nested: unknown = JSON.parse(first);
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
      }
      return null;
    }
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseAndValidateServiceAccount(
  rawValue: string | undefined,
  expectedProjectId: string,
): ParsedServiceAccountResult {
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!trimmed) {
    return {
      ok: false,
      status: 'missing',
      safeReason: 'FIREBASE_SERVICE_ACCOUNT_JSON is not set',
    };
  }

  let parsed = tryJsonParseObject(trimmed);

  // Support accidental single/double outer quote wrappers cleanly without touching valid raw JSON
  if (
    !parsed &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) &&
    trimmed.length > 2
  ) {
    const unwrapped = trimmed.slice(1, -1).trim();
    parsed = tryJsonParseObject(unwrapped);
  }

  if (!parsed) {
    return {
      ok: false,
      status: 'invalid_json',
      safeReason: 'FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as valid JSON',
    };
  }

  const projectId =
    typeof parsed.project_id === 'string' ? parsed.project_id.trim() : '';
  const clientEmail =
    typeof parsed.client_email === 'string' ? parsed.client_email.trim() : '';
  const rawPrivateKey =
    typeof parsed.private_key === 'string' ? parsed.private_key : '';

  if (!projectId || !clientEmail || !rawPrivateKey) {
    return {
      ok: false,
      status: 'invalid_json',
      safeReason:
        'Service account JSON is missing required fields (project_id, client_email, private_key)',
    };
  }

  if (projectId !== expectedProjectId) {
    return {
      ok: false,
      status: 'project_mismatch',
      projectId,
      safeReason: `Service account project_id (${projectId}) does not match expected project (${expectedProjectId})`,
    };
  }

  const normalizedKey = rawPrivateKey.includes('\\n')
    ? rawPrivateKey.replace(/\\n/g, '\n')
    : rawPrivateKey;

  return {
    ok: true,
    status: 'ready',
    projectId,
    credential: {
      ...parsed,
      project_id: projectId,
      client_email: clientEmail,
      private_key: normalizedKey,
    },
  };
}

export interface SuperAdminEnvPolicy {
  allowedEmails: Set<string>;
  envConfigured: boolean;
  envIncludesAuthorized: boolean;
  ignoredNonAuthorizedCount: number;
}

export function resolveSuperAdminAllowlist(
  rawEnv: string | undefined,
  canonicalEmail: string,
): SuperAdminEnvPolicy {
  const canonicalLower = canonicalEmail.trim().toLowerCase();
  const entries = (rawEnv || '')
    .split(/[,\s;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return {
    allowedEmails: new Set([canonicalLower]),
    envConfigured: entries.length > 0,
    envIncludesAuthorized: entries.includes(canonicalLower),
    ignoredNonAuthorizedCount: entries.filter((e) => e !== canonicalLower).length,
  };
}
