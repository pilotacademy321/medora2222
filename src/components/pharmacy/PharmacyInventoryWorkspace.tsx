import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  CheckSquare,
  Edit3,
  History,
  Layers,
  LayoutGrid,
  Loader2,
  PackagePlus,
  Pill,
  Plus,
  Search,
  Sliders,
  Square,
  Table2,
  Upload,
  X,
} from 'lucide-react';
import { pharmacyTranslations } from '../../i18n/pharmacyTranslations';
import {
  bulkActionPharmacyProducts,
  createCanonicalMedicine,
  manualAdjustPharmacyProductStock,
  savePharmacyProduct,
  togglePublishPharmacyProduct,
  updatePharmacyProduct,
  uploadPharmacyMedia,
} from '../../services/pharmacyService';
import type { Language } from '../../types/medora';
import type {
  DosageForm,
  PharmacyProductRecord,
  PharmacySectionId,
  PharmacyWorkspaceData,
} from '../../types/pharmacy';
import { formatIqd, preparePharmacyImageUpload } from './PharmacyBrandUtils';
import {
  PharmacyBatchesSection,
  PharmacyInventoryMovementsSection,
} from './PharmacyInventoryAndB2BSections';

type InventorySubTab = 'catalog' | 'batches' | 'movements';
type CatalogFilter = 'all' | 'in_stock' | 'low_stock' | 'pending_review' | 'unpublished' | 'rx_only';

export function PharmacyInventoryWorkspace({
  firebaseUser,
  workspace,
  language,
  canEditCatalog,
  canManageBatches,
  onNavigate,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: PharmacyWorkspaceData;
  language: Language;
  canEditCatalog: boolean;
  canManageBatches: boolean;
  onNavigate: (sec: PharmacySectionId) => void;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const pt = pharmacyTranslations[language];

  const [subTab, setSubTab] = useState<InventorySubTab>('catalog');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<CatalogFilter>('all');
  const [dosageFilter, setDosageFilter] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [bulkReorderInput, setBulkReorderInput] = useState('10');
  const [bulkBusy, setBulkBusy] = useState(false);

  // Add Product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [scientificName, setScientificName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [strength, setStrength] = useState('');
  const [dosageForm, setDosageForm] = useState<DosageForm>('tablet');
  const [packSize, setPackSize] = useState('');
  const [brandName, setBrandName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [country, setCountry] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sellingPriceIqd, setSellingPriceIqd] = useState(0);
  const [minStockThreshold, setMinStockThreshold] = useState(10);
  const [requiresRx, setRequiresRx] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);

  // Edit Product modal state
  const [editingProduct, setEditingProduct] = useState<PharmacyProductRecord | null>(null);
  const [editBrand, setEditBrand] = useState('');
  const [editManufacturer, setEditManufacturer] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editPrice, setEditPrice] = useState(0);
  const [editDiscountPrice, setEditDiscountPrice] = useState('');
  const [editReorder, setEditReorder] = useState(10);
  const [editPublished, setEditPublished] = useState(true);
  const [editActive, setEditActive] = useState(true);
  const [editImageUrl, setEditImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Documented Manual Stock Adjust modal state
  const [adjustingProduct, setAdjustingProduct] = useState<PharmacyProductRecord | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustBatchNumber, setAdjustBatchNumber] = useState('');
  const [adjustExpiryDate, setAdjustExpiryDate] = useState('');
  const [adjustPurchaseCost, setAdjustPurchaseCost] = useState('0');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.products.filter((p) => {
      const isPublished = p.isPublishedToPatients !== false && p.reviewStatus !== 'pending_review';
      const qty = p.availableQty || 0;
      const threshold = p.reorderLevel ?? p.minStockThreshold ?? 10;

      if (filterMode === 'in_stock' && qty <= 0) return false;
      if (filterMode === 'low_stock' && !(qty > 0 && qty <= threshold)) return false;
      if (filterMode === 'pending_review' && p.reviewStatus !== 'pending_review') return false;
      if (filterMode === 'unpublished' && isPublished) return false;
      if (filterMode === 'rx_only' && !p.requiresPrescription && !p.controlledDrug) return false;
      if (dosageFilter !== 'all' && p.dosageForm !== dosageFilter) return false;

      if (!q) return true;
      return [
        p.scientificName,
        p.brandName,
        p.activeIngredient,
        p.strength,
        p.barcode,
        p.manufacturer,
        p.country,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [workspace.products, search, filterMode, dosageFilter]);

  const checkedIds = useMemo(
    () => filteredProducts.map((p) => p.productId).filter((id) => Boolean(selectedIds[id])),
    [filteredProducts, selectedIds],
  );

  const allVisibleChecked =
    filteredProducts.length > 0 && checkedIds.length === filteredProducts.length;

  const toggleSelectAll = () => {
    if (allVisibleChecked) {
      setSelectedIds({});
    } else {
      const next: Record<string, boolean> = {};
      for (const p of filteredProducts) next[p.productId] = true;
      setSelectedIds(next);
    }
  };

  const handleBulkAction = async (
    action: 'publish' | 'unpublish' | 'activate' | 'deactivate' | 'set_reorder',
  ) => {
    if (checkedIds.length === 0) return;
    setBulkBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await bulkActionPharmacyProducts(firebaseUser, {
        productIds: checkedIds,
        action,
        reorderLevel:
          action === 'set_reorder' ? Math.max(0, Number(bulkReorderInput) || 0) : undefined,
      });
      setSelectedIds({});
      setNotice(
        isAr
          ? `تم تنفيذ الإجراء الجماعي على ${res.updatedCount} صنف بنجاح.`
          : `Bulk action updated ${res.updatedCount} products.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'BULK_ACTION_FAILED');
    } finally {
      setBulkBusy(false);
    }
  };

  const handleSaveNewProduct = async (e: FormEvent) => {
    e.preventDefault();
    setSavingAdd(true);
    setError(null);
    setNotice(null);
    try {
      let medicineId = selectedMedicineId;
      if (!medicineId) {
        const created = await createCanonicalMedicine(firebaseUser, {
          scientificName: scientificName.trim(),
          activeIngredient: activeIngredient.trim() || scientificName.trim(),
          strength: strength.trim(),
          dosageForm,
          packSize: packSize.trim(),
          brandName: brandName.trim(),
          manufacturer: manufacturer.trim() || undefined,
          country: country.trim() || undefined,
          barcode: barcode.trim() || undefined,
          requiresPrescription: requiresRx,
        });
        medicineId = created.medicine.medicineId;
      }
      await savePharmacyProduct(firebaseUser, {
        medicineId,
        brandName: brandName.trim(),
        manufacturer: manufacturer.trim() || undefined,
        country: country.trim() || undefined,
        barcode: barcode.trim(),
        sellingPriceIqd,
        minStockThreshold,
        reorderLevel: minStockThreshold,
        availableForPatientOrders: true,
        isPublishedToPatients: true,
        isActive: true,
      });
      setShowAddForm(false);
      setSelectedMedicineId('');
      setScientificName('');
      setActiveIngredient('');
      setStrength('');
      setPackSize('');
      setBrandName('');
      setManufacturer('');
      setCountry('');
      setBarcode('');
      setSellingPriceIqd(0);
      setNotice(isAr ? 'تمت إضافة الدواء للكتالوج بنجاح.' : 'Medicine added to catalog.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SAVE_PRODUCT_FAILED');
    } finally {
      setSavingAdd(false);
    }
  };

  const openEditModal = (p: PharmacyProductRecord) => {
    setEditingProduct(p);
    setEditBrand(p.brandName || '');
    setEditManufacturer(p.manufacturer || '');
    setEditCountry(p.country || '');
    setEditBarcode(p.barcode || '');
    setEditPrice(p.sellingPriceIqd || 0);
    setEditDiscountPrice(p.discountPriceIqd != null ? String(p.discountPriceIqd) : '');
    setEditReorder(p.reorderLevel ?? p.minStockThreshold ?? 10);
    setEditPublished(p.isPublishedToPatients !== false);
    setEditActive(p.isActive !== false);
    setEditImageUrl(p.imageReference || '');
    setError(null);
  };

  const handleUploadMedicineImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const prepared = await preparePharmacyImageUpload(file, 900);
      const uploaded = await uploadPharmacyMedia(firebaseUser, prepared);
      setEditImageUrl(uploaded.file.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'IMAGE_UPLOAD_FAILED');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSavingEdit(true);
    setError(null);
    setNotice(null);
    try {
      const parsedDiscount = editDiscountPrice.trim() ? Math.max(0, Number(editDiscountPrice)) : null;
      await updatePharmacyProduct(firebaseUser, editingProduct.productId, {
        brandName: editBrand.trim(),
        manufacturer: editManufacturer.trim(),
        country: editCountry.trim(),
        barcode: editBarcode.trim(),
        imageReference: editImageUrl.trim(),
        sellingPriceIqd: Math.max(1, Number(editPrice) || 1),
        discountPriceIqd: parsedDiscount && parsedDiscount > 0 ? parsedDiscount : null,
        minStockThreshold: Math.max(0, Number(editReorder) || 0),
        reorderLevel: Math.max(0, Number(editReorder) || 0),
        isPublishedToPatients: editPublished,
        isActive: editActive,
      });
      setEditingProduct(null);
      setNotice(isAr ? 'تم تحديث بيانات الدواء والسعر.' : 'Medicine updated.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'UPDATE_PRODUCT_FAILED');
    } finally {
      setSavingEdit(false);
    }
  };

  const openAdjustModal = (p: PharmacyProductRecord) => {
    setAdjustingProduct(p);
    setAdjustDelta('0');
    setAdjustBatchNumber('');
    setAdjustExpiryDate('');
    setAdjustPurchaseCost('0');
    setAdjustReason('');
    setError(null);
  };

  const handleSaveManualAdjust = async (e: FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    const delta = Math.trunc(Number(adjustDelta) || 0);
    if (delta === 0) {
      setError(isAr ? 'أدخل قيمة تغيير غير صفرية (+/-).' : 'Enter a non-zero quantity delta.');
      return;
    }
    if (adjustReason.trim().length < 3) {
      setError(isAr ? 'سبب التعديل الموثق مطلوب (3 أحرف على الأقل).' : 'Reason (>= 3 chars) is required.');
      return;
    }
    setSavingAdjust(true);
    setError(null);
    setNotice(null);
    try {
      await manualAdjustPharmacyProductStock(firebaseUser, adjustingProduct.productId, {
        quantityDelta: delta,
        reason: adjustReason.trim(),
        batchNumber: delta > 0 ? adjustBatchNumber.trim() : undefined,
        expiryDate: delta > 0 ? adjustExpiryDate : undefined,
        purchasePriceIqd: delta > 0 ? Math.max(0, Number(adjustPurchaseCost) || 0) : undefined,
      });
      setAdjustingProduct(null);
      setNotice(isAr ? 'تم توثيق تعديل المخزون في سجل الحركات.' : 'Documented stock adjustment saved.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MANUAL_ADJUST_FAILED');
    } finally {
      setSavingAdjust(false);
    }
  };

  const handleQuickTogglePublish = async (productId: string, nextPublish: boolean) => {
    setTogglingId(productId);
    setError(null);
    try {
      await togglePublishPharmacyProduct(firebaseUser, productId, nextPublish);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PUBLISH_TOGGLE_FAILED');
    } finally {
      setTogglingId(null);
    }
  };

  const adjustDeltaNum = Math.trunc(Number(adjustDelta) || 0);

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              {
                id: 'catalog' as InventorySubTab,
                label: isAr
                  ? `بطاقات الأدوية والأسعار (${workspace.products.length})`
                  : `Catalog (${workspace.products.length})`,
                icon: Pill,
              },
              {
                id: 'batches' as InventorySubTab,
                label: isAr
                  ? `التشغيلات والصلاحية FEFO (${workspace.batches.length})`
                  : `Batches & FEFO (${workspace.batches.length})`,
                icon: Layers,
              },
              {
                id: 'movements' as InventorySubTab,
                label: isAr
                  ? `سجل حركات المخزون (${workspace.movements.length})`
                  : `Stock Movements (${workspace.movements.length})`,
                icon: History,
              },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-4 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#0c3585] text-white'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {canEditCatalog && subTab === 'catalog' && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('bulk_import')}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/5 px-3.5 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/10 dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{pt.bulkImport.title}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isAr ? 'إضافة دواء' : 'Add Medicine'}</span>
            </button>
          </div>
        )}
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

      {subTab === 'catalog' && (
        <div className="space-y-4">
          {showAddForm && canEditCatalog && (
            <form
              onSubmit={(e) => void handleSaveNewProduct(e)}
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr
                    ? 'ربط أو تسجيل دواء بهوية MEDORA الموحدة'
                    : 'Link Canonical Medicine & Set Pharmacy Retail Price'}
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {isAr
                    ? 'اختيار من الكتالوج الموحد (اختياري — اتركه فارغاً لتسجيل دواء جديد)'
                    : 'Select Canonical Identity (or leave empty to register)'}
                </label>
                <select
                  value={selectedMedicineId}
                  onChange={(e) => setSelectedMedicineId(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                >
                  <option value="">
                    {isAr ? '— تسجيل دواء مرجعي جديد —' : '— Register New Canonical Medicine —'}
                  </option>
                  {workspace.canonicalCatalog.map((m) => (
                    <option key={m.medicineId} value={m.medicineId}>
                      {m.scientificName} · {m.activeIngredient} · {m.strength} ·{' '}
                      {pt.dosageForms[m.dosageForm] || m.dosageForm} · {m.packSize}
                    </option>
                  ))}
                </select>
              </div>

              {!selectedMedicineId && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    required
                    value={scientificName}
                    onChange={(e) => setScientificName(e.target.value)}
                    placeholder={isAr ? 'الاسم العلمي *' : 'Scientific Name *'}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <input
                    required
                    value={activeIngredient}
                    onChange={(e) => setActiveIngredient(e.target.value)}
                    placeholder={isAr ? 'المادة الفعالة *' : 'Active Ingredient *'}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <input
                    required
                    value={strength}
                    onChange={(e) => setStrength(e.target.value)}
                    placeholder={isAr ? 'التركيز (مثال: 500mg) *' : 'Strength (e.g. 500mg) *'}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <select
                    value={dosageForm}
                    onChange={(e) => setDosageForm(e.target.value as DosageForm)}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  >
                    {Object.entries(pt.dosageForms).map(([k, lbl]) => (
                      <option key={k} value={k}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    placeholder={isAr ? 'حجم العبوة (مثال: 20 قرص) *' : 'Pack Size *'}
                    className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={requiresRx}
                      onChange={(e) => setRequiresRx(e.target.checked)}
                    />
                    <span>{isAr ? 'يتطلب وصفة طبية' : 'Requires Prescription'}</span>
                  </label>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder={isAr ? 'الاسم التجاري' : 'Brand Name'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder={isAr ? 'الشركة المصنعة' : 'Manufacturer'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder={isAr ? 'بلد المنشأ' : 'Country'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
                <input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder={isAr ? 'الباركود' : 'Barcode'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
                <input
                  type="number"
                  min={1}
                  required
                  value={sellingPriceIqd || ''}
                  onChange={(e) => setSellingPriceIqd(Math.max(0, Number(e.target.value) || 0))}
                  placeholder={isAr ? 'سعر البيع (د.ع) *' : 'Retail Price (IQD) *'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
                <input
                  type="number"
                  min={0}
                  value={minStockThreshold}
                  onChange={(e) => setMinStockThreshold(Math.max(0, Number(e.target.value) || 0))}
                  placeholder={isAr ? 'حد إعادة الطلب' : 'Reorder Threshold'}
                  className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>

              <button
                type="submit"
                disabled={savingAdd}
                className="min-h-[40px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
              >
                {savingAdd ? '...' : pt.common.save}
              </button>
            </form>
          )}

          {/* Filter, Dosage Form & Search Bar + View Switcher */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute top-1/2 start-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={pt.common.searchPlaceholder}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white ps-10 pe-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>

              <select
                value={dosageFilter}
                onChange={(e) => setDosageFilter(e.target.value)}
                className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
              >
                <option value="all">
                  {isAr ? 'كل الأشكال الدوائية' : 'All Dosage Forms'}
                </option>
                {Object.entries(pt.dosageForms).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>

              <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-[#030712]">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold cursor-pointer ${
                    viewMode === 'cards'
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>{isAr ? 'بطاقات' : 'Cards'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-bold cursor-pointer ${
                    viewMode === 'table'
                      ? 'bg-[#0c3585] text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Table2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'جدول' : 'Table'}</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: isAr ? 'الكل' : 'All' },
                    { id: 'in_stock', label: isAr ? 'متوفر' : 'In Stock' },
                    { id: 'low_stock', label: isAr ? 'نواقص' : 'Low Stock' },
                    { id: 'pending_review', label: isAr ? 'بانتظار النشر' : 'Pending Review' },
                    { id: 'unpublished', label: isAr ? 'مخفي عن المرضى' : 'Unpublished' },
                    { id: 'rx_only', label: isAr ? 'بوصفة فقط' : 'Rx Only' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilterMode(f.id)}
                    className={`min-h-[32px] rounded-xl px-3 text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      filterMode === f.id
                        ? 'bg-[#0c3585] text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {canEditCatalog && filteredProducts.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                >
                  {allVisibleChecked ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  <span>{isAr ? 'تحديد الكل' : 'Select All'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Bulk Action Bar */}
          {canEditCatalog && checkedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d9a43b]/45 bg-[#0c3585]/5 px-4 py-3 text-xs dark:bg-[#d9a43b]/10">
              <span className="font-bold text-slate-950 dark:text-[#f4d378] tabular-nums">
                {isAr ? `تم تحديد ${checkedIds.length} صنف` : `${checkedIds.length} selected`}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleBulkAction('publish')}
                  className="min-h-[32px] rounded-lg bg-[#0c3585] px-3 font-bold text-white hover:bg-[#1346ad] cursor-pointer"
                >
                  {isAr ? 'نشر للمرضى' : 'Publish'}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleBulkAction('unpublish')}
                  className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-3 font-bold text-slate-700 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-200 cursor-pointer"
                >
                  {isAr ? 'إخفاء عن المرضى' : 'Unpublish'}
                </button>
                <button
                  type="button"
                  disabled={bulkBusy}
                  onClick={() => void handleBulkAction('deactivate')}
                  className="min-h-[32px] rounded-lg border border-rose-300 bg-white px-3 font-bold text-rose-700 dark:border-rose-500/40 dark:bg-[#07122a] dark:text-rose-300 cursor-pointer"
                >
                  {isAr ? 'تعطيل' : 'Deactivate'}
                </button>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={bulkReorderInput}
                    onChange={(e) => setBulkReorderInput(e.target.value)}
                    className="min-h-[32px] w-16 rounded-lg border border-slate-300 bg-white px-2 text-center tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                  />
                  <button
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void handleBulkAction('set_reorder')}
                    className="min-h-[32px] rounded-lg border border-slate-300 bg-white px-2.5 font-bold text-[#0c3585] dark:border-slate-700 dark:bg-[#07122a] dark:text-[#f4d378] cursor-pointer"
                  >
                    {isAr ? 'تعيين حد التنبيه' : 'Set Reorder'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {filteredProducts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-400">
              {pt.common.noData}
            </div>
          ) : viewMode === 'cards' ? (
            /* Professional Pharmacy Medicine Cards Grid */
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((p) => {
                const isPublished =
                  p.isPublishedToPatients !== false && p.reviewStatus !== 'pending_review';
                const qty = p.availableQty || 0;
                const threshold = p.reorderLevel ?? p.minStockThreshold ?? 10;
                const isOut = qty <= 0;
                const isLow = qty > 0 && qty <= threshold;
                const hasDiscount =
                  p.discountPriceIqd != null &&
                  p.discountPriceIqd > 0 &&
                  p.discountPriceIqd < p.sellingPriceIqd;

                return (
                  <article
                    key={p.productId}
                    className={`flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-[#0c3585]/45 dark:border-slate-800 dark:bg-[#07122a] dark:hover:border-[#d9a43b]/45 ${
                      !p.isActive ? 'opacity-65' : ''
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start gap-3.5">
                        {p.imageReference ? (
                          <img
                            src={p.imageReference}
                            alt={p.brandName || p.scientificName}
                            referrerPolicy="no-referrer"
                            className="h-20 w-20 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 object-cover dark:border-slate-700"
                          />
                        ) : (
                          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-[#0c3585]/8 text-[#0c3585] dark:border-slate-700 dark:bg-[#d9a43b]/10 dark:text-[#f4d378]">
                            <Pill className="h-8 w-8" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
                              {p.brandName || p.scientificName}
                            </p>
                            {canEditCatalog && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedIds((prev) => ({
                                    ...prev,
                                    [p.productId]: !prev[p.productId],
                                  }))
                                }
                                className="text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                              >
                                {selectedIds[p.productId] ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-400" />
                                )}
                              </button>
                            )}
                          </div>
                          <p className="truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                            {p.scientificName} · {p.activeIngredient}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {p.strength} · {pt.dosageForms[p.dosageForm] || p.dosageForm} ·{' '}
                            {p.packSize}
                          </p>
                          {(p.manufacturer || p.country) && (
                            <p className="truncate text-[11px] text-slate-400">
                              {[p.manufacturer, p.country].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs dark:border-slate-800 dark:bg-[#030712]/60">
                        <div>
                          <span className="block text-[10px] text-slate-500">
                            {isAr ? 'سعر التجزئة' : 'Price'}
                          </span>
                          <span className="font-latin font-extrabold tabular-nums text-[#0c3585] dark:text-[#f4d378]">
                            {formatIqd(
                              hasDiscount ? Number(p.discountPriceIqd) : p.sellingPriceIqd,
                              isAr,
                            )}
                          </span>
                          {hasDiscount && (
                            <span className="block font-latin text-[10px] line-through text-slate-400 tabular-nums">
                              {formatIqd(p.sellingPriceIqd, isAr)}
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">
                            {isAr ? 'التوفر' : 'Stock'}
                          </span>
                          <span
                            className={`font-latin font-bold tabular-nums ${
                              isOut
                                ? 'text-rose-600 dark:text-rose-400'
                                : isLow
                                  ? 'text-amber-600 dark:text-[#f4d378]'
                                  : 'text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {isOut
                              ? isAr
                                ? 'نفذ (0)'
                                : 'Out (0)'
                              : isLow
                                ? `${qty} (${isAr ? 'منخفض' : 'Low'})`
                                : `${qty} (${isAr ? 'متوفر' : 'OK'})`}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-slate-500">
                            {isAr ? 'أقرب انتهاء' : 'Expiry'}
                          </span>
                          <span className="font-latin font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                            {p.nearestExpiryDate || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[10.5px] font-bold ${
                            isPublished
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
                          }`}
                        >
                          {isPublished
                            ? pt.bulkImport.publishedBadge
                            : pt.bulkImport.pendingReviewBadge}
                        </span>
                        {canEditCatalog && (
                          <button
                            type="button"
                            disabled={togglingId === p.productId}
                            onClick={() => void handleQuickTogglePublish(p.productId, !isPublished)}
                            className="text-[11px] font-bold text-[#0c3585] underline dark:text-[#f4d378] cursor-pointer"
                          >
                            {isPublished ? (isAr ? 'إخفاء' : 'Hide') : isAr ? 'نشر' : 'Publish'}
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {canEditCatalog && (
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/5 px-2.5 text-[11px] font-bold text-[#0c3585] hover:bg-[#0c3585]/10 dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                            <span>{isAr ? 'تعديل' : 'Edit'}</span>
                          </button>
                        )}
                        {canManageBatches && (
                          <button
                            type="button"
                            onClick={() => openAdjustModal(p)}
                            className="inline-flex min-h-[32px] items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                          >
                            <Sliders className="h-3 w-3" />
                            <span>{isAr ? 'تسوية' : 'Adjust'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            /* Table View */
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#07122a]">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-[#061028] dark:text-slate-300">
                    <tr>
                      {canEditCatalog && (
                        <th className="w-10 px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            aria-label={isAr ? 'تحديد الكل' : 'Select all'}
                            className="text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                          >
                            {allVisibleChecked ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="px-4 py-3 text-start">
                        {isAr ? 'الدواء والمادة الفعالة' : 'Medicine & Strength'}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isAr ? 'الشكل / العبوة' : 'Form / Pack'}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isAr ? 'سعر البيع للمريض' : 'Retail Price'}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isAr ? 'المتوفر (FEFO)' : 'Stock'}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isAr ? 'أقرب انتهاء' : 'Nearest Expiry'}
                      </th>
                      <th className="px-4 py-3 text-center">
                        {isAr ? 'الظهور للمرضى' : 'Visibility'}
                      </th>
                      <th className="px-4 py-3 text-end">{pt.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredProducts.map((p) => {
                      const isPublished =
                        p.isPublishedToPatients !== false && p.reviewStatus !== 'pending_review';
                      const threshold = p.reorderLevel ?? p.minStockThreshold ?? 10;
                      const isLow = (p.availableQty || 0) <= threshold;
                      return (
                        <tr
                          key={p.productId}
                          className={!p.isActive ? 'opacity-60 bg-slate-50/40 dark:bg-slate-950/20' : ''}
                        >
                          {canEditCatalog && (
                            <td className="px-3 py-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedIds((prev) => ({
                                    ...prev,
                                    [p.productId]: !prev[p.productId],
                                  }))
                                }
                                className="text-[#0c3585] dark:text-[#f4d378] cursor-pointer"
                              >
                                {selectedIds[p.productId] ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <Square className="h-4 w-4 text-slate-400" />
                                )}
                              </button>
                            </td>
                          )}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {p.imageReference ? (
                                <img
                                  src={p.imageReference}
                                  alt={p.brandName || p.scientificName}
                                  referrerPolicy="no-referrer"
                                  className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[#0c3585]/8 text-[#0c3585] dark:border-slate-700 dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                                  <Pill className="h-4 w-4" />
                                </div>
                              )}
                              <div>
                                <p className="font-bold text-slate-900 dark:text-white">
                                  {p.brandName
                                    ? `${p.brandName} (${p.scientificName})`
                                    : p.scientificName}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {p.activeIngredient} · {p.strength}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-700 dark:text-slate-200">
                            {pt.dosageForms[p.dosageForm] || p.dosageForm} · {p.packSize}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            {p.discountPriceIqd != null && p.discountPriceIqd < p.sellingPriceIqd ? (
                              <div>
                                <p className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                                  {formatIqd(p.discountPriceIqd, isAr)}
                                </p>
                                <p className="text-[10px] line-through text-slate-400">
                                  {formatIqd(p.sellingPriceIqd, isAr)}
                                </p>
                              </div>
                            ) : (
                              <span className="font-bold text-[#0c3585] dark:text-[#f4d378]">
                                {formatIqd(p.sellingPriceIqd, isAr)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums">
                            <span
                              className={`font-bold ${
                                isLow
                                  ? 'text-amber-600 dark:text-[#f4d378]'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {p.availableQty || 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-latin tabular-nums text-slate-700 dark:text-slate-200">
                            {p.nearestExpiryDate || '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span
                                className={`text-[11px] font-bold ${
                                  isPublished
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-amber-700 dark:text-[#f4d378]'
                                }`}
                              >
                                {isPublished
                                  ? pt.bulkImport.publishedBadge
                                  : pt.bulkImport.pendingReviewBadge}
                              </span>
                              {canEditCatalog && (
                                <button
                                  type="button"
                                  disabled={togglingId === p.productId}
                                  onClick={() => void handleQuickTogglePublish(p.productId, !isPublished)}
                                  className="text-[11px] font-bold text-[#0c3585] underline dark:text-[#f4d378] cursor-pointer"
                                >
                                  {isPublished ? (isAr ? 'إخفاء' : 'Unpublish') : isAr ? 'نشر' : 'Publish'}
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {canEditCatalog && (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-[#0c3585]/25 bg-white px-2.5 text-[11px] font-bold text-[#0c3585] dark:border-[#d9a43b]/30 dark:bg-[#030712] dark:text-[#f4d378] cursor-pointer"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>{isAr ? 'تعديل' : 'Edit'}</span>
                                </button>
                              )}
                              {canManageBatches && (
                                <button
                                  type="button"
                                  onClick={() => openAdjustModal(p)}
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-[#030712] dark:text-slate-200 cursor-pointer"
                                >
                                  <Sliders className="h-3 w-3" />
                                  <span>{isAr ? 'تعديل رصيد' : 'Adjust'}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'batches' && (
        <PharmacyBatchesSection
          firebaseUser={firebaseUser}
          workspace={workspace}
          language={language}
          canManage={canManageBatches}
          onRefresh={onRefresh}
        />
      )}

      {subTab === 'movements' && (
        <PharmacyInventoryMovementsSection workspace={workspace} language={language} />
      )}

      {/* Edit Medicine Modal */}
      {editingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setEditingProduct(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveEdit}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingProduct.brandName || editingProduct.scientificName}
                </h3>
                <p className="text-xs text-slate-500">
                  {editingProduct.scientificName} · {editingProduct.strength} · {editingProduct.packSize}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-4">
              {editImageUrl ? (
                <img
                  src={editImageUrl}
                  alt={editBrand}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-slate-200 bg-[#0c3585]/8 text-[#0c3585] dark:border-slate-700 dark:bg-[#d9a43b]/15 dark:text-[#f4d378]">
                  <Pill className="h-6 w-6" />
                </div>
              )}
              <div className="space-y-1">
                <label className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#0c3585]/25 bg-[#0c3585]/8 px-3 text-xs font-bold text-[#0c3585] dark:border-[#d9a43b]/30 dark:bg-[#d9a43b]/10 dark:text-[#f4d378] cursor-pointer">
                  {uploadingImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  <span>{isAr ? 'رفع صورة الدواء' : 'Upload Medicine Photo'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleUploadMedicineImage(e)}
                    className="hidden"
                  />
                </label>
                {editImageUrl && (
                  <button
                    type="button"
                    onClick={() => setEditImageUrl('')}
                    className="block text-[11px] font-semibold text-rose-600 underline cursor-pointer"
                  >
                    {isAr ? 'إزالة الصورة' : 'Remove photo'}
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'الاسم التجاري' : 'Brand Name'}
                </label>
                <input
                  value={editBrand}
                  onChange={(e) => setEditBrand(e.target.value)}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'الشركة المصنعة' : 'Manufacturer'}
                </label>
                <input
                  value={editManufacturer}
                  onChange={(e) => setEditManufacturer(e.target.value)}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'بلد المنشأ' : 'Country'}
                </label>
                <input
                  value={editCountry}
                  onChange={(e) => setEditCountry(e.target.value)}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'الباركود' : 'Barcode'}
                </label>
                <input
                  dir="ltr"
                  value={editBarcode}
                  onChange={(e) => setEditBarcode(e.target.value)}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'سعر البيع للمريض (د.ع) *' : 'Retail Price (IQD) *'}
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(Math.max(1, Number(e.target.value) || 1))}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'سعر التخفيض (اختياري)' : 'Discount Price (Optional)'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={editDiscountPrice}
                  onChange={(e) => setEditDiscountPrice(e.target.value)}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'حد التنبيه للنواقص' : 'Reorder Level'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={editReorder}
                  onChange={(e) => setEditReorder(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-5 text-xs text-slate-700 dark:text-slate-200">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPublished}
                  onChange={(e) => setEditPublished(e.target.checked)}
                />
                <span>{isAr ? 'منشور في واجهة الصيدلية' : 'Published to Storefront'}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                <span>{isAr ? 'صنف نشط' : 'Product Active'}</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {pt.common.cancel}
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="min-h-[38px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
              >
                {savingEdit ? '...' : pt.common.save}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Documented Manual Stock Adjust Modal */}
      {adjustingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={() => setAdjustingProduct(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveManualAdjust}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <PackagePlus className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                  <span>{isAr ? 'تسوية مخزون موثقة (FEFO)' : 'Documented Stock Adjustment'}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  {adjustingProduct.brandName || adjustingProduct.scientificName} ·{' '}
                  {isAr
                    ? `الرصيد الحالي: ${adjustingProduct.availableQty || 0}`
                    : `Current: ${adjustingProduct.availableQty || 0}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'مقدار التغيير (+ للإضافة، - للخصم) *' : 'Quantity Delta (+/-) *'}
                </label>
                <input
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>

              {adjustDeltaNum > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                      {isAr ? 'رقم التشغيلة الجديدة *' : 'Batch Number *'}
                    </label>
                    <input
                      required
                      value={adjustBatchNumber}
                      onChange={(e) => setAdjustBatchNumber(e.target.value)}
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-latin dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                      {isAr ? 'تاريخ انتهاء الصلاحية *' : 'Expiry Date *'}
                    </label>
                    <input
                      required
                      type="date"
                      value={adjustExpiryDate}
                      onChange={(e) => setAdjustExpiryDate(e.target.value)}
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 dark:[color-scheme:dark] dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                      {isAr ? 'سعر كلفة الوحدة (د.ع)' : 'Unit Purchase Cost (IQD)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={adjustPurchaseCost}
                      onChange={(e) => setAdjustPurchaseCost(e.target.value)}
                      className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 tabular-nums dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1 block font-semibold text-slate-700 dark:text-slate-200">
                  {isAr ? 'السبب الموثق للتعديل (مطلوب) *' : 'Documented Audit Reason *'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={
                    isAr
                      ? 'مثال: تسوية جرد فعلي، استلام تشغيلة خارجية، تلف...'
                      : 'e.g. Stocktake adjustment, damaged packaging...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#030712] dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="min-h-[38px] rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {pt.common.cancel}
              </button>
              <button
                type="submit"
                disabled={savingAdjust}
                className="min-h-[38px] rounded-xl bg-[#0c3585] px-5 text-xs font-bold text-white hover:bg-[#1346ad] disabled:opacity-50 cursor-pointer"
              >
                {savingAdjust ? '...' : isAr ? 'اعتماد التسوية' : 'Commit Adjustment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
