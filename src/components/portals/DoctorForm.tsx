import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMedora } from '../../contexts/MedoraContext';
import type {
  BookingConfirmationMode,
  DoctorPortalInput,
  UploadedDocMeta,
} from '../../types/medora';
import { DocumentUploadField } from './DocumentUploadField';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface DoctorFormProps {
  initialData?: DoctorPortalInput;
  onDraftSave?: (data: DoctorPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: DoctorPortalInput) => void;
}

export function DoctorForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: DoctorFormProps) {
  const { language, t, userAccount } = useMedora();

  const [professionalPhone, setProfessionalPhone] = useState(
    initialData?.professionalPhone || userAccount?.phone || '',
  );
  const [email, setEmail] = useState(
    initialData?.email || userAccount?.email || '',
  );
  const [degree, setDegree] = useState(initialData?.degree || '');
  const [university, setUniversity] = useState(initialData?.university || '');
  const [specialty, setSpecialty] = useState(initialData?.specialty || '');
  const [subSpecialty, setSubSpecialty] = useState(
    initialData?.subSpecialty || '',
  );
  const [experienceYears, setExperienceYears] = useState(
    initialData?.experienceYears ?? 3,
  );
  const [languagesText, setLanguagesText] = useState(
    initialData?.languages?.join(', ') || (language === 'ar' ? 'العربية, الإنجليزية' : 'Arabic, English'),
  );
  const [clinicName, setClinicName] = useState(initialData?.clinicName || '');
  const [workAddress, setWorkAddress] = useState(initialData?.workAddress || '');
  const [workDaysAndHours, setWorkDaysAndHours] = useState(
    initialData?.workDaysAndHours || '',
  );
  const [consultationDurationMinutes, setConsultationDurationMinutes] =
    useState(initialData?.consultationDurationMinutes ?? 20);
  const [consultationFee, setConsultationFee] = useState(
    initialData?.consultationFee ?? 25000,
  );
  const [hourlyAppointmentLimit, setHourlyAppointmentLimit] = useState(
    initialData?.hourlyAppointmentLimit ?? 3,
  );
  const [bookingConfirmationMode, setBookingConfirmationMode] =
    useState<BookingConfirmationMode>(
      initialData?.bookingConfirmationMode || 'manual',
    );
  const [licenseNumber, setLicenseNumber] = useState(
    initialData?.licenseNumber || '',
  );
  const [licensingAuthority, setLicensingAuthority] = useState(
    initialData?.licensingAuthority || '',
  );
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(
    initialData?.licenseExpiryDate || '',
  );
  const [verificationDocuments, setVerificationDocuments] = useState<
    UploadedDocMeta[]
  >(initialData?.verificationDocuments || []);
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): DoctorPortalInput => ({
    professionalPhone: professionalPhone.trim(),
    email: email.trim(),
    degree: degree.trim(),
    university: university.trim(),
    specialty: specialty.trim(),
    subSpecialty: subSpecialty.trim(),
    experienceYears: Math.max(0, Number(experienceYears) || 0),
    languages: languagesText
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
    clinicName: clinicName.trim(),
    workAddress: workAddress.trim(),
    workDaysAndHours: workDaysAndHours.trim(),
    consultationDurationMinutes: Math.max(
      5,
      Number(consultationDurationMinutes) || 20,
    ),
    consultationFee: Math.max(0, Number(consultationFee) || 0),
    hourlyAppointmentLimit: Math.max(
      1,
      Number(hourlyAppointmentLimit) || 3,
    ),
    bookingConfirmationMode,
    licenseNumber: licenseNumber.trim(),
    licensingAuthority: licensingAuthority.trim(),
    licenseExpiryDate: licenseExpiryDate.trim(),
    verificationDocuments,
  });

  const snapshotRef = useRef<DoctorPortalInput>(buildPayload());
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

    if (
      professionalPhone.trim().length < 6 ||
      email.trim().length < 3 ||
      !email.includes('@') ||
      degree.trim().length < 2 ||
      university.trim().length < 2 ||
      specialty.trim().length < 2 ||
      clinicName.trim().length < 2 ||
      workAddress.trim().length < 2 ||
      workDaysAndHours.trim().length < 2 ||
      licenseNumber.trim().length < 2 ||
      licensingAuthority.trim().length < 2
    ) {
      setError(
        language === 'ar'
          ? 'يرجى إكمال جميع الحقول المهنية وحقول الترخيص المطلوبة بشكل صحيح.'
          : 'Please complete all required professional and licensing fields.',
      );
      return;
    }

    const expNum = Number(experienceYears);
    const durNum = Number(consultationDurationMinutes);
    const feeNum = Number(consultationFee);
    const limitNum = Number(hourlyAppointmentLimit);
    if (
      Number.isNaN(expNum) ||
      expNum < 0 ||
      expNum > 80 ||
      Number.isNaN(durNum) ||
      durNum < 5 ||
      durNum > 240 ||
      Number.isNaN(feeNum) ||
      feeNum < 0 ||
      feeNum > 10000000 ||
      Number.isNaN(limitNum) ||
      limitNum < 1 ||
      limitNum > 60
    ) {
      setError(
        language === 'ar'
          ? 'يرجى التحقق من القيم الرقمية (الخبرة 0-80، مدة المعاينة 5-240 دقيقة، الحد الساعي 1-60).'
          : 'Please verify numeric values (experience 0-80, duration 5-240 mins, hourly limit 1-60).',
      );
      return;
    }

    const parsedLanguages = languagesText
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10);

    onNext({
      professionalPhone: professionalPhone.trim(),
      email: email.trim(),
      degree: degree.trim(),
      university: university.trim(),
      specialty: specialty.trim(),
      subSpecialty: subSpecialty.trim(),
      experienceYears: Math.max(0, Number(experienceYears) || 0),
      languages: parsedLanguages,
      clinicName: clinicName.trim(),
      workAddress: workAddress.trim(),
      workDaysAndHours: workDaysAndHours.trim(),
      consultationDurationMinutes: Math.max(
        5,
        Number(consultationDurationMinutes) || 20,
      ),
      consultationFee: Math.max(0, Number(consultationFee) || 0),
      hourlyAppointmentLimit: Math.max(
        1,
        Number(hourlyAppointmentLimit) || 3,
      ),
      bookingConfirmationMode,
      licenseNumber: licenseNumber.trim(),
      licensingAuthority: licensingAuthority.trim(),
      licenseExpiryDate: licenseExpiryDate.trim(),
      verificationDocuments,
    });
  };

  const inputClass =
    'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.forms.doctor.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.doctor.subtitle}
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="doc-phone" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.professionalPhone} *
          </label>
          <input
            id="doc-phone"
            type="tel"
            dir="ltr"
            required
            value={professionalPhone}
            onChange={(e) => setProfessionalPhone(e.target.value)}
            className={`${inputClass} text-left`}
          />
        </div>
        <div>
          <label htmlFor="doc-email" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.email} *
          </label>
          <input
            id="doc-email"
            type="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} text-left`}
          />
        </div>

        <div>
          <label htmlFor="doc-degree" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.degree} *
          </label>
          <input
            id="doc-degree"
            type="text"
            required
            value={degree}
            onChange={(e) => setDegree(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-univ" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.university} *
          </label>
          <input
            id="doc-univ"
            type="text"
            required
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="doc-spec" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.specialty} *
          </label>
          <input
            id="doc-spec"
            type="text"
            required
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-subspec" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.subSpecialty}
          </label>
          <input
            id="doc-subspec"
            type="text"
            value={subSpecialty}
            onChange={(e) => setSubSpecialty(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="doc-exp" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.experienceYears}
          </label>
          <input
            id="doc-exp"
            type="number"
            min={0}
            max={80}
            value={experienceYears}
            onChange={(e) => setExperienceYears(Number(e.target.value))}
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="doc-lang" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.languages}
          </label>
          <input
            id="doc-lang"
            type="text"
            placeholder={t.forms.doctor.languagesPlaceholder}
            value={languagesText}
            onChange={(e) => setLanguagesText(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="doc-clinic" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.clinicName} *
          </label>
          <input
            id="doc-clinic"
            type="text"
            required
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-addr" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.workAddress} *
          </label>
          <input
            id="doc-addr"
            type="text"
            required
            value={workAddress}
            onChange={(e) => setWorkAddress(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="doc-hours" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.workDaysAndHours} *
          </label>
          <input
            id="doc-hours"
            type="text"
            required
            value={workDaysAndHours}
            onChange={(e) => setWorkDaysAndHours(e.target.value)}
            placeholder={
              language === 'ar'
                ? 'السبت - الخميس · 4:00 عصراً - 9:00 مساءً'
                : 'Sat - Thu · 4:00 PM - 9:00 PM'
            }
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="doc-dur" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.consultationDuration} *
          </label>
          <input
            id="doc-dur"
            type="number"
            min={5}
            max={240}
            required
            value={consultationDurationMinutes}
            onChange={(e) =>
              setConsultationDurationMinutes(Number(e.target.value))
            }
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="doc-fee" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.consultationFee} ({t.common.iqd}) *
          </label>
          <input
            id="doc-fee"
            type="number"
            min={0}
            required
            value={consultationFee}
            onChange={(e) => setConsultationFee(Number(e.target.value))}
            className={`${inputClass} tabular-nums`}
          />
        </div>

        <div>
          <label htmlFor="doc-limit" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.hourlyLimit} *
          </label>
          <input
            id="doc-limit"
            type="number"
            min={1}
            max={60}
            required
            value={hourlyAppointmentLimit}
            onChange={(e) => setHourlyAppointmentLimit(Number(e.target.value))}
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="doc-mode" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.bookingMode} *
          </label>
          <select
            id="doc-mode"
            value={bookingConfirmationMode}
            onChange={(e) =>
              setBookingConfirmationMode(
                e.target.value as BookingConfirmationMode,
              )
            }
            className={inputClass}
          >
            <option value="manual">{t.common.manual}</option>
            <option value="auto">{t.common.auto}</option>
          </select>
        </div>

        <div>
          <label htmlFor="doc-lic" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.licenseNumber} *
          </label>
          <input
            id="doc-lic"
            type="text"
            required
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="doc-auth" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.licensingAuthority} *
          </label>
          <input
            id="doc-auth"
            type="text"
            required
            value={licensingAuthority}
            onChange={(e) => setLicensingAuthority(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="doc-expdate" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.doctor.licenseExpiryDate}
          </label>
          <input
            id="doc-expdate"
            type="date"
            value={licenseExpiryDate}
            onChange={(e) => setLicenseExpiryDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <DocumentUploadField
        label={t.forms.doctor.documents}
        folder="doctor_docs"
        documents={verificationDocuments}
        onChange={setVerificationDocuments}
      />

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
