import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  HaneenCitation,
  HaneenDetailLevel,
  HaneenDialectMode,
  HaneenGlossaryEntry,
  HaneenKnowledgeSource,
  HaneenKnowledgeTopic,
} from '../src/types/haneen.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'aistudio');

interface KnowledgeSeedMeta {
  sourceId: string;
  code: string;
  filename: string;
  titleAr: string;
  titleEn: string;
  authority: string;
  sourceUrl: string;
  relatedUrls: Array<{ label: string; url: string }>;
  publishedAt: string;
  lastReviewedAt: string;
  version: string;
  keywords: string[];
}

// Strictly ONLY medical knowledge files 01..04.
// Files 00_README_AR and 05_HANEEN_AI_STUDIO_BUILD_PROMPT_AR are explicitly excluded.
const KNOWLEDGE_SEED_SPECS: KnowledgeSeedMeta[] = [
  {
    sourceId: 'haneen_src_01',
    code: '01',
    filename: '01_HANEEN_Lab_Results_Foundation_AR_fda6cfeb.txt',
    titleAr: 'الأساسيات الآمنة لفهم نتائج التحاليل الطبية',
    titleEn: 'MedlinePlus: How to Understand Your Lab Results',
    authority: 'MedlinePlus (National Library of Medicine)',
    sourceUrl: 'https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/',
    relatedUrls: [
      {
        label: 'MedlinePlus – How to Understand Your Lab Results',
        url: 'https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/',
      },
      {
        label: 'MedlinePlus – Medical Tests',
        url: 'https://medlineplus.gov/lab-tests/',
      },
    ],
    publishedAt: '2026-11-16',
    lastReviewedAt: '2026-11-16',
    version: '1.0.0',
    keywords: [
      'تحليل',
      'نتائج',
      'نتيجة',
      'مدى',
      'مرجعي',
      'معدل',
      'طبيعي',
      'وحدة',
      'مرتفع',
      'عالي',
      'طالع',
      'منخفض',
      'نازل',
      'ناصي',
      'ناقص',
      'إيجابي',
      'سلبي',
      'حدي',
      'غير حاسم',
      'صيام',
      'صايم',
      'حامل',
      'طفل',
      'أطفال',
      'مقارنة',
      'مختبر',
      'reference range',
      'high',
      'low',
      'positive',
      'negative',
      'borderline',
      'inconclusive',
      'unit',
      'mg/dl',
      'mmol/l',
      'lab',
    ],
  },
  {
    sourceId: 'haneen_src_02',
    code: '02',
    filename: '02_HANEEN_Common_Lab_Tests_AR_f366f2a2.txt',
    titleAr: 'مقدمة مبسطة عن التحاليل الشائعة (CBC, CMP, Urinalysis, HbA1c)',
    titleEn: 'MedlinePlus: Common Lab Tests (CBC, CMP, Urinalysis, A1C)',
    authority: 'MedlinePlus (National Library of Medicine)',
    sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/',
    relatedUrls: [
      {
        label: 'MedlinePlus – Complete Blood Count (CBC)',
        url: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/',
      },
      {
        label: 'MedlinePlus – Comprehensive Metabolic Panel (CMP)',
        url: 'https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/',
      },
      {
        label: 'MedlinePlus – Urinalysis',
        url: 'https://medlineplus.gov/urinalysis.html',
      },
      {
        label: 'MedlinePlus – A1C',
        url: 'https://medlineplus.gov/a1c.html',
      },
    ],
    publishedAt: '2026-11-16',
    lastReviewedAt: '2026-11-16',
    version: '1.0.0',
    keywords: [
      'cbc',
      'تعداد الدم',
      'صورة الدم',
      'دم',
      'دمي ناقص',
      'فقر دم',
      'قوة دم',
      'rbc',
      'wbc',
      'platelets',
      'صفائح',
      'hemoglobin',
      'هيموغلوبين',
      'هيموجلوبين',
      'hb',
      'hgb',
      'hematocrit',
      'هيماتوكريت',
      'mcv',
      'cmp',
      'كيمياء',
      'وظائف الكبد',
      'وظائف الكلى',
      'كلى',
      'كبد',
      'صفار',
      'alt',
      'ast',
      'alp',
      'bilirubin',
      'creatinine',
      'كرياتينين',
      'bun',
      'يوريا',
      'sodium',
      'potassium',
      'calcium',
      'albumin',
      'glucose',
      'غلوكوز',
      'سكر',
      'urinalysis',
      'تحليل البول',
      'ادرار',
      'إدرار',
      'بول',
      'hba1c',
      'a1c',
      'تراكمي',
      'سكر تراكمي',
      'nitrite',
      'ketones',
      'ph',
    ],
  },
  {
    sourceId: 'haneen_src_03',
    code: '03',
    filename: '03_HANEEN_General_Health_Education_AR_8b68d6dc.txt',
    titleAr: 'مبادئ التثقيف الصحي والغذاء الصحي',
    titleEn: 'WHO: Healthy Diet & General Health Education',
    authority: 'World Health Organization (WHO)',
    sourceUrl: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
    relatedUrls: [
      {
        label: 'World Health Organization (WHO) – Healthy diet (26 January 2026)',
        url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
      },
    ],
    publishedAt: '2026-01-26',
    lastReviewedAt: '2026-11-16',
    version: '1.0.0',
    keywords: [
      'غذاء',
      'تغذية',
      'أكل',
      'اكل',
      'طعام',
      'حمية',
      'دايت',
      'ريجيم',
      'ملح',
      'صوديوم',
      'سكريات',
      'دهون',
      'خضروات',
      'فواكه',
      'بقوليات',
      'حبوب كاملة',
      'تثقيف صحي',
      'وقاية',
      'وزن',
      'خمول',
      'تعب',
      'diet',
      'nutrition',
      'healthy',
      'who',
      'salt',
      'sugar',
      'fat',
    ],
  },
  {
    sourceId: 'haneen_src_04',
    code: '04',
    filename: '04_HANEEN_Emergency_Warning_Signs_AR_fccc04f8.txt',
    titleAr: 'علامات التحذير التي تستدعي رعاية طبية عاجلة',
    titleEn: 'MedlinePlus & WHO: Emergency Warning Signs & Sepsis',
    authority: 'MedlinePlus & World Health Organization (WHO)',
    sourceUrl: 'https://medlineplus.gov/ency/article/001927.htm',
    relatedUrls: [
      {
        label: 'MedlinePlus – Recognizing Medical Emergencies',
        url: 'https://medlineplus.gov/ency/article/001927.htm',
      },
      {
        label: 'MedlinePlus – When to Use the Emergency Room (Adult)',
        url: 'https://medlineplus.gov/ency/patientinstructions/000593.htm',
      },
      {
        label: 'MedlinePlus – Stroke',
        url: 'https://medlineplus.gov/stroke.html',
      },
      {
        label: 'WHO – Sepsis',
        url: 'https://www.who.int/news-room/fact-sheets/detail/sepsis',
      },
    ],
    publishedAt: '2026-11-16',
    lastReviewedAt: '2026-11-16',
    version: '1.0.0',
    keywords: [
      'طوارئ',
      'خطر',
      'تحذير',
      'ألم صدر',
      'وجع صدر',
      'ضيق تنفس',
      'صعوبة تنفس',
      'ما اكدر اتنفس',
      'نزيف',
      'فقدان الوعي',
      'إغماء',
      'سكتة',
      'تشنج',
      'نوبة',
      'إنتان',
      'تعفن الدم',
      'تسمم',
      'emergency',
      'chest pain',
      'breathing',
      'stroke',
      'sepsis',
      'bleeding',
      'seizure',
    ],
  },
];

export function loadDefaultKnowledgeSources(): HaneenKnowledgeSource[] {
  const nowIso = new Date().toISOString();
  return KNOWLEDGE_SEED_SPECS.map((spec) => {
    const filePath = path.join(KNOWLEDGE_DIR, spec.filename);
    let content = '';
    try {
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch (err) {
      console.warn(`[MEDORA][HANEEN] Could not read knowledge file ${spec.filename}:`, err);
    }

    return {
      sourceId: spec.sourceId,
      code: spec.code,
      titleAr: spec.titleAr,
      titleEn: spec.titleEn,
      authority: spec.authority,
      sourceUrl: spec.sourceUrl,
      relatedUrls: spec.relatedUrls,
      publishedAt: spec.publishedAt,
      lastReviewedAt: spec.lastReviewedAt,
      version: spec.version,
      enabled: true,
      keywords: spec.keywords,
      content,
      originFile: spec.filename,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });
}

/**
 * Normalizes Arabic / Iraqi colloquial text and tolerates common spelling typos
 * (alef variants, teh marbuta, alef maqsura, Persian/Iraqi letters گ چ پ ڤ, diacritics, elongation).
 */
export function normalizeIraqiText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/گ/g, 'ك')
    .replace(/چ/g, 'ج')
    .replace(/پ/g, 'ب')
    .replace(/ڤ/g, 'ف')
    .replace(/(.)\1{2,}/g, '$1$1') // collapse excessive letter repeats e.g. تعبببان -> تعببان
    .replace(/\s+/g, ' ')
    .trim();
}

const IRAQI_SYNONYM_MAP: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /(هموكلوبين|هيموجلوبين|همغلوبين|هيموكلوبين|خضاب)/g, canonical: 'هيموغلوبين hemoglobin hb' },
  { pattern: /(دمي ناقص|دم ناقص|قوه دم|فقر دم|انيميا|شحوب)/g, canonical: 'هيموغلوبين hemoglobin cbc فقر دم' },
  { pattern: /(تراكمي|مخزون السكر|خزان السكر|اي وان سي)/g, canonical: 'hba1c سكر تراكمي glucose' },
  { pattern: /(ادرار|الادرار|بول|حرقه بالادرار|مجاري بوليه)/g, canonical: 'urinalysis تحليل البول' },
  { pattern: /(كليتي|كلى|كليه|كرياتنين|كرياتين|يوريا|املاح)/g, canonical: 'creatinine bun وظائف الكلى cmp' },
  { pattern: /(كبد|صفار|ابو صفار|انزيمات الكبد)/g, canonical: 'alt ast bilirubin وظائف الكبد cmp' },
  { pattern: /(سي بي سي|سبيسي|صوره دم|تعداد دم)/g, canonical: 'cbc تعداد الدم الكامل' },
  { pattern: /(طالع عالي|طالع ناصي|عالي بالتحليل|نازل بالتحليل|خارج المعدل|فوك المعدل|جوه المعدل)/g, canonical: 'مدى مرجعي مرتفع منخفض reference range' },
  { pattern: /(صايم|صيام|اكل قبل التحليل)/g, canonical: 'صيام تحضير عوامل تؤثر في النتيجة' },
  { pattern: /(دايت|ريجيم|اكل صحي|تغذيه|نظام غذائي)/g, canonical: 'غذاء صحي منظمة الصحة العالمية who healthy diet' },
  { pattern: /(خمول|تعبان|مالي خلق|جسمي مكسر|دوخه|دوار)/g, canonical: 'تعب خمول هيموغلوبين cbc تحاليل' },
  { pattern: /(فيريتين|فرينين|فرتين|مخزون الحديد|حديد)/g, canonical: 'ferritin حديد هيموغلوبين' },
  { pattern: /(فيتامين دي|فيتامين د|فتامين د)/g, canonical: 'vitamin d فيتامين د' },
  { pattern: /(غده درقيه|غده|خمول غده|نشاط غده)/g, canonical: 'tsh thyroid غدة درقية' },
  { pattern: /(رنين|ام ار اي|غضروف|ديسك|انزلاق)/g, canonical: 'mri رنين مغناطيسي انزلاق غضروفي' },
  { pattern: /(مفراس|سي تي|تصوير مقطعي|صبغه)/g, canonical: 'ct scan مفراس صبغة' },
  { pattern: /(سونار|اشعه صوتيه|دوبلر)/g, canonical: 'ultrasound doppler سونار دوبلر' },
  { pattern: /(كولسترول|كوليسترول|دهون ثلاثيه|شحوم)/g, canonical: 'cholesterol ldl hdl triglycerides دهون' },
];

export function expandIraqiColloquialTerms(normalizedText: string): string {
  const extras: string[] = [];
  for (const item of IRAQI_SYNONYM_MAP) {
    if (item.pattern.test(normalizedText)) {
      extras.push(item.canonical);
    }
  }
  return extras.length > 0 ? `${normalizedText} ${extras.join(' ')}` : normalizedText;
}

export function detectRequestedDetailLevel(
  text: string,
  previousLevel?: HaneenDetailLevel,
): { level: HaneenDetailLevel; isFollowUpExpansion: boolean } {
  const norm = normalizeIraqiText(text);
  const wantsCompact = /(باختصار|اختصر|مختصر|لخص|تلخيص|الخلاصه|سريع|short|brief|summary)/i.test(norm);
  if (wantsCompact) {
    return { level: 'brief', isFollowUpExpansion: false };
  }

  const wantsDetailed =
    /(بالتفصيل|تفاصيل اكثر|توضيح اكثر|شرح.*اكثر|اشرح.*اكثر|فصل.*اكثر|وضح.*اكثر|زيد.*شرح|ما فهمت|مفهمت|ابغى اكثر|اريد اكثر|كمل الشرح|احكيلي اكثر|سولفلي اكثر|explain more|more details|detailed)/i.test(
      norm,
    );

  if (wantsDetailed) {
    if (previousLevel === 'brief' && !/(بالتفصيل|detailed|مفصل)/i.test(norm)) {
      return { level: 'standard', isFollowUpExpansion: true };
    }
    return { level: 'detailed', isFollowUpExpansion: true };
  }

  return { level: 'brief', isFollowUpExpansion: false };
}

const EMERGENCY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'chest_pain',
    regex:
      /(الم\s*(شديد|مفاجي|قوي|حارق|ضاغط|كلش)?\s*(في|ب|بال)?\s*الصدر|ضغط\s*(في|علي|ب)?\s*الصدر|وجع\s*(في|ب)?\s*(ال)?صدر(\s*قوي|\s*شديد|\s*كلش)?|صدري\s*يوجعني\s*(كلش|هواي|شديد)|ذبحه|ازمه\s*قلبيه|severe chest pain|chest pressure|chest tightness|heart attack)/i,
  },
  {
    label: 'breathing_difficulty',
    regex:
      /(صعوبه\s*(شديده|مفاجيه)?\s*(في)?\s*التنفس|ضيق\s*(شديد|مفاجي|قوي)?\s*(في|ب)?\s*(ال)?تنفس|ضيق\s*نفس\s*(شديد|قوي|مفاجي)|اختناق|كاعد\s*يختنك|اختنك|ما\s*اكدر\s*اتنفس|مكدر\s*اتنفس|لا\s*(ا|ي|ت)ستطيع\s*التنفس|can'?t breathe|difficulty breathing|shortness of breath|severe dyspnea)/i,
  },
  {
    label: 'stroke_signs',
    regex:
      /(تدلي\s*(ال)?وجه|ميلان\s*(ال)?فم|انحراف\s*(ال)?وجه|ثقل\s*(ال)?لسان|اضطراب\s*(ال)?كلام|تلعثم\s*مفاجي|ضعف\s*مفاجي\s*(في)?\s*(جهه|جانب|نصف)|خدر\s*مفاجي\s*(في)?\s*(جهه|جانب|نصف)|شلل\s*مفاجي|سكته\s*دماغيه|جلطه\s*دماغيه|face drooping|slurred speech|sudden weakness|one side|stroke)/i,
  },
  {
    label: 'unconsciousness',
    regex:
      /(فقدان\s*(ال)?وعي|فاقد\s*(ال)?وعي|اغمي\s*عليه|اغماء|وكع\s*من\s*طوله|غيبوبه|صعوبه\s*ايقاظ|لا\s*يستجيب|ما\s*يرد|ارتباك\s*شديد\s*مفاجي|unconscious|passed out|fainted|unresponsive)/i,
  },
  {
    label: 'severe_bleeding',
    regex:
      /(نزيف\s*(شديد|غزير|مستمر|قوي|ما\s*يوكف|لا\s*يتوقف)|ينزف\s*(بشده|هواي|قوي)|قيء\s*دم|تقيؤ\s*دم|يزوع\s*دم|severe bleeding|uncontrolled bleeding|coughing blood|vomiting blood)/i,
  },
  {
    label: 'seizure',
    regex: /(تشنج|تشنجات|نوبه\s*صرع|اختلاج|seizure|convulsion)/i,
  },
  {
    label: 'poisoning_overdose',
    regex: /(تسمم|ابتلع\s*سم|جرعه\s*زايده|شرب\s*ماده\s*كيمياويه|شرب\s*سم|poisoning|overdose)/i,
  },
  {
    label: 'pediatric_danger_or_sepsis',
    regex:
      /(طفل.*(ازرقاق|شحوب\s*شديد|خمول\s*غير\s*معتاد|لا\s*يستيقظ|ما\s*يكعد)|ازرقاق\s*(ال)?شفاه|انتان|تعفن\s*الدم|sepsis|blue lips|cyanosis)/i,
  },
  {
    label: 'severe_allergy_anaphylaxis',
    regex:
      /(حساسيه\s*(شديده|مفرطه|قاتله)|تحسس\s*شديد|تورم\s*(ال)?(لسان|حلق|بلعوم|حنجره)|لساني\s*ورم|حلكي\s*ورم|تورم\s*(ال)?وجه\s*مع\s*ضيق|anaphylaxis|tongue\s*swelling|throat\s*swelling)/i,
  },
  {
    label: 'self_harm_or_crisis',
    regex:
      /(ايذا.?\s*(ال)?نفس|أذي\s*نفسي|اذي\s*نفسي|ايذا.?\s*(ال)?غير|اذي\s*غيري|اذي\s*الاخرين|انتحار|افكار\s*انتحاريه|اقتل\s*نفسي|اموت\s*نفسي|suicid|self[-\s]*harm|harm\s*myself|harm\s*others)/i,
  },
];

export function detectEmergencySymptoms(text: string): {
  isEmergency: boolean;
  matchedTriggers: string[];
} {
  const clean = text.trim();
  if (!clean) {
    return { isEmergency: false, matchedTriggers: [] };
  }
  const normalized = normalizeIraqiText(clean);
  const matched: string[] = [];
  for (const item of EMERGENCY_PATTERNS) {
    if (item.regex.test(normalized) || item.regex.test(clean)) {
      matched.push(item.label);
    }
  }
  return {
    isEmergency: matched.length > 0,
    matchedTriggers: matched,
  };
}

const MEDICATION_DOSAGE_PATTERNS: RegExp[] = [
  /((كم|شكد)\s*(اخذ\s*)?(حبه|حبايه|حبوب|جرعه|وحده|وحدات|دوا|دواء|علاج|انسولين)|شنو\s*جرعه|ما\s*هي\s*جرعه|عدل\s*جرعه|تعديل\s*جرعه|زياده\s*جرعه|تقليل\s*جرعه|خفض\s*جرعه|اوكف\s*(ال)?دوا|اوقف\s*(ال)?دواء|اترك\s*(ال)?دوا|اترك\s*(ال)?علاج|ايقاف\s*(ال)?علاج|اكتبلي\s*(وصفه|دوا|علاج)|اصرفلي\s*(دوا|علاج|مضاد)|(?:اوصفلي|اكتبلي|اقترح\s*لي|شنو\s*اخذ|اي)\s*(?:لي\s*)?(?:دوا|دواء|علاج|مضاد\s*حيوي|انسولين|مسكن|حبوب|حبايه)|جرعه\s*(ال)?انسولين|اغير\s*(ال)?انسولين|كم\s*حبه\s*اخذ|شكد\s*حبايه\s*اخذ)/i,
  /(what\s*dose|change\s*(my)?\s*dose|adjust\s*(my)?\s*dosage|stop\s*taking|prescribe\s*(me)?|which\s*antibiotic|insulin\s*dose|how\s*many\s*mg|should\s*i\s*stop\s*my\s*medication)/i,
];

export function detectMedicationDosageRequest(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  const normalized = normalizeIraqiText(clean);
  return MEDICATION_DOSAGE_PATTERNS.some((re) => re.test(normalized) || re.test(clean));
}

export function detectImagingScanDiagnosisRequest(text: string): boolean {
  const clean = text.trim();
  if (!clean) return false;
  const norm = normalizeIraqiText(clean);
  // Only catch requests asking Haneen to look at / diagnose from an image/scan directly
  // ("شوف الصورة بيها ورم لو كسر لو جلطة؟") rather than explaining a written radiology report phrase
  const asksImageDiagnosis =
    /((هاي\s*)?(صوره|صور)\s*(ال)?(اشعه|رنين|مفراس|سونار|ماموغرام).*(بيها|فيها|اكو|يوجد|هل).*(ورم|سرطان|كسر|جلطه|نزيف|مرض)|شوفلي\s*(صوره|الاشعه|الرنين|المفراس).*(بيها|اكو|ورم|كسر|جلطه)|هل\s*(الاشعه|الرنين|المفراس)\s*(تظهر|فيها|بيها)\s*(ورم|كسر|جلطه)|(does|is)\s*this\s*(x-?ray|mri|ct|scan)\s*show\s*(a\s*)?(tumor|cancer|fracture|clot))/i.test(
      norm,
    );
  const isWrittenReportPhrase = /(تقرير\s*(ال)?(رنين|مفراس|اشعه|سونار)\s*(كاتب|يقول|مكتوب)|مكتوب\s*بالتقرير)/i.test(
    norm,
  );
  return asksImageDiagnosis && !isWrittenReportPhrase;
}

export function toCitation(src: HaneenKnowledgeSource): HaneenCitation {
  return {
    sourceId: src.sourceId,
    code: src.code,
    titleAr: src.titleAr,
    titleEn: src.titleEn,
    authority: src.authority,
    sourceUrl: src.sourceUrl,
    publishedAt: src.publishedAt,
    lastReviewedAt: src.lastReviewedAt,
    version: src.version,
  };
}

interface KnowledgeChunk {
  heading: string;
  body: string;
  normalizedSearchText: string;
}

const sectionIndexCache = new Map<
  string,
  { stamp: string; chunks: KnowledgeChunk[] }
>();

const EDITORIAL_SKIP_HEADINGS = new Set([
  'المصادر',
  'المصدر الاساسي',
  'المصادر الاساسيه',
  'ملاحظه تحريريه',
  'الغرض',
  'تنبيه مهم',
  'قاعده اساسيه',
]);

function splitSourceIntoChunks(src: HaneenKnowledgeSource): KnowledgeChunk[] {
  const stamp = `${src.updatedAt}:${src.version}:${src.content.length}`;
  const cached = sectionIndexCache.get(src.sourceId);
  if (cached && cached.stamp === stamp) {
    return cached.chunks;
  }

  const lines = src.content.split('\n');
  const rawSections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } = { heading: src.titleAr, lines: [] };

  const headerPrefixes = ['حنين الذكية', 'ملف معرفة', 'اللغة:', 'تاريخ إعداد الملف:'];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (headerPrefixes.some((p) => line.startsWith(p))) continue;
    if (line.startsWith('http://') || line.startsWith('https://')) continue;
    if (/^\d+\.\s+(MedlinePlus|World Health)/i.test(line)) continue;

    const isSectionStart = /^\d+\)\s+/.test(line) || EDITORIAL_SKIP_HEADINGS.has(normalizeIraqiText(line));
    if (isSectionStart) {
      if (current.lines.length > 0) {
        rawSections.push(current);
      }
      current = { heading: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    rawSections.push(current);
  }

  const chunks: KnowledgeChunk[] = rawSections
    .filter((sec) => !EDITORIAL_SKIP_HEADINGS.has(normalizeIraqiText(sec.heading)))
    .map((sec) => {
      const body = `${sec.heading}\n${sec.lines.join('\n')}`.trim();
      return {
        heading: sec.heading,
        body,
        normalizedSearchText: normalizeIraqiText(body),
      };
    })
    .filter((c) => c.body.length > 20);

  // Fallback if an admin-added source has no numbered headings
  const finalChunks: KnowledgeChunk[] =
    chunks.length > 0
      ? chunks
      : [
          {
            heading: src.titleAr,
            body: src.content.slice(0, 1600),
            normalizedSearchText: normalizeIraqiText(src.content.slice(0, 1600)),
          },
        ];

  sectionIndexCache.set(src.sourceId, { stamp, chunks: finalChunks });
  return finalChunks;
}

/**
 * Fast, lightweight chunk-based knowledge retrieval:
 * Instead of dumping entire raw files (up to ~20KB+) on every turn, extracts only
 * the top relevant pre-indexed sections so Gemini responds much faster.
 */
export function retrieveRelevantKnowledge(
  sources: HaneenKnowledgeSource[],
  queryText: string,
  maxSources = 3,
  detailLevel: HaneenDetailLevel = 'brief',
  approvedTopics: HaneenKnowledgeTopic[] = [],
  glossary: HaneenGlossaryEntry[] = [],
): {
  matchedSources: HaneenKnowledgeSource[];
  matchedTopics: HaneenKnowledgeTopic[];
  citations: HaneenCitation[];
  contextText: string;
  hit: boolean;
} {
  const enabledSources = sources.filter((s) => s.enabled && s.content.trim().length > 0);
  // Governance rule: ONLY 'approved' topics may ever be retrieved for patient answers!
  const eligibleTopics = approvedTopics.filter((t) => t.status === 'approved');

  const normalizedQuery = expandIraqiColloquialTerms(normalizeIraqiText(queryText));
  const queryTokens = Array.from(
    new Set(
      normalizedQuery
        .split(/[\s،,.;:!?()[\]{}/\\|+-]+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  );

  // 1) Score approved structured library topics
  const scoredTopics = eligibleTopics
    .map((topic) => {
      let score = 0;
      const haystack = normalizeIraqiText(
        [
          topic.titleAr,
          topic.mainSpecialty,
          topic.subSpecialty,
          topic.simpleExplanation,
          topic.whatItMeans,
          ...topic.relatedTests,
          ...topic.relatedSymptoms,
          ...topic.keywords,
        ].join(' '),
      );
      for (const kw of topic.keywords) {
        const nkw = normalizeIraqiText(kw);
        if (nkw && normalizedQuery.includes(nkw)) {
          score += 6;
        }
      }
      for (const token of queryTokens) {
        if (haystack.includes(token)) {
          score += token.length >= 4 ? 2.5 : 1.2;
        }
      }
      return { topic, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  // 2) Match concise Iraqi glossary terms
  const matchedGlossary = glossary
    .filter((g) => {
      const hay = normalizeIraqiText([g.termEn, g.termAr, ...g.aliases].join(' '));
      return g.aliases.some((a) => normalizedQuery.includes(normalizeIraqiText(a))) ||
        queryTokens.some((tok) => tok.length >= 3 && hay.includes(tok));
    })
    .slice(0, 3);

  // 3) Score foundational sources 01..04
  const scoredSources = enabledSources.map((src) => {
    let score = src.code === '01' ? 1 : 0;
    const chunks = splitSourceIntoChunks(src);

    for (const kw of src.keywords || []) {
      const normKw = normalizeIraqiText(kw);
      if (normKw && normalizedQuery.includes(normKw)) {
        score += 5;
      }
    }

    const normTitle = normalizeIraqiText(`${src.titleAr} ${src.titleEn}`);
    for (const token of queryTokens) {
      if (normTitle.includes(token)) {
        score += 3;
      }
    }

    const scoredChunks = chunks.map((chunk, idx) => {
      let cScore = idx === 0 ? 0.5 : 0;
      for (const token of queryTokens) {
        if (chunk.normalizedSearchText.includes(token)) {
          cScore += token.length >= 4 ? 2.5 : 1.5;
        }
      }
      return { chunk, cScore };
    });

    scoredChunks.sort((a, b) => b.cScore - a.cScore);
    const topChunkScore = scoredChunks[0]?.cScore || 0;
    score += topChunkScore * 1.4;

    const maxChunksPerSource = detailLevel === 'detailed' ? 3 : 2;
    const pickedChunks = scoredChunks.slice(0, maxChunksPerSource).map((c) => c.chunk.body);

    return { src, score, pickedChunks };
  });

  scoredSources.sort((a, b) => b.score - a.score);
  const selected = scoredSources.slice(0, maxSources);
  const maxContextChars = detailLevel === 'detailed' ? 3200 : detailLevel === 'standard' ? 2200 : 1500;

  let usedChars = 0;
  const contextBlocks: string[] = [];

  for (const { topic } of scoredTopics) {
    const remaining = maxContextChars - usedChars;
    if (remaining < 180) break;
    const block = [
      `[موضوع مكتبة معتمد | ${topic.titleAr} | ${topic.mainSpecialty} | ${topic.sourceName}]`,
      `التعريف: ${topic.simpleExplanation}`,
      `التوضيح: ${topic.whatItMeans}`,
      topic.patientNeedToKnow ? `مهم للمريض: ${topic.patientNeedToKnow}` : '',
      `متى يراجع الطبيب: ${topic.whenToSeeDoctor}`,
      `ما لا يُفهم تلقائياً: ${topic.whatCannotBeInferred}`,
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, remaining);
    contextBlocks.push(block);
    usedChars += block.length + 7;
  }

  if (matchedGlossary.length > 0 && maxContextChars - usedChars > 140) {
    const glossBlock = `[قاموس مبسط]\n${matchedGlossary
      .map((g) => `• ${g.termAr} (${g.termEn}): ${g.simpleMeaningAr}`)
      .join('\n')}`.slice(0, maxContextChars - usedChars);
    contextBlocks.push(glossBlock);
    usedChars += glossBlock.length + 7;
  }

  for (const item of selected) {
    const remaining = maxContextChars - usedChars;
    if (remaining < 160) break;
    const header = `[مصدر ${item.src.code} | ${item.src.titleAr}]`;
    const bodyBudget = remaining - header.length - 8;
    if (bodyBudget < 90) break;
    const compactBody = item.pickedChunks.join('\n\n').slice(0, bodyBudget);
    const block = `${header}\n${compactBody}`;
    contextBlocks.push(block);
    usedChars += block.length + 7;
  }

  const citations: HaneenCitation[] = [
    ...scoredTopics.map(({ topic }) => ({
      sourceId: topic.topicId,
      code: topic.domain.toUpperCase(),
      titleAr: topic.titleAr,
      titleEn: topic.sourceName,
      authority: topic.publisher,
      sourceUrl: topic.sourceUrl,
      publishedAt: topic.publishedOrUpdatedAt,
      lastReviewedAt: topic.reviewedAt || topic.updatedAt,
      version: topic.version,
    })),
    ...selected.map((s) => toCitation(s.src)),
  ].slice(0, 4);

  const topSourceScore = scoredSources[0]?.score || 0;
  const topTopicScore = scoredTopics[0]?.score || 0;
  const hit = topTopicScore >= 4 || topSourceScore >= 5 || matchedGlossary.length > 0;

  return {
    matchedSources: selected.map((s) => s.src),
    matchedTopics: scoredTopics.map((t) => t.topic),
    citations,
    contextText: contextBlocks.join('\n\n---\n\n'),
    hit,
  };
}

export type HaneenConversationalIntent = 'greeting' | 'thanks' | 'goodbye';

const CONVERSATIONAL_FILLER_WORDS = new Set(
  [
    'مرحبا',
    'اهلا',
    'وسهلا',
    'سهلا',
    'هلو',
    'هلاو',
    'هلا',
    'والله',
    'سلام',
    'عليكم',
    'وعليكم',
    'ورحمه',
    'الله',
    'وبركاته',
    'صباح',
    'مساء',
    'الخير',
    'النور',
    'شلونج',
    'شلونك',
    'شلونكم',
    'شخبارج',
    'شخبارك',
    'شخباركم',
    'كيف',
    'حالج',
    'حالك',
    'حالكم',
    'يا',
    'حنين',
    'حنينه',
    'الذكيه',
    'دكتوره',
    'عيني',
    'شكرا',
    'جزيلا',
    'يسلمو',
    'تسلم',
    'تسلمين',
    'تسلمون',
    'مشكوره',
    'مشكور',
    'مشكورين',
    'هواي',
    'كلش',
    'يعطيك',
    'يعطيج',
    'يعطيكم',
    'العافيه',
    'بارك',
    'بيك',
    'بيج',
    'بيكم',
    'جزاك',
    'جزاكم',
    'خيرا',
    'خير',
    'مع',
    'السلامه',
    'في',
    'امان',
    'باي',
    'تصبحين',
    'تصبحون',
    'علي',
    'ممكن',
    'تساعديني',
    'تساعدني',
    'تساعدوني',
    'ساعديني',
    'hi',
    'hello',
    'hey',
    'good',
    'morning',
    'evening',
    'afternoon',
    'haneen',
    'how',
    'are',
    'you',
    'ممنون',
    'ممنونه',
    'ممنونين',
    'thank',
    'thanks',
    'thx',
    'bye',
    'goodbye',
    'please',
    'help',
  ].map((w) => normalizeIraqiText(w)),
);

const CONVERSATIONAL_FILLER_COLLAPSED = new Set(
  Array.from(CONVERSATIONAL_FILLER_WORDS).map((w) => w.replace(/(.)\1+/g, '$1')),
);

export function detectGreetingOrThanks(text: string): HaneenConversationalIntent | null {
  const clean = text.trim();
  if (!clean || clean.length > 90) return null;

  const norm = normalizeIraqiText(clean);
  const tokens = norm
    .replace(/[؟?!.,،؛:()[\]{}"'🌸❤️🙏✨]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 9) return null;

  const nonFiller = tokens.filter(
    (t) =>
      !CONVERSATIONAL_FILLER_WORDS.has(t) &&
      !CONVERSATIONAL_FILLER_COLLAPSED.has(t.replace(/(.)\1+/g, '$1')),
  );
  if (nonFiller.length > 0) return null;

  if (/(شكرا|يسلمو|تسلم|تسلمين|تسلمون|مشكور|مشكوره|مشكورين|ممنون|ممنونه|ممنونين|يعطيك|يعطيج|يعطيكم|بارك\s*الله|جزاك\s*الله|جزاكم\s*الله|thank|thanks|thx)/i.test(norm)) {
    return 'thanks';
  }
  if (/(مع\s*السلامه|في\s*امان\s*الله|تصبح(ين|ون)\s*علي\s*خير|باي|goodbye|\bbye\b)/i.test(norm)) {
    return 'goodbye';
  }
  if (
    /(مرحبا|اهلا|هلو|هلاو|هلا|سلام\s*عليكم|السلام\s*عليكم|صباح\s*الخير|مساء\s*الخير|شلونج|شلونك|شلونكم|شخبار|كيف\s*حال|\bhi\b|\bhello\b|\bhey\b|good\s*(morning|evening|afternoon)|تساعديني|تساعدوني|ساعديني)/i.test(
      norm,
    )
  ) {
    return 'greeting';
  }
  return null;
}

function isLikelyEnglishQuery(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  return latinChars > arabicChars * 2;
}

export function buildGreetingOrThanksReply(params: {
  intent: HaneenConversationalIntent;
  patientName?: string;
  dialectMode: HaneenDialectMode;
  userText: string;
}): string {
  const isEn = isLikelyEnglishQuery(params.userText);
  const cleanName = (params.patientName || '').trim();
  const hasRealName = cleanName && cleanName !== 'المريض' && cleanName.length <= 40;
  const greetingName = hasRealName ? ` يا ${cleanName}` : '';

  if (isEn) {
    if (params.intent === 'thanks') {
      return "You're very welcome! I'm always happy to explain your lab results and medical terms simply and calmly. Feel free to ask anytime.";
    }
    if (params.intent === 'goodbye') {
      return 'Wishing you lasting health! Whenever you need a simple explanation of a lab test, Haneen is always here in MEDORA.';
    }
    return "Hello and welcome to MEDORA! I'm Haneen, your friendly health education assistant. Ask me anything about a test or attach your lab report (with consent) and I'll explain it in plain everyday language.";
  }

  if (params.intent === 'thanks') {
    if (params.dialectMode === 'iraqi_polite') {
      return [
        `تدللون${greetingName}، كل الهلا 🌸`,
        'بالصحة والعافية والسلامة دائماً. بأي وقت يصير اكو سؤال طبي بسيط أو نتيجة تحليل تحتاج توضيح، حنين موجودة هنا للمساعدة.',
      ].join('\n');
    }
    return [
      `العفو${greetingName}، يسعدنا دائماً تقديم المساعدة بكل ود ولطف 🌸`,
      'أتمنى لكم دوام الصحة والعافية. في أي وقت تحتاجون فيه لتوضيح أي تحليل أو مصطلح طبي، حنين موجودة هنا دائماً.',
    ].join('\n');
  }

  if (params.intent === 'goodbye') {
    if (params.dialectMode === 'iraqi_polite') {
      return [
        `في أمان الله وحفظه${greetingName} 🌸`,
        'بالسلامة والعافية دائماً، وبأي وقت تحتاجون شرح بسيط وسريع لأي فحص أو مصطلح طبي، حنين موجودة هنا.',
      ].join('\n');
    }
    return [
      `في أمان الله وحفظه${greetingName} 🌸`,
      'أتمنى لكم السلامة والعافية دائماً. حنين موجودة هنا في أي وقت تحتاجون فيه إلى شرح مبسّط لأي فحص.',
    ].join('\n');
  }

  if (params.dialectMode === 'iraqi_polite') {
    return [
      `هلا والله وأهلاً وسهلاً${greetingName} 🌸 آني حنين، المساعد التثقيفي في MEDORA حتى أشرح نتائج التحاليل والمصطلحات الطبية بكلام عراقي بسيط وواضح ومن غير تعقيد.`,
      'ممكن طرح أي سؤال بأي طريقة يومية بسيطة (مثل «دم ناقص» أو «النتيجة طالعة عالية»)، أو تفعيل الموافقة بالأعلى وإرفاق ورقة التحليل حتى نوضحها سوية خطوة بخطوة.',
    ].join('\n');
  }

  return [
    `أهلاً ومرحباً${greetingName} 🌸 أنا حنين الذكية، المساعد التثقيفي داخل منصة MEDORA.`,
    'يسعدني تقديم شرح مبسّط وواضح لنتائج الفحوصات المختبرية والمصطلحات الطبية.',
    'ممكن كتابة السؤال هنا أو تفعيل الموافقة لإرفاق تقرير التحليل.',
  ].join('\n');
}

export function extractCleanEducationalSnippet(src: HaneenKnowledgeSource): string {
  const skipPrefixes = [
    'حنين الذكية',
    'ملف معرفة',
    'اللغة:',
    'تاريخ إعداد الملف:',
    'الغرض',
    'تنبيه مهم',
    'المصادر',
    'المصدر الأساسي',
    'ملاحظة تحريرية',
  ];
  const lines = src.content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => {
      if (!l || l.startsWith('http') || /^\d+\.\s+MedlinePlus|^\d+\.\s+World Health/.test(l)) {
        return false;
      }
      return !skipPrefixes.some((p) => l.startsWith(p));
    });
  return lines.slice(0, 6).join('\n');
}

function formatIraqi4PartReply(parts: {
  direct: string;
  simple: string;
  action: string;
  question?: string;
}): string {
  const lines = [
    parts.direct.trim(),
    '',
    `💡 التوضيح البسيط:\n${parts.simple.trim()}`,
    '',
    `🩺 الخطوة الآمنة هسة:\n${parts.action.trim()}`,
  ];
  if (parts.question && parts.question.trim()) {
    lines.push('', `❓ ${parts.question.trim()}`);
  }
  return lines.join('\n');
}

/**
 * Instant (<3ms) fast-path for high-frequency patient questions, supporting
 * Iraqi white dialect, typo tolerance, 4-part structure, and 3 progressive detail levels.
 */
export function buildInstantGentleTopicReply(params: {
  text: string;
  sources: HaneenKnowledgeSource[];
  dialectMode: HaneenDialectMode;
  hasAttachedContext: boolean;
  detailLevel?: HaneenDetailLevel;
}): { text: string; citations: HaneenCitation[]; topicKey: string } | null {
  if (params.hasAttachedContext) return null;

  const clean = params.text.trim();
  if (!clean || clean.length > 260) return null;

  // If personal lab numbers exist (other than HbA1c/A1c/B12/D3/3 months), pass to personalized analyzer.
  const withoutKnownTestTokens = clean.replace(/(hba1c|a1c|b12|d3)/gi, '');
  if (/\d+(?:[.,]\d+)?/.test(withoutKnownTestTokens)) {
    return null;
  }

  const enabled = params.sources.filter((s) => s.enabled && s.content.trim().length > 0);
  const byCode = (code: string) => enabled.find((s) => s.code === code);
  const src01 = byCode('01');
  const src02 = byCode('02');
  const src03 = byCode('03');
  const isEn = isLikelyEnglishQuery(clean);
  const level: HaneenDetailLevel = params.detailLevel || 'brief';
  const norm = normalizeIraqiText(clean);

  // 1) HbA1c / السكر التراكمي
  if (/(hba1c|a1c|السكر التراكمي|التراكمي|مخزون السكر|خزان السكر)/i.test(norm) && src02) {
    const citations = [src02, src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    if (isEn) {
      const text =
        level === 'detailed'
          ? [
              'HbA1c (glycated hemoglobin) measures your average blood sugar over roughly the past 2 to 3 months.',
              '',
              'Simple explanation: Unlike a daily fingerstick or fasting glucose reading—which only captures your sugar at one moment—HbA1c shows the bigger 2–3 month trend as sugar naturally attaches to hemoglobin inside red blood cells.',
              '',
              'What you can do safely: Keep tracking your readings and share the printed value and reference range on your report with your doctor. Never adjust insulin or diabetes tablets on your own based on one chat.',
              '',
              'One quick question: Do you have your printed HbA1c number right now so I can walk through it with your lab’s range?',
            ].join('\n')
          : [
              'HbA1c shows your average blood sugar over roughly the past 2 to 3 months.',
              '',
              'Simple explanation: A daily sugar test is like a single snapshot right now, while HbA1c is the overall 2–3 month average.',
              '',
              'Safe next step: Target levels vary by age, health, and pregnancy—review your number with your doctor and never change diabetes medication on your own.',
              '',
              'Do you want to share your printed HbA1c value and reference range from your report?',
            ].join('\n');
      return { text, citations, topicKey: 'hba1c' };
    }

    const text =
      level === 'brief'
        ? formatIraqi4PartReply({
            direct:
              'فحص السكر التراكمي (HbA1c) يقيس معدل السكر بالدم خلال آخر شهرين إلى 3 أشهر تقريباً، مو بس لحظة الفحص.',
            simple:
              'تحليل السكر العادي يبيّن مستوى السكر بهذي اللحظة بس (ويتأثر بالأكل قبل شوية)، بينما التراكمي (HbA1c) يشبه التقرير الشامل لمعدل السكر خلال آخر 3 أشهر. ارتفاعه أو نزوله يتأثر بعوامل هواي والطبيب هو اللي يحدد الرقم المناسب حسب العمر والحالة الصحية.',
            action:
              'الأفضل مقارنة الرقم المطبوع بالمدى المرجعي الموجود بنفس الورقة، وعدم تغيير جرعة حبوب السكر أو الإنسولين بدون استشارة الطبيب المعالج.',
            question: 'هل يتوفر رقم التراكمي المطبوع بالتقرير هسة حتى نوضحه ببساطة؟',
          })
        : level === 'standard'
          ? formatIraqi4PartReply({
              direct:
                'تحليل HbA1c (السكر التراكمي) هو فحص دم يبيّن معدل السكر اللي چان موجود بالدم خلال آخر شهرين إلى 3 أشهر.',
              simple:
                'السكر يلتصق طبيعياً ببروتين اسمه الهيموغلوبين داخل كريات الدم الحمراء، وبما إن هاي الكريات تتجدد كل 3 أشهر تقريباً، التحليل يعطي صورة ثابتة لمعدل السكر بهذي الفترة، مو مثل فحص الصبح أو بعد الأكل اللي يتغير بساعات.\n• أحياناً ظروف مثل فقر الدم أو اختلاف العمر أو الحمل تأثر على طريقة قراءة الطبيب للنتيجة.',
              action:
                'الاحتفاظ بالتقرير ومراجعة الطبيب المعالج حتى يقيّمه ويا فحص السكر اليومي والحالة العامة، ومن غير زيادة أو تقليل أي علاج بدون استشارة.',
              question: 'ممكن كتابة الرقم والمدى المطبوع بالتقرير، لو اكو أعراض مثل عطش زايد أو تعب؟',
            })
          : formatIraqi4PartReply({
              direct:
                'تحليل السكر التراكمي (HbA1c) يقيس نسبة السكر المرتبط بالهيموغلوبين في الدم، ويعطي متوسط مستوى السكر خلال آخر 8 إلى 12 أسبوع.',
              simple:
                '• الفرق عن فحص السكر اللحظي: السكر الصائم أو العشوائي يعكس لحظة سحب الدم فقط (ويتأثر بوجبة البارحة أو التوتر)، أما التراكمي فما يتأثر بالأكل قبل ساعة من الفحص.\n• ليش يختلف التقييم من شخص لثاني؟ العمر، الحمل، وجود أمراض مزمنة أو فقر دم (نقص الهيموغلوبين) كلّها أمور يأخذها الطبيب بالحسبان لما يحدد الهدف المناسب لكل حالة.\n• لازم دائماً الاعتماد على الوحدة والمدى المطبوع بنفس ورقة المختبر.',
              action:
                'تدوين القراءات الجاية ومناقشتها ويا الطبيب المعالج حتى يطمئن إذا الخطة الغذائية أو الدوائية ماشية صح، بدون إيقاف أو تعديل جرعة الإنسولين أو الدواء.',
              question: 'تگدرون تشاركونا القيمة والمدى المرجعي المطبوع بالتقرير حتى نوضحها بالضبط؟',
            });

    return { text, citations, topicKey: 'hba1c' };
  }

  // 2) Ambiguous "نتيجة التحليل طالعة H مرتفعة، شنو يعني؟" WITHOUT naming a specific test (11_QA_TEST_CASES Test 2)
  const namesSpecificTest =
    /(hba1c|a1c|cbc|hemoglobin|هيموغلوبين|هموكلوبين|هيموجلوبين|creatinine|كرياتينين|alt|ast|bilirubin|صفار|tsh|ferritin|فيريتين|glucose|سكر|كولسترول|دهون|ادرار|بول|urinalysis|mcv|wbc|platelet|صفايح)/i.test(
      norm,
    );
  if (
    !namesSpecificTest &&
    /(طالعه\s*h|طالع\s*h|علامه\s*h|حرف\s*h|مرتفعه\s*شنو|عالي\s*شنو|طالع\s*عالي|طالع\s*ناصي)/i.test(
      norm,
    ) &&
    src01
  ) {
    const citations = [src01].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'حرف H بالتقرير معناه High (يعني الرقم أعلى من المدى المرجعي المطبوع بهذا المختبر)، بس ما نكدر نفسّر معناه قبل ما نعرف يا فحص بالضبط.',
      simple:
        'مو كل نتيجة بيها H معناها مرض خطير؛ أحياناً تتأثر بالأكل قبل التحليل أو شرب المي أو دواء معين. كل فحص إله حسابه الخاص.',
      action:
        'ممكن كتابة المعلومات الموجودة يم السطر المعلّم بـ H، أو تصوير التقرير وإرفاقه بعد تفعيل الموافقة.',
      question:
        'ممكن كتابة اسم الفحص والقيمة والوحدة والمدى المرجعي المطبوع يمه (أو رفع صورة التقرير)؟',
    });
    return { text, citations, topicKey: 'clarify_h_flag' };
  }

  // 2b) Ambiguous "دمي ناقص؟" WITHOUT specific test or hemoglobin mention (11_QA_TEST_CASES Test 8)
  const isAmbiguousLowBloodOnly =
    /(دمي ناقص|دم ناقص|دمي نازل|دم نازل)/i.test(norm) &&
    !/(هيموغلوبين|هموكلوبين|هيموجلوبين|cbc|hb|ferritin|فيريتين)/i.test(norm);
  if (isAmbiguousLowBloodOnly && src02 && src01) {
    const citations = [src02, src01].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'عبارة «دم ناقص» بالعادة يقصدون بيها فحص الهيموغلوبين (Hb) أو قوة الدم بالـ CBC، بس ما نكدر نجزم بوجود فقر دم بدون قراءة التحليل الفعلي.',
      simple:
        'انخفاض الدم إله أكثر من سبب (مثل مخزون الحديد أو الفيتامينات أو عوامل ثانية)، وبعض الناس يحسون بتعب وتحاليلهم طبيعية أو العكس.',
      action:
        'التأكد من الأرقام المطبوعة بالتقرير أولاً وعدم أخذ أي حبوب حديد أو مقويات بدون استشارة الطبيب.',
      question:
        'يا تحليل المقصود تحديداً، وشگد الرقم والمدى المرجعي المطبوع بورقة التحليل (أو ممكن رفع صورة واضحة للتقرير)؟',
    });
    return { text, citations, topicKey: 'clarify_low_blood' };
  }

  // 2c) Direct Hemoglobin / Anemia explanation (11_QA_TEST_CASES Test 1)
  if (/(هيموغلوبين|هموكلوبين|هيموجلوبين|فقر دم|انيميا|قوه دم|شحوب)/i.test(norm) && src02) {
    const citations = [src02, src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text =
      level === 'brief'
        ? formatIraqi4PartReply({
            direct:
              'الهيموغلوبين (Hb) مادة موجودة بالدم تساعد على نقل الأوكسجين لكل الجسم.',
            simple:
              'إذا نزل عن المعدل الموجود بالتقرير فهذا أحياناً يصير بسبب نقص الحديد أو الفيتامينات أو أسباب ثانية، والنتيجة وحدها ما تكفي حتى نحدد السبب الأكيد.',
            action:
              'عرض رقم الهيموغلوبين وبقية مؤشرات الـ CBC على الطبيب المعالج قبل أخذ أي حديد أو مقويات.',
            question: 'هل تتوفر قيمة الهيموغلوبين والمدى المرجعي المطبوع بالتقرير هسة؟',
          })
        : formatIraqi4PartReply({
            direct:
              'الهيموغلوبين (Hemoglobin / Hb) هو البروتين داخل كريات الدم الحمراء المسؤول عن حمل الأوكسجين من الرئة لباقي الجسم.',
            simple:
              '• إذا طلع أقل من المعدل المطبوع بتقرير المختبر، الناس تسميه «نقص دم» أو «فقر دم»، وممكن يكون سببه نقص الحديد (الفيريتين)، نقص B12 أو الفوليك، أو فقدان دم، أو اختلاف بسيط حسب العمر والحمل.\n• الطبيب يقرأ الهيموغلوبين ويا حجم الكرية (MCV) حتى يعرف النوع والسبب بدقة.',
            action:
              'عدم أخذ حبوب حديد عشوائياً بدون ما يحدد الطبيب السبب، وإذا اكو دوخة قوية أو ضيق نفس لازم مراجعة الطبيب أو الطوارئ فوراً.',
            question: 'ممكن كتابة قيمة الـ Hb والمدى المرجعي اللي يمه بالتقرير حتى نوضحها؟',
          });
    return { text, citations, topicKey: 'hemoglobin_anemia' };
  }

  // 3) CBC / تعداد الدم الكامل
  if (/(cbc|complete blood count|تعداد الدم|صوره الدم|صفايح|كريات الدم|mcv|hematocrit|هيماتوكريت|سي بي سي|سبيسي)/i.test(norm) && src02) {
    const citations = [src02, src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    if (isEn) {
      const text = [
        'A Complete Blood Count (CBC) checks the three main types of cells in your blood.',
        '',
        'Simple explanation:',
        '• Red blood cells & Hemoglobin (Hb): Carry oxygen around your body.',
        '• White blood cells (WBC): Help fight infections.',
        '• Platelets: Help your blood clot normally.',
        '',
        'Safe next step: One slightly out-of-range number is not a diagnosis on its own—share the report with your doctor.',
        '',
        'Do you have a specific number in your CBC you want explained?',
      ].join('\n');
      return { text, citations, topicKey: 'cbc' };
    }

    const text =
      level === 'brief'
        ? formatIraqi4PartReply({
            direct:
              'تحليل الدم الكامل (CBC) يعطي صورة عامة عن خلايا الدم الثلاثة: الحمراء والبيضاء والصفائح.',
            simple:
              '• الدم الأحمر والهيموغلوبين (RBC / Hb): ينقلون الأوكسجين للجسم.\n• كريات الدم البيضاء (WBC): خلايا المناعة اللي تدافع ضد الالتهابات.\n• الصفائح الدموية (Platelets): تساعد الدم يتخثر طبيعي إذا صار جرح.',
            action:
              'تغيّر رقم واحد بشوية مو معناه مرض أكيد؛ الطبيب يقرا كل الأرقام سوية ويا الأعراض.',
            question: 'هل اكو رقم معين بتحليل الـ CBC يحتاج توضيح؟',
          })
        : formatIraqi4PartReply({
            direct:
              'فحص تعداد الدم الكامل (CBC) يفحص مكونات الدم الأساسية حتى يطمئن الطبيب على الأوكسجين والمناعة والتخثر.',
            simple:
              '• كريات الدم الحمراء (RBC) والهيموغلوبين (Hb): تحمل الأوكسجين.\n• الهيماتوكريت (Hct): نسبة الدم الأحمر.\n• متوسط حجم الكرية (MCV): يساعد الطبيب يميّز أسباب نقص الدم.\n• كريات الدم البيضاء (WBC): تتغير أحياناً مع التهاب أو رشح عابر أو توتر.\n• الصفائح (Platelets): تحمي من النزف.',
            action:
              'الاعتماد يكون على المدى المرجعي المطبوع بورقة المختبر، ومراجعة الطبيب إذا اكو أعراض أو أرقام بعيدة عن المعدل.',
            question: 'ممكن كتابة قيمة معينة من ورقة الـ CBC حتى نوضحها ببساطة؟',
          });
    return { text, citations, topicKey: 'cbc' };
  }

  // 4) MRI Disc Bulge / Radiology Reports (11_QA_TEST_CASES Test 4)
  if (/(انزلاق غضروفي|غضروف|ديسك|disc bulge|disc herniation)/i.test(norm) && !detectImagingScanDiagnosisRequest(clean)) {
    const citations = [src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'عبارة «انزلاق غضروفي بسيط» بتقرير الرنين معناها أن الوسادة المرنة (الغضروف) بين فقرات الظهر شوية طالعة عن مكانها المعتاد، وأحياناً تلامس عصب قريب.',
      simple:
        'تطلع هاي الكلمة هواي بتقارير الرنين، ومو معناها دائماً عملية جراحية! هواي حالات تكون بسيطة وتتحسن بالراحة والعلاج الطبيعي اللي يقرره الطبيب حسب الأعراض مو بس حسب التقرير.',
      action:
        'عرض تقرير الرنين المكتوب على طبيب الأعصاب أو العظام حتى يربطه بالأعراض والفحص. ومهم التوجه للطوارئ فوراً إذا صار ضعف مفاجئ بالرجل، صعوبة بالمشي، خدر بمنطقة الحوض، أو فقدان السيطرة على الإدرار.',
      question: 'هل اكو ألم أو تنميل نازل بالرجل، لو التقرير كاتب كلمات ثانية تحتاج توضيح؟',
    });
    return { text, citations, topicKey: 'mri_disc_bulge' };
  }

  // 5) "عندي خمول وتعب" / Fatigue colloquial query
  if (/(عندي خمول|خمول|تعبان|مالي خلق|جسمي مكسر|كسل|دوخه|دوار)/i.test(norm) && src01 && src02) {
    const citations = [src01, src02].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'الخمول والتعب شعور عام إله هواي أسباب يومية وطبية، وما نكدر نحدد سببه من الشعور بس بدون فحص طبي.',
      simple:
        'أحياناً يكون من قلة النوم أو الإرهاق أو قلة شرب المي، وأحياناً يرتبط بنقص الحديد والهيموغلوبين أو فيتامين D أو الغدة الدرقية أو السكر. الطبيب هو اللي يحدد يا فحوصات تناسب الحالة.',
      action:
        'مراجعة الطبيب للفحص السريري بدل عمل تحاليل عشوائية أو أخذ فيتامينات بدون استشارة. وإذا التعب وياه ضيق نفس قوي أو إغماء أو ألم صدر لازم مراجعة الطوارئ فوراً.',
      question: 'صار شكد هذا التعب مستمر، وهل اكو أي تحاليل مسواية قريب؟',
    });
    return { text, citations, topicKey: 'fatigue' };
  }

  // 6) Lipids / الكوليسترول والدهون الثلاثية
  if (/(كولسترول|كوليسترول|cholesterol|ldl|hdl|triglycerides|دهون ثلاثيه)/i.test(norm) && src01) {
    const citations = [src01].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'تحليل الدهون يشمل الكوليسترول الكلي، الدهون الضارة (LDL)، النافعة (HDL)، والدهون الثلاثية (Triglycerides).',
      simple:
        'ارتفاع LDL أو الدهون الثلاثية يتأثر بنوع الأكل، الوراثة، الوزن، قلة الحركة، أو السكر. الرقم الأعلى من المعدل ما يتفسر لوحده—الطبيب يقرأه ويا العمر والضغط والحالة العامة قبل أي قرار علاجي.',
      action:
        'عرض النتيجة المطبوعة والمدى المرجعي على الطبيب المعالج، وعدم البدء أو التوقف عن أي دواء دهون بدون استشارة طبية.',
      question: 'ممكن كتابة الأرقام والمدى المرجعي المطبوع بتحليل الدهون حتى نوضحها؟',
    });
    return { text, citations, topicKey: 'lipids' };
  }

  // 7) TSH / الغدة الدرقية
  if (/(\btsh\b|غده درقيه|خمول الغده|نشاط الغده|free t4)/i.test(norm) && src01) {
    const citations = [src01].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'هرمون الـ TSH ينظم شغل الغدة الدرقية المسؤولة عن طاقة الجسم وحركته وحرقه.',
      simple:
        'بصورة عامة، ارتفاع TSH عن المعدل أحياناً يشير لخمول بالغدة، ونزوله أحياناً يشير لنشاطها، بس الطبيب دائماً يربطه ويا هرمون الغدة نفسه (Free T4) والأعراض.',
      action:
        'عدم تعديل جرعة دواء الغدة بدون استشارة، وعرض التحليل والمدى المرجعي على الطبيب المعالج.',
      question: 'هل تتوفر قيمة الـ TSH والمدى المطبوع بورقة المختبر؟',
    });
    return { text, citations, topicKey: 'thyroid_tsh' };
  }

  // 8) CMP / الكبد والكلى / كرياتينين
  if (/(cmp|comprehensive metabolic|لوحه الكيمياء|الكيمياء الشامله|وظايف الكبد|وظايف الكلي|كليتي|كرياتينين|creatinine|bilirubin|يوريا|صفار|alt|ast)/i.test(norm) && src02) {
    const citations = [src02, src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text =
      level === 'brief'
        ? formatIraqi4PartReply({
            direct:
              'فحوصات الكبد والكلى (مثل الكرياتينين وALT وAST والصفار) تطمئن الطبيب على شلون الجسم دا يصفي الفضلات ويحافظ على توازن الأملاح.',
            simple:
              'تغيّر رقم واحد بشوية أحياناً يصير من قلة شرب المي أو دواء معين أو مجهود بدني، مو بالضرورة فشل أو مرض خطير.',
            action:
              'ما ينحكم على الكلى أو الكبد من رقم واحد؛ الأفضل عرض الورقة ويا قائمة الأدوية على الطبيب المعالج.',
            question: 'هل اكو تحليل معين طالع بالتقرير مختلف ويحتاج توضيح؟',
          })
        : formatIraqi4PartReply({
            direct:
              'لوحة الكيمياء الشاملة (CMP) تضم فحوصات الكلى والكبد والسكر والأملاح لتعطي نظرة عامة عن توازن الجسم.',
            simple:
              '• الكرياتينين واليوريا (Creatinine / BUN): تعكس تصفية الكلى وتتاثر أحياناً بالجفاف أو بعض المسكنات.\n• إنزيمات الكبد والصفار (ALT, AST, Bilirubin): تعطي فكرة عن الكبد والمرارة.\n• الشوارد (صوديوم وبوتاسيوم): تنظم السوائل والأعصاب والعضلات.',
            action:
              'الطبيب يقرأ كل هاي المؤشرات سوية ويا الأعراض والأدوية، وما يصير تغيير أي دواء بدون استشارته.',
            question: 'ممكن كتابة القيمة والمدى المطبوع بالتقرير حتى نشرح معناها؟',
          });
    return { text, citations, topicKey: 'cmp' };
  }

  // 9) Urinalysis / تحليل البول / الإدرار
  if (/(urinalysis|تحليل البول|فحص البول|تحليل الادرار|ادرار|ketones|nitrite)/i.test(norm) && src02) {
    const citations = [src02, src01].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'تحليل الإدرار العام (Urinalysis) يفحص عينة البول حتى يكشف أي علامات التهاب أو أملاح أو سوائل.',
      simple:
        'المختبر يشيك اللون، والمواد الكيميائية (مثل السكر أو الزلال أو مؤشر الالتهاب)، وتحت المجهر يشوف الخلايا البيضاء والأملاح والبكتيريا. ظهور ملاحظة وحدة أحياناً يصير من تلوث العينة أو قلة شرب المي.',
      action:
        'عدم أخذ مضاد حيوي عشوائي؛ الأفضل مراجعة الطبيب ويا النتيجة لأنه أحياناً يطلب زرع إدرار حتى يختار العلاج الصح.',
      question: 'هل مكتوب بالتقرير شي معين (مثل بكتيريا أو أملاح أو خلايا بيضاء) يحتاج توضيح؟',
    });
    return { text, citations, topicKey: 'urinalysis' };
  }

  // 10) Reference Ranges / المدى المرجعي / "التحليل طالع عالي أو ناصي"
  if (/(المدي المرجعي|مدي مرجعي|reference range|معني.*(مرتفع|منخفض|عالي|نازل|ايجابي|سلبي|حدي|غير حاسم)|borderline|inconclusive|وحدات التحليل|خارج المعدل)/i.test(norm) && src01) {
    const citations = [src01].map(toCitation);
    const text =
      level === 'brief'
        ? formatIraqi4PartReply({
            direct:
              'المدى المرجعي (Reference Range) هو المعدل المعتاد المطبوع بورقة التحليل، وخروج الرقم عنه بشوية ما يعني مرض أكيد.',
            simple:
              'كل مختبر إله أجهزته ووحداته، والعمر والأكل وشرب المي يغيرون الرقم أحياناً. رمز H يعني أعلى من الحد المطبوع، وL يعني أقل من الحد المطبوع.',
            action:
              'المقارنة تكون بس ويا المعدل المطبوع بنفس الورقة (مو من مختبر ثاني)، وعرض النتيجة على الطبيب المعالج.',
            question: 'شنو اسم التحليل ورقمه اللي طالع مختلف بالتقرير حتى نوضحه؟',
          })
        : formatIraqi4PartReply({
            direct:
              'المدى المرجعي هو الإطار اللي يطبعه المختبر يم النتيجة حتى يبيّن إذا القيمة ضمن المعتاد عندهم لو أعلى أو أقل.',
            simple:
              '• الوحدات تختلف بين المختبرات (مثل mg/dL مقابل mmol/L)، فلازم ما نقارن أرقام بوحدات مختلفة.\n• High (H): أعلى من الحد المطبوع.\n• Low (L): أقل من الحد المطبوع.\n• Borderline / حدّي: قريب جداً من الحد الفاصل.\n• Positive / Negative: وجود المادة أو عدمها حسب نوع الفحص.',
            action:
              'النتيجة تتفسر ويا الأعراض والتاريخ الصحي عند الطبيب، مو من رقم واحد لحاله.',
            question: 'ممكن كتابة اسم التحليل وقيمته والمدى المطبوع بالتقرير؟',
          });
    return { text, citations, topicKey: 'reference_range' };
  }

  // 11) WHO Healthy Diet / الغذاء الصحي
  if (/(الغذا.? الصحي|غذا.? صحي|منظمه الصحه العالميه|healthy diet|who|دايت|تغذيه|اكل صحي|ريجيم)/i.test(norm) && src03) {
    const citations = [src03].map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'حسب منظمة الصحة العالمية (WHO)، الأكل الصحي يعتمد على 4 أسس بسيطة: الكفاية، التوازن، الاعتدال، والتنوع.',
      simple:
        'المقصد تنويع الوجبات من خضار وفواكه وبقوليات وحبوب كاملة وبروتين، مع تقليل الملح الزايد والسكريات والمقليات، من غير حرمان قاسي.',
      action:
        'هاي نصائح تثقيفية عامة للوقاية؛ بس إذا اكو سكري، ضغط، مشاكل بالكلى أو الكبد، أو حمل، الأفضل اتباع خطة أكل يحددها الطبيب المعالج.',
      question: 'هل السؤال للوقاية العامة لو اكو حالة صحية معينة مهمة بالأكل؟',
    });
    return { text, citations, topicKey: 'who_diet' };
  }

  // 12) Test Preparation / التحضير والصيام
  if (/(التحضير|تحضير.*فحص|تحضير.*تحليل|شروط.*التحليل|صيام.*التحليل|عوامل.*تؤثر.*النتيجه|صايم قبل التحليل|fasting|prepare.*test)/i.test(norm) && src01) {
    const citations = [src01, src02].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'أي، أكو شغلات يومية مثل الأكل، مدة الصيام، الأدوية، أو التمارين القوية تگدر تأثر على دقة بعض التحاليل.',
      simple:
        '• الأكل والشرب: تحاليل مثل سكر الصيام والدهون تحتاج صيام ساعات معينة، وشرب المي بالعادة مسموح إذا المختبر سمح.\n• الأدوية والمكملات: ممكن تغيّر بعض القراءات.\n• توقيت السحب والمجهود القوي هم يأثرون ببعض الفحوصات.',
      action:
        'الالتزام بتعليمات المختبر، وعدم إيقاف أي دواء موصوف قبل التحليل إلا إذا الطبيب نفسه طلب هذا الشي.',
      question: 'يا تحليل المقصود حتى نوضح نقاط التحضير العامة الخاصة بيه؟',
    });
    return { text, citations, topicKey: 'prep' };
  }

  // 13) Special Populations (Pregnancy / Pediatric Lab Reference Boundaries — Batch D)
  if (/(حامل|حمل|سكر الحمل|ogtt|تحليل.*طفل|تحاليل.*اطفال|مدي.*طفل|رضيع|حديث الولاده)/i.test(norm) && src01) {
    const citations = [src01, src02].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'المدى المرجعي للأطفال والحوامل يختلف تماماً عن قيم البالغين الاعتيادية، وما يصير أبداً نقارن أرقامهم بجدول البالغين.',
      simple:
        '• بالأطفال: تتغير القيم الطبيعية مثل الهيموغلوبين وكريات الدم والإنزيمات حسب عمر الطفل بالأيام أو الأشهر أو السنوات.\n• بالحمل: يتغير حجم الدم والهرمونات، فيختلف الهيموغلوبين وTSH وتحليل السكر الحملي (OGTT) بكل مرحلة.',
      action:
        'التأكد أن التقرير طابع المدى المرجعي الخاص بالعمر أو الحالة، وعرض النتيجة على طبيب الأطفال أو طبيبة النسائية قبل أي إجراء أو دواء.',
      question: 'هل الفحص يخص طفلاً (وشكد عمره) لو فترة حمل حتى نوضحلك معنى القراءة بأمان؟',
    });
    return { text, citations, topicKey: 'special_population_labs' };
  }

  // 14) Medication Leaflet Literacy & Antibiotic Safety (Batch E — NO prescribing!)
  if (/(نشره الدواء|علبه الدواء|الماده الفعاله|الاسم العلمي|تاريخ الانتهاء|حفظ الدواء|شروط حفظ)/i.test(norm) && src01) {
    const citations = [src01, src03].filter((s): s is HaneenKnowledgeSource => Boolean(s)).map(toCitation);
    const text = formatIraqi4PartReply({
      direct:
        'قراءة نشرة الدواء تركز على 4 نقاط مهمة: المادة الفعالة (الاسم العلمي)، التركيز، تاريخ الانتهاء، وشروط الحفظ والتخزين.',
      simple:
        '• المادة الفعالة: ممكن دواءين بأسماء تجارية مختلفة يكون بداخلهم نفس المادة الفعالة، فالانتباه إلها يمنع تكرار الجرعة.\n• حنين ما تصف أدوية أو بدائل ولا تحدد جرعات—هذا اختصاص الطبيب والصيدلي فقط.',
      action:
        'الاحتفاظ بالنشرة الأصلية وسؤال الصيدلي أو الطبيب المعالج عن وقت الدواء وعلاقته بالأكل أو الحمل أو أي أدوية ثانية.',
      question: 'أكو مصطلح محدد بنشرة الدواء حابين نوضحه بصورة عامة؟',
    });
    return { text, citations, topicKey: 'med_leaflet_literacy' };
  }

  return null;
}

export interface HaneenLabGuidancePack {
  safeInterpretationAr: string;
  imageExtractionSpecAr: string;
  responseTemplateAr: string;
  sourceIndex: string;
  combinedSystemGuidance: string;
}

let cachedLabGuidancePack: HaneenLabGuidancePack | null = null;

function readAttachmentDocSafe(filename: string): string {
  try {
    const filePath = path.join(KNOWLEDGE_DIR, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
  } catch {
    // Non-fatal fallback
  }
  return '';
}

export function loadLabReadingGuidancePack(): HaneenLabGuidancePack {
  if (cachedLabGuidancePack) return cachedLabGuidancePack;

  const startHere = readAttachmentDocSafe('00_START_HERE_AR_27e97408.md');
  const safeInterpretationAr = readAttachmentDocSafe('01_SAFE_INTERPRETATION_AR_f67cf077.md');
  const imageExtractionSpecAr = readAttachmentDocSafe('02_IMAGE_EXTRACTION_SPEC_AR_832e686d.md');
  const responseTemplateAr = readAttachmentDocSafe('03_REPORT_RESPONSE_TEMPLATE_AR_edb28697.md');
  const sourceIndex = readAttachmentDocSafe('05_SOURCE_INDEX_096f078a.md');

  const combinedSystemGuidance = [
    '[مراجع إرشادية مساعدة لقراءة وشرح تقارير المختبر — ليست بديلاً عن المراجع الطبية أو تشخيص الطبيب]',
    'أولوية المراجع: (1) القيم والوحدات والمجال المرجعي المطبوعة في نفس التقرير الأصلي أولاً، (2) معلومات المختبر المصدر للتقرير، (3) المراجع التثقيفية الموثوقة (MedlinePlus / NIH / WHO) لشرح معنى الفحص بصورة عامة فقط.',
    startHere,
    safeInterpretationAr,
    imageExtractionSpecAr,
    responseTemplateAr,
    sourceIndex,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');

  cachedLabGuidancePack = {
    safeInterpretationAr,
    imageExtractionSpecAr,
    responseTemplateAr,
    sourceIndex,
    combinedSystemGuidance,
  };
  return cachedLabGuidancePack;
}

