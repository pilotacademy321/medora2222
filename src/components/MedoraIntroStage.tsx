import { useEffect, useState } from 'react';
import { motion, useReducedMotion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, Globe, Moon, RotateCcw, Sun } from 'lucide-react';
import { INTRO_SETTLE_DELAY_MS } from '../constants/brand';
import { useMedora } from '../contexts/MedoraContext';
import { AmbientBackdrop } from './AmbientBackdrop';
import { MedoraLogoSequence } from './MedoraLogoSequence';

interface MedoraIntroStageProps {
  onStartJourney: () => void;
}

export function MedoraIntroStage({ onStartJourney }: MedoraIntroStageProps) {
  const { language, toggleLanguage, theme, toggleTheme, t } = useMedora();
  const isAr = language === 'ar';
  const ForwardIcon = isAr ? ArrowLeft : ArrowRight;
  const prefersReducedMotion = useReducedMotion();
  const [sequenceKey, setSequenceKey] = useState(0);
  const [isSettled, setIsSettled] = useState(Boolean(prefersReducedMotion));
  const [isInstant, setIsInstant] = useState(Boolean(prefersReducedMotion));

  useEffect(() => {
    if (prefersReducedMotion) {
      setIsInstant(true);
      setIsSettled(true);
      return;
    }

    if (isInstant) {
      setIsSettled(true);
      return;
    }

    setIsSettled(false);
    const timer = window.setTimeout(() => {
      setIsSettled(true);
    }, INTRO_SETTLE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion, isInstant, sequenceKey]);

  const handleSkipIntro = () => {
    setIsInstant(true);
    setIsSettled(true);
  };

  const handleReplayIntro = () => {
    if (prefersReducedMotion) return;
    setIsInstant(false);
    setIsSettled(false);
    setSequenceKey((prev) => prev + 1);
  };

  const glowPhase = isSettled
    ? 'settled'
    : isInstant
      ? 'settled'
      : 'active';

  return (
    <motion.section
      className="relative flex min-h-dvh w-full flex-col justify-between overflow-hidden px-5 py-6 sm:px-10 sm:py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.985 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      <AmbientBackdrop glowPhase={glowPhase} instant={isInstant} adaptiveTheme />

      {/* Top Subtle Utility Row (Language / Theme + Skip during intro / Replay after settle) */}
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300/70 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur-md transition-colors hover:border-[#d9a43b] dark:border-[#d9a43b]/30 dark:bg-[#07122a]/80 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-3.5 w-3.5 text-[#b68023] dark:text-[#f4d378]" aria-hidden="true" />
            <span>{isAr ? t.common.english : t.common.arabic}</span>
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t.common.lightMode : t.common.darkMode}
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-300/70 bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-slate-800 backdrop-blur-md transition-colors hover:border-[#d9a43b] dark:border-[#d9a43b]/30 dark:bg-[#07122a]/80 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-[#f4d378]" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4 text-[#0c3585]" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <AnimatePresence mode="wait">
            {!isSettled ? (
              <motion.button
                key="skip-intro"
                type="button"
                onClick={handleSkipIntro}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-[#d9a43b]/40 bg-[#07122a]/85 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:border-[#d9a43b] hover:bg-[#0c1c3f] whitespace-nowrap shrink-0 cursor-pointer sm:text-sm"
              >
                {isAr ? 'تخطي المقدمة' : 'Skip Intro'}
              </motion.button>
            ) : (
              !prefersReducedMotion && (
                <motion.button
                  key="replay-intro"
                  type="button"
                  onClick={handleReplayIntro}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-600 transition-colors hover:text-[#0c3585] dark:text-slate-400 dark:hover:text-[#f4d378] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isAr ? 'إعادة عرض المقدمة' : 'Replay Intro'}</span>
                </motion.button>
              )
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Center Stage: Official Animated MEDORA Logo + Settled CTA */}
      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center py-4">
        <motion.div
          key={sequenceKey}
          className="w-full"
          animate={{ y: isSettled ? -8 : 0 }}
          transition={{ duration: isInstant ? 0 : 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <MedoraLogoSequence isSettled={isSettled} instant={isInstant} />
        </motion.div>

        {/* Primary Action Region (reserved height prevents layout shift) */}
        <div className="mt-6 flex min-h-[104px] w-full flex-col items-center justify-start sm:mt-8">
          <AnimatePresence>
            {isSettled && (
              <motion.div
                initial={
                  isInstant
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 18 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: isInstant ? 0.15 : 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center gap-4 text-center"
              >
                <button
                  type="button"
                  onClick={onStartJourney}
                  className="medora-gold-button group inline-flex min-h-[50px] items-center justify-center gap-3 rounded-xl px-7 py-3.5 text-base font-bold text-[#040917] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#f4d378] whitespace-nowrap shrink-0 cursor-pointer sm:px-9 sm:text-lg"
                >
                  <span>
                    {isAr ? 'ابدأ رحلتك مع' : 'Enter'}{' '}
                    <span className="font-latin font-bold tracking-wide" dir="ltr">
                      MEDORA
                    </span>
                  </span>
                  <ForwardIcon
                    className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1"
                    aria-hidden="true"
                  />
                </button>

                <p className="text-xs tracking-wide text-slate-600 dark:text-slate-400/90 sm:text-sm">
                  {isAr
                    ? 'رعاية طبية وتجارية رقمية فائقة الدقة والخصوصية'
                    : 'Precision Digital Healthcare & Pharmaceutical Supply Ecosystem'}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-center pt-2">
        <p className="text-xs text-slate-500">
          <span className="font-latin tracking-wider" dir="ltr">
            MEDORA
          </span>{' '}
          · {isAr ? 'منصة الرعاية الصحية المتقدمة' : 'Advanced Healthcare Ecosystem'}
        </p>
      </footer>
    </motion.section>
  );
}
