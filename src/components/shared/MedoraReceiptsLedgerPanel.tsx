import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Loader2,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { Language } from '../../types/medora';
import type { MedoraReceiptRecord, MedoraTransactionType } from '../../types/commerce';
import { fetchScopedReceipts, recordReceiptReprint } from '../../services/commerceService';
import { printMedoraDocument } from '../../utils/printAndPdf';
import { UnifiedReceiptPrintSheet } from './MedoraPrintableDocument';

interface MedoraReceiptsLedgerPanelProps {
  firebaseUser: User;
  lang: Language;
  viewerUid: string;
  defaultFilterType?: MedoraTransactionType | 'all';
  titleAr?: string;
  titleEn?: string;
}

export const MedoraReceiptsLedgerPanel: React.FC<MedoraReceiptsLedgerPanelProps> = ({
  firebaseUser,
  lang,
  viewerUid,
  defaultFilterType = 'all',
  titleAr,
  titleEn,
}) => {
  const isAr = lang === 'ar';
  const [receipts, setReceipts] = useState<MedoraReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<MedoraTransactionType | 'all'>(defaultFilterType);
  const [searchQ, setSearchQ] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchScopedReceipts(firebaseUser, {
        transactionType: filterType === 'all' ? undefined : filterType,
      });
      setReceipts(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'RECEIPTS_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [filterType, firebaseUser]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((r) =>
      [r.receiptNumber, r.orderNumber, r.sellerName, r.buyerName, r.transactionType]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [receipts, searchQ]);

  const handlePrintReceipt = (receipt: MedoraReceiptRecord) => {
    void printMedoraDocument(
      <UnifiedReceiptPrintSheet receipt={receipt} lang={lang} />,
      receipt.receiptNumber,
      {
        onPrintAction: async () => {
          const updated = await recordReceiptReprint(firebaseUser, receipt.receiptId).catch(
            () => null,
          );
          if (updated) {
            setReceipts((prev) =>
              prev.map((r) => (r.receiptId === updated.receiptId ? updated : r)),
            );
          }
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 dark:bg-[#d9a43b]/15 text-[#0c3585] dark:text-[#f4d378]">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? titleAr || 'سجل الإيصالات الثلاثية الموحدة' : titleEn || '3-Party Linked Receipts'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'تصدر عند اكتمال المعاملة وتُحفظ بالتزامن لدى البائع والمشتري والإدارة العامة.'
                : 'Issued only upon completion and synced across Seller, Buyer, and Super Admin.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadReceipts()}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={isAr ? 'بحث برقم الإيصال، الطلب، البائع أو المشتري...' : 'Search by receipt #, order #, party...'}
            className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] ps-9 pe-3 text-xs text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as MedoraTransactionType | 'all')}
          className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3 text-xs text-slate-900 dark:text-white"
        >
          <option value="all">{isAr ? 'كل المعاملات' : 'All Flows'}</option>
          <option value="wholesaler_to_pharmacy">
            {isAr ? 'مذخر ← صيدلية (مشتريات)' : 'Wholesaler → Pharmacy'}
          </option>
          <option value="pharmacy_to_doctor">
            {isAr ? 'صيدلية ← طبيب' : 'Pharmacy → Doctor'}
          </option>
          <option value="pharmacy_to_patient">
            {isAr ? 'صيدلية ← مراجع' : 'Pharmacy → Patient'}
          </option>
        </select>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-700 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      {loading && receipts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-xs text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#0c3585]" />
          {isAr ? 'جاري تحميل الإيصالات...' : 'Loading receipts...'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-xs text-slate-500 dark:text-slate-400">
          {isAr
            ? 'لا توجد إيصالات مكتملة مطابقة لبحثك بعد.'
            : 'No completed receipts found yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((rcpt) => {
            const isSeller = rcpt.sellerUid === viewerUid;
            const statusColor =
              rcpt.status === 'voided'
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                : rcpt.status === 'amended'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300';

            return (
              <div
                key={rcpt.receiptId}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 shadow-sm flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378] font-latin">
                        {rcpt.receiptNumber}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {isAr ? 'طلب' : 'Order'}: {rcpt.orderNumber} ·{' '}
                        {String(rcpt.issuedAt || '').slice(0, 10)}
                      </p>
                    </div>
                    <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${statusColor}`}>
                      {rcpt.status === 'voided'
                        ? isAr
                          ? 'مبطل'
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

                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900/70 p-2.5 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isSeller ? (isAr ? 'المشتري:' : 'Buyer:') : isAr ? 'البائع:' : 'Seller:'}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {isSeller ? rcpt.buyerName : rcpt.sellerName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isAr ? 'الدور:' : 'Party Role:'}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {isSeller ? (isAr ? 'بائع (مُجهِّز)' : 'Seller') : isAr ? 'مشتري' : 'Buyer'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">
                        {isAr ? 'الأصناف:' : 'Items:'}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        {rcpt.items.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {rcpt.totalAmountIqd.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                      <ShieldCheck className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
                      <span>{isAr ? 'حفظ ثلاثي مترابط' : '3-Party Synced'}</span>
                      {rcpt.reprintCount > 0 && (
                        <span>
                          · {isAr ? `طباعات: ${rcpt.reprintCount}` : `Prints: ${rcpt.reprintCount}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePrintReceipt(rcpt)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {isAr ? 'معاينة / طباعة A4 & حراري' : 'Print A4 / Thermal'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
