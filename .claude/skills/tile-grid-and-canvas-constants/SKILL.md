---
name: tile-grid-and-canvas-constants
description: Junar's shared constants module (src/game/constants.ts) and the canvas/tile geometry it defines (TILE_SIZE=32, 25×19 grid, 800×600 canvas). Use when introducing a new shared constant, promoting a duplicated literal (especially 800/600/32/16/128) into constants.ts, or when grid/layout math is wrong because two modules disagree on a dimension. Not for tuning a single gameplay value as a design choice — those defer to the owning skill (cardinal-los-contract for cooldown/range, enemy-roster-and-tone for enemy speeds, game-loop-time-and-cleanup for timing-source choices).
---

# Tile grid and canvas constants

The world is a 25×19 grid of 32-pixel tiles → an 800×600 canvas. These are not negotiable: changing any of them ripples through level layouts, spawn math, collision, rendering, and UI.

See CLAUDE.md §4 (levels), §7 (canvas-fixed-at-800×600 is a known Steam-window concern), §8 ("Pull magic numbers into named constants when you touch them. Use `src/game/constants.ts`.").

## The shared constants module

`src/game/constants.ts` is the home for shared dimensions:

```ts
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const TILE_SIZE = 32;
export const PLAYER_SIZE = 32;
```

Already imported and used in `Game.ts` and `Player.ts`. **Promote new values here when you touch the files that use them.** Don't fork local constants in individual modules.

## What lives at each magic number today

| Raw value | What it represents | Where it appears (non-exhaustive) |
|---|---|---|
| `32` | `TILE_SIZE`, also `PLAYER_SIZE`, also `ENEMY_SIZE` | `Renderer.ts`, `Level.ts`, `Enemy.ts`, `levels.ts`, `Game.ts` |
| `16` | `TILE_SIZE / 2` — half-tile, also player/enemy half-extent | `Game.ts` (LOS step + center math), `Enemy.ts` (pathfind step) |
| `800` / `600` | `CANVAS_WIDTH` / `CANVAS_HEIGHT` | `Enemy.findAlternativePath` (`Enemy.ts:130`), `Level.ts` fallback positions |
| `128` | min distance from player for edge enemy spawns | `Level.ts:194`, `levels.ts:394` |
| `25` / `19` | grid width / height | `levels.ts` ASCII layouts (one row of `#` × 25, 19 rows) |

The grid is uniform: all 10 levels are 25×19. If you find yourself authoring a level at a different size, stop — `App.tsx` hardcodes the canvas at 800×600 and `getSafePlayerSpawn` assumes the center of a 25×19 grid lands in walkable space.

## Gameplay tuning numbers (still inline, fair game to promote)

These are not in `constants.ts` yet. When you touch the file that owns one, lift it:

| Value | Meaning | Where |
|---|---|---|
| `arrowCooldown = 500` | ms between auto-fire shots | `Game.ts:55` |
| `arrowSpeed = 400` | px/s | `Game.ts:247` |
| `maxDetectionRange = 300` | px, cardinal-LOS / collision range | `Game.ts:56` |
| `EARLY_DEATH_MS = 500` | suspicious-death threshold | `Game.ts:27` |
| `SAMPLE_EVERY_FRAMES = 10` | telemetry sample rate | `Game.ts:26` |
| Player `speed = 150` | px/s | `Player.ts:14` |
| Enemy speeds 60 / 80 / 120 | bear / primate / panther px/s | `Enemy.ts:25-35` |
| Pathfind repoll `200` ms | enemy AI update cadence | `Enemy.ts:42` |
| Enemy count `3 + level*2`, capped at `25` | per-level scaling | `levels.ts:388` |

Naming convention: SCREAMING_SNAKE for new module-level constants, matching the existing exports. Where the value is per-enemy-type (speeds), the right shape is a record keyed by `EnemyType`, not three loose constants.

## Known deviations (don't perpetuate)

Several modules still use raw `32` even though `TILE_SIZE` is exported:

- `Renderer.ts` — every draw method uses literal `32`.
- `Enemy.ts` — collision and pathfinding use literal `32` and `16`.
- `Level.ts` — grid math uses literal `32`; fallback spawn positions hardcode pixel coords (`Level.ts:123-129`).
- `levels.ts` — pixel/grid conversion uses literal `32`.

Migrate when you're already editing one of these files. Don't open a sweeping rename PR just for cleanup; do it as a side-effect of meaningful work.

## Don't do

- Don't introduce a second constants file or duplicate values across modules.
- Don't change `CANVAS_WIDTH`/`CANVAS_HEIGHT`/`TILE_SIZE` in isolation — they're load-bearing for level layouts. If a Steam fullscreen scaling story is needed, that's a CLAUDE.md §7 conversation, not a constant edit.
- Don't author levels at a non-25×19 grid. The wider system assumes uniform sizing.
- Don't read `canvas.width`/`canvas.height` instead of the constants — they're the same value but the constants make the intent explicit and survive a future scaling layer.
