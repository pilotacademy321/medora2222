import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import type {
  createFirestoreRestClient,
  FirestoreRestWrite,
  StructuredQueryFilter,
  StructuredQueryOrderBy,
} from './firestoreRest.ts';

type RestClient = ReturnType<typeof createFirestoreRestClient>;

function stripDocMeta(data: Record<string, unknown> | null): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const copy = { ...data };
  delete copy._docId;
  return copy;
}

function generateAutoDocId(): string {
  return crypto.randomBytes(12).toString('hex');
}

export function createFirestoreCompat(
  restDb: RestClient,
  idToken?: string,
): Firestore {
  const makeDocRef = (docPath: string) => {
    const cleanPath = docPath.replace(/^\/+|\/+$/g, '');
    const parts = cleanPath.split('/').filter(Boolean);
    const id = parts[parts.length - 1] || '';

    const refObj = {
      id,
      path: cleanPath,
      async get() {
        const res = await restDb.getDocRaw(idToken, cleanPath);
        const stripped = stripDocMeta(res.data);
        return {
          exists: res.exists,
          id: res.id || id,
          ref: refObj,
          updateTime: res.updateTime,
          data: () => stripped,
        };
      },
      async set(data: Record<string, unknown>, options?: { merge?: boolean }) {
        const write = restDb.buildSmartSetWrite(cleanPath, data, {
          merge: Boolean(options?.merge),
        });
        await restDb.commitWrites(idToken, [write]);
      },
      async update(patch: Record<string, unknown>) {
        const write = restDb.buildSmartUpdateWrite(cleanPath, patch);
        await restDb.commitWrites(idToken, [write]);
      },
      async delete() {
        await restDb.commitWrites(idToken, [restDb.buildDeleteWrite(cleanPath)]);
      },
      collection(subName: string) {
        return makeCollectionRef(`${cleanPath}/${subName}`);
      },
    };

    return refObj;
  };

  const makeQuery = (
    collectionPath: string,
    filters: StructuredQueryFilter[] = [],
    orderByList: StructuredQueryOrderBy[] = [],
    limitCount?: number,
  ) => {
    const cleanCollection = collectionPath.replace(/^\/+|\/+$/g, '');
    const queryObj = {
      where(fieldPath: string, op: string, value: unknown) {
        return makeQuery(
          cleanCollection,
          [...filters, { fieldPath, op, value }],
          orderByList,
          limitCount,
        );
      },
      orderBy(fieldPath: string, direction: 'asc' | 'desc' = 'asc') {
        return makeQuery(
          cleanCollection,
          filters,
          [
            ...orderByList,
            {
              fieldPath,
              direction: direction === 'desc' ? 'DESCENDING' : 'ASCENDING',
            },
          ],
          limitCount,
        );
      },
      limit(count: number) {
        return makeQuery(cleanCollection, filters, orderByList, count);
      },
      async get() {
        const docsRaw = await restDb.runStructuredQuery(
          idToken,
          cleanCollection,
          filters,
          {
            orderBy: orderByList,
            limit: limitCount ?? 500,
          },
        );
        const docs = docsRaw.map((entry) => {
          const clean = stripDocMeta(entry.data) || {};
          const docRef = makeDocRef(`${cleanCollection}/${entry.id}`);
          return {
            id: entry.id,
            exists: true,
            ref: docRef,
            data: () => clean,
          };
        });
        return {
          docs,
          empty: docs.length === 0,
          size: docs.length,
          forEach: (cb: (docSnap: (typeof docs)[number]) => void) => {
            docs.forEach(cb);
          },
        };
      },
    };
    return queryObj;
  };

  const makeCollectionRef = (collectionPath: string) => {
    const cleanCollection = collectionPath.replace(/^\/+|\/+$/g, '');
    const baseQuery = makeQuery(cleanCollection);
    return {
      ...baseQuery,
      id: cleanCollection.split('/').pop() || cleanCollection,
      path: cleanCollection,
      doc(docId?: string) {
        const finalId = docId && docId.trim() ? docId.trim() : generateAutoDocId();
        return makeDocRef(`${cleanCollection}/${finalId}`);
      },
      async add(data: Record<string, unknown>) {
        const docRef = makeDocRef(`${cleanCollection}/${generateAutoDocId()}`);
        await docRef.set(data);
        return docRef;
      },
    };
  };

  const compat = {
    doc(docPath: string) {
      return makeDocRef(docPath);
    },
    collection(collectionPath: string) {
      return makeCollectionRef(collectionPath);
    },
    batch() {
      const writes: FirestoreRestWrite[] = [];
      const batchObj = {
        set(
          docRef: { path: string },
          data: Record<string, unknown>,
          options?: { merge?: boolean },
        ) {
          writes.push(
            restDb.buildSmartSetWrite(docRef.path, data, {
              merge: Boolean(options?.merge),
            }),
          );
          return batchObj;
        },
        update(docRef: { path: string }, patch: Record<string, unknown>) {
          writes.push(restDb.buildSmartUpdateWrite(docRef.path, patch));
          return batchObj;
        },
        delete(docRef: { path: string }) {
          writes.push(restDb.buildDeleteWrite(docRef.path));
          return batchObj;
        },
        async commit() {
          await restDb.commitWrites(idToken, writes);
          writes.length = 0;
        },
      };
      return batchObj;
    },
    async runTransaction<T>(
      updateFunction: (tx: {
        get: (target: unknown) => Promise<unknown>;
        set: (docRef: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => unknown;
        update: (docRef: { path: string }, patch: Record<string, unknown>) => unknown;
        delete: (docRef: { path: string }) => unknown;
      }) => Promise<T>,
    ): Promise<T> {
      const maxAttempts = 3;
      let lastError: unknown;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const readPreconditions = new Map<string, string | undefined>();
        const queuedWrites: FirestoreRestWrite[] = [];

        const tx = {
          async get(target: unknown) {
            if (target && typeof target === 'object' && 'path' in target && 'get' in target && !('where' in target)) {
              const docTarget = target as ReturnType<typeof makeDocRef>;
              const snap = await docTarget.get();
              if (!readPreconditions.has(docTarget.path)) {
                readPreconditions.set(
                  docTarget.path,
                  snap.exists ? snap.updateTime : '__NOT_EXISTS__',
                );
              }
              return snap;
            }
            if (target && typeof target === 'object' && 'get' in target) {
              return (target as { get: () => Promise<unknown> }).get();
            }
            throw new Error('INVALID_TRANSACTION_GET_TARGET');
          },
          set(
            docRef: { path: string },
            data: Record<string, unknown>,
            options?: { merge?: boolean },
          ) {
            const pre = readPreconditions.get(docRef.path);
            queuedWrites.push(
              restDb.buildSmartSetWrite(docRef.path, data, {
                merge: Boolean(options?.merge),
                ...(pre === '__NOT_EXISTS__'
                  ? { existsCondition: false }
                  : pre
                    ? { updateTimeCondition: pre }
                    : {}),
              }),
            );
            return tx;
          },
          update(docRef: { path: string }, patch: Record<string, unknown>) {
            const pre = readPreconditions.get(docRef.path);
            queuedWrites.push(
              restDb.buildSmartUpdateWrite(docRef.path, patch, {
                ...(pre && pre !== '__NOT_EXISTS__' ? { updateTimeCondition: pre } : {}),
              }),
            );
            return tx;
          },
          delete(docRef: { path: string }) {
            const pre = readPreconditions.get(docRef.path);
            queuedWrites.push(
              restDb.buildDeleteWrite(
                docRef.path,
                pre && pre !== '__NOT_EXISTS__' ? pre : undefined,
              ),
            );
            return tx;
          },
        };

        try {
          const result = await updateFunction(tx);
          if (queuedWrites.length > 0) {
            await restDb.commitWrites(idToken, queuedWrites);
          }
          return result;
        } catch (err) {
          lastError = err;
          const msg = err instanceof Error ? err.message : String(err);
          const retryable =
            msg.includes('(409)') || msg.includes('ABORTED') || msg.includes('FAILED_PRECONDITION');
          if (!retryable || attempt === maxAttempts) {
            throw err;
          }
        }
      }

      throw lastError;
    },
  };

  return compat as unknown as Firestore;
}
