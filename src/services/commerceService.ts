import { type User } from 'firebase/auth';
import type {
  DoctorPharmacyCatalogProduct,
  MedoraFulfillmentType,
  MedoraOperationalError,
  MedoraPaymentMethod,
  MedoraPaymentStatus,
  MedoraReceiptEvent,
  MedoraReceiptRecord,
  PharmacyDoctorOrder,
} from '../types/commerce';
import type { PharmacyOrderRecord } from '../types/pharmacy';
import type { WholesalerSupplyOrder } from '../types/wholesaler';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface DoctorPharmacySummary {
  pharmacyUid: string;
  pharmacyNameAr: string;
  pharmacyNameEn: string;
  governorate: string;
  district: string;
  address: string;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
}

export async function fetchDoctorPharmacyCatalog(
  firebaseUser: User,
  params?: { q?: string; pharmacyUid?: string; governorate?: string; dosageForm?: string },
): Promise<{ pharmacies: DoctorPharmacySummary[]; items: DoctorPharmacyCatalogProduct[] }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set('q', params.q);
  if (params?.pharmacyUid) qs.set('pharmacyUid', params.pharmacyUid);
  if (params?.governorate) qs.set('governorate', params.governorate);
  if (params?.dosageForm) qs.set('dosageForm', params.dosageForm);
  const res = await fetch(`/api/doctor/pharmacies/catalog?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    pharmacies?: DoctorPharmacySummary[];
    items?: DoctorPharmacyCatalogProduct[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'DOCTOR_PHARMACY_CATALOG_FAILED');
  return {
    pharmacies: body.pharmacies || [],
    items: body.items || [],
  };
}

export async function createDoctorPharmacyOrder(
  firebaseUser: User,
  payload: {
    pharmacyUid: string;
    items: Array<{ productId: string; quantity: number }>;
    paymentMethod: MedoraPaymentMethod;
    fulfillmentType: MedoraFulfillmentType;
    deliveryAddress?: string;
    notes?: string;
  },
): Promise<PharmacyDoctorOrder> {
  const res = await fetch('/api/doctor/pharmacy-orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order?: PharmacyDoctorOrder;
    error?: string;
  };
  if (!res.ok || !body.order) throw new Error(body.error || 'DOCTOR_PHARMACY_ORDER_CREATE_FAILED');
  return body.order;
}

export async function fetchDoctorPharmacyOrders(
  firebaseUser: User,
): Promise<{ orders: PharmacyDoctorOrder[]; receipts: MedoraReceiptRecord[] }> {
  const res = await fetch('/api/doctor/pharmacy-orders', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    orders?: PharmacyDoctorOrder[];
    receipts?: MedoraReceiptRecord[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'DOCTOR_PHARMACY_ORDERS_FAILED');
  return {
    orders: body.orders || [],
    receipts: body.receipts || [],
  };
}

export async function confirmDoctorPharmacyOrderReceipt(
  firebaseUser: User,
  orderId: string,
): Promise<{ order: PharmacyDoctorOrder; receipt: MedoraReceiptRecord }> {
  const res = await fetch(`/api/doctor/pharmacy-orders/${encodeURIComponent(orderId)}/confirm-receipt`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order?: PharmacyDoctorOrder;
    receipt?: MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.order || !body.receipt) {
    throw new Error(body.error || 'DOCTOR_CONFIRM_RECEIPT_FAILED');
  }
  return { order: body.order, receipt: body.receipt };
}

export async function fetchPharmacyDoctorOrders(
  firebaseUser: User,
): Promise<{ orders: PharmacyDoctorOrder[]; receipts: MedoraReceiptRecord[] }> {
  const res = await fetch('/api/pharmacy/doctor-orders', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    orders?: PharmacyDoctorOrder[];
    receipts?: MedoraReceiptRecord[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'PHARMACY_DOCTOR_ORDERS_FAILED');
  return {
    orders: body.orders || [],
    receipts: body.receipts || [],
  };
}

export async function actionPharmacyDoctorOrder(
  firebaseUser: User,
  orderId: string,
  action: 'accept' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'complete' | 'reject',
  reason?: string,
): Promise<{ order: PharmacyDoctorOrder; receipt?: MedoraReceiptRecord }> {
  const res = await fetch(`/api/pharmacy/doctor-orders/${encodeURIComponent(orderId)}/action`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ action, reason }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order?: PharmacyDoctorOrder;
    receipt?: MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.order) throw new Error(body.error || 'PHARMACY_DOCTOR_ORDER_ACTION_FAILED');
  return { order: body.order, receipt: body.receipt };
}

export async function fetchScopedReceipts(
  firebaseUser: User,
  params?: { transactionType?: string; q?: string },
): Promise<MedoraReceiptRecord[]> {
  const qs = new URLSearchParams();
  if (params?.transactionType) qs.set('transactionType', params.transactionType);
  if (params?.q) qs.set('q', params.q);
  const res = await fetch(`/api/receipts?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    receipts?: MedoraReceiptRecord[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'RECEIPTS_LOAD_FAILED');
  return body.receipts || [];
}

export async function fetchReceiptDetail(
  firebaseUser: User,
  receiptId: string,
): Promise<{ receipt: MedoraReceiptRecord; events: MedoraReceiptEvent[] }> {
  const res = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    receipt?: MedoraReceiptRecord;
    events?: MedoraReceiptEvent[];
    error?: string;
  };
  if (!res.ok || !body.receipt) throw new Error(body.error || 'RECEIPT_DETAIL_FAILED');
  return { receipt: body.receipt, events: body.events || [] };
}

export async function recordReceiptReprint(
  firebaseUser: User,
  receiptId: string,
): Promise<MedoraReceiptRecord> {
  const res = await fetch(`/api/receipts/${encodeURIComponent(receiptId)}/reprint`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    receipt?: MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.receipt) throw new Error(body.error || 'RECEIPT_REPRINT_FAILED');
  return body.receipt;
}

export async function voidAdminReceipt(
  firebaseUser: User,
  receiptId: string,
  reason: string,
): Promise<MedoraReceiptRecord> {
  const res = await fetch(`/api/admin/receipts/${encodeURIComponent(receiptId)}/void`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ reason }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    receipt?: MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.receipt) throw new Error(body.error || 'RECEIPT_VOID_FAILED');
  return body.receipt;
}

export async function amendAdminReceipt(
  firebaseUser: User,
  receiptId: string,
  payload: { reason: string; paymentStatus?: MedoraPaymentStatus; notes?: string },
): Promise<MedoraReceiptRecord> {
  const res = await fetch(`/api/admin/receipts/${encodeURIComponent(receiptId)}/amend`, {
    method: 'PATCH',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    receipt?: MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.receipt) throw new Error(body.error || 'RECEIPT_AMEND_FAILED');
  return body.receipt;
}

export interface AdminCommerceOverviewData {
  wholesalerSupplyOrders: WholesalerSupplyOrder[];
  pharmacyDoctorOrders: PharmacyDoctorOrder[];
  pharmacyOrders: PharmacyOrderRecord[];
  receipts: MedoraReceiptRecord[];
  receiptEvents: MedoraReceiptEvent[];
  operationalErrors: MedoraOperationalError[];
}

export async function fetchAdminCommerceOverview(
  firebaseUser: User,
): Promise<AdminCommerceOverviewData> {
  const res = await fetch('/api/admin/commerce/overview', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as AdminCommerceOverviewData & { error?: string };
  if (!res.ok) throw new Error(body.error || 'ADMIN_COMMERCE_OVERVIEW_FAILED');
  return body;
}

export async function resolveAdminOperationalError(
  firebaseUser: User,
  errorId: string,
): Promise<void> {
  const res = await fetch(`/api/admin/operational-errors/${encodeURIComponent(errorId)}/resolve`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error || 'RESOLVE_ERROR_FAILED');
}
