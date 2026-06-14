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
export const MAP_WIDTH_FEET = GRID_WIDTH * FEET_PER_TILE; // 159.5 ft
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
export const RUN_START_GRACE_MS = 2_000;

// Spawn grace for the opening the player just walked through on a room-to-room
// transition. A hard cut resumes the wave timer on the same frame the player
// lands, so without this a wave can drip into the entry band right on top of
// the arriving player — an unfair death (death-is-the-player's-mistake pillar).
// Rolled uniformly in [min, max] each transition; only the entry-edge band is
// held, so the room's other openings keep spawning.
export const ENTRY_BAND_GRACE_MIN_MS = 3000;
export const ENTRY_BAND_GRACE_MAX_MS = 5000;

// Exit-band spawn grace — the departure-side counterpart to the arrival-side
// entry-band grace (ENTRY_BAND_GRACE_*, above). When the player is approaching
// a room exit — within EXIT_APPROACH_RANGE_PX of an edge opening AND pressing
// outward toward it — that one opening's spawn band is held for
// EXIT_DEPART_GRACE_MS so a wave can't drip into the doorway in their face as
// they leave. Applied as a rolling per-frame clamp via delayBands (Math.max, so
// it never accumulates) and lapsing once they stop approaching. Like the entry
// grace it delays — never cancels — and is scoped to the single approached band,
// so the wave still arrives through the room's other openings: camping an exit
// gains nothing.
export const EXIT_APPROACH_RANGE_PX = 96; // 3 tiles from the edge arms approach
export const EXIT_DEPART_GRACE_MS = 1000; // small rolling hold while approaching

// --- Doorway contact-kill graces (owner-approved 2026-06-10) ---
// Two narrow fairness windows on the contact-kill check, in the same spirit as
// the spawn-band graces above: a hard cut (or a hunter materializing) gives the
// player zero rendered frames to react, and an invisible death breaks the
// "death is the player's mistake" pillar. These are NOT general i-frames (still
// banned per the los-contract skill): each is a short, positional, untunable-
// by-input window during which only the player-kill pass is held — auto-fire,
// movement, walls, and arrow hits all keep running.

// Player-side: suppress the contact-kill pass for this long after a room
// transition. The landing nudge (Game.clearLandingZone) only clears an exact
// same-tick overlap; a fast chaser parked just inside the door could otherwise
// kill ~2-3 frames after the cut.
export const ARRIVAL_KILL_GRACE_MS = 300;

// Re-arm gap for the player-side grace. A hard cut lands the player flush on
// the destination edge still inside the opening, so the return transition is
// available within a frame — an unconditional stamp would let doorway
// ping-pong chain 300 ms windows into sustained contact-kill immunity while
// auto-fire keeps farming (input-renewable i-frames, banned by the
// los-contract skill). doTransition therefore grants a fresh window only when
// the previous one was armed at least this long ago. Honest traversal always
// satisfies the gap (crossing a room at 150 px/s takes well over 2 s); only
// an immediate hop back through the same doorway goes ungraced — and those
// threats were already on screen.
export const ARRIVAL_GRACE_REARM_MS = 2000;

// Enemy-side: a cross-room hunter that crosses into the player's CURRENT room
// materializes at the entry opening mid-tick (parked-room enemies are never
// drawn), so without this it could kill on the very tick it first becomes
// visible. While the window runs the hunter cannot contact-kill (checkCollisions
// skips it); it draws as its normal sprite — the white materialize flash was
// removed 2026-06-13. Lowered 350 → 200 ms on 2026-06-13 (owner) so arriving
// hunters threaten sooner.
export const HUNTER_ARRIVAL_GRACE_MS = 200;

// Random pause between triplets, rolled uniformly in [min, max] each time a
// triplet's third (test) wave finishes emitting.
export const TRIPLET_BREAK_MIN_MS = 10_000;
export const TRIPLET_BREAK_MAX_MS = 30_000;

// Random lull between waves within a triplet (setup→add, add→test), rolled
// uniformly in [min, max] each time a non-test wave finishes emitting.
export const INTER_WAVE_LULL_MIN_MS = 2_000;
export const INTER_WAVE_LULL_MAX_MS = 6_000;

// Soft cap on per-wave enemy count. Soft: when the last group drawn pushes
// the running total over the cap, the whole group still spawns (overshoot).
export const WAVE_ENEMYCOUNT_CAP = 25;

// Global wave numbers at which the spawn pool widens (tiered by wave number):
//   waves 1–4  : 3-snake, 6-snake, 1-panther
//   waves 5–8  : + 2-panther, 1-panther+6-snake, 9-snake
//   waves 9+   : + 1-bear, 12-snake   (bears unlock here)
export const WAVE_POOL_MID_UNLOCK = 5;
export const WAVE_POOL_LATE_UNLOCK = 9;

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

// Player contact-kill hurtbox extent (px), centred inside the PLAYER_SIZE cell.
// The kill test (Game.checkCollisions) is a true AABB overlap of this box
// against the enemy's ENEMY_AABB_PX box, so the per-axis kill distance is
// (PLAYER_HURTBOX_PX + enemy) / 2: bear 25, panther 18.5, gibbon 15.5,
// snake 10. Owner-approved 2026-06-10, replacing the flat enemy-centre-
// within-16px rule (which ignored the per-type footprints entirely): 16 keeps
// the mid-roster at the old feel while the extremes diverge — the bear's bulk
// reaches farther, the snake's sliver demands near-touch. The small box is the
// standard one-hit-death fairness convention (deaths read as the player's
// mistake, pillar §3). Wall collision still uses the full PLAYER_SIZE cell and
// arrows still hit the full 32 px enemy cell — only the kill test changes.
export const PLAYER_HURTBOX_PX = 16;

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
// range — hiding doesn't work. Bumped 2 → 3 on 2026-06-13 so fast hunters
// (panther/bear) don't abandon the chase right as they're closing the gap —
// the owner wants pursuit to run the player down, not give up early.
export const HUNT_RANGE = 3;

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

// --- Boss-arena stub win trigger (input-agnostic walk-on) ---
// Until boss combat lands (roadmap §5.15), the run is won by walking into the
// corrupted growth rendered at the boss arena's center tile. Movement is the
// only verb, so the trigger works identically on keyboard, touch joystick,
// and any future gamepad — no input binding required. (The V key remains an
// undocumented desktop debug shortcut for fast testing.)
// Center = middle tile of the 29×17 playfield (col 14, row 8) → px (464, 272).
export const BOSS_GROWTH_CENTER: Vector2 = {
  x: Math.floor(GRID_WIDTH / 2) * TILE_SIZE + TILE_SIZE / 2,
  y: Math.floor(GRID_HEIGHT / 2) * TILE_SIZE + TILE_SIZE / 2,
};

// Trigger AABB extent (px), centred on BOSS_GROWTH_CENTER — the growth's
// glowing heart. Deliberately smaller than the rendered goo mass so victory
// reads as "stepped into the heart", not "brushed the fringe".
export const BOSS_GROWTH_TRIGGER_PX = 16;
