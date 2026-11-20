import { useEffect, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from '../../services/notificationService';
import type {
  NotificationChannel,
  NotificationRecipientRole,
  UserNotificationChannelPreferences,
} from '../../types/notifications';

export const IN_APP_MANDATORY_WARNING_AR =
  '⚠ تنبيه مهم: عند اختيار الإشعارات داخل منصة MEDORA، ستصلك إشعاراتك داخل المنصة فقط. يجب فتح المنصة وتسجيل الدخول للاطلاع عليها. لن تصلك تنبيهات خارج المنصة.';

export const IN_APP_MANDATORY_WARNING_EN =
  'Important Notice: When selecting MEDORA In-App Notifications, alerts will only arrive inside the MEDORA platform. You must open MEDORA and sign in to view them. No external notifications will be sent.';

interface NotificationChannelCardProps {
  firebaseUser: User;
  role: NotificationRecipientRole;
  language: 'ar' | 'en';
  compact?: boolean;
  linkedPhoneOverride?: string;
  onChannelUpdated?: (prefs: UserNotificationChannelPreferences) => void;
}

export function NotificationChannelCard({
  firebaseUser,
  role,
  language,
  compact = false,
  linkedPhoneOverride,
  onChannelUpdated,
}: NotificationChannelCardProps) {
  const isAr = language === 'ar';

  const [prefs, setPrefs] = useState<UserNotificationChannelPreferences | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannel>('in_app');
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const loadPrefs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchNotificationPreferences(firebaseUser, role);
      setPrefs(data);
      setSelectedChannel(data.preferredChannel);
      setWhatsappConsent(data.whatsappConsent);
    } catch {
      setErrorMsg(
        isAr
          ? 'تعذر تحميل تفضيلات قناة الإشعارات.'
          : 'Could not load notification channel preferences.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrefs();
  }, [firebaseUser, role, linkedPhoneOverride]);

  const hasPhone = Boolean(prefs?.hasLinkedPhone || linkedPhoneOverride?.trim());
  const displayPhone = prefs?.linkedPhoneMasked || linkedPhoneOverride || '';

  const handleSaveChannel = async (
    nextChannel: NotificationChannel,
    nextConsent: boolean,
  ) => {
    setErrorMsg(null);
    setSavedMsg(null);

    if (nextChannel === 'whatsapp') {
      if (!hasPhone) {
        setErrorMsg(
          isAr
            ? 'يرجى ربط رقم هاتف عراقي (+964) أولاً قبل تفعيل قناة واتساب.'
            : 'Please link an Iraqi (+964) phone number first before selecting WhatsApp.',
        );
        return;
      }
      if (!nextConsent) {
        setErrorMsg(
          isAr
            ? 'يتطلب اختيار واتساب تفعيل مربع الموافقة الصريحة على استلام إشعارات واتساب.'
            : 'Explicit user consent is required to activate WhatsApp notifications.',
        );
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateNotificationPreferences(firebaseUser, {
        preferredChannel: nextChannel,
        whatsappConsent: nextConsent,
        locale: language,
        role,
      });
      setPrefs(updated);
      setSelectedChannel(updated.preferredChannel);
      setWhatsappConsent(updated.whatsappConsent);
      setSavedMsg(
        updated.preferredChannel === 'whatsapp'
          ? isAr
            ? 'تم اعتماد قناة واتساب (وضع المحاكاة الآمن) كقناة الإشعارات الوحيدة لحسابك.'
            : 'WhatsApp (Safe Simulation Mode) is now your sole active notification channel.'
          : isAr
            ? 'تم اعتماد إشعارات داخل منصة MEDORA كقناة الإشعارات الوحيدة لحسابك.'
            : 'MEDORA In-App is now your sole active notification channel.',
      );
      if (onChannelUpdated) onChannelUpdated(updated);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'WHATSAPP_CONSENT_REQUIRED') {
        setErrorMsg(
          isAr
            ? 'يجب تأكيد الموافقة الصريحة لتفعيل إشعارات واتساب.'
            : 'Explicit opt-in consent is required for WhatsApp.',
        );
      } else if (code === 'VALID_IRAQI_PHONE_REQUIRED_FOR_WHATSAPP') {
        setErrorMsg(
          isAr
            ? 'يلزم وجود رقم هاتف عراقي صحيح (+964) مرتبط بحسابك لتفعيل قناة واتساب.'
            : 'A valid linked Iraqi (+964) phone number is required for WhatsApp.',
        );
      } else {
        setErrorMsg(
          isAr ? 'تعذر حفظ قناة الإشعارات.' : 'Failed to save notification channel.',
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#07122a] ${
        compact ? 'p-4' : 'p-5'
      } space-y-4`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-[#0c3585] dark:text-[#f4d378]" />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr
                ? 'قناة استلام الإشعارات (قناتان فقط — يمكن التبديل بأي وقت)'
                : 'Notification Delivery Channel (Two-Channel Policy)'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr
                ? 'يُرسل كل إشعار عبر قناة واحدة فقط حسب اختيارك النشط دون تكرار أو إرسال SMS.'
                : 'Each alert is sent strictly via your chosen channel only (zero dual-send, zero SMS).'}
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1 rounded-lg border border-[#d9a43b]/40 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-[#916314] dark:bg-amber-950/30 dark:text-[#f4d378]">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>
            {selectedChannel === 'whatsapp'
              ? isAr
                ? 'النشط: WhatsApp (محاكاة)'
                : 'Active: WhatsApp (Simulation)'
              : isAr
                ? 'النشط: داخل منصة MEDORA'
                : 'Active: MEDORA In-App'}
          </span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{isAr ? 'جاري تحميل إعدادات القنوات...' : 'Loading channels...'}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* Channel 1: MEDORA In-App */}
            <button
              type="button"
              onClick={() => {
                setSelectedChannel('in_app');
                setErrorMsg(null);
              }}
              className={`rounded-2xl border p-4 text-start transition-colors cursor-pointer ${
                selectedChannel === 'in_app'
                  ? 'border-[#0c3585] bg-[#0c3585]/5 dark:border-[#f4d378] dark:bg-[#0c3585]/20'
                  : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-[#0c3585] dark:text-[#f4d378]" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAr ? 'إشعارات داخل منصة MEDORA' : 'MEDORA In-App Notifications'}
                  </span>
                </div>
                <span
                  className={`h-3.5 w-3.5 rounded-full border-2 ${
                    selectedChannel === 'in_app'
                      ? 'border-[#0c3585] bg-[#0c3585] dark:border-[#f4d378] dark:bg-[#f4d378]'
                      : 'border-slate-400'
                  }`}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'تُحفظ الإشعارات داخل حسابك مع إشارة غير مقروءة فور تسجيل الدخول.'
                  : 'Alerts are stored directly inside your account with unread badges on login.'}
              </p>
            </button>

            {/* Channel 2: WhatsApp (Simulation Mode) */}
            <button
              type="button"
              onClick={() => {
                setSelectedChannel('whatsapp');
                setErrorMsg(null);
              }}
              className={`rounded-2xl border p-4 text-start transition-colors cursor-pointer ${
                selectedChannel === 'whatsapp'
                  ? 'border-emerald-600 bg-emerald-50/70 dark:border-emerald-500 dark:bg-emerald-950/25'
                  : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAr ? 'إشعارات عبر WhatsApp' : 'WhatsApp Notifications'}
                  </span>
                </div>
                <span
                  className={`h-3.5 w-3.5 rounded-full border-2 ${
                    selectedChannel === 'whatsapp'
                      ? 'border-emerald-600 bg-emerald-600'
                      : 'border-slate-400'
                  }`}
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {isAr
                  ? 'عبر حساب MEDORA التجاري الرسمي (حالياً في وضع المحاكاة الآمن دون إرسال خارجي فعلي أو كشف أي بيانات طبية).'
                  : 'Via official MEDORA WhatsApp Business (currently in safe simulation mode with zero external sending or medical details).'}
              </p>
              {displayPhone && (
                <p className="mt-1.5 font-latin text-[11px] font-bold text-emerald-700 dark:text-emerald-300" dir="ltr">
                  {displayPhone}
                </p>
              )}
            </button>
          </div>

          {/* Mandatory Arabic Warning when In-App Channel is selected */}
          {selectedChannel === 'in_app' && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs font-bold leading-relaxed text-amber-900 dark:border-amber-700/70 dark:bg-amber-950/35 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                {isAr ? IN_APP_MANDATORY_WARNING_AR : IN_APP_MANDATORY_WARNING_EN}
              </span>
            </div>
          )}

          {/* WhatsApp Explicit Consent & Iraqi Phone Check */}
          {selectedChannel === 'whatsapp' && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-800/70 dark:bg-emerald-950/20">
              {!hasPhone && (
                <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                  {isAr
                    ? 'تنبيه: يجب ربط رقم هاتف عراقي صحيح (+964) أولاً من إعدادات الحساب لتفعيل قناة واتساب.'
                    : 'A linked Iraqi (+964) phone number is required before activating WhatsApp.'}
                </p>
              )}
              <label className="flex items-start gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={whatsappConsent}
                  onChange={(e) => setWhatsappConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-emerald-600"
                />
                <span>
                  {isAr
                    ? 'أوافق صراحةً على استلام إشعارات منصة MEDORA (بدون تفاصيل طبية حساسة) عبر رقمي العراقي المرتبط في واتساب، مع علمي بإمكانية التبديل إلى الإشعارات داخل المنصة في أي وقت.'
                    : 'I explicitly opt in to receive privacy-safe MEDORA alerts on my linked Iraqi WhatsApp number, and understand I can switch back to In-App anytime.'}
                </span>
              </label>
            </div>
          )}

          {errorMsg && (
            <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              {errorMsg}
            </p>
          )}

          {savedMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{savedMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveChannel(selectedChannel, whatsappConsent)}
              className="medora-gold-button inline-flex min-h-[40px] items-center gap-2 rounded-xl px-5 text-xs font-bold text-[#040917] disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>
                {isAr ? 'حفظ قناة الإشعارات المختارة' : 'Save Notification Channel'}
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
