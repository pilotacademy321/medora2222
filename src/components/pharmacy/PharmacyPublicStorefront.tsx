import { useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  MapPin,
  Minus,
  Phone,
  Pill,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import { submitPatientPharmacyOrder } from '../../services/medicineFinderService';
import type { Language } from '../../types/medora';
import type {
  PublicPharmacyStorefrontData,
  PublicPharmacyStorefrontProduct,
} from '../../types/pharmacy';
import {
  buildPublicStorefrontUrl,
  formatIqd,
  PharmacyLogoAvatar,
  PharmacyQrCodeCanvas,
} from './PharmacyBrandUtils';

interface StorefrontCartLine {
  product: PublicPharmacyStorefrontProduct;
  quantity: number;
}

export function PharmacyPublicStorefront({
  storefront,
  language,
  mode,
  viewerRole = 'patient',
  firebaseUser,
  defaultGovernorate = '',
  defaultDistrict = '',
  defaultAddress = '',
  onOrderSubmitted,
  onBack,
}: {
  storefront: PublicPharmacyStorefrontData;
  language: Language;
  mode: 'pharmacy_preview' | 'public_browse';
  viewerRole?: 'patient' | 'doctor' | 'pharmacy';
  firebaseUser?: User;
  defaultGovernorate?: string;
  defaultDistrict?: string;
  defaultAddress?: string;
  onOrderSubmitted?: () => Promise<void> | void;
  onBack?: () => void;
}) {
  const isAr = language === 'ar';
  const ph = storefront.pharmacy;

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] =
    useState<PublicPharmacyStorefrontProduct | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Patient direct cart state inside public storefront
  const [cart, setCart] = useState<Record<string, StorefrontCartLine>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>(
    ph.pickupAvailable ? 'pickup' : 'delivery',
  );
  const [paymentMethod, setPaymentMethod] = useState<'cash_on_pickup' | 'cash_on_delivery'>(
    ph.pickupAvailable ? 'cash_on_pickup' : 'cash_on_delivery',
  );
  const [selectedZoneDistrict, setSelectedZoneDistrict] = useState(
    defaultDistrict || ph.deliveryZones?.[0]?.district || '',
  );
  const [deliveryAddress, setDeliveryAddress] = useState(defaultAddress);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const shareUrl = useMemo(
    () => buildPublicStorefrontUrl(ph.publicSlug || ph.uid),
    [ph.publicSlug, ph.uid],
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return storefront.products.filter((p) => {
      if (selectedCategory !== 'all' && p.therapeuticCategory !== selectedCategory) return false;
      if (!q) return true;
      return [p.scientificName, p.brandName, p.activeIngredient, p.strength, p.manufacturer]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [storefront.products, search, selectedCategory]);

  const cartLines = Object.values(cart).filter((l) => l.quantity > 0);
  const cartSubtotalIqd = cartLines.reduce(
    (acc, line) => acc + line.product.effectivePriceIqd * line.quantity,
    0,
  );

  const matchedZone = useMemo(() => {
    if (fulfillmentType !== 'delivery') return null;
    return (ph.deliveryZones || []).find(
      (z) =>
        z.isActive &&
        z.district.trim().toLowerCase() === selectedZoneDistrict.trim().toLowerCase(),
    );
  }, [ph.deliveryZones, fulfillmentType, selectedZoneDistrict]);

  const deliveryFeeIqd = fulfillmentType === 'delivery' ? matchedZone?.feeIqd ?? 0 : 0;
  const totalWithDeliveryIqd = cartSubtotalIqd + deliveryFeeIqd;

  const canOrderFromStorefront = mode === 'public_browse' && viewerRole === 'patient' && Boolean(firebaseUser);

  const updateCartQty = (product: PublicPharmacyStorefrontProduct, delta: number) => {
    setCart((prev) => {
      const current = prev[product.productId]?.quantity || 0;
      const next = Math.max(0, Math.min(product.availableQty, current + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[product.productId];
      else copy[product.productId] = { product, quantity: next };
      return copy;
    });
  };

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const handleSubmitOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || cartLines.length === 0) return;
    setSubmitting(true);
    setOrderError(null);
    setOrderSuccess(null);
    try {
      const { order } = await submitPatientPharmacyOrder(firebaseUser, {
        pharmacyUid: ph.uid,
        fulfillmentType,
        paymentMethod: fulfillmentType === 'pickup' ? 'cash_on_pickup' : paymentMethod,
        deliveryGovernorate: matchedZone?.governorate || defaultGovernorate || ph.governorate,
        deliveryDistrict: matchedZone?.district || selectedZoneDistrict || ph.district,
        deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress.trim() : undefined,
        expectedTotalIqd: totalWithDeliveryIqd,
        clientRequestKey: `sf_${ph.uid}_${Date.now()}`,
        items: cartLines.map((l) => ({
          productId: l.product.productId,
          quantity: l.quantity,
        })),
      });
      setCart({});
      setCheckoutOpen(false);
      setOrderSuccess(
        isAr
          ? `تم إرسال طلبك رقم ${order.orderNumber} إلى صيدلية ${ph.pharmacyNameAr} بنجاح.`
          : `Order ${order.orderNumber} submitted to ${ph.pharmacyNameEn}.`,
      );
      await onOrderSubmitted?.();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'ORDER_SUBMIT_FAILED');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Banner */}
      {mode === 'pharmacy_preview' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9a43b]/35 bg-[#0c3585]/5 px-5 py-3.5 text-xs dark:border-[#d9a43b]/30 dark:bg-[#07122a]">
          <div className="flex items-center gap-2 font-semibold text-[#0c3585] dark:text-[#f4d378]">
            <Eye className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
            <span>
              {isAr
                ? 'معاينة حية للواجهة العامة — هذا ما يشاهده المرضى والأطباء فقط (بأسعار البيع بالتجزئة وتوفر الصيدلية الفعلي).'
                : 'Live Public Storefront Preview — Exactly what Patients & Doctors see (retail prices & unexpired stock only).'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0c3585] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378] cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>{copiedUrl ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ رابط الصيدلية' : 'Copy Store URL'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowQrModal((prev) => !prev)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>{isAr ? 'رمز QR' : 'QR Code'}</span>
            </button>
          </div>
        </div>
      )}

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-[#0c3585] hover:bg-slate-50 dark:border-slate-700 dark:bg-[#07122a] dark:text-[#f4d378] cursor-pointer"
        >
          <span>{isAr ? 'العودة إلى دليل الصيدليات' : 'Back to Pharmacies Directory'}</span>
        </button>
      )}

      {/* QR Share Panel */}
      {showQrModal && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
          <div className="space-y-1.5 text-xs">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'مشاركة رابط وبطاقة الصيدلية الرقمية' : 'Shareable Storefront Link & QR Code'}
            </h4>
            <p className="text-slate-500 dark:text-slate-400">
              {isAr
                ? 'امسح الرمز أو شارك الرابط مع المرضى والأطباء لفتح واجهة صيدليتك داخل MEDORA.'
                : 'Scan QR or share link for instant patient & doctor storefront discovery.'}
            </p>
            <p className="font-latin text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]" dir="ltr">
              {shareUrl}
            </p>
          </div>
          <PharmacyQrCodeCanvas value={shareUrl} size={130} />
        </div>
      )}

      {/* Hero Cover + Identity Header */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="relative h-44 w-full bg-gradient-to-br from-[#061028] via-[#0c3585] to-[#1346ad] sm:h-52">
          {ph.coverImageUrl && (
            <img
              src={ph.coverImageUrl}
              alt={ph.pharmacyNameAr}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
          <div className="absolute bottom-4 start-6 end-6 flex flex-wrap items-end justify-between gap-4 text-white">
            <div className="flex items-center gap-4">
              <PharmacyLogoAvatar
                logoUrl={ph.logoUrl}
                name={isAr ? ph.pharmacyNameAr : ph.pharmacyNameEn || ph.pharmacyNameAr}
                sizeClass="h-16 w-16 sm:h-20 sm:w-20 ring-4 ring-white/90"
              />
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#f4d378]">
                  <CheckCircle2 className="h-4 w-4 text-[#f4d378]" />
                  <span>{isAr ? 'صيدلية معتمدة من MEDORA' : 'MEDORA Verified Pharmacy'}</span>
                  {ph.featuredApproved && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1 text-amber-200">
                        <Sparkles className="h-3.5 w-3.5" />
                        {isAr ? 'شريك مميز' : 'Featured Partner'}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="mt-1 text-xl font-bold sm:text-2xl">
                  {isAr ? ph.pharmacyNameAr : ph.pharmacyNameEn || ph.pharmacyNameAr}
                </h1>
                {(ph.taglineAr || ph.taglineEn) && (
                  <p className="mt-0.5 text-xs text-slate-100/90">
                    {isAr ? ph.taglineAr || ph.taglineEn : ph.taglineEn || ph.taglineAr}
                  </p>
                )}
              </div>
            </div>

            {mode === 'public_browse' && (
              <button
                type="button"
                onClick={() => setShowQrModal((prev) => !prev)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-white/15 px-3 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/25 cursor-pointer"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>QR</span>
              </button>
            )}
          </div>
        </div>

        {/* Storefront Meta Strip */}
        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 p-5 text-xs dark:border-slate-800 sm:grid-cols-4">
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">
                {ph.governorate} · {ph.district}
              </p>
              <p className="text-slate-500 dark:text-slate-400">{ph.address}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">
                {ph.is24Hours ? (isAr ? 'مفتوح 24 ساعة' : 'Open 24 Hours') : ph.workingDaysAndHours}
              </p>
              {ph.professionalPhone && (
                <p className="flex items-center gap-1 font-latin text-slate-500" dir="ltr">
                  <Phone className="h-3 w-3" />
                  {ph.professionalPhone}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
            <div>
              <p className="font-bold text-slate-900 dark:text-white">
                {ph.pickupAvailable ? (isAr ? 'استلام من الصيدلية' : 'Pickup') : ''}
                {ph.pickupAvailable && ph.deliveryAvailable ? ' · ' : ''}
                {ph.deliveryAvailable
                  ? isAr
                    ? 'توصيل متاح'
                    : 'Delivery Available'
                  : ''}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                {ph.minimumOrderIqd > 0
                  ? `${isAr ? 'الحد الأدنى' : 'Min'}: ${formatIqd(ph.minimumOrderIqd, isAr)}`
                  : isAr
                    ? 'بدون حد أدنى للطلب'
                    : 'No minimum order'}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Pill className="mt-0.5 h-4 w-4 shrink-0 text-[#0c3585] dark:text-[#f4d378]" />
            <div>
              <p className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                {storefront.products.length} {isAr ? 'دواء متوفر' : 'Available Items'}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                {storefront.specialOffers.length > 0
                  ? `${storefront.specialOffers.length} ${isAr ? 'عروض معتمدة' : 'Approved Offers'}`
                  : isAr
                    ? 'مخزون محدث وصلاحية موثقة'
                    : 'Verified unexpired stock'}
              </p>
            </div>
          </div>
        </div>

        {(ph.aboutAr || ph.aboutEn) && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-[#030712]/60 dark:text-slate-300">
            {isAr ? ph.aboutAr || ph.aboutEn : ph.aboutEn || ph.aboutAr}
          </div>
        )}
      </section>

      {/* Super-Admin Approved Promotional Banner ONLY */}
      {ph.approvedPromoBanner && (
        <section className="overflow-hidden rounded-2xl border border-[#d9a43b]/35 bg-gradient-to-r from-[#061028] to-[#0c3585] p-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#f4d378]">
                {isAr ? 'عرض ترويجي معتمد من MEDORA' : 'MEDORA Approved Promotion'}
              </p>
              <h3 className="text-lg font-bold">
                {isAr ? ph.approvedPromoBanner.titleAr : ph.approvedPromoBanner.titleEn}
              </h3>
              <p className="text-xs text-slate-100/90">
                {isAr ? ph.approvedPromoBanner.bodyAr : ph.approvedPromoBanner.bodyEn}
              </p>
            </div>
            {ph.approvedPromoBanner.imageUrl && (
              <img
                src={ph.approvedPromoBanner.imageUrl}
                alt={ph.approvedPromoBanner.titleAr}
                referrerPolicy="no-referrer"
                className="h-24 w-44 rounded-xl object-cover ring-2 ring-[#f4d378]/40"
              />
            )}
          </div>
        </section>
      )}

      {/* Approved Special Offers */}
      {storefront.specialOffers.length > 0 && (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {storefront.specialOffers.map((off) => (
            <div
              key={off.offerId}
              className="rounded-2xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 p-4 dark:border-[#d9a43b]/30 dark:bg-[#07122a]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                  <Tag className="h-3.5 w-3.5" />
                  {isAr ? off.titleAr : off.titleEn || off.titleAr}
                </span>
                {off.discountPercent && (
                  <span className="font-latin text-xs font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                    -{off.discountPercent}%
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{off.description}</p>
              {off.validUntil && (
                <p className="mt-2 font-latin text-[11px] text-slate-500 tabular-nums">
                  {isAr ? `ساري حتى: ${off.validUntil}` : `Valid until: ${off.validUntil}`}
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {orderSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
          {orderSuccess}
        </div>
      )}

      {/* Search + Category Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-[#07122a]">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              isAr
                ? 'ابحث عن دواء بالاسم العلمي أو التجاري أو المادة الفعالة...'
                : 'Search medicine by generic, brand, or ingredient...'
            }
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`min-h-[34px] rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#0c3585] text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200'
            }`}
          >
            {isAr ? 'جميع الأصناف' : 'All'}
          </button>
          {storefront.categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-[34px] rounded-xl px-3 text-xs font-bold transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Patient Cart Summary Bar */}
      {canOrderFromStorefront && cartLines.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9a43b]/50 bg-[#d9a43b]/10 px-5 py-3.5 dark:border-[#d9a43b]/40 dark:bg-[#0c3585]/30">
          <div className="text-xs">
            <p className="font-bold text-slate-900 dark:text-white">
              {isAr
                ? `${cartLines.length} أصناف في سلة الطلب`
                : `${cartLines.length} item(s) in order basket`}
            </p>
            <p className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
              {formatIqd(cartSubtotalIqd, isAr)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>{isAr ? 'إتمام طلب الصيدلية' : 'Complete Pharmacy Order'}</span>
          </button>
        </div>
      )}

      {/* Clean 3-Column Medicine Cards Grid */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {isAr
            ? 'لا توجد أدوية مطابقة لخيارات البحث حالياً.'
            : 'No published medicines match your search criteria.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((item) => {
            const inCartQty = cart[item.productId]?.quantity || 0;
            return (
              <article
                key={item.productId}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-[#0c3585]/40 dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b]/40"
              >
                <div>
                  <div className="flex items-start gap-3">
                    {item.imageReference ? (
                      <img
                        src={item.imageReference}
                        alt={item.brandName}
                        referrerPolicy="no-referrer"
                        className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#0c3585] dark:border-slate-700 dark:bg-[#030712] dark:text-[#f4d378]">
                        <Pill className="h-7 w-7" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-[#0c3585] dark:text-[#f4d378]">
                        {item.therapeuticCategory} ·{' '}
                        {item.requiresPrescription
                          ? isAr
                            ? 'يتطلب وصفة'
                            : 'Rx'
                          : isAr
                            ? 'بدون وصفة'
                            : 'OTC'}
                      </p>
                      <h4 className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-white">
                        {item.brandName}
                      </h4>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {item.scientificName} · {item.strength}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">
                    <span>{item.dosageForm}</span>
                    <span> · </span>
                    <span>{item.packSize}</span>
                    {item.manufacturer && (
                      <>
                        <span> · </span>
                        <span>{item.manufacturer}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-latin text-base font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                        {formatIqd(item.effectivePriceIqd, isAr)}
                      </span>
                      {item.discountPriceIqd && item.discountPriceIqd < item.sellingPriceIqd && (
                        <span className="font-latin text-[11px] line-through tabular-nums text-slate-400">
                          {formatIqd(item.sellingPriceIqd, isAr)}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] font-semibold tabular-nums ${
                        item.availabilityStatus === 'low_stock'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {item.availabilityStatus === 'low_stock'
                        ? isAr
                          ? `كمية محدودة (${item.availableQty})`
                          : `Low stock (${item.availableQty})`
                        : isAr
                          ? `متوفر (${item.availableQty})`
                          : `In Stock (${item.availableQty})`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(item)}
                      className="min-h-[34px] rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      {isAr ? 'التفاصيل' : 'Details'}
                    </button>
                    {canOrderFromStorefront && (
                      inCartQty > 0 ? (
                        <div className="inline-flex items-center gap-1 rounded-xl border border-[#0c3585]/30 bg-slate-50 px-1.5 py-1 dark:border-[#d9a43b]/40 dark:bg-[#030712]">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item, -1)}
                            className="p-1 text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="min-w-[18px] text-center font-latin text-xs font-bold tabular-nums text-slate-900 dark:text-white">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item, 1)}
                            className="p-1 text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateCartQty(item, 1)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-[#0c3585] px-3 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>{isAr ? 'أضف' : 'Add'}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Medicine Details Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                  {selectedProduct.therapeuticCategory}
                </p>
                <h3 className="mt-0.5 text-lg font-bold text-slate-900 dark:text-white">
                  {selectedProduct.brandName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'الاسم العلمي' : 'Scientific Name'}</dt>
                <dd className="mt-0.5 font-bold text-slate-900 dark:text-white">
                  {selectedProduct.scientificName}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'المادة الفعالة' : 'Active Ingredient'}</dt>
                <dd className="mt-0.5 font-bold text-slate-900 dark:text-white">
                  {selectedProduct.activeIngredient}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'التركيز والشكل' : 'Strength & Form'}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                  {selectedProduct.strength} · {selectedProduct.dosageForm}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'حجم العبوة' : 'Pack Size'}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                  {selectedProduct.packSize}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'سعر التجزئة' : 'Retail Price'}</dt>
                <dd className="mt-0.5 font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                  {formatIqd(selectedProduct.effectivePriceIqd, isAr)}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#030712]">
                <dt className="text-slate-500">{isAr ? 'الشركة / المنشأ' : 'Manufacturer'}</dt>
                <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                  {[selectedProduct.manufacturer, selectedProduct.country].filter(Boolean).join(' · ') || '—'}
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              {canOrderFromStorefront && (
                <button
                  type="button"
                  onClick={() => {
                    updateCartQty(selectedProduct, 1);
                    setSelectedProduct(null);
                  }}
                  className="min-h-[40px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                >
                  {isAr ? 'إضافة إلى السلة' : 'Add to Basket'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Patient Checkout Modal from Storefront */}
      {checkoutOpen && canOrderFromStorefront && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleSubmitOrder}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isAr ? `طلب من ${ph.pharmacyNameAr}` : `Order from ${ph.pharmacyNameEn}`}
              </h3>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {orderError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {orderError}
              </div>
            )}

            <div className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
              {cartLines.map((l) => (
                <div key={l.product.productId} className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {l.product.brandName} × {l.quantity}
                  </span>
                  <span className="font-latin font-bold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                    {formatIqd(l.product.effectivePriceIqd * l.quantity, isAr)}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'طريقة الاستلام' : 'Fulfillment'}
                </label>
                <select
                  value={fulfillmentType}
                  onChange={(e) => {
                    const next = e.target.value as 'pickup' | 'delivery';
                    setFulfillmentType(next);
                    setPaymentMethod(next === 'pickup' ? 'cash_on_pickup' : 'cash_on_delivery');
                  }}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                >
                  {ph.pickupAvailable && (
                    <option value="pickup">{isAr ? 'استلام من الصيدلية' : 'Pickup'}</option>
                  )}
                  {ph.deliveryAvailable && (
                    <option value="delivery">{isAr ? 'توصيل منزلي' : 'Delivery'}</option>
                  )}
                </select>
              </div>
              {fulfillmentType === 'delivery' && (
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    {isAr ? 'منطقة التوصيل' : 'Zone'}
                  </label>
                  <select
                    value={selectedZoneDistrict}
                    onChange={(e) => setSelectedZoneDistrict(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  >
                    {(ph.deliveryZones || []).map((z) => (
                      <option key={z.zoneId} value={z.district}>
                        {z.district} ({formatIqd(z.feeIqd, isAr)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {fulfillmentType === 'delivery' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'عنوان التوصيل *' : 'Delivery Address *'}
                </label>
                <input
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
            )}

            <div className="rounded-xl bg-[#0c3585]/5 p-3 text-xs dark:bg-[#030712]">
              <div className="flex justify-between font-bold text-[#0c3585] dark:text-[#f4d378]">
                <span>{isAr ? 'الإجمالي المستحق عند التسليم' : 'Total Due'}</span>
                <span className="font-latin tabular-nums">
                  {formatIqd(totalWithDeliveryIqd, isAr)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="min-h-[40px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] rounded-xl bg-[#0c3585] px-6 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? '...' : isAr ? 'تأكيد وإرسال الطلب' : 'Submit Order'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
