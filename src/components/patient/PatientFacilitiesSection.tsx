import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  CalendarCheck2,
  CheckCircle2,
  Clock,
  ExternalLink,
  FlaskConical,
  Home,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import {
  bookLabAppointment,
  cancelLabBooking,
  fetchLabsDirectory,
  requestLabHomeCollection,
  submitPatientLabReview,
} from '../../services/patientService';
import type { Language } from '../../types/medora';
import type { LabHomeCollectionRequest, LabOfferPackage } from '../../types/lab';
import type {
  FacilityBookingRecord,
  FacilityServiceCatalogItem,
  LabDirectoryCard,
} from '../../types/patient';

export interface NormalizedFacility {
  uid: string;
  name: string;
  nameEn?: string;
  governorate: string;
  district: string;
  address: string;
  mapLocationUrl?: string;
  phone?: string;
  workDaysAndHours: string;
  pricingSummary?: string;
  services: string[];
  catalog: FacilityServiceCatalogItem[];
  homeCollectionEnabled?: boolean;
  homeCollectionFeeIqd?: number;
  averageRating?: number;
  reviewCount?: number;
  activeOffers?: LabOfferPackage[];
}

export function normalizeLabFacility(r: LabDirectoryCard): NormalizedFacility {
  return {
    uid: r.labUid,
    name: r.labNameAr,
    nameEn: r.labNameEn,
    governorate: r.governorate,
    district: r.district,
    address: r.address,
    mapLocationUrl: r.mapLocationUrl,
    phone: r.professionalPhone,
    workDaysAndHours: r.workDaysAndHours,
    services: r.labServices || [],
    catalog: r.serviceCatalog || [],
    homeCollectionEnabled: r.homeCollectionEnabled,
    homeCollectionFeeIqd: r.homeCollectionFeeIqd,
    averageRating: r.averageRating,
    reviewCount: r.reviewCount,
    activeOffers: r.activeOffers || [],
  };
}

function matchesGov(val: string, govId: string): boolean {
  const gov = IRAQ_GOVERNORATES.find((g) => g.id === govId);
  if (!gov) return false;
  const n = val.trim().toLowerCase();
  return (
    n === gov.id.toLowerCase() ||
    n === gov.ar.toLowerCase() ||
    n === gov.en.toLowerCase()
  );
}

export function FacilityDirectoryCard({
  fac,
  language,
  mode,
  onBook,
  onRequestHomeCollection,
  onRateLab,
  onMessageLab,
}: {
  fac: NormalizedFacility;
  language: Language;
  mode?: 'lab';
  onBook: (facility: NormalizedFacility) => void;
  onRequestHomeCollection?: (facility: NormalizedFacility) => void;
  onRateLab?: (facility: NormalizedFacility) => void;
  onMessageLab?: (facility: NormalizedFacility) => void;
}) {
  const pf = PATIENT_TRANSLATIONS[language].facilities;
  const ds = PATIENT_TRANSLATIONS[language].doctorSearch;
  const isAr = language === 'ar';

  return (
    <article className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {fac.name}
            </h2>
            {fac.nameEn && (
              <p className="font-latin text-xs text-slate-500 dark:text-slate-400">
                {fac.nameEn}
              </p>
            )}
          </div>
          {mode === 'lab' && typeof fac.averageRating === 'number' && fac.reviewCount && fac.reviewCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-500/30 px-2 py-1 font-latin text-xs font-bold text-amber-700 dark:text-amber-300 shrink-0">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span>{fac.averageRating.toFixed(1)}</span>
              <span className="text-[10px] opacity-80">({fac.reviewCount})</span>
            </span>
          ) : null}
        </div>

        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {fac.governorate}
              {fac.district ? ` · ${fac.district}` : ''}
              {fac.address ? ` — ${fac.address}` : ''}
            </span>
          </p>
          <p className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {pf.workingHoursLabel}: {fac.workDaysAndHours}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-4">
            {fac.phone && (
              <a
                href={`tel:${fac.phone.replace(/\s+/g, '')}`}
                dir="ltr"
                className="inline-flex items-center gap-1 font-latin font-semibold text-slate-700 hover:text-[#0c3585] dark:text-slate-200 dark:hover:text-[#f4d378]"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{fac.phone}</span>
              </a>
            )}
            {fac.mapLocationUrl && (
              <a
                href={fac.mapLocationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378]"
              >
                <span>{ds.openMap}</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>

        {fac.pricingSummary && (
          <p className="text-xs text-slate-700 dark:text-slate-200">
            <span className="font-bold">{pf.pricingLabel}: </span>
            {fac.pricingSummary}
          </p>
        )}

        {fac.activeOffers && fac.activeOffers.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
              <Tag className="h-3.5 w-3.5" />
              <span>{isAr ? 'العروض والباقات المتاحة' : 'Active Offers & Packages'}</span>
            </p>
            <div className="space-y-1.5">
              {fac.activeOffers.slice(0, 3).map((off) => (
                <div
                  key={off.offerId}
                  className="rounded-xl border border-amber-200/80 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{off.title}</span>
                    <span className="font-latin tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                      {off.offerPriceIqd.toLocaleString()} IQD
                    </span>
                  </div>
                  {off.description && (
                    <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">{off.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {pf.servicesHeading}
          </p>
          {fac.catalog.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {fac.catalog.slice(0, 6).map((item) => (
                <li
                  key={item.name}
                  className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {item.name}
                    </span>
                    {typeof item.priceIqd === 'number' && item.priceIqd > 0 && (
                      <span className="font-latin font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                        {item.priceIqd.toLocaleString()} IQD
                      </span>
                    )}
                  </div>
                  {item.prepInstructions && (
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                      {pf.prepLabel}: {item.prepInstructions}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {fac.services.join(' · ') || '—'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {fac.catalog.length > 0 || fac.services.length > 0 ? (
          <button
            type="button"
            onClick={() => onBook(fac)}
            className="medora-gold-button inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
            <span>{pf.bookServiceBtn}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onBook(fac)}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <span>{PATIENT_TRANSLATIONS[language].homeAds.viewDetailsBtn}</span>
          </button>
        )}

        {mode === 'lab' && (
          <div className="flex flex-wrap gap-2">
            {fac.homeCollectionEnabled !== false && onRequestHomeCollection && (
              <button
                type="button"
                onClick={() => onRequestHomeCollection(fac)}
                className="flex-1 min-h-[38px] rounded-xl border border-[#0c3585]/30 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-500/30 px-3 text-[11px] font-bold text-[#0c3585] dark:text-blue-300 inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Home className="h-3.5 w-3.5" />
                <span>{isAr ? 'طلب سحب منزلي' : 'Home Collection'}</span>
              </button>
            )}
            {onRateLab && (
              <button
                type="button"
                onClick={() => onRateLab(fac)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <Star className="h-3.5 w-3.5 text-amber-500" />
                <span>{isAr ? 'تقييم / شكوى' : 'Rate'}</span>
              </button>
            )}
            {onMessageLab && (
              <button
                type="button"
                onClick={() => onMessageLab(fac)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-[11px] font-bold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{isAr ? 'مراسلة' : 'Chat'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function FacilityBookingModal({
  mode,
  facility,
  firebaseUser,
  defaultPhone = '',
  language,
  onClose,
  onBooked,
}: {
  mode: 'lab';
  facility: NormalizedFacility;
  firebaseUser: User;
  defaultPhone?: string;
  language: Language;
  onClose: () => void;
  onBooked: () => Promise<void>;
}) {
  const pf = PATIENT_TRANSLATIONS[language].facilities;

  const availableServices =
    facility.catalog.length > 0
      ? facility.catalog.map((c) => c.name)
      : facility.services;
  const [selectedServices, setSelectedServices] = useState<string[]>(() =>
    availableServices.length > 0 ? [availableServices[0]] : [],
  );
  const [bookingDate, setBookingDate] = useState(() =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [bookingTime, setBookingTime] = useState('10:00');
  const [bookingNotes, setBookingNotes] = useState('');
  const [bookingPhone, setBookingPhone] = useState(defaultPhone);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedServices.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await bookLabAppointment(firebaseUser, {
        labUid: facility.uid,
        requestedServices: selectedServices,
        date: bookingDate,
        time: bookingTime,
        notes: bookingNotes.trim(),
        patientPhone: bookingPhone.trim(),
      });
      await onBooked();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'FACILITY_BOOK_FAILED');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleBook(e)}
        className="flex max-h-[88dvh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {facility.name}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {facility.governorate}
              {facility.district ? ` · ${facility.district}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {availableServices.length === 0 ? (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
              {facility.address && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#d9a43b]" aria-hidden="true" />
                  <span>{facility.address}</span>
                </p>
              )}
              {facility.workDaysAndHours && (
                <p className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-[#d9a43b]" aria-hidden="true" />
                  <span>
                    {pf.workingHoursLabel}: {facility.workDaysAndHours}
                  </span>
                </p>
              )}
              {facility.phone && (
                <a
                  href={`tel:${facility.phone.replace(/\s+/g, '')}`}
                  dir="ltr"
                  className="inline-flex items-center gap-1.5 font-latin font-semibold text-[#0c3585] dark:text-[#f4d378]"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{facility.phone}</span>
                </a>
              )}
              <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
                {pf.noServicesAvailable}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-xl border border-slate-300 px-5 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto">
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pf.selectServicesLabel}
                </p>
                <div className="mt-2 space-y-2">
                  {availableServices.map((srv) => {
                    const checked = selectedServices.includes(srv);
                    return (
                      <label
                        key={srv}
                        className="flex min-h-[40px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedServices((prev) => [...prev, srv]);
                            } else {
                              setSelectedServices((prev) =>
                                prev.filter((item) => item !== srv),
                              );
                            }
                          }}
                          className="h-4 w-4 accent-[#0c3585]"
                        />
                        <span>{srv}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {pf.dateLabel}
                  </label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {pf.timeLabel}
                  </label>
                  <input
                    type="time"
                    required
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {PATIENT_TRANSLATIONS[language].settings.phoneLabel}
                </label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={bookingPhone}
                  onChange={(e) => setBookingPhone(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pf.notesLabel}
                </label>
                <textarea
                  rows={2}
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {errorMsg && (
                <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                  {errorMsg}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting || selectedServices.length === 0}
                className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? '...' : pf.confirmBookingBtn}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

interface PatientFacilitiesSectionProps {
  mode: 'lab';
  firebaseUser: User;
  bookings: FacilityBookingRecord[];
  homeCollections?: LabHomeCollectionRequest[];
  defaultPhone?: string;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
  onOpenLabChat?: (labUid: string) => Promise<void> | void;
}

export function PatientFacilitiesSection({
  mode,
  firebaseUser,
  bookings,
  homeCollections = [],
  defaultPhone = '',
  language,
  onRefreshWorkspace,
  onOpenLabChat,
}: PatientFacilitiesSectionProps) {
  const pf = PATIENT_TRANSLATIONS[language].facilities;
  const mr = PATIENT_TRANSLATIONS[language].medicalRecord;
  const isAr = language === 'ar';

  const [facilities, setFacilities] = useState<NormalizedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [governorateId, setGovernorateId] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookingTarget, setBookingTarget] = useState<NormalizedFacility | null>(
    null,
  );

  // Home Collection Request modal state
  const [hcTarget, setHcTarget] = useState<NormalizedFacility | null>(null);
  const [hcAddress, setHcAddress] = useState('');
  const [hcPhone, setHcPhone] = useState(defaultPhone);
  const [hcDate, setHcDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [hcWindow, setHcWindow] = useState('09:00 - 12:00');
  const [hcTests, setHcTests] = useState<string[]>([]);
  const [hcCustomTest, setHcCustomTest] = useState('');
  const [hcNotes, setHcNotes] = useState('');
  const [hcSubmitting, setHcSubmitting] = useState(false);

  // Lab Review / Complaint modal state
  const [reviewTarget, setReviewTarget] = useState<NormalizedFacility | null>(null);
  const [reviewType, setReviewType] = useState<'review' | 'complaint'>('review');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg(null);
    const load = async () => {
      try {
        const rows: LabDirectoryCard[] =
          await fetchLabsDirectory(firebaseUser);
        if (!active) return;
        setFacilities(rows.map(normalizeLabFacility));
      } catch (err) {
        if (active) {
          setErrorMsg(
            err instanceof Error ? err.message : 'FACILITY_FETCH_FAILED',
          );
          setFacilities([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [mode, firebaseUser]);

  const filteredFacilities = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities.filter((f) => {
      if (governorateId && !matchesGov(f.governorate, governorateId)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        f.name,
        f.nameEn || '',
        f.address,
        f.governorate,
        f.district,
        ...f.services,
        ...f.catalog.map((c) => c.name),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [facilities, search, governorateId]);

  const handleCancelBooking = async (bookingId: string) => {
    setErrorMsg(null);
    try {
      await cancelLabBooking(firebaseUser, bookingId);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'FACILITY_CANCEL_FAILED');
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/15">
            <FlaskConical
              className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {pf.labsTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {pf.labsSubtitle}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search
              className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pf.searchPlaceholder}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-10 pe-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <select
            value={governorateId}
            onChange={(e) => setGovernorateId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">{pf.allGovernorates}</option>
            {IRAQ_GOVERNORATES.map((gov) => (
              <option key={gov.id} value={gov.id}>
                {language === 'ar' ? gov.ar : gov.en}
              </option>
            ))}
          </select>
        </div>
      </div>

      {feedbackMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Approved Institutions Directory */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-56 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : filteredFacilities.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
          {pf.noLabs}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {filteredFacilities.map((fac) => (
            <FacilityDirectoryCard
              key={fac.uid}
              fac={fac}
              language={language}
              mode={mode}
              onBook={(target) => {
                setFeedbackMsg(null);
                setErrorMsg(null);
                setBookingTarget(target);
              }}
              onRequestHomeCollection={
                mode === 'lab'
                  ? (target) => {
                      setFeedbackMsg(null);
                      setErrorMsg(null);
                      setHcTarget(target);
                      setHcPhone(defaultPhone);
                      setHcTests(
                        target.catalog.length > 0
                          ? [target.catalog[0].name]
                          : target.services.length > 0
                            ? [target.services[0]]
                            : [],
                      );
                    }
                  : undefined
              }
              onRateLab={
                mode === 'lab'
                  ? (target) => {
                      setFeedbackMsg(null);
                      setErrorMsg(null);
                      setReviewTarget(target);
                      setReviewType('review');
                      setReviewRating(5);
                      setReviewComment('');
                    }
                  : undefined
              }
              onMessageLab={
                mode === 'lab' && onOpenLabChat
                  ? (target) => {
                      void onOpenLabChat(target.uid);
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* My Facility Bookings & Results */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">
          {pf.myBookingsTitle}
        </h2>
        {bookings.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {pf.noBookings}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {bookings.map((bk) => (
              <article
                key={bk.bookingId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {bk.facilityName}
                    </h3>
                    <p className="mt-0.5 text-xs text-[#0c3585] dark:text-[#f4d378]">
                      {bk.requestedServices.join(' · ')}
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {pf.statuses[bk.status]}
                    </span>
                    <p
                      className="mt-1 font-latin text-xs text-slate-600 tabular-nums dark:text-slate-300"
                      dir="ltr"
                    >
                      {bk.date} · {bk.time}
                    </p>
                  </div>
                </div>

                {bk.resultSummary && (
                  <p className="mt-2.5 text-xs text-slate-700 dark:text-slate-200">
                    <span className="font-bold">{pf.resultsHeading}: </span>
                    {bk.resultSummary}
                  </p>
                )}

                {bk.resultFiles.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {bk.resultFiles.map((f, idx) => (
                      <a
                        key={`${bk.bookingId}-res-${idx}`}
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#0c3585]/30 bg-white px-3 text-xs font-bold text-[#0c3585] hover:underline dark:border-[#d9a43b]/40 dark:bg-slate-950 dark:text-[#f4d378]"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{f.name || mr.openResultFile}</span>
                      </a>
                    ))}
                  </div>
                )}

                {(bk.status === 'pending' || bk.status === 'confirmed') && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleCancelBooking(bk.bookingId)}
                      className="text-xs font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                    >
                      {pf.cancelBookingBtn}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {mode === 'lab' && homeCollections.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAr ? 'طلبات السحب المنزلي الخاصة بي' : 'My Home Collection Requests'}
          </h2>
          <div className="mt-4 space-y-3">
            {homeCollections.map((hc) => (
              <article
                key={hc.requestId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 text-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {hc.labNameAr || 'MEDORA LAB'}
                    </h3>
                    <p className="mt-0.5 text-[#0c3585] dark:text-[#f4d378]">
                      {hc.requestedTests.join(' · ')}
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{hc.address}</p>
                    {hc.assignedStaffName && (
                      <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
                        {isAr ? 'فني السحب:' : 'Phlebotomist:'} {hc.assignedStaffName}
                        {hc.assignedStaffPhone ? ` (${hc.assignedStaffPhone})` : ''}
                      </p>
                    )}
                  </div>
                  <div className="text-end">
                    <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {hc.status}
                    </span>
                    <p className="mt-1 font-latin tabular-nums text-slate-500">
                      {hc.requestedDate} · {hc.preferredWindow}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {bookingTarget && (
        <FacilityBookingModal
          mode={mode}
          facility={bookingTarget}
          firebaseUser={firebaseUser}
          defaultPhone={defaultPhone}
          language={language}
          onClose={() => setBookingTarget(null)}
          onBooked={async () => {
            setFeedbackMsg(pf.bookingSuccessMsg);
            await onRefreshWorkspace();
          }}
        />
      )}

      {/* Home Collection Request Modal */}
      {hcTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setHcTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const combinedTests = hcCustomTest.trim()
                ? [...hcTests, hcCustomTest.trim()]
                : hcTests;
              if (!hcAddress.trim() || combinedTests.length === 0) return;
              setHcSubmitting(true);
              setErrorMsg(null);
              try {
                await requestLabHomeCollection(firebaseUser, {
                  labUid: hcTarget.uid,
                  address: hcAddress.trim(),
                  governorate: hcTarget.governorate,
                  district: hcTarget.district,
                  requestedDate: hcDate,
                  preferredWindow: hcWindow,
                  requestedTests: combinedTests,
                  patientPhone: hcPhone.trim(),
                  notes: hcNotes.trim(),
                });
                setFeedbackMsg(
                  isAr ? 'تم إرسال طلب السحب المنزلي للمختبر بنجاح.' : 'Home collection request submitted.',
                );
                await onRefreshWorkspace();
                setHcTarget(null);
              } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : 'HOME_COLLECTION_FAILED');
              } finally {
                setHcSubmitting(false);
              }
            }}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a] space-y-4 max-h-[90vh] overflow-y-auto text-xs"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isAr ? 'طلب سحب عينة منزلي' : 'Request Home Sample Collection'}
                </h3>
                <p className="text-slate-500">{hcTarget.name}</p>
              </div>
              <button type="button" onClick={() => setHcTarget(null)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {typeof hcTarget.homeCollectionFeeIqd === 'number' && hcTarget.homeCollectionFeeIqd > 0 && (
              <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[#0c3585] dark:text-blue-300 font-bold">
                {isAr ? 'أجور السحب المنزلي:' : 'Collection Fee:'}{' '}
                <span className="font-latin tabular-nums">
                  {hcTarget.homeCollectionFeeIqd.toLocaleString()} IQD
                </span>
              </div>
            )}

            <div>
              <label className="block font-semibold mb-1">{isAr ? 'العنوان بالتفصيل' : 'Full Home Address'}</label>
              <input
                required
                value={hcAddress}
                onChange={(e) => setHcAddress(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold mb-1">{pf.dateLabel}</label>
                <input
                  type="date"
                  required
                  value={hcDate}
                  onChange={(e) => setHcDate(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 font-latin text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'الفترة الزمنية' : 'Preferred Window'}</label>
                <input
                  required
                  value={hcWindow}
                  onChange={(e) => setHcWindow(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 font-latin text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">{PATIENT_TRANSLATIONS[language].settings.phoneLabel}</label>
              <input
                required
                dir="ltr"
                value={hcPhone}
                onChange={(e) => setHcPhone(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 font-latin text-slate-900 dark:text-white"
              />
            </div>

            {hcTarget.catalog.length > 0 && (
              <div>
                <label className="block font-semibold mb-1">{pf.selectServicesLabel}</label>
                <div className="max-h-32 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 p-2">
                  {hcTarget.catalog.map((c) => (
                    <label key={c.name} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hcTests.includes(c.name)}
                        onChange={(e) =>
                          setHcTests((prev) =>
                            e.target.checked ? [...prev, c.name] : prev.filter((x) => x !== c.name),
                          )
                        }
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold mb-1">
                {isAr ? 'تحاليل إضافية (اختياري)' : 'Additional Tests (Optional)'}
              </label>
              <input
                value={hcCustomTest}
                onChange={(e) => setHcCustomTest(e.target.value)}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">{pf.notesLabel}</label>
              <textarea
                rows={2}
                value={hcNotes}
                onChange={(e) => setHcNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-2.5 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setHcTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={hcSubmitting}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold text-[#040917] cursor-pointer disabled:opacity-60"
              >
                {hcSubmitting ? '...' : isAr ? 'إرسال الطلب' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lab Review / Complaint Modal */}
      {reviewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setReviewTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!reviewComment.trim()) return;
              setReviewSubmitting(true);
              setErrorMsg(null);
              try {
                await submitPatientLabReview(firebaseUser, {
                  labUid: reviewTarget.uid,
                  rating: reviewRating,
                  reviewType,
                  comment: reviewComment.trim(),
                });
                setFeedbackMsg(
                  isAr ? 'تم إرسال تقييمك للمختبر بنجاح.' : 'Review submitted successfully.',
                );
                await onRefreshWorkspace();
                setReviewTarget(null);
              } catch (err) {
                setErrorMsg(err instanceof Error ? err.message : 'REVIEW_FAILED');
              } finally {
                setReviewSubmitting(false);
              }
            }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a] space-y-4 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr ? `تقييم أو شكوى — ${reviewTarget.name}` : `Review — ${reviewTarget.name}`}
              </h3>
              <button type="button" onClick={() => setReviewTarget(null)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewType('review')}
                className={`flex-1 min-h-[38px] rounded-xl font-bold cursor-pointer ${
                  reviewType === 'review'
                    ? 'bg-[#0c3585] text-white'
                    : 'border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isAr ? 'تقييم تجربة' : 'Review'}
              </button>
              <button
                type="button"
                onClick={() => setReviewType('complaint')}
                className={`flex-1 min-h-[38px] rounded-xl font-bold cursor-pointer ${
                  reviewType === 'complaint'
                    ? 'bg-rose-600 text-white'
                    : 'border border-slate-200 dark:border-slate-700'
                }`}
              >
                {isAr ? 'تقديم شكوى' : 'Complaint'}
              </button>
            </div>

            <div>
              <label className="block font-semibold mb-1.5">{isAr ? 'التقييم بالنجوم' : 'Rating'}</label>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">{isAr ? 'التفاصيل والتعليق' : 'Comment'}</label>
              <textarea
                rows={3}
                required
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 dark:border-slate-700 px-4 font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={reviewSubmitting}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold text-[#040917] cursor-pointer disabled:opacity-60"
              >
                {reviewSubmitting ? '...' : isAr ? 'إرسال' : 'Submit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
