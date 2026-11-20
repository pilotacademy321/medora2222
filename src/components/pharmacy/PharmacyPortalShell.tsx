import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Pill,
  Receipt,
  RefreshCw,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  Store,
  Sun,
  Truck,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../../constants/brand';
import { useMedora } from '../../contexts/MedoraContext';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import { fetchPharmacyDoctorOrders } from '../../services/commerceService';
import { fetchMessagingThreads } from '../../services/messagingService';
import { fetchPharmacyWorkspace } from '../../services/pharmacyService';
import type {
  PharmacyNotificationRecord,
  PharmacyPermissionKey,
  PharmacySectionId,
  PharmacyWorkspaceData,
  PublicPharmacyStorefrontData,
  PublicPharmacyStorefrontProduct,
} from '../../types/pharmacy';
import { BulkDrugImportWorkspace } from '../shared/BulkDrugImportWorkspace';
import { MedoraMessagingPanel } from '../shared/MedoraMessagingPanel';
import { MedoraReceiptsLedgerPanel } from '../shared/MedoraReceiptsLedgerPanel';
import { PharmacyLogoAvatar } from './PharmacyBrandUtils';
import { PharmacyDoctorOrdersSection } from './PharmacyDoctorOrdersSection';
import {
  PharmacyReportsSection,
  PharmacySettingsWorkspace,
  PharmacySupplyOrdersSection,
  PharmacyWholesalerMarketplaceSection,
} from './PharmacyInventoryAndB2BSections';
import { PharmacyInventoryWorkspace } from './PharmacyInventoryWorkspace';
import { PharmacyMarketingSection } from './PharmacyMarketingSection';
import {
  PharmacyOrdersSection,
  PharmacyPrescriptionsSection,
} from './PharmacyOperationsSections';
import { PharmacyProfileSection } from './PharmacyProfileSection';
import { PharmacyPublicStorefront } from './PharmacyPublicStorefront';
import { PharmacyWelcomeDashboard } from './PharmacyWelcomeDashboard';

interface PharmacyPortalShellProps {
  firebaseUser: User;
  onBackToMedora: () => void;
  onSignOut: () => Promise<void>;
}

const SECTION_PERMISSIONS: Record<PharmacySectionId, PharmacyPermissionKey[] | 'all'> = {
  overview: 'all',
  profile: 'all',
  storefront: 'all',
  products: ['manageCatalog', 'manageInventory', 'manageBatches'],
  bulk_import: ['manageCatalog', 'manageBatches'],
  orders: ['manageOrders', 'dispensePrescriptions', 'manageBilling', 'manageDeliveries', 'manageReturns'],
  doctor_orders: ['manageOrders', 'dispensePrescriptions', 'manageBilling'],
  prescriptions: ['reviewPrescriptions', 'dispensePrescriptions'],
  wholesaler: ['manageSupplyOrders'],
  supply_orders: ['manageSupplyOrders'],
  receipts: ['manageBilling', 'manageOrders', 'manageSupplyOrders', 'viewReports'],
  messages: 'all',
  marketing: ['manageSettings'],
  reports: ['viewReports'],
  settings: ['manageSettings', 'manageStaff', 'manageCommunications'],
};

export const PharmacyPortalShell: React.FC<PharmacyPortalShellProps> = ({
  firebaseUser,
  onBackToMedora,
  onSignOut,
}) => {
  const { language, toggleLanguage, theme, toggleTheme } = useMedora();
  const pt = pharmacyTranslations[language];
  const isAr = language === 'ar';

  const [workspace, setWorkspace] = useState<PharmacyWorkspaceData | null>(null);
  const [doctorOrdersPending, setDoctorOrdersPending] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<PharmacySectionId>('overview');
  const [settingsSubTab, setSettingsSubTab] = useState<'operations' | 'staff' | 'communications'>(
    'operations',
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const [data, docOrdersRes, threads] = await Promise.all([
          fetchPharmacyWorkspace(firebaseUser),
          fetchPharmacyDoctorOrders(firebaseUser).catch(() => ({ orders: [], receipts: [] })),
          fetchMessagingThreads(firebaseUser).catch(() => ({
            viewerRole: 'pharmacy' as const,
            viewerUid: firebaseUser.uid,
            threads: [],
            totalUnread: 0,
          })),
        ]);
        setWorkspace(data);
        setDoctorOrdersPending(
          (docOrdersRes.orders || []).filter(
            (o) => o.status !== 'Completed' && o.status !== 'Rejected' && o.status !== 'Cancelled',
          ).length,
        );
        const ownerUid = data.pharmacyProfile?.uid || firebaseUser.uid;
        const unread = threads.threads.reduce(
          (acc, t) => acc + (t.unreadCountByUid?.[ownerUid] || 0),
          0,
        );
        setUnreadMessagesCount(unread);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'PHARMACY_WORKSPACE_ERROR');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [firebaseUser],
  );

  useEffect(() => {
    void loadWorkspace(false);
  }, [loadWorkspace]);

  useRealtimeNotifications<PharmacyNotificationRecord>({
    collectionName: 'pharmacy_notifications',
    uidField: 'pharmacyUid',
    uid: workspace?.pharmacyProfile?.uid || firebaseUser?.uid,
    enabled: Boolean(
      workspace &&
        workspace.actorRole === 'pharmacy_owner' &&
        (workspace.pharmacyProfile?.uid || firebaseUser?.uid),
    ),
    onUpdate: (items) => {
      setWorkspace((prev) => (prev ? { ...prev, notifications: items } : prev));
    },
  });

  const hasPerm = useCallback(
    (perm: PharmacyPermissionKey): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'pharmacy_owner') return true;
      return workspace.permissions.includes(perm);
    },
    [workspace],
  );

  const canAccessSection = useCallback(
    (section: PharmacySectionId): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'pharmacy_owner') return true;
      const rule = SECTION_PERMISSIONS[section];
      if (rule === 'all') return true;
      return rule.some((p) => workspace.permissions.includes(p));
    },
    [workspace],
  );

  const badges = useMemo(() => {
    if (!workspace) return { orders: 0, prescriptions: 0, supplyOrders: 0, comms: 0 };
    return {
      orders: workspace.orders.filter(
        (o) => o.status === 'Submitted' || o.status === 'Under Pharmacist Review',
      ).length,
      prescriptions: workspace.prescriptionReviews.filter(
        (r) => r.reviewStatus === 'Submitted',
      ).length,
      supplyOrders: (workspace.supplyOrders || []).filter(
        (s) => s.status === 'Amendment Proposed' || s.status === 'Shipped' || s.status === 'Delivered',
      ).length,
      comms: workspace.notifications.filter((n) => !n.isRead).length,
    };
  }, [workspace]);

  const navItems = useMemo(
    () => [
      { id: 'overview' as PharmacySectionId, label: pt.nav.overview, icon: LayoutDashboard, badge: 0 },
      { id: 'profile' as PharmacySectionId, label: pt.nav.profile, icon: Store, badge: 0 },
      { id: 'storefront' as PharmacySectionId, label: pt.nav.storefront, icon: Eye, badge: 0 },
      { id: 'products' as PharmacySectionId, label: pt.nav.products, icon: Pill, badge: 0 },
      { id: 'bulk_import' as PharmacySectionId, label: pt.nav.bulk_import, icon: FileSpreadsheet, badge: 0 },
      { id: 'orders' as PharmacySectionId, label: pt.nav.orders, icon: ShoppingBag, badge: badges.orders },
      { id: 'doctor_orders' as PharmacySectionId, label: pt.nav.doctor_orders, icon: Stethoscope, badge: doctorOrdersPending },
      {
        id: 'prescriptions' as PharmacySectionId,
        label: pt.nav.prescriptions,
        icon: ClipboardCheck,
        badge: badges.prescriptions,
      },
      { id: 'wholesaler' as PharmacySectionId, label: pt.nav.wholesaler, icon: Building2, badge: 0 },
      {
        id: 'supply_orders' as PharmacySectionId,
        label: pt.nav.supply_orders,
        icon: Truck,
        badge: badges.supplyOrders,
      },
      { id: 'receipts' as PharmacySectionId, label: pt.nav.receipts, icon: Receipt, badge: 0 },
      { id: 'messages' as PharmacySectionId, label: pt.nav.messages, icon: MessageSquare, badge: unreadMessagesCount },
      { id: 'marketing' as PharmacySectionId, label: pt.nav.marketing, icon: Megaphone, badge: 0 },
      { id: 'reports' as PharmacySectionId, label: pt.nav.reports, icon: BarChart3, badge: 0 },
      { id: 'settings' as PharmacySectionId, label: pt.nav.settings, icon: Settings, badge: badges.comms },
    ],
    [pt, badges, doctorOrdersPending, unreadMessagesCount],
  );

  // Build clean retail-only storefront preview payload strictly free of wholesale/purchase pricing
  const previewStorefront = useMemo<PublicPharmacyStorefrontData | null>(() => {
    if (!workspace) return null;
    const prof = workspace.pharmacyProfile;

    const products: PublicPharmacyStorefrontProduct[] = workspace.products
      .filter(
        (p) =>
          p.isActive &&
          p.isPublishedToPatients !== false &&
          p.availableForPatientOrders !== false &&
          (p.availableQty ?? 0) > 0,
      )
      .map((p) => {
        const discountValid =
          p.discountPriceIqd != null &&
          p.discountPriceIqd > 0 &&
          p.discountPriceIqd < p.sellingPriceIqd;
        const effectivePriceIqd = discountValid ? Number(p.discountPriceIqd) : Number(p.sellingPriceIqd);
        return {
          productId: p.productId,
          medicineId: p.medicineId,
          scientificName: p.scientificName,
          activeIngredient: p.activeIngredient,
          brandName: p.brandName,
          strength: p.strength,
          dosageForm: p.dosageForm,
          packSize: p.packSize,
          manufacturer: p.manufacturer,
          country: p.country,
          therapeuticCategory: p.therapeuticCategory || (isAr ? 'عام' : 'General'),
          imageReference: p.imageReference,
          requiresPrescription: Boolean(p.requiresPrescription),
          controlledDrug: Boolean(p.controlledDrug),
          sellingPriceIqd: Number(p.sellingPriceIqd),
          discountPriceIqd: discountValid ? Number(p.discountPriceIqd) : null,
          effectivePriceIqd,
          availableQty: Number(p.availableQty || 0),
          availabilityStatus:
            (p.availableQty || 0) <= Math.max(1, p.minStockThreshold || 5)
              ? 'low_stock'
              : 'in_stock',
          nearestExpiryDate: p.nearestExpiryDate || null,
        };
      });

    const approvedOffers = (workspace.specialOffers || []).filter(
      (o) => o.isActive && o.approvalStatus === 'approved',
    );
    const hasBanner =
      prof.marketingApprovalStatus === 'approved' &&
      Boolean(
        prof.promotionalBannerTitleAr ||
          prof.promotionalBannerTitleEn ||
          prof.promotionalBannerBodyAr ||
          prof.promotionalBannerImageUrl,
      );

    const categories = Array.from(
      new Set(products.map((p) => p.therapeuticCategory).filter(Boolean)),
    );

    return {
      pharmacy: {
        uid: prof.uid,
        institutionId: prof.institutionId,
        publicSlug: prof.publicSlug || prof.uid,
        pharmacyNameAr: prof.pharmacyNameAr,
        pharmacyNameEn: prof.pharmacyNameEn || prof.pharmacyNameAr,
        governorate: prof.governorate,
        district: prof.district,
        address: prof.address,
        logoUrl: prof.logoUrl,
        coverImageUrl: prof.coverImageUrl,
        taglineAr: prof.taglineAr,
        taglineEn: prof.taglineEn,
        aboutAr: prof.aboutAr,
        aboutEn: prof.aboutEn,
        professionalPhone: prof.professionalPhone,
        mapLocationUrl: prof.mapLocationUrl,
        workingDaysAndHours: prof.workingDaysAndHours,
        is24Hours: prof.is24Hours,
        pickupAvailable: prof.pickupAvailable,
        deliveryAvailable: prof.deliveryAvailable,
        deliveryZonesCount: (prof.deliveryZones || []).filter((z) => z.isActive).length,
        deliveryZones: prof.deliveryZones || [],
        minimumOrderIqd: prof.minimumOrderIqd || 0,
        acceptedPaymentMethods: prof.acceptedPaymentMethods || ['cash_on_pickup'],
        featuredApproved: prof.featuredStatus === 'approved',
        publishedInStockCount: products.length,
        approvedOffersCount: approvedOffers.length,
        approvedPromoBanner: hasBanner
          ? {
              titleAr: prof.promotionalBannerTitleAr || '',
              titleEn: prof.promotionalBannerTitleEn || '',
              bodyAr: prof.promotionalBannerBodyAr || '',
              bodyEn: prof.promotionalBannerBodyEn || '',
              imageUrl: prof.promotionalBannerImageUrl,
            }
          : null,
      },
      specialOffers: approvedOffers,
      categories,
      products,
    };
  }, [workspace, isAr]);

  const navigateSection = (sec: PharmacySectionId, targetSettingsTab?: 'operations' | 'staff' | 'communications') => {
    if (sec === 'settings' && targetSettingsTab) {
      setSettingsSubTab(targetSettingsTab);
    } else if (sec === 'settings') {
      setSettingsSubTab('operations');
    }
    setActiveSection(sec);
    setMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#030712] p-6">
        <div className="flex flex-col items-center gap-3 text-[#0c3585] dark:text-[#f4d378]">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm font-semibold">{pt.loading}</span>
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#030712] p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-6 text-center space-y-4 shadow-sm">
          <ShieldAlert className="h-10 w-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isAr ? 'تعذر فتح بوابة الصيدلية' : 'Unable to Access MEDORA Pharmacy'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {loadError === 'PHARMACY_SUSPENDED'
              ? isAr
                ? 'تم إيقاف حساب الصيدلية من قبل إدارة MEDORA.'
                : 'This pharmacy has been suspended by MEDORA administration.'
              : isAr
                ? 'حساب الصيدلية غير مفعل أو بانتظار موافقة الإدارة العليا.'
                : 'Pharmacy access is pending Super Admin approval or unavailable.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onBackToMedora}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-100 cursor-pointer"
            >
              {pt.backToMedora}
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[42px] rounded-xl bg-rose-600 text-white px-4 text-xs font-bold cursor-pointer"
            >
              {pt.signOut}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const prof = workspace.pharmacyProfile;
  const pharmacyTitle = isAr
    ? prof.pharmacyNameAr
    : prof.pharmacyNameEn || prof.pharmacyNameAr;

  const renderSection = () => {
    if (!canAccessSection(activeSection)) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {isAr ? 'لا تملك الصلاحية للوصول إلى هذا القسم.' : 'You do not have permission for this section.'}
        </div>
      );
    }

    switch (activeSection) {
      case 'overview':
        return (
          <PharmacyWelcomeDashboard
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            doctorOrdersCount={doctorOrdersPending}
            unreadMessagesCount={unreadMessagesCount}
            onNavigate={(sec) => navigateSection(sec)}
          />
        );
      case 'profile':
        return (
          <PharmacyProfileSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('manageSettings')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'storefront':
        return previewStorefront ? (
          <PharmacyPublicStorefront
            storefront={previewStorefront}
            language={language}
            mode="pharmacy_preview"
            viewerRole="pharmacy"
            firebaseUser={firebaseUser}
            onBack={() => navigateSection('overview')}
          />
        ) : null;
      case 'products':
        return (
          <PharmacyInventoryWorkspace
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canEditCatalog={hasPerm('manageCatalog')}
            canManageBatches={hasPerm('manageBatches') || hasPerm('manageInventory')}
            onNavigate={(sec) => navigateSection(sec)}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'bulk_import':
        return (
          <BulkDrugImportWorkspace
            firebaseUser={firebaseUser}
            portalType="pharmacy"
            language={language}
            onSuccessRefresh={() => loadWorkspace(true)}
          />
        );
      case 'orders':
        return (
          <PharmacyOrdersSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('manageOrders')}
            canCollectBilling={hasPerm('manageBilling')}
            canManageDeliveries={hasPerm('manageDeliveries')}
            canManageReturns={hasPerm('manageReturns')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'doctor_orders':
        return (
          <PharmacyDoctorOrdersSection
            firebaseUser={firebaseUser}
            language={language}
            canManage={hasPerm('manageOrders') || hasPerm('dispensePrescriptions')}
            onRefreshWorkspace={() => loadWorkspace(true)}
          />
        );
      case 'prescriptions':
        return (
          <PharmacyPrescriptionsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canReview={hasPerm('reviewPrescriptions')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'wholesaler':
        return (
          <PharmacyWholesalerMarketplaceSection
            firebaseUser={firebaseUser}
            language={language}
            canOrder={hasPerm('manageSupplyOrders')}
            onNavigate={(sec) => navigateSection(sec)}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'supply_orders':
        return (
          <PharmacySupplyOrdersSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canOrder={hasPerm('manageSupplyOrders')}
            onNavigate={(sec) => navigateSection(sec)}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'receipts':
        return (
          <MedoraReceiptsLedgerPanel
            firebaseUser={firebaseUser}
            lang={language}
            viewerUid={prof.uid}
            titleAr="سجل الإيصالات الثلاثية والمبيعات والمشتريات"
            titleEn="3-Party Receipts, Sales & Purchase Ledger"
          />
        );
      case 'messages':
        return (
          <MedoraMessagingPanel
            firebaseUser={firebaseUser}
            lang={language}
            portalRole="pharmacy"
          />
        );
      case 'marketing':
        return (
          <PharmacyMarketingSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('manageSettings')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'reports':
        return <PharmacyReportsSection workspace={workspace} language={language} />;
      case 'settings':
        return (
          <PharmacySettingsWorkspace
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManageSettings={hasPerm('manageSettings')}
            canManageStaff={hasPerm('manageStaff')}
            initialSubTab={settingsSubTab}
            onRefresh={() => loadWorkspace(true)}
          />
        );
    }
  };

  return (
    <div className="flex min-h-dvh w-full bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      {/* MEDORA Royal Navy & Gold Sidebar */}
      <aside className="medora-no-print hidden lg:flex w-[276px] shrink-0 flex-col justify-between overflow-y-auto border-e border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-[#061028]">
        <div>
          <div className="border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <PharmacyLogoAvatar
                logoUrl={prof.logoUrl}
                name={pharmacyTitle}
                sizeClass="h-11 w-11"
              />
              <div className="min-w-0 flex-1">
                <p className="font-latin truncate text-[10px] font-extrabold tracking-widest uppercase text-[#0c3585] dark:text-[#f4d378]">
                  {pt.brandTitle}
                </p>
                <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                  {pharmacyTitle}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-[#0c3585] dark:text-[#f4d378] truncate">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {pt.roles[workspace.staffRole] || workspace.staffRole}
                </span>
              </span>
              <span className="font-latin text-[10px] font-bold text-slate-400 tabular-nums shrink-0">
                {prof.governorate}
              </span>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const allowed = canAccessSection(item.id);
              if (!allowed) return null;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateSection(item.id)}
                  className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white shadow-sm'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span
                      className={`font-latin rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        active
                          ? 'bg-[#d9a43b] text-[#040917]'
                          : 'bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/20 dark:text-[#f4d378]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-6 space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-center pb-1">
            <img
              src={MEDORA_LOGO_URL}
              alt="MEDORA"
              className="medora-logo-adaptive h-6 w-auto opacity-90 object-contain"
            />
          </div>
          <button
            type="button"
            onClick={onBackToMedora}
            className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-100 cursor-pointer"
          >
            <BackIcon className="h-3.5 w-3.5" />
            <span>{pt.backToMedora}</span>
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{pt.signOut}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="medora-no-print fixed inset-0 z-50 flex bg-slate-950/75 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[280px] flex-col justify-between overflow-y-auto bg-white p-4 text-slate-900 dark:bg-[#061028] dark:text-slate-100"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PharmacyLogoAvatar
                    logoUrl={prof.logoUrl}
                    name={pharmacyTitle}
                    sizeClass="h-9 w-9"
                  />
                  <div className="min-w-0">
                    <p className="font-latin text-[10px] font-extrabold tracking-wider text-[#0c3585] dark:text-[#f4d378] truncate">
                      {pt.brandTitle}
                    </p>
                    <span className="text-sm font-bold text-slate-900 dark:text-white truncate block">
                      {pharmacyTitle}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                  className="p-1 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  if (!canAccessSection(item.id)) return null;
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateSection(item.id)}
                      className={`flex min-h-[40px] w-full items-center justify-between rounded-xl px-3 text-xs font-bold cursor-pointer ${
                        active
                          ? 'bg-[#0c3585] text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge > 0 && (
                        <span
                          className={`font-latin rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            active
                              ? 'bg-[#d9a43b] text-[#040917]'
                              : 'bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/20 dark:text-[#f4d378]'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={onBackToMedora}
              className="mt-4 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-100 cursor-pointer"
            >
              {pt.backToMedora}
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="medora-no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-5 py-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-[#061028]/95 sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378] lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold text-slate-900 dark:text-white">
                {pt.nav[activeSection]}
              </h1>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {pharmacyTitle} · {prof.responsiblePharmacistName || prof.ownerFullName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateSection('storefront')}
              className="hidden sm:inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/5 px-3 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/10 dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] whitespace-nowrap cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>{pt.nav.storefront}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateSection('messages')}
              aria-label={pt.nav.messages}
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
            >
              <MessageSquare className="h-4 w-4" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -end-1 font-latin rounded-full bg-[#d9a43b] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#040917] tabular-nums">
                  {unreadMessagesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigateSection('settings', 'communications')}
              aria-label={pt.nav.settings}
              className="relative flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
            >
              <Bell className="h-4 w-4" />
              {badges.comms > 0 && (
                <span className="absolute -top-1 -end-1 font-latin rounded-full bg-[#0c3585] px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
                  {badges.comms}
                </span>
              )}
            </button>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadWorkspace(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{pt.refresh}</span>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-latin text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
            >
              {isAr ? 'EN' : 'AR'}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#f4d378]" />
              ) : (
                <Moon className="h-4 w-4 text-[#0c3585]" />
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-5 sm:p-8">{renderSection()}</main>
      </div>
    </div>
  );
};
