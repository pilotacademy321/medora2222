import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreClient(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId,
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreClient();
export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxUploadRetryTime = 5000;
storage.maxOperationRetryTime = 5000;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

let persistenceReadyPromise: Promise<void> | null = null;

export function ensureAuthPersistence(): Promise<void> {
  if (!persistenceReadyPromise) {
    persistenceReadyPromise = (async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        try {
          await setPersistence(auth, browserSessionPersistence);
        } catch {
          await setPersistence(auth, inMemoryPersistence).catch(() => undefined);
        }
      }
    })();
  }
  return persistenceReadyPromise;
}

if (typeof window !== 'undefined') {
  void ensureAuthPersistence();
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  errorCode?: string | null;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    errorCode,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isAuthOrTransientNetworkError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error || '').toLowerCase();
  return (
    code === 'auth/network-request-failed' ||
    code === 'unavailable' ||
    msg.includes('auth/network-request-failed') ||
    msg.includes('fetching auth token failed') ||
    msg.includes('the client is offline')
  );
}

async function testConnection() {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  try {
    await ensureAuthPersistence();
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady().catch(() => undefined);
    }
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isAuthOrTransientNetworkError(error)) {
      // Retry once after transient startup auth-token/network hiccup
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
        return;
      } catch (retryErr) {
        if (isAuthOrTransientNetworkError(retryErr)) {
          console.warn(
            '[MEDORA][Firebase] Firestore connection probe skipped: client/auth network temporarily unavailable.',
          );
        }
        return;
      }
    }
  }
}

void testConnection();
