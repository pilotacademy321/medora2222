import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  allocateFefoBatches,
  getTodayBaghdadDateStr,
  summarizeProductBatchStock,
} from './pharmacyWholesalerEngine.ts';
import { resolvePharmacyActorFromDb } from './pharmacyRoutes.ts';
import { resolveWholesalerActorFromDb } from './wholesalerRoutes.ts';
import {
  issueUnifiedReceiptOnCompletion,
  logOperationalError,
  preReadReceiptStateInTx,
  safeCommerceId,
} from './commerceReceiptsEngine.ts';
import type {
  CanonicalMedicineRecord,
  PharmacyBatchRecord,
  PharmacyProductRecord,
  PharmacyProfileDocument,
} from '../src/types/pharmacy.ts';
import type {
  DoctorPharmacyCatalogProduct,
  MedoraFulfillmentType,
  MedoraPaymentMethod,
  MedoraPaymentStatus,
  MedoraReceiptRecord,
  PharmacyDoctorOrder,
  PharmacyDoctorOrderItem,
  PharmacyDoctorOrderStatus,
} from '../src/types/commerce.ts';

export interface CommerceRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore;
  requireSuperAdmin: RequestHandler;
}

interface VerifiedActor {
  uid: string;
  email: string;
  name: string;
}

const AUTHORIZED_SUPER_ADMIN_EMAIL = 'aqbs250@gmail.com';

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function normalizeNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
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

function sortByCreatedDesc<T extends { createdAt?: string | null; issuedAt?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const at = Date.parse(a.createdAt || a.issuedAt || '') || 0;
    const bt = Date.parse(b.createdAt || b.issuedAt || '') || 0;
    return bt - at;
  });
}

export function createCommerceRouter(deps: CommerceRouterDeps): Router {
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
        name: normalizeStr(decoded.name || decoded.email, 120) || 'MEDORA User',
      };
    } catch {
      return null;
    }
  }

  async function requireApprovedDoctor(
    req: Request,
    res: Response,
    db: Firestore,
  ): Promise<{ actor: VerifiedActor; profile: Record<string, unknown>; institutionId: string } | null> {
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    const secSnap = await db.doc(`secretary_profiles/${actor.uid}`).get();
    if (secSnap.exists) {
      res.status(403).json({ error: 'SECRETARY_USE_INDEPENDENT_PORTAL' });
      return null;
    }
    const docSnap = await db.doc(`doctor_profiles/${actor.uid}`).get();
    if (!docSnap.exists) {
      res.status(403).json({ error: 'DOCTOR_ACCESS_DENIED' });
      return null;
    }
    const profile = serializeDoc(docSnap.data());
    if (profile.status !== 'Approved') {
      res.status(403).json({ error: 'DOCTOR_NOT_APPROVED', doctorStatus: profile.status || null });
      return null;
    }
    const institutionId =
      typeof profile.institutionId === 'string' && profile.institutionId
        ? profile.institutionId
        : `inst_clinic_${actor.uid}`;
    return { actor, profile, institutionId };
  }

  async function resolveReceiptViewerScope(
    db: Firestore,
    actor: VerifiedActor,
  ): Promise<{
    isSuperAdmin: boolean;
    scopedUids: Set<string>;
    actorRoleLabel: string;
  }> {
    const scopedUids = new Set<string>([actor.uid]);
    let isSuperAdmin = false;
    let actorRoleLabel = 'user';

    if (actor.email === AUTHORIZED_SUPER_ADMIN_EMAIL) {
      const roleSnap = await db.doc(`admin_roles/${actor.uid}`).get().catch(() => null);
      if (roleSnap?.exists) {
        const rd = roleSnap.data();
        if (rd?.active === true && rd?.role === 'super_admin') {
          isSuperAdmin = true;
          actorRoleLabel = 'super_admin';
        }
      }
    }

    const phRes = await resolvePharmacyActorFromDb(db, actor).catch(() => null);
    if (phRes && phRes.ok) {
      scopedUids.add(phRes.ctx.pharmacyUid);
      if (!isSuperAdmin) actorRoleLabel = phRes.ctx.actorRole;
    }

    const whRes = await resolveWholesalerActorFromDb(db, actor).catch(() => null);
    if (whRes && whRes.ok) {
      scopedUids.add(whRes.ctx.wholesalerUid);
      if (!isSuperAdmin) actorRoleLabel = whRes.ctx.actorRole;
    }

    if (!isSuperAdmin && actorRoleLabel === 'user') {
      const docSnap = await db.doc(`doctor_profiles/${actor.uid}`).get().catch(() => null);
      if (docSnap?.exists) actorRoleLabel = 'doctor';
      else actorRoleLabel = 'patient';
    }

    return { isSuperAdmin, scopedUids, actorRoleLabel };
  }

  // -------------------------------------------------------------------------
  // 1. PHARMACY -> DOCTOR CATALOG & ORDERS
  // -------------------------------------------------------------------------
  router.get('/doctor/pharmacies/catalog', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const docCtx = await requireApprovedDoctor(req, res, db);
    if (!docCtx) return;

    const q = normalizeStr(req.query.q, 100).toLowerCase();
    const filterPharmacyUid = normalizeStr(req.query.pharmacyUid, 128);
    const filterGov = normalizeStr(req.query.governorate, 80).toLowerCase();
    const filterDosage = normalizeStr(req.query.dosageForm, 40).toLowerCase();

    try {
      const [pharmaciesSnap, productsSnap, batchesSnap, medicinesSnap] = await Promise.all([
        db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(200).get(),
        db.collection('pharmacy_products').where('isActive', '==', true).limit(1200).get(),
        db.collection('pharmacy_batches').where('isExpired', '==', false).limit(2000).get(),
        db.collection('medora_medicines').limit(1200).get(),
      ]);

      const pharmacyMap = new Map<string, PharmacyProfileDocument>();
      for (const d of pharmaciesSnap.docs) {
        const p = serializeDoc(d.data()) as unknown as PharmacyProfileDocument;
        const uid = p.uid || d.id;
        pharmacyMap.set(uid, { ...p, uid });
      }

      const medMap = new Map<string, CanonicalMedicineRecord>();
      for (const d of medicinesSnap.docs) {
        const m = serializeDoc(d.data()) as unknown as CanonicalMedicineRecord;
        if (m.medicineId) medMap.set(m.medicineId, m);
      }

      const batchesByProduct = new Map<string, PharmacyBatchRecord[]>();
      for (const d of batchesSnap.docs) {
        const b = serializeDoc(d.data()) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProduct.get(b.productId) || [];
        arr.push(b);
        batchesByProduct.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const items: DoctorPharmacyCatalogProduct[] = [];
      const activePharmacySet = new Map<
        string,
        {
          pharmacyUid: string;
          pharmacyNameAr: string;
          pharmacyNameEn: string;
          governorate: string;
          district: string;
          address: string;
          deliveryAvailable: boolean;
          pickupAvailable: boolean;
        }
      >();

      for (const d of productsSnap.docs) {
        const prod = serializeDoc(d.data()) as unknown as PharmacyProductRecord;
        const ph = pharmacyMap.get(prod.pharmacyUid);
        if (!ph) continue;
        if (filterPharmacyUid && prod.pharmacyUid !== filterPharmacyUid) continue;
        if (filterGov && String(ph.governorate || '').toLowerCase() !== filterGov) continue;

        const med = prod.medicineId ? medMap.get(prod.medicineId) : undefined;
        const productBatches = batchesByProduct.get(prod.productId) || [];
        const stock = summarizeProductBatchStock(productBatches, todayStr);
        if (stock.availableQty <= 0) continue;

        const scientificName = prod.scientificName || med?.scientificName || '';
        const brandName = prod.brandName || med?.brandNames?.[0] || scientificName;
        const activeIngredient = prod.activeIngredient || med?.activeIngredient || scientificName;
        const strength = prod.strength || med?.strength || '';
        const dosageForm = prod.dosageForm || med?.dosageForm || 'other';
        const packSize = prod.packSize || med?.packSize || '';

        if (filterDosage && dosageForm.toLowerCase() !== filterDosage) continue;

        if (q) {
          const haystack = [
            scientificName,
            brandName,
            activeIngredient,
            strength,
            ph.pharmacyNameAr,
            ph.pharmacyNameEn,
            ph.governorate,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) continue;
        }

        const basePrice = Number(prod.sellingPriceIqd || 0);
        const discountPrice =
          typeof prod.discountPriceIqd === 'number' &&
          prod.discountPriceIqd > 0 &&
          prod.discountPriceIqd < basePrice
            ? prod.discountPriceIqd
            : null;
        const effectivePriceIqd = discountPrice ?? basePrice;

        activePharmacySet.set(ph.uid, {
          pharmacyUid: ph.uid,
          pharmacyNameAr: ph.pharmacyNameAr || '',
          pharmacyNameEn: ph.pharmacyNameEn || '',
          governorate: ph.governorate || '',
          district: ph.district || '',
          address: ph.address || '',
          deliveryAvailable: ph.deliveryAvailable !== false,
          pickupAvailable: ph.pickupAvailable !== false,
        });

        items.push({
          productId: prod.productId,
          pharmacyUid: ph.uid,
          pharmacyNameAr: ph.pharmacyNameAr || '',
          pharmacyNameEn: ph.pharmacyNameEn || '',
          pharmacyGovernorate: ph.governorate || '',
          pharmacyDistrict: ph.district || '',
          pharmacyAddress: ph.address || '',
          deliveryAvailable: ph.deliveryAvailable !== false,
          pickupAvailable: ph.pickupAvailable !== false,
          medicineId: prod.medicineId || '',
          scientificName,
          activeIngredient,
          brandName,
          strength,
          dosageForm,
          packSize,
          manufacturer: prod.manufacturer || med?.manufacturer || '',
          country: prod.country || med?.country || '',
          imageReference: prod.imageReference || med?.imageReference || '',
          sellingPriceIqd: basePrice,
          discountPriceIqd: discountPrice,
          effectivePriceIqd,
          availableQty: stock.availableQty,
          nearestExpiryDate: stock.nearestExpiryDate,
          requiresPrescription: Boolean(prod.requiresPrescription ?? med?.requiresPrescription),
        });
      }

      res.json({
        ok: true,
        pharmacies: Array.from(activePharmacySet.values()),
        items: items.sort((a, b) => a.brandName.localeCompare(b.brandName)),
      });
    } catch (err) {
      console.error('[MEDORA][Commerce] doctor/pharmacies/catalog failed:', err);
      res.status(500).json({ error: 'CATALOG_LOAD_FAILED' });
    }
  });

  router.post('/doctor/pharmacy-orders', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const docCtx = await requireApprovedDoctor(req, res, db);
    if (!docCtx) return;

    const pharmacyUid = normalizeStr(req.body?.pharmacyUid, 128);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const fulfillmentType: MedoraFulfillmentType =
      req.body?.fulfillmentType === 'buyer_pickup' ? 'buyer_pickup' : 'seller_delivery';
    const rawPayment = normalizeStr(req.body?.paymentMethod, 40);
    const paymentMethod: MedoraPaymentMethod =
      rawPayment === 'credit_account' ||
      rawPayment === 'cash_on_delivery' ||
      rawPayment === 'cash_on_pickup' ||
      rawPayment === 'direct'
        ? (rawPayment as MedoraPaymentMethod)
        : fulfillmentType === 'buyer_pickup'
          ? 'cash_on_pickup'
          : 'cash_on_delivery';
    const deliveryAddress =
      normalizeStr(req.body?.deliveryAddress, 300) ||
      normalizeStr(docCtx.profile.workAddress, 240);
    const notes = normalizeStr(req.body?.notes, 500);

    if (!pharmacyUid || rawItems.length === 0 || rawItems.length > 60) {
      res.status(400).json({ error: 'INVALID_ORDER_INPUT' });
      return;
    }

    try {
      const phSnap = await db.doc(`pharmacy_profiles/${pharmacyUid}`).get();
      if (!phSnap.exists) {
        res.status(404).json({ error: 'PHARMACY_NOT_FOUND' });
        return;
      }
      const phProfile = serializeDoc(phSnap.data()) as unknown as PharmacyProfileDocument;
      if (phProfile.status !== 'Approved') {
        res.status(403).json({ error: 'PHARMACY_NOT_APPROVED' });
        return;
      }

      const todayStr = getTodayBaghdadDateStr();
      const mergedQtyByProduct = new Map<string, number>();
      for (const raw of rawItems) {
        const productId = normalizeStr(raw?.productId, 128);
        const qty = Math.floor(normalizeNum(raw?.quantity, 1, 5000, 0));
        if (!productId || qty <= 0) {
          res.status(400).json({ error: 'INVALID_ORDER_ITEM' });
          return;
        }
        mergedQtyByProduct.set(productId, (mergedQtyByProduct.get(productId) || 0) + qty);
      }

      const builtItems: PharmacyDoctorOrderItem[] = [];
      let subtotalIqd = 0;

      for (const [productId, requestedQty] of mergedQtyByProduct.entries()) {
        const prodSnap = await db.doc(`pharmacy_products/${productId}`).get();
        if (!prodSnap.exists) {
          res.status(404).json({ error: `PRODUCT_NOT_FOUND:${productId}` });
          return;
        }
        const prod = serializeDoc(prodSnap.data()) as unknown as PharmacyProductRecord;
        if (prod.pharmacyUid !== pharmacyUid || !prod.isActive) {
          res.status(400).json({ error: `PRODUCT_UNAVAILABLE:${productId}` });
          return;
        }
        const batchSnap = await db
          .collection('pharmacy_batches')
          .where('productId', '==', productId)
          .where('pharmacyUid', '==', pharmacyUid)
          .get();
        const batches = batchSnap.docs.map((b) => serializeDoc(b.data()) as unknown as PharmacyBatchRecord);
        const summary = summarizeProductBatchStock(batches, todayStr);
        if (summary.availableQty < requestedQty) {
          res.status(409).json({
            error: `INSUFFICIENT_PHARMACY_STOCK:${prod.brandName || prod.scientificName}`,
          });
          return;
        }

        const basePrice = Number(prod.sellingPriceIqd || 0);
        const unitPriceIqd =
          typeof prod.discountPriceIqd === 'number' &&
          prod.discountPriceIqd > 0 &&
          prod.discountPriceIqd < basePrice
            ? prod.discountPriceIqd
            : basePrice;
        const lineTotalIqd = Math.round(unitPriceIqd * requestedQty);
        subtotalIqd += lineTotalIqd;

        builtItems.push({
          itemId: safeCommerceId('pdoitem'),
          productId,
          medicineId: prod.medicineId || '',
          medicineName: `${prod.brandName || prod.scientificName}${prod.strength ? ` ${prod.strength}` : ''}`.trim(),
          strength: prod.strength || '',
          dosageForm: prod.dosageForm || '',
          packSize: prod.packSize || '',
          imageReference: prod.imageReference || '',
          requestedQty,
          confirmedQty: requestedQty,
          unitPriceIqd,
          lineTotalIqd,
          batchAllocations: [],
        });
      }

      const deliveryFeeIqd =
        fulfillmentType === 'seller_delivery'
          ? Number(
              phProfile.deliveryFeeIqd ??
                phProfile.deliveryZones?.find((z) => z.isActive)?.feeIqd ??
                0,
            )
          : 0;
      const totalIqd = Math.max(0, subtotalIqd + deliveryFeeIqd);
      const orderId = safeCommerceId('pdord');
      const orderNumber = `PHD-${todayStr.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const nowIso = new Date().toISOString();

      const orderDoc: PharmacyDoctorOrder = {
        orderId,
        orderNumber,
        pharmacyUid,
        pharmacyInstitutionId: phProfile.institutionId || `inst_pharmacy_${pharmacyUid}`,
        pharmacyName: phProfile.pharmacyNameAr || phProfile.pharmacyNameEn || 'Pharmacy',
        pharmacyGovernorate: phProfile.governorate || '',
        pharmacyAddress: phProfile.address || '',
        pharmacyPhone: phProfile.professionalPhone || '',
        doctorUid: docCtx.actor.uid,
        doctorInstitutionId: docCtx.institutionId,
        doctorName: normalizeStr(docCtx.profile.fullName, 120) || docCtx.actor.name,
        clinicName: normalizeStr(docCtx.profile.clinicName, 160),
        doctorGovernorate: normalizeStr(docCtx.profile.governorate, 80),
        doctorAddress: normalizeStr(docCtx.profile.workAddress, 240),
        doctorPhone: normalizeStr(docCtx.profile.professionalPhone, 32),
        status: 'Submitted',
        paymentMethod,
        paymentStatus: 'unpaid',
        fulfillmentType,
        ...(deliveryAddress ? { deliveryAddress } : {}),
        subtotalIqd,
        discountIqd: 0,
        deliveryFeeIqd,
        totalIqd,
        ...(notes ? { notes } : {}),
        items: builtItems,
        stockDeducted: false,
        receiptIssued: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await db.doc(`pharmacy_doctor_orders/${orderId}`).set(orderDoc);

      const notifId = safeCommerceId('phnot');
      await db.doc(`pharmacy_notifications/${notifId}`).set({
        notificationId: notifId,
        pharmacyUid,
        type: 'doctor_order_new',
        title: `طلب توريد طبيب جديد (${orderNumber})`,
        body: `من د. ${orderDoc.doctorName} (${orderDoc.clinicName || 'عيادة'}) بقيمة ${totalIqd.toLocaleString('en-US')} د.ع`,
        relatedOrderId: orderId,
        isRead: false,
        createdAt: nowIso,
      });

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'pharmacy_order_updated',
          recipientUid: pharmacyUid,
          recipientRole: 'pharmacy',
          title: `طلب توريد طبيب جديد (${orderNumber})`,
          body: `من د. ${orderDoc.doctorName} بقيمة ${totalIqd.toLocaleString('en-US')} د.ع`,
          inAppType: 'pharmacy_order_updated',
          relatedId: orderId,
          relatedType: 'pharmacy_doctor_order',
          idempotencyKey: `phd_new_${orderId}`,
        })
        .catch(() => undefined);

      res.status(201).json({ ok: true, order: orderDoc });
    } catch (err) {
      console.error('[MEDORA][Commerce] create doctor pharmacy order failed:', err);
      await logOperationalError(db, {
        scope: 'pharmacy_to_doctor_order_create',
        code: 'DOCTOR_ORDER_CREATE_FAILED',
        message: err instanceof Error ? err.message : 'Unknown error',
        actorUid: docCtx.actor.uid,
        actorRole: 'doctor',
      });
      res.status(500).json({ error: 'DOCTOR_ORDER_CREATE_FAILED' });
    }
  });

  router.get('/doctor/pharmacy-orders', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const docCtx = await requireApprovedDoctor(req, res, db);
    if (!docCtx) return;

    try {
      const [ordersSnap, receiptsSnap] = await Promise.all([
        db
          .collection('pharmacy_doctor_orders')
          .where('doctorUid', '==', docCtx.actor.uid)
          .limit(200)
          .get(),
        db
          .collection('medora_receipts')
          .where('buyerUid', '==', docCtx.actor.uid)
          .limit(200)
          .get()
          .catch(() => ({ docs: [] })),
      ]);

      const orders = sortByCreatedDesc(
        ordersSnap.docs.map((d) => serializeDoc(d.data()) as unknown as PharmacyDoctorOrder),
      );
      const receipts = sortByCreatedDesc(
        receiptsSnap.docs
          .map((d) => serializeDoc(d.data()) as unknown as MedoraReceiptRecord)
          .filter((r) => r.transactionType === 'pharmacy_to_doctor'),
      );

      res.json({ ok: true, orders, receipts });
    } catch (err) {
      console.error('[MEDORA][Commerce] GET /doctor/pharmacy-orders failed:', err);
      res.status(500).json({ error: 'DOCTOR_ORDERS_LOAD_FAILED' });
    }
  });

  async function completeDoctorOrderInTx(params: {
    db: Firestore;
    orderId: string;
    expectedOwnerField: 'doctorUid' | 'pharmacyUid';
    expectedOwnerUid: string;
    actorUid: string;
    actorName: string;
    actorRole: string;
    confirmBuyer: boolean;
  }): Promise<{ order: PharmacyDoctorOrder; receipt: MedoraReceiptRecord }> {
    const { db, orderId, expectedOwnerField, expectedOwnerUid, actorUid, actorName, actorRole, confirmBuyer } =
      params;

    return db.runTransaction(async (tx) => {
      const orderRef = db.doc(`pharmacy_doctor_orders/${orderId}`);
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');

      const order = serializeDoc(orderSnap.data()) as unknown as PharmacyDoctorOrder;
      if (order[expectedOwnerField] !== expectedOwnerUid) {
        throw new Error('ORDER_FORBIDDEN');
      }

      const preReadReceipt = await preReadReceiptStateInTx(db, tx, orderId);

      if (order.status === 'Completed' && preReadReceipt.rcptSnap.exists) {
        return {
          order,
          receipt: serializeDoc(preReadReceipt.rcptSnap.data()) as unknown as MedoraReceiptRecord,
        };
      }

      const allowedCompleteFrom = new Set<PharmacyDoctorOrderStatus>(
        confirmBuyer
          ? ['Ready for Pickup', 'Out for Delivery', 'Delivered']
          : ['Accepted', 'Preparing', 'Ready for Pickup', 'Out for Delivery', 'Delivered'],
      );
      if (!allowedCompleteFrom.has(order.status)) {
        throw new Error('INVALID_STATUS_FOR_COMPLETION');
      }

      // Pre-read ALL pharmacy_batches needed BEFORE any writes!
      const todayStr = getTodayBaghdadDateStr();
      const preReadBatchesByProduct = new Map<
        string,
        Array<{ ref: FirebaseFirestore.DocumentReference; data: PharmacyBatchRecord }>
      >();
      const preReadBatchById = new Map<
        string,
        { ref: FirebaseFirestore.DocumentReference; data: PharmacyBatchRecord }
      >();

      if (!order.stockDeducted) {
        const uniqueProductIds = Array.from(new Set((order.items || []).map((it) => it.productId)));
        const batchSnaps = await Promise.all(
          uniqueProductIds.map((productId) =>
            tx.get(
              db
                .collection('pharmacy_batches')
                .where('productId', '==', productId)
                .where('pharmacyUid', '==', order.pharmacyUid),
            ),
          ),
        );

        uniqueProductIds.forEach((productId, idx) => {
          const list = batchSnaps[idx].docs.map((snap) => {
            const data = serializeDoc(snap.data()) as unknown as PharmacyBatchRecord;
            const entry = { ref: snap.ref, data };
            preReadBatchById.set(data.batchId || snap.id, entry);
            return entry;
          });
          preReadBatchesByProduct.set(productId, list);
        });
      }

      const nowIso = new Date().toISOString();
      const updatedItems: PharmacyDoctorOrderItem[] = [];
      const batchDeductions = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: PharmacyBatchRecord; qty: number; reservedDec: number }>();

      if (!order.stockDeducted) {
        for (const item of order.items || []) {
          const existingAllocs = item.batchAllocations || [];
          if (existingAllocs.length > 0) {
            for (const al of existingAllocs) {
              const found = preReadBatchById.get(al.batchId);
              if (!found) throw new Error(`BATCH_MISSING:${al.batchId}`);
              const prev = batchDeductions.get(al.batchId);
              batchDeductions.set(al.batchId, {
                ref: found.ref,
                data: found.data,
                qty: (prev?.qty || 0) + Number(al.quantity || 0),
                reservedDec: (prev?.reservedDec || 0) + Number(al.quantity || 0),
              });
            }
            updatedItems.push(item);
          } else {
            const candidateBatches = (preReadBatchesByProduct.get(item.productId) || []).map((x) => x.data);
            const fefo = allocateFefoBatches(
              candidateBatches,
              Number(item.confirmedQty || item.requestedQty || 0),
              todayStr,
            );
            if (!fefo.ok) {
              throw new Error(`INSUFFICIENT_FEFO_STOCK:${item.medicineName}`);
            }
            for (const al of fefo.allocations) {
              const found = preReadBatchById.get(al.batchId);
              if (!found) throw new Error(`BATCH_MISSING:${al.batchId}`);
              const prev = batchDeductions.get(al.batchId);
              batchDeductions.set(al.batchId, {
                ref: found.ref,
                data: found.data,
                qty: (prev?.qty || 0) + al.quantity,
                reservedDec: prev?.reservedDec || 0,
              });
            }
            updatedItems.push({ ...item, batchAllocations: fefo.allocations });
          }
        }

        // Apply atomic FEFO deductions + ledger entries
        for (const [batchId, dec] of batchDeductions.entries()) {
          const nextAvail = Number(dec.data.availableQty || 0) - dec.qty;
          const nextReserved = Math.max(0, Number(dec.data.reservedQty || 0) - dec.reservedDec);
          if (nextAvail < 0) throw new Error('INSUFFICIENT_BATCH_STOCK_ON_COMMIT');
          tx.update(dec.ref, {
            availableQty: nextAvail,
            reservedQty: nextReserved,
            updatedAt: FieldValue.serverTimestamp(),
          });
          const movId = safeCommerceId('pmov');
          tx.set(db.doc(`pharmacy_inventory_movements/${movId}`), {
            movementId: movId,
            pharmacyUid: order.pharmacyUid,
            productId: dec.data.productId,
            batchId,
            batchNumber: dec.data.batchNumber,
            movementType: 'commit_doctor_order',
            quantityDelta: -dec.qty,
            reservedDelta: -dec.reservedDec,
            reason: `Completed doctor order ${order.orderNumber}`,
            relatedOrderId: orderId,
            actorUid,
            actorName,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      } else {
        updatedItems.push(...(order.items || []));
      }

      const isCredit = order.paymentMethod === 'credit_account';
      const receiptPaymentStatus: MedoraPaymentStatus = isCredit ? 'credit_open' : 'paid';
      const orderPaymentStatus = isCredit ? 'unpaid' : 'paid';

      const issued = await issueUnifiedReceiptOnCompletion(
        db,
        tx,
        {
          transactionType: 'pharmacy_to_doctor',
          orderId,
          orderNumber: order.orderNumber,
          sellerUid: order.pharmacyUid,
          sellerRole: 'pharmacy',
          sellerName: order.pharmacyName,
          sellerInstitutionId: order.pharmacyInstitutionId,
          sellerGovernorate: order.pharmacyGovernorate,
          sellerAddress: order.pharmacyAddress,
          sellerPhone: order.pharmacyPhone,
          buyerUid: order.doctorUid,
          buyerRole: 'doctor',
          buyerName: order.doctorName,
          buyerInstitutionId: order.doctorInstitutionId,
          buyerGovernorate: order.doctorGovernorate,
          buyerAddress: order.deliveryAddress || order.doctorAddress,
          buyerPhone: order.doctorPhone,
          items: updatedItems.map((it) => ({
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
          paidAmountIqd: isCredit ? 0 : Number(order.totalIqd || 0),
          balanceDueIqd: isCredit ? Number(order.totalIqd || 0) : 0,
          paymentMethod: order.paymentMethod,
          paymentStatus: receiptPaymentStatus,
          fulfillmentType: order.fulfillmentType,
          notes: order.notes,
          actorUid,
          actorName,
          actorRole,
          completedAtIso: nowIso,
        },
        preReadReceipt,
      );

      const orderUpdates: Partial<PharmacyDoctorOrder> = {
        status: 'Completed',
        paymentStatus: orderPaymentStatus,
        items: updatedItems,
        stockDeducted: true,
        receiptIssued: true,
        receiptId: issued.receipt.receiptId,
        receiptNumber: issued.receipt.receiptNumber,
        ...(confirmBuyer ? { confirmedByDoctorAt: nowIso } : {}),
        completedAt: nowIso,
        updatedAt: nowIso,
      };

      tx.update(orderRef, orderUpdates);
      return {
        order: { ...order, ...orderUpdates },
        receipt: issued.receipt,
      };
    });
  }

  router.post('/doctor/pharmacy-orders/:orderId/confirm-receipt', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const docCtx = await requireApprovedDoctor(req, res, db);
    if (!docCtx) return;
    const orderId = normalizeStr(req.params.orderId, 128);
    if (!orderId) {
      res.status(400).json({ error: 'INVALID_ORDER_ID' });
      return;
    }

    try {
      const result = await completeDoctorOrderInTx({
        db,
        orderId,
        expectedOwnerField: 'doctorUid',
        expectedOwnerUid: docCtx.actor.uid,
        actorUid: docCtx.actor.uid,
        actorName: normalizeStr(docCtx.profile.fullName, 120) || docCtx.actor.name,
        actorRole: 'doctor',
        confirmBuyer: true,
      });

      const notifId = safeCommerceId('phnot');
      await db
        .doc(`pharmacy_notifications/${notifId}`)
        .set({
          notificationId: notifId,
          pharmacyUid: result.order.pharmacyUid,
          type: 'doctor_order_completed',
          title: `تم تأكيد استلام طلب الطبيب (${result.order.orderNumber})`,
          body: `تم إصدار الإيصال الموحد ${result.receipt.receiptNumber}`,
          relatedOrderId: orderId,
          isRead: false,
          createdAt: new Date().toISOString(),
        })
        .catch(() => undefined);

      res.json({ ok: true, order: result.order, receipt: result.receipt });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'DOCTOR_CONFIRM_RECEIPT_FAILED';
      await logOperationalError(db, {
        scope: 'doctor_confirm_pharmacy_order',
        code,
        message: code,
        actorUid: docCtx.actor.uid,
        actorRole: 'doctor',
        relatedOrderId: orderId,
      });
      const status = code === 'ORDER_NOT_FOUND' ? 404 : code === 'ORDER_FORBIDDEN' ? 403 : 400;
      res.status(status).json({ error: code });
    }
  });

  router.get('/pharmacy/doctor-orders', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    const phRes = await resolvePharmacyActorFromDb(db, actor);
    if (!phRes.ok) {
      res.status(phRes.statusCode).json({ error: phRes.code });
      return;
    }

    try {
      const [ordersSnap, receiptsSnap] = await Promise.all([
        db
          .collection('pharmacy_doctor_orders')
          .where('pharmacyUid', '==', phRes.ctx.pharmacyUid)
          .limit(200)
          .get(),
        db
          .collection('medora_receipts')
          .where('sellerUid', '==', phRes.ctx.pharmacyUid)
          .limit(200)
          .get()
          .catch(() => ({ docs: [] })),
      ]);

      const orders = sortByCreatedDesc(
        ordersSnap.docs.map((d) => serializeDoc(d.data()) as unknown as PharmacyDoctorOrder),
      );
      const receipts = sortByCreatedDesc(
        receiptsSnap.docs
          .map((d) => serializeDoc(d.data()) as unknown as MedoraReceiptRecord)
          .filter((r) => r.transactionType === 'pharmacy_to_doctor'),
      );

      res.json({ ok: true, orders, receipts });
    } catch (err) {
      console.error('[MEDORA][Commerce] GET /pharmacy/doctor-orders failed:', err);
      res.status(500).json({ error: 'PHARMACY_DOCTOR_ORDERS_FAILED' });
    }
  });

  router.post('/pharmacy/doctor-orders/:orderId/action', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    const phRes = await resolvePharmacyActorFromDb(db, actor);
    if (!phRes.ok) {
      res.status(phRes.statusCode).json({ error: phRes.code });
      return;
    }

    const orderId = normalizeStr(req.params.orderId, 128);
    const action = normalizeStr(req.body?.action, 40);
    const reason = normalizeStr(req.body?.reason, 300);

    const ALLOWED_ACTIONS = new Set([
      'accept',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'delivered',
      'complete',
      'reject',
    ]);
    if (!orderId || !ALLOWED_ACTIONS.has(action)) {
      res.status(400).json({ error: 'INVALID_DOCTOR_ORDER_ACTION' });
      return;
    }

    try {
      if (action === 'complete') {
        const result = await completeDoctorOrderInTx({
          db,
          orderId,
          expectedOwnerField: 'pharmacyUid',
          expectedOwnerUid: phRes.ctx.pharmacyUid,
          actorUid: phRes.ctx.actor.uid,
          actorName: phRes.ctx.actor.name,
          actorRole: phRes.ctx.actorRole,
          confirmBuyer: false,
        });

        const engine = getGlobalNotificationEngine();
        await engine
          ?.dispatch({
            eventType: 'pharmacy_order_updated',
            recipientUid: result.order.doctorUid,
            recipientRole: 'doctor',
            title: `اكتمل طلبك الدوائي (${result.order.orderNumber})`,
            body: `تم إصدار الإيصال الموحد رقم ${result.receipt.receiptNumber}`,
            inAppType: 'pharmacy_order_updated',
            relatedId: orderId,
            relatedType: 'pharmacy_doctor_order',
            idempotencyKey: `phd_done_${orderId}`,
          })
          .catch(() => undefined);

        res.json({ ok: true, order: result.order, receipt: result.receipt });
        return;
      }

      const updatedOrder = await db.runTransaction(async (tx) => {
        const orderRef = db.doc(`pharmacy_doctor_orders/${orderId}`);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) throw new Error('ORDER_NOT_FOUND');

        const order = serializeDoc(orderSnap.data()) as unknown as PharmacyDoctorOrder;
        if (order.pharmacyUid !== phRes.ctx.pharmacyUid) throw new Error('ORDER_FORBIDDEN');
        if (order.status === 'Completed' || order.status === 'Rejected' || order.status === 'Cancelled') {
          throw new Error('ORDER_ALREADY_TERMINAL');
        }

        const nowIso = new Date().toISOString();

        if (action === 'accept') {
          if (order.status !== 'Submitted') throw new Error('ORDER_NOT_IN_SUBMITTED_STATE');
          const todayStr = getTodayBaghdadDateStr();
          const uniqueProductIds = Array.from(new Set((order.items || []).map((it) => it.productId)));
          const batchSnaps = await Promise.all(
            uniqueProductIds.map((pid) =>
              tx.get(
                db
                  .collection('pharmacy_batches')
                  .where('productId', '==', pid)
                  .where('pharmacyUid', '==', phRes.ctx.pharmacyUid),
              ),
            ),
          );
          const batchesByProduct = new Map<string, PharmacyBatchRecord[]>();
          const batchRefMap = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: PharmacyBatchRecord }>();
          uniqueProductIds.forEach((pid, idx) => {
            const list: PharmacyBatchRecord[] = [];
            for (const snap of batchSnaps[idx].docs) {
              const data = serializeDoc(snap.data()) as unknown as PharmacyBatchRecord;
              list.push(data);
              batchRefMap.set(data.batchId || snap.id, { ref: snap.ref, data });
            }
            batchesByProduct.set(pid, list);
          });

          const updatedItems: PharmacyDoctorOrderItem[] = [];
          const reserveIncrements = new Map<string, number>();

          for (const item of order.items || []) {
            const pool = batchesByProduct.get(item.productId) || [];
            const fefo = allocateFefoBatches(pool, item.requestedQty, todayStr);
            if (!fefo.ok) throw new Error(`INSUFFICIENT_STOCK:${item.medicineName}`);
            for (const al of fefo.allocations) {
              reserveIncrements.set(al.batchId, (reserveIncrements.get(al.batchId) || 0) + al.quantity);
            }
            updatedItems.push({ ...item, batchAllocations: fefo.allocations });
          }

          for (const [batchId, qty] of reserveIncrements.entries()) {
            const target = batchRefMap.get(batchId);
            if (!target) continue;
            const nextReserved = Number(target.data.reservedQty || 0) + qty;
            tx.update(target.ref, {
              reservedQty: nextReserved,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          const updates: Partial<PharmacyDoctorOrder> = {
            status: 'Accepted',
            items: updatedItems,
            updatedAt: nowIso,
          };
          tx.update(orderRef, updates);
          return { ...order, ...updates };
        }

        if (action === 'reject') {
          const releaseRefs: Array<{ ref: FirebaseFirestore.DocumentReference; reservedQty: number; qty: number }> = [];
          if (!order.stockDeducted) {
            for (const item of order.items || []) {
              for (const al of item.batchAllocations || []) {
                const bRef = db.doc(`pharmacy_batches/${al.batchId}`);
                const bSnap = await tx.get(bRef);
                if (bSnap.exists) {
                  releaseRefs.push({
                    ref: bRef,
                    reservedQty: Number(bSnap.data()?.reservedQty || 0),
                    qty: Number(al.quantity || 0),
                  });
                }
              }
            }
          }
          for (const rel of releaseRefs) {
            tx.update(rel.ref, {
              reservedQty: Math.max(0, rel.reservedQty - rel.qty),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          const updates: Partial<PharmacyDoctorOrder> = {
            status: 'Rejected',
            ...(reason ? { rejectionReason: reason } : {}),
            updatedAt: nowIso,
          };
          tx.update(orderRef, updates);
          return { ...order, ...updates };
        }

        const STATUS_BY_ACTION: Record<string, PharmacyDoctorOrderStatus> = {
          preparing: 'Preparing',
          ready_for_pickup: 'Ready for Pickup',
          out_for_delivery: 'Out for Delivery',
          delivered: 'Delivered',
        };
        const nextStatus = STATUS_BY_ACTION[action];
        const updates: Partial<PharmacyDoctorOrder> = {
          status: nextStatus,
          updatedAt: nowIso,
        };
        tx.update(orderRef, updates);
        return { ...order, ...updates };
      });

      const engine = getGlobalNotificationEngine();
      await engine
        ?.dispatch({
          eventType: 'pharmacy_order_updated',
          recipientUid: updatedOrder.doctorUid,
          recipientRole: 'doctor',
          title: `تحديث طلب التوريد (${updatedOrder.orderNumber})`,
          body: `أصبحت حالة الطلب الآن: ${updatedOrder.status}`,
          inAppType: 'pharmacy_order_updated',
          relatedId: orderId,
          relatedType: 'pharmacy_doctor_order',
          idempotencyKey: `phd_${orderId}_${updatedOrder.status}`,
        })
        .catch(() => undefined);

      res.json({ ok: true, order: updatedOrder });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'DOCTOR_ORDER_ACTION_FAILED';
      const status =
        code === 'ORDER_NOT_FOUND'
          ? 404
          : code === 'ORDER_FORBIDDEN'
            ? 403
            : code === 'ORDER_ALREADY_TERMINAL'
              ? 409
              : 400;
      res.status(status).json({ error: code });
    }
  });

  // -------------------------------------------------------------------------
  // 2. UNIFIED 3-PARTY LINKED RECEIPTS (ADMIN + SELLER + BUYER)
  // -------------------------------------------------------------------------
  router.get('/receipts', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const txFilter = normalizeStr(req.query.transactionType, 40);
    const q = normalizeStr(req.query.q, 80).toLowerCase();

    try {
      const scope = await resolveReceiptViewerScope(db, actor);
      const receiptsMap = new Map<string, MedoraReceiptRecord>();

      if (scope.isSuperAdmin) {
        const snap = await db.collection('medora_receipts').limit(300).get();
        for (const d of snap.docs) {
          const r = serializeDoc(d.data()) as unknown as MedoraReceiptRecord;
          if (r.receiptId) receiptsMap.set(r.receiptId, r);
        }
      } else {
        const uids = Array.from(scope.scopedUids);
        const queries = uids.flatMap((uid) => [
          db.collection('medora_receipts').where('sellerUid', '==', uid).limit(200).get(),
          db.collection('medora_receipts').where('buyerUid', '==', uid).limit(200).get(),
        ]);
        const snaps = await Promise.all(queries);
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const r = serializeDoc(d.data()) as unknown as MedoraReceiptRecord;
            if (r.receiptId) receiptsMap.set(r.receiptId, r);
          }
        }
      }

      let receipts = sortByCreatedDesc(Array.from(receiptsMap.values()));
      if (txFilter && txFilter !== 'all') {
        receipts = receipts.filter((r) => r.transactionType === txFilter);
      }
      if (q) {
        receipts = receipts.filter((r) =>
          [r.receiptNumber, r.orderNumber, r.sellerName, r.buyerName, r.transactionType]
            .join(' ')
            .toLowerCase()
            .includes(q),
        );
      }

      res.json({ ok: true, receipts });
    } catch (err) {
      console.error('[MEDORA][Receipts] GET /receipts failed:', err);
      res.status(500).json({ error: 'RECEIPTS_LOAD_FAILED' });
    }
  });

  router.get('/receipts/:receiptId', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    const receiptId = normalizeStr(req.params.receiptId, 128);
    if (!receiptId) {
      res.status(400).json({ error: 'INVALID_RECEIPT_ID' });
      return;
    }

    try {
      const scope = await resolveReceiptViewerScope(db, actor);
      const snap = await db.doc(`medora_receipts/${receiptId}`).get();
      if (!snap.exists) {
        res.status(404).json({ error: 'RECEIPT_NOT_FOUND' });
        return;
      }
      const receipt = serializeDoc(snap.data()) as unknown as MedoraReceiptRecord;
      if (
        !scope.isSuperAdmin &&
        !scope.scopedUids.has(receipt.sellerUid) &&
        !scope.scopedUids.has(receipt.buyerUid)
      ) {
        res.status(403).json({ error: 'RECEIPT_FORBIDDEN' });
        return;
      }

      const eventsSnap = await db
        .collection('medora_receipt_events')
        .where('receiptId', '==', receiptId)
        .limit(100)
        .get()
        .catch(() => ({ docs: [] }));

      const events = sortByCreatedDesc(eventsSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>);
      res.json({ ok: true, receipt, events });
    } catch (err) {
      console.error('[MEDORA][Receipts] GET /receipts/:id failed:', err);
      res.status(500).json({ error: 'RECEIPT_DETAIL_FAILED' });
    }
  });

  router.post('/receipts/:receiptId/reprint', async (req: Request, res: Response) => {
    const db = deps.getAdminDb();
    const actor = await verifyActor(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }
    const receiptId = normalizeStr(req.params.receiptId, 128);
    if (!receiptId) {
      res.status(400).json({ error: 'INVALID_RECEIPT_ID' });
      return;
    }

    try {
      const scope = await resolveReceiptViewerScope(db, actor);
      const updated = await db.runTransaction(async (tx) => {
        const ref = db.doc(`medora_receipts/${receiptId}`);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('RECEIPT_NOT_FOUND');

        const receipt = serializeDoc(snap.data()) as unknown as MedoraReceiptRecord;
        if (
          !scope.isSuperAdmin &&
          !scope.scopedUids.has(receipt.sellerUid) &&
          !scope.scopedUids.has(receipt.buyerUid)
        ) {
          throw new Error('RECEIPT_FORBIDDEN');
        }

        const nowIso = new Date().toISOString();
        const nextCount = Number(receipt.reprintCount || 0) + 1;
        const nextHistory = [
          ...(Array.isArray(receipt.auditHistory) ? receipt.auditHistory : []),
          {
            action: 'reprinted' as const,
            actorUid: actor.uid,
            actorName: actor.name,
            actorRole: scope.actorRoleLabel,
            at: nowIso,
          },
        ].slice(-50);

        tx.update(ref, {
          reprintCount: nextCount,
          lastPrintedAt: nowIso,
          auditHistory: nextHistory,
          updatedAt: nowIso,
        });

        const eventId = safeCommerceId('rcptev');
        tx.set(db.doc(`medora_receipt_events/${eventId}`), {
          eventId,
          receiptId: receipt.receiptId,
          receiptNumber: receipt.receiptNumber,
          orderId: receipt.orderId,
          sellerUid: receipt.sellerUid,
          buyerUid: receipt.buyerUid,
          eventType: 'reprinted',
          actorUid: actor.uid,
          actorName: actor.name,
          actorRole: scope.actorRoleLabel,
          metadata: { reprintCount: nextCount },
          createdAt: nowIso,
        });

        return {
          ...receipt,
          reprintCount: nextCount,
          lastPrintedAt: nowIso,
          auditHistory: nextHistory,
          updatedAt: nowIso,
        };
      });

      res.json({ ok: true, receipt: updated });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'RECEIPT_REPRINT_FAILED';
      const status = code === 'RECEIPT_NOT_FOUND' ? 404 : code === 'RECEIPT_FORBIDDEN' ? 403 : 400;
      res.status(status).json({ error: code });
    }
  });

  // -------------------------------------------------------------------------
  // 3. SUPER ADMIN RECEIPT GOVERNANCE & UNIFIED COMMERCE OVERSIGHT
  // -------------------------------------------------------------------------
  router.post(
    '/admin/receipts/:receiptId/void',
    deps.requireSuperAdmin,
    async (req: Request, res: Response) => {
      const db = deps.getAdminDb();
      const adminCtx = (req as Request & { adminCtx?: { uid: string; email: string } }).adminCtx;
      const receiptId = normalizeStr(req.params.receiptId, 128);
      const reason = normalizeStr(req.body?.reason, 300);

      if (!receiptId || reason.length < 3) {
        res.status(400).json({ error: 'REASON_REQUIRED_MIN_3_CHARS' });
        return;
      }

      try {
        const updated = await db.runTransaction(async (tx) => {
          const ref = db.doc(`medora_receipts/${receiptId}`);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error('RECEIPT_NOT_FOUND');

          const receipt = serializeDoc(snap.data()) as unknown as MedoraReceiptRecord;
          if (receipt.status === 'voided') throw new Error('RECEIPT_ALREADY_VOIDED');

          const nowIso = new Date().toISOString();
          const nextHistory = [
            ...(Array.isArray(receipt.auditHistory) ? receipt.auditHistory : []),
            {
              action: 'voided' as const,
              actorUid: adminCtx?.uid || 'super_admin',
              actorName: adminCtx?.email || 'MEDORA Super Admin',
              actorRole: 'super_admin',
              reason,
              at: nowIso,
            },
          ].slice(-50);

          tx.update(ref, {
            status: 'voided',
            voidReason: reason,
            voidedByUid: adminCtx?.uid || 'super_admin',
            voidedByName: adminCtx?.email || 'MEDORA Super Admin',
            voidedAt: nowIso,
            auditHistory: nextHistory,
            updatedAt: nowIso,
          });

          const eventId = safeCommerceId('rcptev');
          tx.set(db.doc(`medora_receipt_events/${eventId}`), {
            eventId,
            receiptId: receipt.receiptId,
            receiptNumber: receipt.receiptNumber,
            orderId: receipt.orderId,
            sellerUid: receipt.sellerUid,
            buyerUid: receipt.buyerUid,
            eventType: 'voided',
            actorUid: adminCtx?.uid || 'super_admin',
            actorName: adminCtx?.email || 'MEDORA Super Admin',
            actorRole: 'super_admin',
            reason,
            createdAt: nowIso,
          });

          const logId = safeCommerceId('admlog');
          tx.set(db.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: adminCtx?.uid || 'super_admin',
            actorEmail: adminCtx?.email || AUTHORIZED_SUPER_ADMIN_EMAIL,
            action: 'RECEIPT_VOIDED',
            targetCollection: 'medora_receipts',
            targetId: receiptId,
            details: `Voided receipt ${receipt.receiptNumber}: ${reason}`,
            createdAt: FieldValue.serverTimestamp(),
          });

          return {
            ...receipt,
            status: 'voided' as const,
            voidReason: reason,
            voidedAt: nowIso,
            auditHistory: nextHistory,
            updatedAt: nowIso,
          };
        });

        const engine = getGlobalNotificationEngine();
        await Promise.all([
          engine?.dispatch({
            eventType: 'important_account_update',
            recipientUid: updated.sellerUid,
            recipientRole: updated.sellerRole,
            title: `تم إبطال الإيصال ${updated.receiptNumber}`,
            body: `قرار إداري من المشرف العام · السبب: ${reason}`,
            inAppType: 'admin_notice',
            relatedId: updated.receiptId,
            relatedType: 'medora_receipt',
            idempotencyKey: `rcpt_void_sel_${updated.receiptId}`,
          }),
          engine?.dispatch({
            eventType: 'important_account_update',
            recipientUid: updated.buyerUid,
            recipientRole: updated.buyerRole,
            title: `تم إبطال الإيصال ${updated.receiptNumber}`,
            body: `قرار إداري من المشرف العام · السبب: ${reason}`,
            inAppType: 'admin_notice',
            relatedId: updated.receiptId,
            relatedType: 'medora_receipt',
            idempotencyKey: `rcpt_void_buy_${updated.receiptId}`,
          }),
        ]).catch(() => undefined);

        res.json({ ok: true, receipt: updated });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'RECEIPT_VOID_FAILED';
        const status = code === 'RECEIPT_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: code });
      }
    },
  );

  router.patch(
    '/admin/receipts/:receiptId/amend',
    deps.requireSuperAdmin,
    async (req: Request, res: Response) => {
      const db = deps.getAdminDb();
      const adminCtx = (req as Request & { adminCtx?: { uid: string; email: string } }).adminCtx;
      const receiptId = normalizeStr(req.params.receiptId, 128);
      const reason = normalizeStr(req.body?.reason, 300);
      const rawPayStatus = normalizeStr(req.body?.paymentStatus, 32);
      const notes = normalizeStr(req.body?.notes, 400);

      if (!receiptId || reason.length < 3) {
        res.status(400).json({ error: 'REASON_REQUIRED_MIN_3_CHARS' });
        return;
      }

      try {
        const updated = await db.runTransaction(async (tx) => {
          const ref = db.doc(`medora_receipts/${receiptId}`);
          const snap = await tx.get(ref);
          if (!snap.exists) throw new Error('RECEIPT_NOT_FOUND');

          const receipt = serializeDoc(snap.data()) as unknown as MedoraReceiptRecord;
          if (receipt.status === 'voided') throw new Error('CANNOT_AMEND_VOIDED_RECEIPT');

          const nowIso = new Date().toISOString();
          const nextPayStatus: MedoraPaymentStatus =
            rawPayStatus === 'paid' || rawPayStatus === 'partial' || rawPayStatus === 'credit_open'
              ? (rawPayStatus as MedoraPaymentStatus)
              : receipt.paymentStatus;
          const nextHistory = [
            ...(Array.isArray(receipt.auditHistory) ? receipt.auditHistory : []),
            {
              action: 'amended' as const,
              actorUid: adminCtx?.uid || 'super_admin',
              actorName: adminCtx?.email || 'MEDORA Super Admin',
              actorRole: 'super_admin',
              reason,
              at: nowIso,
            },
          ].slice(-50);

          const paidAmountIqd =
            nextPayStatus === 'paid' ? receipt.totalAmountIqd : receipt.paidAmountIqd;
          const balanceDueIqd =
            nextPayStatus === 'paid' ? 0 : Math.max(0, receipt.totalAmountIqd - paidAmountIqd);

          tx.update(ref, {
            status: 'amended',
            amendmentNote: reason,
            amendedByUid: adminCtx?.uid || 'super_admin',
            amendedByName: adminCtx?.email || 'MEDORA Super Admin',
            amendedAt: nowIso,
            paymentStatus: nextPayStatus,
            paidAmountIqd,
            balanceDueIqd,
            ...(notes ? { notes } : {}),
            auditHistory: nextHistory,
            updatedAt: nowIso,
          });

          const eventId = safeCommerceId('rcptev');
          tx.set(db.doc(`medora_receipt_events/${eventId}`), {
            eventId,
            receiptId: receipt.receiptId,
            receiptNumber: receipt.receiptNumber,
            orderId: receipt.orderId,
            sellerUid: receipt.sellerUid,
            buyerUid: receipt.buyerUid,
            eventType: 'amended',
            actorUid: adminCtx?.uid || 'super_admin',
            actorName: adminCtx?.email || 'MEDORA Super Admin',
            actorRole: 'super_admin',
            reason,
            createdAt: nowIso,
          });

          const logId = safeCommerceId('admlog');
          tx.set(db.doc(`audit_logs/${logId}`), {
            logId,
            actorUid: adminCtx?.uid || 'super_admin',
            actorEmail: adminCtx?.email || AUTHORIZED_SUPER_ADMIN_EMAIL,
            action: 'RECEIPT_AMENDED',
            targetCollection: 'medora_receipts',
            targetId: receiptId,
            details: `Amended receipt ${receipt.receiptNumber}: ${reason}`,
            createdAt: FieldValue.serverTimestamp(),
          });

          return {
            ...receipt,
            status: 'amended' as const,
            amendmentNote: reason,
            amendedAt: nowIso,
            paymentStatus: nextPayStatus,
            paidAmountIqd,
            balanceDueIqd,
            ...(notes ? { notes } : {}),
            auditHistory: nextHistory,
            updatedAt: nowIso,
          };
        });

        res.json({ ok: true, receipt: updated });
      } catch (err) {
        const code = err instanceof Error ? err.message : 'RECEIPT_AMEND_FAILED';
        const status = code === 'RECEIPT_NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: code });
      }
    },
  );

  router.get(
    '/admin/commerce/overview',
    deps.requireSuperAdmin,
    async (_req: Request, res: Response) => {
      const db = deps.getAdminDb();
      try {
        const [whSnap, phDocSnap, phPatSnap, rcptSnap, evSnap, errSnap] = await Promise.all([
          db.collection('wholesaler_supply_orders').limit(200).get().catch(() => ({ docs: [] })),
          db.collection('pharmacy_doctor_orders').limit(200).get().catch(() => ({ docs: [] })),
          db.collection('pharmacy_orders').limit(200).get().catch(() => ({ docs: [] })),
          db.collection('medora_receipts').limit(250).get().catch(() => ({ docs: [] })),
          db.collection('medora_receipt_events').limit(250).get().catch(() => ({ docs: [] })),
          db.collection('medora_operational_errors').limit(150).get().catch(() => ({ docs: [] })),
        ]);

        res.json({
          ok: true,
          wholesalerSupplyOrders: sortByCreatedDesc(
            whSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
          pharmacyDoctorOrders: sortByCreatedDesc(
            phDocSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
          pharmacyOrders: sortByCreatedDesc(
            phPatSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
          receipts: sortByCreatedDesc(
            rcptSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
          receiptEvents: sortByCreatedDesc(
            evSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
          operationalErrors: sortByCreatedDesc(
            errSnap.docs.map((d) => serializeDoc(d.data())) as Array<{ createdAt?: string }>,
          ),
        });
      } catch (err) {
        console.error('[MEDORA][AdminCommerce] overview failed:', err);
        res.status(500).json({ error: 'ADMIN_COMMERCE_OVERVIEW_FAILED' });
      }
    },
  );

  router.post(
    '/admin/operational-errors/:errorId/resolve',
    deps.requireSuperAdmin,
    async (req: Request, res: Response) => {
      const db = deps.getAdminDb();
      const errorId = normalizeStr(req.params.errorId, 128);
      if (!errorId) {
        res.status(400).json({ error: 'INVALID_ERROR_ID' });
        return;
      }
      try {
        await db.doc(`medora_operational_errors/${errorId}`).update({
          resolved: true,
          resolvedAt: new Date().toISOString(),
        });
        res.json({ ok: true });
      } catch (err) {
        console.error('[MEDORA][AdminCommerce] resolve error failed:', err);
        res.status(500).json({ error: 'RESOLVE_ERROR_FAILED' });
      }
    },
  );

  return router;
}
