import type { LabPermissionKey, LabSectionId } from '../types/lab';

export interface LabTranslations {
  portalTitle: string;
  portalSubtitle: string;
  backToMedora: string;
  refreshWorkspace: string;
  signOut: string;
  managerBadge: string;
  staffBadge: string;
  noPermissionTitle: string;
  noPermissionBody: string;
  nav: Record<LabSectionId, string>;
  permissions: Record<LabPermissionKey, string>;
  status: {
    draft: string;
    pending_approval: string;
    approved: string;
    corrected: string;
    ordered: string;
    sample_collected: string;
    in_lab: string;
    result_entered: string;
    cancelled: string;
    collected: string;
    accepted: string;
    rejected: string;
    requested: string;
    assigned: string;
    en_route: string;
    completed: string;
    pending: string;
    confirmed: string;
    in_progress: string;
    unpaid: string;
    partial: string;
    paid: string;
    void: string;
    active: string;
    suspended: string;
    revoked: string;
    received: string;
  };
  sampleTypes: Record<string, string>;
  flags: Record<string, string>;
  paymentMethods: Record<string, string>;
  common: {
    save: string;
    saving: string;
    cancel: string;
    close: string;
    add: string;
    edit: string;
    search: string;
    all: string;
    iqd: string;
    print: string;
    downloadPdf: string;
    exportExcel: string;
    noData: string;
    actions: string;
    date: string;
    notes: string;
    phone: string;
    name: string;
    price: string;
    active: string;
    inactive: string;
    confirm: string;
  };
  overview: {
    title: string;
    subtitle: string;
    todayOrders: string;
    pendingApprovals: string;
    pendingBookings: string;
    todayRevenue: string;
    activePatients: string;
    lowStockCount: string;
    expiringCount: string;
    homeCollectionsPending: string;
    alertsTitle: string;
    recentOrders: string;
    recentAudit: string;
    quickActions: string;
  };
  patients: {
    title: string;
    addPatient: string;
    editPatient: string;
    fileNumber: string;
    fullName: string;
    phone: string;
    gender: string;
    age: string;
    dateOfBirth: string;
    address: string;
    allergies: string;
    chronicNotes: string;
    totalOrders: string;
    historyTitle: string;
  };
  catalog: {
    title: string;
    myTestsTab: string;
    centralTab: string;
    addCustomTest: string;
    adoptSelected: string;
    adoptedTag: string;
    code: string;
    nameAr: string;
    nameEn: string;
    category: string;
    sampleType: string;
    unit: string;
    referenceRange: string;
    prepInstructions: string;
    turnaroundHours: string;
    priceIqd: string;
  };
  ordersSamples: {
    title: string;
    tabOrders: string;
    tabSamples: string;
    tabHomeCollection: string;
    tabBookings: string;
    newOrder: string;
    selectPatient: string;
    priority: string;
    selectTests: string;
    applyOffer: string;
    discountIqd: string;
    homeFeeIqd: string;
    autoInvoice: string;
    consumeInventory: string;
    reverseInventory: string;
    inventoryConsumed: string;
    receiveSample: string;
    rejectionReason: string;
    newHomeCollection: string;
    assignStaff: string;
    staffPhone: string;
    convertToOrder: string;
    alreadyConverted: string;
  };
  results: {
    title: string;
    selectOrder: string;
    analytes: string;
    addAnalyte: string;
    testName: string;
    value: string;
    unit: string;
    refRange: string;
    flag: string;
    summaryNote: string;
    attachments: string;
    uploadFile: string;
    saveDraft: string;
    submitApproval: string;
    approveOnly: string;
    approvePublish: string;
    publishToPatient: string;
    correctApproved: string;
    correctionReason: string;
    revisionHistory: string;
    immutableNotice: string;
  };
  billing: {
    title: string;
    invoicesTab: string;
    paymentsTab: string;
    newInvoice: string;
    recordPayment: string;
    voidInvoice: string;
    invoiceNumber: string;
    receiptNumber: string;
    totalIqd: string;
    paidIqd: string;
    balanceIqd: string;
    method: string;
    referenceNote: string;
  };
  staff: {
    title: string;
    managerOnlyNotice: string;
    inviteStaff: string;
    email: string;
    roleTitle: string;
    permissions: string;
    suspend: string;
    reactivate: string;
    revoke: string;
  };
  inventory: {
    title: string;
    tabStock: string;
    tabRecipes: string;
    tabSuppliersPo: string;
    tabMovements: string;
    addItem: string;
    adjustStock: string;
    quantity: string;
    minThreshold: string;
    lotNumber: string;
    expiryDate: string;
    unitCostIqd: string;
    adjustDelta: string;
    adjustReason: string;
    saveRecipe: string;
    addSupplier: string;
    createPo: string;
    receivePo: string;
  };
  offers: {
    title: string;
    newOffer: string;
    offerType: string;
    singleDiscount: string;
    packageType: string;
    originalPrice: string;
    offerPrice: string;
    startDate: string;
    endDate: string;
    savings: string;
  };
  reviews: {
    title: string;
    avgRating: string;
    totalReviews: string;
    complaintsCount: string;
    writeReply: string;
    sendReply: string;
  };
  reports: {
    title: string;
    fromDate: string;
    toDate: string;
    ordersSummary: string;
    revenueSummary: string;
    topTests: string;
    inventoryHealth: string;
  };
  comms: {
    title: string;
    tabNotifications: string;
    tabPatientChat: string;
    tabAdminThread: string;
    markAllRead: string;
    startPatientChat: string;
    typeMessage: string;
    send: string;
    adminSubject: string;
    adminBody: string;
  };
  settings: {
    title: string;
    generalSection: string;
    bookingSection: string;
    licenseSection: string;
    deferredNoticeTitle: string;
    deferredNoticeBody: string;
    homeCollectionEnabled: string;
    homeCollectionFee: string;
    uploadAvatar: string;
    uploadLicense: string;
  };
}

export const labTranslations: Record<'ar' | 'en', LabTranslations> = {
  ar: {
    portalTitle: 'بوابة المختبرات',
    portalSubtitle: 'نظام إدارة المختبرات الطبية المتكامل',
    backToMedora: 'العودة إلى MEDORA',
    refreshWorkspace: 'تحديث البيانات',
    signOut: 'تسجيل الخروج',
    managerBadge: 'مدير المختبر',
    staffBadge: 'موظف مختبر',
    noPermissionTitle: 'صلاحية غير متوفرة',
    noPermissionBody: 'ليس لديك صلاحية للوصول إلى هذا القسم. تواصل مع مدير المختبر لتحديث صلاحياتك.',
    nav: {
      overview: 'لوحة التحكم والإحصائيات',
      patients: 'إدارة المرضى وملفاتهم',
      catalog_tests: 'التحاليل والكتالوج المركزي',
      orders_samples: 'الطلبات والعينات والحجوزات',
      results: 'إدخال واعتماد النتائج',
      billing: 'الفواتير والمدفوعات',
      staff: 'الموظفون والصلاحيات',
      secretaries: 'إدارة السكرتارية',
      inventory: 'المخزون والكواشف والموردون',
      offers: 'العروض والباقات',
      reviews: 'التقييمات والشكاوى',
      reports: 'التقارير والتصدير',
      communications: 'الإشعارات والمراسلات',
      settings: 'التراخيص وإعدادات المختبر',
    },
    permissions: {
      reception: 'الاستقبال وتسجيل المرضى',
      bookings: 'إدارة الحجوزات والسحب المنزلي',
      samples: 'استلام وفرز العينات',
      enterResults: 'إدخال نتائج التحاليل والمرفقات',
      approveResults: 'مراجعة واعتماد وتعديل النتائج',
      inventory: 'إدارة المخزون والوصفات والمشتريات',
      billing: 'الفواتير والقبض والإيصالات',
      reports: 'التقارير والإحصائيات والتصدير',
      messaging: 'المراسلات والرد على التقييمات',
    },
    status: {
      draft: 'مسودة',
      pending_approval: 'بانتظار الاعتماد',
      approved: 'معتمدة',
      corrected: 'معدّلة (موثقة)',
      ordered: 'تم الطلب',
      sample_collected: 'تم جمع العينة',
      in_lab: 'قيد التحليل',
      result_entered: 'تم إدخال النتيجة',
      cancelled: 'ملغي',
      collected: 'مستلمة',
      accepted: 'مقبولة للتحليل',
      rejected: 'مرفوضة',
      requested: 'طلب جديد',
      assigned: 'تم تعيين فني',
      en_route: 'الفني في الطريق',
      completed: 'مكتمل',
      pending: 'قيد الانتظار',
      confirmed: 'مؤكد',
      in_progress: 'قيد التنفيذ',
      unpaid: 'غير مدفوعة',
      partial: 'مدفوعة جزئياً',
      paid: 'مدفوعة بالكامل',
      void: 'ملغاة',
      active: 'نشط',
      suspended: 'موقوف مؤقتاً',
      revoked: 'مسحوب الصلاحية',
      received: 'مستلم بالمخزن',
    },
    sampleTypes: {
      blood: 'دم كامل',
      serum: 'مصل (Serum)',
      plasma: 'بلازما',
      urine: 'إدرار',
      stool: 'براز',
      swab: 'مسحة',
      saliva: 'لعاب',
      csf: 'سائل شوكي',
      other: 'أخرى',
    },
    flags: {
      normal: 'طبيعي',
      high: 'مرتفع (H)',
      low: 'منخفض (L)',
      critical: 'حرج (Critical)',
      abnormal: 'غير طبيعي',
    },
    paymentMethods: {
      cash: 'نقدي (Cash)',
      card_pos: 'بطاقة مصرفية (POS)',
      bank_transfer: 'تحويل مصرفي',
    },
    common: {
      save: 'حفظ',
      saving: 'جاري الحفظ...',
      cancel: 'إلغاء',
      close: 'إغلاق',
      add: 'إضافة',
      edit: 'تعديل',
      search: 'بحث...',
      all: 'الكل',
      iqd: 'د.ع',
      print: 'طباعة',
      downloadPdf: 'تحميل PDF',
      exportExcel: 'تصدير Excel',
      noData: 'لا توجد بيانات مسجلة حتى الآن',
      actions: 'الإجراءات',
      date: 'التاريخ',
      notes: 'ملاحظات',
      phone: 'رقم الهاتف',
      name: 'الاسم',
      price: 'السعر',
      active: 'نشط',
      inactive: 'معطّل',
      confirm: 'تأكيد',
    },
    overview: {
      title: 'لوحة تحكم المختبر',
      subtitle: 'نظرة تشغيلية شاملة على طلبات التحاليل، العينات، الإيرادات، والمخزون',
      todayOrders: 'طلبات اليوم',
      pendingApprovals: 'نتائج بانتظار الاعتماد',
      pendingBookings: 'حجوزات قيد الانتظار',
      todayRevenue: 'إيرادات اليوم',
      activePatients: 'ملفات المرضى',
      lowStockCount: 'نواقص المخزون',
      expiringCount: 'كواشف تنتهي خلال 30 يوماً',
      homeCollectionsPending: 'طلبات السحب المنزلي',
      alertsTitle: 'التنبيهات التشغيلية الفورية',
      recentOrders: 'أحدث طلبات التحاليل',
      recentAudit: 'سجل التدقيق المختبري',
      quickActions: 'إجراءات سريعة',
    },
    patients: {
      title: 'سجل مرضى المختبر',
      addPatient: 'إضافة مريض جديد',
      editPatient: 'تعديل ملف المريض',
      fileNumber: 'رقم الملف',
      fullName: 'الاسم الثلاثي',
      phone: 'رقم الهاتف',
      gender: 'الجنس',
      age: 'العمر',
      dateOfBirth: 'تاريخ الميلاد',
      address: 'العنوان',
      allergies: 'الحساسيات الدوائية أو المخبرية',
      chronicNotes: 'ملاحظات طبية مزمنة',
      totalOrders: 'عدد الطلبات',
      historyTitle: 'السجل الكامل للطلبات والنتائج والفواتير',
    },
    catalog: {
      title: 'كتالوج التحاليل والأسعار',
      myTestsTab: 'تحاليل المختبر المعتمدة',
      centralTab: 'كتالوج MEDORA المركزي',
      addCustomTest: 'إضافة تحليل خاص',
      adoptSelected: 'اعتماد التحاليل المحددة',
      adoptedTag: 'معتمد في المختبر',
      code: 'الرمز',
      nameAr: 'اسم التحليل (عربي)',
      nameEn: 'الاسم (إنجليزي)',
      category: 'التصنيف',
      sampleType: 'نوع العينة',
      unit: 'الوحدة',
      referenceRange: 'المدى المرجعي',
      prepInstructions: 'تعليمات التحضير للمريض',
      turnaroundHours: 'مدة الإنجاز (ساعة)',
      priceIqd: 'السعر (د.ع)',
    },
    ordersSamples: {
      title: 'إدارة الطلبات والعينات والحجوزات',
      tabOrders: 'طلبات التحاليل',
      tabSamples: 'استلام العينات',
      tabHomeCollection: 'السحب المنزلي',
      tabBookings: 'الحجوزات والمواعيد',
      newOrder: 'إنشاء طلب تحليل',
      selectPatient: 'اختر المريض',
      priority: 'الأولوية',
      selectTests: 'اختر التحاليل المطلوبة',
      applyOffer: 'تطبيق عرض / باقة (اختياري)',
      discountIqd: 'الخصم (د.ع)',
      homeFeeIqd: 'أجور السحب المنزلي (د.ع)',
      autoInvoice: 'إصدار فاتورة تلقائية مع الطلب',
      consumeInventory: 'صرف مواد الوصفة',
      reverseInventory: 'إلغاء صرف المواد',
      inventoryConsumed: 'تم صرف المواد',
      receiveSample: 'استلام عينة جديدة',
      rejectionReason: 'سبب رفض العينة (إلزامي عند الرفض)',
      newHomeCollection: 'تسجيل طلب سحب منزلي',
      assignStaff: 'اسم فني السحب',
      staffPhone: 'هاتف الفني',
      convertToOrder: 'تحويل إلى طلب تحليل',
      alreadyConverted: 'تم التحويل لطلب',
    },
    results: {
      title: 'نتائج التحاليل والاعتماد والتقارير',
      selectOrder: 'اختر طلب التحليل',
      analytes: 'قياسات الفحوصات (Analytes)',
      addAnalyte: 'إضافة صف فحص',
      testName: 'اسم الفحص',
      value: 'النتيجة',
      unit: 'الوحدة',
      refRange: 'المدى المرجعي',
      flag: 'التقييم',
      summaryNote: 'التعليق والتوصية المخبرية',
      attachments: 'المرفقات (PDF / صور)',
      uploadFile: 'رفع ملف نتيجة (PDF أو صورة)',
      saveDraft: 'حفظ كمسودة',
      submitApproval: 'إرسال للاعتماد',
      approveOnly: 'اعتماد النتيجة',
      approvePublish: 'اعتماد ونشر للمريض',
      publishToPatient: 'نشر للمريض',
      correctApproved: 'تعديل موثق لنتيجة معتمدة',
      correctionReason: 'سبب التعديل الموثق (إلزامي)',
      revisionHistory: 'سجل التعديلات الموثقة',
      immutableNotice: 'هذه النتيجة معتمدة ومقفلة ضد التعديل المباشر. أي تصحيح يتطلب سبباً موثقاً ويُحفظ في سجل المراجعات.',
    },
    billing: {
      title: 'الفواتير والحسابات والمدفوعات',
      invoicesTab: 'الفواتير',
      paymentsTab: 'سجل المدفوعات والإيصالات',
      newInvoice: 'إصدار فاتورة',
      recordPayment: 'تسجيل دفعة',
      voidInvoice: 'إلغاء الفاتورة',
      invoiceNumber: 'رقم الفاتورة',
      receiptNumber: 'رقم الإيصال',
      totalIqd: 'الإجمالي',
      paidIqd: 'المدفوع',
      balanceIqd: 'المتبقي',
      method: 'طريقة الدفع',
      referenceNote: 'ملاحظة / رقم مرجع',
    },
    staff: {
      title: 'إدارة موظفي المختبر والصلاحيات',
      managerOnlyNotice: 'هذا القسم متاح لمدير المختبر المعتمد فقط لإدارة حسابات الفريق والصلاحيات الدقيقة.',
      inviteStaff: 'إضافة موظف جديد',
      email: 'البريد الإلكتروني (Google)',
      roleTitle: 'المسمى الوظيفي',
      permissions: 'الصلاحيات الممنوحة',
      suspend: 'إيقاف مؤقت',
      reactivate: 'إعادة تفعيل',
      revoke: 'سحب الصلاحية نهائياً',
    },
    inventory: {
      title: 'المخزون والكواشف والموردون',
      tabStock: 'الأرصدة والصلاحية',
      tabRecipes: 'وصفات استهلاك التحاليل',
      tabSuppliersPo: 'الموردون وأوامر الشراء',
      tabMovements: 'حركة المخزون والتدقيق',
      addItem: 'إضافة مادة / كاشف',
      adjustStock: 'صرف / تعديل يدوي',
      quantity: 'الكمية الحالية',
      minThreshold: 'حد التنبيه الأدنى',
      lotNumber: 'رقم الدفعة (Lot)',
      expiryDate: 'تاريخ الانتهاء',
      unitCostIqd: 'تكلفة الوحدة',
      adjustDelta: 'التغيير في الكمية (موجب للإضافة، سالب للصرف)',
      adjustReason: 'سبب الصرف أو التعديل (إلزامي)',
      saveRecipe: 'حفظ وصفة الاستهلاك',
      addSupplier: 'إضافة مورد جديد',
      createPo: 'إنشاء أمر شراء',
      receivePo: 'استلام وإدخال للمخزن',
    },
    offers: {
      title: 'العروض والباقات والخصومات',
      newOffer: 'إضافة عرض أو باقة',
      offerType: 'نوع العرض',
      singleDiscount: 'خصم على تحليل',
      packageType: 'باقة تحاليل شاملة',
      originalPrice: 'السعر الأصلي',
      offerPrice: 'سعر العرض',
      startDate: 'تاريخ البدء',
      endDate: 'تاريخ الانتهاء',
      savings: 'قيمة التوفير',
    },
    reviews: {
      title: 'تقييمات المرضى والشكاوى',
      avgRating: 'متوسط التقييم',
      totalReviews: 'إجمالي التقييمات',
      complaintsCount: 'الشكاوى المسجلة',
      writeReply: 'رد المختبر الرسمي',
      sendReply: 'إرسال الرد',
    },
    reports: {
      title: 'التقارير والإحصائيات والتصدير',
      fromDate: 'من تاريخ',
      toDate: 'إلى تاريخ',
      ordersSummary: 'ملخص الطلبات وحالات التنفيذ',
      revenueSummary: 'الملخص المالي والتحصيل',
      topTests: 'أكثر التحاليل طلباً',
      inventoryHealth: 'صحة المخزون والكواشف',
    },
    comms: {
      title: 'الإشعارات والمراسلات',
      tabNotifications: 'الإشعارات الداخلية',
      tabPatientChat: 'محادثات المرضى',
      tabAdminThread: 'المراسلات الرسمية مع الإدارة',
      markAllRead: 'تحديد الكل كمقروء',
      startPatientChat: 'فتح محادثة مع مريض',
      typeMessage: 'اكتب رسالتك هنا...',
      send: 'إرسال',
      adminSubject: 'موضوع الرسالة',
      adminBody: 'نص الرسالة لإدارة MEDORA',
    },
    settings: {
      title: 'التراخيص وإعدادات المختبر',
      generalSection: 'البيانات التعريفية والموقع وساعات العمل',
      bookingSection: 'إعدادات الحجوزات والسحب المنزلي',
      licenseSection: 'التراخيص والوثائق الرسمية',
      deferredNoticeTitle: 'الاشتراكات وبوابات الدفع الإلكتروني',
      deferredNoticeBody: 'عرض باقات الاشتراك والتجديد مؤجل لمرحلة لاحقة، بينما تتم جميع مدفوعات المرضى داخل المختبر عبر نظام الفواتير المحلية.',
      homeCollectionEnabled: 'تفعيل خدمة السحب المنزلي للمرضى',
      homeCollectionFee: 'أجور السحب المنزلي الافتراضية (د.ع)',
      uploadAvatar: 'تحديث شعار / صورة المختبر',
      uploadLicense: 'رفع وثيقة ترخيص / اعتماد (PDF أو صورة)',
    },
  },
  en: {
    portalTitle: 'MEDORA LAB',
    portalSubtitle: 'Laboratory Information Management System',
    backToMedora: 'Back to MEDORA',
    refreshWorkspace: 'Refresh Data',
    signOut: 'Sign Out',
    managerBadge: 'Lab Manager',
    staffBadge: 'Lab Staff',
    noPermissionTitle: 'Access Restricted',
    noPermissionBody: 'You do not have permission to access this module. Contact your lab manager to update permissions.',
    nav: {
      overview: 'Dashboard & KPIs',
      patients: 'Patients & Records',
      catalog_tests: 'Tests & Central Catalog',
      orders_samples: 'Orders, Samples & Bookings',
      results: 'Results & Approval',
      billing: 'Invoices & Payments',
      staff: 'Staff & Permissions',
      secretaries: 'Secretary Management',
      inventory: 'Inventory, Reagents & POs',
      offers: 'Offers & Packages',
      reviews: 'Reviews & Complaints',
      reports: 'Reports & Export',
      communications: 'Notifications & Messaging',
      settings: 'Licenses & Lab Settings',
    },
    permissions: {
      reception: 'Reception & Patient Intake',
      bookings: 'Bookings & Home Collection',
      samples: 'Sample Receiving & Triage',
      enterResults: 'Enter Results & Upload Files',
      approveResults: 'Review, Approve & Amend Results',
      inventory: 'Inventory, Recipes & Purchasing',
      billing: 'Invoicing & Payments',
      reports: 'Analytics & Reports Export',
      messaging: 'Messaging & Review Replies',
    },
    status: {
      draft: 'Draft',
      pending_approval: 'Pending Approval',
      approved: 'Approved',
      corrected: 'Corrected (Audited)',
      ordered: 'Ordered',
      sample_collected: 'Sample Collected',
      in_lab: 'In Analysis',
      result_entered: 'Result Entered',
      cancelled: 'Cancelled',
      collected: 'Collected',
      accepted: 'Accepted',
      rejected: 'Rejected',
      requested: 'Requested',
      assigned: 'Assigned',
      en_route: 'En Route',
      completed: 'Completed',
      pending: 'Pending',
      confirmed: 'Confirmed',
      in_progress: 'In Progress',
      unpaid: 'Unpaid',
      partial: 'Partially Paid',
      paid: 'Paid',
      void: 'Void',
      active: 'Active',
      suspended: 'Suspended',
      revoked: 'Revoked',
      received: 'Received',
    },
    sampleTypes: {
      blood: 'Whole Blood',
      serum: 'Serum',
      plasma: 'Plasma',
      urine: 'Urine',
      stool: 'Stool',
      swab: 'Swab',
      saliva: 'Saliva',
      csf: 'CSF',
      other: 'Other',
    },
    flags: {
      normal: 'Normal',
      high: 'High (H)',
      low: 'Low (L)',
      critical: 'Critical',
      abnormal: 'Abnormal',
    },
    paymentMethods: {
      cash: 'Cash',
      card_pos: 'Card (POS)',
      bank_transfer: 'Bank Transfer',
    },
    common: {
      save: 'Save',
      saving: 'Saving...',
      cancel: 'Cancel',
      close: 'Close',
      add: 'Add',
      edit: 'Edit',
      search: 'Search...',
      all: 'All',
      iqd: 'IQD',
      print: 'Print',
      downloadPdf: 'Download PDF',
      exportExcel: 'Export Excel',
      noData: 'No records found yet',
      actions: 'Actions',
      date: 'Date',
      notes: 'Notes',
      phone: 'Phone',
      name: 'Name',
      price: 'Price',
      active: 'Active',
      inactive: 'Inactive',
      confirm: 'Confirm',
    },
    overview: {
      title: 'Laboratory Dashboard',
      subtitle: 'Operational overview of orders, samples, revenue, and reagent stock',
      todayOrders: 'Today Orders',
      pendingApprovals: 'Pending Result Approvals',
      pendingBookings: 'Pending Bookings',
      todayRevenue: 'Today Revenue',
      activePatients: 'Lab Patients',
      lowStockCount: 'Low Stock Alerts',
      expiringCount: 'Expiring <= 30 Days',
      homeCollectionsPending: 'Home Collections',
      alertsTitle: 'Operational Alerts',
      recentOrders: 'Recent Test Orders',
      recentAudit: 'Recent Audit Log',
      quickActions: 'Quick Actions',
    },
    patients: {
      title: 'Laboratory Patients',
      addPatient: 'New Patient File',
      editPatient: 'Edit Patient File',
      fileNumber: 'File No.',
      fullName: 'Full Name',
      phone: 'Phone',
      gender: 'Gender',
      age: 'Age',
      dateOfBirth: 'Date of Birth',
      address: 'Address',
      allergies: 'Allergies',
      chronicNotes: 'Chronic Conditions',
      totalOrders: 'Orders',
      historyTitle: 'Orders, Results & Invoices History',
    },
    catalog: {
      title: 'Lab Test Catalog & Pricing',
      myTestsTab: 'My Lab Tests',
      centralTab: 'MEDORA Central Catalog',
      addCustomTest: 'Add Custom Test',
      adoptSelected: 'Adopt Selected Tests',
      adoptedTag: 'Adopted',
      code: 'Code',
      nameAr: 'Arabic Name',
      nameEn: 'English Name',
      category: 'Category',
      sampleType: 'Sample Type',
      unit: 'Unit',
      referenceRange: 'Reference Range',
      prepInstructions: 'Patient Prep Instructions',
      turnaroundHours: 'Turnaround (hrs)',
      priceIqd: 'Price (IQD)',
    },
    ordersSamples: {
      title: 'Orders, Samples, Home Collection & Bookings',
      tabOrders: 'Test Orders',
      tabSamples: 'Sample Receiving',
      tabHomeCollection: 'Home Collection',
      tabBookings: 'Patient Bookings',
      newOrder: 'New Lab Order',
      selectPatient: 'Select Patient',
      priority: 'Priority',
      selectTests: 'Select Tests',
      applyOffer: 'Apply Offer / Package (Optional)',
      discountIqd: 'Discount (IQD)',
      homeFeeIqd: 'Home Collection Fee (IQD)',
      autoInvoice: 'Auto-generate invoice with order',
      consumeInventory: 'Consume Recipe Stock',
      reverseInventory: 'Reverse Consumption',
      inventoryConsumed: 'Stock Consumed',
      receiveSample: 'Receive Sample',
      rejectionReason: 'Rejection Reason (Required if rejected)',
      newHomeCollection: 'New Home Collection',
      assignStaff: 'Phlebotomist Name',
      staffPhone: 'Phlebotomist Phone',
      convertToOrder: 'Convert to Lab Order',
      alreadyConverted: 'Converted to Order',
    },
    results: {
      title: 'Lab Results, Approval & Reports',
      selectOrder: 'Select Order',
      analytes: 'Test Analytes',
      addAnalyte: 'Add Analyte Row',
      testName: 'Test / Analyte',
      value: 'Value',
      unit: 'Unit',
      refRange: 'Reference Range',
      flag: 'Flag',
      summaryNote: 'Clinical Interpretation / Note',
      attachments: 'Attachments (PDF / Images)',
      uploadFile: 'Upload Result File (PDF or Image)',
      saveDraft: 'Save Draft',
      submitApproval: 'Submit for Approval',
      approveOnly: 'Approve Result',
      approvePublish: 'Approve & Publish to Patient',
      publishToPatient: 'Publish to Patient',
      correctApproved: 'Documented Revision',
      correctionReason: 'Revision Reason (Mandatory)',
      revisionHistory: 'Documented Revision History',
      immutableNotice: 'This approved result is locked. Any amendment requires a documented reason and is preserved in the revision history.',
    },
    billing: {
      title: 'Invoices, Local Payments & Receipts',
      invoicesTab: 'Invoices',
      paymentsTab: 'Payments & Receipts',
      newInvoice: 'New Invoice',
      recordPayment: 'Record Payment',
      voidInvoice: 'Void Invoice',
      invoiceNumber: 'Invoice No.',
      receiptNumber: 'Receipt No.',
      totalIqd: 'Total',
      paidIqd: 'Paid',
      balanceIqd: 'Balance',
      method: 'Payment Method',
      referenceNote: 'Reference / Note',
    },
    staff: {
      title: 'Staff & Granular Permissions',
      managerOnlyNotice: 'Manager-only section for inviting lab team members and configuring granular access permissions.',
      inviteStaff: 'Add Staff Member',
      email: 'Google Email',
      roleTitle: 'Job Title',
      permissions: 'Permissions',
      suspend: 'Suspend',
      reactivate: 'Reactivate',
      revoke: 'Revoke Access',
    },
    inventory: {
      title: 'Inventory, Reagents, Recipes & Purchasing',
      tabStock: 'Stock & Expiry',
      tabRecipes: 'Test Consumption Recipes',
      tabSuppliersPo: 'Suppliers & Purchase Orders',
      tabMovements: 'Stock Movement Ledger',
      addItem: 'Add Reagent / Supply',
      adjustStock: 'Manual Dispense / Adjust',
      quantity: 'Current Qty',
      minThreshold: 'Min Threshold',
      lotNumber: 'Lot Number',
      expiryDate: 'Expiry Date',
      unitCostIqd: 'Unit Cost',
      adjustDelta: 'Quantity Delta (+ add / - dispense)',
      adjustReason: 'Reason (Mandatory)',
      saveRecipe: 'Save Consumption Recipe',
      addSupplier: 'Add Supplier',
      createPo: 'New Purchase Order',
      receivePo: 'Receive to Inventory',
    },
    offers: {
      title: 'Offers, Packages & Discounts',
      newOffer: 'Create Offer / Package',
      offerType: 'Offer Type',
      singleDiscount: 'Single Test Discount',
      packageType: 'Test Package',
      originalPrice: 'Original Price',
      offerPrice: 'Offer Price',
      startDate: 'Start Date',
      endDate: 'End Date',
      savings: 'Savings',
    },
    reviews: {
      title: 'Patient Reviews & Complaints',
      avgRating: 'Average Rating',
      totalReviews: 'Total Reviews',
      complaintsCount: 'Complaints',
      writeReply: 'Official Lab Reply',
      sendReply: 'Submit Reply',
    },
    reports: {
      title: 'Analytics Reports & Export',
      fromDate: 'From Date',
      toDate: 'To Date',
      ordersSummary: 'Orders Breakdown',
      revenueSummary: 'Financial & Collection Summary',
      topTests: 'Most Requested Tests',
      inventoryHealth: 'Inventory Health',
    },
    comms: {
      title: 'Notifications & Messaging',
      tabNotifications: 'Internal Notifications',
      tabPatientChat: 'Patient Messaging',
      tabAdminThread: 'Super Admin Thread',
      markAllRead: 'Mark All Read',
      startPatientChat: 'Open Patient Chat',
      typeMessage: 'Write your message...',
      send: 'Send',
      adminSubject: 'Subject',
      adminBody: 'Official message to MEDORA Super Admin',
    },
    settings: {
      title: 'Licenses & Operational Settings',
      generalSection: 'Profile, Location & Working Hours',
      bookingSection: 'Bookings & Home Collection Settings',
      licenseSection: 'Official Licenses & Documents',
      deferredNoticeTitle: 'Subscriptions & Online Gateways',
      deferredNoticeBody: 'Platform subscription tiers are scheduled for a later phase; patient billing runs locally inside the lab.',
      homeCollectionEnabled: 'Enable home sample collection requests',
      homeCollectionFee: 'Default Home Collection Fee (IQD)',
      uploadAvatar: 'Upload Lab Logo / Avatar',
      uploadLicense: 'Upload License Document (PDF or Image)',
    },
  },
};
