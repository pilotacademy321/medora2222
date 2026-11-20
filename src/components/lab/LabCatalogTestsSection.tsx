import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Check, FlaskConical, Pencil, Plus, Search, Sparkles, X } from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabSampleType, LabTestCatalogItem, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { adoptCentralLabTests, createLabTest, updateLabTest } from '../../services/labService';

interface LabCatalogTestsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

const SAMPLE_TYPES: LabSampleType[] = ['blood', 'serum', 'plasma', 'urine', 'stool', 'swab', 'saliva', 'csf', 'other'];

export const LabCatalogTestsSection: React.FC<LabCatalogTestsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEdit,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [tab, setTab] = useState<'my' | 'central'>('my');
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedCentralIds, setSelectedCentralIds] = useState<string[]>([]);
  const [adopting, setAdopting] = useState(false);

  const [editingTest, setEditingTest] = useState<LabTestCatalogItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [code, setCode] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState('');
  const [sampleType, setSampleType] = useState<LabSampleType>('serum');
  const [unit, setUnit] = useState('');
  const [referenceRangeText, setReferenceRangeText] = useState('');
  const [prepInstructions, setPrepInstructions] = useState('');
  const [priceIqd, setPriceIqd] = useState('15000');
  const [turnaroundHours, setTurnaroundHours] = useState('4');
  const [isActive, setIsActive] = useState(true);

  const adoptedCentralSet = useMemo(() => {
    return new Set(workspace.tests.map((t) => t.centralTestId).filter(Boolean) as string[]);
  }, [workspace.tests]);

  const centralCategories = useMemo(() => {
    const s = new Set<string>();
    workspace.centralCatalog.forEach((c) => {
      if (c.category) s.add(c.category);
    });
    return ['ALL', ...Array.from(s)];
  }, [workspace.centralCatalog]);

  const filteredMyTests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.tests.filter(
      (t) =>
        !q ||
        t.nameAr.toLowerCase().includes(q) ||
        t.nameEn.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q),
    );
  }, [workspace.tests, query]);

  const filteredCentral = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspace.centralCatalog.filter((c) => {
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.nameAr.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });
  }, [workspace.centralCatalog, query, categoryFilter]);

  const openCreateModal = () => {
    setEditingTest(null);
    setErrorMsg('');
    setCode('');
    setNameAr('');
    setNameEn('');
    setCategory(isAr ? 'تحاليل خاصة' : 'Custom');
    setSampleType('serum');
    setUnit('');
    setReferenceRangeText('');
    setPrepInstructions('');
    setPriceIqd('15000');
    setTurnaroundHours('4');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (t: LabTestCatalogItem) => {
    setEditingTest(t);
    setErrorMsg('');
    setCode(t.code);
    setNameAr(t.nameAr);
    setNameEn(t.nameEn);
    setCategory(t.category);
    setSampleType(t.sampleType);
    setUnit(t.unit);
    setReferenceRangeText(t.referenceRangeText);
    setPrepInstructions(t.prepInstructions);
    setPriceIqd(String(t.priceIqd));
    setTurnaroundHours(String(t.turnaroundHours));
    setIsActive(t.isActive);
    setModalOpen(true);
  };

  const handleSaveTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg('');
    if (nameAr.trim().length < 2) {
      setErrorMsg(isAr ? 'يرجى إدخال اسم التحليل.' : 'Test name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        nameAr: nameAr.trim(),
        nameEn: nameEn.trim() || nameAr.trim(),
        category: category.trim(),
        sampleType,
        unit: unit.trim(),
        referenceRangeText: referenceRangeText.trim(),
        prepInstructions: prepInstructions.trim(),
        priceIqd: Math.max(0, Number(priceIqd) || 0),
        turnaroundHours: Math.max(1, Number(turnaroundHours) || 2),
        isActive,
      };
      if (editingTest) {
        await updateLabTest(firebaseUser, editingTest.testId, payload);
      } else {
        await createLabTest(firebaseUser, payload);
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleAdoptSelected = async (idsToAdopt?: string[]) => {
    const ids = idsToAdopt || selectedCentralIds;
    if (ids.length === 0 || adopting) return;
    setAdopting(true);
    try {
      await adoptCentralLabTests(firebaseUser, ids);
      setSelectedCentralIds([]);
      await onRefresh();
      setTab('my');
    } catch (err) {
      console.error('[MEDORA][AdoptTests]', err);
    } finally {
      setAdopting(false);
    }
  };

  const toggleCentralSelection = (id: string) => {
    setSelectedCentralIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.catalog.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'إدارة أسعار التحاليل ومتطلبات التحضير أو اعتماد التحاليل مباشرة من كتالوج MEDORA المركزي'
              : 'Configure test pricing, sample types, prep notes, or adopt directly from the MEDORA Central Catalog'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{lt.catalog.addCustomTest}</span>
          </button>
        )}
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-1">
          <button
            type="button"
            onClick={() => setTab('my')}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold transition cursor-pointer ${
              tab === 'my'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            {lt.catalog.myTestsTab} ({workspace.tests.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('central')}
            className={`min-h-[38px] rounded-lg px-4 text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5 ${
              tab === 'central'
                ? 'bg-[#0c3585] text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>
              {lt.catalog.centralTab} ({workspace.centralCatalog.length})
            </span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'central' && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] px-3 text-xs text-slate-900 dark:text-white"
            >
              {centralCategories.map((c) => (
                <option key={c} value={c}>
                  {c === 'ALL' ? lt.common.all : c}
                </option>
              ))}
            </select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={lt.common.search}
              className="min-h-[42px] w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] ps-9 pe-3 text-xs text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* My Lab Tests */}
      {tab === 'my' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto">
          {filteredMyTests.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 space-y-2">
              <FlaskConical className="h-8 w-8 mx-auto text-slate-300" />
              <p>{lt.common.noData}</p>
              <button
                type="button"
                onClick={() => setTab('central')}
                className="text-xs font-bold text-[#0c3585] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {lt.catalog.centralTab}
              </button>
            </div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.code}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.nameAr}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.sampleType}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.referenceRange}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.catalog.priceIqd}</th>
                  <th className="px-4 py-3 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-end font-semibold">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMyTests.map((t) => (
                  <tr key={t.testId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                      {t.code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{t.nameAr}</div>
                      {t.prepInstructions && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
                          {t.prepInstructions}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {lt.sampleTypes[t.sampleType] || t.sampleType}
                    </td>
                    <td className="px-4 py-3 font-latin text-[11px] text-slate-600 dark:text-slate-300">
                      {t.referenceRangeText || '—'} {t.unit}
                    </td>
                    <td className="px-4 py-3 font-latin tabular-nums font-bold text-slate-900 dark:text-white">
                      {t.priceIqd.toLocaleString()} {lt.common.iqd}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          t.isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {t.isActive ? lt.common.active : lt.common.inactive}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="h-3 w-3" />
                          <span>{lt.common.edit}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* MEDORA Central Catalog Browser */}
      {tab === 'central' && (
        <div className="space-y-3">
          {canEdit && selectedCentralIds.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0c3585]/30 bg-blue-50/70 dark:bg-blue-950/30 px-4 py-3">
              <span className="text-xs font-bold text-[#0c3585] dark:text-blue-300 font-latin tabular-nums">
                {selectedCentralIds.length} {isAr ? 'تحليل محدد للاعتماد' : 'selected to adopt'}
              </span>
              <button
                type="button"
                disabled={adopting}
                onClick={() => void handleAdoptSelected()}
                className="medora-gold-button min-h-[38px] rounded-xl px-4 text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {adopting ? lt.common.saving : lt.catalog.adoptSelected}
              </button>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredCentral.map((c) => {
              const isAdopted = adoptedCentralSet.has(c.centralTestId);
              const isSelected = selectedCentralIds.includes(c.centralTestId);
              return (
                <div
                  key={c.centralTestId}
                  className={`rounded-xl border p-4 transition ${
                    isSelected
                      ? 'border-[#0c3585] bg-blue-50/40 dark:bg-blue-950/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-latin text-[11px] font-bold text-[#0c3585] dark:text-blue-400">
                        {c.code} · {c.category}
                      </div>
                      <h4 className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">{c.nameAr}</h4>
                      <p className="text-[11px] text-slate-500 font-latin">{c.nameEn}</p>
                    </div>
                    {isAdopted ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                        <Check className="h-3 w-3" />
                        <span>{lt.catalog.adoptedTag}</span>
                      </span>
                    ) : canEdit ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCentralSelection(c.centralTestId)}
                        className="h-5 w-5 rounded border-slate-300 accent-[#0c3585] cursor-pointer"
                      />
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1 text-[11px] text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>{lt.catalog.sampleType}:</span>
                      <strong>{lt.sampleTypes[c.sampleType] || c.sampleType}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{lt.catalog.referenceRange}:</span>
                      <strong className="font-latin">{c.referenceRangeText} {c.unit}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>{isAr ? 'السعر المقترح:' : 'Suggested Price:'}</span>
                      <strong className="font-latin tabular-nums text-slate-900 dark:text-white">
                        {c.suggestedPriceIqd.toLocaleString()} {lt.common.iqd}
                      </strong>
                    </div>
                  </div>

                  {!isAdopted && canEdit && (
                    <button
                      type="button"
                      disabled={adopting}
                      onClick={() => void handleAdoptSelected([c.centralTestId])}
                      className="mt-3 w-full min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-[#0c3585] dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 cursor-pointer"
                    >
                      + {isAr ? 'اعتماد للمختبر' : 'Adopt Test'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom / Edit Test Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingTest ? `${lt.common.edit}: ${editingTest.nameAr}` : lt.catalog.addCustomTest}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveTest} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.nameAr} *
                  </label>
                  <input
                    required
                    value={nameAr}
                    onChange={(e) => setNameAr(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.nameEn}
                  </label>
                  <input
                    value={nameEn}
                    onChange={(e) => setNameEn(e.target.value)}
                    dir="ltr"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.code}
                  </label>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    dir="ltr"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.category}
                  </label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.sampleType}
                  </label>
                  <select
                    value={sampleType}
                    onChange={(e) => setSampleType(e.target.value as LabSampleType)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  >
                    {SAMPLE_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {lt.sampleTypes[st] || st}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.unit}
                  </label>
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    dir="ltr"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.priceIqd} *
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={priceIqd}
                    onChange={(e) => setPriceIqd(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.catalog.turnaroundHours}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    value={turnaroundHours}
                    onChange={(e) => setTurnaroundHours(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.catalog.referenceRange}
                </label>
                <input
                  value={referenceRangeText}
                  onChange={(e) => setReferenceRangeText(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.catalog.prepInstructions}
                </label>
                <textarea
                  rows={2}
                  value={prepInstructions}
                  onChange={(e) => setPrepInstructions(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-white"
                />
              </div>

              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 accent-[#0c3585]"
                />
                <span>{isAr ? 'تحليل مفعل ويظهر للمرضى في الحجز' : 'Active & visible in patient booking'}</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 font-bold cursor-pointer disabled:opacity-60"
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
