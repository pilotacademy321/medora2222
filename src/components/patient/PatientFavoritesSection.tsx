import { useMemo } from 'react';
import { Star } from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import type { PublicDoctorCard as PublicDoctorCardModel } from '../../types/doctor';
import type { Language } from '../../types/medora';
import { DoctorPublicCard } from '../directory/DoctorPublicCard';

interface PatientFavoritesSectionProps {
  doctors: PublicDoctorCardModel[];
  favoriteDoctorUids: string[];
  language: Language;
  onToggleFavorite: (doctor: PublicDoctorCardModel) => void;
  onViewProfile: (doctor: PublicDoctorCardModel) => void;
  onBookAppointment: (doctor: PublicDoctorCardModel) => void;
  onBrowseDoctors: () => void;
}

export function PatientFavoritesSection({
  doctors,
  favoriteDoctorUids,
  language,
  onToggleFavorite,
  onViewProfile,
  onBookAppointment,
  onBrowseDoctors,
}: PatientFavoritesSectionProps) {
  const pf = PATIENT_TRANSLATIONS[language].favorites;

  const favoriteDoctors = useMemo(() => {
    const set = new Set(favoriteDoctorUids);
    return doctors.filter((d) => set.has(d.doctorUid));
  }, [doctors, favoriteDoctorUids]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {pf.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {pf.subtitle}
        </p>
      </div>

      {favoriteDoctors.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d9a43b]/40 bg-[#d9a43b]/15">
            <Star className="h-7 w-7 text-[#b68023] dark:text-[#f4d378]" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">
            {pf.emptyTitle}
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-slate-600 dark:text-slate-300">
            {pf.emptySubtitle}
          </p>
          <button
            type="button"
            onClick={onBrowseDoctors}
            className="medora-gold-button mt-5 min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] cursor-pointer"
          >
            {pf.browseDoctorsBtn}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {favoriteDoctors.map((doc) => (
            <DoctorPublicCard
              key={doc.doctorUid}
              doctor={doc}
              language={language}
              isFavorite
              onToggleFavorite={onToggleFavorite}
              onViewProfile={onViewProfile}
              onBookAppointment={onBookAppointment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
