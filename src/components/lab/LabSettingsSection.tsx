import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Building2,
  CalendarClock,
  FileCheck2,
  FileUp,
  ImagePlus,
  Info,
  Save,
  Trash2,
} from 'lucide-react';
import type { Language, UploadedDocMeta } from '../../types/medora';
import type { LabWorkspaceData } from '../../types/lab';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { labTranslations } from '../../i18n/labTranslations';
import { updateLabSettings, uploadLabPrivateFile } from '../../services/labService';
import { ProtectedMediaButton, ProtectedMediaImage } from '../shared/ProtectedMedia';

interface LabSettingsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  onRefresh: () => Promise<void>;
}

export const LabSettingsSection: React.FC<LabSettingsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';
  const p = workspace.labProfile;

  const [labNameAr, setLabNameAr] = useState(p.labNameAr || '');
  const [labNameEn, setLabNameEn] = useState(p.labNameEn || '');
  const [directorName, setDirectorName] = useState(p.directorName || '');
  const [technicalDirectorName, setTechnicalDirectorName] = useState(p.technicalDirectorName || '');
  const [professionalPhone, setProfessionalPhone] = useState(p.professionalPhone || '');
  const [governorate, setGovernorate] = useState(p.governorate || '');
  const [district, setDistrict] = useState(p.district || '');
  const [address, setAddress] = useState(p.address || '');
  const [mapLocationUrl, setMapLocationUrl] = useState(p.mapLocationUrl || '');
  const [workDaysAndHours, setWorkDaysAndHours] = useState(p.workDaysAndHours || '');

  const [hourlyBookingLimit, setHourlyBookingLimit] = useState(String(p.hourlyBookingLimit || 6));
  const [bookingConfirmationMode, setBookingConfirmationMode] = useState<'manual' | 'auto'>(
    p.bookingConfirmationMode === 'auto' ? 'auto' : 'manual',
  );
  const [homeCollectionEnabled, setHomeCollectionEnabled] = useState(p.homeCollectionEnabled !== false);
  const [homeCollectionFeeIqd, setHomeCollectionFeeIqd] = useState(String(p.homeCollectionFeeIqd || 0));

  const [licenseNumber, setLicenseNumber] = useState(p.licenseNumber || '');
  const [licensingAuthority, setLicensingAuthority] = useState(p.licensingAuthority || '');
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(p.licenseExpiryDate || '');
  const [licenseDocuments, setLicenseDocuments] = useState<UploadedDocMeta[]>(p.licenseDocuments || []);
  const [managerAvatarUrl, setManagerAvatarUrl] = useState(p.managerAvatarUrl || '');
  const [avatarPath, setAvatarPath] = useState(p.avatarPath || '');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const availableDistricts = useMemo(() => {
    const gov = IRAQ_GOVERNORATES.find(
      (g) => g.ar === governorate || g.en === governorate || g.id === governorate,
    );
    return gov?.districts || [];
  }, [governorate]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const uploaded = await uploadLabPrivateFile(firebaseUser, 'avatars', file);
      setManagerAvatarUrl(uploaded.url);
      setAvatarPath(uploaded.storagePath || '');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPLOAD_FAILED');
    } finally {
      setUploading(false);
    }
  };

  const handleLicenseDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const uploaded = await uploadLabPrivateFile(firebaseUser, 'lab_files', file);
      setLicenseDocuments((prev) => [...prev, uploaded]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPLOAD_FAILED');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg('');
    setErrorMsg('');
    try {
      await updateLabSettings(firebaseUser, {
        labNameAr: labNameAr.trim(),
        labNameEn: labNameEn.trim(),
        directorName: directorName.trim(),
        technicalDirectorName: technicalDirectorName.trim(),
        professionalPhone: professionalPhone.trim(),
        governorate: governorate.trim(),
        district: district.trim(),
        address: address.trim(),
        mapLocationUrl: mapLocationUrl.trim(),
        workDaysAndHours: workDaysAndHours.trim(),
        hourlyBookingLimit: Math.max(1, Number(hourlyBookingLimit || 6)),
        bookingConfirmationMode,
        homeCollectionEnabled,
        homeCollectionFeeIqd: Math.max(0, Number(homeCollectionFeeIqd || 0)),
        licenseNumber: licenseNumber.trim(),
        licensingAuthority: licensingAuthority.trim(),
        licenseExpiryDate: licenseExpiryDate.trim(),
        licenseDocuments,
        managerAvatarUrl,
        avatarPath,
      });
      await onRefresh();
      setSavedMsg(isAr ? 'تم حفظ إعدادات وتراخيص المختبر بنجاح' : 'Lab settings & licenses saved');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.settings.title}</h2>
        </div>
        <button
          type="submit"
          disabled={saving || uploading}
          className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? lt.common.saving : lt.common.save}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}
      {savedMsg && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
          {savedMsg}
        </div>
      )}

      {/* 1. General & Location */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Building2 className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
          <span>{lt.settings.generalSection}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="h-16 w-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
            {managerAvatarUrl ? (
              <ProtectedMediaImage
                firebaseUser={firebaseUser}
                url={managerAvatarUrl}
                alt={labNameAr}
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-7 w-7 text-slate-400" />
            )}
          </div>
          <label className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 inline-flex items-center gap-2 font-bold text-[#0c3585] dark:text-blue-400 cursor-pointer hover:border-[#0c3585]">
            <ImagePlus className="h-4 w-4" />
            <span>{lt.settings.uploadAvatar}</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'اسم المختبر (عربي)' : 'Lab Name (Arabic)'}</label>
            <input
              required
              value={labNameAr}
              onChange={(e) => setLabNameAr(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'اسم المختبر (إنجليزي)' : 'Lab Name (English)'}</label>
            <input
              value={labNameEn}
              onChange={(e) => setLabNameEn(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'المدير المفوض' : 'Director Name'}</label>
            <input
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'المدير الفني' : 'Technical Director'}</label>
            <input
              value={technicalDirectorName}
              onChange={(e) => setTechnicalDirectorName(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{lt.common.phone}</label>
            <input
              value={professionalPhone}
              onChange={(e) => setProfessionalPhone(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'أيام وساعات العمل' : 'Working Days & Hours'}</label>
            <input
              value={workDaysAndHours}
              onChange={(e) => setWorkDaysAndHours(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'المحافظة' : 'Governorate'}</label>
            <select
              value={governorate}
              onChange={(e) => {
                setGovernorate(e.target.value);
                setDistrict('');
              }}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            >
              <option value="">—</option>
              {IRAQ_GOVERNORATES.map((g) => (
                <option key={g.id} value={g.ar}>
                  {isAr ? g.ar : g.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'القضاء / المنطقة' : 'District'}</label>
            {availableDistricts.length > 0 ? (
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
              >
                <option value="">—</option>
                {availableDistricts.map((d) => (
                  <option key={d.en} value={d.ar}>
                    {isAr ? d.ar : d.en}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
              />
            )}
          </div>
          <div>
            <label className="block font-semibold mb-1">{lt.patients.address}</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'رابط الموقع (Google Maps)' : 'Map Location URL'}</label>
            <input
              value={mapLocationUrl}
              onChange={(e) => setMapLocationUrl(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* 2. Bookings & Home Collection */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <CalendarClock className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
          <span>{lt.settings.bookingSection}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block font-semibold mb-1">
              {isAr ? 'الحد الأقصى للحجوزات بالساعة' : 'Hourly Booking Limit'}
            </label>
            <input
              type="number"
              min="1"
              value={hourlyBookingLimit}
              onChange={(e) => setHourlyBookingLimit(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'وضع تأكيد الحجز' : 'Booking Confirmation Mode'}</label>
            <select
              value={bookingConfirmationMode}
              onChange={(e) => setBookingConfirmationMode(e.target.value === 'auto' ? 'auto' : 'manual')}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            >
              <option value="manual">{isAr ? 'موافقة يدوية من الاستقبال' : 'Manual Confirmation'}</option>
              <option value="auto">{isAr ? 'تأكيد تلقائي فوري' : 'Auto Confirm'}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200 pt-2">
            <input
              type="checkbox"
              checked={homeCollectionEnabled}
              onChange={(e) => setHomeCollectionEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>{lt.settings.homeCollectionEnabled}</span>
          </label>
          <div>
            <label className="block font-semibold mb-1">{lt.settings.homeCollectionFee}</label>
            <input
              type="number"
              min="0"
              value={homeCollectionFeeIqd}
              onChange={(e) => setHomeCollectionFeeIqd(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* 3. Licenses & Documents */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <FileCheck2 className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
          <span>{lt.settings.licenseSection}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'رقم الإجازة / الترخيص' : 'License Number'}</label>
            <input
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'جهة الإصدار' : 'Licensing Authority'}</label>
            <input
              value={licensingAuthority}
              onChange={(e) => setLicensingAuthority(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isAr ? 'تاريخ انتهاء الإجازة' : 'License Expiry Date'}</label>
            <input
              type="date"
              value={licenseExpiryDate}
              onChange={(e) => setLicenseExpiryDate(e.target.value)}
              className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="min-h-[40px] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3.5 inline-flex items-center gap-2 font-bold text-[#0c3585] dark:text-blue-400 cursor-pointer">
            <FileUp className="h-4 w-4" />
            <span>{lt.settings.uploadLicense}</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleLicenseDocUpload}
              disabled={uploading}
              className="sr-only"
            />
          </label>

          {licenseDocuments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {licenseDocuments.map((doc, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
                >
                  <ProtectedMediaButton
                    firebaseUser={firebaseUser}
                    url={doc.url}
                    fileName={doc.name}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-300"
                  />
                  <button
                    type="button"
                    onClick={() => setLicenseDocuments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-rose-500 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 4. Read-Only Deferred Subscriptions Notice */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-4 flex items-start gap-3 text-xs">
        <Info className="h-4 w-4 text-[#0c3585] dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-slate-900 dark:text-white">{lt.settings.deferredNoticeTitle}</div>
          <p className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">{lt.settings.deferredNoticeBody}</p>
        </div>
      </div>
    </form>
  );
};
