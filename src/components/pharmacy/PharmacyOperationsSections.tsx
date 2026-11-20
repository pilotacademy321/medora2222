import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  FileDown,
  KeyRound,
  PackageCheck,
  Printer,
  Receipt,
  RotateCcw,
  ShoppingBag,
  Truck,
  XCircle,
} from 'lucide-react';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import { fetchScopedReceipts } from '../../services/commerceService';
import {
  processPharmacyReturn,
  recordPharmacyInvoicePayment,
  reviewPharmacyPrescription,
  transitionPharmacyOrder,
  updatePharmacyDelivery,
} from '../../services/pharmacyService';
import type { MedoraReceiptRecord } from '../../types/commerce';
import type { Language } from '../../types/medora';
import type {
  PatientPharmacyOrderStatus,
  PharmacyInvoiceRecord,
  PharmacyOrderRecord,
  PharmacyPrescriptionReview,
  PharmacyWorkspaceData,
} from '../../types/pharmacy';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';
import {
  PharmacyInvoicePrintSheet,
  UnifiedReceiptPrintSheet,
} from '../shared/MedoraPrintableDocument';
import { formatIqd } from './PharmacyBrandUtils';

type OrdersSubTab = 'queue' | 'deliveries' | 'invoices' | 'returns';

export function PharmacyOrdersSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  canCollectBilling = true,
  canManageDeliveries = true,
  canManageReturns = true,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canManage: boolean;
  canCollectBilling?: boolean;
  canManageDeliveries?: boolean;
  canManageReturns?: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const [subTab, setSubTab] = useState<OrdersSubTab>('queue');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickupModalOrder, setPickupModalOrder] = useState<PharmacyOrderRecord | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState('');
  const [rejectModalOrder, setRejectModalOrder] = useState<PharmacyOrderRecord | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [patientReceipts, setPatientReceipts] = useState<MedoraReceiptRecord[]>([]);

  useEffect(() => {
    let active = true;
    fetchScopedReceipts(firebaseUser, { transactionType: 'pharmacy_to_patient' })
      .then((list) => {
        if (active) setPatientReceipts(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [firebaseUser, workspace.orders.length]);

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return workspace.orders;
    return workspace.orders.filter((o) => o.status === statusFilter);
  }, [workspace.orders, statusFilter]);

  const handleTransition = async (
    orderId: string,
    status: PatientPharmacyOrderStatus,
    extra?: { pickupCode?: string; rejectionReason?: string },
  ) => {
    setBusyId(orderId);
    setError(null);
    try {
      await transitionPharmacyOrder(firebaseUser, orderId, { status, ...extra });
      setPickupModalOrder(null);
      setPickupCodeInput('');
      setRejectModalOrder(null);
      setRejectReasonInput('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ORDER_TRANSITION_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Unified Online Order Management Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#07122a]">
        {(
          [
            {
              id: 'queue' as OrdersSubTab,
              label: isAr ? `الطلبات الواردة (${workspace.orders.length})` : `Orders Queue (${workspace.orders.length})`,
              icon: ShoppingBag,
            },
            {
              id: 'deliveries' as OrdersSubTab,
              label: isAr ? `التوصيل والمندوبين (${workspace.deliveries.length})` : `Deliveries (${workspace.deliveries.length})`,
              icon: Truck,
            },
            {
              id: 'invoices' as OrdersSubTab,
              label: isAr ? `إيصالات الطلبات (${workspace.invoices.length})` : `Order Receipts (${workspace.invoices.length})`,
              icon: Receipt,
            },
            {
              id: 'returns' as OrdersSubTab,
              label: isAr ? `المرتجعات (${workspace.returns.length})` : `Returns (${workspace.returns.length})`,
              icon: RotateCcw,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                subTab === tab.id
                  ? 'bg-[#0c3585] text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {subTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'all',
                  'Submitted',
                  'Accepted',
                  'Preparing',
                  'Ready for Pickup',
                  'Out for Delivery',
                  'Completed',
                  'Cancelled',
                ] as const
              ).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[36px] rounded-xl border px-3 text-xs font-bold cursor-pointer ${
                    statusFilter === st
                      ? 'border-[#0c3585] bg-[#0c3585] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-300'
                  }`}
                >
                  {st === 'all' ? pt.common.all : pt.statuses[st] || st}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}

          {filteredOrders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
              {pt.common.noData}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const linkedReceipt = patientReceipts.find((r) => r.orderId === order.orderId);
                return (
                <article
                  key={order.orderId}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div>
                      <p
                        className="font-latin text-xs font-bold text-[#0c3585] dark:text-[#f4d378] tabular-nums"
                        dir="ltr"
                      >
                        {order.orderNumber} · {pt.orderSources[order.source] || order.source}
                      </p>
                      <h4 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                        {order.patientName}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {order.fulfillmentType === 'pickup'
                          ? pt.fulfillmentTypes.pickup
                          : `${isAr ? 'توصيل:' : 'Delivery:'} ${order.deliveryGovernorate || ''} · ${order.deliveryDistrict || ''} · ${order.deliveryAddress || ''}`}
                      </p>
                    </div>

                    <div className="text-end">
                      <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                        {pt.statuses[order.status] || order.status}
                      </p>
                      <p className="font-latin text-base font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatIqd(order.totalIqd, isAr)}
                      </p>
                      {order.pickupCode && order.fulfillmentType === 'pickup' && (
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                          {isAr ? 'رمز الاستلام مسجل لدى المريض' : 'Pickup Code Verified on Handover'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-start text-xs">
                      <thead className="text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="py-1 text-start">{isAr ? 'الدواء' : 'Medicine'}</th>
                          <th className="py-1 text-center">{pt.common.quantity}</th>
                          <th className="py-1 text-start">
                            {isAr ? 'التشغيلات المحجوزة (FEFO)' : 'FEFO Batches'}
                          </th>
                          <th className="py-1 text-end">{pt.common.total}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {order.items.map((it) => (
                          <tr key={it.itemId}>
                            <td className="py-1.5 font-semibold text-slate-800 dark:text-slate-200">
                              {it.medicineName}
                            </td>
                            <td className="py-1.5 text-center tabular-nums text-slate-700 dark:text-slate-200">
                              {it.confirmedQty} / {it.requestedQty}
                            </td>
                            <td className="py-1.5 text-slate-500 dark:text-slate-400 tabular-nums">
                              {it.batchAllocations
                                .map((b) => `${b.batchNumber} (${b.expiryDate}) × ${b.quantity}`)
                                .join(' · ') || '—'}
                            </td>
                            <td className="py-1.5 text-end font-semibold tabular-nums text-slate-900 dark:text-white">
                              {formatIqd(it.lineTotalIqd, isAr)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {canManage &&
                    order.status !== 'Completed' &&
                    order.status !== 'Cancelled' &&
                    order.status !== 'Rejected' && (
                      <div className="flex flex-wrap items-center gap-2 pt-2">
                        {(order.status === 'Submitted' ||
                          order.status === 'Under Pharmacist Review') && (
                          <>
                            <button
                              type="button"
                              disabled={busyId === order.orderId}
                              onClick={() => void handleTransition(order.orderId, 'Accepted')}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>{isAr ? 'قبول الطلب' : 'Accept'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === order.orderId}
                              onClick={() => {
                                setRejectModalOrder(order);
                                setRejectReasonInput('');
                              }}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 text-xs font-bold text-white cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              <span>{isAr ? 'رفض' : 'Reject'}</span>
                            </button>
                          </>
                        )}

                        {(order.status === 'Accepted' || order.status === 'Partially Accepted') && (
                          <button
                            type="button"
                            disabled={busyId === order.orderId}
                            onClick={() => void handleTransition(order.orderId, 'Preparing')}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            <span>{isAr ? 'بدء التجهيز' : 'Start Preparing'}</span>
                          </button>
                        )}

                        {order.status === 'Preparing' && order.fulfillmentType === 'pickup' && (
                          <button
                            type="button"
                            disabled={busyId === order.orderId}
                            onClick={() => void handleTransition(order.orderId, 'Ready for Pickup')}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            <span>{isAr ? 'تحديد جاهز للاستلام' : 'Mark Ready for Pickup'}</span>
                          </button>
                        )}

                        {order.status === 'Preparing' && order.fulfillmentType === 'delivery' && (
                          <button
                            type="button"
                            disabled={busyId === order.orderId}
                            onClick={() =>
                              void handleTransition(order.orderId, 'Out for Delivery')
                            }
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>{isAr ? 'إخراج للتوصيل' : 'Dispatch Delivery'}</span>
                          </button>
                        )}

                        {order.status === 'Ready for Pickup' && (
                          <button
                            type="button"
                            disabled={busyId === order.orderId}
                            onClick={() => {
                              setPickupModalOrder(order);
                              setPickupCodeInput('');
                            }}
                            className="medora-gold-button inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span>
                              {isAr
                                ? 'تحقق برمز الاستلام وإكمال الصرف'
                                : 'Verify Pickup Code & Complete'}
                            </span>
                          </button>
                        )}

                        {order.status === 'Out for Delivery' && (
                          <button
                            type="button"
                            disabled={busyId === order.orderId}
                            onClick={() => void handleTransition(order.orderId, 'Completed')}
                            className="medora-gold-button inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>{isAr ? 'تأكيد التسليم وإصدار الإيصال' : 'Complete Delivery'}</span>
                          </button>
                        )}
                      </div>
                    )}

                  {linkedReceipt && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 px-3.5 py-2 text-xs">
                      <span className="font-bold text-[#0c3585] dark:text-[#f4d378] font-latin tabular-nums">
                        {isAr ? 'الإيصال الموحد:' : 'Unified Receipt:'} {linkedReceipt.receiptNumber}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void printMedoraDocument(
                              <UnifiedReceiptPrintSheet receipt={linkedReceipt} lang={language} />,
                              linkedReceipt.receiptNumber,
                              { format: 'a4' },
                            )
                          }
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-[#0c3585] px-3 text-[11px] font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>{isAr ? 'طباعة الإيصال (A4 / حراري)' : 'Print Receipt'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadMedoraPdf({
                              filename: sanitizePdfFilename(linkedReceipt.receiptNumber),
                              element: <UnifiedReceiptPrintSheet receipt={linkedReceipt} lang={language} />,
                              dir: isAr ? 'rtl' : 'ltr',
                            })
                          }
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'deliveries' && (
        <PharmacyDeliveriesSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          canManage={canManageDeliveries}
          onRefresh={onRefresh}
        />
      )}

      {subTab === 'invoices' && (
        <PharmacyInvoicesSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          canCollect={canCollectBilling}
          onRefresh={onRefresh}
        />
      )}

      {subTab === 'returns' && (
        <PharmacyReturnsSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          canManage={canManageReturns}
          onRefresh={onRefresh}
        />
      )}

      {/* Pickup Code Verification Modal */}
      {pickupModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setPickupModalOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'التحقق من رمز استلام المريض' : 'Patient Pickup Code Verification'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {isAr
                ? `أدخل رمز الاستلام (مثال PK-123456) المقدم من المريض ${pickupModalOrder.patientName} لإتمام عملية الصرف والخصم الفعلي للمخزون.`
                : `Enter the pickup code shown by ${pickupModalOrder.patientName} to commit stock and issue the order receipt.`}
            </p>
            <input
              type="text"
              value={pickupCodeInput}
              onChange={(e) => setPickupCodeInput(e.target.value.toUpperCase())}
              placeholder="PK-000000"
              dir="ltr"
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3.5 font-latin text-sm font-bold tracking-wider text-slate-900 placeholder:text-slate-400 uppercase dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPickupModalOrder(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
              >
                {pt.common.cancel}
              </button>
              <button
                type="button"
                disabled={busyId === pickupModalOrder.orderId || pickupCodeInput.trim().length < 4}
                onClick={() =>
                  void handleTransition(pickupModalOrder.orderId, 'Completed', {
                    pickupCode: pickupCodeInput.trim(),
                  })
                }
                className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
              >
                {isAr ? 'تأكيد وإكمال الصرف' : 'Verify & Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setRejectModalOrder(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'رفض طلب الصيدلية' : 'Reject Order'}
            </h3>
            <textarea
              rows={3}
              value={rejectReasonInput}
              onChange={(e) => setRejectReasonInput(e.target.value)}
              placeholder={isAr ? 'اذكر سبب الرفض ليظهر للمريض...' : 'Reason shown to the patient...'}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModalOrder(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
              >
                {pt.common.cancel}
              </button>
              <button
                type="button"
                disabled={busyId === rejectModalOrder.orderId || rejectReasonInput.trim().length < 3}
                onClick={() =>
                  void handleTransition(rejectModalOrder.orderId, 'Rejected', {
                    rejectionReason: rejectReasonInput.trim(),
                  })
                }
                className="min-h-[40px] rounded-xl bg-rose-600 px-5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                {isAr ? 'تأكيد الرفض وتحرير المخزون' : 'Confirm Reject & Release Stock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PharmacyPrescriptionsSection({
  firebaseUser,
  workspace,
  language,
  canReview,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canReview: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [clarifications, setClarifications] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDecision = async (
    rx: PharmacyPrescriptionReview,
    status: PharmacyPrescriptionReview['reviewStatus'],
  ) => {
    setBusyId(rx.reviewId);
    setError(null);
    try {
      await reviewPharmacyPrescription(firebaseUser, rx.reviewId, {
        reviewStatus: status,
        pharmacistNote: notes[rx.reviewId] || rx.pharmacistNote,
        clarificationMessage: clarifications[rx.reviewId],
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'REVIEW_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#0c3585]/20 bg-slate-50 px-4 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-200">
        {isAr
          ? 'الوصفات الطبية مقروءة فقط ولا يسمح بتعديل بنود الطبيب أو استبدال الدواء تلقائياً دون استشارة.'
          : 'Prescriptions are immutable clinical records. Request doctor clarification if any item needs adjustment.'}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {workspace.prescriptionReviews.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {pt.common.noData}
        </div>
      ) : (
        <div className="space-y-4">
          {workspace.prescriptionReviews.map((rx) => (
            <article
              key={rx.reviewId}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">
                    {rx.patientName} · {rx.doctorName}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {rx.doctorSpecialty || ''} · {rx.prescribedDate}
                  </p>
                </div>
                <span className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                  {pt.statuses[rx.reviewStatus] || rx.reviewStatus}
                </span>
              </div>

              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rx.medications.map((m, idx) => (
                  <li
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-[#030712]"
                  >
                    <p className="font-bold text-slate-900 dark:text-white">
                      {m.name} {m.dosage ? `(${m.dosage})` : ''}
                    </p>
                    <p className="mt-0.5 text-slate-500">
                      {[m.frequency, m.duration, m.instructions].filter(Boolean).join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>

              {canReview && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2">
                  <input
                    type="text"
                    value={notes[rx.reviewId] ?? rx.pharmacistNote ?? ''}
                    onChange={(e) => setNotes((p) => ({ ...p, [rx.reviewId]: e.target.value }))}
                    placeholder={isAr ? 'ملاحظة الصيدلي السريرية...' : 'Pharmacist note...'}
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <input
                    type="text"
                    value={clarifications[rx.reviewId] ?? rx.clarificationMessage ?? ''}
                    onChange={(e) =>
                      setClarifications((p) => ({ ...p, [rx.reviewId]: e.target.value }))
                    }
                    placeholder={
                      isAr ? 'رسالة توضيح للطبيب المعالج...' : 'Clarification message to doctor...'
                    }
                    className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                </div>
              )}

              {canReview && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === rx.reviewId}
                    onClick={() => void handleDecision(rx, 'Approved')}
                    className="min-h-[36px] rounded-xl bg-[#0c3585] px-3.5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                  >
                    {isAr ? 'اعتماد الوصفة' : 'Approve Rx'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rx.reviewId}
                    onClick={() => void handleDecision(rx, 'Partially Available')}
                    className="min-h-[36px] rounded-xl bg-amber-500 px-3.5 text-xs font-bold text-slate-950 cursor-pointer"
                  >
                    {isAr ? 'متوفرة جزئياً' : 'Partial Available'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rx.reviewId}
                    onClick={() => void handleDecision(rx, 'Clarification Requested')}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378] cursor-pointer"
                  >
                    {isAr ? 'طلب توضيح من الطبيب' : 'Request Doctor Clarification'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === rx.reviewId}
                    onClick={() => void handleDecision(rx, 'Dispensed')}
                    className="medora-gold-button min-h-[36px] rounded-xl px-3.5 text-xs font-bold text-[#040917] cursor-pointer"
                  >
                    {isAr ? 'تم الصرف' : 'Mark Dispensed'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function PharmacyInvoicesSection({
  firebaseUser,
  workspace,
  language,
  canCollect,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canCollect: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const [payingInvoice, setPayingInvoice] = useState<PharmacyInvoiceRecord | null>(null);
  const [amountInput, setAmountInput] = useState(0);
  const [busy, setBusy] = useState(false);

  const handleRecordPayment = async () => {
    if (!payingInvoice || amountInput <= 0) return;
    setBusy(true);
    try {
      await recordPharmacyInvoicePayment(firebaseUser, payingInvoice.invoiceId, {
        amountIqd: amountInput,
        method: payingInvoice.paymentMethod,
      });
      setPayingInvoice(null);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {workspace.invoices.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {pt.common.noData}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-[#030712]/60 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3 text-start">{isAr ? 'رقم الإيصال' : 'Receipt #'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المريض' : 'Patient'}</th>
                  <th className="px-4 py-3 text-center">{pt.common.total}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'المتبقي' : 'Balance'}</th>
                  <th className="px-4 py-3 text-center">{pt.common.status}</th>
                  <th className="px-4 py-3 text-end">{pt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.invoices.map((inv) => (
                  <tr key={inv.invoiceId}>
                    <td
                      className="px-4 py-3 font-latin font-bold text-slate-900 dark:text-white tabular-nums"
                      dir="ltr"
                    >
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {inv.patientName}
                    </td>
                    <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-900 dark:text-white">
                      {formatIqd(inv.totalIqd, isAr)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums text-rose-600 dark:text-rose-400">
                      {formatIqd(inv.balanceDueIqd, isAr)}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-800 dark:text-slate-200">
                      {pt.statuses[inv.status] || inv.status}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            void printMedoraDocument(
                              <PharmacyInvoicePrintSheet invoice={inv} lang={language} />,
                              inv.invoiceNumber,
                              { format: 'a4' },
                            )
                          }
                          aria-label={pt.common.print}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void downloadMedoraPdf({
                              filename: sanitizePdfFilename(inv.invoiceNumber),
                              element: <PharmacyInvoicePrintSheet invoice={inv} lang={language} />,
                              dir: isAr ? 'rtl' : 'ltr',
                            })
                          }
                          aria-label={pt.common.downloadPdf}
                          className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                        >
                          <FileDown className="h-3.5 w-3.5" />
                        </button>
                        {canCollect && inv.balanceDueIqd > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayingInvoice(inv);
                              setAmountInput(inv.balanceDueIqd);
                            }}
                            className="min-h-[32px] rounded-lg bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            {isAr ? 'تأكيد التحصيل عند التسليم' : 'Confirm Collection'}
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
      )}

      {payingInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setPayingInvoice(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-700 dark:bg-[#07122a]"
          >
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'تسجيل تحصيل الطلب الإلكتروني' : 'Record Online Order Collection'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{payingInvoice.invoiceNumber}</p>
            <input
              type="number"
              min={1}
              max={payingInvoice.balanceDueIqd}
              value={amountInput}
              onChange={(e) => setAmountInput(Math.max(0, Number(e.target.value) || 0))}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingInvoice(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
              >
                {pt.common.cancel}
              </button>
              <button
                type="button"
                disabled={busy || amountInput <= 0}
                onClick={() => void handleRecordPayment()}
                className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {isAr ? 'حفظ الدفعة' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PharmacyDeliveriesSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedStaffByDel, setSelectedStaffByDel] = useState<Record<string, string>>({});

  const deliveryStaff = workspace.staff.filter((s) => s.status === 'active');

  const handleUpdate = async (
    deliveryId: string,
    status: 'assigned' | 'out_for_delivery' | 'delivered' | 'failed',
  ) => {
    setBusyId(deliveryId);
    try {
      const staffId = selectedStaffByDel[deliveryId];
      const staff = deliveryStaff.find((s) => (s.uid || s.staffId) === staffId);
      await updatePharmacyDelivery(firebaseUser, deliveryId, {
        status,
        assignedStaffUid: staff?.uid || staff?.staffId,
        assignedStaffName: staff?.fullName,
      });
      await onRefresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {workspace.deliveries.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {pharmacyTranslations[language].common.noData}
        </div>
      ) : (
        <div className="space-y-3">
          {workspace.deliveries.map((del) => (
            <article
              key={del.deliveryId}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-latin text-xs font-bold text-[#0c3585] dark:text-[#f4d378]" dir="ltr">
                    {del.orderNumber}
                  </p>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {del.patientName} · {del.governorate} / {del.district}
                  </h4>
                  <p className="text-xs text-slate-500">{del.address}</p>
                </div>
                <div className="text-end text-xs">
                  <p className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                    {pharmacyTranslations[language].deliveryStatuses[del.status] || del.status}
                  </p>
                  <p className="tabular-nums text-slate-900 dark:text-white">
                    {formatIqd(del.deliveryFeeIqd, isAr)}
                  </p>
                  {del.assignedStaffName && (
                    <p className="text-slate-500 dark:text-slate-400">{del.assignedStaffName}</p>
                  )}
                </div>
              </div>

              {canManage && del.status !== 'delivered' && (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <select
                    value={selectedStaffByDel[del.deliveryId] || del.assignedStaffUid || ''}
                    onChange={(e) =>
                      setSelectedStaffByDel((p) => ({ ...p, [del.deliveryId]: e.target.value }))
                    }
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  >
                    <option value="">{isAr ? 'اختر موظف التوصيل...' : 'Select Courier Staff...'}</option>
                    {deliveryStaff.map((s) => (
                      <option key={s.staffId} value={s.uid || s.staffId}>
                        {s.fullName} ({pharmacyTranslations[language].roles[s.role] || s.role})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyId === del.deliveryId}
                    onClick={() => void handleUpdate(del.deliveryId, 'assigned')}
                    className="min-h-[36px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-100 cursor-pointer"
                  >
                    {isAr ? 'تعيين المندوب' : 'Assign'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === del.deliveryId}
                    onClick={() => void handleUpdate(del.deliveryId, 'out_for_delivery')}
                    className="min-h-[36px] rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                  >
                    {isAr ? 'خرج للتوصيل' : 'Out for Delivery'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === del.deliveryId}
                    onClick={() => void handleUpdate(del.deliveryId, 'delivered')}
                    className="medora-gold-button min-h-[36px] rounded-xl px-3 text-xs font-bold text-[#040917] cursor-pointer"
                  >
                    {isAr ? 'تم التسليم' : 'Delivered'}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function PharmacyReturnsSection({
  firebaseUser,
  workspace,
  language,
  canManage,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [restockRequested, setRestockRequested] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const completedOrders = workspace.orders.filter((o) => o.status === 'Completed');

  const handleSubmitReturn = async (e: FormEvent) => {
    e.preventDefault();
    const order = completedOrders.find((o) => o.orderId === orderId);
    if (!order) return;
    setSubmitting(true);
    setError(null);
    try {
      const items = order.items
        .filter((it) => it.batchAllocations.length > 0)
        .map((it) => ({
          productId: it.productId,
          medicineName: it.medicineName,
          batchId: it.batchAllocations[0].batchId,
          batchNumber: it.batchAllocations[0].batchNumber,
          quantity: it.confirmedQty || it.requestedQty,
          unitPriceIqd: it.unitPriceIqd,
        }));
      await processPharmacyReturn(firebaseUser, {
        orderId: order.orderId,
        reason: reason.trim() || (isAr ? 'مرتجع مريض' : 'Patient return'),
        restockRequested,
        items,
      });
      setOrderId('');
      setReason('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'RETURN_FAILED');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={(e) => void handleSubmitReturn(e)}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? 'تسجيل مرتجع / إرجاع تشغيلة صالحة' : 'Process Medication Return'}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            >
              <option value="">
                {isAr ? 'اختر الطلب المكتمل...' : 'Select Completed Order...'}
              </option>
              {completedOrders.map((o) => (
                <option key={o.orderId} value={o.orderId}>
                  {o.orderNumber} · {o.patientName} ({formatIqd(o.totalIqd, isAr)})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAr ? 'سبب الإرجاع...' : 'Return reason...'}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={restockRequested}
              onChange={(e) => setRestockRequested(e.target.checked)}
              className="accent-[#0c3585]"
            />
            <span>
              {isAr
                ? 'إعادة الكمية إلى المخزون (يتم منع الإرجاع تلقائياً إذا كانت التشغيلة منتهية الصلاحية)'
                : 'Restock into inventory (expired batches are automatically blocked from restock)'}
            </span>
          </label>
          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !orderId}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>{isAr ? 'تسجيل المرتجع' : 'Submit Return'}</span>
          </button>
        </form>
      )}

      <div className="space-y-3">
        {workspace.returns.map((ret) => (
          <div
            key={ret.returnId}
            className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div>
              <p className="font-bold text-slate-900 dark:text-white">
                {ret.orderNumber} · {ret.patientName}
              </p>
              <p className="text-slate-500">{ret.reason}</p>
            </div>
            <span className="font-latin font-bold tabular-nums text-rose-600">
              {formatIqd(ret.totalRefundIqd, isAr)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
