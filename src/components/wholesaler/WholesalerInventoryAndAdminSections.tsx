import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { Plus, Send, Upload } from 'lucide-react';
import { wholesalerTranslations } from '../../i18n/wholesalerTranslations';
import {
  addWholesalerBatch,
  addWholesalerStaff,
  createWholesalerPurchaseOrder,
  createWholesalerSupplier,
  markWholesalerNotificationRead,
  receiveWholesalerPurchaseOrder,
  saveWholesalerProduct,
  sendWholesalerCommunication,
  updateWholesalerSettings,
  updateWholesalerStaff,
} from '../../services/wholesalerService';
import type { Language } from '../../types/medora';
import type { DosageForm } from '../../types/pharmacy';
import type { WholesalerStaffRole, WholesalerWorkspaceData } from '../../types/wholesaler';
import { BulkDrugImportWorkspace } from '../shared/BulkDrugImportWorkspace';
import { MedoraMessagingPanel } from '../shared/MedoraMessagingPanel';

function formatIqd(val: number, isAr: boolean): string {
  return `${Math.round(val || 0).toLocaleString()} ${isAr ? 'د.ع' : 'IQD'}`;
}

export function WholesalerProductsSection({
  firebaseUser,
  workspace,
  language,
  canEdit,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [scientificName, setScientificName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [strength, setStrength] = useState('');
  const [dosageForm, setDosageForm] = useState<DosageForm>('tablet');
  const [packSize, setPackSize] = useState('');
  const [brandName, setBrandName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [country, setCountry] = useState('');
  const [wholesalePriceIqd, setWholesalePriceIqd] = useState(0);
  const [bonusRuleLabel, setBonusRuleLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveWholesalerProduct(firebaseUser, {
        scientificName: scientificName.trim(),
        activeIngredient: activeIngredient.trim() || scientificName.trim(),
        strength: strength.trim(),
        dosageForm,
        packSize: packSize.trim(),
        brandName: brandName.trim(),
        manufacturer: manufacturer.trim() || undefined,
        country: country.trim() || undefined,
        wholesalePriceIqd,
        bonusRuleLabel: bonusRuleLabel.trim() || undefined,
      });
      setScientificName('');
      setActiveIngredient('');
      setStrength('');
      setPackSize('');
      setBrandName('');
      setManufacturer('');
      setCountry('');
      setWholesalePriceIqd(0);
      setBonusRuleLabel('');
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setBulkImportOpen((v) => !v)}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-4 text-xs font-bold cursor-pointer ${
              bulkImportOpen
                ? 'border-[#0c3585] bg-[#0c3585] text-white dark:border-[#d9a43b] dark:bg-[#d9a43b] dark:text-[#040917]'
                : 'border-slate-300 bg-white text-slate-800 dark:border-slate-700 dark:bg-[#07122a] dark:text-slate-100'
            }`}
          >
            <Upload className="h-3.5 w-3.5" />
            <span>{isAr ? 'استيراد الأدوية بالجملة' : 'Bulk Drug Import'}</span>
          </button>
        </div>
      )}

      {bulkImportOpen && canEdit && (
        <BulkDrugImportWorkspace
          firebaseUser={firebaseUser}
          portalType="wholesaler"
          language={language}
          onSuccessRefresh={onRefresh}
        />
      )}

      {canEdit && (
        <form
          onSubmit={(e) => void handleSave(e)}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? 'إضافة صنف إلى كتالوج الجملة' : 'Add Product to Wholesale Catalog'}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <input
              required
              value={scientificName}
              onChange={(e) => setScientificName(e.target.value)}
              placeholder={isAr ? 'الاسم العلمي' : 'Scientific Name'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              value={activeIngredient}
              onChange={(e) => setActiveIngredient(e.target.value)}
              placeholder={isAr ? 'المادة الفعالة' : 'Active Ingredient'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              value={strength}
              onChange={(e) => setStrength(e.target.value)}
              placeholder={isAr ? 'التركيز' : 'Strength'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <select
              value={dosageForm}
              onChange={(e) => setDosageForm(e.target.value as DosageForm)}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="tablet">Tablet</option>
              <option value="capsule">Capsule</option>
              <option value="syrup">Syrup</option>
              <option value="injection">Injection</option>
              <option value="cream">Cream</option>
              <option value="drops">Drops</option>
              <option value="inhaler">Inhaler</option>
              <option value="other">Other</option>
            </select>
            <input
              required
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              placeholder={isAr ? 'العبوة' : 'Pack Size'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={isAr ? 'الاسم التجاري' : 'Brand Name'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder={isAr ? 'الشركة المصنعة' : 'Manufacturer'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={isAr ? 'بلد المنشأ' : 'Country'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              type="number"
              min={1}
              value={wholesalePriceIqd || ''}
              onChange={(e) => setWholesalePriceIqd(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'سعر الجملة (د.ع)' : 'Wholesale Price (IQD)'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              value={bonusRuleLabel}
              onChange={(e) => setBonusRuleLabel(e.target.value)}
              placeholder={isAr ? 'قاعدة البونص (مثال 10+1)' : 'Bonus (e.g. 10+1)'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{wholesalerTranslations[language].common.save}</span>
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className="px-4 py-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'سعر الجملة' : 'Wholesale'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'بونص' : 'Bonus'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'المتاح (FEFO)' : 'Available'}</th>
                <th className="px-4 py-3 text-center">{isAr ? 'أقرب انتهاء' : 'Nearest Expiry'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.products.map((p) => (
                <tr key={p.productId}>
                  <td className="px-4 py-3">
                    <div className="font-bold">{p.brandName || p.scientificName}</div>
                    <div className="text-slate-500">
                      {p.activeIngredient} · {p.strength} · {p.packSize}
                      {p.manufacturer || p.country
                        ? ` · ${[p.manufacturer, p.country].filter(Boolean).join(' / ')}`
                        : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-bold tabular-nums">
                    {formatIqd(p.wholesalePriceIqd, isAr)}
                  </td>
                  <td className="px-4 py-3 text-center">{p.bonusRuleLabel || '—'}</td>
                  <td className="px-4 py-3 text-center font-bold tabular-nums">{p.availableQty || 0}</td>
                  <td className="px-4 py-3 text-center font-latin tabular-nums">{p.nearestExpiryDate || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function WholesalerBatchesSection({
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
  const [productId, setProductId] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [availableQty, setAvailableQty] = useState(1);
  const [purchaseCostIqd, setPurchaseCostIqd] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!productId || !batchNumber || !expiryDate) return;
    setSaving(true);
    try {
      await addWholesalerBatch(firebaseUser, {
        productId,
        batchNumber: batchNumber.trim(),
        expiryDate,
        availableQty,
        purchaseCostIqd,
      });
      setBatchNumber('');
      setExpiryDate('');
      setAvailableQty(1);
      await onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={(e) => void handleAdd(e)}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold">{isAr ? 'إضافة وجبة / تشغيلة للمستودع' : 'Add Warehouse Batch'}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
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
              placeholder={isAr ? 'رقم التشغيلة' : 'Batch #'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              type="number"
              min={1}
              value={availableQty}
              onChange={(e) => setAvailableQty(Math.max(1, Number(e.target.value) || 1))}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              type="number"
              min={0}
              value={purchaseCostIqd}
              onChange={(e) => setPurchaseCostIqd(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'الكلفة' : 'Unit Cost'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
          >
            {wholesalerTranslations[language].common.add}
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        <table className="w-full text-start text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'الصنف' : 'Product'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'التشغيلة' : 'Batch #'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'الانتهاء' : 'Expiry'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'متاح / محجوز' : 'Avail / Res'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'الحالة' : 'Status'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {workspace.batches.map((b) => (
              <tr key={b.batchId}>
                <td className="px-4 py-3 font-bold">{b.productName}</td>
                <td className="px-4 py-3 text-center font-latin">{b.batchNumber}</td>
                <td className="px-4 py-3 text-center font-latin tabular-nums">{b.expiryDate}</td>
                <td className="px-4 py-3 text-center font-bold tabular-nums">
                  {b.availableQty} / {b.reservedQty}
                </td>
                <td className="px-4 py-3 text-center font-bold">
                  {b.isExpired ? (
                    <span className="text-rose-600">{isAr ? 'منتهي' : 'Expired'}</span>
                  ) : (
                    <span className="text-emerald-700">{isAr ? 'صالح' : 'Active'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WholesalerSuppliersAndPosSection({
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
  mode: 'suppliers' | 'purchase_orders';
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supCity, setSupCity] = useState('');
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poProductId, setPoProductId] = useState('');
  const [poQty, setPoQty] = useState(50);
  const [poCost, setPoCost] = useState(0);
  const [poBatch, setPoBatch] = useState('');
  const [poExpiry, setPoExpiry] = useState('');
  const [busy, setBusy] = useState(false);

  if (mode === 'suppliers') {
    return (
      <div className="space-y-6">
        {canManage && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await createWholesalerSupplier(firebaseUser, {
                  name: supName.trim(),
                  phone: supPhone.trim(),
                  countryOrCity: supCity.trim(),
                });
                setSupName('');
                setSupPhone('');
                setSupCity('');
                await onRefresh();
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
          >
            <h3 className="text-sm font-bold">{isAr ? 'إضافة مصنع / مورد' : 'Add Supplier / Manufacturer'}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                required
                value={supName}
                onChange={(e) => setSupName(e.target.value)}
                placeholder={isAr ? 'اسم الشركة الموردة' : 'Supplier Name'}
                className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                value={supPhone}
                onChange={(e) => setSupPhone(e.target.value)}
                placeholder={isAr ? 'الهاتف' : 'Phone'}
                className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                value={supCity}
                onChange={(e) => setSupCity(e.target.value)}
                placeholder={isAr ? 'البلد / المدينة' : 'Country / City'}
                className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="medora-gold-button min-h-[38px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
            >
              {wholesalerTranslations[language].common.add}
            </button>
          </form>
        )}

        <div className="space-y-2.5">
          {workspace.suppliers.map((s) => (
            <div
              key={s.supplierId}
              className="flex justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-slate-500">
                  {s.countryOrCity} · {s.phone}
                </p>
              </div>
              <span className="font-bold">{s.isActive ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const prod = workspace.products.find((p) => p.productId === poProductId);
            if (!poSupplierId || !prod) return;
            setBusy(true);
            try {
              await createWholesalerPurchaseOrder(firebaseUser, {
                supplierId: poSupplierId,
                items: [
                  {
                    productId: prod.productId,
                    medicineName: prod.brandName || prod.scientificName,
                    quantity: poQty,
                    unitCostIqd: poCost,
                    batchNumber: poBatch.trim(),
                    expiryDate: poExpiry,
                  },
                ],
              });
              setPoBatch('');
              setPoExpiry('');
              await onRefresh();
            } finally {
              setBusy(false);
            }
          }}
          className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
        >
          <h3 className="text-sm font-bold">{isAr ? 'إنشاء أمر شراء من مورد' : 'Create Supplier Purchase Order'}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select
              required
              value={poSupplierId}
              onChange={(e) => setPoSupplierId(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">{isAr ? 'اختر المورد...' : 'Select Supplier...'}</option>
              {workspace.suppliers.map((s) => (
                <option key={s.supplierId} value={s.supplierId}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              required
              value={poProductId}
              onChange={(e) => setPoProductId(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="">{isAr ? 'اختر الصنف...' : 'Select Product...'}</option>
              {workspace.products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.brandName || p.scientificName}
                </option>
              ))}
            </select>
            <input
              required
              type="number"
              min={1}
              value={poQty}
              onChange={(e) => setPoQty(Math.max(1, Number(e.target.value) || 1))}
              placeholder={isAr ? 'الكمية' : 'Qty'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              type="number"
              min={1}
              value={poCost || ''}
              onChange={(e) => setPoCost(Math.max(0, Number(e.target.value) || 0))}
              placeholder={isAr ? 'كلفة الوحدة' : 'Unit Cost'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              value={poBatch}
              onChange={(e) => setPoBatch(e.target.value)}
              placeholder={isAr ? 'رقم التشغيلة' : 'Batch #'}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <input
              required
              type="date"
              value={poExpiry}
              onChange={(e) => setPoExpiry(e.target.value)}
              className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="medora-gold-button min-h-[38px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
          >
            {isAr ? 'إنشاء أمر الشراء' : 'Create PO'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {workspace.purchaseOrders.map((po) => (
          <div
            key={po.poId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div>
              <p className="font-latin font-bold text-[#b68023]">{po.poNumber}</p>
              <p className="font-bold text-slate-900 dark:text-white">{po.supplierName}</p>
              <p className="text-slate-500">
                {po.status} · {formatIqd(po.totalCostIqd, isAr)}
              </p>
            </div>
            {canManage && po.status !== 'received' && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void receiveWholesalerPurchaseOrder(firebaseUser, po.poId).then(onRefresh)
                }
                className="medora-gold-button min-h-[36px] rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
              >
                {isAr ? 'استلام وإدخال التشغيلات للمستودع' : 'Receive PO Into Warehouse Batches'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WholesalerStaffSection({
  firebaseUser,
  workspace,
  language,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const wt = wholesalerTranslations[language];
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<WholesalerStaffRole>('sales_rep');
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-6">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          try {
            await addWholesalerStaff(firebaseUser, {
              email: email.trim(),
              fullName: fullName.trim(),
              phone: phone.trim() || undefined,
              role,
            });
            setEmail('');
            setFullName('');
            setPhone('');
            await onRefresh();
          } finally {
            setSaving(false);
          }
        }}
        className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]"
      >
        <h3 className="text-sm font-bold">{isAr ? 'إضافة موظف للمذخر (مستقل عن السكرتارية)' : 'Add Independent Warehouse Staff'}</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={isAr ? 'الاسم الكامل' : 'Full Name'}
            className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as WholesalerStaffRole)}
            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            {Object.entries(wt.roles)
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
            className="min-h-[40px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="medora-gold-button min-h-[38px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
        >
          {wt.common.add}
        </button>
      </form>

      <div className="space-y-2">
        {workspace.staff.map((st) => (
          <div
            key={st.staffId}
            className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-[#07122a]"
          >
            <div>
              <p className="font-bold">
                {st.fullName} · {wt.roles[st.role] || st.role}
              </p>
              <p className="font-latin text-slate-500">{st.email}</p>
            </div>
            <button
              type="button"
              onClick={() =>
                void updateWholesalerStaff(firebaseUser, st.staffId, {
                  status: st.status === 'active' ? 'suspended' : 'active',
                }).then(onRefresh)
              }
              className="rounded-lg border border-slate-300 px-3 py-1 font-bold dark:border-slate-700 cursor-pointer"
            >
              {st.status === 'active' ? (isAr ? 'تعليق' : 'Suspend') : isAr ? 'تفعيل' : 'Activate'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WholesalerCommsAndSettingsSection({
  firebaseUser,
  workspace,
  language,
  mode,
  onRefresh,
}: {
  firebaseUser: User;
  workspace: WholesalerWorkspaceData;
  language: Language;
  mode: 'communications' | 'reports' | 'settings' | 'inventory' | 'returns';
  onRefresh: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const [body, setBody] = useState('');
  const [channelType, setChannelType] = useState<'pharmacy_supply' | 'super_admin'>('super_admin');
  const [workingHours, setWorkingHours] = useState(workspace.wholesalerProfile.workingDaysAndHours || '');
  const [minOrder, setMinOrder] = useState(workspace.wholesalerProfile.minimumOrderIqd || 0);
  const [busy, setBusy] = useState(false);

  if (mode === 'inventory') {
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a]">
        <table className="w-full text-start text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="px-4 py-3 text-start">{isAr ? 'الحركة' : 'Movement'}</th>
              <th className="px-4 py-3 text-center">{isAr ? 'التشغيلة' : 'Batch'}</th>
              <th className="px-4 py-3 text-center">Δ</th>
              <th className="px-4 py-3 text-start">{isAr ? 'السبب' : 'Reason'}</th>
              <th className="px-4 py-3 text-start">{isAr ? 'المسؤول' : 'Actor'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {workspace.movements.map((m) => (
              <tr key={m.movementId}>
                <td className="px-4 py-3 font-bold">{m.movementType}</td>
                <td className="px-4 py-3 text-center font-latin">{m.batchNumber}</td>
                <td className="px-4 py-3 text-center font-latin font-bold tabular-nums">
                  {m.quantityDelta} / {m.reservedDelta}
                </td>
                <td className="px-4 py-3">{m.reason}</td>
                <td className="px-4 py-3 text-slate-500">{m.actorName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (mode === 'returns') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-xs dark:border-slate-800 dark:bg-[#07122a]">
        {workspace.returns.length === 0 ? (
          <p className="text-center text-slate-500">{wholesalerTranslations[language].common.noData}</p>
        ) : (
          workspace.returns.map((r) => (
            <div key={r.returnId} className="flex justify-between border-b py-2.5">
              <span>
                {r.orderNumber} · {r.pharmacyName} ({r.reason})
              </span>
              <span className="font-bold tabular-nums">{formatIqd(r.totalCreditIqd, isAr)}</span>
            </div>
          ))
        )}
      </div>
    );
  }

  if (mode === 'reports') {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-xs text-slate-500">{isAr ? 'مبيعات التوريد' : 'Monthly Supply Revenue'}</p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums">
              {formatIqd(workspace.reports.monthlySupplyRevenueIqd, isAr)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-xs text-slate-500">{isAr ? 'الذمم المستحقة' : 'Receivables'}</p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums">
              {formatIqd(workspace.reports.totalReceivablesIqd, isAr)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
            <p className="text-xs text-slate-500">{isAr ? 'أكثر الأصناف توريداً' : 'Top Supplied'}</p>
            <p className="mt-1 font-latin text-xl font-bold tabular-nums">
              {workspace.reports.topSuppliedProducts.length}
            </p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-2 text-xs dark:border-slate-800 dark:bg-[#07122a]">
          <h3 className="font-bold text-sm">{isAr ? 'سجل التدقيق الأمني' : 'Wholesaler Audit Logs'}</h3>
          {workspace.auditLogs.slice(0, 15).map((l) => (
            <div key={l.logId} className="flex justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
              <span>
                <strong>{l.actorName}</strong> · {l.action} · {l.details}
              </span>
              <span className="text-slate-500 tabular-nums">{String(l.createdAt || '').slice(0, 16)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'settings') {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await updateWholesalerSettings(firebaseUser, {
              workingDaysAndHours: workingHours,
              minimumOrderIqd: minOrder,
            });
            await onRefresh();
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-[#07122a]"
      >
        <h3 className="text-sm font-bold">{isAr ? 'إعدادات المذخر' : 'Wholesaler Settings'}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            placeholder={isAr ? 'ساعات الدوام' : 'Working Hours'}
            className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="number"
            min={0}
            value={minOrder}
            onChange={(e) => setMinOrder(Math.max(0, Number(e.target.value) || 0))}
            placeholder={isAr ? 'الحد الأدنى لطلب الصيدلية' : 'Minimum Supply Order (IQD)'}
            className="min-h-[42px] rounded-xl border border-slate-300 px-3 text-xs tabular-nums dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] cursor-pointer"
        >
          {wholesalerTranslations[language].common.save}
        </button>
      </form>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold">{isAr ? 'إشعارات المذخر الفورية' : 'Wholesaler Notifications'}</h3>
        {workspace.notifications.map((n) => (
          <div key={n.notificationId} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
            <div className="flex justify-between">
              <strong>{n.title}</strong>
              {!n.isRead && (
                <button
                  type="button"
                  onClick={() =>
                    void markWholesalerNotificationRead(firebaseUser, n.notificationId).then(onRefresh)
                  }
                  className="text-[#0c3585] underline cursor-pointer"
                >
                  {isAr ? 'تمت القراءة' : 'Mark Read'}
                </button>
              )}
            </div>
            <p className="mt-1 text-slate-600 dark:text-slate-300">{n.body}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 dark:border-slate-800 dark:bg-[#07122a]">
        <h3 className="text-sm font-bold">{isAr ? 'المراسلات' : 'Communications'}</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!body.trim()) return;
            setBusy(true);
            try {
              await sendWholesalerCommunication(firebaseUser, { channelType, body: body.trim() });
              setBody('');
              await onRefresh();
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-wrap gap-2"
        >
          <select
            value={channelType}
            onChange={(e) => setChannelType(e.target.value as 'pharmacy_supply' | 'super_admin')}
            className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="super_admin">Super Admin</option>
            <option value="pharmacy_supply">Pharmacy</option>
          </select>
          <input
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={isAr ? 'رسالة...' : 'Message...'}
            className="min-h-[38px] flex-1 rounded-xl border border-slate-300 px-3 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={busy}
            className="medora-gold-button inline-flex min-h-[38px] items-center gap-1 rounded-xl px-4 text-xs font-bold text-[#040917] cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </form>
        <div className="space-y-2 text-xs">
          {workspace.communications.map((c) => (
            <div key={c.messageId} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900/50">
              <strong className="text-[#0c3585] dark:text-[#f4d378]">{c.senderName}: </strong>
              <span>{c.body}</span>
            </div>
          ))}
        </div>
      </div>

      <MedoraMessagingPanel
        firebaseUser={firebaseUser}
        lang={language}
        portalRole="wholesaler"
        titleAr="المراسلات المباشرة مع الصيدليات والإدارة"
        titleEn="Direct Messaging with Pharmacies & Admin"
      />
    </div>
  );
}
