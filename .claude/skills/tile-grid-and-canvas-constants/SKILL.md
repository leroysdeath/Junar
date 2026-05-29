---
name: tile-grid-and-canvas-constants
description: Junar's shared constants module (src/game/constants.ts) and the canvas/tile geometry it defines (TILE_SIZE=32, 29×17 grid, 928×544 canvas). Use when introducing a new shared constant, promoting a duplicated literal (especially 928/544/32/16/128) into constants.ts, or when grid/layout math is wrong because two modules disagree on a dimension. Not for tuning a single gameplay value as a design choice — those defer to the owning skill (cardinal-los-contract for cooldown/range, enemy-roster-and-tone for enemy speeds, game-loop-time-and-cleanup for timing-source choices).
---

# Tile grid and canvas constants

The world is a 29×17 grid of 32-pixel tiles → a 928×544 canvas. These are not negotiable: changing any of them ripples through level layouts, spawn math, collision, rendering, and UI. The odd column count (29) is deliberate — it gives every level a true center column at col 14.

See CLAUDE.md §4 (levels), §8 (canvas-fixed-at-928×544 is a known Steam-window concern), §9 ("Pull magic numbers into named constants when you touch them. Use `src/game/constants.ts`.").

## The shared constants module

`src/game/constants.ts` is the home for shared dimensions:

```ts
export const CANVAS_WIDTH = 928;
export const CANVAS_HEIGHT = 544;
export const TILE_SIZE = 32;
export const PLAYER_SIZE = 32;
export const GRID_WIDTH = 29;
export const GRID_HEIGHT = 17;
```

It also already owns the gameplay-tuning constants (`MAX_DETECTION_RANGE`, `ARROW_SPEED`, `ARROW_COOLDOWN_MS`, `PLAYER_SPEED`, the stamina/burst/dash costs, wave defaults). Already imported and used across `Game.ts`, `Player.ts`, `levels.ts`, and `Stamina.ts`. **Promote new values here when you touch the files that use them.** Don't fork local constants in individual modules.

## What lives at each magic number today

| Raw value | What it represents | Where it appears (non-exhaustive) |
|---|---|---|
| `32` | `TILE_SIZE`, also `PLAYER_SIZE`, also `ENEMY_SIZE` | `Renderer.ts`, `Level.ts`, `Enemy.ts`, `levels.ts`, `Game.ts` |
| `16` | `TILE_SIZE / 2` — half-tile, also player/enemy half-extent | `Game.ts` (LOS step + center math), `Enemy.ts` (pathfind step) |
| `928` / `544` | `CANVAS_WIDTH` / `CANVAS_HEIGHT` | `Level.ts` fallback positions, `levels.ts` |
| `128` | min distance from player for edge enemy spawns | `Level.generateEdgeEnemySpawns` (default param), `levels.ts` |
| `29` / `17` | `GRID_WIDTH` / `GRID_HEIGHT` | `levels.ts` ASCII layouts (each row 29 chars × 17 rows), `parseLevel` row/col guards |

The grid is uniform: all 10 levels are 29×17, and `parseLevel` in `levels.ts` throws if any grid isn't exactly 17 rows of 29 columns. If you find yourself authoring a level at a different size, stop — the canvas is fixed at 928×544 and spawn math assumes the center of a 29×17 grid lands in walkable space.

## Gameplay tuning numbers

Most have already been promoted into `constants.ts` (`ARROW_COOLDOWN_MS = 500`, `ARROW_SPEED = 400`, `MAX_DETECTION_RANGE = 450`, `PLAYER_SPEED = 150`, stamina/burst/dash costs, wave defaults). Read from those exports, not inline literals. A few still live inline — when you touch the file that owns one, lift it:

| Value | Meaning | Where |
|---|---|---|
| Enemy speeds 395 / 218 / 68 / 34 | panther / bear / snake / gibbon px/s | `Enemy.ts` (per-type `switch`) |
| Pathfind repoll `200` ms | enemy AI update cadence | `Enemy.ts` |
| LOS sample step `8` px | raycast granularity (`ceil(distance / 8)`) | `Game.ts` (`hasDirectLineOfSight`) |
| Enemy count `3 + index*2`, capped at `25` | per-level scaling (legacy levels 4–10) | `levels.ts` |

Naming convention: SCREAMING_SNAKE for new module-level constants, matching the existing exports. Where the value is per-enemy-type (speeds), the right shape is a record keyed by `EnemyType`, not four loose constants. (The four approved beasts are panther, bear, snake, gibbon — see `enemy-roster-and-tone` before touching the roster.)

## Known deviations (don't perpetuate)

Several modules still use raw `32` even though `TILE_SIZE` is exported:

- `Renderer.ts` — every draw method uses literal `32`.
- `Enemy.ts` — collision and pathfinding use literal `32` and `16`.
- `Level.ts` — grid math uses literal `32`; fallback spawn positions hardcode pixel coords.
- `levels.ts` — pixel/grid conversion uses literal `32`.

Migrate when you're already editing one of these files. Don't open a sweeping rename PR just for cleanup; do it as a side-effect of meaningful work.

## Don't do

- Don't introduce a second constants file or duplicate values across modules.
- Don't change `CANVAS_WIDTH`/`CANVAS_HEIGHT`/`TILE_SIZE`/`GRID_WIDTH`/`GRID_HEIGHT` in isolation — they're load-bearing for level layouts. If a Steam fullscreen scaling story is needed, that's a CLAUDE.md §8 conversation, not a constant edit.
- Don't author levels at a non-29×17 grid. The wider system assumes uniform sizing, and `parseLevel` will throw.
- Don't read `canvas.width`/`canvas.height` instead of the constants — they're the same value but the constants make the intent explicit and survive a future scaling layer.
