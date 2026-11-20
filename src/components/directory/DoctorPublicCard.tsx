import { useEffect, useState } from 'react';
import { Calendar, Clock, MapPin, Star, Stethoscope } from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import type { PublicDoctorCard as PublicDoctorCardModel } from '../../types/doctor';
import type { Language } from '../../types/medora';

interface DoctorPublicCardProps {
  doctor: PublicDoctorCardModel;
  language: Language;
  isFavorite?: boolean;
  onToggleFavorite?: (doctor: PublicDoctorCardModel) => void;
  onViewProfile: (doctor: PublicDoctorCardModel) => void;
  onBookAppointment: (doctor: PublicDoctorCardModel) => void;
}

export function DoctorPublicCard({
  doctor,
  language,
  isFavorite = false,
  onToggleFavorite,
  onViewProfile,
  onBookAppointment,
}: DoctorPublicCardProps) {
  const dc = DOCTOR_TRANSLATIONS[language].directory;
  const hw = PATIENT_TRANSLATIONS[language].homeWorkspace;
  const [bannerError, setBannerError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setBannerError(false);
  }, [doctor.promotionalBannerUrl]);

  useEffect(() => {
    setAvatarError(false);
  }, [doctor.avatarUrl]);

  const hasBanner = Boolean(doctor.promotionalBannerUrl) && !bannerError;
  const hasAvatar = Boolean(doctor.avatarUrl) && !avatarError;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-[#d9a43b]/70 dark:border-slate-800 dark:bg-[#07122a]">
      {/* Header Cover (Promotional Banner or Clean Doctor Avatar Card) */}
      <div
        onClick={() => onViewProfile(doctor)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onViewProfile(doctor);
          }
        }}
        className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-[#061028] via-[#0c3585] to-[#081635] sm:h-56 cursor-pointer"
      >
        {onToggleFavorite && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(doctor);
            }}
            aria-label={
              isFavorite
                ? language === 'ar'
                  ? 'إزالة من المفضلة'
                  : 'Remove from favorites'
                : language === 'ar'
                  ? 'إضافة إلى المفضلة'
                  : 'Add to favorites'
            }
            className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/65 text-white backdrop-blur-sm transition-colors hover:bg-slate-950 cursor-pointer"
          >
            <Star
              className={`h-4 w-4 ${
                isFavorite ? 'fill-[#f4d378] text-[#f4d378]' : 'text-slate-200'
              }`}
              aria-hidden="true"
            />
          </button>
        )}

        {hasBanner ? (
          <img
            src={doctor.promotionalBannerUrl}
            alt={doctor.fullName}
            referrerPolicy="no-referrer"
            onError={() => setBannerError(true)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center px-6 pb-8 text-center text-white">
            {hasAvatar ? (
              <img
                src={doctor.avatarUrl}
                alt={doctor.fullName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-20 w-20 rounded-2xl border-2 border-[#d9a43b]/60 object-cover shadow-lg"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#d9a43b]/40 bg-[#d9a43b]/15">
                <Stethoscope className="h-8 w-8 text-[#f4d378]" aria-hidden="true" />
              </div>
            )}
          </div>
        )}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 via-black/35 to-transparent"
        />
        <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{doctor.fullName}</p>
            <p className="truncate text-xs text-[#f4d378]">
              {doctor.specialty}
              {doctor.subSpecialty ? ` · ${doctor.subSpecialty}` : ''}
            </p>
          </div>
          {hasBanner && hasAvatar && (
            <img
              src={doctor.avatarUrl}
              alt={doctor.fullName}
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="h-11 w-11 shrink-0 rounded-xl border border-[#d9a43b]/60 bg-slate-900 object-cover"
            />
          )}
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {doctor.clinicName}
            </span>
            {typeof doctor.averageRating === 'number' &&
              (doctor.reviewCount || 0) > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 font-latin text-xs font-bold text-[#b68023] tabular-nums dark:text-[#f4d378]">
                  <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  {doctor.averageRating.toFixed(1)}
                  <span className="text-slate-400">({doctor.reviewCount})</span>
                </span>
              )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#0c3585] dark:text-[#f4d378]" aria-hidden="true" />
            <span className="truncate">
              {doctor.governorate}
              {doctor.district ? ` · ${doctor.district}` : ''}
            </span>
          </div>

          <div className="space-y-1 border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={
                  doctor.hasAvailableSlots
                    ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                    : 'font-medium text-slate-500 dark:text-slate-400'
                }
              >
                <Calendar className="me-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {doctor.hasAvailableSlots
                  ? `${doctor.availableSlotsCount} ${dc.slotsAvailable}`
                  : dc.noSlotsAvailable}
              </span>
              <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-semibold text-slate-800 tabular-nums dark:text-slate-200">
                {doctor.showFee &&
                typeof doctor.consultationFee === 'number' &&
                doctor.consultationFee > 0
                  ? `${doctor.consultationFee.toLocaleString()} ${dc.feeUnit}`
                  : dc.feeOnRequest}
              </span>
            </div>

            {doctor.hasAvailableSlots && doctor.nextAvailableDate && (
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#0c3585] dark:text-[#f4d378]">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{hw.nearestSlotLabel}:</span>
                <span className="font-latin tabular-nums" dir="ltr">
                  {doctor.nextAvailableDate}
                  {doctor.nextAvailableTime ? ` · ${doctor.nextAvailableTime}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {doctor.hasAvailableSlots ? (
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onViewProfile(doctor)}
              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#f4d378] dark:hover:text-[#f4d378] whitespace-nowrap cursor-pointer"
            >
              {dc.viewProfileBtn}
            </button>
            <button
              type="button"
              onClick={() => onBookAppointment(doctor)}
              className="medora-gold-button min-h-[44px] rounded-xl px-3 py-2 text-xs font-bold text-[#040917] whitespace-nowrap cursor-pointer"
            >
              {dc.bookAppointmentBtn}
            </button>
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => onViewProfile(doctor)}
              className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:border-[#0c3585] hover:text-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-[#f4d378] dark:hover:text-[#f4d378] whitespace-nowrap cursor-pointer"
            >
              {dc.viewProfileBtn}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
