import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
  CalendarClock,
  ClipboardList,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  MailCheck,
  Menu,
  MessageSquare,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
  UserCheck,
  UserCog,
  X,
} from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import { fetchSecretaryWorkspace } from '../../services/secretaryService';
import type {
  SecretaryNotificationRecord,
  SecretaryPortalWorkspaceData,
  SecretarySectionId,
} from '../../types/secretary';
import { SecretaryEmployersSection } from './SecretaryEmployersSection';
import { SecretaryInvitationsSection } from './SecretaryInvitationsSection';
import { SecretaryOverviewSection } from './SecretaryOverviewSection';
import { SecretaryProfileActivitySection } from './SecretaryProfileActivitySection';
import { SecretaryWorkspaceSection } from './SecretaryWorkspaceSection';

interface SecretaryPortalShellProps {
  firebaseUser: User;
  onExitPortal: () => void;
  onSignOut: () => Promise<void>;
}

export function SecretaryPortalShell({
  firebaseUser,
  onExitPortal,
  onSignOut,
}: SecretaryPortalShellProps) {
  const { language, toggleLanguage, theme, toggleTheme } = useMedora();
  const st = SECRETARY_TRANSLATIONS[language];
  const pt = st.portal;
  const isAr = language === 'ar';
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const [workspace, setWorkspace] = useState<SecretaryPortalWorkspaceData | null>(null);
  const [selectedEmploymentId, setSelectedEmploymentId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SecretarySectionId>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [switchWarning, setSwitchWarning] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadWorkspace = useCallback(
    async (employmentIdOverride?: string | null, silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError(null);
      setSwitchWarning(null);
      try {
        const data = await fetchSecretaryWorkspace(
          firebaseUser,
          employmentIdOverride !== undefined ? employmentIdOverride : selectedEmploymentId,
        );
        setWorkspace(data);
        setSelectedEmploymentId(data.selectedEmploymentId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'SECRETARY_WORKSPACE_FAILED';
        // If user tried to switch to a suspended/terminated employmentId, cleanly recover default workspace
        if (
          employmentIdOverride &&
          (msg === 'EMPLOYMENT_SUSPENDED' ||
            msg === 'EMPLOYMENT_TERMINATED' ||
            msg === 'FORBIDDEN_EMPLOYER_ACCESS')
        ) {
          setSwitchWarning(msg);
          try {
            const recovered = await fetchSecretaryWorkspace(firebaseUser, null);
            setWorkspace(recovered);
            setSelectedEmploymentId(recovered.selectedEmploymentId);
            return;
          } catch {
            // fall through to main error
          }
        }
        setLoadError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [firebaseUser, selectedEmploymentId],
  );

  useEffect(() => {
    void loadWorkspace(undefined, false);
    // Initial hydration only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser.uid]);

  useRealtimeNotifications<SecretaryNotificationRecord>({
    collectionName: 'secretary_notifications',
    uidField: 'secretaryUid',
    uid: firebaseUser?.uid,
    enabled: Boolean(workspace && firebaseUser?.uid),
    onUpdate: (items) => {
      setWorkspace((prev) => (prev ? { ...prev, notifications: items } : prev));
    },
  });

  const handleSelectEmployment = (employmentId: string) => {
    setSelectedEmploymentId(employmentId);
    void loadWorkspace(employmentId, true);
  };

  const badges = useMemo(() => {
    if (!workspace) return { invitations: 0, notifications: 0, tasks: 0 };
    return {
      invitations: workspace.invitations.filter((i) => i.status === 'Pending').length,
      notifications: workspace.notifications.filter((n) => !n.isRead).length,
      tasks: (workspace.activeScope?.tasks || []).filter((t) => t.status !== 'done').length,
    };
  }, [workspace]);

  const navItems: Array<{
    id: SecretarySectionId;
    label: string;
    icon: typeof LayoutDashboard;
    badge: number;
  }> = [
    { id: 'overview', label: pt.nav.overview, icon: LayoutDashboard, badge: 0 },
    { id: 'invitations', label: pt.nav.invitations, icon: MailCheck, badge: badges.invitations },
    { id: 'employers', label: pt.nav.employers, icon: Briefcase, badge: 0 },
    { id: 'tasks', label: pt.nav.tasks, icon: ClipboardList, badge: badges.tasks },
    {
      id: 'appointments_bookings',
      label: pt.nav.appointments_bookings,
      icon: CalendarClock,
      badge: 0,
    },
    { id: 'messages', label: pt.nav.messages, icon: MessageSquare, badge: 0 },
    { id: 'notifications', label: pt.nav.notifications, icon: Bell, badge: badges.notifications },
    { id: 'profile', label: pt.nav.profile, icon: UserCog, badge: 0 },
    { id: 'activity', label: pt.nav.activity, icon: History, badge: 0 },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-[#020817]">
        <div className="flex flex-col items-center gap-3 text-slate-600 dark:text-slate-300">
          <Loader2 className="h-8 w-8 animate-spin text-[#0c3585] dark:text-[#f4d378]" />
          <span className="text-sm font-semibold">{pt.loadingWorkspace}</span>
        </div>
      </div>
    );
  }

  if (loadError || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-[#020817]">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-[#07122a]">
          <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {pt.brandTitle}
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-300">{loadError || 'Error'}</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onExitPortal}
              className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
            >
              {pt.backToMedora}
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[40px] rounded-xl bg-rose-600 px-4 text-xs font-bold text-white cursor-pointer"
            >
              {pt.signOut}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeEmployments = workspace.employments.filter((e) => e.status === 'Active');

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return (
          <SecretaryOverviewSection
            workspace={workspace}
            language={language}
            onNavigate={setActiveSection}
            onSelectEmployment={(empId) => {
              handleSelectEmployment(empId);
              setActiveSection('appointments_bookings');
            }}
          />
        );
      case 'invitations':
        return (
          <SecretaryInvitationsSection
            firebaseUser={firebaseUser}
            invitations={workspace.invitations}
            language={language}
            onRefreshWorkspace={(preferredId) => loadWorkspace(preferredId, true)}
          />
        );
      case 'employers':
        return (
          <SecretaryEmployersSection
            employments={workspace.employments}
            selectedEmploymentId={workspace.selectedEmploymentId}
            language={language}
            onSelectEmployment={(empId) => {
              handleSelectEmployment(empId);
              setActiveSection('overview');
            }}
          />
        );
      case 'tasks':
        return (
          <SecretaryWorkspaceSection
            firebaseUser={firebaseUser}
            mode="tasks"
            activeScope={workspace.activeScope}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
          />
        );
      case 'appointments_bookings':
        return (
          <SecretaryWorkspaceSection
            firebaseUser={firebaseUser}
            mode="appointments_bookings"
            activeScope={workspace.activeScope}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
          />
        );
      case 'messages':
        return (
          <SecretaryWorkspaceSection
            firebaseUser={firebaseUser}
            mode="messages"
            activeScope={workspace.activeScope}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
          />
        );
      case 'notifications':
        return (
          <SecretaryProfileActivitySection
            firebaseUser={firebaseUser}
            mode="notifications"
            profile={workspace.profile}
            notifications={workspace.notifications}
            activityLogs={workspace.activityLogs}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
            onNavigateSection={setActiveSection}
          />
        );
      case 'profile':
        return (
          <SecretaryProfileActivitySection
            firebaseUser={firebaseUser}
            mode="profile"
            profile={workspace.profile}
            notifications={workspace.notifications}
            activityLogs={workspace.activityLogs}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
          />
        );
      case 'activity':
        return (
          <SecretaryProfileActivitySection
            firebaseUser={firebaseUser}
            mode="activity"
            profile={workspace.profile}
            notifications={workspace.notifications}
            activityLogs={workspace.activityLogs}
            language={language}
            onRefreshWorkspace={() => loadWorkspace(undefined, true)}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#020817] dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#040d21]/95">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 lg:hidden cursor-pointer"
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/15 text-[#9d6b14] dark:text-[#f4d378]">
              <UserCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-latin text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">
                {pt.brandTitle}
              </h1>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {pt.brandSubtitle} · {workspace.profile.fullName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Strict Employer Switcher */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">
              <span className="hidden text-[11px] font-bold text-slate-500 sm:inline">
                {pt.activeEmployerLabel}:
              </span>
              <select
                value={workspace.selectedEmploymentId || ''}
                onChange={(e) => {
                  if (e.target.value) handleSelectEmployment(e.target.value);
                }}
                disabled={activeEmployments.length === 0}
                className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none dark:text-white"
              >
                {activeEmployments.length === 0 ? (
                  <option value="">{pt.noActiveEmployerOption}</option>
                ) : (
                  activeEmployments.map((emp) => (
                    <option key={emp.employmentId} value={emp.employmentId}>
                      {st.employerTypeLabels[emp.employerType]} — {emp.employerName}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button
              type="button"
              onClick={() => void loadWorkspace(undefined, true)}
              disabled={refreshing}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold hover:border-[#0c3585] dark:border-slate-700 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{pt.refreshBtn}</span>
            </button>
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-[38px] rounded-xl border border-slate-200 px-2.5 font-latin text-xs font-bold dark:border-slate-700 cursor-pointer"
            >
              {isAr ? 'EN' : 'عربي'}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
              aria-label="Theme"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={onExitPortal}
              className="hidden min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700 sm:inline-flex cursor-pointer"
            >
              <BackIcon className="h-3.5 w-3.5" />
              <span>{pt.backToMedora}</span>
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-rose-200 px-3 text-xs font-semibold text-rose-600 dark:border-rose-500/30 dark:text-rose-400 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{pt.signOut}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-6 px-4 py-5">
        <aside className="hidden w-64 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-1 rounded-2xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-[#07122a]">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 && (
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-latin text-[10px] font-bold tabular-nums ${
                        active ? 'bg-white/20 text-white' : 'bg-[#d9a43b] text-[#040917]'
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
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col gap-3 overflow-y-auto border-e border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <span className="font-latin text-sm font-extrabold text-[#0c3585] dark:text-[#f4d378]">
                  {pt.brandTitle}
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-2 rounded-xl px-3 text-xs font-bold cursor-pointer ${
                        active ? 'bg-[#0c3585] text-white' : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge > 0 && (
                        <span className="rounded-md bg-[#d9a43b] px-1.5 py-0.5 font-latin text-[10px] font-bold text-[#040917] tabular-nums">
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
                  onExitPortal();
                }}
                className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                <BackIcon className="h-4 w-4" />
                <span>{pt.backToMedora}</span>
              </button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 space-y-4 pb-10">
          {switchWarning && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
              {switchWarning}
            </div>
          )}
          {renderSection()}
        </main>
      </div>
    </div>
  );
}
