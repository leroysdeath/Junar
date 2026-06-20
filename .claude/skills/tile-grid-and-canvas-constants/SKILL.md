---
name: tile-grid-and-canvas-constants
description: Junar's shared constants module (src/game/constants.ts) and the canvas/tile geometry it defines (TILE_SIZE=32, 29×17 grid, 928×544 canvas). Use when introducing a new shared constant, promoting a duplicated literal into constants.ts (within src/game/, 928/544 are fully promoted; raw 32s linger in Renderer.ts, Level.ts, and Player.ts), or when grid/layout math is wrong because two modules disagree on a dimension. Not for tuning a single gameplay value as a design choice — those defer to the owning skill (los-contract for cooldown/range, enemy-roster-and-tone for enemy speeds, game-loop-time-and-cleanup for timing-source choices).
---

# Tile grid and canvas constants

Each **room** is a 29×17 grid of 32 px tiles → a 928×544 canvas (`GRID_WIDTH`/`GRID_HEIGHT`/`TILE_SIZE`). Separately, a run is a 29×17 grid of **rooms** (`ROOM_GRID_COLS`/`ROOM_GRID_ROWS`) — the matching numbers are a coincidence; never substitute one constant for the other. These are not negotiable: changing any of them ripples through room layouts, spawn math, collision, rendering, and UI. The odd column count (29) is deliberate — it gives every room a true center column at col 14.

See CLAUDE.md §5 (Rooms & map), §8 (canvas-fixed-at-928×544 is a known Steam-window concern), §9 ("Pull magic numbers into named constants when you touch them. Use `src/game/constants.ts`.").

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

It also already owns the gameplay-tuning constants (`MAX_DETECTION_RANGE`, `ARROW_SPEED`, `ARROW_COOLDOWN_MS`, `PLAYER_SPEED`, the stamina/burst/sprint costs + tuning, wave defaults). The newer constants families live here too — `ENEMY_AABB_PX`, the `ROOM_GRID_*` run-map dimensions, Hunt tuning, static-spawn density, the spawn-band graces, the wave-pool unlocks, and `BOSS_GROWTH_*` — constants.ts is the home for all of them. Already imported across nearly all of `src/game/` (`Game.ts`, `Player.ts`, `Enemy.ts`, `Renderer.ts`, `levels.ts`, `RoomGrid.ts`, `RoomTemplates.ts`, `Hunt.ts`, `WaveScheduler.ts`, `Stamina.ts`, `Logger.ts`). **Promote new values here when you touch the files that use them.** Don't fork local constants in individual modules.

## What lives at each magic number today

| Raw value | What it represents | Where it appears (non-exhaustive) |
|---|---|---|
| `32` | `TILE_SIZE`, also `PLAYER_SIZE` | `Renderer.ts` (`renderLevel` tile loop + one `renderCorruptedGrowth` fillRect), `Level.ts` (grid math, `isPositionSafe`, edge-spawn helpers), `Player.ts` (`private size = 32` duplicating `PLAYER_SIZE`) |
| `928` / `544` | `CANVAS_WIDTH` / `CANVAS_HEIGHT` | fully promoted within `src/game/` — literals only at the `constants.ts` definitions; raw 928/544 also survive in `App.tsx`'s mobile aspect-ratio CSS `calc` strings, and `Level.ts` hardcodes derived fallback pixel coords (`64`/`480`/`832`/`448`/`256`) |
| `128` | min distance from player for edge enemy spawns | `Level.generateEdgeEnemySpawns` (default param), `levels.ts` |
| `29` / `17` | `GRID_WIDTH` / `GRID_HEIGHT` | only implicit in the ASCII layout strings (each row 29 chars × 17 rows); `parseLevel` guards already use `GRID_WIDTH`/`GRID_HEIGHT` |

The grid is uniform: all 10 levels are 29×17, and `parseLevel` in `levels.ts` throws if any grid isn't exactly 17 rows of 29 columns. If you find yourself authoring a level at a different size, stop — the canvas is fixed at 928×544 and spawn math assumes the center of a 29×17 grid lands in walkable space.

## Gameplay tuning numbers

Most have already been promoted into `constants.ts` (`ARROW_COOLDOWN_MS = 500`, `ARROW_SPEED = 400`, `MAX_DETECTION_RANGE = 450`, `PLAYER_SPEED = 150`, stamina/burst/sprint costs + tuning, wave defaults). Read from those exports, not inline literals. A few still live inline — when you touch the file that owns one, lift it:

| Value | Meaning | Where |
|---|---|---|
| Enemy speeds 395 / 218 / 68 / 34 | panther / bear / snake / gibbon px/s | `Enemy.ts` (per-type `switch`) |
| LOS sample step `8` px | raycast granularity (`ceil(distance / 8)`) | `Game.ts` (`hasDirectLineOfSight`) |
| Enemy count `3 + index*2`, capped at `25` | per-level scaling in the unwired legacy perimeter spawner (`initializeLevels` — never called; its guard skips only `delayedSpawns` levels, currently none) | `levels.ts` |

Naming convention: SCREAMING_SNAKE for new module-level constants, matching the existing exports. Where the value is per-enemy-type (speeds), the right shape is a record keyed by `EnemyType`, not four loose constants. (The four approved beasts are panther, bear, snake, gibbon — see `enemy-roster-and-tone` before touching the roster.)

## Known deviations (don't perpetuate)

Three modules still use raw `32` even though `TILE_SIZE`/`PLAYER_SIZE` are exported:

- `Renderer.ts` — only the `renderLevel` tile loop and one `renderCorruptedGrowth` fillRect still use literal `32`.
- `Level.ts` — grid math uses literal `32`; fallback spawn positions hardcode pixel coords; one raw `16` lingers in the dead, never-called `hasLineOfSightToPlayer` helper.
- `Player.ts` — `private size = 32` duplicates `PLAYER_SIZE` (the file already imports from `constants.ts`).

Migrate when you're already editing one of these files. Don't open a sweeping rename PR just for cleanup; do it as a side-effect of meaningful work.

## Don't do

- Don't introduce a second constants file or duplicate values across modules.
- Don't change `CANVAS_WIDTH`/`CANVAS_HEIGHT`/`TILE_SIZE`/`GRID_WIDTH`/`GRID_HEIGHT` in isolation — they're load-bearing for level layouts. If a Steam fullscreen scaling story is needed, that's a CLAUDE.md §8 conversation, not a constant edit.
- Don't author levels at a non-29×17 grid. The wider system assumes uniform sizing, and `parseLevel` will throw.
- Don't read `canvas.width`/`canvas.height` instead of the constants — they're the same value but the constants make the intent explicit and survive a future scaling layer.
