/** Synthesised sound effects (Web Audio, no asset files). */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let volume = 0.9;
let lastSwoosh = 0, lastSlice = 0;
let paused = false;
let musicBus: GainNode | null = null;

/** Create/resume the audio context. Must be called from a user gesture (iOS requirement). */
export function unlockAudio(): void {
  // iOS: without this, the ringer/silent switch mutes Web Audio (Safari 16.4+).
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) try { session.type = 'playback'; } catch { /* unsupported value */ }
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); // keeps stacked slices from clipping
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.45; // music sits under the effects
    musicBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running' && !paused) void ctx.resume(); // also recovers iOS's 'interrupted' state
  // Playing a (silent) buffer inside the gesture is what fully unlocks iOS audio.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

// iOS only accepts an unlock from touchend/click, not touchstart/pointerdown, so listen for all of them.
// They stay attached: iOS suspends the context when the page is backgrounded and each gesture revives it.
for (const ev of ['touchend', 'pointerup', 'click', 'keydown'] as const) {
  addEventListener(ev, () => { if (!paused && (!ctx || ctx.state !== 'running')) unlockAudio(); }, { passive: true });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ctx && !paused) void ctx.resume(); });

function applyGain() {
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
}

export function setMuted(m: boolean): void { muted = m; applyGain(); }

/** Volume from 0 (silent) to 1 (full). */
export function setVolume(v: number): void { volume = Math.min(1, Math.max(0, v)); applyGain(); }

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

/** Filtered noise with a frequency sweep. */
function noiseBurst(t: number, dur: number, f0: number, f1: number, q: number, peak: number, attack = 0.005, type: BiquadFilterType = 'bandpass') {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  src.loopStart = 0; src.loop = true;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, peak, attack, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + attack + dur + 0.05);
}

function tone(t: number, dur: number, f0: number, f1: number, peak: number, type: OscillatorType = 'sine') {
  if (!ctx || !master) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, peak, 0.004, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Blade whooshing through the air. `speed` is pointer speed in px/ms. */
export function swoosh(speed: number): void {
  if (!ctx || (muted || volume === 0) || ctx.state !== 'running') return;
  const now = performance.now();
  if (speed < 0.7 || now - lastSwoosh < 140) return;
  lastSwoosh = now;
  const t = ctx.currentTime, k = 0.85 + Math.random() * 0.3;
  const loud = Math.min(0.22, 0.05 + speed * 0.05);
  noiseBurst(t, 0.17, 500 * k, 2600 * k, 1.4, loud, 0.045);       // rising "shhhk"
  noiseBurst(t + 0.02, 0.12, 4500 * k, 1800 * k, 0.8, loud * 0.35, 0.02, 'highpass'); // airy top
}

/** Wet, juicy slice. */
export function slice(pitch = 1): void {
  if (!ctx || (muted || volume === 0) || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - lastSlice < 35) return; // several targets in one swipe: don't pile up
  lastSlice = now;
  const t = ctx.currentTime, k = (0.85 + Math.random() * 0.3) * pitch;
  noiseBurst(t, 0.1, 3200 * k, 600, 0.9, 0.5);                        // sharp cut
  tone(t, 0.14, 190 * k, 65 * k, 0.45, 'triangle');                   // meaty thump
  noiseBurst(t + 0.03, 0.2, 350 * k, 1300 * k, 5, 0.3, 0.02);         // squelchy squirt
  noiseBurst(t + 0.05, 0.16, 900, 250, 2.5, 0.18, 0.01, 'lowpass');  // wet slosh
  for (let i = 0; i < 4; i++) {                                       // drips
    const dt = 0.12 + Math.random() * 0.28;
    tone(t + dt, 0.05, (900 + Math.random() * 700) * k, 350, 0.07 + Math.random() * 0.05);
  }
}

const audible = () => !!ctx && !muted && volume > 0 && ctx.state === 'running';

/** Bomb going off: low boom plus a sharp crack. */
export function bomb(): void {
  if (!audible() || !ctx) return;
  const t = ctx.currentTime;
  noiseBurst(t, 0.9, 2200, 50, 0.7, 0.9, 0.005, 'lowpass');
  noiseBurst(t, 0.25, 6000, 900, 0.8, 0.5);
  tone(t, 0.7, 130, 28, 0.9, 'sawtooth');
}

/** Rising arpeggio: the bigger the combo, the higher and longer it goes. */
export function combo(n: number): void {
  if (!audible() || !ctx) return;
  const t = ctx.currentTime, base = 440 * Math.pow(2, Math.min(n - 2, 8) / 6);
  const steps = [0, 4, 7, 12, 16, 19];
  for (let i = 0; i < Math.min(n, steps.length); i++) {
    tone(t + i * 0.06, 0.16, base * Math.pow(2, steps[i] / 12), base * Math.pow(2, steps[i] / 12) * 1.01, 0.16, 'triangle');
  }
}

/** A target fell out of the screen. */
export function miss(): void {
  if (!audible() || !ctx) return;
  tone(ctx.currentTime, 0.28, 240, 80, 0.35, 'triangle');
}

/** Celebratory fanfare: rising major arpeggio, a held chord, and sparkles. Each level is a semitone higher. */
export function levelUp(level = 2): void {
  if (!audible() || !ctx) return;
  const t = ctx.currentTime, k = Math.pow(2, Math.min(level - 2, 7) / 12);
  const hz = (semi: number) => 523.25 * k * Math.pow(2, semi / 12); // C5 major
  [0, 4, 7, 12].forEach((s, i) => {                                  // quick run up
    tone(t + i * 0.08, 0.2, hz(s), hz(s), 0.18, 'triangle');
    tone(t + i * 0.08, 0.2, hz(s) * 2, hz(s) * 2, 0.05, 'sine');
  });
  const hold = t + 0.34;                                             // held final chord
  [12, 16, 19, 24].forEach(s => tone(hold, 0.7, hz(s), hz(s) * 1.003, 0.13, 'triangle'));
  tone(hold, 0.5, hz(0) / 2, hz(0) / 2, 0.2, 'sine');                // bass
  noiseBurst(hold, 0.5, 9000, 5000, 0.6, 0.06, 0.01, 'highpass');    // shimmer
  for (let i = 0; i < 6; i++) {                                      // sparkles
    const f = hz(24 + [0, 4, 7, 12][i % 4]) * 1.5;
    tone(hold + 0.05 + i * 0.07, 0.12, f, f * 1.02, 0.06, 'sine');
  }
}

// --- Background music: one looping track per level, crossfaded at level-up ---
// Tracks are fetched and decoded lazily (this level and the next), and the service worker caches
// them as they are fetched, so offline play works after one full run.
const FADE = 1; // seconds
type Playing = { src: AudioBufferSourceNode; gain: GainNode };
const tracks = new Map<number, Promise<AudioBuffer | null>>();
let current: Playing | null = null;
let musicToken = 0;

function loadTrack(level: number): Promise<AudioBuffer | null> {
  if (!ctx) return Promise.resolve(null);
  let p = tracks.get(level);
  if (!p) {
    const c = ctx;
    p = fetch(`${import.meta.env.BASE_URL}music/level_${level}.m4a`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(b => c.decodeAudioData(b))
      .catch(() => { tracks.delete(level); return null; });
    tracks.set(level, p);
  }
  return p;
}

function fadeOut(p: Playing, seconds: number) {
  if (!ctx) return;
  const t = ctx.currentTime;
  p.gain.gain.cancelScheduledValues(t);
  p.gain.gain.setValueAtTime(p.gain.gain.value, t);
  p.gain.gain.linearRampToValueAtTime(0, t + seconds);
  p.src.stop(t + seconds + 0.05);
}

/** Crossfade to the track for `level`. Call after the first user gesture. */
export async function playMusic(level: number): Promise<void> {
  const token = ++musicToken;
  const buf = await loadTrack(level);
  if (!buf || token !== musicToken || !ctx || !musicBus) return;
  const t = ctx.currentTime;
  if (current) fadeOut(current, FADE);
  const src = ctx.createBufferSource(), gain = ctx.createGain();
  src.buffer = buf;
  src.loop = true; // the short tracks (5, 6) and the endless level 9 loop; long ones are cut by the next crossfade
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + FADE);
  src.connect(gain).connect(musicBus);
  src.start(t);
  current = { src, gain };
  for (const k of [...tracks.keys()]) if (k !== level) tracks.delete(k); // free the decoded old track
  if (level < 9) void loadTrack(level + 1);                                // warm up the next one
}

export function stopMusic(seconds = 1.5): void {
  musicToken++;
  if (current) fadeOut(current, seconds);
  current = null;
}

/** Freeze everything (music included) while the game is paused. */
export function suspendAudio(): void { paused = true; void ctx?.suspend(); }
export function resumeAudio(): void { paused = false; void ctx?.resume(); }
