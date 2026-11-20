import {
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  Globe,
  LogOut,
  Moon,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { useMedora } from '../contexts/MedoraContext';

interface MedoraUtilityBarProps {
  onBackToIntro?: () => void;
  onBackToPortals?: () => void;
  onOpenRequests?: () => void;
  showRequestsAction?: boolean;
}

export function MedoraUtilityBar({
  onBackToIntro,
  onBackToPortals,
  onOpenRequests,
  showRequestsAction = false,
}: MedoraUtilityBarProps) {
  const {
    language,
    toggleLanguage,
    theme,
    toggleTheme,
    t,
    firebaseUser,
    userAccount,
    requests,
    switchGoogleAccount,
    logout,
    authActionPending,
  } = useMedora();

  const BackIcon = language === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
      {/* Left Zone: Back Navigation or Authenticated Account Pill */}
      <div className="flex flex-wrap items-center gap-3">
        {onBackToIntro && (
          <button
            type="button"
            onClick={onBackToIntro}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-[#d9a43b]/60 hover:text-slate-950 dark:border-slate-700/70 dark:bg-[#07122a]/80 dark:text-slate-200 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BackIcon className="h-4 w-4 text-[#b68023] dark:text-[#d9a43b]" aria-hidden="true" />
            <span>{t.common.backToIntro}</span>
          </button>
        )}

        {onBackToPortals && (
          <button
            type="button"
            onClick={onBackToPortals}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-[#d9a43b]/60 hover:text-slate-950 dark:border-slate-700/70 dark:bg-[#07122a]/80 dark:text-slate-200 dark:hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BackIcon className="h-4 w-4 text-[#b68023] dark:text-[#d9a43b]" aria-hidden="true" />
            <span>{t.portals.changePortalBtn}</span>
          </button>
        )}

        {firebaseUser && (
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
            {(userAccount?.avatarUrl || firebaseUser.photoURL) && (
              <img
                src={userAccount?.avatarUrl || firebaseUser.photoURL || ''}
                alt={userAccount?.fullName || firebaseUser.displayName || 'User'}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-[#d9a43b]/40 object-cover"
              />
            )}
            <div className="hidden sm:block">
              <p className="font-semibold text-slate-900 dark:text-white">
                {userAccount?.fullName || firebaseUser.displayName || firebaseUser.email}
              </p>
              <p className="font-latin text-[11px] text-slate-500 dark:text-slate-400" dir="ltr">
                {firebaseUser.email}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Zone: Controls (Requests, Language, Theme, Account Switch / Sign Out) */}
      <div className="flex flex-wrap items-center gap-2">
        {showRequestsAction && onOpenRequests && requests.length > 0 && (
          <button
            type="button"
            onClick={onOpenRequests}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#d9a43b]/40 bg-[#d9a43b]/10 px-3 py-1.5 text-xs font-semibold text-[#8c5d0b] transition-colors hover:bg-[#d9a43b]/20 dark:text-[#f4d378] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.portals.viewRequests}</span>
            <span className="font-latin tabular-nums">({requests.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleLanguage}
          aria-label={language === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-[#0c3585] dark:border-slate-700/80 dark:bg-[#07122a]/80 dark:text-slate-200 dark:hover:border-[#d9a43b]/60 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Globe className="h-3.5 w-3.5 text-[#0c3585] dark:text-[#60a5fa]" aria-hidden="true" />
          <span>{language === 'ar' ? t.common.english : t.common.arabic}</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? t.common.lightMode : t.common.darkMode}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-[#d9a43b] dark:border-slate-700/80 dark:bg-[#07122a]/80 dark:text-slate-200 dark:hover:border-[#d9a43b]/60 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5 text-[#f4d378]" aria-hidden="true" />
              <span className="hidden sm:inline">{t.common.lightMode}</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5 text-[#0c3585]" aria-hidden="true" />
              <span className="hidden sm:inline">{t.common.darkMode}</span>
            </>
          )}
        </button>

        {firebaseUser && (
          <>
            <button
              type="button"
              disabled={authActionPending}
              onClick={() => void switchGoogleAccount()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-[#d9a43b] disabled:opacity-50 dark:border-slate-700/80 dark:bg-[#07122a]/80 dark:text-slate-200 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden md:inline">{t.common.switchAccount}</span>
            </button>

            <button
              type="button"
              disabled={authActionPending}
              onClick={() => void logout()}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.common.signOut}</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
