import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BarChart3,
  Eye,
  Info,
  Megaphone,
  MessageSquareWarning,
  MousePointerClick,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import type { MedoraCopy } from '../../i18n/translations';
import {
  fetchAdminAdAnalytics,
  type AdminAdsAnalyticsSummary,
} from '../../services/adsService';
import type { Language, SuperAdminServerStatus } from '../../types/medora';
import type {
  AdEntityType,
  DoctorReviewRecord,
  DoctorReviewStatus,
  MedoraAdRecord,
  MedoraAdStatus,
  PatientFeedbackRecord,
  PatientFeedbackStatus,
} from '../../types/patient';
import { isValidAdImageUrlClient } from '../../utils/imagePreparation';
import { formatIsoDate } from './AdminModals';
import {
  CLIENT_IMAGING_PORTAL_ENABLED,
  IMAGING_PORTAL_DISABLED_MESSAGE_AR,
  isImagingPortalIdentifier,
} from '../../config/featureFlags';

const CATEGORY_LABELS: Record<AdEntityType, { ar: string; en: string }> = {
  doctor: { ar: 'الأطباء', en: 'Doctors' },
  lab: { ar: 'المختبرات', en: 'Laboratories' },
  pharmacy: { ar: 'الصيدليات', en: 'Pharmacies' },
  wholesaler: { ar: 'المذاخر الدوائية', en: 'Wholesalers' },
  platform_service: { ar: 'خدمات MEDORA', en: 'Platform Services' },
  radiology_info: { ar: 'شركاء الأشعة (للمختبرات)', en: 'Radiology Partner (Lab Info)' },
};

const PORTAL_SHORT_LABELS: Record<string, { ar: string; en: string }> = {
  entry: { ar: 'المدخل', en: 'Entry' },
  patient: { ar: 'المريض', en: 'Patient' },
  pharmacy: { ar: 'الصيدلية', en: 'Pharmacy' },
  lab: { ar: 'المختبر', en: 'Lab' },
  doctor: { ar: 'الطبيب', en: 'Doctor' },
  wholesaler: { ar: 'المذخر', en: 'Wholesaler' },
};

function resolveEffectiveAdStatus(ad: MedoraAdRecord, today: string): MedoraAdStatus {
  if (ad.endDate && ad.endDate < today) {
    return 'expired';
  }
  if (
    ad.status === 'draft' ||
    ad.status === 'published' ||
    ad.status === 'paused' ||
    ad.status === 'expired'
  ) {
    return ad.status;
  }
  if (ad.source === 'doctor_banner' && ad.approvedByAdmin !== true) {
    return 'draft';
  }
  return ad.active === true ? 'published' : 'paused';
}

export function AdminAdsSection({
  firebaseUser,
  t,
  language,
  ads,
  serverStatus,
  onCreateAd,
  onEditAd,
  onTogglePauseAd,
  onApprovePublishAd,
  onDeleteAd,
}: {
  firebaseUser?: User | null;
  t: MedoraCopy;
  language: Language;
  ads: MedoraAdRecord[];
  serverStatus?: SuperAdminServerStatus | null;
  onCreateAd: () => void;
  onEditAd: (ad: MedoraAdRecord) => void;
  onTogglePauseAd: (ad: MedoraAdRecord) => Promise<void>;
  onApprovePublishAd: (ad: MedoraAdRecord) => Promise<void>;
  onDeleteAd: (ad: MedoraAdRecord) => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MedoraAdStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AdminAdsAnalyticsSummary | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    let alive = true;
    fetchAdminAdAnalytics(firebaseUser)
      .then((res) => {
        if (alive) setAnalytics(res);
      })
      .catch(() => {
        // Non-fatal analytics fetch fallback
      });
    return () => {
      alive = false;
    };
  }, [firebaseUser, ads.length]);

  const analyticsByAdId = useMemo(() => {
    const map = new Map<string, { impressions: number; clicks: number; ctrPercent: number }>();
    for (const item of analytics?.perAd || []) {
      map.set(item.adId, {
        impressions: item.impressions,
        clicks: item.clicks,
        ctrPercent: item.ctrPercent,
      });
    }
    return map;
  }, [analytics]);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });

  const counts = useMemo(() => {
    let published = 0;
    let draft = 0;
    let paused = 0;
    let expired = 0;
    for (const ad of ads) {
      const st = resolveEffectiveAdStatus(ad, today);
      if (st === 'published') published += 1;
      else if (st === 'draft') draft += 1;
      else if (st === 'paused') paused += 1;
      else expired += 1;
    }
    return { all: ads.length, published, draft, paused, expired };
  }, [ads, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ads.filter((a) => {
      const st = resolveEffectiveAdStatus(a, today);
      if (statusFilter !== 'all' && st !== statusFilter) return false;

      if (!q) return true;
      return [
        a.title || '',
        a.description || '',
        a.entityName || '',
        a.doctorName,
        a.clinicName,
        a.specialty,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [ads, search, statusFilter, today]);

  const runAction = async (adId: string, fn: () => Promise<void>) => {
    setBusyId(adId);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {serverStatus && serverStatus.firebaseStorageActive === false && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <span>{t.admin.ads.storageFallbackNotice}</span>
        </div>
      )}

      {/* Real Targeted Ads CTR Analytics Summary Strip */}
      {analytics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'إجمالي الإعلانات' : 'Total Campaigns'}
            </p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {analytics.summary.totalAds}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <Eye className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
              <span>{isAr ? 'المشاهدات الفعلية' : 'Impressions'}</span>
            </p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums text-slate-900 dark:text-white">
              {analytics.summary.totalImpressions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <MousePointerClick className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{isAr ? 'النقرات الفعلية' : 'Clicks'}</span>
            </p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {analytics.summary.totalClicks.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <BarChart3 className="h-3.5 w-3.5 text-[#b68023] dark:text-[#f4d378]" />
              <span>{isAr ? 'معدل التفاعل CTR' : 'Overall CTR'}</span>
            </p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
              {analytics.summary.overallCtrPercent}%
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <button
          type="button"
          onClick={onCreateAd}
          className="medora-gold-button inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-[#040917] whitespace-nowrap cursor-pointer"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t.admin.ads.createBtn}</span>
        </button>
      </div>

      {/* Filter Tabs: All / Published / Draft / Paused / Expired */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'published', 'draft', 'paused', 'expired'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer ${
              statusFilter === tab
                ? 'border-[#0c3585] bg-[#0c3585] text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <span>{t.admin.ads.filters[tab]}</span>
            <span className="font-latin text-[11px] opacity-80 tabular-nums">
              ({counts[tab]})
            </span>
          </button>
        ))}
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
        >
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {ads.length === 0 ? t.admin.emptyList : t.admin.noResults}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((ad) => {
            const effectiveStatus = resolveEffectiveAdStatus(ad, today);
            const storageOk = isValidAdImageUrlClient(ad.imageUrl, ad.storagePath);
            const isFirestoreAsset = (ad.storagePath || '').startsWith('firestore_assets/');
            const isLegacyImagingAd = String(ad.entityType) === 'imaging';
            const entityCat: AdEntityType =
              ad.entityType && ad.entityType in CATEGORY_LABELS
                ? (ad.entityType as AdEntityType)
                : 'doctor';
            const isBusy = busyId === ad.adId;
            const imgBrokenKey = `${ad.adId}:${ad.imageUrl || ''}`;
            const imgFailed = Boolean(brokenImages[imgBrokenKey]);
            const stats = analyticsByAdId.get(ad.adId);
            const impressions = stats?.impressions ?? Number(ad.impressionsCount || 0);
            const clicks = stats?.clicks ?? Number(ad.clicksCount || 0);
            const ctr =
              stats?.ctrPercent ??
              (impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0);

            const statusBadgeClass =
              effectiveStatus === 'published'
                ? 'text-emerald-700 dark:text-emerald-400'
                : effectiveStatus === 'draft'
                  ? 'text-[#0c3585] dark:text-[#f4d378]'
                  : effectiveStatus === 'paused'
                    ? 'text-slate-500 dark:text-slate-400'
                    : 'text-rose-600 dark:text-rose-400';

            const statusBadgeLabel =
              effectiveStatus === 'published'
                ? t.admin.ads.publishedStatus
                : effectiveStatus === 'draft'
                  ? t.admin.ads.draftStatus
                  : effectiveStatus === 'paused'
                    ? t.admin.ads.pausedStatus
                    : t.admin.ads.expiredStatus;

            return (
              <article
                key={ad.adId}
                className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="relative aspect-[2/1] w-full bg-[#050d24]">
                  {ad.imageUrl && !imgFailed ? (
                    <img
                      key={ad.imageUrl}
                      src={ad.imageUrl}
                      alt={ad.title || ad.entityName || ad.doctorName}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [imgBrokenKey]: true }))
                      }
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[#f4d378]">
                      <Megaphone className="h-8 w-8" />
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between p-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
                      <span className={statusBadgeClass}>{statusBadgeLabel}</span>

                      <span className="font-latin text-slate-500 tabular-nums dark:text-slate-400" dir="ltr">
                        {ad.startDate || ad.endDate
                          ? `${ad.startDate || '—'} → ${ad.endDate || '—'}`
                          : t.admin.ads.ongoingLabel}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-[#0c3585] dark:text-[#f4d378]">
                        {isLegacyImagingAd
                          ? isAr
                            ? 'مركز أشعة — مغلق مؤقت (أرشيف)'
                            : 'Imaging Center — Temporarily Closed (Archive)'
                          : isAr
                            ? CATEGORY_LABELS[entityCat].ar
                            : CATEGORY_LABELS[entityCat].en}
                      </span>
                      <span>·</span>
                      <span>
                        {ad.source === 'super_admin'
                          ? t.admin.ads.approvedByAdminBadge
                          : t.admin.ads.legacyRecordBadge}
                      </span>
                      <span>·</span>
                      <span
                        className={
                          storageOk
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }
                      >
                        {storageOk
                          ? isFirestoreAsset
                            ? t.admin.ads.assetsSavedBadge
                            : t.admin.ads.storageSavedBadge
                          : t.admin.ads.storageMissingBadge}
                      </span>
                    </div>

                    {ad.title ? (
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {ad.title}
                      </h3>
                    ) : null}
                    <p className="text-xs font-medium text-[#0c3585] dark:text-[#f4d378]">
                      {ad.entityName || ad.doctorName}
                      {ad.clinicName ? ` · ${ad.clinicName}` : ''}
                    </p>
                    {ad.description && (
                      <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                        {ad.description}
                      </p>
                    )}

                    {/* Target Portals & Per-Ad CTR Analytics */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{isAr ? 'الاستهداف:' : 'Targets:'}</span>
                      {(ad.targetPortals && ad.targetPortals.length > 0
                        ? ad.targetPortals
                        : ['patient']
                      ).map((tp) => (
                        <span
                          key={tp}
                          className="font-medium text-slate-700 dark:text-slate-200"
                        >
                          {isAr
                            ? PORTAL_SHORT_LABELS[tp]?.ar || tp
                            : PORTAL_SHORT_LABELS[tp]?.en || tp}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 pt-0.5 font-latin text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
                      <span>{impressions.toLocaleString()} {isAr ? 'مشاهدة' : 'views'}</span>
                      <span>·</span>
                      <span>{clicks.toLocaleString()} {isAr ? 'نقرة' : 'clicks'}</span>
                      <span>·</span>
                      <span className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                        CTR {ctr}%
                      </span>
                    </div>

                    {effectiveStatus === 'expired' && (
                      <p className="text-[11px] text-rose-600 dark:text-rose-400">
                        {t.admin.ads.republishExpiredHint}
                      </p>
                    )}

                    <p className="pt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatIsoDate(ad.updatedAt || ad.createdAt, language)}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {!CLIENT_IMAGING_PORTAL_ENABLED &&
                      isImagingPortalIdentifier(String(ad.entityType)) && (
                        <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]">
                          {IMAGING_PORTAL_DISABLED_MESSAGE_AR}
                        </p>
                      )}

                    <div className="flex flex-wrap items-center gap-2">
                      {effectiveStatus === 'draft' &&
                        storageOk &&
                        !(
                          !CLIENT_IMAGING_PORTAL_ENABLED &&
                          isImagingPortalIdentifier(String(ad.entityType))
                        ) && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(ad.adId, () => onApprovePublishAd(ad))
                            }
                            className="medora-gold-button inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs font-bold text-[#040917] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                          >
                            <span>{t.admin.ads.publishBtn}</span>
                          </button>
                        )}

                      {(effectiveStatus === 'published' || effectiveStatus === 'paused') &&
                        storageOk &&
                        !(
                          !CLIENT_IMAGING_PORTAL_ENABLED &&
                          isImagingPortalIdentifier(String(ad.entityType)) &&
                          effectiveStatus === 'paused'
                        ) && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(ad.adId, () => onTogglePauseAd(ad))
                            }
                            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 hover:border-[#0c3585] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                          >
                            <span>
                              {effectiveStatus === 'published'
                                ? t.admin.ads.pauseBtn
                                : t.admin.ads.republishBtn}
                            </span>
                          </button>
                        )}

                      <button
                        type="button"
                        disabled={
                          isBusy ||
                          (!CLIENT_IMAGING_PORTAL_ENABLED &&
                            isImagingPortalIdentifier(String(ad.entityType)))
                        }
                        onClick={() => onEditAd(ad)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:border-[#0c3585] disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>{language === 'ar' ? 'تعديل' : 'Edit'}</span>
                      </button>

                      {confirmDeleteId !== ad.adId && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(ad.adId)}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-rose-300 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/60 dark:text-rose-300 whitespace-nowrap cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>{t.admin.ads.deleteBtn}</span>
                        </button>
                      )}
                    </div>

                    {confirmDeleteId === ad.adId && (
                      <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs dark:border-rose-900/60 dark:bg-rose-950/40">
                        <p className="text-rose-900 dark:text-rose-200">
                          {t.admin.ads.confirmDeletePrompt}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void runAction(ad.adId, async () => {
                                await onDeleteAd(ad);
                                setConfirmDeleteId(null);
                              })
                            }
                            className="min-h-[34px] rounded-lg bg-rose-600 px-3 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                          >
                            {isBusy ? '...' : t.admin.ads.deleteBtn}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                          >
                            {t.common.cancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AdminReviewsSection({
  t,
  language,
  reviews,
  onSelectReview,
}: {
  t: MedoraCopy;
  language: Language;
  reviews: DoctorReviewRecord[];
  onSelectReview: (review: DoctorReviewRecord) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | DoctorReviewStatus>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.doctorName.toLowerCase().includes(q) ||
        r.patientName.toLowerCase().includes(q) ||
        r.comment.toLowerCase().includes(q)
      );
    });
  }, [reviews, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                statusFilter === st
                  ? 'border-[#0c3585] bg-[#0c3585] text-white'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {st === 'all' ? t.admin.allFilter : t.admin.reviews.statuses[st]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {reviews.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((rev) => (
              <button
                key={rev.reviewId}
                type="button"
                onClick={() => onSelectReview(rev)}
                className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-4 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {rev.doctorName}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600 dark:text-slate-300">
                      {rev.patientName}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="inline-flex items-center gap-1 font-latin font-bold text-[#b68023] tabular-nums dark:text-[#f4d378]">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {rev.rating}/5
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                    {rev.comment}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                      rev.status === 'approved'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : rev.status === 'rejected'
                          ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-200'
                          : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200'
                    }`}
                  >
                    {t.admin.reviews.statuses[rev.status]}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatIsoDate(rev.createdAt, language)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminFeedbackSection({
  t,
  language,
  feedback,
  onSelectFeedback,
}: {
  t: MedoraCopy;
  language: Language;
  feedback: PatientFeedbackRecord[];
  onSelectFeedback: (item: PatientFeedbackRecord) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | PatientFeedbackStatus>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return feedback.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.subject.toLowerCase().includes(q) ||
        item.patientName.toLowerCase().includes(q) ||
        item.patientEmail.toLowerCase().includes(q) ||
        item.message.toLowerCase().includes(q)
      );
    });
  }, [feedback, statusFilter, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 start-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchPlaceholder}
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 focus:border-[#d9a43b] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {(['all', 'new', 'in_review', 'resolved', 'closed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`min-h-[38px] rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                statusFilter === st
                  ? 'border-[#0c3585] bg-[#0c3585] text-white'
                  : 'border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {st === 'all' ? t.admin.allFilter : t.admin.feedback.statuses[st]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            {feedback.length === 0 ? t.admin.emptyList : t.admin.noResults}
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filtered.map((item) => (
              <button
                key={item.feedbackId}
                type="button"
                onClick={() => onSelectFeedback(item)}
                className="flex w-full flex-wrap items-center justify-between gap-4 px-5 py-4 text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/40 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <MessageSquareWarning className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.patientName}
                    </span>
                    <span>·</span>
                    <span className="font-latin" dir="ltr">
                      {item.category}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {item.subject}
                  </p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">
                    {item.message}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                      item.status === 'resolved'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : item.status === 'new'
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200'
                          : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {t.admin.feedback.statuses[item.status]}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {formatIsoDate(item.createdAt, language)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
