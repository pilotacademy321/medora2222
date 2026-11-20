import type { UploadedDocMeta } from './medora';
import type { NotificationEventType, NotificationIconCategory } from './notifications';
import type { DosageForm } from './pharmacy';

export type WholesalerSectionId =
  | 'overview'
  | 'products'
  | 'inventory'
  | 'batches'
  | 'pharmacies'
  | 'supply_orders'
  | 'shipments'
  | 'suppliers'
  | 'purchase_orders'
  | 'invoices'
  | 'receipts'
  | 'payments'
  | 'returns'
  | 'staff'
  | 'communications'
  | 'reports'
  | 'settings';

export type WholesalerEntityStatus =
  | 'Draft'
  | 'Pending Approval'
  | 'Submitted'
  | 'Under Review'
  | 'Approved'
  | 'Rejected'
  | 'Requires Changes'
  | 'Suspended'
  | 'Deactivated';

export type WholesalerStaffRole =
  | 'owner'
  | 'warehouse_manager'
  | 'sales_rep'
  | 'dispatch_coordinator'
  | 'accountant';

export type WholesalerPermissionKey =
  | 'viewOverview'
  | 'manageCatalog'
  | 'manageInventory'
  | 'manageBatches'
  | 'managePharmacies'
  | 'manageSupplyOrders'
  | 'manageShipments'
  | 'manageSuppliers'
  | 'managePurchaseOrders'
  | 'manageBilling'
  | 'manageReturns'
  | 'manageStaff'
  | 'manageCommunications'
  | 'viewReports'
  | 'manageSettings';

export interface WholesalerProfileDocument {
  uid: string;
  institutionId: string;
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
  creditEnabledByDefault: boolean;
  licenseDocuments: UploadedDocMeta[];
  status: WholesalerEntityStatus;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WholesalerProductRecord {
  productId: string;
  wholesalerUid: string;
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
  wholesalePriceIqd: number;
  bonusRuleLabel?: string;
  minimumOrderQty: number;
  minStockThreshold: number;
  expiryAlertDays: number;
  isActive: boolean;
  lastImportJobId?: string;
  availableQty?: number;
  reservedQty?: number;
  nearestExpiryDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WholesalerBatchRecord {
  batchId: string;
  wholesalerUid: string;
  institutionId: string;
  productId: string;
  medicineId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  availableQty: number;
  reservedQty: number;
  purchaseCostIqd: number;
  supplierId?: string;
  purchaseOrderId?: string;
  isExpired: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WholesalerInventoryMovement {
  movementId: string;
  wholesalerUid: string;
  productId: string;
  batchId: string;
  batchNumber: string;
  movementType:
    | 'receive_po'
    | 'manual_add'
    | 'reserve'
    | 'release_reserve'
    | 'commit_dispatch'
    | 'manual_adjust'
    | 'return_in'
    | 'expired_writeoff';
  quantityDelta: number;
  reservedDelta: number;
  reason: string;
  relatedOrderId?: string;
  actorUid: string;
  actorName: string;
  createdAt?: string | null;
}

export interface WholesalerCreditPolicy {
  policyId: string;
  wholesalerUid: string;
  pharmacyUid: string;
  pharmacyName: string;
  creditEnabled: boolean;
  creditLimitIqd: number;
  currentBalanceIqd: number;
  paymentTermDays: number;
  customDiscountPercent: number;
  customPricesByProductId: Record<string, number>;
  updatedAt?: string | null;
}

export type WholesalerSupplyOrderStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Amendment Proposed'
  | 'Accepted'
  | 'Partially Accepted'
  | 'Rejected'
  | 'Preparing'
  | 'Ready for Dispatch'
  | 'Shipped'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled';

export interface WholesalerSupplyOrderItem {
  itemId: string;
  productId: string;
  medicineId: string;
  medicineName: string;
  requestedQty: number;
  approvedQty: number;
  receivedQty?: number;
  unitPriceIqd: number;
  proposedUnitPriceIqd?: number;
  lineTotalIqd: number;
  batchAllocations: Array<{
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    purchaseCostIqd: number;
  }>;
}

export interface WholesalerSupplyOrder {
  orderId: string;
  orderNumber: string;
  wholesalerUid: string;
  wholesalerName: string;
  pharmacyUid: string;
  pharmacyInstitutionId: string;
  pharmacyName: string;
  pharmacyGovernorate: string;
  pharmacyAddress: string;
  status: WholesalerSupplyOrderStatus;
  paymentMethod: 'cash_on_delivery' | 'credit_account';
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  subtotalIqd: number;
  discountIqd: number;
  deliveryFeeIqd: number;
  totalIqd: number;
  notes?: string;
  rejectionReason?: string;
  amendmentNote?: string;
  amendmentPendingPharmacyApproval: boolean;
  items: WholesalerSupplyOrderItem[];
  clientRequestKey?: string;
  receivedByPharmacyAt?: string | null;
  receiptDiscrepancyNote?: string;
  receiptIssued?: boolean;
  receiptId?: string;
  receiptNumber?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WholesalerShipmentRecord {
  shipmentId: string;
  wholesalerUid: string;
  orderId: string;
  orderNumber: string;
  pharmacyUid: string;
  pharmacyName: string;
  destinationAddress: string;
  driverName?: string;
  driverPhone?: string;
  vehicleInfo?: string;
  dispatchNote?: string;
  status: 'preparing' | 'ready' | 'in_transit' | 'delivered' | 'failed';
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
}

export interface WholesalerSupplierRecord {
  supplierId: string;
  wholesalerUid: string;
  name: string;
  contactName: string;
  phone: string;
  countryOrCity: string;
  notes?: string;
  balanceDueIqd: number;
  isActive: boolean;
  createdAt?: string | null;
}

export interface WholesalerPurchaseOrder {
  poId: string;
  poNumber: string;
  wholesalerUid: string;
  supplierId: string;
  supplierName: string;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  items: Array<{
    productId: string;
    medicineName: string;
    quantity: number;
    unitCostIqd: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  totalCostIqd: number;
  receivedAt?: string | null;
  createdAt?: string | null;
}

export interface WholesalerInvoiceRecord {
  invoiceId: string;
  invoiceNumber: string;
  wholesalerUid: string;
  wholesalerName: string;
  pharmacyUid: string;
  pharmacyName: string;
  orderId: string;
  orderNumber: string;
  subtotalIqd: number;
  discountIqd: number;
  deliveryFeeIqd: number;
  totalIqd: number;
  paidAmountIqd: number;
  balanceDueIqd: number;
  paymentMethod: 'cash_on_delivery' | 'credit_account';
  status: 'unpaid' | 'partial' | 'paid' | 'void';
  items: WholesalerSupplyOrderItem[];
  issuedAt: string;
}

export interface WholesalerPaymentRecord {
  paymentId: string;
  wholesalerUid: string;
  invoiceId: string;
  pharmacyUid: string;
  pharmacyName: string;
  amountIqd: number;
  method: 'cash_on_delivery' | 'credit_settlement' | 'bank_transfer_logged';
  referenceCode?: string;
  recordedByUid: string;
  recordedByName: string;
  paidAt: string;
}

export interface WholesalerReturnRecord {
  returnId: string;
  wholesalerUid: string;
  orderId: string;
  orderNumber: string;
  pharmacyUid: string;
  pharmacyName: string;
  reason: string;
  items: Array<{
    productId: string;
    medicineName: string;
    batchId: string;
    batchNumber: string;
    quantity: number;
    unitPriceIqd: number;
    restockApproved: boolean;
  }>;
  totalCreditIqd: number;
  status: 'submitted' | 'approved' | 'rejected';
  createdAt?: string | null;
}

export interface WholesalerStaffMember {
  staffId: string;
  wholesalerUid: string;
  institutionId: string;
  uid?: string;
  email: string;
  fullName: string;
  phone?: string;
  role: WholesalerStaffRole;
  permissions: WholesalerPermissionKey[];
  status: 'active' | 'suspended' | 'revoked';
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WholesalerCommunicationMessage {
  messageId: string;
  wholesalerUid: string;
  channelType: 'pharmacy_supply' | 'super_admin';
  relatedId: string;
  senderUid: string;
  senderName: string;
  senderRole: string;
  body: string;
  isRead: boolean;
  createdAt?: string | null;
}

export interface WholesalerAuditLog {
  logId: string;
  wholesalerUid: string;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  targetCollection: string;
  targetId: string;
  details: string;
  createdAt?: string | null;
}

export interface WholesalerNotificationRecord {
  notificationId: string;
  wholesalerUid: string;
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

export interface WholesalerReportsSummary {
  monthlySupplyRevenueIqd: number;
  totalReceivablesIqd: number;
  pendingOrdersCount: number;
  activePharmaciesCount: number;
  expiringSoonBatchesCount: number;
  expiredBatchesCount: number;
  returnsTotalIqd: number;
  topSuppliedProducts: Array<{
    productId: string;
    medicineName: string;
    unitsSupplied: number;
    revenueIqd: number;
  }>;
}

export interface WholesalerWorkspaceData {
  actorRole: 'wholesaler_owner' | 'wholesaler_staff';
  permissions: WholesalerPermissionKey[];
  staffRole: WholesalerStaffRole;
  wholesalerProfile: WholesalerProfileDocument;
  products: WholesalerProductRecord[];
  batches: WholesalerBatchRecord[];
  movements: WholesalerInventoryMovement[];
  creditPolicies: WholesalerCreditPolicy[];
  supplyOrders: WholesalerSupplyOrder[];
  shipments: WholesalerShipmentRecord[];
  suppliers: WholesalerSupplierRecord[];
  purchaseOrders: WholesalerPurchaseOrder[];
  invoices: WholesalerInvoiceRecord[];
  payments: WholesalerPaymentRecord[];
  returns: WholesalerReturnRecord[];
  staff: WholesalerStaffMember[];
  communications: WholesalerCommunicationMessage[];
  auditLogs: WholesalerAuditLog[];
  notifications: WholesalerNotificationRecord[];
  reports: WholesalerReportsSummary;
}
