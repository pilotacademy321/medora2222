import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Crown,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { MEDORA_LOGO_URL } from '../constants/brand';
import { useMedora } from '../contexts/MedoraContext';
import { isEmbeddedIframe } from '../lib/firebase';
import type { RegistrationRequest, UserAccount } from '../types/medora';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraUtilityBar } from './MedoraUtilityBar';

interface GoogleAuthEntryProps {
  onBackToIntro: () => void;
  onBackToPortalSelection: () => void;
  onAuthenticated?: (result: {
    user: UserAccount;
    requests: RegistrationRequest[];
    isSuperAdmin: boolean;
    imagingAccessBlocked?: boolean;
    hasOtherAllowedPortal?: boolean;
  }) => void;
  onContinueSignedIn?: () => void;
}

type LegalModalType = 'privacy' | 'terms' | null;

export function GoogleAuthEntry({
  onBackToIntro,
  onBackToPortalSelection,
  onAuthenticated,
  onContinueSignedIn,
}: GoogleAuthEntryProps) {
  const {
    language,
    t,
    portalIntent,
    firebaseUser,
    userAccount,
    isSuperAdmin,
    adminCheckDone,
    authLoading,
    signInWithGoogle,
    signInWithGoogleRedirect,
    switchGoogleAccount,
    authActionPending,
    authError,
    authErrorCode,
    clearAuthError,
  } = useMedora();
  const [legalModal, setLegalModal] = useState<LegalModalType>(null);

  const BackIcon = language === 'ar' ? ArrowRight : ArrowLeft;
  const isSuperAdminIntent = portalIntent === 'super_admin';
  const selectedPortalTitle =
    portalIntent === 'super_admin'
      ? t.portals.superAdminCard.title
      : portalIntent
        ? t.portals.items[portalIntent].title
        : null;

  const isVerifyingSession =
    authActionPending || (Boolean(firebaseUser) && (authLoading || !adminCheckDone));
  const isUnauthorizedSuperAdmin =
    Boolean(firebaseUser) &&
    adminCheckDone &&
    isSuperAdminIntent &&
    !isSuperAdmin;
  const embeddedIframe = isEmbeddedIframe();
  const currentHostname =
    typeof window !== 'undefined' ? window.location.hostname : '';

  const handleGoogleContinue = async () => {
    clearAuthError();
    const res = await signInWithGoogle();
    if (res && onAuthenticated) {
      onAuthenticated(res);
    }
  };

  const handleSwitchAccount = async () => {
    clearAuthError();
    const res = await switchGoogleAccount();
    if (res && onAuthenticated) {
      onAuthenticated(res);
    }
  };

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between px-4 py-6 sm:px-8 sm:py-8 lg:px-12"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <AmbientBackdrop glowPhase="settled" instant adaptiveTheme />

      <MedoraUtilityBar
        onBackToIntro={onBackToIntro}
        onBackToPortals={onBackToPortalSelection}
      />

      <main className="relative z-10 mx-auto my-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 py-8 lg:grid-cols-12 lg:gap-14">
        {/* Official Brand Showcase */}
        <div className="flex flex-col items-center text-center lg:col-span-6 lg:items-start lg:text-start">
          <div className="w-full max-w-[300px] sm:max-w-[360px] lg:max-w-[420px]">
            <img
              src={MEDORA_LOGO_URL}
              alt="MEDORA Official Logo"
              className="medora-logo-adaptive h-auto w-full select-none"
            />
          </div>
          <div className="mt-6 h-px w-28 bg-gradient-to-r from-[#d9a43b]/70 via-[#d9a43b]/30 to-transparent" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300/90 sm:text-base">
            {t.auth.securityNote}
          </p>
        </div>

        {/* Single-Provider Google Auth Card */}
        <div className="w-full lg:col-span-6">
          <div
            className={`mx-auto w-full max-w-md rounded-2xl border bg-white/95 p-7 shadow-[0_24px_60px_-24px_rgba(10,42,117,0.2)] backdrop-blur-xl dark:bg-[#07122a]/90 dark:shadow-[0_24px_70px_-20px_rgba(2,6,23,0.9)] sm:p-9 ${
              isSuperAdminIntent
                ? 'border-[#d9a43b]/60'
                : 'border-slate-200 dark:border-[#d9a43b]/25'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#0c3585] dark:text-[#f4d378]">
                {isSuperAdminIntent ? (
                  <Crown className="h-4 w-4 text-[#d9a43b]" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="font-latin tracking-wider" dir="ltr">
                  {isSuperAdminIntent ? 'SUPER ADMIN ACCESS' : 'MEDORA ACCESS'}
                </span>
              </div>

              <button
                type="button"
                onClick={onBackToPortalSelection}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0c3585] hover:underline dark:text-[#f4d378] cursor-pointer"
              >
                <BackIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t.auth.backToPortalSelection}</span>
              </button>
            </div>

            {selectedPortalTitle && (
              <div
                className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs ${
                  isSuperAdminIntent
                    ? 'border-[#d9a43b]/45 bg-[#d9a43b]/10 text-[#8c5d0b] dark:text-[#f4d378]'
                    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-[#040a1a]/70 dark:text-slate-200'
                }`}
              >
                <span className="opacity-75">{t.auth.selectedPortalLabel}: </span>
                <span className="font-bold">{selectedPortalTitle}</span>
              </div>
            )}

            <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t.auth.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t.auth.subtitle}
            </p>

            {/* Signed-in Google Account Identity Card */}
            {firebaseUser && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 dark:border-slate-800 dark:bg-[#040a1a]/80">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t.auth.signedInAsLabel}
                </p>
                <div className="mt-1.5 flex items-center gap-3">
                  {(userAccount?.avatarUrl || firebaseUser.photoURL) && (
                    <img
                      src={userAccount?.avatarUrl || firebaseUser.photoURL || ''}
                      alt={userAccount?.fullName || firebaseUser.displayName || 'User'}
                      referrerPolicy="no-referrer"
                      className="h-9 w-9 rounded-full border border-[#d9a43b]/40 object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                      {userAccount?.fullName ||
                        firebaseUser.displayName ||
                        firebaseUser.email}
                    </p>
                    <p
                      className="truncate font-latin text-xs text-slate-600 dark:text-slate-400"
                      dir="ltr"
                    >
                      {firebaseUser.email}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Unauthorized Super Admin Alert */}
            {isUnauthorizedSuperAdmin && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3.5 text-sm font-medium text-rose-800 dark:border-rose-500/50 dark:bg-rose-950/60 dark:text-rose-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t.auth.superAdminUnauthorized}</span>
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="mt-4 space-y-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-200"
              >
                <p>{authError}</p>
                {authErrorCode === 'auth/unauthorized-domain' && currentHostname && (
                  <div
                    className="rounded-lg border border-rose-200 bg-white/80 px-3 py-2 font-latin text-xs font-semibold text-rose-900 select-all dark:border-rose-500/30 dark:bg-slate-950/60 dark:text-rose-100"
                    dir="ltr"
                  >
                    {currentHostname}
                  </div>
                )}
              </div>
            )}

            {/* Loading / Verifying Overlay State */}
            {isVerifyingSession ? (
              <div className="mt-6 flex items-center justify-center gap-2.5 rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 px-4 py-4 text-sm font-semibold text-[#8c5d0b] dark:text-[#f4d378]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>{t.auth.verifyingAccount}</span>
              </div>
            ) : firebaseUser ? (
              <div className="mt-6 space-y-3">
                {!isUnauthorizedSuperAdmin && onContinueSignedIn && (
                  <button
                    type="button"
                    onClick={onContinueSignedIn}
                    className="medora-gold-button min-h-[48px] w-full rounded-xl px-5 py-3 text-sm font-bold text-[#040917] transition-all cursor-pointer"
                  >
                    {t.auth.continueToSelectedPortal}
                  </button>
                )}

                <button
                  type="button"
                  disabled={authActionPending}
                  onClick={() => void handleSwitchAccount()}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-all hover:border-[#d9a43b] disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-[#d9a43b] cursor-pointer"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  <span>{t.auth.signInDifferentGoogle}</span>
                </button>

                <button
                  type="button"
                  onClick={onBackToPortalSelection}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-[#040a1a] dark:text-slate-300 dark:hover:bg-slate-800/80 cursor-pointer"
                >
                  <BackIcon className="h-4 w-4" aria-hidden="true" />
                  <span>{t.auth.backToPortalSelection}</span>
                </button>
              </div>
            ) : (
              <div className="mt-7 space-y-3">
                <button
                  type="button"
                  disabled={authActionPending}
                  onClick={() => void handleGoogleContinue()}
                  className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-3.5 text-base font-semibold text-slate-900 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#d9a43b] hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:border-[#d9a43b] cursor-pointer"
                >
                  {/* Official Google Multi-Color G Mark */}
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                    />
                  </svg>
                  <span>
                    {authActionPending
                      ? t.auth.signingIn
                      : t.auth.continueWithGoogle}
                  </span>
                </button>

                {(authErrorCode === 'auth/popup-blocked' ||
                  authErrorCode === 'auth/popup-closed-by-user' ||
                  authErrorCode === 'auth/cancelled-popup-request' ||
                  authErrorCode === 'auth/operation-not-supported-in-this-environment' ||
                  authErrorCode === 'auth/web-storage-unsupported' ||
                  authErrorCode === 'auth/internal-error') &&
                  (!embeddedIframe ? (
                    <button
                      type="button"
                      disabled={authActionPending}
                      onClick={() => void signInWithGoogleRedirect()}
                      className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#d9a43b]/45 bg-[#d9a43b]/10 px-4 py-2.5 text-xs font-semibold text-[#8c5d0b] transition-colors hover:bg-[#d9a43b]/20 disabled:opacity-60 dark:text-[#f4d378] cursor-pointer"
                    >
                      <span>{t.auth.continueWithGoogleRedirect}</span>
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-[#d9a43b]/35 bg-[#d9a43b]/10 p-3 text-xs text-[#8c5d0b] dark:text-[#f4d378]">
                      <p className="leading-relaxed">{t.auth.iframePopupHint}</p>
                      <a
                        href={typeof window !== 'undefined' ? window.location.href : '/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-[#d9a43b]/50 bg-white/80 px-3 py-2 font-semibold text-slate-900 transition-colors hover:bg-white dark:bg-slate-900/90 dark:text-white dark:hover:bg-slate-900"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t.auth.openInNewTabForSignIn}</span>
                      </a>
                    </div>
                  ))}
              </div>
            )}

            <div className="mt-7 flex items-center justify-center gap-4 border-t border-slate-200 pt-5 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setLegalModal('privacy')}
                className="min-h-[36px] font-medium hover:text-[#0c3585] hover:underline dark:hover:text-[#f4d378] cursor-pointer"
              >
                {t.auth.privacyPolicy}
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setLegalModal('terms')}
                className="min-h-[36px] font-medium hover:text-[#0c3585] hover:underline dark:hover:text-[#f4d378] cursor-pointer"
              >
                {t.auth.termsOfUse}
              </button>
            </div>
          </div>
        </div>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between border-t border-slate-200/80 pt-4 text-xs text-slate-500 dark:border-slate-800/60 dark:text-slate-500">
        <span>MEDORA Medical Platform</span>
        <span className="font-latin tracking-wider" dir="ltr">
          YOUR HEALTH · OUR PRIORITY
        </span>
      </footer>

      {/* Privacy & Terms Modal */}
      <AnimatePresence>
        {legalModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
            onClick={() => setLegalModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#07122a]"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {legalModal === 'privacy'
                    ? t.auth.privacyPolicy
                    : t.auth.termsOfUse}
                </h2>
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  aria-label={t.common.close}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                {(legalModal === 'privacy'
                  ? t.auth.privacyBody
                  : t.auth.termsBody
                ).map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  className="medora-gold-button min-h-[42px] rounded-xl px-5 py-2 text-sm font-bold text-[#040917] cursor-pointer"
                >
                  {t.common.close}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
