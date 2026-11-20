import { type User } from 'firebase/auth';
import type {
  BulkImportColumnMapping,
  BulkImportJobRecord,
  BulkImportJobSummary,
  BulkImportMode,
  BulkImportNormalizedRow,
  CanonicalMedicineRecord,
  DosageForm,
  PatientPharmacyOrderStatus,
  PharmacyBatchRecord,
  PharmacyCampaignRequestRecord,
  PharmacyCommunicationMessage,
  PharmacyDeliveryRecord,
  PharmacyDeliveryZone,
  PharmacyOrderRecord,
  PharmacyPermissionKey,
  PharmacyPrescriptionReview,
  PharmacyProductRecord,
  PharmacyProfileDocument,
  PharmacyReturnRecord,
  PharmacySpecialOfferRecord,
  PharmacyStaffMember,
  PharmacyStaffRole,
  PharmacyWorkspaceData,
} from '../types/pharmacy';
import type { WholesalerSupplyOrder } from '../types/wholesaler';

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

export interface PharmacyAccessProbeResult {
  hasAccess: boolean;
  reason?: string;
  pharmacyStatus?: string;
  actorRole?: 'pharmacy_owner' | 'pharmacy_staff';
  staffRole?: PharmacyStaffRole;
  pharmacyUid?: string;
  pharmacyName?: string;
}

export async function probePharmacyAccess(firebaseUser: User): Promise<PharmacyAccessProbeResult> {
  const res = await fetch('/api/pharmacy/access', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<PharmacyAccessProbeResult>(res, 'PHARMACY_ACCESS_PROBE_FAILED');
}

export async function fetchPharmacyWorkspace(firebaseUser: User): Promise<PharmacyWorkspaceData> {
  const res = await fetch('/api/pharmacy/workspace', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<PharmacyWorkspaceData>(res, 'PHARMACY_WORKSPACE_FAILED');
}

export async function createCanonicalMedicine(
  firebaseUser: User,
  payload: {
    scientificName: string;
    activeIngredient: string;
    strength: string;
    dosageForm: DosageForm;
    packSize: string;
    brandName?: string;
    manufacturer?: string;
    country?: string;
    barcode?: string;
    therapeuticCategory?: string;
    requiresPrescription?: boolean;
    controlledDrug?: boolean;
  },
): Promise<{ medicine: CanonicalMedicineRecord; matchedExisting: boolean }> {
  const res = await fetch('/api/pharmacy/canonical-medicines', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'CREATE_CANONICAL_MEDICINE_FAILED');
}

export async function savePharmacyProduct(
  firebaseUser: User,
  payload: {
    medicineId: string;
    brandName?: string;
    manufacturer?: string;
    country?: string;
    barcode?: string;
    sku?: string;
    sellingPriceIqd: number;
    discountPriceIqd?: number | null;
    minStockThreshold?: number;
    reorderLevel?: number;
    expiryAlertDays?: number;
    allowPartialPack?: boolean;
    availableForPatientOrders?: boolean;
    isPublishedToPatients?: boolean;
    isActive?: boolean;
  },
): Promise<{ product: PharmacyProductRecord }> {
  const res = await fetch('/api/pharmacy/products', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SAVE_PHARMACY_PRODUCT_FAILED');
}

export async function downloadPharmacyBulkTemplate(firebaseUser: User): Promise<void> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/pharmacy/bulk-import/template', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('TEMPLATE_DOWNLOAD_FAILED');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medora_pharmacy_bulk_import_template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface BulkImportParseResponse {
  ok: boolean;
  job: BulkImportJobRecord;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  columnMapping: BulkImportColumnMapping;
  isPdfDraft: boolean;
  rows: BulkImportNormalizedRow[];
  summary: BulkImportJobSummary;
}

export async function parsePharmacyBulkImport(
  firebaseUser: User,
  payload: {
    dataBase64: string;
    mimeType: string;
    fileName: string;
    mode: BulkImportMode;
    selectedSheet?: string;
    columnMapping?: BulkImportColumnMapping;
  },
): Promise<BulkImportParseResponse> {
  const res = await fetch('/api/pharmacy/bulk-import/parse', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_PARSE_FAILED');
}

export async function revalidatePharmacyBulkImport(
  firebaseUser: User,
  payload: {
    jobId?: string;
    mode: BulkImportMode;
    columnMapping: BulkImportColumnMapping;
    rawRows: Array<Record<string, unknown>>;
  },
): Promise<{ ok: boolean; rows: BulkImportNormalizedRow[]; summary: BulkImportJobSummary }> {
  const res = await fetch('/api/pharmacy/bulk-import/revalidate', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_REVALIDATE_FAILED');
}

export async function commitPharmacyBulkImport(
  firebaseUser: User,
  payload: {
    jobId: string;
    mode: BulkImportMode;
    pdfDraftConfirmed?: boolean;
    rows: BulkImportNormalizedRow[];
  },
): Promise<{
  ok: boolean;
  job: BulkImportJobRecord;
  importedProductsCount: number;
  updatedProductsCount: number;
  importedBatchesCount: number;
  skippedRowsCount: number;
  failedRows: Array<{ rowIndex: number; barcode?: string; genericName?: string; reason: string }>;
}> {
  const res = await fetch('/api/pharmacy/bulk-import/commit', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_COMMIT_FAILED');
}

export async function fetchPharmacyBulkImportJobs(
  firebaseUser: User,
): Promise<BulkImportJobRecord[]> {
  const res = await fetch('/api/pharmacy/bulk-import/jobs', {
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ jobs?: BulkImportJobRecord[] }>(
    res,
    'BULK_IMPORT_JOBS_LIST_FAILED',
  );
  return body.jobs || [];
}

export async function approvePublishBulkImportJob(
  firebaseUser: User,
  jobId: string,
): Promise<{ ok: boolean; publishedCount: number }> {
  const res = await fetch(
    `/api/pharmacy/bulk-import/jobs/${encodeURIComponent(jobId)}/approve-publish`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  return parseJsonOrThrow(res, 'BULK_IMPORT_PUBLISH_FAILED');
}

export async function togglePublishPharmacyProduct(
  firebaseUser: User,
  productId: string,
  publish: boolean,
): Promise<{ ok: boolean; product: PharmacyProductRecord }> {
  const res = await fetch(`/api/pharmacy/products/${encodeURIComponent(productId)}/publish`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ publish }),
  });
  return parseJsonOrThrow(res, 'PUBLISH_PRODUCT_FAILED');
}

export async function addPharmacyBatch(
  firebaseUser: User,
  payload: {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    availableQty: number;
    purchasePriceIqd: number;
  },
): Promise<{ batch: PharmacyBatchRecord }> {
  const res = await fetch('/api/pharmacy/batches', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'ADD_PHARMACY_BATCH_FAILED');
}

export async function adjustPharmacyBatch(
  firebaseUser: User,
  batchId: string,
  payload: {
    quantityDelta: number;
    movementType: 'manual_adjust' | 'stocktake_adjust' | 'expired_writeoff';
    reason: string;
  },
): Promise<{ batch: PharmacyBatchRecord }> {
  const res = await fetch(`/api/pharmacy/batches/${encodeURIComponent(batchId)}/adjust`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'ADJUST_PHARMACY_BATCH_FAILED');
}

export async function reviewPharmacyPrescription(
  firebaseUser: User,
  reviewId: string,
  payload: {
    reviewStatus: PharmacyPrescriptionReview['reviewStatus'];
    pharmacistNote?: string;
    clarificationMessage?: string;
  },
): Promise<{ review: PharmacyPrescriptionReview }> {
  const res = await fetch(`/api/pharmacy/prescriptions/${encodeURIComponent(reviewId)}/review`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'REVIEW_PRESCRIPTION_FAILED');
}

export async function transitionPharmacyOrder(
  firebaseUser: User,
  orderId: string,
  payload: {
    status: PatientPharmacyOrderStatus;
    rejectionReason?: string;
    pickupCode?: string;
    note?: string;
  },
): Promise<{ order: PharmacyOrderRecord; invoiceId?: string }> {
  const res = await fetch(`/api/pharmacy/orders/${encodeURIComponent(orderId)}/transition`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'TRANSITION_ORDER_FAILED');
}

export async function recordPharmacyInvoicePayment(
  firebaseUser: User,
  invoiceId: string,
  payload: { amountIqd: number; method: string; note?: string },
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/pharmacy/invoices/${encodeURIComponent(invoiceId)}/payments`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'RECORD_INVOICE_PAYMENT_FAILED');
}

export async function updatePharmacyDelivery(
  firebaseUser: User,
  deliveryId: string,
  payload: {
    status: 'assigned' | 'out_for_delivery' | 'delivered' | 'failed';
    assignedStaffUid?: string;
    assignedStaffName?: string;
    proofNote?: string;
    failureReason?: string;
  },
): Promise<{ delivery: PharmacyDeliveryRecord }> {
  const res = await fetch(`/api/pharmacy/deliveries/${encodeURIComponent(deliveryId)}/update`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_DELIVERY_FAILED');
}

export async function processPharmacyReturn(
  firebaseUser: User,
  payload: {
    orderId: string;
    reason: string;
    restockRequested: boolean;
    items: Array<{
      productId: string;
      medicineName: string;
      batchId: string;
      batchNumber: string;
      quantity: number;
      unitPriceIqd: number;
    }>;
  },
): Promise<{ returnRecord: PharmacyReturnRecord }> {
  const res = await fetch('/api/pharmacy/returns', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'PROCESS_RETURN_FAILED');
}

export interface PharmacyWholesalerBrowseResponse {
  wholesalers: Array<{
    uid: string;
    wholesalerNameAr: string;
    wholesalerNameEn: string;
    governorate: string;
    district: string;
    minimumOrderIqd: number;
    workingDaysAndHours: string;
    creditPolicy: {
      creditEnabled: boolean;
      creditLimitIqd: number;
      currentBalanceIqd: number;
      customDiscountPercent: number;
    } | null;
    products: Array<{
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
      wholesalePriceIqd: number;
      effectivePriceIqd?: number;
      minimumOrderQty: number;
      bonusRuleLabel?: string;
      availableQty: number;
      nearestExpiryDate: string | null;
    }>;
  }>;
  supplyOrders: WholesalerSupplyOrder[];
  priceComparisonByMedicine?: Array<{
    medicineId: string;
    scientificName: string;
    brandName: string;
    strength: string;
    dosageForm: string;
    packSize: string;
    offers: Array<{
      wholesalerUid: string;
      wholesalerName: string;
      governorate: string;
      productId: string;
      wholesalePriceIqd: number;
      effectivePriceIqd: number;
      minimumOrderQty: number;
      bonusRuleLabel?: string;
      manufacturer?: string;
      country?: string;
      availableQty: number;
      nearestExpiryDate?: string | null;
    }>;
  }>;
}

export async function browseWholesalersForPharmacy(
  firebaseUser: User,
): Promise<PharmacyWholesalerBrowseResponse> {
  const res = await fetch('/api/pharmacy/wholesalers/browse', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow(res, 'WHOLESALER_BROWSE_FAILED');
}

export async function submitWholesalerSupplyOrder(
  firebaseUser: User,
  payload: {
    wholesalerUid: string;
    paymentMethod: 'cash_on_delivery' | 'credit_account';
    notes?: string;
    clientRequestKey: string;
    items: Array<{ productId: string; requestedQty: number }>;
  },
): Promise<{ supplyOrder: WholesalerSupplyOrder; duplicate?: boolean }> {
  const res = await fetch('/api/pharmacy/wholesaler-orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SUBMIT_SUPPLY_ORDER_FAILED');
}

export async function decideWholesalerAmendment(
  firebaseUser: User,
  orderId: string,
  accept: boolean,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/pharmacy/wholesaler-orders/${encodeURIComponent(orderId)}/amendment-decision`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify({ accept }),
    },
  );
  return parseJsonOrThrow(res, 'AMENDMENT_DECISION_FAILED');
}

export async function confirmWholesalerOrderReceipt(
  firebaseUser: User,
  orderId: string,
  discrepancyNote?: string,
): Promise<{ ok: boolean; orderNumber: string; batchesTransferred: number }> {
  const res = await fetch(
    `/api/pharmacy/wholesaler-orders/${encodeURIComponent(orderId)}/confirm-receipt`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify({ discrepancyNote }),
    },
  );
  return parseJsonOrThrow(res, 'CONFIRM_RECEIPT_FAILED');
}

export async function addPharmacyStaff(
  firebaseUser: User,
  payload: {
    email: string;
    fullName: string;
    phone?: string;
    syndicateNumber?: string;
    role: PharmacyStaffRole;
    permissions?: PharmacyPermissionKey[];
  },
): Promise<{ staffMember: PharmacyStaffMember }> {
  const res = await fetch('/api/pharmacy/staff', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'ADD_PHARMACY_STAFF_FAILED');
}

export async function updatePharmacyStaff(
  firebaseUser: User,
  staffId: string,
  payload: {
    status?: 'active' | 'suspended' | 'revoked';
    role?: PharmacyStaffRole;
    permissions?: PharmacyPermissionKey[];
  },
): Promise<{ staffMember: PharmacyStaffMember }> {
  const res = await fetch(`/api/pharmacy/staff/${encodeURIComponent(staffId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_PHARMACY_STAFF_FAILED');
}

export async function sendPharmacyCommunication(
  firebaseUser: User,
  payload: {
    channelType: 'patient_order' | 'doctor_clarification' | 'wholesaler_supply' | 'super_admin';
    relatedId?: string;
    body: string;
  },
): Promise<{ message: PharmacyCommunicationMessage }> {
  const res = await fetch('/api/pharmacy/communications', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SEND_PHARMACY_COMM_FAILED');
}

export async function markPharmacyNotificationRead(
  firebaseUser: User,
  notificationId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/pharmacy/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  return parseJsonOrThrow(res, 'MARK_PHARMACY_NOTIF_READ_FAILED');
}

export async function updatePharmacySettings(
  firebaseUser: User,
  payload: {
    workingDaysAndHours?: string;
    is24Hours?: boolean;
    deliveryAvailable?: boolean;
    pickupAvailable?: boolean;
    minimumOrderIqd?: number;
    taxNumber?: string;
    deliveryZones?: PharmacyDeliveryZone[];
    acceptedPaymentMethods?: Array<'cash_on_pickup' | 'cash_on_delivery'>;
  },
): Promise<{ pharmacyProfile: PharmacyProfileDocument }> {
  const res = await fetch('/api/pharmacy/settings', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_PHARMACY_SETTINGS_FAILED');
}

export async function uploadPharmacyMedia(
  firebaseUser: User,
  payload: { dataBase64: string; mimeType: string; fileName: string },
): Promise<{
  file: {
    name: string;
    size: number;
    mimeType: string;
    url: string;
    storagePath: string;
    storageMode: string;
  };
}> {
  const res = await fetch('/api/pharmacy/media/upload', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'PHARMACY_MEDIA_UPLOAD_FAILED');
}

export async function updatePharmacyProfile(
  firebaseUser: User,
  payload: {
    pharmacyNameAr?: string;
    pharmacyNameEn?: string;
    professionalPhone?: string;
    governorate?: string;
    district?: string;
    address?: string;
    mapLocationUrl?: string;
    workingDaysAndHours?: string;
    is24Hours?: boolean;
    deliveryAvailable?: boolean;
    pickupAvailable?: boolean;
    minimumOrderIqd?: number;
    logoUrl?: string;
    logoPath?: string;
    coverImageUrl?: string;
    coverImagePath?: string;
    taglineAr?: string;
    taglineEn?: string;
    aboutAr?: string;
    aboutEn?: string;
    publicSlug?: string;
  },
): Promise<{ pharmacyProfile: PharmacyProfileDocument }> {
  const res = await fetch('/api/pharmacy/profile', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_PHARMACY_PROFILE_FAILED');
}

export async function updatePharmacyProduct(
  firebaseUser: User,
  productId: string,
  payload: {
    brandName?: string;
    manufacturer?: string;
    country?: string;
    barcode?: string;
    imageReference?: string;
    sellingPriceIqd?: number;
    discountPriceIqd?: number | null;
    minStockThreshold?: number;
    reorderLevel?: number;
    availableForPatientOrders?: boolean;
    isActive?: boolean;
    isPublishedToPatients?: boolean;
  },
): Promise<{ product: PharmacyProductRecord }> {
  const res = await fetch(`/api/pharmacy/products/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_PHARMACY_PRODUCT_FAILED');
}

export async function bulkActionPharmacyProducts(
  firebaseUser: User,
  payload: {
    productIds: string[];
    action: 'publish' | 'unpublish' | 'activate' | 'deactivate' | 'set_reorder';
    reorderLevel?: number;
  },
): Promise<{ ok: boolean; updatedCount: number }> {
  const res = await fetch('/api/pharmacy/products/bulk-action', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_ACTION_PRODUCTS_FAILED');
}

export async function manualAdjustPharmacyProductStock(
  firebaseUser: User,
  productId: string,
  payload: {
    quantityDelta: number;
    reason: string;
    batchNumber?: string;
    expiryDate?: string;
    purchasePriceIqd?: number;
  },
): Promise<{ ok: boolean; adjustedQty: number }> {
  const res = await fetch(
    `/api/pharmacy/products/${encodeURIComponent(productId)}/manual-adjust`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(payload),
    },
  );
  return parseJsonOrThrow(res, 'MANUAL_ADJUST_STOCK_FAILED');
}

export async function updatePharmacyMarketing(
  firebaseUser: User,
  payload: {
    promotionalBannerTitleAr: string;
    promotionalBannerTitleEn: string;
    promotionalBannerBodyAr: string;
    promotionalBannerBodyEn: string;
    promotionalBannerImageUrl: string;
    promotionalBannerImagePath?: string;
    requestFeatured?: boolean;
  },
): Promise<{ pharmacyProfile: PharmacyProfileDocument }> {
  const res = await fetch('/api/pharmacy/marketing', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_PHARMACY_MARKETING_FAILED');
}

export async function createPharmacySpecialOffer(
  firebaseUser: User,
  payload: {
    titleAr: string;
    titleEn?: string;
    description: string;
    productId?: string | null;
    discountPercent?: number | null;
    validUntil?: string | null;
  },
): Promise<{ offer: PharmacySpecialOfferRecord }> {
  const res = await fetch('/api/pharmacy/marketing/offers', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'CREATE_SPECIAL_OFFER_FAILED');
}

export async function deletePharmacySpecialOffer(
  firebaseUser: User,
  offerId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/pharmacy/marketing/offers/${encodeURIComponent(offerId)}`, {
    method: 'DELETE',
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow(res, 'DELETE_SPECIAL_OFFER_FAILED');
}

export async function submitPharmacyCampaignRequest(
  firebaseUser: User,
  payload: {
    campaignTitle: string;
    campaignType: 'featured_pharmacy' | 'homepage_spotlight' | 'governorate_promo';
    targetGovernorate: string;
    notes: string;
  },
): Promise<{ request: PharmacyCampaignRequestRecord }> {
  const res = await fetch('/api/pharmacy/marketing/campaign-requests', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SUBMIT_CAMPAIGN_REQUEST_FAILED');
}
