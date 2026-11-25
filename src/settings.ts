export interface Settings { invert: boolean; balls: number; best: number }
const KEY = 'wobble:settings';
const defaults: Settings = { invert: false, balls: 1, best: 1 };

export function loadSettings(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
