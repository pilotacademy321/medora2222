import type { Language } from '../types/medora';
import type { WholesalerSectionId } from '../types/wholesaler';

export interface WholesalerCopy {
  brandTitle: string;
  brandSubtitle: string;
  backToMedora: string;
  signOut: string;
  refresh: string;
  loading: string;
  nav: Record<WholesalerSectionId, string>;
  common: {
    iqd: string;
    save: string;
    cancel: string;
    add: string;
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
  };
  statuses: Record<string, string>;
  roles: Record<string, string>;
}

export const wholesalerTranslations: Record<Language, WholesalerCopy> = {
  ar: {
    brandTitle: 'بوابة المذخر الدوائي MEDORA',
    brandSubtitle: 'إدارة مستودع الجملة والتشغيلات وطلبات الصيدليات والشحنات والفواتير',
    backToMedora: 'العودة لبوابات MEDORA',
    signOut: 'تسجيل الخروج',
    refresh: 'تحديث البيانات',
    loading: 'جاري تحميل مساحة عمل المذخر...',
    nav: {
      overview: 'نظرة عامة',
      products: 'الكتالوج وأسعار الجملة',
      inventory: 'حركات المخزون',
      batches: 'التشغيلات والصلاحية (FEFO)',
      pharmacies: 'الصيدليات وقواعد الائتمان',
      supply_orders: 'طلبات التوريد',
      shipments: 'الشحنات والتسليم',
      suppliers: 'الموردون والمصانع',
      purchase_orders: 'أوامر الشراء والاستلام',
      invoices: 'الفواتير وكشوف الحساب',
      receipts: 'الإيصالات الثلاثية الموحدة',
      payments: 'المدفوعات والتحصيل',
      returns: 'المرتجعات والتسويات',
      staff: 'موظفو المذخر والصلاحيات',
      communications: 'التواصل والتنبيهات',
      reports: 'التقارير والتحليلات',
      settings: 'إعدادات المذخر',
    },
    common: {
      iqd: 'د.ع',
      save: 'حفظ',
      cancel: 'إلغاء',
      add: 'إضافة',
      searchPlaceholder: 'بحث بالمنتج، الصيدلية، رقم التشغيلة، أو الطلب...',
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
    },
    statuses: {
      Submitted: 'طلب جديد',
      'Under Review': 'قيد المراجعة',
      'Amendment Proposed': 'مقترح تعديل بانتظار الصيدلية',
      Accepted: 'مقبول',
      'Partially Accepted': 'مقبول جزئياً',
      Rejected: 'مرفوض',
      Preparing: 'قيد التحضير',
      'Ready for Dispatch': 'جاهز للشحن',
      Shipped: 'تم الشحن',
      Delivered: 'تم التوصيل',
      Completed: 'مكتمل ومستلم',
      Cancelled: 'ملغي',
      preparing: 'قيد التحضير',
      ready: 'جاهز',
      in_transit: 'في الطريق',
      delivered: 'تم التسليم',
      failed: 'تعثر التسليم',
      unpaid: 'غير مدفوعة',
      partial: 'مدفوعة جزئياً',
      paid: 'مدفوعة',
      void: 'ملغاة',
    },
    roles: {
      owner: 'مالك المذخر',
      warehouse_manager: 'مدير المخزن',
      sales_rep: 'مندوب مبيعات',
      dispatch_coordinator: 'منسق الشحن والتوزيع',
      accountant: 'محاسب',
    },
  },
  en: {
    brandTitle: 'MEDORA WHOLESALER',
    brandSubtitle: 'Wholesale Medicine Inventory, FEFO Batches, Pharmacy Supply & Dispatch',
    backToMedora: 'Back to MEDORA Portals',
    signOut: 'Sign Out',
    refresh: 'Refresh',
    loading: 'Loading Wholesaler Workspace...',
    nav: {
      overview: 'Overview',
      products: 'Catalog & Wholesale Pricing',
      inventory: 'Inventory Movements',
      batches: 'Batches & Expiry (FEFO)',
      pharmacies: 'Pharmacies & Credit Rules',
      supply_orders: 'Supply Orders',
      shipments: 'Shipments & Dispatch',
      suppliers: 'Suppliers & Manufacturers',
      purchase_orders: 'Purchase Orders',
      invoices: 'Invoices & Statements',
      receipts: 'Unified 3-Party Receipts',
      payments: 'Payments & Settlements',
      returns: 'Returns & Credits',
      staff: 'Warehouse Staff & RBAC',
      communications: 'Communications & Alerts',
      reports: 'Reports & Analytics',
      settings: 'Wholesaler Settings',
    },
    common: {
      iqd: 'IQD',
      save: 'Save',
      cancel: 'Cancel',
      add: 'Add',
      searchPlaceholder: 'Search product, pharmacy, batch #, or order...',
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
    },
    statuses: {
      Submitted: 'Submitted',
      'Under Review': 'Under Review',
      'Amendment Proposed': 'Amendment Proposed (Awaiting Pharmacy)',
      Accepted: 'Accepted',
      'Partially Accepted': 'Partially Accepted',
      Rejected: 'Rejected',
      Preparing: 'Preparing',
      'Ready for Dispatch': 'Ready for Dispatch',
      Shipped: 'Shipped',
      Delivered: 'Delivered',
      Completed: 'Completed & Received',
      Cancelled: 'Cancelled',
      preparing: 'Preparing',
      ready: 'Ready',
      in_transit: 'In Transit',
      delivered: 'Delivered',
      failed: 'Failed',
      unpaid: 'Unpaid',
      partial: 'Partial',
      paid: 'Paid',
      void: 'Void',
    },
    roles: {
      owner: 'Wholesaler Owner',
      warehouse_manager: 'Warehouse Manager',
      sales_rep: 'Sales Representative',
      dispatch_coordinator: 'Dispatch Coordinator',
      accountant: 'Accountant',
    },
  },
};
