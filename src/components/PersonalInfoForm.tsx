import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Upload, User } from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../constants/iraqLocations';
import { useMedora } from '../contexts/MedoraContext';
import {
  calculateAgeFromDob,
  savePersonalProfile,
  uploadMedoraFile,
} from '../services/medoraFirestore';
import type { GenderType, PersonalProfileInput } from '../types/medora';
import { mapUploadErrorMessage } from '../utils/imagePreparation';
import {
  getIraqiPhoneValidationMessage,
  parseAndNormalizeIraqiPhone,
} from '../utils/iraqiPhone';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';
import { IraqiPhoneVerificationCard } from './shared/IraqiPhoneVerificationCard';

interface PersonalInfoFormProps {
  onSaved: () => void;
  onCancelEdit?: () => void;
  onBackToPortals?: () => void;
}

export function PersonalInfoForm({
  onSaved,
  onCancelEdit,
  onBackToPortals,
}: PersonalInfoFormProps) {
  const { language, t, firebaseUser, userAccount, setUserAccount, portalIntent } =
    useMedora();

  const [fullName, setFullName] = useState(
    userAccount?.fullName || userAccount?.googleName || firebaseUser?.displayName || '',
  );
  const [dateOfBirth, setDateOfBirth] = useState(userAccount?.dateOfBirth || '');
  const [gender, setGender] = useState<GenderType | ''>(
    userAccount?.gender === 'male' || userAccount?.gender === 'female'
      ? userAccount.gender
      : '',
  );
  const [governorate, setGovernorate] = useState(userAccount?.governorate || '');
  const [district, setDistrict] = useState(userAccount?.district || '');
  const [address, setAddress] = useState(userAccount?.address || '');
  const [phone, setPhone] = useState(userAccount?.phone || '');
  const [avatarUrl, setAvatarUrl] = useState(
    userAccount?.avatarUrl || userAccount?.photoUrl || firebaseUser?.photoURL || '',
  );
  const [avatarPath, setAvatarPath] = useState(userAccount?.avatarPath || '');
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  }, [previewObjectUrl]);

  const computedAge = useMemo(
    () => calculateAgeFromDob(dateOfBirth),
    [dateOfBirth],
  );

  const selectedGovObj = useMemo(
    () =>
      IRAQ_GOVERNORATES.find(
        (g) => g.ar === governorate || g.en === governorate || g.id === governorate,
      ),
    [governorate],
  );

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !firebaseUser) return;
    setError(null);
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
    }
    const localPreview = URL.createObjectURL(file);
    setPreviewObjectUrl(localPreview);
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadMedoraFile(firebaseUser, 'avatars', file);
      setAvatarUrl(uploaded.url);
      setAvatarPath(uploaded.storagePath || '');
      URL.revokeObjectURL(localPreview);
      setPreviewObjectUrl(null);
    } catch (err) {
      URL.revokeObjectURL(localPreview);
      setPreviewObjectUrl(null);
      setError(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !userAccount) return;
    setError(null);

    if (fullName.trim().length < 3) {
      setError(t.personal.errors.fullName);
      return;
    }
    if (!dateOfBirth) {
      setError(t.personal.errors.dob);
      return;
    }
    if (!gender) {
      setError(t.personal.errors.gender);
      return;
    }
    if (!governorate.trim()) {
      setError(t.personal.errors.governorate);
      return;
    }
    if (!district.trim()) {
      setError(t.personal.errors.district);
      return;
    }
    if (address.trim().length < 3) {
      setError(t.personal.errors.address);
      return;
    }

    let normalizedPhone = phone.trim();
    if (normalizedPhone) {
      const parsedPhone = parseAndNormalizeIraqiPhone(normalizedPhone);
      if (!parsedPhone.ok) {
        setError(getIraqiPhoneValidationMessage(parsedPhone.errorCode, language));
        return;
      }
      normalizedPhone = parsedPhone.e164;
    }

    const input: PersonalProfileInput = {
      fullName: fullName.trim(),
      dateOfBirth,
      age: computedAge,
      gender,
      governorate: governorate.trim(),
      district: district.trim(),
      address: address.trim(),
      phone: normalizedPhone,
      avatarUrl: avatarUrl.trim(),
      avatarPath: avatarPath.trim(),
    };

    setSaving(true);
    try {
      const updated = await savePersonalProfile(
        firebaseUser.uid,
        userAccount,
        input,
      );
      setUserAccount(updated);
      onSaved();
    } catch (err) {
      console.error(err);
      setError(
        language === 'ar'
          ? 'حدث خطأ أثناء حفظ البيانات الشخصية في قاعدة البيانات.'
          : 'An error occurred while saving personal information.',
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar
        showRequestsAction
        onBackToPortals={onBackToPortals}
      />

      <main className="relative z-10 mx-auto my-8 w-full max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur-xl dark:border-[#d9a43b]/20 dark:bg-[#07122a]/90 sm:p-8">
          <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                {t.personal.stepLabel}
              </p>
              {portalIntent && portalIntent !== 'super_admin' && (
                <span className="rounded-lg border border-[#d9a43b]/40 bg-[#d9a43b]/10 px-2.5 py-1 text-xs font-semibold text-[#8c5d0b] dark:text-[#f4d378]">
                  {t.auth.selectedPortalLabel}: {t.portals.items[portalIntent].title}
                </span>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t.personal.title}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {t.personal.subtitle}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t.personal.googleLinkedHint} · {t.personal.noNationalIdNote}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5">
            {/* Optional Profile Avatar */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#040a1a]/60">
              {previewObjectUrl || avatarUrl ? (
                <img
                  src={previewObjectUrl || avatarUrl}
                  alt={fullName || 'Avatar'}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 rounded-full border-2 border-[#d9a43b]/50 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-300 bg-slate-200 dark:border-slate-700 dark:bg-slate-800">
                  <User className="h-7 w-7 text-slate-500" />
                </div>
              )}

              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t.personal.avatar}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({t.common.optional})
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.personal.avatarHint}
                </p>
              </div>

              <label className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {uploadingAvatar ? t.common.uploading : t.common.uploadFile}
                </span>
                <input
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={(e) => void handleAvatarUpload(e)}
                  disabled={uploadingAvatar}
                  className="sr-only"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="personal-fullname"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.fullName} *
                </label>
                <input
                  id="personal-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="personal-dob"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.dateOfBirth} *
                </label>
                <input
                  id="personal-dob"
                  type="date"
                  required
                  max={new Date().toISOString().split('T')[0]}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="personal-age"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.age}
                </label>
                <input
                  id="personal-age"
                  type="text"
                  readOnly
                  value={
                    dateOfBirth ? `${computedAge} ${t.common.years}` : '—'
                  }
                  className={`${inputClass} bg-slate-100 tabular-nums dark:bg-slate-900/70`}
                />
              </div>

              <div>
                <label
                  htmlFor="personal-gender"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.gender} *
                </label>
                <select
                  id="personal-gender"
                  required
                  value={gender}
                  onChange={(e) => setGender(e.target.value as GenderType | '')}
                  className={inputClass}
                >
                  <option value="">{t.common.selectOption}</option>
                  <option value="male">{t.common.male}</option>
                  <option value="female">{t.common.female}</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="personal-phone"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.phone}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({t.common.optional})
                  </span>
                </label>
                <input
                  id="personal-phone"
                  type="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => {
                    const p = parseAndNormalizeIraqiPhone(phone);
                    if (p.ok) setPhone(p.e164);
                  }}
                  placeholder="0770 123 4567 / +9647701234567"
                  className={`${inputClass} text-left`}
                />
              </div>

              {firebaseUser && (
                <div className="sm:col-span-2">
                  <IraqiPhoneVerificationCard
                    firebaseUser={firebaseUser}
                    language={language}
                    currentPhone={phone}
                    compact
                    onPhoneVerified={(e164) => {
                      setPhone(e164);
                      if (userAccount) {
                        setUserAccount({ ...userAccount, phone: e164 });
                      }
                    }}
                    onPhoneUnlinked={() => {
                      setPhone('');
                      if (userAccount) {
                        setUserAccount({ ...userAccount, phone: '' });
                      }
                    }}
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="personal-gov"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.governorate} *
                </label>
                <select
                  id="personal-gov"
                  required
                  value={governorate}
                  onChange={(e) => {
                    setGovernorate(e.target.value);
                    setDistrict('');
                  }}
                  className={inputClass}
                >
                  <option value="">{t.common.selectOption}</option>
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option
                      key={g.id}
                      value={language === 'ar' ? g.ar : g.en}
                    >
                      {language === 'ar' ? g.ar : g.en}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="personal-district"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.district} *
                </label>
                {selectedGovObj ? (
                  <select
                    id="personal-district"
                    required
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">{t.common.selectOption}</option>
                    {selectedGovObj.districts.map((d) => (
                      <option
                        key={d.en}
                        value={language === 'ar' ? d.ar : d.en}
                      >
                        {language === 'ar' ? d.ar : d.en}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="personal-district"
                    type="text"
                    required
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className={inputClass}
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="personal-address"
                  className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  {t.personal.address} *
                </label>
                <input
                  id="personal-address"
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
              {onCancelEdit && (
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="min-h-[46px] rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t.common.cancel}
                </button>
              )}
              <button
                type="submit"
                disabled={saving || uploadingAvatar}
                className="medora-gold-button min-h-[48px] rounded-xl px-7 py-3 text-sm font-bold text-[#040917] transition-all disabled:opacity-60 cursor-pointer"
              >
                {saving ? t.common.loading : t.common.saveAndContinue}
              </button>
            </div>
          </form>
        </div>
      </main>
    </motion.section>
  );
}
