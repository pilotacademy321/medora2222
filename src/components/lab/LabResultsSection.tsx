import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Download,
  FileUp,
  History,
  Lock,
  Plus,
  Printer,
  Send,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type { Language, UploadedDocMeta } from '../../types/medora';
import type {
  LabAnalyteFlag,
  LabResultAnalyte,
  LabResultRecord,
  LabWorkspaceData,
} from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import {
  approveLabResult,
  correctLabResult,
  publishLabResult,
  saveLabResult,
  uploadLabPrivateFile,
} from '../../services/labService';
import { ProtectedMediaButton } from '../shared/ProtectedMedia';
import { LabResultReportPrintSheet } from '../shared/MedoraPrintableDocument';
import { downloadMedoraPdf, printMedoraDocument } from '../../utils/printAndPdf';

interface LabResultsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEnter: boolean;
  canApprove: boolean;
  initialOrderId?: string | null;
  onRefresh: () => Promise<void>;
}

function suggestFlagFromCatalog(
  valueStr: string,
  refMin?: number | null,
  refMax?: number | null,
): LabAnalyteFlag {
  const num = Number(valueStr.trim());
  if (!Number.isFinite(num) || valueStr.trim() === '') return 'normal';
  if (typeof refMin === 'number' && num < refMin) return 'low';
  if (typeof refMax === 'number' && num > refMax) return 'high';
  return 'normal';
}

export const LabResultsSection: React.FC<LabResultsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEnter,
  canApprove,
  initialOrderId,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId || '');
  const [analytes, setAnalytes] = useState<LabResultAnalyte[]>([]);
  const [summaryNote, setSummaryNote] = useState('');
  const [attachments, setAttachments] = useState<UploadedDocMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Approved Result Documented Correction Modal
  const [correctModalOpen, setCorrectModalOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [showRevisions, setShowRevisions] = useState(false);

  useEffect(() => {
    if (initialOrderId) {
      setSelectedOrderId(initialOrderId);
    } else if (!selectedOrderId && workspace.orders.length > 0) {
      setSelectedOrderId(workspace.orders[0].orderId);
    }
  }, [initialOrderId, workspace.orders, selectedOrderId]);

  const currentOrder = useMemo(
    () => workspace.orders.find((o) => o.orderId === selectedOrderId) || null,
    [workspace.orders, selectedOrderId],
  );

  const currentResult: LabResultRecord | null = useMemo(
    () => workspace.results.find((r) => r.orderId === selectedOrderId) || null,
    [workspace.results, selectedOrderId],
  );

  const isLockedApproved =
    currentResult?.status === 'approved' || currentResult?.status === 'corrected';

  useEffect(() => {
    setErrorMsg('');
    setStatusMsg('');
    setShowRevisions(false);
    if (currentResult) {
      setAnalytes(currentResult.analytes || []);
      setSummaryNote(currentResult.summaryNote || '');
      setAttachments(currentResult.attachments || []);
    } else if (currentOrder) {
      setAnalytes(
        currentOrder.tests.map((t) => ({
          testId: t.testId,
          testName: isAr ? t.nameAr : t.nameEn || t.nameAr,
          value: '',
          unit: t.unit || '',
          referenceRange: t.referenceRangeText || '',
          flag: 'normal',
          comment: '',
        })),
      );
      setSummaryNote('');
      setAttachments([]);
    } else {
      setAnalytes([]);
      setSummaryNote('');
      setAttachments([]);
    }
  }, [currentResult, currentOrder, isAr]);

  const updateAnalyteRow = (idx: number, patch: Partial<LabResultAnalyte>) => {
    setAnalytes((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        if (patch.value !== undefined && row.testId) {
          const catTest = workspace.tests.find((t) => t.testId === row.testId);
          if (catTest) {
            next.flag = suggestFlagFromCatalog(patch.value, catTest.referenceMin, catTest.referenceMax);
          }
        }
        return next;
      }),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const uploaded = await uploadLabPrivateFile(firebaseUser, 'lab_results', file, {
        ...(currentOrder?.linkedPatientUid ? { labPatientUid: currentOrder.linkedPatientUid } : {}),
      });
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'UPLOAD_FAILED');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSaveEntry = async (submitForApproval: boolean) => {
    if (!currentOrder || saving) return;
    setErrorMsg('');
    setStatusMsg('');
    setSaving(true);
    try {
      await saveLabResult(firebaseUser, {
        orderId: currentOrder.orderId,
        submitForApproval,
        analytes: analytes.filter((a) => a.testName.trim()),
        summaryNote: summaryNote.trim(),
        attachments,
      });
      setStatusMsg(
        submitForApproval
          ? isAr
            ? 'تم حفظ النتيجة وإرسالها للمراجعة والاعتماد.'
            : 'Saved and submitted for approval.'
          : isAr
            ? 'تم حفظ المسودة.'
            : 'Draft saved.',
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'RESULT_SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (publish: boolean) => {
    if (!currentResult || saving) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await approveLabResult(firebaseUser, currentResult.resultId, publish);
      setStatusMsg(
        publish
          ? isAr
            ? 'تم اعتماد النتيجة ونشرها في بوابة المريض.'
            : 'Result approved and published to patient.'
          : isAr
            ? 'تم اعتماد النتيجة.'
            : 'Result approved.',
      );
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'APPROVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!currentResult || saving) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await publishLabResult(firebaseUser, currentResult.resultId);
      setStatusMsg(isAr ? 'تم نشر النتيجة في بوابة المريض.' : 'Published to patient.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PUBLISH_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentedCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentResult || correctionReason.trim().length < 3 || saving) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await correctLabResult(firebaseUser, currentResult.resultId, {
        correctionReason: correctionReason.trim(),
        analytes: analytes.filter((a) => a.testName.trim()),
        summaryNote: summaryNote.trim(),
        attachments,
      });
      setCorrectModalOpen(false);
      setCorrectionReason('');
      setStatusMsg(isAr ? 'تم تسجيل التعديل الموثق بنجاح.' : 'Documented revision recorded.');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'CORRECTION_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintOrPdf = async (mode: 'print' | 'pdf') => {
    if (!currentResult) return;
    const sheet = <LabResultReportPrintSheet result={currentResult} lang={lang} />;
    if (mode === 'print') {
      await printMedoraDocument(sheet, `${currentResult.reportNumber}-${currentResult.patientName}`);
    } else {
      await downloadMedoraPdf({
        filename: `${currentResult.reportNumber}.pdf`,
        element: sheet,
        dir: isAr ? 'rtl' : 'ltr',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.results.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'إدخال النتائج يدوياً أو عبر مرفقات PDF/صور ثم المراجعة والاعتماد والطباعة'
              : 'Enter manual analytes or PDF/image files, approve, publish to patient & print reports'}
          </p>
        </div>

        {currentResult && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePrintOrPdf('print')}
              className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>{lt.common.print}</span>
            </button>
            <button
              type="button"
              onClick={() => void handlePrintOrPdf('pdf')}
              className="medora-gold-button min-h-[40px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{lt.common.downloadPdf}</span>
            </button>
          </div>
        )}
      </div>

      {/* Order Selector + Existing Results Queue */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {lt.results.selectOrder}
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs text-slate-900 dark:text-white"
            >
              <option value="">-- {lt.results.selectOrder} --</option>
              {workspace.orders.map((o) => (
                <option key={o.orderId} value={o.orderId}>
                  {o.orderNumber} — {o.patientName} ({lt.status[o.status] || o.status})
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              {isAr ? 'قائمة التقارير المسجلة' : 'Results Queue'} ({workspace.results.length})
            </div>
            <div className="max-h-96 overflow-y-auto space-y-1.5">
              {workspace.results.map((r) => (
                <button
                  key={r.resultId}
                  type="button"
                  onClick={() => setSelectedOrderId(r.orderId)}
                  className={`w-full rounded-xl border px-3 py-2 text-start text-xs transition cursor-pointer ${
                    r.orderId === selectedOrderId
                      ? 'border-[#0c3585] bg-blue-50/70 dark:bg-blue-950/30'
                      : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                      {r.reportNumber}
                    </span>
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-bold">
                      {lt.status[r.status] || r.status}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-900 dark:text-white truncate">{r.patientName}</div>
                  <div className="text-[11px] text-slate-500 font-latin tabular-nums">
                    {r.orderNumber} {r.publishedToPatient ? '· ✓ Patient' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result Workbench */}
        <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-4">
          {!currentOrder ? (
            <div className="p-10 text-center text-sm text-slate-500">{lt.results.selectOrder}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <div className="font-latin tabular-nums text-xs font-bold text-[#0c3585] dark:text-blue-400">
                    {currentOrder.orderNumber}
                    {currentResult ? ` · ${currentResult.reportNumber}` : ''}
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {currentOrder.patientName}
                  </h3>
                </div>
                {currentResult && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 font-bold text-slate-800 dark:text-slate-200">
                      {lt.status[currentResult.status] || currentResult.status}
                    </span>
                    {currentResult.publishedToPatient && (
                      <span className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
                        ✓ {isAr ? 'منشورة للمريض' : 'Published'}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isLockedApproved && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-300">
                  <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{lt.results.immutableNotice}</p>
                    {currentResult && currentResult.revisionCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowRevisions((v) => !v)}
                        className="mt-1 inline-flex items-center gap-1 font-bold text-[#0c3585] dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        <History className="h-3.5 w-3.5" />
                        <span>
                          {lt.results.revisionHistory} ({currentResult.revisionCount})
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {showRevisions && currentResult && currentResult.revisionHistory.length > 0 && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-2 text-xs">
                  {currentResult.revisionHistory.map((rev) => (
                    <div key={rev.revisionNumber} className="border-b border-slate-200/70 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                        <span>
                          #{rev.revisionNumber} — {rev.editedByName}
                        </span>
                        <span className="font-latin tabular-nums text-slate-500">
                          {rev.editedAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <p className="text-amber-800 dark:text-amber-300 mt-0.5">{rev.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {errorMsg && (
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {errorMsg}
                </div>
              )}
              {statusMsg && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {statusMsg}
                </div>
              )}

              {/* Analytes Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{lt.results.analytes}</span>
                  {(canEnter || canApprove) && (!isLockedApproved || correctModalOpen) && (
                    <button
                      type="button"
                      onClick={() =>
                        setAnalytes((prev) => [
                          ...prev,
                          { testName: '', value: '', unit: '', referenceRange: '', flag: 'normal', comment: '' },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0c3585] dark:text-blue-400 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{lt.results.addAnalyte}</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-start text-xs">
                    <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-2.5 py-2 text-start">{lt.results.testName}</th>
                        <th className="px-2.5 py-2 text-start">{lt.results.value}</th>
                        <th className="px-2.5 py-2 text-start">{lt.results.unit}</th>
                        <th className="px-2.5 py-2 text-start">{lt.results.refRange}</th>
                        <th className="px-2.5 py-2 text-start">{lt.results.flag}</th>
                        <th className="px-2.5 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {analytes.map((row, idx) => {
                        const editable = (canEnter || canApprove) && (!isLockedApproved || canApprove);
                        return (
                          <tr key={idx}>
                            <td className="p-2">
                              <input
                                disabled={!editable}
                                value={row.testName}
                                onChange={(e) => updateAnalyteRow(idx, { testName: e.target.value })}
                                className="min-h-[36px] w-full min-w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                disabled={!editable}
                                value={row.value}
                                onChange={(e) => updateAnalyteRow(idx, { value: e.target.value })}
                                className="min-h-[36px] w-24 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-latin font-bold"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                disabled={!editable}
                                value={row.unit}
                                onChange={(e) => updateAnalyteRow(idx, { unit: e.target.value })}
                                className="min-h-[36px] w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-latin"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                disabled={!editable}
                                value={row.referenceRange}
                                onChange={(e) => updateAnalyteRow(idx, { referenceRange: e.target.value })}
                                className="min-h-[36px] w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 font-latin"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                disabled={!editable}
                                value={row.flag}
                                onChange={(e) => updateAnalyteRow(idx, { flag: e.target.value as LabAnalyteFlag })}
                                className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2"
                              >
                                <option value="normal">{lt.flags.normal}</option>
                                <option value="high">{lt.flags.high}</option>
                                <option value="low">{lt.flags.low}</option>
                                <option value="critical">{lt.flags.critical}</option>
                                <option value="abnormal">{lt.flags.abnormal}</option>
                              </select>
                            </td>
                            <td className="p-2">
                              {editable && (
                                <button
                                  type="button"
                                  onClick={() => setAnalytes((prev) => prev.filter((_, i) => i !== idx))}
                                  className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Summary Note & PDF/Image Attachments */}
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {lt.results.summaryNote}
                  </label>
                  <textarea
                    rows={3}
                    disabled={isLockedApproved && !canApprove}
                    value={summaryNote}
                    onChange={(e) => setSummaryNote(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">{lt.results.attachments}</label>
                  {(canEnter || canApprove) && !isLockedApproved && (
                    <label className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3.5 text-xs font-semibold text-[#0c3585] dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                      <FileUp className="h-4 w-4" />
                      <span>{uploading ? lt.common.saving : lt.results.uploadFile}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                  <div className="space-y-1.5">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <ProtectedMediaButton firebaseUser={firebaseUser} url={att.url} fileName={att.name} />
                        {!isLockedApproved && (canEnter || canApprove) && (
                          <button
                            type="button"
                            onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                            className="text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                {!isLockedApproved && (canEnter || canApprove) && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveEntry(false)}
                      className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 text-xs font-semibold cursor-pointer"
                    >
                      {lt.results.saveDraft}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveEntry(true)}
                      className="min-h-[40px] rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white cursor-pointer"
                    >
                      <Send className="inline h-3.5 w-3.5 me-1.5" />
                      {lt.results.submitApproval}
                    </button>
                  </>
                )}

                {canApprove && currentResult && !isLockedApproved && (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleApprove(false)}
                      className="min-h-[40px] rounded-xl border border-emerald-300 dark:border-emerald-700 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer"
                    >
                      <CheckCircle2 className="inline h-3.5 w-3.5 me-1" />
                      {lt.results.approveOnly}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleApprove(true)}
                      className="medora-gold-button min-h-[40px] rounded-xl px-4 text-xs font-bold cursor-pointer"
                    >
                      {lt.results.approvePublish}
                    </button>
                  </>
                )}

                {canApprove && isLockedApproved && currentResult && !currentResult.publishedToPatient && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handlePublish()}
                    className="medora-gold-button min-h-[40px] rounded-xl px-4 text-xs font-bold cursor-pointer"
                  >
                    {lt.results.publishToPatient}
                  </button>
                )}

                {canApprove && isLockedApproved && currentResult && (
                  <button
                    type="button"
                    onClick={() => setCorrectModalOpen(true)}
                    className="min-h-[40px] rounded-xl border border-amber-300 dark:border-amber-700 px-4 text-xs font-bold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>{lt.results.correctApproved}</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Documented Correction Modal */}
      {correctModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleDocumentedCorrection}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-3 text-xs"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.results.correctApproved}</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {isAr
                ? 'سيتم حفظ النسخة الحالية من التحاليل والملخص في سجل المراجعات وتوثيق سبب التصحيح.'
                : 'Current analytes & notes will be archived in the revision log along with your documented reason.'}
            </p>
            <div>
              <label className="block font-semibold mb-1">{lt.results.correctionReason} *</label>
              <textarea
                required
                rows={3}
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectModalOpen(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving || correctionReason.trim().length < 3}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer"
              >
                {lt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
