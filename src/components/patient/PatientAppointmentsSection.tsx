import { useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Phone,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import { fetchPublicDoctorDetails } from '../../services/doctorService';
import {
  cancelPatientAppointment,
  reschedulePatientAppointment,
  submitDoctorReview,
} from '../../services/patientService';
import type { DoctorSlotOption } from '../../types/doctor';
import type { Language } from '../../types/medora';
import type { PatientWorkspaceAppointment } from '../../types/patient';

interface PatientAppointmentsSectionProps {
  firebaseUser: User;
  appointments: PatientWorkspaceAppointment[];
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

const STATUS_BADGE: Record<string, string> = {
  pending:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200',
  confirmed:
    'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200',
  checked_in:
    'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-200',
  completed:
    'border-[#0c3585]/30 bg-[#0c3585]/10 text-[#0c3585] dark:border-[#d9a43b]/40 dark:bg-[#d9a43b]/15 dark:text-[#f4d378]',
  cancelled:
    'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200',
  rejected:
    'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200',
  no_show:
    'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

export function PatientAppointmentsSection({
  firebaseUser,
  appointments,
  language,
  onRefreshWorkspace,
}: PatientAppointmentsSectionProps) {
  const pt = PATIENT_TRANSLATIONS[language].appointments;
  const ds = PATIENT_TRANSLATIONS[language].doctorSearch;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cancel modal
  const [cancelTarget, setCancelTarget] =
    useState<PatientWorkspaceAppointment | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] =
    useState<PatientWorkspaceAppointment | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [openSlots, setOpenSlots] = useState<DoctorSlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<DoctorSlotOption | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  // Review modal
  const [reviewTarget, setReviewTarget] =
    useState<PatientWorkspaceAppointment | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const upcoming = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'pending' || a.status === 'confirmed' || a.status === 'checked_in')
        .sort((a, b) =>
          `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`),
        ),
    [appointments],
  );

  const past = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            a.status === 'completed' ||
            a.status === 'cancelled' ||
            a.status === 'rejected' ||
            a.status === 'no_show',
        )
        .sort((a, b) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
        ),
    [appointments],
  );

  const visibleList = tab === 'upcoming' ? upcoming : past;

  const getStatusLabel = (status: string): string => {
    if (status === 'pending') return pt.statuses.pending;
    if (status === 'confirmed' || status === 'checked_in')
      return pt.statuses.confirmed;
    if (status === 'completed') return pt.statuses.completed;
    if (status === 'no_show') return pt.statuses.no_show;
    return pt.statuses.cancelled;
  };

  const openReschedule = async (apt: PatientWorkspaceAppointment) => {
    setRescheduleTarget(apt);
    setSelectedSlot(null);
    setOpenSlots([]);
    setLoadingSlots(true);
    setErrorMsg(null);
    try {
      const res = await fetchPublicDoctorDetails(apt.doctorUid);
      const avail = (res.slots || []).filter((s) => s.available);
      setOpenSlots(avail);
      setSelectedSlot(avail[0] || null);
    } catch {
      setOpenSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleConfirmCancel = async (e: FormEvent) => {
    e.preventDefault();
    if (!cancelTarget) return;
    setCancelling(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await cancelPatientAppointment(
        firebaseUser,
        cancelTarget.appointmentId,
        cancelReason.trim(),
      );
      setCancelTarget(null);
      setCancelReason('');
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CANCEL_FAILED');
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmReschedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !selectedSlot) return;
    setRescheduling(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await reschedulePatientAppointment(
        firebaseUser,
        rescheduleTarget.appointmentId,
        {
          date: selectedSlot.date,
          time: selectedSlot.time,
        },
      );
      setRescheduleTarget(null);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'RESCHEDULE_FAILED');
    } finally {
      setRescheduling(false);
    }
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;
    setSubmittingReview(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await submitDoctorReview(firebaseUser, {
        appointmentId: reviewTarget.appointmentId,
        rating,
        comment: comment.trim(),
      });
      setReviewTarget(null);
      setComment('');
      setRating(5);
      setFeedbackMsg(pt.reviewSubmittedMsg);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'REVIEW_SUBMIT_FAILED');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {pt.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {pt.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold tabular-nums cursor-pointer ${
              tab === 'upcoming'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {pt.upcomingTab} ({upcoming.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('past')}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold tabular-nums cursor-pointer ${
              tab === 'past'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {pt.pastTab} ({past.length})
          </button>
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

      {visibleList.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
          {tab === 'upcoming' ? pt.noUpcoming : pt.noPast}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleList.map((apt) => (
            <article
              key={apt.appointmentId}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {apt.doctorAvatarUrl ? (
                      <img
                        src={apt.doctorAvatarUrl}
                        alt={apt.doctorName || apt.doctorUid}
                        referrerPolicy="no-referrer"
                        className="h-11 w-11 shrink-0 rounded-full border border-[#d9a43b]/50 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d9a43b]/40 bg-[#0c3585]/10 text-sm font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                        {(apt.doctorName || 'D').trim().charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 dark:text-white">
                        {apt.doctorName || apt.doctorUid}
                      </h2>
                      <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                        {apt.doctorSpecialty}
                        {apt.clinicName ? ` · ${apt.clinicName}` : ''}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${
                      STATUS_BADGE[apt.status] || STATUS_BADGE.pending
                    }`}
                  >
                    {getStatusLabel(apt.status)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {pt.dateAndTime}
                    </p>
                    <p
                      className="mt-0.5 font-latin font-bold text-slate-900 tabular-nums dark:text-white"
                      dir="ltr"
                    >
                      {apt.date} · {apt.time}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {pt.queueNumber}
                    </p>
                    <p className="mt-0.5 font-latin font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                      {apt.queueNumber ? `#${apt.queueNumber}` : '—'}
                    </p>
                  </div>
                </div>

                {(apt.clinicAddress || apt.clinicPhone || apt.mapLocationUrl) && (
                  <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {apt.clinicAddress && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{apt.clinicAddress}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4">
                      {apt.clinicPhone && (
                        <a
                          href={`tel:${apt.clinicPhone.replace(/\s+/g, '')}`}
                          dir="ltr"
                          className="inline-flex items-center gap-1 font-latin font-semibold text-slate-700 hover:text-[#0c3585] dark:text-slate-200 dark:hover:text-[#f4d378]"
                        >
                          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{apt.clinicPhone}</span>
                        </a>
                      )}
                      {apt.mapLocationUrl && (
                        <a
                          href={apt.mapLocationUrl}
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
                )}

                {apt.reason && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-semibold">{pt.reasonLabel}:</span>{' '}
                    {apt.reason}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3.5 dark:border-slate-800">
                {(apt.status === 'pending' || apt.status === 'confirmed') && (
                  <>
                    <button
                      type="button"
                      onClick={() => void openReschedule(apt)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                    >
                      <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pt.rescheduleBtn}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelTarget(apt);
                        setCancelReason('');
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer"
                    >
                      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pt.cancelBtn}</span>
                    </button>
                  </>
                )}

                {apt.status === 'completed' && !apt.hasReview && (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewTarget(apt);
                      setRating(5);
                      setComment('');
                    }}
                    className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                  >
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pt.rateDoctorBtn}</span>
                  </button>
                )}

                {apt.status === 'completed' && apt.hasReview && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{pt.alreadyRated}</span>
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Cancel Modal */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setCancelTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmCancel}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {pt.cancelConfirmTitle}
              </h3>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="text-slate-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {cancelTarget.doctorName} · {cancelTarget.date} ({cancelTarget.time})
            </p>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={pt.cancelReasonPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {language === 'ar' ? 'تراجع' : 'Back'}
              </button>
              <button
                type="submit"
                disabled={cancelling}
                className="min-h-[40px] rounded-xl bg-rose-600 px-5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {cancelling ? '...' : pt.confirmCancelBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setRescheduleTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleConfirmReschedule}
            className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {pt.rescheduleTitle}
              </h3>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="text-slate-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {rescheduleTarget.doctorName} · {rescheduleTarget.clinicName}
            </p>
            <div className="flex-1 overflow-y-auto space-y-2">
              {loadingSlots ? (
                <div className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
              ) : openSlots.length === 0 ? (
                <p className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {pt.noRescheduleSlots}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {openSlots.slice(0, 36).map((slot) => {
                    const active = selectedSlot?.slotKey === slot.slotKey;
                    return (
                      <button
                        key={slot.slotKey}
                        type="button"
                        onClick={() => setSelectedSlot(slot)}
                        className={`min-h-[42px] rounded-xl border px-3 py-2 font-latin text-xs font-bold tabular-nums cursor-pointer ${
                          active
                            ? 'border-[#d9a43b] bg-[#d9a43b]/20 text-slate-950 ring-1 ring-[#d9a43b] dark:text-[#f4d378]'
                            : 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                        dir="ltr"
                      >
                        {slot.date} · {slot.time}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={rescheduling || !selectedSlot}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {rescheduling ? '...' : pt.confirmRescheduleBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Review Modal */}
      {reviewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setReviewTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitReview}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {pt.reviewTitle}
              </h3>
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="text-slate-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
              {reviewTarget.doctorName} · {reviewTarget.date}
            </p>
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {pt.ratingLabel}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    aria-label={`${value}`}
                    className="p-1 cursor-pointer"
                  >
                    <Star
                      className={`h-7 w-7 ${
                        value <= rating
                          ? 'fill-[#f4d378] text-[#d9a43b]'
                          : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <textarea
              rows={4}
              required
              minLength={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={pt.commentPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={submittingReview || comment.trim().length < 3}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {submittingReview ? '...' : pt.submitReviewBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
