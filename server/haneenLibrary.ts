import type {
  HaneenGlossaryEntry,
  HaneenKnowledgeTopic,
  HaneenLabComparisonPoint,
  HaneenLabComparisonResponse,
  HaneenLabComparisonSeries,
  HaneenLibraryRoadmapSummary,
  HaneenRegisteredSource,
  HaneenSpecialtyNode,
} from '../src/types/haneen.ts';

export const DISALLOWED_SOURCE_DOMAINS = [
  'wikipedia.org',
  'reddit.com',
  'quora.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'mawdoo3.com',
];

export function validateTrustedSourceUrl(rawUrl: string): { ok: true; hostname: string } | { ok: false; reason: string } {
  const clean = rawUrl.trim();
  if (!clean) {
    return { ok: false, reason: 'SOURCE_URL_REQUIRED' };
  }
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'https:') {
      return { ok: false, reason: 'SOURCE_URL_MUST_BE_HTTPS' };
    }
    const host = parsed.hostname.toLowerCase();
    for (const blocked of DISALLOWED_SOURCE_DOMAINS) {
      if (host === blocked || host.endsWith(`.${blocked}`)) {
        return { ok: false, reason: 'UNTRUSTED_OR_FORUM_SOURCE_BLOCKED' };
      }
    }
    return { ok: true, hostname: host };
  } catch {
    return { ok: false, reason: 'INVALID_SOURCE_URL' };
  }
}

export function loadDefaultRegisteredSources(): HaneenRegisteredSource[] {
  return [
    {
      registryId: 'reg_msd_ar',
      name: 'MSD Manual — Consumer Version (Arabic)',
      authority: 'MSD Manuals',
      language: 'ar',
      specialtyFocus: 'جميع التخصصات الطبية، الأعراض، الأمراض، الفحوصات',
      baseUrl: 'https://www.msdmanuals.com/ar/home',
      licenseNotes: 'مرجع تثقيفي محمي بحقوق النشر — يُسمح بالاقتباس التثقيفي القصير مع ذكر المصدر والرابط وتلخيصه بأسلوبنا، ويُمنع نسخ النصوص الكاملة.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_who_ar',
      name: 'World Health Organization (WHO) — Arabic',
      authority: 'World Health Organization (WHO)',
      language: 'ar',
      specialtyFocus: 'الصحة العامة، الوقاية، التغذية، الأمراض المزمنة والمعدية، اللقاحات',
      baseUrl: 'https://www.who.int/ar',
      licenseNotes: 'مصدر رسمي دولي للصحة العامة — يُشار للمصدر وتاريخ التحديث ولا يتم اجتزاء الأرقام خارج سياقها.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_who_topics',
      name: 'WHO Health Topics',
      authority: 'World Health Organization (WHO)',
      language: 'en/ar',
      specialtyFocus: 'موضوعات صحية شاملة وفق تصنيف منظمة الصحة العالمية',
      baseUrl: 'https://www.who.int/health-topics/',
      licenseNotes: 'مرجع رسمي للمواضيع الصحية — تلخيص تثقيفي مبسط مع حفظ الرابط وتاريخ الوصول.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_who_factsheets',
      name: 'WHO Fact Sheets',
      authority: 'World Health Organization (WHO)',
      language: 'en/ar',
      specialtyFocus: 'بطاقات حقائق رسمية (الغذاء الصحي، الإنتان، الأمراض الشائعة)',
      baseUrl: 'https://www.who.int/news-room/fact-sheets',
      licenseNotes: 'محتوى تثقيفي رسمي — يذكر تاريخ النشر والرابط الأصلي في سجل المراجعة.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_who_emro_ar',
      name: 'WHO Regional Office for the Eastern Mediterranean (EMRO)',
      authority: 'WHO EMRO',
      language: 'ar',
      specialtyFocus: 'الصحة الإقليمية، الأمراض المعدية والوقائية، التثقيف الصحي لإقليم شرق المتوسط',
      baseUrl: 'https://www.emro.who.int/ar/index.html',
      licenseNotes: 'مرجع إقليمي رسمي معتمد بالعربية.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_medlineplus_ar',
      name: 'MedlinePlus (Arabic & Medical Tests)',
      authority: 'MedlinePlus / U.S. National Library of Medicine (NLM)',
      language: 'ar/en',
      specialtyFocus: 'التحاليل المخبرية، المدى المرجعي، التحضير للفحوصات، التثقيف الطبي للمريض',
      baseUrl: 'https://medlineplus.gov/languages/arabic.html',
      licenseNotes: 'مواد تثقيفية حكومية موثوقة للمريض — يُحفظ رابط الموضوع وتاريخ الوصول.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_radiologyinfo',
      name: 'RadiologyInfo.org (RSNA / ACR)',
      authority: 'Radiological Society of North America & ACR',
      language: 'en (for structured Arabic educational adaptation)',
      specialtyFocus: 'الأشعة والتصوير الطبي: X-Ray، سونار، مفراس CT، رنين MRI، ماموغرام، DEXA، الطب النووي',
      baseUrl: 'https://www.radiologyinfo.org/',
      licenseNotes: 'مرجع معتمد لتثقيف المريض بالأشعة — صياغة عربية مبسطة غير منسوخة حرفياً، دون تشخيص صور.',
      allowFullTextStorage: false,
      patientFacingAllowed: true,
      active: true,
    },
    {
      registryId: 'reg_msf',
      name: 'MSF Medical Guidelines (أطباء بلا حدود)',
      authority: 'Médecins Sans Frontières (MSF)',
      language: 'en',
      specialtyFocus: 'مرجع داخلي لهيكلة الفرز السريري فقط',
      baseUrl: 'https://medicalguidelines.msf.org/',
      licenseNotes: 'للمساعدة في الهيكلة والمرجعية المهنية الداخلية فقط — لا يُعرض كنص مباشر للمريض أو كبديل عن الطبيب.',
      allowFullTextStorage: false,
      patientFacingAllowed: false,
      active: true,
      notes: 'مصنف للاستخدام الداخلي/المهني فقط وفق ملف سجل المصادر 09.',
    },
  ];
}

export function loadDefaultGlossaryEntries(): HaneenGlossaryEntry[] {
  return [
    {
      glossaryId: 'gl_01',
      termEn: 'Hemoglobin (Hb / Hgb)',
      aliases: ['hemoglobin', 'hb', 'hgb', 'هيموغلوبين', 'هموكلوبين', 'هيموجلوبين', 'خضاب'],
      termAr: 'الهيموغلوبين',
      simpleMeaningAr: 'مادة بالدم تنقل الأوكسجين لكل الجسم. انخفاضها قد يرتبط بنقص الدم أو نقص الحديد أو أسباب ثانية.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_02',
      termEn: 'Complete Blood Count (CBC)',
      aliases: ['cbc', 'complete blood count', 'صورة الدم', 'تعداد الدم', 'سي بي سي'],
      termAr: 'تحليل الدم الكامل (CBC)',
      simpleMeaningAr: 'تحليل يشوف كريات الدم الحمراء والبيضاء والصفائح حتى يعطي صورة عامة عن الدم والمناعة والتخثر.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_03',
      termEn: 'Glucose',
      aliases: ['glucose', 'fbs', 'rbs', 'غلوكوز', 'جلوكوز', 'سكر الدم', 'فحص السكر'],
      termAr: 'سكر الدم (الغلوكوز)',
      simpleMeaningAr: 'يقيس مستوى السكر بالدم لحظة التحليل، ويتأثر بالأكل والصيام والوقت.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_04',
      termEn: 'HbA1c',
      aliases: ['hba1c', 'a1c', 'سكر تراكمي', 'التراكمي', 'مخزون السكر'],
      termAr: 'السكر التراكمي (HbA1c)',
      simpleMeaningAr: 'يعطي فكرة عن معدل السكر بالدم خلال آخر شهرين إلى 3 أشهر، مو بس لحظة الفحص.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_05',
      termEn: 'Creatinine',
      aliases: ['creatinine', 'cr', 'كرياتينين', 'وظائف الكلى'],
      termAr: 'الكرياتينين',
      simpleMeaningAr: 'تحليل يساعد الطبيب يطمئن على شلون الكلى دا تصفي الفضلات من الدم.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_06',
      termEn: 'Liver Enzymes (ALT / AST)',
      aliases: ['alt', 'ast', 'sgpt', 'sgot', 'انزيمات الكبد', 'وظائف الكبد'],
      termAr: 'إنزيمات الكبد (ALT / AST)',
      simpleMeaningAr: 'إنزيمات تعطي فكرة للطبيب عن وضع الكبد وصحته.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_07',
      termEn: 'Bilirubin',
      aliases: ['bilirubin', 'توتال بيليروبين', 'صفار', 'ابو صفار', 'بيليروبين'],
      termAr: 'البيليروبين (مادة الصفار)',
      simpleMeaningAr: 'مادة قد ترتفع عند مشاكل الكبد أو المرارة أو تكسّر الدم وتسبب أحياناً اصفراراً.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_08',
      termEn: 'TSH',
      aliases: ['tsh', 'thyroid', 'غدة درقية', 'هرمون الغدة'],
      termAr: 'هرمون الغدة الدرقية (TSH)',
      simpleMeaningAr: 'تحليل يبيّن نشاط الغدة الدرقية اللي تنظم طاقة الجسم وحركته وحرقه.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_09',
      termEn: 'LDL / HDL / Triglycerides',
      aliases: ['ldl', 'hdl', 'triglycerides', 'cholesterol', 'كولسترول', 'كوليسترول', 'دهون ثلاثية', 'دهون الدم'],
      termAr: 'دهون الدم والكوليسترول',
      simpleMeaningAr: 'أنواع دهون بالدم: بعضها يفيد (HDL) وبعضها زيادته تضر الأوعية مثل LDL والدهون الثلاثية.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_10',
      termEn: 'Reference Range',
      aliases: ['reference range', 'normal range', 'المدى المرجعي', 'المعدل الطبيعي', 'المعدل المطبوع'],
      termAr: 'المدى المرجعي',
      simpleMeaningAr: 'الحد الطبيعي المطبوع بورقة المختبر حتى يبيّن إذا الرقم ضمن المعتاد لو أعلى أو أقل منه.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_11',
      termEn: 'High / Low (H / L)',
      aliases: ['high', 'low', 'h', 'l', 'طالع h', 'طالع l', 'مرتفع', 'منخفض'],
      termAr: 'مرتفع / منخفض (H / L)',
      simpleMeaningAr: 'رموز تعني أن القيمة أعلى (H) أو أقل (L) من المعدل المطبوع بورقة المختبر، ومو معناها مرض أكيد لحالها.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_12',
      termEn: 'Ultrasound',
      aliases: ['ultrasound', 'sonography', 'usg', 'سونار', 'اشعة صوتية', 'موجات فوق صوتية'],
      termAr: 'السونار (الموجات الصوتية)',
      simpleMeaningAr: 'فحص تصويري آمن يعتمد على موجات صوتية، بدون أشعة، لفحص الأعضاء الداخلية أو الحمل.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_13',
      termEn: 'X-Ray',
      aliases: ['x-ray', 'xray', 'أشعة سينية', 'اشعة عادية', 'راديوغراف'],
      termAr: 'الأشعة السينية (X-Ray)',
      simpleMeaningAr: 'صورة سريعة تفيد بالعادة لفحص العظام أو الصدر أو الأسنان.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_14',
      termEn: 'CT Scan',
      aliases: ['ct', 'ct scan', 'مفراس', 'تصوير مقطعي', 'سي تي'],
      termAr: 'المفراس (CT Scan)',
      simpleMeaningAr: 'تصوير بالأشعة يعطي صور مقطعية دقيقة جداً لداخل الجسم، وأحياناً يستخدم صبغة وريدية.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_15',
      termEn: 'MRI',
      aliases: ['mri', 'رنين', 'رنين مغناطيسي'],
      termAr: 'الرنين المغناطيسي (MRI)',
      simpleMeaningAr: 'تصوير دقيق جداً يعتمد على مجال مغناطيسي بدون أشعة سينية، ممتاز للدماغ والعمود الفقري والمفاصل.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_16',
      termEn: 'Contrast Dye',
      aliases: ['contrast', 'dye', 'صبغة', 'ملون', 'فحص بصبغة'],
      termAr: 'الصبغة الطبية',
      simpleMeaningAr: 'مادة تنطي قبل أو أثناء بعض صور المفراس أو الرنين حتى توضح الأوعية والأنسجة بشكل أدق.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_17',
      termEn: 'Mammogram',
      aliases: ['mammogram', 'mammography', 'ماموغرام', 'اشعة الثدي'],
      termAr: 'الماموغرام (تصوير الثدي)',
      simpleMeaningAr: 'أشعة خاصة لفحص أنسجة الثدي سواء للفحص الدوري الوقائي أو لمتابعة كتلة.',
      domain: 'imaging',
    },
    {
      glossaryId: 'gl_18',
      termEn: 'Biopsy',
      aliases: ['biopsy', 'خزعة', 'عينة نسيج', 'زرع نسيج'],
      termAr: 'الخزعة (Biopsy)',
      simpleMeaningAr: 'أخذ عينة صغيرة من النسيج وفحصها بالمختبر حتى يتأكد الطبيب من طبيعتها بدقة.',
      domain: 'clinical',
    },
    {
      glossaryId: 'gl_19',
      termEn: 'Benign / Malignant',
      aliases: ['benign', 'malignant', 'حميد', 'خبيث'],
      termAr: 'حميد / خبيث',
      simpleMeaningAr: 'الحميد بالعادة غير سرطاني وما ينتشر، أما الخبيث فيشير إلى خلايا سرطانية تحتاج متابعة متخصصة.',
      domain: 'clinical',
    },
    {
      glossaryId: 'gl_20',
      termEn: 'Inflammation / Infection',
      aliases: ['inflammation', 'infection', 'التهاب', 'عدوى'],
      termAr: 'التهاب / عدوى',
      simpleMeaningAr: 'الالتهاب هو استجابة الجسم لأي أذى أو تهيج، أما العدوى فتصير بسبب جرثومة أو فيروس أو فطريات.',
      domain: 'general',
    },
    {
      glossaryId: 'gl_21',
      termEn: 'Culture',
      aliases: ['culture', 'زرع', 'مزرعة', 'زرع ادرار', 'زرع دم'],
      termAr: 'فحص الزرع (Culture)',
      simpleMeaningAr: 'فحص يكبر الجراثيم الموجودة بالعينة بالمختبر حتى يحدد نوعها وأفضل مضاد حيوي يعالجها.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_22',
      termEn: 'Ferritin',
      aliases: ['ferritin', 'فيريتين', 'مخزون الحديد', 'فرتين'],
      termAr: 'الفيريتين (مخزون الحديد)',
      simpleMeaningAr: 'بروتين يقيس كمية الحديد المخزونة بالجسم، ويساعد الطبيب يميز سبب نقص الدم، لكنه أحياناً يرتفع مؤقتاً مع الالتهابات.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_23',
      termEn: 'CRP / ESR',
      aliases: ['crp', 'esr', 'سي ار بي', 'سرعة الترسيب', 'مؤشر التهاب'],
      termAr: 'مؤشرات الالتهاب (CRP / ESR)',
      simpleMeaningAr: 'فحوصات عامة تبيّن وجود التهاب أو تهيّج بالجسم لكنها وحدها ما تحدد مكانه أو نوعه بدون الطبيب.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_24',
      termEn: 'PT / INR / PTT',
      aliases: ['pt', 'inr', 'ptt', 'تخثر', 'سيولة الدم', 'تجلط'],
      termAr: 'فحوصات تخثر الدم (PT / INR)',
      simpleMeaningAr: 'تقيس سرعة تخثر الدم، وتُستخدم خصوصاً لمتابعة أدوية السيولة أو قبل العمليات بإشراف الطبيب.',
      domain: 'labs',
    },
    {
      glossaryId: 'gl_25',
      termEn: 'Active Ingredient',
      aliases: ['active ingredient', 'generic name', 'المادة الفعالة', 'الاسم العلمي'],
      termAr: 'المادة الفعالة (الاسم العلمي)',
      simpleMeaningAr: 'المكون الأساسي بالدواء اللي يعطي المفعول الطبي، وممكن ينباع تحت أكثر من اسم تجاري.',
      domain: 'general',
    },
    {
      glossaryId: 'gl_26',
      termEn: 'Contraindication',
      aliases: ['contraindication', 'موانع الاستعمال', 'موانع الاستخدام'],
      termAr: 'موانع الاستعمال',
      simpleMeaningAr: 'الحالات اللي ما يصير بيها استخدام دواء أو فحص معين (مثل الحمل، حساسية، أو مشكلة كلى) إلا بقرار طبيب.',
      domain: 'general',
    },
    {
      glossaryId: 'gl_27',
      termEn: 'Echocardiogram (Echo)',
      aliases: ['echo', 'echocardiogram', 'ايكو', 'إيكو القلب', 'سونار القلب'],
      termAr: 'إيكو القلب (Echocardiogram)',
      simpleMeaningAr: 'فحص سونار آمن للقلب بدون أشعة يوضح حركة الصمامات وقوة ضخ عضلة القلب.',
      domain: 'imaging',
    },
  ];
}

export function loadDefaultSpecialties(): HaneenSpecialtyNode[] {
  return [
    // A. المختبرات والتحاليل (15 مجموعات)
    {
      specialtyId: 'spec_lab_01',
      code: 'LAB-01',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات الدم العامة (CBC والهيموغلوبين والصفائح)',
      titleEn: 'Complete Blood Count & Hematology',
      subBranchesAr: ['صورة الدم الكاملة CBC', 'الهيموغلوبين Hb', 'كريات الدم البيضاء WBC', 'الصفائح الدموية', 'مؤشرات MCV/MCH'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_02',
      code: 'LAB-02',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'الكيمياء الحيوية (السكر، الكلى، الكبد، الشوارد)',
      titleEn: 'Biochemistry (Glucose, Renal, Liver, Electrolytes)',
      subBranchesAr: ['سكر الدم والصائم', 'وظائف الكلى Creatinine/BUN', 'وظائف الكبد ALT/AST/Bilirubin', 'الشوارد Na/K/Ca'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_03',
      code: 'LAB-03',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات الدهون والتمثيل الغذائي (Lipids & HbA1c)',
      titleEn: 'Lipid Profile & Metabolic Markers',
      subBranchesAr: ['السكر التراكمي HbA1c', 'الكوليسترول الكلي', 'LDL / HDL', 'الدهون الثلاثية Triglycerides', 'مقاومة الإنسولين'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_04',
      code: 'LAB-04',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'الغدد والهرمونات (TSH، الخصوبة، الغدة الكظرية)',
      titleEn: 'Endocrine & Hormonal Lab Panels',
      subBranchesAr: ['هرمون TSH و Free T4', 'هرمون الحليب Prolactin', 'هرمونات الخصوبة FSH/LH', 'الكورتيزول'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_05',
      code: 'LAB-05',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'مخزون الحديد والفيتامينات والمعادن',
      titleEn: 'Iron Studies, Ferritin, Vitamin D & B12',
      subBranchesAr: ['الفيريتين Ferritin', 'الحديد بالدم', 'فيتامين B12 والفوليك', 'فيتامين D', 'المغنيسيوم والزنك'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_06',
      code: 'LAB-06',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات البول والخروج (Urinalysis & Stool)',
      titleEn: 'Urinalysis & Stool Examinations',
      subBranchesAr: ['تحليل الإدرار العام', 'فحص الخروج العام', 'الدم الخفي بالخروج', 'الزلال بالبول'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_07',
      code: 'LAB-07',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'المزارع البكتيرية وفحوصات الحساسية للمضادات',
      titleEn: 'Microbiology & Culture Sensitivity',
      subBranchesAr: ['زرع الإدرار', 'زرع الدم', 'مسحة الحلق والجروح', 'فحص حساسية المضادات'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_08',
      code: 'LAB-08',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'المدى المرجعي، الوحدات، وأساسيات قراءة التحاليل',
      titleEn: 'Reference Ranges, Units & Pre-analytical Prep',
      subBranchesAr: ['المدى المرجعي Reference Range', 'رموز H و L', 'وحدات mg/dL و mmol/L', 'الصيام وتوقيت العينة'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_09',
      code: 'LAB-09',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات المناعة والالتهاب والأمراض الروماتيزمية',
      titleEn: 'Immunology, CRP/ESR & Autoimmune Markers',
      subBranchesAr: ['CRP / ESR', 'عامل الروماتويد RF', 'الأجسام المضادة ANA'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_10',
      code: 'LAB-10',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات العدوى الفيروسية والمصلية (Serology)',
      titleEn: 'Infectious Disease & Viral Serology',
      subBranchesAr: ['فحوصات الكبد الفيروسية', 'فحوصات الحمى والالتهابات'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_11',
      code: 'LAB-11',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات التخثر والسيولة (PT / INR / D-Dimer)',
      titleEn: 'Coagulation & Thrombosis Panels',
      subBranchesAr: ['PT / INR', 'aPTT', 'D-Dimer'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_12',
      code: 'LAB-12',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات الحمل والخصوبة (Beta-hCG والسائل المنوي)',
      titleEn: 'Pregnancy & Fertility Laboratory Tests',
      subBranchesAr: ['هرمون الحمل Beta-hCG', 'تحليل السائل المنوي', 'متابعة الحمل المخبرية'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_13',
      code: 'LAB-13',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'دلالات الأورام (Tumor Markers) وحدود تفسيرها',
      titleEn: 'Tumor Markers & Safe Interpretation Boundaries',
      subBranchesAr: ['PSA', 'CA-125', 'CEA', 'AFP'],
      completeness: 'populated',
      roadmapPriority: 'P1',
      enabled: true,
      notesAr: 'لا تشخص السرطان لوحدها؛ تستخدم للمتابعة مع الطبيب.',
    },
    {
      specialtyId: 'spec_lab_14',
      code: 'LAB-14',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'فحوصات الحساسية (IgE واختبارات التحسس)',
      titleEn: 'Allergy & Sensitivity Panels',
      subBranchesAr: ['IgE الكلي والنوعي', 'تحسس الطعام والتنفس'],
      completeness: 'missing',
      roadmapPriority: 'P2',
      enabled: true,
    },
    {
      specialtyId: 'spec_lab_15',
      code: 'LAB-15',
      domain: 'labs',
      mainGroupAr: 'المختبرات والتحاليل الطبية',
      titleAr: 'الفحوصات الجينية والجزيئية (PCR والتقنيات الوراثية)',
      titleEn: 'Molecular & Genetic Lab Panels',
      subBranchesAr: ['PCR', 'الفحوصات الوراثية وفحص ما قبل الزواج'],
      completeness: 'missing',
      roadmapPriority: 'P3',
      enabled: true,
    },

    // B. الأشعة والتصوير الطبي (12 مجموعة)
    {
      specialtyId: 'spec_img_01',
      code: 'IMG-01',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'الأشعة السينية العادية (X-Ray)',
      titleEn: 'Conventional X-Ray Imaging',
      subBranchesAr: ['أشعة الصدر', 'أشعة العظام والمفاصل', 'أشعة الأسنان'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_img_02',
      code: 'IMG-02',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'السونار (الموجات فوق الصوتية) والدوبلر',
      titleEn: 'Ultrasound & Doppler Studies',
      subBranchesAr: ['سونار البطن والحوض', 'سونار الغدة والثدي', 'سونار الحمل', 'فحص الدوبلر للأوعية'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_img_03',
      code: 'IMG-03',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'التصوير المقطعي / المفراس (CT Scan) والصبغة',
      titleEn: 'Computed Tomography (CT) & Contrast Safety',
      subBranchesAr: ['مفراس الدماغ والصدر والبطن', 'المفراس بالصبغة الوريدية', 'سلامة الكلى والحساسية للصبغة'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_img_04',
      code: 'IMG-04',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'الرنين المغناطيسي (MRI) ومعادن الجسم',
      titleEn: 'Magnetic Resonance Imaging (MRI) & Safety',
      subBranchesAr: ['رنين الدماغ والعمود الفقري', 'رنين المفاصل والركبة', 'شروط المعادن ومنظم القلب', 'فهم مصطلح الانزلاق الغضروفي'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_img_05',
      code: 'IMG-05',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'تصوير الثدي (الماموغرام) وكثافة العظام (DEXA) والطب النووي',
      titleEn: 'Mammography, DEXA & Nuclear Medicine / PET-CT',
      subBranchesAr: ['الماموغرام', 'قياس هشاشة العظام DEXA', 'المسح الذري وPET-CT'],
      completeness: 'populated',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_img_06',
      code: 'IMG-06',
      domain: 'imaging',
      mainGroupAr: 'الأشعة والتصوير الطبي',
      titleAr: 'الأشعة التداخلية، أشعة الأسنان البانورامية، والتصوير بالصبغة الفلوروسكوبي',
      titleEn: 'Interventional, Dental CBCT & Fluoroscopy',
      subBranchesAr: ['الأشعة التداخلية وأخذ الخزعات', 'أشعة البانوراما وCBCT للأسنان', 'التصوير التلفزيوني بالصبغة'],
      completeness: 'intro_only',
      roadmapPriority: 'P2',
      enabled: true,
    },

    // C. التخصصات الطبية السريرية (تغطي الـ 30+ تخصص وتفريعات الـ 45 فرع من ملف 01 و 05 و 12)
    {
      specialtyId: 'spec_clin_01',
      code: 'CLN-01',
      domain: 'clinical',
      mainGroupAr: 'الرعاية الأولية والباطنية',
      titleAr: 'الطب العام وطب الأسرة',
      titleEn: 'General & Family Medicine',
      subBranchesAr: ['الفحص الدوري والوقائي', 'العدوى الشائعة', 'إدارة الأمراض المزمنة المبكرة'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_02',
      code: 'CLN-02',
      domain: 'clinical',
      mainGroupAr: 'الرعاية الأولية والباطنية',
      titleAr: 'الطب الباطني',
      titleEn: 'Internal Medicine',
      subBranchesAr: ['التعب العام والحمى غير الواضحة', 'الأمراض متعددة الأجهزة', 'متابعة الكبار'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_03',
      code: 'CLN-03',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'أمراض القلب والأوعية الدموية',
      titleEn: 'Cardiology & Vascular Medicine',
      subBranchesAr: ['ضغط الدم', 'الخفقان وتسرع النبض', 'ألم الصدر والشرايين', 'إيكو وتخطيط القلب'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_04',
      code: 'CLN-04',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'أمراض الصدر والجهاز التنفسي (وطب النوم)',
      titleEn: 'Pulmonology, Respiratory & Sleep Medicine',
      subBranchesAr: ['السعال المزمن والربو', 'ضيق التنفس', 'التهابات الصدر', 'توقف التنفس أثناء النوم'],
      completeness: 'intro_only',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_05',
      code: 'CLN-05',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'أمراض الجهاز الهضمي والكبد (والمرارة)',
      titleEn: 'Gastroenterology & Hepatology',
      subBranchesAr: ['آلام البطن والحرقة والارتجاع', 'القولون', 'الكبد والصفار', 'النواظير الهضمية'],
      completeness: 'intro_only',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_06',
      code: 'CLN-06',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'أمراض الكلى والمسالك البولية',
      titleEn: 'Nephrology & Urology',
      subBranchesAr: ['التهاب المجاري البولية', 'حصى الكلى', 'قصور الكلى', 'البروستات والمثانة'],
      completeness: 'intro_only',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_07',
      code: 'CLN-07',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'الغدد الصماء والسكري',
      titleEn: 'Endocrinology & Diabetes',
      subBranchesAr: ['السكري والتراكمي', 'خمول ونشاط الغدة الدرقية', 'الهرمونات والتمثيل الغذائي'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_08',
      code: 'CLN-08',
      domain: 'clinical',
      mainGroupAr: 'أجهزة الجسم الرئيسية',
      titleAr: 'الأعصاب والدماغ (وجراحة الأعصاب)',
      titleEn: 'Neurology & Neurosurgery',
      subBranchesAr: ['الصداع والشقيقة', 'الدوار والصرع', 'التنميل والانزلاق الغضروفي', 'السكتة الدماغية'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_09',
      code: 'CLN-09',
      domain: 'clinical',
      mainGroupAr: 'العناية بالأسرة والمراحل العمرية',
      titleAr: 'طب الأطفال وحديثو الولادة (والمراهقين)',
      titleEn: 'Pediatrics, Neonatology & Adolescent Medicine',
      subBranchesAr: ['حرارة الطفل وتطوراته', 'التغذية واللقاحات', 'حديثو الولادة', 'جراحة الأطفال'],
      completeness: 'intro_only',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_10',
      code: 'CLN-10',
      domain: 'clinical',
      mainGroupAr: 'العناية بالأسرة والمراحل العمرية',
      titleAr: 'النسائية والتوليد (والخصوبة والصحة الإنجابية)',
      titleEn: 'Obstetrics, Gynecology & Reproductive Health',
      subBranchesAr: ['متابعة الحمل', 'اضطراب الدورة', 'الألياف والتكيس', 'الخصوبة'],
      completeness: 'intro_only',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_11',
      code: 'CLN-11',
      domain: 'clinical',
      mainGroupAr: 'الجراحة والعظام والتأهيل',
      titleAr: 'جراحة العظام والمفاصل والعمود الفقري',
      titleEn: 'Orthopedics & Spine Surgery',
      subBranchesAr: ['الكسور والالتواءات', 'آلام الظهر والانزلاق الغضروفي', 'خشونة الركبة والمفاصل', 'إصابات الرياضيين'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_12',
      code: 'CLN-12',
      domain: 'clinical',
      mainGroupAr: 'الجراحة والعظام والتأهيل',
      titleAr: 'الجراحة العامة والتخدير (وجراحة الصدر والأوعية والتجميل والحروق)',
      titleEn: 'General Surgery, Anesthesia, Cardiothoracic & Plastic Surgery',
      subBranchesAr: ['المرارة والزائدة والفتق', 'العناية بالجروح والحروق', 'التخدير وعلاج الألم', 'جراحة القلب والأوعية والتجميل الترميمي'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_13',
      code: 'CLN-13',
      domain: 'clinical',
      mainGroupAr: 'الحواس والجلد والأسنان',
      titleAr: 'الجلدية والتناسلية والحساسية السريرية',
      titleEn: 'Dermatology & Clinical Allergy',
      subBranchesAr: ['الأكزيما والطفح والحكة', 'حب الشباب والالتهابات الجلدية', 'التحسس الجلدي'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_14',
      code: 'CLN-14',
      domain: 'clinical',
      mainGroupAr: 'الحواس والجلد والأسنان',
      titleAr: 'طب العيون',
      titleEn: 'Ophthalmology',
      subBranchesAr: ['ضعف البصر والزغللة', 'احمرار وحساسية العين', 'اعتلال الشبكية وضغط العين'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_15',
      code: 'CLN-15',
      domain: 'clinical',
      mainGroupAr: 'الحواس والجلد والأسنان',
      titleAr: 'الأنف والأذن والحنجرة (والسمعيات والنطق)',
      titleEn: 'ENT, Audiology & Speech',
      subBranchesAr: ['التهاب الأذن واللوزتين', 'الجيوب الأنفية', 'الطنين والدوخة الأذنية'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_16',
      code: 'CLN-16',
      domain: 'clinical',
      mainGroupAr: 'الحواس والجلد والأسنان',
      titleAr: 'طب الأسنان وجراحة الفكين',
      titleEn: 'Dentistry & Oral Maxillofacial',
      subBranchesAr: ['آلام الأسنان واللثة', 'الخراجات', 'جراحة الفكين'],
      completeness: 'intro_only',
      roadmapPriority: 'P2',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_17',
      code: 'CLN-17',
      domain: 'clinical',
      mainGroupAr: 'الدم والمناعة والأورام والعدوى',
      titleAr: 'أمراض الدم والروماتيزم والمناعة',
      titleEn: 'Hematology & Rheumatology',
      subBranchesAr: ['فقر الدم وأنواعه', 'اضطرابات الصفائح والتخثر', 'التهابات المفاصل المناعية'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_18',
      code: 'CLN-18',
      domain: 'clinical',
      mainGroupAr: 'الدم والمناعة والأورام والعدوى',
      titleAr: 'طب الأورام والرعاية التلطيفية',
      titleEn: 'Oncology & Palliative Care',
      subBranchesAr: ['فهم مصطلح الخزعة (حميد/خبيث)', 'دلالات الأورام', 'الدعم التلطيفي وتخفيف الأعراض'],
      completeness: 'missing',
      roadmapPriority: 'P2',
      enabled: true,
      notesAr: 'متاح حالياً شرح المصطلحات الأساسية (الخزعة ودلالات الأورام) فقط — المحتوى التخصصي التفصيلي قيد الإعداد.',
    },
    {
      specialtyId: 'spec_clin_19',
      code: 'CLN-19',
      domain: 'clinical',
      mainGroupAr: 'الدم والمناعة والأورام والعدوى',
      titleAr: 'الأمراض المعدية والسموم',
      titleEn: 'Infectious Diseases & Toxicology',
      subBranchesAr: ['الحمى والعدوى الفيروسية والبكتيرية', 'الإنتان والتسمم'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_20',
      code: 'CLN-20',
      domain: 'clinical',
      mainGroupAr: 'الطوارئ والعناية الحرجة والصحة الشاملة',
      titleAr: 'طب الطوارئ والعناية المركزة (ICU)',
      titleEn: 'Emergency Medicine & Critical Care',
      subBranchesAr: ['بوابة الفرز الطارئ Red Flags', 'ألم الصدر وضيق التنفس والسكتة', 'التحسس الشديد والإنتان'],
      completeness: 'populated',
      roadmapPriority: 'P0',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_21',
      code: 'CLN-21',
      domain: 'clinical',
      mainGroupAr: 'الطوارئ والعناية الحرجة والصحة الشاملة',
      titleAr: 'الصحة النفسية والطب النفسي',
      titleEn: 'Psychiatry & Mental Health',
      subBranchesAr: ['القلق والاكتئاب والتوتر المزمن', 'اضطراب النوم', 'الدعم العاجل عند أفكار إيذاء النفس'],
      completeness: 'intro_only',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_22',
      code: 'CLN-22',
      domain: 'clinical',
      mainGroupAr: 'الطوارئ والعناية الحرجة والصحة الشاملة',
      titleAr: 'التغذية العلاجية والطب الوقائي وطب الشيخوخة',
      titleEn: 'Clinical Nutrition, Preventive Medicine & Geriatrics',
      subBranchesAr: ['مبادئ الغذاء الصحي WHO', 'التلقيح والوقاية', 'رعاية كبار السن'],
      completeness: 'populated',
      roadmapPriority: 'P1',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_23',
      code: 'CLN-23',
      domain: 'clinical',
      mainGroupAr: 'الطوارئ والعناية الحرجة والصحة الشاملة',
      titleAr: 'التأهيل والعلاج الطبيعي والطب الرياضي والمهني',
      titleEn: 'Physical Medicine, Rehabilitation, Sports & Occupational',
      subBranchesAr: ['تأهيل المفاصل والعمود الفقري', 'بعد الجلطة أو الكسور', 'الطب المهني والبيئي'],
      completeness: 'missing',
      roadmapPriority: 'P2',
      enabled: true,
    },
    {
      specialtyId: 'spec_clin_24',
      code: 'CLN-24',
      domain: 'clinical',
      mainGroupAr: 'الوراثة والتخصصات الدقيقة',
      titleAr: 'الوراثة الطبية والفحوصات الوراثية النادرة',
      titleEn: 'Medical Genetics',
      subBranchesAr: ['الاستشارة الوراثية', 'فحص ما قبل الزواج', 'الأمراض النادرة'],
      completeness: 'missing',
      roadmapPriority: 'P3',
      enabled: true,
    },
  ];
}

export function loadDefaultKnowledgeTopics(): HaneenKnowledgeTopic[] {
  const today = '2026-11-16';
  const baseReviewer = 'فريق المراجعة الطبية التأسيسي — MEDORA';

  return [
    {
      topicId: 'topic_lab_ranges_units',
      titleAr: 'فهم المدى المرجعي (Reference Range) والوحدات ورموز H / L',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'قراءة التقارير والوحدات',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'المدى المرجعي هو المعدل المعتاد المطبوع بورقة التحليل حتى يساعد الطبيب يعرف إذا الرقم ضمن المعتاد بهذا المختبر لو أعلى (H) أو أقل (L) منه.',
      whatItMeans:
        'وجود رمز H (مرتفع) أو L (منخفض) ما يعني وحدها وجود مرض أكيد. كل مختبر وجهاز إله حدوده ووحداته الخاصة (مثل mg/dL أو mmol/L)، وحتى الأكل والصيام والعمر والحمل وشرب المي يأثرون على الرقم.',
      patientNeedToKnow:
        'المقارنة تكون ويا المدى المطبوع بنفس الورقة بس، بدون مقارنة رقم مختبر بمختبر ثاني إذا الوحدات أو الأجهزة مختلفة.',
      relatedSymptoms: ['أعراض عامة حسب نوع الفحص'],
      relatedTests: ['جميع التحاليل المخبرية'],
      preparation: 'الالتزام بتعليمات المختبر بخصوص الصيام أو وقت السحب، وعدم إيقاف أي دواء قبل سؤال الطبيب.',
      whenToSeeDoctor: 'عرض أي نتيجة خارج المعدل أو مصحوبة بأعراض على الطبيب المعالج لقراءتها ويا باقي الفحوصات.',
      emergencySigns: ['علامات الخطر العامة كألم الصدر الشديد أو ضيق التنفس المفاجئ أو النزيف'],
      whatCannotBeInferred:
        'ما نكدر نعرف السبب أو نشخص أي مرض من كلمة "عالي" أو "H" لوحدها بدون اسم الفحص والقيمة والوحدة والمدى المطبوع وفحص الطبيب.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: How to Understand Your Lab Results',
      sourceUrl: 'https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'تثقيف حكومي موثوق للمريض — تلخيص مبسط مع حفظ الرابط.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['مدى مرجعي', 'معدل طبيعي', 'وحدة', 'مرتفع', 'منخفض', 'طالع h', 'طالع l', 'reference range', 'high', 'low', 'borderline'],
    },
    {
      topicId: 'topic_lab_cbc_hb',
      titleAr: 'تحليل الدم الكامل (CBC) والهيموغلوبين (Hb)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'فحوصات الدم',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'تحليل الـ CBC يفحص خلايا الدم الثلاثة: الحمراء (والهيموغلوبين اللي ينقل الأوكسجين)، والبيضاء (المناعة)، والصفائح (التخثر).',
      whatItMeans:
        'انخفاض الهيموغلوبين عن المعدل المطبوع أحياناً يصير بسبب نقص الحديد أو الفيتامينات أو فقدان دم أو أسباب ثانية، بينما ارتفاع أو نزول كريات الدم البيضاء ممكن يصير مع التهاب أو رشح عابر. النتيجة وحدها ما تكفي لتحديد السبب.',
      patientNeedToKnow:
        'إذا انذكرت عبارة «دم ناقص»، مهم التأكد أي تحليل المقصود (مثل Hb أو الفيريتين) وشگد الرقم والمدى المطبوع بالورقة.',
      relatedSymptoms: ['تعب وخمول', 'دوخة', 'شحوب', 'خفقان'],
      relatedTests: ['CBC', 'Hemoglobin (Hb)', 'MCV', 'Ferritin', 'Vitamin B12'],
      preparation: 'بالعادة ما يحتاج صيام إلا إذا طلبه الطبيب ويا تحاليل ثانية.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج إذا النتيجة أقل أو أعلى من المعدل المطبوع أو إذا اكو تعب ودوخة مستمرة، وعدم أخذ حديد بدون استشارة.',
      emergencySigns: ['ضيق نفس شديد أثناء الراحة', 'إغماء أو فقدان وعي', 'نزيف لا يتوقف'],
      whatCannotBeInferred:
        'انخفاض الهيموغلوبين لوحده لا يحدد سبب فقر الدم ولا يعني أخذ حديد عشوائياً بدون فحص الطبيب.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: Complete Blood Count (CBC)',
      sourceUrl: 'https://medlineplus.gov/lab-tests/complete-blood-count-cbc/',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['cbc', 'هيموغلوبين', 'هموكلوبين', 'هيموجلوبين', 'hb', 'hgb', 'rbc', 'wbc', 'platelets', 'صفائح', 'دمي ناقص', 'فقر دم', 'mcv'],
    },
    {
      topicId: 'topic_lab_hba1c_glucose',
      titleAr: 'سكر الدم والسكر التراكمي (HbA1c)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'السكري والتمثيل الغذائي',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'البالغين والأطفال',
      audience: 'المريض',
      simpleExplanation:
        'فحص السكر اليومي يبيّن السكر بهذي اللحظة بس، بينما السكر التراكمي (HbA1c) يبيّن معدل السكر بالدم خلال آخر شهرين إلى 3 أشهر.',
      whatItMeans:
        'ارتفاع السكر أو التراكمي عن المدى المطبوع بالتقرير يستدعي متابعة الطبيب حتى يقرأه ويا العمر والحالة الصحية (وبعض الحالات مثل فقر الدم أو الحمل تأثر على قراءة التراكمي).',
      patientNeedToKnow:
        'ما يصير رفع أو تنزيل جرعة حبوب السكر أو الإنسولين بدون استشارة الطبيب اعتماداً على رقم واحد.',
      relatedSymptoms: ['عطش شديد', 'كثرة التبول', 'تعب وخمول', 'زغللة بالعين'],
      relatedTests: ['Fasting Glucose', 'Random Glucose', 'HbA1c'],
      preparation: 'سكر الصيام يحتاج صياماً (عادة 8–12 ساعة مع شرب المي بس حسب تعليمات المختبر)، بينما التراكمي ما يحتاج صيام.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج ويا النتيجة المطبوعة والمدى المرجعي لمتابعة خطة العلاج أو الفحوصات التأكيدية.',
      emergencySigns: ['قيء مستمر وألم بطن شديد مع تسارع التنفس', 'تشوش ذهن أو فقدان وعي', 'هبوط سكر حاد مع ارتباك أو إغماء'],
      whatCannotBeInferred:
        'ما نكدر نعدّل جرعة إنسولين أو دواء من قراءة التراكمي وحدها، ولا نفرض مدى مرجعياً غير مطبوع بورقة المختبر.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: A1C Test',
      sourceUrl: 'https://medlineplus.gov/a1c.html',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['hba1c', 'a1c', 'سكر تراكمي', 'تراكمي', 'غلوكوز', 'سكر صائم', 'glucose', 'مخزون السكر'],
    },
    {
      topicId: 'topic_lab_kidney_cmp',
      titleAr: 'فحوصات الكلى والشوارد (Creatinine / BUN / Electrolytes)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'وظائف الكلى والأملاح',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'تحاليل مثل الكرياتينين (Creatinine) واليوريا (BUN) والأملاح (صوديوم وبوتاسيوم) تعطي فكرة للطبيب عن شلون الكلى دا تصفي الفضلات وتحفظ توازن سوائل الجسم.',
      whatItMeans:
        'تغيّر بسيط بالكرياتينين أو اليوريا أحياناً يصير بسبب قلة شرب المي (جفاف)، مجهود بدني قوي، أو مسكنات وأدوية معينة، ومو معناها فشل كلوي مباشرة.',
      patientNeedToKnow:
        'شرب السوائل بشكل اعتيادي إذا ماكو تقييد سوائل طبي، وإبلاغ الطبيب بأي مسكنات أو مكملات مستخدمة.',
      relatedSymptoms: ['تورم القدمين أو حول العين', 'تغير كمية البول', 'إرهاق عام'],
      relatedTests: ['Creatinine', 'eGFR', 'BUN / Urea', 'Sodium', 'Potassium', 'Urinalysis'],
      preparation: 'بالعادة مع لوحة الكيمياء قد يُطلب صيام؛ الالتزام بتعليمات المختبر.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج إذا الكرياتينين أو الأملاح خارج المدى المطبوع أو إذا اكو سكري أو ضغط للمتابعة الدورية.',
      emergencySigns: ['انقطاع تام بالبول', 'ضيق نفس شديد مع تورم مفاجئ', 'اضطراب وعي أو خفقان حاد'],
      whatCannotBeInferred:
        'ما ينحكم على كفاءة الكلى أو تنوگف أدوية الضغط من رقم واحد بدون تقييم الطبيب للـ eGFR والتاريخ المرضي.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: Comprehensive Metabolic Panel (CMP)',
      sourceUrl: 'https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['creatinine', 'كرياتينين', 'يوريا', 'bun', 'كلى', 'وظائف الكلى', 'بوتاسيوم', 'صوديوم', 'cmp'],
    },
    {
      topicId: 'topic_lab_liver_enzymes',
      titleAr: 'إنزيمات الكبد والصفار (ALT / AST / Bilirubin)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'وظائف الكبد',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'إنزيمات الكبد (ALT / AST / ALP) والصفار (Bilirubin) هي فحوصات دم تطمئن الطبيب على سلامة خلايا الكبد والمرارة.',
      whatItMeans:
        'ارتفاعها البسيط مو دائماً مرض خطير؛ أحياناً تتأثر بدهون الكبد، أدوية أو أعشاب، فيروسات عابرة، أو حتى مجهود عضلي شديد.',
      patientNeedToKnow:
        'تجنّب أخذ أعشاب أو خلطات غير معروفة أو مسكنات زيادة لأنها قد تزيد إجهاد الكبد.',
      relatedSymptoms: ['اصفرار العينين أو الجلد', 'ألم أعلى يمين البطن', 'غثيان', 'بول داكن'],
      relatedTests: ['ALT', 'AST', 'ALP', 'Bilirubin', 'Albumin', 'Abdominal Ultrasound'],
      preparation: 'مراجعة المختبر بخصوص الصيام إذا طُلبت مع تحاليل الدهون.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج لقراءة كل إنزيمات الكبد سوية وتحديد السبب، خاصة إذا استمر الارتفاع.',
      emergencySigns: ['اصفرار سريع مع تشتت ذهن أو نعاس غير معتاد', 'قيء دم أو نزيف', 'ألم بطن حاد مع حمى عالية'],
      whatCannotBeInferred:
        'لا يمكن تحديد سبب ارتفاع الإنزيمات (دهون، فيروس، دواء، مرارة) من الرقم وحده دون طبيب وفحوصات مكملة.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: Comprehensive Metabolic Panel (CMP)',
      sourceUrl: 'https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['alt', 'ast', 'bilirubin', 'alp', 'كبد', 'وظائف الكبد', 'إنزيمات الكبد', 'صفار', 'ابو صفار'],
    },
    {
      topicId: 'topic_lab_lipids',
      titleAr: 'فحوصات الدهون والكوليسترول (LDL / HDL / Triglycerides)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'الدهون والقلب',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'البالغين',
      audience: 'المريض',
      simpleExplanation:
        'تحليل الدهون يقيس أنواع الشحوم بالدم: LDL (الدهون الضارة اللي إذا ارتفعت هواي ممكن تتجمع بالشرايين)، HDL (النافع اللي يساعد بتنظيفها)، والدهون الثلاثية (Triglycerides).',
      whatItMeans:
        'الرقم الأعلى من المعدل ما يعتمد عليه القرار لوحده؛ الطبيب يجمعه ويا العمر، الضغط، السكر، التدخين، والتاريخ العائلي قبل ما يقرر إذا يكفي نظام أكل وحركة لو يحتاج علاج.',
      patientNeedToKnow:
        'الدهون الثلاثية بالذات تتأثر هواي بالأكل الدسم والحلويات قبل الفحص، ولذلك الالتزام بالصيام (إذا طُلب) كلش مهم.',
      relatedSymptoms: ['بالعادة بدون أعراض واضحة وتُكتشف بالفحص الدوري'],
      relatedTests: ['Total Cholesterol', 'LDL', 'HDL', 'Triglycerides', 'Fasting Glucose'],
      preparation: 'بعض المختبرات تطلب صيام 9–12 ساعة مع شرب الماء فقط قبل فحص الدهون.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج لتقييم نسبة الخطر القلبية الشاملة وخطة الغذاء أو العلاج المناسبة.',
      emergencySigns: ['ألم ضاغط بالصدر أو ضيق تنفس مفاجئ (طوارئ فورية)'],
      whatCannotBeInferred:
        'ما نكدر نبدأ أو نوقف دواء كوليسترول بدون تقييم الطبيب، حتى لو الرقم عالي بتقرير واحد.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Cholesterol & Lipids',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة تثقيفية مبسطة غير منسوخة مع حفظ الرابط.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['كولسترول', 'كوليسترول', 'cholesterol', 'ldl', 'hdl', 'triglycerides', 'دهون ثلاثية', 'شحوم'],
    },
    {
      topicId: 'topic_lab_thyroid_tsh',
      titleAr: 'هرمون الغدة الدرقية (TSH)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'الغدد والهرمونات',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'هرمون الـ TSH تفرزه الغدة النخامية حتى ينظّم شغل الغدة الدرقية، اللي تتحكم بنشاط الجسم، دقات القلب، الحرارة، والحرق.',
      whatItMeans:
        'بشكل مبسط: ارتفاع TSH غالباً يخلّي الطبيب يفكر بخمول بالغدة الدرقية، وانخفاضه ممكن يصير مع نشاط زايد بالغدة—وغالباً يطلب معه الطبيب هرمون الغدة نفسه (مثل Free T4) حتى تتضح الصورة.',
      patientNeedToKnow:
        'في حال استخدام علاج غدة درقية (مثل الثيروكسين)، ما يصير تعديل الجرعة بدون استشارة، والأفضل سؤال الطبيب إذا ينعمل الفحص قبل أخذ الحبة.',
      relatedSymptoms: ['تعب وخمول أو تسارع نبض', 'زيادة أو نقص وزن', 'برد أو تعرق زائد', 'تقلب مزاج'],
      relatedTests: ['TSH', 'Free T4', 'Free T3', 'Thyroid Ultrasound'],
      preparation: 'لا يتطلب صيام عادةً، لكن يُنصح بإبلاغ الطبيب عن أدوية الغدة أو البيوتين.',
      whenToSeeDoctor: 'عرض النتيجة على الطبيب المعالج لقراءة TSH ويا Free T4 والأعراض.',
      emergencySigns: ['خفقان عنيف متواصل، ضيق تنفس حاد، أو إغماء'],
      whatCannotBeInferred:
        'قراءة TSH واحدة دون Free T4 أو مراجعة الطبيب لا تكفي لتعديل جرعة دواء الغدة الدرقية.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Thyroid Tests',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['tsh', 'غدة درقية', 'خمول الغدة', 'نشاط الغدة', 'free t4', 'thyroid'],
    },
    {
      topicId: 'topic_lab_iron_vitamins',
      titleAr: 'مخزون الحديد (الفيريتين) وفيتامين D وفيتامين B12',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'الفيتامينات والمعادن',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'الفيريتين يبيّن شكد مخزون الحديد بداخل الجسم، وفيتامين D مهم للعظام والمناعة، وفيتامين B12 ضروري لصحة الأعصاب وتكوين الدم.',
      whatItMeans:
        'نقصها ممكن يسبب تعب أو خمول أو تساقط شعر أو تنميل، بس أحياناً الفيريتين يرتفع بشكل مؤقت وقت الالتهابات وما يعكس المخزون الحقيقي لوحده.',
      patientNeedToKnow:
        'ما يصير أخذ جرعات عالية من الحديد أو الفيتامينات بدون فحص ووصفة طبيب لأن الزيادة الكبيرة منها هم ممكن تضر.',
      relatedSymptoms: ['خمول وإرهاق', 'تساقط شعر', 'تنميل بالأطراف', 'ألم عظام وعضلات'],
      relatedTests: ['Serum Ferritin', 'Serum Iron', 'CBC', 'Vitamin D', 'Vitamin B12'],
      preparation: 'بعض المختبرات تفضّل سحب الحديد صباحاً بعد راحة أو صيام قصير.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج ويا الأرقام والمديات المطبوعة ليحدد نوع المكمل والجرعة والمدة المناسبة.',
      emergencySigns: ['خمول مع ضيق نفس حاد، ألم صدر، أو إغماء'],
      whatCannotBeInferred:
        'الشعور بالتعب لوحده ما يثبت نقص فيتامين د أو حديد بدون تحليل، وما ينوصف عليه علاج أو إبر فيتامينات.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus Medical Encyclopedia & Tests',
      sourceUrl: 'https://medlineplus.gov/languages/arabic.html',
      publisher: 'MedlinePlus (NLM)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['ferritin', 'فيريتين', 'مخزون الحديد', 'حديد', 'فيتامين د', 'vitamin d', 'b12', 'فيتامين ب12'],
    },
    {
      topicId: 'topic_lab_urinalysis_culture',
      titleAr: 'تحليل الإدرار العام (Urinalysis) والزرع البكتيري (Culture)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'تحاليل البول والميكروبيولوجي',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'تحليل الإدرار العام يفحص البول بالعين والكيمياء والمجهر حتى يكشف إذا اكو علامات التهاب أو أملاح أو سكر أو دم، أما الزرع (Culture) فيحدد نوع البكتيريا بالضبط.',
      whatItMeans:
        'وجود خلايا بيضاء أو بكتيريا بالبول العام أحياناً يكون التهاب مجاري وأحياناً تلوث عينة أثناء الجمع، ولذلك الطبيب يطلب أحياناً زرع إدرار حتى يتأكد ويختار المضاد الصح.',
      patientNeedToKnow:
        'عينة منتصف البول النظيفة (Midstream) تعطي أدق نتيجة، وما يصير أخذ مضاد حيوي عشوائي قبل ما يشوف الطبيب التحليل.',
      relatedSymptoms: ['حرقة عند التبول', 'تكرر التبول', 'ألم أسفل البطن أو الخاصرة'],
      relatedTests: ['Urinalysis', 'Urine Culture', 'Kidney Ultrasound'],
      preparation: 'تنظيف المنطقة واستخدام علبة المختبر المعقمة وأخذ عينة منتصف التبول.',
      whenToSeeDoctor: 'مراجعة الطبيب المعالج خاصة إذا اكو حرقة أو صديد أو أملاح متكررة أو في حالة الحمل.',
      emergencySigns: ['حمى عالية وقشعريرة مع ألم حاد بالخاصرة', 'انحباس البول', 'قيء متواصل'],
      whatCannotBeInferred:
        'حنين ما تگدر تصرف مضاد حيوي من نتيجة البول أو الزرع؛ هذا دور الطبيب حصراً.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: Urinalysis',
      sourceUrl: 'https://medlineplus.gov/urinalysis.html',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['ادرار', 'إدرار', 'بول', 'urinalysis', 'culture', 'زرع', 'املاح', 'حرقة بول', 'صديد'],
    },
    {
      topicId: 'topic_lab_tumor_markers_edu',
      titleAr: 'علامات الأورام (Tumor Markers) — حدود الفهم الآمن',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'دلالات الأورام',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'البالغين',
      audience: 'المريض',
      simpleExplanation:
        'دلالات الأورام هي مواد بالدم أحياناً يطلبها الطبيب لمتابعة علاج أو حالة معينة أو كجزء من فحوصات شاملة.',
      whatItMeans:
        'مهم جداً الانتباه: ارتفاع علامة ورم مثل PSA أو CA-125 أو CEA لا يعني لوحده وجود سرطان! بعض الالتهابات أو التكيسات الحميدة ترفعها أحياناً، وبنفس الوقت الرقم الطبيعي ما ينفي كل شي.',
      patientNeedToKnow:
        'تشخيص أي ورم ما يصير بتحليل دم لحاله أبداً، وإنما بالطبيب والفحص والأشعة وأحياناً الخزعة.',
      relatedSymptoms: ['تعتمد على سبب طلب الطبيب للفحص'],
      relatedTests: ['PSA', 'CA-125', 'CEA', 'AFP', 'Imaging & Biopsy'],
      preparation: 'حسب تعليمات المختبر والطبيب.',
      whenToSeeDoctor: 'مناقشة النتيجة مباشرة مع الطبيب المختص اللي طلب الفحص بدون قلق أو استنتاجات مسبقة.',
      emergencySigns: ['نزيف غير مبرر، ضيق نفس حاد، أو فقدان وعي'],
      whatCannotBeInferred:
        'لا يُجزم أبداً بوجود أو عدم وجود سرطان من دلالات الأورام أو نتائج الدم وحدها.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Tumor Markers & Diagnosis',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['tumor markers', 'دلالات الاورام', 'علامات الاورام', 'psa', 'ca-125', 'cea', 'afp', 'خزعة'],
    },

    // B. الأشعة والتصوير الطبي
    {
      topicId: 'topic_img_xray_ultrasound_doppler',
      titleAr: 'الأشعة السينية (X-Ray) والسونار (Ultrasound) والدوبلر',
      mainSpecialty: 'الأشعة والتصوير الطبي',
      subSpecialty: 'الأشعة العادية والموجات الصوتية',
      domain: 'imaging',
      topicType: 'أشعة',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'الأشعة السينية (X-Ray) تعطي صورة سريعة للعظام أو الصدر بكمية أشعة قليلة جداً، أما السونار فيستخدم موجات صوتية آمنة تماماً بدون أشعة، والدوبلر هو سونار خاص يشيك جريان الدم بالشرايين والأوردة.',
      whatItMeans:
        'كل فحص إله شغله: الأشعة تفيد بالكسور والصدر، والسونار ممتاز للبطن والكبد والمرارة والكلى والحمل، والدوبلر للجلطات الوريدية أو تدفق الدم.',
      patientNeedToKnow:
        'سونار البطن أحياناً يحتاج صيام ساعات، وسونار الحوض يحتاج شرب مي حتى تمتلئ المثانة—الأفضل التأكد من مركز الأشعة قبل الموعد.',
      relatedSymptoms: ['ألم بطن', 'كسور أو كدمات', 'متابعة حمل', 'تورم ساق'],
      relatedTests: ['X-Ray', 'Ultrasound', 'Doppler Ultrasound'],
      preparation: 'إبلاغ الفني فوراً إذا اكو حمل أو احتمال حمل قبل أي أشعة سينية (X-Ray).',
      whenToSeeDoctor: 'عرض تقرير طبيب الأشعة المكتوب والصورة على الطبيب المعالج للربط ويا الفحص السريري.',
      emergencySigns: ['تورم ساق مفاجئ مؤلم مع ضيق تنفس', 'كسر مفتوح أو ألم بطن لا يُحتمل'],
      whatCannotBeInferred:
        'حنين ما تقرأ صور الأشعة أو السونار وتقول فيها كسر أو ورم أو جلطة بدون تقرير طبيب الأشعة المعتمد.',
      sourceId: 'reg_radiologyinfo',
      sourceName: 'RadiologyInfo.org — X-Ray, Ultrasound & Doppler',
      sourceUrl: 'https://www.radiologyinfo.org/',
      publisher: 'RSNA & American College of Radiology',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة عربية تثقيفية مبسطة معتمدة على إرشادات RadiologyInfo.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['x-ray', 'اشعة', 'أشعة سينية', 'سونار', 'ultrasound', 'دوبلر', 'doppler', 'صورة اشعة'],
    },
    {
      topicId: 'topic_img_ct_contrast',
      titleAr: 'المفراس (CT Scan) والصبغة الوريدية وسلامة الكلى والحمل',
      mainSpecialty: 'الأشعة والتصوير الطبي',
      subSpecialty: 'المفراس والصبغة',
      domain: 'imaging',
      topicType: 'أشعة',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'المفراس (CT Scan) جهاز أشعة سريع ودقيق يرسم مقاطع متعددة لداخل الجسم (مثل الدماغ والصدر والبطن)، وأحياناً يستخدم صبغة وريدية أو فموية لتوضيح الأوعية والأعضاء أكثر.',
      whatItMeans:
        'لأن الصبغة الوريدية تتصفى عن طريق الكلى، المركز غالباً يطلب تحليل كرياتينين (وظائف الكلى) قبل الفحص، ويسأل إذا اكو حساسية سابقة للصبغة أو استخدام لأدوية سكري مثل الميتفورمين.',
      patientNeedToKnow:
        'بكل هدوء: لازم إبلاغ مركز الأشعة إذا اكو حمل أو رضاعة، أو ربو/حساسية صبغة، أو مشاكل بالكلى.',
      relatedSymptoms: ['حسب سبب طلب الطبيب (صداع، بطن، صدر، حوادث)'],
      relatedTests: ['CT Scan', 'Serum Creatinine', 'eGFR'],
      preparation: 'أحياناً صيام 4–6 ساعات عند استخدام الصبغة، وفحص الكرياتينين حسب تعليمات المركز.',
      whenToSeeDoctor: 'مناقشة تقرير المفراس المكتوب مع الطبيب المختص.',
      emergencySigns: ['تورم اللسان أو الحلق أو ضيق تنفس بعد الصبغة (حساسية شديدة تتطلب طوارئ فوراً)'],
      whatCannotBeInferred:
        'لا يمكن تشخيص نزيف أو جلطة أو ورم من صورة مفراس بدون قراءة طبيب الأشعة والطبيب السريري.',
      sourceId: 'reg_radiologyinfo',
      sourceName: 'RadiologyInfo.org — CT Scan & Contrast Materials',
      sourceUrl: 'https://www.radiologyinfo.org/',
      publisher: 'RSNA & American College of Radiology',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة عربية تثقيفية مبسطة.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['مفراس', 'ct', 'ct scan', 'صبغة', 'contrast', 'تصوير مقطعي', 'كرياتينين قبل المفراس'],
    },
    {
      topicId: 'topic_img_mri_safety',
      titleAr: 'الرنين المغناطيسي (MRI)، شروط المعادن، وتقارير الانزلاق الغضروفي',
      mainSpecialty: 'الأشعة والتصوير الطبي',
      subSpecialty: 'الرنين المغناطيسي',
      domain: 'imaging',
      topicType: 'أشعة',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'الرنين المغناطيسي (MRI) يصور الأنسجة الرخوة مثل الدماغ والغضاريف والأربطة والأعصاب بدقة عالية وبدون أشعة سينية، لأنه يشتغل بمجال مغناطيسي قوي.',
      whatItMeans:
        'إذا مكتوب بتقرير الرنين مثلاً «انزلاق غضروفي بسيط» (Disc Bulge / Mild Herniation)، معناها الغضروف اللي بين الفقرات شوية طالع عن مكانه وممكن يلامس أو يضغط على عصب قريب—وكثير حالات تكون بسيطة وتتحسن بالمتابعة والعلاج اللي يحدده الطبيب، والشدة تعتمد على الأعراض مو بس الكلمة بالتقرير.',
      patientNeedToKnow:
        'ضروري جداً قبل دخول غرفة الرنين إبلاغ الطاقم إذا اكو منظم نبض قلب (Pacemaker)، شظايا معدنية، زراعات أذن أو مفاصل، أو خوف من الأماكن المغلقة.',
      relatedSymptoms: ['ألم ظهر أو رقبة', 'خدر أو نغزات نازلة بالرجل أو الذراع', 'صداع'],
      relatedTests: ['MRI', 'X-Ray'],
      preparation: 'نزع كل المعادن والساعات والموبايل والمجوهرات، وملء استمارة السلامة المغناطيسية.',
      whenToSeeDoctor: 'عرض تقرير الرنين المكتوب على طبيب الأعصاب أو العظام حتى يربط الصورة بالأعراض والفحص السريري.',
      emergencySigns: [
        'ضعف مفاجئ بالرجل أو صعوبة بالمشي أو سقوط القدم',
        'فقدان السيطرة على الإدرار أو الخروج أو خدر بمنطقة الحوض (طوارئ فورية!)',
      ],
      whatCannotBeInferred:
        'حنين لا تشخص صور الرنين بنفسها، وما تعني كلمة «انزلاق غضروفي بسيط» لوحدها الحاجة لعملية جراحية أبداً.',
      sourceId: 'reg_radiologyinfo',
      sourceName: 'RadiologyInfo.org — Magnetic Resonance Imaging (MRI)',
      sourceUrl: 'https://www.radiologyinfo.org/',
      publisher: 'RSNA & American College of Radiology',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة عربية تثقيفية مبسطة.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['رنين', 'mri', 'انزلاق غضروفي', 'غضروف', 'فقرات', 'ديسك', 'disc bulge', 'معادن', 'منظم قلب'],
    },
    {
      topicId: 'topic_img_mammo_dexa_nuclear',
      titleAr: 'الماموغرام (تصوير الثدي) وفحص هشاشة العظام (DEXA) والطب النووي',
      mainSpecialty: 'الأشعة والتصوير الطبي',
      subSpecialty: 'تصوير متخصص',
      domain: 'imaging',
      topicType: 'أشعة',
      ageGroup: 'البالغين',
      audience: 'المريض',
      simpleExplanation:
        'الماموغرام فحص خاص بأنسجة الثدي؛ وفحص DEXA يقيس كثافة العظام ويعرف إذا اكو هشاشة؛ وفحوصات الطب النووي وPET-CT تستخدم كميات دقيقة من مواد مشعة خاصة لتقييم نشاط بعض الأنسجة أو الغدد.',
      whatItMeans:
        'ظهور عبارة مثل "متابعة خلال 6 أشهر" أو وجود تكلسات بسيطة بالماموغرام أو نقص بكثافة العظام ما يعني بالضرورة وجود مشكلة خطيرة—الطبيب يفسر التصنيف والدرجة ويا الفحص السريري.',
      patientNeedToKnow:
        'إبلاغ المركز إذا اكو حمل أو رضاعة قبل أي تصوير، وتجنّب وضع مزيل العرق أو البودرة يوم فحص الماموغرام.',
      relatedSymptoms: ['فحص دوري وقائي', 'تقييم كتلة بالثدي', 'ألم عظام أو كسور متكررة'],
      relatedTests: ['Mammogram', 'Breast Ultrasound', 'DEXA Scan', 'PET-CT'],
      preparation: 'في الماموغرام عدم وضع كريمات أو مزيل عرق؛ في DEXA عدم أخذ حبوب كالسيوم قبل 24 ساعة حسب التعليمات.',
      whenToSeeDoctor: 'عرض التقرير النهائي وتصنيفه على الطبيب المختص.',
      emergencySigns: ['التهاب حاد وسريع مع حمى شديدة أو ضيق تنفس'],
      whatCannotBeInferred:
        'لا يمكن تأكيد سلامة أو خطورة كتلة أو بقعة من وصف عام بدون تقييم طبيب الأشعة والطبيب المختص.',
      sourceId: 'reg_radiologyinfo',
      sourceName: 'RadiologyInfo.org — Mammography, DEXA & Nuclear Medicine',
      sourceUrl: 'https://www.radiologyinfo.org/',
      publisher: 'RSNA & American College of Radiology',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة عربية تثقيفية مبسطة.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['ماموغرام', 'mammogram', 'هشاشة العظام', 'dexa', 'pet-ct', 'طب نووي', 'مسح ذري'],
    },

    // C. التثقيف العام، الطوارئ، وتوجيه التخصصات الأساسية (03, 05, 06)
    {
      topicId: 'topic_gen_healthy_diet',
      titleAr: 'مبادئ الغذاء الصحي المتوازن (WHO)',
      mainSpecialty: 'التغذية العلاجية والطب الوقائي وطب الشيخوخة',
      subSpecialty: 'الوقاية والتغذية العامة',
      domain: 'clinical',
      topicType: 'تثقيف عام',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'الأكل الصحي حسب منظمة الصحة العالمية يعتمد على 4 أسس بسيطة: الكفاية، التوازن، الاعتدال، والتنوع—بدون حرمان قاسي.',
      whatItMeans:
        'المقصود تنويع الأكل بين الخضار والفواكه والحبوب الكاملة والبقوليات والبروتينات المتنوعة، وتقليل الملح الزائد والسكريات المضافة والدهون المشبعة والمقليات.',
      patientNeedToKnow:
        'هاي إرشادات عامة للوقاية؛ بس إذا اكو سكري، ضغط، مشاكل بالكلى أو الكبد، أو حمل، الأفضل اتباع خطة غذائية خاصة من الطبيب المعالج.',
      relatedSymptoms: ['وقاية عامة'],
      relatedTests: ['Lipid Profile', 'HbA1c', 'Blood Pressure'],
      preparation: 'لا يتطلب تحضير مسبق.',
      whenToSeeDoctor: 'مراجعة الطبيب أو أخصائي التغذية إذا اكو مرض مزمن أو وزن متغير بسرعة.',
      emergencySigns: ['فقدان وزن شديد مفاجئ مع قيء مستمر أو صعوبة بلع'],
      whatCannotBeInferred: 'النصائح الغذائية العامة لا تُعد نظاماً علاجياً فردياً لمرض معين.',
      sourceId: 'reg_who_factsheets',
      sourceName: 'World Health Organization (WHO) — Healthy Diet',
      sourceUrl: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
      publisher: 'World Health Organization (WHO)',
      publishedOrUpdatedAt: '2026-01-26',
      accessedAt: today,
      licenseOrRights: 'محتوى صحة عامة موثق مع الإشارة لمنظمة الصحة العالمية.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['غذاء صحي', 'اكل صحي', 'تغذية', 'منظمة الصحة العالمية', 'who', 'healthy diet', 'ملح', 'سكريات'],
    },
    {
      topicId: 'topic_gen_urgent_red_flags',
      titleAr: 'علامات الطوارئ الخطيرة التي تتطلب رعاية طبية فورية',
      mainSpecialty: 'طب الطوارئ والعناية المركزة (ICU)',
      subSpecialty: 'علامات التحذير الحرجة',
      domain: 'clinical',
      topicType: 'طوارئ',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'أكو أعراض خطر ما يصير ننتظر عليها أو نكتفي بدردشة بالإنترنت، لازم فوراً التوجه لأقرب طوارئ أو طلب الإسعاف.',
      whatItMeans:
        'من أهمها: ألم أو ضغط شديد بالصدر، ضيق تنفس مفاجئ، علامات جلطة/سكتة دماغية (تدلّي الوجه أو ثقل اللسان أو ضعف مفاجئ بجانب واحد)، فقدان الوعي، نزيف ما يوكف، تشنجات، تورم اللسان والحلق من حساسية شديدة، علامات تسمم أو إنتان، أو أفكار إيذاء النفس أو الآخرين.',
      patientNeedToKnow:
        'وقت الطوارئ ممنوع انتظار نتيجة تحليل، والأفضل عدم قيادة السيارة بدون مرافق إذا الأعراض قوية.',
      relatedSymptoms: ['ألم صدر شديد', 'ضيق تنفس حاد', 'ثقل لسان وتدلي وجه', 'إغماء', 'تورم حلق', 'نزيف شديد'],
      relatedTests: ['تقييم إسعافي فوري بالمستشفى'],
      preparation: 'التوجه الفوري للطوارئ.',
      whenToSeeDoctor: 'فوراً في قسم الطوارئ دون تأخير.',
      emergencySigns: ['جميع العلامات المذكورة أعلاه'],
      whatCannotBeInferred: 'الذكاء الاصطناعي لا يعالج حالات الطوارئ ولا يغني عن المستشفى.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus Medical Emergencies & WHO Sepsis',
      sourceUrl: 'https://medlineplus.gov/ency/article/001927.htm',
      publisher: 'MedlinePlus & WHO',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'إرشادات سلامة عامة للمريض.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['طوارئ', 'ألم صدر', 'ضيق تنفس', 'سكتة', 'تشنج', 'تورم اللسان', 'تحسس شديد', 'ايذاء النفس', 'إنتان'],
    },
    {
      topicId: 'topic_clin_cardio_intro',
      titleAr: 'أمراض القلب وضغط الدم — دليل المريض المبسّط (متى تجب مراجعة الطبيب؟)',
      mainSpecialty: 'أمراض القلب والأوعية الدموية',
      subSpecialty: 'القلب والضغط',
      domain: 'clinical',
      topicType: 'تخصص',
      ageGroup: 'البالغين',
      audience: 'المريض',
      simpleExplanation:
        'تخصص القلب يتابع عمل عضلة القلب، الصمامات، الشرايين، وانتظام الضغط ودقات القلب.',
      whatItMeans:
        'كثير مراجعات تكون بسبب ارتفاع ضغط الدم، خفقان، أو تعب ونهجان مع الجهد، ويتم تقييمها بفحوصات بسيطة مثل قياس الضغط وتخطيط القلب والإيكو وتحاليل الدهون.',
      patientNeedToKnow:
        'ارتفاع الضغط بالعادة صامت بدون وجع رأس، والانتظام بعلاجه ومتابعته يحمي القلب والكلى والدماغ.',
      relatedSymptoms: ['خفقان', 'نهجان مع الجهد', 'تورم قدمين', 'ألم صدر'],
      relatedTests: ['ECG', 'Echocardiogram', 'Lipid Profile', 'HbA1c', 'Creatinine'],
      preparation: 'الراحة 5 دقائق قبل قياس الضغط وتجنب القهوة والتدخين قبل الفحص.',
      whenToSeeDoctor: 'عند تكرر قراءات ضغط عالية، أو خفقان متكرر، أو ألم صدر يجي مع المجهود.',
      emergencySigns: ['ألم صدر ضاغط ينتشر للذراع أو الفك، ضيق نفس مفاجئ، عرق بارد، أو إغماء'],
      whatCannotBeInferred: 'ما نحدد سبب ألم الصدر أو الخفقان بدون تخطيط وفحص طبيب.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Heart & Blood Vessel Disorders',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'دليل تثقيفي مقتضب للتخصص — التفاصيل المرضية الفرعية قيد التوسيع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['قلب', 'ضغط الدم', 'خفقان', 'تخطيط القلب', 'ايكو', 'شرايين'],
    },
    {
      topicId: 'topic_clin_gi_draft_sample',
      titleAr: 'أمراض الجهاز الهضمي والقولون والمعدة (مسودة قيد التوسيع)',
      mainSpecialty: 'أمراض الجهاز الهضمي والكبد (والمرارة)',
      subSpecialty: 'المعدة والقولون',
      domain: 'clinical',
      topicType: 'تخصص',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'يهتم هذا التخصص بمشاكل المريء والمعدة والقولون والكبد والمرارة مثل الحرقة وألم البطن والانتفاخ.',
      whatItMeans:
        'تمهيد تعريفي بالتخصص لحين استكمال مراجعة كل موضوع مرضي (مثل جرثومة المعدة، الارتجاع، القولون العصبي) واعتماده من طبيب مختص.',
      patientNeedToKnow: 'عدم استعمال مسكنات المعدة أو المضادات بشكل عشوائي قبل مراجعة الطبيب.',
      relatedSymptoms: ['حرقة', 'ألم بطن', 'انتفاخ', 'تغير بالإخراج'],
      relatedTests: ['Abdominal Ultrasound', 'Stool Examination', 'Liver Enzymes'],
      preparation: 'يحددها الطبيب حسب نوع الفحص أو الناظور.',
      whenToSeeDoctor: 'عند استمرار ألم البطن أو الحرقة أو نقصان الوزن غير المبرر.',
      emergencySigns: ['تقيؤ دم، براز أسود قاتم، ألم بطن لا يُحتمل، أو اصفرار سريع'],
      whatCannotBeInferred: 'مسودة تمهيدية غير معتمدة للاسترجاع التشخيصي التفصيلي بعد.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Digestive Disorders',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'مسودة قيد المراجعة وفق خارطة النقص (12).',
      reviewerName: '',
      reviewedAt: '',
      status: 'under_review',
      version: '0.9.1',
      updatedAt: today,
      keywords: ['معدة', 'قولون', 'جرثومة المعدة', 'ارتجاع', 'جهاز هضمي'],
    },

    // A2. استكمال الدفعة A — مؤشرات الالتهاب والتخثر وفحص الخروج
    {
      topicId: 'topic_lab_crp_esr_coag',
      titleAr: 'مؤشرات الالتهاب (CRP / ESR) وفحوصات تخثر الدم (PT / INR)',
      mainSpecialty: 'المختبرات والتحاليل الطبية',
      subSpecialty: 'الالتهابات والتخثر',
      domain: 'labs',
      topicType: 'تحليل',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'تحاليل CRP وESR تعطي إشارة عامة إذا اكو التهاب بالجسم، أما PT وINR وPTT فتقيس سرعة تجلط أو سيولة الدم.',
      whatItMeans:
        'ارتفاع CRP أو سرعة الترسيب (ESR) يشبه "جرس إنذار عام" لكن ما يكشف وين الالتهاب ولا يفرّق لحاله بين بكتيريا أو روماتيزم أو سبب ثاني. أما PT/INR فيراقبه الطبيب بدقة لمتابعة مميعات الدم أو قبل التداخلات.',
      patientNeedToKnow:
        'ما يصير أخذ مضاد حيوي لمجرد ارتفاع CRP، ولا تعديل جرعة الوارفارين أو مميعات الدم بناءً على رقم INR بدون تواصل مباشر ويا الطبيب.',
      relatedSymptoms: ['حرارة', 'ألم مفاصل', 'نزيف لثة أو كدمات غير معتادة'],
      relatedTests: ['CRP', 'ESR', 'CBC', 'PT / INR', 'aPTT'],
      preparation: 'إبلاغ المختبر بكل أدوية السيولة والمميعات قبل سحب الدم.',
      whenToSeeDoctor: 'عرض الأرقام والمديات المطبوعة والأعراض على الطبيب المعالج.',
      emergencySigns: ['نزيف لا يتوقف، براز أسود، تقيؤ دم، أو كدمات مفاجئة واسعة مع أخذ المميعات'],
      whatCannotBeInferred:
        'لا يمكن تحديد نوع الالتهاب أو تعديل جرعة مميعات الدم من قراءة المختبر وحدها.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: CRP, ESR & Coagulation Tests',
      sourceUrl: 'https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['crp', 'esr', 'pt', 'inr', 'ptt', 'التهاب', 'سرعة الترسيب', 'سيولة الدم', 'تخثر'],
    },

    // D. الدفعة D — صحة الفئات الخاصة (أطفال، حوامل، كبار السن — لا تعمم نصائح البالغين عليهم)
    {
      topicId: 'topic_pop_pediatric_labs_fever',
      titleAr: 'خصوصية تحاليل الأطفال وحديثي الولادة ومتابعة الحرارة',
      mainSpecialty: 'طب الأطفال وحديثي الولادة',
      subSpecialty: 'سلامة الطفل',
      domain: 'clinical',
      topicType: 'فئات خاصة',
      ageGroup: 'الأطفال وحديثي الولادة',
      audience: 'الأهل والمرافقين',
      simpleExplanation:
        'تحاليل الأطفال (مثل الهيموغلوبين، كريات الدم البيضاء، إنزيمات العظام، والصفار لحديثي الولادة) إلها مديات مرجعية تختلف تماماً عن البالغين وتعتمد على عمر الطفل بالأيام أو الأشهر أو السنوات.',
      whatItMeans:
        'ما يصير أبداً نقارن تحليل طفل بمدى مرجعي مال بالغين! نفس الشي ويا الأعراض: الرضع والأطفال يتغير وضعهم بسرعة أكبر ويحتاجون تقييم طبيب الأطفال خصوصاً مع الحرارة أو قلة الرضاعة.',
      patientNeedToKnow:
        'إعطاء أي خافض حرارة أو شراب للطفل لازم يكون حسب وزنه وبوصفة الطبيب أو إرشاد الصيدلي، وتجنّب إعطاء الأسبرين للأطفال تماماً.',
      relatedSymptoms: ['ارتفاع حرارة', 'قلة رضاعة أو شرب سوائل', 'خمول غير معتاد', 'طفح جلدي'],
      relatedTests: ['Pediatric CBC', 'Total/Direct Bilirubin', 'Urinalysis', 'CRP'],
      preparation: 'التأكد من أن المختبر طابع المدى المرجعي الخاص بعمر الطفل.',
      whenToSeeDoctor: 'مراجعة طبيب الأطفال عند استمرار الحرارة أو تغيّر نشاط الطفل.',
      emergencySigns: [
        'حرارة عند رضيع عمره أقل من 3 أشهر (طوارئ فورية!)',
        'صعوبة تنفس أو سحب بين الأضلاع أو زرقة الشفاه',
        'تشنجات، خمول شديد وصعوبة بالإيقاظ، أو جفاف شديد (قلة بلل الحفاض)',
      ],
      whatCannotBeInferred:
        'لا تُعمم معدلات البالغين أو جرعاتهم على الأطفال وحديثي الولادة أبداً.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Children’s Health Issues',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'صياغة عربية تثقيفية وفق إرشادات طب الأطفال المعتمدة.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['اطفال', 'أطفال', 'طفل', 'رضيع', 'حديث الولادة', 'حرارة الطفل', 'تحاليل الاطفال'],
    },
    {
      topicId: 'topic_pop_pregnancy_labs',
      titleAr: 'التغيّرات الطبيعية وخصوصية التحاليل والأشعة أثناء الحمل',
      mainSpecialty: 'طب النساء والتوليد',
      subSpecialty: 'رعاية الحامل',
      domain: 'clinical',
      topicType: 'فئات خاصة',
      ageGroup: 'الحوامل',
      audience: 'المريضة الحامل',
      simpleExplanation:
        'أثناء الحمل يتغير حجم الدم والهرمونات، لذلك تختلف القيم المتوقعة لعدّة تحاليل مثل الهيموغلوبين، الغدة الدرقية (TSH)، وتحليل السكر الحملي عن المرأة غير الحامل.',
      whatItMeans:
        'بسبب توسع سوائل الدم بالحمل، ممكن ينزل الهيموغلوبين بشكل طبيعي نسبياً أو يكشف التحليل حاجة لمتابعة الحديد حسب قرار طبيبة النسائية. كذلك الغدة الدرقية إلها أهداف دقيقة تختلف بكل ثلث من الحمل.',
      patientNeedToKnow:
        'ضروري جداً إبلاغ أي مختبر أو مركز أشعة أو صيدلي بوجود حمل (أو احتمال حمل) قبل إجراء الأشعة السينية (X-Ray) أو المفراس (CT) أو أخذ أي دواء أو مكمل.',
      relatedSymptoms: ['متابعة الحمل الدورية', 'دوخة أو تعب', 'تورم مفاجئ بالوجه واليدين', 'صداع شديد'],
      relatedTests: ['CBC', 'TSH', 'OGTT (فحص السكر الحملي)', 'Urinalysis', 'Obstetric Ultrasound'],
      preparation: 'لفحص تحمّل السكر (OGTT) اتباع تعليمات الصيام والساعات المحددة من الطبيبة بدقة.',
      whenToSeeDoctor: 'متابعة كل التحاليل مع طبيبة النسائية والتوليد في المواعيد المحددة.',
      emergencySigns: [
        'نزيف مهبلي أو خروج سوائل غير معتادة',
        'صداع شديد مستمر مع زغللة بالعين أو تورم مفاجئ بالوجه واليدين أو ألم أعلى البطن',
        'انخفاض أو توقف حركة الجنين المعتادة',
      ],
      whatCannotBeInferred:
        'لا تُفسَّر تحاليل الحامل بمديات البالغين غير الحوامل ولا يُؤخذ أي دواء أو فيتامين بدون موافقة طبيبة النسائية.',
      sourceId: 'reg_who_ar',
      sourceName: 'WHO Arabic & MedlinePlus — Prenatal Care & Laboratory Testing',
      sourceUrl: 'https://www.who.int/ar',
      publisher: 'WHO & MedlinePlus',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'إرشاد تثقيفي آمن للحمل مع الإحالة لطبيبة النسائية.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['حمل', 'حامل', 'تحاليل الحامل', 'سكر الحمل', 'ogtt', 'اشعة للحامل', 'نسائية'],
    },
    {
      topicId: 'topic_pop_elderly_safety',
      titleAr: 'خصوصية الفحوصات وتعدد الأدوية لدى كبار السن',
      mainSpecialty: 'التغذية العلاجية والطب الوقائي وطب الشيخوخة',
      subSpecialty: 'رعاية كبار السن',
      domain: 'clinical',
      topicType: 'فئات خاصة',
      ageGroup: 'كبار السن',
      audience: 'المريض وذويه',
      simpleExplanation:
        'مع التقدم بالعمر تتغيّر وظائف الكلى وترتيب السوائل بالجسم وحساسية الجسم للأدوية، لذلك يراقب الطبيب التحاليل وقائمة الأدوية الكاملة بصورة مترابطة.',
      whatItMeans:
        'الأعراض عند كبار السن أحياناً تكون غير تقليدية (مثلاً التهاب البول أحياناً يظهر على شكل تشتت ذهن أو تعب مفاجئ قبل ما يظهر حرقة). وتداخل أدوية الضغط والسكري والمسكنات يحتاج مراجعة دورية.',
      patientNeedToKnow:
        'احتفاظ العائلة بقائمة مكتوبة محدثة بكل أدوية ومكملات كبير السن وعرضها بكل مراجعة طبية وصيدلانية يمنع التداخلات الخطيرة.',
      relatedSymptoms: ['تشتت ذهن مفاجئ', 'دوخة عند الوقوف', 'سقوط متكرر', 'قلة الشهية'],
      relatedTests: ['Creatinine & eGFR', 'Electrolytes (Na/K)', 'CBC', 'HbA1c', 'Urinalysis'],
      preparation: 'إحضار كل علب الأدوية أو قائمة موثقة عند زيارة الطبيب.',
      whenToSeeDoctor: 'مراجعة الطبيب عند أي تغيّر مفاجئ بالوعي أو النشاط أو التوازن.',
      emergencySigns: ['تشتت وعي مفاجئ، ضعف بنصف الجسم، إغماء، ضيق تنفس، أو ألم صدر'],
      whatCannotBeInferred:
        'لا تُضاف مسكنات أو مقويات أو تُوقف أدوية مزمنة لكبار السن دون مراجعة الطبيب المعالج.',
      sourceId: 'reg_msd_ar',
      sourceName: 'MSD Manual Consumer Arabic — Older People’s Health Issues',
      sourceUrl: 'https://www.msdmanuals.com/ar/home',
      publisher: 'MSD Manuals',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي مبسط مع حفظ المرجع.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['كبار السن', 'الشيخوخة', 'تعدد الادوية', 'مسنين', 'تداخل ادوية'],
    },

    // E. الدفعة E — تثقيف قراءة النشرة الدوائية والسلامة الصيدلانية (بدون وصف أدوية!)
    {
      topicId: 'topic_med_leaflet_literacy',
      titleAr: 'كيف تقرأ نشرة الدواء والعلبة بأمان؟ (بدون وصف دواء)',
      mainSpecialty: 'طب الأسرة والطب العام',
      subSpecialty: 'الثقافة الدوائية الآمنة',
      domain: 'clinical',
      topicType: 'تثقيف عام',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'نشرة الدواء والعلبة تحتوي معلومات أساسية لحماية المريض: المادة الفعالة (الاسم العلمي)، التركيز، تاريخ الانتهاء، طريقة الحفظ، والتحذيرات.',
      whatItMeans:
        'كثير أدوية إلها أسماء تجارية مختلفة لكن تحمل نفس المادة الفعالة (مثلاً البراسيتامول موجود بأسماء متعددة)، فالانتباه للمادة الفعالة يمنع أخذ جرعة مضاعفة بالخطأ!',
      patientNeedToKnow:
        'حنين لا تصف أدوية ولا تغيّر جرعات. دائماً نتحقق من تاريخ الانتهاء، وظروف التخزين (بالغرفة لو بالثلاجة)، ونسأل الصيدلي أو الطبيب عن الأكل والحمل والأدوية الثانية.',
      relatedSymptoms: ['استخدام دواء جديد', 'التحقق من تعارض أدوية أو حساسية دوائية'],
      relatedTests: ['مراجعة الصيدلي السريري أو الطبيب المعالج'],
      preparation: 'الاحتفاظ بنشرة الدواء الأصلية وإبلاغ الصيدلي بأي حساسية أو حمل أو أمراض مزمنة.',
      whenToSeeDoctor: 'عند ظهور طفح جلدي أو غثيان شديد أو أي أثر جانبي مقلق بعد أخذ الدواء.',
      emergencySigns: ['تورم الوجه أو الشفتين أو اللسان، صعوبة التنفس، أو طفح جلدي حاد منتشر (طوارئ فوراً!)'],
      whatCannotBeInferred:
        'لا تقم حنين باقتراح دواء أو بديل دوائي أو تحديد جرعة؛ هذا دور الطبيب والصيدلي حصراً.',
      sourceId: 'reg_medlineplus_ar',
      sourceName: 'MedlinePlus: Understanding Medication Labels & Drug Safety',
      sourceUrl: 'https://medlineplus.gov/medicines.html',
      publisher: 'U.S. National Library of Medicine (MedlinePlus)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'تثقيف سلامة دوائية للمريض دون أي وصف علاج.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['نشرة الدواء', 'علبة الدواء', 'المادة الفعالة', 'الاسم العلمي', 'تاريخ الانتهاء', 'حساسية دواء', 'موانع الاستعمال'],
    },
    {
      topicId: 'topic_med_antibiotic_stewardship',
      titleAr: 'الاستخدام الآمن للمضادات الحيوية ولماذا نمنع استخدامها العشوائي',
      mainSpecialty: 'الأمراض المعدية والسموم',
      subSpecialty: 'مقاومة المضادات الحيوية',
      domain: 'clinical',
      topicType: 'تثقيف عام',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'المضاد الحيوي يعالج الالتهابات البكتيرية فقط، وما يعالج الفيروسات مثل الرشح والإنفلونزا العادية.',
      whatItMeans:
        'أخذ مضاد حيوي بدون وصفة طبيب أو حفظ الباقي لاستخدامه مرة ثانية يخلي البكتيريا تقاوم الدواء (مقاومة المضادات)، فيصير علاجها أصعب بالمستقبل ويؤذي المعدة والكلى أو يسبب حساسية.',
      patientNeedToKnow:
        'عندما يصف الطبيب مضاداً حيوياً، يجب إكمال المدة اللي حددها حتى لو تحسنت الأعراض مبكراً، وعدم مشاركته مع شخص آخر.',
      relatedSymptoms: ['رشح وزكام', 'التهاب حلق', 'حمى'],
      relatedTests: ['Clinical Exam', 'Culture when ordered by physician'],
      preparation: 'سؤال الطبيب أو الصيدلي إذا الدواء يتعارض ويا الأكل أو المكملات.',
      whenToSeeDoctor: 'إذا استمرت الحرارة أو ساءت الأعراض أو ظهر طفح جلدي مع الدواء.',
      emergencySigns: ['تورم الحلق واللسان، ضيق نفس، أو إسهال حاد مستمر مصحوب بحرارة'],
      whatCannotBeInferred:
        'لا تصف حنين أي مضاد حيوي ولا تنصح بأخذه لحرارة أو التهاب حلق قبل فحص الطبيب.',
      sourceId: 'reg_who_emro_ar',
      sourceName: 'WHO EMRO Arabic — Antimicrobial Resistance & Safe Antibiotic Use',
      sourceUrl: 'https://www.emro.who.int/ar/index.html',
      publisher: 'WHO Regional Office for the Eastern Mediterranean (EMRO)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'ملخص تثقيفي موثق حسب إرشادات منظمة الصحة العالمية.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['مضاد حيوي', 'انتيبيوتك', 'مقاومة المضادات', 'التهاب حلق', 'رشح', 'antibiotic'],
    },

    // F. الدفعة F — التثقيف الوقائي الملائم للسياق الإقليمي (الحر والجفاف وسلامة المياه والغذاء)
    {
      topicId: 'topic_iq_heat_hydration_safety',
      titleAr: 'الوقاية من الإجهاد الحراري والجفاف وسلامة الأغذية في الأجواء الحارة',
      mainSpecialty: 'التغذية العلاجية والطب الوقائي وطب الشيخوخة',
      subSpecialty: 'الوقاية البيئية والموسمية',
      domain: 'clinical',
      topicType: 'تثقيف عام',
      ageGroup: 'جميع الأعمار',
      audience: 'المريض',
      simpleExplanation:
        'في موجات الحر الشديدة، يفقد الجسم السوائل والأملاح بسرعة، ولذلك مهم حماية الأطفال وكبار السن والعاملين بالخارج من الإجهاد الحراري وتسمم الغذاء.',
      whatItMeans:
        'شرب الماء بانتظام قبل العطش، الابتعاد عن الشمس وقت الذروة، وحفظ الأطعمة والأدوية بدرجات الحرارة المناسبة يقي من الدوخة وهبوط الضغط والجفاف والتلبك المعوي.',
      patientNeedToKnow:
        'بعض الأدوية (مثل أدوية الضغط والقلب أو بعض الأنسولين) تتأثر بالحرارة العالية إذا انتركت بالسيارة أو بالشمس—الأفضل حفظها بمكان بارد وجاف حسب نشرتها.',
      relatedSymptoms: ['عطش شديد', 'دوخة', 'تعب مع التعرق الزائد', 'بول داكن قليل'],
      relatedTests: ['Clinical Assessment', 'Electrolytes if clinically indicated'],
      preparation: 'التوعية بشرب الماء النظيف وتجنب ترك الأطفال أو الأدوية داخل السيارات المغلقة.',
      whenToSeeDoctor: 'عند ظهور أعراض جفاف أو قيء متكرر يمنع شرب السوائل.',
      emergencySigns: [
        'ضربة شمس: حرارة جسم عالية جداً، توقف التعرق أو تعرق غزير مع تشتت ذهن أو إغماء (طوارئ فوراً!)',
      ],
      whatCannotBeInferred: 'حنين لا تحدد بروتوكول طوارئ محلي غير موثق وتوجه عند علامات الخطر لأقرب مركز طوارئ.',
      sourceId: 'reg_who_emro_ar',
      sourceName: 'WHO EMRO Arabic — Heatwaves, Hydration & Food Safety',
      sourceUrl: 'https://www.emro.who.int/ar/index.html',
      publisher: 'WHO Regional Office for the Eastern Mediterranean (EMRO)',
      publishedOrUpdatedAt: today,
      accessedAt: today,
      licenseOrRights: 'إرشادات وقاية عامة متوافقة مع منظمة الصحة العالمية لإقليم شرق المتوسط.',
      reviewerName: baseReviewer,
      reviewedAt: today,
      status: 'approved',
      version: '1.1.0',
      updatedAt: today,
      keywords: ['جفاف', 'ضربة شمس', 'حرارة الجو', 'شرب الماء', 'حفظ الادوية', 'موجة حر'],
    },
  ];
}

export function computeLibraryRoadmapSummary(
  specialties: HaneenSpecialtyNode[],
  topics: HaneenKnowledgeTopic[],
): HaneenLibraryRoadmapSummary {
  return {
    totalSpecialties: specialties.length,
    populatedSpecialties: specialties.filter((s) => s.completeness === 'populated').length,
    introOnlySpecialties: specialties.filter((s) => s.completeness === 'intro_only').length,
    missingSpecialties: specialties.filter((s) => s.completeness === 'missing').length,
    approvedTopics: topics.filter((t) => t.status === 'approved').length,
    underReviewTopics: topics.filter((t) => t.status === 'under_review').length,
    draftTopics: topics.filter((t) => t.status === 'draft').length,
    retiredTopics: topics.filter((t) => t.status === 'retired').length,
  };
}

// ============================================================================
// Safe Lab Results Comparison Over Time (File 07: Health Record & Comparison)
// ============================================================================

function normalizeLabUnit(rawUnit: string): string {
  const clean = rawUnit.trim().toLowerCase().replace(/\s+/g, '');
  if (!clean || clean === '—' || clean === '-') return '';
  if (clean === 'gm/dl' || clean === 'g/dl') return 'g/dL';
  if (clean === 'mg/dl') return 'mg/dL';
  if (clean === 'mmol/l') return 'mmol/L';
  if (clean === 'u/l' || clean === 'iu/l') return 'U/L';
  if (clean === 'miu/l' || clean === 'uiu/ml' || clean === 'µiu/ml') return 'mIU/L';
  if (clean === 'ng/ml') return 'ng/mL';
  if (clean === 'pg/ml') return 'pg/mL';
  if (clean === '%' || clean === 'percent') return '%';
  return rawUnit.trim();
}

function normalizeLabTestCanonical(rawName: string): { key: string; displayName: string } {
  const trimmed = rawName.trim();
  const low = trimmed.toLowerCase();

  // Keep distinct tests separate (NEVER mix HbA1c with Glucose, or Fasting vs Random Glucose)
  if (/^(hemoglobin|hb|hgb|هيموغلوبين|هيموجلوبين)(\b|\s|\(|$)/i.test(low) && !/a1c/i.test(low)) {
    return { key: 'test_hemoglobin', displayName: 'Hemoglobin (Hb)' };
  }
  if (/(hba1c|a1c|السكر التراكمي)/i.test(low)) {
    return { key: 'test_hba1c', displayName: 'HbA1c (السكر التراكمي)' };
  }
  if (/(fasting.*glucose|glucose.*fasting|fbs|سكر.*صائم)/i.test(low)) {
    return { key: 'test_glucose_fasting', displayName: 'Fasting Glucose' };
  }
  if (/(creatinine|كرياتينين)/i.test(low)) {
    return { key: 'test_creatinine', displayName: 'Creatinine' };
  }
  if (/(ferritin|فيريتين)/i.test(low)) {
    return { key: 'test_ferritin', displayName: 'Serum Ferritin' };
  }
  if (/(^tsh\b|thyroid stimulating)/i.test(low)) {
    return { key: 'test_tsh', displayName: 'TSH' };
  }
  if (/(triglyceride|الدهون الثلاثية)/i.test(low)) {
    return { key: 'test_triglycerides', displayName: 'Triglycerides' };
  }
  if (/(ldl)/i.test(low)) {
    return { key: 'test_ldl', displayName: 'LDL Cholesterol' };
  }
  if (/(hdl)/i.test(low)) {
    return { key: 'test_hdl', displayName: 'HDL Cholesterol' };
  }
  return {
    key: `raw_${low.replace(/\s+/g, '_')}`,
    displayName: trimmed,
  };
}

function parseNumericStrict(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val !== 'string') return null;
  const cleaned = val.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export interface RawPatientLabResultDoc {
  resultId?: unknown;
  reportNumber?: unknown;
  labNameAr?: unknown;
  labNameEn?: unknown;
  approvedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  analytes?: Array<{
    testName?: unknown;
    name?: unknown;
    code?: unknown;
    value?: unknown;
    unit?: unknown;
    referenceRange?: unknown;
    flag?: unknown;
  }>;
}

export function comparePatientLabResultsSafe(docs: RawPatientLabResultDoc[]): HaneenLabComparisonResponse {
  const byTestKey = new Map<string, { displayName: string; points: HaneenLabComparisonPoint[] }>();

  for (const doc of docs) {
    const resultId = typeof doc.resultId === 'string' ? doc.resultId : '';
    const reportNumber = typeof doc.reportNumber === 'string' ? doc.reportNumber : '';
    const labName =
      (typeof doc.labNameAr === 'string' && doc.labNameAr.trim()) ||
      (typeof doc.labNameEn === 'string' && doc.labNameEn.trim()) ||
      'مختبر طبي';
    const rawDate =
      (typeof doc.approvedAt === 'string' && doc.approvedAt) ||
      (typeof doc.updatedAt === 'string' && doc.updatedAt) ||
      (typeof doc.createdAt === 'string' && doc.createdAt) ||
      '';
    const date = rawDate ? rawDate.slice(0, 10) : 'غير مؤرخ';

    const analytes = Array.isArray(doc.analytes) ? doc.analytes : [];
    for (const a of analytes) {
      const rawName = String(a.testName || a.name || a.code || '').trim();
      if (!rawName) continue;
      const rawValue = String(a.value ?? '').trim();
      if (!rawValue) continue;
      const rawUnit = typeof a.unit === 'string' ? a.unit.trim() : '';
      const normUnit = normalizeLabUnit(rawUnit);
      const refRange =
        typeof a.referenceRange === 'string' && a.referenceRange.trim()
          ? a.referenceRange.trim()
          : 'غير مذكور في التقرير';
      const flag = typeof a.flag === 'string' ? a.flag.trim().toLowerCase() : '';

      const { key, displayName } = normalizeLabTestCanonical(rawName);
      const bucket = byTestKey.get(key) || { displayName, points: [] };
      bucket.points.push({
        resultId,
        reportNumber,
        labName,
        date,
        rawValue,
        numericValue: parseNumericStrict(rawValue),
        unit: normUnit || rawUnit || 'بدون وحدة',
        referenceRange: refRange,
        flag,
      });
      byTestKey.set(key, bucket);
    }
  }

  const series: HaneenLabComparisonSeries[] = [];

  for (const [key, entry] of byTestKey.entries()) {
    const sorted = [...entry.points].sort((a, b) => a.date.localeCompare(b.date));
    const distinctUnits = Array.from(
      new Set(sorted.map((p) => p.unit.trim()).filter((u) => u && u !== 'بدون وحدة')),
    );
    const hasUnitConflict = distinctUnits.length > 1;
    const latest = sorted[sorted.length - 1];
    const primaryUnit = distinctUnits[0] || latest?.unit || 'بدون وحدة';

    if (hasUnitConflict) {
      series.push({
        seriesKey: key,
        testName: entry.displayName,
        unit: distinctUnits.join(' / '),
        comparable: false,
        incompatibilityReasonAr: `توجد قراءات بوحدات قياس مختلفة (${distinctUnits.join(' و ')})؛ لا تقم حنين بتحويل الوحدات أو دمجها تلقائياً حفاظاً على الدقة.`,
        trendDirection: 'unit_mismatch',
        deltaValue: null,
        latestPrintedReferenceRange: latest?.referenceRange || 'غير مذكور في التقرير',
        points: sorted,
        haneenSummaryAr: `هذا الفحص انعاد بأكثر من وحدة قياس (${distinctUnits.join(' مقابل ')})، لذلك ما نكدر نقارن الرقمين حسابياً كخط واحد. الأفضل عرض النتائج على الطبيب المعالج حتى يقرأ كل تقرير حسب وحدته.`,
      });
      continue;
    }

    if (sorted.length < 2) {
      series.push({
        seriesKey: key,
        testName: entry.displayName,
        unit: primaryUnit,
        comparable: false,
        incompatibilityReasonAr: 'توجد قراءة واحدة فقط لهذا الفحص.',
        trendDirection: 'insufficient_data',
        deltaValue: null,
        latestPrintedReferenceRange: latest?.referenceRange || 'غير مذكور في التقرير',
        points: sorted,
        haneenSummaryAr: `توجد نتيجة واحدة فقط بتاريخ ${latest?.date} (${latest?.rawValue} ${primaryUnit}) — نتيجة واحدة ما تكفي وحدها للمقارنة أو الحكم على تحسن أو تدهور.`,
      });
      continue;
    }

    const numericPoints = sorted.filter((p) => p.numericValue !== null);
    if (numericPoints.length < 2) {
      series.push({
        seriesKey: key,
        testName: entry.displayName,
        unit: primaryUnit,
        comparable: false,
        incompatibilityReasonAr: 'القيم المسجلة نصية وليست رقمية بالكامل للمقارنة العددية.',
        trendDirection: 'insufficient_data',
        deltaValue: null,
        latestPrintedReferenceRange: latest?.referenceRange || 'غير مذكور في التقرير',
        points: sorted,
        haneenSummaryAr: `تتوفر نتائج نصية متعددة عبر التواريخ؛ الأفضل عرض التواريخ على الطبيب المعالج لمراجعتها سوية.`,
      });
      continue;
    }

    const prev = numericPoints[numericPoints.length - 2];
    const curr = numericPoints[numericPoints.length - 1];
    const rawDelta = (curr.numericValue as number) - (prev.numericValue as number);
    const delta = Math.round(rawDelta * 100) / 100;
    const trendDirection: HaneenLabComparisonSeries['trendDirection'] =
      Math.abs(delta) < 0.01 ? 'stable' : delta > 0 ? 'up' : 'down';

    const dirWord =
      trendDirection === 'up' ? 'ارتفعت' : trendDirection === 'down' ? 'انخفضت' : 'بقيت ثابتة تقريباً';
    const unitDisplay = primaryUnit === 'بدون وحدة' ? '' : ` ${primaryUnit}`;

    series.push({
      seriesKey: key,
      testName: entry.displayName,
      unit: primaryUnit,
      comparable: true,
      trendDirection,
      deltaValue: delta,
      latestPrintedReferenceRange: curr.referenceRange,
      points: sorted,
      haneenSummaryAr: `القيمة في آخر فحص (${curr.date}) ${dirWord} مقارنة بالفحص السابق (${prev.date}) من ${prev.rawValue}${unitDisplay} إلى ${curr.rawValue}${unitDisplay} (بنفس الوحدة). تفسير معنى هذا التغيّر يعتمد على فحص الطبيب المعالج والأعراض والمدى المرجعي المطبوع (${curr.referenceRange}).`,
    });
  }

  return {
    consentVerified: true,
    reportsScanned: docs.length,
    comparableSeriesCount: series.filter((s) => s.comparable).length,
    nonComparableSeriesCount: series.filter((s) => !s.comparable).length,
    series,
    safetyDisclaimerAr:
      'هذا العرض يفصل تماماً بين أرقام المختبر الأصلية وتلخيص حنين التثقيفي. المقارنة الرقمية تتم فقط لنفس الفحص وبنفس وحدة القياس ولا تغني عن تقييم الطبيب المختص.',
  };
}
