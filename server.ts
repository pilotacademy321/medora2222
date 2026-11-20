import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps, type App as AdminApp } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  createFirestoreRestClient,
  type FirestoreRestWrite,
} from './server/firestoreRest.ts';
import { createFirestoreCompat } from './server/firestoreCompat.ts';
import {
  parseAndValidateServiceAccount,
  resolveSuperAdminAllowlist,
} from './server/serviceAccount.ts';
import {
  createDoctorRouter,
  syncPublicDoctorCard,
} from './server/doctorRoutes.ts';
import { createPatientRouter } from './server/patientRoutes.ts';
import {
  createAdminLabsRouter,
  createLabRouter,
  isActiveLabMediaActor,
} from './server/labRoutes.ts';
import {
  createAdminHaneenRouter,
  createHaneenRouter,
} from './server/haneenRoutes.ts';
import { createSecretaryRouter } from './server/secretaryRoutes.ts';
import { createPharmacyRouter } from './server/pharmacyRoutes.ts';
import { createWholesalerRouter } from './server/wholesalerRoutes.ts';
import { createMedicineFinderRouter } from './server/medicineFinderRoutes.ts';
import { createAdminPharmacyWholesalerRouter } from './server/adminPharmacyWholesalerRoutes.ts';
import {
  ALLOWED_AD_ACTION_TYPES,
  ALLOWED_AD_ENTITY_TYPES,
  createAdsRouter,
  normalizeTargetPortals,
  type TargetedAdActionType,
  type TargetedAdEntityType,
} from './server/adsRoutes.ts';
import { createCommerceRouter } from './server/commerceRoutes.ts';
import { createMessagingRouter } from './server/messagingRoutes.ts';
import { HaneenStore } from './server/haneenStore.ts';
import { createPhoneRouter } from './server/phoneRoutes.ts';
import { createNotificationRouter } from './server/notificationRoutes.ts';
import {
  bindGlobalNotificationEngine,
  emitAdminNotification,
  getGlobalNotificationEngine,
  NotificationEngine,
} from './server/notificationEngine.ts';
import {
  hashPhoneKey,
  parseAndNormalizeIraqiPhone,
} from './server/iraqiPhone.ts';
import {
  emitPatientNotification,
  getBaghdadNow,
  recalculateDoctorRatingSummary,
} from './server/patientNotifications.ts';
import {
  decodeAndValidateBase64Asset,
  decodeAndValidateBase64Image,
  deleteStorageObjectSafe,
  generateSafeAdAssetId,
  isValidAdAssetId,
  isValidAdImageUrl,
  isValidMediaAssetId,
  MAX_AD_IMAGE_INPUT_BYTES,
  MAX_FIRESTORE_AD_ASSET_BYTES,
  probeAndResolveStorageBucket,
  resolveStorageBucket,
  storeUploadedMediaAsset,
  uploadImageBufferToStorage,
  type MedoraUploadFolder,
  type ResolvedBucketInfo,
  type StorageBucket,
} from './server/storageHelper.ts';
import {
  buildImagingDisabledResponseBody,
  hasImagingRolePayload,
  IMAGING_PORTAL_DISABLED_CODE,
  IMAGING_PORTAL_ENABLED,
  isImagingApiPath,
  isImagingPortalIdentifier,
} from './server/featureFlags.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTHORIZED_SUPER_ADMIN_EMAIL = 'aqbs250@gmail.com';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey?: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
}

const configPath = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig: FirebaseAppletConfig = JSON.parse(
  fs.readFileSync(configPath, 'utf-8'),
);

const restDb = createFirestoreRestClient(
  firebaseConfig.projectId,
  firebaseConfig.firestoreDatabaseId,
  firebaseConfig.apiKey,
);
const requestTokenStorage = new AsyncLocalStorage<string | undefined>();

const saResult = parseAndValidateServiceAccount(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
  firebaseConfig.projectId,
);

let hasServiceCredentials = false;
let adminApp: AdminApp;

if (getApps().length > 0) {
  adminApp = getApps()[0];
  hasServiceCredentials = saResult.ok;
} else if (saResult.ok && saResult.credential) {
  adminApp = initializeApp({
    credential: cert(saResult.credential as Record<string, string>),
    projectId: firebaseConfig.projectId,
    ...(firebaseConfig.storageBucket
      ? { storageBucket: firebaseConfig.storageBucket }
      : {}),
  });
  hasServiceCredentials = true;
} else {
  if (saResult.status === 'missing') {
    console.warn(
      '[MEDORA][AdminSDK] Disabled (missing): FIREBASE_SERVICE_ACCOUNT_JSON is not configured; using verified Firestore REST mode.',
    );
  } else {
    console.warn(
      `[MEDORA][AdminSDK] Disabled (${saResult.status}): ${saResult.safeReason}. Continuing in verified Firestore REST mode.`,
    );
  }
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId,
    ...(firebaseConfig.storageBucket
      ? { storageBucket: firebaseConfig.storageBucket }
      : {}),
  });
}

const adminAuth = getAuth(adminApp);
const adminDb = hasServiceCredentials
  ? firebaseConfig.firestoreDatabaseId
    ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(adminApp)
  : null;

function getEffectiveDb(): Firestore {
  if (adminDb && firestoreAdminReady) {
    return adminDb;
  }
  return createFirestoreCompat(restDb, requestTokenStorage.getStore());
}

function getStorageBucket(): StorageBucket | null {
  if (!hasServiceCredentials) return null;
  try {
    return resolveStorageBucket(adminApp, firebaseConfig.storageBucket);
  } catch (err) {
    console.warn('[MEDORA][StorageBucket] Failed to resolve bucket:', err);
    return null;
  }
}

async function resolveReadyStorageBucket(
  forceRefresh = false,
): Promise<ResolvedBucketInfo> {
  if (!hasServiceCredentials) {
    return {
      bucket: null,
      bucketName: firebaseConfig.storageBucket || '',
      bucketExists: false,
      candidatesChecked: [],
    };
  }
  return probeAndResolveStorageBucket(
    adminApp,
    firebaseConfig.storageBucket,
    firebaseConfig.projectId,
    forceRefresh,
  );
}

const startupAllowlistPolicy = resolveSuperAdminAllowlist(
  process.env.MEDORA_SUPER_ADMIN_EMAILS,
  AUTHORIZED_SUPER_ADMIN_EMAIL,
);
if (startupAllowlistPolicy.ignoredNonAuthorizedCount > 0) {
  console.warn(
    `[MEDORA][AuthPolicy] Ignored ${startupAllowlistPolicy.ignoredNonAuthorizedCount} non-authorized email entry(ies) in MEDORA_SUPER_ADMIN_EMAILS; enforcing ${AUTHORIZED_SUPER_ADMIN_EMAIL} only.`,
  );
}

function getAllowedSuperAdminEmails(): Set<string> {
  return resolveSuperAdminAllowlist(
    process.env.MEDORA_SUPER_ADMIN_EMAILS,
    AUTHORIZED_SUPER_ADMIN_EMAIL,
  ).allowedEmails;
}

let staleAdminsCleaned = false;
let startupProbeDone = false;
let firestoreAdminReady = Boolean(adminDb && hasServiceCredentials);
let authClaimsSupported = hasServiceCredentials;

function isInsufficientPermissionError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === '7' ||
    code === 'auth/insufficient-permission' ||
    code === 'permission-denied' ||
    msg.includes('insufficient permission') ||
    msg.includes('PERMISSION_DENIED')
  );
}

async function revokeUnauthorizedAdminRoles(): Promise<void> {
  if (staleAdminsCleaned || !adminDb || !firestoreAdminReady) return;
  staleAdminsCleaned = true;
  try {
    const snap = await adminDb.collection('admin_roles').get();
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const docEmail =
        typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
      if (docEmail !== AUTHORIZED_SUPER_ADMIN_EMAIL) {
        if (data?.active === true) {
          await docSnap.ref.update({
            active: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (authClaimsSupported) {
          try {
            const userRecord = await adminAuth.getUser(docSnap.id);
            const claims = userRecord.customClaims || {};
            if (
              claims.admin ||
              claims.superAdmin ||
              claims.super_admin ||
              claims.role === 'super_admin'
            ) {
              await adminAuth.setCustomUserClaims(docSnap.id, {});
            }
          } catch (claimErr) {
            if (isInsufficientPermissionError(claimErr)) {
              authClaimsSupported = false;
            }
          }
        }
      }
    }
  } catch (err) {
    if (isInsufficientPermissionError(err)) {
      firestoreAdminReady = false;
    } else {
      staleAdminsCleaned = false;
      console.error('Failed to clean unauthorized admin roles:', err);
    }
  }
}

async function ensureAuthorizedSuperAdminProvisioned(): Promise<void> {
  if (startupProbeDone) return;
  startupProbeDone = true;
  if (!adminDb || !hasServiceCredentials) {
    firestoreAdminReady = false;
    return;
  }

  try {
    await adminDb.collection('admin_roles').limit(1).get();
    firestoreAdminReady = true;
  } catch (probeErr) {
    if (isInsufficientPermissionError(probeErr)) {
      firestoreAdminReady = false;
      authClaimsSupported = false;
      return;
    }
    console.error('Firestore Admin probe error:', probeErr);
    return;
  }

  await revokeUnauthorizedAdminRoles();

  try {
    let userRecord = null;
    if (authClaimsSupported) {
      try {
        userRecord = await adminAuth.getUserByEmail(AUTHORIZED_SUPER_ADMIN_EMAIL);
      } catch (lookupErr) {
        if (isInsufficientPermissionError(lookupErr)) {
          authClaimsSupported = false;
        } else {
          const code =
            typeof lookupErr === 'object' && lookupErr !== null && 'code' in lookupErr
              ? String((lookupErr as { code?: unknown }).code)
              : '';
          if (code === 'auth/user-not-found') {
            userRecord = await adminAuth.createUser({
              email: AUTHORIZED_SUPER_ADMIN_EMAIL,
              emailVerified: true,
              displayName: 'MEDORA Super Admin',
            });
          } else {
            throw lookupErr;
          }
        }
      }
    }

    if (userRecord) {
      const uid = userRecord.uid;
      const claims = userRecord.customClaims || {};
      const hasClaims =
        claims.admin === true &&
        claims.superAdmin === true &&
        claims.super_admin === true &&
        claims.role === 'super_admin';
      if (!hasClaims && authClaimsSupported) {
        try {
          await adminAuth.setCustomUserClaims(uid, {
            admin: true,
            superAdmin: true,
            super_admin: true,
            role: 'super_admin',
          });
        } catch (claimErr) {
          if (isInsufficientPermissionError(claimErr)) {
            authClaimsSupported = false;
          } else {
            throw claimErr;
          }
        }
      }

      const roleRef = adminDb.doc(`admin_roles/${uid}`);
      const roleSnap = await roleRef.get();
      if (!roleSnap.exists) {
        await roleRef.set({
          uid,
          email: AUTHORIZED_SUPER_ADMIN_EMAIL,
          role: 'super_admin',
          active: true,
          grantedBy: 'server_policy_bootstrap',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const rData = roleSnap.data();
        if (
          rData?.active !== true ||
          rData?.role !== 'super_admin' ||
          rData?.email !== AUTHORIZED_SUPER_ADMIN_EMAIL
        ) {
          await roleRef.update({
            email: AUTHORIZED_SUPER_ADMIN_EMAIL,
            role: 'super_admin',
            active: true,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      const userRef = adminDb.doc(`users/${uid}`);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        await userRef.set({
          uid,
          email: AUTHORIZED_SUPER_ADMIN_EMAIL,
          googleName: userRecord.displayName || 'MEDORA Super Admin',
          photoUrl: userRecord.photoURL || '',
          avatarUrl: userRecord.photoURL || '',
          accountStatus: 'active',
          selectedPortal: 'none',
          registrationCompleted: true,
          personalProfileCompleted: true,
          createdAt: FieldValue.serverTimestamp(),
          lastLoginAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      const existingUsersSnap = await adminDb
        .collection('users')
        .where('email', '==', AUTHORIZED_SUPER_ADMIN_EMAIL)
        .limit(1)
        .get();
      if (!existingUsersSnap.empty) {
        const uDoc = existingUsersSnap.docs[0];
        const uid = uDoc.id;
        await adminDb.doc(`admin_roles/${uid}`).set(
          {
            uid,
            email: AUTHORIZED_SUPER_ADMIN_EMAIL,
            role: 'super_admin',
            active: true,
            grantedBy: 'server_policy_bootstrap',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }
  } catch (err) {
    if (isInsufficientPermissionError(err)) {
      firestoreAdminReady = false;
    } else {
      console.error('Failed to pre-provision authorized Super Admin:', err);
    }
  }
}

function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }
  if (val && typeof val === 'object') {
    const record = val as Record<string, unknown>;
    if (typeof record.toDate === 'function') {
      try {
        return (record.toDate as () => Date)().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

function serializeDocs(docs: FirebaseFirestore.QueryDocumentSnapshot[]): Record<string, unknown>[] {
  return docs.map((d) => serializeValue({ ...d.data(), _docId: d.id }) as Record<string, unknown>);
}

function stripInternalDocMeta(doc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!doc) return null;
  const copy = { ...doc };
  delete copy._docId;
  return copy;
}

type VerifyFailureReason =
  | 'UNAUTHENTICATED'
  | 'EMAIL_UNVERIFIED'
  | 'EMAIL_NOT_AUTHORIZED'
  | 'MISSING_MEDORA_SUPER_ADMIN_EMAILS'
  | 'ADMIN_SDK_UNAVAILABLE'
  | 'CLAIMS_REFRESH_REQUIRED'
  | 'ADMIN_ROLE_INACTIVE';

interface VerifiedAdminContext {
  decoded: DecodedIdToken;
  token: string;
  email: string;
  claimsActive: boolean;
  claimsUpdated: boolean;
  bootstrapped: boolean;
  roleDocActive: boolean;
}

type VerifyAttemptResult =
  | { ok: true; ctx: VerifiedAdminContext }
  | { ok: false; reason: VerifyFailureReason; statusCode: number };

async function runWithFirestoreFallback<T>(
  adminOp: () => Promise<T>,
  restOp: () => Promise<T>,
): Promise<T> {
  if (adminDb && firestoreAdminReady) {
    try {
      return await adminOp();
    } catch (err) {
      if (!isInsufficientPermissionError(err)) {
        throw err;
      }
      firestoreAdminReady = false;
    }
  }
  return restOp();
}

async function ensureAdminRoleViaRest(params: {
  idToken: string;
  uid: string;
  emailLower: string;
  allowBootstrap: boolean;
  claimsUpdated: boolean;
}): Promise<{ ok: true; bootstrapped: boolean } | { ok: false; reason: VerifyFailureReason }> {
  const { idToken, uid, emailLower, allowBootstrap, claimsUpdated } = params;
  const rolePath = `admin_roles/${uid}`;
  const existingRole = await restDb.getDoc(idToken, rolePath);
  let bootstrapped = false;

  if (!existingRole) {
    if (!allowBootstrap) {
      return { ok: false, reason: 'ADMIN_ROLE_INACTIVE' };
    }
    await restDb.commitWrites(idToken, [
      restDb.buildCreateWrite(
        rolePath,
        {
          uid,
          email: emailLower,
          role: 'super_admin',
          active: true,
          grantedBy: 'server_policy_bootstrap',
        },
        ['createdAt', 'updatedAt'],
        false,
      ),
    ]);
    bootstrapped = true;
  } else if (
    existingRole.active !== true ||
    existingRole.role !== 'super_admin' ||
    String(existingRole.email || '').trim().toLowerCase() !== AUTHORIZED_SUPER_ADMIN_EMAIL
  ) {
    if (!allowBootstrap) {
      return { ok: false, reason: 'ADMIN_ROLE_INACTIVE' };
    }
    await restDb.commitWrites(idToken, [
      restDb.buildUpdateWrite(
        rolePath,
        {
          email: emailLower,
          role: 'super_admin',
          active: true,
          grantedBy: 'server_policy_bootstrap',
        },
        ['updatedAt'],
      ),
    ]);
    bootstrapped = true;
  } else if (allowBootstrap && existingRole.email !== emailLower) {
    await restDb.commitWrites(idToken, [
      restDb.buildUpdateWrite(rolePath, { email: emailLower }, ['updatedAt']),
    ]);
  }

  if (bootstrapped || claimsUpdated) {
    const logId = `adm_boot_${Date.now()}_${uid.slice(0, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '');
    try {
      await restDb.commitWrites(idToken, [
        restDb.buildCreateWrite(
          `audit_logs/${logId}`,
          {
            logId,
            actorUid: uid,
            actorEmail: emailLower,
            action: 'SUPER_ADMIN_BOOTSTRAPPED',
            targetCollection: 'admin_roles',
            targetId: uid,
            details: `Server verified & bootstrapped Super Admin (claimsUpdated=${claimsUpdated}, bootstrapped=${bootstrapped})`,
          },
          ['createdAt'],
          false,
        ),
      ]);
    } catch (auditErr) {
      console.warn('Non-fatal audit log write warning:', auditErr);
    }
  }

  return { ok: true, bootstrapped };
}

async function verifySuperAdminRequest(
  req: Request,
  options: { allowBootstrap: boolean },
): Promise<VerifyAttemptResult> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'UNAUTHENTICATED', statusCode: 403 };
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    return { ok: false, reason: 'UNAUTHENTICATED', statusCode: 403 };
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, authClaimsSupported);
  } catch (verifyErr) {
    if (authClaimsSupported && isInsufficientPermissionError(verifyErr)) {
      authClaimsSupported = false;
      try {
        decoded = await adminAuth.verifyIdToken(idToken, false);
      } catch {
        return { ok: false, reason: 'UNAUTHENTICATED', statusCode: 403 };
      }
    } else {
      return { ok: false, reason: 'UNAUTHENTICATED', statusCode: 403 };
    }
  }

  if (!decoded.email || decoded.email_verified !== true) {
    return { ok: false, reason: 'EMAIL_UNVERIFIED', statusCode: 403 };
  }

  const emailLower = decoded.email.trim().toLowerCase();
  const allowlist = getAllowedSuperAdminEmails();
  if (!allowlist.has(emailLower) || emailLower !== AUTHORIZED_SUPER_ADMIN_EMAIL) {
    if (
      hasServiceCredentials &&
      (decoded.admin === true ||
        decoded.superAdmin === true ||
        decoded.super_admin === true ||
        decoded.role === 'super_admin')
    ) {
      try {
        if (authClaimsSupported) {
          await adminAuth.setCustomUserClaims(decoded.uid, {});
        }
        if (adminDb && firestoreAdminReady) {
          const oldRoleRef = adminDb.doc(`admin_roles/${decoded.uid}`);
          const oldRoleSnap = await oldRoleRef.get();
          if (oldRoleSnap.exists && oldRoleSnap.data()?.active === true) {
            await oldRoleRef.update({
              active: false,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
      } catch {
        // Ignore cleanup failure and strictly deny access below
      }
    }
    return { ok: false, reason: 'EMAIL_NOT_AUTHORIZED', statusCode: 403 };
  }

  void revokeUnauthorizedAdminRoles();

  const hasAllClaims =
    decoded.admin === true &&
    decoded.superAdmin === true &&
    decoded.super_admin === true &&
    decoded.role === 'super_admin';

  let claimsUpdated = false;
  if (!hasAllClaims && authClaimsSupported && options.allowBootstrap) {
    try {
      await adminAuth.setCustomUserClaims(decoded.uid, {
        admin: true,
        superAdmin: true,
        super_admin: true,
        role: 'super_admin',
      });
      claimsUpdated = true;
    } catch (claimErr) {
      if (isInsufficientPermissionError(claimErr)) {
        authClaimsSupported = false;
      } else {
        throw claimErr;
      }
    }
  }

  let bootstrapped = false;

  if (adminDb && firestoreAdminReady) {
    try {
      const roleRef = adminDb.doc(`admin_roles/${decoded.uid}`);
      const roleSnap = await roleRef.get();
      const roleData = roleSnap.exists ? roleSnap.data() : null;

      if (!roleSnap.exists) {
        if (!options.allowBootstrap) {
          return { ok: false, reason: 'ADMIN_ROLE_INACTIVE', statusCode: 403 };
        }
        await roleRef.set({
          uid: decoded.uid,
          email: emailLower,
          role: 'super_admin',
          active: true,
          grantedBy: 'server_policy_bootstrap',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        bootstrapped = true;
      } else if (roleData?.active !== true || roleData?.role !== 'super_admin') {
        if (!options.allowBootstrap) {
          return { ok: false, reason: 'ADMIN_ROLE_INACTIVE', statusCode: 403 };
        }
        await roleRef.update({
          email: emailLower,
          role: 'super_admin',
          active: true,
          grantedBy: 'server_policy_bootstrap',
          updatedAt: FieldValue.serverTimestamp(),
        });
        bootstrapped = true;
      } else if (options.allowBootstrap && roleData?.email !== emailLower) {
        await roleRef.update({
          email: emailLower,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (bootstrapped || claimsUpdated) {
        const logId = `adm_boot_${Date.now()}_${decoded.uid.slice(0, 8)}`.replace(/[^a-zA-Z0-9_-]/g, '');
        try {
          await adminDb.doc(`audit_logs/${logId}`).set({
            logId,
            actorUid: decoded.uid,
            actorEmail: emailLower,
            action: 'SUPER_ADMIN_BOOTSTRAPPED',
            targetCollection: 'admin_roles',
            targetId: decoded.uid,
            details: `Server verified & bootstrapped Super Admin (claimsUpdated=${claimsUpdated}, bootstrapped=${bootstrapped})`,
            createdAt: FieldValue.serverTimestamp(),
          });
        } catch (auditErr) {
          console.warn('Non-fatal audit log write warning:', auditErr);
        }
      }
    } catch (adminErr) {
      if (!isInsufficientPermissionError(adminErr)) {
        throw adminErr;
      }
      firestoreAdminReady = false;
    }
  }

  if (!firestoreAdminReady) {
    const restResult = await ensureAdminRoleViaRest({
      idToken,
      uid: decoded.uid,
      emailLower,
      allowBootstrap: options.allowBootstrap,
      claimsUpdated,
    });
    if (!restResult.ok) {
      return { ok: false, reason: restResult.reason, statusCode: 403 };
    }
    bootstrapped = restResult.bootstrapped;
  }

  if (!options.allowBootstrap && authClaimsSupported && !hasAllClaims) {
    return { ok: false, reason: 'CLAIMS_REFRESH_REQUIRED', statusCode: 403 };
  }

  return {
    ok: true,
    ctx: {
      decoded,
      token: idToken,
      email: emailLower,
      claimsActive: hasAllClaims,
      claimsUpdated,
      bootstrapped,
      roleDocActive: true,
    },
  };
}

async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const result = await verifySuperAdminRequest(req, { allowBootstrap: false });
    if (!result.ok) {
      res.status(403).json({
        authorized: false,
        error: 'FORBIDDEN',
        reason: result.reason,
      });
      return;
    }
    if (!result.ctx.roleDocActive && (!authClaimsSupported || !result.ctx.claimsActive)) {
      res.status(403).json({
        authorized: false,
        error: 'FORBIDDEN',
        reason: 'CLAIMS_REFRESH_REQUIRED',
      });
      return;
    }
    (req as Request & { adminCtx?: VerifiedAdminContext }).adminCtx = result.ctx;
    next();
  } catch (err) {
    console.error('Super Admin middleware error:', err);
    res.status(500).json({
      authorized: false,
      error: 'ADMIN_VERIFY_INTERNAL_ERROR',
    });
  }
}

function normalizeText(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

function normalizeDocPath(docPath: string): string {
  return docPath.replace(/^\/+/, '').trim();
}

function getSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

async function writeAuditLogSafe(
  ctx: VerifiedAdminContext,
  params: {
    logId: string;
    action: string;
    targetCollection: string;
    targetId: string;
    details: string;
  },
): Promise<void> {
  const payload = {
    logId: params.logId,
    actorUid: ctx.decoded.uid,
    actorEmail: ctx.email,
    action: params.action,
    targetCollection: params.targetCollection,
    targetId: params.targetId,
    details: params.details.slice(0, 600),
  };

  try {
    await runWithFirestoreFallback(
      async () => {
        await adminDb!.doc(`audit_logs/${params.logId}`).set({
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
        });
      },
      async () => {
        await restDb.commitWrites(ctx.token, [
          restDb.buildCreateWrite(
            `audit_logs/${params.logId}`,
            payload,
            ['createdAt'],
            false,
          ),
        ]);
      },
    );
  } catch (err) {
    console.warn('Non-fatal audit log write warning:', err);
  }
}

function isFailedPreconditionError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === '9' ||
    code === 'failed-precondition' ||
    msg.includes('FAILED_PRECONDITION') ||
    msg.includes('requires an index')
  );
}

function extractSafeErrorInfo(err: unknown): { code: string; message: string } {
  const rawCode =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (isInsufficientPermissionError(err) || rawMsg.includes('(403)')) {
    return {
      code: 'permission-denied',
      message: 'Firestore denied permission to list this collection.',
    };
  }
  if (rawMsg.includes('(401)')) {
    return {
      code: 'unauthenticated',
      message: 'Authentication token rejected while querying Firestore.',
    };
  }
  if (isFailedPreconditionError(err)) {
    return {
      code: 'failed-precondition',
      message: 'Firestore query requires an index or precondition.',
    };
  }
  if (rawMsg.includes('(404)')) {
    return {
      code: 'not-found',
      message: 'Target Firestore database or resource was not found.',
    };
  }

  const cleanCode = rawCode || (rawMsg.match(/FIRESTORE_REST_[A-Z_]+/)?.[0] ?? 'query-failed');
  return {
    code: cleanCode,
    message: rawMsg.slice(0, 180),
  };
}

function sortRowsDescByField(
  rows: Record<string, unknown>[],
  field: string,
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const av = typeof a[field] === 'string' ? Date.parse(a[field] as string) : 0;
    const bv = typeof b[field] === 'string' ? Date.parse(b[field] as string) : 0;
    return (Number.isFinite(bv) ? bv : 0) - (Number.isFinite(av) ? av : 0);
  });
}

interface SummaryCollectionResult {
  ok: boolean;
  collection: string;
  rows: Record<string, unknown>[];
  error?: { collection: string; code: string; message: string };
}

async function fetchSummaryCollection(
  ctx: VerifiedAdminContext,
  collectionName: string,
  options: { limit: number; orderByCreatedAt?: boolean },
): Promise<SummaryCollectionResult> {
  if (adminDb && firestoreAdminReady) {
    try {
      let snap: FirebaseFirestore.QuerySnapshot;
      if (options.orderByCreatedAt) {
        try {
          snap = await adminDb
            .collection(collectionName)
            .orderBy('createdAt', 'desc')
            .limit(options.limit)
            .get();
        } catch (orderErr) {
          if (!isFailedPreconditionError(orderErr)) {
            throw orderErr;
          }
          snap = await adminDb.collection(collectionName).limit(options.limit).get();
        }
      } else {
        snap = await adminDb.collection(collectionName).limit(options.limit).get();
      }
      const docs = serializeDocs(snap.docs);
      const rows = options.orderByCreatedAt
        ? sortRowsDescByField(docs, 'createdAt')
        : docs;
      return { ok: true, collection: collectionName, rows };
    } catch (adminErr) {
      if (!isInsufficientPermissionError(adminErr)) {
        const info = extractSafeErrorInfo(adminErr);
        console.error(
          `[MEDORA][AdminSummary] Failed querying "${collectionName}" via Admin SDK (${info.code}): ${info.message}`,
        );
        return {
          ok: false,
          collection: collectionName,
          rows: [],
          error: { collection: collectionName, ...info },
        };
      }
      firestoreAdminReady = false;
    }
  }

  try {
    const rows = await restDb.listCollection(ctx.token, collectionName, {
      limit: options.limit,
      orderByDescField: options.orderByCreatedAt ? 'createdAt' : undefined,
    });
    return { ok: true, collection: collectionName, rows };
  } catch (restErr) {
    const info = extractSafeErrorInfo(restErr);
    console.error(
      `[MEDORA][AdminSummary] Failed querying "${collectionName}" via Firestore REST (${info.code}): ${info.message}`,
    );
    return {
      ok: false,
      collection: collectionName,
      rows: [],
      error: { collection: collectionName, ...info },
    };
  }
}

async function createServer() {
  const app = express();
  const uploadJsonParser = express.json({ limit: '16mb' });
  const defaultJsonParser = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    if (
      req.path === '/api/admin/ads/upload' ||
      req.path === '/api/doctor/promotional-banner/upload' ||
      req.path === '/api/media/upload' ||
      req.path === '/api/doctor/avatar/upload' ||
      req.path === '/api/doctor/files/upload' ||
      req.path === '/api/patient/files/upload' ||
      req.path === '/api/lab/files/upload' ||
      req.path === '/api/lab/avatar/upload' ||
      req.path === '/api/patient/haneen/chat' ||
      req.path === '/api/patient/haneen/chat-stream' ||
      req.path === '/api/pharmacy/bulk-import/parse' ||
      req.path === '/api/pharmacy/bulk-import/revalidate' ||
      req.path === '/api/pharmacy/bulk-import/commit' ||
      req.path === '/api/wholesaler/bulk-import/parse' ||
      req.path === '/api/wholesaler/bulk-import/revalidate' ||
      req.path === '/api/wholesaler/bulk-import/commit'
    ) {
      uploadJsonParser(req, res, next);
      return;
    }
    defaultJsonParser(req, res, next);
  });

  app.use((req, _res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    requestTokenStorage.run(token || undefined, next);
  });

  // Hard server-side lock for Imaging Portal routes when IMAGING_PORTAL_ENABLED=false
  app.use((req, res, next) => {
    if (!IMAGING_PORTAL_ENABLED && isImagingApiPath(req.path)) {
      console.warn(
        `[MEDORA][ImagingPortalLock] Blocked ${req.method} ${req.path} (IMAGING_PORTAL_ENABLED=false)`,
      );
      res.status(503).json(buildImagingDisabledResponseBody());
      return;
    }
    next();
  });

  app.get('/api/health', async (_req, res) => {
    await ensureAuthorizedSuperAdminProvisioned();
    const allowlistPolicy = resolveSuperAdminAllowlist(
      process.env.MEDORA_SUPER_ADMIN_EMAILS,
      AUTHORIZED_SUPER_ADMIN_EMAIL,
    );
    const adminSdkActive = hasServiceCredentials && firestoreAdminReady;
    const bucketProbe = await resolveReadyStorageBucket().catch(() => ({
      bucket: null,
      bucketName: firebaseConfig.storageBucket || '',
      bucketExists: false,
      candidatesChecked: [],
    }));
    res.json({
      ok: true,
      service: 'medora-gateway',
      imagingPortalEnabled: IMAGING_PORTAL_ENABLED,
      featureFlags: {
        imagingPortalEnabled: IMAGING_PORTAL_ENABLED,
      },
      projectId: firebaseConfig.projectId,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      storageBucket: firebaseConfig.storageBucket || '',
      storageBucketResolved: bucketProbe.bucketName,
      storageBucketExists: bucketProbe.bucketExists,
      storageBucketCandidates: bucketProbe.candidatesChecked,
      firebaseStorageActive: bucketProbe.bucketExists,
      adImageStorageMode: bucketProbe.bucketExists ? 'firebase_storage' : 'firestore_asset',
      serverAdminSdkActive: adminSdkActive,
      firestoreAdminReady,
      authClaimsSupported,
      serviceAccountStatus: saResult.status,
      serviceAccountProjectIdMatch: saResult.ok,
      medoraSuperAdminEnvConfigured: allowlistPolicy.envConfigured,
      firestoreTransport: firestoreAdminReady ? 'admin_sdk' : 'verified_rules_rest',
      hasAllowlist: allowlistPolicy.allowedEmails.size > 0,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  async function verifyAuthenticatedUserBearer(req: Request): Promise<
    | {
        ok: true;
        uid: string;
        email: string;
        displayName: string;
        photoUrl: string;
        token: string;
      }
    | { ok: false; statusCode: number; error: string }
  > {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
    }
    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
    }
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, false);
      if (!decoded.uid) {
        return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
      }
      if (decoded.email_verified !== true) {
        return { ok: false, statusCode: 403, error: 'EMAIL_UNVERIFIED' };
      }
      const email = normalizeText(decoded.email || '', 254);
      const displayName = normalizeText(
        (decoded.name as string | undefined) || email.split('@')[0] || 'MEDORA User',
        120,
      );
      const photoUrl = normalizeText(decoded.picture || '', 1000);
      return { ok: true, uid: decoded.uid, email, displayName, photoUrl, token: idToken };
    } catch {
      return { ok: false, statusCode: 401, error: 'INVALID_TOKEN' };
    }
  }

  async function readUserRequestsServer(
    idToken: string,
    uid: string,
  ): Promise<Record<string, unknown>[]> {
    return runWithFirestoreFallback(
      async () => {
        const snap = await adminDb!
          .collection('registration_requests')
          .where('uid', '==', uid)
          .limit(25)
          .get();
        return serializeDocs(snap.docs).map((d) => stripInternalDocMeta(d) || d);
      },
      async () => {
        const rows = await restDb.queryByEquals(
          idToken,
          'registration_requests',
          'uid',
          uid,
          25,
        );
        return rows.map((r) => stripInternalDocMeta(r) || r);
      },
    );
  }

  async function inspectUserImagingAccess(params: {
    uid: string;
    email: string;
    idToken: string;
    userDoc: Record<string, unknown> | null;
    userRequests: Record<string, unknown>[];
  }): Promise<{
    isImagingAccount: boolean;
    imagingAccessBlocked: boolean;
    hasOtherAllowedPortal: boolean;
  }> {
    const { uid, email, idToken, userDoc, userRequests } = params;
    let isImagingAccount = false;

    if (userDoc && isImagingPortalIdentifier(userDoc.selectedPortal)) {
      isImagingAccount = true;
    }

    if (
      !isImagingAccount &&
      userRequests.some((r) => isImagingPortalIdentifier(r.portalType))
    ) {
      isImagingAccount = true;
    }

    if (!isImagingAccount && adminDb && firestoreAdminReady) {
      try {
        const [imgProfileSnap, memSnap] = await Promise.all([
          adminDb.doc(`imaging_profiles/${uid}`).get(),
          adminDb.collection('institution_members').where('uid', '==', uid).limit(15).get(),
        ]);
        if (imgProfileSnap.exists) {
          isImagingAccount = true;
        }
        if (!isImagingAccount && !memSnap.empty) {
          for (const mDoc of memSnap.docs) {
            const m = (mDoc.data() || {}) as Record<string, unknown>;
            const instId = normalizeText(m.institutionId, 128);
            if (
              isImagingPortalIdentifier(m.role) ||
              instId.startsWith('inst_img_')
            ) {
              isImagingAccount = true;
              break;
            }
            if (instId) {
              const instSnap = await adminDb.doc(`institutions/${instId}`).get();
              if (instSnap.exists && isImagingPortalIdentifier(instSnap.data()?.type)) {
                isImagingAccount = true;
                break;
              }
            }
          }
        }
      } catch {
        // Non-fatal fallback; selectedPortal & registration_requests remain primary checks
      }
    } else if (!isImagingAccount) {
      try {
        const memRows = await restDb.queryByEquals(
          idToken,
          'institution_members',
          'uid',
          uid,
          15,
        );
        for (const m of memRows) {
          const instId = normalizeText(m.institutionId, 128);
          if (isImagingPortalIdentifier(m.role) || instId.startsWith('inst_img_')) {
            isImagingAccount = true;
            break;
          }
        }
      } catch {
        // Ignore non-fatal member check failures
      }
    }

    const allowedPortals = new Set([
      'patient',
      'doctor',
      'lab',
      'secretary',
      'pharmacy',
      'wholesaler',
    ]);
    const hasApprovedAllowedRequest = userRequests.some(
      (r) =>
        allowedPortals.has(String(r.portalType || '')) &&
        String(r.status || '') === 'Approved',
    );
    const hasActiveAllowedUserPortal =
      Boolean(userDoc) &&
      allowedPortals.has(String(userDoc?.selectedPortal || '')) &&
      String(userDoc?.accountStatus || '') === 'active';
    const isAllowlistedAdmin = Boolean(email && getAllowedSuperAdminEmails().has(email.toLowerCase()));

    return {
      isImagingAccount,
      imagingAccessBlocked: !IMAGING_PORTAL_ENABLED && isImagingAccount,
      hasOtherAllowedPortal:
        hasApprovedAllowedRequest || hasActiveAllowedUserPortal || isAllowlistedAdmin,
    };
  }

  app.post('/api/portals/register', async (req, res) => {
    if (!IMAGING_PORTAL_ENABLED && hasImagingRolePayload(req.body)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }
    const authRes = await verifyAuthenticatedUserBearer(req);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ ok: false, error: authRes.error });
      return;
    }
    res.status(400).json({
      ok: false,
      error: 'USE_STANDARD_PORTAL_ONBOARDING',
    });
  });

  app.get('/api/auth/session', async (req, res) => {
    const authRes = await verifyAuthenticatedUserBearer(req);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ ok: false, error: authRes.error });
      return;
    }
    try {
      const userDoc = await runWithFirestoreFallback(
        async () => {
          const snap = await adminDb!.doc(`users/${authRes.uid}`).get();
          return snap.exists
            ? (serializeValue(snap.data()) as Record<string, unknown>)
            : null;
        },
        async () => stripInternalDocMeta(await restDb.getDoc(authRes.token, `users/${authRes.uid}`)),
      );
      const userRequests = await readUserRequestsServer(authRes.token, authRes.uid).catch(
        () => [],
      );
      const imagingAccess = await inspectUserImagingAccess({
        uid: authRes.uid,
        email: authRes.email,
        idToken: authRes.token,
        userDoc,
        userRequests,
      });
      res.json({
        ok: true,
        user: userDoc,
        requests: userRequests,
        featureFlags: {
          imagingPortalEnabled: IMAGING_PORTAL_ENABLED,
        },
        imagingAccessBlocked: imagingAccess.imagingAccessBlocked,
        imagingAccountDetected: imagingAccess.isImagingAccount,
        hasOtherAllowedPortal: imagingAccess.hasOtherAllowedPortal,
      });
    } catch (err) {
      const info = extractSafeErrorInfo(err);
      res.status(502).json({ ok: false, error: info.code, message: info.message });
    }
  });

const ALLOWED_USER_DOC_KEYS = new Set([
  'uid',
  'email',
  'googleName',
  'photoUrl',
  'accountStatus',
  'selectedPortal',
  'registrationCompleted',
  'personalProfileCompleted',
  'fullName',
  'dateOfBirth',
  'age',
  'gender',
  'governorate',
  'district',
  'address',
  'phone',
  'phoneVerified',
  'phoneVerifiedAt',
  'avatarUrl',
  'avatarPath',
  'createdAt',
  'lastLoginAt',
  'updatedAt',
]);

const VALID_USER_STATUSES = new Set([
  'pending_profile',
  'profile_completed',
  'pending_review',
  'active',
  'restricted',
  'suspended',
]);

const VALID_USER_PORTALS = new Set([
  'none',
  'patient',
  'doctor',
  'lab',
  'secretary',
  'pharmacy',
  'wholesaler',
]);

function isExistingUserPortalValid(portal: unknown): boolean {
  const str = String(portal || '');
  return VALID_USER_PORTALS.has(str) || str === 'imaging';
}

function isFirestoreTimestampValue(val: unknown): boolean {
  if (!val || typeof val !== 'object') return false;
  if ('toDate' in val && typeof (val as { toDate?: unknown }).toDate === 'function') {
    return true;
  }
  return '_seconds' in val && typeof (val as { _seconds?: unknown })._seconds === 'number';
}

function userDocNeedsNormalization(data: Record<string, unknown>, uid: string): boolean {
  const required = [
    'uid',
    'email',
    'googleName',
    'accountStatus',
    'selectedPortal',
    'registrationCompleted',
    'personalProfileCompleted',
    'createdAt',
    'lastLoginAt',
    'updatedAt',
  ];
  for (const key of required) {
    if (!(key in data)) return true;
  }
  for (const key of Object.keys(data)) {
    if (!ALLOWED_USER_DOC_KEYS.has(key)) return true;
    if (data[key] === null || data[key] === undefined) return true;
  }
  if (data.uid !== uid) return true;
  if (!VALID_USER_STATUSES.has(String(data.accountStatus))) return true;
  if (!isExistingUserPortalValid(data.selectedPortal)) return true;
  if (typeof data.registrationCompleted !== 'boolean') return true;
  if (typeof data.personalProfileCompleted !== 'boolean') return true;
  if (!isFirestoreTimestampValue(data.createdAt)) return true;
  if (typeof data.avatarUrl === 'string' && data.avatarUrl.length > 1000) return true;
  if (typeof data.photoUrl === 'string' && data.photoUrl.length > 1000) return true;
  if (typeof data.avatarPath === 'string' && data.avatarPath.length > 500) return true;
  if (
    'age' in data &&
    (typeof data.age !== 'number' ||
      !Number.isFinite(data.age) ||
      data.age < 0 ||
      data.age > 130)
  ) {
    return true;
  }
  if (
    'gender' in data &&
    data.gender !== 'male' &&
    data.gender !== 'female' &&
    data.gender !== 'unspecified'
  ) {
    return true;
  }
  return false;
}

function buildNormalizedUserDoc(
  existing: Record<string, unknown>,
  uid: string,
  overrides: {
    email?: string;
    googleName?: string;
    photoUrl?: string;
    patch?: Record<string, unknown>;
  },
): Record<string, unknown> {
  const resolvedEmail =
    normalizeText(overrides.email ?? existing.email, 254) || 'user@medora.local';
  const resolvedGoogleName =
    normalizeText(
      overrides.googleName ?? existing.googleName ?? existing.fullName,
      120,
    ) ||
    resolvedEmail.split('@')[0] ||
    'MEDORA User';
  const resolvedStatus = VALID_USER_STATUSES.has(String(existing.accountStatus))
    ? String(existing.accountStatus)
    : 'pending_profile';
  const resolvedPortal = isExistingUserPortalValid(existing.selectedPortal)
    ? String(existing.selectedPortal)
    : 'none';

  const normalized: Record<string, unknown> = {
    uid,
    email: resolvedEmail,
    googleName: resolvedGoogleName,
    accountStatus: resolvedStatus,
    selectedPortal: resolvedPortal,
    registrationCompleted:
      typeof existing.registrationCompleted === 'boolean'
        ? existing.registrationCompleted
        : false,
    personalProfileCompleted:
      typeof existing.personalProfileCompleted === 'boolean'
        ? existing.personalProfileCompleted
        : false,
    createdAt: isFirestoreTimestampValue(existing.createdAt)
      ? existing.createdAt
      : FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const optStrLimits: Array<[string, number]> = [
    ['photoUrl', 1000],
    ['fullName', 120],
    ['dateOfBirth', 20],
    ['governorate', 80],
    ['district', 80],
    ['address', 240],
    ['phone', 32],
    ['phoneVerifiedAt', 64],
    ['avatarUrl', 1000],
    ['avatarPath', 500],
  ];
  for (const [key, maxLen] of optStrLimits) {
    const val = existing[key];
    if (typeof val === 'string') {
      if ((key === 'avatarUrl' || key === 'photoUrl') && val.length > maxLen && val.startsWith('data:')) {
        continue;
      }
      normalized[key] = val.trim().slice(0, maxLen);
    }
  }
  if (typeof existing.phoneVerified === 'boolean') {
    normalized.phoneVerified = existing.phoneVerified;
  }
  if (overrides.photoUrl) {
    normalized.photoUrl = overrides.photoUrl.slice(0, 1000);
  }
  if (
    typeof existing.age === 'number' &&
    Number.isFinite(existing.age) &&
    existing.age >= 0 &&
    existing.age <= 130
  ) {
    normalized.age = Math.round(existing.age);
  }
  if (
    existing.gender === 'male' ||
    existing.gender === 'female' ||
    existing.gender === 'unspecified'
  ) {
    normalized.gender = existing.gender;
  }

  if (overrides.patch) {
    Object.assign(normalized, overrides.patch);
  }
  return normalized;
}

  app.post('/api/auth/session', async (req, res) => {
    if (!IMAGING_PORTAL_ENABLED && hasImagingRolePayload(req.body)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }
    const authRes = await verifyAuthenticatedUserBearer(req);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ ok: false, error: authRes.error });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const email = normalizeText(body.email || authRes.email, 254) || authRes.email;
    const googleName =
      normalizeText(body.googleName || authRes.displayName, 120) ||
      authRes.displayName;
    const photoUrl = normalizeText(body.photoUrl || authRes.photoUrl, 1000);
    const userPath = `users/${authRes.uid}`;

    try {
      const result = await runWithFirestoreFallback(
        async () => {
          const userRef = adminDb!.doc(userPath);
          const snap = await userRef.get();
          let wasCreated = false;
          if (!snap.exists) {
            wasCreated = true;
            const createDoc: Record<string, unknown> = {
              uid: authRes.uid,
              email,
              googleName,
              accountStatus: 'pending_profile',
              selectedPortal: 'none',
              registrationCompleted: false,
              personalProfileCompleted: false,
              createdAt: FieldValue.serverTimestamp(),
              lastLoginAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };
            if (photoUrl) {
              createDoc.photoUrl = photoUrl;
              createDoc.avatarUrl = photoUrl;
            }
            await userRef.set(createDoc);
          } else {
            const existingData = (snap.data() || {}) as Record<string, unknown>;
            if (userDocNeedsNormalization(existingData, authRes.uid)) {
              const normalized = buildNormalizedUserDoc(existingData, authRes.uid, {
                email,
                googleName,
                photoUrl,
              });
              await userRef.set(normalized);
            } else {
              const updateDocPayload: Record<string, unknown> = {
                email,
                googleName,
                lastLoginAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              };
              if (photoUrl) {
                updateDocPayload.photoUrl = photoUrl;
              }
              await userRef.update(updateDocPayload);
            }
          }

          const logId = getSafeId('log');
          await adminDb!
            .doc(`audit_logs/${logId}`)
            .set({
              logId,
              actorUid: authRes.uid,
              actorEmail: email,
              action: wasCreated ? 'USER_GOOGLE_REGISTERED' : 'USER_GOOGLE_LOGIN',
              targetCollection: 'users',
              targetId: authRes.uid,
              details: wasCreated
                ? 'New Google account initialized in MEDORA'
                : 'Existing user authenticated via Google Sign-In',
              createdAt: FieldValue.serverTimestamp(),
            })
            .catch(() => undefined);

          const refreshed = await userRef.get();
          return serializeValue(refreshed.data()) as Record<string, unknown>;
        },
        async () => {
          const existing = await restDb.getDoc(authRes.token, userPath);
          let wasCreated = false;
          if (!existing) {
            wasCreated = true;
            const createDoc: Record<string, unknown> = {
              uid: authRes.uid,
              email,
              googleName,
              accountStatus: 'pending_profile',
              selectedPortal: 'none',
              registrationCompleted: false,
              personalProfileCompleted: false,
            };
            if (photoUrl) {
              createDoc.photoUrl = photoUrl;
              createDoc.avatarUrl = photoUrl;
            }
            await restDb.commitWrites(authRes.token, [
              restDb.buildCreateWrite(
                userPath,
                createDoc,
                ['createdAt', 'lastLoginAt', 'updatedAt'],
                false,
              ),
            ]);
          } else {
            const patchDoc: Record<string, unknown> = {
              email,
              googleName,
            };
            if (photoUrl) {
              patchDoc.photoUrl = photoUrl;
            }
            const existingIsImaging = isImagingPortalIdentifier(existing?.selectedPortal);
            if (!existingIsImaging) {
              await restDb
                .commitWrites(authRes.token, [
                  restDb.buildUpdateWrite(userPath, patchDoc, ['lastLoginAt', 'updatedAt']),
                ])
                .catch(() => undefined);
            }
          }
          const logId = getSafeId('log');
          await restDb
            .commitWrites(authRes.token, [
              restDb.buildCreateWrite(
                `audit_logs/${logId}`,
                {
                  logId,
                  actorUid: authRes.uid,
                  actorEmail: email,
                  action: wasCreated ? 'USER_GOOGLE_REGISTERED' : 'USER_GOOGLE_LOGIN',
                  targetCollection: 'users',
                  targetId: authRes.uid,
                  details: wasCreated
                    ? 'New Google account initialized in MEDORA'
                    : 'Existing user authenticated via Google Sign-In',
                },
                ['createdAt'],
                false,
              ),
            ])
            .catch(() => undefined);

          return stripInternalDocMeta(await restDb.getDoc(authRes.token, userPath)) || {};
        },
      );

      const userRequests = await readUserRequestsServer(authRes.token, authRes.uid).catch(
        () => [],
      );
      const imagingAccess = await inspectUserImagingAccess({
        uid: authRes.uid,
        email,
        idToken: authRes.token,
        userDoc: result,
        userRequests,
      });
      res.json({
        ok: true,
        user: result,
        requests: userRequests,
        featureFlags: {
          imagingPortalEnabled: IMAGING_PORTAL_ENABLED,
        },
        imagingAccessBlocked: imagingAccess.imagingAccessBlocked,
        imagingAccountDetected: imagingAccess.isImagingAccount,
        hasOtherAllowedPortal: imagingAccess.hasOtherAllowedPortal,
      });
    } catch (err) {
      const info = extractSafeErrorInfo(err);
      res.status(502).json({ ok: false, error: info.code, message: info.message });
    }
  });

  app.post('/api/auth/profile', async (req, res) => {
    if (!IMAGING_PORTAL_ENABLED && hasImagingRolePayload(req.body)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }
    const authRes = await verifyAuthenticatedUserBearer(req);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ ok: false, error: authRes.error });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const fullName = normalizeText(body.fullName, 120);
    const dateOfBirth = normalizeText(body.dateOfBirth, 20);
    const genderRaw = normalizeText(body.gender, 20);
    const gender =
      genderRaw === 'male' || genderRaw === 'female' ? genderRaw : 'unspecified';
    const governorate = normalizeText(body.governorate, 80);
    const district = normalizeText(body.district, 80);
    const address = normalizeText(body.address, 240);
    const rawPhone = normalizeText(body.phone, 32);
    let phone = rawPhone;
    if (rawPhone) {
      const parsedPhone = parseAndNormalizeIraqiPhone(rawPhone);
      if (!parsedPhone.ok) {
        res.status(400).json({
          ok: false,
          error: `INVALID_IRAQI_PHONE:${parsedPhone.errorCode}`,
        });
        return;
      }
      phone = parsedPhone.e164;
      if (firestoreAdminReady && adminDb) {
        const regSnap = await adminDb
          .doc(`phone_registry/${hashPhoneKey(phone)}`)
          .get()
          .catch(() => null);
        if (regSnap?.exists && String(regSnap.data()?.ownerUid || '') !== authRes.uid) {
          res.status(409).json({
            ok: false,
            error: 'PHONE_ALREADY_REGISTERED',
          });
          return;
        }
      }
    }
    const avatarUrl = normalizeText(body.avatarUrl, 1000);
    const avatarPath = normalizeText(body.avatarPath, 300);

    if (fullName.length < 2 || !dateOfBirth || !governorate || !district || !address) {
      res.status(400).json({ ok: false, error: 'INVALID_PROFILE_FIELDS' });
      return;
    }

    const birth = new Date(dateOfBirth);
    const today = new Date();
    let age = Number.isNaN(birth.getTime())
      ? 0
      : today.getFullYear() - birth.getFullYear();
    if (!Number.isNaN(birth.getTime())) {
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }
    const computedAge = Math.max(0, Math.min(130, age));
    const userPath = `users/${authRes.uid}`;

    try {
      const updatedUser = await runWithFirestoreFallback(
        async () => {
          const userRef = adminDb!.doc(userPath);
          const snap = await userRef.get();
          const current = snap.exists ? ((snap.data() || {}) as Record<string, unknown>) : {};
          const nextStatus =
            current.accountStatus === 'pending_profile' || !current.accountStatus
              ? 'profile_completed'
              : current.accountStatus;
          const patch: Record<string, unknown> = {
            fullName,
            dateOfBirth,
            age: computedAge,
            gender,
            governorate,
            district,
            address,
            phone,
            avatarUrl,
            ...(avatarPath || current.avatarPath ? { avatarPath } : {}),
            personalProfileCompleted: true,
            accountStatus: nextStatus,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (!snap.exists || userDocNeedsNormalization(current, authRes.uid)) {
            await userRef.set(
              buildNormalizedUserDoc(current, authRes.uid, {
                email: authRes.email,
                googleName: authRes.displayName,
                photoUrl: authRes.photoUrl,
                patch,
              }),
            );
          } else {
            await userRef.update(patch);
          }
          const refreshed = await userRef.get();
          return serializeValue(refreshed.data()) as Record<string, unknown>;
        },
        async () => {
          const existingRaw = await restDb.getDoc(authRes.token, userPath);
          const current = stripInternalDocMeta(existingRaw) || {};
          const nextStatus =
            current.accountStatus === 'pending_profile' || !current.accountStatus
              ? 'profile_completed'
              : current.accountStatus;
          const patch: Record<string, unknown> = {
            fullName,
            dateOfBirth,
            age: computedAge,
            gender,
            governorate,
            district,
            address,
            phone,
            avatarUrl,
            ...(avatarPath || current.avatarPath ? { avatarPath } : {}),
            personalProfileCompleted: true,
            accountStatus: nextStatus,
          };

          if (!existingRaw) {
            const createDoc: Record<string, unknown> = {
              uid: authRes.uid,
              email: authRes.email,
              googleName: authRes.displayName || fullName,
              ...(authRes.photoUrl ? { photoUrl: authRes.photoUrl.slice(0, 1000) } : {}),
              selectedPortal: 'none',
              registrationCompleted: false,
              ...patch,
            };
            await restDb.commitWrites(authRes.token, [
              restDb.buildCreateWrite(
                userPath,
                createDoc,
                ['createdAt', 'lastLoginAt', 'updatedAt'],
                false,
              ),
            ]);
          } else {
            const healPatch: Record<string, unknown> = { ...patch };
            if (!current.uid) healPatch.uid = authRes.uid;
            if (!current.email) healPatch.email = authRes.email;
            if (!current.googleName) {
              healPatch.googleName = authRes.displayName || fullName || 'MEDORA User';
            }
            if (typeof current.registrationCompleted !== 'boolean') {
              healPatch.registrationCompleted = false;
            }
            if (!isExistingUserPortalValid(current.selectedPortal)) {
              healPatch.selectedPortal = 'none';
            }
            if (typeof current.photoUrl === 'string' && current.photoUrl.length > 1000) {
              healPatch.photoUrl = current.photoUrl.startsWith('data:')
                ? ''
                : current.photoUrl.slice(0, 1000);
            }
            const serverTsFields: string[] = ['updatedAt'];
            if (!current.createdAt) serverTsFields.push('createdAt');
            if (!current.lastLoginAt) serverTsFields.push('lastLoginAt');
            const write = restDb.buildUpdateWrite(userPath, healPatch, serverTsFields);
            // Delete any disallowed or null legacy keys via updateMask so isValidUserPayload passes
            if (write.updateMask) {
              for (const [key, val] of Object.entries(current)) {
                if (
                  (!ALLOWED_USER_DOC_KEYS.has(key) || val === null) &&
                  !write.updateMask.fieldPaths.includes(key) &&
                  !serverTsFields.includes(key)
                ) {
                  write.updateMask.fieldPaths.push(key);
                }
              }
            }
            await restDb.commitWrites(authRes.token, [write]);
          }
          return stripInternalDocMeta(await restDb.getDoc(authRes.token, userPath)) || {};
        },
      );
      res.json({ ok: true, user: updatedUser });
    } catch (err) {
      const info = extractSafeErrorInfo(err);
      res.status(502).json({ ok: false, error: info.code, message: info.message });
    }
  });

  app.post('/api/admin/verify', async (req, res) => {
    const allowlist = getAllowedSuperAdminEmails();
    const adminSdkActive = hasServiceCredentials && firestoreAdminReady;
    try {
      const result = await verifySuperAdminRequest(req, { allowBootstrap: true });
      const activeSdkAfterVerify = hasServiceCredentials && firestoreAdminReady;

      if (!result.ok) {
        res.status(result.statusCode).json({
          authorized: false,
          reason: result.reason,
          serverAdminSdkActive: activeSdkAfterVerify,
          serviceAccountStatus: saResult.status,
          firestoreTransport: firestoreAdminReady ? 'admin_sdk' : 'verified_rules_rest',
          hasAllowlist: allowlist.size > 0,
        });
        return;
      }

      const { ctx } = result;
      if (!ctx.claimsUpdated && !ctx.bootstrapped) {
        await writeAuditLogSafe(ctx, {
          logId: getSafeId('adm_ver'),
          action: 'SUPER_ADMIN_VERIFIED',
          targetCollection: 'admin_roles',
          targetId: ctx.decoded.uid,
          details: 'Verified Super Admin session via server token & Firestore security policy',
        });
      }

      res.json({
        authorized: true,
        uid: ctx.decoded.uid,
        email: ctx.email,
        role: 'super_admin',
        claimsActive: ctx.claimsActive,
        claimsUpdated: ctx.claimsUpdated,
        bootstrapped: ctx.bootstrapped,
        serverAdminSdkActive: activeSdkAfterVerify,
        serviceAccountStatus: saResult.status,
        firestoreTransport: firestoreAdminReady ? 'admin_sdk' : 'verified_rules_rest',
        hasAllowlist: allowlist.size > 0,
      });
    } catch (err) {
      console.error('Error in /api/admin/verify:', err);
      res.status(500).json({
        authorized: false,
        reason: 'ADMIN_VERIFY_INTERNAL_ERROR',
        serverAdminSdkActive: adminSdkActive,
        serviceAccountStatus: saResult.status,
        hasAllowlist: allowlist.size > 0,
      });
    }
  });

  app.get('/api/admin/summary', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const allowlist = getAllowedSuperAdminEmails();

    const targets: Array<{
      key:
        | 'users'
        | 'requests'
        | 'institutions'
        | 'adminRoles'
        | 'adminMessages'
        | 'auditLogs'
        | 'ads'
        | 'reviews'
        | 'feedback'
        | 'approvedDoctors'
        | 'approvedLabs';
      collection: string;
      limit: number;
      orderByCreatedAt: boolean;
    }> = [
      { key: 'users', collection: 'users', limit: 100, orderByCreatedAt: true },
      {
        key: 'requests',
        collection: 'registration_requests',
        limit: 100,
        orderByCreatedAt: true,
      },
      { key: 'institutions', collection: 'institutions', limit: 150, orderByCreatedAt: true },
      { key: 'adminRoles', collection: 'admin_roles', limit: 50, orderByCreatedAt: false },
      { key: 'adminMessages', collection: 'admin_messages', limit: 100, orderByCreatedAt: true },
      { key: 'auditLogs', collection: 'audit_logs', limit: 100, orderByCreatedAt: true },
      { key: 'ads', collection: 'medora_ads', limit: 120, orderByCreatedAt: true },
      { key: 'reviews', collection: 'doctor_reviews', limit: 150, orderByCreatedAt: true },
      { key: 'feedback', collection: 'patient_feedback', limit: 150, orderByCreatedAt: true },
      { key: 'approvedDoctors', collection: 'doctor_public_cards', limit: 150, orderByCreatedAt: false },
      { key: 'approvedLabs', collection: 'lab_profiles', limit: 150, orderByCreatedAt: false },
    ];

    try {
      const settled = await Promise.allSettled(
        targets.map((target) =>
          fetchSummaryCollection(ctx, target.collection, {
            limit: target.limit,
            orderByCreatedAt: target.orderByCreatedAt,
          }),
        ),
      );

      const dataByKey: Record<string, Record<string, unknown>[]> = {
        users: [],
        requests: [],
        institutions: [],
        adminRoles: [],
        adminMessages: [],
        auditLogs: [],
        ads: [],
        reviews: [],
        feedback: [],
        approvedDoctors: [],
        approvedLabs: [],
      };
      const partialErrors: Array<{ collection: string; code: string; message: string }> = [];

      settled.forEach((outcome, index) => {
        const target = targets[index];
        if (outcome.status === 'fulfilled') {
          dataByKey[target.key] = outcome.value.rows;
          if (!outcome.value.ok && outcome.value.error) {
            partialErrors.push(outcome.value.error);
          }
        } else {
          const info = extractSafeErrorInfo(outcome.reason);
          console.error(
            `[MEDORA][AdminSummary] Unexpected rejection for "${target.collection}":`,
            info.code,
            info.message,
          );
          partialErrors.push({ collection: target.collection, ...info });
        }
      });

      const failedCollections = partialErrors.map((e) => e.collection);
      if (partialErrors.length === targets.length) {
        res.status(500).json({
          authorized: true,
          error: 'ADMIN_SUMMARY_FETCH_FAILED',
          failedCollections,
          partialErrors,
        });
        return;
      }

      const instStatusMap = new Map<string, string>();
      dataByKey.institutions.forEach((inst) => {
        const id = normalizeText(inst.institutionId || inst._docId, 128);
        if (id) instStatusMap.set(id, String(inst.status || ''));
      });

      const isInstitutionActive = (row: Record<string, unknown>) => {
        const instId = normalizeText(row.institutionId, 128);
        if (!instId) return true;
        const st = instStatusMap.get(instId);
        return !st || st === 'active';
      };

      const approvedDoctors = dataByKey.approvedDoctors.filter(
        (d) => d.status === 'Approved' && isInstitutionActive(d),
      );

      const approvedLabs = dataByKey.approvedLabs
        .filter((l) => l.status === 'Approved' && isInstitutionActive(l))
        .map((lab) => ({
          labUid: normalizeText(lab.uid || lab._docId, 128),
          institutionId: normalizeText(lab.institutionId, 128),
          labNameAr: normalizeText(lab.labNameAr, 160),
          labNameEn: normalizeText(lab.labNameEn, 160),
          governorate: normalizeText(lab.governorate, 80),
          district: normalizeText(lab.district, 80),
          address: normalizeText(lab.address, 240),
          professionalPhone: normalizeText(lab.professionalPhone, 32),
          labServices: Array.isArray(lab.labServices) ? lab.labServices : [],
          serviceCatalog: Array.isArray(lab.serviceCatalog) ? lab.serviceCatalog : [],
          workDaysAndHours: normalizeText(lab.workDaysAndHours, 240),
          hourlyBookingLimit: typeof lab.hourlyBookingLimit === 'number' ? lab.hourlyBookingLimit : 4,
          bookingConfirmationMode: lab.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
        }))
        .filter((l) => Boolean(l.labUid));

      const transport =
        hasServiceCredentials && firestoreAdminReady ? 'admin_sdk' : 'verified_rules_rest';
      const bucketProbe = await resolveReadyStorageBucket().catch(() => ({
        bucket: null,
        bucketName: firebaseConfig.storageBucket || '',
        bucketExists: false,
        candidatesChecked: [],
      }));

      res.json({
        authorized: true,
        source: transport,
        actorEmail: ctx.email,
        partialErrors,
        serverStatus: {
          serverAdminSdkActive: hasServiceCredentials && firestoreAdminReady,
          hasAllowlist: allowlist.size > 0,
          customClaimsActive: ctx.claimsActive,
          serviceAccountStatus: saResult.status,
          firestoreTransport: transport,
          projectId: firebaseConfig.projectId,
          firestoreDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
          firebaseStorageActive: bucketProbe.bucketExists,
          adImageStorageMode: bucketProbe.bucketExists ? 'firebase_storage' : 'firestore_asset',
          storageBucketName: bucketProbe.bucketName,
        },
        users: dataByKey.users,
        requests: dataByKey.requests,
        institutions: dataByKey.institutions,
        adminRoles: dataByKey.adminRoles,
        adminMessages: dataByKey.adminMessages,
        auditLogs: dataByKey.auditLogs,
        ads: dataByKey.ads,
        reviews: dataByKey.reviews,
        feedback: dataByKey.feedback,
        approvedDoctors,
        approvedLabs,
      });
    } catch (err) {
      const info = extractSafeErrorInfo(err);
      console.error('Error fetching admin summary:', info.code, info.message);
      res.status(500).json({
        error: 'ADMIN_SUMMARY_FETCH_FAILED',
        partialErrors: [{ collection: 'summary', ...info }],
      });
    }
  });

  app.get('/api/admin/requests/:requestId/details', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const requestId = normalizeText(req.params.requestId, 128);
    if (!requestId) {
      res.status(400).json({ error: 'INVALID_REQUEST_ID' });
      return;
    }

    try {
      const payload = await runWithFirestoreFallback(
        async () => {
          const reqSnap = await adminDb!.doc(`registration_requests/${requestId}`).get();
          if (!reqSnap.exists) {
            return null;
          }
          const reqData = reqSnap.data() as Record<string, unknown>;
          const profilePath =
            typeof reqData.profilePath === 'string'
              ? normalizeDocPath(reqData.profilePath)
              : '';
          const institutionId =
            typeof reqData.institutionId === 'string' ? reqData.institutionId : '';

          const [profileSnap, instSnap, userSnap] = await Promise.all([
            profilePath ? adminDb!.doc(profilePath).get() : Promise.resolve(null),
            institutionId
              ? adminDb!.doc(`institutions/${institutionId}`).get()
              : Promise.resolve(null),
            typeof reqData.uid === 'string'
              ? adminDb!.doc(`users/${reqData.uid}`).get()
              : Promise.resolve(null),
          ]);

          return {
            request: serializeValue(reqData),
            profile: profileSnap?.exists ? serializeValue(profileSnap.data()) : null,
            institution: instSnap?.exists ? serializeValue(instSnap.data()) : null,
            applicantAccount: userSnap?.exists ? serializeValue(userSnap.data()) : null,
          };
        },
        async () => {
          const reqData = await restDb.getDoc(
            ctx.token,
            `registration_requests/${requestId}`,
          );
          if (!reqData) {
            return null;
          }
          const profilePath =
            typeof reqData.profilePath === 'string'
              ? normalizeDocPath(reqData.profilePath)
              : '';
          const institutionId =
            typeof reqData.institutionId === 'string' ? reqData.institutionId : '';

          const [profileDoc, instDoc, userDoc] = await Promise.all([
            profilePath ? restDb.getDoc(ctx.token, profilePath) : Promise.resolve(null),
            institutionId
              ? restDb.getDoc(ctx.token, `institutions/${institutionId}`)
              : Promise.resolve(null),
            typeof reqData.uid === 'string'
              ? restDb.getDoc(ctx.token, `users/${reqData.uid}`)
              : Promise.resolve(null),
          ]);

          return {
            request: stripInternalDocMeta(reqData),
            profile: stripInternalDocMeta(profileDoc),
            institution: stripInternalDocMeta(instDoc),
            applicantAccount: stripInternalDocMeta(userDoc),
          };
        },
      );

      if (!payload) {
        res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
        return;
      }

      res.json(payload);
    } catch (err) {
      console.error('Error loading request details:', err);
      res.status(500).json({ error: 'REQUEST_DETAILS_FAILED' });
    }
  });

  app.post('/api/admin/requests/:requestId/decision', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const requestId = normalizeText(req.params.requestId, 128);
    const decision = normalizeText(req.body?.status, 40);
    const reason = normalizeText(req.body?.reason, 500);
    const instructions = normalizeText(req.body?.instructions, 800);

    const allowedDecisions = new Set([
      'Under Review',
      'Approved',
      'Rejected',
      'Requires Changes',
    ]);

    if (!requestId || !allowedDecisions.has(decision)) {
      res.status(400).json({ error: 'INVALID_DECISION_INPUT' });
      return;
    }

    if (decision === 'Rejected' && reason.length < 3) {
      res.status(400).json({ error: 'REJECTION_REASON_REQUIRED' });
      return;
    }

    if (decision === 'Requires Changes' && instructions.length < 3 && reason.length < 3) {
      res.status(400).json({ error: 'CHANGE_INSTRUCTIONS_REQUIRED' });
      return;
    }

    try {
      const updatedRequest = await runWithFirestoreFallback(
        async () => {
          const reqRef = adminDb!.doc(`registration_requests/${requestId}`);
          const reqSnap = await reqRef.get();
          if (!reqSnap.exists) {
            return null;
          }

          const reqData = reqSnap.data() as Record<string, unknown>;
          const targetUid = String(reqData.uid || '');
          const portalType = String(reqData.portalType || '');
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(portalType) &&
            (decision === 'Approved' || decision === 'Under Review')
          ) {
            return { blockedByFlag: true as const };
          }
          const profilePath = normalizeDocPath(String(reqData.profilePath || ''));
          const institutionId =
            typeof reqData.institutionId === 'string' ? reqData.institutionId : '';

          const batch = adminDb!.batch();

          batch.update(reqRef, {
            status: decision,
            reviewReason: reason,
            reviewInstructions: instructions,
            updatedAt: FieldValue.serverTimestamp(),
          });

          if (profilePath && portalType !== 'patient') {
            const profileRef = adminDb!.doc(profilePath);
            const profileSnap = await profileRef.get();
            if (profileSnap.exists) {
              batch.update(profileRef, {
                status: decision,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }

          if (institutionId) {
            const instRef = adminDb!.doc(`institutions/${institutionId}`);
            const instSnap = await instRef.get();
            if (instSnap.exists) {
              const nextInstStatus =
                decision === 'Approved'
                  ? 'active'
                  : decision === 'Rejected'
                    ? 'rejected'
                    : 'pending_approval';
              batch.update(instRef, {
                status: nextInstStatus,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }

            const ownerMemRef = adminDb!.doc(
              `institution_members/mem_${institutionId}_${targetUid}`,
            );
            const ownerMemSnap = await ownerMemRef.get();
            if (ownerMemSnap.exists) {
              batch.update(ownerMemRef, {
                status:
                  decision === 'Approved'
                    ? 'active'
                    : decision === 'Rejected'
                      ? 'revoked'
                      : 'pending_approval',
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }

          if (targetUid) {
            const userRef = adminDb!.doc(`users/${targetUid}`);
            const userSnap = await userRef.get();
            if (userSnap.exists) {
              const nextAccStatus =
                decision === 'Approved'
                  ? 'active'
                  : decision === 'Rejected'
                    ? 'restricted'
                    : 'pending_review';
              batch.update(userRef, {
                accountStatus: nextAccStatus,
                updatedAt: FieldValue.serverTimestamp(),
              });
            }
          }

          const logId = getSafeId('adm_req');
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: `ADMIN_REQUEST_${decision.toUpperCase().replace(/\s+/g, '_')}`,
            targetCollection: 'registration_requests',
            targetId: requestId,
            details:
              reason || instructions
                ? `${decision} (${portalType}): ${reason || instructions}`
                : `Updated request ${requestId} (${portalType}) to ${decision}`,
            createdAt: FieldValue.serverTimestamp(),
          });

          await batch.commit();
          if (portalType === 'doctor' && decision === 'Approved' && targetUid) {
            const docProfileSnap = await adminDb!.doc(`doctor_profiles/${targetUid}`).get();
            if (docProfileSnap.exists) {
              await syncPublicDoctorCard(
                adminDb!,
                targetUid,
                docProfileSnap.data() as Record<string, unknown>,
              );
            }
          }
          const updatedSnap = await reqRef.get();
          return serializeValue(updatedSnap.data());
        },
        async () => {
          const reqPath = `registration_requests/${requestId}`;
          const reqData = await restDb.getDoc(ctx.token, reqPath);
          if (!reqData) {
            return null;
          }

          const targetUid = String(reqData.uid || '');
          const portalType = String(reqData.portalType || '');
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(portalType) &&
            (decision === 'Approved' || decision === 'Under Review')
          ) {
            return { blockedByFlag: true as const };
          }
          const profilePath = normalizeDocPath(String(reqData.profilePath || ''));
          const institutionId =
            typeof reqData.institutionId === 'string' ? reqData.institutionId : '';
          const ownerMemPath = institutionId
            ? `institution_members/mem_${institutionId}_${targetUid}`
            : '';

          const [profileDoc, instDoc, ownerMemDoc, userDoc] = await Promise.all([
            profilePath && portalType !== 'patient'
              ? restDb.getDoc(ctx.token, profilePath)
              : Promise.resolve(null),
            institutionId
              ? restDb.getDoc(ctx.token, `institutions/${institutionId}`)
              : Promise.resolve(null),
            ownerMemPath
              ? restDb.getDoc(ctx.token, ownerMemPath)
              : Promise.resolve(null),
            targetUid
              ? restDb.getDoc(ctx.token, `users/${targetUid}`)
              : Promise.resolve(null),
          ]);

          const writes: FirestoreRestWrite[] = [
            restDb.buildUpdateWrite(
              reqPath,
              {
                status: decision,
                reviewReason: reason,
                reviewInstructions: instructions,
              },
              ['updatedAt'],
            ),
          ];

          if (profileDoc && profilePath) {
            writes.push(
              restDb.buildUpdateWrite(profilePath, { status: decision }, ['updatedAt']),
            );
          }

          if (instDoc && institutionId) {
            const nextInstStatus =
              decision === 'Approved'
                ? 'active'
                : decision === 'Rejected'
                  ? 'rejected'
                  : 'pending_approval';
            writes.push(
              restDb.buildUpdateWrite(
                `institutions/${institutionId}`,
                { status: nextInstStatus },
                ['updatedAt'],
              ),
            );
          }

          if (ownerMemDoc && ownerMemPath) {
            writes.push(
              restDb.buildUpdateWrite(
                ownerMemPath,
                {
                  status:
                    decision === 'Approved'
                      ? 'active'
                      : decision === 'Rejected'
                        ? 'revoked'
                        : 'pending_approval',
                },
                ['updatedAt'],
              ),
            );
          }

          if (userDoc && targetUid) {
            const nextAccStatus =
              decision === 'Approved'
                ? 'active'
                : decision === 'Rejected'
                  ? 'restricted'
                  : 'pending_review';
            writes.push(
              restDb.buildUpdateWrite(
                `users/${targetUid}`,
                { accountStatus: nextAccStatus },
                ['updatedAt'],
              ),
            );
          }

          const logId = getSafeId('adm_req');
          writes.push(
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: `ADMIN_REQUEST_${decision.toUpperCase().replace(/\s+/g, '_')}`,
                targetCollection: 'registration_requests',
                targetId: requestId,
                details: (reason || instructions
                  ? `${decision} (${portalType}): ${reason || instructions}`
                  : `Updated request ${requestId} (${portalType}) to ${decision}`
                ).slice(0, 600),
              },
              ['createdAt'],
              false,
            ),
          );

          await restDb.commitWrites(ctx.token, writes);
          const refreshed = await restDb.getDoc(ctx.token, reqPath);
          return stripInternalDocMeta(refreshed);
        },
      );

      if (!updatedRequest) {
        res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
        return;
      }
      if (
        typeof updatedRequest === 'object' &&
        updatedRequest !== null &&
        'blockedByFlag' in updatedRequest
      ) {
        res.status(403).json(buildImagingDisabledResponseBody());
        return;
      }

      const reqRec = (typeof updatedRequest === 'object' && updatedRequest !== null
        ? updatedRequest
        : {}) as Record<string, unknown>;
      const applicantUid = String(reqRec.uid || '').trim();
      const applicantPortal = String(reqRec.portalType || '').trim();
      const notifRole =
        applicantPortal === 'doctor' ||
        applicantPortal === 'lab' ||
        applicantPortal === 'secretary' ||
        applicantPortal === 'pharmacy' ||
        applicantPortal === 'wholesaler'
          ? applicantPortal
          : 'patient';
      const notifEngine = getGlobalNotificationEngine();
      if (
        notifEngine &&
        applicantUid &&
        (!isImagingPortalIdentifier(applicantPortal) || IMAGING_PORTAL_ENABLED)
      ) {
        await notifEngine
          .dispatch({
            eventType: 'registration_decision',
            recipientUid: applicantUid,
            recipientRole: notifRole,
            title: `تحديث حالة طلب التسجيل (${decision})`,
            body:
              reason || instructions
                ? `تم تحديث حالة الطلب إلى ${decision}: ${reason || instructions}`
                : `تم تحديث حالة طلب تسجيلك (${requestId}) إلى ${decision}.`,
            inAppType: 'admin_notice',
            relatedId: requestId,
            relatedType: 'registration_request',
            idempotencyKey: `req_dec:${requestId}:${decision}`,
            placeholders: {
              refCode: requestId.slice(0, 16).toUpperCase(),
              statusLabel: decision,
            },
          })
          .catch(() => undefined);
      }

      if (adminDb && (decision === 'Rejected' || decision === 'Requires Changes')) {
        await emitAdminNotification(adminDb, {
          eventType: 'registration_decision',
          type: 'registration_decision',
          title: `تم تسجيل قرار (${decision}) لطلب ${requestId}`,
          body: reason || instructions || `بوابة: ${applicantPortal}`,
          relatedId: requestId,
          relatedType: 'registration_request',
          idempotencyKey: `adm_dec_audit:${requestId}:${decision}`,
          fallbackAdminUid: ctx.decoded.uid,
        });
      }

      res.json({
        ok: true,
        request: updatedRequest,
      });
    } catch (err) {
      console.error('Error updating request decision:', err);
      res.status(500).json({ error: 'REQUEST_DECISION_FAILED' });
    }
  });

  app.post('/api/admin/institutions/:institutionId/update', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const institutionId = normalizeText(req.params.institutionId, 128);
    const status = normalizeText(req.body?.status, 40);
    const subscriptionStatus = normalizeText(req.body?.subscriptionStatus, 40);
    const subscriptionPlan = normalizeText(req.body?.subscriptionPlan, 80);
    const subscriptionExpiresAt = normalizeText(req.body?.subscriptionExpiresAt, 32);

    const allowedStatuses = new Set([
      'pending_approval',
      'active',
      'suspended',
      'rejected',
    ]);
    const allowedSubStatuses = new Set(['none', 'trial', 'active', 'expired']);

    if (!institutionId) {
      res.status(400).json({ error: 'INVALID_INSTITUTION_ID' });
      return;
    }

    if (status && !allowedStatuses.has(status)) {
      res.status(400).json({ error: 'INVALID_INSTITUTION_STATUS' });
      return;
    }

    if (subscriptionStatus && !allowedSubStatuses.has(subscriptionStatus)) {
      res.status(400).json({ error: 'INVALID_SUBSCRIPTION_STATUS' });
      return;
    }

    const patchFields: Record<string, unknown> = {};
    if (status) patchFields.status = status;
    if (subscriptionStatus) patchFields.subscriptionStatus = subscriptionStatus;
    if (req.body?.subscriptionPlan !== undefined) {
      patchFields.subscriptionPlan = subscriptionPlan;
    }
    if (req.body?.subscriptionExpiresAt !== undefined) {
      patchFields.subscriptionExpiresAt = subscriptionExpiresAt;
    }

    const logId = getSafeId('adm_inst');
    const auditData = {
      logId,
      actorUid: ctx.decoded.uid,
      actorEmail: ctx.email,
      action: 'ADMIN_INSTITUTION_UPDATED',
      targetCollection: 'institutions',
      targetId: institutionId,
      details: `Updated institution (${institutionId}): status=${status || 'unchanged'}, subscription=${subscriptionStatus || 'unchanged'}`,
    };

    try {
      const updatedInstitution = await runWithFirestoreFallback(
        async () => {
          const instRef = adminDb!.doc(`institutions/${institutionId}`);
          const instSnap = await instRef.get();
          if (!instSnap.exists) {
            return null;
          }
          const instData = (instSnap.data() || {}) as Record<string, unknown>;
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(instData.type) &&
            status === 'active'
          ) {
            return { blockedByFlag: true as const };
          }

          const batch = adminDb!.batch();
          batch.update(instRef, {
            ...patchFields,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            ...auditData,
            createdAt: FieldValue.serverTimestamp(),
          });

          await batch.commit();
          const updated = await instRef.get();
          return serializeValue(updated.data());
        },
        async () => {
          const instPath = `institutions/${institutionId}`;
          const instDoc = await restDb.getDoc(ctx.token, instPath);
          if (!instDoc) {
            return null;
          }
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(instDoc.type) &&
            status === 'active'
          ) {
            return { blockedByFlag: true as const };
          }

          await restDb.commitWrites(ctx.token, [
            restDb.buildUpdateWrite(instPath, patchFields, ['updatedAt']),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              auditData,
              ['createdAt'],
              false,
            ),
          ]);
          const refreshed = await restDb.getDoc(ctx.token, instPath);
          return stripInternalDocMeta(refreshed);
        },
      );

      if (!updatedInstitution) {
        res.status(404).json({ error: 'INSTITUTION_NOT_FOUND' });
        return;
      }
      if (
        typeof updatedInstitution === 'object' &&
        updatedInstitution !== null &&
        'blockedByFlag' in updatedInstitution
      ) {
        res.status(403).json(buildImagingDisabledResponseBody());
        return;
      }

      const instRec = (typeof updatedInstitution === 'object' && updatedInstitution !== null
        ? updatedInstitution
        : {}) as Record<string, unknown>;
      const ownerUid = String(instRec.ownerUid || '').trim();
      const instType = String(instRec.type || '').trim();
      const instEngine = getGlobalNotificationEngine();
      if (instEngine && ownerUid && status) {
        const ownerRole =
          instType === 'doctor' || instType === 'clinic'
            ? 'doctor'
            : instType === 'lab'
              ? 'lab'
              : instType === 'pharmacy'
                ? 'pharmacy'
                : instType === 'wholesaler'
                  ? 'wholesaler'
                  : 'patient';
        await instEngine
          .dispatch({
            eventType: status === 'suspended' ? 'account_security_alert' : 'important_account_update',
            recipientUid: ownerUid,
            recipientRole: ownerRole,
            title:
              status === 'suspended'
                ? 'تم تعليق حساب المؤسسة مؤقتاً من الإدارة'
                : `تحديث حالة المؤسسة (${status})`,
            body: `المؤسسة: ${String(instRec.name || institutionId)} — الحالة: ${status}`,
            inAppType: 'admin_notice',
            relatedId: institutionId,
            relatedType: 'institution',
            idempotencyKey: `inst_upd:${institutionId}:${status}`,
          })
          .catch(() => undefined);
      }
      if (adminDb && status === 'suspended') {
        await emitAdminNotification(adminDb, {
          eventType: 'important_account_update',
          type: 'institution_suspended',
          title: `تعليق مؤسسة: ${String(instRec.name || institutionId)}`,
          body: `تم تنفيذ قرار التعليق بواسطة ${ctx.email}`,
          relatedId: institutionId,
          relatedType: 'institution',
          idempotencyKey: `adm_inst_susp:${institutionId}:${status}`,
          fallbackAdminUid: ctx.decoded.uid,
        });
      }

      res.json({ ok: true, institution: updatedInstitution });
    } catch (err) {
      console.error('Error updating institution:', err);
      res.status(500).json({ error: 'INSTITUTION_UPDATE_FAILED' });
    }
  });

  app.post('/api/admin/messages', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const subject = normalizeText(req.body?.subject, 200);
    const body = normalizeText(req.body?.body, 2000);
    const category = normalizeText(req.body?.category, 40) || 'institution_notice';
    const senderName = normalizeText(req.body?.senderName, 120) || 'MEDORA Executive Admin';
    const senderEmail = normalizeText(req.body?.senderEmail, 254) || ctx.email;

    const allowedCategories = new Set([
      'system',
      'inquiry',
      'institution_notice',
      'compliance',
    ]);

    if (subject.length < 2 || body.length < 2 || !allowedCategories.has(category)) {
      res.status(400).json({ error: 'INVALID_MESSAGE_PAYLOAD' });
      return;
    }

    const messageId = getSafeId('msg');
    const logId = getSafeId('adm_msg');
    const messagePayload = {
      messageId,
      senderName,
      senderEmail,
      subject,
      body,
      category,
      status: 'new',
      isRead: false,
    };
    const auditPayload = {
      logId,
      actorUid: ctx.decoded.uid,
      actorEmail: ctx.email,
      action: 'ADMIN_MESSAGE_CREATED',
      targetCollection: 'admin_messages',
      targetId: messageId,
      details: `Created admin message (${category}): ${subject}`.slice(0, 600),
    };

    try {
      const savedMessage = await runWithFirestoreFallback(
        async () => {
          const batch = adminDb!.batch();
          const msgRef = adminDb!.doc(`admin_messages/${messageId}`);
          batch.set(msgRef, {
            ...messagePayload,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            ...auditPayload,
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          const saved = await msgRef.get();
          return serializeValue(saved.data());
        },
        async () => {
          const msgPath = `admin_messages/${messageId}`;
          await restDb.commitWrites(ctx.token, [
            restDb.buildCreateWrite(
              msgPath,
              messagePayload,
              ['createdAt', 'updatedAt'],
              false,
            ),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              auditPayload,
              ['createdAt'],
              false,
            ),
          ]);
          const saved = await restDb.getDoc(ctx.token, msgPath);
          return stripInternalDocMeta(saved);
        },
      );

      res.status(201).json({ ok: true, message: savedMessage });
    } catch (err) {
      console.error('Error creating admin message:', err);
      res.status(500).json({ error: 'MESSAGE_CREATE_FAILED' });
    }
  });

  app.patch('/api/admin/messages/:messageId', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const messageId = normalizeText(req.params.messageId, 128);
    const status = normalizeText(req.body?.status, 32);
    const isRead = typeof req.body?.isRead === 'boolean' ? req.body.isRead : undefined;

    const allowedStatuses = new Set(['new', 'read', 'replied', 'archived']);
    if (!messageId || (status && !allowedStatuses.has(status))) {
      res.status(400).json({ error: 'INVALID_MESSAGE_UPDATE' });
      return;
    }

    const patchFields: Record<string, unknown> = {};
    if (status) patchFields.status = status;
    if (isRead !== undefined) patchFields.isRead = isRead;

    const logId = getSafeId('adm_msg');
    const auditPayload = {
      logId,
      actorUid: ctx.decoded.uid,
      actorEmail: ctx.email,
      action: 'ADMIN_MESSAGE_UPDATED',
      targetCollection: 'admin_messages',
      targetId: messageId,
      details: `Updated message ${messageId}: status=${status || 'unchanged'}, isRead=${String(isRead)}`,
    };

    try {
      const updatedMessage = await runWithFirestoreFallback(
        async () => {
          const msgRef = adminDb!.doc(`admin_messages/${messageId}`);
          const snap = await msgRef.get();
          if (!snap.exists) {
            return null;
          }

          const batch = adminDb!.batch();
          batch.update(msgRef, {
            ...patchFields,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            ...auditPayload,
            createdAt: FieldValue.serverTimestamp(),
          });

          await batch.commit();
          const updated = await msgRef.get();
          return serializeValue(updated.data());
        },
        async () => {
          const msgPath = `admin_messages/${messageId}`;
          const existing = await restDb.getDoc(ctx.token, msgPath);
          if (!existing) {
            return null;
          }

          await restDb.commitWrites(ctx.token, [
            restDb.buildUpdateWrite(msgPath, patchFields, ['updatedAt']),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              auditPayload,
              ['createdAt'],
              false,
            ),
          ]);
          const updated = await restDb.getDoc(ctx.token, msgPath);
          return stripInternalDocMeta(updated);
        },
      );

      if (!updatedMessage) {
        res.status(404).json({ error: 'MESSAGE_NOT_FOUND' });
        return;
      }

      res.json({ ok: true, message: updatedMessage });
    } catch (err) {
      console.error('Error updating admin message:', err);
      res.status(500).json({ error: 'MESSAGE_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Super Admin Advertisements, Doctor Review Moderation & Patient Feedback APIs
  // ---------------------------------------------------------------------------
  type MedoraAdStatus = 'draft' | 'published' | 'paused' | 'expired';
  const ALLOWED_AD_STATUSES = new Set<MedoraAdStatus>([
    'draft',
    'published',
    'paused',
    'expired',
  ]);
  const ALLOWED_RAW_AD_UPLOAD_MIMES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]);

  function normalizeAdStatusInput(
    rawStatus: unknown,
    rawActive: unknown,
  ): MedoraAdStatus | null {
    if (typeof rawStatus === 'string') {
      const cleaned = rawStatus.trim().toLowerCase() as MedoraAdStatus;
      if (ALLOWED_AD_STATUSES.has(cleaned)) {
        return cleaned;
      }
      return null;
    }
    if (typeof rawActive === 'boolean') {
      return rawActive ? 'published' : 'paused';
    }
    return null;
  }

  async function verifyAuthenticatedMediaActor(
    req: Request,
  ): Promise<{ uid: string; email: string } | null> {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, false);
      if (!decoded.uid || decoded.email_verified !== true) return null;
      return {
        uid: decoded.uid,
        email: (decoded.email || '').trim().toLowerCase(),
      };
    } catch {
      return null;
    }
  }

  const ALLOWED_GENERAL_MEDIA_FOLDERS = new Set<MedoraUploadFolder>([
    'avatars',
    'doctor_docs',
    'lab_docs',
    'pharmacy_docs',
    'pharmacy_media',
    'wholesaler_docs',
    'wholesaler_media',
    'message_files',
  ]);

  app.post('/api/media/upload', async (req, res) => {
    if (!IMAGING_PORTAL_ENABLED && hasImagingRolePayload(req.body)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }
    const actor = await verifyAuthenticatedMediaActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const folderRaw = normalizeText(req.body?.folder, 40) as MedoraUploadFolder;
    if (!ALLOWED_GENERAL_MEDIA_FOLDERS.has(folderRaw)) {
      res.status(400).json({ error: 'INVALID_UPLOAD_FOLDER' });
      return;
    }

    const decoded = decodeAndValidateBase64Asset({
      dataBase64: req.body?.dataBase64,
      mimeType: req.body?.mimeType,
      fileName: req.body?.fileName,
      allowPdf: folderRaw !== 'avatars',
    });
    if (!decoded.ok) {
      res.status(400).json({ error: decoded.error });
      return;
    }

    const bucketInfo = await resolveReadyStorageBucket().catch(() => null);
    try {
      const stored = await storeUploadedMediaAsset({
        adminDb: getEffectiveDb(),
        bucketInfo,
        hasServiceCredentials,
        ownerUid: actor.uid,
        folder: folderRaw,
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
      });
      res.status(201).json({
        ok: true,
        file: {
          name: decoded.safeName,
          size: stored.size,
          mimeType: stored.mimeType,
          url: stored.url,
          storagePath: stored.storagePath,
          storageMode: stored.storageMode,
          visibility: stored.visibility,
          uploadedAtIso: new Date().toISOString(),
        },
      });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'MEDIA_UPLOAD_FAILED';
      if (code === 'PDF_TOO_LARGE_WITHOUT_STORAGE_BUCKET' || code === 'FILE_TOO_LARGE') {
        res.status(413).json({ error: code });
        return;
      }
      if (code === 'STORAGE_UNAVAILABLE') {
        res.status(503).json({ error: 'STORAGE_UNAVAILABLE' });
        return;
      }
      console.error('[MEDORA][MediaUpload] error:', err);
      res.status(500).json({ error: 'MEDIA_UPLOAD_FAILED' });
    }
  });

  app.get('/api/media/public/:assetId', async (req, res) => {
    const assetId = normalizeText(req.params.assetId, 128);
    if (!isValidMediaAssetId(assetId)) {
      res.status(400).json({ error: 'INVALID_ASSET_ID' });
      return;
    }
    try {
      const db = getEffectiveDb();
      const snap = await db.doc(`medora_media_assets/${assetId}`).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'MEDIA_ASSET_NOT_FOUND' });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      if (data.visibility !== 'public') {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      const base64Body = typeof data.dataBase64 === 'string' ? data.dataBase64 : '';
      if (!base64Body) {
        res.status(404).json({ error: 'MEDIA_ASSET_EMPTY' });
        return;
      }
      const buffer = Buffer.from(base64Body, 'base64');
      const contentType =
        typeof data.contentType === 'string' && data.contentType ? data.contentType : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(buffer);
    } catch (err) {
      console.error('[MEDORA][PublicMediaServe] error:', err);
      res.status(500).json({ error: 'MEDIA_SERVE_FAILED' });
    }
  });

  app.get('/api/media/private/:assetId', async (req, res) => {
    const actor = await verifyAuthenticatedMediaActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    const assetId = normalizeText(req.params.assetId, 128);
    if (!isValidMediaAssetId(assetId)) {
      res.status(400).json({ error: 'INVALID_ASSET_ID' });
      return;
    }

    try {
      const db = getEffectiveDb();
      const snap = await db.doc(`medora_media_assets/${assetId}`).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'MEDIA_ASSET_NOT_FOUND' });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const ownerUid = typeof data.ownerUid === 'string' ? data.ownerUid : '';
      const doctorUid = typeof data.doctorUid === 'string' ? data.doctorUid : '';
      const labUid = typeof data.labUid === 'string' ? data.labUid : '';
      const labPatientUid = typeof data.labPatientUid === 'string' ? data.labPatientUid : '';
      const patientRecordId =
        typeof data.patientRecordId === 'string' ? data.patientRecordId : '';
      const conversationId =
        typeof data.conversationId === 'string' ? data.conversationId : '';

      let authorized = false;
      const allowlist = getAllowedSuperAdminEmails();
      if (actor.email === AUTHORIZED_SUPER_ADMIN_EMAIL && allowlist.has(actor.email)) {
        authorized = true;
      } else if (
        actor.uid === ownerUid ||
        (doctorUid && actor.uid === doctorUid) ||
        (labUid && actor.uid === labUid) ||
        (labPatientUid && actor.uid === labPatientUid)
      ) {
        authorized = true;
      }

      if (!authorized && labUid) {
        authorized = await isActiveLabMediaActor(db, actor.uid, actor.email, labUid);
      }

      if (!authorized && patientRecordId) {
        const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
        if (patSnap.exists) {
          const pData = patSnap.data() as Record<string, unknown>;
          if (pData.linkedPatientUid === actor.uid || pData.doctorUid === actor.uid) {
            authorized = true;
          }
        }
      }

      if (!authorized && conversationId) {
        const convSnap = await db.doc(`doctor_conversations/${conversationId}`).get();
        if (convSnap.exists) {
          const cData = convSnap.data() as Record<string, unknown>;
          if (cData.patientUid === actor.uid || cData.doctorUid === actor.uid) {
            authorized = true;
          }
        } else {
          const labConvSnap = await db.doc(`lab_conversations/${conversationId}`).get();
          if (labConvSnap.exists) {
            const lcData = labConvSnap.data() as Record<string, unknown>;
            if (lcData.patientUid === actor.uid || lcData.labUid === actor.uid) {
              authorized = true;
            }
          }
        }
      }

      if (!authorized && ownerUid) {
        const shareId = `shr_${ownerUid}_${actor.uid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
        const shareSnap = await db.doc(`medical_record_shares/${shareId}`).get();
        if (shareSnap.exists) {
          const sh = shareSnap.data() as Record<string, unknown>;
          const perms = (sh.permissions as Record<string, unknown> | undefined) || {};
          const nowIso = new Date().toISOString();
          if (
            sh.revoked !== true &&
            perms.uploadedFiles === true &&
            (!sh.expiresAt || String(sh.expiresAt) >= nowIso)
          ) {
            authorized = true;
          }
        }
      }

      if (!authorized && doctorUid) {
        const memSnap = await db
          .collection('institution_members')
          .where('uid', '==', actor.uid)
          .limit(10)
          .get();
        for (const mDoc of memSnap.docs) {
          const md = mDoc.data() as Record<string, unknown>;
          if (md.status !== 'active' || typeof md.institutionId !== 'string') continue;
          const instSnap = await db.doc(`institutions/${md.institutionId}`).get();
          if (!instSnap.exists || instSnap.data()?.ownerUid !== doctorUid) continue;
          const perms = Array.isArray(md.permissions) ? (md.permissions as string[]) : [];
          if (
            perms.includes('viewMedicalRecords') ||
            perms.includes('uploadLabResults') ||
            perms.includes('messagePatients')
          ) {
            authorized = true;
            break;
          }
        }
      }

      if (!authorized) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }

      const base64Body = typeof data.dataBase64 === 'string' ? data.dataBase64 : '';
      if (!base64Body) {
        res.status(404).json({ error: 'MEDIA_ASSET_EMPTY' });
        return;
      }
      const buffer = Buffer.from(base64Body, 'base64');
      const contentType =
        typeof data.contentType === 'string' && data.contentType
          ? data.contentType
          : 'application/octet-stream';
      const safeFileName =
        typeof data.fileName === 'string' && data.fileName
          ? data.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
          : 'document';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
      res.status(200).send(buffer);
    } catch (err) {
      console.error('[MEDORA][PrivateMediaServe] error:', err);
      res.status(500).json({ error: 'MEDIA_SERVE_FAILED' });
    }
  });

  app.get('/api/ads/assets/:assetId', async (req, res) => {
    const assetId = normalizeText(req.params.assetId, 128);
    if (!isValidAdAssetId(assetId)) {
      res.status(400).json({ error: 'INVALID_ASSET_ID' });
      return;
    }

    try {
      const db = getEffectiveDb();
      const snap = await db.doc(`medora_ad_assets/${assetId}`).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'AD_ASSET_NOT_FOUND' });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const contentType =
        typeof data.contentType === 'string' && ALLOWED_RAW_AD_UPLOAD_MIMES.has(data.contentType)
          ? data.contentType
          : 'image/jpeg';
      const base64Body = typeof data.dataBase64 === 'string' ? data.dataBase64 : '';
      if (!base64Body) {
        res.status(404).json({ error: 'AD_ASSET_EMPTY' });
        return;
      }
      const buffer = Buffer.from(base64Body, 'base64');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(buffer);
    } catch (err) {
      console.error('[MEDORA][AdAssetServe] error:', err);
      res.status(500).json({ error: 'AD_ASSET_SERVE_FAILED' });
    }
  });

  app.post(
    '/api/admin/ads/upload',
    requireSuperAdmin,
    async (req, res) => {
      if (!IMAGING_PORTAL_ENABLED && hasImagingRolePayload(req.body)) {
        res.status(403).json(buildImagingDisabledResponseBody());
        return;
      }
      const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;

      const rawOriginalSize = Number(req.body?.originalSize);
      if (Number.isFinite(rawOriginalSize) && rawOriginalSize > MAX_AD_IMAGE_INPUT_BYTES) {
        res.status(400).json({ error: 'AD_FILE_TOO_LARGE_5MB' });
        return;
      }

      const rawOriginalMime =
        typeof req.body?.originalMimeType === 'string'
          ? req.body.originalMimeType.trim().toLowerCase()
          : '';
      if (rawOriginalMime && !ALLOWED_RAW_AD_UPLOAD_MIMES.has(rawOriginalMime)) {
        res.status(400).json({ error: 'INVALID_AD_IMAGE_FORMAT' });
        return;
      }

      const decoded = decodeAndValidateBase64Image({
        dataBase64: req.body?.dataBase64,
        mimeType: req.body?.mimeType,
        fileName: req.body?.fileName,
      });
      if (!decoded.ok) {
        res.status(400).json({ error: decoded.error });
        return;
      }

      const width =
        typeof req.body?.width === 'number' && Number.isFinite(req.body.width)
          ? Math.max(0, Math.min(2400, Math.round(req.body.width)))
          : 0;
      const height =
        typeof req.body?.height === 'number' && Number.isFinite(req.body.height)
          ? Math.max(0, Math.min(2400, Math.round(req.body.height)))
          : 0;
      if (width > 1200 || height > 600) {
        res.status(400).json({ error: 'AD_DIMENSIONS_EXCEED_1200X600' });
        return;
      }
      if (width > 0 && height > 0 && Math.abs(width / height - 2) > 0.15) {
        res.status(400).json({ error: 'AD_ASPECT_RATIO_MUST_BE_2_TO_1' });
        return;
      }

      const bucketInfo = await resolveReadyStorageBucket().catch(() => null);
      if (bucketInfo?.bucket && bucketInfo.bucketExists && hasServiceCredentials) {
        try {
          const uploaded = await uploadImageBufferToStorage({
            bucket: bucketInfo.bucket,
            ownerUid: ctx.decoded.uid,
            folder: 'admin_ads',
            buffer: decoded.buffer,
            mimeType: decoded.mimeType,
            safeName: decoded.safeName,
          });

          res.status(201).json({
            ok: true,
            imageUrl: uploaded.url,
            storagePath: uploaded.storagePath,
            storageMode: 'firebase_storage',
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            width,
            height,
            bucketName: bucketInfo.bucketName,
          });
          return;
        } catch (err) {
          console.error('[MEDORA][AdminAdUpload][Storage] error:', err);
          res.status(500).json({ error: 'AD_STORAGE_UPLOAD_FAILED' });
          return;
        }
      }

      // Firebase Storage bucket is not initialized on this project: persist compressed 2:1 asset cleanly in medora_ad_assets
      if (decoded.buffer.length > MAX_FIRESTORE_AD_ASSET_BYTES) {
        res.status(400).json({ error: 'AD_IMAGE_TOO_LARGE_AFTER_COMPRESSION' });
        return;
      }

      try {
        const db = getEffectiveDb();
        const assetId = generateSafeAdAssetId();
        const storagePath = `firestore_assets/${assetId}`;
        const imageUrl = `/api/ads/assets/${assetId}`;
        await db.doc(`medora_ad_assets/${assetId}`).set({
          assetId,
          contentType: decoded.mimeType,
          size: decoded.buffer.length,
          width,
          height,
          dataBase64: decoded.buffer.toString('base64'),
          createdByUid: ctx.decoded.uid,
          createdByEmail: ctx.email,
          createdAt: FieldValue.serverTimestamp(),
        });

        res.status(201).json({
          ok: true,
          imageUrl,
          storagePath,
          storageMode: 'firestore_asset',
          size: decoded.buffer.length,
          mimeType: decoded.mimeType,
          width,
          height,
        });
      } catch (err) {
        console.error('[MEDORA][AdminAdUpload][Asset] error:', err);
        res.status(500).json({ error: 'AD_STORAGE_UPLOAD_FAILED' });
      }
    },
  );

  type AdEntityType = TargetedAdEntityType;

  async function resolveApprovedAdEntity(
    token: string,
    entityType: AdEntityType,
    entityUid: string,
    customMeta?: {
      entityName?: string;
      specialty?: string;
      clinicName?: string;
    },
  ): Promise<{
    doctorUid: string;
    entityType: AdEntityType;
    entityUid: string;
    entityName: string;
    doctorName: string;
    specialty: string;
    clinicName: string;
  } | null> {
    const db = getEffectiveDb();

    if (entityType === 'platform_service' || entityType === 'radiology_info') {
      const name =
        normalizeText(customMeta?.entityName, 160) ||
        (entityType === 'radiology_info'
          ? 'مركز أشعة وتصوير طبي شريك'
          : 'خدمات منصة MEDORA');
      return {
        doctorUid: '',
        entityType,
        entityUid: entityUid || (entityType === 'radiology_info' ? 'rad_partner' : 'medora_platform'),
        entityName: name,
        doctorName: name,
        specialty:
          normalizeText(customMeta?.specialty, 120) ||
          (entityType === 'radiology_info'
            ? 'مركز أشعة — إعلان تعريفي وتحويل فقط'
            : 'منصة MEDORA الطبية'),
        clinicName: normalizeText(customMeta?.clinicName, 160),
      };
    }

    if (entityType === 'doctor') {
      const [cardSnap, docSnap] = await Promise.all([
        db.doc(`doctor_public_cards/${entityUid}`).get().catch(() => null),
        db.doc(`doctor_profiles/${entityUid}`).get().catch(() => null),
      ]);
      const d = (
        cardSnap?.exists ? cardSnap.data() : docSnap?.exists ? docSnap.data() : null
      ) as Record<string, unknown> | null;
      if (!d || d.status !== 'Approved') return null;
      const name = normalizeText(d.fullName, 120);
      return {
        doctorUid: entityUid,
        entityType: 'doctor',
        entityUid,
        entityName: name,
        doctorName: name,
        specialty: normalizeText(d.specialty, 120),
        clinicName: normalizeText(d.clinicName, 160),
      };
    }

    if (entityType === 'pharmacy') {
      const snap = await db.doc(`pharmacy_profiles/${entityUid}`).get().catch(() => null);
      if (!snap?.exists) return null;
      const d = snap.data() as Record<string, unknown>;
      if (d.status !== 'Approved') return null;
      const name = normalizeText(d.pharmacyNameAr || d.pharmacyNameEn, 160);
      const location = [normalizeText(d.governorate, 80), normalizeText(d.district, 80)]
        .filter(Boolean)
        .join(' · ');
      return {
        doctorUid: '',
        entityType: 'pharmacy',
        entityUid,
        entityName: name,
        doctorName: name,
        specialty: 'صيدلية معتمدة',
        clinicName: location || normalizeText(d.address, 160),
      };
    }

    if (entityType === 'wholesaler') {
      const snap = await db.doc(`wholesaler_profiles/${entityUid}`).get().catch(() => null);
      if (!snap?.exists) return null;
      const d = snap.data() as Record<string, unknown>;
      if (d.status !== 'Approved') return null;
      const name = normalizeText(d.wholesalerNameAr || d.wholesalerNameEn, 160);
      const location = [normalizeText(d.governorate, 80), normalizeText(d.district, 80)]
        .filter(Boolean)
        .join(' · ');
      return {
        doctorUid: '',
        entityType: 'wholesaler',
        entityUid,
        entityName: name,
        doctorName: name,
        specialty: 'مذخر دوائي معتمد',
        clinicName: location || normalizeText(d.warehouseAddress, 160),
      };
    }

    const snap = await db.doc(`lab_profiles/${entityUid}`).get().catch(() => null);
    if (!snap?.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    if (d.status !== 'Approved') return null;
    const name = normalizeText(d.labNameAr || d.labNameEn, 160);
    const location = [normalizeText(d.governorate, 80), normalizeText(d.district, 80)]
      .filter(Boolean)
      .join(' · ');
    return {
      doctorUid: '',
      entityType: 'lab',
      entityUid,
      entityName: name,
      doctorName: name,
      specialty: 'مختبر طبي',
      clinicName: location || normalizeText(d.address, 160),
    };
  }

  async function cleanupAdStorageIfUnused(storagePath: string, excludeAdId?: string): Promise<void> {
    if (!storagePath) return;

    if (storagePath.startsWith('firestore_assets/')) {
      const assetId = storagePath.slice('firestore_assets/'.length).trim();
      const db = getEffectiveDb();
      if (!isValidAdAssetId(assetId)) return;
      const otherAdsSnap = await db
        .collection('medora_ads')
        .where('storagePath', '==', storagePath)
        .limit(5)
        .get()
        .catch(() => ({ docs: [] }));
      const stillUsedByAd = otherAdsSnap.docs.some((d) => d.id !== excludeAdId);
      if (stillUsedByAd) return;
      await db.doc(`medora_ad_assets/${assetId}`).delete().catch(() => undefined);
      return;
    }

    if (!storagePath.startsWith('medora_uploads/')) return;
    const bucketInfo = await resolveReadyStorageBucket().catch(() => null);
    const bucket = bucketInfo?.bucketExists ? bucketInfo.bucket : getStorageBucket();
    if (!bucket) return;

    if (adminDb && firestoreAdminReady) {
      const [otherAdsSnap, docsUsingBannerSnap] = await Promise.all([
        adminDb.collection('medora_ads').where('storagePath', '==', storagePath).limit(5).get(),
        adminDb
          .collection('doctor_profiles')
          .where('promotionalBannerPath', '==', storagePath)
          .limit(3)
          .get(),
      ]);
      const stillUsedByAd = otherAdsSnap.docs.some((d) => d.id !== excludeAdId);
      if (stillUsedByAd || !docsUsingBannerSnap.empty) {
        return;
      }
    }
    await deleteStorageObjectSafe(bucket, storagePath);
  }

  app.post('/api/admin/ads', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const rawEntityType = normalizeText(req.body?.entityType, 32).toLowerCase();
    if (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(rawEntityType)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }
    const entityType: AdEntityType = ALLOWED_AD_ENTITY_TYPES.has(
      rawEntityType as AdEntityType,
    )
      ? (rawEntityType as AdEntityType)
      : 'doctor';
    const isCustomMetaType =
      entityType === 'platform_service' || entityType === 'radiology_info';
    const entityUid =
      normalizeText(req.body?.entityUid || req.body?.doctorUid, 128) ||
      (isCustomMetaType ? `${entityType}_${Date.now().toString(36)}` : '');
    // Title & Description are strictly optional per platform ad rules
    const title = normalizeText(req.body?.title, 140);
    const description = normalizeText(req.body?.description, 600);
    const imageUrl = typeof req.body?.imageUrl === 'string' ? req.body.imageUrl.trim().slice(0, 1400) : '';
    const storagePath = normalizeText(req.body?.storagePath, 300);
    const ctaLabel = normalizeText(req.body?.ctaLabel, 60) || 'احجز الآن';
    const ctaLabelEn = normalizeText(req.body?.ctaLabelEn, 60) || 'Explore Now';
    const rawActionType = normalizeText(req.body?.actionType, 40) as TargetedAdActionType;
    const actionType: TargetedAdActionType =
      entityType === 'radiology_info'
        ? rawActionType === 'open_external_url'
          ? 'open_external_url'
          : 'info_only'
        : ALLOWED_AD_ACTION_TYPES.has(rawActionType)
          ? rawActionType
          : 'open_directory';
    const destinationTarget = normalizeText(req.body?.destinationTarget, 500);
    const badgeTextAr = normalizeText(req.body?.badgeTextAr, 60);
    const badgeTextEn = normalizeText(req.body?.badgeTextEn, 60);
    const targetPortals = normalizeTargetPortals(req.body?.targetPortals, entityType);
    const startDate = normalizeText(req.body?.startDate, 20);
    const endDate = normalizeText(req.body?.endDate, 20);
    const status =
      normalizeAdStatusInput(req.body?.status, req.body?.active) ?? 'published';
    const active = status === 'published';
    const storageMode = storagePath.startsWith('firestore_assets/')
      ? 'firestore_asset'
      : 'firebase_storage';
    const rawPriority = Number(req.body?.priority);
    const priority = Number.isFinite(rawPriority)
      ? Math.max(0, Math.min(100, Math.round(rawPriority)))
      : 10;

    if (!entityUid) {
      res.status(400).json({ error: 'INVALID_AD_PAYLOAD' });
      return;
    }
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      res.status(400).json({ error: 'INVALID_START_DATE' });
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ error: 'INVALID_END_DATE' });
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      res.status(400).json({ error: 'AD_DATE_RANGE_INVALID' });
      return;
    }
    if (status === 'published' && endDate && endDate < getBaghdadNow().dateStr) {
      res.status(400).json({ error: 'AD_EXPIRED_EXTEND_DATE_FIRST' });
      return;
    }
    if (!isValidAdImageUrl(imageUrl, storagePath)) {
      res.status(400).json({ error: 'AD_STORAGE_IMAGE_REQUIRED' });
      return;
    }

    try {
      const entityMeta = await resolveApprovedAdEntity(ctx.token, entityType, entityUid, {
        entityName: req.body?.entityName || title,
        specialty: req.body?.specialty,
        clinicName: req.body?.clinicName,
      });
      if (!entityMeta) {
        res.status(400).json({ error: 'APPROVED_ENTITY_NOT_FOUND' });
        return;
      }

      const adId = getSafeId('ad');
      const logId = getSafeId('adm_ad');
      const adPayload = {
        adId,
        source: 'super_admin' as const,
        approvedByAdmin: true,
        ...entityMeta,
        targetPortals,
        title,
        description,
        imageUrl,
        storagePath,
        storageMode,
        ctaLabel,
        ctaLabelEn,
        actionType,
        destinationTarget,
        badgeTextAr,
        badgeTextEn,
        startDate,
        endDate,
        status,
        active,
        priority,
        impressionsCount: 0,
        clicksCount: 0,
        createdByUid: ctx.decoded.uid,
        createdByEmail: ctx.email,
      };

      const createdAd = await runWithFirestoreFallback(
        async () => {
          const batch = adminDb!.batch();
          const adRef = adminDb!.doc(`medora_ads/${adId}`);
          batch.set(adRef, {
            ...adPayload,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: 'ADMIN_AD_CREATED',
            targetCollection: 'medora_ads',
            targetId: adId,
            details: `Created ${entityType} ad (${status}) for ${entityUid}`.slice(0, 600),
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          const saved = await adRef.get();
          return serializeValue(saved.data());
        },
        async () => {
          await restDb.commitWrites(ctx.token, [
            restDb.buildCreateWrite(`medora_ads/${adId}`, adPayload, ['createdAt', 'updatedAt'], false),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: 'ADMIN_AD_CREATED',
                targetCollection: 'medora_ads',
                targetId: adId,
                details: `Created ${entityType} ad (${status}) for ${entityUid}`.slice(0, 600),
              },
              ['createdAt'],
              false,
            ),
          ]);
          const saved = await restDb.getDoc(ctx.token, `medora_ads/${adId}`);
          return stripInternalDocMeta(saved);
        },
      );

      res.status(201).json({ ok: true, ad: createdAd });
    } catch (err) {
      console.error('Error creating ad:', err);
      res.status(500).json({ error: 'AD_CREATE_FAILED' });
    }
  });

  app.patch('/api/admin/ads/:adId', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const adId = normalizeText(req.params.adId, 128);
    if (!adId) {
      res.status(400).json({ error: 'INVALID_AD_ID' });
      return;
    }
    if (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(req.body?.entityType)) {
      res.status(403).json(buildImagingDisabledResponseBody());
      return;
    }

    const patchFields: Record<string, unknown> = {
      source: 'super_admin',
      approvedByAdmin: true,
    };
    if (typeof req.body?.title === 'string') {
      patchFields.title = normalizeText(req.body.title, 140);
    }
    if (typeof req.body?.description === 'string') {
      patchFields.description = normalizeText(req.body.description, 600);
    }
    if (req.body?.imageUrl !== undefined) {
      const nextImg = typeof req.body.imageUrl === 'string' ? req.body.imageUrl.trim().slice(0, 1400) : '';
      const nextPath = normalizeText(req.body?.storagePath, 300);
      if (!isValidAdImageUrl(nextImg, nextPath)) {
        res.status(400).json({ error: 'AD_STORAGE_IMAGE_REQUIRED' });
        return;
      }
      patchFields.imageUrl = nextImg;
      patchFields.storagePath = nextPath;
      patchFields.storageMode = nextPath.startsWith('firestore_assets/')
        ? 'firestore_asset'
        : 'firebase_storage';
    } else if (typeof req.body?.storagePath === 'string') {
      patchFields.storagePath = normalizeText(req.body.storagePath, 300);
    }
    if (typeof req.body?.ctaLabel === 'string' && req.body.ctaLabel.trim()) {
      patchFields.ctaLabel = normalizeText(req.body.ctaLabel, 60);
    }
    if (typeof req.body?.ctaLabelEn === 'string') {
      patchFields.ctaLabelEn = normalizeText(req.body.ctaLabelEn, 60);
    }
    if (typeof req.body?.actionType === 'string' && ALLOWED_AD_ACTION_TYPES.has(req.body.actionType as TargetedAdActionType)) {
      patchFields.actionType = req.body.actionType;
    }
    if (typeof req.body?.destinationTarget === 'string') {
      patchFields.destinationTarget = normalizeText(req.body.destinationTarget, 500);
    }
    if (typeof req.body?.badgeTextAr === 'string') {
      patchFields.badgeTextAr = normalizeText(req.body.badgeTextAr, 60);
    }
    if (typeof req.body?.badgeTextEn === 'string') {
      patchFields.badgeTextEn = normalizeText(req.body.badgeTextEn, 60);
    }
    if (req.body?.startDate !== undefined) {
      const sd = normalizeText(req.body.startDate, 20);
      if (sd && !/^\d{4}-\d{2}-\d{2}$/.test(sd)) {
        res.status(400).json({ error: 'INVALID_START_DATE' });
        return;
      }
      patchFields.startDate = sd;
    }
    if (req.body?.endDate !== undefined) {
      const ed = normalizeText(req.body.endDate, 20);
      if (ed && !/^\d{4}-\d{2}-\d{2}$/.test(ed)) {
        res.status(400).json({ error: 'INVALID_END_DATE' });
        return;
      }
      patchFields.endDate = ed;
    }
    const nextStatus = normalizeAdStatusInput(req.body?.status, req.body?.active);
    if (req.body?.status !== undefined && nextStatus === null) {
      res.status(400).json({ error: 'INVALID_AD_STATUS' });
      return;
    }
    if (nextStatus !== null) {
      patchFields.status = nextStatus;
      patchFields.active = nextStatus === 'published';
    }
    if (typeof req.body?.priority === 'number' && Number.isFinite(req.body.priority)) {
      patchFields.priority = Math.max(0, Math.min(100, Math.round(req.body.priority)));
    }

    const reqEntityTypeRaw = normalizeText(req.body?.entityType, 32).toLowerCase();
    const reqEntityUid = normalizeText(req.body?.entityUid || req.body?.doctorUid, 128);
    const logId = getSafeId('adm_ad');

    try {
      let replacedOldStoragePath = '';

      const result = await runWithFirestoreFallback(
        async () => {
          const adRef = adminDb!.doc(`medora_ads/${adId}`);
          const snap = await adRef.get();
          if (!snap.exists) return null;
          const existing = snap.data() as Record<string, unknown>;
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(existing.entityType)
          ) {
            return { error: IMAGING_PORTAL_DISABLED_CODE, blockedByFlag: true as const };
          }

          const currentType: AdEntityType = ALLOWED_AD_ENTITY_TYPES.has(
            String(existing.entityType || '') as AdEntityType,
          )
            ? (String(existing.entityType) as AdEntityType)
            : 'doctor';
          const targetType: AdEntityType = ALLOWED_AD_ENTITY_TYPES.has(
            reqEntityTypeRaw as AdEntityType,
          )
            ? (reqEntityTypeRaw as AdEntityType)
            : currentType;
          const currentUid = String(existing.entityUid || existing.doctorUid || '');
          const targetUid = reqEntityUid || currentUid;

          if (Array.isArray(req.body?.targetPortals)) {
            patchFields.targetPortals = normalizeTargetPortals(
              req.body.targetPortals,
              targetType,
            );
          } else if (targetType !== currentType) {
            patchFields.targetPortals = normalizeTargetPortals(
              existing.targetPortals,
              targetType,
            );
          }

          const effectiveStart =
            typeof patchFields.startDate === 'string'
              ? patchFields.startDate
              : String(existing.startDate || '');
          const effectiveEnd =
            typeof patchFields.endDate === 'string'
              ? patchFields.endDate
              : String(existing.endDate || '');
          if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
            return { error: 'AD_DATE_RANGE_INVALID' as const };
          }

          const effectiveStatus =
            (patchFields.status as MedoraAdStatus | undefined) ||
            (typeof existing.status === 'string' && ALLOWED_AD_STATUSES.has(existing.status as MedoraAdStatus)
              ? (existing.status as MedoraAdStatus)
              : existing.active === true
                ? 'published'
                : 'paused');

          if (effectiveStatus === 'published') {
            const effImageUrl = String(patchFields.imageUrl || existing.imageUrl || '');
            const effStoragePath = String(
              patchFields.storagePath !== undefined ? patchFields.storagePath : existing.storagePath || '',
            );
            if (!isValidAdImageUrl(effImageUrl, effStoragePath)) {
              return { error: 'AD_STORAGE_IMAGE_REQUIRED' as const };
            }
            if (effectiveEnd && effectiveEnd < getBaghdadNow().dateStr) {
              return { error: 'AD_EXPIRED_EXTEND_DATE_FIRST' as const };
            }
          }

          if (
            targetUid &&
            (targetUid !== currentUid ||
              targetType !== currentType ||
              targetType === 'platform_service' ||
              targetType === 'radiology_info')
          ) {
            const entityMeta = await resolveApprovedAdEntity(ctx.token, targetType, targetUid, {
              entityName: req.body?.entityName ?? existing.entityName,
              specialty: req.body?.specialty ?? existing.specialty,
              clinicName: req.body?.clinicName ?? existing.clinicName,
            });
            if (!entityMeta) {
              return { error: 'APPROVED_ENTITY_NOT_FOUND' as const };
            }
            Object.assign(patchFields, entityMeta);
          }

          const oldPath = typeof existing.storagePath === 'string' ? existing.storagePath : '';
          if (
            typeof patchFields.storagePath === 'string' &&
            oldPath &&
            patchFields.storagePath !== oldPath
          ) {
            replacedOldStoragePath = oldPath;
          }

          const batch = adminDb!.batch();
          batch.update(adRef, { ...patchFields, updatedAt: FieldValue.serverTimestamp() });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: 'ADMIN_AD_UPDATED',
            targetCollection: 'medora_ads',
            targetId: adId,
            details: `Updated ad ${adId} (status=${effectiveStatus})`,
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          const refreshed = await adRef.get();
          return { ad: serializeValue(refreshed.data()) };
        },
        async () => {
          const adPath = `medora_ads/${adId}`;
          const existing = await restDb.getDoc(ctx.token, adPath);
          if (!existing) return null;
          if (
            !IMAGING_PORTAL_ENABLED &&
            isImagingPortalIdentifier(existing.entityType)
          ) {
            return { error: IMAGING_PORTAL_DISABLED_CODE, blockedByFlag: true as const };
          }

          const currentType: AdEntityType = ALLOWED_AD_ENTITY_TYPES.has(
            String(existing.entityType || '') as AdEntityType,
          )
            ? (String(existing.entityType) as AdEntityType)
            : 'doctor';
          const targetType: AdEntityType = ALLOWED_AD_ENTITY_TYPES.has(
            reqEntityTypeRaw as AdEntityType,
          )
            ? (reqEntityTypeRaw as AdEntityType)
            : currentType;
          const currentUid = String(existing.entityUid || existing.doctorUid || '');
          const targetUid = reqEntityUid || currentUid;

          if (Array.isArray(req.body?.targetPortals)) {
            patchFields.targetPortals = normalizeTargetPortals(
              req.body.targetPortals,
              targetType,
            );
          } else if (targetType !== currentType) {
            patchFields.targetPortals = normalizeTargetPortals(
              existing.targetPortals,
              targetType,
            );
          }

          const effectiveStart =
            typeof patchFields.startDate === 'string'
              ? patchFields.startDate
              : String(existing.startDate || '');
          const effectiveEnd =
            typeof patchFields.endDate === 'string'
              ? patchFields.endDate
              : String(existing.endDate || '');
          if (effectiveStart && effectiveEnd && effectiveEnd < effectiveStart) {
            return { error: 'AD_DATE_RANGE_INVALID' as const };
          }

          const effectiveStatus =
            (patchFields.status as MedoraAdStatus | undefined) ||
            (typeof existing.status === 'string' && ALLOWED_AD_STATUSES.has(existing.status as MedoraAdStatus)
              ? (existing.status as MedoraAdStatus)
              : existing.active === true
                ? 'published'
                : 'paused');

          if (effectiveStatus === 'published') {
            const effImageUrl = String(patchFields.imageUrl || existing.imageUrl || '');
            const effStoragePath = String(
              patchFields.storagePath !== undefined ? patchFields.storagePath : existing.storagePath || '',
            );
            if (!isValidAdImageUrl(effImageUrl, effStoragePath)) {
              return { error: 'AD_STORAGE_IMAGE_REQUIRED' as const };
            }
            if (effectiveEnd && effectiveEnd < getBaghdadNow().dateStr) {
              return { error: 'AD_EXPIRED_EXTEND_DATE_FIRST' as const };
            }
          }

          if (
            targetUid &&
            (targetUid !== currentUid ||
              targetType !== currentType ||
              targetType === 'platform_service' ||
              targetType === 'radiology_info')
          ) {
            const entityMeta = await resolveApprovedAdEntity(ctx.token, targetType, targetUid, {
              entityName: req.body?.entityName ?? existing.entityName,
              specialty: req.body?.specialty ?? existing.specialty,
              clinicName: req.body?.clinicName ?? existing.clinicName,
            });
            if (!entityMeta) {
              return { error: 'APPROVED_ENTITY_NOT_FOUND' as const };
            }
            Object.assign(patchFields, entityMeta);
          }

          const oldPath = typeof existing.storagePath === 'string' ? existing.storagePath : '';
          if (
            typeof patchFields.storagePath === 'string' &&
            oldPath &&
            patchFields.storagePath !== oldPath
          ) {
            replacedOldStoragePath = oldPath;
          }

          await restDb.commitWrites(ctx.token, [
            restDb.buildUpdateWrite(adPath, patchFields, ['updatedAt']),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: 'ADMIN_AD_UPDATED',
                targetCollection: 'medora_ads',
                targetId: adId,
                details: `Updated ad ${adId} (status=${effectiveStatus})`,
              },
              ['createdAt'],
              false,
            ),
          ]);
          const refreshed = await restDb.getDoc(ctx.token, adPath);
          return { ad: stripInternalDocMeta(refreshed) };
        },
      );

      if (!result) {
        res.status(404).json({ error: 'AD_NOT_FOUND' });
        return;
      }
      if ('error' in result) {
        if ('blockedByFlag' in result && result.blockedByFlag) {
          res.status(403).json(buildImagingDisabledResponseBody());
          return;
        }
        res.status(400).json({ error: result.error });
        return;
      }

      if (replacedOldStoragePath) {
        await cleanupAdStorageIfUnused(replacedOldStoragePath, adId);
      }

      res.json({ ok: true, ad: result.ad });
    } catch (err) {
      console.error('Error updating ad:', err);
      res.status(500).json({ error: 'AD_UPDATE_FAILED' });
    }
  });

  app.delete('/api/admin/ads/:adId', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const adId = normalizeText(req.params.adId, 128);
    if (!adId) {
      res.status(400).json({ error: 'INVALID_AD_ID' });
      return;
    }
    const logId = getSafeId('adm_ad');
    try {
      let deletedStoragePath = '';
      const deleted = await runWithFirestoreFallback(
        async () => {
          const adRef = adminDb!.doc(`medora_ads/${adId}`);
          const snap = await adRef.get();
          if (!snap.exists) return false;
          const prevData = snap.data() as Record<string, unknown>;
          deletedStoragePath =
            typeof prevData.storagePath === 'string' ? prevData.storagePath : '';
          const batch = adminDb!.batch();
          batch.delete(adRef);
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: 'ADMIN_AD_DELETED',
            targetCollection: 'medora_ads',
            targetId: adId,
            details: `Deleted ad ${adId}`,
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          return true;
        },
        async () => {
          const existing = await restDb.getDoc(ctx.token, `medora_ads/${adId}`);
          if (!existing) return false;
          deletedStoragePath =
            typeof existing.storagePath === 'string' ? existing.storagePath : '';
          await restDb.commitWrites(ctx.token, [
            restDb.buildDeleteWrite(`medora_ads/${adId}`),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: 'ADMIN_AD_DELETED',
                targetCollection: 'medora_ads',
                targetId: adId,
                details: `Deleted ad ${adId}`,
              },
              ['createdAt'],
              false,
            ),
          ]);
          return true;
        },
      );
      if (!deleted) {
        res.status(404).json({ error: 'AD_NOT_FOUND' });
        return;
      }

      if (deletedStoragePath) {
        await cleanupAdStorageIfUnused(deletedStoragePath, adId);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Error deleting ad:', err);
      res.status(500).json({ error: 'AD_DELETE_FAILED' });
    }
  });

  app.patch('/api/admin/reviews/:reviewId', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const reviewId = normalizeText(req.params.reviewId, 128);
    const status = normalizeText(req.body?.status, 20);
    const moderationNote = normalizeText(req.body?.moderationNote, 500);
    if (!reviewId || (status !== 'approved' && status !== 'rejected')) {
      res.status(400).json({ error: 'INVALID_REVIEW_MODERATION' });
      return;
    }
    const logId = getSafeId('adm_rev');
    try {
      const updated = await runWithFirestoreFallback(
        async () => {
          const refDoc = adminDb!.doc(`doctor_reviews/${reviewId}`);
          const snap = await refDoc.get();
          if (!snap.exists) return null;
          const prev = snap.data() as Record<string, unknown>;
          const batch = adminDb!.batch();
          batch.update(refDoc, {
            status,
            moderationNote,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: `ADMIN_REVIEW_${status.toUpperCase()}`,
            targetCollection: 'doctor_reviews',
            targetId: reviewId,
            details: `Moderated review ${reviewId} -> ${status}`,
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          if (typeof prev.doctorUid === 'string' && prev.doctorUid) {
            await recalculateDoctorRatingSummary(adminDb!, prev.doctorUid);
          }
          const refreshed = await refDoc.get();
          return serializeValue(refreshed.data());
        },
        async () => {
          const revPath = `doctor_reviews/${reviewId}`;
          const existing = await restDb.getDoc(ctx.token, revPath);
          if (!existing) return null;
          await restDb.commitWrites(ctx.token, [
            restDb.buildUpdateWrite(revPath, { status, moderationNote }, ['updatedAt']),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: `ADMIN_REVIEW_${status.toUpperCase()}`,
                targetCollection: 'doctor_reviews',
                targetId: reviewId,
                details: `Moderated review ${reviewId} -> ${status}`,
              },
              ['createdAt'],
              false,
            ),
          ]);
          const refreshed = await restDb.getDoc(ctx.token, revPath);
          return stripInternalDocMeta(refreshed);
        },
      );
      if (!updated) {
        res.status(404).json({ error: 'REVIEW_NOT_FOUND' });
        return;
      }
      res.json({ ok: true, review: updated });
    } catch (err) {
      console.error('Error moderating review:', err);
      res.status(500).json({ error: 'REVIEW_MODERATION_FAILED' });
    }
  });

  app.patch('/api/admin/feedback/:feedbackId', requireSuperAdmin, async (req, res) => {
    const ctx = (req as Request & { adminCtx: VerifiedAdminContext }).adminCtx;
    const feedbackId = normalizeText(req.params.feedbackId, 128);
    const status = normalizeText(req.body?.status, 30);
    const adminReply = typeof req.body?.adminReply === 'string' ? req.body.adminReply.trim().slice(0, 1500) : undefined;
    const allowed = new Set(['new', 'in_review', 'resolved', 'closed']);
    if (!feedbackId || (status && !allowed.has(status))) {
      res.status(400).json({ error: 'INVALID_FEEDBACK_UPDATE' });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (adminReply !== undefined) patch.adminReply = adminReply;
    const logId = getSafeId('adm_fbk');
    try {
      const updated = await runWithFirestoreFallback(
        async () => {
          const refDoc = adminDb!.doc(`patient_feedback/${feedbackId}`);
          const snap = await refDoc.get();
          if (!snap.exists) return null;
          const prev = snap.data() as Record<string, unknown>;
          const batch = adminDb!.batch();
          batch.update(refDoc, { ...patch, updatedAt: FieldValue.serverTimestamp() });
          batch.set(adminDb!.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: ctx.decoded.uid,
            actorEmail: ctx.email,
            action: 'ADMIN_FEEDBACK_UPDATED',
            targetCollection: 'patient_feedback',
            targetId: feedbackId,
            details: `Updated feedback ${feedbackId}: status=${status || 'unchanged'}`,
            createdAt: FieldValue.serverTimestamp(),
          });
          await batch.commit();
          if (typeof prev.patientUid === 'string' && prev.patientUid && (adminReply || status === 'resolved')) {
            await emitPatientNotification(adminDb!, {
              patientUid: prev.patientUid,
              type: 'announcement',
              title: 'رد الإدارة على ملاحظتك أو شكواك',
              body: adminReply
                ? `${String(prev.subject || '')}: ${adminReply.slice(0, 220)}`
                : `تم تحديث حالة رسالتك "${String(prev.subject || '')}" إلى: ${status}`,
              relatedId: feedbackId,
              relatedType: 'patient_feedback',
            });
          }
          const refreshed = await refDoc.get();
          return serializeValue(refreshed.data());
        },
        async () => {
          const fbkPath = `patient_feedback/${feedbackId}`;
          const existing = await restDb.getDoc(ctx.token, fbkPath);
          if (!existing) return null;
          await restDb.commitWrites(ctx.token, [
            restDb.buildUpdateWrite(fbkPath, patch, ['updatedAt']),
            restDb.buildCreateWrite(
              `audit_logs/${logId}`,
              {
                logId,
                actorUid: ctx.decoded.uid,
                actorEmail: ctx.email,
                action: 'ADMIN_FEEDBACK_UPDATED',
                targetCollection: 'patient_feedback',
                targetId: feedbackId,
                details: `Updated feedback ${feedbackId}: status=${status || 'unchanged'}`,
              },
              ['createdAt'],
              false,
            ),
          ]);
          const refreshed = await restDb.getDoc(ctx.token, fbkPath);
          return stripInternalDocMeta(refreshed);
        },
      );
      if (!updated) {
        res.status(404).json({ error: 'FEEDBACK_NOT_FOUND' });
        return;
      }
      res.json({ ok: true, feedback: updated });
    } catch (err) {
      console.error('Error updating feedback:', err);
      res.status(500).json({ error: 'FEEDBACK_UPDATE_FAILED' });
    }
  });

  app.use(
    '/api',
    createDoctorRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      getStorageBucket,
      resolveReadyStorageBucket,
      hasServiceCredentials: () => hasServiceCredentials,
    }),
  );

  app.use(
    '/api',
    createPatientRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      getStorageBucket,
      resolveReadyStorageBucket,
      hasServiceCredentials: () => hasServiceCredentials,
    }),
  );

  app.use(
    '/api',
    createLabRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      getStorageBucket,
      resolveReadyStorageBucket,
      hasServiceCredentials: () => hasServiceCredentials,
    }),
  );

  app.use(
    '/api',
    createAdminLabsRouter({
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      requireSuperAdmin,
    }),
  );

  const haneenStore = new HaneenStore({
    getAdminDb: getEffectiveDb,
    isFirestoreAdminReady: () => true,
  });

  app.use(
    '/api',
    createHaneenRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      restDb,
      store: haneenStore,
    }),
  );

  app.use(
    '/api',
    createAdminHaneenRouter({
      requireSuperAdmin,
      store: haneenStore,
    }),
  );

  app.use(
    '/api',
    createSecretaryRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
    }),
  );

  app.use(
    '/api',
    createPharmacyRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      resolveReadyStorageBucket,
      hasServiceCredentials: () => hasServiceCredentials,
    }),
  );

  app.use(
    '/api',
    createWholesalerRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      resolveReadyStorageBucket,
      hasServiceCredentials: () => hasServiceCredentials,
    }),
  );

  app.use(
    '/api',
    createMedicineFinderRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
    }),
  );

  app.use(
    '/api',
    createAdminPharmacyWholesalerRouter({
      requireSuperAdmin,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
    }),
  );

  app.use(
    '/api',
    createAdsRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      requireSuperAdmin,
    }),
  );

  app.use(
    '/api',
    createCommerceRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      requireSuperAdmin,
    }),
  );

  app.use(
    '/api',
    createMessagingRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      requireSuperAdmin,
    }),
  );

  const notificationEngine = new NotificationEngine({
    getAdminDb: getEffectiveDb,
    isFirestoreAdminReady: () => true,
  });
  bindGlobalNotificationEngine(notificationEngine);

  app.post('/api/portals/registration-submitted', async (req, res) => {
    const authRes = await verifyAuthenticatedUserBearer(req);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ error: authRes.error });
      return;
    }
    const requestId = normalizeText(req.body?.requestId, 128);
    if (!requestId) {
      res.status(400).json({ error: 'INVALID_REQUEST_ID' });
      return;
    }
    try {
      const effectiveDb = getEffectiveDb();
      const reqSnap = await effectiveDb.doc(`registration_requests/${requestId}`).get();
      if (!reqSnap.exists) {
        res.status(404).json({ error: 'REQUEST_NOT_FOUND' });
        return;
      }
      const reqData = reqSnap.data() as Record<string, unknown>;
      if (String(reqData.uid || '') !== authRes.uid) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      const portalType = String(reqData.portalType || '');
      const applicantName = normalizeText(reqData.applicantName, 120) || 'متقدم جديد';
      const reqNum = normalizeText(reqData.requestNumber, 60) || requestId;
      await emitAdminNotification(effectiveDb, {
        eventType: 'registration_decision',
        type: 'registration',
        title: `طلب تسجيل جديد (${portalType}): ${applicantName}`,
        body: `رقم الطلب: ${reqNum} · الحالة: ${String(reqData.status || 'Submitted')}`,
        relatedId: requestId,
        relatedType: 'registration_request',
        idempotencyKey: `adm_reg_sub:${requestId}`,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[MEDORA][RegistrationNotify] error:', err);
      res.status(500).json({ error: 'REGISTRATION_NOTIFY_FAILED' });
    }
  });

  app.use(
    '/api',
    createPhoneRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      onPhoneUpdated: async (uid, action) => {
        const verifiedRole = await notificationEngine.resolveUserRole(uid);
        await notificationEngine.dispatch({
          eventType: 'important_account_update',
          recipientUid: uid,
          recipientRole: verifiedRole,
          title:
            action === 'linked'
              ? 'تم ربط رقم الهاتف العراقي بحسابك بنجاح'
              : 'تم فك ربط رقم الهاتف من حسابك',
          body:
            action === 'linked'
              ? 'تم التحقق من ربط الرقم بحساب Google الخاص بك في MEDORA.'
              : 'تمت إزالة الرقم وإرجاع قناة الإشعارات الافتراضية إلى داخل المنصة.',
          inAppType: 'admin_notice',
          relatedId: uid,
          relatedType: 'phone_security',
          idempotencyKey: `phone_${action}:${uid}:${Date.now().toString(36)}`,
        });
      },
    }),
  );

  app.use(
    '/api',
    createNotificationRouter({
      adminAuth,
      getAdminDb: getEffectiveDb,
      isFirestoreAdminReady: () => true,
      engine: notificationEngine,
      requireSuperAdmin,
    }),
  );

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const readCliArg = (flag: string): string | undefined => {
    const idx = process.argv.indexOf(flag);
    if (idx !== -1 && idx + 1 < process.argv.length) {
      return process.argv[idx + 1];
    }
    const prefix = `${flag}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : undefined;
  };

  const cliPort = Number(readCliArg('--port'));
  const port =
    Number.isFinite(cliPort) && cliPort > 0
      ? cliPort
      : Number(process.env.PORT) || 3000;
  const host = readCliArg('--host') || '0.0.0.0';

  const server = app.listen(port, host, () => {
    void ensureAuthorizedSuperAdminProvisioned().catch((err) => {
      console.error('[MEDORA] Super Admin bootstrap warning:', err);
    });
    console.log(`MEDORA server running on http://${host}:${port}`);
  });

  server.on('error', (err) => {
    console.error('MEDORA HTTP server error:', err);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('[MEDORA] Unhandled promise rejection:', reason);
});

createServer().catch((err) => {
  console.error('Failed to start MEDORA server:', err);
  process.exit(1);
});
