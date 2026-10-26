# Seven Notes: Fading — Implementation Plan

## Scope and environment

The source brief requests a Windows Unreal Engine 5 prototype, and expressly says to continue with the closest functional alternative if the execution environment cannot run or package Unreal. This managed project is initialized as a Three.js/TypeScript/Vite browser game. It will be a self-contained, playable browser adaptation of the requested opening slice, not a native UE project, Unreal Blueprints/C++ project, or packaged Windows build. This environment has no established Unreal project/toolchain, so no Unreal-specific deliverable will be claimed. The browser version will use the project's existing Three.js/Rapier third-person controller and can provide specific local Unreal implementation/migration notes after delivery.

Gameplay and canon are taken from `/home/ubuntu/upload/pasted_content.txt`. English is the single game-content language. No multiplayer, accounts, database, generative 3D model, paid asset, downloaded asset or original soundtrack is authorized/needed. The level and characters will be built from procedural Three.js primitives and synthesized WebAudio. These are visible low-poly/procedural stand-ins, not custom sculpted assets, mocap, recorded ambience or a finished soundtrack. The original brief did not require or supply a character reference image.

## Implementation approach

Preserve the initialized Three.js/Rapier starter, renderer, fixed-step loop, input abstraction, follow-camera collision, persistent player settings, existing Tweak parameter manager and development-only bridge. Replace only game-owned level, protagonist appearance, game state, user interface copy/layout, and audio cues as required. Keep unused generic engine facilities only where their reuse is safe; no arcade score, lives, clock, collectibles, drones, combat, online play or generic magic remain in the playable path.

Use deterministic, reusable primitive construction helpers for sound-shaped timber/plaster architecture, the Strung Districts workshop/courtyards, a broad partial Ring Street, and an open Quiet Quarter. Create a basin boundary with cliff silhouettes, distant silhouettes and a landmark tanpura/tambura monument with four taut spatially distinct strings. Build collision on the actual route. The monument and string supports should be visible from both the Ring Street and Quiet Quarter. A few simple posed figures and repeated cloth/cord motion imply ordinary activity; animation stops or becomes unreliable as Fading advances.

Hollow remains on the existing collision-aware third-person controller with walk/run, smooth turn, jump, mouse orbit and gamepad/touch actions where supported. Replace the starter's glowing robotic character with a human adolescent silhouette made from simple robe, hair, sandals and skin meshes; document that it is a procedural placeholder.

Provide one borrowed note (Sa) and object-specific interactions: a workshop source can be listened to/mirrored; the Sa-compatible Ring Street tension latch responds with a bridge/gate mechanism; repeated forced strikes build a visible noise meter, uneven vibration and rougher tones; a nearby Q/Rest action creates a still interval and clears the mechanism noise. The route physically opens only when the latch is resolved. Readable prompts and object animation make the puzzle solvable without sound. Interactions have short cooldowns to avoid accidental multi-triggering.

Crossing into the Quiet Quarter triggers a brief, staged Evening Minute: controls pause for a few seconds while layered ambience recedes, strings move without tones, saturation/contrast lessen gradually, residents remain still and the distant instrument falters. Control returns with a small objective and an ambiguous final clue/hook; do not reveal Hollow's mother, his identity, or his twin. The player can inspect the final resonant trace and finish the prototype. A replay starts from the courtyard.

Use the existing AudioContext with synthesized low-volume drone/tone placeholders (not an original soundtrack). Smoothly attenuate ambience for Rest and Fading; include master/music/SFX settings and mute. Add textual/visual feedback for all essential sound cues. Main menu has Start Game, Settings and a safe browser-friendly Quit message; Pause supports resume/restart/settings/title. Context prompt, current borrowed note, objective and puzzle noise/progress remain small and restrained. Pin single-language game text to English and hide the inherited locale selector.

## Project structure and responsibilities

- `src/game/world.ts`: procedural Sa basin, modular architecture, monument/strings, inhabitants, interaction landmarks, collision, atmospheric transition and animation.
- `src/game/player.ts`: collision-aware player and modular primitive human teen appearance.
- `src/game/game.ts`: narrative flow, note borrowing, per-object noise, Rest, proximity prompts, puzzle progression and Fading sequence.
- `src/game/config.ts` / `src/game/tuning.ts`: movement/camera settings exposed through the existing Tweak manager only when consumed by gameplay.
- `src/engine/audio.ts`: synth placeholder motifs, smooth ambience reduction, user settings and bounded tone synthesis.
- `src/engine/input.ts`: existing keyboard/mouse/gamepad/touch abstraction, including contextual interaction and Rest bindings.
- `src/main.ts`: game lifecycle, pause/resume, UI hooks, English-only locale and existing preview bridge.
- `src/ui/ui.ts` and `src/styles/main.css`: restrained menu, minimal HUD, captions/objective/note, controls, settings and pause.
- `src/i18n/*.json`: retain starter catalog parity, but gameplay locale is pinned to English with no inherited language switch.
- `public/favicon.svg`, `README.md`, `TODO.md`, `plan.md`: game identity, accurate launch/limits, outcome status and implementation record.

## Visual design

- **Design movement:** painterly semi-realistic cinematic dark fantasy, translated into handcrafted stylized geometry and dusk lighting without copying Arcane assets or designs.
- **Core principles:** architecture expresses resonance; the lived-in city contrasts with deliberate negative space; old materials show repair/strain; the Fading subtracts familiar qualities rather than adding a monster effect.
- **Color philosophy:** charcoal stone, aged plaster/ivory, timber, dusted earth, faded cloth, restrained bronze; a few warm living accents gradually lose saturation and contrast.
- **Layout paradigm:** a guided, gently curving civic route progresses from dense Strung Districts through a landmark Ring Street toward the spatially open Quiet Quarter, with views framed toward the monumental instrument. It is not a HUD-directed arena.
- **Signature elements:** four enormous tensioned strings leading from the monumental instrument; vertically rhythmic timber/plaster forms and hanging cords; the Evening Minute expressed through a circle of low seats and still figures.
- **Interaction philosophy:** listen, approach, borrow, apply and allow resonance to finish. Small contextual prompts and physical object changes replace ability wheels, glowing runes or combat UI.
- **Animation:** restrained cloth/cord sway, light instrument vibration and relaxed NPC loops; on Fading, motion and tone become less reliable, then intentionally still. Ease all camera/color/audio transitions; honor reduced-motion settings.
- **Typography:** bundled ManusCC0 regular/medium/bold for compatibility, with restrained serif-like spacing/scale hierarchy through weight and letter spacing rather than decorative glyph artwork. UI text stays HTML and legible.
- **Brand essence:** an intimate exploration of music, memory and the necessary space between notes; curious, restrained, unsettling.
- **Brand voice:** poetic but clear, minimal and never lore-dumping. Example lines: “Borrowed, not owned.” “Let the note finish.”
- **Wordmark:** a custom text lockup “SEVEN NOTES / FADING” with seven thin staff-like strokes interrupted by an intentional gap; CSS/SVG geometry, not a default app logo.
- **Signature brand color:** weathered string-bronze, used only for meaningful resonant cues.

## Constraints

- This is a browser-based Three.js prototype, not Unreal Engine 5. It does not deliver a `.uproject`, Blueprints, C++ modules, Unreal assets or a Windows package.
- Character/environment geometry and sound are procedural placeholders. No external concept image/reference is present in the project; no one will be assumed.
- Keep the city compressed for browser performance; use purposeful procedural details rather than claim an explorable 500–800m metric scale.
- No lore invention beyond a small ambiguous hook compatible with the brief.
- Verification claims will match build, unit and browser-smoke evidence actually obtained.
