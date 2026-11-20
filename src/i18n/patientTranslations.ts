import type { Language } from '../types/medora';
import type {
  FacilityBookingStatus,
  PatientFeedbackCategory,
  PatientFeedbackStatus,
  PatientMedicalFileCategory,
  PatientNotificationType,
  PatientSectionId,
} from '../types/patient';

export interface PatientCopy {
  brandTitle: string;
  loadingWorkspace: string;
  accessDeniedTitle: string;
  accessDeniedBody: string;
  completeRegistrationBtn: string;
  backToHome: string;
  refreshBtn: string;
  signOutBtn: string;
  nav: Record<PatientSectionId, string>;
  homeAds: {
    emptyTitle: string;
    emptySubtitle: string;
    bookNowDefault: string;
    viewDetailsBtn: string;
    unavailableBookingNote: string;
    prevAd: string;
    nextAd: string;
    clinicLabel: string;
    locationLabel: string;
    slideLabel: string;
    entityTypes: {
      doctor: string;
      lab: string;
    };
  };
  homeWorkspace: {
    searchPlaceholder: string;
    allGovernorates: string;
    clearSearch: string;
    resultsCountLabel: string;
    nearestSlotLabel: string;
    noNearestSlot: string;
    emptyCategorySearch: string;
    categories: {
      doctors: string;
      labs: string;
    };
  };
  doctorSearch: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    allGovernorates: string;
    allDistricts: string;
    allSpecialties: string;
    allGenders: string;
    maleDoctor: string;
    femaleDoctor: string;
    onlyAvailable: string;
    toggleFilters: string;
    resetFilters: string;
    noDoctors: string;
    reviewsHeading: string;
    noReviewsYet: string;
    addFavorite: string;
    removeFavorite: string;
    openMap: string;
    callClinic: string;
    verifiedReviewsCount: string;
  };
  appointments: {
    title: string;
    subtitle: string;
    upcomingTab: string;
    pastTab: string;
    noUpcoming: string;
    noPast: string;
    queueNumber: string;
    dateAndTime: string;
    reasonLabel: string;
    cancelBtn: string;
    rescheduleBtn: string;
    rateDoctorBtn: string;
    alreadyRated: string;
    cancelConfirmTitle: string;
    cancelReasonPlaceholder: string;
    confirmCancelBtn: string;
    rescheduleTitle: string;
    noRescheduleSlots: string;
    confirmRescheduleBtn: string;
    reviewTitle: string;
    ratingLabel: string;
    commentPlaceholder: string;
    submitReviewBtn: string;
    reviewSubmittedMsg: string;
    statuses: {
      pending: string;
      confirmed: string;
      completed: string;
      cancelled: string;
      no_show: string;
    };
  };
  favorites: {
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptySubtitle: string;
    browseDoctorsBtn: string;
  };
  medicalRecord: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    newestFirst: string;
    oldestFirst: string;
    tabs: {
      visits: string;
      prescriptions: string;
      diagnostics: string;
      files: string;
      sharing: string;
    };
    noVisits: string;
    noPrescriptions: string;
    noDiagnostics: string;
    noFiles: string;
    noShares: string;
    vitalsLabel: string;
    uploadTitle: string;
    fileTitleLabel: string;
    fileCategoryLabel: string;
    fileDateLabel: string;
    fileNotesLabel: string;
    chooseFileBtn: string;
    saveFileBtn: string;
    deleteFileBtn: string;
    categories: Record<PatientMedicalFileCategory, string>;
    shareTitle: string;
    selectDoctorLabel: string;
    permissionsLabel: string;
    permVisits: string;
    permPrescriptions: string;
    permDiagnostics: string;
    permUploadedFiles: string;
    expiryLabel: string;
    noExpiry: string;
    expiryDaysOption: string;
    grantShareBtn: string;
    revokeShareBtn: string;
    deleteShareBtn: string;
    revokedLabel: string;
    activeLabel: string;
    expiredLabel: string;
    shareUpdatedMsg: string;
    sourceClinic: string;
    sourcePortalBooking: string;
    openResultFile: string;
    printBtn: string;
    downloadPdfBtn: string;
    printRecordBtn: string;
    downloadRecordPdfBtn: string;
    exportingPdf: string;
    viewDetailsBtn: string;
    visitDetailsTitle: string;
    visitReasonLabel: string;
    proceduresLabel: string;
    treatmentLabel: string;
  };
  facilities: {
    labsTitle: string;
    labsSubtitle: string;
    searchPlaceholder: string;
    allGovernorates: string;
    noLabs: string;
    servicesHeading: string;
    workingHoursLabel: string;
    pricingLabel: string;
    prepLabel: string;
    bookServiceBtn: string;
    myBookingsTitle: string;
    noBookings: string;
    selectServicesLabel: string;
    dateLabel: string;
    timeLabel: string;
    notesLabel: string;
    confirmBookingBtn: string;
    cancelBookingBtn: string;
    resultsHeading: string;
    bookingSuccessMsg: string;
    noServicesAvailable: string;
    statuses: Record<FacilityBookingStatus, string>;
  };
  messages: {
    title: string;
    subtitle: string;
    newChatTitle: string;
    selectDoctorPlaceholder: string;
    startChatBtn: string;
    noConversations: string;
    selectConversationPrompt: string;
    messagePlaceholder: string;
    attachFileBtn: string;
    sendBtn: string;
    noDoctorsAccepting: string;
  };
  notifications: {
    title: string;
    subtitle: string;
    allFilter: string;
    markAllReadBtn: string;
    markReadBtn: string;
    noNotifications: string;
    types: Record<PatientNotificationType, string>;
  };
  feedback: {
    title: string;
    subtitle: string;
    formTitle: string;
    categoryLabel: string;
    relatedDoctorLabel: string;
    noDoctorOption: string;
    subjectLabel: string;
    messageLabel: string;
    submitBtn: string;
    historyTitle: string;
    noFeedback: string;
    adminReplyLabel: string;
    submittedMsg: string;
    categories: Record<PatientFeedbackCategory, string>;
    statuses: Record<PatientFeedbackStatus, string>;
  };
  settings: {
    title: string;
    subtitle: string;
    profileSection: string;
    avatarLabel: string;
    uploadAvatarBtn: string;
    previewReadyLabel: string;
    fullNameLabel: string;
    phoneLabel: string;
    dobLabel: string;
    genderLabel: string;
    governorateLabel: string;
    districtLabel: string;
    addressLabel: string;
    emergencySection: string;
    emergencyNameLabel: string;
    emergencyPhoneLabel: string;
    emergencyRelationLabel: string;
    appearanceSection: string;
    languageLabel: string;
    themeLabel: string;
    notificationsSection: string;
    notifAppointments: string;
    notifReminders24h: string;
    notifMessages: string;
    notifResults: string;
    notifAnnouncements: string;
    privacySection: string;
    allowDoctorSearchByPhone: string;
    defaultShareExpiryLabel: string;
    manageSharesBtn: string;
    saveBtn: string;
    savingBtn: string;
    savedMsg: string;
  };
}

export const PATIENT_TRANSLATIONS: Record<Language, PatientCopy> = {
  ar: {
    brandTitle: 'MEDORA PATIENT',
    loadingWorkspace: 'جاري تحميل بوابة المريض MEDORA PATIENT...',
    accessDeniedTitle: 'بوابة المريض غير مفعلة لهذا الحساب',
    accessDeniedBody:
      'يرجى استكمال تسجيل بوابة المريض والموافقة على الشروط للدخول إلى مساحتك الصحية.',
    completeRegistrationBtn: 'استكمال التسجيل أو متابعة الطلب',
    backToHome: 'العودة إلى البوابات',
    refreshBtn: 'تحديث',
    signOutBtn: 'تسجيل الخروج',
    nav: {
      home_ads: 'الصفحة الرئيسية والإعلانات',
      haneen_ai: 'اسأل حنين · حنين الذكية',
      doctor_search: 'البحث عن الأطباء',
      my_appointments: 'حجوزاتي',
      favorites: 'الأطباء المفضلون',
      medical_record: 'ملفي الطبي',
      medicine_finder: 'البحث عن الأدوية',
      labs: 'المختبرات',
      messages: 'الرسائل',
      notifications: 'الإشعارات',
      feedback: 'الشكاوى والملاحظات',
      settings: 'الإعدادات',
    },
    homeAds: {
      emptyTitle: 'لا توجد إعلانات طبية نشطة حالياً',
      emptySubtitle:
        'تظهر هنا الإعلانات المعتمدة من إدارة MEDORA فور نشرها. يمكنك البحث أدناه عن الأطباء والمختبرات وحجز موعدك مباشرة.',
      bookNowDefault: 'احجز الآن',
      viewDetailsBtn: 'عرض التفاصيل',
      unavailableBookingNote: 'غير متاح للحجز الإلكتروني حالياً — للعرض فقط',
      prevAd: 'الإعلان السابق',
      nextAd: 'الإعلان التالي',
      clinicLabel: 'العيادة',
      locationLabel: 'الموقع',
      slideLabel: 'إعلان',
      entityTypes: {
        doctor: 'طبيب',
        lab: 'مختبر طبي',
      },
    },
    homeWorkspace: {
      searchPlaceholder: 'ابحث عن طبيب، تخصص، مختبر، أو منطقة...',
      allGovernorates: 'كل المحافظات',
      clearSearch: 'مسح البحث',
      resultsCountLabel: 'جهة معتمدة',
      nearestSlotLabel: 'أقرب موعد متاح',
      noNearestSlot: 'لا توجد مواعيد قريبة متاحة',
      emptyCategorySearch: 'لا توجد جهات معتمدة مطابقة لبحثك في هذا القسم حالياً.',
      categories: {
        doctors: 'الأطباء',
        labs: 'المختبرات',
      },
    },
    doctorSearch: {
      title: 'البحث عن الأطباء وحجز المواعيد',
      subtitle:
        'تصفح الأطباء المعتمدين في العراق مع تصفية ذكية حسب التخصص والمحافظة والقضاء وتوفر المواعيد.',
      searchPlaceholder: 'ابحث باسم الطبيب، التخصص، العيادة، أو المنطقة...',
      allGovernorates: 'كل المحافظات',
      allDistricts: 'كل الأقضية',
      allSpecialties: 'كل التخصصات',
      allGenders: 'الكل (الطبيب والطبيبة)',
      maleDoctor: 'طبيب',
      femaleDoctor: 'طبيبة',
      onlyAvailable: 'المواعيد المتاحة فقط',
      toggleFilters: 'الفلاتر',
      resetFilters: 'إعادة تعيين',
      noDoctors: 'لا يوجد أطباء مطابقون لمعايير البحث الحالية.',
      reviewsHeading: 'تقييمات المرضى المعتمدة',
      noReviewsYet: 'لا توجد تقييمات منشورة بعد.',
      addFavorite: 'إضافة إلى المفضلة',
      removeFavorite: 'إزالة من المفضلة',
      openMap: 'فتح الموقع على الخريطة',
      callClinic: 'اتصال بالعيادة',
      verifiedReviewsCount: 'تقييم معتمد',
    },
    appointments: {
      title: 'حجوزاتي ومواعيد العيادات',
      subtitle: 'تابع مواعيدك القادمة والسابقة، رقم التسلسل اليومي، وإعادة الجدولة أو التقييم.',
      upcomingTab: 'المواعيد القادمة',
      pastTab: 'المواعيد السابقة',
      noUpcoming: 'لا توجد مواعيد قادمة مسجلة حالياً.',
      noPast: 'لا توجد مواعيد سابقة في سجلك.',
      queueNumber: 'رقم التسلسل',
      dateAndTime: 'الموعد',
      reasonLabel: 'السبب',
      cancelBtn: 'إلغاء الموعد',
      rescheduleBtn: 'إعادة جدولة',
      rateDoctorBtn: 'تقييم الطبيب',
      alreadyRated: 'تم التقييم',
      cancelConfirmTitle: 'تأكيد إلغاء الموعد',
      cancelReasonPlaceholder: 'سبب الإلغاء (اختياري)...',
      confirmCancelBtn: 'تأكيد الإلغاء',
      rescheduleTitle: 'اختيار موعد جديد متاح',
      noRescheduleSlots: 'لا توجد أوقات متاحة حالياً لإعادة الجدولة.',
      confirmRescheduleBtn: 'تثبيت الموعد الجديد',
      reviewTitle: 'تقييم الطبيب بعد الزيارة',
      ratingLabel: 'التقييم بالنجوم',
      commentPlaceholder: 'شارك تجربتك العلاجية بوضوح وموضوعية...',
      submitReviewBtn: 'إرسال التقييم للمراجعة',
      reviewSubmittedMsg: 'تم إرسال تقييمك بنجاح وهو بانتظار اعتماد الإدارة.',
      statuses: {
        pending: 'بانتظار التأكيد',
        confirmed: 'مؤكد',
        completed: 'مكتمل',
        cancelled: 'ملغي',
        no_show: 'لم يحضر',
      },
    },
    favorites: {
      title: 'الأطباء المفضلون',
      subtitle: 'وصول سريع إلى أطبائك المفضلين للحجز ومتابعة التوفر.',
      emptyTitle: 'لا يوجد أطباء في قائمة المفضلة بعد',
      emptySubtitle: 'أضف الأطباء الذين تتابع معهم عبر أيقونة النجمة في بطاقة الطبيب.',
      browseDoctorsBtn: 'الانتقال إلى البحث عن الأطباء',
    },
    medicalRecord: {
      title: 'ملفي الطبي الشامل',
      subtitle: 'الزيارات، الوصفات الطبية، نتائج الفحوصات، ملفاتك المرفوعة، وإدارة مشاركة السجل بموافقتك.',
      searchPlaceholder: 'ابحث بالتشخيص، الدواء، التحليل، أو اسم الملف...',
      newestFirst: 'الأحدث أولاً',
      oldestFirst: 'الأقدم أولاً',
      tabs: {
        visits: 'الزيارات',
        prescriptions: 'الوصفات الطبية',
        diagnostics: 'التحاليل والأشعة',
        files: 'ملفاتي المرفوعة',
        sharing: 'المشاركة والموافقات',
      },
      noVisits: 'لا توجد زيارات مسجلة أو مطابقة للبحث.',
      noPrescriptions: 'لا توجد وصفات طبية مسجلة.',
      noDiagnostics: 'لا توجد طلبات أو نتائج تحاليل وأشعة.',
      noFiles: 'لم تقم برفع أي ملفات طبية شخصية بعد.',
      noShares: 'لم تمنح صلاحية الوصول لسجلك لأي طبيب بعد.',
      vitalsLabel: 'العلامات الحيوية',
      uploadTitle: 'رفع ملف طبي جديد (PDF أو صورة)',
      fileTitleLabel: 'عنوان الملف',
      fileCategoryLabel: 'التصنيف',
      fileDateLabel: 'تاريخ المستند',
      fileNotesLabel: 'ملاحظات (اختياري)',
      chooseFileBtn: 'اختيار الملف',
      saveFileBtn: 'حفظ في ملفي الطبي',
      deleteFileBtn: 'حذف الملف',
      categories: {
        visit: 'تقرير زيارة',
        lab: 'تحليل مختبري',
        imaging: 'تقرير أشعة',
        prescription: 'وصفة طبية',
        other: 'مستند طبي آخر',
      },
      shareTitle: 'منح أو تعديل موافقة مشاركة السجل مع طبيب',
      selectDoctorLabel: 'اختر الطبيب المعتمد',
      permissionsLabel: 'نطاق البيانات المصرح بمشاركتها',
      permVisits: 'ملخص الزيارات والتشخيصات',
      permPrescriptions: 'الوصفات الطبية والأدوية',
      permDiagnostics: 'نتائج المختبر والأشعة',
      permUploadedFiles: 'الملفات الطبية التي قمت برفعها',
      expiryLabel: 'مدة الصلاحية',
      noExpiry: 'مفتوحة حتى الإلغاء',
      expiryDaysOption: 'يوم',
      grantShareBtn: 'منح موافقة المشاركة',
      revokeShareBtn: 'إلغاء الموافقة فوراً',
      deleteShareBtn: 'حذف السجل',
      revokedLabel: 'ملغاة',
      activeLabel: 'نشطة',
      expiredLabel: 'منتهية الصلاحية',
      shareUpdatedMsg: 'تم تحديث صلاحية المشاركة بنجاح.',
      sourceClinic: 'طلب عيادة الطبيب',
      sourcePortalBooking: 'حجز من بوابة المريض',
      openResultFile: 'عرض النتيجة / الملف',
      printBtn: 'طباعة',
      downloadPdfBtn: 'تحميل PDF',
      printRecordBtn: 'طباعة السجل الطبي',
      downloadRecordPdfBtn: 'تحميل السجل PDF',
      exportingPdf: 'جاري تجهيز PDF...',
      viewDetailsBtn: 'عرض التفاصيل',
      visitDetailsTitle: 'تفاصيل الزيارة الطبية',
      visitReasonLabel: 'سبب الزيارة',
      proceduresLabel: 'الإجراءات والفحوصات',
      treatmentLabel: 'التوصيات وخطة العلاج',
    },
    facilities: {
      labsTitle: 'المختبرات الطبية المعتمدة',
      labsSubtitle: 'تصفح المختبرات الفعالة في العراق، احجز فحوصاتك، واستلم النتائج إلكترونياً.',
      searchPlaceholder: 'ابحث باسم المؤسسة، الخدمة، أو العنوان...',
      allGovernorates: 'كل المحافظات',
      noLabs: 'لا توجد مختبرات معتمدة متاحة حالياً.',
      servicesHeading: 'الخدمات المتوفرة',
      workingHoursLabel: 'أوقات الدوام',
      pricingLabel: 'الأسعار',
      prepLabel: 'تعليمات التحضير',
      bookServiceBtn: 'حجز فحص / موعد',
      myBookingsTitle: 'حجوزاتي ونتائجي الإلكترونية',
      noBookings: 'لا توجد حجوزات مسجلة في هذا القسم بعد.',
      selectServicesLabel: 'اختر الفحوصات المطلوبة',
      dateLabel: 'التاريخ المطلوب',
      timeLabel: 'الوقت',
      notesLabel: 'ملاحظات إضافية (اختياري)',
      confirmBookingBtn: 'تأكيد الحجز',
      cancelBookingBtn: 'إلغاء الحجز',
      resultsHeading: 'النتائج والتقارير الإلكترونية',
      bookingSuccessMsg: 'تم تسجيل الحجز بنجاح وحفظه في قائمتك.',
      noServicesAvailable: 'لا توجد خدمات متاحة للحجز الإلكتروني حالياً في هذه الجهة.',
      statuses: {
        pending: 'بانتظار التأكيد',
        confirmed: 'مؤكد',
        in_progress: 'قيد الفحص',
        completed: 'مكتمل',
        cancelled: 'ملغي',
        rejected: 'مرفوض',
      },
    },
    messages: {
      title: 'الرسائل والتواصل مع العيادات',
      subtitle: 'تواصل مباشرة مع الأطباء والعيادات مع دعم إرسال التقارير والصور الطبية.',
      newChatTitle: 'بدء محادثة جديدة مع طبيب',
      selectDoctorPlaceholder: 'اختر طبيباً معتمداً...',
      startChatBtn: 'فتح المحادثة',
      noConversations: 'لا توجد محادثات طبية بعد.',
      selectConversationPrompt: 'اختر محادثة من القائمة أو ابدأ محادثة جديدة مع طبيب.',
      messagePlaceholder: 'اكتب رسالتك للعيادة...',
      attachFileBtn: 'إرفاق ملف',
      sendBtn: 'إرسال',
      noDoctorsAccepting: 'لا يوجد أطباء متاحون لاستقبال الرسائل حالياً.',
    },
    notifications: {
      title: 'الإشعارات والتنبيهات الصحية',
      subtitle: 'تنبيهات تأكيد وإلغاء المواعيد، التذكير قبل 24 ساعة، الرسائل، ونتائج الفحوصات.',
      allFilter: 'الكل',
      markAllReadBtn: 'تعليم الكل كمقروء',
      markReadBtn: 'تمت القراءة',
      noNotifications: 'لا توجد إشعارات مطابقة.',
      types: {
        appointment: 'المواعيد',
        reminder: 'تذكير موعد',
        message: 'رسالة جديدة',
        lab_result: 'نتيجة مختبر',
        imaging_result: 'نتيجة أشعة',
        announcement: 'إعلان / تنبيه',
      },
    },
    feedback: {
      title: 'الشكاوى والملاحظات',
      subtitle: 'أرسل ملاحظاتك أو شكواك مباشرة إلى الإدارة العليا لمتابعتها والرد عليها.',
      formTitle: 'تقديم شكوى أو ملاحظة جديدة',
      categoryLabel: 'نوع الطلب',
      relatedDoctorLabel: 'الطبيب المعني (اختياري)',
      noDoctorOption: 'ملاحظة عامة للمنصة',
      subjectLabel: 'الموضوع',
      messageLabel: 'التفاصيل',
      submitBtn: 'إرسال إلى الإدارة',
      historyTitle: 'سجل الشكاوى والملاحظات السابقة',
      noFeedback: 'لم ترسل أي شكاوى أو ملاحظات بعد.',
      adminReplyLabel: 'رد الإدارة العليا',
      submittedMsg: 'تم إرسال رسالتك إلى الإدارة العليا بنجاح.',
      categories: {
        complaint: 'شكوى',
        note: 'ملاحظة',
        booking_issue: 'مشكلة في الحجز',
        technical: 'مشكلة تقنية',
        suggestion: 'اقتراح تطوير',
      },
      statuses: {
        new: 'جديدة',
        in_review: 'قيد المراجعة',
        resolved: 'تم الحل',
        closed: 'مغلقة',
      },
    },
    settings: {
      title: 'إعدادات حساب المريض والخصوصية',
      subtitle: 'تحديث بياناتك الشخصية، تفضيلات الإشعارات، وإعدادات مشاركة السجل الطبي.',
      profileSection: 'البيانات الشخصية وجهة الطوارئ',
      avatarLabel: 'الصورة الشخصية',
      uploadAvatarBtn: 'تغيير الصورة',
      previewReadyLabel: 'معاينة الصورة جاهزة — اضغط «حفظ التغييرات» لتثبيتها',
      fullNameLabel: 'الاسم الكامل',
      phoneLabel: 'رقم الهاتف',
      dobLabel: 'تاريخ الميلاد',
      genderLabel: 'الجنس',
      governorateLabel: 'المحافظة',
      districtLabel: 'القضاء',
      addressLabel: 'العنوان',
      emergencySection: 'جهة اتصال الطوارئ',
      emergencyNameLabel: 'الاسم',
      emergencyPhoneLabel: 'رقم الهاتف',
      emergencyRelationLabel: 'صلة القرابة',
      appearanceSection: 'اللغة والمظهر',
      languageLabel: 'لغة الواجهة',
      themeLabel: 'مظهر الشاشة',
      notificationsSection: 'تفضيلات الإشعارات',
      notifAppointments: 'تحديثات وتأكيدات المواعيد',
      notifReminders24h: 'تذكير قبل الموعد بـ 24 ساعة',
      notifMessages: 'رسائل الأطباء والعيادات',
      notifResults: 'صدور نتائج التحاليل والأشعة',
      notifAnnouncements: 'التنبيهات والإعلانات الصحية المهمة',
      privacySection: 'الخصوصية وصلاحيات المشاركة',
      allowDoctorSearchByPhone: 'السماح للعيادة بالوصول للملف عند الحجز برقم الهاتف',
      defaultShareExpiryLabel: 'المدة الافتراضية لمشاركة السجل الطبي',
      manageSharesBtn: 'إدارة الموافقات النشطة في ملفي الطبي',
      saveBtn: 'حفظ التغييرات',
      savingBtn: 'جاري الحفظ...',
      savedMsg: 'تم حفظ إعدادات حساب المريض بنجاح.',
    },
  },
  en: {
    brandTitle: 'MEDORA PATIENT',
    loadingWorkspace: 'Loading MEDORA PATIENT workspace...',
    accessDeniedTitle: 'Patient Portal Is Not Active',
    accessDeniedBody:
      'Please complete Patient Portal registration and policy acceptance to access your health workspace.',
    completeRegistrationBtn: 'Complete Registration or Check Status',
    backToHome: 'Back to Portals',
    refreshBtn: 'Refresh',
    signOutBtn: 'Sign Out',
    nav: {
      home_ads: 'Home & Ads',
      haneen_ai: 'Ask Haneen · HANEEN AI',
      doctor_search: 'Find Doctors',
      my_appointments: 'My Appointments',
      favorites: 'Favorite Doctors',
      medical_record: 'My Medical Record',
      medicine_finder: 'Medicine Finder',
      labs: 'Laboratories',
      messages: 'Messages',
      notifications: 'Notifications',
      feedback: 'Complaints & Feedback',
      settings: 'Settings',
    },
    homeAds: {
      emptyTitle: 'No Active Medical Ads Right Now',
      emptySubtitle:
        'Approved promotions curated by MEDORA Super Admin appear here. Use the search and categories below to find doctors and labs.',
      bookNowDefault: 'Book Now',
      viewDetailsBtn: 'View Details',
      unavailableBookingNote: 'Currently unavailable for online booking',
      prevAd: 'Previous ad',
      nextAd: 'Next ad',
      clinicLabel: 'Clinic',
      locationLabel: 'Location',
      slideLabel: 'Ad',
      entityTypes: {
        doctor: 'Doctor',
        lab: 'Medical Lab',
      },
    },
    homeWorkspace: {
      searchPlaceholder: 'Search doctor, specialty, lab, or area...',
      allGovernorates: 'All Governorates',
      clearSearch: 'Clear',
      resultsCountLabel: 'approved providers',
      nearestSlotLabel: 'Nearest slot',
      noNearestSlot: 'No upcoming slots',
      emptyCategorySearch: 'No approved providers match your search in this category.',
      categories: {
        doctors: 'Doctors',
        labs: 'Laboratories',
      },
    },
    doctorSearch: {
      title: 'Find Approved Physicians & Book',
      subtitle:
        'Browse approved doctors in Iraq and filter by specialty, governorate, district, gender, and slot availability.',
      searchPlaceholder: 'Search doctor name, specialty, clinic, or area...',
      allGovernorates: 'All Governorates',
      allDistricts: 'All Districts',
      allSpecialties: 'All Specialties',
      allGenders: 'All Doctors',
      maleDoctor: 'Male Doctor',
      femaleDoctor: 'Female Doctor',
      onlyAvailable: 'Available slots only',
      toggleFilters: 'Filters',
      resetFilters: 'Reset',
      noDoctors: 'No doctors match your current filters.',
      reviewsHeading: 'Approved Patient Reviews',
      noReviewsYet: 'No published reviews yet.',
      addFavorite: 'Add to favorites',
      removeFavorite: 'Remove from favorites',
      openMap: 'Open Location on Map',
      callClinic: 'Call Clinic',
      verifiedReviewsCount: 'verified reviews',
    },
    appointments: {
      title: 'My Clinic Appointments',
      subtitle: 'Track upcoming and past visits, daily queue numbers, rescheduling, and post-visit reviews.',
      upcomingTab: 'Upcoming',
      pastTab: 'Past Appointments',
      noUpcoming: 'No upcoming appointments scheduled.',
      noPast: 'No past appointments recorded yet.',
      queueNumber: 'Queue #',
      dateAndTime: 'Schedule',
      reasonLabel: 'Reason',
      cancelBtn: 'Cancel Appointment',
      rescheduleBtn: 'Reschedule',
      rateDoctorBtn: 'Rate Doctor',
      alreadyRated: 'Reviewed',
      cancelConfirmTitle: 'Confirm Appointment Cancellation',
      cancelReasonPlaceholder: 'Cancellation reason (optional)...',
      confirmCancelBtn: 'Confirm Cancel',
      rescheduleTitle: 'Select a New Available Slot',
      noRescheduleSlots: 'No open slots currently available for rescheduling.',
      confirmRescheduleBtn: 'Confirm New Slot',
      reviewTitle: 'Rate Your Completed Visit',
      ratingLabel: 'Star Rating',
      commentPlaceholder: 'Share helpful, honest feedback about your consultation...',
      submitReviewBtn: 'Submit Review for Moderation',
      reviewSubmittedMsg: 'Your review was submitted and is awaiting admin moderation.',
      statuses: {
        pending: 'Pending',
        confirmed: 'Confirmed',
        completed: 'Completed',
        cancelled: 'Cancelled',
        no_show: 'No Show',
      },
    },
    favorites: {
      title: 'Favorite Doctors',
      subtitle: 'Quick access to your bookmarked physicians and clinics.',
      emptyTitle: 'No Favorite Doctors Saved Yet',
      emptySubtitle: 'Tap the star icon on any doctor card to keep them here.',
      browseDoctorsBtn: 'Browse Doctors',
    },
    medicalRecord: {
      title: 'My Medical Record',
      subtitle: 'Clinical visits, prescriptions, lab & imaging results, personal uploads, and consent-based sharing.',
      searchPlaceholder: 'Search diagnosis, medication, test, or filename...',
      newestFirst: 'Newest first',
      oldestFirst: 'Oldest first',
      tabs: {
        visits: 'Visits',
        prescriptions: 'Prescriptions',
        diagnostics: 'Labs & Imaging',
        files: 'My Files',
        sharing: 'Sharing & Consents',
      },
      noVisits: 'No matching visit summaries found.',
      noPrescriptions: 'No prescriptions recorded yet.',
      noDiagnostics: 'No diagnostic tests or results found.',
      noFiles: 'No personal medical files uploaded yet.',
      noShares: 'You have not granted medical record access to any doctor yet.',
      vitalsLabel: 'Vitals',
      uploadTitle: 'Upload Personal Medical File (PDF or Image)',
      fileTitleLabel: 'Document Title',
      fileCategoryLabel: 'Category',
      fileDateLabel: 'Document Date',
      fileNotesLabel: 'Notes (optional)',
      chooseFileBtn: 'Select File',
      saveFileBtn: 'Save to Medical Record',
      deleteFileBtn: 'Delete File',
      categories: {
        visit: 'Visit Report',
        lab: 'Lab Report',
        imaging: 'Imaging Report',
        prescription: 'Prescription',
        other: 'Other Document',
      },
      shareTitle: 'Grant Consent to Share Medical Record With a Doctor',
      selectDoctorLabel: 'Select Approved Doctor',
      permissionsLabel: 'Allowed Record Sections',
      permVisits: 'Visit summaries & diagnoses',
      permPrescriptions: 'Prescriptions & medications',
      permDiagnostics: 'Lab & imaging results',
      permUploadedFiles: 'Patient-uploaded medical files',
      expiryLabel: 'Consent Duration',
      noExpiry: 'Active until revoked',
      expiryDaysOption: 'days',
      grantShareBtn: 'Grant Consent',
      revokeShareBtn: 'Revoke Immediately',
      deleteShareBtn: 'Delete Record',
      revokedLabel: 'Revoked',
      activeLabel: 'Active',
      expiredLabel: 'Expired',
      shareUpdatedMsg: 'Sharing consent updated successfully.',
      sourceClinic: 'Doctor Clinic Order',
      sourcePortalBooking: 'Patient Portal Booking',
      openResultFile: 'Open Result / File',
      printBtn: 'Print',
      downloadPdfBtn: 'Download PDF',
      printRecordBtn: 'Print Medical Record',
      downloadRecordPdfBtn: 'Download Record PDF',
      exportingPdf: 'Preparing PDF...',
      viewDetailsBtn: 'View Details',
      visitDetailsTitle: 'Medical Visit Details',
      visitReasonLabel: 'Visit Reason',
      proceduresLabel: 'Procedures & Exams',
      treatmentLabel: 'Treatment Recommendations',
    },
    facilities: {
      labsTitle: 'Approved Medical Laboratories',
      labsSubtitle: 'Browse active licensed labs across Iraq, book tests, and access electronic results.',
      searchPlaceholder: 'Search facility name, test/modality, or address...',
      allGovernorates: 'All Governorates',
      noLabs: 'No approved active laboratories available right now.',
      servicesHeading: 'Available Services',
      workingHoursLabel: 'Hours',
      pricingLabel: 'Pricing',
      prepLabel: 'Preparation',
      bookServiceBtn: 'Book Appointment',
      myBookingsTitle: 'My Bookings & Electronic Results',
      noBookings: 'No bookings found in this section yet.',
      selectServicesLabel: 'Select Requested Tests / Services',
      dateLabel: 'Preferred Date',
      timeLabel: 'Preferred Time',
      notesLabel: 'Notes (optional)',
      confirmBookingBtn: 'Confirm Booking',
      cancelBookingBtn: 'Cancel Booking',
      resultsHeading: 'Electronic Results & Reports',
      bookingSuccessMsg: 'Booking confirmed and saved to your account.',
      noServicesAvailable: 'No online booking services are currently available for this facility.',
      statuses: {
        pending: 'Pending',
        confirmed: 'Confirmed',
        in_progress: 'In Progress',
        completed: 'Completed',
        cancelled: 'Cancelled',
        rejected: 'Rejected',
      },
    },
    messages: {
      title: 'Messages & Clinic Communication',
      subtitle: 'Chat directly with doctors and clinics, including medical files and images.',
      newChatTitle: 'Start New Conversation',
      selectDoctorPlaceholder: 'Select an approved doctor...',
      startChatBtn: 'Open Thread',
      noConversations: 'No conversations yet.',
      selectConversationPrompt: 'Choose an existing conversation or start a new one with a doctor.',
      messagePlaceholder: 'Write a message to the clinic...',
      attachFileBtn: 'Attach File',
      sendBtn: 'Send',
      noDoctorsAccepting: 'No doctors are currently accepting direct messages.',
    },
    notifications: {
      title: 'Health & Booking Notifications',
      subtitle: 'Booking confirmations, 24h reminders, clinic messages, and diagnostic result updates.',
      allFilter: 'All',
      markAllReadBtn: 'Mark All Read',
      markReadBtn: 'Mark Read',
      noNotifications: 'No matching notifications.',
      types: {
        appointment: 'Appointments',
        reminder: 'Reminders',
        message: 'Messages',
        lab_result: 'Lab Results',
        imaging_result: 'Imaging Results',
        announcement: 'Announcements',
      },
    },
    feedback: {
      title: 'Complaints & Feedback',
      subtitle: 'Send complaints, booking issues, or suggestions directly to MEDORA Super Admin.',
      formTitle: 'Submit New Feedback or Complaint',
      categoryLabel: 'Category',
      relatedDoctorLabel: 'Related Doctor (optional)',
      noDoctorOption: 'General Platform Feedback',
      subjectLabel: 'Subject',
      messageLabel: 'Details',
      submitBtn: 'Submit to Super Admin',
      historyTitle: 'Submitted Feedback History',
      noFeedback: 'You have not submitted any complaints or feedback yet.',
      adminReplyLabel: 'Super Admin Reply',
      submittedMsg: 'Your message was sent to Super Admin.',
      categories: {
        complaint: 'Complaint',
        note: 'Note',
        booking_issue: 'Booking Issue',
        technical: 'Technical Issue',
        suggestion: 'Suggestion',
      },
      statuses: {
        new: 'New',
        in_review: 'In Review',
        resolved: 'Resolved',
        closed: 'Closed',
      },
    },
    settings: {
      title: 'Patient Account & Privacy Settings',
      subtitle: 'Manage personal details, notification preferences, and medical sharing defaults.',
      profileSection: 'Personal Details & Emergency Contact',
      avatarLabel: 'Profile Photo',
      uploadAvatarBtn: 'Change Photo',
      previewReadyLabel: 'Preview ready — click "Save Settings" to apply',
      fullNameLabel: 'Full Name',
      phoneLabel: 'Phone Number',
      dobLabel: 'Date of Birth',
      genderLabel: 'Gender',
      governorateLabel: 'Governorate',
      districtLabel: 'District',
      addressLabel: 'Address',
      emergencySection: 'Emergency Contact',
      emergencyNameLabel: 'Contact Name',
      emergencyPhoneLabel: 'Emergency Phone',
      emergencyRelationLabel: 'Relationship',
      appearanceSection: 'Language & Appearance',
      languageLabel: 'Interface Language',
      themeLabel: 'Display Theme',
      notificationsSection: 'Notification Preferences',
      notifAppointments: 'Appointment confirmations & updates',
      notifReminders24h: '24-hour pre-visit reminders',
      notifMessages: 'Messages from doctors & clinics',
      notifResults: 'Lab & imaging result alerts',
      notifAnnouncements: 'Important announcements',
      privacySection: 'Privacy & Record Sharing',
      allowDoctorSearchByPhone: 'Allow clinic file matching on phone-based booking',
      defaultShareExpiryLabel: 'Default consent sharing expiry',
      manageSharesBtn: 'Manage Active Shares in My Medical Record',
      saveBtn: 'Save Settings',
      savingBtn: 'Saving...',
      savedMsg: 'Patient settings saved successfully.',
    },
  },
};
