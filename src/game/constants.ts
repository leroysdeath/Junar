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

// Enemy AI pathfinding repoll cadence: each enemy re-derives its pursuit
// target at most this often (Enemy.update), moving toward the cached target
// between repolls. Promoted from an inline literal in Enemy.ts.
export const ENEMY_PATHFIND_REPOLL_MS = 200;

// Stamina pool — playthrough-wide, no regen, persists across all levels in
// a run. Resets to STAMINA_MAX only on Game.restart().
export const STAMINA_MAX = 100;
export const STAMINA_LOW_THRESHOLD = 10;
export const STAMINA_LOW_PENALTY = 0.5; // multiplier on speed + arrow rate when low

export const STAMINA_PER_TILE_MOVED = 0.001; // per TILE_SIZE px traveled
export const STAMINA_PER_ARROW = 0.001;
export const STAMINA_BURST_COST = 5;
// Sprint costs the same energy per activation as burst (owner 2026-06-19).
export const STAMINA_SPRINT_COST = 5;

// Burst rapid-fire. Multiplier applied as: effective_cooldown =
// ARROW_COOLDOWN_MS / (burstMultiplier * lowStaminaMultiplier). Decay is
// compounding with no floor — players who spam burst eventually drop below
// 1× and burst becomes a self-debuff (intentional self-limiting tuning).
export const BURST_DURATION_MS = 5_000;
export const BURST_BASE_MULTIPLIER = 2.0;
export const BURST_DECAY_FACTOR = 0.75;
export const BURST_RESET_BREAK_MS = 15_000;

// Sprint — a timed movement-speed boost that mirrors the burst state machine
// (owner 2026-06-19, replacing the old dash teleport). Edge-triggered, it runs
// for SPRINT_DURATION_MS multiplying movement speed by SPRINT_BASE_MULTIPLIER,
// then follows the same decay-vs-reset rule as burst: re-activating within
// SPRINT_RESET_BREAK_MS multiplies the next multiplier by SPRINT_DECAY_FACTOR
// (compounding self-debuff, no floor), otherwise it resets to base. It composes
// with the low-energy penalty exactly like burst does for fire rate (effective
// speed = PLAYER_SPEED * sprint * lowEnergy). Duration / reset / decay / cost
// match burst; the speed multiplier is 1.5× (not burst's 2.0×) so a sprinting
// player just edges past the bear (1.45× player) while the panther (2.63×)
// still runs them down — chokepoints over foot-races (pillar §3). Kept as
// separate constants so sprint speed can be tuned independently of burst.
export const SPRINT_DURATION_MS = 5_000; // = BURST_DURATION_MS
export const SPRINT_BASE_MULTIPLIER = 1.5; // ×1.5 move speed (just beats the bear)
export const SPRINT_DECAY_FACTOR = 0.75; // = BURST_DECAY_FACTOR
export const SPRINT_RESET_BREAK_MS = 15_000; // = BURST_RESET_BREAK_MS

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
// A run is a ROOM_GRID_COLS × ROOM_GRID_ROWS grid of rooms, regenerated each
// run. Each room is itself one 29×17-tile playfield (the GRID_WIDTH ×
// GRID_HEIGHT above) — the room grid and the tile grid are independent
// dimensions; keep them as separate names.
//
// DEMO GRID (owner 2026-06-21): 17×10 (170 cells) for the itch.io demo — a
// shorter run than the full map while still hosting all REQUIRED_ROOM_COUNT
// structured rooms. The generator is dimension-agnostic; the full map is 29×17
// (493 cells). To restore it, set these back to 29 / 17 and MIN_ANCHOR_SPACING
// (below) back to 5. NOTE: shrinking the grid crowds the structured rooms, so a
// single placement can leave a non-reciprocating opening ("fake lane"); the
// generator re-seeds until a fake-lane-free map lands (see generateRunMap /
// mapHasZeroFakeLanes), keeping every shipped map clean at any supported size.
export const ROOM_GRID_COLS = 17; // demo grid; 29 for the full map
export const ROOM_GRID_ROWS = 10; // demo grid; 17 for the full map

// Required rooms placed every run: the start L-bend, the boss arena (one of four
// versions), MINIBOSS_COUNT mini-boss arenas, MANGO_RUN_CAP mango dead-ends, and
// the village (owner 2026-06-21) — REQUIRED_ROOM_COUNT (= 2 + 4 + 5 + 1 = 12)
// total, see RoomGrid.ts. The village's four orthogonal neighbours are force-
// placed "arrow" rooms pointing inward (not counted here). The hand-authored
// anchor-1/-5/-9 layouts are demoted to the connector pool; the boss and the
// village are the required hand-authored rooms. The rest of the grid is
// connectors.

// Mini-boss rooms (owner 2026-06-19): wide-open arenas. Three are empty (no
// effect yet); one spawns the enlarged panther mini-boss. They connect via
// authored openings like the boss arena.
export const MINIBOSS_COUNT = 4;

// Poisson-disk spacing: a newly placed required room must be at least this far
// (in Manhattan room-grid distance) from every already-placed required room.
// 5 on the full 29×17 map (roadmap §5.1, tunable 4–6); 3 on the 17×10 demo
// grid, whose smaller inner interior can't hold the required rooms at 5 (the
// placer would silently relax toward 1). Use 5 for the full map.
export const MIN_ANCHOR_SPACING = 3; // demo grid; 5 for the full 29×17 map

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

// Per-type *visual* sprite size (px): the square box each beast sprite is fitted
// into for DRAWING, fully decoupled from the collision/kill box (ENEMY_AABB_PX).
// VS's forgiving-swarm convention — the visible body may be ≥ its hitbox, never
// smaller — so an apex threat reads at threat-appropriate size while the kill test
// stays the small, fair box (deaths read as the player's mistake, pillar §3).
// Sized to real-world body proportions (~19 px per metre at FEET_PER_TILE 5.5):
// sloth bear bulkiest, leopard ~1.8× the gibbon (real leopard:gibbon body ratio),
// the small-bodied hoolock gibbon + thin rat snake held at the readability floor.
// Owner decision 2026-06-19 (panther/bear ↑, snake/gibbon realistic). RENDER-ONLY
// (Renderer.drawBeast) — collision always uses ENEMY_AABB_PX via Enemy.getAABB.
export const ENEMY_VISUAL_PX: Record<EnemyType, number> = {
  bear: 39, // ↑ from 34 — apex bulk (real body 1.4–1.9 m)
  panther: 29, // ↑ from 21 — ~1.8× the gibbon (real leopard proportion)
  gibbon: 16, // realistic small primate (real body 0.6–0.9 m)
  snake: 16, // thin rat snake; abstracted to the readability floor
};

// --- Hunt system (Step 4 of the traversable-maps refactor) ---
// See docs/ROADMAP-traversable-maps.md §5.11 (static aggro) and §5.12 (the
// 4-state Hunt machine). All Hunt timing flows from the gameLoop currentTime
// (never Date.now — Invariant 8).

// Delay between the player entering a room and its dormant sitters waking
// (dormant → activating → active).
export const STATIC_AGGRO_DELAY_MS = 200;

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
// NOTE: superseded by BOSS_STUMP_TRIGGER_PX below — the four-version boss arenas
// (owner 2026-06-20) win by touching a SOLID 3×3 stump (RunMap.bossStumpCenter),
// not by walking onto a floor heart. BOSS_GROWTH_CENTER/TRIGGER are retained as
// the canonical grid centre for any other use.
export const BOSS_GROWTH_TRIGGER_PX = 16;

// Win-trigger AABB extent (px) for the boss version's solid 3×3 stump. The stump
// is impassable walls, so the player can never reach its centre — the trigger box
// is sized so reach = (PLAYER_SIZE + this)/2 = 80 px, extending ONE cell past
// each 3-tile (96 px) face. Walking up against any stump edge wins the run
// (Game.isTouchingGrowthHeart). 4 × TILE_SIZE.
export const BOSS_STUMP_TRIGGER_PX = 4 * TILE_SIZE;

// --- Mango collectible (owner 2026-06-19) ---
// A static pickup placed at the centre of dead-end ("teardrop") chambers.
// Walking over it (positional overlap, like the boss-growth heart) grants
// MANGO_ENERGY_GAIN energy — allowed to OVERCAP past STAMINA_MAX
// (Stamina.addEnergy). Exactly MANGO_RUN_CAP mangos roll per run, one per
// dead-end room entered, until the cap is hit.
export const MANGO_ENERGY_GAIN = 5;
export const MANGO_RUN_CAP = 5;
// Pickup overlap extent (px), centred on the mango's cell. Combined with the
// player's full 32 px cell (PLAYER_SIZE, NOT the 16 px hurtbox) this gives
// reach = (PLAYER_SIZE + MANGO_TRIGGER_PX)/2 = 24 px per axis — identical to
// the growth-heart trigger (Game.isTouchingGrowthHeart).
export const MANGO_TRIGGER_PX = 16;
// Draw size (px) the 32 px mango sprite is fitted into, centred in its tile —
// decoupled from the trigger box, like ENEMY_VISUAL_PX vs ENEMY_AABB_PX.
export const MANGO_VISUAL_PX = 24;

// The chamber-centre tile (top-left world px) where a mango sits in each of the
// four dead-end ("teardrop") rotations. Keyed by RoomTemplate id; a room whose
// templateId isn't here never spawns a mango. Authored to match the floor
// centre of each chamber in RoomTemplates.ts (validated: each is open floor).
export const MANGO_TILE_BY_TEMPLATE: Record<string, Vector2> = {
  't-deadend-n': { x: 14 * TILE_SIZE, y: 8 * TILE_SIZE },
  't-deadend-s': { x: 14 * TILE_SIZE, y: 7 * TILE_SIZE },
  't-deadend-e': { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE },
  't-deadend-w': { x: 20 * TILE_SIZE, y: 8 * TILE_SIZE },
};

// --- Enlarged panther mini-boss (owner 2026-06-19) ---
// A single arena-bound panther variant (NOT a new EnemyType — an `isBoss` flag +
// per-instance overrides on Enemy). It is faster than arrows, tanky, large, and
// moves with a bespoke stalk→lunge→retreat AI (Game.updateBossPanther) that
// weaves to dodge auto-fire and reactively jukes incoming arrows. Speed is the
// one stat above the normal panther's 395; the rest are size/HP/AI.
export const BOSS_PANTHER_SPEED = 420; // px/s — just above ARROW_SPEED (400)
export const BOSS_PANTHER_HP = 12; // arrow hits to kill (many miss to the dodge)
export const BOSS_PANTHER_AABB_PX = 38; // enlarged kill/collision box (vs 21)
export const BOSS_PANTHER_VISUAL_PX = 52; // ~1.8× the 29 px panther sprite

// Stalk/lunge/retreat tuning. Distances in px (player↔boss centre); times in ms
// (gameLoop currentTime, never Date.now — Invariant 8).
export const BOSS_STANDOFF_PX = 300; // hold distance — inside the 450 px fire range
export const BOSS_STANDOFF_BAND_PX = 40; // hysteresis around the ring (no jitter)
export const BOSS_LUNGE_TRIGGER_PX = 340; // stalk→lunge only when this close
export const BOSS_LUNGE_END_PX = 60; // lunge→retreat once this close (overshoot)
export const BOSS_STALK_MIN_MS = 1500; // min time stalking before another lunge
export const BOSS_LUNGE_MAX_MS = 700; // hard cap on a committed lunge
export const BOSS_RETREAT_MAX_MS = 1200; // hard cap on retreat (anti wall-stuck)
export const BOSS_LUNGE_SPEED_MULT = 1.5; // lunge dash speed = SPEED × this
// Never let the boss drift past this distance from the player — beyond the
// 450 px auto-fire range it would be unshootable AND (contact-only) unable to
// attack, a stalemate. Caps the outward (retreat/standoff) component.
export const BOSS_LEASH_PX = 420;

// Weave (constant lateral oscillation) + reactive juke (sidestep an arrow about
// to connect). Weave amp/juke speed are fractions/multiples of the boss speed.
export const BOSS_WEAVE_AMP = 0.7; // tangential weave magnitude (× speed)
export const BOSS_WEAVE_PERIOD_MS = 900; // weave oscillation period
export const BOSS_JUKE_LOOKAHEAD_MS = 250; // react to arrows arriving within this
export const BOSS_JUKE_RADIUS_PX = 8; // extra "will hit" margin past the hitbox
export const BOSS_JUKE_SPEED_MULT = 2.0; // juke lateral speed = SPEED × this

// --- Panther ally (owner 2026-06-20) ---
// Defeating the enlarged panther mini-boss converts it into an ALLY on the
// player's side. It is NOT a new EnemyType — a `panther` Enemy with an `isAlly`
// flag (Enemy.configureAsAlly), kept at the normal panther's stats (395 px/s,
// 21 px AABB, 29 px visual) and driven by a bespoke Game.updateAllyPanther. It
// hunts the nearest enemy near the player and escorts when none is in range,
// attacking with a committed "first-strike" lunge: it dashes in, kills its
// locked target on contact (invulnerable to THAT target only mid-lunge), then
// jumps back and cools down (fully vulnerable the whole time). One non-immune
// enemy contact kills it — and it is deliberately NOT wired into the
// family-death = game-over rule (an ally beast is not family; the run continues).
// Approach/escort reuse the shared BFS pursuit (Enemy.update); the lunge and
// jump-back are committed dashes via Enemy.tryMove, mirroring the boss. Timing is
// gameLoop currentTime (Invariant 8). One ally per run (one panther mini-boss).

// Engage only enemies within this distance of the PLAYER (the leash): farther
// foes are ignored so the ally stays a bodyguard near the player rather than
// running off across the room. With no enemy in leash, the ally escorts.
export const ALLY_LEASH_PX = 420;
// Escort: while leashing to the player with no target in range, hold position
// unless the ally has drifted farther than this from the player.
export const ALLY_FOLLOW_DIST_PX = 64;
// Stalk→strike: commit the lunge once within this centre-to-centre distance of
// the target. Larger than the contact distance so the ally commits (and gains
// its target-immunity) a beat BEFORE the bodies touch.
export const ALLY_LUNGE_TRIGGER_PX = 130;
// Lunge dash speed = speed × this (a fast committed strike); hard time cap so a
// whiffed lunge can't run forever.
export const ALLY_LUNGE_SPEED_MULT = 1.6;
export const ALLY_LUNGE_MAX_MS = 600;
// Jump-back: a short retreat dash opposite the lunge, then a recovery cooldown.
// The ally is fully vulnerable through both (the swarm-punish window).
export const ALLY_JUMPBACK_SPEED_MULT = 1.3;
export const ALLY_JUMPBACK_MS = 220;
export const ALLY_COOLDOWN_MS = 700;
