import type { UploadedDocMeta } from './medora';

export type MedoraTransactionType =
  | 'wholesaler_to_pharmacy'
  | 'pharmacy_to_doctor'
  | 'pharmacy_to_patient';

export type MedoraPaymentMethod =
  | 'direct'
  | 'credit_account'
  | 'cash_on_delivery'
  | 'cash_on_pickup';

export type MedoraPaymentStatus = 'paid' | 'partial' | 'credit_open';

export type MedoraFulfillmentType = 'seller_delivery' | 'buyer_pickup';

export type MedoraReceiptStatus = 'active' | 'amended' | 'voided';

export type MedoraPartyRole = 'wholesaler' | 'pharmacy' | 'doctor' | 'patient' | 'super_admin' | 'lab';

export interface MedoraReceiptItem {
  productId: string;
  medicineId?: string;
  medicineName: string;
  quantity: number;
  unitPriceIqd: number;
  lineTotalIqd: number;
  batchNumbers?: string[];
  expiryDates?: string[];
}

export interface MedoraReceiptAuditEntry {
  action: 'issued' | 'reprinted' | 'amended' | 'voided';
  actorUid: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  at: string;
}

export interface MedoraReceiptRecord {
  receiptId: string; // deterministic: rcpt_${orderId}
  receiptNumber: string; // sequential: MDR-RCPT-YYYYMMDD-XXXX
  transactionType: MedoraTransactionType;
  orderId: string;
  orderNumber: string;
  sellerUid: string;
  sellerRole: 'wholesaler' | 'pharmacy';
  sellerName: string;
  sellerInstitutionId?: string;
  sellerGovernorate?: string;
  sellerAddress?: string;
  sellerPhone?: string;
  buyerUid: string;
  buyerRole: 'pharmacy' | 'doctor' | 'patient';
  buyerName: string;
  buyerInstitutionId?: string;
  buyerGovernorate?: string;
  buyerAddress?: string;
  buyerPhone?: string;
  items: MedoraReceiptItem[];
  subtotalAmountIqd: number;
  discountAmountIqd: number;
  deliveryFeeIqd: number;
  totalAmountIqd: number;
  paidAmountIqd: number;
  balanceDueIqd: number;
  paymentMethod: MedoraPaymentMethod;
  paymentStatus: MedoraPaymentStatus;
  fulfillmentType: MedoraFulfillmentType;
  status: MedoraReceiptStatus;
  reprintCount: number;
  lastPrintedAt?: string | null;
  voidReason?: string;
  voidedByUid?: string;
  voidedByName?: string;
  voidedAt?: string | null;
  amendmentNote?: string;
  amendedByUid?: string;
  amendedByName?: string;
  amendedAt?: string | null;
  notes?: string;
  auditHistory?: MedoraReceiptAuditEntry[];
  issuedAt: string;
  completedAt: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MedoraReceiptEvent {
  eventId: string;
  receiptId: string;
  receiptNumber: string;
  orderId: string;
  sellerUid: string;
  buyerUid: string;
  eventType: 'issued' | 'reprinted' | 'amended' | 'voided';
  actorUid: string;
  actorName: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type PharmacyDoctorOrderStatus =
  | 'Submitted'
  | 'Accepted'
  | 'Preparing'
  | 'Ready for Pickup'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Completed'
  | 'Rejected'
  | 'Cancelled';

export interface PharmacyDoctorOrderItem {
  itemId: string;
  productId: string;
  medicineId: string;
  medicineName: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  imageReference?: string;
  requestedQty: number;
  confirmedQty: number;
  unitPriceIqd: number;
  lineTotalIqd: number;
  batchAllocations: Array<{
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    purchasePriceIqd: number;
  }>;
}

export interface PharmacyDoctorOrder {
  orderId: string;
  orderNumber: string;
  pharmacyUid: string;
  pharmacyInstitutionId: string;
  pharmacyName: string;
  pharmacyGovernorate?: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
  doctorUid: string;
  doctorInstitutionId?: string;
  doctorName: string;
  clinicName?: string;
  doctorGovernorate?: string;
  doctorAddress?: string;
  doctorPhone?: string;
  status: PharmacyDoctorOrderStatus;
  paymentMethod: MedoraPaymentMethod;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  fulfillmentType: MedoraFulfillmentType;
  deliveryAddress?: string;
  subtotalIqd: number;
  discountIqd: number;
  deliveryFeeIqd: number;
  totalIqd: number;
  notes?: string;
  rejectionReason?: string;
  items: PharmacyDoctorOrderItem[];
  stockDeducted?: boolean;
  receiptIssued?: boolean;
  receiptId?: string;
  receiptNumber?: string;
  confirmedByDoctorAt?: string | null;
  completedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface DoctorPharmacyCatalogProduct {
  productId: string;
  pharmacyUid: string;
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  pharmacyGovernorate: string;
  pharmacyDistrict: string;
  pharmacyAddress: string;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  medicineId: string;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  packSize: string;
  manufacturer?: string;
  country?: string;
  imageReference?: string;
  sellingPriceIqd: number;
  discountPriceIqd?: number | null;
  effectivePriceIqd: number;
  availableQty: number;
  nearestExpiryDate?: string | null;
  requiresPrescription: boolean;
}

export type MedoraThreadCategory =
  | 'patient_doctor'
  | 'patient_pharmacy'
  | 'doctor_pharmacy'
  | 'pharmacy_wholesaler'
  | 'lab_doctor'
  | 'patient_lab'
  | 'entity_admin';

export interface MedoraThreadParticipant {
  uid: string;
  role: MedoraPartyRole;
  name: string;
  subtitle?: string;
}

export interface MedoraThread {
  threadId: string;
  category: MedoraThreadCategory;
  participantUids: string[];
  participants: MedoraThreadParticipant[];
  subject: string;
  transactionRef?: {
    type: MedoraTransactionType | 'lab_order' | 'appointment' | 'support';
    id: string;
    number?: string;
  } | null;
  lastMessageText: string;
  lastSenderUid: string;
  lastSenderName: string;
  lastMessageAt: string;
  unreadCountByUid: Record<string, number>;
  status: 'open' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface MedoraThreadMessage {
  messageId: string;
  threadId: string;
  participantUids: string[];
  senderUid: string;
  senderRole: MedoraPartyRole;
  senderName: string;
  body: string;
  attachments: UploadedDocMeta[];
  readByUids: string[];
  readAtByUid?: Record<string, string>;
  createdAt: string;
}

export interface MedoraOperationalError {
  errorId: string;
  scope: string;
  code: string;
  message: string;
  actorUid?: string;
  actorRole?: string;
  relatedOrderId?: string;
  severity: 'warning' | 'error' | 'critical';
  resolved: boolean;
  createdAt: string;
}
