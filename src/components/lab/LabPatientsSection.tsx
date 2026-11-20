import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { FileText, Pencil, Plus, Search, UserPlus, X } from 'lucide-react';
import type { GenderType, Language } from '../../types/medora';
import type { LabPatientRecord, LabWorkspaceData } from '../../types/lab';
import { labTranslations } from '../../i18n/labTranslations';
import { createLabPatient, updateLabPatient } from '../../services/labService';

interface LabPatientsSectionProps {
  firebaseUser: User;
  workspace: LabWorkspaceData;
  lang: Language;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

export const LabPatientsSection: React.FC<LabPatientsSectionProps> = ({
  firebaseUser,
  workspace,
  lang,
  canEdit,
  onRefresh,
}) => {
  const lt = labTranslations[lang];
  const isAr = lang === 'ar';

  const [query, setQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<LabPatientRecord | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<GenderType | 'unspecified'>('unspecified');
  const [age, setAge] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicNotes, setChronicNotes] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workspace.patients;
    return workspace.patients.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.fileNumber.toLowerCase().includes(q),
    );
  }, [workspace.patients, query]);

  const patientOrders = useMemo(() => {
    if (!selectedPatient) return [];
    return workspace.orders.filter((o) => o.patientRecordId === selectedPatient.patientRecordId);
  }, [selectedPatient, workspace.orders]);

  const patientResults = useMemo(() => {
    if (!selectedPatient) return [];
    return workspace.results.filter((r) => r.patientRecordId === selectedPatient.patientRecordId);
  }, [selectedPatient, workspace.results]);

  const patientInvoices = useMemo(() => {
    if (!selectedPatient) return [];
    return workspace.invoices.filter((i) => i.patientRecordId === selectedPatient.patientRecordId);
  }, [selectedPatient, workspace.invoices]);

  const openCreateModal = () => {
    setErrorMsg('');
    setFullName('');
    setPhone('');
    setGender('unspecified');
    setAge('');
    setDateOfBirth('');
    setAddress('');
    setAllergies('');
    setChronicNotes('');
    setModalMode('create');
  };

  const openEditModal = (p: LabPatientRecord) => {
    setErrorMsg('');
    setSelectedPatient(p);
    setFullName(p.fullName);
    setPhone(p.phone);
    setGender(p.gender || 'unspecified');
    setAge(p.age !== undefined ? String(p.age) : '');
    setDateOfBirth(p.dateOfBirth || '');
    setAddress(p.address || '');
    setAllergies(p.allergies || '');
    setChronicNotes(p.chronicNotes || '');
    setModalMode('edit');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErrorMsg('');
    if (fullName.trim().length < 2 || phone.trim().length < 5) {
      setErrorMsg(isAr ? 'يرجى إدخال الاسم ورقم الهاتف الصحيح.' : 'Valid name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      const parsedAge = age.trim() ? Number(age) : undefined;
      if (modalMode === 'create') {
        const created = await createLabPatient(firebaseUser, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          gender,
          ...(parsedAge !== undefined && Number.isFinite(parsedAge) ? { age: parsedAge } : {}),
          dateOfBirth: dateOfBirth.trim(),
          address: address.trim(),
          allergies: allergies.trim(),
          chronicNotes: chronicNotes.trim(),
        });
        setSelectedPatient(created);
      } else if (modalMode === 'edit' && selectedPatient) {
        const updated = await updateLabPatient(firebaseUser, selectedPatient.patientRecordId, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          gender,
          ...(parsedAge !== undefined && Number.isFinite(parsedAge) ? { age: parsedAge } : {}),
          dateOfBirth: dateOfBirth.trim(),
          address: address.trim(),
          allergies: allergies.trim(),
          chronicNotes: chronicNotes.trim(),
        });
        setSelectedPatient(updated);
      }
      setModalMode(null);
      await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'SAVE_FAILED');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">{lt.patients.title}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-latin tabular-nums">
            {workspace.patients.length} {isAr ? 'ملف مريض مسجل' : 'registered patient files'}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="medora-gold-button min-h-[42px] rounded-xl px-4 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            <span>{lt.patients.addPatient}</span>
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isAr ? 'ابحث بالاسم أو الهاتف أو رقم الملف LAB-P-...' : 'Search by name, phone, or LAB-P-...'}
          className="min-h-[44px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#07122a] ps-10 pe-4 text-sm text-slate-900 dark:text-white focus:border-[#0c3585] focus:outline-none"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className={`${selectedPatient ? 'lg:col-span-7' : 'lg:col-span-12'} rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] overflow-x-auto`}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">{lt.common.noData}</div>
          ) : (
            <table className="w-full text-start text-xs">
              <thead className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start font-semibold">{lt.patients.fileNumber}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.patients.fullName}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.patients.phone}</th>
                  <th className="px-4 py-3 text-start font-semibold">{lt.patients.totalOrders}</th>
                  <th className="px-4 py-3 text-end font-semibold">{lt.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => {
                  const isSelected = selectedPatient?.patientRecordId === p.patientRecordId;
                  return (
                    <tr
                      key={p.patientRecordId}
                      onClick={() => setSelectedPatient(p)}
                      className={`cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="px-4 py-3 font-latin tabular-nums font-bold text-[#0c3585] dark:text-blue-400">
                        {p.fileNumber}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {p.fullName}
                        {p.age ? (
                          <span className="ms-1.5 text-[11px] font-normal text-slate-500 font-latin tabular-nums">
                            ({p.age})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 font-latin tabular-nums text-slate-600 dark:text-slate-300" dir="ltr">
                        {p.phone}
                      </td>
                      <td className="px-4 py-3 font-latin tabular-nums font-bold text-slate-800 dark:text-slate-200">
                        {p.totalOrders || 0}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {canEdit && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(p);
                            }}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Pencil className="h-3 w-3" />
                            <span>{lt.common.edit}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selectedPatient && (
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-4 space-y-4">
            <div className="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="font-latin tabular-nums text-xs font-bold text-[#0c3585] dark:text-blue-400">
                  {selectedPatient.fileNumber}
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedPatient.fullName}
                </h3>
                <p className="text-xs text-slate-500 font-latin tabular-nums mt-0.5" dir="ltr">
                  {selectedPatient.phone}
                  {selectedPatient.address ? ` · ${selectedPatient.address}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                aria-label={lt.common.close}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(selectedPatient.allergies || selectedPatient.chronicNotes) && (
              <div className="space-y-1.5 text-xs bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3">
                {selectedPatient.allergies && (
                  <p className="text-rose-700 dark:text-rose-300">
                    <strong>{lt.patients.allergies}:</strong> {selectedPatient.allergies}
                  </p>
                )}
                {selectedPatient.chronicNotes && (
                  <p className="text-slate-700 dark:text-slate-300">
                    <strong>{lt.patients.chronicNotes}:</strong> {selectedPatient.chronicNotes}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                <FileText className="h-4 w-4 text-[#0c3585] dark:text-blue-400" />
                <span>{lt.patients.historyTitle}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                  <div className="text-[11px] text-slate-500">{isAr ? 'الطلبات' : 'Orders'}</div>
                  <div className="font-latin tabular-nums text-base font-bold text-slate-900 dark:text-white">
                    {patientOrders.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                  <div className="text-[11px] text-slate-500">{isAr ? 'النتائج' : 'Results'}</div>
                  <div className="font-latin tabular-nums text-base font-bold text-slate-900 dark:text-white">
                    {patientResults.length}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                  <div className="text-[11px] text-slate-500">{isAr ? 'الفواتير' : 'Invoices'}</div>
                  <div className="font-latin tabular-nums text-base font-bold text-slate-900 dark:text-white">
                    {patientInvoices.length}
                  </div>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {patientOrders.map((ord) => (
                  <div
                    key={ord.orderId}
                    className="rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-latin tabular-nums font-bold text-slate-900 dark:text-white">
                        {ord.orderNumber}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {ord.tests.map((t) => t.nameAr).join('، ')}
                      </div>
                    </div>
                    <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold shrink-0">
                      {lt.status[ord.status] || ord.status}
                    </span>
                  </div>
                ))}
                {patientOrders.length === 0 && (
                  <p className="text-center text-xs text-slate-500 py-3">{lt.common.noData}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#07122a] p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {modalMode === 'create' ? lt.patients.addPatient : lt.patients.editPatient}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
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
                    {lt.patients.fullName} *
                  </label>
                  <input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.patients.phone} *
                  </label>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    dir="ltr"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.patients.gender}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as GenderType | 'unspecified')}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  >
                    <option value="unspecified">{isAr ? 'غير محدد' : 'Unspecified'}</option>
                    <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                    <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.patients.age}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={130}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.patients.dateOfBirth}
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white font-latin"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {lt.patients.address}
                  </label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.patients.allergies}
                </label>
                <input
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                  className="min-h-[42px] w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {lt.patients.chronicNotes}
                </label>
                <textarea
                  rows={2}
                  value={chronicNotes}
                  onChange={(e) => setChronicNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 px-4 font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  {lt.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Plus className="h-4 w-4" />
                  <span>{saving ? lt.common.saving : lt.common.save}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
