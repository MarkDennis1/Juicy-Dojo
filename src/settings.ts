export interface Settings { balls: number; best: number; muted: boolean; volume: number }
const KEY = 'wobble:settings';
const defaults: Settings = { balls: 1, best: 1, muted: false, volume: 0.9 };

export function loadSettings(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; }
  catch { return { ...defaults }; }
}
export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
