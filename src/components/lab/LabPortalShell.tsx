import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  ShieldAlert,
  Star,
  Sun,
  Tag,
  TestTube2,
  UserCog,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  LabNotificationRecord,
  LabPermissionKey,
  LabSectionId,
  LabWorkspaceData,
} from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { fetchLabWorkspace } from '../../services/labService';
import { useMedora } from '../../contexts/MedoraContext';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { ProtectedMediaImage } from '../shared/ProtectedMedia';
import { LabOverviewSection } from './LabOverviewSection';
import { LabPatientsSection } from './LabPatientsSection';
import { LabCatalogTestsSection } from './LabCatalogTestsSection';
import { LabOrdersSamplesSection } from './LabOrdersSamplesSection';
import { LabResultsSection } from './LabResultsSection';
import { LabBillingSection } from './LabBillingSection';
import { LabStaffSection } from './LabStaffSection';
import { LabInventorySection } from './LabInventorySection';
import { LabOffersSection } from './LabOffersSection';
import { LabReviewsSection } from './LabReviewsSection';
import { LabReportsSection } from './LabReportsSection';
import { LabCommunicationsSection } from './LabCommunicationsSection';
import { LabSettingsSection } from './LabSettingsSection';
import { EmployerSecretaryManagementSection } from '../secretary/EmployerSecretaryManagementSection';

interface LabPortalShellProps {
  firebaseUser: User;
  onBackToMedora: () => void;
  onSignOut: () => Promise<void>;
}

const SECTION_PERMISSIONS: Record<LabSectionId, LabPermissionKey[] | 'manager_only' | 'all'> = {
  overview: 'all',
  patients: ['reception', 'bookings', 'samples', 'enterResults', 'approveResults', 'billing'],
  catalog_tests: ['reception', 'enterResults', 'approveResults', 'inventory'],
  orders_samples: ['reception', 'bookings', 'samples', 'enterResults'],
  results: ['enterResults', 'approveResults'],
  billing: ['billing', 'reception'],
  staff: 'manager_only',
  secretaries: 'manager_only',
  inventory: ['inventory'],
  offers: ['reception', 'billing'],
  reviews: ['messaging'],
  reports: ['reports', 'billing'],
  communications: 'all',
  settings: 'manager_only',
};

export const LabPortalShell: React.FC<LabPortalShellProps> = ({
  firebaseUser,
  onBackToMedora,
  onSignOut,
}) => {
  const { language, toggleLanguage, theme, toggleTheme } = useMedora();
  const lt = labTranslations[language];
  const isAr = language === 'ar';

  const [workspace, setWorkspace] = useState<LabWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<LabSectionId>('overview');
  const [resultFocusOrderId, setResultFocusOrderId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadWorkspace = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchLabWorkspace(firebaseUser);
        setWorkspace(data);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'LAB_WORKSPACE_ERROR');
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

  useRealtimeNotifications<LabNotificationRecord>({
    collectionName: 'lab_notifications',
    uidField: 'labUid',
    uid: workspace?.labProfile?.uid || firebaseUser?.uid,
    enabled: Boolean(
      workspace &&
        workspace.actorRole === 'lab_manager' &&
        (workspace.labProfile?.uid || firebaseUser?.uid),
    ),
    onUpdate: (items) => {
      setWorkspace((prev) =>
        prev && prev.actorRole === 'lab_manager'
          ? { ...prev, notifications: items }
          : prev,
      );
    },
  });

  const hasPerm = useCallback(
    (perm: LabPermissionKey): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'lab_manager') return true;
      return workspace.permissions.includes(perm);
    },
    [workspace],
  );

  const canAccessSection = useCallback(
    (section: LabSectionId): boolean => {
      if (!workspace) return false;
      if (workspace.actorRole === 'lab_manager') return true;
      const rule = SECTION_PERMISSIONS[section];
      if (rule === 'all') return true;
      if (rule === 'manager_only') return false;
      return rule.some((p) => workspace.permissions.includes(p));
    },
    [workspace],
  );

  const badges = useMemo(() => {
    if (!workspace) return { orders: 0, results: 0, comms: 0 };
    const orders =
      workspace.bookings.filter((b) => b.status === 'pending').length +
      workspace.homeCollections.filter((h) => h.status === 'requested').length;
    const results = workspace.results.filter((r) => r.status === 'pending_approval').length;
    const comms =
      (workspace.actorRole === 'lab_manager'
        ? workspace.notifications.filter((n) => !n.isRead).length
        : 0) +
      workspace.conversations.reduce((s, c) => s + Number(c.unreadByLab || 0), 0) +
      (workspace.actorRole === 'lab_manager'
        ? workspace.adminMessages.filter((m) => m.senderRole === 'super_admin' && !m.isReadByLab).length
        : 0);
    return { orders, results, comms };
  }, [workspace]);

  const navItems = useMemo(
    () => [
      { id: 'overview' as LabSectionId, label: lt.nav.overview, icon: LayoutDashboard, badge: 0 },
      { id: 'patients' as LabSectionId, label: lt.nav.patients, icon: Users, badge: 0 },
      { id: 'catalog_tests' as LabSectionId, label: lt.nav.catalog_tests, icon: FlaskConical, badge: 0 },
      { id: 'orders_samples' as LabSectionId, label: lt.nav.orders_samples, icon: TestTube2, badge: badges.orders },
      { id: 'results' as LabSectionId, label: lt.nav.results, icon: ClipboardCheck, badge: badges.results },
      { id: 'billing' as LabSectionId, label: lt.nav.billing, icon: Receipt, badge: 0 },
      { id: 'inventory' as LabSectionId, label: lt.nav.inventory, icon: Package, badge: 0 },
      { id: 'offers' as LabSectionId, label: lt.nav.offers, icon: Tag, badge: 0 },
      { id: 'staff' as LabSectionId, label: lt.nav.staff, icon: UserCog, badge: 0 },
      { id: 'secretaries' as LabSectionId, label: lt.nav.secretaries, icon: UserPlus, badge: 0 },
      { id: 'reviews' as LabSectionId, label: lt.nav.reviews, icon: Star, badge: 0 },
      { id: 'reports' as LabSectionId, label: lt.nav.reports, icon: BarChart3, badge: 0 },
      { id: 'communications' as LabSectionId, label: lt.nav.communications, icon: Bell, badge: badges.comms },
      { id: 'settings' as LabSectionId, label: lt.nav.settings, icon: Settings, badge: 0 },
    ],
    [lt, badges],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020817] p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-[#0c3585] dark:text-blue-400" />
          <span className="text-sm font-semibold">
            {isAr ? 'جاري تحميل بوابة المختبر MEDORA LAB...' : 'Loading MEDORA LAB Portal...'}
          </span>
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
            {isAr ? 'تعذر فتح بوابة المختبر' : 'Unable to Access MEDORA LAB'}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {loadError === 'LAB_SUSPENDED'
              ? isAr
                ? 'تم إيقاف حساب المختبر مؤقتاً من قبل إدارة منصة MEDORA.'
                : 'This laboratory institution has been suspended by MEDORA administration.'
              : isAr
                ? 'حسابك غير مفعل أو بانتظار موافقة إدارة MEDORA.'
                : 'Laboratory access is pending approval or unavailable for this account.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onBackToMedora}
              className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-bold cursor-pointer"
            >
              {lt.backToMedora}
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[42px] rounded-xl bg-rose-600 text-white px-4 text-xs font-bold cursor-pointer"
            >
              {lt.signOut}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const renderSectionContent = () => {
    if (!canAccessSection(activeSection)) {
      return (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center space-y-2">
          <ShieldAlert className="h-9 w-9 text-amber-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.noPermissionTitle}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {lt.noPermissionBody}
          </p>
        </div>
      );
    }

    switch (activeSection) {
      case 'overview':
        return (
          <LabOverviewSection
            workspace={workspace}
            lang={language}
            onNavigate={(sec) => setActiveSection(sec)}
          />
        );
      case 'patients':
        return (
          <LabPatientsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEdit={hasPerm('reception')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'catalog_tests':
        return (
          <LabCatalogTestsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEdit={workspace.actorRole === 'lab_manager' || hasPerm('enterResults')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'orders_samples':
        return (
          <LabOrdersSamplesSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canReception={hasPerm('reception')}
            canSamples={hasPerm('samples')}
            canBookings={hasPerm('bookings')}
            canInventory={hasPerm('inventory')}
            onRefresh={() => loadWorkspace(true)}
            onOpenOrderResult={(orderId) => {
              setResultFocusOrderId(orderId);
              setActiveSection('results');
            }}
          />
        );
      case 'results':
        return (
          <LabResultsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEnter={hasPerm('enterResults')}
            canApprove={hasPerm('approveResults')}
            initialOrderId={resultFocusOrderId}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'billing':
        return (
          <LabBillingSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEdit={hasPerm('billing') || hasPerm('reception')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'staff':
        return (
          <LabStaffSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'secretaries':
        return (
          <EmployerSecretaryManagementSection
            firebaseUser={firebaseUser}
            employerType="lab"
            language={language}
          />
        );
      case 'inventory':
        return (
          <LabInventorySection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEdit={hasPerm('inventory')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'offers':
        return (
          <LabOffersSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canEdit={workspace.actorRole === 'lab_manager' || hasPerm('billing')}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'reviews':
        return (
          <LabReviewsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canReply={hasPerm('messaging') || workspace.actorRole === 'lab_manager'}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'reports':
        return <LabReportsSection workspace={workspace} lang={language} />;
      case 'communications':
        return (
          <LabCommunicationsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            canMessage={hasPerm('messaging')}
            canAccessSection={canAccessSection}
            onNavigateSection={setActiveSection}
            onRefresh={() => loadWorkspace(true)}
          />
        );
      case 'settings':
        return (
          <LabSettingsSection
            firebaseUser={firebaseUser}
            workspace={workspace}
            lang={language}
            onRefresh={() => loadWorkspace(true)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020817] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#040d21]/95 backdrop-blur px-4 py-3">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden min-h-[40px] min-w-[40px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#0c3585] text-white overflow-hidden flex items-center justify-center shrink-0">
              {workspace.labProfile.managerAvatarUrl ? (
                <ProtectedMediaImage
                  firebaseUser={firebaseUser}
                  url={workspace.labProfile.managerAvatarUrl}
                  alt={workspace.labProfile.labNameAr}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FlaskConical className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                  {isAr
                    ? workspace.labProfile.labNameAr
                    : workspace.labProfile.labNameEn || workspace.labProfile.labNameAr}
                </h1>
                <span className="hidden sm:inline-block rounded-md bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 text-[10px] font-bold text-[#0c3585] dark:text-blue-300 shrink-0">
                  {workspace.actorRole === 'lab_manager' ? lt.managerBadge : lt.staffBadge}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {lt.portalTitle} · {workspace.actorName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void loadWorkspace(true)}
              disabled={refreshing}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:border-[#0c3585]"
              title={lt.refreshWorkspace}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{lt.refreshWorkspace}</span>
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 text-xs font-bold font-latin cursor-pointer"
            >
              {isAr ? 'EN' : 'عربي'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="min-h-[38px] min-w-[38px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer"
              aria-label="Theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onBackToMedora}
              className="hidden sm:inline-flex min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold items-center gap-1 cursor-pointer"
            >
              <BackIcon className="h-3.5 w-3.5" />
              <span>{lt.backToMedora}</span>
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[38px] rounded-xl border border-rose-200 dark:border-rose-500/30 px-3 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{lt.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto flex gap-6 px-4 py-5">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 shrink-0">
          <nav className="sticky top-20 space-y-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-2.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const allowed = canAccessSection(item.id);
              if (!allowed) return null;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full min-h-[42px] rounded-xl px-3 text-xs font-bold flex items-center justify-between gap-2 transition cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span
                      className={`font-latin tabular-nums rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        active ? 'bg-white/20 text-white' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-slate-950/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 w-72 max-w-[85vw] h-full bg-white dark:bg-[#07122a] border-e border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-extrabold text-[#0c3585] dark:text-blue-400">
                  {lt.portalTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="space-y-1 flex-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  if (!canAccessSection(item.id)) return null;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full min-h-[42px] rounded-xl px-3 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer ${
                        active
                          ? 'bg-[#0c3585] text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge > 0 && (
                        <span className="font-latin tabular-nums rounded-md bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onBackToMedora();
                }}
                className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <BackIcon className="h-4 w-4" />
                <span>{lt.backToMedora}</span>
              </button>
            </div>
          </div>
        )}

        {/* Section Content */}
        <main className="flex-1 min-w-0 pb-10">{renderSectionContent()}</main>
      </div>
    </div>
  );
};
