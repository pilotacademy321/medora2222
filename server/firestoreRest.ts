import { Timestamp } from 'firebase-admin/firestore';

export type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreRestDocument {
  name?: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export type FirestoreRestTransform =
  | { fieldPath: string; setToServerValue: 'REQUEST_TIME' }
  | { fieldPath: string; increment: FirestoreValue }
  | { fieldPath: string; appendMissingElements: { values: FirestoreValue[] } };

export interface FirestoreRestWrite {
  update?: {
    name: string;
    fields: Record<string, FirestoreValue>;
  };
  delete?: string;
  updateMask?: {
    fieldPaths: string[];
  };
  currentDocument?: {
    exists?: boolean;
    updateTime?: string;
  };
  updateTransforms?: FirestoreRestTransform[];
}

export interface StructuredQueryFilter {
  fieldPath: string;
  op: string;
  value: unknown;
}

export interface StructuredQueryOrderBy {
  fieldPath: string;
  direction?: 'ASCENDING' | 'DESCENDING';
}

export function getSentinelType(
  val: unknown,
):
  | { kind: 'serverTimestamp' }
  | { kind: 'increment'; operand: number }
  | { kind: 'delete' }
  | { kind: 'arrayUnion'; elements: unknown[] }
  | null {
  if (!val || typeof val !== 'object') return null;
  const protoName = Object.getPrototypeOf(val)?.constructor?.name || '';
  if (protoName === 'ServerTimestampTransform') {
    return { kind: 'serverTimestamp' };
  }
  if (protoName === 'NumericIncrementTransform' && 'operand' in val) {
    return { kind: 'increment', operand: Number((val as { operand: unknown }).operand) || 0 };
  }
  if (protoName === 'DeleteTransform') {
    return { kind: 'delete' };
  }
  if (protoName === 'ArrayUnionTransform' && 'elements' in val) {
    const elems = (val as { elements: unknown }).elements;
    return { kind: 'arrayUnion', elements: Array.isArray(elems) ? elems : [] };
  }
  return null;
}

export function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (val instanceof Timestamp) {
    return { timestampValue: val.toDate().toISOString() };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return { doubleValue: 0 };
    }
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (Array.isArray(val)) {
    return val.length > 0
      ? { arrayValue: { values: val.map(toFirestoreValue) } }
      : { arrayValue: {} };
  }
  if (typeof val === 'object') {
    if (typeof (val as { toDate?: unknown }).toDate === 'function') {
      try {
        return { timestampValue: (val as { toDate: () => Date }).toDate().toISOString() };
      } catch {
        return { nullValue: null };
      }
    }
    return { mapValue: { fields: toFirestoreFields(val as Record<string, unknown>) } };
  }
  return { stringValue: String(val) };
}

export function toFirestoreFields(
  obj: Record<string, unknown>,
): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined && !getSentinelType(value)) {
      fields[key] = toFirestoreValue(value);
    }
  }
  return fields;
}

export function fromFirestoreValue(val: FirestoreValue): unknown {
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('stringValue' in val) return val.stringValue;
  if ('referenceValue' in val) return val.referenceValue;
  if ('geoPointValue' in val) return val.geoPointValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    return fromFirestoreFields(val.mapValue.fields);
  }
  return null;
}

export function fromFirestoreFields(
  fields?: Record<string, FirestoreValue>,
): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = fromFirestoreValue(value);
  }
  return out;
}

function mapOperator(op: string): string {
  switch (op) {
    case '==':
      return 'EQUAL';
    case '!=':
      return 'NOT_EQUAL';
    case '<':
      return 'LESS_THAN';
    case '<=':
      return 'LESS_THAN_OR_EQUAL';
    case '>':
      return 'GREATER_THAN';
    case '>=':
      return 'GREATER_THAN_OR_EQUAL';
    case 'in':
      return 'IN';
    case 'not-in':
      return 'NOT_IN';
    case 'array-contains':
      return 'ARRAY_CONTAINS';
    case 'array-contains-any':
      return 'ARRAY_CONTAINS_ANY';
    default:
      return 'EQUAL';
  }
}

function extractSentinelsAndPrepare(
  obj: Record<string, unknown>,
  prefix = '',
): {
  cleanData: Record<string, unknown>;
  transforms: FirestoreRestTransform[];
  deletedPaths: string[];
  presentFieldPaths: string[];
} {
  const cleanData: Record<string, unknown> = {};
  const transforms: FirestoreRestTransform[] = [];
  const deletedPaths: string[] = [];
  const presentFieldPaths: string[] = [];

  for (const [rawKey, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    const fullPath = prefix ? `${prefix}.${rawKey}` : rawKey;
    const sentinel = getSentinelType(value);
    if (sentinel) {
      if (sentinel.kind === 'serverTimestamp') {
        transforms.push({ fieldPath: fullPath, setToServerValue: 'REQUEST_TIME' });
      } else if (sentinel.kind === 'increment') {
        transforms.push({ fieldPath: fullPath, increment: toFirestoreValue(sentinel.operand) });
      } else if (sentinel.kind === 'arrayUnion') {
        transforms.push({
          fieldPath: fullPath,
          appendMissingElements: { values: sentinel.elements.map(toFirestoreValue) },
        });
      } else if (sentinel.kind === 'delete') {
        deletedPaths.push(fullPath);
      }
      continue;
    }

    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !(value instanceof Timestamp) &&
      typeof (value as { toDate?: unknown }).toDate !== 'function'
    ) {
      const nested = extractSentinelsAndPrepare(value as Record<string, unknown>, fullPath);
      cleanData[rawKey] = nested.cleanData;
      transforms.push(...nested.transforms);
      deletedPaths.push(...nested.deletedPaths);
      if (Object.keys(nested.cleanData).length > 0) {
        presentFieldPaths.push(...nested.presentFieldPaths);
      } else if (nested.transforms.length === 0 && nested.deletedPaths.length === 0) {
        presentFieldPaths.push(fullPath);
      }
    } else {
      cleanData[rawKey] = value;
      presentFieldPaths.push(fullPath);
    }
  }

  return { cleanData, transforms, deletedPaths, presentFieldPaths };
}

function setNestedObjectValue(target: Record<string, unknown>, dottedPath: string, value: unknown) {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let curr: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!curr[part] || typeof curr[part] !== 'object' || Array.isArray(curr[part])) {
      curr[part] = {};
    }
    curr = curr[part] as Record<string, unknown>;
  }
  curr[parts[parts.length - 1]] = value;
}

export function createFirestoreRestClient(
  projectId: string,
  databaseId?: string,
  apiKey?: string,
) {
  const dbId = databaseId || '(default)';
  const encodedRoot = `projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}`;
  const rawRoot = `projects/${projectId}/databases/${dbId}`;
  const baseUrl = `https://firestore.googleapis.com/v1/${encodedRoot}`;

  const cleanDocPath = (docPath: string) =>
    docPath
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);

  const docResourceName = (docPath: string) =>
    `${rawRoot}/documents/${cleanDocPath(docPath).join('/')}`;

  const docUrl = (docPath: string) =>
    `${baseUrl}/documents/${cleanDocPath(docPath).map(encodeURIComponent).join('/')}`;

  const extractDocId = (name?: string) => {
    if (!name) return '';
    const idx = name.lastIndexOf('/');
    return idx >= 0 ? name.slice(idx + 1) : name;
  };

  const withAuth = (url: string, idToken?: string): { url: string; headers: Record<string, string> } => {
    const headers: Record<string, string> = {};
    const cleanToken = typeof idToken === 'string' ? idToken.trim() : '';
    if (cleanToken) {
      headers.Authorization = `Bearer ${cleanToken}`;
      return { url, headers };
    }
    if (apiKey) {
      const sep = url.includes('?') ? '&' : '?';
      return { url: `${url}${sep}key=${encodeURIComponent(apiKey)}`, headers };
    }
    return { url, headers };
  };

  async function getDocRaw(
    idToken: string | undefined,
    docPath: string,
  ): Promise<{
    exists: boolean;
    id: string;
    data: Record<string, unknown> | null;
    updateTime?: string;
  }> {
    const target = withAuth(docUrl(docPath), idToken);
    const resp = await fetch(target.url, { headers: target.headers });
    const parts = cleanDocPath(docPath);
    const fallbackId = parts[parts.length - 1] || '';
    if (resp.status === 404) {
      return { exists: false, id: fallbackId, data: null };
    }
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`FIRESTORE_REST_GET_FAILED (${resp.status}): ${errText}`);
    }
    const payload = (await resp.json()) as FirestoreRestDocument;
    const id = extractDocId(payload.name) || fallbackId;
    return {
      exists: true,
      id,
      data: {
        ...fromFirestoreFields(payload.fields),
        _docId: id,
      },
      updateTime: payload.updateTime,
    };
  }

  async function getDoc(
    idToken: string | undefined,
    docPath: string,
  ): Promise<Record<string, unknown> | null> {
    const res = await getDocRaw(idToken, docPath);
    return res.data;
  }

  async function listCollection(
    idToken: string | undefined,
    collectionName: string,
    options?: { limit?: number; orderByDescField?: string },
  ): Promise<Record<string, unknown>[]> {
    const pageSize = Math.min(options?.limit ?? 100, 500);
    const buildUrl = (orderByField?: string) => {
      const params = new URLSearchParams();
      params.set('pageSize', String(pageSize));
      if (orderByField) {
        params.set('orderBy', `${orderByField} desc`);
      }
      return `${baseUrl}/documents/${encodeURIComponent(collectionName)}?${params.toString()}`;
    };

    const req1 = withAuth(buildUrl(options?.orderByDescField), idToken);
    let resp = await fetch(req1.url, { headers: req1.headers });

    if (!resp.ok && options?.orderByDescField && resp.status === 400) {
      const req2 = withAuth(buildUrl(undefined), idToken);
      resp = await fetch(req2.url, { headers: req2.headers });
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`FIRESTORE_REST_LIST_FAILED (${resp.status}): ${errText}`);
    }

    const payload = (await resp.json()) as {
      documents?: FirestoreRestDocument[];
    };
    const rows: Record<string, unknown>[] = (payload.documents || []).map((doc) => ({
      ...fromFirestoreFields(doc.fields),
      _docId: extractDocId(doc.name),
    }));

    if (options?.orderByDescField) {
      const field = options.orderByDescField;
      rows.sort((a, b) => {
        const av = typeof a[field] === 'string' ? Date.parse(a[field] as string) : 0;
        const bv = typeof b[field] === 'string' ? Date.parse(b[field] as string) : 0;
        return (Number.isFinite(bv) ? bv : 0) - (Number.isFinite(av) ? av : 0);
      });
    }

    return rows;
  }

  async function commitWrites(
    idToken: string | undefined,
    writes: FirestoreRestWrite[],
  ): Promise<void> {
    if (writes.length === 0) return;
    // Chunk at 400 writes per batch to respect Firestore 500-write transaction/batch limits
    for (let i = 0; i < writes.length; i += 400) {
      const chunk = writes.slice(i, i + 400);
      const target = withAuth(`${baseUrl}/documents:commit`, idToken);
      const resp = await fetch(target.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...target.headers,
        },
        body: JSON.stringify({ writes: chunk }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`FIRESTORE_REST_COMMIT_FAILED (${resp.status}): ${errText}`);
      }
    }
  }

  function buildSmartSetWrite(
    docPath: string,
    data: Record<string, unknown>,
    options?: {
      merge?: boolean;
      serverTimestampFields?: string[];
      existsCondition?: boolean;
      updateTimeCondition?: string;
    },
  ): FirestoreRestWrite {
    const rawCopy: Record<string, unknown> = { ...data };
    for (const tsField of options?.serverTimestampFields || []) {
      delete rawCopy[tsField];
    }
    const { cleanData, transforms, deletedPaths, presentFieldPaths } =
      extractSentinelsAndPrepare(rawCopy);

    for (const tsField of options?.serverTimestampFields || []) {
      if (!transforms.some((t) => t.fieldPath === tsField)) {
        transforms.push({ fieldPath: tsField, setToServerValue: 'REQUEST_TIME' });
      }
    }

    const maskPaths = Array.from(new Set([...presentFieldPaths, ...deletedPaths]));

    return {
      update: {
        name: docResourceName(docPath),
        fields: toFirestoreFields(cleanData),
      },
      ...(options?.merge
        ? { updateMask: { fieldPaths: maskPaths } }
        : deletedPaths.length > 0
          ? { updateMask: { fieldPaths: maskPaths } }
          : {}),
      ...(options?.updateTimeCondition
        ? { currentDocument: { updateTime: options.updateTimeCondition } }
        : options?.existsCondition !== undefined
          ? { currentDocument: { exists: options.existsCondition } }
          : {}),
      ...(transforms.length > 0 ? { updateTransforms: transforms } : {}),
    };
  }

  function buildSmartUpdateWrite(
    docPath: string,
    patchData: Record<string, unknown>,
    options?: {
      serverTimestampFields?: string[];
      updateTimeCondition?: string;
    },
  ): FirestoreRestWrite {
    // Expand dotted keys (e.g., 'stats.count': 5) into nested objects for REST update
    const expanded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patchData)) {
      if (v === undefined) continue;
      if (k.includes('.')) {
        setNestedObjectValue(expanded, k, v);
      } else {
        expanded[k] = v;
      }
    }
    for (const tsField of options?.serverTimestampFields || []) {
      delete expanded[tsField];
    }
    const { cleanData, transforms, deletedPaths, presentFieldPaths } =
      extractSentinelsAndPrepare(expanded);

    for (const tsField of options?.serverTimestampFields || []) {
      if (!transforms.some((t) => t.fieldPath === tsField)) {
        transforms.push({ fieldPath: tsField, setToServerValue: 'REQUEST_TIME' });
      }
    }

    const fieldPaths = Array.from(new Set([...presentFieldPaths, ...deletedPaths]));

    return {
      update: {
        name: docResourceName(docPath),
        fields: toFirestoreFields(cleanData),
      },
      updateMask: { fieldPaths },
      currentDocument: options?.updateTimeCondition
        ? { updateTime: options.updateTimeCondition }
        : { exists: true },
      ...(transforms.length > 0 ? { updateTransforms: transforms } : {}),
    };
  }

  function buildCreateWrite(
    docPath: string,
    data: Record<string, unknown>,
    serverTimestampFields: string[] = ['createdAt', 'updatedAt'],
    existsCondition?: boolean,
  ): FirestoreRestWrite {
    return buildSmartSetWrite(docPath, data, {
      merge: false,
      serverTimestampFields,
      existsCondition,
    });
  }

  function buildUpdateWrite(
    docPath: string,
    patchData: Record<string, unknown>,
    serverTimestampFields: string[] = ['updatedAt'],
  ): FirestoreRestWrite {
    return buildSmartUpdateWrite(docPath, patchData, {
      serverTimestampFields,
    });
  }

  function buildDeleteWrite(
    docPath: string,
    updateTimeCondition?: string,
  ): FirestoreRestWrite {
    return {
      delete: docResourceName(docPath),
      ...(updateTimeCondition ? { currentDocument: { updateTime: updateTimeCondition } } : {}),
    };
  }

  async function runStructuredQuery(
    idToken: string | undefined,
    collectionName: string,
    filters: StructuredQueryFilter[] = [],
    options?: {
      orderBy?: StructuredQueryOrderBy[];
      limit?: number;
    },
  ): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const buildFilterPayload = (f: StructuredQueryFilter) => ({
      fieldFilter: {
        field: { fieldPath: f.fieldPath },
        op: mapOperator(f.op),
        value: toFirestoreValue(f.value),
      },
    });

    const wherePayload =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? buildFilterPayload(filters[0])
          : {
              compositeFilter: {
                op: 'AND',
                filters: filters.map(buildFilterPayload),
              },
            };

    const run = async (includeOrderBy: boolean) => {
      const structuredQuery: Record<string, unknown> = {
        from: [{ collectionId: collectionName }],
      };
      if (wherePayload) {
        structuredQuery.where = wherePayload;
      }
      if (includeOrderBy && options?.orderBy && options.orderBy.length > 0) {
        structuredQuery.orderBy = options.orderBy.map((o) => ({
          field: { fieldPath: o.fieldPath },
          direction: o.direction || 'ASCENDING',
        }));
      }
      if (typeof options?.limit === 'number' && options.limit > 0) {
        structuredQuery.limit = Math.min(options.limit, 5000);
      }
      const target = withAuth(`${baseUrl}/documents:runQuery`, idToken);
      return fetch(target.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...target.headers,
        },
        body: JSON.stringify({ structuredQuery }),
      });
    };

    let resp = await run(Boolean(options?.orderBy && options.orderBy.length > 0));
    let sortedInMemory = false;

    // Auto-fallback when a composite index isn't provisioned yet for where + orderBy
    if (!resp.ok && resp.status === 400 && options?.orderBy && options.orderBy.length > 0) {
      resp = await run(false);
      sortedInMemory = true;
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`FIRESTORE_REST_QUERY_FAILED (${resp.status}): ${errText}`);
    }

    const payload = (await resp.json()) as Array<{ document?: FirestoreRestDocument }>;
    const docs = payload
      .filter((row) => Boolean(row.document))
      .map((row): { id: string; data: Record<string, unknown> } => {
        const id = extractDocId(row.document?.name);
        return {
          id,
          data: {
            ...fromFirestoreFields(row.document?.fields),
            _docId: id,
          },
        };
      });

    if (sortedInMemory && options?.orderBy && options.orderBy.length > 0) {
      docs.sort((a, b) => {
        for (const ord of options.orderBy!) {
          const av = a.data[ord.fieldPath];
          const bv = b.data[ord.fieldPath];
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av ?? '').localeCompare(String(bv ?? ''));
          if (cmp !== 0) {
            return ord.direction === 'DESCENDING' ? -cmp : cmp;
          }
        }
        return 0;
      });
    }

    return docs;
  }

  async function queryByEquals(
    idToken: string | undefined,
    collectionName: string,
    fieldPath: string,
    value: string | boolean | number,
    limitCount = 25,
  ): Promise<Record<string, unknown>[]> {
    const docs = await runStructuredQuery(
      idToken,
      collectionName,
      [{ fieldPath, op: '==', value }],
      { limit: Math.max(1, Math.min(limitCount, 500)) },
    );
    return docs.map((d) => d.data);
  }

  return {
    docResourceName,
    getDocRaw,
    getDoc,
    listCollection,
    runStructuredQuery,
    queryByEquals,
    commitWrites,
    buildSmartSetWrite,
    buildSmartUpdateWrite,
    buildCreateWrite,
    buildUpdateWrite,
    buildDeleteWrite,
  };
}
