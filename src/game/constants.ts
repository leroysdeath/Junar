import type { EnemyType, Vector2 } from './types';

export const CANVAS_WIDTH = 928;
export const CANVAS_HEIGHT = 544;
export const TILE_SIZE = 32;
export const PLAYER_SIZE = 32;
export const GRID_WIDTH = 29;
export const GRID_HEIGHT = 17;

// Player spawn at the exact center of a 29×17 room (col 14 × 32, row 8 × 32).
// Used as the run-start spawn inside anchor 1 (roadmap §5.1). levels.ts keeps
// its own private copy for the legacy per-level spawn path.
export const CENTER_SPAWN: Vector2 = { x: 448, y: 256 };
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

// Spawn grace for the opening the player just walked through on a room-to-room
// transition. A hard cut resumes the wave timer on the same frame the player
// lands, so without this a wave can drip into the entry band right on top of
// the arriving player — an unfair death (death-is-the-player's-mistake pillar).
// Rolled uniformly in [min, max] each transition; only the entry-edge band is
// held, so the room's other openings keep spawning.
export const ENTRY_BAND_GRACE_MIN_MS = 3000;
export const ENTRY_BAND_GRACE_MAX_MS = 5000;

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

// --- Room grid (Step 3 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §4 (glossary), §5.1 (run structure).
// A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of rooms (493 total),
// regenerated each run. Each room is itself one 29×17-tile playfield (the
// GRID_WIDTH × GRID_HEIGHT above) — the room-grid dimensions equalling the
// tile-grid dimensions is a coincidence of the chosen numbers, not a
// dependency; keep them as separate names.
export const ROOM_GRID_COLS = 29;
export const ROOM_GRID_ROWS = 17;

// Hand-designed anchor rooms (the 10 existing levels). Anchor 1 is the run
// start; anchor 10 is the boss room. The rest of the grid is connectors.
export const ANCHOR_COUNT = 10;

// Poisson-disk spacing: a newly placed anchor must be at least this far (in
// Manhattan room-grid distance) from every already-placed anchor. Tunable
// 4–6 per roadmap §5.1.
export const MIN_ANCHOR_SPACING = 5;

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

// --- Hunt system (Step 4 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §5.11 (static aggro) and §5.12 (the
// 4-state Hunt machine). All Hunt timing flows from the gameLoop currentTime
// (never Date.now — Invariant 8).

// Delay between the player entering a room and its dormant sitters waking
// (dormant → activating → active). One second per §5.11.
export const STATIC_AGGRO_DELAY_MS = 1000;

// Hunt range, in Manhattan room-grid distance. A 'hunting' enemy keeps
// pursuing across rooms as long as its room is within this many rooms of the
// player's; once the player's room is MORE than HUNT_RANGE away the hunter
// de-aggros and settles back to a static (§5.12). Hunting is indefinite within
// range — hiding doesn't work.
export const HUNT_RANGE = 2;

// --- Static density (Steps 5+6 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §5.9 (static semantics) and §5.10 (the
// B+C density formula). On the player's FIRST entry to a connector room its
// statics are rolled from the template's `s`/`S` candidate tiles and locked for
// the run (no re-roll on revisit, no despawn — §5.13).
//
//   target_density = STATIC_BASE_DENSITY
//                  + max(0, BOSS_HALO_RADIUS - manhattan(room, bossRoom))  // B
//                  + floor(waveNum / WAVE_PER_C_INCREMENT)                 // C
//   actual_density = min(target_density, candidate_count)
//
// B (proximity) makes rooms denser the closer they sit to the boss; C
// (progress) makes the whole map denser as the run wears on. The boss arena
// itself has no candidates, so it never rolls statics.

// Baseline statics in a connector far from the boss, early in the run (B=C=0).
// NOTE — resolves a contradiction in roadmap §5.10: the prose there sets
// `base = template.candidate_count` AND clamps `actual = min(target,
// candidate_count)`, which collapses to "always spawn every candidate" (B and C
// become dead code) and erases the sparse-far / dense-near gradient the same
// section's table, the §5.10 narrative, and the Step 5+6 acceptance check all
// require. A small explicit baseline (with candidate_count kept only as the
// per-room cap) is the reading that satisfies those. Starting value; tune in
// playtest alongside BOSS_HALO_RADIUS / WAVE_PER_C_INCREMENT (roadmap §9).
export const STATIC_BASE_DENSITY = 1;

// Extra statics added within this many rooms of the boss (the "halo"): the
// B modifier is max(0, BOSS_HALO_RADIUS - boss_distance), so a room ON the boss
// (distance 0) would get +BOSS_HALO_RADIUS, tapering to 0 at the halo edge.
export const BOSS_HALO_RADIUS = 6;

// Run-progress cadence: +1 to target density per this many global waves
// (C modifier = floor(waveNum / WAVE_PER_C_INCREMENT)). ~+1 static per 2
// triplets.
export const WAVE_PER_C_INCREMENT = 6;

// Weighting for a small ('s') static candidate: P(snake) vs P(gibbon). §5.9
// specifies "snake heavier, gibbon lighter" without a ratio — this 80/20 split
// is a chosen starting value (tune in playtest). 'S' (any) candidates ignore
// this and roll snake/gibbon/panther uniformly instead.
export const STATIC_SMALL_SNAKE_WEIGHT = 0.8;
