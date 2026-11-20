export interface GovernorateOption {
  id: string;
  ar: string;
  en: string;
  districts: { ar: string; en: string }[];
}

export const IRAQ_GOVERNORATES: GovernorateOption[] = [
  {
    id: 'baghdad',
    ar: 'بغداد',
    en: 'Baghdad',
    districts: [
      { ar: 'الكرخ', en: 'Al-Karkh' },
      { ar: 'الرصافة', en: 'Al-Rusafa' },
      { ar: 'المنصور', en: 'Al-Mansour' },
      { ar: 'الكرادة', en: 'Karrada' },
      { ar: 'الأعظمية', en: 'Adhamiyah' },
      { ar: 'الكاظمية', en: 'Kadhimiya' },
    ],
  },
  {
    id: 'basra',
    ar: 'البصرة',
    en: 'Basra',
    districts: [
      { ar: 'مركز البصرة', en: 'Basra Center' },
      { ar: 'الزبير', en: 'Al-Zubair' },
      { ar: 'أبو الخصيب', en: 'Abu Al-Khaseeb' },
      { ar: 'شط العرب', en: 'Shatt Al-Arab' },
    ],
  },
  {
    id: 'nineveh',
    ar: 'نينوى',
    en: 'Nineveh',
    districts: [
      { ar: 'الموصل', en: 'Mosul' },
      { ar: 'تلعفر', en: 'Tal Afar' },
      { ar: 'الحمدانية', en: 'Al-Hamdaniya' },
      { ar: 'سنجار', en: 'Sinjar' },
    ],
  },
  {
    id: 'erbil',
    ar: 'أربيل',
    en: 'Erbil',
    districts: [
      { ar: 'مركز أربيل', en: 'Erbil Center' },
      { ar: 'سوران', en: 'Soran' },
      { ar: 'شقلاوة', en: 'Shaqlawa' },
      { ar: 'كويسنجق', en: 'Koya' },
    ],
  },
  {
    id: 'najaf',
    ar: 'النجف',
    en: 'Najaf',
    districts: [
      { ar: 'مركز النجف', en: 'Najaf Center' },
      { ar: 'الكوفة', en: 'Kufa' },
      { ar: 'المناذرة', en: 'Al-Manathera' },
    ],
  },
  {
    id: 'karbala',
    ar: 'كربلاء',
    en: 'Karbala',
    districts: [
      { ar: 'مركز كربلاء', en: 'Karbala Center' },
      { ar: 'الهندية', en: 'Al-Hindiya' },
      { ar: 'عين التمر', en: 'Ain Al-Tamur' },
    ],
  },
  {
    id: 'babylon',
    ar: 'بابل',
    en: 'Babylon',
    districts: [
      { ar: 'الحلة', en: 'Hillah' },
      { ar: 'المسيب', en: 'Al-Musayyib' },
      { ar: 'المحاويل', en: 'Al-Mahawil' },
    ],
  },
  {
    id: 'anbar',
    ar: 'الأنبار',
    en: 'Al-Anbar',
    districts: [
      { ar: 'الرمادي', en: 'Ramadi' },
      { ar: 'الفلوجة', en: 'Fallujah' },
      { ar: 'هيت', en: 'Heet' },
      { ar: 'حديثة', en: 'Haditha' },
    ],
  },
  {
    id: 'diyala',
    ar: 'ديالى',
    en: 'Diyala',
    districts: [
      { ar: 'بعقوبة', en: 'Baqubah' },
      { ar: 'الخالص', en: 'Al-Khalis' },
      { ar: 'خانقين', en: 'Khanaqin' },
    ],
  },
  {
    id: 'kirkuk',
    ar: 'كركوك',
    en: 'Kirkuk',
    districts: [
      { ar: 'مركز كركوك', en: 'Kirkuk Center' },
      { ar: 'الحويجة', en: 'Hawija' },
      { ar: 'داقوق', en: 'Daquq' },
    ],
  },
  {
    id: 'sulaymaniyah',
    ar: 'السليمانية',
    en: 'Sulaymaniyah',
    districts: [
      { ar: 'مركز السليمانية', en: 'Sulaymaniyah Center' },
      { ar: 'حلبجة', en: 'Halabja' },
      { ar: 'رانية', en: 'Ranya' },
    ],
  },
  {
    id: 'duhok',
    ar: 'دهوك',
    en: 'Duhok',
    districts: [
      { ar: 'مركز دهوك', en: 'Duhok Center' },
      { ar: 'زاخو', en: 'Zakho' },
      { ar: 'العمادية', en: 'Amadiya' },
    ],
  },
  {
    id: 'dhiqar',
    ar: 'ذي قار',
    en: 'Dhi Qar',
    districts: [
      { ar: 'الناصرية', en: 'Nasiriyah' },
      { ar: 'الشطرة', en: 'Al-Shatra' },
      { ar: 'الرفاعي', en: 'Al-Rifai' },
    ],
  },
  {
    id: 'wasit',
    ar: 'واسط',
    en: 'Wasit',
    districts: [
      { ar: 'الكوت', en: 'Kut' },
      { ar: 'الصويرة', en: 'Al-Suwaira' },
      { ar: 'الحي', en: 'Al-Hai' },
    ],
  },
  {
    id: 'maysan',
    ar: 'ميسان',
    en: 'Maysan',
    districts: [
      { ar: 'العمارة', en: 'Amarah' },
      { ar: 'المجر الكبير', en: 'Al-Majar Al-Kabir' },
      { ar: 'قلعة صالح', en: 'Qalat Saleh' },
    ],
  },
  {
    id: 'qadisiyyah',
    ar: 'القادسية',
    en: 'Al-Qadisiyyah',
    districts: [
      { ar: 'الديوانية', en: 'Diwaniyah' },
      { ar: 'الشامية', en: 'Al-Shamiya' },
      { ar: 'عفك', en: 'Afak' },
    ],
  },
  {
    id: 'muthanna',
    ar: 'المثنى',
    en: 'Muthanna',
    districts: [
      { ar: 'السماوة', en: 'Samawah' },
      { ar: 'الرميثة', en: 'Al-Rumaitha' },
    ],
  },
  {
    id: 'saladin',
    ar: 'صلاح الدين',
    en: 'Saladin',
    districts: [
      { ar: 'تكريت', en: 'Tikrit' },
      { ar: 'سامراء', en: 'Samarra' },
      { ar: 'بيجي', en: 'Baiji' },
    ],
  },
];

export const LAB_SERVICE_OPTIONS = [
  { id: 'hematology', ar: 'تحاليل الدم (Hematology)', en: 'Hematology & CBC' },
  { id: 'biochemistry', ar: 'الكيمياء السريرية', en: 'Clinical Biochemistry' },
  { id: 'hormones', ar: 'الهرمونات والغدد', en: 'Hormones & Endocrinology' },
  { id: 'microbiology', ar: 'الأحياء المجهرية والزرع', en: 'Microbiology & Cultures' },
  { id: 'immunology', ar: 'المناعة والأمصال', en: 'Immunology & Serology' },
  { id: 'molecular', ar: 'الفحوصات الجزيئية (PCR)', en: 'Molecular Diagnostics (PCR)' },
  { id: 'pathology', ar: 'الأنسجة والخلايا', en: 'Histopathology & Cytology' },
  { id: 'home_sampling', ar: 'سحب العينات المنزلي', en: 'Home Sample Collection' },
];
