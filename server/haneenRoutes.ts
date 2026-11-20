import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { type Auth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import type {
  HaneenAttachedReportSummary,
  HaneenCitation,
  HaneenCompletenessStatus,
  HaneenDetailLevel,
  HaneenDialectMode,
  HaneenExtractedLabReport,
  HaneenExtractedLabRow,
  HaneenExtractionConfidence,
  HaneenKnowledgeSource,
  HaneenLabComparisonStatus,
  HaneenLibraryDomain,
  HaneenMessage,
  HaneenTopicReviewStatus,
} from '../src/types/haneen.ts';
import type { createFirestoreRestClient } from './firestoreRest.ts';
import {
  buildGreetingOrThanksReply,
  buildInstantGentleTopicReply,
  detectEmergencySymptoms,
  detectGreetingOrThanks,
  detectImagingScanDiagnosisRequest,
  detectMedicationDosageRequest,
  detectRequestedDetailLevel,
  extractCleanEducationalSnippet,
  loadLabReadingGuidancePack,
  normalizeIraqiText,
  retrieveRelevantKnowledge,
  toCitation,
} from './haneenKnowledge.ts';
import {
  comparePatientLabResultsSafe,
  type RawPatientLabResultDoc,
} from './haneenLibrary.ts';
import { HaneenStore } from './haneenStore.ts';

export const HANEEN_GEMINI_MODEL = 'gemini-4-hydrogen';

export interface HaneenRouterDeps {
  adminAuth: Auth;
  getAdminDb: () => Firestore | null;
  isFirestoreAdminReady: () => boolean;
  restDb: ReturnType<typeof createFirestoreRestClient>;
  store?: HaneenStore;
  aiClientOverride?: GoogleGenAI;
}

export interface AdminHaneenRouterDeps {
  requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
  store: HaneenStore;
}

interface VerifiedPatientContext {
  uid: string;
  token: string;
  email: string;
  fullName: string;
  gender?: string;
  dateOfBirth?: string;
  age?: number;
}

interface GeneralAnswerCacheEntry {
  text: string;
  citations: HaneenCitation[];
  createdAt: number;
}

const GENERAL_CACHE_TTL_MS = 30 * 60 * 1000;
const GENERAL_CACHE_MAX_ENTRIES = 200;
const MAX_SINGLE_UPLOAD_BASE64_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_UPLOAD_BASE64_BYTES = 14 * 1024 * 1024;
const MAX_UPLOAD_FILES_PER_MESSAGE = 4;
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export interface InlineMediaPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export function normalizeAttachmentMimeType(rawMime: unknown, fileName = ''): string {
  const cleaned = normalizeStr(rawMime, 80).toLowerCase().split(';')[0].trim();
  if (cleaned === 'image/jpg' || cleaned === 'image/pjpeg') return 'image/jpeg';
  if (ALLOWED_UPLOAD_MIME_TYPES.has(cleaned)) return cleaned;
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  return cleaned;
}

function normalizeStr(val: unknown, maxLen: number): string {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
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
    for (const [k, v] of Object.entries(rec)) {
      out[k] = serializeValue(v);
    }
    return out;
  }
  return val;
}

function serializeDoc(data: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!data) return null;
  return serializeValue(data) as Record<string, unknown>;
}

function computeAgeFromDob(dob?: string): number | undefined {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return undefined;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age <= 130 ? age : undefined;
}

function isGeminiApiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(typeof key === 'string' && key.trim().length > 10);
}

function createGeminiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildHaneenSystemInstruction(params: {
  dialectMode: HaneenDialectMode;
  detailLevel: HaneenDetailLevel;
  knowledgeContext: string;
  emergencyInstructionAr: string;
  hasExtractedLabReport?: boolean;
}): string {
  const genderNeutralRule = [
    'قاعدة المخاطبة المحايدة (إلزامية ولا يجوز كسرها أبداً):',
    '- عند مخاطبة المريض، يجب أن يكون الكلام طبيعياً ومحايداً تماماً: لا بالصيغة الأنثوية ولا بالصيغة الذكورية المفردة.',
    '- ممنوع منعاً باتاً مخاطبة المقابل بصيغة أنثوية نهائياً (مثل: أنتِ، عزيزتي، أختي، حبيبتي، بيكِ، إلكِ، عندج، بيج، وياج، إلج، سؤالج، تحليلج، تگدرين، تحسين، اكتبي، راجعي، اختاري، تفضلي، دزيلي، كنتِ).',
    '- وممنوع أيضاً استخدام ألقاب أو صيغ ذكورية مفردة واضحة في المخاطبة (مثل: أخي، عزيزي، حبيبي، سيدي، خوية، أنتَ، تدلل، عندك، بيك، إلك، وياك، تگدر، تراجع، تحب، تسوي، تاخذ، تكتبلي، أوضحلك، أساعدك، نتيجتك، تحليلك، دمك، جسمك، عمرك، أعراضك، طبيبك، علاجك، مختبرك، بنفسك، وحدك).',
    '- بدلاً من ذلك، استخدمي صياغة عراقية طبيعية محايدة تجمع بين: (1) العبارات العراقية غير الشخصية (مثل: «النتيجة المطبوعة بالتقرير»، «بالدم»، «بالجسم»، «الأفضل مراجعة الطبيب المعالج»، «ممكن كتابة الرقم هنا»، «إذا اكو أعراض»، «ما يصير تغيير الجرعة بدون استشارة الطبيب»)، و(2) الجمع المهذب العراقي اللطيف عند الحاجة (مثل: «هلا والله»، «تدللون»، «تگدرون»، «إذا تحبون»، «سلامتكم تهمنا»، «بالعافية والسلامة دائماً»).',
    '- حتى لو توفّر جنس المريض في المعلومات الأساسية، يُستخدم فقط لفهم السياق العلمي للمدى المرجعي عند اللزوم، ويُمنع تماماً تغيير أسلوب المخاطبة إلى أنثوي أو ذكوري.',
  ].join('\n');

  const dialectRule =
    params.dialectMode === 'iraqi_polite'
      ? [
          'أسلوب الكلام (مهم جداً):',
          '- الكلام يكون باللهجة العراقية البيضاء البسيطة والمفهومة لجميع العراقيين، بأسلوب ودود وهادئ ومحترم مثل شخص يشرح وجهاً لوجه.',
          '- استخدام كلمات عراقية يومية مألوفة (مثل: ببساطة، هسة، شوية، هواي، اكو، مو معناه، أحياناً يصير، الأفضل مراجعة الطبيب المعالج)، والابتعاد تماماً عن لغة الكتب الطبية الجافة أو العبارات الآلية.',
          '- إذا انذكر مصطلح طبي، يتوضّح معناه فوراً بكلمات بسيطة بنفس الجملة.',
          '- إذا كتب السائل بالإنجليزية، يكون الرد بالإنجليزية البسيطة والواضحة واللطيفة.',
        ].join('\n')
      : [
          'أسلوب الكلام:',
          '- استخدام لغة بسيطة ولطيفة وواضحة جداً من غير مصطلحات معقدة.',
          '- إذا انذكر مصطلح طبي، يتوضّح معناه فوراً بكلمات يومية سهلة.',
        ].join('\n');

  const depthRule = params.hasExtractedLabReport
    ? 'مستوى التفصيل (شرح تقرير تحاليل مستخرج): لا تقتصر على عدد كلمات قليل؛ اشرح كل تحليل تم استخراجه بوضوح وبعبارات عربية مبسطة ووافية دون إغفال أي صف من الجدول.'
    : params.detailLevel === 'brief'
      ? 'مستوى التفصيل (المستوى 1 — مختصر جداً وواضح من أول مرة): رد قصير ومباشر جداً (حوالي 70 إلى 130 كلمة)، دون إطالة أو محاضرات.'
      : params.detailLevel === 'standard'
        ? 'مستوى التفصيل (المستوى 2 — مبسط مع تفاصيل إضافية): شرح مبسط وواضح مع أمثلة يومية عملية (حوالي 140 إلى 220 كلمة).'
        : 'مستوى التفصيل (المستوى 3 — مفصل بناءً على طلب السائل): شرح متدرج ومفصل ومنظم مع الحفاظ على البساطة والوضوح والابتعاد عن التعقيد.';

  return [
    'الشخصية: "حنين الذكية (HANEEN AI)" داخل منصة MEDORA، مساعد تثقيفي ذكي مخصص للمرضى فقط. الأولوية القصوى أن تصل الفكرة بوضوح من أول مرة وبلهجة عراقية طبيعية دافئة ومحايدة.',
    genderNeutralRule,
    '',
    dialectRule,
    '',
    depthRule,
    '',
    'الترتيب الإلزامي للإجابة (في كل الردود غير الطارئة):',
    '1. الجواب المباشر: جملة أو جملتان واضحتان تجيب عن السؤال فوراً.',
    '2. 💡 التوضيح البسيط: توضيح الفكرة بكلمات يومية سهلة بدون إغراق بالتفاصيل.',
    '3. 🩺 الخطوة الآمنة هسة: نصيحة عملية آمنة ومتى تلزم مراجعة الطبيب.',
    '4. ❓ سؤال واحد بسيط ومحايد فقط إذا چان اكو نقص مهم يمنع التوضيح (بدون الإكثار من الأسئلة أو طلب معلومات كثيرة دفعة واحدة).',
    '',
    'طريقة شرح التحاليل (عند وجود نتيجة أو رقم تحليل):',
    '- أولاً: توضيح بسيط هذا التحليل شنو يقيس بالجسم.',
    '- ثانياً: توضيح هل النتيجة ضمن المعدل المطبوع بالتقرير أم أعلى أم أقل منه (نقل القيمة والوحدة والمدى المرجعي كما هي تماماً دون تغيير أو تحويل وحدات).',
    '- ثالثاً: شرح المعنى ببساطة بدون تشخيص مرض (مثال صحيح: «الهيموغلوبين مادة موجودة بالدم تساعد على نقل الأوكسجين لكل الجسم. الرقم بالتقرير أقل من المعدل المطبوع، وهذا أحياناً يصير بسبب نقص الحديد أو أسباب ثانية، والنتيجة وحدها ما تكفي حتى نحدد السبب»).',
    '- رابعاً: ذكر العوامل اليومية اللي ممكن تأثر على الرقم دون الجزم بمرض.',
    '- خامساً: توضيح متى تلزم مراجعة الطبيب المعالج بصياغة محايدة.',
    '',
    'فهم القصد وسياق المحادثة:',
    '- فهم كلام السائل حتى لو كُتب باللهجة العراقية أو بأخطاء إملائية (مثل: دمي ناقص، عندي خمول، التحليل طالع عالي، ادرار) من غير مطالبة بالمصطلح الطبي الفصيح.',
    '- الاعتماد على سياق المحادثة السابقة حتى ما ينعاد نفس الكلام.',
    '',
    'القواعد الطبية والأمنية الإلزامية (غير قابلة للتجاوز):',
    '1. حنين مساعد تثقيفي فقط، وليست طبيباً ولا تُصدر تشخيصاً طبياً أو علاجاً.',
    '2. إذا ظهرت علامات طوارئ خطيرة (ألم صدر شديد، ضيق تنفس شديد، علامات سكتة دماغية، فقدان وعي، نزيف لا يتوقف، تشنج، إنتان، تسمم، تحسس شديد/تورم اللسان أو الحلق، أو أفكار إيذاء النفس): إيقاف الشرح الروتيني فوراً والتوجيه لأقرب طوارئ أو طلب المساعدة الطبية الطارئة دون تأخير ودون أسئلة إضافية، مع التحذير من قيادة السيارة دون مرافق، وعدم ذكر أي رقم هاتف غير موثق.',
    '3. ممنوع منعاً باتاً وصف دواء، تحديد أو تعديل جرعة دواء أو أنسولين، أو التوصية بإيقاف علاج.',
    '4. في الأشعة والتصوير: ممنوع تشخيص صورة أشعة أو رنين أو مفراس أو الجزم بوجود ورم أو كسر أو جلطة من صورة. الشرح يقتصر على تبسيط العبارات المكتوبة بالتقرير الرسمي والتوجيه لطبيب الأشعة والطبيب المعالج.',
    '5. ممنوع اختراع أي أرقام أو مدى مرجعي من الذاكرة إذا لم يكن مطبوعاً بالتقرير (يُكتب: غير مذكور في التقرير)، وممنوع تخمين أرقام من صورة غير واضحة أو مقطوعة.',
    '6. التثقيف الصحي العام (WHO): توضيح أنها إرشادات عامة وليست خطة علاجية خاصة.',
    '7. عدم تكرار الترحيب أو الاسم في كل رسالة بعد بداية المحادثة.',
    '8. الاحتفاظ ببيانات المصادر داخلياً لأغراض التتبع وعدم وضع قائمة مصادر أو روابط أسفل الإجابات العادية إلا إذا طُلب ذلك صراحةً.',
    `تنويه الطوارئ المعتمد: ${params.emergencyInstructionAr}`,
    '',
    'مقاطع المعرفة الموثقة لهذه الإجابة:',
    params.knowledgeContext || 'الاعتماد على قواعد السلامة العامة والتوجيه لمراجعة الطبيب ببساطة ولطف وبصياغة عراقية محايدة.',
  ].join('\n');
}

function buildEmergencyResponseText(emergencyInstructionAr: string): string {
  return [
    '⚠️ السلامة تهمنا أولاً — يرجى التصرف فوراً:',
    emergencyInstructionAr,
    '',
    '• لازم التوجه فوراً لأقرب قسم طوارئ أو طلب المساعدة الطبية الطارئة هسة بدون أي تأخير.',
    '• ممنوع انتظار نتائج فحوصات إضافية، والأفضل عدم قيادة السيارة بدون مرافق إذا الأعراض قوية أو وياها دوخة أو تعب شديد.',
    '• حنين مساعد تثقيفي وليست خدمة طوارئ، والأهم هسة الاطمئنان الطبي الفوري بقسم الطوارئ.',
  ].join('\n');
}

function buildMedicationRefusalText(dialectMode: HaneenDialectMode): string {
  if (dialectMode === 'msa_simple') {
    return [
      'أهلاً وسهلاً بكل ود 🌸 حرصاً على السلامة، لا يمكن لحنين كمساعد تثقيفي وصف الأدوية أو تحديد أو تعديل الجرعات (مثل الإنسولين أو المضادات الحيوية) أو إيقاف أي علاج.',
      '',
      '• تحديد الدواء أو الجرعة يعتمد على فحص الطبيب المباشر والأدوية الحالية والتاريخ الصحي.',
      '• يجب عدم إيقاف أو تغيير أي دواء مستخدم حالياً قبل مراجعة الطبيب المعالج.',
    ].join('\n');
  }

  return [
    'من عيوني 🌸 بس حفاظاً على السلامة، ما أگدر أوصف دواء أو أحدد وأعدّل جرعة علاج أو أنسولين أو أوصي بإيقاف أي دواء.',
    '',
    '💡 التوضيح البسيط:\nجرعة الدواء تعتمد على فحص الطبيب المباشر للحالة الحالية وبقية الأدوية المستخدمة، وأي تغيير بدون استشارة طبية ممكن يسبب ضرر.',
    '',
    '🩺 الخطوة الآمنة هسة:\nالاستمرار على العلاج مثل ما كاتبه الطبيب، وسؤال الطبيب المعالج بشكل مباشر: «دكتور، هل هاي الجرعة بعدها مناسبة للحالة والنتائج الحالية؟»',
  ].join('\n');
}

function buildImagingScanDiagnosisRefusalText(dialectMode: HaneenDialectMode): string {
  if (dialectMode === 'msa_simple') {
    return [
      'حفاظاً على الدقة والسلامة، لا يمكن لحنين تشخيص صور الأشعة أو الرنين أو المفراس أو الجزم بوجود ورم أو كسر أو جلطة من الصورة.',
      '',
      '• دور حنين التثقيفي هو تبسيط العبارات المكتوبة في تقرير طبيب الأشعة فقط.',
      '• يرجى عرض الصور والتقرير الرسمي على طبيب الأشعة والطبيب المعالج للتقييم الدقيق.',
    ].join('\n');
  }

  return [
    'ما أگدر أشخّص صور الأشعة أو الرنين أو المفراس، ولا أگدر أجزم من الصورة إذا اكو ورم أو كسر أو جلطة لا سامح الله.',
    '',
    '💡 التوضيح البسيط:\nقراءة صور الأشعة تحتاج شاشات طبية متخصصة ومقارنة ويا الفحص السريري، ودور حنين بس تشرح الكلمات المكتوبة بتقرير الأشعة الرسمي بكلام عراقي بسيط.',
    '',
    '🩺 الخطوة الآمنة هسة:\nعرض الصورة والتقرير على طبيب الأشعة والطبيب المعالج. وإذا يتوفر نص التقرير المكتوب، ممكن كتابته هنا حتى نوضح معاني الكلمات الموجودة بيه.',
  ].join('\n');
}

interface LabAnalyteLike {
  testName?: unknown;
  name?: unknown;
  code?: unknown;
  value?: unknown;
  unit?: unknown;
  referenceRange?: unknown;
  flag?: unknown;
}

const PLAIN_ANALYTE_EXPLANATIONS: Array<{ pattern: RegExp; measureAr: string; factorsAr: string }> = [
  {
    pattern: /(hemoglobin|\bhb\b|\bhgb\b|هيموغلوبين|هيموجلوبين)/i,
    measureAr: 'مادة موجودة بكريات الدم الحمراء وظيفتها تنقل الأوكسجين لكل الجسم',
    factorsAr: 'أحياناً يتأثر بمخزون الحديد، الفيتامينات، السوائل، أو عوامل ثانية بسيطة',
  },
  {
    pattern: /(ferritin|فيريتين|حديد)/i,
    measureAr: 'يعكس مخزون الحديد الموجود بالجسم واللي يحتاجه الدم لتكوين الهيموغلوبين',
    factorsAr: 'يتأثر بالتغذية، فقدان الدم، أو حتى وجود التهاب مؤقت بالجسم',
  },
  {
    pattern: /(glucose|سكر|غلوكوز|جلوكوز)/i,
    measureAr: 'يقيس نسبة السكر الموجودة بالدم لحظة سحب العينة',
    factorsAr: 'يتأثر هواي بالأكل والشرب قبل التحليل، الصيام، التوتر، أو الأدوية',
  },
  {
    pattern: /(hba1c|a1c|تراكمي)/i,
    measureAr: 'يعطي معدل مستوى السكر بالدم خلال آخر شهرين إلى 3 أشهر',
    factorsAr: 'يعكس فترة طويلة، لكن الطبيب يقرأه ويا العمر والحالة الصحية وهل اكو فقر دم',
  },
  {
    pattern: /(wbc|white|بيضاء)/i,
    measureAr: 'خلايا الدم البيضاء المسؤولة عن الدفاع ضد الجراثيم والالتهابات',
    factorsAr: 'ترتفع أو تتغير أحياناً مع التهاب بسيط، رشح، توتر، أو بعض الأدوية',
  },
  {
    pattern: /(platelet|صفائح|plt)/i,
    measureAr: 'خلايا صغيرة تساعد الدم يتخثر طبيعي وما يصير نزف',
    factorsAr: 'تتأثر أحياناً بالتهابات فيروسية عابرة أو أدوية معينة',
  },
  {
    pattern: /(creatinine|كرياتينين)/i,
    measureAr: 'مؤشر يساعد الطبيب يطمن على شلون الكلى دا تصفي الفضلات من الدم',
    factorsAr: 'يتأثر بشرب المي، الكتلة العضلية، المجهود، أو بعض الأدوية والمسكنات',
  },
  {
    pattern: /(alt|ast|sgpt|sgot)/i,
    measureAr: 'إنزيمات تعطي فكرة عامة عن سلامة خلايا الكبد والعضلات',
    factorsAr: 'تتأثر أحياناً بأدوية، دهون الكبد، أو حتى مجهود بدني قوي قبل الفحص',
  },
  {
    pattern: /(tsh|درقية)/i,
    measureAr: 'هرمون ينظم نشاط الغدة الدرقية اللي تتحكم بطاقة وحرق الجسم',
    factorsAr: 'يتأثر بوقت السحب، التوتر، أو أدوية الغدة في حال استخدامها',
  },
  {
    pattern: /(vitamin d|فيتامين د)/i,
    measureAr: 'فيتامين مهم لصحة العظام والعضلات والمناعة',
    factorsAr: 'يتأثر بالتعرض للشمس، الأكل، وأخذ المكملات',
  },
];

function describeAnalytePlainly(name: string): { measureAr: string; factorsAr: string } | null {
  for (const item of PLAIN_ANALYTE_EXPLANATIONS) {
    if (item.pattern.test(name)) {
      return { measureAr: item.measureAr, factorsAr: item.factorsAr };
    }
  }
  return null;
}

function formatLabResultContext(
  doc: Record<string, unknown>,
): { textBlock: string; plainSummaryLines: string[]; summary: HaneenAttachedReportSummary } {
  const labName = normalizeStr(doc.labNameAr || doc.labNameEn, 160) || 'مختبر طبي';
  const testDate = normalizeStr(doc.approvedAt || doc.updatedAt || doc.createdAt, 40).slice(0, 10);
  const title =
    normalizeStr(doc.panelTitle || doc.orderNumber || doc.testName, 160) || 'تقرير نتيجة مختبرية';
  const analytes = Array.isArray(doc.analytes) ? (doc.analytes as LabAnalyteLike[]) : [];

  const lines = [
    `[نتيجة تحليل مختبري مرفقة بموافقة المريض]`,
    `العنوان: ${title}`,
    `المختبر: ${labName}`,
    ...(testDate ? [`التاريخ: ${testDate}`] : []),
  ];
  const plainSummaryLines: string[] = [];

  if (analytes.length > 0) {
    lines.push('القيم المطبوعة:');
    for (const a of analytes.slice(0, 35)) {
      const name = normalizeStr(a.testName || a.name || a.code, 120) || 'فحص';
      const val = normalizeStr(a.value, 60) || String(a.value ?? '');
      const unit = normalizeStr(a.unit, 40);
      const ref = normalizeStr(a.referenceRange, 120);
      const flag = normalizeStr(a.flag, 40).toLowerCase();

      lines.push(
        `- ${name}: القيمة = ${val}${unit ? ` ${unit}` : ' (بدون وحدة مطبوعة)'} | المدى المرجعي المطبوع = ${
          ref || 'غير مذكور في التقرير (لا تخترع مدى مرجعياً)'
        }${flag ? ` | التصنيف = ${flag}` : ''}`,
      );

      const plainInfo = describeAnalytePlainly(name);
      const statusText =
        flag === 'high'
          ? 'أعلى من المعدل المطبوع بالتقرير'
          : flag === 'low'
            ? 'أقل من المعدل المطبوع بالتقرير'
            : flag === 'normal'
              ? 'ضمن المعدل المطبوع بالتقرير'
              : ref
                ? 'مكتوبة يم المعدل المطبوع بالتقرير'
                : 'المدى المرجعي غير مذكور في التقرير';

      plainSummaryLines.push(
        `• ${name} (${val}${unit ? ` ${unit}` : ''} — المعدل بالتقرير: ${
          ref || 'غير مذكور في التقرير'
        }): ${plainInfo ? `${plainInfo.measureAr}. ` : ''}النتيجة ${statusText}.${
          plainInfo ? ` ${plainInfo.factorsAr}، بس النتيجة وحدها ما تكفي حتى نحدد السبب.` : ''
        }`,
      );
    }
  }
  const comments = normalizeStr(doc.comments || doc.summary || doc.summaryNote, 600);
  if (comments) {
    lines.push(`ملاحظات المختبر المطبوعة: ${comments}`);
  }

  return {
    textBlock: lines.join('\n'),
    plainSummaryLines,
    summary: {
      kind: 'lab_result',
      label: title,
      labName,
      testDate,
      analytesCount: analytes.length,
    },
  };
}

const LAB_EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isMedicalLabReport: {
      type: Type.BOOLEAN,
      description: 'True if the attached image/PDF contains a printed or digital laboratory test report.',
    },
    isImagingFilmOnly: {
      type: Type.BOOLEAN,
      description:
        'True ONLY if the attachment is a radiology film/scan image (X-ray, MRI, CT, ultrasound image) without a printed lab table.',
    },
    imageClarity: {
      type: Type.STRING,
      description: 'One of: clear, partially_unclear, unreadable.',
    },
    clarityNoteAr: {
      type: Type.STRING,
      description:
        'Short neutral Arabic note describing image quality if partially_unclear or unreadable, otherwise empty string.',
    },
    pagesDetected: {
      type: Type.INTEGER,
      description: 'Number of report pages or images inspected.',
    },
    labName: {
      type: Type.STRING,
      description: 'Printed laboratory name if clearly readable, otherwise empty string.',
    },
    reportDate: {
      type: Type.STRING,
      description: 'Printed test/report date if clearly readable, otherwise empty string.',
    },
    sampleType: {
      type: Type.STRING,
      description: 'Printed specimen/sample type (e.g. Blood, Serum, Urine) if clearly readable.',
    },
    hasCriticalFlag: {
      type: Type.BOOLEAN,
      description:
        'True if any printed row or lab note explicitly displays Critical / Panic / Call Doctor Immediately.',
    },
    rows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          testName: {
            type: Type.STRING,
            description: 'Exact test name as printed on the report.',
          },
          shortName: {
            type: Type.STRING,
            description: 'Printed abbreviation if present (e.g. Hb, WBC, ALT), else empty string.',
          },
          value: {
            type: Type.STRING,
            description:
              'Exact printed result value preserving decimals, commas, < or > signs, or qualitative text (Positive/Negative). Use "غير مقروء" if blurry/cropped.',
          },
          unit: {
            type: Type.STRING,
            description: 'Exact printed unit (e.g. g/dL, mg/dL, 10^3/uL), or "غير مذكورة" if absent.',
          },
          referenceRange: {
            type: Type.STRING,
            description:
              'Exact printed reference range from the report ONLY. Never invent a range; use "غير مذكور في التقرير" if not printed.',
          },
          labFlag: {
            type: Type.STRING,
            description: 'Printed flag such as H, L, High, Low, Positive, Negative, Critical, or empty string.',
          },
          comparisonStatus: {
            type: Type.STRING,
            description:
              'One of: within_range, above_range, below_range, qualitative, undetermined, unreadable.',
          },
          confidence: {
            type: Type.STRING,
            description: 'One of: clear, needs_confirmation, unreadable.',
          },
        },
        required: [
          'testName',
          'value',
          'unit',
          'referenceRange',
          'comparisonStatus',
          'confidence',
        ],
      },
    },
    nonReadableNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Arabic notes listing any cropped/blurry lines or missing sections.',
    },
  },
  required: [
    'isMedicalLabReport',
    'isImagingFilmOnly',
    'imageClarity',
    'pagesDetected',
    'hasCriticalFlag',
    'rows',
  ],
};

function isMissingOrUnreadableText(val: string): boolean {
  const s = val.trim().toLowerCase();
  if (!s) return true;
  return (
    s === 'غير مذكور' ||
    s === 'غير مذكورة' ||
    s === 'غير مذكور في التقرير' ||
    s === 'غير مطبوع' ||
    s === 'غير مطبوع في التقرير' ||
    s === 'غير مطبوع بالتقرير' ||
    s === 'غير محدد' ||
    s === 'غير مقروء' ||
    s === 'غير واضح' ||
    s === 'unreadable' ||
    s === 'unclear' ||
    s === 'not printed' ||
    s === 'not_printed' ||
    s === 'not mentioned' ||
    s === 'not_mentioned' ||
    s === 'n/a' ||
    s === 'none' ||
    /^-+$/.test(s) ||
    /^\?+$/.test(s)
  );
}

const VALID_COMPARISON_STATUSES = new Set<HaneenLabComparisonStatus>([
  'within_range',
  'above_range',
  'below_range',
  'qualitative',
  'undetermined',
  'unreadable',
]);

const VALID_CONFIDENCES = new Set<HaneenExtractionConfidence>([
  'clear',
  'needs_confirmation',
  'unreadable',
]);

export function postProcessExtractedLabReport(
  raw: Record<string, unknown>,
  defaultPages: number,
): HaneenExtractedLabReport {
  const clarityRaw = normalizeStr(raw.imageClarity, 32);
  const imageClarity: HaneenExtractedLabReport['imageClarity'] =
    clarityRaw === 'clear' || clarityRaw === 'partially_unclear' || clarityRaw === 'unreadable'
      ? clarityRaw
      : 'partially_unclear';

  const rawRows = Array.isArray(raw.rows) ? (raw.rows as Array<Record<string, unknown>>) : [];
  const rows: HaneenExtractedLabRow[] = [];

  for (const r of rawRows.slice(0, 60)) {
    const testName = normalizeStr(r.testName, 140);
    if (!testName) continue;
    const shortName = normalizeStr(r.shortName, 40);
    const value = normalizeStr(r.value, 80) || 'غير مقروء';
    const unit = normalizeStr(r.unit, 48) || 'غير مذكورة';
    const referenceRange = normalizeStr(r.referenceRange, 140) || 'غير مذكور في التقرير';
    const labFlag = normalizeStr(r.labFlag, 40);

    const confRaw = normalizeStr(r.confidence, 32) as HaneenExtractionConfidence;
    let confidence: HaneenExtractionConfidence = VALID_CONFIDENCES.has(confRaw)
      ? confRaw
      : 'needs_confirmation';

    const statusRaw = normalizeStr(r.comparisonStatus, 32) as HaneenLabComparisonStatus;
    let comparisonStatus: HaneenLabComparisonStatus = VALID_COMPARISON_STATUSES.has(statusRaw)
      ? statusRaw
      : 'undetermined';

    const valueUnreadable = /^(غير مقروء|غير واضح|unreadable|unclear|\?+|n\/a)$/i.test(
      value.trim(),
    );
    if (valueUnreadable) {
      confidence = 'unreadable';
      comparisonStatus = 'unreadable';
    } else if (confidence === 'unreadable') {
      comparisonStatus = 'unreadable';
    }

    // Never classify numeric rows as within/above/below when no reference range is printed
    if (
      isMissingOrUnreadableText(referenceRange) &&
      (comparisonStatus === 'within_range' ||
        comparisonStatus === 'above_range' ||
        comparisonStatus === 'below_range')
    ) {
      comparisonStatus = 'undetermined';
    }

    rows.push({
      testName,
      ...(shortName ? { shortName } : {}),
      value,
      unit,
      referenceRange,
      ...(labFlag ? { labFlag } : {}),
      comparisonStatus,
      confidence,
    });
  }

  let withinRangeCount = 0;
  let outOfRangeCount = 0;
  let undeterminedCount = 0;
  let unreadableCount = 0;
  for (const row of rows) {
    if (row.comparisonStatus === 'within_range') withinRangeCount++;
    else if (row.comparisonStatus === 'above_range' || row.comparisonStatus === 'below_range')
      outOfRangeCount++;
    else if (row.comparisonStatus === 'unreadable') unreadableCount++;
    else undeterminedCount++;
  }

  const labName = normalizeStr(raw.labName, 160);
  const reportDate = normalizeStr(raw.reportDate, 40);
  const sampleType = normalizeStr(raw.sampleType, 80);
  const nonReadableNotes = Array.isArray(raw.nonReadableNotes)
    ? (raw.nonReadableNotes as unknown[]).map((n) => normalizeStr(n, 240)).filter(Boolean).slice(0, 12)
    : [];

  return {
    isMedicalLabReport: Boolean(raw.isMedicalLabReport),
    isImagingFilmOnly: Boolean(raw.isImagingFilmOnly),
    imageClarity:
      rows.length === 0 && imageClarity !== 'unreadable' && Boolean(raw.isMedicalLabReport) === false
        ? 'unreadable'
        : imageClarity,
    clarityNoteAr: normalizeStr(raw.clarityNoteAr, 400) || undefined,
    pagesDetected:
      typeof raw.pagesDetected === 'number' && raw.pagesDetected > 0
        ? Math.round(raw.pagesDetected)
        : defaultPages,
    ...(labName || reportDate || sampleType
      ? {
          reportHeader: {
            ...(labName ? { labName } : {}),
            ...(reportDate ? { reportDate } : {}),
            ...(sampleType ? { sampleType } : {}),
          },
        }
      : {}),
    hasCriticalFlag: Boolean(raw.hasCriticalFlag),
    rows,
    ...(nonReadableNotes.length > 0 ? { nonReadableNotes } : {}),
    summaryCounts: {
      totalRows: rows.length,
      withinRangeCount,
      outOfRangeCount,
      undeterminedCount,
      unreadableCount,
    },
  };
}

export async function extractLabReportFromMediaWithGemini(params: {
  aiClient: GoogleGenAI;
  mediaParts: InlineMediaPart[];
  userText: string;
}): Promise<HaneenExtractedLabReport> {
  const guidancePack = loadLabReadingGuidancePack();
  const extractionSystemInstruction = [
    'أنت محرك استخراج دقيق لبيانات تقارير التحاليل المختبرية من الصور وملفات PDF الطبية.',
    'قواعد الاستخراج الإلزامية:',
    '1. اقرأ محتوى الصورة/PDF المرفقة فعلياً قبل كتابة أي نتيجة.',
    '2. استخرج كل صف تحليل بشكل مستقل: الاسم الدقيق، الاختصار إن وجد، القيمة كما هي مطبوعة تماماً (مع الفاصلة العشرية أو السالب أو < أو > أو Positive/Negative)، الوحدة كما هي، المجال المرجعي المطبوع في التقرير نفسه فقط، وعلامة المختبر (H/L/High/Low/Critical).',
    '3. حافظ على تطابق كل صف وعدم خلط المجال المرجعي مع النتيجة أو رقم الصفحة/العينة.',
    '4. انتبه للفروق بين 0 و O، و1 و I، والنقطة العشرية والفاصلة.',
    '5. لا تحول الوحدات ولا تعيد حساب القيم ولا تخمّن أي مجال مرجعي مفقود (اكتب: "غير مذكور في التقرير").',
    '6. إذا كانت القيمة غير واضحة أو الصورة مقطوعة أو مموهة، اجعل القيمة "غير مقروء" وconfidence="unreadable" وcomparisonStatus="unreadable" ولا تخمّن.',
    '7. لا تصنف أي قيمة ضمن/أعلى/أقل بدون مجال مرجعي مطبوع واضح (استخدم "undetermined").',
    '8. لا تدرج اسم المريض أو رقم هاتفه في الحقول المستخرجة.',
    '9. إذا كانت الصورة مجرد فيلم أشعة/رنين/سونار بدون تقرير تحاليل مطبوع، ضع isImagingFilmOnly=true وisMedicalLabReport=false.',
    guidancePack.imageExtractionSpecAr ? `\nمواصفات إضافية:\n${guidancePack.imageExtractionSpecAr}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const extractionPrompt = [
    `استخرج بيانات تقرير التحاليل من المرفق (${params.mediaParts.length} ملف/صفحة).`,
    params.userText ? `سؤال المريض المرافق: ${params.userText}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const response = await params.aiClient.models.generateContent({
    model: HANEEN_GEMINI_MODEL,
    contents: {
      parts: [...params.mediaParts, { text: extractionPrompt }],
    },
    config: {
      systemInstruction: extractionSystemInstruction,
      responseMimeType: 'application/json',
      responseSchema: LAB_EXTRACTION_RESPONSE_SCHEMA,
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MEDIUM,
      },
    },
  });

  const rawText = (response.text || '').trim();
  const cleanJson = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleanJson) as Record<string, unknown>;
  } catch {
    throw new Error('INVALID_VISION_EXTRACTION_JSON');
  }

  return postProcessExtractedLabReport(parsed, params.mediaParts.length);
}

function comparisonStatusLabelAr(status: HaneenLabComparisonStatus): string {
  switch (status) {
    case 'within_range':
      return 'ضمن المجال المرجعي المطبوع';
    case 'above_range':
      return 'أعلى من المجال المرجعي المطبوع';
    case 'below_range':
      return 'أقل من المجال المرجعي المطبوع';
    case 'qualitative':
      return 'نتيجة نوعية';
    case 'unreadable':
      return 'غير مقروء بثقة';
    default:
      return 'غير محدد';
  }
}

export function buildLabReportTableMarkdown(report: HaneenExtractedLabReport): string {
  if (report.rows.length === 0) return '';
  const lines = [
    '| التحليل | النتيجة | الوحدة | المجال المرجعي في التقرير | المقارنة |',
    '|---|---:|---|---|---|',
  ];
  for (const r of report.rows) {
    const label = r.shortName && !r.testName.includes(r.shortName)
      ? `${r.testName} (${r.shortName})`
      : r.testName;
    const statusText = comparisonStatusLabelAr(r.comparisonStatus);
    const flagSuffix = r.labFlag ? ` (${r.labFlag})` : '';
    lines.push(
      `| ${label.replace(/\|/g, '/')} | ${r.value.replace(/\|/g, '/')} | ${r.unit.replace(/\|/g, '/')} | ${r.referenceRange.replace(/\|/g, '/')} | ${statusText}${flagSuffix} |`,
    );
  }
  return lines.join('\n');
}

export function buildUnreadableReportResponseText(report: HaneenExtractedLabReport): string {
  const note = report.clarityNoteAr
    ? `\n\n📌 سبب عدم الوضوح: ${report.clarityNoteAr}`
    : '';
  return [
    'الصورة المرفوعة غير واضحة بما يكفي لقراءة الأرقام والوحدات بشكل موثوق، ولهذا السبب ما أخمّن أي قيمة أو مجال مرجعي.' +
      note,
    '',
    '💡 حتى نضمن قراءة دقيقة 100% بدون أي خطأ:',
    '• التقاط صورة جديدة في إضاءة جيدة وبشكل عمودي مباشر فوق الورقة.',
    '• التأكد أن اسم التحليل والنتيجة والوحدة والمجال المرجعي المطبوع ظاهرة كلها وغير مقطوعة أو مهتزة.',
    '• لو التقرير طويل، ممكن تصويره على صفحتين أو ثلاث وإرفاقها سوية، أو إرسال صورة واضحة من السجل الطبي.',
  ].join('\n');
}

export function buildStructuredFallbackFromExtractedReport(report: HaneenExtractedLabReport): string {
  const parts: string[] = [];
  if (report.hasCriticalFlag) {
    parts.push(
      '⚠️ تنبيه عاجل: يظهر في التقرير مؤشر حرج (Critical). يرجى التواصل الفوري مع الطبيب المعالج أو التوجه لأقرب مركز رعاية طبية عاجلة دون انتظار.',
    );
    parts.push('');
  }
  parts.push(
    'قرأت التقرير المرفوع. هذه البيانات التي تمكنت من استخراجها، راجع الأرقام والوحدات للتأكد من مطابقتها للصورة:',
  );
  parts.push('');
  parts.push(buildLabReportTableMarkdown(report));
  parts.push('');
  parts.push('💡 شرح مبسط للنتائج المستخرجة:');
  for (const row of report.rows) {
    const info = describeAnalytePlainly(`${row.testName} ${row.shortName || ''}`);
    const statusDesc = comparisonStatusLabelAr(row.comparisonStatus);
    if (row.comparisonStatus === 'unreadable') {
      parts.push(
        `• ${row.testName}: هذا السطر لم يُقرأ بثقة كافية من الصورة (${row.value}) — يُرجى إرسال صورة أوضح لهذا الجزء.`,
      );
      continue;
    }
    parts.push(
      `• ${row.testName} (${row.value} ${row.unit === 'غير مذكورة' ? '' : row.unit} — المجال بالتقرير: ${row.referenceRange}): ${
        info ? `${info.measureAr}. ` : ''
      }الحالة: ${statusDesc}. ${
        info ? `${info.factorsAr}، و` : ''
      }تقييم النتيجة يعتمد على الأعراض والفحص لدى الطبيب المعالج.`,
    );
  }
  parts.push('');
  parts.push(
    '📋 الملخص:\n' +
      `• ضمن المجال المرجعي المطبوع: ${report.summaryCounts.withinRangeCount}\n` +
      `• خارج المجال المرجعي المطبوع: ${report.summaryCounts.outOfRangeCount}\n` +
      `• غير محدد / نوعي: ${report.summaryCounts.undeterminedCount}\n` +
      `• غير مقروء بثقة: ${report.summaryCounts.unreadableCount}`,
  );
  parts.push('');
  parts.push(
    '🩺 تنبيه طبي: هذا شرح معلوماتي للتقرير وليس تشخيصاً أو وصفة علاجية. تفسير النتائج النهائي يعتمد على الأعراض والفحص والتاريخ الصحي وبقية الفحوصات، لذلك ناقشها مع طبيبك.',
  );
  return parts.join('\n');
}

function buildFallbackAssistantResponse(params: {
  userText: string;
  attachedTextBlocks: string[];
  plainLabLines: string[];
  citations: HaneenCitation[];
  matchedSources: HaneenKnowledgeSource[];
  hasUploadedAttachment: boolean;
  detailLevel: HaneenDetailLevel;
}): string {
  const parts: string[] = [];

  if (params.attachedTextBlocks.length > 0) {
    parts.push('هاي قراءة بسيطة ومباشرة لنتيجة التحليل حسب الأرقام والمعدل المطبوع بالورقة:');
    if (params.plainLabLines.length > 0) {
      parts.push('');
      parts.push('💡 التوضيح البسيط:\n' + params.plainLabLines.join('\n'));
    }
    parts.push('');
    parts.push('الأرقام المطبوعة بالتقرير:');
    parts.push(params.attachedTextBlocks.join('\n\n'));
    parts.push('');
    parts.push(
      '🩺 الخطوة الآمنة هسة:\nالتحليل لوحده ما يكفي حتى نشخص سبب أو نغيّر علاج—الأفضل عرض هاي النتيجة على الطبيب المعالج حتى يربطها ويا الأعراض. وإذا اكو فحص ما مكتوب إله مدى مرجعي بالتقرير، ما نخمنه ونرجع للمختبر أو الطبيب.',
    );
    parts.push('');
    parts.push('❓ هل اكو واحد من هاي الفحوصات يحتاج توضيح أكثر، لو اكو أعراض معينة؟');
  } else if (params.hasUploadedAttachment) {
    parts.push('تعذر إتمام قراءة صورة التقرير عبر خدمة الرؤية الذكية حالياً، وحتى ما يصير أي تخمين للأرقام الأفضل المحاولة لاحقاً أو إرسال القيم المكتوبة يدوياً.');
  } else {
    parts.push('هاي الخلاصة السريعة والبسيطة للسؤال:');
    if (params.matchedSources.length > 0) {
      const src = params.matchedSources[0];
      const snippet = extractCleanEducationalSnippet(src);
      if (snippet) {
        parts.push('');
        parts.push(`💡 التوضيح البسيط:\n${snippet}`);
      }
    }
    parts.push('');
    parts.push(
      '🩺 الخطوة الآمنة هسة:\nإذا اكو ورقة تحليل أو أعراض مستمرة، الأفضل مراجعة الطبيب المعالج لتقييم الحالة بشكل كامل.',
    );
    parts.push('');
    parts.push('❓ ممكن كتابة تفاصيل أكثر أو رقم تحليل معين حتى نوضحه ببساطة؟');
  }

  return parts.join('\n');
}

function buildConversationMemorySummary(
  messages: HaneenMessage[],
  maxMessages: number,
): {
  historyText: string;
  previousAssistantDetailLevel?: HaneenDetailLevel;
  lastSubstantiveUserQuery: string;
  hasMedicalHistory: boolean;
} {
  const recent = messages.slice(-(maxMessages + 1), -1);
  let previousAssistantDetailLevel: HaneenDetailLevel | undefined;
  let lastSubstantiveUserQuery = '';
  let hasMedicalHistory = false;

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.attachedReportSummary) {
      hasMedicalHistory = true;
    }
    if (!previousAssistantDetailLevel && m.role === 'assistant' && m.detailLevel) {
      previousAssistantDetailLevel = m.detailLevel;
    }
    if (!lastSubstantiveUserQuery && m.role === 'user') {
      const check = detectRequestedDetailLevel(m.text);
      if (!check.isFollowUpExpansion && m.text.trim().length > 3) {
        lastSubstantiveUserQuery = m.text.trim();
      }
    }
  }

  const historyLines = recent
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'المريض' : 'حنين'}: ${m.text.slice(0, 400)}`);

  return {
    historyText: historyLines.join('\n'),
    previousAssistantDetailLevel,
    lastSubstantiveUserQuery,
    hasMedicalHistory,
  };
}

export function createHaneenRouter(deps: HaneenRouterDeps): Router {
  const router = express.Router();
  const store =
    deps.store ||
    new HaneenStore({
      getAdminDb: deps.getAdminDb,
      isFirestoreAdminReady: deps.isFirestoreAdminReady,
    });

  // Safe general-knowledge response cache ONLY for non-personalized, unattached general questions.
  const generalAnswerCache = new Map<string, GeneralAnswerCacheEntry>();

  function getCachedGeneralAnswer(key: string): GeneralAnswerCacheEntry | null {
    const entry = generalAnswerCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > GENERAL_CACHE_TTL_MS) {
      generalAnswerCache.delete(key);
      return null;
    }
    // Refresh LRU order
    generalAnswerCache.delete(key);
    generalAnswerCache.set(key, entry);
    return entry;
  }

  function setCachedGeneralAnswer(key: string, value: GeneralAnswerCacheEntry): void {
    if (generalAnswerCache.size >= GENERAL_CACHE_MAX_ENTRIES) {
      const oldestKey = generalAnswerCache.keys().next().value;
      if (oldestKey) generalAnswerCache.delete(oldestKey);
    }
    generalAnswerCache.set(key, value);
  }

  async function requireVerifiedPatientActor(
    req: Request,
    res: Response,
  ): Promise<VerifiedPatientContext | null> {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'UNAUTHENTICATED' });
      return null;
    }

    try {
      const decoded = await deps.adminAuth.verifyIdToken(token, false);
      if (!decoded.uid || decoded.email_verified !== true) {
        res.status(401).json({ error: 'EMAIL_NOT_VERIFIED' });
        return null;
      }

      const db = deps.getAdminDb();
      let userDoc: Record<string, unknown> | null = null;
      let patientDoc: Record<string, unknown> | null = null;

      if (db && deps.isFirestoreAdminReady()) {
        const [uSnap, pSnap] = await Promise.all([
          db.doc(`users/${decoded.uid}`).get(),
          db.doc(`patient_profiles/${decoded.uid}`).get(),
        ]);
        userDoc = uSnap.exists ? serializeDoc(uSnap.data()) : null;
        patientDoc = pSnap.exists ? serializeDoc(pSnap.data()) : null;
      } else {
        const [uRest, pRest] = await Promise.all([
          deps.restDb.getDoc(token, `users/${decoded.uid}`).catch(() => null),
          deps.restDb.getDoc(token, `patient_profiles/${decoded.uid}`).catch(() => null),
        ]);
        userDoc = uRest;
        patientDoc = pRest;
      }

      if (userDoc?.accountStatus === 'suspended' || userDoc?.accountStatus === 'restricted') {
        res.status(403).json({ error: 'ACCOUNT_SUSPENDED' });
        return null;
      }

      const hasActivePatientProfile = patientDoc?.status === 'active';
      const isPatientSelected =
        userDoc?.selectedPortal === 'patient' &&
        (userDoc?.accountStatus === 'active' || userDoc?.registrationCompleted === true);

      if (!hasActivePatientProfile && !isPatientSelected) {
        res.status(403).json({
          error: 'PATIENT_PORTAL_ONLY',
          message: 'حنين الذكية متاحة حصراً داخل بوابة المريض المفعّلة.',
        });
        return null;
      }

      const dob = normalizeStr(patientDoc?.dateOfBirth || userDoc?.dateOfBirth, 24);
      const gender = normalizeStr(patientDoc?.gender || userDoc?.gender, 20);
      const fullName =
        normalizeStr(patientDoc?.fullName || userDoc?.fullName || decoded.name, 120) || 'المريض';

      return {
        uid: decoded.uid,
        token,
        email: (decoded.email || '').trim().toLowerCase(),
        fullName,
        gender: gender || undefined,
        dateOfBirth: dob || undefined,
        age: computeAgeFromDob(dob),
      };
    } catch {
      res.status(401).json({ error: 'INVALID_OR_EXPIRED_TOKEN' });
      return null;
    }
  }

  async function readPatientOwnedDoc(
    actor: VerifiedPatientContext,
    collectionName: 'lab_results' | 'patient_medical_files',
    docId: string,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; status: 403 | 404; code: string }
  > {
    const cleanId = normalizeStr(docId, 128);
    if (!cleanId) {
      return { ok: false, status: 404, code: 'RESOURCE_NOT_FOUND' };
    }
    const db = deps.getAdminDb();
    let doc: Record<string, unknown> | null = null;
    if (db && deps.isFirestoreAdminReady()) {
      const snap = await db.doc(`${collectionName}/${cleanId}`).get();
      doc = snap.exists ? serializeDoc(snap.data()) : null;
    } else {
      try {
        doc = await deps.restDb.getDoc(actor.token, `${collectionName}/${cleanId}`);
      } catch {
        return { ok: false, status: 403, code: 'FORBIDDEN_RESOURCE' };
      }
    }

    if (!doc) {
      return { ok: false, status: 404, code: 'RESOURCE_NOT_FOUND' };
    }
    if (doc.patientUid !== actor.uid && doc.linkedPatientUid !== actor.uid) {
      return { ok: false, status: 403, code: 'FORBIDDEN_CROSS_PATIENT_ACCESS' };
    }
    return { ok: true, data: doc };
  }

  async function listPatientOwnedLabResults(
    actor: VerifiedPatientContext,
    requestedIds?: string[],
  ): Promise<
    | { ok: true; docs: Array<Record<string, unknown>> }
    | { ok: false; status: 403 | 404; code: string }
  > {
    if (requestedIds && requestedIds.length > 0) {
      const out: Array<Record<string, unknown>> = [];
      for (const id of requestedIds.slice(0, 30)) {
        const check = await readPatientOwnedDoc(actor, 'lab_results', id);
        if (!check.ok) {
          return check;
        }
        out.push(check.data);
      }
      return { ok: true, docs: out };
    }

    const db = deps.getAdminDb();
    if (db) {
      const [byLinked, byPatient] = await Promise.all([
        db.collection('lab_results').where('linkedPatientUid', '==', actor.uid).limit(100).get().catch(() => ({ docs: [] })),
        db.collection('lab_results').where('patientUid', '==', actor.uid).limit(100).get().catch(() => ({ docs: [] })),
      ]);
      const seen = new Set<string>();
      const merged: Array<Record<string, unknown>> = [];
      for (const snap of [byLinked, byPatient]) {
        for (const docSnap of snap.docs) {
          if (seen.has(docSnap.id)) continue;
          seen.add(docSnap.id);
          const data = serializeDoc(docSnap.data());
          if (data) {
            merged.push({ ...data, resultId: data.resultId || docSnap.id });
          }
        }
      }
      return { ok: true, docs: merged };
    }

    const restRows = await deps.restDb
      .listCollection(actor.token, 'lab_results', { limit: 100 })
      .catch(() => []);
    const owned = restRows.filter(
      (r) => r.patientUid === actor.uid || r.linkedPatientUid === actor.uid,
    );
    return { ok: true, docs: owned };
  }

  router.get('/patient/haneen/bootstrap', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;

    const settings = store.getSettings();
    const sourcesMetadata = store
      .getKnowledgeSources()
      .filter((s) => s.enabled)
      .map(toCitation);

    let conversations = store.listPatientConversations(actor.uid);
    if (conversations.length === 0) {
      const created = store.createConversation(actor.uid);
      conversations = [created];
    }

    const requestedConvId = normalizeStr(req.query.conversationId, 128);
    let activeConvId = conversations[0].conversationId;
    if (requestedConvId) {
      const check = store.getConversationForPatient(requestedConvId, actor.uid);
      if (!check.ok) {
        res.status(check.reason === 'FORBIDDEN' ? 403 : 404).json({
          error:
            check.reason === 'FORBIDDEN'
              ? 'FORBIDDEN_CONVERSATION_ACCESS'
              : 'CONVERSATION_NOT_FOUND',
        });
        return;
      }
      activeConvId = check.conversation.conversationId;
    }

    const msgRes = store.getMessagesForConversation(activeConvId, actor.uid);
    res.json({
      settings: {
        enabled: settings.enabled,
        dialectMode: settings.dialectMode,
        allowReportAttachment: settings.allowReportAttachment,
        emergencyInstructionAr: settings.emergencyInstructionAr,
        emergencyInstructionEn: settings.emergencyInstructionEn,
        rateLimitPerHour: settings.rateLimitPerHour,
      },
      geminiConfigured: Boolean(deps.aiClientOverride || isGeminiApiConfigured()),
      sourcesMetadata,
      libraryStats: {
        specialtiesCount: store.getSpecialties().filter((s) => s.enabled).length,
        approvedTopicsCount: store.getApprovedTopics().length,
        glossaryCount: store.getGlossaryEntries().length,
      },
      conversations,
      activeConversationId: activeConvId,
      messages: msgRes.ok ? msgRes.messages : [],
    });
  });

  router.get('/patient/haneen/glossary', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;
    res.json({
      glossary: store.getGlossaryEntries(),
      specialtiesCount: store.getSpecialties().filter((s) => s.enabled).length,
      approvedTopicsCount: store.getApprovedTopics().length,
    });
  });

  router.post('/patient/haneen/compare-results', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;

    if (req.body?.consentGiven !== true) {
      res.status(403).json({
        error: 'CONSENT_REQUIRED',
        message: 'يجب تفعيل الموافقة الصريحة أولاً قبل مقارنة نتائج التحاليل عبر الزمن.',
      });
      return;
    }

    const requestedIds = Array.isArray(req.body?.resultIds)
      ? (req.body.resultIds as unknown[]).map((id) => normalizeStr(id, 128)).filter(Boolean)
      : undefined;

    const ownedCheck = await listPatientOwnedLabResults(actor, requestedIds);
    if (!ownedCheck.ok) {
      res.status(ownedCheck.status).json({ error: ownedCheck.code });
      return;
    }

    const comparison = comparePatientLabResultsSafe(ownedCheck.docs as RawPatientLabResultDoc[]);
    res.json(comparison);
  });

  router.post('/patient/haneen/conversations', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;
    const title = normalizeStr(req.body?.title, 80) || 'محادثة تثقيفية جديدة';
    const conversation = store.createConversation(actor.uid, title);
    res.status(201).json({ conversation });
  });

  router.patch('/patient/haneen/conversations/:conversationId/consent', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;

    const conversationId = normalizeStr(req.params.conversationId, 128);
    const consentGiven = Boolean(req.body?.consentGiven);
    const sharedResultIds = Array.isArray(req.body?.sharedResultIds)
      ? (req.body.sharedResultIds as unknown[])
          .map((id) => normalizeStr(id, 128))
          .filter(Boolean)
          .slice(0, 5)
      : undefined;
    const sharedFileIds = Array.isArray(req.body?.sharedFileIds)
      ? (req.body.sharedFileIds as unknown[])
          .map((id) => normalizeStr(id, 128))
          .filter(Boolean)
          .slice(0, 5)
      : undefined;

    if (consentGiven && sharedResultIds) {
      for (const rId of sharedResultIds) {
        const check = await readPatientOwnedDoc(actor, 'lab_results', rId);
        if (!check.ok) {
          res.status(check.status).json({ error: check.code });
          return;
        }
      }
    }
    if (consentGiven && sharedFileIds) {
      for (const fId of sharedFileIds) {
        const check = await readPatientOwnedDoc(actor, 'patient_medical_files', fId);
        if (!check.ok) {
          res.status(check.status).json({ error: check.code });
          return;
        }
      }
    }

    const result = store.updateConversationConsent(conversationId, actor.uid, {
      consentGiven,
      sharedResultIds,
      sharedFileIds,
    });
    if (!result.ok) {
      res.status(result.reason === 'FORBIDDEN' ? 403 : 404).json({
        error:
          result.reason === 'FORBIDDEN'
            ? 'FORBIDDEN_CONVERSATION_ACCESS'
            : 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    res.json({ conversation: result.conversation });
  });

  router.delete('/patient/haneen/conversations/:conversationId', async (req, res) => {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;

    const conversationId = normalizeStr(req.params.conversationId, 128);
    const result = store.deleteConversationForPatient(conversationId, actor.uid);
    if (!result.ok) {
      res.status(result.reason === 'FORBIDDEN' ? 403 : 404).json({
        error:
          result.reason === 'FORBIDDEN'
            ? 'FORBIDDEN_CONVERSATION_ACCESS'
            : 'CONVERSATION_NOT_FOUND',
      });
      return;
    }

    res.json({ ok: true });
  });

  async function loadInlineMediaFromPatientFileDoc(
    fileDoc: Record<string, unknown>,
    actorUid: string,
  ): Promise<InlineMediaPart | null> {
    const fileObj = (fileDoc.file as Record<string, unknown> | undefined) || {};
    const url = normalizeStr(fileObj.url || fileDoc.fileUrl || fileDoc.url, 1400);
    const fileName = normalizeStr(fileObj.name || fileDoc.title, 120);
    const fallbackMime = normalizeAttachmentMimeType(
      fileObj.mimeType || fileDoc.mimeType,
      fileName,
    );

    const mediaMatch = url.match(/^\/api\/media\/(?:private|public)\/([a-zA-Z0-9_-]{4,120})$/);
    if (mediaMatch) {
      const assetId = mediaMatch[1];
      const db = deps.getAdminDb();
      if (db) {
        const assetSnap = await db.doc(`medora_media_assets/${assetId}`).get().catch(() => null);
        if (assetSnap?.exists) {
          const asset = assetSnap.data() as Record<string, unknown>;
          const ownerUid = normalizeStr(asset.ownerUid, 128);
          if (!ownerUid || ownerUid === actorUid) {
            const rawData = normalizeStr(asset.dataBase64 || asset.data, MAX_SINGLE_UPLOAD_BASE64_BYTES * 2);
            const cleanBase64 = rawData.replace(/^data:[^;]+;base64,/i, '');
            const resolvedMime = normalizeAttachmentMimeType(
              asset.contentType || fallbackMime,
              normalizeStr(asset.fileName, 120) || fileName,
            );
            if (cleanBase64 && ALLOWED_UPLOAD_MIME_TYPES.has(resolvedMime)) {
              return { inlineData: { data: cleanBase64, mimeType: resolvedMime } };
            }
          }
        }
      }
    }

    if (
      url.startsWith('https://') &&
      (url.includes('firebasestorage.googleapis.com') ||
        url.includes('firebasestorage.app') ||
        url.includes('storage.googleapis.com'))
    ) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const ct = normalizeAttachmentMimeType(
            resp.headers.get('content-type') || fallbackMime,
            fileName,
          );
          if (ALLOWED_UPLOAD_MIME_TYPES.has(ct)) {
            const arr = await resp.arrayBuffer();
            if (arr.byteLength > 0 && arr.byteLength <= MAX_SINGLE_UPLOAD_BASE64_BYTES) {
              return {
                inlineData: {
                  data: Buffer.from(arr).toString('base64'),
                  mimeType: ct,
                },
              };
            }
          }
        }
      } catch {
        // Non-fatal: continue with metadata if storage fetch fails
      }
    }

    return null;
  }

  async function executeHaneenChatRequest(
    req: Request,
    res: Response,
    options: { stream: boolean },
  ): Promise<void> {
    const actor = await requireVerifiedPatientActor(req, res);
    if (!actor) return;

    const startMs = Date.now();
    const settings = store.getSettings();
    if (!settings.enabled) {
      res.status(503).json({
        error: 'HANEEN_DISABLED',
        message: 'خدمة حنين الذكية متوقفة مؤقتاً من قبل الإدارة.',
      });
      return;
    }

    const conversationId = normalizeStr(req.body?.conversationId, 128);
    const userText = normalizeStr(req.body?.message, 2500);
    const attachedResultId = normalizeStr(req.body?.attachedResultId, 128);
    const attachedFileId = normalizeStr(req.body?.attachedFileId, 128);
    const requestedDetailRaw = req.body?.detailLevel;
    const explicitDetailLevel: HaneenDetailLevel | undefined =
      requestedDetailRaw === 'brief' ||
      requestedDetailRaw === 'standard' ||
      requestedDetailRaw === 'detailed'
        ? requestedDetailRaw
        : undefined;

    type RawUploadedAttachment = { base64Data?: unknown; mimeType?: unknown; fileName?: unknown };
    const rawUploads: RawUploadedAttachment[] = [];
    if (Array.isArray(req.body?.uploadedAttachments)) {
      for (const item of req.body.uploadedAttachments as unknown[]) {
        if (item && typeof item === 'object') {
          rawUploads.push(item as RawUploadedAttachment);
        }
      }
    } else if (
      req.body?.uploadedAttachment &&
      typeof req.body.uploadedAttachment === 'object'
    ) {
      rawUploads.push(req.body.uploadedAttachment as RawUploadedAttachment);
    }

    const validRawUploads = rawUploads
      .filter((u) => typeof u.base64Data === 'string' && u.base64Data.trim().length > 0)
      .slice(0, MAX_UPLOAD_FILES_PER_MESSAGE);

    if (!conversationId) {
      res.status(400).json({ error: 'CONVERSATION_ID_REQUIRED' });
      return;
    }
    if (!userText && !attachedResultId && !attachedFileId && validRawUploads.length === 0) {
      res.status(400).json({ error: 'MESSAGE_REQUIRED' });
      return;
    }

    // 1. Strict patient ownership check
    const convCheck = store.getConversationForPatient(conversationId, actor.uid);
    if (!convCheck.ok) {
      res.status(convCheck.reason === 'FORBIDDEN' ? 403 : 404).json({
        error:
          convCheck.reason === 'FORBIDDEN'
            ? 'FORBIDDEN_CONVERSATION_ACCESS'
            : 'CONVERSATION_NOT_FOUND',
      });
      return;
    }
    const conversation = convCheck.conversation;

    // 2. Rate limiting per patient
    const rateCheck = store.checkAndConsumeRateLimit(actor.uid, settings.rateLimitPerHour);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'تم تجاوز الحد الأقصى لعدد الأسئلة في الساعة. يرجى المحاولة لاحقاً.',
      });
      return;
    }

    // 3. Explicit consent enforcement for any patient result / file / uploaded medical document
    const wantsMedicalContext = Boolean(
      attachedResultId ||
        attachedFileId ||
        validRawUploads.length > 0 ||
        req.body?.includeBasicProfile === true,
    );
    if (wantsMedicalContext && !conversation.consentGiven) {
      res.status(403).json({
        error: 'CONSENT_REQUIRED',
        message: 'يجب تفعيل الموافقة أولاً قبل السماح لحنين بالاطلاع على أي نتيجة أو ملف طبي.',
      });
      return;
    }

    if (validRawUploads.length > 0 && !settings.allowReportAttachment) {
      res.status(403).json({
        error: 'ATTACHMENTS_DISABLED',
        message: 'رفع صور التقارير معطل حالياً من إعدادات الإدارة.',
      });
      return;
    }

    const attachedTextBlocks: string[] = [];
    const plainLabLines: string[] = [];
    let attachedSummary: HaneenAttachedReportSummary | null = null;
    const mediaParts: InlineMediaPart[] = [];

    if (attachedResultId) {
      const rCheck = await readPatientOwnedDoc(actor, 'lab_results', attachedResultId);
      if (!rCheck.ok) {
        res.status(rCheck.status).json({ error: rCheck.code });
        return;
      }
      const formatted = formatLabResultContext(rCheck.data);
      attachedTextBlocks.push(formatted.textBlock);
      plainLabLines.push(...formatted.plainSummaryLines);
      attachedSummary = formatted.summary;
    }

    if (attachedFileId) {
      const fCheck = await readPatientOwnedDoc(actor, 'patient_medical_files', attachedFileId);
      if (!fCheck.ok) {
        res.status(fCheck.status).json({ error: fCheck.code });
        return;
      }
      const title = normalizeStr(fCheck.data.title, 160) || 'ملف طبي مرفوع';
      const notes = normalizeStr(fCheck.data.notes, 500);
      const docDate = normalizeStr(fCheck.data.documentDate, 24);
      attachedTextBlocks.push(
        `[ملف طبي مرفق من سجل المريض بموافقته]\nالعنوان: ${title}${
          docDate ? `\nالتاريخ: ${docDate}` : ''
        }${notes ? `\nملاحظات: ${notes}` : ''}`,
      );
      const loadedMedia = await loadInlineMediaFromPatientFileDoc(fCheck.data, actor.uid);
      if (loadedMedia) {
        mediaParts.push(loadedMedia);
      }
      if (!attachedSummary) {
        attachedSummary = { kind: 'medical_file', label: title, testDate: docDate || undefined };
      }
    }

    let totalUploadBase64Bytes = 0;
    const uploadedFileNames: string[] = [];
    for (const item of validRawUploads) {
      const fileName = normalizeStr(item.fileName, 120) || 'صورة تقرير مرفقة';
      const mimeType = normalizeAttachmentMimeType(item.mimeType, fileName);
      const rawBase64 = normalizeStr(item.base64Data, MAX_SINGLE_UPLOAD_BASE64_BYTES * 2);
      const cleanBase64 = rawBase64.replace(/^data:[^;]+;base64,/i, '');
      if (!ALLOWED_UPLOAD_MIME_TYPES.has(mimeType)) {
        res.status(400).json({
          error: 'UNSUPPORTED_ATTACHMENT_TYPE',
          message: 'يُسمح فقط بصور JPG/PNG/WebP أو ملفات PDF.',
        });
        return;
      }
      if (!cleanBase64 || cleanBase64.length > MAX_SINGLE_UPLOAD_BASE64_BYTES) {
        res.status(400).json({
          error: 'ATTACHMENT_TOO_LARGE',
          message: 'حجم أحد الملفات المرفقة يتجاوز الحد المسموح.',
        });
        return;
      }
      totalUploadBase64Bytes += cleanBase64.length;
      if (totalUploadBase64Bytes > MAX_TOTAL_UPLOAD_BASE64_BYTES) {
        res.status(400).json({
          error: 'ATTACHMENTS_TOTAL_TOO_LARGE',
          message: 'إجمالي حجم الصور المرفقة يتجاوز الحد المسموح لهذه الرسالة.',
        });
        return;
      }
      mediaParts.push({
        inlineData: {
          data: cleanBase64,
          mimeType,
        },
      });
      uploadedFileNames.push(fileName);
    }

    if (uploadedFileNames.length > 0) {
      attachedSummary = {
        kind: 'uploaded_image',
        label:
          uploadedFileNames.length === 1
            ? uploadedFileNames[0]
            : `${uploadedFileNames[0]} (+${uploadedFileNames.length - 1})`,
        attachmentsCount: uploadedFileNames.length,
      };
    }

    const effectiveUserText =
      userText ||
      (attachedSummary
        ? `ممكن قراءة هذا التقرير واستخراج القيم في جدول ثم شرحها بكلام عراقي بسيط: ${attachedSummary.label}`
        : 'مرحباً حنين');

    const aiClient = deps.aiClientOverride || createGeminiClient();
    const geminiConfigured = Boolean(deps.aiClientOverride || isGeminiApiConfigured());

    // Fail loudly (no simulated reading!) if user attached an image/PDF and Gemini Vision isn't configured
    if (mediaParts.length > 0 && !aiClient) {
      store.recordTelemetry({
        latencyMs: Date.now() - startMs,
        errorCode: 'GEMINI_API_NOT_CONFIGURED',
        errorStage: 'vision_precheck',
      });
      res.status(503).json({
        error: 'GEMINI_VISION_NOT_CONFIGURED',
        message:
          'خدمة قراءة صور التقارير غير مفعّلة حالياً على الخادم لأن مفتاح Gemini غير مهيأ. يرجى التحقق من إعدادات البيئة (Secrets).',
      });
      return;
    }

    // Save user message once validation & Vision readiness pass
    const { message: savedUserMsg } = store.appendMessage(
      {
        conversationId,
        patientUid: actor.uid,
        role: 'user',
        text: effectiveUserText,
        attachedReportSummary: attachedSummary,
        citations: [],
      },
      effectiveUserText,
    );

    const msgHistoryRes = store.getMessagesForConversation(conversationId, actor.uid);
    const historyMemory = buildConversationMemorySummary(
      msgHistoryRes.ok ? msgHistoryRes.messages : [],
      settings.maxHistoryMessages,
    );

    const detectedDepth = detectRequestedDetailLevel(
      effectiveUserText,
      historyMemory.previousAssistantDetailLevel,
    );
    const detailLevel: HaneenDetailLevel = explicitDetailLevel || detectedDepth.level;
    const isFollowUpTopicCarryover =
      detectedDepth.isFollowUpExpansion && Boolean(historyMemory.lastSubstantiveUserQuery);
    const effectiveTopicQuery = isFollowUpTopicCarryover
      ? historyMemory.lastSubstantiveUserQuery
      : effectiveUserText;

    const allSources = store.getKnowledgeSources();

    const initSse = () => {
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();
    };
    const sendSseEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const respondImmediate = (params: {
      text: string;
      citations: HaneenCitation[];
      extractedReport?: HaneenExtractedLabReport | null;
      isEmergency?: boolean;
      isRefusal?: boolean;
      isFastReply?: boolean;
      isCached?: boolean;
      isFallback?: boolean;
      detailLevel?: HaneenDetailLevel;
      retrievalHit?: boolean;
      missedQueryRaw?: string;
    }) => {
      const { message: savedAssistantMsg, conversation: updatedConv } = store.appendMessage({
        conversationId,
        patientUid: actor.uid,
        role: 'assistant',
        text: params.text,
        extractedReport: params.extractedReport ?? null,
        isEmergency: params.isEmergency,
        isRefusal: params.isRefusal,
        isFastReply: params.isFastReply,
        isCached: params.isCached,
        isFallback: params.isFallback,
        detailLevel: params.detailLevel,
        citations: params.citations,
      });

      store.recordTelemetry({
        isEmergency: params.isEmergency,
        isRefusal: params.isRefusal,
        latencyMs: Date.now() - startMs,
        retrievalHit: params.retrievalHit,
        missedQueryRaw: params.missedQueryRaw,
      });

      const payload = {
        conversation: updatedConv,
        userMessage: savedUserMsg,
        assistantMessage: savedAssistantMsg,
        geminiConfigured,
      };

      if (options.stream) {
        initSse();
        sendSseEvent('meta', {
          conversation: updatedConv,
          userMessage: savedUserMsg,
          citations: params.citations,
          extractedReport: params.extractedReport ?? null,
          detailLevel: params.detailLevel,
          isFastReply: params.isFastReply,
          isEmergency: params.isEmergency,
          isRefusal: params.isRefusal,
          isCached: params.isCached,
          geminiConfigured,
        });
        sendSseEvent('chunk', { delta: params.text });
        sendSseEvent('done', payload);
        res.end();
      } else {
        res.json(payload);
      }
    };

    // 4. GATE 1: Emergency Warning Signs Detection (ALWAYS first, immediate redirect)
    const emergencyCheck = detectEmergencySymptoms(effectiveUserText);
    if (emergencyCheck.isEmergency) {
      const emergencyCitations = allSources.filter((s) => s.enabled && s.code === '04').map(toCitation);
      respondImmediate({
        text: buildEmergencyResponseText(settings.emergencyInstructionAr),
        citations: emergencyCitations,
        isEmergency: true,
        retrievalHit: true,
      });
      return;
    }

    // 5. GATE 2: Medication / Dosage Refusal (NEVER prescribe or adjust dosage/insulin)
    if (detectMedicationDosageRequest(effectiveUserText)) {
      const foundationSources = allSources
        .filter((s) => s.enabled && (s.code === '01' || s.code === '02'))
        .map(toCitation);
      respondImmediate({
        text: buildMedicationRefusalText(settings.dialectMode),
        citations: foundationSources,
        isRefusal: true,
        retrievalHit: true,
      });
      return;
    }

    // 5b. GATE 2.5: Radiology / Imaging Scan Image Diagnosis Refusal (never diagnose tumors/fractures/clots from film)
    if (detectImagingScanDiagnosisRequest(effectiveUserText)) {
      const radiologyTopics = store
        .getApprovedTopics()
        .filter((t) => t.domain === 'imaging')
        .slice(0, 1)
        .map((t) => ({
          sourceId: t.sourceId,
          code: 'IMG',
          titleAr: t.titleAr,
          titleEn: t.mainSpecialty,
          authority: t.publisher,
          sourceUrl: t.sourceUrl,
          publishedAt: t.publishedOrUpdatedAt,
          lastReviewedAt: t.reviewedAt || t.updatedAt,
          version: t.version,
        }));
      respondImmediate({
        text: buildImagingScanDiagnosisRefusalText(settings.dialectMode),
        citations: radiologyTopics,
        isFastReply: true,
        isRefusal: true,
        detailLevel,
        retrievalHit: true,
      });
      return;
    }

    // 6. FAST-PATH A & B (only when no attached records or images)
    const hasAttachedContext = Boolean(attachedTextBlocks.length > 0 || mediaParts.length > 0);
    if (!hasAttachedContext) {
      const convIntent = detectGreetingOrThanks(effectiveUserText);
      if (convIntent) {
        respondImmediate({
          text: buildGreetingOrThanksReply({
            intent: convIntent,
            patientName: actor.fullName,
            dialectMode: settings.dialectMode,
            userText: effectiveUserText,
          }),
          citations: [],
          isFastReply: true,
        });
        return;
      }

      if (!(isFollowUpTopicCarryover && historyMemory.hasMedicalHistory)) {
        const instantTopic = buildInstantGentleTopicReply({
          text: effectiveTopicQuery,
          sources: allSources,
          dialectMode: settings.dialectMode,
          hasAttachedContext,
          detailLevel,
        });
        if (instantTopic) {
          respondImmediate({
            text: instantTopic.text,
            citations: instantTopic.citations,
            isFastReply: true,
            detailLevel,
            retrievalHit: true,
          });
          return;
        }
      }
    }

    // 7. Vision Extraction Pass (when image/PDF media is attached!)
    let extractedReport: HaneenExtractedLabReport | null = null;
    if (mediaParts.length > 0 && aiClient) {
      try {
        extractedReport = await extractLabReportFromMediaWithGemini({
          aiClient,
          mediaParts,
          userText,
        });
      } catch (err) {
        const errCode =
          err instanceof Error ? err.message.slice(0, 80) : 'GEMINI_VISION_EXTRACTION_ERROR';
        store.recordTelemetry({
          latencyMs: Date.now() - startMs,
          errorCode: errCode,
          errorStage: 'gemini_vision_extract',
        });
        res.status(502).json({
          error: 'GEMINI_VISION_FAILED',
          message:
            'تعذر قراءة صورة التقرير عبر خدمة Gemini Vision حالياً. تأكد من صلاحية الاتصال أو المفتاح وأعد المحاولة.',
        });
        return;
      }

      // Gate: Radiology film uploaded directly without lab report
      if (extractedReport.isImagingFilmOnly && extractedReport.rows.length === 0) {
        const radiologyTopics = store
          .getApprovedTopics()
          .filter((t) => t.domain === 'imaging')
          .slice(0, 1)
          .map((t) => ({
            sourceId: t.sourceId,
            code: 'IMG',
            titleAr: t.titleAr,
            titleEn: t.mainSpecialty,
            authority: t.publisher,
            sourceUrl: t.sourceUrl,
            publishedAt: t.publishedOrUpdatedAt,
            lastReviewedAt: t.reviewedAt || t.updatedAt,
            version: t.version,
          }));
        respondImmediate({
          text: buildImagingScanDiagnosisRefusalText(settings.dialectMode),
          citations: radiologyTopics,
          extractedReport,
          isRefusal: true,
          detailLevel,
          retrievalHit: true,
        });
        return;
      }

      // Gate: Unreadable or non-readable photo -> ask for clearer photo, NEVER guess!
      if (
        extractedReport.imageClarity === 'unreadable' ||
        extractedReport.rows.length === 0
      ) {
        const guidanceCitations = allSources
          .filter((s) => s.enabled && (s.code === '01' || s.code === '02'))
          .map(toCitation);
        respondImmediate({
          text: buildUnreadableReportResponseText(extractedReport),
          citations: guidanceCitations,
          extractedReport,
          detailLevel,
          retrievalHit: true,
        });
        return;
      }
    }

    // 8. Safe General-Knowledge Cache Check (STRICTLY zero PII / zero attached medical context)
    const hasPatientNumbers = /\d+(?:[.,]\d+)?/.test(
      effectiveUserText.replace(/(hba1c|a1c|b12|d3)/gi, ''),
    );
    const isCacheSafeGeneralQuery =
      !hasAttachedContext &&
      !wantsMedicalContext &&
      !conversation.consentGiven &&
      !historyMemory.hasMedicalHistory &&
      !hasPatientNumbers &&
      !isFollowUpTopicCarryover;

    const cacheKey = isCacheSafeGeneralQuery
      ? `${store.getKnowledgeVersionStamp()}::${settings.dialectMode}::${detailLevel}::${normalizeIraqiText(effectiveUserText)}`
      : '';

    if (cacheKey) {
      const cached = getCachedGeneralAnswer(cacheKey);
      if (cached) {
        respondImmediate({
          text: cached.text,
          citations: cached.citations,
          isFastReply: true,
          isCached: true,
          detailLevel,
          retrievalHit: true,
        });
        return;
      }
    }

    // 9. Knowledge Retrieval (incorporating extracted analyte names if available!)
    const approvedTopics = store.getApprovedTopics();
    const glossary = store.getGlossaryEntries();
    const extractedTerms = extractedReport
      ? extractedReport.rows.map((r) => `${r.testName} ${r.shortName || ''}`).join(' ')
      : '';
    const combinedQuery = [effectiveTopicQuery, effectiveUserText, extractedTerms, ...attachedTextBlocks].join(' ');
    const knowledge = retrieveRelevantKnowledge(
      allSources,
      combinedQuery,
      4,
      detailLevel,
      approvedTopics,
      glossary,
    );

    if (!aiClient) {
      const fallbackText = buildFallbackAssistantResponse({
        userText: effectiveUserText,
        attachedTextBlocks,
        plainLabLines,
        citations: knowledge.citations,
        matchedSources: knowledge.matchedSources,
        hasUploadedAttachment: mediaParts.length > 0,
        detailLevel,
      });
      respondImmediate({
        text: fallbackText,
        citations: knowledge.citations,
        isFallback: true,
        detailLevel,
        retrievalHit: knowledge.hit,
        missedQueryRaw: !knowledge.hit && !hasAttachedContext ? effectiveTopicQuery : undefined,
      });
      return;
    }

    const guidancePack = loadLabReadingGuidancePack();
    const minimalProfileBlock =
      conversation.consentGiven && (actor.age !== undefined || actor.gender)
        ? `[معلومات أساسية بموافقة المريض: العمر=${
            actor.age ?? 'غير محدد'
          }، الجنس=${actor.gender || 'غير محدد'}]`
        : '';

    let contents: string | { parts: Array<InlineMediaPart | { text: string }> };

    if (extractedReport && extractedReport.rows.length > 0) {
      const reportJsonSummary = JSON.stringify(
        {
          reportHeader: extractedReport.reportHeader || {},
          pagesDetected: extractedReport.pagesDetected,
          imageClarity: extractedReport.imageClarity,
          clarityNoteAr: extractedReport.clarityNoteAr || '',
          hasCriticalFlag: extractedReport.hasCriticalFlag,
          rows: extractedReport.rows,
          summaryCounts: extractedReport.summaryCounts,
          nonReadableNotes: extractedReport.nonReadableNotes || [],
        },
        null,
        2,
      );

      const labPrompt = [
        minimalProfileBlock,
        historyMemory.historyText
          ? `[سياق المحادثة القريب]\n${historyMemory.historyText}`
          : '',
        attachedTextBlocks.length > 0 ? attachedTextBlocks.join('\n\n') : '',
        '[البيانات المستخرجة فعلياً من صورة التقرير عبر Gemini Vision — التزم بها حرفياً ولا تغيّر أي رقم أو وحدة أو مجال مرجعي]',
        reportJsonSummary,
        guidancePack.combinedSystemGuidance,
        `[طلب المريض الحالي]\n${effectiveUserText}`,
        [
          'التعليمات الإلزامية لصياغة الرد:',
          extractedReport.hasCriticalFlag
            ? '⚠️ تنبيه عاجل أولاً: يحتوي التقرير على علامة حرجة (Critical). وجّه المريض فوراً للتواصل العاجل مع الطبيب أو الطوارئ في بداية الرد.'
            : '',
          '1. ابدأ بعبارة التأكيد: «قرأت التقرير المرفوع. هذه البيانات التي تمكنت من استخراجها، راجع الأرقام والوحدات للتأكد من مطابقتها للصورة.»',
          '2. أعرض جدول النتائج الكامل بصيغة Markdown (`| التحليل | النتيجة | الوحدة | المجال المرجعي في التقرير | المقارنة |`) مطابقاً للبيانات المستخرجة أعلاه دون أي تعديل على الأرقام أو الوحدات أو المجالات.',
          '3. اشرح كل نتيجة من الجدول باللغة العربية البسيطة (وبالمخاطبة المحايدة): ما الذي يقيسه الفحص، ماذا تعني القيمة مقارنة بالمجال المطبوع بالتقرير فقط، حدود هذا التوضيح، وعوامل يومية محتملة قد تؤثر عليه دون تشخيص أو وصف علاج.',
          '4. اختم بفقرة «الملخص» (ضمن المجال / خارج المجال / غير مقروء بثقة + أسئلة مفيدة للطبيب) وبالتنبيه الطبي: «هذا شرح معلوماتي للتقرير وليس تشخيصاً أو وصفة علاجية. تفسير النتائج النهائي يعتمد على الأعراض والفحص والتاريخ الصحي وبقية الفحوصات، لذلك ناقشها مع طبيبك.»',
          extractedReport.imageClarity === 'partially_unclear'
            ? '5. أضف ملاحظة واضحة في النهاية تطلب صورة أوضح للأسطر التي كانت غير مقروءة أو تحتاج تأكيد.'
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n');

      contents = {
        parts: [...mediaParts, { text: labPrompt }],
      };
    } else {
      const promptSections = [
        minimalProfileBlock,
        historyMemory.historyText
          ? `[سياق المحادثة القريب — الاستمرار على نفس السياق]\n${historyMemory.historyText}`
          : '',
        attachedTextBlocks.length > 0 ? attachedTextBlocks.join('\n\n') : '',
        `[سؤال المريض الحالي (مستوى التفصيل المطلوب: ${detailLevel})]\n${effectiveUserText}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      contents = mediaParts.length > 0
        ? { parts: [...mediaParts, { text: promptSections }] }
        : promptSections;
    }

    const systemInstruction = buildHaneenSystemInstruction({
      dialectMode: settings.dialectMode,
      detailLevel,
      knowledgeContext: knowledge.contextText,
      emergencyInstructionAr: settings.emergencyInstructionAr,
      hasExtractedLabReport: Boolean(extractedReport && extractedReport.rows.length > 0),
    });

    const activeThinkingLevel = extractedReport ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW;

    if (options.stream) {
      initSse();
      sendSseEvent('meta', {
        conversation,
        userMessage: savedUserMsg,
        citations: knowledge.citations,
        extractedReport,
        detailLevel,
        isFastReply: false,
        geminiConfigured,
      });

      let streamedText = '';
      let isFallback = false;
      try {
        const streamResp = await aiClient.models.generateContentStream({
          model: HANEEN_GEMINI_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: {
              thinkingLevel: activeThinkingLevel,
            },
          },
        });

        for await (const chunk of streamResp) {
          const delta = chunk.text || '';
          if (delta) {
            streamedText += delta;
            sendSseEvent('chunk', { delta });
          }
        }
        streamedText = streamedText.trim();
        if (!streamedText) {
          throw new Error('EMPTY_GEMINI_STREAM');
        }
      } catch (err) {
        const errCode =
          err instanceof Error ? err.message.slice(0, 60) : 'GEMINI_STREAM_ERROR';
        store.recordTelemetry({
          latencyMs: Date.now() - startMs,
          errorCode: errCode,
          errorStage: 'gemini_stream',
        });
        isFallback = true;
        streamedText =
          extractedReport && extractedReport.rows.length > 0
            ? buildStructuredFallbackFromExtractedReport(extractedReport)
            : buildFallbackAssistantResponse({
                userText: effectiveUserText,
                attachedTextBlocks,
                plainLabLines,
                citations: knowledge.citations,
                matchedSources: knowledge.matchedSources,
                hasUploadedAttachment: mediaParts.length > 0,
                detailLevel,
              });
        sendSseEvent('chunk', { delta: streamedText });
      }

      if (!isFallback && cacheKey) {
        setCachedGeneralAnswer(cacheKey, {
          text: streamedText,
          citations: knowledge.citations,
          createdAt: Date.now(),
        });
      }

      const { message: savedAssistantMsg, conversation: updatedConv } = store.appendMessage({
        conversationId,
        patientUid: actor.uid,
        role: 'assistant',
        text: streamedText,
        extractedReport,
        isFallback,
        detailLevel,
        citations: knowledge.citations,
      });

      if (!isFallback) {
        store.recordTelemetry({
          latencyMs: Date.now() - startMs,
          retrievalHit: knowledge.hit,
          missedQueryRaw: !knowledge.hit && !hasAttachedContext ? effectiveTopicQuery : undefined,
        });
      }

      sendSseEvent('done', {
        conversation: updatedConv,
        userMessage: savedUserMsg,
        assistantMessage: savedAssistantMsg,
        geminiConfigured,
      });
      res.end();
      return;
    }

    // Standard JSON path
    let assistantText = '';
    let isFallback = false;
    try {
      const response = await aiClient.models.generateContent({
        model: HANEEN_GEMINI_MODEL,
        contents,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: activeThinkingLevel,
          },
        },
      });
      const generatedText = (response.text || '').trim();
      if (!generatedText) {
        throw new Error('EMPTY_GEMINI_RESPONSE');
      }
      assistantText = generatedText;
      if (cacheKey) {
        setCachedGeneralAnswer(cacheKey, {
          text: assistantText,
          citations: knowledge.citations,
          createdAt: Date.now(),
        });
      }
    } catch (err) {
      const errCode =
        err instanceof Error ? err.message.slice(0, 60) : 'GEMINI_GENERATE_ERROR';
      store.recordTelemetry({
        latencyMs: Date.now() - startMs,
        errorCode: errCode,
        errorStage: 'gemini_generate',
        retrievalHit: knowledge.hit,
        missedQueryRaw: !knowledge.hit && !hasAttachedContext ? effectiveTopicQuery : undefined,
      });
      isFallback = true;
      assistantText =
        extractedReport && extractedReport.rows.length > 0
          ? buildStructuredFallbackFromExtractedReport(extractedReport)
          : buildFallbackAssistantResponse({
              userText: effectiveUserText,
              attachedTextBlocks,
              plainLabLines,
              citations: knowledge.citations,
              matchedSources: knowledge.matchedSources,
              hasUploadedAttachment: mediaParts.length > 0,
              detailLevel,
            });
    }

    const { message: savedAssistantMsg, conversation: updatedConv } = store.appendMessage({
      conversationId,
      patientUid: actor.uid,
      role: 'assistant',
      text: assistantText,
      extractedReport,
      isFallback,
      detailLevel,
      citations: knowledge.citations,
    });

    if (!isFallback) {
      store.recordTelemetry({
        latencyMs: Date.now() - startMs,
        retrievalHit: knowledge.hit,
        missedQueryRaw: !knowledge.hit && !hasAttachedContext ? effectiveTopicQuery : undefined,
      });
    }

    res.json({
      conversation: updatedConv,
      userMessage: savedUserMsg,
      assistantMessage: savedAssistantMsg,
      geminiConfigured,
    });
  }

  router.post('/patient/haneen/chat', async (req, res) => {
    await executeHaneenChatRequest(req, res, { stream: false });
  });

  router.post('/patient/haneen/chat-stream', async (req, res) => {
    await executeHaneenChatRequest(req, res, { stream: true });
  });

  return router;
}

export function createAdminHaneenRouter(deps: AdminHaneenRouterDeps): Router {
  const router = express.Router();

  // Super Admin Governance ONLY: Knowledge Sources, Versions, Settings, Aggregate Telemetry.
  // NEVER returns any patient conversations, patient UIDs, or medical record texts.
  router.get('/admin/haneen/overview', deps.requireSuperAdmin, (_req, res) => {
    const sources = deps.store.getKnowledgeSources();
    const settings = deps.store.getSettings();
    const telemetry = deps.store.getAdminTelemetry(
      isGeminiApiConfigured(),
      HANEEN_GEMINI_MODEL,
    );
    res.json({ sources, settings, telemetry });
  });

  router.post('/admin/haneen/sources', deps.requireSuperAdmin, async (req, res) => {
    const titleAr = normalizeStr(req.body?.titleAr, 200);
    const titleEn = normalizeStr(req.body?.titleEn, 200);
    const authority = normalizeStr(req.body?.authority, 160);
    const sourceUrl = normalizeStr(req.body?.sourceUrl, 500);
    const publishedAt = normalizeStr(req.body?.publishedAt, 30);
    const lastReviewedAt = normalizeStr(req.body?.lastReviewedAt, 30);
    const version = normalizeStr(req.body?.version, 30) || '1.0.0';
    const content = normalizeStr(req.body?.content, 30000);
    const enabled = req.body?.enabled !== false;
    const keywords = Array.isArray(req.body?.keywords)
      ? (req.body.keywords as unknown[]).map((k) => normalizeStr(k, 60)).filter(Boolean)
      : [];

    if (!titleAr || !authority || !sourceUrl || !content) {
      res.status(400).json({ error: 'INVALID_SOURCE_PAYLOAD' });
      return;
    }

    try {
      const source = await deps.store.addKnowledgeSource({
        titleAr,
        titleEn,
        authority,
        sourceUrl,
        publishedAt,
        lastReviewedAt,
        version,
        enabled,
        keywords,
        content,
      });
      res.status(201).json({ source });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'INVALID_SOURCE_URL',
      });
    }
  });

  router.patch('/admin/haneen/sources/:sourceId', deps.requireSuperAdmin, async (req, res) => {
    const sourceId = normalizeStr(req.params.sourceId, 128);
    if (!sourceId) {
      res.status(400).json({ error: 'INVALID_SOURCE_ID' });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (typeof req.body?.titleAr === 'string') patch.titleAr = normalizeStr(req.body.titleAr, 200);
    if (typeof req.body?.titleEn === 'string') patch.titleEn = normalizeStr(req.body.titleEn, 200);
    if (typeof req.body?.authority === 'string') patch.authority = normalizeStr(req.body.authority, 160);
    if (typeof req.body?.sourceUrl === 'string') patch.sourceUrl = normalizeStr(req.body.sourceUrl, 500);
    if (typeof req.body?.publishedAt === 'string') patch.publishedAt = normalizeStr(req.body.publishedAt, 30);
    if (typeof req.body?.lastReviewedAt === 'string') {
      patch.lastReviewedAt = normalizeStr(req.body.lastReviewedAt, 30);
    }
    if (typeof req.body?.version === 'string') patch.version = normalizeStr(req.body.version, 30);
    if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
    if (typeof req.body?.content === 'string') patch.content = normalizeStr(req.body.content, 30000);
    if (Array.isArray(req.body?.keywords)) {
      patch.keywords = (req.body.keywords as unknown[])
        .map((k) => normalizeStr(k, 60))
        .filter(Boolean);
    }

    try {
      const updated = await deps.store.updateKnowledgeSource(sourceId, patch);
      if (!updated) {
        res.status(404).json({ error: 'SOURCE_NOT_FOUND' });
        return;
      }
      res.json({ source: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'SOURCE_UPDATE_FAILED',
      });
    }
  });

  router.get('/admin/haneen/library', deps.requireSuperAdmin, (_req, res) => {
    res.json(deps.store.getAdminLibrarySnapshot());
  });

  router.post('/admin/haneen/topics', deps.requireSuperAdmin, async (req, res) => {
    const titleAr = normalizeStr(req.body?.titleAr, 200);
    const mainSpecialty = normalizeStr(req.body?.mainSpecialty, 140);
    const subSpecialty = normalizeStr(req.body?.subSpecialty, 140);
    const domainRaw = normalizeStr(req.body?.domain, 20);
    const domain: HaneenLibraryDomain =
      domainRaw === 'imaging' || domainRaw === 'clinical' ? domainRaw : 'labs';
    const simpleExplanation = normalizeStr(req.body?.simpleExplanation, 3000);
    const whatItMeans = normalizeStr(req.body?.whatItMeans, 3000);
    const sourceName = normalizeStr(req.body?.sourceName, 200);
    const sourceUrl = normalizeStr(req.body?.sourceUrl, 500);

    if (!titleAr || !mainSpecialty || !simpleExplanation || !whatItMeans || !sourceName || !sourceUrl) {
      res.status(400).json({ error: 'INVALID_TOPIC_PAYLOAD' });
      return;
    }

    const toList = (val: unknown): string[] =>
      Array.isArray(val) ? val.map((x) => normalizeStr(x, 120)).filter(Boolean).slice(0, 20) : [];

    const initialStatus =
      req.body?.initialStatus === 'under_review' ? 'under_review' : 'draft';
    const actorEmail =
      normalizeStr((req as { superAdminEmail?: unknown }).superAdminEmail, 120) || 'super_admin@medora';

    try {
      const topic = await deps.store.createKnowledgeTopic(
        {
          titleAr,
          mainSpecialty,
          subSpecialty,
          domain,
          topicType: normalizeStr(req.body?.topicType, 60),
          ageGroup: normalizeStr(req.body?.ageGroup, 60),
          audience: normalizeStr(req.body?.audience, 60),
          simpleExplanation,
          whatItMeans,
          patientNeedToKnow: normalizeStr(req.body?.patientNeedToKnow, 2000),
          relatedSymptoms: toList(req.body?.relatedSymptoms),
          relatedTests: toList(req.body?.relatedTests),
          preparation: normalizeStr(req.body?.preparation, 1000),
          whenToSeeDoctor: normalizeStr(req.body?.whenToSeeDoctor, 1000),
          emergencySigns: toList(req.body?.emergencySigns),
          whatCannotBeInferred: normalizeStr(req.body?.whatCannotBeInferred, 1000),
          sourceId: normalizeStr(req.body?.sourceId, 80),
          sourceName,
          sourceUrl,
          publisher: normalizeStr(req.body?.publisher, 160),
          publishedOrUpdatedAt: normalizeStr(req.body?.publishedOrUpdatedAt, 30),
          licenseOrRights: normalizeStr(req.body?.licenseOrRights, 240),
          keywords: toList(req.body?.keywords),
          initialStatus,
        },
        actorEmail,
      );
      res.status(201).json({ topic });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'TOPIC_CREATE_FAILED',
      });
    }
  });

  router.patch('/admin/haneen/topics/:topicId', deps.requireSuperAdmin, async (req, res) => {
    const topicId = normalizeStr(req.params.topicId, 128);
    if (!topicId) {
      res.status(400).json({ error: 'INVALID_TOPIC_ID' });
      return;
    }

    const toList = (val: unknown): string[] =>
      Array.isArray(val) ? val.map((x) => normalizeStr(x, 120)).filter(Boolean).slice(0, 20) : [];

    const patch: Record<string, unknown> = {};
    if (typeof req.body?.titleAr === 'string') patch.titleAr = normalizeStr(req.body.titleAr, 200);
    if (typeof req.body?.mainSpecialty === 'string') patch.mainSpecialty = normalizeStr(req.body.mainSpecialty, 140);
    if (typeof req.body?.subSpecialty === 'string') patch.subSpecialty = normalizeStr(req.body.subSpecialty, 140);
    if (req.body?.domain === 'labs' || req.body?.domain === 'imaging' || req.body?.domain === 'clinical') {
      patch.domain = req.body.domain;
    }
    if (typeof req.body?.simpleExplanation === 'string') patch.simpleExplanation = normalizeStr(req.body.simpleExplanation, 3000);
    if (typeof req.body?.whatItMeans === 'string') patch.whatItMeans = normalizeStr(req.body.whatItMeans, 3000);
    if (typeof req.body?.patientNeedToKnow === 'string') patch.patientNeedToKnow = normalizeStr(req.body.patientNeedToKnow, 2000);
    if (Array.isArray(req.body?.relatedSymptoms)) patch.relatedSymptoms = toList(req.body.relatedSymptoms);
    if (Array.isArray(req.body?.relatedTests)) patch.relatedTests = toList(req.body.relatedTests);
    if (typeof req.body?.preparation === 'string') patch.preparation = normalizeStr(req.body.preparation, 1000);
    if (typeof req.body?.whenToSeeDoctor === 'string') patch.whenToSeeDoctor = normalizeStr(req.body.whenToSeeDoctor, 1000);
    if (Array.isArray(req.body?.emergencySigns)) patch.emergencySigns = toList(req.body.emergencySigns);
    if (typeof req.body?.whatCannotBeInferred === 'string') patch.whatCannotBeInferred = normalizeStr(req.body.whatCannotBeInferred, 1000);
    if (typeof req.body?.sourceName === 'string') patch.sourceName = normalizeStr(req.body.sourceName, 200);
    if (typeof req.body?.sourceUrl === 'string') patch.sourceUrl = normalizeStr(req.body.sourceUrl, 500);
    if (typeof req.body?.publisher === 'string') patch.publisher = normalizeStr(req.body.publisher, 160);
    if (typeof req.body?.reviewerName === 'string') patch.reviewerName = normalizeStr(req.body.reviewerName, 140);
    if (Array.isArray(req.body?.keywords)) patch.keywords = toList(req.body.keywords);
    if (
      req.body?.status === 'draft' ||
      req.body?.status === 'under_review' ||
      req.body?.status === 'approved' ||
      req.body?.status === 'retired'
    ) {
      patch.status = req.body.status;
    }

    const changeNote = normalizeStr(req.body?.changeNote, 240) || 'تحديث محتوى الموضوع';
    const actorEmail =
      normalizeStr((req as { superAdminEmail?: unknown }).superAdminEmail, 120) || 'super_admin@medora';

    try {
      const updated = await deps.store.updateKnowledgeTopic(topicId, patch, actorEmail, changeNote);
      if (!updated) {
        res.status(404).json({ error: 'TOPIC_NOT_FOUND' });
        return;
      }
      res.json({ topic: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'TOPIC_UPDATE_FAILED',
      });
    }
  });

  router.post('/admin/haneen/topics/:topicId/review', deps.requireSuperAdmin, async (req, res) => {
    const topicId = normalizeStr(req.params.topicId, 128);
    const statusRaw = normalizeStr(req.body?.status, 30);
    if (
      !topicId ||
      (statusRaw !== 'draft' &&
        statusRaw !== 'under_review' &&
        statusRaw !== 'approved' &&
        statusRaw !== 'retired')
    ) {
      res.status(400).json({ error: 'INVALID_REVIEW_PAYLOAD' });
      return;
    }
    const status = statusRaw as HaneenTopicReviewStatus;
    const reviewerName = normalizeStr(req.body?.reviewerName, 140);
    const changeNote = normalizeStr(req.body?.changeNote, 240);
    const actorEmail =
      normalizeStr((req as { superAdminEmail?: unknown }).superAdminEmail, 120) || 'super_admin@medora';

    try {
      const updated = await deps.store.reviewKnowledgeTopic(
        topicId,
        { status, reviewerName, changeNote },
        actorEmail,
      );
      if (!updated) {
        res.status(404).json({ error: 'TOPIC_NOT_FOUND' });
        return;
      }
      res.json({ topic: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'TOPIC_REVIEW_FAILED',
      });
    }
  });

  router.patch('/admin/haneen/specialties/:specialtyId', deps.requireSuperAdmin, async (req, res) => {
    const specialtyId = normalizeStr(req.params.specialtyId, 128);
    if (!specialtyId) {
      res.status(400).json({ error: 'INVALID_SPECIALTY_ID' });
      return;
    }
    const patch: Partial<{ enabled: boolean; completeness: HaneenCompletenessStatus; notesAr: string }> = {};
    if (typeof req.body?.enabled === 'boolean') patch.enabled = req.body.enabled;
    if (
      req.body?.completeness === 'populated' ||
      req.body?.completeness === 'intro_only' ||
      req.body?.completeness === 'missing'
    ) {
      patch.completeness = req.body.completeness;
    }
    if (typeof req.body?.notesAr === 'string') patch.notesAr = normalizeStr(req.body.notesAr, 400);

    const updated = await deps.store.updateSpecialtyNode(specialtyId, patch);
    if (!updated) {
      res.status(404).json({ error: 'SPECIALTY_NOT_FOUND' });
      return;
    }
    res.json({ specialty: updated });
  });

  router.patch('/admin/haneen/registered-sources/:registryId', deps.requireSuperAdmin, async (req, res) => {
    const registryId = normalizeStr(req.params.registryId, 128);
    if (!registryId) {
      res.status(400).json({ error: 'INVALID_REGISTRY_ID' });
      return;
    }
    const patch: Partial<{ active: boolean; patientFacingAllowed: boolean; notes: string }> = {};
    if (typeof req.body?.active === 'boolean') patch.active = req.body.active;
    if (typeof req.body?.patientFacingAllowed === 'boolean') {
      patch.patientFacingAllowed = req.body.patientFacingAllowed;
    }
    if (typeof req.body?.notes === 'string') patch.notes = normalizeStr(req.body.notes, 400);

    const updated = await deps.store.updateRegisteredSource(registryId, patch);
    if (!updated) {
      res.status(404).json({ error: 'REGISTERED_SOURCE_NOT_FOUND' });
      return;
    }
    res.json({ registeredSource: updated });
  });

  router.patch('/admin/haneen/settings', deps.requireSuperAdmin, async (req, res) => {
    const updated = await deps.store.updateSettings(req.body || {});
    res.json({ settings: updated });
  });

  return router;
}
