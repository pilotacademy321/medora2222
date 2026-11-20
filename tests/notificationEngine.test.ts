import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import {
  hashPhoneKey,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
} from '../server/iraqiPhone.ts';
import {
  DOCTOR_FORBIDDEN_STOCK_EVENTS,
  NotificationEngine,
  bindGlobalNotificationEngine,
} from '../server/notificationEngine.ts';
import {
  handlePharmacyStockUpdateAndNotify,
  recordWholesalerInventoryOffer,
  registerPatientMedicineWatch,
  submitPatientMedicineRequestToPharmacy,
  submitPharmacyRequestToWholesaler,
  updateWholesalerOrderStatus,
} from '../server/pharmacyWholesalerContracts.ts';
import {
  canAccessDoctorSection,
  resolveSafeDoctorSection,
} from '../src/utils/doctorAccess.ts';
import { createNotificationRouter } from '../server/notificationRoutes.ts';
import { createPhoneRouter } from '../server/phoneRoutes.ts';
import {
  simulateWhatsAppDispatch,
  validateWhatsAppTemplateSafety,
  WHATSAPP_LIVE_API_ENABLED,
} from '../server/whatsappSimulation.ts';
import {
  NOTIFICATION_EVENT_CATALOG,
  inferNotificationIconCategory,
  resolveNotificationActionRoute,
} from '../src/constants/notificationCatalog.ts';
import { IN_APP_MANDATORY_WARNING_AR } from '../src/components/shared/NotificationChannelCard.tsx';
import {
  NOTIFICATION_VISUAL_LABELS,
  resolveNotificationVisualKind,
  resolveNotificationWorkflowMeta,
} from '../src/components/shared/notificationVisuals.ts';
import * as iraqiPhoneClient from '../src/utils/iraqiPhone.ts';

type DocData = Record<string, unknown>;

function cloneValue<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function applyFieldSentinels(target: DocData, patch: DocData): DocData {
  const next = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (
      v &&
      typeof v === 'object' &&
      v.constructor?.name === 'ServerTimestampTransform'
    ) {
      next[k] = new Date().toISOString();
    } else {
      next[k] = cloneValue(v);
    }
  }
  return next;
}

class InMemoryFirestore {
  readonly store = new Map<string, Map<string, DocData>>();

  private getColMap(col: string): Map<string, DocData> {
    let m = this.store.get(col);
    if (!m) {
      m = new Map();
      this.store.set(col, m);
    }
    return m;
  }

  doc(path: string) {
    const [col, id] = path.split('/');
    const self = this;
    return {
      id,
      path,
      async get() {
        const data = self.getColMap(col).get(id);
        return {
          id,
          exists: Boolean(data),
          data: () => (data ? cloneValue(data) : undefined),
        };
      },
      async set(data: DocData, opts?: { merge?: boolean }) {
        const map = self.getColMap(col);
        const existing = opts?.merge ? map.get(id) || {} : {};
        map.set(id, applyFieldSentinels(existing, data));
      },
      async update(patch: DocData) {
        const map = self.getColMap(col);
        const existing = map.get(id);
        if (!existing) throw new Error(`DOC_NOT_FOUND:${path}`);
        map.set(id, applyFieldSentinels(existing, patch));
      },
      async delete() {
        self.getColMap(col).delete(id);
      },
    };
  }

  collection(col: string) {
    const self = this;
    const filters: Array<{ field: string; value: unknown }> = [];
    let limitNum = 1000;

    const queryObj = {
      where(field: string, _op: string, value: unknown) {
        filters.push({ field, value });
        return queryObj;
      },
      limit(n: number) {
        limitNum = n;
        return queryObj;
      },
      async get() {
        const map = self.getColMap(col);
        const docs = Array.from(map.entries())
          .filter(([, data]) =>
            filters.every((f) => data[f.field] === f.value),
          )
          .slice(0, limitNum)
          .map(([id, data]) => ({
            id,
            ref: self.doc(`${col}/${id}`),
            exists: true,
            data: () => cloneValue(data),
          }));
        return {
          empty: docs.length === 0,
          size: docs.length,
          docs,
        };
      },
    };
    return queryObj;
  }

  batch() {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: ReturnType<InMemoryFirestore['doc']>, data: DocData, opts?: { merge?: boolean }) => {
        ops.push(() => ref.set(data, opts));
      },
      update: (ref: ReturnType<InMemoryFirestore['doc']>, patch: DocData) => {
        ops.push(() => ref.update(patch));
      },
      delete: (ref: ReturnType<InMemoryFirestore['doc']>) => {
        ops.push(() => ref.delete());
      },
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  }

  async runTransaction<T>(fn: (tx: {
    get: (ref: ReturnType<InMemoryFirestore['doc']>) => Promise<{ id: string; exists: boolean; data: () => DocData | undefined }>;
    set: (ref: ReturnType<InMemoryFirestore['doc']>, data: DocData, opts?: { merge?: boolean }) => void;
    delete: (ref: ReturnType<InMemoryFirestore['doc']>) => void;
  }) => Promise<T>): Promise<T> {
    const pending: Array<() => Promise<void>> = [];
    const tx = {
      get: (ref: ReturnType<InMemoryFirestore['doc']>) => ref.get(),
      set: (ref: ReturnType<InMemoryFirestore['doc']>, data: DocData, opts?: { merge?: boolean }) => {
        pending.push(() => ref.set(data, opts));
      },
      delete: (ref: ReturnType<InMemoryFirestore['doc']>) => {
        pending.push(() => ref.delete());
      },
    };
    const res = await fn(tx);
    for (const op of pending) await op();
    return res;
  }
}

async function runTests() {
  // -------------------------------------------------------------------------
  // 1. Iraqi +964 Phone Normalization, Masking & Zero OTP Helpers
  // -------------------------------------------------------------------------
  const localNorm = parseAndNormalizeIraqiPhone('0770 123 4567');
  assert.equal(localNorm.ok, true);
  if (localNorm.ok) {
    assert.equal(localNorm.e164, '+9647701234567');
    assert.equal(localNorm.local, '07701234567');
    assert.equal(localNorm.operator, 'asiacell');
    assert.equal(maskIraqiPhone(localNorm.e164), '+964770****567');
  }
  const intlNorm = parseAndNormalizeIraqiPhone('009647812345678');
  assert.equal(intlNorm.ok, true);
  if (intlNorm.ok) assert.equal(intlNorm.e164, '+9647812345678');
  const invalidNum = parseAndNormalizeIraqiPhone('+12025550123');
  assert.equal(invalidNum.ok, false);
  assert.equal('isFirebaseSyntheticTestPhone' in iraqiPhoneClient, false);

  // Confirm mandatory In-App warning wording exists verbatim
  assert.ok(IN_APP_MANDATORY_WARNING_AR.includes('ستصلك إشعاراتك داخل المنصة فقط'));
  assert.ok(IN_APP_MANDATORY_WARNING_AR.includes('لن تصلك تنبيهات خارج المنصة'));

  // -------------------------------------------------------------------------
  // 2. HTTP Router Tests: Google-Only Phone Linking + Two-Channel Notification API
  // -------------------------------------------------------------------------
  const memDb = new InMemoryFirestore();
  const db = memDb as unknown as Firestore;

  // Seed legacy verified user + patient + doctor + lab + secretary + admin users
  await db.doc('users/user_legacy').set({
    uid: 'user_legacy',
    email: 'legacy@gmail.com',
    selectedPortal: 'patient',
    phone: '+9647711112222',
  });
  await db.doc('phone_verifications/user_legacy').set({
    uid: 'user_legacy',
    phoneE164: '+9647711112222',
    verified: true,
    verifiedAt: '2026-01-10T08:00:00.000Z',
  });
  await db.doc(`phone_registry/${hashPhoneKey('+9647711112222')}`).set({
    phoneE164: '+9647711112222',
    uid: 'user_legacy',
  });

  await db.doc('users/patient_1').set({
    uid: 'patient_1',
    email: 'patient1@gmail.com',
    selectedPortal: 'patient',
    phone: '',
  });
  await db.doc('patient_profiles/patient_1').set({
    uid: 'patient_1',
    fullName: 'Sara Ali',
    phone: '',
  });
  await db.doc('users/doctor_1').set({
    uid: 'doctor_1',
    selectedPortal: 'doctor',
    phone: '+9647800001111',
  });
  await db.doc('doctor_profiles/doctor_1').set({
    uid: 'doctor_1',
    status: 'Approved',
    professionalPhone: '+9647800001111',
  });
  await db.doc('users/lab_1').set({
    uid: 'lab_1',
    selectedPortal: 'lab',
    phone: '+9647500002222',
  });
  await db.doc('lab_profiles/lab_1').set({
    uid: 'lab_1',
    status: 'Approved',
    professionalPhone: '+9647500002222',
  });
  await db.doc('users/lab_staff_1').set({
    uid: 'lab_staff_1',
    selectedPortal: 'lab',
    phone: '+9647500009999',
  });
  await db.doc('lab_staff/staff_1').set({
    staffId: 'staff_1',
    uid: 'lab_staff_1',
    labUid: 'lab_1',
    status: 'active',
    permissions: ['reception'],
  });
  await db.doc('users/sec_1').set({
    uid: 'sec_1',
    selectedPortal: 'secretary',
    phone: '+9647900003333',
  });
  await db.doc('secretary_profiles/sec_1').set({
    uid: 'sec_1',
    status: 'Approved',
    phone: '+9647900003333',
  });
  await db.doc('users/admin_1').set({
    uid: 'admin_1',
    email: 'aqbs250@gmail.com',
    selectedPortal: 'super_admin',
  });
  await db.doc('admin_roles/admin_1').set({
    uid: 'admin_1',
    active: true,
    role: 'super_admin',
  });

  const mockAuth = {
    async verifyIdToken(token: string) {
      return { uid: token, email: `${token}@gmail.com` };
    },
  } as unknown as Auth;

  const engine = new NotificationEngine({
    getAdminDb: () => db,
    isFirestoreAdminReady: () => true,
  });
  bindGlobalNotificationEngine(engine);

  const app = express();
  app.use(express.json());
  const requireSuperAdmin: express.RequestHandler = (req, res, next) => {
    const token = String(req.headers.authorization || '').replace('Bearer ', '').trim();
    if (token !== 'admin_1') {
      res.status(403).json({ error: 'SUPER_ADMIN_REQUIRED' });
      return;
    }
    (req as express.Request & { adminCtx: { decoded: { uid: string } } }).adminCtx = {
      decoded: { uid: 'admin_1' },
    };
    next();
  };

  app.use(
    '/api',
    createPhoneRouter({
      adminAuth: mockAuth,
      getAdminDb: () => db,
      isFirestoreAdminReady: () => true,
    }),
  );
  app.use(
    '/api',
    createNotificationRouter({
      adminAuth: mockAuth,
      getAdminDb: () => db,
      isFirestoreAdminReady: () => true,
      engine,
      requireSuperAdmin,
    }),
  );

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`;

  try {
    // 2a. Legacy verified phone preserved cleanly without OTP
    const legacyRes = await fetch(`${baseUrl}/phone/status`, {
      headers: { Authorization: 'Bearer user_legacy' },
    });
    assert.equal(legacyRes.status, 200);
    const legacyJson = (await legacyRes.json()) as Record<string, unknown>;
    assert.equal(legacyJson.linked, true);
    assert.equal(legacyJson.verified, true);
    assert.equal(legacyJson.phoneE164, '+9647711112222');
    assert.equal(legacyJson.verificationMethod, 'legacy_verified');

    // 2b. Collision prevention on existing registered phone
    const collisionRes = await fetch(`${baseUrl}/phone/link`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: '07711112222' }),
    });
    assert.equal(collisionRes.status, 409);

    // 2c. Direct Google-account +964 phone link (no OTP / no SMS)
    const linkRes = await fetch(`${baseUrl}/phone/link`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: '0770 555 6677' }),
    });
    assert.equal(linkRes.status, 200);
    const linkJson = (await linkRes.json()) as Record<string, unknown>;
    assert.equal(linkJson.phoneE164, '+9647705556677');
    assert.equal(linkJson.verificationMethod, 'google_account_linked');

    // -------------------------------------------------------------------------
    // 3. Two-Channel Routing & Strict Single-Channel Guarantee
    // -------------------------------------------------------------------------
    // Default channel is in_app -> writes ONLY to patient_notifications, zero WhatsApp logs
    const inAppDispatch = await engine.dispatch({
      eventType: 'appointment_updated',
      recipientUid: 'patient_1',
      recipientRole: 'patient',
      title: 'تم تأكيد موعدك',
      body: 'التاريخ 2026-12-01 الساعة 10:00',
      relatedId: 'apt_100',
      relatedType: 'appointment',
      idempotencyKey: 'apt_100_confirmed',
    });
    assert.equal(inAppDispatch.ok, true);
    assert.equal(inAppDispatch.channelUsed, 'in_app');
    assert.equal(inAppDispatch.log?.channel, 'in_app');
    assert.equal(inAppDispatch.log?.status, 'Delivered');

    const patientInbox = await engine.listInAppForUser('patient_1', 'patient');
    assert.equal(patientInbox.unreadCount, 1);

    // Duplicate prevention on same channel + idempotencyKey
    const dupDispatch = await engine.dispatch({
      eventType: 'appointment_updated',
      recipientUid: 'patient_1',
      recipientRole: 'patient',
      title: 'تم تأكيد موعدك',
      body: 'التاريخ 2026-12-01 الساعة 10:00',
      relatedId: 'apt_100',
      relatedType: 'appointment',
      idempotencyKey: 'apt_100_confirmed',
    });
    assert.equal(dupDispatch.ok, false);
    assert.equal(dupDispatch.duplicateBlocked, true);

    // -------------------------------------------------------------------------
    // 4. WhatsApp Consent Enforcement & Channel Switching Anytime
    // -------------------------------------------------------------------------
    const noConsentRes = await fetch(`${baseUrl}/notifications/preferences`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredChannel: 'whatsapp',
        whatsappConsent: false,
      }),
    });
    assert.equal(noConsentRes.status, 400);
    const noConsentJson = (await noConsentRes.json()) as Record<string, unknown>;
    assert.equal(noConsentJson.error, 'WHATSAPP_CONSENT_REQUIRED');

    // Grant explicit consent -> switch to WhatsApp (Simulation)
    const consentRes = await fetch(`${baseUrl}/notifications/preferences`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredChannel: 'whatsapp',
        whatsappConsent: true,
        locale: 'ar',
      }),
    });
    assert.equal(consentRes.status, 200);

    const beforeWhatsappInboxCount = (await engine.listInAppForUser('patient_1', 'patient')).notifications.length;
    const waDispatch = await engine.dispatch({
      eventType: 'lab_result_ready',
      recipientUid: 'patient_1',
      recipientRole: 'patient',
      title: 'نتيجة المختبر جاهزة',
      body: 'يحتوي التقرير على فحص CBC HbA1c 6.8%',
      relatedId: 'lab_res_42',
      relatedType: 'lab_result',
      idempotencyKey: 'lab_res_42_ready',
      placeholders: { refCode: 'LAB-42', statusLabel: 'جاهز' },
    });
    assert.equal(waDispatch.ok, true);
    assert.equal(waDispatch.channelUsed, 'whatsapp');
    assert.equal(waDispatch.log?.mode, 'whatsapp_simulation');
    assert.equal(waDispatch.log?.status, 'Simulated');
    assert.equal(WHATSAPP_LIVE_API_ENABLED, false);
    // Strict single-channel: NO new in_app notification created while WhatsApp is active
    const afterWhatsappInboxCount = (await engine.listInAppForUser('patient_1', 'patient')).notifications.length;
    assert.equal(afterWhatsappInboxCount, beforeWhatsappInboxCount);
    // Zero medical data leaked in WhatsApp simulation body
    assert.equal(waDispatch.log?.bodyPreview.includes('CBC'), false);
    assert.equal(waDispatch.log?.bodyPreview.includes('6.8'), false);

    // Switch back to In-App anytime
    const switchBackRes = await fetch(`${baseUrl}/notifications/preferences`, {
      method: 'PUT',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        preferredChannel: 'in_app',
        whatsappConsent: true,
      }),
    });
    assert.equal(switchBackRes.status, 200);

    // Verify unread -> read-all works for Patient In-App API
    const readAllRes = await fetch(`${baseUrl}/notifications/in-app/read-all`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer patient_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'patient' }),
    });
    assert.equal(readAllRes.status, 200);
    const afterReadAll = await engine.listInAppForUser('patient_1', 'patient');
    assert.equal(afterReadAll.unreadCount, 0);

    // Unlink clears phone and resets WhatsApp preference back to in_app
    await engine.updateUserPreferences('patient_1', {
      preferredChannel: 'whatsapp',
      whatsappConsent: true,
    });
    const unlinkRes = await fetch(`${baseUrl}/phone/unlink`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer patient_1' },
    });
    assert.equal(unlinkRes.status, 200);
    const prefsAfterUnlink = await engine.getUserPreferences('patient_1', 'patient');
    assert.equal(prefsAfterUnlink.hasLinkedPhone, false);
    assert.equal(prefsAfterUnlink.preferredChannel, 'in_app');

    // -------------------------------------------------------------------------
    // 5. All Remaining Portal Roles (Doctor, Lab, Secretary, Super Admin)
    // -------------------------------------------------------------------------
    const docRes = await engine.dispatch({
      eventType: 'appointment_updated',
      recipientUid: 'doctor_1',
      recipientRole: 'doctor',
      title: 'حجز جديد في العيادة',
      body: 'موعد جديد الساعة 11:00',
      idempotencyKey: 'doc_1_apt',
    });
    assert.equal(docRes.ok, true);
    assert.equal((await engine.listInAppForUser('doctor_1', 'doctor')).unreadCount, 1);

    const labRes = await engine.dispatch({
      eventType: 'lab_order_updated',
      recipientUid: 'lab_1',
      recipientRole: 'lab',
      title: 'طلب فحص جديد',
      body: 'تم استلام طلب حجز جديد',
      idempotencyKey: 'lab_1_ord',
    });
    assert.equal(labRes.ok, true);
    assert.equal((await engine.listInAppForUser('lab_1', 'lab')).unreadCount, 1);

    const secRes = await engine.dispatch({
      eventType: 'secretary_invitation',
      recipientUid: 'sec_1',
      recipientRole: 'secretary',
      title: 'دعوة توظيف جديدة',
      body: 'تمت دعوتك للعمل كسكرتير',
      idempotencyKey: 'sec_1_inv',
    });
    assert.equal(secRes.ok, true);
    assert.equal((await engine.listInAppForUser('sec_1', 'secretary')).unreadCount, 1);

    // -------------------------------------------------------------------------
    // 6. Safety Guard: WhatsApp Templates & Placeholders Block Medical / OTP Info
    // -------------------------------------------------------------------------
    const unsafeTpl = validateWhatsAppTemplateSafety('نتيجة HbA1c والتشخيص جاهزة مع رمز OTP');
    assert.equal(unsafeTpl.safe, false);
    const simStripped = simulateWhatsAppDispatch({
      eventType: 'appointment_updated',
      template: (await engine.listTemplates())[0],
      phoneInput: '+9647701234567',
      locale: 'ar',
      placeholders: {
        refCode: 'APT-123',
        statusLabel: 'تشخيص السكري HbA1c 7.4%',
      },
    });
    assert.equal(simStripped.ok, true);
    assert.equal(simStripped.bodyPreview.includes('HbA1c'), false);
    assert.equal(simStripped.bodyPreview.includes('تشخيص'), false);

    // -------------------------------------------------------------------------
    // 7. Super Admin RBAC, Hard Lock on Live API, Failure/Retry/Cancel & Imaging Block
    // -------------------------------------------------------------------------
    const nonAdminOverview = await fetch(`${baseUrl}/admin/notifications/overview`, {
      headers: { Authorization: 'Bearer patient_1' },
    });
    assert.equal(nonAdminOverview.status, 403);

    const lockRes = await fetch(`${baseUrl}/admin/notifications/config`, {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer admin_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ whatsappApiConnected: true }),
    });
    assert.equal(lockRes.status, 403);

    // Simulate a failure and retry it via admin endpoint
    const simFailRes = await fetch(`${baseUrl}/admin/notifications/simulate-test`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'whatsapp',
        eventType: 'appointment_updated',
        recipientRole: 'patient',
        phone: '+9647701234567',
        simulateFailure: true,
      }),
    });
    assert.equal(simFailRes.status, 201);
    const simFailJson = (await simFailRes.json()) as { log: { notificationLogId: string; status: string } };
    assert.equal(simFailJson.log.status, 'Failed');

    const retryRes = await fetch(
      `${baseUrl}/admin/notifications/logs/${simFailJson.log.notificationLogId}/retry`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer admin_1' },
      },
    );
    assert.equal(retryRes.status, 200);
    const retryJson = (await retryRes.json()) as { log: { status: string; attemptCount: number } };
    assert.equal(retryJson.log.status, 'Simulated');
    assert.equal(retryJson.log.attemptCount, 2);

    // Radiology / Imaging Portal remains strictly disabled
    const imgBlocked = await engine.dispatch({
      eventType: 'lab_result_ready',
      recipientUid: 'patient_1',
      recipientRole: 'patient',
      title: 'Imaging',
      body: 'Imaging',
      inAppType: 'imaging_result',
      relatedType: 'radiology',
    });
    assert.equal(imgBlocked.ok, false);
    assert.equal(imgBlocked.error, 'IMAGING_PORTAL_DISABLED');

    // -------------------------------------------------------------------------
    // 8. Expanded Doctor Event Catalog, Ownership, Permissions & Hard Stock Block
    // -------------------------------------------------------------------------
    const docEvents = [
      'appointment_booked',
      'appointment_cancelled',
      'appointment_rescheduled',
      'lab_result_received',
      'diagnostic_report_received',
      'patient_message_received',
      'prescription_status_updated',
      'important_account_update',
    ] as const;

    for (const ev of docEvents) {
      const r = await engine.dispatch({
        eventType: ev,
        recipientUid: 'doctor_1',
        recipientRole: 'doctor',
        title: `Doc ${ev}`,
        body: `Body ${ev}`,
        relatedId: `rel_${ev}`,
        ...(ev === 'diagnostic_report_received' || ev === 'lab_result_received'
          ? { sourceOrderDoctorUid: 'doctor_1' }
          : {}),
        idempotencyKey: `exp_doc_${ev}`,
      });
      assert.equal(r.ok, true, `Doctor event ${ev} should succeed`);
      assert.equal(
        r.log?.iconCategory,
        NOTIFICATION_EVENT_CATALOG[ev].iconCategory,
        `Icon category should match catalog for ${ev}`,
      );
    }

    // Ownership guard: unlinked diagnostic report for wrong doctor MUST fail
    const wrongDocReport = await engine.dispatch({
      eventType: 'diagnostic_report_received',
      recipientUid: 'doctor_1',
      recipientRole: 'doctor',
      title: 'Other Doctor Report',
      body: 'Mismatch',
      sourceOrderDoctorUid: 'doctor_other',
    });
    assert.equal(wrongDocReport.ok, false);
    assert.equal(wrongDocReport.error, 'FORBIDDEN_UNLINKED_DOCTOR_REPORT');

    // Permission guard: missing permission blocked cleanly
    const noPermBlocked = await engine.dispatch({
      eventType: 'appointment_booked',
      recipientUid: 'doctor_1',
      recipientRole: 'doctor',
      title: 'Blocked by RBAC',
      body: 'No permission',
      permissionGranted: false,
    });
    assert.equal(noPermBlocked.ok, false);
    assert.equal(noPermBlocked.error, 'RECIPIENT_PERMISSION_REQUIRED');

    // HARD BLOCK: Doctors MUST NEVER receive medicine / pharmacy / wholesaler stock alerts
    for (const forbiddenEv of [
      'medicine_available',
      'medicine_favorite_available',
      'pharmacy_stock_updated',
      'wholesaler_medicine_available',
    ] as const) {
      assert.equal(DOCTOR_FORBIDDEN_STOCK_EVENTS.has(forbiddenEv), true);
      const blocked = await engine.dispatch({
        eventType: forbiddenEv,
        recipientUid: 'doctor_1',
        recipientRole: 'doctor',
        title: 'Commercial Stock Alert',
        body: 'Must be blocked',
      });
      assert.equal(blocked.ok, false);
      assert.equal(blocked.error, 'DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN');
    }

    const httpDocBlockRes = await fetch(`${baseUrl}/admin/notifications/simulate-test`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: 'in_app',
        eventType: 'medicine_available',
        recipientRole: 'doctor',
      }),
    });
    assert.equal(httpDocBlockRes.status, 403);

    // -------------------------------------------------------------------------
    // 9. Expanded Patient & Lab Events + Stored Icon & ActionRoute Contracts
    // -------------------------------------------------------------------------
    const patEvents = [
      'appointment_confirmed',
      'appointment_reminder',
      'appointment_cancelled',
      'lab_result_available',
      'prescription_received',
      'doctor_message_received',
      'important_account_update',
    ] as const;

    for (const ev of patEvents) {
      const r = await engine.dispatch({
        eventType: ev,
        recipientUid: 'patient_1',
        recipientRole: 'patient',
        title: `Patient ${ev}`,
        body: `Body ${ev}`,
        relatedId: `pat_${ev}`,
        idempotencyKey: `exp_pat_${ev}`,
      });
      assert.equal(r.ok, true, `Patient event ${ev} should succeed`);
    }

    const patientListAfter = await engine.listInAppForUser('patient_1', 'patient');
    const rxNotif = patientListAfter.notifications.find(
      (n) => n.eventType === 'prescription_received',
    );
    assert.ok(rxNotif, 'Prescription received notification stored in-app');
    assert.equal(rxNotif?.iconCategory, 'prescription');
    const rxRoute = rxNotif?.actionRoute as { section?: string; tab?: string } | undefined;
    assert.equal(rxRoute?.section, 'medical_record');
    assert.equal(rxRoute?.tab, 'prescriptions');

    const labEvents = [
      'lab_order_created',
      'lab_booking_created',
      'lab_booking_confirmed',
      'lab_booking_rejected',
      'lab_order_status_updated',
    ] as const;
    for (const ev of labEvents) {
      const targetRole = ev === 'lab_booking_confirmed' || ev === 'lab_booking_rejected' ? 'patient' : 'lab';
      const targetUid = targetRole === 'patient' ? 'patient_1' : 'lab_1';
      const r = await engine.dispatch({
        eventType: ev,
        recipientUid: targetUid,
        recipientRole: targetRole,
        title: `Lab ${ev}`,
        body: `Body ${ev}`,
        relatedId: `lab_${ev}`,
        idempotencyKey: `exp_lab_${ev}`,
      });
      assert.equal(r.ok, true, `Lab event ${ev} should succeed`);
    }

    // -------------------------------------------------------------------------
    // 10. Future Pharmacy Contract: Stock Update -> Strictly Eligible Patients Only
    // -------------------------------------------------------------------------
    await db.doc('users/pharm_1').set({ uid: 'pharm_1', selectedPortal: 'pharmacy' });
    await db.doc('users/patient_req').set({ uid: 'patient_req', selectedPortal: 'patient' });
    await db.doc('users/patient_fav').set({ uid: 'patient_fav', selectedPortal: 'patient' });
    await db.doc('users/patient_rem').set({ uid: 'patient_rem', selectedPortal: 'patient' });
    await db.doc('users/patient_unrelated').set({ uid: 'patient_unrelated', selectedPortal: 'patient' });
    await db.doc('users/patient_other_pharm').set({ uid: 'patient_other_pharm', selectedPortal: 'patient' });

    await registerPatientMedicineWatch(db, {
      patientUid: 'patient_req',
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_amox_500',
      medicineRefCode: 'MED-AMX',
      source: 'medicine_request',
    });
    await registerPatientMedicineWatch(db, {
      patientUid: 'patient_fav',
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_amox_500',
      medicineRefCode: 'MED-AMX',
      source: 'medicine_favorite',
    });
    await registerPatientMedicineWatch(db, {
      patientUid: 'patient_rem',
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_amox_500',
      medicineRefCode: 'MED-AMX',
      source: 'availability_reminder',
    });
    // Registered for a DIFFERENT pharmacy — MUST NOT receive alert for pharm_1
    await registerPatientMedicineWatch(db, {
      patientUid: 'patient_other_pharm',
      pharmacyUid: 'pharm_2',
      pharmacyName: 'صيدلية أخرى',
      medicineId: 'med_amox_500',
      medicineRefCode: 'MED-AMX',
      source: 'medicine_request',
    });

    const beforeDocCount = (await engine.listInAppForUser('doctor_1', 'doctor')).notifications.length;

    const stockUpdate = await handlePharmacyStockUpdateAndNotify(db, engine, {
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_amox_500',
      medicineRefCode: 'MED-AMX',
      status: 'available',
      quantityAvailable: 25,
      simulationTag: 'test_batch_1',
    });

    assert.equal(stockUpdate.pharmacyDispatch.ok, true);
    assert.equal(stockUpdate.eligiblePatientsMatched, 3);
    assert.equal(stockUpdate.patientDispatches.length, 3);
    assert.equal((await engine.listInAppForUser('patient_req', 'patient')).unreadCount, 1);
    assert.equal((await engine.listInAppForUser('patient_fav', 'patient')).unreadCount, 1);
    assert.equal((await engine.listInAppForUser('patient_rem', 'patient')).unreadCount, 1);
    assert.equal((await engine.listInAppForUser('patient_unrelated', 'patient')).unreadCount, 0);
    assert.equal((await engine.listInAppForUser('patient_other_pharm', 'patient')).unreadCount, 0);
    // Doctors NEVER receive stock notifications
    assert.equal(
      (await engine.listInAppForUser('doctor_1', 'doctor')).notifications.length,
      beforeDocCount,
    );

    // -------------------------------------------------------------------------
    // 11. Future Wholesaler (المذخر) Contract: Linked Request -> Offer -> Status
    // -------------------------------------------------------------------------
    await db.doc('users/wholesaler_1').set({ uid: 'wholesaler_1', selectedPortal: 'wholesaler' });
    await db.doc('users/pharm_other').set({ uid: 'pharm_other', selectedPortal: 'pharmacy' });

    const whReq = await submitPharmacyRequestToWholesaler(db, engine, {
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      wholesalerUid: 'wholesaler_1',
      wholesalerName: 'مذخر الرافدين',
      medicineId: 'med_insulin_99',
      medicineRefCode: 'MED-INS-99',
      requestedQuantity: 40,
    });
    assert.equal(whReq.pharmacyDispatch.ok, true);
    assert.equal(whReq.wholesalerDispatch.ok, true);
    assert.equal((await engine.listInAppForUser('wholesaler_1', 'wholesaler')).unreadCount, 1);

    const whOffer = await recordWholesalerInventoryOffer(db, engine, {
      pharmacyRequestId: whReq.request.requestId,
      wholesalerUid: 'wholesaler_1',
      wholesalerName: 'مذخر الرافدين',
      availableQuantity: 40,
    });
    assert.equal(whOffer.pharmacyDispatch.ok, true);
    assert.equal(whOffer.pharmacyDispatch.log?.eventType, 'wholesaler_medicine_available');

    const whStatus = await updateWholesalerOrderStatus(db, engine, {
      pharmacyRequestId: whReq.request.requestId,
      wholesalerUid: 'wholesaler_1',
      status: 'dispatched',
    });
    assert.equal(whStatus.pharmacyDispatch.ok, true);
    // Unrelated pharmacy received ZERO alerts
    assert.equal((await engine.listInAppForUser('pharm_other', 'pharmacy')).unreadCount, 0);

    // -------------------------------------------------------------------------
    // 12. Admin Overview Catalog, Template Safety, Drug Scrubbing & Simulation API
    // -------------------------------------------------------------------------
    const allTemplates = await engine.listTemplates();
    assert.ok(allTemplates.length >= 38, 'All catalog templates seeded');
    for (const tpl of allTemplates) {
      assert.equal(
        validateWhatsAppTemplateSafety(tpl.bodyAr).safe,
        true,
        `Arabic WhatsApp template ${tpl.eventType} must be safe`,
      );
      assert.equal(
        validateWhatsAppTemplateSafety(tpl.bodyEn).safe,
        true,
        `English WhatsApp template ${tpl.eventType} must be safe`,
      );
    }

    // Confirm drug names & dosages are stripped in WhatsApp simulation preview
    const drugScrubSim = simulateWhatsAppDispatch({
      eventType: 'medicine_available',
      template: allTemplates.find((t) => t.eventType === 'medicine_available')!,
      phoneInput: '+9647701234567',
      locale: 'en',
      placeholders: {
        refCode: 'Amoxicillin 500mg tablet',
        statusLabel: 'Insulin',
        dateLabel: '2026-12-01',
      },
    });
    assert.equal(drugScrubSim.ok, true);
    assert.equal(drugScrubSim.bodyPreview.toLowerCase().includes('amoxicillin'), false);
    assert.equal(drugScrubSim.bodyPreview.toLowerCase().includes('insulin'), false);

    // Icon inference & route resolution checks
    assert.equal(inferNotificationIconCategory('wholesaler_medicine_available'), 'wholesaler');
    assert.equal(
      resolveNotificationActionRoute('doctor', 'lab_result_received', 'res_1')?.requiredPermission,
      'viewMedicalRecords',
    );

    const overviewHttp = await fetch(`${baseUrl}/admin/notifications/overview`, {
      headers: { Authorization: 'Bearer admin_1' },
    });
    assert.equal(overviewHttp.status, 200);
    const overviewJson = (await overviewHttp.json()) as {
      config: { whatsappApiConnected: boolean; channels: string[] };
      catalog: unknown[];
    };
    assert.equal(overviewJson.config.whatsappApiConnected, false);
    assert.deepEqual(overviewJson.config.channels, ['in_app', 'whatsapp']);
    assert.ok(Array.isArray(overviewJson.catalog) && overviewJson.catalog.length >= 38);

    const contractFlowRes = await fetch(`${baseUrl}/admin/notifications/simulate-contract-flow`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ flowType: 'pharmacy_eligibility', locale: 'ar' }),
    });
    assert.equal(contractFlowRes.status, 201);
    const contractFlowJson = (await contractFlowRes.json()) as {
      ok: boolean;
      flowType: string;
      steps: Array<{ step: string; ok: boolean; error?: string }>;
    };
    assert.equal(contractFlowJson.ok, true);
    assert.equal(contractFlowJson.flowType, 'pharmacy_eligibility');
    assert.equal(
      contractFlowJson.steps.find((s) => s.step === 'eligible_patient_notified')?.ok,
      true,
    );
    assert.equal(
      contractFlowJson.steps.find((s) => s.step === 'doctor_commercial_stock_blocked')?.error,
      'DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN',
    );

    const wholesalerFlowRes = await fetch(`${baseUrl}/admin/notifications/simulate-contract-flow`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer admin_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ flowType: 'wholesaler_cycle', locale: 'en' }),
    });
    assert.equal(wholesalerFlowRes.status, 201);
    const wholesalerFlowJson = (await wholesalerFlowRes.json()) as {
      ok: boolean;
      flowType: string;
      steps: Array<{ step: string; ok: boolean; error?: string }>;
    };
    assert.equal(wholesalerFlowJson.ok, true);
    assert.equal(wholesalerFlowJson.flowType, 'wholesaler_cycle');
    assert.equal(
      wholesalerFlowJson.steps.find((s) => s.step === 'wholesaler_request_submitted')?.ok,
      true,
    );
    assert.equal(
      wholesalerFlowJson.steps.find((s) => s.step === 'wholesaler_medicine_available')?.ok,
      true,
    );

    // -------------------------------------------------------------------------
    // 13. Premium Visual System: 12 Visual Kinds & Independent Workflow States
    // -------------------------------------------------------------------------
    assert.equal(Object.keys(NOTIFICATION_VISUAL_LABELS).length, 12);
    assert.equal(resolveNotificationVisualKind({ eventType: 'appointment_booked' }), 'appointment');
    assert.equal(resolveNotificationVisualKind({ relatedType: 'doctor_profile' }), 'doctor');
    assert.equal(resolveNotificationVisualKind({ eventType: 'lab_order_created' }), 'lab_test');
    assert.equal(resolveNotificationVisualKind({ eventType: 'lab_result_available' }), 'lab_result');
    assert.equal(resolveNotificationVisualKind({ eventType: 'prescription_received' }), 'prescription');
    assert.equal(resolveNotificationVisualKind({ eventType: 'medicine_availability_reminder' }), 'medicine');
    assert.equal(resolveNotificationVisualKind({ eventType: 'medicine_available' }), 'medicine_available');
    assert.equal(resolveNotificationVisualKind({ eventType: 'pharmacy_order_updated' }), 'pharmacy');
    assert.equal(resolveNotificationVisualKind({ eventType: 'wholesaler_request_submitted' }), 'wholesaler');
    assert.equal(resolveNotificationVisualKind({ eventType: 'doctor_message_received' }), 'message');
    assert.equal(resolveNotificationVisualKind({ eventType: 'security_alert' }), 'admin_alert');
    assert.equal(resolveNotificationVisualKind({ eventType: 'appointment_cancelled' }), 'cancelled');
    assert.equal(resolveNotificationVisualKind({ eventType: 'lab_booking_rejected' }), 'cancelled');

    const pendingMeta = resolveNotificationWorkflowMeta({ eventType: 'lab_order_created' });
    assert.equal(pendingMeta.state, 'pending');
    assert.equal(pendingMeta.labelAr, 'قيد المعالجة');

    const completedMeta = resolveNotificationWorkflowMeta({ eventType: 'lab_result_available' });
    assert.equal(completedMeta.state, 'completed');
    assert.equal(completedMeta.labelAr, 'مكتمل');

    const cancelledMeta = resolveNotificationWorkflowMeta({ eventType: 'appointment_cancelled' });
    assert.equal(cancelledMeta.state, 'cancelled');
    assert.equal(cancelledMeta.labelAr, 'ملغي');

    // -------------------------------------------------------------------------
    // 14. Security & Integration Hardening (Phase 1)
    // -------------------------------------------------------------------------
    // 14a. Reject roleHint spoofing across GET/PUT preferences & GET/PATCH/POST in-app
    for (const spoofRole of ['doctor', 'lab', 'secretary', 'super_admin', 'unknown_role']) {
      const spoofListRes = await fetch(`${baseUrl}/notifications/in-app?role=${spoofRole}`, {
        headers: { Authorization: 'Bearer patient_1' },
      });
      assert.equal(
        spoofListRes.status,
        403,
        `patient_1 spoofing GET /in-app?role=${spoofRole} must fail 403`,
      );

      const spoofReadAllRes = await fetch(`${baseUrl}/notifications/in-app/read-all`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer patient_1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: spoofRole }),
      });
      assert.equal(
        spoofReadAllRes.status,
        403,
        `patient_1 spoofing POST /read-all role=${spoofRole} must fail 403`,
      );

      const spoofPutPrefRes = await fetch(`${baseUrl}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer patient_1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferredChannel: 'in_app',
          whatsappConsent: false,
          role: spoofRole,
        }),
      });
      assert.equal(
        spoofPutPrefRes.status,
        403,
        `patient_1 spoofing PUT /preferences role=${spoofRole} must fail 403`,
      );
    }

    // 14b. Lab staff member MUST NOT access lab manager notifications even with selectedPortal='lab' + roleHint='lab'
    const labUnreadBefore = (await engine.listInAppForUser('lab_1', 'lab')).unreadCount;
    assert.ok(labUnreadBefore >= 1);

    const staffSpoofList = await fetch(`${baseUrl}/notifications/in-app?role=lab`, {
      headers: { Authorization: 'Bearer lab_staff_1' },
    });
    assert.equal(staffSpoofList.status, 403);

    const staffSpoofReadAll = await fetch(`${baseUrl}/notifications/in-app/read-all`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer lab_staff_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'lab' }),
    });
    assert.equal(staffSpoofReadAll.status, 403);

    const staffSpoofPrefs = await fetch(`${baseUrl}/notifications/preferences?role=lab`, {
      headers: { Authorization: 'Bearer lab_staff_1' },
    });
    assert.equal(staffSpoofPrefs.status, 403);

    // Confirm lab_1 unread notifications remain untouched
    assert.equal((await engine.listInAppForUser('lab_1', 'lab')).unreadCount, labUnreadBefore);

    // 14c. Cross-user ownership enforcement: User B cannot read/mark User A's notification
    const patFresh = await engine.dispatch({
      eventType: 'appointment_confirmed',
      recipientUid: 'patient_1',
      recipientRole: 'patient',
      title: 'Ownership Test',
      body: 'Owned strictly by patient_1',
      idempotencyKey: 'own_test_pat1',
    });
    assert.equal(patFresh.ok, true);
    const pat1NotifId = patFresh.log?.inAppNotificationId;
    assert.ok(pat1NotifId);

    const crossUserMarkRead = await fetch(
      `${baseUrl}/notifications/in-app/${encodeURIComponent(pat1NotifId!)}/read?role=patient`,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer patient_req' },
      },
    );
    assert.equal(crossUserMarkRead.status, 404);
    const pat1ListStillUnread = await engine.listInAppForUser('patient_1', 'patient');
    const stillUnreadDoc = pat1ListStillUnread.notifications.find(
      (n) => n.notificationId === pat1NotifId,
    );
    assert.equal(stillUnreadDoc?.isRead, false);

    // 14d. Doctor Portal section RBAC + redirect fallback
    const restrictedWorkspace = {
      actorRole: 'secretary' as const,
      permissions: ['viewAppointments' as const],
    };
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'overview'), true);
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'appointments'), true);
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'prescriptions'), false);
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'clinic_staff'), false);
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'diagnostics'), false);
    assert.equal(canAccessDoctorSection(restrictedWorkspace, 'promotional_banner'), false);
    assert.equal(
      resolveSafeDoctorSection(restrictedWorkspace, 'prescriptions', 'overview'),
      'overview',
    );
    const ownerWorkspace = {
      actorRole: 'doctor' as const,
      permissions: ['viewAppointments' as const],
    };
    assert.equal(canAccessDoctorSection(ownerWorkspace, 'prescriptions'), true);
    assert.equal(canAccessDoctorSection(ownerWorkspace, 'clinic_staff'), true);

    // 14e. Doctor in-app unread counter updates on single read & mark-all-read via HTTP
    const docListRes1 = await fetch(`${baseUrl}/notifications/in-app?role=doctor`, {
      headers: { Authorization: 'Bearer doctor_1' },
    });
    assert.equal(docListRes1.status, 200);
    const docListJson1 = (await docListRes1.json()) as {
      unreadCount: number;
      notifications: Array<{ notificationId: string; isRead: boolean }>;
    };
    assert.ok(docListJson1.unreadCount >= 2);
    const firstDocUnread = docListJson1.notifications.find((n) => !n.isRead)!;
    const singleReadRes = await fetch(
      `${baseUrl}/notifications/in-app/${encodeURIComponent(firstDocUnread.notificationId)}/read`,
      {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer doctor_1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'doctor' }),
      },
    );
    assert.equal(singleReadRes.status, 200);
    const docListRes2 = await fetch(`${baseUrl}/notifications/in-app?role=doctor`, {
      headers: { Authorization: 'Bearer doctor_1' },
    });
    const docListJson2 = (await docListRes2.json()) as { unreadCount: number };
    assert.equal(docListJson2.unreadCount, docListJson1.unreadCount - 1);

    const docReadAllRes = await fetch(`${baseUrl}/notifications/in-app/read-all`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer doctor_1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'doctor' }),
    });
    assert.equal(docReadAllRes.status, 200);
    assert.equal((await engine.listInAppForUser('doctor_1', 'doctor')).unreadCount, 0);

    // 14f. Pharmacy medicine request contract: pharmacy_medicine_request_received + idempotency + anti-doctor guard
    const pharmReqRes1 = await submitPatientMedicineRequestToPharmacy(db, engine, {
      patientUid: 'patient_req',
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_new_01',
      medicineRefCode: 'MED-NEW1',
      requestBatchKey: 'batch_001',
    });
    assert.equal(pharmReqRes1.watch.pharmacyUid, 'pharm_1');
    assert.equal(pharmReqRes1.pharmacyDispatch.ok, true);
    assert.equal(
      pharmReqRes1.pharmacyDispatch.log?.eventType,
      'pharmacy_medicine_request_received',
    );

    // Duplicate request within same batch MUST be blocked by idempotency
    const pharmReqDup = await submitPatientMedicineRequestToPharmacy(db, engine, {
      patientUid: 'patient_req',
      pharmacyUid: 'pharm_1',
      pharmacyName: 'صيدلية بغداد',
      medicineId: 'med_new_01',
      medicineRefCode: 'MED-NEW1',
      requestBatchKey: 'batch_001',
    });
    assert.equal(pharmReqDup.pharmacyDispatch.ok, false);
    assert.equal(pharmReqDup.pharmacyDispatch.duplicateBlocked, true);
    assert.equal(pharmReqDup.pharmacyDispatch.error, 'DUPLICATE_NOTIFICATION_BLOCKED');

    // Targeting a doctor account MUST be rejected cleanly
    await assert.rejects(
      () =>
        submitPatientMedicineRequestToPharmacy(db, engine, {
          patientUid: 'patient_req',
          pharmacyUid: 'doctor_1',
          pharmacyName: 'Not a Pharmacy',
          medicineId: 'med_new_01',
        }),
      /DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN/,
    );

    // Ensure Radiology remains strictly disabled and WhatsApp remains simulation-only
    assert.equal(WHATSAPP_LIVE_API_ENABLED, false);

    console.log('✅ All 14 MEDORA Notification & Security Hardening tests passed!');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

runTests().catch((err) => {
  console.error('❌ Notification test suite failed:', err);
  process.exit(1);
});
