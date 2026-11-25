/** All level tuning lives here, so balancing is a one-line change. */
export const LEVEL_COUNT = 9;        // level 9 is the endless mode
export const LEVEL_SECONDS = 60;     // levels 1 to 8
export const START_LIVES = 5;
export const MAX_LIVES = 5;          // one heart is earned back at each level-up, up to this cap

export interface Difficulty {
  speed: number;   // gravity multiplier: higher = targets launch and fall faster
  perWave: number; // targets per wave
  gap: number;     // seconds between waves
  bomb: number;    // chance that a launched target is a bomb
}

const TIMED: Difficulty[] = [
  { speed: 1.00, perWave: 2, gap: 2.2, bomb: 0 },
  { speed: 1.06, perWave: 2, gap: 2.0, bomb: 0.08 },
  { speed: 1.12, perWave: 3, gap: 1.9, bomb: 0.10 },
  { speed: 1.18, perWave: 3, gap: 1.7, bomb: 0.12 },
  { speed: 1.24, perWave: 3, gap: 1.6, bomb: 0.14 },
  { speed: 1.30, perWave: 4, gap: 1.5, bomb: 0.16 },
  { speed: 1.36, perWave: 4, gap: 1.4, bomb: 0.18 },
  { speed: 1.42, perWave: 5, gap: 1.3, bomb: 0.20 },
];

export const isEndless = (level: number) => level >= LEVEL_COUNT;

/** Level 9 keeps ramping slowly with `endlessSec` so it never plateaus. */
export function difficulty(level: number, endlessSec = 0): Difficulty {
  if (!isEndless(level)) return TIMED[level - 1];
  return {
    speed: Math.min(2.2, 1.48 + endlessSec / 600),
    perWave: Math.min(9, 5 + Math.floor(endlessSec / 45)),
    gap: Math.max(0.8, 1.3 - endlessSec / 400),
    bomb: Math.min(0.3, 0.2 + endlessSec / 1200),
  };
}

/** Background gradient (top, bottom) for each level. Kept dark enough for the white blade and the bombs to read. */
export const BACKGROUNDS: [string, string][] = [
  ['#1b2a41', '#324a5f'], // 1 blue dusk
  ['#1f3b2d', '#3d6b4f'], // 2 forest
  ['#3a1f4d', '#6b3a7d'], // 3 purple
  ['#4a2a1a', '#8a4b2a'], // 4 sunset
  ['#0f3b46', '#1c7c7d'], // 5 teal
  ['#4d1f2f', '#8c3a52'], // 6 wine
  ['#22254a', '#3f4f9c'], // 7 indigo
  ['#3b3b1a', '#7a7a2e'], // 8 olive
  ['#14141a', '#3a1a2e'], // 9 night (endless)
];
