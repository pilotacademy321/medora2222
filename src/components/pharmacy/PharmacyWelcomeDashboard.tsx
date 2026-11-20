import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  MapPin,
  MessageSquare,
  Package,
  Pill,
  Plus,
  Receipt,
  ShoppingBag,
  Stethoscope,
  Store,
  Truck,
} from 'lucide-react';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import type { Language } from '../../types/medora';
import type { PharmacySectionId, PharmacyWorkspaceData } from '../../types/pharmacy';
import { MedoraTargetedAdShowcase } from '../shared/MedoraTargetedAdShowcase';
import { formatIqd, PharmacyLogoAvatar } from './PharmacyBrandUtils';

export function PharmacyWelcomeDashboard({
  firebaseUser,
  workspace,
  language,
  doctorOrdersCount = 0,
  unreadMessagesCount = 0,
  onNavigate,
}: {
  firebaseUser?: User | null;
  workspace: PharmacyWorkspaceData;
  language: Language;
  doctorOrdersCount?: number;
  unreadMessagesCount?: number;
  onNavigate: (sec: PharmacySectionId) => void;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const prof = workspace.pharmacyProfile;
  const r = workspace.reports;

  const totalRegisteredMedicines = workspace.products.length;
  const availableMedicines = workspace.products.filter(
    (p) => p.isActive && (p.availableQty ?? 0) > 0,
  ).length;
  const lowStockMedicines = r.lowStockCount;
  const expiringMedicines = r.expiringSoonCount + r.expiredBatchesCount;
  const pendingOnlineOrders = workspace.orders.filter(
    (o) =>
      o.status === 'Submitted' ||
      o.status === 'Under Pharmacist Review' ||
      o.status === 'Accepted' ||
      o.status === 'Preparing',
  ).length;
  const pendingRx = workspace.prescriptionReviews.filter(
    (p) => p.reviewStatus === 'Submitted' || p.reviewStatus === 'Under Pharmacist Review',
  ).length;
  const activeSupplyOrders = (workspace.supplyOrders || []).filter(
    (s) => s.status !== 'Completed' && s.status !== 'Cancelled' && s.status !== 'Rejected',
  ).length;

  const lowOrExpiringProducts = workspace.products
    .filter((p) => p.isActive && (p.availableQty ?? 0) <= (p.minStockThreshold ?? 5))
    .slice(0, 5);

  const kpis = [
    {
      label: isAr ? 'إجمالي الأدوية المسجلة' : 'Registered Medicines',
      value: totalRegisteredMedicines,
      sub: isAr ? 'صنف في الكتالوج' : 'Catalog SKUs',
      tone: 'text-[#0c3585] dark:text-white',
      icon: Pill,
      onClick: () => onNavigate('products'),
    },
    {
      label: isAr ? 'الأدوية المتوفرة حالياً' : 'In-Stock Medicines',
      value: availableMedicines,
      sub: isAr ? 'تشغيلة صالحة FEFO' : 'Valid unexpired stock',
      tone: 'text-emerald-700 dark:text-emerald-300',
      icon: Package,
      onClick: () => onNavigate('products'),
    },
    {
      label: isAr ? 'نواقص المخزون والصلاحية' : 'Low Stock & Expiry',
      value: lowStockMedicines + expiringMedicines,
      sub: isAr
        ? `${lowStockMedicines} نواقص · ${r.expiringSoonCount} قريبة الانتهاء`
        : `${lowStockMedicines} low · ${r.expiringSoonCount} expiring`,
      tone:
        lowStockMedicines + expiringMedicines > 0
          ? 'text-amber-600 dark:text-[#f4d378]'
          : 'text-slate-700 dark:text-slate-200',
      icon: AlertTriangle,
      onClick: () => onNavigate('products'),
    },
    {
      label: isAr ? 'طلبات المرضى الواردة' : 'Pending Patient Orders',
      value: pendingOnlineOrders,
      sub: isAr ? 'بانتظار المراجعة أو التجهيز' : 'Awaiting review / prep',
      tone: 'text-[#0c3585] dark:text-[#f4d378]',
      icon: ShoppingBag,
      onClick: () => onNavigate('orders'),
    },
    {
      label: isAr ? 'طلبات الأطباء والعيادات' : 'Doctor & Clinic Orders',
      value: doctorOrdersCount,
      sub: isAr ? `${pendingRx} وصفة قيد المراجعة` : `${pendingRx} pending Rx`,
      tone: 'text-[#0c3585] dark:text-[#f4d378]',
      icon: Stethoscope,
      onClick: () => onNavigate('doctor_orders'),
    },
    {
      label: isAr ? 'طلبات التوريد من المذاخر' : 'Wholesaler Supply Orders',
      value: activeSupplyOrders,
      sub: isAr
        ? `${(workspace.supplyOrders || []).length} إجمالي طلبات الشراء`
        : `${(workspace.supplyOrders || []).length} total B2B orders`,
      tone: 'text-slate-900 dark:text-white',
      icon: Building2,
      onClick: () => onNavigate('supply_orders'),
    },
    {
      label: isAr ? 'المراسلات والإيصالات' : 'Messages & Receipts',
      value: unreadMessagesCount,
      sub: isAr ? 'رسائل غير مقروءة · سجل 3-Party' : 'Unread msgs · 3-party receipts',
      tone: unreadMessagesCount > 0 ? 'text-[#d9a43b] dark:text-[#f4d378]' : 'text-slate-700 dark:text-slate-200',
      icon: MessageSquare,
      onClick: () => onNavigate('messages'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* MEDORA Luxury Royal Navy & Gold Pharmacy Partner Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-[#d9a43b]/35 bg-gradient-to-br from-[#061028] via-[#0c3585] to-[#1346ad] p-6 text-white shadow-lg">
        {prof.coverImageUrl && (
          <img
            src={prof.coverImageUrl}
            alt={prof.pharmacyNameAr}
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15"
          />
        )}
        <div className="pointer-events-none absolute -end-20 -top-20 h-64 w-64 rounded-full bg-[#d9a43b]/15 blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <PharmacyLogoAvatar
              logoUrl={prof.logoUrl}
              name={isAr ? prof.pharmacyNameAr : prof.pharmacyNameEn || prof.pharmacyNameAr}
              sizeClass="h-16 w-16"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#f4d378]">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {isAr ? 'شريك صيدلية معتمد في MEDORA' : 'Verified MEDORA Pharmacy Partner'} ·{' '}
                  {pt.statuses[prof.status] || prof.status}
                </span>
                {prof.featuredStatus === 'approved' && (
                  <>
                    <span>·</span>
                    <span className="rounded-full border border-[#f4d378]/40 bg-[#d9a43b]/20 px-2.5 py-0.5 text-[11px] text-[#f4d378]">
                      {isAr ? 'صيدلية مميزة' : 'Featured'}
                    </span>
                  </>
                )}
              </div>
              <h2 className="mt-1.5 text-xl font-extrabold tracking-tight sm:text-2xl">
                {isAr ? prof.pharmacyNameAr : prof.pharmacyNameEn || prof.pharmacyNameAr}
              </h2>
              <p className="mt-1 text-xs text-slate-200 sm:text-sm">
                {(isAr ? prof.taglineAr : prof.taglineEn) ||
                  `${prof.governorate} · ${prof.district} · ${prof.workingDaysAndHours}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('wholesaler')}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl px-4 text-xs font-extrabold cursor-pointer"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span>{isAr ? 'الشراء من سوق المذاخر' : 'Wholesaler Marketplace'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('storefront')}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur-xs transition hover:bg-white/20 cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{isAr ? 'معاينة الواجهة' : 'Storefront'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur-xs transition hover:bg-white/20 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isAr ? 'الأدوية والبطاقات' : 'Products'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('bulk_import')}
              className="inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur-xs transition hover:bg-white/20 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>{isAr ? 'استيراد جماعي' : 'Bulk Import'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Targeted Ads Showcase for Pharmacy Portal */}
      <MedoraTargetedAdShowcase
        portal="pharmacy"
        firebaseUser={firebaseUser}
        language={language}
        compact
        onAdAction={(ad) => {
          const target = ad.destinationTarget || '';
          if (target.includes('wholesaler')) onNavigate('wholesaler');
          else if (target.includes('receipts')) onNavigate('receipts');
        }}
      />

      {/* 8 Operational & Financial KPI Cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((card, idx) => {
          const Icon = card.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={card.onClick}
              className="group rounded-2xl border border-slate-200 bg-white p-5 text-start shadow-xs transition hover:border-[#0c3585]/50 dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b]/50 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {card.label}
                  </p>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-slate-400 transition group-hover:text-[#0c3585] dark:group-hover:text-[#f4d378]" />
              </div>
              <p className={`mt-3 font-latin text-2xl font-extrabold tabular-nums ${card.tone}`}>
                {card.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {card.sub}
              </p>
            </button>
          );
        })}

        {/* Online Revenue + Receipts Shortcut */}
        <button
          type="button"
          onClick={() => onNavigate('receipts')}
          className="rounded-2xl border border-[#d9a43b]/40 bg-gradient-to-br from-[#0c3585]/5 to-[#d9a43b]/10 p-5 text-start shadow-xs transition hover:border-[#d9a43b] dark:from-[#0c3585]/25 dark:to-[#d9a43b]/15 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
              <Receipt className="h-4 w-4" />
              {isAr ? 'المبيعات الشهرية والإيصالات' : 'Monthly Sales & Receipts'}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-3 font-latin text-xl font-extrabold tabular-nums text-slate-950 dark:text-white">
            {formatIqd(r.monthlySalesIqd, isAr)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
            {isAr
              ? `اليوم: ${formatIqd(r.dailySalesIqd, isAr)}`
              : `Today: ${formatIqd(r.dailySalesIqd, isAr)}`}
          </p>
        </button>
      </section>

      {/* Main Two-Column Operational Workspace */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Recent Online Orders */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'أحدث طلبات المرضى الإلكترونية' : 'Recent Online Orders'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              {isAr ? 'فتح إدارة الطلبات' : 'View All'}
            </button>
          </div>
          {workspace.orders.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {pt.common.noData}
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.orders.slice(0, 5).map((ord) => (
                <div
                  key={ord.orderId}
                  className="flex items-center justify-between gap-3 py-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 dark:text-white">
                      {ord.orderNumber} · {ord.patientName}
                    </p>
                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                      {ord.fulfillmentType === 'pickup'
                        ? isAr
                          ? 'استلام من الصيدلية'
                          : 'Pickup'
                        : isAr
                          ? 'توصيل للمريض'
                          : 'Delivery'}{' '}
                      · {pt.statuses[ord.status] || ord.status}
                    </p>
                  </div>
                  <span className="shrink-0 font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                    {formatIqd(ord.totalIqd, isAr)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Doctor Prescription Referrals */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'طلبات الوصفات الطبية المحوّلة' : 'Recent Prescription Referrals'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('prescriptions')}
              className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              {isAr ? 'مراجعة الوصفات' : 'Review Rx'}
            </button>
          </div>
          {workspace.prescriptionReviews.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {pt.common.noData}
            </p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.prescriptionReviews.slice(0, 5).map((rx) => (
                <div
                  key={rx.reviewId}
                  className="flex items-center justify-between gap-3 py-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 dark:text-white">
                      {rx.patientName} · {isAr ? `د. ${rx.doctorName}` : `Dr. ${rx.doctorName}`}
                    </p>
                    <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                      {rx.medications.length}{' '}
                      {isAr ? 'أدوية بالوصفة' : 'prescribed items'} ·{' '}
                      {pt.statuses[rx.reviewStatus] || rx.reviewStatus}
                    </p>
                  </div>
                  <span className="shrink-0 font-latin text-xs text-slate-500 tabular-nums">
                    {rx.prescribedDate}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pharmacy Profile Spotlight */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'بطاقة تعريف الصيدلية والخدمات' : 'Pharmacy Identity & Services'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              {isAr ? 'تعديل الملف' : 'Edit Profile'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#030712]/60">
              <p className="flex items-center gap-1.5 font-semibold text-[#0c3585] dark:text-[#f4d378]">
                <MapPin className="h-3.5 w-3.5" />
                {isAr ? 'الموقع والعنوان' : 'Location'}
              </p>
              <p className="mt-1 text-slate-800 dark:text-slate-200">
                {prof.governorate} · {prof.district}
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">{prof.address}</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#030712]/60">
              <p className="flex items-center gap-1.5 font-semibold text-[#0c3585] dark:text-[#f4d378]">
                <Clock className="h-3.5 w-3.5" />
                {isAr ? 'ساعات الدوام' : 'Operating Hours'}
              </p>
              <p className="mt-1 text-slate-800 dark:text-slate-200">
                {prof.is24Hours
                  ? isAr
                    ? 'خدمة على مدار 24 ساعة'
                    : 'Open 24 Hours'
                  : prof.workingDaysAndHours}
              </p>
              <p className="mt-0.5 font-latin text-slate-500" dir="ltr">
                {prof.professionalPhone}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#030712]/60 sm:col-span-2">
              <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                <Truck className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
                {isAr ? 'خيارات التسليم والدفع' : 'Fulfillment & Payment'}
              </p>
              <p className="mt-1 text-slate-600 dark:text-slate-300">
                {prof.pickupAvailable !== false
                  ? isAr
                    ? 'استلام مباشر من الصيدلية'
                    : 'In-Pharmacy Pickup'
                  : ''}
                {prof.pickupAvailable !== false && prof.deliveryAvailable ? ' · ' : ''}
                {prof.deliveryAvailable
                  ? isAr
                    ? `توصيل متاح (${prof.deliveryZones.filter((z) => z.isActive).length} مناطق)`
                    : `Delivery Enabled (${prof.deliveryZones.filter((z) => z.isActive).length} zones)`
                  : ''}
                {prof.minimumOrderIqd > 0
                  ? ` · ${isAr ? 'الحد الأدنى' : 'Min'}: ${formatIqd(prof.minimumOrderIqd, isAr)}`
                  : ''}
              </p>
            </div>
          </div>
        </section>

        {/* Inventory & Expiry Alerts */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'تنبيهات النواقص والصلاحية' : 'Stock & Expiry Alerts'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('wholesaler')}
              className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              {isAr ? 'توريد من المذاخر' : 'Order from Wholesaler'}
            </button>
          </div>
          {lowOrExpiringProducts.length === 0 && r.expiringSoonCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-slate-500">
              <Package className="mb-2 h-6 w-6 text-[#0c3585] dark:text-[#f4d378]" />
              {isAr
                ? 'مستويات المخزون وصلاحية التشغيلات مستقرة حالياً.'
                : 'All active medicines and FEFO batches are in healthy stock.'}
            </div>
          ) : (
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {lowOrExpiringProducts.map((p) => (
                <div
                  key={p.productId}
                  className="flex items-center justify-between gap-3 py-2.5 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Pill className="h-4 w-4 shrink-0 text-amber-500 dark:text-[#f4d378]" />
                    <div className="min-w-0">
                      <p className="truncate font-bold text-slate-900 dark:text-white">
                        {p.brandName || p.scientificName} · {p.strength}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {p.scientificName} · {isAr ? 'الحد الأدنى' : 'Min'}: {p.minStockThreshold}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 font-latin font-bold tabular-nums text-amber-600 dark:text-[#f4d378]">
                    {p.availableQty ?? 0} {isAr ? 'متبقي' : 'left'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
