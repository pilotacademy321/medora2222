import type { Language } from '../types/medora';
import type {
  AnySecretaryPermission,
  EmployerType,
  SecretaryEmploymentStatus,
  SecretaryInvitationStatus,
  SecretarySectionId,
} from '../types/secretary';

export interface SecretaryTranslationPack {
  employerTypeLabels: Record<EmployerType, string>;
  invitationStatuses: Record<SecretaryInvitationStatus, string>;
  employmentStatuses: Record<SecretaryEmploymentStatus, string>;
  taskStatuses: Record<'todo' | 'in_progress' | 'done', string>;
  priorities: Record<'low' | 'medium' | 'high', string>;
  permissions: Record<
    AnySecretaryPermission,
    { label: string; description: string }
  >;
  employerManagement: {
    sectionTitle: string;
    sectionSubtitle: string;
    addSecretaryBtn: string;
    refreshBtn: string;
    kpiActive: string;
    kpiPendingInvites: string;
    kpiOpenTasks: string;
    linkedTitle: string;
    noLinked: string;
    invitationsTitle: string;
    noInvitations: string;
    activityTitle: string;
    noActivity: string;
    editPermissionsBtn: string;
    assignTaskBtn: string;
    suspendBtn: string;
    reactivateBtn: string;
    terminateBtn: string;
    terminateConfirmTitle: string;
    terminateConfirmBody: string;
    revokeInviteBtn: string;
    modalTitle: string;
    searchLabel: string;
    searchPlaceholder: string;
    searchBtn: string;
    noCandidates: string;
    selectCandidateHint: string;
    selectedCandidate: string;
    messageLabel: string;
    messagePlaceholder: string;
    expiryLabel: string;
    daysSuffix: string;
    permissionsLabel: string;
    initialTasksLabel: string;
    addInitialTaskBtn: string;
    taskTitlePlaceholder: string;
    taskDescPlaceholder: string;
    sendInviteBtn: string;
    sendingBtn: string;
    editPermsModalTitle: string;
    savePermsBtn: string;
    taskModalTitle: string;
    taskTitleLabel: string;
    taskDescLabel: string;
    taskPriorityLabel: string;
    taskDueDateLabel: string;
    saveTaskBtn: string;
    cancelBtn: string;
    alreadyActiveTag: string;
    alreadyPendingTag: string;
    suspendedTag: string;
    grantedPermsLabel: string;
    invitedAtLabel: string;
    expiresAtLabel: string;
    tasksCountLabel: string;
    errorMap: Record<string, string>;
  };
  portal: {
    brandTitle: string;
    brandSubtitle: string;
    backToMedora: string;
    signOut: string;
    refreshBtn: string;
    loadingWorkspace: string;
    activeEmployerLabel: string;
    noActiveEmployerOption: string;
    selectEmployerPrompt: string;
    nav: Record<SecretarySectionId, string>;
    overview: {
      welcomePrefix: string;
      secretaryCodeLabel: string;
      copyCodeBtn: string;
      copiedMsg: string;
      kpiActiveEmployers: string;
      kpiPendingInvites: string;
      kpiScopedTasks: string;
      kpiUnreadNotifs: string;
      pendingInviteAlert: string;
      reviewInvitesBtn: string;
      activeWorkspaceCardTitle: string;
      noActiveWorkspaceTitle: string;
      noActiveWorkspaceBody: string;
      grantedPermsTitle: string;
      quickEmployersTitle: string;
      openWorkspaceBtn: string;
    };
    invitations: {
      title: string;
      subtitle: string;
      filterAll: string;
      filterPending: string;
      filterHistory: string;
      empty: string;
      proposedPermsTitle: string;
      initialTasksTitle: string;
      invitedByLabel: string;
      expiresAtLabel: string;
      acceptBtn: string;
      rejectBtn: string;
      consentNotice: string;
    };
    employers: {
      title: string;
      subtitle: string;
      empty: string;
      activeWorkspaceTag: string;
      switchBtn: string;
      suspendedNotice: string;
      terminatedNotice: string;
      acceptedAtLabel: string;
      permissionsTitle: string;
    };
    tasks: {
      title: string;
      subtitle: string;
      empty: string;
      noEmployerNotice: string;
      markTodo: string;
      markInProgress: string;
      markDone: string;
      dueDateLabel: string;
      assignedByLabel: string;
    };
    operations: {
      title: string;
      subtitle: string;
      noEmployerNotice: string;
      noOperationsPermNotice: string;
      doctorNewApptBtn: string;
      patientName: string;
      patientPhone: string;
      date: string;
      time: string;
      visitType: string;
      reason: string;
      waitlistToggle: string;
      saveBooking: string;
      confirmBtn: string;
      rejectBtn: string;
      checkInBtn: string;
      cancelBtn: string;
      waitlistMoveBtn: string;
      waitlistTag: string;
      selectedFilesTitle: string;
      noFiles: string;
      labBookingsTitle: string;
      labOrdersTitle: string;
      registerArrivalBtn: string;
      arrivalRegisteredBadge: string;
      stageOrdered: string;
      stageSampleCollected: string;
      stageInLab: string;
      clinicalLockedNote: string;
      pharmacyTitle: string;
      pharmacyAddBtn: string;
      pharmacyKindLabel: string;
      pharmacyKindOrder: string;
      pharmacyKindPickup: string;
      pharmacyKindInventory: string;
      pharmacyKindSupplier: string;
    };
    messages: {
      title: string;
      subtitle: string;
      noEmployerNotice: string;
      noMessagingPermNotice: string;
      emptyConversations: string;
      selectPrompt: string;
      replyPlaceholder: string;
      sendBtn: string;
    };
    notifications: {
      title: string;
      markAllReadBtn: string;
      empty: string;
      markReadBtn: string;
    };
    profile: {
      title: string;
      subtitle: string;
      identityCardTitle: string;
      shareIdHint: string;
      emailLabel: string;
      uidLabel: string;
      codeLabel: string;
      copyBtn: string;
      fullNameLabel: string;
      phoneLabel: string;
      governorateLabel: string;
      districtLabel: string;
      educationLabel: string;
      experienceLabel: string;
      bioLabel: string;
      saveProfileBtn: string;
      savedNotice: string;
      securityNote: string;
    };
    activity: {
      title: string;
      subtitle: string;
      empty: string;
      actorEmployer: string;
      actorSecretary: string;
    };
  };
}

export const SECRETARY_TRANSLATIONS: Record<Language, SecretaryTranslationPack> = {
  ar: {
    employerTypeLabels: {
      doctor: 'عيادة طبيب',
      lab: 'مختبر طبي',
      pharmacy: 'صيدلية',
    },
    invitationStatuses: {
      Pending: 'بانتظار موافقة السكرتير',
      Accepted: 'مقبولة ومفعّلة',
      Rejected: 'مرفوضة من السكرتير',
      Expired: 'منتهية الصلاحية',
      Revoked: 'ملغاة من الجهة',
    },
    employmentStatuses: {
      Active: 'نشط',
      Suspended: 'موقوف مؤقتاً',
      Terminated: 'منتهي الارتباط',
    },
    taskStatuses: {
      todo: 'قيد الانتظار',
      in_progress: 'قيد التنفيذ',
      done: 'مكتملة',
    },
    priorities: {
      low: 'منخفضة',
      medium: 'متوسطة',
      high: 'عالية',
    },
    permissions: {
      manageBookings: {
        label: 'إدارة المواعيد والحجوزات',
        description: 'إنشاء وتنظيم وإلغاء الحجوزات الإدارية للجهة.',
      },
      confirmAppointments: {
        label: 'تأكيد أو رفض المواعيد',
        description: 'الموافقة على طلبات حجز المرضى أو رفضها.',
      },
      manageWaitlist: {
        label: 'إدارة قائمة الانتظار وتسجيل الحضور',
        description: 'تنظيم طابور الانتظار وتسجيل وصول المراجع.',
      },
      adminMessaging: {
        label: 'الرسائل الإدارية مع المرضى',
        description: 'الرد على الاستفسارات الإدارية الخاصة بالمواعيد والتوجيه.',
      },
      viewSelectedFiles: {
        label: 'عرض الملفات المحددة (ضمن الموافقة)',
        description: 'الاطلاع على الملفات التي سمح المريض بمشاركتها فقط.',
      },
      registerPatientArrival: {
        label: 'تسجيل حضور المريض في المختبر',
        description: 'تأكيد وصول المريض للاستقبال المخبري.',
      },
      trackOrders: {
        label: 'متابعة مراحل طلبات التحاليل / الصيدلية',
        description: 'متابعة حالة استقبال الطلب دون تعديل النتائج السريرية.',
      },
      viewTestStatus: {
        label: 'متابعة حالة الفحص إدارياً',
        description: 'معرفة حالة تقدم التحليل لإبلاغ المريض بموعد الاستلام.',
      },
      managePickupBookings: {
        label: 'حجوزات الاستلام من الصيدلية',
        description: 'تنظيم مواعيد استلام الطلبات الدوائية.',
      },
      manageInventory: {
        label: 'متابعة المخزون التشغيلي',
        description: 'متابعة كميات التوفر وتنبيهات النقص غير السريرية.',
      },
      trackSupplierOrders: {
        label: 'تتبع طلبات الموردين',
        description: 'متابعة طلبات التوريد والمستودعات.',
      },
    },
    employerManagement: {
      sectionTitle: 'إدارة السكرتارية – Secretary Management',
      sectionSubtitle:
        'وظّف سكرتيراً مستقلاً عبر إرسال دعوة توظيف وتحديد الصلاحيات الدقيقة. يبدأ العمل فقط بعد قبول السكرتير للدعوة من بوابته المستقلة.',
      addSecretaryBtn: 'إضافة سكرتير / دعوة توظيف',
      refreshBtn: 'تحديث',
      kpiActive: 'سكرتارية نشطة',
      kpiPendingInvites: 'دعوات قيد الانتظار',
      kpiOpenTasks: 'مهام مفتوحة',
      linkedTitle: 'السكرتارية المرتبطون بهذه الجهة',
      noLinked: 'لا يوجد سكرتير مرتبط بهذه الجهة حالياً.',
      invitationsTitle: 'سجل دعوات التوظيف المرسلة',
      noInvitations: 'لم تُرسل أي دعوات توظيف بعد.',
      activityTitle: 'سجل نشاط السكرتارية',
      noActivity: 'لا توجد أنشطة مسجلة بعد.',
      editPermissionsBtn: 'تعديل الصلاحيات',
      assignTaskBtn: 'إسناد مهمة',
      suspendBtn: 'إيقاف مؤقت',
      reactivateBtn: 'إعادة التفعيل',
      terminateBtn: 'إنهاء الارتباط نهائياً',
      terminateConfirmTitle: 'تأكيد إنهاء ارتباط السكرتير',
      terminateConfirmBody:
        'إنهاء الارتباط يسحب صلاحيات هذا السكرتير عن جهتك نهائياً ولا يمكن إعادة تفعيله لاحقاً دون دعوة توظيف جديدة.',
      revokeInviteBtn: 'سحب الدعوة',
      modalTitle: 'إرسال دعوة توظيف سكرتير',
      searchLabel: 'ابحث بمعرف السكرتير (SEC-...) أو البريد الإلكتروني أو UID',
      searchPlaceholder: 'مثال: sec@gmail.com أو SEC-XXXX',
      searchBtn: 'بحث',
      noCandidates: 'لا يوجد حساب سكرتير مسجل مطابق لبحثك.',
      selectCandidateHint: 'ابحث واختر حساب سكرتير مسجل في MEDORA لإرسال الدعوة.',
      selectedCandidate: 'السكرتير المختار',
      messageLabel: 'رسالة الدعوة',
      messagePlaceholder: 'اكتب نبذة عن أوقات الدوام أو الدور الإداري المطلوب...',
      expiryLabel: 'مدة صلاحية الدعوة',
      daysSuffix: 'أيام',
      permissionsLabel: 'الصلاحيات الممنوحة عند القبول',
      initialTasksLabel: 'مهام أولية اختيارية',
      addInitialTaskBtn: 'إضافة مهمة أولية',
      taskTitlePlaceholder: 'عنوان المهمة...',
      taskDescPlaceholder: 'تفاصيل المهمة (اختياري)...',
      sendInviteBtn: 'إرسال دعوة التوظيف',
      sendingBtn: 'جاري الإرسال...',
      editPermsModalTitle: 'تعديل صلاحيات السكرتير',
      savePermsBtn: 'حفظ الصلاحيات',
      taskModalTitle: 'إسناد مهمة جديدة للسكرتير',
      taskTitleLabel: 'عنوان المهمة',
      taskDescLabel: 'الوصف والتعليمات',
      taskPriorityLabel: 'الأولوية',
      taskDueDateLabel: 'تاريخ الاستحقاق (اختياري)',
      saveTaskBtn: 'حفظ وإرسال المهمة',
      cancelBtn: 'إلغاء',
      alreadyActiveTag: 'يعمل معك حالياً',
      alreadyPendingTag: 'لديه دعوة قائمة',
      suspendedTag: 'موقوف مؤقتاً',
      grantedPermsLabel: 'الصلاحيات',
      invitedAtLabel: 'تاريخ الإرسال',
      expiresAtLabel: 'تنتهي في',
      tasksCountLabel: 'مهام',
      errorMap: {
        SECRETARY_NOT_FOUND: 'لم يتم العثور على حساب سكرتير مطابق.',
        SECRETARY_ALREADY_ACTIVE: 'هذا السكرتير مرتبط ونشط بالفعل مع جهتك.',
        INVITATION_ALREADY_PENDING: 'توجد دعوة توظيف قيد الانتظار لهذا السكرتير.',
        CANNOT_INVITE_SELF: 'لا يمكن إرسال دعوة توظيف إلى نفس حساب المالك.',
        PERMISSION_REQUIRED: 'اختر صلاحية واحدة على الأقل قبل إرسال الدعوة.',
        EMPLOYMENT_TERMINATED_PERMANENT: 'الارتباط المنتهي لا يمكن إعادة تفعيله؛ أرسل دعوة جديدة.',
      },
    },
    portal: {
      brandTitle: 'MEDORA SECRETARY',
      brandSubtitle: 'بوابة السكرتير المستقلة',
      backToMedora: 'العودة إلى MEDORA',
      signOut: 'تسجيل الخروج',
      refreshBtn: 'تحديث',
      loadingWorkspace: 'جاري تحميل بوابة السكرتير المستقلة...',
      activeEmployerLabel: 'بيئة العمل النشطة',
      noActiveEmployerOption: 'لا توجد جهة عمل نشطة',
      selectEmployerPrompt: 'اختر الجهة الطبية التي تعمل بها حالياً',
      nav: {
        overview: 'لوحة التحكم الرئيسية',
        invitations: 'الدعوات الواردة',
        employers: 'الجهات التي أعمل معها',
        tasks: 'المهام الموكلة إليّ',
        appointments_bookings: 'المواعيد والحجوزات',
        messages: 'الرسائل الإدارية',
        notifications: 'الإشعارات',
        profile: 'الملف الشخصي المستقل',
        activity: 'سجل النشاط',
      },
      overview: {
        welcomePrefix: 'أهلاً بك،',
        secretaryCodeLabel: 'معرّف السكرتير',
        copyCodeBtn: 'نسخ المعرّف',
        copiedMsg: 'تم النسخ',
        kpiActiveEmployers: 'جهات العمل النشطة',
        kpiPendingInvites: 'دعوات توظيف بانتظار قرارك',
        kpiScopedTasks: 'مهام نشطة للجهة الحالية',
        kpiUnreadNotifs: 'إشعارات غير مقروءة',
        pendingInviteAlert: 'لديك دعوات توظيف واردة بانتظار القبول أو الرفض.',
        reviewInvitesBtn: 'مراجعة الدعوات',
        activeWorkspaceCardTitle: 'ملخص الجهة المحددة',
        noActiveWorkspaceTitle: 'لا توجد جهة عمل نشطة محددة حالياً',
        noActiveWorkspaceBody:
          'حسابك مستقل تماماً. يمكنك مشاركة بريدك الإلكتروني أو معرّف السكرتير (SEC) مع الطبيب أو المختبر أو الصيدلية لإرسال دعوة توظيف إليك، ثم قبولها من قسم الدعوات الواردة.',
        grantedPermsTitle: 'الصلاحيات الممنوحة لك في هذه الجهة',
        quickEmployersTitle: 'الجهات المتصلة',
        openWorkspaceBtn: 'فتح مساحة العمل',
      },
      invitations: {
        title: 'دعوات التوظيف الواردة',
        subtitle:
          'يبدأ الارتباط الوظيفي فقط بعد موافقتك الصريحة على الدعوة وصلاحياتها المقترحة.',
        filterAll: 'الكل',
        filterPending: 'قيد الانتظار',
        filterHistory: 'السجل السابق',
        empty: 'لا توجد دعوات توظيف مطابقة حالياً.',
        proposedPermsTitle: 'الصلاحيات المقترحة من الجهة',
        initialTasksTitle: 'مهام أولية مرفقة',
        invitedByLabel: 'المرسل',
        expiresAtLabel: 'تنتهي الصلاحية',
        acceptBtn: 'موافقة وقبول العمل',
        rejectBtn: 'رفض الدعوة',
        consentNotice: 'تُفعّل الصلاحيات فوراً لهذه الجهة فقط دون خلطها بأي جهة أخرى.',
      },
      employers: {
        title: 'الجهات التي أعمل معها',
        subtitle:
          'تُدار بيانات ومهام كل جهة طبية بمعزل كامل عن الجهات الأخرى. بدّل بيئة العمل للانتقال بينها.',
        empty: 'لم تقبل أي ارتباط بجهة طبية بعد.',
        activeWorkspaceTag: 'الجهة المحددة حالياً',
        switchBtn: 'العمل ضمن هذه الجهة',
        suspendedNotice: 'تم إيقاف هذا الارتباط مؤقتاً من قبل صاحب الجهة.',
        terminatedNotice: 'تم إنهاء هذا الارتباط نهائياً وسحب الصلاحيات.',
        acceptedAtLabel: 'تاريخ بدء الارتباط',
        permissionsTitle: 'الصلاحيات الفعلية الممنوحة',
      },
      tasks: {
        title: 'المهام الإدارية الموكلة إليّ',
        subtitle: 'تعرض هذه القائمة مهام الجهة الطبية المحددة حالياً فقط.',
        empty: 'لا توجد مهام مسندة لك من هذه الجهة حالياً.',
        noEmployerNotice: 'اختر جهة عمل نشطة لعرض وتحديث المهام الخاصة بها.',
        markTodo: 'قيد الانتظار',
        markInProgress: 'قيد التنفيذ',
        markDone: 'إنجاز',
        dueDateLabel: 'الاستحقاق',
        assignedByLabel: 'أسندت بواسطة',
      },
      operations: {
        title: 'المواعيد والحجوزات والتشغيل الإداري',
        subtitle: 'الأدوات المعروضة مقيدة بالصلاحيات الممنوحة لك في الجهة النشطة فقط.',
        noEmployerNotice: 'لا توجد جهة عمل نشطة محددة حالياً لعرض الحجوزات.',
        noOperationsPermNotice:
          'لم تمنحك هذه الجهة صلاحية إدارة المواعيد أو الحجوزات أو التشغيل حتى الآن.',
        doctorNewApptBtn: 'تسجيل حجز / انتظار',
        patientName: 'اسم المريض',
        patientPhone: 'رقم الهاتف',
        date: 'التاريخ',
        time: 'الوقت',
        visitType: 'نوع الزيارة',
        reason: 'السبب / الملاحظة',
        waitlistToggle: 'إضافة إلى قائمة الانتظار',
        saveBooking: 'حفظ الحجز',
        confirmBtn: 'تأكيد الموعد',
        rejectBtn: 'رفض',
        checkInBtn: 'تسجيل حضور',
        cancelBtn: 'إلغاء',
        waitlistMoveBtn: 'نقل لقائمة الانتظار',
        waitlistTag: 'قائمة انتظار',
        selectedFilesTitle: 'الملفات الطبية المحددة بالموافقة',
        noFiles: 'لا توجد ملفات مشاركة متاحة حالياً.',
        labBookingsTitle: 'حجوزات المختبر واستقبال المرضى',
        labOrdersTitle: 'متابعة مراحل طلبات التحاليل',
        registerArrivalBtn: 'تسجيل حضور المريض',
        arrivalRegisteredBadge: 'تم تسجيل الحضور',
        stageOrdered: 'تم الاستلام',
        stageSampleCollected: 'تم جمع العينة',
        stageInLab: 'قيد العمل المخبري',
        clinicalLockedNote:
          'إدخال أو اعتماد النتائج الطبية السريرية مقصور على الكادر المخبري المخول فقط.',
        pharmacyTitle: 'العمليات الإدارية للصيدلية',
        pharmacyAddBtn: 'إضافة سجل تشغيلي',
        pharmacyKindLabel: 'نوع العملية',
        pharmacyKindOrder: 'متابعة طلب دوائي',
        pharmacyKindPickup: 'حجز استلام مريض',
        pharmacyKindInventory: 'تحديث مخزون تشغيلي',
        pharmacyKindSupplier: 'طلب مورد / مستودع',
      },
      messages: {
        title: 'الرسائل الإدارية',
        subtitle: 'محادثات إدارية مع المرضى خاصة بالجهة الطبية المحددة فقط.',
        noEmployerNotice: 'اختر جهة عمل نشطة لعرض الرسائل.',
        noMessagingPermNotice: 'صلاحية «الرسائل الإدارية» غير مفعّلة لك في هذه الجهة.',
        emptyConversations: 'لا توجد محادثات إدارية مسجلة لهذه الجهة.',
        selectPrompt: 'اختر محادثة لعرض الرسائل والرد الإداري.',
        replyPlaceholder: 'اكتب رداً إدارياً (موعد، موقع، تحضير)...',
        sendBtn: 'إرسال الرد',
      },
      notifications: {
        title: 'إشعارات بوابة السكرتير',
        markAllReadBtn: 'تحديد الكل كمقروء',
        empty: 'لا توجد إشعارات حالياً.',
        markReadBtn: 'تحديد كمقروء',
      },
      profile: {
        title: 'الملف الشخصي المستقل للسكرتير',
        subtitle: 'حسابك مستقل عن أي عيادة أو مختبر أو صيدلية.',
        identityCardTitle: 'بطاقة التعريف للتوظيف',
        shareIdHint: 'شارك البريد الإلكتروني أو معرّف السكرتير التالي مع الجهة التي ترغب بتوظيفك:',
        emailLabel: 'البريد الإلكتروني',
        uidLabel: 'المعرّف الرقمي (UID)',
        codeLabel: 'معرّف السكرتير',
        copyBtn: 'نسخ',
        fullNameLabel: 'الاسم الكامل',
        phoneLabel: 'رقم الهاتف',
        governorateLabel: 'المحافظة',
        districtLabel: 'القضاء',
        educationLabel: 'المؤهل الدراسي',
        experienceLabel: 'الخبرة السابقة',
        bioLabel: 'نبذة تعريفية',
        saveProfileBtn: 'حفظ بيانات الملف الشخصي',
        savedNotice: 'تم حفظ بيانات الملف الشخصي المستقل بنجاح.',
        securityNote:
          'الصلاحيات والارتباطات لا يمكن تعديلها من هنا؛ يتم منحها وإدارتها حصراً من الجهة الموظِّفة بعد قبولك.',
      },
      activity: {
        title: 'سجل النشاط الكامل',
        subtitle: 'توثيق زمني لجميع الدعوات والارتباطات وتحديثات المهام والحجوزات.',
        empty: 'لا توجد سجلات نشاط بعد.',
        actorEmployer: 'الجهة',
        actorSecretary: 'السكرتير',
      },
    },
  },
  en: {
    employerTypeLabels: {
      doctor: 'Physician Clinic',
      lab: 'Medical Laboratory',
      pharmacy: 'Pharmacy',
    },
    invitationStatuses: {
      Pending: 'Pending Secretary Consent',
      Accepted: 'Accepted & Active',
      Rejected: 'Rejected by Secretary',
      Expired: 'Expired',
      Revoked: 'Revoked by Employer',
    },
    employmentStatuses: {
      Active: 'Active',
      Suspended: 'Suspended',
      Terminated: 'Terminated',
    },
    taskStatuses: {
      todo: 'To Do',
      in_progress: 'In Progress',
      done: 'Completed',
    },
    priorities: {
      low: 'Low',
      medium: 'Medium',
      high: 'High',
    },
    permissions: {
      manageBookings: {
        label: 'Manage Bookings & Scheduling',
        description: 'Create, organize, and cancel administrative bookings.',
      },
      confirmAppointments: {
        label: 'Confirm / Reject Appointments',
        description: 'Approve or reject incoming patient appointment requests.',
      },
      manageWaitlist: {
        label: 'Manage Waitlist & Check-In',
        description: 'Manage waiting list queues and patient check-in.',
      },
      adminMessaging: {
        label: 'Administrative Patient Messaging',
        description: 'Reply to administrative appointment and direction inquiries.',
      },
      viewSelectedFiles: {
        label: 'View Patient-Consented Files',
        description: 'View only medical files explicitly shared with consent.',
      },
      registerPatientArrival: {
        label: 'Register Patient Lab Arrival',
        description: 'Check in patients arriving at laboratory reception.',
      },
      trackOrders: {
        label: 'Track Intake / Operational Orders',
        description: 'Track intake stage without altering clinical results.',
      },
      viewTestStatus: {
        label: 'View Test Processing Status',
        description: 'Check administrative test progress to inform patients.',
      },
      managePickupBookings: {
        label: 'Manage Pharmacy Pickup Bookings',
        description: 'Coordinate medication pickup schedules.',
      },
      manageInventory: {
        label: 'Manage Operational Inventory',
        description: 'Track non-clinical operational stock availability.',
      },
      trackSupplierOrders: {
        label: 'Track Supplier Orders',
        description: 'Monitor distributor and replenishment orders.',
      },
    },
    employerManagement: {
      sectionTitle: 'Secretary Management – إدارة السكرتارية',
      sectionSubtitle:
        'Hire independent MEDORA secretaries via invitation with granular permissions. Access activates only after the secretary accepts from their standalone portal.',
      addSecretaryBtn: 'Add Secretary / Send Invite',
      refreshBtn: 'Refresh',
      kpiActive: 'Active Secretaries',
      kpiPendingInvites: 'Pending Invitations',
      kpiOpenTasks: 'Open Tasks',
      linkedTitle: 'Linked Secretaries',
      noLinked: 'No secretaries are linked to this entity yet.',
      invitationsTitle: 'Sent Hiring Invitations',
      noInvitations: 'No invitations sent yet.',
      activityTitle: 'Secretary Activity Log',
      noActivity: 'No activity recorded yet.',
      editPermissionsBtn: 'Edit Permissions',
      assignTaskBtn: 'Assign Task',
      suspendBtn: 'Suspend',
      reactivateBtn: 'Reactivate',
      terminateBtn: 'Terminate Link',
      terminateConfirmTitle: 'Confirm Employment Termination',
      terminateConfirmBody:
        'Terminating permanently revokes this secretary from your entity. Reactivation requires a new hiring invitation.',
      revokeInviteBtn: 'Revoke Invite',
      modalTitle: 'Send Secretary Hiring Invitation',
      searchLabel: 'Search by Secretary ID (SEC-...), Email, or UID',
      searchPlaceholder: 'e.g., sec@gmail.com or SEC-XXXX',
      searchBtn: 'Search',
      noCandidates: 'No matching registered secretary accounts found.',
      selectCandidateHint: 'Search and select a registered MEDORA secretary account.',
      selectedCandidate: 'Selected Secretary',
      messageLabel: 'Invitation Message',
      messagePlaceholder: 'Describe working hours or administrative responsibilities...',
      expiryLabel: 'Invitation Expiry',
      daysSuffix: 'days',
      permissionsLabel: 'Permissions Granted Upon Acceptance',
      initialTasksLabel: 'Optional Initial Tasks',
      addInitialTaskBtn: 'Add Initial Task',
      taskTitlePlaceholder: 'Task title...',
      taskDescPlaceholder: 'Task notes (optional)...',
      sendInviteBtn: 'Send Hiring Invitation',
      sendingBtn: 'Sending...',
      editPermsModalTitle: 'Update Secretary Permissions',
      savePermsBtn: 'Save Permissions',
      taskModalTitle: 'Assign Task to Secretary',
      taskTitleLabel: 'Task Title',
      taskDescLabel: 'Description & Instructions',
      taskPriorityLabel: 'Priority',
      taskDueDateLabel: 'Due Date (optional)',
      saveTaskBtn: 'Create Task',
      cancelBtn: 'Cancel',
      alreadyActiveTag: 'Already Active',
      alreadyPendingTag: 'Invitation Pending',
      suspendedTag: 'Suspended',
      grantedPermsLabel: 'Permissions',
      invitedAtLabel: 'Sent',
      expiresAtLabel: 'Expires',
      tasksCountLabel: 'tasks',
      errorMap: {
        SECRETARY_NOT_FOUND: 'No matching secretary account found.',
        SECRETARY_ALREADY_ACTIVE: 'This secretary is already active with your entity.',
        INVITATION_ALREADY_PENDING: 'A pending invitation already exists for this secretary.',
        CANNOT_INVITE_SELF: 'Cannot send an employment invitation to yourself.',
        PERMISSION_REQUIRED: 'Select at least one permission before sending.',
        EMPLOYMENT_TERMINATED_PERMANENT: 'Terminated links are permanent; send a new invitation.',
      },
    },
    portal: {
      brandTitle: 'MEDORA SECRETARY',
      brandSubtitle: 'Standalone Secretary Portal',
      backToMedora: 'Back to MEDORA',
      signOut: 'Sign Out',
      refreshBtn: 'Refresh',
      loadingWorkspace: 'Loading MEDORA Secretary Portal...',
      activeEmployerLabel: 'Active Employer Workspace',
      noActiveEmployerOption: 'No active employer',
      selectEmployerPrompt: 'Switch active employer context',
      nav: {
        overview: 'Dashboard Overview',
        invitations: 'Incoming Invitations',
        employers: 'Connected Employers',
        tasks: 'My Assigned Tasks',
        appointments_bookings: 'Appointments & Bookings',
        messages: 'Admin Messages',
        notifications: 'Notifications',
        profile: 'Independent Profile',
        activity: 'Activity Log',
      },
      overview: {
        welcomePrefix: 'Welcome,',
        secretaryCodeLabel: 'Secretary Code',
        copyCodeBtn: 'Copy Code',
        copiedMsg: 'Copied',
        kpiActiveEmployers: 'Active Employers',
        kpiPendingInvites: 'Pending Invitations',
        kpiScopedTasks: 'Active Employer Tasks',
        kpiUnreadNotifs: 'Unread Notifications',
        pendingInviteAlert: 'You have incoming hiring invitations awaiting your decision.',
        reviewInvitesBtn: 'Review Invitations',
        activeWorkspaceCardTitle: 'Active Employer Summary',
        noActiveWorkspaceTitle: 'No Active Employer Workspace Selected',
        noActiveWorkspaceBody:
          'Your secretary account is fully independent. Share your Email or Secretary Code (SEC) with a Doctor, Laboratory, or Pharmacy so they can invite you, then accept the invitation in Incoming Invitations.',
        grantedPermsTitle: 'Your Granted Permissions Here',
        quickEmployersTitle: 'Connected Employers',
        openWorkspaceBtn: 'Open Workspace',
      },
      invitations: {
        title: 'Incoming Hiring Invitations',
        subtitle: 'Employment starts only after you explicitly accept the invitation and proposed permissions.',
        filterAll: 'All',
        filterPending: 'Pending',
        filterHistory: 'History',
        empty: 'No invitations found.',
        proposedPermsTitle: 'Proposed Permissions',
        initialTasksTitle: 'Initial Tasks Included',
        invitedByLabel: 'Invited By',
        expiresAtLabel: 'Expires',
        acceptBtn: 'Accept & Connect',
        rejectBtn: 'Reject Invitation',
        consentNotice: 'Permissions apply strictly to this employer in complete isolation.',
      },
      employers: {
        title: 'Connected Employers',
        subtitle: 'Each employer workspace is strictly isolated. Switch context anytime.',
        empty: 'You have not connected to any medical employers yet.',
        activeWorkspaceTag: 'Current Workspace',
        switchBtn: 'Switch to Workspace',
        suspendedNotice: 'This employment has been temporarily suspended by the employer.',
        terminatedNotice: 'This employment was permanently terminated.',
        acceptedAtLabel: 'Connected On',
        permissionsTitle: 'Granted Permissions',
      },
      tasks: {
        title: 'Assigned Tasks',
        subtitle: 'Showing tasks strictly for the currently selected employer.',
        empty: 'No tasks assigned for this employer.',
        noEmployerNotice: 'Select an active employer workspace to view assigned tasks.',
        markTodo: 'To Do',
        markInProgress: 'In Progress',
        markDone: 'Done',
        dueDateLabel: 'Due',
        assignedByLabel: 'Assigned By',
      },
      operations: {
        title: 'Appointments, Bookings & Operations',
        subtitle: 'Visible tools are filtered strictly by your granted permissions for this employer.',
        noEmployerNotice: 'Select an active employer workspace to manage bookings.',
        noOperationsPermNotice: 'This employer has not granted scheduling or operational permissions.',
        doctorNewApptBtn: 'New Booking / Waitlist',
        patientName: 'Patient Name',
        patientPhone: 'Phone',
        date: 'Date',
        time: 'Time',
        visitType: 'Visit Type',
        reason: 'Reason / Notes',
        waitlistToggle: 'Add to Waitlist',
        saveBooking: 'Create Booking',
        confirmBtn: 'Confirm',
        rejectBtn: 'Reject',
        checkInBtn: 'Check In',
        cancelBtn: 'Cancel',
        waitlistMoveBtn: 'Move to Waitlist',
        waitlistTag: 'Waitlist',
        selectedFilesTitle: 'Consented Patient Files',
        noFiles: 'No shared files available.',
        labBookingsTitle: 'Lab Bookings & Arrival Check-In',
        labOrdersTitle: 'Lab Order Intake Tracking',
        registerArrivalBtn: 'Register Arrival',
        arrivalRegisteredBadge: 'Arrival Registered',
        stageOrdered: 'Ordered',
        stageSampleCollected: 'Sample Collected',
        stageInLab: 'In Lab',
        clinicalLockedNote: 'Clinical lab result entry & approval is restricted to authorized lab technical staff.',
        pharmacyTitle: 'Pharmacy Operational Records',
        pharmacyAddBtn: 'Add Operational Item',
        pharmacyKindLabel: 'Operation Type',
        pharmacyKindOrder: 'Order Tracking',
        pharmacyKindPickup: 'Pickup Booking',
        pharmacyKindInventory: 'Operational Inventory',
        pharmacyKindSupplier: 'Supplier Order',
      },
      messages: {
        title: 'Administrative Messages',
        subtitle: 'Administrative conversations strictly scoped to the selected employer.',
        noEmployerNotice: 'Select an active employer workspace to view messages.',
        noMessagingPermNotice: 'Administrative Messaging permission is not enabled for this employer.',
        emptyConversations: 'No conversations available for this employer.',
        selectPrompt: 'Select a conversation to view and reply.',
        replyPlaceholder: 'Write an administrative reply...',
        sendBtn: 'Send Reply',
      },
      notifications: {
        title: 'Secretary Notifications',
        markAllReadBtn: 'Mark All Read',
        empty: 'No notifications yet.',
        markReadBtn: 'Mark Read',
      },
      profile: {
        title: 'Independent Secretary Profile',
        subtitle: 'Your account is independent from any single clinic, lab, or pharmacy.',
        identityCardTitle: 'Employer Discovery Card',
        shareIdHint: 'Share your Email or Secretary Code below with employers so they can send a hiring invitation:',
        emailLabel: 'Email',
        uidLabel: 'User ID (UID)',
        codeLabel: 'Secretary Code',
        copyBtn: 'Copy',
        fullNameLabel: 'Full Name',
        phoneLabel: 'Phone Number',
        governorateLabel: 'Governorate',
        districtLabel: 'District',
        educationLabel: 'Educational Qualification',
        experienceLabel: 'Previous Experience',
        bioLabel: 'Professional Bio',
        saveProfileBtn: 'Save Independent Profile',
        savedNotice: 'Independent secretary profile saved successfully.',
        securityNote: 'Permissions and employments cannot be self-edited; they are managed solely by employers after your acceptance.',
      },
      activity: {
        title: 'Complete Activity Log',
        subtitle: 'Chronological record of invitations, employments, tasks, and scoped actions.',
        empty: 'No activity recorded yet.',
        actorEmployer: 'Employer',
        actorSecretary: 'Secretary',
      },
    },
  },
};
