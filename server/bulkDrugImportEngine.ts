import * as XLSX from 'xlsx';
import type {
  BulkImportCanonicalField,
  BulkImportColumnMapping,
  BulkImportMode,
  BulkImportNormalizedRow,
  BulkImportPortalType,
  BulkImportSourceType,
  CanonicalMedicineRecord,
  DosageForm,
} from '../src/types/pharmacy';

export const BULK_IMPORT_MAX_ROWS = 2500;

export const PHARMACY_TEMPLATE_COLUMNS: BulkImportCanonicalField[] = [
  'barcode',
  'generic_name',
  'brand_name',
  'active_ingredient',
  'strength',
  'dosage_form',
  'package_size',
  'manufacturer',
  'country',
  'requires_prescription',
  'category',
  'image_reference',
  'retail_price',
  'available_quantity',
  'reorder_level',
  'batch_number',
  'expiry_date',
  'purchase_price',
];

export const WHOLESALER_TEMPLATE_COLUMNS: BulkImportCanonicalField[] = [
  'barcode',
  'generic_name',
  'brand_name',
  'active_ingredient',
  'strength',
  'dosage_form',
  'package_size',
  'manufacturer',
  'country',
  'requires_prescription',
  'category',
  'image_reference',
  'wholesale_price',
  'available_quantity',
  'minimum_order_quantity',
  'batch_number',
  'expiry_date',
  'purchase_price',
];

const HEADER_SYNONYMS: Record<string, BulkImportCanonicalField> = {
  barcode: 'barcode',
  bar_code: 'barcode',
  ean: 'barcode',
  ean13: 'barcode',
  gtin: 'barcode',
  upc: 'barcode',
  الباركود: 'barcode',
  باركود: 'barcode',
  رمز_الباركود: 'barcode',

  generic_name: 'generic_name',
  scientific_name: 'generic_name',
  generic: 'generic_name',
  medicine_name: 'generic_name',
  drug_name: 'generic_name',
  الاسم_العلمي: 'generic_name',
  اسم_الدواء_العلمي: 'generic_name',
  الاسم: 'generic_name',

  brand_name: 'brand_name',
  trade_name: 'brand_name',
  brand: 'brand_name',
  commercial_name: 'brand_name',
  الاسم_التجاري: 'brand_name',
  العلامة_التجارية: 'brand_name',

  active_ingredient: 'active_ingredient',
  ingredient: 'active_ingredient',
  substance: 'active_ingredient',
  المادة_الفعالة: 'active_ingredient',

  strength: 'strength',
  dose: 'strength',
  concentration: 'strength',
  التركيز: 'strength',

  dosage_form: 'dosage_form',
  form: 'dosage_form',
  pharmaceutical_form: 'dosage_form',
  الشكل_الدوائي: 'dosage_form',
  الشكل: 'dosage_form',

  package_size: 'package_size',
  pack_size: 'package_size',
  packing: 'package_size',
  pack: 'package_size',
  حجم_العبوة: 'package_size',
  العبوة: 'package_size',

  manufacturer: 'manufacturer',
  company: 'manufacturer',
  maker: 'manufacturer',
  الشركة_المصنعة: 'manufacturer',
  الشركة: 'manufacturer',

  country: 'country',
  origin: 'country',
  country_of_origin: 'country',
  بلد_المنشأ: 'country',
  الدولة: 'country',
  المنشأ: 'country',

  requires_prescription: 'requires_prescription',
  rx: 'requires_prescription',
  prescription_required: 'requires_prescription',
  is_rx: 'requires_prescription',
  بوصفة_طبية: 'requires_prescription',
  يحتاج_وصفة: 'requires_prescription',
  وصفة: 'requires_prescription',

  category: 'category',
  therapeutic_category: 'category',
  class: 'category',
  التصنيف: 'category',
  التصنيف_العلاجي: 'category',

  image_reference: 'image_reference',
  image_url: 'image_reference',
  image: 'image_reference',
  صورة: 'image_reference',
  مرجع_الصورة: 'image_reference',

  retail_price: 'retail_price',
  selling_price: 'retail_price',
  selling_price_iqd: 'retail_price',
  patient_price: 'retail_price',
  price_iqd: 'retail_price',
  price: 'retail_price',
  سعر_البيع: 'retail_price',
  سعر_المريض: 'retail_price',
  السعر: 'retail_price',

  wholesale_price: 'wholesale_price',
  wholesale_price_iqd: 'wholesale_price',
  b2b_price: 'wholesale_price',
  سعر_الجملة: 'wholesale_price',
  سعر_المذخر: 'wholesale_price',

  available_quantity: 'available_quantity',
  quantity: 'available_quantity',
  qty: 'available_quantity',
  stock: 'available_quantity',
  available_qty: 'available_quantity',
  الكمية: 'available_quantity',
  الكمية_المتوفرة: 'available_quantity',
  الرصيد: 'available_quantity',

  reorder_level: 'reorder_level',
  min_stock: 'reorder_level',
  min_stock_threshold: 'reorder_level',
  حد_اعادة_الطلب: 'reorder_level',
  حد_إعادة_الطلب: 'reorder_level',
  الحد_الأدنى_للمخزون: 'reorder_level',

  minimum_order_quantity: 'minimum_order_quantity',
  minimum_order_qty: 'minimum_order_quantity',
  moq: 'minimum_order_quantity',
  الحد_الأدنى_للطلب: 'minimum_order_quantity',
  الحد_الادنى_للطلب: 'minimum_order_quantity',

  batch_number: 'batch_number',
  batch_no: 'batch_number',
  lot: 'batch_number',
  lot_number: 'batch_number',
  رقم_التشغيلة: 'batch_number',
  رقم_الوجبة: 'batch_number',
  التشغيلة: 'batch_number',

  expiry_date: 'expiry_date',
  exp_date: 'expiry_date',
  expiry: 'expiry_date',
  exp: 'expiry_date',
  تاريخ_الانتهاء: 'expiry_date',
  تاريخ_النفاذ: 'expiry_date',
  النفاذ: 'expiry_date',

  purchase_price: 'purchase_price',
  purchase_price_iqd: 'purchase_price',
  purchase_cost_iqd: 'purchase_price',
  cost_price: 'purchase_price',
  cost: 'purchase_price',
  سعر_الشراء: 'purchase_price',
  سعر_الكلفة: 'purchase_price',
  الكلفة: 'purchase_price',
};

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

const DOSAGE_FORM_ALIASES: Record<string, DosageForm> = {
  tablet: 'tablet',
  tablets: 'tablet',
  tab: 'tablet',
  tabs: 'tablet',
  قرص: 'tablet',
  اقراص: 'tablet',
  أقراص: 'tablet',
  حبة: 'tablet',
  حبوب: 'tablet',
  capsule: 'capsule',
  capsules: 'capsule',
  cap: 'capsule',
  caps: 'capsule',
  كبسول: 'capsule',
  كبسولة: 'capsule',
  كبسولات: 'capsule',
  syrup: 'syrup',
  suspension: 'syrup',
  susp: 'syrup',
  شراب: 'syrup',
  معلق: 'syrup',
  injection: 'injection',
  injectable: 'injection',
  ampoule: 'injection',
  amp: 'injection',
  vial: 'injection',
  حقن: 'injection',
  حقنة: 'injection',
  امبول: 'injection',
  فيال: 'injection',
  cream: 'cream',
  ointment: 'cream',
  gel: 'cream',
  كريم: 'cream',
  مرهم: 'cream',
  جل: 'cream',
  drops: 'drops',
  drop: 'drops',
  eye_drops: 'drops',
  قطرة: 'drops',
  قطرات: 'drops',
  inhaler: 'inhaler',
  spray: 'inhaler',
  بخاخ: 'inhaler',
  استنشاق: 'inhaler',
  suppository: 'suppository',
  supp: 'suppository',
  تحميلة: 'suppository',
  تحاميل: 'suppository',
  powder: 'powder',
  sachet: 'powder',
  مسحوق: 'powder',
  باودر: 'powder',
  اكياس: 'powder',
  other: 'other',
  اخرى: 'other',
  أخرى: 'other',
};

function normalizeHeaderToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-./()]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeCanonicalIdentityParts(input: {
  activeIngredient: string;
  strength: string;
  dosageForm: string;
  packSize: string;
}): string {
  const norm = (val: string) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  return `${norm(input.activeIngredient)}|${norm(input.strength)}|${norm(input.dosageForm)}|${norm(input.packSize)}`;
}

export function normalizeDosageFormInput(raw: string): DosageForm | null {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!cleaned) return null;
  if (VALID_DOSAGE_FORMS.has(cleaned as DosageForm)) {
    return cleaned as DosageForm;
  }
  return DOSAGE_FORM_ALIASES[cleaned] || null;
}

export function parseBooleanInput(raw: unknown, defaultValue = false): boolean {
  if (typeof raw === 'boolean') return raw;
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return defaultValue;
  if (['true', '1', 'yes', 'y', 'rx', 'نعم', 'بوصفة', 'مطلوب'].includes(text)) return true;
  if (['false', '0', 'no', 'n', 'otc', 'لا', 'بدون'].includes(text)) return false;
  return defaultValue;
}

export function parseFiniteNumberInput(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function normalizeExpiryDateInput(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 90000) {
    // Excel serial date epoch (1899-12-30)
    const epochMs = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400000;
    return new Date(epochMs).toISOString().slice(0, 10);
  }
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const dt = new Date(`${text}T00:00:00Z`);
    if (!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === text) {
      return text;
    }
    return null;
  }
  // Support YYYY/MM/DD
  const ymdSlash = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (ymdSlash) {
    const candidate = `${ymdSlash[1]}-${ymdSlash[2].padStart(2, '0')}-${ymdSlash[3].padStart(2, '0')}`;
    const dt = new Date(`${candidate}T00:00:00Z`);
    if (!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === candidate) {
      return candidate;
    }
    return null;
  }
  // Support DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const candidate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dt = new Date(`${candidate}T00:00:00Z`);
      if (!Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === candidate) {
        return candidate;
      }
    }
    return null;
  }
  // Support numeric Excel string
  if (/^\d{5}$/.test(text)) {
    const serial = Number(text);
    if (serial > 20000 && serial < 90000) {
      const epochMs = Date.UTC(1899, 11, 30) + serial * 86400000;
      return new Date(epochMs).toISOString().slice(0, 10);
    }
  }
  return null;
}

export function inferColumnMapping(
  headers: string[],
  portalType: BulkImportPortalType,
): BulkImportColumnMapping {
  const mapping: BulkImportColumnMapping = {};
  const usedFields = new Set<BulkImportCanonicalField>();

  for (const header of headers) {
    const token = normalizeHeaderToken(header);
    if (!token) continue;
    let candidate = HEADER_SYNONYMS[token];
    if (candidate === 'retail_price' && portalType === 'wholesaler' && token === 'price') {
      candidate = 'wholesale_price';
    }
    if (candidate && !usedFields.has(candidate)) {
      mapping[candidate] = header;
      usedFields.add(candidate);
    }
  }

  return mapping;
}

export function buildBulkImportTemplateWorkbook(portalType: BulkImportPortalType): Buffer {
  const columns =
    portalType === 'pharmacy' ? PHARMACY_TEMPLATE_COLUMNS : WHOLESALER_TEMPLATE_COLUMNS;

  const sampleRows =
    portalType === 'pharmacy'
      ? [
          [
            '6281000100101',
            'Amoxicillin',
            'Amoxil 500',
            'Amoxicillin trihydrate',
            '500mg',
            'capsule',
            '20 capsules',
            'GSK',
            'UK',
            'true',
            'Antibiotic',
            '',
            '6500',
            '45',
            '10',
            'AMX-2027-A',
            '2027-11-15',
            '4200',
          ],
          [
            '6281000100102',
            'Paracetamol',
            'Panadol Extra',
            'Paracetamol + Caffeine',
            '500mg/65mg',
            'tablet',
            '24 tablets',
            'Haleon',
            'Ireland',
            'false',
            'Analgesic',
            '',
            '3500',
            '120',
            '20',
            'PND-2028-B',
            '2028-04-30',
            '2100',
          ],
        ]
      : [
          [
            '6281000100101',
            'Amoxicillin',
            'Amoxil 500',
            'Amoxicillin trihydrate',
            '500mg',
            'capsule',
            '20 capsules',
            'GSK',
            'UK',
            'true',
            'Antibiotic',
            '',
            '4200',
            '400',
            '5',
            'WH-AMX-2027A',
            '2027-11-15',
            '3600',
          ],
          [
            '6281000100102',
            'Paracetamol',
            'Panadol Extra',
            'Paracetamol + Caffeine',
            '500mg/65mg',
            'tablet',
            '24 tablets',
            'Haleon',
            'Ireland',
            'false',
            'Analgesic',
            '',
            '2100',
            '800',
            '10',
            'WH-PND-2028B',
            '2028-04-30',
            '1750',
          ],
        ];

  const wb = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([columns, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Medicines_Import');

  const instructionsRows = [
    ['Field', 'Required', 'Format / Allowed Values', 'Notes'],
    ['barcode', 'Recommended', 'Digits/Text (unique per drug)', 'Used for fast exact matching and duplicate conflict detection'],
    ['generic_name', 'Yes', 'Text (e.g. Amoxicillin)', 'Scientific / generic medicine name'],
    ['brand_name', 'Optional', 'Text (e.g. Amoxil 500)', 'Commercial / brand name'],
    ['active_ingredient', 'Optional', 'Text', 'Defaults to generic_name if blank'],
    ['strength', 'Yes', 'Text (e.g. 500mg)', 'Required for canonical catalog exact identity'],
    ['dosage_form', 'Yes', 'tablet, capsule, syrup, injection, cream, drops, inhaler, suppository, powder, other', 'Arabic or English names accepted'],
    ['package_size', 'Yes', 'Text (e.g. 20 capsules)', 'Required for canonical catalog exact identity'],
    ['manufacturer', 'Optional', 'Text', 'Manufacturer company name'],
    ['country', 'Optional', 'Text', 'Country of origin'],
    ['requires_prescription', 'Optional', 'true / false', 'Defaults to false'],
    ['category', 'Optional', 'Text', 'Therapeutic category'],
    ['image_reference', 'Optional', 'URL or asset ref', 'Optional drug image reference'],
    portalType === 'pharmacy'
      ? ['retail_price', 'Yes', 'Positive number (IQD)', 'Patient retail price']
      : ['wholesale_price', 'Yes', 'Positive number (IQD)', 'B2B wholesale price'],
    ['available_quantity', 'Yes for stock', 'Integer >= 0', 'Physical quantity for batch'],
    portalType === 'pharmacy'
      ? ['reorder_level', 'Optional', 'Integer >= 0', 'Low-stock reorder threshold']
      : ['minimum_order_quantity', 'Optional', 'Integer >= 1', 'MOQ for pharmacy supply orders'],
    ['batch_number', 'Yes if qty > 0', 'Text', 'Physical batch/lot number'],
    ['expiry_date', 'Yes if qty > 0', 'YYYY-MM-DD (must be after today)', 'Expired or invalid dates are rejected'],
    ['purchase_price', 'Optional', 'Number >= 0 (IQD)', 'Internal batch cost price'],
  ];
  const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsRows);
  XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return Buffer.from(out);
}

export function detectBulkSourceType(fileName: string, mimeType?: string): BulkImportSourceType {
  const lower = String(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (lower.endsWith('.xlsx') || mime.includes('spreadsheetml')) return 'xlsx';
  if (lower.endsWith('.xls') || mime.includes('ms-excel')) return 'xls';
  if (lower.endsWith('.csv') || mime.includes('csv')) return 'csv';
  if (lower.endsWith('.json') || mime.includes('json')) return 'json';
  if (lower.endsWith('.pdf') || mime.includes('pdf')) return 'pdf_draft';
  throw new Error('UNSUPPORTED_IMPORT_FILE_TYPE');
}

function cleanStringRecord(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const cleanKey = String(key || '').trim();
    if (!cleanKey) continue;
    out[cleanKey] = value === null || value === undefined ? '' : String(value).trim();
  }
  return out;
}

function parsePdfLinesToDraftRows(pagesText: string[]): {
  headers: string[];
  rawRows: Array<Record<string, string>>;
} {
  const allLines = pagesText
    .flatMap((page) => String(page || '').split(/\r?\n/))
    .map((line) => line.replace(/\u0000/g, '').trim())
    .filter((line) => line.length >= 2);

  if (allLines.length === 0) {
    return { headers: [], rawRows: [] };
  }

  const splitLine = (line: string): string[] => {
    if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
    if (line.includes('|')) return line.split('|').map((c) => c.trim()).filter((_, idx, arr) => !(idx === 0 && !arr[0]) && !(idx === arr.length - 1 && !arr[arr.length - 1]));
    if (line.includes(';')) return line.split(';').map((c) => c.trim());
    if ((line.match(/,/g) || []).length >= 3) return line.split(',').map((c) => c.trim());
    return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  };

  let headerIdx = -1;
  let detectedHeaders: string[] = [];
  for (let i = 0; i < Math.min(allLines.length, 25); i += 1) {
    const cols = splitLine(allLines[i]);
    if (cols.length >= 3) {
      const matchedCount = cols.filter((c) => Boolean(HEADER_SYNONYMS[normalizeHeaderToken(c)])).length;
      if (matchedCount >= 2) {
        headerIdx = i;
        detectedHeaders = cols.map((c, idx) => c || `column_${idx + 1}`);
        break;
      }
    }
  }

  if (headerIdx >= 0 && detectedHeaders.length > 0) {
    const rawRows: Array<Record<string, string>> = [];
    for (let i = headerIdx + 1; i < allLines.length; i += 1) {
      const cols = splitLine(allLines[i]);
      if (cols.length === 0) continue;
      // Skip repeated page header lines
      const sameAsHeader =
        cols.length === detectedHeaders.length &&
        cols.every((c, idx) => c.toLowerCase() === detectedHeaders[idx].toLowerCase());
      if (sameAsHeader) continue;

      const row: Record<string, string> = {};
      detectedHeaders.forEach((h, idx) => {
        row[h] = cols[idx] ?? '';
      });
      if (Object.values(row).some((v) => v.length > 0)) {
        rawRows.push(row);
      }
    }
    return { headers: detectedHeaders, rawRows };
  }

  // Fallback heuristic draft extraction when PDF does not have clear tabular header row
  const headers = ['barcode', 'generic_name', 'strength', 'dosage_form', 'package_size', 'retail_price', 'available_quantity', 'batch_number', 'expiry_date'];
  const rawRows: Array<Record<string, string>> = [];
  for (const line of allLines) {
    const cols = splitLine(line);
    const expiryMatch = line.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})\b/);
    const barcodeMatch = line.match(/\b(\d{8,14})\b/);
    const strengthMatch = line.match(/\b(\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|iu|%)(?:\/\d+(?:\.\d+)?\s*(?:mg|ml))?)\b/i);
    if (cols.length >= 3) {
      rawRows.push({
        barcode: barcodeMatch?.[1] || (cols[0] && /^\d{6,14}$/.test(cols[0]) ? cols[0] : ''),
        generic_name: cols[barcodeMatch && cols[0] === barcodeMatch[1] ? 1 : 0] || cols[0] || '',
        strength: strengthMatch?.[1] || cols[2] || '',
        dosage_form: cols.find((c) => Boolean(normalizeDosageFormInput(c))) || 'tablet',
        package_size: cols.find((c) => /(tab|cap|ml|pack|strip|vial|amp)/i.test(c)) || '',
        retail_price: cols[cols.length - 3] && /^\d+(?:\.\d+)?$/.test(cols[cols.length - 3].replace(/,/g, '')) ? cols[cols.length - 3] : '',
        available_quantity: cols[cols.length - 2] && /^\d+$/.test(cols[cols.length - 2]) ? cols[cols.length - 2] : '',
        batch_number: '',
        expiry_date: expiryMatch?.[1] || '',
      });
    } else if (strengthMatch || barcodeMatch || expiryMatch) {
      rawRows.push({
        barcode: barcodeMatch?.[1] || '',
        generic_name: line
          .replace(barcodeMatch?.[0] || '', '')
          .replace(expiryMatch?.[0] || '', '')
          .replace(strengthMatch?.[0] || '', '')
          .trim(),
        strength: strengthMatch?.[1] || '',
        dosage_form: 'tablet',
        package_size: '',
        retail_price: '',
        available_quantity: '',
        batch_number: '',
        expiry_date: expiryMatch?.[1] || '',
      });
    }
  }

  return { headers, rawRows };
}

export async function parseUploadedDrugFile(input: {
  portalType: BulkImportPortalType;
  fileName: string;
  mimeType?: string;
  buffer: Buffer;
  selectedSheet?: string;
}): Promise<{
  sourceType: BulkImportSourceType;
  isPdfDraft: boolean;
  sheetNames: string[];
  selectedSheet: string;
  headers: string[];
  rawRows: Array<Record<string, string>>;
  suggestedMapping: BulkImportColumnMapping;
}> {
  const sourceType = detectBulkSourceType(input.fileName, input.mimeType);

  if (sourceType === 'pdf_draft') {
    const { extractText } = await import('unpdf');
    const extracted = await extractText(new Uint8Array(input.buffer), { mergePages: false });
    const pagesText = Array.isArray(extracted.text)
      ? extracted.text
      : [String(extracted.text || '')];
    const parsed = parsePdfLinesToDraftRows(pagesText);
    const sliced = parsed.rawRows.slice(0, BULK_IMPORT_MAX_ROWS);
    return {
      sourceType: 'pdf_draft',
      isPdfDraft: true,
      sheetNames: ['PDF_Draft_Extraction'],
      selectedSheet: 'PDF_Draft_Extraction',
      headers: parsed.headers,
      rawRows: sliced,
      suggestedMapping: inferColumnMapping(parsed.headers, input.portalType),
    };
  }

  if (sourceType === 'json') {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(input.buffer.toString('utf8').replace(/^\uFEFF/, ''));
    } catch {
      throw new Error('INVALID_JSON_IMPORT_FILE');
    }
    const list: unknown[] = Array.isArray(parsedJson)
      ? parsedJson
      : parsedJson && typeof parsedJson === 'object'
        ? Array.isArray((parsedJson as Record<string, unknown>).rows)
          ? ((parsedJson as Record<string, unknown>).rows as unknown[])
          : Array.isArray((parsedJson as Record<string, unknown>).medicines)
            ? ((parsedJson as Record<string, unknown>).medicines as unknown[])
            : Array.isArray((parsedJson as Record<string, unknown>).products)
              ? ((parsedJson as Record<string, unknown>).products as unknown[])
              : []
        : [];
    const objectRows = list
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
      .slice(0, BULK_IMPORT_MAX_ROWS)
      .map(cleanStringRecord);
    const headerSet = new Set<string>();
    objectRows.forEach((row) => {
      Object.keys(row).forEach((k) => headerSet.add(k));
    });
    const headers = Array.from(headerSet);
    return {
      sourceType: 'json',
      isPdfDraft: false,
      sheetNames: ['JSON_Payload'],
      selectedSheet: 'JSON_Payload',
      headers,
      rawRows: objectRows,
      suggestedMapping: inferColumnMapping(headers, input.portalType),
    };
  }

  // .xlsx, .xls, .csv
  const workbook =
    sourceType === 'csv'
      ? XLSX.read(input.buffer.toString('utf8').replace(/^\uFEFF/, ''), {
          type: 'string',
          raw: false,
        })
      : XLSX.read(input.buffer, {
          type: 'buffer',
          cellDates: false,
          raw: false,
        });

  const sheetNames = workbook.SheetNames.length > 0 ? workbook.SheetNames : ['Sheet1'];
  const selectedSheet =
    input.selectedSheet && sheetNames.includes(input.selectedSheet)
      ? input.selectedSheet
      : sheetNames[0];
  const sheet = workbook.Sheets[selectedSheet];
  if (!sheet) {
    return {
      sourceType,
      isPdfDraft: false,
      sheetNames,
      selectedSheet,
      headers: [],
      rawRows: [],
      suggestedMapping: {},
    };
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (matrix.length === 0) {
    return {
      sourceType,
      isPdfDraft: false,
      sheetNames,
      selectedSheet,
      headers: [],
      rawRows: [],
      suggestedMapping: {},
    };
  }

  const rawHeaders = (matrix[0] || []).map((cell, idx) => {
    const label = String(cell ?? '').trim();
    return label || `column_${idx + 1}`;
  });
  const uniqueHeaders: string[] = [];
  const seenHeaderCounts = new Map<string, number>();
  for (const header of rawHeaders) {
    const count = seenHeaderCounts.get(header) || 0;
    seenHeaderCounts.set(header, count + 1);
    uniqueHeaders.push(count === 0 ? header : `${header}_${count + 1}`);
  }

  const rawRows: Array<Record<string, string>> = [];
  for (let r = 1; r < matrix.length && rawRows.length < BULK_IMPORT_MAX_ROWS; r += 1) {
    const cells = matrix[r] || [];
    const obj: Record<string, string> = {};
    let hasValue = false;
    uniqueHeaders.forEach((header, idx) => {
      const val = cells[idx] === undefined || cells[idx] === null ? '' : String(cells[idx]).trim();
      if (val) hasValue = true;
      obj[header] = val;
    });
    if (hasValue) {
      rawRows.push(obj);
    }
  }

  return {
    sourceType,
    isPdfDraft: false,
    sheetNames,
    selectedSheet,
    headers: uniqueHeaders,
    rawRows,
    suggestedMapping: inferColumnMapping(uniqueHeaders, input.portalType),
  };
}

export interface ExistingFacilityProductSummary {
  productId: string;
  medicineId: string;
  barcode: string;
  scientificName: string;
  activeIngredient: string;
  brandName: string;
  strength: string;
  dosageForm: DosageForm;
  packSize: string;
}

export function validateAndNormalizeImportRows(input: {
  portalType: BulkImportPortalType;
  rawRows: Array<Record<string, unknown>>;
  mapping: BulkImportColumnMapping;
  mode: BulkImportMode;
  todayStr: string;
  canonicalCatalog: CanonicalMedicineRecord[];
  existingProducts: ExistingFacilityProductSummary[];
}): {
  rows: BulkImportNormalizedRow[];
  summary: {
    totalRows: number;
    validRows: number;
    warningRows: number;
    errorRows: number;
  };
} {
  const canonicalByIdentity = new Map<string, CanonicalMedicineRecord>();
  const canonicalByBarcode = new Map<string, CanonicalMedicineRecord>();
  for (const med of input.canonicalCatalog) {
    const key = normalizeCanonicalIdentityParts({
      activeIngredient: med.activeIngredient || med.scientificName,
      strength: med.strength,
      dosageForm: med.dosageForm,
      packSize: med.packSize,
    });
    if (!canonicalByIdentity.has(key)) {
      canonicalByIdentity.set(key, med);
    }
    if (med.barcode && med.barcode.trim()) {
      canonicalByBarcode.set(med.barcode.trim().toLowerCase(), med);
    }
  }

  const productByBarcode = new Map<string, ExistingFacilityProductSummary>();
  const productByIdentity = new Map<string, ExistingFacilityProductSummary>();
  for (const prod of input.existingProducts) {
    if (prod.barcode && prod.barcode.trim()) {
      productByBarcode.set(prod.barcode.trim().toLowerCase(), prod);
    }
    const key = normalizeCanonicalIdentityParts({
      activeIngredient: prod.activeIngredient || prod.scientificName,
      strength: prod.strength,
      dosageForm: prod.dosageForm,
      packSize: prod.packSize,
    });
    if (!productByIdentity.has(key)) {
      productByIdentity.set(key, prod);
    }
  }

  const readMappedCell = (
    raw: Record<string, unknown>,
    field: BulkImportCanonicalField,
  ): string => {
    const mappedCol = input.mapping[field];
    if (mappedCol && raw[mappedCol] !== undefined && raw[mappedCol] !== null) {
      return String(raw[mappedCol]).trim();
    }
    // Also support direct canonical field keys when pre-edited rows are re-validated in UI/tests
    if (raw[field] !== undefined && raw[field] !== null) {
      return String(raw[field]).trim();
    }
    return '';
  };

  const seenFileBarcodes = new Map<string, number>();
  const seenFileIdentities = new Map<string, { rowIndex: number; batchNumber: string }>();

  const normalizedRows: BulkImportNormalizedRow[] = input.rawRows.map((raw, idx) => {
    const rowIndex = idx + 1;
    const errors: string[] = [];
    const warnings: string[] = [];

    const barcode = readMappedCell(raw, 'barcode');
    const barcodeLower = barcode.toLowerCase();
    let genericName = readMappedCell(raw, 'generic_name');
    const brandName = readMappedCell(raw, 'brand_name');
    let activeIngredient = readMappedCell(raw, 'active_ingredient') || genericName;
    let strength = readMappedCell(raw, 'strength');
    const rawDosageForm = readMappedCell(raw, 'dosage_form');
    let dosageForm: DosageForm = normalizeDosageFormInput(rawDosageForm) || 'tablet';
    let packageSize = readMappedCell(raw, 'package_size');
    const manufacturer = readMappedCell(raw, 'manufacturer');
    const country = readMappedCell(raw, 'country');
    const requiresPrescription = parseBooleanInput(
      readMappedCell(raw, 'requires_prescription'),
      false,
    );
    const category = readMappedCell(raw, 'category') || 'General';
    const imageReference = readMappedCell(raw, 'image_reference');

    const retailPriceRaw = readMappedCell(raw, 'retail_price');
    const wholesalePriceRaw = readMappedCell(raw, 'wholesale_price');
    const qtyRaw = readMappedCell(raw, 'available_quantity');
    const reorderRaw = readMappedCell(raw, 'reorder_level');
    const moqRaw = readMappedCell(raw, 'minimum_order_quantity');
    const batchNumber = readMappedCell(raw, 'batch_number');
    const expiryRaw = readMappedCell(raw, 'expiry_date');
    const purchasePriceRaw = readMappedCell(raw, 'purchase_price');

    const retailPrice = parseFiniteNumberInput(retailPriceRaw);
    const wholesalePrice = parseFiniteNumberInput(wholesalePriceRaw);
    const availableQuantity = parseFiniteNumberInput(qtyRaw);
    const reorderLevel = parseFiniteNumberInput(reorderRaw);
    const minimumOrderQuantity = parseFiniteNumberInput(moqRaw);
    const purchasePrice = parseFiniteNumberInput(purchasePriceRaw);
    const normalizedExpiry = expiryRaw ? normalizeExpiryDateInput(expiryRaw) : '';

    // Attempt barcode match against existing product first for update modes or fallback metadata
    const matchedProdByBarcode = barcodeLower ? productByBarcode.get(barcodeLower) : undefined;
    if (matchedProdByBarcode) {
      if (!genericName) genericName = matchedProdByBarcode.scientificName;
      if (!activeIngredient) activeIngredient = matchedProdByBarcode.activeIngredient;
      if (!strength) strength = matchedProdByBarcode.strength;
      if (!rawDosageForm) dosageForm = matchedProdByBarcode.dosageForm;
      if (!packageSize) packageSize = matchedProdByBarcode.packSize;
    }

    if (rawDosageForm && !normalizeDosageFormInput(rawDosageForm)) {
      errors.push(`Invalid dosage form: "${rawDosageForm}"`);
    }

    const identityKey =
      activeIngredient && strength && packageSize
        ? normalizeCanonicalIdentityParts({
            activeIngredient,
            strength,
            dosageForm,
            packSize: packageSize,
          })
        : '';

    const matchedProdByIdentity = identityKey ? productByIdentity.get(identityKey) : undefined;
    const existingMatchedProduct = matchedProdByBarcode || matchedProdByIdentity || null;

    // Database barcode conflict check (same barcode pointing to a DIFFERENT drug identity)
    if (barcodeLower && matchedProdByBarcode && identityKey) {
      const prodIdentityKey = normalizeCanonicalIdentityParts({
        activeIngredient: matchedProdByBarcode.activeIngredient || matchedProdByBarcode.scientificName,
        strength: matchedProdByBarcode.strength,
        dosageForm: matchedProdByBarcode.dosageForm,
        packSize: matchedProdByBarcode.packSize,
      });
      if (prodIdentityKey !== identityKey) {
        errors.push(`Barcode "${barcode}" already belongs to a different product in your catalog (${matchedProdByBarcode.scientificName} ${matchedProdByBarcode.strength})`);
      }
    }

    const matchedCanonicalByBarcode = barcodeLower ? canonicalByBarcode.get(barcodeLower) : undefined;
    const matchedCanonicalByIdentity = identityKey ? canonicalByIdentity.get(identityKey) : undefined;
    if (barcodeLower && matchedCanonicalByBarcode && identityKey) {
      const canonKey = normalizeCanonicalIdentityParts({
        activeIngredient: matchedCanonicalByBarcode.activeIngredient || matchedCanonicalByBarcode.scientificName,
        strength: matchedCanonicalByBarcode.strength,
        dosageForm: matchedCanonicalByBarcode.dosageForm,
        packSize: matchedCanonicalByBarcode.packSize,
      });
      if (canonKey !== identityKey) {
        errors.push(`Barcode "${barcode}" conflicts with canonical drug "${matchedCanonicalByBarcode.scientificName} ${matchedCanonicalByBarcode.strength}"`);
      }
    }

    // In-file duplicate checks
    if (barcodeLower) {
      const prevBarcodeRow = seenFileBarcodes.get(barcodeLower);
      if (prevBarcodeRow !== undefined) {
        if (input.mode !== 'quantity_batch_update_only') {
          errors.push(`Duplicate barcode "${barcode}" in file (also on row #${prevBarcodeRow})`);
        } else {
          const prevSeen = identityKey ? seenFileIdentities.get(identityKey) : undefined;
          if (prevSeen && prevSeen.batchNumber === batchNumber) {
            errors.push(`Duplicate barcode + batch "${barcode}" / "${batchNumber}" on row #${prevSeen.rowIndex}`);
          }
        }
      } else {
        seenFileBarcodes.set(barcodeLower, rowIndex);
      }
    }

    if (identityKey) {
      const prevId = seenFileIdentities.get(identityKey);
      if (prevId) {
        if (!batchNumber || prevId.batchNumber.toLowerCase() === batchNumber.toLowerCase()) {
          errors.push(`Duplicate drug identity + batch in file (also on row #${prevId.rowIndex})`);
        } else {
          warnings.push(`Multiple batches in file for same medicine (row #${prevId.rowIndex})`);
        }
      } else {
        seenFileIdentities.set(identityKey, { rowIndex, batchNumber });
      }
    }

    // Mode-specific required fields
    if (input.mode === 'full_catalog_and_batches') {
      if (!genericName) errors.push('Missing generic/scientific medicine name');
      if (!strength) errors.push('Missing strength (e.g. 500mg)');
      if (!packageSize) errors.push('Missing package size (e.g. 20 tablets)');

      if (input.portalType === 'pharmacy') {
        if (retailPrice === null || retailPrice <= 0) {
          errors.push('Retail price must be a positive number (IQD)');
        }
      } else {
        if (wholesalePrice === null || wholesalePrice <= 0) {
          errors.push('Wholesale price must be a positive number (IQD)');
        }
      }
    } else if (input.mode === 'price_update_only') {
      if (!existingMatchedProduct) {
        errors.push('Existing product not found by barcode or exact canonical identity for price update');
      }
      if (input.portalType === 'pharmacy') {
        if (retailPrice === null || retailPrice <= 0) {
          errors.push('New retail price must be a positive number');
        }
      } else {
        if (wholesalePrice === null || wholesalePrice <= 0) {
          errors.push('New wholesale price must be a positive number');
        }
      }
    } else if (input.mode === 'quantity_batch_update_only') {
      if (!existingMatchedProduct) {
        errors.push('Existing product not found by barcode or exact canonical identity for batch/stock update');
      }
      if (availableQuantity === null || availableQuantity <= 0) {
        errors.push('Available quantity must be greater than 0 for batch stock addition');
      }
      if (!batchNumber) {
        errors.push('Batch number is required for batch stock update');
      }
    }

    // Numeric & Batch safety validation across modes
    if (availableQuantity !== null && availableQuantity < 0) {
      errors.push('Negative stock quantities are rejected');
    }
    if (reorderLevel !== null && reorderLevel < 0) {
      errors.push('Reorder level cannot be negative');
    }
    if (minimumOrderQuantity !== null && minimumOrderQuantity < 1) {
      errors.push('Minimum order quantity must be >= 1');
    }
    if (purchasePrice !== null && purchasePrice < 0) {
      errors.push('Purchase price cannot be negative');
    }

    if (expiryRaw && !normalizedExpiry) {
      errors.push(`Invalid expiry date format "${expiryRaw}" (expected YYYY-MM-DD)`);
    }
    if (normalizedExpiry && normalizedExpiry <= input.todayStr) {
      errors.push(`Expired or today-expiring batch rejected (${normalizedExpiry} <= ${input.todayStr})`);
    }

    const hasBatchIntent =
      (availableQuantity !== null && availableQuantity > 0) ||
      Boolean(batchNumber) ||
      Boolean(expiryRaw);
    if (input.mode !== 'price_update_only' && hasBatchIntent) {
      if (!batchNumber) {
        errors.push('Missing batch number for stock batch');
      }
      if (!normalizedExpiry) {
        errors.push('Missing or invalid expiry date for stock batch (YYYY-MM-DD)');
      }
      if (availableQuantity === null || availableQuantity < 0) {
        errors.push('Invalid available quantity for stock batch');
      }
    }

    if (!barcode && input.mode === 'full_catalog_and_batches') {
      warnings.push('No barcode provided; matched strictly by canonical identity');
    }

    const matchedCanonical = matchedCanonicalByIdentity || matchedCanonicalByBarcode || null;
    if (!matchedCanonical && input.mode === 'full_catalog_and_batches' && genericName && strength && packageSize) {
      warnings.push('New canonical drug identity will be created in medora_medicines as pending review');
    }

    const status: BulkImportNormalizedRow['status'] =
      errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid';

    const cleanRaw: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      cleanRaw[k] = v === null || v === undefined ? '' : String(v);
    }

    return {
      rowIndex,
      barcode,
      genericName,
      brandName: brandName || genericName,
      activeIngredient,
      strength,
      dosageForm,
      packageSize,
      manufacturer,
      country,
      requiresPrescription,
      category,
      imageReference,
      retailPrice,
      wholesalePrice,
      availableQuantity,
      reorderLevel,
      minimumOrderQuantity,
      batchNumber,
      expiryDate: normalizedExpiry || '',
      purchasePrice,
      status,
      errors,
      warnings,
      matchedCanonicalMedicineId: matchedCanonical?.medicineId || existingMatchedProduct?.medicineId || null,
      willCreateCanonicalDraft: Boolean(!matchedCanonical && !existingMatchedProduct && input.mode === 'full_catalog_and_batches'),
      willCreateProduct: Boolean(!existingMatchedProduct && input.mode === 'full_catalog_and_batches'),
      willUpdateProductId: existingMatchedProduct?.productId || null,
      rawRow: cleanRaw,
    };
  });

  return {
    rows: normalizedRows,
    summary: {
      totalRows: normalizedRows.length,
      validRows: normalizedRows.filter((r) => r.status === 'valid').length,
      warningRows: normalizedRows.filter((r) => r.status === 'warning').length,
      errorRows: normalizedRows.filter((r) => r.status === 'error').length,
    },
  };
}
