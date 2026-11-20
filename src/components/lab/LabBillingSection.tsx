import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Banknote, Download, Plus, Printer, Receipt, X } from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabInvoiceRecord, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { createLabInvoice, recordLabPayment, voidLabInvoice } from '../../services/labService';
import { LabInvoicePrintSheet } from '../shared/MedoraPrintableDocument';
import { downloadMedoraPdf, printMedoraDocument } from '../../utils/printAndPdf';

interface LabBillingSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

export const LabBillingSection: React.FC<LabBillingSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEdit,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [payTarget, setPayTarget] = useState<LabInvoiceRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'card_pos' | 'bank_transfer'>('cash');
  const [payRefNote, setPayRefNote] = useState('');

  const [newInvOpen, setNewInvOpen] = useState(false);
  const [invPatientId, setInvPatientId] = useState('');
  const [invDesc, setInvDesc] = useState('');
  const [invPrice, setInvPrice] = useState('');
  const [invDiscount, setInvDiscount] = useState('0');
  const [invInitialPaid, setInvInitialPaid] = useState('0');

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const totals = useMemo(() => {
    const valid = workspace.invoices.filter((i) => i.status !== 'void');
    const billed = valid.reduce((s, i) => s + i.totalIqd, 0);
    const collected = valid.reduce((s, i) => s + i.paidIqd, 0);
    const balance = valid.reduce((s, i) => s + i.balanceIqd, 0);
    return { billed, collected, balance };
  }, [workspace.invoices]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || saving) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await recordLabPayment(firebaseUser, payTarget.invoiceId, {
        amountIqd: amt,
        method: payMethod,
        referenceNote: payRefNote.trim(),
      });
      setPayTarget(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PAYMENT_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invPatientId || !invDesc.trim() || saving) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await createLabInvoice(firebaseUser, {
        patientRecordId: invPatientId,
        items: [
          {
            description: invDesc.trim(),
            quantity: 1,
            unitPriceIqd: Number(invPrice) || 0,
            totalIqd: Number(invPrice) || 0,
          },
        ],
        discountIqd: Number(invDiscount) || 0,
        initialPaidIqd: Number(invInitialPaid) || 0,
        method: 'cash',
      });
      setNewInvOpen(false);
      setInvDesc('');
      setInvPrice('');
      setInvDiscount('0');
      setInvInitialPaid('0');
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'INVOICE_CREATE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (invoiceId: string) => {
    setSaving(true);
    try {
      await voidLabInvoice(firebaseUser, invoiceId);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'VOID_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintInvoice = async (inv: LabInvoiceRecord, mode: 'print' | 'pdf') => {
    const sheet = <LabInvoicePrintSheet invoice={inv} payments={workspace.payments} lang={lang} />;
    if (mode === 'print') {
      await printMedoraDocument(sheet, `${inv.invoiceNumber}-${inv.patientName}`);
    } else {
      await downloadMedoraPdf({
        filename: `${inv.invoiceNumber}.pdf`,
        element: sheet,
        dir: isAr ? 'rtl' : 'ltr',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.billing.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'إدارة الفواتير المحلية والدفعات النقدية والمصرفية وإصدار الإيصالات الرسمية'
              : 'Manage local invoices, cash/POS/bank payments, receipts & printable billing statements'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setNewInvOpen(true)}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{lt.billing.newInvoice}</span>
          </button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'إجمالي الفواتير المعتمدة' : 'Total Billed'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-slate-900 dark:text-white">
            {totals.billed.toLocaleString()} {lt.common.iqd}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'المبالغ المحصلة' : 'Collected'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {totals.collected.toLocaleString()} {lt.common.iqd}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4">
          <div className="text-xs text-slate-500">{isAr ? 'الذمم المتبقية' : 'Outstanding'}</div>
          <div className="mt-1 font-latin tabular-nums text-xl font-bold text-amber-600 dark:text-amber-400">
            {totals.balance.toLocaleString()} {lt.common.iqd}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-1">
        <button
          type="button"
          onClick={() => setTab('invoices')}
          className={`min-h-[38px] rounded-lg px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
            tab === 'invoices' ? 'bg-[#0c3585] text-white' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Receipt className="h-3.5 w-3.5" />
          <span>
            {lt.billing.invoicesTab} ({workspace.invoices.length})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('payments')}
          className={`min-h-[38px] rounded-lg px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer ${
            tab === 'payments' ? 'bg-[#0c3585] text-white' : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          <Banknote className="h-3.5 w-3.5" />
          <span>
            {lt.billing.paymentsTab} ({workspace.payments.length})
          </span>
        </button>
      </div>

      {tab === 'invoices' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {workspace.invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{lt.billing.invoiceNumber}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المريض' : 'Patient'}</th>
                  <th className="px-4 py-3 text-start">{lt.billing.totalIqd}</th>
                  <th className="px-4 py-3 text-start">{lt.billing.paidIqd}</th>
                  <th className="px-4 py-3 text-start">{lt.billing.balanceIqd}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.invoices.map((inv) => (
                  <tr key={inv.invoiceId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                        {inv.invoiceNumber}
                      </div>
                      {inv.orderNumber && (
                        <div className="text-[11px] font-latin text-slate-400">{inv.orderNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{inv.patientName}</td>
                    <td className="px-4 py-3 font-latin tabular-nums font-bold">
                      {inv.totalIqd.toLocaleString()} {lt.common.iqd}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                      {inv.paidIqd.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums text-amber-700 dark:text-amber-300 font-bold">
                      {inv.balanceIqd.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          inv.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : inv.status === 'void'
                              ? 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {lt.status[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex items-center gap-1.5">
                        {canEdit && inv.balanceIqd > 0 && inv.status !== 'void' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayTarget(inv);
                              setPayAmount(String(inv.balanceIqd));
                              setPayMethod('cash');
                              setPayRefNote('');
                            }}
                            className="min-h-[34px] rounded-lg bg-[#0c3585] px-2.5 text-[11px] font-bold text-white cursor-pointer"
                          >
                            {lt.billing.recordPayment}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void handlePrintInvoice(inv, 'print')}
                          className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-semibold cursor-pointer"
                          title={lt.common.print}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePrintInvoice(inv, 'pdf')}
                          className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-semibold cursor-pointer"
                          title={lt.common.downloadPdf}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && inv.status !== 'void' && inv.paidIqd === 0 && (
                          <button
                            type="button"
                            onClick={() => void handleVoid(inv.invoiceId)}
                            className="min-h-[34px] rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 text-[11px] font-semibold text-rose-600 cursor-pointer"
                          >
                            {lt.billing.voidInvoice}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {workspace.payments.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{lt.billing.receiptNumber}</th>
                  <th className="px-4 py-3 text-start">{lt.billing.invoiceNumber}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المريض' : 'Patient'}</th>
                  <th className="px-4 py-3 text-start">{lt.billing.method}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المبلغ' : 'Amount'}</th>
                  <th className="px-4 py-3 text-start">{lt.common.date}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.payments.map((p) => (
                  <tr key={p.paymentId}>
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                      {p.receiptNumber}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums text-slate-600 dark:text-slate-300">
                      {p.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{p.patientName}</td>
                    <td className="px-4 py-3">{lt.paymentMethods[p.method] || p.method}</td>
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                      {p.amountIqd.toLocaleString()} {lt.common.iqd}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums text-slate-500">
                      {String(p.paidAt || '').slice(0, 16).replace('T', ' ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {lt.billing.recordPayment} — {payTarget.invoiceNumber}
              </h3>
              <button type="button" onClick={() => setPayTarget(null)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{isAr ? 'المبلغ المدفوع (د.ع)' : 'Amount (IQD)'} *</label>
              <input
                type="number"
                required
                min={1}
                max={payTarget.balanceIqd}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin font-bold"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{lt.billing.method}</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as 'cash' | 'card_pos' | 'bank_transfer')}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              >
                <option value="cash">{lt.paymentMethods.cash}</option>
                <option value="card_pos">{lt.paymentMethods.card_pos}</option>
                <option value="bank_transfer">{lt.paymentMethods.bank_transfer}</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">{lt.billing.referenceNote}</label>
              <input
                value={payRefNote}
                onChange={(e) => setPayRefNote(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayTarget(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer"
              >
                {saving ? lt.common.saving : lt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Standalone Invoice Modal */}
      {newInvOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleCreateInvoice}
            className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-3 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.billing.newInvoice}</h3>
              <button type="button" onClick={() => setNewInvOpen(false)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="block font-semibold mb-1">{lt.ordersSamples.selectPatient} *</label>
              <select
                required
                value={invPatientId}
                onChange={(e) => setInvPatientId(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              >
                <option value="">--</option>
                {workspace.patients.map((p) => (
                  <option key={p.patientRecordId} value={p.patientRecordId}>
                    {p.fileNumber} — {p.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">{isAr ? 'وصف البند / الفحص' : 'Item Description'} *</label>
              <input
                required
                value={invDesc}
                onChange={(e) => setInvDesc(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              />
            </div>
            <div className="grid gap-3 grid-cols-3">
              <div>
                <label className="block font-semibold mb-1">{lt.common.price}</label>
                <input
                  type="number"
                  required
                  min={0}
                  value={invPrice}
                  onChange={(e) => setInvPrice(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 font-latin"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.ordersSamples.discountIqd}</label>
                <input
                  type="number"
                  min={0}
                  value={invDiscount}
                  onChange={(e) => setInvDiscount(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 font-latin"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.billing.paidIqd}</label>
                <input
                  type="number"
                  min={0}
                  value={invInitialPaid}
                  onChange={(e) => setInvInitialPaid(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 font-latin"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewInvOpen(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button type="submit" disabled={saving} className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer">
                {saving ? lt.common.saving : lt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
