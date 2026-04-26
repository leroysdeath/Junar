---
name: procedural-rendering
description: Junar's canvas-2D rendering contract for the game world. Renderer.ts is the sole draw surface for in-world entities and effects (player, enemies, arrows, boss, family, particles, screen shake, hit flashes); all are procedural pixel rectangles — no sprite sheets, no image imports, no WebGL/Pixi/Three.js. Use when adding or editing how something is drawn on the canvas, when proposing a renderer migration, or when a request would import an image asset. Not for: React/Tailwind HUD overlays (see react-game-bridge), the crash logger's red overlay (see crash-logger-channel), the cardinal-LOS rule itself (see cardinal-los-contract — this skill only owns the visual indicator), or pulling magic numbers like 32/800/600 into constants (see tile-grid-and-canvas-constants, even inside Renderer.ts).
---

# Procedural rendering

The chosen art direction is procedural pixel rectangles, drawn to a single Canvas 2D context. This is a feature, not a workaround.

See CLAUDE.md §2 ("Readable at a glance"), §5 (visual palette), §8 ("Don't migrate to a game engine. Don't add real sprite assets.").

## The contract

- One render surface: `src/game/Renderer.ts`, holding a `CanvasRenderingContext2D` constructed from the 800×600 canvas in `App.tsx`.
- One method per visible entity type: `renderLevel`, `renderPlayer`, `renderEnemies` (dispatching to `renderPanther` / `renderPrimate` / `renderBear`), `renderArrows`, `renderLineOfSightIndicator`.
- Drawing primitives are `fillRect`, `fillStyle`, `save`/`translate`/`rotate`/`restore`, and the occasional `beginPath` / triangle for arrowheads. Procedural pixel art, not sprites.
- The canvas is `image-rendering: pixelated` (`App.tsx:65`). Stay on integer pixel coordinates so the pixelation reads correctly.
- Every entity must be **identifiable in one frame at 32×32**. Silhouette and color do the work — readability is the constraint, not detail.

## What's drawn today (entity → method)

| Entity | Where |
|---|---|
| Tile floor / tree wall | `renderLevel` (`Renderer.ts:13`) |
| Player (Adivasi-coded archer: dhoti, sash, bow, quiver) | `renderPlayer` (`Renderer.ts:57`) |
| Panther / primate / bear | `renderPanther` / `renderPrimate` / `renderBear` (`Renderer.ts:109`–`170`) |
| Arrows | `renderArrows` (`Renderer.ts:172`) |
| Cardinal-LOS indicator | `renderLineOfSightIndicator` (`Renderer.ts:211`) |

The render order is set in `Game.render()` (`Game.ts:702`): clear → level → player → enemies → arrows → LOS indicator. Adding a new entity means picking a slot in that order — the boss should render after enemies but before arrows so arrows visibly land on it; family members should render with or just after the player.

## Palette today

- Forest greens for trees: `#228B22`, `#32CD32`, `#90EE90`.
- Earth browns for floor: `#8B4513`, `#A0522D`, `#654321`.
- Player: cream tunic `#DCC59C`, dark sash `#5D4037`, deep skin `#4E342E`, hair `#1A1A1A`, dark wood bow `#654321`, leather quiver `#4A3C28`, fletching `#FFEEAA`.
- Background clear: `#1a4a3a`.

CLAUDE.md §5 plans an additional **black-goo accent palette** (deep oily black, sickly green/purple highlights) for infected beasts and the boss. That hasn't landed yet — when adding it, lift the colors into named module constants rather than scattering hex strings. See `tile-grid-and-canvas-constants`.

## Pattern for a new entity

1. Add the data class in `src/game/` (no React, no DOM). Hold position + per-instance state.
2. Add a `renderX(...)` method on `Renderer`. Procedural rectangles only. Keep the bounding box at 32×32 unless there's a deliberate reason — collision and LOS math assume 32-pixel bodies. The boss is the obvious exception; if it spans multiple tiles, document the size explicitly and audit collision callers.
3. Hook the call into `Game.render()` at the right z-order slot.
4. Update spawn / lifecycle in `Game` (or `Level`, if it's level-bound).
5. Sketch the silhouette on paper or in your head before coding — confirm it reads as the right thing in one frame.

## Pushback list

- **No sprite sheets, no image/PNG/SVG imports for in-world entities.** CLAUDE.md §8.
- **No engine migration.** Pixi, Phaser, Three.js, Godot, Bevy — out of scope. CLAUDE.md §6 / §8.
- **No WebGL.** Stay on the 2D context.
- **No browser-only rendering APIs that won't survive a Tauri wrap.** Canvas 2D is fine; OffscreenCanvas, ImageBitmap, and similar should be sanity-checked first. CLAUDE.md §7.
- **No DOM-based "entities".** Don't represent the player as a `<div>` over the canvas. The HUD is React/DOM (`App.tsx` overlays); the world is canvas.
- **No new render dependency.** No tween libraries, no canvas-effect libraries — implement effects with the existing primitives.

## What is fine

- Adding new procedural entities (boss, family members, infected-beast accents).
- Adding hit-feedback flashes, screen-shake, simple particles via more `fillRect` calls within the existing render flow. CLAUDE.md §6 step 8 lists these as planned polish.
- Refining existing entity sprites for readability or to land the corruption visual treatment.
- Adding a new draw method on `Renderer` for a new concept; keep one method per visible thing.

## When this skill does NOT apply

React/Tailwind UI overlays — menus, score badge, instructions, game-over screen — live in `App.tsx` and use Tailwind classes + `lucide-react` icons. That's a separate visual surface with its own conventions; CLAUDE.md §1 calls those strings "placeholder until a copy pass." Don't try to draw the menu via canvas, and don't try to draw the world via React.
