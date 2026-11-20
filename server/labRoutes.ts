import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { emitPatientNotification, getBaghdadNow, recalculateLabRatingSummary } from './patientNotifications.ts';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import type { NotificationEventType } from '../src/types/notifications.ts';
import {
  decodeAndValidateBase64Asset,
  isValidUploadedAssetUrl,
  storeUploadedMediaAsset,
  type MedoraUploadFolder,
  type ResolvedBucketInfo,
  type StorageBucket,
} from './storageHelper.ts';
import { ensureCentralTestsSeeded, MEDORA_CENTRAL_LAB_TESTS } from './medoraCentralTests.ts';
import { ALL_LAB_PERMISSIONS, type LabActorRole, type LabPermissionKey } from '../src/types/lab.ts';

export interface LabRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  getStorageBucket?: () => StorageBucket | null;
  resolveReadyStorageBucket?: (forceRefresh?: boolean) => Promise<ResolvedBucketInfo>;
  hasServiceCredentials?: () => boolean;
}

export interface VerifiedLabActor {
  uid: string;
  email: string;
  name: string;
  actorRole: LabActorRole;
  labUid: string;
  institutionId: string;
  labNameAr: string;
  permissions: LabPermissionKey[];
  labProfile: Record<string, unknown>;
}

const VALID_PERMISSIONS_SET = new Set<string>(ALL_LAB_PERMISSIONS);
const VALID_SAMPLE_TYPES = new Set([
  'blood',
  'serum',
  'plasma',
  'urine',
  'stool',
  'swab',
  'saliva',
  'csf',
  'other',
]);

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function makeHumanCode(prefix: string): string {
  const d = getBaghdadNow().dateStr.replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${d}-${rand}`;
}

function serializeValue(val: unknown): unknown {
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

function serializeDoc(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

function sanitizePermissions(raw: unknown): LabPermissionKey[] {
  if (!Array.isArray(raw)) return [];
  const out: LabPermissionKey[] = [];
  for (const p of raw) {
    if (typeof p === 'string' && VALID_PERMISSIONS_SET.has(p) && !out.includes(p as LabPermissionKey)) {
      out.push(p as LabPermissionKey);
    }
  }
  return out;
}

function numOrZero(val: unknown, max = 100_000_000): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(max, Math.round(n * 100) / 100);
}

function sanitizeAttachments(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 8)
    .map((item) => {
      const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      const url = normalizeStr(rec.url, 1400);
      const storagePath = normalizeStr(rec.storagePath, 300);
      if (!url || !isValidUploadedAssetUrl(url, storagePath)) return null;
      return {
        name: normalizeStr(rec.name, 140) || 'lab-file',
        size: numOrZero(rec.size, 25_000_000),
        mimeType: normalizeStr(rec.mimeType, 100) || 'application/octet-stream',
        url,
        ...(storagePath ? { storagePath } : {}),
        uploadedAtIso: normalizeStr(rec.uploadedAtIso, 60) || new Date().toISOString(),
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

async function resolveLabActorFromDb(
  db: Firestore,
  uid: string,
  email: string,
  displayName: string,
): Promise<{ ok: true; actor: VerifiedLabActor } | { ok: false; statusCode: number; error: string }> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
  if (userData.accountStatus === 'suspended') {
    return { ok: false, statusCode: 403, error: 'ACCOUNT_SUSPENDED' };
  }

  // 1. Check direct Lab Owner / Manager profile
  const ownerLabSnap = await db.doc(`lab_profiles/${uid}`).get();
  if (ownerLabSnap.exists) {
    const labData = serializeDoc(ownerLabSnap.data());
    if (labData.status === 'Approved') {
      const instId = normalizeStr(labData.institutionId, 128) || `inst_lab_${uid}`;
      const instSnap = await db.doc(`institutions/${instId}`).get();
      const instStatus = instSnap.exists ? String(instSnap.data()?.status || '') : 'active';
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, statusCode: 403, error: 'LAB_INSTITUTION_SUSPENDED' };
      }
      return {
        ok: true,
        actor: {
          uid,
          email,
          name: normalizeStr(labData.managerFullName || userData.fullName || displayName || email, 120) || 'مدير المختبر',
          actorRole: 'lab_manager',
          labUid: uid,
          institutionId: instId,
          labNameAr: normalizeStr(labData.labNameAr || labData.labNameEn, 160) || 'مختبر MEDORA',
          permissions: [...ALL_LAB_PERMISSIONS],
          labProfile: { ...labData, institutionStatus: instStatus || 'active' },
        },
      };
    }
  }

  // 2. Check active Lab Staff membership by uid or email
  let staffSnap = await db
    .collection('lab_staff')
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .limit(5)
    .get();

  if (staffSnap.empty && email) {
    staffSnap = await db
      .collection('lab_staff')
      .where('email', '==', email)
      .where('status', '==', 'active')
      .limit(5)
      .get();
  }

  for (const sDoc of staffSnap.docs) {
    const sData = serializeDoc(sDoc.data());
    const parentLabUid = normalizeStr(sData.labUid, 128);
    if (!parentLabUid) continue;
    const parentSnap = await db.doc(`lab_profiles/${parentLabUid}`).get();
    if (!parentSnap.exists || parentSnap.data()?.status !== 'Approved') continue;
    const parentData = serializeDoc(parentSnap.data());
    const instId = normalizeStr(parentData.institutionId || sData.institutionId, 128) || `inst_lab_${parentLabUid}`;
    const instSnap = await db.doc(`institutions/${instId}`).get();
    const instStatus = instSnap.exists ? String(instSnap.data()?.status || '') : 'active';
    if (instStatus === 'suspended' || instStatus === 'rejected') {
      return { ok: false, statusCode: 403, error: 'LAB_INSTITUTION_SUSPENDED' };
    }

    // Bind staff uid cleanly on first login by email
    if (!sData.uid) {
      await sDoc.ref.update({
        uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      ok: true,
      actor: {
        uid,
        email,
        name: normalizeStr(sData.fullName || displayName || email, 120) || 'موظف المختبر',
        actorRole: 'lab_staff',
        labUid: parentLabUid,
        institutionId: instId,
        labNameAr: normalizeStr(parentData.labNameAr || parentData.labNameEn, 160) || 'مختبر MEDORA',
        permissions: sanitizePermissions(sData.permissions),
        labProfile: { ...parentData, institutionStatus: instStatus || 'active' },
      },
    };
  }

  return { ok: false, statusCode: 403, error: 'LAB_ACCESS_NOT_ACTIVE' };
}

async function writeLabAudit(
  db: Firestore,
  actor: VerifiedLabActor,
  params: {
    action: string;
    targetType: string;
    targetId: string;
    details: string;
  },
): Promise<void> {
  try {
    const logId = safeId('lblog');
    await db.doc(`lab_audit_logs/${logId}`).set({
      logId,
      labUid: actor.labUid,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details.slice(0, 500),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[MEDORA][LabAudit] warning:', err);
  }
}

async function emitLabNotification(
  db: Firestore,
  params: {
    labUid: string;
    type:
      | 'booking'
      | 'home_collection'
      | 'low_stock'
      | 'expiry_alert'
      | 'result_approval'
      | 'message'
      | 'admin_notice';
    eventType?: NotificationEventType;
    title: string;
    body: string;
    relatedId?: string;
    deterministicId?: string;
    idempotencyKey?: string;
  },
): Promise<void> {
  if (!params.labUid) return;
  try {
    const notificationId = params.deterministicId
      ? params.deterministicId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
      : safeId('lbntf');

    const engine = getGlobalNotificationEngine();
    if (engine) {
      const eventType: NotificationEventType =
        params.eventType ||
        (params.type === 'booking'
          ? 'lab_booking_created'
          : params.type === 'home_collection'
            ? 'lab_order_created'
            : params.type === 'message'
              ? 'patient_message_received'
              : params.type === 'admin_notice'
                ? 'admin_notice'
                : 'lab_order_status_updated');

      await engine.dispatch({
        eventType,
        recipientUid: params.labUid,
        recipientRole: 'lab',
        title: params.title.slice(0, 180),
        body: params.body.slice(0, 500),
        inAppType: params.type,
        relatedId: params.relatedId,
        relatedType: params.type,
        deterministicInAppId: params.deterministicId,
        idempotencyKey:
          params.idempotencyKey ||
          (params.deterministicId ? `lab:${params.deterministicId}` : undefined),
        placeholders: {
          refCode: (params.relatedId || notificationId).slice(0, 16).toUpperCase(),
          statusLabel: params.type,
        },
      });
      return;
    }

    const ref = db.doc(`lab_notifications/${notificationId}`);
    if (params.deterministicId) {
      const ex = await ref.get();
      if (ex.exists) return;
    }
    await ref.set({
      notificationId,
      labUid: params.labUid,
      type: params.type,
      title: params.title.slice(0, 180),
      body: params.body.slice(0, 500),
      ...(params.relatedId ? { relatedId: params.relatedId } : {}),
      isRead: false,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[MEDORA][LabNotification] warning:', err);
  }
}

async function syncLabServiceCatalog(db: Firestore, labUid: string): Promise<void> {
  const snap = await db.collection('lab_tests').where('labUid', '==', labUid).limit(200).get();
  const activeTests = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((t) => t.isActive !== false);

  const serviceCatalog = activeTests.map((t) => ({
    testId: String(t.testId || ''),
    name: normalizeStr(t.nameAr || t.nameEn, 140),
    priceIqd: numOrZero(t.priceIqd),
    prepInstructions: normalizeStr(t.prepInstructions, 300),
  }));
  const labServices = serviceCatalog.map((s) => s.name).filter(Boolean);

  if (labServices.length > 0) {
    await db.doc(`lab_profiles/${labUid}`).update({
      labServices,
      serviceCatalog,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    await db.doc(`lab_profiles/${labUid}`).update({
      serviceCatalog: [],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

export async function isActiveLabMediaActor(
  db: Firestore,
  uid: string,
  email: string,
  targetLabUid: string,
): Promise<boolean> {
  if (!targetLabUid) return false;
  if (uid === targetLabUid) {
    const snap = await db.doc(`lab_profiles/${targetLabUid}`).get();
    return snap.exists && snap.data()?.status === 'Approved';
  }
  const staffByUid = await db
    .collection('lab_staff')
    .where('labUid', '==', targetLabUid)
    .where('uid', '==', uid)
    .where('status', '==', 'active')
    .limit(2)
    .get();
  if (!staffByUid.empty) return true;
  if (email) {
    const staffByEmail = await db
      .collection('lab_staff')
      .where('labUid', '==', targetLabUid)
      .where('email', '==', email.toLowerCase())
      .where('status', '==', 'active')
      .limit(2)
      .get();
    if (!staffByEmail.empty) return true;
  }
  return false;
}

export function createLabRouter(deps: LabRouterDeps): Router {
  const router = express.Router();

  async function verifyBearerToken(
    req: Request,
    res: Response,
  ): Promise<{ uid: string; email: string; name: string } | null> {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({
        error: 'LAB_SERVICE_UNAVAILABLE',
        message: 'Server Admin SDK is required for verified laboratory operations.',
      });
      return null;
    }
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    try {
      const decoded = await deps.adminAuth.verifyIdToken(token, false);
      if (!decoded.uid || decoded.email_verified !== true) {
        res.status(401).json({ error: 'EMAIL_NOT_VERIFIED' });
        return null;
      }
      return {
        uid: decoded.uid,
        email: (decoded.email || '').trim().toLowerCase(),
        name: normalizeStr(decoded.name || decoded.email, 120),
      };
    } catch {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return null;
    }
  }

  async function requireLabAccess(
    req: Request,
    res: Response,
    requiredPermissions?: LabPermissionKey[],
    options?: { managerOnly?: boolean },
  ): Promise<VerifiedLabActor | null> {
    const bearer = await verifyBearerToken(req, res);
    if (!bearer) return null;
    const db = deps.getAdminDb()!;

    const resolved = await resolveLabActorFromDb(db, bearer.uid, bearer.email, bearer.name);
    if (!resolved.ok) {
      res.status(resolved.statusCode).json({ error: resolved.error });
      return null;
    }

    const { actor } = resolved;
    if (options?.managerOnly && actor.actorRole !== 'lab_manager') {
      res.status(403).json({ error: 'LAB_MANAGER_REQUIRED' });
      return null;
    }

    if (
      actor.actorRole !== 'lab_manager' &&
      requiredPermissions &&
      requiredPermissions.length > 0 &&
      !requiredPermissions.some((p) => actor.permissions.includes(p))
    ) {
      res.status(403).json({
        error: 'INSUFFICIENT_LAB_PERMISSIONS',
        requiredPermissions,
      });
      return null;
    }

    return actor;
  }

  // ---------------------------------------------------------------------------
  // Lab Access Probe (Works for Approved Lab Owners & Active Lab Staff)
  // ---------------------------------------------------------------------------
  router.get('/lab/access', async (req, res) => {
    const bearer = await verifyBearerToken(req, res);
    if (!bearer) return;
    const db = deps.getAdminDb()!;
    const resolved = await resolveLabActorFromDb(db, bearer.uid, bearer.email, bearer.name);
    if (!resolved.ok) {
      res.json({
        hasAccess: false,
        reason: resolved.error,
        suspended: resolved.error === 'LAB_INSTITUTION_SUSPENDED',
      });
      return;
    }
    const { actor } = resolved;
    res.json({
      hasAccess: true,
      actorRole: actor.actorRole,
      actorName: actor.name,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      labNameAr: actor.labNameAr,
      institutionStatus: String(actor.labProfile.institutionStatus || 'active'),
      permissions: actor.permissions,
    });
  });

  // ---------------------------------------------------------------------------
  // Full Isolated Lab Workspace Hydration
  // ---------------------------------------------------------------------------
  router.get('/lab/workspace', async (req, res) => {
    const actor = await requireLabAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    await ensureCentralTestsSeeded(db);

    try {
      const [
        centralSnap,
        testsSnap,
        offersSnap,
        patientsSnap,
        ordersSnap,
        samplesSnap,
        homeSnap,
        bookingsSnap,
        resultsSnap,
        invoicesSnap,
        paymentsSnap,
        staffSnap,
        inventorySnap,
        recipesSnap,
        movementsSnap,
        suppliersSnap,
        poSnap,
        reviewsSnap,
        notifsSnap,
        convsSnap,
        adminMsgsSnap,
        auditSnap,
      ] = await Promise.all([
        db.collection('medora_central_lab_tests').limit(100).get(),
        db.collection('lab_tests').where('labUid', '==', actor.labUid).limit(200).get(),
        db.collection('lab_offers').where('labUid', '==', actor.labUid).limit(100).get(),
        db.collection('lab_patients').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_orders').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_samples').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_home_collections').where('labUid', '==', actor.labUid).limit(200).get(),
        db.collection('lab_bookings').where('facilityUid', '==', actor.labUid).limit(200).get(),
        db.collection('lab_results').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_invoices').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_payments').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_staff').where('labUid', '==', actor.labUid).limit(100).get(),
        db.collection('lab_inventory_items').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_test_recipes').where('labUid', '==', actor.labUid).limit(200).get(),
        db.collection('lab_stock_movements').where('labUid', '==', actor.labUid).limit(300).get(),
        db.collection('lab_suppliers').where('labUid', '==', actor.labUid).limit(100).get(),
        db.collection('lab_purchase_orders').where('labUid', '==', actor.labUid).limit(150).get(),
        db.collection('lab_reviews').where('labUid', '==', actor.labUid).limit(200).get(),
        actor.actorRole === 'lab_manager'
          ? db.collection('lab_notifications').where('labUid', '==', actor.labUid).limit(150).get()
          : Promise.resolve(null),
        db.collection('lab_conversations').where('labUid', '==', actor.labUid).limit(150).get(),
        db.collection('lab_admin_messages').where('labUid', '==', actor.labUid).limit(100).get(),
        db.collection('lab_audit_logs').where('labUid', '==', actor.labUid).limit(200).get(),
      ]);

      // Sync proactive low-stock / expiry notifications idempotently once per Baghdad date (owner/manager only)
      const today = getBaghdadNow().dateStr;
      const in30DaysMs = Date.now() + 30 * 86400000;
      const inventory = inventorySnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

      if (actor.actorRole === 'lab_manager') {
        for (const item of inventory) {
          const qty = Number(item.quantity || 0);
          const minT = Number(item.minThreshold || 0);
          const itemId = String(item.itemId || '');
          const name = String(item.name || '');
          if (itemId && qty <= minT) {
            await emitLabNotification(db, {
              labUid: actor.labUid,
              type: 'low_stock',
              title: `تنبيه نقص مخزون: ${name}`,
              body: `الكمية الحالية ${qty} ${String(item.unit || '')} وصلت إلى حد التنبيه (${minT}).`,
              relatedId: itemId,
              deterministicId: `lntf_low_${itemId}_${today}`,
            });
          }
          const exp = String(item.expiryDate || '');
          if (itemId && /^\d{4}-\d{2}-\d{2}$/.test(exp)) {
            const expMs = new Date(`${exp}T23:59:59Z`).getTime();
            if (Number.isFinite(expMs) && expMs <= in30DaysMs) {
              await emitLabNotification(db, {
                labUid: actor.labUid,
                type: 'expiry_alert',
                title: `تنبيه صلاحية مادة: ${name}`,
                body: `تاريخ الانتهاء ${exp} (الدفعة: ${String(item.lotNumber || '-')}).`,
                relatedId: itemId,
                deterministicId: `lntf_exp_${itemId}_${today}`,
              });
            }
          }
        }
      }

      const sortDescCreated = (docs: Array<Record<string, unknown>>) =>
        docs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const centralCatalog = centralSnap.empty
        ? MEDORA_CENTRAL_LAB_TESTS
        : centralSnap.docs.map((d) => serializeDoc(d.data()));

      res.json({
        actorRole: actor.actorRole,
        actorName: actor.name,
        actorEmail: actor.email,
        permissions: actor.permissions,
        labProfile: actor.labProfile,
        centralCatalog,
        tests: testsSnap.docs.map((d) => serializeDoc(d.data())).sort((a, b) => String(a.nameAr || '').localeCompare(String(b.nameAr || ''))),
        offers: sortDescCreated(offersSnap.docs.map((d) => serializeDoc(d.data()))),
        patients: sortDescCreated(patientsSnap.docs.map((d) => serializeDoc(d.data()))),
        orders: sortDescCreated(ordersSnap.docs.map((d) => serializeDoc(d.data()))),
        samples: sortDescCreated(samplesSnap.docs.map((d) => serializeDoc(d.data()))),
        homeCollections: sortDescCreated(homeSnap.docs.map((d) => serializeDoc(d.data()))),
        bookings: bookingsSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => `${String(b.date || '')} ${String(b.time || '')}`.localeCompare(`${String(a.date || '')} ${String(a.time || '')}`)),
        results: sortDescCreated(resultsSnap.docs.map((d) => serializeDoc(d.data()))),
        invoices: sortDescCreated(invoicesSnap.docs.map((d) => serializeDoc(d.data()))),
        payments: sortDescCreated(paymentsSnap.docs.map((d) => serializeDoc(d.data()))),
        staff: sortDescCreated(staffSnap.docs.map((d) => serializeDoc(d.data()))),
        inventory,
        recipes: recipesSnap.docs.map((d) => serializeDoc(d.data())),
        stockMovements: sortDescCreated(movementsSnap.docs.map((d) => serializeDoc(d.data()))),
        suppliers: suppliersSnap.docs.map((d) => serializeDoc(d.data())).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
        purchaseOrders: sortDescCreated(poSnap.docs.map((d) => serializeDoc(d.data()))),
        reviews: sortDescCreated(reviewsSnap.docs.map((d) => serializeDoc(d.data()))),
        notifications:
          actor.actorRole === 'lab_manager' && notifsSnap
            ? sortDescCreated(notifsSnap.docs.map((d) => serializeDoc(d.data())))
            : [],
        conversations: convsSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || ''))),
        adminMessages: adminMsgsSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
        auditLogs: sortDescCreated(auditSnap.docs.map((d) => serializeDoc(d.data()))),
      });
    } catch (err) {
      console.error('[MEDORA][LabWorkspace] error:', err);
      res.status(500).json({ error: 'LAB_WORKSPACE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Lab Patients Registry (Sequential Human File Numbers — Zero Barcode/QR)
  // ---------------------------------------------------------------------------
  router.post('/lab/patients', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const genderRaw = normalizeStr(req.body?.gender, 20);
    const gender = genderRaw === 'male' || genderRaw === 'female' ? genderRaw : 'unspecified';
    const dateOfBirth = normalizeStr(req.body?.dateOfBirth, 20);
    const age = typeof req.body?.age === 'number' && Number.isFinite(req.body.age) ? Math.max(0, Math.min(130, Math.round(req.body.age))) : undefined;
    const address = normalizeStr(req.body?.address, 240);
    const allergies = normalizeStr(req.body?.allergies, 300);
    const chronicNotes = normalizeStr(req.body?.chronicNotes, 500);
    const linkedPatientUid = normalizeStr(req.body?.linkedPatientUid, 128);

    if (fullName.length < 2 || phone.length < 5) {
      res.status(400).json({ error: 'INVALID_PATIENT_INPUT' });
      return;
    }

    try {
      const existingSnap = await db.collection('lab_patients').where('labUid', '==', actor.labUid).limit(400).get();
      const nextNum = existingSnap.size + 1;
      const fileNumber = `LAB-P-${String(nextNum).padStart(4, '0')}`;
      const patientRecordId = safeId('lpat');
      const nowIso = new Date().toISOString();

      const payload: Record<string, unknown> = {
        patientRecordId,
        fileNumber,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        fullName,
        phone,
        gender,
        ...(dateOfBirth ? { dateOfBirth } : {}),
        ...(age !== undefined ? { age } : {}),
        ...(address ? { address } : {}),
        ...(allergies ? { allergies } : {}),
        ...(chronicNotes ? { chronicNotes } : {}),
        ...(linkedPatientUid ? { linkedPatientUid } : {}),
        totalOrders: 0,
        lastOrderDate: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await db.doc(`lab_patients/${patientRecordId}`).set(payload);
      await writeLabAudit(db, actor, {
        action: 'LAB_PATIENT_CREATED',
        targetType: 'lab_patients',
        targetId: patientRecordId,
        details: `Created patient file ${fileNumber} (${fullName})`,
      });
      res.status(201).json({ ok: true, patient: payload });
    } catch (err) {
      console.error('[MEDORA][CreateLabPatient] error:', err);
      res.status(500).json({ error: 'LAB_PATIENT_CREATE_FAILED' });
    }
  });

  router.patch('/lab/patients/:patientRecordId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const patientRecordId = normalizeStr(req.params.patientRecordId, 128);
    if (!patientRecordId) {
      res.status(400).json({ error: 'INVALID_PATIENT_ID' });
      return;
    }

    try {
      const ref = db.doc(`lab_patients/${patientRecordId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_PATIENT_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      const fullName = normalizeStr(req.body?.fullName, 120);
      const phone = normalizeStr(req.body?.phone, 32);
      if (fullName.length >= 2) patch.fullName = fullName;
      if (phone.length >= 5) patch.phone = phone;
      if (req.body?.gender !== undefined) {
        const g = normalizeStr(req.body.gender, 20);
        patch.gender = g === 'male' || g === 'female' ? g : 'unspecified';
      }
      if (req.body?.dateOfBirth !== undefined) patch.dateOfBirth = normalizeStr(req.body.dateOfBirth, 20);
      if (typeof req.body?.age === 'number') patch.age = Math.max(0, Math.min(130, Math.round(req.body.age)));
      if (req.body?.address !== undefined) patch.address = normalizeStr(req.body.address, 240);
      if (req.body?.allergies !== undefined) patch.allergies = normalizeStr(req.body.allergies, 300);
      if (req.body?.chronicNotes !== undefined) patch.chronicNotes = normalizeStr(req.body.chronicNotes, 500);

      await ref.update(patch);
      const updated = await ref.get();
      res.json({ ok: true, patient: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateLabPatient] error:', err);
      res.status(500).json({ error: 'LAB_PATIENT_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Central Catalog Adoption & Custom Lab Tests / Prices / Prep Instructions
  // ---------------------------------------------------------------------------
  router.post('/lab/tests/adopt-central', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings', 'enterResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const centralTestIds = Array.isArray(req.body?.centralTestIds)
      ? (req.body.centralTestIds as unknown[]).map((id) => normalizeStr(id, 80)).filter(Boolean).slice(0, 40)
      : [];
    if (centralTestIds.length === 0) {
      res.status(400).json({ error: 'CENTRAL_TESTS_REQUIRED' });
      return;
    }

    try {
      await ensureCentralTestsSeeded(db);
      const existingSnap = await db.collection('lab_tests').where('labUid', '==', actor.labUid).limit(200).get();
      const existingCentralIds = new Set(
        existingSnap.docs.map((d) => String(d.data()?.centralTestId || '')).filter(Boolean),
      );

      const added: Array<Record<string, unknown>> = [];
      const batch = db.batch();
      const nowIso = new Date().toISOString();

      for (const cid of centralTestIds) {
        if (existingCentralIds.has(cid)) continue;
        const cSnap = await db.doc(`medora_central_lab_tests/${cid}`).get();
        const item = cSnap.exists
          ? serializeDoc(cSnap.data())
          : MEDORA_CENTRAL_LAB_TESTS.find((t) => t.centralTestId === cid) as unknown as Record<string, unknown> | undefined;
        if (!item) continue;

        const testId = safeId('ltest');
        const payload = {
          testId,
          labUid: actor.labUid,
          institutionId: actor.institutionId,
          centralTestId: cid,
          code: normalizeStr(item.code, 40),
          nameAr: normalizeStr(item.nameAr, 160),
          nameEn: normalizeStr(item.nameEn, 160),
          category: normalizeStr(item.category, 120),
          sampleType: VALID_SAMPLE_TYPES.has(String(item.sampleType)) ? String(item.sampleType) : 'serum',
          unit: normalizeStr(item.unit, 60),
          referenceRangeText: normalizeStr(item.referenceRangeText, 240),
          referenceMin: typeof item.referenceMin === 'number' ? item.referenceMin : null,
          referenceMax: typeof item.referenceMax === 'number' ? item.referenceMax : null,
          prepInstructions: normalizeStr(item.prepInstructionsAr || item.prepInstructionsEn, 400),
          priceIqd: numOrZero(item.suggestedPriceIqd),
          turnaroundHours: Math.max(1, Math.round(numOrZero(item.turnaroundHours, 720) || 2)),
          isActive: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        batch.set(db.doc(`lab_tests/${testId}`), payload);
        added.push(payload);
      }

      if (added.length > 0) {
        await batch.commit();
        await syncLabServiceCatalog(db, actor.labUid);
      }
      res.status(201).json({ ok: true, addedTests: added });
    } catch (err) {
      console.error('[MEDORA][AdoptCentralTests] error:', err);
      res.status(500).json({ error: 'ADOPT_CENTRAL_TESTS_FAILED' });
    }
  });

  router.post('/lab/tests', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings', 'enterResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const nameAr = normalizeStr(req.body?.nameAr, 160);
    const nameEn = normalizeStr(req.body?.nameEn, 160) || nameAr;
    const code = normalizeStr(req.body?.code, 40) || makeHumanCode('TST');
    const category = normalizeStr(req.body?.category, 120) || 'تحاليل خاصة / Custom';
    const sampleType = VALID_SAMPLE_TYPES.has(String(req.body?.sampleType))
      ? String(req.body.sampleType)
      : 'serum';
    const unit = normalizeStr(req.body?.unit, 60);
    const referenceRangeText = normalizeStr(req.body?.referenceRangeText, 240);
    const prepInstructions = normalizeStr(req.body?.prepInstructions, 400);
    const priceIqd = numOrZero(req.body?.priceIqd);
    const turnaroundHours = Math.max(1, Math.round(numOrZero(req.body?.turnaroundHours, 720) || 2));

    if (nameAr.length < 2) {
      res.status(400).json({ error: 'INVALID_LAB_TEST_INPUT' });
      return;
    }

    const testId = safeId('ltest');
    const nowIso = new Date().toISOString();
    const payload = {
      testId,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      code,
      nameAr,
      nameEn,
      category,
      sampleType,
      unit,
      referenceRangeText,
      referenceMin: typeof req.body?.referenceMin === 'number' ? req.body.referenceMin : null,
      referenceMax: typeof req.body?.referenceMax === 'number' ? req.body.referenceMax : null,
      prepInstructions,
      priceIqd,
      turnaroundHours,
      isActive: req.body?.isActive !== false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await db.doc(`lab_tests/${testId}`).set(payload);
      await syncLabServiceCatalog(db, actor.labUid);
      res.status(201).json({ ok: true, test: payload });
    } catch (err) {
      console.error('[MEDORA][CreateLabTest] error:', err);
      res.status(500).json({ error: 'LAB_TEST_CREATE_FAILED' });
    }
  });

  router.patch('/lab/tests/:testId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings', 'enterResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const testId = normalizeStr(req.params.testId, 128);
    if (!testId) {
      res.status(400).json({ error: 'INVALID_TEST_ID' });
      return;
    }

    try {
      const ref = db.doc(`lab_tests/${testId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_TEST_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body?.nameAr !== undefined) patch.nameAr = normalizeStr(req.body.nameAr, 160);
      if (req.body?.nameEn !== undefined) patch.nameEn = normalizeStr(req.body.nameEn, 160);
      if (req.body?.code !== undefined) patch.code = normalizeStr(req.body.code, 40);
      if (req.body?.category !== undefined) patch.category = normalizeStr(req.body.category, 120);
      if (VALID_SAMPLE_TYPES.has(String(req.body?.sampleType))) patch.sampleType = String(req.body.sampleType);
      if (req.body?.unit !== undefined) patch.unit = normalizeStr(req.body.unit, 60);
      if (req.body?.referenceRangeText !== undefined) {
        patch.referenceRangeText = normalizeStr(req.body.referenceRangeText, 240);
      }
      if (req.body?.prepInstructions !== undefined) {
        patch.prepInstructions = normalizeStr(req.body.prepInstructions, 400);
      }
      if (req.body?.priceIqd !== undefined) patch.priceIqd = numOrZero(req.body.priceIqd);
      if (req.body?.turnaroundHours !== undefined) {
        patch.turnaroundHours = Math.max(1, Math.round(numOrZero(req.body.turnaroundHours, 720) || 2));
      }
      if (typeof req.body?.isActive === 'boolean') patch.isActive = req.body.isActive;

      await ref.update(patch);
      await syncLabServiceCatalog(db, actor.labUid);
      const updated = await ref.get();
      res.json({ ok: true, test: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateLabTest] error:', err);
      res.status(500).json({ error: 'LAB_TEST_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Lab Offers & Diagnostic Packages
  // ---------------------------------------------------------------------------
  router.post('/lab/offers', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['bookings', 'billing']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const title = normalizeStr(req.body?.title, 160);
    const description = normalizeStr(req.body?.description, 600);
    const offerType = req.body?.offerType === 'single_discount' ? 'single_discount' : 'package';
    const testIds = Array.isArray(req.body?.testIds)
      ? (req.body.testIds as unknown[]).map((s) => normalizeStr(s, 128)).filter(Boolean).slice(0, 30)
      : [];
    const testNames = Array.isArray(req.body?.testNames)
      ? (req.body.testNames as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean).slice(0, 30)
      : [];
    const originalPriceIqd = numOrZero(req.body?.originalPriceIqd);
    const offerPriceIqd = numOrZero(req.body?.offerPriceIqd);
    const startDate = normalizeStr(req.body?.startDate, 20) || getBaghdadNow().dateStr;
    const endDate = normalizeStr(req.body?.endDate, 20);

    if (
      title.length < 2 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      endDate < startDate ||
      offerPriceIqd <= 0
    ) {
      res.status(400).json({ error: 'INVALID_OFFER_INPUT' });
      return;
    }

    const offerId = safeId('loff');
    const nowIso = new Date().toISOString();
    const payload = {
      offerId,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      labNameAr: actor.labNameAr,
      labNameEn: normalizeStr(actor.labProfile.labNameEn, 160),
      offerType,
      title,
      description,
      testIds,
      testNames,
      originalPriceIqd: Math.max(originalPriceIqd, offerPriceIqd),
      offerPriceIqd,
      startDate,
      endDate,
      isActive: req.body?.isActive !== false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await db.doc(`lab_offers/${offerId}`).set(payload);
      res.status(201).json({ ok: true, offer: payload });
    } catch (err) {
      console.error('[MEDORA][CreateLabOffer] error:', err);
      res.status(500).json({ error: 'LAB_OFFER_CREATE_FAILED' });
    }
  });

  router.patch('/lab/offers/:offerId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['bookings', 'billing']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const offerId = normalizeStr(req.params.offerId, 128);
    if (!offerId) {
      res.status(400).json({ error: 'INVALID_OFFER_ID' });
      return;
    }
    try {
      const ref = db.doc(`lab_offers/${offerId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_OFFER_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body?.title !== undefined) patch.title = normalizeStr(req.body.title, 160);
      if (req.body?.description !== undefined) patch.description = normalizeStr(req.body.description, 600);
      if (req.body?.offerType === 'single_discount' || req.body?.offerType === 'package') {
        patch.offerType = req.body.offerType;
      }
      if (Array.isArray(req.body?.testIds)) {
        patch.testIds = (req.body.testIds as unknown[]).map((s) => normalizeStr(s, 128)).filter(Boolean).slice(0, 30);
      }
      if (Array.isArray(req.body?.testNames)) {
        patch.testNames = (req.body.testNames as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean).slice(0, 30);
      }
      if (req.body?.originalPriceIqd !== undefined) patch.originalPriceIqd = numOrZero(req.body.originalPriceIqd);
      if (req.body?.offerPriceIqd !== undefined) patch.offerPriceIqd = numOrZero(req.body.offerPriceIqd);
      if (typeof req.body?.isActive === 'boolean') patch.isActive = req.body.isActive;
      if (req.body?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.startDate))) {
        patch.startDate = String(req.body.startDate);
      }
      if (req.body?.endDate && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.endDate))) {
        patch.endDate = String(req.body.endDate);
      }
      await ref.update(patch);
      const updated = await ref.get();
      res.json({ ok: true, offer: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateLabOffer] error:', err);
      res.status(500).json({ error: 'LAB_OFFER_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Atomic Order Inventory Deduction & Reversal Helpers
  // ---------------------------------------------------------------------------
  async function consumeInventoryForOrderTx(
    db: Firestore,
    actor: VerifiedLabActor,
    orderId: string,
    reasonPrefix: string,
  ): Promise<{ consumedCount: number; alreadyConsumed: boolean; itemsAdjusted: Array<Record<string, unknown>> }> {
    const orderRef = db.doc(`lab_orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.labUid !== actor.labUid) {
      throw new Error('ORDER_NOT_FOUND');
    }
    const order = serializeDoc(orderSnap.data());
    if (order.inventoryConsumedAt) {
      return { consumedCount: 0, alreadyConsumed: true, itemsAdjusted: [] };
    }

    const orderTests = Array.isArray(order.tests) ? (order.tests as Array<Record<string, unknown>>) : [];
    const testIds = orderTests.map((t) => String(t.testId || '')).filter(Boolean);
    if (testIds.length === 0) {
      return { consumedCount: 0, alreadyConsumed: false, itemsAdjusted: [] };
    }

    const recipesSnap = await db.collection('lab_test_recipes').where('labUid', '==', actor.labUid).limit(200).get();
    const recipeMap = new Map<string, Array<{ itemId: string; itemName: string; quantityPerTest: number }>>();
    recipesSnap.docs.forEach((d) => {
      const r = d.data() as Record<string, unknown>;
      const tid = String(r.testId || '');
      const mats = Array.isArray(r.materials) ? (r.materials as Array<Record<string, unknown>>) : [];
      if (tid && mats.length > 0) {
        recipeMap.set(
          tid,
          mats.map((m) => ({
            itemId: String(m.itemId || ''),
            itemName: String(m.itemName || ''),
            quantityPerTest: Number(m.quantityPerTest || 0),
          })),
        );
      }
    });

    const totalDeductByItem = new Map<string, { itemName: string; qty: number }>();
    for (const tid of testIds) {
      const mats = recipeMap.get(tid);
      if (!mats) continue;
      for (const m of mats) {
        if (!m.itemId || m.quantityPerTest <= 0) continue;
        const prev = totalDeductByItem.get(m.itemId) || { itemName: m.itemName, qty: 0 };
        prev.qty += m.quantityPerTest;
        totalDeductByItem.set(m.itemId, prev);
      }
    }

    const nowIso = new Date().toISOString();
    if (totalDeductByItem.size === 0) {
      await orderRef.update({
        inventoryConsumedAt: nowIso,
        inventoryReversedAt: null,
        updatedAt: nowIso,
      });
      return { consumedCount: 0, alreadyConsumed: false, itemsAdjusted: [] };
    }

    const adjusted: Array<Record<string, unknown>> = [];
    await db.runTransaction(async (tx) => {
      const freshOrder = await tx.get(orderRef);
      if (!freshOrder.exists) throw new Error('ORDER_NOT_FOUND');
      if (freshOrder.data()?.inventoryConsumedAt) {
        throw new Error('ALREADY_CONSUMED');
      }

      const itemRefs = Array.from(totalDeductByItem.keys()).map((id) => db.doc(`lab_inventory_items/${id}`));
      const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

      for (const snap of itemSnaps) {
        if (!snap.exists || snap.data()?.labUid !== actor.labUid) continue;
        const id = snap.id;
        const reqInfo = totalDeductByItem.get(id);
        if (!reqInfo) continue;
        const currentQty = Number(snap.data()?.quantity || 0);
        const deductQty = Math.round(reqInfo.qty * 100) / 100;
        const nextQty = Math.max(0, Math.round((currentQty - deductQty) * 100) / 100);
        const actualDelta = Math.round((nextQty - currentQty) * 100) / 100;

        tx.update(snap.ref, {
          quantity: nextQty,
          updatedAt: nowIso,
        });

        const movId = safeId('smov');
        const mov = {
          movementId: movId,
          labUid: actor.labUid,
          itemId: id,
          itemName: String(snap.data()?.name || reqInfo.itemName),
          movementType: 'auto_order_deduction',
          quantityDelta: actualDelta,
          balanceAfter: nextQty,
          orderId,
          orderNumber: String(order.orderNumber || ''),
          reason: `${reasonPrefix}: ${String(order.orderNumber || orderId)}`,
          actorUid: actor.uid,
          actorName: actor.name,
          createdAt: nowIso,
        };
        tx.set(db.doc(`lab_stock_movements/${movId}`), mov);
        adjusted.push(mov);
      }

      const updatedTests = orderTests.map((t) => ({ ...t, inventoryConsumed: true }));
      tx.update(orderRef, {
        tests: updatedTests,
        inventoryConsumedAt: nowIso,
        inventoryReversedAt: null,
        updatedAt: nowIso,
      });
    });

    return { consumedCount: adjusted.length, alreadyConsumed: false, itemsAdjusted: adjusted };
  }

  async function reverseInventoryForOrderTx(
    db: Firestore,
    actor: VerifiedLabActor,
    orderId: string,
    reasonText: string,
  ): Promise<{ reversedCount: number }> {
    const orderRef = db.doc(`lab_orders/${orderId}`);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists || orderSnap.data()?.labUid !== actor.labUid) {
      throw new Error('ORDER_NOT_FOUND');
    }
    const order = serializeDoc(orderSnap.data());
    if (!order.inventoryConsumedAt) {
      return { reversedCount: 0 };
    }

    const movSnap = await db
      .collection('lab_stock_movements')
      .where('labUid', '==', actor.labUid)
      .where('orderId', '==', orderId)
      .limit(100)
      .get();

    const deductions = movSnap.docs
      .map((d) => d.data() as Record<string, unknown>)
      .filter((m) => m.movementType === 'auto_order_deduction' && Number(m.quantityDelta || 0) < 0);

    const nowIso = new Date().toISOString();
    let reversedCount = 0;

    await db.runTransaction(async (tx) => {
      const freshOrder = await tx.get(orderRef);
      if (!freshOrder.exists || !freshOrder.data()?.inventoryConsumedAt) return;

      const byItem = new Map<string, number>();
      for (const d of deductions) {
        const id = String(d.itemId || '');
        const restoreAmt = Math.abs(Number(d.quantityDelta || 0));
        if (!id || restoreAmt <= 0) continue;
        byItem.set(id, (byItem.get(id) || 0) + restoreAmt);
      }

      const refs = Array.from(byItem.keys()).map((id) => db.doc(`lab_inventory_items/${id}`));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      for (const s of snaps) {
        if (!s.exists || s.data()?.labUid !== actor.labUid) continue;
        const addAmt = byItem.get(s.id) || 0;
        const curr = Number(s.data()?.quantity || 0);
        const next = Math.round((curr + addAmt) * 100) / 100;
        tx.update(s.ref, { quantity: next, updatedAt: nowIso });
        const movId = safeId('smov');
        tx.set(db.doc(`lab_stock_movements/${movId}`), {
          movementId: movId,
          labUid: actor.labUid,
          itemId: s.id,
          itemName: String(s.data()?.name || ''),
          movementType: 'reversal_restock',
          quantityDelta: addAmt,
          balanceAfter: next,
          orderId,
          orderNumber: String(order.orderNumber || ''),
          reason: reasonText,
          actorUid: actor.uid,
          actorName: actor.name,
          createdAt: nowIso,
        });
        reversedCount += 1;
      }

      const existingTests = Array.isArray(order.tests) ? (order.tests as Array<Record<string, unknown>>) : [];
      tx.update(orderRef, {
        tests: existingTests.map((t) => ({ ...t, inventoryConsumed: false })),
        inventoryConsumedAt: null,
        inventoryReversedAt: nowIso,
        updatedAt: nowIso,
      });
    });

    return { reversedCount };
  }

  // ---------------------------------------------------------------------------
  // Lab Orders, Sample Receiving, Home Collection & Booking Conversion
  // ---------------------------------------------------------------------------
  router.post('/lab/orders', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'bookings', 'samples']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const priority = req.body?.priority === 'stat' || req.body?.priority === 'urgent' ? req.body.priority : 'routine';
    const clinicalNotes = normalizeStr(req.body?.clinicalNotes, 500);
    const sourceBookingId = normalizeStr(req.body?.sourceBookingId, 128);
    const sourceHomeCollectionId = normalizeStr(req.body?.sourceHomeCollectionId, 128);
    const sourceDiagnosticOrderId = normalizeStr(req.body?.sourceDiagnosticOrderId, 128);
    const rawRequestingDoctorUid = normalizeStr(
      req.body?.doctorUid || req.body?.requestingDoctorUid,
      128,
    );
    const offerId = normalizeStr(req.body?.offerId, 128);
    const offerTitle = normalizeStr(req.body?.offerTitle, 160);
    const discountIqd = numOrZero(req.body?.discountIqd);
    const homeCollectionFeeIqd = numOrZero(req.body?.homeCollectionFeeIqd);
    const autoCreateInvoice = req.body?.autoCreateInvoice !== false;

    const rawTests: unknown[] = Array.isArray(req.body?.tests) ? req.body.tests : [];
    interface ParsedOrderTest {
      testId: string;
      code: string;
      nameAr: string;
      nameEn: string;
      sampleType: string;
      unit: string;
      referenceRangeText: string;
      priceIqd: number;
      inventoryConsumed: boolean;
    }
    const tests: ParsedOrderTest[] = rawTests
      .slice(0, 40)
      .map((t: unknown): ParsedOrderTest | null => {
        const rec = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const nameAr = normalizeStr(rec.nameAr || rec.nameEn, 160);
        if (!nameAr) return null;
        return {
          testId: normalizeStr(rec.testId, 128) || safeId('lt'),
          code: normalizeStr(rec.code, 40) || 'LAB',
          nameAr,
          nameEn: normalizeStr(rec.nameEn, 160) || nameAr,
          sampleType: VALID_SAMPLE_TYPES.has(String(rec.sampleType)) ? String(rec.sampleType) : 'serum',
          unit: normalizeStr(rec.unit, 60),
          referenceRangeText: normalizeStr(rec.referenceRangeText, 240),
          priceIqd: numOrZero(rec.priceIqd),
          inventoryConsumed: false,
        };
      })
      .filter((x): x is ParsedOrderTest => x !== null);

    if (!patientRecordId || tests.length === 0) {
      res.status(400).json({ error: 'INVALID_LAB_ORDER_INPUT' });
      return;
    }

    try {
      const patRef = db.doc(`lab_patients/${patientRecordId}`);
      const patSnap = await patRef.get();
      if (!patSnap.exists || patSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_PATIENT_NOT_FOUND' });
        return;
      }
      const pat = serializeDoc(patSnap.data());

      const orderId = safeId('lord');
      const orderNumber = makeHumanCode('ORD');
      const nowIso = new Date().toISOString();
      const totalAmountIqd = tests.reduce((sum, t) => sum + t.priceIqd, 0);
      const netAmountIqd = Math.max(0, totalAmountIqd - discountIqd + homeCollectionFeeIqd);

      let verifiedDoctorUid = '';
      if (sourceDiagnosticOrderId) {
        const diagOrderSnap = await db.doc(`diagnostic_orders/${sourceDiagnosticOrderId}`).get();
        if (diagOrderSnap.exists && diagOrderSnap.data()?.orderType === 'lab') {
          verifiedDoctorUid = String(diagOrderSnap.data()?.doctorUid || '').trim();
        }
      } else if (rawRequestingDoctorUid) {
        const docProfSnap = await db.doc(`doctor_profiles/${rawRequestingDoctorUid}`).get();
        if (docProfSnap.exists && docProfSnap.data()?.status === 'Approved') {
          verifiedDoctorUid = rawRequestingDoctorUid;
        }
      }

      const orderPayload: Record<string, unknown> = {
        orderId,
        orderNumber,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        patientRecordId,
        patientName: String(pat.fullName || ''),
        patientPhone: String(pat.phone || ''),
        ...(pat.linkedPatientUid ? { linkedPatientUid: String(pat.linkedPatientUid) } : {}),
        ...(sourceBookingId ? { sourceBookingId } : {}),
        ...(sourceDiagnosticOrderId && verifiedDoctorUid ? { sourceDiagnosticOrderId } : {}),
        ...(verifiedDoctorUid ? { doctorUid: verifiedDoctorUid, requestingDoctorUid: verifiedDoctorUid } : {}),
        ...(offerId ? { offerId, offerTitle } : {}),
        priority,
        status: 'ordered',
        tests,
        totalAmountIqd,
        discountIqd,
        homeCollectionFeeIqd,
        netAmountIqd,
        ...(clinicalNotes ? { clinicalNotes } : {}),
        inventoryConsumedAt: null,
        inventoryReversedAt: null,
        createdByUid: actor.uid,
        createdByName: actor.name,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const batch = db.batch();
      batch.set(db.doc(`lab_orders/${orderId}`), orderPayload);
      batch.update(patRef, {
        totalOrders: FieldValue.increment(1),
        lastOrderDate: nowIso,
        updatedAt: nowIso,
      });

      if (sourceHomeCollectionId) {
        const hRef = db.doc(`lab_home_collections/${sourceHomeCollectionId}`);
        const hSnap = await hRef.get();
        if (hSnap.exists && hSnap.data()?.labUid === actor.labUid) {
          batch.update(hRef, { linkedOrderId: orderId, updatedAt: nowIso });
        }
      }

      let createdInvoice: Record<string, unknown> | null = null;
      if (autoCreateInvoice && (actor.actorRole === 'lab_manager' || actor.permissions.includes('billing') || actor.permissions.includes('reception'))) {
        const invoiceId = safeId('linv');
        const invoiceNumber = makeHumanCode('INV');
        createdInvoice = {
          invoiceId,
          invoiceNumber,
          labUid: actor.labUid,
          institutionId: actor.institutionId,
          labNameAr: actor.labNameAr,
          labPhone: normalizeStr(actor.labProfile.professionalPhone, 32),
          labAddress: `${normalizeStr(actor.labProfile.governorate, 80)} · ${normalizeStr(actor.labProfile.district, 80)} — ${normalizeStr(actor.labProfile.address, 200)}`,
          orderId,
          orderNumber,
          patientRecordId,
          patientName: String(pat.fullName || ''),
          patientPhone: String(pat.phone || ''),
          items: tests.map((t) => ({
            description: t.nameAr,
            quantity: 1,
            unitPriceIqd: t.priceIqd,
            totalIqd: t.priceIqd,
          })),
          subtotalIqd: totalAmountIqd,
          discountIqd,
          homeCollectionFeeIqd,
          totalIqd: netAmountIqd,
          paidIqd: 0,
          balanceIqd: netAmountIqd,
          status: netAmountIqd === 0 ? 'paid' : 'unpaid',
          notes: offerTitle ? `عرض/باقة: ${offerTitle}` : '',
          createdByUid: actor.uid,
          createdByName: actor.name,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        batch.set(db.doc(`lab_invoices/${invoiceId}`), createdInvoice);
      }

      await batch.commit();
      await writeLabAudit(db, actor, {
        action: 'LAB_ORDER_CREATED',
        targetType: 'lab_orders',
        targetId: orderId,
        details: `Created order ${orderNumber} with ${tests.length} test(s)`,
      });

      await emitLabNotification(db, {
        labUid: actor.labUid,
        type: 'booking',
        eventType: 'lab_order_created',
        title: `طلب فحص جديد #${orderNumber} — ${String(pat.fullName || '')}`,
        body: `تم تسجيل ${tests.length} فحص بقيمة ${netAmountIqd.toLocaleString('en-US')} د.ع (بواسطة ${actor.name}).`,
        relatedId: orderId,
        idempotencyKey: `lab_ord_create:${orderId}`,
      });

      if (pat.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: String(pat.linkedPatientUid),
          type: 'appointment',
          eventType: 'lab_order_created',
          title: `تم تسجيل طلب فحص جديد — ${actor.labNameAr}`,
          body: `الطلب رقم ${orderNumber} (${tests.length} فحص) قيد التجهيز في المختبر.`,
          relatedId: orderId,
          relatedType: 'lab_order',
          idempotencyKey: `pat_lord_create:${orderId}`,
        });
      }

      res.status(201).json({ ok: true, order: orderPayload, invoice: createdInvoice });
    } catch (err) {
      console.error('[MEDORA][CreateLabOrder] error:', err);
      res.status(500).json({ error: 'LAB_ORDER_CREATE_FAILED' });
    }
  });

  router.patch('/lab/orders/:orderId/status', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['reception', 'samples', 'enterResults', 'approveResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const status = normalizeStr(req.body?.status, 40);
    const allowed = new Set(['ordered', 'sample_collected', 'in_lab', 'result_entered', 'approved', 'cancelled']);
    if (!orderId || !allowed.has(status)) {
      res.status(400).json({ error: 'INVALID_ORDER_STATUS' });
      return;
    }

    try {
      const ref = db.doc(`lab_orders/${orderId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_ORDER_NOT_FOUND' });
        return;
      }

      const nowIso = new Date().toISOString();
      await ref.update({ status, updatedAt: nowIso });

      let consumptionSummary: Record<string, unknown> | null = null;
      if (status === 'in_lab' && !snap.data()?.inventoryConsumedAt) {
        try {
          consumptionSummary = await consumeInventoryForOrderTx(db, actor, orderId, 'صرف تلقائي عند بدء التحليل');
        } catch (ce) {
          if (!(ce instanceof Error && ce.message === 'ALREADY_CONSUMED')) {
            console.warn('[MEDORA][AutoConsumeOnInLab] warning:', ce);
          }
        }
      }

      if (status === 'cancelled' && snap.data()?.inventoryConsumedAt) {
        await reverseInventoryForOrderTx(db, actor, orderId, 'إرجاع مخزون لإلغاء الطلب');
      }

      await writeLabAudit(db, actor, {
        action: 'LAB_ORDER_STATUS_UPDATED',
        targetType: 'lab_orders',
        targetId: orderId,
        details: `Order ${String(snap.data()?.orderNumber || orderId)} -> ${status}`,
      });

      const ordPrev = snap.data() as Record<string, unknown>;
      if (actor.actorRole === 'lab_staff' || status === 'cancelled' || status === 'approved') {
        await emitLabNotification(db, {
          labUid: actor.labUid,
          type: status === 'approved' ? 'result_approval' : 'booking',
          eventType: 'lab_order_status_updated',
          title: `تحديث حالة طلب المختبر ${String(ordPrev.orderNumber || orderId)}`,
          body: `الحالة الحالية: ${status} — بواسطة ${actor.name}`,
          relatedId: orderId,
          idempotencyKey: `lab_ord_st:${orderId}:${status}`,
        });
      }

      if (typeof ordPrev.linkedPatientUid === 'string' && ordPrev.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: ordPrev.linkedPatientUid,
          type: status === 'approved' ? 'lab_result' : 'appointment',
          eventType: status === 'approved' ? 'lab_result_available' : 'lab_order_status_updated',
          title: `تحديث طلب المختبر ${String(ordPrev.orderNumber || '')} — ${actor.labNameAr}`,
          body: `حالة الفحص الحالية: ${status}`,
          relatedId: orderId,
          relatedType: 'lab_order',
          idempotencyKey: `pat_lord_st:${orderId}:${status}`,
        });
      }

      const refreshed = await ref.get();
      res.json({ ok: true, order: serializeDoc(refreshed.data()), consumptionSummary });
    } catch (err) {
      console.error('[MEDORA][UpdateLabOrderStatus] error:', err);
      res.status(500).json({ error: 'LAB_ORDER_STATUS_FAILED' });
    }
  });

  router.post('/lab/orders/:orderId/consume-inventory', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory', 'samples', 'enterResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const orderId = normalizeStr(req.params.orderId, 128);
    if (!orderId) {
      res.status(400).json({ error: 'INVALID_ORDER_ID' });
      return;
    }
    try {
      const summary = await consumeInventoryForOrderTx(db, actor, orderId, 'صرف مواد وصفة الفحص');
      await writeLabAudit(db, actor, {
        action: 'LAB_ORDER_INVENTORY_CONSUMED',
        targetType: 'lab_orders',
        targetId: orderId,
        details: `Consumed ${summary.consumedCount} inventory item(s)`,
      });
      const updated = await db.doc(`lab_orders/${orderId}`).get();
      res.json({ ok: true, order: serializeDoc(updated.data()), summary });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'ORDER_NOT_FOUND') {
          res.status(404).json({ error: 'LAB_ORDER_NOT_FOUND' });
          return;
        }
        if (err.message === 'ALREADY_CONSUMED') {
          res.status(409).json({ error: 'INVENTORY_ALREADY_CONSUMED' });
          return;
        }
      }
      console.error('[MEDORA][ConsumeOrderInventory] error:', err);
      res.status(500).json({ error: 'INVENTORY_CONSUME_FAILED' });
    }
  });

  router.post('/lab/orders/:orderId/reverse-inventory', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const orderId = normalizeStr(req.params.orderId, 128);
    const reason = normalizeStr(req.body?.reason, 300) || 'إلغاء صرف مواد الطلب وإعادتها للمخزون';
    if (!orderId) {
      res.status(400).json({ error: 'INVALID_ORDER_ID' });
      return;
    }
    try {
      const summary = await reverseInventoryForOrderTx(db, actor, orderId, reason);
      await writeLabAudit(db, actor, {
        action: 'LAB_ORDER_INVENTORY_REVERSED',
        targetType: 'lab_orders',
        targetId: orderId,
        details: `Reversed ${summary.reversedCount} inventory deduction(s): ${reason}`,
      });
      const updated = await db.doc(`lab_orders/${orderId}`).get();
      res.json({ ok: true, order: serializeDoc(updated.data()), summary });
    } catch (err) {
      if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
        res.status(404).json({ error: 'LAB_ORDER_NOT_FOUND' });
        return;
      }
      console.error('[MEDORA][ReverseOrderInventory] error:', err);
      res.status(500).json({ error: 'INVENTORY_REVERSE_FAILED' });
    }
  });

  // Sample Receiving (Human Sample Numbers ONLY — Zero Barcode/QR)
  router.post('/lab/samples', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['samples', 'reception']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.body?.orderId, 128);
    const sampleType = VALID_SAMPLE_TYPES.has(String(req.body?.sampleType)) ? String(req.body.sampleType) : 'blood';
    const containerNote = normalizeStr(req.body?.containerNote, 200);
    const status = req.body?.status === 'rejected' ? 'rejected' : req.body?.status === 'accepted' ? 'accepted' : 'collected';
    const rejectionReason = normalizeStr(req.body?.rejectionReason, 300);
    const collectedByName = normalizeStr(req.body?.collectedByName, 120) || actor.name;

    if (!orderId || (status === 'rejected' && !rejectionReason)) {
      res.status(400).json({ error: 'INVALID_SAMPLE_INPUT' });
      return;
    }

    try {
      const orderRef = db.doc(`lab_orders/${orderId}`);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists || orderSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_ORDER_NOT_FOUND' });
        return;
      }
      const order = serializeDoc(orderSnap.data());
      const sampleId = safeId('lsmp');
      const sampleNumber = makeHumanCode('SMP');
      const nowIso = new Date().toISOString();

      const payload = {
        sampleId,
        sampleNumber,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        orderId,
        orderNumber: String(order.orderNumber || ''),
        patientRecordId: String(order.patientRecordId || ''),
        patientName: String(order.patientName || ''),
        sampleType,
        ...(containerNote ? { containerNote } : {}),
        collectedAt: normalizeStr(req.body?.collectedAt, 40) || nowIso,
        receivedAt: nowIso,
        collectedByName,
        status,
        ...(status === 'rejected' ? { rejectionReason } : {}),
        createdByUid: actor.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const batch = db.batch();
      batch.set(db.doc(`lab_samples/${sampleId}`), payload);
      if (status !== 'rejected' && order.status === 'ordered') {
        batch.update(orderRef, { status: 'sample_collected', updatedAt: nowIso });
      }
      await batch.commit();

      res.status(201).json({ ok: true, sample: payload });
    } catch (err) {
      console.error('[MEDORA][CreateSample] error:', err);
      res.status(500).json({ error: 'LAB_SAMPLE_CREATE_FAILED' });
    }
  });

  router.patch('/lab/samples/:sampleId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['samples']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const sampleId = normalizeStr(req.params.sampleId, 128);
    const status = normalizeStr(req.body?.status, 20);
    const rejectionReason = normalizeStr(req.body?.rejectionReason, 300);
    if (!sampleId || !['collected', 'accepted', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'INVALID_SAMPLE_UPDATE' });
      return;
    }
    if (status === 'rejected' && !rejectionReason) {
      res.status(400).json({ error: 'REJECTION_REASON_REQUIRED' });
      return;
    }
    try {
      const ref = db.doc(`lab_samples/${sampleId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_SAMPLE_NOT_FOUND' });
        return;
      }
      await ref.update({
        status,
        ...(status === 'rejected' ? { rejectionReason } : { rejectionReason: '' }),
        updatedAt: new Date().toISOString(),
      });
      const updated = await ref.get();
      res.json({ ok: true, sample: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateSample] error:', err);
      res.status(500).json({ error: 'LAB_SAMPLE_UPDATE_FAILED' });
    }
  });

  // Home Collection Requests
  router.post('/lab/home-collections', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['bookings', 'reception', 'samples']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const patientName = normalizeStr(req.body?.patientName, 120);
    const patientPhone = normalizeStr(req.body?.patientPhone, 32);
    const address = normalizeStr(req.body?.address, 260);
    const requestedDate = normalizeStr(req.body?.requestedDate, 20) || getBaghdadNow().dateStr;
    const preferredWindow = normalizeStr(req.body?.preferredWindow, 80) || 'صباحاً 09:00 - 12:00';
    const requestedTests = Array.isArray(req.body?.requestedTests)
      ? (req.body.requestedTests as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean).slice(0, 25)
      : [];

    if (patientName.length < 2 || patientPhone.length < 5 || address.length < 3 || requestedTests.length === 0) {
      res.status(400).json({ error: 'INVALID_HOME_COLLECTION_INPUT' });
      return;
    }

    const requestId = safeId('lhcol');
    const nowIso = new Date().toISOString();
    const payload = {
      requestId,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      labNameAr: actor.labNameAr,
      patientName,
      patientPhone,
      address,
      governorate: normalizeStr(req.body?.governorate, 80),
      district: normalizeStr(req.body?.district, 80),
      requestedDate,
      preferredWindow,
      requestedTests,
      notes: normalizeStr(req.body?.notes, 500),
      assignedStaffName: normalizeStr(req.body?.assignedStaffName, 120),
      assignedStaffPhone: normalizeStr(req.body?.assignedStaffPhone, 32),
      collectionFeeIqd: numOrZero(req.body?.collectionFeeIqd ?? actor.labProfile.homeCollectionFeeIqd),
      status: req.body?.assignedStaffName ? 'assigned' : 'requested',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await db.doc(`lab_home_collections/${requestId}`).set(payload);
      res.status(201).json({ ok: true, request: payload });
    } catch (err) {
      console.error('[MEDORA][CreateHomeCollection] error:', err);
      res.status(500).json({ error: 'HOME_COLLECTION_CREATE_FAILED' });
    }
  });

  router.patch('/lab/home-collections/:requestId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['bookings', 'reception', 'samples']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const requestId = normalizeStr(req.params.requestId, 128);
    const allowedStatuses = new Set(['requested', 'assigned', 'en_route', 'collected', 'completed', 'cancelled']);
    const status = normalizeStr(req.body?.status, 30);

    try {
      const ref = db.doc(`lab_home_collections/${requestId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'HOME_COLLECTION_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (status && allowedStatuses.has(status)) patch.status = status;
      if (req.body?.assignedStaffName !== undefined) {
        patch.assignedStaffName = normalizeStr(req.body.assignedStaffName, 120);
      }
      if (req.body?.assignedStaffPhone !== undefined) {
        patch.assignedStaffPhone = normalizeStr(req.body.assignedStaffPhone, 32);
      }
      if (req.body?.collectionFeeIqd !== undefined) {
        patch.collectionFeeIqd = numOrZero(req.body.collectionFeeIqd);
      }
      if (req.body?.notes !== undefined) patch.notes = normalizeStr(req.body.notes, 500);

      await ref.update(patch);
      const prev = serializeDoc(snap.data());
      if (prev.patientUid && status) {
        await emitPatientNotification(db, {
          patientUid: String(prev.patientUid),
          type: 'appointment',
          eventType: 'lab_order_status_updated',
          title: `تحديث طلب السحب المنزلي — ${actor.labNameAr}`,
          body: `الحالة الجديدة: ${status}${patch.assignedStaffName ? ` · الفني: ${String(patch.assignedStaffName)}` : ''}`,
          relatedId: requestId,
          relatedType: 'lab_home_collection',
          idempotencyKey: `pat_lhc:${requestId}:${status}`,
        });
      }
      const updated = await ref.get();
      res.json({ ok: true, request: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateHomeCollection] error:', err);
      res.status(500).json({ error: 'HOME_COLLECTION_UPDATE_FAILED' });
    }
  });

  // Lab Appointments / Patient Bookings Management + 1-Click Convert to Order
  router.patch('/lab/bookings/:bookingId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['bookings', 'reception']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const bookingId = normalizeStr(req.params.bookingId, 128);
    const status = normalizeStr(req.body?.status, 30);
    const allowed = new Set(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected']);

    if (!bookingId || (status && !allowed.has(status))) {
      res.status(400).json({ error: 'INVALID_BOOKING_UPDATE' });
      return;
    }

    try {
      const ref = db.doc(`lab_bookings/${bookingId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.facilityUid !== actor.labUid) {
        res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
        return;
      }
      const prev = serializeDoc(snap.data());
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (status) patch.status = status;
      if (req.body?.preparationNotes !== undefined) {
        patch.preparationNotes = normalizeStr(req.body.preparationNotes, 500);
      }
      if (req.body?.resultSummary !== undefined) {
        patch.resultSummary = normalizeStr(req.body.resultSummary, 1000);
      }

      await ref.update(patch);

      if (prev.patientUid && status) {
        const bookingEvent =
          status === 'confirmed'
            ? 'lab_booking_confirmed'
            : status === 'rejected' || status === 'cancelled'
              ? 'lab_booking_rejected'
              : status === 'completed'
                ? 'lab_result_available'
                : 'lab_order_status_updated';
        await emitPatientNotification(db, {
          patientUid: String(prev.patientUid),
          type: status === 'completed' ? 'lab_result' : 'appointment',
          eventType: bookingEvent,
          title: `تحديث حجز المختبر: ${actor.labNameAr}`,
          body: `تم تحديث حالة حجزك (${String(prev.date || '')} ${String(prev.time || '')}) إلى: ${status}`,
          relatedId: bookingId,
          relatedType: 'lab_booking',
          idempotencyKey: `pat_lbk:${bookingId}:${status}`,
        });
      }

      if (status === 'confirmed' || status === 'rejected' || status === 'cancelled') {
        await emitLabNotification(db, {
          labUid: actor.labUid,
          type: 'booking',
          eventType: status === 'confirmed' ? 'lab_booking_confirmed' : 'lab_booking_rejected',
          title: `تحديث حالة حجز المختبر (${String(prev.patientName || '')})`,
          body: `تم تغيير حالة الحجز (${String(prev.date || '')} ${String(prev.time || '')}) إلى: ${status}`,
          relatedId: bookingId,
          idempotencyKey: `lab_bk_st:${bookingId}:${status}`,
        });
      }

      let convertedOrder: Record<string, unknown> | null = null;
      if (req.body?.convertToOrder === true) {
        const existingConvertedOrderId = normalizeStr(prev.convertedOrderId, 128);
        if (existingConvertedOrderId) {
          const exOrderSnap = await db.doc(`lab_orders/${existingConvertedOrderId}`).get();
          if (exOrderSnap.exists) {
            convertedOrder = serializeDoc(exOrderSnap.data());
          }
        }
        if (!convertedOrder) {
          const dupSnap = await db
            .collection('lab_orders')
            .where('labUid', '==', actor.labUid)
            .where('sourceBookingId', '==', bookingId)
            .limit(1)
            .get();
          if (!dupSnap.empty) {
            convertedOrder = serializeDoc(dupSnap.docs[0].data());
          }
        }

        if (!convertedOrder) {
          const patientUid = String(prev.patientUid || '');
          const patQuery = patientUid
            ? await db
                .collection('lab_patients')
                .where('labUid', '==', actor.labUid)
                .where('linkedPatientUid', '==', patientUid)
                .limit(1)
                .get()
            : null;

          let patientRecordId = '';
          if (patQuery && !patQuery.empty) {
            patientRecordId = patQuery.docs[0].id;
            await patQuery.docs[0].ref.update({
              totalOrders: FieldValue.increment(1),
              lastOrderDate: nowIso,
              updatedAt: nowIso,
            });
          } else {
            const allPats = await db.collection('lab_patients').where('labUid', '==', actor.labUid).limit(400).get();
            patientRecordId = safeId('lpat');
            await db.doc(`lab_patients/${patientRecordId}`).set({
              patientRecordId,
              fileNumber: `LAB-P-${String(allPats.size + 1).padStart(4, '0')}`,
              labUid: actor.labUid,
              institutionId: actor.institutionId,
              ...(patientUid ? { linkedPatientUid: patientUid } : {}),
              fullName: String(prev.patientName || 'مريض'),
              phone: String(prev.patientPhone || ''),
              gender: 'unspecified',
              totalOrders: 1,
              lastOrderDate: nowIso,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }

          const testsSnap = await db.collection('lab_tests').where('labUid', '==', actor.labUid).limit(200).get();
          const catalogByName = new Map<string, Record<string, unknown>>();
          testsSnap.docs.forEach((d) => {
            const td = serializeDoc(d.data());
            catalogByName.set(String(td.nameAr || '').toLowerCase(), td);
            catalogByName.set(String(td.nameEn || '').toLowerCase(), td);
          });

          const reqServices = Array.isArray(prev.requestedServices) ? (prev.requestedServices as string[]) : [];
          const orderTests = reqServices.map((svc) => {
            const match = catalogByName.get(String(svc).toLowerCase());
            return {
              testId: match ? String(match.testId || '') : safeId('lt'),
              code: match ? String(match.code || 'LAB') : 'LAB',
              nameAr: match ? String(match.nameAr || svc) : svc,
              nameEn: match ? String(match.nameEn || svc) : svc,
              sampleType: match ? String(match.sampleType || 'serum') : 'serum',
              unit: match ? String(match.unit || '') : '',
              referenceRangeText: match ? String(match.referenceRangeText || '') : '',
              priceIqd: match ? numOrZero(match.priceIqd) : 0,
              inventoryConsumed: false,
            };
          });

          const orderId = safeId('lord');
          const orderNumber = makeHumanCode('ORD');
          const totalAmountIqd = orderTests.reduce((s, t) => s + t.priceIqd, 0);
          convertedOrder = {
            orderId,
            orderNumber,
            labUid: actor.labUid,
            institutionId: actor.institutionId,
            patientRecordId,
            patientName: String(prev.patientName || ''),
            patientPhone: String(prev.patientPhone || ''),
            ...(patientUid ? { linkedPatientUid: patientUid } : {}),
            sourceBookingId: bookingId,
            priority: 'routine',
            status: 'ordered',
            tests: orderTests,
            totalAmountIqd,
            discountIqd: 0,
            homeCollectionFeeIqd: 0,
            netAmountIqd: totalAmountIqd,
            clinicalNotes: String(prev.notes || ''),
            inventoryConsumedAt: null,
            inventoryReversedAt: null,
            createdByUid: actor.uid,
            createdByName: actor.name,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          await db.doc(`lab_orders/${orderId}`).set(convertedOrder);
        }

        const convId = String(convertedOrder.orderId || '');
        const convNum = String(convertedOrder.orderNumber || '');
        const bookingConvertPatch: Record<string, unknown> = {
          convertedOrderId: convId,
          convertedOrderNumber: convNum,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!status && (prev.status === 'pending' || prev.status === 'confirmed')) {
          bookingConvertPatch.status = 'in_progress';
        }
        await ref.update(bookingConvertPatch);
      }

      const updated = await ref.get();
      res.json({ ok: true, booking: serializeDoc(updated.data()), order: convertedOrder });
    } catch (err) {
      console.error('[MEDORA][UpdateLabBooking] error:', err);
      res.status(500).json({ error: 'LAB_BOOKING_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Results Entry, PDF/Image Attachments, Approval Gate & Documented Corrections
  // ---------------------------------------------------------------------------
  router.post('/lab/results', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['enterResults', 'approveResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.body?.orderId, 128);
    const submitForApproval = req.body?.submitForApproval !== false;
    const summaryNote = normalizeStr(req.body?.summaryNote, 1500);
    const attachments = sanitizeAttachments(req.body?.attachments);
    const rawAnalytes = Array.isArray(req.body?.analytes) ? req.body.analytes : [];
    const analytes = rawAnalytes
      .slice(0, 80)
      .map((a: unknown) => {
        const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        const testName = normalizeStr(rec.testName, 160);
        const value = normalizeStr(rec.value, 160);
        if (!testName) return null;
        const flagRaw = normalizeStr(rec.flag, 20);
        const flag = ['normal', 'high', 'low', 'critical', 'abnormal'].includes(flagRaw) ? flagRaw : 'normal';
        return {
          testId: normalizeStr(rec.testId, 128),
          testName,
          value,
          unit: normalizeStr(rec.unit, 60),
          referenceRange: normalizeStr(rec.referenceRange, 240),
          flag,
          comment: normalizeStr(rec.comment, 300),
        };
      })
      .filter((x: unknown): x is NonNullable<typeof x> => Boolean(x));

    if (!orderId || (analytes.length === 0 && attachments.length === 0)) {
      res.status(400).json({ error: 'INVALID_RESULT_INPUT' });
      return;
    }

    try {
      const orderRef = db.doc(`lab_orders/${orderId}`);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists || orderSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_ORDER_NOT_FOUND' });
        return;
      }
      const order = serializeDoc(orderSnap.data());
      const patSnap = await db.doc(`lab_patients/${String(order.patientRecordId || '')}`).get();
      const pat = patSnap.exists ? serializeDoc(patSnap.data()) : {};

      const existingSnap = await db
        .collection('lab_results')
        .where('labUid', '==', actor.labUid)
        .where('orderId', '==', orderId)
        .limit(1)
        .get();

      const nowIso = new Date().toISOString();
      const nextStatus = submitForApproval ? 'pending_approval' : 'draft';

      if (!existingSnap.empty) {
        const resDoc = existingSnap.docs[0];
        const prev = resDoc.data() as Record<string, unknown>;
        if (prev.status === 'approved' || prev.status === 'corrected') {
          res.status(409).json({
            error: 'APPROVED_RESULT_IMMUTABLE_USE_CORRECTION',
          });
          return;
        }
        await resDoc.ref.update({
          analytes,
          summaryNote,
          attachments,
          status: nextStatus,
          enteredByUid: actor.uid,
          enteredByName: actor.name,
          enteredAt: nowIso,
          updatedAt: nowIso,
        });
        if (submitForApproval && order.status !== 'approved') {
          await orderRef.update({ status: 'result_entered', updatedAt: nowIso });
        }
        const refreshed = await resDoc.ref.get();
        res.json({ ok: true, result: serializeDoc(refreshed.data()) });
        return;
      }

      const resultId = safeId('lres');
      const reportNumber = makeHumanCode('RPT');
      const payload = {
        resultId,
        reportNumber,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        labNameAr: actor.labNameAr,
        labNameEn: normalizeStr(actor.labProfile.labNameEn, 160),
        labPhone: normalizeStr(actor.labProfile.professionalPhone, 32),
        labAddress: `${normalizeStr(actor.labProfile.governorate, 80)} · ${normalizeStr(actor.labProfile.district, 80)} — ${normalizeStr(actor.labProfile.address, 200)}`,
        orderId,
        orderNumber: String(order.orderNumber || ''),
        patientRecordId: String(order.patientRecordId || ''),
        patientName: String(order.patientName || ''),
        patientPhone: String(order.patientPhone || ''),
        ...(typeof pat.age === 'number' ? { patientAge: pat.age } : {}),
        ...(pat.gender ? { patientGender: String(pat.gender) } : {}),
        ...(order.linkedPatientUid ? { linkedPatientUid: String(order.linkedPatientUid) } : {}),
        ...(order.sourceBookingId ? { sourceBookingId: String(order.sourceBookingId) } : {}),
        ...(order.sourceDiagnosticOrderId ? { sourceDiagnosticOrderId: String(order.sourceDiagnosticOrderId) } : {}),
        ...(order.doctorUid || order.requestingDoctorUid
          ? {
              doctorUid: String(order.doctorUid || order.requestingDoctorUid),
              requestingDoctorUid: String(order.doctorUid || order.requestingDoctorUid),
            }
          : {}),
        analytes,
        summaryNote,
        attachments,
        status: nextStatus,
        enteredByUid: actor.uid,
        enteredByName: actor.name,
        enteredAt: nowIso,
        publishedToPatient: false,
        revisionCount: 0,
        revisionHistory: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const batch = db.batch();
      batch.set(db.doc(`lab_results/${resultId}`), payload);
      if (submitForApproval) {
        batch.update(orderRef, { status: 'result_entered', updatedAt: nowIso });
      }
      await batch.commit();

      if (submitForApproval) {
        await emitLabNotification(db, {
          labUid: actor.labUid,
          type: 'result_approval',
          eventType: 'lab_order_status_updated',
          title: `نتيجة بانتظار الاعتماد: ${String(order.patientName || '')}`,
          body: `تقرير ${reportNumber} للطلب ${String(order.orderNumber || '')} جاهز للمراجعة والاعتماد.`,
          relatedId: resultId,
          idempotencyKey: `lab_res_pend:${resultId}`,
        });
      }

      res.status(201).json({ ok: true, result: payload });
    } catch (err) {
      console.error('[MEDORA][SaveLabResult] error:', err);
      res.status(500).json({ error: 'LAB_RESULT_SAVE_FAILED' });
    }
  });

  router.post('/lab/results/:resultId/approve', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['approveResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const resultId = normalizeStr(req.params.resultId, 128);
    const publishToPatient = req.body?.publishToPatient === true;

    try {
      const ref = db.doc(`lab_results/${resultId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_RESULT_NOT_FOUND' });
        return;
      }
      const prev = serializeDoc(snap.data());
      const nowIso = new Date().toISOString();

      const batch = db.batch();
      batch.update(ref, {
        status: 'approved',
        approvedByUid: actor.uid,
        approvedByName: actor.name,
        approvedAt: nowIso,
        ...(publishToPatient ? { publishedToPatient: true, publishedAt: nowIso } : {}),
        updatedAt: nowIso,
      });

      if (prev.orderId) {
        batch.update(db.doc(`lab_orders/${String(prev.orderId)}`), {
          status: 'approved',
          updatedAt: nowIso,
        });
      }

      if (publishToPatient && prev.sourceBookingId) {
        const bRef = db.doc(`lab_bookings/${String(prev.sourceBookingId)}`);
        const bSnap = await bRef.get();
        if (bSnap.exists && bSnap.data()?.facilityUid === actor.labUid) {
          const analyteLines = Array.isArray(prev.analytes)
            ? (prev.analytes as Array<Record<string, unknown>>)
                .slice(0, 6)
                .map((a) => `${String(a.testName)}: ${String(a.value)} ${String(a.unit || '')}`)
                .join(' | ')
            : '';
          batch.update(bRef, {
            status: 'completed',
            resultSummary: normalizeStr(String(prev.summaryNote || analyteLines || 'تم اعتماد نتيجة التحليل'), 1000),
            resultFiles: Array.isArray(prev.attachments) ? prev.attachments : [],
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      await batch.commit();

      if (publishToPatient && prev.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: String(prev.linkedPatientUid),
          type: 'lab_result',
          eventType: 'lab_result_available',
          title: `نتائج المختبر جاهزة — ${actor.labNameAr}`,
          body: `تم اعتماد ونشر تقرير التحليل رقم ${String(prev.reportNumber || '')} في سجلك الصحي.`,
          relatedId: resultId,
          relatedType: 'lab_result',
          idempotencyKey: `pat_lres_app:${resultId}`,
        });
      }

      const linkedDoctorUid = normalizeStr(prev.doctorUid || prev.requestingDoctorUid, 128);
      if (linkedDoctorUid) {
        const docResEngine = getGlobalNotificationEngine();
        if (docResEngine) {
          const isLinkedDiag = Boolean(prev.sourceDiagnosticOrderId);
          await docResEngine
            .dispatch({
              eventType: isLinkedDiag ? 'diagnostic_report_received' : 'lab_result_received',
              recipientUid: linkedDoctorUid,
              recipientRole: 'doctor',
              sourceOrderDoctorUid: linkedDoctorUid,
              title: `نتيجة مختبر معتمدة للمريض ${String(prev.patientName || '')}`,
              body: `تم اعتماد تقرير ${String(prev.reportNumber || '')} من ${actor.labNameAr}.`,
              inAppType: 'lab_result',
              relatedId: String(prev.sourceDiagnosticOrderId || resultId),
              relatedType: 'lab_result',
              idempotencyKey: `doc_lres_app:${resultId}`,
              placeholders: {
                refCode: String(prev.reportNumber || resultId).slice(0, 16).toUpperCase(),
                statusLabel: 'تقرير معتمد',
                dateLabel: nowIso.slice(0, 10),
              },
            })
            .catch(() => undefined);
        }
      }

      await writeLabAudit(db, actor, {
        action: 'LAB_RESULT_APPROVED',
        targetType: 'lab_results',
        targetId: resultId,
        details: `Approved result ${String(prev.reportNumber || resultId)}${publishToPatient ? ' & published to patient' : ''}`,
      });

      const refreshed = await ref.get();
      res.json({ ok: true, result: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][ApproveLabResult] error:', err);
      res.status(500).json({ error: 'LAB_RESULT_APPROVE_FAILED' });
    }
  });

  router.post('/lab/results/:resultId/publish', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['approveResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const resultId = normalizeStr(req.params.resultId, 128);

    try {
      const ref = db.doc(`lab_results/${resultId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_RESULT_NOT_FOUND' });
        return;
      }
      const prev = serializeDoc(snap.data());
      if (prev.status !== 'approved' && prev.status !== 'corrected') {
        res.status(409).json({ error: 'RESULT_MUST_BE_APPROVED_FIRST' });
        return;
      }

      const nowIso = new Date().toISOString();
      await ref.update({
        publishedToPatient: true,
        publishedAt: nowIso,
        updatedAt: nowIso,
      });

      if (prev.sourceBookingId) {
        const bRef = db.doc(`lab_bookings/${String(prev.sourceBookingId)}`);
        const bSnap = await bRef.get();
        if (bSnap.exists && bSnap.data()?.facilityUid === actor.labUid) {
          await bRef.update({
            status: 'completed',
            resultSummary: normalizeStr(String(prev.summaryNote || 'تم اعتماد ونشر نتيجة التحليل'), 1000),
            resultFiles: Array.isArray(prev.attachments) ? prev.attachments : [],
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      if (prev.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: String(prev.linkedPatientUid),
          type: 'lab_result',
          eventType: 'lab_result_available',
          title: `تحديث نتيجة المختبر — ${actor.labNameAr}`,
          body: `تم نشر تقرير التحليل رقم ${String(prev.reportNumber || '')} في بوابة المريض.`,
          relatedId: resultId,
          relatedType: 'lab_result',
          idempotencyKey: `pat_lres_pub:${resultId}`,
        });
      }

      const pubDoctorUid = normalizeStr(prev.doctorUid || prev.requestingDoctorUid, 128);
      if (pubDoctorUid) {
        const docPubEngine = getGlobalNotificationEngine();
        if (docPubEngine) {
          const isLinkedDiag = Boolean(prev.sourceDiagnosticOrderId);
          await docPubEngine
            .dispatch({
              eventType: isLinkedDiag ? 'diagnostic_report_received' : 'lab_result_received',
              recipientUid: pubDoctorUid,
              recipientRole: 'doctor',
              sourceOrderDoctorUid: pubDoctorUid,
              title: `تقرير مختبري جاهز للمراجعة — ${String(prev.patientName || '')}`,
              body: `تقرير ${String(prev.reportNumber || '')} من ${actor.labNameAr} أصبح منشوراً للمريض.`,
              inAppType: 'lab_result',
              relatedId: String(prev.sourceDiagnosticOrderId || resultId),
              relatedType: 'lab_result',
              idempotencyKey: `doc_lres_pub:${resultId}`,
              placeholders: {
                refCode: String(prev.reportNumber || resultId).slice(0, 16).toUpperCase(),
                statusLabel: 'منشور',
                dateLabel: nowIso.slice(0, 10),
              },
            })
            .catch(() => undefined);
        }
      }

      const refreshed = await ref.get();
      res.json({ ok: true, result: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][PublishLabResult] error:', err);
      res.status(500).json({ error: 'LAB_RESULT_PUBLISH_FAILED' });
    }
  });

  router.post('/lab/results/:resultId/correct', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['approveResults']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const resultId = normalizeStr(req.params.resultId, 128);
    const correctionReason = normalizeStr(req.body?.correctionReason, 500);
    const summaryNote = normalizeStr(req.body?.summaryNote, 1500);
    const rawAnalytes = Array.isArray(req.body?.analytes) ? req.body.analytes : [];
    const attachments = req.body?.attachments !== undefined ? sanitizeAttachments(req.body.attachments) : undefined;

    const analytes = rawAnalytes
      .slice(0, 80)
      .map((a: unknown) => {
        const rec = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
        const testName = normalizeStr(rec.testName, 160);
        const value = normalizeStr(rec.value, 160);
        if (!testName) return null;
        const flagRaw = normalizeStr(rec.flag, 20);
        const flag = ['normal', 'high', 'low', 'critical', 'abnormal'].includes(flagRaw) ? flagRaw : 'normal';
        return {
          testId: normalizeStr(rec.testId, 128),
          testName,
          value,
          unit: normalizeStr(rec.unit, 60),
          referenceRange: normalizeStr(rec.referenceRange, 240),
          flag,
          comment: normalizeStr(rec.comment, 300),
        };
      })
      .filter((x: unknown): x is NonNullable<typeof x> => Boolean(x));

    if (!resultId || correctionReason.length < 3 || analytes.length === 0) {
      res.status(400).json({ error: 'CORRECTION_REASON_AND_ANALYTES_REQUIRED' });
      return;
    }

    try {
      const ref = db.doc(`lab_results/${resultId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_RESULT_NOT_FOUND' });
        return;
      }
      const prev = serializeDoc(snap.data());
      if (prev.status !== 'approved' && prev.status !== 'corrected') {
        res.status(409).json({ error: 'ONLY_APPROVED_RESULTS_USE_CORRECTION' });
        return;
      }

      const prevHistory = Array.isArray(prev.revisionHistory) ? (prev.revisionHistory as Array<Record<string, unknown>>) : [];
      const nextRevNum = prevHistory.length + 1;
      const nowIso = new Date().toISOString();

      const revisionEntry = {
        revisionNumber: nextRevNum,
        reason: correctionReason,
        previousAnalytes: Array.isArray(prev.analytes) ? prev.analytes : [],
        previousSummary: String(prev.summaryNote || ''),
        editedByUid: actor.uid,
        editedByName: actor.name,
        editedAt: nowIso,
      };

      await ref.update({
        analytes,
        summaryNote,
        ...(attachments !== undefined ? { attachments } : {}),
        status: 'corrected',
        revisionCount: nextRevNum,
        revisionHistory: [...prevHistory, revisionEntry],
        approvedByUid: actor.uid,
        approvedByName: actor.name,
        approvedAt: nowIso,
        updatedAt: nowIso,
      });

      await writeLabAudit(db, actor, {
        action: 'LAB_RESULT_CORRECTED',
        targetType: 'lab_results',
        targetId: resultId,
        details: `Amended approved result ${String(prev.reportNumber || resultId)} (#${nextRevNum}): ${correctionReason}`,
      });

      const refreshed = await ref.get();
      res.json({ ok: true, result: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][CorrectLabResult] error:', err);
      res.status(500).json({ error: 'LAB_RESULT_CORRECT_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Invoices & Local Payments
  // ---------------------------------------------------------------------------
  router.post('/lab/invoices', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['billing', 'reception']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const orderId = normalizeStr(req.body?.orderId, 128);
    const orderNumber = normalizeStr(req.body?.orderNumber, 60);
    const discountIqd = numOrZero(req.body?.discountIqd);
    const homeCollectionFeeIqd = numOrZero(req.body?.homeCollectionFeeIqd);
    const notes = normalizeStr(req.body?.notes, 400);
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
    interface ParsedInvoiceItem {
      description: string;
      quantity: number;
      unitPriceIqd: number;
      totalIqd: number;
    }
    const items: ParsedInvoiceItem[] = rawItems
      .slice(0, 40)
      .map((i: unknown): ParsedInvoiceItem | null => {
        const rec = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
        const description = normalizeStr(rec.description, 160);
        const quantity = Math.max(1, Math.round(numOrZero(rec.quantity, 500) || 1));
        const unitPriceIqd = numOrZero(rec.unitPriceIqd);
        if (!description) return null;
        return {
          description,
          quantity,
          unitPriceIqd,
          totalIqd: Math.round(quantity * unitPriceIqd * 100) / 100,
        };
      })
      .filter((x): x is ParsedInvoiceItem => x !== null);

    if (!patientRecordId || items.length === 0) {
      res.status(400).json({ error: 'INVALID_INVOICE_INPUT' });
      return;
    }

    try {
      const patSnap = await db.doc(`lab_patients/${patientRecordId}`).get();
      if (!patSnap.exists || patSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'LAB_PATIENT_NOT_FOUND' });
        return;
      }
      const pat = serializeDoc(patSnap.data());
      const subtotalIqd = items.reduce((s, it) => s + it.totalIqd, 0);
      const totalIqd = Math.max(0, subtotalIqd - discountIqd + homeCollectionFeeIqd);
      const paidNow = Math.min(totalIqd, numOrZero(req.body?.initialPaidIqd));
      const balanceIqd = Math.max(0, totalIqd - paidNow);
      const status = balanceIqd === 0 ? 'paid' : paidNow > 0 ? 'partial' : 'unpaid';

      const invoiceId = safeId('linv');
      const invoiceNumber = makeHumanCode('INV');
      const nowIso = new Date().toISOString();

      const invoicePayload = {
        invoiceId,
        invoiceNumber,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        labNameAr: actor.labNameAr,
        labPhone: normalizeStr(actor.labProfile.professionalPhone, 32),
        labAddress: `${normalizeStr(actor.labProfile.governorate, 80)} · ${normalizeStr(actor.labProfile.district, 80)} — ${normalizeStr(actor.labProfile.address, 200)}`,
        ...(orderId ? { orderId } : {}),
        ...(orderNumber ? { orderNumber } : {}),
        patientRecordId,
        patientName: String(pat.fullName || ''),
        patientPhone: String(pat.phone || ''),
        items,
        subtotalIqd,
        discountIqd,
        homeCollectionFeeIqd,
        totalIqd,
        paidIqd: paidNow,
        balanceIqd,
        status,
        notes,
        createdByUid: actor.uid,
        createdByName: actor.name,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const batch = db.batch();
      batch.set(db.doc(`lab_invoices/${invoiceId}`), invoicePayload);
      let paymentPayload: Record<string, unknown> | null = null;
      if (paidNow > 0) {
        const paymentId = safeId('lpay');
        paymentPayload = {
          paymentId,
          receiptNumber: makeHumanCode('RCPT'),
          labUid: actor.labUid,
          invoiceId,
          invoiceNumber,
          patientName: String(pat.fullName || ''),
          amountIqd: paidNow,
          method: req.body?.method === 'card_pos' || req.body?.method === 'bank_transfer' ? req.body.method : 'cash',
          referenceNote: normalizeStr(req.body?.referenceNote, 200),
          receivedByUid: actor.uid,
          receivedByName: actor.name,
          paidAt: nowIso,
          createdAt: nowIso,
        };
        batch.set(db.doc(`lab_payments/${paymentId}`), paymentPayload);
      }
      await batch.commit();

      res.status(201).json({ ok: true, invoice: invoicePayload, payment: paymentPayload });
    } catch (err) {
      console.error('[MEDORA][CreateInvoice] error:', err);
      res.status(500).json({ error: 'LAB_INVOICE_CREATE_FAILED' });
    }
  });

  router.post('/lab/invoices/:invoiceId/payments', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['billing']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const invoiceId = normalizeStr(req.params.invoiceId, 128);
    const amountIqd = numOrZero(req.body?.amountIqd);
    const method = req.body?.method === 'card_pos' || req.body?.method === 'bank_transfer' ? req.body.method : 'cash';
    const referenceNote = normalizeStr(req.body?.referenceNote, 240);

    if (!invoiceId || amountIqd <= 0) {
      res.status(400).json({ error: 'INVALID_PAYMENT_INPUT' });
      return;
    }

    try {
      const invRef = db.doc(`lab_invoices/${invoiceId}`);
      const paymentId = safeId('lpay');
      const nowIso = new Date().toISOString();
      let createdPayment: Record<string, unknown> | null = null;

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(invRef);
        if (!snap.exists || snap.data()?.labUid !== actor.labUid) throw new Error('INVOICE_NOT_FOUND');
        const inv = snap.data() as Record<string, unknown>;
        if (inv.status === 'void') throw new Error('INVOICE_VOIDED');
        const total = Number(inv.totalIqd || 0);
        const currentPaid = Number(inv.paidIqd || 0);
        const applied = Math.min(Math.max(0, total - currentPaid), amountIqd);
        if (applied <= 0) throw new Error('INVOICE_ALREADY_PAID');

        const nextPaid = Math.round((currentPaid + applied) * 100) / 100;
        const nextBalance = Math.max(0, Math.round((total - nextPaid) * 100) / 100);
        const nextStatus = nextBalance === 0 ? 'paid' : 'partial';

        tx.update(invRef, {
          paidIqd: nextPaid,
          balanceIqd: nextBalance,
          status: nextStatus,
          updatedAt: nowIso,
        });

        createdPayment = {
          paymentId,
          receiptNumber: makeHumanCode('RCPT'),
          labUid: actor.labUid,
          invoiceId,
          invoiceNumber: String(inv.invoiceNumber || ''),
          patientName: String(inv.patientName || ''),
          amountIqd: applied,
          method,
          referenceNote,
          receivedByUid: actor.uid,
          receivedByName: actor.name,
          paidAt: nowIso,
          createdAt: nowIso,
        };
        tx.set(db.doc(`lab_payments/${paymentId}`), createdPayment);
      });

      const refreshed = await invRef.get();
      res.status(201).json({ ok: true, invoice: serializeDoc(refreshed.data()), payment: createdPayment });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'INVOICE_NOT_FOUND') {
          res.status(404).json({ error: 'INVOICE_NOT_FOUND' });
          return;
        }
        if (err.message === 'INVOICE_ALREADY_PAID' || err.message === 'INVOICE_VOIDED') {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      console.error('[MEDORA][RecordPayment] error:', err);
      res.status(500).json({ error: 'LAB_PAYMENT_FAILED' });
    }
  });

  router.patch('/lab/invoices/:invoiceId/void', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['billing']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const invoiceId = normalizeStr(req.params.invoiceId, 128);
    try {
      const ref = db.doc(`lab_invoices/${invoiceId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'INVOICE_NOT_FOUND' });
        return;
      }
      await ref.update({ status: 'void', updatedAt: new Date().toISOString() });
      const updated = await ref.get();
      res.json({ ok: true, invoice: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][VoidInvoice] error:', err);
      res.status(500).json({ error: 'INVOICE_VOID_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Lab Staff & Granular Permissions (Lab Manager Only)
  // ---------------------------------------------------------------------------
  router.post('/lab/staff', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const email = normalizeStr(req.body?.email, 160).toLowerCase();
    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const roleTitle = normalizeStr(req.body?.roleTitle, 100) || 'فني مختبر';
    const permissions = sanitizePermissions(req.body?.permissions);

    if (!email || !email.includes('@') || fullName.length < 2) {
      res.status(400).json({ error: 'INVALID_STAFF_INPUT' });
      return;
    }

    try {
      const existing = await db
        .collection('lab_staff')
        .where('labUid', '==', actor.labUid)
        .where('email', '==', email)
        .limit(1)
        .get();

      let matchedUid = '';
      try {
        const userRecord = await deps.adminAuth.getUserByEmail(email);
        matchedUid = userRecord.uid || '';
      } catch {
        // Staff member may sign in with Google later; auto-binds upon login
      }

      const nowIso = new Date().toISOString();
      if (!existing.empty) {
        const docRef = existing.docs[0].ref;
        await docRef.update({
          fullName,
          phone,
          roleTitle,
          permissions,
          status: 'active',
          ...(matchedUid ? { uid: matchedUid } : {}),
          updatedAt: nowIso,
        });
        const updated = await docRef.get();
        res.json({ ok: true, staffMember: serializeDoc(updated.data()) });
        return;
      }

      const staffId = safeId('lstf');
      const payload = {
        staffId,
        labUid: actor.labUid,
        institutionId: actor.institutionId,
        ...(matchedUid ? { uid: matchedUid } : {}),
        email,
        fullName,
        phone,
        roleTitle,
        status: 'active',
        permissions,
        createdByUid: actor.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.doc(`lab_staff/${staffId}`).set(payload);
      await writeLabAudit(db, actor, {
        action: 'LAB_STAFF_ADDED',
        targetType: 'lab_staff',
        targetId: staffId,
        details: `Added staff ${fullName} (${email}) with ${permissions.length} permission(s)`,
      });
      res.status(201).json({ ok: true, staffMember: payload });
    } catch (err) {
      console.error('[MEDORA][CreateLabStaff] error:', err);
      res.status(500).json({ error: 'LAB_STAFF_CREATE_FAILED' });
    }
  });

  router.patch('/lab/staff/:staffId', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const staffId = normalizeStr(req.params.staffId, 128);
    try {
      const ref = db.doc(`lab_staff/${staffId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'STAFF_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body?.fullName !== undefined) patch.fullName = normalizeStr(req.body.fullName, 120);
      if (req.body?.phone !== undefined) patch.phone = normalizeStr(req.body.phone, 32);
      if (req.body?.roleTitle !== undefined) patch.roleTitle = normalizeStr(req.body.roleTitle, 100);
      if (req.body?.permissions !== undefined) patch.permissions = sanitizePermissions(req.body.permissions);
      if (['active', 'suspended', 'revoked'].includes(String(req.body?.status))) {
        patch.status = String(req.body.status);
      }
      await ref.update(patch);
      const updated = await ref.get();
      res.json({ ok: true, staffMember: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateLabStaff] error:', err);
      res.status(500).json({ error: 'LAB_STAFF_UPDATE_FAILED' });
    }
  });

  router.post('/lab/staff/:staffId/revoke', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const staffId = normalizeStr(req.params.staffId, 128);
    try {
      const ref = db.doc(`lab_staff/${staffId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'STAFF_NOT_FOUND' });
        return;
      }
      await ref.update({ status: 'revoked', permissions: [], updatedAt: new Date().toISOString() });
      await writeLabAudit(db, actor, {
        action: 'LAB_STAFF_REVOKED',
        targetType: 'lab_staff',
        targetId: staffId,
        details: `Revoked staff ${String(snap.data()?.fullName || staffId)}`,
      });
      res.json({ ok: true, staffId });
    } catch (err) {
      console.error('[MEDORA][RevokeLabStaff] error:', err);
      res.status(500).json({ error: 'LAB_STAFF_REVOKE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Inventory, Reagents, Test Consumption Recipes, Manual Adjustments & POs
  // ---------------------------------------------------------------------------
  router.post('/lab/inventory', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const name = normalizeStr(req.body?.name, 160);
    const code = normalizeStr(req.body?.code, 60) || makeHumanCode('ITM');
    const category = ['reagent', 'consumable', 'kit', 'control'].includes(String(req.body?.category))
      ? String(req.body.category)
      : 'reagent';
    const unit = normalizeStr(req.body?.unit, 40) || 'مل / اختبار';
    const quantity = numOrZero(req.body?.quantity);
    const minThreshold = numOrZero(req.body?.minThreshold);
    const lotNumber = normalizeStr(req.body?.lotNumber, 80) || 'LOT-STD';
    const expiryDate = normalizeStr(req.body?.expiryDate, 20);
    const unitCostIqd = numOrZero(req.body?.unitCostIqd);

    if (name.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) {
      res.status(400).json({ error: 'INVALID_INVENTORY_ITEM_INPUT' });
      return;
    }

    const itemId = safeId('litm');
    const nowIso = new Date().toISOString();
    const payload = {
      itemId,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      name,
      code,
      category,
      unit,
      quantity,
      minThreshold,
      lotNumber,
      expiryDate,
      supplierId: normalizeStr(req.body?.supplierId, 128),
      supplierName: normalizeStr(req.body?.supplierName, 140),
      unitCostIqd,
      notes: normalizeStr(req.body?.notes, 400),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      const batch = db.batch();
      batch.set(db.doc(`lab_inventory_items/${itemId}`), payload);
      if (quantity > 0) {
        const movId = safeId('smov');
        batch.set(db.doc(`lab_stock_movements/${movId}`), {
          movementId: movId,
          labUid: actor.labUid,
          itemId,
          itemName: name,
          movementType: 'manual_adjustment',
          quantityDelta: quantity,
          balanceAfter: quantity,
          reason: 'رصيد افتتاحي للمادة المخزنية',
          actorUid: actor.uid,
          actorName: actor.name,
          createdAt: nowIso,
        });
      }
      await batch.commit();
      res.status(201).json({ ok: true, item: payload });
    } catch (err) {
      console.error('[MEDORA][CreateInventoryItem] error:', err);
      res.status(500).json({ error: 'INVENTORY_CREATE_FAILED' });
    }
  });

  router.patch('/lab/inventory/:itemId', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const itemId = normalizeStr(req.params.itemId, 128);
    try {
      const ref = db.doc(`lab_inventory_items/${itemId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND' });
        return;
      }
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (req.body?.name !== undefined) patch.name = normalizeStr(req.body.name, 160);
      if (req.body?.unit !== undefined) patch.unit = normalizeStr(req.body.unit, 40);
      if (req.body?.minThreshold !== undefined) patch.minThreshold = numOrZero(req.body.minThreshold);
      if (req.body?.lotNumber !== undefined) patch.lotNumber = normalizeStr(req.body.lotNumber, 80);
      if (req.body?.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.expiryDate))) {
        patch.expiryDate = String(req.body.expiryDate);
      }
      if (req.body?.unitCostIqd !== undefined) patch.unitCostIqd = numOrZero(req.body.unitCostIqd);
      if (req.body?.notes !== undefined) patch.notes = normalizeStr(req.body.notes, 400);
      await ref.update(patch);
      const updated = await ref.get();
      res.json({ ok: true, item: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateInventoryItem] error:', err);
      res.status(500).json({ error: 'INVENTORY_UPDATE_FAILED' });
    }
  });

  router.post('/lab/inventory/:itemId/adjust', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const itemId = normalizeStr(req.params.itemId, 128);
    const rawDelta = Number(req.body?.delta);
    const reason = normalizeStr(req.body?.reason, 300);

    if (!itemId || !Number.isFinite(rawDelta) || rawDelta === 0 || reason.length < 2) {
      res.status(400).json({ error: 'INVALID_STOCK_ADJUSTMENT' });
      return;
    }

    try {
      const ref = db.doc(`lab_inventory_items/${itemId}`);
      const nowIso = new Date().toISOString();
      let movement: Record<string, unknown> | null = null;

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()?.labUid !== actor.labUid) throw new Error('ITEM_NOT_FOUND');
        const current = Number(snap.data()?.quantity || 0);
        const next = Math.max(0, Math.round((current + rawDelta) * 100) / 100);
        const actualDelta = Math.round((next - current) * 100) / 100;
        tx.update(ref, { quantity: next, updatedAt: nowIso });

        const movId = safeId('smov');
        movement = {
          movementId: movId,
          labUid: actor.labUid,
          itemId,
          itemName: String(snap.data()?.name || ''),
          movementType: actualDelta < 0 ? 'manual_out' : 'manual_adjustment',
          quantityDelta: actualDelta,
          balanceAfter: next,
          reason,
          actorUid: actor.uid,
          actorName: actor.name,
          createdAt: nowIso,
        };
        tx.set(db.doc(`lab_stock_movements/${movId}`), movement);
      });

      const updated = await ref.get();
      res.json({ ok: true, item: serializeDoc(updated.data()), movement });
    } catch (err) {
      if (err instanceof Error && err.message === 'ITEM_NOT_FOUND') {
        res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND' });
        return;
      }
      console.error('[MEDORA][AdjustInventory] error:', err);
      res.status(500).json({ error: 'INVENTORY_ADJUST_FAILED' });
    }
  });

  router.post('/lab/recipes', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const testId = normalizeStr(req.body?.testId, 128);
    const testName = normalizeStr(req.body?.testName, 160);
    const rawMats = Array.isArray(req.body?.materials) ? req.body.materials : [];
    const materials = rawMats
      .slice(0, 30)
      .map((m: unknown) => {
        const rec = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
        const itemId = normalizeStr(rec.itemId, 128);
        const itemName = normalizeStr(rec.itemName, 160);
        const quantityPerTest = numOrZero(rec.quantityPerTest, 10000);
        if (!itemId || quantityPerTest <= 0) return null;
        return {
          itemId,
          itemName,
          unit: normalizeStr(rec.unit, 40),
          quantityPerTest,
        };
      })
      .filter((x: unknown): x is NonNullable<typeof x> => Boolean(x));

    if (!testId || materials.length === 0) {
      res.status(400).json({ error: 'INVALID_RECIPE_INPUT' });
      return;
    }

    try {
      const recipeId = `rec_${actor.labUid}_${testId}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
      const payload = {
        recipeId,
        labUid: actor.labUid,
        testId,
        testName,
        materials,
        updatedByUid: actor.uid,
        updatedAt: new Date().toISOString(),
      };
      await db.doc(`lab_test_recipes/${recipeId}`).set(payload);
      res.json({ ok: true, recipe: payload });
    } catch (err) {
      console.error('[MEDORA][SaveRecipe] error:', err);
      res.status(500).json({ error: 'RECIPE_SAVE_FAILED' });
    }
  });

  // Suppliers & Purchase Orders
  router.post('/lab/suppliers', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const name = normalizeStr(req.body?.name, 160);
    const phone = normalizeStr(req.body?.phone, 40);
    if (name.length < 2 || phone.length < 5) {
      res.status(400).json({ error: 'INVALID_SUPPLIER_INPUT' });
      return;
    }
    const supplierId = safeId('lsup');
    const nowIso = new Date().toISOString();
    const payload = {
      supplierId,
      labUid: actor.labUid,
      name,
      contactPerson: normalizeStr(req.body?.contactPerson, 120),
      phone,
      email: normalizeStr(req.body?.email, 140),
      address: normalizeStr(req.body?.address, 240),
      category: normalizeStr(req.body?.category, 100),
      notes: normalizeStr(req.body?.notes, 400),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    try {
      await db.doc(`lab_suppliers/${supplierId}`).set(payload);
      res.status(201).json({ ok: true, supplier: payload });
    } catch (err) {
      console.error('[MEDORA][CreateSupplier] error:', err);
      res.status(500).json({ error: 'SUPPLIER_CREATE_FAILED' });
    }
  });

  router.post('/lab/purchase-orders', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const supplierId = normalizeStr(req.body?.supplierId, 128);
    const supplierName = normalizeStr(req.body?.supplierName, 160);
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
    interface ParsedPoItem {
      itemId: string;
      itemName: string;
      quantity: number;
      unitCostIqd: number;
      lotNumber: string;
      expiryDate: string;
    }
    const items: ParsedPoItem[] = rawItems
      .slice(0, 40)
      .map((i: unknown): ParsedPoItem | null => {
        const rec = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
        const itemId = normalizeStr(rec.itemId, 128);
        const itemName = normalizeStr(rec.itemName, 160);
        const quantity = numOrZero(rec.quantity, 100000);
        const unitCostIqd = numOrZero(rec.unitCostIqd);
        if (!itemId || quantity <= 0) return null;
        return {
          itemId,
          itemName,
          quantity,
          unitCostIqd,
          lotNumber: normalizeStr(rec.lotNumber, 80),
          expiryDate: normalizeStr(rec.expiryDate, 20),
        };
      })
      .filter((x): x is ParsedPoItem => x !== null);

    if (!supplierId || items.length === 0) {
      res.status(400).json({ error: 'INVALID_PO_INPUT' });
      return;
    }

    const totalCostIqd = items.reduce((s, it) => s + it.quantity * it.unitCostIqd, 0);
    const poId = safeId('lpo');
    const poNumber = makeHumanCode('PO');
    const nowIso = new Date().toISOString();
    const payload = {
      poId,
      poNumber,
      labUid: actor.labUid,
      supplierId,
      supplierName,
      status: 'ordered',
      items,
      totalCostIqd,
      notes: normalizeStr(req.body?.notes, 400),
      receivedAt: null,
      createdByUid: actor.uid,
      createdByName: actor.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    try {
      await db.doc(`lab_purchase_orders/${poId}`).set(payload);
      res.status(201).json({ ok: true, purchaseOrder: payload });
    } catch (err) {
      console.error('[MEDORA][CreatePO] error:', err);
      res.status(500).json({ error: 'PO_CREATE_FAILED' });
    }
  });

  router.post('/lab/purchase-orders/:poId/receive', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['inventory']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const poId = normalizeStr(req.params.poId, 128);

    try {
      const poRef = db.doc(`lab_purchase_orders/${poId}`);
      const nowIso = new Date().toISOString();

      await db.runTransaction(async (tx) => {
        const poSnap = await tx.get(poRef);
        if (!poSnap.exists || poSnap.data()?.labUid !== actor.labUid) throw new Error('PO_NOT_FOUND');
        const po = poSnap.data() as Record<string, unknown>;
        if (po.status === 'received') throw new Error('PO_ALREADY_RECEIVED');
        if (po.status === 'cancelled') throw new Error('PO_CANCELLED');

        const items = Array.isArray(po.items) ? (po.items as Array<Record<string, unknown>>) : [];
        const refs = items.map((i) => db.doc(`lab_inventory_items/${String(i.itemId || '')}`));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));

        for (let idx = 0; idx < items.length; idx++) {
          const line = items[idx];
          const snap = snaps[idx];
          if (!snap.exists || snap.data()?.labUid !== actor.labUid) continue;
          const addQty = Number(line.quantity || 0);
          const nextQty = Math.round((Number(snap.data()?.quantity || 0) + addQty) * 100) / 100;
          const itemPatch: Record<string, unknown> = {
            quantity: nextQty,
            updatedAt: nowIso,
          };
          if (typeof line.lotNumber === 'string' && line.lotNumber) itemPatch.lotNumber = line.lotNumber;
          if (typeof line.expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(line.expiryDate)) {
            itemPatch.expiryDate = line.expiryDate;
          }
          if (Number(line.unitCostIqd || 0) > 0) itemPatch.unitCostIqd = Number(line.unitCostIqd);
          tx.update(snap.ref, itemPatch);

          const movId = safeId('smov');
          tx.set(db.doc(`lab_stock_movements/${movId}`), {
            movementId: movId,
            labUid: actor.labUid,
            itemId: snap.id,
            itemName: String(snap.data()?.name || line.itemName || ''),
            movementType: 'purchase_in',
            quantityDelta: addQty,
            balanceAfter: nextQty,
            purchaseOrderId: poId,
            reason: `استلام أمر شراء ${String(po.poNumber || poId)}`,
            actorUid: actor.uid,
            actorName: actor.name,
            createdAt: nowIso,
          });
        }

        tx.update(poRef, {
          status: 'received',
          receivedAt: nowIso,
          updatedAt: nowIso,
        });
      });

      const refreshed = await poRef.get();
      res.json({ ok: true, purchaseOrder: serializeDoc(refreshed.data()) });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'PO_NOT_FOUND') {
          res.status(404).json({ error: 'PO_NOT_FOUND' });
          return;
        }
        if (err.message === 'PO_ALREADY_RECEIVED' || err.message === 'PO_CANCELLED') {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      console.error('[MEDORA][ReceivePO] error:', err);
      res.status(500).json({ error: 'PO_RECEIVE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Reviews Replies, Notifications, Lab <-> Patient Messaging, Super Admin Thread
  // ---------------------------------------------------------------------------
  router.post('/lab/reviews/:reviewId/reply', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['messaging', 'bookings']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const reviewId = normalizeStr(req.params.reviewId, 128);
    const replyText = normalizeStr(req.body?.reply, 1000);
    if (!reviewId || replyText.length < 2) {
      res.status(400).json({ error: 'INVALID_REPLY' });
      return;
    }
    try {
      const ref = db.doc(`lab_reviews/${reviewId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'REVIEW_NOT_FOUND' });
        return;
      }
      const nowIso = new Date().toISOString();
      await ref.update({
        labReply: replyText,
        repliedByName: actor.name,
        repliedAt: nowIso,
        updatedAt: nowIso,
      });
      const updated = await ref.get();
      res.json({ ok: true, review: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][ReplyLabReview] error:', err);
      res.status(500).json({ error: 'REVIEW_REPLY_FAILED' });
    }
  });

  router.patch('/lab/notifications/:notificationId/read', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const notificationId = normalizeStr(req.params.notificationId, 128);
    try {
      const ref = db.doc(`lab_notifications/${notificationId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
        return;
      }
      await ref.update({ isRead: true });
      res.json({ ok: true, notificationId });
    } catch (err) {
      console.error('[MEDORA][MarkLabNotif] error:', err);
      res.status(500).json({ error: 'NOTIFICATION_UPDATE_FAILED' });
    }
  });

  router.post('/lab/notifications/read-all', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;
    try {
      const snap = await db
        .collection('lab_notifications')
        .where('labUid', '==', actor.labUid)
        .where('isRead', '==', false)
        .limit(150)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
        await batch.commit();
      }
      res.json({ ok: true, count: snap.size });
    } catch (err) {
      console.error('[MEDORA][ReadAllLabNotifs] error:', err);
      res.status(500).json({ error: 'NOTIFICATIONS_READ_ALL_FAILED' });
    }
  });

  router.get('/lab/conversations/:conversationId/messages', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['messaging']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);
    try {
      const convRef = db.doc(`lab_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      const msgsSnap = await db
        .collection('lab_messages')
        .where('conversationId', '==', conversationId)
        .limit(150)
        .get();
      const messages = msgsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

      if (Number(convSnap.data()?.unreadByLab || 0) > 0) {
        await convRef.update({ unreadByLab: 0 });
      }
      res.json({ ok: true, messages });
    } catch (err) {
      console.error('[MEDORA][ListLabMessages] error:', err);
      res.status(500).json({ error: 'MESSAGES_LOAD_FAILED' });
    }
  });

  router.post('/lab/conversations', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['messaging', 'reception']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const patientUid = normalizeStr(req.body?.patientUid, 128);
    const patientName = normalizeStr(req.body?.patientName, 120) || 'مريض';
    const patientPhone = normalizeStr(req.body?.patientPhone, 32);
    if (!patientUid) {
      res.status(400).json({ error: 'LINKED_PATIENT_UID_REQUIRED' });
      return;
    }
    try {
      const existing = await db
        .collection('lab_conversations')
        .where('labUid', '==', actor.labUid)
        .where('patientUid', '==', patientUid)
        .limit(1)
        .get();
      if (!existing.empty) {
        res.json({ ok: true, conversation: serializeDoc(existing.docs[0].data()) });
        return;
      }
      const conversationId = safeId('lconv');
      const nowIso = new Date().toISOString();
      const payload = {
        conversationId,
        labUid: actor.labUid,
        labNameAr: actor.labNameAr,
        patientUid,
        patientName,
        patientPhone,
        lastMessagePreview: '',
        lastMessageAt: nowIso,
        unreadByLab: 0,
        unreadByPatient: 0,
        createdAt: nowIso,
      };
      await db.doc(`lab_conversations/${conversationId}`).set(payload);
      res.status(201).json({ ok: true, conversation: payload });
    } catch (err) {
      console.error('[MEDORA][CreateLabConversation] error:', err);
      res.status(500).json({ error: 'CONVERSATION_CREATE_FAILED' });
    }
  });

  router.post('/lab/conversations/:conversationId/messages', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['messaging']);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);
    const text = normalizeStr(req.body?.text, 2000);
    const attachments = sanitizeAttachments(req.body?.attachments);

    if (!text && attachments.length === 0) {
      res.status(400).json({ error: 'EMPTY_MESSAGE' });
      return;
    }

    try {
      const convRef = db.doc(`lab_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.labUid !== actor.labUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      const conv = serializeDoc(convSnap.data());
      const messageId = safeId('lmsg');
      const nowIso = new Date().toISOString();
      const message = {
        messageId,
        conversationId,
        labUid: actor.labUid,
        senderRole: 'lab',
        senderUid: actor.uid,
        senderName: actor.name,
        text,
        attachments,
        createdAt: nowIso,
      };

      const batch = db.batch();
      batch.set(db.doc(`lab_messages/${messageId}`), message);
      batch.update(convRef, {
        lastMessagePreview: text || (attachments[0]?.name ? `مرفق: ${String(attachments[0].name)}` : 'مرفق'),
        lastMessageAt: nowIso,
        unreadByPatient: FieldValue.increment(1),
        unreadByLab: 0,
      });
      await batch.commit();

      if (conv.patientUid) {
        await emitPatientNotification(db, {
          patientUid: String(conv.patientUid),
          type: 'message',
          title: `رسالة جديدة من ${actor.labNameAr}`,
          body: (text || 'تم إرسال ملف مرفق').slice(0, 180),
          relatedId: conversationId,
          relatedType: 'lab_conversation',
        });
      }

      res.status(201).json({ ok: true, message });
    } catch (err) {
      console.error('[MEDORA][SendLabMessage] error:', err);
      res.status(500).json({ error: 'MESSAGE_SEND_FAILED' });
    }
  });

  // Lab <-> Super Admin Official Thread
  router.post('/lab/admin-messages', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const subject = normalizeStr(req.body?.subject, 180) || 'رسالة من المختبر للإدارة';
    const body = normalizeStr(req.body?.body, 2000);
    if (body.length < 2) {
      res.status(400).json({ error: 'INVALID_MESSAGE_BODY' });
      return;
    }

    const threadMessageId = safeId('ladm');
    const nowIso = new Date().toISOString();
    const payload = {
      threadMessageId,
      labUid: actor.labUid,
      institutionId: actor.institutionId,
      labNameAr: actor.labNameAr,
      senderRole: 'lab',
      senderUid: actor.uid,
      senderName: actor.name,
      subject,
      body,
      isReadByAdmin: false,
      isReadByLab: true,
      createdAt: nowIso,
    };

    try {
      await db.doc(`lab_admin_messages/${threadMessageId}`).set(payload);
      res.status(201).json({ ok: true, message: payload });
    } catch (err) {
      console.error('[MEDORA][SendLabAdminMsg] error:', err);
      res.status(500).json({ error: 'ADMIN_MESSAGE_SEND_FAILED' });
    }
  });

  router.patch('/lab/admin-messages/read-all', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;
    try {
      const snap = await db
        .collection('lab_admin_messages')
        .where('labUid', '==', actor.labUid)
        .where('isReadByLab', '==', false)
        .limit(100)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.update(d.ref, { isReadByLab: true }));
        await batch.commit();
      }
      res.json({ ok: true, count: snap.size });
    } catch (err) {
      console.error('[MEDORA][ReadAllLabAdminMsgs] error:', err);
      res.status(500).json({ error: 'ADMIN_MESSAGES_READ_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Private Lab File Upload & Lab Settings + License Renewal
  // ---------------------------------------------------------------------------
  router.post('/lab/files/upload', async (req, res) => {
    const actor = await requireLabAccess(req, res, ['enterResults', 'approveResults', 'messaging', 'reception']);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const folderRaw = normalizeStr(req.body?.folder, 40) as MedoraUploadFolder;
    const folder: MedoraUploadFolder =
      folderRaw === 'lab_results' ||
      folderRaw === 'lab_files' ||
      folderRaw === 'message_files' ||
      folderRaw === 'avatars'
        ? folderRaw
        : 'lab_files';

    const decoded = decodeAndValidateBase64Asset({
      dataBase64: req.body?.dataBase64,
      mimeType: req.body?.mimeType,
      fileName: req.body?.fileName,
      allowPdf: folder !== 'avatars',
    });
    if (!decoded.ok) {
      res.status(400).json({ error: decoded.error });
      return;
    }

    const labPatientUid = normalizeStr(req.body?.labPatientUid, 128);
    const conversationId = normalizeStr(req.body?.conversationId, 128);

    const bucketInfo = deps.resolveReadyStorageBucket
      ? await deps.resolveReadyStorageBucket().catch(() => null)
      : null;

    try {
      const stored = await storeUploadedMediaAsset({
        adminDb: db,
        bucketInfo,
        hasServiceCredentials: deps.hasServiceCredentials ? deps.hasServiceCredentials() : false,
        ownerUid: actor.uid,
        folder,
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
        meta: {
          labUid: actor.labUid,
          ...(labPatientUid ? { labPatientUid } : {}),
          ...(conversationId ? { conversationId } : {}),
        },
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
      const code = err instanceof Error ? err.message : 'FILE_UPLOAD_FAILED';
      if (code === 'PDF_TOO_LARGE_WITHOUT_STORAGE_BUCKET' || code === 'FILE_TOO_LARGE') {
        res.status(413).json({ error: code });
        return;
      }
      console.error('[MEDORA][LabFileUpload] error:', err);
      res.status(500).json({ error: 'FILE_UPLOAD_FAILED' });
    }
  });

  router.patch('/lab/settings', async (req, res) => {
    const actor = await requireLabAccess(req, res, undefined, { managerOnly: true });
    if (!actor) return;
    const db = deps.getAdminDb()!;

    try {
      const ref = db.doc(`lab_profiles/${actor.labUid}`);
      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      const strFields: Array<[string, number]> = [
        ['labNameAr', 160],
        ['labNameEn', 160],
        ['directorName', 120],
        ['technicalDirectorName', 120],
        ['professionalPhone', 32],
        ['governorate', 80],
        ['district', 80],
        ['address', 240],
        ['mapLocationUrl', 500],
        ['workDaysAndHours', 240],
        ['licenseNumber', 100],
        ['licensingAuthority', 160],
        ['licenseExpiryDate', 20],
      ];
      for (const [k, maxLen] of strFields) {
        if (req.body?.[k] !== undefined) {
          patch[k] = normalizeStr(req.body[k], maxLen);
        }
      }
      if (typeof req.body?.hourlyBookingLimit === 'number' && Number.isFinite(req.body.hourlyBookingLimit)) {
        patch.hourlyBookingLimit = Math.max(1, Math.min(100, Math.round(req.body.hourlyBookingLimit)));
      }
      if (req.body?.bookingConfirmationMode === 'auto' || req.body?.bookingConfirmationMode === 'manual') {
        patch.bookingConfirmationMode = req.body.bookingConfirmationMode;
      }
      if (typeof req.body?.homeCollectionEnabled === 'boolean') {
        patch.homeCollectionEnabled = req.body.homeCollectionEnabled;
      }
      if (req.body?.homeCollectionFeeIqd !== undefined) {
        patch.homeCollectionFeeIqd = numOrZero(req.body.homeCollectionFeeIqd);
      }
      if (Array.isArray(req.body?.licenseDocuments)) {
        patch.licenseDocuments = sanitizeAttachments(req.body.licenseDocuments);
      }
      if (req.body?.managerAvatarUrl !== undefined) {
        const url = normalizeStr(req.body.managerAvatarUrl, 1200);
        const path = normalizeStr(req.body.avatarPath, 300);
        if (!url || isValidUploadedAssetUrl(url, path)) {
          patch.managerAvatarUrl = url;
          patch.avatarPath = url ? path : '';
        }
      }

      await ref.update(patch);
      if (patch.labNameAr) {
        await db.doc(`institutions/${actor.institutionId}`).set(
          { name: patch.labNameAr, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      await writeLabAudit(db, actor, {
        action: 'LAB_SETTINGS_UPDATED',
        targetType: 'lab_profiles',
        targetId: actor.labUid,
        details: 'Updated laboratory profile / license / settings',
      });
      if (
        patch.professionalPhone !== undefined ||
        patch.licenseNumber !== undefined ||
        patch.licenseExpiryDate !== undefined ||
        patch.labNameAr !== undefined
      ) {
        await emitLabNotification(db, {
          labUid: actor.labUid,
          type: 'admin_notice',
          eventType: 'important_account_update',
          title: 'تم تحديث بيانات أو ترخيص حساب المختبر',
          body: 'تم حفظ تحديثات إعدادات المختبر أو معلومات التواصل والترخيص بنجاح.',
          relatedId: actor.labUid,
          idempotencyKey: `lab_set:${actor.labUid}:${Date.now().toString(36)}`,
        });
      }
      const updated = await ref.get();
      res.json({ ok: true, labProfile: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateLabSettings] error:', err);
      res.status(500).json({ error: 'LAB_SETTINGS_UPDATE_FAILED' });
    }
  });

  return router;
}

// ---------------------------------------------------------------------------
// Super Admin Laboratory Governance Routes
// ---------------------------------------------------------------------------
export function createAdminLabsRouter(deps: {
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => Promise<void>;
}): Router {
  const router = express.Router();

  router.get('/admin/labs/overview', deps.requireSuperAdmin, async (_req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_LABS_UNAVAILABLE' });
      return;
    }
    try {
      const [labsSnap, instSnap, reviewsSnap, msgsSnap, ordersSnap, staffSnap] = await Promise.all([
        db.collection('lab_profiles').limit(200).get(),
        db.collection('institutions').where('type', '==', 'lab').limit(200).get(),
        db.collection('lab_reviews').limit(300).get(),
        db.collection('lab_admin_messages').limit(300).get(),
        db.collection('lab_orders').limit(500).get(),
        db.collection('lab_staff').limit(500).get(),
      ]);

      const instByOwner = new Map<string, Record<string, unknown>>();
      const instById = new Map<string, Record<string, unknown>>();
      instSnap.docs.forEach((d) => {
        const data = serializeDoc(d.data());
        instById.set(d.id, data);
        if (data.ownerUid) instByOwner.set(String(data.ownerUid), data);
      });

      const ordersCountByLab = new Map<string, number>();
      ordersSnap.docs.forEach((d) => {
        const lUid = String(d.data()?.labUid || '');
        if (lUid) ordersCountByLab.set(lUid, (ordersCountByLab.get(lUid) || 0) + 1);
      });

      const staffCountByLab = new Map<string, number>();
      staffSnap.docs.forEach((d) => {
        const lUid = String(d.data()?.labUid || '');
        if (lUid && d.data()?.status === 'active') {
          staffCountByLab.set(lUid, (staffCountByLab.get(lUid) || 0) + 1);
        }
      });

      const labs = labsSnap.docs.map((d) => {
        const l = serializeDoc(d.data());
        const lUid = String(l.uid || d.id);
        const inst = instById.get(String(l.institutionId || '')) || instByOwner.get(lUid);
        return {
          ...l,
          uid: lUid,
          institutionStatus: inst ? String(inst.status || 'active') : l.status === 'Approved' ? 'active' : 'pending_approval',
          ordersCount: ordersCountByLab.get(lUid) || 0,
          activeStaffCount: staffCountByLab.get(lUid) || 0,
        };
      });

      const reviews = reviewsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const adminMessages = msgsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      res.json({ ok: true, labs, reviews, adminMessages });
    } catch (err) {
      console.error('[MEDORA][AdminLabsOverview] error:', err);
      res.status(500).json({ error: 'ADMIN_LABS_OVERVIEW_FAILED' });
    }
  });

  router.patch('/admin/labs/reviews/:reviewId', deps.requireSuperAdmin, async (req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_LABS_UNAVAILABLE' });
      return;
    }
    const reviewId = normalizeStr(req.params.reviewId, 128);
    const status = normalizeStr(req.body?.status, 30);
    const adminNote = normalizeStr(req.body?.adminNote, 500);
    if (!reviewId || !['approved', 'hidden', 'flagged', 'removed'].includes(status)) {
      res.status(400).json({ error: 'INVALID_LAB_REVIEW_MODERATION' });
      return;
    }

    try {
      const ref = db.doc(`lab_reviews/${reviewId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'REVIEW_NOT_FOUND' });
        return;
      }
      const labUid = String(snap.data()?.labUid || '');
      await ref.update({
        status,
        adminNote,
        updatedAt: new Date().toISOString(),
      });
      if (labUid) {
        await recalculateLabRatingSummary(db, labUid);
      }
      const updated = await ref.get();
      res.json({ ok: true, review: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][ModerateLabReview] error:', err);
      res.status(500).json({ error: 'LAB_REVIEW_MODERATION_FAILED' });
    }
  });

  router.post('/admin/labs/:labUid/message', deps.requireSuperAdmin, async (req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_LABS_UNAVAILABLE' });
      return;
    }
    const labUid = normalizeStr(req.params.labUid, 128);
    const subject = normalizeStr(req.body?.subject, 180) || 'إشعار رسمي من الإدارة';
    const body = normalizeStr(req.body?.body, 2000);
    if (!labUid || body.length < 2) {
      res.status(400).json({ error: 'INVALID_ADMIN_LAB_MESSAGE' });
      return;
    }
    try {
      const labSnap = await db.doc(`lab_profiles/${labUid}`).get();
      if (!labSnap.exists) {
        res.status(404).json({ error: 'LAB_NOT_FOUND' });
        return;
      }
      const lab = serializeDoc(labSnap.data());
      const adminCtx = (req as Request & { adminCtx?: { decoded?: { uid?: string }; email?: string } }).adminCtx;
      const threadMessageId = safeId('ladm');
      const nowIso = new Date().toISOString();
      const payload = {
        threadMessageId,
        labUid,
        institutionId: String(lab.institutionId || ''),
        labNameAr: normalizeStr(lab.labNameAr || lab.labNameEn, 160),
        senderRole: 'super_admin',
        senderUid: String(adminCtx?.decoded?.uid || 'super_admin'),
        senderName: 'MEDORA Super Admin',
        subject,
        body,
        isReadByAdmin: true,
        isReadByLab: false,
        createdAt: nowIso,
      };
      await db.doc(`lab_admin_messages/${threadMessageId}`).set(payload);
      await emitLabNotification(db, {
        labUid,
        type: 'admin_notice',
        title: `رسالة من إدارة MEDORA: ${subject}`,
        body: body.slice(0, 220),
        relatedId: threadMessageId,
      });
      res.status(201).json({ ok: true, message: payload });
    } catch (err) {
      console.error('[MEDORA][AdminMessageLab] error:', err);
      res.status(500).json({ error: 'ADMIN_LAB_MESSAGE_FAILED' });
    }
  });

  router.patch('/admin/labs/:labUid/admin-messages/read', deps.requireSuperAdmin, async (req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_LABS_UNAVAILABLE' });
      return;
    }
    const labUid = normalizeStr(req.params.labUid, 128);
    if (!labUid) {
      res.status(400).json({ error: 'INVALID_LAB_UID' });
      return;
    }
    try {
      const snap = await db
        .collection('lab_admin_messages')
        .where('labUid', '==', labUid)
        .where('isReadByAdmin', '==', false)
        .limit(100)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.update(d.ref, { isReadByAdmin: true }));
        await batch.commit();
      }
      res.json({ ok: true, count: snap.size });
    } catch (err) {
      console.error('[MEDORA][AdminReadLabMsgs] error:', err);
      res.status(500).json({ error: 'ADMIN_LAB_MESSAGES_READ_FAILED' });
    }
  });

  return router;
}
