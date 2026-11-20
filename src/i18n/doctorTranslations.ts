import type {
  AppointmentStatus,
  DayOfWeekKey,
  DiagnosticOrderStatus,
  DoctorSectionId,
  SecretaryPermissionKey,
} from '../types/doctor';
import type { Language } from '../types/medora';

export interface DoctorPortalCopy {
  brandTitle: string;
  brandSubtitle: string;
  backToHome: string;
  notApprovedTitle: string;
  notApprovedBody: string;
  checkStatusBtn: string;
  loadingWorkspace: string;
  refreshBtn: string;
  nav: Record<DoctorSectionId, string>;
  days: Record<DayOfWeekKey, string>;
  appointmentStatuses: Record<AppointmentStatus, string>;
  diagnosticStatuses: Record<DiagnosticOrderStatus, string>;
  permissions: Record<SecretaryPermissionKey, string>;
  overview: {
    welcomePrefix: string;
    accountStatusLabel: string;
    clinicLabel: string;
    todayBookings: string;
    waitingPatients: string;
    unreadMessages: string;
    recentResults: string;
    upcomingTitle: string;
    noUpcoming: string;
    latestDiagnosticsTitle: string;
    noDiagnostics: string;
    alertsTitle: string;
    quickShortcuts: string;
    addPatientShortcut: string;
    newRxShortcut: string;
    newOrderShortcut: string;
    newLabOrderShortcut: string;
    newImagingOrderClosedShortcut: string;
    promoBannerShortcut: string;
    pendingConfirmationsAlert: string;
    pendingStaffAlert: string;
    unreadMessagesAlert: string;
    noBannerAlert: string;
  };
  appointments: {
    title: string;
    viewDay: string;
    viewWeek: string;
    viewMonth: string;
    viewWaitlist: string;
    viewSchedule: string;
    newBookingBtn: string;
    patientName: string;
    patientPhone: string;
    selectPatientOpt: string;
    dateLabel: string;
    timeLabel: string;
    visitTypeLabel: string;
    visitTypes: { scheduled: string; walk_in: string; follow_up: string };
    reasonLabel: string;
    waitlistToggle: string;
    saveBookingBtn: string;
    confirmBtn: string;
    rejectBtn: string;
    cancelBtn: string;
    rescheduleBtn: string;
    checkInBtn: string;
    completeBtn: string;
    noShowBtn: string;
    rescheduleTitle: string;
    newDate: string;
    newTime: string;
    noAppointments: string;
    slotTakenError: string;
    scheduleTitle: string;
    durationLabel: string;
    capacityLabel: string;
    holidaysLabel: string;
    addHolidayPlaceholder: string;
    addHolidayBtn: string;
    saveScheduleBtn: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    breakStart: string;
    breakEnd: string;
    savedNotice: string;
  };
  patients: {
    title: string;
    searchPlaceholder: string;
    addPatientBtn: string;
    fileNumber: string;
    phone: string;
    dob: string;
    gender: string;
    male: string;
    female: string;
    bloodType: string;
    allergies: string;
    chronicConditions: string;
    address: string;
    visitsTab: string;
    rxTab: string;
    diagnosticsTab: string;
    filesTab: string;
    addVisitBtn: string;
    addVisitTopBtn: string;
    selectPatientRequired: string;
    patientSummaryTitle: string;
    visitDate: string;
    visitTime: string;
    visitReason: string;
    chiefComplaint: string;
    diagnosis: string;
    clinicalNotes: string;
    procedures: string;
    treatmentRecommendations: string;
    inlineRxToggle: string;
    attachHint: string;
    vitalsTitle: string;
    bp: string;
    temp: string;
    hr: string;
    weight: string;
    attachFiles: string;
    saveVisitBtn: string;
    noPatients: string;
    noVisits: string;
    selectPatientPrompt: string;
    restrictedRecordsNotice: string;
    totalVisits: string;
    visitDetailsTitle: string;
    viewDetailsBtn: string;
    printBtn: string;
    downloadPdfBtn: string;
    printRecordBtn: string;
    downloadRecordPdfBtn: string;
    exportingPdf: string;
    visitSavedNotice: string;
  };
  prescriptions: {
    title: string;
    newRxBtn: string;
    selectPatient: string;
    medicationsTitle: string;
    addMedRow: string;
    drugName: string;
    dosage: string;
    frequency: string;
    duration: string;
    instructions: string;
    doctorNotes: string;
    saveRxBtn: string;
    printPdfBtn: string;
    printBtn: string;
    downloadPdfBtn: string;
    exportingPdf: string;
    previousRxTitle: string;
    noRx: string;
    rxSheetHeader: string;
    rxDate: string;
    patientLabel: string;
    doctorLabel: string;
    specialtyLabel: string;
    signatureLine: string;
  };
  diagnostics: {
    title: string;
    imagingClosedTitle: string;
    newOrderBtn: string;
    filterAll: string;
    filterLab: string;
    filterImaging: string;
    orderTypeLab: string;
    orderTypeImaging: string;
    orderTypeImagingClosed: string;
    imagingClosedBadge: string;
    imagingClosedNotice: string;
    selectPatient: string;
    facilityName: string;
    facilityNameLabOnly: string;
    testsLabel: string;
    testsPlaceholder: string;
    testsPlaceholderLabOnly: string;
    clinicalIndication: string;
    priorityRoutine: string;
    priorityUrgent: string;
    saveOrderBtn: string;
    recordResultBtn: string;
    resultSummary: string;
    doctorNotes: string;
    uploadResultFiles: string;
    uploadResultFilesLabOnly: string;
    saveResultBtn: string;
    orderedAt: string;
    receivedAt: string;
    noOrders: string;
    extensibleNote: string;
    extensibleNoteLabOnly: string;
    printBtn: string;
    downloadPdfBtn: string;
    exportingPdf: string;
  };
  messages: {
    title: string;
    newChatBtn: string;
    selectPatient: string;
    searchConversations: string;
    noConversations: string;
    selectConversationPrompt: string;
    typeMessagePlaceholder: string;
    sendBtn: string;
    attachFileBtn: string;
    unreadBadge: string;
  };
  clinicStaff: {
    title: string;
    clinicCardTitle: string;
    singleClinicNote: string;
    clinicName: string;
    governorate: string;
    district: string;
    address: string;
    phone: string;
    mapUrl: string;
    feeLabel: string;
    servicesLabel: string;
    workHoursLabel: string;
    saveClinicBtn: string;
    staffTitle: string;
    pendingRequestsTitle: string;
    activeStaffTitle: string;
    noStaff: string;
    approveBtn: string;
    rejectBtn: string;
    revokeBtn: string;
    reactivateBtn: string;
    savePermissionsBtn: string;
    auditLogTitle: string;
    noLogs: string;
  };
  reports: {
    title: string;
    periodDay: string;
    periodWeek: string;
    periodMonth: string;
    totalPatients: string;
    newPatients: string;
    totalVisits: string;
    completedBookings: string;
    cancelledBookings: string;
    noShowBookings: string;
    busiestDay: string;
    revenueSummary: string;
    noRevenueData: string;
    exportCsvBtn: string;
    printReportBtn: string;
    downloadReportPdfBtn: string;
    exportingPdf: string;
    noDataBanner: string;
    statusBreakdown: string;
    dayDistribution: string;
  };
  promoBanner: {
    title: string;
    subtitle: string;
    uploadBtn: string;
    replaceBtn: string;
    deleteBtn: string;
    saveBtn: string;
    cancelPreviewBtn: string;
    taglineLabel: string;
    taglinePlaceholder: string;
    guidelinesTitle: string;
    guidelinesBody: string;
    previewSectionTitle: string;
    cardPreviewLabel: string;
    profilePreviewLabel: string;
    openPublicDirectoryBtn: string;
    uploadErrorPreserved: string;
    savedSuccess: string;
    deletedSuccess: string;
    noBannerFallbackTitle: string;
  };
  settings: {
    title: string;
    profileTab: string;
    notificationsTab: string;
    appearanceTab: string;
    securityTab: string;
    saveProfileBtn: string;
    updateAvatarBtn: string;
    avatarSectionTitle: string;
    avatarSpecsHint: string;
    previewReadyLabel: string;
    saveAvatarBtn: string;
    replaceAvatarBtn: string;
    removeAvatarBtn: string;
    cancelPreviewBtn: string;
    avatarSavedMsg: string;
    avatarRemovedMsg: string;
    phoneLabel: string;
    languagesLabel: string;
    languageSelect: string;
    themeSelect: string;
    lightMode: string;
    darkMode: string;
    privacyShowPhone: string;
    privacyShowFee: string;
    privacyAllowMessages: string;
    securitySummary: string;
  };
  directory: {
    title: string;
    subtitle: string;
    backBtn: string;
    searchPlaceholder: string;
    allSpecialties: string;
    allGovernorates: string;
    viewProfileBtn: string;
    bookAppointmentBtn: string;
    availableToday: string;
    slotsAvailable: string;
    noSlotsAvailable: string;
    feeUnit: string;
    feeOnRequest: string;
    noDoctorsFound: string;
    profileBioTitle: string;
    availableSlotsTitle: string;
    bookNowTitle: string;
    signInRequiredToBook: string;
    bookingSuccess: string;
    bookingConflict: string;
    confirmBookingBtn: string;
  };
}

export const DOCTOR_TRANSLATIONS: Record<Language, DoctorPortalCopy> = {
  ar: {
    brandTitle: 'MEDORA DOCTOR',
    brandSubtitle: 'بوابة الطبيب السريرية المتكاملة',
    backToHome: 'العودة إلى MEDORA',
    notApprovedTitle: 'حساب الطبيب بانتظار الاعتماد الإداري',
    notApprovedBody:
      'تُفتح بوابة MEDORA DOCTOR الكاملة تلقائياً فور اعتماد طلب التسجيل من إدارة MEDORA العليا.',
    checkStatusBtn: 'متابعة حالة الطلب',
    loadingWorkspace: 'جارٍ تحميل بيانات بوابة الطبيب من الخادم...',
    refreshBtn: 'تحديث البيانات',
    nav: {
      overview: 'الرئيسية',
      appointments: 'المواعيد والحجوزات',
      patients: 'المرضى والملفات',
      prescriptions: 'الوصفات الطبية',
      diagnostics: 'التحاليل والأشعة',
      pharmacy_orders: 'طلبات الصيدلية',
      messages: 'الرسائل والتواصل',
      clinic_staff: 'إدارة السكرتارية والعيادة',
      reports: 'التقارير والإحصائيات',
      promotional_banner: 'صورتي الإعلانية',
      settings: 'الملف الشخصي والإعدادات',
    },
    days: {
      sat: 'السبت',
      sun: 'الأحد',
      mon: 'الإثنين',
      tue: 'الثلاثاء',
      wed: 'الأربعاء',
      thu: 'الخميس',
      fri: 'الجمعة',
    },
    appointmentStatuses: {
      pending: 'بانتظار التأكيد',
      confirmed: 'مؤكد',
      checked_in: 'حاضر بالعيادة',
      completed: 'مكتمل',
      cancelled: 'ملغى',
      rejected: 'مرفوض',
      no_show: 'لم يحضر',
    },
    diagnosticStatuses: {
      ordered: 'مطلوب',
      in_progress: 'قيد التنفيذ',
      results_received: 'وصلت النتيجة',
      reviewed: 'تمت المراجعة',
    },
    permissions: {
      viewAppointments: 'عرض المواعيد',
      manageAppointments: 'قبول/تعديل/إلغاء الحجوزات',
      manageWaitlist: 'إدارة قائمة الانتظار',
      viewPatientBasic: 'عرض بيانات المريض الأساسية',
      viewMedicalRecords: 'الاطلاع على الملف الطبي والتشخيصات',
      uploadLabResults: 'رفع نتائج التحاليل والأشعة',
      messagePatients: 'مراسلة المرضى',
      editClinicSchedule: 'تعديل جدول الدوام والعيادة',
    },
    overview: {
      welcomePrefix: 'د.',
      accountStatusLabel: 'حالة الحساب',
      clinicLabel: 'العيادة',
      todayBookings: 'حجوزات اليوم',
      waitingPatients: 'المرضى المنتظرون',
      unreadMessages: 'رسائل غير مقروءة',
      recentResults: 'نتائج التحاليل والأشعة',
      upcomingTitle: 'المواعيد القادمة',
      noUpcoming: 'لا توجد مواعيد قادمة مجدولة حالياً.',
      latestDiagnosticsTitle: 'آخر نتائج التحاليل والأشعة المستلمة',
      noDiagnostics: 'لم تصل نتائج جديدة حتى الآن.',
      alertsTitle: 'التنبيهات والإشعارات المهمة',
      quickShortcuts: 'اختصارات سريعة',
      addPatientShortcut: 'إضافة مريض',
      newRxShortcut: 'وصفة جديدة',
      newOrderShortcut: 'طلب تحليل / أشعة',
      newLabOrderShortcut: 'طلب تحليل مختبري',
      newImagingOrderClosedShortcut: 'طلب الأشعة (مغلق مؤقت)',
      promoBannerShortcut: 'صورتي الإعلانية',
      pendingConfirmationsAlert: 'حجوزات بانتظار التأكيد أو القبول',
      pendingStaffAlert: 'طلبات انضمام سكرتارية بانتظار قرارك',
      unreadMessagesAlert: 'رسائل مرضى غير مقروءة',
      noBannerAlert: 'لم ترفع صورتك الإعلانية بعد — ارفعها لتظهر للمرضى في الدليل',
    },
    appointments: {
      title: 'نظام المواعيد والحجوزات',
      viewDay: 'يومي',
      viewWeek: 'أسبوعي',
      viewMonth: 'شهري',
      viewWaitlist: 'قائمة الانتظار',
      viewSchedule: 'جدول الدوام والعطل',
      newBookingBtn: 'إضافة حجز',
      patientName: 'اسم المريض',
      patientPhone: 'رقم الهاتف',
      selectPatientOpt: 'اختر من المرضى المسجلين (اختياري)',
      dateLabel: 'التاريخ',
      timeLabel: 'الوقت',
      visitTypeLabel: 'نوع الموعد',
      visitTypes: { scheduled: 'حجز مسبق', walk_in: 'حضور مباشر', follow_up: 'مراجعة' },
      reasonLabel: 'سبب الزيارة',
      waitlistToggle: 'إضافة إلى قائمة الانتظار',
      saveBookingBtn: 'تثبيت الحجز',
      confirmBtn: 'تأكيد / قبول',
      rejectBtn: 'رفض',
      cancelBtn: 'إلغاء',
      rescheduleBtn: 'إعادة جدولة',
      checkInBtn: 'تسجيل وصول',
      completeBtn: 'إكمال الكشف',
      noShowBtn: 'لم يحضر',
      rescheduleTitle: 'إعادة جدولة الموعد',
      newDate: 'التاريخ الجديد',
      newTime: 'الوقت الجديد',
      noAppointments: 'لا توجد مواعيد في هذا العرض.',
      slotTakenError: 'هذا الموعد محجوز مسبقاً أو اكتمل الحد المسموح لهذه الفترة.',
      scheduleTitle: 'ساعات الدوام والاستراحة والعطل',
      durationLabel: 'مدة الكشف (دقيقة)',
      capacityLabel: 'الحد الأقصى لكل فترة زمنية',
      holidaysLabel: 'أيام العطل والإجازات الخاصة',
      addHolidayPlaceholder: 'اختر تاريخ العطلة',
      addHolidayBtn: 'إضافة عطلة',
      saveScheduleBtn: 'حفظ جدول الدوام',
      workingHoursStart: 'من',
      workingHoursEnd: 'إلى',
      breakStart: 'بداية الاستراحة',
      breakEnd: 'نهاية الاستراحة',
      savedNotice: 'تم تحديث جدول المواعيد بنجاح.',
    },
    patients: {
      title: 'إدارة المرضى والملفات الطبية',
      searchPlaceholder: 'ابحث بالاسم أو رقم الهاتف أو رقم الملف...',
      addPatientBtn: 'تسجيل مريض جديد',
      fileNumber: 'رقم الملف',
      phone: 'رقم الهاتف',
      dob: 'تاريخ الميلاد',
      gender: 'الجنس',
      male: 'ذكر',
      female: 'أنثى',
      bloodType: 'فصيلة الدم',
      allergies: 'الحساسية الدوائية / الغذائية',
      chronicConditions: 'الأمراض المزمنة',
      address: 'العنوان',
      visitsTab: 'الزيارات والملاحظات',
      rxTab: 'الوصفات السابقة',
      diagnosticsTab: 'التحاليل والأشعة',
      filesTab: 'المستندات المرفوعة',
      addVisitBtn: 'إضافة زيارة وملاحظة طبية',
      addVisitTopBtn: 'إضافة زيارة جديدة',
      selectPatientRequired: 'اختر المريض لتوثيق الزيارة',
      patientSummaryTitle: 'ملخص بيانات المريض قبل الحفظ',
      visitDate: 'تاريخ الزيارة',
      visitTime: 'وقت الزيارة',
      visitReason: 'سبب الزيارة',
      chiefComplaint: 'الشكوى الرئيسية',
      diagnosis: 'التشخيص الطبي',
      clinicalNotes: 'ملاحظات الطبيب السريرية',
      procedures: 'الفحوصات والإجراءات المنجزة',
      treatmentRecommendations: 'خطة العلاج والتوصيات',
      inlineRxToggle: 'إرفاق وصفة طبية مرتبطة بهذه الزيارة (اختياري)',
      attachHint: 'يدعم صور الهاتف (JPG/PNG/WebP/HEIC) وملفات PDF بحد أقصى 5 MB',
      vitalsTitle: 'المؤشرات الحيوية',
      bp: 'ضغط الدم',
      temp: 'الحرارة',
      hr: 'النبض',
      weight: 'الوزن (كغم)',
      attachFiles: 'إرفاق صور أو ملفات طبية (PDF / صور)',
      saveVisitBtn: 'حفظ الزيارة في الملف الطبي',
      noPatients: 'لا يوجد مرضى مسجلون بعد.',
      noVisits: 'لا توجد زيارات مسجلة لهذا المريض بعد.',
      selectPatientPrompt: 'اختر مريضاً من القائمة لعرض ملفه الطبي الكامل.',
      restrictedRecordsNotice: 'الوصول إلى التشخيصات والملفات الطبية محصور بصلاحية الطبيب.',
      totalVisits: 'الزيارات',
      visitDetailsTitle: 'تفاصيل الزيارة الطبية',
      viewDetailsBtn: 'عرض التفاصيل',
      printBtn: 'طباعة',
      downloadPdfBtn: 'تحميل PDF',
      printRecordBtn: 'طباعة السجل الطبي',
      downloadRecordPdfBtn: 'تحميل السجل PDF',
      exportingPdf: 'جاري تجهيز PDF...',
      visitSavedNotice: 'تم حفظ الزيارة الطبية في سجل المريض بنجاح.',
    },
    prescriptions: {
      title: 'نظام الوصفات الطبية الإلكترونية',
      newRxBtn: 'إنشاء وصفة جديدة',
      selectPatient: 'اختر المريض',
      medicationsTitle: 'الأدوية الموصوفة',
      addMedRow: 'إضافة دواء آخر',
      drugName: 'اسم الدواء',
      dosage: 'الجرعة',
      frequency: 'عدد مرات الاستخدام',
      duration: 'مدة العلاج',
      instructions: 'تعليمات الاستخدام',
      doctorNotes: 'ملاحظات الطبيب',
      saveRxBtn: 'حفظ الوصفة في ملف المريض',
      printPdfBtn: 'طباعة / حفظ PDF',
      printBtn: 'طباعة',
      downloadPdfBtn: 'تحميل PDF',
      exportingPdf: 'جاري تجهيز PDF...',
      previousRxTitle: 'الوصفات المحفوظة',
      noRx: 'لم يتم إصدار وصفات طبية بعد.',
      rxSheetHeader: 'وصفة طبية إلكترونية معتمدة',
      rxDate: 'تاريخ الوصفة',
      patientLabel: 'المريض',
      doctorLabel: 'الطبيب المعالج',
      specialtyLabel: 'الاختصاص',
      signatureLine: 'توقيع وختم الطبيب',
    },
    diagnostics: {
      title: 'التحاليل المختبرية ومراكز الأشعة',
      imagingClosedTitle: 'التحاليل المختبرية (مراكز الأشعة: مغلق مؤقت)',
      newOrderBtn: 'إرسال طلب فحص جديد',
      filterAll: 'الكل',
      filterLab: 'التحاليل المختبرية',
      filterImaging: 'الأشعة والتصوير',
      orderTypeLab: 'طلب تحليل مختبري',
      orderTypeImaging: 'طلب أشعة / تصوير',
      orderTypeImagingClosed: 'طلب الأشعة — مغلق مؤقت',
      imagingClosedBadge: 'مغلق مؤقت',
      imagingClosedNotice:
        'طلب الأشعة ومراكز الأشعة مغلق مؤقتاً حتى إشعار آخر — تبقى طلبات التحاليل المختبرية متاحة كالمعتاد.',
      selectPatient: 'اختر المريض',
      facilityName: 'اسم المختبر أو مركز الأشعة (اختياري)',
      facilityNameLabOnly: 'اسم المختبر (اختياري)',
      testsLabel: 'الفحوصات المطلوبة (افصل بفاصلة)',
      testsPlaceholder: 'مثال: CBC, HbA1c, Lipid Profile أو X-Ray Chest',
      testsPlaceholderLabOnly: 'مثال: CBC, HbA1c, Lipid Profile',
      clinicalIndication: 'الداعي السريري / التشخيص المبدئي',
      priorityRoutine: 'اعتيادي',
      priorityUrgent: 'مستعجل',
      saveOrderBtn: 'إرسال وحفظ الطلب',
      recordResultBtn: 'إرفاق / تحديث النتيجة',
      resultSummary: 'ملخص النتيجة / التقرير',
      doctorNotes: 'ملاحظات الطبيب على النتيجة',
      uploadResultFiles: 'رفع ملفات النتائج (صور أشعة / PDF)',
      uploadResultFilesLabOnly: 'رفع ملفات النتائج (صور / PDF)',
      saveResultBtn: 'حفظ النتيجة والملاحظات',
      orderedAt: 'تاريخ الطلب',
      receivedAt: 'تاريخ وصول النتيجة',
      noOrders: 'لا توجد طلبات تحاليل أو أشعة حتى الآن.',
      extensibleNote: 'جاهز للربط المباشر مع بوابتي المختبر ومركز الأشعة داخل MEDORA.',
      extensibleNoteLabOnly:
        'الربط المباشر مع بوابة المختبرات متاح · بوابة ومراكز الأشعة مغلقة مؤقتاً.',
      printBtn: 'طباعة',
      downloadPdfBtn: 'تحميل PDF',
      exportingPdf: 'جاري تجهيز PDF...',
    },
    messages: {
      title: 'الرسائل والتواصل مع المرضى',
      newChatBtn: 'بدء محادثة جديدة',
      selectPatient: 'اختر المريض',
      searchConversations: 'ابحث في المحادثات...',
      noConversations: 'لا توجد محادثات حالياً.',
      selectConversationPrompt: 'اختر محادثة لعرض الرسائل والملفات المرفقة.',
      typeMessagePlaceholder: 'اكتب رسالتك الطبية أو تعليماتك للمريض...',
      sendBtn: 'إرسال',
      attachFileBtn: 'إرفاق صورة أو ملف',
      unreadBadge: 'غير مقروءة',
    },
    clinicStaff: {
      title: 'إدارة السكرتارية والعيادة',
      clinicCardTitle: 'بيانات العيادة الواحدة',
      singleClinicNote: 'كل حساب طبيب في MEDORA مرتبط بعيادة مستقلة واحدة لضمان دقة المواعيد والسجلات.',
      clinicName: 'اسم العيادة',
      governorate: 'المحافظة',
      district: 'المنطقة / القضاء',
      address: 'العنوان الكامل',
      phone: 'رقم تواصل العيادة',
      mapUrl: 'رابط موقع العيادة على الخريطة',
      feeLabel: 'سعر الكشف (د.ع / USD)',
      servicesLabel: 'الخدمات المقدمة (افصل بفاصلة)',
      workHoursLabel: 'ملخص أوقات الدوام',
      saveClinicBtn: 'حفظ بيانات العيادة',
      staffTitle: 'فريق السكرتارية والموظفون',
      pendingRequestsTitle: 'طلبات انضمام جديدة للعيادة',
      activeStaffTitle: 'الموظفون المعتمدون وصلاحياتهم',
      noStaff: 'لا يوجد طلبات سكرتارية أو موظفون مرتبطون بالعيادة حالياً.',
      approveBtn: 'موافقة وإضافة',
      rejectBtn: 'رفض الطلب',
      revokeBtn: 'إيقاف الصلاحيات',
      reactivateBtn: 'إعادة تفعيل',
      savePermissionsBtn: 'تحديث الصلاحيات',
      auditLogTitle: 'سجل عمليات الموظفين والعيادة',
      noLogs: 'لا توجد عمليات مسجلة بعد.',
    },
    reports: {
      title: 'التقارير والإحصائيات السريرية',
      periodDay: 'اليوم',
      periodWeek: 'آخر 7 أيام',
      periodMonth: 'هذا الشهر',
      totalPatients: 'إجمالي المرضى',
      newPatients: 'مرضى جدد',
      totalVisits: 'عدد الزيارات',
      completedBookings: 'الحجوزات المكتملة',
      cancelledBookings: 'الحجوزات الملغاة',
      noShowBookings: 'مواعيد لم يحضر أصحابها',
      busiestDay: 'أكثر الأيام ازدحاماً',
      revenueSummary: 'ملخص الإيرادات المسجلة',
      noRevenueData: 'لا توجد بيانات إيرادات فعلية في هذه الفترة',
      exportCsvBtn: 'تصدير التقرير CSV',
      printReportBtn: 'طباعة التقرير',
      downloadReportPdfBtn: 'تحميل PDF',
      exportingPdf: 'جاري تجهيز PDF...',
      noDataBanner: 'تُحسب جميع الأرقام حصراً من السجلات الفعلية في قاعدة البيانات دون أي بيانات افتراضية.',
      statusBreakdown: 'توزيع حالات المواعيد',
      dayDistribution: 'كثافة الحجوزات حسب اليوم',
    },
    promoBanner: {
      title: 'صورتي الإعلانية',
      subtitle:
        'ارفع صورة إعلانية واضحة واحترافية تمثلك أو تمثل عيادتك؛ تظهر هذه الصورة الكبيرة للمرضى في دليل الأطباء وصفحتك العامة قبل الحجز.',
      uploadBtn: 'اختيار صورة إعلانية',
      replaceBtn: 'استبدال الصورة',
      deleteBtn: 'حذف الصورة الإعلانية',
      saveBtn: 'حفظ الصورة الإعلانية',
      cancelPreviewBtn: 'إلغاء المعاينة',
      taglineLabel: 'عبارة تعريفية مختصرة للمرضى',
      taglinePlaceholder: 'مثال: استشاري أمراض القلب — عناية سريرية دقيقة ومواعيد منظمة',
      guidelinesTitle: 'مواصفات الصورة المعتمدة',
      guidelinesBody:
        'الصيغ المدعومة: JPG، PNG، WebP — الحد الأقصى 5 ميجابايت — يُفضل نسبة عرض 16:9 أو 4:3 للوضوح على الهاتف والكمبيوتر.',
      previewSectionTitle: 'معاينة حية كما تظهر للمرضى',
      cardPreviewLabel: 'بطاقة الطبيب في دليل المرضى',
      profilePreviewLabel: 'صفحة الطبيب قبل الحجز',
      openPublicDirectoryBtn: 'معاينة دليل الأطباء المباشر',
      uploadErrorPreserved: 'تعذر رفع الصورة الجديدة؛ تم الإبقاء على صورتك السابقة دون فقدان.',
      savedSuccess: 'تم حفظ الصورة الإعلانية وربطها بملفك بنجاح.',
      deletedSuccess: 'تم حذف الصورة الإعلانية والعودة إلى التصميم الافتراضي الأنيق.',
      noBannerFallbackTitle: 'واجهة الطبيب الرسمية — MEDORA',
    },
    settings: {
      title: 'الملف الشخصي والإعدادات',
      profileTab: 'البيانات الشخصية والمهنية',
      notificationsTab: 'إعدادات الإشعارات',
      appearanceTab: 'اللغة والمظهر',
      securityTab: 'الخصوصية والأمان',
      saveProfileBtn: 'حفظ التعديلات',
      updateAvatarBtn: 'اختيار صورة شخصية',
      avatarSectionTitle: 'الصورة الشخصية للطبيب',
      avatarSpecsHint: 'يدعم صور الهاتف (JPG / PNG / WebP / HEIC) مع ضغط تلقائي · تظهر صورتك في البوابة والبحث وبطاقات المرضى.',
      previewReadyLabel: 'معاينة الصورة الجديدة جاهزة — اضغط «حفظ الصورة الشخصية» لتثبيتها',
      saveAvatarBtn: 'حفظ الصورة الشخصية',
      replaceAvatarBtn: 'تغيير الصورة',
      removeAvatarBtn: 'حذف الصورة',
      cancelPreviewBtn: 'إلغاء المعاينة',
      avatarSavedMsg: 'تم حفظ الصورة الشخصية وتحديثها عبر جميع البوابات.',
      avatarRemovedMsg: 'تمت إزالة الصورة الشخصية والعودة للأيقونة الافتراضية.',
      phoneLabel: 'رقم الهاتف المهني',
      languagesLabel: 'لغات التواصل (افصل بفاصلة)',
      languageSelect: 'لغة الواجهة',
      themeSelect: 'وضع العرض',
      lightMode: 'الوضع النهاري',
      darkMode: 'الوضع الليلي',
      privacyShowPhone: 'إظهار رقم هاتف العيادة في صفحة الطبيب للمرضى',
      privacyShowFee: 'إظهار سعر الكشف في بطاقة الطبيب',
      privacyAllowMessages: 'السماح باستقبال رسائل المرضى داخل التطبيق',
      securitySummary:
        'جميع بيانات الطبيب وملفات المرضى والصور الطبية محمية بمصادقة Firebase والتحقق الخادمي وقواعد Firestore وStorage المعزولة لكل عيادة.',
    },
    directory: {
      title: 'دليل أطباء MEDORA المعتمدين',
      subtitle: 'تصفح الأطباء المعتمدين واطّلع على ملفاتهم ومواعيدهم الحقيقية قبل الحجز.',
      backBtn: 'العودة',
      searchPlaceholder: 'ابحث باسم الطبيب، الاختصاص، العيادة، أو المنطقة...',
      allSpecialties: 'كل الاختصاصات',
      allGovernorates: 'كل المحافظات',
      viewProfileBtn: 'عرض الملف',
      bookAppointmentBtn: 'احجز موعداً',
      availableToday: 'مواعيد متاحة',
      slotsAvailable: 'فترة متاحة',
      noSlotsAvailable: 'لا توجد أوقات شاغرة قريباً',
      feeUnit: 'د.ع',
      feeOnRequest: 'يُحدد عند الكشف',
      noDoctorsFound: 'لا يوجد أطباء معتمدون مطابقون للبحث حالياً.',
      profileBioTitle: 'نبذة الطبيب ومعلومات العيادة',
      availableSlotsTitle: 'المواعيد المتاحة للحجز الفوري',
      bookNowTitle: 'تأكيد حجز الموعد',
      signInRequiredToBook: 'سجّل الدخول بحسابك لتأكيد الحجز ومنع التعارض في الموعد.',
      bookingSuccess: 'تم تسجيل حجزك بنجاح والتحقق من عدم تعارض الموعد.',
      bookingConflict: 'عذراً، هذا الموعد محجوز للتو. اختر توقيتاً آخر متاحاً.',
      confirmBookingBtn: 'تأكيد الحجز الآن',
    },
  },
  en: {
    brandTitle: 'MEDORA DOCTOR',
    brandSubtitle: 'Integrated Clinical Physician Portal',
    backToHome: 'Back to MEDORA',
    notApprovedTitle: 'Physician Account Pending Administrative Approval',
    notApprovedBody:
      'The full MEDORA DOCTOR workspace opens automatically once Super Admin approves your physician registration request.',
    checkStatusBtn: 'View Request Status',
    loadingWorkspace: 'Loading MEDORA DOCTOR workspace...',
    refreshBtn: 'Refresh',
    nav: {
      overview: 'Overview',
      appointments: 'Appointments',
      patients: 'Patients & EHR',
      prescriptions: 'Prescriptions',
      diagnostics: 'Labs & Imaging',
      pharmacy_orders: 'Pharmacy Supply Orders',
      messages: 'Messages',
      clinic_staff: 'Clinic & Secretary Management',
      reports: 'Reports',
      promotional_banner: 'My Promotional Banner',
      settings: 'Profile & Settings',
    },
    days: {
      sat: 'Saturday',
      sun: 'Sunday',
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
    },
    appointmentStatuses: {
      pending: 'Pending',
      confirmed: 'Confirmed',
      checked_in: 'Checked In',
      completed: 'Completed',
      cancelled: 'Cancelled',
      rejected: 'Rejected',
      no_show: 'No Show',
    },
    diagnosticStatuses: {
      ordered: 'Ordered',
      in_progress: 'In Progress',
      results_received: 'Results Received',
      reviewed: 'Reviewed',
    },
    permissions: {
      viewAppointments: 'View Appointments',
      manageAppointments: 'Confirm / Edit / Cancel Bookings',
      manageWaitlist: 'Manage Waitlist',
      viewPatientBasic: 'View Basic Patient Info',
      viewMedicalRecords: 'Access Medical Records & Diagnoses',
      uploadLabResults: 'Upload Lab & Imaging Results',
      messagePatients: 'Message Patients',
      editClinicSchedule: 'Edit Clinic Schedule',
    },
    overview: {
      welcomePrefix: 'Dr.',
      accountStatusLabel: 'Account Status',
      clinicLabel: 'Clinic',
      todayBookings: "Today's Bookings",
      waitingPatients: 'Waiting Patients',
      unreadMessages: 'Unread Messages',
      recentResults: 'Diagnostic Results',
      upcomingTitle: 'Upcoming Appointments',
      noUpcoming: 'No upcoming appointments scheduled yet.',
      latestDiagnosticsTitle: 'Latest Received Lab & Imaging Results',
      noDiagnostics: 'No results received yet.',
      alertsTitle: 'Alerts & Important Notifications',
      quickShortcuts: 'Quick Shortcuts',
      addPatientShortcut: 'Add Patient',
      newRxShortcut: 'New Prescription',
      newOrderShortcut: 'Lab / Imaging Order',
      newLabOrderShortcut: 'New Lab Order',
      newImagingOrderClosedShortcut: 'Imaging Order (Temporarily Closed)',
      promoBannerShortcut: 'Promotional Banner',
      pendingConfirmationsAlert: 'appointments awaiting confirmation',
      pendingStaffAlert: 'secretary join requests awaiting approval',
      unreadMessagesAlert: 'unread patient messages',
      noBannerAlert: 'Upload your promotional banner so patients see it in the directory',
    },
    appointments: {
      title: 'Appointments & Booking Management',
      viewDay: 'Day',
      viewWeek: 'Week',
      viewMonth: 'Month',
      viewWaitlist: 'Waitlist',
      viewSchedule: 'Hours & Holidays',
      newBookingBtn: 'New Booking',
      patientName: 'Patient Name',
      patientPhone: 'Phone Number',
      selectPatientOpt: 'Select registered patient (optional)',
      dateLabel: 'Date',
      timeLabel: 'Time',
      visitTypeLabel: 'Visit Type',
      visitTypes: { scheduled: 'Scheduled', walk_in: 'Walk-in', follow_up: 'Follow-up' },
      reasonLabel: 'Visit Reason',
      waitlistToggle: 'Add to Waiting List',
      saveBookingBtn: 'Create Booking',
      confirmBtn: 'Confirm / Accept',
      rejectBtn: 'Reject',
      cancelBtn: 'Cancel',
      rescheduleBtn: 'Reschedule',
      checkInBtn: 'Check In',
      completeBtn: 'Complete',
      noShowBtn: 'No Show',
      rescheduleTitle: 'Reschedule Appointment',
      newDate: 'New Date',
      newTime: 'New Time',
      noAppointments: 'No appointments in this view.',
      slotTakenError: 'This slot is already booked or has reached maximum capacity.',
      scheduleTitle: 'Working Hours, Breaks & Holidays',
      durationLabel: 'Consultation Duration (min)',
      capacityLabel: 'Max Patients per Slot',
      holidaysLabel: 'Holiday / Closed Dates',
      addHolidayPlaceholder: 'Pick holiday date',
      addHolidayBtn: 'Add Holiday',
      saveScheduleBtn: 'Save Schedule',
      workingHoursStart: 'Start',
      workingHoursEnd: 'End',
      breakStart: 'Break Start',
      breakEnd: 'Break End',
      savedNotice: 'Schedule updated successfully.',
    },
    patients: {
      title: 'Patients & Electronic Medical Records',
      searchPlaceholder: 'Search by name, phone, or file number...',
      addPatientBtn: 'Register Patient',
      fileNumber: 'File #',
      phone: 'Phone',
      dob: 'Date of Birth',
      gender: 'Gender',
      male: 'Male',
      female: 'Female',
      bloodType: 'Blood Type',
      allergies: 'Allergies',
      chronicConditions: 'Chronic Conditions',
      address: 'Address',
      visitsTab: 'Visits & Notes',
      rxTab: 'Prescriptions',
      diagnosticsTab: 'Labs & Imaging',
      filesTab: 'Uploaded Files',
      addVisitBtn: 'Add Visit & Clinical Note',
      addVisitTopBtn: 'Add New Visit',
      selectPatientRequired: 'Select Patient',
      patientSummaryTitle: 'Patient Summary',
      visitDate: 'Visit Date',
      visitTime: 'Visit Time',
      visitReason: 'Visit Reason',
      chiefComplaint: 'Chief Complaint',
      diagnosis: 'Diagnosis',
      clinicalNotes: 'Clinical Notes',
      procedures: 'Procedures / Examinations',
      treatmentRecommendations: 'Treatment Plan & Recommendations',
      inlineRxToggle: 'Create Linked Prescription With This Visit (Optional)',
      attachHint: 'Supports mobile photos (JPG/PNG/WebP/HEIC) & PDFs up to 5 MB',
      vitalsTitle: 'Vitals',
      bp: 'BP',
      temp: 'Temp',
      hr: 'HR',
      weight: 'Weight (kg)',
      attachFiles: 'Attach medical images or PDFs',
      saveVisitBtn: 'Save Visit Record',
      noPatients: 'No registered patients yet.',
      noVisits: 'No visits recorded for this patient yet.',
      selectPatientPrompt: 'Select a patient from the list to view their medical record.',
      restrictedRecordsNotice: 'Full medical diagnoses require explicit physician permission.',
      totalVisits: 'Visits',
      visitDetailsTitle: 'Medical Visit Details',
      viewDetailsBtn: 'View Details',
      printBtn: 'Print',
      downloadPdfBtn: 'Download PDF',
      printRecordBtn: 'Print Medical Record',
      downloadRecordPdfBtn: 'Download Record PDF',
      exportingPdf: 'Preparing PDF...',
      visitSavedNotice: 'Medical visit saved to the patient record.',
    },
    prescriptions: {
      title: 'Electronic Prescriptions',
      newRxBtn: 'New Prescription',
      selectPatient: 'Select Patient',
      medicationsTitle: 'Prescribed Medications',
      addMedRow: 'Add Medication',
      drugName: 'Medication Name',
      dosage: 'Dosage',
      frequency: 'Frequency',
      duration: 'Duration',
      instructions: 'Usage Instructions',
      doctorNotes: 'Physician Notes',
      saveRxBtn: 'Save to Patient File',
      printPdfBtn: 'Print / Save PDF',
      printBtn: 'Print',
      downloadPdfBtn: 'Download PDF',
      exportingPdf: 'Preparing PDF...',
      previousRxTitle: 'Saved Prescriptions',
      noRx: 'No prescriptions issued yet.',
      rxSheetHeader: 'Official Medical Prescription',
      rxDate: 'Date',
      patientLabel: 'Patient',
      doctorLabel: 'Physician',
      specialtyLabel: 'Specialty',
      signatureLine: 'Physician Signature & Stamp',
    },
    diagnostics: {
      title: 'Labs & Diagnostic Imaging',
      imagingClosedTitle: 'Laboratory Diagnostics (Imaging Centers: Temporarily Closed)',
      newOrderBtn: 'New Diagnostic Order',
      filterAll: 'All',
      filterLab: 'Lab Tests',
      filterImaging: 'Imaging',
      orderTypeLab: 'Laboratory Order',
      orderTypeImaging: 'Imaging / Radiology Order',
      orderTypeImagingClosed: 'Imaging Order — Temporarily Closed',
      imagingClosedBadge: 'Temporarily Closed',
      imagingClosedNotice:
        'Imaging orders and imaging centers are temporarily closed until further notice — laboratory orders remain active.',
      selectPatient: 'Select Patient',
      facilityName: 'Lab / Imaging Center Name (optional)',
      facilityNameLabOnly: 'Laboratory Name (optional)',
      testsLabel: 'Requested Tests (comma-separated)',
      testsPlaceholder: 'e.g. CBC, HbA1c, Lipid Profile or Chest X-Ray',
      testsPlaceholderLabOnly: 'e.g. CBC, HbA1c, Lipid Profile',
      clinicalIndication: 'Clinical Indication',
      priorityRoutine: 'Routine',
      priorityUrgent: 'Urgent',
      saveOrderBtn: 'Submit Order',
      recordResultBtn: 'Attach / Update Result',
      resultSummary: 'Result Summary / Report',
      doctorNotes: 'Physician Notes on Result',
      uploadResultFiles: 'Upload Result Files (Images / PDF)',
      uploadResultFilesLabOnly: 'Upload Result Files (Images / PDF)',
      saveResultBtn: 'Save Result & Notes',
      orderedAt: 'Ordered At',
      receivedAt: 'Result Received',
      noOrders: 'No lab or imaging orders yet.',
      extensibleNote: 'Schema ready for direct linking with MEDORA Lab & Imaging portals.',
      extensibleNoteLabOnly:
        'Direct linking with MEDORA Lab portal active · Imaging portals & centers are temporarily closed.',
      printBtn: 'Print',
      downloadPdfBtn: 'Download PDF',
      exportingPdf: 'Preparing PDF...',
    },
    messages: {
      title: 'Patient Messages & Communication',
      newChatBtn: 'New Conversation',
      selectPatient: 'Select Patient',
      searchConversations: 'Search conversations...',
      noConversations: 'No conversations yet.',
      selectConversationPrompt: 'Select a conversation to view messages and attachments.',
      typeMessagePlaceholder: 'Write a message or clinical instruction...',
      sendBtn: 'Send',
      attachFileBtn: 'Attach image or file',
      unreadBadge: 'Unread',
    },
    clinicStaff: {
      title: 'Clinic & Secretary Management',
      clinicCardTitle: 'Single Clinic Profile',
      singleClinicNote: 'Each physician account in MEDORA manages one dedicated clinic.',
      clinicName: 'Clinic Name',
      governorate: 'Governorate',
      district: 'District',
      address: 'Full Address',
      phone: 'Clinic Contact Phone',
      mapUrl: 'Map Location URL',
      feeLabel: 'Consultation Fee',
      servicesLabel: 'Services (comma-separated)',
      workHoursLabel: 'Hours Summary',
      saveClinicBtn: 'Save Clinic Info',
      staffTitle: 'Secretaries & Clinic Staff',
      pendingRequestsTitle: 'Pending Join Requests',
      activeStaffTitle: 'Approved Staff & Permissions',
      noStaff: 'No secretary requests or active staff yet.',
      approveBtn: 'Approve & Add',
      rejectBtn: 'Reject',
      revokeBtn: 'Suspend Access',
      reactivateBtn: 'Reactivate',
      savePermissionsBtn: 'Update Permissions',
      auditLogTitle: 'Clinic & Staff Activity Log',
      noLogs: 'No activity recorded yet.',
    },
    reports: {
      title: 'Clinical Reports & Analytics',
      periodDay: 'Today',
      periodWeek: 'Last 7 Days',
      periodMonth: 'This Month',
      totalPatients: 'Total Patients',
      newPatients: 'New Patients',
      totalVisits: 'Total Visits',
      completedBookings: 'Completed Bookings',
      cancelledBookings: 'Cancelled Bookings',
      noShowBookings: 'No-Show Appointments',
      busiestDay: 'Busiest Day',
      revenueSummary: 'Recorded Revenue Summary',
      noRevenueData: 'No recorded fee revenue in this period',
      exportCsvBtn: 'Export CSV Report',
      printReportBtn: 'Print Report',
      downloadReportPdfBtn: 'Download PDF',
      exportingPdf: 'Preparing PDF...',
      noDataBanner: 'All statistics are computed strictly from real database records.',
      statusBreakdown: 'Appointment Status Breakdown',
      dayDistribution: 'Bookings by Day of Week',
    },
    promoBanner: {
      title: 'My Promotional Banner',
      subtitle:
        'Upload a large, crisp banner representing you or your clinic. Patients see this banner in the doctor directory and on your public profile before booking.',
      uploadBtn: 'Choose Promotional Image',
      replaceBtn: 'Replace Image',
      deleteBtn: 'Remove Banner',
      saveBtn: 'Save Promotional Banner',
      cancelPreviewBtn: 'Cancel Preview',
      taglineLabel: 'Short Headline for Patients',
      taglinePlaceholder: 'e.g. Consultant Cardiologist — Dedicated Patient Care',
      guidelinesTitle: 'Recommended Specifications',
      guidelinesBody:
        'Supported formats: JPG, PNG, WebP · Max size 5 MB · 16:9 or 4:3 landscape works best across mobile and desktop.',
      previewSectionTitle: 'Live Patient-Facing Preview',
      cardPreviewLabel: 'Doctor Card in Patient Directory',
      profilePreviewLabel: 'Public Doctor Page Before Booking',
      openPublicDirectoryBtn: 'Open Live Doctor Directory',
      uploadErrorPreserved: 'Could not upload new banner; your existing image was preserved safely.',
      savedSuccess: 'Promotional banner saved and linked to your profile.',
      deletedSuccess: 'Promotional banner deleted; default fallback visual restored.',
      noBannerFallbackTitle: 'MEDORA Verified Physician',
    },
    settings: {
      title: 'Profile & Settings',
      profileTab: 'Personal & Professional Info',
      notificationsTab: 'Notifications',
      appearanceTab: 'Language & Theme',
      securityTab: 'Privacy & Security',
      saveProfileBtn: 'Save Changes',
      updateAvatarBtn: 'Choose Profile Photo',
      avatarSectionTitle: 'Physician Profile Photo',
      avatarSpecsHint: 'Supports mobile photos (JPG / PNG / WebP / HEIC) with automatic compression · Displayed across portal, search, and patient cards.',
      previewReadyLabel: 'New photo preview ready — click "Save Profile Photo" to confirm',
      saveAvatarBtn: 'Save Profile Photo',
      replaceAvatarBtn: 'Change Photo',
      removeAvatarBtn: 'Remove Photo',
      cancelPreviewBtn: 'Cancel Preview',
      avatarSavedMsg: 'Profile photo saved and updated across all portals.',
      avatarRemovedMsg: 'Profile photo removed.',
      phoneLabel: 'Professional Phone',
      languagesLabel: 'Spoken Languages (comma-separated)',
      languageSelect: 'Interface Language',
      themeSelect: 'Display Theme',
      lightMode: 'Light Mode',
      darkMode: 'Dark Mode',
      privacyShowPhone: 'Display clinic phone on public physician page',
      privacyShowFee: 'Display consultation fee on directory card',
      privacyAllowMessages: 'Allow incoming in-app patient messages',
      securitySummary:
        'All physician data, medical files, and uploaded documents are protected by Firebase Authentication, server-side authorization, and clinic-isolated Firestore & Storage rules.',
    },
    directory: {
      title: 'MEDORA Verified Physicians Directory',
      subtitle: 'Browse approved physicians, inspect their profiles, and book real available slots.',
      backBtn: 'Back',
      searchPlaceholder: 'Search by physician name, specialty, clinic, or district...',
      allSpecialties: 'All Specialties',
      allGovernorates: 'All Governorates',
      viewProfileBtn: 'View Profile',
      bookAppointmentBtn: 'Book Appointment',
      availableToday: 'Slots Available',
      slotsAvailable: 'slots open',
      noSlotsAvailable: 'No open slots soon',
      feeUnit: 'IQD',
      feeOnRequest: 'Set at clinic',
      noDoctorsFound: 'No approved physicians match your search yet.',
      profileBioTitle: 'Physician & Clinic Overview',
      availableSlotsTitle: 'Available Appointment Slots',
      bookNowTitle: 'Confirm Appointment Booking',
      signInRequiredToBook: 'Sign in with your account to confirm booking and prevent slot conflicts.',
      bookingSuccess: 'Appointment booked successfully with database slot lock verification.',
      bookingConflict: 'Sorry, this time slot was just booked. Please select another slot.',
      confirmBookingBtn: 'Confirm Booking',
    },
  },
};
