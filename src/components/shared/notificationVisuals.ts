import type {
  NotificationEventType,
  NotificationIconCategory,
} from '../../types/notifications';

export type NotificationVisualKind =
  | 'appointment'
  | 'doctor'
  | 'lab_test'
  | 'lab_result'
  | 'prescription'
  | 'medicine'
  | 'medicine_available'
  | 'pharmacy'
  | 'wholesaler'
  | 'message'
  | 'admin_alert'
  | 'cancelled';

export type NotificationWorkflowState = 'pending' | 'completed' | 'cancelled' | null;

export interface NotificationWorkflowMeta {
  state: NotificationWorkflowState;
  labelAr: string;
  labelEn: string;
  textClass: string;
}

const CANCELLED_EVENTS = new Set<string>([
  'appointment_cancelled',
  'lab_booking_rejected',
]);

const COMPLETED_EVENTS = new Set<string>([
  'lab_result_available',
  'lab_result_received',
  'lab_result_ready',
  'diagnostic_report_received',
  'appointment_confirmed',
  'lab_booking_confirmed',
  'prescription_received',
  'prescription_issued',
  'prescription_purchase_confirmed',
  'medicine_available',
  'medicine_favorite_available',
  'medication_available',
  'wholesaler_medicine_available',
  'pharmacy_stock_updated',
  'registration_decision',
]);

const PENDING_EVENTS = new Set<string>([
  'appointment_booked',
  'appointment_rescheduled',
  'appointment_reminder',
  'appointment_updated',
  'lab_order_created',
  'lab_booking_created',
  'lab_order_status_updated',
  'lab_order_updated',
  'patient_message_received',
  'doctor_message_received',
  'message_received',
  'pharmacy_medicine_request_received',
  'pharmacy_order_updated',
  'wholesaler_request_submitted',
  'wholesaler_order_status_updated',
  'secretary_invitation',
  'secretary_task',
  'prescription_status_updated',
  'medicine_availability_reminder',
]);

export function resolveNotificationVisualKind(params: {
  eventType?: NotificationEventType | string | null;
  iconCategory?: NotificationIconCategory | null;
  type?: string | null;
  relatedType?: string | null;
  title?: string | null;
  body?: string | null;
  workflowState?: NotificationWorkflowState;
}): NotificationVisualKind {
  const ev = String(params.eventType || '').toLowerCase();
  const tp = String(params.type || '').toLowerCase();
  const rt = String(params.relatedType || '').toLowerCase();
  const text = `${params.title || ''} ${params.body || ''}`.toLowerCase();

  // 1. Cancelled / Rejected takes top semantic precedence
  if (
    params.workflowState === 'cancelled' ||
    CANCELLED_EVENTS.has(ev) ||
    tp === 'cancelled' ||
    tp === 'rejected' ||
    text.includes('cancelled') ||
    text.includes('rejected') ||
    text.includes('تم إلغاء') ||
    text.includes('إلغاء الموعد') ||
    text.includes('إلغاء الحجز') ||
    text.includes('مرفوض') ||
    text.includes('تم رفض')
  ) {
    return 'cancelled';
  }

  // 2. Results (Medical report / green)
  if (
    ev === 'lab_result_available' ||
    ev === 'lab_result_received' ||
    ev === 'lab_result_ready' ||
    ev === 'diagnostic_report_received' ||
    tp === 'lab_result' ||
    tp === 'result_approval' ||
    rt === 'lab_result' ||
    rt === 'diagnostic_report'
  ) {
    return 'lab_result';
  }

  // 3. Lab Tests / Orders (Lab tube / purple)
  if (
    ev === 'lab_order_created' ||
    ev === 'lab_booking_created' ||
    ev === 'lab_booking_confirmed' ||
    ev === 'lab_order_status_updated' ||
    ev === 'lab_order_updated' ||
    tp === 'booking' ||
    tp === 'home_collection' ||
    tp === 'low_stock' ||
    tp === 'expiry_alert' ||
    rt.includes('lab_order') ||
    rt.includes('lab_booking') ||
    rt.includes('home_collection') ||
    params.iconCategory === 'lab_report'
  ) {
    return 'lab_test';
  }

  // 4. Medicine Availability (Medicine + Check / green)
  if (
    ev === 'medicine_available' ||
    ev === 'medicine_favorite_available' ||
    ev === 'medication_available' ||
    params.iconCategory === 'medicine_available'
  ) {
    return 'medicine_available';
  }

  // 5. Medicines (Capsule / purple)
  if (
    ev === 'medicine_availability_reminder' ||
    ev === 'pharmacy_medicine_unavailable' ||
    params.iconCategory === 'medicine' ||
    (rt.includes('medicine') && !rt.includes('availability'))
  ) {
    return 'medicine';
  }

  // 6. Prescriptions (Prescription / teal)
  if (
    ev.startsWith('prescription_') ||
    rt.includes('prescription') ||
    params.iconCategory === 'prescription'
  ) {
    return 'prescription';
  }

  // 7. Wholesaler (Warehouse / blue-gray)
  if (
    ev.startsWith('wholesaler_') ||
    rt.includes('wholesaler') ||
    params.iconCategory === 'wholesaler'
  ) {
    return 'wholesaler';
  }

  // 8. Pharmacy (Pharmacy / dark green)
  if (
    ev.startsWith('pharmacy_') ||
    rt.includes('pharmacy') ||
    params.iconCategory === 'pharmacy'
  ) {
    return 'pharmacy';
  }

  // 9. Messages (Chat / blue)
  if (
    ev.includes('message') ||
    tp === 'message' ||
    rt.includes('conversation') ||
    params.iconCategory === 'message'
  ) {
    return 'message';
  }

  // 10. Doctor context vs Appointments
  if (
    rt === 'doctor' ||
    rt === 'doctor_profile' ||
    tp === 'doctor'
  ) {
    return 'doctor';
  }

  if (
    ev.startsWith('appointment_') ||
    tp === 'appointment' ||
    tp === 'reminder' ||
    rt.includes('appointment') ||
    params.iconCategory === 'doctor_calendar'
  ) {
    return 'appointment';
  }

  // 11. Admin / Security / Account alerts (Shield or Bell / orange)
  return 'admin_alert';
}

export function resolveNotificationWorkflowMeta(params: {
  eventType?: NotificationEventType | string | null;
  type?: string | null;
  title?: string | null;
  body?: string | null;
  explicitWorkflowState?: NotificationWorkflowState;
}): NotificationWorkflowMeta {
  if (params.explicitWorkflowState) {
    return buildWorkflowMeta(params.explicitWorkflowState);
  }

  const ev = String(params.eventType || '').toLowerCase();
  const tp = String(params.type || '').toLowerCase();
  const text = `${params.title || ''} ${params.body || ''}`.toLowerCase();

  if (
    CANCELLED_EVENTS.has(ev) ||
    tp === 'cancelled' ||
    tp === 'rejected' ||
    text.includes('cancelled') ||
    text.includes('rejected') ||
    text.includes('تم إلغاء') ||
    text.includes('مرفوض') ||
    text.includes('تم رفض')
  ) {
    return buildWorkflowMeta('cancelled');
  }

  if (
    text.includes('completed') ||
    text.includes('approved') ||
    text.includes('delivered') ||
    text.includes('مكتمل') ||
    text.includes('تم اعتماد') ||
    text.includes('تم تأكيد') ||
    text.includes('جاهز') ||
    text.includes('متوفر الآن') ||
    COMPLETED_EVENTS.has(ev)
  ) {
    return buildWorkflowMeta('completed');
  }

  if (
    PENDING_EVENTS.has(ev) ||
    tp === 'booking' ||
    tp === 'home_collection' ||
    tp === 'result_approval' ||
    tp === 'task_assigned' ||
    tp === 'invitation_received' ||
    text.includes('pending') ||
    text.includes('بانتظار') ||
    text.includes('قيد')
  ) {
    return buildWorkflowMeta('pending');
  }

  return buildWorkflowMeta(null);
}

function buildWorkflowMeta(state: NotificationWorkflowState): NotificationWorkflowMeta {
  switch (state) {
    case 'cancelled':
      return {
        state: 'cancelled',
        labelAr: 'ملغي',
        labelEn: 'Cancelled',
        textClass: 'text-rose-700 dark:text-rose-300',
      };
    case 'completed':
      return {
        state: 'completed',
        labelAr: 'مكتمل',
        labelEn: 'Completed',
        textClass: 'text-emerald-700 dark:text-emerald-300',
      };
    case 'pending':
      return {
        state: 'pending',
        labelAr: 'قيد المعالجة',
        labelEn: 'Pending Action',
        textClass: 'text-amber-700 dark:text-amber-300',
      };
    default:
      return {
        state: null,
        labelAr: '',
        labelEn: '',
        textClass: '',
      };
  }
}

export const NOTIFICATION_VISUAL_LABELS: Record<
  NotificationVisualKind,
  { ar: string; en: string }
> = {
  appointment: { ar: 'المواعيد', en: 'Appointments' },
  doctor: { ar: 'الطبيب', en: 'Doctor' },
  lab_test: { ar: 'التحاليل', en: 'Lab Tests' },
  lab_result: { ar: 'النتائج', en: 'Results' },
  prescription: { ar: 'الوصفات', en: 'Prescriptions' },
  medicine: { ar: 'الأدوية', en: 'Medicines' },
  medicine_available: { ar: 'توفّر الدواء', en: 'Medicine Available' },
  pharmacy: { ar: 'الصيدلية', en: 'Pharmacy' },
  wholesaler: { ar: 'المذخر', en: 'Wholesaler' },
  message: { ar: 'الرسائل', en: 'Messages' },
  admin_alert: { ar: 'تنبيه إداري', en: 'Admin Alert' },
  cancelled: { ar: 'إلغاء / رفض', en: 'Cancelled / Rejected' },
};
