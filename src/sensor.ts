/** Gravity in screen space, in units of g (x right, y down). */
export type GravityHandler = (gx: number, gy: number) => void;

const isAndroid = /android/i.test(navigator.userAgent);

type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

/** Ask for motion access (iOS 13+ needs a user tap). Returns true if allowed. */
export async function requestMotion(): Promise<boolean> {
  const M = (globalThis as { DeviceMotionEvent?: MotionCtor }).DeviceMotionEvent;
  if (M?.requestPermission) return (await M.requestPermission()) === 'granted';
  return true;
}

/** Start listening. `getInvert` is read on every event. Returns a stop function. */
export function startMotion(onGravity: GravityHandler, getInvert: () => boolean): () => void {
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null) return;
    // Android reports the reaction force (flat = +z); iOS reports gravity itself.
    const s = isAndroid ? -1 : 1;
    const dx = s * a.x, dy = -s * a.y; // gravity in device frame, y down
    const ang = (((screen.orientation?.angle ?? 0) % 360) + 360) % 360;
    let sx: number, sy: number;
    if (ang === 90)       { sx =  dy; sy = -dx; }
    else if (ang === 270) { sx = -dy; sy =  dx; }
    else if (ang === 180) { sx = -dx; sy = -dy; }
    else                  { sx =  dx; sy =  dy; }
    const k = (getInvert() ? -1 : 1) / 9.81;
    onGravity(sx * k, sy * k);
  };
  addEventListener('devicemotion', handler);
  return () => removeEventListener('devicemotion', handler);
}
