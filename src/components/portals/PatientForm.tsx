import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import type { PatientPortalInput } from '../../types/medora';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface PatientFormProps {
  initialData?: PatientPortalInput;
  onDraftSave?: (data: PatientPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: PatientPortalInput) => void;
}

export function PatientForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: PatientFormProps) {
  const { language, t } = useMedora();
  const [emergencyContactName, setEmergencyContactName] = useState(
    initialData?.emergencyContactName || '',
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    initialData?.emergencyContactPhone || '',
  );
  const [emergencyContactRelation, setEmergencyContactRelation] = useState(
    initialData?.emergencyContactRelation || '',
  );
  const [acceptedPolicy, setAcceptedPolicy] = useState(
    initialData?.acceptedPolicy ?? false,
  );
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): PatientPortalInput => ({
    emergencyContactName: emergencyContactName.trim(),
    emergencyContactPhone: emergencyContactPhone.trim(),
    emergencyContactRelation: emergencyContactRelation.trim(),
    acceptedPolicy,
  });

  const snapshotRef = useRef<PatientPortalInput>(buildPayload());
  snapshotRef.current = buildPayload();
  const onDraftSaveRef = useRef(onDraftSave);
  onDraftSaveRef.current = onDraftSave;

  useEffect(() => {
    return () => {
      onDraftSaveRef.current?.(snapshotRef.current);
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!acceptedPolicy) {
      setError(
        language === 'ar'
          ? 'يرجى الموافقة على سياسة الخصوصية وشروط الاستخدام للمتابعة.'
          : 'Please accept the privacy policy and terms of use to continue.',
      );
      return;
    }

    onNext({
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactPhone: emergencyContactPhone.trim(),
      emergencyContactRelation: emergencyContactRelation.trim(),
      acceptedPolicy,
    });
  };

  const inputClass =
    'min-h-[46px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.forms.patient.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.patient.subtitle}
        </p>
      </div>

      <SharedPersonalSummary onEditPersonal={onEditPersonal} />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {t.forms.patient.emergencyTitle}{' '}
          <span className="text-xs font-normal text-slate-500">
            ({t.common.optional})
          </span>
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="pt-emg-name"
              className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              {t.forms.patient.emergencyName}
            </label>
            <input
              id="pt-emg-name"
              type="text"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="pt-emg-phone"
              className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              {t.forms.patient.emergencyPhone}
            </label>
            <input
              id="pt-emg-phone"
              type="tel"
              dir="ltr"
              value={emergencyContactPhone}
              onChange={(e) => setEmergencyContactPhone(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
          <div>
            <label
              htmlFor="pt-emg-rel"
              className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200"
            >
              {t.forms.patient.emergencyRelation}
            </label>
            <input
              id="pt-emg-rel"
              type="text"
              value={emergencyContactRelation}
              onChange={(e) => setEmergencyContactRelation(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t.forms.patient.activationNotice}</span>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
        <input
          type="checkbox"
          checked={acceptedPolicy}
          onChange={(e) => setAcceptedPolicy(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-slate-400 accent-[#d9a43b]"
        />
        <span>{t.forms.patient.policyConsent} *</span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[46px] rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
        >
          {t.common.back}
        </button>
        <button
          type="submit"
          className="medora-gold-button min-h-[48px] rounded-xl px-7 py-3 text-sm font-bold text-[#040917] cursor-pointer"
        >
          {t.common.next}
        </button>
      </div>
    </form>
  );
}
