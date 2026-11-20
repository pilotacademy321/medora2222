export const MEDORA_LOGO_URL =
  '/assets/aistudio/file_00000000c14c8212bf0596ef74f11668_1fe788e9.png';

export const HANEEN_AVATAR_URL =
  '/assets/aistudio/file_00000000f19082108afe4eabba80dd10_f91cf652.png';

export const LOGO_WIDTH = 1536;
export const LOGO_HEIGHT = 1024;

export interface LetterSlice {
  char: string;
  x1: number;
  x2: number;
  delay: number;
}

/**
 * Exact horizontal bounding coordinates measured from the official MEDORA 1536x1024 PNG.
 */
export const MEDORA_LETTERS: LetterSlice[] = [
  { char: 'M', x1: 78, x2: 336, delay: 2.55 },
  { char: 'E', x1: 358, x2: 538, delay: 2.72 },
  { char: 'D', x1: 550, x2: 780, delay: 2.89 },
  { char: 'O', x1: 782, x2: 1028, delay: 3.06 },
  { char: 'R', x1: 1034, x2: 1232, delay: 3.23 },
  { char: 'A', x1: 1232, x2: 1490, delay: 3.4 },
];

export const MEDORA_GOLD_CROSS_BBOX = {
  x: 676,
  y: 334,
  width: 208,
  height: 162,
};

export const MEDORA_ARABIC_BAND = {
  y: 734,
  height: 148,
  leftBarX1: 60,
  leftBarX2: 472,
  wordX1: 486,
  wordX2: 1064,
  rightBarX1: 1076,
  rightBarX2: 1474,
};

export const MEDORA_TAGLINE_BAND = {
  y: 896,
  height: 50,
  leftTextX1: 228,
  leftTextX2: 716,
  dotCenterX: 772,
  dotCenterY: 920,
  dotRadius: 26,
  rightTextX1: 830,
  rightTextX2: 1304,
};

export const INTRO_SETTLE_DELAY_MS = 5650;
