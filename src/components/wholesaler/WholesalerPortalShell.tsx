import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  Factory,
  History,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  ShoppingBag,
  Sun,
  Truck,
  UserCog,
  Warehouse,
  X,
} from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { wholesalerTranslations } from '../../i18n/wholesalerTranslations';
import { fetchWholesalerWorkspace } from '../../services/wholesalerService';
import type {
  WholesalerNotificationRecord,
  WholesalerPermissionKey,
  WholesalerSectionId,
  WholesalerWorkspaceData,
} from '../../types/wholesaler';
import {
  WholesalerCreditPoliciesSection,
  WholesalerInvoicesAndPaymentsSection,
  WholesalerOverviewSection,
  WholesalerShipmentsSection,
  WholesalerSupplyOrdersSection,
} from './WholesalerB2BSections';
import {
  WholesalerBatchesSection,
  WholesalerCommsAndSettingsSection,
  WholesalerProductsSection,
  WholesalerStaffSection,
  WholesalerSuppliersAndPosSection,
} from './WholesalerInventoryAndAdminSections';
import { MedoraReceiptsLedgerPanel } from '../shared/MedoraReceiptsLedgerPanel';

interface WholesalerPortalShellProps {
  firebaseUser: User;
  onBackToMedora: () => void;
  onSignOut: () => Promise<void>;
}

const SECTION_PERMISSIONS: Record<WholesalerSectionId, WholesalerPermissionKey[] | 'all'> = {
  overview: 'all',
  products: ['manageCatalog'],
  batches: ['manageBatches', 'manageInventory'],
  inventory: ['manageInventory', 'manageBatches'],
  pharmacies: ['managePharmacies'],
  supply_orders: ['manageSupplyOrders'],
  shipments: ['manageShipments'],
  suppliers: ['manageSuppliers'],
  purchase_orders: ['managePurchaseOrders'],
  invoices: ['manageBilling'],
  receipts: ['manageBilling', 'manageSupplyOrders'],
  payments: ['manageBilling'],
  returns: ['manageReturns'],
  staff: ['manageStaff'],
  communications: 'all',
  reports: ['viewReports'],
  settings: ['manageSettings'],
};

export const WholesalerPortalShell: React.FC<WholesalerPortalShellProps> = ({
  firebaseUser,
  onBackToMedora,
  onSignOut,
}) => {
  const { language, toggleLanguage, theme, toggleTheme } = useMedora();
  const wt = wholesalerTranslations[language];
  const isAr = language === 'ar';

  const [workspace, setWorkspace] = useState<WholesalerWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<WholesalerSectionId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchWholesalerWorkspace(firebaseUser);
        setWorkspace(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'WHOLESALER_WORKSPACE_ERROR');
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

  useRealtimeNotifications<WholesalerNotificationRecord>({
    collectionName: 'wholesaler_notifications',
    uidField: 'wholesalerUid',
    uid: workspace?.wholesalerProfile?.uid || firebaseUser?.uid,
    enabled: Boolean(
      workspace &&
        workspace.actorRole === 'wholesaler_owner' &&
        (workspace.wholesalerProfile?.uid || firebaseUser?.uid),
    ),
    onUpdate: (items) => {
      setWorkspace((prev) => (prev ? { ...prev, notifications: items } : prev));
    },
  });

  const hasPerm = useCallback(
    (perm: WholesalerPermissionKey): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'wholesaler_owner') return true;
      return workspace.permissions.includes(perm);
    },
    [workspace],
  );

  const canAccessSection = useCallback(
    (section: WholesalerSectionId): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'wholesaler_owner') return true;
      const rule = SECTION_PERMISSIONS[section];
      if (rule === 'all') return true;
      return rule.some((p) => workspace.permissions.includes(p));
    },
    [workspace],
  );

  const badges = useMemo(() => {
    if (!workspace) return { orders: 0, comms: 0 };
    return {
      orders: workspace.supplyOrders.filter((o) => o.status === 'Submitted').length,
      comms: workspace.notifications.filter((n) => !n.isRead).length,
    };
  }, [workspace]);

  const navItems = useMemo(
    () => [
      { id: 'overview' as WholesalerSectionId, label: wt.nav.overview, icon: LayoutDashboard, badge: 0 },
      { id: 'supply_orders' as WholesalerSectionId, label: wt.nav.supply_orders, icon: ShoppingBag, badge: badges.orders },
      { id: 'shipments' as WholesalerSectionId, label: wt.nav.shipments, icon: Truck, badge: 0 },
      { id: 'products' as WholesalerSectionId, label: wt.nav.products, icon: Warehouse, badge: 0 },
      { id: 'batches' as WholesalerSectionId, label: wt.nav.batches, icon: Layers, badge: 0 },
      { id: 'inventory' as WholesalerSectionId, label: wt.nav.inventory, icon: History, badge: 0 },
      { id: 'pharmacies' as WholesalerSectionId, label: wt.nav.pharmacies, icon: Building2, badge: 0 },
      { id: 'suppliers' as WholesalerSectionId, label: wt.nav.suppliers, icon: Factory, badge: 0 },
      { id: 'purchase_orders' as WholesalerSectionId, label: wt.nav.purchase_orders, icon: ClipboardCheck, badge: 0 },
      { id: 'invoices' as WholesalerSectionId, label: wt.nav.invoices, icon: Receipt, badge: 0 },
      { id: 'receipts' as WholesalerSectionId, label: wt.nav.receipts, icon: ClipboardCheck, badge: 0 },
      { id: 'payments' as WholesalerSectionId, label: wt.nav.payments, icon: DollarSign, badge: 0 },
      { id: 'returns' as WholesalerSectionId, label: wt.nav.returns, icon: RotateCcw, badge: 0 },
      { id: 'staff' as WholesalerSectionId, label: wt.nav.staff, icon: UserCog, badge: 0 },
      { id: 'communications' as WholesalerSectionId, label: wt.nav.communications, icon: Bell, badge: badges.comms },
      { id: 'reports' as WholesalerSectionId, label: wt.nav.reports, icon: BarChart3, badge: 0 },
      { id: 'settings' as WholesalerSectionId, label: wt.nav.settings, icon: Settings, badge: 0 },
    ],
    [wt, badges],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020817] p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold">{wt.loading}</span>
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020817] p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-6 text-center space-y-4">
          <ShieldAlert className="h-10 w-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {isAr ? 'تعذر فتح بوابة المذخر الدوائي' : 'Unable to Access MEDORA Wholesaler'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {loadError === 'WHOLESALER_SUSPENDED'
              ? isAr
                ? 'تم إيقاف حساب المذخر من قبل إدارة MEDORA.'
                : 'This wholesaler has been suspended by MEDORA administration.'
              : isAr
                ? 'حساب المذخر بانتظار موافقة الإدارة العليا.'
                : 'Wholesaler access is pending Super Admin approval or unavailable.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onBackToMedora}
              className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-bold cursor-pointer"
            >
              {wt.backToMedora}
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[42px] rounded-xl bg-rose-600 text-white px-4 text-xs font-bold cursor-pointer"
            >
              {wt.signOut}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const wholesalerTitle = isAr
    ? workspace.wholesalerProfile.wholesalerNameAr
    : workspace.wholesalerProfile.wholesalerNameEn || workspace.wholesalerProfile.wholesalerNameAr;

  const renderSection = () => {
    if (!canAccessSection(activeSection)) {
      return (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {isAr ? 'لا تملك الصلاحية للوصول إلى هذا القسم.' : 'Access restricted by warehouse RBAC policy.'}
        </div>
      );
    }

    switch (activeSection) {
      case 'overview':
        return (
          <WholesalerOverviewSection
            workspace={workspace}
            language={language}
            onNavigate={setActiveSection}
          />
        );
      case 'supply_orders':
        return (
          <WholesalerSupplyOrdersSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('manageSupplyOrders')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'shipments':
        return (
          <WholesalerShipmentsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canDispatch={hasPerm('manageShipments')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'products':
        return (
          <WholesalerProductsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canEdit={hasPerm('manageCatalog')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'batches':
        return (
          <WholesalerBatchesSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('manageBatches')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'pharmacies':
        return (
          <WholesalerCreditPoliciesSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            canManage={hasPerm('managePharmacies')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'suppliers':
      case 'purchase_orders':
        return (
          <WholesalerSuppliersAndPosSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            mode={activeSection}
            canManage={
              activeSection === 'suppliers'
                ? hasPerm('manageSuppliers')
                : hasPerm('managePurchaseOrders')
            }
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'invoices':
      case 'payments':
        return (
          <WholesalerInvoicesAndPaymentsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            mode={activeSection}
            canManage={hasPerm('manageBilling')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'receipts':
        return (
          <MedoraReceiptsLedgerPanel
            firebaseUser={firebaseUser}
            lang={language}
            viewerUid={workspace.wholesalerProfile.uid}
            defaultFilterType="wholesaler_to_pharmacy"
            titleAr="سجل الإيصالات الثلاثية الموحدة — المذخر"
            titleEn="Wholesaler Unified 3-Party Receipts"
          />
        );
      case 'staff':
        return (
          <WholesalerStaffSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'inventory':
      case 'returns':
      case 'communications':
      case 'reports':
      case 'settings':
        return (
          <WholesalerCommsAndSettingsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            language={language}
            mode={activeSection}
            onRefresh={() => loadWorkspace(true)}
          />
        );
    }
  };

  return (
    <div className="flex min-h-dvh w-full bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      <aside className="hidden lg:flex w-[272px] shrink-0 flex-col justify-between border-e border-slate-200 bg-white px-4 py-5 dark:border-slate-800 dark:bg-[#060f23]">
        <div>
          <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{wholesalerTitle}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
              {wt.roles[workspace.staffRole] || workspace.staffRole}
            </p>
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
                  onClick={() => setActiveSection(item.id)}
                  className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span className="font-latin rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums bg-[#d9a43b]/20 text-[#9a6b16] dark:text-[#f4d378]">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onBackToMedora}
            className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700 cursor-pointer"
          >
            <BackIcon className="h-3.5 w-3.5" />
            <span>{wt.backToMedora}</span>
          </button>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{wt.signOut}</span>
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-slate-950/75 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[280px] flex-col justify-between overflow-y-auto bg-white p-4 dark:bg-[#060f23]"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <span className="text-sm font-bold truncate">{wholesalerTitle}</span>
                <button type="button" onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => {
                  if (!canAccessSection(item.id)) return null;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-h-[40px] w-full items-center justify-between rounded-xl px-3 text-xs font-semibold ${
                        activeSection === item.id ? 'bg-[#0c3585] text-white' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge > 0 && <span className="font-latin text-xs">{item.badge}</span>}
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={onBackToMedora}
              className="mt-4 min-h-[40px] w-full rounded-xl border border-slate-300 text-xs font-bold"
            >
              {wt.backToMedora}
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-[#060f23] sm:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                {wt.nav[activeSection]}
              </h1>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{wholesalerTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadWorkspace(true)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{wt.refresh}</span>
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-lg border border-slate-300 px-3 text-xs font-semibold dark:border-slate-700 cursor-pointer"
            >
              {isAr ? 'EN' : 'AR'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-[#f4d378]" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8">{renderSection()}</main>
      </div>
    </div>
  );
};
