import type {
  BatchAllocationSlice,
  CanonicalMedicineRecord,
  DosageForm,
  MedicineFinderItemMatch,
  MedicineFinderPharmacyOffer,
  PatientPharmacyOrderStatus,
  PharmacyBatchRecord,
  PharmacyDeliveryZone,
  PharmacyPermissionKey,
  PharmacyProductRecord,
  PharmacyProfileDocument,
  PharmacyStaffRole,
  PrescriptionFinderAvailability,
} from '../src/types/pharmacy.ts';
import type {
  WholesalerBatchRecord,
  WholesalerPermissionKey,
  WholesalerStaffRole,
  WholesalerSupplyOrderStatus,
} from '../src/types/wholesaler.ts';

export const PHARMACY_ROLE_PERMISSIONS: Record<PharmacyStaffRole, PharmacyPermissionKey[]> = {
  owner: [
    'viewOverview',
    'manageOrders',
    'reviewPrescriptions',
    'dispensePrescriptions',
    'manageCatalog',
    'manageInventory',
    'manageBatches',
    'manageBilling',
    'manageDeliveries',
    'manageReturns',
    'manageSupplyOrders',
    'manageStaff',
    'manageCommunications',
    'viewReports',
    'manageSettings',
  ],
  responsible_pharmacist: [
    'viewOverview',
    'manageOrders',
    'reviewPrescriptions',
    'dispensePrescriptions',
    'manageCatalog',
    'manageInventory',
    'manageBatches',
    'manageBilling',
    'manageDeliveries',
    'manageReturns',
    'manageSupplyOrders',
    'manageCommunications',
    'viewReports',
  ],
  pharmacist: [
    'viewOverview',
    'manageOrders',
    'reviewPrescriptions',
    'dispensePrescriptions',
    'manageCommunications',
  ],
  inventory_manager: [
    'viewOverview',
    'manageCatalog',
    'manageInventory',
    'manageBatches',
    'manageSupplyOrders',
    'manageReturns',
    'viewReports',
  ],
  delivery_staff: ['viewOverview', 'manageDeliveries'],
  accountant: ['viewOverview', 'manageBilling', 'viewReports', 'manageReturns'],
};

export const WHOLESALER_ROLE_PERMISSIONS: Record<WholesalerStaffRole, WholesalerPermissionKey[]> = {
  owner: [
    'viewOverview',
    'manageCatalog',
    'manageInventory',
    'manageBatches',
    'managePharmacies',
    'manageSupplyOrders',
    'manageShipments',
    'manageSuppliers',
    'managePurchaseOrders',
    'manageBilling',
    'manageReturns',
    'manageStaff',
    'manageCommunications',
    'viewReports',
    'manageSettings',
  ],
  warehouse_manager: [
    'viewOverview',
    'manageCatalog',
    'manageInventory',
    'manageBatches',
    'manageSupplyOrders',
    'manageShipments',
    'manageSuppliers',
    'managePurchaseOrders',
    'manageReturns',
    'viewReports',
  ],
  sales_rep: [
    'viewOverview',
    'manageCatalog',
    'managePharmacies',
    'manageSupplyOrders',
    'manageCommunications',
  ],
  dispatch_coordinator: [
    'viewOverview',
    'manageSupplyOrders',
    'manageShipments',
    'manageCommunications',
  ],
  accountant: ['viewOverview', 'managePharmacies', 'manageBilling', 'manageReturns', 'viewReports'],
};

export const PHARMACY_TERMINAL_ORDER_STATUSES = new Set<PatientPharmacyOrderStatus>([
  'Completed',
  'Cancelled',
  'Rejected',
  'Expired',
]);

export const PHARMACY_CANCELLABLE_BY_PATIENT = new Set<PatientPharmacyOrderStatus>([
  'Draft',
  'Submitted',
  'Under Pharmacist Review',
  'Accepted',
  'Partially Accepted',
]);

export const WHOLESALER_TERMINAL_ORDER_STATUSES = new Set<WholesalerSupplyOrderStatus>([
  'Completed',
  'Cancelled',
  'Rejected',
]);

export function getTodayBaghdadDateStr(now = new Date()): string {
  const baghdadMs = now.getTime() + 3 * 60 * 60 * 1000;
  return new Date(baghdadMs).toISOString().slice(0, 10);
}

export function isValidIsoDateYmd(dateStr: unknown): dateStr is string {
  return typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

export function isBatchExpired(expiryDate: string, todayStr = getTodayBaghdadDateStr()): boolean {
  if (!isValidIsoDateYmd(expiryDate)) return true;
  return expiryDate.trim() <= todayStr;
}

export function daysUntilExpiry(expiryDate: string, todayStr = getTodayBaghdadDateStr()): number {
  if (!isValidIsoDateYmd(expiryDate)) return -9999;
  const expMs = Date.parse(`${expiryDate.trim()}T00:00:00Z`);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  return Math.floor((expMs - todayMs) / 86400000);
}

export function normalizeCanonicalToken(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s.+-]/gu, '');
}

/**
 * Strict Canonical Medicine Identity key.
 * Never matches on medicine name similarity alone: requires exact activeIngredient + strength + dosageForm + packSize.
 */
export function buildCanonicalIdentityKey(params: {
  activeIngredient: string;
  strength: string;
  dosageForm: DosageForm | string;
  packSize: string;
}): string {
  return [
    normalizeCanonicalToken(params.activeIngredient),
    normalizeCanonicalToken(params.strength),
    normalizeCanonicalToken(params.dosageForm),
    normalizeCanonicalToken(params.packSize),
  ].join('::');
}

export function findExactCanonicalMedicineMatch(
  catalog: CanonicalMedicineRecord[],
  input: {
    activeIngredient: string;
    strength: string;
    dosageForm: DosageForm | string;
    packSize: string;
  },
): CanonicalMedicineRecord | null {
  const targetKey = buildCanonicalIdentityKey(input);
  if (!input.activeIngredient.trim() || !input.strength.trim() || !input.packSize.trim()) {
    return null;
  }
  return (
    catalog.find(
      (med) =>
        med.status !== 'deprecated' &&
        buildCanonicalIdentityKey({
          activeIngredient: med.activeIngredient,
          strength: med.strength,
          dosageForm: med.dosageForm,
          packSize: med.packSize,
        }) === targetKey,
    ) || null
  );
}

export interface FefoAllocationResult {
  ok: boolean;
  requestedQty: number;
  allocatedQty: number;
  shortfallQty: number;
  allocations: BatchAllocationSlice[];
}

export interface GenericBatchLike {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  availableQty: number;
  reservedQty: number;
  purchasePriceIqd?: number;
  purchaseCostIqd?: number;
}

/**
 * First-Expired, First-Out (FEFO) batch allocator.
 * Strictly ignores expired batches and batches with <= 0 net available units.
 */
export function allocateFefoBatches(
  batches: GenericBatchLike[],
  requestedQty: number,
  todayStr = getTodayBaghdadDateStr(),
): FefoAllocationResult {
  const safeReq = Math.max(0, Math.floor(Number(requestedQty) || 0));
  if (safeReq <= 0) {
    return {
      ok: false,
      requestedQty: safeReq,
      allocatedQty: 0,
      shortfallQty: safeReq,
      allocations: [],
    };
  }

  const eligible = batches
    .filter((b) => {
      if (isBatchExpired(b.expiryDate, todayStr)) return false;
      const netAvailable = Math.max(0, Number(b.availableQty || 0) - Number(b.reservedQty || 0));
      return netAvailable > 0;
    })
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

  let remaining = safeReq;
  const allocations: BatchAllocationSlice[] = [];

  for (const batch of eligible) {
    if (remaining <= 0) break;
    const netAvailable = Math.max(0, Number(batch.availableQty || 0) - Number(batch.reservedQty || 0));
    const take = Math.min(remaining, netAvailable);
    if (take > 0) {
      allocations.push({
        batchId: batch.batchId,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: take,
        purchasePriceIqd: Number(batch.purchasePriceIqd ?? batch.purchaseCostIqd ?? 0),
      });
      remaining -= take;
    }
  }

  const allocatedQty = safeReq - remaining;
  return {
    ok: remaining === 0,
    requestedQty: safeReq,
    allocatedQty,
    shortfallQty: remaining,
    allocations,
  };
}

export function summarizeProductBatchStock(
  batches: Array<PharmacyBatchRecord | WholesalerBatchRecord>,
  todayStr = getTodayBaghdadDateStr(),
): {
  availableQty: number;
  reservedQty: number;
  netAvailableQty: number;
  nearestExpiryDate: string | null;
} {
  let availableQty = 0;
  let reservedQty = 0;
  let nearestExpiryDate: string | null = null;

  for (const b of batches) {
    if (isBatchExpired(b.expiryDate, todayStr)) continue;
    const avail = Math.max(0, Number(b.availableQty || 0));
    const res = Math.max(0, Number(b.reservedQty || 0));
    availableQty += avail;
    reservedQty += res;
    if (avail - res > 0) {
      if (!nearestExpiryDate || b.expiryDate < nearestExpiryDate) {
        nearestExpiryDate = b.expiryDate;
      }
    }
  }

  return {
    availableQty,
    reservedQty,
    netAvailableQty: Math.max(0, availableQty - reservedQty),
    nearestExpiryDate,
  };
}

export function resolvePharmacyDeliveryZone(
  profile: PharmacyProfileDocument,
  governorate: string,
  district: string,
): { supported: boolean; zone: PharmacyDeliveryZone | null; feeIqd: number } {
  if (!profile.deliveryAvailable) {
    return { supported: false, zone: null, feeIqd: 0 };
  }
  const zones = Array.isArray(profile.deliveryZones)
    ? profile.deliveryZones.filter((z) => z.isActive)
    : [];
  if (zones.length === 0) {
    // Fallback if pharmacy enabled delivery without explicit zone rows: only same governorate allowed with 0 or explicit zone fee
    const sameGov =
      normalizeCanonicalToken(profile.governorate) === normalizeCanonicalToken(governorate);
    return { supported: sameGov, zone: null, feeIqd: 0 };
  }

  const normGov = normalizeCanonicalToken(governorate);
  const normDist = normalizeCanonicalToken(district);

  const exactMatch = zones.find(
    (z) =>
      normalizeCanonicalToken(z.governorate) === normGov &&
      normalizeCanonicalToken(z.district) === normDist,
  );
  if (exactMatch) {
    return { supported: true, zone: exactMatch, feeIqd: Math.max(0, Number(exactMatch.feeIqd || 0)) };
  }

  const govWideMatch = zones.find(
    (z) =>
      normalizeCanonicalToken(z.governorate) === normGov &&
      (normalizeCanonicalToken(z.district) === 'all' || !z.district.trim()),
  );
  if (govWideMatch) {
    return {
      supported: true,
      zone: govWideMatch,
      feeIqd: Math.max(0, Number(govWideMatch.feeIqd || 0)),
    };
  }

  return { supported: false, zone: null, feeIqd: 0 };
}

export interface RequestedFinderMedicineItem {
  name: string;
  dosage?: string;
  quantity: number;
  medicineId?: string;
}

function productMatchesRequestedMedicine(
  product: PharmacyProductRecord,
  reqItem: RequestedFinderMedicineItem,
): boolean {
  if (reqItem.medicineId && product.medicineId === reqItem.medicineId) {
    return true;
  }
  const reqNorm = normalizeCanonicalToken(reqItem.name);
  if (!reqNorm || reqNorm.length < 2) return false;
  const prodNames = [
    normalizeCanonicalToken(product.scientificName),
    normalizeCanonicalToken(product.brandName),
    normalizeCanonicalToken(product.activeIngredient),
  ].filter(Boolean);

  const nameMatch = prodNames.some(
    (candidate) => candidate === reqNorm || candidate.includes(reqNorm) || reqNorm.includes(candidate),
  );
  if (!nameMatch) return false;

  if (reqItem.dosage && reqItem.dosage.trim()) {
    const reqDosageNorm = normalizeCanonicalToken(reqItem.dosage);
    const prodStrengthNorm = normalizeCanonicalToken(product.strength);
    if (prodStrengthNorm && reqDosageNorm && !reqDosageNorm.includes(prodStrengthNorm) && !prodStrengthNorm.includes(reqDosageNorm)) {
      return false;
    }
  }
  return true;
}

export function evaluatePharmacyAvailabilityForFinder(params: {
  pharmacy: PharmacyProfileDocument;
  products: PharmacyProductRecord[];
  batchesByProductId: Map<string, PharmacyBatchRecord[]>;
  requestedItems: RequestedFinderMedicineItem[];
  patientGovernorate: string;
  patientDistrict: string;
  todayStr?: string;
}): MedicineFinderPharmacyOffer {
  const todayStr = params.todayStr || getTodayBaghdadDateStr();
  const matchedItems: MedicineFinderItemMatch[] = [];
  let matchedCount = 0;
  let estimatedSubtotalIqd = 0;

  for (const reqItem of params.requestedItems) {
    const reqQty = Math.max(1, Math.floor(Number(reqItem.quantity) || 1));
    const candidates = params.products.filter(
      (p) =>
        p.isActive &&
        p.availableForPatientOrders &&
        p.isPublishedToPatients !== false &&
        p.reviewStatus !== 'pending_review' &&
        productMatchesRequestedMedicine(p, reqItem),
    );

    let bestProduct: PharmacyProductRecord | null = null;
    let bestStock = { availableQty: 0, reservedQty: 0, netAvailableQty: 0, nearestExpiryDate: null as string | null };

    for (const candidate of candidates) {
      const stock = summarizeProductBatchStock(
        params.batchesByProductId.get(candidate.productId) || [],
        todayStr,
      );
      if (stock.netAvailableQty >= reqQty) {
        const currentPrice = Number(bestProduct?.discountPriceIqd ?? bestProduct?.sellingPriceIqd ?? Infinity);
        const candPrice = Number(candidate.discountPriceIqd ?? candidate.sellingPriceIqd ?? Infinity);
        if (!bestProduct || stock.netAvailableQty > bestStock.netAvailableQty || candPrice < currentPrice) {
          bestProduct = candidate;
          bestStock = stock;
        }
      } else if (!bestProduct || stock.netAvailableQty > bestStock.netAvailableQty) {
        bestProduct = candidate;
        bestStock = stock;
      }
    }

    if (bestProduct && bestStock.netAvailableQty >= reqQty) {
      const unitPrice = Number(bestProduct.discountPriceIqd ?? bestProduct.sellingPriceIqd ?? 0);
      matchedCount += 1;
      estimatedSubtotalIqd += unitPrice * reqQty;
      matchedItems.push({
        requestedName: reqItem.name,
        requestedDosage: reqItem.dosage,
        requestedQuantity: reqQty,
        matched: true,
        matchedProductId: bestProduct.productId,
        matchedMedicineId: bestProduct.medicineId,
        matchedName: `${bestProduct.brandName || bestProduct.scientificName} (${bestProduct.strength})`,
        strength: bestProduct.strength,
        dosageForm: bestProduct.dosageForm,
        packSize: bestProduct.packSize,
        unitPriceIqd: unitPrice,
        availableQty: bestStock.netAvailableQty,
        nearestExpiryDate: bestStock.nearestExpiryDate,
        requiresPrescription: bestProduct.requiresPrescription,
      });
    } else {
      matchedItems.push({
        requestedName: reqItem.name,
        requestedDosage: reqItem.dosage,
        requestedQuantity: reqQty,
        matched: false,
        ...(bestProduct
          ? {
              matchedProductId: bestProduct.productId,
              matchedMedicineId: bestProduct.medicineId,
              matchedName: `${bestProduct.brandName || bestProduct.scientificName} (${bestProduct.strength})`,
              unitPriceIqd: Number(bestProduct.discountPriceIqd ?? bestProduct.sellingPriceIqd ?? 0),
            }
          : {}),
        availableQty: bestStock.netAvailableQty,
        nearestExpiryDate: bestStock.nearestExpiryDate,
        requiresPrescription: bestProduct?.requiresPrescription ?? true,
      });
    }
  }

  let availabilityClass: PrescriptionFinderAvailability = 'Not Available';
  if (params.requestedItems.length > 0) {
    if (matchedCount === params.requestedItems.length) {
      availabilityClass = 'Complete Prescription Available';
    } else if (matchedCount > 0) {
      availabilityClass = 'Partial Availability';
    }
  }

  const deliveryResolution = resolvePharmacyDeliveryZone(
    params.pharmacy,
    params.patientGovernorate,
    params.patientDistrict,
  );

  return {
    pharmacyUid: params.pharmacy.uid,
    institutionId: params.pharmacy.institutionId,
    pharmacyNameAr: params.pharmacy.pharmacyNameAr,
    pharmacyNameEn: params.pharmacy.pharmacyNameEn,
    governorate: params.pharmacy.governorate,
    district: params.pharmacy.district,
    address: params.pharmacy.address,
    workingDaysAndHours: params.pharmacy.workingDaysAndHours,
    is24Hours: Boolean(params.pharmacy.is24Hours),
    pickupAvailable: params.pharmacy.pickupAvailable !== false,
    deliveryAvailable: Boolean(params.pharmacy.deliveryAvailable),
    deliverySupportedForDistrict: deliveryResolution.supported,
    deliveryFeeIqd: deliveryResolution.feeIqd,
    minimumOrderIqd: Number(params.pharmacy.minimumOrderIqd || 0),
    acceptedPaymentMethods:
      Array.isArray(params.pharmacy.acceptedPaymentMethods) &&
      params.pharmacy.acceptedPaymentMethods.length > 0
        ? params.pharmacy.acceptedPaymentMethods
        : ['cash_on_pickup', 'cash_on_delivery'],
    availabilityClass,
    matchedCount,
    totalRequestedCount: params.requestedItems.length,
    estimatedSubtotalIqd,
    estimatedTotalWithDeliveryIqd: estimatedSubtotalIqd + (deliveryResolution.supported ? deliveryResolution.feeIqd : 0),
    items: matchedItems,
  };
}

export interface ParsedCsvProductRow {
  rowNumber: number;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
  barcode: string;
  sellingPriceIqd: number;
  batchNumber?: string;
  expiryDate?: string;
  initialQty?: number;
  purchasePriceIqd?: number;
}

const VALID_DOSAGE_FORMS = new Set<DosageForm>([
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'drops',
  'inhaler',
  'suppository',
  'powder',
  'other',
]);

export function parseStructuredMedicineCsv(csvText: string): {
  validRows: ParsedCsvProductRow[];
  errors: Array<{ rowNumber: number; error: string }>;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { validRows: [], errors: [{ rowNumber: 0, error: 'EMPTY_CSV' }] };
  }

  const headerParts = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idxOf = (names: string[]) => headerParts.findIndex((h) => names.includes(h));

  const sciIdx = idxOf(['scientificname', 'scientific_name', 'scientific']);
  const actIdx = idxOf(['activeingredient', 'active_ingredient', 'ingredient']);
  const brandIdx = idxOf(['brandname', 'brand_name', 'brand']);
  const strIdx = idxOf(['strength', 'dose']);
  const formIdx = idxOf(['dosageform', 'dosage_form', 'form']);
  const packIdx = idxOf(['packsize', 'pack_size', 'pack']);
  const barIdx = idxOf(['barcode', 'ean']);
  const priceIdx = idxOf(['sellingpriceiqd', 'selling_price', 'price']);
  const batchIdx = idxOf(['batchnumber', 'batch_number', 'batch']);
  const expIdx = idxOf(['expirydate', 'expiry_date', 'expiry']);
  const qtyIdx = idxOf(['qty', 'quantity', 'availableqty']);
  const costIdx = idxOf(['purchasepriceiqd', 'purchase_price', 'cost']);

  if (sciIdx === -1 || actIdx === -1 || strIdx === -1 || packIdx === -1 || priceIdx === -1) {
    return {
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          error:
            'MISSING_REQUIRED_COLUMNS: scientificName, activeIngredient, strength, packSize, sellingPriceIqd',
        },
      ],
    };
  }

  const validRows: ParsedCsvProductRow[] = [];
  const errors: Array<{ rowNumber: number; error: string }> = [];

  for (let i = 1; i < Math.min(lines.length, 502); i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const scientificName = cols[sciIdx] || '';
    const activeIngredient = cols[actIdx] || '';
    const brandName = (brandIdx >= 0 ? cols[brandIdx] : '') || scientificName;
    const strength = cols[strIdx] || '';
    const rawForm = ((formIdx >= 0 ? cols[formIdx] : '') || 'tablet').toLowerCase() as DosageForm;
    const dosageForm: DosageForm = VALID_DOSAGE_FORMS.has(rawForm) ? rawForm : 'other';
    const packSize = cols[packIdx] || '';
    const barcode = barIdx >= 0 ? cols[barIdx] || '' : '';
    const sellingPriceIqd = Number(cols[priceIdx] || 0);

    if (!scientificName || !activeIngredient || !strength || !packSize) {
      errors.push({ rowNumber: i + 1, error: 'MISSING_MEDICINE_IDENTITY_FIELDS' });
      continue;
    }
    if (!Number.isFinite(sellingPriceIqd) || sellingPriceIqd <= 0) {
      errors.push({ rowNumber: i + 1, error: 'INVALID_SELLING_PRICE' });
      continue;
    }

    const batchNumber = batchIdx >= 0 ? cols[batchIdx] || '' : '';
    const expiryDate = expIdx >= 0 ? cols[expIdx] || '' : '';
    const initialQty = qtyIdx >= 0 ? Number(cols[qtyIdx] || 0) : 0;
    const purchasePriceIqd = costIdx >= 0 ? Number(cols[costIdx] || 0) : 0;

    if (batchNumber && (!isValidIsoDateYmd(expiryDate) || isBatchExpired(expiryDate))) {
      errors.push({ rowNumber: i + 1, error: 'INVALID_OR_EXPIRED_BATCH_DATE' });
      continue;
    }

    validRows.push({
      rowNumber: i + 1,
      scientificName,
      activeIngredient,
      brandName,
      strength,
      dosageForm,
      packSize,
      barcode,
      sellingPriceIqd,
      ...(batchNumber ? { batchNumber, expiryDate, initialQty: Math.max(0, Math.floor(initialQty)), purchasePriceIqd: Math.max(0, purchasePriceIqd) } : {}),
    });
  }

  return { validRows, errors };
}

export function generatePickupVerificationCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `PK-${num}`;
}
