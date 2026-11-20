import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Edit3,
  FileDown,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { Language } from '../../types/medora';
import type {
  MedoraOperationalError,
  MedoraPaymentStatus,
  MedoraReceiptRecord,
  MedoraTransactionType,
} from '../../types/commerce';
import {
  amendAdminReceipt,
  fetchAdminCommerceOverview,
  recordReceiptReprint,
  resolveAdminOperationalError,
  voidAdminReceipt,
  type AdminCommerceOverviewData,
} from '../../services/commerceService';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import { UnifiedReceiptPrintSheet } from '../shared/MedoraPrintableDocument';

interface AdminCommerceAndReceiptsSectionProps {
  firebaseUser: User;
  language: Language;
}

type CommerceSubTab = 'receipts' | 'orders' | 'errors';

interface NormalizedAdminOrderRow {
  orderId: string;
  orderNumber: string;
  flow: MedoraTransactionType;
  sellerName: string;
  buyerName: string;
  status: string;
  paymentMethod: string;
  totalIqd: number;
  itemsCount: number;
  receiptIssued: boolean;
  receiptNumber?: string;
  createdAt: string;
}

export const AdminCommerceAndReceiptsSection: React.FC<AdminCommerceAndReceiptsSectionProps> = ({
  firebaseUser,
  language,
}) => {
  const isAr = language === 'ar';
  const [subTab, setSubTab] = useState<CommerceSubTab>('receipts');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [data, setData] = useState<AdminCommerceOverviewData | null>(null);

  const [flowFilter, setFlowFilter] = useState<MedoraTransactionType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQ, setSearchQ] = useState('');

  // Receipt Action Modals
  const [voidTarget, setVoidTarget] = useState<MedoraReceiptRecord | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [amendTarget, setAmendTarget] = useState<MedoraReceiptRecord | null>(null);
  const [amendReason, setAmendReason] = useState('');
  const [amendPaymentStatus, setAmendPaymentStatus] = useState<MedoraPaymentStatus>('paid');
  const [amendNotes, setAmendNotes] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const overview = await fetchAdminCommerceOverview(firebaseUser);
      setData(overview);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'COMMERCE_OVERVIEW_FAILED');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const normalizedOrders = useMemo<NormalizedAdminOrderRow[]>(() => {
    if (!data) return [];
    const list: NormalizedAdminOrderRow[] = [];

    for (const wo of data.wholesalerSupplyOrders || []) {
      list.push({
        orderId: wo.orderId,
        orderNumber: wo.orderNumber,
        flow: 'wholesaler_to_pharmacy',
        sellerName: wo.wholesalerName,
        buyerName: wo.pharmacyName,
        status: wo.status,
        paymentMethod: wo.paymentMethod,
        totalIqd: wo.totalIqd,
        itemsCount: wo.items?.length || 0,
        receiptIssued: Boolean(wo.receiptIssued || wo.receiptId),
        receiptNumber: wo.receiptNumber,
        createdAt: String(wo.createdAt || ''),
      });
    }

    for (const pdo of data.pharmacyDoctorOrders || []) {
      list.push({
        orderId: pdo.orderId,
        orderNumber: pdo.orderNumber,
        flow: 'pharmacy_to_doctor',
        sellerName: pdo.pharmacyName,
        buyerName: pdo.doctorName,
        status: pdo.status,
        paymentMethod: pdo.paymentMethod,
        totalIqd: pdo.totalIqd,
        itemsCount: pdo.items?.length || 0,
        receiptIssued: Boolean(pdo.receiptIssued || pdo.receiptId),
        receiptNumber: pdo.receiptNumber,
        createdAt: String(pdo.createdAt || ''),
      });
    }

    for (const po of data.pharmacyOrders || []) {
      list.push({
        orderId: po.orderId,
        orderNumber: po.orderNumber,
        flow: 'pharmacy_to_patient',
        sellerName: po.pharmacyName,
        buyerName: po.patientName,
        status: po.status,
        paymentMethod: po.paymentMethod,
        totalIqd: po.totalIqd,
        itemsCount: po.items?.length || 0,
        receiptIssued: Boolean(po.receiptIssued || po.receiptId),
        receiptNumber: po.receiptNumber,
        createdAt: String(po.createdAt || ''),
      });
    }

    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data]);

  const filteredReceipts = useMemo(() => {
    const list = data?.receipts || [];
    const q = searchQ.trim().toLowerCase();
    return list.filter((r) => {
      if (flowFilter !== 'all' && r.transactionType !== flowFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [
        r.receiptNumber,
        r.orderNumber,
        r.sellerName,
        r.buyerName,
        r.transactionType,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data?.receipts, flowFilter, statusFilter, searchQ]);

  const filteredOrders = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return normalizedOrders.filter((o) => {
      if (flowFilter !== 'all' && o.flow !== flowFilter) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      return [o.orderNumber, o.sellerName, o.buyerName, o.receiptNumber || '', o.status]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [normalizedOrders, flowFilter, statusFilter, searchQ]);

  const operationalErrors = useMemo<MedoraOperationalError[]>(
    () => data?.operationalErrors || [],
    [data?.operationalErrors],
  );
  const openErrorsCount = operationalErrors.filter((e) => !e.resolved).length;

  const flowLabel = (flow: MedoraTransactionType) => {
    if (flow === 'wholesaler_to_pharmacy') {
      return isAr ? 'مذخر ← صيدلية' : 'Wholesaler → Pharmacy';
    }
    if (flow === 'pharmacy_to_doctor') {
      return isAr ? 'صيدلية ← طبيب' : 'Pharmacy → Doctor';
    }
    return isAr ? 'صيدلية ← مراجع' : 'Pharmacy → Patient';
  };

  const handlePrintReceipt = (receipt: MedoraReceiptRecord) => {
    void printMedoraDocument(
      <UnifiedReceiptPrintSheet receipt={receipt} lang={language} />,
      receipt.receiptNumber,
      {
        onPrintAction: async () => {
          await recordReceiptReprint(firebaseUser, receipt.receiptId).catch(() => null);
          await loadData();
        },
      },
    );
  };

  const handleDownloadPdf = (receipt: MedoraReceiptRecord) => {
    void downloadMedoraPdf({
      filename: sanitizePdfFilename(`MEDORA_Receipt_${receipt.receiptNumber}`),
      element: <UnifiedReceiptPrintSheet receipt={receipt} lang={language} />,
      dir: isAr ? 'rtl' : 'ltr',
    });
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget || !voidReason.trim()) return;
    setActionBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await voidAdminReceipt(firebaseUser, voidTarget.receiptId, voidReason.trim());
      setNoticeMsg(
        isAr
          ? `تم إبطال الإيصال ${voidTarget.receiptNumber} وتوثيق السبب لدى جميع الأطراف.`
          : `Receipt ${voidTarget.receiptNumber} voided and logged across all parties.`,
      );
      setVoidTarget(null);
      setVoidReason('');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'VOID_FAILED');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendTarget || !amendReason.trim()) return;
    setActionBusy(true);
    setErrorMsg(null);
    setNoticeMsg(null);
    try {
      await amendAdminReceipt(firebaseUser, amendTarget.receiptId, {
        reason: amendReason.trim(),
        paymentStatus: amendPaymentStatus,
        notes: amendNotes.trim() || undefined,
      });
      setNoticeMsg(
        isAr
          ? `تم تعديل الإيصال ${amendTarget.receiptNumber} وتحديث الأطراف المرتبطة.`
          : `Receipt ${amendTarget.receiptNumber} amended and synced.`,
      );
      setAmendTarget(null);
      setAmendReason('');
      setAmendNotes('');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AMEND_FAILED');
    } finally {
      setActionBusy(false);
    }
  };

  const handleResolveError = async (errorId: string) => {
    setActionBusy(true);
    setErrorMsg(null);
    try {
      await resolveAdminOperationalError(firebaseUser, errorId);
      setNoticeMsg(isAr ? 'تم تعليم الخطأ التشغيلي كمحلول.' : 'Operational error marked resolved.');
      await loadData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'RESOLVE_FAILED');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'الإيصالات الثلاثية المصدرة' : '3-Party Receipts Issued'}
          </p>
          <p className="mt-1 font-latin text-2xl font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
            {data?.receipts.length || 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'إجمالي الطلبات التجارية (3 مسارات)' : 'Total Commerce Orders (3 Flows)'}
          </p>
          <p className="mt-1 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {normalizedOrders.length}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'أحداث التدقيق والطباعة' : 'Receipt Audit Events'}
          </p>
          <p className="mt-1 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {data?.receiptEvents.length || 0}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isAr ? 'تنبيهات أخطاء تشغيلية مفتوحة' : 'Open Operational Errors'}
          </p>
          <p
            className={`mt-1 font-latin text-2xl font-bold tabular-nums ${
              openErrorsCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {openErrorsCount}
          </p>
        </div>
      </div>

      {/* Sub-Tabs & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setSubTab('receipts');
              setStatusFilter('all');
            }}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              subTab === 'receipts'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Receipt className="h-3.5 w-3.5" />
            <span>{isAr ? 'سجل الإيصالات الموحدة' : '3-Party Receipts Ledger'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubTab('orders');
              setStatusFilter('all');
            }}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              subTab === 'orders'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>{isAr ? 'متابعة كافة الطلبات (3 مسارات)' : 'All Commerce Orders'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('errors')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              subTab === 'errors'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{isAr ? 'الأخطاء التشغيلية' : 'Operational Errors'}</span>
            {openErrorsCount > 0 && (
              <span className="font-latin rounded bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">
                {openErrorsCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer hover:border-[#0c3585]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
          {errorMsg}
        </div>
      )}
      {noticeMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          {noticeMsg}
        </div>
      )}

      {/* Search & Filter Row */}
      {subTab !== 'errors' && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={
                isAr
                  ? 'بحث برقم الإيصال أو الطلب أو اسم البائع أو المشتري...'
                  : 'Search receipt #, order #, seller or buyer...'
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-3 text-xs dark:border-slate-700 dark:bg-[#07122a] dark:text-white"
            />
          </div>

          <select
            value={flowFilter}
            onChange={(e) => setFlowFilter(e.target.value as MedoraTransactionType | 'all')}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#07122a] dark:text-white"
          >
            <option value="all">{isAr ? 'كافة المسارات التجارية' : 'All Commerce Flows'}</option>
            <option value="wholesaler_to_pharmacy">
              {isAr ? 'مذخر ← صيدلية' : 'Wholesaler → Pharmacy'}
            </option>
            <option value="pharmacy_to_doctor">
              {isAr ? 'صيدلية ← طبيب' : 'Pharmacy → Doctor'}
            </option>
            <option value="pharmacy_to_patient">
              {isAr ? 'صيدلية ← مراجع' : 'Pharmacy → Patient'}
            </option>
          </select>

          {subTab === 'receipts' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#07122a] dark:text-white"
            >
              <option value="all">{isAr ? 'كافة الحالات' : 'All Statuses'}</option>
              <option value="active">{isAr ? 'معتمد (Active)' : 'Active'}</option>
              <option value="amended">{isAr ? 'معدّل (Amended)' : 'Amended'}</option>
              <option value="voided">{isAr ? 'مُبطل (Voided)' : 'Voided'}</option>
            </select>
          )}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#0c3585]" />
          {isAr ? 'جاري تحميل السجل التجاري والإيصالات...' : 'Loading unified commerce & receipts ledger...'}
        </div>
      ) : null}

      {/* TAB 1: RECEIPTS LEDGER */}
      {subTab === 'receipts' && data && (
        filteredReceipts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
            {isAr ? 'لا توجد إيصالات مطابقة.' : 'No matching receipts found.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredReceipts.map((rcpt) => {
              const badgeClass =
                rcpt.status === 'voided'
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : rcpt.status === 'amended'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300';

              return (
                <div
                  key={rcpt.receiptId}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-latin text-xs font-extrabold text-[#0c3585] dark:text-[#f4d378]">
                            {rcpt.receiptNumber}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {flowLabel(rcpt.transactionType)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          {isAr ? 'الطلب:' : 'Order:'} {rcpt.orderNumber} ·{' '}
                          {String(rcpt.issuedAt || '').slice(0, 16).replace('T', ' ')}
                        </p>
                      </div>

                      <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${badgeClass}`}>
                        {rcpt.status === 'voided'
                          ? isAr
                            ? 'مُبطل'
                            : 'Voided'
                          : rcpt.status === 'amended'
                            ? isAr
                              ? 'معدّل'
                              : 'Amended'
                            : isAr
                              ? 'معتمد'
                              : 'Active'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-900/60">
                      <div>
                        <span className="text-slate-500">{isAr ? 'البائع:' : 'Seller:'}</span>
                        <p className="font-bold text-slate-900 dark:text-white truncate">{rcpt.sellerName}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">{isAr ? 'المشتري:' : 'Buyer:'}</span>
                        <p className="font-bold text-slate-900 dark:text-white truncate">{rcpt.buyerName}</p>
                      </div>
                      <div>
                        <span className="text-slate-500">{isAr ? 'طريقة الدفع:' : 'Payment:'}</span>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          {rcpt.paymentMethod} ({rcpt.paymentStatus})
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500">{isAr ? 'الأصناف / الطباعات:' : 'Items / Prints:'}</span>
                        <p className="font-latin font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {rcpt.items.length} · #{rcpt.reprintCount || 0}
                        </p>
                      </div>
                    </div>

                    {rcpt.voidReason && (
                      <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                        {isAr ? 'سبب الإبطال:' : 'Void Reason:'} {rcpt.voidReason}
                      </p>
                    )}
                    {rcpt.amendmentNote && (
                      <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        {isAr ? 'ملاحظة التعديل:' : 'Amendment Note:'} {rcpt.amendmentNote}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span className="font-latin text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {rcpt.totalAmountIqd.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                    </span>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handlePrintReceipt(rcpt)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0c3585] px-3 text-[11px] font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>{isAr ? 'طباعة A4 & حراري' : 'Print'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(rcpt)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        <span>PDF</span>
                      </button>

                      {rcpt.status !== 'voided' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setAmendTarget(rcpt);
                              setAmendPaymentStatus(rcpt.paymentStatus);
                              setAmendNotes(rcpt.notes || '');
                              setAmendReason('');
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300 cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>{isAr ? 'تعديل' : 'Amend'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setVoidTarget(rcpt);
                              setVoidReason('');
                            }}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer"
                          >
                            <Ban className="h-3 w-3" />
                            <span>{isAr ? 'إبطال' : 'Void'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* TAB 2: ALL ORDERS ACROSS 3 FLOWS */}
      {subTab === 'orders' && data && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
          <table className="w-full min-w-[780px] text-start text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'رقم الطلب' : 'Order #'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'المسار' : 'Flow'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'البائع' : 'Seller'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'المشتري' : 'Buyer'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'الإجمالي' : 'Total'}</th>
                <th className="px-4 py-3 font-bold text-start">{isAr ? 'الإيصال' : 'Receipt'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {isAr ? 'لا توجد طلبات مطابقة.' : 'No orders match current filters.'}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => (
                  <tr key={`${ord.flow}_${ord.orderId}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30">
                    <td className="px-4 py-3 font-latin font-bold text-[#0c3585] dark:text-[#f4d378]">
                      {ord.orderNumber}
                      <div className="text-[10px] font-normal text-slate-400">
                        {ord.createdAt.slice(0, 16).replace('T', ' ')}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">
                      {flowLabel(ord.flow)}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{ord.sellerName}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{ord.buyerName}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {ord.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                      {Number(ord.totalIqd || 0).toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                    </td>
                    <td className="px-4 py-3 font-latin text-[11px]">
                      {ord.receiptNumber ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                          {ord.receiptNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: OPERATIONAL ERRORS */}
      {subTab === 'errors' && data && (
        <div className="space-y-3">
          {operationalErrors.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
              {isAr ? 'لا توجد أخطاء تشغيلية مسجلة حالياً.' : 'No operational errors recorded.'}
            </div>
          ) : (
            operationalErrors.map((errItem) => (
              <div
                key={errItem.errorId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 font-latin text-[10.5px] font-bold uppercase ${
                        errItem.severity === 'critical'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                          : errItem.severity === 'error'
                            ? 'bg-orange-100 text-orange-800 dark:bg-orange-500/20 dark:text-orange-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                      }`}
                    >
                      {errItem.severity}
                    </span>
                    <span className="font-latin text-xs font-bold text-slate-900 dark:text-white">
                      {errItem.code}
                    </span>
                    <span className="text-[11px] text-slate-400 font-latin">
                      {errItem.scope} · {errItem.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300">{errItem.message}</p>
                  {errItem.relatedOrderId && (
                    <p className="font-latin text-[11px] text-slate-500">
                      Order Ref: {errItem.relatedOrderId}
                    </p>
                  )}
                </div>

                {errItem.resolved ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'محلول' : 'Resolved'}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleResolveError(errItem.errorId)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{isAr ? 'تعليم كمحلول' : 'Mark Resolved'}</span>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* VOID RECEIPT MODAL */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={(e) => void handleConfirmVoid(e)}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? `إبطال الإيصال ${voidTarget.receiptNumber}` : `Void Receipt ${voidTarget.receiptNumber}`}
              </h3>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {isAr
                ? 'سيتم إبطال الإيصال وإثبات السبب في سجل التدقيق لدى البائع والمشتري والإدارة العامة دون حذف الرقم المتسلسل.'
                : 'This marks the receipt voided across Seller, Buyer, and Super Admin with an immutable audit entry.'}
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'سبب الإبطال الإداري (إلزامي)' : 'Void Reason (Required)'}
              </label>
              <textarea
                required
                rows={3}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder={isAr ? 'اذكر السبب بوضوح...' : 'Specify exact administrative reason...'}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={actionBusy || !voidReason.trim()}
                className="min-h-[38px] rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {actionBusy ? '...' : isAr ? 'تأكيد الإبطال' : 'Confirm Void'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* AMEND RECEIPT MODAL */}
      {amendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={(e) => void handleConfirmAmend(e)}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? `تعديل الإيصال ${amendTarget.receiptNumber}` : `Amend Receipt ${amendTarget.receiptNumber}`}
              </h3>
              <button
                type="button"
                onClick={() => setAmendTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'حالة التسوية المالية' : 'Payment Settlement Status'}
              </label>
              <select
                value={amendPaymentStatus}
                onChange={(e) => setAmendPaymentStatus(e.target.value as MedoraPaymentStatus)}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                <option value="paid">{isAr ? 'مدفوع بالكامل (paid)' : 'Paid'}</option>
                <option value="partial">{isAr ? 'مدفوع جزئياً (partial)' : 'Partial'}</option>
                <option value="credit_open">{isAr ? 'آجل مفتوح (credit_open)' : 'Credit Open'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'ملاحظات إضافية على الإيصال' : 'Updated Receipt Notes'}
              </label>
              <input
                type="text"
                value={amendNotes}
                onChange={(e) => setAmendNotes(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'سبب التعديل الإداري (إلزامي)' : 'Amendment Reason (Required)'}
              </label>
              <textarea
                required
                rows={2}
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAmendTarget(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={actionBusy || !amendReason.trim()}
                className="min-h-[38px] rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
              >
                {actionBusy ? '...' : isAr ? 'حفظ التعديل' : 'Save Amendment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
