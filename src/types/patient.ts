import type {
  NotificationActionRoute,
  NotificationEventType,
  NotificationIconCategory,
} from './notifications';
import type {
  AppointmentStatus,
  DoctorAppointment,
  DoctorConversation,
  DoctorMessageRecord,
  DoctorPatientRecord,
  DiagnosticOrderRecord,
  PatientVisitRecord,
  PrescriptionRecord,
  PublicDoctorCard,
} from './doctor';
import type {
  BookingConfirmationMode,
  PatientPortalInput,
  UploadedDocMeta,
  UserAccount,
} from './medora';
import type {
  LabConversationRecord,
  LabHomeCollectionRequest,
  LabOfferPackage,
  LabResultRecord,
  LabReviewRecord,
} from './lab';

export type PatientSectionId =
  | 'home_ads'
  | 'haneen_ai'
  | 'doctor_search'
  | 'my_appointments'
  | 'favorites'
  | 'medical_record'
  | 'medicine_finder'
  | 'labs'
  | 'messages'
  | 'notifications'
  | 'feedback'
  | 'settings';

export type AdEntityType =
  | 'doctor'
  | 'lab'
  | 'pharmacy'
  | 'wholesaler'
  | 'radiology_info'
  | 'platform_service';
export type AdTargetPortal =
  | 'entry'
  | 'patient'
  | 'pharmacy'
  | 'lab'
  | 'doctor'
  | 'wholesaler';
export type AdActionType =
  | 'open_directory'
  | 'open_portal_tab'
  | 'open_external_url'
  | 'info_only';
export type MedoraAdStatus = 'draft' | 'published' | 'paused' | 'expired';

export interface MedoraAdRecord {
  adId: string;
  source?: 'super_admin' | 'doctor_banner';
  approvedByAdmin?: boolean;
  entityType?: AdEntityType;
  entityUid?: string;
  entityName?: string;
  doctorUid: string;
  doctorName: string;
  specialty: string;
  clinicName: string;
  targetPortals?: AdTargetPortal[];
  title?: string;
  description?: string;
  imageUrl: string;
  storagePath?: string;
  storageMode?: 'firebase_storage' | 'firestore_asset';
  ctaLabel: string;
  ctaLabelEn?: string;
  actionType?: AdActionType;
  destinationTarget?: string;
  badgeTextAr?: string;
  badgeTextEn?: string;
  startDate: string; // YYYY-MM-DD or ''
  endDate: string; // YYYY-MM-DD or ''
  status?: MedoraAdStatus;
  active: boolean;
  priority: number;
  impressionsCount?: number;
  clicksCount?: number;
  createdByUid?: string;
  createdByEmail?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  doctorCard?: PublicDoctorCard | null;
  labCard?: LabDirectoryCard | null;
  pharmacyCard?: {
    pharmacyUid: string;
    pharmacyNameAr: string;
    pharmacyNameEn?: string;
    governorate?: string;
    district?: string;
    address?: string;
    deliveryAvailable?: boolean;
    pickupAvailable?: boolean;
    is24Hours?: boolean;
  } | null;
  wholesalerCard?: {
    wholesalerUid: string;
    wholesalerNameAr: string;
    wholesalerNameEn?: string;
    governorate?: string;
    district?: string;
    minimumOrderIqd?: number;
    supportedGovernorates?: string[];
  } | null;
}

export type PatientMedicalFileCategory =
  | 'visit'
  | 'lab'
  | 'imaging'
  | 'prescription'
  | 'other';

export interface PatientMedicalFileRecord {
  fileId: string;
  patientUid: string;
  title: string;
  category: PatientMedicalFileCategory;
  documentDate: string; // YYYY-MM-DD
  notes?: string;
  file: UploadedDocMeta;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MedicalSharePermissions {
  visits: boolean;
  prescriptions: boolean;
  diagnostics: boolean;
  uploadedFiles: boolean;
}

export interface MedicalRecordShareRecord {
  shareId: string;
  patientUid: string;
  doctorUid: string;
  doctorName: string;
  doctorSpecialty: string;
  clinicName: string;
  permissions: MedicalSharePermissions;
  expiresAt: string | null; // ISO timestamp or null
  revoked: boolean;
  revokedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FacilityServiceCatalogItem {
  name: string;
  priceIqd?: number;
  prepInstructions?: string;
}

export interface LabDirectoryCard {
  labUid: string;
  institutionId: string;
  labNameAr: string;
  labNameEn?: string;
  governorate: string;
  district: string;
  address: string;
  mapLocationUrl?: string;
  latitude?: number;
  longitude?: number;
  professionalPhone?: string;
  directorName?: string;
  technicalDirectorName?: string;
  labServices: string[];
  serviceCatalog: FacilityServiceCatalogItem[];
  workDaysAndHours: string;
  hourlyBookingLimit: number;
  bookingConfirmationMode: BookingConfirmationMode;
  homeCollectionEnabled?: boolean;
  homeCollectionFeeIqd?: number;
  averageRating?: number;
  reviewCount?: number;
  activeOffers?: LabOfferPackage[];
}

export type FacilityBookingStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export interface FacilityBookingRecord {
  bookingId: string;
  facilityType: 'lab';
  facilityUid: string;
  institutionId: string;
  facilityName: string;
  facilityPhone?: string;
  facilityAddress?: string;
  facilityMapUrl?: string;
  patientUid: string;
  patientName: string;
  patientPhone: string;
  requestedServices: string[];
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  notes?: string;
  status: FacilityBookingStatus;
  preparationNotes?: string;
  resultSummary?: string;
  resultFiles: UploadedDocMeta[];
  resultReceivedAt?: string | null;
  cancelledReason?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type PatientNotificationType =
  | 'appointment'
  | 'message'
  | 'lab_result'
  | 'imaging_result'
  | 'reminder'
  | 'announcement';

export interface PatientNotificationRecord {
  notificationId: string;
  patientUid: string;
  type: PatientNotificationType;
  eventType?: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  actionRoute?: NotificationActionRoute;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
  isRead: boolean;
  createdAt: string;
}

export type DoctorReviewStatus = 'pending' | 'approved' | 'rejected';

export interface DoctorReviewRecord {
  reviewId: string;
  doctorUid: string;
  doctorName: string;
  clinicName: string;
  appointmentId: string;
  patientUid: string;
  patientName: string;
  rating: number;
  comment: string;
  status: DoctorReviewStatus;
  moderationNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type PatientFeedbackCategory =
  | 'complaint'
  | 'note'
  | 'booking_issue'
  | 'technical'
  | 'suggestion';

export type PatientFeedbackStatus =
  | 'new'
  | 'in_review'
  | 'resolved'
  | 'closed';

export interface PatientFeedbackRecord {
  feedbackId: string;
  patientUid: string;
  patientName: string;
  patientEmail: string;
  category: PatientFeedbackCategory;
  subject: string;
  message: string;
  relatedDoctorUid?: string;
  status: PatientFeedbackStatus;
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatientNotificationPreferences {
  appointments: boolean;
  reminders24h: boolean;
  messages: boolean;
  results: boolean;
  announcements: boolean;
}

export interface PatientPrivacyPreferences {
  allowDoctorSearchByPhone: boolean;
  defaultShareExpiryDays: number | null;
}

export interface PatientPreferences {
  notifications: PatientNotificationPreferences;
  privacy: PatientPrivacyPreferences;
}

export interface PatientProfileDocument extends PatientPortalInput {
  uid: string;
  fullName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  governorate: string;
  district: string;
  address: string;
  phone?: string;
  avatarUrl?: string;
  avatarPath?: string;
  status: 'active' | 'inactive';
  preferences?: PatientPreferences;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PatientWorkspaceAppointment extends DoctorAppointment {
  doctorName?: string;
  doctorAvatarUrl?: string;
  doctorSpecialty?: string;
  clinicName?: string;
  clinicAddress?: string;
  clinicPhone?: string;
  mapLocationUrl?: string;
  hasReview?: boolean;
}

export interface PatientWorkspaceData {
  userAccount: UserAccount;
  patientProfile: PatientProfileDocument | null;
  preferences: PatientPreferences;
  favoriteDoctorUids: string[];
  appointments: PatientWorkspaceAppointment[];
  linkedPatients: DoctorPatientRecord[];
  visits: Array<
    PatientVisitRecord & {
      doctorName?: string;
      doctorAvatarUrl?: string;
      doctorSpecialty?: string;
      clinicName?: string;
    }
  >;
  prescriptions: PrescriptionRecord[];
  diagnostics: DiagnosticOrderRecord[];
  medicalFiles: PatientMedicalFileRecord[];
  shares: MedicalRecordShareRecord[];
  labBookings: FacilityBookingRecord[];
  conversations: Array<
    DoctorConversation & {
      doctorName?: string;
      doctorAvatarUrl?: string;
      doctorSpecialty?: string;
      clinicName?: string;
      unreadByPatient?: number;
    }
  >;
  notifications: PatientNotificationRecord[];
  reviews: DoctorReviewRecord[];
  feedback: PatientFeedbackRecord[];
  publishedLabResults?: LabResultRecord[];
  labHomeCollections?: LabHomeCollectionRequest[];
  labReviews?: LabReviewRecord[];
  labConversations?: LabConversationRecord[];
}

export interface PatientMessageThreadResult {
  conversation: DoctorConversation & {
    doctorName?: string;
    clinicName?: string;
    unreadByPatient?: number;
  };
  messages: DoctorMessageRecord[];
}

export type { AppointmentStatus, PublicDoctorCard };
