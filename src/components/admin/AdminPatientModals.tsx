import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import { type User } from 'firebase/auth';
import {
  CalendarCheck2,
  CheckCircle2,
  ImagePlus,
  Info,
  Loader2,
  MapPin,
  ShieldAlert,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import type { MedoraCopy } from '../../i18n/translations';
import {
  fetchAdminAdEntitiesDirectory,
  type AdminAdEntitiesDirectory,
} from '../../services/adsService';
import {
  createAdminAd,
  moderateAdminReview,
  updateAdminAd,
  updateAdminFeedback,
  uploadAdminAdImage,
} from '../../services/medoraFirestore';
import type { PublicDoctorCard } from '../../types/doctor';
import type { Language, SuperAdminServerStatus } from '../../types/medora';
import type {
  AdActionType,
  AdEntityType,
  AdTargetPortal,
  DoctorReviewRecord,
  LabDirectoryCard,
  MedoraAdRecord,
  MedoraAdStatus,
  PatientFeedbackRecord,
  PatientFeedbackStatus,
} from '../../types/patient';
import {
  isValidAdImageUrlClient,
  mapUploadErrorMessage,
  MAX_AD_ORIGINAL_BYTES,
  normalizeStrictAdMime,
} from '../../utils/imagePreparation';
import { formatIsoDate } from './AdminModals';

const AD_CATEGORIES: Array<{
  value: AdEntityType;
  ar: string;
  en: string;
}> = [
  { value: 'doctor', ar: 'الأطباء', en: 'Doctors' },
  { value: 'lab', ar: 'المختبرات', en: 'Laboratories' },
  { value: 'pharmacy', ar: 'الصيدليات', en: 'Pharmacies' },
  { value: 'wholesaler', ar: 'المذاخر الدوائية', en: 'Wholesalers' },
  { value: 'platform_service', ar: 'خدمات MEDORA', en: 'Platform Services' },
  { value: 'radiology_info', ar: 'شركاء الأشعة (للمختبرات)', en: 'Radiology Partner (Lab Info)' },
];

const PORTAL_TARGETS: Array<{
  value: AdTargetPortal;
  ar: string;
  en: string;
}> = [
  { value: 'entry', ar: 'بوابة المدخل', en: 'Entry Portal' },
  { value: 'patient', ar: 'بوابة المريض', en: 'Patient Portal' },
  { value: 'pharmacy', ar: 'بوابة الصيدلية', en: 'Pharmacy Portal' },
  { value: 'lab', ar: 'بوابة المختبر', en: 'Lab Portal' },
  { value: 'doctor', ar: 'بوابة الطبيب', en: 'Doctor Portal' },
  { value: 'wholesaler', ar: 'بوابة المذخر', en: 'Wholesaler Portal' },
];

const ALLOWED_PORTALS_BY_ENTITY: Record<AdEntityType, AdTargetPortal[]> = {
  doctor: ['entry', 'patient', 'lab'],
  lab: ['entry', 'patient', 'doctor'],
  pharmacy: ['entry', 'patient', 'doctor', 'pharmacy', 'wholesaler'],
  wholesaler: ['entry', 'pharmacy', 'doctor', 'wholesaler'],
  platform_service: ['entry', 'patient', 'pharmacy', 'lab', 'doctor', 'wholesaler'],
  radiology_info: ['lab'],
};

function defaultPortalsForEntity(type: AdEntityType): AdTargetPortal[] {
  if (type === 'radiology_info') return ['lab'];
  if (type === 'wholesaler') return ['pharmacy', 'doctor', 'entry'];
  if (type === 'pharmacy') return ['patient', 'doctor', 'wholesaler', 'entry'];
  if (type === 'platform_service') return ['entry', 'patient', 'doctor', 'pharmacy'];
  if (type === 'lab') return ['entry', 'patient', 'doctor'];
  return ['entry', 'patient', 'lab'];
}

export function AdEditorModal({
  firebaseUser,
  t,
  language,
  approvedDoctors,
  approvedLabs,
  editingAd,
  serverStatus,
  onClose,
  onSaved,
}: {
  firebaseUser: User;
  t: MedoraCopy;
  language: Language;
  approvedDoctors: PublicDoctorCard[];
  approvedLabs: LabDirectoryCard[];
  editingAd: MedoraAdRecord | null;
  serverStatus?: SuperAdminServerStatus | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isAr = language === 'ar';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Baghdad' });
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const initialEntityType: AdEntityType =
    editingAd?.entityType === 'lab' ||
    editingAd?.entityType === 'pharmacy' ||
    editingAd?.entityType === 'wholesaler' ||
    editingAd?.entityType === 'radiology_info' ||
    editingAd?.entityType === 'platform_service'
      ? editingAd.entityType
      : 'doctor';

  const initialEntityUid =
    editingAd?.entityUid ||
    editingAd?.doctorUid ||
    (initialEntityType === 'doctor'
      ? approvedDoctors[0]?.doctorUid || ''
      : initialEntityType === 'lab'
        ? approvedLabs[0]?.labUid || ''
        : initialEntityType === 'platform_service' || initialEntityType === 'radiology_info'
          ? `${initialEntityType}_${Date.now().toString(36)}`
          : '');

  const initialStatus: MedoraAdStatus = editingAd
    ? editingAd.status || (editingAd.active ? 'published' : 'paused')
    : 'published';

  const [entityType, setEntityType] = useState<AdEntityType>(initialEntityType);
  const [entityUid, setEntityUid] = useState(initialEntityUid);
  const [customEntityName, setCustomEntityName] = useState(editingAd?.entityName || '');
  const [customClinicName, setCustomClinicName] = useState(editingAd?.clinicName || '');
  const [customSpecialty, setCustomSpecialty] = useState(editingAd?.specialty || '');
  const [targetPortals, setTargetPortals] = useState<AdTargetPortal[]>(
    editingAd?.targetPortals && editingAd.targetPortals.length > 0
      ? editingAd.targetPortals
      : defaultPortalsForEntity(initialEntityType),
  );
  const [title, setTitle] = useState(editingAd?.title || '');
  const [description, setDescription] = useState(editingAd?.description || '');
  const [imageUrl, setImageUrl] = useState(editingAd?.imageUrl || '');
  const [storagePath, setStoragePath] = useState(editingAd?.storagePath || '');
  const [storageMode, setStorageMode] = useState<'firebase_storage' | 'firestore_asset'>(
    editingAd?.storageMode ||
      (editingAd?.storagePath?.startsWith('firestore_assets/')
        ? 'firestore_asset'
        : 'firebase_storage'),
  );
  const [uploadedMeta, setUploadedMeta] = useState<{
    width: number;
    height: number;
    size: number;
  } | null>(null);
  const [ctaLabel, setCtaLabel] = useState(
    editingAd?.ctaLabel || (isAr ? 'احجز الآن' : 'Explore Now'),
  );
  const [ctaLabelEn, setCtaLabelEn] = useState(
    editingAd?.ctaLabelEn || 'Explore Now',
  );
  const [actionType, setActionType] = useState<AdActionType>(
    editingAd?.actionType ||
      (initialEntityType === 'radiology_info' ? 'info_only' : 'open_directory'),
  );
  const [destinationTarget, setDestinationTarget] = useState(
    editingAd?.destinationTarget || '',
  );
  const [badgeTextAr, setBadgeTextAr] = useState(editingAd?.badgeTextAr || '');
  const [badgeTextEn, setBadgeTextEn] = useState(editingAd?.badgeTextEn || '');
  const [useDateRange, setUseDateRange] = useState(
    Boolean(editingAd?.startDate || editingAd?.endDate),
  );
  const [startDate, setStartDate] = useState(editingAd?.startDate || today);
  const [endDate, setEndDate] = useState(editingAd?.endDate || nextMonth);
  const [priority, setPriority] = useState(editingAd?.priority ?? 10);
  const [status, setStatus] = useState<MedoraAdStatus>(initialStatus);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [directory, setDirectory] = useState<AdminAdEntitiesDirectory | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAdminAdEntitiesDirectory(firebaseUser)
      .then((dir) => {
        if (alive) setDirectory(dir);
      })
      .catch(() => {
        // Fallback smoothly to approvedDoctors / approvedLabs passed via props
      });
    return () => {
      alive = false;
    };
  }, [firebaseUser]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    setPreviewBroken(false);
  }, [imageUrl, localPreviewUrl]);

  const isCustomEntity =
    entityType === 'platform_service' || entityType === 'radiology_info';

  const entitiesForCategory = useMemo(() => {
    if (entityType === 'doctor') {
      const list = directory?.doctors?.length ? directory.doctors : approvedDoctors;
      return list.map((doc) => ({
        uid: doc.doctorUid,
        label: `${doc.fullName} — ${doc.specialty} (${doc.clinicName})`,
        name: doc.fullName,
        subLabel: `${doc.specialty} · ${doc.clinicName}`,
        location: [doc.clinicName, doc.governorate].filter(Boolean).join(' · '),
      }));
    }
    if (entityType === 'lab') {
      const list = directory?.labs?.length ? directory.labs : approvedLabs;
      return list.map((lab) => ({
        uid: lab.labUid,
        label: `${lab.labNameAr} — ${lab.governorate || ''} · ${lab.district || ''}`,
        name: lab.labNameAr,
        subLabel: isAr ? 'مختبر تحليلات معتمد' : 'Verified Lab',
        location: [lab.governorate, lab.district].filter(Boolean).join(' · '),
      }));
    }
    if (entityType === 'pharmacy') {
      return (directory?.pharmacies || []).map((ph) => ({
        uid: ph.pharmacyUid,
        label: `${ph.pharmacyNameAr} — ${ph.governorate || ''} · ${ph.district || ''}`,
        name: ph.pharmacyNameAr,
        subLabel: isAr ? 'صيدلية معتمدة' : 'Verified Pharmacy',
        location: [ph.governorate, ph.district].filter(Boolean).join(' · '),
      }));
    }
    if (entityType === 'wholesaler') {
      return (directory?.wholesalers || []).map((ws) => ({
        uid: ws.wholesalerUid,
        label: `${ws.wholesalerNameAr} — ${ws.governorate || ''} · ${ws.district || ''}`,
        name: ws.wholesalerNameAr,
        subLabel: isAr ? 'مذخر دوائي معتمد' : 'Licensed Wholesaler',
        location: [ws.governorate, ws.district].filter(Boolean).join(' · '),
      }));
    }
    return [];
  }, [entityType, directory, approvedDoctors, approvedLabs, isAr]);

  const selectedEntity = useMemo(() => {
    if (isCustomEntity) {
      if (!customEntityName.trim() && !title.trim()) return null;
      return {
        uid: entityUid,
        name: customEntityName.trim() || title.trim(),
        location: customClinicName.trim(),
      };
    }
    return entitiesForCategory.find((item) => item.uid === entityUid) || null;
  }, [isCustomEntity, customEntityName, customClinicName, title, entityUid, entitiesForCategory]);

  const handleCategoryChange = (nextType: AdEntityType) => {
    setEntityType(nextType);
    const allowed = ALLOWED_PORTALS_BY_ENTITY[nextType];
    setTargetPortals(defaultPortalsForEntity(nextType).filter((p) => allowed.includes(p)));
    if (nextType === 'radiology_info') {
      setActionType('info_only');
      if (!ctaLabel.trim()) setCtaLabel('عرض تفاصيل التحويل');
      if (!ctaLabelEn.trim()) setCtaLabelEn('View Referral Info');
    }

    if (nextType === 'doctor') {
      const list = directory?.doctors?.length ? directory.doctors : approvedDoctors;
      setEntityUid(list[0]?.doctorUid || '');
    } else if (nextType === 'lab') {
      const list = directory?.labs?.length ? directory.labs : approvedLabs;
      setEntityUid(list[0]?.labUid || '');
    } else if (nextType === 'pharmacy') {
      setEntityUid(directory?.pharmacies[0]?.pharmacyUid || '');
    } else if (nextType === 'wholesaler') {
      setEntityUid(directory?.wholesalers[0]?.wholesalerUid || '');
    } else {
      setEntityUid(`${nextType}_${Date.now().toString(36)}`);
    }
  };

  const togglePortal = (portal: AdTargetPortal) => {
    const allowed = ALLOWED_PORTALS_BY_ENTITY[entityType];
    if (!allowed.includes(portal)) return;
    setTargetPortals((prev) => {
      const exists = prev.includes(portal);
      if (exists && prev.length <= 1) return prev;
      return exists ? prev.filter((p) => p !== portal) : [...prev, portal];
    });
  };

  const handleUploadImage = async (file: File | null) => {
    if (!file) return;
    if (!normalizeStrictAdMime(file)) {
      setError(mapUploadErrorMessage(new Error('INVALID_AD_IMAGE_FORMAT'), language));
      return;
    }
    if (file.size > MAX_AD_ORIGINAL_BYTES) {
      setError(mapUploadErrorMessage(new Error('AD_FILE_TOO_LARGE_5MB'), language));
      return;
    }

    const tempUrl = URL.createObjectURL(file);
    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return tempUrl;
    });
    setUploading(true);
    setError(null);
    try {
      const res = await uploadAdminAdImage(firebaseUser, file);
      if (!isValidAdImageUrlClient(res.imageUrl, res.storagePath)) {
        throw new Error('AD_STORAGE_IMAGE_REQUIRED');
      }
      setImageUrl(res.imageUrl);
      setStoragePath(res.storagePath);
      setStorageMode(res.storageMode);
      setUploadedMeta({
        width: res.width,
        height: res.height,
        size: res.size,
      });
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch (err) {
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(mapUploadErrorMessage(err, language));
    } finally {
      setUploading(false);
    }
  };

  const handleDropImage = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (uploading) return;
    const dropped = e.dataTransfer.files?.[0] || null;
    if (dropped) {
      void handleUploadImage(dropped);
    }
  };

  const storageValid = isValidAdImageUrlClient(imageUrl, storagePath);
  const canPersistEntity = isCustomEntity
    ? Boolean(customEntityName.trim() || title.trim())
    : Boolean(entityUid);

  const persistAd = async (targetStatus: MedoraAdStatus) => {
    if (!canPersistEntity) {
      setError(
        isCustomEntity
          ? isAr
            ? 'يرجى كتابة اسم الجهة أو الخدمة الإعلانية.'
            : 'Please enter the service or partner name.'
          : mapUploadErrorMessage(new Error('MISSING_REQUIRED_AD_FIELDS'), language),
      );
      return;
    }
    if (!storageValid) {
      setError(t.admin.ads.imageRequiredError);
      return;
    }
    const finalStart = useDateRange ? startDate : '';
    const finalEnd = useDateRange ? endDate : '';
    if (finalStart && finalEnd && finalEnd < finalStart) {
      setError(mapUploadErrorMessage(new Error('AD_DATE_RANGE_INVALID'), language));
      return;
    }
    if (targetStatus === 'published' && finalEnd && finalEnd < today) {
      setError(mapUploadErrorMessage(new Error('AD_EXPIRED_EXTEND_DATE_FIRST'), language));
      return;
    }

    const effectiveEntityUid =
      entityUid || `${entityType}_${Date.now().toString(36)}`;
    const allowedPortals = ALLOWED_PORTALS_BY_ENTITY[entityType];
    const cleanPortals = targetPortals.filter((p) => allowedPortals.includes(p));
    const finalPortals =
      cleanPortals.length > 0 ? cleanPortals : defaultPortalsForEntity(entityType);

    setSaving(true);
    setError(null);
    try {
      const commonPayload = {
        entityType,
        entityUid: effectiveEntityUid,
        doctorUid: entityType === 'doctor' ? effectiveEntityUid : '',
        ...(isCustomEntity
          ? {
              entityName: (customEntityName.trim() || title.trim()).slice(0, 140),
              clinicName: customClinicName.trim().slice(0, 140),
              specialty: customSpecialty.trim().slice(0, 120),
            }
          : {}),
        targetPortals: finalPortals,
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        storagePath: storagePath.trim(),
        ctaLabel: ctaLabel.trim() || (isAr ? 'استعراض الآن' : 'Explore Now'),
        ctaLabelEn: ctaLabelEn.trim() || 'Explore Now',
        actionType:
          entityType === 'radiology_info' && actionType !== 'open_external_url'
            ? 'info_only'
            : actionType,
        destinationTarget: destinationTarget.trim(),
        badgeTextAr: badgeTextAr.trim(),
        badgeTextEn: badgeTextEn.trim(),
        startDate: finalStart,
        endDate: finalEnd,
        priority: Number(priority) || 10,
        status: targetStatus,
        active: targetStatus === 'published',
      };

      if (editingAd) {
        await updateAdminAd(firebaseUser, editingAd.adId, {
          ...commonPayload,
          approvedByAdmin: true,
        });
      } else {
        await createAdminAd(firebaseUser, commonPayload);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(mapUploadErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await persistAd(status);
  };

  const storageStatusLabel = uploading
    ? t.admin.ads.uploadingImageBtn
    : storageValid
      ? storageMode === 'firebase_storage'
        ? t.admin.ads.storageSavedBadge
        : t.admin.ads.assetsSavedBadge
      : t.admin.ads.storageMissingBadge;

  const statusChoices: { value: MedoraAdStatus; label: string; activeTone: string }[] = [
    {
      value: 'published',
      label: t.admin.ads.publishedStatus,
      activeTone: 'border-emerald-600 bg-emerald-600 text-white',
    },
    {
      value: 'draft',
      label: t.admin.ads.draftStatus,
      activeTone: 'border-[#0c3585] bg-[#0c3585] text-white',
    },
    {
      value: 'paused',
      label: t.admin.ads.pausedStatus,
      activeTone: 'border-slate-700 bg-slate-700 text-white',
    },
    {
      value: 'expired',
      label: t.admin.ads.expiredStatus,
      activeTone: 'border-rose-700 bg-rose-700 text-white',
    },
  ];

  const allowedPortalsForCurrent = ALLOWED_PORTALS_BY_ENTITY[entityType];
  const currentCatMeta = AD_CATEGORIES.find((c) => c.value === entityType);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#07122a] sm:p-6"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {editingAd ? t.admin.ads.editTitle : t.admin.ads.createTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {serverStatus && serverStatus.firebaseStorageActive === false && (
            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-xs text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/35 dark:text-sky-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>{t.admin.ads.storageFallbackNotice}</span>
            </div>
          )}

          {/* 1. Category Selector (All 6 Ecosystem Categories) */}
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.admin.ads.categoryLabel}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {AD_CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => handleCategoryChange(cat.value)}
                  className={`min-h-[40px] rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    entityType === cat.value
                      ? 'border-[#0c3585] bg-[#0c3585] text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  }`}
                >
                  {isAr ? cat.ar : cat.en}
                </button>
              ))}
            </div>
          </div>

          {entityType === 'radiology_info' && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {isAr
                  ? 'سيظهر هذا الإعلان حصرياً داخل بوابة المختبرات كإعلان تعريفي وتحويل تعاوني فقط — بوابة الأشعة تبقى مغلقة تماماً دون أي حجز أو تنفيذ فحص.'
                  : 'Shown strictly inside the Lab Portal as informational/referral only — the Imaging Portal remains closed with no booking or exam execution.'}
              </span>
            </div>
          )}

          {/* 2. Entity Selector or Custom Partner/Service Metadata */}
          {isCustomEntity ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {entityType === 'radiology_info'
                    ? isAr
                      ? 'اسم مركز الأشعة / الشريك'
                      : 'Radiology Partner Name'
                    : isAr
                      ? 'اسم الخدمة / الجهة'
                      : 'Platform Service Name'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={customEntityName}
                  onChange={(e) => setCustomEntityName(e.target.value)}
                  placeholder={
                    entityType === 'radiology_info'
                      ? isAr
                        ? 'مثال: مركز الدقة للأشعة التخصصية'
                        : 'e.g. Precision Radiology Center'
                      : isAr
                        ? 'مثال: خدمة حنين الذكية للتحاليل'
                        : 'e.g. Haneen AI Health Guidance'
                  }
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isAr ? 'العنوان / تفاصيل التحويل (اختياري)' : 'Address / Referral Details'}
                </label>
                <input
                  type="text"
                  maxLength={140}
                  value={customClinicName}
                  onChange={(e) => setCustomClinicName(e.target.value)}
                  placeholder={isAr ? 'بغداد · المنصور — تنسيق عبر المختبر' : 'Baghdad · Al-Mansour'}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.admin.ads.entityLabel}
              </label>
              {entitiesForCategory.length === 0 ? (
                <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
                  {t.admin.ads.noEntitiesHint}
                </p>
              ) : (
                <select
                  required
                  value={entityUid}
                  onChange={(e) => setEntityUid(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  {entitiesForCategory.map((item) => (
                    <option key={item.uid} value={item.uid}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 3. Target Audience Portals Checkboxes */}
          <div className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
              {isAr ? 'البوابات المستهدفة لعرض الإعلان' : 'Target Audience Portals'}
            </p>
            <div className="flex flex-wrap gap-2">
              {PORTAL_TARGETS.map((pt) => {
                const isAllowed = allowedPortalsForCurrent.includes(pt.value);
                const isChecked = targetPortals.includes(pt.value) && isAllowed;
                return (
                  <button
                    key={pt.value}
                    type="button"
                    disabled={!isAllowed}
                    onClick={() => togglePortal(pt.value)}
                    className={`min-h-[36px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                      !isAllowed
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-50 dark:border-slate-800 dark:bg-slate-900/40'
                        : isChecked
                          ? 'cursor-pointer border-[#d9a43b] bg-[#d9a43b]/15 text-[#9a6b16] dark:text-[#f4d378]'
                          : 'cursor-pointer border-slate-300 bg-white text-slate-600 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                    }`}
                  >
                    {isAr ? pt.ar : pt.en}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Device Upload (1200x600 · 2:1 · max 5MB · JPG/PNG/WebP) */}
          <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.admin.ads.imageLabel}
              </label>
              <span
                className={`text-[11px] font-bold ${
                  uploading
                    ? 'text-[#0c3585] dark:text-[#f4d378]'
                    : storageValid
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                {storageStatusLabel}
                {uploadedMeta && !uploading
                  ? ` (${uploadedMeta.width}×${uploadedMeta.height} · ${Math.round(uploadedMeta.size / 1024)} KB)`
                  : ''}
              </span>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              {t.admin.ads.imageSpecsHint}
            </p>

            <label
              onDragOver={(e) => {
                e.preventDefault();
                if (!uploading) setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDropImage}
              className={`flex min-h-[108px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
                dragActive
                  ? 'border-[#d9a43b] bg-[#d9a43b]/10'
                  : 'border-slate-300 bg-white hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-950 dark:hover:border-[#d9a43b]'
              } ${uploading ? 'pointer-events-none opacity-80' : ''}`}
            >
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                disabled={uploading}
                className="sr-only"
                onChange={(e) => {
                  void handleUploadImage(e.target.files?.[0] || null);
                  e.currentTarget.value = '';
                }}
              />
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-[#0c3585] dark:text-[#f4d378]" />
              ) : (
                <ImagePlus className="h-6 w-6 text-[#0c3585] dark:text-[#f4d378]" />
              )}
              <p className="mt-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                {uploading ? t.admin.ads.uploadingImageBtn : t.admin.ads.uploadImageBtn}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {t.admin.ads.dragDropHint}
              </p>
            </label>
          </div>

          {/* 5. Title, CTA AR/EN, Action Behavior */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.admin.ads.titleLabel}
              </label>
              <input
                type="text"
                maxLength={140}
                value={title}
                placeholder={t.admin.ads.titlePlaceholder}
                onChange={(e) => setTitle(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {isAr ? 'نوع إجراء الزر' : 'CTA Action Behavior'}
              </label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as AdActionType)}
                disabled={entityType === 'radiology_info'}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="open_directory">
                  {isAr ? 'فتح ملف الجهة / الحجز المباشر' : 'Open Entity Profile / Booking'}
                </option>
                <option value="open_portal_tab">
                  {isAr ? 'الانتقال لقسم داخل البوابة' : 'Navigate to Portal Section'}
                </option>
                <option value="info_only">
                  {isAr ? 'عرض بطاقة معلومات وتحويل فقط' : 'Informational / Referral Modal Only'}
                </option>
                <option value="open_external_url">
                  {isAr ? 'فتح رابط HTTPS خارجي' : 'Open External HTTPS Link'}
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.admin.ads.ctaLabel} (AR)
              </label>
              <input
                type="text"
                maxLength={40}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {t.admin.ads.ctaLabel} (EN)
              </label>
              <input
                type="text"
                maxLength={40}
                value={ctaLabelEn}
                onChange={(e) => setCtaLabelEn(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                dir="ltr"
              />
            </div>
          </div>

          {(actionType === 'open_portal_tab' || actionType === 'open_external_url') && (
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
                {actionType === 'open_external_url'
                  ? isAr
                    ? 'الرابط الخارجي (HTTPS)'
                    : 'External HTTPS URL'
                  : isAr
                    ? 'معرّف التبويب المستهدف (مثل medicine_finder أو haneen_ai أو wholesaler)'
                    : 'Target Tab Key (e.g. medicine_finder, haneen_ai, wholesaler)'}
              </label>
              <input
                type="text"
                maxLength={300}
                value={destinationTarget}
                onChange={(e) => setDestinationTarget(e.target.value)}
                placeholder={
                  actionType === 'open_external_url' ? 'https://...' : 'medicine_finder'
                }
                dir="ltr"
                className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          )}

          {/* Optional Badges */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {isAr ? 'شارة مخصصة (عربي · اختياري)' : 'Custom Badge (AR · optional)'}
              </label>
              <input
                type="text"
                maxLength={60}
                value={badgeTextAr}
                onChange={(e) => setBadgeTextAr(e.target.value)}
                placeholder={isAr ? 'خصم خاص للشركاء' : 'Partner Offer'}
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                {isAr ? 'شارة مخصصة (إنجليزي · اختياري)' : 'Custom Badge (EN · optional)'}
              </label>
              <input
                type="text"
                maxLength={60}
                value={badgeTextEn}
                onChange={(e) => setBadgeTextEn(e.target.value)}
                placeholder="Featured Partner"
                dir="ltr"
                className="min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>

          {/* 6. Optional Description */}
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.admin.ads.descriptionLabel}
            </label>
            <textarea
              rows={2}
              maxLength={600}
              value={description}
              placeholder={t.admin.ads.descriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {/* 7. Date Range & Priority */}
          <div className="space-y-3 rounded-xl border border-slate-200 p-3.5 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={useDateRange}
                onChange={(e) => setUseDateRange(e.target.checked)}
                className="h-4 w-4 accent-[#0c3585]"
              />
              <span>{t.admin.ads.useDateRangeLabel}</span>
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {useDateRange && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.admin.ads.startDateLabel}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.admin.ads.endDateLabel}
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.admin.ads.priorityLabel}
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-latin text-xs text-slate-900 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 8. Ad Status (Published / Draft / Paused / Expired) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.admin.ads.statusLabel}:
            </span>
            {statusChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => setStatus(choice.value)}
                className={`min-h-[38px] rounded-xl border px-3.5 text-xs font-bold cursor-pointer ${
                  status === choice.value
                    ? choice.activeTone
                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#0c3585] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>

          {/* 9. Live 2:1 Ad Preview before Saving */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              {t.admin.ads.previewTitle}
            </p>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#050d24] text-white dark:border-slate-700">
              <div className="relative aspect-[2/1] w-full bg-[#050d24]">
                {(localPreviewUrl || imageUrl) && !previewBroken ? (
                  <img
                    src={localPreviewUrl || imageUrl}
                    alt={title || selectedEntity?.name || 'Ad preview'}
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewBroken(true)}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#061028] to-[#0c3585] text-xs text-slate-300">
                    {t.admin.ads.storageMissingBadge}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#040a1d] px-4 py-3">
                <div className="min-w-0 max-w-md space-y-0.5">
                  <p className="text-[11px] font-bold text-[#f4d378]">
                    {isAr ? currentCatMeta?.ar : currentCatMeta?.en}
                    {selectedEntity ? ` · ${selectedEntity.name}` : ''}
                  </p>
                  {title.trim() && (
                    <p className="truncate text-sm font-bold text-white">{title.trim()}</p>
                  )}
                  {description.trim() && (
                    <p className="line-clamp-1 text-xs text-slate-200">
                      {description.trim()}
                    </p>
                  )}
                  {selectedEntity?.location && (
                    <p className="flex items-center gap-1 text-[11px] text-slate-300">
                      <MapPin className="h-3 w-3 text-[#f4d378]" aria-hidden="true" />
                      <span>{selectedEntity.location}</span>
                    </p>
                  )}
                </div>
                <span className="medora-gold-button inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-[#040917]">
                  <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {isAr
                      ? ctaLabel.trim() || 'استعراض الآن'
                      : ctaLabelEn.trim() || ctaLabel.trim() || 'Explore Now'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}

          {/* 10. Submit Actions */}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              disabled={saving || uploading || !canPersistEntity || !storageValid}
              onClick={() => void persistAd('draft')}
              className="min-h-[42px] rounded-xl border border-[#0c3585] bg-white px-4 text-xs font-bold text-[#0c3585] hover:bg-[#0c3585]/5 disabled:opacity-50 dark:border-[#f4d378]/60 dark:bg-slate-900 dark:text-[#f4d378] cursor-pointer"
            >
              {t.admin.ads.saveDraftBtn}
            </button>
            <button
              type="submit"
              disabled={saving || uploading || !canPersistEntity || !storageValid}
              className="medora-gold-button min-h-[42px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {saving
                ? '...'
                : editingAd
                  ? t.admin.ads.saveChangesBtn
                  : status === 'published'
                    ? t.admin.ads.saveBtn
                    : t.admin.ads.saveChangesBtn}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ReviewModerationModal({
  firebaseUser,
  t,
  language,
  review,
  onClose,
  onSaved,
}: {
  firebaseUser: User;
  t: MedoraCopy;
  language: Language;
  review: DoctorReviewRecord;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [note, setNote] = useState(review.moderationNote || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: 'approved' | 'rejected') => {
    setSubmitting(true);
    setError(null);
    try {
      await moderateAdminReview(firebaseUser, review.reviewId, {
        status,
        moderationNote: note.trim(),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            {t.admin.nav.reviews}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
            <div>
              <p className="text-slate-500">{t.admin.reviews.doctorLabel}</p>
              <p className="mt-0.5 font-bold text-slate-900 dark:text-white">
                {review.doctorName}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.reviews.patientLabel}</p>
              <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                {review.patientName}
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.reviews.ratingLabel}</p>
              <p className="mt-0.5 flex items-center gap-1 font-latin font-bold text-[#b68023] dark:text-[#f4d378]">
                <Star className="h-3.5 w-3.5 fill-current" />
                {review.rating} / 5
              </p>
            </div>
            <div>
              <p className="text-slate-500">{t.admin.auditLogs.timestamp}</p>
              <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                {formatIsoDate(review.createdAt, language)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3.5 text-sm text-slate-800 dark:border-slate-800 dark:text-slate-200">
            {review.comment}
          </div>

          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">
              {t.admin.reviews.moderationNoteLabel}
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decide('rejected')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            >
              <XCircle className="h-4 w-4" />
              <span>{t.admin.reviews.rejectBtn}</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void decide('approved')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{t.admin.reviews.approveBtn}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedbackDetailModal({
  firebaseUser,
  t,
  language,
  item,
  onClose,
  onSaved,
}: {
  firebaseUser: User;
  t: MedoraCopy;
  language: Language;
  item: PatientFeedbackRecord;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<PatientFeedbackStatus>(item.status);
  const [reply, setReply] = useState(item.adminReply || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await updateAdminFeedback(firebaseUser, item.feedbackId, {
        status,
        adminReply: reply.trim(),
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.admin.errorLoading);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSave(e)}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <p className="text-[11px] font-semibold text-[#b68023] dark:text-[#f4d378]">
              {item.patientName} · {formatIsoDate(item.createdAt, language)}
            </p>
            <h2 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
              {item.subject}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
            {item.message}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.admin.messages.status}
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PatientFeedbackStatus)}
              className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="new">{t.admin.feedback.statuses.new}</option>
              <option value="in_review">{t.admin.feedback.statuses.in_review}</option>
              <option value="resolved">{t.admin.feedback.statuses.resolved}</option>
              <option value="closed">{t.admin.feedback.statuses.closed}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.admin.feedback.replyLabel}
            </label>
            <textarea
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>

          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-slate-300 px-4 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="medora-gold-button min-h-[40px] rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {saving ? '...' : t.admin.feedback.saveBtn}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
