import { useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  FileDown,
  Printer,
  Truck,
  XCircle,
} from 'lucide-react';
import { wholesalerTranslations } from '../../i18n/wholesalerTranslations';
import {
  decideWholesalerSupplyOrder,
  prepareWholesalerDispatch,
  recordWholesalerPayment,
  saveWholesalerCreditPolicy,
} from '../../services/wholesalerService';
import type { Language } from '../../types/medora';
import type {
  WholesalerInvoiceRecord,
  WholesalerSectionId,
  WholesalerSupplyOrder,
  WholesalerWorkspaceData,
} from '../../types/wholesaler';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import { WholesalerInvoicePrintSheet } from '../shared/MedoraPrintableDocument';
import { MedoraTargetedAdShowcase } from '../shared/MedoraTargetedAdShowcase';
import { useMedora } from '../../contexts/MedoraContext';

function formatIqd(val: number, isAr: boolean): string {
  return `${Math.round(val || 0).toLocaleString()} ${isAr ? 'د.ع' : 'IQD'}`;
}

export function WholesalerOverviewSection({
  workspace,
  language,
  onNavigate,
}: {
  workspace: WholesalerWorkspaceData;
  language: Language;
  onNavigate: (sec: WholesalerSectionId) => void;
}) {
  const { firebaseUser } = useMedora();
  const isAr = language === 'ar';
  const r = workspace.reports;
  return (
    <div className="space-y-6">
      <MedoraTargetedAdShowcase
        portal="wholesaler"
        language={language}
        firebaseUser={firebaseUser}
        compact
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500">{isAr ? 'مبيعات التوريد الشهرية' : 'Monthly Supply Revenue'}</p>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {formatIqd(r.monthlySupplyRevenueIqd, isAr)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500">{isAr ? 'ذمم الصيدليات الآجلة' : 'Total Receivables'}</p>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
            {formatIqd(r.totalReceivablesIqd, isAr)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500">{isAr ? 'طلبات التوريد المعلقة' : 'Pending Supply Orders'}</p>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
            {r.pendingOrdersCount}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('supply_orders')}
            className="mt-1 text-xs font-bold text-[#0c3585] underline dark:text-[#f4d378] cursor-pointer"
          >
            {isAr ? 'مراجعة الطلبات' : 'Review Orders'}
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500">{isAr ? 'تنبيهات التشغيلات' : 'Batch Expiry Alerts'}</p>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-amber-600">
            {r.expiringSoonBatchesCount + r.expiredBatchesCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {isAr
              ? `قرب انتهاء: ${r.expiringSoonBatchesCount} · منتهي: ${r.expiredBatchesCount}`
              : `Expiring: ${r.expiringSoonBatchesCount} · Expired: ${r.expiredBatchesCount}`}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'أحدث طلبات الصيدليات' : 'Recent Pharmacy Supply Orders'}
        </h3>
        {workspace.supplyOrders.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            {wholesalerTranslations[language].common.noData}
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {workspace.supplyOrders.slice(0, 6).map((ord) => (
              <div key={ord.orderId} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {ord.orderNumber} · {ord.pharmacyName}
                  </p>
                  <p className="text-slate-500">
                    {wholesalerTranslations[language].statuses[ord.status] || ord.status}
                  </p>
                </div>
                <span className="font-latin font-bold tabular-nums">{formatIqd(ord.totalIqd, isAr)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export function WholesalerSupplyOrdersSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const wt = wholesalerTranslations[language];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amendOrder, setAmendOrder] = useState<WholesalerSupplyOrder | null>(null);
  const [amendNote, setAmendNote] = useState('');
  const [overrideQtys, setOverrideQtys] = useState<Record<string, number>>({});

  const handleDecision = async (
    orderId: string,
    status: 'Under Review' | 'Accepted' | 'Partially Accepted' | 'Amendment Proposed' | 'Rejected',
    extra?: {
      rejectionReason?: string;
      amendmentNote?: string;
      itemOverrides?: Array<{ productId: string; approvedQty?: number }>;
    },
  ) => {
    setBusyId(orderId);
    setError(null);
    try {
      await decideWholesalerSupplyOrder(firebaseUser, orderId, { status, ...extra });
      setAmendOrder(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SUPPLY_DECISION_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}
      {workspace.supplyOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {wt.common.noData}
        </div>
      ) : (
        workspace.supplyOrders.map((ord) => (
          <article
            key={ord.orderId}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="font-latin text-xs font-bold text-[#b68023]" dir="ltr">
                  {ord.orderNumber}
                </p>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {ord.pharmacyName}
                </h4>
                <p className="text-xs text-slate-500">
                  {ord.pharmacyGovernorate} · {ord.pharmacyAddress} · {ord.paymentMethod}
                </p>
              </div>
              <div className="text-end">
                <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {wt.statuses[ord.status] || ord.status}
                </p>
                <p className="font-latin text-base font-bold tabular-nums">
                  {formatIqd(ord.totalIqd, isAr)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1 text-start">{isAr ? 'الصنف' : 'Item'}</th>
                    <th className="py-1 text-center">{isAr ? 'المطلوب / المعتمد' : 'Req / App'}</th>
                    <th className="py-1 text-start">{isAr ? 'التشغيلات (FEFO)' : 'FEFO Batches'}</th>
                    <th className="py-1 text-end">{wt.common.total}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ord.items.map((it) => (
                    <tr key={it.itemId}>
                      <td className="py-1.5 font-semibold">{it.medicineName}</td>
                      <td className="py-1.5 text-center tabular-nums">
                        {it.requestedQty} / {it.approvedQty}
                      </td>
                      <td className="py-1.5 text-slate-500 tabular-nums">
                        {it.batchAllocations.map((b) => `${b.batchNumber} (${b.expiryDate}) × ${b.quantity}`).join(' · ') || '—'}
                      </td>
                      <td className="py-1.5 text-end font-bold tabular-nums">
                        {formatIqd(it.lineTotalIqd, isAr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canManage && (ord.status === 'Submitted' || ord.status === 'Under Review') && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={busyId === ord.orderId}
                  onClick={() => void handleDecision(ord.orderId, 'Accepted')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'قبول وحجز FEFO' : 'Accept & Reserve FEFO'}</span>
                </button>
                <button
                  type="button"
                  disabled={busyId === ord.orderId}
                  onClick={() => {
                    const init: Record<string, number> = {};
                    ord.items.forEach((it) => {
                      init[it.productId] = it.requestedQty;
                    });
                    setOverrideQtys(init);
                    setAmendNote('');
                    setAmendOrder(ord);
                  }}
                  className="min-h-[36px] rounded-xl bg-amber-500 px-4 text-xs font-bold text-slate-950 cursor-pointer"
                >
                  {isAr ? 'تعديل الكمية / مقترح للصيدلية' : 'Propose Amendment'}
                </button>
                <button
                  type="button"
                  disabled={busyId === ord.orderId}
                  onClick={() =>
                    void handleDecision(ord.orderId, 'Rejected', {
                      rejectionReason: isAr ? 'غير متوفر حالياً' : 'Unavailable at warehouse',
                    })
                  }
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  <span>{isAr ? 'رفض' : 'Reject'}</span>
                </button>
              </div>
            )}
          </article>
        ))
      )}

      {amendOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setAmendOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold">{isAr ? 'تعديل كميات الطلب قبل الصرف' : 'Propose Order Amendment'}</h3>
            <div className="space-y-2 text-xs">
              {amendOrder.items.map((it) => (
                <div key={it.productId} className="flex items-center justify-between gap-2">
                  <span>{it.medicineName} (Req: {it.requestedQty})</span>
                  <input
                    type="number"
                    min={0}
                    max={it.requestedQty}
                    value={overrideQtys[it.productId] ?? it.requestedQty}
                    onChange={(e) =>
                      setOverrideQtys((p) => ({
                        ...p,
                        [it.productId]: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="min-h-[34px] w-24 rounded-lg border border-slate-300 px-2 text-center tabular-nums dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              ))}
            </div>
            <input
              value={amendNote}
              onChange={(e) => setAmendNote(e.target.value)}
              placeholder={isAr ? 'ملاحظة التعديل للصيدلية...' : 'Amendment reason for pharmacy...'}
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAmendOrder(null)}
                className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold cursor-pointer"
              >
                {wt.common.cancel}
              </button>
              <button
                type="button"
                disabled={busyId === amendOrder.orderId}
                onClick={() =>
                  void handleDecision(amendOrder.orderId, 'Amendment Proposed', {
                    amendmentNote: amendNote.trim() || undefined,
                    itemOverrides: amendOrder.items.map((it) => ({
                      productId: it.productId,
                      approvedQty: overrideQtys[it.productId] ?? it.requestedQty,
                    })),
                  })
                }
                className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {isAr ? 'إرسال مقترح التعديل للصيدلية' : 'Send Proposal to Pharmacy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function WholesalerShipmentsSection({
  firebaseUser,
  workspace,
  language,
  canDispatch,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  canDispatch: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [driverInputs, setDriverInputs] = useState<Record<string, { name: string; phone: string; vehicle: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const dispatchableOrders = workspace.supplyOrders.filter((o) =>
    ['Accepted', 'Partially Accepted', 'Preparing', 'Ready for Dispatch', 'Shipped', 'Delivered'].includes(
      o.status,
    ),
  );

  const handleDispatch = async (
    orderId: string,
    status: 'Preparing' | 'Ready for Dispatch' | 'Shipped' | 'Delivered',
  ) => {
    setBusyId(orderId);
    try {
      const d = driverInputs[orderId] || { name: '', phone: '', vehicle: '' };
      await prepareWholesalerDispatch(firebaseUser, orderId, {
        status,
        driverName: d.name || undefined,
        driverPhone: d.phone || undefined,
        vehicleInfo: d.vehicle || undefined,
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {dispatchableOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {wholesalerTranslations[language].common.noData}
        </div>
      ) : (
        dispatchableOrders.map((ord) => (
          <article
            key={ord.orderId}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-latin text-xs font-bold text-[#b68023]">{ord.orderNumber}</p>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {ord.pharmacyName} · {ord.pharmacyAddress}
                </h4>
              </div>
              <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                {wholesalerTranslations[language].statuses[ord.status] || ord.status}
              </span>
            </div>

            {canDispatch && ord.status !== 'Delivered' && (
              <div className="space-y-2.5 pt-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    value={driverInputs[ord.orderId]?.name || ''}
                    onChange={(e) =>
                      setDriverInputs((p) => ({
                        ...p,
                        [ord.orderId]: { ...(p[ord.orderId] || { phone: '', vehicle: '' }), name: e.target.value },
                      }))
                    }
                    placeholder={isAr ? 'اسم السائق / المندوب' : 'Driver Name'}
                    className="min-h-[36px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    value={driverInputs[ord.orderId]?.phone || ''}
                    onChange={(e) =>
                      setDriverInputs((p) => ({
                        ...p,
                        [ord.orderId]: { ...(p[ord.orderId] || { name: '', vehicle: '' }), phone: e.target.value },
                      }))
                    }
                    placeholder={isAr ? 'هاتف السائق' : 'Driver Phone'}
                    className="min-h-[36px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    value={driverInputs[ord.orderId]?.vehicle || ''}
                    onChange={(e) =>
                      setDriverInputs((p) => ({
                        ...p,
                        [ord.orderId]: { ...(p[ord.orderId] || { name: '', phone: '' }), vehicle: e.target.value },
                      }))
                    }
                    placeholder={isAr ? 'رقم المركبة / خط السير' : 'Vehicle Info'}
                    className="min-h-[36px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === ord.orderId}
                    onClick={() => void handleDispatch(ord.orderId, 'Preparing')}
                    className="min-h-[34px] rounded-xl border border-slate-300 px-3 text-xs font-bold cursor-pointer"
                  >
                    {isAr ? 'تجهيز' : 'Preparing'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === ord.orderId}
                    onClick={() => void handleDispatch(ord.orderId, 'Ready for Dispatch')}
                    className="min-h-[34px] rounded-xl border border-slate-300 px-3 text-xs font-bold cursor-pointer"
                  >
                    {isAr ? 'جاهز للشحن' : 'Ready for Dispatch'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === ord.orderId}
                    onClick={() => void handleDispatch(ord.orderId, 'Shipped')}
                    className="min-h-[34px] rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white cursor-pointer"
                  >
                    {isAr ? 'شحن وإصدار الفاتورة' : 'Ship & Issue Invoice'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === ord.orderId}
                    onClick={() => void handleDispatch(ord.orderId, 'Delivered')}
                    className="min-h-[34px] rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white cursor-pointer"
                  >
                    {isAr ? 'تم التوصيل للصيدلية' : 'Mark Delivered'}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))
      )}
    </div>
  );
}

export function WholesalerCreditPoliciesSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [pharmacyUid, setPharmacyUid] = useState('');
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [creditLimitIqd, setCreditLimitIqd] = useState(5000000);
  const [paymentTermDays, setPaymentTermDays] = useState(30);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleSavePolicy = async (e: FormEvent) => {
    e.preventDefault();
    if (!pharmacyUid.trim()) return;
    setSaving(true);
    try {
      await saveWholesalerCreditPolicy(firebaseUser, {
        pharmacyUid: pharmacyUid.trim(),
        creditEnabled,
        creditLimitIqd,
        paymentTermDays,
        customDiscountPercent: discountPercent,
      });
      setPharmacyUid('');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={(e) => void handleSavePolicy(e)}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr
              ? 'تفعيل سياسة الائتمان (الآجل) أو خصم خاص لصيدلية'
              : 'Configure Opt-In Pharmacy Credit Policy & Custom Discount'}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              required
              value={pharmacyUid}
              onChange={(e) => setPharmacyUid(e.target.value)}
              placeholder={isAr ? 'معرف حساب الصيدلية (UID)' : 'Pharmacy UID'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="number"
              min={0}
              value={creditLimitIqd}
              onChange={(e) => setCreditLimitIqd(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'سقف الائتمان (د.ع)' : 'Credit Limit (IQD)'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="number"
              min={0}
              max={60}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'خصم خاص %' : 'Custom Discount %'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="number"
              min={1}
              value={paymentTermDays}
              onChange={(e) => setPaymentTermDays(Math.max(1, Number(e.target.value) || 30))}
              placeholder={isAr ? 'أيام السداد' : 'Payment Term Days'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={creditEnabled}
              onChange={(e) => setCreditEnabled(e.target.checked)}
            />
            <span>{isAr ? 'تفعيل الدفع الآجل لهذه الصيدلية' : 'Enable Credit Account for this Pharmacy'}</span>
          </label>
          <button
            type="submit"
            disabled={saving}
            className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
          >
            {wholesalerTranslations[language].common.save}
          </button>
        </form>
      )}

      <div className="space-y-2.5">
        {workspace.creditPolicies.map((pol) => (
          <div
            key={pol.policyId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div>
              <p className="font-bold text-slate-900 dark:text-white">{pol.pharmacyName}</p>
              <p className="text-slate-500 tabular-nums">
                {pol.creditEnabled ? (isAr ? 'آجل مفعل' : 'Credit Active') : isAr ? 'نقدي فقط' : 'COD Only'} ·{' '}
                {isAr ? `الخصم: ${pol.customDiscountPercent}%` : `Discount: ${pol.customDiscountPercent}%`} ·{' '}
                {pol.paymentTermDays}d
              </p>
            </div>
            <div className="text-end tabular-nums">
              <p className="font-bold">{isAr ? 'الحد:' : 'Limit:'} {formatIqd(pol.creditLimitIqd, isAr)}</p>
              <p className="text-rose-600">{isAr ? 'الرصيد:' : 'Balance:'} {formatIqd(pol.currentBalanceIqd, isAr)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WholesalerInvoicesAndPaymentsSection({
  firebaseUser,
  workspace,
  language,
  mode,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  mode: 'invoices' | 'payments';
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [payingInv, setPayingInv] = useState<WholesalerInvoiceRecord | null>(null);
  const [amount, setAmount] = useState(0);
  const [refCode, setRefCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleRecordPayment = async () => {
    if (!payingInv || amount <= 0) return;
    setBusy(true);
    try {
      await recordWholesalerPayment(firebaseUser, {
        invoiceId: payingInv.invoiceId,
        amountIqd: amount,
        method: payingInv.paymentMethod === 'credit_account' ? 'credit_settlement' : 'cash_on_delivery',
        referenceCode: refCode.trim() || undefined,
      });
      setPayingInv(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'payments') {
    return (
      <div className="space-y-3">
        {workspace.payments.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
            {wholesalerTranslations[language].common.noData}
          </div>
        ) : (
          workspace.payments.map((p) => (
            <div
              key={p.paymentId}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div>
                <p className="font-bold text-slate-900 dark:text-white">{p.pharmacyName}</p>
                <p className="text-slate-500">
                  {p.method} {p.referenceCode ? `· ${p.referenceCode}` : ''} · {p.paidAt.slice(0, 10)}
                </p>
              </div>
              <span className="font-latin font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatIqd(p.amountIqd, isAr)}
              </span>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-start">{isAr ? 'الفاتورة' : 'Invoice #'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'الصيدلية' : 'Pharmacy'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'الإجمالي' : 'Total'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'المتبقي' : 'Balance'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
                <th className="px-4 py-3 text-end" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.invoices.map((inv) => (
                <tr key={inv.invoiceId}>
                  <td className="px-4 py-3 font-latin font-bold tabular-nums">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 font-semibold">{inv.pharmacyName}</td>
                  <td className="px-4 py-3 text-center font-bold tabular-nums">
                    {formatIqd(inv.totalIqd, isAr)}
                  </td>
                  <td className="px-4 py-3 text-center text-rose-600 tabular-nums">
                    {formatIqd(inv.balanceDueIqd, isAr)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">{inv.status}</td>
                  <td className="px-4 py-3 text-end">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          void printMedoraDocument(
                            <WholesalerInvoicePrintSheet invoice={inv} lang={language} />,
                            inv.invoiceNumber,
                          )
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1 cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadMedoraPdf({
                            filename: sanitizePdfFilename(inv.invoiceNumber),
                            element: <WholesalerInvoicePrintSheet invoice={inv} lang={language} />,
                            dir: isAr ? 'rtl' : 'ltr',
                          })
                        }
                        className="rounded-lg border border-slate-300 px-2.5 py-1 cursor-pointer"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                      </button>
                      {canManage && inv.balanceDueIqd > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayingInv(inv);
                            setAmount(inv.balanceDueIqd);
                          }}
                          className="medora-gold-button rounded-lg px-3 py-1 text-xs font-bold text-[#040917] cursor-pointer"
                        >
                          {isAr ? 'تسديد' : 'Settle'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {payingInv && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          onClick={() => setPayingInv(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold">{isAr ? 'تسجيل دفعة مالية' : 'Record Payment'}</h3>
            <input
              type="number"
              min={1}
              max={payingInv.balanceDueIqd}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={refCode}
              onChange={(e) => setRefCode(e.target.value)}
              placeholder={isAr ? 'رقم الوصل / المرجع' : 'Receipt / Reference #'}
              className="min-h-[40px] w-full rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingInv(null)}
                className="min-h-[38px] rounded-xl border border-slate-300 px-4 text-xs font-bold cursor-pointer"
              >
                {wholesalerTranslations[language].common.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleRecordPayment()}
                className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {wholesalerTranslations[language].common.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
