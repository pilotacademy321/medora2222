import { useMemo, useState } from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import type { PublicDoctorCard as PublicDoctorCardModel } from '../../types/doctor';
import type { Language } from '../../types/medora';
import { DoctorPublicCard } from '../directory/DoctorPublicCard';

interface PatientDoctorSearchSectionProps {
  doctors: PublicDoctorCardModel[];
  favoriteDoctorUids: string[];
  language: Language;
  onToggleFavorite: (doctor: PublicDoctorCardModel) => void;
  onViewProfile: (doctor: PublicDoctorCardModel) => void;
  onBookAppointment: (doctor: PublicDoctorCardModel) => void;
}

function matchesGov(docGov: string, govId: string): boolean {
  const gov = IRAQ_GOVERNORATES.find((g) => g.id === govId);
  if (!gov) return false;
  const normalized = docGov.trim().toLowerCase();
  return (
    normalized === gov.id.toLowerCase() ||
    normalized === gov.ar.toLowerCase() ||
    normalized === gov.en.toLowerCase()
  );
}

function matchesDistrict(
  docDistrict: string,
  districtObj: { ar: string; en: string },
): boolean {
  const normalized = docDistrict.trim().toLowerCase();
  return (
    normalized === districtObj.ar.toLowerCase() ||
    normalized === districtObj.en.toLowerCase()
  );
}

export function PatientDoctorSearchSection({
  doctors,
  favoriteDoctorUids,
  language,
  onToggleFavorite,
  onViewProfile,
  onBookAppointment,
}: PatientDoctorSearchSectionProps) {
  const ds = PATIENT_TRANSLATIONS[language].doctorSearch;
  const [showFilters, setShowFilters] = useState(true);
  const [query, setQuery] = useState('');
  const [governorateId, setGovernorateId] = useState('');
  const [districtValue, setDistrictValue] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [gender, setGender] = useState<'all' | 'male' | 'female'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  const selectedGov = useMemo(
    () => IRAQ_GOVERNORATES.find((g) => g.id === governorateId) || null,
    [governorateId],
  );

  const districtOptions = useMemo(() => {
    if (selectedGov) return selectedGov.districts;
    return IRAQ_GOVERNORATES.flatMap((g) => g.districts);
  }, [selectedGov]);

  const specialties = useMemo(() => {
    const unique = new Set<string>();
    for (const d of doctors) {
      if (d.specialty?.trim()) unique.add(d.specialty.trim());
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [doctors]);

  const favoriteSet = useMemo(
    () => new Set(favoriteDoctorUids),
    [favoriteDoctorUids],
  );

  const filteredDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (q) {
        const haystack = [
          doc.fullName,
          doc.specialty,
          doc.subSpecialty || '',
          doc.clinicName,
          doc.workAddress,
          doc.governorate,
          doc.district,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (governorateId && !matchesGov(doc.governorate, governorateId)) {
        return false;
      }

      if (districtValue) {
        const matchedDist = districtOptions.find(
          (d) => d.ar === districtValue || d.en === districtValue,
        );
        if (matchedDist && !matchesDistrict(doc.district, matchedDist)) {
          return false;
        }
      }

      if (specialty && doc.specialty.trim() !== specialty) {
        return false;
      }

      if (gender !== 'all' && doc.gender !== gender) {
        return false;
      }

      if (onlyAvailable && !doc.hasAvailableSlots) {
        return false;
      }

      return true;
    });
  }, [
    doctors,
    query,
    governorateId,
    districtValue,
    districtOptions,
    specialty,
    gender,
    onlyAvailable,
  ]);

  const resetAll = () => {
    setQuery('');
    setGovernorateId('');
    setDistrictValue('');
    setSpecialty('');
    setGender('all');
    setOnlyAvailable(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {ds.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {ds.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{ds.toggleFilters}</span>
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{ds.resetFilters}</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={ds.searchPlaceholder}
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-10 pe-4 text-sm text-slate-900 focus:border-[#0c3585] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-[#d9a43b]"
          />
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">{ds.allSpecialties}</option>
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
                </option>
              ))}
            </select>

            <select
              value={governorateId}
              onChange={(e) => {
                setGovernorateId(e.target.value);
                setDistrictValue('');
              }}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">{ds.allGovernorates}</option>
              {IRAQ_GOVERNORATES.map((gov) => (
                <option key={gov.id} value={gov.id}>
                  {language === 'ar' ? gov.ar : gov.en}
                </option>
              ))}
            </select>

            <select
              value={districtValue}
              onChange={(e) => setDistrictValue(e.target.value)}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="">{ds.allDistricts}</option>
              {districtOptions.map((dist) => (
                <option key={`${dist.en}-${dist.ar}`} value={dist.ar}>
                  {language === 'ar' ? dist.ar : dist.en}
                </option>
              ))}
            </select>

            <select
              value={gender}
              onChange={(e) =>
                setGender(e.target.value as 'all' | 'male' | 'female')
              }
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="all">{ds.allGenders}</option>
              <option value="male">{ds.maleDoctor}</option>
              <option value="female">{ds.femaleDoctor}</option>
            </select>

            <label className="flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{ds.onlyAvailable}</span>
            </label>
          </div>
        )}
      </div>

      {filteredDoctors.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
          {ds.noDoctors}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredDoctors.map((doc) => (
            <DoctorPublicCard
              key={doc.doctorUid}
              doctor={doc}
              language={language}
              isFavorite={favoriteSet.has(doc.doctorUid)}
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
