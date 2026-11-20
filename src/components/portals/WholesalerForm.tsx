import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { useMedora } from '../../contexts/MedoraContext';
import type { UploadedDocMeta, WholesalerPortalInput } from '../../types/medora';
import { DocumentUploadField } from './DocumentUploadField';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface WholesalerFormProps {
  initialData?: WholesalerPortalInput;
  onDraftSave?: (data: WholesalerPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: WholesalerPortalInput) => void;
}

export function WholesalerForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: WholesalerFormProps) {
  const { language, t, userAccount } = useMedora();

  const [wholesalerNameAr, setWholesalerNameAr] = useState(initialData?.wholesalerNameAr || '');
  const [wholesalerNameEn, setWholesalerNameEn] = useState(initialData?.wholesalerNameEn || '');
  const [ownerFullName, setOwnerFullName] = useState(
    initialData?.ownerFullName || userAccount?.fullName || '',
  );
  const [legalEntityName, setLegalEntityName] = useState(initialData?.legalEntityName || '');
  const [warehouseLicenseNumber, setWarehouseLicenseNumber] = useState(
    initialData?.warehouseLicenseNumber || '',
  );
  const [healthAuthorityLicenseNumber, setHealthAuthorityLicenseNumber] = useState(
    initialData?.healthAuthorityLicenseNumber || '',
  );
  const [licensingAuthority, setLicensingAuthority] = useState(
    initialData?.licensingAuthority ||
      (language === 'ar'
        ? 'وزارة الصحة / نقابة صيادلة العراق'
        : 'Ministry of Health / Iraqi Pharmacists Syndicate'),
  );
  const [licenseExpiryDate, setLicenseExpiryDate] = useState(
    initialData?.licenseExpiryDate || '',
  );
  const [professionalPhone, setProfessionalPhone] = useState(
    initialData?.professionalPhone || userAccount?.phone || '',
  );
  const [email, setEmail] = useState(initialData?.email || userAccount?.email || '');
  const [governorate, setGovernorate] = useState(
    initialData?.governorate || userAccount?.governorate || '',
  );
  const [district, setDistrict] = useState(
    initialData?.district || userAccount?.district || '',
  );
  const [warehouseAddress, setWarehouseAddress] = useState(
    initialData?.warehouseAddress || userAccount?.address || '',
  );
  const [mapLocationUrl, setMapLocationUrl] = useState(initialData?.mapLocationUrl || '');
  const [latitude, setLatitude] = useState<number | undefined>(initialData?.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(initialData?.longitude);
  const [workingDaysAndHours, setWorkingDaysAndHours] = useState(
    initialData?.workingDaysAndHours ||
      (language === 'ar'
        ? 'السبت - الخميس · 8:00 صباحاً - 6:00 مساءً'
        : 'Sat - Thu · 08:00 AM - 06:00 PM'),
  );
  const [supportedGovsText, setSupportedGovsText] = useState(
    initialData?.supportedGovernorates?.join('، ') || userAccount?.governorate || '',
  );
  const [minimumOrderIqd, setMinimumOrderIqd] = useState(
    initialData?.minimumOrderIqd ?? 250000,
  );
  const [licenseDocuments, setLicenseDocuments] = useState<UploadedDocMeta[]>(
    initialData?.licenseDocuments || [],
  );
  const [error, setError] = useState<string | null>(null);

  const parseGovernorates = (raw: string): string[] =>
    raw
      .split(/[،,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

  const buildPayload = (): WholesalerPortalInput => ({
    wholesalerNameAr: wholesalerNameAr.trim(),
    wholesalerNameEn: wholesalerNameEn.trim(),
    ownerFullName: ownerFullName.trim(),
    legalEntityName: legalEntityName.trim(),
    warehouseLicenseNumber: warehouseLicenseNumber.trim(),
    healthAuthorityLicenseNumber: healthAuthorityLicenseNumber.trim(),
    licensingAuthority: licensingAuthority.trim(),
    licenseExpiryDate: licenseExpiryDate.trim(),
    professionalPhone: professionalPhone.trim(),
    email: email.trim(),
    governorate: governorate.trim(),
    district: district.trim(),
    warehouseAddress: warehouseAddress.trim(),
    mapLocationUrl: mapLocationUrl.trim(),
    latitude,
    longitude,
    workingDaysAndHours: workingDaysAndHours.trim(),
    supportedGovernorates: parseGovernorates(supportedGovsText),
    minimumOrderIqd: Math.max(0, Number(minimumOrderIqd) || 0),
    licenseDocuments,
  });

  const snapshotRef = useRef<WholesalerPortalInput>(buildPayload());
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
      wholesalerNameAr.trim().length < 2 ||
      wholesalerNameEn.trim().length < 2 ||
      ownerFullName.trim().length < 2 ||
      legalEntityName.trim().length < 2 ||
      warehouseLicenseNumber.trim().length < 2 ||
      licensingAuthority.trim().length < 2 ||
      professionalPhone.trim().length < 6 ||
      governorate.trim().length < 2 ||
      district.trim().length < 2 ||
      warehouseAddress.trim().length < 2 ||
      workingDaysAndHours.trim().length < 2
    ) {
      setError(
        language === 'ar'
          ? 'يرجى إكمال كافة معلومات المذخر والكيان القانوني والإجازات الرسمية.'
          : 'Please complete all wholesaler, legal entity, and license fields.',
      );
      return;
    }

    onNext(buildPayload());
  };

  const inputClass =
    'min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#d9a43b] focus:outline-none focus:ring-1 focus:ring-[#d9a43b] dark:border-slate-700/80 dark:bg-[#040a1a] dark:text-white dark:placeholder:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {t.forms.wholesaler.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.wholesaler.subtitle}
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
          {t.forms.wholesaler.ownerSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wh-owner" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.ownerFullName} *
            </label>
            <input
              id="wh-owner"
              type="text"
              required
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-legal" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.legalEntityName} *
            </label>
            <input
              id="wh-legal"
              type="text"
              required
              value={legalEntityName}
              onChange={(e) => setLegalEntityName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-phone" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.professionalPhone} *
            </label>
            <input
              id="wh-phone"
              type="tel"
              dir="ltr"
              required
              value={professionalPhone}
              onChange={(e) => setProfessionalPhone(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
          <div>
            <label htmlFor="wh-email" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.email}
            </label>
            <input
              id="wh-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {t.forms.wholesaler.institutionSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wh-name-ar" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.wholesalerNameAr} *
            </label>
            <input
              id="wh-name-ar"
              type="text"
              required
              value={wholesalerNameAr}
              onChange={(e) => setWholesalerNameAr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-name-en" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.wholesalerNameEn} *
            </label>
            <input
              id="wh-name-en"
              type="text"
              dir="ltr"
              required
              value={wholesalerNameEn}
              onChange={(e) => setWholesalerNameEn(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>

          <div>
            <label htmlFor="wh-lic" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.warehouseLicenseNumber} *
            </label>
            <input
              id="wh-lic"
              type="text"
              required
              value={warehouseLicenseNumber}
              onChange={(e) => setWarehouseLicenseNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-moh" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.healthAuthorityLicenseNumber}
            </label>
            <input
              id="wh-moh"
              type="text"
              value={healthAuthorityLicenseNumber}
              onChange={(e) => setHealthAuthorityLicenseNumber(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="wh-auth" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.licensingAuthority} *
            </label>
            <input
              id="wh-auth"
              type="text"
              required
              value={licensingAuthority}
              onChange={(e) => setLicensingAuthority(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-exp" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.licenseExpiryDate}
            </label>
            <input
              id="wh-exp"
              type="date"
              dir="ltr"
              value={licenseExpiryDate}
              onChange={(e) => setLicenseExpiryDate(e.target.value)}
              className={`${inputClass} text-left tabular-nums`}
            />
          </div>

          <div>
            <label htmlFor="wh-gov" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.governorate} *
            </label>
            <select
              id="wh-gov"
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
            <label htmlFor="wh-dist" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.district} *
            </label>
            {selectedGovObj ? (
              <select
                id="wh-dist"
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
                id="wh-dist"
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className={inputClass}
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="wh-addr" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.warehouseAddress} *
            </label>
            <input
              id="wh-addr"
              type="text"
              required
              value={warehouseAddress}
              onChange={(e) => setWarehouseAddress(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="wh-map" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.mapLocation}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="wh-map"
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
            <label htmlFor="wh-hours" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.workingDaysAndHours} *
            </label>
            <input
              id="wh-hours"
              type="text"
              required
              value={workingDaysAndHours}
              onChange={(e) => setWorkingDaysAndHours(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="wh-min" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.minimumOrderIqd}
            </label>
            <input
              id="wh-min"
              type="number"
              min={0}
              step={1000}
              value={minimumOrderIqd}
              onChange={(e) => setMinimumOrderIqd(Number(e.target.value))}
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="wh-govs" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.wholesaler.supportedGovernorates}
            </label>
            <input
              id="wh-govs"
              type="text"
              value={supportedGovsText}
              onChange={(e) => setSupportedGovsText(e.target.value)}
              placeholder={language === 'ar' ? 'بغداد، البصرة، النجف' : 'Baghdad, Basra, Najaf'}
              className={inputClass}
            />
          </div>
        </div>

        <DocumentUploadField
          label={t.forms.wholesaler.licenseDocuments}
          folder="wholesaler_docs"
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
