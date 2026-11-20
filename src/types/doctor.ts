import type { BookingConfirmationMode, UploadedDocMeta } from './medora';

export type DoctorSectionId =
  | 'overview'
  | 'appointments'
  | 'patients'
  | 'prescriptions'
  | 'pharmacy_orders'
  | 'diagnostics'
  | 'messages'
  | 'clinic_staff'
  | 'reports'
  | 'promotional_banner'
  | 'settings';

export type DayOfWeekKey =
  | 'sat'
  | 'sun'
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri';

export interface WorkingDayRule {
  enabled: boolean;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  breakStart?: string; // HH:MM
  breakEnd?: string; // HH:MM
}

export interface WorkingSchedule {
  days: Record<DayOfWeekKey, WorkingDayRule>;
  consultationDurationMinutes: number;
  maxPatientsPerPeriod: number;
  holidayDates: string[]; // YYYY-MM-DD
}

export interface DoctorNotificationPrefs {
  newBookings: boolean;
  newMessages: boolean;
  diagnosticResults: boolean;
  staffActions: boolean;
}

export interface DoctorPrivacyPrefs {
  showPhoneInDirectory: boolean;
  showFeeInDirectory: boolean;
  allowPatientMessages: boolean;
}

export interface DoctorPortalProfile {
  uid: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female';
  avatarUrl?: string;
  avatarPath?: string;
  governorate: string;
  district: string;
  professionalPhone: string;
  email: string;
  degree: string;
  university: string;
  specialty: string;
  subSpecialty?: string;
  experienceYears?: number;
  languages?: string[];
  clinicName: string;
  workAddress: string;
  workDaysAndHours: string;
  consultationDurationMinutes: number;
  consultationFee: number;
  hourlyAppointmentLimit: number;
  bookingConfirmationMode: BookingConfirmationMode;
  licenseNumber: string;
  licensingAuthority: string;
  institutionId?: string;
  status: string;
  promotionalBannerUrl?: string;
  promotionalBannerPath?: string;
  promotionalTagline?: string;
  clinicPhotoUrl?: string;
  clinicServices?: string[];
  mapLocationUrl?: string;
  workingSchedule?: WorkingSchedule;
  notificationPrefs?: DoctorNotificationPrefs;
  privacyPrefs?: DoctorPrivacyPrefs;
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'no_show';

export interface DoctorAppointment {
  appointmentId: string;
  doctorUid: string;
  institutionId: string;
  patientUid?: string;
  patientRecordId?: string;
  patientName: string;
  patientPhone: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  slotKey: string;
  queueNumber?: number;
  status: AppointmentStatus;
  visitType: 'scheduled' | 'walk_in' | 'follow_up';
  isWaitlist: boolean;
  reason?: string;
  notes?: string;
  feeAmount?: number;
  cancelledReason?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DoctorPatientRecord {
  patientRecordId: string;
  fileNumber: string;
  doctorUid: string;
  institutionId: string;
  linkedPatientUid?: string;
  fullName: string;
  phone: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female';
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  address?: string;
  notesSummary?: string;
  totalVisits: number;
  lastVisitAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PatientVisitRecord {
  visitId: string;
  doctorUid: string;
  patientRecordId: string;
  appointmentId?: string;
  clientSubmissionKey?: string;
  visitDate: string; // YYYY-MM-DD
  visitTime?: string; // HH:MM
  visitReason?: string;
  chiefComplaint: string;
  diagnosis: string;
  clinicalNotes: string;
  procedures?: string;
  treatmentRecommendations?: string;
  vitals?: {
    bloodPressure?: string;
    temperature?: string;
    heartRate?: string;
    weightKg?: string;
  };
  attachments: UploadedDocMeta[];
  linkedPrescriptionId?: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MedicationItem {
  medicineId?: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface DoctorMedicineSearchItem {
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandNames: string[];
  strength: string;
  dosageForm: string;
  packSize: string;
  manufacturer?: string;
  country?: string;
  therapeuticCategory?: string;
  imageReference?: string;
  requiresPrescription: boolean;
  controlledDrug: boolean;
  dispensingRestrictions?: string;
  availablePharmaciesCount: number;
  totalAvailableQty: number;
  minRetailPriceIqd?: number | null;
  maxRetailPriceIqd?: number | null;
  pharmacies: Array<{
    pharmacyUid: string;
    pharmacyNameAr: string;
    pharmacyNameEn: string;
    governorate: string;
    district: string;
    sellingPriceIqd: number;
    discountPriceIqd?: number | null;
    availableQty: number;
    nearestExpiryDate?: string | null;
  }>;
}

export interface PrescriptionRecord {
  prescriptionId: string;
  doctorUid: string;
  institutionId: string;
  patientRecordId: string;
  patientName: string;
  patientAge?: string;
  patientGender?: string;
  visitId?: string;
  doctorName: string;
  doctorSpecialty: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  medications: MedicationItem[];
  doctorNotes?: string;
  prescribedDate: string; // YYYY-MM-DD
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type DiagnosticOrderType = 'lab' | 'imaging';
export type DiagnosticOrderStatus =
  | 'ordered'
  | 'in_progress'
  | 'results_received'
  | 'reviewed';

export interface DiagnosticOrderRecord {
  orderId: string;
  doctorUid: string;
  institutionId: string;
  patientRecordId: string;
  patientName: string;
  orderType: DiagnosticOrderType;
  targetFacilityName?: string;
  targetInstitutionId?: string;
  requestedTests: string[];
  clinicalIndication?: string;
  priority: 'routine' | 'urgent';
  status: DiagnosticOrderStatus;
  resultSummary?: string;
  resultFiles: UploadedDocMeta[];
  doctorNotes?: string;
  orderedAt: string;
  resultReceivedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DoctorConversation {
  conversationId: string;
  doctorUid: string;
  doctorAvatarUrl?: string;
  patientRecordId?: string;
  patientUid?: string;
  patientName: string;
  patientPhone?: string;
  lastMessageText: string;
  lastMessageAt: string;
  unreadByDoctor: number;
  unreadByPatient?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DoctorMessageRecord {
  messageId: string;
  conversationId: string;
  doctorUid: string;
  senderUid: string;
  senderRole: 'doctor' | 'secretary' | 'patient';
  senderName: string;
  text: string;
  attachments: UploadedDocMeta[];
  readByDoctor: boolean;
  createdAt: string;
}

export type SecretaryPermissionKey =
  | 'viewAppointments'
  | 'manageAppointments'
  | 'manageWaitlist'
  | 'viewPatientBasic'
  | 'viewMedicalRecords'
  | 'uploadLabResults'
  | 'messagePatients'
  | 'editClinicSchedule';

export interface ClinicStaffMember {
  memberId: string;
  institutionId: string;
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  educationQualification?: string;
  previousExperience?: string;
  role: 'owner' | 'secretary' | 'staff';
  status: 'pending_approval' | 'active' | 'revoked';
  permissions: SecretaryPermissionKey[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DoctorAuditLogRecord {
  logId: string;
  doctorUid: string;
  institutionId: string;
  actorUid: string;
  actorName: string;
  actorRole: 'doctor' | 'secretary';
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface PublicDoctorCard {
  doctorUid: string;
  fullName: string;
  gender?: 'male' | 'female';
  specialty: string;
  subSpecialty?: string;
  experienceYears?: number;
  governorate: string;
  district: string;
  clinicName: string;
  workAddress: string;
  mapLocationUrl?: string;
  workDaysAndHours: string;
  consultationDurationMinutes: number;
  consultationFee?: number;
  showFee: boolean;
  allowPatientMessages?: boolean;
  professionalPhone?: string;
  bookingConfirmationMode: BookingConfirmationMode;
  avatarUrl?: string;
  promotionalBannerUrl?: string;
  promotionalTagline?: string;
  clinicServices?: string[];
  workingSchedule?: WorkingSchedule;
  hasAvailableSlots: boolean;
  nextAvailableDate?: string;
  nextAvailableTime?: string;
  availableSlotsCount: number;
  averageRating?: number;
  reviewCount?: number;
}

export interface DoctorSlotOption {
  date: string;
  time: string;
  slotKey: string;
  available: boolean;
  remainingCapacity: number;
}

export interface DoctorSharedPatientFile {
  fileId: string;
  patientUid: string;
  patientName: string;
  title: string;
  category: string;
  documentDate: string;
  notes?: string;
  file: UploadedDocMeta;
  expiresAt: string | null;
}

export interface DoctorWorkspaceData {
  actorRole: 'doctor' | 'secretary';
  permissions: SecretaryPermissionKey[];
  doctorProfile: DoctorPortalProfile;
  promotionalAdStatus?: 'none' | 'pending_approval' | 'active' | 'paused' | 'expired';
  institution: {
    institutionId: string;
    nameAr: string;
    nameEn?: string;
    governorate: string;
    district: string;
    address: string;
    status: string;
    subscriptionStatus?: string;
  } | null;
  appointments: DoctorAppointment[];
  patients: DoctorPatientRecord[];
  visits: PatientVisitRecord[];
  prescriptions: PrescriptionRecord[];
  diagnostics: DiagnosticOrderRecord[];
  conversations: DoctorConversation[];
  staffMembers: ClinicStaffMember[];
  auditLogs: DoctorAuditLogRecord[];
  sharedPatientFiles?: DoctorSharedPatientFile[];
}
