import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  ClipboardCheck,
  FlaskConical,
  Globe,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  MessageSquareWarning,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../constants/brand';
import { useMedora } from '../contexts/MedoraContext';
import { useRealtimeNotifications } from '../hooks/useRealtimeNotifications';
import {
  deleteAdminAd,
  fetchAdminDashboardSummary,
  updateAdminAd,
} from '../services/medoraFirestore';
import { fetchRoleInAppNotifications } from '../services/notificationService';
import type { RoleInAppNotificationRecord } from '../types/notifications';
import type { PublicDoctorCard } from '../types/doctor';
import type {
  AdminCollectionError,
  AdminMessageRecord,
  AdminRoleRecord,
  AuditLogRecord,
  InstitutionRecord,
  RegistrationRequest,
  SuperAdminServerStatus,
  UserAccount,
} from '../types/medora';
import type {
  DoctorReviewRecord,
  LabDirectoryCard,
  MedoraAdRecord,
  PatientFeedbackRecord,
} from '../types/patient';
import { AdminLabsSection } from './admin/AdminLabsSection';
import { AdminPharmaciesSection } from './admin/AdminPharmaciesSection';
import { AdminWholesalersSection } from './admin/AdminWholesalersSection';
import { AdminHaneenSection } from './admin/AdminHaneenSection';
import { AdminNotificationsSection } from './admin/AdminNotificationsSection';
import { AdminCommerceAndReceiptsSection } from './admin/AdminCommerceAndReceiptsSection';
import { MedoraMessagingPanel } from './shared/MedoraMessagingPanel';
import { IraqiPhoneVerificationCard } from './shared/IraqiPhoneVerificationCard';
import { NotificationChannelCard } from './shared/NotificationChannelCard';
import {
  ComposeMessageModal,
  InstitutionDetailModal,
  MessageDetailModal,
  RequestReviewModal,
} from './admin/AdminModals';
import {
  AdEditorModal,
  FeedbackDetailModal,
  ReviewModerationModal,
} from './admin/AdminPatientModals';
import {
  AdminAdsSection,
  AdminFeedbackSection,
  AdminReviewsSection,
} from './admin/AdminPatientModerationSections';
import {
  AdminAuditLogsSection,
  AdminInstitutionsSection,
  AdminMessagesSection,
  AdminOverviewSection,
  AdminPermissionsSection,
  AdminRequestsSection,
  AdminSettingsSection,
  AdminUsersSection,
  type AdminSectionId,
} from './admin/AdminSections';

interface SuperAdminShellProps {
  onExitAdminRoute: () => void;
}

const NAV_ITEMS: { id: AdminSectionId; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'messages', icon: Mail },
  { id: 'network_messaging', icon: MessageSquare },
  { id: 'notifications_center', icon: Smartphone },
  { id: 'commerce_receipts', icon: Receipt },
  { id: 'institutions', icon: Building2 },
  { id: 'labs', icon: FlaskConical },
  { id: 'pharmacies', icon: Pill },
  { id: 'wholesalers', icon: Warehouse },
  { id: 'haneen_admin', icon: Sparkles },
  { id: 'requests', icon: ClipboardCheck },
  { id: 'ads', icon: Megaphone },
  { id: 'reviews', icon: Star },
  { id: 'feedback', icon: MessageSquareWarning },
  { id: 'users', icon: Users },
  { id: 'permissions', icon: Shield },
  { id: 'audit_logs', icon: Activity },
  { id: 'settings', icon: Settings },
];

export function SuperAdminShell({ onExitAdminRoute }: SuperAdminShellProps) {
  const {
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    t,
    firebaseUser,
    isSuperAdmin,
    adminCheckDone,
    adminVerificationMeta,
    logout,
  } = useMedora();

  const [activeSection, setActiveSection] = useState<AdminSectionId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<AdminCollectionError[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [institutions, setInstitutions] = useState<InstitutionRecord[]>([]);
  const [adminRoles, setAdminRoles] = useState<AdminRoleRecord[]>([]);
  const [adminMessages, setAdminMessages] = useState<AdminMessageRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [ads, setAds] = useState<MedoraAdRecord[]>([]);
  const [reviews, setReviews] = useState<DoctorReviewRecord[]>([]);
  const [feedback, setFeedback] = useState<PatientFeedbackRecord[]>([]);
  const [approvedDoctors, setApprovedDoctors] = useState<PublicDoctorCard[]>([]);
  const [approvedLabs, setApprovedLabs] = useState<LabDirectoryCard[]>([]);
  const [serverStatus, setServerStatus] = useState<SuperAdminServerStatus>({
    serverAdminSdkActive: false,
    hasAllowlist: false,
    customClaimsActive: false,
  });

  const [selectedRequest, setSelectedRequest] =
    useState<RegistrationRequest | null>(null);
  const [selectedInstitution, setSelectedInstitution] =
    useState<InstitutionRecord | null>(null);
  const [selectedMessage, setSelectedMessage] =
    useState<AdminMessageRecord | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [adModalState, setAdModalState] = useState<{
    open: boolean;
    editingAd: MedoraAdRecord | null;
  }>({ open: false, editingAd: null });
  const [selectedReview, setSelectedReview] =
    useState<DoctorReviewRecord | null>(null);
  const [selectedFeedback, setSelectedFeedback] =
    useState<PatientFeedbackRecord | null>(null);
  const [adminInbox, setAdminInbox] = useState<RoleInAppNotificationRecord[]>([]);

  const refreshAllData = useCallback(async () => {
    if (!adminCheckDone || !isSuperAdmin || !firebaseUser) return;
    setLoadingData(true);
    setLoadError(null);
    setPartialErrors([]);
    try {
      const [summary, inboxRes] = await Promise.all([
        fetchAdminDashboardSummary(firebaseUser),
        fetchRoleInAppNotifications(firebaseUser, 'super_admin').catch(() => null),
      ]);
      setUsers(summary.users);
      setRequests(summary.requests);
      setInstitutions(summary.institutions);
      setAdminRoles(summary.adminRoles);
      setAdminMessages(summary.adminMessages);
      setAuditLogs(summary.auditLogs);
      setAds(summary.ads);
      setReviews(summary.reviews);
      setFeedback(summary.feedback);
      setApprovedDoctors(summary.approvedDoctors);
      setApprovedLabs(summary.approvedLabs);
      setPartialErrors(summary.partialErrors);
      setServerStatus(summary.serverStatus);
      if (inboxRes) {
        setAdminInbox(inboxRes.notifications);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setLoadingData(false);
    }
  }, [adminCheckDone, isSuperAdmin, firebaseUser, t.admin.errorLoading]);

  useEffect(() => {
    void refreshAllData();
  }, [refreshAllData]);

  useRealtimeNotifications<RoleInAppNotificationRecord>({
    collectionName: 'admin_notifications',
    uidField: 'adminUid',
    uid: firebaseUser?.uid,
    enabled: Boolean(adminCheckDone && isSuperAdmin && firebaseUser?.uid),
    onUpdate: (items) => {
      setAdminInbox(items);
    },
  });

  if (!adminCheckDone) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-[#030712] dark:text-slate-300">
        {t.common.loading}
      </div>
    );
  }

  // Strict server-gated denial for unauthenticated or non-admin users
  if (!firebaseUser || !isSuperAdmin) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 dark:bg-[#030712]">
        <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xl dark:border-rose-900/50 dark:bg-[#07122a]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            <ShieldAlert className="h-7 w-7" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
            {t.admin.accessDeniedTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {t.admin.accessDeniedBody}
          </p>
          {adminVerificationMeta?.reason && (
            <p
              className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-latin text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
              dir="ltr"
            >
              Code: {adminVerificationMeta.reason}
            </p>
          )}
          <button
            type="button"
            onClick={onExitAdminRoute}
            className="medora-gold-button mt-6 min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-bold text-[#040917] cursor-pointer"
          >
            {t.admin.returnHome}
          </button>
        </div>
      </div>
    );
  }

  const unreadMessagesCount = adminMessages.filter(
    (m) => !m.isRead || m.status === 'new',
  ).length;
  const pendingRequestsCount = requests.filter(
    (r) => r.status === 'Submitted' || r.status === 'Under Review',
  ).length;
  const pendingReviewsCount = reviews.filter(
    (r) => r.status === 'pending',
  ).length;
  const newFeedbackCount = feedback.filter(
    (f) => f.status === 'new',
  ).length;
  const unreadAdminNotifsCount = adminInbox.filter((n) => !n.isRead).length;

  const badgeForSection = (id: AdminSectionId): number | null => {
    if (id === 'messages' && unreadMessagesCount > 0) return unreadMessagesCount;
    if (id === 'notifications_center' && unreadAdminNotifsCount > 0) return unreadAdminNotifsCount;
    if (id === 'requests' && pendingRequestsCount > 0) return pendingRequestsCount;
    if (id === 'reviews' && pendingReviewsCount > 0) return pendingReviewsCount;
    if (id === 'feedback' && newFeedbackCount > 0) return newFeedbackCount;
    return null;
  };

  const handleSelectNav = (id: AdminSectionId) => {
    setActiveSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-dvh w-full bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden shrink-0 flex-col justify-between border-e border-slate-200 bg-white py-5 transition-all duration-200 dark:border-slate-800 dark:bg-[#060f23] lg:flex ${
          sidebarCollapsed ? 'w-[84px] px-3' : 'w-[272px] px-4'
        }`}
      >
        <div>
          <div
            className={`flex items-center border-b border-slate-200 pb-4 dark:border-slate-800 ${
              sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'
            }`}
          >
            {!sidebarCollapsed && (
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={MEDORA_LOGO_URL}
                  alt="MEDORA"
                  className="medora-logo-adaptive h-9 w-auto shrink-0 select-none"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {t.admin.title}
                  </p>
                  <p className="font-latin text-[10px] tracking-wider text-[#b68023] dark:text-[#f4d378]">
                    SUPER ADMIN
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label={
                sidebarCollapsed
                  ? t.admin.expandSidebar
                  : t.admin.collapseSidebar
              }
              title={
                sidebarCollapsed
                  ? t.admin.expandSidebar
                  : t.admin.collapseSidebar
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-[#d9a43b] hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          <nav className="mt-5 space-y-1.5" aria-label={t.admin.title}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              const count = badgeForSection(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  title={t.admin.nav[item.id]}
                  className={`flex min-h-[42px] w-full items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'
                  } ${
                    active
                      ? 'bg-[#0c3585] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{t.admin.nav[item.id]}</span>
                    )}
                  </span>
                  {!sidebarCollapsed && count !== null && (
                    <span
                      className={`font-latin rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-[#d9a43b]/20 text-[#9a6b16] dark:text-[#f4d378]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
          {!sidebarCollapsed && (
            <p
              className="truncate font-latin text-xs text-slate-500 dark:text-slate-400"
              dir="ltr"
            >
              {firebaseUser.email}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              void logout().then(onExitAdminRoute);
            }}
            title={t.common.signOut}
            className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {!sidebarCollapsed && <span>{t.common.signOut}</span>}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 flex bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-[280px] flex-col justify-between bg-white px-4 py-5 shadow-2xl dark:bg-[#060f23]"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <img
                    src={MEDORA_LOGO_URL}
                    alt="MEDORA"
                    className="medora-logo-adaptive h-8 w-auto select-none"
                  />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {t.admin.title}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  const count = badgeForSection(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectNav(item.id)}
                      className={`flex min-h-[42px] w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                        active
                          ? 'bg-[#0c3585] text-white'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{t.admin.nav[item.id]}</span>
                      </span>
                      {count !== null && (
                        <span className="font-latin rounded px-1.5 py-0.5 text-[11px] font-bold">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="truncate font-latin text-xs text-slate-500" dir="ltr">
                {firebaseUser.email}
              </p>
              <button
                type="button"
                onClick={() => {
                  void logout().then(onExitAdminRoute);
                }}
                className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t.common.signOut}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-[#060f23] sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-200 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[#b68023] dark:text-[#f4d378]">
                <span>{t.admin.verifiedBadge}</span>
                {serverStatus.customClaimsActive && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t.admin.claimsActiveBadge}</span>
                  </>
                )}
              </div>
              <h1 className="truncate text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                {t.admin.nav[activeSection]}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 dark:text-slate-400 sm:block">
                {t.admin.sectionDescriptions[activeSection]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loadingData}
              onClick={() => void refreshAllData()}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#d9a43b] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{t.admin.refreshData}</span>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{language === 'ar' ? t.common.english : t.common.arabic}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? t.common.lightMode : t.common.darkMode}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5 text-[#f4d378]" aria-hidden="true" />
              ) : (
                <Moon className="h-3.5 w-3.5 text-[#0c3585]" aria-hidden="true" />
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 sm:p-8">
          {loadError && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
            >
              {loadError}
            </div>
          )}

          {partialErrors.length > 0 && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <p className="font-semibold">
                {language === 'ar'
                  ? 'تم تحميل لوحة الإدارة مع تعذر جلب بعض المجموعات:'
                  : 'Admin dashboard loaded with partial collection errors:'}
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 font-latin" dir="ltr">
                {partialErrors.map((errItem) => (
                  <li key={`${errItem.collection}-${errItem.code}`}>
                    {errItem.collection}: {errItem.code}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loadingData &&
          users.length === 0 &&
          requests.length === 0 &&
          institutions.length === 0 &&
          adminMessages.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
              {t.admin.loadingData}
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <AdminOverviewSection
                  t={t}
                  language={language}
                  messages={adminMessages}
                  institutions={institutions}
                  requests={requests}
                  totalUsers={users.length}
                  totalAds={ads.length}
                  publishedAds={
                    ads.filter((a) => (a.status ? a.status === 'published' : a.active === true))
                      .length
                  }
                  pendingReviews={pendingReviewsCount}
                  openFeedback={
                    feedback.filter((f) => f.status === 'new' || f.status === 'in_review')
                      .length
                  }
                  onNavigate={setActiveSection}
                  onSelectMessage={setSelectedMessage}
                  onSelectInstitution={setSelectedInstitution}
                  onComposeMessage={() => setComposeOpen(true)}
                />
              )}

              {activeSection === 'messages' && (
                <AdminMessagesSection
                  t={t}
                  language={language}
                  messages={adminMessages}
                  onSelectMessage={setSelectedMessage}
                  onComposeMessage={() => setComposeOpen(true)}
                />
              )}

              {activeSection === 'network_messaging' && (
                <MedoraMessagingPanel
                  firebaseUser={firebaseUser}
                  lang={language}
                  portalRole="super_admin"
                  isAdminMonitor
                />
              )}

              {activeSection === 'notifications_center' && (
                <AdminNotificationsSection
                  firebaseUser={firebaseUser}
                  language={language}
                  adminInbox={adminInbox}
                  onUpdateAdminInbox={setAdminInbox}
                  onNavigateSection={setActiveSection}
                />
              )}

              {activeSection === 'commerce_receipts' && (
                <AdminCommerceAndReceiptsSection
                  firebaseUser={firebaseUser}
                  language={language}
                />
              )}

              {activeSection === 'institutions' && (
                <AdminInstitutionsSection
                  t={t}
                  institutions={institutions}
                  onSelectInstitution={setSelectedInstitution}
                />
              )}

              {activeSection === 'labs' && (
                <AdminLabsSection firebaseUser={firebaseUser} language={language} />
              )}

              {activeSection === 'pharmacies' && (
                <AdminPharmaciesSection firebaseUser={firebaseUser} language={language} />
              )}

              {activeSection === 'wholesalers' && (
                <AdminWholesalersSection firebaseUser={firebaseUser} language={language} />
              )}

              {activeSection === 'haneen_admin' && (
                <AdminHaneenSection firebaseUser={firebaseUser} language={language} />
              )}

              {activeSection === 'requests' && (
                <AdminRequestsSection
                  t={t}
                  language={language}
                  requests={requests}
                  onSelectRequest={setSelectedRequest}
                />
              )}

              {activeSection === 'ads' && (
                <AdminAdsSection
                  firebaseUser={firebaseUser}
                  t={t}
                  language={language}
                  ads={ads}
                  serverStatus={serverStatus}
                  onCreateAd={() => setAdModalState({ open: true, editingAd: null })}
                  onEditAd={(ad) => setAdModalState({ open: true, editingAd: ad })}
                  onTogglePauseAd={async (ad) => {
                    const isCurrentlyPublished =
                      (ad.status ? ad.status === 'published' : ad.active === true);
                    const nextStatus = isCurrentlyPublished ? 'paused' : 'published';
                    await updateAdminAd(firebaseUser, ad.adId, {
                      status: nextStatus,
                      active: nextStatus === 'published',
                    });
                    await refreshAllData();
                  }}
                  onApprovePublishAd={async (ad) => {
                    await updateAdminAd(firebaseUser, ad.adId, {
                      approvedByAdmin: true,
                      status: 'published',
                      active: true,
                    });
                    await refreshAllData();
                  }}
                  onDeleteAd={async (ad) => {
                    await deleteAdminAd(firebaseUser, ad.adId);
                    await refreshAllData();
                  }}
                />
              )}

              {activeSection === 'reviews' && (
                <AdminReviewsSection
                  t={t}
                  language={language}
                  reviews={reviews}
                  onSelectReview={setSelectedReview}
                />
              )}

              {activeSection === 'feedback' && (
                <AdminFeedbackSection
                  t={t}
                  language={language}
                  feedback={feedback}
                  onSelectFeedback={setSelectedFeedback}
                />
              )}

              {activeSection === 'users' && (
                <AdminUsersSection t={t} language={language} users={users} />
              )}

              {activeSection === 'permissions' && (
                <AdminPermissionsSection
                  t={t}
                  language={language}
                  adminRoles={adminRoles}
                />
              )}

              {activeSection === 'audit_logs' && (
                <AdminAuditLogsSection
                  t={t}
                  language={language}
                  auditLogs={auditLogs}
                />
              )}

              {activeSection === 'settings' && (
                <div className="space-y-6">
                  <AdminSettingsSection t={t} serverStatus={serverStatus} />
                  {firebaseUser && (
                    <div className="space-y-4">
                      <IraqiPhoneVerificationCard
                        firebaseUser={firebaseUser}
                        language={language}
                        currentPhone=""
                        compact
                      />
                      <NotificationChannelCard
                        firebaseUser={firebaseUser}
                        role="super_admin"
                        language={language}
                        compact
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Interactive Administrative Modals */}
      {selectedRequest && (
        <RequestReviewModal
          firebaseUser={firebaseUser}
          request={selectedRequest}
          t={t}
          language={language}
          onClose={() => setSelectedRequest(null)}
          onDecisionApplied={refreshAllData}
        />
      )}

      {selectedInstitution && (
        <InstitutionDetailModal
          firebaseUser={firebaseUser}
          institution={selectedInstitution}
          t={t}
          language={language}
          onClose={() => setSelectedInstitution(null)}
          onUpdated={refreshAllData}
        />
      )}

      {selectedMessage && (
        <MessageDetailModal
          firebaseUser={firebaseUser}
          message={selectedMessage}
          t={t}
          language={language}
          onClose={() => setSelectedMessage(null)}
          onUpdated={refreshAllData}
        />
      )}

      {composeOpen && (
        <ComposeMessageModal
          firebaseUser={firebaseUser}
          t={t}
          onClose={() => setComposeOpen(false)}
          onCreated={refreshAllData}
        />
      )}

      {adModalState.open && (
        <AdEditorModal
          firebaseUser={firebaseUser}
          t={t}
          language={language}
          approvedDoctors={approvedDoctors}
          approvedLabs={approvedLabs}
          editingAd={adModalState.editingAd}
          serverStatus={serverStatus}
          onClose={() => setAdModalState({ open: false, editingAd: null })}
          onSaved={refreshAllData}
        />
      )}

      {selectedReview && (
        <ReviewModerationModal
          firebaseUser={firebaseUser}
          t={t}
          language={language}
          review={selectedReview}
          onClose={() => setSelectedReview(null)}
          onSaved={refreshAllData}
        />
      )}

      {selectedFeedback && (
        <FeedbackDetailModal
          firebaseUser={firebaseUser}
          t={t}
          language={language}
          item={selectedFeedback}
          onClose={() => setSelectedFeedback(null)}
          onSaved={refreshAllData}
        />
      )}
    </div>
  );
}
