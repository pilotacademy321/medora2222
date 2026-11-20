import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowRightLeft,
  CalendarClock,
  FlaskConical,
  Home,
  PackageMinus,
  Plus,
  RotateCcw,
  Search,
  TestTube2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/medora';
import type {
  HomeCollectionStatus,
  LabHomeCollectionRequest,
  LabOrderRecord,
  LabOrderStatus,
  LabOrderTestLine,
  LabSampleType,
  LabWorkspaceData,
} from '../../types/lab';
import type { FacilityBookingRecord, FacilityBookingStatus } from '../../types/patient';
import { labTranslations } from '../../i18n/labTranslations';
import {
  consumeOrderInventory,
  createLabHomeCollection,
  createLabOrder,
  createLabPatient,
  createLabSample,
  reverseOrderInventory,
  updateLabBooking,
  updateLabHomeCollection,
  updateLabOrderStatus,
  updateLabSample,
} from '../../services/labService';

interface LabOrdersSamplesSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canReception: boolean;
  canSamples: boolean;
  canBookings: boolean;
  canInventory: boolean;
  onRefresh: () => Promise<void>;
  onOpenOrderResult?: (orderId: string) => void;
}

const SAMPLE_TYPES: LabSampleType[] = ['blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'saliva', 'csf', 'other'];

export const LabOrdersSamplesSection: React.FC<LabOrdersSamplesSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canReception,
  canSamples,
  canBookings,
  canInventory,
  onRefresh,
  onOpenOrderResult,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [subTab, setSubTab] = useState<'orders' | 'samples' | 'home' | 'bookings'>('orders');
  const [searchQ, setSearchQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState('');

  // New Order Modal
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState('');
  const [discountIqd, setDiscountIqd] = useState('0');
  const [homeFeeIqd, setHomeFeeIqd] = useState('0');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [sourceHomeCollectionId, setSourceHomeCollectionId] = useState('');

  // Receive Sample Modal
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [sampleOrderId, setSampleOrderId] = useState('');
  const [sampleType, setSampleType] = useState<LabSampleType>('serum');
  const [sampleStatus, setSampleStatus] = useState<'collected' | 'accepted' | 'rejected'>('accepted');
  const [sampleContainerNote, setSampleContainerNote] = useState('');
  const [sampleRejectionReason, setSampleRejectionReason] = useState('');

  // Reject Existing Sample Modal
  const [rejectSampleId, setRejectSampleId] = useState<string | null>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // New Home Collection Modal
  const [homeModalOpen, setHomeModalOpen] = useState(false);
  const [hcPatientName, setHcPatientName] = useState('');
  const [hcPatientPhone, setHcPatientPhone] = useState('');
  const [hcAddress, setHcAddress] = useState('');
  const [hcDate, setHcDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hcWindow, setHcWindow] = useState('09:00 - 12:00');
  const [hcTestsText, setHcTestsText] = useState('');
  const [hcStaffName, setHcStaffName] = useState('');
  const [hcStaffPhone, setHcStaffPhone] = useState('');

  // Assign Staff on Existing Home Collection
  const [assignHc, setAssignHc] = useState<LabHomeCollectionRequest | null>(null);
  const [assignName, setAssignName] = useState('');
  const [assignPhone, setAssignPhone] = useState('');

  const filteredOrders = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return workspace.orders.filter(
      (o) =>
        !q ||
        o.orderNumber.toLowerCase().includes(q) ||
        o.patientName.toLowerCase().includes(q) ||
        o.patientPhone.toLowerCase().includes(q),
    );
  }, [workspace.orders, searchQ]);

  const filteredSamples = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return workspace.samples.filter(
      (s) =>
        !q ||
        s.sampleNumber.toLowerCase().includes(q) ||
        s.orderNumber.toLowerCase().includes(q) ||
        s.patientName.toLowerCase().includes(q),
    );
  }, [workspace.samples, searchQ]);

  const openOrderFromHomeCollection = async (hc: LabHomeCollectionRequest) => {
    setBusyId(hc.requestId);
    try {
      let pat = workspace.patients.find(
        (p) => (hc.patientUid && p.linkedPatientUid === hc.patientUid) || p.phone === hc.patientPhone,
      );
      if (!pat) {
        pat = await createLabPatient(firebaseUser, {
          fullName: hc.patientName,
          phone: hc.patientPhone,
          address: hc.address,
          ...(hc.patientUid ? { linkedPatientUid: hc.patientUid } : {}),
        });
      }
      setSelectedPatientId(pat.patientRecordId);
      const matchedIds = workspace.tests
        .filter((t) =>
          hc.requestedTests.some(
            (rt) => rt.toLowerCase() === t.nameAr.toLowerCase() || rt.toLowerCase() === t.nameEn.toLowerCase(),
          ),
        )
        .map((t) => t.testId);
      setSelectedTestIds(matchedIds);
      setHomeFeeIqd(String(hc.collectionFeeIqd || 0));
      setDiscountIqd('0');
      setSelectedOfferId('');
      setClinicalNotes(hc.notes || '');
      setSourceHomeCollectionId(hc.requestId);
      setOrderModalOpen(true);
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setBusyId(null);
    }
  };

  const applyOfferToOrder = (offerId: string) => {
    setSelectedOfferId(offerId);
    const offer = workspace.offers.find((o) => o.offerId === offerId);
    if (!offer) return;
    if (offer.testIds && offer.testIds.length > 0) {
      setSelectedTestIds(offer.testIds);
      const rawSum = offer.testIds.reduce((s, id) => {
        const t = workspace.tests.find((x) => x.testId === id);
        return s + (t ? t.priceIqd : 0);
      }, 0);
      const disc = Math.max(0, rawSum - offer.offerPriceIqd);
      setDiscountIqd(String(disc));
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientId || selectedTestIds.length === 0 || busyId) return;
    setBusyId('new-order');
    setBannerMsg('');
    try {
      const tests: LabOrderTestLine[] = selectedTestIds
        .map((id) => workspace.tests.find((t) => t.testId === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => ({
          testId: t.testId,
          code: t.code,
          nameAr: t.nameAr,
          nameEn: t.nameEn,
          sampleType: t.sampleType,
          unit: t.unit,
          referenceRangeText: t.referenceRangeText,
          priceIqd: t.priceIqd,
        }));

      const offer = workspace.offers.find((o) => o.offerId === selectedOfferId);
      await createLabOrder(firebaseUser, {
        patientRecordId: selectedPatientId,
        priority,
        tests,
        ...(offer ? { offerId: offer.offerId, offerTitle: offer.title } : {}),
        discountIqd: Number(discountIqd) || 0,
        homeCollectionFeeIqd: Number(homeFeeIqd) || 0,
        clinicalNotes: clinicalNotes.trim(),
        ...(sourceHomeCollectionId ? { sourceHomeCollectionId } : {}),
        autoCreateInvoice: autoInvoice,
      });

      setOrderModalOpen(false);
      setSelectedTestIds([]);
      setSelectedOfferId('');
      setDiscountIqd('0');
      setHomeFeeIqd('0');
      setClinicalNotes('');
      setSourceHomeCollectionId('');
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'CREATE_ORDER_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleOrderStatusChange = async (order: LabOrderRecord, nextStatus: LabOrderStatus) => {
    setBusyId(order.orderId);
    setBannerMsg('');
    try {
      await updateLabOrderStatus(firebaseUser, order.orderId, nextStatus);
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'ORDER_STATUS_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleConsumeInventory = async (orderId: string) => {
    setBusyId(orderId);
    setBannerMsg('');
    try {
      const res = await consumeOrderInventory(firebaseUser, orderId);
      setBannerMsg(
        isAr
          ? `تم صرف ${res.summary.consumedCount} مادة مخزنية حسب وصفات الفحوصات.`
          : `Consumed ${res.summary.consumedCount} inventory item(s) per test recipes.`,
      );
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'INVENTORY_CONSUME_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleReverseInventory = async (orderId: string) => {
    setBusyId(orderId);
    setBannerMsg('');
    try {
      const reason = isAr ? 'إلغاء صرف مواد الطلب من إدارة الطلبات' : 'Manual inventory reversal from order desk';
      await reverseOrderInventory(firebaseUser, orderId, reason);
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'INVENTORY_REVERSE_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sampleOrderId || busyId) return;
    if (sampleStatus === 'rejected' && !sampleRejectionReason.trim()) {
      setBannerMsg(lt.ordersSamples.rejectionReason);
      return;
    }
    setBusyId('new-sample');
    setBannerMsg('');
    try {
      await createLabSample(firebaseUser, {
        orderId: sampleOrderId,
        sampleType,
        containerNote: sampleContainerNote.trim(),
        status: sampleStatus,
        ...(sampleStatus === 'rejected' ? { rejectionReason: sampleRejectionReason.trim() } : {}),
      });
      setSampleModalOpen(false);
      setSampleContainerNote('');
      setSampleRejectionReason('');
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'SAMPLE_CREATE_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleSampleDecision = async (sampleId: string, status: 'accepted' | 'rejected', reason?: string) => {
    setBusyId(sampleId);
    setBannerMsg('');
    try {
      await updateLabSample(firebaseUser, sampleId, {
        status,
        ...(reason ? { rejectionReason: reason } : {}),
      });
      setRejectSampleId(null);
      setRejectReasonText('');
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'SAMPLE_UPDATE_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateHomeCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    const tests = hcTestsText
      .split(/[,\n،]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!hcPatientName.trim() || !hcPatientPhone.trim() || !hcAddress.trim() || tests.length === 0 || busyId) return;
    setBusyId('new-hc');
    try {
      await createLabHomeCollection(firebaseUser, {
        patientName: hcPatientName.trim(),
        patientPhone: hcPatientPhone.trim(),
        address: hcAddress.trim(),
        requestedDate: hcDate,
        preferredWindow: hcWindow.trim(),
        requestedTests: tests,
        assignedStaffName: hcStaffName.trim(),
        assignedStaffPhone: hcStaffPhone.trim(),
      });
      setHomeModalOpen(false);
      setHcPatientName('');
      setHcPatientPhone('');
      setHcAddress('');
      setHcTestsText('');
      setHcStaffName('');
      setHcStaffPhone('');
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'HOME_COLLECTION_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleHcStatus = async (hcId: string, status: HomeCollectionStatus) => {
    setBusyId(hcId);
    try {
      await updateLabHomeCollection(firebaseUser, hcId, { status });
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'HC_UPDATE_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignHc || !assignName.trim()) return;
    setBusyId(assignHc.requestId);
    try {
      await updateLabHomeCollection(firebaseUser, assignHc.requestId, {
        assignedStaffName: assignName.trim(),
        assignedStaffPhone: assignPhone.trim(),
        status: 'assigned',
      });
      setAssignHc(null);
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'HC_ASSIGN_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  const handleBookingAction = async (
    booking: FacilityBookingRecord,
    opts: { status?: FacilityBookingStatus; convertToOrder?: boolean },
  ) => {
    setBusyId(booking.bookingId);
    setBannerMsg('');
    try {
      const res = await updateLabBooking(firebaseUser, booking.bookingId, opts);
      if (res.order) {
        setBannerMsg(
          isAr
            ? `تم تحويل الحجز بنجاح إلى طلب التحليل رقم ${res.order.orderNumber}.`
            : `Converted booking to order ${res.order.orderNumber}.`,
        );
        setSubTab('orders');
      }
      await onRefresh();
    } catch (err) {
      setBannerMsg(err instanceof Error ? err.message : 'BOOKING_UPDATE_FAILED');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.ordersSamples.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'متابعة دورة العمل الكاملة من الحجز والسحب المنزلي إلى الطلب واستلام العينة'
              : 'Full operational desk for lab orders, human sample IDs, home collection & patient bookings'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(canReception || canBookings) && subTab === 'orders' && (
            <button
              type="button"
              onClick={() => setOrderModalOpen(true)}
              className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{lt.ordersSamples.newOrder}</span>
            </button>
          )}
          {canSamples && subTab === 'samples' && (
            <button
              type="button"
              onClick={() => {
                setSampleOrderId(workspace.orders[0]?.orderId || '');
                setSampleModalOpen(true);
              }}
              className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <TestTube2 className="h-4 w-4" />
              <span>{lt.ordersSamples.receiveSample}</span>
            </button>
          )}
          {(canBookings || canReception) && subTab === 'home' && (
            <button
              type="button"
              onClick={() => setHomeModalOpen(true)}
              className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Home className="h-4 w-4" />
              <span>{lt.ordersSamples.newHomeCollection}</span>
            </button>
          )}
        </div>
      </div>

      {bannerMsg && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-2.5 text-xs font-semibold text-[#0c3585] dark:text-blue-300">
          <span>{bannerMsg}</span>
          <button type="button" onClick={() => setBannerMsg('')} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Sub-tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-1 gap-1">
          {[
            { id: 'orders' as const, label: lt.ordersSamples.tabOrders, count: workspace.orders.length, icon: FlaskConical },
            { id: 'samples' as const, label: lt.ordersSamples.tabSamples, count: workspace.samples.length, icon: TestTube2 },
            { id: 'home' as const, label: lt.ordersSamples.tabHomeCollection, count: workspace.homeCollections.length, icon: Home },
            { id: 'bookings' as const, label: lt.ordersSamples.tabBookings, count: workspace.bookings.length, icon: CalendarClock },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                  subTab === t.id
                    ? 'bg-[#0c3585] text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>
                  {t.label} ({t.count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={lt.common.search}
            className="min-h-[42px] w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] ps-9 pe-3 text-xs text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* 1. Test Orders Tab */}
      {subTab === 'orders' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'رقم الطلب' : 'Order No.'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المريض' : 'Patient'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'التحاليل' : 'Tests'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الصافي' : 'Net Amount'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map((ord) => (
                  <tr key={ord.orderId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <div className="font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                        {ord.orderNumber}
                      </div>
                      <div className="text-[11px] text-slate-400 font-latin tabular-nums">
                        {String(ord.createdAt || '').slice(0, 10)} · {ord.priority.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{ord.patientName}</div>
                      <div className="text-[11px] text-slate-500 font-latin" dir="ltr">
                        {ord.patientPhone}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[240px]">
                      <div className="truncate text-slate-700 dark:text-slate-300">
                        {ord.tests.map((t) => t.nameAr).join('، ')}
                      </div>
                      {ord.inventoryConsumedAt && (
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓ {lt.ordersSamples.inventoryConsumed}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-slate-900 dark:text-white">
                      {ord.netAmountIqd.toLocaleString()} {lt.common.iqd}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        disabled={busyId === ord.orderId}
                        value={ord.status}
                        onChange={(e) => void handleOrderStatusChange(ord, e.target.value as LabOrderStatus)}
                        className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                      >
                        <option value="ordered">{lt.status.ordered}</option>
                        <option value="sample_collected">{lt.status.sample_collected}</option>
                        <option value="in_lab">{lt.status.in_lab}</option>
                        <option value="result_entered">{lt.status.result_entered}</option>
                        <option value="approved">{lt.status.approved}</option>
                        <option value="cancelled">{lt.status.cancelled}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {canSamples && (
                          <button
                            type="button"
                            onClick={() => {
                              setSampleOrderId(ord.orderId);
                              setSampleType(ord.tests[0]?.sampleType || 'serum');
                              setSampleModalOpen(true);
                            }}
                            className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            {isAr ? '+ عينة' : '+ Sample'}
                          </button>
                        )}
                        {canInventory && !ord.inventoryConsumedAt && ord.status !== 'cancelled' && (
                          <button
                            type="button"
                            disabled={busyId === ord.orderId}
                            onClick={() => void handleConsumeInventory(ord.orderId)}
                            className="min-h-[34px] rounded-lg border border-amber-200 dark:border-amber-700 px-2.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <PackageMinus className="h-3 w-3" />
                            <span>{lt.ordersSamples.consumeInventory}</span>
                          </button>
                        )}
                        {canInventory && ord.inventoryConsumedAt && (
                          <button
                            type="button"
                            disabled={busyId === ord.orderId}
                            onClick={() => void handleReverseInventory(ord.orderId)}
                            className="min-h-[34px] rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>{lt.ordersSamples.reverseInventory}</span>
                          </button>
                        )}
                        {onOpenOrderResult && (
                          <button
                            type="button"
                            onClick={() => onOpenOrderResult(ord.orderId)}
                            className="min-h-[34px] rounded-lg bg-[#0c3585] px-2.5 text-[11px] font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            {isAr ? 'النتيجة' : 'Result'}
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

      {/* 2. Sample Receiving Tab (Human Numbers ONLY — Zero Barcode/QR) */}
      {subTab === 'samples' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {filteredSamples.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'رقم العينة' : 'Sample No.'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الطلب / المريض' : 'Order / Patient'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.sampleType}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'تاريخ الاستلام' : 'Received'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSamples.map((s) => (
                  <tr key={s.sampleId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                      {s.sampleNumber}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{s.patientName}</div>
                      <div className="text-[11px] font-latin tabular-nums text-slate-500">{s.orderNumber}</div>
                    </td>
                    <td className="px-4 py-3">
                      {lt.sampleTypes[s.sampleType] || s.sampleType}
                      {s.containerNote && <div className="text-[11px] text-slate-500">{s.containerNote}</div>}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums text-slate-600 dark:text-slate-300">
                      {String(s.receivedAt || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          s.status === 'accepted'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : s.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                              : 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                        }`}
                      >
                        {lt.status[s.status] || s.status}
                      </span>
                      {s.rejectionReason && (
                        <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">{s.rejectionReason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canSamples && (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === s.sampleId || s.status === 'accepted'}
                            onClick={() => void handleSampleDecision(s.sampleId, 'accepted')}
                            className="min-h-[34px] rounded-lg border border-emerald-200 dark:border-emerald-800 px-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 disabled:opacity-50 cursor-pointer"
                          >
                            {isAr ? 'قبول' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === s.sampleId || s.status === 'rejected'}
                            onClick={() => {
                              setRejectSampleId(s.sampleId);
                              setRejectReasonText(s.rejectionReason || '');
                            }}
                            className="min-h-[34px] rounded-lg border border-rose-200 dark:border-rose-800 px-2.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300 disabled:opacity-50 cursor-pointer"
                          >
                            {isAr ? 'رفض' : 'Reject'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 3. Home Collection Tab */}
      {subTab === 'home' && (
        <div className="grid gap-3 md:grid-cols-2">
          {workspace.homeCollections.length === 0 ? (
            <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-8 text-center text-sm text-slate-500">
              {lt.common.noData}
            </div>
          ) : (
            workspace.homeCollections.map((hc) => (
              <div
                key={hc.requestId}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{hc.patientName}</h4>
                    <p className="text-xs text-slate-500 font-latin" dir="ltr">
                      {hc.patientPhone}
                    </p>
                  </div>
                  <select
                    disabled={busyId === hc.requestId || !canBookings}
                    value={hc.status}
                    onChange={(e) => void handleHcStatus(hc.requestId, e.target.value as HomeCollectionStatus)}
                    className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[11px] font-semibold text-slate-800 dark:text-slate-200"
                  >
                    <option value="requested">{lt.status.requested}</option>
                    <option value="assigned">{lt.status.assigned}</option>
                    <option value="en_route">{lt.status.en_route}</option>
                    <option value="collected">{lt.status.collected}</option>
                    <option value="completed">{lt.status.completed}</option>
                    <option value="cancelled">{lt.status.cancelled}</option>
                  </select>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div>
                    <strong>{isAr ? 'العنوان:' : 'Address:'}</strong> {hc.address}
                  </div>
                  <div className="font-latin tabular-nums">
                    <strong>{isAr ? 'الموعد:' : 'Window:'}</strong> {hc.requestedDate} · {hc.preferredWindow}
                  </div>
                  <div>
                    <strong>{isAr ? 'التحاليل:' : 'Tests:'}</strong> {hc.requestedTests.join('، ')}
                  </div>
                  {hc.assignedStaffName && (
                    <div>
                      <strong>{lt.ordersSamples.assignStaff}:</strong> {hc.assignedStaffName}{' '}
                      {hc.assignedStaffPhone ? `(${hc.assignedStaffPhone})` : ''}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {canBookings && (
                    <button
                      type="button"
                      onClick={() => {
                        setAssignHc(hc);
                        setAssignName(hc.assignedStaffName || '');
                        setAssignPhone(hc.assignedStaffPhone || '');
                      }}
                      className="min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 px-3 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {lt.ordersSamples.assignStaff}
                    </button>
                  )}
                  {(canReception || canBookings) && !hc.linkedOrderId && (
                    <button
                      type="button"
                      disabled={busyId === hc.requestId}
                      onClick={() => void openOrderFromHomeCollection(hc)}
                      className="min-h-[36px] rounded-lg bg-[#0c3585] px-3 text-[11px] font-bold text-white cursor-pointer"
                    >
                      <ArrowRightLeft className="inline h-3.5 w-3.5 me-1" />
                      {lt.ordersSamples.convertToOrder}
                    </button>
                  )}
                  {hc.linkedOrderId && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ {lt.ordersSamples.alreadyConverted}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 4. Patient Bookings Tab */}
      {subTab === 'bookings' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {workspace.bookings.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'المريض' : 'Patient'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الموعد' : 'Schedule'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'التحاليل المطلوبة' : 'Requested Tests'}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.bookings.map((b) => {
                  const recExt = b as FacilityBookingRecord & { convertedOrderId?: string; convertedOrderNumber?: string };
                  return (
                    <tr key={b.bookingId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{b.patientName}</div>
                        <div className="text-[11px] text-slate-500 font-latin" dir="ltr">
                          {b.patientPhone}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-latin tabular-nums text-slate-700 dark:text-slate-300">
                        {b.date} · {b.time}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="truncate text-slate-700 dark:text-slate-300">
                          {(b.requestedServices || []).join('، ')}
                        </div>
                        {recExt.convertedOrderNumber && (
                          <div className="text-[11px] font-latin font-bold text-emerald-600 dark:text-emerald-400">
                            {lt.ordersSamples.alreadyConverted}: {recExt.convertedOrderNumber}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          disabled={busyId === b.bookingId || !canBookings}
                          value={b.status}
                          onChange={(e) =>
                            void handleBookingAction(b, { status: e.target.value as FacilityBookingStatus })
                          }
                          className="min-h-[34px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[11px] font-semibold"
                        >
                          <option value="pending">{lt.status.pending}</option>
                          <option value="confirmed">{lt.status.confirmed}</option>
                          <option value="in_progress">{lt.status.in_progress}</option>
                          <option value="completed">{lt.status.completed}</option>
                          <option value="rejected">{lt.status.rejected}</option>
                          <option value="cancelled">{lt.status.cancelled}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-end">
                        {(canBookings || canReception) && !recExt.convertedOrderId && b.status !== 'cancelled' && b.status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={busyId === b.bookingId}
                            onClick={() => void handleBookingAction(b, { convertToOrder: true })}
                            className="min-h-[36px] rounded-lg bg-[#0c3585] px-3 text-[11px] font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                          >
                            {lt.ordersSamples.convertToOrder}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal 1: Create New Lab Order */}
      {orderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.ordersSamples.newOrder}</h3>
              <button type="button" onClick={() => setOrderModalOpen(false)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.ordersSamples.selectPatient} *
                  </label>
                  <select
                    required
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                  >
                    <option value="">-- {lt.ordersSamples.selectPatient} --</option>
                    {workspace.patients.map((p) => (
                      <option key={p.patientRecordId} value={p.patientRecordId}>
                        {p.fileNumber} — {p.fullName} ({p.phone})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.ordersSamples.priority}
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'routine' | 'urgent' | 'stat')}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                </div>
              </div>

              {workspace.offers.some((o) => o.isActive) && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.ordersSamples.applyOffer}
                  </label>
                  <select
                    value={selectedOfferId}
                    onChange={(e) => applyOfferToOrder(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                  >
                    <option value="">--</option>
                    {workspace.offers
                      .filter((o) => o.isActive)
                      .map((o) => (
                        <option key={o.offerId} value={o.offerId}>
                          {o.title} ({o.offerPriceIqd.toLocaleString()} {lt.common.iqd})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.ordersSamples.selectTests} * ({selectedTestIds.length})
                </label>
                <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 grid sm:grid-cols-2 gap-1.5">
                  {workspace.tests
                    .filter((t) => t.isActive)
                    .map((t) => (
                      <label
                        key={t.testId}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedTestIds.includes(t.testId)}
                            onChange={() =>
                              setSelectedTestIds((prev) =>
                                prev.includes(t.testId) ? prev.filter((id) => id !== t.testId) : [...prev, t.testId],
                              )
                            }
                            className="h-4 w-4 accent-[#0c3585]"
                          />
                          <span className="truncate">{t.nameAr}</span>
                        </span>
                        <span className="font-latin tabular-nums text-[11px] font-bold shrink-0">
                          {t.priceIqd.toLocaleString()}
                        </span>
                      </label>
                    ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.ordersSamples.discountIqd}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={discountIqd}
                    onChange={(e) => setDiscountIqd(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.ordersSamples.homeFeeIqd}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={homeFeeIqd}
                    onChange={(e) => setHomeFeeIqd(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.common.notes}
                </label>
                <input
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInvoice}
                  onChange={(e) => setAutoInvoice(e.target.checked)}
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{lt.ordersSamples.autoInvoice}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOrderModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busyId === 'new-order' || !selectedPatientId || selectedTestIds.length === 0}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
                >
                  {busyId === 'new-order' ? lt.common.saving : lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Receive Sample */}
      {sampleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.ordersSamples.receiveSample}</h3>
              <button type="button" onClick={() => setSampleModalOpen(false)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSample} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">{lt.results.selectOrder} *</label>
                <select
                  required
                  value={sampleOrderId}
                  onChange={(e) => setSampleOrderId(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                >
                  <option value="">--</option>
                  {workspace.orders.map((o) => (
                    <option key={o.orderId} value={o.orderId}>
                      {o.orderNumber} — {o.patientName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div>
                  <label className="block font-semibold mb-1">{lt.catalog.sampleType}</label>
                  <select
                    value={sampleType}
                    onChange={(e) => setSampleType(e.target.value as LabSampleType)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                  >
                    {SAMPLE_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {lt.sampleTypes[st] || st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{isAr ? 'قرار الفرز' : 'Decision'}</label>
                  <select
                    value={sampleStatus}
                    onChange={(e) => setSampleStatus(e.target.value as 'collected' | 'accepted' | 'rejected')}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                  >
                    <option value="accepted">{lt.status.accepted}</option>
                    <option value="collected">{lt.status.collected}</option>
                    <option value="rejected">{lt.status.rejected}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'ملاحظة الأنبوب / العينة' : 'Container Note'}</label>
                <input
                  value={sampleContainerNote}
                  onChange={(e) => setSampleContainerNote(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
              </div>
              {sampleStatus === 'rejected' && (
                <div>
                  <label className="block font-semibold text-rose-600 mb-1">{lt.ordersSamples.rejectionReason} *</label>
                  <input
                    required
                    value={sampleRejectionReason}
                    onChange={(e) => setSampleRejectionReason(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-rose-300 bg-white dark:bg-slate-900 px-3"
                  />
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSampleModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={busyId === 'new-sample'}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 font-bold cursor-pointer"
                >
                  {lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Reject Sample Reason */}
      {rejectSampleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-3 text-xs">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{lt.ordersSamples.rejectionReason}</h3>
            <input
              value={rejectReasonText}
              onChange={(e) => setRejectReasonText(e.target.value)}
              placeholder={isAr ? 'مثال: عينة متحللة / كمية غير كافية' : 'e.g. Hemolyzed or insufficient volume'}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectSampleId(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button
                type="button"
                disabled={!rejectReasonText.trim()}
                onClick={() => void handleSampleDecision(rejectSampleId, 'rejected', rejectReasonText.trim())}
                className="min-h-[38px] rounded-xl bg-rose-600 px-4 font-bold text-white cursor-pointer disabled:opacity-50"
              >
                {lt.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Create Home Collection */}
      {homeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {lt.ordersSamples.newHomeCollection}
              </h3>
              <button type="button" onClick={() => setHomeModalOpen(false)} className="cursor-pointer text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateHomeCollection} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  required
                  value={hcPatientName}
                  onChange={(e) => setHcPatientName(e.target.value)}
                  placeholder={`${lt.patients.fullName} *`}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
                <input
                  required
                  value={hcPatientPhone}
                  onChange={(e) => setHcPatientPhone(e.target.value)}
                  placeholder={`${lt.patients.phone} *`}
                  dir="ltr"
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                />
              </div>
              <input
                required
                value={hcAddress}
                onChange={(e) => setHcAddress(e.target.value)}
                placeholder={`${lt.patients.address} *`}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="date"
                  required
                  value={hcDate}
                  onChange={(e) => setHcDate(e.target.value)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                />
                <input
                  value={hcWindow}
                  onChange={(e) => setHcWindow(e.target.value)}
                  placeholder="09:00 - 12:00"
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
              </div>
              <textarea
                required
                rows={2}
                value={hcTestsText}
                onChange={(e) => setHcTestsText(e.target.value)}
                placeholder={isAr ? 'التحاليل المطلوبة (مفصولة بفاصلة)... *' : 'Requested tests (comma separated)... *'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={hcStaffName}
                  onChange={(e) => setHcStaffName(e.target.value)}
                  placeholder={lt.ordersSamples.assignStaff}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
                />
                <input
                  value={hcStaffPhone}
                  onChange={(e) => setHcStaffPhone(e.target.value)}
                  placeholder={lt.ordersSamples.staffPhone}
                  dir="ltr"
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHomeModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button type="submit" className="medora-gold-button min-h-[42px] rounded-xl px-5 font-bold cursor-pointer">
                  {lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Assign Staff to Home Collection */}
      {assignHc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveAssignStaff}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl space-y-3 text-xs"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{lt.ordersSamples.assignStaff}</h3>
            <input
              required
              value={assignName}
              onChange={(e) => setAssignName(e.target.value)}
              placeholder={lt.ordersSamples.assignStaff}
              className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3"
            />
            <input
              value={assignPhone}
              onChange={(e) => setAssignPhone(e.target.value)}
              placeholder={lt.ordersSamples.staffPhone}
              dir="ltr"
              className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 font-latin"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAssignHc(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 cursor-pointer"
              >
                {lt.common.cancel}
              </button>
              <button type="submit" className="medora-gold-button min-h-[38px] rounded-xl px-4 font-bold cursor-pointer">
                {lt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
