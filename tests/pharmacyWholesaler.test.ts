import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateFefoBatches,
  buildCanonicalIdentityKey,
  evaluatePharmacyAvailabilityForFinder,
  findExactCanonicalMedicineMatch,
  generatePickupVerificationCode,
  parseStructuredMedicineCsv,
  PHARMACY_ROLE_PERMISSIONS,
  resolvePharmacyDeliveryZone,
  WHOLESALER_ROLE_PERMISSIONS,
} from '../server/pharmacyWholesalerEngine.ts';
import type {
  CanonicalMedicineRecord,
  PharmacyBatchRecord,
  PharmacyProductRecord,
  PharmacyProfileDocument,
  PharmacySectionId,
  PharmacySpecialOfferRecord,
  PublicPharmacyStorefrontProduct,
} from '../src/types/pharmacy.ts';
import { pharmacyTranslations } from '../src/i18n/pharmacyTranslations.ts';

function makePharmacyProfile(overrides: Partial<PharmacyProfileDocument> = {}): PharmacyProfileDocument {
  return {
    uid: 'pharm-1',
    institutionId: 'inst-pharm-1',
    pharmacyNameAr: 'صيدلية الشفاء',
    pharmacyNameEn: 'Al Shifa Pharmacy',
    ownerFullName: 'Dr. Ali Hassan',
    responsiblePharmacistName: 'Dr. Ali Hassan',
    pharmacistSyndicateNumber: 'SYN-1001',
    pharmacyLicenseNumber: 'PH-9001',
    licensingAuthority: 'Iraqi Pharmacists Syndicate',
    licenseExpiryDate: '2028-12-31',
    professionalPhone: '07701234567',
    email: 'shifa@medora.test',
    governorate: 'Baghdad',
    district: 'Karrada',
    address: 'Al-Karrada St',
    mapLocationUrl: '',
    workingDaysAndHours: '09:00-23:00',
    is24Hours: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    deliveryZones: [
      { zoneId: 'z1', governorate: 'Baghdad', district: 'Karrada', feeIqd: 3000, isActive: true },
      { zoneId: 'z2', governorate: 'Baghdad', district: 'Mansour', feeIqd: 5000, isActive: true },
    ],
    acceptedPaymentMethods: ['cash_on_pickup', 'cash_on_delivery'],
    minimumOrderIqd: 5000,
    licenseDocuments: [],
    status: 'Approved',
    ...overrides,
  };
}

function makeProduct(overrides: Partial<PharmacyProductRecord> = {}): PharmacyProductRecord {
  return {
    productId: 'prod-1',
    pharmacyUid: 'pharm-1',
    institutionId: 'inst-pharm-1',
    medicineId: 'med-amox-500',
    scientificName: 'Amoxicillin',
    activeIngredient: 'Amoxicillin Trihydrate',
    brandName: 'Amoxil',
    strength: '500mg',
    dosageForm: 'capsule',
    packSize: '20 capsules',
    barcode: '6281000001',
    sku: 'AMX-500-20',
    requiresPrescription: true,
    controlledDrug: false,
    therapeuticCategory: 'Antibiotic',
    sellingPriceIqd: 8500,
    minStockThreshold: 5,
    expiryAlertDays: 60,
    allowPartialPack: false,
    availableForPatientOrders: true,
    isActive: true,
    ...overrides,
  };
}

function makeBatch(overrides: Partial<PharmacyBatchRecord> = {}): PharmacyBatchRecord {
  return {
    batchId: 'batch-1',
    pharmacyUid: 'pharm-1',
    institutionId: 'inst-pharm-1',
    productId: 'prod-1',
    medicineId: 'med-amox-500',
    productName: 'Amoxil 500mg',
    batchNumber: 'B-001',
    expiryDate: '2027-06-01',
    availableQty: 10,
    reservedQty: 0,
    purchasePriceIqd: 6000,
    sourceType: 'manual',
    isExpired: false,
    ...overrides,
  };
}

describe('MEDORA Pharmacy & Wholesaler Engine', () => {
  it('allocates batches strictly in FEFO order and skips expired or exhausted stock', () => {
    const today = '2026-11-18';
    const result = allocateFefoBatches(
      [
        { batchId: 'b-expired', batchNumber: 'EXP-1', expiryDate: '2026-11-18', availableQty: 50, reservedQty: 0, purchasePriceIqd: 4000 },
        { batchId: 'b-later', batchNumber: 'LAT-1', expiryDate: '2028-01-15', availableQty: 10, reservedQty: 0, purchasePriceIqd: 4500 },
        { batchId: 'b-soon', batchNumber: 'SOO-1', expiryDate: '2027-02-01', availableQty: 8, reservedQty: 3, purchasePriceIqd: 4200 },
      ],
      7,
      today,
    );

    assert.equal(result.ok, true);
    assert.equal(result.allocatedQty, 7);
    assert.equal(result.shortfallQty, 0);
    assert.deepEqual(
      result.allocations.map((a) => ({ batchId: a.batchId, quantity: a.quantity })),
      [
        { batchId: 'b-soon', quantity: 5 },
        { batchId: 'b-later', quantity: 2 },
      ],
    );
  });

  it('rejects FEFO allocation when total unexpired net stock is insufficient', () => {
    const result = allocateFefoBatches(
      [
        { batchId: 'b-expired', batchNumber: 'EXP-1', expiryDate: '2026-10-01', availableQty: 20, reservedQty: 0 },
        { batchId: 'b-valid', batchNumber: 'VAL-1', expiryDate: '2027-05-01', availableQty: 6, reservedQty: 2 },
      ],
      6,
      '2026-11-18',
    );

    assert.equal(result.ok, false);
    assert.equal(result.allocatedQty, 4);
    assert.equal(result.shortfallQty, 2);
  });

  it('matches canonical medicines strictly by activeIngredient + strength + dosageForm + packSize', () => {
    const catalog: CanonicalMedicineRecord[] = [
      {
        medicineId: 'med-1',
        scientificName: 'Paracetamol',
        activeIngredient: 'Paracetamol',
        brandNames: ['Panadol'],
        strength: '500mg',
        dosageForm: 'tablet',
        packSize: '20 tablets',
        requiresPrescription: false,
        controlledDrug: false,
        therapeuticCategory: 'Analgesic',
        status: 'active',
      },
      {
        medicineId: 'med-2',
        scientificName: 'Paracetamol Deprecated',
        activeIngredient: 'Paracetamol',
        brandNames: ['OldDol'],
        strength: '1000mg',
        dosageForm: 'tablet',
        packSize: '20 tablets',
        requiresPrescription: false,
        controlledDrug: false,
        therapeuticCategory: 'Analgesic',
        status: 'deprecated',
      },
    ];

    const exact = findExactCanonicalMedicineMatch(catalog, {
      activeIngredient: '  paracetamol  ',
      strength: '500MG',
      dosageForm: 'tablet',
      packSize: '20 Tablets',
    });
    assert.equal(exact?.medicineId, 'med-1');

    // Different strength must not merge
    const diffStrength = findExactCanonicalMedicineMatch(catalog, {
      activeIngredient: 'Paracetamol',
      strength: '250mg',
      dosageForm: 'tablet',
      packSize: '20 tablets',
    });
    assert.equal(diffStrength, null);

    // Different dosage form must not merge
    const diffForm = findExactCanonicalMedicineMatch(catalog, {
      activeIngredient: 'Paracetamol',
      strength: '500mg',
      dosageForm: 'syrup',
      packSize: '20 tablets',
    });
    assert.equal(diffForm, null);

    // Different pack size must not merge
    const diffPack = findExactCanonicalMedicineMatch(catalog, {
      activeIngredient: 'Paracetamol',
      strength: '500mg',
      dosageForm: 'tablet',
      packSize: '10 tablets',
    });
    assert.equal(diffPack, null);

    // Deprecated canonical entries must not match
    const deprecated = findExactCanonicalMedicineMatch(catalog, {
      activeIngredient: 'Paracetamol',
      strength: '1000mg',
      dosageForm: 'tablet',
      packSize: '20 tablets',
    });
    assert.equal(deprecated, null);

    assert.notEqual(
      buildCanonicalIdentityKey({
        activeIngredient: 'Paracetamol',
        strength: '500mg',
        dosageForm: 'tablet',
        packSize: '20 tablets',
      }),
      buildCanonicalIdentityKey({
        activeIngredient: 'Paracetamol',
        strength: '500mg',
        dosageForm: 'tablet',
        packSize: '24 tablets',
      }),
    );
  });

  it('classifies patient Medicine Finder availability and ignores expired or disabled stock', () => {
    const pharmacy = makePharmacyProfile();
    const amox = makeProduct({ productId: 'p1', sellingPriceIqd: 8500 });
    const paracetamol = makeProduct({
      productId: 'p2',
      medicineId: 'med-para',
      scientificName: 'Paracetamol',
      activeIngredient: 'Paracetamol',
      brandName: 'Panadol',
      strength: '500mg',
      dosageForm: 'tablet',
      packSize: '24 tablets',
      sellingPriceIqd: 4000,
    });
    const inactiveIbu = makeProduct({
      productId: 'p3',
      medicineId: 'med-ibu',
      scientificName: 'Ibuprofen',
      activeIngredient: 'Ibuprofen',
      brandName: 'Brufen',
      strength: '400mg',
      isActive: false,
      availableForPatientOrders: false,
    });

    const batchesMap = new Map<string, PharmacyBatchRecord[]>([
      ['p1', [makeBatch({ productId: 'p1', expiryDate: '2027-08-01', availableQty: 5, reservedQty: 1 })]],
      ['p2', [makeBatch({ productId: 'p2', batchId: 'b2', expiryDate: '2026-10-01', availableQty: 100, reservedQty: 0 })]], // expired
      ['p3', [makeBatch({ productId: 'p3', batchId: 'b3', expiryDate: '2028-01-01', availableQty: 20, reservedQty: 0 })]], // inactive product
    ]);

    const fullOffer = evaluatePharmacyAvailabilityForFinder({
      pharmacy,
      products: [amox, paracetamol, inactiveIbu],
      batchesByProductId: batchesMap,
      requestedItems: [{ name: 'Amoxicillin', dosage: '500mg', quantity: 2 }],
      patientGovernorate: 'Baghdad',
      patientDistrict: 'Karrada',
      todayStr: '2026-11-18',
    });
    assert.equal(fullOffer.availabilityClass, 'Complete Prescription Available');
    assert.equal(fullOffer.estimatedSubtotalIqd, 17000);
    assert.equal(fullOffer.deliveryFeeIqd, 3000);

    const partialOffer = evaluatePharmacyAvailabilityForFinder({
      pharmacy,
      products: [amox, paracetamol, inactiveIbu],
      batchesByProductId: batchesMap,
      requestedItems: [
        { name: 'Amoxicillin', dosage: '500mg', quantity: 2 },
        { name: 'Paracetamol', dosage: '500mg', quantity: 1 },
      ],
      patientGovernorate: 'Baghdad',
      patientDistrict: 'Karrada',
      todayStr: '2026-11-18',
    });
    assert.equal(partialOffer.availabilityClass, 'Partial Availability');
    assert.equal(partialOffer.matchedCount, 1);

    const unavailableOffer = evaluatePharmacyAvailabilityForFinder({
      pharmacy,
      products: [amox, paracetamol, inactiveIbu],
      batchesByProductId: batchesMap,
      requestedItems: [{ name: 'Ibuprofen', dosage: '400mg', quantity: 1 }],
      patientGovernorate: 'Baghdad',
      patientDistrict: 'Karrada',
      todayStr: '2026-11-18',
    });
    assert.equal(unavailableOffer.availabilityClass, 'Not Available');
  });

  it('resolves pharmacy delivery zone fees accurately and rejects unsupported districts', () => {
    const pharmacy = makePharmacyProfile();
    const karrada = resolvePharmacyDeliveryZone(pharmacy, 'baghdad', 'karrada');
    assert.equal(karrada.supported, true);
    assert.equal(karrada.feeIqd, 3000);

    const unsupported = resolvePharmacyDeliveryZone(pharmacy, 'Basra', 'Ashar');
    assert.equal(unsupported.supported, false);

    const noDelivery = resolvePharmacyDeliveryZone(
      makePharmacyProfile({ deliveryAvailable: false }),
      'Baghdad',
      'Karrada',
    );
    assert.equal(noDelivery.supported, false);
  });

  it('enforces Pharmacy & Wholesaler staff RBAC permissions', () => {
    assert.equal(PHARMACY_ROLE_PERMISSIONS.owner.includes('reviewPrescriptions'), true);
    assert.equal(PHARMACY_ROLE_PERMISSIONS.responsible_pharmacist.includes('dispensePrescriptions'), true);
    assert.equal(PHARMACY_ROLE_PERMISSIONS.accountant.includes('reviewPrescriptions'), false);
    assert.equal('sales_staff' in PHARMACY_ROLE_PERMISSIONS, false);
    assert.equal(PHARMACY_ROLE_PERMISSIONS.delivery_staff.includes('dispensePrescriptions'), false);

    assert.equal(WHOLESALER_ROLE_PERMISSIONS.owner.includes('manageStaff'), true);
    assert.equal(WHOLESALER_ROLE_PERMISSIONS.warehouse_manager.includes('manageBatches'), true);
    assert.equal(WHOLESALER_ROLE_PERMISSIONS.sales_rep.includes('manageBatches'), false);
    assert.equal(WHOLESALER_ROLE_PERMISSIONS.accountant.includes('manageBilling'), true);
    assert.equal(WHOLESALER_ROLE_PERMISSIONS.dispatch_coordinator.includes('manageShipments'), true);
  });

  it('parses structured medicine CSV rows and generates PK-XXXXXX pickup verification codes', () => {
    const csv = [
      'scientificName,activeIngredient,brandName,strength,dosageForm,packSize,barcode,sellingPriceIqd,batchNumber,expiryDate,qty,purchasePriceIqd',
      'Azithromycin,Azithromycin,Zithromax,500mg,tablet,3 tablets,628999,11000,AZ-01,2028-04-01,25,8000',
      'Expired Drug,Expired,Old,10mg,tablet,10 tabs,111,5000,EX-01,2020-01-01,10,2000',
    ].join('\n');

    const parsed = parseStructuredMedicineCsv(csv);
    assert.equal(parsed.validRows.length, 1);
    assert.equal(parsed.validRows[0].scientificName, 'Azithromycin');
    assert.equal(parsed.validRows[0].initialQty, 25);
    assert.equal(parsed.errors.length, 1);
    assert.equal(parsed.errors[0].error, 'INVALID_OR_EXPIRED_BATCH_DATE');

    const code = generatePickupVerificationCode();
    assert.match(code, /^PK-\d{6}$/);
  });

  it('defines exact 12-section Pharmacy navigation labels in AR and EN without POS/Cashier roles', () => {
    const expectedSections: PharmacySectionId[] = [
      'overview',
      'profile',
      'storefront',
      'products',
      'bulk_import',
      'orders',
      'prescriptions',
      'wholesaler',
      'supply_orders',
      'marketing',
      'reports',
      'settings',
    ];
    assert.deepEqual(Object.keys(pharmacyTranslations.ar.nav).sort(), [...expectedSections].sort());
    assert.deepEqual(Object.keys(pharmacyTranslations.en.nav).sort(), [...expectedSections].sort());
    for (const key of expectedSections) {
      assert.equal(Boolean(pharmacyTranslations.ar.nav[key]?.trim()), true);
      assert.equal(Boolean(pharmacyTranslations.en.nav[key]?.trim()), true);
    }
    assert.equal('pos' in PHARMACY_ROLE_PERMISSIONS, false);
    assert.equal('cashier' in PHARMACY_ROLE_PERMISSIONS, false);
  });

  it('enforces promotional banner approval gating and excludes wholesale/purchase costs from retail storefront projections', () => {
    const draftPromoPharmacy = makePharmacyProfile({
      promotionalBannerTitleAr: 'عرض غير معتمد',
      marketingApprovalStatus: 'pending_review',
      featuredStatus: 'requested',
    });
    const approvedPromoPharmacy = makePharmacyProfile({
      promotionalBannerTitleAr: 'خصم معتمد',
      marketingApprovalStatus: 'approved',
      featuredStatus: 'approved',
    });

    const isBannerLive = (p: PharmacyProfileDocument) =>
      p.status === 'Approved' &&
      p.marketingApprovalStatus === 'approved' &&
      Boolean(p.promotionalBannerTitleAr || p.promotionalBannerTitleEn || p.promotionalBannerImageUrl);

    assert.equal(isBannerLive(draftPromoPharmacy), false);
    assert.equal(isBannerLive(approvedPromoPharmacy), true);

    const offers: PharmacySpecialOfferRecord[] = [
      {
        offerId: 'o1',
        pharmacyUid: 'pharm-1',
        titleAr: 'عرض قيد المراجعة',
        titleEn: 'Pending',
        description: '',
        approvalStatus: 'pending_review',
        isActive: true,
      },
      {
        offerId: 'o2',
        pharmacyUid: 'pharm-1',
        titleAr: 'عرض معتمد',
        titleEn: 'Approved',
        description: '',
        approvalStatus: 'approved',
        isActive: true,
        validUntil: '2029-12-31',
      },
    ];
    const liveOffers = offers.filter((o) => o.approvalStatus === 'approved' && o.isActive);
    assert.equal(liveOffers.length, 1);
    assert.equal(liveOffers[0].offerId, 'o2');

    const storefrontItem: PublicPharmacyStorefrontProduct = {
      productId: 'prod-1',
      medicineId: 'med-1',
      scientificName: 'Paracetamol',
      activeIngredient: 'Paracetamol',
      brandName: 'Panadol',
      strength: '500mg',
      dosageForm: 'tablet',
      packSize: '20 tablets',
      therapeuticCategory: 'Analgesic',
      requiresPrescription: false,
      controlledDrug: false,
      sellingPriceIqd: 4000,
      discountPriceIqd: 3500,
      effectivePriceIqd: 3500,
      availableQty: 12,
      availabilityStatus: 'in_stock',
      nearestExpiryDate: '2028-01-01',
    };
    assert.equal('purchasePriceIqd' in storefrontItem, false);
    assert.equal('wholesalePriceIqd' in storefrontItem, false);
  });
});
