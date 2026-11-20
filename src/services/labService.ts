import { type User } from 'firebase/auth';
import { prepareUploadPayloadFromFile } from '../utils/imagePreparation';
import type { GenderType, UploadedDocMeta } from '../types/medora';
import type { FacilityBookingRecord, FacilityBookingStatus } from '../types/patient';
import type {
  HomeCollectionStatus,
  LabActorRole,
  LabAdminMessageRecord,
  LabConversationRecord,
  LabHomeCollectionRequest,
  LabInventoryItem,
  LabInvoiceItem,
  LabInvoiceRecord,
  LabMessageRecord,
  LabOfferPackage,
  LabOrderRecord,
  LabOrderStatus,
  LabOrderTestLine,
  LabPatientRecord,
  LabPaymentRecord,
  LabPermissionKey,
  LabProfileRecord,
  LabPurchaseOrder,
  LabResultAnalyte,
  LabResultRecord,
  LabReviewRecord,
  LabSampleRecord,
  LabSampleType,
  LabStaffMember,
  LabStockMovement,
  LabSupplier,
  LabTestCatalogItem,
  LabTestConsumptionRecipe,
  LabWorkspaceData,
} from '../types/lab';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJsonOrThrow<T>(res: Response, fallbackCode: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  } & T;
  if (!res.ok) {
    throw new Error(body.error || body.message || fallbackCode);
  }
  return body;
}

export interface LabAccessProbeResult {
  hasAccess: boolean;
  reason?: string;
  suspended?: boolean;
  actorRole?: LabActorRole;
  actorName?: string;
  labUid?: string;
  institutionId?: string;
  labNameAr?: string;
  institutionStatus?: string;
  permissions?: LabPermissionKey[];
}

export async function probeLabAccess(firebaseUser: User): Promise<LabAccessProbeResult> {
  const res = await fetch('/api/lab/access', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<LabAccessProbeResult>(res, 'LAB_ACCESS_PROBE_FAILED');
}

export async function fetchLabWorkspace(firebaseUser: User): Promise<LabWorkspaceData> {
  const res = await fetch('/api/lab/workspace', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<LabWorkspaceData>(res, 'LAB_WORKSPACE_FAILED');
}

export async function createLabPatient(
  firebaseUser: User,
  input: {
    fullName: string;
    phone: string;
    gender?: GenderType | 'unspecified';
    dateOfBirth?: string;
    age?: number;
    address?: string;
    allergies?: string;
    chronicNotes?: string;
    linkedPatientUid?: string;
  },
): Promise<LabPatientRecord> {
  const res = await fetch('/api/lab/patients', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ patient: LabPatientRecord }>(res, 'LAB_PATIENT_CREATE_FAILED');
  return body.patient;
}

export async function updateLabPatient(
  firebaseUser: User,
  patientRecordId: string,
  input: Partial<{
    fullName: string;
    phone: string;
    gender: GenderType | 'unspecified';
    dateOfBirth: string;
    age: number;
    address: string;
    allergies: string;
    chronicNotes: string;
  }>,
): Promise<LabPatientRecord> {
  const res = await fetch(`/api/lab/patients/${encodeURIComponent(patientRecordId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ patient: LabPatientRecord }>(res, 'LAB_PATIENT_UPDATE_FAILED');
  return body.patient;
}

export async function adoptCentralLabTests(
  firebaseUser: User,
  centralTestIds: string[],
): Promise<LabTestCatalogItem[]> {
  const res = await fetch('/api/lab/tests/adopt-central', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ centralTestIds }),
  });
  const body = await parseJsonOrThrow<{ addedTests: LabTestCatalogItem[] }>(res, 'ADOPT_CENTRAL_TESTS_FAILED');
  return body.addedTests || [];
}

export async function createLabTest(
  firebaseUser: User,
  input: {
    nameAr: string;
    nameEn?: string;
    code?: string;
    category?: string;
    sampleType: LabSampleType;
    unit?: string;
    referenceRangeText?: string;
    referenceMin?: number | null;
    referenceMax?: number | null;
    prepInstructions?: string;
    priceIqd: number;
    turnaroundHours: number;
    isActive?: boolean;
  },
): Promise<LabTestCatalogItem> {
  const res = await fetch('/api/lab/tests', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ test: LabTestCatalogItem }>(res, 'LAB_TEST_CREATE_FAILED');
  return body.test;
}

export async function updateLabTest(
  firebaseUser: User,
  testId: string,
  input: Partial<{
    nameAr: string;
    nameEn: string;
    code: string;
    category: string;
    sampleType: LabSampleType;
    unit: string;
    referenceRangeText: string;
    prepInstructions: string;
    priceIqd: number;
    turnaroundHours: number;
    isActive: boolean;
  }>,
): Promise<LabTestCatalogItem> {
  const res = await fetch(`/api/lab/tests/${encodeURIComponent(testId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ test: LabTestCatalogItem }>(res, 'LAB_TEST_UPDATE_FAILED');
  return body.test;
}

export async function createLabOffer(
  firebaseUser: User,
  input: {
    offerType: 'single_discount' | 'package';
    title: string;
    description: string;
    testIds: string[];
    testNames: string[];
    originalPriceIqd: number;
    offerPriceIqd: number;
    startDate: string;
    endDate: string;
    isActive?: boolean;
  },
): Promise<LabOfferPackage> {
  const res = await fetch('/api/lab/offers', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ offer: LabOfferPackage }>(res, 'LAB_OFFER_CREATE_FAILED');
  return body.offer;
}

export async function updateLabOffer(
  firebaseUser: User,
  offerId: string,
  input: Partial<{
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
  }>,
): Promise<LabOfferPackage> {
  const res = await fetch(`/api/lab/offers/${encodeURIComponent(offerId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ offer: LabOfferPackage }>(res, 'LAB_OFFER_UPDATE_FAILED');
  return body.offer;
}

export async function createLabOrder(
  firebaseUser: User,
  input: {
    patientRecordId: string;
    priority: 'routine' | 'urgent' | 'stat';
    tests: LabOrderTestLine[];
    offerId?: string;
    offerTitle?: string;
    discountIqd?: number;
    homeCollectionFeeIqd?: number;
    clinicalNotes?: string;
    sourceBookingId?: string;
    sourceHomeCollectionId?: string;
    autoCreateInvoice?: boolean;
  },
): Promise<{ order: LabOrderRecord; invoice: LabInvoiceRecord | null }> {
  const res = await fetch('/api/lab/orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{ order: LabOrderRecord; invoice: LabInvoiceRecord | null }>(
    res,
    'LAB_ORDER_CREATE_FAILED',
  );
}

export async function updateLabOrderStatus(
  firebaseUser: User,
  orderId: string,
  status: LabOrderStatus,
): Promise<{ order: LabOrderRecord; consumptionSummary?: Record<string, unknown> | null }> {
  const res = await fetch(`/api/lab/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ status }),
  });
  return parseJsonOrThrow<{ order: LabOrderRecord; consumptionSummary?: Record<string, unknown> | null }>(
    res,
    'LAB_ORDER_STATUS_FAILED',
  );
}

export async function consumeOrderInventory(
  firebaseUser: User,
  orderId: string,
): Promise<{ order: LabOrderRecord; summary: { consumedCount: number; alreadyConsumed: boolean } }> {
  const res = await fetch(`/api/lab/orders/${encodeURIComponent(orderId)}/consume-inventory`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<{ order: LabOrderRecord; summary: { consumedCount: number; alreadyConsumed: boolean } }>(
    res,
    'INVENTORY_CONSUME_FAILED',
  );
}

export async function reverseOrderInventory(
  firebaseUser: User,
  orderId: string,
  reason: string,
): Promise<{ order: LabOrderRecord; summary: { reversedCount: number } }> {
  const res = await fetch(`/api/lab/orders/${encodeURIComponent(orderId)}/reverse-inventory`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ reason }),
  });
  return parseJsonOrThrow<{ order: LabOrderRecord; summary: { reversedCount: number } }>(
    res,
    'INVENTORY_REVERSE_FAILED',
  );
}

export async function createLabSample(
  firebaseUser: User,
  input: {
    orderId: string;
    sampleType: LabSampleType;
    containerNote?: string;
    status: 'collected' | 'accepted' | 'rejected';
    rejectionReason?: string;
    collectedByName?: string;
  },
): Promise<LabSampleRecord> {
  const res = await fetch('/api/lab/samples', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ sample: LabSampleRecord }>(res, 'LAB_SAMPLE_CREATE_FAILED');
  return body.sample;
}

export async function updateLabSample(
  firebaseUser: User,
  sampleId: string,
  input: { status: 'collected' | 'accepted' | 'rejected'; rejectionReason?: string },
): Promise<LabSampleRecord> {
  const res = await fetch(`/api/lab/samples/${encodeURIComponent(sampleId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ sample: LabSampleRecord }>(res, 'LAB_SAMPLE_UPDATE_FAILED');
  return body.sample;
}

export async function createLabHomeCollection(
  firebaseUser: User,
  input: {
    patientName: string;
    patientPhone: string;
    address: string;
    governorate?: string;
    district?: string;
    requestedDate: string;
    preferredWindow: string;
    requestedTests: string[];
    assignedStaffName?: string;
    assignedStaffPhone?: string;
    collectionFeeIqd?: number;
    notes?: string;
  },
): Promise<LabHomeCollectionRequest> {
  const res = await fetch('/api/lab/home-collections', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ request: LabHomeCollectionRequest }>(res, 'HOME_COLLECTION_CREATE_FAILED');
  return body.request;
}

export async function updateLabHomeCollection(
  firebaseUser: User,
  requestId: string,
  input: Partial<{
    status: HomeCollectionStatus;
    assignedStaffName: string;
    assignedStaffPhone: string;
    collectionFeeIqd: number;
    notes: string;
  }>,
): Promise<LabHomeCollectionRequest> {
  const res = await fetch(`/api/lab/home-collections/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ request: LabHomeCollectionRequest }>(res, 'HOME_COLLECTION_UPDATE_FAILED');
  return body.request;
}

export async function updateLabBooking(
  firebaseUser: User,
  bookingId: string,
  input: Partial<{
    status: FacilityBookingStatus;
    preparationNotes: string;
    resultSummary: string;
    convertToOrder: boolean;
  }>,
): Promise<{ booking: FacilityBookingRecord; order: LabOrderRecord | null }> {
  const res = await fetch(`/api/lab/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{ booking: FacilityBookingRecord; order: LabOrderRecord | null }>(
    res,
    'LAB_BOOKING_UPDATE_FAILED',
  );
}

export async function saveLabResult(
  firebaseUser: User,
  input: {
    orderId: string;
    submitForApproval: boolean;
    analytes: LabResultAnalyte[];
    summaryNote: string;
    attachments: UploadedDocMeta[];
  },
): Promise<LabResultRecord> {
  const res = await fetch('/api/lab/results', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ result: LabResultRecord }>(res, 'LAB_RESULT_SAVE_FAILED');
  return body.result;
}

export async function approveLabResult(
  firebaseUser: User,
  resultId: string,
  publishToPatient: boolean,
): Promise<LabResultRecord> {
  const res = await fetch(`/api/lab/results/${encodeURIComponent(resultId)}/approve`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ publishToPatient }),
  });
  const body = await parseJsonOrThrow<{ result: LabResultRecord }>(res, 'LAB_RESULT_APPROVE_FAILED');
  return body.result;
}

export async function publishLabResult(
  firebaseUser: User,
  resultId: string,
): Promise<LabResultRecord> {
  const res = await fetch(`/api/lab/results/${encodeURIComponent(resultId)}/publish`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ result: LabResultRecord }>(res, 'LAB_RESULT_PUBLISH_FAILED');
  return body.result;
}

export async function correctLabResult(
  firebaseUser: User,
  resultId: string,
  input: {
    correctionReason: string;
    analytes: LabResultAnalyte[];
    summaryNote: string;
    attachments?: UploadedDocMeta[];
  },
): Promise<LabResultRecord> {
  const res = await fetch(`/api/lab/results/${encodeURIComponent(resultId)}/correct`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ result: LabResultRecord }>(res, 'LAB_RESULT_CORRECT_FAILED');
  return body.result;
}

export async function createLabInvoice(
  firebaseUser: User,
  input: {
    patientRecordId: string;
    orderId?: string;
    orderNumber?: string;
    items: LabInvoiceItem[];
    discountIqd?: number;
    homeCollectionFeeIqd?: number;
    initialPaidIqd?: number;
    method?: 'cash' | 'card_pos' | 'bank_transfer';
    referenceNote?: string;
    notes?: string;
  },
): Promise<{ invoice: LabInvoiceRecord; payment: LabPaymentRecord | null }> {
  const res = await fetch('/api/lab/invoices', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{ invoice: LabInvoiceRecord; payment: LabPaymentRecord | null }>(
    res,
    'LAB_INVOICE_CREATE_FAILED',
  );
}

export async function recordLabPayment(
  firebaseUser: User,
  invoiceId: string,
  input: {
    amountIqd: number;
    method: 'cash' | 'card_pos' | 'bank_transfer';
    referenceNote?: string;
  },
): Promise<{ invoice: LabInvoiceRecord; payment: LabPaymentRecord }> {
  const res = await fetch(`/api/lab/invoices/${encodeURIComponent(invoiceId)}/payments`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{ invoice: LabInvoiceRecord; payment: LabPaymentRecord }>(
    res,
    'LAB_PAYMENT_FAILED',
  );
}

export async function voidLabInvoice(
  firebaseUser: User,
  invoiceId: string,
): Promise<LabInvoiceRecord> {
  const res = await fetch(`/api/lab/invoices/${encodeURIComponent(invoiceId)}/void`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ invoice: LabInvoiceRecord }>(res, 'INVOICE_VOID_FAILED');
  return body.invoice;
}

export async function createLabStaff(
  firebaseUser: User,
  input: {
    email: string;
    fullName: string;
    phone?: string;
    roleTitle: string;
    permissions: LabPermissionKey[];
  },
): Promise<LabStaffMember> {
  const res = await fetch('/api/lab/staff', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ staffMember: LabStaffMember }>(res, 'LAB_STAFF_CREATE_FAILED');
  return body.staffMember;
}

export async function updateLabStaff(
  firebaseUser: User,
  staffId: string,
  input: Partial<{
    fullName: string;
    phone: string;
    roleTitle: string;
    permissions: LabPermissionKey[];
    status: 'active' | 'suspended' | 'revoked';
  }>,
): Promise<LabStaffMember> {
  const res = await fetch(`/api/lab/staff/${encodeURIComponent(staffId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ staffMember: LabStaffMember }>(res, 'LAB_STAFF_UPDATE_FAILED');
  return body.staffMember;
}

export async function revokeLabStaff(firebaseUser: User, staffId: string): Promise<void> {
  const res = await fetch(`/api/lab/staff/${encodeURIComponent(staffId)}/revoke`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'LAB_STAFF_REVOKE_FAILED');
}

export async function createLabInventoryItem(
  firebaseUser: User,
  input: {
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
  },
): Promise<LabInventoryItem> {
  const res = await fetch('/api/lab/inventory', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ item: LabInventoryItem }>(res, 'INVENTORY_CREATE_FAILED');
  return body.item;
}

export async function updateLabInventoryItem(
  firebaseUser: User,
  itemId: string,
  input: Partial<{
    name: string;
    unit: string;
    minThreshold: number;
    lotNumber: string;
    expiryDate: string;
    unitCostIqd: number;
    notes: string;
  }>,
): Promise<LabInventoryItem> {
  const res = await fetch(`/api/lab/inventory/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ item: LabInventoryItem }>(res, 'INVENTORY_UPDATE_FAILED');
  return body.item;
}

export async function adjustLabInventoryStock(
  firebaseUser: User,
  itemId: string,
  input: { delta: number; reason: string },
): Promise<{ item: LabInventoryItem; movement: LabStockMovement }> {
  const res = await fetch(`/api/lab/inventory/${encodeURIComponent(itemId)}/adjust`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  return parseJsonOrThrow<{ item: LabInventoryItem; movement: LabStockMovement }>(
    res,
    'INVENTORY_ADJUST_FAILED',
  );
}

export async function saveLabTestRecipe(
  firebaseUser: User,
  input: {
    testId: string;
    testName: string;
    materials: Array<{ itemId: string; itemName: string; unit: string; quantityPerTest: number }>;
  },
): Promise<LabTestConsumptionRecipe> {
  const res = await fetch('/api/lab/recipes', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ recipe: LabTestConsumptionRecipe }>(res, 'RECIPE_SAVE_FAILED');
  return body.recipe;
}

export async function createLabSupplier(
  firebaseUser: User,
  input: {
    name: string;
    contactPerson?: string;
    phone: string;
    email?: string;
    address?: string;
    category?: string;
    notes?: string;
  },
): Promise<LabSupplier> {
  const res = await fetch('/api/lab/suppliers', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ supplier: LabSupplier }>(res, 'SUPPLIER_CREATE_FAILED');
  return body.supplier;
}

export async function createLabPurchaseOrder(
  firebaseUser: User,
  input: {
    supplierId: string;
    supplierName: string;
    items: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      unitCostIqd: number;
      lotNumber?: string;
      expiryDate?: string;
    }>;
    notes?: string;
  },
): Promise<LabPurchaseOrder> {
  const res = await fetch('/api/lab/purchase-orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ purchaseOrder: LabPurchaseOrder }>(res, 'PO_CREATE_FAILED');
  return body.purchaseOrder;
}

export async function receiveLabPurchaseOrder(
  firebaseUser: User,
  poId: string,
): Promise<LabPurchaseOrder> {
  const res = await fetch(`/api/lab/purchase-orders/${encodeURIComponent(poId)}/receive`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ purchaseOrder: LabPurchaseOrder }>(res, 'PO_RECEIVE_FAILED');
  return body.purchaseOrder;
}

export async function replyToLabReview(
  firebaseUser: User,
  reviewId: string,
  reply: string,
): Promise<LabReviewRecord> {
  const res = await fetch(`/api/lab/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ reply }),
  });
  const body = await parseJsonOrThrow<{ review: LabReviewRecord }>(res, 'REVIEW_REPLY_FAILED');
  return body.review;
}

export async function markLabNotificationRead(
  firebaseUser: User,
  notificationId: string,
): Promise<void> {
  const res = await fetch(`/api/lab/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'NOTIFICATION_UPDATE_FAILED');
}

export async function markAllLabNotificationsRead(firebaseUser: User): Promise<void> {
  const res = await fetch('/api/lab/notifications/read-all', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'NOTIFICATIONS_READ_ALL_FAILED');
}

export async function createOrOpenLabConversation(
  firebaseUser: User,
  input: { patientUid: string; patientName: string; patientPhone?: string },
): Promise<LabConversationRecord> {
  const res = await fetch('/api/lab/conversations', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ conversation: LabConversationRecord }>(res, 'CONVERSATION_CREATE_FAILED');
  return body.conversation;
}

export async function fetchLabConversationMessages(
  firebaseUser: User,
  conversationId: string,
): Promise<LabMessageRecord[]> {
  const res = await fetch(`/api/lab/conversations/${encodeURIComponent(conversationId)}/messages`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ messages: LabMessageRecord[] }>(res, 'MESSAGES_LOAD_FAILED');
  return body.messages || [];
}

export async function sendLabConversationMessage(
  firebaseUser: User,
  conversationId: string,
  input: { text: string; attachments?: UploadedDocMeta[] },
): Promise<LabMessageRecord> {
  const res = await fetch(`/api/lab/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ message: LabMessageRecord }>(res, 'MESSAGE_SEND_FAILED');
  return body.message;
}

export async function sendLabAdminMessage(
  firebaseUser: User,
  input: { subject: string; body: string },
): Promise<LabAdminMessageRecord> {
  const res = await fetch('/api/lab/admin-messages', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ message: LabAdminMessageRecord }>(res, 'ADMIN_MESSAGE_SEND_FAILED');
  return body.message;
}

export async function markLabAdminMessagesRead(firebaseUser: User): Promise<void> {
  const res = await fetch('/api/lab/admin-messages/read-all', {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'ADMIN_MESSAGES_READ_FAILED');
}

export async function uploadLabPrivateFile(
  firebaseUser: User,
  folder: 'lab_results' | 'lab_files' | 'message_files' | 'avatars',
  file: File,
  meta?: { labPatientUid?: string; conversationId?: string },
): Promise<UploadedDocMeta> {
  const prepared = await prepareUploadPayloadFromFile(file, {
    kind: folder === 'avatars' ? 'avatar' : 'clinical_doc',
    defaultBaseName: folder,
  });

  const res = await fetch('/api/lab/files/upload', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({
      folder,
      dataBase64: prepared.dataBase64,
      mimeType: prepared.mimeType,
      fileName: prepared.fileName,
      ...(meta?.labPatientUid ? { labPatientUid: meta.labPatientUid } : {}),
      ...(meta?.conversationId ? { conversationId: meta.conversationId } : {}),
    }),
  });
  const body = await parseJsonOrThrow<{ file: UploadedDocMeta }>(res, 'FILE_UPLOAD_FAILED');
  return {
    name: body.file.name || prepared.fileName,
    size: body.file.size || prepared.preparedFile.size,
    mimeType: body.file.mimeType || prepared.mimeType,
    url: body.file.url,
    storagePath: body.file.storagePath || '',
    uploadedAtIso: body.file.uploadedAtIso || new Date().toISOString(),
  };
}

export async function updateLabSettings(
  firebaseUser: User,
  input: Partial<{
    labNameAr: string;
    labNameEn: string;
    directorName: string;
    technicalDirectorName: string;
    professionalPhone: string;
    governorate: string;
    district: string;
    address: string;
    mapLocationUrl: string;
    workDaysAndHours: string;
    hourlyBookingLimit: number;
    bookingConfirmationMode: 'manual' | 'auto';
    homeCollectionEnabled: boolean;
    homeCollectionFeeIqd: number;
    licenseNumber: string;
    licensingAuthority: string;
    licenseExpiryDate: string;
    licenseDocuments: UploadedDocMeta[];
    managerAvatarUrl: string;
    avatarPath: string;
  }>,
): Promise<LabProfileRecord> {
  const res = await fetch('/api/lab/settings', {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ labProfile: LabProfileRecord }>(res, 'LAB_SETTINGS_UPDATE_FAILED');
  return body.labProfile;
}

// ---------------------------------------------------------------------------
// Super Admin Laboratory Governance API
// ---------------------------------------------------------------------------
export interface AdminLabSummaryRecord extends LabProfileRecord {
  ordersCount: number;
  activeStaffCount: number;
}

export interface AdminLabsOverviewPayload {
  labs: AdminLabSummaryRecord[];
  reviews: LabReviewRecord[];
  adminMessages: LabAdminMessageRecord[];
}

export async function fetchAdminLabsOverview(firebaseUser: User): Promise<AdminLabsOverviewPayload> {
  const res = await fetch('/api/admin/labs/overview', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<AdminLabsOverviewPayload>(res, 'ADMIN_LABS_OVERVIEW_FAILED');
}

export async function moderateAdminLabReview(
  firebaseUser: User,
  reviewId: string,
  input: { status: 'approved' | 'hidden' | 'flagged' | 'removed'; adminNote?: string },
): Promise<LabReviewRecord> {
  const res = await fetch(`/api/admin/labs/reviews/${encodeURIComponent(reviewId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ review: LabReviewRecord }>(res, 'LAB_REVIEW_MODERATION_FAILED');
  return body.review;
}

export async function sendAdminLabMessage(
  firebaseUser: User,
  labUid: string,
  input: { subject: string; body: string },
): Promise<LabAdminMessageRecord> {
  const res = await fetch(`/api/admin/labs/${encodeURIComponent(labUid)}/message`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(input),
  });
  const body = await parseJsonOrThrow<{ message: LabAdminMessageRecord }>(res, 'ADMIN_LAB_MESSAGE_FAILED');
  return body.message;
}

export async function markAdminLabMessagesRead(firebaseUser: User, labUid: string): Promise<void> {
  const res = await fetch(`/api/admin/labs/${encodeURIComponent(labUid)}/admin-messages/read`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
  });
  await parseJsonOrThrow<{ ok: boolean }>(res, 'ADMIN_LAB_MESSAGES_READ_FAILED');
}

// ---------------------------------------------------------------------------
// Excel-Ready UTF-8 BOM CSV Exporter
// ---------------------------------------------------------------------------
export function exportLabRowsToCsv(
  fileNameBase: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): void {
  const escapeCell = (val: string | number | boolean | null | undefined): string => {
    const raw = val === null || val === undefined ? '' : String(val);
    if (/[",\n\r]/.test(raw)) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const csvLines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileNameBase}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
