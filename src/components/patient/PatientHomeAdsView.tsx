import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FlaskConical,
  MapPin,
  Stethoscope,
} from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import { fetchActiveMedoraAds } from '../../services/patientService';
import type { Language } from '../../types/medora';
import type { MedoraAdRecord } from '../../types/patient';

interface PatientHomeAdsViewProps {
  language: Language;
  onBookFromAd: (ad: MedoraAdRecord, isBookable: boolean) => void;
}

function pickRandomIndex(length: number, excludeIndex?: number): number {
  if (length <= 1) return 0;
  let candidate = Math.floor(Math.random() * length);
  if (typeof excludeIndex === 'number' && candidate === excludeIndex) {
    candidate = (candidate + 1 + Math.floor(Math.random() * (length - 1))) % length;
  }
  return candidate;
}

function checkAdEntityBookable(ad: MedoraAdRecord): boolean {
  const entityType = ad.entityType === 'lab' ? 'lab' : 'doctor';
  if (entityType === 'doctor') {
    if (!ad.doctorCard) return false;
    return ad.doctorCard.hasAvailableSlots !== false;
  }
  if (!ad.labCard) return false;
  const servicesCount =
    (ad.labCard.serviceCatalog?.length || 0) + (ad.labCard.labServices?.length || 0);
  return servicesCount > 0;
}

export function PatientHomeAdsView({
  language,
  onBookFromAd,
}: PatientHomeAdsViewProps) {
  const pt = PATIENT_TRANSLATIONS[language].homeAds;
  const [ads, setAds] = useState<MedoraAdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchActiveMedoraAds()
      .then((list) => {
        if (!active) return;
        setBrokenImages({});
        setAds(list);
        if (list.length > 0) {
          setActiveIndex(Math.floor(Math.random() * list.length));
        }
      })
      .catch(() => {
        if (active) setAds([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => pickRandomIndex(ads.length, prev));
  }, [ads.length]);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) =>
      ads.length <= 1 ? 0 : (prev - 1 + ads.length) % ads.length,
    );
  }, [ads.length]);

  useEffect(() => {
    if (ads.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => pickRandomIndex(ads.length, prev));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ads.length]);

  // Render NO empty card or wasted vertical space when loading or 0 active ads
  if (loading || ads.length === 0) {
    return null;
  }

  const safeIndex = activeIndex >= 0 && activeIndex < ads.length ? activeIndex : 0;
  const currentAd = ads[safeIndex];
  const imgBrokenKey = `${currentAd.adId}:${currentAd.imageUrl || ''}`;
  const hasImage = Boolean(currentAd.imageUrl) && !brokenImages[imgBrokenKey];
  const PrevIcon = language === 'ar' ? ChevronRight : ChevronLeft;
  const NextIcon = language === 'ar' ? ChevronLeft : ChevronRight;
  const entityType = currentAd.entityType === 'lab' ? 'lab' : 'doctor';
  const FallbackIcon = entityType === 'lab' ? FlaskConical : Stethoscope;
  const entityLabel = currentAd.entityName || currentAd.doctorName;
  const entityLocation =
    entityType === 'doctor'
      ? [currentAd.clinicName, currentAd.doctorCard?.governorate].filter(Boolean).join(' · ')
      : [currentAd.clinicName || currentAd.labCard?.governorate]
          .filter(Boolean)
          .join(' · ');
  const isBookable = checkAdEntityBookable(currentAd);

  return (
    <section
      aria-label={pt.slideLabel}
      onTouchStart={(e) => {
        touchStartXRef.current = e.changedTouches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartXRef.current === null || ads.length <= 1) return;
        const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
        const delta = endX - touchStartXRef.current;
        touchStartXRef.current = null;
        if (Math.abs(delta) < 40) return;
        if (delta > 0) {
          goPrev();
        } else {
          goNext();
        }
      }}
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-[#040917] text-white shadow-xl dark:border-[#d9a43b]/30"
    >
      {/* Responsive 2:1 Ad Banner Stage */}
      <div className="relative aspect-[2/1] w-full bg-[#050d24]">
        {hasImage ? (
          <img
            key={currentAd.imageUrl}
            src={currentAd.imageUrl}
            alt={currentAd.title || entityLabel || pt.slideLabel}
            referrerPolicy="no-referrer"
            onError={() =>
              setBrokenImages((prev) => ({ ...prev, [imgBrokenKey]: true }))
            }
            className="h-full w-full object-contain transition-opacity duration-500"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#040a1a] via-[#0c3585] to-[#081635] px-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-[#d9a43b]/40 bg-[#d9a43b]/15 sm:h-20 sm:w-20">
              <FallbackIcon className="h-8 w-8 text-[#f4d378] sm:h-10 sm:w-10" aria-hidden="true" />
            </div>
            <p className="mt-3 font-latin text-xs font-bold tracking-[0.2em] text-[#f4d378]">
              MEDORA HEALTHCARE
            </p>
          </div>
        )}

        {/* Prev / Next Navigation */}
        {ads.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              aria-label={pt.prevAd}
              className="absolute start-2.5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/65 text-white backdrop-blur-sm transition-colors hover:border-[#f4d378] hover:bg-slate-950 sm:start-4 sm:h-11 sm:w-11 cursor-pointer"
            >
              <PrevIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label={pt.nextAd}
              className="absolute end-2.5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/65 text-white backdrop-blur-sm transition-colors hover:border-[#f4d378] hover:bg-slate-950 sm:end-4 sm:h-11 sm:w-11 cursor-pointer"
            >
              <NextIcon className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Top Counter */}
        {ads.length > 1 && (
          <div className="absolute end-3 top-3 z-10 rounded-lg border border-white/15 bg-slate-950/65 px-2.5 py-1 font-latin text-xs font-semibold text-slate-200 tabular-nums backdrop-blur-sm sm:end-5 sm:top-4 sm:px-3">
            {safeIndex + 1} / {ads.length}
          </div>
        )}
      </div>

      {/* Responsive Copy & Booking / Details Bar (cleanly below the 2:1 image so artwork is never hidden) */}
      <div className="border-t border-white/10 bg-gradient-to-r from-[#040917] via-[#071535] to-[#040917] px-4 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 max-w-2xl space-y-1">
            <p className="text-xs font-bold text-[#f4d378]">
              {pt.entityTypes[entityType]}
              {entityLabel ? ` · ${entityLabel}` : ''}
              {entityType === 'doctor' && currentAd.specialty
                ? ` · ${currentAd.specialty}`
                : ''}
            </p>
            {currentAd.title && (
              <h2 className="text-lg font-bold leading-snug text-white sm:text-2xl">
                {currentAd.title}
              </h2>
            )}
            {currentAd.description && (
              <p className="line-clamp-2 text-xs leading-relaxed text-slate-200 sm:text-sm">
                {currentAd.description}
              </p>
            )}
            {entityLocation && (
              <p className="flex items-center gap-1.5 text-xs text-slate-300">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-[#f4d378]" aria-hidden="true" />
                <span>
                  {entityType === 'doctor' ? pt.clinicLabel : pt.locationLabel}:{' '}
                  {entityLocation}
                </span>
              </p>
            )}
            {!isBookable && (
              <p className="text-xs font-medium text-amber-300">
                {pt.unavailableBookingNote}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onBookFromAd(currentAd, isBookable)}
            className={
              isBookable
                ? 'medora-gold-button inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-[#040917] shadow-lg whitespace-nowrap cursor-pointer'
                : 'inline-flex min-h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl border border-[#f4d378]/45 bg-white/10 px-6 py-2.5 text-sm font-bold text-white hover:border-[#f4d378] hover:bg-white/15 whitespace-nowrap cursor-pointer'
            }
          >
            {isBookable ? (
              <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4 text-[#f4d378]" aria-hidden="true" />
            )}
            <span>
              {isBookable
                ? currentAd.ctaLabel || pt.bookNowDefault
                : pt.viewDetailsBtn}
            </span>
          </button>
        </div>

        {/* Slide Dots */}
        {ads.length > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            {ads.map((ad, idx) => (
              <button
                key={ad.adId}
                type="button"
                onClick={() => setActiveIndex(idx)}
                aria-label={`${pt.slideLabel} ${idx + 1}`}
                className={`h-2.5 rounded-full transition-all cursor-pointer ${
                  idx === safeIndex
                    ? 'w-8 bg-[#f4d378]'
                    : 'w-2.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
