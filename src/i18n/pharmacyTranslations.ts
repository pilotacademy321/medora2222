import type { Language } from '../types/medora';
import type { PharmacySectionId } from '../types/pharmacy';

export interface PharmacyCopy {
  brandTitle: string;
  brandSubtitle: string;
  backToMedora: string;
  signOut: string;
  refresh: string;
  loading: string;
  nav: Record<PharmacySectionId, string>;
  common: {
    iqd: string;
    save: string;
    cancel: string;
    add: string;
    edit: string;
    searchPlaceholder: string;
    noData: string;
    status: string;
    actions: string;
    quantity: string;
    price: string;
    total: string;
    batchNumber: string;
    expiryDate: string;
    print: string;
    downloadPdf: string;
    all: string;
  };
  statuses: Record<string, string>;
  roles: Record<string, string>;
  dosageForms: Record<string, string>;
  deliveryStatuses: Record<string, string>;
  movementTypes: Record<string, string>;
  staffStatuses: Record<string, string>;
  paymentMethods: Record<string, string>;
  communicationChannels: Record<string, string>;
  orderSources: Record<string, string>;
  fulfillmentTypes: Record<string, string>;
  auditActions: Record<string, string>;
  bulkImport: {
    title: string;
    subtitle: string;
    downloadTemplate: string;
    uploadFile: string;
    sheetLabel: string;
    modeLabel: string;
    modes: Record<'full_catalog_and_batches' | 'price_update_only' | 'quantity_batch_update_only', string>;
    pdfWarning: string;
    pdfConfirmLabel: string;
    mappingTitle: string;
    previewTitle: string;
    filterAll: string;
    filterValid: string;
    filterWarnings: string;
    filterErrors: string;
    revalidateBtn: string;
    commitBtn: string;
    committingBtn: string;
    publishJobBtn: string;
    historyTitle: string;
    pendingReviewBadge: string;
    publishedBadge: string;
  };
  comparePrices: {
    title: string;
    subtitle: string;
    bestPrice: string;
    nearestExpiry: string;
    wholesalersCount: string;
  };
}

export const pharmacyTranslations: Record<Language, PharmacyCopy> = {
  ar: {
    brandTitle: 'بوابة شريك صيدلية MEDORA',
    brandSubtitle: 'واجهة الصيدلية المعتمدة، إدارة المخزون والتشغيلات، الطلبات، والربط مع المذاخر',
    backToMedora: 'العودة لبوابات MEDORA',
    signOut: 'تسجيل الخروج',
    refresh: 'تحديث البيانات',
    loading: 'جاري تحميل مساحة عمل الصيدلية...',
    nav: {
      overview: 'لوحة التحكم',
      profile: 'ملف الصيدلية',
      storefront: 'معاينة الواجهة العامة',
      products: 'مخزون الأدوية',
      bulk_import: 'الاستيراد الجماعي',
      orders: 'طلبات المرضى',
      doctor_orders: 'طلبات الأطباء',
      prescriptions: 'الوصفات الطبية',
      wholesaler: 'سوق المذاخر',
      supply_orders: 'طلبات التوريد والمشتريات',
      receipts: 'الإيصالات الثلاثية والمبيعات',
      messages: 'مركز المراسلات',
      marketing: 'التسويق والعروض',
      reports: 'التقارير والسجلات',
      settings: 'الإعدادات',
    },
    common: {
      iqd: 'د.ع',
      save: 'حفظ',
      cancel: 'إلغاء',
      add: 'إضافة',
      edit: 'تعديل',
      searchPlaceholder: 'بحث بالاسم، الباركود، التشغيلة، أو رقم الطلب...',
      noData: 'لا توجد سجلات متاحة في هذا القسم حالياً.',
      status: 'الحالة',
      actions: 'الإجراءات',
      quantity: 'الكمية',
      price: 'السعر',
      total: 'الإجمالي',
      batchNumber: 'رقم التشغيلة',
      expiryDate: 'تاريخ الانتهاء',
      print: 'طباعة',
      downloadPdf: 'تحميل PDF',
      all: 'الكل',
    },
    statuses: {
      Draft: 'مسودة',
      Submitted: 'مُرسل',
      'Under Review': 'قيد المراجعة',
      'Under Pharmacist Review': 'قيد مراجعة الصيدلي',
      'Amendment Proposed': 'مقترح تعديل من المذخر',
      'Pharmacy Confirmed': 'مؤكد من الصيدلية',
      'Requires Changes': 'يتطلب تعديل',
      Pending: 'قيد الانتظار',
      Accepted: 'مقبول',
      'Partially Accepted': 'مقبول جزئياً',
      Rejected: 'مرفوض',
      Preparing: 'قيد التجهيز',
      'Ready for Pickup': 'جاهز للاستلام',
      'Out for Delivery': 'خرج للتوصيل',
      Dispatched: 'تم الإرسال للشحن',
      Shipped: 'تم الشحن',
      Delivered: 'تم التوصيل',
      Completed: 'مكتمل',
      Cancelled: 'ملغي',
      Expired: 'منتهي الصلاحية',
      Approved: 'معتمد',
      Suspended: 'موقوف مؤقتاً',
      Deactivated: 'معطل',
      'Partially Available': 'متوفر جزئياً',
      'Clarification Requested': 'طلب توضيح من الطبيب',
      Dispensed: 'تم الصرف',
      active: 'نشط',
      deprecated: 'موقوف',
      unpaid: 'غير مدفوعة',
      partial: 'مدفوعة جزئياً',
      paid: 'مدفوعة',
      void: 'ملغاة',
    },
    roles: {
      owner: 'مالك الصيدلية',
      responsible_pharmacist: 'الصيدلاني المسؤول',
      pharmacist: 'صيدلي',
      inventory_manager: 'مسؤول المخزون',
      delivery_staff: 'موظف توصيل',
      accountant: 'محاسب',
    },
    dosageForms: {
      tablet: 'أقراص',
      capsule: 'كبسولات',
      syrup: 'شراب',
      injection: 'حقن',
      cream: 'كريم / مرهم',
      drops: 'قطرات',
      inhaler: 'بخاخ',
      suppository: 'تحاميل',
      powder: 'بودرة',
      other: 'أخرى',
    },
    deliveryStatuses: {
      assigned: 'تم تعيين المندوب',
      out_for_delivery: 'خرج للتوصيل',
      delivered: 'تم التسليم',
      failed: 'تعثر التسليم',
    },
    movementTypes: {
      receive_batch: 'استلام تشغيلة',
      reserve: 'حجز للطلب',
      release_reserve: 'إلغاء حجز المخزون',
      commit_dispense: 'خصم صرف طلب',
      manual_adjust: 'تعديل يدوي للمخزون',
      stocktake_adjust: 'تسوية جرد',
      return_in: 'مرتجع للمخزون',
      expired_writeoff: 'إتلاف منتهي الصلاحية',
    },
    staffStatuses: {
      active: 'نشط',
      suspended: 'معلق',
      invited: 'مدعو',
    },
    paymentMethods: {
      cash_on_pickup: 'نقداً عند الاستلام',
      cash_on_delivery: 'نقداً عند التوصيل',
      credit_account: 'على الحساب الآجل',
    },
    communicationChannels: {
      patient_order: 'طلب مريض',
      doctor_clarification: 'توضيح للطبيب',
      wholesaler_supply: 'توريد من مذخر',
      super_admin: 'إدارة MEDORA العليا',
    },
    orderSources: {
      patient_finder: 'طلب عبر MEDORA',
      doctor_prescription: 'وصفة طبية عبر MEDORA',
    },
    fulfillmentTypes: {
      pickup: 'استلام من الصيدلية',
      delivery: 'توصيل منزلي',
    },
    auditActions: {
      CREATE_CANONICAL_MEDICINE: 'إضافة دواء مرجعي',
      SAVE_PRODUCT: 'حفظ منتج بالكتالوج',
      ADD_BATCH: 'إضافة تشغيلة جديدة',
      ADJUST_BATCH: 'تعديل رصيد تشغيلة',
      CSV_IMPORT: 'استيراد CSV للمخزون',
      BULK_DRUG_IMPORT_COMMITTED: 'استيراد الأدوية بالجملة',
      BULK_IMPORT_PRODUCTS_PUBLISHED: 'نشر الأدوية المستوردة للمرضى',
      ORDER_TRANSITION: 'تحديث حالة طلب مريض',
      PRESCRIPTION_REVIEW: 'مراجعة واعتماد وصفة',
      INVOICE_PAYMENT: 'تحصيل دفعة فاتورة',
      DELIVERY_UPDATE: 'تحديث حالة توصيل',
      PROCESS_RETURN: 'تسجيل مرتجع أدوية',
      SUPPLY_ORDER_SUBMIT: 'إرسال طلب توريد لمذخر',
      SUPPLY_ORDER_RECEIPT: 'استلام شحنة من مذخر',
      STAFF_ADD: 'إضافة موظف للصيدلية',
      STAFF_UPDATE: 'تحديث صلاحيات/حالة موظف',
      SETTINGS_UPDATE: 'تحديث إعدادات الصيدلية',
    },
    bulkImport: {
      title: 'استيراد الأدوية بالجملة',
      subtitle: 'ارفع ملف Excel أو CSV أو JSON، أو استخرج مسودة قابلة للتعديل والمراجعة من PDF.',
      downloadTemplate: 'تحميل قالب Excel الرسمي (.xlsx)',
      uploadFile: 'اختيار ملف (.xlsx, .xls, .csv, .json, .pdf)',
      sheetLabel: 'ورقة العمل',
      modeLabel: 'وضع الاستيراد',
      modes: {
        full_catalog_and_batches: 'الكتالوج الكامل والتشغيلات',
        price_update_only: 'تحديث الأسعار فقط',
        quantity_batch_update_only: 'تحديث الكميات والتشغيلات فقط',
      },
      pdfWarning: 'تم استخراج البيانات من ملف PDF كمسودة مراجعة قابلة للتعديل. يرجى التحقق من جميع الأسماء والأسعار والكميات وتواريخ الانتهاء قبل الحفظ.',
      pdfConfirmLabel: 'أؤكد أنني راجعت جميع صفوف مسودة PDF بنفسي قبل الحفظ',
      mappingTitle: 'ربط الأعمدة',
      previewTitle: 'معاينة التحقق قبل الاستيراد',
      filterAll: 'الكل',
      filterValid: 'صالح',
      filterWarnings: 'تنبيهات',
      filterErrors: 'أخطاء',
      revalidateBtn: 'إعادة التحقق',
      commitBtn: 'تأكيد واستيراد الصفوف الصالحة',
      committingBtn: 'جاري الاستيراد...',
      publishJobBtn: 'اعتماد ونشر دفعة الاستيراد للمرضى',
      historyTitle: 'سجل عمليات الاستيراد الجماعي',
      pendingReviewBadge: 'بانتظار المراجعة (مخفي)',
      publishedBadge: 'منشور للمرضى',
    },
    comparePrices: {
      title: 'مقارنة أسعار المذاخر لكل دواء',
      subtitle: 'قارن أسعار الجملة المعتمدة، البونص، أقل كمية طلب، وأقرب تاريخ انتهاء بين المذاخر.',
      bestPrice: 'الأقل سعراً',
      nearestExpiry: 'أقرب انتهاء',
      wholesalersCount: 'المذاخر',
    },
  },
  en: {
    brandTitle: 'MEDORA PHARMACY PARTNER',
    brandSubtitle: 'Approved Pharmacy Storefront, FEFO Inventory, Orders, Rx & Wholesaler Supply',
    backToMedora: 'Back to MEDORA Portals',
    signOut: 'Sign Out',
    refresh: 'Refresh',
    loading: 'Loading Pharmacy Workspace...',
    nav: {
      overview: 'Dashboard',
      profile: 'Pharmacy Profile',
      storefront: 'Public Storefront',
      products: 'Medicine Inventory',
      bulk_import: 'Bulk Import',
      orders: 'Patient Orders',
      doctor_orders: 'Doctor Orders',
      prescriptions: 'Prescriptions',
      wholesaler: 'Wholesaler Marketplace',
      supply_orders: 'Supply Orders & Purchases',
      receipts: '3-Party Receipts & Ledger',
      messages: 'Unified Messages',
      marketing: 'Marketing & Promotions',
      reports: 'Reports & Logs',
      settings: 'Settings',
    },
    common: {
      iqd: 'IQD',
      save: 'Save',
      cancel: 'Cancel',
      add: 'Add',
      edit: 'Edit',
      searchPlaceholder: 'Search by name, barcode, batch, or order #...',
      noData: 'No records available in this section yet.',
      status: 'Status',
      actions: 'Actions',
      quantity: 'Qty',
      price: 'Price',
      total: 'Total',
      batchNumber: 'Batch #',
      expiryDate: 'Expiry Date',
      print: 'Print',
      downloadPdf: 'Download PDF',
      all: 'All',
    },
    statuses: {
      Draft: 'Draft',
      Submitted: 'Submitted',
      'Under Review': 'Under Review',
      'Under Pharmacist Review': 'Under Pharmacist Review',
      'Amendment Proposed': 'Amendment Proposed',
      'Pharmacy Confirmed': 'Pharmacy Confirmed',
      'Requires Changes': 'Requires Changes',
      Pending: 'Pending',
      Accepted: 'Accepted',
      'Partially Accepted': 'Partially Accepted',
      Rejected: 'Rejected',
      Preparing: 'Preparing',
      'Ready for Pickup': 'Ready for Pickup',
      'Out for Delivery': 'Out for Delivery',
      Dispatched: 'Dispatched',
      Shipped: 'Shipped',
      Delivered: 'Delivered',
      Completed: 'Completed',
      Cancelled: 'Cancelled',
      Expired: 'Expired',
      Approved: 'Approved',
      Suspended: 'Suspended',
      Deactivated: 'Deactivated',
      'Partially Available': 'Partially Available',
      'Clarification Requested': 'Clarification Requested',
      Dispensed: 'Dispensed',
      active: 'Active',
      deprecated: 'Deprecated',
      unpaid: 'Unpaid',
      partial: 'Partial',
      paid: 'Paid',
      void: 'Void',
    },
    roles: {
      owner: 'Pharmacy Owner',
      responsible_pharmacist: 'Responsible Pharmacist',
      pharmacist: 'Pharmacist',
      inventory_manager: 'Inventory Manager',
      delivery_staff: 'Delivery Staff',
      accountant: 'Accountant',
    },
    dosageForms: {
      tablet: 'Tablet',
      capsule: 'Capsule',
      syrup: 'Syrup',
      injection: 'Injection',
      cream: 'Cream / Ointment',
      drops: 'Drops',
      inhaler: 'Inhaler',
      suppository: 'Suppository',
      powder: 'Powder',
      other: 'Other',
    },
    deliveryStatuses: {
      assigned: 'Courier Assigned',
      out_for_delivery: 'Out for Delivery',
      delivered: 'Delivered',
      failed: 'Delivery Failed',
    },
    movementTypes: {
      receive_batch: 'Receive Batch',
      reserve: 'Reserve Stock',
      release_reserve: 'Release Reservation',
      commit_dispense: 'Order Dispense Deduction',
      manual_adjust: 'Manual Stock Adjust',
      stocktake_adjust: 'Stocktake Adjustment',
      return_in: 'Return to Stock',
      expired_writeoff: 'Expired Write-Off',
    },
    staffStatuses: {
      active: 'Active',
      suspended: 'Suspended',
      invited: 'Invited',
    },
    paymentMethods: {
      cash_on_pickup: 'Cash on Pickup',
      cash_on_delivery: 'Cash on Delivery',
      credit_account: 'Credit Account',
    },
    communicationChannels: {
      patient_order: 'Patient Order',
      doctor_clarification: 'Doctor Clarification',
      wholesaler_supply: 'Wholesaler Supply',
      super_admin: 'MEDORA Super Admin',
    },
    orderSources: {
      patient_finder: 'MEDORA Finder',
      doctor_prescription: 'MEDORA Prescription',
    },
    fulfillmentTypes: {
      pickup: 'Pharmacy Pickup',
      delivery: 'Home Delivery',
    },
    auditActions: {
      CREATE_CANONICAL_MEDICINE: 'Create Canonical Medicine',
      SAVE_PRODUCT: 'Save Catalog Product',
      ADD_BATCH: 'Receive New Batch',
      ADJUST_BATCH: 'Adjust Batch Stock',
      CSV_IMPORT: 'CSV Bulk Import',
      BULK_DRUG_IMPORT_COMMITTED: 'Bulk Drug Import',
      BULK_IMPORT_PRODUCTS_PUBLISHED: 'Publish Bulk Imported Drugs',
      ORDER_TRANSITION: 'Patient Order Transition',
      PRESCRIPTION_REVIEW: 'Pharmacist Rx Review',
      INVOICE_PAYMENT: 'Invoice Payment',
      DELIVERY_UPDATE: 'Delivery Status Update',
      PROCESS_RETURN: 'Process Return',
      SUPPLY_ORDER_SUBMIT: 'Submit B2B Supply Order',
      SUPPLY_ORDER_RECEIPT: 'Confirm B2B Receipt',
      STAFF_ADD: 'Add Staff Member',
      STAFF_UPDATE: 'Update Staff Status',
      SETTINGS_UPDATE: 'Update Pharmacy Settings',
    },
    bulkImport: {
      title: 'Bulk Drug Import',
      subtitle: 'Upload Excel / CSV / JSON spreadsheets or parse PDF catalogs as an editable review draft.',
      downloadTemplate: 'Download Official Excel Template (.xlsx)',
      uploadFile: 'Choose File (.xlsx, .xls, .csv, .json, .pdf)',
      sheetLabel: 'Worksheet',
      modeLabel: 'Import Mode',
      modes: {
        full_catalog_and_batches: 'Full Catalog & Batches',
        price_update_only: 'Price Update Only',
        quantity_batch_update_only: 'Quantity & Batch Update Only',
      },
      pdfWarning: 'Extracted from PDF as an editable review draft. Verify all drug names, prices, quantities, and expiry dates before importing.',
      pdfConfirmLabel: 'I confirm I reviewed all extracted PDF draft rows before saving',
      mappingTitle: 'Column Mapping',
      previewTitle: 'Pre-Import Validation Preview',
      filterAll: 'All',
      filterValid: 'Valid',
      filterWarnings: 'Warnings',
      filterErrors: 'Errors',
      revalidateBtn: 'Re-validate',
      commitBtn: 'Confirm & Import Valid Rows',
      committingBtn: 'Importing...',
      publishJobBtn: 'Review & Publish Imported Batch to Patients',
      historyTitle: 'Bulk Import Job History',
      pendingReviewBadge: 'Pending Review',
      publishedBadge: 'Published to Patients',
    },
    comparePrices: {
      title: 'Compare Wholesaler Prices by Medicine',
      subtitle: 'Compare official wholesale prices, MOQ, bonus terms, and nearest expiry dates.',
      bestPrice: 'Best Price',
      nearestExpiry: 'Nearest Expiry',
      wholesalersCount: 'Wholesalers',
    },
  },
};
