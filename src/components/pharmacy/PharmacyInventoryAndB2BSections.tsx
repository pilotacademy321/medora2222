import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  Bell,
  Building2,
  Minus,
  PackageCheck,
  Pill,
  Plus,
  Printer,
  Send,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  UserCog,
} from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import { fetchScopedReceipts, recordReceiptReprint } from '../../services/commerceService';
import {
  addPharmacyBatch,
  addPharmacyStaff,
  adjustPharmacyBatch,
  browseWholesalersForPharmacy,
  confirmWholesalerOrderReceipt,
  decideWholesalerAmendment,
  markPharmacyNotificationRead,
  sendPharmacyCommunication,
  submitWholesalerSupplyOrder,
  updatePharmacySettings,
  updatePharmacyStaff,
  type PharmacyWholesalerBrowseResponse,
} from '../../services/pharmacyService';
import type { MedoraReceiptRecord } from '../../types/commerce';
import type { Language } from '../../types/medora';
import type {
  PharmacyBatchRecord,
  PharmacyDeliveryZone,
  PharmacySectionId,
  PharmacyStaffRole,
  PharmacyWorkspaceData,
} from '../../types/pharmacy';
import { printMedoraDocument } from '../../utils/printAndPdf';
import { EmployerSecretaryManagementSection } from '../secretary/EmployerSecretaryManagementSection';
import { UnifiedReceiptPrintSheet } from '../shared/MedoraPrintableDocument';
import { formatIqd } from './PharmacyBrandUtils';

export function PharmacyBatchesSection({
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
  const pt = pharmacyTranslations[language];
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [availableQty, setAvailableQty] = useState(1);
  const [purchasePriceIqd, setPurchasePriceIqd] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddBatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!productId || !batchNumber.trim() || !expiryDate) return;
    setSaving(true);
    setError(null);
    try {
      await addPharmacyBatch(firebaseUser, {
        productId,
        batchNumber: batchNumber.trim(),
        expiryDate,
        availableQty,
        purchasePriceIqd,
      });
      setBatchNumber('');
      setExpiryDate('');
      setAvailableQty(1);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ADD_BATCH_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleWriteOff = async (b: PharmacyBatchRecord) => {
    setSaving(true);
    setError(null);
    try {
      await adjustPharmacyBatch(firebaseUser, b.batchId, {
        quantityDelta: -b.availableQty,
        movementType: 'expired_writeoff',
        reason: isAr ? 'إتلاف تشغيلة منتهية الصلاحية' : 'Expired batch write-off',
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'WRITEOFF_FAILED');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <form
          onSubmit={(e) => void handleAddBatch(e)}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr
              ? 'إدخال تشغيلة دوائية جديدة (تتبع FEFO)'
              : 'Receive New Pharmaceutical Batch (FEFO)'}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white sm:col-span-2"
            >
              <option value="">{isAr ? 'اختر الصنف...' : 'Select Product...'}</option>
              {workspace.products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.brandName || p.scientificName} ({p.strength})
                </option>
              ))}
            </select>
            <input
              required
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder={pt.common.batchNumber}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <input
              required
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:[color-scheme:dark] dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <input
              required
              type="number"
              min={1}
              value={availableQty}
              onChange={(e) => setAvailableQty(Math.max(1, Number(e.target.value) || 1))}
              placeholder={pt.common.quantity}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={0}
              value={purchasePriceIqd}
              onChange={(e) => setPurchasePriceIqd(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'كلفة الشراء للوحدة (د.ع)' : 'Unit Purchase Cost (IQD)'}
              className="min-h-[40px] w-56 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
            >
              {isAr ? 'إضافة التشغيلة' : 'Add Batch'}
            </button>
          </div>
          {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-[#061028] dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 text-start">{isAr ? 'الدواء' : 'Product'}</th>
                <th className="px-4 py-3 text-center">{pt.common.batchNumber}</th>
                <th className="px-4 py-3 text-center">{pt.common.expiryDate}</th>
                <th className="px-4 py-3 text-center">
                  {isAr ? 'متاح / محجوز' : 'Available / Reserved'}
                </th>
                <th className="px-4 py-3 text-center">{pt.common.status}</th>
                <th className="px-4 py-3 text-end">{pt.common.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                    {pt.common.noData}
                  </td>
                </tr>
              ) : (
                workspace.batches.map((b) => (
                  <tr key={b.batchId}>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      {b.productName}
                    </td>
                    <td className="px-4 py-3 text-center font-latin tabular-nums text-slate-700 dark:text-slate-200">
                      {b.batchNumber}
                    </td>
                    <td className="px-4 py-3 text-center font-latin tabular-nums text-slate-700 dark:text-slate-200">
                      {b.expiryDate}
                    </td>
                    <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-900 dark:text-white">
                      {b.availableQty} / {b.reservedQty}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {b.isExpired ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {isAr ? 'منتهي الصلاحية (محجوب تلقائياً)' : 'Expired (Blocked)'}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700 dark:text-emerald-300">
                          {isAr ? 'صالح للصرف' : 'Active FEFO'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canManage && b.isExpired && b.availableQty > 0 && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleWriteOff(b)}
                          className="rounded-lg border border-rose-300 bg-white px-3 py-1 text-xs font-bold text-rose-700 dark:border-rose-500/40 dark:bg-[#030712] dark:text-rose-400 cursor-pointer"
                        >
                          {isAr ? 'إتلاف الرصيد' : 'Write-off'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function PharmacyInventoryMovementsSection({
  workspace,
  language,
}: {
  workspace: PharmacyWorkspaceData;
  language: Language;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
      <div className="overflow-x-auto">
        <table className="w-full text-start text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-[#061028] dark:text-slate-300">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'النوع' : 'Movement'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'التشغيلة' : 'Batch'}</th>
              <th className="px-4 py-3 text-center">
                {isAr ? 'التغير بالمخزون / الحجز' : 'Qty / Reserved Δ'}
              </th>
              <th className="px-4 py-3 text-start">{isAr ? 'السبب / المرجع' : 'Reason'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'المسؤول' : 'Actor'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {workspace.movements.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                  {pt.common.noData}
                </td>
              </tr>
            ) : (
              workspace.movements.map((mv) => (
                <tr key={mv.movementId}>
                  <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                    {pt.movementTypes[mv.movementType] || mv.movementType}
                  </td>
                  <td className="px-4 py-3 text-center font-latin text-slate-700 dark:text-slate-200">
                    {mv.batchNumber}
                  </td>
                  <td className="px-4 py-3 text-center font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                    {mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta} /{' '}
                    {mv.reservedDelta > 0 ? `+${mv.reservedDelta}` : mv.reservedDelta}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mv.reason}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{mv.actorName}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PharmacyWholesalerMarketplaceSection({
  firebaseUser,
  language,
  canOrder,
  onNavigate,
  onRefresh,
}: {
  firebaseUser: User;
  language: Language;
  canOrder: boolean;
  onNavigate?: (sec: PharmacySectionId) => void;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [data, setData] = useState<PharmacyWholesalerBrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedWhUid, setSelectedWhUid] = useState('');
  const [compareFilter, setCompareFilter] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_delivery' | 'credit_account'>(
    'cash_on_delivery',
  );
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadBrowse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await browseWholesalersForPharmacy(firebaseUser);
      setData(res);
      setSelectedWhUid((prev) => prev || res.wholesalers[0]?.uid || '');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadBrowse();
  }, [loadBrowse]);

  const activeWholesaler = useMemo(
    () => data?.wholesalers.find((w) => w.uid === selectedWhUid) || null,
    [data, selectedWhUid],
  );

  const filteredWhProducts = useMemo(() => {
    if (!activeWholesaler) return [];
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return activeWholesaler.products;
    return activeWholesaler.products.filter((p) =>
      [p.brandName, p.scientificName, p.activeIngredient, p.strength, p.manufacturer]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [activeWholesaler, catalogSearch]);

  const cartLines = useMemo(() => {
    if (!activeWholesaler) return [];
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const prod = activeWholesaler.products.find((p) => p.productId === productId);
        return prod ? { prod, qty } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [activeWholesaler, cart]);

  const cartTotalIqd = cartLines.reduce(
    (sum, item) => sum + item.prod.wholesalePriceIqd * item.qty,
    0,
  );

  const filteredPriceComparisons = useMemo(() => {
    const groups = data?.priceComparisonByMedicine || [];
    const q = compareFilter.trim().toLowerCase();
    if (!q) return groups.slice(0, 20);
    return groups.filter((g) =>
      [g.scientificName, g.brandName, g.strength, g.packSize]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [data, compareFilter]);

  const handleSubmitSupplyOrder = async () => {
    if (!activeWholesaler || cartLines.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await submitWholesalerSupplyOrder(firebaseUser, {
        wholesalerUid: activeWholesaler.uid,
        paymentMethod,
        notes: notes.trim() || undefined,
        clientRequestKey: `b2b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        items: cartLines.map((l) => ({
          productId: l.prod.productId,
          requestedQty: l.qty,
        })),
      });
      setCart({});
      setNotes('');
      setNotice(
        isAr
          ? `تم إرسال طلب التوريد رقم ${res.supplyOrder.orderNumber} إلى المذخر.`
          : `Supply order ${res.supplyOrder.orderNumber} submitted.`,
      );
      await Promise.all([loadBrowse(), onRefresh()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SUPPLY_ORDER_FAILED');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
        {pharmacyTranslations[language].loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'سوق المذاخر المعتمدة (المقارنة وسلة الشراء)' : 'Approved Wholesalers Marketplace'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'تصفح منتجات المذاخر ببطاقات واضحة، أضف إلى سلة التوريد، وأرسل طلب الشراء الرسمي.'
                : 'Browse verified wholesaler products, compare wholesale pricing, and checkout supply orders.'}
            </p>
          </div>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('supply_orders')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/5 px-3.5 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/10 dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
          >
            <PackageCheck className="h-3.5 w-3.5" />
            <span>
              {isAr
                ? `طلبات وسجل المشتريات (${data?.supplyOrders?.length || 0})`
                : `Supply Orders (${data?.supplyOrders?.length || 0})`}
            </span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
          {notice}
        </div>
      )}

      {/* Wholesaler Catalog + Interactive Cart Checkout Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a] xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'كتالوج المذخر المختار' : 'Wholesaler Product Catalog'}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder={isAr ? 'بحث في أدوية المذخر...' : 'Search wholesaler items...'}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <select
                value={selectedWhUid}
                onChange={(e) => {
                  setSelectedWhUid(e.target.value);
                  setCart({});
                }}
                className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                {(data?.wholesalers || []).map((w) => (
                  <option key={w.uid} value={w.uid}>
                    {isAr ? w.wholesalerNameAr : w.wholesalerNameEn || w.wholesalerNameAr} (
                    {w.governorate})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeWholesaler && (
            <>
              {activeWholesaler.creditPolicy?.creditEnabled && (
                <p className="rounded-xl bg-[#0c3585]/5 px-3 py-2 text-xs font-semibold text-[#0c3585] dark:bg-[#d9a43b]/10 dark:text-[#f4d378] tabular-nums">
                  {isAr
                    ? `الائتمان مفعل: الحد ${formatIqd(activeWholesaler.creditPolicy.creditLimitIqd, isAr)} · الرصيد الحالي ${formatIqd(activeWholesaler.creditPolicy.currentBalanceIqd, isAr)}`
                    : `Credit Enabled: Limit ${formatIqd(activeWholesaler.creditPolicy.creditLimitIqd, isAr)} · Balance ${formatIqd(activeWholesaler.creditPolicy.currentBalanceIqd, isAr)}`}
                </p>
              )}

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                {filteredWhProducts.map((p) => {
                  const qty = cart[p.productId] || 0;
                  const stepMin = Math.max(1, p.minimumOrderQty || 1);
                  return (
                    <article
                      key={p.productId}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-[#030712]/60"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0c3585]/10 text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                          <Pill className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                            {p.brandName || p.scientificName}
                          </h4>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {p.scientificName} · {p.strength} · {p.packSize}
                          </p>
                          {(p.manufacturer || p.country) && (
                            <p className="truncate text-[11px] text-slate-400">
                              {[p.manufacturer, p.country].filter(Boolean).join(' / ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-xs dark:border-slate-800">
                        <div>
                          <p className="font-latin font-extrabold text-[#0c3585] dark:text-[#f4d378] tabular-nums">
                            {formatIqd(p.wholesalePriceIqd, isAr)}
                          </p>
                          <p className="text-[11px] text-slate-500 tabular-nums">
                            {isAr ? 'متاح:' : 'Stock:'} {p.availableQty} ·{' '}
                            {p.nearestExpiryDate || '—'}
                          </p>
                          {p.bonusRuleLabel && (
                            <span className="mt-1 inline-block rounded-md bg-[#d9a43b]/20 px-2 py-0.5 text-[10px] font-bold text-[#916818] dark:text-[#f4d378]">
                              {p.bonusRuleLabel}
                            </span>
                          )}
                        </div>

                        {canOrder && (
                          <div className="flex items-center gap-1.5">
                            {qty > 0 ? (
                              <div className="inline-flex items-center gap-1 rounded-xl border border-[#0c3585]/30 bg-white px-1.5 py-1 dark:border-[#d9a43b]/30 dark:bg-[#07122a]">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCart((prev) => ({
                                      ...prev,
                                      [p.productId]: Math.max(0, (prev[p.productId] || 0) - 1),
                                    }))
                                  }
                                  className="p-1 text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={p.availableQty}
                                  value={qty}
                                  onChange={(e) =>
                                    setCart((prev) => ({
                                      ...prev,
                                      [p.productId]: Math.max(
                                        0,
                                        Math.min(p.availableQty, Number(e.target.value) || 0),
                                      ),
                                    }))
                                  }
                                  className="w-12 bg-transparent text-center font-latin text-xs font-bold tabular-nums text-slate-900 dark:text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCart((prev) => ({
                                      ...prev,
                                      [p.productId]: Math.min(
                                        p.availableQty,
                                        (prev[p.productId] || 0) + 1,
                                      ),
                                    }))
                                  }
                                  className="p-1 text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={p.availableQty <= 0}
                                onClick={() =>
                                  setCart((prev) => ({
                                    ...prev,
                                    [p.productId]: Math.min(p.availableQty, stepMin),
                                  }))
                                }
                                className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-40 cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>{isAr ? 'أضف للسلة' : 'Add'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Sticky Wholesaler Cart Checkout Panel */}
        <aside className="rounded-2xl border border-[#d9a43b]/40 bg-white p-5 space-y-4 shadow-xs dark:border-[#d9a43b]/30 dark:bg-[#07122a] xl:col-span-4 h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'سلة طلب التوريد (B2B)' : 'Supply Order Cart'}
              </h3>
            </div>
            <span className="rounded-lg bg-[#0c3585]/10 px-2 py-0.5 font-latin text-xs font-bold text-[#0c3585] dark:bg-[#d9a43b]/15 dark:text-[#f4d378] tabular-nums">
              {cartLines.length}
            </span>
          </div>

          {cartLines.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'أضف الأدوية من كتالوج المذخر لتجهيز سلة الشراء.'
                : 'Select medicines from wholesaler catalog to build your order.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pe-1">
              {cartLines.map(({ prod, qty }) => (
                <div
                  key={prod.productId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-[#030712]/70"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-900 dark:text-white">
                      {prod.brandName || prod.scientificName}
                    </p>
                    <p className="font-latin text-[11px] text-slate-500 tabular-nums">
                      {qty} × {formatIqd(prod.wholesalePriceIqd, isAr)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                      {formatIqd(prod.wholesalePriceIqd * qty, isAr)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => {
                          const next = { ...prev };
                          delete next[prod.productId];
                          return next;
                        })
                      }
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {canOrder && activeWholesaler && (
            <div className="space-y-3 border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                <span>{isAr ? 'الإجمالي التقديري' : 'Estimated Total'}</span>
                <span className="font-latin text-base font-extrabold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                  {formatIqd(cartTotalIqd, isAr)}
                </span>
              </div>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as 'cash_on_delivery' | 'credit_account')
                }
                className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                <option value="cash_on_delivery">
                  {isAr ? 'دفع عند الاستلام (نقدي)' : 'Cash on Delivery'}
                </option>
                {activeWholesaler.creditPolicy?.creditEnabled && (
                  <option value="credit_account">
                    {isAr ? 'على الحساب الآجل (بموافقة المذخر)' : 'Credit Account'}
                  </option>
                )}
              </select>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={isAr ? 'ملاحظات للمذخر...' : 'Notes for wholesaler...'}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <button
                type="button"
                disabled={busy || cartLines.length === 0}
                onClick={() => void handleSubmitSupplyOrder()}
                className="medora-gold-button min-h-[42px] w-full rounded-xl text-xs font-extrabold disabled:opacity-50 cursor-pointer"
              >
                {busy
                  ? isAr
                    ? 'جاري الإرسال...'
                    : 'Submitting...'
                  : isAr
                    ? 'إرسال طلب التوريد'
                    : 'Submit Supply Order'}
              </button>
            </div>
          )}
        </aside>
      </div>

      {/* Wholesaler Price Comparison Table */}
      {(data?.priceComparisonByMedicine?.length || 0) > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {pharmacyTranslations[language].comparePrices.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {pharmacyTranslations[language].comparePrices.subtitle}
              </p>
            </div>
            <input
              type="text"
              value={compareFilter}
              onChange={(e) => setCompareFilter(e.target.value)}
              placeholder={isAr ? 'ابحث باسم الدواء للمقارنة...' : 'Filter medicine to compare...'}
              className="min-h-[38px] w-64 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
          </div>

          <div className="space-y-3 max-h-[360px] overflow-y-auto pe-1">
            {filteredPriceComparisons.map((group) => (
              <div
                key={group.medicineId}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#030712]/70"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    {group.brandName
                      ? `${group.brandName} (${group.scientificName})`
                      : group.scientificName}{' '}
                    <span className="font-normal text-slate-500 dark:text-slate-400">
                      · {group.strength} ·{' '}
                      {pharmacyTranslations[language].dosageForms[group.dosageForm] || group.dosageForm}{' '}
                      · {group.packSize}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[#0c3585] dark:text-[#f4d378] tabular-nums">
                    {group.offers.length} {isAr ? 'مذاخر' : 'wholesalers'}
                  </span>
                </div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-start text-[11px]">
                    <thead className="text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-1 text-start">{isAr ? 'المذخر' : 'Wholesaler'}</th>
                        <th className="py-1 text-center">{isAr ? 'سعر الجملة' : 'Wholesale'}</th>
                        <th className="py-1 text-center">{isAr ? 'البونص / MOQ' : 'Bonus / MOQ'}</th>
                        <th className="py-1 text-center">{isAr ? 'المتاح / الانتهاء' : 'Stock / Exp'}</th>
                        <th className="py-1 text-end" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                      {group.offers.map((off, idx) => (
                        <tr key={`${off.wholesalerUid}-${off.productId}`}>
                          <td className="py-1.5 font-semibold text-slate-800 dark:text-slate-200">
                            {off.wholesalerName}{' '}
                            <span className="font-normal text-slate-400">({off.governorate})</span>
                            {idx === 0 && (
                              <span className="ms-1.5 text-[10px] font-bold text-[#0c3585] dark:text-[#f4d378]">
                                {isAr ? '· الأقل سعراً' : '· Best Price'}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-center font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                            {formatIqd(off.effectivePriceIqd, isAr)}
                          </td>
                          <td className="py-1.5 text-center tabular-nums text-slate-600 dark:text-slate-300">
                            {off.bonusRuleLabel || '—'} / {off.minimumOrderQty || 1}
                          </td>
                          <td className="py-1.5 text-center tabular-nums text-slate-700 dark:text-slate-200">
                            {off.availableQty} ({off.nearestExpiryDate || '—'})
                          </td>
                          <td className="py-1.5 text-end">
                            {canOrder && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedWhUid(off.wholesalerUid);
                                  setCart((prev) => ({
                                    ...prev,
                                    [off.productId]: Math.max(1, off.minimumOrderQty || 1),
                                  }));
                                }}
                                className="rounded-lg bg-[#0c3585] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                              >
                                {isAr ? 'أضف للسلة' : 'Add'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PharmacySupplyOrdersSection({
  firebaseUser,
  workspace,
  language,
  canOrder,
  onNavigate,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canOrder: boolean;
  onNavigate?: (sec: PharmacySectionId) => void;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [supplyReceipts, setSupplyReceipts] = useState<MedoraReceiptRecord[]>([]);

  const loadReceipts = useCallback(async () => {
    try {
      const list = await fetchScopedReceipts(firebaseUser, {
        transactionType: 'wholesaler_to_pharmacy',
      });
      setSupplyReceipts(list);
    } catch {
      // ignore non-blocking receipt fetch error
    }
  }, [firebaseUser]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const receiptByOrderId = useMemo(() => {
    const map = new Map<string, MedoraReceiptRecord>();
    for (const r of supplyReceipts) {
      if (r.orderId) map.set(r.orderId, r);
    }
    return map;
  }, [supplyReceipts]);

  const supplyOrders = workspace.supplyOrders || [];
  const filtered = useMemo(() => {
    if (statusFilter === 'active') {
      return supplyOrders.filter(
        (s) => s.status !== 'Completed' && s.status !== 'Cancelled' && s.status !== 'Rejected',
      );
    }
    if (statusFilter === 'completed') {
      return supplyOrders.filter((s) => s.status === 'Completed');
    }
    return supplyOrders;
  }, [supplyOrders, statusFilter]);

  const handleAmendmentDecision = async (orderId: string, accept: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await decideWholesalerAmendment(firebaseUser, orderId, accept);
      setNotice(
        accept
          ? isAr
            ? 'تم قبول التعديل المقترح من المذخر.'
            : 'Wholesaler amendment accepted.'
          : isAr
            ? 'تم رفض التعديل وإلغاء طلب التوريد.'
            : 'Amendment rejected and order cancelled.',
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AMENDMENT_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await confirmWholesalerOrderReceipt(firebaseUser, orderId);
      setNotice(
        isAr
          ? `تم استلام الشحنة ${res.orderNumber} وتحويل ${res.batchesTransferred} تشغيلة إلى مخزون صيدليتك وإصدار الإيصال الثلاثي!`
          : `Received order ${res.orderNumber}; ${res.batchesTransferred} batches added and 3-party receipt issued!`,
      );
      await Promise.all([onRefresh(), loadReceipts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CONFIRM_RECEIPT_FAILED');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: isAr ? `كل الطلبات (${supplyOrders.length})` : `All (${supplyOrders.length})` },
              { id: 'active', label: isAr ? 'قيد المعالجة والشحن' : 'In Progress' },
              { id: 'completed', label: isAr ? 'سجل المشتريات المكتمل' : 'Completed Purchases' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-[34px] rounded-xl px-3.5 text-xs font-bold cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('wholesaler')}
            className="medora-gold-button inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold cursor-pointer"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span>{isAr ? 'طلب توريد جديد من سوق المذاخر' : 'New Supply Order'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-900">
          {notice}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
          {pt.common.noData}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ord) => {
            const linkedReceipt = receiptByOrderId.get(ord.orderId);
            return (
              <article
                key={ord.orderId}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p
                      className="font-latin text-xs font-bold text-[#0c3585] dark:text-[#f4d378]"
                      dir="ltr"
                    >
                      {ord.orderNumber}
                    </p>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      {ord.wholesalerName}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      {pt.statuses[ord.status] || ord.status} ·{' '}
                      {pt.paymentMethods[ord.paymentMethod] || ord.paymentMethod}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-latin text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {formatIqd(ord.totalIqd, isAr)}
                    </p>
                    {linkedReceipt && (
                      <button
                        type="button"
                        onClick={() =>
                          void printMedoraDocument(
                            <UnifiedReceiptPrintSheet receipt={linkedReceipt} lang={language} />,
                            linkedReceipt.receiptNumber,
                            {
                              onPrintAction: async () => {
                                const upd = await recordReceiptReprint(
                                  firebaseUser,
                                  linkedReceipt.receiptId,
                                ).catch(() => null);
                                if (upd) {
                                  setSupplyReceipts((prev) =>
                                    prev.map((r) => (r.receiptId === upd.receiptId ? upd : r)),
                                  );
                                }
                              },
                            },
                          )
                        }
                        className="mt-1.5 inline-flex min-h-[32px] items-center gap-1.5 rounded-xl bg-[#0c3585]/10 px-3 text-[11px] font-bold text-[#0c3585] hover:bg-[#0c3585]/15 dark:bg-[#d9a43b]/15 dark:text-[#f4d378] cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>
                          {isAr
                            ? `إيصال ${linkedReceipt.receiptNumber}`
                            : `Receipt ${linkedReceipt.receiptNumber}`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {ord.status === 'Amendment Proposed' && ord.amendmentPendingPharmacyApproval && canOrder && (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-bold">
                      {isAr ? 'مقترح تعديل من المذخر:' : 'Wholesaler proposed amendment:'}{' '}
                      {ord.amendmentNote}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAmendmentDecision(ord.orderId, true)}
                        className="min-h-[34px] rounded-lg bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        {isAr ? 'قبول التعديل' : 'Accept Amendment'}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleAmendmentDecision(ord.orderId, false)}
                        className="min-h-[34px] rounded-lg bg-rose-600 px-3 text-xs font-bold text-white cursor-pointer"
                      >
                        {isAr ? 'رفض وإلغاء الطلب' : 'Reject & Cancel'}
                      </button>
                    </div>
                  </div>
                )}

                {(ord.status === 'Shipped' || ord.status === 'Delivered') && canOrder && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleConfirmReceipt(ord.orderId)}
                    className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-extrabold disabled:opacity-50 cursor-pointer"
                  >
                    {isAr
                      ? 'تأكيد استلام البضاعة وإضافة التشغيلات للمخزون'
                      : 'Confirm Goods Receipt & Transfer Batches'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PharmacyStaffAndSecretariesSection({
  firebaseUser,
  workspace,
  language,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const [subTab, setSubTab] = useState<'pharmacy_staff' | 'secretaries'>('pharmacy_staff');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [syndicateNumber, setSyndicateNumber] = useState('');
  const [role, setRole] = useState<PharmacyStaffRole>('pharmacist');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddStaff = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await addPharmacyStaff(firebaseUser, {
        email: email.trim(),
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        syndicateNumber: syndicateNumber.trim() || undefined,
        role,
      });
      setEmail('');
      setFullName('');
      setPhone('');
      setSyndicateNumber('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ADD_STAFF_FAILED');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setSubTab('pharmacy_staff')}
          className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
            subTab === 'pharmacy_staff'
              ? 'bg-[#0c3585] text-white'
              : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-200'
          }`}
        >
          {isAr ? 'الصيادلة وكادر الصيدلية' : 'Pharmacists & Pharmacy Staff'}
        </button>
        <button
          type="button"
          onClick={() => setSubTab('secretaries')}
          className={`min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer ${
            subTab === 'secretaries'
              ? 'bg-[#0c3585] text-white'
              : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-200'
          }`}
        >
          {isAr ? 'سكرتارية الصيدلية المرتبطون' : 'Linked Pharmacy Secretaries'}
        </button>
      </div>

      {subTab === 'secretaries' ? (
        <EmployerSecretaryManagementSection
          firebaseUser={firebaseUser}
          employerType="pharmacy"
          language={language}
        />
      ) : (
        <div className="space-y-6">
          <form
            onSubmit={(e) => void handleAddStaff(e)}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'إضافة موظف أو صيدلي جديد' : 'Add Pharmacy Staff / Pharmacist'}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={isAr ? 'الاسم الكامل' : 'Full Name'}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isAr ? 'البريد الإلكتروني (Google)' : 'Google Email'}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as PharmacyStaffRole)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                {Object.entries(pt.roles)
                  .filter(([k]) => k !== 'owner')
                  .map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
              </select>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={isAr ? 'رقم الهاتف' : 'Phone'}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
              <input
                value={syndicateNumber}
                onChange={(e) => setSyndicateNumber(e.target.value)}
                placeholder={isAr ? 'رقم النقابة (للصيدلي)' : 'Syndicate # (if pharmacist)'}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              />
            </div>
            {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
            >
              {isAr ? 'إضافة للصيدلية' : 'Add Staff Member'}
            </button>
          </form>

          <div className="space-y-2.5">
            {workspace.staff.map((st) => (
              <div
                key={st.staffId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {st.fullName} · {pt.roles[st.role] || st.role}
                  </p>
                  <p className="font-latin text-slate-500 dark:text-slate-400" dir="ltr">
                    {st.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {pt.staffStatuses[st.status] || st.status}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void updatePharmacyStaff(firebaseUser, st.staffId, {
                        status: st.status === 'active' ? 'suspended' : 'active',
                      }).then(onRefresh)
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                  >
                    {st.status === 'active'
                      ? isAr
                        ? 'تعليق'
                        : 'Suspend'
                      : isAr
                        ? 'تفعيل'
                        : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PharmacyCommunicationsSection({
  firebaseUser,
  workspace,
  language,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [channelType, setChannelType] = useState<
    'patient_order' | 'doctor_clarification' | 'wholesaler_supply' | 'super_admin'
  >('super_admin');
  const [relatedId, setRelatedId] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await sendPharmacyCommunication(firebaseUser, {
        channelType,
        relatedId: relatedId.trim() || undefined,
        body: body.trim(),
      });
      setBody('');
      await onRefresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'الإشعارات الفورية' : 'Real-Time Pharmacy Notifications'}
        </h3>
        {workspace.notifications.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            {pharmacyTranslations[language].common.noData}
          </p>
        ) : (
          <div className="space-y-2">
            {workspace.notifications.slice(0, 20).map((n) => (
              <div
                key={n.notificationId}
                className={`rounded-xl border p-3 text-xs ${
                  n.isRead
                    ? 'border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-[#030712]/50'
                    : 'border-[#d9a43b]/45 bg-[#0c3585]/5 dark:border-[#d9a43b]/40 dark:bg-[#0c3585]/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900 dark:text-white">{n.title}</p>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() =>
                        void markPharmacyNotificationRead(firebaseUser, n.notificationId).then(
                          onRefresh,
                        )
                      }
                      className="text-[11px] font-bold text-[#0c3585] underline dark:text-[#f4d378] cursor-pointer"
                    >
                      {isAr ? 'تحديد كمقروء' : 'Mark Read'}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-slate-600 dark:text-slate-300">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'المراسلات والتواصل الرسمي' : 'Communications Log'}
        </h3>
        <form onSubmit={(e) => void handleSend(e)} className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as typeof channelType)}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            >
              <option value="super_admin">{isAr ? 'إدارة MEDORA العليا' : 'Super Admin'}</option>
              <option value="patient_order">{isAr ? 'طلب مريض' : 'Patient Order'}</option>
              <option value="doctor_clarification">{isAr ? 'توضيح للطبيب' : 'Doctor Rx'}</option>
              <option value="wholesaler_supply">{isAr ? 'مذخر توريد' : 'Wholesaler'}</option>
            </select>
            <input
              value={relatedId}
              onChange={(e) => setRelatedId(e.target.value)}
              placeholder={isAr ? 'معرف الطلب / الوصفة (اختياري)' : 'Related ID (optional)'}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <input
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={isAr ? 'نص الرسالة...' : 'Message...'}
              className="min-h-[40px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <button
              type="submit"
              disabled={sending}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isAr ? 'إرسال' : 'Send'}</span>
            </button>
          </div>
        </form>

        <div className="max-h-72 space-y-2 overflow-y-auto pt-2">
          {workspace.communications.map((msg) => (
            <div
              key={msg.messageId}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-[#030712]/60"
            >
              <p className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                {msg.senderName} (
                {pharmacyTranslations[language].communicationChannels[msg.channelType] || msg.channelType})
              </p>
              <p className="mt-0.5 text-slate-700 dark:text-slate-300">{msg.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PharmacyReportsSection({
  workspace,
  language,
}: {
  workspace: PharmacyWorkspaceData;
  language: Language;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];
  const r = workspace.reports;
  const completedSales = workspace.orders.filter((o) => o.status === 'Completed');
  const completedPurchases = (workspace.supplyOrders || []).filter((s) => s.status === 'Completed');
  const totalPurchasesIqd = completedPurchases.reduce((acc, s) => acc + (s.totalIqd || 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'مبيعات الطلبات (شهرياً)' : 'Monthly Sales Revenue'}
          </p>
          <p className="mt-1 font-latin text-2xl font-extrabold tabular-nums text-[#0c3585] dark:text-white">
            {formatIqd(r.monthlySalesIqd, isAr)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'مشتريات المذاخر المكتملة' : 'Completed Purchases (B2B)'}
          </p>
          <p className="mt-1 font-latin text-2xl font-extrabold tabular-nums text-[#d9a43b] dark:text-[#f4d378]">
            {formatIqd(totalPurchasesIqd, isAr)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'صافي الربح المقدر' : 'Estimated Gross Profit'}
          </p>
          <p className="mt-1 font-latin text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatIqd(r.estimatedGrossProfitIqd, isAr)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'المبيعات المكتملة / الملغاة' : 'Completed / Cancelled'}
          </p>
          <p className="mt-1 font-latin text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
            {r.completedOrdersCount} / {r.cancelledOrdersCount}
          </p>
        </div>
      </div>

      {/* Sales History & Purchase History Split */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? `سجل المبيعات المكتملة (${completedSales.length})` : `Completed Sales History (${completedSales.length})`}
          </h3>
          {completedSales.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">{pt.common.noData}</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {completedSales.slice(0, 12).map((o) => (
                <div key={o.orderId} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {o.orderNumber} · {o.patientName}
                    </p>
                    <p className="text-slate-500">{o.items.length} {isAr ? 'أصناف' : 'items'}</p>
                  </div>
                  <span className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                    {formatIqd(o.totalIqd, isAr)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? `سجل المشتريات المكتملة من المذاخر (${completedPurchases.length})` : `Completed Purchases History (${completedPurchases.length})`}
          </h3>
          {completedPurchases.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">{pt.common.noData}</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {completedPurchases.slice(0, 12).map((s) => (
                <div key={s.orderId} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {s.orderNumber} · {s.wholesalerName}
                    </p>
                    <p className="text-slate-500">{s.items.length} {isAr ? 'أصناف' : 'items'}</p>
                  </div>
                  <span className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                    {formatIqd(s.totalIqd, isAr)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'سجل التدقيق الأمني للصيدلية' : 'Pharmacy Audit Log'}
        </h3>
        <div className="space-y-2 text-xs">
          {workspace.auditLogs.length === 0 ? (
            <p className="py-6 text-center text-slate-500">{pt.common.noData}</p>
          ) : (
            workspace.auditLogs.slice(0, 25).map((log) => (
              <div
                key={log.logId}
                className="flex justify-between gap-2 border-b border-slate-100 pb-2 text-slate-700 dark:border-slate-800 dark:text-slate-200"
              >
                <span>
                  <strong className="text-slate-900 dark:text-white">{log.actorName}</strong> ·{' '}
                  {pt.auditActions[log.action] || log.action} · {log.details}
                </span>
                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                  {String(log.createdAt || '').slice(0, 16)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function PharmacySettingsSection({
  firebaseUser,
  workspace,
  language,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const p = workspace.pharmacyProfile;
  const [workingHours, setWorkingHours] = useState(p.workingDaysAndHours || '');
  const [is24Hours, setIs24Hours] = useState(Boolean(p.is24Hours));
  const [pickupAvailable, setPickupAvailable] = useState(p.pickupAvailable !== false);
  const [deliveryAvailable, setDeliveryAvailable] = useState(Boolean(p.deliveryAvailable));
  const [minimumOrderIqd, setMinimumOrderIqd] = useState(p.minimumOrderIqd || 0);
  const [zones, setZones] = useState<PharmacyDeliveryZone[]>(p.deliveryZones || []);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(false);
    try {
      const methods: Array<'cash_on_pickup' | 'cash_on_delivery'> = [];
      if (pickupAvailable) methods.push('cash_on_pickup');
      if (deliveryAvailable) methods.push('cash_on_delivery');
      await updatePharmacySettings(firebaseUser, {
        workingDaysAndHours: workingHours,
        is24Hours,
        pickupAvailable,
        deliveryAvailable,
        minimumOrderIqd,
        deliveryZones: zones,
        acceptedPaymentMethods: methods.length > 0 ? methods : ['cash_on_pickup'],
      });
      setSavedMsg(true);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSave(e)}
      className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
    >
      <h3 className="text-base font-bold text-slate-900 dark:text-white">
        {isAr ? 'إعدادات التشغيل والتوصيل والمناطق' : 'Operations, Fulfillment & Delivery Zones'}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
            {isAr ? 'ساعات وأيام العمل' : 'Working Hours'}
          </label>
          <input
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-200">
            {isAr ? 'الحد الأدنى للطلب (د.ع)' : 'Minimum Order (IQD)'}
          </label>
          <input
            type="number"
            min={0}
            value={minimumOrderIqd}
            onChange={(e) => setMinimumOrderIqd(Math.max(0, Number(e.target.value) || 0))}
            className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-6 text-xs text-slate-700 dark:text-slate-200">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={is24Hours} onChange={(e) => setIs24Hours(e.target.checked)} />
          <span>{isAr ? 'مناوبة 24 ساعة' : 'Open 24 Hours'}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pickupAvailable}
            onChange={(e) => setPickupAvailable(e.target.checked)}
          />
          <span>{isAr ? 'الاستلام من الصيدلية (نقدي)' : 'Cash on Pickup'}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={deliveryAvailable}
            onChange={(e) => setDeliveryAvailable(e.target.checked)}
          />
          <span>{isAr ? 'التوصيل المنزلي (الدفع عند التوصيل)' : 'Home Delivery (Cash on Delivery)'}</span>
        </label>
      </div>

      {/* Delivery Zones */}
      <div className="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {isAr ? 'مناطق وأجور التوصيل' : 'Delivery Zones & Fees'}
          </span>
          <button
            type="button"
            onClick={() =>
              setZones((prev) => [
                ...prev,
                {
                  zoneId: `zone-${Date.now()}`,
                  governorate: p.governorate || 'baghdad',
                  district: '',
                  feeIqd: 3000,
                  isActive: true,
                },
              ])
            }
            className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378] cursor-pointer"
          >
            + {isAr ? 'إضافة منطقة' : 'Add Zone'}
          </button>
        </div>

        {zones.map((z, idx) => (
          <div key={z.zoneId} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <select
              value={z.governorate}
              onChange={(e) =>
                setZones((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, governorate: e.target.value } : item)),
                )
              }
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            >
              {IRAQ_GOVERNORATES.map((g) => (
                <option key={g.id} value={g.id}>
                  {isAr ? g.ar : g.en}
                </option>
              ))}
            </select>
            <input
              value={z.district}
              onChange={(e) =>
                setZones((prev) =>
                  prev.map((item, i) => (i === idx ? { ...item, district: e.target.value } : item)),
                )
              }
              placeholder={isAr ? 'المنطقة / القضاء' : 'District'}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <input
              type="number"
              min={0}
              value={z.feeIqd}
              onChange={(e) =>
                setZones((prev) =>
                  prev.map((item, i) =>
                    i === idx ? { ...item, feeIqd: Math.max(0, Number(e.target.value) || 0) } : item,
                  ),
                )
              }
              placeholder={isAr ? 'الأجرة (د.ع)' : 'Fee (IQD)'}
              className="min-h-[38px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
            />
            <button
              type="button"
              onClick={() => setZones((prev) => prev.filter((_, i) => i !== idx))}
              className="min-h-[38px] rounded-xl border border-rose-300 bg-white px-3 text-xs font-bold text-rose-600 dark:border-rose-500/40 dark:bg-[#030712] dark:text-rose-400 cursor-pointer"
            >
              {isAr ? 'حذف' : 'Remove'}
            </button>
          </div>
        ))}
      </div>

      {savedMsg && (
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
          {isAr ? 'تم حفظ إعدادات الصيدلية بنجاح.' : 'Pharmacy settings saved.'}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="min-h-[42px] rounded-xl bg-[#0c3585] px-6 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
      >
        {saving ? '...' : pharmacyTranslations[language].common.save}
      </button>
    </form>
  );
}

export function PharmacySettingsWorkspace({
  firebaseUser,
  workspace,
  language,
  canManageSettings,
  canManageStaff,
  initialSubTab = 'operations',
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canManageSettings: boolean;
  canManageStaff: boolean;
  initialSubTab?: 'operations' | 'staff' | 'communications';
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [subTab, setSubTab] = useState<'operations' | 'staff' | 'communications'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        {canManageSettings && (
          <button
            type="button"
            onClick={() => setSubTab('operations')}
            className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              subTab === 'operations'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>{isAr ? 'ساعات العمل ومناطق التوصيل' : 'Operations & Delivery Zones'}</span>
          </button>
        )}
        {canManageStaff && (
          <button
            type="button"
            onClick={() => setSubTab('staff')}
            className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold cursor-pointer ${
              subTab === 'staff'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
            }`}
          >
            <UserCog className="h-3.5 w-3.5" />
            <span>{isAr ? 'الكادر والسكرتارية' : 'Staff & Linked Secretaries'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setSubTab('communications')}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold cursor-pointer ${
            subTab === 'communications'
              ? 'bg-[#0c3585] text-white'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
          <span>{isAr ? 'الإشعارات والتواصل الإداري' : 'Notifications & Official Log'}</span>
        </button>
      </div>

      {subTab === 'operations' && canManageSettings && (
        <PharmacySettingsSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          onRefresh={onRefresh}
        />
      )}

      {subTab === 'staff' && canManageStaff && (
        <PharmacyStaffAndSecretariesSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          onRefresh={onRefresh}
        />
      )}

      {(subTab === 'communications' ||
        (subTab === 'operations' && !canManageSettings) ||
        (subTab === 'staff' && !canManageStaff)) && (
        <PharmacyCommunicationsSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
