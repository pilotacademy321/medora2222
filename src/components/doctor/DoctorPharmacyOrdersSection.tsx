import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Loader2,
  Package,
  Pill,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { Language } from '../../types/medora';
import type {
  DoctorPharmacyCatalogProduct,
  MedoraFulfillmentType,
  MedoraPaymentMethod,
  MedoraReceiptRecord,
  PharmacyDoctorOrder,
} from '../../types/commerce';
import {
  confirmDoctorPharmacyOrderReceipt,
  createDoctorPharmacyOrder,
  fetchDoctorPharmacyCatalog,
  fetchDoctorPharmacyOrders,
  recordReceiptReprint,
  type DoctorPharmacySummary,
} from '../../services/commerceService';
import { printMedoraDocument } from '../../utils/printAndPdf';
import { UnifiedReceiptPrintSheet } from '../shared/MedoraPrintableDocument';
import { MedoraReceiptsLedgerPanel } from '../shared/MedoraReceiptsLedgerPanel';

interface DoctorPharmacyOrdersSectionProps {
  firebaseUser: User;
  doctorUid: string;
  defaultClinicAddress?: string;
  language: Language;
}

export const DoctorPharmacyOrdersSection: React.FC<DoctorPharmacyOrdersSectionProps> = ({
  firebaseUser,
  doctorUid,
  defaultClinicAddress = '',
  language,
}) => {
  const isAr = language === 'ar';
  const [subTab, setSubTab] = useState<'catalog' | 'orders' | 'receipts'>('catalog');
  const [pharmacies, setPharmacies] = useState<DoctorPharmacySummary[]>([]);
  const [catalog, setCatalog] = useState<DoctorPharmacyCatalogProduct[]>([]);
  const [orders, setOrders] = useState<PharmacyDoctorOrder[]>([]);
  const [receipts, setReceipts] = useState<MedoraReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [selectedPharmacyUid, setSelectedPharmacyUid] = useState('');
  const [cart, setCart] = useState<Record<string, { item: DoctorPharmacyCatalogProduct; qty: number }>>({});
  const [paymentMethod, setPaymentMethod] = useState<MedoraPaymentMethod>('cash_on_delivery');
  const [fulfillmentType, setFulfillmentType] = useState<MedoraFulfillmentType>('seller_delivery');
  const [deliveryAddress, setDeliveryAddress] = useState(defaultClinicAddress);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, ordRes] = await Promise.all([
        fetchDoctorPharmacyCatalog(firebaseUser, {
          ...(searchQ.trim() ? { q: searchQ.trim() } : {}),
          ...(selectedPharmacyUid ? { pharmacyUid: selectedPharmacyUid } : {}),
        }),
        fetchDoctorPharmacyOrders(firebaseUser),
      ]);
      setPharmacies(catRes.pharmacies);
      setCatalog(catRes.items);
      setOrders(ordRes.orders);
      setReceipts(ordRes.receipts);
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'LOAD_FAILED',
      });
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, searchQ, selectedPharmacyUid]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const cartPharmacyUid = cartItems[0]?.item.pharmacyUid || '';
  const cartTotalIqd = useMemo(
    () => cartItems.reduce((sum, c) => sum + c.item.effectivePriceIqd * c.qty, 0),
    [cartItems],
  );

  const addToCart = (item: DoctorPharmacyCatalogProduct) => {
    if (cartPharmacyUid && cartPharmacyUid !== item.pharmacyUid) {
      setNotice({
        type: 'err',
        text: isAr
          ? 'يمكن الطلب من صيدلية واحدة في كل طلبية. أفرغ السلة أو أكمل الطلب الحالي أولاً.'
          : 'Orders are scoped per pharmacy. Complete or clear current cart first.',
      });
      return;
    }
    setNotice(null);
    setCart((prev) => {
      const existing = prev[item.productId];
      const nextQty = Math.min(item.availableQty, (existing?.qty || 0) + 1);
      return { ...prev, [item.productId]: { item, qty: nextQty } };
    });
  };

  const updateCartQty = (productId: string, nextQty: number) => {
    setCart((prev) => {
      const entry = prev[productId];
      if (!entry) return prev;
      if (nextQty <= 0) {
        const clone = { ...prev };
        delete clone[productId];
        return clone;
      }
      return {
        ...prev,
        [productId]: { ...entry, qty: Math.min(entry.item.availableQty, nextQty) },
      };
    });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartPharmacyUid || cartItems.length === 0) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const order = await createDoctorPharmacyOrder(firebaseUser, {
        pharmacyUid: cartPharmacyUid,
        items: cartItems.map((c) => ({ productId: c.item.productId, quantity: c.qty })),
        paymentMethod,
        fulfillmentType,
        deliveryAddress: fulfillmentType === 'seller_delivery' ? deliveryAddress : undefined,
        notes: notes.trim() || undefined,
      });
      setCart({});
      setNotes('');
      setOrders((prev) => [order, ...prev]);
      setSubTab('orders');
      setNotice({
        type: 'ok',
        text: isAr
          ? `تم إرسال الطلب #${order.orderNumber} إلى الصيدلية بنجاح.`
          : `Order #${order.orderNumber} submitted to pharmacy.`,
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'ORDER_FAILED',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    setBusyOrderId(orderId);
    setNotice(null);
    try {
      const res = await confirmDoctorPharmacyOrderReceipt(firebaseUser, orderId);
      setOrders((prev) => prev.map((o) => (o.orderId === orderId ? res.order : o)));
      setReceipts((prev) => [
        res.receipt,
        ...prev.filter((r) => r.receiptId !== res.receipt.receiptId),
      ]);
      setNotice({
        type: 'ok',
        text: isAr
          ? `تم تأكيد استلام الطلب وإصدار الإيصال الموحد ${res.receipt.receiptNumber}.`
          : `Receipt confirmed and unified receipt ${res.receipt.receiptNumber} issued.`,
      });
    } catch (err) {
      setNotice({
        type: 'err',
        text: err instanceof Error ? err.message : 'CONFIRM_FAILED',
      });
    } finally {
      setBusyOrderId(null);
    }
  };

  const printLinkedReceipt = (order: PharmacyDoctorOrder) => {
    const found = receipts.find((r) => r.orderId === order.orderId);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAr ? 'طلبات الأدوية والمستلزمات من الصيدليات' : 'Pharmacy Medical Supply Orders'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'تصفح المنتجات المعتمدة لدى الصيدليات، أنشئ طلب العيادة، وتابع التوصيل والإيصالات الثلاثية.'
              : 'Browse approved pharmacy catalogs, place clinic supply orders, confirm delivery, and print unified receipts.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['catalog', 'orders', 'receipts'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSubTab(tab)}
              className={`h-9 rounded-xl px-3.5 text-xs font-bold transition cursor-pointer ${
                subTab === tab
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab === 'catalog'
                ? isAr
                  ? 'الكتالوج والسلة'
                  : 'Catalog & Cart'
                : tab === 'orders'
                  ? isAr
                    ? `طلباتي (${orders.length})`
                    : `Orders (${orders.length})`
                  : isAr
                    ? `الإيصالات (${receipts.length})`
                    : `Receipts (${receipts.length})`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {notice && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-bold ${
            notice.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {subTab === 'catalog' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className="xl:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="h-4 w-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={isAr ? 'ابحث باسم الدواء أو المادة العلمية أو الصيدلية...' : 'Search medicine or pharmacy...'}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] ps-9 pe-3 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <select
                value={selectedPharmacyUid}
                onChange={(e) => setSelectedPharmacyUid(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3 text-xs text-slate-900 dark:text-white"
              >
                <option value="">{isAr ? 'جميع الصيدليات المعتمدة' : 'All Approved Pharmacies'}</option>
                {pharmacies.map((ph) => (
                  <option key={ph.pharmacyUid} value={ph.pharmacyUid}>
                    {isAr ? ph.pharmacyNameAr : ph.pharmacyNameEn || ph.pharmacyNameAr} ({ph.governorate})
                  </option>
                ))}
              </select>
            </div>

            {loading && catalog.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-xs text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-[#0c3585]" />
                {isAr ? 'جاري تحميل منتجات الصيدليات...' : 'Loading pharmacy products...'}
              </div>
            ) : catalog.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-xs text-slate-500">
                {isAr ? 'لا توجد أصناف متوفرة مطابقة لبحثك حالياً.' : 'No matching active products found.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {catalog.map((item) => (
                  <div
                    key={item.productId}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 flex flex-col justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 overflow-hidden flex items-center justify-center">
                        {item.imageReference ? (
                          <img
                            src={item.imageReference}
                            alt={item.brandName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Pill className="h-7 w-7 text-[#0c3585] dark:text-[#f4d378]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {item.brandName} {item.strength}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {item.scientificName} · {item.packSize || item.dosageForm}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-[#0c3585] dark:text-[#f4d378] truncate">
                          {isAr ? item.pharmacyNameAr : item.pharmacyNameEn || item.pharmacyNameAr}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px]">
                          <span className="rounded bg-emerald-100 dark:bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                            {isAr ? `متوفر: ${item.availableQty}` : `Stock: ${item.availableQty}`}
                          </span>
                          {item.nearestExpiryDate && (
                            <span className="text-slate-500 dark:text-slate-400">
                              {isAr ? 'أقرب نفاذ:' : 'Exp:'} {item.nearestExpiryDate}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                          {item.effectivePriceIqd.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                        </p>
                        {item.discountPriceIqd && (
                          <p className="text-[10.5px] line-through text-slate-400">
                            {item.sellingPriceIqd.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="medora-gold-button inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-[#040917] cursor-pointer"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        {isAr ? 'أضف للطلب' : 'Add'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cart Checkout Sidebar */}
          <form
            onSubmit={handleSubmitOrder}
            className="xl:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 shadow-sm h-fit space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-[#d9a43b]" />
                {isAr ? 'سلة طلب العيادة' : 'Clinic Order Cart'}
              </h3>
              {cartItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart({})}
                  className="text-[11px] font-semibold text-rose-500 cursor-pointer"
                >
                  {isAr ? 'إفراغ' : 'Clear'}
                </button>
              )}
            </div>

            {cartItems.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                {isAr ? 'أضف مستلزمات أو أدوية من القائمة المجاورة للبدء.' : 'Add products from catalog to build your order.'}
              </p>
            ) : (
              <>
                <div className="space-y-2.5 max-h-60 overflow-y-auto">
                  {cartItems.map(({ item, qty }) => (
                    <div
                      key={item.productId}
                      className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-900/70 p-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {item.brandName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {item.effectivePriceIqd.toLocaleString()} × {qty}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={item.availableQty}
                          value={qty}
                          onChange={(e) => updateCartQty(item.productId, Number(e.target.value))}
                          className="w-14 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.productId, 0)}
                          className="text-rose-500 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'الاستلام / التوصيل' : 'Fulfillment'}
                    </label>
                    <select
                      value={fulfillmentType}
                      onChange={(e) => setFulfillmentType(e.target.value as MedoraFulfillmentType)}
                      className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3"
                    >
                      <option value="seller_delivery">{isAr ? 'توصيل من الصيدلية للعيادة' : 'Pharmacy Delivery'}</option>
                      <option value="buyer_pickup">{isAr ? 'استلام مباشر من الصيدلية' : 'Clinic Pickup'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'طريقة التسوية' : 'Payment Method'}
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as MedoraPaymentMethod)}
                      className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3"
                    >
                      <option value="cash_on_delivery">{isAr ? 'دفع عند التوصيل' : 'Cash on Delivery'}</option>
                      <option value="cash_on_pickup">{isAr ? 'دفع عند الاستلام' : 'Cash on Pickup'}</option>
                      <option value="direct">{isAr ? 'دفع مباشر' : 'Direct'}</option>
                      <option value="credit_account">{isAr ? 'حساب آجل' : 'Credit Account'}</option>
                    </select>
                  </div>

                  {fulfillmentType === 'seller_delivery' && (
                    <div>
                      <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {isAr ? 'عنوان توصيل العيادة' : 'Clinic Address'}
                      </label>
                      <input
                        type="text"
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {isAr ? 'ملاحظات للصيدلية' : 'Notes'}
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 font-bold">
                    <span>{isAr ? 'الإجمالي التقديري' : 'Subtotal'}</span>
                    <span className="text-sm text-[#0c3585] dark:text-[#f4d378]">
                      {cartTotalIqd.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="medora-gold-button w-full h-10 rounded-xl text-xs font-extrabold text-[#040917] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isAr ? 'إرسال الطلب للصيدلية' : 'Submit Order to Pharmacy'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {subTab === 'orders' && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-xs text-slate-500">
              {isAr ? 'لا توجد طلبات مرسلة للصيدليات بعد.' : 'No orders placed yet.'}
            </div>
          ) : (
            orders.map((ord) => {
              const canConfirm =
                ord.status === 'Ready for Pickup' ||
                ord.status === 'Out for Delivery' ||
                ord.status === 'Delivered';
              return (
                <div
                  key={ord.orderId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 shadow-sm space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <Package className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                      <div>
                        <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {ord.orderNumber} · {ord.pharmacyName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {String(ord.createdAt || '').slice(0, 16).replace('T', ' ')}
                          {ord.receiptNumber ? ` · ${isAr ? 'إيصال' : 'Receipt'}: ${ord.receiptNumber}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#0c3585]/10 dark:bg-[#d9a43b]/15 px-2.5 py-1 text-[11px] font-bold text-[#0c3585] dark:text-[#f4d378]">
                        {ord.status}
                      </span>
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        {ord.totalIqd.toLocaleString()} {isAr ? 'د.ع' : 'IQD'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {ord.items.map((it) => (
                      <span
                        key={it.itemId}
                        className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-200"
                      >
                        {it.medicineName} × {it.confirmedQty}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {canConfirm && (
                      <button
                        type="button"
                        disabled={busyOrderId === ord.orderId}
                        onClick={() => void handleConfirmReceipt(ord.orderId)}
                        className="medora-gold-button inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
                      >
                        {busyOrderId === ord.orderId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {isAr ? 'تأكيد الاستلام وإصدار الإيصال' : 'Confirm Receipt & Issue Receipt'}
                      </button>
                    )}
                    {ord.status === 'Completed' && ord.receiptId && (
                      <button
                        type="button"
                        onClick={() => printLinkedReceipt(ord)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        {isAr ? 'عرض وطباعة الإيصال (A4 / حراري)' : 'Print Receipt (A4 / Thermal)'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {subTab === 'receipts' && (
        <MedoraReceiptsLedgerPanel
          firebaseUser={firebaseUser}
          lang={language}
          viewerUid={doctorUid}
          defaultFilterType="pharmacy_to_doctor"
          titleAr="إيصالات مشتريات العيادة من الصيدليات"
          titleEn="Clinic Pharmacy Supply Receipts"
        />
      )}
    </div>
  );
};
