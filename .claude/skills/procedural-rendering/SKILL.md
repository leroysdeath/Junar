---
name: procedural-rendering
description: Junar's canvas-2D rendering contract for the game world. Renderer.ts is the sole draw surface for in-world entities and effects (player, enemies, arrows, boss, family, particles, screen shake, hit flashes). Characters and beasts are sprite-based (owner-greenlit — player 2026-05-10, beasts + family 2026-06-11 per docs/ART-ASSETS.md Tiers 1-2, drawn via drawImage from bundled PNGs); environment, hut, arrows, FX, HUD, and the plant boss are procedural pixel rectangles (Tier 3 not greenlit, Tier 4 keep-procedural confirmed). No sprite/image imports beyond the approved set, no share-alike-licensed art (no LPC), nothing AI-generated, no WebGL/Pixi/Three.js. Use when adding or editing how something is drawn on the canvas, when proposing a renderer migration, or when a request would import an image asset. Not for: React/Tailwind HUD overlays (see react-game-bridge), the crash logger's red overlay (see crash-logger-channel), the LOS rule itself (see los-contract — this skill only owns the visual indicator), or pulling magic numbers like 32/928/544 into constants (see tile-grid-and-canvas-constants, even inside Renderer.ts).
---

# Procedural rendering

The art direction is hybrid, drawn to a single Canvas 2D context. **Characters and beasts are sprites** (owner-greenlit: player 2026-05-10; the four beasts + family wife/son/daughter 2026-06-11 — Tiers 1–2 of `docs/ART-ASSETS.md`). **Everything else is procedural pixel rectangles** — walls/floor, huts, arrows, burst aura, LOS indicator, materialize flash, hit/death FX, and the corrupted growth / plant boss (Tier 3 explicitly not greenlit; Tier 4 keep-procedural confirmed 2026-06-11). The procedural side is a feature, not a workaround: FX are readability tools, and the boss's pulsing goo animates better as code.

Asset rules for the sprite side: bundled PNGs imported via Vite, drawn with `ctx.drawImage` (`imageSmoothingEnabled = false`, integer coords). Licenses: CC0 / CC-BY (logged in `docs/ART-CREDITS.md`) / paid royalty-free only — share-alike rejected (no CC-BY-SA, no GPL, no LPC), no NC/ND, nothing AI-generated.

See CLAUDE.md §3 ("Readable at a glance"), §6 (visual palette), §9 ("Sprite assets are limited to the approved set"; "Don't migrate to a game engine").

## The contract

- One render surface: `src/game/Renderer.ts`, holding a `CanvasRenderingContext2D` constructed from the 928×544 canvas in `App.tsx` (`CANVAS_WIDTH` / `CANVAS_HEIGHT` in `constants.ts`).
- One method per visible entity type: `renderLevel`, `renderPlayer` (sprite + procedural burst aura), `renderEnemies` (dispatching to `renderPanther` / `renderGibbon` / `renderBear` / `renderSnake`), `renderNpcs`, `renderHuts`, `renderArrows`, `renderCorruptedGrowth`, `renderLineOfSightIndicator`.
- Drawing primitives are `fillRect`, `fillStyle`, `save`/`translate`/`rotate`/`scale`/`restore`, `globalAlpha`, `strokeRect` + `setLineDash` (LOS indicator), the occasional `beginPath` / triangle for arrowheads — plus `drawImage` for the approved sprite set: the player (`renderPlayer`, CC0 LTTP sheet), the family (`renderNpcs`, CC-BY 3.0 Antifarea recolors at 16×18), and the four beasts once their Time Fantasy sheets land (`renderPanther`/`renderBear`/`renderSnake`/`renderGibbon`; procedural until the owner's purchase arrives). No sprite/image import may be added for any other entity without owner approval.
- The canvas is `image-rendering: pixelated` (set on the `<canvas>` in `App.tsx`), and the `Renderer` constructor sets `ctx.imageSmoothingEnabled = false` so the scaled sprite stays crisp. Stay on integer pixel coordinates so the pixelation reads correctly.
- Every entity must be **identifiable in one frame at 32×32**. Silhouette and color do the work — readability is the constraint, not detail.

## What's drawn today (entity → method)

| Entity | Method |
|---|---|
| Tile floor / tree wall | `renderLevel` |
| Player (CC0 LTTP-style sprite + procedural burst aura) | `renderPlayer` |
| Panther / gibbon / bear / snake | `renderEnemies`, dispatching to `renderPanther` / `renderGibbon` / `renderBear` / `renderSnake` |
| Family wife/son/daughter sprites at `N` tiles (translucent idle frames, cycled by index; behavior unwired) | `renderNpcs` |
| Huts (`H` tiles) | `renderHuts` |
| Arrows | `renderArrows` |
| Corrupted growth (boss-arena walk-on win trigger) | `renderCorruptedGrowth` |
| LOS indicator (360°, any angle — the combat contract lives in the `los-contract` skill) | `renderLineOfSightIndicator` |

The render order is set in `Game.render()`: clear (`#1a4a3a`) → level → huts → NPCs → corrupted growth (boss arena only — a ground feature, drawn *under* the player so stepping onto it reads) → player → enemies → arrows → LOS indicator. Adding a new entity means picking a slot in that order; note that family placeholders already render before the player.

## Palette today

- Forest greens for trees: `#228B22`, `#32CD32`, `#90EE90`.
- Floor: solid tan `#D2B48C`, a single fill per tile. (`#8B4513` survives only as arrow fletching.)
- Player: colors live in the sprite-sheet PNG, not in code. The procedural burst aura uses warm golds `#FFC857` / `#FFD97A`, drawn behind the sprite.
- Background clear: `#1a4a3a`.

The **black-goo accent palette** from CLAUDE.md §6 (deep oily black, sickly green/purple highlights) has landed as the `GOO_*` module constants in `Renderer.ts`, used by the corrupted growth — and it is **boss-only** (owner decision 2026-06-11). The infected-beast cue has landed and is separate: **red eyes** via `INFECTED_EYE_RED` on all four beasts, bodies otherwise normal wildlife. Don't add goo accents to beasts, and reuse the named constants rather than scattering new hex strings. See `tile-grid-and-canvas-constants`.

## Pattern for a new entity

1. Add the data class in `src/game/` (no React, no DOM). Hold position + per-instance state.
2. Add a `renderX(...)` method on `Renderer`. Procedural rectangles only. The 32 px cell is the positioning unit and the arrow-hit box; the per-type `ENEMY_AABB_PX` (bear 34 / panther 21 / gibbon 15 / snake 4 px) governs wall and enemy-vs-enemy collision *and* the player-kill contact test (a true AABB overlap against the player's `PLAYER_HURTBOX_PX` 16 px kill core — `Game.enemyTouchesPlayer`, owner-approved 2026-06-10), and enemy art scales to its AABB with a 0.5 readability floor (`ENEMY_VISUAL_SCALE_FLOOR`). `renderEnemies` also draws a fading white materialize flash over an enemy whose doorway-arrival kill grace is running (`Enemy.getArrivalGraceUntil` vs the gameLoop `currentTime` passed in from `Game.render`). The boss is the obvious exception; if it spans multiple tiles, document the size explicitly and audit collision callers.
3. Hook the call into `Game.render()` at the right z-order slot.
4. Update spawn / lifecycle in `Game` (or `Level`, if it's level-bound).
5. Sketch the silhouette on paper or in your head before coding — confirm it reads as the right thing in one frame.

## Pushback list

- **Sprite assets are limited to player + four beasts + family** (player approved 2026-05-10; beasts/family greenlit 2026-06-11). No sprite sheets, no image/PNG/SVG imports for environment, hut, arrows, FX, HUD, or the boss without owner approval. CLAUDE.md §9, `docs/ART-ASSETS.md`.
- **No share-alike or AI-generated art, ever.** CC-BY-SA/GPL (all of LPC) is rejected on the art layer; every sourced sheet needs human-made provenance. CC-BY attributions go in `docs/ART-CREDITS.md`.
- **No engine migration.** Pixi, Phaser, Three.js, Godot, Bevy — out of scope. CLAUDE.md §9.
- **No WebGL.** Stay on the 2D context.
- **No browser-only rendering APIs that won't survive a Tauri wrap.** Canvas 2D is fine; OffscreenCanvas, ImageBitmap, and similar should be sanity-checked first. CLAUDE.md §8.
- **No DOM-based "entities".** Don't represent the player as a `<div>` over the canvas. The HUD is React/DOM (`App.tsx` overlays); the world is canvas.
- **No new render dependency.** No tween libraries, no canvas-effect libraries — implement effects with the existing primitives.

## What is fine

- Adding new procedural entities (the full plant boss replacing the corrupted-growth stub, FX polish) and animating the family sprites' existing 3-frame 4-dir walk rows once the `FamilyMember` entity lands.
- Adding hit-feedback flashes, screen-shake, simple particles via more `fillRect` calls within the existing render flow. CLAUDE.md §7 step 8 lists these as planned polish.
- Refining existing entity art for readability or to land the corruption visual treatment.
- Adding a new draw method on `Renderer` for a new concept; keep one method per visible thing.

## When this skill does NOT apply

React/Tailwind UI overlays — menus, score badge, instructions, game-over screen — live in `App.tsx` and use Tailwind classes + `lucide-react` icons. That's a separate visual surface with its own conventions; CLAUDE.md §1 calls those strings "placeholder until a copy pass." Don't try to draw the menu via canvas, and don't try to draw the world via React.
