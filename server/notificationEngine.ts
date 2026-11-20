import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  NOTIFICATION_EVENT_CATALOG,
  inferNotificationIconCategory,
  resolveNotificationActionRoute,
} from '../src/constants/notificationCatalog.ts';
import type {
  NotificationActionRoute,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationEventType,
  NotificationIconCategory,
  NotificationLogRecord,
  NotificationRecipientRole,
  NotificationSystemConfig,
  NotificationTemplateRecord,
  UserNotificationChannelPreferences,
} from '../src/types/notifications.ts';
import { IMAGING_PORTAL_ENABLED } from './featureFlags.ts';
import {
  hashIdempotencyKey,
  maskIraqiPhone,
  parseAndNormalizeIraqiPhone,
} from './iraqiPhone.ts';
import {
  simulateWhatsAppDispatch,
  validateWhatsAppTemplateSafety,
} from './whatsappSimulation.ts';

export const ALL_NOTIFICATION_EVENTS: NotificationEventType[] = Object.keys(
  NOTIFICATION_EVENT_CATALOG,
) as NotificationEventType[];

/**
 * Doctors must NEVER receive commercial medicine stock availability alerts
 * or pharmacy/wholesaler inventory notices.
 */
export const DOCTOR_FORBIDDEN_STOCK_EVENTS = new Set<NotificationEventType>([
  'medicine_available',
  'medicine_favorite_available',
  'medicine_availability_reminder',
  'medication_available',
  'pharmacy_medicine_request_received',
  'pharmacy_stock_updated',
  'pharmacy_medicine_unavailable',
  'pharmacy_order_updated',
  'wholesaler_request_submitted',
  'wholesaler_medicine_available',
  'wholesaler_order_status_updated',
]);

const DEFAULT_SYSTEM_CONFIG: NotificationSystemConfig = {
  channels: ['in_app', 'whatsapp'],
  whatsappApiConnected: false,
  whatsappMode: 'simulation',
  officialWhatsAppBrand: 'MEDORA Official WhatsApp Business (Simulation)',
  privacyStrictMode: true,
  maxAttempts: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

interface TemplateSeedSpec {
  eventType: NotificationEventType;
  whatsappTemplateName: string;
  bodyAr: string;
  bodyEn: string;
}

const TEMPLATE_SEEDS: TemplateSeedSpec[] = [
  // Doctor events
  {
    eventType: 'appointment_booked',
    whatsappTemplateName: 'medora_doc_appointment_booked',
    bodyAr:
      'منصة MEDORA: تم تسجيل حجز موعد جديد ({refCode}) بتاريخ {dateLabel}. يرجى فتح بوابة الطبيب للمتابعة.',
    bodyEn:
      'MEDORA: New clinic appointment ({refCode}) booked for {dateLabel}. Open MEDORA Doctor Portal.',
  },
  {
    eventType: 'appointment_cancelled',
    whatsappTemplateName: 'medora_appointment_cancelled',
    bodyAr:
      'منصة MEDORA: تم إلغاء الموعد المرجعي ({refCode}) بتاريخ {dateLabel}. افتح المنصة لمراجعة الجدول.',
    bodyEn:
      'MEDORA: Appointment reference ({refCode}) on {dateLabel} was cancelled. Check MEDORA.',
  },
  {
    eventType: 'appointment_rescheduled',
    whatsappTemplateName: 'medora_appointment_rescheduled',
    bodyAr:
      'منصة MEDORA: تم تعديل موعد الحجز المرجعي ({refCode}) إلى {dateLabel}. افتح المنصة للتفاصيل.',
    bodyEn:
      'MEDORA: Appointment reference ({refCode}) rescheduled to {dateLabel}. Open MEDORA for details.',
  },
  {
    eventType: 'lab_result_received',
    whatsappTemplateName: 'medora_doc_lab_received',
    bodyAr:
      'منصة MEDORA: وصلت نتيجة مختبر مرتبطة بطلبك المرجعي ({refCode}). افتح المنصة للمراجعة الآمنة.',
    bodyEn:
      'MEDORA: Linked lab report ({refCode}) received in your Doctor Portal for secure review.',
  },
  {
    eventType: 'diagnostic_report_received',
    whatsappTemplateName: 'medora_doc_diagnostic_received',
    bodyAr:
      'منصة MEDORA: تم إرفاق تقرير فحص مختبري لطلبك ({refCode}). راجع التقرير داخل بوابة الطبيب.',
    bodyEn:
      'MEDORA: Linked diagnostic lab report ({refCode}) is now available in your Doctor Portal.',
  },
  {
    eventType: 'patient_message_received',
    whatsappTemplateName: 'medora_patient_message',
    bodyAr:
      'منصة MEDORA: وصلتك رسالة جديدة من مراجع ({refCode}). افتح المنصة للرد الآمن.',
    bodyEn:
      'MEDORA: You received a new patient message ({refCode}). Open MEDORA to reply.',
  },
  {
    eventType: 'prescription_status_updated',
    whatsappTemplateName: 'medora_doc_rx_status',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة المستند المرجعي ({refCode}) إلى {statusLabel}. راجع المنصة.',
    bodyEn:
      'MEDORA: Document reference ({refCode}) status updated to {statusLabel}. Check MEDORA.',
  },

  // Patient events
  {
    eventType: 'appointment_confirmed',
    whatsappTemplateName: 'medora_patient_apt_confirmed',
    bodyAr:
      'منصة MEDORA: تم تأكيد موعدك المرجعي ({refCode}) بتاريخ {dateLabel}. نرجو الحضور في الوقت المحدد.',
    bodyEn:
      'MEDORA: Your appointment ({refCode}) on {dateLabel} is confirmed. Open MEDORA for details.',
  },
  {
    eventType: 'appointment_reminder',
    whatsappTemplateName: 'medora_appointment_reminder',
    bodyAr:
      'منصة MEDORA: تذكير بموعدك القادم ({refCode}) بتاريخ {dateLabel}. يرجى فتح المنصة لمراجعة التفاصيل.',
    bodyEn:
      'MEDORA: Reminder for your upcoming appointment ({refCode}) on {dateLabel}. Check MEDORA for details.',
  },
  {
    eventType: 'lab_result_available',
    whatsappTemplateName: 'medora_patient_lab_available',
    bodyAr:
      'منصة MEDORA: تقرير المختبر المرجعي ({refCode}) أصبح متاحاً داخل حسابك. افتح المنصة للمراجعة الآمنة.',
    bodyEn:
      'MEDORA: Lab report reference ({refCode}) is now ready inside your MEDORA account.',
  },
  {
    eventType: 'prescription_received',
    whatsappTemplateName: 'medora_patient_doc_received',
    bodyAr:
      'منصة MEDORA: تم إصدار مستند وصفة جديد ({refCode}) في حسابك. يرجى فتح المنصة للاطلاع.',
    bodyEn:
      'MEDORA: A new care document ({refCode}) has been added to your MEDORA medical record.',
  },
  {
    eventType: 'doctor_message_received',
    whatsappTemplateName: 'medora_doctor_message',
    bodyAr:
      'منصة MEDORA: لديك رسالة جديدة من العيادة ({refCode}). افتح المنصة للرد والمتابعة.',
    bodyEn:
      'MEDORA: You have a new clinic message ({refCode}). Open MEDORA to read and reply.',
  },
  {
    eventType: 'medicine_available',
    whatsappTemplateName: 'medora_pharmacy_item_available',
    bodyAr:
      'منصة MEDORA: الطلب الدوائي المرجعي ({refCode}) أصبح متوفراً الآن في الصيدلية المختارة. افتح المنصة للتفاصيل.',
    bodyEn:
      'MEDORA: Your requested pharmacy item ({refCode}) is now available. Open MEDORA for details.',
  },
  {
    eventType: 'medicine_favorite_available',
    whatsappTemplateName: 'medora_favorite_item_available',
    bodyAr:
      'منصة MEDORA: أحد الأصناف المحفوظة في مفضلتك ({refCode}) أصبح متوفراً في الصيدلية. راجع المنصة.',
    bodyEn:
      'MEDORA: A saved favorite item ({refCode}) is now available at your chosen pharmacy. Open MEDORA.',
  },
  {
    eventType: 'medicine_availability_reminder',
    whatsappTemplateName: 'medora_availability_reminder',
    bodyAr:
      'منصة MEDORA: تذكير بتوفّر الصنف المرجعي ({refCode}) الذي فعّلت التنبيه له في الصيدلية.',
    bodyEn:
      'MEDORA: Availability reminder for item reference ({refCode}) at your selected pharmacy.',
  },

  // Pharmacy & Wholesaler future contract events
  {
    eventType: 'pharmacy_medicine_request_received',
    whatsappTemplateName: 'medora_pharmacy_req_received',
    bodyAr:
      'منصة MEDORA: وصل طلب صيدلاني مرجعي جديد ({refCode}) - الحالة: {statusLabel}. افتح المنصة.',
    bodyEn:
      'MEDORA: New pharmacy request ({refCode}) received - status: {statusLabel}. Open MEDORA.',
  },
  {
    eventType: 'pharmacy_stock_updated',
    whatsappTemplateName: 'medora_pharmacy_stock_updated',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة التوفّر في الصيدلية للمرجع ({refCode}) إلى {statusLabel}.',
    bodyEn:
      'MEDORA: Pharmacy stock reference ({refCode}) updated to {statusLabel}.',
  },
  {
    eventType: 'pharmacy_medicine_unavailable',
    whatsappTemplateName: 'medora_pharmacy_item_unavailable',
    bodyAr:
      'منصة MEDORA: تنبيه صيدلية — الصنف المرجعي ({refCode}) غير متوفر حالياً ({statusLabel}).',
    bodyEn:
      'MEDORA: Pharmacy inventory alert — reference ({refCode}) marked {statusLabel}.',
  },
  {
    eventType: 'wholesaler_request_submitted',
    whatsappTemplateName: 'medora_wholesaler_req_submitted',
    bodyAr:
      'منصة MEDORA: تم تسجيل طلب المذخر المرجعي ({refCode}) بنجاح ({statusLabel}). تابع عبر المنصة.',
    bodyEn:
      'MEDORA: Wholesaler order request ({refCode}) submitted ({statusLabel}). Track in MEDORA.',
  },
  {
    eventType: 'wholesaler_medicine_available',
    whatsappTemplateName: 'medora_wholesaler_item_available',
    bodyAr:
      'منصة MEDORA: قام المذخر بتأكيد توفّر العرض للطلب ({refCode}) - {statusLabel}. افتح المنصة.',
    bodyEn:
      'MEDORA: Wholesaler confirmed availability for request ({refCode}) - {statusLabel}. Open MEDORA.',
  },
  {
    eventType: 'wholesaler_order_status_updated',
    whatsappTemplateName: 'medora_wholesaler_status_update',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة طلب المذخر ({refCode}) إلى {statusLabel}. راجع المنصة.',
    bodyEn:
      'MEDORA: Wholesaler order ({refCode}) status is now {statusLabel}. Open MEDORA.',
  },

  // Laboratory events
  {
    eventType: 'lab_order_created',
    whatsappTemplateName: 'medora_lab_order_created',
    bodyAr:
      'منصة MEDORA: تم إنشاء طلب فحص مختبري جديد ({refCode}) بتاريخ {dateLabel}. افتح المنصة للمتابعة.',
    bodyEn:
      'MEDORA: New laboratory order ({refCode}) created on {dateLabel}. Open MEDORA to follow up.',
  },
  {
    eventType: 'lab_booking_created',
    whatsappTemplateName: 'medora_lab_booking_created',
    bodyAr:
      'منصة MEDORA: تم استلام حجز مختبر جديد ({refCode}) بتاريخ {dateLabel}. راجع بوابة المختبر.',
    bodyEn:
      'MEDORA: New lab booking ({refCode}) received for {dateLabel}. Open MEDORA Lab Portal.',
  },
  {
    eventType: 'lab_booking_confirmed',
    whatsappTemplateName: 'medora_lab_booking_confirmed',
    bodyAr:
      'منصة MEDORA: تم تأكيد حجز المختبر المرجعي ({refCode}) بتاريخ {dateLabel}. يرجى مراجعة التعليمات بالمنصة.',
    bodyEn:
      'MEDORA: Lab booking ({refCode}) for {dateLabel} has been confirmed. View instructions in MEDORA.',
  },
  {
    eventType: 'lab_booking_rejected',
    whatsappTemplateName: 'medora_lab_booking_rejected',
    bodyAr:
      'منصة MEDORA: تعذر اعتماد حجز المختبر المرجعي ({refCode}) - الحالة: {statusLabel}. افتح المنصة.',
    bodyEn:
      'MEDORA: Lab booking ({refCode}) status updated to {statusLabel}. Open MEDORA for details.',
  },
  {
    eventType: 'lab_order_status_updated',
    whatsappTemplateName: 'medora_lab_order_status',
    bodyAr:
      'منصة MEDORA: تم تحديث مرحلة طلب المختبر ({refCode}) إلى {statusLabel}. افتح المنصة.',
    bodyEn:
      'MEDORA: Lab order ({refCode}) stage updated to {statusLabel}. Open MEDORA.',
  },

  // Shared / Account / Legacy compatible events
  {
    eventType: 'important_account_update',
    whatsappTemplateName: 'medora_important_account_update',
    bodyAr:
      'منصة MEDORA: يوجد تحديث مهم على إعدادات حسابك ({statusLabel}). يرجى مراجعة بوابة الحساب.',
    bodyEn:
      'MEDORA: Important update applied to your account ({statusLabel}). Review in MEDORA.',
  },
  {
    eventType: 'appointment_updated',
    whatsappTemplateName: 'medora_appointment_update',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة الحجز ({refCode}) إلى {statusLabel}. يرجى فتح المنصة للاطلاع على التفاصيل.',
    bodyEn:
      'MEDORA: Booking ({refCode}) status is now {statusLabel}. Open MEDORA to view details.',
  },
  {
    eventType: 'lab_order_updated',
    whatsappTemplateName: 'medora_lab_order_update',
    bodyAr:
      'منصة MEDORA: يوجد تحديث جديد على طلب المختبر ({refCode}) - الحالة: {statusLabel}. افتح المنصة للاطلاع.',
    bodyEn:
      'MEDORA: Lab request ({refCode}) updated ({statusLabel}). Please open MEDORA.',
  },
  {
    eventType: 'lab_result_ready',
    whatsappTemplateName: 'medora_lab_result_ready',
    bodyAr:
      'منصة MEDORA: تقرير المختبر المرجعي ({refCode}) أصبح متاحاً داخل حسابك. افتح المنصة للمراجعة الآمنة.',
    bodyEn:
      'MEDORA: Lab report reference ({refCode}) is now ready inside your MEDORA account.',
  },
  {
    eventType: 'prescription_issued',
    whatsappTemplateName: 'medora_prescription_issued',
    bodyAr:
      'منصة MEDORA: تم إصدار مستند وصفة جديد ({refCode}) في حسابك. يرجى فتح المنصة للاطلاع.',
    bodyEn:
      'MEDORA: A new medical document ({refCode}) is available in your MEDORA portal.',
  },
  {
    eventType: 'prescription_purchase_confirmed',
    whatsappTemplateName: 'medora_rx_purchase_confirmed',
    bodyAr:
      'منصة MEDORA: تم تأكيد طلب الصرف المرجعي ({refCode}). راجع التفاصيل داخل التطبيق.',
    bodyEn:
      'MEDORA: Order reference ({refCode}) confirmed. Open MEDORA for details.',
  },
  {
    eventType: 'pharmacy_order_updated',
    whatsappTemplateName: 'medora_pharmacy_order_update',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة طلب الصيدلية ({refCode}) إلى {statusLabel}. التفاصيل في التطبيق.',
    bodyEn:
      'MEDORA: Pharmacy order ({refCode}) updated to {statusLabel}. Check MEDORA.',
  },
  {
    eventType: 'medication_available',
    whatsappTemplateName: 'medora_order_ready_pickup',
    bodyAr:
      'منصة MEDORA: الطلب المرجعي ({refCode}) أصبح جاهزاً للاستلام. يرجى مراجعة المنصة.',
    bodyEn:
      'MEDORA: Order reference ({refCode}) is ready for pickup. Check MEDORA.',
  },
  {
    eventType: 'secretary_invitation',
    whatsappTemplateName: 'medora_secretary_invite',
    bodyAr:
      'منصة MEDORA: لديك تحديث إداري في بوابة السكرتير ({refCode}) - الحالة: {statusLabel}.',
    bodyEn:
      'MEDORA: Administrative update in Secretary Portal ({refCode}) - status: {statusLabel}.',
  },
  {
    eventType: 'secretary_task',
    whatsappTemplateName: 'medora_secretary_task',
    bodyAr:
      'منصة MEDORA: تم إسناد مهمة إدارية جديدة ({refCode}). افتح بوابة السكرتير للمتابعة.',
    bodyEn:
      'MEDORA: A new administrative task ({refCode}) was assigned. Open MEDORA Secretary Portal.',
  },
  {
    eventType: 'registration_decision',
    whatsappTemplateName: 'medora_registration_update',
    bodyAr:
      'منصة MEDORA: تم تحديث حالة طلب التسجيل ({refCode}) إلى {statusLabel}. افتح المنصة للاطلاع.',
    bodyEn:
      'MEDORA: Registration request ({refCode}) updated to {statusLabel}. Open MEDORA.',
  },
  {
    eventType: 'message_received',
    whatsappTemplateName: 'medora_new_message',
    bodyAr:
      'منصة MEDORA: لديك رسالة جديدة ({refCode}). افتح المنصة للرد والمتابعة.',
    bodyEn:
      'MEDORA: You have a new message ({refCode}). Open MEDORA to read and reply.',
  },
  {
    eventType: 'admin_notice',
    whatsappTemplateName: 'medora_admin_notice',
    bodyAr:
      'منصة MEDORA: يوجد إشعار رسمي من الإدارة ({refCode}). يرجى فتح المنصة للاطلاع.',
    bodyEn:
      'MEDORA: Official notice from MEDORA Administration ({refCode}). Please open MEDORA.',
  },
  {
    eventType: 'account_security_alert',
    whatsappTemplateName: 'medora_security_alert',
    bodyAr:
      'تنبيه أمان MEDORA: تم تنفيذ تحديث على حسابك ({statusLabel}). راجع الإعدادات داخل المنصة.',
    bodyEn:
      'MEDORA Security Notice: Account settings updated ({statusLabel}). Review inside MEDORA.',
  },
];

const DEFAULT_TEMPLATES: NotificationTemplateRecord[] = TEMPLATE_SEEDS.map((seed) => {
  const cat = NOTIFICATION_EVENT_CATALOG[seed.eventType];
  return {
    templateId: `ntpl_${seed.eventType}`,
    eventType: seed.eventType,
    iconCategory: cat.iconCategory,
    whatsappTemplateName: seed.whatsappTemplateName,
    labelAr: cat.labelAr,
    labelEn: cat.labelEn,
    bodyAr: seed.bodyAr,
    bodyEn: seed.bodyEn,
    enabled: true,
    containsMedicalInfo: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
});

function serializeVal(val: unknown): unknown {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeVal);
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
      out[k] = serializeVal(v);
    }
    return out;
  }
  return val;
}

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function resolveInAppCollection(role: NotificationRecipientRole): {
  collection: string;
  uidField: string;
  defaultNotifType: string;
} {
  if (role === 'patient') {
    return {
      collection: 'patient_notifications',
      uidField: 'patientUid',
      defaultNotifType: 'announcement',
    };
  }
  if (role === 'lab') {
    return {
      collection: 'lab_notifications',
      uidField: 'labUid',
      defaultNotifType: 'admin_notice',
    };
  }
  if (role === 'pharmacy') {
    return {
      collection: 'pharmacy_notifications',
      uidField: 'pharmacyUid',
      defaultNotifType: 'pharmacy_stock_updated',
    };
  }
  if (role === 'wholesaler') {
    return {
      collection: 'wholesaler_notifications',
      uidField: 'wholesalerUid',
      defaultNotifType: 'wholesaler_request_submitted',
    };
  }
  if (role === 'secretary') {
    return {
      collection: 'secretary_notifications',
      uidField: 'secretaryUid',
      defaultNotifType: 'task_assigned',
    };
  }
  if (role === 'doctor') {
    return {
      collection: 'doctor_notifications',
      uidField: 'doctorUid',
      defaultNotifType: 'announcement',
    };
  }
  return {
    collection: 'admin_notifications',
    uidField: 'adminUid',
    defaultNotifType: 'admin_notice',
  };
}

export interface DispatchNotificationInput {
  eventType: NotificationEventType;
  recipientUid: string;
  recipientRole: NotificationRecipientRole;
  title: string;
  body: string;
  inAppType?: string;
  iconCategory?: NotificationIconCategory;
  actionRoute?: NotificationActionRoute;
  relatedId?: string;
  relatedType?: string;
  idempotencyKey?: string;
  deterministicInAppId?: string;
  locale?: 'ar' | 'en';
  explicitChannelOverride?: NotificationChannel;
  explicitPhoneOverride?: string;
  extraInAppFields?: Record<string, unknown>;
  /**
   * Optional ownership & RBAC safety checks before dispatching.
   * If provided and mismatched/denied, notification is cleanly blocked.
   */
  sourceOrderDoctorUid?: string;
  permissionGranted?: boolean;
  placeholders?: {
    refCode?: string;
    statusLabel?: string;
    dateLabel?: string;
  };
  simulateFailure?: boolean;
}

export interface DispatchNotificationResult {
  ok: boolean;
  channelUsed: NotificationChannel;
  duplicateBlocked?: boolean;
  log: NotificationLogRecord | null;
  error?: string;
}

export interface NotificationEngineDeps {
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
}

export class NotificationEngine {
  private readonly deps: NotificationEngineDeps;
  private memConfig: NotificationSystemConfig = { ...DEFAULT_SYSTEM_CONFIG };
  private memTemplates = new Map<NotificationEventType, NotificationTemplateRecord>(
    DEFAULT_TEMPLATES.map((t) => [t.eventType, { ...t }]),
  );
  private memPrefs = new Map<string, UserNotificationChannelPreferences>();
  private memLogs = new Map<string, NotificationLogRecord>();
  private memIdempotency = new Map<string, string>();
  private memInApp = new Map<string, Array<Record<string, unknown>>>();

  constructor(deps: NotificationEngineDeps) {
    this.deps = deps;
  }

  private getDbIfReady(): Firestore | null {
    if (!this.deps.isFirestoreAdminReady()) return null;
    return this.deps.getAdminDb();
  }

  async getSystemConfig(): Promise<NotificationSystemConfig> {
    const db = this.getDbIfReady();
    if (!db) {
      return {
        ...this.memConfig,
        channels: ['in_app', 'whatsapp'],
        whatsappApiConnected: false,
        whatsappMode: 'simulation',
        privacyStrictMode: true,
      };
    }
    try {
      const ref = db.doc('notification_config/default');
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(DEFAULT_SYSTEM_CONFIG);
        return { ...DEFAULT_SYSTEM_CONFIG };
      }
      const data = serializeVal(snap.data()) as Partial<NotificationSystemConfig>;
      return {
        ...DEFAULT_SYSTEM_CONFIG,
        ...data,
        channels: ['in_app', 'whatsapp'],
        whatsappApiConnected: false,
        whatsappMode: 'simulation',
        privacyStrictMode: true,
      };
    } catch {
      return { ...DEFAULT_SYSTEM_CONFIG };
    }
  }

  async listTemplates(): Promise<NotificationTemplateRecord[]> {
    const db = this.getDbIfReady();
    if (!db) {
      return ALL_NOTIFICATION_EVENTS.map((ev) => this.memTemplates.get(ev)!);
    }
    const snap = await db.collection('notification_templates').limit(100).get();
    const byEvent = new Map<string, NotificationTemplateRecord>();
    snap.docs.forEach((doc) => {
      const d = serializeVal(doc.data()) as NotificationTemplateRecord;
      if (d?.eventType) {
        byEvent.set(d.eventType, {
          ...d,
          iconCategory:
            d.iconCategory ||
            NOTIFICATION_EVENT_CATALOG[d.eventType]?.iconCategory ||
            'admin_security',
          containsMedicalInfo: false,
        });
      }
    });

    const missing = DEFAULT_TEMPLATES.filter((t) => !byEvent.has(t.eventType));
    if (missing.length > 0) {
      const batch = db.batch();
      missing.forEach((tpl) => {
        batch.set(db.doc(`notification_templates/${tpl.templateId}`), tpl);
        byEvent.set(tpl.eventType, tpl);
      });
      await batch.commit();
    }

    return ALL_NOTIFICATION_EVENTS.map(
      (ev) => byEvent.get(ev) || this.memTemplates.get(ev)!,
    );
  }

  async resolveLinkedPhone(uid: string): Promise<string | null> {
    const db = this.getDbIfReady();
    if (!db) {
      const pref = this.memPrefs.get(uid);
      if (pref?.linkedPhoneE164) {
        const p = parseAndNormalizeIraqiPhone(pref.linkedPhoneE164);
        if (p.ok) return p.e164;
      }
      return null;
    }

    const verSnap = await db.doc(`phone_verifications/${uid}`).get().catch(() => null);
    if (verSnap?.exists && typeof verSnap.data()?.phoneE164 === 'string') {
      const p = parseAndNormalizeIraqiPhone(String(verSnap.data()!.phoneE164));
      if (p.ok) return p.e164;
    }

    const userSnap = await db.doc(`users/${uid}`).get().catch(() => null);
    if (userSnap?.exists && typeof userSnap.data()?.phone === 'string') {
      const p = parseAndNormalizeIraqiPhone(String(userSnap.data()!.phone));
      if (p.ok) return p.e164;
    }

    const [patSnap, docSnap, labSnap, secSnap, pharmSnap, whSnap] = await Promise.all([
      db.doc(`patient_profiles/${uid}`).get().catch(() => null),
      db.doc(`doctor_profiles/${uid}`).get().catch(() => null),
      db.doc(`lab_profiles/${uid}`).get().catch(() => null),
      db.doc(`secretary_profiles/${uid}`).get().catch(() => null),
      db.doc(`pharmacy_profiles/${uid}`).get().catch(() => null),
      db.doc(`wholesaler_profiles/${uid}`).get().catch(() => null),
    ]);

    const candidates = [
      patSnap?.exists ? patSnap.data()?.phone : null,
      docSnap?.exists ? docSnap.data()?.professionalPhone : null,
      labSnap?.exists ? labSnap.data()?.professionalPhone : null,
      secSnap?.exists ? secSnap.data()?.phone : null,
      pharmSnap?.exists ? pharmSnap.data()?.phone || pharmSnap.data()?.professionalPhone : null,
      whSnap?.exists ? whSnap.data()?.phone || whSnap.data()?.professionalPhone : null,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) {
        const p = parseAndNormalizeIraqiPhone(c);
        if (p.ok) return p.e164;
      }
    }
    return null;
  }

  async resolveVerifiedUserRoles(uid: string): Promise<Set<NotificationRecipientRole>> {
    const roles = new Set<NotificationRecipientRole>();
    const db = this.getDbIfReady();
    if (!db) {
      const memRole = this.memPrefs.get(uid)?.role;
      roles.add(memRole || 'patient');
      return roles;
    }

    const [
      adminSnap,
      docSnap,
      labSnap,
      secSnap,
      secEmpSnap,
      secInvSnap,
      pharmSnap,
      whSnap,
      patSnap,
      userSnap,
    ] = await Promise.all([
      db.doc(`admin_roles/${uid}`).get().catch(() => null),
      db.doc(`doctor_profiles/${uid}`).get().catch(() => null),
      db.doc(`lab_profiles/${uid}`).get().catch(() => null),
      db.doc(`secretary_profiles/${uid}`).get().catch(() => null),
      db.collection('secretary_employments').where('secretaryUid', '==', uid).where('status', '==', 'Active').limit(1).get().catch(() => null),
      db.collection('secretary_invitations').where('secretaryUid', '==', uid).limit(1).get().catch(() => null),
      db.doc(`pharmacy_profiles/${uid}`).get().catch(() => null),
      db.doc(`wholesaler_profiles/${uid}`).get().catch(() => null),
      db.doc(`patient_profiles/${uid}`).get().catch(() => null),
      db.doc(`users/${uid}`).get().catch(() => null),
    ]);

    if (adminSnap?.exists && adminSnap.data()?.active === true) {
      roles.add('super_admin');
    }

    if (docSnap?.exists && String(docSnap.data()?.status || '') === 'Approved') {
      roles.add('doctor');
    }

    // Lab notifications belong strictly to Approved lab owner/manager (never lab_staff).
    if (labSnap?.exists && String(labSnap.data()?.status || '') === 'Approved') {
      roles.add('lab');
    }

    const secStatus = String(secSnap?.data()?.status || '');
    const isSecretaryActive =
      (secSnap?.exists &&
        secStatus !== 'Suspended' &&
        secStatus !== 'Revoked' &&
        secStatus !== 'Rejected') ||
      Boolean(secEmpSnap && !secEmpSnap.empty) ||
      Boolean(secInvSnap && !secInvSnap.empty);
    if (isSecretaryActive) {
      roles.add('secretary');
    }

    if (pharmSnap?.exists && String(pharmSnap.data()?.status || '') === 'Approved') {
      roles.add('pharmacy');
    }

    if (whSnap?.exists && String(whSnap.data()?.status || '') === 'Approved') {
      roles.add('wholesaler');
    }

    const patStatus = String(patSnap?.data()?.status || '');
    const userPortal = String(userSnap?.data()?.selectedPortal || '');
    if (
      (patSnap?.exists && patStatus !== 'inactive') ||
      userPortal === 'patient' ||
      roles.size === 0
    ) {
      roles.add('patient');
    }

    return roles;
  }

  private pickPrimaryRole(roles: Set<NotificationRecipientRole>): NotificationRecipientRole {
    const priority: NotificationRecipientRole[] = [
      'super_admin',
      'doctor',
      'lab',
      'secretary',
      'pharmacy',
      'wholesaler',
      'patient',
    ];
    for (const r of priority) {
      if (roles.has(r)) return r;
    }
    return 'patient';
  }

  async resolveUserRole(uid: string): Promise<NotificationRecipientRole> {
    const roles = await this.resolveVerifiedUserRoles(uid);
    return this.pickPrimaryRole(roles);
  }

  async authorizeUserNotificationRole(
    uid: string,
    requestedRole?: NotificationRecipientRole,
    hasRawRoleParam = false,
  ): Promise<
    | { ok: true; role: NotificationRecipientRole; verifiedRoles: NotificationRecipientRole[] }
    | { ok: false; statusCode: number; error: string }
  > {
    const verifiedRoles = await this.resolveVerifiedUserRoles(uid);
    if (hasRawRoleParam && !requestedRole) {
      return { ok: false, statusCode: 403, error: 'FORBIDDEN_ROLE_ACCESS' };
    }
    if (requestedRole && !verifiedRoles.has(requestedRole)) {
      return { ok: false, statusCode: 403, error: 'FORBIDDEN_ROLE_ACCESS' };
    }
    return {
      ok: true,
      role: requestedRole || this.pickPrimaryRole(verifiedRoles),
      verifiedRoles: Array.from(verifiedRoles),
    };
  }

  async getUserPreferences(
    uid: string,
    verifiedRole?: NotificationRecipientRole,
  ): Promise<UserNotificationChannelPreferences> {
    const db = this.getDbIfReady();
    const [linkedPhone, resolvedRole] = await Promise.all([
      this.resolveLinkedPhone(uid),
      verifiedRole ? Promise.resolve(verifiedRole) : this.resolveUserRole(uid),
    ]);

    let stored: Partial<UserNotificationChannelPreferences> | null = null;
    if (!db) {
      stored = this.memPrefs.get(uid) || null;
    } else {
      const snap = await db.doc(`notification_preferences/${uid}`).get().catch(() => null);
      if (snap?.exists) {
        stored = serializeVal(snap.data()) as Partial<UserNotificationChannelPreferences>;
      }
    }

    const preferredChannel: NotificationChannel =
      stored?.preferredChannel === 'whatsapp' ? 'whatsapp' : 'in_app';
    const whatsappConsent = Boolean(stored?.whatsappConsent);

    return {
      uid,
      role: resolvedRole,
      preferredChannel,
      whatsappConsent,
      whatsappConsentAt:
        typeof stored?.whatsappConsentAt === 'string' ? stored.whatsappConsentAt : null,
      ...(linkedPhone ? { linkedPhoneE164: linkedPhone, linkedPhoneMasked: maskIraqiPhone(linkedPhone) } : {}),
      hasLinkedPhone: Boolean(linkedPhone),
      whatsappApiConnected: false,
      whatsappMode: 'simulation',
      locale: stored?.locale === 'en' ? 'en' : 'ar',
      updatedAt:
        typeof stored?.updatedAt === 'string'
          ? stored.updatedAt
          : new Date().toISOString(),
    };
  }

  async updateUserPreferences(
    uid: string,
    patch: {
      preferredChannel?: NotificationChannel;
      whatsappConsent?: boolean;
      locale?: 'ar' | 'en';
      verifiedRole?: NotificationRecipientRole;
    },
  ): Promise<
    | { ok: true; preferences: UserNotificationChannelPreferences }
    | { ok: false; statusCode: number; error: string }
  > {
    const verifiedRole = patch.verifiedRole || (await this.resolveUserRole(uid));
    const current = await this.getUserPreferences(uid, verifiedRole);
    const nextChannel: NotificationChannel =
      patch.preferredChannel === 'whatsapp' || patch.preferredChannel === 'in_app'
        ? patch.preferredChannel
        : current.preferredChannel;

    const nextConsent =
      patch.whatsappConsent !== undefined
        ? Boolean(patch.whatsappConsent)
        : current.whatsappConsent;

    if (nextChannel === 'whatsapp') {
      if (!nextConsent) {
        return {
          ok: false,
          statusCode: 400,
          error: 'WHATSAPP_CONSENT_REQUIRED',
        };
      }
      if (!current.hasLinkedPhone || !current.linkedPhoneE164) {
        return {
          ok: false,
          statusCode: 400,
          error: 'VALID_IRAQI_PHONE_REQUIRED_FOR_WHATSAPP',
        };
      }
    }

    const nowIso = new Date().toISOString();
    const consentAt =
      nextConsent
        ? current.whatsappConsentAt || nowIso
        : null;

    const savedDoc = {
      uid,
      role: verifiedRole,
      preferredChannel: nextChannel,
      whatsappConsent: nextConsent,
      whatsappConsentAt: consentAt,
      locale: patch.locale === 'en' || patch.locale === 'ar' ? patch.locale : current.locale,
      updatedAt: nowIso,
    };

    const db = this.getDbIfReady();
    if (!db) {
      this.memPrefs.set(uid, {
        ...current,
        ...savedDoc,
      });
    } else {
      await db.doc(`notification_preferences/${uid}`).set(savedDoc, { merge: true });
    }

    const updated = await this.getUserPreferences(uid, verifiedRole);
    return { ok: true, preferences: updated };
  }

  async dispatch(input: DispatchNotificationInput): Promise<DispatchNotificationResult> {
    // 1. Strict Radiology / Imaging Portal closure guard
    const rawEventStr = String(input.eventType || '').toLowerCase();
    const rawRelType = String(input.relatedType || '').toLowerCase();
    if (
      !IMAGING_PORTAL_ENABLED &&
      (input.inAppType === 'imaging_result' ||
        rawRelType === 'imaging' ||
        rawRelType === 'radiology' ||
        rawEventStr.includes('imaging') ||
        rawEventStr.includes('radiology'))
    ) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'IMAGING_PORTAL_DISABLED',
      };
    }

    const recipientUid = String(input.recipientUid || '').trim();
    if (!recipientUid) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'RECIPIENT_UID_REQUIRED',
      };
    }

    // 2. Strict Anti-Doctor Commercial / Medicine Stock Availability Guard
    if (
      input.recipientRole === 'doctor' &&
      DOCTOR_FORBIDDEN_STOCK_EVENTS.has(input.eventType)
    ) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'DOCTOR_COMMERCIAL_STOCK_NOTIFICATION_FORBIDDEN',
      };
    }

    // 2b. Catalog Role Authorization Defense-in-Depth
    const catalogEntry = NOTIFICATION_EVENT_CATALOG[input.eventType];
    if (
      catalogEntry &&
      input.relatedType !== 'admin_simulation' &&
      !catalogEntry.roles.includes(input.recipientRole)
    ) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'FORBIDDEN_ROLE_EVENT',
      };
    }

    // 3. Strict Permission & Requesting-Doctor Order Ownership Guards
    if (input.permissionGranted === false) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'RECIPIENT_PERMISSION_REQUIRED',
      };
    }

    if (
      input.recipientRole === 'doctor' &&
      (input.eventType === 'diagnostic_report_received' ||
        input.eventType === 'lab_result_received') &&
      input.sourceOrderDoctorUid &&
      input.sourceOrderDoctorUid !== recipientUid
    ) {
      return {
        ok: false,
        channelUsed: 'in_app',
        log: null,
        error: 'FORBIDDEN_UNLINKED_DOCTOR_REPORT',
      };
    }

    const iconCategory: NotificationIconCategory =
      input.iconCategory ||
      inferNotificationIconCategory(
        input.eventType,
        input.inAppType,
        input.relatedType,
      );
    const actionRoute =
      input.actionRoute ||
      resolveNotificationActionRoute(
        input.recipientRole,
        input.eventType,
        input.relatedId,
        input.relatedType,
      );

    const prefs = await this.getUserPreferences(recipientUid, input.recipientRole);
    const channel: NotificationChannel =
      input.explicitChannelOverride === 'whatsapp' || input.explicitChannelOverride === 'in_app'
        ? input.explicitChannelOverride
        : prefs.preferredChannel;

    const locale: 'ar' | 'en' = input.locale || prefs.locale || 'ar';
    const config = await this.getSystemConfig();
    const templates = await this.listTemplates();
    const template =
      templates.find((t) => t.eventType === input.eventType) ||
      DEFAULT_TEMPLATES.find((t) => t.eventType === input.eventType) ||
      DEFAULT_TEMPLATES[DEFAULT_TEMPLATES.length - 1];

    const idempHash = input.idempotencyKey
      ? hashIdempotencyKey(`${channel}:${recipientUid}:${input.eventType}:${input.idempotencyKey}`)
      : '';

    const db = this.getDbIfReady();
    const nowIso = new Date().toISOString();
    const logId = safeId('ntlog');

    // Duplicate prevention lock across retries or double triggers
    if (idempHash) {
      if (db) {
        try {
          const dupCheck = await db.runTransaction(async (tx) => {
            const lockRef = db.doc(`notification_idempotency/${idempHash}`);
            const lockSnap = await tx.get(lockRef);
            if (lockSnap.exists) {
              const existingLogId = String(lockSnap.data()?.notificationLogId || '');
              const logSnap = existingLogId
                ? await tx.get(db.doc(`notification_logs/${existingLogId}`))
                : null;
              return {
                duplicate: true,
                existingLog: logSnap?.exists
                  ? (serializeVal(logSnap.data()) as NotificationLogRecord)
                  : null,
              };
            }
            tx.set(lockRef, {
              idempotencyKeyHash: idempHash,
              channel,
              recipientUid,
              eventType: input.eventType,
              notificationLogId: logId,
              createdAt: nowIso,
            });
            return { duplicate: false, existingLog: null };
          });
          if (dupCheck.duplicate) {
            return {
              ok: false,
              channelUsed: channel,
              duplicateBlocked: true,
              log: dupCheck.existingLog,
              error: 'DUPLICATE_NOTIFICATION_BLOCKED',
            };
          }
        } catch (err) {
          console.warn('[MEDORA][Notifications][Idempotency] error:', err);
          return {
            ok: false,
            channelUsed: channel,
            log: null,
            error: 'IDEMPOTENCY_LOCK_FAILED',
          };
        }
      } else {
        const existingLogId = this.memIdempotency.get(idempHash);
        if (existingLogId) {
          return {
            ok: false,
            channelUsed: channel,
            duplicateBlocked: true,
            log: this.memLogs.get(existingLogId) || null,
            error: 'DUPLICATE_NOTIFICATION_BLOCKED',
          };
        }
        this.memIdempotency.set(idempHash, logId);
      }
    }

    // -------------------------------------------------------------------------
    // CHANNEL 1 ONLY: MEDORA In-App
    // -------------------------------------------------------------------------
    if (channel === 'in_app') {
      const target = resolveInAppCollection(input.recipientRole);
      const rawNotifId =
        input.deterministicInAppId
          ? input.deterministicInAppId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
          : safeId('ntf');

      const inAppDoc: Record<string, unknown> = {
        notificationId: rawNotifId,
        [target.uidField]: recipientUid,
        recipientRole: input.recipientRole,
        eventType: input.eventType,
        iconCategory,
        ...(actionRoute ? { actionRoute } : {}),
        type: input.inAppType || target.defaultNotifType,
        title: String(input.title || '').slice(0, 200),
        body: String(input.body || '').slice(0, 600),
        ...(input.relatedId ? { relatedId: String(input.relatedId).slice(0, 128) } : {}),
        ...(input.relatedType ? { relatedType: String(input.relatedType).slice(0, 60) } : {}),
        ...(input.extraInAppFields || {}),
        isRead: false,
        createdAt: nowIso,
      };

      if (db) {
        const notifRef = db.doc(`${target.collection}/${rawNotifId}`);
        if (input.deterministicInAppId) {
          const existing = await notifRef.get();
          if (existing.exists) {
            return {
              ok: false,
              channelUsed: 'in_app',
              duplicateBlocked: true,
              log: null,
              error: 'DUPLICATE_IN_APP_NOTIFICATION',
            };
          }
        }
        await notifRef.set({
          ...inAppDoc,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const bucket = this.memInApp.get(target.collection) || [];
        if (
          input.deterministicInAppId &&
          bucket.some((item) => item.notificationId === rawNotifId)
        ) {
          return {
            ok: false,
            channelUsed: 'in_app',
            duplicateBlocked: true,
            log: null,
            error: 'DUPLICATE_IN_APP_NOTIFICATION',
          };
        }
        bucket.unshift(inAppDoc);
        this.memInApp.set(target.collection, bucket);
      }

      const logRecord: NotificationLogRecord = {
        notificationLogId: logId,
        channel: 'in_app',
        mode: 'in_app',
        eventType: input.eventType,
        iconCategory,
        templateId: template.templateId,
        recipientUid,
        recipientRole: input.recipientRole,
        status: 'Delivered',
        providerName: 'medora_in_app',
        locale,
        title: String(input.title || '').slice(0, 200),
        bodyPreview: String(input.body || '').slice(0, 220),
        ...(idempHash ? { idempotencyKeyHash: idempHash } : {}),
        ...(input.relatedId ? { relatedId: input.relatedId.slice(0, 128) } : {}),
        ...(input.relatedType ? { relatedType: input.relatedType.slice(0, 60) } : {}),
        inAppCollection: target.collection,
        inAppNotificationId: rawNotifId,
        errorCode: null,
        errorMessage: null,
        attemptCount: 1,
        maxAttempts: config.maxAttempts,
        statusHistory: [
          { status: 'Queued', at: nowIso, note: 'Routed to MEDORA In-App channel only' },
          { status: 'Delivered', at: nowIso, note: `Saved to ${target.collection}/${rawNotifId}` },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
        deliveredAt: nowIso,
        cancelledAt: null,
      };

      await this.saveLog(logRecord);
      return { ok: true, channelUsed: 'in_app', log: logRecord };
    }

    // -------------------------------------------------------------------------
    // CHANNEL 2 ONLY: WhatsApp (Simulation mode until official Meta API connected)
    // -------------------------------------------------------------------------
    const targetPhone = input.explicitPhoneOverride || prefs.linkedPhoneE164 || '';
    const hasConsent =
      input.explicitChannelOverride === 'whatsapp'
        ? prefs.whatsappConsent || Boolean(input.explicitPhoneOverride)
        : prefs.whatsappConsent;

    if (!hasConsent) {
      const blockedLog: NotificationLogRecord = {
        notificationLogId: logId,
        channel: 'whatsapp',
        mode: 'whatsapp_simulation',
        eventType: input.eventType,
        iconCategory,
        templateId: template.templateId,
        recipientUid,
        recipientRole: input.recipientRole,
        ...(targetPhone ? { recipientPhoneMasked: maskIraqiPhone(targetPhone) } : {}),
        status: 'Blocked',
        providerName: 'medora_whatsapp_simulation',
        locale,
        title: template.labelAr,
        bodyPreview: '',
        ...(idempHash ? { idempotencyKeyHash: idempHash } : {}),
        ...(input.relatedId ? { relatedId: input.relatedId.slice(0, 128) } : {}),
        ...(input.relatedType ? { relatedType: input.relatedType.slice(0, 60) } : {}),
        errorCode: 'WHATSAPP_CONSENT_REQUIRED',
        errorMessage: 'User has not granted explicit WhatsApp opt-in consent.',
        attemptCount: 1,
        maxAttempts: config.maxAttempts,
        statusHistory: [
          { status: 'Blocked', at: nowIso, note: 'Blocked: explicit WhatsApp user consent missing' },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
        deliveredAt: null,
        cancelledAt: null,
      };
      await this.saveLog(blockedLog);
      return {
        ok: false,
        channelUsed: 'whatsapp',
        log: blockedLog,
        error: 'WHATSAPP_CONSENT_REQUIRED',
      };
    }

    if (!template.enabled) {
      return {
        ok: false,
        channelUsed: 'whatsapp',
        log: null,
        error: 'TEMPLATE_DISABLED',
      };
    }

    const simRes = simulateWhatsAppDispatch({
      eventType: input.eventType,
      template,
      phoneInput: targetPhone,
      locale,
      placeholders: input.placeholders || {
        refCode: (input.relatedId || logId).slice(0, 16).toUpperCase(),
        statusLabel: locale === 'en' ? 'Updated' : 'محدّث',
        dateLabel: nowIso.slice(0, 10),
      },
      simulateFailure: input.simulateFailure,
    });

    const finalStatus: NotificationDeliveryStatus = simRes.ok ? 'Simulated' : 'Failed';
    const logRecord: NotificationLogRecord = {
      notificationLogId: logId,
      channel: 'whatsapp',
      mode: 'whatsapp_simulation',
      eventType: input.eventType,
      iconCategory,
      templateId: template.templateId,
      recipientUid,
      recipientRole: input.recipientRole,
      recipientPhoneMasked: simRes.phoneMasked,
      ...(simRes.phoneHash ? { recipientPhoneHash: simRes.phoneHash } : {}),
      status: finalStatus,
      providerName: simRes.providerName,
      locale,
      title: locale === 'en' ? template.labelEn : template.labelAr,
      bodyPreview: simRes.bodyPreview,
      ...(idempHash ? { idempotencyKeyHash: idempHash } : {}),
      ...(input.relatedId ? { relatedId: input.relatedId.slice(0, 128) } : {}),
      ...(input.relatedType ? { relatedType: input.relatedType.slice(0, 60) } : {}),
      errorCode: simRes.errorCode || null,
      errorMessage: simRes.errorMessage || null,
      attemptCount: 1,
      maxAttempts: config.maxAttempts,
      statusHistory: [
        {
          status: 'Queued',
          at: nowIso,
          note: 'Routed exclusively to WhatsApp channel (zero medical PII checked)',
        },
        {
          status: finalStatus,
          at: nowIso,
          note: simRes.ok
            ? `WhatsApp simulation accepted (${simRes.providerMessageId}) — Meta API not connected`
            : simRes.errorMessage || 'Simulation failure',
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      deliveredAt: simRes.ok ? nowIso : null,
      cancelledAt: null,
    };

    await this.saveLog(logRecord);
    return {
      ok: simRes.ok,
      channelUsed: 'whatsapp',
      log: logRecord,
      ...(simRes.ok ? {} : { error: simRes.errorCode || 'WHATSAPP_SIMULATION_FAILED' }),
    };
  }

  private async saveLog(record: NotificationLogRecord): Promise<void> {
    this.memLogs.set(record.notificationLogId, record);
    const db = this.getDbIfReady();
    if (db) {
      await db.doc(`notification_logs/${record.notificationLogId}`).set({
        ...record,
        serverUpdatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  async getLog(logId: string): Promise<NotificationLogRecord | null> {
    const db = this.getDbIfReady();
    if (!db) {
      return this.memLogs.get(logId) || null;
    }
    const snap = await db.doc(`notification_logs/${logId}`).get();
    if (!snap.exists) return this.memLogs.get(logId) || null;
    return serializeVal(snap.data()) as NotificationLogRecord;
  }

  async listInAppForUser(
    uid: string,
    role: NotificationRecipientRole,
    limitCount = 60,
  ): Promise<{
    collection: string;
    notifications: Array<Record<string, unknown>>;
    unreadCount: number;
  }> {
    const target = resolveInAppCollection(role);
    const db = this.getDbIfReady();
    let list: Array<Record<string, unknown>> = [];

    if (!db) {
      list = (this.memInApp.get(target.collection) || []).filter(
        (n) => n[target.uidField] === uid,
      );
    } else {
      const snap = await db
        .collection(target.collection)
        .where(target.uidField, '==', uid)
        .limit(limitCount)
        .get();
      list = snap.docs.map((d) => serializeVal(d.data()) as Record<string, unknown>);
    }

    list.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    );
    const unreadCount = list.filter((n) => n.isRead !== true).length;
    return { collection: target.collection, notifications: list, unreadCount };
  }

  async markInAppRead(
    uid: string,
    role: NotificationRecipientRole,
    notificationId: string,
  ): Promise<boolean> {
    const target = resolveInAppCollection(role);
    const db = this.getDbIfReady();
    if (!db) {
      const list = this.memInApp.get(target.collection) || [];
      const item = list.find(
        (n) => n.notificationId === notificationId && n[target.uidField] === uid,
      );
      if (!item) return false;
      item.isRead = true;
      return true;
    }
    const ref = db.doc(`${target.collection}/${notificationId}`);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.[target.uidField] !== uid) return false;
    await ref.update({ isRead: true, updatedAt: FieldValue.serverTimestamp() });
    return true;
  }

  async markAllInAppRead(
    uid: string,
    role: NotificationRecipientRole,
  ): Promise<number> {
    const target = resolveInAppCollection(role);
    const db = this.getDbIfReady();
    if (!db) {
      const list = this.memInApp.get(target.collection) || [];
      let count = 0;
      list.forEach((n) => {
        if (n[target.uidField] === uid && n.isRead !== true) {
          n.isRead = true;
          count += 1;
        }
      });
      return count;
    }
    const snap = await db
      .collection(target.collection)
      .where(target.uidField, '==', uid)
      .where('isRead', '==', false)
      .limit(120)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, { isRead: true, updatedAt: FieldValue.serverTimestamp() });
    });
    await batch.commit();
    return snap.size;
  }

  async listLogsForUser(uid: string, limitCount = 50): Promise<NotificationLogRecord[]> {
    const db = this.getDbIfReady();
    if (!db) {
      return Array.from(this.memLogs.values())
        .filter((l) => l.recipientUid === uid)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limitCount);
    }
    const snap = await db
      .collection('notification_logs')
      .where('recipientUid', '==', uid)
      .limit(limitCount)
      .get();
    return snap.docs
      .map((d) => serializeVal(d.data()) as NotificationLogRecord)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  async updateTemplate(
    templateId: string,
    patch: {
      bodyAr?: string;
      bodyEn?: string;
      enabled?: boolean;
      labelAr?: string;
      labelEn?: string;
    },
    actorUid: string,
  ): Promise<
    | { ok: true; template: NotificationTemplateRecord }
    | { ok: false; statusCode: number; error: string }
  > {
    const templates = await this.listTemplates();
    const target = templates.find(
      (t) => t.templateId === templateId || t.eventType === templateId,
    );
    if (!target) {
      return { ok: false, statusCode: 404, error: 'TEMPLATE_NOT_FOUND' };
    }

    const nextAr = patch.bodyAr !== undefined ? patch.bodyAr.trim() : target.bodyAr;
    const nextEn = patch.bodyEn !== undefined ? patch.bodyEn.trim() : target.bodyEn;
    const chkAr = validateWhatsAppTemplateSafety(nextAr);
    if (!chkAr.safe) {
      return { ok: false, statusCode: 400, error: chkAr.reason || 'UNSAFE_TEMPLATE' };
    }
    const chkEn = validateWhatsAppTemplateSafety(nextEn);
    if (!chkEn.safe) {
      return { ok: false, statusCode: 400, error: chkEn.reason || 'UNSAFE_TEMPLATE' };
    }

    const updated: NotificationTemplateRecord = {
      ...target,
      labelAr:
        patch.labelAr !== undefined
          ? patch.labelAr.trim().slice(0, 80) || target.labelAr
          : target.labelAr,
      labelEn:
        patch.labelEn !== undefined
          ? patch.labelEn.trim().slice(0, 80) || target.labelEn
          : target.labelEn,
      bodyAr: nextAr,
      bodyEn: nextEn,
      enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : target.enabled,
      containsMedicalInfo: false,
      updatedAt: new Date().toISOString(),
      updatedByUid: actorUid,
    };

    this.memTemplates.set(updated.eventType, updated);
    const db = this.getDbIfReady();
    if (db) {
      await db.doc(`notification_templates/${updated.templateId}`).set(updated, { merge: true });
    }
    return { ok: true, template: updated };
  }

  async retryLog(
    logId: string,
    actorUid: string,
  ): Promise<
    | { ok: true; log: NotificationLogRecord }
    | { ok: false; statusCode: number; error: string }
  > {
    const existing = await this.getLog(logId);
    if (!existing) return { ok: false, statusCode: 404, error: 'LOG_NOT_FOUND' };
    if (existing.status === 'Delivered' || existing.status === 'Cancelled' || existing.status === 'Simulated') {
      return { ok: false, statusCode: 409, error: 'LOG_STATUS_FINAL_CANNOT_RETRY' };
    }
    if (existing.attemptCount >= existing.maxAttempts) {
      return { ok: false, statusCode: 409, error: 'MAX_RETRIES_EXCEEDED' };
    }

    const nowIso = new Date().toISOString();
    const nextStatus: NotificationDeliveryStatus =
      existing.channel === 'whatsapp' ? 'Simulated' : 'Delivered';

    const updated: NotificationLogRecord = {
      ...existing,
      attemptCount: existing.attemptCount + 1,
      status: nextStatus,
      errorCode: null,
      errorMessage: null,
      deliveredAt: nowIso,
      updatedAt: nowIso,
      statusHistory: [
        ...(existing.statusHistory || []),
        {
          status: nextStatus,
          at: nowIso,
          note: `Manual retry #${existing.attemptCount + 1} by ${actorUid}`,
        },
      ],
    };
    await this.saveLog(updated);
    return { ok: true, log: updated };
  }

  async cancelLog(
    logId: string,
    actorUid: string,
  ): Promise<
    | { ok: true; log: NotificationLogRecord }
    | { ok: false; statusCode: number; error: string }
  > {
    const existing = await this.getLog(logId);
    if (!existing) return { ok: false, statusCode: 404, error: 'LOG_NOT_FOUND' };
    if (existing.status === 'Delivered' || existing.status === 'Cancelled') {
      return { ok: false, statusCode: 409, error: 'CANNOT_CANCEL_FINAL_STATUS' };
    }

    const nowIso = new Date().toISOString();
    const updated: NotificationLogRecord = {
      ...existing,
      status: 'Cancelled',
      cancelledAt: nowIso,
      updatedAt: nowIso,
      statusHistory: [
        ...(existing.statusHistory || []),
        { status: 'Cancelled', at: nowIso, note: `Cancelled by ${actorUid}` },
      ],
    };
    await this.saveLog(updated);
    return { ok: true, log: updated };
  }

  async getAdminOverview(limitCount = 120) {
    const [config, templates] = await Promise.all([
      this.getSystemConfig(),
      this.listTemplates(),
    ]);

    const db = this.getDbIfReady();
    let logs: NotificationLogRecord[];
    if (!db) {
      logs = Array.from(this.memLogs.values());
    } else {
      const snap = await db.collection('notification_logs').limit(limitCount).get();
      logs = snap.docs.map((d) => serializeVal(d.data()) as NotificationLogRecord);
    }

    logs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const byEventType: Record<string, number> = {};
    let inAppCount = 0;
    let whatsappSimulatedCount = 0;
    let deliveredCount = 0;
    let blockedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;

    for (const log of logs) {
      byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;
      if (log.channel === 'in_app') inAppCount++;
      else if (log.channel === 'whatsapp') whatsappSimulatedCount++;
      if (log.status === 'Delivered' || log.status === 'Simulated' || log.status === 'Sent') {
        deliveredCount++;
      } else if (log.status === 'Blocked') blockedCount++;
      else if (log.status === 'Failed') failedCount++;
      else if (log.status === 'Cancelled') cancelledCount++;
    }

    return {
      ok: true as const,
      config,
      templates,
      logs: logs.slice(0, limitCount),
      catalog: Object.values(NOTIFICATION_EVENT_CATALOG),
      stats: {
        totalLogs: logs.length,
        inAppCount,
        whatsappSimulatedCount,
        deliveredCount,
        blockedCount,
        failedCount,
        cancelledCount,
        byEventType,
      },
    };
  }
}

let globalEngineHook: NotificationEngine | null = null;

export function bindGlobalNotificationEngine(engine: NotificationEngine | null): void {
  globalEngineHook = engine;
}

export function getGlobalNotificationEngine(): NotificationEngine | null {
  return globalEngineHook;
}

export async function emitAdminNotification(
  db: Firestore,
  params: {
    eventType?: NotificationEventType;
    type?: string;
    title: string;
    body: string;
    relatedId?: string;
    relatedType?: string;
    idempotencyKey?: string;
    fallbackAdminUid?: string;
    placeholders?: {
      refCode?: string;
      statusLabel?: string;
      dateLabel?: string;
    };
  },
): Promise<void> {
  try {
    const rolesSnap = await db
      .collection('admin_roles')
      .where('active', '==', true)
      .limit(20)
      .get();

    const adminUids = new Set<string>();
    rolesSnap.docs.forEach((doc) => {
      const uid = String(doc.data()?.uid || doc.id || '').trim();
      if (uid) adminUids.add(uid);
    });
    if (adminUids.size === 0 && params.fallbackAdminUid) {
      adminUids.add(params.fallbackAdminUid.trim());
    }
    if (adminUids.size === 0) return;

    const engine = getGlobalNotificationEngine();
    const eventType: NotificationEventType = params.eventType || 'admin_notice';
    const inAppType = params.type || 'admin_notice';
    const nowIso = new Date().toISOString();

    for (const adminUid of adminUids) {
      if (engine) {
        await engine
          .dispatch({
            eventType,
            recipientUid: adminUid,
            recipientRole: 'super_admin',
            explicitChannelOverride: 'in_app',
            title: String(params.title || '').slice(0, 200),
            body: String(params.body || '').slice(0, 600),
            inAppType,
            relatedId: params.relatedId,
            relatedType: params.relatedType,
            idempotencyKey: params.idempotencyKey
              ? `adm:${adminUid}:${params.idempotencyKey}`
              : undefined,
            placeholders: params.placeholders,
          })
          .catch(() => undefined);
      } else {
        const notifId = safeId('antf');
        await db.doc(`admin_notifications/${notifId}`).set({
          notificationId: notifId,
          adminUid,
          recipientRole: 'super_admin',
          eventType,
          iconCategory: inferNotificationIconCategory(eventType, inAppType, params.relatedType),
          actionRoute: resolveNotificationActionRoute(
            'super_admin',
            eventType,
            params.relatedId,
            params.relatedType,
          ),
          type: inAppType,
          title: String(params.title || '').slice(0, 200),
          body: String(params.body || '').slice(0, 600),
          ...(params.relatedId ? { relatedId: String(params.relatedId).slice(0, 128) } : {}),
          ...(params.relatedType ? { relatedType: String(params.relatedType).slice(0, 60) } : {}),
          isRead: false,
          createdAt: nowIso,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.warn('[MEDORA][AdminNotification] warning:', err);
  }
}
