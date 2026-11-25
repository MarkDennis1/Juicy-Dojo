export interface ScoreEntry { score: number; level: number; date: number; name?: string }
export interface Settings { muted: boolean; volume: number; name: string; scores: ScoreEntry[] }
export const NAME_MAX = 16;
const KEY = 'wobble:settings';
const MAX_SCORES = 10;
const defaults: Settings = { muted: false, volume: 0.9, name: '', scores: [] };

/** Tolerates missing or malformed fields (and the old ball-count format). */
export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      muted: typeof raw.muted === 'boolean' ? raw.muted : defaults.muted,
      volume: typeof raw.volume === 'number' ? raw.volume : defaults.volume,
      name: typeof raw.name === 'string' ? raw.name.slice(0, NAME_MAX) : '',
      scores: Array.isArray(raw.scores)
        ? raw.scores.filter((s: ScoreEntry) => s && typeof s.score === 'number').slice(0, MAX_SCORES) : [],
    };
  } catch { return { ...defaults, scores: [] }; }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export const bestScore = (s: Settings) => s.scores[0]?.score ?? 0;

/** Adds a finished run (under the saved player name) to the table.
 *  `entry` is null if the score did not make the top 10. */
export function recordScore(s: Settings, score: number, level: number): { isBest: boolean; entry: ScoreEntry | null } {
  const isBest = score > bestScore(s) && score > 0;
  if (score <= 0) return { isBest, entry: null };
  const entry: ScoreEntry = { score, level, date: Date.now(), name: s.name };
  s.scores.push(entry);
  s.scores.sort((a, b) => b.score - a.score);
  s.scores.length = Math.min(s.scores.length, MAX_SCORES);
  saveSettings(s);
  return { isBest, entry: s.scores.includes(entry) ? entry : null };
}

/** Names the entry and remembers the name for the next run. */
export function setName(s: Settings, entry: ScoreEntry | null, name: string): void {
  s.name = name.slice(0, NAME_MAX);
  if (entry) entry.name = s.name;
  saveSettings(s);
}
