# Wobble

Wobble is a small tilt-controlled physics toy that runs in the browser. A ball rolls and bounces around the screen, and gravity follows how you tilt your phone. On a desktop, moving the pointer tilts it instead. It's an installable, offline-capable PWA.

## How it works

- **Physics:** [Matter.js](https://brm.io/matter-js/) simulates the balls. Four static walls surround the viewport, and the balls bounce off them and each other.
- **Tilt input:** the `devicemotion` sensor drives gravity. Android and iOS report acceleration with opposite signs, and the code corrects for that and for screen rotation ([src/sensor.ts](src/sensor.ts)).
- **Pointer fallback:** with no motion sensor, moving the pointer across the screen tilts gravity toward it.
- **Rendering:** a plain 2D canvas, scaled for high-DPI screens.
- **Persistence:** ball count, best count and the "flip tilt" setting are saved in `localStorage` ([src/settings.ts](src/settings.ts)).
- **PWA:** a web manifest and a network-first service worker ([public/sw.js](public/sw.js)) let it install to a home screen and work offline.

## Controls

| Action | Result |
| --- | --- |
| **Enable gravity** button | Requests motion-sensor permission (required on iOS) and starts tilt control |
| Tilt the device | Changes the direction of gravity |
| Tap / click the screen | Drops another ball at that spot (up to 60) |
| Move the pointer | Tilts gravity when no sensor is available |
| **Flip tilt** | Inverts the tilt direction (appears once a sensor is active) |
| **Reset** | Goes back to a single ball |

The bottom-left corner shows the current ball count and your best count.

## Getting started

Requires Node.js.

```bash
npm install
npm run dev       # start the dev server (exposed on the network)
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

### Run it locally

1. Install [Node.js](https://nodejs.org/) (a current LTS version).
2. In the project folder, run `npm install`, then `npm run dev`.
3. Open the URL Vite prints, usually `http://localhost:5173`. Move the mouse to tilt the ball and click to add more balls.
4. To try it on a phone on the same Wi-Fi, open the "Network" URL Vite prints (for example `http://192.168.x.x:5173`). Tilt control won't work there, because phone sensors need HTTPS. The pointer fallback still works.

Phone motion sensors only work over **HTTPS**. To try it on a device, deploy the build or serve the dev server over a secure tunnel.

## Deployment

The build uses a relative base (`./`), so the contents of `dist/` can be hosted as static files on Netlify, Vercel, GitHub Pages (including sub-paths) or any other static host.

## Project structure

```
index.html            App shell and UI buttons
src/main.ts           Physics world, rendering, input handling
src/sensor.ts         Device motion -> gravity conversion
src/settings.ts       localStorage-backed settings
src/style.css         Styles
public/               Manifest, service worker, icon
```

## Tech stack

TypeScript, Vite, Matter.js.
