import { useEffect, useMemo, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  CheckCircle2,
  Loader2,
  Phone,
  ShieldCheck,
  Smartphone,
  Unlink,
} from 'lucide-react';
import {
  checkIraqiPhoneAvailability,
  fetchPhoneLinkStatus,
  linkIraqiPhoneOnServer,
  mapPhoneLinkErrorMessage,
  unlinkIraqiPhoneOnServer,
} from '../../services/phoneService';
import type { PhoneStatusResponse } from '../../types/notifications';
import {
  getIraqiOperatorLabel,
  getIraqiPhoneValidationMessage,
  parseAndNormalizeIraqiPhone,
} from '../../utils/iraqiPhone';

interface IraqiPhoneVerificationCardProps {
  firebaseUser: User;
  language: 'ar' | 'en';
  currentPhone: string;
  compact?: boolean;
  onPhoneVerified?: (e164Phone: string) => void;
  onPhoneUnlinked?: () => void;
}

export function IraqiPhoneVerificationCard({
  firebaseUser,
  language,
  currentPhone,
  compact = false,
  onPhoneVerified,
  onPhoneUnlinked,
}: IraqiPhoneVerificationCardProps) {
  const isAr = language === 'ar';

  const [phoneInput, setPhoneInput] = useState(currentPhone || '');
  const [statusData, setStatusData] = useState<PhoneStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (currentPhone && !phoneInput) {
      setPhoneInput(currentPhone);
    }
  }, [currentPhone, phoneInput]);

  useEffect(() => {
    let active = true;
    setLoadingStatus(true);
    fetchPhoneLinkStatus(firebaseUser)
      .then((res) => {
        if (!active) return;
        setStatusData(res);
        if (res.phoneE164 && !phoneInput) {
          setPhoneInput(res.phoneE164);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingStatus(false);
      });
    return () => {
      active = false;
    };
  }, [firebaseUser]);

  const parsedPreview = useMemo(
    () => parseAndNormalizeIraqiPhone(phoneInput),
    [phoneInput],
  );

  const handleSavePhone = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!parsedPreview.ok) {
      setErrorMsg(getIraqiPhoneValidationMessage(parsedPreview.errorCode, language));
      return;
    }

    setBusy(true);
    try {
      const avail = await checkIraqiPhoneAvailability(firebaseUser, parsedPreview.e164);
      if (!avail.valid) {
        setErrorMsg(
          mapPhoneLinkErrorMessage(avail.error || 'INVALID_IRAQI_PHONE', language),
        );
        return;
      }
      if (!avail.available && !avail.ownedByCurrentUser) {
        setErrorMsg(
          mapPhoneLinkErrorMessage(avail.error || 'PHONE_ALREADY_REGISTERED', language),
        );
        return;
      }

      const saved = await linkIraqiPhoneOnServer(firebaseUser, parsedPreview.e164);
      if (!saved.ok) {
        setErrorMsg(mapPhoneLinkErrorMessage(saved.error || 'PHONE_LINK_FAILED', language));
        return;
      }

      const refreshed = await fetchPhoneLinkStatus(firebaseUser);
      setStatusData(refreshed);
      setPhoneInput(saved.phoneE164 || parsedPreview.e164);
      setSuccessMsg(
        isAr
          ? 'تم ربط رقم الهاتف العراقي (+964) بحسابك في Google بنجاح لإشعارات واتساب والتواصل.'
          : 'Iraqi phone (+964) linked to your Google account for WhatsApp notifications and clinic contact.',
      );
      if (onPhoneVerified) {
        onPhoneVerified(saved.phoneE164 || parsedPreview.e164);
      }
    } catch (err) {
      setErrorMsg(
        mapPhoneLinkErrorMessage(
          err instanceof Error ? err.message : 'PHONE_LINK_FAILED',
          language,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      const res = await unlinkIraqiPhoneOnServer(firebaseUser);
      if (!res.ok) {
        setErrorMsg(
          mapPhoneLinkErrorMessage(res.error || 'PHONE_UNLINK_FAILED', language),
        );
        return;
      }
      const refreshed = await fetchPhoneLinkStatus(firebaseUser);
      setStatusData(refreshed);
      setPhoneInput('');
      setSuccessMsg(
        isAr
          ? 'تم إلغاء ربط رقم الهاتف العراقي من حسابك وتفعيل الإشعارات داخل المنصة تلقائياً.'
          : 'Iraqi phone unlinked; notifications switched back to MEDORA In-App.',
      );
      if (onPhoneUnlinked) onPhoneUnlinked();
    } catch (err) {
      setErrorMsg(
        mapPhoneLinkErrorMessage(
          err instanceof Error ? err.message : 'PHONE_UNLINK_FAILED',
          language,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const isLinkedSameNumber =
    Boolean(statusData?.linked) &&
    parsedPreview.ok &&
    statusData?.phoneE164 === parsedPreview.e164;

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/60 ${
        compact ? 'p-4' : 'p-5'
      } space-y-3`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {isAr
              ? 'ربط رقم الهاتف العراقي (+964) لإشعارات واتساب'
              : 'Iraqi Phone Number (+964) for WhatsApp Alerts'}
          </h3>
        </div>

        {loadingStatus ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : statusData?.linked ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              {statusData.verificationMethod === 'legacy_verified'
                ? isAr
                  ? 'مرتبط ومحفوظ مسبقاً'
                  : 'Previously Verified & Linked'
                : isAr
                  ? 'مرتبط بحساب Google'
                  : 'Linked to Google Account'}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            {isAr ? 'غير مرتبط بعد' : 'Not Linked'}
          </span>
        )}
      </div>

      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        {isAr
          ? 'يتم التسجيل والدخول في منصة MEDORA حصراً عبر حساب Google دون الحاجة إلى SMS. يمكنك ربط رقمك العراقي (+964) هنا لاستلام إشعارات واتساب عند تفعيلها.'
          : 'MEDORA accounts sign in exclusively via Google without SMS. Link your Iraqi (+964) phone here if you choose to receive WhatsApp notifications.'}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            dir="ltr"
            value={phoneInput}
            onChange={(e) => {
              setPhoneInput(e.target.value);
              setErrorMsg(null);
            }}
            placeholder="0770 123 4567 / +9647701234567"
            className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 font-latin text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>

        <button
          type="button"
          disabled={busy || !phoneInput.trim() || isLinkedSameNumber}
          onClick={() => void handleSavePhone()}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-[#0c3585] px-4 text-xs font-bold text-white hover:bg-[#0a2c6e] disabled:opacity-50 cursor-pointer"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span>
            {statusData?.linked
              ? isAr
                ? 'تحديث الرقم'
                : 'Update Phone'
              : isAr
                ? 'ربط الرقم العراقي'
                : 'Link Iraqi Phone'}
          </span>
        </button>

        {statusData?.linked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleUnlink()}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
          >
            <Unlink className="h-3.5 w-3.5" />
            <span>{isAr ? 'إلغاء الربط' : 'Unlink'}</span>
          </button>
        )}
      </div>

      {parsedPreview.ok && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="font-latin font-bold text-[#0c3585] dark:text-[#f4d378]" dir="ltr">
            E.164: {parsedPreview.e164}
          </span>
          <span>·</span>
          <span>
            {isAr ? 'المشغل:' : 'Carrier:'}{' '}
            <strong>{getIraqiOperatorLabel(parsedPreview.operator, language)}</strong>
          </span>
        </div>
      )}

      {errorMsg && (
        <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          {errorMsg}
        </p>
      )}

      {successMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
}
