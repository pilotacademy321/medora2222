import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Pill,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../../constants/brand';
import { useMedora } from '../../contexts/MedoraContext';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import { fetchDoctorWorkspace } from '../../services/doctorService';
import { fetchRoleInAppNotifications } from '../../services/notificationService';
import type { DoctorSectionId, DoctorWorkspaceData } from '../../types/doctor';
import type { RoleInAppNotificationRecord } from '../../types/notifications';
import {
  canAccessDoctorSection,
  resolveSafeDoctorSection,
} from '../../utils/doctorAccess';
import { DoctorAppointmentsSection } from './DoctorAppointmentsSection';
import { DoctorClinicStaffSection } from './DoctorClinicStaffSection';
import { DoctorDiagnosticsSection } from './DoctorDiagnosticsSection';
import { DoctorMessagesSection } from './DoctorMessagesSection';
import { DoctorOverviewSection } from './DoctorOverviewSection';
import { DoctorPatientsSection } from './DoctorPatientsSection';
import { DoctorPharmacyOrdersSection } from './DoctorPharmacyOrdersSection';
import { DoctorPrescriptionsSection } from './DoctorPrescriptionsSection';
import { DoctorReportsSection } from './DoctorReportsSection';
import { DoctorSettingsSection } from './DoctorSettingsSection';

interface DoctorPortalShellProps {
  onExitPortal: () => void;
  onOpenStatus: () => void;
  onOpenDirectory: () => void;
}

interface NavSpec {
  id: DoctorSectionId;
  icon: typeof LayoutDashboard;
  doctorOnly?: boolean;
}

const NAV_ITEMS: NavSpec[] = [
  { id: 'overview', icon: LayoutDashboard },
  { id: 'appointments', icon: CalendarClock },
  { id: 'patients', icon: Users },
  { id: 'prescriptions', icon: FileText, doctorOnly: true },
  { id: 'diagnostics', icon: FlaskConical },
  { id: 'pharmacy_orders', icon: Pill, doctorOnly: true },
  { id: 'messages', icon: MessageSquare },
  { id: 'clinic_staff', icon: Building2, doctorOnly: true },
  { id: 'reports', icon: BarChart3 },
  { id: 'settings', icon: Settings },
];

export function DoctorPortalShell({
  onExitPortal,
  onOpenStatus,
  onOpenDirectory,
}: DoctorPortalShellProps) {
  const {
    firebaseUser,
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    logout,
  } = useMedora();
  const dc = DOCTOR_TRANSLATIONS[language];

  const [section, setSection] = useState<DoctorSectionId>('overview');
  const [autoOpenAddVisit, setAutoOpenAddVisit] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [workspace, setWorkspace] = useState<DoctorWorkspaceData | null>(null);
  const [doctorInApp, setDoctorInApp] = useState<RoleInAppNotificationRecord[]>([]);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'profile' | 'notifications' | 'appearance' | 'security' | undefined
  >(undefined);
  const [accessDeniedNotice, setAccessDeniedNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!firebaseUser) return;
    setErrorCode(null);
    try {
      const data = await fetchDoctorWorkspace(firebaseUser);
      setWorkspace(data);
      if (data.actorRole === 'doctor') {
        const res = await fetchRoleInAppNotifications(firebaseUser, 'doctor').catch(() => null);
        if (res) setDoctorInApp(res.notifications);
      } else {
        setDoctorInApp([]);
      }
    } catch (err) {
      setErrorCode(err instanceof Error ? err.message : 'DOCTOR_WORKSPACE_FAILED');
    }
  }, [firebaseUser]);

  useEffect(() => {
    setLoading(true);
    loadWorkspace().finally(() => setLoading(false));
  }, [loadWorkspace]);

  useRealtimeNotifications<RoleInAppNotificationRecord>({
    collectionName: 'doctor_notifications',
    uidField: 'doctorUid',
    uid: workspace?.doctorProfile?.uid || firebaseUser?.uid,
    enabled: Boolean(
      workspace &&
        workspace.actorRole === 'doctor' &&
        (workspace.doctorProfile?.uid || firebaseUser?.uid),
    ),
    onUpdate: (items) => {
      setDoctorInApp(items);
    },
  });

  const canAccessSection = useCallback(
    (target: DoctorSectionId): boolean => canAccessDoctorSection(workspace, target),
    [workspace],
  );

  const navigateToSection = useCallback(
    (target: DoctorSectionId) => {
      if (!workspace) return;
      if (!canAccessDoctorSection(workspace, target)) {
        const safeSection = resolveSafeDoctorSection(workspace, target, section);
        setSection(safeSection);
        setAccessDeniedNotice(
          language === 'ar'
            ? 'لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم.'
            : 'You do not have permission to access this section.',
        );
        return;
      }
      setAccessDeniedNotice(null);
      setSection(target);
    },
    [workspace, section, language],
  );

  useEffect(() => {
    if (workspace && !canAccessDoctorSection(workspace, section)) {
      setSection(resolveSafeDoctorSection(workspace, section, 'overview'));
    }
  }, [workspace, section]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadWorkspace();
    setRefreshing(false);
  };

  const BackArrow = language === 'ar' ? ArrowRight : ArrowLeft;
  const CollapseIcon =
    language === 'ar'
      ? sidebarCollapsed
        ? ChevronLeft
        : ChevronRight
      : sidebarCollapsed
        ? ChevronRight
        : ChevronLeft;

  if (!firebaseUser || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-[#030712] dark:text-slate-300">
        {dc.loadingWorkspace}
      </div>
    );
  }

  if (errorCode || !workspace) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-[#030712]">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-[#07122a]">
          <img
            src={MEDORA_LOGO_URL}
            alt="MEDORA"
            className="medora-logo-adaptive mx-auto h-14 w-auto object-contain"
          />
          <h1 className="mt-5 text-lg font-bold text-slate-900 dark:text-white">
            {dc.notApprovedTitle}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {dc.notApprovedBody}
          </p>
          {errorCode && (
            <p className="mt-3 font-latin text-xs text-rose-600 dark:text-rose-400">
              {errorCode}
            </p>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={onOpenStatus}
              className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
            >
              {dc.checkStatusBtn}
            </button>
            <button
              type="button"
              onClick={onExitPortal}
              className="min-h-[42px] rounded-xl border border-slate-300 px-5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {dc.backToHome}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visibleNavItems = NAV_ITEMS.filter((item) => canAccessSection(item.id));

  const unreadCount = workspace.conversations.reduce(
    (s, c) => s + (c.unreadByDoctor || 0),
    0,
  );
  const doctorUnreadCount =
    workspace.actorRole === 'doctor'
      ? doctorInApp.filter((n) => !n.isRead).length
      : 0;

  return (
    <div className="flex min-h-dvh bg-slate-50 text-slate-900 dark:bg-[#030712] dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`medora-no-print hidden shrink-0 flex-col justify-between border-e border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-[#061028] lg:flex ${
          sidebarCollapsed ? 'w-[84px]' : 'w-[272px]'
        }`}
      >
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={MEDORA_LOGO_URL}
                  alt="MEDORA"
                  className="medora-logo-adaptive h-9 w-auto shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="font-latin truncate text-sm font-bold tracking-wider text-[#0c3585] dark:text-[#f4d378]">
                    {dc.brandTitle}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {workspace.doctorProfile.clinicName}
                  </p>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setSidebarCollapsed((c) => !c)}
              aria-label="Toggle sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <CollapseIcon className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-1 p-3">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToSection(item.id)}
                  title={dc.nav[item.id]}
                  className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {!sidebarCollapsed && (
                      <span className="truncate">{dc.nav[item.id]}</span>
                    )}
                  </span>
                  {!sidebarCollapsed && item.id === 'messages' && unreadCount > 0 && (
                    <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                  {!sidebarCollapsed &&
                    item.id === 'settings' &&
                    workspace.actorRole === 'doctor' &&
                    doctorUnreadCount > 0 && (
                      <span
                        title={
                          language === 'ar'
                            ? 'إشعارات غير مقروءة'
                            : 'Unread notifications'
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#0c3585] dark:bg-[#d9a43b]/20 dark:text-[#f4d378] tabular-nums"
                      >
                        <Bell className="h-3 w-3" aria-hidden="true" />
                        <span>{doctorUnreadCount}</span>
                      </span>
                    )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
          <button
            type="button"
            onClick={onExitPortal}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900 cursor-pointer"
          >
            <BackArrow className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">{dc.backToHome}</span>}
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-xl px-3.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && (
              <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="medora-no-print fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-72 flex-col justify-between bg-white p-4 dark:bg-[#061028]"
          >
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                <span className="font-latin text-sm font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {dc.brandTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-slate-500 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        navigateToSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl px-3.5 text-xs font-bold cursor-pointer ${
                        active
                          ? 'bg-[#0c3585] text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{dc.nav[item.id]}</span>
                      </span>
                      {item.id === 'messages' && unreadCount > 0 && (
                        <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
                          {unreadCount}
                        </span>
                      )}
                      {item.id === 'settings' &&
                        workspace.actorRole === 'doctor' &&
                        doctorUnreadCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-100 px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#0c3585] dark:bg-[#d9a43b]/20 dark:text-[#f4d378] tabular-nums">
                            <Bell className="h-3 w-3" aria-hidden="true" />
                            <span>{doctorUnreadCount}</span>
                          </span>
                        )}
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={onExitPortal}
              className="flex min-h-[40px] w-full items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
            >
              <BackArrow className="h-4 w-4" />
              <span>{dc.backToHome}</span>
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="medora-no-print sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-slate-800 dark:bg-[#061028]/95 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 lg:hidden cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            {workspace.doctorProfile.avatarUrl ? (
              <img
                src={workspace.doctorProfile.avatarUrl}
                alt={workspace.doctorProfile.fullName}
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full border border-[#d9a43b]/60 object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d9a43b]/50 bg-[#0c3585]/10 text-xs font-bold text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                {(workspace.doctorProfile.fullName || 'DR').trim().slice(0, 2)}
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {dc.nav[section]}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dc.overview.welcomePrefix} {workspace.doctorProfile.fullName} ·{' '}
                {workspace.doctorProfile.specialty}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {workspace.actorRole === 'doctor' && (
              <button
                type="button"
                onClick={() => {
                  setSettingsInitialTab('notifications');
                  navigateToSection('settings');
                }}
                aria-label={language === 'ar' ? 'الإشعارات' : 'Notifications'}
                title={language === 'ar' ? 'إشعارات العيادة' : 'Clinic Notifications'}
                className="relative flex h-[38px] min-w-[38px] items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
              >
                <Bell className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                {doctorUnreadCount > 0 && (
                  <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-extrabold text-[#040917] tabular-nums">
                    {doctorUnreadCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">{dc.refreshBtn}</span>
            </button>

            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 font-latin text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              {language === 'ar' ? 'EN' : 'AR'}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="flex h-[38px] w-[38px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-[#f4d378]" />
              ) : (
                <Moon className="h-4 w-4 text-[#0c3585]" />
              )}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">
          {accessDeniedNotice && (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{accessDeniedNotice}</span>
              </span>
              <button
                type="button"
                onClick={() => setAccessDeniedNotice(null)}
                className="text-xs underline cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Dismiss'}
              </button>
            </div>
          )}

          {!canAccessSection(section) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
              <ShieldAlert className="mx-auto h-9 w-9 text-amber-500" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {language === 'ar' ? 'غير مصرح بالوصول لهذا القسم' : 'Section Access Restricted'}
              </h3>
              <p className="mx-auto max-w-md text-xs text-slate-500 dark:text-slate-400">
                {language === 'ar'
                  ? 'حسابك لا يملك الصلاحية المطلوبة لفتح هذا القسم. تم تحويلك إلى قسم مسموح.'
                  : 'Your account lacks the required permission for this section.'}
              </p>
              <button
                type="button"
                onClick={() => navigateToSection('overview')}
                className="medora-gold-button inline-flex min-h-[38px] items-center rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {language === 'ar' ? 'العودة إلى النظرة العامة' : 'Return to Overview'}
              </button>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <DoctorOverviewSection
                  workspace={workspace}
                  language={language}
                  onNavigate={navigateToSection}
                  onOpenAddVisit={() => {
                    if (canAccessSection('patients')) {
                      setAutoOpenAddVisit(true);
                      navigateToSection('patients');
                    } else {
                      navigateToSection('patients');
                    }
                  }}
                />
              )}
              {section === 'appointments' && (
                <DoctorAppointmentsSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                />
              )}
              {section === 'patients' && (
                <DoctorPatientsSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                  initialOpenVisit={autoOpenAddVisit}
                  onConsumeOpenVisit={() => setAutoOpenAddVisit(false)}
                />
              )}
              {section === 'prescriptions' && (
                <DoctorPrescriptionsSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                />
              )}
              {section === 'diagnostics' && (
                <DoctorDiagnosticsSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                />
              )}
              {section === 'pharmacy_orders' && (
                <DoctorPharmacyOrdersSection
                  firebaseUser={firebaseUser}
                  doctorUid={workspace.doctorProfile.uid}
                  defaultClinicAddress={workspace.doctorProfile.workAddress}
                  language={language}
                />
              )}
              {section === 'messages' && (
                <DoctorMessagesSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                />
              )}
              {section === 'clinic_staff' && (
                <DoctorClinicStaffSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                />
              )}
              {section === 'reports' && (
                <DoctorReportsSection workspace={workspace} language={language} />
              )}
              {section === 'settings' && (
                <DoctorSettingsSection
                  firebaseUser={firebaseUser}
                  workspace={workspace}
                  language={language}
                  onRefreshWorkspace={loadWorkspace}
                  onNavigateSection={navigateToSection}
                  externalInApp={doctorInApp}
                  onUpdateExternalInApp={setDoctorInApp}
                  initialTab={settingsInitialTab}
                  onConsumeInitialTab={() => setSettingsInitialTab(undefined)}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
