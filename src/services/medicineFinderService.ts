import { type User } from 'firebase/auth';
import type {
  CanonicalMedicineRecord,
  DosageForm,
  MedicineFinderPharmacyOffer,
  PatientIndividualMedicineOffer,
  PharmacyBatchRecord,
  PharmacyCampaignRequestRecord,
  PharmacyCommunicationMessage,
  PharmacyEntityStatus,
  PharmacyOrderRecord,
  PharmacyProfileDocument,
  PharmacySpecialOfferRecord,
  PharmacyStaffMember,
  PublicPharmacyCard,
  PublicPharmacyStorefrontData,
} from '../types/pharmacy';
import type {
  WholesalerEntityStatus,
  WholesalerInvoiceRecord,
  WholesalerProfileDocument,
  WholesalerStaffMember,
  WholesalerSupplyOrder,
} from '../types/wholesaler';

async function authHeaders(firebaseUser: User): Promise<Record<string, string>> {
  const token = await firebaseUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export interface MedicineFinderSearchResponse {
  ok: boolean;
  prescription: {
    prescriptionId: string;
    doctorUid?: string;
    doctorName?: string;
    doctorSpecialty?: string;
    prescribedDate?: string;
    medicationsCount: number;
  } | null;
  requestedItems: Array<{ name: string; dosage?: string; quantity: number }>;
  patientLocation: { governorate: string; district: string };
  offers: MedicineFinderPharmacyOffer[];
}

export async function searchMedicineFinder(
  firebaseUser: User,
  payload: {
    prescriptionId?: string;
    items?: Array<{ name: string; dosage?: string; quantity: number; medicineId?: string }>;
    governorate?: string;
    district?: string;
  },
): Promise<MedicineFinderSearchResponse> {
  const res = await fetch('/api/patient/medicine-finder/search', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as MedicineFinderSearchResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || 'MEDICINE_FINDER_SEARCH_FAILED');
  }
  return body;
}

export async function searchIndividualMedicinesForPatient(
  firebaseUser: User,
  params: { q: string; governorate?: string; inStockOnly?: boolean },
): Promise<PatientIndividualMedicineOffer[]> {
  const qs = new URLSearchParams();
  qs.set('q', params.q.trim());
  if (params.governorate) qs.set('governorate', params.governorate.trim());
  if (params.inStockOnly === false) qs.set('inStockOnly', 'false');
  const res = await fetch(`/api/patient/medicines/search?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    offers?: PatientIndividualMedicineOffer[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || 'PATIENT_MEDICINES_SEARCH_FAILED');
  }
  return body.offers || [];
}

export async function fetchPatientPharmacyOrders(firebaseUser: User): Promise<{
  orders: PharmacyOrderRecord[];
  communications: PharmacyCommunicationMessage[];
}> {
  const res = await fetch('/api/patient/pharmacy-orders', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    orders?: PharmacyOrderRecord[];
    communications?: PharmacyCommunicationMessage[];
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.error || 'PATIENT_PHARMACY_ORDERS_FAILED');
  }
  return {
    orders: body.orders || [],
    communications: body.communications || [],
  };
}

export class PriceChangedConflictError extends Error {
  freshSubtotalIqd: number;
  freshDeliveryFeeIqd: number;
  freshTotalIqd: number;
  constructor(data: {
    freshSubtotalIqd: number;
    freshDeliveryFeeIqd: number;
    freshTotalIqd: number;
  }) {
    super('PRICE_CHANGED');
    this.freshSubtotalIqd = data.freshSubtotalIqd;
    this.freshDeliveryFeeIqd = data.freshDeliveryFeeIqd;
    this.freshTotalIqd = data.freshTotalIqd;
  }
}

export async function submitPatientPharmacyOrder(
  firebaseUser: User,
  payload: {
    pharmacyUid: string;
    prescriptionId?: string;
    fulfillmentType: 'pickup' | 'delivery';
    paymentMethod: 'cash_on_pickup' | 'cash_on_delivery';
    deliveryAddress?: string;
    deliveryGovernorate?: string;
    deliveryDistrict?: string;
    expectedTotalIqd?: number;
    clientRequestKey: string;
    items: Array<{ productId: string; quantity: number }>;
  },
): Promise<{ order: PharmacyOrderRecord; idempotentReplay?: boolean }> {
  const res = await fetch('/api/patient/pharmacy-orders', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    order?: PharmacyOrderRecord;
    idempotentReplay?: boolean;
    freshSubtotalIqd?: number;
    freshDeliveryFeeIqd?: number;
    freshTotalIqd?: number;
  };
  if (res.status === 409 && body.error === 'PRICE_CHANGED') {
    throw new PriceChangedConflictError({
      freshSubtotalIqd: Number(body.freshSubtotalIqd || 0),
      freshDeliveryFeeIqd: Number(body.freshDeliveryFeeIqd || 0),
      freshTotalIqd: Number(body.freshTotalIqd || 0),
    });
  }
  if (!res.ok || !body.order) {
    throw new Error(body.error || 'PATIENT_PHARMACY_ORDER_CREATE_FAILED');
  }
  return { order: body.order, idempotentReplay: body.idempotentReplay };
}

export async function cancelPatientPharmacyOrder(
  firebaseUser: User,
  orderId: string,
  reason: string,
): Promise<{ order: PharmacyOrderRecord }> {
  const res = await fetch(`/api/patient/pharmacy-orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ reason }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order?: PharmacyOrderRecord;
    error?: string;
  };
  if (!res.ok || !body.order) {
    throw new Error(body.error || 'PATIENT_PHARMACY_ORDER_CANCEL_FAILED');
  }
  return { order: body.order };
}

export async function confirmPatientPharmacyOrderReceipt(
  firebaseUser: User,
  orderId: string,
): Promise<{ order: PharmacyOrderRecord; receipt?: import('../types/commerce').MedoraReceiptRecord }> {
  const res = await fetch(`/api/patient/pharmacy-orders/${encodeURIComponent(orderId)}/confirm-receipt`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    order?: PharmacyOrderRecord;
    receipt?: import('../types/commerce').MedoraReceiptRecord;
    error?: string;
  };
  if (!res.ok || !body.order) {
    throw new Error(body.error || 'PATIENT_CONFIRM_RECEIPT_FAILED');
  }
  return { order: body.order, receipt: body.receipt };
}

export async function sendPatientPharmacyMessage(
  firebaseUser: User,
  orderId: string,
  messageBody: string,
): Promise<{ message: PharmacyCommunicationMessage }> {
  const res = await fetch(`/api/patient/pharmacy-orders/${encodeURIComponent(orderId)}/message`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ body: messageBody }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    message?: PharmacyCommunicationMessage;
    error?: string;
  };
  if (!res.ok || !body.message) {
    throw new Error(body.error || 'PATIENT_PHARMACY_MESSAGE_FAILED');
  }
  return { message: body.message };
}

// ---------------------------------------------------------------------------
// Super Admin Pharmacy & Wholesaler Governance APIs
// ---------------------------------------------------------------------------

export interface AdminPharmaciesOverview {
  pharmacies: PharmacyProfileDocument[];
  orders: PharmacyOrderRecord[];
  staff: PharmacyStaffMember[];
  canonicalMedicines: CanonicalMedicineRecord[];
  expiredBatches: PharmacyBatchRecord[];
  specialOffers?: PharmacySpecialOfferRecord[];
  campaignRequests?: PharmacyCampaignRequestRecord[];
}

export async function fetchAdminPharmaciesOverview(
  firebaseUser: User,
): Promise<AdminPharmaciesOverview> {
  const res = await fetch('/api/admin/pharmacies/overview', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as AdminPharmaciesOverview & {
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'ADMIN_PHARMACIES_OVERVIEW_FAILED');
  return body;
}

export async function updateAdminPharmacyStatus(
  firebaseUser: User,
  uid: string,
  status: Extract<PharmacyEntityStatus, 'Approved' | 'Suspended' | 'Deactivated' | 'Requires Changes' | 'Rejected'>,
  reason?: string,
): Promise<{ pharmacy: PharmacyProfileDocument }> {
  const res = await fetch(`/api/admin/pharmacies/${encodeURIComponent(uid)}/status`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ status, reason }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    pharmacy?: PharmacyProfileDocument;
    error?: string;
  };
  if (!res.ok || !body.pharmacy) throw new Error(body.error || 'ADMIN_PHARMACY_STATUS_FAILED');
  return { pharmacy: body.pharmacy };
}

export async function createAdminCanonicalMedicine(
  firebaseUser: User,
  payload: {
    scientificName: string;
    activeIngredient: string;
    strength: string;
    dosageForm: DosageForm;
    packSize: string;
    manufacturer?: string;
    country?: string;
    barcode?: string;
    dispensingRestrictions?: string;
    therapeuticCategory?: string;
    brandNames?: string[];
    requiresPrescription?: boolean;
    controlledDrug?: boolean;
  },
): Promise<{ medicine: CanonicalMedicineRecord }> {
  const res = await fetch('/api/admin/pharmacies/medicines', {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    medicine?: CanonicalMedicineRecord;
    error?: string;
  };
  if (!res.ok || !body.medicine) throw new Error(body.error || 'CREATE_CANONICAL_MEDICINE_FAILED');
  return { medicine: body.medicine };
}

export async function updateAdminCanonicalMedicine(
  firebaseUser: User,
  medicineId: string,
  payload: {
    scientificName?: string;
    brandNames?: string[];
    manufacturer?: string;
    country?: string;
    barcode?: string;
    dispensingRestrictions?: string;
    requiresPrescription?: boolean;
    controlledDrug?: boolean;
    therapeuticCategory?: string;
    status?: 'active' | 'deprecated';
  },
): Promise<{ medicine: CanonicalMedicineRecord }> {
  const res = await fetch(`/api/admin/pharmacies/medicines/${encodeURIComponent(medicineId)}`, {
    method: 'PUT',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    medicine?: CanonicalMedicineRecord;
    error?: string;
  };
  if (!res.ok || !body.medicine) throw new Error(body.error || 'UPDATE_CANONICAL_MEDICINE_FAILED');
  return { medicine: body.medicine };
}

export interface AdminWholesalersOverview {
  wholesalers: WholesalerProfileDocument[];
  supplyOrders: WholesalerSupplyOrder[];
  invoices: WholesalerInvoiceRecord[];
  staff: WholesalerStaffMember[];
}

export async function fetchAdminWholesalersOverview(
  firebaseUser: User,
): Promise<AdminWholesalersOverview> {
  const res = await fetch('/api/admin/wholesalers/overview', {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as AdminWholesalersOverview & {
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'ADMIN_WHOLESALERS_OVERVIEW_FAILED');
  return body;
}

export async function updateAdminWholesalerStatus(
  firebaseUser: User,
  uid: string,
  status: Extract<WholesalerEntityStatus, 'Approved' | 'Suspended' | 'Deactivated' | 'Requires Changes' | 'Rejected'>,
  reason?: string,
): Promise<{ wholesaler: WholesalerProfileDocument }> {
  const res = await fetch(`/api/admin/wholesalers/${encodeURIComponent(uid)}/status`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify({ status, reason }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    wholesaler?: WholesalerProfileDocument;
    error?: string;
  };
  if (!res.ok || !body.wholesaler) throw new Error(body.error || 'ADMIN_WHOLESALER_STATUS_FAILED');
  return { wholesaler: body.wholesaler };
}

// ---------------------------------------------------------------------------
// Public Pharmacy Storefronts (Patients & Doctors — strictly Approved + Retail)
// ---------------------------------------------------------------------------

export async function fetchPublicPharmacyStorefronts(
  firebaseUser: User,
  params?: { governorate?: string; q?: string },
): Promise<PublicPharmacyCard[]> {
  const qs = new URLSearchParams();
  if (params?.governorate) qs.set('governorate', params.governorate);
  if (params?.q) qs.set('q', params.q);
  const res = await fetch(`/api/pharmacy-storefronts?${qs.toString()}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    pharmacies?: PublicPharmacyCard[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || 'PHARMACY_STOREFRONTS_FAILED');
  return Array.isArray(body.pharmacies) ? body.pharmacies : [];
}

export async function fetchPublicPharmacyStorefrontDetail(
  firebaseUser: User,
  identifier: string,
): Promise<PublicPharmacyStorefrontData> {
  const res = await fetch(`/api/pharmacy-storefronts/${encodeURIComponent(identifier)}`, {
    headers: await authHeaders(firebaseUser),
  });
  const body = (await res.json().catch(() => ({}))) as {
    storefront?: PublicPharmacyStorefrontData;
    error?: string;
  };
  if (!res.ok || !body.storefront) {
    throw new Error(body.error || 'PHARMACY_STOREFRONT_NOT_FOUND');
  }
  return body.storefront;
}

export async function reviewAdminPharmacyMarketing(
  firebaseUser: User,
  uid: string,
  payload: {
    marketingApprovalStatus?: 'approved' | 'rejected' | 'pending_review';
    featuredStatus?: 'approved' | 'rejected' | 'none';
    reviewNote?: string;
  },
): Promise<{ pharmacy: PharmacyProfileDocument }> {
  const res = await fetch(`/api/admin/pharmacies/${encodeURIComponent(uid)}/marketing-review`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    pharmacy?: PharmacyProfileDocument;
    error?: string;
  };
  if (!res.ok || !body.pharmacy) throw new Error(body.error || 'ADMIN_MARKETING_REVIEW_FAILED');
  return { pharmacy: body.pharmacy };
}

export async function reviewAdminPharmacySpecialOffer(
  firebaseUser: User,
  offerId: string,
  payload: { approvalStatus: 'approved' | 'rejected'; reviewNote?: string },
): Promise<{ offer: PharmacySpecialOfferRecord }> {
  const res = await fetch(`/api/admin/pharmacies/offers/${encodeURIComponent(offerId)}/review`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    offer?: PharmacySpecialOfferRecord;
    error?: string;
  };
  if (!res.ok || !body.offer) throw new Error(body.error || 'ADMIN_OFFER_REVIEW_FAILED');
  return { offer: body.offer };
}

export async function reviewAdminPharmacyCampaignRequest(
  firebaseUser: User,
  requestId: string,
  payload: { status: 'Under Review' | 'Approved' | 'Rejected'; adminNote?: string },
): Promise<{ request: PharmacyCampaignRequestRecord }> {
  const res = await fetch(`/api/admin/pharmacies/campaigns/${encodeURIComponent(requestId)}/review`, {
    method: 'POST',
    headers: await authHeaders(firebaseUser),
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    request?: PharmacyCampaignRequestRecord;
    error?: string;
  };
  if (!res.ok || !body.request) throw new Error(body.error || 'ADMIN_CAMPAIGN_REVIEW_FAILED');
  return { request: body.request };
}
