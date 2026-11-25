/** Synthesised sound effects (Web Audio, no asset files). */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let volume = 0.9;
let lastSwoosh = 0, lastSlice = 0;

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
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') void ctx.resume(); // also recovers iOS's 'interrupted' state
  // Playing a (silent) buffer inside the gesture is what fully unlocks iOS audio.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

// iOS only accepts an unlock from touchend/click, not touchstart/pointerdown, so listen for all of them.
// They stay attached: iOS suspends the context when the page is backgrounded and each gesture revives it.
for (const ev of ['touchend', 'pointerup', 'click', 'keydown'] as const) {
  addEventListener(ev, () => { if (!ctx || ctx.state !== 'running') unlockAudio(); }, { passive: true });
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ctx) void ctx.resume(); });

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
export function slice(): void {
  if (!ctx || (muted || volume === 0) || ctx.state !== 'running') return;
  const now = performance.now();
  if (now - lastSlice < 35) return; // several balls in one swipe: don't pile up
  lastSlice = now;
  const t = ctx.currentTime, k = 0.85 + Math.random() * 0.3;
  noiseBurst(t, 0.1, 3200 * k, 600, 0.9, 0.5);                        // sharp cut
  tone(t, 0.14, 190 * k, 65 * k, 0.45, 'triangle');                   // meaty thump
  noiseBurst(t + 0.03, 0.2, 350 * k, 1300 * k, 5, 0.3, 0.02);         // squelchy squirt
  noiseBurst(t + 0.05, 0.16, 900, 250, 2.5, 0.18, 0.01, 'lowpass');  // wet slosh
  for (let i = 0; i < 4; i++) {                                       // drips
    const dt = 0.12 + Math.random() * 0.28;
    tone(t + dt, 0.05, (900 + Math.random() * 700) * k, 350, 0.07 + Math.random() * 0.05);
  }
}
