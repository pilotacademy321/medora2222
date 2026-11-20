import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Copy,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  createPharmacySpecialOffer,
  deletePharmacySpecialOffer,
  submitPharmacyCampaignRequest,
  updatePharmacyMarketing,
  uploadPharmacyMedia,
} from '../../services/pharmacyService';
import type { Language } from '../../types/medora';
import type { PharmacyWorkspaceData } from '../../types/pharmacy';
import {
  buildPublicStorefrontUrl,
  PharmacyQrCodeCanvas,
  preparePharmacyImageUpload,
} from './PharmacyBrandUtils';

export function PharmacyMarketingSection({
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
  const prof = workspace.pharmacyProfile;
  const shareUrl = buildPublicStorefrontUrl(prof.publicSlug || prof.uid);

  const [bannerTitleAr, setBannerTitleAr] = useState(prof.promotionalBannerTitleAr || '');
  const [bannerTitleEn, setBannerTitleEn] = useState(prof.promotionalBannerTitleEn || '');
  const [bannerBodyAr, setBannerBodyAr] = useState(prof.promotionalBannerBodyAr || '');
  const [bannerBodyEn, setBannerBodyEn] = useState(prof.promotionalBannerBodyEn || '');
  const [bannerImageUrl, setBannerImageUrl] = useState(prof.promotionalBannerImageUrl || '');
  const [bannerImagePath, setBannerImagePath] = useState(prof.promotionalBannerImagePath || '');
  const [requestFeatured, setRequestFeatured] = useState(
    prof.featuredStatus === 'requested' || prof.featuredStatus === 'approved',
  );

  // New Special Offer state
  const [offerTitleAr, setOfferTitleAr] = useState('');
  const [offerTitleEn, setOfferTitleEn] = useState('');
  const [offerDesc, setOfferDesc] = useState('');
  const [offerDiscount, setOfferDiscount] = useState('');
  const [offerValidUntil, setOfferValidUntil] = useState('');
  const [offerProductId, setOfferProductId] = useState('');

  // Campaign request state
  const [campTitle, setCampTitle] = useState('');
  const [campType, setCampType] = useState<'featured_pharmacy' | 'homepage_spotlight' | 'governorate_promo'>('featured_pharmacy');
  const [campGov, setCampGov] = useState(prof.governorate || '');
  const [campNotes, setCampNotes] = useState('');

  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleBannerUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingBanner(true);
    setError(null);
    try {
      const prepared = await preparePharmacyImageUpload(file, 1400);
      const uploaded = await uploadPharmacyMedia(firebaseUser, prepared);
      setBannerImageUrl(uploaded.file.url);
      setBannerImagePath(uploaded.file.storagePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BANNER_UPLOAD_FAILED');
    } finally {
      setUploadingBanner(false);
    }
  };

  const handleSaveBanner = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updatePharmacyMarketing(firebaseUser, {
        promotionalBannerTitleAr: bannerTitleAr.trim(),
        promotionalBannerTitleEn: bannerTitleEn.trim(),
        promotionalBannerBodyAr: bannerBodyAr.trim(),
        promotionalBannerBodyEn: bannerBodyEn.trim(),
        promotionalBannerImageUrl: bannerImageUrl,
        promotionalBannerImagePath: bannerImagePath,
        requestFeatured,
      });
      await onRefresh();
      setNotice(
        isAr
          ? 'تم إرسال البانر الترويجي لمراجعة الإدارة العليا لـ MEDORA. سيظهر للعامة فور الموافقة.'
          : 'Promotional banner submitted for MEDORA Super Admin review.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MARKETING_UPDATE_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOffer = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createPharmacySpecialOffer(firebaseUser, {
        titleAr: offerTitleAr.trim(),
        titleEn: offerTitleEn.trim() || undefined,
        description: offerDesc.trim(),
        productId: offerProductId || null,
        discountPercent: offerDiscount ? Number(offerDiscount) : null,
        validUntil: offerValidUntil || null,
      });
      setOfferTitleAr('');
      setOfferTitleEn('');
      setOfferDesc('');
      setOfferDiscount('');
      setOfferValidUntil('');
      setOfferProductId('');
      await onRefresh();
      setNotice(
        isAr
          ? 'تم تسجيل العرض الخاص وهو بانتظار موافقة المشرف العام قبل الظهور للمرضى.'
          : 'Special offer submitted for Super Admin approval.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CREATE_OFFER_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteOffer = async (offerId: string) => {
    setBusy(true);
    setError(null);
    try {
      await deletePharmacySpecialOffer(firebaseUser, offerId);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DELETE_OFFER_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const handleCampaignRequest = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await submitPharmacyCampaignRequest(firebaseUser, {
        campaignTitle: campTitle.trim(),
        campaignType: campType,
        targetGovernorate: campGov.trim(),
        notes: campNotes.trim(),
      });
      setCampTitle('');
      setCampNotes('');
      await onRefresh();
      setNotice(
        isAr
          ? 'تم إرسال طلب الحملة الترويجية إلى صندوق الإدارة العليا.'
          : 'Campaign request submitted to MEDORA Super Admin.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CAMPAIGN_REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const bannerStatusLabel =
    prof.marketingApprovalStatus === 'approved'
      ? isAr
        ? 'معتمد ومنشور'
        : 'Approved & Live'
      : prof.marketingApprovalStatus === 'rejected'
        ? isAr
          ? 'مرفوض من الإدارة'
          : 'Rejected'
        : prof.marketingApprovalStatus === 'pending_review'
          ? isAr
            ? 'بانتظار موافقة المشرف العام'
            : 'Pending Super Admin Review'
          : isAr
            ? 'مسودة'
            : 'Draft';

  const featuredLabel =
    prof.featuredStatus === 'approved'
      ? isAr
        ? 'صيدلية مميزة (معتمد)'
        : 'Featured (Approved)'
      : prof.featuredStatus === 'requested'
        ? isAr
          ? 'طلب التمييز قيد المراجعة'
          : 'Featured Requested'
        : prof.featuredStatus === 'rejected'
          ? isAr
            ? 'مرفوض'
            : 'Rejected'
          : isAr
            ? 'غير مفعّل'
            : 'Standard Listing';

  return (
    <div className="space-y-6">
      {/* Governance Header */}
      <div className="rounded-2xl border border-[#d9a43b]/35 bg-[#0c3585]/5 p-4 text-xs dark:border-[#d9a43b]/30 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold text-[#0c3585] dark:text-[#f4d378]">
            <ShieldCheck className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <span>
              {isAr
                ? 'حوكمة الإعلانات والعروض: تخضع كافة البنرات والعروض الخاصة والظهور المميز لموافقة المشرف العام قبل النشر للمرضى.'
                : 'Super Admin Marketing Governance: All banners, special offers, and featured placements require approval before public display.'}
            </span>
          </div>
          <div className="font-semibold text-slate-700 dark:text-slate-300">
            {isAr ? 'حالة البانر:' : 'Banner:'} {bannerStatusLabel} ·{' '}
            {isAr ? 'التمييز:' : 'Featured:'} {featuredLabel}
          </div>
        </div>
        {prof.marketingReviewNote && (
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            {isAr ? 'ملاحظة الإدارة:' : 'Admin Note:'} {prof.marketingReviewNote}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Promo Banner Builder */}
        <form
          onSubmit={handleSaveBanner}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-7"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'البانر الترويجي لواجهة الصيدلية' : 'Storefront Promotional Banner'}
              </h3>
            </div>
            <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
              {bannerStatusLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'عنوان العرض (عربي)' : 'Banner Title (Arabic)'}
              </label>
              <input
                disabled={!canManage}
                value={bannerTitleAr}
                onChange={(e) => setBannerTitleAr(e.target.value)}
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'عنوان العرض (إنجليزي)' : 'Banner Title (English)'}
              </label>
              <input
                disabled={!canManage}
                value={bannerTitleEn}
                onChange={(e) => setBannerTitleEn(e.target.value)}
                dir="ltr"
                className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'نص الإعلان (عربي)' : 'Banner Copy (Arabic)'}
              </label>
              <textarea
                rows={2}
                disabled={!canManage}
                value={bannerBodyAr}
                onChange={(e) => setBannerBodyAr(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {isAr ? 'نص الإعلان (إنجليزي)' : 'Banner Copy (English)'}
              </label>
              <textarea
                rows={2}
                disabled={!canManage}
                value={bannerBodyEn}
                onChange={(e) => setBannerBodyEn(e.target.value)}
                dir="ltr"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-[#0c3585] hover:bg-slate-100 dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378] cursor-pointer">
              {uploadingBanner ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              <span>{isAr ? 'رفع صورة البانر' : 'Upload Banner Image'}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!canManage || uploadingBanner}
                onChange={(e) => void handleBannerUpload(e)}
                className="hidden"
              />
            </label>
            {bannerImageUrl && (
              <button
                type="button"
                onClick={() => {
                  setBannerImageUrl('');
                  setBannerImagePath('');
                }}
                className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
              >
                {isAr ? 'إزالة الصورة' : 'Remove Image'}
              </button>
            )}
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={requestFeatured}
                onChange={(e) => setRequestFeatured(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{isAr ? 'طلب تمييز الصيدلية (Featured)' : 'Request Featured Placement'}</span>
            </label>
          </div>

          {canManage && (
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>
                {isAr ? 'إرسال البانر لمراجعة الإدارة العليا' : 'Submit Banner for Review'}
              </span>
            </button>
          )}
        </form>

        {/* Shareable Link & QR Code Card */}
        <section className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-5">
          <div>
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <Sparkles className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'رابط الصيدلية ورمز QR الترويجي' : 'Shareable Storefront & QR Code'}
              </h3>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'استخدم هذا الرابط أو رمز QR على مطبوعاتك وحملات MEDORA لتوجيه المرضى والأطباء مباشرة إلى واجهة صيدليتك.'
                : 'Share this URL or QR code in campaigns to link patients and doctors straight to your storefront.'}
            </p>
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-slate-50 p-4 dark:bg-[#030712]">
              <PharmacyQrCodeCanvas value={shareUrl} size={140} />
              <p className="w-full break-all text-center font-latin text-[11px] font-semibold text-[#0c3585] dark:text-[#f4d378]" dir="ltr">
                {shareUrl}
              </p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    // ignore
                  }
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ الرابط' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Special Offers + Campaign Requests */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Tag className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'العروض الخاصة على المنتجات' : 'Special Offers Manager'}
            </h3>
          </div>

          {canManage && (
            <form onSubmit={handleCreateOffer} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                value={offerTitleAr}
                onChange={(e) => setOfferTitleAr(e.target.value)}
                placeholder={isAr ? 'عنوان العرض (عربي) *' : 'Offer Title (AR) *'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <input
                value={offerTitleEn}
                onChange={(e) => setOfferTitleEn(e.target.value)}
                placeholder={isAr ? 'عنوان العرض (إنجليزي)' : 'Offer Title (EN)'}
                dir="ltr"
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <input
                required
                value={offerDesc}
                onChange={(e) => setOfferDesc(e.target.value)}
                placeholder={isAr ? 'وصف العرض الترويجي *' : 'Offer description *'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white sm:col-span-2"
              />
              <input
                type="number"
                min={1}
                max={90}
                value={offerDiscount}
                onChange={(e) => setOfferDiscount(e.target.value)}
                placeholder={isAr ? 'نسبة الخصم % (اختياري)' : 'Discount %'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <input
                type="date"
                value={offerValidUntil}
                onChange={(e) => setOfferValidUntil(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 font-latin text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <select
                value={offerProductId}
                onChange={(e) => setOfferProductId(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white sm:col-span-2"
              >
                <option value="">
                  {isAr ? 'ربط بدواء محدد (اختياري)' : 'Link specific product (optional)'}
                </option>
                {workspace.products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {p.brandName} ({p.strength})
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] sm:col-span-2 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isAr ? 'إضافة عرض خاص للمراجعة' : 'Submit Special Offer'}</span>
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {(workspace.specialOffers || []).map((off) => (
              <div key={off.offerId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {isAr ? off.titleAr : off.titleEn || off.titleAr}
                    {off.discountPercent ? ` · -${off.discountPercent}%` : ''}
                  </p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {off.approvalStatus === 'approved'
                      ? isAr
                        ? 'معتمد ومنشور'
                        : 'Approved'
                      : off.approvalStatus === 'rejected'
                        ? isAr
                          ? 'مرفوض'
                          : 'Rejected'
                        : isAr
                          ? 'بانتظار موافقة المشرف العام'
                          : 'Pending Review'}
                    {off.reviewNote ? ` · ${off.reviewNote}` : ''}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteOffer(off.offerId)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Campaign Requests to Super Admin */}
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] xl:col-span-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <Sparkles className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'طلبات الحملات الإعلانية للمشرف العام' : 'Campaign Requests to Super Admin'}
            </h3>
          </div>

          {canManage && (
            <form onSubmit={handleCampaignRequest} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                value={campTitle}
                onChange={(e) => setCampTitle(e.target.value)}
                placeholder={isAr ? 'عنوان الحملة الترويجية *' : 'Campaign Title *'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white sm:col-span-2"
              />
              <select
                value={campType}
                onChange={(e) =>
                  setCampType(
                    e.target.value as 'featured_pharmacy' | 'homepage_spotlight' | 'governorate_promo',
                  )
                }
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                <option value="featured_pharmacy">
                  {isAr ? 'شارة صيدلية مميزة' : 'Featured Pharmacy'}
                </option>
                <option value="homepage_spotlight">
                  {isAr ? 'ظهور في الواجهة الرئيسية' : 'Homepage Spotlight'}
                </option>
                <option value="governorate_promo">
                  {isAr ? 'حملة على مستوى المحافظة' : 'Governorate Promo'}
                </option>
              </select>
              <input
                value={campGov}
                onChange={(e) => setCampGov(e.target.value)}
                placeholder={isAr ? 'المحافظة المستهدفة' : 'Target Governorate'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <textarea
                rows={2}
                value={campNotes}
                onChange={(e) => setCampNotes(e.target.value)}
                placeholder={isAr ? 'تفاصيل الحملة أو الملاحظات للإدارة...' : 'Campaign details for Super Admin...'}
                className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white sm:col-span-2"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] sm:col-span-2 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{isAr ? 'إرسال طلب الحملة' : 'Submit Campaign Request'}</span>
              </button>
            </form>
          )}

          <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
            {(workspace.campaignRequests || []).map((c) => (
              <div key={c.requestId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{c.campaignTitle}</p>
                  <p className="text-slate-500 dark:text-slate-400">
                    {c.targetGovernorate} · {c.status}
                    {c.adminNote ? ` · ${c.adminNote}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
