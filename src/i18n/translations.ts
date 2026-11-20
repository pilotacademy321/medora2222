import type { Language, PortalType, RequestStatus } from '../types/medora';

export interface MedoraCopy {
  common: {
    brandName: string;
    tagline: string;
    backToIntro: string;
    back: string;
    next: string;
    saveAndContinue: string;
    submitRequest: string;
    edit: string;
    cancel: string;
    close: string;
    required: string;
    optional: string;
    loading: string;
    signOut: string;
    switchAccount: string;
    darkMode: string;
    lightMode: string;
    arabic: string;
    english: string;
    uploadFile: string;
    uploading: string;
    remove: string;
    years: string;
    minutes: string;
    iqd: string;
    perHour: string;
    manual: string;
    auto: string;
    male: string;
    female: string;
    selectOption: string;
    captureLocation: string;
    locationCaptured: string;
  };
  auth: {
    title: string;
    subtitle: string;
    continueWithGoogle: string;
    continueWithGoogleRedirect: string;
    openInNewTabForSignIn: string;
    iframePopupHint: string;
    redirectingToGoogle: string;
    signingIn: string;
    verifyingAccount: string;
    selectedPortalLabel: string;
    backToPortalSelection: string;
    signedInAsLabel: string;
    continueToSelectedPortal: string;
    signInDifferentGoogle: string;
    superAdminUnauthorized: string;
    securityNote: string;
    privacyPolicy: string;
    termsOfUse: string;
    privacyBody: string[];
    termsBody: string[];
    errors: {
      popupClosed: string;
      popupBlocked: string;
      network: string;
      cancelled: string;
      unauthorizedDomain: string;
      unauthorizedDomainHint: string;
      operationNotAllowed: string;
      webStorageUnsupported: string;
      userDisabled: string;
      tooManyRequests: string;
      accountExistsWithDifferentCredential: string;
      invalidCredential: string;
      emailNotVerified: string;
      permissionDenied: string;
      redirectMissingResult: string;
      iframeRedirectBlocked: string;
      internalError: string;
      generic: string;
    };
  };
  personal: {
    stepLabel: string;
    title: string;
    subtitle: string;
    googleLinkedHint: string;
    fullName: string;
    dateOfBirth: string;
    age: string;
    gender: string;
    governorate: string;
    district: string;
    address: string;
    phone: string;
    avatar: string;
    avatarHint: string;
    noNationalIdNote: string;
    errors: {
      fullName: string;
      dob: string;
      gender: string;
      governorate: string;
      district: string;
      address: string;
    };
  };
  portals: {
    welcomeTitle: string;
    choosePortalSubtitle: string;
    changePortalBtn: string;
    stepLabel: string;
    title: string;
    subtitle: string;
    viewRequests: string;
    independenceTitle: string;
    independenceNotice: string;
    selectPortalAction: string;
    alreadyActiveBadge: string;
    superAdminCard: {
      title: string;
      subtitle: string;
      activationNote: string;
      badge: string;
      action: string;
    };
    items: Record<
      PortalType,
      {
        title: string;
        subtitle: string;
        activationNote: string;
      }
    >;
  };
  forms: {
    sharedSummaryTitle: string;
    editPersonalInfo: string;
    fileValidationHint: string;
    patient: {
      title: string;
      subtitle: string;
      emergencyTitle: string;
      emergencyName: string;
      emergencyPhone: string;
      emergencyRelation: string;
      policyConsent: string;
      activationNotice: string;
    };
    doctor: {
      title: string;
      subtitle: string;
      professionalPhone: string;
      email: string;
      degree: string;
      university: string;
      specialty: string;
      subSpecialty: string;
      experienceYears: string;
      languages: string;
      languagesPlaceholder: string;
      clinicName: string;
      workAddress: string;
      workDaysAndHours: string;
      consultationDuration: string;
      consultationFee: string;
      hourlyLimit: string;
      bookingMode: string;
      licenseNumber: string;
      licensingAuthority: string;
      licenseExpiryDate: string;
      documents: string;
    };
    lab: {
      title: string;
      subtitle: string;
      managerSection: string;
      institutionSection: string;
      professionalPhone: string;
      labNameAr: string;
      labNameEn: string;
      directorName: string;
      governorate: string;
      district: string;
      address: string;
      mapLocation: string;
      licenseNumber: string;
      licensingAuthority: string;
      licenseDocuments: string;
      technicalDirectorName: string;
      services: string;
      workDaysAndHours: string;
      hourlyLimit: string;
      bookingMode: string;
    };
    secretary: {
      title: string;
      subtitle: string;
      phone: string;
      educationQualification: string;
      previousExperience: string;
      targetInstitutionName: string;
      invitationCode: string;
      permissionWarning: string;
    };
    pharmacy: {
      title: string;
      subtitle: string;
      ownerSection: string;
      institutionSection: string;
      pharmacyNameAr: string;
      pharmacyNameEn: string;
      ownerFullName: string;
      responsiblePharmacistName: string;
      pharmacistSyndicateNumber: string;
      pharmacyLicenseNumber: string;
      licensingAuthority: string;
      licenseExpiryDate: string;
      professionalPhone: string;
      email: string;
      governorate: string;
      district: string;
      address: string;
      mapLocation: string;
      workingDaysAndHours: string;
      is24Hours: string;
      deliveryAvailable: string;
      pickupAvailable: string;
      licenseDocuments: string;
    };
    wholesaler: {
      title: string;
      subtitle: string;
      ownerSection: string;
      institutionSection: string;
      wholesalerNameAr: string;
      wholesalerNameEn: string;
      ownerFullName: string;
      legalEntityName: string;
      warehouseLicenseNumber: string;
      healthAuthorityLicenseNumber: string;
      licensingAuthority: string;
      licenseExpiryDate: string;
      professionalPhone: string;
      email: string;
      governorate: string;
      district: string;
      warehouseAddress: string;
      mapLocation: string;
      workingDaysAndHours: string;
      supportedGovernorates: string;
      minimumOrderIqd: string;
      licenseDocuments: string;
    };
  };
  review: {
    stepLabel: string;
    title: string;
    subtitle: string;
    personalSection: string;
    portalSection: string;
    documentsSection: string;
    noDocuments: string;
    termsConfirm: string;
    submitting: string;
    duplicateError: string;
  };
  statusView: {
    title: string;
    subtitle: string;
    requestNumber: string;
    portalType: string;
    currentStatus: string;
    activationRule: string;
    reasonLabel: string;
    instructionsLabel: string;
    editAndResubmit: string;
    chooseAnotherPortal: string;
    successTitle: string;
    successSubtitle: string;
    noRequests: string;
    startPortalSelection: string;
    statuses: Record<RequestStatus, string>;
    activationRules: {
      patient_instant: string;
      admin_approval: string;
      institution_approval: string;
    };
  };
  admin: {
    title: string;
    subtitle: string;
    verifiedBadge: string;
    claimsActiveBadge: string;
    accessDeniedTitle: string;
    accessDeniedBody: string;
    returnHome: string;
    refreshData: string;
    collapseSidebar: string;
    expandSidebar: string;
    searchPlaceholder: string;
    allFilter: string;
    noResults: string;
    emptyList: string;
    loadingData: string;
    errorLoading: string;
    actionSuccess: string;
    paymentGatewayNote: string;
    nav: {
      overview: string;
      messages: string;
      network_messaging: string;
      notifications_center: string;
      commerce_receipts: string;
      institutions: string;
      labs: string;
      pharmacies: string;
      wholesalers: string;
      haneen_admin: string;
      requests: string;
      ads: string;
      reviews: string;
      feedback: string;
      users: string;
      permissions: string;
      audit_logs: string;
      settings: string;
    };
    sectionDescriptions: {
      overview: string;
      messages: string;
      network_messaging: string;
      notifications_center: string;
      commerce_receipts: string;
      institutions: string;
      labs: string;
      pharmacies: string;
      wholesalers: string;
      haneen_admin: string;
      requests: string;
      ads: string;
      reviews: string;
      feedback: string;
      users: string;
      permissions: string;
      audit_logs: string;
      settings: string;
    };
    overview: {
      messagesPanelTitle: string;
      institutionsPanelTitle: string;
      totalMessages: string;
      unreadMessages: string;
      totalInstitutions: string;
      activeInstitutions: string;
      pendingInstitutions: string;
      activeSubscriptions: string;
      expiredSubscriptions: string;
      pendingRequestsCount: string;
      viewAll: string;
      openDetails: string;
      printReportBtn: string;
      downloadReportPdfBtn: string;
      exportingPdf: string;
    };
    messages: {
      composeTitle: string;
      composeBtn: string;
      subject: string;
      category: string;
      body: string;
      sendBtn: string;
      sending: string;
      sender: string;
      date: string;
      status: string;
      markRead: string;
      markReplied: string;
      markArchived: string;
      unreadBadge: string;
      readBadge: string;
      categories: {
        system: string;
        inquiry: string;
        institution_notice: string;
        compliance: string;
      };
      statuses: {
        new: string;
        read: string;
        replied: string;
        archived: string;
      };
    };
    institutions: {
      name: string;
      type: string;
      location: string;
      licenseNumber: string;
      approvalStatus: string;
      subscriptionState: string;
      planName: string;
      expiresAt: string;
      manageBtn: string;
      saveChanges: string;
      saving: string;
      types: {
        clinic: string;
        lab: string;
        pharmacy: string;
        wholesaler: string;
        imagingClosed: string;
      };
      statuses: {
        pending_approval: string;
        active: string;
        suspended: string;
        rejected: string;
      };
      subscriptions: {
        none: string;
        trial: string;
        active: string;
        expired: string;
      };
    };
    requests: {
      applicant: string;
      email: string;
      submittedAt: string;
      reviewBtn: string;
      detailsTitle: string;
      loadingDetails: string;
      attachedDocs: string;
      openDoc: string;
      noDocs: string;
      decisionTitle: string;
      startReviewBtn: string;
      approveBtn: string;
      requiresChangesBtn: string;
      rejectBtn: string;
      rejectionReasonLabel: string;
      rejectionReasonPlaceholder: string;
      instructionsLabel: string;
      instructionsPlaceholder: string;
      reasonRequiredError: string;
      instructionsRequiredError: string;
      autoApprovalBlockedNote: string;
    };
    users: {
      name: string;
      email: string;
      portal: string;
      accountStatus: string;
      governorate: string;
      lastLogin: string;
      noMedicalRecordsNote: string;
      statuses: {
        pending_profile: string;
        profile_completed: string;
        pending_review: string;
        active: string;
        restricted: string;
        suspended: string;
      };
    };
    permissions: {
      readOnlyTitle: string;
      readOnlyBody: string;
      roleLabel: string;
      activeLabel: string;
      grantedByLabel: string;
      activeBadge: string;
      inactiveBadge: string;
      policyMatrixTitle: string;
    };
    auditLogs: {
      action: string;
      actor: string;
      target: string;
      details: string;
      timestamp: string;
    };
    settings: {
      serverVerificationTitle: string;
      adminSdkLabel: string;
      allowlistLabel: string;
      claimsLabel: string;
      projectLabel: string;
      databaseLabel: string;
      configured: string;
      missing: string;
      active: string;
      governanceRulesTitle: string;
      governanceRules: string[];
    };
    ads: {
      createBtn: string;
      editTitle: string;
      createTitle: string;
      categoryLabel: string;
      categories: {
        doctor: string;
        lab: string;
      };
      entityLabel: string;
      doctorLabel: string;
      titleLabel: string;
      titlePlaceholder: string;
      descriptionLabel: string;
      descriptionPlaceholder: string;
      imageLabel: string;
      imageSpecsHint: string;
      imageUrlPlaceholder: string;
      uploadImageBtn: string;
      uploadingImageBtn: string;
      dragDropHint: string;
      storageSavedBadge: string;
      assetsSavedBadge: string;
      storageMissingBadge: string;
      storageFallbackNotice: string;
      ctaLabel: string;
      useDateRangeLabel: string;
      ongoingLabel: string;
      startDateLabel: string;
      endDateLabel: string;
      priorityLabel: string;
      activeLabel: string;
      statusLabel: string;
      draftStatus: string;
      publishedStatus: string;
      pausedStatus: string;
      expiredStatus: string;
      activeStatus: string;
      inactiveStatus: string;
      approvedByAdminBadge: string;
      legacyRecordBadge: string;
      filters: {
        all: string;
        published: string;
        draft: string;
        paused: string;
        expired: string;
      };
      previewTitle: string;
      publishBtn: string;
      pauseBtn: string;
      republishBtn: string;
      saveBtn: string;
      saveDraftBtn: string;
      saveChangesBtn: string;
      deleteBtn: string;
      confirmDeletePrompt: string;
      noDoctorsHint: string;
      noEntitiesHint: string;
      imageRequiredError: string;
      republishExpiredHint: string;
    };
    reviews: {
      doctorLabel: string;
      patientLabel: string;
      ratingLabel: string;
      commentLabel: string;
      moderationNoteLabel: string;
      approveBtn: string;
      rejectBtn: string;
      statuses: {
        pending: string;
        approved: string;
        rejected: string;
      };
    };
    feedback: {
      patientLabel: string;
      categoryLabel: string;
      subjectLabel: string;
      messageLabel: string;
      replyLabel: string;
      saveBtn: string;
      manageBtn: string;
      statuses: {
        new: string;
        in_review: string;
        resolved: string;
        closed: string;
      };
    };
  };
}

export const TRANSLATIONS: Record<Language, MedoraCopy> = {
  ar: {
    common: {
      brandName: 'MEDORA',
      tagline: 'صحتك أولويتنا',
      backToIntro: 'العودة إلى المقدمة',
      back: 'السابق',
      next: 'التالي',
      saveAndContinue: 'حفظ والمتابعة',
      submitRequest: 'إرسال طلب التسجيل',
      edit: 'تعديل',
      cancel: 'إلغاء',
      close: 'إغلاق',
      required: 'مطلوب',
      optional: 'اختياري',
      loading: 'جاري التحميل...',
      signOut: 'تسجيل الخروج',
      switchAccount: 'تغيير حساب Google',
      darkMode: 'الوضع الليلي',
      lightMode: 'الوضع النهاري',
      arabic: 'العربية',
      english: 'English',
      uploadFile: 'رفع ملف',
      uploading: 'جاري الرفع...',
      remove: 'إزالة',
      years: 'سنة',
      minutes: 'دقيقة',
      iqd: 'د.ع',
      perHour: 'في الساعة',
      manual: 'يدوي',
      auto: 'تلقائي',
      male: 'ذكر',
      female: 'أنثى',
      selectOption: 'اختر...',
      captureLocation: 'تحديد الموقع الحالي',
      locationCaptured: 'تم التقاط الإحداثيات',
    },
    auth: {
      title: 'تسجيل الدخول أو إنشاء حساب',
      subtitle:
        'ادخل عبر حسابك الموثق في Google للمتابعة إلى البوابة المختارة في منصة MEDORA.',
      continueWithGoogle: 'المتابعة باستخدام Google',
      continueWithGoogleRedirect: 'المتابعة عبر إعادة توجيه Google (مناسب للهاتف)',
      openInNewTabForSignIn: 'فتح MEDORA في تبويب مستقل لإتمام تسجيل الدخول',
      iframePopupHint:
        'في حال حظر المتصفح للنافذة المنبثقة داخل نافذة المعاينة، يمكنك السماح بالنوافذ المنبثقة أو فتح المنصة في تبويب مستقل.',
      redirectingToGoogle: 'جاري التحويل إلى صفحة تسجيل الدخول الآمنة في Google...',
      signingIn: 'جاري التحقق من حساب Google...',
      verifyingAccount: 'جاري التحقق من الحساب والصلاحيات واسترجاع بيانات البوابة...',
      selectedPortalLabel: 'البوابة المختارة',
      backToPortalSelection: 'رجوع لاختيار البوابة',
      signedInAsLabel: 'الحساب المسجل حالياً',
      continueToSelectedPortal: 'المتابعة إلى البوابة المختارة',
      signInDifferentGoogle: 'تغيير حساب Google',
      superAdminUnauthorized:
        'هذا الحساب غير مخوّل بالدخول إلى بوابة الإدارة العليا.',
      securityNote:
        'لا يتم حفظ كلمات مرور أو رموز دخول، وتتم المصادقة عبر خوادم Google الآمنة.',
      privacyPolicy: 'سياسة الخصوصية',
      termsOfUse: 'شروط الاستخدام',
      privacyBody: [
        'تلتزم منصة MEDORA بحماية بيانات المستخدمين والسجلات الطبية والشخصية وفق ضوابط التشفير والوصول المحدود.',
        'يُستخدم البريد الإلكتروني والبيانات الأساسية للتحقق من الهوية، وإدارة طلبات التسجيل، وتفعيل البوابات المعتمدة فقط.',
        'لا يتم مشاركة البيانات المؤسسية أو الشخصية بين الحسابات المستقلة أو خارج نطاق الرعاية الصحية المصرح بها.',
      ],
      termsBody: [
        'يقر المتقدم بصحة ودقة المعلومات المهنية والوثائق المرفوعة ضمن بوابات الطبيب والمختبر والسكرتير.',
        'تخضع حسابات المؤسسات والأطباء للمراجعة الإدارية، بينما يتطلب حساب السكرتير موافقة المؤسسة المرتبط بها وتحديد الصلاحيات.',
        'تحتفظ إدارة MEDORA بحق تعليق أو رفض أي طلب يحتوي على معلومات غير دقيقة أو مستندات منتهية الصلاحية.',
      ],
      errors: {
        popupClosed: 'تم إغلاق نافذة اختيار حساب Google قبل إتمام المصادقة.',
        popupBlocked: 'قام المتصفح بحظر النافذة المنبثقة لـ Google. يرجى السماح بالنوافذ المنبثقة أو استخدام الخيار البديل أدناه.',
        network: 'تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت وحاول مرة أخرى.',
        cancelled: 'تم إلغاء طلب المصادقة الحالي أو فتح نافذة دخول سابقة. يرجى المحاولة مجدداً.',
        unauthorizedDomain:
          'هذا النطاق غير مضاف في إعدادات Firebase Authentication > Settings > Authorized domains:',
        unauthorizedDomainHint:
          'يرجى إضافة اسم النطاق (Hostname) أعلاه في لوحة تحكم Firebase للمشروع ثم إعادة المحاولة.',
        operationNotAllowed:
          'تسجيل الدخول عبر Google غير مفعّل في إعدادات Firebase Authentication.',
        webStorageUnsupported:
          'المتصفح أو وضع التصفح الخاص يمنع تخزين الجلسة وملفات تعريف الارتباط اللازمة للمصادقة.',
        userDisabled: 'تم تعطيل حساب المستخدم هذا في Firebase Authentication.',
        tooManyRequests: 'تم إرسال محاولات كثيرة متتالية. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.',
        accountExistsWithDifferentCredential:
          'يوجد حساب مسجل مسبقاً بنفس البريد الإلكتروني باستخدام وسيلة دخول مختلفة.',
        invalidCredential:
          'تعذر التحقق من بيانات اعتماد Google أو انتهت صلاحية الجلسة. يرجى المحاولة مرة أخرى.',
        emailNotVerified:
          'يجب أن يكون البريد الإلكتروني لحساب Google موثقاً لإتمام تسجيل الدخول في MEDORA.',
        permissionDenied:
          'تعذر حفظ بيانات الجلسة في قاعدة البيانات بسبب صلاحيات الوصول. تأكد من توثيق البريد الإلكتروني وحاول مجدداً.',
        redirectMissingResult:
          'لم تكتمل عودة جلسة Google بعد إعادة التوجيه (قد يكون المتصفح حظر ملفات الارتباط أو تم إلغاء العملية). يرجى الضغط على "المتابعة باستخدام Google".',
        iframeRedirectBlocked:
          'لا تسمح Google بإعادة التوجيه داخل نافذة مضمنة. يرجى السماح بالنوافذ المنبثقة أو فتح MEDORA في تبويب متصفح مستقل.',
        internalError:
          'حدث خطأ تقني مؤقت أثناء الاتصال بمصادقة Google. يرجى إعادة المحاولة أو فتح المنصة في تبويب مستقل.',
        generic: 'تعذر إتمام تسجيل الدخول عبر Google. يرجى المحاولة مرة أخرى.',
      },
    },
    personal: {
      stepLabel: 'الخطوة ١ من ٣ · المعلومات الشخصية',
      title: 'المعلومات الشخصية المشتركة',
      subtitle:
        'تُحفظ هذه البيانات في ملفك العام داخل MEDORA وتُستخدم تلقائياً عبر البوابات دون الحاجة لإعادة إدخالها.',
      googleLinkedHint: 'تم سحب الاسم الأساسي والبريد الإلكتروني من حساب Google.',
      fullName: 'الاسم الثلاثي',
      dateOfBirth: 'تاريخ الميلاد',
      age: 'العمر (محسوب تلقائياً)',
      gender: 'الجنس',
      governorate: 'المحافظة',
      district: 'القضاء',
      address: 'المنطقة أو عنوان السكن',
      phone: 'رقم الهاتف (عند الحاجة)',
      avatar: 'الصورة الشخصية',
      avatarHint: 'اختيارية — JPG أو PNG أو WebP بحد أقصى 2MB',
      noNationalIdNote: 'لا تتطلب هذه المرحلة رقم البطاقة الوطنية.',
      errors: {
        fullName: 'يرجى إدخال الاسم الثلاثي بشكل واضح.',
        dob: 'يرجى تحديد تاريخ الميلاد.',
        gender: 'يرجى اختيار الجنس.',
        governorate: 'يرجى اختيار المحافظة.',
        district: 'يرجى تحديد القضاء.',
        address: 'يرجى إدخال المنطقة أو عنوان السكن.',
      },
    },
    portals: {
      welcomeTitle: 'أهلاً بك في MEDORA',
      choosePortalSubtitle: 'اختر البوابة التي تريد الدخول إليها',
      changePortalBtn: 'تغيير البوابة',
      stepLabel: 'الخطوة ٢ من ٣ · اختيار البوابة',
      title: 'اختر بوابة التسجيل المناسبة',
      subtitle:
        'حدد نوع الحساب الذي ترغب بالتسجيل فيه لاستكمال الاستمارة المخصصة وإرسال الطلب.',
      viewRequests: 'متابعة طلباتي السابقة',
      independenceTitle: 'تنويه استقلالية البوابات',
      independenceNotice:
        'لديك طلب مسجل مسبقاً. اختيار بوابة جديدة ينشئ طلباً مستقلاً ولا يحذف طلبك السابق ولا ينقل بيانات أو صلاحيات أي مؤسسة تلقائياً.',
      selectPortalAction: 'اختيار البوابة',
      alreadyActiveBadge: 'لديك طلب مسجل',
      superAdminCard: {
        title: 'بوابة الإدارة العليا — Super Admin',
        subtitle:
          'لوحة التحكم التنفيذية لإدارة المؤسسات والاشتراكات والرسائل الإدارية واعتماد الطلبات.',
        activationNote:
          'يتطلب دخولاً موثقاً بحساب الإدارة المعتمد والتحقق الخادمي.',
        badge: 'الإدارة التنفيذية',
        action: 'الدخول إلى الإدارة العليا',
      },
      items: {
        patient: {
          title: 'بوابة المريض',
          subtitle: 'إدارة الملف الصحي، المواعيد، والنتائج الطبية الشخصية.',
          activationNote: 'يُفعّل الحساب بعد اكتمال التسجيل والموافقة على الشروط.',
        },
        doctor: {
          title: 'بوابة الطبيب',
          subtitle: 'تسجيل العيادة، التخصص، أوقات الدوام، والترخيص المهني.',
          activationNote: 'يبقى الطلب بانتظار المراجعة والاعتماد من الإدارة.',
        },
        lab: {
          title: 'بوابة المختبر',
          subtitle: 'تسجيل المختبر الطبي، الكادر الفني، والخدمات المخبرية.',
          activationNote: 'يبقى الطلب بانتظار المراجعة والاعتماد من الإدارة.',
        },
        secretary: {
          title: 'بوابة السكرتير',
          subtitle: 'حساب سكرتير مستقل لاستلام وقبول دعوات التوظيف من الأطباء والمختبرات والصيدليات.',
          activationNote: 'يُفعّل الحساب المستقل فور التسجيل، وتبدأ صلاحيات كل جهة بعد قبول دعوتها.',
        },
        pharmacy: {
          title: 'بوابة الصيدلية',
          subtitle: 'إدارة المخزون والتشغيلات والوصفات الطبية وطلبات المرضى والتوريد من المذاخر.',
          activationNote: 'تنتظر مراجعة المستندات وإجازات الصيدلة والاعتماد من الإدارة العليا.',
        },
        wholesaler: {
          title: 'بوابة المذخر الدوائي',
          subtitle: 'إدارة مخزون الجملة والتشغيلات وطلبات التوريد للصيدليات والشحنات والفواتير.',
          activationNote: 'تنتظر مراجعة إجازة المذخر ومستندات وزارة الصحة والاعتماد من الإدارة العليا.',
        },
      },
    },
    forms: {
      sharedSummaryTitle: 'البيانات الشخصية المعتمدة من ملفك العام',
      editPersonalInfo: 'تعديل البيانات الشخصية',
      fileValidationHint: 'يُسمح بملفات JPG, PNG, WebP, PDF بحد أقصى 5MB للملف.',
      patient: {
        title: 'استمارة بوابة المريض',
        subtitle: 'راجع بياناتك الشخصية وأضف جهة اتصال الطوارئ الاختيارية.',
        emergencyTitle: 'جهة اتصال الطوارئ',
        emergencyName: 'اسم جهة الاتصال',
        emergencyPhone: 'رقم هاتف الطوارئ',
        emergencyRelation: 'صلة القرابة',
        policyConsent: 'أوافق على سياسة الخصوصية وشروط استخدام منصة MEDORA.',
        activationNotice: 'سيتم تفعيل ملف المريض فور تأكيد الطلب وإرساله.',
      },
      doctor: {
        title: 'استمارة بوابة الطبيب',
        subtitle: 'أكمل المؤهلات العلمية، معلومات العيادة، ونظام الحجوزات والترخيص.',
        professionalPhone: 'رقم الهاتف المهني',
        email: 'البريد الإلكتروني المهني',
        degree: 'الشهادة العلمية',
        university: 'الجامعة أو الكلية',
        specialty: 'الاختصاص العام',
        subSpecialty: 'الاختصاص الدقيق',
        experienceYears: 'سنوات الخبرة',
        languages: 'اللغات',
        languagesPlaceholder: 'مثال: العربية، الإنجليزية، الكردية',
        clinicName: 'اسم العيادة أو المركز',
        workAddress: 'عنوان مكان العمل',
        workDaysAndHours: 'أوقات وأيام الدوام',
        consultationDuration: 'مدة الكشف (بالدقائق)',
        consultationFee: 'أجرة الكشف',
        hourlyLimit: 'عدد المواعيد المتاحة في الساعة',
        bookingMode: 'طريقة تأكيد الحجز',
        licenseNumber: 'رقم إجازة ممارسة المهنة / الترخيص',
        licensingAuthority: 'جهة الترخيص',
        licenseExpiryDate: 'تاريخ نفاذ الترخيص',
        documents: 'صور الوثائق المطلوبة للتحقق',
      },
      lab: {
        title: 'استمارة بوابة المختبر',
        subtitle: 'بيانات المسؤول ومعلومات المختبر والترخيص والخدمات المخبرية.',
        managerSection: 'معلومات المسؤول',
        institutionSection: 'معلومات المؤسسة المختبرية',
        professionalPhone: 'رقم الهاتف المهني',
        labNameAr: 'اسم المختبر بالعربية',
        labNameEn: 'اسم المختبر بالإنجليزية',
        directorName: 'اسم المدير أو المسؤول',
        governorate: 'المحافظة',
        district: 'القضاء',
        address: 'العنوان الكامل للمختبر',
        mapLocation: 'موقع المختبر على الخريطة (رابط أو إحداثيات)',
        licenseNumber: 'رقم إجازة المختبر',
        licensingAuthority: 'جهة الترخيص',
        licenseDocuments: 'مستندات الترخيص',
        technicalDirectorName: 'اسم المسؤول الفني',
        services: 'الخدمات والاختصاصات المختبرية',
        workDaysAndHours: 'أوقات وأيام العمل',
        hourlyLimit: 'عدد الحجوزات المتاحة في الساعة',
        bookingMode: 'طريقة تأكيد الحجوزات',
      },
      secretary: {
        title: 'استمارة بوابة السكرتير المستقلة',
        subtitle: 'أنشئ حساب السكرتير المستقل الخاص بك لاستقبال دعوات التوظيف من الأطباء والمختبرات والصيدليات.',
        phone: 'رقم الهاتف',
        educationQualification: 'المؤهل الدراسي',
        previousExperience: 'الخبرة السابقة',
        targetInstitutionName: 'جهة العمل المرتبطة',
        invitationCode: 'معرّف السكرتير',
        permissionWarning:
          'حساب السكرتير مستقل تماماً. لا تُمنح أي صلاحيات طبية أو إدارية عند التسجيل، وتبدأ الصلاحيات فقط عند استلام وقبول دعوة توظيف من الطبيب أو المختبر أو الصيدلية.',
      },
      pharmacy: {
        title: 'استمارة تسجيل الصيدلية',
        subtitle: 'أكمل بيانات الصيدلية والصيدلاني المسؤول وإجازات المزاولة للتحقق والاعتماد.',
        ownerSection: 'بيانات المالك والصيدلاني المسؤول',
        institutionSection: 'معلومات الصيدلية والترخيص والعمل',
        pharmacyNameAr: 'اسم الصيدلية بالعربية',
        pharmacyNameEn: 'اسم الصيدلية بالإنجليزية',
        ownerFullName: 'اسم مالك الصيدلية',
        responsiblePharmacistName: 'اسم الصيدلاني المسؤول',
        pharmacistSyndicateNumber: 'رقم هوية النقابة',
        pharmacyLicenseNumber: 'رقم إجازة فتح الصيدلية',
        licensingAuthority: 'جهة الترخيص',
        licenseExpiryDate: 'تاريخ نفاذ الإجازة',
        professionalPhone: 'رقم الهاتف المهني',
        email: 'البريد الإلكتروني المهني',
        governorate: 'المحافظة',
        district: 'القضاء',
        address: 'العنوان الكامل للصيدلية',
        mapLocation: 'رابط الموقع على الخريطة (اختياري)',
        workingDaysAndHours: 'أوقات وأيام الدوام',
        is24Hours: 'صيدلية خفارة (24 ساعة)',
        deliveryAvailable: 'تفعيل التوصيل للمنازل',
        pickupAvailable: 'تفعيل الاستلام من الصيدلية',
        licenseDocuments: 'مستندات الإجازة وهوية النقابة',
      },
      wholesaler: {
        title: 'استمارة تسجيل المذخر الدوائي',
        subtitle: 'أدخل بيانات الكيان القانوني والمستودع وإجازات المذخر للتحقق والاعتماد من الإدارة العليا.',
        ownerSection: 'بيانات المالك والكيان القانوني',
        institutionSection: 'معلومات المذخر وإجازات العمل',
        wholesalerNameAr: 'اسم المذخر بالعربية',
        wholesalerNameEn: 'اسم المذخر بالإنجليزية',
        ownerFullName: 'اسم المالك أو المدير المفوض',
        legalEntityName: 'اسم الشركة / الكيان القانوني',
        warehouseLicenseNumber: 'رقم إجازة المذخر / المستودع',
        healthAuthorityLicenseNumber: 'رقم موافقة وزارة الصحة / النقابة',
        licensingAuthority: 'جهة الترخيص',
        licenseExpiryDate: 'تاريخ نفاذ الإجازة',
        professionalPhone: 'رقم الهاتف الرسمي',
        email: 'البريد الإلكتروني الرسمي',
        governorate: 'المحافظة',
        district: 'القضاء',
        warehouseAddress: 'عنوان المستودع الكامل',
        mapLocation: 'رابط الموقع على الخريطة (اختياري)',
        workingDaysAndHours: 'ساعات العمل والتجهيز',
        supportedGovernorates: 'مناطق التغطية والمحافظات (مفصولة بفاصلة)',
        minimumOrderIqd: 'الحد الأدنى لطلب التوريد (د.ع)',
        licenseDocuments: 'مستندات إجازة المذخر والكيان القانوني',
      },
    },
    review: {
      stepLabel: 'الخطوة ٣ من ٣ · المراجعة والإرسال',
      title: 'مراجعة البيانات وإرسال الطلب',
      subtitle: 'تأكد من دقة جميع البيانات المدخلة قبل تثبيت الطلب وإرساله.',
      personalSection: 'المعلومات الشخصية',
      portalSection: 'تفاصيل البوابة المختارة',
      documentsSection: 'الوثائق المرفقة',
      noDocuments: 'لا توجد وثائق مرفوعة في هذا القسم.',
      termsConfirm:
        'أقر بأن جميع البيانات والمستندات المقدمة صحيحة وأوافق على شروط الاستخدام وسياسة الخصوصية.',
      submitting: 'جاري تثبيت وإرسال الطلب...',
      duplicateError:
        'يوجد طلب نشط أو قيد المراجعة لهذه البوابة مسبقاً. يمكنك متابعة حالته من صفحة الطلبات.',
    },
    statusView: {
      title: 'متابعة طلبات التسجيل',
      subtitle: 'استعرض حالة طلباتك، أرقام المرجع، وإرشادات الاعتماد أو التعديل.',
      requestNumber: 'رقم الطلب',
      portalType: 'البوابة',
      currentStatus: 'الحالة الحالية',
      activationRule: 'قاعدة التفعيل',
      reasonLabel: 'السبب',
      instructionsLabel: 'التعليمات المطلوبة',
      editAndResubmit: 'تعديل وإعادة الإرسال',
      chooseAnotherPortal: 'التسجيل في بوابة أخرى',
      successTitle: 'تم استلام طلب التسجيل بنجاح',
      successSubtitle: 'تم إنشاء رقم مرجعي فريد وحفظ طلبك في قاعدة البيانات.',
      noRequests: 'لا توجد طلبات تسجيل مسجلة لهذا الحساب بعد.',
      startPortalSelection: 'اختيار بوابة التسجيل',
      statuses: {
        Draft: 'مسودة',
        Submitted: 'تم الإرسال',
        'Under Review': 'قيد المراجعة',
        Approved: 'معتمد ومفعّل',
        Rejected: 'مرفوض',
        'Requires Changes': 'يتطلب تعديلات',
      },
      activationRules: {
        patient_instant: 'تم التفعيل وفق قواعد بوابة المريض.',
        admin_approval: 'بانتظار مراجعة واعتماد الإدارة العليا.',
        institution_approval: 'بانتظار موافقة المؤسسة المرتبط بها وتحديد الصلاحيات.',
      },
    },
    admin: {
      title: 'بوابة الإدارة العليا',
      subtitle: 'الهيكل التنفيذي لإدارة المنصة والمؤسسات والصلاحيات',
      verifiedBadge: 'جلسة إدارية موثقة من الخادم',
      claimsActiveBadge: 'صلاحيات Custom Claims نشطة',
      accessDeniedTitle: 'غير مصرح بالوصول',
      accessDeniedBody:
        'هذا المسار مخصص للإدارة العليا المعتمدة فقط ولا تتوفر صلاحية الوصول لهذا الحساب.',
      returnHome: 'العودة إلى المسار الرئيسي',
      refreshData: 'تحديث البيانات',
      collapseSidebar: 'طي القائمة الجانبية',
      expandSidebar: 'توسيع القائمة الجانبية',
      searchPlaceholder: 'بحث بالاسم، البريد، أو رقم المرجع...',
      allFilter: 'الكل',
      noResults: 'لا توجد نتائج مطابقة للبحث أو التصفية.',
      emptyList: 'لا توجد سجلات متاحة للعرض في هذا القسم حالياً.',
      loadingData: 'جاري تحميل بيانات الإدارة...',
      errorLoading: 'تعذر تحميل البيانات من الخادم. تحقق من الصلاحيات وحاول مجدداً.',
      actionSuccess: 'تم تنفيذ الإجراء وتوثيقه في سجل الأنشطة.',
      paymentGatewayNote:
        'تنويه: لا توجد بوابة دفع إلكتروني مرتبطة حالياً؛ تعرض هذه اللوحة حالات المؤسسات والاشتراكات المسجلة فعلياً فقط دون أي أرقام مالية وهمية.',
      nav: {
        overview: 'لوحة التحكم',
        messages: 'الرسائل الإدارية',
        network_messaging: 'المراسلات الموحدة للشبكة',
        notifications_center: 'مركز الإشعارات و WhatsApp',
        commerce_receipts: 'المشتريات والإيصالات الموحدة',
        institutions: 'الاشتراكات والمؤسسات',
        labs: 'إدارة المختبرات الطبية',
        pharmacies: 'إدارة الصيدليات',
        wholesalers: 'إدارة المذاخر الدوائية',
        haneen_admin: 'إدارة حنين الذكية AI',
        requests: 'طلبات تسجيل المؤسسات',
        ads: 'إدارة الإعلانات',
        reviews: 'مراجعة التقييمات',
        feedback: 'شكاوى وملاحظات المرضى',
        users: 'المستخدمون',
        permissions: 'إدارة الصلاحيات',
        audit_logs: 'سجل الأنشطة',
        settings: 'الإعدادات',
      },
      sectionDescriptions: {
        overview: 'نظرة تنفيذية متكاملة على الرسائل الإدارية وحالات المؤسسات والاشتراكات.',
        messages: 'مركز المراسلات والتنبيهات الرسمية الصادرة والواردة للإدارة العليا.',
        network_messaging: 'مراقبة خيوط المراسلات الموحدة بين كافة أطراف MEDORA وإدارة الخيوط الرسمية.',
        notifications_center:
          'مركز إدارة القنوات (داخل منصة MEDORA وواتساب في وضع المحاكاة الآمن) وقوالب التنبيهات دون أي بيانات طبية.',
        commerce_receipts: 'السجل الموحد لكافة المشتريات (مذخر/صيدلية/طبيب/مراجع)، الإيصالات الثلاثية المربوطة، والأخطاء التشغيلية.',
        institutions: 'سجل العيادات والمختبرات والصيدليات والمذاخر وإدارة حالات الاعتماد والاشتراك.',
        labs: 'متابعة المختبرات الطبية المعتمدة، رقابة التقييمات والشكاوى، والمراسلات الإدارية الرسمية.',
        pharmacies: 'حوكمة الصيدليات المسجلة، متابعة الطلبات والكتالوج الدوائي الموحد، والشكاوى والتعليق.',
        wholesalers: 'حوكمة المذاخر الدوائية، إجازات المستودعات، طلبات التوريد، والرقابة المالية والإدارية.',
        haneen_admin: 'حوكمة حنين الذكية، مصادر المعرفة وإصداراتها، الإعدادات التشغيلية، ومؤشرات الأداء التقنية دون كشف محادثات المرضى.',
        requests: 'مراجعة واعتماد أو رفض طلبات تسجيل المؤسسات والأطباء بموجب قرار إداري موثق.',
        ads: 'إدارة إعلانات الأطباء والمختبرات المعتمدة في Firebase Storage والنشر لبوابة المريض.',
        reviews: 'مراجعة واعتماد أو رفض تقييمات المرضى للأطباء قبل نشرها في الملف العام.',
        feedback: 'متابعة الشكاوى والملاحظات المرسلة من المرضى وتحديث حالتها والرد عليها.',
        users: 'دليل الحسابات المسجلة عبر Google وحالات الحساب الأساسية دون كشف سجلات طبية.',
        permissions: 'عرض أدوار الإدارة العليا المعتمدة ومصفوفة الصلاحيات للقراءة فقط.',
        audit_logs: 'السجل الزمني غير القابل للتعديل لكافة العمليات الحساسة وقرارات الإدارة.',
        settings: 'إعدادات التحقق الخادمي ومعايير المراجعة والأمان في منصة MEDORA.',
      },
      overview: {
        messagesPanelTitle: 'الرسائل الإدارية',
        institutionsPanelTitle: 'الاشتراكات والمؤسسات',
        totalMessages: 'إجمالي الرسائل',
        unreadMessages: 'رسائل جديدة / غير مقروءة',
        totalInstitutions: 'إجمالي المؤسسات',
        activeInstitutions: 'مؤسسات فعّالة',
        pendingInstitutions: 'بانتظار الاعتماد',
        activeSubscriptions: 'اشتراكات نشطة',
        expiredSubscriptions: 'اشتراكات منتهية',
        pendingRequestsCount: 'طلبات تسجيل بانتظار المراجعة',
        viewAll: 'عرض الكل',
        openDetails: 'فتح التفاصيل',
        printReportBtn: 'طباعة التقرير التنفيذي',
        downloadReportPdfBtn: 'تحميل PDF',
        exportingPdf: 'جاري تجهيز PDF...',
      },
      messages: {
        composeTitle: 'إنشاء رسالة أو إشعار إداري',
        composeBtn: 'رسالة إدارية جديدة',
        subject: 'الموضوع',
        category: 'التصنيف',
        body: 'نص الرسالة',
        sendBtn: 'حفظ وإرسال الرسالة',
        sending: 'جاري الحفظ...',
        sender: 'المرسل',
        date: 'التاريخ',
        status: 'الحالة',
        markRead: 'تحديد كمقروءة',
        markReplied: 'تم الرد',
        markArchived: 'أرشفة',
        unreadBadge: 'غير مقروءة',
        readBadge: 'مقروءة',
        categories: {
          system: 'إشعار نظام',
          inquiry: 'استفسار',
          institution_notice: 'تعميم مؤسسي',
          compliance: 'امتثال وترخيص',
        },
        statuses: {
          new: 'جديدة',
          read: 'مقروءة',
          replied: 'تم الرد',
          archived: 'مؤرشفة',
        },
      },
      institutions: {
        name: 'اسم المؤسسة',
        type: 'النوع',
        location: 'الموقع',
        licenseNumber: 'رقم الترخيص',
        approvalStatus: 'حالة الاعتماد',
        subscriptionState: 'حالة الاشتراك',
        planName: 'الخطة',
        expiresAt: 'تاريخ الانتهاء',
        manageBtn: 'إدارة المؤسسة والاشتراك',
        saveChanges: 'حفظ التعديلات',
        saving: 'جاري الحفظ...',
        types: {
          clinic: 'عيادة طبيب',
          lab: 'مختبر طبي',
          pharmacy: 'صيدلية',
          wholesaler: 'مذخر دوائي',
          imagingClosed: 'مركز أشعة — مغلق مؤقت (أرشيف)',
        },
        statuses: {
          pending_approval: 'بانتظار الاعتماد',
          active: 'فعّالة',
          suspended: 'معلّقة',
          rejected: 'مرفوضة',
        },
        subscriptions: {
          none: 'غير محدد',
          trial: 'تجريبي',
          active: 'اشتراك نشط',
          expired: 'منتهي',
        },
      },
      requests: {
        applicant: 'اسم المتقدم',
        email: 'البريد الإلكتروني',
        submittedAt: 'تاريخ التقديم',
        reviewBtn: 'مراجعة الطلب',
        detailsTitle: 'ملف طلب التسجيل والمراجعة الإدارية',
        loadingDetails: 'جاري تحميل تفاصيل الاستمارة والوثائق...',
        attachedDocs: 'الوثائق والمستندات المرفوعة',
        openDoc: 'فتح المستند',
        noDocs: 'لا توجد مستندات مرفوعة مع هذا الطلب.',
        decisionTitle: 'اتخاذ القرار الإداري',
        startReviewBtn: 'تحويل لقيد المراجعة',
        approveBtn: 'اعتماد الطلب وتفعيله',
        requiresChangesBtn: 'طلب تعديلات',
        rejectBtn: 'رفض الطلب',
        rejectionReasonLabel: 'سبب الرفض أو الملاحظة الإدارية',
        rejectionReasonPlaceholder: 'اكتب السبب الواضح لقرار الرفض ليظهر للمتقدم...',
        instructionsLabel: 'التعليمات المطلوبة للتعديل',
        instructionsPlaceholder: 'حدد التعديلات أو الوثائق المطلوبة قبل إعادة التقديم...',
        reasonRequiredError: 'يجب إدخال سبب واضح عند رفض الطلب.',
        instructionsRequiredError: 'يجب توضيح التعديلات المطلوبة عند اختيار يتطلب تعديلات.',
        autoApprovalBlockedNote:
          'لا يتم اعتماد طلبات الأطباء والمختبرات تلقائياً؛ يتطلب التفعيل قراراً موثقاً من الإدارة العليا.',
      },
      users: {
        name: 'الاسم',
        email: 'البريد الإلكتروني',
        portal: 'البوابة المختارة',
        accountStatus: 'حالة الحساب',
        governorate: 'المحافظة',
        lastLogin: 'آخر دخول',
        noMedicalRecordsNote:
          'يعرض هذا الدليل بيانات الحساب الأساسية فقط لحماية سرية السجلات الطبية.',
        statuses: {
          pending_profile: 'بانتظار الملف الشخصي',
          profile_completed: 'الملف الشخصي مكتمل',
          pending_review: 'بانتظار المراجعة',
          active: 'نشط',
          restricted: 'مقيد',
          suspended: 'معلق',
        },
      },
      permissions: {
        readOnlyTitle: 'حماية صلاحيات الإدارة العليا',
        readOnlyBody:
          'يُدار دور Super Admin حصرياً عبر سياسة الخادم و Firebase Custom Claims ولا يمكن منحه أو سحبه أو تعديله من الواجهة الأمامية.',
        roleLabel: 'الدور',
        activeLabel: 'الحالة',
        grantedByLabel: 'مصدر المنح',
        activeBadge: 'نشط ومعتمد',
        inactiveBadge: 'غير نشط',
        policyMatrixTitle: 'مصفوفة صلاحيات البوابات المعتمدة',
      },
      auditLogs: {
        action: 'الإجراء',
        actor: 'المنفّذ',
        target: 'الهدف',
        details: 'التفاصيل والنتيجة',
        timestamp: 'التوقيت',
      },
      settings: {
        serverVerificationTitle: 'حالة التحقق الخادمي والأمان',
        adminSdkLabel: 'اتصال الخادم الإداري الموثق',
        allowlistLabel: 'قائمة حسابات الإدارة المعتمدة',
        claimsLabel: 'صلاحيات Custom Claims',
        projectLabel: 'معرّف المشروع',
        databaseLabel: 'قاعدة بيانات Firestore',
        configured: 'مفعّل ومضبوط',
        missing: 'غير مضبوط في البيئة',
        active: 'نشط وموثق',
        governanceRulesTitle: 'قواعد الحوكمة والاعتماد النشطة',
        governanceRules: [
          'حسابات الأطباء والمختبرات تبقى بانتظار المراجعة حتى اعتماد الإدارة العليا.',
          'حساب السكرتير لا يمنح صلاحيات تلقائية ويتطلب موافقة المؤسسة المرتبط بها.',
          'بوابة المريض تُفعّل وفق شروط السياسة المعتمدة دون تعريض السجلات للإدارة.',
          'كافة عمليات الإدارة موثقة بالزمن في مجموعة audit_logs غير القابلة للتعديل.',
        ],
      },
      ads: {
        createBtn: 'إضافة إعلان',
        editTitle: 'تعديل الإعلان',
        createTitle: 'إضافة إعلان جديد',
        categoryLabel: 'القسم',
        categories: {
          doctor: 'الأطباء',
          lab: 'المختبرات',
        },
        entityLabel: 'الجهة المعتمدة',
        doctorLabel: 'الجهة المعتمدة',
        titleLabel: 'عنوان الإعلان (اختياري)',
        titlePlaceholder: 'اتركه فارغاً إذا كانت الصورة تحتوي على العنوان...',
        descriptionLabel: 'وصف الإعلان (اختياري)',
        descriptionPlaceholder: 'وصف موجز يظهر للمريض تحت العنوان (اختياري)...',
        imageLabel: 'صورة الإعلان (1200 × 600 بكسل · نسبة 2:1)',
        imageSpecsHint: 'الأبعاد المستهدفة 1200×600 (نسبة 2:1) · الحد الأقصى 5 MB · JPG / PNG / WebP — لا يتم تكبير الصور الصغيرة',
        imageUrlPlaceholder: 'يتم حفظ الصورة وتجهيز رابطها تلقائياً بعد المعالجة والضغط',
        uploadImageBtn: 'رفع صورة الإعلان من الهاتف أو الجهاز',
        uploadingImageBtn: 'جاري الضغط والرفع...',
        storageSavedBadge: 'محفوظة في Storage',
        assetsSavedBadge: 'صورة محفوظة وجاهزة',
        storageMissingBadge: 'لم يتم رفع صورة صالحة بعد',
        storageFallbackNotice: 'ملاحظة التخزين: حاوية Firebase Storage غير مفعّلة في هذا المشروع؛ يتم ضغط الصورة (<= 320 KB) وحفظها بأمان داخل medora_ad_assets وتقديمها عبر الخادم.',
        ctaLabel: 'نص زر الإجراء',
        useDateRangeLabel: 'تحديد تاريخ بداية ونهاية للعرض',
        ongoingLabel: 'عرض مستمر (بدون تاريخ انتهاء)',
        startDateLabel: 'تاريخ بداية العرض',
        endDateLabel: 'تاريخ نهاية العرض',
        priorityLabel: 'الأولوية',
        activeLabel: 'حالة النشر',
        statusLabel: 'حالة الإعلان',
        draftStatus: 'مسودة',
        publishedStatus: 'منشور',
        pausedStatus: 'متوقف',
        expiredStatus: 'منتهي',
        activeStatus: 'منشور',
        inactiveStatus: 'متوقف',
        approvedByAdminBadge: 'صادر من الإدارة العليا',
        legacyRecordBadge: 'سجل إعلان غير نشط',
        filters: {
          all: 'جميع الإعلانات',
          published: 'المنشورة',
          draft: 'المسودات',
          paused: 'المتوقفة',
          expired: 'المنتهية',
        },
        dragDropHint: 'اختر صورة JPG أو PNG أو WebP بحد أقصى 5 MB (سيتم ضغطها بنسبة 2:1)',
        previewTitle: 'معاينة الإعلان قبل النشر (تطابق بوابة المريض)',
        publishBtn: 'نشر الإعلان',
        pauseBtn: 'إيقاف الإعلان',
        republishBtn: 'إعادة نشر',
        saveBtn: 'حفظ ونشر',
        saveDraftBtn: 'حفظ كمسودة',
        saveChangesBtn: 'حفظ التعديلات',
        deleteBtn: 'حذف الإعلان',
        confirmDeletePrompt: 'هل تريد حذف هذا الإعلان نهائياً؟ سيتم أيضاً حذف ملف الصورة المرتبط إذا لم يعد مستخدماً.',
        noDoctorsHint: 'لا توجد جهات معتمدة متاحة في هذا القسم حالياً.',
        noEntitiesHint: 'لا توجد جهات معتمدة متاحة في هذا القسم حالياً.',
        imageRequiredError: 'يرجى رفع صورة إعلان صالحة (JPG/PNG/WebP بحد أقصى 5 MB) قبل الحفظ.',
        republishExpiredHint: 'انتهى تاريخ العرض — قم بتعديل الإعلان وتمديد تاريخ الانتهاء لإعادة نشره.',
      },
      reviews: {
        doctorLabel: 'الطبيب',
        patientLabel: 'المريض',
        ratingLabel: 'التقييم',
        commentLabel: 'التعليق',
        moderationNoteLabel: 'ملاحظة المراجعة (اختياري)',
        approveBtn: 'اعتماد ونشر',
        rejectBtn: 'رفض التقييم',
        statuses: {
          pending: 'بانتظار المراجعة',
          approved: 'معتمد ومنشور',
          rejected: 'مرفوض',
        },
      },
      feedback: {
        patientLabel: 'المريض',
        categoryLabel: 'التصنيف',
        subjectLabel: 'الموضوع',
        messageLabel: 'نص الشكوى / الملاحظة',
        replyLabel: 'الرد الإداري للمريض',
        saveBtn: 'تحديث الحالة والرد',
        manageBtn: 'مراجعة والرد',
        statuses: {
          new: 'جديدة',
          in_review: 'قيد المراجعة',
          resolved: 'تم الحل',
          closed: 'مغلقة',
        },
      },
    },
  },
  en: {
    common: {
      brandName: 'MEDORA',
      tagline: 'YOUR HEALTH · OUR PRIORITY',
      backToIntro: 'Back to Intro',
      back: 'Back',
      next: 'Continue',
      saveAndContinue: 'Save & Continue',
      submitRequest: 'Submit Registration',
      edit: 'Edit',
      cancel: 'Cancel',
      close: 'Close',
      required: 'Required',
      optional: 'Optional',
      loading: 'Loading...',
      signOut: 'Sign Out',
      switchAccount: 'Switch Google Account',
      darkMode: 'Dark Mode',
      lightMode: 'Light Mode',
      arabic: 'العربية',
      english: 'English',
      uploadFile: 'Upload File',
      uploading: 'Uploading...',
      remove: 'Remove',
      years: 'years',
      minutes: 'min',
      iqd: 'IQD',
      perHour: 'per hour',
      manual: 'Manual',
      auto: 'Automatic',
      male: 'Male',
      female: 'Female',
      selectOption: 'Select...',
      captureLocation: 'Use Current Coordinates',
      locationCaptured: 'Coordinates captured',
    },
    auth: {
      title: 'Sign In or Create Account',
      subtitle:
        'Authenticate with your verified Google account to continue to your chosen MEDORA portal.',
      continueWithGoogle: 'Continue with Google',
      continueWithGoogleRedirect: 'Continue via Google Redirect (Mobile Friendly)',
      openInNewTabForSignIn: 'Open MEDORA in a New Tab to Sign In',
      iframePopupHint:
        'If your browser blocked the popup inside an embedded preview, allow popups or open MEDORA in a separate browser tab.',
      redirectingToGoogle: 'Redirecting to Google secure sign-in...',
      signingIn: 'Verifying Google account...',
      verifyingAccount: 'Verifying account, permissions, and portal records...',
      selectedPortalLabel: 'Selected Portal',
      backToPortalSelection: 'Back to Portal Selection',
      signedInAsLabel: 'Currently Signed In',
      continueToSelectedPortal: 'Continue to Selected Portal',
      signInDifferentGoogle: 'Switch Google Account',
      superAdminUnauthorized:
        'This account is not authorized to access the Super Admin portal.',
      securityNote:
        'Passwords and access tokens are never stored in Firestore. Authentication is handled via Google.',
      privacyPolicy: 'Privacy Policy',
      termsOfUse: 'Terms of Use',
      privacyBody: [
        'MEDORA protects personal and clinical onboarding data using strict access controls and encrypted transport.',
        'Your email and core profile details are used strictly for identity verification, request tracking, and authorized portal activation.',
        'Institutional records and permissions remain strictly isolated across independent accounts.',
      ],
      termsBody: [
        'Applicants certify the accuracy of all professional credentials and licensing documents submitted.',
        'Doctor and Laboratory accounts require administrative approval. Secretary accounts require institution owner approval.',
        'MEDORA administration reserves the right to reject or suspend inaccurate or expired registrations.',
      ],
      errors: {
        popupClosed: 'The Google sign-in window was closed before authentication completed.',
        popupBlocked: 'Popup was blocked by your browser. Please allow popups or use the fallback option below.',
        network: 'Network error during authentication. Please check your connection.',
        cancelled: 'The authentication request was cancelled. Please try again.',
        unauthorizedDomain:
          'The current domain is not listed under Firebase Authentication > Settings > Authorized domains:',
        unauthorizedDomainHint:
          'Add the hostname above in Firebase Console for this project and try again.',
        operationNotAllowed:
          'Google Sign-In provider is not enabled in Firebase Authentication settings.',
        webStorageUnsupported:
          'Browser storage or third-party cookies required for authentication are blocked.',
        userDisabled: 'This user account has been disabled in Firebase Authentication.',
        tooManyRequests: 'Too many sign-in attempts. Please wait a moment and try again.',
        accountExistsWithDifferentCredential:
          'An account already exists with this email using a different sign-in method.',
        invalidCredential:
          'Google authentication credential is invalid or expired. Please try again.',
        emailNotVerified:
          'Your Google account email must be verified to continue in MEDORA.',
        permissionDenied:
          'Could not initialize your user session due to Firestore access rules. Ensure your Google email is verified and try again.',
        redirectMissingResult:
          'Google redirect returned without an active session (cookies may be blocked or sign-in was cancelled). Please try "Continue with Google" again.',
        iframeRedirectBlocked:
          'Google blocks redirect sign-in inside an embedded frame. Please allow popups or open MEDORA in a new browser tab.',
        internalError:
          'A temporary authentication error occurred with Google. Please try again or open MEDORA in a new tab.',
        generic: 'Unable to complete Google Sign-In. Please try again.',
      },
    },
    personal: {
      stepLabel: 'Step 1 of 3 · Personal Details',
      title: 'Shared Personal Information',
      subtitle:
        'Saved once to your general MEDORA profile and reused automatically across portals.',
      googleLinkedHint: 'Base name and email were pre-filled from your Google account.',
      fullName: 'Full Name (Three-Part)',
      dateOfBirth: 'Date of Birth',
      age: 'Age (Auto-calculated)',
      gender: 'Gender',
      governorate: 'Governorate',
      district: 'District',
      address: 'Neighborhood or Residential Address',
      phone: 'Phone Number (if needed)',
      avatar: 'Profile Photo',
      avatarHint: 'Optional — JPG, PNG, or WebP up to 2MB',
      noNationalIdNote: 'National ID card numbers are not required.',
      errors: {
        fullName: 'Please enter your full name.',
        dob: 'Please select your date of birth.',
        gender: 'Please select your gender.',
        governorate: 'Please select a governorate.',
        district: 'Please enter or select a district.',
        address: 'Please enter your residential address.',
      },
    },
    portals: {
      welcomeTitle: 'Welcome to MEDORA',
      choosePortalSubtitle: 'Choose the portal you want to access',
      changePortalBtn: 'Change Portal',
      stepLabel: 'Step 2 of 3 · Portal Selection',
      title: 'Select Your Registration Portal',
      subtitle:
        'Choose the portal that matches your role to complete its dedicated onboarding form.',
      viewRequests: 'Track Submitted Requests',
      independenceTitle: 'Portal Independence Notice',
      independenceNotice:
        'You already have a registered request. Selecting another portal creates an independent application without deleting prior requests or transferring institutional permissions.',
      selectPortalAction: 'Select Portal',
      alreadyActiveBadge: 'Existing Request',
      superAdminCard: {
        title: 'Executive Governance — Super Admin',
        subtitle:
          'Executive console for managing medical institutions, subscriptions, administrative notices, and request approvals.',
        activationNote:
          'Requires authorized Super Admin Google sign-in and server verification.',
        badge: 'Executive Admin',
        action: 'Enter Super Admin Portal',
      },
      items: {
        patient: {
          title: 'Patient Portal',
          subtitle: 'Manage personal health records, bookings, and medical results.',
          activationNote: 'Activates upon registration completion and policy consent.',
        },
        doctor: {
          title: 'Doctor Portal',
          subtitle: 'Register your clinic, specialty, schedule, and medical license.',
          activationNote: 'Remains pending until reviewed and approved by administration.',
        },
        lab: {
          title: 'Laboratory Portal',
          subtitle: 'Register your medical laboratory, technical lead, and test services.',
          activationNote: 'Remains pending until reviewed and approved by administration.',
        },
        secretary: {
          title: 'Secretary Portal',
          subtitle: 'Independent secretary account to receive and accept hiring invitations from Doctors, Labs, and Pharmacies.',
          activationNote: 'Account activates independently; employer permissions begin only after accepting their invitation.',
        },
        pharmacy: {
          title: 'Pharmacy Portal',
          subtitle: 'Manage medicine stock, FEFO batches, prescription review, patient orders, and wholesaler supply.',
          activationNote: 'Remains pending until pharmacy license and documents are approved by Super Admin.',
        },
        wholesaler: {
          title: 'Wholesaler Portal',
          subtitle: 'Manage wholesale inventory, batches, pharmacy supply orders, dispatches, and statements.',
          activationNote: 'Remains pending until warehouse & Ministry of Health licenses are approved by Super Admin.',
        },
      },
    },
    forms: {
      sharedSummaryTitle: 'Verified Shared Personal Information',
      editPersonalInfo: 'Edit Personal Details',
      fileValidationHint: 'Allowed: JPG, PNG, WebP, PDF up to 5MB per file.',
      patient: {
        title: 'Patient Portal Form',
        subtitle: 'Confirm your personal profile and optionally add an emergency contact.',
        emergencyTitle: 'Emergency Contact',
        emergencyName: 'Contact Name',
        emergencyPhone: 'Emergency Phone',
        emergencyRelation: 'Relationship',
        policyConsent: 'I agree to the MEDORA Privacy Policy and Terms of Use.',
        activationNotice: 'Your patient profile activates immediately after confirmation.',
      },
      doctor: {
        title: 'Doctor Portal Form',
        subtitle: 'Provide academic credentials, clinic details, scheduling, and licensing.',
        professionalPhone: 'Professional Phone',
        email: 'Professional Email',
        degree: 'Academic Degree',
        university: 'University / College',
        specialty: 'General Specialty',
        subSpecialty: 'Sub-Specialty',
        experienceYears: 'Years of Experience',
        languages: 'Languages',
        languagesPlaceholder: 'e.g., Arabic, English, Kurdish',
        clinicName: 'Clinic or Center Name',
        workAddress: 'Practice Address',
        workDaysAndHours: 'Working Days & Hours',
        consultationDuration: 'Consultation Duration (min)',
        consultationFee: 'Consultation Fee',
        hourlyLimit: 'Appointments per Hour',
        bookingMode: 'Booking Confirmation Mode',
        licenseNumber: 'Medical License Number',
        licensingAuthority: 'Licensing Authority',
        licenseExpiryDate: 'License Expiry Date',
        documents: 'Verification Documents',
      },
      lab: {
        title: 'Laboratory Portal Form',
        subtitle: 'Provide manager info, laboratory details, license, and test catalog.',
        managerSection: 'Manager Information',
        institutionSection: 'Laboratory Institution Details',
        professionalPhone: 'Professional Phone',
        labNameAr: 'Laboratory Name (Arabic)',
        labNameEn: 'Laboratory Name (English)',
        directorName: 'Director / Manager Name',
        governorate: 'Governorate',
        district: 'District',
        address: 'Full Laboratory Address',
        mapLocation: 'Map Location (URL or Coordinates)',
        licenseNumber: 'Laboratory License Number',
        licensingAuthority: 'Licensing Authority',
        licenseDocuments: 'Licensing Documents',
        technicalDirectorName: 'Technical Director Name',
        services: 'Laboratory Specialties & Services',
        workDaysAndHours: 'Operating Days & Hours',
        hourlyLimit: 'Bookings per Hour',
        bookingMode: 'Booking Confirmation Mode',
      },
      secretary: {
        title: 'Independent Secretary Portal Form',
        subtitle: 'Create your standalone secretary account to receive hiring invitations from clinics, laboratories, and pharmacies.',
        phone: 'Phone Number',
        educationQualification: 'Educational Qualification',
        previousExperience: 'Previous Experience',
        targetInstitutionName: 'Linked Entity',
        invitationCode: 'Secretary Code',
        permissionWarning:
          'Secretary accounts are completely independent. No employer access or permissions are granted until a Doctor, Lab, or Pharmacy sends an invitation and you explicitly accept it.',
      },
      pharmacy: {
        title: 'Pharmacy Portal Registration',
        subtitle: 'Provide pharmacy details, responsible pharmacist syndicate ID, and official license documents.',
        ownerSection: 'Owner & Responsible Pharmacist',
        institutionSection: 'Pharmacy Details, Hours & Licensing',
        pharmacyNameAr: 'Pharmacy Name (Arabic)',
        pharmacyNameEn: 'Pharmacy Name (English)',
        ownerFullName: 'Pharmacy Owner Name',
        responsiblePharmacistName: 'Responsible Pharmacist Name',
        pharmacistSyndicateNumber: 'Syndicate Membership Number',
        pharmacyLicenseNumber: 'Pharmacy License Number',
        licensingAuthority: 'Licensing Authority',
        licenseExpiryDate: 'License Expiry Date',
        professionalPhone: 'Professional Phone',
        email: 'Professional Email',
        governorate: 'Governorate',
        district: 'District',
        address: 'Full Pharmacy Address',
        mapLocation: 'Map Location Link (Optional)',
        workingDaysAndHours: 'Working Days & Hours',
        is24Hours: '24/7 Duty Pharmacy',
        deliveryAvailable: 'Enable Home Delivery',
        pickupAvailable: 'Enable In-Pharmacy Pickup',
        licenseDocuments: 'Pharmacy License & Syndicate Documents',
      },
      wholesaler: {
        title: 'Pharmaceutical Wholesaler Registration',
        subtitle: 'Provide warehouse details, legal entity info, and Ministry of Health licensing documents.',
        ownerSection: 'Owner & Legal Entity',
        institutionSection: 'Warehouse Operations & Licensing',
        wholesalerNameAr: 'Wholesaler Name (Arabic)',
        wholesalerNameEn: 'Wholesaler Name (English)',
        ownerFullName: 'Owner / Authorized Director',
        legalEntityName: 'Registered Legal Entity Name',
        warehouseLicenseNumber: 'Warehouse License Number',
        healthAuthorityLicenseNumber: 'Ministry of Health / Syndicate License No.',
        licensingAuthority: 'Licensing Authority',
        licenseExpiryDate: 'License Expiry Date',
        professionalPhone: 'Official Phone',
        email: 'Official Email',
        governorate: 'Governorate',
        district: 'District',
        warehouseAddress: 'Full Warehouse Address',
        mapLocation: 'Map Location Link (Optional)',
        workingDaysAndHours: 'Operating & Dispatch Hours',
        supportedGovernorates: 'Covered Governorates (comma-separated)',
        minimumOrderIqd: 'Minimum Supply Order (IQD)',
        licenseDocuments: 'Warehouse & Authority License Documents',
      },
    },
    review: {
      stepLabel: 'Step 3 of 3 · Review & Submit',
      title: 'Review & Submit Application',
      subtitle: 'Verify all details carefully before submitting your registration.',
      personalSection: 'Shared Personal Details',
      portalSection: 'Portal Application Details',
      documentsSection: 'Attached Documents',
      noDocuments: 'No documents attached.',
      termsConfirm:
        'I confirm all submitted details and documents are accurate and agree to the MEDORA Terms & Privacy Policy.',
      submitting: 'Submitting registration...',
      duplicateError:
        'An active or pending request already exists for this portal. View its status in Request Tracking.',
    },
    statusView: {
      title: 'Registration Request Tracking',
      subtitle: 'Monitor request status, reference numbers, and review instructions.',
      requestNumber: 'Request Number',
      portalType: 'Portal',
      currentStatus: 'Status',
      activationRule: 'Activation Rule',
      reasonLabel: 'Reason',
      instructionsLabel: 'Required Instructions',
      editAndResubmit: 'Edit & Resubmit',
      chooseAnotherPortal: 'Register Another Portal',
      successTitle: 'Registration Submitted Successfully',
      successSubtitle: 'A unique reference number has been generated and saved.',
      noRequests: 'No registration requests found for this account yet.',
      startPortalSelection: 'Select a Portal',
      statuses: {
        Draft: 'Draft',
        Submitted: 'Submitted',
        'Under Review': 'Under Review',
        Approved: 'Approved',
        Rejected: 'Rejected',
        'Requires Changes': 'Requires Changes',
      },
      activationRules: {
        patient_instant: 'Activated per Patient Portal rules.',
        admin_approval: 'Pending Super Admin review and approval.',
        institution_approval: 'Pending linked institution approval and role assignment.',
      },
    },
    admin: {
      title: 'Super Admin Portal',
      subtitle: 'Executive governance console for MEDORA institutions, access, and audit',
      verifiedBadge: 'Server-Verified Admin Session',
      claimsActiveBadge: 'Custom Claims Active',
      accessDeniedTitle: 'Access Denied',
      accessDeniedBody:
        'This route is restricted to verified Super Administrators. This account is not authorized.',
      returnHome: 'Return to Application',
      refreshData: 'Refresh Data',
      collapseSidebar: 'Collapse sidebar',
      expandSidebar: 'Expand sidebar',
      searchPlaceholder: 'Search by name, email, or reference number...',
      allFilter: 'All',
      noResults: 'No records match your current search or filter.',
      emptyList: 'No records available in this section yet.',
      loadingData: 'Loading administrative records...',
      errorLoading: 'Unable to load records from the server. Check permissions and try again.',
      actionSuccess: 'Action completed and recorded in the audit log.',
      paymentGatewayNote:
        'Note: No payment gateway is connected yet; this console displays actual institutional statuses and subscription states without simulated financial figures.',
      nav: {
        overview: 'Dashboard Overview',
        messages: 'Admin Messages',
        network_messaging: 'Cross-Portal Messaging',
        notifications_center: 'Notifications & WhatsApp',
        commerce_receipts: 'Commerce & 3-Party Receipts',
        institutions: 'Subscriptions & Institutions',
        labs: 'MEDORA LAB Governance',
        pharmacies: 'MEDORA PHARMACY Governance',
        wholesalers: 'MEDORA WHOLESALER Governance',
        haneen_admin: 'HANEEN AI Governance',
        requests: 'Institution Requests',
        ads: 'Ad Management',
        reviews: 'Doctor Reviews',
        feedback: 'Patient Feedback',
        users: 'Users',
        permissions: 'Permissions',
        audit_logs: 'Audit Logs',
        settings: 'Settings',
      },
      sectionDescriptions: {
        overview: 'Side-by-side executive summary of administrative messages and institutional subscriptions.',
        messages: 'Official administrative communications and compliance notices center.',
        network_messaging: 'Inspect and participate in unified cross-portal messaging threads across MEDORA entities.',
        notifications_center:
          'Unified Two-Channel Notification Center (MEDORA In-App & WhatsApp Simulation) with privacy-safe templates.',
        commerce_receipts: 'Unified ledger of all 3-flow orders, 3-party linked receipts (print/void/amend), and operational errors.',
        institutions: 'Registered clinics, laboratories, pharmacies, wholesalers, and subscription management.',
        labs: 'Monitor registered laboratories, moderate patient reviews/complaints, and manage official threads.',
        pharmacies: 'Govern registered pharmacies, central canonical medicine catalog, orders, and compliance.',
        wholesalers: 'Govern pharmaceutical wholesalers, warehouse licenses, B2B supply orders, and disputes.',
        haneen_admin: 'Manage HANEEN AI knowledge sources, versions, operational controls, and aggregate technical metrics without exposing patient chats.',
        requests: 'Review, approve, reject, or request changes on incoming institutional applications.',
        ads: 'Create, approve, pause, and manage Firebase Storage-backed ads for Doctors and Labs.',
        reviews: 'Moderate patient-submitted doctor reviews before publishing them publicly.',
        feedback: 'Review patient complaints, booking issues, and suggestions with admin replies.',
        users: 'Safe directory of Google-authenticated MEDORA accounts without exposing clinical records.',
        permissions: 'Read-only registry of verified Super Admin roles and portal access policies.',
        audit_logs: 'Immutable chronological record of sensitive system and administrative actions.',
        settings: 'Server verification posture, database status, and MEDORA review governance.',
      },
      overview: {
        messagesPanelTitle: 'Admin Messages',
        institutionsPanelTitle: 'Subscriptions & Institutions',
        totalMessages: 'Total Messages',
        unreadMessages: 'New / Unread',
        totalInstitutions: 'Total Institutions',
        activeInstitutions: 'Active Institutions',
        pendingInstitutions: 'Pending Approval',
        activeSubscriptions: 'Active Subscriptions',
        expiredSubscriptions: 'Expired Subscriptions',
        pendingRequestsCount: 'Pending Registration Requests',
        viewAll: 'View All',
        openDetails: 'Open Details',
        printReportBtn: 'Print Executive Report',
        downloadReportPdfBtn: 'Download PDF',
        exportingPdf: 'Preparing PDF...',
      },
      messages: {
        composeTitle: 'Compose Official Admin Message',
        composeBtn: 'New Admin Message',
        subject: 'Subject',
        category: 'Category',
        body: 'Message Body',
        sendBtn: 'Save & Dispatch Notice',
        sending: 'Saving...',
        sender: 'Sender',
        date: 'Date',
        status: 'Status',
        markRead: 'Mark Read',
        markReplied: 'Mark Replied',
        markArchived: 'Archive',
        unreadBadge: 'Unread',
        readBadge: 'Read',
        categories: {
          system: 'System Alert',
          inquiry: 'Inquiry',
          institution_notice: 'Institution Notice',
          compliance: 'Compliance',
        },
        statuses: {
          new: 'New',
          read: 'Read',
          replied: 'Replied',
          archived: 'Archived',
        },
      },
      institutions: {
        name: 'Institution Name',
        type: 'Type',
        location: 'Location',
        licenseNumber: 'License #',
        approvalStatus: 'Approval Status',
        subscriptionState: 'Subscription State',
        planName: 'Plan',
        expiresAt: 'Expires At',
        manageBtn: 'Manage Institution & Subscription',
        saveChanges: 'Save Changes',
        saving: 'Saving...',
        types: {
          clinic: 'Doctor Clinic',
          lab: 'Medical Lab',
          pharmacy: 'Pharmacy',
          wholesaler: 'Wholesaler',
          imagingClosed: 'Imaging Center — Temporarily Closed (Archive)',
        },
        statuses: {
          pending_approval: 'Pending Approval',
          active: 'Active',
          suspended: 'Suspended',
          rejected: 'Rejected',
        },
        subscriptions: {
          none: 'None',
          trial: 'Trial',
          active: 'Active',
          expired: 'Expired',
        },
      },
      requests: {
        applicant: 'Applicant',
        email: 'Email',
        submittedAt: 'Submitted',
        reviewBtn: 'Review Request',
        detailsTitle: 'Registration Application & Administrative Review',
        loadingDetails: 'Loading full application details and documents...',
        attachedDocs: 'Uploaded Verification Documents',
        openDoc: 'Open Document',
        noDocs: 'No documents uploaded with this application.',
        decisionTitle: 'Administrative Decision',
        startReviewBtn: 'Mark Under Review',
        approveBtn: 'Approve & Activate',
        requiresChangesBtn: 'Request Changes',
        rejectBtn: 'Reject Application',
        rejectionReasonLabel: 'Rejection Reason or Admin Note',
        rejectionReasonPlaceholder: 'Provide a clear rejection reason for the applicant...',
        instructionsLabel: 'Required Change Instructions',
        instructionsPlaceholder: 'Specify corrections or missing documents required before resubmission...',
        reasonRequiredError: 'A clear reason is required when rejecting an application.',
        instructionsRequiredError: 'Please provide instructions when requesting changes.',
        autoApprovalBlockedNote:
          'Doctor and Lab registrations are never auto-approved; explicit documented Super Admin action is required.',
      },
      users: {
        name: 'Name',
        email: 'Email',
        portal: 'Selected Portal',
        accountStatus: 'Account Status',
        governorate: 'Governorate',
        lastLogin: 'Last Login',
        noMedicalRecordsNote:
          'This directory exposes account metadata only to preserve patient and clinical confidentiality.',
        statuses: {
          pending_profile: 'Pending Profile',
          profile_completed: 'Profile Completed',
          pending_review: 'Pending Review',
          active: 'Active',
          restricted: 'Restricted',
          suspended: 'Suspended',
        },
      },
      permissions: {
        readOnlyTitle: 'Super Admin Privilege Protection',
        readOnlyBody:
          'Super Admin roles are provisioned exclusively by server policy and Firebase Custom Claims. They cannot be modified or revoked from the frontend UI.',
        roleLabel: 'Role',
        activeLabel: 'Status',
        grantedByLabel: 'Provisioned By',
        activeBadge: 'Active & Verified',
        inactiveBadge: 'Inactive',
        policyMatrixTitle: 'Portal Role Access Matrix',
      },
      auditLogs: {
        action: 'Action',
        actor: 'Actor',
        target: 'Target',
        details: 'Details & Outcome',
        timestamp: 'Timestamp',
      },
      settings: {
        serverVerificationTitle: 'Server Verification & Security Posture',
        adminSdkLabel: 'Trusted Admin Server SDK',
        allowlistLabel: 'Approved Admin Allowlist',
        claimsLabel: 'Custom Claims Enforcement',
        projectLabel: 'Project ID',
        databaseLabel: 'Firestore Database',
        configured: 'Configured',
        missing: 'Not Set in Env',
        active: 'Active & Enforced',
        governanceRulesTitle: 'Active Governance Rules',
        governanceRules: [
          'Doctor and Lab registrations remain pending until explicit Super Admin approval.',
          'Secretary registrations grant zero automatic permissions and require institution approval.',
          'Patient accounts activate per Patient Policy without exposing clinical records to admin views.',
          'Every administrative decision is immutably logged in audit_logs with actor and timestamp.',
        ],
      },
      ads: {
        createBtn: 'Add Ad',
        editTitle: 'Edit Advertisement',
        createTitle: 'Create Advertisement',
        categoryLabel: 'Category',
        categories: {
          doctor: 'Doctors',
          lab: 'Laboratories',
        },
        entityLabel: 'Approved Provider / Facility',
        doctorLabel: 'Approved Provider',
        titleLabel: 'Ad Title (optional)',
        titlePlaceholder: 'Leave blank if the banner image already contains text...',
        descriptionLabel: 'Ad Description (optional)',
        descriptionPlaceholder: 'Short optional caption shown below the title...',
        imageLabel: 'Ad Banner Image (1200 × 600 px · 2:1)',
        imageSpecsHint: 'Target 1200×600 (2:1) · Max 5 MB · JPG / PNG / WebP — small images are never upscaled',
        imageUrlPlaceholder: 'Image link is generated automatically after compression & upload',
        uploadImageBtn: 'Upload Ad Image from Device',
        uploadingImageBtn: 'Compressing & Uploading...',
        storageSavedBadge: 'Stored in Storage',
        assetsSavedBadge: 'Image Saved & Ready',
        storageMissingBadge: 'No valid ad image uploaded yet',
        storageFallbackNotice: 'Storage Note: Native Firebase Storage bucket is not initialized on this project; compressed images (<= 320 KB) are securely stored in medora_ad_assets and served by the backend.',
        ctaLabel: 'CTA Button Label',
        useDateRangeLabel: 'Set start and end display dates',
        ongoingLabel: 'Ongoing (no expiration date)',
        startDateLabel: 'Start Date',
        endDateLabel: 'End Date',
        priorityLabel: 'Priority',
        activeLabel: 'Publish State',
        statusLabel: 'Ad Status',
        draftStatus: 'Draft',
        publishedStatus: 'Published',
        pausedStatus: 'Paused',
        expiredStatus: 'Expired',
        activeStatus: 'Published',
        inactiveStatus: 'Paused',
        approvedByAdminBadge: 'Super Admin Ad',
        legacyRecordBadge: 'Inactive Legacy Record',
        filters: {
          all: 'All Ads',
          published: 'Published',
          draft: 'Drafts',
          paused: 'Paused',
          expired: 'Expired',
        },
        dragDropHint: 'Choose JPG, PNG, or WebP up to 5 MB (auto-optimized for 2:1 display)',
        previewTitle: 'Live Preview Before Publishing',
        publishBtn: 'Publish Ad',
        pauseBtn: 'Pause Ad',
        republishBtn: 'Republish Ad',
        saveBtn: 'Save & Publish',
        saveDraftBtn: 'Save as Draft',
        saveChangesBtn: 'Save Changes',
        deleteBtn: 'Delete Ad',
        confirmDeletePrompt: 'Permanently delete this advertisement? Unused image assets will also be cleaned up safely.',
        noDoctorsHint: 'No approved providers available in this category yet.',
        noEntitiesHint: 'No approved providers available in this category yet.',
        imageRequiredError: 'Please upload a valid JPG, PNG, or WebP image (max 5 MB) before saving.',
        republishExpiredHint: 'End date has passed — edit and extend the end date to republish.',
      },
      reviews: {
        doctorLabel: 'Doctor',
        patientLabel: 'Patient',
        ratingLabel: 'Rating',
        commentLabel: 'Review Comment',
        moderationNoteLabel: 'Moderation Note (optional)',
        approveBtn: 'Approve & Publish',
        rejectBtn: 'Reject Review',
        statuses: {
          pending: 'Pending Review',
          approved: 'Approved',
          rejected: 'Rejected',
        },
      },
      feedback: {
        patientLabel: 'Patient',
        categoryLabel: 'Category',
        subjectLabel: 'Subject',
        messageLabel: 'Message',
        replyLabel: 'Admin Reply',
        saveBtn: 'Update Status & Reply',
        manageBtn: 'Review & Reply',
        statuses: {
          new: 'New',
          in_review: 'In Review',
          resolved: 'Resolved',
          closed: 'Closed',
        },
      },
    },
  },
};
