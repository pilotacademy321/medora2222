import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { IRAQ_GOVERNORATES } from '../../constants/iraqLocations';
import { useMedora } from '../../contexts/MedoraContext';
import type { PharmacyPortalInput, UploadedDocMeta } from '../../types/medora';
import { DocumentUploadField } from './DocumentUploadField';
import { SharedPersonalSummary } from './SharedPersonalSummary';

interface PharmacyFormProps {
  initialData?: PharmacyPortalInput;
  onDraftSave?: (data: PharmacyPortalInput) => void;
  onEditPersonal: () => void;
  onBack: () => void;
  onNext: (data: PharmacyPortalInput) => void;
}

export function PharmacyForm({
  initialData,
  onDraftSave,
  onEditPersonal,
  onBack,
  onNext,
}: PharmacyFormProps) {
  const { language, t, userAccount } = useMedora();

  const [pharmacyNameAr, setPharmacyNameAr] = useState(initialData?.pharmacyNameAr || '');
  const [pharmacyNameEn, setPharmacyNameEn] = useState(initialData?.pharmacyNameEn || '');
  const [ownerFullName, setOwnerFullName] = useState(
    initialData?.ownerFullName || userAccount?.fullName || '',
  );
  const [responsiblePharmacistName, setResponsiblePharmacistName] = useState(
    initialData?.responsiblePharmacistName || userAccount?.fullName || '',
  );
  const [pharmacistSyndicateNumber, setPharmacistSyndicateNumber] = useState(
    initialData?.pharmacistSyndicateNumber || '',
  );
  const [pharmacyLicenseNumber, setPharmacyLicenseNumber] = useState(
    initialData?.pharmacyLicenseNumber || '',
  );
  const [licensingAuthority, setLicensingAuthority] = useState(
    initialData?.licensingAuthority || (language === 'ar' ? 'نقابة صيادلة العراق / وزارة الصحة' : 'Iraqi Pharmacists Syndicate / MoH'),
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
  const [address, setAddress] = useState(initialData?.address || userAccount?.address || '');
  const [mapLocationUrl, setMapLocationUrl] = useState(initialData?.mapLocationUrl || '');
  const [latitude, setLatitude] = useState<number | undefined>(initialData?.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(initialData?.longitude);
  const [workingDaysAndHours, setWorkingDaysAndHours] = useState(
    initialData?.workingDaysAndHours || (language === 'ar' ? 'السبت - الخميس · 9:00 صباحاً - 11:00 مساءً' : 'Sat - Thu · 09:00 AM - 11:00 PM'),
  );
  const [is24Hours, setIs24Hours] = useState(Boolean(initialData?.is24Hours));
  const [deliveryAvailable, setDeliveryAvailable] = useState(
    initialData?.deliveryAvailable ?? true,
  );
  const [pickupAvailable, setPickupAvailable] = useState(
    initialData?.pickupAvailable ?? true,
  );
  const [licenseDocuments, setLicenseDocuments] = useState<UploadedDocMeta[]>(
    initialData?.licenseDocuments || [],
  );
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): PharmacyPortalInput => ({
    pharmacyNameAr: pharmacyNameAr.trim(),
    pharmacyNameEn: pharmacyNameEn.trim(),
    ownerFullName: ownerFullName.trim(),
    responsiblePharmacistName: responsiblePharmacistName.trim(),
    pharmacistSyndicateNumber: pharmacistSyndicateNumber.trim(),
    pharmacyLicenseNumber: pharmacyLicenseNumber.trim(),
    licensingAuthority: licensingAuthority.trim(),
    licenseExpiryDate: licenseExpiryDate.trim(),
    professionalPhone: professionalPhone.trim(),
    email: email.trim(),
    governorate: governorate.trim(),
    district: district.trim(),
    address: address.trim(),
    mapLocationUrl: mapLocationUrl.trim(),
    latitude,
    longitude,
    workingDaysAndHours: workingDaysAndHours.trim(),
    is24Hours,
    deliveryAvailable,
    pickupAvailable,
    licenseDocuments,
  });

  const snapshotRef = useRef<PharmacyPortalInput>(buildPayload());
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
      pharmacyNameAr.trim().length < 2 ||
      pharmacyNameEn.trim().length < 2 ||
      ownerFullName.trim().length < 2 ||
      responsiblePharmacistName.trim().length < 2 ||
      pharmacistSyndicateNumber.trim().length < 2 ||
      pharmacyLicenseNumber.trim().length < 2 ||
      licensingAuthority.trim().length < 2 ||
      professionalPhone.trim().length < 6 ||
      governorate.trim().length < 2 ||
      district.trim().length < 2 ||
      address.trim().length < 2 ||
      workingDaysAndHours.trim().length < 2
    ) {
      setError(
        language === 'ar'
          ? 'يرجى إكمال كافة معلومات الصيدلية والصيدلاني المسؤول والإجازة الرسمية.'
          : 'Please complete all pharmacy, responsible pharmacist, and license fields.',
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
          {t.forms.pharmacy.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {t.forms.pharmacy.subtitle}
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
          {t.forms.pharmacy.ownerSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ph-owner" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.ownerFullName} *
            </label>
            <input
              id="ph-owner"
              type="text"
              required
              value={ownerFullName}
              onChange={(e) => setOwnerFullName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ph-resp" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.responsiblePharmacistName} *
            </label>
            <input
              id="ph-resp"
              type="text"
              required
              value={responsiblePharmacistName}
              onChange={(e) => setResponsiblePharmacistName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ph-syn" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.pharmacistSyndicateNumber} *
            </label>
            <input
              id="ph-syn"
              type="text"
              required
              value={pharmacistSyndicateNumber}
              onChange={(e) => setPharmacistSyndicateNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ph-phone" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.professionalPhone} *
            </label>
            <input
              id="ph-phone"
              type="tel"
              dir="ltr"
              required
              value={professionalPhone}
              onChange={(e) => setProfessionalPhone(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
        </div>
      </div>

      <div className="space-y-4 border-t border-slate-200 pt-5 dark:border-slate-800">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">
          {t.forms.pharmacy.institutionSection}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ph-name-ar" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.pharmacyNameAr} *
            </label>
            <input
              id="ph-name-ar"
              type="text"
              required
              value={pharmacyNameAr}
              onChange={(e) => setPharmacyNameAr(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ph-name-en" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.pharmacyNameEn} *
            </label>
            <input
              id="ph-name-en"
              type="text"
              dir="ltr"
              required
              value={pharmacyNameEn}
              onChange={(e) => setPharmacyNameEn(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>

          <div>
            <label htmlFor="ph-email" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.email}
            </label>
            <input
              id="ph-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClass} text-left`}
            />
          </div>
          <div>
            <label htmlFor="ph-lic" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.pharmacyLicenseNumber} *
            </label>
            <input
              id="ph-lic"
              type="text"
              required
              value={pharmacyLicenseNumber}
              onChange={(e) => setPharmacyLicenseNumber(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="ph-auth" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.licensingAuthority} *
            </label>
            <input
              id="ph-auth"
              type="text"
              required
              value={licensingAuthority}
              onChange={(e) => setLicensingAuthority(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="ph-exp" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.licenseExpiryDate}
            </label>
            <input
              id="ph-exp"
              type="date"
              dir="ltr"
              value={licenseExpiryDate}
              onChange={(e) => setLicenseExpiryDate(e.target.value)}
              className={`${inputClass} text-left tabular-nums`}
            />
          </div>

          <div>
            <label htmlFor="ph-gov" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.governorate} *
            </label>
            <select
              id="ph-gov"
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
            <label htmlFor="ph-dist" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.district} *
            </label>
            {selectedGovObj ? (
              <select
                id="ph-dist"
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
                id="ph-dist"
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className={inputClass}
              />
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ph-addr" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.address} *
            </label>
            <input
              id="ph-addr"
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="ph-map" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.mapLocation}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="ph-map"
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

          <div className="sm:col-span-2">
            <label htmlFor="ph-hours" className="mb-1.5 block text-sm font-medium text-slate-800 dark:text-slate-200">
              {t.forms.pharmacy.workingDaysAndHours} *
            </label>
            <input
              id="ph-hours"
              type="text"
              required
              value={workingDaysAndHours}
              onChange={(e) => setWorkingDaysAndHours(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-200">
            <input
              type="checkbox"
              checked={is24Hours}
              onChange={(e) => setIs24Hours(e.target.checked)}
              className="h-4 w-4 accent-[#d9a43b]"
            />
            <span>{t.forms.pharmacy.is24Hours}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-200">
            <input
              type="checkbox"
              checked={pickupAvailable}
              onChange={(e) => setPickupAvailable(e.target.checked)}
              className="h-4 w-4 accent-[#d9a43b]"
            />
            <span>{t.forms.pharmacy.pickupAvailable}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-200">
            <input
              type="checkbox"
              checked={deliveryAvailable}
              onChange={(e) => setDeliveryAvailable(e.target.checked)}
              className="h-4 w-4 accent-[#d9a43b]"
            />
            <span>{t.forms.pharmacy.deliveryAvailable}</span>
          </label>
        </div>

        <DocumentUploadField
          label={t.forms.pharmacy.licenseDocuments}
          folder="pharmacy_docs"
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
