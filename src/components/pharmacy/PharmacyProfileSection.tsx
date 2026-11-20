import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import { updatePharmacyProfile, uploadPharmacyMedia } from '../../services/pharmacyService';
import type { Language } from '../../types/medora';
import type { PharmacyWorkspaceData } from '../../types/pharmacy';
import {
  formatIqd,
  PharmacyLogoAvatar,
  preparePharmacyImageUpload,
} from './PharmacyBrandUtils';

export function PharmacyProfileSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const prof = workspace.pharmacyProfile;

  const [pharmacyNameAr, setPharmacyNameAr] = useState(prof.pharmacyNameAr || '');
  const [pharmacyNameEn, setPharmacyNameEn] = useState(prof.pharmacyNameEn || '');
  const [professionalPhone, setProfessionalPhone] = useState(prof.professionalPhone || '');
  const [governorate, setGovernorate] = useState(prof.governorate || '');
  const [district, setDistrict] = useState(prof.district || '');
  const [address, setAddress] = useState(prof.address || '');
  const [mapLocationUrl, setMapLocationUrl] = useState(prof.mapLocationUrl || '');
  const [workingDaysAndHours, setWorkingDaysAndHours] = useState(
    prof.workingDaysAndHours || '09:00 - 23:00',
  );
  const [is24Hours, setIs24Hours] = useState(Boolean(prof.is24Hours));
  const [deliveryAvailable, setDeliveryAvailable] = useState(Boolean(prof.deliveryAvailable));
  const [pickupAvailable, setPickupAvailable] = useState(prof.pickupAvailable !== false);
  const [minimumOrderIqd, setMinimumOrderIqd] = useState(String(prof.minimumOrderIqd || 0));
  const [taglineAr, setTaglineAr] = useState(prof.taglineAr || '');
  const [taglineEn, setTaglineEn] = useState(prof.taglineEn || '');
  const [aboutAr, setAboutAr] = useState(prof.aboutAr || '');
  const [aboutEn, setAboutEn] = useState(prof.aboutEn || '');
  const [publicSlug, setPublicSlug] = useState(prof.publicSlug || prof.uid || '');

  const [logoUrl, setLogoUrl] = useState(prof.logoUrl || '');
  const [logoPath, setLogoPath] = useState(prof.logoPath || '');
  const [coverImageUrl, setCoverImageUrl] = useState(prof.coverImageUrl || '');
  const [coverImagePath, setCoverImagePath] = useState(prof.coverImagePath || '');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleImagePick = async (
    e: ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'cover',
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    if (target === 'logo') setUploadingLogo(true);
    else setUploadingCover(true);
    try {
      const prepared = await preparePharmacyImageUpload(file, target === 'logo' ? 600 : 1400);
      const uploaded = await uploadPharmacyMedia(firebaseUser, prepared);
      if (target === 'logo') {
        setLogoUrl(uploaded.file.url);
        setLogoPath(uploaded.file.storagePath);
      } else {
        setCoverImageUrl(uploaded.file.url);
        setCoverImagePath(uploaded.file.storagePath);
      }
      setNotice(
        isAr
          ? 'تم رفع الصورة بنجاح. اضغط "حفظ ملف الصيدلية" لتثبيتها على الواجهة العامة.'
          : 'Image uploaded. Click "Save Pharmacy Profile" to publish changes.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MEDIA_UPLOAD_FAILED');
    } finally {
      setUploadingLogo(false);
      setUploadingCover(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await updatePharmacyProfile(firebaseUser, {
        pharmacyNameAr: pharmacyNameAr.trim(),
        pharmacyNameEn: pharmacyNameEn.trim(),
        professionalPhone: professionalPhone.trim(),
        governorate: governorate.trim(),
        district: district.trim(),
        address: address.trim(),
        mapLocationUrl: mapLocationUrl.trim(),
        workingDaysAndHours: workingDaysAndHours.trim(),
        is24Hours,
        deliveryAvailable,
        pickupAvailable,
        minimumOrderIqd: Number(minimumOrderIqd || 0),
        logoUrl,
        logoPath,
        coverImageUrl,
        coverImagePath,
        taglineAr: taglineAr.trim(),
        taglineEn: taglineEn.trim(),
        aboutAr: aboutAr.trim(),
        aboutEn: aboutEn.trim(),
        publicSlug: publicSlug.trim(),
      });
      await onRefresh();
      setNotice(
        isAr
          ? 'تم تحديث الهوية البصرية وملف الصيدلية بنجاح.'
          : 'Pharmacy branding and storefront profile updated.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UPDATE_PROFILE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live Storefront Header Preview Card */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        <div className="relative h-36 w-full bg-gradient-to-r from-[#061028] via-[#0c3585] to-[#1346ad]">
          {coverImageUrl && (
            <img
              src={coverImageUrl}
              alt={pharmacyNameAr}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 pb-5">
          <div className="-mt-8 flex items-end gap-4">
            <PharmacyLogoAvatar
              logoUrl={logoUrl}
              name={isAr ? pharmacyNameAr : pharmacyNameEn || pharmacyNameAr}
              sizeClass="h-20 w-20 ring-4 ring-white dark:ring-[#07122a]"
            />
            <div className="pt-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {isAr ? 'معاينة بطاقة الصيدلية للمرضى والأطباء' : 'Live Partner Card Preview'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {isAr ? pharmacyNameAr : pharmacyNameEn || pharmacyNameAr}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {(isAr ? taglineAr : taglineEn) || `${governorate} · ${district} · ${address}`}
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            <span>{is24Hours ? (isAr ? 'مفتوح 24 ساعة' : '24 Hours') : workingDaysAndHours}</span>
            <span> · </span>
            <span>{isAr ? `الحد الأدنى: ${formatIqd(Number(minimumOrderIqd || 0), isAr)}` : `Min: ${formatIqd(Number(minimumOrderIqd || 0), isAr)}`}</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <form
          onSubmit={handleSave}
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-8"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Store className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'الهوية البصرية ومعلومات الواجهة العامة' : 'Branding & Public Storefront Details'}
            </h3>
          </div>

          {/* Media Uploaders */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#030712]">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? 'شعار الصيدلية (Logo)' : 'Pharmacy Logo'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">PNG, JPG, WebP</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer">
                  {uploadingLogo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{isAr ? 'رفع شعار' : 'Upload Logo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!canManage || uploadingLogo}
                    onChange={(e) => void handleImagePick(e, 'logo')}
                    className="hidden"
                  />
                </label>
                {logoUrl && (
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      setLogoUrl('');
                      setLogoPath('');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إزالة' : 'Remove'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-[#030712]">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {isAr ? 'صورة غلاف الواجهة (Cover Banner)' : 'Storefront Cover Photo'}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">1200×400 recommended</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer">
                  {uploadingCover ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-3.5 w-3.5" />
                  )}
                  <span>{isAr ? 'رفع غلاف' : 'Upload Cover'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={!canManage || uploadingCover}
                    onChange={(e) => void handleImagePick(e, 'cover')}
                    className="hidden"
                  />
                </label>
                {coverImageUrl && (
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => {
                      setCoverImageUrl('');
                      setCoverImagePath('');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:text-rose-600 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'إزالة' : 'Remove'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Names & Tagline */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'اسم الصيدلية بالعربية *' : 'Pharmacy Name (Arabic) *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={pharmacyNameAr}
                onChange={(e) => setPharmacyNameAr(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'اسم الصيدلية بالإنجليزية *' : 'Pharmacy Name (English) *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={pharmacyNameEn}
                onChange={(e) => setPharmacyNameEn(e.target.value)}
                dir="ltr"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'الشعار اللفظي القصير (عربي)' : 'Tagline (Arabic)'}
              </label>
              <input
                disabled={!canManage}
                value={taglineAr}
                onChange={(e) => setTaglineAr(e.target.value)}
                placeholder={isAr ? 'رعاية صيدلانية موثوقة وتوصيل سريع' : 'Trusted care...'}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'الشعار اللفظي القصير (إنجليزي)' : 'Tagline (English)'}
              </label>
              <input
                disabled={!canManage}
                value={taglineEn}
                onChange={(e) => setTaglineEn(e.target.value)}
                dir="ltr"
                placeholder="Trusted Pharmaceutical Care"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'نبذة عن الصيدلية والخدمات (عربي)' : 'About Pharmacy (Arabic)'}
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={aboutAr}
                onChange={(e) => setAboutAr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'نبذة عن الصيدلية (إنجليزي)' : 'About Pharmacy (English)'}
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={aboutEn}
                onChange={(e) => setAboutEn(e.target.value)}
                dir="ltr"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          {/* Contact, Location & Slug */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'هاتف الصيدلية *' : 'Phone *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={professionalPhone}
                onChange={(e) => setProfessionalPhone(e.target.value)}
                dir="ltr"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'المحافظة *' : 'Governorate *'}
              </label>
              <select
                disabled={!canManage}
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                {IRAQ_GOVERNORATES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {isAr ? g.ar : g.en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'القضاء / المنطقة *' : 'District *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'العنوان التفصيلي *' : 'Street Address *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'معرّف الرابط المخصص (Slug)' : 'Public Storefront Slug'}
              </label>
              <input
                disabled={!canManage}
                value={publicSlug}
                onChange={(e) => setPublicSlug(e.target.value)}
                dir="ltr"
                placeholder="al-shifa-pharmacy"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          {/* Hours & Services */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'أوقات الدوام *' : 'Operating Hours *'}
              </label>
              <input
                required
                disabled={!canManage}
                value={workingDaysAndHours}
                onChange={(e) => setWorkingDaysAndHours(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'الحد الأدنى للطلب (د.ع)' : 'Minimum Order (IQD)'}
              </label>
              <input
                type="number"
                min={0}
                disabled={!canManage}
                value={minimumOrderIqd}
                onChange={(e) => setMinimumOrderIqd(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'رابط الخريطة (اختياري)' : 'Map Link (Optional)'}
              </label>
              <input
                disabled={!canManage}
                value={mapLocationUrl}
                onChange={(e) => setMapLocationUrl(e.target.value)}
                dir="ltr"
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold dark:bg-[#030712]">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={is24Hours}
                onChange={(e) => setIs24Hours(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{isAr ? 'خدمة 24 ساعة' : 'Open 24 Hours'}</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={pickupAvailable}
                onChange={(e) => setPickupAvailable(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{isAr ? 'استلام من الصيدلية' : 'In-Pharmacy Pickup'}</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={deliveryAvailable}
                onChange={(e) => setDeliveryAvailable(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{isAr ? 'خدمة التوصيل المنزلي' : 'Home Delivery'}</span>
            </label>
          </div>

          {canManage && (
            <button
              type="submit"
              disabled={saving}
              className="medora-gold-button inline-flex min-h-[44px] items-center gap-2 rounded-xl px-6 text-xs font-bold text-[#040917] shadow-xs transition disabled:opacity-50 cursor-pointer"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{saving ? '...' : isAr ? 'حفظ ملف الصيدلية' : 'Save Pharmacy Profile'}</span>
            </button>
          )}
        </form>

        {/* Read-Only Official Licensing Panel */}
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <ShieldCheck className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'بيانات الترخيص الرسمي المعتمدة' : 'Official Licensing & Verification'}
            </h3>
          </div>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {isAr
              ? 'هذه الحقول موثقة من قبل الإدارة العليا لـ MEDORA ولا يمكن تعديلها ذاتياً لضمان موثوقية الصيدليات للمرضى والأطباء.'
              : 'Verified by MEDORA Governance. Official licensing details remain read-only for clinical integrity.'}
          </p>

          <dl className="space-y-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
              <dt className="text-slate-500">{isAr ? 'حالة الاعتماد' : 'Verification Status'}</dt>
              <dd className="mt-0.5 font-bold text-[#0c3585] dark:text-[#f4d378]">
                {pt.statuses[prof.status] || prof.status}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
              <dt className="text-slate-500">{isAr ? 'الصيدلاني المسؤول' : 'Responsible Pharmacist'}</dt>
              <dd className="mt-0.5 font-bold text-slate-900 dark:text-white">
                {prof.responsiblePharmacistName}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
              <dt className="text-slate-500">{isAr ? 'رقم إجازة الصيدلية' : 'Pharmacy License #'}</dt>
              <dd className="mt-0.5 font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                {prof.pharmacyLicenseNumber}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
              <dt className="text-slate-500">{isAr ? 'رقم هوية النقابة' : 'Syndicate ID'}</dt>
              <dd className="mt-0.5 font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                {prof.pharmacistSyndicateNumber}
              </dd>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
              <dt className="text-slate-500">{isAr ? 'الجهة المانحة' : 'Licensing Authority'}</dt>
              <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                {prof.licensingAuthority}
              </dd>
            </div>
            {prof.licenseExpiryDate && (
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'انتهاء الإجازة' : 'License Expiry'}</dt>
                <dd className="mt-0.5 font-latin font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  {prof.licenseExpiryDate}
                </dd>
              </div>
            )}
          </dl>

          {mapLocationUrl && (
            <div className="flex items-center gap-2 pt-2 text-xs text-[#0c3585] dark:text-[#f4d378]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate font-latin" dir="ltr">
                {mapLocationUrl}
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
