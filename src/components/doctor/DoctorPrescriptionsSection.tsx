import { useState, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import { Building2, FileDown, Loader2, Lock, Pill, Plus, Printer, Search, ShieldCheck, Store, Trash2, X } from 'lucide-react';
import { MEDORA_LOGO_URL } from '../../constants/brand';
import { DOCTOR_TRANSLATIONS } from '../../i18n/doctorTranslations';
import { createDoctorPrescription, searchDoctorMedicines } from '../../services/doctorService';
import {
  fetchPublicPharmacyStorefrontDetail,
  fetchPublicPharmacyStorefronts,
} from '../../services/medicineFinderService';
import type {
  DoctorMedicineSearchItem,
  DoctorWorkspaceData,
  MedicationItem,
  PrescriptionRecord,
} from '../../types/doctor';
import type { Language } from '../../types/medora';
import type { PublicPharmacyCard, PublicPharmacyStorefrontData } from '../../types/pharmacy';
import { PharmacyLogoAvatar } from '../pharmacy/PharmacyBrandUtils';
import { PharmacyPublicStorefront } from '../pharmacy/PharmacyPublicStorefront';
import { PrescriptionPrintSheet } from '../shared/MedoraPrintableDocument';
import {
  downloadMedoraPdf,
  printMedoraDocument,
  sanitizePdfFilename,
} from '../../utils/printAndPdf';

interface DoctorPrescriptionsSectionProps {
  firebaseUser: User;
  workspace: DoctorWorkspaceData;
  language: Language;
  onRefreshWorkspace: () => Promise<void>;
}

const EMPTY_MED: MedicationItem = {
  name: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
};

export function DoctorPrescriptionsSection({
  firebaseUser,
  workspace,
  language,
  onRefreshWorkspace,
}: DoctorPrescriptionsSectionProps) {
  const dc = DOCTOR_TRANSLATIONS[language];
  const rc = dc.prescriptions;

  const isDoctor = workspace.actorRole === 'doctor';
  const [patientRecordId, setPatientRecordId] = useState(
    () => workspace.patients[0]?.patientRecordId || '',
  );
  const [prescribedDate, setPrescribedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [medications, setMedications] = useState<MedicationItem[]>([
    { ...EMPTY_MED },
  ]);
  const [doctorNotes, setDoctorNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewRx, setPreviewRx] = useState<PrescriptionRecord | null>(
    () => workspace.prescriptions[0] || null,
  );
  const [medSearchQuery, setMedSearchQuery] = useState('');
  const [medSearchLoading, setMedSearchLoading] = useState(false);
  const [medSearchResults, setMedSearchResults] = useState<DoctorMedicineSearchItem[]>([]);
  const [medSearchExecuted, setMedSearchExecuted] = useState(false);
  const [pharmacyDirOpen, setPharmacyDirOpen] = useState(false);
  const [pharmacyCards, setPharmacyCards] = useState<PublicPharmacyCard[]>([]);
  const [loadingPharmacyDir, setLoadingPharmacyDir] = useState(false);
  const [selectedDoctorStorefront, setSelectedDoctorStorefront] =
    useState<PublicPharmacyStorefrontData | null>(null);
  const [loadingDoctorStorefront, setLoadingDoctorStorefront] = useState(false);
  const isAr = language === 'ar';

  if (!isDoctor) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-[#07122a] dark:text-slate-300">
        <Lock className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <span>{dc.patients.restrictedRecordsNotice}</span>
      </div>
    );
  }

  const updateMedField = (
    idx: number,
    key: keyof MedicationItem,
    val: string,
  ) => {
    setMedications((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [key]: val } : m)),
    );
  };

  const handleSaveRx = async (e: FormEvent) => {
    e.preventDefault();
    if (!patientRecordId) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const created = await createDoctorPrescription(firebaseUser, {
        patientRecordId,
        prescribedDate,
        medications: medications.filter((m) => m.name.trim()),
        doctorNotes: doctorNotes.trim(),
      });
      await onRefreshWorkspace();
      setPreviewRx(created);
      setMedications([{ ...EMPTY_MED }]);
      setDoctorNotes('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const handleSearchDoctorCatalog = async () => {
    const q = medSearchQuery.trim();
    if (q.length < 2) return;
    setMedSearchLoading(true);
    setErrorMsg(null);
    try {
      const results = await searchDoctorMedicines(firebaseUser, { q });
      setMedSearchResults(results);
      setMedSearchExecuted(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'DOCTOR_MEDICINE_SEARCH_FAILED');
    } finally {
      setMedSearchLoading(false);
    }
  };

  const handleAddSearchedMedToRx = (item: DoctorMedicineSearchItem) => {
    const displayName = item.brandNames?.[0]
      ? `${item.brandNames[0]} (${item.scientificName})`
      : item.scientificName;
    const newRow: MedicationItem = {
      medicineId: item.medicineId,
      name: displayName,
      dosage: item.strength || '',
      frequency: '',
      duration: '',
      instructions: item.dispensingRestrictions || '',
    };
    setMedications((prev) => {
      if (
        prev.length === 1 &&
        !prev[0].name.trim() &&
        !prev[0].dosage.trim() &&
        !prev[0].frequency.trim()
      ) {
        return [newRow];
      }
      return [...prev, newRow];
    });
  };

  const handlePrintRx = (rx: PrescriptionRecord) => {
    void printMedoraDocument(
      <PrescriptionPrintSheet rx={rx} lang={language} />,
      sanitizePdfFilename(`rx-${rx.patientName}-${rx.prescribedDate}`),
    );
  };

  const handleDownloadRxPdf = async (rx: PrescriptionRecord) => {
    setExportingPdfId(rx.prescriptionId);
    try {
      await downloadMedoraPdf({
        filename: sanitizePdfFilename(`rx-${rx.patientName}-${rx.prescribedDate}.pdf`),
        element: <PrescriptionPrintSheet rx={rx} lang={language} />,
        dir: language === 'ar' ? 'rtl' : 'ltr',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF Export Failed');
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleOpenPharmacyDirectory = async () => {
    setPharmacyDirOpen(true);
    setSelectedDoctorStorefront(null);
    setLoadingPharmacyDir(true);
    try {
      const list = await fetchPublicPharmacyStorefronts(firebaseUser);
      setPharmacyCards(list);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PHARMACY_DIRECTORY_FAILED');
    } finally {
      setLoadingPharmacyDir(false);
    }
  };

  const handleOpenDoctorStorefront = async (identifier: string) => {
    setLoadingDoctorStorefront(true);
    try {
      const detail = await fetchPublicPharmacyStorefrontDetail(firebaseUser, identifier);
      setSelectedDoctorStorefront(detail);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PHARMACY_STOREFRONT_FAILED');
    } finally {
      setLoadingDoctorStorefront(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="medora-no-print flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a]">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {rc.title}
        </h2>
        {previewRx && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handlePrintRx(previewRx)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#0c3585] bg-white px-4 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585] hover:text-white dark:border-[#d9a43b] dark:bg-slate-900 dark:text-[#f4d378] cursor-pointer"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span>{rc.printBtn}</span>
            </button>
            <button
              type="button"
              disabled={exportingPdfId === previewRx.prescriptionId}
              onClick={() => void handleDownloadRxPdf(previewRx)}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              <span>
                {exportingPdfId === previewRx.prescriptionId ? rc.exportingPdf : rc.downloadPdfBtn}
              </span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="medora-no-print rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          {errorMsg}
        </div>
      )}

      <div className="medora-no-print grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Create Prescription Form */}
        <form
          onSubmit={handleSaveRx}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-7"
        >
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {rc.newRxBtn}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {rc.selectPatient} *
              </label>
              <select
                required
                value={patientRecordId}
                onChange={(e) => setPatientRecordId(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="">—</option>
                {workspace.patients.map((pt) => (
                  <option key={pt.patientRecordId} value={pt.patientRecordId}>
                    {pt.fullName} ({pt.fileNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                {rc.rxDate} *
              </label>
              <input
                type="date"
                required
                value={prescribedDate}
                onChange={(e) => setPrescribedDate(e.target.value)}
                className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-[#0c3585] dark:text-[#f4d378]">
                <Pill className="h-3.5 w-3.5" />
                <span>
                  {isAr
                    ? 'البحث في كتالوج الأدوية الموحد وتوفر الصيدليات المعتمدة'
                    : 'Search Central Drug Catalog & Approved Pharmacy Stock'}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isAr ? 'أسعار التجزئة والتوفر الفعلي فقط' : 'Retail price & live stock only'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleOpenPharmacyDirectory()}
                  className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 cursor-pointer"
                >
                  <Store className="h-3.5 w-3.5" />
                  <span>{isAr ? 'تصفح الصيدليات المعتمدة' : 'Browse Approved Pharmacies'}</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={medSearchQuery}
                onChange={(e) => setMedSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSearchDoctorCatalog();
                  }
                }}
                placeholder={
                  isAr
                    ? 'ابحث بالاسم العلمي أو التجاري أو المادة الفعالة...'
                    : 'Search scientific name, brand, or active ingredient...'
                }
                className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
              <button
                type="button"
                disabled={medSearchLoading || medSearchQuery.trim().length < 2}
                onClick={() => void handleSearchDoctorCatalog()}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <span>{medSearchLoading ? '...' : isAr ? 'بحث' : 'Search'}</span>
              </button>
            </div>

            {medSearchExecuted && (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {medSearchResults.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr ? 'لم يتم العثور على أدوية مطابقة في الكتالوج.' : 'No matching medicines found.'}
                  </p>
                ) : (
                  medSearchResults.map((item) => (
                    <div
                      key={item.medicineId}
                      className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 dark:border-slate-800 dark:bg-[#07122a]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.brandNames?.length > 0
                              ? `${item.brandNames.join(', ')} (${item.scientificName})`
                              : item.scientificName}{' '}
                            · {item.strength}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {item.activeIngredient} · {item.dosageForm} · {item.packSize}
                            {item.manufacturer || item.country
                              ? ` · ${[item.manufacturer, item.country].filter(Boolean).join(' / ')}`
                              : ''}
                          </p>
                          {(item.requiresPrescription || item.controlledDrug || item.dispensingRestrictions) && (
                            <p className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                              {item.controlledDrug
                                ? isAr
                                  ? 'دواء مراقب'
                                  : 'Controlled Drug'
                                : item.requiresPrescription
                                  ? isAr
                                    ? 'يصرف بوصفة طبية'
                                    : 'Prescription Only'
                                  : ''}
                              {item.dispensingRestrictions ? ` · ${item.dispensingRestrictions}` : ''}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddSearchedMedToRx(item)}
                          className="medora-gold-button inline-flex min-h-[32px] items-center gap-1 rounded-lg px-3 text-[11px] font-bold text-[#040917] cursor-pointer"
                        >
                          <Plus className="h-3 w-3" />
                          <span>{isAr ? 'إضافة للوصفة' : 'Add to Rx'}</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300 border-t border-slate-100 pt-2 dark:border-slate-800">
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Building2 className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#f4d378]" />
                          {item.availablePharmaciesCount > 0
                            ? isAr
                              ? `متوفر في ${item.availablePharmaciesCount} صيدلية (${item.totalAvailableQty} وحدة)`
                              : `Available in ${item.availablePharmaciesCount} pharmacies (${item.totalAvailableQty} units)`
                            : isAr
                              ? 'غير متوفر حالياً في الصيدليات المعتمدة'
                              : 'Currently out of stock in approved pharmacies'}
                        </span>
                        {item.minRetailPriceIqd != null && (
                          <span className="font-bold text-[#0c3585] dark:text-[#f4d378] tabular-nums">
                            {isAr ? 'سعر البيع للمريض:' : 'Patient Retail:'}{' '}
                            {Math.round(item.minRetailPriceIqd).toLocaleString()}
                            {item.maxRetailPriceIqd != null && item.maxRetailPriceIqd !== item.minRetailPriceIqd
                              ? ` – ${Math.round(item.maxRetailPriceIqd).toLocaleString()}`
                              : ''}{' '}
                            {isAr ? 'د.ع' : 'IQD'}
                          </span>
                        )}
                      </div>

                      {item.pharmacies.length > 0 && (
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {item.pharmacies.slice(0, 4).map((ph) => (
                            <span key={ph.pharmacyUid} className="tabular-nums">
                              {isAr ? ph.pharmacyNameAr : ph.pharmacyNameEn || ph.pharmacyNameAr} ({ph.governorate}):{' '}
                              {ph.availableQty} · {Math.round(ph.discountPriceIqd ?? ph.sellingPriceIqd).toLocaleString()}{' '}
                              {isAr ? 'د.ع' : 'IQD'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {rc.medicationsTitle}
              </p>
              <button
                type="button"
                onClick={() =>
                  setMedications((prev) => [...prev, { ...EMPTY_MED }])
                }
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{rc.addMedRow}</span>
              </button>
            </div>

            {medications.map((med, idx) => (
              <div
                key={idx}
                className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50"
              >
                {med.medicineId && (
                  <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                    {isAr ? 'مرتبط بكتالوج MEDORA الموحد' : 'Linked to MEDORA Central Drug Catalog'}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    required
                    placeholder={rc.drugName}
                    value={med.name}
                    onChange={(e) => updateMedField(idx, 'name', e.target.value)}
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder={rc.dosage}
                    value={med.dosage}
                    onChange={(e) => updateMedField(idx, 'dosage', e.target.value)}
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder={rc.frequency}
                    value={med.frequency}
                    onChange={(e) => updateMedField(idx, 'frequency', e.target.value)}
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder={rc.duration}
                    value={med.duration}
                    onChange={(e) => updateMedField(idx, 'duration', e.target.value)}
                    className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder={rc.instructions}
                    value={med.instructions}
                    onChange={(e) =>
                      updateMedField(idx, 'instructions', e.target.value)
                    }
                    className="min-h-[38px] flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  {medications.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setMedications((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="p-2 text-rose-500 hover:text-rose-700 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {rc.doctorNotes}
            </label>
            <textarea
              rows={2}
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={saving || !patientRecordId}
            className="medora-gold-button min-h-[42px] rounded-xl px-6 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
          >
            {saving ? '...' : rc.saveRxBtn}
          </button>
        </form>

        {/* Previous Prescriptions List */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#07122a] lg:col-span-5">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            {rc.previousRxTitle}
          </h3>
          {workspace.prescriptions.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              {rc.noRx}
            </p>
          ) : (
            <div className="mt-4 max-h-[460px] space-y-2.5 overflow-y-auto">
              {workspace.prescriptions.map((rx) => (
                <button
                  key={rx.prescriptionId}
                  type="button"
                  onClick={() => setPreviewRx(rx)}
                  className={`w-full rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                    previewRx?.prescriptionId === rx.prescriptionId
                      ? 'border-[#d9a43b] bg-amber-50/40 dark:bg-[#0b1b3d]'
                      : 'border-slate-100 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {rx.patientName}
                    </span>
                    <span className="font-latin text-xs font-semibold text-[#0c3585] tabular-nums dark:text-[#f4d378]">
                      {rx.prescribedDate}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                    {rx.medications.map((m) => m.name).join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Luxury Official Printable MEDORA Prescription Sheet (Strictly NO QR or verification number) */}
      {previewRx && (
        <section className="medora-print-sheet rounded-2xl border-2 border-[#0c3585]/30 bg-white p-8 text-slate-900 shadow-sm dark:border-[#d9a43b]/40">
          <div className="medora-no-print mb-4 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handlePrintRx(previewRx)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0c3585] px-4 text-xs font-bold text-white cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              {rc.printBtn}
            </button>
            <button
              type="button"
              disabled={exportingPdfId === previewRx.prescriptionId}
              onClick={() => void handleDownloadRxPdf(previewRx)}
              className="medora-gold-button inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-4 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              <FileDown className="h-3.5 w-3.5" />
              {exportingPdfId === previewRx.prescriptionId ? rc.exportingPdf : rc.downloadPdfBtn}
            </button>
            <button
              type="button"
              onClick={() => setPreviewRx(null)}
              className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <header className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#0c3585] pb-5">
            <div>
              <p className="text-xs font-bold tracking-wider text-[#0c3585]">
                {rc.rxSheetHeader}
              </p>
              <h3 className="mt-1 text-xl font-bold text-[#061028]">
                {dc.overview.welcomePrefix} {previewRx.doctorName}
              </h3>
              <p className="text-sm font-semibold text-slate-700">
                {previewRx.doctorSpecialty} — {previewRx.clinicName}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">
                {previewRx.clinicAddress} ·{' '}
                <span className="font-latin" dir="ltr">
                  {previewRx.clinicPhone}
                </span>
              </p>
            </div>
            <img
              src={MEDORA_LOGO_URL}
              alt="MEDORA"
              className="h-14 w-auto object-contain"
            />
          </header>

          <div className="mt-5 grid grid-cols-2 gap-4 border-b border-slate-200 pb-4 text-sm">
            <div>
              <span className="font-semibold text-slate-500">
                {rc.patientLabel}:{' '}
              </span>
              <span className="font-bold text-slate-900">
                {previewRx.patientName}
              </span>
            </div>
            <div className="text-end font-latin tabular-nums">
              <span className="font-semibold text-slate-500">
                {rc.rxDate}:{' '}
              </span>
              <span className="font-bold text-slate-900">
                {previewRx.prescribedDate}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <p className="font-latin text-2xl font-serif font-bold text-[#0c3585]">
              Rx /
            </p>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-start text-xs font-bold text-slate-600">
                  <th className="py-2">{rc.drugName}</th>
                  <th className="py-2">{rc.dosage}</th>
                  <th className="py-2">{rc.frequency}</th>
                  <th className="py-2">{rc.duration}</th>
                  <th className="py-2">{rc.instructions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {previewRx.medications.map((m, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 font-bold text-slate-900">{m.name}</td>
                    <td className="py-2.5">{m.dosage || '—'}</td>
                    <td className="py-2.5">{m.frequency || '—'}</td>
                    <td className="py-2.5">{m.duration || '—'}</td>
                    <td className="py-2.5">{m.instructions || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewRx.doctorNotes && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="text-xs font-bold text-slate-600">{rc.doctorNotes}:</p>
              <p className="mt-1 text-slate-800">{previewRx.doctorNotes}</p>
            </div>
          )}

          <footer className="mt-12 flex items-end justify-between border-t border-slate-200 pt-6 text-xs text-slate-600">
            <span>MEDORA Medical Platform</span>
            <div className="text-center">
              <div className="h-8 w-44 border-b border-slate-400" />
              <p className="mt-1 font-semibold">{rc.signatureLine}</p>
            </div>
          </footer>
        </section>
      )}

      {/* Read-Only Approved Pharmacies Storefront Directory Modal for Doctors */}
      {pharmacyDirOpen && (
        <div
          className="medora-no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          onClick={() => setPharmacyDirOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-emerald-100 bg-[#F7FBF9] p-5 space-y-4 shadow-2xl dark:border-emerald-900/50 dark:bg-[#04110D]"
          >
            <div className="flex items-center justify-between border-b border-emerald-100 pb-3 dark:border-emerald-950">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {isAr ? 'دليل الصيدليات المعتمدة في MEDORA' : 'Approved MEDORA Pharmacies'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {isAr
                      ? 'للاطلاع الطبي على الأدوية المتوفرة وأسعار البيع للمريض بدون بيانات الجملة.'
                      : 'Clinical read-only view of retail pharmacy availability and patient pricing.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPharmacyDirOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loadingDoctorStorefront ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{isAr ? 'جاري تحميل واجهة الصيدلية...' : 'Loading storefront...'}</span>
              </div>
            ) : selectedDoctorStorefront ? (
              <PharmacyPublicStorefront
                storefront={selectedDoctorStorefront}
                language={language}
                mode="public_browse"
                viewerRole="doctor"
                firebaseUser={firebaseUser}
                onBack={() => setSelectedDoctorStorefront(null)}
              />
            ) : loadingPharmacyDir ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>{isAr ? 'جاري تحميل الصيدليات...' : 'Loading approved pharmacies...'}</span>
              </div>
            ) : pharmacyCards.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">
                {isAr ? 'لا توجد صيدليات معتمدة متاحة حالياً.' : 'No approved pharmacies available.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pharmacyCards.map((card) => {
                  const cardName = isAr
                    ? card.pharmacyNameAr
                    : card.pharmacyNameEn || card.pharmacyNameAr;
                  return (
                    <div
                      key={card.uid}
                      className="flex flex-col justify-between rounded-2xl border border-emerald-100 bg-white p-4 space-y-3 dark:border-emerald-900/50 dark:bg-[#081C16]"
                    >
                      <div className="flex items-start gap-3">
                        <PharmacyLogoAvatar logoUrl={card.logoUrl} name={cardName} sizeClass="h-10 w-10" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                              {cardName}
                            </p>
                            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {card.governorate} · {card.district}
                          </p>
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                            {card.publishedInStockCount} {isAr ? 'صنف منشور' : 'published SKUs'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOpenDoctorStorefront(card.publicSlug || card.uid)}
                        className="min-h-[36px] w-full rounded-xl bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800 cursor-pointer"
                      >
                        {isAr ? 'معاينة توفر الأدوية' : 'View Available Medicines'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
