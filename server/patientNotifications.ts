import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import {
  inferNotificationIconCategory,
  resolveNotificationActionRoute,
} from '../src/constants/notificationCatalog.ts';
import type {
  NotificationActionRoute,
  NotificationEventType,
} from '../src/types/notifications.ts';
import { IMAGING_PORTAL_ENABLED } from './featureFlags.ts';
import { getGlobalNotificationEngine } from './notificationEngine.ts';

export type PatientNotifType =
  | 'appointment'
  | 'message'
  | 'lab_result'
  | 'imaging_result'
  | 'reminder'
  | 'announcement';

export function getBaghdadNow(): {
  dateStr: string;
  timeStr: string;
  minutesOfDay: number;
  utcMs: number;
} {
  const utcMs = Date.now();
  // Asia/Baghdad is permanently UTC+3 (no DST)
  const baghdadMs = utcMs + 3 * 60 * 60 * 1000;
  const dt = new Date(baghdadMs);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const hh = dt.getUTCHours();
  const mm = dt.getUTCMinutes();
  return {
    dateStr: `${y}-${m}-${d}`,
    timeStr: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minutesOfDay: hh * 60 + mm,
    utcMs,
  };
}

function resolveNotificationEventForPatient(
  type: PatientNotifType,
  relatedType?: string,
  explicitEventType?: NotificationEventType,
): { eventType: NotificationEventType; statusLabel: string } {
  if (explicitEventType) {
    const labelMap: Partial<Record<NotificationEventType, string>> = {
      appointment_confirmed: 'مؤكد',
      appointment_cancelled: 'ملغى',
      appointment_rescheduled: 'معاد جدولته',
      appointment_reminder: 'تذكير بالموعد',
      lab_result_available: 'تقرير جاهز',
      prescription_received: 'وصفة جديدة',
      doctor_message_received: 'رسالة من الطبيب',
      lab_booking_confirmed: 'حجز مؤكد',
      lab_booking_rejected: 'حجز ملغى/مرفوض',
      lab_order_status_updated: 'تحديث التحليل',
    };
    return {
      eventType: explicitEventType,
      statusLabel: labelMap[explicitEventType] || 'محدّث',
    };
  }
  if (type === 'lab_result' || relatedType === 'lab_result') {
    return { eventType: 'lab_result_available', statusLabel: 'تقرير جاهز' };
  }
  if (relatedType === 'lab_booking' || relatedType === 'lab_home_collection') {
    return { eventType: 'lab_order_status_updated', statusLabel: 'تحديث طلب المختبر' };
  }
  if (relatedType === 'prescription') {
    return { eventType: 'prescription_received', statusLabel: 'وصفة جديدة' };
  }
  if (relatedType === 'prescription_purchase') {
    return { eventType: 'prescription_purchase_confirmed', statusLabel: 'تم التأكيد' };
  }
  if (relatedType === 'pharmacy_order') {
    return { eventType: 'pharmacy_order_updated', statusLabel: 'محدّث' };
  }
  if (type === 'reminder') {
    return { eventType: 'appointment_reminder', statusLabel: 'تذكير بالموعد' };
  }
  if (type === 'message') {
    return { eventType: 'doctor_message_received', statusLabel: 'رسالة جديدة' };
  }
  if (type === 'announcement') {
    return { eventType: 'admin_notice', statusLabel: 'إشعار منصة' };
  }
  return { eventType: 'appointment_updated', statusLabel: 'محدّث' };
}

export async function emitPatientNotification(
  db: Firestore,
  params: {
    patientUid: string;
    type: PatientNotifType;
    eventType?: NotificationEventType;
    actionRoute?: NotificationActionRoute;
    title: string;
    body: string;
    relatedId?: string;
    relatedType?: string;
    deterministicId?: string;
    idempotencyKey?: string;
  },
): Promise<void> {
  const patientUid = String(params.patientUid || '').trim();
  if (!patientUid) return;

  if (
    !IMAGING_PORTAL_ENABLED &&
    (params.type === 'imaging_result' ||
      params.relatedType === 'imaging' ||
      params.relatedType === 'radiology')
  ) {
    return;
  }

  try {
    // Respect explicit patient category notification preferences when configured
    const profSnap = await db.doc(`patient_profiles/${patientUid}`).get();
    if (profSnap.exists) {
      const pData = profSnap.data() || {};
      const prefs = (pData.preferences as Record<string, unknown> | undefined)?.notifications as
        | Record<string, unknown>
        | undefined;
      if (prefs) {
        if (params.type === 'appointment' && prefs.appointments === false) return;
        if (params.type === 'reminder' && prefs.reminders24h === false) return;
        if (params.type === 'message' && prefs.messages === false) return;
        if ((params.type === 'lab_result' || params.type === 'imaging_result') && prefs.results === false) {
          return;
        }
        if (params.type === 'announcement' && prefs.announcements === false) return;
      }
    }

    const engine = getGlobalNotificationEngine();
    const mapped = resolveNotificationEventForPatient(
      params.type,
      params.relatedType,
      params.eventType,
    );
    const notificationId = params.deterministicId
      ? params.deterministicId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
      : `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const iconCategory = inferNotificationIconCategory(
      mapped.eventType,
      params.type,
      params.relatedType,
    );
    const actionRoute =
      params.actionRoute ||
      resolveNotificationActionRoute(
        'patient',
        mapped.eventType,
        params.relatedId,
        params.relatedType,
      );

    if (engine) {
      await engine.dispatch({
        eventType: mapped.eventType,
        recipientUid: patientUid,
        recipientRole: 'patient',
        title: String(params.title || '').slice(0, 180),
        body: String(params.body || '').slice(0, 600),
        inAppType: params.type,
        iconCategory,
        actionRoute,
        relatedId: params.relatedId,
        relatedType: params.relatedType,
        deterministicInAppId: params.deterministicId,
        idempotencyKey:
          params.idempotencyKey ||
          (params.deterministicId ? `patient:${params.deterministicId}` : undefined),
        placeholders: {
          refCode: (params.relatedId || notificationId).slice(0, 16).toUpperCase(),
          statusLabel: mapped.statusLabel,
          dateLabel: getBaghdadNow().dateStr,
        },
      });
      return;
    }

    // Fallback when engine is not bound (writes in-app notification only)
    const ref = db.doc(`patient_notifications/${notificationId}`);
    if (params.deterministicId) {
      const existing = await ref.get();
      if (existing.exists) return;
    }

    await ref.set({
      notificationId,
      patientUid,
      type: params.type,
      eventType: mapped.eventType,
      iconCategory,
      ...(actionRoute ? { actionRoute } : {}),
      title: String(params.title || '').slice(0, 180),
      body: String(params.body || '').slice(0, 600),
      ...(params.relatedId ? { relatedId: String(params.relatedId).slice(0, 128) } : {}),
      ...(params.relatedType ? { relatedType: String(params.relatedType).slice(0, 60) } : {}),
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[MEDORA][PatientNotification] warning:', err);
  }
}

export async function recalculateDoctorRatingSummary(
  db: Firestore,
  doctorUid: string,
): Promise<{ averageRating: number; reviewCount: number }> {
  const revSnap = await db
    .collection('doctor_reviews')
    .where('doctorUid', '==', doctorUid)
    .where('status', '==', 'approved')
    .limit(250)
    .get();

  let sum = 0;
  let count = 0;
  revSnap.docs.forEach((doc) => {
    const r = Number(doc.data()?.rating || 0);
    if (r >= 1 && r <= 5) {
      sum += r;
      count += 1;
    }
  });

  const averageRating = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  const batch = db.batch();
  batch.set(
    db.doc(`doctor_public_cards/${doctorUid}`),
    { averageRating, reviewCount: count, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  const docRef = db.doc(`doctor_profiles/${doctorUid}`);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    batch.update(docRef, {
      averageRating,
      reviewCount: count,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return { averageRating, reviewCount: count };
}

export async function recalculateLabRatingSummary(
  db: Firestore,
  labUid: string,
): Promise<{ averageRating: number; reviewCount: number }> {
  const revSnap = await db
    .collection('lab_reviews')
    .where('labUid', '==', labUid)
    .where('status', '==', 'approved')
    .limit(250)
    .get();

  let sum = 0;
  let count = 0;
  revSnap.docs.forEach((doc) => {
    const r = Number(doc.data()?.rating || 0);
    if (r >= 1 && r <= 5) {
      sum += r;
      count += 1;
    }
  });

  const averageRating = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
  const labRef = db.doc(`lab_profiles/${labUid}`);
  const labSnap = await labRef.get();
  if (labSnap.exists) {
    await labRef.update({
      averageRating,
      reviewCount: count,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return { averageRating, reviewCount: count };
}
