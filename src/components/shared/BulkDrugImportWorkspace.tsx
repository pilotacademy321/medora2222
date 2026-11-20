import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import {
  approvePublishBulkImportJob,
  commitPharmacyBulkImport,
  downloadPharmacyBulkTemplate,
  fetchPharmacyBulkImportJobs,
  parsePharmacyBulkImport,
  revalidatePharmacyBulkImport,
} from '../../services/pharmacyService';
import {
  commitWholesalerBulkImport,
  downloadWholesalerBulkTemplate,
  fetchWholesalerBulkImportJobs,
  parseWholesalerBulkImport,
  revalidateWholesalerBulkImport,
} from '../../services/wholesalerService';
import type { Language } from '../../types/medora';
import type {
  BulkImportCanonicalField,
  BulkImportColumnMapping,
  BulkImportJobRecord,
  BulkImportJobSummary,
  BulkImportMode,
  BulkImportNormalizedRow,
  BulkImportPortalType,
  DosageForm,
} from '../../types/pharmacy';

interface BulkDrugImportWorkspaceProps {
  firebaseUser: User;
  portalType: BulkImportPortalType;
  language: Language;
  onSuccessRefresh: () => Promise<void>;
}

const DOSAGE_FORM_OPTIONS: DosageForm[] = [
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
];

const MAPPABLE_FIELDS: Array<{
  key: BulkImportCanonicalField;
  ar: string;
  en: string;
  portal?: BulkImportPortalType;
}> = [
  { key: 'barcode', ar: 'الباركود', en: 'Barcode' },
  { key: 'generic_name', ar: 'الاسم العلمي', en: 'Generic / Scientific Name' },
  { key: 'brand_name', ar: 'الاسم التجاري', en: 'Brand Name' },
  { key: 'active_ingredient', ar: 'المادة الفعالة', en: 'Active Ingredient' },
  { key: 'strength', ar: 'التركيز', en: 'Strength' },
  { key: 'dosage_form', ar: 'الشكل الدوائي', en: 'Dosage Form' },
  { key: 'package_size', ar: 'حجم العبوة', en: 'Package Size' },
  { key: 'manufacturer', ar: 'الشركة المصنعة', en: 'Manufacturer' },
  { key: 'country', ar: 'بلد المنشأ', en: 'Country' },
  { key: 'requires_prescription', ar: 'يتطلب وصفة', en: 'Requires Rx' },
  { key: 'category', ar: 'التصنيف', en: 'Category' },
  { key: 'retail_price', ar: 'سعر البيع للمريض (د.ع)', en: 'Retail Price (IQD)', portal: 'pharmacy' },
  { key: 'wholesale_price', ar: 'سعر الجملة (د.ع)', en: 'Wholesale Price (IQD)', portal: 'wholesaler' },
  { key: 'available_quantity', ar: 'الكمية المتوفرة', en: 'Available Quantity' },
  { key: 'reorder_level', ar: 'حد إعادة الطلب', en: 'Reorder Level', portal: 'pharmacy' },
  { key: 'minimum_order_quantity', ar: 'أقل كمية طلب', en: 'Min Order Qty (MOQ)', portal: 'wholesaler' },
  { key: 'batch_number', ar: 'رقم التشغيلة', en: 'Batch Number' },
  { key: 'expiry_date', ar: 'تاريخ الانتهاء', en: 'Expiry Date' },
  { key: 'purchase_price', ar: 'سعر الكلفة / الشراء (د.ع)', en: 'Purchase Cost (IQD)' },
];

const ERROR_CODE_LABELS: Record<string, { ar: string; en: string }> = {
  GENERIC_OR_SCIENTIFIC_NAME_REQUIRED: {
    ar: 'الاسم العلمي مطلوب',
    en: 'Generic/scientific name required',
  },
  STRENGTH_REQUIRED: { ar: 'التركيز مطلوب', en: 'Strength required' },
  INVALID_OR_MISSING_DOSAGE_FORM: {
    ar: 'الشكل الدوائي غير صالح أو مفقود',
    en: 'Invalid or missing dosage form',
  },
  PACKAGE_SIZE_REQUIRED: { ar: 'حجم العبوة مطلوب', en: 'Package size required' },
  RETAIL_PRICE_MUST_BE_POSITIVE: {
    ar: 'سعر البيع للمريض يجب أن يكون أكبر من 0',
    en: 'Retail price must be > 0',
  },
  WHOLESALE_PRICE_MUST_BE_POSITIVE: {
    ar: 'سعر الجملة يجب أن يكون أكبر من 0',
    en: 'Wholesale price must be > 0',
  },
  NEGATIVE_QUANTITY_NOT_ALLOWED: {
    ar: 'الكمية لا يمكن أن تكون سالبة',
    en: 'Negative quantity not allowed',
  },
  QUANTITY_REQUIRED_FOR_BATCH_UPDATE: {
    ar: 'الكمية مطلوبة في وضع تحديث الكميات',
    en: 'Quantity required in batch update mode',
  },
  BATCH_NUMBER_REQUIRED_WHEN_QUANTITY_POSITIVE: {
    ar: 'رقم التشغيلة مطلوب عند وجود كمية',
    en: 'Batch number required when quantity > 0',
  },
  EXPIRY_DATE_REQUIRED_WHEN_QUANTITY_POSITIVE: {
    ar: 'تاريخ الانتهاء مطلوب عند وجود كمية',
    en: 'Expiry date required when quantity > 0',
  },
  INVALID_EXPIRY_DATE_FORMAT: {
    ar: 'صيغة تاريخ الانتهاء غير صالحة (YYYY-MM-DD)',
    en: 'Invalid expiry date format (YYYY-MM-DD)',
  },
  EXPIRED_BATCH_NOT_ALLOWED: {
    ar: 'تشغيلة منتهية الصلاحية — مرفوضة',
    en: 'Expired batch rejected',
  },
  DUPLICATE_BARCODE_IN_FILE: {
    ar: 'باركود مكرر داخل الملف',
    en: 'Duplicate barcode inside file',
  },
  DUPLICATE_IDENTITY_AND_BATCH_IN_FILE: {
    ar: 'تكرار نفس الدواء ورقم التشغيلة داخل الملف',
    en: 'Duplicate drug & batch inside file',
  },
  EXISTING_PRODUCT_REQUIRED_FOR_UPDATE: {
    ar: 'المنتج غير موجود في كتالوج المنشأة للتحديث',
    en: 'Product not found in facility catalog to update',
  },
  BARCODE_CONFLICTS_WITH_OTHER_CANONICAL_MEDICINE: {
    ar: 'الباركود مرتبط بدواء مرجعي آخر',
    en: 'Barcode conflicts with another canonical medicine',
  },
  MATCHED_CANONICAL_CATALOG_DRAFT_PENDING_REVIEW: {
    ar: 'دواء جديد: سيتم حفظه بانتظار المراجعة والنشر',
    en: 'New medicine: saved pending review',
  },
  CANONICAL_IDENTITY_CONFLICT_NEW_DRAFT_USED: {
    ar: 'تعارض هوية الباركود — سيتم استخدام مسودة جديدة',
    en: 'Barcode identity mismatch — new draft used',
  },
};

function translateCode(code: string, isAr: boolean): string {
  const found = ERROR_CODE_LABELS[code];
  if (found) return isAr ? found.ar : found.en;
  return code;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error('FILE_READ_FAILED'));
    reader.readAsDataURL(file);
  });
}

export function BulkDrugImportWorkspace({
  firebaseUser,
  portalType,
  language,
  onSuccessRefresh,
}: BulkDrugImportWorkspaceProps) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<BulkImportMode>('full_catalog_and_batches');
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    fileName: string;
    mimeType: string;
    dataBase64: string;
  } | null>(null);

  const [job, setJob] = useState<BulkImportJobRecord | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<BulkImportColumnMapping>({});
  const [isPdfDraft, setIsPdfDraft] = useState(false);
  const [pdfDraftConfirmed, setPdfDraftConfirmed] = useState(false);
  const [rows, setRows] = useState<BulkImportNormalizedRow[]>([]);
  const [summary, setSummary] = useState<BulkImportJobSummary | null>(null);

  const [showMapping, setShowMapping] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'warning' | 'error'>('all');

  const [parsing, setParsing] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState<{ done: number; total: number } | null>(null);
  const [commitResult, setCommitResult] = useState<{
    importedProducts: number;
    updatedProducts: number;
    importedBatches: number;
    skipped: number;
    failed: Array<{ rowIndex: number; barcode?: string; genericName?: string; reason: string }>;
  } | null>(null);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [jobsHistory, setJobsHistory] = useState<BulkImportJobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const list =
        portalType === 'pharmacy'
          ? await fetchPharmacyBulkImportJobs(firebaseUser)
          : await fetchWholesalerBulkImportJobs(firebaseUser);
      setJobsHistory(list);
    } catch {
      // Keep UI quiet on background history load errors
    } finally {
      setLoadingJobs(false);
    }
  }, [firebaseUser, portalType]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const visibleMappingFields = useMemo(
    () => MAPPABLE_FIELDS.filter((f) => !f.portal || f.portal === portalType),
    [portalType],
  );

  const filteredRows = useMemo(() => {
    if (filterTab === 'all') return rows;
    return rows.filter((r) => r.status === filterTab);
  }, [rows, filterTab]);

  const handleDownloadTemplate = async () => {
    setError(null);
    try {
      if (portalType === 'pharmacy') {
        await downloadPharmacyBulkTemplate(firebaseUser);
      } else {
        await downloadWholesalerBulkTemplate(firebaseUser);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'TEMPLATE_DOWNLOAD_FAILED');
    }
  };

  const runParse = async (params: {
    fileName: string;
    mimeType: string;
    dataBase64: string;
    targetMode: BulkImportMode;
    targetSheet?: string;
    overrideMapping?: BulkImportColumnMapping;
  }) => {
    setParsing(true);
    setError(null);
    setNotice(null);
    setCommitResult(null);
    setPdfDraftConfirmed(false);
    try {
      const payload = {
        dataBase64: params.dataBase64,
        mimeType: params.mimeType,
        fileName: params.fileName,
        mode: params.targetMode,
        selectedSheet: params.targetSheet,
        columnMapping: params.overrideMapping,
      };
      const res =
        portalType === 'pharmacy'
          ? await parsePharmacyBulkImport(firebaseUser, payload)
          : await parseWholesalerBulkImport(firebaseUser, payload);
      setJob(res.job);
      setSheetNames(res.sheetNames || []);
      setSelectedSheet(res.selectedSheet || '');
      setHeaders(res.headers || []);
      setColumnMapping(res.columnMapping || {});
      setIsPdfDraft(Boolean(res.isPdfDraft));
      setRows(res.rows || []);
      setSummary(res.summary);
      setFilterTab('all');
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BULK_IMPORT_PARSE_FAILED');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const mimeType = file.type || 'application/octet-stream';
      const meta = { fileName: file.name, mimeType, dataBase64 };
      setSelectedFileMeta(meta);
      await runParse({
        ...meta,
        targetMode: mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'FILE_READ_FAILED');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRowCellChange = (
    rowIndex: number,
    canonicalField: BulkImportCanonicalField,
    normalizedKey: keyof BulkImportNormalizedRow,
    value: string | number,
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowIndex !== rowIndex) return row;
        const mappedCol = columnMapping[canonicalField];
        const nextRaw = { ...(row.rawRow || {}) };
        if (mappedCol) {
          nextRaw[mappedCol] = String(value);
        }
        nextRaw[canonicalField] = String(value);
        return {
          ...row,
          [normalizedKey]: value,
          rawRow: nextRaw,
        };
      }),
    );
  };

  const handleExcludeRow = (rowIndex: number) => {
    setRows((prev) => prev.filter((r) => r.rowIndex !== rowIndex));
  };

  const handleRevalidate = async (
    overrideMode?: BulkImportMode,
    overrideMapping?: BulkImportColumnMapping,
  ) => {
    if (rows.length === 0) return;
    setRevalidating(true);
    setError(null);
    try {
      const activeMode = overrideMode || mode;
      const activeMapping = overrideMapping || columnMapping;
      const rawRows = rows.map((r) => {
        const base: Record<string, unknown> = { ...(r.rawRow || {}) };
        base.barcode = r.barcode;
        base.generic_name = r.genericName;
        base.brand_name = r.brandName;
        base.active_ingredient = r.activeIngredient;
        base.strength = r.strength;
        base.dosage_form = r.dosageForm;
        base.package_size = r.packageSize;
        base.manufacturer = r.manufacturer;
        base.country = r.country;
        base.requires_prescription = String(r.requiresPrescription);
        base.category = r.category;
        base.retail_price = r.retailPrice ?? '';
        base.wholesale_price = r.wholesalePrice ?? '';
        base.available_quantity = r.availableQuantity ?? '';
        base.reorder_level = r.reorderLevel ?? '';
        base.minimum_order_quantity = r.minimumOrderQuantity ?? '';
        base.batch_number = r.batchNumber;
        base.expiry_date = r.expiryDate;
        base.purchase_price = r.purchasePrice ?? '';
        // When user changed column mapping dropdown, let rawRow[mappedCol] win;
        // otherwise keep canonical keys aligned with inline edits
        if (!overrideMapping) {
          for (const f of visibleMappingFields) {
            const mappedCol = activeMapping[f.key];
            if (mappedCol && base[f.key] !== undefined) {
              base[mappedCol] = base[f.key];
            }
          }
        }
        return base;
      });

      const payload = {
        jobId: job?.jobId,
        mode: activeMode,
        columnMapping: activeMapping,
        rawRows,
      };
      const res =
        portalType === 'pharmacy'
          ? await revalidatePharmacyBulkImport(firebaseUser, payload)
          : await revalidateWholesalerBulkImport(firebaseUser, payload);
      setRows(res.rows || []);
      setSummary(res.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BULK_IMPORT_REVALIDATE_FAILED');
    } finally {
      setRevalidating(false);
    }
  };

  const handleCommitValidRows = async () => {
    if (!job) return;
    if (isPdfDraft && !pdfDraftConfirmed) {
      setError(
        isAr
          ? 'يرجى تأكيد مراجعة مسودة PDF قبل اعتماد الاستيراد.'
          : 'Confirm PDF draft review before committing import.',
      );
      return;
    }

    const eligibleRows = rows.filter((r) => r.status !== 'error');
    if (eligibleRows.length === 0) {
      setError(isAr ? 'لا توجد صفوف صالحة للاستيراد.' : 'No valid rows to import.');
      return;
    }

    setCommitting(true);
    setError(null);
    setNotice(null);
    const CHUNK_SIZE = 50;
    let totalImportedProducts = 0;
    let totalUpdatedProducts = 0;
    let totalImportedBatches = 0;
    let totalSkipped = 0;
    const allFailed: Array<{
      rowIndex: number;
      barcode?: string;
      genericName?: string;
      reason: string;
    }> = [];

    try {
      setCommitProgress({ done: 0, total: eligibleRows.length });
      for (let start = 0; start < eligibleRows.length; start += CHUNK_SIZE) {
        const chunk = eligibleRows.slice(start, start + CHUNK_SIZE);
        const payload = {
          jobId: job.jobId,
          mode,
          pdfDraftConfirmed: isPdfDraft ? pdfDraftConfirmed : false,
          rows: chunk,
        };
        const res =
          portalType === 'pharmacy'
            ? await commitPharmacyBulkImport(firebaseUser, payload)
            : await commitWholesalerBulkImport(firebaseUser, payload);

        totalImportedProducts += res.importedProductsCount;
        totalUpdatedProducts += res.updatedProductsCount;
        totalImportedBatches += res.importedBatchesCount;
        totalSkipped += res.skippedRowsCount;
        if (Array.isArray(res.failedRows)) {
          allFailed.push(...res.failedRows);
        }
        setJob(res.job);
        setCommitProgress({
          done: Math.min(eligibleRows.length, start + chunk.length),
          total: eligibleRows.length,
        });
      }

      setCommitResult({
        importedProducts: totalImportedProducts,
        updatedProducts: totalUpdatedProducts,
        importedBatches: totalImportedBatches,
        skipped: totalSkipped,
        failed: allFailed,
      });
      setNotice(
        portalType === 'pharmacy'
          ? isAr
            ? `تم حفظ ${totalImportedProducts} صنف جديد (${totalUpdatedProducts} محدث) و${totalImportedBatches} تشغيلة. الأصناف الجديدة بانتظار المراجعة والنشر للمرضى.`
            : `Imported ${totalImportedProducts} new (${totalUpdatedProducts} updated) products and ${totalImportedBatches} batches. New items await review before patient publishing.`
          : isAr
            ? `تم استيراد ${totalImportedProducts} صنف جديد (${totalUpdatedProducts} محدث) و${totalImportedBatches} تشغيلة لمخزون المذخر.`
            : `Imported ${totalImportedProducts} new (${totalUpdatedProducts} updated) products and ${totalImportedBatches} batches to wholesaler stock.`,
      );
      await Promise.all([loadJobs(), onSuccessRefresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BULK_IMPORT_COMMIT_FAILED');
    } finally {
      setCommitting(false);
    }
  };

  const handlePublishJob = async (jobId: string) => {
    if (portalType !== 'pharmacy') return;
    setPublishingJobId(jobId);
    setError(null);
    try {
      const res = await approvePublishBulkImportJob(firebaseUser, jobId);
      setNotice(
        isAr
          ? `تم نشر ${res.publishedCount} صنف من الدفعة ليظهر للمرضى والأطباء.`
          : `Published ${res.publishedCount} imported products to patients & doctors.`,
      );
      await Promise.all([loadJobs(), onSuccessRefresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BULK_IMPORT_PUBLISH_FAILED');
    } finally {
      setPublishingJobId(null);
    }
  };

  const commitEligibleCount = rows.filter((r) => r.status !== 'error').length;

  const isPharmacy = portalType === 'pharmacy';

  return (
    <div
      className={`space-y-5 rounded-2xl border p-5 ${
        isPharmacy
          ? 'border-emerald-100 bg-white dark:border-emerald-900/50 dark:bg-[#081C16]'
          : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]'
      }`}
    >
      {/* Header & Template / Upload Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className={`h-5 w-5 ${
                isPharmacy
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-[#0c3585] dark:text-[#f4d378]'
              }`}
            />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {pt.bulkImport.title}
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{pt.bulkImport.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadTemplate()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{pt.bulkImport.downloadTemplate}</span>
          </button>

          <label
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              isPharmacy
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'medora-gold-button text-[#040917]'
            }`}
          >
            {parsing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            <span>{pt.bulkImport.uploadFile}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json,.pdf"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Mode Selector + Sheet Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {pt.bulkImport.modeLabel}:
          </span>
          {(
            [
              'full_catalog_and_batches',
              'price_update_only',
              'quantity_batch_update_only',
            ] as const
          ).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                if (rows.length > 0) void handleRevalidate(m, columnMapping);
              }}
              className={`min-h-[34px] rounded-lg border px-3 text-xs font-bold cursor-pointer ${
                mode === m
                  ? isPharmacy
                    ? 'border-emerald-700 bg-emerald-700 text-white'
                    : 'border-[#0c3585] bg-[#0c3585] text-white'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {pt.bulkImport.modes[m]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sheetNames.length > 1 && selectedFileMeta && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>{pt.bulkImport.sheetLabel}:</span>
              <select
                value={selectedSheet}
                onChange={(e) =>
                  void runParse({
                    ...selectedFileMeta,
                    targetMode: mode,
                    targetSheet: e.target.value,
                  })
                }
                className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {headers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMapping((v) => !v)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>{pt.bulkImport.mappingTitle}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {/* Column Mapping Panel */}
      {showMapping && headers.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              {pt.bulkImport.mappingTitle}
            </h4>
              <button
                type="button"
                disabled={revalidating}
                onClick={() => void handleRevalidate(mode, columnMapping)}
                className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-white cursor-pointer ${
                  isPharmacy ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-[#0c3585]'
                }`}
              >
              <RefreshCw className={`h-3 w-3 ${revalidating ? 'animate-spin' : ''}`} />
              <span>{pt.bulkImport.revalidateBtn}</span>
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {visibleMappingFields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {isAr ? field.ar : field.en}
                </label>
                <select
                  value={columnMapping[field.key] || ''}
                  onChange={(e) => {
                    const next = { ...columnMapping, [field.key]: e.target.value };
                    setColumnMapping(next);
                  }}
                  className="min-h-[34px] w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">{isAr ? '— غير مربوط —' : '— Unmapped —'}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mandatory PDF Review Draft Warning */}
      {isPdfDraft && rows.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2.5 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5 dark:text-amber-400" />
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              {pt.bulkImport.pdfWarning}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-amber-950 dark:text-amber-100 cursor-pointer">
            <input
              type="checkbox"
              checked={pdfDraftConfirmed}
              onChange={(e) => setPdfDraftConfirmed(e.target.checked)}
            />
            <span>{pt.bulkImport.pdfConfirmLabel}</span>
          </label>
        </div>
      )}

      {/* Validation Preview Table */}
      {rows.length > 0 && summary && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-900 dark:text-white">
                {pt.bulkImport.previewTitle}:
              </span>
              <span className="font-latin font-bold tabular-nums text-slate-700 dark:text-slate-200">
                {pt.bulkImport.filterAll} ({rows.length})
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-latin font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {pt.bulkImport.filterValid} ({rows.filter((r) => r.status === 'valid').length})
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-latin font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {pt.bulkImport.filterWarnings} ({rows.filter((r) => r.status === 'warning').length})
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-latin font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {pt.bulkImport.filterErrors} ({rows.filter((r) => r.status === 'error').length})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: pt.bulkImport.filterAll },
                  { id: 'valid', label: pt.bulkImport.filterValid },
                  { id: 'warning', label: pt.bulkImport.filterWarnings },
                  { id: 'error', label: pt.bulkImport.filterErrors },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`min-h-[30px] rounded-lg border px-2.5 text-[11px] font-bold cursor-pointer ${
                    filterTab === tab.id
                      ? isPharmacy
                        ? 'border-emerald-700 bg-emerald-700 text-white'
                        : 'border-[#0c3585] bg-[#0c3585] text-white'
                      : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <button
                type="button"
                disabled={revalidating}
                onClick={() => void handleRevalidate()}
                className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${revalidating ? 'animate-spin' : ''}`} />
                <span>{pt.bulkImport.revalidateBtn}</span>
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-start text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                <tr>
                  <th className="px-2.5 py-2 text-center">#</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'الاسم العلمي' : 'Generic'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'التجاري' : 'Brand'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'التركيز' : 'Strength'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'الشكل' : 'Form'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'العبوة' : 'Pack'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'الباركود' : 'Barcode'}</th>
                  <th className="px-2.5 py-2 text-end">
                    {portalType === 'pharmacy'
                      ? isAr
                        ? 'سعر البيع'
                        : 'Retail'
                      : isAr
                        ? 'سعر الجملة'
                        : 'Wholesale'}
                  </th>
                  <th className="px-2.5 py-2 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'التشغيلة' : 'Batch'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'الانتهاء' : 'Expiry'}</th>
                  <th className="px-2.5 py-2 text-start">{isAr ? 'النتيجة' : 'Validation'}</th>
                  <th className="px-2.5 py-2 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.slice(0, 200).map((row) => (
                  <tr
                    key={row.rowIndex}
                    className={
                      row.status === 'error'
                        ? 'bg-rose-50/40 dark:bg-rose-950/15'
                        : row.status === 'warning'
                          ? 'bg-amber-50/40 dark:bg-amber-950/10'
                          : ''
                    }
                  >
                    <td className="px-2 py-1.5 text-center font-latin tabular-nums text-slate-500">
                      {row.rowIndex}
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.genericName}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'generic_name', 'genericName', e.target.value)
                        }
                        className="w-32 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.brandName}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'brand_name', 'brandName', e.target.value)
                        }
                        className="w-28 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.strength}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'strength', 'strength', e.target.value)
                        }
                        className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={row.dosageForm}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'dosage_form', 'dosageForm', e.target.value)
                        }
                        className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      >
                        {DOSAGE_FORM_OPTIONS.map((df) => (
                          <option key={df} value={df}>
                            {pt.dosageForms[df] || df}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={row.packageSize}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'package_size', 'packageSize', e.target.value)
                        }
                        className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={row.barcode}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'barcode', 'barcode', e.target.value)
                        }
                        className="w-28 rounded border border-slate-200 bg-white px-2 py-1 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={
                          portalType === 'pharmacy'
                            ? row.retailPrice ?? ''
                            : row.wholesalePrice ?? ''
                        }
                        onChange={(e) =>
                          handleRowCellChange(
                            row.rowIndex,
                            portalType === 'pharmacy' ? 'retail_price' : 'wholesale_price',
                            portalType === 'pharmacy' ? 'retailPrice' : 'wholesalePrice',
                            Number(e.target.value) || 0,
                          )
                        }
                        className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-end font-latin tabular-nums text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        value={row.availableQuantity ?? ''}
                        onChange={(e) =>
                          handleRowCellChange(
                            row.rowIndex,
                            'available_quantity',
                            'availableQuantity',
                            Number(e.target.value) || 0,
                          )
                        }
                        className="w-16 rounded border border-slate-200 bg-white px-2 py-1 text-center font-latin tabular-nums text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        value={row.batchNumber}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'batch_number', 'batchNumber', e.target.value)
                        }
                        className="w-24 rounded border border-slate-200 bg-white px-2 py-1 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="YYYY-MM-DD"
                        value={row.expiryDate}
                        onChange={(e) =>
                          handleRowCellChange(row.rowIndex, 'expiry_date', 'expiryDate', e.target.value)
                        }
                        className="w-24 rounded border border-slate-200 bg-white px-2 py-1 font-latin tabular-nums text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-1.5 min-w-[170px]">
                      {row.status === 'error' ? (
                        <div className="flex items-start gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{row.errors.map((c) => translateCode(c, isAr)).join(' · ')}</span>
                        </div>
                      ) : row.status === 'warning' ? (
                        <div className="flex items-start gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{row.warnings.map((c) => translateCode(c, isAr)).join(' · ')}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{pt.bulkImport.filterValid}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleExcludeRow(row.rowIndex)}
                        title={isAr ? 'استبعاد الصف' : 'Exclude row'}
                        className="text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {commitProgress && committing && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                <span>{pt.bulkImport.committingBtn}</span>
                <span>
                  {commitProgress.done} / {commitProgress.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full transition-all ${isPharmacy ? 'bg-emerald-700' : 'bg-[#0c3585]'}`}
                  style={{
                    width: `${Math.round((commitProgress.done / Math.max(1, commitProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {isAr
                ? `الصفوف الجاهزة للاستيراد: ${commitEligibleCount} من ${rows.length}`
                : `Ready to commit: ${commitEligibleCount} of ${rows.length} rows`}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {commitResult &&
                portalType === 'pharmacy' &&
                job &&
                job.publishStatus === 'pending_review' && (
                  <button
                    type="button"
                    disabled={publishingJobId === job.jobId}
                    onClick={() => void handlePublishJob(job.jobId)}
                    className="min-h-[38px] rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white cursor-pointer"
                  >
                    {pt.bulkImport.publishJobBtn}
                  </button>
                )}
              <button
                type="button"
                disabled={
                  committing ||
                  commitEligibleCount === 0 ||
                  (isPdfDraft && !pdfDraftConfirmed)
                }
                onClick={() => void handleCommitValidRows()}
                className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-xs font-bold disabled:opacity-50 cursor-pointer ${
                  isPharmacy
                    ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'medora-gold-button text-[#040917]'
                }`}
              >
                {committing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>
                  {committing ? pt.bulkImport.committingBtn : pt.bulkImport.commitBtn}
                </span>
              </button>
            </div>
          </div>

          {commitResult && commitResult.failed.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-800 space-y-1 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <p className="font-bold">
                {isAr
                  ? `صفوف لم يتم حفظها (${commitResult.failed.length}):`
                  : `Failed rows (${commitResult.failed.length}):`}
              </p>
              {commitResult.failed.slice(0, 10).map((f) => (
                <p key={`${f.rowIndex}-${f.barcode || ''}`} className="tabular-nums">
                  #{f.rowIndex} {f.genericName || f.barcode || ''} — {translateCode(f.reason, isAr)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Past Bulk Import Jobs History */}
      <div className="border-t border-slate-100 pt-4 space-y-2.5 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
            <History
              className={`h-4 w-4 ${
                isPharmacy
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-[#0c3585] dark:text-[#f4d378]'
              }`}
            />
            <span>{pt.bulkImport.historyTitle}</span>
          </div>
          {loadingJobs && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        {jobsHistory.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{pt.common.noData}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2 text-start">{isAr ? 'الملف' : 'File'}</th>
                  <th className="px-3 py-2 text-center">{isAr ? 'الوضع' : 'Mode'}</th>
                  <th className="px-3 py-2 text-center">{isAr ? 'النتائج' : 'Imported'}</th>
                  <th className="px-3 py-2 text-center">{pt.common.status}</th>
                  {portalType === 'pharmacy' && (
                    <th className="px-3 py-2 text-end">{pt.common.actions}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {jobsHistory.slice(0, 8).map((j) => (
                  <tr key={j.jobId}>
                    <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">
                      <div>{j.fileName}</div>
                      <div className="text-[11px] font-normal text-slate-500">
                        {j.uploadedByName} · {j.sourceType.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 dark:text-slate-300">
                      {pt.bulkImport.modes[j.mode]}
                    </td>
                    <td className="px-3 py-2 text-center font-latin tabular-nums text-slate-700 dark:text-slate-200">
                      +{j.summary.importedProductsCount} · ↻{j.summary.updatedProductsCount} ·{' '}
                      {j.summary.importedBatchesCount} {isAr ? 'تشغيلة' : 'batches'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {portalType === 'pharmacy' && j.publishStatus === 'pending_review' ? (
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {pt.bulkImport.pendingReviewBadge}
                        </span>
                      ) : portalType === 'pharmacy' && j.publishStatus === 'published' ? (
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {pt.bulkImport.publishedBadge}
                        </span>
                      ) : (
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {j.status}
                        </span>
                      )}
                    </td>
                    {portalType === 'pharmacy' && (
                      <td className="px-3 py-2 text-end">
                        {j.publishStatus === 'pending_review' &&
                          (j.summary.importedProductsCount > 0 ||
                            j.summary.updatedProductsCount > 0) && (
                            <button
                              type="button"
                              disabled={publishingJobId === j.jobId}
                              onClick={() => void handlePublishJob(j.jobId)}
                              className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white cursor-pointer"
                            >
                              {isAr ? 'نشر للمرضى' : 'Publish'}
                            </button>
                          )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
