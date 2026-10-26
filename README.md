# Seven Notes: Fading

A playable browser prototype of the opening of a quiet dark-fantasy exploration game. Walk through a compact Sa, borrow the mender’s Sa note, settle a resonance latch without forcing it, and reach the Evening Minute as the city loses sound.

## Engine and honest scope

This initialized project is **Three.js + Rapier + TypeScript**, delivered as a Vite web game. The requested Unreal Engine 5 project and Windows package could not be created in this environment; this is not an Unreal `.uproject`, and it does not contain Unreal Blueprints/C++, a Windows build, or verified native Unreal assets. Moving the prototype into UE5 requires a local Unreal project and implementation pass.

The playable slice is compact, not a six-kilometre city. Hollow, residents, buildings, strings, instrument, skyline and civic landmarks use procedural placeholder geometry. Hollow is a temporary procedural human-style adolescent silhouette, not final character art. It includes one borrowed note (Sa), one complete strain-and-Rest puzzle, three visually represented districts, an Evening Minute/Fading passage, and a short hook that preserves the hidden family history. It does not include the full game, all seven note tribes, finished dialogue, the twin/mother reveal, combat, multiplayer or a recorded soundtrack.

## Run it

```bash
pnpm install
pnpm dev       # Vite development server; default http://localhost:5173
pnpm typecheck # TypeScript diagnostics
pnpm test      # Vitest unit tests
pnpm build     # managed-asset restore, sharing metadata, typecheck and production build
pnpm smoke     # headless browser playthrough; screenshots go to shots/
```

The smoke test needs Playwright and a local Chromium executable. The built favicon is registered at `assets/share/favicon.png`; the title and short description are in `game-sharing.json`. This quick prototype has no promotional OG cover. Sharing metadata is prepared for builds, but the game has **not** been publicly published.

## Controls

- **Keyboard:** WASD to walk, mouse to look (click the game to capture the pointer), Space to jump, Shift to run, E to interact, Q to Rest, Esc or P to pause.
- **Gamepad:** left stick to walk, right stick to look, A to jump, LB to run, X to interact, B to Rest/back, Start to pause.
- **Touch:** left virtual stick to move, drag to look, and the on-screen Jump, Listen/Interact and Rest buttons.

The Settings menu includes master volume, ambience and interaction levels, mute, camera sensitivity/inversion, reduced motion and graphics quality.

## Playable opening

The scene starts on Hollow’s sixteenth birthday in the Strung Districts. A nearby mender’s string lends Sa; the Ring Street latch lifts through repeated compatible resonance but becomes visibly strained if forced. Q/Rest stops the sound and recovers the mechanism. Opening the route leads past the central four-string instrument into the seated Quiet Quarter. The Evening Minute reduces the world toward silence; control returns with an objective to inspect the broken trace. The secret of Hollow, his mother and his twin sister is intentionally not disclosed in this slice.

All procedural tones, including the low drone, are placeholders. Sound should be treated as a prototype feature, not a composed or recorded soundtrack. The favicon is a small handcrafted procedural PNG; no generated gameplay model or promotional artwork was added.

## Verified in this project

The following checks were run against this project:

- `pnpm typecheck` passed.
- `pnpm test` passed: 68 tests across 11 test files, covering input, movement/jump, the note/noise/Rest progression, settings/save, Tweak, fixed-step timing and UI navigation.
- `pnpm build` passed, including the prepared sharing build step. The reported bundle was 1.73 MB JavaScript gzip, 1.00 MB fonts, and 2.73 MB total measured transfer size.
- `pnpm smoke` passed against the production build: movement through the shared input adapter, settings persistence, borrowed Sa, latch strain and recovery, Evening Minute, trace/ending and restart. It generated screenshots in `shots/`.
- Managed Preview was opened successfully at desktop size. Browser-based verification does not test Unreal packaging or production publication.

## Five best next steps

1. Port this playable route to Unreal Engine 5 and create a native Windows build.
2. Replace Hollow and key city landmarks with finished, culturally coherent production assets; retain the handcrafted Sa/strings silhouette.
3. Extend the route with more walkable Sa, side discoveries and clearer views of all four district strings.
4. Replace synthesized placeholders with recorded/commissioned district ambience and a restrained instrumental score.
5. Polish character locomotion, NPC gestures, cloth/string motion, lighting and the multi-stage Fading response on target hardware.

## Project notes

- `src/game/` owns the playable world, Hollow, camera, game rules and Tweak settings.
- `src/engine/` retains the fixed-step loop, Rapier physics, renderer, unified input, audio and local settings.
- `src/ui/` and `src/styles/main.css` own the English-only menu, HUD, pause, settings and ending.
- `assets.lock.json` tracks the managed favicon. `public/fonts/ManusCC0-LICENSE.txt` covers bundled fonts; Three.js is MIT-licensed and Rapier is Apache-2.0.
- No user reference artwork was supplied or assumed. The Tweak development bridge remains registered only for development builds.
