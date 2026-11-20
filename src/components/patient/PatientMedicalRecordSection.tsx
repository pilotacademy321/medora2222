import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  CheckCircle2,
  Eye,
  FileDown,
  FileText,
  FlaskConical,
  Pill,
  Printer,
  Search,
  Share2,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { PATIENT_TRANSLATIONS } from '../../i18n/patientTranslations';
import {
  comparePatientLabResultsWithHaneen,
} from '../../services/haneenService';
import {
  createMedicalRecordShare,
  createPatientMedicalFile,
  deleteMedicalRecordShare,
  deletePatientMedicalFile,
  updateMedicalRecordShare,
  uploadPatientStorageAsset,
} from '../../services/patientService';
import type {
  DiagnosticOrderRecord,
  PatientVisitRecord,
  PublicDoctorCard,
} from '../../types/doctor';
import type { HaneenLabComparisonResponse } from '../../types/haneen';
import type { Language } from '../../types/medora';
import type {
  MedicalRecordShareRecord,
  MedicalSharePermissions,
  PatientMedicalFileCategory,
  PatientWorkspaceData,
} from '../../types/patient';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import {
  DiagnosticOrderPrintSheet,
  LabResultReportPrintSheet,
  MedicalRecordSummaryPrintSheet,
  PrescriptionPrintSheet,
  VisitPrintSheet,
} from '../shared/MedoraPrintableDocument';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';

export type MedicalRecordTabId =
  | 'visits'
  | 'prescriptions'
  | 'diagnostics'
  | 'files'
  | 'sharing';

interface PatientMedicalRecordSectionProps {
  firebaseUser: User;
  workspace: PatientWorkspaceData;
  doctors: PublicDoctorCard[];
  language: Language;
  initialTab?: MedicalRecordTabId;
  onRefreshWorkspace: () => Promise<void>;
  onAskHaneenAboutResult?: (resultId: string) => void;
  onOpenMedicineFinder?: (prescriptionId: string) => void;
}

function getShareStatus(
  share: MedicalRecordShareRecord,
): 'active' | 'revoked' | 'expired' {
  if (share.revoked) return 'revoked';
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    return 'expired';
  }
  return 'active';
}

export function PatientMedicalRecordSection({
  firebaseUser,
  workspace,
  doctors,
  language,
  initialTab = 'visits',
  onRefreshWorkspace,
  onAskHaneenAboutResult,
  onOpenMedicineFinder,
}: PatientMedicalRecordSectionProps) {
  const pm = PATIENT_TRANSLATIONS[language].medicalRecord;
  const [tab, setTab] = useState<MedicalRecordTabId>(initialTab);
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exportingPdfKey, setExportingPdfKey] = useState<string | null>(null);
  const [detailVisit, setDetailVisit] = useState<
    | (PatientVisitRecord & {
        doctorName?: string;
        doctorAvatarUrl?: string;
        doctorSpecialty?: string;
        clinicName?: string;
      })
    | null
  >(null);

  const [compareConsent, setCompareConsent] = useState(false);
  const [comparingResults, setComparingResults] = useState(false);
  const [comparisonData, setComparisonData] = useState<HaneenLabComparisonResponse | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const handleRunSafeComparison = async () => {
    if (!compareConsent) {
      setComparisonError(
        language === 'ar'
          ? 'يرجى تفعيل موافقتك أولاً قبل تشغيل مقارنة النتائج عبر الزمن.'
          : 'Please check consent first before running lab comparison.',
      );
      return;
    }
    setComparingResults(true);
    setComparisonError(null);
    try {
      const resultIds = (workspace.publishedLabResults || [])
        .map((r) => r.resultId)
        .filter(Boolean);
      const data = await comparePatientLabResultsWithHaneen(firebaseUser, {
        consentGiven: true,
        ...(resultIds.length > 0 ? { resultIds } : {}),
      });
      setComparisonData(data);
    } catch (err) {
      setComparisonError(
        err instanceof Error
          ? err.message
          : language === 'ar'
            ? 'تعذر مقارنة النتائج حالياً.'
            : 'Unable to compare lab results.',
      );
    } finally {
      setComparingResults(false);
    }
  };

  // Upload state
  const [fileTitle, setFileTitle] = useState('');
  const [fileCategory, setFileCategory] =
    useState<PatientMedicalFileCategory>('lab');
  const [documentDate, setDocumentDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [fileNotes, setFileNotes] = useState('');
  const [chosenFile, setChosenFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Share consent state
  const [selectedDoctorUid, setSelectedDoctorUid] = useState('');
  const [sharePermissions, setSharePermissions] =
    useState<MedicalSharePermissions>({
      visits: true,
      prescriptions: true,
      diagnostics: true,
      uploadedFiles: true,
    });
  const [expiryDays, setExpiryDays] = useState<string>(() =>
    workspace.preferences.privacy.defaultShareExpiryDays
      ? String(workspace.preferences.privacy.defaultShareExpiryDays)
      : '',
  );
  const [savingShare, setSavingShare] = useState(false);

  const patientDisplayName =
    workspace.patientProfile?.fullName || workspace.userAccount.fullName || workspace.userAccount.googleName || '—';
  const patientDisplayPhone =
    workspace.patientProfile?.phone || workspace.userAccount.phone || '';
  const primaryClinicRecord = workspace.linkedPatients[0];

  const q = search.trim().toLowerCase();

  const sortedVisits = useMemo(() => {
    const list = workspace.visits.filter((v) => {
      if (!q) return true;
      return [
        v.diagnosis,
        v.chiefComplaint,
        v.clinicalNotes,
        v.doctorName || '',
        v.clinicName || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return [...list].sort((a, b) =>
      sortOrder === 'desc'
        ? b.visitDate.localeCompare(a.visitDate)
        : a.visitDate.localeCompare(b.visitDate),
    );
  }, [workspace.visits, q, sortOrder]);

  const sortedPrescriptions = useMemo(() => {
    const list = workspace.prescriptions.filter((rx) => {
      if (!q) return true;
      const meds = rx.medications.map((m) => m.name).join(' ');
      return [
        rx.doctorName,
        rx.clinicName,
        rx.doctorNotes || '',
        meds,
        rx.prescribedDate,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return [...list].sort((a, b) =>
      sortOrder === 'desc'
        ? b.prescribedDate.localeCompare(a.prescribedDate)
        : a.prescribedDate.localeCompare(b.prescribedDate),
    );
  }, [workspace.prescriptions, q, sortOrder]);

  const combinedDiagnostics = useMemo(() => {
    const clinicItems = workspace.diagnostics.map((d) => ({
      id: `order_${d.orderId}`,
      source: 'clinic' as const,
      title: d.requestedTests.join(' · '),
      facility: d.targetFacilityName || '—',
      date: d.orderedAt.slice(0, 10),
      status: d.status,
      summary: d.resultSummary || d.clinicalIndication || '',
      files: d.resultFiles || [],
      printOrder: d,
    }));
    const portalItems = workspace.labBookings.map(
      (b) => {
        const orderProxy = {
          orderId: b.bookingId,
          institutionId: b.institutionId || '',
          doctorUid: '',
          patientRecordId: '',
          patientName: b.patientName || patientDisplayName,
          orderType: b.facilityType,
          targetFacilityName: b.facilityName,
          requestedTests: b.requestedServices,
          clinicalIndication: b.notes || b.preparationNotes || '',
          priority: 'routine' as const,
          status: b.status,
          resultSummary: b.resultSummary || '',
          resultFiles: b.resultFiles || [],
          orderedAt: `${b.date}T${b.time || '09:00'}:00.000Z`,
          updatedAt: b.updatedAt || b.createdAt || new Date().toISOString(),
        };
        return {
          id: `booking_${b.bookingId}`,
          source: 'portal' as const,
          title: b.requestedServices.join(' · '),
          facility: b.facilityName,
          date: b.date,
          status: b.status,
          summary: b.resultSummary || b.preparationNotes || '',
          files: b.resultFiles || [],
          printOrder: orderProxy,
        };
      },
    );
    const merged = [...clinicItems, ...portalItems].filter((item) => {
      if (!q) return true;
      return [item.title, item.facility, item.summary, item.status]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return merged.sort((a, b) =>
      sortOrder === 'desc'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date),
    );
  }, [
    workspace.diagnostics,
    workspace.labBookings,
    q,
    sortOrder,
  ]);

  const sortedFiles = useMemo(() => {
    const list = workspace.medicalFiles.filter((f) => {
      if (!q) return true;
      return [f.title, f.notes || '', f.file.name, f.category]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
    return [...list].sort((a, b) =>
      sortOrder === 'desc'
        ? b.documentDate.localeCompare(a.documentDate)
        : a.documentDate.localeCompare(b.documentDate),
    );
  }, [workspace.medicalFiles, q, sortOrder]);

  const handleUploadFile = async (e: FormEvent) => {
    e.preventDefault();
    if (!chosenFile || !fileTitle.trim()) return;
    setUploading(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const uploadedMeta = await uploadPatientStorageAsset(
        firebaseUser,
        'patient_records',
        chosenFile,
      );
      await createPatientMedicalFile(firebaseUser, {
        title: fileTitle.trim(),
        category: fileCategory,
        documentDate,
        notes: fileNotes.trim(),
        file: uploadedMeta,
      });
      setFileTitle('');
      setFileNotes('');
      setChosenFile(null);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploading(false);
    }
  };

  const runPdfExport = async (
    key: string,
    filename: string,
    element: React.ReactElement,
  ) => {
    setExportingPdfKey(key);
    setErrorMsg(null);
    try {
      await downloadMedoraPdf({
        filename: sanitizePdfFilename(filename),
        element,
        dir: language === 'ar' ? 'rtl' : 'ltr',
      });
    } catch {
      setErrorMsg(
        language === 'ar'
          ? 'تعذر إنشاء ملف PDF. يرجى المحاولة مرة أخرى.'
          : 'Failed to generate PDF file. Please try again.',
      );
    } finally {
      setExportingPdfKey(null);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    setErrorMsg(null);
    try {
      await deletePatientMedicalFile(firebaseUser, fileId);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'FILE_DELETE_FAILED');
    }
  };

  const handleGrantShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorUid) return;
    setSavingShare(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const daysNum = Number(expiryDays);
      const expiresAt =
        expiryDays && Number.isFinite(daysNum) && daysNum > 0
          ? new Date(Date.now() + daysNum * 24 * 60 * 60 * 1000).toISOString()
          : null;
      await createMedicalRecordShare(firebaseUser, {
        doctorUid: selectedDoctorUid,
        permissions: sharePermissions,
        expiresAt,
      });
      setFeedbackMsg(pm.shareUpdatedMsg);
      setSelectedDoctorUid('');
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SHARE_CREATE_FAILED');
    } finally {
      setSavingShare(false);
    }
  };

  const handleRevokeShare = async (shareId: string) => {
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await updateMedicalRecordShare(firebaseUser, shareId, { revoked: true });
      setFeedbackMsg(pm.shareUpdatedMsg);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SHARE_REVOKE_FAILED');
    }
  };

  const handleDeleteShare = async (shareId: string) => {
    setErrorMsg(null);
    try {
      await deleteMedicalRecordShare(firebaseUser, shareId);
      await onRefreshWorkspace();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SHARE_DELETE_FAILED');
    }
  };

  return (
    <div className="space-y-6">
      <div className="medora-no-print rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {pm.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {pm.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void printMedoraDocument(
                  <MedicalRecordSummaryPrintSheet
                    lang={language}
                    patientName={patientDisplayName}
                    patientPhone={patientDisplayPhone}
                    fileNumber={primaryClinicRecord?.fileNumber}
                    bloodType={primaryClinicRecord?.bloodType}
                    allergies={primaryClinicRecord?.allergies}
                    chronicConditions={primaryClinicRecord?.chronicConditions}
                    visits={workspace.visits}
                    prescriptions={workspace.prescriptions}
                    diagnostics={workspace.diagnostics}
                  />,
                  `${pm.printRecordBtn} - ${patientDisplayName}`,
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-800 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pm.printRecordBtn}</span>
            </button>
            <button
              type="button"
              disabled={exportingPdfKey === 'full_record'}
              onClick={() =>
                void runPdfExport(
                  'full_record',
                  `medora-medical-record-${patientDisplayName}`,
                  <MedicalRecordSummaryPrintSheet
                    lang={language}
                    patientName={patientDisplayName}
                    patientPhone={patientDisplayPhone}
                    fileNumber={primaryClinicRecord?.fileNumber}
                    bloodType={primaryClinicRecord?.bloodType}
                    allergies={primaryClinicRecord?.allergies}
                    chronicConditions={primaryClinicRecord?.chronicConditions}
                    visits={workspace.visits}
                    prescriptions={workspace.prescriptions}
                    diagnostics={workspace.diagnostics}
                  />,
                )
              }
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {exportingPdfKey === 'full_record'
                  ? pm.exportingPdf
                  : pm.downloadRecordPdfBtn}
              </span>
            </button>
          </div>
        </div>

        {/* Search + Sort */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={pm.searchPlaceholder}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-slate-50 ps-10 pe-4 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
            className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="desc">{pm.newestFirst}</option>
            <option value="asc">{pm.oldestFirst}</option>
          </select>
        </div>

        {/* Sub-tabs */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              'visits',
              'prescriptions',
              'diagnostics',
              'files',
              'sharing',
            ] as MedicalRecordTabId[]
          ).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
                tab === key
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {pm.tabs[key]}
            </button>
          ))}
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

      {/* Visits */}
      {tab === 'visits' && (
        <div className="space-y-4">
          {sortedVisits.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
              {pm.noVisits}
            </div>
          ) : (
            sortedVisits.map((visit) => {
              const linkedRx = visit.linkedPrescriptionId
                ? workspace.prescriptions.find(
                    (r) => r.prescriptionId === visit.linkedPrescriptionId,
                  ) || null
                : null;
              const patientForSheet = {
                fullName: patientDisplayName,
                phone: patientDisplayPhone,
                fileNumber: primaryClinicRecord?.fileNumber,
                bloodType: primaryClinicRecord?.bloodType,
                allergies: primaryClinicRecord?.allergies,
                chronicConditions: primaryClinicRecord?.chronicConditions,
              };
              return (
                <article
                  key={visit.visitId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex min-w-0 items-center gap-3">
                      {visit.doctorAvatarUrl ? (
                        <img
                          src={visit.doctorAvatarUrl}
                          alt={visit.doctorName || visit.createdByName}
                          referrerPolicy="no-referrer"
                          className="h-10 w-10 shrink-0 rounded-full border border-[#d9a43b]/40 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d9a43b]/30 bg-[#0c3585]/10 text-xs font-bold text-[#0c3585] dark:bg-[#f4d378]/15 dark:text-[#f4d378]">
                          {(visit.doctorName || visit.createdByName || 'D').trim().charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">
                          {visit.diagnosis || visit.visitReason || visit.chiefComplaint}
                        </h2>
                        <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                          {visit.doctorName || visit.createdByName}
                          {visit.clinicName ? ` · ${visit.clinicName}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="font-latin text-xs font-bold text-slate-600 tabular-nums dark:text-slate-300"
                        dir="ltr"
                      >
                        {visit.visitDate}
                        {visit.visitTime ? ` · ${visit.visitTime}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDetailVisit(visit)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pm.viewDetailsBtn}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void printMedoraDocument(
                            <VisitPrintSheet
                              visit={visit}
                              patient={patientForSheet}
                              linkedRx={linkedRx}
                              lang={language}
                            />,
                            `${pm.visitDetailsTitle} - ${visit.visitDate}`,
                          )
                        }
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pm.printBtn}</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfKey === `visit_${visit.visitId}`}
                        onClick={() =>
                          void runPdfExport(
                            `visit_${visit.visitId}`,
                            `visit-${visit.visitDate}`,
                            <VisitPrintSheet
                              visit={visit}
                              patient={patientForSheet}
                              linkedRx={linkedRx}
                              lang={language}
                            />,
                          )
                        }
                        className="medora-gold-button inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {exportingPdfKey === `visit_${visit.visitId}`
                            ? pm.exportingPdf
                            : pm.downloadPdfBtn}
                        </span>
                      </button>
                    </div>
                  </div>
                  {visit.visitReason && (
                    <p className="mt-2.5 text-xs text-slate-700 dark:text-slate-200">
                      <strong className="text-[#0c3585] dark:text-[#f4d378]">
                        {pm.visitReasonLabel}:{' '}
                      </strong>
                      {visit.visitReason}
                    </p>
                  )}
                  {visit.chiefComplaint && (
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                      {visit.chiefComplaint}
                    </p>
                  )}
                  {visit.procedures && (
                    <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-200">
                      <strong className="text-[#0c3585] dark:text-[#f4d378]">
                        {pm.proceduresLabel}:{' '}
                      </strong>
                      {visit.procedures}
                    </p>
                  )}
                  {visit.clinicalNotes && (
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {visit.clinicalNotes}
                    </p>
                  )}
                  {visit.treatmentRecommendations && (
                    <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-200">
                      <strong className="text-[#0c3585] dark:text-[#f4d378]">
                        {pm.treatmentLabel}:{' '}
                      </strong>
                      {visit.treatmentRecommendations}
                    </p>
                  )}
                  {visit.vitals &&
                    Object.values(visit.vitals).some((val) => Boolean(val)) && (
                      <div className="mt-3 flex flex-wrap gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2 text-xs text-slate-700 tabular-nums dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                        <span className="font-bold">{pm.vitalsLabel}:</span>
                        {visit.vitals.bloodPressure && (
                          <span>BP: {visit.vitals.bloodPressure}</span>
                        )}
                        {visit.vitals.temperature && (
                          <span>Temp: {visit.vitals.temperature}</span>
                        )}
                        {visit.vitals.heartRate && (
                          <span>HR: {visit.vitals.heartRate}</span>
                        )}
                        {visit.vitals.weightKg && (
                          <span>Weight: {visit.vitals.weightKg} kg</span>
                        )}
                      </div>
                    )}
                  {visit.attachments && visit.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {visit.attachments.map((att, idx) => (
                        <ProtectedMediaButton
                          key={`${visit.visitId}-att-${idx}`}
                          firebaseUser={firebaseUser}
                          url={att.url}
                          fileName={att.name}
                          label={att.name}
                        />
                      ))}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      )}

      {/* Prescriptions */}
      {tab === 'prescriptions' && (
        <div className="space-y-4">
          {sortedPrescriptions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
              {pm.noPrescriptions}
            </div>
          ) : (
            sortedPrescriptions.map((rx) => (
              <article
                key={rx.prescriptionId}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {rx.doctorName} · {rx.doctorSpecialty}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {rx.clinicName} — {rx.clinicAddress}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="font-latin text-xs font-bold text-slate-600 tabular-nums dark:text-slate-300"
                      dir="ltr"
                    >
                      {rx.prescribedDate}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void printMedoraDocument(
                          <PrescriptionPrintSheet rx={rx} lang={language} />,
                          `${pm.tabs.prescriptions} - ${rx.prescribedDate}`,
                        )
                      }
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pm.printBtn}</span>
                    </button>
                    <button
                      type="button"
                      disabled={exportingPdfKey === `rx_${rx.prescriptionId}`}
                      onClick={() =>
                        void runPdfExport(
                          `rx_${rx.prescriptionId}`,
                          `prescription-${rx.prescribedDate}`,
                          <PrescriptionPrintSheet rx={rx} lang={language} />,
                        )
                      }
                      className="medora-gold-button inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {exportingPdfKey === `rx_${rx.prescriptionId}`
                          ? pm.exportingPdf
                          : pm.downloadPdfBtn}
                      </span>
                    </button>
                    {onOpenMedicineFinder && (
                      <button
                        type="button"
                        onClick={() => onOpenMedicineFinder(rx.prescriptionId)}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-teal-600/40 bg-teal-50 px-3 text-xs font-bold text-teal-800 hover:bg-teal-100 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-200 cursor-pointer"
                      >
                        <Pill className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {language === 'ar' ? 'بحث وطلب من الصيدلية' : 'Find in Pharmacies'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {rx.medications.map((med, idx) => (
                    <li
                      key={`${rx.prescriptionId}-${idx}`}
                      className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/60"
                    >
                      <p className="font-bold text-slate-900 dark:text-white">
                        {med.name}{' '}
                        {med.dosage ? (
                          <span className="font-latin text-[#0c3585] dark:text-[#f4d378]">
                            ({med.dosage})
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        {[med.frequency, med.duration, med.instructions]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
                {rx.doctorNotes && (
                  <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    {rx.doctorNotes}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {/* Diagnostics */}
      {tab === 'diagnostics' && (
        <div className="space-y-4">
          {workspace.publishedLabResults && workspace.publishedLabResults.length > 0 && (
            <section className="rounded-2xl border border-[#d9a43b]/40 bg-white p-5 shadow-sm dark:border-[#d9a43b]/35 dark:bg-[#07122a]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>
                      {language === 'ar'
                        ? 'مقارنة التحاليل عبر الزمن (بموافقتك)'
                        : 'Safe Longitudinal Lab Comparison (Opt-In)'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {language === 'ar'
                      ? 'يفصل هذا العرض بين أرقام المختبر المطبوعة وتوضيح حنين التثقيفي، ولا يقارن إلا نفس الفحص وبنفس وحدة القياس دون أي تحويل وحدات تلقائي.'
                      : 'Separates printed lab figures from Haneen educational notes. Only compares identical tests with identical units.'}
                  </p>
                </div>
                {comparisonData && (
                  <button
                    type="button"
                    onClick={() => setComparisonData(null)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    {language === 'ar' ? 'إخفاء المقارنة' : 'Hide'}
                  </button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compareConsent}
                    onChange={(e) => setCompareConsent(e.target.checked)}
                    className="h-4 w-4 accent-[#0c3585]"
                  />
                  <span>
                    {language === 'ar'
                      ? 'أوافق على مقارنة نتائج تحاليلي المنشورة في هذا القسم عبر التواريخ'
                      : 'I consent to comparing my published lab results across dates'}
                  </span>
                </label>
                <button
                  type="button"
                  disabled={comparingResults || !compareConsent}
                  onClick={() => void handleRunSafeComparison()}
                  className="medora-gold-button inline-flex min-h-[34px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {comparingResults
                      ? language === 'ar'
                        ? 'جاري المقارنة...'
                        : 'Comparing...'
                      : language === 'ar'
                        ? 'تشغيل المقارنة الآمنة'
                        : 'Run Safe Comparison'}
                  </span>
                </button>
              </div>

              {comparisonError && (
                <p className="mt-2.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                  {comparisonError}
                </p>
              )}

              {comparisonData && (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
                    {comparisonData.safetyDisclaimerAr}
                  </p>
                  {comparisonData.series.length === 0 ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {language === 'ar'
                        ? 'لا توجد قيم تحليلية كافية في التقارير المنشورة.'
                        : 'No analyzable lab values found.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {comparisonData.series.map((ser) => (
                        <div
                          key={ser.seriesKey}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              {ser.testName}
                            </h3>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                ser.trendDirection === 'unit_mismatch'
                                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                                  : ser.comparable
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                              }`}
                            >
                              {ser.trendDirection === 'unit_mismatch'
                                ? 'اختلاف وحدات القياس'
                                : ser.comparable
                                  ? `قابل للمقارنة (${ser.unit})`
                                  : 'قراءة واحدة / غير كافٍ'}
                            </span>
                          </div>

                          {/* Raw Printed Values (Strictly separated from Haneen text) */}
                          <div className="mt-2.5 space-y-1 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] dark:border-slate-800 dark:bg-slate-950">
                            <p className="font-bold text-slate-500 dark:text-slate-400">
                              {language === 'ar' ? 'الأرقام المطبوعة من المختبر:' : 'Raw Lab Numbers:'}
                            </p>
                            {ser.points.map((pt, pIdx) => (
                              <div
                                key={`${ser.seriesKey}-${pIdx}`}
                                className="flex flex-wrap items-center justify-between gap-2 text-slate-800 dark:text-slate-200"
                              >
                                <span className="font-latin" dir="ltr">
                                  {pt.date}: <strong>{pt.rawValue}</strong> {pt.unit}
                                </span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                                  المدى: {pt.referenceRange}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Haneen's Separate Plain Educational Summary */}
                          <p className="mt-2.5 text-xs leading-relaxed text-slate-800 dark:text-slate-100">
                            <strong className="text-[#0c3585] dark:text-[#f4d378]">
                              {language === 'ar' ? 'ملخص حنين التثقيفي: ' : 'Haneen Note: '}
                            </strong>
                            {ser.haneenSummaryAr}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {workspace.publishedLabResults && workspace.publishedLabResults.length > 0 && (
            <div className="space-y-3">
              {workspace.publishedLabResults.map((res) => (
                <article
                  key={`lab_res_${res.resultId}`}
                  className="rounded-2xl border border-[#0c3585]/25 bg-white p-5 dark:border-blue-500/30 dark:bg-[#07122a]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {language === 'ar'
                            ? 'نتيجة مختبرية معتمدة — MEDORA LAB'
                            : 'Verified Laboratory Report — MEDORA LAB'}
                        </span>
                      </div>
                      <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                        {res.labNameAr}
                      </h2>
                      <p className="font-latin text-xs text-slate-500 tabular-nums">
                        {res.reportNumber} · {res.orderNumber}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {onAskHaneenAboutResult && (
                        <button
                          type="button"
                          onClick={() => onAskHaneenAboutResult(res.resultId)}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#0c3585]/35 bg-[#0c3585]/10 px-2.5 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/15 dark:border-[#d9a43b]/45 dark:bg-[#d9a43b]/15 dark:text-[#f4d378] cursor-pointer"
                        >
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{language === 'ar' ? 'اسأل حنين' : 'Ask Haneen'}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void printMedoraDocument(
                            <LabResultReportPrintSheet result={res} lang={language} />,
                            `${res.reportNumber} - ${res.labNameAr}`,
                          )
                        }
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pm.printBtn}</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfKey === `labres_${res.resultId}`}
                        onClick={() =>
                          void runPdfExport(
                            `labres_${res.resultId}`,
                            `lab-report-${res.reportNumber}`,
                            <LabResultReportPrintSheet result={res} lang={language} />,
                          )
                        }
                        className="medora-gold-button inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {exportingPdfKey === `labres_${res.resultId}`
                            ? pm.exportingPdf
                            : pm.downloadPdfBtn}
                        </span>
                      </button>
                    </div>
                  </div>

                  {res.analytes && res.analytes.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-start text-xs">
                        <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-start">{language === 'ar' ? 'الفحص' : 'Test'}</th>
                            <th className="px-3 py-2 text-center">{language === 'ar' ? 'النتيجة' : 'Result'}</th>
                            <th className="px-3 py-2 text-center">{language === 'ar' ? 'الوحدة' : 'Unit'}</th>
                            <th className="px-3 py-2 text-center">{language === 'ar' ? 'المدى المرجعي' : 'Reference'}</th>
                            <th className="px-3 py-2 text-center">{language === 'ar' ? 'التقييم' : 'Flag'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {res.analytes.map((a, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white">{a.testName}</td>
                              <td className="px-3 py-2 text-center font-latin font-bold tabular-nums">{a.value}</td>
                              <td className="px-3 py-2 text-center font-latin">{a.unit || '—'}</td>
                              <td className="px-3 py-2 text-center font-latin">{a.referenceRange || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold uppercase text-xs">
                                <span
                                  className={
                                    a.flag === 'normal'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                  }
                                >
                                  {a.flag}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {res.summaryNote && (
                    <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {res.summaryNote}
                    </p>
                  )}

                  {res.attachments && res.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {res.attachments.map((att, idx) => (
                        <ProtectedMediaButton
                          key={`${res.resultId}-att-${idx}`}
                          firebaseUser={firebaseUser}
                          url={att.url}
                          fileName={att.name}
                          label={att.name || pm.openResultFile}
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#0c3585]/30 bg-[#0c3585]/5 px-3 text-xs font-bold text-[#0c3585] hover:underline dark:border-[#d9a43b]/40 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
                        />
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {combinedDiagnostics.length === 0 &&
          (!workspace.publishedLabResults || workspace.publishedLabResults.length === 0) ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
              {pm.noDiagnostics}
            </div>
          ) : (
            combinedDiagnostics.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {item.source === 'clinic'
                          ? pm.sourceClinic
                          : pm.sourcePortalBooking}
                      </span>
                    </div>
                    <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                      {item.title}
                    </h2>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {item.facility}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="text-end">
                      <span
                        className="block font-latin text-xs font-bold text-slate-600 tabular-nums dark:text-slate-300"
                        dir="ltr"
                      >
                        {item.date}
                      </span>
                      <span className="mt-1 inline-block rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        {item.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void printMedoraDocument(
                            <DiagnosticOrderPrintSheet
                              order={item.printOrder}
                              clinicName={item.facility}
                              lang={language}
                            />,
                            `${pm.tabs.diagnostics} - ${item.date}`,
                          )
                        }
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-[11px] font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Printer className="h-3 w-3" aria-hidden="true" />
                        <span>{pm.printBtn}</span>
                      </button>
                      <button
                        type="button"
                        disabled={exportingPdfKey === `diag_${item.id}`}
                        onClick={() =>
                          void runPdfExport(
                            `diag_${item.id}`,
                            `diagnostic-${item.date}`,
                            <DiagnosticOrderPrintSheet
                              order={item.printOrder}
                              clinicName={item.facility}
                              lang={language}
                            />,
                          )
                        }
                        className="medora-gold-button inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                      >
                        <FileDown className="h-3 w-3" aria-hidden="true" />
                        <span>
                          {exportingPdfKey === `diag_${item.id}`
                            ? pm.exportingPdf
                            : pm.downloadPdfBtn}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
                {item.summary && (
                  <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                    {item.summary}
                  </p>
                )}
                {item.files.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.files.map((f, idx) => (
                      <ProtectedMediaButton
                        key={`${item.id}-file-${idx}`}
                        firebaseUser={firebaseUser}
                        url={f.url}
                        fileName={f.name}
                        label={f.name || pm.openResultFile}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[#0c3585]/30 bg-[#0c3585]/5 px-3 text-xs font-bold text-[#0c3585] hover:underline dark:border-[#d9a43b]/40 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
                      />
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      )}

      {/* Uploaded Personal Medical Files */}
      {tab === 'files' && (
        <div className="space-y-6">
          <form
            onSubmit={handleUploadFile}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {pm.uploadTitle}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.fileTitleLabel}
                </label>
                <input
                  type="text"
                  required
                  value={fileTitle}
                  onChange={(e) => setFileTitle(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.fileCategoryLabel}
                </label>
                <select
                  value={fileCategory}
                  onChange={(e) =>
                    setFileCategory(e.target.value as PatientMedicalFileCategory)
                  }
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {(
                    [
                      'visit',
                      'lab',
                      'imaging',
                      'prescription',
                      'other',
                    ] as PatientMedicalFileCategory[]
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {pm.categories[cat]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.fileDateLabel}
                </label>
                <input
                  type="date"
                  required
                  value={documentDate}
                  onChange={(e) => setDocumentDate(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.fileNotesLabel}
                </label>
                <input
                  type="text"
                  value={fileNotes}
                  onChange={(e) => setFileNotes(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.chooseFileBtn}
                </label>
                <input
                  type="file"
                  required
                  accept="image/*,.heic,.heif,application/pdf"
                  onChange={(e) => setChosenFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-xs text-slate-600 file:me-3 file:rounded-xl file:border-0 file:bg-[#0c3585] file:px-4 file:py-2.5 file:text-xs file:font-bold file:text-white dark:text-slate-300"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={uploading || !chosenFile || !fileTitle.trim()}
              className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{uploading ? '...' : pm.saveFileBtn}</span>
            </button>
          </form>

          {sortedFiles.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
              {pm.noFiles}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {sortedFiles.map((rec) => (
                <article
                  key={rec.fileId}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <FileText
                          className="h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]"
                          aria-hidden="true"
                        />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {rec.title}
                        </h3>
                      </div>
                      <span
                        className="font-latin text-xs text-slate-500 tabular-nums dark:text-slate-400"
                        dir="ltr"
                      >
                        {rec.documentDate}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                      {pm.categories[rec.category]}
                    </p>
                    {rec.notes && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                        {rec.notes}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <ProtectedMediaButton
                      firebaseUser={firebaseUser}
                      url={rec.file.url}
                      fileName={rec.file.name}
                      label={pm.openResultFile}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={() => void handleDeleteFile(rec.fileId)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{pm.deleteFileBtn}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Consent-Based Sharing */}
      {tab === 'sharing' && (
        <div className="space-y-6">
          <form
            onSubmit={handleGrantShare}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center gap-2">
              <Share2
                className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]"
                aria-hidden="true"
              />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {pm.shareTitle}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.selectDoctorLabel}
                </label>
                <select
                  required
                  value={selectedDoctorUid}
                  onChange={(e) => setSelectedDoctorUid(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{pm.selectDoctorLabel}</option>
                  {doctors.map((doc) => (
                    <option key={doc.doctorUid} value={doc.doctorUid}>
                      {doc.fullName} — {doc.specialty} ({doc.clinicName})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {pm.expiryLabel}
                </label>
                <select
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">{pm.noExpiry}</option>
                  <option value="7">7 {pm.expiryDaysOption}</option>
                  <option value="30">30 {pm.expiryDaysOption}</option>
                  <option value="90">90 {pm.expiryDaysOption}</option>
                </select>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {pm.permissionsLabel}
              </p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['visits', pm.permVisits],
                    ['prescriptions', pm.permPrescriptions],
                    ['diagnostics', pm.permDiagnostics],
                    ['uploadedFiles', pm.permUploadedFiles],
                  ] as Array<[keyof MedicalSharePermissions, string]>
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex min-h-[40px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={sharePermissions[key]}
                      onChange={(e) =>
                        setSharePermissions((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[#0c3585]"
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingShare || !selectedDoctorUid}
              className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{savingShare ? '...' : pm.grantShareBtn}</span>
            </button>
          </form>

          {workspace.shares.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
              {pm.noShares}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {workspace.shares.map((share) => {
                const status = getShareStatus(share);
                return (
                  <article
                    key={share.shareId}
                    className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                          {share.doctorName}
                        </h3>
                        <p className="text-xs text-[#0c3585] dark:text-[#f4d378]">
                          {share.doctorSpecialty} · {share.clinicName}
                        </p>
                      </div>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                          status === 'active'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                            : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
                        }`}
                      >
                        {status === 'active'
                          ? pm.activeLabel
                          : status === 'revoked'
                            ? pm.revokedLabel
                            : pm.expiredLabel}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      {share.permissions.visits && <span>· {pm.tabs.visits}</span>}
                      {share.permissions.prescriptions && (
                        <span>· {pm.tabs.prescriptions}</span>
                      )}
                      {share.permissions.diagnostics && (
                        <span>· {pm.tabs.diagnostics}</span>
                      )}
                      {share.permissions.uploadedFiles && (
                        <span>· {pm.tabs.files}</span>
                      )}
                    </div>

                    <p className="mt-2 font-latin text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      {share.expiresAt
                        ? `${pm.expiryLabel}: ${share.expiresAt.slice(0, 10)}`
                        : pm.noExpiry}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                      {status === 'active' && (
                        <button
                          type="button"
                          onClick={() => void handleRevokeShare(share.shareId)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-bold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200 cursor-pointer"
                        >
                          <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{pm.revokeShareBtn}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteShare(share.shareId)}
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-rose-600 hover:underline dark:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{pm.deleteShareBtn}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Visit Details Modal */}
      {detailVisit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setDetailVisit(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {pm.visitDetailsTitle}
                </h3>
                <p className="text-xs text-[#0c3585] dark:text-[#f4d378]">
                  {detailVisit.doctorName || detailVisit.createdByName}
                  {detailVisit.clinicName ? ` · ${detailVisit.clinicName}` : ''} ·{' '}
                  {detailVisit.visitDate}
                  {detailVisit.visitTime ? ` ${detailVisit.visitTime}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailVisit(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5 text-sm">
              {detailVisit.visitReason && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pm.visitReasonLabel}
                  </p>
                  <p className="mt-1 text-slate-800 dark:text-slate-100">
                    {detailVisit.visitReason}
                  </p>
                </div>
              )}
              {detailVisit.chiefComplaint && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {language === 'ar' ? 'الشكوى الرئيسية' : 'Chief Complaint'}
                  </p>
                  <p className="mt-1 text-slate-800 dark:text-slate-100">
                    {detailVisit.chiefComplaint}
                  </p>
                </div>
              )}
              {detailVisit.diagnosis && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {language === 'ar' ? 'التشخيص' : 'Diagnosis'}
                  </p>
                  <p className="mt-1 text-slate-800 dark:text-slate-100">
                    {detailVisit.diagnosis}
                  </p>
                </div>
              )}
              {detailVisit.procedures && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pm.proceduresLabel}
                  </p>
                  <p className="mt-1 text-slate-800 dark:text-slate-100">
                    {detailVisit.procedures}
                  </p>
                </div>
              )}
              {detailVisit.clinicalNotes && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {language === 'ar' ? 'الملاحظات السريرية' : 'Clinical Notes'}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                    {detailVisit.clinicalNotes}
                  </p>
                </div>
              )}
              {detailVisit.treatmentRecommendations && (
                <div>
                  <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pm.treatmentLabel}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100">
                    {detailVisit.treatmentRecommendations}
                  </p>
                </div>
              )}
              {detailVisit.attachments && detailVisit.attachments.length > 0 && (
                <div className="pt-2">
                  <div className="flex flex-wrap gap-2">
                    {detailVisit.attachments.map((att, idx) => (
                      <ProtectedMediaButton
                        key={`modal-att-${idx}`}
                        firebaseUser={firebaseUser}
                        url={att.url}
                        fileName={att.name}
                        label={att.name}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
