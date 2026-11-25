# Juicy Dojo: Roadmap

Juicy Dojo is a slicing game: targets drift around the screen and you swipe across them to cut them in two, with juice and sound. Today it is a toy. It has no score, no way to lose and no variety. This plan turns it into a game people replay.

## Where we are

Already built:

- Swipe-to-slice with a blade trail, split halves and juice particles
- Synthesised slice and whoosh sounds, a mute icon and a volume slider
- Targets that move at a constant speed and bounce off the walls
- A fixed 60 Hz physics step with interpolated rendering
- Installable, offline-capable PWA

Not built yet: scoring, losing, variety, difficulty and anything that persists beyond a ball count.

## Phases

Each phase can ship on its own. The order matters, because later phases build on earlier ones.

### Phase 1: Core game loop

Turns the toy into a game. Do this first.

| Feature | What it does |
| --- | --- |
| **Combos** | Slicing 2 or more targets in one swipe gives a bonus and a "Combo x3!" popup. A rising sound plays, higher for bigger combos. |
| **Launch movement** | Targets are thrown up from the bottom of the screen, arc across and fall out. This replaces the constant-speed wall bounce. |
| **Bombs** | Some targets are black bombs. Slicing one ends the run immediately, whatever your lives. This gives swiping a reason to be careful. |
| **Lives and game over** | You start with 3 lives. You lose one each time a target falls out uncut (a miss). At 0 lives, or on any bomb hit, a game-over screen shows your score and best, with a restart button. |
| **Levels and difficulty ramp** | The run is split into 9 levels (see [Levels](#levels)). Each level launches faster and more numerous than the last. Targets come in waves instead of all sitting on screen. |
| **Remove tap-to-add** | The existing "tap to add a ball" behaviour goes away. Targets only come from waves. |

**Decided: what counts as a "miss"?** The launch model (Fruit Ninja style). A target that falls out of the bottom of the screen uncut is a miss and costs a life. This brings gravity back for targets (not for the player), and the wall-bounce code in [src/main.ts](src/main.ts) is replaced rather than extended. Bombs that fall out uncut are not misses.

**Decided: bombs end the run.** One bomb hit is game over. There is no hard-mode toggle, so lives only matter for missed targets.

### Levels

A run is a sequence of 9 levels. Levels 1 to 8 are timed. Level 9 has no end: it is the endless mode, and its music loops until the player loses.

| Level | Length | Track | Track length |
| --- | --- | --- | --- |
| 1 | 60 s | `level_1.mp3` | 3:29 |
| 2 | 60 s | `level_2.mp3` | 1:50 |
| 3 | 60 s | `level_3.mp3` | 2:13 |
| 4 | 60 s | `level_4.mp3` | 3:19 |
| 5 | 60 s | `level_5.mp3` | 0:30 |
| 6 | 60 s | `level_6.mp3` | 0:34 |
| 7 | 60 s | `level_7.mp3` | 1:29 |
| 8 | 60 s | `level_8.mp3` | 2:07 |
| 9 | endless | `level_9.mp3` | 3:19 (loops) |

**Decided: 60 seconds per level.** It is long enough for a few waves and a combo or two, and short enough that the music and difficulty change before the player gets bored. Reaching the endless level takes about 8 minutes, which is a good session length on a phone. Adjust the numbers after playtesting. Keep them in one config array so tuning is a one-line change.

How levels work:

- **Level timer:** counts only while the game is `playing`, so pausing or switching apps doesn't burn time. Add it to the state machine.
- **Level-up:** at 0:00 the current wave finishes, then a short "Level N" banner shows and the next track starts. The score and lives carry over.
- **Difficulty is per level:** each level sets launch speed, targets per wave and bomb chance. Level 9 keeps ramping slowly with time so endless mode never plateaus.
- **Music per level:** the track changes at each level-up with a short crossfade (about 1 s). Levels 5 and 6 have tracks shorter than 60 s, so those loop. Longer tracks are cut off by the crossfade when the level ends.
- **Level 9 loops:** set `loop = true` on that track only. Check that `level_9.mp3` loops without an audible gap. MP3 has encoder padding that can cause a click at the loop point, which is one more reason to re-encode (see Music below).
- **Scoring and best score:** the game-over screen shows the level reached next to the score.

### Phase 2: Game feel

| Feature | What it does |
| --- | --- |
| **Varied targets** | Different colours and sizes. The juice colour matches the target (watermelon-red, lime-green and so on). A golden bonus target is worth extra points. |
| **Juice stains** | Splats stay on the background and slowly fade, so the screen gets messier as you play. |
| **Slow-motion hit** | A brief slow-down on a big combo, plus a small screen shake. |
| **Better sounds** | A different pitch for each target type, a bomb explosion sound and one background music track per level. |

Notes:

- Stains should be drawn once to an offscreen canvas and composited each frame, not redrawn as particles, to stay fast on phones.
- Slow-motion scales the physics time step. The fixed-step loop in [src/main.ts](src/main.ts) already makes that straightforward.
- The explosion sound should be synthesised like the others in [src/audio.ts](src/audio.ts). Music is the only feature here that needs real audio files.
- **Music:** there are 9 tracks, one per level, in [public/music/](public/music/). Browsers block audio until a tap, so start the first track on the first touch. The existing mute icon and volume slider should control all of them, and the music should pause when the game pauses. Make sure every track is licensed for use.
- **Music size is a problem.** The nine MP3s total about 35 MB (level 1 alone is 6.7 MB). That is far too much to precache for a phone PWA. Before shipping:
  - Re-encode to mono Opus or AAC at about 48 to 64 kbps. That should bring the whole set to roughly 3 to 5 MB with little audible loss for game music.
  - ~~Trim levels 1 to 4 and 8 to about 90 s.~~ Done: levels 1 to 4 and 8 were cut to 90 s without re-encoding, and level 9 is kept whole because it loops. The cut has no fade-out, so the crossfade at level-up must hide it. The tracks are 256 kbps, so the set is still about 25 MB and re-encoding is still needed.
  - Precache only levels 1 and 2. Fetch the rest in the background during play (the next level's track while the current one plays) and add them to the runtime cache, so offline play works after one full run.
  - Play music through a single `<audio>` element, or Web Audio for the crossfade, and reuse it instead of creating one per level.

### Phase 3: Polish and retention

| Feature | What it does |
| --- | --- |
| **High-score table** | Scores are saved locally. The best score shows on the game-over screen. |
| **Pause** | A pause button, plus the game pauses automatically when you switch apps or tabs. |
| **Haptics on iPhone** | See the note below. |
| **Share score** | A button that opens the phone's share sheet with your score. |

Notes:

- **Haptics:** `navigator.vibrate` does not exist on iOS Safari, so there is no buzz there today. Safari 17.4+ will fire a light haptic when a hidden `<input type="checkbox" switch>` is toggled from a tap handler. This is an unofficial workaround that may not work for every swipe, so treat iPhone haptics as best effort.
- **Share:** use `navigator.share()`. It needs a user tap and HTTPS (or `localhost`), and falls back to copying the text if it isn't available.
- **Auto-pause:** listen for `visibilitychange`, and make sure the physics clock doesn't jump when the game resumes.

## Technical groundwork

These changes aren't visible to players, but several features need them.

- **Game state:** introduce a simple state machine (`menu`, `playing`, `paused`, `gameover`) in [src/main.ts](src/main.ts). Phases 1 and 3 both depend on it.
- **Split the code:** `main.ts` is growing. Move slicing and effects, game rules and UI into separate modules before Phase 2.
- **Settings:** extend [src/settings.ts](src/settings.ts) with the high-score table. Keep the load/save behaviour that tolerates missing fields.
- **Performance:** keep an eye on phone frame rate. Batch drawing, cap the dpr at 2, and cap the particle count. Add an fps readout while developing.

## Suggested order

1. Game state machine, then the lives and game-over screen
2. Launch movement, waves and the difficulty ramp (and remove tap-to-add)
   - Build the level system here, with the 60 s timer and per-level difficulty, even before the music is wired in. Level 9 is the endless mode.
3. Bombs
4. Combos and their popup and sound
5. Varied targets and the golden bonus
6. Juice stains, slow-motion and screen shake
7. Per-level background music (re-encode first) and the other sound upgrades
8. High scores, pause and auto-pause
9. Share button and iPhone haptics

## Decisions made

- Misses use the launch model (Fruit Ninja style).
- A bomb ends the run immediately.
- Tap-to-add-a-ball is removed once waves exist.
- There are 9 levels. Levels 1 to 8 last 60 seconds each. Level 9 is endless and loops its music.
- Each level has its own music track, already added in [public/music/](public/music/). The music changes with the level, so it doesn't need to speed up within a level.
- The tracks were re-encoded to 64 kbps mono AAC (about 6.4 MB in total) and are cached lazily.

- Levels end at 60 s, then the current wave finishes before the next level starts, with a 1 s music crossfade.
- Lives: 5 hearts at the start of a run, and one heart is earned back at each level-up (capped at 5).
- The tracks are free to use and come from Pixabay (https://pixabay.com/music/search/japan%20lofi/), recorded in the README.

## Open questions


## Out of scope for now

Online leaderboards, accounts, multiplayer, and any native app packaging.
