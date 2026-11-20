import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import { Pencil, Plus, Tag, X } from 'lucide-react';
import type { Language } from '../../types/medora';
import type { LabOfferPackage, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { createLabOffer, updateLabOffer } from '../../services/labService';

interface LabOffersSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

export const LabOffersSection: React.FC<LabOffersSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEdit,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LabOfferPackage | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [offerType, setOfferType] = useState<'single_discount' | 'package'>('package');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [originalPriceIqd, setOriginalPriceIqd] = useState('0');
  const [offerPriceIqd, setOfferPriceIqd] = useState('0');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [isActive, setIsActive] = useState(true);

  const openCreate = () => {
    setEditing(null);
    setErrorMsg('');
    setOfferType('package');
    setTitle('');
    setDescription('');
    setSelectedTestIds([]);
    setOriginalPriceIqd('0');
    setOfferPriceIqd('0');
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (o: LabOfferPackage) => {
    setEditing(o);
    setErrorMsg('');
    setOfferType(o.offerType);
    setTitle(o.title);
    setDescription(o.description);
    setSelectedTestIds(o.testIds || []);
    setOriginalPriceIqd(String(o.originalPriceIqd));
    setOfferPriceIqd(String(o.offerPriceIqd));
    setStartDate(o.startDate);
    setEndDate(o.endDate);
    setIsActive(o.isActive);
    setModalOpen(true);
  };

  const toggleTest = (testId: string) => {
    setSelectedTestIds((prev) => {
      const next = prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId];
      const sum = next.reduce((acc, id) => {
        const t = workspace.tests.find((x) => x.testId === id);
        return acc + (t ? t.priceIqd : 0);
      }, 0);
      if (sum > 0) setOriginalPriceIqd(String(sum));
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg('');
    const offerP = Number(offerPriceIqd) || 0;
    const origP = Math.max(offerP, Number(originalPriceIqd) || offerP);
    if (title.trim().length < 2 || offerP <= 0 || !endDate || endDate < startDate) {
      setErrorMsg(isAr ? 'يرجى التحقق من العنوان والأسعار وتواريخ الصلاحية.' : 'Check title, prices, and valid dates.');
      return;
    }

    const testNames = selectedTestIds
      .map((id) => workspace.tests.find((t) => t.testId === id)?.nameAr || '')
      .filter(Boolean);

    setSaving(true);
    try {
      if (editing) {
        await updateLabOffer(firebaseUser, editing.offerId, {
          offerType,
          title: title.trim(),
          description: description.trim(),
          testIds: selectedTestIds,
          testNames,
          originalPriceIqd: origP,
          offerPriceIqd: offerP,
          startDate,
          endDate,
          isActive,
        });
      } else {
        await createLabOffer(firebaseUser, {
          offerType,
          title: title.trim(),
          description: description.trim(),
          testIds: selectedTestIds,
          testNames,
          originalPriceIqd: origP,
          offerPriceIqd: offerP,
          startDate,
          endDate,
          isActive,
        });
      }
      setModalOpen(false);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OFFER_SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (o: LabOfferPackage) => {
    try {
      await updateLabOffer(firebaseUser, o.offerId, { isActive: !o.isActive });
      await onRefresh();
    } catch (err) {
      console.error('[MEDORA][ToggleOffer]', err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.offers.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'العروض النشطة تظهر مباشرة للمرضى في دليل المختبرات ويمكن تطبيقها على الطلبات'
              : 'Active offers and bundles are visible to patients and applicable inside lab orders'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>{lt.offers.newOffer}</span>
          </button>
        )}
      </div>

      {workspace.offers.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-10 text-center text-sm text-slate-500">
          {lt.common.noData}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {workspace.offers.map((o) => {
            const savings = Math.max(0, o.originalPriceIqd - o.offerPriceIqd);
            return (
              <div
                key={o.offerId}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#0c3585] dark:text-blue-400">
                      <Tag className="h-3.5 w-3.5" />
                      <span>{o.offerType === 'single_discount' ? lt.offers.singleDiscount : lt.offers.packageType}</span>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        o.isActive
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                      }`}
                    >
                      {o.isActive ? lt.common.active : lt.common.inactive}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-base font-bold text-slate-900 dark:text-white">{o.title}</h3>
                  {o.description && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{o.description}</p>
                  )}
                  {o.testNames.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {o.testNames.join(' · ')}
                    </p>
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div>
                      <span className="font-latin tabular-nums text-lg font-bold text-emerald-600 dark:text-emerald-400">
                        {o.offerPriceIqd.toLocaleString()} {lt.common.iqd}
                      </span>
                      {o.originalPriceIqd > o.offerPriceIqd && (
                        <span className="ms-2 font-latin tabular-nums text-xs text-slate-400 line-through">
                          {o.originalPriceIqd.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {savings > 0 && (
                      <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 font-latin tabular-nums">
                        {lt.offers.savings}: {savings.toLocaleString()} {lt.common.iqd}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 font-latin tabular-nums">
                    {o.startDate} → {o.endDate}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openEdit(o)}
                        className="flex-1 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" />
                        <span>{lt.common.edit}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleActive(o)}
                        className="flex-1 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        {o.isActive ? (isAr ? 'تعطيل' : 'Disable') : isAr ? 'تفعيل' : 'Enable'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editing ? lt.common.edit : lt.offers.newOffer}
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

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.offers.offerType}
                  </label>
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as 'single_discount' | 'package')}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  >
                    <option value="package">{lt.offers.packageType}</option>
                    <option value="single_discount">{lt.offers.singleDiscount}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.common.name} *
                  </label>
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'وصف العرض' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.ordersSamples.selectTests}
                </label>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 p-2 grid sm:grid-cols-2 gap-1.5">
                  {workspace.tests.map((t) => (
                    <label
                      key={t.testId}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTestIds.includes(t.testId)}
                        onChange={() => toggleTest(t.testId)}
                        className="h-4 w-4 accent-[#0c3585]"
                      />
                      <span className="truncate">{t.nameAr}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.offers.originalPrice}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={originalPriceIqd}
                    onChange={(e) => setOriginalPriceIqd(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.offers.offerPrice} *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={offerPriceIqd}
                    onChange={(e) => setOfferPriceIqd(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.offers.startDate}
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.offers.endDate}
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
              </div>

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
