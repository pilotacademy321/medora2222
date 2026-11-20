import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  Package,
  Pill,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import {
  cancelPatientPharmacyOrder,
  confirmPatientPharmacyOrderReceipt,
  fetchPatientPharmacyOrders,
  fetchPublicPharmacyStorefrontDetail,
  fetchPublicPharmacyStorefronts,
  PriceChangedConflictError,
  searchIndividualMedicinesForPatient,
  searchMedicineFinder,
  sendPatientPharmacyMessage,
  submitPatientPharmacyOrder,
  type MedicineFinderSearchResponse,
} from '../../services/medicineFinderService';
import { fetchScopedReceipts, recordReceiptReprint } from '../../services/commerceService';
import type { MedoraReceiptRecord } from '../../types/commerce';
import { printMedoraDocument } from '../../utils/printAndPdf';
import { UnifiedReceiptPrintSheet } from '../shared/MedoraPrintableDocument';
import type { Language } from '../../types/medora';
import type { PatientWorkspaceData } from '../../types/patient';
import type {
  MedicineFinderPharmacyOffer,
  PatientIndividualMedicineOffer,
  PatientPharmacyOrderStatus,
  PharmacyCommunicationMessage,
  PharmacyOrderRecord,
  PublicPharmacyCard,
  PublicPharmacyStorefrontData,
} from '../../types/pharmacy';
import { PharmacyLogoAvatar } from '../pharmacy/PharmacyBrandUtils';
import { PharmacyPublicStorefront } from '../pharmacy/PharmacyPublicStorefront';

interface PatientMedicineFinderSectionProps {
  firebaseUser: User;
  workspace: PatientWorkspaceData;
  language: Language;
  initialPrescriptionId?: string | null;
  onConsumedInitialPrescription?: () => void;
  initialStorefrontId?: string | null;
  onConsumedInitialStorefront?: () => void;
}

const CANCELLABLE_ORDER_STATUSES: PatientPharmacyOrderStatus[] = [
  'Submitted',
  'Under Pharmacist Review',
  'Accepted',
  'Partially Accepted',
];

function formatIqd(value: number, isAr: boolean): string {
  return `${Math.round(value || 0).toLocaleString()} ${isAr ? 'د.ع' : 'IQD'}`;
}

export function PatientMedicineFinderSection({
  firebaseUser,
  workspace,
  language,
  initialPrescriptionId,
  onConsumedInitialPrescription,
  initialStorefrontId,
  onConsumedInitialStorefront,
}: PatientMedicineFinderSectionProps) {
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'finder' | 'pharmacies' | 'orders'>(
    initialStorefrontId ? 'pharmacies' : 'finder',
  );
  const [searchMode, setSearchMode] = useState<'prescription' | 'manual' | 'single_drug'>(
    workspace.prescriptions.length > 0 ? 'prescription' : 'single_drug',
  );
  const [selectedPrescriptionId, setSelectedPrescriptionId] = useState<string>(
    initialPrescriptionId || workspace.prescriptions[0]?.prescriptionId || '',
  );
  const [manualItems, setManualItems] = useState<
    Array<{ id: string; name: string; dosage: string; quantity: number }>
  >([{ id: 'row-1', name: '', dosage: '', quantity: 1 }]);
  const [singleDrugQuery, setSingleDrugQuery] = useState('');
  const [singleOffers, setSingleOffers] = useState<PatientIndividualMedicineOffer[] | null>(null);
  const [selectedSingleOffer, setSelectedSingleOffer] =
    useState<PatientIndividualMedicineOffer | null>(null);
  const [singleOrderQty, setSingleOrderQty] = useState(1);
  const [singleOrderRxId, setSingleOrderRxId] = useState<string>(
    workspace.prescriptions[0]?.prescriptionId || '',
  );

  const [governorate, setGovernorate] = useState<string>(
    workspace.patientProfile?.governorate || workspace.userAccount.governorate || '',
  );
  const [district, setDistrict] = useState<string>(
    workspace.patientProfile?.district || workspace.userAccount.district || '',
  );

  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<MedicineFinderSearchResponse | null>(null);

  // Approved Pharmacy Storefronts directory + detail view
  const [storefronts, setStorefronts] = useState<PublicPharmacyCard[]>([]);
  const [loadingStorefronts, setLoadingStorefronts] = useState(false);
  const [storefrontQuery, setStorefrontQuery] = useState('');
  const [selectedStorefront, setSelectedStorefront] =
    useState<PublicPharmacyStorefrontData | null>(null);
  const [loadingStorefrontDetail, setLoadingStorefrontDetail] = useState(false);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);

  // Order composer modal/panel state
  const [selectedOffer, setSelectedOffer] = useState<MedicineFinderPharmacyOffer | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_pickup' | 'cash_on_delivery'>(
    'cash_on_pickup',
  );
  const [deliveryAddress, setDeliveryAddress] = useState<string>(
    workspace.patientProfile?.address || '',
  );
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [priceConflict, setPriceConflict] = useState<{
    freshSubtotalIqd: number;
    freshDeliveryFeeIqd: number;
    freshTotalIqd: number;
  } | null>(null);
  const [clientRequestKey, setClientRequestKey] = useState<string>('');
  const [orderNotice, setOrderNotice] = useState<string | null>(null);

  // Patient pharmacy orders + messaging
  const [orders, setOrders] = useState<PharmacyOrderRecord[]>([]);
  const [communications, setCommunications] = useState<PharmacyCommunicationMessage[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [sendingMsgOrderId, setSendingMsgOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const [patientReceipts, setPatientReceipts] = useState<MedoraReceiptRecord[]>([]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const [data, rcpts] = await Promise.all([
        fetchPatientPharmacyOrders(firebaseUser),
        fetchScopedReceipts(firebaseUser, { transactionType: 'pharmacy_to_patient' }).catch(() => []),
      ]);
      setOrders(data.orders);
      setCommunications(data.communications);
      setPatientReceipts(rcpts);
    } catch {
      // Keep non-blocking
    } finally {
      setLoadingOrders(false);
    }
  }, [firebaseUser]);

  const loadStorefronts = useCallback(
    async (gov?: string, q?: string) => {
      setLoadingStorefronts(true);
      setStorefrontError(null);
      try {
        const list = await fetchPublicPharmacyStorefronts(firebaseUser, {
          governorate: gov || undefined,
          q: q?.trim() || undefined,
        });
        setStorefronts(list);
      } catch (err) {
        setStorefrontError(err instanceof Error ? err.message : 'STOREFRONTS_LOAD_FAILED');
      } finally {
        setLoadingStorefronts(false);
      }
    },
    [firebaseUser],
  );

  const openStorefrontDetail = useCallback(
    async (identifier: string) => {
      setLoadingStorefrontDetail(true);
      setStorefrontError(null);
      try {
        const detail = await fetchPublicPharmacyStorefrontDetail(firebaseUser, identifier);
        setSelectedStorefront(detail);
      } catch (err) {
        setStorefrontError(err instanceof Error ? err.message : 'PHARMACY_STOREFRONT_NOT_FOUND');
      } finally {
        setLoadingStorefrontDetail(false);
      }
    },
    [firebaseUser],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (activeTab === 'pharmacies' && storefronts.length === 0 && !loadingStorefronts) {
      void loadStorefronts(governorate, storefrontQuery);
    }
  }, [activeTab, storefronts.length, loadingStorefronts, loadStorefronts, governorate, storefrontQuery]);

  useEffect(() => {
    if (initialPrescriptionId) {
      setSearchMode('prescription');
      setSelectedPrescriptionId(initialPrescriptionId);
      setActiveTab('finder');
      onConsumedInitialPrescription?.();
    }
  }, [initialPrescriptionId, onConsumedInitialPrescription]);

  useEffect(() => {
    if (initialStorefrontId) {
      setActiveTab('pharmacies');
      void openStorefrontDetail(initialStorefrontId);
      onConsumedInitialStorefront?.();
    }
  }, [initialStorefrontId, openStorefrontDetail, onConsumedInitialStorefront]);

  const handleRunSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    setSearchError(null);
    setSelectedOffer(null);
    setSelectedSingleOffer(null);
    setPriceConflict(null);

    if (searchMode === 'single_drug') {
      const q = singleDrugQuery.trim();
      if (q.length < 2) {
        setSearchError(
          isAr ? 'أدخل حرفين على الأقل للبحث عن الدواء.' : 'Enter at least 2 characters to search.',
        );
        return;
      }
      setSearching(true);
      try {
        const offers = await searchIndividualMedicinesForPatient(firebaseUser, {
          q,
          governorate: governorate || undefined,
          inStockOnly: true,
        });
        setSingleOffers(offers);
        setSearchResult(null);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'SEARCH_FAILED');
      } finally {
        setSearching(false);
      }
      return;
    }

    if (searchMode === 'prescription' && !selectedPrescriptionId) {
      setSearchError(
        isAr ? 'يرجى اختيار وصفة طبية للبحث في الصيدليات.' : 'Please select a prescription to search.',
      );
      return;
    }

    const validManual = manualItems.filter((item) => item.name.trim().length > 0);
    if (searchMode === 'manual' && validManual.length === 0) {
      setSearchError(
        isAr ? 'أدخل اسم دواء واحد على الأقل للبحث.' : 'Enter at least one medicine name.',
      );
      return;
    }

    setSearching(true);
    try {
      const res = await searchMedicineFinder(firebaseUser, {
        prescriptionId: searchMode === 'prescription' ? selectedPrescriptionId : undefined,
        items:
          searchMode === 'manual'
            ? validManual.map((m) => ({
                name: m.name.trim(),
                dosage: m.dosage.trim() || undefined,
                quantity: Math.max(1, Number(m.quantity || 1)),
              }))
            : undefined,
        governorate: governorate || undefined,
        district: district.trim() || undefined,
      });
      setSearchResult(res);
      setSingleOffers(null);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'SEARCH_FAILED');
    } finally {
      setSearching(false);
    }
  };

  const openOrderComposer = (offer: MedicineFinderPharmacyOffer) => {
    const canDeliver = offer.deliveryAvailable && offer.deliverySupportedForDistrict;
    const defaultFulfillment: 'pickup' | 'delivery' = offer.pickupAvailable
      ? 'pickup'
      : canDeliver
        ? 'delivery'
        : 'pickup';
    const defaultPayment: 'cash_on_pickup' | 'cash_on_delivery' =
      defaultFulfillment === 'delivery' && offer.acceptedPaymentMethods.includes('cash_on_delivery')
        ? 'cash_on_delivery'
        : offer.acceptedPaymentMethods[0] || 'cash_on_pickup';

    setSelectedSingleOffer(null);
    setSelectedOffer(offer);
    setFulfillmentType(defaultFulfillment);
    setPaymentMethod(defaultPayment);
    setOrderError(null);
    setPriceConflict(null);
    setClientRequestKey(`rx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const openSingleOfferComposer = (offer: PatientIndividualMedicineOffer) => {
    const defaultFulfillment: 'pickup' | 'delivery' = offer.pickupAvailable
      ? 'pickup'
      : offer.deliveryAvailable
        ? 'delivery'
        : 'pickup';
    const defaultPayment: 'cash_on_pickup' | 'cash_on_delivery' =
      defaultFulfillment === 'delivery'
        ? 'cash_on_delivery'
        : offer.acceptedPaymentMethods.includes('cash_on_pickup')
          ? 'cash_on_pickup'
          : offer.acceptedPaymentMethods[0] || 'cash_on_pickup';

    setSelectedOffer(null);
    setSelectedSingleOffer(offer);
    setSingleOrderQty(1);
    setSingleOrderRxId(workspace.prescriptions[0]?.prescriptionId || '');
    setFulfillmentType(defaultFulfillment);
    setPaymentMethod(defaultPayment);
    setOrderError(null);
    setPriceConflict(null);
    setClientRequestKey(`drug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const submitSingleOfferOrderRequest = async (confirmedFreshTotal?: number) => {
    if (!selectedSingleOffer) return;
    setOrderError(null);

    if ((selectedSingleOffer.requiresPrescription || selectedSingleOffer.controlledDrug) && !singleOrderRxId) {
      setOrderError(
        isAr
          ? 'هذا الدواء يتطلب وصفة طبية معتمدة من طبيبك لإتمام الطلب.'
          : 'A verified prescription is required to order this medication.',
      );
      return;
    }

    if (fulfillmentType === 'delivery' && deliveryAddress.trim().length < 4) {
      setOrderError(
        isAr ? 'يرجى إدخال عنوان التوصيل التفصيلي.' : 'Please enter your delivery address.',
      );
      return;
    }

    const qty = Math.max(1, Math.min(selectedSingleOffer.availableQty || 1, singleOrderQty));
    const expectedTotalIqd = confirmedFreshTotal ?? selectedSingleOffer.effectivePriceIqd * qty;

    setSubmittingOrder(true);
    try {
      const { order } = await submitPatientPharmacyOrder(firebaseUser, {
        pharmacyUid: selectedSingleOffer.pharmacyUid,
        prescriptionId: singleOrderRxId || undefined,
        fulfillmentType,
        paymentMethod,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        deliveryGovernorate: governorate || selectedSingleOffer.governorate,
        deliveryDistrict: district.trim() || selectedSingleOffer.district,
        expectedTotalIqd,
        clientRequestKey: clientRequestKey || `drug-${Date.now()}`,
        items: [{ productId: selectedSingleOffer.productId, quantity: qty }],
      });
      setSelectedSingleOffer(null);
      setPriceConflict(null);
      setOrderNotice(
        isAr
          ? `تم إرسال طلبك رقم ${order.orderNumber} بنجاح إلى ${order.pharmacyName}.`
          : `Order ${order.orderNumber} submitted to ${order.pharmacyName}.`,
      );
      await loadOrders();
      setActiveTab('orders');
    } catch (err) {
      if (err instanceof PriceChangedConflictError) {
        setPriceConflict({
          freshSubtotalIqd: err.freshSubtotalIqd,
          freshDeliveryFeeIqd: err.freshDeliveryFeeIqd,
          freshTotalIqd: err.freshTotalIqd,
        });
      } else {
        setOrderError(err instanceof Error ? err.message : 'ORDER_FAILED');
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  const submitOrderRequest = async (confirmedFreshTotal?: number) => {
    if (!selectedOffer) return;
    setOrderError(null);
    const matchedItems = selectedOffer.items
      .filter((i) => i.matched && i.matchedProductId)
      .map((i) => ({
        productId: i.matchedProductId!,
        quantity: i.requestedQuantity,
      }));
    if (matchedItems.length === 0) {
      setOrderError(
        isAr ? 'لا توجد أصناف متوفرة في هذه الصيدلية.' : 'No matched items available in this pharmacy.',
      );
      return;
    }

    if (fulfillmentType === 'delivery' && deliveryAddress.trim().length < 4) {
      setOrderError(
        isAr ? 'يرجى إدخال عنوان التوصيل التفصيلي.' : 'Please enter your delivery address.',
      );
      return;
    }

    const expectedTotalIqd =
      confirmedFreshTotal ??
      selectedOffer.estimatedSubtotalIqd +
        (fulfillmentType === 'delivery' ? selectedOffer.deliveryFeeIqd : 0);

    setSubmittingOrder(true);
    try {
      const { order } = await submitPatientPharmacyOrder(firebaseUser, {
        pharmacyUid: selectedOffer.pharmacyUid,
        prescriptionId: searchResult?.prescription?.prescriptionId,
        fulfillmentType,
        paymentMethod,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        deliveryGovernorate: governorate || selectedOffer.governorate,
        deliveryDistrict: district.trim() || selectedOffer.district,
        expectedTotalIqd,
        clientRequestKey: clientRequestKey || `rx-${Date.now()}`,
        items: matchedItems,
      });
      setSelectedOffer(null);
      setPriceConflict(null);
      setOrderNotice(
        isAr
          ? `تم إرسال طلبك رقم ${order.orderNumber} بنجاح إلى ${order.pharmacyName}.`
          : `Order ${order.orderNumber} submitted to ${order.pharmacyName}.`,
      );
      await loadOrders();
      setActiveTab('orders');
    } catch (err) {
      if (err instanceof PriceChangedConflictError) {
        setPriceConflict({
          freshSubtotalIqd: err.freshSubtotalIqd,
          freshDeliveryFeeIqd: err.freshDeliveryFeeIqd,
          freshTotalIqd: err.freshTotalIqd,
        });
      } else {
        setOrderError(err instanceof Error ? err.message : 'ORDER_FAILED');
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    setCancellingOrderId(orderId);
    try {
      await cancelPatientPharmacyOrder(
        firebaseUser,
        orderId,
        isAr ? 'إلغاء من قبل المريض' : 'Cancelled by patient',
      );
      await loadOrders();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'CANCEL_FAILED');
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleConfirmPatientReceipt = async (orderId: string) => {
    setConfirmingOrderId(orderId);
    setOrderError(null);
    try {
      const res = await confirmPatientPharmacyOrderReceipt(firebaseUser, orderId);
      setOrders((prev) => prev.map((o) => (o.orderId === orderId ? res.order : o)));
      if (res.receipt) {
        setPatientReceipts((prev) => [
          res.receipt!,
          ...prev.filter((r) => r.receiptId !== res.receipt!.receiptId),
        ]);
      }
      setOrderNotice(
        isAr
          ? `تم تأكيد استلام طلبك وإصدار الإيصال الموحد${res.receipt ? ` (${res.receipt.receiptNumber})` : ''}.`
          : `Order receipt confirmed${res.receipt ? ` (${res.receipt.receiptNumber})` : ''}.`,
      );
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'CONFIRM_RECEIPT_FAILED');
    } finally {
      setConfirmingOrderId(null);
    }
  };

  const handlePrintPatientReceipt = (order: PharmacyOrderRecord) => {
    const found = patientReceipts.find((r) => r.orderId === order.orderId);
    if (!found) return;
    void printMedoraDocument(
      <UnifiedReceiptPrintSheet receipt={found} lang={language} />,
      found.receiptNumber,
      {
        onPrintAction: async () => {
          await recordReceiptReprint(firebaseUser, found.receiptId).catch(() => undefined);
        },
      },
    );
  };

  const handleSendMessage = async (orderId: string) => {
    const text = (messageDrafts[orderId] || '').trim();
    if (!text) return;
    setSendingMsgOrderId(orderId);
    try {
      await sendPatientPharmacyMessage(firebaseUser, orderId, text);
      setMessageDrafts((prev) => ({ ...prev, [orderId]: '' }));
      await loadOrders();
    } finally {
      setSendingMsgOrderId(null);
    }
  };

  const selectedPrescription = useMemo(
    () => workspace.prescriptions.find((p) => p.prescriptionId === selectedPrescriptionId) || null,
    [workspace.prescriptions, selectedPrescriptionId],
  );

  const commsByOrder = useMemo(() => {
    const map: Record<string, PharmacyCommunicationMessage[]> = {};
    for (const msg of communications) {
      if (!msg.relatedId) continue;
      if (!map[msg.relatedId]) map[msg.relatedId] = [];
      map[msg.relatedId].push(msg);
    }
    return map;
  }, [communications]);

  const statusLabel = (st: PatientPharmacyOrderStatus): string => {
    const map: Record<PatientPharmacyOrderStatus, { ar: string; en: string }> = {
      Draft: { ar: 'مسودة', en: 'Draft' },
      Submitted: { ar: 'مُرسل للصيدلية', en: 'Submitted' },
      'Under Pharmacist Review': { ar: 'قيد مراجعة الصيدلي', en: 'Under Pharmacist Review' },
      Accepted: { ar: 'مقبول', en: 'Accepted' },
      'Partially Accepted': { ar: 'مقبول جزئياً', en: 'Partially Accepted' },
      Rejected: { ar: 'مرفوض', en: 'Rejected' },
      Preparing: { ar: 'قيد التجهيز', en: 'Preparing' },
      'Ready for Pickup': { ar: 'جاهز للاستلام', en: 'Ready for Pickup' },
      'Out for Delivery': { ar: 'خرج للتوصيل', en: 'Out for Delivery' },
      Completed: { ar: 'مكتمل', en: 'Completed' },
      Cancelled: { ar: 'ملغي', en: 'Cancelled' },
      Expired: { ar: 'منتهي المهلة', en: 'Expired' },
    };
    return isAr ? map[st]?.ar || st : map[st]?.en || st;
  };

  return (
    <div className="space-y-6">
      {/* Header + Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isAr ? 'مكتشف الأدوية والصيدليات' : 'MEDORA Medicine Finder'}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'ابحث في المخزون الفعلي غير منتهي الصلاحية للصيدليات المعتمدة واطلب وصفتك أو أدويتك مباشرة.'
              : 'Search verified unexpired pharmacy stock across approved MEDORA pharmacies and order directly.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => {
              setSelectedStorefront(null);
              setActiveTab('finder');
            }}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'finder'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {isAr ? 'بحث في الصيدليات' : 'Search Medicines'}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pharmacies')}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-4 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'pharmacies'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Store className="h-3.5 w-3.5" />
            <span>{isAr ? 'الصيدليات المعتمدة' : 'Approved Pharmacies'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedStorefront(null);
              setActiveTab('orders');
            }}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'orders'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            {isAr ? `طلباتي الصيدلانية (${orders.length})` : `My Pharmacy Orders (${orders.length})`}
          </button>
        </div>
      </div>

      {orderNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span>{orderNotice}</span>
          <button type="button" onClick={() => setOrderNotice(null)} className="underline cursor-pointer">
            {isAr ? 'إغلاق' : 'Dismiss'}
          </button>
        </div>
      )}

      {activeTab === 'finder' && (
        <div className="space-y-6">
          {/* Search Criteria Card */}
          <form
            onSubmit={(e) => void handleRunSearch(e)}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setSearchMode('single_drug')}
                  className={`min-h-[36px] rounded-lg px-3.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    searchMode === 'single_drug'
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isAr ? 'بحث عن دواء ومقارنة الأسعار' : 'Search Drug & Compare Prices'}
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('prescription')}
                  className={`min-h-[36px] rounded-lg px-3.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    searchMode === 'prescription'
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isAr ? 'من وصفة الطبيب' : 'From Doctor Prescription'}
                </button>
                <button
                  type="button"
                  onClick={() => setSearchMode('manual')}
                  className={`min-h-[36px] rounded-lg px-3.5 text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    searchMode === 'manual'
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {isAr ? 'قائمة أدوية مخصصة' : 'Multi-Drug List'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">{isAr ? 'جميع المحافظات' : 'All Governorates'}</option>
                  {IRAQ_GOVERNORATES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {isAr ? g.ar : g.en}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder={isAr ? 'القضاء / المنطقة (للتوصيل)' : 'District / Area (optional)'}
                  className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            </div>

            {searchMode === 'single_drug' ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr
                    ? 'ابحث عن دواء بالاسم العلمي أو التجاري أو المادة الفعالة أو الباركود'
                    : 'Search medicine by scientific/brand name, active ingredient, or barcode'}
                </label>
                <input
                  type="text"
                  value={singleDrugQuery}
                  onChange={(e) => setSingleDrugQuery(e.target.value)}
                  placeholder={
                    isAr
                      ? 'مثال: Amoxicillin أو Augmentin أو Paracetamol...'
                      : 'e.g. Amoxicillin, Augmentin, Paracetamol...'
                  }
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            ) : searchMode === 'prescription' ? (
              workspace.prescriptions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isAr
                    ? 'لا توجد وصفات طبية مسجلة في حسابك حالياً. يمكنك البحث المباشر عن الدواء.'
                    : 'No doctor prescriptions found on your account yet. Switch to single drug search.'}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                    {isAr ? 'اختر الوصفة الطبية المعتمدة' : 'Select Approved Doctor Prescription'}
                  </label>
                  <select
                    value={selectedPrescriptionId}
                    onChange={(e) => setSelectedPrescriptionId(e.target.value)}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {workspace.prescriptions.map((rx) => (
                      <option key={rx.prescriptionId} value={rx.prescriptionId}>
                        {rx.prescribedDate} · {rx.doctorName} ({rx.medications.length}{' '}
                        {isAr ? 'أدوية' : 'items'})
                      </option>
                    ))}
                  </select>

                  {selectedPrescription && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {isAr ? 'الأدوية المدرجة في الوصفة' : 'Prescribed Medications'}
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {selectedPrescription.medications.map((m, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1.5 text-xs last:border-b-0 dark:border-slate-800"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">{m.name}</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {[m.dosage, m.duration].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="space-y-3">
                {manualItems.map((row, idx) => (
                  <div key={row.id} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          setManualItems((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, name: e.target.value } : r)),
                          )
                        }
                        placeholder={
                          isAr
                            ? `اسم الدواء #${idx + 1} (مثال: Amoxicillin)`
                            : `Medicine #${idx + 1} (e.g. Amoxicillin)`
                        }
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={row.dosage}
                        onChange={(e) =>
                          setManualItems((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, dosage: e.target.value } : r)),
                          )
                        }
                        placeholder={isAr ? 'التركيز / العيار (مثال: 500mg)' : 'Strength (e.g. 500mg)'}
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={row.quantity}
                        onChange={(e) =>
                          setManualItems((prev) =>
                            prev.map((r) =>
                              r.id === row.id
                                ? { ...r, quantity: Math.max(1, Number(e.target.value) || 1) }
                                : r,
                            ),
                          )
                        }
                        className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="flex items-center justify-end sm:col-span-1">
                      {manualItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setManualItems((prev) => prev.filter((r) => r.id !== row.id))
                          }
                          aria-label={isAr ? 'حذف' : 'Remove'}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setManualItems((prev) => [
                      ...prev,
                      { id: `row-${Date.now()}`, name: '', dosage: '', quantity: 1 },
                    ])
                  }
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{isAr ? 'إضافة دواء آخر' : 'Add Another Medicine'}</span>
                </button>
              </div>
            )}

            {searchError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                {searchError}
              </div>
            )}

            <div className="flex items-center justify-end">
              <button
                type="submit"
                disabled={searching}
                className="medora-gold-button inline-flex min-h-[44px] items-center gap-2 rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                <Search className="h-4 w-4" />
                <span>
                  {searching
                    ? isAr
                      ? 'جاري فحص الصيدليات المعتمدة...'
                      : 'Checking Verified Pharmacies...'
                    : isAr
                      ? 'بحث عن توفر الأدوية والأسعار'
                      : 'Check Availability & Pricing'}
                </span>
              </button>
            </div>
          </form>

          {/* Single Drug Price Comparison Results */}
          {singleOffers && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr
                    ? `عروض الصيدليات المعتمدة مرتبة حسب السعر (${singleOffers.length})`
                    : `Approved Pharmacy Offers Sorted by Price (${singleOffers.length})`}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'الأصناف المنشورة وذات التشغيلات الصالحة غير المنتهية فقط'
                    : 'Published & unexpired pharmacy stock only'}
                </span>
              </div>

              {singleOffers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
                  {isAr
                    ? 'لا توجد صيدليات معتمدة توفر هذا الدواء حالياً وفق الفلترة المحددة.'
                    : 'No approved pharmacies currently stock this medicine matching your filters.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {singleOffers.map((off, idx) => (
                    <article
                      key={`${off.pharmacyUid}-${off.productId}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {off.brandName
                                ? `${off.brandName} (${off.scientificName})`
                                : off.scientificName}
                            </h4>
                            {idx === 0 && (
                              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                {isAr ? '· الأقل سعراً' : '· Lowest Price'}
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {off.activeIngredient} · {off.strength} · {off.dosageForm} · {off.packSize}
                          </p>
                          {(off.manufacturer || off.country) && (
                            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              {[off.manufacturer, off.country].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                        <div className="text-end shrink-0">
                          {off.discountPriceIqd != null && off.discountPriceIqd < off.sellingPriceIqd && (
                            <p className="font-latin text-[11px] line-through tabular-nums text-slate-400">
                              {formatIqd(off.sellingPriceIqd, isAr)}
                            </p>
                          )}
                          <p className="font-latin text-base font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                            {formatIqd(off.effectivePriceIqd, isAr)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {isAr ? off.pharmacyNameAr : off.pharmacyNameEn || off.pharmacyNameAr}
                        </p>
                        <p className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          <span>
                            {off.governorate} · {off.district} · {off.address}
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <span
                            className={`font-bold tabular-nums ${
                              off.availabilityStatus === 'low_stock'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {off.availabilityStatus === 'low_stock'
                              ? isAr
                                ? `كمية محدودة (${off.availableQty})`
                                : `Low Stock (${off.availableQty})`
                              : isAr
                                ? `متوفر (${off.availableQty})`
                                : `In Stock (${off.availableQty})`}
                          </span>
                          {off.nearestExpiryDate && (
                            <span className="font-latin text-slate-500 tabular-nums">
                              {isAr ? 'الانتهاء:' : 'Exp:'} {off.nearestExpiryDate}
                            </span>
                          )}
                          {(off.requiresPrescription || off.controlledDrug) && (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {isAr ? 'يتطلب وصفة طبية' : 'Rx Required'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {[
                            off.pickupAvailable ? (isAr ? 'استلام مباشر' : 'Pickup') : null,
                            off.deliveryAvailable ? (isAr ? 'توصيل متاح' : 'Delivery') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => openSingleOfferComposer(off)}
                          className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          <span>{isAr ? 'طلب الآن' : 'Order Now'}</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search Results */}
          {searchResult && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr
                    ? `نتائج الصيدليات المعتمدة (${searchResult.offers.length})`
                    : `Verified Pharmacy Results (${searchResult.offers.length})`}
                </h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? 'الأصناف المعروضة من تشغيلات صالحة غير منتهية فقط بدون استبدال تلقائي'
                    : 'Unexpired batch stock only · No silent medicine substitution'}
                </span>
              </div>

              {searchResult.offers.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
                  {isAr
                    ? 'لا توجد صيدليات معتمدة تطابق معايير البحث حالياً.'
                    : 'No approved pharmacies match your search filters right now.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {searchResult.offers.map((offer) => {
                    const isComplete =
                      offer.availabilityClass === 'Complete Prescription Available';
                    const isPartial = offer.availabilityClass === 'Partial Availability';
                    return (
                      <article
                        key={offer.pharmacyUid}
                        className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                                {isAr
                                  ? offer.pharmacyNameAr
                                  : offer.pharmacyNameEn || offer.pharmacyNameAr}
                              </h4>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-bold ${
                                  isComplete
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : isPartial
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {isComplete ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : isPartial ? (
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                ) : (
                                  <XCircle className="h-3.5 w-3.5" />
                                )}
                                {isComplete
                                  ? isAr
                                    ? `توفر كامل (${offer.matchedCount}/${offer.totalRequestedCount})`
                                    : `Complete Prescription Available (${offer.matchedCount}/${offer.totalRequestedCount})`
                                  : isPartial
                                    ? isAr
                                      ? `توفر جزئي (${offer.matchedCount}/${offer.totalRequestedCount})`
                                      : `Partial Availability (${offer.matchedCount}/${offer.totalRequestedCount})`
                                    : isAr
                                      ? 'غير متوفر'
                                      : 'Not Available'}
                              </span>
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {offer.governorate} · {offer.district} · {offer.address}
                              </span>
                              <span>·</span>
                              <span>{offer.is24Hours ? '24/7' : offer.workingDaysAndHours}</span>
                            </p>
                          </div>

                          <div className="text-end">
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {isAr ? 'التكلفة التقديرية للأدوية' : 'Estimated Medicine Subtotal'}
                            </p>
                            <p className="font-latin text-lg font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                              {formatIqd(offer.estimatedSubtotalIqd, isAr)}
                            </p>
                            {offer.deliveryAvailable && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                {offer.deliverySupportedForDistrict
                                  ? isAr
                                    ? `التوصيل: ${formatIqd(offer.deliveryFeeIqd, isAr)}`
                                    : `Delivery: ${formatIqd(offer.deliveryFeeIqd, isAr)}`
                                  : isAr
                                    ? 'التوصيل غير مشمول لمنطقتك'
                                    : 'Delivery zone not covered'}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-start text-xs">
                            <thead className="text-slate-500 dark:text-slate-400">
                              <tr>
                                <th className="py-1.5 text-start">
                                  {isAr ? 'الدواء المطلوب' : 'Requested'}
                                </th>
                                <th className="py-1.5 text-start">
                                  {isAr ? 'المطابقة الفعلية' : 'Pharmacy Stock Match'}
                                </th>
                                <th className="py-1.5 text-center">
                                  {isAr ? 'الكمية المتاحة' : 'Stock'}
                                </th>
                                <th className="py-1.5 text-end">{isAr ? 'السعر' : 'Unit Price'}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {offer.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-2 font-semibold text-slate-800 dark:text-slate-200">
                                    {item.requestedName}{' '}
                                    {item.requestedDosage ? `(${item.requestedDosage})` : ''} · ×
                                    {item.requestedQuantity}
                                  </td>
                                  <td className="py-2">
                                    {item.matched ? (
                                      <div>
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                          {item.matchedName}
                                        </span>
                                        <span className="ms-1.5 text-slate-500">
                                          {[item.strength, item.dosageForm, item.packSize]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="text-rose-600 dark:text-rose-400">
                                        {isAr ? 'غير متوفر حالياً' : 'Unavailable'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 text-center tabular-nums">
                                    {item.matched ? (
                                      <span>
                                        {item.availableQty}
                                        {item.nearestExpiryDate ? ` (${item.nearestExpiryDate})` : ''}
                                      </span>
                                    ) : (
                                      '—'
                                    )}
                                  </td>
                                  <td className="py-2 text-end font-semibold tabular-nums">
                                    {item.matched && item.unitPriceIqd !== undefined
                                      ? formatIqd(item.unitPriceIqd, isAr)
                                      : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            {offer.pickupAvailable && (
                              <span>
                                {isAr ? 'استلام من الصيدلية متاح' : 'Pharmacy Pickup Available'}
                              </span>
                            )}
                            {offer.deliveryAvailable && offer.deliverySupportedForDistrict && (
                              <span>
                                {isAr ? 'توصيل منزلي متاح' : 'Home Delivery Available'}
                              </span>
                            )}
                            {offer.minimumOrderIqd > 0 && (
                              <span className="tabular-nums">
                                {isAr
                                  ? `الحد الأدنى للطلب: ${formatIqd(offer.minimumOrderIqd, isAr)}`
                                  : `Min Order: ${formatIqd(offer.minimumOrderIqd, isAr)}`}
                              </span>
                            )}
                          </div>

                          {offer.matchedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => openOrderComposer(offer)}
                              className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-[#040917] whitespace-nowrap cursor-pointer"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              <span>
                                {isAr ? 'طلب الأصناف المتوفرة من هذه الصيدلية' : 'Order Available Items'}
                              </span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Approved Pharmacies Storefronts Tab */}
      {activeTab === 'pharmacies' && (
        <div className="space-y-5">
          {loadingStorefrontDetail ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-white p-10 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-[#081C16] dark:text-emerald-200">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{isAr ? 'جاري تحميل واجهة الصيدلية...' : 'Loading pharmacy storefront...'}</span>
            </div>
          ) : selectedStorefront ? (
            <PharmacyPublicStorefront
              storefront={selectedStorefront}
              language={language}
              mode="public_browse"
              viewerRole="patient"
              firebaseUser={firebaseUser}
              defaultGovernorate={governorate}
              defaultDistrict={district}
              defaultAddress={deliveryAddress}
              onOrderSubmitted={async () => {
                setSelectedStorefront(null);
                await loadOrders();
                setActiveTab('orders');
              }}
              onBack={() => setSelectedStorefront(null)}
            />
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-100 bg-white p-4 space-y-3 dark:border-emerald-900/50 dark:bg-[#081C16]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {isAr ? 'دليل الصيدليات المعتمدة في MEDORA' : 'Approved MEDORA Partner Pharmacies'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isAr
                        ? 'تصفح واجهة كل صيدلية معتمدة والأدوية المتوفرة وأسعار البيع للمريض.'
                        : 'Explore verified partner pharmacy storefronts, published stock, and retail pricing.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={loadingStorefronts}
                    onClick={() => void loadStorefronts(governorate, storefrontQuery)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingStorefronts ? 'animate-spin' : ''}`} />
                    <span>{isAr ? 'تحديث القائمة' : 'Refresh'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <div className="relative sm:col-span-6">
                    <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={storefrontQuery}
                      onChange={(e) => setStorefrontQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void loadStorefronts(governorate, storefrontQuery);
                        }
                      }}
                      placeholder={isAr ? 'ابحث باسم الصيدلية أو المنطقة...' : 'Search pharmacy name or area...'}
                      className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white ps-9 pe-3 text-xs text-slate-900 dark:border-emerald-900 dark:bg-[#04110D] dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <select
                      value={governorate}
                      onChange={(e) => {
                        setGovernorate(e.target.value);
                        void loadStorefronts(e.target.value, storefrontQuery);
                      }}
                      className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-emerald-900 dark:bg-[#04110D] dark:text-white"
                    >
                      <option value="">{isAr ? 'جميع المحافظات' : 'All Governorates'}</option>
                      {IRAQ_GOVERNORATES.map((g) => (
                        <option key={g.id} value={g.id}>
                          {isAr ? g.ar : g.en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => void loadStorefronts(governorate, storefrontQuery)}
                      className="min-h-[40px] w-full rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer"
                    >
                      {isAr ? 'بحث' : 'Search'}
                    </button>
                  </div>
                </div>
              </div>

              {storefrontError && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                  {storefrontError}
                </div>
              )}

              {loadingStorefronts ? (
                <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-sm text-slate-500 dark:border-emerald-900/50 dark:bg-[#081C16]">
                  {isAr ? 'جاري تحميل الصيدليات المعتمدة...' : 'Loading approved pharmacies...'}
                </div>
              ) : storefronts.length === 0 ? (
                <div className="rounded-2xl border border-emerald-100 bg-white p-10 text-center text-sm text-slate-500 dark:border-emerald-900/50 dark:bg-[#081C16]">
                  {isAr ? 'لا توجد صيدليات معتمدة تطابق البحث.' : 'No approved pharmacies match your filter.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {storefronts.map((card) => {
                    const cardName = isAr
                      ? card.pharmacyNameAr
                      : card.pharmacyNameEn || card.pharmacyNameAr;
                    const promoTitle = isAr
                      ? card.approvedPromoBanner?.titleAr || card.approvedPromoBanner?.titleEn
                      : card.approvedPromoBanner?.titleEn || card.approvedPromoBanner?.titleAr;
                    return (
                      <article
                        key={card.uid}
                        className="flex flex-col justify-between overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm transition hover:border-emerald-300 dark:border-emerald-900/50 dark:bg-[#081C16]"
                      >
                        <div>
                          {card.coverImageUrl ? (
                            <div className="h-24 w-full overflow-hidden bg-emerald-900">
                              <img
                                src={card.coverImageUrl}
                                alt={cardName}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover opacity-90"
                              />
                            </div>
                          ) : (
                            <div className="h-16 w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700" />
                          )}
                          <div className="p-4 pt-3 space-y-2.5">
                            <div className="flex items-start gap-3">
                              <PharmacyLogoAvatar
                                logoUrl={card.logoUrl}
                                name={cardName}
                                sizeClass="h-11 w-11"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <h4 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                                    {cardName}
                                  </h4>
                                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {card.governorate} · {card.district}
                                </p>
                              </div>
                            </div>

                            {card.featuredApproved && (
                              <p className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                <Sparkles className="h-3.5 w-3.5" />
                                <span>{isAr ? 'صيدلية مميزة في MEDORA' : 'MEDORA Featured Partner'}</span>
                              </p>
                            )}

                            {promoTitle && (
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                                {promoTitle}
                              </div>
                            )}

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3 text-emerald-700 dark:text-emerald-400" />
                                {card.is24Hours ? '24/7' : card.workingDaysAndHours}
                              </span>
                              <span>·</span>
                              <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                                {card.publishedInStockCount}{' '}
                                {isAr ? 'صنف متوفر' : 'medicines'}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {[
                                card.pickupAvailable ? (isAr ? 'استلام من الصيدلية' : 'Pickup') : null,
                                card.deliveryAvailable ? (isAr ? 'توصيل منزلي' : 'Delivery') : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-emerald-50 p-3 dark:border-emerald-950">
                          <button
                            type="button"
                            onClick={() => void openStorefrontDetail(card.publicSlug || card.uid)}
                            className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer"
                          >
                            <Store className="h-3.5 w-3.5" />
                            <span>{isAr ? 'زيارة واجهة الصيدلية وطلب الأدوية' : 'Open Storefront'}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'سجل طلبات الصيدليات' : 'Pharmacy Orders History'}
            </h3>
            <button
              type="button"
              disabled={loadingOrders}
              onClick={() => void loadOrders()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingOrders ? 'animate-spin' : ''}`} />
              <span>{isAr ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
              {isAr ? 'لا توجد طلبات صيدلانية مسجلة بعد.' : 'No pharmacy orders placed yet.'}
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const thread = commsByOrder[order.orderId] || [];
                const canCancel = CANCELLABLE_ORDER_STATUSES.includes(order.status);
                return (
                  <article
                    key={order.orderId}
                    className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                      <div>
                        <p className="font-latin text-xs font-bold text-[#b68023] dark:text-[#f4d378] tabular-nums" dir="ltr">
                          {order.orderNumber}
                        </p>
                        <h4 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                          {order.pharmacyName}
                        </h4>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {order.fulfillmentType === 'pickup'
                            ? isAr
                              ? 'استلام من الصيدلية'
                              : 'Pharmacy Pickup'
                            : isAr
                              ? `توصيل منزلي (${order.deliveryGovernorate || ''} · ${order.deliveryDistrict || ''})`
                              : `Home Delivery (${order.deliveryGovernorate || ''} · ${order.deliveryDistrict || ''})`}{' '}
                          ·{' '}
                          {order.paymentMethod === 'cash_on_pickup'
                            ? isAr
                              ? 'الدفع نقداً عند الاستلام'
                              : 'Cash on Pickup'
                            : isAr
                              ? 'الدفع نقداً عند التوصيل'
                              : 'Cash on Delivery'}
                        </p>
                      </div>

                      <div className="text-end space-y-1">
                        <p className="text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                          {statusLabel(order.status)}
                        </p>
                        <p className="font-latin text-base font-bold tabular-nums text-slate-900 dark:text-white">
                          {formatIqd(order.totalIqd, isAr)}
                        </p>
                      </div>
                    </div>

                    {order.fulfillmentType === 'pickup' && order.pickupCode && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d9a43b]/40 bg-[#d9a43b]/10 px-4 py-2.5 text-xs">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-amber-100">
                          <KeyRound className="h-4 w-4 text-[#b68023] dark:text-[#f4d378]" />
                          {isAr
                            ? 'رمز التحقق للاستلام من الصيدلية:'
                            : 'Pharmacy Pickup Verification Code:'}
                        </span>
                        <span className="font-latin text-sm font-bold tracking-wider tabular-nums text-[#0c3585] dark:text-[#f4d378]" dir="ltr">
                          {order.pickupCode}
                        </span>
                      </div>
                    )}

                    <ul className="space-y-1.5 text-xs">
                      {order.items.map((it) => (
                        <li
                          key={it.itemId}
                          className="flex items-center justify-between gap-2 text-slate-700 dark:text-slate-300"
                        >
                          <span>
                            {it.medicineName} × {it.confirmedQty || it.requestedQty}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatIqd(it.lineTotalIqd, isAr)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {order.rejectionReason && (
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                        {isAr ? 'سبب الرفض:' : 'Rejection reason:'} {order.rejectionReason}
                      </p>
                    )}

                    {/* Real Order Messaging Thread */}
                    <div className="border-t border-slate-100 pt-3 space-y-2 dark:border-slate-800">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{isAr ? 'التواصل مع الصيدلية' : 'Pharmacy Messages'}</span>
                      </p>
                      {thread.length > 0 && (
                        <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
                          {thread.map((msg) => (
                            <div key={msg.messageId} className="text-xs">
                              <span className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                                {msg.senderName}:{' '}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300">{msg.body}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          value={messageDrafts[order.orderId] || ''}
                          onChange={(e) =>
                            setMessageDrafts((prev) => ({ ...prev, [order.orderId]: e.target.value }))
                          }
                          placeholder={
                            isAr ? 'أرسل رسالة للصيدلي حول الطلب...' : 'Message the pharmacist...'
                          }
                          className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          disabled={sendingMsgOrderId === order.orderId}
                          onClick={() => void handleSendMessage(order.orderId)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{isAr ? 'إرسال' : 'Send'}</span>
                        </button>
                        {canCancel && (
                          <button
                            type="button"
                            disabled={cancellingOrderId === order.orderId}
                            onClick={() => void handleCancelOrder(order.orderId)}
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-300 px-3.5 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-300 cursor-pointer"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>{isAr ? 'إلغاء الطلب' : 'Cancel Order'}</span>
                          </button>
                        )}
                        {(order.status === 'Ready for Pickup' || order.status === 'Out for Delivery') && (
                          <button
                            type="button"
                            disabled={confirmingOrderId === order.orderId}
                            onClick={() => void handleConfirmPatientReceipt(order.orderId)}
                            className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>
                              {isAr ? 'تأكيد الاستلام وإصدار الإيصال' : 'Confirm Receipt'}
                            </span>
                          </button>
                        )}
                        {order.status === 'Completed' &&
                          patientReceipts.some((r) => r.orderId === order.orderId) && (
                            <button
                              type="button"
                              onClick={() => handlePrintPatientReceipt(order)}
                              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              <span>
                                {isAr ? 'طباعة الإيصال الموحد (A4 / حراري)' : 'Print Unified Receipt'}
                              </span>
                            </button>
                          )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Order Checkout Drawer / Modal */}
      {selectedOffer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedOffer(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isAr ? 'تأكيد طلب الأدوية' : 'Confirm Pharmacy Order'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? selectedOffer.pharmacyNameAr
                    : selectedOffer.pharmacyNameEn || selectedOffer.pharmacyNameAr}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOffer(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>

            {/* Fulfillment Selector */}
            <div className="grid grid-cols-2 gap-2">
              {selectedOffer.pickupAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    setFulfillmentType('pickup');
                    if (selectedOffer.acceptedPaymentMethods.includes('cash_on_pickup')) {
                      setPaymentMethod('cash_on_pickup');
                    }
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold cursor-pointer ${
                    fulfillmentType === 'pickup'
                      ? 'border-[#0c3585] bg-[#0c3585]/10 text-[#0c3585] dark:border-[#f4d378] dark:text-[#f4d378]'
                      : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Package className="h-4 w-4" />
                  <span>{isAr ? 'استلام من الصيدلية' : 'Pharmacy Pickup'}</span>
                </button>
              )}

              {selectedOffer.deliveryAvailable && selectedOffer.deliverySupportedForDistrict && (
                <button
                  type="button"
                  onClick={() => {
                    setFulfillmentType('delivery');
                    if (selectedOffer.acceptedPaymentMethods.includes('cash_on_delivery')) {
                      setPaymentMethod('cash_on_delivery');
                    }
                  }}
                  className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold cursor-pointer ${
                    fulfillmentType === 'delivery'
                      ? 'border-[#0c3585] bg-[#0c3585]/10 text-[#0c3585] dark:border-[#f4d378] dark:text-[#f4d378]'
                      : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  <span>
                    {isAr
                      ? `توصيل (${formatIqd(selectedOffer.deliveryFeeIqd, isAr)})`
                      : `Delivery (${formatIqd(selectedOffer.deliveryFeeIqd, isAr)})`}
                  </span>
                </button>
              )}
            </div>

            {fulfillmentType === 'delivery' && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'عنوان التوصيل التفصيلي' : 'Delivery Address'}
                </label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder={isAr ? 'المحلة، الزقاق، الدار، أقرب نقطة دالة' : 'Street, landmark, house #'}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                {isAr ? 'طريقة الدفع المتاحة' : 'Accepted Payment Method'}
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'cash_on_pickup' | 'cash_on_delivery')
                }
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                {selectedOffer.acceptedPaymentMethods.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm === 'cash_on_pickup'
                      ? isAr
                        ? 'الدفع نقداً عند الاستلام من الصيدلية'
                        : 'Cash on Pickup'
                      : isAr
                        ? 'الدفع نقداً عند التوصيل للمنزل'
                        : 'Cash on Delivery'}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'قيمة الأدوية' : 'Subtotal'}</span>
                <span className="font-bold tabular-nums">
                  {formatIqd(selectedOffer.estimatedSubtotalIqd, isAr)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'أجرة التوصيل' : 'Delivery Fee'}</span>
                <span className="font-bold tabular-nums">
                  {formatIqd(fulfillmentType === 'delivery' ? selectedOffer.deliveryFeeIqd : 0, isAr)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold dark:border-slate-800">
                <span>{isAr ? 'الإجمالي المستحق' : 'Total Due'}</span>
                <span className="text-[#0c3585] dark:text-[#f4d378] tabular-nums">
                  {formatIqd(
                    selectedOffer.estimatedSubtotalIqd +
                      (fulfillmentType === 'delivery' ? selectedOffer.deliveryFeeIqd : 0),
                    isAr,
                  )}
                </span>
              </div>
            </div>

            {priceConflict && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-bold">
                  {isAr
                    ? 'تم تحديث تسعيرة الصيدلية للتو! يرجى تأكيد السعر الجديد للمتابعة:'
                    : 'Pharmacy pricing changed while placing your order. Confirm updated total:'}
                </p>
                <p className="font-latin font-bold tabular-nums">
                  {isAr ? 'المجموع الجديد:' : 'Updated Total:'}{' '}
                  {formatIqd(priceConflict.freshTotalIqd, isAr)}
                </p>
                <button
                  type="button"
                  disabled={submittingOrder}
                  onClick={() => void submitOrderRequest(priceConflict.freshTotalIqd)}
                  className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {isAr ? 'موافقة وتأكيد الطلب بالسعر الجديد' : 'Accept Updated Price & Submit'}
                </button>
              </div>
            )}

            {orderError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                {orderError}
              </div>
            )}

            {!priceConflict && (
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedOffer(null)}
                  className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={submittingOrder}
                  onClick={() => void submitOrderRequest()}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  {submittingOrder
                    ? isAr
                      ? 'جاري إرسال الطلب...'
                      : 'Submitting...'
                    : isAr
                      ? 'تأكيد وإرسال الطلب للصيدلية'
                      : 'Confirm & Submit Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Single Drug Direct Order Modal */}
      {selectedSingleOffer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setSelectedSingleOffer(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-start justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedSingleOffer.brandName || selectedSingleOffer.scientificName} ({selectedSingleOffer.strength})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isAr
                    ? selectedSingleOffer.pharmacyNameAr
                    : selectedSingleOffer.pharmacyNameEn || selectedSingleOffer.pharmacyNameAr}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSingleOffer(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'الكمية المطلوبة' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={Math.min(100, selectedSingleOffer.availableQty || 1)}
                  value={singleOrderQty}
                  onChange={(e) =>
                    setSingleOrderQty(
                      Math.max(
                        1,
                        Math.min(selectedSingleOffer.availableQty || 1, Number(e.target.value) || 1),
                      ),
                    )
                  }
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {isAr ? 'سعر الوحدة' : 'Unit Price'}
                </label>
                <div className="flex min-h-[42px] items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold tabular-nums text-[#0c3585] dark:border-slate-800 dark:bg-slate-900/50 dark:text-[#f4d378]">
                  {formatIqd(selectedSingleOffer.effectivePriceIqd, isAr)}
                </div>
              </div>
            </div>

            {(selectedSingleOffer.requiresPrescription || selectedSingleOffer.controlledDrug) && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-amber-800 dark:text-amber-300">
                  {isAr ? 'إرفاق وصفة الطبيب (إلزامي لهذا الدواء)' : 'Attach Doctor Prescription (Required)'}
                </label>
                <select
                  value={singleOrderRxId}
                  onChange={(e) => setSingleOrderRxId(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="">{isAr ? '— اختر الوصفة —' : '— Select Prescription —'}</option>
                  {workspace.prescriptions.map((rx) => (
                    <option key={rx.prescriptionId} value={rx.prescriptionId}>
                      {rx.prescribedDate} · {rx.doctorName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {selectedSingleOffer.pickupAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    setFulfillmentType('pickup');
                    setPaymentMethod('cash_on_pickup');
                  }}
                  className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold cursor-pointer ${
                    fulfillmentType === 'pickup'
                      ? 'border-[#0c3585] bg-[#0c3585]/10 text-[#0c3585] dark:border-[#f4d378] dark:text-[#f4d378]'
                      : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Package className="h-4 w-4" />
                  <span>{isAr ? 'استلام من الصيدلية' : 'Pharmacy Pickup'}</span>
                </button>
              )}
              {selectedSingleOffer.deliveryAvailable && (
                <button
                  type="button"
                  onClick={() => {
                    setFulfillmentType('delivery');
                    setPaymentMethod('cash_on_delivery');
                  }}
                  className={`flex min-h-[42px] items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold cursor-pointer ${
                    fulfillmentType === 'delivery'
                      ? 'border-[#0c3585] bg-[#0c3585]/10 text-[#0c3585] dark:border-[#f4d378] dark:text-[#f4d378]'
                      : 'border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-300'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                  <span>{isAr ? 'توصيل منزلي' : 'Home Delivery'}</span>
                </button>
              )}
            </div>

            {fulfillmentType === 'delivery' && (
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder={isAr ? 'عنوان التوصيل التفصيلي...' : 'Full delivery address...'}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex justify-between font-bold text-sm">
                <span>{isAr ? 'الإجمالي المبدئي' : 'Estimated Total'}</span>
                <span className="text-[#0c3585] dark:text-[#f4d378] tabular-nums">
                  {formatIqd(selectedSingleOffer.effectivePriceIqd * singleOrderQty, isAr)}
                </span>
              </div>
            </div>

            {priceConflict && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 space-y-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-bold">
                  {isAr
                    ? 'الإجمالي المحدث شاملاً رسوم التوصيل أو السعر الفعلي:'
                    : 'Updated server total (including any delivery fee):'}
                </p>
                <p className="font-latin font-bold tabular-nums">
                  {formatIqd(priceConflict.freshTotalIqd, isAr)}
                </p>
                <button
                  type="button"
                  disabled={submittingOrder}
                  onClick={() => void submitSingleOfferOrderRequest(priceConflict.freshTotalIqd)}
                  className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                >
                  {isAr ? 'تأكيد وإرسال الطلب' : 'Confirm & Submit'}
                </button>
              </div>
            )}

            {orderError && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                {orderError}
              </div>
            )}

            {!priceConflict && (
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedSingleOffer(null)}
                  className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="button"
                  disabled={submittingOrder}
                  onClick={() => void submitSingleOfferOrderRequest()}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                >
                  {submittingOrder
                    ? isAr
                      ? 'جاري الإرسال...'
                      : 'Submitting...'
                    : isAr
                      ? 'تأكيد وإرسال الطلب'
                      : 'Confirm & Submit Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
