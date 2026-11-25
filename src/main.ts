import './style.css';
import * as audio from './audio';
import { haptic } from './haptics';
import { BACKGROUNDS, LEVEL_SECONDS, MAX_LIVES, START_LIVES, difficulty, isEndless } from './levels';
import { NAME_MAX, bestScore, loadSettings, recordScore, saveSettings, setName, type ScoreEntry } from './settings';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const volumeEl = document.getElementById('volume') as HTMLInputElement;
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
const heartsEl = document.getElementById('hearts')!;
const scoreEl = document.getElementById('score')!;
const lvlEl = document.getElementById('lvl')!;
const bannerEl = document.getElementById('banner')!;
const overlayEl = document.getElementById('overlay')!;
const fpsEl = document.getElementById('fps')!;

const settings = loadSettings();
let W = 0, H = 0, dpr = 1;

// ---------------------------------------------------------------- targets
interface Kind {
  name: string; r: number; color: string; inner: string; juice: [string, string]; points: number; pitch: number;
}
const FRUITS: Kind[] = [
  { name: 'watermelon', r: 34, color: '#2e9d3f', inner: '#e5243b', juice: ['#c2001f', '#7d0016'], points: 1, pitch: 0.8 },
  { name: 'lime', r: 22, color: '#7ccd3a', inner: '#d4f58a', juice: ['#8fd13f', '#5a9e1f'], points: 1, pitch: 1.3 },
  { name: 'orange', r: 28, color: '#ff9a1f', inner: '#ffd27a', juice: ['#ff8a00', '#d96a00'], points: 1, pitch: 1 },
  { name: 'plum', r: 25, color: '#8e44ad', inner: '#d7a8ee', juice: ['#7b2d9b', '#4e1a66'], points: 1, pitch: 1.1 },
];
const GOLD: Kind = { name: 'gold', r: 23, color: '#ffc61a', inner: '#fff2a8', juice: ['#ffd23f', '#e0a800'], points: 5, pitch: 1.7 };
const BOMB: Kind = { name: 'bomb', r: 28, color: '#1a1a1a', inner: '#ff6a00', juice: ['#ff6a00', '#333'], points: 0, pitch: 1 };

// The radii above are tuned for a ~420px-wide phone. `r` is rescaled on resize so targets keep
// the same proportion of the screen (smaller side) on any display.
const BASE_R = new Map([...FRUITS, GOLD, BOMB].map(k => [k, k.r] as const));
const REF_SIZE = 420, MIN_SCALE = 0.75, MAX_SCALE = 2.2;
function scaleKinds() {
  const s = Math.min(Math.max(Math.min(W, H) / REF_SIZE, MIN_SCALE), MAX_SCALE);
  for (const [k, r] of BASE_R) k.r = r * s;
}

interface Target { kind: Kind; x: number; y: number; px: number; py: number; vx: number; vy: number; ang: number; spin: number }
let targets: Target[] = [];

// ---------------------------------------------------------------- game state
type State = 'menu' | 'playing' | 'paused' | 'gameover';
const STEP = 1000 / 60;
const BANNER_STEPS = 110, GOLD_CHANCE = 0.06, COMBO_MS = 300;

let state: State = 'menu';
const g = {
  score: 0, lives: START_LIVES, level: 1,
  phase: 'banner' as 'banner' | 'run' | 'drain', // banner: "Level N" shown; run: waves launch; drain: level time is up, last wave finishing
  levelSteps: 0, endlessSteps: 0, bannerSteps: 0,
  waveLeft: 0, waveBombs: 0, launchCd: 0, waveCd: 0,
};
let overTimer = 0;
let overReason: 'lives' | 'bomb' = 'lives';
let newBest = false;
let runEntry: ScoreEntry | null = null;

function setState(s: State) { state = s; document.body.dataset.state = s; }

function resetGame() {
  Object.assign(g, { score: 0, lives: START_LIVES, level: 1, endlessSteps: 0, waveLeft: 0, waveBombs: 0, launchCd: 0, waveCd: 0 });
  targets = []; halves.length = 0; drops.length = 0; popups.length = 0; blades.clear();
  shake = 0; slowUntil = 0; timeScale = 1;
  sctx.clearRect(0, 0, stain.width, stain.height);
}

function startGame() {
  clearTimeout(overTimer);
  audio.resumeAudio();
  resetGame();
  setBackground(1, true);
  setState('playing');
  hideOverlay();
  beginLevel(1);
}

function beginLevel(level: number) {
  g.level = level;
  if (level > 1) setBackground(level);
  g.levelSteps = LEVEL_SECONDS * 60;
  g.phase = 'banner';
  g.bannerSteps = BANNER_STEPS;
  g.waveLeft = 0; g.waveCd = 0;
  if (level > 1) { g.lives = Math.min(MAX_LIVES, g.lives + 1); audio.levelUp(level); }
  showBanner(isEndless(level) ? `Level ${level}\nEndless` : `Level ${level}`);
  void audio.playMusic(level);
  syncHud();
}

function gameOver(reason: 'lives' | 'bomb') {
  if (state !== 'playing') return;
  setState('gameover');
  overReason = reason;
  ({ isBest: newBest, entry: runEntry } = recordScore(settings, g.score, g.level));
  audio.stopMusic(reason === 'bomb' ? 0.4 : 1.5);
  clearTimeout(overTimer);
  overTimer = window.setTimeout(showGameOver, reason === 'bomb' ? 900 : 500);
  syncHud();
}

function pause() {
  if (state !== 'playing') return;
  setState('paused');
  blades.clear();
  audio.suspendAudio();
  showPause();
}
function resume() {
  if (state !== 'paused') return;
  audio.resumeAudio();
  setState('playing');
  hideOverlay();
  last = performance.now(); acc = 0; // the clock must not jump across the pause
}
function toMenu() {
  clearTimeout(overTimer);
  audio.resumeAudio();
  audio.stopMusic(0.5);
  resetGame();
  setBackground(1);
  setState('menu');
  syncHud();
  showMenu();
}

// ---------------------------------------------------------------- launching waves
function launch(bomb: boolean, speed: number) {
  const kind = bomb ? BOMB : Math.random() < GOLD_CHANCE ? GOLD : FRUITS[Math.floor(Math.random() * FRUITS.length)];
  const grav = 0.00028 * H * speed;                              // px/step^2, scaled to the screen height
  const apex = Math.min(H * (0.5 + Math.random() * 0.3), H - 150); // how high it climbs
  const vy = -Math.sqrt(2 * grav * Math.max(apex, 120));
  const x0 = kind.r + Math.random() * (W - 2 * kind.r);
  const land = W * (0.15 + Math.random() * 0.7);                  // aim to come down inside the screen
  const vx = (land - x0) / (2 * -vy / grav);
  const y0 = H + kind.r;
  targets.push({ kind, x: x0, y: y0, px: x0, py: y0, vx, vy, ang: 0, spin: (Math.random() - 0.5) * 0.12 });
}

/** Gravity matching the current level, so every target on screen falls at the same rate. */
const gravity = () => 0.00028 * H * difficulty(g.level, g.endlessSteps / 60).speed;

function stepTargets() {
  const grav = gravity();
  for (let i = targets.length - 1; i >= 0; i--) {
    const t = targets[i];
    t.px = t.x; t.py = t.y;
    t.vy += grav;
    t.x += t.vx; t.y += t.vy; t.ang += t.spin;
    if (t.vy > 0 && t.y - t.kind.r > H) { // fell out of the bottom
      targets.splice(i, 1);
      if (t.kind !== BOMB && state === 'playing') miss();
    }
  }
}

function miss() {
  g.lives--;
  shake = Math.max(shake, 6);
  audio.miss();
  haptic(30);
  syncHud();
  if (g.lives <= 0) gameOver('lives');
}

function stepGame() {
  stepTargets();
  if (state !== 'playing') return;
  const d = difficulty(g.level, g.endlessSteps / 60);

  if (g.phase === 'banner') { if (--g.bannerSteps <= 0) g.phase = 'run'; return; }

  if (g.waveLeft > 0) {
    if (--g.launchCd <= 0) {
      const bomb = g.waveBombs < d.perWave - 1 && Math.random() < d.bomb;
      if (bomb) g.waveBombs++;
      launch(bomb, d.speed);
      g.waveLeft--;
      g.launchCd = 6 + Math.random() * 6;
    }
  } else if (g.phase === 'run' && --g.waveCd <= 0) {
    g.waveLeft = d.perWave; g.waveBombs = 0; g.launchCd = 0; g.waveCd = d.gap * 60;
  }

  if (g.phase === 'run') {
    if (isEndless(g.level)) g.endlessSteps++;
    else {
      if (--g.levelSteps <= 0) g.phase = 'drain'; // time is up: the current wave still finishes
      if (g.levelSteps % 60 === 0 || g.levelSteps <= 0) syncHud();
    }
  } else if (g.phase === 'drain' && g.waveLeft === 0 && targets.length === 0) {
    beginLevel(g.level + 1);
  }
}

// ---------------------------------------------------------------- effects: juice, halves, stains, popups
type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; shade: string };
type Half = { x: number; y: number; vx: number; vy: number; ang: number; spin: number; side: 1 | -1; life: number; kind: Kind };
type Popup = { text: string; x: number; y: number; life: number; color: string; size: number };
type Blade = { pts: { x: number; y: number; t: number }[]; lastX: number; lastY: number; down: boolean;
  combo: number; comboT: number; comboX: number; comboY: number };

const MAX_DROPS = 400;
const G_STEP = 0.0015 * STEP * STEP; // 1 g in px/step^2
const JUICE_G = 1.5, TRAIL_MS = 170;
const drops: Drop[] = [];
const halves: Half[] = [];
const popups: Popup[] = [];
const blades = new Map<number, Blade>();
let shake = 0, slowUntil = 0, timeScale = 1, fadeTick = 0;

// Stains are painted once onto an offscreen canvas and composited each frame.
const stain = document.createElement('canvas');
const sctx = stain.getContext('2d')!;

function addStain(x: number, y: number, r: number, color: string) {
  sctx.fillStyle = color;
  sctx.globalAlpha = 0.4;
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 1.4;
    sctx.beginPath();
    sctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.15 + Math.random() * 0.45), 0, Math.PI * 2);
    sctx.fill();
  }
  sctx.globalAlpha = 1;
}

function spawnJuice(t: Target, bx: number, by: number) {
  const nx = -by, ny = bx, { kind: k } = t, vx = t.vx, vy = t.vy;
  for (let i = 0; i < 34 && drops.length < MAX_DROPS; i++) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const along = (Math.random() - 0.5) * 1.6, out = 0.4 + Math.random() * 1.2;
    const speed = 2 + Math.random() * 7;
    const max = 40 + Math.random() * 60;
    drops.push({
      x: t.x + bx * (Math.random() - 0.5) * k.r * 1.6, y: t.y + by * (Math.random() - 0.5) * k.r * 1.6,
      vx: vx * 0.5 + (nx * side * out + bx * along) * speed,
      vy: vy * 0.5 + (ny * side * out + by * along) * speed,
      r: 1.5 + Math.random() * 4.5, life: max, max,
      shade: Math.random() < 0.65 ? k.juice[0] : k.juice[1],
    });
  }
}

function addPopup(text: string, x: number, y: number, color = '#fff', size = 28) {
  popups.push({ text, x: Math.min(Math.max(x, 70), W - 70), y: Math.max(y, 90), life: 60, color, size });
}

function sliceTarget(t: Target, bx: number, by: number, bl: Blade, now: number) {
  targets.splice(targets.indexOf(t), 1);
  const { kind: k } = t, nx = -by, ny = bx, ang = Math.atan2(by, bx);
  if (k === BOMB) { explode(t); return; }
  for (const side of [1, -1] as const) {
    halves.push({ x: t.x, y: t.y, vx: t.vx + nx * side * 1.8, vy: t.vy + ny * side * 1.8, ang, spin: side * 0.04, side, life: 70, kind: k });
  }
  spawnJuice(t, bx, by);
  addStain(t.x, t.y, k.r, k.juice[0]);
  g.score += k.points;
  if (k === GOLD) addPopup('+5', t.x, t.y - 30, '#ffd23f', 34);
  audio.slice(k.pitch);
  haptic(12);
  if (bl.combo && now - bl.comboT > COMBO_MS) finishCombo(bl); // the previous combo is over
  bl.combo++; bl.comboT = now; bl.comboX = t.x; bl.comboY = t.y;
  syncHud();
}

function explode(t: Target) {
  for (let i = 0; i < 80 && drops.length < MAX_DROPS; i++) {
    const a = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 12, max = 30 + Math.random() * 40;
    drops.push({ x: t.x, y: t.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 2 + Math.random() * 5, life: max, max,
      shade: ['#ff6a00', '#ffd23f', '#333'][i % 3] });
  }
  addStain(t.x, t.y, 70, '#000');
  shake = 24;
  audio.bomb();
  haptic(80);
  gameOver('bomb');
}

/** Pays out a finished multi-target swipe. */
function finishCombo(bl: Blade) {
  const n = bl.combo;
  bl.combo = 0;
  if (n < 2 || state !== 'playing') return;
  g.score += n * 2;
  addPopup(`Combo x${n}!`, bl.comboX, bl.comboY - 40, '#fff', 30 + Math.min(n, 6) * 4);
  audio.combo(n);
  if (n >= 3) { slowUntil = performance.now() + 450; shake = Math.max(shake, 9); }
  syncHud();
}

/** Cut every target touched by the segment (x0,y0)->(x1,y1). */
function sliceSegment(x0: number, y0: number, x1: number, y1: number, bl: Blade, now: number) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len, uy = dy / len;
  for (const t of targets.slice()) {
    const s = Math.max(0, Math.min(len, (t.x - x0) * ux + (t.y - y0) * uy));
    if (Math.hypot(t.x - (x0 + ux * s), t.y - (y0 + uy * s)) <= t.kind.r + 4) {
      sliceTarget(t, ux, uy, bl, now);
      if (state !== 'playing') return; // a bomb ends the run
    }
  }
}

function stepEffects() {
  const gy = JUICE_G * G_STEP;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vx *= 0.985; d.vy = (d.vy + gy) * 0.985;
    d.x += d.vx; d.y += d.vy;
    if (--d.life <= 0) { drops[i] = drops[drops.length - 1]; drops.pop(); }
  }
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.vy += gy;
    h.x += h.vx; h.y += h.vy; h.ang += h.spin;
    if (--h.life <= 0) halves.splice(i, 1);
  }
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.y -= 0.6;
    if (--p.life <= 0) popups.splice(i, 1);
  }
  shake *= 0.9;
  if (shake < 0.2) shake = 0;
  if (++fadeTick % 20 === 0) { // stains slowly fade
    sctx.globalCompositeOperation = 'destination-out';
    sctx.fillStyle = 'rgba(0,0,0,0.04)';
    sctx.fillRect(0, 0, stain.width, stain.height);
    sctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- background (fades between levels)
const BG_FADE_MS = 1000;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
let bgFrom = BACKGROUNDS[0].map(rgb), bgTo = bgFrom, bgStart = -BG_FADE_MS;

function bgNow(now: number) {
  const k = Math.min(1, (now - bgStart) / BG_FADE_MS);
  return bgFrom.map((c, i) => `rgb(${c.map((v, j) => Math.round(v + (bgTo[i][j] - v) * k)).join(',')})`);
}
function setBackground(level: number, instant = false) {
  const now = performance.now();
  bgFrom = instant ? BACKGROUNDS[level - 1].map(rgb) : bgNow(now).map(c => c.match(/\d+/g)!.map(Number));
  bgTo = BACKGROUNDS[level - 1].map(rgb);
  bgStart = instant ? -BG_FADE_MS : now;
}

// ---------------------------------------------------------------- drawing
function drawTarget(t: Target, x: number, y: number, now: number) {
  const { kind: k } = t, r = k.r;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t.ang);
  ctx.fillStyle = k.color;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  if (k === BOMB) {
    ctx.fillStyle = '#3a3a3a';
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#999'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.3, -r * 1.4, r * 0.6, -r * 1.35); ctx.stroke();
    ctx.fillStyle = now % 160 < 80 ? '#ffd23f' : '#ff6a00'; // flickering spark
    ctx.beginPath(); ctx.arc(r * 0.6, -r * 1.35, r * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e33'; ctx.lineWidth = 2; // warning ring so bombs read at a glance
    ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.fillStyle = k.inner; ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (k === GOLD) { ctx.strokeStyle = '#fff6c4'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

function drawEffects() {
  for (const h of halves) {
    const r = h.kind.r;
    ctx.save();
    ctx.globalAlpha = Math.min(1, h.life / 25);
    ctx.translate(h.x, h.y);
    ctx.rotate(h.ang);
    ctx.fillStyle = h.kind.color;
    ctx.beginPath();
    ctx.arc(0, 0, r, h.side > 0 ? 0 : Math.PI, h.side > 0 ? Math.PI : Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = h.kind.inner; // cut face
    ctx.fillRect(-r, h.side > 0 ? 0 : -4, r * 2, 4);
    ctx.restore();
  }
  for (const d of drops) {
    ctx.globalAlpha = Math.min(1, d.life / (d.max * 0.4));
    ctx.fillStyle = d.shade;
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 20);
    ctx.font = `800 ${p.size}px system-ui`;
    ctx.lineWidth = 5; ctx.strokeStyle = '#000a'; ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}

function drawBlades(now: number) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#fff';
  for (const [id, bl] of blades) {
    bl.pts = bl.pts.filter(p => now - p.t < TRAIL_MS);
    if (!bl.pts.length && !bl.down) { blades.delete(id); continue; }
    for (let i = 1; i < bl.pts.length; i++) {
      const a = 1 - (now - bl.pts[i].t) / TRAIL_MS;
      ctx.globalAlpha = a;
      ctx.lineWidth = 1 + 6 * a;
      ctx.beginPath();
      ctx.moveTo(bl.pts[i - 1].x, bl.pts[i - 1].y);
      ctx.lineTo(bl.pts[i].x, bl.pts[i].y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- HUD and overlays
function syncHud() {
  let h = '';
  for (let i = 0; i < MAX_LIVES; i++) h += `<span${i < g.lives ? '' : ' class="off"'}>♥</span>`;
  heartsEl.innerHTML = h;
  scoreEl.textContent = String(g.score);
  const left = Math.ceil(Math.max(0, g.levelSteps) / 60);
  lvlEl.textContent = isEndless(g.level) ? `Level ${g.level} · endless`
    : `Level ${g.level} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function showBanner(text: string) {
  bannerEl.textContent = text;
  bannerEl.style.whiteSpace = 'pre-line';
  bannerEl.classList.remove('show');
  void bannerEl.offsetWidth; // restart the animation
  bannerEl.classList.add('show');
}

function hideOverlay() { overlayEl.hidden = true; overlayEl.innerHTML = ''; }
function showOverlay(html: string) { overlayEl.innerHTML = `<div class="card">${html}</div>`; overlayEl.hidden = false; }

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function scoreTable(highlight: ScoreEntry | null = null) {
  if (!settings.scores.length) return '';
  const rows = settings.scores.slice(0, 5).map((s, i) =>
    `<li${s === highlight ? ' class="me"' : ''}><span>${i + 1}. ${esc(String(s.name || 'Player'))}</span><span>${s.score} · L${s.level}</span></li>`).join('');
  return `<p>Top 5</p><ol>${rows}</ol>`;
}

function showMenu() {
  showOverlay(`<h1>Juicy Dojo</h1><p>Swipe to slice. Avoid the bombs.</p><p>Best: ${bestScore(settings)}</p>
    ${scoreTable()}<div class="btns"><button data-act="play">Play</button></div>`);
}
function showPause() {
  showOverlay(`<h1>Paused</h1>${scoreTable()}<div class="btns"><button data-act="resume">Resume</button>
    <button class="alt" data-act="play">Restart</button><button class="alt" data-act="menu">Menu</button></div>`);
}
function showGameOver() {
  if (state !== 'gameover') return;
  showOverlay(`<h1>${overReason === 'bomb' ? 'Boom!' : 'Game over'}</h1>
    <div class="big">${g.score}</div>
    ${newBest ? '<p class="new">New best!</p>' : `<p>Best: ${bestScore(settings)}</p>`}
    <p>Reached level ${g.level}</p>
    ${runEntry ? `<input id="name" maxlength="${NAME_MAX}" placeholder="Your name (optional)" value="${esc(settings.name)}" autocomplete="off">` : ''}
    ${scoreTable(runEntry)}
    <div class="btns"><button data-act="play">Restart</button><button class="alt" data-act="share">Share</button></div>`);
}

async function shareScore(btn: HTMLButtonElement) {
  const text = `I scored ${g.score} and reached level ${g.level} in Juicy Dojo!`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Juicy Dojo', text, url: location.href }); return; }
    await navigator.clipboard.writeText(`${text} ${location.href}`);
    btn.textContent = 'Copied!';
  } catch { /* share sheet dismissed or clipboard blocked */ }
}

overlayEl.addEventListener('input', e => {
  const el = e.target as HTMLInputElement;
  if (el.id !== 'name') return;
  setName(settings, runEntry, el.value.trim());
  // keep the highlighted row in the table in sync as they type
  const me = overlayEl.querySelector('li.me span');
  if (me) me.textContent = `${settings.scores.indexOf(runEntry!) + 1}. ${el.value.trim() || 'Player'}`;
});
overlayEl.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
  if (!btn) return;
  audio.unlockAudio();
  switch (btn.dataset.act) {
    case 'play': startGame(); break;
    case 'resume': resume(); break;
    case 'menu': toMenu(); break;
    case 'share': void shareScore(btn); break;
  }
});
pauseBtn.onclick = () => pause();
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('pagehide', pause);
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return; // typing a name
  if (e.key === 'Escape' || e.key === 'p') { state === 'playing' ? pause() : resume(); }
});

// ---------------------------------------------------------------- sound controls
const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
function syncSound() {
  const off = settings.muted || settings.volume === 0;
  muteBtn.innerHTML = off ? ICON_OFF : ICON_ON;
  muteBtn.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  volumeEl.value = String(Math.round(settings.volume * 100));
  audio.setMuted(settings.muted);
  audio.setVolume(settings.volume);
  saveSettings(settings);
}
muteBtn.onclick = () => {
  audio.unlockAudio();
  if (settings.volume === 0) settings.volume = 0.5; // unmuting from a zeroed slider
  settings.muted = !settings.muted;
  syncSound();
};
volumeEl.oninput = () => {
  audio.unlockAudio();
  settings.volume = Number(volumeEl.value) / 100;
  if (settings.volume > 0) settings.muted = false;
  syncSound();
};
syncSound();

// ---------------------------------------------------------------- input: swipe to slice
canvas.addEventListener('pointerdown', e => {
  audio.unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  blades.set(e.pointerId, { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], lastX: e.clientX, lastY: e.clientY,
    down: true, combo: 0, comboT: 0, comboX: 0, comboY: 0 });
});
canvas.addEventListener('pointermove', e => {
  const bl = blades.get(e.pointerId);
  if (!bl?.down) return;
  // coalesced events keep fast swipes from skipping over a target
  for (const ev of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
    const t = performance.now();
    if (state === 'playing') sliceSegment(bl.lastX, bl.lastY, ev.clientX, ev.clientY, bl, t);
    const seg = Math.hypot(ev.clientX - bl.lastX, ev.clientY - bl.lastY);
    audio.swoosh(seg / Math.max(1, t - (bl.pts[bl.pts.length - 1]?.t ?? t - 16)));
    bl.lastX = ev.clientX; bl.lastY = ev.clientY;
    bl.pts.push({ x: ev.clientX, y: ev.clientY, t });
  }
});
function endBlade(e: PointerEvent) {
  const bl = blades.get(e.pointerId);
  if (!bl) return;
  bl.down = false;
  finishCombo(bl);
}
canvas.addEventListener('pointerup', endBlade);
canvas.addEventListener('pointercancel', endBlade);

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2); // cap for phone frame rate
  W = innerWidth; H = innerHeight;
  scaleKinds();
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stain.width = W * dpr; stain.height = H * dpr; // stains are lost on resize, which is fine
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
resize();
setState('menu');
syncHud();
showMenu();

// ---------------------------------------------------------------- main loop
// Fixed 60 Hz step (stable, deterministic) with interpolated rendering,
// so motion stays smooth on any display refresh rate (60/90/120 Hz).
let last = performance.now();
let acc = 0;
let fpsFrames = 0, fpsT = last;
if (import.meta.env.DEV) fpsEl.hidden = false;

function frame(now: number) {
  const dt = Math.min(now - last, 250);
  last = now;
  if (state !== 'paused') {
    const want = now < slowUntil ? 0.3 : 1; // slow-motion on big combos
    timeScale += (want - timeScale) * 0.15;
    acc += dt * timeScale;
    while (acc >= STEP) {
      stepGame();
      stepEffects();
      acc -= STEP;
    }
    for (const bl of blades.values()) if (bl.combo && now - bl.comboT > COMBO_MS) finishCombo(bl);
  }
  const alpha = acc / STEP;

  const [top, bottom] = bgNow(now);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  ctx.drawImage(stain, 0, 0, W, H);
  for (const t of targets) drawTarget(t, t.px + (t.x - t.px) * alpha, t.py + (t.y - t.py) * alpha, now);
  drawEffects();
  ctx.restore();
  drawBlades(now);

  if (!fpsEl.hidden && ++fpsFrames && now - fpsT > 500) {
    fpsEl.textContent = `${Math.round(fpsFrames * 1000 / (now - fpsT))} fps`;
    fpsFrames = 0; fpsT = now;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
