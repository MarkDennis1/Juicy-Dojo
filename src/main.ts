import './style.css';
import Matter from 'matter-js';
import { requestMotion, startMotion } from './sensor';
import { loadSettings, saveSettings } from './settings';

const { Engine, Bodies, Composite, Body } = Matter;

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const invertBtn = document.getElementById('invert') as HTMLButtonElement;
const resetBtn = document.getElementById('reset') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLElement;

const settings = loadSettings();
const R = 25, WALL = 200, MAX_BALLS = 60;

const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0.0015 } });
let walls: Matter.Body[] = [];
const balls: Matter.Body[] = [];
let W = 0, H = 0, dpr = 1;
let usingMotion = false;

function makeBall(x = W / 2, y = H / 3): Matter.Body {
  const b = Bodies.circle(x, y, R, { restitution: 0.7, friction: 0.02, frictionAir: 0.004, density: 0.002 });
  Body.setVelocity(b, { x: (Math.random() - 0.5) * 6, y: 0 });
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

// Sensor/pointer set a target; the physics step eases toward it so gravity changes aren't stepwise.
let targetGx = 0, targetGy = 0;
function setGravity(gx: number, gy: number) {
  targetGx = gx;
  targetGy = gy;
}

function setBallCount(n: number) {
  while (balls.length > n) Composite.remove(engine.world, balls.pop()!);
  while (balls.length < n) makeBall(R + Math.random() * (W - 2 * R), R + Math.random() * (H / 2));
  settings.balls = n;
  settings.best = Math.max(settings.best, n);
  saveSettings(settings);
}

// UI
startBtn.onclick = async () => {
  try {
    if (!(await requestMotion())) { statusEl.textContent = 'Motion permission denied.'; return; }
  } catch { statusEl.textContent = 'Could not request motion access.'; return; }
  startMotion((gx, gy) => {
    if (!usingMotion) { usingMotion = true; statusEl.textContent = ''; invertBtn.hidden = false; }
    setGravity(gx, gy);
  }, () => settings.invert);
  startBtn.remove();
  statusEl.textContent = 'Waiting for sensor…';
  setTimeout(() => {
    if (!usingMotion) statusEl.textContent = 'No motion sensor (phones need HTTPS). Move your pointer to tilt.';
  }, 1500);
};
invertBtn.onclick = () => { settings.invert = !settings.invert; saveSettings(settings); };
resetBtn.onclick = () => setBallCount(1);

// Pointer: tap/click empty space to drop another ball; hovering tilts when there's no sensor.
canvas.addEventListener('pointerdown', e => {
  if (balls.length < MAX_BALLS) setBallCount(balls.length + 1), Body.setPosition(balls[balls.length - 1], { x: e.clientX, y: e.clientY });
});
addEventListener('pointermove', e => {
  if (usingMotion) return;
  setGravity((e.clientX / W - 0.5) * 2, (e.clientY / H - 0.5) * 2);
});

addEventListener('resize', resize);
resize();
setBallCount(settings.balls);

// Fixed 60 Hz physics step (stable, deterministic) with interpolated rendering,
// so motion stays smooth on any display refresh rate (60/90/120 Hz).
const STEP = 1000 / 60;
let last = performance.now();
let acc = 0;
function frame(now: number) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= STEP) {
    engine.gravity.x += (targetGx - engine.gravity.x) * 0.35;
    engine.gravity.y += (targetGy - engine.gravity.y) * 0.35;
    Engine.update(engine, STEP);
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
  ctx.fillStyle = '#666';
  ctx.font = '14px system-ui';
  ctx.fillText(`balls ${balls.length}  best ${settings.best}`, 12, H - 14);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
