import { motion } from 'motion/react';
import {
  LOGO_HEIGHT,
  LOGO_WIDTH,
  MEDORA_ARABIC_BAND,
  MEDORA_GOLD_CROSS_BBOX,
  MEDORA_LETTERS,
  MEDORA_LOGO_URL,
  MEDORA_TAGLINE_BAND,
} from '../constants/brand';

interface MedoraLogoSequenceProps {
  isSettled: boolean;
  instant: boolean;
}

const EASE_LUXURY = [0.22, 1, 0.36, 1] as const;

export function MedoraLogoSequence({
  isSettled,
  instant,
}: MedoraLogoSequenceProps) {
  // Exact spline paths traced over the 1536x1024 coordinate grid of the official logo
  const mSpinePath =
    'M 510 456 L 510 144 C 510 105 552 96 588 124 L 780 264 L 972 124 C 1008 96 1050 105 1050 144 L 1050 458';

  const goldSwoopPath =
    'M 688 434 C 556 508 398 522 354 454 C 318 398 408 320 555 248 C 760 148 1068 12 1178 40 C 1244 58 1226 146 1110 244 C 1020 320 924 374 872 396';

  const showFinalInstant = isSettled || instant;

  return (
    <div className="relative mx-auto w-full max-w-[540px] sm:max-w-[620px] lg:max-w-[680px]">
      {/* Central 3D Golden Cross Halo (Step 4) */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[39%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl sm:h-32 sm:w-32"
        style={{
          background:
            'radial-gradient(circle, rgba(246, 212, 112, 0.42) 0%, rgba(217, 164, 59, 0.14) 55%, transparent 75%)',
        }}
        initial={instant ? { opacity: 0.45, scale: 1 } : { opacity: 0, scale: 0.4 }}
        animate={{
          opacity: isSettled ? 0.35 : [0, 0.78, 0.38],
          scale: isSettled ? 1 : [0.4, 1.12, 1],
        }}
        transition={{
          duration: instant ? 0 : 1.4,
          delay: instant ? 0 : 1.85,
          ease: EASE_LUXURY,
        }}
      />

      <svg
        viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`}
        className="medora-logo-rim block h-auto w-full select-none overflow-visible"
        role="img"
        aria-label="شعار منصة MEDORA — ميدورا — YOUR HEALTH OUR PRIORITY"
      >
        <defs>
          {/* Luminous Gold-to-Sapphire Stroke Gradient */}
          <linearGradient id="medoraLightStroke" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="50%" stopColor="#f8df8d" stopOpacity="1" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id="medoraGoldBeam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff4cf" />
            <stop offset="45%" stopColor="#eab952" />
            <stop offset="100%" stopColor="#b57d1e" />
          </linearGradient>

          <linearGradient id="medoraSpecularSweep" x1="0%" y1="0%" x2="100%" y2="30%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="44%" stopColor="#bfdbfe" stopOpacity="0" />
            <stop offset="50%" stopColor="#fff6d6" stopOpacity="0.48" />
            <stop offset="56%" stopColor="#93c5fd" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          {/* Soft glow filter for drawing light strokes */}
          <filter id="lightStrokeGlow" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Clip: Upper M ribbon (excluding the golden cross box so cross animates independently) */}
          <clipPath id="clip-upper-emblem">
            <path d="M 455 70 H 1105 V 480 H 884 V 332 H 676 V 480 H 455 Z" />
          </clipPath>

          {/* Clip: Golden Elliptical Swoop (progressive wipe driven by animated rect) */}
          <clipPath id="clip-gold-swoop-region">
            <path d="M 300 0 H 1265 V 535 H 884 V 332 H 676 V 535 H 300 Z" />
          </clipPath>

          {/* Clip: Gold Cross */}
          <clipPath id="clip-gold-cross">
            <rect
              x={MEDORA_GOLD_CROSS_BBOX.x}
              y={MEDORA_GOLD_CROSS_BBOX.y}
              width={MEDORA_GOLD_CROSS_BBOX.width}
              height={MEDORA_GOLD_CROSS_BBOX.height}
            />
          </clipPath>

          {/* Clips: Individual letters of MEDORA */}
          {MEDORA_LETTERS.map((letter) => (
            <clipPath key={letter.char} id={`clip-letter-${letter.char}`}>
              <rect
                x={letter.x1}
                y={542}
                width={letter.x2 - letter.x1}
                height={186}
              />
            </clipPath>
          ))}

          {/* Clip: Arabic wordmark "ميدورا" */}
          <clipPath id="clip-arabic-word">
            <rect
              x={MEDORA_ARABIC_BAND.wordX1}
              y={MEDORA_ARABIC_BAND.y}
              width={MEDORA_ARABIC_BAND.wordX2 - MEDORA_ARABIC_BAND.wordX1}
              height={MEDORA_ARABIC_BAND.height}
            />
          </clipPath>

          {/* Clip: Left & Right Golden Bars */}
          <clipPath id="clip-gold-bar-left">
            <rect
              x={MEDORA_ARABIC_BAND.leftBarX1}
              y={MEDORA_ARABIC_BAND.y}
              width={MEDORA_ARABIC_BAND.leftBarX2 - MEDORA_ARABIC_BAND.leftBarX1}
              height={MEDORA_ARABIC_BAND.height}
            />
          </clipPath>
          <clipPath id="clip-gold-bar-right">
            <rect
              x={MEDORA_ARABIC_BAND.rightBarX1}
              y={MEDORA_ARABIC_BAND.y}
              width={MEDORA_ARABIC_BAND.rightBarX2 - MEDORA_ARABIC_BAND.rightBarX1}
              height={MEDORA_ARABIC_BAND.height}
            />
          </clipPath>

          {/* Clips: Tagline YOUR HEALTH • OUR PRIORITY */}
          <clipPath id="clip-tagline-left">
            <rect
              x={MEDORA_TAGLINE_BAND.leftTextX1}
              y={MEDORA_TAGLINE_BAND.y}
              width={MEDORA_TAGLINE_BAND.leftTextX2 - MEDORA_TAGLINE_BAND.leftTextX1}
              height={MEDORA_TAGLINE_BAND.height}
            />
          </clipPath>
          <clipPath id="clip-tagline-dot">
            <circle
              cx={MEDORA_TAGLINE_BAND.dotCenterX}
              cy={MEDORA_TAGLINE_BAND.dotCenterY}
              r={MEDORA_TAGLINE_BAND.dotRadius}
            />
          </clipPath>
          <clipPath id="clip-tagline-right">
            <rect
              x={MEDORA_TAGLINE_BAND.rightTextX1}
              y={MEDORA_TAGLINE_BAND.y}
              width={MEDORA_TAGLINE_BAND.rightTextX2 - MEDORA_TAGLINE_BAND.rightTextX1}
              height={MEDORA_TAGLINE_BAND.height}
            />
          </clipPath>

          {/* Full emblem clip for final specular shimmer */}
          <clipPath id="clip-full-logo-shimmer">
            <rect x="0" y="0" width={LOGO_WIDTH} height={LOGO_HEIGHT} />
          </clipPath>
        </defs>

        {/* ============================================================
            SEQUENTIAL REVEAL LAYERS (Visible during playback)
           ============================================================ */}
        {!showFinalInstant && (
          <g>
            {/* STEP 3A: Luminous stroke tracing the upper M emblem */}
            <motion.path
              d={mSpinePath}
              fill="none"
              stroke="url(#medoraLightStroke)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#lightStrokeGlow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: [0, 1, 1],
                opacity: [0, 0.95, 0],
              }}
              transition={{
                duration: 1.55,
                delay: 0.85,
                times: [0, 0.68, 1],
                ease: EASE_LUXURY,
              }}
            />

            {/* STEP 3B: Upper Royal Blue M artwork reveal */}
            <motion.g
              clipPath="url(#clip-upper-emblem)"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.95, delay: 1.28, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            {/* STEP 3C: Golden Elliptical Swoop drawing around M */}
            <motion.path
              d={goldSwoopPath}
              fill="none"
              stroke="url(#medoraGoldBeam)"
              strokeWidth="10"
              strokeLinecap="round"
              filter="url(#lightStrokeGlow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: [0, 1, 1],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 1.45,
                delay: 1.15,
                times: [0, 0.72, 1],
                ease: EASE_LUXURY,
              }}
            />

            {/* Reveal of the actual Gold Swoop artwork */}
            <motion.g
              clipPath="url(#clip-gold-swoop-region)"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: '780px 265px' }}
              transition={{ duration: 1.0, delay: 1.5, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            {/* STEP 4: Golden Medical Cross with 3D depth emergence */}
            <motion.g
              clipPath="url(#clip-gold-cross)"
              initial={{ opacity: 0, scale: 0.76 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{ transformOrigin: '780px 415px' }}
              transition={{ duration: 0.85, delay: 1.9, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            {/* 3D Specular Light Sweep across the Emblem */}
            <motion.rect
              x="0"
              y="0"
              width="520"
              height="520"
              fill="url(#medoraSpecularSweep)"
              style={{ mixBlendMode: 'screen' }}
              initial={{ x: 240, opacity: 0 }}
              animate={{ x: [240, 1160], opacity: [0, 0.9, 0] }}
              transition={{
                duration: 1.05,
                delay: 2.05,
                ease: [0.4, 0, 0.2, 1],
              }}
            />

            {/* STEP 5: MEDORA letters drawn from light, letter by letter */}
            {MEDORA_LETTERS.map((letter) => {
              const cx = (letter.x1 + letter.x2) / 2;
              return (
                <g key={letter.char}>
                  {/* Vertical light trace per letter */}
                  <motion.rect
                    x={cx - 4}
                    y={554}
                    width={8}
                    height={162}
                    rx={4}
                    fill="url(#medoraLightStroke)"
                    filter="url(#lightStrokeGlow)"
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{
                      scaleY: [0, 1, 0.2],
                      opacity: [0, 0.9, 0],
                    }}
                    style={{ transformOrigin: `${cx}px 716px` }}
                    transition={{
                      duration: 0.55,
                      delay: letter.delay,
                      ease: EASE_LUXURY,
                    }}
                  />
                  {/* Exact original letter PNG slice */}
                  <motion.g
                    clipPath={`url(#clip-letter-${letter.char})`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.52,
                      delay: letter.delay + 0.08,
                      ease: EASE_LUXURY,
                    }}
                  >
                    <image
                      href={MEDORA_LOGO_URL}
                      width={LOGO_WIDTH}
                      height={LOGO_HEIGHT}
                    />
                  </motion.g>
                </g>
              );
            })}

            {/* STEP 6: Arabic wordmark "ميدورا" + flanking golden bars */}
            <motion.g
              clipPath="url(#clip-arabic-word)"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.72, delay: 3.65, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            {/* Left & Right Golden Bars expanding smoothly outward */}
            <motion.g
              clipPath="url(#clip-gold-bar-left)"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              style={{ transformOrigin: '472px 808px' }}
              transition={{ duration: 0.68, delay: 3.82, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            <motion.g
              clipPath="url(#clip-gold-bar-right)"
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              style={{ transformOrigin: '1076px 808px' }}
              transition={{ duration: 0.68, delay: 3.82, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            {/* STEP 7: Tagline — Center Golden Dot first, then symmetrical text reveal */}
            <motion.circle
              cx={MEDORA_TAGLINE_BAND.dotCenterX}
              cy={MEDORA_TAGLINE_BAND.dotCenterY}
              r={28}
              fill="rgba(246, 212, 112, 0.5)"
              filter="url(#lightStrokeGlow)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.4, 0.8], opacity: [0, 0.9, 0] }}
              style={{
                transformOrigin: `${MEDORA_TAGLINE_BAND.dotCenterX}px ${MEDORA_TAGLINE_BAND.dotCenterY}px`,
              }}
              transition={{ duration: 0.75, delay: 4.25, ease: EASE_LUXURY }}
            />

            <motion.g
              clipPath="url(#clip-tagline-dot)"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                transformOrigin: `${MEDORA_TAGLINE_BAND.dotCenterX}px ${MEDORA_TAGLINE_BAND.dotCenterY}px`,
              }}
              transition={{ duration: 0.48, delay: 4.28, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            <motion.g
              clipPath="url(#clip-tagline-left)"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 4.46, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>

            <motion.g
              clipPath="url(#clip-tagline-right)"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 4.46, ease: EASE_LUXURY }}
            >
              <image
                href={MEDORA_LOGO_URL}
                width={LOGO_WIDTH}
                height={LOGO_HEIGHT}
              />
            </motion.g>
          </g>
        )}

        {/* ============================================================
            STEP 8: FINAL UNCLIPPED OFFICIAL LOGO LAYER + GOLDEN SHIMMER
           ============================================================ */}
        <motion.image
          href={MEDORA_LOGO_URL}
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          initial={{ opacity: instant ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: instant ? 0 : 0.6,
            delay: instant ? 0 : 4.85,
            ease: EASE_LUXURY,
          }}
        />

        {/* Final celebratory soft golden shimmer across complete logo */}
        {!instant && (
          <motion.rect
            x="0"
            y="0"
            width="480"
            height={LOGO_HEIGHT}
            fill="url(#medoraSpecularSweep)"
            clipPath="url(#clip-full-logo-shimmer)"
            style={{ mixBlendMode: 'screen' }}
            initial={{ x: -480, opacity: 0 }}
            animate={{
              x: [-480, LOGO_WIDTH + 120],
              opacity: [0, 0.72, 0],
            }}
            transition={{
              duration: 1.05,
              delay: 4.95,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        )}
      </svg>
    </div>
  );
}
