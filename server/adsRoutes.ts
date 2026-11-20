import crypto from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  buildImagingDisabledResponseBody,
  IMAGING_PORTAL_ENABLED,
  isImagingPortalIdentifier,
} from './featureFlags.ts';
import { getBaghdadNow } from './patientNotifications.ts';
import { isValidAdImageUrl } from './storageHelper.ts';

export type TargetedAdEntityType =
  | 'doctor'
  | 'lab'
  | 'pharmacy'
  | 'wholesaler'
  | 'radiology_info'
  | 'platform_service';

export type TargetedAdPortal =
  | 'entry'
  | 'patient'
  | 'pharmacy'
  | 'lab'
  | 'doctor'
  | 'wholesaler';

export type TargetedAdActionType =
  | 'open_directory'
  | 'open_portal_tab'
  | 'open_external_url'
  | 'info_only';

export const ALLOWED_AD_ENTITY_TYPES = new Set<TargetedAdEntityType>([
  'doctor',
  'lab',
  'pharmacy',
  'wholesaler',
  'radiology_info',
  'platform_service',
]);

export const ALLOWED_AD_TARGET_PORTALS = new Set<TargetedAdPortal>([
  'entry',
  'patient',
  'pharmacy',
  'lab',
  'doctor',
  'wholesaler',
]);

export const ALLOWED_AD_ACTION_TYPES = new Set<TargetedAdActionType>([
  'open_directory',
  'open_portal_tab',
  'open_external_url',
  'info_only',
]);

const PORTAL_AUDIENCE_ENTITY_ALLOWLIST: Record<TargetedAdPortal, Set<TargetedAdEntityType>> = {
  entry: new Set<TargetedAdEntityType>([
    'platform_service',
    'doctor',
    'lab',
    'pharmacy',
    'wholesaler',
  ]),
  patient: new Set<TargetedAdEntityType>([
    'doctor',
    'lab',
    'pharmacy',
    'platform_service',
  ]),
  pharmacy: new Set<TargetedAdEntityType>([
    'wholesaler',
    'pharmacy',
    'platform_service',
  ]),
  lab: new Set<TargetedAdEntityType>([
    'doctor',
    'radiology_info',
    'platform_service',
  ]),
  doctor: new Set<TargetedAdEntityType>([
    'platform_service',
    'lab',
    'pharmacy',
    'wholesaler',
  ]),
  wholesaler: new Set<TargetedAdEntityType>([
    'pharmacy',
    'wholesaler',
    'platform_service',
  ]),
};

export function isAdEntityAllowedOnPortal(
  entityType: unknown,
  portal: TargetedAdPortal,
): boolean {
  if (typeof entityType !== 'string') return false;
  if (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(entityType)) {
    return false;
  }
  const normalized = entityType.trim() as TargetedAdEntityType;
  if (!ALLOWED_AD_ENTITY_TYPES.has(normalized)) return false;
  return PORTAL_AUDIENCE_ENTITY_ALLOWLIST[portal]?.has(normalized) ?? false;
}

export function normalizeTargetPortals(
  rawPortals: unknown,
  entityType: TargetedAdEntityType,
): TargetedAdPortal[] {
  if (Array.isArray(rawPortals)) {
    const clean = Array.from(
      new Set(
        rawPortals
          .map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : ''))
          .filter((p): p is TargetedAdPortal =>
            ALLOWED_AD_TARGET_PORTALS.has(p as TargetedAdPortal),
          ),
      ),
    ).filter((portal) => isAdEntityAllowedOnPortal(entityType, portal));
    if (clean.length > 0) return clean.slice(0, 6);
  }
  if (entityType === 'radiology_info') return ['lab'];
  if (entityType === 'wholesaler') return ['pharmacy', 'doctor', 'entry'];
  if (entityType === 'pharmacy') return ['patient', 'doctor', 'wholesaler', 'entry'];
  if (entityType === 'platform_service') return ['entry', 'patient', 'doctor', 'pharmacy'];
  if (entityType === 'lab') return ['entry', 'patient', 'doctor'];
  return ['entry', 'patient', 'lab'];
}

function normalizeStr(v: unknown, max = 240): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (val instanceof Date) return val.toISOString();
  if (
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    try {
      return (val as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(val)) return val.map(serializeValue);
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

function serializeDoc(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return serializeValue(raw) as Record<string, unknown>;
}

export interface AdsRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore;
  requireSuperAdmin: RequestHandler;
}

export function createAdsRouter(deps: AdsRouterDeps) {
  const router = express.Router();

  // -------------------------------------------------------------------------
  // Public & Authenticated Portal-Targeted Ads Feed
  // -------------------------------------------------------------------------
  router.get('/ads/targeted', async (req: Request, res: Response) => {
    const rawPortal = normalizeStr(req.query.portal, 32).toLowerCase();
    const portal: TargetedAdPortal = ALLOWED_AD_TARGET_PORTALS.has(
      rawPortal as TargetedAdPortal,
    )
      ? (rawPortal as TargetedAdPortal)
      : 'entry';

    const db = deps.getAdminDb();
    try {
      const today = getBaghdadNow().dateStr;
      const [adsSnap, doctorsSnap, labsSnap, pharmaciesSnap, wholesalersSnap, instSnap] =
        await Promise.all([
          db
            .collection('medora_ads')
            .where('active', '==', true)
            .limit(120)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('doctor_public_cards')
            .limit(200)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('lab_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('pharmacy_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('wholesaler_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('institutions')
            .limit(300)
            .get()
            .catch(() => ({ docs: [] })),
        ]);

      const instStatusMap = new Map<string, string>();
      instSnap.docs.forEach((d) => {
        instStatusMap.set(d.id, String(d.data()?.status || ''));
      });
      const isInstitutionActive = (instIdRaw: unknown) => {
        const instId = normalizeStr(instIdRaw, 128);
        if (!instId) return true;
        const st = instStatusMap.get(instId);
        return !st || st === 'active';
      };

      const doctorMap = new Map<string, Record<string, unknown>>();
      doctorsSnap.docs.forEach((d) => {
        const data = serializeDoc(d.data());
        if (data.status === 'Approved' && isInstitutionActive(data.institutionId)) {
          doctorMap.set(d.id, data);
        }
      });

      const labMap = new Map<string, Record<string, unknown>>();
      labsSnap.docs.forEach((d) => {
        const lab = serializeDoc(d.data());
        if (!isInstitutionActive(lab.institutionId)) return;
        const services = Array.isArray(lab.labServices)
          ? (lab.labServices as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean)
          : [];
        labMap.set(d.id, {
          labUid: String(lab.uid || d.id),
          institutionId: String(lab.institutionId || ''),
          labNameAr: normalizeStr(lab.labNameAr, 160),
          labNameEn: normalizeStr(lab.labNameEn, 160),
          governorate: normalizeStr(lab.governorate, 80),
          district: normalizeStr(lab.district, 80),
          address: normalizeStr(lab.address, 240),
          workDaysAndHours: normalizeStr(lab.workDaysAndHours, 240),
          labServices: services,
          bookingConfirmationMode: lab.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
        });
      });

      const pharmacyMap = new Map<string, Record<string, unknown>>();
      pharmaciesSnap.docs.forEach((d) => {
        const ph = serializeDoc(d.data());
        if (!isInstitutionActive(ph.institutionId)) return;
        pharmacyMap.set(d.id, {
          pharmacyUid: String(ph.uid || d.id),
          pharmacyNameAr: normalizeStr(ph.pharmacyNameAr, 160),
          pharmacyNameEn: normalizeStr(ph.pharmacyNameEn, 160),
          governorate: normalizeStr(ph.governorate, 80),
          district: normalizeStr(ph.district, 80),
          address: normalizeStr(ph.address, 240),
          deliveryAvailable: ph.deliveryAvailable !== false,
          pickupAvailable: ph.pickupAvailable !== false,
          is24Hours: Boolean(ph.is24Hours),
        });
      });

      const wholesalerMap = new Map<string, Record<string, unknown>>();
      wholesalersSnap.docs.forEach((d) => {
        const ws = serializeDoc(d.data());
        if (!isInstitutionActive(ws.institutionId)) return;
        wholesalerMap.set(d.id, {
          wholesalerUid: String(ws.uid || d.id),
          wholesalerNameAr: normalizeStr(ws.wholesalerNameAr, 160),
          wholesalerNameEn: normalizeStr(ws.wholesalerNameEn, 160),
          governorate: normalizeStr(ws.governorate, 80),
          district: normalizeStr(ws.district, 80),
          minimumOrderIqd: typeof ws.minimumOrderIqd === 'number' ? ws.minimumOrderIqd : 0,
          supportedGovernorates: Array.isArray(ws.supportedGovernorates)
            ? ws.supportedGovernorates
            : [],
        });
      });

      const results: Record<string, unknown>[] = [];
      for (const docSnap of adsSnap.docs) {
        const ad = serializeDoc(docSnap.data());
        if (ad.source !== 'super_admin' || ad.approvedByAdmin !== true) continue;

        const effectiveStatus =
          typeof ad.status === 'string' && ad.status.trim()
            ? ad.status.trim()
            : ad.active === true
              ? 'published'
              : 'paused';
        if (effectiveStatus !== 'published' || ad.active !== true) continue;

        const imageUrl = typeof ad.imageUrl === 'string' ? ad.imageUrl : '';
        const storagePath = typeof ad.storagePath === 'string' ? ad.storagePath : '';
        if (!isValidAdImageUrl(imageUrl, storagePath)) continue;

        const startDate = String(ad.startDate || '');
        const endDate = String(ad.endDate || '');
        if (startDate && today < startDate) continue;
        if (endDate && today > endDate) continue;

        if (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(ad.entityType)) {
          continue;
        }
        const entityType = ALLOWED_AD_ENTITY_TYPES.has(
          String(ad.entityType || '') as TargetedAdEntityType,
        )
          ? (String(ad.entityType) as TargetedAdEntityType)
          : 'doctor';

        if (!isAdEntityAllowedOnPortal(entityType, portal)) continue;

        const configuredPortals = Array.isArray(ad.targetPortals)
          ? (ad.targetPortals as unknown[]).map((p) => String(p || '').toLowerCase())
          : normalizeTargetPortals(undefined, entityType);
        if (!configuredPortals.includes(portal)) continue;

        const entityUid = normalizeStr(ad.entityUid || ad.doctorUid, 128);
        if (!entityUid) continue;

        if (entityType === 'doctor') {
          const card = doctorMap.get(entityUid);
          if (!card) continue;
          results.push({
            ...ad,
            adId: ad.adId || docSnap.id,
            entityType: 'doctor',
            entityUid,
            entityName: card.fullName || ad.entityName || ad.doctorName || '',
            doctorUid: entityUid,
            doctorName: card.fullName || ad.doctorName || '',
            specialty: card.specialty || ad.specialty || '',
            clinicName: card.clinicName || ad.clinicName || '',
            targetPortals: configuredPortals,
            doctorCard: card,
          });
        } else if (entityType === 'lab') {
          const labCard = labMap.get(entityUid);
          if (!labCard) continue;
          const location = [labCard.governorate, labCard.district].filter(Boolean).join(' · ');
          results.push({
            ...ad,
            adId: ad.adId || docSnap.id,
            entityType: 'lab',
            entityUid,
            entityName: labCard.labNameAr || ad.entityName || '',
            doctorUid: '',
            doctorName: labCard.labNameAr || ad.doctorName || '',
            specialty: 'مختبر طبي',
            clinicName: location || ad.clinicName || '',
            targetPortals: configuredPortals,
            labCard,
          });
        } else if (entityType === 'pharmacy') {
          const phCard = pharmacyMap.get(entityUid);
          if (!phCard) continue;
          const location = [phCard.governorate, phCard.district].filter(Boolean).join(' · ');
          results.push({
            ...ad,
            adId: ad.adId || docSnap.id,
            entityType: 'pharmacy',
            entityUid,
            entityName: phCard.pharmacyNameAr || ad.entityName || '',
            doctorUid: '',
            doctorName: phCard.pharmacyNameAr || ad.doctorName || '',
            specialty: 'صيدلية معتمدة',
            clinicName: location || ad.clinicName || '',
            targetPortals: configuredPortals,
            pharmacyCard: phCard,
          });
        } else if (entityType === 'wholesaler') {
          const wsCard = wholesalerMap.get(entityUid);
          if (!wsCard) continue;
          const location = [wsCard.governorate, wsCard.district].filter(Boolean).join(' · ');
          results.push({
            ...ad,
            adId: ad.adId || docSnap.id,
            entityType: 'wholesaler',
            entityUid,
            entityName: wsCard.wholesalerNameAr || ad.entityName || '',
            doctorUid: '',
            doctorName: wsCard.wholesalerNameAr || ad.doctorName || '',
            specialty: 'مذخر دوائي معتمد',
            clinicName: location || ad.clinicName || '',
            targetPortals: configuredPortals,
            wholesalerCard: wsCard,
          });
        } else {
          // platform_service or radiology_info (informational referral partner ONLY in lab portal)
          results.push({
            ...ad,
            adId: ad.adId || docSnap.id,
            entityType,
            entityUid,
            entityName: ad.entityName || ad.title || '',
            doctorUid: '',
            doctorName: ad.entityName || ad.title || '',
            specialty:
              entityType === 'radiology_info'
                ? 'مركز أشعة — إعلان تعريفي وتحويل فقط'
                : 'خدمات منصة MEDORA',
            clinicName: ad.clinicName || '',
            targetPortals: configuredPortals,
            actionType:
              entityType === 'radiology_info'
                ? ad.actionType === 'open_external_url'
                  ? 'open_external_url'
                  : 'info_only'
                : ad.actionType || 'open_portal_tab',
          });
        }
      }

      results.sort((a, b) => {
        const pDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
        if (pDiff !== 0) return pDiff;
        return String(b.updatedAt || b.createdAt || '').localeCompare(
          String(a.updatedAt || a.createdAt || ''),
        );
      });

      res.json({ ok: true, portal, ads: results });
    } catch (err) {
      console.error('[MEDORA][TargetedAds] Error:', err);
      res.status(500).json({ error: 'TARGETED_ADS_FETCH_FAILED', ads: [] });
    }
  });

  // -------------------------------------------------------------------------
  // Real Impression & Click Event Analytics Recording
  // -------------------------------------------------------------------------
  router.post('/ads/:adId/event', async (req: Request, res: Response) => {
    const adId = normalizeStr(req.params.adId, 128);
    const eventType = normalizeStr(req.body?.eventType, 20);
    const rawPortal = normalizeStr(req.body?.portal, 32).toLowerCase();
    const portal: TargetedAdPortal = ALLOWED_AD_TARGET_PORTALS.has(
      rawPortal as TargetedAdPortal,
    )
      ? (rawPortal as TargetedAdPortal)
      : 'entry';

    if (!adId || (eventType !== 'impression' && eventType !== 'click')) {
      res.status(400).json({ error: 'INVALID_AD_EVENT' });
      return;
    }

    let actorUid = 'anonymous';
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        try {
          const decoded = await deps.adminAuth.verifyIdToken(token, false);
          if (decoded.uid) actorUid = decoded.uid;
        } catch {
          // Proceed cleanly as unauthenticated visitor for public entry views
        }
      }
    }

    try {
      const db = deps.getAdminDb();
      const adSnap = await db.doc(`medora_ads/${adId}`).get().catch(() => null);
      if (!adSnap || !adSnap.exists) {
        res.status(404).json({ error: 'AD_NOT_FOUND' });
        return;
      }
      const adData = adSnap.data() as Record<string, unknown>;
      if (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(adData.entityType)) {
        res.status(403).json(buildImagingDisabledResponseBody());
        return;
      }

      if (actorUid === 'anonymous') {
        res.json({ ok: true, recorded: false, reason: 'PUBLIC_VISITOR_NO_WRITE' });
        return;
      }

      const eventId = `adev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const batch = db.batch();
      batch.set(db.doc(`ad_events/${eventId}`), {
        eventId,
        adId,
        eventType,
        portal,
        actorUid,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (eventType === 'impression') {
        batch.update(db.doc(`medora_ads/${adId}`), {
          impressionsCount: FieldValue.increment(1),
        });
      } else {
        batch.update(db.doc(`medora_ads/${adId}`), {
          clicksCount: FieldValue.increment(1),
        });
      }
      await batch.commit();
      res.json({ ok: true, recorded: true, eventId });
    } catch (err) {
      console.warn('[MEDORA][AdEvent] non-fatal tracking warning:', err);
      res.json({ ok: true, recorded: false });
    }
  });

  // -------------------------------------------------------------------------
  // Super Admin Entities Directory & Ad Analytics
  // -------------------------------------------------------------------------
  router.get(
    '/admin/ads/entities-directory',
    deps.requireSuperAdmin,
    async (_req: Request, res: Response) => {
      try {
        const db = deps.getAdminDb();
        const [doctorsSnap, labsSnap, pharmaciesSnap, wholesalersSnap] = await Promise.all([
          db.collection('doctor_public_cards').limit(200).get().catch(() => ({ docs: [] })),
          db
            .collection('lab_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('pharmacy_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
          db
            .collection('wholesaler_profiles')
            .where('status', '==', 'Approved')
            .limit(150)
            .get()
            .catch(() => ({ docs: [] })),
        ]);

        const doctors = doctorsSnap.docs
          .map((d) => serializeDoc(d.data()))
          .filter((d) => d.status === 'Approved');
        const labs = labsSnap.docs.map((d) => ({
          labUid: d.id,
          ...serializeDoc(d.data()),
        }));
        const pharmacies = pharmaciesSnap.docs.map((d) => ({
          pharmacyUid: d.id,
          ...serializeDoc(d.data()),
        }));
        const wholesalers = wholesalersSnap.docs.map((d) => ({
          wholesalerUid: d.id,
          ...serializeDoc(d.data()),
        }));

        res.json({
          ok: true,
          doctors,
          labs,
          pharmacies,
          wholesalers,
        });
      } catch (err) {
        console.error('[MEDORA][AdminAdsDirectory] error:', err);
        res.status(500).json({ error: 'ADMIN_ADS_DIRECTORY_FAILED' });
      }
    },
  );

  router.get(
    '/admin/ads/analytics',
    deps.requireSuperAdmin,
    async (_req: Request, res: Response) => {
      try {
        const db = deps.getAdminDb();
        const [adsSnap, eventsSnap] = await Promise.all([
          db.collection('medora_ads').limit(200).get().catch(() => ({ docs: [] })),
          db.collection('ad_events').limit(500).get().catch(() => ({ docs: [] })),
        ]);

        const perAdMap = new Map<
          string,
          { impressions: number; clicks: number; byPortal: Record<string, { impressions: number; clicks: number }> }
        >();

        for (const evDoc of eventsSnap.docs) {
          const ev = serializeDoc(evDoc.data());
          const adId = normalizeStr(ev.adId, 128);
          if (!adId) continue;
          const entry = perAdMap.get(adId) || {
            impressions: 0,
            clicks: 0,
            byPortal: {},
          };
          const portal = normalizeStr(ev.portal, 32) || 'entry';
          if (!entry.byPortal[portal]) {
            entry.byPortal[portal] = { impressions: 0, clicks: 0 };
          }
          if (ev.eventType === 'impression') {
            entry.impressions += 1;
            entry.byPortal[portal].impressions += 1;
          } else if (ev.eventType === 'click') {
            entry.clicks += 1;
            entry.byPortal[portal].clicks += 1;
          }
          perAdMap.set(adId, entry);
        }

        let totalImpressions = 0;
        let totalClicks = 0;
        const perAd: Record<string, unknown>[] = [];
        for (const adDoc of adsSnap.docs) {
          const ad = serializeDoc(adDoc.data());
          const adId = String(ad.adId || adDoc.id);
          const evStats = perAdMap.get(adId);
          const impressions = Math.max(Number(ad.impressionsCount) || 0, evStats?.impressions || 0);
          const clicks = Math.max(Number(ad.clicksCount) || 0, evStats?.clicks || 0);
          totalImpressions += impressions;
          totalClicks += clicks;
          perAd.push({
            adId,
            title: ad.title || ad.entityName || adId,
            entityType: ad.entityType || 'doctor',
            status: ad.status || (ad.active ? 'published' : 'paused'),
            impressions,
            clicks,
            ctrPercent: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
            byPortal: evStats?.byPortal || {},
          });
        }

        res.json({
          ok: true,
          summary: {
            totalAds: adsSnap.docs.length,
            totalImpressions,
            totalClicks,
            overallCtrPercent:
              totalImpressions > 0
                ? Number(((totalClicks / totalImpressions) * 100).toFixed(2))
                : 0,
          },
          perAd,
        });
      } catch (err) {
        console.error('[MEDORA][AdminAdsAnalytics] error:', err);
        res.status(500).json({ error: 'ADMIN_ADS_ANALYTICS_FAILED' });
      }
    },
  );

  return router;
}
