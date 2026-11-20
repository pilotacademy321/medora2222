import express, { type Request, type Response, type Router } from 'express';
import {
  getTodayBaghdadDateStr,
  summarizeProductBatchStock,
} from './pharmacyWholesalerEngine.ts';
import type {
  CanonicalMedicineRecord,
  PharmacyBatchRecord,
  PharmacyProductRecord,
  PharmacyProfileDocument,
} from '../src/types/pharmacy.ts';
import { type Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  emitPatientNotification,
  getBaghdadNow,
} from './patientNotifications.ts';
import { getGlobalNotificationEngine } from './notificationEngine.ts';
import {
  IMAGING_PORTAL_ENABLED,
  buildImagingDisabledResponseBody,
} from './featureFlags.ts';
import {
  decodeAndValidateBase64Asset,
  deleteStoredMediaAssetSafe,
  isValidUploadedAssetUrl,
  storeUploadedMediaAsset,
  syncDoctorAvatarAcrossCollections,
  type MedoraUploadFolder,
  type ResolvedBucketInfo,
  type StorageBucket,
} from './storageHelper.ts';

export type DayOfWeekKey =
  | 'sat'
  | 'sun'
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri';

export type SecretaryPermissionKey =
  | 'viewAppointments'
  | 'manageAppointments'
  | 'manageWaitlist'
  | 'viewPatientBasic'
  | 'viewMedicalRecords'
  | 'uploadLabResults'
  | 'messagePatients'
  | 'editClinicSchedule';

const ALL_PERMISSIONS: SecretaryPermissionKey[] = [
  'viewAppointments',
  'manageAppointments',
  'manageWaitlist',
  'viewPatientBasic',
  'viewMedicalRecords',
  'uploadLabResults',
  'messagePatients',
  'editClinicSchedule',
];

const VALID_PERMISSIONS_SET = new Set<string>(ALL_PERMISSIONS);

export interface DoctorRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  getStorageBucket?: () => StorageBucket | null;
  resolveReadyStorageBucket?: (forceRefresh?: boolean) => Promise<ResolvedBucketInfo>;
  hasServiceCredentials?: () => boolean;
}

interface VerifiedActor {
  uid: string;
  email: string;
  name: string;
}

interface DoctorAccessContext {
  actor: VerifiedActor;
  actorRole: 'doctor' | 'secretary';
  doctorUid: string;
  institutionId: string;
  permissions: SecretaryPermissionKey[];
  doctorProfile: Record<string, unknown>;
  institution: Record<string, unknown> | null;
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

function generateFileNumber(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MRN-${y}${m}${day}-${rand}`;
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

function serializeDocData(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

const DEFAULT_SCHEDULE = {
  days: {
    sat: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
    sun: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
    mon: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
    tue: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
    wed: { enabled: true, startTime: '09:00', endTime: '17:00', breakStart: '13:00', breakEnd: '14:00' },
    thu: { enabled: true, startTime: '09:00', endTime: '14:00', breakStart: '', breakEnd: '' },
    fri: { enabled: false, startTime: '09:00', endTime: '13:00', breakStart: '', breakEnd: '' },
  },
  consultationDurationMinutes: 20,
  maxPatientsPerPeriod: 1,
  holidayDates: [] as string[],
};

export function getNormalizedSchedule(profile: Record<string, unknown>) {
  const existing = profile.workingSchedule as Record<string, unknown> | undefined;
  const duration = normalizeNum(
    existing?.consultationDurationMinutes ?? profile.consultationDurationMinutes,
    5,
    180,
    20,
  );
  const maxPerPeriod = normalizeNum(
    existing?.maxPatientsPerPeriod ?? 1,
    1,
    20,
    1,
  );
  const holidays = Array.isArray(existing?.holidayDates)
    ? (existing!.holidayDates as unknown[])
        .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .slice(0, 60)
    : [];

  const rawDays = (existing?.days as Record<string, Record<string, unknown>> | undefined) || {};
  const dayKeys: DayOfWeekKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
  const days: Record<string, unknown> = {};
  for (const k of dayKeys) {
    const def = DEFAULT_SCHEDULE.days[k];
    const src = rawDays[k] || {};
    days[k] = {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : def.enabled,
      startTime: typeof src.startTime === 'string' && /^\d{2}:\d{2}$/.test(src.startTime) ? src.startTime : def.startTime,
      endTime: typeof src.endTime === 'string' && /^\d{2}:\d{2}$/.test(src.endTime) ? src.endTime : def.endTime,
      breakStart: typeof src.breakStart === 'string' ? src.breakStart : def.breakStart,
      breakEnd: typeof src.breakEnd === 'string' ? src.breakEnd : def.breakEnd,
    };
  }
  return {
    days: days as typeof DEFAULT_SCHEDULE.days,
    consultationDurationMinutes: duration,
    maxPatientsPerPeriod: maxPerPeriod,
    holidayDates: holidays,
  };
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getDayKeyFromDate(dateStr: string): DayOfWeekKey {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const map: DayOfWeekKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[dt.getUTCDay()];
}

export function validateScheduleSlotWindow(
  schedule: ReturnType<typeof getNormalizedSchedule>,
  date: string,
  time: string,
): { ok: true } | { ok: false; error: string } {
  const baghdad = getBaghdadNow();
  const timeMin = timeToMinutes(time);
  if (date < baghdad.dateStr) {
    return { ok: false, error: 'PAST_DATE_BOOKING_NOT_ALLOWED' };
  }
  if (date === baghdad.dateStr && timeMin <= baghdad.minutesOfDay) {
    return { ok: false, error: 'PAST_TIME_BOOKING_NOT_ALLOWED' };
  }
  if (schedule.holidayDates.includes(date)) {
    return { ok: false, error: 'CLINIC_HOLIDAY_DATE' };
  }
  const dayRule = schedule.days[getDayKeyFromDate(date)];
  if (!dayRule || !dayRule.enabled) {
    return { ok: false, error: 'CLINIC_CLOSED_DAY' };
  }
  const startMin = timeToMinutes(dayRule.startTime);
  const endMin = timeToMinutes(dayRule.endTime);
  if (timeMin < startMin || timeMin + schedule.consultationDurationMinutes > endMin) {
    return { ok: false, error: 'OUTSIDE_WORKING_HOURS' };
  }
  if (dayRule.breakStart && dayRule.breakEnd) {
    const brStart = timeToMinutes(dayRule.breakStart);
    const brEnd = timeToMinutes(dayRule.breakEnd);
    if (timeMin >= brStart && timeMin < brEnd) {
      return { ok: false, error: 'CLINIC_BREAK_TIME' };
    }
  }
  return { ok: true };
}

function generateAvailableSlotsForRange(
  doctorUid: string,
  profile: Record<string, unknown>,
  slotCounts: Map<string, number>,
  daysAhead = 7,
) {
  const schedule = getNormalizedSchedule(profile);
  const capacity = schedule.maxPatientsPerPeriod;
  const duration = schedule.consultationDurationMinutes;
  const holidays = new Set(schedule.holidayDates);
  const baghdad = getBaghdadNow();
  const [by, bm, bd] = baghdad.dateStr.split('-').map(Number);
  const baseUtc = Date.UTC(by, (bm || 1) - 1, bd || 1);
  const results: Array<{
    date: string;
    time: string;
    slotKey: string;
    available: boolean;
    remainingCapacity: number;
  }> = [];

  for (let offset = 0; offset < daysAhead; offset++) {
    const dt = new Date(baseUtc + offset * 86400000);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    if (holidays.has(dateStr)) continue;

    const dayKey = getDayKeyFromDate(dateStr);
    const rule = schedule.days[dayKey];
    if (!rule || !rule.enabled) continue;

    const startMin = timeToMinutes(rule.startTime);
    const endMin = timeToMinutes(rule.endTime);
    const hasBreak = Boolean(rule.breakStart && rule.breakEnd);
    const brStart = hasBreak ? timeToMinutes(rule.breakStart!) : -1;
    const brEnd = hasBreak ? timeToMinutes(rule.breakEnd!) : -1;

    for (let cursor = startMin; cursor + duration <= endMin; cursor += duration) {
      if (dateStr === baghdad.dateStr && cursor <= baghdad.minutesOfDay) continue;
      if (hasBreak && cursor >= brStart && cursor < brEnd) continue;
      const timeStr = minutesToTime(cursor);
      const slotKey = `${doctorUid}_${dateStr}_${timeStr}`;
      const booked = slotCounts.get(slotKey) || 0;
      const remaining = Math.max(0, capacity - booked);
      results.push({
        date: dateStr,
        time: timeStr,
        slotKey,
        available: remaining > 0,
        remainingCapacity: remaining,
      });
    }
  }
  return results;
}

export function buildPublicDoctorCardPayload(
  doctorUid: string,
  profile: Record<string, unknown>,
) {
  const privacy = (profile.privacyPrefs as Record<string, unknown> | undefined) || {};
  const showFee = privacy.showFeeInDirectory !== false;
  const showPhone = privacy.showPhoneInDirectory !== false;
  const allowPatientMessages = privacy.allowPatientMessages !== false;
  const schedule = getNormalizedSchedule(profile);

  return {
    doctorUid,
    fullName: normalizeStr(profile.fullName, 120),
    ...(profile.gender === 'male' || profile.gender === 'female' ? { gender: profile.gender } : {}),
    specialty: normalizeStr(profile.specialty, 120),
    subSpecialty: normalizeStr(profile.subSpecialty, 120),
    experienceYears: typeof profile.experienceYears === 'number' ? profile.experienceYears : 0,
    governorate: normalizeStr(profile.governorate, 80),
    district: normalizeStr(profile.district, 80),
    clinicName: normalizeStr(profile.clinicName, 160),
    workAddress: normalizeStr(profile.workAddress, 240),
    mapLocationUrl: normalizeStr(profile.mapLocationUrl, 500),
    workDaysAndHours: normalizeStr(profile.workDaysAndHours, 240),
    consultationDurationMinutes: schedule.consultationDurationMinutes,
    consultationFee: showFee && typeof profile.consultationFee === 'number' ? profile.consultationFee : null,
    showFee,
    allowPatientMessages,
    professionalPhone: showPhone ? normalizeStr(profile.professionalPhone, 32) : '',
    bookingConfirmationMode: profile.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
    avatarUrl: normalizeStr(profile.avatarUrl, 1000),
    promotionalBannerUrl: normalizeStr(profile.promotionalBannerUrl, 1200),
    promotionalTagline: normalizeStr(profile.promotionalTagline, 240),
    clinicServices: Array.isArray(profile.clinicServices)
      ? (profile.clinicServices as unknown[]).filter((s): s is string => typeof s === 'string').slice(0, 20)
      : [],
    workingSchedule: schedule,
    ...(typeof profile.averageRating === 'number' ? { averageRating: profile.averageRating } : {}),
    ...(typeof profile.reviewCount === 'number' ? { reviewCount: profile.reviewCount } : {}),
    status: normalizeStr(profile.status, 40),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function syncPublicDoctorCard(
  db: Firestore,
  doctorUid: string,
  profile: Record<string, unknown>,
): Promise<void> {
  if (profile.status === 'Approved') {
    await db
      .doc(`doctor_public_cards/${doctorUid}`)
      .set(buildPublicDoctorCardPayload(doctorUid, profile), { merge: true });
  }
}

export function createDoctorRouter(deps: DoctorRouterDeps): Router {
  const router = express.Router();

  async function verifyAuthenticatedUser(req: Request): Promise<VerifiedActor | null> {
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

  async function resolveDoctorContext(
    actor: VerifiedActor,
    db: Firestore,
  ): Promise<
    | { ok: true; ctx: DoctorAccessContext }
    | { ok: false; code: string; statusCode: number; doctorStatus?: string }
  > {
    const docSnap = await db.doc(`doctor_profiles/${actor.uid}`).get();
    if (docSnap.exists) {
      const profile = docSnap.data() as Record<string, unknown>;
      const status = String(profile.status || '');
      if (status !== 'Approved') {
        return {
          ok: false,
          code: 'DOCTOR_NOT_APPROVED',
          statusCode: 403,
          doctorStatus: status,
        };
      }
      const instId =
        typeof profile.institutionId === 'string' && profile.institutionId
          ? profile.institutionId
          : `inst_clinic_${actor.uid}`;
      const instSnap = await db.doc(`institutions/${instId}`).get();
      return {
        ok: true,
        ctx: {
          actor,
          actorRole: 'doctor',
          doctorUid: actor.uid,
          institutionId: instId,
          permissions: ALL_PERMISSIONS,
          doctorProfile: serializeDocData({ ...profile, uid: actor.uid, institutionId: instId }),
          institution: instSnap.exists ? serializeDocData(instSnap.data() as Record<string, unknown>) : null,
        },
      };
    }

    // Strict portal separation: Secretaries operate exclusively in the standalone MEDORA Secretary Portal
    const secProfileSnap = await db.doc(`secretary_profiles/${actor.uid}`).get();
    if (secProfileSnap.exists) {
      return { ok: false, code: 'SECRETARY_USE_INDEPENDENT_PORTAL', statusCode: 403 };
    }

    return { ok: false, code: 'DOCTOR_ACCESS_DENIED', statusCode: 403 };
  }

  async function requireDoctorAccess(
    req: Request,
    res: Response,
    options?: {
      doctorOnly?: boolean;
      requiredPermission?: SecretaryPermissionKey;
    },
  ): Promise<DoctorAccessContext | null> {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({
        error: 'ADMIN_SDK_UNAVAILABLE',
        message: 'Server Admin SDK is required for verified clinical operations.',
      });
      return null;
    }

    const actor = await verifyAuthenticatedUser(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }

    const resolved = await resolveDoctorContext(actor, db);
    if (!resolved.ok) {
      res.status(resolved.statusCode).json({
        error: resolved.code,
        doctorStatus: resolved.doctorStatus || null,
      });
      return null;
    }

    const { ctx } = resolved;
    if (options?.doctorOnly && ctx.actorRole !== 'doctor') {
      res.status(403).json({ error: 'DOCTOR_ROLE_REQUIRED' });
      return null;
    }
    if (
      options?.requiredPermission &&
      ctx.actorRole !== 'doctor' &&
      !ctx.permissions.includes(options.requiredPermission)
    ) {
      res.status(403).json({
        error: 'MISSING_CLINIC_PERMISSION',
        requiredPermission: options.requiredPermission,
      });
      return null;
    }
    return ctx;
  }

  async function appendClinicAudit(
    db: Firestore,
    ctx: DoctorAccessContext,
    action: string,
    targetType: string,
    targetId: string,
    details: string,
  ) {
    const logId = safeId('dlog');
    try {
      await db.doc(`doctor_audit_logs/${logId}`).set({
        logId,
        doctorUid: ctx.doctorUid,
        institutionId: ctx.institutionId,
        actorUid: ctx.actor.uid,
        actorName: ctx.actor.name,
        actorRole: ctx.actorRole,
        action: normalizeStr(action, 100),
        targetType: normalizeStr(targetType, 60),
        targetId: normalizeStr(targetId, 128),
        details: normalizeStr(details, 500),
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.warn('[MEDORA][DoctorAudit] warning:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Public Patient-Facing Doctor Directory & Atomic Booking
  // ---------------------------------------------------------------------------
  router.get('/doctors/public', async (_req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'DIRECTORY_SERVICE_UNAVAILABLE', doctors: [] });
      return;
    }
    try {
      const [profilesSnap, instSnap] = await Promise.all([
        db.collection('doctor_profiles').where('status', '==', 'Approved').limit(120).get(),
        db.collection('institutions').where('type', '==', 'clinic').limit(200).get(),
      ]);

      const instStatusMap = new Map<string, string>();
      instSnap.docs.forEach((doc) => {
        instStatusMap.set(doc.id, String(doc.data()?.status || ''));
      });

      const approvedDocs = profilesSnap.docs.filter((docSnap) => {
        const instId = normalizeStr(docSnap.data()?.institutionId, 128);
        if (!instId) return true;
        const st = instStatusMap.get(instId);
        return !st || st === 'active';
      });

      const cards = await Promise.all(
        approvedDocs.map(async (docSnap) => {
          const data = serializeDocData(docSnap.data() as Record<string, unknown>);
          const doctorUid = docSnap.id;
          const slotsSnap = await db
            .collection('appointment_slots')
            .where('doctorUid', '==', doctorUid)
            .limit(200)
            .get();
          const slotMap = new Map<string, number>();
          slotsSnap.docs.forEach((s) => {
            const sd = s.data();
            slotMap.set(s.id, typeof sd.bookedCount === 'number' ? sd.bookedCount : 0);
          });

          const generated = generateAvailableSlotsForRange(doctorUid, data, slotMap, 7);
          const openSlots = generated.filter((s) => s.available);
          const cardBase = buildPublicDoctorCardPayload(doctorUid, data);
          const { status: _s, updatedAt: _u, ...publicFields } = cardBase;

          return {
            ...publicFields,
            hasAvailableSlots: openSlots.length > 0,
            nextAvailableDate: openSlots[0]?.date || null,
            nextAvailableTime: openSlots[0]?.time || null,
            availableSlotsCount: openSlots.length,
          };
        }),
      );

      res.json({ doctors: cards });
    } catch (err) {
      console.error('[MEDORA][PublicDirectory] error:', err);
      res.status(500).json({ error: 'DIRECTORY_FETCH_FAILED', doctors: [] });
    }
  });

  router.get('/doctors/:doctorUid/public', async (req, res) => {
    const db = deps.getAdminDb();
    const doctorUid = normalizeStr(req.params.doctorUid, 128);
    if (!db || !deps.isFirestoreAdminReady() || !doctorUid) {
      res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
      return;
    }
    try {
      const docSnap = await db.doc(`doctor_profiles/${doctorUid}`).get();
      if (!docSnap.exists || docSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }
      const data = serializeDocData(docSnap.data() as Record<string, unknown>);
      const [slotsSnap, reviewsSnap] = await Promise.all([
        db
          .collection('appointment_slots')
          .where('doctorUid', '==', doctorUid)
          .limit(250)
          .get(),
        db
          .collection('doctor_reviews')
          .where('doctorUid', '==', doctorUid)
          .limit(100)
          .get(),
      ]);
      const slotMap = new Map<string, number>();
      slotsSnap.docs.forEach((s) => {
        const sd = s.data();
        slotMap.set(s.id, typeof sd.bookedCount === 'number' ? sd.bookedCount : 0);
      });

      const approvedReviews = reviewsSnap.docs
        .map((r) => serializeDocData(r.data() as Record<string, unknown>))
        .filter((r) => r.status === 'approved')
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const avgRating =
        approvedReviews.length > 0
          ? Math.round(
              (approvedReviews.reduce((acc, r) => acc + Number(r.rating || 0), 0) /
                approvedReviews.length) *
                10,
            ) / 10
          : typeof data.averageRating === 'number'
            ? data.averageRating
            : 0;

      const slots = generateAvailableSlotsForRange(doctorUid, data, slotMap, 14);
      const openSlots = slots.filter((s) => s.available);
      const cardBase = buildPublicDoctorCardPayload(doctorUid, data);
      const { status: _s, updatedAt: _u, ...publicFields } = cardBase;

      res.json({
        doctor: {
          ...publicFields,
          averageRating: avgRating,
          reviewCount: approvedReviews.length,
          hasAvailableSlots: openSlots.length > 0,
          nextAvailableDate: openSlots[0]?.date || null,
          nextAvailableTime: openSlots[0]?.time || null,
          availableSlotsCount: openSlots.length,
        },
        slots,
        reviews: approvedReviews,
      });
    } catch (err) {
      console.error('[MEDORA][PublicDoctorDetail] error:', err);
      res.status(500).json({ error: 'DOCTOR_DETAIL_FAILED' });
    }
  });

  // Atomic Patient/Public Appointment Booking with Firestore Transaction Double-Booking Prevention
  router.post('/appointments/book', async (req, res) => {
    const db = deps.getAdminDb();
    if (!db || !deps.isFirestoreAdminReady()) {
      res.status(503).json({ error: 'BOOKING_SERVICE_UNAVAILABLE' });
      return;
    }
    const actor = await verifyAuthenticatedUser(req);
    if (!actor) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return;
    }

    const doctorUid = normalizeStr(req.body?.doctorUid, 128);
    const date = normalizeStr(req.body?.date, 20);
    const time = normalizeStr(req.body?.time, 10);
    const patientName = normalizeStr(req.body?.patientName, 120) || actor.name;
    const patientPhone = normalizeStr(req.body?.patientPhone, 32);
    const reason = normalizeStr(req.body?.reason, 300);

    if (
      !doctorUid ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(time) ||
      patientName.length < 2 ||
      patientPhone.length < 6
    ) {
      res.status(400).json({ error: 'INVALID_BOOKING_INPUT' });
      return;
    }

    try {
      const doctorSnap = await db.doc(`doctor_profiles/${doctorUid}`).get();
      if (!doctorSnap.exists || doctorSnap.data()?.status !== 'Approved') {
        res.status(404).json({ error: 'DOCTOR_NOT_FOUND' });
        return;
      }

      const doctorData = doctorSnap.data() as Record<string, unknown>;
      const schedule = getNormalizedSchedule(doctorData);
      const winCheck = validateScheduleSlotWindow(schedule, date, time);
      if (!winCheck.ok) {
        res.status(409).json({ error: winCheck.error });
        return;
      }

      const slotKey = `${doctorUid}_${date}_${time}`;
      const appointmentId = safeId('apt');
      const institutionId =
        typeof doctorData.institutionId === 'string' && doctorData.institutionId
          ? doctorData.institutionId
          : `inst_clinic_${doctorUid}`;
      const initialStatus =
        doctorData.bookingConfirmationMode === 'auto' ? 'confirmed' : 'pending';
      const patientRecordId = `pat_${doctorUid}_${actor.uid}`;

      // Pre-load patient user profile if available for richer clinic chart linkage
      const userSnap = await db.doc(`users/${actor.uid}`).get();
      const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};

      let assignedQueueNumber = 1;
      await db.runTransaction(async (tx) => {
        const slotRef = db.doc(`appointment_slots/${slotKey}`);
        const dayApptsQuery = db
          .collection('appointments')
          .where('doctorUid', '==', doctorUid)
          .where('date', '==', date)
          .limit(200);

        const [slotSnap, dayApptsSnap, patSnap] = await Promise.all([
          tx.get(slotRef),
          tx.get(dayApptsQuery),
          tx.get(db.doc(`doctor_patients/${patientRecordId}`)),
        ]);

        const existingCount = slotSnap.exists ? Number(slotSnap.data()?.bookedCount || 0) : 0;
        const capacity = schedule.maxPatientsPerPeriod;

        if (existingCount >= capacity) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        const activeDayCount = dayApptsSnap.docs.filter((d) => {
          const st = String(d.data()?.status || '');
          return st === 'pending' || st === 'confirmed' || st === 'checked_in' || st === 'completed';
        }).length;
        assignedQueueNumber = activeDayCount + 1;

        const existingIds = Array.isArray(slotSnap.data()?.activeAppointmentIds)
          ? (slotSnap.data()!.activeAppointmentIds as string[])
          : [];

        const patRef = db.doc(`doctor_patients/${patientRecordId}`);
        if (!patSnap.exists) {
          tx.set(patRef, {
            patientRecordId,
            fileNumber: generateFileNumber(),
            doctorUid,
            institutionId,
            linkedPatientUid: actor.uid,
            fullName: patientName,
            phone: patientPhone,
            ...(typeof userData.dateOfBirth === 'string' && userData.dateOfBirth
              ? { dateOfBirth: userData.dateOfBirth }
              : {}),
            ...(userData.gender === 'male' || userData.gender === 'female'
              ? { gender: userData.gender }
              : {}),
            ...(typeof userData.address === 'string' && userData.address
              ? { address: userData.address }
              : {}),
            totalVisits: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(patRef, {
            linkedPatientUid: actor.uid,
            phone: patientPhone,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.set(slotRef, {
          slotKey,
          doctorUid,
          date,
          time,
          capacity,
          bookedCount: existingCount + 1,
          activeAppointmentIds: [...existingIds, appointmentId],
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(db.doc(`appointments/${appointmentId}`), {
          appointmentId,
          doctorUid,
          institutionId,
          patientUid: actor.uid,
          patientRecordId,
          patientName,
          patientPhone,
          date,
          time,
          durationMinutes: schedule.consultationDurationMinutes,
          slotKey,
          queueNumber: assignedQueueNumber,
          status: initialStatus,
          visitType: 'scheduled',
          isWaitlist: false,
          reason,
          feeAmount: typeof doctorData.consultationFee === 'number' ? doctorData.consultationFee : 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      const docDisplayName = normalizeStr(doctorData.fullName, 120) || 'MEDORA Physician';
      await emitPatientNotification(db, {
        patientUid: actor.uid,
        type: 'appointment',
        eventType: initialStatus === 'confirmed' ? 'appointment_confirmed' : 'appointment_updated',
        title: initialStatus === 'confirmed' ? `تم تأكيد موعدك مع ${docDisplayName}` : `تم استلام طلب حجزك مع ${docDisplayName}`,
        body: `التاريخ ${date} الساعة ${time} · رقم الانتظار #${assignedQueueNumber}`,
        relatedId: appointmentId,
        relatedType: 'appointment',
        idempotencyKey: `pat_book:${appointmentId}`,
      });

      const docNotifPrefs = (doctorData.notificationPrefs || {}) as Record<string, unknown>;
      const engine = getGlobalNotificationEngine();
      if (engine && docNotifPrefs.newBookings !== false) {
        await engine
          .dispatch({
            eventType: 'appointment_booked',
            recipientUid: doctorUid,
            recipientRole: 'doctor',
            title: `حجز موعد جديد (${patientName})`,
            body: `التاريخ ${date} الساعة ${time} · رقم الانتظار #${assignedQueueNumber}`,
            inAppType: 'appointment',
            relatedId: appointmentId,
            relatedType: 'appointment',
            idempotencyKey: `doc_book:${appointmentId}`,
            placeholders: {
              refCode: appointmentId.slice(0, 16).toUpperCase(),
              statusLabel: initialStatus === 'confirmed' ? 'مؤكد' : 'قيد الانتظار',
              dateLabel: date,
            },
          })
          .catch(() => undefined);
      }

      const createdSnap = await db.doc(`appointments/${appointmentId}`).get();
      res.status(201).json({
        ok: true,
        appointment: serializeDocData(createdSnap.data() as Record<string, unknown>),
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'SLOT_ALREADY_BOOKED') {
        res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });
        return;
      }
      console.error('[MEDORA][PublicBook] error:', err);
      res.status(500).json({ error: 'BOOKING_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Doctor Workspace Hydration
  // ---------------------------------------------------------------------------
  router.get('/doctor/workspace', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res);
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const canViewAppts = ctx.actorRole === 'doctor' || ctx.permissions.includes('viewAppointments') || ctx.permissions.includes('manageAppointments');
    const canViewPatientsBasic = ctx.actorRole === 'doctor' || ctx.permissions.includes('viewPatientBasic') || ctx.permissions.includes('viewMedicalRecords');
    const canViewMedicalRecords = ctx.actorRole === 'doctor' || ctx.permissions.includes('viewMedicalRecords');
    const canViewDiagnostics = ctx.actorRole === 'doctor' || ctx.permissions.includes('viewMedicalRecords') || ctx.permissions.includes('uploadLabResults');
    const canViewMessages = ctx.actorRole === 'doctor' || ctx.permissions.includes('messagePatients');

    try {
      const [
        apptsSnap,
        patientsSnap,
        visitsSnap,
        rxSnap,
        diagSnap,
        convSnap,
        membersSnap,
        secProfilesSnap,
        logsSnap,
      ] = await Promise.all([
        canViewAppts
          ? db.collection('appointments').where('doctorUid', '==', ctx.doctorUid).limit(300).get()
          : Promise.resolve(null),
        canViewPatientsBasic
          ? db.collection('doctor_patients').where('doctorUid', '==', ctx.doctorUid).limit(300).get()
          : Promise.resolve(null),
        canViewMedicalRecords
          ? db.collection('patient_visits').where('doctorUid', '==', ctx.doctorUid).limit(300).get()
          : Promise.resolve(null),
        canViewMedicalRecords
          ? db.collection('prescriptions').where('doctorUid', '==', ctx.doctorUid).limit(300).get()
          : Promise.resolve(null),
        canViewDiagnostics
          ? db.collection('diagnostic_orders').where('doctorUid', '==', ctx.doctorUid).limit(300).get()
          : Promise.resolve(null),
        canViewMessages
          ? db.collection('doctor_conversations').where('doctorUid', '==', ctx.doctorUid).limit(150).get()
          : Promise.resolve(null),
        ctx.actorRole === 'doctor'
          ? db.collection('institution_members').where('institutionId', '==', ctx.institutionId).limit(50).get()
          : Promise.resolve(null),
        ctx.actorRole === 'doctor'
          ? db.collection('secretary_profiles').limit(100).get()
          : Promise.resolve(null),
        ctx.actorRole === 'doctor'
          ? db.collection('doctor_audit_logs').where('doctorUid', '==', ctx.doctorUid).limit(150).get()
          : Promise.resolve(null),
      ]);

      const appointments = (apptsSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

      const patients = (patientsSnap?.docs || [])
        .map((d) => {
          const p = serializeDocData(d.data() as Record<string, unknown>);
          if (!canViewMedicalRecords) {
            delete p.allergies;
            delete p.chronicConditions;
            delete p.notesSummary;
          }
          return p;
        })
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const visits = (visitsSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || '')));

      const prescriptions = (rxSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const diagnostics = (diagSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      const conversations = (convSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));

      // Build clinic staff list including incoming secretary applicants whose targetInstitutionName or invitationCode matches clinic
      const clinicNameLower = normalizeStr(ctx.doctorProfile.clinicName, 160).toLowerCase();
      const memberByUid = new Map<string, Record<string, unknown>>();
      (membersSnap?.docs || []).forEach((mDoc) => {
        const md = serializeDocData(mDoc.data() as Record<string, unknown>);
        if (md.role !== 'owner' && typeof md.uid === 'string') {
          memberByUid.set(md.uid, md);
        }
      });

      const staffMembers: Record<string, unknown>[] = [];
      for (const [uid, md] of memberByUid.entries()) {
        const secDoc = secProfilesSnap?.docs.find((s) => s.id === uid);
        const secData = secDoc ? serializeDocData(secDoc.data() as Record<string, unknown>) : {};
        const userSnap = await db.doc(`users/${uid}`).get();
        const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
        staffMembers.push({
          memberId: md.memberId,
          institutionId: ctx.institutionId,
          uid,
          fullName: normalizeStr(secData.fullName || userData.fullName || userData.googleName, 120) || 'Secretary Applicant',
          email: normalizeStr(userData.email, 254),
          phone: normalizeStr(secData.phone || userData.phone, 32),
          educationQualification: normalizeStr(secData.educationQualification, 160),
          previousExperience: normalizeStr(secData.previousExperience, 400),
          role: md.role || 'secretary',
          status: md.status || 'pending_approval',
          permissions: Array.isArray(md.permissions) ? md.permissions : [],
          createdAt: md.createdAt || null,
          updatedAt: md.updatedAt || null,
        });
      }

      // Also surface pending secretary profiles targeting this clinic by name or institutionId
      for (const sDoc of secProfilesSnap?.docs || []) {
        const sd = serializeDocData(sDoc.data() as Record<string, unknown>);
        if (memberByUid.has(sDoc.id)) continue;
        const target = normalizeStr(sd.targetInstitutionName, 160).toLowerCase();
        const invite = normalizeStr(sd.invitationCode, 64);
        const matchesClinic =
          (clinicNameLower && target && (target.includes(clinicNameLower) || clinicNameLower.includes(target))) ||
          invite === ctx.institutionId;
        if (matchesClinic && (sd.status === 'Submitted' || sd.status === 'Under Review')) {
          const userSnap = await db.doc(`users/${sDoc.id}`).get();
          const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {};
          staffMembers.push({
            memberId: `mem_sec_${sDoc.id}`,
            institutionId: ctx.institutionId,
            uid: sDoc.id,
            fullName: normalizeStr(sd.fullName || userData.fullName, 120) || 'Secretary Applicant',
            email: normalizeStr(userData.email, 254),
            phone: normalizeStr(sd.phone, 32),
            educationQualification: normalizeStr(sd.educationQualification, 160),
            previousExperience: normalizeStr(sd.previousExperience, 400),
            role: 'secretary',
            status: 'pending_approval',
            permissions: [],
            createdAt: sd.createdAt || null,
            updatedAt: sd.updatedAt || null,
          });
        }
      }

      const auditLogs = (logsSnap?.docs || [])
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

      // Resolve patient-consented personal files ONLY where unrevoked & unexpired
      const sharedPatientFiles: Array<Record<string, unknown>> = [];
      if (canViewMedicalRecords) {
        const sharesSnap = await db
          .collection('medical_record_shares')
          .where('doctorUid', '==', ctx.doctorUid)
          .where('revoked', '==', false)
          .limit(100)
          .get();
        const nowIso = new Date().toISOString();
        const activeShares = sharesSnap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((s) => {
            const perms = (s.permissions as Record<string, unknown> | undefined) || {};
            if (perms.uploadedFiles !== true) return false;
            if (typeof s.expiresAt === 'string' && s.expiresAt && s.expiresAt < nowIso) return false;
            return true;
          });

        for (const sh of activeShares) {
          const pUid = String(sh.patientUid || '');
          if (!pUid) continue;
          const filesSnap = await db
            .collection('patient_medical_files')
            .where('patientUid', '==', pUid)
            .limit(40)
            .get();
          const ptMatch = patients.find((pt) => pt.linkedPatientUid === pUid);
          const ptName =
            typeof ptMatch?.fullName === 'string' && ptMatch.fullName
              ? ptMatch.fullName
              : normalizeStr(sh.patientName, 120) || 'MEDORA Patient';
          filesSnap.docs.forEach((fd) => {
            const fData = serializeDocData(fd.data() as Record<string, unknown>);
            sharedPatientFiles.push({
              ...fData,
              patientName: ptName,
              expiresAt: sh.expiresAt || null,
            });
          });
        }
      }

      const promotionalAdStatus = 'none' as const;

      res.json({
        actorRole: ctx.actorRole,
        permissions: ctx.permissions,
        doctorProfile: {
          ...ctx.doctorProfile,
          workingSchedule: getNormalizedSchedule(ctx.doctorProfile),
        },
        promotionalAdStatus,
        institution: ctx.institution,
        appointments,
        patients,
        visits,
        prescriptions,
        diagnostics,
        conversations,
        staffMembers,
        auditLogs,
        sharedPatientFiles,
      });
    } catch (err) {
      console.error('[MEDORA][DoctorWorkspace] error:', err);
      res.status(500).json({ error: 'DOCTOR_WORKSPACE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Appointments & Atomic Slot Locks
  // ---------------------------------------------------------------------------
  router.post('/doctor/appointments', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'manageAppointments' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patientName = normalizeStr(req.body?.patientName, 120);
    const patientPhone = normalizeStr(req.body?.patientPhone, 32);
    const patientRecordIdInput = normalizeStr(req.body?.patientRecordId, 128);
    const date = normalizeStr(req.body?.date, 20);
    const time = normalizeStr(req.body?.time, 10);
    const visitType = ['scheduled', 'walk_in', 'follow_up'].includes(req.body?.visitType)
      ? req.body.visitType
      : 'scheduled';
    const isWaitlist = Boolean(req.body?.isWaitlist);
    const reason = normalizeStr(req.body?.reason, 300);

    if (!patientName || !patientPhone || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      res.status(400).json({ error: 'INVALID_APPOINTMENT_INPUT' });
      return;
    }

    const schedule = getNormalizedSchedule(ctx.doctorProfile);
    const slotKey = `${ctx.doctorUid}_${date}_${time}`;
    const appointmentId = safeId('apt');
    const resolvedPatientId = patientRecordIdInput || safeId(`pat_${ctx.doctorUid.slice(0, 8)}`);

    try {
      await db.runTransaction(async (tx) => {
        const slotRef = db.doc(`appointment_slots/${slotKey}`);
        const slotSnap = await tx.get(slotRef);
        const bookedCount = slotSnap.exists ? Number(slotSnap.data()?.bookedCount || 0) : 0;
        const capacity = schedule.maxPatientsPerPeriod;

        if (!isWaitlist && bookedCount >= capacity) {
          throw new Error('SLOT_ALREADY_BOOKED');
        }

        const patRef = db.doc(`doctor_patients/${resolvedPatientId}`);
        const patSnap = await tx.get(patRef);
        if (!patSnap.exists) {
          tx.set(patRef, {
            patientRecordId: resolvedPatientId,
            fileNumber: generateFileNumber(),
            doctorUid: ctx.doctorUid,
            institutionId: ctx.institutionId,
            fullName: patientName,
            phone: patientPhone,
            totalVisits: 0,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (!isWaitlist) {
          const existingIds = Array.isArray(slotSnap.data()?.activeAppointmentIds)
            ? (slotSnap.data()!.activeAppointmentIds as string[])
            : [];
          tx.set(slotRef, {
            slotKey,
            doctorUid: ctx.doctorUid,
            date,
            time,
            capacity,
            bookedCount: bookedCount + 1,
            activeAppointmentIds: [...existingIds, appointmentId],
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.set(db.doc(`appointments/${appointmentId}`), {
          appointmentId,
          doctorUid: ctx.doctorUid,
          institutionId: ctx.institutionId,
          patientRecordId: resolvedPatientId,
          patientName,
          patientPhone,
          date,
          time,
          durationMinutes: schedule.consultationDurationMinutes,
          slotKey,
          status: isWaitlist ? 'pending' : 'confirmed',
          visitType,
          isWaitlist,
          reason,
          feeAmount: typeof ctx.doctorProfile.consultationFee === 'number' ? ctx.doctorProfile.consultationFee : 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      await appendClinicAudit(
        db,
        ctx,
        'APPOINTMENT_CREATED',
        'appointments',
        appointmentId,
        `Created ${isWaitlist ? 'waitlist ' : ''}appointment for ${patientName} on ${date} ${time}`,
      );

      const docEngine = getGlobalNotificationEngine();
      const docNotifPrefs = (ctx.doctorProfile.notificationPrefs || {}) as Record<string, unknown>;
      if (docEngine && docNotifPrefs.newBookings !== false && ctx.actor.uid !== ctx.doctorUid) {
        await docEngine
          .dispatch({
            eventType: 'appointment_booked',
            recipientUid: ctx.doctorUid,
            recipientRole: 'doctor',
            title: `موعد جديد مسجل في العيادة (${patientName})`,
            body: `التاريخ ${date} الساعة ${time}`,
            inAppType: 'appointment',
            relatedId: appointmentId,
            relatedType: 'appointment',
            idempotencyKey: `doc_create:${appointmentId}`,
            placeholders: {
              refCode: appointmentId.slice(0, 16).toUpperCase(),
              statusLabel: isWaitlist ? 'انتظار' : 'مؤكد',
              dateLabel: date,
            },
          })
          .catch(() => undefined);
      }

      const created = await db.doc(`appointments/${appointmentId}`).get();
      res.status(201).json({ ok: true, appointment: serializeDocData(created.data()) });
    } catch (err) {
      if (err instanceof Error && err.message === 'SLOT_ALREADY_BOOKED') {
        res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });
        return;
      }
      console.error('[MEDORA][CreateAppointment] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_CREATE_FAILED' });
    }
  });

  router.patch('/doctor/appointments/:appointmentId', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'manageAppointments' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const appointmentId = normalizeStr(req.params.appointmentId, 128);
    const nextStatus = normalizeStr(req.body?.status, 32);
    const newDate = normalizeStr(req.body?.date, 20);
    const newTime = normalizeStr(req.body?.time, 10);
    const promoteFromWaitlist = req.body?.promoteFromWaitlist === true;
    const cancelledReason = normalizeStr(req.body?.cancelledReason, 300);

    const allowedStatuses = new Set([
      'pending',
      'confirmed',
      'checked_in',
      'completed',
      'cancelled',
      'rejected',
      'no_show',
    ]);
    const freeingStatuses = new Set(['cancelled', 'rejected', 'no_show']);

    if (!appointmentId) {
      res.status(400).json({ error: 'INVALID_APPOINTMENT_ID' });
      return;
    }
    if (nextStatus && !allowedStatuses.has(nextStatus)) {
      res.status(400).json({ error: 'INVALID_APPOINTMENT_STATUS' });
      return;
    }

    const schedule = getNormalizedSchedule(ctx.doctorProfile);

    try {
      await db.runTransaction(async (tx) => {
        const aptRef = db.doc(`appointments/${appointmentId}`);
        const aptSnap = await tx.get(aptRef);
        if (!aptSnap.exists) {
          throw new Error('APPOINTMENT_NOT_FOUND');
        }
        const current = aptSnap.data() as Record<string, unknown>;
        if (current.doctorUid !== ctx.doctorUid) {
          throw new Error('FORBIDDEN_CLINIC_RESOURCE');
        }

        const oldDate = String(current.date || '');
        const oldTime = String(current.time || '');
        const oldSlotKey = String(current.slotKey || `${ctx.doctorUid}_${oldDate}_${oldTime}`);
        const oldStatus = String(current.status || 'pending');
        const wasWaitlist = Boolean(current.isWaitlist);
        const wasHoldingSlot = !wasWaitlist && !freeingStatuses.has(oldStatus);

        const targetDate = newDate && /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? newDate : oldDate;
        const targetTime = newTime && /^\d{2}:\d{2}$/.test(newTime) ? newTime : oldTime;
        const targetSlotKey = `${ctx.doctorUid}_${targetDate}_${targetTime}`;
        const targetStatus = nextStatus || oldStatus;
        const targetWaitlist = promoteFromWaitlist ? false : wasWaitlist;
        const shouldHoldSlot = !targetWaitlist && !freeingStatuses.has(targetStatus);
        const slotChanged = oldSlotKey !== targetSlotKey;

        // Read slots before writes
        const oldSlotRef = db.doc(`appointment_slots/${oldSlotKey}`);
        const newSlotRef = db.doc(`appointment_slots/${targetSlotKey}`);
        const oldSlotSnap = await tx.get(oldSlotRef);
        const newSlotSnap = slotChanged ? await tx.get(newSlotRef) : oldSlotSnap;

        if (shouldHoldSlot && (!wasHoldingSlot || slotChanged)) {
          const newCount = newSlotSnap.exists ? Number(newSlotSnap.data()?.bookedCount || 0) : 0;
          if (newCount >= schedule.maxPatientsPerPeriod) {
            throw new Error('SLOT_ALREADY_BOOKED');
          }
          const newIds = Array.isArray(newSlotSnap.data()?.activeAppointmentIds)
            ? (newSlotSnap.data()!.activeAppointmentIds as string[])
            : [];
          const nextIds = newIds.includes(appointmentId) ? newIds : [...newIds, appointmentId];
          tx.set(newSlotRef, {
            slotKey: targetSlotKey,
            doctorUid: ctx.doctorUid,
            date: targetDate,
            time: targetTime,
            capacity: schedule.maxPatientsPerPeriod,
            bookedCount: newIds.includes(appointmentId) ? newCount : newCount + 1,
            activeAppointmentIds: nextIds,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        if (wasHoldingSlot && (!shouldHoldSlot || slotChanged) && oldSlotSnap.exists) {
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

        const patch: Record<string, unknown> = {
          date: targetDate,
          time: targetTime,
          slotKey: targetSlotKey,
          status: targetStatus,
          isWaitlist: targetWaitlist,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (cancelledReason) patch.cancelledReason = cancelledReason;
        tx.update(aptRef, patch);
      });

      await appendClinicAudit(
        db,
        ctx,
        'APPOINTMENT_UPDATED',
        'appointments',
        appointmentId,
        `Updated appointment ${appointmentId} (status=${nextStatus || 'unchanged'}, date=${newDate || 'unchanged'}, time=${newTime || 'unchanged'})`,
      );

      const updated = await db.doc(`appointments/${appointmentId}`).get();
      const updatedData = updated.data() as Record<string, unknown> | undefined;
      if (updatedData && typeof updatedData.patientUid === 'string' && updatedData.patientUid) {
        const docTitleName = normalizeStr(ctx.doctorProfile.fullName, 120) || 'العيادة';
        const statusAr: Record<string, string> = {
          confirmed: 'تم تأكيد موعدك',
          rejected: 'تم رفض طلب الموعد',
          cancelled: 'تم إلغاء الموعد من العيادة',
          completed: 'اكتملت زيارتك الطبية — يمكنك تقييم الطبيب الآن',
          checked_in: 'تم تسجيل حضورك في العيادة',
          no_show: 'تم تسجيل عدم الحضور للموعد',
        };
        const nextSt = String(updatedData.status || '');
        const notifTitle = statusAr[nextSt] || `تحديث على موعدك مع ${docTitleName}`;
        const patientAptEvent =
          nextSt === 'confirmed'
            ? 'appointment_confirmed'
            : nextSt === 'cancelled' || nextSt === 'rejected'
              ? 'appointment_cancelled'
              : newDate || newTime
                ? 'appointment_rescheduled'
                : 'appointment_updated';
        await emitPatientNotification(db, {
          patientUid: updatedData.patientUid,
          type: 'appointment',
          eventType: patientAptEvent,
          title: `${notifTitle} (${docTitleName})`,
          body: `${updatedData.date} · ${updatedData.time}${cancelledReason ? ` — ${cancelledReason}` : ''}`,
          relatedId: appointmentId,
          relatedType: 'appointment',
          idempotencyKey: `pat_apt_upd:${appointmentId}:${nextSt}:${String(updatedData.date || '')}_${String(updatedData.time || '')}`,
        });
      }

      const docNotifPrefsUpd = (ctx.doctorProfile.notificationPrefs || {}) as Record<string, unknown>;
      const updEngine = getGlobalNotificationEngine();
      if (
        updatedData &&
        updEngine &&
        ctx.actor.uid !== ctx.doctorUid &&
        docNotifPrefsUpd.newBookings !== false &&
        (nextStatus === 'cancelled' || nextStatus === 'rejected' || Boolean(newDate) || Boolean(newTime))
      ) {
        const isCancel = nextStatus === 'cancelled' || nextStatus === 'rejected';
        await updEngine
          .dispatch({
            eventType: isCancel ? 'appointment_cancelled' : 'appointment_rescheduled',
            recipientUid: ctx.doctorUid,
            recipientRole: 'doctor',
            title: isCancel
              ? `إلغاء موعد (${String(updatedData.patientName || '')})`
              : `تعديل موعد عيادة (${String(updatedData.patientName || '')})`,
            body: `${String(updatedData.date || '')} · ${String(updatedData.time || '')} — بواسطة ${ctx.actor.name}`,
            inAppType: 'appointment',
            relatedId: appointmentId,
            relatedType: 'appointment',
            idempotencyKey: `doc_apt_upd:${appointmentId}:${String(updatedData.status || '')}:${String(updatedData.date || '')}_${String(updatedData.time || '')}`,
            placeholders: {
              refCode: appointmentId.slice(0, 16).toUpperCase(),
              statusLabel: isCancel ? 'ملغى' : 'معاد جدولته',
              dateLabel: String(updatedData.date || ''),
            },
          })
          .catch(() => undefined);
      }

      res.json({ ok: true, appointment: serializeDocData(updatedData) });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'APPOINTMENT_NOT_FOUND') {
          res.status(404).json({ error: 'APPOINTMENT_NOT_FOUND' });
          return;
        }
        if (err.message === 'FORBIDDEN_CLINIC_RESOURCE') {
          res.status(403).json({ error: 'FORBIDDEN' });
          return;
        }
        if (err.message === 'SLOT_ALREADY_BOOKED') {
          res.status(409).json({ error: 'SLOT_ALREADY_BOOKED' });
          return;
        }
      }
      console.error('[MEDORA][UpdateAppointment] error:', err);
      res.status(500).json({ error: 'APPOINTMENT_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Working Schedule, Breaks & Holidays
  // ---------------------------------------------------------------------------
  router.put('/doctor/schedule', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'editClinicSchedule' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const workingSchedule = getNormalizedSchedule({
      workingSchedule: req.body?.workingSchedule,
      consultationDurationMinutes: req.body?.workingSchedule?.consultationDurationMinutes,
    });

    try {
      const docRef = db.doc(`doctor_profiles/${ctx.doctorUid}`);
      await docRef.update({
        workingSchedule,
        consultationDurationMinutes: workingSchedule.consultationDurationMinutes,
        hourlyAppointmentLimit: Math.max(
          1,
          Math.min(60, Math.floor(60 / workingSchedule.consultationDurationMinutes) * workingSchedule.maxPatientsPerPeriod),
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const refreshed = await docRef.get();
      await syncPublicDoctorCard(db, ctx.doctorUid, refreshed.data() as Record<string, unknown>);
      await appendClinicAudit(db, ctx, 'SCHEDULE_UPDATED', 'doctor_profiles', ctx.doctorUid, 'Updated clinic working schedule & holidays');

      res.json({ ok: true, workingSchedule });
    } catch (err) {
      console.error('[MEDORA][UpdateSchedule] error:', err);
      res.status(500).json({ error: 'SCHEDULE_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Patients & Visits (Clinical EHR)
  // ---------------------------------------------------------------------------
  router.post('/doctor/patients', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'viewPatientBasic' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const fullName = normalizeStr(req.body?.fullName, 120);
    const phone = normalizeStr(req.body?.phone, 32);
    const dateOfBirth = normalizeStr(req.body?.dateOfBirth, 20);
    const gender = req.body?.gender === 'female' ? 'female' : req.body?.gender === 'male' ? 'male' : undefined;
    const bloodType = normalizeStr(req.body?.bloodType, 10);
    const allergies = normalizeStr(req.body?.allergies, 300);
    const chronicConditions = normalizeStr(req.body?.chronicConditions, 400);
    const address = normalizeStr(req.body?.address, 240);

    if (fullName.length < 2 || phone.length < 6) {
      res.status(400).json({ error: 'INVALID_PATIENT_INPUT' });
      return;
    }

    const canWriteMedical = ctx.actorRole === 'doctor' || ctx.permissions.includes('viewMedicalRecords');
    const patientRecordId = safeId(`pat_${ctx.doctorUid.slice(0, 8)}`);
    const payload: Record<string, unknown> = {
      patientRecordId,
      fileNumber: generateFileNumber(),
      doctorUid: ctx.doctorUid,
      institutionId: ctx.institutionId,
      fullName,
      phone,
      dateOfBirth,
      ...(gender ? { gender } : {}),
      bloodType,
      allergies: canWriteMedical ? allergies : '',
      chronicConditions: canWriteMedical ? chronicConditions : '',
      address,
      totalVisits: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    try {
      await db.doc(`doctor_patients/${patientRecordId}`).set(payload);
      await appendClinicAudit(db, ctx, 'PATIENT_CREATED', 'doctor_patients', patientRecordId, `Registered patient ${fullName}`);
      const saved = await db.doc(`doctor_patients/${patientRecordId}`).get();
      res.status(201).json({ ok: true, patient: serializeDocData(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][CreatePatient] error:', err);
      res.status(500).json({ error: 'PATIENT_CREATE_FAILED' });
    }
  });

  router.post('/doctor/visits', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'viewMedicalRecords' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const visitDate = normalizeStr(req.body?.visitDate, 20) || getBaghdadNow().dateStr;
    const visitTime = normalizeStr(req.body?.visitTime, 10) || getBaghdadNow().timeStr;
    const visitReason = normalizeStr(req.body?.visitReason, 300);
    const chiefComplaintInput = normalizeStr(req.body?.chiefComplaint, 500);
    const chiefComplaint = chiefComplaintInput || visitReason;
    const diagnosis = normalizeStr(req.body?.diagnosis, 500);
    const clinicalNotes = normalizeStr(req.body?.clinicalNotes, 2000);
    const procedures = normalizeStr(req.body?.procedures, 800);
    const treatmentRecommendations = normalizeStr(req.body?.treatmentRecommendations, 1000);
    const appointmentId = normalizeStr(req.body?.appointmentId, 128);
    const clientSubmissionKey = normalizeStr(req.body?.clientSubmissionKey, 120);
    const vitals = req.body?.vitals && typeof req.body.vitals === 'object' ? req.body.vitals : {};
    type VisitAttachmentMeta = {
      name: string;
      size: number;
      mimeType: string;
      url: string;
      storagePath?: string;
      uploadedAtIso: string;
    };
    const rawAttachments: unknown[] = Array.isArray(req.body?.attachments)
      ? req.body.attachments.slice(0, 10)
      : [];
    const attachments: VisitAttachmentMeta[] = rawAttachments
      .map((item: unknown): VisitAttachmentMeta | null => {
        if (!item || typeof item !== 'object') return null;
        const f = item as Record<string, unknown>;
        const url = normalizeStr(f.url, 1400);
        if (!url || !isValidUploadedAssetUrl(url, normalizeStr(f.storagePath, 300))) return null;
        return {
          name: normalizeStr(f.name, 120) || 'Attachment',
          size: typeof f.size === 'number' ? f.size : 0,
          mimeType: normalizeStr(f.mimeType, 80) || 'application/octet-stream',
          url,
          ...(typeof f.storagePath === 'string' && f.storagePath
            ? { storagePath: normalizeStr(f.storagePath, 300) }
            : {}),
          uploadedAtIso: normalizeStr(f.uploadedAtIso, 60) || new Date().toISOString(),
        };
      })
      .filter((x: VisitAttachmentMeta | null): x is VisitAttachmentMeta => x !== null);

    if (!patientRecordId || !chiefComplaint) {
      res.status(400).json({ error: 'PATIENT_OR_COMPLAINT_REQUIRED' });
      return;
    }

    const rawCreateRx =
      req.body?.createPrescription && typeof req.body.createPrescription === 'object'
        ? (req.body.createPrescription as Record<string, unknown>)
        : null;
    const inlineRxMeds =
      rawCreateRx && Array.isArray(rawCreateRx.medications)
        ? (rawCreateRx.medications as Record<string, unknown>[])
            .map((m) => {
              const medicineId = normalizeStr(m?.medicineId, 128);
              return {
                ...(medicineId ? { medicineId } : {}),
                name: normalizeStr(m?.name, 160),
                dosage: normalizeStr(m?.dosage, 120),
                frequency: normalizeStr(m?.frequency, 120),
                duration: normalizeStr(m?.duration, 120),
                instructions: normalizeStr(m?.instructions, 300),
              };
            })
            .filter((m) => m.name.length > 0)
            .slice(0, 25)
        : [];

    if (inlineRxMeds.length > 0 && ctx.actorRole !== 'doctor') {
      res.status(403).json({ error: 'DOCTOR_ROLE_REQUIRED' });
      return;
    }

    try {
      if (clientSubmissionKey) {
        const dupSnap = await db
          .collection('patient_visits')
          .where('doctorUid', '==', ctx.doctorUid)
          .where('clientSubmissionKey', '==', clientSubmissionKey)
          .limit(1)
          .get();
        if (!dupSnap.empty) {
          const existingVisit = serializeDocData(dupSnap.docs[0].data() as Record<string, unknown>);
          let linkedPrescription: Record<string, unknown> | null = null;
          if (typeof existingVisit.linkedPrescriptionId === 'string' && existingVisit.linkedPrescriptionId) {
            const rxSnap = await db.doc(`prescriptions/${existingVisit.linkedPrescriptionId}`).get();
            if (rxSnap.exists) {
              linkedPrescription = serializeDocData(rxSnap.data() as Record<string, unknown>);
            }
          }
          res.status(200).json({ ok: true, visit: existingVisit, prescription: linkedPrescription, duplicate: true });
          return;
        }
      }

      const patRef = db.doc(`doctor_patients/${patientRecordId}`);
      const patSnap = await patRef.get();
      if (!patSnap.exists || patSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_PATIENT_RECORD' });
        return;
      }
      const patData = patSnap.data() as Record<string, unknown>;

      const visitId = safeId('vis');
      const prescriptionId = inlineRxMeds.length > 0 ? safeId('rx') : '';
      const batch = db.batch();
      batch.set(db.doc(`patient_visits/${visitId}`), {
        visitId,
        doctorUid: ctx.doctorUid,
        patientRecordId,
        ...(appointmentId ? { appointmentId } : {}),
        ...(clientSubmissionKey ? { clientSubmissionKey } : {}),
        visitDate,
        visitTime,
        visitReason: visitReason || chiefComplaint,
        chiefComplaint,
        diagnosis,
        clinicalNotes,
        procedures,
        treatmentRecommendations,
        vitals: {
          bloodPressure: normalizeStr(vitals.bloodPressure, 30),
          temperature: normalizeStr(vitals.temperature, 20),
          heartRate: normalizeStr(vitals.heartRate, 20),
          weightKg: normalizeStr(vitals.weightKg, 20),
        },
        attachments,
        ...(prescriptionId ? { linkedPrescriptionId: prescriptionId } : {}),
        createdByUid: ctx.actor.uid,
        createdByName: ctx.actor.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (prescriptionId) {
        batch.set(db.doc(`prescriptions/${prescriptionId}`), {
          prescriptionId,
          doctorUid: ctx.doctorUid,
          institutionId: ctx.institutionId,
          patientRecordId,
          patientName: normalizeStr(patData.fullName, 120),
          patientAge: normalizeStr(patData.dateOfBirth, 20),
          patientGender: normalizeStr(patData.gender, 20),
          visitId,
          doctorName: normalizeStr(ctx.doctorProfile.fullName, 120),
          doctorSpecialty: normalizeStr(ctx.doctorProfile.specialty, 120),
          clinicName: normalizeStr(ctx.doctorProfile.clinicName, 160),
          clinicAddress: normalizeStr(ctx.doctorProfile.workAddress, 240),
          clinicPhone: normalizeStr(ctx.doctorProfile.professionalPhone, 32),
          medications: inlineRxMeds,
          doctorNotes: normalizeStr(rawCreateRx?.doctorNotes, 1000),
          prescribedDate: normalizeStr(rawCreateRx?.prescribedDate, 20) || visitDate,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      batch.update(patRef, {
        totalVisits: FieldValue.increment(1),
        lastVisitAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await batch.commit();
      await appendClinicAudit(
        db,
        ctx,
        'VISIT_RECORDED',
        'patient_visits',
        visitId,
        `Added clinical visit for patient ${patientRecordId}${prescriptionId ? ` with prescription ${prescriptionId}` : ''}`,
      );

      if (typeof patData.linkedPatientUid === 'string' && patData.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: patData.linkedPatientUid,
          type: 'appointment',
          eventType: prescriptionId ? 'prescription_received' : 'appointment_updated',
          title: `تم إضافة زيارة طبية جديدة بواسطة ${normalizeStr(ctx.doctorProfile.fullName, 120)}`,
          body: `${visitDate}${visitTime ? ` · ${visitTime}` : ''} · ${diagnosis || chiefComplaint}${prescriptionId ? ' (مع وصفة طبية)' : ''}`.slice(0, 220),
          relatedId: prescriptionId || visitId,
          relatedType: prescriptionId ? 'prescription' : 'visit',
          idempotencyKey: `pat_visit:${visitId}`,
        });
      }

      const [savedVisitSnap, savedRxSnap] = await Promise.all([
        db.doc(`patient_visits/${visitId}`).get(),
        prescriptionId ? db.doc(`prescriptions/${prescriptionId}`).get() : Promise.resolve(null),
      ]);

      res.status(201).json({
        ok: true,
        visit: serializeDocData(savedVisitSnap.data()),
        ...(savedRxSnap?.exists ? { prescription: serializeDocData(savedRxSnap.data()) } : {}),
      });
    } catch (err) {
      console.error('[MEDORA][CreateVisit] error:', err);
      res.status(500).json({ error: 'VISIT_CREATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Electronic Prescriptions (NO QR Code / NO Verification Code)
  // ---------------------------------------------------------------------------
  router.post('/doctor/prescriptions', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const visitId = normalizeStr(req.body?.visitId, 128);
    const prescribedDate = normalizeStr(req.body?.prescribedDate, 20) || new Date().toISOString().slice(0, 10);
    const doctorNotes = normalizeStr(req.body?.doctorNotes, 1000);
    const rawMeds = Array.isArray(req.body?.medications) ? req.body.medications : [];

    const medications = rawMeds
      .map((m: Record<string, unknown>) => {
        const medicineId = normalizeStr(m?.medicineId, 128);
        return {
          ...(medicineId ? { medicineId } : {}),
          name: normalizeStr(m?.name, 160),
          dosage: normalizeStr(m?.dosage, 120),
          frequency: normalizeStr(m?.frequency, 120),
          duration: normalizeStr(m?.duration, 120),
          instructions: normalizeStr(m?.instructions, 300),
        };
      })
      .filter((m: { name: string }) => m.name.length > 0)
      .slice(0, 25);

    if (!patientRecordId || medications.length === 0) {
      res.status(400).json({ error: 'INVALID_PRESCRIPTION_INPUT' });
      return;
    }

    try {
      const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
      if (!patSnap.exists || patSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_PATIENT_RECORD' });
        return;
      }
      const patData = patSnap.data() as Record<string, unknown>;
      const prescriptionId = safeId('rx');

      await db.doc(`prescriptions/${prescriptionId}`).set({
        prescriptionId,
        doctorUid: ctx.doctorUid,
        institutionId: ctx.institutionId,
        patientRecordId,
        patientName: normalizeStr(patData.fullName, 120),
        patientAge: normalizeStr(patData.dateOfBirth, 20),
        patientGender: normalizeStr(patData.gender, 20),
        ...(visitId ? { visitId } : {}),
        doctorName: normalizeStr(ctx.doctorProfile.fullName, 120),
        doctorSpecialty: normalizeStr(ctx.doctorProfile.specialty, 120),
        clinicName: normalizeStr(ctx.doctorProfile.clinicName, 160),
        clinicAddress: normalizeStr(ctx.doctorProfile.workAddress, 240),
        clinicPhone: normalizeStr(ctx.doctorProfile.professionalPhone, 32),
        medications,
        doctorNotes,
        prescribedDate,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendClinicAudit(db, ctx, 'PRESCRIPTION_CREATED', 'prescriptions', prescriptionId, `Issued prescription for ${patData.fullName}`);
      if (typeof patData.linkedPatientUid === 'string' && patData.linkedPatientUid) {
        await emitPatientNotification(db, {
          patientUid: patData.linkedPatientUid,
          type: 'appointment',
          eventType: 'prescription_received',
          title: `تم إصدار وصفة طبية جديدة من ${normalizeStr(ctx.doctorProfile.fullName, 120)}`,
          body: `تاريخ الوصفة ${prescribedDate} · ${medications.map((m: { name: string }) => m.name).slice(0, 3).join('، ')}`,
          relatedId: prescriptionId,
          relatedType: 'prescription',
          idempotencyKey: `pat_rx:${prescriptionId}`,
        });
      }
      const saved = await db.doc(`prescriptions/${prescriptionId}`).get();
      res.status(201).json({ ok: true, prescription: serializeDocData(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][CreatePrescription] error:', err);
      res.status(500).json({ error: 'PRESCRIPTION_CREATE_FAILED' });
    }
  });

  /**
   * GET /api/doctor/medicines/search?q=...&governorate=...
   * Searches the Central Drug Master Catalog (medora_medicines) enriched with
   * approved-pharmacy unexpired stock availability and retail pricing only.
   * Strictly forbids wholesaler inventory, wholesale prices, or cost prices.
   */
  router.get('/doctor/medicines/search', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const q = normalizeStr(req.query?.q, 120).toLowerCase();
    const governorateFilter = normalizeStr(req.query?.governorate, 80).toLowerCase();

    if (q.length < 2) {
      res.status(400).json({ error: 'SEARCH_QUERY_TOO_SHORT' });
      return;
    }

    try {
      const [medsSnap, pharmSnap, instSnap, prodSnap, batchSnap] = await Promise.all([
        db.collection('medora_medicines').where('status', '==', 'active').limit(1500).get(),
        db.collection('pharmacy_profiles').where('status', '==', 'Approved').limit(200).get(),
        db.collection('institutions').where('type', '==', 'pharmacy').limit(200).get(),
        db.collection('pharmacy_products').where('isActive', '==', true).limit(3000).get(),
        db.collection('pharmacy_batches').where('isExpired', '==', false).limit(5000).get(),
      ]);

      const activeInstIds = new Set<string>();
      for (const doc of instSnap.docs) {
        if (doc.data()?.status === 'active') activeInstIds.add(doc.id);
      }

      const pharmacyByUid = new Map<string, PharmacyProfileDocument>();
      for (const doc of pharmSnap.docs) {
        const prof = serializeDocData(doc.data() as Record<string, unknown>) as unknown as PharmacyProfileDocument;
        if (prof.institutionId && !activeInstIds.has(prof.institutionId)) continue;
        if (governorateFilter && prof.governorate.trim().toLowerCase() !== governorateFilter) continue;
        pharmacyByUid.set(prof.uid, prof);
      }

      const batchesByProd = new Map<string, PharmacyBatchRecord[]>();
      for (const doc of batchSnap.docs) {
        const b = serializeDocData(doc.data() as Record<string, unknown>) as unknown as PharmacyBatchRecord;
        if (!b.productId) continue;
        const arr = batchesByProd.get(b.productId) || [];
        arr.push(b);
        batchesByProd.set(b.productId, arr);
      }

      const todayStr = getTodayBaghdadDateStr();
      const offersByMedicineId = new Map<
        string,
        Array<{
          pharmacyUid: string;
          pharmacyNameAr: string;
          pharmacyNameEn: string;
          governorate: string;
          district: string;
          sellingPriceIqd: number;
          discountPriceIqd?: number | null;
          availableQty: number;
          nearestExpiryDate?: string | null;
        }>
      >();

      for (const doc of prodSnap.docs) {
        const p = serializeDocData(doc.data() as Record<string, unknown>) as unknown as PharmacyProductRecord;
        if (
          !p.availableForPatientOrders ||
          p.isPublishedToPatients === false ||
          p.reviewStatus === 'pending_review'
        ) {
          continue;
        }
        const ph = pharmacyByUid.get(p.pharmacyUid);
        if (!ph) continue;
        const stock = summarizeProductBatchStock(batchesByProd.get(p.productId) || [], todayStr);
        if (stock.netAvailableQty <= 0) continue;

        const list = offersByMedicineId.get(p.medicineId) || [];
        list.push({
          pharmacyUid: ph.uid,
          pharmacyNameAr: ph.pharmacyNameAr,
          pharmacyNameEn: ph.pharmacyNameEn,
          governorate: ph.governorate,
          district: ph.district,
          sellingPriceIqd: Number(p.sellingPriceIqd || 0),
          discountPriceIqd: p.discountPriceIqd ?? null,
          availableQty: stock.netAvailableQty,
          nearestExpiryDate: stock.nearestExpiryDate,
        });
        offersByMedicineId.set(p.medicineId, list);
      }

      const medicines = medsSnap.docs
        .map((d) => serializeDocData(d.data() as Record<string, unknown>) as unknown as CanonicalMedicineRecord)
        .filter((m) => {
          const text = [
            m.scientificName,
            m.activeIngredient,
            ...(m.brandNames || []),
            m.barcode,
            m.manufacturer,
            m.therapeuticCategory,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return text.includes(q);
        })
        .slice(0, 40)
        .map((m) => {
          const pharmacies = (offersByMedicineId.get(m.medicineId) || []).sort(
            (a, b) => Number(a.discountPriceIqd ?? a.sellingPriceIqd) - Number(b.discountPriceIqd ?? b.sellingPriceIqd),
          );
          const prices = pharmacies.map((p) => Number(p.discountPriceIqd ?? p.sellingPriceIqd)).filter((n) => n > 0);
          return {
            medicineId: m.medicineId,
            scientificName: m.scientificName,
            activeIngredient: m.activeIngredient,
            brandNames: m.brandNames || [],
            strength: m.strength,
            dosageForm: m.dosageForm,
            packSize: m.packSize,
            manufacturer: m.manufacturer,
            country: m.country,
            therapeuticCategory: m.therapeuticCategory,
            imageReference: m.imageReference,
            requiresPrescription: Boolean(m.requiresPrescription),
            controlledDrug: Boolean(m.controlledDrug),
            dispensingRestrictions: m.dispensingRestrictions,
            availablePharmaciesCount: pharmacies.length,
            totalAvailableQty: pharmacies.reduce((acc, ph) => acc + ph.availableQty, 0),
            minRetailPriceIqd: prices.length > 0 ? Math.min(...prices) : null,
            maxRetailPriceIqd: prices.length > 0 ? Math.max(...prices) : null,
            pharmacies,
          };
        })
        .sort((a, b) => b.availablePharmaciesCount - a.availablePharmaciesCount);

      res.json({ ok: true, medicines });
    } catch (err) {
      console.error('[MEDORA][DoctorMedicineSearch] error:', err);
      res.status(500).json({ error: 'DOCTOR_MEDICINES_SEARCH_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Diagnostic Lab & Imaging Orders & Results
  // ---------------------------------------------------------------------------
  router.post('/doctor/diagnostics', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const rawOrderType = String(req.body?.orderType || '').trim().toLowerCase();
    if (!IMAGING_PORTAL_ENABLED && rawOrderType === 'imaging') {
      res.status(503).json(buildImagingDisabledResponseBody());
      return;
    }

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const orderType = rawOrderType === 'imaging' ? 'imaging' : 'lab';
    const targetFacilityName = normalizeStr(req.body?.targetFacilityName, 160);
    const clinicalIndication = normalizeStr(req.body?.clinicalIndication, 500);
    const priority = req.body?.priority === 'urgent' ? 'urgent' : 'routine';
    const requestedTests = Array.isArray(req.body?.requestedTests)
      ? (req.body.requestedTests as unknown[])
          .map((t) => normalizeStr(t, 120))
          .filter(Boolean)
          .slice(0, 30)
      : [];

    if (!patientRecordId || requestedTests.length === 0) {
      res.status(400).json({ error: 'INVALID_DIAGNOSTIC_ORDER_INPUT' });
      return;
    }

    try {
      const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
      if (!patSnap.exists || patSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_PATIENT_RECORD' });
        return;
      }
      const orderId = safeId('ord');
      await db.doc(`diagnostic_orders/${orderId}`).set({
        orderId,
        doctorUid: ctx.doctorUid,
        institutionId: ctx.institutionId,
        patientRecordId,
        patientName: normalizeStr(patSnap.data()?.fullName, 120),
        orderType,
        targetFacilityName,
        requestedTests,
        clinicalIndication,
        priority,
        status: 'ordered',
        resultSummary: '',
        resultFiles: [],
        doctorNotes: '',
        orderedAt: new Date().toISOString(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      await appendClinicAudit(db, ctx, 'DIAGNOSTIC_ORDER_CREATED', 'diagnostic_orders', orderId, `Ordered ${orderType}: ${requestedTests.join(', ')}`);
      const saved = await db.doc(`diagnostic_orders/${orderId}`).get();
      res.status(201).json({ ok: true, order: serializeDocData(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][CreateDiagnosticOrder] error:', err);
      res.status(500).json({ error: 'DIAGNOSTIC_ORDER_FAILED' });
    }
  });

  router.patch('/doctor/diagnostics/:orderId', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'uploadLabResults' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const orderId = normalizeStr(req.params.orderId, 128);
    const resultSummary = normalizeStr(req.body?.resultSummary, 1500);
    const doctorNotes = normalizeStr(req.body?.doctorNotes, 1000);
    const resultFiles = Array.isArray(req.body?.resultFiles) ? req.body.resultFiles.slice(0, 12) : undefined;
    const status = ['ordered', 'in_progress', 'results_received', 'reviewed'].includes(req.body?.status)
      ? req.body.status
      : 'results_received';

    if (doctorNotes && ctx.actorRole !== 'doctor') {
      res.status(403).json({ error: 'DOCTOR_ROLE_REQUIRED_FOR_NOTES' });
      return;
    }

    try {
      const ordRef = db.doc(`diagnostic_orders/${orderId}`);
      const snap = await ordRef.get();
      if (!snap.exists || snap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(404).json({ error: 'DIAGNOSTIC_ORDER_NOT_FOUND' });
        return;
      }
      if (!IMAGING_PORTAL_ENABLED && snap.data()?.orderType === 'imaging') {
        res.status(503).json(buildImagingDisabledResponseBody());
        return;
      }

      const patch: Record<string, unknown> = {
        status,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (req.body?.resultSummary !== undefined) patch.resultSummary = resultSummary;
      if (req.body?.doctorNotes !== undefined && ctx.actorRole === 'doctor') {
        patch.doctorNotes = doctorNotes;
      }
      if (resultFiles !== undefined) patch.resultFiles = resultFiles;
      if (status === 'results_received' && !snap.data()?.resultReceivedAt) {
        patch.resultReceivedAt = new Date().toISOString();
      }

      await ordRef.update(patch);
      await appendClinicAudit(db, ctx, 'DIAGNOSTIC_RESULT_UPDATED', 'diagnostic_orders', orderId, `Updated diagnostic order (${status})`);

      if (status === 'results_received' || status === 'reviewed') {
        const patRecordId = String(snap.data()?.patientRecordId || '');
        if (patRecordId) {
          const patSnap = await db.doc(`doctor_patients/${patRecordId}`).get();
          const linkedUid = patSnap.data()?.linkedPatientUid;
          if (typeof linkedUid === 'string' && linkedUid) {
            const ordType = snap.data()?.orderType === 'imaging' ? 'imaging_result' : 'lab_result';
            await emitPatientNotification(db, {
              patientUid: linkedUid,
              type: ordType,
              eventType: 'lab_result_available',
              title: 'صدرت نتيجة التحليل المختبري في ملفك الطبي',
              body: Array.isArray(snap.data()?.requestedTests)
                ? (snap.data()!.requestedTests as string[]).join(' · ')
                : '',
              relatedId: orderId,
              relatedType: 'diagnostic_order',
              idempotencyKey: `pat_diag:${orderId}:${status}`,
            });
          }
        }

        const docNotifPrefs = (ctx.doctorProfile.notificationPrefs || {}) as Record<string, unknown>;
        const diagEngine = getGlobalNotificationEngine();
        if (
          diagEngine &&
          ctx.actor.uid !== ctx.doctorUid &&
          docNotifPrefs.diagnosticResults !== false &&
          snap.data()?.orderType === 'lab'
        ) {
          await diagEngine
            .dispatch({
              eventType: 'diagnostic_report_received',
              recipientUid: ctx.doctorUid,
              recipientRole: 'doctor',
              sourceOrderDoctorUid: ctx.doctorUid,
              title: `تقرير مختبري مرتبط بطلب العيادة (${String(snap.data()?.patientName || '')})`,
              body: `تم إرفاق نتيجة الطلب ${orderId} للمراجعة في قسم الفحوصات.`,
              inAppType: 'lab_result',
              relatedId: orderId,
              relatedType: 'diagnostic_order',
              idempotencyKey: `doc_diag:${orderId}:${status}`,
              placeholders: {
                refCode: orderId.slice(0, 16).toUpperCase(),
                statusLabel: 'تقرير جاهز',
                dateLabel: new Date().toISOString().slice(0, 10),
              },
            })
            .catch(() => undefined);
        }
      }

      const updated = await ordRef.get();
      res.json({ ok: true, order: serializeDocData(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateDiagnostic] error:', err);
      res.status(500).json({ error: 'DIAGNOSTIC_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Messaging & Conversations
  // ---------------------------------------------------------------------------
  router.post('/doctor/conversations', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'messagePatients' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    if (!patientRecordId) {
      res.status(400).json({ error: 'PATIENT_REQUIRED' });
      return;
    }

    try {
      const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
      if (!patSnap.exists || patSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_PATIENT_RECORD' });
        return;
      }
      const patData = patSnap.data() as Record<string, unknown>;
      const existingSnap = await db
        .collection('doctor_conversations')
        .where('doctorUid', '==', ctx.doctorUid)
        .where('patientRecordId', '==', patientRecordId)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        res.json({ ok: true, conversation: serializeDocData(existingSnap.docs[0].data()) });
        return;
      }

      const conversationId = safeId('conv');
      await db.doc(`doctor_conversations/${conversationId}`).set({
        conversationId,
        doctorUid: ctx.doctorUid,
        patientRecordId,
        ...(patData.linkedPatientUid ? { patientUid: patData.linkedPatientUid } : {}),
        patientName: normalizeStr(patData.fullName, 120),
        patientPhone: normalizeStr(patData.phone, 32),
        lastMessageText: '',
        lastMessageAt: new Date().toISOString(),
        unreadByDoctor: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const created = await db.doc(`doctor_conversations/${conversationId}`).get();
      res.status(201).json({ ok: true, conversation: serializeDocData(created.data()) });
    } catch (err) {
      console.error('[MEDORA][CreateConversation] error:', err);
      res.status(500).json({ error: 'CONVERSATION_CREATE_FAILED' });
    }
  });

  router.get('/doctor/conversations/:conversationId/messages', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'messagePatients' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;
    const conversationId = normalizeStr(req.params.conversationId, 128);

    try {
      const convRef = db.doc(`doctor_conversations/${conversationId}`);
      const convSnap = await convRef.get();
      if (!convSnap.exists || convSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }

      const msgSnap = await db
        .collection('doctor_messages')
        .where('conversationId', '==', conversationId)
        .limit(200)
        .get();

      const messages = msgSnap.docs
        .map((d) => serializeDocData(d.data() as Record<string, unknown>))
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

      if (Number(convSnap.data()?.unreadByDoctor || 0) > 0) {
        await convRef.update({ unreadByDoctor: 0, updatedAt: FieldValue.serverTimestamp() });
      }

      res.json({ messages });
    } catch (err) {
      console.error('[MEDORA][ListMessages] error:', err);
      res.status(500).json({ error: 'MESSAGES_LOAD_FAILED' });
    }
  });

  router.post('/doctor/conversations/:conversationId/messages', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'messagePatients' });
    if (!ctx) return;
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
      if (!convSnap.exists || convSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(404).json({ error: 'CONVERSATION_NOT_FOUND' });
        return;
      }

      const messageId = safeId('mmsg');
      const nowIso = new Date().toISOString();
      const batch = db.batch();
      batch.set(db.doc(`doctor_messages/${messageId}`), {
        messageId,
        conversationId,
        doctorUid: ctx.doctorUid,
        senderUid: ctx.actor.uid,
        senderRole: ctx.actorRole,
        senderName: ctx.actor.name,
        text,
        attachments,
        readByDoctor: true,
        createdAt: nowIso,
      });
      batch.update(convRef, {
        lastMessageText: text || (attachments[0]?.name ? `Attachment: ${attachments[0].name}` : 'Attachment'),
        lastMessageAt: nowIso,
        unreadByDoctor: 0,
        unreadByPatient: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();

      const convData = convSnap.data() as Record<string, unknown>;
      if (typeof convData.patientUid === 'string' && convData.patientUid) {
        await emitPatientNotification(db, {
          patientUid: convData.patientUid,
          type: 'message',
          eventType: 'doctor_message_received',
          title: `رسالة جديدة من عيادة ${normalizeStr(ctx.doctorProfile.fullName, 120)}`,
          body: text ? text.slice(0, 120) : 'مرفق طبي جديد',
          relatedId: conversationId,
          relatedType: 'conversation',
          idempotencyKey: `pat_dmsg:${messageId}`,
        });
      }

      const saved = await db.doc(`doctor_messages/${messageId}`).get();
      res.status(201).json({ ok: true, message: serializeDocData(saved.data()) });
    } catch (err) {
      console.error('[MEDORA][SendMessage] error:', err);
      res.status(500).json({ error: 'MESSAGE_SEND_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Single Clinic Profile & Secretary / Staff Management
  // ---------------------------------------------------------------------------
  router.put('/doctor/clinic', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { requiredPermission: 'editClinicSchedule' });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const clinicName = normalizeStr(req.body?.clinicName, 160);
    const governorate = normalizeStr(req.body?.governorate, 80);
    const district = normalizeStr(req.body?.district, 80);
    const workAddress = normalizeStr(req.body?.workAddress, 240);
    const professionalPhone = normalizeStr(req.body?.professionalPhone, 32);
    const mapLocationUrl = normalizeStr(req.body?.mapLocationUrl, 500);
    const workDaysAndHours = normalizeStr(req.body?.workDaysAndHours, 240);
    const consultationFee = normalizeNum(req.body?.consultationFee, 0, 10000000, 0);
    const clinicPhotoUrl = normalizeStr(req.body?.clinicPhotoUrl, 1200);
    const clinicServices = Array.isArray(req.body?.clinicServices)
      ? (req.body.clinicServices as unknown[]).map((s) => normalizeStr(s, 100)).filter(Boolean).slice(0, 20)
      : undefined;

    if (clinicName.length < 2 || workAddress.length < 2) {
      res.status(400).json({ error: 'INVALID_CLINIC_INPUT' });
      return;
    }

    try {
      const docRef = db.doc(`doctor_profiles/${ctx.doctorUid}`);
      const instRef = db.doc(`institutions/${ctx.institutionId}`);

      const docPatch: Record<string, unknown> = {
        clinicName,
        governorate,
        district,
        workAddress,
        professionalPhone,
        mapLocationUrl,
        workDaysAndHours,
        consultationFee,
        clinicPhotoUrl,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (clinicServices !== undefined) docPatch.clinicServices = clinicServices;

      const batch = db.batch();
      batch.update(docRef, docPatch);
      const instSnap = await instRef.get();
      if (instSnap.exists) {
        batch.update(instRef, {
          nameAr: clinicName,
          nameEn: clinicName,
          governorate,
          district,
          address: workAddress,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();

      const refreshed = await docRef.get();
      await syncPublicDoctorCard(db, ctx.doctorUid, refreshed.data() as Record<string, unknown>);
      await appendClinicAudit(db, ctx, 'CLINIC_UPDATED', 'institutions', ctx.institutionId, `Updated clinic settings (${clinicName})`);

      res.json({ ok: true, doctorProfile: serializeDocData(refreshed.data()) });
    } catch (err) {
      console.error('[MEDORA][UpdateClinic] error:', err);
      res.status(500).json({ error: 'CLINIC_UPDATE_FAILED' });
    }
  });

  router.post('/doctor/staff/:memberId/decision', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const memberId = normalizeStr(req.params.memberId, 128);
    const decision = req.body?.decision === 'approve' ? 'approve' : req.body?.decision === 'reject' ? 'reject' : '';
    const staffUid = normalizeStr(req.body?.uid, 128);
    const permissions = Array.isArray(req.body?.permissions)
      ? (req.body.permissions as unknown[]).filter(
          (p): p is SecretaryPermissionKey => typeof p === 'string' && VALID_PERMISSIONS_SET.has(p),
        )
      : ['viewAppointments', 'viewPatientBasic'];

    if (!memberId || !decision) {
      res.status(400).json({ error: 'INVALID_STAFF_DECISION' });
      return;
    }

    try {
      const memRef = db.doc(`institution_members/${memberId}`);
      const memSnap = await memRef.get();
      const targetUid = memSnap.exists ? String(memSnap.data()?.uid || staffUid) : staffUid;
      if (!targetUid) {
        res.status(404).json({ error: 'STAFF_MEMBER_NOT_FOUND' });
        return;
      }

      const nextStatus = decision === 'approve' ? 'active' : 'revoked';
      const batch = db.batch();

      if (memSnap.exists) {
        if (memSnap.data()?.institutionId !== ctx.institutionId) {
          res.status(403).json({ error: 'FORBIDDEN_STAFF_MEMBER' });
          return;
        }
        batch.update(memRef, {
          status: nextStatus,
          permissions: decision === 'approve' ? permissions : [],
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        batch.set(memRef, {
          memberId,
          institutionId: ctx.institutionId,
          uid: targetUid,
          role: 'secretary',
          status: nextStatus,
          permissions: decision === 'approve' ? permissions : [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const secRef = db.doc(`secretary_profiles/${targetUid}`);
      const secSnap = await secRef.get();
      if (secSnap.exists) {
        batch.update(secRef, {
          status: decision === 'approve' ? 'Approved' : 'Rejected',
          permissionsGranted: decision === 'approve' && permissions.length > 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const reqQuery = await db
        .collection('registration_requests')
        .where('uid', '==', targetUid)
        .where('portalType', '==', 'secretary')
        .limit(3)
        .get();
      reqQuery.docs.forEach((rDoc) => {
        batch.update(rDoc.ref, {
          status: decision === 'approve' ? 'Approved' : 'Rejected',
          updatedAt: FieldValue.serverTimestamp(),
        });
      });

      if (decision === 'approve') {
        const userRef = db.doc(`users/${targetUid}`);
        const userSnap = await userRef.get();
        if (userSnap.exists) {
          batch.update(userRef, {
            accountStatus: 'active',
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      await batch.commit();
      await appendClinicAudit(
        db,
        ctx,
        decision === 'approve' ? 'STAFF_APPROVED' : 'STAFF_REJECTED',
        'institution_members',
        memberId,
        `${decision === 'approve' ? 'Approved' : 'Rejected'} secretary ${targetUid} with permissions: ${permissions.join(', ')}`,
      );

      res.json({ ok: true, status: nextStatus, permissions: decision === 'approve' ? permissions : [] });
    } catch (err) {
      console.error('[MEDORA][StaffDecision] error:', err);
      res.status(500).json({ error: 'STAFF_DECISION_FAILED' });
    }
  });

  router.patch('/doctor/staff/:memberId', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const memberId = normalizeStr(req.params.memberId, 128);
    const status = req.body?.status === 'revoked' ? 'revoked' : req.body?.status === 'active' ? 'active' : undefined;
    const permissions = Array.isArray(req.body?.permissions)
      ? (req.body.permissions as unknown[]).filter(
          (p): p is SecretaryPermissionKey => typeof p === 'string' && VALID_PERMISSIONS_SET.has(p),
        )
      : undefined;

    try {
      const memRef = db.doc(`institution_members/${memberId}`);
      const memSnap = await memRef.get();
      if (!memSnap.exists || memSnap.data()?.institutionId !== ctx.institutionId) {
        res.status(404).json({ error: 'STAFF_MEMBER_NOT_FOUND' });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (status) patch.status = status;
      if (permissions) patch.permissions = permissions;

      const batch = db.batch();
      batch.update(memRef, patch);

      const targetUid = String(memSnap.data()?.uid || '');
      if (targetUid) {
        const secRef = db.doc(`secretary_profiles/${targetUid}`);
        const secSnap = await secRef.get();
        if (secSnap.exists) {
          const finalPerms = permissions ?? (memSnap.data()?.permissions as unknown[]) ?? [];
          const finalStatus = status ?? String(memSnap.data()?.status || 'active');
          batch.update(secRef, {
            permissionsGranted: finalStatus === 'active' && finalPerms.length > 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }

      await batch.commit();
      await appendClinicAudit(
        db,
        ctx,
        'STAFF_PERMISSIONS_UPDATED',
        'institution_members',
        memberId,
        `Updated staff ${memberId} (status=${status || 'unchanged'}, perms=${(permissions || []).join(',')})`,
      );

      const updated = await memRef.get();
      res.json({ ok: true, member: serializeDocData(updated.data()) });
    } catch (err) {
      console.error('[MEDORA][StaffUpdate] error:', err);
      res.status(500).json({ error: 'STAFF_UPDATE_FAILED' });
    }
  });

  // ---------------------------------------------------------------------------
  // Promotional Ads Governance (Strictly Locked to Super Admin Only)
  // ---------------------------------------------------------------------------
  router.post(
    '/doctor/promotional-banner/upload',
    async (req, res) => {
      const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
      if (!ctx) return;
      res.status(403).json({
        error: 'AD_MANAGEMENT_RESTRICTED_TO_SUPER_ADMIN',
        message: 'Promotional ads and banners are managed exclusively by MEDORA Super Admin.',
      });
    },
  );

  router.put('/doctor/promotional-banner', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    res.status(403).json({
      error: 'AD_MANAGEMENT_RESTRICTED_TO_SUPER_ADMIN',
      message: 'Promotional ads and banners are managed exclusively by MEDORA Super Admin.',
    });
  });

  router.post('/doctor/avatar/upload', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
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
        ownerUid: ctx.doctorUid,
        folder: 'avatars',
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
        meta: { doctorUid: ctx.doctorUid },
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
      const code = err instanceof Error ? err.message : 'AVATAR_UPLOAD_FAILED';
      if (code === 'FILE_TOO_LARGE') {
        res.status(413).json({ error: 'FILE_TOO_LARGE' });
        return;
      }
      console.error('[MEDORA][DoctorAvatarUpload] error:', err);
      res.status(500).json({ error: 'AVATAR_UPLOAD_FAILED' });
    }
  });

  router.put('/doctor/avatar', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 1000) : '';
    const avatarPath = normalizeStr(req.body?.avatarPath, 300);

    if (avatarUrl !== '' && !isValidUploadedAssetUrl(avatarUrl, avatarPath)) {
      res.status(400).json({ error: 'INVALID_AVATAR_URL' });
      return;
    }

    try {
      const docRef = db.doc(`doctor_profiles/${ctx.doctorUid}`);
      const prevSnap = await docRef.get();
      const prevData = prevSnap.exists ? (prevSnap.data() as Record<string, unknown>) : {};
      const oldAvatarPath = typeof prevData.avatarPath === 'string' ? prevData.avatarPath : '';

      // Strictly update ONLY avatar fields (never touch promotionalBannerUrl / promotionalBannerPath)
      await docRef.update({
        avatarUrl,
        avatarPath: avatarUrl ? avatarPath : '',
        updatedAt: FieldValue.serverTimestamp(),
      });

      const refreshed = await docRef.get();
      const refreshedData = refreshed.data() as Record<string, unknown>;
      await syncPublicDoctorCard(db, ctx.doctorUid, refreshedData);
      await syncDoctorAvatarAcrossCollections({
        db,
        doctorUid: ctx.doctorUid,
        avatarUrl,
        avatarPath: avatarUrl ? avatarPath : '',
      });

      if (oldAvatarPath && oldAvatarPath !== (avatarUrl ? avatarPath : '')) {
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

      await appendClinicAudit(
        db,
        ctx,
        avatarUrl ? 'DOCTOR_AVATAR_UPDATED' : 'DOCTOR_AVATAR_REMOVED',
        'doctor_profiles',
        ctx.doctorUid,
        avatarUrl ? 'Updated physician profile avatar' : 'Removed physician profile avatar',
      );

      res.json({ ok: true, doctorProfile: serializeDocData(refreshedData) });
    } catch (err) {
      console.error('[MEDORA][DoctorAvatarSave] error:', err);
      res.status(500).json({ error: 'DOCTOR_AVATAR_SAVE_FAILED' });
    }
  });

  router.post('/doctor/files/upload', async (req, res) => {
    const folderRaw = normalizeStr(req.body?.folder, 40) as MedoraUploadFolder;
    const permissionByFolder: Record<string, { doctorOnly?: boolean; requiredPermission?: SecretaryPermissionKey }> = {
      avatars: { doctorOnly: true },
      clinic_photos: { requiredPermission: 'editClinicSchedule' },
      patient_records: { requiredPermission: 'viewMedicalRecords' },
      diagnostic_results: { requiredPermission: 'uploadLabResults' },
      message_files: { requiredPermission: 'messagePatients' },
    };
    const authRule = permissionByFolder[folderRaw];
    if (!authRule) {
      res.status(400).json({ error: 'INVALID_UPLOAD_FOLDER' });
      return;
    }

    const ctx = await requireDoctorAccess(req, res, authRule);
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const patientRecordId = normalizeStr(req.body?.patientRecordId, 128);
    const conversationId = normalizeStr(req.body?.conversationId, 128);

    if (patientRecordId) {
      const patSnap = await db.doc(`doctor_patients/${patientRecordId}`).get();
      if (!patSnap.exists || patSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_PATIENT_RECORD' });
        return;
      }
    }
    if (conversationId) {
      const convSnap = await db.doc(`doctor_conversations/${conversationId}`).get();
      if (!convSnap.exists || convSnap.data()?.doctorUid !== ctx.doctorUid) {
        res.status(403).json({ error: 'FORBIDDEN_CONVERSATION' });
        return;
      }
    }

    const isImageOnly = folderRaw === 'avatars' || folderRaw === 'clinic_photos';
    const decoded = decodeAndValidateBase64Asset({
      dataBase64: req.body?.dataBase64,
      mimeType: req.body?.mimeType,
      fileName: req.body?.fileName,
      allowPdf: !isImageOnly,
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
        ownerUid: ctx.actor.uid,
        folder: folderRaw,
        buffer: decoded.buffer,
        mimeType: decoded.mimeType,
        safeName: decoded.safeName,
        meta: {
          doctorUid: ctx.doctorUid,
          ...(patientRecordId ? { patientRecordId } : {}),
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
      console.error('[MEDORA][DoctorFileUpload] error:', err);
      res.status(500).json({ error: 'FILE_UPLOAD_FAILED' });
    }
  });

  router.put('/doctor/settings', async (req, res) => {
    const ctx = await requireDoctorAccess(req, res, { doctorOnly: true });
    if (!ctx) return;
    const db = deps.getAdminDb()!;

    const professionalPhone = normalizeStr(req.body?.professionalPhone, 32);
    const avatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim().slice(0, 1000) : undefined;
    const avatarPath = normalizeStr(req.body?.avatarPath, 300);
    const subSpecialty = normalizeStr(req.body?.subSpecialty, 120);
    const languages = Array.isArray(req.body?.languages)
      ? (req.body.languages as unknown[]).map((l) => normalizeStr(l, 40)).filter(Boolean).slice(0, 10)
      : undefined;
    const notificationPrefs =
      req.body?.notificationPrefs && typeof req.body.notificationPrefs === 'object'
        ? {
            newBookings: Boolean(req.body.notificationPrefs.newBookings),
            newMessages: Boolean(req.body.notificationPrefs.newMessages),
            diagnosticResults: Boolean(req.body.notificationPrefs.diagnosticResults),
            staffActions: Boolean(req.body.notificationPrefs.staffActions),
          }
        : undefined;
    const privacyPrefs =
      req.body?.privacyPrefs && typeof req.body.privacyPrefs === 'object'
        ? {
            showPhoneInDirectory: req.body.privacyPrefs.showPhoneInDirectory !== false,
            showFeeInDirectory: req.body.privacyPrefs.showFeeInDirectory !== false,
            allowPatientMessages: req.body.privacyPrefs.allowPatientMessages !== false,
          }
        : undefined;

    if (avatarUrl !== undefined && avatarUrl !== '' && !isValidUploadedAssetUrl(avatarUrl, avatarPath)) {
      res.status(400).json({ error: 'INVALID_AVATAR_URL' });
      return;
    }

    try {
      const docRef = db.doc(`doctor_profiles/${ctx.doctorUid}`);
      const prevSnap = await docRef.get();
      const oldAvatarPath =
        prevSnap.exists && typeof prevSnap.data()?.avatarPath === 'string'
          ? String(prevSnap.data()!.avatarPath)
          : '';

      const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
      if (professionalPhone) patch.professionalPhone = professionalPhone;
      if (avatarUrl !== undefined) {
        patch.avatarUrl = avatarUrl;
        patch.avatarPath = avatarUrl ? avatarPath : '';
      }
      if (req.body?.subSpecialty !== undefined) patch.subSpecialty = subSpecialty;
      if (languages !== undefined) patch.languages = languages;
      if (notificationPrefs !== undefined) patch.notificationPrefs = notificationPrefs;
      if (privacyPrefs !== undefined) patch.privacyPrefs = privacyPrefs;

      await docRef.update(patch);
      const refreshed = await docRef.get();
      const refreshedData = refreshed.data() as Record<string, unknown>;
      await syncPublicDoctorCard(db, ctx.doctorUid, refreshedData);
      if (avatarUrl !== undefined) {
        await syncDoctorAvatarAcrossCollections({
          db,
          doctorUid: ctx.doctorUid,
          avatarUrl,
          avatarPath: avatarUrl ? avatarPath : '',
        });
        if (oldAvatarPath && oldAvatarPath !== (avatarUrl ? avatarPath : '')) {
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
      }
      await appendClinicAudit(db, ctx, 'DOCTOR_SETTINGS_UPDATED', 'doctor_profiles', ctx.doctorUid, 'Updated physician settings & privacy preferences');

      if (professionalPhone || privacyPrefs !== undefined) {
        const setEngine = getGlobalNotificationEngine();
        if (setEngine) {
          await setEngine
            .dispatch({
              eventType: 'important_account_update',
              recipientUid: ctx.doctorUid,
              recipientRole: 'doctor',
              title: 'تم تحديث إعدادات الأمان أو التواصل بالعيادة',
              body: 'تم حفظ التعديلات على رقم التواصل المهني أو إعدادات الخصوصية في بوابة الطبيب.',
              inAppType: 'admin_notice',
              relatedId: ctx.doctorUid,
              relatedType: 'doctor_settings',
              idempotencyKey: `doc_set:${ctx.doctorUid}:${Date.now().toString(36)}`,
              placeholders: {
                refCode: ctx.doctorUid.slice(0, 12).toUpperCase(),
                statusLabel: 'محدّث',
              },
            })
            .catch(() => undefined);
        }
      }

      res.json({ ok: true, doctorProfile: serializeDocData(refreshedData) });
    } catch (err) {
      console.error('[MEDORA][DoctorSettings] error:', err);
      res.status(500).json({ error: 'DOCTOR_SETTINGS_FAILED' });
    }
  });

  return router;
}
