import { type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  fileToDataUrl,
  isValidAdImageUrlClient,
  prepareAdImageFile,
  prepareUploadPayloadFromFile,
} from '../utils/imagePreparation';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  IMAGING_PORTAL_DISABLED_MESSAGE_AR,
  isImagingPortalIdentifier,
  resolveImagingPortalEnabled,
} from '../config/featureFlags';
import type {
  ActivationRule,
  AdminCollectionError,
  AdminMessageCategory,
  AdminMessageRecord,
  AdminMessageStatus,
  AdminRoleRecord,
  AuditLogRecord,
  InstitutionRecord,
  PersonalProfileInput,
  PortalFormPayload,
  PortalType,
  RegistrationRequest,
  RequestStatus,
  SubscriptionStatus,
  SuperAdminServerStatus,
  SuperAdminVerifyResult,
  UploadedDocMeta,
  UserAccount,
} from '../types/medora';
import type { PublicDoctorCard } from '../types/doctor';
import type {
  AdActionType,
  AdEntityType,
  AdTargetPortal,
  DoctorReviewRecord,
  DoctorReviewStatus,
  MedoraAdRecord,
  MedoraAdStatus,
  PatientFeedbackRecord,
  PatientFeedbackStatus,
} from '../types/patient';

const ALLOWED_DOC_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

function trimStr(value: string | undefined | null, maxLen: number): string {
  return (value || '').trim().slice(0, maxLen);
}

function generateSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function generateRequestNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MDR-${y}${m}${d}-${suffix}`;
}

export function calculateAgeFromDob(dob: string): number {
  if (!dob) return 0;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, Math.min(130, age));
}

export async function appendAuditLog(params: {
  actorUid: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details: string;
}): Promise<void> {
  const logId = generateSafeId('log');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      logId,
      actorUid: params.actorUid,
      actorEmail: trimStr(params.actorEmail, 254),
      action: trimStr(params.action, 120),
      targetCollection: trimStr(params.targetCollection, 80),
      targetId: trimStr(params.targetId, 128),
      details: trimStr(params.details, 600),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

const inFlightSyncByUid = new Map<string, Promise<UserAccount>>();

function isFirestoreUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code || '').toLowerCase() : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    code === 'auth/network-request-failed' ||
    code === 'unknown' ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document because the client is offline') ||
    msg.includes('network error') ||
    msg.includes('network-request-failed') ||
    msg.includes('fetching auth token failed') ||
    msg.includes('internal assertion failed') ||
    msg.includes('3c6b') ||
    msg.includes('unavailable')
  );
}

function isFirestorePermissionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String((err as { code?: unknown }).code || '').toLowerCase() : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code === 'permission-denied' ||
    code === 'firestore/permission-denied' ||
    msg.includes('missing or insufficient permissions') ||
    msg.includes('permission-denied')
  );
}

export interface AuthSessionServerResult {
  user: UserAccount | null;
  requests: RegistrationRequest[];
  imagingPortalEnabled: boolean;
  imagingAccessBlocked: boolean;
  hasOtherAllowedPortal: boolean;
}

async function syncSessionViaServer(
  firebaseUser: User,
  payload: { email: string; googleName: string; photoUrl: string },
): Promise<UserAccount> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: UserAccount | null;
    error?: string;
    message?: string;
  };
  if (!res.ok || !body.ok || !body.user) {
    throw new Error(body.message || body.error || `SESSION_SYNC_FAILED_${res.status}`);
  }
  return body.user;
}

async function fetchSessionViaServer(
  firebaseUser: User,
): Promise<AuthSessionServerResult> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: UserAccount | null;
    requests?: RegistrationRequest[];
    featureFlags?: { imagingPortalEnabled?: boolean };
    imagingAccessBlocked?: boolean;
    hasOtherAllowedPortal?: boolean;
    error?: string;
    message?: string;
  };
  if (!res.ok || !body.ok) {
    throw new Error(body.message || body.error || `SESSION_FETCH_FAILED_${res.status}`);
  }
  return {
    user: body.user || null,
    requests: Array.isArray(body.requests) ? body.requests : [],
    imagingPortalEnabled: resolveImagingPortalEnabled(
      body.featureFlags?.imagingPortalEnabled,
    ),
    imagingAccessBlocked: Boolean(body.imagingAccessBlocked),
    hasOtherAllowedPortal: Boolean(body.hasOtherAllowedPortal),
  };
}

export async function fetchServerSessionState(
  firebaseUser: User,
): Promise<AuthSessionServerResult> {
  return fetchSessionViaServer(firebaseUser);
}

export async function syncUserOnGoogleSignIn(
  firebaseUser: User,
): Promise<UserAccount> {
  const uid = firebaseUser.uid;
  const existingPromise = inFlightSyncByUid.get(uid);
  if (existingPromise) {
    return existingPromise;
  }

  const syncPromise = (async () => {
    const userPath = `users/${uid}`;
    const userRef = doc(db, 'users', uid);

    const rawEmail =
      firebaseUser.email ||
      firebaseUser.providerData?.find((p) => typeof p?.email === 'string' && p.email)?.email ||
      '';
    const email = trimStr(rawEmail, 254);
    const googleName = trimStr(
      firebaseUser.displayName || email.split('@')[0] || 'MEDORA User',
      120,
    );
    const photoUrl = trimStr(firebaseUser.photoURL, 1000);

    // Prefer verified server session endpoint first to avoid client Firestore TransactionRunner
    // internal assertion failures (ID: 3c6b) when auth tokens refresh transiently.
    try {
      return await syncSessionViaServer(firebaseUser, {
        email,
        googleName,
        photoUrl,
      });
    } catch (serverErr) {
      const serverErrMsg =
        serverErr instanceof Error ? serverErr.message : String(serverErr || '');
      if (
        serverErrMsg.includes('IMAGING_PORTAL_DISABLED') ||
        serverErrMsg.includes('UNAUTHENTICATED')
      ) {
        throw serverErr;
      }
      console.warn('Primary server session sync fallback to direct Firestore:', serverErr);
    }

    let wasCreated = false;
    let attemptedOp = OperationType.GET;
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        wasCreated = true;
        attemptedOp = OperationType.CREATE;
        const newUserDoc: Record<string, unknown> = {
          uid,
          email,
          googleName,
          accountStatus: 'pending_profile',
          selectedPortal: 'none',
          registrationCompleted: false,
          personalProfileCompleted: false,
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (photoUrl) {
          newUserDoc.photoUrl = photoUrl;
          newUserDoc.avatarUrl = photoUrl;
        }
        await setDoc(userRef, newUserDoc);
      } else {
        attemptedOp = OperationType.UPDATE;
        const updatePayload: Record<string, unknown> = {
          email,
          googleName,
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (photoUrl) {
          updatePayload.photoUrl = photoUrl;
        }
        await updateDoc(userRef, updatePayload);
      }
    } catch (err) {
      handleFirestoreError(err, attemptedOp, userPath);
    }

    await appendAuditLog({
      actorUid: uid,
      actorEmail: email,
      action: wasCreated ? 'USER_GOOGLE_REGISTERED' : 'USER_GOOGLE_LOGIN',
      targetCollection: 'users',
      targetId: uid,
      details: wasCreated
        ? 'New Google account initialized in MEDORA'
        : 'Existing user authenticated via Google Sign-In',
    });

    try {
      const refreshed = await getDoc(userRef);
      return refreshed.data() as UserAccount;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }
  })().finally(() => {
    inFlightSyncByUid.delete(uid);
  });

  inFlightSyncByUid.set(uid, syncPromise);
  return syncPromise;
}

export async function fetchUserAccount(uid: string): Promise<UserAccount | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? (snap.data() as UserAccount) : null;
  } catch (err) {
    if (
      (isFirestoreUnavailableError(err) || isFirestorePermissionError(err)) &&
      auth.currentUser?.uid === uid
    ) {
      try {
        const session = await fetchSessionViaServer(auth.currentUser);
        return session.user;
      } catch (serverErr) {
        console.warn('Server fetchUserAccount fallback warning:', serverErr);
      }
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePersonalProfile(
  uid: string,
  currentUser: UserAccount,
  input: PersonalProfileInput,
): Promise<UserAccount> {
  const path = `users/${uid}`;
  const computedAge = calculateAgeFromDob(input.dateOfBirth);
  const nextStatus =
    !currentUser.accountStatus || currentUser.accountStatus === 'pending_profile'
      ? 'profile_completed'
      : currentUser.accountStatus;

  const trimmedAvatarPath = trimStr(input.avatarPath, 300);
  const safeAvatarUrl =
    input.avatarUrl && input.avatarUrl.startsWith('data:')
      ? ''
      : trimStr(input.avatarUrl, 1000);
  const updatePayload: Record<string, unknown> = {
    fullName: trimStr(input.fullName, 120),
    dateOfBirth: trimStr(input.dateOfBirth, 20),
    age: computedAge,
    gender: input.gender,
    governorate: trimStr(input.governorate, 80),
    district: trimStr(input.district, 80),
    address: trimStr(input.address, 240),
    phone: trimStr(input.phone, 32),
    avatarUrl: safeAvatarUrl,
    ...(trimmedAvatarPath || currentUser.avatarPath
      ? { avatarPath: trimmedAvatarPath }
      : {}),
    personalProfileCompleted: true,
    accountStatus: nextStatus,
    updatedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, 'users', uid), updatePayload);
  } catch (err) {
    const errCode =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
    if (
      (isFirestoreUnavailableError(err) || isFirestorePermissionError(err)) &&
      auth.currentUser?.uid === uid
    ) {
      if (errCode === 'permission-denied' && 'avatarPath' in updatePayload) {
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.avatarPath;
        try {
          await updateDoc(doc(db, 'users', uid), fallbackPayload);
          return await (async () => {
            const updated = await getDoc(doc(db, 'users', uid));
            return updated.data() as UserAccount;
          })();
        } catch {
          // Fall through to verified server profile endpoint
        }
      }
      try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch('/api/auth/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fullName: updatePayload.fullName,
            dateOfBirth: updatePayload.dateOfBirth,
            gender: updatePayload.gender,
            governorate: updatePayload.governorate,
            district: updatePayload.district,
            address: updatePayload.address,
            phone: updatePayload.phone,
            avatarUrl: updatePayload.avatarUrl,
            avatarPath: trimmedAvatarPath,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: UserAccount;
          error?: string;
          message?: string;
        };
        if (res.ok && body.ok && body.user) {
          return body.user;
        }
        if (res.status >= 400 && res.status < 500 && body.error) {
          throw new Error(body.error);
        }
      } catch (serverErr) {
        if (
          serverErr instanceof Error &&
          (serverErr.message === 'PHONE_ALREADY_REGISTERED' ||
            serverErr.message.startsWith('INVALID_'))
        ) {
          throw serverErr;
        }
        console.warn('Server savePersonalProfile fallback warning:', serverErr);
      }
      handleFirestoreError(err, OperationType.UPDATE, path);
    } else {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  await appendAuditLog({
    actorUid: uid,
    actorEmail: currentUser.email,
    action: 'PERSONAL_PROFILE_SAVED',
    targetCollection: 'users',
    targetId: uid,
    details: 'Shared personal profile information updated',
  });

  try {
    const updated = await getDoc(doc(db, 'users', uid));
    return updated.data() as UserAccount;
  } catch (err) {
    if (isFirestoreUnavailableError(err) && auth.currentUser?.uid === uid) {
      try {
        const session = await fetchSessionViaServer(auth.currentUser);
        if (session.user) return session.user;
      } catch {
        // Fall through to handleFirestoreError
      }
    }
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function fetchUserRequests(
  uid: string,
): Promise<RegistrationRequest[]> {
  const path = 'registration_requests';
  try {
    const q = query(
      collection(db, 'registration_requests'),
      where('uid', '==', uid),
      limit(25),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as RegistrationRequest);
  } catch (err) {
    if (
      (isFirestoreUnavailableError(err) || isFirestorePermissionError(err)) &&
      auth.currentUser?.uid === uid
    ) {
      try {
        const session = await fetchSessionViaServer(auth.currentUser);
        return session.requests;
      } catch (serverErr) {
        console.warn('Server fetchUserRequests fallback warning:', serverErr);
      }
    }
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function uploadMedoraFile(
  firebaseUserOrUid: User | string,
  folder: 'avatars' | 'doctor_docs' | 'lab_docs' | 'pharmacy_docs' | 'wholesaler_docs' | 'message_files',
  file: File,
): Promise<UploadedDocMeta> {
  const activeUser =
    typeof firebaseUserOrUid === 'string' ? auth.currentUser : firebaseUserOrUid;
  if (!activeUser) {
    throw new Error('UNAUTHENTICATED');
  }

  const isAvatar = folder === 'avatars';
  const prepared = await prepareUploadPayloadFromFile(file, {
    kind: isAvatar ? 'avatar' : 'clinical_doc',
    defaultBaseName: folder,
  });

  const token = await activeUser.getIdToken();
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      folder,
      dataBase64: prepared.dataBase64,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    file?: UploadedDocMeta;
  };
  if (!res.ok || !body.file?.url) {
    throw new Error(body.error || 'MEDIA_UPLOAD_FAILED');
  }

  return {
    name: trimStr(body.file.name || prepared.fileName, 120),
    size: body.file.size || prepared.preparedFile.size,
    mimeType: body.file.mimeType || prepared.mimeType,
    url: trimStr(body.file.url, 1000),
    storagePath: trimStr(body.file.storagePath, 300),
    uploadedAtIso: body.file.uploadedAtIso || new Date().toISOString(),
  };
}

async function safeGetDoc(path: string, refDoc: ReturnType<typeof doc>) {
  try {
    return await getDoc(refDoc);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export async function submitPortalRegistration(params: {
  user: UserAccount;
  payload: PortalFormPayload;
  existingRequest?: RegistrationRequest | null;
}): Promise<RegistrationRequest> {
  const { user, payload, existingRequest } = params;
  const uid = user.uid;
  const portal = payload.portal;

  if (!CLIENT_IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(portal as string)) {
    throw new Error(IMAGING_PORTAL_DISABLED_MESSAGE_AR);
  }

  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error('UNAUTHENTICATED');
  }

  if (auth.currentUser.emailVerified !== true) {
    throw new Error('EMAIL_UNVERIFIED');
  }

  if (
    trimStr(user.fullName || user.googleName, 120).length < 2 ||
    trimStr(user.dateOfBirth, 20).length < 4 ||
    trimStr(user.governorate, 80).length < 2 ||
    trimStr(user.district, 80).length < 2 ||
    trimStr(user.address, 240).length < 2
  ) {
    throw new Error('INCOMPLETE_PERSONAL_PROFILE');
  }

  if (portal === 'secretary') {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch('/api/secretary/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        phone: trimStr(payload.data.phone || user.phone, 32),
        educationQualification: trimStr(payload.data.educationQualification, 160),
        previousExperience: trimStr(payload.data.previousExperience, 400),
        bio: trimStr(payload.data.bio, 500),
        acceptedTerms: true,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      request?: RegistrationRequest;
    };
    if (!res.ok || !body.ok || !body.request) {
      throw new Error(body.error || `SECRETARY_REGISTER_FAILED_${res.status}`);
    }
    return body.request;
  }

  // Enforce duplicate check directly against Firestore in addition to client state
  const liveRequests = await fetchUserRequests(uid);
  const liveMatch =
    liveRequests.find(
      (r) =>
        r.portalType === portal &&
        (r.status === 'Submitted' ||
          r.status === 'Under Review' ||
          r.status === 'Approved'),
    ) ||
    liveRequests.find((r) => r.portalType === portal) ||
    existingRequest ||
    null;

  if (
    liveMatch &&
    liveMatch.portalType === portal &&
    (liveMatch.status === 'Submitted' ||
      liveMatch.status === 'Under Review' ||
      liveMatch.status === 'Approved')
  ) {
    throw new Error('DUPLICATE_ACTIVE_REQUEST');
  }

  const isResubmit =
    liveMatch &&
    liveMatch.portalType === portal &&
    (liveMatch.status === 'Draft' ||
      liveMatch.status === 'Requires Changes');

  const requestId = isResubmit
    ? liveMatch.requestId
    : generateSafeId(`req_${portal}`);
  const requestNumber = isResubmit
    ? liveMatch.requestNumber
    : generateRequestNumber();

  const activationRule: ActivationRule =
    portal === 'patient'
      ? 'patient_instant'
      : 'admin_approval';

  const requestStatus: RequestStatus =
    portal === 'patient' ? 'Approved' : 'Submitted';

  const batch = writeBatch(db);
  let profilePath = '';
  let institutionId = '';

  const genderValue =
    user.gender === 'female' ? 'female' : 'male';

  if (portal === 'patient') {
    profilePath = `patient_profiles/${uid}`;
    const existingProfile = await safeGetDoc(
      profilePath,
      doc(db, 'patient_profiles', uid),
    );
    const patientDoc: Record<string, unknown> = {
      uid,
      fullName: trimStr(user.fullName || user.googleName, 120),
      dateOfBirth: trimStr(user.dateOfBirth, 20),
      gender: genderValue,
      governorate: trimStr(user.governorate, 80),
      district: trimStr(user.district, 80),
      address: trimStr(user.address, 240),
      phone: trimStr(user.phone, 32),
      avatarUrl: trimStr(user.avatarUrl || user.photoUrl, 1000),
      emergencyContactName: trimStr(payload.data.emergencyContactName, 120),
      emergencyContactPhone: trimStr(payload.data.emergencyContactPhone, 32),
      emergencyContactRelation: trimStr(
        payload.data.emergencyContactRelation,
        60,
      ),
      acceptedPolicy: true,
      status: 'active',
      createdAt: existingProfile.exists()
        ? existingProfile.data().createdAt
        : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(doc(db, 'patient_profiles', uid), patientDoc);
  } else if (portal === 'doctor') {
    profilePath = `doctor_profiles/${uid}`;
    institutionId = `inst_clinic_${uid}`;
    const existingProfile = await safeGetDoc(
      profilePath,
      doc(db, 'doctor_profiles', uid),
    );
    const existingInst = await safeGetDoc(
      `institutions/${institutionId}`,
      doc(db, 'institutions', institutionId),
    );

    if (
      trimStr(payload.data.professionalPhone, 32).length < 6 ||
      trimStr(payload.data.email || user.email, 254).length < 3 ||
      trimStr(payload.data.degree, 120).length < 2 ||
      trimStr(payload.data.university, 160).length < 2 ||
      trimStr(payload.data.specialty, 120).length < 2 ||
      trimStr(payload.data.clinicName, 160).length < 2 ||
      trimStr(payload.data.workAddress, 240).length < 2 ||
      trimStr(payload.data.workDaysAndHours, 240).length < 2 ||
      trimStr(payload.data.licenseNumber, 80).length < 2 ||
      trimStr(payload.data.licensingAuthority, 120).length < 2
    ) {
      throw new Error('INCOMPLETE_PORTAL_FIELDS');
    }

    batch.set(doc(db, 'doctor_profiles', uid), {
      uid,
      fullName: trimStr(user.fullName || user.googleName, 120),
      dateOfBirth: trimStr(user.dateOfBirth, 20),
      gender: genderValue,
      avatarUrl: trimStr(user.avatarUrl || user.photoUrl, 1000),
      governorate: trimStr(user.governorate, 80),
      district: trimStr(user.district, 80),
      professionalPhone: trimStr(payload.data.professionalPhone, 32),
      email: trimStr(payload.data.email || user.email, 254),
      degree: trimStr(payload.data.degree, 120),
      university: trimStr(payload.data.university, 160),
      specialty: trimStr(payload.data.specialty, 120),
      subSpecialty: trimStr(payload.data.subSpecialty, 120),
      experienceYears: clampInt(payload.data.experienceYears, 0, 80, 0),
      languages: payload.data.languages.slice(0, 10),
      clinicName: trimStr(payload.data.clinicName, 160),
      workAddress: trimStr(payload.data.workAddress, 240),
      workDaysAndHours: trimStr(payload.data.workDaysAndHours, 240),
      consultationDurationMinutes: clampInt(
        payload.data.consultationDurationMinutes,
        5,
        240,
        20,
      ),
      consultationFee: clampNum(payload.data.consultationFee, 0, 10000000, 0),
      hourlyAppointmentLimit: clampInt(
        payload.data.hourlyAppointmentLimit,
        1,
        60,
        3,
      ),
      bookingConfirmationMode: payload.data.bookingConfirmationMode,
      licenseNumber: trimStr(payload.data.licenseNumber, 80),
      licensingAuthority: trimStr(payload.data.licensingAuthority, 120),
      licenseExpiryDate: trimStr(payload.data.licenseExpiryDate, 20),
      verificationDocuments: payload.data.verificationDocuments.slice(0, 10),
      institutionId,
      status: 'Submitted',
      createdAt:
        existingProfile.exists() && existingProfile.data()?.createdAt
          ? existingProfile.data().createdAt
          : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (!existingInst.exists()) {
      batch.set(doc(db, 'institutions', institutionId), {
        institutionId,
        ownerUid: uid,
        type: 'clinic',
        nameAr: trimStr(payload.data.clinicName, 160),
        nameEn: trimStr(payload.data.clinicName, 160),
        governorate: trimStr(user.governorate, 80),
        district: trimStr(user.district, 80),
        address: trimStr(payload.data.workAddress, 240),
        licenseNumber: trimStr(payload.data.licenseNumber, 80),
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const ownerMemberId = `mem_${institutionId}_${uid}`;
      const existingOwnerMem = await safeGetDoc(
        `institution_members/${ownerMemberId}`,
        doc(db, 'institution_members', ownerMemberId),
      );
      if (!existingOwnerMem.exists()) {
        batch.set(doc(db, 'institution_members', ownerMemberId), {
          memberId: ownerMemberId,
          institutionId,
          uid,
          role: 'owner',
          status: 'pending_approval',
          permissions: ['manage_institution'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (
      existingInst.data()?.status === 'pending_approval' ||
      existingInst.data()?.status === 'rejected'
    ) {
      batch.update(doc(db, 'institutions', institutionId), {
        nameAr: trimStr(payload.data.clinicName, 160),
        nameEn: trimStr(payload.data.clinicName, 160),
        governorate: trimStr(user.governorate, 80),
        district: trimStr(user.district, 80),
        address: trimStr(payload.data.workAddress, 240),
        licenseNumber: trimStr(payload.data.licenseNumber, 80),
        status: 'pending_approval',
        updatedAt: serverTimestamp(),
      });
    }
  } else if (portal === 'lab') {
    profilePath = `lab_profiles/${uid}`;
    institutionId = `inst_lab_${uid}`;
    const existingProfile = await safeGetDoc(
      profilePath,
      doc(db, 'lab_profiles', uid),
    );
    const existingInst = await safeGetDoc(
      `institutions/${institutionId}`,
      doc(db, 'institutions', institutionId),
    );

    const labData: Record<string, unknown> = {
      uid,
      managerFullName: trimStr(user.fullName || user.googleName, 120),
      managerDateOfBirth: trimStr(user.dateOfBirth, 20),
      managerGender: genderValue,
      managerAvatarUrl: trimStr(user.avatarUrl || user.photoUrl, 1000),
      professionalPhone: trimStr(payload.data.professionalPhone, 32),
      labNameAr: trimStr(payload.data.labNameAr, 160),
      labNameEn: trimStr(payload.data.labNameEn, 160),
      directorName: trimStr(payload.data.directorName, 120),
      governorate: trimStr(payload.data.governorate, 80),
      district: trimStr(payload.data.district, 80),
      address: trimStr(payload.data.address, 240),
      mapLocationUrl: trimStr(payload.data.mapLocationUrl, 500),
      licenseNumber: trimStr(payload.data.licenseNumber, 80),
      licensingAuthority: trimStr(payload.data.licensingAuthority, 120),
      licenseDocuments: payload.data.licenseDocuments.slice(0, 10),
      technicalDirectorName: trimStr(payload.data.technicalDirectorName, 120),
      labServices: payload.data.labServices.slice(0, 30),
      workDaysAndHours: trimStr(payload.data.workDaysAndHours, 240),
      hourlyBookingLimit: clampInt(payload.data.hourlyBookingLimit, 1, 200, 8),
      bookingConfirmationMode: payload.data.bookingConfirmationMode,
      institutionId,
      status: 'Submitted',
      createdAt:
        existingProfile.exists() && existingProfile.data()?.createdAt
          ? existingProfile.data().createdAt
          : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (typeof payload.data.latitude === 'number') {
      labData.latitude = payload.data.latitude;
    }
    if (typeof payload.data.longitude === 'number') {
      labData.longitude = payload.data.longitude;
    }

    batch.set(doc(db, 'lab_profiles', uid), labData);

    if (!existingInst.exists()) {
      batch.set(doc(db, 'institutions', institutionId), {
        institutionId,
        ownerUid: uid,
        type: 'lab',
        nameAr: trimStr(payload.data.labNameAr, 160),
        nameEn: trimStr(payload.data.labNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.address, 240),
        licenseNumber: trimStr(payload.data.licenseNumber, 80),
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const ownerMemberId = `mem_${institutionId}_${uid}`;
      const existingOwnerMem = await safeGetDoc(
        `institution_members/${ownerMemberId}`,
        doc(db, 'institution_members', ownerMemberId),
      );
      if (!existingOwnerMem.exists()) {
        batch.set(doc(db, 'institution_members', ownerMemberId), {
          memberId: ownerMemberId,
          institutionId,
          uid,
          role: 'owner',
          status: 'pending_approval',
          permissions: ['manage_institution'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (
      existingInst.data()?.status === 'pending_approval' ||
      existingInst.data()?.status === 'rejected'
    ) {
      batch.update(doc(db, 'institutions', institutionId), {
        nameAr: trimStr(payload.data.labNameAr, 160),
        nameEn: trimStr(payload.data.labNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.address, 240),
        licenseNumber: trimStr(payload.data.licenseNumber, 80),
        status: 'pending_approval',
        updatedAt: serverTimestamp(),
      });
    }
  } else if (portal === 'pharmacy') {
    profilePath = `pharmacy_profiles/${uid}`;
    institutionId = `inst_pharmacy_${uid}`;
    const existingProfile = await safeGetDoc(
      profilePath,
      doc(db, 'pharmacy_profiles', uid),
    );
    const existingInst = await safeGetDoc(
      `institutions/${institutionId}`,
      doc(db, 'institutions', institutionId),
    );

    if (
      trimStr(payload.data.pharmacyNameAr, 160).length < 2 ||
      trimStr(payload.data.pharmacyNameEn, 160).length < 2 ||
      trimStr(payload.data.ownerFullName, 120).length < 2 ||
      trimStr(payload.data.responsiblePharmacistName, 120).length < 2 ||
      trimStr(payload.data.pharmacistSyndicateNumber, 80).length < 2 ||
      trimStr(payload.data.pharmacyLicenseNumber, 80).length < 2 ||
      trimStr(payload.data.licensingAuthority, 120).length < 2 ||
      trimStr(payload.data.professionalPhone, 32).length < 6 ||
      trimStr(payload.data.governorate, 80).length < 2 ||
      trimStr(payload.data.district, 80).length < 2 ||
      trimStr(payload.data.address, 240).length < 2 ||
      trimStr(payload.data.workingDaysAndHours, 240).length < 2
    ) {
      throw new Error('INCOMPLETE_PORTAL_FIELDS');
    }

    const pharmacyDoc: Record<string, unknown> = {
      uid,
      institutionId,
      pharmacyNameAr: trimStr(payload.data.pharmacyNameAr, 160),
      pharmacyNameEn: trimStr(payload.data.pharmacyNameEn, 160),
      ownerFullName: trimStr(payload.data.ownerFullName, 120),
      responsiblePharmacistName: trimStr(payload.data.responsiblePharmacistName, 120),
      pharmacistSyndicateNumber: trimStr(payload.data.pharmacistSyndicateNumber, 80),
      pharmacyLicenseNumber: trimStr(payload.data.pharmacyLicenseNumber, 80),
      licensingAuthority: trimStr(payload.data.licensingAuthority, 120),
      licenseExpiryDate: trimStr(payload.data.licenseExpiryDate, 20),
      professionalPhone: trimStr(payload.data.professionalPhone, 32),
      email: trimStr(payload.data.email || user.email, 254),
      governorate: trimStr(payload.data.governorate, 80),
      district: trimStr(payload.data.district, 80),
      address: trimStr(payload.data.address, 240),
      mapLocationUrl: trimStr(payload.data.mapLocationUrl, 500),
      workingDaysAndHours: trimStr(payload.data.workingDaysAndHours, 240),
      is24Hours: Boolean(payload.data.is24Hours),
      deliveryAvailable: Boolean(payload.data.deliveryAvailable),
      pickupAvailable: payload.data.pickupAvailable !== false,
      deliveryZones: [],
      acceptedPaymentMethods: payload.data.deliveryAvailable
        ? ['cash_on_pickup', 'cash_on_delivery']
        : ['cash_on_pickup'],
      minimumOrderIqd: 0,
      licenseDocuments: payload.data.licenseDocuments.slice(0, 10),
      status: 'Submitted',
      createdAt:
        existingProfile.exists() && existingProfile.data()?.createdAt
          ? existingProfile.data().createdAt
          : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (typeof payload.data.latitude === 'number') {
      pharmacyDoc.latitude = payload.data.latitude;
    }
    if (typeof payload.data.longitude === 'number') {
      pharmacyDoc.longitude = payload.data.longitude;
    }

    batch.set(doc(db, 'pharmacy_profiles', uid), pharmacyDoc);

    if (!existingInst.exists()) {
      batch.set(doc(db, 'institutions', institutionId), {
        institutionId,
        ownerUid: uid,
        type: 'pharmacy',
        nameAr: trimStr(payload.data.pharmacyNameAr, 160),
        nameEn: trimStr(payload.data.pharmacyNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.address, 240),
        licenseNumber: trimStr(payload.data.pharmacyLicenseNumber, 80),
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const ownerMemberId = `mem_${institutionId}_${uid}`;
      const existingOwnerMem = await safeGetDoc(
        `institution_members/${ownerMemberId}`,
        doc(db, 'institution_members', ownerMemberId),
      );
      if (!existingOwnerMem.exists()) {
        batch.set(doc(db, 'institution_members', ownerMemberId), {
          memberId: ownerMemberId,
          institutionId,
          uid,
          role: 'owner',
          status: 'pending_approval',
          permissions: ['manage_institution'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (
      existingInst.data()?.status === 'pending_approval' ||
      existingInst.data()?.status === 'rejected'
    ) {
      batch.update(doc(db, 'institutions', institutionId), {
        nameAr: trimStr(payload.data.pharmacyNameAr, 160),
        nameEn: trimStr(payload.data.pharmacyNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.address, 240),
        licenseNumber: trimStr(payload.data.pharmacyLicenseNumber, 80),
        status: 'pending_approval',
        updatedAt: serverTimestamp(),
      });
    }
  } else if (portal === 'wholesaler') {
    profilePath = `wholesaler_profiles/${uid}`;
    institutionId = `inst_wholesaler_${uid}`;
    const existingProfile = await safeGetDoc(
      profilePath,
      doc(db, 'wholesaler_profiles', uid),
    );
    const existingInst = await safeGetDoc(
      `institutions/${institutionId}`,
      doc(db, 'institutions', institutionId),
    );

    if (
      trimStr(payload.data.wholesalerNameAr, 160).length < 2 ||
      trimStr(payload.data.wholesalerNameEn, 160).length < 2 ||
      trimStr(payload.data.ownerFullName, 120).length < 2 ||
      trimStr(payload.data.legalEntityName, 160).length < 2 ||
      trimStr(payload.data.warehouseLicenseNumber, 80).length < 2 ||
      trimStr(payload.data.licensingAuthority, 120).length < 2 ||
      trimStr(payload.data.professionalPhone, 32).length < 6 ||
      trimStr(payload.data.governorate, 80).length < 2 ||
      trimStr(payload.data.district, 80).length < 2 ||
      trimStr(payload.data.warehouseAddress, 240).length < 2 ||
      trimStr(payload.data.workingDaysAndHours, 240).length < 2
    ) {
      throw new Error('INCOMPLETE_PORTAL_FIELDS');
    }

    const wholesalerDoc: Record<string, unknown> = {
      uid,
      institutionId,
      wholesalerNameAr: trimStr(payload.data.wholesalerNameAr, 160),
      wholesalerNameEn: trimStr(payload.data.wholesalerNameEn, 160),
      ownerFullName: trimStr(payload.data.ownerFullName, 120),
      legalEntityName: trimStr(payload.data.legalEntityName, 160),
      warehouseLicenseNumber: trimStr(payload.data.warehouseLicenseNumber, 80),
      healthAuthorityLicenseNumber: trimStr(payload.data.healthAuthorityLicenseNumber, 80),
      licensingAuthority: trimStr(payload.data.licensingAuthority, 120),
      licenseExpiryDate: trimStr(payload.data.licenseExpiryDate, 20),
      professionalPhone: trimStr(payload.data.professionalPhone, 32),
      email: trimStr(payload.data.email || user.email, 254),
      governorate: trimStr(payload.data.governorate, 80),
      district: trimStr(payload.data.district, 80),
      warehouseAddress: trimStr(payload.data.warehouseAddress, 240),
      mapLocationUrl: trimStr(payload.data.mapLocationUrl, 500),
      workingDaysAndHours: trimStr(payload.data.workingDaysAndHours, 240),
      supportedGovernorates: payload.data.supportedGovernorates.slice(0, 20),
      minimumOrderIqd: clampNum(payload.data.minimumOrderIqd, 0, 100000000, 0),
      creditEnabledByDefault: false,
      licenseDocuments: payload.data.licenseDocuments.slice(0, 10),
      status: 'Submitted',
      createdAt:
        existingProfile.exists() && existingProfile.data()?.createdAt
          ? existingProfile.data().createdAt
          : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (typeof payload.data.latitude === 'number') {
      wholesalerDoc.latitude = payload.data.latitude;
    }
    if (typeof payload.data.longitude === 'number') {
      wholesalerDoc.longitude = payload.data.longitude;
    }

    batch.set(doc(db, 'wholesaler_profiles', uid), wholesalerDoc);

    if (!existingInst.exists()) {
      batch.set(doc(db, 'institutions', institutionId), {
        institutionId,
        ownerUid: uid,
        type: 'wholesaler',
        nameAr: trimStr(payload.data.wholesalerNameAr, 160),
        nameEn: trimStr(payload.data.wholesalerNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.warehouseAddress, 240),
        licenseNumber: trimStr(payload.data.warehouseLicenseNumber, 80),
        status: 'pending_approval',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const ownerMemberId = `mem_${institutionId}_${uid}`;
      const existingOwnerMem = await safeGetDoc(
        `institution_members/${ownerMemberId}`,
        doc(db, 'institution_members', ownerMemberId),
      );
      if (!existingOwnerMem.exists()) {
        batch.set(doc(db, 'institution_members', ownerMemberId), {
          memberId: ownerMemberId,
          institutionId,
          uid,
          role: 'owner',
          status: 'pending_approval',
          permissions: ['manage_institution'],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (
      existingInst.data()?.status === 'pending_approval' ||
      existingInst.data()?.status === 'rejected'
    ) {
      batch.update(doc(db, 'institutions', institutionId), {
        nameAr: trimStr(payload.data.wholesalerNameAr, 160),
        nameEn: trimStr(payload.data.wholesalerNameEn, 160),
        governorate: trimStr(payload.data.governorate, 80),
        district: trimStr(payload.data.district, 80),
        address: trimStr(payload.data.warehouseAddress, 240),
        licenseNumber: trimStr(payload.data.warehouseLicenseNumber, 80),
        status: 'pending_approval',
        updatedAt: serverTimestamp(),
      });
    }
  }

  // Write or update registration request
  if (isResubmit && liveMatch) {
    batch.update(doc(db, 'registration_requests', requestId), {
      status: 'Submitted',
      acceptedTerms: true,
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    const reqPayload: Record<string, unknown> = {
      requestId,
      requestNumber,
      uid,
      applicantEmail: trimStr(user.email, 254),
      applicantName: trimStr(user.fullName || user.googleName, 120),
      portalType: portal,
      profilePath,
      status: requestStatus,
      activationRule,
      reviewReason: '',
      reviewInstructions: '',
      acceptedTerms: true,
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (institutionId) {
      reqPayload.institutionId = institutionId;
    }
    batch.set(doc(db, 'registration_requests', requestId), reqPayload);
  }

  // Update user summary state
  batch.update(doc(db, 'users', uid), {
    selectedPortal: portal,
    registrationCompleted: true,
    accountStatus: portal === 'patient' ? 'active' : 'pending_review',
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `registration_requests/${requestId}`);
  }

  await appendAuditLog({
    actorUid: uid,
    actorEmail: user.email,
    action: 'PORTAL_REGISTRATION_SUBMITTED',
    targetCollection: 'registration_requests',
    targetId: requestId,
    details: `Submitted ${portal} registration (${requestNumber})`,
  });

  if (auth.currentUser?.uid === uid) {
    void (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        await fetch('/api/portals/registration-submitted', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ requestId }),
        });
      } catch {
        // Non-blocking notification trigger
      }
    })();
  }

  const savedPath = `registration_requests/${requestId}`;
  const savedSnap = await safeGetDoc(
    savedPath,
    doc(db, 'registration_requests', requestId),
  );
  return savedSnap.data() as RegistrationRequest;
}

export async function verifySuperAdminWithServer(
  firebaseUser: User,
): Promise<SuperAdminVerifyResult> {
  try {
    const idToken = await firebaseUser.getIdToken();
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
    });
    const data = (await res.json()) as {
      authorized?: boolean;
      email?: string;
      claimsActive?: boolean;
      claimsUpdated?: boolean;
      serverAdminSdkActive?: boolean;
      hasAllowlist?: boolean;
      reason?: string;
    };

    if (!res.ok || data.authorized !== true) {
      return {
        authorized: false,
        serverAdminSdkActive: data.serverAdminSdkActive,
        hasAllowlist: data.hasAllowlist,
        reason: data.reason,
      };
    }

    // If Custom Claims were just issued by the server, force-refresh ID token and re-verify
    if (data.claimsUpdated) {
      const freshToken = await firebaseUser.getIdToken(true);
      const reverifyRes = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${freshToken}`,
        },
      });
      const reverifyData = (await reverifyRes.json()) as {
        authorized?: boolean;
        email?: string;
        claimsActive?: boolean;
        serverAdminSdkActive?: boolean;
        hasAllowlist?: boolean;
        reason?: string;
      };
      return {
        authorized: reverifyRes.ok && reverifyData.authorized === true,
        email: reverifyData.email,
        claimsActive: reverifyData.claimsActive,
        serverAdminSdkActive: reverifyData.serverAdminSdkActive,
        hasAllowlist: reverifyData.hasAllowlist,
        reason: reverifyData.reason,
      };
    }

    return {
      authorized: true,
      email: data.email,
      claimsActive: data.claimsActive,
      serverAdminSdkActive: data.serverAdminSdkActive,
      hasAllowlist: data.hasAllowlist,
    };
  } catch {
    return { authorized: false, reason: 'NETWORK_ERROR' };
  }
}

export async function fetchAdminDashboardSummary(firebaseUser: User): Promise<{
  users: UserAccount[];
  requests: RegistrationRequest[];
  institutions: InstitutionRecord[];
  adminRoles: AdminRoleRecord[];
  adminMessages: AdminMessageRecord[];
  auditLogs: AuditLogRecord[];
  ads: MedoraAdRecord[];
  reviews: DoctorReviewRecord[];
  feedback: PatientFeedbackRecord[];
  approvedDoctors: PublicDoctorCard[];
  approvedLabs: import('../types/patient').LabDirectoryCard[];
  partialErrors: AdminCollectionError[];
  serverStatus: SuperAdminServerStatus;
}> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch('/api/admin/summary', {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = (await res.json()) as {
    authorized?: boolean;
    error?: string;
    reason?: string;
    failedCollections?: string[];
    partialErrors?: AdminCollectionError[];
    users?: UserAccount[];
    requests?: RegistrationRequest[];
    institutions?: InstitutionRecord[];
    adminRoles?: AdminRoleRecord[];
    adminMessages?: AdminMessageRecord[];
    auditLogs?: AuditLogRecord[];
    ads?: MedoraAdRecord[];
    reviews?: DoctorReviewRecord[];
    feedback?: PatientFeedbackRecord[];
    approvedDoctors?: PublicDoctorCard[];
    approvedLabs?: import('../types/patient').LabDirectoryCard[];
    serverStatus?: SuperAdminServerStatus;
  };
  if (!res.ok || body.authorized !== true) {
    const baseCode = body.reason || body.error || 'ADMIN_SUMMARY_FORBIDDEN';
    const details =
      Array.isArray(body.partialErrors) && body.partialErrors.length > 0
        ? body.partialErrors.map((e) => `${e.collection}:${e.code}`).join(', ')
        : Array.isArray(body.failedCollections) && body.failedCollections.length > 0
          ? body.failedCollections.join(', ')
          : '';
    throw new Error(details ? `${baseCode} (${details})` : baseCode);
  }
  return {
    users: body.users || [],
    requests: body.requests || [],
    institutions: body.institutions || [],
    adminRoles: body.adminRoles || [],
    adminMessages: body.adminMessages || [],
    auditLogs: body.auditLogs || [],
    ads: body.ads || [],
    reviews: body.reviews || [],
    feedback: body.feedback || [],
    approvedDoctors: body.approvedDoctors || [],
    approvedLabs: body.approvedLabs || [],
    partialErrors: Array.isArray(body.partialErrors) ? body.partialErrors : [],
    serverStatus: body.serverStatus || {
      serverAdminSdkActive: false,
      hasAllowlist: false,
      customClaimsActive: false,
    },
  };
}

export async function fetchAdminRequestDetails(
  firebaseUser: User,
  requestId: string,
): Promise<{
  request: RegistrationRequest;
  profile: Record<string, unknown> | null;
  institution: InstitutionRecord | null;
  applicantAccount: UserAccount | null;
}> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(
    `/api/admin/requests/${encodeURIComponent(requestId)}/details`,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
  );
  const body = (await res.json()) as {
    error?: string;
    request?: RegistrationRequest;
    profile?: Record<string, unknown> | null;
    institution?: InstitutionRecord | null;
    applicantAccount?: UserAccount | null;
  };
  if (!res.ok || !body.request) {
    throw new Error(body.error || 'REQUEST_DETAILS_FAILED');
  }
  return {
    request: body.request,
    profile: body.profile || null,
    institution: body.institution || null,
    applicantAccount: body.applicantAccount || null,
  };
}

export async function submitAdminRequestDecision(
  firebaseUser: User,
  params: {
    requestId: string;
    status: 'Under Review' | 'Approved' | 'Rejected' | 'Requires Changes';
    reason?: string;
    instructions?: string;
  },
): Promise<RegistrationRequest> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(
    `/api/admin/requests/${encodeURIComponent(params.requestId)}/decision`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        status: params.status,
        reason: params.reason || '',
        instructions: params.instructions || '',
      }),
    },
  );
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    request?: RegistrationRequest;
  };
  if (!res.ok || !body.ok || !body.request) {
    throw new Error(body.error || 'REQUEST_DECISION_FAILED');
  }
  return body.request;
}

export async function updateAdminInstitution(
  firebaseUser: User,
  params: {
    institutionId: string;
    status?: 'pending_approval' | 'active' | 'suspended' | 'rejected';
    subscriptionStatus?: SubscriptionStatus;
    subscriptionPlan?: string;
    subscriptionExpiresAt?: string;
  },
): Promise<InstitutionRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(
    `/api/admin/institutions/${encodeURIComponent(params.institutionId)}/update`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    },
  );
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    institution?: InstitutionRecord;
  };
  if (!res.ok || !body.ok || !body.institution) {
    throw new Error(body.error || 'INSTITUTION_UPDATE_FAILED');
  }
  return body.institution;
}

export async function createAdminMessage(
  firebaseUser: User,
  params: {
    subject: string;
    body: string;
    category: AdminMessageCategory;
    senderName?: string;
  },
): Promise<AdminMessageRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch('/api/admin/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    message?: AdminMessageRecord;
  };
  if (!res.ok || !body.ok || !body.message) {
    throw new Error(body.error || 'MESSAGE_CREATE_FAILED');
  }
  return body.message;
}

export async function updateAdminMessage(
  firebaseUser: User,
  params: {
    messageId: string;
    status?: AdminMessageStatus;
    isRead?: boolean;
  },
): Promise<AdminMessageRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(
    `/api/admin/messages/${encodeURIComponent(params.messageId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        status: params.status,
        isRead: params.isRead,
      }),
    },
  );
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    message?: AdminMessageRecord;
  };
  if (!res.ok || !body.ok || !body.message) {
    throw new Error(body.error || 'MESSAGE_UPDATE_FAILED');
  }
  return body.message;
}

export async function uploadAdminAdImage(
  firebaseUser: User,
  file: File,
  options: { preferMaxBytes?: number } = {},
): Promise<{
  imageUrl: string;
  storagePath: string;
  storageMode: 'firebase_storage' | 'firestore_asset';
  width: number;
  height: number;
  size: number;
  mimeType: string;
}> {
  const prepared = await prepareAdImageFile(file, {
    maxBytes: options.preferMaxBytes ?? 320 * 1024,
    defaultBaseName: 'medora_ad',
  });

  const idToken = await firebaseUser.getIdToken();
  const dataBase64 = await fileToDataUrl(prepared.file);
  const res = await fetch('/api/admin/ads/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      dataBase64,
      mimeType: prepared.file.type,
      fileName: prepared.file.name,
      originalSize: prepared.originalSize,
      originalMimeType: prepared.originalMimeType,
      width: prepared.width,
      height: prepared.height,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    imageUrl?: string;
    storagePath?: string;
    storageMode?: 'firebase_storage' | 'firestore_asset';
    width?: number;
    height?: number;
    size?: number;
    mimeType?: string;
  };

  if (
    res.ok &&
    body.ok &&
    body.imageUrl &&
    body.storagePath &&
    isValidAdImageUrlClient(body.imageUrl, body.storagePath)
  ) {
    return {
      imageUrl: body.imageUrl,
      storagePath: body.storagePath,
      storageMode:
        body.storageMode === 'firebase_storage' ? 'firebase_storage' : 'firestore_asset',
      width: body.width ?? prepared.width,
      height: body.height ?? prepared.height,
      size: body.size ?? prepared.file.size,
      mimeType: body.mimeType ?? prepared.file.type,
    };
  }

  const serverErrorCode = body.error || 'AD_STORAGE_UPLOAD_FAILED';
  throw new Error(serverErrorCode);
}

export async function createAdminAd(
  firebaseUser: User,
  input: {
    entityType: AdEntityType;
    entityUid: string;
    doctorUid?: string;
    entityName?: string;
    specialty?: string;
    clinicName?: string;
    targetPortals?: AdTargetPortal[];
    title?: string;
    description?: string;
    imageUrl: string;
    storagePath: string;
    ctaLabel?: string;
    ctaLabelEn?: string;
    actionType?: AdActionType;
    destinationTarget?: string;
    badgeTextAr?: string;
    badgeTextEn?: string;
    startDate?: string;
    endDate?: string;
    status: MedoraAdStatus;
    active?: boolean;
    priority?: number;
  },
): Promise<MedoraAdRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch('/api/admin/ads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      ...input,
      active: input.status === 'published',
    }),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    ad?: MedoraAdRecord;
  };
  if (!res.ok || !body.ok || !body.ad) {
    throw new Error(body.error || 'AD_CREATE_FAILED');
  }
  return body.ad;
}

export async function updateAdminAd(
  firebaseUser: User,
  adId: string,
  input: Partial<{
    entityType: AdEntityType;
    entityUid: string;
    doctorUid: string;
    entityName: string;
    specialty: string;
    clinicName: string;
    targetPortals: AdTargetPortal[];
    title: string;
    description: string;
    imageUrl: string;
    storagePath: string;
    ctaLabel: string;
    ctaLabelEn: string;
    actionType: AdActionType;
    destinationTarget: string;
    badgeTextAr: string;
    badgeTextEn: string;
    startDate: string;
    endDate: string;
    status: MedoraAdStatus;
    active: boolean;
    approvedByAdmin: boolean;
    priority: number;
  }>,
): Promise<MedoraAdRecord> {
  const idToken = await firebaseUser.getIdToken();
  const payload = { ...input };
  if (payload.status !== undefined && payload.active === undefined) {
    payload.active = payload.status === 'published';
  }
  const res = await fetch(`/api/admin/ads/${encodeURIComponent(adId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    ad?: MedoraAdRecord;
  };
  if (!res.ok || !body.ok || !body.ad) {
    throw new Error(body.error || 'AD_UPDATE_FAILED');
  }
  return body.ad;
}

export async function deleteAdminAd(
  firebaseUser: User,
  adId: string,
): Promise<void> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(`/api/admin/ads/${encodeURIComponent(adId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) {
    throw new Error(body.error || 'AD_DELETE_FAILED');
  }
}

export async function moderateAdminReview(
  firebaseUser: User,
  reviewId: string,
  input: { status: DoctorReviewStatus; moderationNote?: string },
): Promise<DoctorReviewRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    review?: DoctorReviewRecord;
  };
  if (!res.ok || !body.ok || !body.review) {
    throw new Error(body.error || 'REVIEW_MODERATION_FAILED');
  }
  return body.review;
}

export async function updateAdminFeedback(
  firebaseUser: User,
  feedbackId: string,
  input: { status?: PatientFeedbackStatus; adminReply?: string },
): Promise<PatientFeedbackRecord> {
  const idToken = await firebaseUser.getIdToken();
  const res = await fetch(`/api/admin/feedback/${encodeURIComponent(feedbackId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    feedback?: PatientFeedbackRecord;
  };
  if (!res.ok || !body.ok || !body.feedback) {
    throw new Error(body.error || 'FEEDBACK_UPDATE_FAILED');
  }
  return body.feedback;
}
