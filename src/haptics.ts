/** Haptic tick. Android uses navigator.vibrate. iOS Safari 17.4+ ticks when a
 *  `<input type="checkbox" switch>` is toggled, which only works from a user gesture (best effort). */
let label: HTMLLabelElement | null = null;
let lastTick = 0;

export function haptic(ms = 12): void {
  if (navigator.vibrate) { navigator.vibrate(ms); return; }
  const now = performance.now();
  if (now - lastTick < 40) return;
  lastTick = now;
  if (!label) {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    label.appendChild(input);
    document.body.appendChild(label);
  }
  label.click();
}
