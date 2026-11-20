import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Megaphone,
  Package,
  PauseCircle,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import {
  createAdminCanonicalMedicine,
  fetchAdminPharmaciesOverview,
  reviewAdminPharmacyCampaignRequest,
  reviewAdminPharmacyMarketing,
  reviewAdminPharmacySpecialOffer,
  updateAdminCanonicalMedicine,
  updateAdminPharmacyStatus,
  type AdminPharmaciesOverview,
} from '../../services/medicineFinderService';
import type { Language } from '../../types/medora';
import type { DosageForm, PharmacyEntityStatus, PharmacyProfileDocument } from '../../types/pharmacy';

interface AdminPharmaciesSectionProps {
  firebaseUser: User;
  language: Language;
}

type PharmacyAdminTab = 'pharmacies' | 'marketing_review' | 'canonical' | 'expired_batches' | 'orders';

const DOSAGE_FORMS: DosageForm[] = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'drops',
  'inhaler',
  'suppository',
  'powder',
  'other',
];

export function AdminPharmaciesSection({ firebaseUser, language }: AdminPharmaciesSectionProps) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];

  const [activeTab, setActiveTab] = useState<PharmacyAdminTab>('pharmacies');
  const [overview, setOverview] = useState<AdminPharmaciesOverview>({
    pharmacies: [],
    orders: [],
    staff: [],
    canonicalMedicines: [],
    expiredBatches: [],
    specialOffers: [],
    campaignRequests: [],
  });
  const [marketingReviewNotes, setMarketingReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const [medSearch, setMedSearch] = useState('');
  const [creatingMed, setCreatingMed] = useState(false);
  const [updatingMedId, setUpdatingMedId] = useState<string | null>(null);
  const [newMed, setNewMed] = useState({
    scientificName: '',
    activeIngredient: '',
    strength: '',
    dosageForm: 'tablet' as DosageForm,
    packSize: '',
    manufacturer: '',
    country: '',
    barcode: '',
    therapeuticCategory: '',
    brandNamesRaw: '',
    requiresPrescription: true,
    controlledDrug: false,
  });

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminPharmaciesOverview(firebaseUser);
      setOverview(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : isAr
            ? 'تعذر تحميل بيانات حوكمة الصيدليات.'
            : 'Failed to load pharmacy governance data.',
      );
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, isAr]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const handleStatusChange = async (
    pharmacy: PharmacyProfileDocument,
    nextStatus: Extract<PharmacyEntityStatus, 'Approved' | 'Suspended' | 'Deactivated' | 'Requires Changes' | 'Rejected'>,
  ) => {
    setUpdatingUid(pharmacy.uid);
    setError(null);
    setNotice(null);
    try {
      const reason = statusNotes[pharmacy.uid]?.trim() || undefined;
      const { pharmacy: updated } = await updateAdminPharmacyStatus(
        firebaseUser,
        pharmacy.uid,
        nextStatus,
        reason,
      );
      setOverview((prev) => ({
        ...prev,
        pharmacies: prev.pharmacies.map((p) => (p.uid === updated.uid ? updated : p)),
      }));
      const statusLabel = pt.statuses[nextStatus] || nextStatus;
      setNotice(
        isAr
          ? `تم تحديث حالة الصيدلية إلى ${statusLabel}.`
          : `Pharmacy status updated to ${statusLabel}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PHARMACY_STATUS_UPDATE_FAILED');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleCreateCanonicalMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMed.scientificName.trim() || !newMed.activeIngredient.trim() || !newMed.strength.trim() || !newMed.packSize.trim()) {
      return;
    }
    setCreatingMed(true);
    setError(null);
    setNotice(null);
    try {
      const brandNames = newMed.brandNamesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { medicine } = await createAdminCanonicalMedicine(firebaseUser, {
        scientificName: newMed.scientificName.trim(),
        activeIngredient: newMed.activeIngredient.trim(),
        strength: newMed.strength.trim(),
        dosageForm: newMed.dosageForm,
        packSize: newMed.packSize.trim(),
        manufacturer: newMed.manufacturer.trim() || undefined,
        country: newMed.country.trim() || undefined,
        barcode: newMed.barcode.trim() || undefined,
        therapeuticCategory: newMed.therapeuticCategory.trim() || undefined,
        brandNames,
        requiresPrescription: newMed.requiresPrescription,
        controlledDrug: newMed.controlledDrug,
      });
      setOverview((prev) => ({
        ...prev,
        canonicalMedicines: [medicine, ...prev.canonicalMedicines],
      }));
      setNewMed({
        scientificName: '',
        activeIngredient: '',
        strength: '',
        dosageForm: 'tablet',
        packSize: '',
        manufacturer: '',
        country: '',
        barcode: '',
        therapeuticCategory: '',
        brandNamesRaw: '',
        requiresPrescription: true,
        controlledDrug: false,
      });
      setNotice(isAr ? 'تمت إضافة الدواء المرجعي الموحد.' : 'Canonical medicine added to catalog.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CANONICAL_CREATE_FAILED');
    } finally {
      setCreatingMed(false);
    }
  };

  const handleToggleCanonicalStatus = async (medicineId: string, currentStatus: 'active' | 'deprecated') => {
    setUpdatingMedId(medicineId);
    setError(null);
    setNotice(null);
    try {
      const nextStatus = currentStatus === 'active' ? 'deprecated' : 'active';
      const { medicine } = await updateAdminCanonicalMedicine(firebaseUser, medicineId, {
        status: nextStatus,
      });
      setOverview((prev) => ({
        ...prev,
        canonicalMedicines: prev.canonicalMedicines.map((m) =>
          m.medicineId === medicine.medicineId ? medicine : m,
        ),
      }));
      const nextLabel = pt.statuses[nextStatus] || nextStatus;
      setNotice(
        isAr
          ? `تم تحديث حالة الدواء المرجعي إلى ${nextLabel}.`
          : `Canonical medicine status updated to ${nextLabel}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CANONICAL_UPDATE_FAILED');
    } finally {
      setUpdatingMedId(null);
    }
  };

  const filteredPharmacies = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return overview.pharmacies;
    return overview.pharmacies.filter(
      (p) =>
        (p.pharmacyNameAr || '').toLowerCase().includes(q) ||
        (p.pharmacyNameEn || '').toLowerCase().includes(q) ||
        (p.ownerFullName || '').toLowerCase().includes(q) ||
        (p.responsiblePharmacistName || '').toLowerCase().includes(q) ||
        (p.pharmacyLicenseNumber || '').toLowerCase().includes(q) ||
        (p.governorate || '').toLowerCase().includes(q),
    );
  }, [overview.pharmacies, search]);

  const filteredCanonical = useMemo(() => {
    const q = medSearch.trim().toLowerCase();
    if (!q) return overview.canonicalMedicines;
    return overview.canonicalMedicines.filter(
      (m) =>
        m.scientificName.toLowerCase().includes(q) ||
        m.activeIngredient.toLowerCase().includes(q) ||
        m.strength.toLowerCase().includes(q) ||
        (m.brandNames || []).some((b) => b.toLowerCase().includes(q)),
    );
  }, [overview.canonicalMedicines, medSearch]);

  const handleReviewMarketing = async (
    uid: string,
    payload: {
      marketingApprovalStatus?: 'approved' | 'rejected' | 'pending_review';
      featuredStatus?: 'approved' | 'rejected' | 'none';
    },
  ) => {
    setUpdatingUid(uid);
    setError(null);
    setNotice(null);
    try {
      const { pharmacy: updated } = await reviewAdminPharmacyMarketing(firebaseUser, uid, {
        ...payload,
        reviewNote: marketingReviewNotes[uid]?.trim() || undefined,
      });
      setOverview((prev) => ({
        ...prev,
        pharmacies: prev.pharmacies.map((p) => (p.uid === updated.uid ? updated : p)),
      }));
      setNotice(isAr ? 'تم حفظ قرار مراجعة التسويق / الترويج.' : 'Marketing review decision saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ADMIN_MARKETING_REVIEW_FAILED');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleReviewSpecialOffer = async (
    offerId: string,
    approvalStatus: 'approved' | 'rejected',
  ) => {
    setUpdatingUid(offerId);
    setError(null);
    setNotice(null);
    try {
      const { offer } = await reviewAdminPharmacySpecialOffer(firebaseUser, offerId, {
        approvalStatus,
        reviewNote: marketingReviewNotes[offerId]?.trim() || undefined,
      });
      setOverview((prev) => ({
        ...prev,
        specialOffers: (prev.specialOffers || []).map((o) => (o.offerId === offer.offerId ? offer : o)),
      }));
      setNotice(isAr ? 'تم تحديث حالة العرض الخاص.' : 'Special offer status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ADMIN_OFFER_REVIEW_FAILED');
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleReviewCampaign = async (
    requestId: string,
    status: 'Under Review' | 'Approved' | 'Rejected',
  ) => {
    setUpdatingUid(requestId);
    setError(null);
    setNotice(null);
    try {
      const { request } = await reviewAdminPharmacyCampaignRequest(firebaseUser, requestId, {
        status,
        adminNote: marketingReviewNotes[requestId]?.trim() || undefined,
      });
      setOverview((prev) => ({
        ...prev,
        campaignRequests: (prev.campaignRequests || []).map((c) =>
          c.requestId === request.requestId ? request : c,
        ),
      }));
      setNotice(isAr ? 'تم تحديث حالة الحملة الإعلانية.' : 'Campaign request status updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ADMIN_CAMPAIGN_REVIEW_FAILED');
    } finally {
      setUpdatingUid(null);
    }
  };

  const approvedCount = overview.pharmacies.filter((p) => p.status === 'Approved').length;
  const activeOrdersCount = overview.orders.filter(
    (o) => !['Completed', 'Cancelled', 'Rejected', 'Expired'].includes(o.status),
  ).length;
  const marketingCandidates = useMemo(
    () =>
      overview.pharmacies.filter(
        (p) =>
          p.marketingApprovalStatus === 'pending_review' ||
          p.marketingApprovalStatus === 'approved' ||
          p.marketingApprovalStatus === 'rejected' ||
          p.featuredStatus === 'requested' ||
          p.featuredStatus === 'approved' ||
          Boolean(p.promotionalBannerTitleAr || p.promotionalBannerTitleEn || p.promotionalBannerImageUrl),
      ),
    [overview.pharmacies],
  );
  const pendingMarketingCount =
    overview.pharmacies.filter(
      (p) => p.marketingApprovalStatus === 'pending_review' || p.featuredStatus === 'requested',
    ).length +
    (overview.specialOffers || []).filter((o) => o.approvalStatus === 'pending_review').length +
    (overview.campaignRequests || []).filter(
      (c) => c.status === 'Submitted' || c.status === 'Under Review',
    ).length;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'الصيدليات المسجلة' : 'Registered Pharmacies'}
            </span>
            <Pill className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.pharmacies.length}
          </p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            {isAr ? `${approvedCount} صيدلية معتمدة` : `${approvedCount} approved`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'الكتالوج الدوائي الموحد' : 'Canonical Medicines'}
            </span>
            <Package className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.canonicalMedicines.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr ? 'معرّفات قياسية موحدة' : 'Deduplicated canonical IDs'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'طلبات المرضى' : 'Patient Orders'}
            </span>
            <ShoppingBag className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.orders.length}
          </p>
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            {isAr ? `${activeOrdersCount} طلب قيد المعالجة` : `${activeOrdersCount} in progress`}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {isAr ? 'الوجبات منتهية الصلاحية' : 'Expired Batches'}
            </span>
            <AlertTriangle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 font-latin text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {overview.expiredBatches.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isAr ? `${overview.staff.length} كادر صيدلاني` : `${overview.staff.length} pharmacy staff`}
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'pharmacies', icon: Building2, label: isAr ? 'الصيدليات' : 'Pharmacies', count: overview.pharmacies.length },
              {
                id: 'marketing_review',
                icon: Megaphone,
                label: isAr ? 'مراجعة الترويج والعروض' : 'Marketing & Promos',
                count: pendingMarketingCount,
              },
              { id: 'canonical', icon: Pill, label: isAr ? 'الأدوية المرجعية' : 'Canonical Catalog', count: overview.canonicalMedicines.length },
              { id: 'expired_batches', icon: AlertTriangle, label: isAr ? 'رقابة الصلاحية' : 'Expired Batches', count: overview.expiredBatches.length },
              { id: 'orders', icon: ShoppingBag, label: isAr ? 'مراقبة الطلبات' : 'Orders Monitor', count: overview.orders.length },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#0c3585] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                <span className="font-latin rounded-md bg-black/15 px-1.5 py-0.5 text-[11px] tabular-nums">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{isAr ? 'تحديث' : 'Refresh'}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
          {isAr ? 'جاري تحميل بيانات الصيدليات...' : 'Loading pharmacy governance...'}
        </div>
      ) : (
        <>
          {activeTab === 'pharmacies' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    isAr
                      ? 'ابحث باسم الصيدلية، الصيدلاني المسؤول، المحافظة، أو رقم الإجازة...'
                      : 'Search pharmacy name, pharmacist, governorate, or license...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-4 ps-10 text-sm text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-800 dark:bg-[#07122a] dark:text-white"
                />
              </div>

              {filteredPharmacies.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a]">
                  {isAr ? 'لا توجد صيدليات مطابقة.' : 'No pharmacies found.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {filteredPharmacies.map((pharmacy) => {
                    const busy = updatingUid === pharmacy.uid;
                    const staffCount = overview.staff.filter(
                      (s) => s.pharmacyUid === pharmacy.uid && s.status === 'active',
                    ).length;
                    const ordersCount = overview.orders.filter(
                      (o) => o.pharmacyUid === pharmacy.uid,
                    ).length;

                    return (
                      <div
                        key={pharmacy.uid}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
                      >
                        <div>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {isAr
                                  ? pharmacy.pharmacyNameAr
                                  : pharmacy.pharmacyNameEn || pharmacy.pharmacyNameAr}
                              </h3>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {pharmacy.governorate}
                                {pharmacy.district ? ` — ${pharmacy.district}` : ''}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                                pharmacy.status === 'Approved'
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : pharmacy.status === 'Suspended' || pharmacy.status === 'Deactivated' || pharmacy.status === 'Rejected'
                                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
                                    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200'
                              }`}
                            >
                              {pt.statuses[pharmacy.status] || pharmacy.status}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/60">
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الصيدلاني المسؤول:' : 'Pharmacist:'}
                              </span>{' '}
                              <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {pharmacy.responsiblePharmacistName || pharmacy.ownerFullName || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'رقم الإجازة:' : 'License:'}
                              </span>{' '}
                              <span className="font-latin font-semibold text-slate-800 dark:text-slate-200">
                                {pharmacy.pharmacyLicenseNumber || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'رقم النقابة:' : 'Syndicate No:'}
                              </span>{' '}
                              <span className="font-latin font-semibold text-slate-800 dark:text-slate-200">
                                {pharmacy.pharmacistSyndicateNumber || '—'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-slate-500 dark:text-slate-400">
                                {isAr ? 'الكادر / الطلبات:' : 'Staff / Orders:'}
                              </span>{' '}
                              <span className="font-latin font-bold tabular-nums text-slate-900 dark:text-white">
                                {staffCount} / {ordersCount}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                          <input
                            type="text"
                            value={statusNotes[pharmacy.uid] || ''}
                            onChange={(e) =>
                              setStatusNotes((prev) => ({
                                ...prev,
                                [pharmacy.uid]: e.target.value,
                              }))
                            }
                            placeholder={
                              isAr ? 'ملاحظة أو سبب القرار الإداري...' : 'Optional governance reason...'
                            }
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            {pharmacy.status !== 'Approved' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(pharmacy, 'Approved')}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تفعيل / اعتماد' : 'Approve'}</span>
                              </button>
                            )}
                            {pharmacy.status !== 'Suspended' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(pharmacy, 'Suspended')}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                              >
                                <PauseCircle className="h-3.5 w-3.5" />
                                <span>{isAr ? 'إيقاف مؤقت' : 'Suspend'}</span>
                              </button>
                            )}
                            {pharmacy.status !== 'Deactivated' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleStatusChange(pharmacy, 'Deactivated')}
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                <span>{isAr ? 'تعطيل' : 'Deactivate'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'marketing_review' && (
            <div className="space-y-6">
              {/* 1. Promotional Banners & Featured Partner Reviews */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#d9a43b]" />
                  <span>
                    {isAr
                      ? 'اعتماد البنرات الترويجية وشارة الصيدلية المميزة'
                      : 'Promotional Banners & Featured Partner Approvals'}
                  </span>
                </h3>
                {marketingCandidates.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'لا توجد طلبات ترويجية مقدمة حالياً.' : 'No promotional banner or featured partner submissions yet.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {marketingCandidates.map((ph) => (
                      <div
                        key={ph.uid}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                              {isAr ? ph.pharmacyNameAr : ph.pharmacyNameEn || ph.pharmacyNameAr}
                            </h4>
                            <p className="text-xs text-slate-500">{ph.governorate}</p>
                          </div>
                          <div className="text-end text-[11px] font-bold">
                            <p className="text-slate-600 dark:text-slate-300">
                              {isAr ? 'البنر:' : 'Banner:'} {ph.marketingApprovalStatus || 'draft'}
                            </p>
                            <p className="text-amber-700 dark:text-amber-300">
                              {isAr ? 'التمييز:' : 'Featured:'} {ph.featuredStatus || 'none'}
                            </p>
                          </div>
                        </div>

                        {ph.promotionalBannerImageUrl && (
                          <img
                            src={ph.promotionalBannerImageUrl}
                            alt={ph.promotionalBannerTitleAr || ph.pharmacyNameAr}
                            referrerPolicy="no-referrer"
                            className="h-28 w-full rounded-lg object-cover border border-slate-200 dark:border-slate-700"
                          />
                        )}

                        {(ph.promotionalBannerTitleAr || ph.promotionalBannerTitleEn || ph.promotionalBannerBodyAr) && (
                          <div className="text-xs space-y-0.5 text-slate-700 dark:text-slate-200">
                            <p className="font-bold">
                              {isAr ? ph.promotionalBannerTitleAr || ph.promotionalBannerTitleEn : ph.promotionalBannerTitleEn || ph.promotionalBannerTitleAr}
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                              {isAr ? ph.promotionalBannerBodyAr || ph.promotionalBannerBodyEn : ph.promotionalBannerBodyEn || ph.promotionalBannerBodyAr}
                            </p>
                          </div>
                        )}

                        <input
                          type="text"
                          value={marketingReviewNotes[ph.uid] || ''}
                          onChange={(e) =>
                            setMarketingReviewNotes((p) => ({ ...p, [ph.uid]: e.target.value }))
                          }
                          placeholder={isAr ? 'ملاحظة المراجعة الإدارية...' : 'Optional admin review note...'}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={updatingUid === ph.uid}
                            onClick={() =>
                              void handleReviewMarketing(ph.uid, { marketingApprovalStatus: 'approved' })
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            {isAr ? 'اعتماد البنر' : 'Approve Banner'}
                          </button>
                          <button
                            type="button"
                            disabled={updatingUid === ph.uid}
                            onClick={() =>
                              void handleReviewMarketing(ph.uid, { marketingApprovalStatus: 'rejected' })
                            }
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            {isAr ? 'رفض البنر' : 'Reject Banner'}
                          </button>
                          <button
                            type="button"
                            disabled={updatingUid === ph.uid}
                            onClick={() =>
                              void handleReviewMarketing(ph.uid, { featuredStatus: 'approved' })
                            }
                            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            {isAr ? 'اعتماد كصيدلية مميزة' : 'Approve Featured'}
                          </button>
                          {ph.featuredStatus === 'approved' && (
                            <button
                              type="button"
                              disabled={updatingUid === ph.uid}
                              onClick={() =>
                                void handleReviewMarketing(ph.uid, { featuredStatus: 'none' })
                              }
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              {isAr ? 'إلغاء التمييز' : 'Unfeature'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Special Offers Approval Queue */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'العروض الخاصة المقدمة من الصيدليات' : 'Pharmacy Special Offers Review'}
                </h3>
                {(overview.specialOffers || []).length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'لا توجد عروض خاصة مسجلة.' : 'No special offers submitted.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(overview.specialOffers || []).map((offer) => {
                      const ownerPh = overview.pharmacies.find((p) => p.uid === offer.pharmacyUid);
                      return (
                        <div
                          key={offer.offerId}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
                        >
                          <div className="space-y-0.5 text-xs">
                            <p className="font-bold text-slate-900 dark:text-white">
                              {isAr ? offer.titleAr : offer.titleEn || offer.titleAr}
                              {offer.discountPercent ? ` · -${offer.discountPercent}%` : ''}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400">
                              {ownerPh ? (isAr ? ownerPh.pharmacyNameAr : ownerPh.pharmacyNameEn || ownerPh.pharmacyNameAr) : offer.pharmacyUid}
                              {offer.validUntil ? ` · ${offer.validUntil}` : ''} · {offer.approvalStatus}
                            </p>
                            {offer.description && (
                              <p className="text-slate-600 dark:text-slate-300">{offer.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={updatingUid === offer.offerId}
                              onClick={() => void handleReviewSpecialOffer(offer.offerId, 'approved')}
                              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              {isAr ? 'اعتماد' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={updatingUid === offer.offerId}
                              onClick={() => void handleReviewSpecialOffer(offer.offerId, 'rejected')}
                              className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                            >
                              {isAr ? 'رفض' : 'Reject'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Promotional Campaign Requests */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm dark:border-slate-800 dark:bg-[#07122a]">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'طلبات الحملات الترويجية على MEDORA' : 'MEDORA Campaign Sponsorship Requests'}
                </h3>
                {(overview.campaignRequests || []).length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'لا توجد طلبات حملات حالياً.' : 'No campaign requests submitted.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(overview.campaignRequests || []).map((req) => (
                      <div
                        key={req.requestId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <div className="space-y-0.5 text-xs">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {req.campaignTitle} · {req.pharmacyName}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {req.campaignType} · {req.targetGovernorate || '—'} · {req.status}
                          </p>
                          {req.notes && (
                            <p className="text-slate-600 dark:text-slate-300">{req.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={updatingUid === req.requestId}
                            onClick={() => void handleReviewCampaign(req.requestId, 'Under Review')}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            {isAr ? 'قيد المراجعة' : 'Under Review'}
                          </button>
                          <button
                            type="button"
                            disabled={updatingUid === req.requestId}
                            onClick={() => void handleReviewCampaign(req.requestId, 'Approved')}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            {isAr ? 'اعتماد' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            disabled={updatingUid === req.requestId}
                            onClick={() => void handleReviewCampaign(req.requestId, 'Rejected')}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                          >
                            {isAr ? 'رفض' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'canonical' && (
            <div className="space-y-5">
              <form
                onSubmit={handleCreateCanonicalMedicine}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#07122a]"
              >
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'إضافة دواء مرجعي موحد (منع التكرار)' : 'Add Canonical Reference Medicine'}
                </h3>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <input
                    required
                    value={newMed.scientificName}
                    onChange={(e) => setNewMed((p) => ({ ...p, scientificName: e.target.value }))}
                    placeholder={isAr ? 'الاسم العلمي *' : 'Scientific Name *'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    required
                    value={newMed.activeIngredient}
                    onChange={(e) => setNewMed((p) => ({ ...p, activeIngredient: e.target.value }))}
                    placeholder={isAr ? 'المادة الفعالة *' : 'Active Ingredient *'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    required
                    value={newMed.strength}
                    onChange={(e) => setNewMed((p) => ({ ...p, strength: e.target.value }))}
                    placeholder={isAr ? 'التركيز (مثال: 500mg) *' : 'Strength (e.g. 500mg) *'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <select
                    value={newMed.dosageForm}
                    onChange={(e) => setNewMed((p) => ({ ...p, dosageForm: e.target.value as DosageForm }))}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {DOSAGE_FORMS.map((f) => (
                      <option key={f} value={f}>
                        {pt.dosageForms[f] || f}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    value={newMed.packSize}
                    onChange={(e) => setNewMed((p) => ({ ...p, packSize: e.target.value }))}
                    placeholder={isAr ? 'حجم العبوة (مثال: 20 tabs) *' : 'Pack Size (e.g. 20 tabs) *'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={newMed.manufacturer}
                    onChange={(e) => setNewMed((p) => ({ ...p, manufacturer: e.target.value }))}
                    placeholder={isAr ? 'الشركة المصنعة' : 'Manufacturer'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={newMed.country}
                    onChange={(e) => setNewMed((p) => ({ ...p, country: e.target.value }))}
                    placeholder={isAr ? 'بلد المنشأ' : 'Country'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={newMed.barcode}
                    onChange={(e) => setNewMed((p) => ({ ...p, barcode: e.target.value }))}
                    placeholder={isAr ? 'الباركود المرجعي' : 'Reference Barcode'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={newMed.therapeuticCategory}
                    onChange={(e) => setNewMed((p) => ({ ...p, therapeuticCategory: e.target.value }))}
                    placeholder={isAr ? 'التصنيف العلاجي' : 'Therapeutic Category'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <input
                    value={newMed.brandNamesRaw}
                    onChange={(e) => setNewMed((p) => ({ ...p, brandNamesRaw: e.target.value }))}
                    placeholder={isAr ? 'أسماء تجارية (مفصولة بفاصلة)' : 'Brand names (comma separated)'}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                  <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-2">
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={newMed.requiresPrescription}
                        onChange={(e) =>
                          setNewMed((p) => ({ ...p, requiresPrescription: e.target.checked }))
                        }
                      />
                      <span>{isAr ? 'يتطلب وصفة' : 'Rx Required'}</span>
                    </label>
                    <button
                      type="submit"
                      disabled={creatingMed}
                      className="medora-gold-button inline-flex items-center gap-1 rounded-xl px-4 py-2 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isAr ? 'إضافة' : 'Create'}</span>
                    </button>
                  </div>
                </div>
              </form>

              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={medSearch}
                  onChange={(e) => setMedSearch(e.target.value)}
                  placeholder={isAr ? 'بحث في الأدوية المرجعية...' : 'Search canonical medicines...'}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pe-4 ps-10 text-sm text-slate-900 outline-none dark:border-slate-800 dark:bg-[#07122a] dark:text-white"
                />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'الاسم العلمي' : 'Scientific Name'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'المادة الفعالة' : 'Active Ingredient'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'التركيز والشكل' : 'Strength & Form'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الشركة / الباركود' : 'Manufacturer / Barcode'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'العبوة' : 'Pack'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                      <th className="px-4 py-3 text-end" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {filteredCanonical.map((med) => (
                      <tr key={med.medicineId}>
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                          {med.scientificName}
                          {(med.brandNames || []).length > 0 && (
                            <p className="font-normal text-[11px] text-slate-500">
                              {med.brandNames.join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {med.activeIngredient}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                          {med.strength} · {pt.dosageForms[med.dosageForm] || med.dosageForm}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {[med.manufacturer, med.country].filter(Boolean).join(' · ') || '—'}
                          {med.barcode ? (
                            <p className="font-latin text-[11px] text-slate-400">{med.barcode}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-latin text-slate-700 dark:text-slate-200">{med.packSize}</td>
                        <td className="px-4 py-3 font-semibold">
                          <span
                            className={
                              med.status === 'active'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }
                          >
                            {pt.statuses[med.status] || med.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <button
                            type="button"
                            disabled={updatingMedId === med.medicineId}
                            onClick={() => void handleToggleCanonicalStatus(med.medicineId, med.status)}
                            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                          >
                            {med.status === 'active'
                              ? isAr
                                ? 'تعطيل'
                                : 'Deprecate'
                              : isAr
                                ? 'تفعيل'
                                : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'expired_batches' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
              {overview.expiredBatches.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {isAr ? 'لا توجد وجبات منتهية الصلاحية مسجلة حالياً.' : 'No expired batches detected.'}
                </p>
              ) : (
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'الدواء' : 'Product'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'رقم الوجبة' : 'Batch No'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'انتهاء الصلاحية' : 'Expiry'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الكمية المتبقية' : 'Qty'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.expiredBatches.map((b) => (
                      <tr key={b.batchId}>
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                          {b.productName}
                        </td>
                        <td className="px-4 py-3 font-latin text-slate-700 dark:text-slate-200">{b.batchNumber}</td>
                        <td className="px-4 py-3 font-latin text-rose-600 dark:text-rose-400">{b.expiryDate}</td>
                        <td className="px-4 py-3 font-latin tabular-nums text-slate-900 dark:text-white">{b.availableQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
              {overview.orders.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  {isAr ? 'لا توجد طلبات صيدليات مسجلة بعد.' : 'No pharmacy orders recorded yet.'}
                </p>
              ) : (
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'رقم الطلب' : 'Order'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'المريض' : 'Patient'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الصيدلية' : 'Pharmacy'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'النوع' : 'Fulfillment'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الإجمالي' : 'Total IQD'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {overview.orders.slice(0, 100).map((ord) => (
                      <tr key={ord.orderId}>
                        <td className="px-4 py-3 font-latin font-bold text-[#0c3585] dark:text-[#f4d378]">
                          {ord.orderNumber}
                        </td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{ord.patientName}</td>
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{ord.pharmacyName}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {pt.fulfillmentTypes[ord.fulfillmentType] || ord.fulfillmentType}
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums text-slate-900 dark:text-white">
                          {(ord.totalIqd || 0).toLocaleString()} {pt.common.iqd}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {pt.statuses[ord.status] || ord.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
