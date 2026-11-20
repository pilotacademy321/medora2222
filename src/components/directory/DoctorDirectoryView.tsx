import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import { fetchPublicDoctorDirectory } from '../../services/doctorService';
import type { PublicDoctorCard as PublicDoctorCardModel } from '../../types/doctor';
import { AmbientBackdrop } from '../AmbientBackdrop';
import { MedoraUtilityBar } from '../MedoraUtilityBar';
import { DoctorPublicCard } from './DoctorPublicCard';
import { DoctorPublicProfileModal } from './DoctorPublicProfileModal';

interface DoctorDirectoryViewProps {
  onBack: () => void;
  onRequestSignIn?: () => void;
}

export function DoctorDirectoryView({
  onBack,
  onRequestSignIn,
}: DoctorDirectoryViewProps) {
  const { language } = useMedora();
  const dc = DOCTOR_TRANSLATIONS[language].directory;
  const BackIcon = language === 'ar' ? ArrowRight : ArrowLeft;

  const [doctors, setDoctors] = useState<PublicDoctorCardModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('');
  const [govFilter, setGovFilter] = useState('');

  const [activeDoctor, setActiveDoctor] = useState<{
    doctor: PublicDoctorCardModel;
    focusBooking: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchPublicDoctorDirectory()
      .then((list) => {
        if (active) setDoctors(list);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Error');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const specialties = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.specialty).filter(Boolean))),
    [doctors],
  );
  const governorates = useMemo(
    () => Array.from(new Set(doctors.map((d) => d.governorate).filter(Boolean))),
    [doctors],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return doctors.filter((d) => {
      if (specialtyFilter && d.specialty !== specialtyFilter) return false;
      if (govFilter && d.governorate !== govFilter) return false;
      if (!q) return true;
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.clinicName.toLowerCase().includes(q) ||
        d.district.toLowerCase().includes(q) ||
        d.governorate.toLowerCase().includes(q)
      );
    });
  }, [doctors, searchQuery, specialtyFilter, govFilter]);

  return (
    <section className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 lg:px-12">
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar onBackToPortals={onBack} />

      <main className="relative z-10 mx-auto my-6 w-full max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
            >
              <BackIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{dc.backBtn}</span>
            </button>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {dc.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {dc.subtitle}
            </p>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 dark:border-slate-800 dark:bg-[#07122a]/90 md:grid-cols-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={dc.searchPlaceholder}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <select
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">{dc.allSpecialties}</option>
            {specialties.map((sp) => (
              <option key={sp} value={sp}>
                {sp}
              </option>
            ))}
          </select>

          <select
            value={govFilter}
            onChange={(e) => setGovFilter(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">{dc.allGovernorates}</option>
            {governorates.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-[#07122a]/70"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]/90 dark:text-slate-400">
            {dc.noDoctorsFound}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((doc) => (
              <DoctorPublicCard
                key={doc.doctorUid}
                doctor={doc}
                language={language}
                onViewProfile={(d) =>
                  setActiveDoctor({ doctor: d, focusBooking: false })
                }
                onBookAppointment={(d) =>
                  setActiveDoctor({ doctor: d, focusBooking: true })
                }
              />
            ))}
          </div>
        )}
      </main>

      {activeDoctor && (
        <DoctorPublicProfileModal
          doctor={activeDoctor.doctor}
          focusBooking={activeDoctor.focusBooking}
          onClose={() => setActiveDoctor(null)}
          onRequestSignIn={onRequestSignIn}
        />
      )}
    </section>
  );
}
