import express, { type Request, type Response, type Router } from 'express';
import { type Auth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  getNormalizedSchedule,
  validateScheduleSlotWindow,
} from './doctorRoutes.ts';
import {
  emitAdminNotification,
  getGlobalNotificationEngine,
} from './notificationEngine.ts';
import {
  emitPatientNotification,
  getBaghdadNow,
  recalculateDoctorRatingSummary,
  recalculateLabRatingSummary,
} from './patientNotifications.ts';
import {
  decodeAndValidateBase64Asset,
  deleteStoredMediaAssetSafe,
  isValidAdImageUrl,
  isValidUploadedAssetUrl,
  storeUploadedMediaAsset,
  type MedoraUploadFolder,
  type ResolvedBucketInfo,
  type StorageBucket,
} from './storageHelper.ts';
import {
  IMAGING_PORTAL_ENABLED,
  isImagingPortalIdentifier,
} from './featureFlags.ts';
import {
  hashPhoneKey,
  parseAndNormalizeIraqiPhone,
} from './iraqiPhone.ts';

export interface PatientRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  getStorageBucket?: () => StorageBucket | null;
  resolveReadyStorageBucket?: (forceRefresh?: boolean) => Promise<ResolvedBucketInfo>;
  hasServiceCredentials?: () => boolean;
}

interface VerifiedPatientActor {
  uid: string;
  email: string;
  name: string;
  userAccount: Record<string, unknown>;
  patientProfile: Record<string, unknown>;
}

const DEFAULT_PREFERENCES = {
  notifications: {
    appointments: true,
    reminders24h: true,
    messages: true,
    results: true,
    announcements: true,
  },
  privacy: {
    allowDoctorSearchByPhone: true,
    defaultShareExpiryDays: 30 as number | null,
  },
};

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
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

function normalizePreferences(raw: unknown) {
  const rec = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const notif = (rec.notifications && typeof rec.notifications === 'object' ? rec.notifications : {}) as Record<
    string,
    unknown
  >;
  const priv = (rec.privacy && typeof rec.privacy === 'object' ? rec.privacy : {}) as Record<string, unknown>;
  const expDays =
    priv.defaultShareExpiryDays === null
      ? null
      : typeof priv.defaultShareExpiryDays === 'number' && Number.isFinite(priv.defaultShareExpiryDays)
        ? Math.max(1, Math.min(365, priv.defaultShareExpiryDays))
        : DEFAULT_PREFERENCES.privacy.defaultShareExpiryDays;

  return {
    notifications: {
      appointments: notif.appointments !== false,
      reminders24h: notif.reminders24h !== false,
      messages: notif.messages !== false,
      results: notif.results !== false,
      announcements: notif.announcements !== false,
    },
    privacy: {
      allowDoctorSearchByPhone: priv.allowDoctorSearchByPhone !== false,
      defaultShareExpiryDays: expDays,
    },
  };
}

function parseFacilityCatalog(
  services: string[],
  rawCatalog: unknown,
  pricingSummary?: string,
) {
  if (Array.isArray(rawCatalog) && rawCatalog.length > 0) {
    return rawCatalog
      .map((item) => {
        const rec = item as Record<string, unknown>;
        const name = normalizeStr(rec?.name, 140);
        if (!name) return null;
        return {
          name,
          ...(typeof rec.priceIqd === 'number' && rec.priceIqd >= 0 ? { priceIqd: rec.priceIqd } : {}),
          ...(typeof rec.prepInstructions === 'string' && rec.prepInstructions
            ? { prepInstructions: normalizeStr(rec.prepInstructions, 300) }
            : {}),
        };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }
  return services.map((name) => ({
    name,
    ...(pricingSummary ? { prepInstructions: pricingSummary } : {}),
  }));
}

export function createPatientRouter(deps: PatientRouterDeps): Router {
  const router = express.Router();

  async function requirePatientAccess(
    req: Request,
    res: Response,
  ): Promise<VerifiedPatientActor | null> {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({
        error: 'PATIENT_SERVICE_UNAVAILABLE',
        message: 'Server Admin SDK is required for verified patient operations.',
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

      const [userSnap, patientSnap] = await Promise.all([
        db.doc(`users/${decoded.uid}`).get(),
        db.doc(`patient_profiles/${decoded.uid}`).get(),
      ]);

      const userAccount = userSnap.exists ? serializeDoc(userSnap.data()) : {};
      if (userAccount.accountStatus === 'suspended') {
        res.status(403).json({ error: 'ACCOUNT_SUSPENDED' });
        return null;
      }

      if (!patientSnap.exists || patientSnap.data()?.status !== 'active') {
        res.status(403).json({ error: 'PATIENT_PROFILE_NOT_ACTIVE' });
        return null;
      }

      const patientProfile = serializeDoc(patientSnap.data());
      return {
        uid: decoded.uid,
        email: (decoded.email || '').trim().toLowerCase(),
        name:
          normalizeStr(patientProfile.fullName || userAccount.fullName || decoded.name || decoded.email, 120) ||
          'MEDORA Patient',
        userAccount,
        patientProfile,
      };
    } catch {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public Active Ads Endpoint for Patient Home Carousel
  // ---------------------------------------------------------------------------
  router.get('/ads/active', async (_req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'ADS_SERVICE_UNAVAILABLE', ads: [] });
      return;
    }
    try {
      const today = getBaghdadNow().dateStr;
      const [adsSnap, cardsSnap, labsSnap, instSnap] = await Promise.all([
        db.collection('medora_ads').where('active', '==', true).limit(80).get(),
        db.collection('doctor_public_cards').limit(200).get(),
        db.collection('lab_profiles').where('status', '==', 'Approved').limit(150).get(),
        db.collection('institutions').limit(250).get(),
      ]);

      const instStatusMap = new Map<string, string>();
      instSnap.docs.forEach((doc) => {
        instStatusMap.set(doc.id, String(doc.data()?.status || ''));
      });
      const isInstitutionActive = (instIdRaw: unknown) => {
        const instId = normalizeStr(instIdRaw, 128);
        if (!instId) return true;
        const st = instStatusMap.get(instId);
        return !st || st === 'active';
      };

      const doctorMap = new Map<string, Record<string, unknown>>();
      cardsSnap.docs.forEach((doc) => {
        const data = serializeDoc(doc.data());
        if (data.status === 'Approved' && isInstitutionActive(data.institutionId)) {
          doctorMap.set(doc.id, data);
        }
      });

      const labMap = new Map<string, Record<string, unknown>>();
      labsSnap.docs.forEach((doc) => {
        const lab = serializeDoc(doc.data());
        if (!isInstitutionActive(lab.institutionId)) return;
        const services = Array.isArray(lab.labServices)
          ? (lab.labServices as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean)
          : [];
        labMap.set(doc.id, {
          labUid: String(lab.uid || doc.id),
          institutionId: String(lab.institutionId || ''),
          labNameAr: normalizeStr(lab.labNameAr, 160),
          labNameEn: normalizeStr(lab.labNameEn, 160),
          governorate: normalizeStr(lab.governorate, 80),
          district: normalizeStr(lab.district, 80),
          address: normalizeStr(lab.address, 240),
          mapLocationUrl: normalizeStr(lab.mapLocationUrl, 500),
          professionalPhone: normalizeStr(lab.professionalPhone, 32),
          labServices: services,
          serviceCatalog: parseFacilityCatalog(services, lab.serviceCatalog),
          workDaysAndHours: normalizeStr(lab.workDaysAndHours, 240),
          hourlyBookingLimit: typeof lab.hourlyBookingLimit === 'number' ? lab.hourlyBookingLimit : 4,
          bookingConfirmationMode: lab.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
        });
      });

      const activeAds: Record<string, unknown>[] = [];
      for (const d of adsSnap.docs) {
        const ad = serializeDoc(d.data());

        // Centralized Super Admin Governance: only show Super Admin curated & published ads
        if (ad.source !== 'super_admin' || ad.approvedByAdmin !== true) {
          continue;
        }
        const effectiveStatus =
          typeof ad.status === 'string' && ad.status.trim()
            ? ad.status.trim()
            : ad.active === true
              ? 'published'
              : 'paused';
        if (effectiveStatus !== 'published' || ad.active !== true) {
          continue;
        }

        // Must have a valid persisted image (Firebase Storage URL or /api/ads/assets/:assetId)
        const imageUrl = typeof ad.imageUrl === 'string' ? ad.imageUrl : '';
        const storagePath = typeof ad.storagePath === 'string' ? ad.storagePath : '';
        if (!isValidAdImageUrl(imageUrl, storagePath)) continue;

        const startDate = String(ad.startDate || '');
        const endDate = String(ad.endDate || '');
        if (startDate && today < startDate) continue;
        if (endDate && today > endDate) continue;

        if (
          (!IMAGING_PORTAL_ENABLED && isImagingPortalIdentifier(ad.entityType)) ||
          ad.entityType === 'imaging'
        ) {
          continue;
        }
        const entityType = ad.entityType === 'lab' ? 'lab' : 'doctor';
        const entityUid = String(ad.entityUid || ad.doctorUid || '');
        if (!entityUid) continue;

        if (entityType === 'doctor') {
          const card = doctorMap.get(entityUid);
          if (!card) continue;
          activeAds.push({
            ...ad,
            entityType: 'doctor',
            entityUid,
            entityName: card.fullName || ad.entityName || ad.doctorName || '',
            doctorUid: entityUid,
            doctorName: card.fullName || ad.doctorName || '',
            specialty: card.specialty || ad.specialty || '',
            clinicName: card.clinicName || ad.clinicName || '',
            doctorCard: card,
          });
        } else {
          const labCard = labMap.get(entityUid);
          if (!labCard) continue;
          const location = [labCard.governorate, labCard.district].filter(Boolean).join(' · ');
          activeAds.push({
            ...ad,
            entityType: 'lab',
            entityUid,
            entityName: labCard.labNameAr || ad.entityName || '',
            doctorUid: '',
            doctorName: labCard.labNameAr || ad.doctorName || '',
            specialty: 'مختبر طبي',
            clinicName: location || ad.clinicName || '',
            labCard,
          });
        }
      }

      activeAds.sort((a, b) => {
        const pDiff = Number(b.priority || 0) - Number(a.priority || 0);
        if (pDiff !== 0) return pDiff;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

      res.json({ ads: activeAds });
    } catch (err) {
      console.error('[MEDORA][PublicActiveAds] error:', err);
      res.status(500).json({ error: 'ADS_FETCH_FAILED', ads: [] });
    }
  });

  // ---------------------------------------------------------------------------
  // Complete Patient Workspace Hydration
  // ---------------------------------------------------------------------------
  router.get('/patient/workspace', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    try {
      const [
        favSnap,
        apptsSnap,
        linkedPatientsSnap,
        filesSnap,
        sharesSnap,
        labBooksSnap,
        convSnap,
        notifSnap,
        reviewsSnap,
        feedbackSnap,
        cardsSnap,
        labResultsSnap,
        labHomeSnap,
        labReviewsSnap,
        labConvSnap,
      ] = await Promise.all([
        db.collection('patient_favorites').where('patientUid', '==', actor.uid).limit(100).get(),
        db.collection('appointments').where('patientUid', '==', actor.uid).limit(150).get(),
        db.collection('doctor_patients').where('linkedPatientUid', '==', actor.uid).limit(60).get(),
        db.collection('patient_medical_files').where('patientUid', '==', actor.uid).limit(120).get(),
        db.collection('medical_record_shares').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('lab_bookings').where('patientUid', '==', actor.uid).limit(100).get(),
        db.collection('doctor_conversations').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('patient_notifications').where('patientUid', '==', actor.uid).limit(120).get(),
        db.collection('doctor_reviews').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('patient_feedback').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('doctor_public_cards').limit(200).get(),
        db.collection('lab_results').where('linkedPatientUid', '==', actor.uid).limit(100).get(),
        db.collection('lab_home_collections').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('lab_reviews').where('patientUid', '==', actor.uid).limit(80).get(),
        db.collection('lab_conversations').where('patientUid', '==', actor.uid).limit(80).get(),
      ]);

      const doctorMap = new Map<string, Record<string, unknown>>();
      cardsSnap.docs.forEach((d) => doctorMap.set(d.id, serializeDoc(d.data())));

      const favoriteDoctorUids = favSnap.docs
        .map((d) => String(d.data()?.doctorUid || ''))
        .filter((uid) => uid && doctorMap.has(uid));

      const reviews = reviewsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const reviewedAptIds = new Set(reviews.map((r) => String(r.appointmentId || '')));

      const appointments = apptsSnap.docs
        .map((d): Record<string, unknown> => {
          const apt = serializeDoc(d.data());
          const card = doctorMap.get(String(apt.doctorUid || ''));
          return {
            ...apt,
            doctorName: card?.fullName || apt.doctorName || '',
            doctorAvatarUrl: card?.avatarUrl || '',
            doctorSpecialty: card?.specialty || '',
            clinicName: card?.clinicName || '',
            clinicAddress: card?.workAddress || '',
            clinicPhone: card?.professionalPhone || '',
            mapLocationUrl: card?.mapLocationUrl || '',
            hasReview: reviewedAptIds.has(String(apt.appointmentId || '')),
          };
        })
        .sort((a, b) => `${String(b.date || '')} ${String(b.time || '')}`.localeCompare(`${String(a.date || '')} ${String(a.time || '')}`));

      // Idempotent 24h upcoming appointment reminders
      const baghdad = getBaghdadNow();
      const [ty, tm, td] = baghdad.dateStr.split('-').map(Number);
      const tomorrowDt = new Date(Date.UTC(ty, (tm || 1) - 1, td || 1) + 86400000);
      const tomorrowStr = `${tomorrowDt.getUTCFullYear()}-${String(tomorrowDt.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrowDt.getUTCDate()).padStart(2, '0')}`;

      const existingNotifIds = new Set(notifSnap.docs.map((d) => d.id));
      let generatedReminder = false;
      for (const apt of appointments) {
        const st = String((apt as Record<string, unknown>).status || '');
        const dt = String((apt as Record<string, unknown>).date || '');
        const id = String((apt as Record<string, unknown>).appointmentId || '');
        if ((st === 'confirmed' || st === 'pending') && (dt === baghdad.dateStr || dt === tomorrowStr) && id) {
          const detId = `notif_rem_${id}`;
          if (!existingNotifIds.has(detId)) {
            generatedReminder = true;
            await emitPatientNotification(db, {
              patientUid: actor.uid,
              type: 'reminder',
              eventType: 'appointment_reminder',
              title: `تذكير بموعد قادم مع ${(apt as Record<string, unknown>).doctorName || 'الطبيب'}`,
              body: `الموعد بتاريخ ${dt} الساعة ${(apt as Record<string, unknown>).time || ''}`,
              relatedId: id,
              relatedType: 'appointment',
              deterministicId: detId,
            });
          }
        }
      }

      const finalNotifsSnap = generatedReminder
        ? await db.collection('patient_notifications').where('patientUid', '==', actor.uid).limit(120).get()
        : notifSnap;

      const linkedPatients = linkedPatientsSnap.docs.map((d) => serializeDoc(d.data()));
      const recordIds = linkedPatients
        .map((p) => String(p.patientRecordId || ''))
        .filter(Boolean);

      // Query clinic visits, prescriptions, diagnostics across linked doctor_patients records
      const visits: Array<Record<string, unknown>> = [];
      const prescriptions: Array<Record<string, unknown>> = [];
      const diagnostics: Array<Record<string, unknown>> = [];

      if (recordIds.length > 0) {
        const chunkSize = 10;
        for (let i = 0; i < recordIds.length; i += chunkSize) {
          const chunk = recordIds.slice(i, i + chunkSize);
          const [vSnap, rxSnap, diagSnap] = await Promise.all([
            db.collection('patient_visits').where('patientRecordId', 'in', chunk).limit(100).get(),
            db.collection('prescriptions').where('patientRecordId', 'in', chunk).limit(100).get(),
            db.collection('diagnostic_orders').where('patientRecordId', 'in', chunk).limit(100).get(),
          ]);
          vSnap.docs.forEach((doc) => {
            const v = serializeDoc(doc.data());
            const card = doctorMap.get(String(v.doctorUid || ''));
            visits.push({
              ...v,
              doctorName: card?.fullName || v.createdByName || '',
              doctorAvatarUrl: card?.avatarUrl || '',
              doctorSpecialty: card?.specialty || '',
              clinicName: card?.clinicName || '',
            });
          });
          rxSnap.docs.forEach((doc) => prescriptions.push(serializeDoc(doc.data())));
          diagSnap.docs.forEach((doc) => diagnostics.push(serializeDoc(doc.data())));
        }
      }

      visits.sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || '')));
      prescriptions.sort((a, b) => String(b.prescribedDate || '').localeCompare(String(a.prescribedDate || '')));
      diagnostics.sort((a, b) => String(b.orderedAt || '').localeCompare(String(a.orderedAt || '')));

      const medicalFiles = filesSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.documentDate || b.createdAt || '').localeCompare(String(a.documentDate || a.createdAt || '')));

      const shares = sharesSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const labBookings = labBooksSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')));

      const conversations = convSnap.docs
        .map((d): Record<string, unknown> => {
          const c = serializeDoc(d.data());
          const card = doctorMap.get(String(c.doctorUid || ''));
          return {
            ...c,
            doctorName: card?.fullName || '',
            doctorAvatarUrl: card?.avatarUrl || '',
            doctorSpecialty: card?.specialty || '',
            clinicName: card?.clinicName || '',
          };
        })
        .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));

      const notifications = finalNotifsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const feedback = feedbackSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const publishedLabResults = labResultsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((r) => r.publishedToPatient === true && r.status === 'approved')
        .sort((a, b) => String(b.approvedAt || b.createdAt || '').localeCompare(String(a.approvedAt || a.createdAt || '')));

      const labHomeCollections = labHomeSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.preferredDate || b.createdAt || '').localeCompare(String(a.preferredDate || a.createdAt || '')));

      const labReviews = labReviewsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const labConversations = labConvSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));

      res.json({
        userAccount: actor.userAccount,
        patientProfile: actor.patientProfile,
        preferences: normalizePreferences(actor.patientProfile.preferences),
        favoriteDoctorUids,
        appointments,
        linkedPatients,
        visits,
        prescriptions,
        diagnostics,
        medicalFiles,
        shares,
        labBookings,
        conversations,
        notifications,
        reviews,
        feedback,
        publishedLabResults,
        labHomeCollections,
        labReviews,
        labConversations,
      });
    } catch (err) {
      console.error('[MEDORA][PatientWorkspace] error:', err);
      res.status(500).json({ error: 'PATIENT_WORKSPACE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Favorite Doctors
  // ---------------------------------------------------------------------------
  router.post('/patient/favorites/:doctorUid', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const doctorUid = normalizeStr(req.params.doctorUid, 128);
    if (!doctorUid) {
      res.status(400).json({ error: 'INVALID_DOCTOR_ID' });
      return;
    }

    try {
      const cardSnap = await db.doc(`doctor_public_cards/${doctorUid}`).get();
      if (!cardSnap.exists || cardSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }
      const favId = `fav_${actor.uid}_${doctorUid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
      await db.doc(`patient_favorites/${favId}`).set({
        favoriteId: favId,
        patientUid: actor.uid,
        doctorUid,
        createdAt: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true, doctorUid });
    } catch (err) {
      console.error('[MEDORA][AddFavorite] error:', err);
      res.status(500).json({ error: 'FAVORITE_SAVE_FAILED' });
    }
  });

  router.delete('/patient/favorites/:doctorUid', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const doctorUid = normalizeStr(req.params.doctorUid, 128);
    if (!doctorUid) {
      res.status(400).json({ error: 'INVALID_DOCTOR_ID' });
      return;
    }

    try {
      const favId = `fav_${actor.uid}_${doctorUid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
      await db.doc(`patient_favorites/${favId}`).delete();
      res.json({ ok: true, doctorUid });
    } catch (err) {
      console.error('[MEDORA][RemoveFavorite] error:', err);
      res.status(500).json({ error: 'FAVORITE_REMOVE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Patient Appointment Cancellation & Atomic Rescheduling
  // ---------------------------------------------------------------------------
  router.patch('/patient/appointments/:appointmentId/cancel', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const appointmentId = normalizeStr(req.params.appointmentId, 128);
    const cancelledReason = normalizeStr(req.body?.reason, 300) || 'إلغاء من بوابة المريض';
    if (!appointmentId) {
      res.status(400).json({ error: 'INVALID_APPOINTMENT_ID' });
      return;
    }

    try {
      let doctorUidForAudit = '';
      let instIdForAudit = '';
      let aptDate = '';
      let aptTime = '';

      await db.runTransaction(async (tx) => {
        const aptRef = db.doc(`appointments/${appointmentId}`);
        const aptSnap = await tx.get(aptRef);
        if (!aptSnap.exists) throw new Error('APPOINTMENT_NOT_FOUND');
        const apt = aptSnap.data() as Record<string, unknown>;
        if (apt.patientUid !== actor.uid) throw new Error('FORBIDDEN_APPOINTMENT');

        const st = String(apt.status || '');
        if (st === 'completed' || st === 'cancelled' || st === 'rejected') {
          throw new Error('APPOINTMENT_CANNOT_BE_CANCELLED');
        }

        doctorUidForAudit = String(apt.doctorUid || '');
        instIdForAudit = String(apt.institutionId || '');
        aptDate = String(apt.date || '');
        aptTime = String(apt.time || '');

        const slotKey = String(apt.slotKey || `${doctorUidForAudit}_${aptDate}_${aptTime}`);
        const slotRef = db.doc(`appointment_slots/${slotKey}`);
        const slotSnap = await tx.get(slotRef);

        if (!apt.isWaitlist && slotSnap.exists) {
          const activeIds = Array.isArray(slotSnap.data()?.activeAppointmentIds)
            ? (slotSnap.data()!.activeAppointmentIds as string[])
            : [];
          const filtered = activeIds.filter((id) => id !== appointmentId);
          tx.update(slotRef, {
            bookedCount: Math.max(0, filtered.length),
            activeAppointmentIds: filtered,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.update(aptRef, {
          status: 'cancelled',
          cancelledReason,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      if (doctorUidForAudit) {
        const logId = safeId('dlog');
        await db.doc(`doctor_audit_logs/${logId}`).set({
          logId,
          doctorUid: doctorUidForAudit,
          institutionId: instIdForAudit,
          actorUid: actor.uid,
          actorName: actor.name,
          actorRole: 'patient',
          action: 'PATIENT_APPOINTMENT_CANCELLED',
          targetType: 'appointments',
          targetId: appointmentId,
          details: `Patient cancelled appointment on ${aptDate} ${aptTime}`,
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: 'appointment_cancelled',
        title: 'تم إلغاء الموعد',
        body: `تم إلغاء موعدك بتاريخ ${aptDate} الساعة ${aptTime}`,
        relatedId: appointmentId,
        relatedType: 'appointment',
        idempotencyKey: `pat_cancel:${appointmentId}`,
      });

      if (doctorUidForAudit) {
        const docProfSnap = await db.doc(`doctor_profiles/${doctorUidForAudit}`).get().catch(() => null);
        const docPrefs = (docProfSnap?.data()?.notificationPrefs || {}) as Record<string, unknown>;
        const notifEngine = getGlobalNotificationEngine();
        if (notifEngine && docPrefs.newBookings !== false) {
          await notifEngine
            .dispatch({
              eventType: 'appointment_cancelled',
              recipientUid: doctorUidForAudit,
              recipientRole: 'doctor',
              title: `إلغاء موعد من المريض (${actor.name})`,
              body: `تم إلغاء موعد ${aptDate} الساعة ${aptTime}${cancelledReason ? ` — ${cancelledReason}` : ''}`,
              inAppType: 'appointment',
              relatedId: appointmentId,
              relatedType: 'appointment',
              idempotencyKey: `doc_cancel:${appointmentId}`,
              placeholders: {
                refCode: appointmentId.slice(0, 16).toUpperCase(),
                statusLabel: 'ملغى',
                dateLabel: aptDate,
              },
            })
            .catch(() => undefined);
        }
      }

      const updated = await db.doc(`appointments/${appointmentId}`).get();
      res.json({ ok: true, appointment: serializeDoc(updated.data()) });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'APPOINTMENT_NOT_FOUND') {
          res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND' });
          return;
        }
        if (err.message === 'FORBIDDEN_APPOINTMENT') {
          res.status(403).json({ error: 'FORBIDDEN' });
          return;
        }
        if (err.message === 'APPOINTMENT_CANNOT_BE_CANCELLED') {
          res.status(409).json({ error: 'APPOINTMENT_CANNOT_BE_CANCELLED' });
          return;
        }
      }
      console.error('[MEDORA][PatientCancelAppointment] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_CANCEL_FAILED' });
    }
  });

  router.patch('/patient/appointments/:appointmentId/reschedule', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const appointmentId = normalizeStr(req.params.appointmentId, 128);
    const newDate = normalizeStr(req.body?.date, 20);
    const newTime = normalizeStr(req.body?.time, 10);

    if (!appointmentId || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
      res.status(400).json({ error: 'INVALID_RESCHEDULE_INPUT' });
      return;
    }

    try {
      const aptPreSnap = await db.doc(`appointments/${appointmentId}`).get();
      if (!aptPreSnap.exists) {
        res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND' });
        return;
      }
      const aptPre = aptPreSnap.data() as Record<string, unknown>;
      if (aptPre.patientUid !== actor.uid) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      const doctorUid = String(aptPre.doctorUid || '');
      const docSnap = await db.doc(`doctor_profiles/${doctorUid}`).get();
      if (!docSnap.exists || docSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }
      const docData = docSnap.data() as Record<string, unknown>;
      const schedule = getNormalizedSchedule(docData);
      const winCheck = validateScheduleSlotWindow(schedule, newDate, newTime);
      if (!winCheck.ok) {
        res.status(409).json({ error: winCheck.error });
        return;
      }

      const nextStatus = docData.bookingConfirmationMode === 'auto' ? 'confirmed' : 'pending';
      let queueNumber = 1;

      await db.runTransaction(async (tx) => {
        const aptRef = db.doc(`appointments/${appointmentId}`);
        const aptSnap = await tx.get(aptRef);
        if (!aptSnap.exists) throw new Error('APPOINTMENT_NOT_FOUND');
        const current = aptSnap.data() as Record<string, unknown>;
        const st = String(current.status || '');
        if (st === 'completed' || st === 'cancelled' || st === 'rejected') {
          throw new Error('APPOINTMENT_CANNOT_BE_RESCHEDULED');
        }

        const oldSlotKey = String(current.slotKey || `${doctorUid}_${current.date}_${current.time}`);
        const newSlotKey = `${doctorUid}_${newDate}_${newTime}`;
        if (oldSlotKey === newSlotKey) {
          throw new Error('SAME_SLOT_SELECTED');
        }

        const oldSlotRef = db.doc(`appointment_slots/${oldSlotKey}`);
        const newSlotRef = db.doc(`appointment_slots/${newSlotKey}`);
        const dayQuery = db
          .collection('appointments')
          .where('doctorUid', '==', doctorUid)
          .where('date', '==', newDate)
          .limit(200);

        const [oldSlotSnap, newSlotSnap, dayApptsSnap] = await Promise.all([
          tx.get(oldSlotRef),
          tx.get(newSlotRef),
          tx.get(dayQuery),
        ]);

        const newCount = newSlotSnap.exists ? Number(newSlotSnap.data()?.bookedCount || 0) : 0;
        if (newCount >= schedule.maxPatientsPerPeriod) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        const activeDayCount = dayApptsSnap.docs.filter((d) => {
          if (d.id === appointmentId) return false;
          const dst = String(d.data()?.status || '');
          return dst === 'pending' || dst === 'confirmed' || dst === 'checked_in' || dst === 'completed';
        }).length;
        queueNumber = activeDayCount + 1;

        if (!current.isWaitlist && oldSlotSnap.exists) {
          const oldIds = Array.isArray(oldSlotSnap.data()?.activeAppointmentIds)
            ? (oldSlotSnap.data()!.activeAppointmentIds as string[])
            : [];
          const filtered = oldIds.filter((id) => id !== appointmentId);
          tx.update(oldSlotRef, {
            bookedCount: Math.max(0, filtered.length),
            activeAppointmentIds: filtered,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        const newIds = Array.isArray(newSlotSnap.data()?.activeAppointmentIds)
          ? (newSlotSnap.data()!.activeAppointmentIds as string[])
          : [];
        tx.set(newSlotRef, {
          slotKey: newSlotKey,
          doctorUid,
          date: newDate,
          time: newTime,
          capacity: schedule.maxPatientsPerPeriod,
          bookedCount: newIds.includes(appointmentId) ? newCount : newCount + 1,
          activeAppointmentIds: newIds.includes(appointmentId) ? newIds : [...newIds, appointmentId],
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.update(aptRef, {
          date: newDate,
          time: newTime,
          slotKey: newSlotKey,
          queueNumber,
          isWaitlist: false,
          status: nextStatus,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      const logId = safeId('dlog');
      await db.doc(`doctor_audit_logs/${logId}`).set({
        logId,
        doctorUid,
        institutionId: String(aptPre.institutionId || ''),
        actorUid: actor.uid,
        actorName: actor.name,
        actorRole: 'patient',
        action: 'PATIENT_APPOINTMENT_RESCHEDULED',
        targetType: 'appointments',
        targetId: appointmentId,
        details: `Patient rescheduled appointment to ${newDate} ${newTime}`,
        createdAt: FieldValue.serverTimestamp(),
      });

      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: 'appointment_rescheduled',
        title: `تم إعادة جدولة الموعد مع ${normalizeStr(docData.fullName, 120)}`,
        body: `الموعد الجديد: ${newDate} الساعة ${newTime} · رقم الانتظار #${queueNumber}`,
        relatedId: appointmentId,
        relatedType: 'appointment',
        idempotencyKey: `pat_resched:${appointmentId}:${newDate}_${newTime}`,
      });

      const docPrefsResched = (docData.notificationPrefs || {}) as Record<string, unknown>;
      const reschedEngine = getGlobalNotificationEngine();
      if (reschedEngine && docPrefsResched.newBookings !== false) {
        await reschedEngine
          .dispatch({
            eventType: 'appointment_rescheduled',
            recipientUid: doctorUid,
            recipientRole: 'doctor',
            title: `إعادة جدولة موعد (${actor.name})`,
            body: `الموعد الجديد: ${newDate} الساعة ${newTime} · الدور #${queueNumber}`,
            inAppType: 'appointment',
            relatedId: appointmentId,
            relatedType: 'appointment',
            idempotencyKey: `doc_resched:${appointmentId}:${newDate}_${newTime}`,
            placeholders: {
              refCode: appointmentId.slice(0, 16).toUpperCase(),
              statusLabel: 'معاد جدولته',
              dateLabel: newDate,
            },
          })
          .catch(() => undefined);
      }

      const updated = await db.doc(`appointments/${appointmentId}`).get();
      res.json({ ok: true, appointment: serializeDoc(updated.data()) });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'SLOT_ALREADY_BOOKED') {
          res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });
          return;
        }
        if (err.message === 'SAME_SLOT_SELECTED' || err.message === 'APPOINTMENT_CANNOT_BE_RESCHEDULED') {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      console.error('[MEDORA][PatientReschedule] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_RESCHEDULE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Personal Medical Record Files & Revocable Consent Sharing
  // ---------------------------------------------------------------------------
  router.post('/patient/files/upload', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const folderRaw = normalizeStr(req.body?.folder, 40) as MedoraUploadFolder;
    if (folderRaw !== 'avatars' && folderRaw !== 'patient_records' && folderRaw !== 'message_files') {
      res.status(400).json({ error: 'INVALID_UPLOAD_FOLDER' });
      return;
    }

    const conversationId = normalizeStr(req.body?.conversationId, 128);
    if (conversationId) {
      const [docConvSnap, labConvSnap] = await Promise.all([
        db.doc(`doctor_conversations/${conversationId}`).get(),
        db.doc(`lab_conversations/${conversationId}`).get(),
      ]);
      const allowedDoc = docConvSnap.exists && docConvSnap.data()?.patientUid === actor.uid;
      const allowedLab = labConvSnap.exists && labConvSnap.data()?.patientUid === actor.uid;
      if (!allowedDoc && !allowedLab) {
        res.status(403).json({ error: 'FORBIDDEN_CONVERSATION' });
        return;
      }
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

    const bucketInfo = deps.resolveReadyStorageBucket
      ? await deps.resolveReadyStorageBucket().catch(() => null)
      : null;

    try {
      const stored = await storeUploadedMediaAsset({
        adminDb: db,
        bucketInfo,
        hasServiceCredentials: deps.hasServiceCredentials ? deps.hasServiceCredentials() : false,
        ownerUid: actor.uid,
        folder: folderRaw,
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
        meta: {
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
      console.error('[MEDORA][PatientFileUpload] error:', err);
      res.status(500).json({ error: 'FILE_UPLOAD_FAILED' });
    }
  });

  router.post('/patient/medical-files', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const title = normalizeStr(req.body?.title, 160);
    const category = ['visit', 'lab', 'imaging', 'prescription', 'other'].includes(req.body?.category)
      ? req.body.category
      : 'other';
    const documentDate = normalizeStr(req.body?.documentDate, 20) || getBaghdadNow().dateStr;
    const notes = normalizeStr(req.body?.notes, 500);
    const file = req.body?.file as Record<string, unknown> | undefined;

    if (
      !title ||
      !file ||
      typeof file.url !== 'string' ||
      !file.url ||
      !isValidUploadedAssetUrl(file.url, normalizeStr(file.storagePath, 300))
    ) {
      res.status(400).json({ error: 'INVALID_MEDICAL_FILE_INPUT' });
      return;
    }

    const fileId = safeId('pmf');
    const storagePath = normalizeStr(file.storagePath, 300);
    const sanitizedFile = {
      name: normalizeStr(file.name, 140) || title,
      size: typeof file.size === 'number' ? file.size : 0,
      mimeType: normalizeStr(file.mimeType, 80) || 'application/pdf',
      url: normalizeStr(file.url, 1400),
      ...(storagePath ? { storagePath } : {}),
      uploadedAtIso: normalizeStr(file.uploadedAtIso, 60) || new Date().toISOString(),
    };

    try {
      await db.doc(`patient_medical_files/${fileId}`).set({
        fileId,
        patientUid: actor.uid,
        title,
        category,
        documentDate,
        notes,
        file: sanitizedFile,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const saved = await db.doc(`patient_medical_files/${fileId}`).get();
      const serialized = serializeDoc(saved.data());
      res.status(201).json({ ok: true, medicalFile: serialized, fileRecord: serialized });
    } catch (err) {
      console.error('[MEDORA][CreateMedicalFile] error:', err);
      res.status(500).json({ error: 'MEDICAL_FILE_SAVE_FAILED' });
    }
  });

  router.delete('/patient/medical-files/:fileId', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const fileId = normalizeStr(req.params.fileId, 128);
    if (!fileId) {
      res.status(400).json({ error: 'INVALID_FILE_ID' });
      return;
    }

    try {
      const ref = db.doc(`patient_medical_files/${fileId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'MEDICAL_FILE_NOT_FOUND' });
        return;
      }
      const prevFile = (snap.data()?.file as Record<string, unknown> | undefined) || {};
      const oldStoragePath = typeof prevFile.storagePath === 'string' ? prevFile.storagePath : '';
      await ref.delete();
      if (oldStoragePath) {
        const bucketInfo = deps.resolveReadyStorageBucket
          ? await deps.resolveReadyStorageBucket().catch(() => null)
          : null;
        await deleteStoredMediaAssetSafe({
          adminDb: db,
          bucket: bucketInfo?.bucketExists ? bucketInfo.bucket : deps.getStorageBucket?.() || null,
          storagePath: oldStoragePath,
          expectedFolderPrefix: 'patient_records',
        });
      }
      res.json({ ok: true, fileId });
    } catch (err) {
      console.error('[MEDORA][DeleteMedicalFile] error:', err);
      res.status(500).json({ error: 'MEDICAL_FILE_DELETE_FAILED' });
    }
  });

  router.post('/patient/shares', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const doctorUid = normalizeStr(req.body?.doctorUid, 128);
    const rawPerms = (req.body?.permissions as Record<string, unknown> | undefined) || {};
    const permissions = {
      visits: rawPerms.visits !== false,
      prescriptions: rawPerms.prescriptions !== false,
      diagnostics: rawPerms.diagnostics !== false,
      uploadedFiles: rawPerms.uploadedFiles !== false,
    };
    const expiresAtRaw = normalizeStr(req.body?.expiresAt, 40);
    const expiresAt = expiresAtRaw ? expiresAtRaw : null;

    if (!doctorUid) {
      res.status(400).json({ error: 'DOCTOR_REQUIRED' });
      return;
    }

    try {
      const cardSnap = await db.doc(`doctor_public_cards/${doctorUid}`).get();
      if (!cardSnap.exists || cardSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }
      const card = cardSnap.data() as Record<string, unknown>;
      const shareId = `shr_${actor.uid}_${doctorUid}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);

      await db.doc(`medical_record_shares/${shareId}`).set({
        shareId,
        patientUid: actor.uid,
        patientName: actor.name,
        doctorUid,
        doctorName: normalizeStr(card.fullName, 120),
        doctorSpecialty: normalizeStr(card.specialty, 120),
        clinicName: normalizeStr(card.clinicName, 160),
        permissions,
        expiresAt,
        revoked: false,
        revokedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const saved = await db.doc(`medical_record_shares/${shareId}`).get();
      res.status(201).json({ ok: true, share: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][CreateShare] error:', err);
      res.status(500).json({ error: 'SHARE_SAVE_FAILED' });
    }
  });

  router.patch('/patient/shares/:shareId', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const shareId = normalizeStr(req.params.shareId, 128);
    if (!shareId) {
      res.status(400).json({ error: 'INVALID_SHARE_ID' });
      return;
    }

    try {
      const ref = db.doc(`medical_record_shares/${shareId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'SHARE_NOT_FOUND' });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (typeof req.body?.revoked === 'boolean') {
        patch.revoked = req.body.revoked;
        patch.revokedAt = req.body.revoked ? new Date().toISOString() : null;
      }
      if (req.body?.permissions && typeof req.body.permissions === 'object') {
        const p = req.body.permissions as Record<string, unknown>;
        patch.permissions = {
          visits: p.visits !== false,
          prescriptions: p.prescriptions !== false,
          diagnostics: p.diagnostics !== false,
          uploadedFiles: p.uploadedFiles !== false,
        };
      }
      if (req.body?.expiresAt !== undefined) {
        const exp = normalizeStr(req.body.expiresAt, 40);
        patch.expiresAt = exp || null;
      }

      await ref.update(patch);
      const updated = await ref.get();
      res.json({ ok: true, share: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateShare] error:', err);
      res.status(500).json({ error: 'SHARE_UPDATE_FAILED' });
    }
  });

  router.delete('/patient/shares/:shareId', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const shareId = normalizeStr(req.params.shareId, 128);
    if (!shareId) {
      res.status(400).json({ error: 'INVALID_SHARE_ID' });
      return;
    }

    try {
      const ref = db.doc(`medical_record_shares/${shareId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'SHARE_NOT_FOUND' });
        return;
      }
      await ref.delete();
      res.json({ ok: true, shareId });
    } catch (err) {
      console.error('[MEDORA][DeleteShare] error:', err);
      res.status(500).json({ error: 'SHARE_DELETE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Real Approved Labs + Bookings
  // ---------------------------------------------------------------------------
  router.get('/patient/labs', async (_req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'LABS_SERVICE_UNAVAILABLE', labs: [] });
      return;
    }
    try {
      const [labsSnap, instSnap, offersSnap, testsSnap] = await Promise.all([
        db.collection('lab_profiles').where('status', '==', 'Approved').limit(100).get(),
        db.collection('institutions').where('type', '==', 'lab').limit(150).get(),
        db.collection('lab_offers').where('isActive', '==', true).limit(300).get(),
        db.collection('lab_tests').where('isActive', '==', true).limit(800).get(),
      ]);

      const todayStr = getBaghdadNow().dateStr;
      const instStatusMap = new Map<string, string>();
      instSnap.docs.forEach((doc) => {
        instStatusMap.set(doc.id, String(doc.data()?.status || ''));
      });

      const offersByLab = new Map<string, Array<Record<string, unknown>>>();
      offersSnap.docs.forEach((doc) => {
        const o = serializeDoc(doc.data());
        const lUid = String(o.labUid || '');
        const endDate = String(o.endDate || '');
        if (!lUid || (endDate && endDate < todayStr)) return;
        const arr = offersByLab.get(lUid) || [];
        arr.push(o);
        offersByLab.set(lUid, arr);
      });

      const testsByLab = new Map<string, Array<{ name: string; priceIqd?: number; prepInstructions?: string }>>();
      testsSnap.docs.forEach((doc) => {
        const t = serializeDoc(doc.data());
        const lUid = String(t.labUid || '');
        const name = normalizeStr(t.nameAr || t.nameEn, 140);
        if (!lUid || !name) return;
        const arr = testsByLab.get(lUid) || [];
        arr.push({
          name,
          ...(typeof t.priceIqd === 'number' ? { priceIqd: t.priceIqd } : {}),
          ...(t.prepInstructions ? { prepInstructions: normalizeStr(t.prepInstructions, 300) } : {}),
        });
        testsByLab.set(lUid, arr);
      });

      const labs = labsSnap.docs
        .map((d) => serializeDoc(d.data()))
        .filter((lab) => {
          const instId = String(lab.institutionId || '');
          if (!instId) return true;
          const st = instStatusMap.get(instId);
          return !st || st === 'active';
        })
        .map((lab) => {
          const lUid = String(lab.uid || '');
          const services = Array.isArray(lab.labServices)
            ? (lab.labServices as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean)
            : [];
          const activeTests = testsByLab.get(lUid) || [];
          const parsedCatalog = parseFacilityCatalog(services, lab.serviceCatalog);
          const mergedCatalog = activeTests.length > 0 ? activeTests : parsedCatalog;
          const mergedServices =
            activeTests.length > 0 ? activeTests.map((t) => t.name) : services;

          return {
            labUid: lUid,
            institutionId: String(lab.institutionId || ''),
            labNameAr: normalizeStr(lab.labNameAr, 160),
            labNameEn: normalizeStr(lab.labNameEn, 160),
            governorate: normalizeStr(lab.governorate, 80),
            district: normalizeStr(lab.district, 80),
            address: normalizeStr(lab.address, 240),
            mapLocationUrl: normalizeStr(lab.mapLocationUrl, 500),
            latitude: typeof lab.latitude === 'number' ? lab.latitude : undefined,
            longitude: typeof lab.longitude === 'number' ? lab.longitude : undefined,
            professionalPhone: normalizeStr(lab.professionalPhone, 32),
            directorName: normalizeStr(lab.directorName, 120),
            technicalDirectorName: normalizeStr(lab.technicalDirectorName, 120),
            labServices: mergedServices,
            serviceCatalog: mergedCatalog,
            workDaysAndHours: normalizeStr(lab.workDaysAndHours, 240),
            hourlyBookingLimit: typeof lab.hourlyBookingLimit === 'number' ? lab.hourlyBookingLimit : 4,
            bookingConfirmationMode: lab.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
            homeCollectionEnabled: lab.homeCollectionEnabled !== false,
            homeCollectionFeeIqd: typeof lab.homeCollectionFeeIqd === 'number' ? lab.homeCollectionFeeIqd : 0,
            averageRating: typeof lab.averageRating === 'number' ? lab.averageRating : 0,
            reviewCount: typeof lab.reviewCount === 'number' ? lab.reviewCount : 0,
            activeOffers: offersByLab.get(lUid) || [],
          };
        });

      res.json({ labs });
    } catch (err) {
      console.error('[MEDORA][PublicLabs] error:', err);
      res.status(500).json({ error: 'LABS_FETCH_FAILED', labs: [] });
    }
  });

  router.post('/patient/labs/book', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const labUid = normalizeStr(req.body?.labUid, 128);
    const date = normalizeStr(req.body?.date, 20);
    const time = normalizeStr(req.body?.time, 10);
    const notes = normalizeStr(req.body?.notes, 500);
    const requestedServices = Array.isArray(req.body?.requestedServices)
      ? (req.body.requestedServices as unknown[]).map((s) => normalizeStr(s, 120)).filter(Boolean).slice(0, 20)
      : [];
    const baghdad = getBaghdadNow();

    if (
      !labUid ||
      requestedServices.length === 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      res.status(400).json({ error: 'INVALID_LAB_BOOKING_INPUT' });
      return;
    }
    if (date < baghdad.dateStr) {
      res.status(409).json({ error: 'PAST_DATE_BOOKING_NOT_ALLOWED' });
      return;
    }

    try {
      const labSnap = await db.doc(`lab_profiles/${labUid}`).get();
      if (!labSnap.exists || labSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'LAB_NOT_FOUND' });
        return;
      }
      const lab = labSnap.data() as Record<string, unknown>;
      const bookingId = safeId('lbook');
      const initialStatus = lab.bookingConfirmationMode === 'auto' ? 'confirmed' : 'pending';
      const labName = normalizeStr(lab.labNameAr || lab.labNameEn, 160);

      await db.doc(`lab_bookings/${bookingId}`).set({
        bookingId,
        facilityType: 'lab',
        facilityUid: labUid,
        institutionId: normalizeStr(lab.institutionId, 128),
        facilityName: labName,
        facilityPhone: normalizeStr(lab.professionalPhone, 32),
        facilityAddress: `${normalizeStr(lab.governorate, 80)} · ${normalizeStr(lab.district, 80)} — ${normalizeStr(lab.address, 200)}`,
        facilityMapUrl: normalizeStr(lab.mapLocationUrl, 500),
        patientUid: actor.uid,
        patientName: actor.name,
        patientPhone: normalizeStr(req.body?.patientPhone || actor.patientProfile.phone || actor.userAccount.phone, 32),
        requestedServices,
        date,
        time,
        notes,
        status: initialStatus,
        preparationNotes: 'يرجى الالتزام بتعليمات التحضير الموضحة من المختبر وإحضار الهوية عند الموعد.',
        resultSummary: '',
        resultFiles: [],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const labNotifId = `lbntf_book_${bookingId}`;
      const notifEngine = getGlobalNotificationEngine();
      if (notifEngine) {
        await notifEngine
          .dispatch({
            eventType: 'lab_booking_created',
            recipientUid: labUid,
            recipientRole: 'lab',
            title: `حجز مختبر جديد من ${actor.name}`,
            body: `${requestedServices.join('، ')} · ${date} ${time}`,
            inAppType: 'booking',
            relatedId: bookingId,
            relatedType: 'lab_booking',
            deterministicInAppId: labNotifId,
            idempotencyKey: `lab_book:${bookingId}`,
            placeholders: { refCode: bookingId.slice(0, 16).toUpperCase(), statusLabel: 'حجز جديد', dateLabel: date },
          })
          .catch(() => undefined);
      } else {
        await db.doc(`lab_notifications/${labNotifId}`).set({
          notificationId: labNotifId,
          labUid,
          type: 'booking',
          eventType: 'lab_booking_created',
          iconCategory: 'lab_report',
          title: `حجز مختبر جديد من ${actor.name}`,
          body: `${requestedServices.join('، ')} · ${date} ${time}`,
          relatedId: bookingId,
          isRead: false,
          createdAt: new Date().toISOString(),
        });
      }

      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: initialStatus === 'confirmed' ? 'lab_booking_confirmed' : 'lab_booking_created',
        title: `تم تسجيل حجز المختبر: ${labName}`,
        body: `${requestedServices.join('، ')} · ${date} الساعة ${time}`,
        relatedId: bookingId,
        relatedType: 'lab_booking',
      });

      const saved = await db.doc(`lab_bookings/${bookingId}`).get();
      res.status(201).json({ ok: true, booking: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][BookLab] error:', err);
      res.status(500).json({ error: 'LAB_BOOKING_FAILED' });
    }
  });

  // Patient Home Sample Collection Request
  router.post('/patient/labs/home-collection', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const labUid = normalizeStr(req.body?.labUid, 128);
    const address = normalizeStr(req.body?.address, 280);
    const requestedDate = normalizeStr(req.body?.requestedDate || req.body?.preferredDate, 20);
    const preferredWindow = normalizeStr(req.body?.preferredWindow || req.body?.preferredTimeWindow, 80) || '09:00 - 12:00';
    const patientPhone = normalizeStr(req.body?.patientPhone || actor.patientProfile.phone || actor.userAccount.phone, 32);
    const notes = normalizeStr(req.body?.notes, 500);
    const requestedTests = Array.isArray(req.body?.requestedTests)
      ? (req.body.requestedTests as unknown[]).map((s) => normalizeStr(s, 140)).filter(Boolean).slice(0, 25)
      : [];

    if (!labUid || address.length < 4 || requestedTests.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      res.status(400).json({ error: 'INVALID_HOME_COLLECTION_INPUT' });
      return;
    }

    try {
      const labSnap = await db.doc(`lab_profiles/${labUid}`).get();
      if (!labSnap.exists || labSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'LAB_NOT_FOUND' });
        return;
      }
      const lab = labSnap.data() as Record<string, unknown>;
      if (lab.homeCollectionEnabled === false) {
        res.status(403).json({ error: 'LAB_HOME_COLLECTION_DISABLED' });
        return;
      }

      const requestId = safeId('lhc');
      const nowIso = new Date().toISOString();
      const labNameAr = normalizeStr(lab.labNameAr || lab.labNameEn, 160);
      const collectionFeeIqd = typeof lab.homeCollectionFeeIqd === 'number' ? lab.homeCollectionFeeIqd : 0;

      const payload = {
        requestId,
        labUid,
        institutionId: normalizeStr(lab.institutionId, 128),
        labNameAr,
        patientUid: actor.uid,
        patientName: actor.name,
        patientPhone,
        address,
        governorate: normalizeStr(req.body?.governorate || lab.governorate || actor.patientProfile.governorate, 80),
        district: normalizeStr(req.body?.district || actor.patientProfile.district, 80),
        requestedDate,
        preferredWindow,
        requestedTests,
        collectionFeeIqd,
        status: 'requested',
        notes,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.doc(`lab_home_collections/${requestId}`).set(payload);

      const labNotifId = `lbntf_hc_${requestId}`;
      const hcNotifEngine = getGlobalNotificationEngine();
      if (hcNotifEngine) {
        await hcNotifEngine
          .dispatch({
            eventType: 'lab_order_created',
            recipientUid: labUid,
            recipientRole: 'lab',
            title: `طلب سحب عينة منزلي جديد من ${actor.name}`,
            body: `${requestedTests.join('، ')} · ${requestedDate} (${preferredWindow})`,
            inAppType: 'home_collection',
            relatedId: requestId,
            relatedType: 'lab_home_collection',
            deterministicInAppId: labNotifId,
            idempotencyKey: `lab_hc:${requestId}`,
            placeholders: { refCode: requestId.slice(0, 16).toUpperCase(), statusLabel: 'طلب منزلي', dateLabel: requestedDate },
          })
          .catch(() => undefined);
      } else {
        await db.doc(`lab_notifications/${labNotifId}`).set({
          notificationId: labNotifId,
          labUid,
          type: 'home_collection',
          eventType: 'lab_order_created',
          iconCategory: 'lab_report',
          title: `طلب سحب عينة منزلي جديد من ${actor.name}`,
          body: `${requestedTests.join('، ')} · ${requestedDate} (${preferredWindow})`,
          relatedId: requestId,
          isRead: false,
          createdAt: nowIso,
        });
      }

      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: 'lab_order_created',
        title: `تم إرسال طلب السحب المنزلي: ${labNameAr}`,
        body: `${requestedTests.join('، ')} · ${requestedDate} (${preferredWindow})`,
        relatedId: requestId,
        relatedType: 'lab_home_collection',
        idempotencyKey: `pat_hc_create:${requestId}`,
      });

      res.status(201).json({ ok: true, homeCollection: payload });
    } catch (err) {
      console.error('[MEDORA][PatientHomeCollection] error:', err);
      res.status(500).json({ error: 'HOME_COLLECTION_CREATE_FAILED' });
    }
  });

  // Patient Lab Reviews & Complaints
  router.post('/patient/labs/reviews', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const labUid = normalizeStr(req.body?.labUid, 128);
    const rating = Number(req.body?.rating);
    const reviewType = req.body?.reviewType === 'complaint' ? 'complaint' : 'review';
    const comment = normalizeStr(req.body?.comment, 1000);
    const bookingId = normalizeStr(req.body?.bookingId, 128);

    if (!labUid || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 3) {
      res.status(400).json({ error: 'INVALID_LAB_REVIEW_INPUT' });
      return;
    }

    try {
      const labSnap = await db.doc(`lab_profiles/${labUid}`).get();
      if (!labSnap.exists || labSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'LAB_NOT_FOUND' });
        return;
      }
      const lab = labSnap.data() as Record<string, unknown>;
      const labNameAr = normalizeStr(lab.labNameAr || lab.labNameEn, 160);
      const reviewId = safeId('lrev');
      const nowIso = new Date().toISOString();

      const payload = {
        reviewId,
        labUid,
        labNameAr,
        patientUid: actor.uid,
        patientName: actor.name,
        ...(bookingId ? { bookingId } : {}),
        rating,
        reviewType,
        comment,
        status: reviewType === 'complaint' ? 'flagged' : 'approved',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.doc(`lab_reviews/${reviewId}`).set(payload);
      await recalculateLabRatingSummary(db, labUid);

      if (reviewType === 'complaint') {
        await emitAdminNotification(db, {
          eventType: 'admin_notice',
          type: 'lab_review_complaint',
          title: `شكوى مريض على مختبر ${labNameAr}`,
          body: `${actor.name}: ${comment.slice(0, 180)}`,
          relatedId: reviewId,
          relatedType: 'lab_review',
          idempotencyKey: `adm_lrev:${reviewId}`,
        });
      }

      res.status(201).json({ ok: true, review: payload });
    } catch (err) {
      console.error('[MEDORA][PatientLabReview] error:', err);
      res.status(500).json({ error: 'LAB_REVIEW_CREATE_FAILED' });
    }
  });

  // Patient <-> Lab Direct Messaging
  router.post('/patient/lab-conversations', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const labUid = normalizeStr(req.body?.labUid, 128);
    if (!labUid) {
      res.status(400).json({ error: 'LAB_UID_REQUIRED' });
      return;
    }

    try {
      const labSnap = await db.doc(`lab_profiles/${labUid}`).get();
      if (!labSnap.exists || labSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'LAB_NOT_FOUND' });
        return;
      }
      const lab = labSnap.data() as Record<string, unknown>;
      const labNameAr = normalizeStr(lab.labNameAr || lab.labNameEn, 160);

      const existing = await db
        .collection('lab_conversations')
        .where('labUid', '==', labUid)
        .where('patientUid', '==', actor.uid)
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
        labUid,
        labNameAr,
        patientUid: actor.uid,
        patientName: actor.name,
        patientPhone: normalizeStr(actor.patientProfile.phone || actor.userAccount.phone, 32),
        lastMessagePreview: '',
        lastMessageAt: nowIso,
        unreadByLab: 0,
        unreadByPatient: 0,
        createdAt: nowIso,
      };
      await db.doc(`lab_conversations/${conversationId}`).set(payload);
      res.status(201).json({ ok: true, conversation: payload });
    } catch (err) {
      console.error('[MEDORA][PatientLabConv] error:', err);
      res.status(500).json({ error: 'LAB_CONVERSATION_CREATE_FAILED' });
    }
  });

  router.get('/patient/lab-conversations/:conversationId/messages', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);
    try {
      const convRef = db.doc(`lab_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      const msgSnap = await db
        .collection('lab_messages')
        .where('conversationId', '==', conversationId)
        .limit(150)
        .get();
      const messages = msgSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      if (Number(convSnap.data()?.unreadByPatient || 0) > 0) {
        await convRef.update({ unreadByPatient: 0 });
      }
      res.json({ ok: true, messages });
    } catch (err) {
      console.error('[MEDORA][PatientLabMessages] error:', err);
      res.status(500).json({ error: 'LAB_MESSAGES_LOAD_FAILED' });
    }
  });

  router.post('/patient/lab-conversations/:conversationId/messages', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);
    const text = normalizeStr(req.body?.text, 2000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 6) : [];
    if (!text && attachments.length === 0) {
      res.status(400).json({ error: 'EMPTY_MESSAGE' });
      return;
    }

    try {
      const convRef = db.doc(`lab_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }
      const conv = convSnap.data() as Record<string, unknown>;
      const labUid = String(conv.labUid || '');
      const messageId = safeId('lmsg');
      const nowIso = new Date().toISOString();
      const payload = {
        messageId,
        conversationId,
        labUid,
        senderRole: 'patient',
        senderUid: actor.uid,
        senderName: actor.name,
        text,
        attachments,
        createdAt: nowIso,
      };
      const batch = db.batch();
      batch.set(db.doc(`lab_messages/${messageId}`), payload);
      batch.update(convRef, {
        lastMessagePreview: text || (attachments[0]?.name ? `مرفق: ${String(attachments[0].name)}` : 'مرفق'),
        lastMessageAt: nowIso,
        unreadByLab: FieldValue.increment(1),
        unreadByPatient: 0,
      });
      await batch.commit();

      if (labUid) {
        const labNotifId = `lbntf_msg_${messageId}`;
        const labMsgEngine = getGlobalNotificationEngine();
        if (labMsgEngine) {
          await labMsgEngine
            .dispatch({
              eventType: 'patient_message_received',
              recipientUid: labUid,
              recipientRole: 'lab',
              title: `رسالة جديدة من المريض ${actor.name}`,
              body: (text || 'تم إرسال ملف مرفق').slice(0, 180),
              inAppType: 'message',
              relatedId: conversationId,
              relatedType: 'lab_conversation',
              deterministicInAppId: labNotifId,
              idempotencyKey: `lab_msg:${messageId}`,
              placeholders: {
                refCode: conversationId.slice(0, 16).toUpperCase(),
                statusLabel: 'رسالة جديدة',
                dateLabel: nowIso.slice(0, 10),
              },
            })
            .catch(() => undefined);
        } else {
          await db.doc(`lab_notifications/${labNotifId}`).set({
            notificationId: labNotifId,
            labUid,
            type: 'message',
            eventType: 'patient_message_received',
            iconCategory: 'message',
            title: `رسالة جديدة من المريض ${actor.name}`,
            body: (text || 'تم إرسال ملف مرفق').slice(0, 180),
            relatedId: conversationId,
            isRead: false,
            createdAt: nowIso,
          });
        }
      }

      res.status(201).json({ ok: true, message: payload });
    } catch (err) {
      console.error('[MEDORA][PatientSendLabMessage] error:', err);
      res.status(500).json({ error: 'LAB_MESSAGE_SEND_FAILED' });
    }
  });

  router.patch('/patient/labs/bookings/:bookingId/cancel', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const bookingId = normalizeStr(req.params.bookingId, 128);
    if (!bookingId) {
      res.status(400).json({ error: 'INVALID_BOOKING_ID' });
      return;
    }

    try {
      const ref = db.doc(`lab_bookings/${bookingId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'BOOKING_NOT_FOUND' });
        return;
      }
      if (snap.data()?.status === 'completed' || snap.data()?.status === 'cancelled') {
        res.status(409).json({ error: 'BOOKING_CANNOT_BE_CANCELLED' });
        return;
      }
      await ref.update({
        status: 'cancelled',
        cancelledReason: normalizeStr(req.body?.reason, 300) || 'إلغاء من المريض',
        updatedAt: FieldValue.serverTimestamp(),
      });

      const bookingData = snap.data() as Record<string, unknown>;
      const targetLabUid = String(bookingData.facilityUid || '').trim();
      const labFacilityName = normalizeStr(bookingData.facilityName, 160) || 'المختبر';
      if (targetLabUid) {
        const labCancelEngine = getGlobalNotificationEngine();
        if (labCancelEngine) {
          await labCancelEngine
            .dispatch({
              eventType: 'lab_booking_rejected',
              recipientUid: targetLabUid,
              recipientRole: 'lab',
              title: `إلغاء حجز مختبر من المريض (${actor.name})`,
              body: `تم إلغاء الحجز بتاريخ ${String(bookingData.date || '')} الساعة ${String(bookingData.time || '')}`,
              inAppType: 'booking',
              relatedId: bookingId,
              relatedType: 'lab_booking',
              idempotencyKey: `lab_pat_cancel:${bookingId}`,
              placeholders: {
                refCode: bookingId.slice(0, 16).toUpperCase(),
                statusLabel: 'ملغى',
                dateLabel: String(bookingData.date || ''),
              },
            })
            .catch(() => undefined);
        }
      }

      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: 'lab_booking_rejected',
        title: `تم إلغاء حجز المختبر: ${labFacilityName}`,
        body: `موعد ${String(bookingData.date || '')} الساعة ${String(bookingData.time || '')}`,
        relatedId: bookingId,
        relatedType: 'lab_booking',
        idempotencyKey: `pat_lbk_cancel:${bookingId}`,
      });

      const updated = await ref.get();
      res.json({ ok: true, booking: serializeDoc(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][CancelLabBooking] error:', err);
      res.status(500).json({ error: 'LAB_BOOKING_CANCEL_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Patient <-> Doctor Messaging (Shared doctor_conversations & doctor_messages)
  // ---------------------------------------------------------------------------
  router.post('/patient/conversations', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const doctorUid = normalizeStr(req.body?.doctorUid, 128);
    if (!doctorUid) {
      res.status(400).json({ error: 'DOCTOR_REQUIRED' });
      return;
    }

    try {
      const docSnap = await db.doc(`doctor_profiles/${doctorUid}`).get();
      if (!docSnap.exists || docSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }
      const docData = docSnap.data() as Record<string, unknown>;
      const privacy = (docData.privacyPrefs as Record<string, unknown> | undefined) || {};
      if (privacy.allowPatientMessages === false) {
        res.status(403).json({ error: 'DOCTOR_MESSAGES_DISABLED' });
        return;
      }

      const existingSnap = await db
        .collection('doctor_conversations')
        .where('doctorUid', '==', doctorUid)
        .where('patientUid', '==', actor.uid)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const conv = serializeDoc(existingSnap.docs[0].data());
        res.json({
          ok: true,
          conversation: {
            ...conv,
            doctorName: normalizeStr(docData.fullName, 120),
            doctorSpecialty: normalizeStr(docData.specialty, 120),
            clinicName: normalizeStr(docData.clinicName, 160),
          },
        });
        return;
      }

      // Ensure linked doctor_patients record exists if needed
      const patientRecordId = `pat_${doctorUid}_${actor.uid}`;
      const patRef = db.doc(`doctor_patients/${patientRecordId}`);
      const patSnap = await patRef.get();
      if (!patSnap.exists) {
        await patRef.set({
          patientRecordId,
          fileNumber: `MRN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          doctorUid,
          institutionId: String(docData.institutionId || `inst_clinic_${doctorUid}`),
          linkedPatientUid: actor.uid,
          fullName: actor.name,
          phone: normalizeStr(actor.patientProfile.phone || actor.userAccount.phone, 32),
          totalVisits: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const conversationId = safeId('conv');
      await db.doc(`doctor_conversations/${conversationId}`).set({
        conversationId,
        doctorUid,
        patientRecordId,
        patientUid: actor.uid,
        patientName: actor.name,
        patientPhone: normalizeStr(actor.patientProfile.phone || actor.userAccount.phone, 32),
        lastMessageText: '',
        lastMessageAt: new Date().toISOString(),
        unreadByDoctor: 0,
        unreadByPatient: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const created = await db.doc(`doctor_conversations/${conversationId}`).get();
      res.status(201).json({
        ok: true,
        conversation: {
          ...serializeDoc(created.data()),
          doctorName: normalizeStr(docData.fullName, 120),
          doctorSpecialty: normalizeStr(docData.specialty, 120),
          clinicName: normalizeStr(docData.clinicName, 160),
        },
      });
    } catch (err) {
      console.error('[MEDORA][PatientCreateConv] error:', err);
      res.status(500).json({ error: 'CONVERSATION_CREATE_FAILED' });
    }
  });

  router.get('/patient/conversations/:conversationId/messages', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);

    try {
      const convRef = db.doc(`doctor_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }

      const msgSnap = await db
        .collection('doctor_messages')
        .where('conversationId', '==', conversationId)
        .limit(250)
        .get();

      const messages = msgSnap.docs
        .map((d) => serializeDoc(d.data()))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

      if (Number(convSnap.data()?.unreadByPatient || 0) > 0) {
        await convRef.update({ unreadByPatient: 0, updatedAt: FieldValue.serverTimestamp() });
      }

      res.json({ messages });
    } catch (err) {
      console.error('[MEDORA][PatientListMessages] error:', err);
      res.status(500).json({ error: 'MESSAGES_LOAD_FAILED' });
    }
  });

  router.post('/patient/conversations/:conversationId/messages', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);
    const text = normalizeStr(req.body?.text, 2000);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 6) : [];

    if (!text && attachments.length === 0) {
      res.status(400).json({ error: 'EMPTY_MESSAGE' });
      return;
    }

    try {
      const convRef = db.doc(`doctor_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }

      const convData = convSnap.data() as Record<string, unknown>;
      const doctorUid = String(convData.doctorUid || '');
      const messageId = safeId('mmsg');
      const nowIso = new Date().toISOString();
      const batch = db.batch();
      batch.set(db.doc(`doctor_messages/${messageId}`), {
        messageId,
        conversationId,
        doctorUid,
        senderUid: actor.uid,
        senderRole: 'patient',
        senderName: actor.name,
        text,
        attachments,
        readByDoctor: false,
        createdAt: nowIso,
      });
      batch.update(convRef, {
        lastMessageText: text || (attachments[0]?.name ? `Attachment: ${attachments[0].name}` : 'Attachment'),
        lastMessageAt: nowIso,
        unreadByDoctor: FieldValue.increment(1),
        unreadByPatient: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      if (doctorUid) {
        const docProfSnap = await db.doc(`doctor_profiles/${doctorUid}`).get().catch(() => null);
        const docPrefs = (docProfSnap?.data()?.notificationPrefs || {}) as Record<string, unknown>;
        const msgEngine = getGlobalNotificationEngine();
        if (msgEngine && docPrefs.newMessages !== false) {
          await msgEngine
            .dispatch({
              eventType: 'patient_message_received',
              recipientUid: doctorUid,
              recipientRole: 'doctor',
              title: `رسالة جديدة من المريض ${actor.name}`,
              body: (text || 'تم إرسال مرفق').slice(0, 140),
              inAppType: 'message',
              relatedId: conversationId,
              relatedType: 'conversation',
              idempotencyKey: `doc_pmsg:${messageId}`,
              placeholders: {
                refCode: conversationId.slice(0, 16).toUpperCase(),
                statusLabel: 'رسالة جديدة',
                dateLabel: nowIso.slice(0, 10),
              },
            })
            .catch(() => undefined);
        }
      }

      const saved = await db.doc(`doctor_messages/${messageId}`).get();
      res.status(201).json({ ok: true, message: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][PatientSendMessage] error:', err);
      res.status(500).json({ error: 'MESSAGE_SEND_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Notifications Read State
  // ---------------------------------------------------------------------------
  router.patch('/patient/notifications/:notificationId/read', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    const notificationId = normalizeStr(req.params.notificationId, 128);
    const isRead = req.body?.isRead !== false;
    if (!notificationId) {
      res.status(400).json({ error: 'INVALID_NOTIFICATION_ID' });
      return;
    }

    try {
      const ref = db.doc(`patient_notifications/${notificationId}`);
      const snap = await ref.get();
      if (!snap.exists || snap.data()?.patientUid !== actor.uid) {
        res.status(404).json({ error: 'NOTIFICATION_NOT_FOUND' });
        return;
      }
      await ref.update({ isRead, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, notificationId, isRead });
    } catch (err) {
      console.error('[MEDORA][MarkNotificationRead] error:', err);
      res.status(500).json({ error: 'NOTIFICATION_UPDATE_FAILED' });
    }
  });

  router.post('/patient/notifications/read-all', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;
    try {
      const snap = await db
        .collection('patient_notifications')
        .where('patientUid', '==', actor.uid)
        .where('isRead', '==', false)
        .limit(100)
        .get();
      if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => {
          batch.update(doc.ref, { isRead: true, updatedAt: FieldValue.serverTimestamp() });
        });
        await batch.commit();
      }
      res.json({ ok: true, updatedCount: snap.size });
    } catch (err) {
      console.error('[MEDORA][ReadAllNotifs] error:', err);
      res.status(500).json({ error: 'NOTIFICATIONS_READ_ALL_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Doctor Reviews (Strictly Completed-Appointment Gated + Admin Moderation)
  // ---------------------------------------------------------------------------
  router.post('/patient/reviews', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const appointmentId = normalizeStr(req.body?.appointmentId, 128);
    const rating = Number(req.body?.rating);
    const comment = normalizeStr(req.body?.comment, 800);

    if (!appointmentId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'INVALID_REVIEW_INPUT' });
      return;
    }

    try {
      const aptSnap = await db.doc(`appointments/${appointmentId}`).get();
      if (!aptSnap.exists) {
        res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND' });
        return;
      }
      const apt = aptSnap.data() as Record<string, unknown>;
      if (apt.patientUid !== actor.uid) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      if (apt.status !== 'completed') {
        res.status(403).json({ error: 'REVIEW_REQUIRES_COMPLETED_APPOINTMENT' });
        return;
      }

      const doctorUid = String(apt.doctorUid || '');
      const cardSnap = await db.doc(`doctor_public_cards/${doctorUid}`).get();
      const card = cardSnap.exists ? (cardSnap.data() as Record<string, unknown>) : {};

      const existingSnap = await db
        .collection('doctor_reviews')
        .where('appointmentId', '==', appointmentId)
        .where('patientUid', '==', actor.uid)
        .limit(1)
        .get();

      const nowIso = new Date().toISOString();
      if (!existingSnap.empty) {
        const revRef = existingSnap.docs[0].ref;
        const wasApproved = existingSnap.docs[0].data()?.status === 'approved';
        await revRef.update({
          rating,
          comment,
          status: 'pending',
          updatedAt: nowIso,
        });
        if (wasApproved && doctorUid) {
          await recalculateDoctorRatingSummary(db, doctorUid);
        }
        const updated = await revRef.get();
        res.json({ ok: true, review: serializeDoc(updated.data()) });
        return;
      }

      const reviewId = safeId('rev');
      await db.doc(`doctor_reviews/${reviewId}`).set({
        reviewId,
        doctorUid,
        doctorName: normalizeStr(card.fullName, 120),
        clinicName: normalizeStr(card.clinicName, 160),
        appointmentId,
        patientUid: actor.uid,
        patientName: actor.name,
        rating,
        comment,
        status: 'pending',
        moderationNote: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const saved = await db.doc(`doctor_reviews/${reviewId}`).get();
      res.status(201).json({ ok: true, review: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][CreateReview] error:', err);
      res.status(500).json({ error: 'REVIEW_CREATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Patient Feedback & Complaints
  // ---------------------------------------------------------------------------
  router.post('/patient/feedback', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const category = ['complaint', 'note', 'booking_issue', 'technical', 'suggestion'].includes(req.body?.category)
      ? req.body.category
      : 'note';
    const subject = normalizeStr(req.body?.subject, 180);
    const message = normalizeStr(req.body?.message, 2000);
    const relatedDoctorUid = normalizeStr(req.body?.relatedDoctorUid, 128);

    if (subject.length < 2 || message.length < 5) {
      res.status(400).json({ error: 'INVALID_FEEDBACK_INPUT' });
      return;
    }

    const feedbackId = safeId('fbk');
    const nowIso = new Date().toISOString();
    try {
      await db.doc(`patient_feedback/${feedbackId}`).set({
        feedbackId,
        patientUid: actor.uid,
        patientName: actor.name,
        patientEmail: actor.email,
        category,
        subject,
        message,
        ...(relatedDoctorUid ? { relatedDoctorUid } : {}),
        status: 'new',
        adminReply: '',
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      if (category === 'complaint' || category === 'booking_issue') {
        await emitAdminNotification(db, {
          eventType: 'admin_notice',
          type: 'patient_feedback',
          title: `بلاغ/شكوى جديدة من ${actor.name}: ${subject}`,
          body: message.slice(0, 200),
          relatedId: feedbackId,
          relatedType: 'patient_feedback',
          idempotencyKey: `adm_fbk:${feedbackId}`,
        });
      }

      const saved = await db.doc(`patient_feedback/${feedbackId}`).get();
      res.status(201).json({ ok: true, feedback: serializeDoc(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][SubmitFeedback] error:', err);
      res.status(500).json({ error: 'FEEDBACK_CREATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Patient Settings & Profile Updates
  // ---------------------------------------------------------------------------
  router.put('/patient/settings', async (req, res) => {
    const actor = await requirePatientAccess(req, res);
    if (!actor) return;
    const db = deps.getAdminDb()!;

    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const governorate = normalizeStr(req.body?.governorate, 80);
    const district = normalizeStr(req.body?.district, 80);
    const address = normalizeStr(req.body?.address, 240);
    const dateOfBirth = normalizeStr(req.body?.dateOfBirth, 20);
    const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 1000) : undefined;
    const avatarPath = normalizeStr(req.body?.avatarPath, 300);
    const emergencyContactName = normalizeStr(req.body?.emergencyContactName, 120);
    const emergencyContactPhone = normalizeStr(req.body?.emergencyContactPhone, 32);
    const emergencyContactRelation = normalizeStr(req.body?.emergencyContactRelation, 60);
    const preferences = req.body?.preferences ? normalizePreferences(req.body.preferences) : undefined;

    if (avatarUrl !== undefined && avatarUrl !== '' && !isValidUploadedAssetUrl(avatarUrl, avatarPath)) {
      res.status(400).json({ error: 'INVALID_AVATAR_URL' });
      return;
    }

    try {
      const oldAvatarPath =
        typeof actor.patientProfile.avatarPath === 'string'
          ? actor.patientProfile.avatarPath
          : typeof actor.userAccount.avatarPath === 'string'
            ? actor.userAccount.avatarPath
            : '';

      const userPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      const patPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

      if (fullName.length >= 2) {
        userPatch.fullName = fullName;
        patPatch.fullName = fullName;
      }
      if (req.body?.phone !== undefined) {
        let normalizedPhone = phone;
        if (phone) {
          const parsedPhone = parseAndNormalizeIraqiPhone(phone);
          if (!parsedPhone.ok) {
            res.status(400).json({ error: `INVALID_IRAQI_PHONE:${parsedPhone.errorCode}` });
            return;
          }
          const regSnap = await db.doc(`phone_registry/${hashPhoneKey(parsedPhone.e164)}`).get();
          if (regSnap.exists && String(regSnap.data()?.ownerUid || '') !== actor.uid) {
            res.status(409).json({ error: 'PHONE_ALREADY_REGISTERED' });
            return;
          }
          normalizedPhone = parsedPhone.e164;
        }
        userPatch.phone = normalizedPhone;
        patPatch.phone = normalizedPhone;
      }
      if (governorate) {
        userPatch.governorate = governorate;
        patPatch.governorate = governorate;
      }
      if (district) {
        userPatch.district = district;
        patPatch.district = district;
      }
      if (address) {
        userPatch.address = address;
        patPatch.address = address;
      }
      if (dateOfBirth) {
        userPatch.dateOfBirth = dateOfBirth;
        patPatch.dateOfBirth = dateOfBirth;
      }
      if (avatarUrl !== undefined) {
        userPatch.avatarUrl = avatarUrl;
        userPatch.avatarPath = avatarUrl ? avatarPath : '';
        patPatch.avatarUrl = avatarUrl;
        patPatch.avatarPath = avatarUrl ? avatarPath : '';
      }
      if (req.body?.emergencyContactName !== undefined) {
        patPatch.emergencyContactName = emergencyContactName;
      }
      if (req.body?.emergencyContactPhone !== undefined) {
        patPatch.emergencyContactPhone = emergencyContactPhone;
      }
      if (req.body?.emergencyContactRelation !== undefined) {
        patPatch.emergencyContactRelation = emergencyContactRelation;
      }
      if (preferences) {
        patPatch.preferences = preferences;
      }

      const batch = db.batch();
      batch.set(db.doc(`users/${actor.uid}`), userPatch, { merge: true });
      batch.set(db.doc(`patient_profiles/${actor.uid}`), patPatch, { merge: true });
      await batch.commit();

      if (
        userPatch.phone !== undefined ||
        patPatch.emergencyContactPhone !== undefined ||
        userPatch.fullName !== undefined
      ) {
        await emitPatientNotification(db, {
          patientUid: actor.uid,
          type: 'announcement',
          eventType: 'important_account_update',
          title: 'تم تحديث بيانات حسابك في MEDORA',
          body: 'تم حفظ تحديثات الملف الشخصي أو معلومات الطوارئ ورقم التواصل بنجاح.',
          relatedId: actor.uid,
          relatedType: 'patient_settings',
          idempotencyKey: `pat_set:${actor.uid}:${Date.now().toString(36)}`,
        });
      }

      if (avatarUrl !== undefined && oldAvatarPath && oldAvatarPath !== (avatarUrl ? avatarPath : '')) {
        const bucketInfo = deps.resolveReadyStorageBucket
          ? await deps.resolveReadyStorageBucket().catch(() => null)
          : null;
        await deleteStoredMediaAssetSafe({
          adminDb: db,
          bucket: bucketInfo?.bucketExists ? bucketInfo.bucket : deps.getStorageBucket?.() || null,
          storagePath: oldAvatarPath,
          expectedFolderPrefix: 'avatars',
        });
      }

      const [updatedUser, updatedPat] = await Promise.all([
        db.doc(`users/${actor.uid}`).get(),
        db.doc(`patient_profiles/${actor.uid}`).get(),
      ]);

      res.json({
        ok: true,
        userAccount: serializeDoc(updatedUser.data()),
        patientProfile: serializeDoc(updatedPat.data()),
        preferences: normalizePreferences(updatedPat.data()?.preferences),
      });
    } catch (err) {
      console.error('[MEDORA][UpdatePatientSettings] error:', err);
      res.status(500).json({ error: 'PATIENT_SETTINGS_FAILED' });
    }
  });

  return router;
}
