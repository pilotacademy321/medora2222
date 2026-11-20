import type { BookingConfirmationMode, GenderType, UploadedDocMeta } from './medora';
import type { FacilityBookingRecord } from './patient';
import type {
  NotificationActionRoute,
  NotificationEventType,
  NotificationIconCategory,
} from './notifications';

export type LabPermissionKey =
  | 'reception'
  | 'bookings'
  | 'samples'
  | 'enterResults'
  | 'approveResults'
  | 'inventory'
  | 'billing'
  | 'reports'
  | 'messaging';

export const ALL_LAB_PERMISSIONS: LabPermissionKey[] = [
  'reception',
  'bookings',
  'samples',
  'enterResults',
  'approveResults',
  'inventory',
  'billing',
  'reports',
  'messaging',
];

export type LabActorRole = 'lab_manager' | 'lab_staff';

export type LabSectionId =
  | 'overview'
  | 'patients'
  | 'catalog_tests'
  | 'orders_samples'
  | 'results'
  | 'billing'
  | 'staff'
  | 'secretaries'
  | 'inventory'
  | 'offers'
  | 'reviews'
  | 'reports'
  | 'communications'
  | 'settings';

export type LabSampleType =
  | 'blood'
  | 'serum'
  | 'plasma'
  | 'urine'
  | 'stool'
  | 'swab'
  | 'saliva'
  | 'csf'
  | 'other';

export interface LabProfileRecord {
  uid: string;
  institutionId?: string;
  managerFullName: string;
  managerDateOfBirth?: string;
  managerGender?: GenderType;
  managerAvatarUrl?: string;
  avatarPath?: string;
  professionalPhone: string;
  labNameAr: string;
  labNameEn: string;
  directorName: string;
  technicalDirectorName: string;
  governorate: string;
  district: string;
  address: string;
  mapLocationUrl?: string;
  latitude?: number;
  longitude?: number;
  licenseNumber: string;
  licensingAuthority: string;
  licenseExpiryDate?: string;
  licenseDocuments?: UploadedDocMeta[];
  labServices: string[];
  serviceCatalog?: Array<{
    testId?: string;
    name: string;
    priceIqd?: number;
    prepInstructions?: string;
  }>;
  workDaysAndHours: string;
  hourlyBookingLimit: number;
  bookingConfirmationMode: BookingConfirmationMode;
  homeCollectionEnabled?: boolean;
  homeCollectionFeeIqd?: number;
  status: string;
  institutionStatus?: 'pending_approval' | 'active' | 'suspended' | 'rejected';
  averageRating?: number;
  reviewCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabStaffMember {
  staffId: string;
  labUid: string;
  institutionId: string;
  uid?: string;
  email: string;
  fullName: string;
  phone: string;
  roleTitle: string;
  status: 'active' | 'suspended' | 'revoked';
  permissions: LabPermissionKey[];
  createdByUid: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabPatientRecord {
  patientRecordId: string;
  fileNumber: string;
  labUid: string;
  institutionId: string;
  linkedPatientUid?: string;
  fullName: string;
  phone: string;
  gender: GenderType | 'unspecified';
  dateOfBirth?: string;
  age?: number;
  address?: string;
  allergies?: string;
  chronicNotes?: string;
  totalOrders: number;
  lastOrderDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MedoraCentralLabTest {
  centralTestId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  sampleType: LabSampleType;
  unit: string;
  referenceRangeText: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  prepInstructionsAr: string;
  prepInstructionsEn: string;
  suggestedPriceIqd: number;
  turnaroundHours: number;
}

export interface LabTestCatalogItem {
  testId: string;
  labUid: string;
  institutionId: string;
  centralTestId?: string;
  code: string;
  nameAr: string;
  nameEn: string;
  category: string;
  sampleType: LabSampleType;
  unit: string;
  referenceRangeText: string;
  referenceMin?: number | null;
  referenceMax?: number | null;
  prepInstructions: string;
  priceIqd: number;
  turnaroundHours: number;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabOfferPackage {
  offerId: string;
  labUid: string;
  institutionId: string;
  labNameAr: string;
  labNameEn?: string;
  offerType: 'single_discount' | 'package';
  title: string;
  description: string;
  testIds: string[];
  testNames: string[];
  originalPriceIqd: number;
  offerPriceIqd: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type LabOrderStatus =
  | 'ordered'
  | 'sample_collected'
  | 'in_lab'
  | 'result_entered'
  | 'approved'
  | 'cancelled';

export interface LabOrderTestLine {
  testId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  sampleType: LabSampleType;
  unit: string;
  referenceRangeText: string;
  priceIqd: number;
  inventoryConsumed?: boolean;
}

export interface LabOrderRecord {
  orderId: string;
  orderNumber: string;
  labUid: string;
  institutionId: string;
  patientRecordId: string;
  patientName: string;
  patientPhone: string;
  linkedPatientUid?: string;
  sourceBookingId?: string;
  sourceDoctorOrderId?: string;
  offerId?: string;
  offerTitle?: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: LabOrderStatus;
  tests: LabOrderTestLine[];
  totalAmountIqd: number;
  discountIqd: number;
  homeCollectionFeeIqd: number;
  netAmountIqd: number;
  clinicalNotes?: string;
  inventoryConsumedAt?: string | null;
  inventoryReversedAt?: string | null;
  createdByUid: string;
  createdByName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabSampleRecord {
  sampleId: string;
  sampleNumber: string;
  labUid: string;
  institutionId: string;
  orderId: string;
  orderNumber: string;
  patientRecordId: string;
  patientName: string;
  sampleType: LabSampleType;
  containerNote?: string;
  collectedAt: string;
  receivedAt: string;
  collectedByName: string;
  status: 'collected' | 'accepted' | 'rejected';
  rejectionReason?: string;
  createdByUid: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type HomeCollectionStatus =
  | 'requested'
  | 'assigned'
  | 'en_route'
  | 'collected'
  | 'completed'
  | 'cancelled';

export interface LabHomeCollectionRequest {
  requestId: string;
  labUid: string;
  institutionId: string;
  labNameAr?: string;
  patientUid?: string;
  patientRecordId?: string;
  patientName: string;
  patientPhone: string;
  address: string;
  governorate?: string;
  district?: string;
  mapLocationUrl?: string;
  requestedDate: string;
  preferredWindow: string;
  requestedTests: string[];
  notes?: string;
  assignedStaffName?: string;
  assignedStaffPhone?: string;
  collectionFeeIqd: number;
  linkedOrderId?: string;
  status: HomeCollectionStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type LabAnalyteFlag = 'normal' | 'high' | 'low' | 'critical' | 'abnormal';

export interface LabResultAnalyte {
  testId?: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  flag: LabAnalyteFlag;
  comment?: string;
}

export interface LabResultRevisionEntry {
  revisionNumber: number;
  reason: string;
  previousAnalytes: LabResultAnalyte[];
  previousSummary: string;
  editedByUid: string;
  editedByName: string;
  editedAt: string;
}

export interface LabResultRecord {
  resultId: string;
  reportNumber: string;
  labUid: string;
  institutionId: string;
  labNameAr: string;
  labNameEn?: string;
  labPhone?: string;
  labAddress?: string;
  orderId: string;
  orderNumber: string;
  patientRecordId: string;
  patientName: string;
  patientPhone: string;
  patientAge?: number;
  patientGender?: string;
  linkedPatientUid?: string;
  sourceBookingId?: string;
  analytes: LabResultAnalyte[];
  summaryNote: string;
  attachments: UploadedDocMeta[];
  status: 'draft' | 'pending_approval' | 'approved' | 'corrected';
  enteredByUid: string;
  enteredByName: string;
  enteredAt: string;
  approvedByUid?: string;
  approvedByName?: string;
  approvedAt?: string | null;
  publishedToPatient?: boolean;
  publishedAt?: string | null;
  revisionCount: number;
  revisionHistory: LabResultRevisionEntry[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabInvoiceItem {
  description: string;
  quantity: number;
  unitPriceIqd: number;
  totalIqd: number;
}

export interface LabInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  labUid: string;
  institutionId: string;
  labNameAr: string;
  labPhone?: string;
  labAddress?: string;
  orderId?: string;
  orderNumber?: string;
  patientRecordId: string;
  patientName: string;
  patientPhone: string;
  items: LabInvoiceItem[];
  subtotalIqd: number;
  discountIqd: number;
  homeCollectionFeeIqd: number;
  totalIqd: number;
  paidIqd: number;
  balanceIqd: number;
  status: 'unpaid' | 'partial' | 'paid' | 'void';
  notes?: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabPaymentRecord {
  paymentId: string;
  receiptNumber: string;
  labUid: string;
  invoiceId: string;
  invoiceNumber: string;
  patientName: string;
  amountIqd: number;
  method: 'cash' | 'card_pos' | 'bank_transfer';
  referenceNote?: string;
  receivedByUid: string;
  receivedByName: string;
  paidAt: string;
  createdAt?: string | null;
}

export interface LabInventoryItem {
  itemId: string;
  labUid: string;
  institutionId: string;
  name: string;
  code?: string;
  category: 'reagent' | 'consumable' | 'kit' | 'control';
  unit: string;
  quantity: number;
  minThreshold: number;
  lotNumber: string;
  expiryDate: string;
  supplierId?: string;
  supplierName?: string;
  unitCostIqd: number;
  notes?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabTestConsumptionRecipe {
  recipeId: string;
  labUid: string;
  testId: string;
  testName: string;
  materials: Array<{
    itemId: string;
    itemName: string;
    unit: string;
    quantityPerTest: number;
  }>;
  updatedByUid: string;
  updatedAt?: string | null;
}

export interface LabStockMovement {
  movementId: string;
  labUid: string;
  itemId: string;
  itemName: string;
  movementType:
    | 'auto_order_deduction'
    | 'reversal_restock'
    | 'manual_out'
    | 'manual_adjustment'
    | 'purchase_in';
  quantityDelta: number;
  balanceAfter: number;
  orderId?: string;
  orderNumber?: string;
  purchaseOrderId?: string;
  reason: string;
  actorUid: string;
  actorName: string;
  createdAt?: string | null;
}

export interface LabSupplier {
  supplierId: string;
  labUid: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  category?: string;
  notes?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabPurchaseOrder {
  poId: string;
  poNumber: string;
  labUid: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  items: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitCostIqd: number;
    lotNumber?: string;
    expiryDate?: string;
  }>;
  totalCostIqd: number;
  notes?: string;
  receivedAt?: string | null;
  createdByUid: string;
  createdByName: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabReviewRecord {
  reviewId: string;
  labUid: string;
  labNameAr?: string;
  bookingId?: string;
  patientUid: string;
  patientName: string;
  rating: number;
  reviewType: 'review' | 'complaint';
  comment: string;
  status: 'approved' | 'hidden' | 'flagged' | 'removed';
  labReply?: string;
  repliedByName?: string;
  repliedAt?: string | null;
  adminNote?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LabNotificationRecord {
  notificationId: string;
  labUid: string;
  type:
    | 'booking'
    | 'home_collection'
    | 'low_stock'
    | 'expiry_alert'
    | 'result_approval'
    | 'message'
    | 'admin_notice';
  eventType?: NotificationEventType;
  iconCategory?: NotificationIconCategory;
  actionRoute?: NotificationActionRoute;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
  isRead: boolean;
  createdAt?: string | null;
}

export interface LabConversationRecord {
  conversationId: string;
  labUid: string;
  labNameAr: string;
  patientUid: string;
  patientName: string;
  patientPhone?: string;
  lastMessagePreview: string;
  lastMessageAt?: string | null;
  unreadByLab: number;
  unreadByPatient: number;
}

export interface LabMessageRecord {
  messageId: string;
  conversationId: string;
  labUid: string;
  senderRole: 'lab' | 'patient';
  senderUid: string;
  senderName: string;
  text: string;
  attachments: UploadedDocMeta[];
  createdAt?: string | null;
}

export interface LabAdminMessageRecord {
  threadMessageId: string;
  labUid: string;
  institutionId?: string;
  labNameAr: string;
  senderRole: 'lab' | 'super_admin';
  senderUid: string;
  senderName: string;
  subject: string;
  body: string;
  isReadByAdmin: boolean;
  isReadByLab: boolean;
  createdAt?: string | null;
}

export interface LabAuditLogRecord {
  logId: string;
  labUid: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: string | null;
}

export interface LabWorkspaceData {
  actorRole: LabActorRole;
  actorName: string;
  actorEmail: string;
  permissions: LabPermissionKey[];
  labProfile: LabProfileRecord;
  centralCatalog: MedoraCentralLabTest[];
  tests: LabTestCatalogItem[];
  offers: LabOfferPackage[];
  patients: LabPatientRecord[];
  orders: LabOrderRecord[];
  samples: LabSampleRecord[];
  homeCollections: LabHomeCollectionRequest[];
  bookings: FacilityBookingRecord[];
  results: LabResultRecord[];
  invoices: LabInvoiceRecord[];
  payments: LabPaymentRecord[];
  staff: LabStaffMember[];
  inventory: LabInventoryItem[];
  recipes: LabTestConsumptionRecipe[];
  stockMovements: LabStockMovement[];
  suppliers: LabSupplier[];
  purchaseOrders: LabPurchaseOrder[];
  reviews: LabReviewRecord[];
  notifications: LabNotificationRecord[];
  conversations: LabConversationRecord[];
  adminMessages: LabAdminMessageRecord[];
  auditLogs: LabAuditLogRecord[];
}
