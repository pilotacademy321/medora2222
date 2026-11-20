import { useEffect, useState, type FormEvent } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Phone,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  bookPublicAppointment,
  fetchPublicDoctorDetails,
} from '../../services/doctorService';
import type {
  DoctorSlotOption,
  PublicDoctorCard as PublicDoctorCardModel,
} from '../../types/doctor';
import type { DoctorReviewRecord } from '../../types/patient';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';

interface DoctorPublicProfileModalProps {
  doctor: PublicDoctorCardModel;
  focusBooking?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: (doctor: PublicDoctorCardModel) => void;
  onBooked?: () => Promise<void> | void;
  onClose: () => void;
  onRequestSignIn?: () => void;
}

export function DoctorPublicProfileModal({
  doctor: initialDoctor,
  focusBooking = false,
  isFavorite = false,
  onToggleFavorite,
  onBooked,
  onClose,
  onRequestSignIn,
}: DoctorPublicProfileModalProps) {
  const { language, firebaseUser, userAccount } = useMedora();
  const dc = DOCTOR_TRANSLATIONS[language].directory;
  const ds = PATIENT_TRANSLATIONS[language].doctorSearch;
  const fallbackTitle = DOCTOR_TRANSLATIONS[language].promoBanner.noBannerFallbackTitle;

  const [doctor, setDoctor] = useState<PublicDoctorCardModel>(initialDoctor);
  const [slots, setSlots] = useState<DoctorSlotOption[]>([]);
  const [reviews, setReviews] = useState<DoctorReviewRecord[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<DoctorSlotOption | null>(null);

  const [patientName, setPatientName] = useState(
    userAccount?.fullName || firebaseUser?.displayName || '',
  );
  const [patientPhone, setPatientPhone] = useState(userAccount?.phone || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setBannerError(false);
  }, [doctor.promotionalBannerUrl]);

  useEffect(() => {
    setAvatarError(false);
  }, [doctor.avatarUrl]);

  useEffect(() => {
    let active = true;
    setLoadingSlots(true);
    fetchPublicDoctorDetails(initialDoctor.doctorUid)
      .then((res) => {
        if (!active) return;
        setDoctor(res.doctor);
        setSlots(res.slots || []);
        setReviews(res.reviews || []);
        const firstOpen = (res.slots || []).find((s) => s.available) || null;
        setSelectedSlot(firstOpen);
      })
      .catch(() => {
        if (active) setSlots([]);
      })
      .finally(() => {
        if (active) setLoadingSlots(false);
      });
    return () => {
      active = false;
    };
  }, [initialDoctor.doctorUid]);

  const openSlots = slots.filter((s) => s.available);
  const dates = Array.from(new Set(openSlots.map((s) => s.date)));
  const [activeDate, setActiveDate] = useState<string>('');

  useEffect(() => {
    if (dates.length > 0 && (!activeDate || !dates.includes(activeDate))) {
      setActiveDate(dates[0]);
    }
  }, [dates, activeDate]);

  const slotsForDate = openSlots.filter((s) => s.date === activeDate);

  const handleBook = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !selectedSlot) return;
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessInfo(null);
    try {
      await bookPublicAppointment(firebaseUser, {
        doctorUid: doctor.doctorUid,
        date: selectedSlot.date,
        time: selectedSlot.time,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        reason: reason.trim(),
      });
      setSuccessInfo(`${dc.bookingSuccess} (${selectedSlot.date} · ${selectedSlot.time})`);
      const refreshed = await fetchPublicDoctorDetails(doctor.doctorUid);
      setDoctor(refreshed.doctor);
      setSlots(refreshed.slots || []);
      setReviews(refreshed.reviews || []);
      setSelectedSlot((refreshed.slots || []).find((s) => s.available) || null);
      if (onBooked) {
        await onBooked();
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'SLOT_ALREADY_BOOKED') {
        setErrorMsg(dc.bookingConflict);
        const refreshed = await fetchPublicDoctorDetails(doctor.doctorUid).catch(() => null);
        if (refreshed) {
          setSlots(refreshed.slots || []);
        }
      } else {
        setErrorMsg(code || 'Booking error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        {/* Top Close & Hero Promotional Banner */}
        <div className="relative h-56 w-full shrink-0 bg-gradient-to-br from-[#061028] via-[#0c3585] to-[#081635] sm:h-72">
          {doctor.promotionalBannerUrl && !bannerError ? (
            <img
              src={doctor.promotionalBannerUrl}
              alt={doctor.fullName}
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#d9a43b]/40 bg-[#d9a43b]/15">
                <Stethoscope className="h-8 w-8 text-[#f4d378]" aria-hidden="true" />
              </div>
              <p className="mt-3 text-base font-bold text-[#f4d378]">{fallbackTitle}</p>
              <p className="mt-1 text-xs text-slate-300">{doctor.clinicName}</p>
            </div>
          )}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/35 to-transparent"
          />
          <div className="absolute end-4 top-4 flex items-center gap-2">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(doctor)}
                aria-label={isFavorite ? ds.removeFavorite : ds.addFavorite}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950 cursor-pointer"
              >
                <Star
                  className={`h-5 w-5 ${
                    isFavorite ? 'fill-[#f4d378] text-[#f4d378]' : 'text-white'
                  }`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/70 text-white hover:bg-slate-950 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="absolute inset-x-6 bottom-5 flex items-end gap-4 text-white">
            {doctor.avatarUrl && !avatarError && (
              <img
                src={doctor.avatarUrl}
                alt={doctor.fullName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                className="h-16 w-16 shrink-0 rounded-2xl border-2 border-[#d9a43b] object-cover bg-slate-900"
              />
            )}
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold sm:text-2xl">{doctor.fullName}</h2>
              <p className="truncate text-sm font-medium text-[#f4d378]">
                {doctor.specialty}
                {doctor.subSpecialty ? ` · ${doctor.subSpecialty}` : ''}
              </p>
              {doctor.promotionalTagline && (
                <p className="mt-0.5 truncate text-xs text-slate-200">
                  {doctor.promotionalTagline}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Physician & Clinic Details */}
          <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {dc.profileBioTitle}
              </h3>
              <p className="mt-1.5 text-sm font-semibold text-[#0c3585] dark:text-[#f4d378]">
                {doctor.clinicName}
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {doctor.governorate} · {doctor.district} — {doctor.workAddress}
                </span>
              </p>
              {doctor.mapLocationUrl && (
                <a
                  href={doctor.mapLocationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378]"
                >
                  <span>{ds.openMap}</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}
              {doctor.professionalPhone && (
                <a
                  href={`tel:${doctor.professionalPhone.replace(/\s+/g, '')}`}
                  className="mt-1.5 flex w-fit items-center gap-1.5 font-latin text-xs font-semibold text-slate-700 hover:text-[#0c3585] dark:text-slate-200 dark:hover:text-[#f4d378]"
                  dir="ltr"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{doctor.professionalPhone}</span>
                </a>
              )}
            </div>
            <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <p>
                <Clock className="me-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                {doctor.workDaysAndHours} ({doctor.consultationDurationMinutes} min)
              </p>
              <p className="font-semibold text-slate-900 tabular-nums dark:text-white">
                {doctor.showFee && typeof doctor.consultationFee === 'number' && doctor.consultationFee > 0
                  ? `${doctor.consultationFee.toLocaleString()} ${dc.feeUnit}`
                  : dc.feeOnRequest}
              </p>
              {typeof doctor.averageRating === 'number' &&
                (doctor.reviewCount || 0) > 0 && (
                  <p className="flex items-center gap-1.5 font-latin font-bold text-[#b68023] tabular-nums dark:text-[#f4d378]">
                    <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                    <span>{doctor.averageRating.toFixed(1)}</span>
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      ({doctor.reviewCount} {ds.verifiedReviewsCount})
                    </span>
                  </p>
                )}
              {doctor.clinicServices && doctor.clinicServices.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {doctor.clinicServices.join(' · ')}
                </p>
              )}
            </div>
          </div>

          {/* Available Appointment Slots */}
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {dc.availableSlotsTitle}
            </h3>

            {loadingSlots ? (
              <div className="mt-3 h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/60" />
            ) : dates.length === 0 ? (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                {dc.noSlotsAvailable}
              </p>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {dates.map((dt) => (
                    <button
                      key={dt}
                      type="button"
                      onClick={() => {
                        setActiveDate(dt);
                        const firstForDay = openSlots.find((s) => s.date === dt) || null;
                        setSelectedSlot(firstForDay);
                      }}
                      className={`min-h-[38px] rounded-lg border px-3 py-1.5 font-latin text-xs font-semibold tabular-nums cursor-pointer ${
                        activeDate === dt
                          ? 'border-[#0c3585] bg-[#0c3585] text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                      }`}
                    >
                      <Calendar className="me-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                      {dt}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {slotsForDate.map((slot) => {
                    const active = selectedSlot?.slotKey === slot.slotKey;
                    return (
                      <button
                        key={slot.slotKey}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`min-h-[40px] rounded-lg border px-3.5 py-2 font-latin text-xs font-bold tabular-nums cursor-pointer ${
                          active
                            ? 'border-[#d9a43b] bg-[#d9a43b]/20 text-slate-950 ring-1 ring-[#d9a43b] dark:text-[#f4d378]'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0c3585] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Atomic Booking Form — rendered only when the doctor actually has open slots */}
          {!loadingSlots && openSlots.length > 0 && (focusBooking || selectedSlot) && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/60">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {dc.bookNowTitle}
              </h3>

              {successInfo && (
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{successInfo}</span>
                </div>
              )}

              {errorMsg && (
                <div className="mt-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
                  {errorMsg}
                </div>
              )}

              {!firebaseUser ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {dc.signInRequiredToBook}
                  </p>
                  {onRequestSignIn && (
                    <button
                      type="button"
                      onClick={onRequestSignIn}
                      className="medora-gold-button min-h-[42px] rounded-xl px-5 py-2 text-xs font-bold text-[#040917] cursor-pointer"
                    >
                      Google Sign-In
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleBook} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {DOCTOR_TRANSLATIONS[language].appointments.patientName}
                    </label>
                    <input
                      type="text"
                      required
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {DOCTOR_TRANSLATIONS[language].appointments.patientPhone}
                    </label>
                    <input
                      type="tel"
                      required
                      dir="ltr"
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {DOCTOR_TRANSLATIONS[language].appointments.reasonLabel}
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <span className="font-latin text-xs font-semibold text-slate-600 tabular-nums dark:text-slate-300" dir="ltr">
                      {selectedSlot ? `${selectedSlot.date} · ${selectedSlot.time}` : '—'}
                    </span>
                    <button
                      type="submit"
                      disabled={submitting || !selectedSlot}
                      className="medora-gold-button min-h-[44px] rounded-xl px-6 py-2.5 text-sm font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? '...' : dc.confirmBookingBtn}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Approved Patient Reviews */}
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {ds.reviewsHeading}
            </h3>
            {reviews.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {ds.noReviewsYet}
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {reviews.map((rev) => (
                  <div
                    key={rev.reviewId}
                    className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {rev.patientName}
                      </span>
                      <span className="inline-flex items-center gap-1 font-latin font-bold text-[#b68023] tabular-nums dark:text-[#f4d378]">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {rev.rating}/5
                      </span>
                    </div>
                    <p className="mt-1.5 text-slate-700 dark:text-slate-300">
                      {rev.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
