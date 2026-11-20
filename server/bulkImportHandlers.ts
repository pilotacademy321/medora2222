import type { Request, Response } from 'express';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  buildBulkImportTemplateWorkbook,
  normalizeCanonicalIdentityParts,
  parseUploadedDrugFile,
  validateAndNormalizeImportRows,
  type ExistingFacilityProductSummary,
} from './bulkDrugImportEngine.ts';
import {
  buildCanonicalIdentityKey,
  getTodayBaghdadDateStr,
} from './pharmacyWholesalerEngine.ts';
import {
  decodeAndValidateBase64BulkImportFile,
  MAX_FIRESTORE_MEDIA_ASSET_BYTES,
  storeUploadedMediaAsset,
  type ResolvedBucketInfo,
} from './storageHelper.ts';
import type {
  BulkImportColumnMapping,
  BulkImportJobRecord,
  BulkImportMode,
  BulkImportNormalizedRow,
  BulkImportPortalType,
  CanonicalMedicineRecord,
  DosageForm,
} from '../src/types/pharmacy.ts';

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

function safeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function serializeValue(val: unknown): unknown {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (Array.isArray(val)) return val.map(serializeValue);
  if (val && typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    if (typeof rec.toDate === 'function') {
      try {
        return (rec.toDate as () => Date)().toISOString();
      } catch {
        return null;
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) out[k] = serializeValue(v);
    return out;
  }
  return val;
}

function serializeDoc(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  return serializeValue(data) as Record<string, unknown>;
}

const VALID_MODES = new Set<BulkImportMode>([
  'full_catalog_and_batches',
  'price_update_only',
  'quantity_batch_update_only',
]);

async function loadCanonicalAndFacilityContext(
  db: Firestore,
  portalType: BulkImportPortalType,
  ownerUid: string,
): Promise<{
  canonicalCatalog: CanonicalMedicineRecord[];
  existingProducts: ExistingFacilityProductSummary[];
}> {
  const productCollection =
    portalType === 'pharmacy' ? 'pharmacy_products' : 'wholesaler_products';
  const ownerField = portalType === 'pharmacy' ? 'pharmacyUid' : 'wholesalerUid';

  const [medsSnap, prodSnap] = await Promise.all([
    db.collection('medora_medicines').limit(2000).get(),
    db.collection(productCollection).where(ownerField, '==', ownerUid).limit(2000).get(),
  ]);

  const canonicalCatalog = medsSnap.docs.map(
    (d) => serializeDoc(d.data()) as unknown as CanonicalMedicineRecord,
  );
  const existingProducts: ExistingFacilityProductSummary[] = prodSnap.docs.map((d) => {
    const p = serializeDoc(d.data());
    return {
      productId: String(p.productId || d.id),
      medicineId: String(p.medicineId || ''),
      barcode: String(p.barcode || ''),
      scientificName: String(p.scientificName || ''),
      activeIngredient: String(p.activeIngredient || p.scientificName || ''),
      brandName: String(p.brandName || ''),
      strength: String(p.strength || ''),
      dosageForm: (String(p.dosageForm || 'tablet') as DosageForm),
      packSize: String(p.packSize || ''),
    };
  });

  return { canonicalCatalog, existingProducts };
}

export function sendBulkImportTemplate(portalType: BulkImportPortalType, res: Response): void {
  const buf = buildBulkImportTemplateWorkbook(portalType);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="medora_${portalType}_bulk_import_template.xlsx"`,
  );
  res.send(buf);
}

export async function processBulkImportParse(params: {
  db: Firestore;
  portalType: BulkImportPortalType;
  ownerUid: string;
  institutionId: string;
  actorUid: string;
  actorName: string;
  req: Request;
  res: Response;
  resolveReadyStorageBucket?: () => Promise<ResolvedBucketInfo>;
  hasServiceCredentials?: () => boolean;
}): Promise<void> {
  const { db, portalType, ownerUid, institutionId, actorUid, actorName, req, res } = params;

  const decoded = decodeAndValidateBase64BulkImportFile({
    dataBase64: req.body?.dataBase64,
    mimeType: req.body?.mimeType,
    fileName: req.body?.fileName,
  });

  if (!decoded.ok) {
    res.status(400).json({ error: decoded.error });
    return;
  }

  const modeRaw = normalizeStr(req.body?.mode, 40) as BulkImportMode;
  const mode: BulkImportMode = VALID_MODES.has(modeRaw)
    ? modeRaw
    : 'full_catalog_and_batches';
  const selectedSheet = normalizeStr(req.body?.selectedSheet, 120) || undefined;

  try {
    const parsed = await parseUploadedDrugFile({
      portalType,
      fileName: decoded.safeName,
      mimeType: decoded.mimeType,
      buffer: decoded.buffer,
      selectedSheet,
    });

    const overrideMapping =
      req.body?.columnMapping && typeof req.body.columnMapping === 'object'
        ? (req.body.columnMapping as BulkImportColumnMapping)
        : undefined;
    const activeMapping: BulkImportColumnMapping =
      overrideMapping && Object.keys(overrideMapping).length > 0
        ? overrideMapping
        : parsed.suggestedMapping;

    const { canonicalCatalog, existingProducts } = await loadCanonicalAndFacilityContext(
      db,
      portalType,
      ownerUid,
    );

    const todayStr = getTodayBaghdadDateStr();
    const validation = validateAndNormalizeImportRows({
      portalType,
      rawRows: parsed.rawRows,
      mapping: activeMapping,
      mode,
      todayStr,
      canonicalCatalog,
      existingProducts,
    });

    // Preserve private raw uploaded file cleanly when bucket is active or file fits Firestore asset limit
    let storagePath: string | null = null;
    let storageUrl: string | null = null;
    try {
      const bucketInfo = params.resolveReadyStorageBucket
        ? await params.resolveReadyStorageBucket().catch(() => null)
        : null;
      const hasBucket =
        Boolean(bucketInfo?.bucket && bucketInfo.bucketExists && params.hasServiceCredentials?.());
      if (hasBucket || decoded.buffer.length <= MAX_FIRESTORE_MEDIA_ASSET_BYTES) {
        const stored = await storeUploadedMediaAsset({
          adminDb: db,
          bucketInfo,
          hasServiceCredentials: params.hasServiceCredentials ? params.hasServiceCredentials() : false,
          ownerUid,
          folder: portalType === 'pharmacy' ? 'pharmacy_imports' : 'wholesaler_imports',
          buffer: decoded.buffer,
          mimeType: decoded.mimeType,
          safeName: decoded.safeName,
        });
        storagePath = stored.storagePath;
        storageUrl = stored.url;
      }
    } catch {
      // Non-fatal fallback: keep bulk import job tracking even if raw archive bucket is unavailable in local dev
    }

    const jobId = safeId(portalType === 'pharmacy' ? 'phimp' : 'whimp');
    const jobDoc: Record<string, unknown> = {
      jobId,
      portalType,
      ownerUid,
      institutionId,
      uploadedByUid: actorUid,
      uploadedByName: actorName,
      fileName: decoded.safeName,
      sourceType: parsed.sourceType,
      isPdfDraft: parsed.isPdfDraft,
      pdfDraftConfirmed: false,
      mode,
      status: 'preview_ready',
      sheetNames: parsed.sheetNames,
      selectedSheet: parsed.selectedSheet,
      headers: parsed.headers,
      columnMapping: activeMapping,
      storagePath,
      storageUrl,
      summary: {
        ...validation.summary,
        importedProductsCount: 0,
        updatedProductsCount: 0,
        importedBatchesCount: 0,
        skippedRowsCount: 0,
        failedRowsCount: 0,
      },
      committedRowIndices: [],
      createdProductIds: [],
      failedRows: [],
      publishStatus: portalType === 'pharmacy' ? 'pending_review' : 'not_applicable',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.doc(`bulk_import_jobs/${jobId}`).set(jobDoc);
    const saved = await db.doc(`bulk_import_jobs/${jobId}`).get();

    res.status(201).json({
      ok: true,
      job: serializeDoc(saved.data()) as unknown as BulkImportJobRecord,
      sheetNames: parsed.sheetNames,
      selectedSheet: parsed.selectedSheet,
      headers: parsed.headers,
      columnMapping: activeMapping,
      isPdfDraft: parsed.isPdfDraft,
      rows: validation.rows,
      summary: validation.summary,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'BULK_IMPORT_PARSE_FAILED';
    res.status(400).json({ error: code });
  }
}

export async function processBulkImportRevalidate(params: {
  db: Firestore;
  portalType: BulkImportPortalType;
  ownerUid: string;
  req: Request;
  res: Response;
}): Promise<void> {
  const { db, portalType, ownerUid, req, res } = params;
  const modeRaw = normalizeStr(req.body?.mode, 40) as BulkImportMode;
  const mode: BulkImportMode = VALID_MODES.has(modeRaw)
    ? modeRaw
    : 'full_catalog_and_batches';
  const mapping =
    req.body?.columnMapping && typeof req.body.columnMapping === 'object'
      ? (req.body.columnMapping as BulkImportColumnMapping)
      : {};
  const rawRows = Array.isArray(req.body?.rawRows)
    ? (req.body.rawRows as Array<Record<string, unknown>>).slice(0, 2500)
    : [];
  const jobId = normalizeStr(req.body?.jobId, 128);

  try {
    const { canonicalCatalog, existingProducts } = await loadCanonicalAndFacilityContext(
      db,
      portalType,
      ownerUid,
    );
    const validation = validateAndNormalizeImportRows({
      portalType,
      rawRows,
      mapping,
      mode,
      todayStr: getTodayBaghdadDateStr(),
      canonicalCatalog,
      existingProducts,
    });

    if (jobId) {
      const jobRef = db.doc(`bulk_import_jobs/${jobId}`);
      const jobSnap = await jobRef.get();
      if (jobSnap.exists && jobSnap.data()?.ownerUid === ownerUid) {
        await jobRef.update({
          mode,
          columnMapping: mapping,
          'summary.totalRows': validation.summary.totalRows,
          'summary.validRows': validation.summary.validRows,
          'summary.warningRows': validation.summary.warningRows,
          'summary.errorRows': validation.summary.errorRows,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    res.json({
      ok: true,
      rows: validation.rows,
      summary: validation.summary,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : 'REVALIDATE_FAILED';
    res.status(400).json({ error: code });
  }
}

export async function processBulkImportCommit(params: {
  db: Firestore;
  portalType: BulkImportPortalType;
  ownerUid: string;
  institutionId: string;
  actorUid: string;
  actorName: string;
  req: Request;
  res: Response;
  onAudit?: (details: string, jobId: string) => Promise<void>;
}): Promise<void> {
  const { db, portalType, ownerUid, institutionId, actorUid, actorName, req, res } = params;
  const jobId = normalizeStr(req.body?.jobId, 128);
  const modeRaw = normalizeStr(req.body?.mode, 40) as BulkImportMode;
  const mode: BulkImportMode = VALID_MODES.has(modeRaw)
    ? modeRaw
    : 'full_catalog_and_batches';
  const pdfDraftConfirmed = req.body?.pdfDraftConfirmed === true;
  const submittedRows = Array.isArray(req.body?.rows)
    ? (req.body.rows as Array<Record<string, unknown>>).slice(0, 500)
    : [];

  if (!jobId || submittedRows.length === 0) {
    res.status(400).json({ error: 'IMPORT_JOB_AND_ROWS_REQUIRED' });
    return;
  }

  try {
    const jobRef = db.doc(`bulk_import_jobs/${jobId}`);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      res.status(404).json({ error: 'IMPORT_JOB_NOT_FOUND' });
      return;
    }
    const existingJob = serializeDoc(jobSnap.data()) as unknown as BulkImportJobRecord;
    if (existingJob.ownerUid !== ownerUid || existingJob.portalType !== portalType) {
      res.status(403).json({ error: 'IMPORT_JOB_FORBIDDEN' });
      return;
    }
    if (existingJob.isPdfDraft && !pdfDraftConfirmed) {
      res.status(400).json({ error: 'PDF_DRAFT_CONFIRMATION_REQUIRED' });
      return;
    }

    const { canonicalCatalog, existingProducts } = await loadCanonicalAndFacilityContext(
      db,
      portalType,
      ownerUid,
    );

    const todayStr = getTodayBaghdadDateStr();

    // Re-build flat canonical-keyed objects for authoritative server-side revalidation
    const serverInputRows = submittedRows.map((row) => ({
      barcode: String(row.barcode ?? ''),
      generic_name: String(row.genericName ?? row.generic_name ?? ''),
      brand_name: String(row.brandName ?? row.brand_name ?? ''),
      active_ingredient: String(row.activeIngredient ?? row.active_ingredient ?? ''),
      strength: String(row.strength ?? ''),
      dosage_form: String(row.dosageForm ?? row.dosage_form ?? ''),
      package_size: String(row.packageSize ?? row.package_size ?? ''),
      manufacturer: String(row.manufacturer ?? ''),
      country: String(row.country ?? ''),
      requires_prescription: String(row.requiresPrescription ?? row.requires_prescription ?? 'false'),
      category: String(row.category ?? 'General'),
      image_reference: String(row.imageReference ?? row.image_reference ?? ''),
      retail_price: row.retailPrice ?? row.retail_price ?? '',
      wholesale_price: row.wholesalePrice ?? row.wholesale_price ?? '',
      available_quantity: row.availableQuantity ?? row.available_quantity ?? '',
      reorder_level: row.reorderLevel ?? row.reorder_level ?? '',
      minimum_order_quantity: row.minimumOrderQuantity ?? row.minimum_order_quantity ?? '',
      batch_number: String(row.batchNumber ?? row.batch_number ?? ''),
      expiry_date: String(row.expiryDate ?? row.expiry_date ?? ''),
      purchase_price: row.purchasePrice ?? row.purchase_price ?? '',
    }));

    const revalidated = validateAndNormalizeImportRows({
      portalType,
      rawRows: serverInputRows,
      mapping: {}, // read canonical field keys directly
      mode,
      todayStr,
      canonicalCatalog,
      existingProducts,
    });

    const alreadyCommitted = new Set<number>(existingJob.committedRowIndices || []);
    const createdProductIds = new Set<string>(existingJob.createdProductIds || []);
    const failedRows: Array<{ rowIndex: number; barcode?: string; genericName?: string; reason: string }> = [];

    // Fast in-memory indexes updated as we iterate so rows inside the same commit stay consistent
    const canonicalByIdentity = new Map<string, CanonicalMedicineRecord>();
    const canonicalByBarcode = new Map<string, CanonicalMedicineRecord>();
    for (const c of canonicalCatalog) {
      canonicalByIdentity.set(
        normalizeCanonicalIdentityParts({
          activeIngredient: c.activeIngredient || c.scientificName,
          strength: c.strength,
          dosageForm: c.dosageForm,
          packSize: c.packSize,
        }),
        c,
      );
      if (c.barcode) canonicalByBarcode.set(c.barcode.trim().toLowerCase(), c);
    }

    const facilityByBarcode = new Map<string, ExistingFacilityProductSummary>();
    const facilityByMedicineId = new Map<string, ExistingFacilityProductSummary>();
    for (const p of existingProducts) {
      if (p.barcode) facilityByBarcode.set(p.barcode.trim().toLowerCase(), p);
      if (p.medicineId) facilityByMedicineId.set(p.medicineId, p);
    }

    let importedProductsCount = 0;
    let updatedProductsCount = 0;
    let importedBatchesCount = 0;
    let skippedRowsCount = 0;
    const newlyCommittedIndices: number[] = [];

    const writeBatch = db.batch();
    let opCount = 0;
    const flushBatch = async () => {
      if (opCount > 0) {
        await writeBatch.commit();
        opCount = 0;
      }
    };

    // Process in deterministic chunks <= 120 Firestore ops per commit
    let currentBatch = db.batch();
    const queueSet = async (path: string, data: Record<string, unknown>, merge = false) => {
      if (opCount >= 400) {
        await currentBatch.commit();
        currentBatch = db.batch();
        opCount = 0;
      }
      if (merge) {
        currentBatch.set(db.doc(path), data, { merge: true });
      } else {
        currentBatch.set(db.doc(path), data);
      }
      opCount += 1;
    };
    const queueUpdate = async (path: string, data: Record<string, unknown>) => {
      if (opCount >= 400) {
        await currentBatch.commit();
        currentBatch = db.batch();
        opCount = 0;
      }
      currentBatch.update(db.doc(path), data);
      opCount += 1;
    };

    void flushBatch;
    void writeBatch;

    for (let i = 0; i < revalidated.rows.length; i += 1) {
      const normalizedRow: BulkImportNormalizedRow = revalidated.rows[i];
      const externalRowIndex = Number(submittedRows[i]?.rowIndex || normalizedRow.rowIndex);

      if (alreadyCommitted.has(externalRowIndex)) {
        skippedRowsCount += 1;
        continue;
      }

      if (normalizedRow.status === 'error') {
        failedRows.push({
          rowIndex: externalRowIndex,
          barcode: normalizedRow.barcode,
          genericName: normalizedRow.genericName,
          reason: normalizedRow.errors.join(' | '),
        });
        continue;
      }

      const identityParts = {
        activeIngredient: normalizedRow.activeIngredient || normalizedRow.genericName,
        strength: normalizedRow.strength,
        dosageForm: normalizedRow.dosageForm,
        packSize: normalizedRow.packageSize,
      };
      const normKey = normalizeCanonicalIdentityParts(identityParts);
      const barcodeLower = normalizedRow.barcode.trim().toLowerCase();

      // Match existing facility product first (by barcode or canonical medicineId)
      let existingFacilityProd =
        (barcodeLower ? facilityByBarcode.get(barcodeLower) : undefined) ||
        undefined;

      let canonical =
        canonicalByIdentity.get(normKey) ||
        (barcodeLower ? canonicalByBarcode.get(barcodeLower) : undefined);

      if (!existingFacilityProd && canonical) {
        existingFacilityProd = facilityByMedicineId.get(canonical.medicineId);
      }

      if (mode !== 'full_catalog_and_batches' && !existingFacilityProd) {
        failedRows.push({
          rowIndex: externalRowIndex,
          barcode: normalizedRow.barcode,
          genericName: normalizedRow.genericName,
          reason: 'PRODUCT_NOT_FOUND_IN_FACILITY_CATALOG',
        });
        continue;
      }

      // Resolve or create canonical medicine strictly by exact identity key
      let medicineId = existingFacilityProd?.medicineId || canonical?.medicineId || '';
      if (!medicineId && mode === 'full_catalog_and_batches') {
        medicineId = safeId('med');
        const identityKey = buildCanonicalIdentityKey(identityParts);
        const newCanonical: CanonicalMedicineRecord = {
          medicineId,
          scientificName: normalizedRow.genericName,
          activeIngredient: normalizedRow.activeIngredient || normalizedRow.genericName,
          brandNames: normalizedRow.brandName ? [normalizedRow.brandName] : [normalizedRow.genericName],
          strength: normalizedRow.strength,
          dosageForm: normalizedRow.dosageForm,
          packSize: normalizedRow.packageSize,
          manufacturer: normalizedRow.manufacturer,
          country: normalizedRow.country,
          barcode: normalizedRow.barcode,
          imageReference: normalizedRow.imageReference,
          approvalStatus: 'pending_review',
          requiresPrescription: normalizedRow.requiresPrescription,
          controlledDrug: false,
          therapeuticCategory: normalizedRow.category || 'General',
          status: 'active',
          createdByUid: actorUid,
        };
        await queueSet(`medora_medicines/${medicineId}`, {
          ...newCanonical,
          identityKey,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        canonicalByIdentity.set(normKey, newCanonical);
        if (barcodeLower) canonicalByBarcode.set(barcodeLower, newCanonical);
      }

      const productCollection =
        portalType === 'pharmacy' ? 'pharmacy_products' : 'wholesaler_products';
      const batchCollection =
        portalType === 'pharmacy' ? 'pharmacy_batches' : 'wholesaler_batches';
      const movCollection =
        portalType === 'pharmacy'
          ? 'pharmacy_inventory_movements'
          : 'wholesaler_inventory_movements';

      let productId = existingFacilityProd?.productId || '';

      if (mode === 'price_update_only' && existingFacilityProd) {
        if (portalType === 'pharmacy') {
          await queueUpdate(`${productCollection}/${productId}`, {
            sellingPriceIqd: Number(normalizedRow.retailPrice),
            lastImportJobId: jobId,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          await queueUpdate(`${productCollection}/${productId}`, {
            wholesalePriceIqd: Number(normalizedRow.wholesalePrice),
            lastImportJobId: jobId,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        updatedProductsCount += 1;
      } else if (mode === 'full_catalog_and_batches') {
        if (!existingFacilityProd) {
          productId = safeId(portalType === 'pharmacy' ? 'pprod' : 'wprod');
          if (portalType === 'pharmacy') {
            await queueSet(`${productCollection}/${productId}`, {
              productId,
              pharmacyUid: ownerUid,
              institutionId,
              medicineId,
              scientificName: normalizedRow.genericName,
              activeIngredient: normalizedRow.activeIngredient || normalizedRow.genericName,
              brandName: normalizedRow.brandName || normalizedRow.genericName,
              strength: normalizedRow.strength,
              dosageForm: normalizedRow.dosageForm,
              packSize: normalizedRow.packageSize,
              manufacturer: normalizedRow.manufacturer,
              country: normalizedRow.country,
              imageReference: normalizedRow.imageReference,
              barcode: normalizedRow.barcode,
              sku: productId,
              requiresPrescription: normalizedRow.requiresPrescription,
              controlledDrug: false,
              therapeuticCategory: normalizedRow.category || 'General',
              sellingPriceIqd: Number(normalizedRow.retailPrice),
              discountPriceIqd: null,
              minStockThreshold: Number(normalizedRow.reorderLevel ?? 5),
              reorderLevel: Number(normalizedRow.reorderLevel ?? 5),
              expiryAlertDays: 60,
              allowPartialPack: false,
              availableForPatientOrders: true,
              isActive: true,
              // New bulk-imported pharmacy items land as pending_review & hidden from patients until explicitly published
              reviewStatus: 'pending_review',
              isPublishedToPatients: false,
              lastImportJobId: jobId,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            await queueSet(`${productCollection}/${productId}`, {
              productId,
              wholesalerUid: ownerUid,
              institutionId,
              medicineId,
              scientificName: normalizedRow.genericName,
              activeIngredient: normalizedRow.activeIngredient || normalizedRow.genericName,
              brandName: normalizedRow.brandName || normalizedRow.genericName,
              strength: normalizedRow.strength,
              dosageForm: normalizedRow.dosageForm,
              packSize: normalizedRow.packageSize,
              manufacturer: normalizedRow.manufacturer,
              country: normalizedRow.country,
              imageReference: normalizedRow.imageReference,
              barcode: normalizedRow.barcode,
              sku: productId,
              wholesalePriceIqd: Number(normalizedRow.wholesalePrice),
              minimumOrderQty: Math.max(1, Math.floor(Number(normalizedRow.minimumOrderQuantity ?? 1))),
              minStockThreshold: 10,
              expiryAlertDays: 60,
              isActive: true,
              lastImportJobId: jobId,
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }

          const summaryProd: ExistingFacilityProductSummary = {
            productId,
            medicineId,
            barcode: normalizedRow.barcode,
            scientificName: normalizedRow.genericName,
            activeIngredient: normalizedRow.activeIngredient || normalizedRow.genericName,
            brandName: normalizedRow.brandName || normalizedRow.genericName,
            strength: normalizedRow.strength,
            dosageForm: normalizedRow.dosageForm,
            packSize: normalizedRow.packageSize,
          };
          if (barcodeLower) facilityByBarcode.set(barcodeLower, summaryProd);
          facilityByMedicineId.set(medicineId, summaryProd);
          createdProductIds.add(productId);
          importedProductsCount += 1;
        } else {
          // Update metadata & price cleanly without unpublishing already-approved items
          const updatePatch: Record<string, unknown> = {
            ...(normalizedRow.brandName ? { brandName: normalizedRow.brandName } : {}),
            ...(normalizedRow.manufacturer ? { manufacturer: normalizedRow.manufacturer } : {}),
            ...(normalizedRow.country ? { country: normalizedRow.country } : {}),
            ...(normalizedRow.imageReference ? { imageReference: normalizedRow.imageReference } : {}),
            lastImportJobId: jobId,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (portalType === 'pharmacy') {
            updatePatch.sellingPriceIqd = Number(normalizedRow.retailPrice);
            if (normalizedRow.reorderLevel !== null && normalizedRow.reorderLevel !== undefined) {
              updatePatch.reorderLevel = Number(normalizedRow.reorderLevel);
              updatePatch.minStockThreshold = Number(normalizedRow.reorderLevel);
            }
          } else {
            updatePatch.wholesalePriceIqd = Number(normalizedRow.wholesalePrice);
            if (
              normalizedRow.minimumOrderQuantity !== null &&
              normalizedRow.minimumOrderQuantity !== undefined
            ) {
              updatePatch.minimumOrderQty = Math.max(
                1,
                Math.floor(Number(normalizedRow.minimumOrderQuantity)),
              );
            }
          }
          await queueUpdate(`${productCollection}/${productId}`, updatePatch);
          updatedProductsCount += 1;
        }
      }

      // Add batch if quantity > 0 and mode allows batches
      if (
        mode !== 'price_update_only' &&
        normalizedRow.availableQuantity !== null &&
        normalizedRow.availableQuantity !== undefined &&
        normalizedRow.availableQuantity > 0 &&
        normalizedRow.batchNumber &&
        normalizedRow.expiryDate
      ) {
        const qty = Math.floor(Number(normalizedRow.availableQuantity));
        const batchId = safeId(portalType === 'pharmacy' ? 'pbatch' : 'wbatch');
        const movId = safeId(portalType === 'pharmacy' ? 'pmov' : 'wmov');

        if (portalType === 'pharmacy') {
          await queueSet(`${batchCollection}/${batchId}`, {
            batchId,
            pharmacyUid: ownerUid,
            institutionId,
            productId,
            medicineId,
            productName: normalizedRow.brandName || normalizedRow.genericName,
            batchNumber: normalizedRow.batchNumber,
            expiryDate: normalizedRow.expiryDate,
            availableQty: qty,
            reservedQty: 0,
            purchasePriceIqd: Number(normalizedRow.purchasePrice ?? 0),
            sourceType: 'bulk_import',
            isExpired: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await queueSet(`${movCollection}/${movId}`, {
            movementId: movId,
            pharmacyUid: ownerUid,
            productId,
            batchId,
            batchNumber: normalizedRow.batchNumber,
            movementType: 'receive_batch',
            quantityDelta: qty,
            reservedDelta: 0,
            reason: `Bulk import job ${jobId} (${existingJob.fileName})`,
            actorUid,
            actorName,
            createdAt: FieldValue.serverTimestamp(),
          });
        } else {
          await queueSet(`${batchCollection}/${batchId}`, {
            batchId,
            wholesalerUid: ownerUid,
            institutionId,
            productId,
            medicineId,
            productName: normalizedRow.brandName || normalizedRow.genericName,
            batchNumber: normalizedRow.batchNumber,
            expiryDate: normalizedRow.expiryDate,
            availableQty: qty,
            reservedQty: 0,
            purchaseCostIqd: Number(normalizedRow.purchasePrice ?? 0),
            isExpired: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          await queueSet(`${movCollection}/${movId}`, {
            movementId: movId,
            wholesalerUid: ownerUid,
            productId,
            batchId,
            batchNumber: normalizedRow.batchNumber,
            movementType: 'manual_add',
            quantityDelta: qty,
            reservedDelta: 0,
            reason: `Bulk import job ${jobId} (${existingJob.fileName})`,
            actorUid,
            actorName,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        importedBatchesCount += 1;
      }

      alreadyCommitted.add(externalRowIndex);
      newlyCommittedIndices.push(externalRowIndex);
    }

    if (opCount > 0) {
      await currentBatch.commit();
    }

    const totalImportedProducts = Number(existingJob.summary?.importedProductsCount || 0) + importedProductsCount;
    const totalUpdatedProducts = Number(existingJob.summary?.updatedProductsCount || 0) + updatedProductsCount;
    const totalImportedBatches = Number(existingJob.summary?.importedBatchesCount || 0) + importedBatchesCount;
    const totalSkippedRows = Number(existingJob.summary?.skippedRowsCount || 0) + skippedRowsCount;
    const mergedFailedRows = [
      ...((existingJob.failedRows || []).filter(
        (fr) => !newlyCommittedIndices.includes(fr.rowIndex),
      )),
      ...failedRows,
    ];
    const nextStatus: BulkImportJobRecord['status'] =
      mergedFailedRows.length > 0 ? 'completed_with_errors' : 'completed';

    await jobRef.update({
      mode,
      status: nextStatus,
      pdfDraftConfirmed: existingJob.isPdfDraft ? true : false,
      committedRowIndices: Array.from(alreadyCommitted).sort((a, b) => a - b),
      createdProductIds: Array.from(createdProductIds),
      failedRows: mergedFailedRows.slice(0, 200),
      'summary.importedProductsCount': totalImportedProducts,
      'summary.updatedProductsCount': totalUpdatedProducts,
      'summary.importedBatchesCount': totalImportedBatches,
      'summary.skippedRowsCount': totalSkippedRows,
      'summary.failedRowsCount': mergedFailedRows.length,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (params.onAudit) {
      await params.onAudit(
        `Bulk import ${jobId} (${mode}): +${importedProductsCount} products, ${updatedProductsCount} updated, +${importedBatchesCount} batches, ${failedRows.length} failed`,
        jobId,
      );
    }

    const updatedJobSnap = await jobRef.get();
    res.json({
      ok: true,
      job: serializeDoc(updatedJobSnap.data()),
      importedProductsCount,
      updatedProductsCount,
      importedBatchesCount,
      skippedRowsCount,
      failedRows,
    });
  } catch (err) {
    console.error('[MEDORA][BulkImportCommit] error:', err);
    res.status(500).json({ error: 'BULK_IMPORT_COMMIT_FAILED' });
  }
}

export async function listBulkImportJobs(params: {
  db: Firestore;
  portalType: BulkImportPortalType;
  ownerUid: string;
  res: Response;
}): Promise<void> {
  try {
    const snap = await params.db
      .collection('bulk_import_jobs')
      .where('ownerUid', '==', params.ownerUid)
      .where('portalType', '==', params.portalType)
      .limit(50)
      .get();

    const jobs = snap.docs
      .map((d) => serializeDoc(d.data()))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    params.res.json({ ok: true, jobs });
  } catch (err) {
    console.error('[MEDORA][ListBulkImportJobs] error:', err);
    params.res.status(500).json({ error: 'BULK_IMPORT_JOBS_LIST_FAILED' });
  }
}
