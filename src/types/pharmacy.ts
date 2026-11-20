import type { UploadedDocMeta } from './medora';
import type { NotificationEventType, NotificationIconCategory } from './notifications';
import type { WholesalerSupplyOrder } from './wholesaler';

export type PharmacySectionId =
  | 'overview'
  | 'profile'
  | 'storefront'
  | 'products'
  | 'bulk_import'
  | 'orders'
  | 'doctor_orders'
  | 'prescriptions'
  | 'wholesaler'
  | 'supply_orders'
  | 'receipts'
  | 'messages'
  | 'marketing'
  | 'reports'
  | 'settings';

export type PharmacyEntityStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Requires Changes'
  | 'Suspended'
  | 'Deactivated';

export type PharmacyStaffRole =
  | 'owner'
  | 'responsible_pharmacist'
  | 'pharmacist'
  | 'inventory_manager'
  | 'delivery_staff'
  | 'accountant';

export type PharmacyPermissionKey =
  | 'viewOverview'
  | 'manageOrders'
  | 'reviewPrescriptions'
  | 'dispensePrescriptions'
  | 'manageCatalog'
  | 'manageInventory'
  | 'manageBatches'
  | 'manageBilling'
  | 'manageDeliveries'
  | 'manageReturns'
  | 'manageSupplyOrders'
  | 'manageStaff'
  | 'manageCommunications'
  | 'viewReports'
  | 'manageSettings';

export interface PharmacyDeliveryZone {
  zoneId: string;
  governorate: string;
  district: string;
  feeIqd: number;
  minOrderIqd?: number;
  estimatedMinutes?: number;
  isActive: boolean;
}

export interface PharmacyProfileDocument {
  uid: string;
  institutionId: string;
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
  deliveryZones: PharmacyDeliveryZone[];
  deliveryFeeIqd?: number;
  acceptedPaymentMethods: Array<'cash_on_pickup' | 'cash_on_delivery'>;
  minimumOrderIqd: number;
  taxNumber?: string;
  licenseDocuments: UploadedDocMeta[];
  logoUrl?: string;
  logoPath?: string;
  coverImageUrl?: string;
  coverImagePath?: string;
  taglineAr?: string;
  taglineEn?: string;
  aboutAr?: string;
  aboutEn?: string;
  publicSlug?: string;
  promotionalBannerTitleAr?: string;
  promotionalBannerTitleEn?: string;
  promotionalBannerBodyAr?: string;
  promotionalBannerBodyEn?: string;
  promotionalBannerImageUrl?: string;
  promotionalBannerImagePath?: string;
  marketingApprovalStatus?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  marketingReviewNote?: string;
  featuredStatus?: 'none' | 'requested' | 'approved' | 'rejected';
  status: PharmacyEntityStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacySpecialOfferRecord {
  offerId: string;
  pharmacyUid: string;
  titleAr: string;
  titleEn: string;
  description: string;
  productId?: string | null;
  discountPercent?: number | null;
  validUntil?: string | null;
  approvalStatus: 'pending_review' | 'approved' | 'rejected';
  reviewNote?: string;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyCampaignRequestRecord {
  requestId: string;
  pharmacyUid: string;
  pharmacyName: string;
  campaignTitle: string;
  campaignType: 'featured_pharmacy' | 'homepage_spotlight' | 'governorate_promo';
  targetGovernorate: string;
  notes: string;
  status: 'Submitted' | 'Under Review' | 'Approved' | 'Rejected';
  adminNote?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PublicPharmacyCard {
  uid: string;
  institutionId: string;
  publicSlug: string;
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  governorate: string;
  district: string;
  address: string;
  logoUrl?: string;
  coverImageUrl?: string;
  taglineAr?: string;
  taglineEn?: string;
  workingDaysAndHours: string;
  is24Hours: boolean;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliveryZonesCount: number;
  minimumOrderIqd: number;
  acceptedPaymentMethods: Array<'cash_on_pickup' | 'cash_on_delivery'>;
  featuredApproved: boolean;
  publishedInStockCount: number;
  approvedOffersCount: number;
  approvedPromoBanner?: {
    titleAr: string;
    titleEn: string;
    bodyAr: string;
    bodyEn: string;
    imageUrl?: string;
  } | null;
}

export interface PublicPharmacyStorefrontProduct {
  productId: string;
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  manufacturer?: string;
  country?: string;
  therapeuticCategory: string;
  imageReference?: string;
  requiresPrescription: boolean;
  controlledDrug: boolean;
  sellingPriceIqd: number;
  discountPriceIqd?: number | null;
  effectivePriceIqd: number;
  availableQty: number;
  availabilityStatus: 'in_stock' | 'low_stock';
  nearestExpiryDate?: string | null;
}

export interface PublicPharmacyStorefrontData {
  pharmacy: PublicPharmacyCard & {
    aboutAr?: string;
    aboutEn?: string;
    professionalPhone?: string;
    mapLocationUrl?: string;
    deliveryZones: PharmacyDeliveryZone[];
  };
  specialOffers: PharmacySpecialOfferRecord[];
  categories: string[];
  products: PublicPharmacyStorefrontProduct[];
}

export type DosageForm =
  | 'tablet'
  | 'capsule'
  | 'syrup'
  | 'injection'
  | 'cream'
  | 'drops'
  | 'inhaler'
  | 'suppository'
  | 'powder'
  | 'other';

export interface CanonicalMedicineRecord {
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandNames: string[];
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  manufacturer?: string;
  country?: string;
  barcode?: string;
  imageReference?: string;
  dispensingRestrictions?: string;
  approvalStatus?: 'approved' | 'pending_review';
  requiresPrescription: boolean;
  controlledDrug: boolean;
  therapeuticCategory: string;
  status: 'active' | 'deprecated';
  createdByUid?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyProductRecord {
  productId: string;
  pharmacyUid: string;
  institutionId: string;
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  manufacturer?: string;
  country?: string;
  imageReference?: string;
  barcode: string;
  sku: string;
  requiresPrescription: boolean;
  controlledDrug: boolean;
  therapeuticCategory: string;
  sellingPriceIqd: number;
  discountPriceIqd?: number | null;
  minStockThreshold: number;
  reorderLevel?: number;
  expiryAlertDays: number;
  allowPartialPack: boolean;
  availableForPatientOrders: boolean;
  isActive: boolean;
  reviewStatus?: 'approved' | 'pending_review';
  isPublishedToPatients?: boolean;
  lastImportJobId?: string;
  // Computed live from valid batches
  availableQty?: number;
  reservedQty?: number;
  nearestExpiryDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyBatchRecord {
  batchId: string;
  pharmacyUid: string;
  institutionId: string;
  productId: string;
  medicineId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  availableQty: number;
  reservedQty: number;
  purchasePriceIqd: number;
  sourceType: 'manual' | 'csv_import' | 'bulk_import' | 'wholesaler_delivery' | 'return';
  sourceOrderId?: string;
  wholesalerUid?: string;
  isExpired: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type InventoryMovementType =
  | 'receive_batch'
  | 'reserve'
  | 'release_reserve'
  | 'commit_dispense'
  | 'manual_adjust'
  | 'stocktake_adjust'
  | 'return_in'
  | 'expired_writeoff';

export interface PharmacyInventoryMovement {
  movementId: string;
  pharmacyUid: string;
  productId: string;
  batchId: string;
  batchNumber: string;
  movementType: InventoryMovementType;
  quantityDelta: number;
  reservedDelta: number;
  reason: string;
  relatedOrderId?: string;
  actorUid: string;
  actorName: string;
  createdAt?: string | null;
}

export type PatientOrderFulfillmentType = 'pickup' | 'delivery';

export type PatientPharmacyOrderStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Pharmacist Review'
  | 'Accepted'
  | 'Partially Accepted'
  | 'Rejected'
  | 'Preparing'
  | 'Ready for Pickup'
  | 'Out for Delivery'
  | 'Completed'
  | 'Cancelled'
  | 'Expired';

export type OrderItemAvailabilityStatus =
  | 'pending_review'
  | 'available'
  | 'partially_available'
  | 'unavailable'
  | 'rejected';

export interface BatchAllocationSlice {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePriceIqd: number;
}

export interface PharmacyOrderItem {
  itemId: string;
  productId: string;
  medicineId: string;
  medicineName: string;
  activeIngredient?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  requestedQty: number;
  confirmedQty: number;
  unitPriceIqd: number;
  lineTotalIqd: number;
  requiresPrescription: boolean;
  availabilityStatus: OrderItemAvailabilityStatus;
  rejectionReason?: string;
  batchAllocations: BatchAllocationSlice[];
}

export interface PharmacyOrderRecord {
  orderId: string;
  orderNumber: string;
  pharmacyUid: string;
  institutionId: string;
  pharmacyName: string;
  patientUid: string;
  patientName: string;
  patientPhoneMask?: string;
  prescriptionId?: string;
  doctorUid?: string;
  doctorName?: string;
  fulfillmentType: PatientOrderFulfillmentType;
  paymentMethod: 'cash_on_pickup' | 'cash_on_delivery';
  paymentStatus: 'unpaid' | 'paid' | 'refunded';
  deliveryAddress?: string;
  deliveryGovernorate?: string;
  deliveryDistrict?: string;
  deliveryZoneId?: string;
  deliveryFeeIqd: number;
  subtotalIqd: number;
  discountIqd: number;
  totalIqd: number;
  status: PatientPharmacyOrderStatus;
  pickupCode?: string;
  pickupVerifiedAt?: string | null;
  pickupVerifiedByName?: string;
  assignedDeliveryStaffUid?: string;
  assignedDeliveryStaffName?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  pharmacistReviewNote?: string;
  pharmacistUid?: string;
  pharmacistName?: string;
  clientRequestKey?: string;
  items: PharmacyOrderItem[];
  source: 'patient_finder' | 'doctor_prescription';
  stockDeducted?: boolean;
  receiptIssued?: boolean;
  receiptId?: string;
  receiptNumber?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyPrescriptionReview {
  reviewId: string;
  pharmacyUid: string;
  prescriptionId: string;
  patientUid: string;
  patientName: string;
  doctorUid: string;
  doctorName: string;
  doctorSpecialty?: string;
  prescribedDate: string;
  medications: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  doctorNotes?: string;
  reviewStatus:
    | 'Submitted'
    | 'Under Pharmacist Review'
    | 'Approved'
    | 'Partially Available'
    | 'Rejected'
    | 'Clarification Requested'
    | 'Dispensed';
  pharmacistUid?: string;
  pharmacistName?: string;
  pharmacistNote?: string;
  clarificationMessage?: string;
  clarificationReply?: string;
  linkedOrderId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyDispensationRecord {
  dispensationId: string;
  pharmacyUid: string;
  orderId: string;
  prescriptionId: string;
  patientUid: string;
  patientName: string;
  doctorUid: string;
  doctorName: string;
  pharmacistUid: string;
  pharmacistName: string;
  items: Array<{
    productId: string;
    medicineName: string;
    quantity: number;
    batchNumber: string;
    expiryDate: string;
  }>;
  dispensedAt: string;
}

export interface PharmacyInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  pharmacyUid: string;
  institutionId: string;
  pharmacyName: string;
  orderId: string;
  orderNumber: string;
  patientUid?: string;
  patientName: string;
  subtotalIqd: number;
  deliveryFeeIqd: number;
  discountIqd: number;
  totalIqd: number;
  paidAmountIqd: number;
  balanceDueIqd: number;
  paymentMethod: 'cash_on_pickup' | 'cash_on_delivery';
  status: 'unpaid' | 'partial' | 'paid' | 'void';
  items: PharmacyOrderItem[];
  issuedAt: string;
}

export interface PharmacyPaymentRecord {
  paymentId: string;
  pharmacyUid: string;
  invoiceId: string;
  orderId: string;
  amountIqd: number;
  method: 'cash_on_pickup' | 'cash_on_delivery';
  receivedByUid: string;
  receivedByName: string;
  note?: string;
  paidAt: string;
}

export interface PharmacyDeliveryRecord {
  deliveryId: string;
  pharmacyUid: string;
  orderId: string;
  orderNumber: string;
  patientName: string;
  governorate: string;
  district: string;
  address: string;
  deliveryFeeIqd: number;
  assignedStaffUid?: string;
  assignedStaffName?: string;
  status: 'pending_assignment' | 'assigned' | 'out_for_delivery' | 'delivered' | 'failed';
  failureReason?: string;
  proofNote?: string;
  deliveredAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyReturnRecord {
  returnId: string;
  pharmacyUid: string;
  orderId: string;
  orderNumber: string;
  patientName: string;
  reason: string;
  restockRequested: boolean;
  items: Array<{
    productId: string;
    medicineName: string;
    batchId: string;
    batchNumber: string;
    quantity: number;
    unitPriceIqd: number;
    restocked: boolean;
  }>;
  totalRefundIqd: number;
  status: 'pending' | 'approved' | 'rejected';
  processedByUid?: string;
  processedByName?: string;
  createdAt?: string | null;
}

export interface PharmacyStaffMember {
  staffId: string;
  pharmacyUid: string;
  institutionId: string;
  uid?: string;
  email: string;
  fullName: string;
  phone?: string;
  syndicateNumber?: string;
  role: PharmacyStaffRole;
  permissions: PharmacyPermissionKey[];
  status: 'active' | 'suspended' | 'revoked';
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface PharmacyCommunicationMessage {
  messageId: string;
  pharmacyUid: string;
  channelType: 'patient_order' | 'doctor_clarification' | 'wholesaler_supply' | 'super_admin';
  relatedId: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  body: string;
  isRead: boolean;
  createdAt?: string | null;
}

export interface PharmacyAuditLog {
  logId: string;
  pharmacyUid: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details: string;
  createdAt?: string | null;
}

export interface PharmacyNotificationRecord {
  notificationId: string;
  pharmacyUid: string;
  eventType?: NotificationEventType;
  type: string;
  iconCategory?: NotificationIconCategory;
  title: string;
  body: string;
  relatedId?: string;
  relatedType?: string;
  isRead: boolean;
  createdAt?: string | null;
}

export interface PharmacyReportsSummary {
  dailySalesIqd: number;
  monthlySalesIqd: number;
  ordersCount: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  returnsTotalIqd: number;
  estimatedGrossProfitIqd: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredBatchesCount: number;
  topSellingProducts: Array<{
    productId: string;
    medicineName: string;
    unitsSold: number;
    revenueIqd: number;
  }>;
}

export interface PharmacyWorkspaceData {
  actorRole: 'pharmacy_owner' | 'pharmacy_staff';
  permissions: PharmacyPermissionKey[];
  staffRole: PharmacyStaffRole;
  pharmacyProfile: PharmacyProfileDocument;
  canonicalCatalog: CanonicalMedicineRecord[];
  products: PharmacyProductRecord[];
  batches: PharmacyBatchRecord[];
  movements: PharmacyInventoryMovement[];
  orders: PharmacyOrderRecord[];
  prescriptionReviews: PharmacyPrescriptionReview[];
  dispensations: PharmacyDispensationRecord[];
  invoices: PharmacyInvoiceRecord[];
  payments: PharmacyPaymentRecord[];
  deliveries: PharmacyDeliveryRecord[];
  returns: PharmacyReturnRecord[];
  staff: PharmacyStaffMember[];
  communications: PharmacyCommunicationMessage[];
  auditLogs: PharmacyAuditLog[];
  notifications: PharmacyNotificationRecord[];
  specialOffers: PharmacySpecialOfferRecord[];
  campaignRequests: PharmacyCampaignRequestRecord[];
  supplyOrders: WholesalerSupplyOrder[];
  reports: PharmacyReportsSummary;
}

export type PrescriptionFinderAvailability =
  | 'Complete Prescription Available'
  | 'Partial Availability'
  | 'Not Available';

export interface MedicineFinderItemMatch {
  requestedName: string;
  requestedDosage?: string;
  requestedQuantity: number;
  matched: boolean;
  matchedProductId?: string;
  matchedMedicineId?: string;
  matchedName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  unitPriceIqd?: number;
  availableQty: number;
  nearestExpiryDate?: string | null;
  requiresPrescription: boolean;
}

export interface MedicineFinderPharmacyOffer {
  pharmacyUid: string;
  institutionId: string;
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  governorate: string;
  district: string;
  address: string;
  workingDaysAndHours: string;
  is24Hours: boolean;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  deliverySupportedForDistrict: boolean;
  deliveryFeeIqd: number;
  minimumOrderIqd: number;
  acceptedPaymentMethods: Array<'cash_on_pickup' | 'cash_on_delivery'>;
  availabilityClass: PrescriptionFinderAvailability;
  matchedCount: number;
  totalRequestedCount: number;
  estimatedSubtotalIqd: number;
  estimatedTotalWithDeliveryIqd: number;
  items: MedicineFinderItemMatch[];
}

export interface PatientIndividualMedicineOffer {
  pharmacyUid: string;
  institutionId: string;
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  governorate: string;
  district: string;
  address: string;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  acceptedPaymentMethods: Array<'cash_on_pickup' | 'cash_on_delivery'>;
  productId: string;
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  manufacturer?: string;
  country?: string;
  imageReference?: string;
  requiresPrescription: boolean;
  controlledDrug: boolean;
  sellingPriceIqd: number;
  discountPriceIqd?: number | null;
  effectivePriceIqd: number;
  availableQty: number;
  availabilityStatus: 'in_stock' | 'low_stock';
  nearestExpiryDate?: string | null;
}

export type BulkImportPortalType = 'pharmacy' | 'wholesaler';
export type BulkImportSourceType = 'xlsx' | 'xls' | 'csv' | 'json' | 'pdf_draft';
export type BulkImportMode =
  | 'full_catalog_and_batches'
  | 'price_update_only'
  | 'quantity_batch_update_only';

export type BulkImportCanonicalField =
  | 'barcode'
  | 'generic_name'
  | 'brand_name'
  | 'active_ingredient'
  | 'strength'
  | 'dosage_form'
  | 'package_size'
  | 'manufacturer'
  | 'country'
  | 'requires_prescription'
  | 'category'
  | 'image_reference'
  | 'retail_price'
  | 'wholesale_price'
  | 'available_quantity'
  | 'reorder_level'
  | 'minimum_order_quantity'
  | 'batch_number'
  | 'expiry_date'
  | 'purchase_price';

export type BulkImportColumnMapping = Partial<Record<BulkImportCanonicalField, string>>;

export interface BulkImportNormalizedRow {
  rowIndex: number;
  barcode: string;
  genericName: string;
  brandName: string;
  activeIngredient: string;
  strength: string;
  dosageForm: DosageForm;
  packageSize: string;
  manufacturer: string;
  country: string;
  requiresPrescription: boolean;
  category: string;
  imageReference: string;
  retailPrice?: number | null;
  wholesalePrice?: number | null;
  availableQuantity?: number | null;
  reorderLevel?: number | null;
  minimumOrderQuantity?: number | null;
  batchNumber: string;
  expiryDate: string;
  purchasePrice?: number | null;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
  warnings: string[];
  matchedCanonicalMedicineId?: string | null;
  willCreateCanonicalDraft?: boolean;
  willCreateProduct?: boolean;
  willUpdateProductId?: string | null;
  rawRow?: Record<string, string>;
}

export interface BulkImportJobSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  importedProductsCount: number;
  updatedProductsCount: number;
  importedBatchesCount: number;
  skippedRowsCount: number;
  failedRowsCount: number;
}

export interface BulkImportJobRecord {
  jobId: string;
  portalType: BulkImportPortalType;
  ownerUid: string;
  institutionId: string;
  uploadedByUid: string;
  uploadedByName: string;
  fileName: string;
  sourceType: BulkImportSourceType;
  isPdfDraft: boolean;
  pdfDraftConfirmed?: boolean;
  mode: BulkImportMode;
  status: 'preview_ready' | 'committing' | 'completed' | 'completed_with_errors' | 'failed';
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  columnMapping: BulkImportColumnMapping;
  storagePath?: string | null;
  storageUrl?: string | null;
  summary: BulkImportJobSummary;
  committedRowIndices?: number[];
  createdProductIds?: string[];
  failedRows?: Array<{ rowIndex: number; barcode?: string; genericName?: string; reason: string }>;
  publishStatus?: 'pending_review' | 'published' | 'not_applicable';
  createdAt?: string | null;
  updatedAt?: string | null;
}
