import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Bell, Check, CheckCheck, Copy, History, Lock, UserCog } from 'lucide-react';
import { SECRETARY_TRANSLATIONS } from '../../i18n/secretaryTranslations';
import {
  markAllSecretaryNotificationsRead,
  markSecretaryNotificationRead,
  updateIndependentSecretaryProfile,
} from '../../services/secretaryService';
import type { Language } from '../../types/medora';
import type {
  SecretaryActivityLogRecord,
  SecretaryNotificationRecord,
  SecretaryProfileRecord,
  SecretarySectionId,
} from '../../types/secretary';
import { resolveNotificationActionRoute } from '../../constants/notificationCatalog';
import { IraqiPhoneVerificationCard } from '../shared/IraqiPhoneVerificationCard';
import { NotificationChannelCard } from '../shared/NotificationChannelCard';
import { NotificationItemCard } from '../shared/NotificationItemCard';

interface SecretaryProfileActivitySectionProps {
  firebaseUser: User;
  mode: 'notifications' | 'profile' | 'activity';
  profile: SecretaryProfileRecord;
  notifications: SecretaryNotificationRecord[];
  activityLogs: SecretaryActivityLogRecord[];
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
  onNavigateSection?: (sec: SecretarySectionId) => void;
}

export function SecretaryProfileActivitySection({
  firebaseUser,
  mode,
  profile,
  notifications,
  activityLogs,
  language,
  onRefreshWorkspace,
  onNavigateSection,
}: SecretaryProfileActivitySectionProps) {
  const st = SECRETARY_TRANSLATIONS[language];
  const nt = st.portal.notifications;
  const pr = st.portal.profile;
  const ac = st.portal.activity;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [phone, setPhone] = useState(profile.phone || '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  const [district, setDistrict] = useState(profile.district || '');
  const [educationQualification, setEducationQualification] = useState(
    profile.educationQualification || '',
  );
  const [previousExperience, setPreviousExperience] = useState(
    profile.previousExperience || '',
  );
  const [bio, setBio] = useState(profile.bio || '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1600);
    } catch {
      // Ignore clipboard failure
    }
  };

  if (mode === 'notifications') {
    const unread = notifications.filter((n) => !n.isRead).length;
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{nt.title}</h2>
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() =>
                void markAllSecretaryNotificationsRead(firebaseUser).then(onRefreshWorkspace)
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white cursor-pointer"
            >
              <CheckCheck className="h-4 w-4" />
              <span>{nt.markAllReadBtn}</span>
            </button>
          )}
        </div>

        <IraqiPhoneVerificationCard
          firebaseUser={firebaseUser}
          language={language}
          currentPhone={phone}
          compact
          onPhoneVerified={(e164) => setPhone(e164)}
          onPhoneUnlinked={() => setPhone('')}
        />

        <NotificationChannelCard
          firebaseUser={firebaseUser}
          role="secretary"
          language={language}
          compact
          linkedPhoneOverride={phone}
        />

        {notifications.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
            {nt.empty}
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const fallbackEvent =
                n.type === 'task_assigned'
                  ? ('secretary_task' as const)
                  : n.type === 'invitation_received'
                    ? ('secretary_invitation' as const)
                    : ('important_account_update' as const);
              const eventType = n.eventType || fallbackEvent;
              const actionRoute =
                n.actionRoute ||
                resolveNotificationActionRoute(
                  'secretary',
                  eventType,
                  n.relatedId,
                  n.relatedType,
                );
              const canNav =
                Boolean(onNavigateSection) &&
                Boolean(actionRoute) &&
                actionRoute?.section !== 'notifications';

              return (
                <NotificationItemCard
                  key={n.notificationId}
                  notification={{
                    ...n,
                    eventType,
                    actionRoute,
                  }}
                  language={language}
                  canNavigate={canNav}
                  navigateLabel={language === 'ar' ? 'فتح' : 'Open'}
                  onMarkRead={() =>
                    void markSecretaryNotificationRead(firebaseUser, n.notificationId).then(
                      onRefreshWorkspace,
                    )
                  }
                  onNavigate={(route) => {
                    onNavigateSection?.(route.section as SecretarySectionId);
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (mode === 'activity') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{ac.title}</h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ac.subtitle}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          {activityLogs.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">{ac.empty}</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {activityLogs.map((log) => (
                <div
                  key={log.logId}
                  className="flex flex-wrap items-start justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {log.employerName} ·{' '}
                      <span className="text-[#0c3585] dark:text-[#f4d378]">{log.action}</span>
                    </p>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                      {log.actorRole === 'employer' ? ac.actorEmployer : ac.actorSecretary} (
                      {log.actorName}) — {log.details}
                    </p>
                  </div>
                  {log.createdAt && (
                    <span className="font-latin text-slate-400 tabular-nums" dir="ltr">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // PROFILE MODE
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await updateIndependentSecretaryProfile(firebaseUser, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        governorate: governorate.trim(),
        district: district.trim(),
        educationQualification: educationQualification.trim(),
        previousExperience: previousExperience.trim(),
        bio: bio.trim(),
      });
      await onRefreshWorkspace();
      setMsg({ type: 'ok', text: pr.savedNotice });
    } catch (err) {
      setMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'PROFILE_UPDATE_FAILED',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2">
          <UserCog className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{pr.title}</h2>
        </div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{pr.subtitle}</p>
      </div>

      {/* Employer Discovery Card (Copyable Code / Email / UID) */}
      <div className="rounded-2xl border border-[#d9a43b]/40 bg-amber-50/30 p-6 dark:bg-amber-950/15">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          {pr.identityCardTitle}
        </h3>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{pr.shareIdHint}</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { key: 'code', label: pr.codeLabel, val: profile.secretaryCode },
            { key: 'email', label: pr.emailLabel, val: profile.email },
            { key: 'uid', label: pr.uidLabel, val: profile.uid },
          ].map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500">{row.label}</p>
                <p className="truncate font-latin text-xs font-bold text-slate-900 dark:text-white" dir="ltr">
                  {row.val}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyText(row.key, row.val)}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-bold hover:bg-slate-50 dark:border-slate-700 cursor-pointer"
              >
                {copiedKey === row.key ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{pr.copyBtn}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            msg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {msg.text}
        </div>
      )}

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold">{pr.fullNameLabel} *</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-bold">{pr.phoneLabel} *</label>
            <input
              type="tel"
              dir="ltr"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-bold">{pr.governorateLabel}</label>
            <input
              type="text"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-bold">{pr.districtLabel}</label>
            <input
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold">{pr.educationLabel} *</label>
            <input
              type="text"
              required
              value={educationQualification}
              onChange={(e) => setEducationQualification(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold">{pr.experienceLabel}</label>
            <textarea
              rows={2}
              value={previousExperience}
              onChange={(e) => setPreviousExperience(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold">{pr.bioLabel}</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>{pr.securityNote}</span>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
          >
            {saving ? '...' : pr.saveProfileBtn}
          </button>
        </div>
      </form>
    </div>
  );
}
