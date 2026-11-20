import { useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import { Building2, Lock } from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import { saveDoctorClinicInfo } from '../../services/doctorService';
import type { DoctorWorkspaceData } from '../../types/doctor';
import type { Language } from '../../types/medora';
import { EmployerSecretaryManagementSection } from '../secretary/EmployerSecretaryManagementSection';

interface DoctorClinicStaffSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

export function DoctorClinicStaffSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
}: DoctorClinicStaffSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const cs = dc.clinicStaff;
  const profile = workspace.doctorProfile;

  const isDoctorOwner = workspace.actorRole === 'doctor';

  // Single Clinic Profile State (Strictly 1 clinic per physician)
  const [clinicName, setClinicName] = useState(profile.clinicName || '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  const [district, setDistrict] = useState(profile.district || '');
  const [workAddress, setWorkAddress] = useState(profile.workAddress || '');
  const [professionalPhone, setProfessionalPhone] = useState(
    profile.professionalPhone || '',
  );
  const [mapLocationUrl, setMapLocationUrl] = useState(
    profile.mapLocationUrl || '',
  );
  const [workDaysAndHours, setWorkDaysAndHours] = useState(
    profile.workDaysAndHours || '',
  );
  const [consultationFee, setConsultationFee] = useState(
    String(profile.consultationFee || 0),
  );
  const [servicesText, setServicesText] = useState(
    (profile.clinicServices || []).join(', '),
  );
  const [savingClinic, setSavingClinic] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  if (!isDoctorOwner) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        <Lock className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <span>{dc.patients.restrictedRecordsNotice}</span>
      </div>
    );
  }

  const handleSaveClinic = async (e: FormEvent) => {
    e.preventDefault();
    setSavingClinic(true);
    setStatusMsg(null);
    try {
      await saveDoctorClinicInfo(firebaseUser, {
        clinicName: clinicName.trim(),
        governorate: governorate.trim(),
        district: district.trim(),
        workAddress: workAddress.trim(),
        professionalPhone: professionalPhone.trim(),
        mapLocationUrl: mapLocationUrl.trim(),
        workDaysAndHours: workDaysAndHours.trim(),
        consultationFee: Number(consultationFee) || 0,
        clinicServices: servicesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      await onRefreshWorkspace();
      setStatusMsg({ type: 'ok', text: dc.appointments.savedNotice });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error',
      });
    } finally {
      setSavingClinic(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {cs.title}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {cs.singleClinicNote}
        </p>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            statusMsg.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Single Clinic Profile Form */}
      <form
        onSubmit={handleSaveClinic}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <Building2 className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {cs.clinicCardTitle}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold">{cs.clinicName} *</label>
            <input
              type="text"
              required
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.governorate}</label>
            <input
              type="text"
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.district}</label>
            <input
              type="text"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold">{cs.address}</label>
            <input
              type="text"
              value={workAddress}
              onChange={(e) => setWorkAddress(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.phone}</label>
            <input
              type="tel"
              dir="ltr"
              value={professionalPhone}
              onChange={(e) => setProfessionalPhone(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.feeLabel}</label>
            <input
              type="number"
              min={0}
              value={consultationFee}
              onChange={(e) => setConsultationFee(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.workHoursLabel}</label>
            <input
              type="text"
              value={workDaysAndHours}
              onChange={(e) => setWorkDaysAndHours(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold">{cs.mapUrl}</label>
            <input
              type="url"
              dir="ltr"
              value={mapLocationUrl}
              onChange={(e) => setMapLocationUrl(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="block text-xs font-semibold">{cs.servicesLabel}</label>
            <input
              type="text"
              value={servicesText}
              onChange={(e) => setServicesText(e.target.value)}
              className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingClinic}
          className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
        >
          {savingClinic ? '...' : cs.saveClinicBtn}
        </button>
      </form>

      {/* Independent Secretary Hiring & Two-Way Consent Management */}
      <EmployerSecretaryManagementSection
        firebaseUser={firebaseUser}
        employerType="doctor"
        language={language}
      />
    </div>
  );
}
