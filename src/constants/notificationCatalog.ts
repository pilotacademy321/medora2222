import type {
  NotificationActionRoute,
  NotificationCatalogEntry,
  NotificationEventType,
  NotificationIconCategory,
  NotificationRecipientRole,
} from '../types/notifications.ts';

export const NOTIFICATION_ICON_LABELS: Record<
  NotificationIconCategory,
  { ar: string; en: string }
> = {
  doctor_calendar: { ar: 'الطبيب والمواعيد', en: 'Doctor & Appointments' },
  lab_report: { ar: 'التحاليل والمختبر', en: 'Lab Tests & Results' },
  prescription: { ar: 'الوصفات الطبية', en: 'Prescriptions' },
  medicine: { ar: 'الأدوية', en: 'Medicines' },
  medicine_available: { ar: 'توفّر الدواء', en: 'Medicine Availability' },
  pharmacy: { ar: 'الصيدلية', en: 'Pharmacy' },
  wholesaler: { ar: 'المذخر الدوائي', en: 'Wholesaler Depot' },
  message: { ar: 'المحادثات والرسائل', en: 'Messages & Chat' },
  admin_security: { ar: 'الإدارة والأمان', en: 'Account & Admin' },
};

export const NOTIFICATION_EVENT_CATALOG: Record<
  NotificationEventType,
  NotificationCatalogEntry
> = {
  // ---------------------------------------------------------------------------
  // Doctor Events
  // ---------------------------------------------------------------------------
  appointment_booked: {
    eventType: 'appointment_booked',
    iconCategory: 'doctor_calendar',
    roles: ['doctor'],
    labelAr: 'حجز موعد جديد للطبيب',
    labelEn: 'New Appointment Booked',
    summaryAr: 'إشعار للطبيب المعني عند تسجيل حجز موعد جديد في عيادته.',
    summaryEn: 'Notifies the owning doctor when a new clinic appointment is booked.',
  },
  appointment_cancelled: {
    eventType: 'appointment_cancelled',
    iconCategory: 'doctor_calendar',
    roles: ['doctor', 'patient'],
    labelAr: 'إلغاء موعد',
    labelEn: 'Appointment Cancelled',
    summaryAr: 'يصل للطبيب والمريض المرتبطين بالموعد عند الإلغاء فقط.',
    summaryEn: 'Sent to the linked doctor and patient when an appointment is cancelled.',
  },
  appointment_rescheduled: {
    eventType: 'appointment_rescheduled',
    iconCategory: 'doctor_calendar',
    roles: ['doctor', 'patient'],
    labelAr: 'إعادة جدولة موعد',
    labelEn: 'Appointment Rescheduled',
    summaryAr: 'تنبيه عند تعديل تاريخ أو وقت الموعد المحدد.',
    summaryEn: 'Alert when a scheduled appointment date or time changes.',
  },
  lab_result_received: {
    eventType: 'lab_result_received',
    iconCategory: 'lab_report',
    roles: ['doctor'],
    labelAr: 'استلام نتيجة تحليل للطبيب',
    labelEn: 'Lab Result Received (Doctor)',
    summaryAr: 'يصل فقط للطبيب المرتبط بطلب المختبر عند جاهزية النتيجة.',
    summaryEn: 'Delivered strictly to the requesting doctor when linked lab results arrive.',
  },
  diagnostic_report_received: {
    eventType: 'diagnostic_report_received',
    iconCategory: 'lab_report',
    roles: ['doctor'],
    labelAr: 'استلام تقرير مختبري مرتبط بطلب الطبيب',
    labelEn: 'Linked Diagnostic Report Received',
    summaryAr: 'مرتبط حصراً بطلب الفحص المختبري للطبيب (دون قسم الأشعة المغلق).',
    summaryEn: 'Linked strictly to the doctor diagnostic lab order (radiology stays closed).',
  },
  patient_message_received: {
    eventType: 'patient_message_received',
    iconCategory: 'message',
    roles: ['doctor', 'lab'],
    labelAr: 'رسالة جديدة من المريض',
    labelEn: 'Patient Message Received',
    summaryAr: 'تنبيه للطبيب أو المختبر عند استلام رسالة جديدة من المريض.',
    summaryEn: 'Alerts the doctor or lab when a patient sends a message.',
  },
  prescription_status_updated: {
    eventType: 'prescription_status_updated',
    iconCategory: 'prescription',
    roles: ['doctor', 'patient'],
    labelAr: 'تحديث حالة الوصفة الطبية',
    labelEn: 'Prescription Status Updated',
    summaryAr: 'تحديث حالة متابعة أو صرف الوصفة المرتبطة بالطبيب والمريض.',
    summaryEn: 'Status update on a linked prescription without leaking drug details externally.',
  },

  // ---------------------------------------------------------------------------
  // Patient Events
  // ---------------------------------------------------------------------------
  appointment_confirmed: {
    eventType: 'appointment_confirmed',
    iconCategory: 'doctor_calendar',
    roles: ['patient'],
    labelAr: 'تأكيد الموعد الطبي',
    labelEn: 'Appointment Confirmed',
    summaryAr: 'إشعار للمريض عند تأكيد موعده لدى الطبيب.',
    summaryEn: 'Notifies the patient when their doctor appointment is confirmed.',
  },
  appointment_reminder: {
    eventType: 'appointment_reminder',
    iconCategory: 'doctor_calendar',
    roles: ['patient'],
    labelAr: 'تذكير الموعد القادم',
    labelEn: 'Upcoming Appointment Reminder',
    summaryAr: 'تذكير آلي قبل موعد العيادة القادم.',
    summaryEn: 'Automated reminder ahead of the upcoming appointment.',
  },
  lab_result_available: {
    eventType: 'lab_result_available',
    iconCategory: 'lab_report',
    roles: ['patient', 'lab'],
    labelAr: 'توفر نتيجة التحليل للمريض',
    labelEn: 'Lab Result Available',
    summaryAr: 'إشعار عند اعتماد ونشر تقرير التحليل المختبري.',
    summaryEn: 'Alerts once a laboratory report is approved and published.',
  },
  prescription_received: {
    eventType: 'prescription_received',
    iconCategory: 'prescription',
    roles: ['patient'],
    labelAr: 'استلام وصفة طبية جديدة',
    labelEn: 'New Prescription Received',
    summaryAr: 'إشعار للمريض عند إصدار وصفة طبية جديدة في سجله.',
    summaryEn: 'Notifies the patient when a new prescription is added to their record.',
  },
  doctor_message_received: {
    eventType: 'doctor_message_received',
    iconCategory: 'message',
    roles: ['patient'],
    labelAr: 'رسالة جديدة من الطبيب',
    labelEn: 'Doctor Message Received',
    summaryAr: 'إشعار للمريض عند وصول رسالة جديدة من عيادة الطبيب.',
    summaryEn: 'Notifies the patient when a doctor clinic sends a message.',
  },
  medicine_available: {
    eventType: 'medicine_available',
    iconCategory: 'medicine_available',
    roles: ['patient'],
    labelAr: 'توفّر الدواء المطلوب',
    labelEn: 'Requested Medicine Available',
    summaryAr: 'يصل حصراً للمريض الذي طلب هذا الدواء من هذه الصيدلية عند توفره (لا يُرسل للأطباء).',
    summaryEn: 'Sent strictly to patients who requested that medicine at that pharmacy (never doctors).',
    futureContract: true,
  },
  medicine_favorite_available: {
    eventType: 'medicine_favorite_available',
    iconCategory: 'medicine_available',
    roles: ['patient'],
    labelAr: 'توفّر دواء في المفضلة',
    labelEn: 'Favorite Medicine Available',
    summaryAr: 'يصل حصراً للمريض الذي حفظ الدواء في المفضلة لهذه الصيدلية.',
    summaryEn: 'Sent strictly to patients who favorited the medicine for that pharmacy.',
    futureContract: true,
  },
  medicine_availability_reminder: {
    eventType: 'medicine_availability_reminder',
    iconCategory: 'medicine',
    roles: ['patient'],
    labelAr: 'تذكير توفّر الدواء',
    labelEn: 'Medicine Availability Reminder',
    summaryAr: 'يصل حصراً للمريض الذي فعّل تذكير التوفر لهذا الدواء والصيدلية.',
    summaryEn: 'Sent strictly to patients who enabled an availability reminder for that medicine.',
    futureContract: true,
  },

  // ---------------------------------------------------------------------------
  // Pharmacy & Wholesaler Future Contracts
  // ---------------------------------------------------------------------------
  pharmacy_medicine_request_received: {
    eventType: 'pharmacy_medicine_request_received',
    iconCategory: 'pharmacy',
    roles: ['pharmacy'],
    labelAr: 'استلام طلب دواء في الصيدلية',
    labelEn: 'Pharmacy Medicine Request Received',
    summaryAr: 'عقد مستقبلي: إشعار للصيدلية المعنية عند تسجيل طلب دواء من مريض.',
    summaryEn: 'Future contract: alerts the concerned pharmacy upon a patient medicine request.',
    futureContract: true,
  },
  pharmacy_stock_updated: {
    eventType: 'pharmacy_stock_updated',
    iconCategory: 'pharmacy',
    roles: ['pharmacy'],
    labelAr: 'تحديث توفر المخزون في الصيدلية',
    labelEn: 'Pharmacy Stock Updated',
    summaryAr: 'عقد مستقبلي: توثيق تحديث توفر صنف دوائي في الصيدلية.',
    summaryEn: 'Future contract: confirms medicine availability update for the pharmacy.',
    futureContract: true,
  },
  pharmacy_medicine_unavailable: {
    eventType: 'pharmacy_medicine_unavailable',
    iconCategory: 'medicine',
    roles: ['pharmacy'],
    labelAr: 'نفاد أو عدم توفر دواء بالصيدلية',
    labelEn: 'Pharmacy Medicine Unavailable',
    summaryAr: 'عقد مستقبلي: تنبيه للصيدلية عند نفاد صنف أو تسجيله غير متوفر.',
    summaryEn: 'Future contract: alerts the pharmacy when a medicine becomes unavailable.',
    futureContract: true,
  },
  wholesaler_request_submitted: {
    eventType: 'wholesaler_request_submitted',
    iconCategory: 'wholesaler',
    roles: ['pharmacy', 'wholesaler'],
    labelAr: 'إرسال طلب دواء للمذخر',
    labelEn: 'Wholesaler Request Submitted',
    summaryAr: 'عقد مستقبلي: إرسال طلب توفير دواء من الصيدلية إلى المذخر المعني فقط.',
    summaryEn: 'Future contract: pharmacy request submitted to the linked wholesaler only.',
    futureContract: true,
  },
  wholesaler_medicine_available: {
    eventType: 'wholesaler_medicine_available',
    iconCategory: 'wholesaler',
    roles: ['pharmacy'],
    labelAr: 'توفر الدواء لدى المذخر',
    labelEn: 'Wholesaler Medicine Available',
    summaryAr: 'عقد مستقبلي: إشعار حصري للصيدلية الطالبة عند عرض المذخر لتوفر الدواء وكميته.',
    summaryEn: 'Future contract: notifies only the requesting pharmacy when a wholesaler offers stock.',
    futureContract: true,
  },
  wholesaler_order_status_updated: {
    eventType: 'wholesaler_order_status_updated',
    iconCategory: 'wholesaler',
    roles: ['pharmacy', 'wholesaler'],
    labelAr: 'تحديث حالة طلب المذخر',
    labelEn: 'Wholesaler Order Status Updated',
    summaryAr: 'عقد مستقبلي: تحديث حالة طلب المذخر للصيدلية المعنية حصراً.',
    summaryEn: 'Future contract: order status update sent strictly to the linked pharmacy.',
    futureContract: true,
  },

  // ---------------------------------------------------------------------------
  // Laboratory Events
  // ---------------------------------------------------------------------------
  lab_order_created: {
    eventType: 'lab_order_created',
    iconCategory: 'lab_report',
    roles: ['lab', 'patient'],
    labelAr: 'إنشاء طلب فحص مختبري',
    labelEn: 'Lab Order Created',
    summaryAr: 'إشعار عند إنشاء طلب تحليل جديد في المختبر.',
    summaryEn: 'Notifies the lab or linked patient when a new lab test order is created.',
  },
  lab_booking_created: {
    eventType: 'lab_booking_created',
    iconCategory: 'lab_report',
    roles: ['lab', 'patient'],
    labelAr: 'حجز مختبر جديد',
    labelEn: 'Lab Booking Created',
    summaryAr: 'إشعار للمختبر والمريض عند تسجيل حجز تحليل جديد.',
    summaryEn: 'Notifies the lab and patient upon a new lab booking.',
  },
  lab_booking_confirmed: {
    eventType: 'lab_booking_confirmed',
    iconCategory: 'lab_report',
    roles: ['patient', 'lab'],
    labelAr: 'تأكيد حجز المختبر',
    labelEn: 'Lab Booking Confirmed',
    summaryAr: 'إشعار للمريض والمختبر عند تأكيد موعد المختبر.',
    summaryEn: 'Alerts the patient and lab when a lab booking is confirmed.',
  },
  lab_booking_rejected: {
    eventType: 'lab_booking_rejected',
    iconCategory: 'lab_report',
    roles: ['patient', 'lab'],
    labelAr: 'رفض أو إلغاء حجز المختبر',
    labelEn: 'Lab Booking Rejected / Cancelled',
    summaryAr: 'إشعار للمريض أو المختبر عند رفض أو إلغاء حجز المختبر.',
    summaryEn: 'Alerts the patient or lab when a lab booking is rejected or cancelled.',
  },
  lab_order_status_updated: {
    eventType: 'lab_order_status_updated',
    iconCategory: 'lab_report',
    roles: ['patient', 'lab'],
    labelAr: 'تحديث حالة التحليل المختبري',
    labelEn: 'Lab Order Status Updated',
    summaryAr: 'متابعة مراحل الطلب المختبري (سحب العينة، قيد التحليل، الإكمال).',
    summaryEn: 'Tracks lab test stages (sample collected, in lab, completed).',
  },

  // ---------------------------------------------------------------------------
  // Account, Admin, Secretary & Legacy-Compatible Events
  // ---------------------------------------------------------------------------
  important_account_update: {
    eventType: 'important_account_update',
    iconCategory: 'admin_security',
    roles: ['doctor', 'patient', 'lab', 'pharmacy', 'wholesaler', 'secretary', 'super_admin'],
    labelAr: 'تحديث مهم على الحساب',
    labelEn: 'Important Account Update',
    summaryAr: 'تنبيه إداري أو أمني مهم خاص بالحساب وإعدادات الوصول.',
    summaryEn: 'Important account governance or security update.',
  },
  appointment_updated: {
    eventType: 'appointment_updated',
    iconCategory: 'doctor_calendar',
    roles: ['patient', 'doctor'],
    labelAr: 'تحديثات المواعيد والحجوزات',
    labelEn: 'Appointment & Booking Updates',
    summaryAr: 'تحديث عام على حالة المواعيد.',
    summaryEn: 'General appointment status update.',
  },
  lab_order_updated: {
    eventType: 'lab_order_updated',
    iconCategory: 'lab_report',
    roles: ['lab', 'patient'],
    labelAr: 'تحديثات طلبات المختبر',
    labelEn: 'Laboratory Request Updates',
    summaryAr: 'تحديث عام على طلبات المختبر.',
    summaryEn: 'General lab request update.',
  },
  lab_result_ready: {
    eventType: 'lab_result_ready',
    iconCategory: 'lab_report',
    roles: ['patient', 'doctor'],
    labelAr: 'جاهزية تقرير المختبر',
    labelEn: 'Laboratory Report Ready',
    summaryAr: 'إشعار جاهزية تقرير التحليل المختبري.',
    summaryEn: 'Laboratory report ready notification.',
  },
  prescription_issued: {
    eventType: 'prescription_issued',
    iconCategory: 'prescription',
    roles: ['patient'],
    labelAr: 'إصدار وصفة طبية جديدة',
    labelEn: 'New Prescription Issued',
    summaryAr: 'إشعار إصدار وصفة إلكترونية جديدة.',
    summaryEn: 'Electronic prescription issued notification.',
  },
  prescription_purchase_confirmed: {
    eventType: 'prescription_purchase_confirmed',
    iconCategory: 'pharmacy',
    roles: ['patient', 'pharmacy'],
    labelAr: 'تأكيد طلب الوصفة',
    labelEn: 'Prescription Order Confirmed',
    summaryAr: 'تأكيد طلب صرف الوصفة.',
    summaryEn: 'Prescription fulfillment confirmation.',
  },
  pharmacy_order_updated: {
    eventType: 'pharmacy_order_updated',
    iconCategory: 'pharmacy',
    roles: ['patient', 'pharmacy'],
    labelAr: 'تحديثات طلبات الصيدلية',
    labelEn: 'Pharmacy Order Updates',
    summaryAr: 'تحديث حالة طلب الصيدلية.',
    summaryEn: 'Pharmacy order update.',
  },
  medication_available: {
    eventType: 'medication_available',
    iconCategory: 'medicine_available',
    roles: ['patient'],
    labelAr: 'جاهزية الطلب الدوائي',
    labelEn: 'Medication Order Ready',
    summaryAr: 'جاهزية الدواء للاستلام للمريض المعني فقط.',
    summaryEn: 'Medication availability notification for the requesting patient.',
  },
  secretary_invitation: {
    eventType: 'secretary_invitation',
    iconCategory: 'admin_security',
    roles: ['secretary'],
    labelAr: 'دعوات وتوظيف السكرتارية',
    labelEn: 'Secretary Invitations & Employment',
    summaryAr: 'دعوات التوظيف وتحديثات الصلاحيات في بوابة السكرتير.',
    summaryEn: 'Employment invitations and permission changes in Secretary Portal.',
  },
  secretary_task: {
    eventType: 'secretary_task',
    iconCategory: 'admin_security',
    roles: ['secretary'],
    labelAr: 'مهام السكرتارية',
    labelEn: 'Secretary Task Assignments',
    summaryAr: 'إسناد المهام الإدارية للسكرتير.',
    summaryEn: 'Administrative task assignments for secretary.',
  },
  registration_decision: {
    eventType: 'registration_decision',
    iconCategory: 'admin_security',
    roles: ['doctor', 'lab', 'pharmacy', 'wholesaler', 'secretary', 'super_admin'],
    labelAr: 'قرارات التسجيل والمراجعة الإدارية',
    labelEn: 'Registration & Review Decisions',
    summaryAr: 'قرارات التفعيل أو الاعتماد الإداري من MEDORA.',
    summaryEn: 'Account registration and verification decisions.',
  },
  message_received: {
    eventType: 'message_received',
    iconCategory: 'message',
    roles: ['patient', 'doctor', 'lab'],
    labelAr: 'رسائل ومحادثات جديدة',
    labelEn: 'New Direct Messages',
    summaryAr: 'إشعار عام بوصول رسالة محادثة جديدة.',
    summaryEn: 'Direct message received alert.',
  },
  admin_notice: {
    eventType: 'admin_notice',
    iconCategory: 'admin_security',
    roles: ['patient', 'doctor', 'lab', 'pharmacy', 'wholesaler', 'secretary', 'super_admin'],
    labelAr: 'إشعارات الإدارة العليا',
    labelEn: 'Administrative Notices',
    summaryAr: 'إشعارات رسمية من إدارة منصة MEDORA.',
    summaryEn: 'Official notices from MEDORA administration.',
  },
  account_security_alert: {
    eventType: 'account_security_alert',
    iconCategory: 'admin_security',
    roles: ['patient', 'doctor', 'lab', 'pharmacy', 'wholesaler', 'secretary', 'super_admin'],
    labelAr: 'تنبيهات أمان الحساب',
    labelEn: 'Account Security Alerts',
    summaryAr: 'تنبيه عند تحديث الهاتف أو إعدادات الأمان.',
    summaryEn: 'Security alert upon phone or security setting updates.',
  },
};

export function inferNotificationIconCategory(
  eventType?: NotificationEventType | string | null,
  inAppType?: string | null,
  relatedType?: string | null,
): NotificationIconCategory {
  if (eventType && eventType in NOTIFICATION_EVENT_CATALOG) {
    return NOTIFICATION_EVENT_CATALOG[eventType as NotificationEventType].iconCategory;
  }
  const tp = String(inAppType || '').toLowerCase();
  const rt = String(relatedType || '').toLowerCase();

  if (rt.includes('wholesaler')) return 'wholesaler';
  if (rt.includes('pharmacy')) return 'pharmacy';
  if (rt.includes('medicine_available') || tp === 'medicine_available') return 'medicine_available';
  if (rt.includes('medicine')) return 'medicine';
  if (rt.includes('prescription')) return 'prescription';
  if (tp === 'lab_result' || tp === 'result_approval' || tp === 'home_collection' || rt.includes('lab') || rt.includes('diagnostic')) {
    return 'lab_report';
  }
  if (tp === 'message' || rt.includes('conversation')) return 'message';
  if (tp === 'appointment' || tp === 'booking' || tp === 'reminder' || rt.includes('appointment')) {
    return 'doctor_calendar';
  }
  return 'admin_security';
}

export function resolveNotificationActionRoute(
  role: NotificationRecipientRole,
  eventType: NotificationEventType,
  relatedId?: string,
  relatedType?: string,
): NotificationActionRoute | undefined {
  const cleanId = relatedId ? String(relatedId).slice(0, 128) : undefined;

  if (role === 'patient') {
    switch (eventType) {
      case 'appointment_booked':
      case 'appointment_confirmed':
      case 'appointment_reminder':
      case 'appointment_cancelled':
      case 'appointment_rescheduled':
      case 'appointment_updated':
        return { section: 'my_appointments', entityId: cleanId };
      case 'lab_result_available':
      case 'lab_result_ready':
        return { section: 'medical_record', tab: 'diagnostics', entityId: cleanId };
      case 'prescription_received':
      case 'prescription_issued':
      case 'prescription_status_updated':
        return { section: 'medical_record', tab: 'prescriptions', entityId: cleanId };
      case 'lab_booking_created':
      case 'lab_booking_confirmed':
      case 'lab_booking_rejected':
      case 'lab_order_created':
      case 'lab_order_status_updated':
      case 'lab_order_updated':
        return { section: 'labs', entityId: cleanId };
      case 'doctor_message_received':
      case 'patient_message_received':
      case 'message_received':
        return {
          section: 'messages',
          tab: relatedType === 'lab_conversation' ? 'labs' : 'doctors',
          entityId: cleanId,
        };
      case 'important_account_update':
      case 'account_security_alert':
        return { section: 'settings', entityId: cleanId };
      default:
        return undefined;
    }
  }

  if (role === 'doctor') {
    switch (eventType) {
      case 'appointment_booked':
      case 'appointment_cancelled':
      case 'appointment_rescheduled':
      case 'appointment_updated':
        return { section: 'appointments', entityId: cleanId, requiredPermission: 'viewAppointments' };
      case 'lab_result_received':
      case 'diagnostic_report_received':
      case 'lab_result_ready':
        return { section: 'diagnostics', entityId: cleanId, requiredPermission: 'viewMedicalRecords' };
      case 'patient_message_received':
      case 'message_received':
        return { section: 'messages', entityId: cleanId, requiredPermission: 'messagePatients' };
      case 'prescription_status_updated':
        return { section: 'prescriptions', entityId: cleanId, requiredPermission: 'doctorOnly' };
      case 'important_account_update':
      case 'account_security_alert':
        return { section: 'settings', entityId: cleanId };
      default:
        return undefined;
    }
  }

  if (role === 'lab') {
    switch (eventType) {
      case 'lab_booking_created':
      case 'lab_order_created':
      case 'lab_order_status_updated':
      case 'lab_order_updated':
        return { section: 'orders_samples', entityId: cleanId, requiredPermission: 'reception' };
      case 'lab_result_available':
      case 'lab_result_ready':
        return { section: 'results', entityId: cleanId, requiredPermission: 'approveResults' };
      case 'patient_message_received':
      case 'message_received':
        return { section: 'communications', tab: 'patient_chat', entityId: cleanId, requiredPermission: 'messaging' };
      case 'important_account_update':
      case 'account_security_alert':
        return { section: 'settings', entityId: cleanId };
      default:
        return undefined;
    }
  }

  if (role === 'secretary') {
    if (eventType === 'secretary_task') return { section: 'tasks', entityId: cleanId };
    if (eventType === 'secretary_invitation') return { section: 'invitations', entityId: cleanId };
    return { section: 'notifications', entityId: cleanId };
  }

  if (role === 'pharmacy') {
    if (
      eventType === 'wholesaler_request_submitted' ||
      eventType === 'wholesaler_medicine_available' ||
      eventType === 'wholesaler_order_status_updated'
    ) {
      return { section: 'wholesaler_orders', entityId: cleanId };
    }
    if (
      eventType === 'pharmacy_stock_updated' ||
      eventType === 'pharmacy_medicine_unavailable'
    ) {
      return { section: 'inventory', entityId: cleanId };
    }
    return { section: 'requests', entityId: cleanId };
  }

  if (role === 'wholesaler') {
    return { section: 'pharmacy_requests', entityId: cleanId };
  }

  if (role === 'super_admin') {
    switch (eventType) {
      case 'registration_decision':
        return { section: 'requests', entityId: cleanId };
      case 'lab_order_created':
      case 'lab_booking_created':
      case 'lab_booking_confirmed':
      case 'lab_booking_rejected':
      case 'lab_order_status_updated':
      case 'lab_order_updated':
        return { section: 'labs', entityId: cleanId };
      case 'important_account_update':
      case 'account_security_alert':
        return { section: 'settings', entityId: cleanId };
      case 'admin_notice':
        return {
          section:
            relatedType === 'patient_feedback'
              ? 'feedback'
              : relatedType === 'lab_review'
                ? 'labs'
                : 'notifications_center',
          entityId: cleanId,
        };
      default:
        return { section: 'notifications_center', entityId: cleanId };
    }
  }

  return undefined;
}
