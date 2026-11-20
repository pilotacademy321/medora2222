import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, LogOut, RefreshCw, ShieldOff } from 'lucide-react';
import { MEDORA_LOGO_URL } from '../constants/brand';
import {
  IMAGING_PORTAL_DISABLED_MESSAGE_AR,
  IMAGING_PORTAL_DISABLED_MESSAGE_EN,
} from '../config/featureFlags';
import { useMedora } from '../contexts/MedoraContext';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';

interface ImagingPortalDisabledViewProps {
  onBackToHome: () => void;
  accountBlocked?: boolean;
  onContinueAllowedPortal?: () => void;
}

export function ImagingPortalDisabledView({
  onBackToHome,
  accountBlocked = false,
  onContinueAllowedPortal,
}: ImagingPortalDisabledViewProps) {
  const {
    language,
    firebaseUser,
    hasOtherAllowedPortal,
    switchGoogleAccount,
    logout,
    authActionPending,
  } = useMedora();

  const ForwardIcon = language === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />
      <MedoraUtilityBar onBackToPortals={onBackToHome} />

      <main className="relative z-10 mx-auto my-auto w-full max-w-xl py-8">
        <div className="rounded-3xl border border-[#d9a43b]/35 bg-white/95 p-7 text-center shadow-[0_24px_70px_-22px_rgba(10,42,117,0.28)] backdrop-blur-xl dark:border-[#d9a43b]/30 dark:bg-[#07122a]/92 sm:p-10">
          <img
            src={MEDORA_LOGO_URL}
            alt="MEDORA"
            className="medora-logo-adaptive mx-auto h-auto w-36 select-none"
          />

          <div className="mx-auto mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-500/15 text-amber-600 dark:text-[#f4d378]">
            <ShieldOff className="h-8 w-8" aria-hidden="true" />
          </div>

          <h1 className="mt-5 text-2xl font-extrabold text-slate-900 dark:text-white sm:text-3xl">
            {language === 'ar' ? 'بوابة الأشعة' : 'MEDORA Imaging Portal'}
          </h1>

          <div
            role="status"
            data-testid="imaging-portal-disabled-notice"
            className="mt-4 rounded-2xl border border-amber-300/70 bg-amber-50/90 px-5 py-4 text-base font-bold leading-relaxed text-amber-950 dark:border-[#d9a43b]/40 dark:bg-amber-950/35 dark:text-[#f4d378]"
          >
            {IMAGING_PORTAL_DISABLED_MESSAGE_AR}
          </div>

          {language === 'en' && (
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {IMAGING_PORTAL_DISABLED_MESSAGE_EN}
            </p>
          )}

          <p className="mt-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
            {accountBlocked
              ? language === 'ar'
                ? 'بيانات حسابك وملفاتك السابقة محفوظة بالكامل دون أي تغيير، ولكن الدخول إلى بوابة الأشعة أو إنشاء حسابات أشعة جديدة غير متاح خلال فترة الإيقاف المؤقت.'
                : 'All legacy account profiles and stored imaging records remain safely preserved, while Imaging Portal sign-in and new imaging registrations are temporarily disabled.'
              : language === 'ar'
                ? 'يمكنك الاستمرار في استخدام بوابات المريض والطبيب والمختبر والسكرتير بشكل طبيعي.'
                : 'Patient, Doctor, Laboratory, and Secretary portals remain fully operational.'}
          </p>

          <div className="mt-7 flex flex-col gap-3">
            {hasOtherAllowedPortal && onContinueAllowedPortal ? (
              <button
                type="button"
                onClick={onContinueAllowedPortal}
                className="medora-gold-button inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#040917] cursor-pointer"
              >
                <ForwardIcon className="h-4 w-4" aria-hidden="true" />
                <span>
                  {language === 'ar'
                    ? 'الانتقال إلى بواباتك المفعّلة في MEDORA'
                    : 'Continue to Your Active MEDORA Portals'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onBackToHome}
                className="medora-gold-button inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-[#040917] cursor-pointer"
              >
                <ForwardIcon className="h-4 w-4" aria-hidden="true" />
                <span>
                  {language === 'ar'
                    ? 'العودة إلى بوابات MEDORA الرئيسية'
                    : 'Return to MEDORA Main Portals'}
                </span>
              </button>
            )}

            {firebaseUser && (
              <>
                <button
                  type="button"
                  disabled={authActionPending}
                  onClick={() => void switchGoogleAccount()}
                  className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-[#d9a43b] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {language === 'ar'
                      ? 'تسجيل الدخول بحساب Google آخر'
                      : 'Sign in with a different Google account'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={authActionPending}
                  onClick={() => {
                    void logout().then(() => onBackToHome());
                  }}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-300 dark:hover:bg-slate-800/80 cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-t border-slate-200/80 pt-4 text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-500">
        <span>MEDORA Medical Platform</span>
        <span className="font-latin tracking-wider" dir="ltr">
          YOUR HEALTH · OUR PRIORITY
        </span>
      </footer>
    </motion.section>
  );
}
