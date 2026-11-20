import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PackageCheck,
  Printer,
  RefreshCw,
  Stethoscope,
  Truck,
  XCircle,
} from 'lucide-react';
import {
  actionPharmacyDoctorOrder,
  fetchPharmacyDoctorOrders,
  recordReceiptReprint,
} from '../../services/commerceService';
import type { MedoraReceiptRecord, PharmacyDoctorOrder } from '../../types/commerce';
import type { Language } from '../../types/medora';
import { printMedoraDocument } from '../../utils/printAndPdf';
import { UnifiedReceiptPrintSheet } from '../shared/MedoraPrintableDocument';
import { formatIqd } from './PharmacyBrandUtils';

export function PharmacyDoctorOrdersSection({
  firebaseUser,
  language,
  canManage,
  onRefreshWorkspace,
}: {
  firebaseUser: User;
  language: Language;
  canManage: boolean;
  onRefreshWorkspace?: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [orders, setOrders] = useState<PharmacyDoctorOrder[]>([]);
  const [receipts, setReceipts] = useState<MedoraReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectModalOrder, setRejectModalOrder] = useState<PharmacyDoctorOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPharmacyDoctorOrders(firebaseUser);
      setOrders(res.orders);
      setReceipts(res.receipts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DOCTOR_ORDERS_LOAD_FAILED');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const receiptByOrderId = useMemo(() => {
    const map = new Map<string, MedoraReceiptRecord>();
    for (const r of receipts) {
      if (r.orderId) map.set(r.orderId, r);
    }
    return map;
  }, [receipts]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const runAction = async (
    orderId: string,
    action:
      | 'accept'
      | 'preparing'
      | 'ready_for_pickup'
      | 'out_for_delivery'
      | 'delivered'
      | 'complete'
      | 'reject',
    reason?: string,
  ) => {
    setBusyId(orderId);
    setError(null);
    setNotice(null);
    try {
      const res = await actionPharmacyDoctorOrder(firebaseUser, orderId, action, reason);
      setRejectModalOrder(null);
      setRejectReason('');
      setNotice(
        res.receipt
          ? isAr
            ? `اكتمل الطلب ${res.order.orderNumber} وصدر الإيصال الثلاثي ${res.receipt.receiptNumber}.`
            : `Order ${res.order.orderNumber} completed and 3-party receipt ${res.receipt.receiptNumber} issued.`
          : isAr
            ? `تم تحديث حالة طلب الطبيب ${res.order.orderNumber}.`
            : `Doctor order ${res.order.orderNumber} updated.`,
      );
      await Promise.all([loadOrders(), onRefreshWorkspace?.()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'DOCTOR_ORDER_ACTION_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handlePrintReceipt = (receipt: MedoraReceiptRecord) => {
    void printMedoraDocument(
      <UnifiedReceiptPrintSheet receipt={receipt} lang={language} />,
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

  const statusLabels: Record<string, { ar: string; en: string }> = {
    all: { ar: 'الكل', en: 'All' },
    Submitted: { ar: 'مُرسل', en: 'Submitted' },
    Accepted: { ar: 'مقبول', en: 'Accepted' },
    Preparing: { ar: 'قيد التجهيز', en: 'Preparing' },
    'Ready for Pickup': { ar: 'جاهز للاستلام', en: 'Ready for Pickup' },
    'Out for Delivery': { ar: 'خرج للتوصيل', en: 'Out for Delivery' },
    Delivered: { ar: 'تم التوصيل', en: 'Delivered' },
    Completed: { ar: 'مكتمل', en: 'Completed' },
    Rejected: { ar: 'مرفوض', en: 'Rejected' },
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'طلبات الأطباء والعيادات (صيدلية ← طبيب)' : 'Doctor & Clinic Supply Orders (Pharmacy → Doctor)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'قبول الطلبات بحجز FEFO، التجهيز والتوصيل، وإصدار الإيصال الثلاثي المربوط بالطبيب والصيدلية والإدارة.'
                : 'Accept orders with FEFO reservation, prepare/deliver, and issue linked 3-party receipts upon completion.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {Object.keys(statusLabels).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`min-h-[34px] rounded-xl border px-3 text-xs font-bold transition cursor-pointer ${
              statusFilter === st
                ? 'border-[#0c3585] bg-[#0c3585] text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300'
            }`}
          >
            {isAr ? statusLabels[st].ar : statusLabels[st].en}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {loading && orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-[#0c3585]" />
          {isAr ? 'جاري تحميل طلبات الأطباء...' : 'Loading doctor orders...'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {isAr ? 'لا توجد طلبات أطباء في هذا التصنيف حالياً.' : 'No doctor orders in this filter.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((ord) => {
            const receipt = receiptByOrderId.get(ord.orderId);
            return (
              <article
                key={ord.orderId}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <p
                      className="font-latin text-xs font-bold text-[#0c3585] dark:text-[#f4d378] tabular-nums"
                      dir="ltr"
                    >
                      {ord.orderNumber}
                    </p>
                    <h3 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                      {ord.doctorName}
                      {ord.clinicName ? ` · ${ord.clinicName}` : ''}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {ord.fulfillmentType === 'buyer_pickup'
                        ? isAr
                          ? 'استلام من الصيدلية'
                          : 'Doctor Pickup'
                        : `${isAr ? 'توصيل إلى العيادة:' : 'Clinic Delivery:'} ${ord.deliveryAddress || '—'}`}
                      {' · '}
                      {ord.paymentMethod}
                    </p>
                  </div>
                  <div className="text-end">
                    <span className="inline-block rounded-lg bg-[#0c3585]/10 px-2.5 py-1 text-xs font-bold text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                      {statusLabels[ord.status]?.[isAr ? 'ar' : 'en'] || ord.status}
                    </span>
                    <p className="mt-1 font-latin text-base font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {formatIqd(ord.totalIqd, isAr)}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-1 text-start">{isAr ? 'الدواء' : 'Medicine'}</th>
                        <th className="py-1 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                        <th className="py-1 text-center">{isAr ? 'السعر' : 'Unit'}</th>
                        <th className="py-1 text-end">{isAr ? 'الإجمالي' : 'Line Total'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {ord.items.map((it, idx) => (
                        <tr key={`${it.productId}-${idx}`}>
                          <td className="py-1.5 font-semibold text-slate-900 dark:text-white">
                            {it.medicineName}
                            {it.strength ? ` · ${it.strength}` : ''}
                          </td>
                          <td className="py-1.5 text-center font-latin tabular-nums text-slate-700 dark:text-slate-200">
                            {it.confirmedQty || it.requestedQty}
                          </td>
                          <td className="py-1.5 text-center font-latin tabular-nums text-slate-600 dark:text-slate-300">
                            {formatIqd(it.unitPriceIqd, isAr)}
                          </td>
                          <td className="py-1.5 text-end font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                            {formatIqd(it.lineTotalIqd, isAr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {ord.notes && (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-900/70 dark:text-slate-300">
                    {isAr ? 'ملاحظات الطبيب:' : 'Notes:'} {ord.notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && ord.status === 'Submitted' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === ord.orderId}
                          onClick={() => void runAction(ord.orderId, 'accept')}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>{isAr ? 'قبول وحجز FEFO' : 'Accept & Reserve FEFO'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === ord.orderId}
                          onClick={() => {
                            setRejectModalOrder(ord);
                            setRejectReason('');
                          }}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-bold text-white cursor-pointer"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>{isAr ? 'رفض' : 'Reject'}</span>
                        </button>
                      </>
                    )}
                    {canManage && ord.status === 'Accepted' && (
                      <button
                        type="button"
                        disabled={busyId === ord.orderId}
                        onClick={() => void runAction(ord.orderId, 'preparing')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <span>{isAr ? 'بدء التجهيز' : 'Start Preparing'}</span>
                      </button>
                    )}
                    {canManage && ord.status === 'Preparing' && ord.fulfillmentType === 'buyer_pickup' && (
                      <button
                        type="button"
                        disabled={busyId === ord.orderId}
                        onClick={() => void runAction(ord.orderId, 'ready_for_pickup')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        <span>{isAr ? 'جاهز لاستلام الطبيب' : 'Ready for Pickup'}</span>
                      </button>
                    )}
                    {canManage && ord.status === 'Preparing' && ord.fulfillmentType === 'seller_delivery' && (
                      <button
                        type="button"
                        disabled={busyId === ord.orderId}
                        onClick={() => void runAction(ord.orderId, 'out_for_delivery')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        <span>{isAr ? 'إرسال للتوصيل' : 'Out for Delivery'}</span>
                      </button>
                    )}
                    {canManage && ord.status === 'Out for Delivery' && (
                      <button
                        type="button"
                        disabled={busyId === ord.orderId}
                        onClick={() => void runAction(ord.orderId, 'delivered')}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        <span>{isAr ? 'تحديد تم التوصيل' : 'Mark Delivered'}</span>
                      </button>
                    )}
                    {canManage &&
                      (ord.status === 'Ready for Pickup' || ord.status === 'Delivered') && (
                        <button
                          type="button"
                          disabled={busyId === ord.orderId}
                          onClick={() => void runAction(ord.orderId, 'complete')}
                          className="medora-gold-button inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold cursor-pointer"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          <span>
                            {isAr
                              ? 'إتمام المعاملة وإصدار الإيصال الثلاثي'
                              : 'Complete & Issue 3-Party Receipt'}
                          </span>
                        </button>
                      )}
                  </div>

                  {receipt && (
                    <button
                      type="button"
                      onClick={() => handlePrintReceipt(receipt)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/10 px-3.5 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/15 dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/15 dark:text-[#f4d378] cursor-pointer"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span>
                        {isAr
                          ? `طباعة الإيصال ${receipt.receiptNumber} (A4 / حراري)`
                          : `Print Receipt ${receipt.receiptNumber}`}
                      </span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejectModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setRejectModalOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'رفض طلب الطبيب' : 'Reject Doctor Order'}
            </h3>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={isAr ? 'اذكر سبب الرفض...' : 'Rejection reason...'}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={rejectReason.trim().length < 3 || busyId === rejectModalOrder.orderId}
                onClick={() =>
                  void runAction(rejectModalOrder.orderId, 'reject', rejectReason.trim())
                }
                className="min-h-[38px] rounded-xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {isAr ? 'تأكيد الرفض' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
