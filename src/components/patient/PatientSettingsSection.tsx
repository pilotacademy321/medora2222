import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  BellRing,
  CheckCircle2,
  Shield,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { useMedora } from '../../contexts/MedoraContext';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import {
  savePatientSettings,
  uploadPatientStorageAsset,
} from '../../services/patientService';
import type { GenderType } from '../../types/medora';
import type {
  PatientNotificationPreferences,
  PatientWorkspaceData,
} from '../../types/patient';
import {
  isProbablyImageFile,
  mapUploadErrorMessage,
} from '../../utils/imagePreparation';
import {
  getIraqiPhoneValidationMessage,
  parseAndNormalizeIraqiPhone,
} from '../../utils/iraqiPhone';
import { IraqiPhoneVerificationCard } from '../shared/IraqiPhoneVerificationCard';
import { NotificationChannelCard } from '../shared/NotificationChannelCard';

interface PatientSettingsSectionProps {
  firebaseUser: User;
  workspace: PatientWorkspaceData;
  onRefreshWorkspace: () => Promise<void>;
  onOpenSharingTab: () => void;
}

export function PatientSettingsSection({
  firebaseUser,
  workspace,
  onRefreshWorkspace,
  onOpenSharingTab,
}: PatientSettingsSectionProps) {
  const {
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    setUserAccount,
  } = useMedora();
  const ps = PATIENT_TRANSLATIONS[language].settings;
  const pm = PATIENT_TRANSLATIONS[language].medicalRecord;

  const account = workspace.userAccount;
  const profile = workspace.patientProfile;

  const [fullName, setFullName] = useState(
    profile?.fullName || account.fullName || '',
  );
  const [phone, setPhone] = useState(profile?.phone || account.phone || '');
  const [dateOfBirth, setDateOfBirth] = useState(
    profile?.dateOfBirth || account.dateOfBirth || '',
  );
  const [gender, setGender] = useState<GenderType>(
    profile?.gender ||
      (account.gender === 'female' ? 'female' : 'male'),
  );
  const [governorate, setGovernorate] = useState(
    profile?.governorate || account.governorate || 'baghdad',
  );
  const [district, setDistrict] = useState(
    profile?.district || account.district || '',
  );
  const [address, setAddress] = useState(
    profile?.address || account.address || '',
  );
  const [avatarUrl, setAvatarUrl] = useState(
    profile?.avatarUrl || account.avatarUrl || account.photoUrl || '',
  );
  const [avatarPath, setAvatarPath] = useState(
    profile?.avatarPath || account.avatarPath || '',
  );
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [emergencyContactName, setEmergencyContactName] = useState(
    profile?.emergencyContactName || '',
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    profile?.emergencyContactPhone || '',
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    profile?.emergencyContactRelation || '',
  );

  const [notifPrefs, setNotifPrefs] = useState<PatientNotificationPreferences>(
    workspace.preferences.notifications,
  );
  const [allowDoctorSearchByPhone, setAllowDoctorSearchByPhone] = useState(
    workspace.preferences.privacy.allowDoctorSearchByPhone,
  );
  const [defaultShareExpiryDays, setDefaultShareExpiryDays] = useState<string>(
    workspace.preferences.privacy.defaultShareExpiryDays
      ? String(workspace.preferences.privacy.defaultShareExpiryDays)
      : '',
  );

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  const clearPendingAvatar = () => {
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingPreviewUrl(null);
    setPendingAvatarFile(null);
  };

  const selectedGovObj = useMemo(() => {
    const n = governorate.trim().toLowerCase();
    return (
      IRAQ_GOVERNORATES.find(
        (g) =>
          g.id.toLowerCase() === n ||
          g.ar.toLowerCase() === n ||
          g.en.toLowerCase() === n,
      ) || IRAQ_GOVERNORATES[0]
    );
  }, [governorate]);

  const handleAvatarSelect = (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setSavedMsg(null);
    if (!isProbablyImageFile(file)) {
      setErrorMsg(mapUploadErrorMessage(new Error('INVALID_IMAGE_TYPE'), language));
      return;
    }
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
    }
    setPendingAvatarFile(file);
    setPendingPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);
    try {
      let nextAvatarUrl = avatarUrl;
      let nextAvatarPath = avatarPath;

      if (pendingAvatarFile) {
        setUploadingAvatar(true);
        const uploaded = await uploadPatientStorageAsset(
          firebaseUser,
          'avatars',
          pendingAvatarFile,
        );
        nextAvatarUrl = uploaded.url;
        nextAvatarPath = uploaded.storagePath || '';
        setAvatarUrl(nextAvatarUrl);
        setAvatarPath(nextAvatarPath);
        clearPendingAvatar();
      }

      let normalizedPhone = phone.trim();
      if (normalizedPhone) {
        const parsedPhone = parseAndNormalizeIraqiPhone(normalizedPhone);
        if (!parsedPhone.ok) {
          setErrorMsg(getIraqiPhoneValidationMessage(parsedPhone.errorCode, language));
          setSaving(false);
          return;
        }
        normalizedPhone = parsedPhone.e164;
        setPhone(normalizedPhone);
      }

      const parsedEmergency = emergencyContactPhone.trim()
        ? parseAndNormalizeIraqiPhone(emergencyContactPhone.trim())
        : null;
      const normalizedEmergencyPhone =
        parsedEmergency && parsedEmergency.ok
          ? parsedEmergency.e164
          : emergencyContactPhone.trim();

      const expiryNum = Number(defaultShareExpiryDays);
      const saved = await savePatientSettings(firebaseUser, {
        fullName: fullName.trim(),
        phone: normalizedPhone,
        dateOfBirth,
        gender,
        governorate: selectedGovObj
          ? language === 'ar'
            ? selectedGovObj.ar
            : selectedGovObj.en
          : governorate,
        district: district.trim(),
        address: address.trim(),
        avatarUrl: nextAvatarUrl,
        avatarPath: nextAvatarPath,
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: normalizedEmergencyPhone,
        emergencyContactRelation: emergencyContactRelation.trim(),
        preferences: {
          notifications: notifPrefs,
          privacy: {
            allowDoctorSearchByPhone,
            defaultShareExpiryDays:
              defaultShareExpiryDays && Number.isFinite(expiryNum) && expiryNum > 0
                ? expiryNum
                : null,
          },
        },
      });
      setUserAccount(saved.userAccount);
      await onRefreshWorkspace();
      setSavedMsg(ps.savedMsg);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingAvatar(false);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {ps.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {ps.subtitle}
        </p>
      </div>

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Profile & Emergency Contact */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-2">
          <UserIcon
            className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
            aria-hidden="true"
          />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {ps.profileSection}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {pendingPreviewUrl || avatarUrl ? (
            <img
              src={pendingPreviewUrl || avatarUrl}
              alt={fullName}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-2xl border border-[#d9a43b]/50 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900">
              <UserIcon className="h-7 w-7 text-slate-400" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-4 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{uploadingAvatar ? '...' : ps.uploadAvatarBtn}</span>
              <input
                type="file"
                accept="image/*,.heic,.heif"
                className="hidden"
                onChange={(e) => {
                  handleAvatarSelect(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {pendingPreviewUrl && (
              <>
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {ps.previewReadyLabel}
                </span>
                <button
                  type="button"
                  onClick={clearPendingAvatar}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  aria-label="Cancel preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.fullNameLabel}
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.phoneLabel}
            </label>
            <input
              type="tel"
              required
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.dobLabel}
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.genderLabel}
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as GenderType)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="male">{language === 'ar' ? 'ذكر' : 'Male'}</option>
              <option value="female">{language === 'ar' ? 'أنثى' : 'Female'}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.governorateLabel}
            </label>
            <select
              value={selectedGovObj.id}
              onChange={(e) => {
                setGovernorate(e.target.value);
                setDistrict('');
              }}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {IRAQ_GOVERNORATES.map((gov) => (
                <option key={gov.id} value={gov.id}>
                  {language === 'ar' ? gov.ar : gov.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.districtLabel}
            </label>
            <select
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">{district || '—'}</option>
              {selectedGovObj.districts.map((d) => (
                <option key={d.en} value={language === 'ar' ? d.ar : d.en}>
                  {language === 'ar' ? d.ar : d.en}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.addressLabel}
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {ps.emergencySection}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ps.emergencyNameLabel}
              </label>
              <input
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ps.emergencyPhoneLabel}
              </label>
              <input
                type="tel"
                dir="ltr"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {ps.emergencyRelationLabel}
              </label>
              <input
                type="text"
                value={emergencyContactRelation}
                onChange={(e) => setEmergencyContactRelation(e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>
        </div>

        <IraqiPhoneVerificationCard
          firebaseUser={firebaseUser}
          language={language}
          currentPhone={phone}
          onPhoneVerified={(e164) => {
            setPhone(e164);
            void onRefreshWorkspace();
          }}
          onPhoneUnlinked={() => {
            setPhone('');
            void onRefreshWorkspace();
          }}
        />
      </div>

      {/* Appearance */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {ps.appearanceSection}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={toggleLanguage}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            {ps.languageLabel}: {language === 'ar' ? 'العربية' : 'English'}
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 px-4 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            {ps.themeLabel}: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </div>
      </div>

      {/* Notifications & Privacy */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2">
            <BellRing
              className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
              aria-hidden="true"
            />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {ps.notificationsSection}
            </h2>
          </div>

          {(
            [
              ['appointments', ps.notifAppointments],
              ['reminders24h', ps.notifReminders24h],
              ['messages', ps.notifMessages],
              ['results', ps.notifResults],
              ['announcements', ps.notifAnnouncements],
            ] as Array<[keyof PatientNotificationPreferences, string]>
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-[40px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={notifPrefs[key]}
                onChange={(e) =>
                  setNotifPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                }
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center gap-2">
            <Shield
              className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
              aria-hidden="true"
            />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {ps.privacySection}
            </h2>
          </div>

          <label className="flex min-h-[42px] items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={allowDoctorSearchByPhone}
              onChange={(e) => setAllowDoctorSearchByPhone(e.target.checked)}
              className="h-4 w-4 accent-[#0c3585]"
            />
            <span>{ps.allowDoctorSearchByPhone}</span>
          </label>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {ps.defaultShareExpiryLabel}
            </label>
            <select
              value={defaultShareExpiryDays}
              onChange={(e) => setDefaultShareExpiryDays(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">{pm.noExpiry}</option>
              <option value="7">7 {pm.expiryDaysOption}</option>
              <option value="30">30 {pm.expiryDaysOption}</option>
              <option value="90">90 {pm.expiryDaysOption}</option>
            </select>
          </div>

          <button
            type="button"
            onClick={onOpenSharingTab}
            className="min-h-[40px] w-full rounded-xl border border-[#0c3585] px-4 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/5 dark:border-[#f4d378] dark:text-[#f4d378] cursor-pointer"
          >
            {ps.manageSharesBtn}
          </button>
        </div>
      </div>

      <NotificationChannelCard
        firebaseUser={firebaseUser}
        role="patient"
        language={language}
        linkedPhoneOverride={phone}
      />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="medora-gold-button min-h-[46px] rounded-xl px-8 text-sm font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
        >
          {saving ? ps.savingBtn : ps.saveBtn}
        </button>
      </div>
    </form>
  );
}
