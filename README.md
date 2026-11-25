# 🍉 Juicy Dojo

> *I miss playing Fruit Ninja, so I made my own.* 🥷

### 👉 [Play it here!](https://juicy-dojo.markdennissanchez1.workers.dev/) 🍉

Juicy Dojo is a small slicing game that runs in the browser. 🍎 Targets fly up from the bottom of the screen, and you swipe across them to slice them in two, with a spray of juice 💦 and satisfying sound effects. It's an installable, offline-capable PWA, so you can add it to your phone's home screen 📱 and play anywhere.

## 🎮 How it works

- 🍓 **Game loop:** targets are launched from the bottom of the screen in waves, arc across and fall out. A target that falls out uncut costs a heart ❤️. You start with 5 hearts and earn one back at each level-up (up to 5). Slicing a bomb 💣 ends the run at once.
- 📈 **Levels:** 9 levels. Levels 1 to 8 last 60 seconds; when the time is up the current wave finishes, then the next level starts. Level 9 is endless and keeps getting harder. All tuning is in [src/levels.ts](src/levels.ts).
- ⭐ **Scoring:** 1 point per fruit, 5 for a golden one 🌟, and a bonus for slicing 2 or more in one swipe ("Combo x3!" 🔥). Big combos trigger a short slow-motion and a screen shake.
- 🎶 **Music:** one looping `.m4a` track per level in `public/music/`, crossfaded at level-up. Tracks are fetched lazily (the current and next level) and cached by the service worker, so offline play works after one full run.
- 🧪 **Physics:** a fixed 60 Hz step with interpolated rendering. Targets follow simple ballistic motion, with gravity scaled to the screen height.
- 🎨 **Rendering:** a plain 2D canvas, scaled for high-DPI screens (capped at 2x). Juice stains are painted onto an offscreen canvas and fade slowly.
- 🔊 **Sound:** effects are synthesised with the Web Audio API in [src/audio.ts](src/audio.ts). Audio starts on your first tap or click, as browsers require.
- 💾 **Persistence:** the volume, mute setting and top-10 score table are saved in `localStorage` ([src/settings.ts](src/settings.ts)).
- 📲 **PWA:** a web manifest and a network-first service worker ([public/sw.js](public/sw.js)) let it install to a home screen and work offline.

## 👆 Controls

| Action | Result |
| --- | --- |
| Swipe across targets | Slices them in two, with a spray of juice |
| Swipe across a bomb | Game over 💥 |
| Pause button / Esc / P | Pauses. The game also pauses when you switch apps or tabs |
| Speaker icon, volume slider | Mute and volume for sound and music (remembered) |
| Share (game-over screen) | Opens the share sheet, or copies your score |

In development (`npm run dev`) an fps readout shows in the bottom-right corner.

## 🚀 Getting started

Requires Node.js.

```bash
npm install
npm run dev       # start the dev server (exposed on the network)
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

### 💻 Run it locally

1. Install [Node.js](https://nodejs.org/) (a current LTS version).
2. In the project folder, run `npm install`, then `npm run dev`.
3. Open the URL Vite prints, usually `http://localhost:5173`. Press Play, then drag across targets to slice them.
4. To try it on a phone on the same Wi-Fi, open the "Network" URL Vite prints (for example `http://192.168.x.x:5173`). 

## 🎵 Music

The nine tracks in `public/music/` come from [Pixabay's Japan lofi search](https://pixabay.com/music/search/japan%20lofi/). Pixabay music is free to use in a game like this without attribution under the Pixabay Content License, which does not allow reselling or redistributing the tracks on their own. The project owner confirmed they are free to use. They are re-encoded to 64 kbps mono AAC (`.m4a`), about 6.4 MB in total, and are fetched lazily (the current and next level) instead of being precached. The original MP3s are kept outside the repo.

## 🛠️ Tech stack

TypeScript and Vite. Made with 🍉 and a bit of nostalgia.
