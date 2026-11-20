import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import {
  IRAQ_GOVERNORATES,
  LAB_SERVICE_OPTIONS,
} from '../../constants/iraqLocations';
import { useMedora } from '../../contexts/MedoraContext';
import type {
  BookingConfirmationMode,
  LabPortalInput,
  UploadedDocMeta,
} from '../../types/medora';
import { DocumentUploadField } from './DocumentUploadField';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface LabFormProps {
  initialData?: LabPortalInput;
  onDraftSave?: (data: LabPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: LabPortalInput) => void;
}

export function LabForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: LabFormProps) {
  const { language, t, userAccount } = useMedora();

  const [professionalPhone, setProfessionalPhone] = useState(
    initialData?.professionalPhone || userAccount?.phone || '',
  );
  const [labNameAr, setLabNameAr] = useState(initialData?.labNameAr || '');
  const [labNameEn, setLabNameEn] = useState(initialData?.labNameEn || '');
  const [directorName, setDirectorName] = useState(
    initialData?.directorName || userAccount?.fullName || '',
  );
  const [governorate, setGovernorate] = useState(
    initialData?.governorate || userAccount?.governorate || '',
  );
  const [district, setDistrict] = useState(
    initialData?.district || userAccount?.district || '',
  );
  const [address, setAddress] = useState(initialData?.address || '');
  const [mapLocationUrl, setMapLocationUrl] = useState(
    initialData?.mapLocationUrl || '',
  );
  const [latitude, setLatitude] = useState<number | undefined>(
    initialData?.latitude,
  );
  const [longitude, setLongitude] = useState<number | undefined>(
    initialData?.longitude,
  );
  const [licenseNumber, setLicenseNumber] = useState(
    initialData?.licenseNumber || '',
  );
  const [licensingAuthority, setLicensingAuthority] = useState(
    initialData?.licensingAuthority || '',
  );
  const [licenseDocuments, setLicenseDocuments] = useState<UploadedDocMeta[]>(
    initialData?.licenseDocuments || [],
  );
  const [technicalDirectorName, setTechnicalDirectorName] = useState(
    initialData?.technicalDirectorName || '',
  );
  const [labServices, setLabServices] = useState<string[]>(
    initialData?.labServices || ['hematology'],
  );
  const [workDaysAndHours, setWorkDaysAndHours] = useState(
    initialData?.workDaysAndHours || '',
  );
  const [hourlyBookingLimit, setHourlyBookingLimit] = useState(
    initialData?.hourlyBookingLimit ?? 8,
  );
  const [bookingConfirmationMode, setBookingConfirmationMode] =
    useState<BookingConfirmationMode>(
      initialData?.bookingConfirmationMode || 'manual',
    );
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): LabPortalInput => ({
    professionalPhone: professionalPhone.trim(),
    labNameAr: labNameAr.trim(),
    labNameEn: labNameEn.trim(),
    directorName: directorName.trim(),
    governorate: governorate.trim(),
    district: district.trim(),
    address: address.trim(),
    mapLocationUrl: mapLocationUrl.trim(),
    latitude,
    longitude,
    licenseNumber: licenseNumber.trim(),
    licensingAuthority: licensingAuthority.trim(),
    licenseDocuments,
    technicalDirectorName: technicalDirectorName.trim(),
    labServices,
    workDaysAndHours: workDaysAndHours.trim(),
    hourlyBookingLimit: Math.max(1, Number(hourlyBookingLimit) || 8),
    bookingConfirmationMode,
  });

  const snapshotRef = useRef<LabPortalInput>(buildPayload());
  snapshotRef.current = buildPayload();
  const onDraftSaveRef = useRef(onDraftSave);
  onDraftSaveRef.current = onDraftSave;

  useEffect(() => {
    return () => {
      onDraftSaveRef.current?.(snapshotRef.current);
    };
  }, []);

  const selectedGovObj = useMemo(
    () =>
      IRAQ_GOVERNORATES.find(
        (g) => g.ar === governorate || g.en === governorate || g.id === governorate,
      ),
    [governorate],
  );

  const toggleService = (id: string) => {
    setLabServices((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setLatitude(lat);
        setLongitude(lng);
        setMapLocationUrl(`https://maps.google.com/?q=${lat},${lng}`);
      },
      () => {
        setError(
          language === 'ar'
            ? 'تعذر تحديد الموقع تلقائياً. يمكنك لصق رابط خرائط Google يدوياً.'
            : 'Unable to read device location. You may paste a map link manually.',
        );
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (
      professionalPhone.trim().length < 6 ||
      labNameAr.trim().length < 2 ||
      labNameEn.trim().length < 2 ||
      directorName.trim().length < 2 ||
      governorate.trim().length < 2 ||
      district.trim().length < 2 ||
      address.trim().length < 2 ||
      licenseNumber.trim().length < 2 ||
      licensingAuthority.trim().length < 2 ||
      technicalDirectorName.trim().length < 2 ||
      workDaysAndHours.trim().length < 2 ||
      labServices.length === 0
    ) {
      setError(
        language === 'ar'
          ? 'يرجى إكمال كافة معلومات المختبر والترخيص واختيار خدمة مختبرية واحدة على الأقل.'
          : 'Please complete all laboratory details, license info, and select at least one service.',
      );
      return;
    }

    onNext({
      professionalPhone: professionalPhone.trim(),
      labNameAr: labNameAr.trim(),
      labNameEn: labNameEn.trim(),
      directorName: directorName.trim(),
      governorate: governorate.trim(),
      district: district.trim(),
      address: address.trim(),
      mapLocationUrl: mapLocationUrl.trim(),
      latitude,
      longitude,
      licenseNumber: licenseNumber.trim(),
      licensingAuthority: licensingAuthority.trim(),
      licenseDocuments,
      technicalDirectorName: technicalDirectorName.trim(),
      labServices,
      workDaysAndHours: workDaysAndHours.trim(),
      hourlyBookingLimit: Math.max(1, Number(hourlyBookingLimit) || 8),
      bookingConfirmationMode,
    });
  };

  const inputClass =
    'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.forms.lab.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.lab.subtitle}
        </p>
      </div>

      <SharedPersonalSummary onEditPersonal={onEditPersonal} />

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {t.forms.lab.managerSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lab-phone" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.professionalPhone} *
            </label>
            <input
              id="lab-phone"
              type="tel"
              dir="ltr"
              required
              value={professionalPhone}
              onChange={(e) => setProfessionalPhone(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
          <div>
            <label htmlFor="lab-director" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.directorName} *
            </label>
            <input
              id="lab-director"
              type="text"
              required
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {t.forms.lab.institutionSection}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="lab-name-ar" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.labNameAr} *
            </label>
            <input
              id="lab-name-ar"
              type="text"
              required
              value={labNameAr}
              onChange={(e) => setLabNameAr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lab-name-en" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.labNameEn} *
            </label>
            <input
              id="lab-name-en"
              type="text"
              dir="ltr"
              required
              value={labNameEn}
              onChange={(e) => setLabNameEn(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>

          <div>
            <label htmlFor="lab-gov" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.governorate} *
            </label>
            <select
              id="lab-gov"
              required
              value={governorate}
              onChange={(e) => {
                setGovernorate(e.target.value);
                setDistrict('');
              }}
              className={inputClass}
            >
              <option value="">{t.common.selectOption}</option>
              {IRAQ_GOVERNORATES.map((g) => (
                <option key={g.id} value={language === 'ar' ? g.ar : g.en}>
                  {language === 'ar' ? g.ar : g.en}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lab-dist" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.district} *
            </label>
            {selectedGovObj ? (
              <select
                id="lab-dist"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className={inputClass}
              >
                <option value="">{t.common.selectOption}</option>
                {selectedGovObj.districts.map((d) => (
                  <option key={d.en} value={language === 'ar' ? d.ar : d.en}>
                    {language === 'ar' ? d.ar : d.en}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="lab-dist"
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className={inputClass}
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="lab-addr" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.address} *
            </label>
            <input
              id="lab-addr"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="lab-map" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.mapLocation}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="lab-map"
                type="text"
                dir="ltr"
                value={mapLocationUrl}
                onChange={(e) => setMapLocationUrl(e.target.value)}
                placeholder="https://maps.google.com/?q=..."
                className={`${inputClass} flex-1 min-w-[220px] text-left`}
              />
              <button
                type="button"
                onClick={handleCaptureLocation}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-[#d9a43b] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MapPin className="h-4 w-4 text-[#d9a43b]" aria-hidden="true" />
                <span>
                  {latitude !== undefined
                    ? `${t.common.locationCaptured} (${latitude}, ${longitude})`
                    : t.common.captureLocation}
                </span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="lab-lic" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.licenseNumber} *
            </label>
            <input
              id="lab-lic"
              type="text"
              required
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lab-auth" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.licensingAuthority} *
            </label>
            <input
              id="lab-auth"
              type="text"
              required
              value={licensingAuthority}
              onChange={(e) => setLicensingAuthority(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="lab-tech" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.technicalDirectorName} *
            </label>
            <input
              id="lab-tech"
              type="text"
              required
              value={technicalDirectorName}
              onChange={(e) => setTechnicalDirectorName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lab-hours" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.workDaysAndHours} *
            </label>
            <input
              id="lab-hours"
              type="text"
              required
              value={workDaysAndHours}
              onChange={(e) => setWorkDaysAndHours(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="lab-limit" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.hourlyLimit} *
            </label>
            <input
              id="lab-limit"
              type="number"
              min={1}
              max={200}
              required
              value={hourlyBookingLimit}
              onChange={(e) => setHourlyBookingLimit(Number(e.target.value))}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="lab-mode" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.lab.bookingMode} *
            </label>
            <select
              id="lab-mode"
              value={bookingConfirmationMode}
              onChange={(e) =>
                setBookingConfirmationMode(
                  e.target.value as BookingConfirmationMode,
                )
              }
              className={inputClass}
            >
              <option value="manual">{t.common.manual}</option>
              <option value="auto">{t.common.auto}</option>
            </select>
          </div>
        </div>

        <div className="pt-2">
          <p className="mb-2.5 text-sm font-medium text-slate-800 dark:text-slate-200">
            {t.forms.lab.services} *
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {LAB_SERVICE_OPTIONS.map((srv) => {
              const checked = labServices.includes(srv.id);
              return (
                <label
                  key={srv.id}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                    checked
                      ? 'border-[#d9a43b] bg-[#d9a43b]/10 text-slate-900 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleService(srv.id)}
                    className="h-4 w-4 accent-[#d9a43b]"
                  />
                  <span>{language === 'ar' ? srv.ar : srv.en}</span>
                </label>
              );
            })}
          </div>
        </div>

        <DocumentUploadField
          label={t.forms.lab.licenseDocuments}
          folder="lab_docs"
          documents={licenseDocuments}
          onChange={setLicenseDocuments}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[46px] rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
        >
          {t.common.back}
        </button>
        <button
          type="submit"
          className="medora-gold-button min-h-[48px] rounded-xl px-7 py-3 text-sm font-bold text-[#040917] cursor-pointer"
        >
          {t.common.next}
        </button>
      </div>
    </form>
  );
}
