import express, { type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { emitPatientNotification } from './patientNotifications.ts';
import {
  emitAdminNotification,
  getGlobalNotificationEngine,
} from './notificationEngine.ts';
import {
  PERMISSIONS_BY_EMPLOYER,
  type AnySecretaryPermission,
  type EmployerType,
  type InitialTaskTemplate,
  type SecretaryEmploymentStatus,
  type SecretaryInvitationStatus,
} from '../src/types/secretary.ts';

export interface SecretaryRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
}

export interface VerifiedActor {
  uid: string;
  email: string;
  name: string;
}

const VALID_EMPLOYER_TYPES = new Set<EmployerType>(['doctor', 'lab', 'pharmacy']);
const ACTIVE_TASK_STATUSES = new Set(['todo', 'in_progress', 'done']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high']);

export function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

export function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function computeSecretaryCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (clean.slice(0, 4) + clean.slice(-4)).slice(0, 8) || '0000';
  return `SEC-${suffix}`;
}

export function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(serializeValue);
  }
  if (val && typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (typeof rec.toDate === 'function') {
      try {
        return (rec.toDate as () => Date)().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

export function serializeDoc(
  data: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

export function sanitizePermissionsForEmployer(
  employerType: EmployerType,
  raw: unknown,
): AnySecretaryPermission[] {
  const allowed = new Set<string>(PERMISSIONS_BY_EMPLOYER[employerType] || []);
  if (!Array.isArray(raw)) return [];
  const out: AnySecretaryPermission[] = [];
  for (const item of raw) {
    if (
      typeof item === 'string' &&
      allowed.has(item) &&
      !out.includes(item as AnySecretaryPermission)
    ) {
      out.push(item as AnySecretaryPermission);
    }
  }
  return out;
}

export function sanitizeInitialTasks(raw: unknown): InitialTaskTemplate[] {
  if (!Array.isArray(raw)) return [];
  const out: InitialTaskTemplate[] = [];
  for (const item of raw.slice(0, 15)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = normalizeStr(rec.title, 180);
    if (title.length < 2) continue;
    const priorityRaw = normalizeStr(rec.priority, 16);
    const priority = VALID_PRIORITIES.has(priorityRaw)
      ? (priorityRaw as 'low' | 'medium' | 'high')
      : 'medium';
    const description = normalizeStr(rec.description, 500);
    const dueDate = normalizeStr(rec.dueDate, 32);
    out.push({
      title,
      ...(description ? { description } : {}),
      priority,
      ...(dueDate ? { dueDate } : {}),
    });
  }
  return out;
}

export interface ResolvedEmployerContext {
  employerType: EmployerType;
  employerUid: string;
  institutionId: string;
  employerName: string;
  employerSubtitle: string;
  employerEmail: string;
  actorName: string;
}

export async function resolveEmployerContext(
  db: Firestore,
  actorUid: string,
  actorEmail: string,
  employerType: EmployerType,
): Promise<
  | { ok: true; ctx: ResolvedEmployerContext }
  | { ok: false; statusCode: number; error: string }
> {
  const userSnap = await db.doc(`users/${actorUid}`).get();
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  if (userData.accountStatus === 'suspended') {
    return { ok: false, statusCode: 403, error: 'ACCOUNT_SUSPENDED' };
  }

  if (employerType === 'doctor') {
    const docSnap = await db.doc(`doctor_profiles/${actorUid}`).get();
    if (!docSnap.exists) {
      return { ok: false, statusCode: 403, error: 'EMPLOYER_ACCESS_DENIED' };
    }
    const profile = serializeDoc(docSnap.data());
    if (profile.status !== 'Approved') {
      return { ok: false, statusCode: 403, error: 'DOCTOR_NOT_APPROVED' };
    }
    const institutionId =
      normalizeStr(profile.institutionId, 128) || `inst_clinic_${actorUid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, statusCode: 403, error: 'INSTITUTION_SUSPENDED' };
      }
    }
    return {
      ok: true,
      ctx: {
        employerType: 'doctor',
        employerUid: actorUid,
        institutionId,
        employerName:
          normalizeStr(profile.clinicName || profile.fullName, 160) || 'عيادة MEDORA',
        employerSubtitle: normalizeStr(profile.specialty || profile.fullName, 120),
        employerEmail: normalizeStr(profile.email || actorEmail, 254),
        actorName: normalizeStr(profile.fullName || actorEmail, 120) || 'Doctor Owner',
      },
    };
  }

  if (employerType === 'lab') {
    const labSnap = await db.doc(`lab_profiles/${actorUid}`).get();
    if (!labSnap.exists) {
      return { ok: false, statusCode: 403, error: 'EMPLOYER_ACCESS_DENIED' };
    }
    const profile = serializeDoc(labSnap.data());
    if (profile.status !== 'Approved') {
      return { ok: false, statusCode: 403, error: 'LAB_NOT_APPROVED' };
    }
    const institutionId =
      normalizeStr(profile.institutionId, 128) || `inst_lab_${actorUid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, statusCode: 403, error: 'INSTITUTION_SUSPENDED' };
      }
    }
    return {
      ok: true,
      ctx: {
        employerType: 'lab',
        employerUid: actorUid,
        institutionId,
        employerName:
          normalizeStr(profile.labNameAr || profile.labNameEn, 160) || 'مختبر MEDORA',
        employerSubtitle: normalizeStr(profile.governorate, 80),
        employerEmail: normalizeStr(actorEmail, 254),
        actorName:
          normalizeStr(profile.managerFullName || actorEmail, 120) || 'Lab Manager',
      },
    };
  }

  // Pharmacy employer check (requires approved pharmacy profile or active pharmacy institution)
  const pharmSnap = await db.doc(`pharmacy_profiles/${actorUid}`).get();
  if (pharmSnap.exists) {
    const profile = serializeDoc(pharmSnap.data());
    if (profile.status !== 'Approved') {
      return { ok: false, statusCode: 403, error: 'PHARMACY_NOT_APPROVED' };
    }
    const institutionId =
      normalizeStr(profile.institutionId, 128) || `inst_pharmacy_${actorUid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, statusCode: 403, error: 'INSTITUTION_SUSPENDED' };
      }
    }
    return {
      ok: true,
      ctx: {
        employerType: 'pharmacy',
        employerUid: actorUid,
        institutionId,
        employerName:
          normalizeStr(profile.pharmacyNameAr || profile.pharmacyNameEn, 160) ||
          'صيدلية MEDORA',
        employerSubtitle: normalizeStr(profile.governorate, 80),
        employerEmail: normalizeStr(actorEmail, 254),
        actorName:
          normalizeStr(profile.ownerFullName || userData.fullName || actorEmail, 120) ||
          'Pharmacy Owner',
      },
    };
  }

  const instSnap = await db
    .collection('institutions')
    .where('ownerUid', '==', actorUid)
    .where('type', '==', 'pharmacy')
    .limit(1)
    .get();
  if (!instSnap.empty) {
    const instData = serializeDoc(instSnap.docs[0].data());
    if (instData.status !== 'active') {
      return { ok: false, statusCode: 403, error: 'PHARMACY_NOT_APPROVED' };
    }
    return {
      ok: true,
      ctx: {
        employerType: 'pharmacy',
        employerUid: actorUid,
        institutionId: String(instData.institutionId || instSnap.docs[0].id),
        employerName:
          normalizeStr(instData.nameAr || instData.nameEn, 160) || 'صيدلية MEDORA',
        employerSubtitle: normalizeStr(instData.governorate, 80),
        employerEmail: normalizeStr(actorEmail, 254),
        actorName: normalizeStr(userData.fullName || actorEmail, 120) || 'Pharmacy Owner',
      },
    };
  }

  return { ok: false, statusCode: 403, error: 'EMPLOYER_ACCESS_DENIED' };
}

export async function resolveActiveSecretaryEmployment(
  db: Firestore,
  secretaryUid: string,
  employmentId: string,
): Promise<
  | {
      ok: true;
      employment: Record<string, unknown> & {
        employmentId: string;
        employerType: EmployerType;
        employerUid: string;
        employerInstitutionId: string;
        employerName: string;
        permissions: AnySecretaryPermission[];
      };
    }
  | { ok: false; statusCode: number; error: string }
> {
  if (!employmentId) {
    return { ok: false, statusCode: 400, error: 'EMPLOYMENT_ID_REQUIRED' };
  }
  const empSnap = await db.doc(`secretary_employments/${employmentId}`).get();
  if (!empSnap.exists) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_EMPLOYER_ACCESS' };
  }
  const emp = serializeDoc(empSnap.data());
  if (emp.secretaryUid !== secretaryUid) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_EMPLOYER_ACCESS' };
  }
  if (emp.status !== 'Active') {
    return {
      ok: false,
      statusCode: 403,
      error:
        emp.status === 'Suspended'
          ? 'EMPLOYMENT_SUSPENDED'
          : 'EMPLOYMENT_TERMINATED',
    };
  }
  const employerType = String(emp.employerType || '') as EmployerType;
  if (!VALID_EMPLOYER_TYPES.has(employerType)) {
    return { ok: false, statusCode: 403, error: 'INVALID_EMPLOYER_TYPE' };
  }

  const instId = normalizeStr(emp.employerInstitutionId, 128);
  if (instId) {
    const instSnap = await db.doc(`institutions/${instId}`).get();
    if (instSnap.exists) {
      const st = String(instSnap.data()?.status || '');
      if (st === 'suspended' || st === 'rejected') {
        return { ok: false, statusCode: 403, error: 'EMPLOYER_INSTITUTION_SUSPENDED' };
      }
    }
  }

  const permissions = sanitizePermissionsForEmployer(employerType, emp.permissions);
  return {
    ok: true,
    employment: {
      ...emp,
      employmentId: String(emp.employmentId || empSnap.id),
      employerType,
      employerUid: String(emp.employerUid || ''),
      employerInstitutionId: instId,
      employerName: normalizeStr(emp.employerName, 160),
      permissions,
    },
  };
}

export async function emitSecretaryNotification(
  db: Firestore,
  params: {
    secretaryUid: string;
    type:
      | 'invitation_received'
      | 'invitation_revoked'
      | 'permissions_updated'
      | 'employment_suspended'
      | 'employment_reactivated'
      | 'employment_terminated'
      | 'task_assigned';
    title: string;
    body: string;
    relatedId?: string;
    employerType?: EmployerType;
    employerName?: string;
    idempotencyKey?: string;
  },
): Promise<string> {
  const notificationId = safeId('snotif');
  const engine = getGlobalNotificationEngine();
  if (engine) {
    await engine
      .dispatch({
        eventType: params.type === 'task_assigned' ? 'secretary_task' : 'secretary_invitation',
        recipientUid: params.secretaryUid,
        recipientRole: 'secretary',
        title: normalizeStr(params.title, 200),
        body: normalizeStr(params.body, 600),
        inAppType: params.type,
        relatedId: params.relatedId ? normalizeStr(params.relatedId, 128) : undefined,
        relatedType: params.type,
        deterministicInAppId: notificationId,
        ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
        extraInAppFields: {
          ...(params.employerType ? { employerType: params.employerType } : {}),
          ...(params.employerName ? { employerName: normalizeStr(params.employerName, 160) } : {}),
        },
        placeholders: {
          refCode: (params.relatedId || notificationId).slice(0, 16).toUpperCase(),
          statusLabel: params.type,
        },
      })
      .catch(() => undefined);
    return notificationId;
  }

  await db.doc(`secretary_notifications/${notificationId}`).set({
    notificationId,
    secretaryUid: params.secretaryUid,
    type: params.type,
    title: normalizeStr(params.title, 200),
    body: normalizeStr(params.body, 600),
    ...(params.relatedId ? { relatedId: normalizeStr(params.relatedId, 128) } : {}),
    ...(params.employerType ? { employerType: params.employerType } : {}),
    ...(params.employerName ? { employerName: normalizeStr(params.employerName, 160) } : {}),
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return notificationId;
}

export async function appendSecretaryActivity(
  db: Firestore,
  params: {
    employerUid: string;
    employerType: EmployerType;
    employerName: string;
    employmentId?: string;
    invitationId?: string;
    secretaryUid: string;
    secretaryName: string;
    actorUid: string;
    actorName: string;
    actorRole: 'employer' | 'secretary';
    action: string;
    details: string;
  },
): Promise<string> {
  const logId = safeId('slog');
  await db.doc(`secretary_activity_logs/${logId}`).set({
    logId,
    employerUid: params.employerUid,
    employerType: params.employerType,
    employerName: normalizeStr(params.employerName, 160),
    ...(params.employmentId ? { employmentId: normalizeStr(params.employmentId, 128) } : {}),
    ...(params.invitationId ? { invitationId: normalizeStr(params.invitationId, 128) } : {}),
    secretaryUid: params.secretaryUid,
    secretaryName: normalizeStr(params.secretaryName, 120),
    actorUid: params.actorUid,
    actorName: normalizeStr(params.actorName, 120),
    actorRole: params.actorRole,
    action: normalizeStr(params.action, 120),
    details: normalizeStr(params.details, 600),
    createdAt: FieldValue.serverTimestamp(),
  });
  return logId;
}

async function resolveSecretaryRecordForInvite(
  db: Firestore,
  params: { secretaryUid?: string; query?: string },
): Promise<{
  uid: string;
  secretaryCode: string;
  fullName: string;
  email: string;
  phone: string;
  educationQualification: string;
} | null> {
  const qUid = normalizeStr(params.secretaryUid, 128);
  const qRaw = normalizeStr(params.query, 254);
  const qLower = qRaw.toLowerCase();
  const qUpper = qRaw.toUpperCase();

  let matchedUid = qUid;

  if (!matchedUid && qRaw) {
    // 1. Try direct UID match
    const directSecSnap = await db.doc(`secretary_profiles/${qRaw}`).get().catch(() => null);
    if (directSecSnap?.exists) {
      matchedUid = directSecSnap.id;
    }

    // 2. Try matching secretary_profiles by secretaryCode or email
    if (!matchedUid) {
      const allSecs = await db.collection('secretary_profiles').limit(300).get();
      for (const sDoc of allSecs.docs) {
        const sd = sDoc.data() as Record<string, unknown>;
        const code = normalizeStr(sd.secretaryCode, 32).toUpperCase() || computeSecretaryCode(sDoc.id);
        const secEmail = normalizeStr(sd.email, 254).toLowerCase();
        if (sDoc.id === qRaw || code === qUpper || (qLower && secEmail === qLower)) {
          matchedUid = sDoc.id;
          break;
        }
      }
    }

    // 3. Fallback search users by email if user selected secretary portal
    if (!matchedUid && qLower.includes('@')) {
      const usersSnap = await db
        .collection('users')
        .where('email', '==', qRaw)
        .limit(5)
        .get();
      for (const uDoc of usersSnap.docs) {
        const ud = uDoc.data() as Record<string, unknown>;
        const secCheck = await db.doc(`secretary_profiles/${uDoc.id}`).get();
        if (secCheck.exists || ud.selectedPortal === 'secretary') {
          matchedUid = uDoc.id;
          break;
        }
      }
      if (!matchedUid) {
        const allUsers = await db.collection('users').where('selectedPortal', '==', 'secretary').limit(200).get();
        for (const uDoc of allUsers.docs) {
          const ud = uDoc.data() as Record<string, unknown>;
          if (normalizeStr(ud.email, 254).toLowerCase() === qLower) {
            matchedUid = uDoc.id;
            break;
          }
        }
      }
    }
  }

  if (!matchedUid) return null;

  const [secSnap, userSnap] = await Promise.all([
    db.doc(`secretary_profiles/${matchedUid}`).get(),
    db.doc(`users/${matchedUid}`).get(),
  ]);

  if (!secSnap.exists && (!userSnap.exists || userSnap.data()?.selectedPortal !== 'secretary')) {
    return null;
  }

  const secData = secSnap.exists ? serializeDoc(secSnap.data()) : {};
  const userData = userSnap.exists ? serializeDoc(userSnap.data()) : {};

  return {
    uid: matchedUid,
    secretaryCode:
      normalizeStr(secData.secretaryCode, 32) || computeSecretaryCode(matchedUid),
    fullName:
      normalizeStr(secData.fullName || userData.fullName || userData.googleName, 120) ||
      'سكرتير MEDORA',
    email: normalizeStr(secData.email || userData.email, 254),
    phone: normalizeStr(secData.phone || userData.phone, 32),
    educationQualification: normalizeStr(secData.educationQualification, 160),
  };
}

export async function expirePendingInvitationsIfNeeded(
  db: Firestore,
  invDocs: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>[],
): Promise<Record<string, unknown>[]> {
  const nowIso = new Date().toISOString();
  const out: Record<string, unknown>[] = [];
  for (const d of invDocs) {
    const data = serializeDoc(d.data());
    if (
      data.status === 'Pending' &&
      typeof data.expiresAt === 'string' &&
      data.expiresAt &&
      data.expiresAt < nowIso
    ) {
      await d.ref.update({
        status: 'Expired',
        updatedAt: FieldValue.serverTimestamp(),
      });
      data.status = 'Expired';
    }
    out.push(data);
  }
  return out;
}

export async function acceptSecretaryInvitationService(
  db: Firestore,
  params: {
    invitationId: string;
    secretaryUid: string;
    secretaryEmail: string;
    secretaryName: string;
  },
): Promise<
  | { ok: true; employment: Record<string, unknown>; invitation: Record<string, unknown> }
  | { ok: false; statusCode: number; error: string }
> {
  const invRef = db.doc(`secretary_invitations/${params.invitationId}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists) {
    return { ok: false, statusCode: 404, error: 'INVITATION_NOT_FOUND' };
  }
  const inv = serializeDoc(invSnap.data());
  if (inv.secretaryUid !== params.secretaryUid) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_INVITATION' };
  }
  if (inv.status !== 'Pending') {
    return { ok: false, statusCode: 409, error: `INVITATION_ALREADY_${String(inv.status).toUpperCase()}` };
  }

  const nowIso = new Date().toISOString();
  if (typeof inv.expiresAt === 'string' && inv.expiresAt && inv.expiresAt < nowIso) {
    await invRef.update({
      status: 'Expired',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: false, statusCode: 409, error: 'INVITATION_EXPIRED' };
  }

  const employerType = String(inv.employerType || '') as EmployerType;
  if (!VALID_EMPLOYER_TYPES.has(employerType)) {
    return { ok: false, statusCode: 400, error: 'INVALID_EMPLOYER_TYPE' };
  }

  // Prevent duplicate Active employment with the same employer
  const existingEmpSnap = await db
    .collection('secretary_employments')
    .where('secretaryUid', '==', params.secretaryUid)
    .where('employerUid', '==', String(inv.employerUid || ''))
    .limit(10)
    .get();

  const alreadyActive = existingEmpSnap.docs.some((docItem) => {
    const d = docItem.data();
    return d.employerType === employerType && d.status === 'Active';
  });
  if (alreadyActive) {
    return { ok: false, statusCode: 409, error: 'ALREADY_EMPLOYED_BY_EMPLOYER' };
  }

  const secSnap = await db.doc(`secretary_profiles/${params.secretaryUid}`).get();
  const secData = secSnap.exists ? serializeDoc(secSnap.data()) : {};

  const employmentId = safeId('semp');
  const permissions = sanitizePermissionsForEmployer(employerType, inv.proposedPermissions);
  const secretaryCode =
    normalizeStr(secData.secretaryCode || inv.secretaryCode, 32) ||
    computeSecretaryCode(params.secretaryUid);
  const secretaryName =
    normalizeStr(secData.fullName || inv.secretaryName || params.secretaryName, 120) ||
    'سكرتير MEDORA';
  const secretaryEmail = normalizeStr(
    secData.email || inv.secretaryEmail || params.secretaryEmail,
    254,
  );
  const secretaryPhone = normalizeStr(secData.phone, 32);

  const employmentDoc = {
    employmentId,
    invitationId: params.invitationId,
    employerType,
    employerUid: String(inv.employerUid),
    employerInstitutionId: String(inv.employerInstitutionId),
    employerName: normalizeStr(inv.employerName, 160),
    employerSubtitle: '',
    secretaryUid: params.secretaryUid,
    secretaryCode,
    secretaryEmail,
    secretaryName,
    secretaryPhone,
    status: 'Active' as SecretaryEmploymentStatus,
    permissions,
    assignedByUid: String(inv.invitedByUid || inv.employerUid),
    acceptedAt: nowIso,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const batch = db.batch();
  batch.update(invRef, {
    status: 'Accepted' as SecretaryInvitationStatus,
    respondedAt: nowIso,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`secretary_employments/${employmentId}`), employmentDoc);

  if (secSnap.exists) {
    batch.update(db.doc(`secretary_profiles/${params.secretaryUid}`), {
      permissionsGranted: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const initialTasks = sanitizeInitialTasks(inv.initialTasks);
  for (const t of initialTasks) {
    const taskId = safeId('stask');
    batch.set(db.doc(`secretary_tasks/${taskId}`), {
      taskId,
      employmentId,
      employerType,
      employerUid: String(inv.employerUid),
      employerName: normalizeStr(inv.employerName, 160),
      secretaryUid: params.secretaryUid,
      secretaryName,
      title: t.title,
      description: t.description || '',
      priority: t.priority,
      ...(t.dueDate ? { dueDate: t.dueDate } : {}),
      status: 'todo',
      createdByUid: String(inv.invitedByUid || inv.employerUid),
      createdByName: normalizeStr(inv.invitedByName || inv.employerName, 120),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  await appendSecretaryActivity(db, {
    employerUid: String(inv.employerUid),
    employerType,
    employerName: normalizeStr(inv.employerName, 160),
    employmentId,
    invitationId: params.invitationId,
    secretaryUid: params.secretaryUid,
    secretaryName,
    actorUid: params.secretaryUid,
    actorName: secretaryName,
    actorRole: 'secretary',
    action: 'INVITATION_ACCEPTED',
    details: `Accepted invitation for ${employerType} employer ${String(inv.employerName)} (${permissions.join(', ')})`,
  });

  const [updatedInv, createdEmp] = await Promise.all([
    invRef.get(),
    db.doc(`secretary_employments/${employmentId}`).get(),
  ]);

  return {
    ok: true,
    invitation: serializeDoc(updatedInv.data()),
    employment: serializeDoc(createdEmp.data()),
  };
}

export async function rejectSecretaryInvitationService(
  db: Firestore,
  params: {
    invitationId: string;
    secretaryUid: string;
    secretaryName: string;
  },
): Promise<
  | { ok: true; invitation: Record<string, unknown> }
  | { ok: false; statusCode: number; error: string }
> {
  const invRef = db.doc(`secretary_invitations/${params.invitationId}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists) {
    return { ok: false, statusCode: 404, error: 'INVITATION_NOT_FOUND' };
  }
  const inv = serializeDoc(invSnap.data());
  if (inv.secretaryUid !== params.secretaryUid) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_INVITATION' };
  }
  if (inv.status !== 'Pending') {
    return { ok: false, statusCode: 409, error: `INVITATION_ALREADY_${String(inv.status).toUpperCase()}` };
  }

  const nowIso = new Date().toISOString();
  await invRef.update({
    status: 'Rejected' as SecretaryInvitationStatus,
    respondedAt: nowIso,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await appendSecretaryActivity(db, {
    employerUid: String(inv.employerUid),
    employerType: String(inv.employerType) as EmployerType,
    employerName: normalizeStr(inv.employerName, 160),
    invitationId: params.invitationId,
    secretaryUid: params.secretaryUid,
    secretaryName: normalizeStr(inv.secretaryName || params.secretaryName, 120),
    actorUid: params.secretaryUid,
    actorName: normalizeStr(inv.secretaryName || params.secretaryName, 120),
    actorRole: 'secretary',
    action: 'INVITATION_REJECTED',
    details: `Rejected hiring invitation from ${String(inv.employerName)}`,
  });

  const updatedInv = await invRef.get();
  return { ok: true, invitation: serializeDoc(updatedInv.data()) };
}

export async function createEmployerInvitationService(
  db: Firestore,
  ctx: ResolvedEmployerContext,
  actorUid: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; invitation: Record<string, unknown> }
  | { ok: false; statusCode: number; error: string }
> {
  const candidate = await resolveSecretaryRecordForInvite(db, {
    secretaryUid: normalizeStr(body.secretaryUid, 128),
    query: normalizeStr(body.identifier || body.email || body.secretaryCode, 254),
  });
  if (!candidate) {
    return { ok: false, statusCode: 404, error: 'SECRETARY_NOT_FOUND' };
  }
  if (candidate.uid === actorUid) {
    return { ok: false, statusCode: 400, error: 'CANNOT_INVITE_SELF' };
  }

  const proposedPermissions = sanitizePermissionsForEmployer(
    ctx.employerType,
    body.proposedPermissions,
  );
  if (proposedPermissions.length === 0) {
    return { ok: false, statusCode: 400, error: 'AT_LEAST_ONE_PERMISSION_REQUIRED' };
  }

  const [existingInvSnap, existingEmpSnap] = await Promise.all([
    db
      .collection('secretary_invitations')
      .where('employerUid', '==', ctx.employerUid)
      .where('secretaryUid', '==', candidate.uid)
      .limit(20)
      .get(),
    db
      .collection('secretary_employments')
      .where('employerUid', '==', ctx.employerUid)
      .where('secretaryUid', '==', candidate.uid)
      .limit(10)
      .get(),
  ]);

  const nowIso = new Date().toISOString();
  const hasPending = existingInvSnap.docs.some((d) => {
    const data = d.data();
    return (
      data.employerType === ctx.employerType &&
      data.status === 'Pending' &&
      (!data.expiresAt || String(data.expiresAt) >= nowIso)
    );
  });
  if (hasPending) {
    return { ok: false, statusCode: 409, error: 'PENDING_INVITATION_EXISTS' };
  }

  const hasActiveOrSuspended = existingEmpSnap.docs.some((d) => {
    const data = d.data();
    return (
      data.employerType === ctx.employerType &&
      (data.status === 'Active' || data.status === 'Suspended')
    );
  });
  if (hasActiveOrSuspended) {
    return { ok: false, statusCode: 409, error: 'SECRETARY_ALREADY_LINKED' };
  }

  const expiryDaysRaw = Number(body.expiryDays);
  const expiryDays = Number.isFinite(expiryDaysRaw)
    ? Math.max(1, Math.min(60, Math.round(expiryDaysRaw)))
    : 14;
  const expiresAt = new Date(Date.now() + expiryDays * 86400 * 1000).toISOString();

  const invitationId = safeId('sinv');
  const message = normalizeStr(body.message, 1000);
  const initialTasks = sanitizeInitialTasks(body.initialTasks);

  await db.doc(`secretary_invitations/${invitationId}`).set({
    invitationId,
    employerType: ctx.employerType,
    employerUid: ctx.employerUid,
    employerInstitutionId: ctx.institutionId,
    employerName: ctx.employerName,
    employerEmail: ctx.employerEmail,
    invitedByUid: actorUid,
    invitedByName: ctx.actorName,
    secretaryUid: candidate.uid,
    secretaryCode: candidate.secretaryCode,
    secretaryEmail: candidate.email,
    secretaryName: candidate.fullName,
    message,
    proposedPermissions,
    initialTasks,
    status: 'Pending' as SecretaryInvitationStatus,
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await Promise.all([
    emitSecretaryNotification(db, {
      secretaryUid: candidate.uid,
      type: 'invitation_received',
      title: `دعوة توظيف جديدة من ${ctx.employerName}`,
      body: message || `تمت دعوتك للعمل كسكرتير بصلاحيات: ${proposedPermissions.join('، ')}`,
      relatedId: invitationId,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
    }),
    appendSecretaryActivity(db, {
      employerUid: ctx.employerUid,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
      invitationId,
      secretaryUid: candidate.uid,
      secretaryName: candidate.fullName,
      actorUid,
      actorName: ctx.actorName,
      actorRole: 'employer',
      action: 'INVITATION_SENT',
      details: `Sent ${ctx.employerType} invitation to ${candidate.email} with permissions: ${proposedPermissions.join(', ')}`,
    }),
  ]);

  const saved = await db.doc(`secretary_invitations/${invitationId}`).get();
  return { ok: true, invitation: serializeDoc(saved.data()) };
}

export async function revokeEmployerInvitationService(
  db: Firestore,
  ctx: ResolvedEmployerContext,
  actorUid: string,
  invitationId: string,
): Promise<
  | { ok: true; invitation: Record<string, unknown> }
  | { ok: false; statusCode: number; error: string }
> {
  const invRef = db.doc(`secretary_invitations/${invitationId}`);
  const invSnap = await invRef.get();
  if (!invSnap.exists) {
    return { ok: false, statusCode: 404, error: 'INVITATION_NOT_FOUND' };
  }
  const inv = serializeDoc(invSnap.data());
  if (inv.employerUid !== ctx.employerUid || inv.employerType !== ctx.employerType) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_INVITATION' };
  }
  if (inv.status !== 'Pending') {
    return { ok: false, statusCode: 409, error: 'ONLY_PENDING_CAN_BE_REVOKED' };
  }

  const nowIso = new Date().toISOString();
  await invRef.update({
    status: 'Revoked' as SecretaryInvitationStatus,
    revokedAt: nowIso,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await Promise.all([
    emitSecretaryNotification(db, {
      secretaryUid: String(inv.secretaryUid),
      type: 'invitation_revoked',
      title: `تم سحب دعوة التوظيف من ${ctx.employerName}`,
      body: `قام صاحب الجهة بسحب دعوة التوظيف المعلقة قبل قبولها.`,
      relatedId: invitationId,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
    }),
    appendSecretaryActivity(db, {
      employerUid: ctx.employerUid,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
      invitationId,
      secretaryUid: String(inv.secretaryUid),
      secretaryName: normalizeStr(inv.secretaryName, 120),
      actorUid,
      actorName: ctx.actorName,
      actorRole: 'employer',
      action: 'INVITATION_REVOKED',
      details: `Revoked pending invitation ${invitationId}`,
    }),
  ]);

  const updated = await invRef.get();
  return { ok: true, invitation: serializeDoc(updated.data()) };
}

export async function updateEmployerEmploymentService(
  db: Firestore,
  ctx: ResolvedEmployerContext,
  actorUid: string,
  employmentId: string,
  body: Record<string, unknown>,
): Promise<
  | { ok: true; employment: Record<string, unknown> }
  | { ok: false; statusCode: number; error: string }
> {
  const empRef = db.doc(`secretary_employments/${employmentId}`);
  const empSnap = await empRef.get();
  if (!empSnap.exists) {
    return { ok: false, statusCode: 404, error: 'EMPLOYMENT_NOT_FOUND' };
  }
  const emp = serializeDoc(empSnap.data());
  if (emp.employerUid !== ctx.employerUid || emp.employerType !== ctx.employerType) {
    return { ok: false, statusCode: 403, error: 'FORBIDDEN_EMPLOYMENT' };
  }
  if (emp.status === 'Terminated') {
    return { ok: false, statusCode: 409, error: 'TERMINATED_LINK_IS_FINAL' };
  }

  const nextStatusRaw = normalizeStr(body.status, 32);
  const nextStatus =
    nextStatusRaw === 'Active' || nextStatusRaw === 'Suspended' || nextStatusRaw === 'Terminated'
      ? (nextStatusRaw as SecretaryEmploymentStatus)
      : undefined;

  const hasPerms = Array.isArray(body.permissions);
  const nextPerms = hasPerms
    ? sanitizePermissionsForEmployer(ctx.employerType, body.permissions)
    : undefined;

  if (!nextStatus && !nextPerms) {
    return { ok: false, statusCode: 400, error: 'NO_CHANGES_PROVIDED' };
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (nextPerms) {
    patch.permissions = nextPerms;
  }
  if (nextStatus) {
    patch.status = nextStatus;
    if (nextStatus === 'Suspended') patch.suspendedAt = nowIso;
    if (nextStatus === 'Terminated') patch.terminatedAt = nowIso;
    if (body.statusReason !== undefined) {
      patch.statusReason = normalizeStr(body.statusReason, 300);
    }
  }

  await empRef.update(patch);

  // Determine notification & audit action
  let action = 'PERMISSIONS_UPDATED';
  let notifType:
    | 'permissions_updated'
    | 'employment_suspended'
    | 'employment_reactivated'
    | 'employment_terminated' = 'permissions_updated';
  let notifTitle = `تحديث صلاحياتك لدى ${ctx.employerName}`;
  let notifBody = nextPerms
    ? `الصلاحيات المحدثة: ${nextPerms.length > 0 ? nextPerms.join('، ') : 'بدون صلاحيات'}`
    : 'تم تحديث إعدادات ارتباطك الإداري.';

  if (nextStatus && nextStatus !== emp.status) {
    if (nextStatus === 'Suspended') {
      action = 'EMPLOYMENT_SUSPENDED';
      notifType = 'employment_suspended';
      notifTitle = `تم تعليق ارتباطك مؤقتاً مع ${ctx.employerName}`;
      notifBody = 'لن تتمكن من الوصول إلى بيانات هذه الجهة لحين إعادة التفعيل.';
    } else if (nextStatus === 'Terminated') {
      action = 'EMPLOYMENT_TERMINATED';
      notifType = 'employment_terminated';
      notifTitle = `تم إنهاء الارتباط مع ${ctx.employerName}`;
      notifBody = 'تم سحب الصلاحيات وإنهاء العلاقة الوظيفية بشكل دائم.';
    } else if (nextStatus === 'Active') {
      action = 'EMPLOYMENT_REACTIVATED';
      notifType = 'employment_reactivated';
      notifTitle = `تم إعادة تفعيل ارتباطك مع ${ctx.employerName}`;
      notifBody = 'يمكنك الآن استئناف مهامك حسب الصلاحيات الممنوحة.';
    }
  }

  await Promise.all([
    emitSecretaryNotification(db, {
      secretaryUid: String(emp.secretaryUid),
      type: notifType,
      title: notifTitle,
      body: notifBody,
      relatedId: employmentId,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
    }),
    appendSecretaryActivity(db, {
      employerUid: ctx.employerUid,
      employerType: ctx.employerType,
      employerName: ctx.employerName,
      employmentId,
      secretaryUid: String(emp.secretaryUid),
      secretaryName: normalizeStr(emp.secretaryName, 120),
      actorUid,
      actorName: ctx.actorName,
      actorRole: 'employer',
      action,
      details: `Updated employment ${employmentId}: status=${nextStatus || emp.status}, permissions=${(nextPerms || (emp.permissions as string[]) || []).join(', ')}`,
    }),
  ]);

  const updated = await empRef.get();
  return { ok: true, employment: serializeDoc(updated.data()) };
}

export async function loadScopedWorkspaceForEmployment(
  db: Firestore,
  employment: Record<string, unknown> & {
    employmentId: string;
    employerType: EmployerType;
    employerUid: string;
    permissions: AnySecretaryPermission[];
  },
): Promise<Record<string, unknown>> {
  const permSet = new Set<string>(employment.permissions);
  const employerUid = employment.employerUid;
  const employerType = employment.employerType;

  // Always load tasks belonging STRICTLY to this employmentId
  const tasksSnap = await db
    .collection('secretary_tasks')
    .where('employmentId', '==', employment.employmentId)
    .limit(150)
    .get();
  const tasks = tasksSnap.docs
    .map((d) => serializeDoc(d.data()))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const scope: Record<string, unknown> = {
    employment,
    tasks,
  };

  if (employerType === 'doctor') {
    const canSeeAppts =
      permSet.has('manageBookings') ||
      permSet.has('confirmAppointments') ||
      permSet.has('manageWaitlist');
    const canSeeMessaging = permSet.has('adminMessaging');
    const canSeeFiles = permSet.has('viewSelectedFiles');

    const [apptsSnap, convsSnap, sharesSnap] = await Promise.all([
      canSeeAppts
        ? db.collection('appointments').where('doctorUid', '==', employerUid).limit(200).get()
        : Promise.resolve(null),
      canSeeMessaging
        ? db.collection('doctor_conversations').where('doctorUid', '==', employerUid).limit(100).get()
        : Promise.resolve(null),
      canSeeFiles
        ? db
            .collection('medical_record_shares')
            .where('doctorUid', '==', employerUid)
            .where('revoked', '==', false)
            .limit(80)
            .get()
        : Promise.resolve(null),
    ]);

    if (canSeeAppts) {
      let rows = (apptsSnap?.docs || []).map((d) => {
        const a = serializeDoc(d.data());
        return {
          appointmentId: a.appointmentId || d.id,
          patientName: normalizeStr(a.patientName, 120),
          patientPhone: normalizeStr(a.patientPhone, 32),
          date: normalizeStr(a.date, 20),
          time: normalizeStr(a.time, 10),
          visitType: normalizeStr(a.visitType, 32) || 'scheduled',
          status: normalizeStr(a.status, 32) || 'pending',
          isWaitlist: Boolean(a.isWaitlist),
          reason: normalizeStr(a.reason, 240),
          createdAt: a.createdAt || null,
        };
      });
      if (!permSet.has('manageBookings') && !permSet.has('confirmAppointments') && permSet.has('manageWaitlist')) {
        rows = rows.filter((r) => r.isWaitlist || r.status === 'checked_in' || r.status === 'pending');
      }
      rows.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
      scope.appointments = rows;
    }

    if (canSeeMessaging) {
      scope.conversations = (convsSnap?.docs || [])
        .map((d) => {
          const c = serializeDoc(d.data());
          return {
            conversationId: c.conversationId || d.id,
            patientUid: c.patientUid || '',
            patientName: normalizeStr(c.patientName, 120),
            patientPhone: normalizeStr(c.patientPhone, 32),
            lastMessagePreview: normalizeStr(c.lastMessagePreview, 240),
            lastMessageAt: c.lastMessageAt || null,
            unreadCount: Number(c.unreadByDoctor || 0),
          };
        })
        .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
    }

    if (canSeeFiles) {
      const nowIso = new Date().toISOString();
      const selectedFiles: Array<Record<string, unknown>> = [];
      for (const sDoc of sharesSnap?.docs || []) {
        const s = sDoc.data();
        const perms = (s.permissions as Record<string, unknown> | undefined) || {};
        if (perms.uploadedFiles !== true) continue;
        if (typeof s.expiresAt === 'string' && s.expiresAt && s.expiresAt < nowIso) continue;
        const pUid = String(s.patientUid || '');
        if (!pUid) continue;
        const filesSnap = await db
          .collection('patient_medical_files')
          .where('patientUid', '==', pUid)
          .limit(20)
          .get();
        filesSnap.docs.forEach((fDoc) => {
          const fd = serializeDoc(fDoc.data());
          selectedFiles.push({
            fileId: fd.fileId || fDoc.id,
            patientName: normalizeStr(s.patientName, 120) || 'MEDORA Patient',
            title: normalizeStr(fd.title, 160),
            category: normalizeStr(fd.category, 40),
            documentDate: normalizeStr(fd.documentDate, 20),
            fileUrl: normalizeStr(fd.fileUrl || fd.url, 1000),
            mimeType: normalizeStr(fd.mimeType, 100),
          });
        });
      }
      scope.selectedFiles = selectedFiles;
    }
  } else if (employerType === 'lab') {
    const canSeeBookings =
      permSet.has('manageBookings') || permSet.has('registerPatientArrival');
    const canTrackOrders = permSet.has('trackOrders') || permSet.has('viewTestStatus');
    const canSeeMessaging = permSet.has('adminMessaging');

    const [bookingsSnap, ordersSnap, convsSnap] = await Promise.all([
      canSeeBookings
        ? db.collection('lab_bookings').where('facilityUid', '==', employerUid).limit(200).get()
        : Promise.resolve(null),
      canTrackOrders
        ? db.collection('lab_orders').where('labUid', '==', employerUid).limit(200).get()
        : Promise.resolve(null),
      canSeeMessaging
        ? db.collection('lab_conversations').where('labUid', '==', employerUid).limit(100).get()
        : Promise.resolve(null),
    ]);

    if (canSeeBookings) {
      scope.labBookings = (bookingsSnap?.docs || [])
        .map((d) => {
          const b = serializeDoc(d.data());
          return {
            bookingId: b.bookingId || d.id,
            patientName: normalizeStr(b.patientName, 120),
            patientPhone: normalizeStr(b.patientPhone, 32),
            date: normalizeStr(b.date, 20),
            time: normalizeStr(b.time, 10),
            requestedTests: Array.isArray(b.requestedTests) ? b.requestedTests : [],
            status: normalizeStr(b.status, 32) || 'pending',
            arrivalRegistered: Boolean(b.arrivalRegistered),
            arrivalRegisteredAt: b.arrivalRegisteredAt || null,
            notes: normalizeStr(b.notes, 240),
            createdAt: b.createdAt || null,
          };
        })
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    }

    if (canTrackOrders) {
      scope.labOrders = (ordersSnap?.docs || [])
        .map((d) => {
          const o = serializeDoc(d.data());
          const testsArr = Array.isArray(o.tests) ? (o.tests as Array<Record<string, unknown>>) : [];
          return {
            orderId: o.orderId || d.id,
            orderNumber: normalizeStr(o.orderNumber, 40),
            patientName: normalizeStr(o.patientName, 120),
            patientPhone: normalizeStr(o.patientPhone, 32),
            priority: normalizeStr(o.priority, 20) || 'routine',
            status: normalizeStr(o.status, 32) || 'ordered',
            testNames: testsArr
              .map((t) => normalizeStr(t.nameAr || t.nameEn || t.code, 120))
              .filter(Boolean),
            createdAt: o.createdAt || null,
            updatedAt: o.updatedAt || null,
          };
        })
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }

    if (canSeeMessaging) {
      scope.conversations = (convsSnap?.docs || [])
        .map((d) => {
          const c = serializeDoc(d.data());
          return {
            conversationId: c.conversationId || d.id,
            patientUid: c.patientUid || '',
            patientName: normalizeStr(c.patientName, 120),
            patientPhone: normalizeStr(c.patientPhone, 32),
            lastMessagePreview: normalizeStr(c.lastMessagePreview, 240),
            lastMessageAt: c.lastMessageAt || null,
            unreadCount: Number(c.unreadByLab || 0),
          };
        })
        .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
    }
  } else if (employerType === 'pharmacy') {
    const allowedKinds = new Set<string>();
    if (permSet.has('trackOrders')) allowedKinds.add('order');
    if (permSet.has('managePickupBookings')) allowedKinds.add('pickup_booking');
    if (permSet.has('manageInventory')) allowedKinds.add('inventory');
    if (permSet.has('trackSupplierOrders')) allowedKinds.add('supplier_order');

    if (allowedKinds.size > 0) {
      const pharmSnap = await db
        .collection('pharmacy_operations')
        .where('pharmacyUid', '==', employerUid)
        .limit(200)
        .get();
      scope.pharmacyItems = pharmSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((item) => allowedKinds.has(String(item.kind || '')))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    } else {
      scope.pharmacyItems = [];
    }
  }

  return scope;
}

export function createSecretaryRouter(deps: SecretaryRouterDeps): Router {
  const router = express.Router();

  async function verifyActor(req: Request, res: Response): Promise<VerifiedActor | null> {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    try {
      const decoded = await deps.adminAuth.verifyIdToken(match[1], true);
      if (decoded.email_verified !== true) {
        res.status(403).json({ error: 'EMAIL_UNVERIFIED' });
        return null;
      }
      return {
        uid: decoded.uid,
        email: typeof decoded.email === 'string' ? decoded.email : '',
        name:
          typeof decoded.name === 'string' && decoded.name.trim()
            ? decoded.name.trim()
            : typeof decoded.email === 'string'
              ? decoded.email.split('@')[0]
              : 'MEDORA User',
      };
    } catch {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return null;
    }
  }

  function requireDb(res: Response): Firestore | null {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_SDK_UNAVAILABLE' });
      return null;
    }
    return db;
  }

  // ---------------------------------------------------------------------------
  // 1. Independent Secretary Registration & Profile Activation
  // ---------------------------------------------------------------------------
  router.post('/secretary/register', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const body = (req.body || {}) as Record<string, unknown>;
    const phone = normalizeStr(body.phone, 32);
    const educationQualification = normalizeStr(body.educationQualification, 160);
    const previousExperience = normalizeStr(body.previousExperience, 400);
    const bio = normalizeStr(body.bio, 500);
    const acceptedTerms = body.acceptedTerms === true;

    if (!acceptedTerms) {
      res.status(400).json({ error: 'TERMS_REQUIRED' });
      return;
    }
    if (phone.length < 6 || educationQualification.length < 2) {
      res.status(400).json({ error: 'INCOMPLETE_PORTAL_FIELDS' });
      return;
    }

    try {
      const userRef = db.doc(`users/${actor.uid}`);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        res.status(400).json({ error: 'INCOMPLETE_PERSONAL_PROFILE' });
        return;
      }
      const userData = serializeDoc(userSnap.data());
      if (
        normalizeStr(userData.fullName || userData.googleName, 120).length < 2 ||
        normalizeStr(userData.dateOfBirth, 20).length < 4 ||
        normalizeStr(userData.governorate, 80).length < 2 ||
        normalizeStr(userData.district, 80).length < 2 ||
        normalizeStr(userData.address, 240).length < 2
      ) {
        res.status(400).json({ error: 'INCOMPLETE_PERSONAL_PROFILE' });
        return;
      }

      const secRef = db.doc(`secretary_profiles/${actor.uid}`);
      const existingSec = await secRef.get();
      const secretaryCode =
        (existingSec.exists && normalizeStr(existingSec.data()?.secretaryCode, 32)) ||
        computeSecretaryCode(actor.uid);
      const genderVal = userData.gender === 'female' ? 'female' : 'male';
      const fullName = normalizeStr(userData.fullName || userData.googleName || actor.name, 120);

      const profileDoc = {
        uid: actor.uid,
        secretaryCode,
        email: normalizeStr(userData.email || actor.email, 254),
        fullName,
        dateOfBirth: normalizeStr(userData.dateOfBirth, 20),
        gender: genderVal,
        avatarUrl: normalizeStr(userData.avatarUrl || userData.photoUrl, 1000),
        governorate: normalizeStr(userData.governorate, 80),
        district: normalizeStr(userData.district, 80),
        phone,
        educationQualification,
        previousExperience,
        bio,
        targetInstitutionName: '',
        invitationCode: '',
        permissionsGranted: Boolean(existingSec.exists && existingSec.data()?.permissionsGranted),
        status: 'Approved',
        createdAt:
          existingSec.exists && existingSec.data()?.createdAt
            ? existingSec.data()?.createdAt
            : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const existingReqsSnap = await db
        .collection('registration_requests')
        .where('uid', '==', actor.uid)
        .where('portalType', '==', 'secretary')
        .limit(5)
        .get();

      const nowDate = new Date();
      const ymd = `${nowDate.getUTCFullYear()}${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}${String(nowDate.getUTCDate()).padStart(2, '0')}`;
      const existingReqDoc = existingReqsSnap.docs[0];
      const requestId = existingReqDoc ? existingReqDoc.id : safeId('req_secretary');
      const requestNumber = existingReqDoc
        ? String(existingReqDoc.data().requestNumber || `MDR-${ymd}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
        : `MDR-${ymd}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const batch = db.batch();
      batch.set(secRef, profileDoc);

      if (existingReqDoc) {
        batch.update(existingReqDoc.ref, {
          status: 'Approved',
          acceptedTerms: true,
          submittedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        batch.set(db.doc(`registration_requests/${requestId}`), {
          requestId,
          requestNumber,
          uid: actor.uid,
          applicantEmail: normalizeStr(userData.email || actor.email, 254),
          applicantName: fullName,
          portalType: 'secretary',
          profilePath: `secretary_profiles/${actor.uid}`,
          status: 'Approved',
          activationRule: 'institution_approval',
          reviewReason: '',
          reviewInstructions: '',
          acceptedTerms: true,
          submittedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      batch.update(userRef, {
        selectedPortal: 'secretary',
        registrationCompleted: true,
        accountStatus: 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });

      const logId = safeId('log');
      batch.set(db.doc(`audit_logs/${logId}`), {
        logId,
        actorUid: actor.uid,
        actorEmail: normalizeStr(userData.email || actor.email, 254),
        action: 'SECRETARY_INDEPENDENT_REGISTERED',
        targetCollection: 'secretary_profiles',
        targetId: actor.uid,
        details: `Registered independent MEDORA Secretary account (${secretaryCode})`,
        createdAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();

      await emitAdminNotification(db, {
        eventType: 'registration_decision',
        type: 'registration',
        title: `تسجيل حساب سكرتير مستقل: ${fullName}`,
        body: `الكود الوظيفي: ${secretaryCode} · ${actor.email}`,
        relatedId: requestId,
        relatedType: 'registration_request',
        idempotencyKey: `adm_sec_reg:${actor.uid}:${requestId}`,
      });

      const [savedReq, savedProfile] = await Promise.all([
        db.doc(`registration_requests/${requestId}`).get(),
        secRef.get(),
      ]);

      res.status(201).json({
        ok: true,
        request: serializeDoc(savedReq.data()),
        profile: serializeDoc(savedProfile.data()),
      });
    } catch (err) {
      console.error('[MEDORA][SecretaryRegister] error:', err);
      res.status(500).json({ error: 'SECRETARY_REGISTER_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Secretary Portal Probe & Workspace Hydration
  // ---------------------------------------------------------------------------
  router.get('/secretary/access', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const [secSnap, userSnap, invSnap, empSnap] = await Promise.all([
        db.doc(`secretary_profiles/${actor.uid}`).get(),
        db.doc(`users/${actor.uid}`).get(),
        db.collection('secretary_invitations').where('secretaryUid', '==', actor.uid).limit(20).get(),
        db.collection('secretary_employments').where('secretaryUid', '==', actor.uid).limit(20).get(),
      ]);

      const hasProfile =
        secSnap.exists ||
        (userSnap.exists && userSnap.data()?.selectedPortal === 'secretary');
      const pendingInvitationsCount = invSnap.docs.filter(
        (d) => d.data().status === 'Pending',
      ).length;
      const activeEmploymentsCount = empSnap.docs.filter(
        (d) => d.data().status === 'Active',
      ).length;

      res.json({
        ok: true,
        hasAccess: hasProfile || pendingInvitationsCount > 0 || activeEmploymentsCount > 0,
        hasProfile,
        pendingInvitationsCount,
        activeEmploymentsCount,
      });
    } catch (err) {
      console.error('[MEDORA][SecretaryAccess] error:', err);
      res.status(500).json({ error: 'SECRETARY_ACCESS_CHECK_FAILED' });
    }
  });

  router.get('/secretary/workspace', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const [secSnap, userSnap, invSnap, empSnap, notifSnap, logsSnap] = await Promise.all([
        db.doc(`secretary_profiles/${actor.uid}`).get(),
        db.doc(`users/${actor.uid}`).get(),
        db.collection('secretary_invitations').where('secretaryUid', '==', actor.uid).limit(100).get(),
        db.collection('secretary_employments').where('secretaryUid', '==', actor.uid).limit(50).get(),
        db.collection('secretary_notifications').where('secretaryUid', '==', actor.uid).limit(100).get(),
        db.collection('secretary_activity_logs').where('secretaryUid', '==', actor.uid).limit(150).get(),
      ]);

      const userData = userSnap.exists ? serializeDoc(userSnap.data()) : {};
      const secData = secSnap.exists ? serializeDoc(secSnap.data()) : {};

      if (!secSnap.exists && userData.selectedPortal !== 'secretary' && invSnap.empty && empSnap.empty) {
        res.status(403).json({ error: 'SECRETARY_PORTAL_ACCESS_DENIED' });
        return;
      }

      const secretaryCode =
        normalizeStr(secData.secretaryCode, 32) || computeSecretaryCode(actor.uid);

      // Backfill secretaryCode/email cleanly on legacy secretary_profiles docs
      if (secSnap.exists && (!secData.secretaryCode || !secData.email)) {
        await secSnap.ref.update({
          secretaryCode,
          email: normalizeStr(secData.email || userData.email || actor.email, 254),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const profile = {
        uid: actor.uid,
        secretaryCode,
        email: normalizeStr(secData.email || userData.email || actor.email, 254),
        fullName:
          normalizeStr(secData.fullName || userData.fullName || userData.googleName || actor.name, 120) ||
          'سكرتير MEDORA',
        dateOfBirth: normalizeStr(secData.dateOfBirth || userData.dateOfBirth, 20),
        gender: (secData.gender || userData.gender || 'unspecified') as 'male' | 'female' | 'unspecified',
        avatarUrl: normalizeStr(secData.avatarUrl || userData.avatarUrl || userData.photoUrl, 1000),
        governorate: normalizeStr(secData.governorate || userData.governorate, 80),
        district: normalizeStr(secData.district || userData.district, 80),
        phone: normalizeStr(secData.phone || userData.phone, 32),
        educationQualification: normalizeStr(secData.educationQualification, 160),
        previousExperience: normalizeStr(secData.previousExperience, 400),
        bio: normalizeStr(secData.bio, 500),
        permissionsGranted: Boolean(secData.permissionsGranted),
        status: normalizeStr(secData.status, 40) || 'Approved',
        createdAt: secData.createdAt || null,
        updatedAt: secData.updatedAt || null,
      };

      const invitations = (await expirePendingInvitationsIfNeeded(db, invSnap.docs)).sort(
        (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      );
      const employments = empSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.acceptedAt || '').localeCompare(String(a.acceptedAt || '')));
      const notifications = notifSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const activityLogs = logsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const requestedEmploymentId = normalizeStr(req.query.employmentId, 128);
      let selectedEmploymentId: string | null = null;
      let activeScope: Record<string, unknown> | null = null;

      if (requestedEmploymentId) {
        const resolved = await resolveActiveSecretaryEmployment(
          db,
          actor.uid,
          requestedEmploymentId,
        );
        if (!resolved.ok) {
          res.status(resolved.statusCode).json({ error: resolved.error });
          return;
        }
        selectedEmploymentId = resolved.employment.employmentId;
        activeScope = await loadScopedWorkspaceForEmployment(db, resolved.employment);
      } else {
        const firstActive = employments.find((e) => e.status === 'Active');
        if (firstActive && typeof firstActive.employmentId === 'string') {
          const resolved = await resolveActiveSecretaryEmployment(
            db,
            actor.uid,
            firstActive.employmentId,
          );
          if (resolved.ok) {
            selectedEmploymentId = resolved.employment.employmentId;
            activeScope = await loadScopedWorkspaceForEmployment(db, resolved.employment);
          }
        }
      }

      res.json({
        ok: true,
        profile,
        invitations,
        employments,
        notifications,
        activityLogs,
        selectedEmploymentId,
        activeScope,
      });
    } catch (err) {
      console.error('[MEDORA][SecretaryWorkspace] error:', err);
      res.status(500).json({ error: 'SECRETARY_WORKSPACE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Secretary Two-Way Consent & Profile/Notifications/Tasks
  // ---------------------------------------------------------------------------
  router.post('/secretary/invitations/:invitationId/accept', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const result = await acceptSecretaryInvitationService(db, {
        invitationId: normalizeStr(req.params.invitationId, 128),
        secretaryUid: actor.uid,
        secretaryEmail: actor.email,
        secretaryName: actor.name,
      });
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.json({ ok: true, invitation: result.invitation, employment: result.employment });
    } catch (err) {
      console.error('[MEDORA][SecretaryAcceptInvite] error:', err);
      res.status(500).json({ error: 'INVITATION_ACCEPT_FAILED' });
    }
  });

  router.post('/secretary/invitations/:invitationId/reject', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const result = await rejectSecretaryInvitationService(db, {
        invitationId: normalizeStr(req.params.invitationId, 128),
        secretaryUid: actor.uid,
        secretaryName: actor.name,
      });
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.json({ ok: true, invitation: result.invitation });
    } catch (err) {
      console.error('[MEDORA][SecretaryRejectInvite] error:', err);
      res.status(500).json({ error: 'INVITATION_REJECT_FAILED' });
    }
  });

  router.put('/secretary/profile', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const body = (req.body || {}) as Record<string, unknown>;
    if (
      'permissions' in body ||
      'permissionsGranted' in body ||
      'employments' in body ||
      'status' in body ||
      'role' in body
    ) {
      res.status(403).json({ error: 'PRIVILEGE_ESCALATION_BLOCKED' });
      return;
    }

    const fullName = normalizeStr(body.fullName, 120);
    const phone = normalizeStr(body.phone, 32);
    const governorate = normalizeStr(body.governorate, 80);
    const district = normalizeStr(body.district, 80);
    const educationQualification = normalizeStr(body.educationQualification, 160);
    const previousExperience = normalizeStr(body.previousExperience, 400);
    const bio = normalizeStr(body.bio, 500);

    if (fullName.length < 2 || phone.length < 6 || educationQualification.length < 2) {
      res.status(400).json({ error: 'INVALID_SECRETARY_PROFILE_FIELDS' });
      return;
    }

    try {
      const secRef = db.doc(`secretary_profiles/${actor.uid}`);
      const secSnap = await secRef.get();
      const userRef = db.doc(`users/${actor.uid}`);
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? serializeDoc(userSnap.data()) : {};

      const secretaryCode =
        (secSnap.exists && normalizeStr(secSnap.data()?.secretaryCode, 32)) ||
        computeSecretaryCode(actor.uid);

      const batch = db.batch();
      if (secSnap.exists) {
        batch.update(secRef, {
          fullName,
          phone,
          governorate: governorate || normalizeStr(userData.governorate, 80),
          district: district || normalizeStr(userData.district, 80),
          educationQualification,
          previousExperience,
          bio,
          email: normalizeStr(userData.email || actor.email, 254),
          secretaryCode,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        batch.set(secRef, {
          uid: actor.uid,
          secretaryCode,
          email: normalizeStr(userData.email || actor.email, 254),
          fullName,
          dateOfBirth: normalizeStr(userData.dateOfBirth, 20) || '1995-01-01',
          gender: userData.gender === 'female' ? 'female' : 'male',
          avatarUrl: normalizeStr(userData.avatarUrl || userData.photoUrl, 1000),
          governorate: governorate || normalizeStr(userData.governorate, 80) || 'بغداد',
          district: district || normalizeStr(userData.district, 80) || 'المركز',
          phone,
          educationQualification,
          previousExperience,
          bio,
          targetInstitutionName: '',
          invitationCode: '',
          permissionsGranted: false,
          status: 'Approved',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (userSnap.exists) {
        batch.update(userRef, {
          fullName,
          phone,
          ...(governorate ? { governorate } : {}),
          ...(district ? { district } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      const updated = await secRef.get();
      res.json({ ok: true, profile: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryUpdateProfile] error:', err);
      res.status(500).json({ error: 'SECRETARY_PROFILE_UPDATE_FAILED' });
    }
  });

  router.post('/secretary/notifications/read-all', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const snap = await db
        .collection('secretary_notifications')
        .where('secretaryUid', '==', actor.uid)
        .where('isRead', '==', false)
        .limit(100)
        .get();
      const batch = db.batch();
      snap.docs.forEach((d) => {
        batch.update(d.ref, { isRead: true });
      });
      await batch.commit();
      res.json({ ok: true });
    } catch (err) {
      console.error('[MEDORA][SecretaryNotifReadAll] error:', err);
      res.status(500).json({ error: 'NOTIFICATIONS_UPDATE_FAILED' });
    }
  });

  router.patch('/secretary/notifications/:notificationId/read', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    try {
      const ref = db.doc(`secretary_notifications/${normalizeStr(req.params.notificationId, 128)}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.secretaryUid !== actor.uid) {
        res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
        return;
      }
      await ref.update({ isRead: true });
      res.json({ ok: true });
    } catch (err) {
      console.error('[MEDORA][SecretaryNotifRead] error:', err);
      res.status(500).json({ error: 'NOTIFICATION_UPDATE_FAILED' });
    }
  });

  router.patch('/secretary/tasks/:taskId', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const taskId = normalizeStr(req.params.taskId, 128);
    const nextStatus = normalizeStr(req.body?.status, 32);
    if (!ACTIVE_TASK_STATUSES.has(nextStatus)) {
      res.status(400).json({ error: 'INVALID_TASK_STATUS' });
      return;
    }

    try {
      const taskRef = db.doc(`secretary_tasks/${taskId}`);
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists) {
        res.status(404).json({ error: 'TASK_NOT_FOUND' });
        return;
      }
      const task = serializeDoc(taskSnap.data());
      if (task.secretaryUid !== actor.uid) {
        res.status(403).json({ error: 'FORBIDDEN_TASK' });
        return;
      }

      const empRes = await resolveActiveSecretaryEmployment(
        db,
        actor.uid,
        String(task.employmentId || ''),
      );
      if (!empRes.ok) {
        res.status(empRes.statusCode).json({ error: empRes.error });
        return;
      }

      const completedAt = nextStatus === 'done' ? new Date().toISOString() : '';
      await taskRef.update({
        status: nextStatus,
        completedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendSecretaryActivity(db, {
        employerUid: empRes.employment.employerUid,
        employerType: empRes.employment.employerType,
        employerName: empRes.employment.employerName,
        employmentId: empRes.employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(task.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(task.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'TASK_STATUS_UPDATED',
        details: `Updated task "${String(task.title)}" to ${nextStatus}`,
      });

      const taskEngine = getGlobalNotificationEngine();
      if (taskEngine && empRes.employment.employerUid) {
        const empRole =
          empRes.employment.employerType === 'doctor'
            ? 'doctor'
            : empRes.employment.employerType === 'lab'
              ? 'lab'
              : 'pharmacy';
        await taskEngine
          .dispatch({
            eventType: 'admin_notice',
            recipientUid: empRes.employment.employerUid,
            recipientRole: empRole,
            title: `تحديث مهمة السكرتير (${String(task.title || '')})`,
            body: `قام السكرتير ${normalizeStr(task.secretaryName || actor.name, 120)} بتحديث الحالة إلى: ${nextStatus}`,
            inAppType: 'task_assigned',
            relatedId: taskId,
            relatedType: 'secretary_task',
            idempotencyKey: `emp_sec_task:${taskId}:${nextStatus}`,
          })
          .catch(() => undefined);
      }

      const updated = await taskRef.get();
      res.json({ ok: true, task: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryTaskUpdate] error:', err);
      res.status(500).json({ error: 'TASK_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Strictly Scoped Secretary Operational Endpoints (Per Active Employment)
  // ---------------------------------------------------------------------------
  router.post('/secretary/employments/:employmentId/doctor/appointments', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (employment.employerType !== 'doctor') {
      res.status(403).json({ error: 'EMPLOYER_TYPE_MISMATCH' });
      return;
    }
    if (
      !employment.permissions.includes('manageBookings') &&
      !employment.permissions.includes('manageWaitlist')
    ) {
      res.status(403).json({ error: 'MISSING_SECRETARY_PERMISSION' });
      return;
    }

    const patientName = normalizeStr(req.body?.patientName, 120);
    const patientPhone = normalizeStr(req.body?.patientPhone, 32);
    const date = normalizeStr(req.body?.date, 20);
    const time = normalizeStr(req.body?.time, 10);
    const visitType = normalizeStr(req.body?.visitType, 32) || 'scheduled';
    const isWaitlist = Boolean(req.body?.isWaitlist);
    const reason = normalizeStr(req.body?.reason, 300);

    if (patientName.length < 2 || patientPhone.length < 5 || !date || !time) {
      res.status(400).json({ error: 'MISSING_BOOKING_FIELDS' });
      return;
    }

    try {
      const slotKey = `${employment.employerUid}_${date}_${time}`;
      if (!isWaitlist) {
        const conflictSnap = await db
          .collection('appointments')
          .where('slotKey', '==', slotKey)
          .limit(5)
          .get();
        const hasConflict = conflictSnap.docs.some((d) => {
          const st = String(d.data().status || '');
          return st !== 'cancelled' && st !== 'rejected' && d.data().isWaitlist !== true;
        });
        if (hasConflict) {
          res.status(409).json({ error: 'APPOINTMENT_SLOT_TAKEN' });
          return;
        }
      }

      const appointmentId = safeId('appt');
      const initialStatus =
        !isWaitlist && employment.permissions.includes('confirmAppointments') && req.body?.autoConfirm === true
          ? 'confirmed'
          : 'pending';

      await db.doc(`appointments/${appointmentId}`).set({
        appointmentId,
        doctorUid: employment.employerUid,
        institutionId: employment.employerInstitutionId,
        patientName,
        patientPhone,
        date,
        time,
        slotKey,
        visitType,
        reason,
        status: initialStatus,
        isWaitlist,
        createdByUid: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: 'doctor',
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'DOCTOR_APPOINTMENT_CREATED',
        details: `Created appointment for ${patientName} on ${date} ${time} (waitlist=${isWaitlist})`,
      });

      const docSecEngine = getGlobalNotificationEngine();
      if (docSecEngine) {
        await docSecEngine
          .dispatch({
            eventType: 'appointment_booked',
            recipientUid: employment.employerUid,
            recipientRole: 'doctor',
            title: `موعد جديد أضافته السكرتارية (${patientName})`,
            body: `التاريخ ${date} الساعة ${time} — بواسطة ${actor.name}`,
            inAppType: 'appointment',
            relatedId: appointmentId,
            relatedType: 'appointment',
            idempotencyKey: `doc_sec_apt:${appointmentId}`,
            placeholders: {
              refCode: appointmentId.slice(0, 16).toUpperCase(),
              statusLabel: initialStatus,
              dateLabel: date,
            },
          })
          .catch(() => undefined);
      }

      const saved = await db.doc(`appointments/${appointmentId}`).get();
      res.status(201).json({ ok: true, appointment: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryCreateDocAppt] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_CREATE_FAILED' });
    }
  });

  router.patch('/secretary/employments/:employmentId/doctor/appointments/:appointmentId', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (employment.employerType !== 'doctor') {
      res.status(403).json({ error: 'EMPLOYER_TYPE_MISMATCH' });
      return;
    }

    const nextStatus = normalizeStr(req.body?.status, 32);
    const perms = new Set<string>(employment.permissions);
    if (nextStatus === 'confirmed' || nextStatus === 'rejected') {
      if (!perms.has('confirmAppointments')) {
        res.status(403).json({ error: 'MISSING_CONFIRM_APPOINTMENTS_PERMISSION' });
        return;
      }
    } else if (nextStatus === 'checked_in' || nextStatus === 'no_show' || req.body?.isWaitlist !== undefined) {
      if (!perms.has('manageWaitlist') && !perms.has('manageBookings')) {
        res.status(403).json({ error: 'MISSING_WAITLIST_PERMISSION' });
        return;
      }
    } else if (nextStatus === 'cancelled') {
      if (!perms.has('manageBookings')) {
        res.status(403).json({ error: 'MISSING_MANAGE_BOOKINGS_PERMISSION' });
        return;
      }
    } else {
      res.status(403).json({ error: 'ACTION_NOT_ALLOWED_FOR_SECRETARY' });
      return;
    }

    try {
      const apptRef = db.doc(`appointments/${normalizeStr(req.params.appointmentId, 128)}`);
      const apptSnap = await apptRef.get();
      if (!apptSnap.exists || apptSnap.data()?.doctorUid !== employment.employerUid) {
        res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND' });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (nextStatus) patch.status = nextStatus;
      if (typeof req.body?.isWaitlist === 'boolean') patch.isWaitlist = req.body.isWaitlist;

      await apptRef.update(patch);

      const apptData = apptSnap.data() as Record<string, unknown>;
      if (typeof apptData.patientUid === 'string' && apptData.patientUid && (nextStatus === 'confirmed' || nextStatus === 'rejected' || nextStatus === 'cancelled')) {
        await emitPatientNotification(db, {
          patientUid: apptData.patientUid,
          type: 'appointment',
          eventType: nextStatus === 'confirmed' ? 'appointment_confirmed' : 'appointment_cancelled',
          title:
            nextStatus === 'confirmed'
              ? `تم تأكيد موعدك في ${employment.employerName}`
              : `تحديث على موعدك في ${employment.employerName}`,
          body: `تاريخ الموعد: ${String(apptData.date || '')} الساعة ${String(apptData.time || '')}`,
          relatedId: apptSnap.id,
          relatedType: 'appointment',
          idempotencyKey: `pat_sec_apt:${apptSnap.id}:${nextStatus}`,
        }).catch(() => undefined);
      }

      if (nextStatus === 'cancelled' || nextStatus === 'rejected') {
        const docCanEngine = getGlobalNotificationEngine();
        if (docCanEngine) {
          await docCanEngine
            .dispatch({
              eventType: 'appointment_cancelled',
              recipientUid: employment.employerUid,
              recipientRole: 'doctor',
              title: `إلغاء موعد عبر السكرتارية (${String(apptData.patientName || '')})`,
              body: `تاريخ ${String(apptData.date || '')} الساعة ${String(apptData.time || '')} — بواسطة ${actor.name}`,
              inAppType: 'appointment',
              relatedId: apptSnap.id,
              relatedType: 'appointment',
              idempotencyKey: `doc_sec_apt_can:${apptSnap.id}:${nextStatus}`,
              placeholders: {
                refCode: apptSnap.id.slice(0, 16).toUpperCase(),
                statusLabel: 'ملغى',
                dateLabel: String(apptData.date || ''),
              },
            })
            .catch(() => undefined);
        }
      }

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: 'doctor',
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'DOCTOR_APPOINTMENT_UPDATED',
        details: `Updated appointment ${apptSnap.id} -> ${nextStatus || 'waitlist'}`,
      });

      const updated = await apptRef.get();
      res.json({ ok: true, appointment: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryUpdateDocAppt] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_UPDATE_FAILED' });
    }
  });

  router.patch('/secretary/employments/:employmentId/lab/bookings/:bookingId', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (employment.employerType !== 'lab') {
      res.status(403).json({ error: 'EMPLOYER_TYPE_MISMATCH' });
      return;
    }

    const perms = new Set<string>(employment.permissions);
    const registerArrival = req.body?.registerArrival === true;
    const nextStatus = normalizeStr(req.body?.status, 32);

    if (registerArrival && !perms.has('registerPatientArrival')) {
      res.status(403).json({ error: 'MISSING_PATIENT_ARRIVAL_PERMISSION' });
      return;
    }
    if (nextStatus && !perms.has('manageBookings')) {
      res.status(403).json({ error: 'MISSING_MANAGE_BOOKINGS_PERMISSION' });
      return;
    }
    if (nextStatus && !['confirmed', 'cancelled', 'rejected', 'in_progress'].includes(nextStatus)) {
      res.status(400).json({ error: 'INVALID_BOOKING_STATUS' });
      return;
    }

    try {
      const bookingRef = db.doc(`lab_bookings/${normalizeStr(req.params.bookingId, 128)}`);
      const bookingSnap = await bookingRef.get();
      if (!bookingSnap.exists || bookingSnap.data()?.facilityUid !== employment.employerUid) {
        res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (nextStatus) patch.status = nextStatus;
      if (registerArrival) {
        patch.arrivalRegistered = true;
        patch.arrivalRegisteredAt = new Date().toISOString();
        patch.arrivalRegisteredByUid = actor.uid;
        if (bookingSnap.data()?.status === 'pending' || bookingSnap.data()?.status === 'confirmed') {
          patch.status = 'in_progress';
        }
      }

      await bookingRef.update(patch);

      const bookingData = bookingSnap.data() as Record<string, unknown>;
      const resolvedStatus = String(patch.status || bookingData.status || '');
      if (typeof bookingData.patientUid === 'string' && bookingData.patientUid) {
        const patLabEvent =
          resolvedStatus === 'confirmed'
            ? 'lab_booking_confirmed'
            : resolvedStatus === 'cancelled' || resolvedStatus === 'rejected'
              ? 'lab_booking_rejected'
              : 'lab_order_status_updated';
        await emitPatientNotification(db, {
          patientUid: bookingData.patientUid,
          type: 'appointment',
          eventType: patLabEvent,
          title: `تحديث حجز المختبر: ${employment.employerName}`,
          body: registerArrival
            ? `تم تسجيل وصولك في المختبر للموعد (${String(bookingData.date || '')} ${String(bookingData.time || '')})`
            : `تم تحديث حالة الحجز إلى: ${resolvedStatus}`,
          relatedId: bookingSnap.id,
          relatedType: 'lab_booking',
          idempotencyKey: `pat_sec_lbk:${bookingSnap.id}:${resolvedStatus}:${registerArrival ? 'arr' : 'st'}`,
        }).catch(() => undefined);
      }

      const labSecEngine = getGlobalNotificationEngine();
      if (labSecEngine) {
        const labEv =
          resolvedStatus === 'confirmed'
            ? 'lab_booking_confirmed'
            : resolvedStatus === 'cancelled' || resolvedStatus === 'rejected'
              ? 'lab_booking_rejected'
              : 'lab_order_status_updated';
        await labSecEngine
          .dispatch({
            eventType: labEv,
            recipientUid: employment.employerUid,
            recipientRole: 'lab',
            title: registerArrival
              ? `تسجيل حضور مريض للمختبر (${String(bookingData.patientName || '')})`
              : `تحديث حجز مختبر عبر السكرتارية (${String(bookingData.patientName || '')})`,
            body: `الحالة: ${resolvedStatus} — بواسطة ${actor.name}`,
            inAppType: 'booking',
            relatedId: bookingSnap.id,
            relatedType: 'lab_booking',
            idempotencyKey: `lab_sec_bk:${bookingSnap.id}:${resolvedStatus}:${registerArrival ? 'arr' : 'st'}`,
          })
          .catch(() => undefined);
      }

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: 'lab',
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: registerArrival ? 'LAB_PATIENT_ARRIVAL_REGISTERED' : 'LAB_BOOKING_UPDATED',
        details: registerArrival
          ? `Registered arrival for lab booking ${bookingSnap.id}`
          : `Updated lab booking ${bookingSnap.id} -> ${nextStatus}`,
      });

      const updated = await bookingRef.get();
      res.json({ ok: true, booking: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryLabBooking] error:', err);
      res.status(500).json({ error: 'LAB_BOOKING_UPDATE_FAILED' });
    }
  });

  router.patch('/secretary/employments/:employmentId/lab/orders/:orderId/tracking', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (employment.employerType !== 'lab') {
      res.status(403).json({ error: 'EMPLOYER_TYPE_MISMATCH' });
      return;
    }
    if (!employment.permissions.includes('trackOrders')) {
      res.status(403).json({ error: 'MISSING_TRACK_ORDERS_PERMISSION' });
      return;
    }

    const nextStatus = normalizeStr(req.body?.status, 32);
    // Secretary can ONLY update administrative intake stages, NEVER result_entered or approved!
    if (!['ordered', 'sample_collected', 'in_lab'].includes(nextStatus)) {
      res.status(403).json({ error: 'CLINICAL_STAGE_RESTRICTED_TO_LAB_TECHNICAL_STAFF' });
      return;
    }

    try {
      const orderRef = db.doc(`lab_orders/${normalizeStr(req.params.orderId, 128)}`);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists || orderSnap.data()?.labUid !== employment.employerUid) {
        res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        return;
      }
      const currStatus = String(orderSnap.data()?.status || '');
      if (currStatus === 'approved' || currStatus === 'result_entered' || currStatus === 'cancelled') {
        res.status(409).json({ error: 'ORDER_PAST_INTAKE_STAGE' });
        return;
      }

      await orderRef.update({
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: 'lab',
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'LAB_ORDER_TRACKED',
        details: `Updated lab order ${orderSnap.id} tracking stage -> ${nextStatus}`,
      });

      res.json({ ok: true, status: nextStatus });
    } catch (err) {
      console.error('[MEDORA][SecretaryLabOrderTrack] error:', err);
      res.status(500).json({ error: 'ORDER_TRACKING_FAILED' });
    }
  });

  router.get('/secretary/employments/:employmentId/conversations/:conversationId/messages', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (!employment.permissions.includes('adminMessaging')) {
      res.status(403).json({ error: 'MISSING_MESSAGING_PERMISSION' });
      return;
    }

    const conversationId = normalizeStr(req.params.conversationId, 128);
    const isLab = employment.employerType === 'lab';
    const convCol = isLab ? 'lab_conversations' : 'doctor_conversations';
    const msgCol = isLab ? 'lab_messages' : 'doctor_messages';
    const ownerField = isLab ? 'labUid' : 'doctorUid';

    try {
      const convSnap = await db.doc(`${convCol}/${conversationId}`).get();
      if (!convSnap.exists || convSnap.data()?.[ownerField] !== employment.employerUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      const msgsSnap = await db
        .collection(msgCol)
        .where('conversationId', '==', conversationId)
        .limit(120)
        .get();
      const messages = msgsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      res.json({ ok: true, messages });
    } catch (err) {
      console.error('[MEDORA][SecretaryConvMsgs] error:', err);
      res.status(500).json({ error: 'MESSAGES_LOAD_FAILED' });
    }
  });

  router.post('/secretary/employments/:employmentId/conversations/:conversationId/messages', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (!employment.permissions.includes('adminMessaging')) {
      res.status(403).json({ error: 'MISSING_MESSAGING_PERMISSION' });
      return;
    }

    const text = normalizeStr(req.body?.text, 1500);
    if (!text) {
      res.status(400).json({ error: 'MESSAGE_TEXT_REQUIRED' });
      return;
    }

    const conversationId = normalizeStr(req.params.conversationId, 128);
    const isLab = employment.employerType === 'lab';
    const convCol = isLab ? 'lab_conversations' : 'doctor_conversations';
    const msgCol = isLab ? 'lab_messages' : 'doctor_messages';
    const ownerField = isLab ? 'labUid' : 'doctorUid';

    try {
      const convRef = db.doc(`${convCol}/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.[ownerField] !== employment.employerUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }

      const messageId = safeId('smsg');
      const senderName = `${normalizeStr(employment.secretaryName || actor.name, 80)} (${employment.employerName})`;

      await db.doc(`${msgCol}/${messageId}`).set({
        messageId,
        conversationId,
        [ownerField]: employment.employerUid,
        senderRole: isLab ? 'lab' : 'doctor',
        senderUid: actor.uid,
        senderName,
        text,
        attachments: [],
        createdAt: FieldValue.serverTimestamp(),
      });

      await convRef.update({
        lastMessagePreview: text.slice(0, 140),
        lastMessageAt: FieldValue.serverTimestamp(),
        unreadByPatient: FieldValue.increment(1),
        ...(isLab ? { unreadByLab: 0 } : { unreadByDoctor: 0 }),
      });

      const patientUid = String(convSnap.data()?.patientUid || '');
      if (patientUid) {
        await emitPatientNotification(db, {
          patientUid,
          type: 'message',
          title: `رسالة إدارية من ${employment.employerName}`,
          body: text.slice(0, 120),
          relatedId: conversationId,
          relatedType: isLab ? 'lab_conversation' : 'conversation',
        }).catch(() => undefined);
      }

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: employment.employerType,
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'ADMIN_MESSAGE_SENT',
        details: `Sent administrative reply in conversation ${conversationId}`,
      });

      const savedMsg = await db.doc(`${msgCol}/${messageId}`).get();
      res.status(201).json({ ok: true, message: serializeDoc(savedMsg.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretarySendMsg] error:', err);
      res.status(500).json({ error: 'MESSAGE_SEND_FAILED' });
    }
  });

  // Pharmacy scoped operations (when linked to a pharmacy entity)
  router.post('/secretary/employments/:employmentId/pharmacy/items', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;

    const empRes = await resolveActiveSecretaryEmployment(
      db,
      actor.uid,
      normalizeStr(req.params.employmentId, 128),
    );
    if (!empRes.ok) {
      res.status(empRes.statusCode).json({ error: empRes.error });
      return;
    }
    const { employment } = empRes;
    if (employment.employerType !== 'pharmacy') {
      res.status(403).json({ error: 'EMPLOYER_TYPE_MISMATCH' });
      return;
    }

    const kind = normalizeStr(req.body?.kind, 32);
    const kindPermMap: Record<string, AnySecretaryPermission> = {
      order: 'trackOrders',
      pickup_booking: 'managePickupBookings',
      inventory: 'manageInventory',
      supplier_order: 'trackSupplierOrders',
    };
    const requiredPerm = kindPermMap[kind];
    if (!requiredPerm || !employment.permissions.includes(requiredPerm)) {
      res.status(403).json({ error: 'MISSING_PHARMACY_PERMISSION' });
      return;
    }

    const title = normalizeStr(req.body?.title, 160);
    const counterpartyName = normalizeStr(req.body?.counterpartyName, 120);
    const status = normalizeStr(req.body?.status, 40) || 'pending';
    const referenceCode = normalizeStr(req.body?.referenceCode, 40) || `PH-${Date.now().toString().slice(-6)}`;
    if (!title) {
      res.status(400).json({ error: 'TITLE_REQUIRED' });
      return;
    }

    try {
      const itemId = safeId('phop');
      await db.doc(`pharmacy_operations/${itemId}`).set({
        itemId,
        pharmacyUid: employment.employerUid,
        kind,
        referenceCode,
        title,
        counterpartyName,
        status,
        quantity: typeof req.body?.quantity === 'number' ? Math.max(0, req.body.quantity) : undefined,
        scheduledDate: normalizeStr(req.body?.scheduledDate, 32),
        notes: normalizeStr(req.body?.notes, 400),
        updatedByUid: actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendSecretaryActivity(db, {
        employerUid: employment.employerUid,
        employerType: 'pharmacy',
        employerName: employment.employerName,
        employmentId: employment.employmentId,
        secretaryUid: actor.uid,
        secretaryName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorUid: actor.uid,
        actorName: normalizeStr(employment.secretaryName || actor.name, 120),
        actorRole: 'secretary',
        action: 'PHARMACY_OPERATION_CREATED',
        details: `Created pharmacy ${kind} item "${title}"`,
      });

      const saved = await db.doc(`pharmacy_operations/${itemId}`).get();
      res.status(201).json({ ok: true, item: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][SecretaryPharmacyItem] error:', err);
      res.status(500).json({ error: 'PHARMACY_ITEM_CREATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Employer Hiring & Secretary Management Routes (Doctor, Lab, Pharmacy)
  // ---------------------------------------------------------------------------
  function parseEmployerTypeParam(req: Request, res: Response): EmployerType | null {
    const raw = normalizeStr(req.params.employerType, 24) as EmployerType;
    if (!VALID_EMPLOYER_TYPES.has(raw)) {
      res.status(400).json({ error: 'INVALID_EMPLOYER_TYPE' });
      return null;
    }
    return raw;
  }

  router.get('/employer/:employerType/secretaries/search', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }

    const q = normalizeStr(req.query.q, 254);
    if (q.length < 2) {
      res.json({ ok: true, candidates: [] });
      return;
    }

    const qLower = q.toLowerCase();
    const qUpper = q.toUpperCase();

    try {
      const [secProfilesSnap, secUsersSnap, existingInvSnap, existingEmpSnap] = await Promise.all([
        db.collection('secretary_profiles').limit(300).get(),
        db.collection('users').where('selectedPortal', '==', 'secretary').limit(200).get(),
        db
          .collection('secretary_invitations')
          .where('employerUid', '==', empCtxRes.ctx.employerUid)
          .limit(100)
          .get(),
        db
          .collection('secretary_employments')
          .where('employerUid', '==', empCtxRes.ctx.employerUid)
          .limit(100)
          .get(),
      ]);

      const userByUid = new Map<string, Record<string, unknown>>();
      secUsersSnap.docs.forEach((d) => userByUid.set(d.id, serializeDoc(d.data())));

      const candidateMap = new Map<string, Record<string, unknown>>();

      for (const sDoc of secProfilesSnap.docs) {
        const sd = serializeDoc(sDoc.data());
        let userData = userByUid.get(sDoc.id);
        if (!userData) {
          const uSnap = await db.doc(`users/${sDoc.id}`).get();
          if (uSnap.exists) userData = serializeDoc(uSnap.data());
        }
        const email = normalizeStr(sd.email || userData?.email, 254);
        const code = normalizeStr(sd.secretaryCode, 32) || computeSecretaryCode(sDoc.id);
        const fullName = normalizeStr(sd.fullName || userData?.fullName || userData?.googleName, 120);

        const matches =
          sDoc.id.toLowerCase() === qLower ||
          code.toUpperCase() === qUpper ||
          code.toUpperCase().includes(qUpper) ||
          email.toLowerCase() === qLower ||
          email.toLowerCase().includes(qLower) ||
          fullName.toLowerCase().includes(qLower);

        if (matches && sDoc.id !== actor.uid) {
          candidateMap.set(sDoc.id, {
            uid: sDoc.id,
            secretaryCode: code,
            fullName: fullName || 'سكرتير MEDORA',
            email,
            phone: normalizeStr(sd.phone || userData?.phone, 32),
            governorate: normalizeStr(sd.governorate || userData?.governorate, 80),
            district: normalizeStr(sd.district || userData?.district, 80),
            educationQualification: normalizeStr(sd.educationQualification, 160),
            previousExperience: normalizeStr(sd.previousExperience, 400),
            bio: normalizeStr(sd.bio, 500),
          });
        }
      }

      for (const [uid, ud] of userByUid.entries()) {
        if (candidateMap.has(uid) || uid === actor.uid) continue;
        const email = normalizeStr(ud.email, 254);
        const code = computeSecretaryCode(uid);
        const fullName = normalizeStr(ud.fullName || ud.googleName, 120);
        if (
          uid.toLowerCase() === qLower ||
          code.toUpperCase() === qUpper ||
          email.toLowerCase().includes(qLower) ||
          fullName.toLowerCase().includes(qLower)
        ) {
          candidateMap.set(uid, {
            uid,
            secretaryCode: code,
            fullName: fullName || 'سكرتير MEDORA',
            email,
            phone: normalizeStr(ud.phone, 32),
            governorate: normalizeStr(ud.governorate, 80),
            district: normalizeStr(ud.district, 80),
            educationQualification: '',
            previousExperience: '',
            bio: '',
          });
        }
      }

      const nowIso = new Date().toISOString();
      const candidates = Array.from(candidateMap.values())
        .slice(0, 15)
        .map((c) => {
          const uid = String(c.uid);
          const emp = existingEmpSnap.docs
            .map((d) => d.data())
            .find(
              (d) =>
                d.secretaryUid === uid &&
                d.employerType === employerType &&
                (d.status === 'Active' || d.status === 'Suspended'),
            );
          const pendingInv = existingInvSnap.docs
            .map((d) => d.data())
            .find(
              (d) =>
                d.secretaryUid === uid &&
                d.employerType === employerType &&
                d.status === 'Pending' &&
                (!d.expiresAt || String(d.expiresAt) >= nowIso),
            );
          const relationStatus = emp
            ? String(emp.status)
            : pendingInv
              ? 'Pending'
              : 'none';
          return { ...c, relationStatus };
        });

      res.json({ ok: true, candidates });
    } catch (err) {
      console.error('[MEDORA][EmployerSecretarySearch] error:', err);
      res.status(500).json({ error: 'SECRETARY_SEARCH_FAILED' });
    }
  });

  router.get('/employer/:employerType/secretaries/workspace', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }
    const { ctx } = empCtxRes;

    try {
      const [invSnap, empSnap, tasksSnap, logsSnap] = await Promise.all([
        db
          .collection('secretary_invitations')
          .where('employerUid', '==', ctx.employerUid)
          .limit(150)
          .get(),
        db
          .collection('secretary_employments')
          .where('employerUid', '==', ctx.employerUid)
          .limit(100)
          .get(),
        db
          .collection('secretary_tasks')
          .where('employerUid', '==', ctx.employerUid)
          .limit(200)
          .get(),
        db
          .collection('secretary_activity_logs')
          .where('employerUid', '==', ctx.employerUid)
          .limit(150)
          .get(),
      ]);

      const invDocsForType = invSnap.docs.filter((d) => d.data().employerType === employerType);
      const invitations = (await expirePendingInvitationsIfNeeded(db, invDocsForType)).sort(
        (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
      );
      const employments = empSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((e) => e.employerType === employerType)
        .sort((a, b) => String(b.acceptedAt || '').localeCompare(String(a.acceptedAt || '')));
      const tasks = tasksSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((t) => t.employerType === employerType)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const activityLogs = logsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((l) => l.employerType === employerType)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      res.json({
        ok: true,
        employerType,
        employerUid: ctx.employerUid,
        employerInstitutionId: ctx.institutionId,
        employerName: ctx.employerName,
        invitations,
        employments,
        tasks,
        activityLogs,
      });
    } catch (err) {
      console.error('[MEDORA][EmployerSecretaryWorkspace] error:', err);
      res.status(500).json({ error: 'EMPLOYER_SECRETARY_WORKSPACE_FAILED' });
    }
  });

  router.post('/employer/:employerType/secretaries/invitations', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }

    try {
      const result = await createEmployerInvitationService(
        db,
        empCtxRes.ctx,
        actor.uid,
        (req.body || {}) as Record<string, unknown>,
      );
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.status(201).json({ ok: true, invitation: result.invitation });
    } catch (err) {
      console.error('[MEDORA][EmployerCreateInvite] error:', err);
      res.status(500).json({ error: 'INVITATION_CREATE_FAILED' });
    }
  });

  router.post('/employer/:employerType/secretaries/invitations/:invitationId/revoke', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }

    try {
      const result = await revokeEmployerInvitationService(
        db,
        empCtxRes.ctx,
        actor.uid,
        normalizeStr(req.params.invitationId, 128),
      );
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.json({ ok: true, invitation: result.invitation });
    } catch (err) {
      console.error('[MEDORA][EmployerRevokeInvite] error:', err);
      res.status(500).json({ error: 'INVITATION_REVOKE_FAILED' });
    }
  });

  router.patch('/employer/:employerType/secretaries/employments/:employmentId', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }

    try {
      const result = await updateEmployerEmploymentService(
        db,
        empCtxRes.ctx,
        actor.uid,
        normalizeStr(req.params.employmentId, 128),
        (req.body || {}) as Record<string, unknown>,
      );
      if (!result.ok) {
        res.status(result.statusCode).json({ error: result.error });
        return;
      }
      res.json({ ok: true, employment: result.employment });
    } catch (err) {
      console.error('[MEDORA][EmployerUpdateEmployment] error:', err);
      res.status(500).json({ error: 'EMPLOYMENT_UPDATE_FAILED' });
    }
  });

  router.post('/employer/:employerType/secretaries/tasks', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }
    const { ctx } = empCtxRes;

    const employmentId = normalizeStr(req.body?.employmentId, 128);
    const title = normalizeStr(req.body?.title, 180);
    const description = normalizeStr(req.body?.description, 1000);
    const priorityRaw = normalizeStr(req.body?.priority, 16);
    const priority = VALID_PRIORITIES.has(priorityRaw) ? priorityRaw : 'medium';
    const dueDate = normalizeStr(req.body?.dueDate, 32);

    if (!employmentId || title.length < 2) {
      res.status(400).json({ error: 'INVALID_TASK_FIELDS' });
      return;
    }

    try {
      const empSnap = await db.doc(`secretary_employments/${employmentId}`).get();
      if (!empSnap.exists) {
        res.status(404).json({ error: 'EMPLOYMENT_NOT_FOUND' });
        return;
      }
      const emp = serializeDoc(empSnap.data());
      if (emp.employerUid !== ctx.employerUid || emp.employerType !== employerType) {
        res.status(403).json({ error: 'FORBIDDEN_EMPLOYMENT' });
        return;
      }
      if (emp.status !== 'Active') {
        res.status(409).json({ error: 'EMPLOYMENT_NOT_ACTIVE' });
        return;
      }

      const taskId = safeId('stask');
      await db.doc(`secretary_tasks/${taskId}`).set({
        taskId,
        employmentId,
        employerType,
        employerUid: ctx.employerUid,
        employerName: ctx.employerName,
        secretaryUid: String(emp.secretaryUid),
        secretaryName: normalizeStr(emp.secretaryName, 120),
        title,
        description,
        priority,
        ...(dueDate ? { dueDate } : {}),
        status: 'todo',
        createdByUid: actor.uid,
        createdByName: ctx.actorName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await Promise.all([
        emitSecretaryNotification(db, {
          secretaryUid: String(emp.secretaryUid),
          type: 'task_assigned',
          title: `مهمة جديدة من ${ctx.employerName}`,
          body: title,
          relatedId: taskId,
          employerType,
          employerName: ctx.employerName,
        }),
        appendSecretaryActivity(db, {
          employerUid: ctx.employerUid,
          employerType,
          employerName: ctx.employerName,
          employmentId,
          secretaryUid: String(emp.secretaryUid),
          secretaryName: normalizeStr(emp.secretaryName, 120),
          actorUid: actor.uid,
          actorName: ctx.actorName,
          actorRole: 'employer',
          action: 'TASK_ASSIGNED',
          details: `Assigned task "${title}" (${priority})`,
        }),
      ]);

      const saved = await db.doc(`secretary_tasks/${taskId}`).get();
      res.status(201).json({ ok: true, task: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][EmployerCreateTask] error:', err);
      res.status(500).json({ error: 'TASK_CREATE_FAILED' });
    }
  });

  router.patch('/employer/:employerType/secretaries/tasks/:taskId', async (req, res) => {
    const db = requireDb(res);
    if (!db) return;
    const actor = await verifyActor(req, res);
    if (!actor) return;
    const employerType = parseEmployerTypeParam(req, res);
    if (!employerType) return;

    const empCtxRes = await resolveEmployerContext(db, actor.uid, actor.email, employerType);
    if (!empCtxRes.ok) {
      res.status(empCtxRes.statusCode).json({ error: empCtxRes.error });
      return;
    }

    const taskRef = db.doc(`secretary_tasks/${normalizeStr(req.params.taskId, 128)}`);
    try {
      const taskSnap = await taskRef.get();
      if (!taskSnap.exists || taskSnap.data()?.employerUid !== empCtxRes.ctx.employerUid) {
        res.status(404).json({ error: 'TASK_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof req.body?.title === 'string' && req.body.title.trim()) {
        patch.title = normalizeStr(req.body.title, 180);
      }
      if (typeof req.body?.description === 'string') {
        patch.description = normalizeStr(req.body.description, 1000);
      }
      if (typeof req.body?.priority === 'string' && VALID_PRIORITIES.has(req.body.priority)) {
        patch.priority = req.body.priority;
      }
      if (typeof req.body?.status === 'string' && ACTIVE_TASK_STATUSES.has(req.body.status)) {
        patch.status = req.body.status;
        if (req.body.status === 'done') patch.completedAt = new Date().toISOString();
      }
      if (typeof req.body?.dueDate === 'string') {
        patch.dueDate = normalizeStr(req.body.dueDate, 32);
      }

      await taskRef.update(patch);
      const secUid = String(taskSnap.data()?.secretaryUid || '');
      if (secUid) {
        await emitSecretaryNotification(db, {
          secretaryUid: secUid,
          type: 'task_assigned',
          title: `تحديث على المهمة: ${String(patch.title || taskSnap.data()?.title || '')}`,
          body: `تم تحديث تفاصيل المهمة من قبل ${empCtxRes.ctx.employerName}`,
          relatedId: taskRef.id,
          employerType,
          employerName: empCtxRes.ctx.employerName,
          idempotencyKey: `sec_task_upd:${taskRef.id}:${String(patch.status || patch.priority || Date.now().toString(36))}`,
        }).catch(() => undefined);
      }
      const updated = await taskRef.get();
      res.json({ ok: true, task: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][EmployerUpdateTask] error:', err);
      res.status(500).json({ error: 'TASK_UPDATE_FAILED' });
    }
  });

  return router;
}
