import { useMemo, useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  FileDown,
  FlaskConical,
  Lock,
  Plus,
  Printer,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import { CLIENT_IMAGING_PORTAL_ENABLED } from '../../config/featureFlags';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import {
  createDiagnosticOrder,
  updateDiagnosticOrderResult,
  uploadDoctorStorageAsset,
} from '../../services/doctorService';
import type {
  DiagnosticOrderRecord,
  DiagnosticOrderStatus,
  DiagnosticOrderType,
  DoctorWorkspaceData,
} from '../../types/doctor';
import type { Language, UploadedDocMeta } from '../../types/medora';
import { mapUploadErrorMessage } from '../../utils/imagePreparation';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import { DiagnosticOrderPrintSheet } from '../shared/MedoraPrintableDocument';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';

interface DoctorDiagnosticsSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

export function DoctorDiagnosticsSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
}: DoctorDiagnosticsSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const dg = dc.diagnostics;

  const isDoctor = workspace.actorRole === 'doctor';
  const canUploadResult =
    isDoctor || workspace.permissions.includes('uploadLabResults');

  const [typeFilter, setTypeFilter] = useState<'all' | DiagnosticOrderType>('all');
  const [patientFilter, setPatientFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New Order Modal
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<DiagnosticOrderType>('lab');
  const [patientRecordId, setPatientRecordId] = useState(
    () => workspace.patients[0]?.patientRecordId || '',
  );
  const [facilityName, setFacilityName] = useState('');
  const [testsText, setTestsText] = useState('');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent'>('routine');
  const [savingOrder, setSavingOrder] = useState(false);

  // Result Modal
  const [resultTarget, setResultTarget] = useState<DiagnosticOrderRecord | null>(
    null,
  );
  const [resultStatus, setResultStatus] =
    useState<DiagnosticOrderStatus>('results_received');
  const [resultSummary, setResultSummary] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [resultFiles, setResultFiles] = useState<UploadedDocMeta[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    return workspace.diagnostics.filter((ord) => {
      if (typeFilter !== 'all' && ord.orderType !== typeFilter) return false;
      if (patientFilter && ord.patientRecordId !== patientFilter) return false;
      return true;
    });
  }, [workspace.diagnostics, typeFilter, patientFilter]);

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!patientRecordId) return;
    if (!CLIENT_IMAGING_PORTAL_ENABLED && orderType === 'imaging') {
      setErrorMsg(dg.imagingClosedNotice);
      return;
    }
    setSavingOrder(true);
    setErrorMsg(null);
    try {
      const requestedTests = testsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await createDiagnosticOrder(firebaseUser, {
        patientRecordId,
        orderType: CLIENT_IMAGING_PORTAL_ENABLED ? orderType : 'lab',
        targetFacilityName: facilityName.trim(),
        requestedTests,
        clinicalIndication: clinicalIndication.trim(),
        priority,
      });
      await onRefreshWorkspace();
      setShowOrderModal(false);
      setFacilityName('');
      setTestsText('');
      setClinicalIndication('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleUploadResultFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !resultTarget) return;
    setUploadingFiles(true);
    setErrorMsg(null);
    try {
      const list: UploadedDocMeta[] = [];
      for (const file of Array.from(files)) {
        const meta = await uploadDoctorStorageAsset(
          firebaseUser,
          'diagnostic_results',
          file,
          { patientRecordId: resultTarget.patientRecordId },
        );
        list.push(meta);
      }
      setResultFiles((prev) => [...prev, ...list]);
    } catch (err) {
      setErrorMsg(mapUploadErrorMessage(err, language));
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleSaveResult = async (e: FormEvent) => {
    e.preventDefault();
    if (!resultTarget) return;
    setSavingResult(true);
    setErrorMsg(null);
    try {
      await updateDiagnosticOrderResult(firebaseUser, resultTarget.orderId, {
        status: resultStatus,
        resultSummary: resultSummary.trim(),
        doctorNotes: doctorNotes.trim(),
        resultFiles,
      });
      await onRefreshWorkspace();
      setResultTarget(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSavingResult(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {CLIENT_IMAGING_PORTAL_ENABLED ? dg.title : dg.imagingClosedTitle}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {CLIENT_IMAGING_PORTAL_ENABLED
              ? dg.extensibleNote
              : dg.extensibleNoteLabOnly}
          </p>
        </div>

        {isDoctor && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setOrderType('lab');
                setShowOrderModal(true);
              }}
              className="medora-gold-button inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>
                {CLIENT_IMAGING_PORTAL_ENABLED ? dg.newOrderBtn : dg.orderTypeLab}
              </span>
            </button>

            {!CLIENT_IMAGING_PORTAL_ENABLED && (
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex min-h-[42px] cursor-not-allowed items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-bold text-amber-900 opacity-85 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{dg.orderTypeImagingClosed}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {!CLIENT_IMAGING_PORTAL_ENABLED && (
        <div
          data-testid="doctor-imaging-closed-banner"
          className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50/90 px-4 py-3 text-xs font-bold text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]"
        >
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{dg.imagingClosedNotice}</span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all', label: dg.filterAll },
              { id: 'lab', label: dg.filterLab },
              {
                id: 'imaging',
                label: CLIENT_IMAGING_PORTAL_ENABLED
                  ? dg.filterImaging
                  : `${dg.filterImaging} (${dg.imagingClosedBadge})`,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setTypeFilter(f.id)}
              className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
                typeFilter === f.id
                  ? 'bg-[#0c3585] text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={patientFilter}
          onChange={(e) => setPatientFilter(e.target.value)}
          className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        >
          <option value="">{dg.filterAll}</option>
          {workspace.patients.map((pt) => (
            <option key={pt.patientRecordId} value={pt.patientRecordId}>
              {pt.fullName}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {dg.noOrders}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((ord) => (
            <article
              key={ord.orderId}
              className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#0c3585] dark:bg-slate-900 dark:text-[#f4d378]">
                    {ord.orderType === 'lab' ? (
                      <FlaskConical className="h-5 w-5" />
                    ) : (
                      <ScanLine className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {ord.patientName}
                      </h3>
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {dc.diagnosticStatuses[ord.status]}
                      </span>
                      {!CLIENT_IMAGING_PORTAL_ENABLED && ord.orderType === 'imaging' && (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          <span>{dg.imagingClosedBadge}</span>
                        </span>
                      )}
                      {ord.priority === 'urgent' && (
                        <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          {dg.priorityUrgent}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-semibold text-[#0c3585] dark:text-[#f4d378]">
                      {ord.requestedTests.join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {ord.targetFacilityName ? `${ord.targetFacilityName} · ` : ''}
                      <span className="font-latin tabular-nums">
                        {dg.orderedAt}: {ord.orderedAt.slice(0, 10)}
                      </span>
                      {ord.resultReceivedAt && (
                        <span className="font-latin tabular-nums">
                          {' '}
                          · {dg.receivedAt}: {ord.resultReceivedAt.slice(0, 10)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void printMedoraDocument(
                        <DiagnosticOrderPrintSheet
                          order={ord}
                          clinicName={workspace.doctorProfile.clinicName}
                          doctorName={workspace.doctorProfile.fullName}
                          lang={language}
                        />,
                        sanitizePdfFilename(`diagnostic-${ord.patientName}-${ord.orderedAt.slice(0, 10)}`),
                      )
                    }
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-[#0c3585] hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-[#f4d378] cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>{dg.printBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={exportingPdfId === ord.orderId}
                    onClick={async () => {
                      setExportingPdfId(ord.orderId);
                      try {
                        await downloadMedoraPdf({
                          filename: sanitizePdfFilename(
                            `diagnostic-${ord.patientName}-${ord.orderedAt.slice(0, 10)}.pdf`,
                          ),
                          element: (
                            <DiagnosticOrderPrintSheet
                              order={ord}
                              clinicName={workspace.doctorProfile.clinicName}
                              doctorName={workspace.doctorProfile.fullName}
                              lang={language}
                            />
                          ),
                          dir: language === 'ar' ? 'rtl' : 'ltr',
                        });
                      } catch (err) {
                        setErrorMsg(err instanceof Error ? err.message : 'PDF Export Failed');
                      } finally {
                        setExportingPdfId(null);
                      }
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    <span>{exportingPdfId === ord.orderId ? dg.exportingPdf : dg.downloadPdfBtn}</span>
                  </button>

                  {canUploadResult &&
                    (CLIENT_IMAGING_PORTAL_ENABLED || ord.orderType !== 'imaging') && (
                    <button
                      type="button"
                      onClick={() => {
                        setResultTarget(ord);
                        setResultStatus(ord.status);
                        setResultSummary(ord.resultSummary || '');
                        setDoctorNotes(ord.doctorNotes || '');
                        setResultFiles(ord.resultFiles || []);
                      }}
                      className="min-h-[36px] rounded-xl border border-[#0c3585] px-3.5 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585] hover:text-white dark:border-[#d9a43b] dark:text-[#f4d378] cursor-pointer"
                    >
                      {dg.recordResultBtn}
                    </button>
                  )}
                </div>
              </div>

              {(ord.resultSummary || ord.doctorNotes || ord.resultFiles.length > 0) && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  {ord.resultSummary && (
                    <p className="text-slate-800 dark:text-slate-200">
                      <strong>{dg.resultSummary}:</strong> {ord.resultSummary}
                    </p>
                  )}
                  {ord.doctorNotes && (
                    <p className="text-slate-600 dark:text-slate-300">
                      <strong>{dg.doctorNotes}:</strong> {ord.doctorNotes}
                    </p>
                  )}
                  {ord.resultFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {ord.resultFiles.map((file, idx) => (
                        <ProtectedMediaButton
                          key={`${file.url}-${idx}`}
                          firebaseUser={firebaseUser}
                          url={file.url}
                          fileName={file.name}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {/* New Order Modal */}
      {showOrderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowOrderModal(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitOrder}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {dg.newOrderBtn}
              </h3>
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOrderType('lab')}
                className={`min-h-[42px] rounded-xl border text-xs font-bold cursor-pointer ${
                  orderType === 'lab'
                    ? 'border-[#0c3585] bg-[#0c3585] text-white'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                {dg.orderTypeLab}
              </button>
              <button
                type="button"
                disabled={!CLIENT_IMAGING_PORTAL_ENABLED}
                aria-disabled={!CLIENT_IMAGING_PORTAL_ENABLED}
                onClick={() => {
                  if (CLIENT_IMAGING_PORTAL_ENABLED) {
                    setOrderType('imaging');
                  }
                }}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-bold ${
                  !CLIENT_IMAGING_PORTAL_ENABLED
                    ? 'cursor-not-allowed border-amber-300 bg-amber-50/80 text-amber-900 opacity-85 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]'
                    : orderType === 'imaging'
                      ? 'cursor-pointer border-[#0c3585] bg-[#0c3585] text-white'
                      : 'cursor-pointer border-slate-300 dark:border-slate-700'
                }`}
              >
                {!CLIENT_IMAGING_PORTAL_ENABLED && (
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {CLIENT_IMAGING_PORTAL_ENABLED
                    ? dg.orderTypeImaging
                    : dg.orderTypeImagingClosed}
                </span>
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold">{dg.selectPatient} *</label>
              <select
                required
                value={patientRecordId}
                onChange={(e) => setPatientRecordId(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">—</option>
                {workspace.patients.map((pt) => (
                  <option key={pt.patientRecordId} value={pt.patientRecordId}>
                    {pt.fullName} ({pt.fileNumber})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold">
                {CLIENT_IMAGING_PORTAL_ENABLED ? dg.facilityName : dg.facilityNameLabOnly}
              </label>
              <input
                type="text"
                value={facilityName}
                onChange={(e) => setFacilityName(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold">{dg.testsLabel} *</label>
              <input
                type="text"
                required
                placeholder={
                  CLIENT_IMAGING_PORTAL_ENABLED
                    ? dg.testsPlaceholder
                    : dg.testsPlaceholderLabOnly
                }
                value={testsText}
                onChange={(e) => setTestsText(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold">{dg.clinicalIndication}</label>
                <input
                  type="text"
                  value={clinicalIndication}
                  onChange={(e) => setClinicalIndication(e.target.value)}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as 'routine' | 'urgent')}
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="routine">{dg.priorityRoutine}</option>
                  <option value="urgent">{dg.priorityUrgent}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOrderModal(false)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {dc.appointments.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingOrder}
                className="medora-gold-button min-h-[40px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingOrder ? '...' : dg.saveOrderBtn}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Result Update Modal */}
      {resultTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setResultTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveResult}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {dg.recordResultBtn} — {resultTarget.patientName}
              </h3>
              <button
                type="button"
                onClick={() => setResultTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold">Status</label>
              <select
                value={resultStatus}
                onChange={(e) => setResultStatus(e.target.value as DiagnosticOrderStatus)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="ordered">{dc.diagnosticStatuses.ordered}</option>
                <option value="in_progress">{dc.diagnosticStatuses.in_progress}</option>
                <option value="results_received">{dc.diagnosticStatuses.results_received}</option>
                <option value="reviewed">{dc.diagnosticStatuses.reviewed}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold">{dg.resultSummary}</label>
              <textarea
                rows={3}
                value={resultSummary}
                onChange={(e) => setResultSummary(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>

            {isDoctor && (
              <div>
                <label className="block text-xs font-semibold">{dg.doctorNotes}</label>
                <textarea
                  rows={2}
                  value={doctorNotes}
                  onChange={(e) => setDoctorNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            )}

            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold hover:border-[#0c3585] dark:border-slate-700">
                <Upload className="h-4 w-4" />
                <span>
                  {uploadingFiles
                    ? '...'
                    : CLIENT_IMAGING_PORTAL_ENABLED
                      ? dg.uploadResultFiles
                      : dg.uploadResultFilesLabOnly}
                </span>
                <input
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  className="sr-only"
                  onChange={(e) => void handleUploadResultFiles(e.target.files)}
                />
              </label>
              {resultFiles.length > 0 && (
                <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                  {resultFiles.map((f) => f.name).join(' · ')}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResultTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-bold dark:border-slate-700 cursor-pointer"
              >
                {dc.appointments.cancelBtn}
              </button>
              <button
                type="submit"
                disabled={savingResult || uploadingFiles}
                className="medora-gold-button min-h-[40px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {savingResult ? '...' : dg.saveResultBtn}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
