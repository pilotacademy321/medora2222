import { type User } from 'firebase/auth';
import type {
  BulkImportColumnMapping,
  BulkImportJobRecord,
  BulkImportJobSummary,
  BulkImportMode,
  BulkImportNormalizedRow,
  DosageForm,
} from '../types/pharmacy';
import type {
  WholesalerBatchRecord,
  WholesalerCommunicationMessage,
  WholesalerCreditPolicy,
  WholesalerPermissionKey,
  WholesalerProductRecord,
  WholesalerProfileDocument,
  WholesalerPurchaseOrder,
  WholesalerStaffMember,
  WholesalerStaffRole,
  WholesalerSupplierRecord,
  WholesalerSupplyOrder,
  WholesalerSupplyOrderStatus,
  WholesalerWorkspaceData,
} from '../types/wholesaler';

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

export interface WholesalerAccessProbeResult {
  hasAccess: boolean;
  reason?: string;
  wholesalerStatus?: string;
  actorRole?: 'wholesaler_owner' | 'wholesaler_staff';
  staffRole?: WholesalerStaffRole;
  wholesalerUid?: string;
  wholesalerName?: string;
}

export async function probeWholesalerAccess(
  firebaseUser: User,
): Promise<WholesalerAccessProbeResult> {
  const res = await fetch('/api/wholesaler/access', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<WholesalerAccessProbeResult>(res, 'WHOLESALER_ACCESS_PROBE_FAILED');
}

export async function fetchWholesalerWorkspace(
  firebaseUser: User,
): Promise<WholesalerWorkspaceData> {
  const res = await fetch('/api/wholesaler/workspace', {
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow<WholesalerWorkspaceData>(res, 'WHOLESALER_WORKSPACE_FAILED');
}

export async function saveWholesalerProduct(
  firebaseUser: User,
  payload: {
    medicineId?: string;
    scientificName?: string;
    activeIngredient?: string;
    strength?: string;
    dosageForm?: DosageForm;
    packSize?: string;
    brandName?: string;
    manufacturer?: string;
    country?: string;
    barcode?: string;
    wholesalePriceIqd: number;
    minimumOrderQty?: number;
    bonusRuleLabel?: string;
    minStockThreshold?: number;
    expiryAlertDays?: number;
    isActive?: boolean;
  },
): Promise<{ product: WholesalerProductRecord }> {
  const res = await fetch('/api/wholesaler/products', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SAVE_WHOLESALER_PRODUCT_FAILED');
}

export async function downloadWholesalerBulkTemplate(firebaseUser: User): Promise<void> {
  const token = await firebaseUser.getIdToken();
  const res = await fetch('/api/wholesaler/bulk-import/template', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('TEMPLATE_DOWNLOAD_FAILED');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'medora_wholesaler_bulk_import_template.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseWholesalerBulkImport(
  firebaseUser: User,
  payload: {
    dataBase64: string;
    mimeType: string;
    fileName: string;
    mode: BulkImportMode;
    selectedSheet?: string;
    columnMapping?: BulkImportColumnMapping;
  },
): Promise<{
  ok: boolean;
  job: BulkImportJobRecord;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  columnMapping: BulkImportColumnMapping;
  isPdfDraft: boolean;
  rows: BulkImportNormalizedRow[];
  summary: BulkImportJobSummary;
}> {
  const res = await fetch('/api/wholesaler/bulk-import/parse', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_PARSE_FAILED');
}

export async function revalidateWholesalerBulkImport(
  firebaseUser: User,
  payload: {
    jobId?: string;
    mode: BulkImportMode;
    columnMapping: BulkImportColumnMapping;
    rawRows: Array<Record<string, unknown>>;
  },
): Promise<{ ok: boolean; rows: BulkImportNormalizedRow[]; summary: BulkImportJobSummary }> {
  const res = await fetch('/api/wholesaler/bulk-import/revalidate', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_REVALIDATE_FAILED');
}

export async function commitWholesalerBulkImport(
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
  const res = await fetch('/api/wholesaler/bulk-import/commit', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'BULK_IMPORT_COMMIT_FAILED');
}

export async function fetchWholesalerBulkImportJobs(
  firebaseUser: User,
): Promise<BulkImportJobRecord[]> {
  const res = await fetch('/api/wholesaler/bulk-import/jobs', {
    headers: await authHeaders(firebaseUser),
  });
  const body = await parseJsonOrThrow<{ jobs?: BulkImportJobRecord[] }>(
    res,
    'BULK_IMPORT_JOBS_LIST_FAILED',
  );
  return body.jobs || [];
}

export async function addWholesalerBatch(
  firebaseUser: User,
  payload: {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    availableQty: number;
    purchaseCostIqd: number;
  },
): Promise<{ batch: WholesalerBatchRecord }> {
  const res = await fetch('/api/wholesaler/batches', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'ADD_WHOLESALER_BATCH_FAILED');
}

export async function saveWholesalerCreditPolicy(
  firebaseUser: User,
  payload: {
    pharmacyUid: string;
    creditEnabled: boolean;
    creditLimitIqd: number;
    paymentTermDays?: number;
    customDiscountPercent?: number;
    customPricesByProductId?: Record<string, number>;
  },
): Promise<{ creditPolicy: WholesalerCreditPolicy }> {
  const res = await fetch('/api/wholesaler/credit-policies', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SAVE_CREDIT_POLICY_FAILED');
}

export async function decideWholesalerSupplyOrder(
  firebaseUser: User,
  orderId: string,
  payload: {
    status: 'Under Review' | 'Accepted' | 'Partially Accepted' | 'Amendment Proposed' | 'Rejected';
    rejectionReason?: string;
    amendmentNote?: string;
    itemOverrides?: Array<{
      productId: string;
      approvedQty?: number;
      proposedUnitPriceIqd?: number;
    }>;
  },
): Promise<{ supplyOrder: WholesalerSupplyOrder }> {
  const res = await fetch(`/api/wholesaler/supply-orders/${encodeURIComponent(orderId)}/decision`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'DECIDE_SUPPLY_ORDER_FAILED');
}

export async function prepareWholesalerDispatch(
  firebaseUser: User,
  orderId: string,
  payload: {
    status: Extract<WholesalerSupplyOrderStatus, 'Preparing' | 'Ready for Dispatch' | 'Shipped' | 'Delivered'>;
    driverName?: string;
    driverPhone?: string;
    vehicleInfo?: string;
    dispatchNote?: string;
  },
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/wholesaler/supply-orders/${encodeURIComponent(orderId)}/prepare-dispatch`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
      body: JSON.stringify(payload),
    },
  );
  return parseJsonOrThrow(res, 'PREPARE_DISPATCH_FAILED');
}

export async function createWholesalerSupplier(
  firebaseUser: User,
  payload: {
    name: string;
    contactName?: string;
    phone?: string;
    countryOrCity?: string;
    notes?: string;
  },
): Promise<{ supplier: WholesalerSupplierRecord }> {
  const res = await fetch('/api/wholesaler/suppliers', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'CREATE_SUPPLIER_FAILED');
}

export async function createWholesalerPurchaseOrder(
  firebaseUser: User,
  payload: {
    supplierId: string;
    items: Array<{
      productId: string;
      medicineName: string;
      quantity: number;
      unitCostIqd: number;
      batchNumber: string;
      expiryDate: string;
    }>;
  },
): Promise<{ purchaseOrder: WholesalerPurchaseOrder }> {
  const res = await fetch('/api/wholesaler/purchase-orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'CREATE_PO_FAILED');
}

export async function receiveWholesalerPurchaseOrder(
  firebaseUser: User,
  poId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/wholesaler/purchase-orders/${encodeURIComponent(poId)}/receive`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  return parseJsonOrThrow(res, 'RECEIVE_PO_FAILED');
}

export async function recordWholesalerPayment(
  firebaseUser: User,
  payload: {
    invoiceId: string;
    amountIqd: number;
    method?: string;
    referenceCode?: string;
  },
): Promise<{ ok: boolean }> {
  const res = await fetch('/api/wholesaler/payments', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'RECORD_WHOLESALER_PAYMENT_FAILED');
}

export async function addWholesalerStaff(
  firebaseUser: User,
  payload: {
    email: string;
    fullName: string;
    phone?: string;
    role: WholesalerStaffRole;
    permissions?: WholesalerPermissionKey[];
  },
): Promise<{ staffMember: WholesalerStaffMember }> {
  const res = await fetch('/api/wholesaler/staff', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'ADD_WHOLESALER_STAFF_FAILED');
}

export async function updateWholesalerStaff(
  firebaseUser: User,
  staffId: string,
  payload: {
    status?: 'active' | 'suspended' | 'revoked';
    role?: WholesalerStaffRole;
    permissions?: WholesalerPermissionKey[];
  },
): Promise<{ staffMember: WholesalerStaffMember }> {
  const res = await fetch(`/api/wholesaler/staff/${encodeURIComponent(staffId)}`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_WHOLESALER_STAFF_FAILED');
}

export async function sendWholesalerCommunication(
  firebaseUser: User,
  payload: {
    channelType: 'pharmacy_supply' | 'super_admin';
    relatedId?: string;
    body: string;
  },
): Promise<{ message: WholesalerCommunicationMessage }> {
  const res = await fetch('/api/wholesaler/communications', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'SEND_WHOLESALER_COMM_FAILED');
}

export async function markWholesalerNotificationRead(
  firebaseUser: User,
  notificationId: string,
): Promise<{ ok: boolean }> {
  const res = await fetch(
    `/api/wholesaler/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: 'POST',
      headers: await authHeaders(firebaseUser),
    },
  );
  return parseJsonOrThrow(res, 'MARK_WHOLESALER_NOTIF_READ_FAILED');
}

export async function updateWholesalerSettings(
  firebaseUser: User,
  payload: {
    workingDaysAndHours?: string;
    minimumOrderIqd?: number;
    supportedGovernorates?: string[];
  },
): Promise<{ wholesalerProfile: WholesalerProfileDocument }> {
  const res = await fetch('/api/wholesaler/settings', {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res, 'UPDATE_WHOLESALER_SETTINGS_FAILED');
}
