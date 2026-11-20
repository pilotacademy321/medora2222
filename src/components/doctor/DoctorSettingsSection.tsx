import { useEffect, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  Bell,
  Camera,
  Check,
  Globe,
  Lock,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
  X,
} from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  saveDoctorAvatar,
  saveDoctorSettings,
  uploadDoctorAvatar,
} from '../../services/doctorService';
import type {
  DoctorNotificationPrefs,
  DoctorPrivacyPrefs,
  DoctorSectionId,
  DoctorWorkspaceData,
} from '../../types/doctor';
import type { Language } from '../../types/medora';
import type { RoleInAppNotificationRecord } from '../../types/notifications';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import {
  fetchRoleInAppNotifications,
  markAllRoleInAppNotificationsRead,
  markRoleInAppNotificationRead,
} from '../../services/notificationService';
import { resolveNotificationActionRoute } from '../../constants/notificationCatalog';
import { canAccessDoctorSection } from '../../utils/doctorAccess';
import { IraqiPhoneVerificationCard } from '../shared/IraqiPhoneVerificationCard';
import { NotificationChannelCard } from '../shared/NotificationChannelCard';
import { NotificationItemCard } from '../shared/NotificationItemCard';

interface DoctorSettingsSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
  onNavigateSection?: (section: DoctorSectionId) => void;
  externalInApp?: RoleInAppNotificationRecord[];
  onUpdateExternalInApp?: (
    updater:
      | RoleInAppNotificationRecord[]
      | ((prev: RoleInAppNotificationRecord[]) => RoleInAppNotificationRecord[]),
  ) => void;
  initialTab?: SettingsTab;
  onConsumeInitialTab?: () => void;
}

type SettingsTab = 'profile' | 'notifications' | 'appearance' | 'security';

export function DoctorSettingsSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
  onNavigateSection,
  externalInApp,
  onUpdateExternalInApp,
  initialTab,
  onConsumeInitialTab,
}: DoctorSettingsSectionProps) {
  const { setLanguage, theme, setTheme } = useMedora();
  const dc = DOCTOR_TRANSLATIONS[language];
  const sc = dc.settings;
  const profile = workspace.doctorProfile;

  const isDoctorOwner = workspace.actorRole === 'doctor';
  const [tab, setTab] = useState<SettingsTab>(
    initialTab && (isDoctorOwner || (initialTab !== 'profile' && initialTab !== 'notifications'))
      ? initialTab
      : isDoctorOwner
        ? 'profile'
        : 'appearance',
  );

  useEffect(() => {
    if (!initialTab) return;
    if (isDoctorOwner || (initialTab !== 'profile' && initialTab !== 'notifications')) {
      setTab(initialTab);
    }
    onConsumeInitialTab?.();
  }, [initialTab, isDoctorOwner, onConsumeInitialTab]);

  const [phone, setPhone] = useState(profile.professionalPhone || '');
  const [subSpecialty, setSubSpecialty] = useState(profile.subSpecialty || '');
  const [languagesText, setLanguagesText] = useState(
    (profile.languages || []).join(', '),
  );

  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [avatarPath, setAvatarPath] = useState(profile.avatarPath || '');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  useEffect(() => {
    setAvatarUrl(profile.avatarUrl || '');
    setAvatarPath(profile.avatarPath || '');
  }, [profile.avatarUrl, profile.avatarPath]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  const [notifPrefs, setNotifPrefs] = useState<DoctorNotificationPrefs>({
    newBookings: profile.notificationPrefs?.newBookings ?? true,
    newMessages: profile.notificationPrefs?.newMessages ?? true,
    diagnosticResults: profile.notificationPrefs?.diagnosticResults ?? true,
    staffActions: profile.notificationPrefs?.staffActions ?? true,
  });

  const [privacyPrefs, setPrivacyPrefs] = useState<DoctorPrivacyPrefs>({
    showPhoneInDirectory: profile.privacyPrefs?.showPhoneInDirectory ?? true,
    showFeeInDirectory: profile.privacyPrefs?.showFeeInDirectory ?? true,
    allowPatientMessages: profile.privacyPrefs?.allowPatientMessages ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [localDoctorInApp, setLocalDoctorInApp] = useState<RoleInAppNotificationRecord[]>([]);
  const doctorInApp = externalInApp ?? localDoctorInApp;
  const updateDoctorInApp = (
    updater:
      | RoleInAppNotificationRecord[]
      | ((prev: RoleInAppNotificationRecord[]) => RoleInAppNotificationRecord[]),
  ) => {
    if (onUpdateExternalInApp) {
      onUpdateExternalInApp(updater);
    } else {
      setLocalDoctorInApp(updater);
    }
  };
  const doctorUnreadCount = doctorInApp.filter((n) => !n.isRead).length;

  useEffect(() => {
    if (!isDoctorOwner) return;
    let active = true;
    fetchRoleInAppNotifications(firebaseUser, 'doctor')
      .then((res) => {
        if (active) updateDoctorInApp(res.notifications);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [firebaseUser, isDoctorOwner, tab]);

  const clearPendingPreview = () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingPreviewUrl(null);
    setPendingAvatarFile(null);
  };

  const handleSelectAvatarFile = (file: File | null) => {
    if (!file) return;
    setStatusMsg(null);
    if (
      !file.type.startsWith('image/') &&
      !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name)
    ) {
      setStatusMsg({
        type: 'err',
        text: mapUploadErrorMessage(new Error('INVALID_IMAGE_TYPE'), language),
      });
      return;
    }
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setPendingAvatarFile(file);
    setPendingPreviewUrl(preview);
  };

  const handleSaveAvatar = async () => {
    if (!isDoctorOwner || !pendingAvatarFile) return;
    setSavingAvatar(true);
    setStatusMsg(null);
    try {
      const uploaded = await uploadDoctorAvatar(firebaseUser, pendingAvatarFile);
      const updated = await saveDoctorAvatar(firebaseUser, {
        avatarUrl: uploaded.url,
        avatarPath: uploaded.storagePath,
      });
      setAvatarUrl(updated.avatarUrl || uploaded.url);
      setAvatarPath(updated.avatarPath || uploaded.storagePath);
      clearPendingPreview();
      await onRefreshWorkspace();
      setStatusMsg({ type: 'ok', text: sc.avatarSavedMsg });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: mapUploadErrorMessage(err, language),
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!isDoctorOwner || !avatarUrl) return;
    setSavingAvatar(true);
    setStatusMsg(null);
    try {
      await saveDoctorAvatar(firebaseUser, {
        avatarUrl: '',
        avatarPath: '',
      });
      setAvatarUrl('');
      setAvatarPath('');
      clearPendingPreview();
      await onRefreshWorkspace();
      setStatusMsg({ type: 'ok', text: sc.avatarRemovedMsg });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: mapUploadErrorMessage(err, language),
      });
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!isDoctorOwner) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      await saveDoctorSettings(firebaseUser, {
        professionalPhone: phone.trim(),
        subSpecialty: subSpecialty.trim(),
        avatarUrl,
        avatarPath,
        languages: languagesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        notificationPrefs: notifPrefs,
        privacyPrefs,
      });
      await onRefreshWorkspace();
      setStatusMsg({ type: 'ok', text: dc.appointments.savedNotice });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: mapUploadErrorMessage(err, language),
      });
    } finally {
      setSaving(false);
    }
  };

  const displayedAvatar = pendingPreviewUrl || avatarUrl;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {sc.title}
        </h2>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ...(isDoctorOwner
                ? [{ id: 'profile', label: sc.profileTab, icon: UserCog }]
                : []),
              ...(isDoctorOwner
                ? [{ id: 'notifications', label: sc.notificationsTab, icon: Bell }]
                : []),
              { id: 'appearance', label: sc.appearanceTab, icon: Globe },
              { id: 'security', label: sc.securityTab, icon: ShieldCheck },
            ] as Array<{
              id: SettingsTab;
              label: string;
              icon: typeof UserCog;
            }>
          ).map((tb) => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => setTab(tb.id)}
                className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold cursor-pointer ${
                  tab === tb.id
                    ? 'bg-[#0c3585] text-white'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tb.label}</span>
                {tb.id === 'notifications' && doctorUnreadCount > 0 && (
                  <span className="font-latin tabular-nums opacity-90">
                    ({doctorUnreadCount})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            statusMsg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {tab === 'profile' && isDoctorOwner && (
        <div className="space-y-6">
          {/* Dedicated Physician Avatar Management Card */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-[#d9a43b]/70 bg-slate-100 dark:bg-slate-900">
                  {displayedAvatar ? (
                    <img
                      src={displayedAvatar}
                      alt={profile.fullName}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[#0c3585]/10 text-xl font-bold text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                      {(profile.fullName || 'DR').trim().slice(0, 2)}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-slate-950/45 py-1 text-white">
                    <Camera className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {sc.avatarSectionTitle}
                  </h3>
                  <p className="max-w-lg text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {sc.avatarSpecsHint}
                  </p>
                  {pendingPreviewUrl && (
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {sc.previewReadyLabel}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                  <Upload className="h-4 w-4" />
                  <span>
                    {avatarUrl || pendingPreviewUrl ? sc.replaceAvatarBtn : sc.updateAvatarBtn}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    disabled={savingAvatar}
                    className="sr-only"
                    onChange={(e) => {
                      handleSelectAvatarFile(e.target.files?.[0] || null);
                      e.target.value = '';
                    }}
                  />
                </label>

                {pendingAvatarFile && (
                  <>
                    <button
                      type="button"
                      disabled={savingAvatar}
                      onClick={() => void handleSaveAvatar()}
                      className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                      <span>{savingAvatar ? '...' : sc.saveAvatarBtn}</span>
                    </button>
                    <button
                      type="button"
                      disabled={savingAvatar}
                      onClick={clearPendingPreview}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>{sc.cancelPreviewBtn}</span>
                    </button>
                  </>
                )}

                {avatarUrl && !pendingPreviewUrl && (
                  <button
                    type="button"
                    disabled={savingAvatar}
                    onClick={() => void handleRemoveAvatar()}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-rose-300 px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 dark:hover:bg-rose-950/30 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{sc.removeAvatarBtn}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          <form
            onSubmit={handleSave}
            className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold">{sc.phoneLabel}</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">
                  {dc.prescriptions.specialtyLabel}
                </label>
                <input
                  type="text"
                  value={subSpecialty}
                  onChange={(e) => setSubSpecialty(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold">{sc.languagesLabel}</label>
                <input
                  type="text"
                  value={languagesText}
                  onChange={(e) => setLanguagesText(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || savingAvatar}
              className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {saving ? '...' : sc.saveProfileBtn}
            </button>
          </form>
        </div>
      )}

      {tab === 'notifications' && isDoctorOwner && (
        <div className="space-y-5">
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
            role="doctor"
            language={language}
            linkedPhoneOverride={phone}
          />

          <form
            onSubmit={handleSave}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
          >
            {(
              [
                { key: 'newBookings', label: dc.overview.todayBookings },
                { key: 'newMessages', label: dc.overview.unreadMessages },
                { key: 'diagnosticResults', label: dc.overview.recentResults },
                { key: 'staffActions', label: dc.clinicStaff.staffTitle },
              ] as Array<{ key: keyof DoctorNotificationPrefs; label: string }>
            ).map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={notifPrefs[item.key]}
                  onChange={(e) =>
                    setNotifPrefs((prev) => ({
                      ...prev,
                      [item.key]: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{item.label}</span>
              </label>
            ))}

            <button
              type="submit"
              disabled={saving}
              className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] cursor-pointer"
            >
              {saving ? '...' : sc.saveProfileBtn}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {language === 'ar' ? 'إشعارات العيادة داخل المنصة' : 'Clinic In-App Notifications'}
                </h3>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                  {language === 'ar'
                    ? `غير المقروء: ${doctorUnreadCount} · الإجمالي: ${doctorInApp.length}`
                    : `Unread: ${doctorUnreadCount} · Total: ${doctorInApp.length}`}
                </span>
              </div>
              {doctorUnreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    updateDoctorInApp((prev) => prev.map((n) => ({ ...n, isRead: true })));
                    void markAllRoleInAppNotificationsRead(firebaseUser, 'doctor');
                  }}
                  className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                >
                  {language === 'ar' ? 'تحديد الكل كمقروء' : 'Mark all read'}
                </button>
              )}
            </div>

            {doctorInApp.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
                {language === 'ar'
                  ? 'لا توجد إشعارات داخلية للعيادة حالياً.'
                  : 'No clinic notifications at the moment.'}
              </div>
            ) : (
              <div className="space-y-3">
                {doctorInApp.slice(0, 20).map((n) => {
                  const actionRoute =
                    n.actionRoute ||
                    (n.eventType
                      ? resolveNotificationActionRoute(
                          'doctor',
                          n.eventType,
                          n.relatedId,
                          n.relatedType,
                        )
                      : undefined);
                  const reqPerm = actionRoute?.requiredPermission;
                  const canNav =
                    Boolean(onNavigateSection) &&
                    Boolean(actionRoute) &&
                    canAccessDoctorSection(workspace, actionRoute!.section) &&
                    (isDoctorOwner ||
                      !reqPerm ||
                      (reqPerm !== 'doctorOnly' &&
                        Array.isArray(workspace.permissions) &&
                        workspace.permissions.includes(
                          reqPerm as (typeof workspace.permissions)[number],
                        )));

                  return (
                    <NotificationItemCard
                      key={n.notificationId}
                      notification={{
                        ...n,
                        actionRoute,
                      }}
                      language={language}
                      canNavigate={canNav}
                      navigateLabel={language === 'ar' ? 'فتح القسم' : 'Open Section'}
                      onMarkRead={() => {
                        updateDoctorInApp((prev) =>
                          prev.map((x) =>
                            x.notificationId === n.notificationId
                              ? { ...x, isRead: true }
                              : x,
                          ),
                        );
                        void markRoleInAppNotificationRead(
                          firebaseUser,
                          n.notificationId,
                          'doctor',
                        );
                      }}
                      onNavigate={(route) => {
                        onNavigateSection?.(route.section as DoctorSectionId);
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'appearance' && (
        <div className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a] sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {sc.languageSelect}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setLanguage('ar')}
                className={`min-h-[40px] flex-1 rounded-xl border text-xs font-bold cursor-pointer ${
                  language === 'ar'
                    ? 'border-[#0c3585] bg-[#0c3585] text-white'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                العربية (RTL)
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`min-h-[40px] flex-1 rounded-xl border text-xs font-bold cursor-pointer ${
                  language === 'en'
                    ? 'border-[#0c3585] bg-[#0c3585] text-white'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                English (LTR)
              </button>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              {sc.themeSelect}
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`min-h-[40px] flex-1 rounded-xl border text-xs font-bold cursor-pointer ${
                  theme === 'light'
                    ? 'border-[#0c3585] bg-[#0c3585] text-white'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {sc.lightMode}
              </button>
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`min-h-[40px] flex-1 rounded-xl border text-xs font-bold cursor-pointer ${
                  theme === 'dark'
                    ? 'border-[#0c3585] bg-[#0c3585] text-white'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {sc.darkMode}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
            <span>{sc.securitySummary}</span>
          </div>

          {isDoctorOwner && (
            <>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyPrefs.showPhoneInDirectory}
                  onChange={(e) =>
                    setPrivacyPrefs((p) => ({
                      ...p,
                      showPhoneInDirectory: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{sc.privacyShowPhone}</span>
              </label>

              <label className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyPrefs.showFeeInDirectory}
                  onChange={(e) =>
                    setPrivacyPrefs((p) => ({
                      ...p,
                      showFeeInDirectory: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{sc.privacyShowFee}</span>
              </label>

              <label className="flex items-center gap-3 text-sm font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={privacyPrefs.allowPatientMessages}
                  onChange={(e) =>
                    setPrivacyPrefs((p) => ({
                      ...p,
                      allowPatientMessages: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{sc.privacyAllowMessages}</span>
              </label>

              <button
                type="submit"
                disabled={saving}
                className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {saving ? '...' : sc.saveProfileBtn}
              </button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
