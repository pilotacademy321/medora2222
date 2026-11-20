import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Building2, Check, Clock, ShieldCheck, X } from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import {
  acceptSecretaryInvitation,
  rejectSecretaryInvitation,
} from '../../services/secretaryService';
import type { Language } from '../../types/medora';
import type { SecretaryInvitationRecord } from '../../types/secretary';

interface SecretaryInvitationsSectionProps {
  firebaseUser: User;
  invitations: SecretaryInvitationRecord[];
  language: Language;
  onRefreshWorkspace: (preferredEmploymentId?: string) => Promise<void>;
}

export function SecretaryInvitationsSection({
  firebaseUser,
  invitations,
  language,
  onRefreshWorkspace,
}: SecretaryInvitationsSectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const iv = st.portal.invitations;

  const [filter, setFilter] = useState<'all' | 'pending' | 'history'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const visibleInvites = invitations.filter((inv) => {
    if (filter === 'pending') return inv.status === 'Pending';
    if (filter === 'history') return inv.status !== 'Pending';
    return true;
  });

  const handleAccept = async (inv: SecretaryInvitationRecord) => {
    setBusyId(inv.invitationId);
    setBanner(null);
    try {
      const res = await acceptSecretaryInvitation(firebaseUser, inv.invitationId);
      setBanner({
        type: 'ok',
        text: `${inv.employerName} — ${st.invitationStatuses.Accepted}`,
      });
      await onRefreshWorkspace(res.employment.employmentId);
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'INVITATION_ACCEPT_FAILED',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (inv: SecretaryInvitationRecord) => {
    setBusyId(inv.invitationId);
    setBanner(null);
    try {
      await rejectSecretaryInvitation(firebaseUser, inv.invitationId);
      setBanner({
        type: 'ok',
        text: `${inv.employerName} — ${st.invitationStatuses.Rejected}`,
      });
      await onRefreshWorkspace();
    } catch (err) {
      setBanner({
        type: 'err',
        text: err instanceof Error ? err.message : 'INVITATION_REJECT_FAILED',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{iv.title}</h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{iv.subtitle}</p>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
            {(['all', 'pending', 'history'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`min-h-[34px] rounded-lg px-3 text-xs font-bold cursor-pointer ${
                  filter === tab
                    ? 'bg-[#0c3585] text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                {tab === 'all'
                  ? iv.filterAll
                  : tab === 'pending'
                    ? iv.filterPending
                    : iv.filterHistory}
              </button>
            ))}
          </div>
        </div>
      </div>

      {banner && (
        <div
          role="alert"
          className={`rounded-xl border px-4 py-3 text-sm ${
            banner.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          {banner.text}
        </div>
      )}

      {visibleInvites.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {iv.empty}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleInvites.map((inv) => {
            const busy = busyId === inv.invitationId;
            const statusClass =
              inv.status === 'Pending'
                ? 'border-[#d9a43b]/50 bg-[#d9a43b]/15 text-[#8c5d0b] dark:text-[#f4d378]'
                : inv.status === 'Accepted'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';

            return (
              <article
                key={inv.invitationId}
                className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Building2 className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                      <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                        {st.employerTypeLabels[inv.employerType]}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${statusClass}`}>
                        {st.invitationStatuses[inv.status]}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                      {inv.employerName}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {iv.invitedByLabel}: {inv.invitedByName}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 font-latin text-xs text-slate-500 tabular-nums" dir="ltr">
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {iv.expiresAtLabel}: {new Date(inv.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {inv.message && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    “{inv.message}”
                  </div>
                )}

                <div className="mt-4">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {iv.proposedPermsTitle}
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {inv.proposedPermissions.map((perm) => (
                      <div
                        key={perm}
                        className="flex items-start gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-800"
                      >
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {st.permissions[perm]?.label || perm}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {st.permissions[perm]?.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {inv.initialTasks && inv.initialTasks.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {iv.initialTasksTitle} ({inv.initialTasks.length})
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {inv.initialTasks.map((t, idx) => (
                        <li key={idx}>
                          • <strong>{t.title}</strong>
                          {t.description ? ` — ${t.description}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {inv.status === 'Pending' && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {iv.consentNotice}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReject(inv)}
                        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-300 px-4 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                        <span>{iv.rejectBtn}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAccept(inv)}
                        className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                        <span>{iv.acceptBtn}</span>
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
