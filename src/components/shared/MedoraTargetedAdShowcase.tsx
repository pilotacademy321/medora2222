import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FlaskConical,
  Info,
  MapPin,
  Megaphone,
  Pause,
  Pill,
  Play,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Warehouse,
  X,
} from 'lucide-react';
import { fetchTargetedAds, trackAdEvent } from '../../services/adsService';
import type { Language } from '../../types/medora';
import type { AdEntityType, AdTargetPortal, MedoraAdRecord } from '../../types/patient';

interface MedoraTargetedAdShowcaseProps {
  portal: AdTargetPortal;
  language: Language;
  firebaseUser?: User | null;
  onAdAction?: (ad: MedoraAdRecord) => void;
  compact?: boolean;
}

function getEntityBadge(entityType: AdEntityType | undefined, language: Language) {
  switch (entityType) {
    case 'doctor':
      return {
        label: language === 'ar' ? 'طبيب معتمد' : 'Verified Physician',
        Icon: Stethoscope,
      };
    case 'lab':
      return {
        label: language === 'ar' ? 'مختبر تحليلات معتمد' : 'Verified Lab',
        Icon: FlaskConical,
      };
    case 'pharmacy':
      return {
        label: language === 'ar' ? 'صيدلية معتمدة' : 'Verified Pharmacy',
        Icon: Pill,
      };
    case 'wholesaler':
      return {
        label: language === 'ar' ? 'مذخر دوائي معتمد' : 'Licensed Wholesaler',
        Icon: Warehouse,
      };
    case 'radiology_info':
      return {
        label:
          language === 'ar'
            ? 'شريك أشعة · إعلان تعريفي وتحويل فقط'
            : 'Radiology Partner · Informational Referral Only',
        Icon: Info,
      };
    case 'platform_service':
    default:
      return {
        label: language === 'ar' ? 'خدمات منصة MEDORA' : 'MEDORA Ecosystem',
        Icon: Sparkles,
      };
  }
}

export function MedoraTargetedAdShowcase({
  portal,
  language,
  firebaseUser,
  onAdAction,
  compact = false,
}: MedoraTargetedAdShowcaseProps) {
  const prefersReducedMotion = useReducedMotion();
  const [ads, setAds] = useState<MedoraAdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(Boolean(prefersReducedMotion));
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [infoModalAd, setInfoModalAd] = useState<MedoraAdRecord | null>(null);
  const trackedImpressionsRef = useRef<Set<string>>(new Set());
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTargetedAds(portal)
      .then((list) => {
        if (!alive) return;
        setAds(list);
        setActiveIndex(0);
        setBrokenImages({});
      })
      .catch(() => {
        if (alive) setAds([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [portal]);

  useEffect(() => {
    if (paused || prefersReducedMotion || ads.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % ads.length);
    }, 8500);
    return () => window.clearInterval(timer);
  }, [paused, prefersReducedMotion, ads.length]);

  const safeIndex = activeIndex >= 0 && activeIndex < ads.length ? activeIndex : 0;
  const currentAd = ads[safeIndex] || null;

  useEffect(() => {
    if (!currentAd) return;
    const key = `${portal}:${currentAd.adId}`;
    if (trackedImpressionsRef.current.has(key)) return;
    trackedImpressionsRef.current.add(key);
    void trackAdEvent({
      adId: currentAd.adId,
      eventType: 'impression',
      portal,
      firebaseUser,
    });
  }, [currentAd, portal, firebaseUser]);

  const goNext = useCallback(() => {
    if (ads.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % ads.length);
  }, [ads.length]);

  const goPrev = useCallback(() => {
    if (ads.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + ads.length) % ads.length);
  }, [ads.length]);

  const handleCtaClick = (ad: MedoraAdRecord) => {
    void trackAdEvent({
      adId: ad.adId,
      eventType: 'click',
      portal,
      firebaseUser,
    });

    // Radiology info inside Lab portal is strictly informational/referral only — never opens an imaging portal
    if (ad.entityType === 'radiology_info' || ad.actionType === 'info_only') {
      setInfoModalAd(ad);
      return;
    }

    if (
      ad.actionType === 'open_external_url' &&
      ad.destinationTarget &&
      /^https:\/\//i.test(ad.destinationTarget)
    ) {
      window.open(ad.destinationTarget, '_blank', 'noopener,noreferrer');
      return;
    }

    if (onAdAction) {
      onAdAction(ad);
    } else {
      setInfoModalAd(ad);
    }
  };

  if (loading || ads.length === 0 || !currentAd) {
    return null;
  }

  const badge = getEntityBadge(currentAd.entityType, language);
  const BadgeIcon = badge.Icon;
  const imgKey = `${currentAd.adId}:${currentAd.imageUrl}`;
  const hasImage = Boolean(currentAd.imageUrl) && !brokenImages[imgKey];
  const PrevIcon = language === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = language === 'ar' ? ChevronLeft : ChevronRight;
  const ActionArrow = language === 'ar' ? ArrowLeft : ArrowRight;
  const customBadge =
    language === 'ar'
      ? currentAd.badgeTextAr || badge.label
      : currentAd.badgeTextEn || badge.label;
  const ctaText =
    language === 'ar'
      ? currentAd.ctaLabel || 'استعراض التفاصيل'
      : currentAd.ctaLabelEn || currentAd.ctaLabel || 'Explore Details';

  return (
    <>
      <section
        aria-label={language === 'ar' ? 'إعلانات MEDORA الموجهة' : 'MEDORA Targeted Showcase'}
        onTouchStart={(e) => {
          touchStartXRef.current = e.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartXRef.current === null || ads.length <= 1) return;
          const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
          const delta = endX - touchStartXRef.current;
          touchStartXRef.current = null;
          if (Math.abs(delta) < 40) return;
          if (delta > 0) goPrev();
          else goNext();
        }}
        className="relative overflow-hidden rounded-3xl border border-[#d9a43b]/35 bg-gradient-to-br from-[#040917] via-[#071535] to-[#040917] text-white shadow-[0_24px_60px_-24px_rgba(6,16,40,0.7)]"
      >
        {/* Top Header Ribbon */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-bold text-[#f4d378]">
            <Megaphone className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {language === 'ar' ? 'شركاء وخدمات MEDORA المميزة' : 'Featured MEDORA Partners'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {ads.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={
                    paused
                      ? language === 'ar'
                        ? 'تشغيل العرض التلقائي'
                        : 'Resume autoplay'
                      : language === 'ar'
                        ? 'إيقاف العرض التلقائي'
                        : 'Pause autoplay'
                  }
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:border-[#f4d378] hover:text-[#f4d378] cursor-pointer"
                >
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                </button>
                <span className="font-latin text-[11px] font-semibold text-slate-300 tabular-nums">
                  {safeIndex + 1} / {ads.length}
                </span>
              </>
            )}
          </div>
        </div>

        {/* 2:1 Image Banner */}
        <div
          className={`relative w-full bg-[#050d24] ${
            compact ? 'aspect-[21/9] max-h-[260px]' : 'aspect-[2/1] max-h-[380px]'
          }`}
        >
          {hasImage ? (
            <img
              key={currentAd.imageUrl}
              src={currentAd.imageUrl}
              alt={currentAd.title || currentAd.entityName || 'MEDORA Partner'}
              referrerPolicy="no-referrer"
              onError={() => setBrokenImages((prev) => ({ ...prev, [imgKey]: true }))}
              className="h-full w-full object-contain transition-opacity duration-500"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#061028] via-[#0c3585] to-[#061028] px-6 text-center">
              <BadgeIcon className="h-10 w-10 text-[#f4d378]" aria-hidden="true" />
              <p className="mt-2 font-latin text-xs font-bold tracking-[0.2em] text-[#f4d378]">
                MEDORA ECOSYSTEM
              </p>
            </div>
          )}

          {ads.length > 1 && (
            <>
              <button
                type="button"
                onClick={goPrev}
                aria-label={language === 'ar' ? 'الإعلان السابق' : 'Previous ad'}
                className="absolute start-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/70 text-white backdrop-blur-sm hover:border-[#f4d378] cursor-pointer"
              >
                <PrevIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                aria-label={language === 'ar' ? 'الإعلان التالي' : 'Next ad'}
                className="absolute end-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/70 text-white backdrop-blur-sm hover:border-[#f4d378] cursor-pointer"
              >
                <NextIcon className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Details & CTA Bar */}
        <div className="border-t border-white/10 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#f4d378]">
                <span className="inline-flex items-center gap-1 rounded-lg border border-[#d9a43b]/40 bg-[#d9a43b]/15 px-2.5 py-0.5 text-[11px]">
                  <BadgeIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{customBadge}</span>
                </span>
                {(currentAd.entityName || currentAd.doctorName) && (
                  <span className="text-white">
                    {currentAd.entityName || currentAd.doctorName}
                  </span>
                )}
              </div>

              {currentAd.title && (
                <h3 className="text-base font-bold text-white sm:text-lg">
                  {currentAd.title}
                </h3>
              )}
              {currentAd.description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-300 sm:text-sm">
                  {currentAd.description}
                </p>
              )}
              {currentAd.clinicName && (
                <p className="flex items-center gap-1.5 text-xs text-slate-300">
                  <MapPin className="h-3.5 w-3.5 text-[#f4d378]" aria-hidden="true" />
                  <span>{currentAd.clinicName}</span>
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleCtaClick(currentAd)}
              className="medora-gold-button inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2 text-xs font-bold text-[#040917] shadow-lg whitespace-nowrap cursor-pointer"
            >
              <span>{ctaText}</span>
              {currentAd.actionType === 'open_external_url' ? (
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ActionArrow className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {ads.length > 1 && (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {ads.map((ad, idx) => (
                <button
                  key={ad.adId}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  aria-label={`Ad ${idx + 1}`}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    idx === safeIndex ? 'w-7 bg-[#f4d378]' : 'w-2 bg-white/35 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Informational / Referral Details Modal (including Lab Radiology Partner Info ONLY) */}
      {infoModalAd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setInfoModalAd(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-[#d9a43b]/35 bg-white p-6 text-slate-900 shadow-2xl dark:bg-[#07122a] dark:text-white"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <p className="text-xs font-bold text-[#b68023] dark:text-[#f4d378]">
                  {getEntityBadge(infoModalAd.entityType, language).label}
                </p>
                <h3 className="mt-0.5 text-lg font-bold">
                  {infoModalAd.title || infoModalAd.entityName || infoModalAd.doctorName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInfoModalAd(null)}
                aria-label={language === 'ar' ? 'إغلاق' : 'Close'}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {infoModalAd.description && <p>{infoModalAd.description}</p>}
              {infoModalAd.clinicName && (
                <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin className="h-4 w-4 text-[#d9a43b]" />
                  <span>{infoModalAd.clinicName}</span>
                </p>
              )}
              {infoModalAd.entityType === 'radiology_info' && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {language === 'ar'
                      ? 'إعلان تعريفي وتحويلي خاص بالمختبرات فقط — بوابة الأشعة مغلقة حالياً ولا يتم تنفيذ حجوزات أو فحوصات أشعة عبر المنصة.'
                      : 'Informational referral card for Laboratory coordination only — the Imaging Portal remains closed with no imaging booking or execution.'}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setInfoModalAd(null)}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
