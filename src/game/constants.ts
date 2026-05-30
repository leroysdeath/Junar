import type { EnemyType } from './types';

export const CANVAS_WIDTH = 928;
export const CANVAS_HEIGHT = 544;
export const TILE_SIZE = 32;
export const PLAYER_SIZE = 32;
export const GRID_WIDTH = 29;
export const GRID_HEIGHT = 17;
// Real-world scale: 1 tile (32 px) ≈ 5.5 ft (adult male archer height)
export const FEET_PER_TILE = 5.5;
export const MAP_WIDTH_FEET = GRID_WIDTH * FEET_PER_TILE;   // 159.5 ft
export const MAP_HEIGHT_FEET = GRID_HEIGHT * FEET_PER_TILE; // 93.5 ft
// 360-degree LOS detection range (auto-fire and contact-death share this radius).
export const MAX_DETECTION_RANGE = 450;
export const ARROW_SPEED = 400; // pixels per second
export const ARROW_COOLDOWN_MS = 500;

// Player movement. Promoted from Player.ts so the stamina low-penalty and
// any future buffs can compose against a single source of truth.
export const PLAYER_SPEED = 150; // pixels per second

// Stamina pool — playthrough-wide, no regen, persists across all levels in
// a run. Resets to STAMINA_MAX only on Game.restart().
export const STAMINA_MAX = 100;
export const STAMINA_LOW_THRESHOLD = 10;
export const STAMINA_LOW_PENALTY = 0.5; // multiplier on speed + arrow rate when low

export const STAMINA_PER_TILE_MOVED = 0.001; // per TILE_SIZE px traveled
export const STAMINA_PER_ARROW = 0.001;
export const STAMINA_BURST_COST = 5;
export const STAMINA_DASH_COST = 0.5;

// Dash teleport distance — instant blink in the direction opposite the
// player's current facing. Walks the AABB in small steps along the path,
// stopping at the last open tile before a wall or canvas edge.
export const DASH_DISTANCE_PX = 96; // 3 tiles

// Burst rapid-fire. Multiplier applied as: effective_cooldown =
// ARROW_COOLDOWN_MS / (burstMultiplier * lowStaminaMultiplier). Decay is
// compounding with no floor — players who spam burst eventually drop below
// 1× and burst becomes a self-debuff (intentional self-limiting tuning).
export const BURST_DURATION_MS = 5_000;
export const BURST_BASE_MULTIPLIER = 2.0;
export const BURST_DECAY_FACTOR = 0.75;
export const BURST_RESET_BREAK_MS = 15_000;

// Wave scheduler defaults. Per-level/per-wave overrides live in levels.ts.
export const DEFAULT_INTER_WAVE_LULL_MS = 3000;
export const DEFAULT_SPAWN_INTERVAL_MS = 1500;

// --- Global wave scheduler (Step 1 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §5.4. The global scheduler replaces
// the per-level WaveScheduler binding with a single run-long timer: a
// run-start grace, then triplets (setup→add→test) separated by a short
// inter-wave lull within a triplet and a long random break between
// triplets. All timing flows from the gameLoop currentTime (never
// Date.now) — Invariant 8.

// Grace period after the player enters the first room before wave 1 fires.
export const RUN_START_GRACE_MS = 10_000;

// Random pause between triplets, rolled uniformly in [min, max] each time a
// triplet's third (test) wave finishes emitting.
export const TRIPLET_BREAK_MIN_MS = 15_000;
export const TRIPLET_BREAK_MAX_MS = 60_000;

// Soft cap on per-wave enemy count. Soft: when the last group drawn pushes
// the running total over the cap, the whole group still spawns (overshoot).
export const WAVE_ENEMYCOUNT_CAP = 25;

// Global wave number at which bears unlock in the spawn pool. Waves 1–6 are
// snake+panther only; waves 7+ (triplet 3 onward) add bears.
export const TYPE_UNLOCK_BEAR_WAVE = 7;

// Feature flag: route wave-driven arenas through the new GlobalWaveScheduler
// instead of the per-level WaveScheduler. Default OFF so current behavior is
// unchanged. Step 3 of the refactor removes the flag and the per-level path.
export const USE_GLOBAL_WAVE_SCHEDULER = false;

// --- Per-enemy AABB sizing (Step 2 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §5.7.
//
// DUAL REAL-WORLD SCALE (intentional — two independent ft↔px mappings):
//   • HEIGHT-based (FEET_PER_TILE, above): anchors WORLD DISTANCES. One tile
//     = 5.5 ft (adult archer height); the map spans MAP_*_FEET.
//   • WIDTH-based (this block): anchors ENEMY HITBOX WIDTHS. The player reads
//     as 1.35 ft wide = PLAYER_SIZE px, giving PX_PER_FT_WIDTH ≈ 23.7 px/ft.
// Keep them separate: collapsing the two would distort either hitboxes or
// world distances.
export const PLAYER_WIDTH_FT = 1.35; // anchor for AABB width sizing
export const PX_PER_FT_WIDTH = PLAYER_SIZE / PLAYER_WIDTH_FT; // ≈ 23.7 px/ft

// Per-type collision AABB extent (px). The 32 px tile/cell stays the
// positioning + rendering unit (an enemy's centre is always position +
// TILE_SIZE/2), so LOS/targeting/contact math is unchanged; these sizes are
// the *centred* box used only for wall and enemy-vs-enemy collision.
//   bear    — exceeds a tile, so it can't fit a 1-tile corridor
//   panther — fits a 1-tile corridor
//   gibbon  — two fit side-by-side in a 1-tile corridor
//   snake   — thin 4 px footprint; ~8 pack linearly per tile, and snakes may
//             overlap each other (see Enemy.overlapsEnemy)
export const ENEMY_AABB_PX: Record<EnemyType, number> = {
  bear: 34, // 1.45 ft
  panther: 21, // 0.90 ft
  gibbon: 15, // 0.65 ft
  snake: 4, // 0.165 ft
};
