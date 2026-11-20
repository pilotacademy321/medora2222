export type Language = 'ar' | 'en';
export type ThemeMode = 'dark' | 'light';

export type PortalType =
  | 'patient'
  | 'doctor'
  | 'lab'
  | 'secretary'
  | 'pharmacy'
  | 'wholesaler';

export type PortalIntent = PortalType | 'super_admin';

export type RequestStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Requires Changes';

export type ActivationRule =
  | 'patient_instant'
  | 'admin_approval'
  | 'institution_approval';

export type AccountStatus =
  | 'pending_profile'
  | 'profile_completed'
  | 'pending_review'
  | 'active'
  | 'restricted'
  | 'suspended';

export type GenderType = 'male' | 'female';
export type BookingConfirmationMode = 'manual' | 'auto';

export interface UploadedDocMeta {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  storagePath?: string;
  uploadedAtIso: string;
}

export interface SessionFeatureFlags {
  imagingPortalEnabled: boolean;
}

export interface AuthSessionMeta {
  imagingPortalEnabled: boolean;
  imagingAccessBlocked: boolean;
  hasOtherAllowedPortal: boolean;
}

export interface UserAccount {
  uid: string;
  email: string;
  googleName: string;
  photoUrl?: string;
  accountStatus: AccountStatus;
  selectedPortal: 'none' | PortalType | 'imaging';
  registrationCompleted: boolean;
  personalProfileCompleted: boolean;
  fullName?: string;
  dateOfBirth?: string;
  age?: number;
  gender?: GenderType | 'unspecified';
  governorate?: string;
  district?: string;
  address?: string;
  phone?: string;
  avatarUrl?: string;
  avatarPath?: string;
  createdAt?: unknown;
  lastLoginAt?: unknown;
  updatedAt?: unknown;
}

export interface PersonalProfileInput {
  fullName: string;
  dateOfBirth: string;
  age: number;
  gender: GenderType;
  governorate: string;
  district: string;
  address: string;
  phone: string;
  avatarUrl: string;
  avatarPath?: string;
}

export interface PatientPortalInput {
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  acceptedPolicy: boolean;
}

export interface DoctorPortalInput {
  professionalPhone: string;
  email: string;
  degree: string;
  university: string;
  specialty: string;
  subSpecialty: string;
  experienceYears: number;
  languages: string[];
  clinicName: string;
  workAddress: string;
  workDaysAndHours: string;
  consultationDurationMinutes: number;
  consultationFee: number;
  hourlyAppointmentLimit: number;
  bookingConfirmationMode: BookingConfirmationMode;
  licenseNumber: string;
  licensingAuthority: string;
  licenseExpiryDate: string;
  verificationDocuments: UploadedDocMeta[];
}

export interface LabPortalInput {
  professionalPhone: string;
  labNameAr: string;
  labNameEn: string;
  directorName: string;
  governorate: string;
  district: string;
  address: string;
  mapLocationUrl: string;
  latitude?: number;
  longitude?: number;
  licenseNumber: string;
  licensingAuthority: string;
  licenseDocuments: UploadedDocMeta[];
  technicalDirectorName: string;
  labServices: string[];
  workDaysAndHours: string;
  hourlyBookingLimit: number;
  bookingConfirmationMode: BookingConfirmationMode;
}

export interface SecretaryPortalInput {
  phone: string;
  educationQualification: string;
  previousExperience: string;
  bio?: string;
  targetInstitutionName?: string;
  invitationCode?: string;
}

export interface PharmacyPortalInput {
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  ownerFullName: string;
  responsiblePharmacistName: string;
  pharmacistSyndicateNumber: string;
  pharmacyLicenseNumber: string;
  licensingAuthority: string;
  licenseExpiryDate: string;
  professionalPhone: string;
  email: string;
  governorate: string;
  district: string;
  address: string;
  mapLocationUrl: string;
  latitude?: number;
  longitude?: number;
  workingDaysAndHours: string;
  is24Hours: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  licenseDocuments: UploadedDocMeta[];
}

export interface WholesalerPortalInput {
  wholesalerNameAr: string;
  wholesalerNameEn: string;
  ownerFullName: string;
  legalEntityName: string;
  warehouseLicenseNumber: string;
  healthAuthorityLicenseNumber: string;
  licensingAuthority: string;
  licenseExpiryDate: string;
  professionalPhone: string;
  email: string;
  governorate: string;
  district: string;
  warehouseAddress: string;
  mapLocationUrl: string;
  latitude?: number;
  longitude?: number;
  workingDaysAndHours: string;
  supportedGovernorates: string[];
  minimumOrderIqd: number;
  licenseDocuments: UploadedDocMeta[];
}

export type PortalFormPayload =
  | { portal: 'patient'; data: PatientPortalInput }
  | { portal: 'doctor'; data: DoctorPortalInput }
  | { portal: 'lab'; data: LabPortalInput }
  | { portal: 'secretary'; data: SecretaryPortalInput }
  | { portal: 'pharmacy'; data: PharmacyPortalInput }
  | { portal: 'wholesaler'; data: WholesalerPortalInput };

export interface RegistrationRequest {
  requestId: string;
  requestNumber: string;
  uid: string;
  applicantEmail: string;
  applicantName: string;
  portalType: PortalType;
  profilePath: string;
  institutionId?: string;
  status: RequestStatus;
  activationRule: ActivationRule;
  reviewReason?: string;
  reviewInstructions?: string;
  acceptedTerms: boolean;
  submittedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'expired';

export interface InstitutionRecord {
  institutionId: string;
  ownerUid: string;
  type: 'clinic' | 'lab' | 'pharmacy' | 'wholesaler';
  nameAr: string;
  nameEn?: string;
  governorate: string;
  district: string;
  address: string;
  licenseNumber: string;
  status: 'pending_approval' | 'active' | 'suspended' | 'rejected';
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPlan?: string;
  subscriptionExpiresAt?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AdminMessageCategory =
  | 'system'
  | 'inquiry'
  | 'institution_notice'
  | 'compliance';

export type AdminMessageStatus = 'new' | 'read' | 'replied' | 'archived';

export interface AdminMessageRecord {
  messageId: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  category: AdminMessageCategory;
  status: AdminMessageStatus;
  isRead: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminRoleRecord {
  uid: string;
  email: string;
  role: 'super_admin';
  active: boolean;
  grantedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminCollectionError {
  collection: string;
  code: string;
  message: string;
}

export interface SuperAdminServerStatus {
  serverAdminSdkActive: boolean;
  hasAllowlist: boolean;
  customClaimsActive: boolean;
  serviceAccountStatus?: 'ready' | 'missing' | 'invalid_json' | 'project_mismatch';
  firestoreTransport?: 'admin_sdk' | 'verified_rules_rest';
  projectId?: string;
  firestoreDatabaseId?: string;
  firebaseStorageActive?: boolean;
  adImageStorageMode?: 'firebase_storage' | 'firestore_asset';
  storageBucketName?: string;
}

export interface SuperAdminVerifyResult {
  authorized: boolean;
  email?: string;
  claimsActive?: boolean;
  serverAdminSdkActive?: boolean;
  hasAllowlist?: boolean;
  reason?: string;
}

export interface AuditLogRecord {
  logId: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details: string;
  createdAt?: unknown;
}
