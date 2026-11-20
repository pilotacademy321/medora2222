import { useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import { CheckCircle2, MessageSquareWarning, Send } from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import { submitPatientFeedback } from '../../services/patientService';
import type { PublicDoctorCard } from '../../types/doctor';
import type { Language } from '../../types/medora';
import type {
  PatientFeedbackCategory,
  PatientFeedbackRecord,
} from '../../types/patient';

interface PatientFeedbackSectionProps {
  firebaseUser: User;
  feedbackList: PatientFeedbackRecord[];
  doctors: PublicDoctorCard[];
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

const CATEGORIES: PatientFeedbackCategory[] = [
  'complaint',
  'booking_issue',
  'note',
  'technical',
  'suggestion',
];

export function PatientFeedbackSection({
  firebaseUser,
  feedbackList,
  doctors,
  language,
  onRefreshWorkspace,
}: PatientFeedbackSectionProps) {
  const pf = PATIENT_TRANSLATIONS[language].feedback;
  const [category, setCategory] =
    useState<PatientFeedbackCategory>('complaint');
  const [relatedDoctorUid, setRelatedDoctorUid] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSubmitting(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await submitPatientFeedback(firebaseUser, {
        category,
        subject: subject.trim(),
        message: message.trim(),
        relatedDoctorUid: relatedDoctorUid || undefined,
      });
      setSubject('');
      setMessage('');
      setRelatedDoctorUid('');
      setSuccessMsg(pf.submittedMsg);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'FEEDBACK_FAILED');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/15">
            <MessageSquareWarning
              className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
              aria-hidden="true"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {pf.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {pf.subtitle}
            </p>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
      >
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {pf.formTitle}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {pf.categoryLabel}
            </label>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as PatientFeedbackCategory)
              }
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {pf.categories[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {pf.relatedDoctorLabel}
            </label>
            <select
              value={relatedDoctorUid}
              onChange={(e) => setRelatedDoctorUid(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="">{pf.noDoctorOption}</option>
              {doctors.map((doc) => (
                <option key={doc.doctorUid} value={doc.doctorUid}>
                  {doc.fullName} — {doc.clinicName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            {pf.subjectLabel}
          </label>
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            {pf.messageLabel}
          </label>
          <textarea
            rows={4}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !subject.trim() || !message.trim()}
          className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          <span>{submitting ? '...' : pf.submitBtn}</span>
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {pf.historyTitle}
        </h2>
        {feedbackList.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {pf.noFeedback}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {feedbackList.map((fb) => (
              <article
                key={fb.feedbackId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                      {pf.categories[fb.category]}
                    </span>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                      {fb.subject}
                    </h3>
                  </div>
                  <div className="text-end">
                    <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {pf.statuses[fb.status]}
                    </span>
                    <p
                      className="mt-1 font-latin text-[11px] text-slate-400 tabular-nums"
                      dir="ltr"
                    >
                      {fb.createdAt.slice(0, 10)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {fb.message}
                </p>
                {fb.adminReply && (
                  <div className="mt-3 rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/10 p-3 text-xs text-slate-900 dark:text-slate-100">
                    <p className="font-bold text-[#b68023] dark:text-[#f4d378]">
                      {pf.adminReplyLabel}
                    </p>
                    <p className="mt-1">{fb.adminReply}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
