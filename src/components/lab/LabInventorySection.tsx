import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  FlaskConical,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabInventoryItem, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import {
  adjustLabInventoryStock,
  createLabInventoryItem,
  createLabPurchaseOrder,
  createLabSupplier,
  receiveLabPurchaseOrder,
  saveLabTestRecipe,
  updateLabInventoryItem,
} from '../../services/labService';

interface LabInventorySectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

type InventoryTab = 'stock' | 'recipes' | 'suppliers_po' | 'movements';

export const LabInventorySection: React.FC<LabInventorySectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEdit,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [tab, setTab] = useState<InventoryTab>('stock');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Add / Edit Item modal
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LabInventoryItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemCategory, setItemCategory] = useState<'reagent' | 'consumable' | 'kit' | 'control'>('reagent');
  const [itemUnit, setItemUnit] = useState('kit');
  const [itemQty, setItemQty] = useState('10');
  const [itemMin, setItemMin] = useState('3');
  const [itemLot, setItemLot] = useState('');
  const [itemExpiry, setItemExpiry] = useState('');
  const [itemCost, setItemCost] = useState('0');
  const [itemSupplierId, setItemSupplierId] = useState('');
  const [itemNotes, setItemNotes] = useState('');

  // Manual Adjust modal
  const [adjustItem, setAdjustItem] = useState<LabInventoryItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('-1');
  const [adjustReason, setAdjustReason] = useState('');

  // Recipes state
  const [recipeTestId, setRecipeTestId] = useState<string>('');
  const [recipeRows, setRecipeRows] = useState<
    Array<{ itemId: string; quantityPerTest: number }>
  >([]);
  const [recipeStatus, setRecipeStatus] = useState('');

  // Supplier modal
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [supName, setSupName] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supCategory, setSupCategory] = useState('');
  const [supNotes, setSupNotes] = useState('');

  // Purchase Order modal
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<
    Array<{ itemId: string; quantity: number; unitCostIqd: number; lotNumber: string; expiryDate: string }>
  >([]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const in30DaysIso = useMemo(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10), []);

  const filteredStock = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workspace.inventory;
    return workspace.inventory.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.code || '').toLowerCase().includes(q) ||
        i.lotNumber.toLowerCase().includes(q),
    );
  }, [workspace.inventory, search]);

  const lowStockCount = useMemo(
    () => workspace.inventory.filter((i) => Number(i.quantity) <= Number(i.minThreshold)).length,
    [workspace.inventory],
  );
  const expiringCount = useMemo(
    () => workspace.inventory.filter((i) => i.expiryDate && i.expiryDate <= in30DaysIso).length,
    [workspace.inventory, in30DaysIso],
  );

  const openCreateItem = () => {
    setEditingItem(null);
    setItemName('');
    setItemCode('');
    setItemCategory('reagent');
    setItemUnit('test');
    setItemQty('50');
    setItemMin('10');
    setItemLot('');
    setItemExpiry(new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10));
    setItemCost('0');
    setItemSupplierId('');
    setItemNotes('');
    setErrorMsg('');
    setItemModalOpen(true);
  };

  const openEditItem = (it: LabInventoryItem) => {
    setEditingItem(it);
    setItemName(it.name);
    setItemCode(it.code || '');
    setItemCategory(it.category);
    setItemUnit(it.unit);
    setItemQty(String(it.quantity));
    setItemMin(String(it.minThreshold));
    setItemLot(it.lotNumber);
    setItemExpiry(it.expiryDate);
    setItemCost(String(it.unitCostIqd));
    setItemSupplierId(it.supplierId || '');
    setItemNotes(it.notes || '');
    setErrorMsg('');
    setItemModalOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !itemName.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const sup = workspace.suppliers.find((s) => s.supplierId === itemSupplierId);
      if (editingItem) {
        await updateLabInventoryItem(firebaseUser, editingItem.itemId, {
          name: itemName.trim(),
          unit: itemUnit.trim() || 'unit',
          minThreshold: Number(itemMin || 0),
          lotNumber: itemLot.trim(),
          expiryDate: itemExpiry.trim(),
          unitCostIqd: Number(itemCost || 0),
          notes: itemNotes.trim(),
        });
      } else {
        await createLabInventoryItem(firebaseUser, {
          name: itemName.trim(),
          code: itemCode.trim() || undefined,
          category: itemCategory,
          unit: itemUnit.trim() || 'unit',
          quantity: Number(itemQty || 0),
          minThreshold: Number(itemMin || 0),
          lotNumber: itemLot.trim() || 'LOT-1',
          expiryDate: itemExpiry.trim() || in30DaysIso,
          supplierId: sup?.supplierId,
          supplierName: sup?.name,
          unitCostIqd: Number(itemCost || 0),
          notes: itemNotes.trim(),
        });
      }
      await onRefresh();
      setItemModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !adjustItem) return;
    const delta = Number(adjustDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      setErrorMsg(isAr ? 'أدخل قيمة تغيير غير صفرية' : 'Enter a non-zero quantity change');
      return;
    }
    if (!adjustReason.trim()) {
      setErrorMsg(isAr ? 'سبب التعديل إلزامي للتدقيق' : 'Reason is required for audit trail');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      await adjustLabInventoryStock(firebaseUser, adjustItem.itemId, {
        delta,
        reason: adjustReason.trim(),
      });
      await onRefresh();
      setAdjustItem(null);
      setAdjustReason('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectRecipeTest = (testId: string) => {
    setRecipeTestId(testId);
    setRecipeStatus('');
    const existing = workspace.recipes.find((r) => r.testId === testId);
    if (existing) {
      setRecipeRows(
        existing.materials.map((m) => ({
          itemId: m.itemId,
          quantityPerTest: m.quantityPerTest,
        })),
      );
    } else {
      setRecipeRows(
        workspace.inventory[0] ? [{ itemId: workspace.inventory[0].itemId, quantityPerTest: 1 }] : [],
      );
    }
  };

  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !recipeTestId) return;
    const testObj = workspace.tests.find((t) => t.testId === recipeTestId);
    if (!testObj) return;
    const validMaterials = recipeRows
      .filter((r) => r.itemId && Number(r.quantityPerTest) > 0)
      .map((r) => {
        const inv = workspace.inventory.find((i) => i.itemId === r.itemId);
        return {
          itemId: r.itemId,
          itemName: inv?.name || r.itemId,
          unit: inv?.unit || 'unit',
          quantityPerTest: Number(r.quantityPerTest),
        };
      });
    setSaving(true);
    setErrorMsg('');
    setRecipeStatus('');
    try {
      await saveLabTestRecipe(firebaseUser, {
        testId: testObj.testId,
        testName: testObj.nameAr || testObj.nameEn,
        materials: validMaterials,
      });
      await onRefresh();
      setRecipeStatus(isAr ? 'تم حفظ وصفة الاستهلاك بنجاح' : 'Consumption recipe saved');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !supName.trim() || !supPhone.trim()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await createLabSupplier(firebaseUser, {
        name: supName.trim(),
        contactPerson: supContact.trim() || undefined,
        phone: supPhone.trim(),
        email: supEmail.trim() || undefined,
        category: supCategory.trim() || undefined,
        notes: supNotes.trim() || undefined,
      });
      await onRefresh();
      setSupModalOpen(false);
      setSupName('');
      setSupContact('');
      setSupPhone('');
      setSupEmail('');
      setSupCategory('');
      setSupNotes('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const openPoModal = () => {
    setPoSupplierId(workspace.suppliers[0]?.supplierId || '');
    setPoNotes('');
    setPoLines(
      workspace.inventory[0]
        ? [
            {
              itemId: workspace.inventory[0].itemId,
              quantity: 10,
              unitCostIqd: workspace.inventory[0].unitCostIqd || 0,
              lotNumber: workspace.inventory[0].lotNumber || '',
              expiryDate: workspace.inventory[0].expiryDate || in30DaysIso,
            },
          ]
        : [],
    );
    setErrorMsg('');
    setPoModalOpen(true);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !poSupplierId || poLines.length === 0) return;
    const sup = workspace.suppliers.find((s) => s.supplierId === poSupplierId);
    if (!sup) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await createLabPurchaseOrder(firebaseUser, {
        supplierId: sup.supplierId,
        supplierName: sup.name,
        items: poLines.map((ln) => {
          const inv = workspace.inventory.find((i) => i.itemId === ln.itemId);
          return {
            itemId: ln.itemId,
            itemName: inv?.name || ln.itemId,
            quantity: Number(ln.quantity || 1),
            unitCostIqd: Number(ln.unitCostIqd || 0),
            lotNumber: ln.lotNumber.trim() || undefined,
            expiryDate: ln.expiryDate.trim() || undefined,
          };
        }),
        notes: poNotes.trim() || undefined,
      });
      await onRefresh();
      setPoModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  const handleReceivePo = async (poId: string) => {
    if (!canEdit) return;
    setSaving(true);
    setErrorMsg('');
    try {
      await receiveLabPurchaseOrder(firebaseUser, poId);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ERROR');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.inventory.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-latin tabular-nums">
              {isAr ? 'إجمالي المواد:' : 'Items:'} {workspace.inventory.length}
            </span>
            {lowStockCount > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {isAr ? `${lowStockCount} نقص مخزون` : `${lowStockCount} low stock`}
              </span>
            )}
            {expiringCount > 0 && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {isAr ? `${expiringCount} قريبة الانتهاء (≤ 30 يوم)` : `${expiringCount} expiring ≤ 30d`}
              </span>
            )}
          </div>
        </div>
        {canEdit && tab === 'stock' && (
          <button
            type="button"
            onClick={openCreateItem}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{lt.inventory.addItem}</span>
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {(
          [
            { id: 'stock', label: lt.inventory.tabStock, icon: Package },
            { id: 'recipes', label: lt.inventory.tabRecipes, icon: FlaskConical },
            { id: 'suppliers_po', label: lt.inventory.tabSuppliersPo, icon: ShoppingCart },
            { id: 'movements', label: lt.inventory.tabMovements, icon: ClipboardList },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[40px] rounded-xl px-3.5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition ${
                active
                  ? 'bg-[#0c3585] text-white'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] text-slate-700 dark:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/30 px-4 py-2.5 text-xs text-rose-700 dark:text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* TAB 1: Stock & Expiry */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={lt.common.search}
            className="w-full max-w-md min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3.5 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0c3585]"
          />

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a]">
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{lt.common.name}</th>
                  <th className="px-4 py-3 text-start">{lt.catalog.category}</th>
                  <th className="px-4 py-3 text-start">{lt.inventory.quantity}</th>
                  <th className="px-4 py-3 text-start">{lt.inventory.minThreshold}</th>
                  <th className="px-4 py-3 text-start">{lt.inventory.lotNumber}</th>
                  <th className="px-4 py-3 text-start">{lt.inventory.expiryDate}</th>
                  <th className="px-4 py-3 text-start">{lt.inventory.unitCostIqd}</th>
                  <th className="px-4 py-3 text-end">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      {lt.common.noData}
                    </td>
                  </tr>
                ) : (
                  filteredStock.map((it) => {
                    const isLow = Number(it.quantity) <= Number(it.minThreshold);
                    const isExpired = Boolean(it.expiryDate && it.expiryDate < todayIso);
                    const isExpiringSoon = Boolean(
                      it.expiryDate && it.expiryDate >= todayIso && it.expiryDate <= in30DaysIso,
                    );
                    return (
                      <tr key={it.itemId} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900 dark:text-white">{it.name}</div>
                          {it.supplierName && (
                            <div className="text-[11px] text-slate-500">{it.supplierName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300 uppercase font-latin">
                          {it.category}
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums font-bold">
                          <span className={isLow ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}>
                            {it.quantity} {it.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums text-slate-500">
                          {it.minThreshold} {it.unit}
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums text-slate-600 dark:text-slate-300">
                          {it.lotNumber || '—'}
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums">
                          <span
                            className={
                              isExpired
                                ? 'font-bold text-rose-600 dark:text-rose-400'
                                : isExpiringSoon
                                  ? 'font-bold text-amber-600 dark:text-amber-400'
                                  : 'text-slate-600 dark:text-slate-300'
                            }
                          >
                            {it.expiryDate || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-latin tabular-nums text-slate-700 dark:text-slate-300">
                          {Number(it.unitCostIqd || 0).toLocaleString()} {lt.common.iqd}
                        </td>
                        <td className="px-4 py-3 text-end">
                          {canEdit && (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustItem(it);
                                  setAdjustDelta('-1');
                                  setAdjustReason('');
                                  setErrorMsg('');
                                }}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-[#0c3585] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <SlidersHorizontal className="h-3 w-3" />
                                <span>{lt.inventory.adjustStock}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditItem(it)}
                                className="rounded-lg border border-slate-200 dark:border-slate-700 p-1.5 text-slate-600 dark:text-slate-300 hover:border-[#0c3585] cursor-pointer"
                                title={lt.common.edit}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Consumption Recipes */}
      {tab === 'recipes' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <form
            onSubmit={handleSaveRecipe}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-4"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'ربط التحليل بمواد الكواشف والخصم التلقائي' : 'Configure Test Consumption Recipe'}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                {isAr ? 'اختر التحليل المخبري' : 'Select Lab Test'}
              </label>
              <select
                value={recipeTestId}
                onChange={(e) => handleSelectRecipeTest(e.target.value)}
                className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-xs text-slate-900 dark:text-white"
              >
                <option value="">{isAr ? '— اختر تحليلاً —' : '— Select Test —'}</option>
                {workspace.tests.map((t) => (
                  <option key={t.testId} value={t.testId}>
                    {t.code ? `[${t.code}] ` : ''}{isAr ? t.nameAr : t.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {recipeTestId && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isAr ? 'المواد المستهلكة لكل فحص' : 'Materials per Single Test'}
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() =>
                        setRecipeRows((prev) => [
                          ...prev,
                          { itemId: workspace.inventory[0]?.itemId || '', quantityPerTest: 1 },
                        ])
                      }
                      className="text-xs font-bold text-[#0c3585] dark:text-blue-400 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{lt.common.add}</span>
                    </button>
                  )}
                </div>

                {recipeRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={row.itemId}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setRecipeRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, itemId: e.target.value } : r)),
                        )
                      }
                      className="flex-1 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2.5 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="">—</option>
                      {workspace.inventory.map((inv) => (
                        <option key={inv.itemId} value={inv.itemId}>
                          {inv.name} ({inv.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      disabled={!canEdit}
                      value={row.quantityPerTest}
                      onChange={(e) =>
                        setRecipeRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, quantityPerTest: Number(e.target.value || 0) } : r,
                          ),
                        )
                      }
                      className="w-24 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2.5 text-xs font-latin tabular-nums text-slate-900 dark:text-white"
                    />
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setRecipeRows((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {recipeStatus && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{recipeStatus}</p>
                )}

                {canEdit && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold cursor-pointer disabled:opacity-60"
                  >
                    {saving ? lt.common.saving : lt.inventory.saveRecipe}
                  </button>
                )}
              </div>
            )}
          </form>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'الوصفات المعتمدة للخصم التلقائي' : 'Active Auto-Deduction Recipes'}
            </h3>
            {workspace.recipes.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">{lt.common.noData}</p>
            ) : (
              <div className="space-y-2.5">
                {workspace.recipes.map((rec) => (
                  <div
                    key={rec.recipeId}
                    onClick={() => handleSelectRecipeTest(rec.testId)}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs cursor-pointer hover:border-[#0c3585]"
                  >
                    <div className="font-bold text-slate-900 dark:text-white">{rec.testName}</div>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {rec.materials.map((m, idx) => (
                        <span
                          key={idx}
                          className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-latin text-slate-700 dark:text-slate-300"
                        >
                          {m.itemName}: {m.quantityPerTest} {m.unit}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Suppliers & Purchase Orders */}
      {tab === 'suppliers_po' && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Suppliers Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Building2 className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
                <span>{isAr ? 'الموردون والشركات المجهزة' : 'Suppliers & Vendors'}</span>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setSupModalOpen(true)}
                  className="min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-[#0c3585] dark:text-blue-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lt.inventory.addSupplier}</span>
                </button>
              )}
            </div>
            {workspace.suppliers.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">{lt.common.noData}</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {workspace.suppliers.map((sup) => (
                  <div key={sup.supplierId} className="py-2.5 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">{sup.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {[sup.contactPerson, sup.category].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    <span className="font-latin tabular-nums text-slate-600 dark:text-slate-300">{sup.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Purchase Orders Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <ShoppingCart className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
                <span>{isAr ? 'أوامر الشراء والتوريد' : 'Purchase Orders'}</span>
              </div>
              {canEdit && workspace.suppliers.length > 0 && workspace.inventory.length > 0 && (
                <button
                  type="button"
                  onClick={openPoModal}
                  className="medora-gold-button min-h-[36px] rounded-xl px-3 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lt.inventory.createPo}</span>
                </button>
              )}
            </div>
            {workspace.purchaseOrders.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">{lt.common.noData}</p>
            ) : (
              <div className="space-y-2.5">
                {workspace.purchaseOrders.map((po) => (
                  <div
                    key={po.poId}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                          {po.poNumber}
                        </span>
                        <span className="mx-1.5 text-slate-400">·</span>
                        <span className="font-bold text-slate-900 dark:text-white">{po.supplierName}</span>
                      </div>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          po.status === 'received'
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {lt.status[po.status] || po.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {po.items.map((it) => `${it.itemName} × ${it.quantity}`).join(' · ')}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-latin tabular-nums font-bold text-slate-900 dark:text-white">
                        {po.totalCostIqd.toLocaleString()} {lt.common.iqd}
                      </span>
                      {canEdit && po.status !== 'received' && po.status !== 'cancelled' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleReceivePo(po.poId)}
                          className="rounded-lg bg-emerald-600 text-white px-3 py-1 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:bg-emerald-700"
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          <span>{lt.inventory.receivePo}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: Stock Movements Ledger */}
      {tab === 'movements' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a]">
          <table className="w-full text-start text-xs">
            <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-start">{lt.common.date}</th>
                <th className="px-4 py-3 text-start">{lt.common.name}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'النوع' : 'Type'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'التغيير' : 'Delta'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'الرصيد بعد' : 'Balance'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'السبب / المرجع' : 'Reason'}</th>
                <th className="px-4 py-3 text-start">{isAr ? 'بواسطة' : 'By'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {workspace.stockMovements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    {lt.common.noData}
                  </td>
                </tr>
              ) : (
                workspace.stockMovements.map((mv) => (
                  <tr key={mv.movementId}>
                    <td className="px-4 py-3 font-latin tabular-nums text-slate-500">
                      {String(mv.createdAt || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{mv.itemName}</td>
                    <td className="px-4 py-3 font-latin text-slate-600 dark:text-slate-300">{mv.movementType}</td>
                    <td
                      className={`px-4 py-3 font-latin tabular-nums font-bold ${
                        mv.quantityDelta >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                      {mv.balanceAfter}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {mv.reason} {mv.orderNumber ? `(${mv.orderNumber})` : ''}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{mv.actorName}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add/Edit Inventory Item */}
      {itemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingItem ? lt.common.edit : lt.inventory.addItem}
              </h3>
              <button type="button" onClick={() => setItemModalOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveItem} className="mt-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold mb-1">{lt.common.name}</label>
                  <input
                    required
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{lt.catalog.category}</label>
                  <select
                    disabled={Boolean(editingItem)}
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value as 'reagent' | 'consumable' | 'kit' | 'control')}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                  >
                    <option value="reagent">Reagent</option>
                    <option value="kit">Diagnostic Kit</option>
                    <option value="consumable">Consumable</option>
                    <option value="control">QC Control</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">{lt.catalog.unit}</label>
                  <input
                    required
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                  />
                </div>
                {!editingItem && (
                  <div>
                    <label className="block font-semibold mb-1">{lt.inventory.quantity}</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={itemQty}
                      onChange={(e) => setItemQty(e.target.value)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block font-semibold mb-1">{lt.inventory.minThreshold}</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={itemMin}
                    onChange={(e) => setItemMin(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{lt.inventory.lotNumber}</label>
                  <input
                    value={itemLot}
                    onChange={(e) => setItemLot(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{lt.inventory.expiryDate}</label>
                  <input
                    type="date"
                    value={itemExpiry}
                    onChange={(e) => setItemExpiry(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">{lt.inventory.unitCostIqd}</label>
                  <input
                    type="number"
                    value={itemCost}
                    onChange={(e) => setItemCost(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
                  />
                </div>
                {!editingItem && workspace.suppliers.length > 0 && (
                  <div>
                    <label className="block font-semibold mb-1">{isAr ? 'المورد' : 'Supplier'}</label>
                    <select
                      value={itemSupplierId}
                      onChange={(e) => setItemSupplierId(e.target.value)}
                      className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                    >
                      <option value="">—</option>
                      {workspace.suppliers.map((s) => (
                        <option key={s.supplierId} value={s.supplierId}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
                >
                  {saving ? lt.common.saving : lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manual Adjust / Dispense */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {lt.inventory.adjustStock}: {adjustItem.name}
              </h3>
              <button type="button" onClick={() => setAdjustItem(null)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdjustStock} className="mt-4 space-y-3 text-xs">
              <div className="text-slate-500">
                {lt.inventory.quantity}: <strong className="font-latin tabular-nums">{adjustItem.quantity} {adjustItem.unit}</strong>
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.inventory.adjustDelta}</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin tabular-nums text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.inventory.adjustReason}</label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] p-3 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
                >
                  {saving ? lt.common.saving : lt.common.confirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Supplier */}
      {supModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.inventory.addSupplier}</h3>
              <button type="button" onClick={() => setSupModalOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSupplier} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">{lt.common.name}</label>
                <input
                  required
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.common.phone}</label>
                <input
                  required
                  value={supPhone}
                  onChange={(e) => setSupPhone(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 font-latin text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'الشخص المسؤول' : 'Contact Person'}</label>
                <input
                  value={supContact}
                  onChange={(e) => setSupContact(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{lt.catalog.category}</label>
                <input
                  value={supCategory}
                  onChange={(e) => setSupCategory(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSupModalOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
                >
                  {saving ? lt.common.saving : lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Purchase Order */}
      {poModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{lt.inventory.createPo}</h3>
              <button type="button" onClick={() => setPoModalOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreatePo} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'المورد' : 'Supplier'}</label>
                <select
                  required
                  value={poSupplierId}
                  onChange={(e) => setPoSupplierId(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                >
                  {workspace.suppliers.map((s) => (
                    <option key={s.supplierId} value={s.supplierId}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold">{isAr ? 'بنود الشراء' : 'Order Items'}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setPoLines((prev) => [
                        ...prev,
                        {
                          itemId: workspace.inventory[0]?.itemId || '',
                          quantity: 5,
                          unitCostIqd: workspace.inventory[0]?.unitCostIqd || 0,
                          lotNumber: '',
                          expiryDate: in30DaysIso,
                        },
                      ])
                    }
                    className="text-xs font-bold text-[#0c3585] dark:text-blue-400 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lt.common.add}</span>
                  </button>
                </div>
                {poLines.map((ln, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <select
                      value={ln.itemId}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, itemId: e.target.value } : row)),
                        )
                      }
                      className="col-span-5 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2 text-slate-900 dark:text-white"
                    >
                      {workspace.inventory.map((inv) => (
                        <option key={inv.itemId} value={inv.itemId}>
                          {inv.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      value={ln.quantity}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, quantity: Number(e.target.value || 1) } : row,
                          ),
                        )
                      }
                      placeholder="Qty"
                      className="col-span-2 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2 font-latin tabular-nums text-slate-900 dark:text-white"
                    />
                    <input
                      type="number"
                      min="0"
                      value={ln.unitCostIqd}
                      onChange={(e) =>
                        setPoLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, unitCostIqd: Number(e.target.value || 0) } : row,
                          ),
                        )
                      }
                      placeholder="Cost"
                      className="col-span-4 min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-2 font-latin tabular-nums text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 text-rose-500 flex justify-center cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div>
                <label className="block font-semibold mb-1">{lt.common.notes}</label>
                <input
                  value={poNotes}
                  onChange={(e) => setPoNotes(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1834] px-3 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPoModalOpen(false)}
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[40px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
                >
                  {saving ? lt.common.saving : lt.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
