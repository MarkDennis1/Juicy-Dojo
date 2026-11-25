import './style.css';
import Matter from 'matter-js';
import { slice as playSlice, setMuted, setVolume, swoosh, unlockAudio } from './audio';
import { loadSettings, saveSettings } from './settings';

const { Engine, Bodies, Composite, Body } = Matter;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const volumeEl = document.getElementById('volume') as HTMLInputElement;
const muteBtn = document.getElementById('mute') as HTMLButtonElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;

const settings = loadSettings();
const R = 25, WALL = 200, MAX_BALLS = 60;

const engine = Engine.create({ gravity: { x: 0, y: 0 } });
let walls: Matter.Body[] = [];
const balls: Matter.Body[] = [];
let W = 0, H = 0, dpr = 1;

const MIN_SPEED = 3, MAX_SPEED = 6;
const speeds = new WeakMap<Matter.Body, number>();

/** A target: drifts at constant speed, bounces off the walls, passes through other balls. */
function makeBall(x = W / 2, y = H / 3): Matter.Body {
  const b = Bodies.circle(x, y, R, {
    restitution: 1, friction: 0, frictionAir: 0, frictionStatic: 0, inertia: Infinity,
    collisionFilter: { group: -1 }, // same negative group: balls never collide with each other
  });
  const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED), a = Math.random() * Math.PI * 2;
  speeds.set(b, speed);
  Body.setVelocity(b, { x: Math.cos(a) * speed, y: Math.sin(a) * speed });
  Composite.add(engine.world, b);
  balls.push(b);
  return b;
}

function buildWalls() {
  Composite.remove(engine.world, walls);
  const o = { isStatic: true, restitution: 0.7 };
  walls = [
    Bodies.rectangle(W / 2, -WALL / 2, W + WALL * 2, WALL, o),
    Bodies.rectangle(W / 2, H + WALL / 2, W + WALL * 2, WALL, o),
    Bodies.rectangle(-WALL / 2, H / 2, WALL, H + WALL * 2, o),
    Bodies.rectangle(W + WALL / 2, H / 2, WALL, H + WALL * 2, o),
  ];
  Composite.add(engine.world, walls);
  for (const b of balls) { // keep balls on screen after a resize/rotation
    Body.setPosition(b, {
      x: Math.min(Math.max(b.position.x, R), W - R),
      y: Math.min(Math.max(b.position.y, R), H - R),
    });
  }
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = innerWidth; H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildWalls();
}

function setBallCount(n: number) {
  while (balls.length > n) Composite.remove(engine.world, balls.pop()!);
  while (balls.length < n) makeBall(R + Math.random() * (W - 2 * R), R + Math.random() * (H / 2));
  settings.balls = n;
  settings.best = Math.max(settings.best, n);
  saveSettings(settings);
}

// --- Slicing (swipe to cut balls) and juice ---
type Drop = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; shade: string };
type Half = { x: number; y: number; vx: number; vy: number; ang: number; spin: number; side: 1 | -1; life: number };
type Blade = { pts: { x: number; y: number; t: number }[]; lastX: number; lastY: number; startX: number; startY: number;
  dist: number; sliced: boolean; down: boolean };

const STEP = 1000 / 60;
const TRAIL_MS = 170, MAX_DROPS = 400;
const G_STEP = 0.0015 * STEP * STEP; // 1 g in px/step^2
const JUICE_G = 1.5;                  // juice and cut halves fall straight down
const drops: Drop[] = [];
const halves: Half[] = [];
const blades = new Map<number, Blade>();
let sliced = 0;

function spawnJuice(x: number, y: number, bx: number, by: number, vx: number, vy: number) {
  const nx = -by, ny = bx; // blade normal
  for (let i = 0; i < 34 && drops.length < MAX_DROPS; i++) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const along = (Math.random() - 0.5) * 1.6, out = 0.4 + Math.random() * 1.2;
    const speed = 2 + Math.random() * 7;
    const px = x + bx * (Math.random() - 0.5) * R * 1.6, py = y + by * (Math.random() - 0.5) * R * 1.6;
    const max = 40 + Math.random() * 60;
    drops.push({
      x: px, y: py,
      vx: vx * 0.5 + (nx * side * out + bx * along) * speed,
      vy: vy * 0.5 + (ny * side * out + by * along) * speed,
      r: 1.5 + Math.random() * 4.5, life: max, max,
      shade: Math.random() < 0.65 ? '#c2001f' : '#7d0016',
    });
  }
}

function sliceBall(b: Matter.Body, bx: number, by: number) {
  const { x, y } = b.position, { x: vx, y: vy } = b.velocity;
  const nx = -by, ny = bx;
  Composite.remove(engine.world, b);
  balls.splice(balls.indexOf(b), 1);
  const ang = Math.atan2(by, bx);
  for (const side of [1, -1] as const) {
    halves.push({ x, y, vx: vx + nx * side * 1.8, vy: vy + ny * side * 1.8, ang, spin: side * 0.04, side, life: 70 });
  }
  spawnJuice(x, y, bx, by, vx, vy);
  sliced++;
  playSlice();
  navigator.vibrate?.(12);
  if (!balls.length) setTimeout(() => { if (!balls.length) makeBall(R + Math.random() * (W - 2 * R), R); }, 700);
}

/** Cut every ball touched by the segment (x0,y0)->(x1,y1). */
function sliceSegment(x0: number, y0: number, x1: number, y1: number) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 2) return false;
  const ux = dx / len, uy = dy / len;
  let hit = false;
  for (const b of balls.slice()) {
    const t = Math.max(0, Math.min(len, (b.position.x - x0) * ux + (b.position.y - y0) * uy));
    if (Math.hypot(b.position.x - (x0 + ux * t), b.position.y - (y0 + uy * t)) <= R) {
      sliceBall(b, ux, uy);
      hit = true;
    }
  }
  return hit;
}

function stepEffects() {
  const gx = 0, gy = JUICE_G * G_STEP;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.vx = (d.vx + gx) * 0.985; d.vy = (d.vy + gy) * 0.985;
    d.x += d.vx; d.y += d.vy;
    if (--d.life <= 0) { drops[i] = drops[drops.length - 1]; drops.pop(); }
  }
  for (let i = halves.length - 1; i >= 0; i--) {
    const h = halves[i];
    h.vx += gx; h.vy += gy;
    h.x += h.vx; h.y += h.vy; h.ang += h.spin;
    if (--h.life <= 0) halves.splice(i, 1);
  }
}

function drawEffects(now: number) {
  for (const h of halves) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, h.life / 25);
    ctx.translate(h.x, h.y);
    ctx.rotate(h.ang);
    ctx.fillStyle = '#4fc3f7';
    ctx.beginPath();
    ctx.arc(0, 0, R, h.side > 0 ? 0 : Math.PI, h.side > 0 ? Math.PI : Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c2001f'; // cut face
    ctx.fillRect(-R, h.side > 0 ? 0 : -4, R * 2, 4);
    ctx.restore();
  }
  for (const d of drops) {
    ctx.globalAlpha = Math.min(1, d.life / (d.max * 0.4));
    ctx.fillStyle = d.shade;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

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

const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
function syncSound() {
  const off = settings.muted || settings.volume === 0;
  muteBtn.innerHTML = off ? ICON_OFF : ICON_ON;
  muteBtn.setAttribute('aria-label', off ? 'Unmute' : 'Mute');
  volumeEl.value = String(Math.round(settings.volume * 100));
  setMuted(settings.muted);
  setVolume(settings.volume);
  saveSettings(settings);
}
muteBtn.onclick = () => {
  unlockAudio();
  if (settings.volume === 0) settings.volume = 0.5; // unmuting from a zeroed slider
  settings.muted = !settings.muted;
  syncSound();
};
volumeEl.oninput = () => {
  unlockAudio();
  settings.volume = Number(volumeEl.value) / 100;
  if (settings.volume > 0) settings.muted = false;
  syncSound();
};
syncSound();
resetBtn.onclick = () => setBallCount(1);

// Pointer: swipe to slice balls; a tap on empty space drops another ball; hovering tilts when there's no sensor.
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  canvas.setPointerCapture(e.pointerId);
  blades.set(e.pointerId, { pts: [{ x: e.clientX, y: e.clientY, t: performance.now() }], lastX: e.clientX, lastY: e.clientY,
    startX: e.clientX, startY: e.clientY, dist: 0, sliced: false, down: true });
});
canvas.addEventListener('pointermove', e => {
  const bl = blades.get(e.pointerId);
  if (!bl?.down) return;
  // coalesced events keep fast swipes from skipping over a ball
  for (const ev of e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]) {
    if (sliceSegment(bl.lastX, bl.lastY, ev.clientX, ev.clientY)) bl.sliced = true;
    const seg = Math.hypot(ev.clientX - bl.lastX, ev.clientY - bl.lastY);
    const t = performance.now();
    swoosh(seg / Math.max(1, t - (bl.pts[bl.pts.length - 1]?.t ?? t - 16)));
    bl.dist += seg;
    bl.lastX = ev.clientX; bl.lastY = ev.clientY;
    bl.pts.push({ x: ev.clientX, y: ev.clientY, t });
  }
});
function endBlade(e: PointerEvent, tap: boolean) {
  const bl = blades.get(e.pointerId);
  if (!bl) return;
  bl.down = false;
  if (tap && !bl.sliced && bl.dist < 12 && balls.length < MAX_BALLS) {
    setBallCount(balls.length + 1);
    Body.setPosition(balls[balls.length - 1], { x: bl.startX, y: bl.startY });
  }
}
canvas.addEventListener('pointerup', e => endBlade(e, true));
canvas.addEventListener('pointercancel', e => endBlade(e, false));
addEventListener('resize', resize);
resize();
setBallCount(settings.balls);

/** Matter bleeds a little speed on bounces; hold each target at its own constant speed. */
function keepSpeed() {
  for (const b of balls) {
    const v = Math.hypot(b.velocity.x, b.velocity.y), want = speeds.get(b) ?? MIN_SPEED;
    if (v < 0.01) Body.setVelocity(b, { x: want, y: 0 });
    else if (Math.abs(v - want) > 0.01) Body.setVelocity(b, { x: (b.velocity.x / v) * want, y: (b.velocity.y / v) * want });
  }
}

// Fixed 60 Hz physics step (stable, deterministic) with interpolated rendering,
// so motion stays smooth on any display refresh rate (60/90/120 Hz).
let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= STEP) {
    Engine.update(engine, STEP);
    keepSpeed();
    stepEffects();
    acc -= STEP;
  }
  const alpha = acc / STEP;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#4fc3f7';
  for (const b of balls) {
    const pp = (b as Matter.Body & { positionPrev: Matter.Vector }).positionPrev;
    const x = pp.x + (b.position.x - pp.x) * alpha;
    const y = pp.y + (b.position.y - pp.y) * alpha;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
  }
  drawEffects(now);
  ctx.fillStyle = '#666';
  ctx.font = '14px system-ui';
  ctx.fillText(`balls ${balls.length}  best ${settings.best}  sliced ${sliced}`, 12, H - 14);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
