import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
  Building2,
  Check,
  ClipboardList,
  Copy,
  MailCheck,
  ShieldCheck,
} from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import type { Language } from '../../types/medora';
import type {
  SecretaryPortalWorkspaceData,
  SecretarySectionId,
} from '../../types/secretary';

interface SecretaryOverviewSectionProps {
  workspace: SecretaryPortalWorkspaceData;
  language: Language;
  onNavigate: (sec: SecretarySectionId) => void;
  onSelectEmployment: (employmentId: string) => void;
}

export function SecretaryOverviewSection({
  workspace,
  language,
  onNavigate,
  onSelectEmployment,
}: SecretaryOverviewSectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const ov = st.portal.overview;
  const ForwardIcon = language === 'ar' ? ArrowLeft : ArrowRight;
  const [copied, setCopied] = useState(false);

  const activeEmployments = workspace.employments.filter((e) => e.status === 'Active');
  const pendingInvitations = workspace.invitations.filter((i) => i.status === 'Pending');
  const openScopedTasks = (workspace.activeScope?.tasks || []).filter(
    (t) => t.status !== 'done',
  ).length;
  const unreadNotifs = workspace.notifications.filter((n) => !n.isRead).length;
  const activeEmp = workspace.activeScope?.employment || null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(workspace.profile.secretaryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div className="space-y-6">
      {/* Identity Hero */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
              {st.portal.brandSubtitle}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">
              {ov.welcomePrefix} {workspace.profile.fullName}
            </h2>
            <p className="mt-1 font-latin text-xs text-slate-500 dark:text-slate-400" dir="ltr">
              {workspace.profile.email}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/10 px-4 py-2.5">
            <div>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                {ov.secretaryCodeLabel}
              </p>
              <p className="font-latin text-sm font-extrabold text-slate-900 tabular-nums dark:text-[#f4d378]" dir="ltr">
                {workspace.profile.secretaryCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void copyCode()}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-50 dark:bg-slate-900 dark:text-white cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? ov.copiedMsg : ov.copyCodeBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Pending Invite Banner */}
      {pendingInvitations.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9a43b]/50 bg-[#d9a43b]/12 p-4 text-sm text-amber-950 dark:text-amber-100">
          <div className="flex items-center gap-3">
            <MailCheck className="h-5 w-5 shrink-0 text-[#b68023] dark:text-[#f4d378]" />
            <span className="font-semibold">
              {ov.pendingInviteAlert} ({pendingInvitations.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('invitations')}
            className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <span>{ov.reviewInvitesBtn}</span>
            <ForwardIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* 4 Clean KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('employers')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-[#0c3585]/40 dark:border-slate-800 dark:bg-[#07122a] cursor-pointer"
        >
          <Briefcase className="h-5 w-5 text-[#0c3585] dark:text-blue-400" />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ov.kpiActiveEmployers}</p>
          <p className="mt-1 font-latin text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {activeEmployments.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('invitations')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-[#d9a43b]/60 dark:border-slate-800 dark:bg-[#07122a] cursor-pointer"
        >
          <MailCheck className="h-5 w-5 text-[#b68023] dark:text-[#f4d378]" />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ov.kpiPendingInvites}</p>
          <p className="mt-1 font-latin text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {pendingInvitations.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('tasks')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-[#07122a] cursor-pointer"
        >
          <ClipboardList className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ov.kpiScopedTasks}</p>
          <p className="mt-1 font-latin text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {openScopedTasks}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('notifications')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-start transition hover:border-rose-500/40 dark:border-slate-800 dark:bg-[#07122a] cursor-pointer"
        >
          <Bell className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{ov.kpiUnreadNotifs}</p>
          <p className="mt-1 font-latin text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {unreadNotifs}
          </p>
        </button>
      </div>

      {/* Active Scoped Employer Summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <Building2 className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {ov.activeWorkspaceCardTitle}
          </h3>
        </div>

        {!activeEmp ? (
          <div className="py-6">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {ov.noActiveWorkspaceTitle}
            </h4>
            <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {ov.noActiveWorkspaceBody}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                  {st.employerTypeLabels[activeEmp.employerType]}
                </p>
                <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                  {activeEmp.employerName}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('appointments_bookings')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#0a2c6e] cursor-pointer"
              >
                <span>{ov.openWorkspaceBtn}</span>
                <ForwardIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {ov.grantedPermsTitle}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeEmp.permissions.map((perm) => (
                  <div
                    key={perm}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/40"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {st.permissions[perm]?.label || perm}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Switch Connected Employers */}
      {activeEmployments.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {ov.quickEmployersTitle}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeEmployments.map((emp) => {
              const isSelected = emp.employmentId === workspace.selectedEmploymentId;
              return (
                <button
                  key={emp.employmentId}
                  type="button"
                  onClick={() => onSelectEmployment(emp.employmentId)}
                  className={`flex items-center justify-between rounded-xl border p-4 text-start transition cursor-pointer ${
                    isSelected
                      ? 'border-[#d9a43b] bg-amber-50/40 dark:bg-amber-950/15'
                      : 'border-slate-200 hover:border-[#0c3585]/40 dark:border-slate-800'
                  }`}
                >
                  <div>
                    <p className="text-[11px] font-bold text-[#0c3585] dark:text-[#f4d378]">
                      {st.employerTypeLabels[emp.employerType]}
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                      {emp.employerName}
                    </p>
                  </div>
                  <ForwardIcon className="h-4 w-4 text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
