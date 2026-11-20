import express, { type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  WHOLESALER_ROLE_PERMISSIONS,
  WHOLESALER_TERMINAL_ORDER_STATUSES,
  allocateFefoBatches,
  daysUntilExpiry,
  getTodayBaghdadDateStr,
  isBatchExpired,
  isValidIsoDateYmd,
  summarizeProductBatchStock,
} from './pharmacyWholesalerEngine.ts';
import type { DosageForm } from '../src/types/pharmacy.ts';
import type {
  WholesalerBatchRecord,
  WholesalerPermissionKey,
  WholesalerProductRecord,
  WholesalerProfileDocument,
  WholesalerStaffRole,
  WholesalerSupplyOrder,
  WholesalerSupplyOrderStatus,
} from '../src/types/wholesaler.ts';
import {
  listBulkImportJobs,
  processBulkImportCommit,
  processBulkImportParse,
  processBulkImportRevalidate,
  sendBulkImportTemplate,
} from './bulkImportHandlers.ts';
import type { ResolvedBucketInfo } from './storageHelper.ts';

export interface WholesalerRouterDeps {
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

export interface WholesalerAccessContext {
  actor: VerifiedActor;
  actorRole: 'wholesaler_owner' | 'wholesaler_staff';
  staffRole: WholesalerStaffRole;
  wholesalerUid: string;
  institutionId: string;
  permissions: WholesalerPermissionKey[];
  wholesalerProfile: WholesalerProfileDocument;
}

const VALID_WHOLESALER_ROLES = new Set<WholesalerStaffRole>([
  'owner',
  'warehouse_manager',
  'sales_rep',
  'dispatch_coordinator',
  'accountant',
]);

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

async function appendWholesalerAudit(
  db: Firestore,
  ctx: WholesalerAccessContext,
  action: string,
  targetCollection: string,
  targetId: string,
  details: string,
): Promise<void> {
  const logId = safeId('whlog');
  await db.doc(`wholesaler_audit_logs/${logId}`).set({
    logId,
    wholesalerUid: ctx.wholesalerUid,
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

export async function resolveWholesalerActorFromDb(
  db: Firestore,
  actor: VerifiedActor,
): Promise<
  | { ok: true; ctx: WholesalerAccessContext }
  | { ok: false; code: string; statusCode: number; wholesalerStatus?: string }
> {
  const ownerSnap = await db.doc(`wholesaler_profiles/${actor.uid}`).get();
  if (ownerSnap.exists) {
    const profile = serializeDoc(ownerSnap.data()) as unknown as WholesalerProfileDocument;
    if (profile.status !== 'Approved') {
      return {
        ok: false,
        code: 'WHOLESALER_NOT_APPROVED',
        statusCode: 403,
        wholesalerStatus: profile.status,
      };
    }
    const institutionId = profile.institutionId || `inst_wholesaler_${actor.uid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, code: 'WHOLESALER_INSTITUTION_SUSPENDED', statusCode: 403 };
      }
    }
    return {
      ok: true,
      ctx: {
        actor,
        actorRole: 'wholesaler_owner',
        staffRole: 'owner',
        wholesalerUid: actor.uid,
        institutionId,
        permissions: WHOLESALER_ROLE_PERMISSIONS.owner,
        wholesalerProfile: { ...profile, uid: actor.uid, institutionId },
      },
    };
  }

  // Independent wholesaler staff lookup (not auto-linked to clinic/lab secretaries)
  let staffDoc: Record<string, unknown> | null = null;
  const byUid = await db
    .collection('wholesaler_staff')
    .where('uid', '==', actor.uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!byUid.empty) {
    staffDoc = serializeDoc(byUid.docs[0].data());
  } else if (actor.email) {
    const byEmail = await db
      .collection('wholesaler_staff')
      .where('email', '==', actor.email)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    if (!byEmail.empty) {
      staffDoc = serializeDoc(byEmail.docs[0].data());
      if (!staffDoc.uid) {
        await byEmail.docs[0].ref.update({
          uid: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => undefined);
      }
    }
  }

  if (staffDoc && typeof staffDoc.wholesalerUid === 'string') {
    const whUid = staffDoc.wholesalerUid;
    const whSnap = await db.doc(`wholesaler_profiles/${whUid}`).get();
    if (!whSnap.exists) return { ok: false, code: 'WHOLESALER_NOT_FOUND', statusCode: 403 };
    const profile = serializeDoc(whSnap.data()) as unknown as WholesalerProfileDocument;
    if (profile.status !== 'Approved') {
      return {
        ok: false,
        code: 'WHOLESALER_NOT_APPROVED',
        statusCode: 403,
        wholesalerStatus: profile.status,
      };
    }
    const institutionId = profile.institutionId || `inst_wholesaler_${whUid}`;
    const instSnap = await db.doc(`institutions/${institutionId}`).get();
    if (instSnap.exists) {
      const instStatus = String(instSnap.data()?.status || '');
      if (instStatus === 'suspended' || instStatus === 'rejected') {
        return { ok: false, code: 'WHOLESALER_INSTITUTION_SUSPENDED', statusCode: 403 };
      }
    }
    const rawRole = String(staffDoc.role || 'sales_rep') as WholesalerStaffRole;
    const staffRole: WholesalerStaffRole = VALID_WHOLESALER_ROLES.has(rawRole) ? rawRole : 'sales_rep';
    const rawPerms = Array.isArray(staffDoc.permissions)
      ? (staffDoc.permissions as WholesalerPermissionKey[])
      : WHOLESALER_ROLE_PERMISSIONS[staffRole];

    return {
      ok: true,
      ctx: {
        actor,
        actorRole: 'wholesaler_staff',
        staffRole,
        wholesalerUid: whUid,
        institutionId,
        permissions: rawPerms,
        wholesalerProfile: { ...profile, uid: whUid, institutionId },
      },
    };
  }

  return { ok: false, code: 'WHOLESALER_ACCESS_DENIED', statusCode: 403 };
}

export function createWholesalerRouter(deps: WholesalerRouterDeps): Router {
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
        name: normalizeStr(decoded.name || decoded.email, 120) || 'Wholesaler User',
      };
    } catch {
      return null;
    }
  }

  async function requireWholesalerAccess(
    req: Request,
    res: Response,
    options?: {
      ownerOnly?: boolean;
      requiredPermission?: WholesalerPermissionKey;
    },
  ): Promise<WholesalerAccessContext | null> {
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
    const resolved = await resolveWholesalerActorFromDb(db, actor);
    if (!resolved.ok) {
      res.status(resolved.statusCode).json({
        error: resolved.code,
        ...(resolved.wholesalerStatus ? { wholesalerStatus: resolved.wholesalerStatus } : {}),
      });
      return null;
    }
    const { ctx } = resolved;
    if (options?.ownerOnly && ctx.actorRole !== 'wholesaler_owner') {
      res.status(403).json({ error: 'WHOLESALER_OWNER_ONLY' });
      return null;
    }
    if (
      options?.requiredPermission &&
      ctx.actorRole !== 'wholesaler_owner' &&
      !ctx.permissions.includes(options.requiredPermission)
    ) {
      res.status(403).json({ error: 'WHOLESALER_PERMISSION_DENIED' });
      return null;
    }
    return ctx;
  }

  router.get('/wholesaler/access', async (req, res) => {
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
    const resolved = await resolveWholesalerActorFromDb(db, actor);
    if (!resolved.ok) {
      res.json({
        hasAccess: false,
        reason: resolved.code,
        ...(resolved.wholesalerStatus ? { wholesalerStatus: resolved.wholesalerStatus } : {}),
      });
      return;
    }
    res.json({
      hasAccess: true,
      actorRole: resolved.ctx.actorRole,
      staffRole: resolved.ctx.staffRole,
      wholesalerUid: resolved.ctx.wholesalerUid,
      wholesalerName: resolved.ctx.wholesalerProfile.wholesalerNameAr,
    });
  });

  router.get('/wholesaler/workspace', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res);
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const whUid = ctx.wholesalerUid;
    const todayStr = getTodayBaghdadDateStr();

    try {
      const [
        medsSnap,
        prodSnap,
        batchSnap,
        movSnap,
        polSnap,
        ordSnap,
        shipSnap,
        supSnap,
        poSnap,
        invSnap,
        paySnap,
        retSnap,
        staffSnap,
        commSnap,
        auditSnap,
        notifSnap,
        pharmSnap,
      ] = await Promise.all([
        db.collection('medora_medicines').limit(300).get(),
        db.collection('wholesaler_products').where('wholesalerUid', '==', whUid).limit(500).get(),
        db.collection('wholesaler_batches').where('wholesalerUid', '==', whUid).limit(800).get(),
        db.collection('wholesaler_inventory_movements').where('wholesalerUid', '==', whUid).limit(300).get(),
        db.collection('wholesaler_credit_policies').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_supply_orders').where('wholesalerUid', '==', whUid).limit(300).get(),
        db.collection('wholesaler_shipments').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_suppliers').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_purchase_orders').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_invoices').where('wholesalerUid', '==', whUid).limit(300).get(),
        db.collection('wholesaler_payments').where('wholesalerUid', '==', whUid).limit(300).get(),
        db.collection('wholesaler_returns').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_staff').where('wholesalerUid', '==', whUid).limit(100).get(),
        db.collection('wholesaler_communications').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_audit_logs').where('wholesalerUid', '==', whUid).limit(200).get(),
        db.collection('wholesaler_notifications').where('wholesalerUid', '==', whUid).limit(100).get(),
        db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(150).get(),
      ]);

      const batches = batchSnap.docs.map((d) => {
        const b = serializeDoc(d.data()) as unknown as WholesalerBatchRecord;
        return { ...b, isExpired: isBatchExpired(b.expiryDate, todayStr) };
      });
      const batchByProd = new Map<string, WholesalerBatchRecord[]>();
      for (const b of batches) {
        const list = batchByProd.get(b.productId) || [];
        list.push(b);
        batchByProd.set(b.productId, list);
      }

      const products = prodSnap.docs.map((d) => {
        const p = serializeDoc(d.data()) as unknown as WholesalerProductRecord;
        const summary = summarizeProductBatchStock(batchByProd.get(p.productId) || [], todayStr);
        return {
          ...p,
          availableQty: summary.netAvailableQty,
          reservedQty: summary.reservedQty,
          nearestExpiryDate: summary.nearestExpiryDate,
        };
      });

      const supplyOrders = ordSnap.docs
        .map((d) => serializeDoc(d.data()) as unknown as WholesalerSupplyOrder)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const invoices = invSnap.docs.map((d) => serializeDoc(d.data()));
      const returns = retSnap.docs.map((d) => serializeDoc(d.data()));

      const monthPrefix = todayStr.slice(0, 7);
      let monthlySupplyRevenueIqd = 0;
      let pendingOrdersCount = 0;
      const pharmacySet = new Set<string>();
      const topMap = new Map<string, { productId: string; medicineName: string; unitsSupplied: number; revenueIqd: number }>();

      for (const ord of supplyOrders) {
        pharmacySet.add(ord.pharmacyUid);
        if (['Submitted', 'Under Review', 'Amendment Proposed'].includes(ord.status)) {
          pendingOrdersCount += 1;
        }
        if (['Shipped', 'Delivered', 'Completed'].includes(ord.status)) {
          if (String(ord.createdAt || '').startsWith(monthPrefix)) {
            monthlySupplyRevenueIqd += Number(ord.totalIqd || 0);
          }
          for (const item of ord.items || []) {
            const qty = Number(item.approvedQty || item.requestedQty || 0);
            const prev = topMap.get(item.productId) || {
              productId: item.productId,
              medicineName: item.medicineName,
              unitsSupplied: 0,
              revenueIqd: 0,
            };
            prev.unitsSupplied += qty;
            prev.revenueIqd += Number(item.lineTotalIqd || 0);
            topMap.set(item.productId, prev);
          }
        }
      }

      const totalReceivablesIqd = invoices.reduce((acc, i) => acc + Number(i.balanceDueIqd || 0), 0);
      const expiringSoonBatchesCount = batches.filter((b) => {
        if (b.isExpired || b.availableQty <= 0) return false;
        const d = daysUntilExpiry(b.expiryDate, todayStr);
        return d >= 0 && d <= 60;
      }).length;
      const expiredBatchesCount = batches.filter((b) => b.isExpired && b.availableQty > 0).length;
      const returnsTotalIqd = returns.reduce((acc, r) => acc + Number(r.totalCreditIqd || 0), 0);

      res.json({
        actorRole: ctx.actorRole,
        permissions: ctx.permissions,
        staffRole: ctx.staffRole,
        wholesalerProfile: ctx.wholesalerProfile,
        canonicalCatalog: medsSnap.docs.map((d) => serializeDoc(d.data())),
        approvedPharmacies: pharmSnap.docs.map((d) => serializeDoc(d.data())),
        products,
        batches,
        movements: movSnap.docs.map((d) => serializeDoc(d.data())),
        creditPolicies: polSnap.docs.map((d) => serializeDoc(d.data())),
        supplyOrders,
        shipments: shipSnap.docs.map((d) => serializeDoc(d.data())),
        suppliers: supSnap.docs.map((d) => serializeDoc(d.data())),
        purchaseOrders: poSnap.docs.map((d) => serializeDoc(d.data())),
        invoices,
        payments: paySnap.docs.map((d) => serializeDoc(d.data())),
        returns,
        staff: staffSnap.docs.map((d) => serializeDoc(d.data())),
        communications: commSnap.docs.map((d) => serializeDoc(d.data())),
        auditLogs: auditSnap.docs.map((d) => serializeDoc(d.data())),
        notifications: notifSnap.docs.map((d) => serializeDoc(d.data())),
        reports: {
          monthlySupplyRevenueIqd,
          totalReceivablesIqd,
          pendingOrdersCount,
          activePharmaciesCount: pharmacySet.size,
          expiringSoonBatchesCount,
          expiredBatchesCount,
          returnsTotalIqd,
          topSuppliedProducts: Array.from(topMap.values())
            .sort((a, b) => b.unitsSupplied - a.unitsSupplied)
            .slice(0, 10),
        },
      });
    } catch (err) {
      console.error('[MEDORA][WholesalerWorkspace] error:', err);
      res.status(500).json({ error: 'WHOLESALER_WORKSPACE_FAILED' });
    }
  });

  // Create or update wholesaler product
  router.post('/wholesaler/products', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const medicineId = normalizeStr(req.body?.medicineId, 128);
    const brandName = normalizeStr(req.body?.brandName, 160);
    const wholesalePriceIqd = normalizeNum(req.body?.wholesalePriceIqd, 1, 100000000, 0);
    const minimumOrderQty = Math.floor(normalizeNum(req.body?.minimumOrderQty, 1, 100000, 1));
    const bonusRuleLabel = normalizeStr(req.body?.bonusRuleLabel, 120);
    const barcode = normalizeStr(req.body?.barcode, 80);
    const manufacturer = normalizeStr(req.body?.manufacturer, 120);
    const country = normalizeStr(req.body?.country, 80);
    const imageReference = normalizeStr(req.body?.imageReference, 500);

    if (wholesalePriceIqd <= 0) {
      res.status(400).json({ error: 'INVALID_WHOLESALE_PRICE' });
      return;
    }

    let medData: Record<string, unknown> | null = null;
    let resolvedMedId = medicineId;

    if (medicineId) {
      const mSnap = await db.doc(`medora_medicines/${medicineId}`).get();
      if (!mSnap.exists) {
        res.status(404).json({ error: 'CANONICAL_MEDICINE_NOT_FOUND' });
        return;
      }
      medData = mSnap.data() as Record<string, unknown>;
    } else {
      const scientificName = normalizeStr(req.body?.scientificName, 160);
      const activeIngredient = normalizeStr(req.body?.activeIngredient, 160);
      const strength = normalizeStr(req.body?.strength, 60);
      const rawForm = normalizeStr(req.body?.dosageForm, 40).toLowerCase() as DosageForm;
      const dosageForm: DosageForm = VALID_DOSAGE_FORMS.has(rawForm) ? rawForm : 'other';
      const packSize = normalizeStr(req.body?.packSize, 60);

      if (!scientificName || !activeIngredient || !strength || !packSize) {
        res.status(400).json({ error: 'MEDICINE_IDENTITY_REQUIRED' });
        return;
      }
      resolvedMedId = safeId('med');
      medData = {
        medicineId: resolvedMedId,
        scientificName,
        activeIngredient,
        brandNames: [brandName || scientificName],
        strength,
        dosageForm,
        packSize,
        ...(manufacturer ? { manufacturer } : {}),
        ...(country ? { country } : {}),
        ...(barcode ? { barcode } : {}),
        ...(imageReference ? { imageReference } : {}),
        requiresPrescription: true,
        controlledDrug: false,
        therapeuticCategory: 'General',
        status: 'active',
      };
      await db.doc(`medora_medicines/${resolvedMedId}`).set({
        ...medData,
        createdByUid: ctx.actor.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const existing = await db
      .collection('wholesaler_products')
      .where('wholesalerUid', '==', ctx.wholesalerUid)
      .where('medicineId', '==', resolvedMedId)
      .limit(1)
      .get();

    const productId = existing.empty ? safeId('wprod') : existing.docs[0].id;
    await db.doc(`wholesaler_products/${productId}`).set(
      {
        productId,
        wholesalerUid: ctx.wholesalerUid,
        institutionId: ctx.institutionId,
        medicineId: resolvedMedId,
        scientificName: String(medData.scientificName || ''),
        activeIngredient: String(medData.activeIngredient || ''),
        brandName: brandName || String(medData.scientificName || ''),
        strength: String(medData.strength || ''),
        dosageForm: String(medData.dosageForm || 'tablet'),
        packSize: String(medData.packSize || ''),
        manufacturer: manufacturer || String(medData.manufacturer || ''),
        country: country || String(medData.country || ''),
        imageReference: imageReference || String(medData.imageReference || ''),
        barcode,
        sku: productId,
        wholesalePriceIqd,
        bonusRuleLabel,
        minimumOrderQty,
        minStockThreshold: normalizeNum(req.body?.minStockThreshold, 0, 100000, 10),
        expiryAlertDays: normalizeNum(req.body?.expiryAlertDays, 1, 730, 60),
        isActive: req.body?.isActive !== false,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.empty ? { createdAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );

    const saved = await db.doc(`wholesaler_products/${productId}`).get();
    res.status(existing.empty ? 201 : 200).json({ ok: true, product: serializeDoc(saved.data()) });
  });

  // Bulk Drug Import (Excel .xlsx/.xls, CSV, JSON, PDF Review Draft)
  router.get('/wholesaler/bulk-import/template', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    sendBulkImportTemplate('wholesaler', res);
  });

  router.post('/wholesaler/bulk-import/parse', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportParse({
      db,
      portalType: 'wholesaler',
      ownerUid: ctx.wholesalerUid,
      institutionId: ctx.institutionId,
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      req,
      res,
      resolveReadyStorageBucket: deps.resolveReadyStorageBucket,
      hasServiceCredentials: deps.hasServiceCredentials,
    });
  });

  router.post('/wholesaler/bulk-import/revalidate', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportRevalidate({
      db,
      portalType: 'wholesaler',
      ownerUid: ctx.wholesalerUid,
      req,
      res,
    });
  });

  router.post('/wholesaler/bulk-import/commit', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await processBulkImportCommit({
      db,
      portalType: 'wholesaler',
      ownerUid: ctx.wholesalerUid,
      institutionId: ctx.institutionId,
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      req,
      res,
      onAudit: async (details, jobId) => {
        await appendWholesalerAudit(db, ctx, 'BULK_DRUG_IMPORT_COMMITTED', 'bulk_import_jobs', jobId, details);
      },
    });
  });

  router.get('/wholesaler/bulk-import/jobs', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCatalog' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    await listBulkImportJobs({
      db,
      portalType: 'wholesaler',
      ownerUid: ctx.wholesalerUid,
      res,
    });
  });

  // Add batch (rejects expired)
  router.post('/wholesaler/batches', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageBatches' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const productId = normalizeStr(req.body?.productId, 128);
    const batchNumber = normalizeStr(req.body?.batchNumber, 80);
    const expiryDate = normalizeStr(req.body?.expiryDate, 20);
    const availableQty = Math.floor(normalizeNum(req.body?.availableQty, 1, 10000000, 0));
    const purchaseCostIqd = normalizeNum(req.body?.purchaseCostIqd, 0, 100000000, 0);

    if (!productId || !batchNumber || !isValidIsoDateYmd(expiryDate) || availableQty <= 0) {
      res.status(400).json({ error: 'INVALID_BATCH_INPUT' });
      return;
    }
    if (isBatchExpired(expiryDate, getTodayBaghdadDateStr())) {
      res.status(400).json({ error: 'EXPIRED_BATCH_NOT_ALLOWED' });
      return;
    }

    const pSnap = await db.doc(`wholesaler_products/${productId}`).get();
    if (!pSnap.exists || pSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
      res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });
      return;
    }
    const p = pSnap.data() as Record<string, unknown>;

    const batchId = safeId('wbatch');
    const movId = safeId('wmov');
    const batch = db.batch();
    batch.set(db.doc(`wholesaler_batches/${batchId}`), {
      batchId,
      wholesalerUid: ctx.wholesalerUid,
      institutionId: ctx.institutionId,
      productId,
      medicineId: String(p.medicineId || ''),
      productName: String(p.brandName || p.scientificName || ''),
      batchNumber,
      expiryDate,
      availableQty,
      reservedQty: 0,
      purchaseCostIqd,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.doc(`wholesaler_inventory_movements/${movId}`), {
      movementId: movId,
      wholesalerUid: ctx.wholesalerUid,
      productId,
      batchId,
      batchNumber,
      movementType: 'manual_add',
      quantityDelta: availableQty,
      reservedDelta: 0,
      reason: 'Manual warehouse batch receipt',
      actorUid: ctx.actor.uid,
      actorName: ctx.actor.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    const saved = await db.doc(`wholesaler_batches/${batchId}`).get();
    res.status(201).json({ ok: true, batch: serializeDoc(saved.data()) });
  });

  // Set pharmacy credit policy & custom pricing (strictly opt-in: creditEnabled must be explicitly granted)
  router.post('/wholesaler/credit-policies', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'managePharmacies' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const pharmacyUid = normalizeStr(req.body?.pharmacyUid, 128);
    if (!pharmacyUid) {
      res.status(400).json({ error: 'PHARMACY_UID_REQUIRED' });
      return;
    }
    const phSnap = await db.doc(`pharmacy_profiles/${pharmacyUid}`).get();
    if (!phSnap.exists) {
      res.status(404).json({ error: 'PHARMACY_NOT_FOUND' });
      return;
    }
    const ph = phSnap.data() as Record<string, unknown>;
    const policyId = `pol_${ctx.wholesalerUid}_${pharmacyUid}`;
    const existing = await db.doc(`wholesaler_credit_policies/${policyId}`).get();
    const curBalance = existing.exists ? Number(existing.data()?.currentBalanceIqd || 0) : 0;

    await db.doc(`wholesaler_credit_policies/${policyId}`).set(
      {
        policyId,
        wholesalerUid: ctx.wholesalerUid,
        pharmacyUid,
        pharmacyName: String(ph.pharmacyNameAr || ph.pharmacyNameEn || pharmacyUid),
        creditEnabled: req.body?.creditEnabled === true,
        creditLimitIqd: normalizeNum(req.body?.creditLimitIqd, 0, 1000000000, 0),
        currentBalanceIqd: curBalance,
        paymentTermDays: normalizeNum(req.body?.paymentTermDays, 0, 365, 30),
        customDiscountPercent: normalizeNum(req.body?.customDiscountPercent, 0, 80, 0),
        customPricesByProductId:
          req.body?.customPricesByProductId && typeof req.body.customPricesByProductId === 'object'
            ? req.body.customPricesByProductId
            : existing.exists
              ? existing.data()?.customPricesByProductId || {}
              : {},
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const saved = await db.doc(`wholesaler_credit_policies/${policyId}`).get();
    res.json({ ok: true, creditPolicy: serializeDoc(saved.data()) });
  });

  // Supply order review decision: Under Review / Accepted / Partially Accepted / Amendment Proposed / Rejected
  router.post('/wholesaler/supply-orders/:orderId/decision', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageSupplyOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const decision = normalizeStr(req.body?.status, 40) as WholesalerSupplyOrderStatus;
    const rejectionReason = normalizeStr(req.body?.rejectionReason, 500);
    const amendmentNote = normalizeStr(req.body?.amendmentNote, 500);
    const itemOverrides = Array.isArray(req.body?.itemOverrides) ? req.body.itemOverrides : [];
    const todayStr = getTodayBaghdadDateStr();

    const allowed = new Set<WholesalerSupplyOrderStatus>([
      'Under Review',
      'Accepted',
      'Partially Accepted',
      'Amendment Proposed',
      'Rejected',
    ]);
    if (!orderId || !allowed.has(decision)) {
      res.status(400).json({ error: 'INVALID_SUPPLY_DECISION' });
      return;
    }
    if (decision === 'Rejected' && rejectionReason.length < 3) {
      res.status(400).json({ error: 'REJECTION_REASON_REQUIRED' });
      return;
    }

    try {
      const updatedOrder = await db.runTransaction(async (tx) => {
        const ordRef = db.doc(`wholesaler_supply_orders/${orderId}`);
        const ordSnap = await tx.get(ordRef);
        if (!ordSnap.exists || ordSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
          throw new Error('SUPPLY_ORDER_NOT_FOUND');
        }
        const ord = serializeDoc(ordSnap.data()) as unknown as WholesalerSupplyOrder;
        if (WHOLESALER_TERMINAL_ORDER_STATUSES.has(ord.status)) {
          throw new Error('ORDER_ALREADY_TERMINAL');
        }

        if (decision === 'Under Review' || decision === 'Rejected') {
          tx.update(ordRef, {
            status: decision,
            ...(rejectionReason ? { rejectionReason } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { ...ord, status: decision };
        }

        if (decision === 'Amendment Proposed') {
          const amendedItems = ord.items.map((it) => {
            const ov = itemOverrides.find((o: Record<string, unknown>) => o?.productId === it.productId);
            const approvedQty = ov && ov.approvedQty !== undefined
              ? Math.max(0, Math.floor(Number(ov.approvedQty)))
              : it.requestedQty;
            const proposedPrice = ov && ov.proposedUnitPriceIqd !== undefined
              ? Math.max(1, Number(ov.proposedUnitPriceIqd))
              : it.unitPriceIqd;
            return {
              ...it,
              approvedQty,
              proposedUnitPriceIqd: proposedPrice,
              lineTotalIqd: approvedQty * proposedPrice,
            };
          });
          tx.update(ordRef, {
            status: 'Amendment Proposed',
            amendmentNote: amendmentNote || 'Proposed quantity/price update',
            amendmentPendingPharmacyApproval: true,
            items: amendedItems,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { ...ord, status: 'Amendment Proposed', items: amendedItems };
        }

        // Accepted or Partially Accepted -> Atomic FEFO reservation
        const nextItems = [];
        let subtotalIqd = 0;

        for (const it of ord.items) {
          const ov = itemOverrides.find((o: Record<string, unknown>) => o?.productId === it.productId);
          const targetQty = ov && ov.approvedQty !== undefined
            ? Math.max(0, Math.floor(Number(ov.approvedQty)))
            : it.requestedQty;

          if (targetQty <= 0) {
            nextItems.push({ ...it, approvedQty: 0, lineTotalIqd: 0, batchAllocations: [] });
            continue;
          }

          const bSnap = await tx.get(
            db
              .collection('wholesaler_batches')
              .where('wholesalerUid', '==', ctx.wholesalerUid)
              .where('productId', '==', it.productId),
          );
          const batches = bSnap.docs.map((d) => serializeDoc(d.data()) as unknown as WholesalerBatchRecord);
          const fefo = allocateFefoBatches(batches, targetQty, todayStr);
          if (!fefo.ok) {
            throw new Error(`INSUFFICIENT_OR_EXPIRED_STOCK:${it.medicineName}`);
          }

          for (const alloc of fefo.allocations) {
            const matching = batches.find((x) => x.batchId === alloc.batchId)!;
            tx.update(db.doc(`wholesaler_batches/${alloc.batchId}`), {
              reservedQty: Number(matching.reservedQty || 0) + alloc.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
            const movId = safeId('wmov');
            tx.set(db.doc(`wholesaler_inventory_movements/${movId}`), {
              movementId: movId,
              wholesalerUid: ctx.wholesalerUid,
              productId: it.productId,
              batchId: alloc.batchId,
              batchNumber: alloc.batchNumber,
              movementType: 'reserve',
              quantityDelta: 0,
              reservedDelta: alloc.quantity,
              reason: `Reserved for supply order ${ord.orderNumber}`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
          }

          const lineTotal = Number(it.unitPriceIqd || 0) * targetQty;
          subtotalIqd += lineTotal;
          nextItems.push({
            ...it,
            approvedQty: targetQty,
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

        const totalIqd = Math.max(0, subtotalIqd - Number(ord.discountIqd || 0) + Number(ord.deliveryFeeIqd || 0));

        // Credit limit check if paymentMethod is credit_account
        if (ord.paymentMethod === 'credit_account') {
          const polRef = db.doc(`wholesaler_credit_policies/pol_${ctx.wholesalerUid}_${ord.pharmacyUid}`);
          const polSnap = await tx.get(polRef);
          if (!polSnap.exists || polSnap.data()?.creditEnabled !== true) {
            throw new Error('CREDIT_ACCOUNT_NOT_ENABLED');
          }
          const pol = polSnap.data() as Record<string, unknown>;
          const curBal = Number(pol.currentBalanceIqd || 0);
          const limit = Number(pol.creditLimitIqd || 0);
          if (curBal + totalIqd > limit) {
            throw new Error('CREDIT_LIMIT_EXCEEDED');
          }
          tx.update(polRef, {
            currentBalanceIqd: curBal + totalIqd,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.update(ordRef, {
          status: decision,
          items: nextItems,
          subtotalIqd,
          totalIqd,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return { ...ord, status: decision, items: nextItems, totalIqd };
      });

      await appendWholesalerAudit(
        db,
        ctx,
        `SUPPLY_ORDER_${decision.toUpperCase().replace(/\s+/g, '_')}`,
        'wholesaler_supply_orders',
        orderId,
        `Updated supply order ${updatedOrder.orderNumber} -> ${decision}`,
      );

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'wholesaler_order_status_updated',
          recipientUid: updatedOrder.pharmacyUid,
          recipientRole: 'pharmacy',
          title: `تحديث طلب التوريد (${updatedOrder.orderNumber})`,
          body: `قام المذخر بتحديث حالة الطلب إلى: ${decision}`,
          inAppType: 'wholesaler_order_status_updated',
          relatedId: orderId,
          relatedType: 'wholesaler_supply_order',
          idempotencyKey: `wh_dec_${orderId}_${decision}`,
        })
        .catch(() => undefined);

      res.json({ ok: true, supplyOrder: updatedOrder });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'SUPPLY_DECISION_FAILED';
      res.status(code === 'SUPPLY_ORDER_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Prepare & Dispatch supply order -> creates shipment + invoice on Shipped
  router.post('/wholesaler/supply-orders/:orderId/prepare-dispatch', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageShipments' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const nextStatus = normalizeStr(req.body?.status, 40) as WholesalerSupplyOrderStatus;
    const driverName = normalizeStr(req.body?.driverName, 120);
    const driverPhone = normalizeStr(req.body?.driverPhone, 32);
    const vehicleInfo = normalizeStr(req.body?.vehicleInfo, 120);
    const dispatchNote = normalizeStr(req.body?.dispatchNote, 300);

    if (!orderId || !['Preparing', 'Ready for Dispatch', 'Shipped', 'Delivered'].includes(nextStatus)) {
      res.status(400).json({ error: 'INVALID_DISPATCH_STATUS' });
      return;
    }

    try {
      const ordRef = db.doc(`wholesaler_supply_orders/${orderId}`);
      const ordSnap = await ordRef.get();
      if (!ordSnap.exists || ordSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
        res.status(404).json({ error: 'SUPPLY_ORDER_NOT_FOUND' });
        return;
      }
      const ord = serializeDoc(ordSnap.data()) as unknown as WholesalerSupplyOrder;
      if (WHOLESALER_TERMINAL_ORDER_STATUSES.has(ord.status)) {
        res.status(409).json({ error: 'ORDER_ALREADY_TERMINAL' });
        return;
      }

      const batch = db.batch();
      batch.update(ordRef, { status: nextStatus, updatedAt: FieldValue.serverTimestamp() });

      const shipmentId = `ship_${orderId}`;
      const shipStatus =
        nextStatus === 'Preparing'
          ? 'preparing'
          : nextStatus === 'Ready for Dispatch'
            ? 'ready'
            : nextStatus === 'Shipped'
              ? 'in_transit'
              : 'delivered';
      batch.set(
        db.doc(`wholesaler_shipments/${shipmentId}`),
        {
          shipmentId,
          wholesalerUid: ctx.wholesalerUid,
          orderId,
          orderNumber: ord.orderNumber,
          pharmacyUid: ord.pharmacyUid,
          pharmacyName: ord.pharmacyName,
          destinationAddress: `${ord.pharmacyGovernorate} - ${ord.pharmacyAddress}`,
          ...(driverName ? { driverName } : {}),
          ...(driverPhone ? { driverPhone } : {}),
          ...(vehicleInfo ? { vehicleInfo } : {}),
          ...(dispatchNote ? { dispatchNote } : {}),
          status: shipStatus,
          ...(nextStatus === 'Shipped' ? { dispatchedAt: new Date().toISOString() } : {}),
          ...(nextStatus === 'Delivered' ? { deliveredAt: new Date().toISOString() } : {}),
        },
        { merge: true },
      );

      await batch.commit();
      await appendWholesalerAudit(
        db,
        ctx,
        `DISPATCH_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        'wholesaler_supply_orders',
        orderId,
        `Updated supply dispatch ${ord.orderNumber} -> ${nextStatus}`,
      );

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'wholesaler_order_status_updated',
          recipientUid: ord.pharmacyUid,
          recipientRole: 'pharmacy',
          title: `تحديث شحنة التوريد (${ord.orderNumber})`,
          body: `حالة الشحنة الآن: ${nextStatus}${driverName ? ` · السائق: ${driverName}` : ''}`,
          inAppType: 'wholesaler_order_status_updated',
          relatedId: orderId,
          relatedType: 'wholesaler_supply_order',
          idempotencyKey: `wh_disp_${orderId}_${nextStatus}`,
        })
        .catch(() => undefined);

      res.json({ ok: true });
    } catch (err) {
      console.error('[MEDORA][WholesalerDispatch] error:', err);
      res.status(500).json({ error: 'DISPATCH_UPDATE_FAILED' });
    }
  });

  // Suppliers & Purchase Orders
  router.post('/wholesaler/suppliers', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageSuppliers' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const name = normalizeStr(req.body?.name, 160);
    const contactName = normalizeStr(req.body?.contactName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const countryOrCity = normalizeStr(req.body?.countryOrCity, 100);
    const notes = normalizeStr(req.body?.notes, 300);

    if (name.length < 2) {
      res.status(400).json({ error: 'SUPPLIER_NAME_REQUIRED' });
      return;
    }

    const supplierId = safeId('wsup');
    await db.doc(`wholesaler_suppliers/${supplierId}`).set({
      supplierId,
      wholesalerUid: ctx.wholesalerUid,
      name,
      contactName,
      phone,
      countryOrCity,
      notes,
      balanceDueIqd: 0,
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    const saved = await db.doc(`wholesaler_suppliers/${supplierId}`).get();
    res.status(201).json({ ok: true, supplier: serializeDoc(saved.data()) });
  });

  router.post('/wholesaler/purchase-orders', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'managePurchaseOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const supplierId = normalizeStr(req.body?.supplierId, 128);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!supplierId || items.length === 0) {
      res.status(400).json({ error: 'INVALID_PURCHASE_ORDER' });
      return;
    }
    const supSnap = await db.doc(`wholesaler_suppliers/${supplierId}`).get();
    if (!supSnap.exists || supSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
      res.status(404).json({ error: 'SUPPLIER_NOT_FOUND' });
      return;
    }
    const sup = supSnap.data() as Record<string, unknown>;
    const poId = safeId('wpo');
    const poNumber = `PO-${Date.now().toString().slice(-6)}`;
    let totalCostIqd = 0;
    const cleanItems = items.map((it: Record<string, unknown>) => {
      const quantity = Math.floor(normalizeNum(it.quantity, 1, 1000000, 1));
      const unitCostIqd = normalizeNum(it.unitCostIqd, 0, 100000000, 0);
      totalCostIqd += quantity * unitCostIqd;
      return {
        productId: normalizeStr(it.productId, 128),
        medicineName: normalizeStr(it.medicineName, 160),
        quantity,
        unitCostIqd,
        batchNumber: normalizeStr(it.batchNumber, 80),
        expiryDate: normalizeStr(it.expiryDate, 20),
      };
    });

    await db.doc(`wholesaler_purchase_orders/${poId}`).set({
      poId,
      poNumber,
      wholesalerUid: ctx.wholesalerUid,
      supplierId,
      supplierName: String(sup.name || ''),
      status: 'ordered',
      items: cleanItems,
      totalCostIqd,
      createdAt: FieldValue.serverTimestamp(),
    });
    const saved = await db.doc(`wholesaler_purchase_orders/${poId}`).get();
    res.status(201).json({ ok: true, purchaseOrder: serializeDoc(saved.data()) });
  });

  router.post('/wholesaler/purchase-orders/:poId/receive', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'managePurchaseOrders' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const poId = normalizeStr(req.params.poId, 128);
    const todayStr = getTodayBaghdadDateStr();

    try {
      await db.runTransaction(async (tx) => {
        const poRef = db.doc(`wholesaler_purchase_orders/${poId}`);
        const poSnap = await tx.get(poRef);
        if (!poSnap.exists || poSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
          throw new Error('PO_NOT_FOUND');
        }
        const po = poSnap.data() as Record<string, unknown>;
        if (po.status === 'received') throw new Error('PO_ALREADY_RECEIVED');

        const items = (po.items as Array<Record<string, unknown>>) || [];
        for (const it of items) {
          const productId = String(it.productId || '');
          const batchNumber = String(it.batchNumber || `LOT-${Date.now().toString().slice(-4)}`);
          const expiryDate = String(it.expiryDate || '');
          const qty = Number(it.quantity || 0);
          if (!productId || qty <= 0 || !isValidIsoDateYmd(expiryDate) || isBatchExpired(expiryDate, todayStr)) {
            throw new Error(`INVALID_OR_EXPIRED_PO_ITEM:${String(it.medicineName || productId)}`);
          }
          const batchId = safeId('wbatch');
          tx.set(db.doc(`wholesaler_batches/${batchId}`), {
            batchId,
            wholesalerUid: ctx.wholesalerUid,
            institutionId: ctx.institutionId,
            productId,
            medicineId: '',
            productName: String(it.medicineName || ''),
            batchNumber,
            expiryDate,
            availableQty: qty,
            reservedQty: 0,
            purchaseCostIqd: Number(it.unitCostIqd || 0),
            supplierId: String(po.supplierId || ''),
            purchaseOrderId: poId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          const movId = safeId('wmov');
          tx.set(db.doc(`wholesaler_inventory_movements/${movId}`), {
            movementId: movId,
            wholesalerUid: ctx.wholesalerUid,
            productId,
            batchId,
            batchNumber,
            movementType: 'receive_po',
            quantityDelta: qty,
            reservedDelta: 0,
            reason: `Received PO ${String(po.poNumber || poId)}`,
            relatedOrderId: poId,
            actorUid: ctx.actor.uid,
            actorName: ctx.actor.name,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        tx.update(poRef, {
          status: 'received',
          receivedAt: new Date().toISOString(),
        });
      });

      res.json({ ok: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'PO_RECEIVE_FAILED';
      res.status(code === 'PO_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Record wholesaler invoice payment & credit balance reduction
  router.post('/wholesaler/payments', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageBilling' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const invoiceId = normalizeStr(req.body?.invoiceId, 128);
    const amountIqd = normalizeNum(req.body?.amountIqd, 1, 1000000000, 0);
    const method = normalizeStr(req.body?.method, 40) || 'cash_on_delivery';
    const referenceCode = normalizeStr(req.body?.referenceCode, 80);

    if (!invoiceId || amountIqd <= 0) {
      res.status(400).json({ error: 'INVALID_PAYMENT_INPUT' });
      return;
    }

    try {
      await db.runTransaction(async (tx) => {
        const invRef = db.doc(`wholesaler_invoices/${invoiceId}`);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists || invSnap.data()?.wholesalerUid !== ctx.wholesalerUid) {
          throw new Error('INVOICE_NOT_FOUND');
        }
        const inv = invSnap.data() as Record<string, unknown>;
        const total = Number(inv.totalIqd || 0);
        const prevPaid = Number(inv.paidAmountIqd || 0);
        const applied = Math.min(total - prevPaid, amountIqd);
        const nextPaid = prevPaid + applied;
        const nextDue = Math.max(0, total - nextPaid);

        tx.update(invRef, {
          paidAmountIqd: nextPaid,
          balanceDueIqd: nextDue,
          status: nextDue === 0 ? 'paid' : 'partial',
        });
        if (inv.orderId) {
          tx.update(db.doc(`wholesaler_supply_orders/${String(inv.orderId)}`), {
            paymentStatus: nextDue === 0 ? 'paid' : 'partial',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (inv.paymentMethod === 'credit_account' && inv.pharmacyUid) {
          const polRef = db.doc(`wholesaler_credit_policies/pol_${ctx.wholesalerUid}_${String(inv.pharmacyUid)}`);
          const polSnap = await tx.get(polRef);
          if (polSnap.exists) {
            const curBal = Number(polSnap.data()?.currentBalanceIqd || 0);
            tx.update(polRef, {
              currentBalanceIqd: Math.max(0, curBal - applied),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
        const paymentId = safeId('wpay');
        tx.set(db.doc(`wholesaler_payments/${paymentId}`), {
          paymentId,
          wholesalerUid: ctx.wholesalerUid,
          invoiceId,
          pharmacyUid: String(inv.pharmacyUid || ''),
          pharmacyName: String(inv.pharmacyName || ''),
          amountIqd: applied,
          method,
          ...(referenceCode ? { referenceCode } : {}),
          recordedByUid: ctx.actor.uid,
          recordedByName: ctx.actor.name,
          paidAt: new Date().toISOString(),
        });
      });

      res.json({ ok: true });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'WHOLESALER_PAYMENT_FAILED';
      res.status(code === 'INVOICE_NOT_FOUND' ? 404 : 400).json({ error: code });
    }
  });

  // Wholesaler staff management (independent of clinic/lab secretaries)
  router.post('/wholesaler/staff', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { ownerOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const email = normalizeStr(req.body?.email, 254).toLowerCase();
    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const rawRole = normalizeStr(req.body?.role, 40) as WholesalerStaffRole;
    const role: WholesalerStaffRole =
      VALID_WHOLESALER_ROLES.has(rawRole) && rawRole !== 'owner' ? rawRole : 'sales_rep';
    const permissions = Array.isArray(req.body?.permissions)
      ? (req.body.permissions as WholesalerPermissionKey[])
      : WHOLESALER_ROLE_PERMISSIONS[role];

    if (!email || !email.includes('@') || fullName.length < 2) {
      res.status(400).json({ error: 'INVALID_STAFF_INPUT' });
      return;
    }

    const staffId = safeId('wstaff');
    await db.doc(`wholesaler_staff/${staffId}`).set({
      staffId,
      wholesalerUid: ctx.wholesalerUid,
      institutionId: ctx.institutionId,
      email,
      fullName,
      phone,
      role,
      permissions,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const saved = await db.doc(`wholesaler_staff/${staffId}`).get();
    res.status(201).json({ ok: true, staffMember: serializeDoc(saved.data()) });
  });

  router.patch('/wholesaler/staff/:staffId', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { ownerOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const staffId = normalizeStr(req.params.staffId, 128);
    const ref = db.doc(`wholesaler_staff/${staffId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.wholesalerUid !== ctx.wholesalerUid) {
      res.status(404).json({ error: 'STAFF_NOT_FOUND' });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (req.body?.status && ['active', 'suspended', 'revoked'].includes(req.body.status)) {
      patch.status = req.body.status;
    }
    if (req.body?.role && VALID_WHOLESALER_ROLES.has(req.body.role) && req.body.role !== 'owner') {
      patch.role = req.body.role;
    }
    if (Array.isArray(req.body?.permissions)) {
      patch.permissions = req.body.permissions;
    }
    await ref.update(patch);
    const updated = await ref.get();
    res.json({ ok: true, staffMember: serializeDoc(updated.data()) });
  });

  router.post('/wholesaler/communications', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageCommunications' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const channelType = normalizeStr(req.body?.channelType, 40) === 'super_admin' ? 'super_admin' : 'pharmacy_supply';
    const relatedId = normalizeStr(req.body?.relatedId, 128) || ctx.wholesalerUid;
    const body = normalizeStr(req.body?.body, 1000);
    if (!body) {
      res.status(400).json({ error: 'MESSAGE_BODY_REQUIRED' });
      return;
    }
    const messageId = safeId('wcomm');
    await db.doc(`wholesaler_communications/${messageId}`).set({
      messageId,
      wholesalerUid: ctx.wholesalerUid,
      channelType,
      relatedId,
      senderUid: ctx.actor.uid,
      senderName: ctx.actor.name,
      senderRole: ctx.staffRole,
      body,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    const saved = await db.doc(`wholesaler_communications/${messageId}`).get();
    res.status(201).json({ ok: true, message: serializeDoc(saved.data()) });
  });

  router.post('/wholesaler/notifications/:notificationId/read', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res);
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const notificationId = normalizeStr(req.params.notificationId, 128);
    const ref = db.doc(`wholesaler_notifications/${notificationId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.wholesalerUid !== ctx.wholesalerUid) {
      res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
      return;
    }
    await ref.update({ isRead: true });
    res.json({ ok: true });
  });

  router.put('/wholesaler/settings', async (req, res) => {
    const ctx = await requireWholesalerAccess(req, res, { requiredPermission: 'manageSettings' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof req.body?.workingDaysAndHours === 'string') {
      patch.workingDaysAndHours = normalizeStr(req.body.workingDaysAndHours, 240);
    }
    if (req.body?.minimumOrderIqd !== undefined) {
      patch.minimumOrderIqd = normalizeNum(req.body.minimumOrderIqd, 0, 100000000, 0);
    }
    if (Array.isArray(req.body?.supportedGovernorates)) {
      patch.supportedGovernorates = (req.body.supportedGovernorates as unknown[])
        .filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
        .slice(0, 25);
    }
    await db.doc(`wholesaler_profiles/${ctx.wholesalerUid}`).update(patch);
    const updated = await db.doc(`wholesaler_profiles/${ctx.wholesalerUid}`).get();
    res.json({ ok: true, wholesalerProfile: serializeDoc(updated.data()) });
  });

  return router;
}
