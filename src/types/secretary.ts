import type { GenderType } from './medora';
import type {
  NotificationActionRoute,
  NotificationEventType,
  NotificationIconCategory,
} from './notifications';

export type EmployerType = 'doctor' | 'lab' | 'pharmacy';

export type SecretaryInvitationStatus =
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Expired'
  | 'Revoked';

export type SecretaryEmploymentStatus = 'Active' | 'Suspended' | 'Terminated';

export type DoctorSecretaryPermission =
  | 'manageBookings'
  | 'confirmAppointments'
  | 'manageWaitlist'
  | 'adminMessaging'
  | 'viewSelectedFiles';

export type LabSecretaryPermission =
  | 'manageBookings'
  | 'registerPatientArrival'
  | 'trackOrders'
  | 'adminMessaging'
  | 'viewTestStatus';

export type PharmacySecretaryPermission =
  | 'trackOrders'
  | 'managePickupBookings'
  | 'manageInventory'
  | 'trackSupplierOrders';

export type AnySecretaryPermission =
  | DoctorSecretaryPermission
  | LabSecretaryPermission
  | PharmacySecretaryPermission;

export const DOCTOR_SECRETARY_PERMISSIONS: readonly DoctorSecretaryPermission[] = [
  'manageBookings',
  'confirmAppointments',
  'manageWaitlist',
  'adminMessaging',
  'viewSelectedFiles',
];

export const LAB_SECRETARY_PERMISSIONS: readonly LabSecretaryPermission[] = [
  'manageBookings',
  'registerPatientArrival',
  'trackOrders',
  'adminMessaging',
  'viewTestStatus',
];

export const PHARMACY_SECRETARY_PERMISSIONS: readonly PharmacySecretaryPermission[] = [
  'trackOrders',
  'managePickupBookings',
  'manageInventory',
  'trackSupplierOrders',
];

export const PERMISSIONS_BY_EMPLOYER: Record<EmployerType, readonly AnySecretaryPermission[]> = {
  doctor: DOCTOR_SECRETARY_PERMISSIONS,
  lab: LAB_SECRETARY_PERMISSIONS,
  pharmacy: PHARMACY_SECRETARY_PERMISSIONS,
};

export interface SecretaryProfileRecord {
  uid: string;
  secretaryCode: string;
  email: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: GenderType | 'unspecified';
  avatarUrl?: string;
  governorate?: string;
  district?: string;
  phone: string;
  educationQualification: string;
  previousExperience?: string;
  bio?: string;
  permissionsGranted?: boolean;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SecretaryCandidateSummary {
  uid: string;
  secretaryCode: string;
  fullName: string;
  email: string;
  phone?: string;
  governorate?: string;
  district?: string;
  educationQualification?: string;
  previousExperience?: string;
  bio?: string;
  relationStatus: 'none' | 'Pending' | 'Active' | 'Suspended';
}

export interface InitialTaskTemplate {
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export interface SecretaryInvitationRecord {
  invitationId: string;
  employerType: EmployerType;
  employerUid: string;
  employerInstitutionId: string;
  employerName: string;
  employerEmail?: string;
  invitedByUid: string;
  invitedByName: string;
  secretaryUid: string;
  secretaryCode?: string;
  secretaryEmail: string;
  secretaryName: string;
  message: string;
  proposedPermissions: AnySecretaryPermission[];
  initialTasks: InitialTaskTemplate[];
  status: SecretaryInvitationStatus;
  expiresAt: string;
  respondedAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SecretaryEmploymentRecord {
  employmentId: string;
  invitationId: string;
  employerType: EmployerType;
  employerUid: string;
  employerInstitutionId: string;
  employerName: string;
  employerSubtitle?: string;
  secretaryUid: string;
  secretaryCode?: string;
  secretaryEmail: string;
  secretaryName: string;
  secretaryPhone?: string;
  status: SecretaryEmploymentStatus;
  permissions: AnySecretaryPermission[];
  assignedByUid: string;
  acceptedAt: string;
  suspendedAt?: string | null;
  terminatedAt?: string | null;
  statusReason?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SecretaryTaskRecord {
  taskId: string;
  employmentId: string;
  employerType: EmployerType;
  employerUid: string;
  employerName: string;
  secretaryUid: string;
  secretaryName: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  status: 'todo' | 'in_progress' | 'done';
  createdByUid: string;
  createdByName: string;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SecretaryNotificationRecord {
  notificationId: string;
  secretaryUid: string;
  type:
    | 'invitation_received'
    | 'invitation_revoked'
    | 'permissions_updated'
    | 'employment_suspended'
    | 'employment_reactivated'
    | 'employment_terminated'
    | 'task_assigned';
  eventType?: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  actionRoute?: NotificationActionRoute;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
  employerType?: EmployerType;
  employerName?: string;
  isRead: boolean;
  createdAt?: string | null;
}

export interface SecretaryActivityLogRecord {
  logId: string;
  employerUid: string;
  employerType: EmployerType;
  employerName: string;
  employmentId?: string;
  invitationId?: string;
  secretaryUid: string;
  secretaryName: string;
  actorUid: string;
  actorName: string;
  actorRole: 'employer' | 'secretary';
  action: string;
  details: string;
  createdAt?: string | null;
}

export interface EmployerSecretaryWorkspace {
  employerType: EmployerType;
  employerUid: string;
  employerInstitutionId: string;
  employerName: string;
  invitations: SecretaryInvitationRecord[];
  employments: SecretaryEmploymentRecord[];
  tasks: SecretaryTaskRecord[];
  activityLogs: SecretaryActivityLogRecord[];
}

export interface ScopedDoctorAppointment {
  appointmentId: string;
  patientName: string;
  patientPhone: string;
  date: string;
  time: string;
  visitType: string;
  status: string;
  isWaitlist: boolean;
  reason?: string;
  createdAt?: string | null;
}

export interface ScopedConversationItem {
  conversationId: string;
  patientUid: string;
  patientName: string;
  patientPhone?: string;
  lastMessagePreview: string;
  lastMessageAt?: string | null;
  unreadCount: number;
}

export interface ScopedSelectedFileItem {
  fileId: string;
  patientName: string;
  title: string;
  category: string;
  documentDate: string;
  fileUrl?: string;
  mimeType?: string;
}

export interface ScopedLabBookingItem {
  bookingId: string;
  patientName: string;
  patientPhone: string;
  date: string;
  time: string;
  requestedTests: string[];
  status: string;
  arrivalRegistered?: boolean;
  arrivalRegisteredAt?: string | null;
  notes?: string;
  createdAt?: string | null;
}

export interface ScopedLabOrderTrackingItem {
  orderId: string;
  orderNumber: string;
  patientName: string;
  patientPhone: string;
  priority: string;
  status: string;
  testNames: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ScopedPharmacyOperationalItem {
  itemId: string;
  kind: 'order' | 'pickup_booking' | 'inventory' | 'supplier_order';
  referenceCode: string;
  title: string;
  counterpartyName: string;
  status: string;
  quantity?: number;
  scheduledDate?: string;
  notes?: string;
  updatedAt?: string | null;
}

export interface ScopedEmployerWorkspaceData {
  employment: SecretaryEmploymentRecord;
  tasks: SecretaryTaskRecord[];
  appointments?: ScopedDoctorAppointment[];
  conversations?: ScopedConversationItem[];
  selectedFiles?: ScopedSelectedFileItem[];
  labBookings?: ScopedLabBookingItem[];
  labOrders?: ScopedLabOrderTrackingItem[];
  pharmacyItems?: ScopedPharmacyOperationalItem[];
}

export interface SecretaryPortalWorkspaceData {
  profile: SecretaryProfileRecord;
  invitations: SecretaryInvitationRecord[];
  employments: SecretaryEmploymentRecord[];
  notifications: SecretaryNotificationRecord[];
  activityLogs: SecretaryActivityLogRecord[];
  selectedEmploymentId: string | null;
  activeScope: ScopedEmployerWorkspaceData | null;
}

export type SecretarySectionId =
  | 'overview'
  | 'invitations'
  | 'employers'
  | 'tasks'
  | 'appointments_bookings'
  | 'messages'
  | 'notifications'
  | 'profile'
  | 'activity';
