import express, { type Request, type RequestHandler, type Response, type Router } from 'express';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  buildCanonicalIdentityKey,
  findExactCanonicalMedicineMatch,
} from './pharmacyWholesalerEngine.ts';
import type { CanonicalMedicineRecord, DosageForm } from '../src/types/pharmacy.ts';

export interface AdminPharmacyWholesalerRouterDeps {
  requireSuperAdmin: RequestHandler;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
}

interface AdminReqWithCtx extends Request {
  adminCtx?: {
    decoded: { uid: string };
    email: string;
  };
}

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
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

export function createAdminPharmacyWholesalerRouter(
  deps: AdminPharmacyWholesalerRouterDeps,
): Router {
  const router = express.Router();

  const ensureAdminDb = (res: Response): Firestore | null => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'FIRESTORE_ADMIN_UNAVAILABLE' });
      return null;
    }
    return db;
  };

  /**
   * GET /api/admin/pharmacies/overview
   */
  router.get('/admin/pharmacies/overview', deps.requireSuperAdmin, async (_req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;

    try {
      const [profilesSnap, ordersSnap, staffSnap, medicinesSnap, alertsSnap, offersSnap, campaignsSnap] = await Promise.all([
        db.collection('pharmacy_profiles').limit(300).get(),
        db.collection('pharmacy_orders').limit(500).get(),
        db.collection('pharmacy_staff').limit(500).get(),
        db.collection('medora_medicines').limit(1000).get(),
        db.collection('pharmacy_batches').where('isExpired', '==', true).limit(300).get(),
        db.collection('pharmacy_special_offers').limit(300).get(),
        db.collection('pharmacy_campaign_requests').limit(200).get(),
      ]);

      const pharmacies = profilesSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const orders = ordersSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const staff = staffSnap.docs.map((d) => serializeDoc(d.data()));
      const canonicalMedicines = medicinesSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.scientificName || '').localeCompare(String(b.scientificName || '')));
      const expiredBatches = alertsSnap.docs.map((d) => serializeDoc(d.data()));
      const specialOffers = offersSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const campaignRequests = campaignsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      res.json({
        ok: true,
        pharmacies,
        orders,
        staff,
        canonicalMedicines,
        expiredBatches,
        specialOffers,
        campaignRequests,
      });
    } catch (err) {
      console.error('[MEDORA][AdminPharmaciesOverview] error:', err);
      res.status(500).json({ error: 'ADMIN_PHARMACIES_OVERVIEW_FAILED' });
    }
  });

  /**
   * POST /api/admin/pharmacies/:uid/status
   */
  router.post('/admin/pharmacies/:uid/status', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const adminCtx = (req as AdminReqWithCtx).adminCtx;
    const targetUid = normalizeStr(req.params.uid, 128);
    const nextStatus = normalizeStr(req.body?.status, 40);
    const reason = normalizeStr(req.body?.reason, 400);

    const allowed = new Set(['Approved', 'Suspended', 'Deactivated', 'Requires Changes', 'Rejected']);
    if (!targetUid || !allowed.has(nextStatus)) {
      res.status(400).json({ error: 'INVALID_PHARMACY_STATUS_UPDATE' });
      return;
    }

    try {
      const profRef = db.doc(`pharmacy_profiles/${targetUid}`);
      const profSnap = await profRef.get();
      if (!profSnap.exists) {
        res.status(404).json({ error: 'PHARMACY_NOT_FOUND' });
        return;
      }
      const prof = serializeDoc(profSnap.data());
      const institutionId = normalizeStr(prof.institutionId, 128);
      const nextInstStatus =
        nextStatus === 'Approved'
          ? 'active'
          : nextStatus === 'Suspended' || nextStatus === 'Deactivated'
            ? 'suspended'
            : nextStatus === 'Rejected'
              ? 'rejected'
              : 'pending_approval';
      const nextAccStatus =
        nextStatus === 'Approved'
          ? 'active'
          : nextStatus === 'Suspended' || nextStatus === 'Deactivated'
            ? 'suspended'
            : 'pending_review';

      const batch = db.batch();
      batch.update(profRef, {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (institutionId) {
        batch.update(db.doc(`institutions/${institutionId}`), {
          status: nextInstStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      batch.update(db.doc(`users/${targetUid}`), {
        accountStatus: nextAccStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const logId = safeId('adm_ph');
      batch.set(db.doc(`audit_logs/${logId}`), {
        logId,
        actorUid: adminCtx?.decoded.uid || 'admin',
        actorEmail: adminCtx?.email || '',
        action: `ADMIN_PHARMACY_STATUS_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        targetCollection: 'pharmacy_profiles',
        targetId: targetUid,
        details: reason ? `${nextStatus}: ${reason}` : `Updated pharmacy ${targetUid} to ${nextStatus}`,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      const engine = getGlobalNotificationEngine();
      if (engine) {
        await engine
          .dispatch({
            eventType: nextStatus === 'Suspended' ? 'account_security_alert' : 'important_account_update',
            recipientUid: targetUid,
            recipientRole: 'pharmacy',
            title: `تحديث حالة بوابة الصيدلية (${nextStatus})`,
            body: reason || `تم تحديث حالة اعتماد الصيدلية إلى ${nextStatus} من قبل الإدارة العليا.`,
            inAppType: 'admin_notice',
            relatedId: targetUid,
            relatedType: 'pharmacy_profile',
            idempotencyKey: `adm_ph_st:${targetUid}:${nextStatus}:${Date.now()}`,
          })
          .catch(() => undefined);
      }

      const refreshed = await profRef.get();
      res.json({ ok: true, pharmacy: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][AdminPharmacyStatus] error:', err);
      res.status(500).json({ error: 'ADMIN_PHARMACY_STATUS_FAILED' });
    }
  });

  /**
   * POST /api/admin/pharmacies/:uid/marketing-review
   * Super Admin approval gate for pharmacy promotional banners & featured pharmacy status.
   */
  router.post('/admin/pharmacies/:uid/marketing-review', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const adminCtx = (req as AdminReqWithCtx).adminCtx;
    const targetUid = normalizeStr(req.params.uid, 128);
    const marketingApprovalStatus = normalizeStr(req.body?.marketingApprovalStatus, 40);
    const featuredStatus = normalizeStr(req.body?.featuredStatus, 40);
    const reviewNote = normalizeStr(req.body?.reviewNote, 400);

    const profRef = db.doc(`pharmacy_profiles/${targetUid}`);
    const profSnap = await profRef.get();
    if (!profSnap.exists) {
      res.status(404).json({ error: 'PHARMACY_NOT_FOUND' });
      return;
    }

    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (['approved', 'rejected', 'pending_review', 'draft'].includes(marketingApprovalStatus)) {
      patch.marketingApprovalStatus = marketingApprovalStatus;
    }
    if (['approved', 'rejected', 'requested', 'none'].includes(featuredStatus)) {
      patch.featuredStatus = featuredStatus;
    }
    if (reviewNote) {
      patch.marketingReviewNote = reviewNote;
    }

    await profRef.update(patch);
    await db.doc(`audit_logs/${safeId('adm_phm')}`).set({
      logId: safeId('adm_phm'),
      actorUid: adminCtx?.decoded.uid || 'admin',
      actorEmail: adminCtx?.email || '',
      action: 'ADMIN_PHARMACY_MARKETING_REVIEW',
      targetCollection: 'pharmacy_profiles',
      targetId: targetUid,
      details: `Banner=${marketingApprovalStatus || '-'} Featured=${featuredStatus || '-'} ${reviewNote}`.trim(),
      createdAt: FieldValue.serverTimestamp(),
    });

    const engine = getGlobalNotificationEngine();
    if (engine) {
      await engine
        .dispatch({
          eventType: 'important_account_update',
          recipientUid: targetUid,
          recipientRole: 'pharmacy',
          title: 'تحديث مراجعة التسويق والظهور المميز',
          body:
            reviewNote ||
            `حالة البانر: ${marketingApprovalStatus || 'كما هي'} · حالة التمييز: ${featuredStatus || 'كما هي'}`,
          inAppType: 'admin_notice',
          relatedId: targetUid,
          relatedType: 'pharmacy_marketing',
          idempotencyKey: `adm_ph_mkt:${targetUid}:${Date.now()}`,
        })
        .catch(() => undefined);
    }

    const refreshed = await profRef.get();
    res.json({ ok: true, pharmacy: serializeDoc(refreshed.data()) });
  });

  /**
   * POST /api/admin/pharmacies/offers/:offerId/review
   */
  router.post('/admin/pharmacies/offers/:offerId/review', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const offerId = normalizeStr(req.params.offerId, 128);
    const approvalStatus = normalizeStr(req.body?.approvalStatus, 40);
    const reviewNote = normalizeStr(req.body?.reviewNote, 400);

    if (!offerId || !['approved', 'rejected'].includes(approvalStatus)) {
      res.status(400).json({ error: 'INVALID_OFFER_REVIEW' });
      return;
    }

    const ref = db.doc(`pharmacy_special_offers/${offerId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'OFFER_NOT_FOUND' });
      return;
    }
    const prev = serializeDoc(snap.data());
    await ref.update({
      approvalStatus,
      ...(reviewNote ? { reviewNote } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const engine = getGlobalNotificationEngine();
    if (engine && typeof prev.pharmacyUid === 'string') {
      await engine
        .dispatch({
          eventType: 'important_account_update',
          recipientUid: prev.pharmacyUid,
          recipientRole: 'pharmacy',
          title:
            approvalStatus === 'approved'
              ? 'تمت الموافقة على العرض الخاص'
              : 'تم رفض العرض الخاص',
          body: `${String(prev.titleAr || '')}${reviewNote ? ` — ${reviewNote}` : ''}`,
          inAppType: 'admin_notice',
          relatedId: offerId,
          relatedType: 'pharmacy_special_offer',
          idempotencyKey: `adm_ph_off:${offerId}:${approvalStatus}`,
        })
        .catch(() => undefined);
    }

    const refreshed = await ref.get();
    res.json({ ok: true, offer: serializeDoc(refreshed.data()) });
  });

  /**
   * POST /api/admin/pharmacies/campaigns/:requestId/review
   */
  router.post('/admin/pharmacies/campaigns/:requestId/review', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const requestId = normalizeStr(req.params.requestId, 128);
    const status = normalizeStr(req.body?.status, 40);
    const adminNote = normalizeStr(req.body?.adminNote, 400);

    if (!requestId || !['Under Review', 'Approved', 'Rejected'].includes(status)) {
      res.status(400).json({ error: 'INVALID_CAMPAIGN_REVIEW' });
      return;
    }

    const ref = db.doc(`pharmacy_campaign_requests/${requestId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'CAMPAIGN_REQUEST_NOT_FOUND' });
      return;
    }
    const prev = serializeDoc(snap.data());
    await ref.update({
      status,
      ...(adminNote ? { adminNote } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (
      status === 'Approved' &&
      prev.campaignType === 'featured_pharmacy' &&
      typeof prev.pharmacyUid === 'string' &&
      prev.pharmacyUid
    ) {
      await db.doc(`pharmacy_profiles/${prev.pharmacyUid}`).update({
        featuredStatus: 'approved',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const engine = getGlobalNotificationEngine();
    if (engine && typeof prev.pharmacyUid === 'string') {
      await engine
        .dispatch({
          eventType: 'important_account_update',
          recipientUid: prev.pharmacyUid,
          recipientRole: 'pharmacy',
          title: `تحديث طلب الحملة الترويجية (${status})`,
          body: `${String(prev.campaignTitle || '')}${adminNote ? ` — ${adminNote}` : ''}`,
          inAppType: 'admin_notice',
          relatedId: requestId,
          relatedType: 'pharmacy_campaign_request',
          idempotencyKey: `adm_ph_camp:${requestId}:${status}`,
        })
        .catch(() => undefined);
    }

    const refreshed = await ref.get();
    res.json({ ok: true, request: serializeDoc(refreshed.data()) });
  });

  /**
   * POST /api/admin/pharmacies/medicines
   * Super Admin central canonical medicine governance (deduplicated strictly by ingredient + strength + form + packSize).
   */
  router.post('/admin/pharmacies/medicines', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const adminCtx = (req as AdminReqWithCtx).adminCtx;

    const scientificName = normalizeStr(req.body?.scientificName, 160);
    const activeIngredient = normalizeStr(req.body?.activeIngredient, 160);
    const strength = normalizeStr(req.body?.strength, 60);
    const rawForm = normalizeStr(req.body?.dosageForm, 40).toLowerCase() as DosageForm;
    const dosageForm: DosageForm = VALID_DOSAGE_FORMS.has(rawForm) ? rawForm : 'tablet';
    const packSize = normalizeStr(req.body?.packSize, 80);
    const manufacturer = normalizeStr(req.body?.manufacturer, 120);
    const country = normalizeStr(req.body?.country, 80);
    const barcode = normalizeStr(req.body?.barcode, 80);
    const imageReference = normalizeStr(req.body?.imageReference, 500);
    const dispensingRestrictions = normalizeStr(req.body?.dispensingRestrictions, 300);
    const therapeuticCategory = normalizeStr(req.body?.therapeuticCategory, 100) || 'General';
    const brandNames = Array.isArray(req.body?.brandNames)
      ? (req.body.brandNames as unknown[]).map((b) => normalizeStr(b, 120)).filter(Boolean).slice(0, 20)
      : [];

    if (!scientificName || !activeIngredient || !strength || !packSize) {
      res.status(400).json({ error: 'INVALID_CANONICAL_MEDICINE_FIELDS' });
      return;
    }

    try {
      const existingSnap = await db.collection('medora_medicines').limit(2000).get();
      const existing = existingSnap.docs.map(
        (d) => serializeDoc(d.data()) as unknown as CanonicalMedicineRecord,
      );
      const exactMatch = findExactCanonicalMedicineMatch(existing, {
        activeIngredient,
        strength,
        dosageForm,
        packSize,
      });
      if (exactMatch) {
        res.status(409).json({
          error: 'CANONICAL_MEDICINE_ALREADY_EXISTS',
          existingMedicine: exactMatch,
          identityKey: buildCanonicalIdentityKey({
            activeIngredient,
            strength,
            dosageForm,
            packSize,
          }),
        });
        return;
      }

      if (barcode) {
        const barcodeConflict = existing.find(
          (m) => m.barcode && m.barcode.trim().toLowerCase() === barcode.toLowerCase(),
        );
        if (barcodeConflict) {
          res.status(409).json({
            error: 'CANONICAL_BARCODE_CONFLICT',
            existingMedicine: barcodeConflict,
          });
          return;
        }
      }

      const medicineId = safeId('med');
      await db.doc(`medora_medicines/${medicineId}`).set({
        medicineId,
        identityKey: buildCanonicalIdentityKey({
          activeIngredient,
          strength,
          dosageForm,
          packSize,
        }),
        scientificName,
        activeIngredient,
        brandNames,
        strength,
        dosageForm,
        packSize,
        manufacturer,
        country,
        barcode,
        imageReference,
        dispensingRestrictions,
        approvalStatus: 'approved',
        requiresPrescription: Boolean(req.body?.requiresPrescription),
        controlledDrug: Boolean(req.body?.controlledDrug),
        therapeuticCategory,
        status: 'active',
        createdByUid: adminCtx?.decoded.uid || 'admin',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const saved = await db.doc(`medora_medicines/${medicineId}`).get();
      res.status(201).json({ ok: true, medicine: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][AdminCreateCanonicalMedicine] error:', err);
      res.status(500).json({ error: 'CREATE_CANONICAL_MEDICINE_FAILED' });
    }
  });

  /**
   * PUT /api/admin/pharmacies/medicines/:medicineId
   */
  router.put('/admin/pharmacies/medicines/:medicineId', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const medicineId = normalizeStr(req.params.medicineId, 128);
    if (!medicineId) {
      res.status(400).json({ error: 'INVALID_MEDICINE_ID' });
      return;
    }

    try {
      const ref = db.doc(`medora_medicines/${medicineId}`);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'CANONICAL_MEDICINE_NOT_FOUND' });
        return;
      }

      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (req.body?.scientificName !== undefined) {
        patch.scientificName = normalizeStr(req.body.scientificName, 160);
      }
      if (req.body?.brandNames !== undefined && Array.isArray(req.body.brandNames)) {
        patch.brandNames = (req.body.brandNames as unknown[])
          .map((b) => normalizeStr(b, 120))
          .filter(Boolean)
          .slice(0, 20);
      }
      if (req.body?.manufacturer !== undefined) {
        patch.manufacturer = normalizeStr(req.body.manufacturer, 120);
      }
      if (req.body?.country !== undefined) {
        patch.country = normalizeStr(req.body.country, 80);
      }
      if (req.body?.barcode !== undefined) {
        patch.barcode = normalizeStr(req.body.barcode, 80);
      }
      if (req.body?.imageReference !== undefined) {
        patch.imageReference = normalizeStr(req.body.imageReference, 500);
      }
      if (req.body?.dispensingRestrictions !== undefined) {
        patch.dispensingRestrictions = normalizeStr(req.body.dispensingRestrictions, 300);
      }
      if (req.body?.approvalStatus === 'approved' || req.body?.approvalStatus === 'pending_review') {
        patch.approvalStatus = req.body.approvalStatus;
      }
      if (req.body?.requiresPrescription !== undefined) {
        patch.requiresPrescription = Boolean(req.body.requiresPrescription);
      }
      if (req.body?.controlledDrug !== undefined) {
        patch.controlledDrug = Boolean(req.body.controlledDrug);
      }
      if (req.body?.therapeuticCategory !== undefined) {
        patch.therapeuticCategory = normalizeStr(req.body.therapeuticCategory, 100);
      }
      if (req.body?.status === 'active' || req.body?.status === 'deprecated') {
        patch.status = req.body.status;
      }

      await ref.update(patch);
      const refreshed = await ref.get();
      res.json({ ok: true, medicine: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][AdminUpdateCanonicalMedicine] error:', err);
      res.status(500).json({ error: 'UPDATE_CANONICAL_MEDICINE_FAILED' });
    }
  });

  /**
   * GET /api/admin/wholesalers/overview
   */
  router.get('/admin/wholesalers/overview', deps.requireSuperAdmin, async (_req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;

    try {
      const [profilesSnap, ordersSnap, invoicesSnap, staffSnap] = await Promise.all([
        db.collection('wholesaler_profiles').limit(300).get(),
        db.collection('wholesaler_supply_orders').limit(500).get(),
        db.collection('wholesaler_invoices').limit(500).get(),
        db.collection('wholesaler_staff').limit(500).get(),
      ]);

      const wholesalers = profilesSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
      const supplyOrders = ordersSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const invoices = invoicesSnap.docs.map((d) => serializeDoc(d.data()));
      const staff = staffSnap.docs.map((d) => serializeDoc(d.data()));

      res.json({
        ok: true,
        wholesalers,
        supplyOrders,
        invoices,
        staff,
      });
    } catch (err) {
      console.error('[MEDORA][AdminWholesalersOverview] error:', err);
      res.status(500).json({ error: 'ADMIN_WHOLESALERS_OVERVIEW_FAILED' });
    }
  });

  /**
   * POST /api/admin/wholesalers/:uid/status
   */
  router.post('/admin/wholesalers/:uid/status', deps.requireSuperAdmin, async (req, res) => {
    const db = ensureAdminDb(res);
    if (!db) return;
    const adminCtx = (req as AdminReqWithCtx).adminCtx;
    const targetUid = normalizeStr(req.params.uid, 128);
    const nextStatus = normalizeStr(req.body?.status, 40);
    const reason = normalizeStr(req.body?.reason, 400);

    const allowed = new Set(['Approved', 'Suspended', 'Deactivated', 'Requires Changes', 'Rejected']);
    if (!targetUid || !allowed.has(nextStatus)) {
      res.status(400).json({ error: 'INVALID_WHOLESALER_STATUS_UPDATE' });
      return;
    }

    try {
      const profRef = db.doc(`wholesaler_profiles/${targetUid}`);
      const profSnap = await profRef.get();
      if (!profSnap.exists) {
        res.status(404).json({ error: 'WHOLESALER_NOT_FOUND' });
        return;
      }
      const prof = serializeDoc(profSnap.data());
      const institutionId = normalizeStr(prof.institutionId, 128);
      const nextInstStatus =
        nextStatus === 'Approved'
          ? 'active'
          : nextStatus === 'Suspended' || nextStatus === 'Deactivated'
            ? 'suspended'
            : nextStatus === 'Rejected'
              ? 'rejected'
              : 'pending_approval';
      const nextAccStatus =
        nextStatus === 'Approved'
          ? 'active'
          : nextStatus === 'Suspended' || nextStatus === 'Deactivated'
            ? 'suspended'
            : 'pending_review';

      const batch = db.batch();
      batch.update(profRef, {
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (institutionId) {
        batch.update(db.doc(`institutions/${institutionId}`), {
          status: nextInstStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      batch.update(db.doc(`users/${targetUid}`), {
        accountStatus: nextAccStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const logId = safeId('adm_wh');
      batch.set(db.doc(`audit_logs/${logId}`), {
        logId,
        actorUid: adminCtx?.decoded.uid || 'admin',
        actorEmail: adminCtx?.email || '',
        action: `ADMIN_WHOLESALER_STATUS_${nextStatus.toUpperCase().replace(/\s+/g, '_')}`,
        targetCollection: 'wholesaler_profiles',
        targetId: targetUid,
        details: reason
          ? `${nextStatus}: ${reason}`
          : `Updated wholesaler ${targetUid} to ${nextStatus}`,
        createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      const engine = getGlobalNotificationEngine();
      if (engine) {
        await engine
          .dispatch({
            eventType: nextStatus === 'Suspended' ? 'account_security_alert' : 'important_account_update',
            recipientUid: targetUid,
            recipientRole: 'wholesaler',
            title: `تحديث حالة بوابة المذخر الدوائي (${nextStatus})`,
            body: reason || `تم تحديث حالة اعتماد المذخر إلى ${nextStatus} من قبل الإدارة العليا.`,
            inAppType: 'admin_notice',
            relatedId: targetUid,
            relatedType: 'wholesaler_profile',
            idempotencyKey: `adm_wh_st:${targetUid}:${nextStatus}:${Date.now()}`,
          })
          .catch(() => undefined);
      }

      const refreshed = await profRef.get();
      res.json({ ok: true, wholesaler: serializeDoc(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][AdminWholesalerStatus] error:', err);
      res.status(500).json({ error: 'ADMIN_WHOLESALER_STATUS_FAILED' });
    }
  });

  return router;
}
