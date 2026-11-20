import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  ClipboardPlus,
  Eye,
  FileDown,
  FileText,
  FolderOpen,
  Lock,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  addPatientVisitRecord,
  createDoctorPatient,
  uploadDoctorStorageAsset,
} from '../../services/doctorService';
import type {
  DoctorWorkspaceData,
  MedicationItem,
  PatientVisitRecord,
} from '../../types/doctor';
import type { Language, UploadedDocMeta } from '../../types/medora';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import {
  MedicalRecordSummaryPrintSheet,
  VisitPrintSheet,
} from '../shared/MedoraPrintableDocument';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';

interface DoctorPatientsSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
  initialOpenVisit?: boolean;
  onConsumeOpenVisit?: () => void;
}

type PatientDetailTab = 'visits' | 'rx' | 'diagnostics' | 'files';

const EMPTY_MED: MedicationItem = {
  name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
};

function makeSubmissionKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `visit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function DoctorPatientsSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
  initialOpenVisit,
  onConsumeOpenVisit,
}: DoctorPatientsSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const pc = dc.patients;

  const canViewMedical =
    workspace.actorRole === 'doctor' ||
    workspace.permissions.includes('viewMedicalRecords');
  const isDoctor = workspace.actorRole === 'doctor';

  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    () => workspace.patients[0]?.patientRecordId || '',
  );
  const [detailTab, setDetailTab] = useState<PatientDetailTab>('visits');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [exportingPdfKey, setExportingPdfKey] = useState<string | null>(null);

  // Register Patient Modal
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGender, setNewGender] = useState<'male' | 'female'>('male');
  const [newBloodType, setNewBloodType] = useState('');
  const [newAllergies, setNewAllergies] = useState('');
  const [newChronic, setNewChronic] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [savingPatient, setSavingPatient] = useState(false);

  // Add Visit Modal (Standalone or Selected Patient)
  const [showAddVisit, setShowAddVisit] = useState(false);
  const [visitPatientId, setVisitPatientId] = useState('');
  const [visitPatientSearch, setVisitPatientSearch] = useState('');
  const [visitDate, setVisitDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [visitTime, setVisitTime] = useState(() =>
    new Date().toTimeString().slice(0, 5),
  );
  const [visitReason, setVisitReason] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [procedures, setProcedures] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [treatmentRecommendations, setTreatmentRecommendations] = useState('');
  const [bp, setBp] = useState('');
  const [temp, setTemp] = useState('');
  const [hr, setHr] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [visitFiles, setVisitFiles] = useState<UploadedDocMeta[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [submissionKey, setSubmissionKey] = useState<string>(() => makeSubmissionKey());

  // Optional Inline Linked Prescription
  const [includeInlineRx, setIncludeInlineRx] = useState(false);
  const [inlineMeds, setInlineMeds] = useState<MedicationItem[]>([{ ...EMPTY_MED }]);
  const [inlineRxNotes, setInlineRxNotes] = useState('');

  // Visit Detail Inspection Modal
  const [activeVisitModal, setActiveVisitModal] = useState<PatientVisitRecord | null>(
    null,
  );

  const openVisitComposer = (preselectedPatientId?: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const fallbackId =
      preselectedPatientId ||
      selectedPatientId ||
      workspace.patients[0]?.patientRecordId ||
      '';
    setVisitPatientId(fallbackId);
    setVisitPatientSearch('');
    setVisitDate(new Date().toISOString().slice(0, 10));
    setVisitTime(new Date().toTimeString().slice(0, 5));
    setVisitReason('');
    setChiefComplaint('');
    setDiagnosis('');
    setProcedures('');
    setClinicalNotes('');
    setTreatmentRecommendations('');
    setBp('');
    setTemp('');
    setHr('');
    setWeightKg('');
    setVisitFiles([]);
    setIncludeInlineRx(false);
    setInlineMeds([{ ...EMPTY_MED }]);
    setInlineRxNotes('');
    setSubmissionKey(makeSubmissionKey());
    setShowAddVisit(true);
  };

  useEffect(() => {
    if (initialOpenVisit && isDoctor) {
      openVisitComposer(selectedPatientId);
      onConsumeOpenVisit?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenVisit, isDoctor]);

  const filteredPatients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspace.patients;
    return workspace.patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.fileNumber.toLowerCase().includes(q),
    );
  }, [workspace.patients, search]);

  const modalFilteredPatients = useMemo(() => {
    const q = visitPatientSearch.trim().toLowerCase();
    if (!q) return workspace.patients;
    return workspace.patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.fileNumber.toLowerCase().includes(q),
    );
  }, [workspace.patients, visitPatientSearch]);

  const selectedPatient = useMemo(
    () =>
      workspace.patients.find((p) => p.patientRecordId === selectedPatientId) ||
      null,
    [workspace.patients, selectedPatientId],
  );

  const modalSelectedPatient = useMemo(
    () =>
      workspace.patients.find((p) => p.patientRecordId === visitPatientId) ||
      null,
    [workspace.patients, visitPatientId],
  );

  const patientVisits = useMemo(
    () =>
      workspace.visits.filter((v) => v.patientRecordId === selectedPatientId),
    [workspace.visits, selectedPatientId],
  );

  const patientRx = useMemo(
    () =>
      workspace.prescriptions.filter(
        (rx) => rx.patientRecordId === selectedPatientId,
      ),
    [workspace.prescriptions, selectedPatientId],
  );

  const patientDiagnostics = useMemo(
    () =>
      workspace.diagnostics.filter(
        (d) => d.patientRecordId === selectedPatientId,
      ),
    [workspace.diagnostics, selectedPatientId],
  );

  const patientAttachments = useMemo(() => {
    const list: Array<{ label: string; doc: UploadedDocMeta }> = [];
    patientVisits.forEach((v) => {
      (v.attachments || []).forEach((doc) => {
        list.push({ label: `${v.visitDate} · ${v.diagnosis}`, doc });
      });
    });
    patientDiagnostics.forEach((d) => {
      (d.resultFiles || []).forEach((doc) => {
        list.push({ label: d.requestedTests.join(', '), doc });
      });
    });
    return list;
  }, [patientVisits, patientDiagnostics]);

  const sharedConsentFiles = useMemo(() => {
    const linkedUid = selectedPatient?.linkedPatientUid;
    if (!linkedUid || !Array.isArray(workspace.sharedPatientFiles)) return [];
    return workspace.sharedPatientFiles.filter((f) => f.patientUid === linkedUid);
  }, [workspace.sharedPatientFiles, selectedPatient]);

  const handleRegisterPatient = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPatient(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const created = await createDoctorPatient(firebaseUser, {
        fullName: newName.trim(),
        phone: newPhone.trim(),
        dateOfBirth: newDob,
        gender: newGender,
        bloodType: newBloodType.trim(),
        allergies: newAllergies.trim(),
        chronicConditions: newChronic.trim(),
        address: newAddress.trim(),
      });
      await onRefreshWorkspace();
      setSelectedPatientId(created.patientRecordId);
      setShowAddPatient(false);
      setNewName('');
      setNewPhone('');
      setNewDob('');
      setNewBloodType('');
      setNewAllergies('');
      setNewChronic('');
      setNewAddress('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingPatient(false);
    }
  };

  const handleUploadVisitDocs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFiles(true);
    setErrorMsg(null);
    try {
      const uploaded: UploadedDocMeta[] = [];
      for (const file of Array.from(files)) {
        const meta = await uploadDoctorStorageAsset(
          firebaseUser,
          'patient_records',
          file,
          visitPatientId ? { patientRecordId: visitPatientId } : undefined,
        );
        uploaded.push(meta);
      }
      setVisitFiles((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSaveVisit = async (e: FormEvent) => {
    e.preventDefault();
    if (savingVisit) return;
    if (!modalSelectedPatient) {
      setErrorMsg(pc.selectPatientRequired);
      return;
    }
    if (!chiefComplaint.trim() && !visitReason.trim()) {
      setErrorMsg(
        language === 'ar'
          ? 'يرجى إدخال سبب الزيارة أو الشكوى الرئيسية.'
          : 'Please enter the visit reason or chief complaint.',
      );
      return;
    }

    setSavingVisit(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const cleanedMeds = includeInlineRx
        ? inlineMeds.filter((m) => m.name.trim())
        : [];

      const { visit } = await addPatientVisitRecord(firebaseUser, {
        patientRecordId: modalSelectedPatient.patientRecordId,
        visitDate,
        visitTime,
        visitReason: visitReason.trim(),
        chiefComplaint: chiefComplaint.trim(),
        diagnosis: diagnosis.trim(),
        procedures: procedures.trim(),
        clinicalNotes: clinicalNotes.trim(),
        treatmentRecommendations: treatmentRecommendations.trim(),
        clientSubmissionKey: submissionKey,
        vitals: {
          bloodPressure: bp.trim(),
          temperature: temp.trim(),
          heartRate: hr.trim(),
          weightKg: weightKg.trim(),
        },
        attachments: visitFiles,
        ...(cleanedMeds.length > 0
          ? {
              createPrescription: {
                medications: cleanedMeds,
                doctorNotes: inlineRxNotes.trim(),
                prescribedDate: visitDate,
              },
            }
          : {}),
      });

      await onRefreshWorkspace();
      setSelectedPatientId(visit.patientRecordId);
      setDetailTab('visits');
      setShowAddVisit(false);
      setSuccessMsg(pc.visitSavedNotice);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setSavingVisit(false);
    }
  };

  const handlePrintVisit = (visit: PatientVisitRecord) => {
    const pt = workspace.patients.find(
      (p) => p.patientRecordId === visit.patientRecordId,
    );
    const linkedRx = visit.linkedPrescriptionId
      ? workspace.prescriptions.find(
          (r) => r.prescriptionId === visit.linkedPrescriptionId,
        ) || null
      : null;

    void printMedoraDocument(
      <VisitPrintSheet
        visit={visit}
        patient={pt}
        doctorProfile={workspace.doctorProfile}
        linkedRx={linkedRx}
        lang={language}
      />,
      sanitizePdfFilename(`visit-${pt?.fullName || 'patient'}-${visit.visitDate}`),
    );
  };

  const handleDownloadVisitPdf = async (visit: PatientVisitRecord) => {
    const pt = workspace.patients.find(
      (p) => p.patientRecordId === visit.patientRecordId,
    );
    const linkedRx = visit.linkedPrescriptionId
      ? workspace.prescriptions.find(
          (r) => r.prescriptionId === visit.linkedPrescriptionId,
        ) || null
      : null;

    setExportingPdfKey(`visit:${visit.visitId}`);
    try {
      await downloadMedoraPdf({
        filename: sanitizePdfFilename(
          `visit-${pt?.fullName || 'patient'}-${visit.visitDate}.pdf`,
        ),
        element: (
          <VisitPrintSheet
            visit={visit}
            patient={pt}
            doctorProfile={workspace.doctorProfile}
            linkedRx={linkedRx}
            lang={language}
          />
        ),
        dir: language === 'ar' ? 'rtl' : 'ltr',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF Export Failed');
    } finally {
      setExportingPdfKey(null);
    }
  };

  const handlePrintFullRecord = () => {
    if (!selectedPatient) return;
    void printMedoraDocument(
      <MedicalRecordSummaryPrintSheet
        lang={language}
        patientName={selectedPatient.fullName}
        patientPhone={selectedPatient.phone}
        fileNumber={selectedPatient.fileNumber}
        bloodType={selectedPatient.bloodType}
        allergies={selectedPatient.allergies}
        chronicConditions={selectedPatient.chronicConditions}
        visits={patientVisits}
        prescriptions={patientRx}
        diagnostics={patientDiagnostics}
      />,
      sanitizePdfFilename(`medical-record-${selectedPatient.fullName}`),
    );
  };

  const handleDownloadFullRecordPdf = async () => {
    if (!selectedPatient) return;
    setExportingPdfKey(`record:${selectedPatient.patientRecordId}`);
    try {
      await downloadMedoraPdf({
        filename: sanitizePdfFilename(`medical-record-${selectedPatient.fullName}.pdf`),
        element: (
          <MedicalRecordSummaryPrintSheet
            lang={language}
            patientName={selectedPatient.fullName}
            patientPhone={selectedPatient.phone}
            fileNumber={selectedPatient.fileNumber}
            bloodType={selectedPatient.bloodType}
            allergies={selectedPatient.allergies}
            chronicConditions={selectedPatient.chronicConditions}
            visits={patientVisits}
            prescriptions={patientRx}
            diagnostics={patientDiagnostics}
          />
        ),
        dir: language === 'ar' ? 'rtl' : 'ltr',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF Export Failed');
    } finally {
      setExportingPdfKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {pc.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {isDoctor && (
            <button
              type="button"
              onClick={() => openVisitComposer()}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#0c3585] bg-[#0c3585] px-4 py-2 text-xs font-bold text-white hover:bg-[#092868] cursor-pointer"
            >
              <ClipboardPlus className="h-4 w-4" aria-hidden="true" />
              <span>{pc.addVisitTopBtn}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowAddPatient(true)}
            className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>{pc.addPatientBtn}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List: Doctor's Own Patients */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pc.searchPlaceholder}
              className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-9 pe-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {filteredPatients.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {pc.noPatients}
            </p>
          ) : (
            <div className="mt-4 max-h-[540px] space-y-2 overflow-y-auto">
              {filteredPatients.map((pt) => {
                const active = pt.patientRecordId === selectedPatientId;
                return (
                  <button
                    key={pt.patientRecordId}
                    type="button"
                    onClick={() => setSelectedPatientId(pt.patientRecordId)}
                    className={`w-full rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                      active
                        ? 'border-[#d9a43b] bg-amber-50/50 dark:bg-[#0b1b3d]'
                        : 'border-slate-100 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {pt.fullName}
                      </span>
                      <span className="font-latin text-[11px] font-semibold text-slate-500 tabular-nums dark:text-slate-400">
                        {pt.fileNumber}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span className="font-latin tabular-nums" dir="ltr">
                        {pt.phone}
                      </span>
                      <span>
                        {pc.totalVisits}: {pt.totalVisits || 0}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Right Panel: Independent Patient Medical File */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-8">
          {!selectedPatient ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              {pc.selectPatientPrompt}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Patient Demographics Summary */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
                <div>
                  <p className="font-latin text-xs font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                    {pc.fileNumber}: {selectedPatient.fileNumber}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                    {selectedPatient.fullName}
                  </h3>
                  <p className="mt-1 font-latin text-xs text-slate-600 tabular-nums dark:text-slate-300" dir="ltr">
                    {selectedPatient.phone}
                    {selectedPatient.dateOfBirth ? ` · ${selectedPatient.dateOfBirth}` : ''}
                    {selectedPatient.bloodType ? ` · ${selectedPatient.bloodType}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canViewMedical && (
                    <>
                      <button
                        type="button"
                        onClick={handlePrintFullRecord}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>{pc.printRecordBtn}</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfKey === `record:${selectedPatient.patientRecordId}`}
                        onClick={() => void handleDownloadFullRecordPdf()}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#0c3585]/40 bg-slate-50 px-3 text-xs font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-[#d9a43b]/40 dark:bg-slate-900 dark:text-[#f4d378] disabled:opacity-50 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        <span>
                          {exportingPdfKey === `record:${selectedPatient.patientRecordId}`
                            ? pc.exportingPdf
                            : pc.downloadRecordPdfBtn}
                        </span>
                      </button>
                    </>
                  )}

                  {isDoctor && (
                    <button
                      type="button"
                      onClick={() => openVisitComposer(selectedPatient.patientRecordId)}
                      className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      <span>{pc.addVisitBtn}</span>
                    </button>
                  )}
                </div>
              </div>

              {canViewMedical &&
                (selectedPatient.allergies || selectedPatient.chronicConditions) && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selectedPatient.allergies && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-xs dark:border-rose-900/50 dark:bg-rose-950/30">
                        <span className="font-bold text-rose-800 dark:text-rose-300">
                          {pc.allergies}:{' '}
                        </span>
                        <span className="text-rose-900 dark:text-rose-100">
                          {selectedPatient.allergies}
                        </span>
                      </div>
                    )}
                    {selectedPatient.chronicConditions && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs dark:border-amber-900/50 dark:bg-amber-950/30">
                        <span className="font-bold text-amber-800 dark:text-amber-300">
                          {pc.chronicConditions}:{' '}
                        </span>
                        <span className="text-amber-900 dark:text-amber-100">
                          {selectedPatient.chronicConditions}
                        </span>
                      </div>
                    )}
                  </div>
                )}

              {!canViewMedical ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <Lock className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
                  <span>{pc.restrictedRecordsNotice}</span>
                </div>
              ) : (
                <>
                  {/* Record Sub-Tabs */}
                  <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                    {(
                      [
                        { id: 'visits', label: `${pc.visitsTab} (${patientVisits.length})` },
                        { id: 'rx', label: `${pc.rxTab} (${patientRx.length})` },
                        { id: 'diagnostics', label: `${pc.diagnosticsTab} (${patientDiagnostics.length})` },
                        {
                          id: 'files',
                          label: `${pc.filesTab} (${patientAttachments.length + sharedConsentFiles.length})`,
                        },
                      ] as Array<{ id: PatientDetailTab; label: string }>
                    ).map((tb) => (
                      <button
                        key={tb.id}
                        type="button"
                        onClick={() => setDetailTab(tb.id)}
                        className={`min-h-[36px] rounded-lg px-3.5 text-xs font-bold cursor-pointer ${
                          detailTab === tb.id
                            ? 'bg-[#0c3585] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {tb.label}
                      </button>
                    ))}
                  </div>

                  {detailTab === 'visits' && (
                    <div className="space-y-3">
                      {patientVisits.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          {pc.noVisits}
                        </p>
                      ) : (
                        patientVisits.map((v) => (
                          <article
                            key={v.visitId}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-latin text-xs font-bold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                                  {v.visitDate}
                                  {v.visitTime ? ` · ${v.visitTime}` : ''}
                                </span>
                                {v.visitReason && (
                                  <span className="rounded-md bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {v.visitReason}
                                  </span>
                                )}
                                {v.linkedPrescriptionId && (
                                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                    Rx
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setActiveVisitModal(v)}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                                >
                                  <Eye className="h-3 w-3" />
                                  <span>{pc.viewDetailsBtn}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePrintVisit(v)}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-[#f4d378] cursor-pointer"
                                >
                                  <Printer className="h-3 w-3" />
                                  <span>{pc.printBtn}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={exportingPdfKey === `visit:${v.visitId}`}
                                  onClick={() => void handleDownloadVisitPdf(v)}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-[#0c3585] px-2.5 text-[11px] font-bold text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <FileDown className="h-3 w-3" />
                                  <span>
                                    {exportingPdfKey === `visit:${v.visitId}`
                                      ? pc.exportingPdf
                                      : pc.downloadPdfBtn}
                                  </span>
                                </button>
                              </div>
                            </div>

                            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-white">
                              {v.diagnosis}
                            </p>
                            {v.chiefComplaint && (
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                <strong>{pc.chiefComplaint}:</strong> {v.chiefComplaint}
                              </p>
                            )}
                            {v.procedures && (
                              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                <strong>{pc.procedures}:</strong> {v.procedures}
                              </p>
                            )}
                            {v.clinicalNotes && (
                              <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                {v.clinicalNotes}
                              </p>
                            )}
                            {v.treatmentRecommendations && (
                              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                                <strong>{pc.treatmentRecommendations}:</strong>{' '}
                                {v.treatmentRecommendations}
                              </p>
                            )}
                            {v.vitals &&
                              (v.vitals.bloodPressure ||
                                v.vitals.temperature ||
                                v.vitals.heartRate ||
                                v.vitals.weightKg) && (
                                <p className="mt-2 font-latin text-[11px] text-slate-500 tabular-nums dark:text-slate-400" dir="ltr">
                                  {v.vitals.bloodPressure ? `BP ${v.vitals.bloodPressure} · ` : ''}
                                  {v.vitals.temperature ? `Temp ${v.vitals.temperature} · ` : ''}
                                  {v.vitals.heartRate ? `HR ${v.vitals.heartRate} · ` : ''}
                                  {v.vitals.weightKg ? `${v.vitals.weightKg} kg` : ''}
                                </p>
                              )}
                            {v.attachments && v.attachments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {v.attachments.map((att, idx) => (
                                  <ProtectedMediaButton
                                    key={`${att.url}-${idx}`}
                                    firebaseUser={firebaseUser}
                                    url={att.url}
                                    fileName={att.name}
                                  />
                                ))}
                              </div>
                            )}
                          </article>
                        ))
                      )}
                    </div>
                  )}

                  {detailTab === 'rx' && (
                    <div className="space-y-3">
                      {patientRx.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          {dc.prescriptions.noRx}
                        </p>
                      ) : (
                        patientRx.map((rx) => (
                          <div
                            key={rx.prescriptionId}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                          >
                            <p className="font-latin font-bold text-[#0c3585] dark:text-[#f4d378]">
                              {rx.prescribedDate}
                            </p>
                            <ul className="mt-2 space-y-1 text-slate-700 dark:text-slate-200">
                              {rx.medications.map((m, idx) => (
                                <li key={idx}>
                                  • <strong>{m.name}</strong> — {m.dosage} · {m.frequency} ({m.duration})
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {detailTab === 'diagnostics' && (
                    <div className="space-y-3">
                      {patientDiagnostics.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          {dc.diagnostics.noOrders}
                        </p>
                      ) : (
                        patientDiagnostics.map((ord) => (
                          <div
                            key={ord.orderId}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 dark:text-white">
                                {ord.requestedTests.join(', ')}
                              </span>
                              <span className="font-semibold text-[#0c3585] dark:text-[#f4d378]">
                                {dc.diagnosticStatuses[ord.status]}
                              </span>
                            </div>
                            {ord.resultSummary && (
                              <p className="mt-2 text-slate-600 dark:text-slate-300">
                                {ord.resultSummary}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {detailTab === 'files' && (
                    <div className="space-y-3">
                      {patientAttachments.length === 0 && sharedConsentFiles.length === 0 ? (
                        <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                          <FolderOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
                          {pc.noVisits}
                        </p>
                      ) : (
                        <>
                          {sharedConsentFiles.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                                {language === 'ar'
                                  ? 'ملفات مشاركة بموافقة المريض'
                                  : 'Patient-Shared Consent Files'}
                              </p>
                              {sharedConsentFiles.map((sf) => (
                                <div
                                  key={sf.fileId}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d9a43b]/40 bg-amber-50/40 px-4 py-3 text-xs dark:bg-amber-950/20"
                                >
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                                      {sf.title} · {sf.documentDate}
                                    </span>
                                    <span className="font-latin text-[11px] text-slate-500 dark:text-slate-400">
                                      {sf.expiresAt
                                        ? `${language === 'ar' ? 'ينتهي:' : 'Expires:'} ${sf.expiresAt.slice(0, 10)}`
                                        : language === 'ar'
                                          ? 'مفتوح بموافقة المريض'
                                          : 'Active consent'}
                                    </span>
                                  </div>
                                  <ProtectedMediaButton
                                    firebaseUser={firebaseUser}
                                    url={sf.file.url}
                                    fileName={sf.file.name || sf.title}
                                    label={sf.file.name || sf.title}
                                  />
                                </div>
                              ))}
                            </div>
                          )}

                          {patientAttachments.map((item, idx) => (
                            <div
                              key={`${item.doc.url}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
                                <FileText className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                                <span>
                                  {item.doc.name} ({item.label})
                                </span>
                                <span className="font-latin text-slate-500">
                                  · {(item.doc.size / 1024).toFixed(0)} KB
                                </span>
                              </div>
                              <ProtectedMediaButton
                                firebaseUser={firebaseUser}
                                url={item.doc.url}
                                fileName={item.doc.name}
                              />
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Add Patient Modal */}
      {showAddPatient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowAddPatient(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleRegisterPatient}
            className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {pc.addPatientBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPatient(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold">{dc.appointments.patientName} *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.phone} *</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.dob}</label>
                <input
                  type="date"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.gender}</label>
                <select
                  value={newGender}
                  onChange={(e) => setNewGender(e.target.value as 'male' | 'female')}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="male">{pc.male}</option>
                  <option value="female">{pc.female}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.bloodType}</label>
                <input
                  type="text"
                  placeholder="O+, A+ ..."
                  value={newBloodType}
                  onChange={(e) => setNewBloodType(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.address}</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold">{pc.allergies}</label>
                <input
                  type="text"
                  value={newAllergies}
                  onChange={(e) => setNewAllergies(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold">{pc.chronicConditions}</label>
                <input
                  type="text"
                  value={newChronic}
                  onChange={(e) => setNewChronic(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddPatient(false)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {dc.appointments.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingPatient}
                className="medora-gold-button min-h-[40px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingPatient ? '...' : pc.addPatientBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Complete Add Visit Modal (Direct + Patient Summary + Optional Linked Rx) */}
      {showAddVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowAddVisit(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveVisit}
            className="max-h-[92dvh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {pc.addVisitTopBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddVisit(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Patient Selection */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold">{pc.searchPlaceholder}</label>
                <input
                  type="search"
                  value={visitPatientSearch}
                  onChange={(e) => setVisitPatientSearch(e.target.value)}
                  placeholder={pc.searchPlaceholder}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.selectPatientRequired} *</label>
                <select
                  required
                  value={visitPatientId}
                  onChange={(e) => setVisitPatientId(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">—</option>
                  {modalFilteredPatients.map((pt) => (
                    <option key={pt.patientRecordId} value={pt.patientRecordId}>
                      {pt.fullName} ({pt.fileNumber})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Live Patient Safety Summary Card before saving */}
            {modalSelectedPatient && (
              <div className="rounded-xl border border-[#0c3585]/25 bg-slate-50 p-3.5 text-xs dark:border-[#d9a43b]/30 dark:bg-slate-900/70">
                <p className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {pc.patientSummaryTitle}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <span className="text-slate-500">{dc.appointments.patientName}: </span>
                    <strong className="text-slate-900 dark:text-white">
                      {modalSelectedPatient.fullName}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{pc.fileNumber}: </span>
                    <strong className="font-latin">{modalSelectedPatient.fileNumber}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{pc.phone}: </span>
                    <strong className="font-latin" dir="ltr">
                      {modalSelectedPatient.phone}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">{pc.bloodType}: </span>
                    <strong>{modalSelectedPatient.bloodType || '—'}</strong>
                  </div>
                </div>
                {(modalSelectedPatient.allergies ||
                  modalSelectedPatient.chronicConditions) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {modalSelectedPatient.allergies && (
                      <span className="rounded-md bg-rose-100 px-2.5 py-1 font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
                        {pc.allergies}: {modalSelectedPatient.allergies}
                      </span>
                    )}
                    {modalSelectedPatient.chronicConditions && (
                      <span className="rounded-md bg-amber-100 px-2.5 py-1 font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                        {pc.chronicConditions}: {modalSelectedPatient.chronicConditions}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold">{pc.visitDate} *</label>
                <input
                  type="date"
                  required
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.visitTime}</label>
                <input
                  type="time"
                  value={visitTime}
                  onChange={(e) => setVisitTime(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.visitReason}</label>
                <input
                  type="text"
                  value={visitReason}
                  onChange={(e) => setVisitReason(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold">{pc.chiefComplaint}</label>
                <input
                  type="text"
                  value={chiefComplaint}
                  onChange={(e) => setChiefComplaint(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.diagnosis} *</label>
                <input
                  type="text"
                  required
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold">{pc.procedures}</label>
                <input
                  type="text"
                  value={procedures}
                  onChange={(e) => setProcedures(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.clinicalNotes}</label>
                <textarea
                  rows={3}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">{pc.treatmentRecommendations}</label>
                <textarea
                  rows={3}
                  value={treatmentRecommendations}
                  onChange={(e) => setTreatmentRecommendations(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {pc.vitalsTitle}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <input
                  type="text"
                  placeholder={pc.bp}
                  value={bp}
                  onChange={(e) => setBp(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder={pc.temp}
                  value={temp}
                  onChange={(e) => setTemp(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder={pc.hr}
                  value={hr}
                  onChange={(e) => setHr(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="text"
                  placeholder={pc.weight}
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            {/* Visit Attachments */}
            <div className="space-y-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold hover:border-[#0c3585] dark:border-slate-700">
                <Upload className="h-4 w-4" />
                <span>{uploadingFiles ? '...' : pc.attachFiles}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    void handleUploadVisitDocs(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{pc.attachHint}</p>
              {visitFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {visitFiles.map((f, idx) => (
                    <div
                      key={`${f.url}-${idx}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/70 px-2.5 py-1 text-xs dark:border-emerald-800 dark:bg-emerald-950/30"
                    >
                      <ProtectedMediaButton
                        firebaseUser={firebaseUser}
                        url={f.url}
                        fileName={f.name}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setVisitFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-rose-600 hover:text-rose-800 cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Optional Linked Prescription inside Visit Creation */}
            {isDoctor && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/50">
                <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInlineRx}
                    onChange={(e) => setIncludeInlineRx(e.target.checked)}
                    className="h-4 w-4 accent-[#0c3585]"
                  />
                  <span>{pc.inlineRxToggle}</span>
                </label>

                {includeInlineRx && (
                  <div className="mt-3 space-y-2.5">
                    {inlineMeds.map((m, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-950 sm:grid-cols-5"
                      >
                        <input
                          type="text"
                          placeholder={dc.prescriptions.drugName}
                          value={m.name}
                          onChange={(e) =>
                            setInlineMeds((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, name: e.target.value } : row,
                              ),
                            )
                          }
                          className="min-h-[34px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          placeholder={dc.prescriptions.dosage}
                          value={m.dosage}
                          onChange={(e) =>
                            setInlineMeds((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, dosage: e.target.value } : row,
                              ),
                            )
                          }
                          className="min-h-[34px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          placeholder={dc.prescriptions.frequency}
                          value={m.frequency}
                          onChange={(e) =>
                            setInlineMeds((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, frequency: e.target.value } : row,
                              ),
                            )
                          }
                          className="min-h-[34px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                        <input
                          type="text"
                          placeholder={dc.prescriptions.duration}
                          value={m.duration}
                          onChange={(e) =>
                            setInlineMeds((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, duration: e.target.value } : row,
                              ),
                            )
                          }
                          className="min-h-[34px] rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        />
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            placeholder={dc.prescriptions.instructions}
                            value={m.instructions}
                            onChange={(e) =>
                              setInlineMeds((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, instructions: e.target.value } : row,
                                ),
                              )
                            }
                            className="min-h-[34px] flex-1 rounded-lg border border-slate-300 px-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                          />
                          {inlineMeds.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setInlineMeds((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="p-1 text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setInlineMeds((prev) => [...prev, { ...EMPTY_MED }])
                        }
                        className="text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
                      >
                        + {dc.prescriptions.addMedRow}
                      </button>
                      <input
                        type="text"
                        placeholder={dc.prescriptions.doctorNotes}
                        value={inlineRxNotes}
                        onChange={(e) => setInlineRxNotes(e.target.value)}
                        className="min-h-[34px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddVisit(false)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {dc.appointments.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingVisit || uploadingFiles || !modalSelectedPatient}
                className="medora-gold-button min-h-[40px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingVisit ? '...' : pc.saveVisitBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Visit Details Inspection Modal */}
      {activeVisitModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setActiveVisitModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  {pc.visitDetailsTitle}
                </h3>
                <p className="font-latin text-xs text-slate-500 dark:text-slate-400">
                  {activeVisitModal.visitDate}
                  {activeVisitModal.visitTime ? ` · ${activeVisitModal.visitTime}` : ''} ·{' '}
                  {activeVisitModal.createdByName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveVisitModal(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {activeVisitModal.visitReason && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pc.visitReason}
                  </p>
                  <p>{activeVisitModal.visitReason}</p>
                </div>
              )}
              {activeVisitModal.chiefComplaint && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pc.chiefComplaint}
                  </p>
                  <p>{activeVisitModal.chiefComplaint}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {pc.diagnosis}
                </p>
                <p className="font-bold">{activeVisitModal.diagnosis}</p>
              </div>
              {activeVisitModal.procedures && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pc.procedures}
                  </p>
                  <p className="whitespace-pre-wrap">{activeVisitModal.procedures}</p>
                </div>
              )}
              {activeVisitModal.clinicalNotes && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pc.clinicalNotes}
                  </p>
                  <p className="whitespace-pre-wrap">{activeVisitModal.clinicalNotes}</p>
                </div>
              )}
              {activeVisitModal.treatmentRecommendations && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pc.treatmentRecommendations}
                  </p>
                  <p className="whitespace-pre-wrap">
                    {activeVisitModal.treatmentRecommendations}
                  </p>
                </div>
              )}
              {activeVisitModal.attachments && activeVisitModal.attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {activeVisitModal.attachments.map((att, idx) => (
                    <ProtectedMediaButton
                      key={`${att.url}-${idx}`}
                      firebaseUser={firebaseUser}
                      url={att.url}
                      fileName={att.name}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <button
                type="button"
                onClick={() => handlePrintVisit(activeVisitModal)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#0c3585] px-4 text-xs font-bold text-[#0c3585] dark:border-[#d9a43b] dark:text-[#f4d378] cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{pc.printBtn}</span>
              </button>
              <button
                type="button"
                disabled={exportingPdfKey === `visit:${activeVisitModal.visitId}`}
                onClick={() => void handleDownloadVisitPdf(activeVisitModal)}
                className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>
                  {exportingPdfKey === `visit:${activeVisitModal.visitId}`
                    ? pc.exportingPdf
                    : pc.downloadPdfBtn}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
