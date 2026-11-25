# Wobble

Wobble is a small slicing game that runs in the browser. Balls drift and bounce around the screen like targets, and you swipe across them to slice them in two, with a spray of juice and sound effects. It's an installable, offline-capable PWA.

## How it works

- **Physics:** [Matter.js](https://brm.io/matter-js/) moves the balls. Four static walls surround the viewport. There is no gravity: each ball keeps its own constant speed, bounces off the walls, and passes through other balls like a target.
- **Rendering:** a plain 2D canvas, scaled for high-DPI screens.
- **Sound:** effects are synthesised with the Web Audio API in [src/audio.ts](src/audio.ts), so there are no audio files to load. Audio starts on your first touch or click, as browsers require.
- **Persistence:** ball count, best count and the sound setting are saved in `localStorage` ([src/settings.ts](src/settings.ts)).
- **PWA:** a web manifest and a network-first service worker ([public/sw.js](public/sw.js)) let it install to a home screen and work offline.

## Controls

| Action | Result |
| --- | --- |
| Swipe across balls | Slices them in two, with a spray of red juice |
| Swipe quickly | Plays a blade "whoosh" |
| Speaker icon | Mutes or unmutes all sound |
| Volume slider | Adjusts the sound volume (both settings are remembered) |
| Tap / click the screen | Drops another ball at that spot (up to 60) |
| **Reset** | Goes back to a single ball |

The bottom-left corner shows the current ball count, your best count and how many balls you've sliced. If you slice the last ball, a new one drops in after a moment.

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
3. Open the URL Vite prints, usually `http://localhost:5173`. Drag across a ball to slice it, and click empty space to add more.
4. To try it on a phone on the same Wi-Fi, open the "Network" URL Vite prints (for example `http://192.168.x.x:5173`). 

## Deployment

The build uses a relative base (`./`), so the contents of `dist/` can be hosted as static files on Netlify, Vercel, GitHub Pages (including sub-paths) or any other static host.

## Project structure

```
index.html            App shell and UI buttons
src/main.ts           Physics world, rendering, input handling
src/audio.ts          Synthesised sound effects
src/settings.ts       localStorage-backed settings
src/style.css         Styles
public/               Manifest, service worker, icon
```

## Tech stack

TypeScript, Vite, Matter.js.
