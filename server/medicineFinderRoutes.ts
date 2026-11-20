import express, { type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  PHARMACY_CANCELLABLE_BY_PATIENT,
  allocateFefoBatches,
  evaluatePharmacyAvailabilityForFinder,
  generatePickupVerificationCode,
  getTodayBaghdadDateStr,
  resolvePharmacyDeliveryZone,
  summarizeProductBatchStock,
  type RequestedFinderMedicineItem,
} from './pharmacyWholesalerEngine.ts';
import {
  issueUnifiedReceiptOnCompletion,
  preReadReceiptStateInTx,
} from './commerceReceiptsEngine.ts';
import type {
  MedicineFinderPharmacyOffer,
  PatientIndividualMedicineOffer,
  PharmacyBatchRecord,
  PharmacyOrderItem,
  PharmacyOrderRecord,
  PharmacyProductRecord,
  PharmacyProfileDocument,
  PharmacySpecialOfferRecord,
  PublicPharmacyCard,
  PublicPharmacyStorefrontProduct,
} from '../src/types/pharmacy.ts';

export interface MedicineFinderRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
}

interface VerifiedPatientActor {
  uid: string;
  email: string;
  name: string;
}

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

async function verifyPatientActor(
  req: Request,
  adminAuth: Auth,
): Promise<
  | { ok: true; actor: VerifiedPatientActor }
  | { ok: false; statusCode: number; error: string }
> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
  try {
    const decoded = await adminAuth.verifyIdToken(token, false);
    if (!decoded.uid) return { ok: false, statusCode: 401, error: 'UNAUTHENTICATED' };
    if (decoded.email_verified !== true) {
      return { ok: false, statusCode: 403, error: 'EMAIL_UNVERIFIED' };
    }
    const email = normalizeStr(decoded.email, 254).toLowerCase();
    const name =
      normalizeStr(decoded.name, 120) ||
      (email ? email.split('@')[0] : 'MEDORA Patient');
    return { ok: true, actor: { uid: decoded.uid, email, name } };
  } catch {
    return { ok: false, statusCode: 401, error: 'INVALID_TOKEN' };
  }
}

async function verifyOwnedPrescription(
  db: Firestore,
  patientUid: string,
  prescriptionId: string,
): Promise<{
  ok: true;
  rx: Record<string, unknown>;
  patientRecordId: string;
} | {
  ok: false;
  statusCode: number;
  error: string;
}> {
  const rxSnap = await db.doc(`prescriptions/${prescriptionId}`).get();
  if (!rxSnap.exists) {
    return { ok: false, statusCode: 404, error: 'PRESCRIPTION_NOT_FOUND' };
  }
  const rx = serializeDoc(rxSnap.data());
  const patientRecordId = normalizeStr(rx.patientRecordId, 128);
  const directPatientUid = normalizeStr(rx.patientUid, 128);

  if (directPatientUid && directPatientUid === patientUid) {
    return { ok: true, rx, patientRecordId };
  }

  if (patientRecordId) {
    const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
    if (patSnap.exists) {
      const pData = patSnap.data() as Record<string, unknown>;
      if (String(pData.linkedPatientUid || '') === patientUid) {
        return { ok: true, rx, patientRecordId };
      }
    }
  }

  return { ok: false, statusCode: 403, error: 'PRESCRIPTION_FORBIDDEN' };
}

export function createMedicineFinderRouter(deps: MedicineFinderRouterDeps): Router {
  const router = express.Router();

  const requirePatient = async (req: Request, res: Response): Promise<{
    db: Firestore;
    actor: VerifiedPatientActor;
  } | null> => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'FIRESTORE_ADMIN_UNAVAILABLE' });
      return null;
    }
    const authRes = await verifyPatientActor(req, deps.adminAuth);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ error: authRes.error });
      return null;
    }
    const userSnap = await db.doc(`users/${authRes.actor.uid}`).get();
    const u = userSnap.exists ? serializeDoc(userSnap.data()) : {};
    const fullName = normalizeStr(u.fullName, 120) || authRes.actor.name;
    return {
      db,
      actor: { ...authRes.actor, name: fullName },
    };
  };

  const requireVerifiedPortalViewer = async (
    req: Request,
    res: Response,
  ): Promise<{ db: Firestore; actor: VerifiedPatientActor } | null> => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'FIRESTORE_ADMIN_UNAVAILABLE' });
      return null;
    }
    const authRes = await verifyPatientActor(req, deps.adminAuth);
    if (!authRes.ok) {
      res.status(authRes.statusCode).json({ error: authRes.error });
      return null;
    }
    return { db, actor: authRes.actor };
  };

  /**
   * POST /api/patient/medicine-finder/search
   * Searches approved, non-suspended pharmacies by prescriptionId OR free-text/medicine items.
   * Uses real unexpired pharmacy_batches and never auto-substitutes medicines.
   */
  router.post('/patient/medicine-finder/search', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const prescriptionId = normalizeStr(req.body?.prescriptionId, 128);
    const governorateFilter = normalizeStr(req.body?.governorate, 80);
    const districtFilter = normalizeStr(req.body?.district, 80);

    try {
      const userSnap = await ctx.db.doc(`users/${ctx.actor.uid}`).get();
      const userData = userSnap.exists ? serializeDoc(userSnap.data()) : {};
      const patientGov = governorateFilter || normalizeStr(userData.governorate, 80);
      const patientDist = districtFilter || normalizeStr(userData.district, 80);

      let requestedItems: RequestedFinderMedicineItem[] = [];
      let prescriptionSummary: Record<string, unknown> | null = null;

      if (prescriptionId) {
        const ownedRx = await verifyOwnedPrescription(ctx.db, ctx.actor.uid, prescriptionId);
        if (!ownedRx.ok) {
          res.status(ownedRx.statusCode).json({ error: ownedRx.error });
          return;
        }
        const meds = Array.isArray(ownedRx.rx.medications)
          ? (ownedRx.rx.medications as Array<Record<string, unknown>>)
          : [];
        requestedItems = meds
          .map((m) => ({
            name: normalizeStr(m.name, 160),
            dosage: normalizeStr(m.dosage, 80),
            quantity: normalizeNum(m.quantity, 1, 50, 1),
          }))
          .filter((m) => m.name.length >= 2);
        prescriptionSummary = {
          prescriptionId,
          doctorUid: ownedRx.rx.doctorUid,
          doctorName: ownedRx.rx.doctorName,
          doctorSpecialty: ownedRx.rx.doctorSpecialty,
          prescribedDate: ownedRx.rx.prescribedDate,
          medicationsCount: requestedItems.length,
        };
      } else {
        const rawItems = Array.isArray(req.body?.items)
          ? (req.body.items as Array<Record<string, unknown>>)
          : [];
        requestedItems = rawItems
          .map((item) => ({
            name: normalizeStr(item.name, 160),
            dosage: normalizeStr(item.dosage, 80),
            quantity: normalizeNum(item.quantity, 1, 100, 1),
            medicineId: normalizeStr(item.medicineId, 128) || undefined,
          }))
          .filter((m) => m.name.length >= 2 || Boolean(m.medicineId))
          .slice(0, 25);
      }

      if (requestedItems.length === 0) {
        res.status(400).json({ error: 'NO_SEARCH_ITEMS_PROVIDED' });
        return;
      }

      // Load approved pharmacy_profiles and verify institutions are active (not suspended)
      const [pharmSnap, instSnap, prodSnap, batchSnap] = await Promise.all([
        ctx.db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(200).get(),
        ctx.db.collection('institutions').where('type', '==', 'pharmacy').limit(200).get(),
        ctx.db.collection('pharmacy_products').where('isActive', '==', true).limit(3000).get(),
        ctx.db.collection('pharmacy_batches').where('isExpired', '==', false).limit(5000).get(),
      ]);

      const activeInstIds = new Set<string>();
      for (const doc of instSnap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.status === 'active') activeInstIds.add(doc.id);
      }

      const productsByPharmacy = new Map<string, PharmacyProductRecord[]>();
      for (const doc of prodSnap.docs) {
        const p = serializeDoc(doc.data()) as unknown as PharmacyProductRecord;
        if (!p.pharmacyUid) continue;
        const arr = productsByPharmacy.get(p.pharmacyUid) || [];
        arr.push(p);
        productsByPharmacy.set(p.pharmacyUid, arr);
      }

      const batchesByProduct = new Map<string, PharmacyBatchRecord[]>();
      for (const doc of batchSnap.docs) {
        const b = serializeDoc(doc.data()) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProduct.get(b.productId) || [];
        arr.push(b);
        batchesByProduct.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const offers: MedicineFinderPharmacyOffer[] = [];

      for (const doc of pharmSnap.docs) {
        const profile = serializeDoc(doc.data()) as unknown as PharmacyProfileDocument;
        if (profile.institutionId && !activeInstIds.has(profile.institutionId)) {
          continue;
        }
        if (
          governorateFilter &&
          profile.governorate.trim().toLowerCase() !== governorateFilter.toLowerCase()
        ) {
          continue;
        }

        const offer = evaluatePharmacyAvailabilityForFinder({
          pharmacy: profile,
          products: productsByPharmacy.get(profile.uid) || [],
          batchesByProductId: batchesByProduct,
          requestedItems,
          patientGovernorate: patientGov,
          patientDistrict: patientDist,
          todayStr,
        });

        offers.push(offer);
      }

      const rankWeight = {
        'Complete Prescription Available': 0,
        'Partial Availability': 1,
        'Not Available': 2,
      } as const;

      offers.sort((a, b) => {
        const rw = rankWeight[a.availabilityClass] - rankWeight[b.availabilityClass];
        if (rw !== 0) return rw;
        if (a.matchedCount !== b.matchedCount) return b.matchedCount - a.matchedCount;
        const sameGovA = a.governorate.toLowerCase() === patientGov.toLowerCase() ? 0 : 1;
        const sameGovB = b.governorate.toLowerCase() === patientGov.toLowerCase() ? 0 : 1;
        if (sameGovA !== sameGovB) return sameGovA - sameGovB;
        return a.estimatedTotalWithDeliveryIqd - b.estimatedTotalWithDeliveryIqd;
      });

      res.json({
        ok: true,
        prescription: prescriptionSummary,
        requestedItems,
        patientLocation: { governorate: patientGov, district: patientDist },
        offers,
      });
    } catch (err) {
      console.error('[MEDORA][MedicineFinderSearch] error:', err);
      res.status(500).json({ error: 'MEDICINE_FINDER_SEARCH_FAILED' });
    }
  });

  /**
   * GET /api/patient/medicines/search?q=...&governorate=...
   * Patient single-medicine search & pharmacy retail price comparison.
   * Strictly exposes approved, active, published pharmacy offers with live unexpired stock only.
   * Zero wholesaler stock, wholesale price, or purchase/cost prices ever exposed.
   */
  router.get('/patient/medicines/search', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const q = normalizeStr(req.query?.q, 120).toLowerCase();
    const governorateFilter = normalizeStr(req.query?.governorate, 80);
    const inStockOnly = req.query?.inStockOnly !== 'false';

    if (q.length < 2) {
      res.status(400).json({ error: 'SEARCH_QUERY_TOO_SHORT' });
      return;
    }

    try {
      const [pharmSnap, instSnap, prodSnap, batchSnap] = await Promise.all([
        ctx.db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(200).get(),
        ctx.db.collection('institutions').where('type', '==', 'pharmacy').limit(200).get(),
        ctx.db.collection('pharmacy_products').where('isActive', '==', true).limit(3000).get(),
        ctx.db.collection('pharmacy_batches').where('isExpired', '==', false).limit(5000).get(),
      ]);

      const activeInstIds = new Set<string>();
      for (const doc of instSnap.docs) {
        const d = doc.data() as Record<string, unknown>;
        if (d.status === 'active') activeInstIds.add(doc.id);
      }

      const pharmacyByUid = new Map<string, PharmacyProfileDocument>();
      for (const doc of pharmSnap.docs) {
        const prof = serializeDoc(doc.data()) as unknown as PharmacyProfileDocument;
        if (prof.institutionId && !activeInstIds.has(prof.institutionId)) continue;
        if (
          governorateFilter &&
          prof.governorate.trim().toLowerCase() !== governorateFilter.toLowerCase()
        ) {
          continue;
        }
        pharmacyByUid.set(prof.uid, prof);
      }

      const batchesByProduct = new Map<string, PharmacyBatchRecord[]>();
      for (const doc of batchSnap.docs) {
        const b = serializeDoc(doc.data()) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProduct.get(b.productId) || [];
        arr.push(b);
        batchesByProduct.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const offers: PatientIndividualMedicineOffer[] = [];

      for (const doc of prodSnap.docs) {
        const p = serializeDoc(doc.data()) as unknown as PharmacyProductRecord;
        if (
          !p.availableForPatientOrders ||
          p.isPublishedToPatients === false ||
          p.reviewStatus === 'pending_review'
        ) {
          continue;
        }
        const pharmacy = pharmacyByUid.get(p.pharmacyUid);
        if (!pharmacy) continue;

        const searchable = [
          p.scientificName,
          p.brandName,
          p.activeIngredient,
          p.barcode,
          p.manufacturer,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) continue;

        const stock = summarizeProductBatchStock(
          batchesByProduct.get(p.productId) || [],
          todayStr,
        );
        if (inStockOnly && stock.netAvailableQty <= 0) continue;
        if (stock.netAvailableQty <= 0) continue;

        const sellingPriceIqd = Number(p.sellingPriceIqd || 0);
        const discountPriceIqd =
          typeof p.discountPriceIqd === 'number' && p.discountPriceIqd > 0
            ? p.discountPriceIqd
            : null;
        const effectivePriceIqd = discountPriceIqd ?? sellingPriceIqd;
        const reorderThreshold = Number(p.reorderLevel ?? p.minStockThreshold ?? 5);

        offers.push({
          pharmacyUid: pharmacy.uid,
          institutionId: pharmacy.institutionId,
          pharmacyNameAr: pharmacy.pharmacyNameAr,
          pharmacyNameEn: pharmacy.pharmacyNameEn,
          governorate: pharmacy.governorate,
          district: pharmacy.district,
          address: pharmacy.address,
          pickupAvailable: pharmacy.pickupAvailable !== false,
          deliveryAvailable: Boolean(pharmacy.deliveryAvailable),
          acceptedPaymentMethods:
            Array.isArray(pharmacy.acceptedPaymentMethods) &&
            pharmacy.acceptedPaymentMethods.length > 0
              ? pharmacy.acceptedPaymentMethods
              : ['cash_on_pickup', 'cash_on_delivery'],
          productId: p.productId,
          medicineId: p.medicineId,
          scientificName: p.scientificName,
          activeIngredient: p.activeIngredient,
          brandName: p.brandName,
          strength: p.strength,
          dosageForm: p.dosageForm,
          packSize: p.packSize,
          manufacturer: p.manufacturer,
          country: p.country,
          imageReference: p.imageReference,
          requiresPrescription: Boolean(p.requiresPrescription),
          controlledDrug: Boolean(p.controlledDrug),
          sellingPriceIqd,
          discountPriceIqd,
          effectivePriceIqd,
          availableQty: stock.netAvailableQty,
          availabilityStatus: stock.netAvailableQty <= reorderThreshold ? 'low_stock' : 'in_stock',
          nearestExpiryDate: stock.nearestExpiryDate,
        });
      }

      offers.sort((a, b) => a.effectivePriceIqd - b.effectivePriceIqd);
      res.json({ ok: true, offers });
    } catch (err) {
      console.error('[MEDORA][PatientSingleMedicineSearch] error:', err);
      res.status(500).json({ error: 'PATIENT_MEDICINES_SEARCH_FAILED' });
    }
  });

  /**
   * GET /api/patient/pharmacy-orders
   * Returns patient's own pharmacy orders + pharmacy communications.
   */
  router.get('/patient/pharmacy-orders', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    try {
      const [ordersSnap, commsSnap] = await Promise.all([
        ctx.db.collection('pharmacy_orders').where('patientUid', '==', ctx.actor.uid).limit(150).get(),
        ctx.db.collection('pharmacy_communications').where('channelType', '==', 'patient_order').limit(400).get(),
      ]);

      const orders = ordersSnap.docs
        .map((d) => serializeDoc(d.data()) as unknown as PharmacyOrderRecord)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const ownedOrderIds = new Set(orders.map((o) => o.orderId));
      const communications = commsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((m) => ownedOrderIds.has(String(m.relatedId || '')))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

      res.json({ ok: true, orders, communications });
    } catch (err) {
      console.error('[MEDORA][PatientPharmacyOrders] error:', err);
      res.status(500).json({ error: 'PATIENT_PHARMACY_ORDERS_FAILED' });
    }
  });

  /**
   * POST /api/patient/pharmacy-orders
   * Atomic patient checkout against a single approved pharmacy:
   * - Idempotent via clientRequestKey
   * - Verifies prescription ownership when prescriptionId supplied
   * - Enforces prescription requirement for Rx-only products
   * - Re-calculates prices and delivery fee strictly on server (returns 409 PRICE_CHANGED if stale expectedTotalIqd)
   * - Atomically allocates and reserves FEFO batches inside db.runTransaction
   */
  router.post('/patient/pharmacy-orders', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const pharmacyUid = normalizeStr(req.body?.pharmacyUid, 128);
    const prescriptionId = normalizeStr(req.body?.prescriptionId, 128);
    const fulfillmentType = req.body?.fulfillmentType === 'delivery' ? 'delivery' : 'pickup';
    const requestedPaymentMethod =
      req.body?.paymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'cash_on_pickup';
    const deliveryAddress = normalizeStr(req.body?.deliveryAddress, 240);
    const deliveryGovernorate = normalizeStr(req.body?.deliveryGovernorate, 80);
    const deliveryDistrict = normalizeStr(req.body?.deliveryDistrict, 80);
    const clientRequestKey = normalizeStr(req.body?.clientRequestKey, 128);
    const expectedTotalIqd =
      req.body?.expectedTotalIqd !== undefined && req.body?.expectedTotalIqd !== null
        ? Number(req.body.expectedTotalIqd)
        : undefined;

    const rawItems = Array.isArray(req.body?.items)
      ? (req.body.items as Array<Record<string, unknown>>)
      : [];
    const requestedItems = rawItems
      .map((i) => ({
        productId: normalizeStr(i.productId, 128),
        quantity: Math.floor(normalizeNum(i.quantity, 1, 100, 0)),
      }))
      .filter((i) => i.productId && i.quantity > 0);

    if (!pharmacyUid || requestedItems.length === 0) {
      res.status(400).json({ error: 'INVALID_PHARMACY_ORDER_PAYLOAD' });
      return;
    }
    if (fulfillmentType === 'delivery' && (!deliveryGovernorate || !deliveryDistrict || deliveryAddress.length < 3)) {
      res.status(400).json({ error: 'DELIVERY_ADDRESS_REQUIRED' });
      return;
    }

    try {
      // Idempotency guard
      if (clientRequestKey) {
        const existingSnap = await ctx.db
          .collection('pharmacy_orders')
          .where('patientUid', '==', ctx.actor.uid)
          .where('clientRequestKey', '==', clientRequestKey)
          .limit(1)
          .get();
        if (!existingSnap.empty) {
          res.json({
            ok: true,
            idempotentReplay: true,
            order: serializeDoc(existingSnap.docs[0].data()),
          });
          return;
        }
      }

      // Optional Prescription verification (never leaks other patients' Rx)
      let verifiedRx: Record<string, unknown> | null = null;
      if (prescriptionId) {
        const owned = await verifyOwnedPrescription(ctx.db, ctx.actor.uid, prescriptionId);
        if (!owned.ok) {
          res.status(owned.statusCode).json({ error: owned.error });
          return;
        }
        verifiedRx = owned.rx;
      }

      // Verify Pharmacy profile + institution active
      const [pharmSnap, userSnap] = await Promise.all([
        ctx.db.doc(`pharmacy_profiles/${pharmacyUid}`).get(),
        ctx.db.doc(`users/${ctx.actor.uid}`).get(),
      ]);
      if (!pharmSnap.exists) {
        res.status(404).json({ error: 'PHARMACY_NOT_FOUND' });
        return;
      }
      const pharmProfile = serializeDoc(pharmSnap.data()) as unknown as PharmacyProfileDocument;
      if (pharmProfile.status !== 'Approved') {
        res.status(403).json({ error: 'PHARMACY_NOT_APPROVED' });
        return;
      }
      if (pharmProfile.institutionId) {
        const instSnap = await ctx.db.doc(`institutions/${pharmProfile.institutionId}`).get();
        if (instSnap.exists && instSnap.data()?.status !== 'active') {
          res.status(403).json({ error: 'PHARMACY_SUSPENDED' });
          return;
        }
      }

      if (fulfillmentType === 'pickup' && pharmProfile.pickupAvailable === false) {
        res.status(400).json({ error: 'PICKUP_NOT_SUPPORTED_BY_PHARMACY' });
        return;
      }

      let deliveryFeeIqd = 0;
      let deliveryZoneId = '';
      if (fulfillmentType === 'delivery') {
        const zoneRes = resolvePharmacyDeliveryZone(
          pharmProfile,
          deliveryGovernorate,
          deliveryDistrict,
        );
        if (!zoneRes.supported) {
          res.status(400).json({ error: 'DELIVERY_ZONE_UNSUPPORTED' });
          return;
        }
        deliveryFeeIqd = zoneRes.feeIqd;
        deliveryZoneId = zoneRes.zone?.zoneId || '';
      }

      const paymentMethod: 'cash_on_pickup' | 'cash_on_delivery' =
        fulfillmentType === 'delivery' ? 'cash_on_delivery' : requestedPaymentMethod;

      const userData = userSnap.exists ? serializeDoc(userSnap.data()) : {};
      const patientPhone = normalizeStr(userData.phone, 32);
      const patientPhoneMask =
        patientPhone.length >= 4
          ? `${patientPhone.slice(0, 4)}***${patientPhone.slice(-3)}`
          : undefined;

      const todayStr = getTodayBaghdadDateStr();
      const orderId = safeId('phord');
      const orderNumber = `PH-${Date.now().toString().slice(-6)}`;
      const pickupCode = fulfillmentType === 'pickup' ? generatePickupVerificationCode() : undefined;

      const txResult = await ctx.db.runTransaction(async (tx) => {
        const orderItems: PharmacyOrderItem[] = [];
        let subtotalIqd = 0;

        for (const reqItem of requestedItems) {
          const prodSnap = await tx.get(ctx.db.doc(`pharmacy_products/${reqItem.productId}`));
          if (!prodSnap.exists) {
            throw new Error(`PRODUCT_NOT_FOUND:${reqItem.productId}`);
          }
          const prod = serializeDoc(prodSnap.data()) as unknown as PharmacyProductRecord;
          if (
            prod.pharmacyUid !== pharmacyUid ||
            !prod.isActive ||
            !prod.availableForPatientOrders ||
            prod.isPublishedToPatients === false ||
            prod.reviewStatus === 'pending_review'
          ) {
            throw new Error(`PRODUCT_UNAVAILABLE:${reqItem.productId}`);
          }
          if ((prod.requiresPrescription || prod.controlledDrug) && !verifiedRx) {
            throw new Error(`PRESCRIPTION_REQUIRED:${prod.brandName || prod.scientificName}`);
          }

          const batchSnap = await tx.get(
            ctx.db
              .collection('pharmacy_batches')
              .where('pharmacyUid', '==', pharmacyUid)
              .where('productId', '==', reqItem.productId)
              .where('isExpired', '==', false)
              .limit(100),
          );
          const batches = batchSnap.docs.map(
            (d) => serializeDoc(d.data()) as unknown as PharmacyBatchRecord,
          );
          const fefo = allocateFefoBatches(batches, reqItem.quantity, todayStr);
          if (!fefo.ok) {
            throw new Error(`INSUFFICIENT_STOCK:${prod.brandName || prod.scientificName}`);
          }

          const unitPriceIqd = Number(prod.discountPriceIqd ?? prod.sellingPriceIqd ?? 0);
          const lineTotalIqd = unitPriceIqd * reqItem.quantity;
          subtotalIqd += lineTotalIqd;

          for (const alloc of fefo.allocations) {
            const bDoc = batches.find((b) => b.batchId === alloc.batchId);
            if (!bDoc) continue;
            tx.update(ctx.db.doc(`pharmacy_batches/${alloc.batchId}`), {
              reservedQty: Number(bDoc.reservedQty || 0) + alloc.quantity,
              updatedAt: FieldValue.serverTimestamp(),
            });
            const movId = safeId('phmov');
            tx.set(ctx.db.doc(`pharmacy_inventory_movements/${movId}`), {
              movementId: movId,
              pharmacyUid,
              productId: prod.productId,
              batchId: alloc.batchId,
              batchNumber: alloc.batchNumber,
              movementType: 'reserve',
              quantityDelta: 0,
              reservedDelta: alloc.quantity,
              reason: `حجز مخزني لطلب المريض ${orderNumber}`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
          }

          orderItems.push({
            itemId: safeId('oi'),
            productId: prod.productId,
            medicineId: prod.medicineId,
            medicineName: `${prod.brandName || prod.scientificName} (${prod.strength})`,
            activeIngredient: prod.activeIngredient,
            strength: prod.strength,
            dosageForm: prod.dosageForm,
            packSize: prod.packSize,
            requestedQty: reqItem.quantity,
            confirmedQty: reqItem.quantity,
            unitPriceIqd,
            lineTotalIqd,
            requiresPrescription: Boolean(prod.requiresPrescription || prod.controlledDrug),
            availabilityStatus: 'pending_review',
            batchAllocations: fefo.allocations,
          });
        }

        const minOrderIqd = Number(pharmProfile.minimumOrderIqd || 0);
        if (minOrderIqd > 0 && subtotalIqd < minOrderIqd) {
          throw new Error(`BELOW_MINIMUM_ORDER:${minOrderIqd}`);
        }

        const serverTotalIqd = subtotalIqd + deliveryFeeIqd;
        if (
          expectedTotalIqd !== undefined &&
          Number.isFinite(expectedTotalIqd) &&
          Math.abs(expectedTotalIqd - serverTotalIqd) > 0.01
        ) {
          return {
            priceChanged: true as const,
            freshSubtotalIqd: subtotalIqd,
            freshDeliveryFeeIqd: deliveryFeeIqd,
            freshTotalIqd: serverTotalIqd,
          };
        }

        const orderDoc: Record<string, unknown> = {
          orderId,
          orderNumber,
          pharmacyUid,
          institutionId: pharmProfile.institutionId || '',
          pharmacyName: pharmProfile.pharmacyNameAr || pharmProfile.pharmacyNameEn,
          patientUid: ctx.actor.uid,
          patientName: ctx.actor.name,
          ...(patientPhoneMask ? { patientPhoneMask } : {}),
          ...(prescriptionId ? { prescriptionId } : {}),
          ...(verifiedRx?.doctorUid ? { doctorUid: String(verifiedRx.doctorUid) } : {}),
          ...(verifiedRx?.doctorName ? { doctorName: String(verifiedRx.doctorName) } : {}),
          fulfillmentType,
          paymentMethod,
          paymentStatus: 'unpaid',
          ...(fulfillmentType === 'delivery'
            ? {
                deliveryAddress,
                deliveryGovernorate,
                deliveryDistrict,
                ...(deliveryZoneId ? { deliveryZoneId } : {}),
              }
            : {}),
          deliveryFeeIqd,
          subtotalIqd,
          discountIqd: 0,
          totalIqd: serverTotalIqd,
          status: 'Submitted',
          ...(pickupCode ? { pickupCode } : {}),
          ...(clientRequestKey ? { clientRequestKey } : {}),
          items: orderItems,
          source: 'patient_finder',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        tx.set(ctx.db.doc(`pharmacy_orders/${orderId}`), orderDoc);

        // Create isolated prescription review containing ONLY Rx data (never patient general medical history)
        if (verifiedRx && prescriptionId) {
          const reviewId = safeId('rxrev');
          tx.set(ctx.db.doc(`pharmacy_prescription_reviews/${reviewId}`), {
            reviewId,
            pharmacyUid,
            prescriptionId,
            patientUid: ctx.actor.uid,
            patientName: ctx.actor.name,
            doctorUid: String(verifiedRx.doctorUid || ''),
            doctorName: String(verifiedRx.doctorName || ''),
            doctorSpecialty: String(verifiedRx.doctorSpecialty || ''),
            prescribedDate: String(verifiedRx.prescribedDate || todayStr),
            medications: Array.isArray(verifiedRx.medications) ? verifiedRx.medications : [],
            doctorNotes: normalizeStr(verifiedRx.notes, 500),
            reviewStatus: 'Submitted',
            linkedOrderId: orderId,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (fulfillmentType === 'delivery') {
          const deliveryId = safeId('phdel');
          tx.set(ctx.db.doc(`pharmacy_deliveries/${deliveryId}`), {
            deliveryId,
            pharmacyUid,
            orderId,
            orderNumber,
            patientName: ctx.actor.name,
            governorate: deliveryGovernorate,
            district: deliveryDistrict,
            address: deliveryAddress,
            deliveryFeeIqd,
            status: 'pending_assignment',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        return { priceChanged: false as const, orderId };
      });

      if ('priceChanged' in txResult && txResult.priceChanged) {
        res.status(409).json({
          error: 'PRICE_CHANGED',
          freshSubtotalIqd: txResult.freshSubtotalIqd,
          freshDeliveryFeeIqd: txResult.freshDeliveryFeeIqd,
          freshTotalIqd: txResult.freshTotalIqd,
        });
        return;
      }

      const savedOrderSnap = await ctx.db.doc(`pharmacy_orders/${orderId}`).get();
      const savedOrder = serializeDoc(savedOrderSnap.data()) as unknown as PharmacyOrderRecord;

      const engine = getGlobalNotificationEngine();
      if (engine) {
        await engine
          .dispatch({
            eventType: 'pharmacy_medicine_request_received',
            recipientUid: pharmacyUid,
            recipientRole: 'pharmacy',
            title: `طلب دوائي جديد (${orderNumber}) من ${ctx.actor.name}`,
            body:
              fulfillmentType === 'delivery'
                ? `توصيل إلى ${deliveryGovernorate} - ${deliveryDistrict} · الإجمالي ${savedOrder.totalIqd.toLocaleString()} د.ع`
                : `استلام من الصيدلية · الإجمالي ${savedOrder.totalIqd.toLocaleString()} د.ع`,
            inAppType: 'pharmacy_order',
            relatedId: orderId,
            relatedType: 'pharmacy_order',
            idempotencyKey: `ph_new_ord:${orderId}`,
            placeholders: {
              refCode: orderNumber,
              dateLabel: getTodayBaghdadDateStr(),
            },
          })
          .catch(() => undefined);
      }

      res.status(201).json({ ok: true, order: savedOrder });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ORDER_CREATE_FAILED';
      if (
        msg.startsWith('PRODUCT_') ||
        msg.startsWith('PRESCRIPTION_') ||
        msg.startsWith('INSUFFICIENT_') ||
        msg.startsWith('BELOW_MINIMUM_')
      ) {
        res.status(409).json({ error: msg });
        return;
      }
      console.error('[MEDORA][CreatePatientPharmacyOrder] error:', err);
      res.status(500).json({ error: 'PATIENT_PHARMACY_ORDER_CREATE_FAILED' });
    }
  });

  /**
   * POST /api/patient/pharmacy-orders/:orderId/cancel
   * Allows patient cancellation only before Preparing / Ready for Pickup / Out for Delivery / Completed.
   * Atomically releases reserved FEFO batch quantities.
   */
  router.post('/patient/pharmacy-orders/:orderId/cancel', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const orderId = normalizeStr(req.params.orderId, 128);
    const reason = normalizeStr(req.body?.reason, 300) || 'إلغاء من قبل المريض';
    if (!orderId) {
      res.status(400).json({ error: 'INVALID_ORDER_ID' });
      return;
    }

    try {
      const orderRef = ctx.db.doc(`pharmacy_orders/${orderId}`);
      await ctx.db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw new Error('ORDER_NOT_FOUND');
        const order = serializeDoc(snap.data()) as unknown as PharmacyOrderRecord;
        if (order.patientUid !== ctx.actor.uid) throw new Error('ORDER_FORBIDDEN');
        if (!PHARMACY_CANCELLABLE_BY_PATIENT.has(order.status)) {
          throw new Error(`CANNOT_CANCEL_IN_STATUS:${order.status}`);
        }

        for (const item of order.items || []) {
          for (const alloc of item.batchAllocations || []) {
            if (!alloc.batchId || alloc.quantity <= 0) continue;
            const bRef = ctx.db.doc(`pharmacy_batches/${alloc.batchId}`);
            const bSnap = await tx.get(bRef);
            if (!bSnap.exists) continue;
            const bData = bSnap.data() as Record<string, unknown>;
            const nextReserved = Math.max(0, Number(bData.reservedQty || 0) - alloc.quantity);
            tx.update(bRef, {
              reservedQty: nextReserved,
              updatedAt: FieldValue.serverTimestamp(),
            });
            const movId = safeId('phmov');
            tx.set(ctx.db.doc(`pharmacy_inventory_movements/${movId}`), {
              movementId: movId,
              pharmacyUid: order.pharmacyUid,
              productId: item.productId,
              batchId: alloc.batchId,
              batchNumber: alloc.batchNumber,
              movementType: 'release_reserve',
              quantityDelta: 0,
              reservedDelta: -alloc.quantity,
              reason: `إلغاء طلب المريض ${order.orderNumber}`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        }

        tx.update(orderRef, {
          status: 'Cancelled',
          cancellationReason: reason,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      const refreshed = await orderRef.get();
      const updatedOrder = serializeDoc(refreshed.data()) as unknown as PharmacyOrderRecord;

      const engine = getGlobalNotificationEngine();
      if (engine) {
        await engine
          .dispatch({
            eventType: 'pharmacy_order_updated',
            recipientUid: updatedOrder.pharmacyUid,
            recipientRole: 'pharmacy',
            title: `إلغاء طلب المريض (${updatedOrder.orderNumber})`,
            body: `قام ${ctx.actor.name} بإلغاء الطلب: ${reason}`,
            inAppType: 'pharmacy_order',
            relatedId: orderId,
            relatedType: 'pharmacy_order',
            idempotencyKey: `ph_pat_cancel:${orderId}`,
            placeholders: { refCode: updatedOrder.orderNumber, statusLabel: 'Cancelled' },
          })
          .catch(() => undefined);
      }

      res.json({ ok: true, order: updatedOrder });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CANCEL_FAILED';
      if (msg === 'ORDER_NOT_FOUND') {
        res.status(404).json({ error: msg });
        return;
      }
      if (msg === 'ORDER_FORBIDDEN') {
        res.status(403).json({ error: msg });
        return;
      }
      if (msg.startsWith('CANNOT_CANCEL_IN_STATUS:')) {
        res.status(409).json({ error: msg });
        return;
      }
      console.error('[MEDORA][CancelPatientPharmacyOrder] error:', err);
      res.status(500).json({ error: 'PATIENT_PHARMACY_ORDER_CANCEL_FAILED' });
    }
  });

  /**
   * POST /api/patient/pharmacy-orders/:orderId/confirm-receipt
   * Buyer confirms receipt of Ready for Pickup / Out for Delivery order -> atomically commits FEFO stock,
   * completes order, and emits unified 3-party receipt (`medora_receipts/rcpt_${orderId}`).
   */
  router.post('/patient/pharmacy-orders/:orderId/confirm-receipt', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const orderId = normalizeStr(req.params.orderId, 128);
    if (!orderId) {
      res.status(400).json({ error: 'INVALID_ORDER_ID' });
      return;
    }

    try {
      const orderRef = ctx.db.doc(`pharmacy_orders/${orderId}`);
      const result = await ctx.db.runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (!snap.exists) throw new Error('ORDER_NOT_FOUND');
        const order = serializeDoc(snap.data()) as unknown as PharmacyOrderRecord & {
          stockDeducted?: boolean;
          receiptIssued?: boolean;
        };
        if (order.patientUid !== ctx.actor.uid) throw new Error('ORDER_FORBIDDEN');
        if (order.status === 'Completed' || order.receiptIssued) {
          throw new Error('ORDER_ALREADY_COMPLETED');
        }
        if (order.status !== 'Out for Delivery' && order.status !== 'Ready for Pickup') {
          throw new Error(`CANNOT_CONFIRM_IN_STATUS:${order.status}`);
        }

        const commitBatches: Array<{
          ref: FirebaseFirestore.DocumentReference;
          data: Record<string, unknown>;
          qty: number;
          productId: string;
          batchId: string;
          batchNumber: string;
        }> = [];
        if (!order.stockDeducted) {
          for (const item of order.items || []) {
            for (const alloc of item.batchAllocations || []) {
              if (!alloc.batchId || alloc.quantity <= 0) continue;
              const bRef = ctx.db.doc(`pharmacy_batches/${alloc.batchId}`);
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

        const invRef = ctx.db.doc(`pharmacy_invoices/pinv_${orderId}`);
        const pharmRef = ctx.db.doc(`pharmacy_profiles/${order.pharmacyUid}`);
        const [existingInvSnap, pharmSnap, preReadReceipt] = await Promise.all([
          tx.get(invRef),
          tx.get(pharmRef),
          preReadReceiptStateInTx(ctx.db, tx, orderId),
        ]);
        const pharm = pharmSnap.exists ? (pharmSnap.data() as Record<string, unknown>) : {};

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
            const movId = safeId('phmov');
            tx.set(ctx.db.doc(`pharmacy_inventory_movements/${movId}`), {
              movementId: movId,
              pharmacyUid: order.pharmacyUid,
              productId: cb.productId,
              batchId: cb.batchId,
              batchNumber: cb.batchNumber,
              movementType: 'commit_dispense',
              quantityDelta: -cb.qty,
              reservedDelta: -cb.qty,
              reason: `Patient confirmed receipt (${order.orderNumber})`,
              relatedOrderId: orderId,
              actorUid: ctx.actor.uid,
              actorName: ctx.actor.name,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        }

        const completedAtIso = new Date().toISOString();
        if (!existingInvSnap.exists) {
          tx.set(invRef, {
            invoiceId: `pinv_${orderId}`,
            invoiceNumber: `INV-PH-${order.orderNumber}`,
            pharmacyUid: order.pharmacyUid,
            institutionId: order.institutionId,
            pharmacyName: order.pharmacyName,
            orderId,
            orderNumber: order.orderNumber,
            patientUid: order.patientUid,
            patientName: order.patientName,
            subtotalIqd: order.subtotalIqd,
            deliveryFeeIqd: order.deliveryFeeIqd,
            discountIqd: order.discountIqd || 0,
            totalIqd: order.totalIqd,
            paidAmountIqd: order.totalIqd,
            balanceDueIqd: 0,
            paymentMethod: order.paymentMethod,
            status: 'paid',
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
          tx.set(ctx.db.doc(`pharmacy_dispensations/${dispId}`), {
            dispensationId: dispId,
            pharmacyUid: order.pharmacyUid,
            orderId,
            prescriptionId: order.prescriptionId,
            patientUid: order.patientUid,
            patientName: order.patientName,
            doctorUid: order.doctorUid || '',
            doctorName: order.doctorName || '',
            pharmacistUid: order.pharmacistUid || order.pharmacyUid,
            pharmacistName: order.pharmacistName || order.pharmacyName,
            items: dispItems,
            dispensedAt: completedAtIso,
          });
        }

        const issued = await issueUnifiedReceiptOnCompletion(
          ctx.db,
          tx,
          {
            transactionType: 'pharmacy_to_patient',
            orderId,
            orderNumber: order.orderNumber,
            sellerUid: order.pharmacyUid,
            sellerRole: 'pharmacy',
            sellerName: String(pharm.pharmacyNameAr || order.pharmacyName),
            sellerInstitutionId: order.institutionId,
            sellerGovernorate: String(pharm.governorate || ''),
            sellerAddress: String(pharm.address || ''),
            sellerPhone: String(pharm.professionalPhone || ''),
            buyerUid: ctx.actor.uid,
            buyerRole: 'patient',
            buyerName: ctx.actor.name,
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
            actorRole: 'patient',
            completedAtIso,
          },
          preReadReceipt,
        );

        tx.update(orderRef, {
          status: 'Completed',
          stockDeducted: true,
          receiptIssued: true,
          receiptId: issued.receipt.receiptId,
          receiptNumber: issued.receipt.receiptNumber,
          paymentStatus: 'paid',
          confirmedByPatientAt: completedAtIso,
          completedAt: completedAtIso,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          pharmacyUid: order.pharmacyUid,
          orderNumber: order.orderNumber,
          receipt: issued.receipt,
        };
      });

      const engine = getGlobalNotificationEngine();
      if (engine) {
        await engine
          .dispatch({
            eventType: 'pharmacy_order_updated',
            recipientUid: result.pharmacyUid,
            recipientRole: 'pharmacy',
            title: `أكد المريض استلام الطلب (${result.orderNumber})`,
            body: `تم تأكيد الاستلام وإصدار الإيصال رقم ${result.receipt.receiptNumber}.`,
            inAppType: 'pharmacy_order',
            relatedId: orderId,
            relatedType: 'pharmacy_order',
            idempotencyKey: `ph_pat_confirm_${orderId}`,
          })
          .catch(() => undefined);
      }

      const refreshed = await orderRef.get();
      res.json({
        ok: true,
        order: serializeDoc(refreshed.data()),
        receipt: result.receipt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'CONFIRM_RECEIPT_FAILED';
      const status =
        msg === 'ORDER_NOT_FOUND'
          ? 404
          : msg === 'ORDER_FORBIDDEN'
            ? 403
            : msg === 'ORDER_ALREADY_COMPLETED' || msg.startsWith('CANNOT_CONFIRM_')
              ? 409
              : 500;
      res.status(status).json({ error: msg });
    }
  });

  /**
   * POST /api/patient/pharmacy-orders/:orderId/message
   * Patient sends a message to the pharmacy regarding an owned order.
   */
  router.post('/patient/pharmacy-orders/:orderId/message', async (req, res) => {
    const ctx = await requirePatient(req, res);
    if (!ctx) return;

    const orderId = normalizeStr(req.params.orderId, 128);
    const body = normalizeStr(req.body?.body, 1500);
    if (!orderId || body.length < 2) {
      res.status(400).json({ error: 'INVALID_MESSAGE_PAYLOAD' });
      return;
    }

    try {
      const orderSnap = await ctx.db.doc(`pharmacy_orders/${orderId}`).get();
      if (!orderSnap.exists) {
        res.status(404).json({ error: 'ORDER_NOT_FOUND' });
        return;
      }
      const order = serializeDoc(orderSnap.data()) as unknown as PharmacyOrderRecord;
      if (order.patientUid !== ctx.actor.uid) {
        res.status(403).json({ error: 'ORDER_FORBIDDEN' });
        return;
      }

      const messageId = safeId('phmsg');
      await ctx.db.doc(`pharmacy_communications/${messageId}`).set({
        messageId,
        pharmacyUid: order.pharmacyUid,
        channelType: 'patient_order',
        relatedId: orderId,
        senderUid: ctx.actor.uid,
        senderName: ctx.actor.name,
        senderRole: 'patient',
        body,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      const saved = await ctx.db.doc(`pharmacy_communications/${messageId}`).get();
      res.status(201).json({ ok: true, message: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][PatientPharmacyMessage] error:', err);
      res.status(500).json({ error: 'PATIENT_PHARMACY_MESSAGE_FAILED' });
    }
  });

  /**
   * GET /api/pharmacy-storefronts?governorate=...&q=...
   * Returns verified Approved & Active pharmacies directory for Patients & Doctors.
   * Featured badges & promo banners appear ONLY when approved by Super Admin.
   * Zero wholesaler stock, wholesale price, or purchase price is ever exposed.
   */
  router.get('/pharmacy-storefronts', async (req, res) => {
    const ctx = await requireVerifiedPortalViewer(req, res);
    if (!ctx) return;

    const governorateFilter = normalizeStr(req.query?.governorate, 80).toLowerCase();
    const q = normalizeStr(req.query?.q, 120).toLowerCase();

    try {
      const [pharmSnap, instSnap, prodSnap, batchSnap, offersSnap] = await Promise.all([
        ctx.db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(200).get(),
        ctx.db.collection('institutions').where('type', '==', 'pharmacy').limit(200).get(),
        ctx.db.collection('pharmacy_products').where('isActive', '==', true).limit(3000).get(),
        ctx.db.collection('pharmacy_batches').where('isExpired', '==', false).limit(5000).get(),
        ctx.db
          .collection('pharmacy_special_offers')
          .where('approvalStatus', '==', 'approved')
          .limit(300)
          .get(),
      ]);

      const activeInstIds = new Set<string>();
      for (const doc of instSnap.docs) {
        if (doc.data()?.status === 'active') activeInstIds.add(doc.id);
      }

      const batchesByProd = new Map<string, PharmacyBatchRecord[]>();
      for (const doc of batchSnap.docs) {
        const b = serializeDoc(doc.data()) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProd.get(b.productId) || [];
        arr.push(b);
        batchesByProd.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const inStockCountByPharmacy = new Map<string, number>();
      for (const doc of prodSnap.docs) {
        const p = serializeDoc(doc.data()) as unknown as PharmacyProductRecord;
        if (
          !p.availableForPatientOrders ||
          p.isPublishedToPatients === false ||
          p.reviewStatus === 'pending_review'
        ) {
          continue;
        }
        const stock = summarizeProductBatchStock(batchesByProd.get(p.productId) || [], todayStr);
        if (stock.netAvailableQty <= 0) continue;
        inStockCountByPharmacy.set(
          p.pharmacyUid,
          (inStockCountByPharmacy.get(p.pharmacyUid) || 0) + 1,
        );
      }

      const approvedOffersByPharmacy = new Map<string, number>();
      for (const doc of offersSnap.docs) {
        const off = serializeDoc(doc.data()) as unknown as PharmacySpecialOfferRecord;
        if (!off.isActive || off.approvalStatus !== 'approved') continue;
        if (off.validUntil && off.validUntil < todayStr) continue;
        approvedOffersByPharmacy.set(
          off.pharmacyUid,
          (approvedOffersByPharmacy.get(off.pharmacyUid) || 0) + 1,
        );
      }

      const cards: PublicPharmacyCard[] = [];
      for (const doc of pharmSnap.docs) {
        const prof = serializeDoc(doc.data()) as unknown as PharmacyProfileDocument;
        if (prof.institutionId && !activeInstIds.has(prof.institutionId)) continue;
        if (governorateFilter && prof.governorate.trim().toLowerCase() !== governorateFilter) continue;
        if (q) {
          const text = [
            prof.pharmacyNameAr,
            prof.pharmacyNameEn,
            prof.governorate,
            prof.district,
            prof.address,
            prof.taglineAr,
            prof.taglineEn,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!text.includes(q)) continue;
        }

        const bannerApproved =
          prof.marketingApprovalStatus === 'approved' &&
          Boolean(
            prof.promotionalBannerTitleAr ||
              prof.promotionalBannerTitleEn ||
              prof.promotionalBannerBodyAr ||
              prof.promotionalBannerImageUrl,
          );

        cards.push({
          uid: prof.uid,
          institutionId: prof.institutionId || '',
          publicSlug: prof.publicSlug || prof.uid,
          pharmacyNameAr: prof.pharmacyNameAr,
          pharmacyNameEn: prof.pharmacyNameEn,
          governorate: prof.governorate,
          district: prof.district,
          address: prof.address,
          logoUrl: prof.logoUrl || undefined,
          coverImageUrl: prof.coverImageUrl || undefined,
          taglineAr: prof.taglineAr || undefined,
          taglineEn: prof.taglineEn || undefined,
          workingDaysAndHours: prof.workingDaysAndHours,
          is24Hours: Boolean(prof.is24Hours),
          pickupAvailable: prof.pickupAvailable !== false,
          deliveryAvailable: Boolean(prof.deliveryAvailable),
          deliveryZonesCount: Array.isArray(prof.deliveryZones)
            ? prof.deliveryZones.filter((z) => z.isActive).length
            : 0,
          minimumOrderIqd: Number(prof.minimumOrderIqd || 0),
          acceptedPaymentMethods:
            Array.isArray(prof.acceptedPaymentMethods) && prof.acceptedPaymentMethods.length > 0
              ? prof.acceptedPaymentMethods
              : ['cash_on_pickup'],
          featuredApproved: prof.featuredStatus === 'approved',
          publishedInStockCount: inStockCountByPharmacy.get(prof.uid) || 0,
          approvedOffersCount: approvedOffersByPharmacy.get(prof.uid) || 0,
          approvedPromoBanner: bannerApproved
            ? {
                titleAr: prof.promotionalBannerTitleAr || '',
                titleEn: prof.promotionalBannerTitleEn || prof.promotionalBannerTitleAr || '',
                bodyAr: prof.promotionalBannerBodyAr || '',
                bodyEn: prof.promotionalBannerBodyEn || prof.promotionalBannerBodyAr || '',
                imageUrl: prof.promotionalBannerImageUrl || undefined,
              }
            : null,
        });
      }

      cards.sort((a, b) => {
        if (a.featuredApproved !== b.featuredApproved) return a.featuredApproved ? -1 : 1;
        return b.publishedInStockCount - a.publishedInStockCount;
      });

      res.json({ ok: true, pharmacies: cards });
    } catch (err) {
      console.error('[MEDORA][PharmacyStorefrontsList] error:', err);
      res.status(500).json({ error: 'PHARMACY_STOREFRONTS_FAILED' });
    }
  });

  /**
   * GET /api/pharmacy-storefronts/:identifier
   * Returns a single Approved pharmacy public storefront by uid or publicSlug.
   * Exposes ONLY published, unexpired retail products + approved offers + approved banner.
   */
  router.get('/pharmacy-storefronts/:identifier', async (req, res) => {
    const ctx = await requireVerifiedPortalViewer(req, res);
    if (!ctx) return;

    const identifier = normalizeStr(req.params.identifier, 128);
    if (!identifier) {
      res.status(400).json({ error: 'INVALID_PHARMACY_IDENTIFIER' });
      return;
    }

    try {
      let prof: PharmacyProfileDocument | null = null;
      const directSnap = await ctx.db.doc(`pharmacy_profiles/${identifier}`).get();
      if (directSnap.exists) {
        prof = serializeDoc(directSnap.data()) as unknown as PharmacyProfileDocument;
      } else {
        const slugSnap = await ctx.db
          .collection('pharmacy_profiles')
          .where('publicSlug', '==', identifier.toLowerCase())
          .limit(1)
          .get();
        if (!slugSnap.empty) {
          prof = serializeDoc(slugSnap.docs[0].data()) as unknown as PharmacyProfileDocument;
        }
      }

      if (!prof || prof.status !== 'Approved') {
        res.status(404).json({ error: 'PHARMACY_STOREFRONT_NOT_FOUND' });
        return;
      }

      if (prof.institutionId) {
        const instSnap = await ctx.db.doc(`institutions/${prof.institutionId}`).get();
        if (instSnap.exists && instSnap.data()?.status !== 'active') {
          res.status(404).json({ error: 'PHARMACY_STOREFRONT_UNAVAILABLE' });
          return;
        }
      }

      const [prodSnap, batchSnap, offersSnap] = await Promise.all([
        ctx.db.collection('pharmacy_products').where('pharmacyUid', '==', prof.uid).limit(1000).get(),
        ctx.db.collection('pharmacy_batches').where('pharmacyUid', '==', prof.uid).limit(2000).get(),
        ctx.db.collection('pharmacy_special_offers').where('pharmacyUid', '==', prof.uid).limit(50).get(),
      ]);

      const batchesByProd = new Map<string, PharmacyBatchRecord[]>();
      for (const doc of batchSnap.docs) {
        const b = serializeDoc(doc.data()) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProd.get(b.productId) || [];
        arr.push(b);
        batchesByProd.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const categoriesSet = new Set<string>();
      const products: PublicPharmacyStorefrontProduct[] = [];

      for (const doc of prodSnap.docs) {
        const p = serializeDoc(doc.data()) as unknown as PharmacyProductRecord;
        if (
          !p.isActive ||
          !p.availableForPatientOrders ||
          p.isPublishedToPatients === false ||
          p.reviewStatus === 'pending_review'
        ) {
          continue;
        }
        const stock = summarizeProductBatchStock(batchesByProd.get(p.productId) || [], todayStr);
        if (stock.netAvailableQty <= 0) continue;

        const category = p.therapeuticCategory || 'General';
        categoriesSet.add(category);

        const sell = Number(p.sellingPriceIqd || 0);
        const disc =
          p.discountPriceIqd !== null &&
          p.discountPriceIqd !== undefined &&
          Number(p.discountPriceIqd) > 0 &&
          Number(p.discountPriceIqd) < sell
            ? Number(p.discountPriceIqd)
            : null;

        products.push({
          productId: p.productId,
          medicineId: p.medicineId,
          scientificName: p.scientificName,
          activeIngredient: p.activeIngredient,
          brandName: p.brandName,
          strength: p.strength,
          dosageForm: p.dosageForm,
          packSize: p.packSize,
          manufacturer: p.manufacturer,
          country: p.country,
          therapeuticCategory: category,
          imageReference: p.imageReference || undefined,
          requiresPrescription: Boolean(p.requiresPrescription),
          controlledDrug: Boolean(p.controlledDrug),
          sellingPriceIqd: sell,
          discountPriceIqd: disc,
          effectivePriceIqd: disc ?? sell,
          availableQty: stock.netAvailableQty,
          availabilityStatus:
            stock.netAvailableQty <= Math.max(1, Number(p.minStockThreshold || 5))
              ? 'low_stock'
              : 'in_stock',
          nearestExpiryDate: stock.nearestExpiryDate,
        });
      }

      products.sort((a, b) => a.brandName.localeCompare(b.brandName));

      const specialOffers = offersSnap.docs
        .map((d) => serializeDoc(d.data()) as unknown as PharmacySpecialOfferRecord)
        .filter(
          (o) =>
            o.approvalStatus === 'approved' &&
            o.isActive &&
            (!o.validUntil || o.validUntil >= todayStr),
        );

      const bannerApproved =
        prof.marketingApprovalStatus === 'approved' &&
        Boolean(
          prof.promotionalBannerTitleAr ||
            prof.promotionalBannerTitleEn ||
            prof.promotionalBannerBodyAr ||
            prof.promotionalBannerImageUrl,
        );

      res.json({
        ok: true,
        storefront: {
          pharmacy: {
            uid: prof.uid,
            institutionId: prof.institutionId || '',
            publicSlug: prof.publicSlug || prof.uid,
            pharmacyNameAr: prof.pharmacyNameAr,
            pharmacyNameEn: prof.pharmacyNameEn,
            governorate: prof.governorate,
            district: prof.district,
            address: prof.address,
            logoUrl: prof.logoUrl || undefined,
            coverImageUrl: prof.coverImageUrl || undefined,
            taglineAr: prof.taglineAr || undefined,
            taglineEn: prof.taglineEn || undefined,
            aboutAr: prof.aboutAr || undefined,
            aboutEn: prof.aboutEn || undefined,
            professionalPhone: prof.professionalPhone || undefined,
            mapLocationUrl: prof.mapLocationUrl || undefined,
            workingDaysAndHours: prof.workingDaysAndHours,
            is24Hours: Boolean(prof.is24Hours),
            pickupAvailable: prof.pickupAvailable !== false,
            deliveryAvailable: Boolean(prof.deliveryAvailable),
            deliveryZonesCount: Array.isArray(prof.deliveryZones)
              ? prof.deliveryZones.filter((z) => z.isActive).length
              : 0,
            deliveryZones: Array.isArray(prof.deliveryZones)
              ? prof.deliveryZones.filter((z) => z.isActive)
              : [],
            minimumOrderIqd: Number(prof.minimumOrderIqd || 0),
            acceptedPaymentMethods:
              Array.isArray(prof.acceptedPaymentMethods) && prof.acceptedPaymentMethods.length > 0
                ? prof.acceptedPaymentMethods
                : ['cash_on_pickup'],
            featuredApproved: prof.featuredStatus === 'approved',
            publishedInStockCount: products.length,
            approvedOffersCount: specialOffers.length,
            approvedPromoBanner: bannerApproved
              ? {
                  titleAr: prof.promotionalBannerTitleAr || '',
                  titleEn: prof.promotionalBannerTitleEn || prof.promotionalBannerTitleAr || '',
                  bodyAr: prof.promotionalBannerBodyAr || '',
                  bodyEn: prof.promotionalBannerBodyEn || prof.promotionalBannerBodyAr || '',
                  imageUrl: prof.promotionalBannerImageUrl || undefined,
                }
              : null,
          },
          specialOffers,
          categories: Array.from(categoriesSet).sort(),
          products,
        },
      });
    } catch (err) {
      console.error('[MEDORA][PharmacyStorefrontDetail] error:', err);
      res.status(500).json({ error: 'PHARMACY_STOREFRONT_DETAIL_FAILED' });
    }
  });

  return router;
}
