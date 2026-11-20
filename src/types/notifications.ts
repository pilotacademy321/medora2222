export type NotificationChannel = 'in_app' | 'whatsapp';

export type NotificationRecipientRole =
  | 'patient'
  | 'doctor'
  | 'lab'
  | 'pharmacy'
  | 'wholesaler'
  | 'secretary'
  | 'super_admin';

export type NotificationIconCategory =
  | 'doctor_calendar'
  | 'lab_report'
  | 'prescription'
  | 'medicine'
  | 'medicine_available'
  | 'pharmacy'
  | 'wholesaler'
  | 'message'
  | 'admin_security';

export type NotificationEventType =
  // Doctor events
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'lab_result_received'
  | 'diagnostic_report_received'
  | 'patient_message_received'
  | 'prescription_status_updated'
  // Patient events
  | 'appointment_confirmed'
  | 'appointment_reminder'
  | 'lab_result_available'
  | 'prescription_received'
  | 'doctor_message_received'
  | 'medicine_available'
  | 'medicine_favorite_available'
  | 'medicine_availability_reminder'
  // Pharmacy events (future-ready contracts)
  | 'pharmacy_medicine_request_received'
  | 'pharmacy_stock_updated'
  | 'pharmacy_medicine_unavailable'
  | 'wholesaler_request_submitted'
  | 'wholesaler_medicine_available'
  | 'wholesaler_order_status_updated'
  // Laboratory events
  | 'lab_order_created'
  | 'lab_booking_created'
  | 'lab_booking_confirmed'
  | 'lab_booking_rejected'
  | 'lab_order_status_updated'
  // Shared / Account / Admin / Secretary / Legacy-compatible events
  | 'important_account_update'
  | 'appointment_updated'
  | 'lab_order_updated'
  | 'lab_result_ready'
  | 'prescription_issued'
  | 'prescription_purchase_confirmed'
  | 'pharmacy_order_updated'
  | 'medication_available'
  | 'secretary_invitation'
  | 'secretary_task'
  | 'registration_decision'
  | 'message_received'
  | 'admin_notice'
  | 'account_security_alert';

export type NotificationDeliveryStatus =
  | 'Queued'
  | 'Simulated'
  | 'Sent'
  | 'Delivered'
  | 'Blocked'
  | 'Failed'
  | 'Cancelled';

export type NotificationDispatchMode =
  | 'in_app'
  | 'whatsapp_simulation'
  | 'whatsapp_live_locked';

export interface NotificationActionRoute {
  section: string;
  tab?: string;
  entityId?: string;
  requiredPermission?: string;
}

export interface NotificationCatalogEntry {
  eventType: NotificationEventType;
  iconCategory: NotificationIconCategory;
  roles: NotificationRecipientRole[];
  labelAr: string;
  labelEn: string;
  summaryAr: string;
  summaryEn: string;
  futureContract?: boolean;
}

export interface NotificationTemplateRecord {
  templateId: string;
  eventType: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  whatsappTemplateName: string;
  labelAr: string;
  labelEn: string;
  bodyAr: string;
  bodyEn: string;
  enabled: boolean;
  containsMedicalInfo: false;
  updatedAt: string;
  updatedByUid?: string;
}

export interface UserNotificationChannelPreferences {
  uid: string;
  role: NotificationRecipientRole;
  preferredChannel: NotificationChannel;
  whatsappConsent: boolean;
  whatsappConsentAt: string | null;
  linkedPhoneE164?: string;
  linkedPhoneMasked?: string;
  hasLinkedPhone: boolean;
  whatsappApiConnected: false;
  whatsappMode: 'simulation';
  locale: 'ar' | 'en';
  updatedAt: string;
}

export interface NotificationLogRecord {
  notificationLogId: string;
  channel: NotificationChannel;
  mode: NotificationDispatchMode;
  eventType: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  templateId: string;
  recipientUid: string;
  recipientRole: NotificationRecipientRole;
  recipientPhoneMasked?: string;
  recipientPhoneHash?: string;
  status: NotificationDeliveryStatus;
  providerName: string;
  locale: 'ar' | 'en';
  title: string;
  bodyPreview: string;
  idempotencyKeyHash?: string;
  relatedId?: string;
  relatedType?: string;
  inAppCollection?: string;
  inAppNotificationId?: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptCount: number;
  maxAttempts: number;
  statusHistory: Array<{
    status: NotificationDeliveryStatus;
    at: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
}

export interface NotificationSystemConfig {
  channels: ['in_app', 'whatsapp'];
  whatsappApiConnected: false;
  whatsappMode: 'simulation';
  officialWhatsAppBrand: string;
  privacyStrictMode: true;
  maxAttempts: number;
  updatedAt: string;
}

export interface RoleInAppNotificationRecord {
  notificationId: string;
  recipientUid?: string;
  eventType?: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  actionRoute?: NotificationActionRoute;
  type: string;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
  isRead: boolean;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// Future-Ready Pharmacy & Wholesaler (المذخر) Contracts — Simulation Only
// -----------------------------------------------------------------------------
export type PharmacyInventoryStatus = 'available' | 'unavailable' | 'low_stock';

export type PatientMedicineWatchSource =
  | 'medicine_request'
  | 'medicine_favorite'
  | 'availability_reminder';

export type WholesalerOrderStatus =
  | 'submitted'
  | 'reviewed'
  | 'offered'
  | 'confirmed'
  | 'dispatched'
  | 'delivered'
  | 'unavailable'
  | 'cancelled';

export interface PatientMedicineWatchRecord {
  watchId: string;
  patientUid: string;
  pharmacyUid: string;
  pharmacyName: string;
  medicineId: string;
  medicineRefCode: string;
  medicineDisplayName?: string;
  source: PatientMedicineWatchSource;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PharmacyInventoryItemContract {
  inventoryId: string;
  pharmacyUid: string;
  pharmacyName: string;
  medicineId: string;
  medicineRefCode: string;
  status: PharmacyInventoryStatus;
  quantityAvailable: number;
  updatedAt: string;
}

export interface WholesalerMedicineRequestRecord {
  requestId: string;
  requestCode: string;
  pharmacyUid: string;
  pharmacyName: string;
  wholesalerUid: string;
  wholesalerName: string;
  medicineId: string;
  medicineRefCode: string;
  requestedQuantity: number;
  status: WholesalerOrderStatus;
  linkedOfferId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WholesalerOfferRecord {
  offerId: string;
  pharmacyRequestId: string;
  wholesalerUid: string;
  wholesalerName: string;
  pharmacyUid: string;
  medicineId: string;
  medicineRefCode: string;
  availableQuantity: number;
  unitPriceIqd?: number;
  status: 'available' | 'unavailable' | 'accepted' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationAdminOverviewResponse {
  ok: true;
  config: NotificationSystemConfig;
  templates: NotificationTemplateRecord[];
  logs: NotificationLogRecord[];
  catalog?: NotificationCatalogEntry[];
  stats: {
    totalLogs: number;
    inAppCount: number;
    whatsappSimulatedCount: number;
    deliveredCount: number;
    blockedCount: number;
    failedCount: number;
    cancelledCount: number;
    byEventType: Record<string, number>;
  };
}

export interface PhoneStatusResponse {
  ok: true;
  linked: boolean;
  verified: boolean;
  phoneE164: string;
  phoneLocal: string;
  phoneMasked: string;
  verificationMethod: 'google_account_linked' | 'legacy_verified' | 'none';
  verifiedAt: string | null;
}

export interface PhoneAvailabilityResponse {
  ok: boolean;
  valid: boolean;
  available: boolean;
  ownedByCurrentUser?: boolean;
  e164?: string;
  local?: string;
  masked?: string;
  operator?: string;
  error?: string;
}

export interface PhoneSaveResponse {
  ok: boolean;
  linked?: boolean;
  phoneE164?: string;
  phoneLocal?: string;
  phoneMasked?: string;
  verificationMethod?: string;
  error?: string;
}
