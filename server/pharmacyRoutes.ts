import express, { type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { emitAdminNotification, getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  PHARMACY_ROLE_PERMISSIONS,
  PHARMACY_TERMINAL_ORDER_STATUSES,
  allocateFefoBatches,
  buildCanonicalIdentityKey,
  daysUntilExpiry,
  generatePickupVerificationCode,
  getTodayBaghdadDateStr,
  isBatchExpired,
  isValidIsoDateYmd,
  parseStructuredMedicineCsv,
  summarizeProductBatchStock,
} from './pharmacyWholesalerEngine.ts';
import {
  issueUnifiedReceiptOnCompletion,
  preReadReceiptStateInTx,
} from './commerceReceiptsEngine.ts';
import type {
  CanonicalMedicineRecord,
  DosageForm,
  PatientPharmacyOrderStatus,
  PharmacyBatchRecord,
  PharmacyDeliveryZone,
  PharmacyOrderItem,
  PharmacyOrderRecord,
  PharmacyPermissionKey,
  PharmacyProductRecord,
  PharmacyProfileDocument,
  PharmacyStaffRole,
} from '../src/types/pharmacy.ts';
import type { WholesalerSupplyOrder } from '../src/types/wholesaler.ts';
import {
  listBulkImportJobs,
  processBulkImportCommit,
  processBulkImportParse,
  processBulkImportRevalidate,
  sendBulkImportTemplate,
} from './bulkImportHandlers.ts';
import {
  decodeAndValidateBase64Asset,
  storeUploadedMediaAsset,
  type ResolvedBucketInfo,
} from './storageHelper.ts';

export interface PharmacyRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  resolveReadyStorageBucket?: () => Promise<ResolvedBucketInfo>;
  hasServiceCredentials?: () => boolean;
}

interface VerifiedActor {
  uid: string;
  email: string;
  name: string;
}

export interface PharmacyAccessContext {
  actor: VerifiedActor;
  actorRole: 'pharmacy_owner' | 'pharmacy_staff';
  staffRole: PharmacyStaffRole;
  pharmacyUid: string;
  institutionId: string;
  permissions: PharmacyPermissionKey[];
  pharmacyProfile: PharmacyProfileDocument;
}

const VALID_PHARMACY_ROLES = new Set<PharmacyStaffRole>([
  'owner',
  'responsible_pharmacist',
  'pharmacist',
  'inventory_manager',
  'delivery_staff',
  'accountant',
]);
const VALID_PHARMACY_PERMISSIONS = new Set<string>(PHARMACY_ROLE_PERMISSIONS.owner);

const VALID_DOSAGE_FORMS = new Set<DosageForm>([
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'drops',
  'inhaler',
  'suppository',
  'powder',
  'other',
]);

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function normalizeNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeValue);
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
    for (const [k, v] of Object.entries(rec)) out[k] = serializeValue(v);
    return out;
  }
  return val;
}

function serializeDoc(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

async function appendPharmacyAudit(
  db: Firestore,
  ctx: PharmacyAccessContext,
  action: string,
  targetCollection: string,
  targetId: string,
  details: string,
): Promise<void> {
  const logId = safeId('phlog');
  await db.doc(`pharmacy_audit_logs/${logId}`).set({
    logId,
    pharmacyUid: ctx.pharmacyUid,
    actorUid: ctx.actor.uid,
    actorName: ctx.actor.name,
    actorRole: ctx.staffRole,
    action: action.slice(0, 120),
    targetCollection: targetCollection.slice(0, 80),
    targetId: targetId.slice(0, 128),
    details: details.slice(0, 600),
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function resolvePharmacyActorFromDb(
  db: Firestore,
  actor: VerifiedActor,
): Promise<
  | { ok: true; ctx: PharmacyAccessContext }
  | { ok: false; code: string; statusCode: number; pharmacyStatus?: string }
> {
  const ownerSnap = await db.doc(`pharmacy_profiles/${actor.uid}`).get();
  if (ownerSnap.exists) {
    const profile = serializeDoc(ownerSnap.data()) as unknown as PharmacyProfileDocument;
    if (profile.status !== 'Approved') {
      return {
        ok: false,
        code: 'PHARMACY_NOT_APPROVED',
        statusCode: 403,
        pharmacyStatus: profile.status,
      };
    }
    const institutionId = profile.institutionId || `inst_pharmacy_${actor.uid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, code: 'PHARMACY_INSTITUTION_SUSPENDED', statusCode: 403 };
      }
    }
    return {
      ok: true,
      ctx: {
        actor,
        actorRole: 'pharmacy_owner',
        staffRole: 'owner',
        pharmacyUid: actor.uid,
        institutionId,
        permissions: PHARMACY_ROLE_PERMISSIONS.owner,
        pharmacyProfile: { ...profile, uid: actor.uid, institutionId },
      },
    };
  }

  // Check active pharmacy staff by uid first, then by email
  let staffDocData: Record<string, unknown> | null = null;
  const byUid = await db
    .collection('pharmacy_staff')
    .where('uid', '==', actor.uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!byUid.empty) {
    staffDocData = serializeDoc(byUid.docs[0].data());
  } else if (actor.email) {
    const byEmail = await db
      .collection('pharmacy_staff')
      .where('email', '==', actor.email)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!byEmail.empty) {
      staffDocData = serializeDoc(byEmail.docs[0].data());
      if (!staffDocData.uid) {
        await byEmail.docs[0].ref.update({
          uid: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => undefined);
      }
    }
  }

  if (staffDocData && typeof staffDocData.pharmacyUid === 'string') {
    const phUid = staffDocData.pharmacyUid;
    const phSnap = await db.doc(`pharmacy_profiles/${phUid}`).get();
    if (!phSnap.exists) {
      return { ok: false, code: 'PHARMACY_NOT_FOUND', statusCode: 403 };
    }
    const profile = serializeDoc(phSnap.data()) as unknown as PharmacyProfileDocument;
    if (profile.status !== 'Approved') {
      return {
        ok: false,
        code: 'PHARMACY_NOT_APPROVED',
        statusCode: 403,
        pharmacyStatus: profile.status,
      };
    }
    const institutionId = profile.institutionId || `inst_pharmacy_${phUid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, code: 'PHARMACY_INSTITUTION_SUSPENDED', statusCode: 403 };
      }
    }
    const rawRole = String(staffDocData.role || 'pharmacist') as PharmacyStaffRole;
    const staffRole: PharmacyStaffRole = VALID_PHARMACY_ROLES.has(rawRole) ? rawRole : 'pharmacist';
    const rawPerms = (
      Array.isArray(staffDocData.permissions)
        ? (staffDocData.permissions as string[])
        : (PHARMACY_ROLE_PERMISSIONS[staffRole] as string[])
    ).filter((p): p is PharmacyPermissionKey => VALID_PHARMACY_PERMISSIONS.has(p));

    return {
      ok: true,
      ctx: {
        actor,
        actorRole: 'pharmacy_staff',
        staffRole,
        pharmacyUid: phUid,
        institutionId,
        permissions: rawPerms,
        pharmacyProfile: { ...profile, uid: phUid, institutionId },
      },
    };
  }

  return { ok: false, code: 'PHARMACY_ACCESS_DENIED', statusCode: 403 };
}

export function createPharmacyRouter(deps: PharmacyRouterDeps): Router {
  const router = express.Router();

  async function verifyActor(req: Request): Promise<VerifiedActor | null> {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    try {
      const decoded = await deps.adminAuth.verifyIdToken(token, false);
      if (!decoded.uid || decoded.email_verified !== true) return null;
      return {
        uid: decoded.uid,
        email: (decoded.email || '').trim().toLowerCase(),
        name: normalizeStr(decoded.name || decoded.email, 120) || 'Pharmacy User',
      };
    } catch {
      return null;
    }
  }

  async function requirePharmacyAccess(
    req: Request,
    res: Response,
    options?: {
      ownerOnly?: boolean;
      requiredPermission?: PharmacyPermissionKey;
      allowedRoles?: PharmacyStaffRole[];
    },
  ): Promise<PharmacyAccessContext | null> {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADMIN_SDK_UNAVAILABLE' });
      return null;
    }
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    const resolved = await resolvePharmacyActorFromDb(db, actor);
    if (!resolved.ok) {
      res.status(resolved.statusCode).json({
        error: resolved.code,
        ...(resolved.pharmacyStatus ? { pharmacyStatus: resolved.pharmacyStatus } : {}),
      });
      return null;
    }
    const { ctx } = resolved;
    if (options?.ownerOnly && ctx.actorRole !== 'pharmacy_owner') {
      res.status(403).json({ error: 'PHARMACY_OWNER_ONLY' });
      return null;
    }
    if (options?.allowedRoles && !options.allowedRoles.includes(ctx.staffRole)) {
      res.status(403).json({ error: 'PHARMACY_ROLE_FORBIDDEN' });
      return null;
    }
    if (
      options?.requiredPermission &&
      ctx.actorRole !== 'pharmacy_owner' &&
      !ctx.permissions.includes(options.requiredPermission)
    ) {
      res.status(403).json({ error: 'PHARMACY_PERMISSION_DENIED' });
      return null;
    }
    return ctx;
  }

  router.get('/pharmacy/access', async (req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.json({ hasAccess: false, reason: 'ADMIN_SDK_UNAVAILABLE' });
      return;
    }
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ hasAccess: false, reason: 'UNAUTHENTICATED' });
      return;
    }
    const resolved = await resolvePharmacyActorFromDb(db, actor);
    if (!resolved.ok) {
      res.json({
        hasAccess: false,
        reason: resolved.code,
        ...(resolved.pharmacyStatus ? { pharmacyStatus: resolved.pharmacyStatus } : {}),
      });
      return;
    }
    res.json({
      hasAccess: true,
      actorRole: resolved.ctx.actorRole,
      staffRole: resolved.ctx.staffRole,
      pharmacyUid: resolved.ctx.pharmacyUid,
      pharmacyName: resolved.ctx.pharmacyProfile.pharmacyNameAr,
    });
  });

  router.get('/pharmacy/workspace', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res);
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const phUid = ctx.pharmacyUid;
    const todayStr = getTodayBaghdadDateStr();

    try {
      const [
        medsSnap,
        prodSnap,
        batchSnap,
        movSnap,
        orderSnap,
        rxSnap,
        dispSnap,
        invSnap,
        paySnap,
        delSnap,
        retSnap,
        staffSnap,
        commSnap,
        auditSnap,
        notifSnap,
        offersSnap,
        campaignsSnap,
        supplyOrdersSnap,
      ] = await Promise.all([
        db.collection('medora_medicines').limit(300).get(),
        db.collection('pharmacy_products').where('pharmacyUid', '==', phUid).limit(500).get(),
        db.collection('pharmacy_batches').where('pharmacyUid', '==', phUid).limit(800).get(),
        db.collection('pharmacy_inventory_movements').where('pharmacyUid', '==', phUid).limit(300).get(),
        db.collection('pharmacy_orders').where('pharmacyUid', '==', phUid).limit(300).get(),
        db.collection('pharmacy_prescription_reviews').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_dispensations').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_invoices').where('pharmacyUid', '==', phUid).limit(300).get(),
        db.collection('pharmacy_payments').where('pharmacyUid', '==', phUid).limit(300).get(),
        db.collection('pharmacy_deliveries').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_returns').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_staff').where('pharmacyUid', '==', phUid).limit(100).get(),
        db.collection('pharmacy_communications').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_audit_logs').where('pharmacyUid', '==', phUid).limit(200).get(),
        db.collection('pharmacy_notifications').where('pharmacyUid', '==', phUid).limit(100).get(),
        db.collection('pharmacy_special_offers').where('pharmacyUid', '==', phUid).limit(50).get(),
        db.collection('pharmacy_campaign_requests').where('pharmacyUid', '==', phUid).limit(50).get(),
        db.collection('wholesaler_supply_orders').where('pharmacyUid', '==', phUid).limit(150).get(),
      ]);

      const canonicalCatalog = medsSnap.docs.map((d) => serializeDoc(d.data())) as unknown as CanonicalMedicineRecord[];
      const batches = batchSnap.docs.map((d) => {
        const b = serializeDoc(d.data()) as unknown as PharmacyBatchRecord;
        return { ...b, isExpired: isBatchExpired(b.expiryDate, todayStr) };
      });

      const batchesByProd = new Map<string, PharmacyBatchRecord[]>();
      for (const b of batches) {
        const list = batchesByProd.get(b.productId) || [];
        list.push(b);
        batchesByProd.set(b.productId, list);
      }

      const products = prodSnap.docs.map((d) => {
        const p = serializeDoc(d.data()) as unknown as PharmacyProductRecord;
        const summary = summarizeProductBatchStock(batchesByProd.get(p.productId) || [], todayStr);
        return {
          ...p,
          availableQty: summary.netAvailableQty,
          reservedQty: summary.reservedQty,
          nearestExpiryDate: summary.nearestExpiryDate,
        };
      });

      const orders = orderSnap.docs
        .map((d) => serializeDoc(d.data()) as unknown as PharmacyOrderRecord)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const returns = retSnap.docs.map((d) => serializeDoc(d.data())) as Array<Record<string, unknown>>;

      // Reports computation from real persisted data
      const monthPrefix = todayStr.slice(0, 7);
      let dailySalesIqd = 0;
      let monthlySalesIqd = 0;
      let completedOrdersCount = 0;
      let cancelledOrdersCount = 0;
      let estimatedGrossProfitIqd = 0;
      const topMap = new Map<string, { productId: string; medicineName: string; unitsSold: number; revenueIqd: number }>();

      for (const o of orders) {
        if (o.status === 'Completed') {
          completedOrdersCount += 1;
          const dateStr = String(o.createdAt || '').slice(0, 10);
          if (dateStr === todayStr) dailySalesIqd += Number(o.totalIqd || 0);
          if (dateStr.startsWith(monthPrefix)) monthlySalesIqd += Number(o.totalIqd || 0);
          for (const item of o.items || []) {
            const qty = Number(item.confirmedQty || item.requestedQty || 0);
            const rev = Number(item.lineTotalIqd || 0);
            const cost = (item.batchAllocations || []).reduce(
              (acc, sl) => acc + Number(sl.purchasePriceIqd || 0) * Number(sl.quantity || 0),
              0,
            );
            estimatedGrossProfitIqd += rev - cost;
            const prev = topMap.get(item.productId) || {
              productId: item.productId,
              medicineName: item.medicineName,
              unitsSold: 0,
              revenueIqd: 0,
            };
            prev.unitsSold += qty;
            prev.revenueIqd += rev;
            topMap.set(item.productId, prev);
          }
        } else if (o.status === 'Cancelled' || o.status === 'Rejected') {
          cancelledOrdersCount += 1;
        }
      }

      const lowStockCount = products.filter(
        (p) => p.isActive && (p.availableQty ?? 0) <= (p.minStockThreshold ?? 5),
      ).length;
      const expiringSoonCount = batches.filter((b) => {
        if (b.isExpired || b.availableQty <= 0) return false;
        const d = daysUntilExpiry(b.expiryDate, todayStr);
        return d >= 0 && d <= 60;
      }).length;
      const expiredBatchesCount = batches.filter((b) => b.isExpired && b.availableQty > 0).length;
      const returnsTotalIqd = returns.reduce((acc, r) => acc + Number(r.totalRefundIqd || 0), 0);

      res.json({
        actorRole: ctx.actorRole,
        permissions: ctx.permissions,
        staffRole: ctx.staffRole,
        pharmacyProfile: ctx.pharmacyProfile,
        canonicalCatalog,
        products,
        batches,
        movements: movSnap.docs.map((d) => serializeDoc(d.data())),
        orders,
        prescriptionReviews: rxSnap.docs.map((d) => serializeDoc(d.data())),
        dispensations: dispSnap.docs.map((d) => serializeDoc(d.data())),
        invoices: invSnap.docs.map((d) => serializeDoc(d.data())),
        payments: paySnap.docs.map((d) => serializeDoc(d.data())),
        deliveries: delSnap.docs.map((d) => serializeDoc(d.data())),
        returns,
        staff: staffSnap.docs.map((d) => serializeDoc(d.data())),
        communications: commSnap.docs.map((d) => serializeDoc(d.data())),
        auditLogs: auditSnap.docs.map((d) => serializeDoc(d.data())),
        notifications: notifSnap.docs.map((d) => serializeDoc(d.data())),
        specialOffers: offersSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        campaignRequests: campaignsSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        supplyOrders: supplyOrdersSnap.docs
          .map((d) => serializeDoc(d.data()))
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
        reports: {
          dailySalesIqd,
          monthlySalesIqd,
          ordersCount: orders.length,
          completedOrdersCount,
          cancelledOrdersCount,
          returnsTotalIqd,
          estimatedGrossProfitIqd,
          lowStockCount,
          expiringSoonCount,
          expiredBatchesCount,
          topSellingProducts: Array.from(topMap.values())
            .sort((a, b) => b.unitsSold - a.unitsSold)
            .slice(0, 10),
        },
      });
    } catch (err) {
      console.error('[MEDORA][PharmacyWorkspace] error:', err);
      res.status(500).json({ error: 'PHARMACY_WORKSPACE_FAILED' });
    }
  });

  // Create canonical medicine (with strict activeIngredient + strength + dosageForm + packSize deduplication)
  router.post('/pharmacy/canonical-medicines', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const scientificName = normalizeStr(req.body?.scientificName, 160);
    const activeIngredient = normalizeStr(req.body?.activeIngredient, 160);
    const strength = normalizeStr(req.body?.strength, 60);
    const rawForm = normalizeStr(req.body?.dosageForm, 40).toLowerCase() as DosageForm;
    const dosageForm: DosageForm = VALID_DOSAGE_FORMS.has(rawForm) ? rawForm : 'other';
    const packSize = normalizeStr(req.body?.packSize, 60);
    const brandName = normalizeStr(req.body?.brandName, 160);
    const manufacturer = normalizeStr(req.body?.manufacturer, 120);
    const country = normalizeStr(req.body?.country, 80);
    const barcode = normalizeStr(req.body?.barcode, 80);
    const imageReference = normalizeStr(req.body?.imageReference, 500);
    const therapeuticCategory = normalizeStr(req.body?.therapeuticCategory, 100) || 'General';
    const requiresPrescription = req.body?.requiresPrescription !== false;
    const controlledDrug = req.body?.controlledDrug === true;

    if (!scientificName || !activeIngredient || !strength || !packSize) {
      res.status(400).json({ error: 'INVALID_CANONICAL_MEDICINE_IDENTITY' });
      return;
    }

    const identityKey = buildCanonicalIdentityKey({
      activeIngredient,
      strength,
      dosageForm,
      packSize,
    });

    const existingSnap = await db
      .collection('medora_medicines')
      .where('identityKey', '==', identityKey)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      const existingData = serializeDoc(existingDoc.data());
      if (brandName && Array.isArray(existingData.brandNames) && !existingData.brandNames.includes(brandName)) {
        await existingDoc.ref.update({
          brandNames: FieldValue.arrayUnion(brandName),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      res.json({ ok: true, medicine: existingData, matchedExisting: true });
      return;
    }

    const medicineId = safeId('med');
    const docData = {
      medicineId,
      identityKey,
      scientificName,
      activeIngredient,
      brandNames: brandName ? [brandName] : [scientificName],
      strength,
      dosageForm,
      packSize,
      ...(manufacturer ? { manufacturer } : {}),
      ...(country ? { country } : {}),
      ...(barcode ? { barcode } : {}),
      ...(imageReference ? { imageReference } : {}),
      approvalStatus: 'approved',
      requiresPrescription,
      controlledDrug,
      therapeuticCategory,
      status: 'active',
      createdByUid: ctx.actor.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.doc(`medora_medicines/${medicineId}`).set(docData);
    await appendPharmacyAudit(
      db,
      ctx,
      'CANONICAL_MEDICINE_CREATED',
      'medora_medicines',
      medicineId,
      `Created canonical medicine ${scientificName} (${strength}, ${dosageForm}, ${packSize})`,
    );
    const saved = await db.doc(`medora_medicines/${medicineId}`).get();
    res.status(201).json({ ok: true, medicine: serializeDoc(saved.data()), matchedExisting: false });
  });

  // Create or update pharmacy product linked to canonical medicineId
  router.post('/pharmacy/products', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const medicineId = normalizeStr(req.body?.medicineId, 128);
    const brandName = normalizeStr(req.body?.brandName, 160);
    const barcode = normalizeStr(req.body?.barcode, 80);
    const sku = normalizeStr(req.body?.sku, 80);
    const manufacturer = normalizeStr(req.body?.manufacturer, 120);
    const country = normalizeStr(req.body?.country, 80);
    const imageReference = normalizeStr(req.body?.imageReference, 500);
    const sellingPriceIqd = normalizeNum(req.body?.sellingPriceIqd, 1, 100000000, 0);
    const discountPriceRaw = req.body?.discountPriceIqd;
    const discountPriceIqd =
      discountPriceRaw !== null && discountPriceRaw !== undefined && discountPriceRaw !== ''
        ? normalizeNum(discountPriceRaw, 0, sellingPriceIqd, 0)
        : null;
    const minStockThreshold = normalizeNum(
      req.body?.reorderLevel ?? req.body?.minStockThreshold,
      0,
      100000,
      5,
    );
    const expiryAlertDays = normalizeNum(req.body?.expiryAlertDays, 1, 730, 60);
    const allowPartialPack = req.body?.allowPartialPack === true;
    const availableForPatientOrders = req.body?.availableForPatientOrders !== false;

    if (!medicineId || sellingPriceIqd <= 0) {
      res.status(400).json({ error: 'INVALID_PRODUCT_INPUT' });
      return;
    }

    const medSnap = await db.doc(`medora_medicines/${medicineId}`).get();
    if (!medSnap.exists) {
      res.status(404).json({ error: 'CANONICAL_MEDICINE_NOT_FOUND' });
      return;
    }
    const med = medSnap.data() as Record<string, unknown>;

    const existingProd = await db
      .collection('pharmacy_products')
      .where('pharmacyUid', '==', ctx.pharmacyUid)
      .where('medicineId', '==', medicineId)
      .limit(1)
      .get();

    const productId = existingProd.empty ? safeId('pprod') : existingProd.docs[0].id;
    const payload = {
      productId,
      pharmacyUid: ctx.pharmacyUid,
      institutionId: ctx.institutionId,
      medicineId,
      scientificName: String(med.scientificName || ''),
      activeIngredient: String(med.activeIngredient || ''),
      brandName: brandName || String(med.scientificName || ''),
      strength: String(med.strength || ''),
      dosageForm: String(med.dosageForm || 'tablet'),
      packSize: String(med.packSize || ''),
      manufacturer: manufacturer || String(med.manufacturer || ''),
      country: country || String(med.country || ''),
      imageReference: imageReference || String(med.imageReference || ''),
      barcode,
      sku: sku || productId,
      requiresPrescription: med.requiresPrescription !== false,
      controlledDrug: med.controlledDrug === true,
      therapeuticCategory: String(med.therapeuticCategory || 'General'),
      sellingPriceIqd,
      discountPriceIqd,
      minStockThreshold,
      reorderLevel: minStockThreshold,
      expiryAlertDays,
      allowPartialPack,
      availableForPatientOrders,
      isActive: req.body?.isActive !== false,
      reviewStatus: 'approved',
      isPublishedToPatients: req.body?.isPublishedToPatients !== false,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existingProd.empty ? { createdAt: FieldValue.serverTimestamp() } : {}),
    };

    await db.doc(`pharmacy_products/${productId}`).set(payload, { merge: true });
    await appendPharmacyAudit(
      db,
      ctx,
      existingProd.empty ? 'PRODUCT_CREATED' : 'PRODUCT_UPDATED',
      'pharmacy_products',
      productId,
      `Product ${payload.brandName} (${sellingPriceIqd} IQD)`,
    );
    const saved = await db.doc(`pharmacy_products/${productId}`).get();
    res.status(existingProd.empty ? 201 : 200).json({ ok: true, product: serializeDoc(saved.data()) });
  });

  // Update individual pharmacy product details (no clinical canonical replacement)
  router.put('/pharmacy/products/:productId', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const productId = normalizeStr(req.params.productId, 128);
    const ref = db.doc(`pharmacy_products/${productId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
      return;
    }

    const cur = snap.data() as Record<string, unknown>;
    const sellingPriceIqd =
      req.body?.sellingPriceIqd !== undefined
        ? normalizeNum(req.body.sellingPriceIqd, 1, 100000000, Number(cur.sellingPriceIqd || 0))
        : Number(cur.sellingPriceIqd || 0);
    if (sellingPriceIqd <= 0) {
      res.status(400).json({ error: 'INVALID_SELLING_PRICE' });
      return;
    }

    const patch: Record<string, unknown> = {
      sellingPriceIqd,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof req.body?.brandName === 'string' && req.body.brandName.trim()) {
      patch.brandName = normalizeStr(req.body.brandName, 160);
    }
    if (typeof req.body?.manufacturer === 'string') {
      patch.manufacturer = normalizeStr(req.body.manufacturer, 120);
    }
    if (typeof req.body?.country === 'string') {
      patch.country = normalizeStr(req.body.country, 80);
    }
    if (typeof req.body?.barcode === 'string') {
      patch.barcode = normalizeStr(req.body.barcode, 80);
    }
    if (typeof req.body?.imageReference === 'string') {
      patch.imageReference = normalizeStr(req.body.imageReference, 500);
    }
    if (req.body?.discountPriceIqd !== undefined) {
      const raw = req.body.discountPriceIqd;
      patch.discountPriceIqd =
        raw !== null && raw !== '' && Number(raw) > 0 && Number(raw) < sellingPriceIqd
          ? normalizeNum(raw, 0, sellingPriceIqd, 0)
          : null;
    }
    if (req.body?.minStockThreshold !== undefined || req.body?.reorderLevel !== undefined) {
      const thr = normalizeNum(req.body?.reorderLevel ?? req.body?.minStockThreshold, 0, 100000, 5);
      patch.minStockThreshold = thr;
      patch.reorderLevel = thr;
    }
    if (typeof req.body?.availableForPatientOrders === 'boolean') {
      patch.availableForPatientOrders = req.body.availableForPatientOrders;
    }
    if (typeof req.body?.isActive === 'boolean') {
      patch.isActive = req.body.isActive;
    }
    if (typeof req.body?.isPublishedToPatients === 'boolean') {
      patch.isPublishedToPatients = req.body.isPublishedToPatients;
      if (req.body.isPublishedToPatients) patch.reviewStatus = 'approved';
    }

    await ref.update(patch);
    await appendPharmacyAudit(
      db,
      ctx,
      'PRODUCT_UPDATED',
      'pharmacy_products',
      productId,
      `Updated product ${String(patch.brandName || cur.brandName || productId)} (${sellingPriceIqd} IQD)`,
    );
    const updated = await ref.get();
    res.json({ ok: true, product: serializeDoc(updated.data()) });
  });

  // Bulk catalog actions (publish, unpublish, activate, deactivate, reorder threshold)
  router.post('/pharmacy/products/bulk-action', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const action = normalizeStr(req.body?.action, 40);
    const productIds = Array.isArray(req.body?.productIds)
      ? (req.body.productIds as unknown[]).map((id) => normalizeStr(id, 128)).filter(Boolean).slice(0, 200)
      : [];

    if (
      productIds.length === 0 ||
      !['publish', 'unpublish', 'activate', 'deactivate', 'set_reorder'].includes(action)
    ) {
      res.status(400).json({ error: 'INVALID_BULK_ACTION' });
      return;
    }

    const reorderVal = normalizeNum(req.body?.reorderLevel, 0, 100000, 5);
    const batch = db.batch();
    let updatedCount = 0;

    const snaps = await Promise.all(productIds.map((pid) => db.doc(`pharmacy_products/${pid}`).get()));
    for (const snap of snaps) {
      if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) continue;
      if (action === 'publish') {
        batch.update(snap.ref, {
          reviewStatus: 'approved',
          isPublishedToPatients: true,
          availableForPatientOrders: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === 'unpublish') {
        batch.update(snap.ref, {
          isPublishedToPatients: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === 'activate') {
        batch.update(snap.ref, { isActive: true, updatedAt: FieldValue.serverTimestamp() });
      } else if (action === 'deactivate') {
        batch.update(snap.ref, { isActive: false, updatedAt: FieldValue.serverTimestamp() });
      } else if (action === 'set_reorder') {
        batch.update(snap.ref, {
          minStockThreshold: reorderVal,
          reorderLevel: reorderVal,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      updatedCount += 1;
    }

    if (updatedCount > 0) {
      await batch.commit();
      await appendPharmacyAudit(
        db,
        ctx,
        `PRODUCTS_BULK_${action.toUpperCase()}`,
        'pharmacy_products',
        ctx.pharmacyUid,
        `Applied bulk action ${action} to ${updatedCount} product(s)`,
      );
    }

    res.json({ ok: true, updatedCount });
  });

  // Documented product-level manual stock adjustment (FEFO-safe, non-POS, mandatory reason)
  router.post('/pharmacy/products/:productId/manual-adjust', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageInventory' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const productId = normalizeStr(req.params.productId, 128);
    const quantityDelta = Math.trunc(Number(req.body?.quantityDelta || 0));
    const reason = normalizeStr(req.body?.reason, 300);
    const batchNumber = normalizeStr(req.body?.batchNumber, 80);
    const expiryDate = normalizeStr(req.body?.expiryDate, 20);
    const purchasePriceIqd = normalizeNum(req.body?.purchasePriceIqd, 0, 100000000, 0);

    if (!productId || !Number.isFinite(quantityDelta) || quantityDelta === 0 || reason.length < 3) {
      res.status(400).json({ error: 'REASON_AND_NONZERO_DELTA_REQUIRED' });
      return;
    }

    const todayStr = getTodayBaghdadDateStr();
    if (quantityDelta > 0) {
      if (!batchNumber || !isValidIsoDateYmd(expiryDate)) {
        res.status(400).json({ error: 'BATCH_NUMBER_AND_VALID_EXPIRY_REQUIRED' });
        return;
      }
      if (isBatchExpired(expiryDate, todayStr)) {
        res.status(400).json({ error: 'EXPIRED_BATCH_NOT_ALLOWED' });
        return;
      }
    }

    try {
      const result = await db.runTransaction(async (tx) => {
        const prodRef = db.doc(`pharmacy_products/${productId}`);
        const prodSnap = await tx.get(prodRef);
        if (!prodSnap.exists || prodSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('PRODUCT_NOT_FOUND');
        }
        const prod = prodSnap.data() as Record<string, unknown>;

        if (quantityDelta > 0) {
          const existingSnap = await tx.get(
            db
              .collection('pharmacy_batches')
              .where('pharmacyUid', '==', ctx.pharmacyUid)
              .where('productId', '==', productId)
              .limit(100),
          );
          const sameBatchDoc = existingSnap.docs.find((d) => {
            const b = d.data() as Record<string, unknown>;
            return String(b.batchNumber || '') === batchNumber && String(b.expiryDate || '') === expiryDate;
          });
          let affectedBatchId = '';
          if (sameBatchDoc) {
            affectedBatchId = sameBatchDoc.id;
            const prevAvail = Number(sameBatchDoc.data()?.availableQty || 0);
            tx.update(sameBatchDoc.ref, {
              availableQty: prevAvail + quantityDelta,
              isExpired: false,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            affectedBatchId = safeId('pbatch');
            tx.set(db.doc(`pharmacy_batches/${affectedBatchId}`), {
              batchId: affectedBatchId,
              pharmacyUid: ctx.pharmacyUid,
              institutionId: ctx.institutionId,
              productId,
              medicineId: String(prod.medicineId || ''),
              productName: String(prod.brandName || prod.scientificName || ''),
              batchNumber,
              expiryDate,
              availableQty: quantityDelta,
              reservedQty: 0,
              purchasePriceIqd,
              sourceType: 'manual',
              isExpired: false,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          const movId = safeId('pmov');
          tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
            movementId: movId,
            pharmacyUid: ctx.pharmacyUid,
            productId,
            batchId: affectedBatchId,
            batchNumber,
            movementType: 'manual_adjust',
            quantityDelta,
            reservedDelta: 0,
            reason,
            actorUid: ctx.actor.uid,
            actorName: ctx.actor.name,
            createdAt: FieldValue.serverTimestamp(),
          });
          return { adjustedQty: quantityDelta };
        }

        // Negative adjustment: deduct FEFO across unexpired, unreserved batches only
        const needToDeduct = Math.abs(quantityDelta);
        const batchSnap = await tx.get(
          db
            .collection('pharmacy_batches')
            .where('pharmacyUid', '==', ctx.pharmacyUid)
            .where('productId', '==', productId)
            .limit(200),
        );
        const batchDocs = batchSnap.docs
          .map((doc) => ({ doc, data: doc.data() as Record<string, unknown> }))
          .filter(
            (b) =>
              !isBatchExpired(String(b.data.expiryDate || ''), todayStr) &&
              Number(b.data.availableQty || 0) - Number(b.data.reservedQty || 0) > 0,
          )
          .sort((a, b) => String(a.data.expiryDate || '').localeCompare(String(b.data.expiryDate || '')));

        const totalDeductible = batchDocs.reduce(
          (acc, b) => acc + Math.max(0, Number(b.data.availableQty || 0) - Number(b.data.reservedQty || 0)),
          0,
        );
        if (totalDeductible < needToDeduct) {
          throw new Error('CANNOT_REDUCE_BELOW_RESERVED_OR_EXPIRED');
        }

        let remaining = needToDeduct;
        for (const item of batchDocs) {
          if (remaining <= 0) break;
          const avail = Number(item.data.availableQty || 0);
          const reserved = Number(item.data.reservedQty || 0);
          const free = Math.max(0, avail - reserved);
          const take = Math.min(free, remaining);
          if (take <= 0) continue;
          tx.update(item.doc.ref, {
            availableQty: avail - take,
            updatedAt: FieldValue.serverTimestamp(),
          });
          const movId = safeId('pmov');
          tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
            movementId: movId,
            pharmacyUid: ctx.pharmacyUid,
            productId,
            batchId: item.doc.id,
            batchNumber: String(item.data.batchNumber || ''),
            movementType: 'manual_adjust',
            quantityDelta: -take,
            reservedDelta: 0,
            reason,
            actorUid: ctx.actor.uid,
            actorName: ctx.actor.name,
            createdAt: FieldValue.serverTimestamp(),
          });
          remaining -= take;
        }
        return { adjustedQty: -needToDeduct };
      });

      await appendPharmacyAudit(
        db,
        ctx,
        'MANUAL_STOCK_ADJUSTED',
        'pharmacy_products',
        productId,
        `Manual stock adjustment (${result.adjustedQty > 0 ? '+' : ''}${result.adjustedQty}): ${reason}`,
      );
      res.json({ ok: true, ...result });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'MANUAL_ADJUST_FAILED';
      res.status(code === 'PRODUCT_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Bulk Drug Import (Excel .xlsx/.xls, CSV, JSON, PDF Review Draft) + Pending-Review Publish Gate
  router.get('/pharmacy/bulk-import/template', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    sendBulkImportTemplate('pharmacy', res);
  });

  router.post('/pharmacy/bulk-import/parse', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportParse({
      db,
      portalType: 'pharmacy',
      ownerUid: ctx.pharmacyUid,
      institutionId: ctx.institutionId,
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      req,
      res,
      resolveReadyStorageBucket: deps.resolveReadyStorageBucket,
      hasServiceCredentials: deps.hasServiceCredentials,
    });
  });

  router.post('/pharmacy/bulk-import/revalidate', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportRevalidate({
      db,
      portalType: 'pharmacy',
      ownerUid: ctx.pharmacyUid,
      req,
      res,
    });
  });

  router.post('/pharmacy/bulk-import/commit', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportCommit({
      db,
      portalType: 'pharmacy',
      ownerUid: ctx.pharmacyUid,
      institutionId: ctx.institutionId,
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      req,
      res,
      onAudit: async (details, jobId) => {
        await appendPharmacyAudit(db, ctx, 'BULK_DRUG_IMPORT_COMMITTED', 'bulk_import_jobs', jobId, details);
      },
    });
  });

  router.get('/pharmacy/bulk-import/jobs', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await listBulkImportJobs({
      db,
      portalType: 'pharmacy',
      ownerUid: ctx.pharmacyUid,
      res,
    });
  });

  router.post('/pharmacy/bulk-import/jobs/:jobId/approve-publish', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const jobId = normalizeStr(req.params.jobId, 128);
    if (!jobId) {
      res.status(400).json({ error: 'INVALID_JOB_ID' });
      return;
    }

    try {
      const jobRef = db.doc(`bulk_import_jobs/${jobId}`);
      const jobSnap = await jobRef.get();
      if (!jobSnap.exists || jobSnap.data()?.ownerUid !== ctx.pharmacyUid || jobSnap.data()?.portalType !== 'pharmacy') {
        res.status(404).json({ error: 'IMPORT_JOB_NOT_FOUND' });
        return;
      }

      const prodSnap = await db
        .collection('pharmacy_products')
        .where('pharmacyUid', '==', ctx.pharmacyUid)
        .where('lastImportJobId', '==', jobId)
        .limit(500)
        .get();

      const batch = db.batch();
      let publishedCount = 0;
      for (const doc of prodSnap.docs) {
        batch.update(doc.ref, {
          reviewStatus: 'approved',
          isPublishedToPatients: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        publishedCount += 1;
      }
      batch.update(jobRef, {
        publishStatus: 'published',
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      await appendPharmacyAudit(
        db,
        ctx,
        'BULK_IMPORT_PRODUCTS_PUBLISHED',
        'bulk_import_jobs',
        jobId,
        `Published ${publishedCount} imported products to patient & doctor search`,
      );
      res.json({ ok: true, publishedCount });
    } catch (err) {
      console.error('[MEDORA][ApprovePublishBulkImport] error:', err);
      res.status(500).json({ error: 'BULK_IMPORT_PUBLISH_FAILED' });
    }
  });

  router.post('/pharmacy/products/:productId/publish', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const productId = normalizeStr(req.params.productId, 128);
    const ref = db.doc(`pharmacy_products/${productId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
      return;
    }
    const nextPublish = req.body?.publish !== false;
    await ref.update({
      reviewStatus: nextPublish ? 'approved' : 'pending_review',
      isPublishedToPatients: nextPublish,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const updated = await ref.get();
    res.json({ ok: true, product: serializeDoc(updated.data()) });
  });

  // Bulk CSV product + initial batch import with duplicate prevention
  router.post('/pharmacy/products/import-csv', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
    if (!csvText.trim()) {
      res.status(400).json({ error: 'CSV_TEXT_REQUIRED' });
      return;
    }

    const parsed = parseStructuredMedicineCsv(csvText);
    let importedCount = 0;
    let batchesCreated = 0;
    const skippedDuplicates: Array<{ rowNumber: number; reason: string }> = [];

    for (const row of parsed.validRows) {
      const identityKey = buildCanonicalIdentityKey({
        activeIngredient: row.activeIngredient,
        strength: row.strength,
        dosageForm: row.dosageForm,
        packSize: row.packSize,
      });

      const medSnap = await db
        .collection('medora_medicines')
        .where('identityKey', '==', identityKey)
        .limit(1)
        .get();

      let medicineId = '';
      if (medSnap.empty) {
        medicineId = safeId('med');
        await db.doc(`medora_medicines/${medicineId}`).set({
          medicineId,
          identityKey,
          scientificName: row.scientificName,
          activeIngredient: row.activeIngredient,
          brandNames: [row.brandName],
          strength: row.strength,
          dosageForm: row.dosageForm,
          packSize: row.packSize,
          requiresPrescription: true,
          controlledDrug: false,
          therapeuticCategory: 'General',
          status: 'active',
          createdByUid: ctx.actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        medicineId = medSnap.docs[0].id;
      }

      const existingProd = await db
        .collection('pharmacy_products')
        .where('pharmacyUid', '==', ctx.pharmacyUid)
        .where('medicineId', '==', medicineId)
        .limit(1)
        .get();

      let productId = '';
      if (existingProd.empty) {
        productId = safeId('pprod');
        await db.doc(`pharmacy_products/${productId}`).set({
          productId,
          pharmacyUid: ctx.pharmacyUid,
          institutionId: ctx.institutionId,
          medicineId,
          scientificName: row.scientificName,
          activeIngredient: row.activeIngredient,
          brandName: row.brandName,
          strength: row.strength,
          dosageForm: row.dosageForm,
          packSize: row.packSize,
          barcode: row.barcode,
          sku: productId,
          requiresPrescription: true,
          controlledDrug: false,
          therapeuticCategory: 'General',
          sellingPriceIqd: row.sellingPriceIqd,
          discountPriceIqd: null,
          minStockThreshold: 5,
          expiryAlertDays: 60,
          allowPartialPack: false,
          availableForPatientOrders: true,
          isActive: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        importedCount += 1;
      } else {
        productId = existingProd.docs[0].id;
        skippedDuplicates.push({ rowNumber: row.rowNumber, reason: 'PRODUCT_ALREADY_IN_PHARMACY' });
      }

      if (row.batchNumber && row.expiryDate && (row.initialQty || 0) > 0) {
        const batchId = safeId('pbatch');
        await db.doc(`pharmacy_batches/${batchId}`).set({
          batchId,
          pharmacyUid: ctx.pharmacyUid,
          institutionId: ctx.institutionId,
          productId,
          medicineId,
          productName: row.brandName,
          batchNumber: row.batchNumber,
          expiryDate: row.expiryDate,
          availableQty: row.initialQty,
          reservedQty: 0,
          purchasePriceIqd: row.purchasePriceIqd || 0,
          sourceType: 'csv_import',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchesCreated += 1;
      }
    }

    await appendPharmacyAudit(
      db,
      ctx,
      'CSV_CATALOG_IMPORTED',
      'pharmacy_products',
      ctx.pharmacyUid,
      `Imported ${importedCount} products and ${batchesCreated} batches (${parsed.errors.length} row errors)`,
    );

    res.json({
      ok: true,
      importedCount,
      batchesCreated,
      skippedDuplicates,
      errors: parsed.errors,
    });
  });

  // Add Batch (strictly rejects expired batches)
  router.post('/pharmacy/batches', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageBatches' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const productId = normalizeStr(req.body?.productId, 128);
    const batchNumber = normalizeStr(req.body?.batchNumber, 80);
    const expiryDate = normalizeStr(req.body?.expiryDate, 20);
    const availableQty = Math.floor(normalizeNum(req.body?.availableQty, 1, 1000000, 0));
    const purchasePriceIqd = normalizeNum(req.body?.purchasePriceIqd, 0, 100000000, 0);

    if (!productId || !batchNumber || !isValidIsoDateYmd(expiryDate) || availableQty <= 0) {
      res.status(400).json({ error: 'INVALID_BATCH_INPUT' });
      return;
    }
    if (isBatchExpired(expiryDate, getTodayBaghdadDateStr())) {
      res.status(400).json({ error: 'EXPIRED_BATCH_NOT_ALLOWED' });
      return;
    }

    const prodSnap = await db.doc(`pharmacy_products/${productId}`).get();
    if (!prodSnap.exists || prodSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
      return;
    }
    const prod = prodSnap.data() as Record<string, unknown>;

    const batchId = safeId('pbatch');
    const movId = safeId('pmov');
    const batch = db.batch();
    batch.set(db.doc(`pharmacy_batches/${batchId}`), {
      batchId,
      pharmacyUid: ctx.pharmacyUid,
      institutionId: ctx.institutionId,
      productId,
      medicineId: String(prod.medicineId || ''),
      productName: String(prod.brandName || prod.scientificName || ''),
      batchNumber,
      expiryDate,
      availableQty,
      reservedQty: 0,
      purchasePriceIqd,
      sourceType: 'manual',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
      movementId: movId,
      pharmacyUid: ctx.pharmacyUid,
      productId,
      batchId,
      batchNumber,
      movementType: 'receive_batch',
      quantityDelta: availableQty,
      reservedDelta: 0,
      reason: 'Manual batch receipt',
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    await appendPharmacyAudit(
      db,
      ctx,
      'BATCH_RECEIVED',
      'pharmacy_batches',
      batchId,
      `Received batch ${batchNumber} (+${availableQty}, exp ${expiryDate})`,
    );

    const saved = await db.doc(`pharmacy_batches/${batchId}`).get();
    res.status(201).json({ ok: true, batch: serializeDoc(saved.data()) });
  });

  // Adjust batch / stocktake / expired write-off (atomic + documented reason)
  router.post('/pharmacy/batches/:batchId/adjust', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageInventory' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const batchId = normalizeStr(req.params.batchId, 128);
    const delta = Math.trunc(Number(req.body?.quantityDelta || 0));
    const movementType = normalizeStr(req.body?.movementType, 40) || 'manual_adjust';
    const reason = normalizeStr(req.body?.reason, 300);

    if (!batchId || !reason || reason.length < 3 || !Number.isFinite(delta) || delta === 0) {
      res.status(400).json({ error: 'REASON_AND_NONZERO_DELTA_REQUIRED' });
      return;
    }

    const allowedAdjustTypes = new Set(['manual_adjust', 'stocktake_adjust', 'expired_writeoff']);
    if (!allowedAdjustTypes.has(movementType)) {
      res.status(400).json({ error: 'INVALID_MOVEMENT_TYPE' });
      return;
    }

    try {
      const updatedBatch = await db.runTransaction(async (tx) => {
        const bRef = db.doc(`pharmacy_batches/${batchId}`);
        const bSnap = await tx.get(bRef);
        if (!bSnap.exists || bSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('BATCH_NOT_FOUND');
        }
        const b = bSnap.data() as Record<string, unknown>;
        const curAvail = Number(b.availableQty || 0);
        const curReserved = Number(b.reservedQty || 0);
        const nextAvail = curAvail + delta;
        if (nextAvail < curReserved || nextAvail < 0) {
          throw new Error('CANNOT_REDUCE_BELOW_RESERVED_OR_ZERO');
        }
        tx.update(bRef, {
          availableQty: nextAvail,
          updatedAt: FieldValue.serverTimestamp(),
        });
        const movId = safeId('pmov');
        tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
          movementId: movId,
          pharmacyUid: ctx.pharmacyUid,
          productId: String(b.productId || ''),
          batchId,
          batchNumber: String(b.batchNumber || ''),
          movementType,
          quantityDelta: delta,
          reservedDelta: 0,
          reason,
          actorUid: ctx.actor.uid,
          actorName: ctx.actor.name,
          createdAt: FieldValue.serverTimestamp(),
        });
        return { ...serializeDoc(b), availableQty: nextAvail };
      });

      await appendPharmacyAudit(
        db,
        ctx,
        'BATCH_ADJUSTED',
        'pharmacy_batches',
        batchId,
        `Adjusted batch ${batchId} by ${delta} (${movementType}): ${reason}`,
      );
      res.json({ ok: true, batch: updatedBatch });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'BATCH_ADJUST_FAILED';
      res.status(code === 'BATCH_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Pharmacist prescription review (Doctor Rx fields stay immutable; clarification request supported)
  router.post('/pharmacy/prescriptions/:reviewId/review', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, {
      requiredPermission: 'reviewPrescriptions',
      allowedRoles: ['owner', 'responsible_pharmacist', 'pharmacist'],
    });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const reviewId = normalizeStr(req.params.reviewId, 128);
    const reviewStatus = normalizeStr(req.body?.reviewStatus, 40);
    const pharmacistNote = normalizeStr(req.body?.pharmacistNote, 600);
    const clarificationMessage = normalizeStr(req.body?.clarificationMessage, 600);

    const allowedStatuses = new Set([
      'Under Pharmacist Review',
      'Approved',
      'Partially Available',
      'Rejected',
      'Clarification Requested',
    ]);
    if (!reviewId || !allowedStatuses.has(reviewStatus)) {
      res.status(400).json({ error: 'INVALID_REVIEW_STATUS' });
      return;
    }
    if (reviewStatus === 'Rejected' && pharmacistNote.length < 3) {
      res.status(400).json({ error: 'REJECTION_REASON_REQUIRED' });
      return;
    }
    if (reviewStatus === 'Clarification Requested' && clarificationMessage.length < 3) {
      res.status(400).json({ error: 'CLARIFICATION_MESSAGE_REQUIRED' });
      return;
    }

    const revRef = db.doc(`pharmacy_prescription_reviews/${reviewId}`);
    const revSnap = await revRef.get();
    if (!revSnap.exists || revSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'PRESCRIPTION_REVIEW_NOT_FOUND' });
      return;
    }
    const revData = revSnap.data() as Record<string, unknown>;
    if (revData.reviewStatus === 'Dispensed') {
      res.status(409).json({ error: 'PRESCRIPTION_ALREADY_DISPENSED' });
      return;
    }

    await revRef.update({
      reviewStatus,
      pharmacistUid: ctx.actor.uid,
      pharmacistName: ctx.actor.name,
      ...(pharmacistNote ? { pharmacistNote } : {}),
      ...(clarificationMessage ? { clarificationMessage } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (reviewStatus === 'Clarification Requested' && revData.doctorUid) {
      const msgId = safeId('pcomm');
      await db.doc(`pharmacy_communications/${msgId}`).set({
        messageId: msgId,
        pharmacyUid: ctx.pharmacyUid,
        channelType: 'doctor_clarification',
        relatedId: String(revData.prescriptionId || reviewId),
        doctorUid: String(revData.doctorUid),
        senderUid: ctx.actor.uid,
        senderName: ctx.actor.name,
        senderRole: ctx.staffRole,
        body: clarificationMessage,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    await appendPharmacyAudit(
      db,
      ctx,
      'PRESCRIPTION_REVIEWED',
      'pharmacy_prescription_reviews',
      reviewId,
      `Set reviewStatus=${reviewStatus}${pharmacistNote ? `: ${pharmacistNote}` : ''}`,
    );

    const updated = await revRef.get();
    res.json({ ok: true, review: serializeDoc(updated.data()) });
  });

  // Transition Patient Order (Atomic FEFO Commit / Release / Pickup Code / Invoice)
  router.post('/pharmacy/orders/:orderId/transition', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const nextStatus = normalizeStr(req.body?.status, 40) as PatientPharmacyOrderStatus;
    const rejectionReason = normalizeStr(req.body?.rejectionReason, 500);
    const pickupCodeInput = normalizeStr(req.body?.pickupCode, 32);
    const note = normalizeStr(req.body?.note, 400);

    const allowedNext = new Set<PatientPharmacyOrderStatus>([
      'Under Pharmacist Review',
      'Accepted',
      'Partially Accepted',
      'Rejected',
      'Preparing',
      'Ready for Pickup',
      'Out for Delivery',
      'Completed',
      'Cancelled',
    ]);
    if (!orderId || !allowedNext.has(nextStatus)) {
      res.status(400).json({ error: 'INVALID_ORDER_STATUS' });
      return;
    }

    try {
      const result = await db.runTransaction(async (tx) => {
        const orderRef = db.doc(`pharmacy_orders/${orderId}`);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists || orderSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('ORDER_NOT_FOUND');
        }
        const order = serializeDoc(orderSnap.data()) as unknown as PharmacyOrderRecord;

        if (PHARMACY_TERMINAL_ORDER_STATUSES.has(order.status)) {
          throw new Error('ORDER_ALREADY_TERMINAL');
        }

        // Clinical gate: orders tied to a prescription require pharmacist/owner permission to accept or complete
        if (
          order.prescriptionId &&
          ['Accepted', 'Partially Accepted', 'Completed'].includes(nextStatus) &&
          !ctx.permissions.includes('reviewPrescriptions') &&
          ctx.actorRole !== 'pharmacy_owner'
        ) {
          throw new Error('PHARMACIST_ROLE_REQUIRED_FOR_RX_ORDER');
        }

        if (nextStatus === 'Rejected' && rejectionReason.length < 3) {
          throw new Error('REJECTION_REASON_REQUIRED');
        }

        if (nextStatus === 'Ready for Pickup' && order.fulfillmentType !== 'pickup') {
          throw new Error('ORDER_IS_NOT_PICKUP');
        }
        if (nextStatus === 'Out for Delivery' && order.fulfillmentType !== 'delivery') {
          throw new Error('ORDER_IS_NOT_DELIVERY');
        }

        if (nextStatus === 'Completed' && order.fulfillmentType === 'pickup') {
          if (!order.pickupCode || pickupCodeInput.toUpperCase() !== order.pickupCode.toUpperCase()) {
            throw new Error('INVALID_PICKUP_VERIFICATION_CODE');
          }
        }

        // Pre-read all batches, invoice, and receipt state BEFORE any transaction writes
        const releaseBatches: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; allocQty: number; productId: string; batchId: string; batchNumber: string }> = [];
        if (nextStatus === 'Rejected' || nextStatus === 'Cancelled') {
          for (const item of order.items || []) {
            for (const alloc of item.batchAllocations || []) {
              const bRef = db.doc(`pharmacy_batches/${alloc.batchId}`);
              const bSnap = await tx.get(bRef);
              if (bSnap.exists) {
                releaseBatches.push({
                  ref: bRef,
                  data: bSnap.data() as Record<string, unknown>,
                  allocQty: Number(alloc.quantity || 0),
                  productId: item.productId,
                  batchId: alloc.batchId,
                  batchNumber: alloc.batchNumber,
                });
              }
            }
          }
        }

        const commitBatches: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; qty: number; productId: string; batchId: string; batchNumber: string }> = [];
        let invRef: FirebaseFirestore.DocumentReference | null = null;
        let existingInvSnap: FirebaseFirestore.DocumentSnapshot | null = null;
        let preReadReceipt: Awaited<ReturnType<typeof preReadReceiptStateInTx>> | null = null;

        if (nextStatus === 'Completed') {
          if (!order.stockDeducted) {
            for (const item of order.items || []) {
              for (const alloc of item.batchAllocations || []) {
                const bRef = db.doc(`pharmacy_batches/${alloc.batchId}`);
                const bSnap = await tx.get(bRef);
                if (!bSnap.exists) throw new Error('BATCH_MISSING_ON_COMMIT');
                commitBatches.push({
                  ref: bRef,
                  data: bSnap.data() as Record<string, unknown>,
                  qty: Number(alloc.quantity || 0),
                  productId: item.productId,
                  batchId: alloc.batchId,
                  batchNumber: alloc.batchNumber,
                });
              }
            }
          }
          invRef = db.doc(`pharmacy_invoices/pinv_${orderId}`);
          [existingInvSnap, preReadReceipt] = await Promise.all([
            tx.get(invRef),
            preReadReceiptStateInTx(db, tx, orderId),
          ]);
        }

        const updates: Record<string, unknown> = {
          status: nextStatus,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (note) updates.pharmacistReviewNote = note;
        if (rejectionReason) updates.rejectionReason = rejectionReason;

        if (nextStatus === 'Ready for Pickup' && !order.pickupCode) {
          updates.pickupCode = generatePickupVerificationCode();
        }

        // Release reserved FEFO stock atomically on Reject or Cancel
        if ((nextStatus === 'Rejected' || nextStatus === 'Cancelled') && !order.stockDeducted) {
          for (const rb of releaseBatches) {
            const nextReserved = Math.max(0, Number(rb.data.reservedQty || 0) - rb.allocQty);
            tx.update(rb.ref, { reservedQty: nextReserved, updatedAt: FieldValue.serverTimestamp() });
            const movId = safeId('pmov');
            tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
              movementId: movId,
              pharmacyUid: ctx.pharmacyUid,
              productId: rb.productId,
              batchId: rb.batchId,
              batchNumber: rb.batchNumber,
              movementType: 'release_reserve',
              quantityDelta: 0,
              reservedDelta: -rb.allocQty,
              reason: `Order ${order.orderNumber} ${nextStatus}`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        }

        // Commit reserved stock + Invoice + Dispensation + Unified 3-Party Receipt on Completed
        let generatedInvoiceId = '';
        let generatedReceiptId = '';
        let generatedReceiptNumber = '';
        if (nextStatus === 'Completed') {
          const completedAtIso = new Date().toISOString();
          if (order.fulfillmentType === 'pickup') {
            updates.pickupVerifiedAt = completedAtIso;
            updates.pickupVerifiedByName = ctx.actor.name;
          }

          if (!order.stockDeducted) {
            for (const cb of commitBatches) {
              const nextAvail = Number(cb.data.availableQty || 0) - cb.qty;
              const nextReserved = Math.max(0, Number(cb.data.reservedQty || 0) - cb.qty);
              if (nextAvail < 0) throw new Error('INSUFFICIENT_BATCH_STOCK_ON_COMMIT');
              tx.update(cb.ref, {
                availableQty: nextAvail,
                reservedQty: nextReserved,
                updatedAt: FieldValue.serverTimestamp(),
              });
              const movId = safeId('pmov');
              tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
                movementId: movId,
                pharmacyUid: ctx.pharmacyUid,
                productId: cb.productId,
                batchId: cb.batchId,
                batchNumber: cb.batchNumber,
                movementType: 'commit_dispense',
                quantityDelta: -cb.qty,
                reservedDelta: -cb.qty,
                reason: `Completed order ${order.orderNumber}`,
                relatedOrderId: orderId,
                actorUid: ctx.actor.uid,
                actorName: ctx.actor.name,
                createdAt: FieldValue.serverTimestamp(),
              });
            }
            updates.stockDeducted = true;
          }

          generatedInvoiceId = `pinv_${orderId}`;
          if (invRef && existingInvSnap && !existingInvSnap.exists) {
            tx.set(invRef, {
              invoiceId: generatedInvoiceId,
              invoiceNumber: `INV-PH-${order.orderNumber}`,
              pharmacyUid: ctx.pharmacyUid,
              institutionId: ctx.institutionId,
              pharmacyName: ctx.pharmacyProfile.pharmacyNameAr,
              orderId,
              orderNumber: order.orderNumber,
              patientUid: order.patientUid,
              patientName: order.patientName,
              subtotalIqd: order.subtotalIqd,
              deliveryFeeIqd: order.deliveryFeeIqd,
              discountIqd: order.discountIqd || 0,
              totalIqd: order.totalIqd,
              paidAmountIqd: order.paymentStatus === 'paid' ? order.totalIqd : 0,
              balanceDueIqd: order.paymentStatus === 'paid' ? 0 : order.totalIqd,
              paymentMethod: order.paymentMethod,
              status: order.paymentStatus === 'paid' ? 'paid' : 'unpaid',
              items: order.items,
              issuedAt: completedAtIso,
            });
          }

          if (order.prescriptionId) {
            const dispId = `disp_${orderId}`;
            const dispItems = (order.items || []).flatMap((it) =>
              (it.batchAllocations || []).map((al) => ({
                productId: it.productId,
                medicineName: it.medicineName,
                quantity: al.quantity,
                batchNumber: al.batchNumber,
                expiryDate: al.expiryDate,
              })),
            );
            tx.set(db.doc(`pharmacy_dispensations/${dispId}`), {
              dispensationId: dispId,
              pharmacyUid: ctx.pharmacyUid,
              orderId,
              prescriptionId: order.prescriptionId,
              patientUid: order.patientUid,
              patientName: order.patientName,
              doctorUid: order.doctorUid || '',
              doctorName: order.doctorName || '',
              pharmacistUid: ctx.actor.uid,
              pharmacistName: ctx.actor.name,
              items: dispItems,
              dispensedAt: completedAtIso,
            });
          }

          const issued = await issueUnifiedReceiptOnCompletion(
            db,
            tx,
            {
              transactionType: 'pharmacy_to_patient',
              orderId,
              orderNumber: order.orderNumber,
              sellerUid: ctx.pharmacyUid,
              sellerRole: 'pharmacy',
              sellerName: ctx.pharmacyProfile.pharmacyNameAr || ctx.pharmacyProfile.pharmacyNameEn,
              sellerInstitutionId: ctx.institutionId,
              sellerGovernorate: ctx.pharmacyProfile.governorate,
              sellerAddress: ctx.pharmacyProfile.address,
              sellerPhone: ctx.pharmacyProfile.professionalPhone,
              buyerUid: order.patientUid,
              buyerRole: 'patient',
              buyerName: order.patientName,
              buyerGovernorate: order.deliveryGovernorate,
              buyerAddress: order.deliveryAddress,
              items: (order.items || []).map((it) => ({
                productId: it.productId,
                medicineId: it.medicineId,
                medicineName: it.medicineName,
                quantity: Number(it.confirmedQty || it.requestedQty || 0),
                unitPriceIqd: Number(it.unitPriceIqd || 0),
                lineTotalIqd: Number(it.lineTotalIqd || 0),
                batchNumbers: (it.batchAllocations || []).map((b) => b.batchNumber),
                expiryDates: (it.batchAllocations || []).map((b) => b.expiryDate),
              })),
              subtotalAmountIqd: Number(order.subtotalIqd || 0),
              discountAmountIqd: Number(order.discountIqd || 0),
              deliveryFeeIqd: Number(order.deliveryFeeIqd || 0),
              totalAmountIqd: Number(order.totalIqd || 0),
              paidAmountIqd: Number(order.totalIqd || 0),
              balanceDueIqd: 0,
              paymentMethod:
                order.paymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'cash_on_pickup',
              paymentStatus: 'paid',
              fulfillmentType:
                order.fulfillmentType === 'delivery' ? 'seller_delivery' : 'buyer_pickup',
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              actorRole: ctx.actorRole,
              completedAtIso,
            },
            preReadReceipt || undefined,
          );
          generatedReceiptId = issued.receipt.receiptId;
          generatedReceiptNumber = issued.receipt.receiptNumber;
          updates.receiptIssued = true;
          updates.receiptId = generatedReceiptId;
          updates.receiptNumber = generatedReceiptNumber;
          updates.paymentStatus = 'paid';
          updates.completedAt = completedAtIso;
        }

        tx.update(orderRef, updates);
        return {
          order: { ...order, ...updates },
          generatedInvoiceId,
          generatedReceiptId,
          generatedReceiptNumber,
        };
      });

      await appendPharmacyAudit(
        db,
        ctx,
        `ORDER_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        'pharmacy_orders',
        orderId,
        `Transitioned order ${result.order.orderNumber} to ${nextStatus}`,
      );

      if (result.order.patientUid) {
        const engine = getGlobalNotificationEngine();
        await engine
          ?.dispatch({
            eventType: 'pharmacy_order_updated',
            recipientUid: result.order.patientUid,
            recipientRole: 'patient',
            title: `تحديث حالة طلبك الصيدلاني (${result.order.orderNumber})`,
            body:
              nextStatus === 'Ready for Pickup'
                ? `طلبك جاهز للاستلام من ${ctx.pharmacyProfile.pharmacyNameAr}. رمز الاستلام: ${result.order.pickupCode}`
                : `تم تحديث حالة طلبك إلى: ${nextStatus}`,
            inAppType: 'pharmacy_order_updated',
            relatedId: orderId,
            relatedType: 'pharmacy_order',
            idempotencyKey: `ph_ord_${orderId}_${nextStatus}`,
          })
          .catch(() => undefined);
      }

      res.json({ ok: true, order: result.order, invoiceId: result.generatedInvoiceId });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ORDER_TRANSITION_FAILED';
      const status =
        code === 'ORDER_NOT_FOUND'
          ? 404
          : code === 'ORDER_ALREADY_TERMINAL'
            ? 409
            : code.includes('ROLE')
              ? 403
              : 400;
      res.status(status).json({ error: code });
    }
  });

  // Online Patient & Doctor Prescription Orders only (POS / walk-in cash register removed per policy)

  // Record payment on invoice
  router.post('/pharmacy/invoices/:invoiceId/payments', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageBilling' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const invoiceId = normalizeStr(req.params.invoiceId, 128);
    const amountIqd = normalizeNum(req.body?.amountIqd, 1, 100000000, 0);
    const method = normalizeStr(req.body?.method, 40) || 'cash_on_pickup';
    const note = normalizeStr(req.body?.note, 200);

    if (!invoiceId || amountIqd <= 0) {
      res.status(400).json({ error: 'INVALID_PAYMENT_INPUT' });
      return;
    }

    try {
      await db.runTransaction(async (tx) => {
        const invRef = db.doc(`pharmacy_invoices/${invoiceId}`);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists || invSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('INVOICE_NOT_FOUND');
        }
        const inv = invSnap.data() as Record<string, unknown>;
        const total = Number(inv.totalIqd || 0);
        const prevPaid = Number(inv.paidAmountIqd || 0);
        const nextPaid = Math.min(total, prevPaid + amountIqd);
        const nextDue = Math.max(0, total - nextPaid);
        const nextStatus = nextDue === 0 ? 'paid' : 'partial';

        tx.update(invRef, {
          paidAmountIqd: nextPaid,
          balanceDueIqd: nextDue,
          status: nextStatus,
        });
        if (inv.orderId) {
          tx.update(db.doc(`pharmacy_orders/${String(inv.orderId)}`), {
            paymentStatus: nextDue === 0 ? 'paid' : 'unpaid',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        const paymentId = safeId('ppay');
        tx.set(db.doc(`pharmacy_payments/${paymentId}`), {
          paymentId,
          pharmacyUid: ctx.pharmacyUid,
          invoiceId,
          orderId: String(inv.orderId || ''),
          amountIqd,
          method,
          receivedByUid: ctx.actor.uid,
          receivedByName: ctx.actor.name,
          ...(note ? { note } : {}),
          paidAt: new Date().toISOString(),
        });
      });

      res.json({ ok: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'PAYMENT_RECORD_FAILED';
      res.status(code === 'INVOICE_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Delivery assignment and proof (never fakes courier tracking when no staff assigned)
  router.post('/pharmacy/deliveries/:deliveryId/update', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageDeliveries' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const deliveryId = normalizeStr(req.params.deliveryId, 128);
    const status = normalizeStr(req.body?.status, 40);
    const assignedStaffUid = normalizeStr(req.body?.assignedStaffUid, 128);
    const assignedStaffName = normalizeStr(req.body?.assignedStaffName, 120);
    const proofNote = normalizeStr(req.body?.proofNote, 300);
    const failureReason = normalizeStr(req.body?.failureReason, 300);

    const allowed = new Set(['assigned', 'out_for_delivery', 'delivered', 'failed']);
    if (!deliveryId || !allowed.has(status)) {
      res.status(400).json({ error: 'INVALID_DELIVERY_UPDATE' });
      return;
    }

    const delRef = db.doc(`pharmacy_deliveries/${deliveryId}`);
    const delSnap = await delRef.get();
    if (!delSnap.exists || delSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'DELIVERY_NOT_FOUND' });
      return;
    }
    const delData = delSnap.data() as Record<string, unknown>;

    const patch: Record<string, unknown> = {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (assignedStaffUid) patch.assignedStaffUid = assignedStaffUid;
    if (assignedStaffName) patch.assignedStaffName = assignedStaffName;
    if (proofNote) patch.proofNote = proofNote;
    if (failureReason) patch.failureReason = failureReason;
    if (status === 'delivered') patch.deliveredAt = new Date().toISOString();

    await delRef.update(patch);
    if (delData.orderId && status === 'out_for_delivery') {
      await db.doc(`pharmacy_orders/${String(delData.orderId)}`).update({
        status: 'Out for Delivery',
        ...(assignedStaffUid ? { assignedDeliveryStaffUid: assignedStaffUid } : {}),
        ...(assignedStaffName ? { assignedDeliveryStaffName: assignedStaffName } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await appendPharmacyAudit(
      db,
      ctx,
      `DELIVERY_${status.toUpperCase()}`,
      'pharmacy_deliveries',
      deliveryId,
      `Updated delivery ${deliveryId} -> ${status}`,
    );

    const refreshed = await delRef.get();
    res.json({ ok: true, delivery: serializeDoc(refreshed.data()) });
  });

  // Patient Return & Non-Expired Batch Restock
  router.post('/pharmacy/returns', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageReturns' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.body?.orderId, 128);
    const reason = normalizeStr(req.body?.reason, 300);
    const restockRequested = req.body?.restockRequested === true;
    const reqItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!orderId || reason.length < 3 || reqItems.length === 0) {
      res.status(400).json({ error: 'INVALID_RETURN_INPUT' });
      return;
    }

    const todayStr = getTodayBaghdadDateStr();

    try {
      const returnId = safeId('pret');
      await db.runTransaction(async (tx) => {
        const ordSnap = await tx.get(db.doc(`pharmacy_orders/${orderId}`));
        if (!ordSnap.exists || ordSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('ORDER_NOT_FOUND');
        }
        const ord = ordSnap.data() as Record<string, unknown>;
        const finalItems: Array<Record<string, unknown>> = [];
        let totalRefundIqd = 0;

        for (const it of reqItems) {
          const productId = normalizeStr(it?.productId, 128);
          const batchId = normalizeStr(it?.batchId, 128);
          const qty = Math.floor(normalizeNum(it?.quantity, 1, 1000, 0));
          const unitPriceIqd = normalizeNum(it?.unitPriceIqd, 0, 100000000, 0);
          if (!productId || !batchId || qty <= 0) continue;

          const bRef = db.doc(`pharmacy_batches/${batchId}`);
          const bSnap = await tx.get(bRef);
          let restocked = false;
          let batchNumber = normalizeStr(it?.batchNumber, 80);

          if (bSnap.exists && restockRequested) {
            const b = bSnap.data() as Record<string, unknown>;
            batchNumber = String(b.batchNumber || batchNumber);
            if (!isBatchExpired(String(b.expiryDate || ''), todayStr)) {
              tx.update(bRef, {
                availableQty: Number(b.availableQty || 0) + qty,
                updatedAt: FieldValue.serverTimestamp(),
              });
              const movId = safeId('pmov');
              tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
                movementId: movId,
                pharmacyUid: ctx.pharmacyUid,
                productId,
                batchId,
                batchNumber,
                movementType: 'return_in',
                quantityDelta: qty,
                reservedDelta: 0,
                reason: `Return ${returnId}: ${reason}`,
                relatedOrderId: orderId,
                actorUid: ctx.actor.uid,
                actorName: ctx.actor.name,
                createdAt: FieldValue.serverTimestamp(),
              });
              restocked = true;
            }
          }

          totalRefundIqd += qty * unitPriceIqd;
          finalItems.push({
            productId,
            medicineName: normalizeStr(it?.medicineName, 160),
            batchId,
            batchNumber,
            quantity: qty,
            unitPriceIqd,
            restocked,
          });
        }

        tx.set(db.doc(`pharmacy_returns/${returnId}`), {
          returnId,
          pharmacyUid: ctx.pharmacyUid,
          orderId,
          orderNumber: String(ord.orderNumber || orderId),
          patientName: String(ord.patientName || ''),
          reason,
          restockRequested,
          items: finalItems,
          totalRefundIqd,
          status: 'approved',
          processedByUid: ctx.actor.uid,
          processedByName: ctx.actor.name,
          createdAt: FieldValue.serverTimestamp(),
        });
      });

      await appendPharmacyAudit(
        db,
        ctx,
        'RETURN_PROCESSED',
        'pharmacy_returns',
        returnId,
        `Processed return ${returnId} for order ${orderId}`,
      );
      const saved = await db.doc(`pharmacy_returns/${returnId}`).get();
      res.status(201).json({ ok: true, returnRecord: serializeDoc(saved.data()) });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'RETURN_FAILED';
      res.status(code === 'ORDER_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Browse Approved Wholesalers & Catalog (B2B Supply)
  router.get('/pharmacy/wholesalers/browse', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSupplyOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const todayStr = getTodayBaghdadDateStr();

    try {
      const [whSnap, prodSnap, batchSnap, policySnap, ordSnap] = await Promise.all([
        db.collection('wholesaler_profiles').where('status', '==', 'Approved').limit(100).get(),
        db.collection('wholesaler_products').where('isActive', '==', true).limit(600).get(),
        db.collection('wholesaler_batches').limit(1000).get(),
        db.collection('wholesaler_credit_policies').where('pharmacyUid', '==', ctx.pharmacyUid).limit(100).get(),
        db.collection('wholesaler_supply_orders').where('pharmacyUid', '==', ctx.pharmacyUid).limit(200).get(),
      ]);

      const batchByProd = new Map<string, Array<{ availableQty: number; reservedQty: number; expiryDate: string }>>();
      for (const bDoc of batchSnap.docs) {
        const b = bDoc.data() as Record<string, unknown>;
        const exp = String(b.expiryDate || '');
        if (isBatchExpired(exp, todayStr)) continue;
        const pid = String(b.productId || '');
        const list = batchByProd.get(pid) || [];
        list.push({
          availableQty: Number(b.availableQty || 0),
          reservedQty: Number(b.reservedQty || 0),
          expiryDate: exp,
        });
        batchByProd.set(pid, list);
      }

      const policyByWh = new Map<string, Record<string, unknown>>();
      for (const pDoc of policySnap.docs) {
        const p = serializeDoc(pDoc.data());
        policyByWh.set(String(p.wholesalerUid || ''), p);
      }

      const wholesalers = whSnap.docs.map((wDoc) => {
        const w = serializeDoc(wDoc.data());
        const wUid = String(w.uid || wDoc.id);
        const policy = policyByWh.get(wUid) || null;
        const customPrices = (policy?.customPricesByProductId as Record<string, number> | undefined) || {};
        const products = prodSnap.docs
          .map((d) => serializeDoc(d.data()))
          .filter((p) => p.wholesalerUid === wUid)
          .map((p) => {
            const batches = batchByProd.get(String(p.productId)) || [];
            const availableQty = batches.reduce(
              (acc, b) => acc + Math.max(0, b.availableQty - b.reservedQty),
              0,
            );
            const activeBatches = batches
              .filter((b) => Math.max(0, b.availableQty - b.reservedQty) > 0)
              .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
            const customPrice = customPrices[String(p.productId)];
            return {
              ...p,
              effectivePriceIqd:
                typeof customPrice === 'number' && customPrice > 0
                  ? customPrice
                  : Number(p.wholesalePriceIqd || 0),
              availableQty,
              nearestExpiryDate: activeBatches[0]?.expiryDate || null,
            };
          });
        return {
          ...w,
          uid: wUid,
          creditPolicy: policy,
          products,
        };
      });

      // Multi-wholesaler comparison table grouped by canonical medicineId
      const comparisonMap = new Map<
        string,
        {
          medicineId: string;
          scientificName: string;
          brandName: string;
          strength: string;
          dosageForm: string;
          packSize: string;
          offers: Array<{
            wholesalerUid: string;
            wholesalerName: string;
            governorate: string;
            productId: string;
            wholesalePriceIqd: number;
            effectivePriceIqd: number;
            minimumOrderQty: number;
            bonusRuleLabel?: string;
            manufacturer?: string;
            country?: string;
            availableQty: number;
            nearestExpiryDate?: string | null;
          }>;
        }
      >();

      for (const wh of wholesalers as Array<Record<string, unknown>>) {
        const whUid = String(wh.uid || '');
        const whName = String(wh.wholesalerNameAr || wh.wholesalerNameEn || '');
        const whGov = String(wh.governorate || '');
        const prods = Array.isArray(wh.products) ? (wh.products as Array<Record<string, unknown>>) : [];
        for (const prod of prods) {
          const medId = String(prod.medicineId || '');
          if (!medId) continue;
          const group = comparisonMap.get(medId) || {
            medicineId: medId,
            scientificName: String(prod.scientificName || ''),
            brandName: String(prod.brandName || ''),
            strength: String(prod.strength || ''),
            dosageForm: String(prod.dosageForm || ''),
            packSize: String(prod.packSize || ''),
            offers: [],
          };
          group.offers.push({
            wholesalerUid: whUid,
            wholesalerName: whName,
            governorate: whGov,
            productId: String(prod.productId || ''),
            wholesalePriceIqd: Number(prod.wholesalePriceIqd || 0),
            effectivePriceIqd: Number(prod.effectivePriceIqd || prod.wholesalePriceIqd || 0),
            minimumOrderQty: Number(prod.minimumOrderQty || 1),
            bonusRuleLabel: prod.bonusRuleLabel ? String(prod.bonusRuleLabel) : undefined,
            manufacturer: prod.manufacturer ? String(prod.manufacturer) : undefined,
            country: prod.country ? String(prod.country) : undefined,
            availableQty: Number(prod.availableQty || 0),
            nearestExpiryDate: prod.nearestExpiryDate ? String(prod.nearestExpiryDate) : null,
          });
          comparisonMap.set(medId, group);
        }
      }

      const priceComparisonByMedicine = Array.from(comparisonMap.values())
        .map((g) => ({
          ...g,
          offers: g.offers.sort((a, b) => a.effectivePriceIqd - b.effectivePriceIqd),
        }))
        .sort((a, b) => b.offers.length - a.offers.length);

      const mySupplyOrders = ordSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      res.json({
        ok: true,
        wholesalers,
        supplyOrders: mySupplyOrders,
        priceComparisonByMedicine,
      });
    } catch (err) {
      console.error('[MEDORA][PharmacyWholesalersBrowse] error:', err);
      res.status(500).json({ error: 'WHOLESALER_BROWSE_FAILED' });
    }
  });

  // Pharmacy submits B2B supply order to Approved Wholesaler
  router.post('/pharmacy/wholesaler-orders', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSupplyOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const wholesalerUid = normalizeStr(req.body?.wholesalerUid, 128);
    const paymentMethod = req.body?.paymentMethod === 'credit_account' ? 'credit_account' : 'cash_on_delivery';
    const notes = normalizeStr(req.body?.notes, 500);
    const clientRequestKey = normalizeStr(req.body?.clientRequestKey, 128);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!wholesalerUid || rawItems.length === 0) {
      res.status(400).json({ error: 'INVALID_SUPPLY_ORDER_INPUT' });
      return;
    }

    if (clientRequestKey) {
      const dup = await db
        .collection('wholesaler_supply_orders')
        .where('pharmacyUid', '==', ctx.pharmacyUid)
        .where('clientRequestKey', '==', clientRequestKey)
        .limit(1)
        .get();
      if (!dup.empty) {
        res.status(200).json({ ok: true, supplyOrder: serializeDoc(dup.docs[0].data()), duplicate: true });
        return;
      }
    }

    const whSnap = await db.doc(`wholesaler_profiles/${wholesalerUid}`).get();
    if (!whSnap.exists || whSnap.data()?.status !== 'Approved') {
      res.status(403).json({ error: 'WHOLESALER_NOT_APPROVED' });
      return;
    }
    const wh = serializeDoc(whSnap.data());

    const policySnap = await db.doc(`wholesaler_credit_policies/pol_${wholesalerUid}_${ctx.pharmacyUid}`).get();
    const policy = policySnap.exists ? serializeDoc(policySnap.data()) : null;
    if (paymentMethod === 'credit_account' && (!policy || policy.creditEnabled !== true)) {
      res.status(403).json({ error: 'CREDIT_NOT_ENABLED_BY_WHOLESALER' });
      return;
    }

    const customPrices = (policy?.customPricesByProductId as Record<string, number> | undefined) || {};
    const items: Array<Record<string, unknown>> = [];
    let subtotalIqd = 0;

    for (const raw of rawItems) {
      const productId = normalizeStr(raw?.productId, 128);
      const qty = Math.floor(normalizeNum(raw?.requestedQty, 1, 100000, 0));
      if (!productId || qty <= 0) continue;
      const pSnap = await db.doc(`wholesaler_products/${productId}`).get();
      if (!pSnap.exists || pSnap.data()?.wholesalerUid !== wholesalerUid || pSnap.data()?.isActive !== true) {
        res.status(400).json({ error: `WHOLESALER_PRODUCT_UNAVAILABLE:${productId}` });
        return;
      }
      const p = pSnap.data() as Record<string, unknown>;
      const minQty = Number(p.minimumOrderQty || 1);
      if (qty < minQty) {
        res.status(400).json({ error: `BELOW_MINIMUM_ORDER_QTY:${String(p.brandName || productId)}` });
        return;
      }
      const unitPrice =
        typeof customPrices[productId] === 'number' && customPrices[productId] > 0
          ? customPrices[productId]
          : Number(p.wholesalePriceIqd || 0);
      const lineTotal = unitPrice * qty;
      subtotalIqd += lineTotal;
      items.push({
        itemId: safeId('soi'),
        productId,
        medicineId: String(p.medicineId || ''),
        medicineName: `${String(p.brandName || p.scientificName || '')} (${String(p.strength || '')})`,
        requestedQty: qty,
        approvedQty: 0,
        unitPriceIqd: unitPrice,
        lineTotalIqd: lineTotal,
        batchAllocations: [],
      });
    }

    if (items.length === 0) {
      res.status(400).json({ error: 'NO_VALID_SUPPLY_ITEMS' });
      return;
    }

    const discountPct = Number(policy?.customDiscountPercent || 0);
    const discountIqd = Math.round((subtotalIqd * discountPct) / 100);
    const totalIqd = Math.max(0, subtotalIqd - discountIqd);

    if (totalIqd < Number(wh.minimumOrderIqd || 0)) {
      res.status(400).json({ error: 'BELOW_WHOLESALER_MINIMUM_ORDER' });
      return;
    }

    const orderId = safeId('wsup');
    const orderNumber = `SUP-${Date.now().toString().slice(-6)}`;
    const orderDoc = {
      orderId,
      orderNumber,
      wholesalerUid,
      wholesalerName: String(wh.wholesalerNameAr || wh.wholesalerNameEn || 'Wholesaler'),
      pharmacyUid: ctx.pharmacyUid,
      pharmacyInstitutionId: ctx.institutionId,
      pharmacyName: ctx.pharmacyProfile.pharmacyNameAr,
      pharmacyGovernorate: ctx.pharmacyProfile.governorate,
      pharmacyAddress: ctx.pharmacyProfile.address,
      status: 'Submitted',
      paymentMethod,
      paymentStatus: 'unpaid',
      subtotalIqd,
      discountIqd,
      deliveryFeeIqd: 0,
      totalIqd,
      notes,
      amendmentPendingPharmacyApproval: false,
      items,
      ...(clientRequestKey ? { clientRequestKey } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.doc(`wholesaler_supply_orders/${orderId}`).set(orderDoc);
    await appendPharmacyAudit(
      db,
      ctx,
      'SUPPLY_ORDER_SUBMITTED',
      'wholesaler_supply_orders',
      orderId,
      `Submitted supply order ${orderNumber} to ${orderDoc.wholesalerName} (${totalIqd} IQD)`,
    );

    const engine = getGlobalNotificationEngine();
    await engine
      ?.dispatch({
        eventType: 'wholesaler_request_submitted',
        recipientUid: wholesalerUid,
        recipientRole: 'wholesaler',
        title: `طلب توريد صيدلاني جديد (${orderNumber})`,
        body: `من ${ctx.pharmacyProfile.pharmacyNameAr} بقيمة ${totalIqd.toLocaleString()} د.ع.`,
        inAppType: 'wholesaler_request_submitted',
        relatedId: orderId,
        relatedType: 'wholesaler_supply_order',
        idempotencyKey: `wh_sup_${orderId}`,
      })
      .catch(() => undefined);

    const saved = await db.doc(`wholesaler_supply_orders/${orderId}`).get();
    res.status(201).json({ ok: true, supplyOrder: serializeDoc(saved.data()) });
  });

  // Pharmacy accepts or rejects wholesaler's proposed price/qty amendment explicitly
  router.post('/pharmacy/wholesaler-orders/:orderId/amendment-decision', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSupplyOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const accept = req.body?.accept === true;
    const todayStr = getTodayBaghdadDateStr();

    try {
      await db.runTransaction(async (tx) => {
        const ordRef = db.doc(`wholesaler_supply_orders/${orderId}`);
        const ordSnap = await tx.get(ordRef);
        if (!ordSnap.exists || ordSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('SUPPLY_ORDER_NOT_FOUND');
        }
        const ord = serializeDoc(ordSnap.data()) as unknown as WholesalerSupplyOrder;
        if (ord.status !== 'Amendment Proposed' || !ord.amendmentPendingPharmacyApproval) {
          throw new Error('NO_PENDING_AMENDMENT');
        }

        if (!accept) {
          tx.update(ordRef, {
            status: 'Cancelled',
            amendmentPendingPharmacyApproval: false,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return;
        }

        // Reserve FEFO batches on wholesaler side upon explicit pharmacy acceptance of amendment
        const updatedItems = [];
        let subtotalIqd = 0;
        for (const item of ord.items) {
          const qty = Math.max(0, Number(item.approvedQty || item.requestedQty || 0));
          const unitPrice = Number(item.proposedUnitPriceIqd ?? item.unitPriceIqd ?? 0);
          if (qty <= 0) {
            updatedItems.push({ ...item, unitPriceIqd: unitPrice, lineTotalIqd: 0, batchAllocations: [] });
            continue;
          }
          const bSnap = await tx.get(
            db
              .collection('wholesaler_batches')
              .where('wholesalerUid', '==', ord.wholesalerUid)
              .where('productId', '==', item.productId),
          );
          const batches = bSnap.docs.map((d) => serializeDoc(d.data()) as unknown as {
            batchId: string;
            batchNumber: string;
            expiryDate: string;
            availableQty: number;
            reservedQty: number;
            purchaseCostIqd: number;
          });
          const fefo = allocateFefoBatches(batches, qty, todayStr);
          if (!fefo.ok) throw new Error(`WHOLESALER_STOCK_CHANGED:${item.medicineName}`);

          for (const alloc of fefo.allocations) {
            const matching = batches.find((x) => x.batchId === alloc.batchId)!;
            tx.update(db.doc(`wholesaler_batches/${alloc.batchId}`), {
              reservedQty: Number(matching.reservedQty || 0) + alloc.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          const lineTotal = unitPrice * qty;
          subtotalIqd += lineTotal;
          updatedItems.push({
            ...item,
            unitPriceIqd: unitPrice,
            lineTotalIqd: lineTotal,
            batchAllocations: fefo.allocations.map((a) => ({
              batchId: a.batchId,
              batchNumber: a.batchNumber,
              expiryDate: a.expiryDate,
              quantity: a.quantity,
              purchaseCostIqd: a.purchasePriceIqd,
            })),
          });
        }

        tx.update(ordRef, {
          status: 'Accepted',
          amendmentPendingPharmacyApproval: false,
          items: updatedItems,
          subtotalIqd,
          totalIqd: Math.max(0, subtotalIqd - Number(ord.discountIqd || 0) + Number(ord.deliveryFeeIqd || 0)),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      res.json({ ok: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'AMENDMENT_DECISION_FAILED';
      res.status(code === 'SUPPLY_ORDER_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Pharmacy confirms receipt of Shipped/Delivered wholesaler order -> atomic two-sided inventory transfer
  router.post('/pharmacy/wholesaler-orders/:orderId/confirm-receipt', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageBatches' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const discrepancyNote = normalizeStr(req.body?.discrepancyNote, 400);
    const todayStr = getTodayBaghdadDateStr();

    try {
      const receiptResult = await db.runTransaction(async (tx) => {
        const ordRef = db.doc(`wholesaler_supply_orders/${orderId}`);
        const ordSnap = await tx.get(ordRef);
        if (!ordSnap.exists || ordSnap.data()?.pharmacyUid !== ctx.pharmacyUid) {
          throw new Error('SUPPLY_ORDER_NOT_FOUND');
        }
        const ord = serializeDoc(ordSnap.data()) as unknown as WholesalerSupplyOrder & {
          inventoryCommitted?: boolean;
          receiptIssued?: boolean;
        };
        if (ord.status === 'Completed' || ord.receivedByPharmacyAt || ord.inventoryCommitted) {
          throw new Error('ORDER_ALREADY_RECEIVED');
        }
        if (ord.status !== 'Shipped' && ord.status !== 'Delivered') {
          throw new Error('ORDER_NOT_IN_SHIPPED_OR_DELIVERED_STATE');
        }

        // Pre-read ALL documents before performing any writes
        const whProdByProductId = new Map<string, Record<string, unknown>>();
        const phProdIdByMedicineId = new Map<string, string>();
        const whBatchById = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>();

        for (const item of ord.items || []) {
          const qty = Number(item.approvedQty || item.requestedQty || 0);
          if (qty <= 0) continue;

          if (!whProdByProductId.has(item.productId)) {
            const whProdSnap = await tx.get(db.doc(`wholesaler_products/${item.productId}`));
            whProdByProductId.set(
              item.productId,
              whProdSnap.exists ? (whProdSnap.data() as Record<string, unknown>) : {},
            );
          }

          if (!phProdIdByMedicineId.has(item.medicineId)) {
            const phProdSnap = await tx.get(
              db
                .collection('pharmacy_products')
                .where('pharmacyUid', '==', ctx.pharmacyUid)
                .where('medicineId', '==', item.medicineId)
                .limit(1),
            );
            phProdIdByMedicineId.set(
              item.medicineId,
              phProdSnap.empty ? '' : phProdSnap.docs[0].id,
            );
          }

          for (const alloc of item.batchAllocations || []) {
            if (isBatchExpired(alloc.expiryDate, todayStr)) {
              throw new Error(`CANNOT_RECEIVE_EXPIRED_BATCH:${alloc.batchNumber}`);
            }
            if (!whBatchById.has(alloc.batchId)) {
              const wbRef = db.doc(`wholesaler_batches/${alloc.batchId}`);
              const wbSnap = await tx.get(wbRef);
              if (wbSnap.exists) {
                whBatchById.set(alloc.batchId, {
                  ref: wbRef,
                  data: wbSnap.data() as Record<string, unknown>,
                });
              }
            }
          }
        }

        const invRef = db.doc(`wholesaler_invoices/winv_${orderId}`);
        const whProfileRef = db.doc(`wholesaler_profiles/${ord.wholesalerUid}`);
        const [existingInvSnap, whProfileSnap, preReadReceipt] = await Promise.all([
          tx.get(invRef),
          tx.get(whProfileRef),
          preReadReceiptStateInTx(db, tx, orderId),
        ]);
        const whProf = whProfileSnap.exists ? (whProfileSnap.data() as Record<string, unknown>) : {};

        let batchesTransferred = 0;

        for (const item of ord.items || []) {
          const qty = Number(item.approvedQty || item.requestedQty || 0);
          if (qty <= 0) continue;

          const whProd = whProdByProductId.get(item.productId) || {};
          let pharmacyProductId = phProdIdByMedicineId.get(item.medicineId) || '';

          if (!pharmacyProductId) {
            pharmacyProductId = safeId('pprod');
            phProdIdByMedicineId.set(item.medicineId, pharmacyProductId);
            const suggestedRetail = Math.round(Number(item.unitPriceIqd || 1000) * 1.2);
            tx.set(db.doc(`pharmacy_products/${pharmacyProductId}`), {
              productId: pharmacyProductId,
              pharmacyUid: ctx.pharmacyUid,
              institutionId: ctx.institutionId,
              medicineId: item.medicineId,
              scientificName: String(whProd.scientificName || item.medicineName),
              activeIngredient: String(whProd.activeIngredient || item.medicineName),
              brandName: String(whProd.brandName || item.medicineName),
              strength: String(whProd.strength || ''),
              dosageForm: String(whProd.dosageForm || 'tablet'),
              packSize: String(whProd.packSize || ''),
              manufacturer: String(whProd.manufacturer || ''),
              country: String(whProd.country || ''),
              imageReference: String(whProd.imageReference || ''),
              barcode: String(whProd.barcode || ''),
              sku: pharmacyProductId,
              requiresPrescription: true,
              controlledDrug: false,
              therapeuticCategory: 'General',
              sellingPriceIqd: suggestedRetail,
              discountPriceIqd: null,
              minStockThreshold: 5,
              reorderLevel: 5,
              expiryAlertDays: 60,
              allowPartialPack: false,
              availableForPatientOrders: true,
              isActive: true,
              reviewStatus: 'approved',
              isPublishedToPatients: true,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          for (const alloc of item.batchAllocations || []) {
            const wbEntry = whBatchById.get(alloc.batchId);
            if (wbEntry) {
              const wb = wbEntry.data;
              const nextWhAvail = Math.max(0, Number(wb.availableQty || 0) - Number(alloc.quantity || 0));
              const nextWhRes = Math.max(0, Number(wb.reservedQty || 0) - Number(alloc.quantity || 0));
              wb.availableQty = nextWhAvail;
              wb.reservedQty = nextWhRes;
              tx.update(wbEntry.ref, {
                availableQty: nextWhAvail,
                reservedQty: nextWhRes,
                updatedAt: FieldValue.serverTimestamp(),
              });
              const wMovId = safeId('wmov');
              tx.set(db.doc(`wholesaler_inventory_movements/${wMovId}`), {
                movementId: wMovId,
                wholesalerUid: ord.wholesalerUid,
                productId: item.productId,
                batchId: alloc.batchId,
                batchNumber: alloc.batchNumber,
                movementType: 'commit_dispatch',
                quantityDelta: -Number(alloc.quantity || 0),
                reservedDelta: -Number(alloc.quantity || 0),
                reason: `Pharmacy confirmed receipt (${ord.orderNumber})`,
                relatedOrderId: orderId,
                actorUid: ctx.actor.uid,
                actorName: ctx.actor.name,
                createdAt: FieldValue.serverTimestamp(),
              });
            }

            const pbId = safeId('pbatch');
            tx.set(db.doc(`pharmacy_batches/${pbId}`), {
              batchId: pbId,
              pharmacyUid: ctx.pharmacyUid,
              institutionId: ctx.institutionId,
              productId: pharmacyProductId,
              medicineId: item.medicineId,
              productName: item.medicineName,
              batchNumber: alloc.batchNumber,
              expiryDate: alloc.expiryDate,
              availableQty: Number(alloc.quantity || 0),
              reservedQty: 0,
              purchasePriceIqd: Number(item.unitPriceIqd || 0),
              sourceType: 'wholesaler_delivery',
              sourceOrderId: orderId,
              wholesalerUid: ord.wholesalerUid,
              isExpired: false,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            const pMovId = safeId('pmov');
            tx.set(db.doc(`pharmacy_inventory_movements/${pMovId}`), {
              movementId: pMovId,
              pharmacyUid: ctx.pharmacyUid,
              productId: pharmacyProductId,
              batchId: pbId,
              batchNumber: alloc.batchNumber,
              movementType: 'receive_batch',
              quantityDelta: Number(alloc.quantity || 0),
              reservedDelta: 0,
              reason: `Received from ${ord.wholesalerName} (${ord.orderNumber})`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
            batchesTransferred += 1;
          }
        }

        const completedAtIso = new Date().toISOString();
        const isCredit = ord.paymentMethod === 'credit_account';

        if (!existingInvSnap.exists) {
          tx.set(invRef, {
            invoiceId: `winv_${orderId}`,
            invoiceNumber: `INV-WH-${ord.orderNumber}`,
            wholesalerUid: ord.wholesalerUid,
            wholesalerName: ord.wholesalerName,
            pharmacyUid: ord.pharmacyUid,
            pharmacyName: ord.pharmacyName,
            orderId,
            orderNumber: ord.orderNumber,
            subtotalIqd: ord.subtotalIqd,
            discountIqd: ord.discountIqd,
            deliveryFeeIqd: ord.deliveryFeeIqd,
            totalIqd: ord.totalIqd,
            paidAmountIqd: isCredit ? 0 : ord.totalIqd,
            balanceDueIqd: isCredit ? ord.totalIqd : 0,
            paymentMethod: ord.paymentMethod,
            status: isCredit ? 'unpaid' : 'paid',
            items: ord.items,
            issuedAt: completedAtIso,
          });
        }

        const issued = await issueUnifiedReceiptOnCompletion(
          db,
          tx,
          {
            transactionType: 'wholesaler_to_pharmacy',
            orderId,
            orderNumber: ord.orderNumber,
            sellerUid: ord.wholesalerUid,
            sellerRole: 'wholesaler',
            sellerName: ord.wholesalerName,
            sellerInstitutionId: String(whProf.institutionId || ''),
            sellerGovernorate: String(whProf.governorate || ''),
            sellerAddress: String(whProf.warehouseAddress || ''),
            sellerPhone: String(whProf.professionalPhone || ''),
            buyerUid: ctx.pharmacyUid,
            buyerRole: 'pharmacy',
            buyerName: ctx.pharmacyProfile.pharmacyNameAr || ord.pharmacyName,
            buyerInstitutionId: ctx.institutionId,
            buyerGovernorate: ctx.pharmacyProfile.governorate,
            buyerAddress: ctx.pharmacyProfile.address,
            buyerPhone: ctx.pharmacyProfile.professionalPhone,
            items: (ord.items || []).map((it) => ({
              productId: it.productId,
              medicineId: it.medicineId,
              medicineName: it.medicineName,
              quantity: Number(it.approvedQty || it.requestedQty || 0),
              unitPriceIqd: Number(it.unitPriceIqd || 0),
              lineTotalIqd: Number(it.lineTotalIqd || 0),
              batchNumbers: (it.batchAllocations || []).map((b) => b.batchNumber),
              expiryDates: (it.batchAllocations || []).map((b) => b.expiryDate),
            })),
            subtotalAmountIqd: Number(ord.subtotalIqd || 0),
            discountAmountIqd: Number(ord.discountIqd || 0),
            deliveryFeeIqd: Number(ord.deliveryFeeIqd || 0),
            totalAmountIqd: Number(ord.totalIqd || 0),
            paidAmountIqd: isCredit ? 0 : Number(ord.totalIqd || 0),
            balanceDueIqd: isCredit ? Number(ord.totalIqd || 0) : 0,
            paymentMethod: isCredit ? 'credit_account' : 'cash_on_delivery',
            paymentStatus: isCredit ? 'credit_open' : 'paid',
            fulfillmentType: 'seller_delivery',
            ...(discrepancyNote ? { notes: discrepancyNote } : {}),
            actorUid: ctx.actor.uid,
            actorName: ctx.actor.name,
            actorRole: ctx.actorRole,
            completedAtIso,
          },
          preReadReceipt,
        );

        tx.update(ordRef, {
          status: 'Completed',
          receivedByPharmacyAt: completedAtIso,
          inventoryCommitted: true,
          receiptIssued: true,
          receiptId: issued.receipt.receiptId,
          receiptNumber: issued.receipt.receiptNumber,
          paymentStatus: isCredit ? 'unpaid' : 'paid',
          ...(discrepancyNote ? { receiptDiscrepancyNote: discrepancyNote } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          orderNumber: ord.orderNumber,
          wholesalerUid: ord.wholesalerUid,
          batchesTransferred,
          receiptId: issued.receipt.receiptId,
          receiptNumber: issued.receipt.receiptNumber,
        };
      });

      await appendPharmacyAudit(
        db,
        ctx,
        'WHOLESALER_SUPPLY_RECEIVED',
        'wholesaler_supply_orders',
        orderId,
        `Confirmed receipt of ${receiptResult.orderNumber} (${receiptResult.batchesTransferred} batches transferred, receipt ${receiptResult.receiptNumber})`,
      );

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'wholesaler_order_status_updated',
          recipientUid: receiptResult.wholesalerUid,
          recipientRole: 'wholesaler',
          title: `تم استلام الشحنة وإصدار الإيصال (${receiptResult.receiptNumber})`,
          body: `أكدت صيدلية ${ctx.pharmacyProfile.pharmacyNameAr} استلام الطلب ${receiptResult.orderNumber}.`,
          inAppType: 'wholesaler_order_status_updated',
          relatedId: orderId,
          relatedType: 'wholesaler_supply_order',
          idempotencyKey: `wh_rcpt_${orderId}`,
        })
        .catch(() => undefined);

      res.json({ ok: true, ...receiptResult });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'CONFIRM_RECEIPT_FAILED';
      res.status(code === 'ORDER_ALREADY_RECEIVED' ? 409 : 400).json({ error: code });
    }
  });

  // Pharmacy Staff RBAC management
  router.post('/pharmacy/staff', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { ownerOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const email = normalizeStr(req.body?.email, 254).toLowerCase();
    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const syndicateNumber = normalizeStr(req.body?.syndicateNumber, 80);
    const rawRole = normalizeStr(req.body?.role, 40) as PharmacyStaffRole;
    const role: PharmacyStaffRole = VALID_PHARMACY_ROLES.has(rawRole) && rawRole !== 'owner' ? rawRole : 'pharmacist';
    const permissions = Array.isArray(req.body?.permissions)
      ? (req.body.permissions as PharmacyPermissionKey[])
      : PHARMACY_ROLE_PERMISSIONS[role];

    if (!email || !email.includes('@') || fullName.length < 2) {
      res.status(400).json({ error: 'INVALID_STAFF_INPUT' });
      return;
    }

    const staffId = safeId('pstaff');
    await db.doc(`pharmacy_staff/${staffId}`).set({
      staffId,
      pharmacyUid: ctx.pharmacyUid,
      institutionId: ctx.institutionId,
      email,
      fullName,
      phone,
      syndicateNumber,
      role,
      permissions,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await appendPharmacyAudit(db, ctx, 'STAFF_ADDED', 'pharmacy_staff', staffId, `Added ${fullName} (${role})`);
    const saved = await db.doc(`pharmacy_staff/${staffId}`).get();
    res.status(201).json({ ok: true, staffMember: serializeDoc(saved.data()) });
  });

  router.patch('/pharmacy/staff/:staffId', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { ownerOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const staffId = normalizeStr(req.params.staffId, 128);
    const ref = db.doc(`pharmacy_staff/${staffId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'STAFF_NOT_FOUND' });
      return;
    }

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (req.body?.status && ['active', 'suspended', 'revoked'].includes(req.body.status)) {
      patch.status = req.body.status;
    }
    if (req.body?.role && VALID_PHARMACY_ROLES.has(req.body.role) && req.body.role !== 'owner') {
      patch.role = req.body.role;
    }
    if (Array.isArray(req.body?.permissions)) {
      patch.permissions = req.body.permissions;
    }
    await ref.update(patch);
    const updated = await ref.get();
    res.json({ ok: true, staffMember: serializeDoc(updated.data()) });
  });

  // Pharmacy communications
  router.post('/pharmacy/communications', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageCommunications' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const channelType = normalizeStr(req.body?.channelType, 40);
    const relatedId = normalizeStr(req.body?.relatedId, 128) || ctx.pharmacyUid;
    const body = normalizeStr(req.body?.body, 1000);
    if (!['patient_order', 'doctor_clarification', 'wholesaler_supply', 'super_admin'].includes(channelType) || body.length < 1) {
      res.status(400).json({ error: 'INVALID_COMMUNICATION_INPUT' });
      return;
    }

    const messageId = safeId('pcomm');
    await db.doc(`pharmacy_communications/${messageId}`).set({
      messageId,
      pharmacyUid: ctx.pharmacyUid,
      channelType,
      relatedId,
      senderUid: ctx.actor.uid,
      senderName: ctx.actor.name,
      senderRole: ctx.staffRole,
      body,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const saved = await db.doc(`pharmacy_communications/${messageId}`).get();
    res.status(201).json({ ok: true, message: serializeDoc(saved.data()) });
  });

  router.post('/pharmacy/notifications/:notificationId/read', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res);
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const notificationId = normalizeStr(req.params.notificationId, 128);
    const ref = db.doc(`pharmacy_notifications/${notificationId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
      return;
    }
    await ref.update({ isRead: true });
    res.json({ ok: true });
  });

  // Pharmacy settings (delivery zones, working hours, payment methods)
  router.put('/pharmacy/settings', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const rawZones = Array.isArray(req.body?.deliveryZones) ? req.body.deliveryZones : undefined;
    const deliveryZones: PharmacyDeliveryZone[] | undefined = rawZones
      ? rawZones.slice(0, 50).map((z: Record<string, unknown>) => ({
          zoneId: normalizeStr(z.zoneId, 60) || safeId('zone'),
          governorate: normalizeStr(z.governorate, 80),
          district: normalizeStr(z.district, 80),
          feeIqd: normalizeNum(z.feeIqd, 0, 500000, 0),
          minOrderIqd: normalizeNum(z.minOrderIqd, 0, 10000000, 0),
          estimatedMinutes: normalizeNum(z.estimatedMinutes, 5, 1440, 45),
          isActive: z.isActive !== false,
        }))
      : undefined;

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof req.body?.workingDaysAndHours === 'string') {
      patch.workingDaysAndHours = normalizeStr(req.body.workingDaysAndHours, 240);
    }
    if (typeof req.body?.is24Hours === 'boolean') patch.is24Hours = req.body.is24Hours;
    if (typeof req.body?.deliveryAvailable === 'boolean') patch.deliveryAvailable = req.body.deliveryAvailable;
    if (typeof req.body?.pickupAvailable === 'boolean') patch.pickupAvailable = req.body.pickupAvailable;
    if (req.body?.minimumOrderIqd !== undefined) {
      patch.minimumOrderIqd = normalizeNum(req.body.minimumOrderIqd, 0, 10000000, 0);
    }
    if (typeof req.body?.taxNumber === 'string') patch.taxNumber = normalizeStr(req.body.taxNumber, 80);
    if (deliveryZones) patch.deliveryZones = deliveryZones;
    if (Array.isArray(req.body?.acceptedPaymentMethods)) {
      const valid = (req.body.acceptedPaymentMethods as unknown[]).filter(
        (m): m is 'cash_on_pickup' | 'cash_on_delivery' =>
          m === 'cash_on_pickup' || m === 'cash_on_delivery',
      );
      if (valid.length > 0) patch.acceptedPaymentMethods = valid;
    }

    await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).update(patch);
    await appendPharmacyAudit(
      db,
      ctx,
      'SETTINGS_UPDATED',
      'pharmacy_profiles',
      ctx.pharmacyUid,
      'Updated pharmacy operational & delivery settings',
    );
    const updated = await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).get();
    res.json({ ok: true, pharmacyProfile: serializeDoc(updated.data()) });
  });

  // Upload pharmacy storefront/marketing/medicine image (JPEG/PNG/WEBP stored safely in pharmacy_media)
  router.post('/pharmacy/media/upload', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res);
    if (!ctx) return;
    if (
      ctx.actorRole !== 'pharmacy_owner' &&
      !ctx.permissions.includes('manageSettings') &&
      !ctx.permissions.includes('manageCatalog')
    ) {
      res.status(403).json({ error: 'PHARMACY_PERMISSION_DENIED' });
      return;
    }
    const db = deps.getAdminDb()!;

    const decoded = decodeAndValidateBase64Asset({
      dataBase64: req.body?.dataBase64,
      mimeType: req.body?.mimeType,
      fileName: req.body?.fileName,
      allowPdf: false,
    });
    if (!decoded.ok) {
      res.status(400).json({ error: decoded.error });
      return;
    }

    const bucketInfo = deps.resolveReadyStorageBucket
      ? await deps.resolveReadyStorageBucket().catch(() => null)
      : null;

    try {
      const stored = await storeUploadedMediaAsset({
        adminDb: db,
        bucketInfo,
        hasServiceCredentials: deps.hasServiceCredentials ? deps.hasServiceCredentials() : false,
        ownerUid: ctx.pharmacyUid,
        folder: 'pharmacy_media',
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
        meta: { doctorUid: ctx.pharmacyUid },
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
      const code = err instanceof Error ? err.message : 'PHARMACY_MEDIA_UPLOAD_FAILED';
      if (code === 'FILE_TOO_LARGE') {
        res.status(413).json({ error: 'FILE_TOO_LARGE' });
        return;
      }
      console.error('[MEDORA][PharmacyMediaUpload] error:', err);
      res.status(500).json({ error: 'PHARMACY_MEDIA_UPLOAD_FAILED' });
    }
  });

  // Update Pharmacy Branding, Storefront Profile & Contact Info (official licensing stays Super-Admin locked)
  router.put('/pharmacy/profile', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof req.body?.pharmacyNameAr === 'string' && req.body.pharmacyNameAr.trim().length >= 2) {
      patch.pharmacyNameAr = normalizeStr(req.body.pharmacyNameAr, 160);
    }
    if (typeof req.body?.pharmacyNameEn === 'string' && req.body.pharmacyNameEn.trim().length >= 2) {
      patch.pharmacyNameEn = normalizeStr(req.body.pharmacyNameEn, 160);
    }
    if (typeof req.body?.professionalPhone === 'string' && req.body.professionalPhone.trim().length >= 6) {
      patch.professionalPhone = normalizeStr(req.body.professionalPhone, 32);
    }
    if (typeof req.body?.governorate === 'string' && req.body.governorate.trim().length >= 2) {
      patch.governorate = normalizeStr(req.body.governorate, 80);
    }
    if (typeof req.body?.district === 'string' && req.body.district.trim().length >= 2) {
      patch.district = normalizeStr(req.body.district, 80);
    }
    if (typeof req.body?.address === 'string' && req.body.address.trim().length >= 2) {
      patch.address = normalizeStr(req.body.address, 240);
    }
    if (typeof req.body?.mapLocationUrl === 'string') {
      patch.mapLocationUrl = normalizeStr(req.body.mapLocationUrl, 500);
    }
    if (typeof req.body?.workingDaysAndHours === 'string' && req.body.workingDaysAndHours.trim().length >= 2) {
      patch.workingDaysAndHours = normalizeStr(req.body.workingDaysAndHours, 240);
    }
    if (typeof req.body?.is24Hours === 'boolean') patch.is24Hours = req.body.is24Hours;
    if (typeof req.body?.deliveryAvailable === 'boolean') patch.deliveryAvailable = req.body.deliveryAvailable;
    if (typeof req.body?.pickupAvailable === 'boolean') patch.pickupAvailable = req.body.pickupAvailable;
    if (req.body?.minimumOrderIqd !== undefined) {
      patch.minimumOrderIqd = normalizeNum(req.body.minimumOrderIqd, 0, 10000000, 0);
    }
    if (typeof req.body?.logoUrl === 'string') patch.logoUrl = normalizeStr(req.body.logoUrl, 1000);
    if (typeof req.body?.logoPath === 'string') patch.logoPath = normalizeStr(req.body.logoPath, 400);
    if (typeof req.body?.coverImageUrl === 'string') patch.coverImageUrl = normalizeStr(req.body.coverImageUrl, 1000);
    if (typeof req.body?.coverImagePath === 'string') patch.coverImagePath = normalizeStr(req.body.coverImagePath, 400);
    if (typeof req.body?.taglineAr === 'string') patch.taglineAr = normalizeStr(req.body.taglineAr, 200);
    if (typeof req.body?.taglineEn === 'string') patch.taglineEn = normalizeStr(req.body.taglineEn, 200);
    if (typeof req.body?.aboutAr === 'string') patch.aboutAr = normalizeStr(req.body.aboutAr, 1200);
    if (typeof req.body?.aboutEn === 'string') patch.aboutEn = normalizeStr(req.body.aboutEn, 1200);
    if (typeof req.body?.publicSlug === 'string') {
      const slug = req.body.publicSlug
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      if (slug) patch.publicSlug = slug;
    }

    await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).update(patch);
    await appendPharmacyAudit(
      db,
      ctx,
      'PHARMACY_PROFILE_UPDATED',
      'pharmacy_profiles',
      ctx.pharmacyUid,
      'Updated pharmacy partner branding, storefront details & services',
    );
    const updated = await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).get();
    res.json({ ok: true, pharmacyProfile: serializeDoc(updated.data()) });
  });

  // Marketing Banner & Featured Request (always gated by Super Admin approval)
  router.put('/pharmacy/marketing', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const titleAr = normalizeStr(req.body?.promotionalBannerTitleAr, 200);
    const titleEn = normalizeStr(req.body?.promotionalBannerTitleEn, 200);
    const bodyAr = normalizeStr(req.body?.promotionalBannerBodyAr, 600);
    const bodyEn = normalizeStr(req.body?.promotionalBannerBodyEn, 600);
    const imageUrl = normalizeStr(req.body?.promotionalBannerImageUrl, 1000);
    const imagePath = normalizeStr(req.body?.promotionalBannerImagePath, 400);
    const hasBannerContent = Boolean(titleAr || titleEn || bodyAr || bodyEn || imageUrl);

    const patch: Record<string, unknown> = {
      promotionalBannerTitleAr: titleAr,
      promotionalBannerTitleEn: titleEn,
      promotionalBannerBodyAr: bodyAr,
      promotionalBannerBodyEn: bodyEn,
      promotionalBannerImageUrl: imageUrl,
      promotionalBannerImagePath: imagePath,
      // Any edit to promotional content resets review status to pending_review (never self-approves)
      marketingApprovalStatus: hasBannerContent ? 'pending_review' : 'draft',
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (req.body?.requestFeatured === true && ctx.pharmacyProfile.featuredStatus !== 'approved') {
      patch.featuredStatus = 'requested';
    }

    await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).update(patch);
    await appendPharmacyAudit(
      db,
      ctx,
      'PHARMACY_MARKETING_SUBMITTED',
      'pharmacy_profiles',
      ctx.pharmacyUid,
      'Submitted promotional banner / featured placement for Super Admin review',
    );
    if (hasBannerContent) {
      await emitAdminNotification(db, {
        title: `طلب مراجعة محتوى تسويقي لصيدلية: ${ctx.pharmacyProfile.pharmacyNameAr}`,
        body: titleAr || titleEn || 'تم تحديث البانر الترويجي لصيدلية بانتظار موافقة الإدارة.',
        relatedType: 'pharmacy_marketing',
        relatedId: ctx.pharmacyUid,
      }).catch(() => undefined);
    }

    const updated = await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).get();
    res.json({ ok: true, pharmacyProfile: serializeDoc(updated.data()) });
  });

  // Special Offers Manager (always created with approvalStatus = 'pending_review')
  router.post('/pharmacy/marketing/offers', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const titleAr = normalizeStr(req.body?.titleAr, 160);
    const titleEn = normalizeStr(req.body?.titleEn, 160) || titleAr;
    const description = normalizeStr(req.body?.description, 600);
    const productId = normalizeStr(req.body?.productId, 128) || null;
    const discountPercent =
      req.body?.discountPercent !== undefined && req.body?.discountPercent !== null && req.body?.discountPercent !== ''
        ? normalizeNum(req.body.discountPercent, 1, 90, 0)
        : null;
    const validUntil = normalizeStr(req.body?.validUntil, 24) || null;

    if (titleAr.length < 3 || description.length < 3) {
      res.status(400).json({ error: 'INVALID_SPECIAL_OFFER_INPUT' });
      return;
    }

    const offerId = safeId('phoffer');
    await db.doc(`pharmacy_special_offers/${offerId}`).set({
      offerId,
      pharmacyUid: ctx.pharmacyUid,
      titleAr,
      titleEn,
      description,
      productId,
      discountPercent,
      validUntil,
      approvalStatus: 'pending_review',
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await appendPharmacyAudit(
      db,
      ctx,
      'SPECIAL_OFFER_SUBMITTED',
      'pharmacy_special_offers',
      offerId,
      `Submitted special offer "${titleAr}" for Super Admin approval`,
    );
    await emitAdminNotification(db, {
      title: `عرض خاص جديد لصيدلية: ${ctx.pharmacyProfile.pharmacyNameAr}`,
      body: `${titleAr} — بانتظار موافقة المشرف العام قبل النشر للمرضى.`,
      relatedType: 'pharmacy_special_offer',
      relatedId: offerId,
    }).catch(() => undefined);

    const saved = await db.doc(`pharmacy_special_offers/${offerId}`).get();
    res.status(201).json({ ok: true, offer: serializeDoc(saved.data()) });
  });

  router.delete('/pharmacy/marketing/offers/:offerId', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const offerId = normalizeStr(req.params.offerId, 128);
    const ref = db.doc(`pharmacy_special_offers/${offerId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.pharmacyUid !== ctx.pharmacyUid) {
      res.status(404).json({ error: 'OFFER_NOT_FOUND' });
      return;
    }
    await ref.delete();
    res.json({ ok: true });
  });

  // Featured Placement / Campaign Request to Super Admin
  router.post('/pharmacy/marketing/campaign-requests', async (req, res) => {
    const ctx = await requirePharmacyAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const campaignTitle = normalizeStr(req.body?.campaignTitle, 180);
    const rawType = normalizeStr(req.body?.campaignType, 40);
    const campaignType =
      rawType === 'homepage_spotlight' || rawType === 'governorate_promo'
        ? rawType
        : 'featured_pharmacy';
    const targetGovernorate =
      normalizeStr(req.body?.targetGovernorate, 80) || ctx.pharmacyProfile.governorate;
    const notes = normalizeStr(req.body?.notes, 800);

    if (campaignTitle.length < 3) {
      res.status(400).json({ error: 'CAMPAIGN_TITLE_REQUIRED' });
      return;
    }

    const requestId = safeId('phcamp');
    await db.doc(`pharmacy_campaign_requests/${requestId}`).set({
      requestId,
      pharmacyUid: ctx.pharmacyUid,
      pharmacyName: ctx.pharmacyProfile.pharmacyNameAr,
      campaignTitle,
      campaignType,
      targetGovernorate,
      notes,
      status: 'Submitted',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (campaignType === 'featured_pharmacy' && ctx.pharmacyProfile.featuredStatus !== 'approved') {
      await db.doc(`pharmacy_profiles/${ctx.pharmacyUid}`).update({
        featuredStatus: 'requested',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await emitAdminNotification(db, {
      title: `طلب حملة ترويجية من ${ctx.pharmacyProfile.pharmacyNameAr}`,
      body: `${campaignTitle} (${targetGovernorate})`,
      relatedType: 'pharmacy_campaign_request',
      relatedId: requestId,
    }).catch(() => undefined);

    const saved = await db.doc(`pharmacy_campaign_requests/${requestId}`).get();
    res.status(201).json({ ok: true, request: serializeDoc(saved.data()) });
  });

  return router;
}
