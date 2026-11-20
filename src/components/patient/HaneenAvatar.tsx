import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { HANEEN_AVATAR_URL } from '../../constants/brand';
import type { Language } from '../../types/medora';

export type HaneenAvatarSize = 'sm' | 'md' | 'lg' | 'xl' | 'fab';

interface HaneenAvatarProps {
  size?: HaneenAvatarSize;
  isSpeakingOrTyping?: boolean;
  language?: Language;
  className?: string;
}

const SIZE_CLASSES: Record<HaneenAvatarSize, string> = {
  sm: 'h-9 w-9 sm:h-10 sm:w-10',
  md: 'h-12 w-12',
  lg: 'h-14 w-14 sm:h-16 sm:w-16',
  xl: 'h-24 w-24 sm:h-28 sm:w-28',
  fab: 'h-14 w-14 sm:h-16 sm:w-16',
};

const RING_PADDING: Record<HaneenAvatarSize, string> = {
  sm: 'p-[2px]',
  md: 'p-[2px]',
  lg: 'p-[2.5px]',
  xl: 'p-[3px]',
  fab: 'p-[2.5px]',
};

/**
 * Official HANEEN AI character circular avatar.
 * Renders the exact user-provided character portrait without text overlay or distortion,
 * framed in a soft luminous purple & MEDORA gold ring.
 */
export function HaneenAvatar({
  size = 'md',
  isSpeakingOrTyping = false,
  language = 'ar',
  className = '',
}: HaneenAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const altText =
    language === 'ar'
      ? 'الشخصية الرسمية لحنين الذكية — المساعد التثقيفي الصحي في MEDORA'
      : 'Official HANEEN AI Assistant Portrait — MEDORA';

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full select-none ${SIZE_CLASSES[size]} ${className}`}
    >
      {/* Active purple + gold luminous ring when typing/streaming */}
      {isSpeakingOrTyping && !prefersReducedMotion && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full border-2 border-[#f4d378]/75 shadow-[0_0_22px_rgba(139,92,246,0.75)]"
          animate={{ scale: [1, 1.07, 1], opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Subtle purple outer aura + gold accent ring */}
      <div
        className={`relative h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-[#8b5cf6] via-[#d9a43b] to-[#6d28d9] shadow-[0_0_20px_-4px_rgba(139,92,246,0.55),0_4px_14px_-4px_rgba(217,164,59,0.45)] ${RING_PADDING[size]}`}
      >
        <div className="relative h-full w-full overflow-hidden rounded-full bg-[#07122a] ring-1 ring-[#f4d378]/45">
          {!imgFailed ? (
            <img
              src={HANEEN_AVATAR_URL}
              alt={altText}
              referrerPolicy="no-referrer"
              loading="eager"
              decoding="async"
              onError={() => setImgFailed(true)}
              className="h-full w-full rounded-full object-cover object-[50%_18%]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#2e1065] via-[#0c3585] to-[#4c1d95] text-[#f4d378]">
              <Sparkles
                className={size === 'xl' ? 'h-10 w-10' : size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'}
                aria-hidden="true"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Subtle live waveform indicator displayed strictly while Haneen is composing/streaming a reply.
 */
export function HaneenSpeakingIndicator({
  language = 'ar',
}: {
  language?: Language;
}) {
  const prefersReducedMotion = useReducedMotion();
  const isAr = language === 'ar';

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/40 bg-violet-500/10 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-[#f4d378]"
    >
      <span className="inline-flex h-3.5 items-end gap-[2.5px]" aria-hidden="true">
        {[0, 1, 2].map((bar) =>
          prefersReducedMotion ? (
            <span
              key={bar}
              className="w-[2.5px] rounded-full bg-violet-600 dark:bg-[#f4d378]"
              style={{ height: bar === 1 ? '12px' : '7px' }}
            />
          ) : (
            <motion.span
              key={bar}
              className="w-[2.5px] rounded-full bg-gradient-to-t from-violet-600 to-[#d9a43b] dark:from-violet-400 dark:to-[#f4d378]"
              animate={{ height: ['5px', '13px', '6px'] }}
              transition={{
                duration: 0.75,
                repeat: Infinity,
                delay: bar * 0.16,
                ease: 'easeInOut',
              }}
            />
          ),
        )}
      </span>
      <span>{isAr ? 'حنين تكتب الإجابة...' : 'Haneen is replying...'}</span>
    </span>
  );
}
