import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useMedora } from '../../contexts/MedoraContext';
import type { SecretaryPortalInput } from '../../types/medora';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface SecretaryFormProps {
  initialData?: SecretaryPortalInput;
  onDraftSave?: (data: SecretaryPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: SecretaryPortalInput) => void;
}

export function SecretaryForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: SecretaryFormProps) {
  const { language, t, userAccount } = useMedora();

  const [phone, setPhone] = useState(
    initialData?.phone || userAccount?.phone || '',
  );
  const [educationQualification, setEducationQualification] = useState(
    initialData?.educationQualification || '',
  );
  const [previousExperience, setPreviousExperience] = useState(
    initialData?.previousExperience || '',
  );
  const [bio, setBio] = useState(initialData?.bio || '');
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): SecretaryPortalInput => ({
    phone: phone.trim(),
    educationQualification: educationQualification.trim(),
    previousExperience: previousExperience.trim(),
    bio: bio.trim(),
  });

  const snapshotRef = useRef<SecretaryPortalInput>(buildPayload());
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

    if (phone.trim().length < 6 || educationQualification.trim().length < 2) {
      setError(
        language === 'ar'
          ? 'يرجى إدخال رقم الهاتف والمؤهل الدراسي لإتمام حساب السكرتير المستقل.'
          : 'Please enter phone number and educational qualification for your independent secretary account.',
      );
      return;
    }

    onNext(buildPayload());
  };

  const inputClass =
    'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.forms.secretary.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.secretary.subtitle}
        </p>
      </div>

      <SharedPersonalSummary onEditPersonal={onEditPersonal} />

      <div className="flex items-start gap-3 rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/10 p-4 text-xs leading-relaxed text-amber-950 dark:text-amber-100 sm:text-sm">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#b68023] dark:text-[#f4d378]" aria-hidden="true" />
        <span>{t.forms.secretary.permissionWarning}</span>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sec-phone" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.secretary.phone} *
          </label>
          <input
            id="sec-phone"
            type="tel"
            dir="ltr"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={`${inputClass} text-left`}
          />
        </div>
        <div>
          <label htmlFor="sec-edu" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.secretary.educationQualification} *
          </label>
          <input
            id="sec-edu"
            type="text"
            required
            value={educationQualification}
            onChange={(e) => setEducationQualification(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="sec-exp" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.secretary.previousExperience}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({t.common.optional})
            </span>
          </label>
          <textarea
            id="sec-exp"
            rows={2}
            value={previousExperience}
            onChange={(e) => setPreviousExperience(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="sec-bio" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {language === 'ar' ? 'نبذة مهنية موجزة' : 'Brief Professional Bio'}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({t.common.optional})
            </span>
          </label>
          <textarea
            id="sec-bio"
            rows={2}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'مثال: خبرة في تنظيم مواعيد العيادات واستقبال المرضى ومتابعة المختبرات...'
                : 'e.g., Experience in clinic reception, scheduling, and patient coordination...'
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500"
          />
        </div>
      </div>

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
