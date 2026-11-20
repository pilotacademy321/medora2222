import { useState } from 'react';
import { motion } from 'motion/react';
import { Edit3, FileText } from 'lucide-react';
import { useMedora } from '../contexts/MedoraContext';
import { submitPortalRegistration } from '../services/medoraFirestore';
import type {
  PortalFormPayload,
  RegistrationRequest,
  UploadedDocMeta,
} from '../types/medora';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';

interface ReviewAndSubmitViewProps {
  payload: PortalFormPayload;
  onEditPersonal: () => void;
  onEditPortal: () => void;
  onBackToPortals?: () => void;
  onSubmitted: (req: RegistrationRequest) => void;
  onOpenRequests: () => void;
}

export function ReviewAndSubmitView({
  payload,
  onEditPersonal,
  onEditPortal,
  onBackToPortals,
  onSubmitted,
  onOpenRequests,
}: ReviewAndSubmitViewProps) {
  const { language, t, userAccount, requests, refreshRequests } = useMedora();
  const [termsConfirmed, setTermsConfirmed] = useState(
    payload.portal === 'patient' ? payload.data.acceptedPolicy : false,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!userAccount) return null;

  const existingForPortal = requests.find(
    (r) => r.portalType === payload.portal,
  );

  const attachedDocs: UploadedDocMeta[] =
    payload.portal === 'doctor'
      ? payload.data.verificationDocuments
      : payload.portal === 'lab' ||
          payload.portal === 'pharmacy' ||
          payload.portal === 'wholesaler'
        ? payload.data.licenseDocuments
        : [];

  const renderPortalRows = (): { label: string; value: string }[] => {
    if (payload.portal === 'patient') {
      return [
        {
          label: t.forms.patient.emergencyName,
          value: payload.data.emergencyContactName || '—',
        },
        {
          label: t.forms.patient.emergencyPhone,
          value: payload.data.emergencyContactPhone || '—',
        },
        {
          label: t.forms.patient.emergencyRelation,
          value: payload.data.emergencyContactRelation || '—',
        },
      ];
    }

    if (payload.portal === 'doctor') {
      return [
        {
          label: t.forms.doctor.professionalPhone,
          value: payload.data.professionalPhone,
        },
        { label: t.forms.doctor.email, value: payload.data.email },
        { label: t.forms.doctor.degree, value: payload.data.degree },
        { label: t.forms.doctor.university, value: payload.data.university },
        { label: t.forms.doctor.specialty, value: payload.data.specialty },
        {
          label: t.forms.doctor.subSpecialty,
          value: payload.data.subSpecialty || '—',
        },
        {
          label: t.forms.doctor.experienceYears,
          value: `${payload.data.experienceYears} ${t.common.years}`,
        },
        {
          label: t.forms.doctor.languages,
          value: payload.data.languages.join(' · ') || '—',
        },
        { label: t.forms.doctor.clinicName, value: payload.data.clinicName },
        { label: t.forms.doctor.workAddress, value: payload.data.workAddress },
        {
          label: t.forms.doctor.workDaysAndHours,
          value: payload.data.workDaysAndHours,
        },
        {
          label: t.forms.doctor.consultationDuration,
          value: `${payload.data.consultationDurationMinutes} ${t.common.minutes}`,
        },
        {
          label: t.forms.doctor.consultationFee,
          value: `${payload.data.consultationFee.toLocaleString()} ${t.common.iqd}`,
        },
        {
          label: t.forms.doctor.hourlyLimit,
          value: `${payload.data.hourlyAppointmentLimit} ${t.common.perHour}`,
        },
        {
          label: t.forms.doctor.bookingMode,
          value:
            payload.data.bookingConfirmationMode === 'auto'
              ? t.common.auto
              : t.common.manual,
        },
        {
          label: t.forms.doctor.licenseNumber,
          value: payload.data.licenseNumber,
        },
        {
          label: t.forms.doctor.licensingAuthority,
          value: payload.data.licensingAuthority,
        },
      ];
    }

    if (payload.portal === 'lab') {
      return [
        {
          label: t.forms.lab.professionalPhone,
          value: payload.data.professionalPhone,
        },
        { label: t.forms.lab.labNameAr, value: payload.data.labNameAr },
        { label: t.forms.lab.labNameEn, value: payload.data.labNameEn },
        { label: t.forms.lab.directorName, value: payload.data.directorName },
        {
          label: t.forms.lab.technicalDirectorName,
          value: payload.data.technicalDirectorName,
        },
        {
          label: `${t.forms.lab.governorate} / ${t.forms.lab.district}`,
          value: `${payload.data.governorate} — ${payload.data.district}`,
        },
        { label: t.forms.lab.address, value: payload.data.address },
        {
          label: t.forms.lab.mapLocation,
          value: payload.data.mapLocationUrl || '—',
        },
        { label: t.forms.lab.licenseNumber, value: payload.data.licenseNumber },
        {
          label: t.forms.lab.licensingAuthority,
          value: payload.data.licensingAuthority,
        },
        {
          label: t.forms.lab.services,
          value: payload.data.labServices.join(', '),
        },
        {
          label: t.forms.lab.workDaysAndHours,
          value: payload.data.workDaysAndHours,
        },
        {
          label: t.forms.lab.hourlyLimit,
          value: `${payload.data.hourlyBookingLimit} ${t.common.perHour}`,
        },
        {
          label: t.forms.lab.bookingMode,
          value:
            payload.data.bookingConfirmationMode === 'auto'
              ? t.common.auto
              : t.common.manual,
        },
      ];
    }

    if (payload.portal === 'pharmacy') {
      return [
        { label: t.forms.pharmacy.pharmacyNameAr, value: payload.data.pharmacyNameAr },
        { label: t.forms.pharmacy.pharmacyNameEn, value: payload.data.pharmacyNameEn },
        { label: t.forms.pharmacy.ownerFullName, value: payload.data.ownerFullName },
        {
          label: t.forms.pharmacy.responsiblePharmacistName,
          value: payload.data.responsiblePharmacistName,
        },
        {
          label: t.forms.pharmacy.pharmacistSyndicateNumber,
          value: payload.data.pharmacistSyndicateNumber,
        },
        {
          label: t.forms.pharmacy.pharmacyLicenseNumber,
          value: payload.data.pharmacyLicenseNumber,
        },
        {
          label: t.forms.pharmacy.licensingAuthority,
          value: payload.data.licensingAuthority,
        },
        {
          label: t.forms.pharmacy.professionalPhone,
          value: payload.data.professionalPhone,
        },
        {
          label: `${t.forms.pharmacy.governorate} / ${t.forms.pharmacy.district}`,
          value: `${payload.data.governorate} — ${payload.data.district}`,
        },
        { label: t.forms.pharmacy.address, value: payload.data.address },
        {
          label: t.forms.pharmacy.workingDaysAndHours,
          value: payload.data.workingDaysAndHours,
        },
        {
          label: t.forms.pharmacy.deliveryAvailable,
          value: payload.data.deliveryAvailable
            ? language === 'ar'
              ? 'مفعّل'
              : 'Enabled'
            : language === 'ar'
              ? 'غير مفعّل'
              : 'Disabled',
        },
      ];
    }

    if (payload.portal === 'wholesaler') {
      return [
        { label: t.forms.wholesaler.wholesalerNameAr, value: payload.data.wholesalerNameAr },
        { label: t.forms.wholesaler.wholesalerNameEn, value: payload.data.wholesalerNameEn },
        { label: t.forms.wholesaler.ownerFullName, value: payload.data.ownerFullName },
        { label: t.forms.wholesaler.legalEntityName, value: payload.data.legalEntityName },
        {
          label: t.forms.wholesaler.warehouseLicenseNumber,
          value: payload.data.warehouseLicenseNumber,
        },
        {
          label: t.forms.wholesaler.licensingAuthority,
          value: payload.data.licensingAuthority,
        },
        {
          label: t.forms.wholesaler.professionalPhone,
          value: payload.data.professionalPhone,
        },
        {
          label: `${t.forms.wholesaler.governorate} / ${t.forms.wholesaler.district}`,
          value: `${payload.data.governorate} — ${payload.data.district}`,
        },
        { label: t.forms.wholesaler.warehouseAddress, value: payload.data.warehouseAddress },
        {
          label: t.forms.wholesaler.workingDaysAndHours,
          value: payload.data.workingDaysAndHours,
        },
        {
          label: t.forms.wholesaler.minimumOrderIqd,
          value: `${payload.data.minimumOrderIqd.toLocaleString()} ${t.common.iqd}`,
        },
      ];
    }

    return [
      { label: t.forms.secretary.phone, value: payload.data.phone },
      {
        label: t.forms.secretary.educationQualification,
        value: payload.data.educationQualification,
      },
      {
        label: t.forms.secretary.previousExperience,
        value: payload.data.previousExperience || '—',
      },
      {
        label: language === 'ar' ? 'نبذة مهنية موجزة' : 'Professional Bio',
        value: payload.data.bio || '—',
      },
    ];
  };

  const handleConfirmSubmit = async () => {
    setError(null);
    if (!termsConfirmed) {
      setError(
        language === 'ar'
          ? 'يرجى تأكيد الموافقة على الشروط قبل الإرسال.'
          : 'Please confirm the terms before submitting.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const savedRequest = await submitPortalRegistration({
        user: userAccount,
        payload,
        existingRequest: existingForPortal,
      });
      await refreshRequests(userAccount.uid);
      onSubmitted(savedRequest);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      let parsedCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      let parsedPath = '';
      let parsedOp = '';

      if (rawMessage.startsWith('{')) {
        try {
          const parsed = JSON.parse(rawMessage) as {
            errorCode?: string;
            error?: string;
            path?: string;
            operationType?: string;
          };
          parsedCode = parsed.errorCode || parsedCode;
          parsedPath = parsed.path || '';
          parsedOp = parsed.operationType || '';
          if (!parsedCode && parsed.error) {
            if (parsed.error.includes('Missing or insufficient permissions')) {
              parsedCode = 'permission-denied';
            } else if (parsed.error.toLowerCase().includes('offline')) {
              parsedCode = 'unavailable';
            }
          }
        } catch {
          // Non-JSON error message
        }
      }

      console.error('MEDORA registration submission failed:', {
        code: parsedCode || rawMessage,
        operationType: parsedOp || undefined,
        path: parsedPath || undefined,
      });

      if (rawMessage === 'DUPLICATE_ACTIVE_REQUEST') {
        setError(t.review.duplicateError);
      } else if (rawMessage === 'UNAUTHENTICATED') {
        setError(
          language === 'ar'
            ? 'انتهت جلسة تسجيل الدخول. يرجى إعادة تسجيل الدخول بحساب Google ثم المحاولة مجدداً.'
            : 'Authentication session expired. Please sign in with Google again.',
        );
      } else if (rawMessage === 'EMAIL_UNVERIFIED') {
        setError(
          language === 'ar'
            ? 'بريد حساب Google غير موثق في Firebase Authentication. يرجى استخدام حساب Google موثق.'
            : 'Your Google account email is not verified in Firebase Authentication.',
        );
      } else if (rawMessage === 'INCOMPLETE_PERSONAL_PROFILE') {
        setError(
          language === 'ar'
            ? 'يرجى إكمال البيانات الشخصية الأساسية (الاسم، تاريخ الميلاد، المحافظة، القضاء، والعنوان) قبل إرسال الطلب.'
            : 'Please complete your required personal information (full name, date of birth, governorate, district, and address) before submitting.',
        );
      } else if (rawMessage === 'INCOMPLETE_PORTAL_FIELDS') {
        setError(
          language === 'ar'
            ? 'بعض الحقول الإلزامية في استمارة البوابة غير مكتملة. تم الحفاظ على بياناتك، يرجى العودة للتعديل وإكمالها.'
            : 'Some required fields in the portal form are missing. Your draft is preserved; please return to edit and complete them.',
        );
      } else if (parsedCode === 'permission-denied') {
        setError(
          language === 'ar'
            ? 'تعذر حفظ الطلب بسبب رفض الصلاحيات من قواعد الأمان (permission-denied). تأكد من توثيق حساب Google واكتمال الحقول المطلوبة.'
            : 'Firestore rejected the request due to permissions (permission-denied). Please verify your signed-in account and required fields.',
        );
      } else if (parsedCode === 'unavailable') {
        setError(
          language === 'ar'
            ? 'خدمة قاعدة البيانات غير متاحة مؤقتاً أو الاتصال منقطع (unavailable). يرجى التحقق من الإنترنت والمحاولة مرة أخرى.'
            : 'Database service is temporarily unavailable (unavailable). Please check your connection and try again.',
        );
      } else if (parsedCode === 'invalid-argument') {
        setError(
          language === 'ar'
            ? 'بعض القيم المدخلة غير صالحة للحفظ (invalid-argument). يرجى مراجعة الأرقام والحقول النصية ثم المحاولة مجدداً.'
            : 'Some entered values are invalid for storage (invalid-argument). Please review your entries and retry.',
        );
      } else {
        const suffix = parsedCode ? ` (${parsedCode})` : '';
        setError(
          language === 'ar'
            ? `تعذر حفظ طلب التسجيل في Firestore${suffix}. راجع وحدة التحكم للمزيد من التفاصيل وحاول مجدداً.`
            : `Failed to save registration request in Firestore${suffix}. Check console details and retry.`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4 }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar
        showRequestsAction
        onBackToPortals={onBackToPortals}
        onOpenRequests={onOpenRequests}
      />

      <main className="relative z-10 mx-auto my-8 w-full max-w-4xl">
        <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 shadow-xl backdrop-blur-xl dark:border-[#d9a43b]/20 dark:bg-[#07122a]/90 sm:p-8">
          <div className="border-b border-slate-200 pb-5 dark:border-slate-800">
            <p className="text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
              {t.review.stepLabel}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t.review.title}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t.review.subtitle}
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
            >
              {error}
            </div>
          )}

          {/* Section 1: Personal Info */}
          <div className="mt-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.review.personalSection}
              </h2>
              <button
                type="button"
                onClick={onEditPersonal}
                className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.common.edit}</span>
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">{t.personal.fullName}</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {userAccount.fullName}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t.personal.dateOfBirth}</dt>
                <dd className="font-latin font-medium text-slate-900 tabular-nums dark:text-white" dir="ltr">
                  {userAccount.dateOfBirth} ({userAccount.age} {t.common.years})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">{t.personal.gender}</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {userAccount.gender === 'female'
                    ? t.common.female
                    : t.common.male}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">
                  {t.personal.governorate} / {t.personal.district}
                </dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {userAccount.governorate} — {userAccount.district}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">{t.personal.address}</dt>
                <dd className="font-medium text-slate-900 dark:text-white">
                  {userAccount.address}
                </dd>
              </div>
            </dl>
          </div>

          {/* Section 2: Portal Info */}
          <div className="mt-5 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.review.portalSection} ·{' '}
                <span className="text-[#0c3585] dark:text-[#f4d378]">
                  {t.portals.items[payload.portal].title}
                </span>
              </h2>
              <button
                type="button"
                onClick={onEditPortal}
                className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.common.edit}</span>
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {renderPortalRows().map((row, i) => (
                <div key={i}>
                  <dt className="text-xs text-slate-500">{row.label}</dt>
                  <dd className="font-medium text-slate-900 dark:text-white break-words">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Section 3: Documents */}
          {(payload.portal === 'doctor' ||
            payload.portal === 'lab' ||
            payload.portal === 'pharmacy' ||
            payload.portal === 'wholesaler') && (
            <div className="mt-5 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {t.review.documentsSection}
              </h2>
              {attachedDocs.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  {t.review.noDocuments}
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {attachedDocs.map((docItem, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <FileText className="h-4 w-4 text-[#d9a43b]" aria-hidden="true" />
                      <span>{docItem.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Final Terms Consent */}
          <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={termsConfirmed}
              onChange={(e) => setTermsConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-400 accent-[#d9a43b]"
            />
            <span>{t.review.termsConfirm}</span>
          </label>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
            <button
              type="button"
              onClick={onEditPortal}
              disabled={submitting}
              className="min-h-[46px] rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t.common.back}
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleConfirmSubmit()}
              className="medora-gold-button min-h-[48px] rounded-xl px-8 py-3 text-sm font-bold text-[#040917] transition-all disabled:opacity-60 cursor-pointer"
            >
              {submitting ? t.review.submitting : t.common.submitRequest}
            </button>
          </div>
        </div>
      </main>
    </motion.section>
  );
}
