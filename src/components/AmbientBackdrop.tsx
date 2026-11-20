import { motion } from 'motion/react';

interface AmbientBackdropProps {
  glowPhase: 'initial' | 'active' | 'settled';
  instant?: boolean;
  adaptiveTheme?: boolean;
}

export function AmbientBackdrop({
  glowPhase,
  instant = false,
  adaptiveTheme = false,
}: AmbientBackdropProps) {
  const isSettledOrActive = glowPhase === 'active' || glowPhase === 'settled';

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Base Canvas: Obsidian Navy in dark mode (or intro), Crisp Alabaster in light mode */}
      <div
        className={`absolute inset-0 transition-colors duration-300 ${
          adaptiveTheme
            ? 'bg-slate-50 dark:bg-[#02050d]'
            : 'bg-[#02050d]'
        }`}
        style={
          adaptiveTheme
            ? undefined
            : {
                background:
                  'radial-gradient(ellipse 85% 70% at 50% 42%, #091736 0%, #050c1f 48%, #02050d 100%)',
              }
        }
      />

      {adaptiveTheme && (
        <div
          className="absolute inset-0 hidden dark:block"
          style={{
            background:
              'radial-gradient(ellipse 85% 70% at 50% 42%, #091736 0%, #050c1f 48%, #02050d 100%)',
          }}
        />
      )}

      {adaptiveTheme && (
        <div
          className="absolute inset-0 block dark:hidden"
          style={{
            background:
              'radial-gradient(ellipse 85% 70% at 50% 30%, #ffffff 0%, #f1f5fb 56%, #e7eef8 100%)',
          }}
        />
      )}

      {/* Subtle Royal Blue Atmospheric Horizon */}
      <motion.div
        className="absolute left-1/2 top-[38%] h-[620px] w-[960px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[110px]"
        style={{
          background:
            'radial-gradient(circle, rgba(28, 88, 214, 0.22) 0%, rgba(10, 42, 117, 0.12) 45%, transparent 72%)',
        }}
        initial={instant ? { opacity: 0.9, scale: 1 } : { opacity: 0.25, scale: 0.88 }}
        animate={{
          opacity: isSettledOrActive ? 0.92 : 0.45,
          scale: isSettledOrActive ? 1 : 0.92,
        }}
        transition={{ duration: instant ? 0 : 1.8, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Central Golden Glow */}
      <motion.div
        className="absolute left-1/2 top-[40%] h-[360px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          background:
            'radial-gradient(circle, rgba(230, 174, 61, 0.2) 0%, rgba(217, 164, 59, 0.08) 46%, transparent 72%)',
        }}
        initial={instant ? { opacity: 0.72, scale: 1 } : { opacity: 0, scale: 0.55 }}
        animate={{
          opacity: glowPhase === 'settled' ? 0.62 : isSettledOrActive ? 0.88 : 0,
          scale: isSettledOrActive ? 1 : 0.6,
        }}
        transition={{
          duration: instant ? 0 : 1.35,
          delay: instant ? 0 : 0.3,
          ease: [0.22, 1, 0.36, 1],
        }}
      />

      {/* Soft Studio Luminance Behind Wordmark */}
      <motion.div
        className="absolute left-1/2 top-[47%] h-[300px] w-[680px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[72px]"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(164, 200, 255, 0.13) 0%, rgba(44, 108, 224, 0.08) 52%, transparent 76%)',
        }}
        initial={instant ? { opacity: 0.9 } : { opacity: 0 }}
        animate={{ opacity: isSettledOrActive ? 0.9 : 0 }}
        transition={{ duration: instant ? 0 : 1.5, delay: instant ? 0 : 0.8 }}
      />

      {/* Architectural Hairline Orbital Framing */}
      <motion.div
        className="absolute left-1/2 top-[45%] h-[540px] w-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#d9a43b]/[0.09] sm:h-[700px] sm:w-[700px] lg:h-[820px] lg:w-[820px]"
        initial={instant ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: instant ? 0 : 2.2, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.div
        className="absolute left-1/2 top-[45%] h-[410px] w-[410px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#60a5fa]/[0.08] sm:h-[530px] sm:w-[530px] lg:h-[620px] lg:w-[620px]"
        initial={instant ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: instant ? 0 : 2.4, delay: instant ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* Edge Vignette (dark mode only when adaptive) */}
      <div
        className={`absolute inset-0 ${adaptiveTheme ? 'hidden dark:block' : ''}`}
        style={{
          background:
            'radial-gradient(circle at 50% 45%, transparent 45%, rgba(2, 5, 13, 0.72) 100%)',
        }}
      />
    </div>
  );
}
